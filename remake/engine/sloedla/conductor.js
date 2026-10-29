// The conductor of Slóeðla's song game: it plays a song written as data (song.js) on the audio clock and lets the child's play
// change it, as Guitar Hero and Amplitude do. The research behind the choices: qa/rannsokn/reports/Hvernig tónlistarleikir eru
// gerðir.md (the worktree's qa/, outside git).
//
//   - The dinosaurs own most of the music. Each has a chain of her own (a low-pass and a level) that all her sound goes through:
//     her tune on her instrument, her share of the band (song.js BAND_GATES: the drum kit is Þórseðla's, the bass and riff
//     Kambeðla's, the bells and choir Slóeðla's) and, over a recorded backing, her stem. Only the skeleton is nobody's: a soft
//     pulse on every beat and the pad. So the song starts bare, and each dinosaur comes in when the child hits her first note.
//   - The notes the child taps are not scheduled ahead: each sounds when it is tapped (an early tap waits for its beat, up to
//     SNAP_EARLY), so a missed note is a hole in the tune. A tapped note is struck harder than the notes that play by themselves
//     (voices.js VOICE_LEVELS: a sharp start, and overtones a tablet's speaker can play), goes past her chain, and the rest of the song
//     dips under it for a moment (the bed, DUCK), so it is the loudest thing heard as she taps it. A miss also plays a soft "bloop" in her instrument, and her chain closes
//     to a muffled whisper (OUT_LEVEL through OUT_FILTER) until her next hit, which opens it at once. Three misses in a row in one
//     lane bring her part back as a ghost for a bar (GHOST_LEVEL), to show what to play. The notes between the child's (the rest of
//     her phrase) are scheduled ahead through her chain, so on a run they are exactly on the beat.
//   - A run of hits brings in the song's star layers (parts with `tier`); the first comes after three hits (Fever, as Patapon's
//     remake has it), and a miss lets them fade.
//   - The song is in sections. A little before each one begins (its notes must have time to fall), the last one is judged: played
//     well, the next comes big (every layer, a crash, a riser into it, and the last chorus up a key: `lift`); played badly, calm
//     (fewer notes, the band muffled, simpler parts); otherwise as written.
//
// The band and the phrases are scheduled a little ahead of the audio clock (LOOKAHEAD) by a timer; everything that answers a tap
// (a note, a chain opening or closing, a bloop) goes straight onto the audio clock, so nothing waits for the queue.

import { chartOf, compileSection, timeline } from './song.js';

const LOOKAHEAD = 0.15; // s of song scheduled ahead of the audio clock
const TICK = 25; // ms between scheduling passes
const BIG = 0.75; // the share of a section's notes played that makes the next one big
const CALM = 0.45; // below this share the next one is calm
const DECIDE_AFTER = 3; // notes of a section judged before its share counts (else the song's share so far counts)
const SNAP_EARLY = 0.15; // s: a tap this much early sounds on its note's beat; earlier ones sound at once
const OPEN_TAU = 0.007; // s: how fast a chain opens on a hit (about 21 ms to 95 %)
const CLOSE_TAU = 0.015; // s: and closes on a miss (about 45 ms)
const OUT_LEVEL = 0.18; // a dinosaur who is out is a whisper of herself ...
const OUT_FILTER = 520; // ... behind a low-pass at this many Hz
const GHOST_LEVEL = 0.38; // after GHOST_AFTER misses in a row she plays along this loud for a bar, to show the way
const GHOST_AFTER = 3;
const DUCK = 0.7; // the rest of the song dips to this (about -3 dB) under each note the child taps ...
const DUCK_GROWN = 0.82; // ... less on the grown-ups' level, where the notes come thick
const DUCK_IN = 0.004; // s: how fast it dips
const DUCK_HOLD = 0.05; // s: how long it stays down
const DUCK_OUT = 0.09; // s: how fast it comes back (about 0.3 s to 95 %)
const ROLES = ['a', 'b', 'c'];

/**
 * The conductor for `song` on `context` and `clock` (song-clock.js, started by start()). `out` is where the music goes (the page's
 * mix), `band` the band (band.js) and `sounds` the dinosaurs' instruments (sounds.js), both made for this context. `level` is
 * 'barn' or 'fullordinn', `roles` the parts that have lanes (a part without one is always in), `fall` how long a note falls (s).
 */
