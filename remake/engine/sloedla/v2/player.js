// The player of a v2 song (format.js) in Slóeðla's song game. It has the old conductor's interface (conductor.js), so the game,
// the lab and everything around them stay as they are, but the song is played the other way round: whole, from its first beat.
//
//   - Every layer plays from the first beat: the stems as buffer sources started together on the audio clock, the composed parts
//     scheduled a little ahead (LOOKAHEAD) through the song's own instruments (sounds.play). Nothing is shared between songs.
//   - A dinosaur's layers go through her chain (a low-pass and a gate). A hit plays her note louder, the note itself: over a stem,
//     a copy of the same place of the same file, sample-aligned (about +6 dB), with a brighter edge; in a composed part, the note
//     struck hard (the charted notes of a part sound only when tapped). A miss closes her chain to a muffled whisper until her next
//     hit, which opens it at once (a hole in the song); three in a row bring her back as a ghost for a bar, to show the way.
//   - Star layers (tier, the song's own) come in with a run of hits (setTier). The song is in sections: a little before one
//     begins, the last is judged, and it comes big (brighter, louder, the parts' big lines, a lift up a key), calm (muffled, the
//     calm lines, fewer notes) or as written, as the old conductor does it.
//   - With two lanes Kambeðla has none: her layers play on and never close.

import { ROLES, timelineOf } from './format.js';
import { partNotes, pitchOfKey } from './parts.js';
import { expectedOf, sectionChart } from './chart.js';

const LOOKAHEAD = 0.15; // s of song scheduled ahead of the audio clock
const TICK = 25; // ms between scheduling passes
const BIG = 0.75; // the share of a section's notes played that makes the next one big
const CALM = 0.45; // below this share the next one is calm
const DECIDE_AFTER = 3; // notes of a section judged before its share counts (else the song's share so far counts)
const SNAP_EARLY = 0.15; // s: a tap this much early sounds on its note's beat
const OPEN_TAU = 0.007; // s: how fast a chain opens on a hit (about 21 ms to 95 %)
const CLOSE_TAU = 0.015; // s: and closes on a miss
const OUT_LEVEL = 0.18; // a dinosaur who missed is a whisper of herself ...
const OUT_FILTER = 600; // ... behind a low-pass at this many Hz
const GHOST_LEVEL = 0.38; // after GHOST_AFTER misses in a row she plays along this loud for a bar
const GHOST_FILTER = 2400;
const GHOST_AFTER = 3;
const ACCENT_GAIN = 1; // the copy of a hit stem note, times the layer's gain: the note doubled, about +6 dB
const ACCENT_ATTACK = 0.002; // s
const ACCENT_MAX = 0.25; // s: the copy is never longer
// The copy's edge: the same copy through a high-pass, much louder for its first moment, so the hit is heard on a tablet's small
// speaker too (a bass note's or a kick's own body is under what it plays: measured 2026-10-30, the copy alone lifted the tablet
// band by 0.2 dB)
const EDGE_HZ = 300;
const EDGE_GAIN = 3; // times the layer's gain at the start ...
const EDGE_TAU = 0.04; // ... falling with this time constant (s)
const STRAY_GAIN = 0.25; // a tap at no note: a bit of her stem at -12 dB ...
const STRAY_LENGTH = 0.12; // ... this long
const OPEN = 18000;

/**
 * The player for v2 `song` on `context` and `clock` (song-clock.js, started by start()). `out` is where the music goes (the page's
 * music bus), `sounds` the game's sounds made with the song's instruments (sounds.js: play, oops). Stem layers bring their decoded
 * buffer as `layer.buffer`. `level` is 'barn' or 'fullordinn', `roles` the dinosaurs with lanes, `fall` how long a note falls (s).
 */
export function createPlayer({ context, song, clock, sounds, out, level = 'barn', roles = ROLES, fall = 2.3 }) {
  const { beat, bar, sections, length } = timelineOf(song);
  const decideAhead = fall + 0.7;
  const offset = song.tempo.offset ?? 0;
  const byId = Object.fromEntries(song.layers.map(layer => [layer.id, layer]));

  const filter = (type, frequency, extra = {}) => {
    const node = context.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    if (extra.Q !== undefined) node.Q.value = extra.Q;
    if (extra.gain !== undefined) node.gain.value = extra.gain;
    return node;
  };
  const gain = (value, to) => {
    const node = context.createGain();
    node.gain.value = value;
    if (to) node.connect(to);
    return node;
  };

  // the song bus: everything but the notes the child taps; a calm section muffles it, a big one brightens it
  const bus = gain(1, out);
  const shelf = filter('highshelf', 4000, { gain: 0 });
  shelf.connect(bus);
  const mood = filter('lowpass', OPEN, { Q: 0.7 });
  mood.connect(shelf);
  const tiers = [1, 2, 3].map(() => gain(0, mood));
  // each dinosaur's chain: her low-pass, then her gate
  const chains = {};
  for (const role of ROLES) {
    const gate = gain(1, mood);
    const low = filter('lowpass', OPEN, { Q: 0.8 });
    low.connect(gate);
    chains[role] = { input: low, filter: low, gate, open: true, misses: 0 };
  }
  // the notes the child taps, past her chain: a composed note struck hard, or a stem's copy through a brighter edge
  const hits = {};
  const edges = {};
  for (const role of ROLES) {
    hits[role] = gain(1, out);
    edges[role] = filter('highpass', EDGE_HZ, { Q: 0.7 });
    edges[role].connect(hits[role]);
  }
  const loose = gain(0.5, out); // a miss's bloop and a tap at no note, outside her chain
  // each layer's own level, into her chain, a tier, or the song bus
  const layers = {};
  for (const layer of song.layers) {
    const into = layer.tier ? tiers[layer.tier - 1] : layer.owner ? chains[layer.owner].input : mood;
    layers[layer.id] = gain(layer.gain ?? 1, into);
  }

  const sources = new Set(); // every buffer source playing: the stems, the hits' copies, the strays
  const play = (buffer, { at, from, to, length: seconds }) => {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(to);
    source.start(at, from);
    if (seconds !== undefined) source.stop(at + seconds);
    source.onended = () => sources.delete(source);
    sources.add(source);
    return source;
  };

  const decided = [];
  const chart = []; // every note that falls, in time order (the game's judge reads it as it grows)
  const queue = []; // composed notes not yet scheduled: { t, layer, note }
  let transpose = 0;
  let tier = 0;
  let timer = null;
  let started = false;
  let zero = 0; // context time of the song's first beat
  const totals = { hits: 0, misses: 0 };
  const expected = expectedOf(song, { level, roles });

  const shareOf = stats => {
    const judged = stats.hits + stats.misses;
    return judged > 0 ? stats.hits / judged : 1;
  };

  function decide(k) {
    const section = sections[k];
    let variant = 'normal';
    if (k > 0 && !section.fixed) {
      const last = decided[k - 1];
      const share = shareOf(last.hits + last.misses >= DECIDE_AFTER ? last : totals);
      variant = share >= BIG ? 'big' : share < CALM ? 'calm' : 'normal';
    }
    if (variant === 'big' && section.lift) transpose += section.lift;
    const notes = sectionChart(song, k, variant, { level, roles, transpose });
    decided[k] = { index: k, name: section.name, variant, transpose, start: section.start, end: section.end, hits: 0, misses: 0 };
    const charted = new Set();
    for (const note of notes) {
      if (note.part) charted.add(`${note.layer}:${note.index}`);
      chart.push(note);
    }
    for (const layer of song.layers) {
      if (!layer.part) continue;
      partNotes(song, layer, k, variant, transpose).forEach((note, i) => {
        if (!charted.has(`${layer.id}:${i}`)) queue.push({ t: note.t, layer, note });
      });
    }
    queue.sort((x, y) => x.t - y.t);
    const at = Math.max(context.currentTime, clock.contextTimeOf(section.start));
    mood.frequency.setTargetAtTime(variant === 'calm' ? 1400 : OPEN, at, 0.15);
    shelf.gain.setTargetAtTime(variant === 'big' ? 3 : 0, at, 0.15);
    bus.gain.setTargetAtTime(variant === 'big' ? 1.12 : variant === 'calm' ? 0.85 : 1, at, 0.2);
  }

  function pump() {
    if (!started || context.state !== 'running') return;
    const now = context.currentTime;
    const k = decided.length;
    if (k < sections.length && now - zero >= sections[k].start - decideAhead) decide(k);
    while (queue.length) {
      const { t, layer, note } = queue[0];
      const at = clock.contextTimeOf(t);
      if (at > now + LOOKAHEAD) break;
      queue.shift();
      if (at < now - 0.05) continue; // too late (a stalled timer): a hole, not a heap
      sounds.play(layer.part.instrument, { freq: note.freq, step: note.step, at: Math.max(at, now), dur: note.dur, vel: note.vel, into: layers[layer.id] });
    }
  }

  /** Moves `role`'s chain to `level` behind a low-pass at `cutoff`, from context time `at`, with time constant `tau`. */
  function setChain(role, to, cutoff, at, tau) {
    const chain = chains[role];
    for (const [param, value] of [[chain.gate.gain, to], [chain.filter.frequency, cutoff]]) {
      param.cancelScheduledValues(at);
      param.setTargetAtTime(value, at, tau);
    }
  }

  function open(role, at) {
    const chain = chains[role];
    chain.misses = 0;
    if (chain.open) return false;
    chain.open = true;
    setChain(role, 1, OPEN, at, OPEN_TAU);
    return true;
  }

  function close(role) {
    const chain = chains[role];
    const now = context.currentTime;
    chain.misses++;
    chain.open = false;
    if (chain.misses === GHOST_AFTER) {
      setChain(role, GHOST_LEVEL, GHOST_FILTER, now, CLOSE_TAU);
      setChain(role, OUT_LEVEL, OUT_FILTER, now + bar, 0.2);
    } else setChain(role, OUT_LEVEL, OUT_FILTER, now, CLOSE_TAU);
  }

  /**
   * A hit stem note: the same place of the same file again, from `when` to the note's end (at most ACCENT_MAX), the note doubled
   * into her hit bus and, for its first moment, an edge of it through a high-pass.
   */
  function accent(layer, note, at, when) {
    const end = at + note.dur;
    if (!layer.buffer || when >= end - 0.005) return;
    const seconds = Math.min(end - when, ACCENT_MAX);
    const level = layer.gain ?? 1;
    const body = gain(0, hits[note.role]);
    body.gain.setValueAtTime(0, when);
    body.gain.linearRampToValueAtTime(ACCENT_GAIN * level, when + ACCENT_ATTACK);
    body.gain.setTargetAtTime(0, when + ACCENT_ATTACK, seconds / 3);
    const edge = gain(0, edges[note.role]);
    edge.gain.setValueAtTime(0, when);
    edge.gain.linearRampToValueAtTime(EDGE_GAIN * level, when + ACCENT_ATTACK);
    edge.gain.setTargetAtTime(0, when + ACCENT_ATTACK, EDGE_TAU);
    const source = play(layer.buffer, { at: when, from: offset + note.t + (when - at), to: body, length: seconds });
    source.connect(edge);
  }

  return {
    start(lead = 0.4) {
      clock.start(null, lead);
      started = true;
      zero = clock.contextTimeOf(0);
      const now = context.currentTime;
      const fileStart = zero - offset;
      for (const layer of song.layers) {
        if (!layer.stem) continue;
        if (!layer.buffer) {
          console.warn(`Slóeðla: ${song.id} plays without ${layer.stem} (it could not be loaded)`);
          continue;
        }
        if (fileStart >= now) play(layer.buffer, { at: fileStart, from: 0, to: layers[layer.id] });
        else play(layer.buffer, { at: now, from: now - fileStart, to: layers[layer.id] });
      }
      decide(0);
      if (sections.length > 1 && sections[1].start - decideAhead <= 0) decide(1);
      pump();
      timer = setInterval(pump, TICK);
    },
    stop() {
      clearInterval(timer);
      timer = null;
      started = false;
      queue.length = 0;
      const now = context.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(0, now, 0.015);
      for (const source of sources) try { source.stop(now + 0.3); } catch { /* not started */ }
      sources.clear();
    },
    pump,
    /**
     * The child hit chart note `note` (her tap `offset` s from it, negative early): her chain opens and her note sounds louder (on
     * its beat if the tap was a little early, else now). Returns whether she came back in (her chain had been closed).
     */
    hit(note, offset = 0) {
      const entry = decided[note.section];
      if (entry) entry.hits++;
      totals.hits++;
      const now = context.currentTime;
      const at = clock.contextTimeOf(note.t);
      const when = at > now && offset >= -SNAP_EARLY ? at : now;
      const joined = open(note.role, now);
      const layer = byId[note.layer];
      if (layer?.stem) accent(layer, note, at, when);
      else if (layer?.part) sounds.play(layer.part.instrument, { freq: note.freq, step: note.step, at: when + 0.004, dur: note.dur, vel: note.vel, into: hits[note.role], tapped: true });
      return joined;
    },
    /** The child missed chart note `note`: a soft bloop, and her layers fade to a whisper until she is hit again. */
    miss(note) {
      const entry = decided[note.section];
      if (entry) entry.misses++;
      totals.misses++;
      if (!roles.includes(note.role)) return;
      sounds.oops(note.role, { freq: note.freq, into: loose });
      close(note.role);
    },
    /** A tap with no note: a soft bit of her stem where the song is, or a soft note of her instrument on the key's root. */
    stray(role) {
      const layer = song.layers.find(l => l.owner === role && (l.part || l.buffer));
      if (!layer || !started) return;
      const now = context.currentTime;
      if (layer.part) {
        sounds.play(layer.part.instrument, { freq: pitchOfKey(song.key, transpose)(0, layer.part.octave ?? 0), step: 0, at: now, soft: true, into: loose });
        return;
      }
      const from = offset + (now - zero);
      if (from < 0 || from + STRAY_LENGTH > layer.buffer.duration) return;
      const envelope = gain(0, loose);
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(STRAY_GAIN * (layer.gain ?? 1), now + ACCENT_ATTACK);
      envelope.gain.setTargetAtTime(0, now + ACCENT_ATTACK, STRAY_LENGTH / 3);
      play(layer.buffer, { at: now, from, to: envelope, length: STRAY_LENGTH });
    },
    setTier(next) {
      if (next === tier) return;
      tier = next;
      const now = context.currentTime;
      tiers.forEach((node, i) => node.gain.setTargetAtTime(tier > i ? 1 : 0, now, tier > i ? 0.15 : 0.6));
    },
    chart,
    expected,
    length,
    beat,
    bpm: song.tempo.bpm,
    sectionAt(time) {
      for (let i = decided.length - 1; i >= 0; i--) if (decided[i] && time >= decided[i].start) return { ...decided[i] };
      return decided[0] ? { ...decided[0] } : null;
    },
    isOpen: role => chains[role].open,
    hits,
    totals,
    // for a look from outside (the tests, the meters)
    chains,
    tiers,
    layers,
  };
}