export function createConductor({ context, song, clock, band, sounds, out, level = 'barn', roles = ROLES, fall = 2.3 }) {
  const { beat, bar, sections, length } = timeline(song);
  const decideAhead = fall + 0.7;

  // the skeleton (nobody's) and the star layers go through the mood filter (a calm section muffles it)
  const mood = context.createBiquadFilter();
  mood.type = 'lowpass';
  mood.frequency.value = 18000;
  mood.Q.value = 0.7;
  // everything but the notes the child taps goes through the bed, which dips for a moment under each of them, as a dance track
  // ducks under its kick drum, so the note she taps is the loudest thing heard (and its start punches through)
  const bed = context.createGain();
  bed.connect(out);
  const duckTo = level === 'barn' ? DUCK : DUCK_GROWN;
  const bandBus = context.createGain();
  bandBus.gain.value = 0.85;
  mood.connect(bandBus);
  bandBus.connect(bed);
  const tiers = [1, 2, 3].map(() => {
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(mood);
    return gain;
  });
  // each dinosaur's chain: her low-pass, then her level
  const chains = {};
  for (const role of ROLES) {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.8;
    const level = context.createGain();
    filter.connect(level);
    level.connect(bed);
    const open = !roles.includes(role); // a part with no lane plays all along; the others start out
    filter.frequency.value = open ? 18000 : OUT_FILTER;
    level.gain.value = open ? 1 : OUT_LEVEL;
    chains[role] = { input: filter, filter, level, open, misses: 0 };
  }
  // the notes the child taps, each dinosaur's through a gain of its own, past her chain and the bed (her chain opens as she hits)
  const hits = {};
  for (const role of ROLES) {
    const gain = context.createGain();
    gain.connect(out);
    hits[role] = gain;
  }
  const loose = context.createGain(); // a tap that is not a hit: her instrument, softly, outside her chain
  loose.gain.value = 0.5;
  loose.connect(out);

  // a recorded backing (song.backing): one mix, or stems each owned by a dinosaur ({ buffer, gate, gain })
  const backingSources = [];

  const decided = [];
  const chart = []; // every note that falls, in time order (the game's judge reads it as it grows)
  const queue = [];
  let transpose = 0;
  let tier = 0;
  let timer = null;
  let started = false;
  const totals = { hits: 0, misses: 0 };

  const expected = sections.reduce((n, _, i) => n + chartOf(compileSection(song, i, 'normal'), { level, roles, beat }).length, 0);

  const shareOf = stats => {
    const judged = stats.hits + stats.misses;
    return judged > 0 ? stats.hits / judged : 1;
  };

  function decide(k) {
    const section = song.sections[sections[k].name];
    let variant = 'normal';
    if (k > 0 && !section.fixed) {
      const last = decided[k - 1];
      const share = shareOf(last.hits + last.misses >= DECIDE_AFTER ? last : totals);
      variant = share >= BIG ? 'big' : share < CALM ? 'calm' : 'normal';
    }
    if (variant === 'big' && section.lift) transpose += section.lift;
    const compiled = compileSection(song, k, variant, transpose);
    const notes = chartOf(compiled, { level, roles, beat, section: k });
    const entry = { variant, transpose, compiled, notes, hits: 0, misses: 0, start: sections[k].start, end: sections[k].end, name: sections[k].name };
    decided[k] = entry;
    for (const note of notes) {
      const part = compiled.parts[note.role];
      part[note.index].charted = true; // the child's notes sound only when tapped
      note.next = part[note.index + 1] ?? null;
      chart.push(note);
    }
    for (const event of compiled.band) queue.push({ ...event, kind: 'band' });
    for (const role of ROLES) for (const note of compiled.parts[role]) if (!note.charted) queue.push({ ...note, role, kind: 'part' });
    if (variant === 'big') {
      queue.push({ t: entry.start, kind: 'band', inst: 'crash', vel: 1.1, tier: 0, gate: null });
      queue.push({ t: entry.start - bar, kind: 'band', inst: 'riser', dur: bar, vel: 1, tier: 0, gate: null });
    }
    queue.sort((x, y) => x.t - y.t);
    const at = Math.max(context.currentTime, clock.contextTimeOf(entry.start));
    mood.frequency.setTargetAtTime(variant === 'calm' ? 1400 : 18000, at, 0.15);
    bandBus.gain.setTargetAtTime(variant === 'calm' ? 0.7 : variant === 'big' ? 0.95 : 0.85, at, 0.2);
    return entry;
  }

  function pump() {
    if (!started || context.state !== 'running') return;
    const now = context.currentTime;
    const songNow = now - clock.contextTimeOf(0);
    const k = decided.length;
    if (k < sections.length && songNow >= sections[k].start - decideAhead) decide(k);
    while (queue.length) {
      const event = queue[0];
      const at = clock.contextTimeOf(event.t);
      if (at > now + LOOKAHEAD) break;
      queue.shift();
      if (at < now - 0.05) continue;
      const when = Math.max(at, now);
      if (event.kind === 'band') {
        const into = event.tier ? tiers[event.tier - 1] : event.gate ? chains[event.gate].input : mood;
        band.play(event.inst, { at: when, freq: event.freq, notes: event.notes, dur: event.dur, vel: event.vel, into });
      } else {
        sounds.note(event.role, { freq: event.freq, at: when, dur: event.dur, vel: event.vel, into: chains[event.role].input });
      }
    }
  }

  /** Moves `role`'s chain to `level` behind a low-pass at `cutoff`, from context time `at`, with time constant `tau`. */
  function setChain(role, level, cutoff, at, tau) {
    const chain = chains[role];
    for (const [param, value] of [[chain.level.gain, level], [chain.filter.frequency, cutoff]]) {
      param.cancelScheduledValues(at);
      param.setTargetAtTime(value, at, tau);
    }
  }

  /** The bed dips under a tapped note that starts at context time `at`, and comes back. */
  function duck(at) {
    const gain = bed.gain;
    gain.cancelScheduledValues(at);
    gain.setTargetAtTime(duckTo, at, DUCK_IN);
    gain.setTargetAtTime(1, at + DUCK_HOLD, DUCK_OUT);
  }

  function open(role, at = context.currentTime) {
    const chain = chains[role];
    chain.misses = 0;
    if (chain.open) return false;
    chain.open = true;
    setChain(role, 1, 18000, at, OPEN_TAU);
    return true;
  }

  function close(role) {
    const chain = chains[role];
    const now = context.currentTime;
    chain.misses++;
    chain.open = false;
    if (chain.misses === GHOST_AFTER) {
      // three in a row: she plays along as a ghost for a bar, then is a whisper again
      setChain(role, GHOST_LEVEL, 2400, now, CLOSE_TAU);
      setChain(role, OUT_LEVEL, OUT_FILTER, now + bar, 0.2);
    } else setChain(role, OUT_LEVEL, OUT_FILTER, now, CLOSE_TAU);
  }

  return {
    start(lead = 0.4) {
      clock.start(null, lead);
      started = true;
      const zero = clock.contextTimeOf(0);
      const now = context.currentTime;
      const tracks = song.backing?.stems?.length ? song.backing.stems : song.backing?.buffer ? [{ buffer: song.backing.buffer }] : [];
      for (const track of tracks) {
        if (!track.buffer) continue;
        const source = context.createBufferSource();
        source.buffer = track.buffer;
        const gain = context.createGain();
        gain.gain.value = (song.backing.gain ?? 0.8) * (track.gain ?? 1);
        source.connect(gain);
        gain.connect(track.gate ? chains[track.gate].input : mood);
        const fileStart = zero - (song.backing.beatOffset ?? 0);
        if (fileStart >= now) source.start(fileStart);
        else source.start(now, now - fileStart);
        backingSources.push(source);
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
      for (const role of ROLES) setChain(role, 0, OUT_FILTER, now, 0.05);
      bandBus.gain.setTargetAtTime(0, now, 0.1);
      for (const source of backingSources) try { source.stop(now + 0.3); } catch { /* not started */ }
      backingSources.length = 0;
    },
    pump,
    /**
     * The child hit chart note `note` (her tap `offset` s from it, negative early): the note sounds (on its beat if the tap was
     * a little early, else now) and her chain opens. Returns whether she came back in (her chain had been closed).
     */
    hit(note, offset = 0) {
      const entry = decided[note.section];
      if (entry) entry.hits++;
      totals.hits++;
      const now = context.currentTime;
      const at = clock.contextTimeOf(note.t);
      const when = at > now && offset >= -SNAP_EARLY ? at : now;
      const joined = open(note.role, now);
      sounds.note(note.role, { freq: note.freq, at: when + 0.004, dur: note.dur, into: hits[note.role], tapped: true });
      duck(when + 0.004);
      return joined;
    },
    /** The child missed chart note `note`: a soft bloop, and her part fades to a whisper until she is hit again. */
    miss(note) {
      const entry = decided[note.section];
      if (entry) entry.misses++;
      totals.misses++;
      if (!roles.includes(note.role)) return;
      sounds.oops(note.role, { freq: note.freq, into: loose });
      close(note.role);
    },
    /** A tap with no note: her instrument, softly, on the key's root (it does not open her chain). */
    stray(role) {
      const freq = decided.at(-1)?.compiled.parts[role]?.[0]?.freq ?? 233;
      sounds.note(role, { freq, soft: true, into: loose });
    },
    setTier(next) {
      if (next === tier) return;
      tier = next;
      const now = context.currentTime;
      tiers.forEach((gain, i) => gain.gain.setTargetAtTime(tier > i ? 1 : 0, now, tier > i ? 0.15 : 0.6));
    },
    chart,
    expected,
    length,
    beat,
    bpm: song.bpm,
    sectionAt(time) {
      for (let i = decided.length - 1; i >= 0; i--) if (decided[i] && time >= decided[i].start) return { index: i, ...decided[i], compiled: undefined, notes: undefined };
      return decided[0] ? { index: 0, ...decided[0], compiled: undefined, notes: undefined } : null;
    },
    isOpen: role => chains[role].open,
    hits,
    totals,
  };
}
