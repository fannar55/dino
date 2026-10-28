// The conductor of Slóeðla's song game: it plays a song written as data (song.js) on the audio clock and lets the child's play
// change it, as Guitar Hero does:
//
//   - Each dinosaur's part goes through a gate of her own. While the child keeps hitting that dinosaur's notes the gate is open and
//     her whole part is heard, every note of it in time (scheduled ahead, so on a run it is exactly on the beat). A missed note
//     shuts it: her part drops out of the song until the child hits one of her notes again, which is played at once and opens the
//     gate for the rest of the phrase. A part with no lane (Kambeðla's, when two play) is always heard.
//   - A run of hits brings in the song's star layers (parts with `tier`), more of them the longer the run; a miss lets them fade.
//   - The song is in sections. A little before each one begins (the notes must have time to fall), the last one is judged: played
//     well, the next comes big (every layer, a crash, a riser into it, and the last chorus up a key: `lift`); played badly, it
//     comes calm (fewer notes, the band muffled, simpler parts); otherwise as written. The child is never told it got easier.
//
// The band and the parts are scheduled a little ahead of the audio clock (LOOKAHEAD) by a timer, so a slow frame never makes the
// music stumble; the chart (the notes that fall) grows a section at a time as each section is decided.

import { chartOf, compileSection, timeline } from './song.js';

const LOOKAHEAD = 0.3; // s of song scheduled ahead of the audio clock
const TICK = 25; // ms between scheduling passes
const BIG = 0.75; // the share of a section's notes played that makes the next one big
const CALM = 0.45; // below this share the next one is calm
const DECIDE_AFTER = 3; // notes of a section judged before its share counts (else the song's share so far counts)

/**
 * The conductor for `song` on `context` and `clock` (song-clock.js, started by start()). `out` is where the music goes (the page's
 * mix), `band` the band (band.js) and `sounds` the dinosaurs' instruments (sounds.js), both made for this context; `room` the reverb.
 * `level` is 'barn' or 'fullordinn', `roles` the parts that have lanes, `fall` how long a note takes to fall (s).
 */
export function createConductor({ context, song, clock, band, sounds, out, room = null, level = 'barn', roles = ['a', 'b', 'c'], fall = 2.3 }) {
  const { beat, bar, sections, length } = timeline(song);
  const decideAhead = fall + 0.7; // s before a section starts that its version is chosen

  // the buses: the band through a mood filter (calm muffles it), the star layers on their own gains, each part through its gate
  const mood = context.createBiquadFilter();
  mood.type = 'lowpass';
  mood.frequency.value = 18000;
  mood.Q.value = 0.7;
  const bandBus = context.createGain();
  bandBus.gain.value = 0.85;
  mood.connect(bandBus);
  bandBus.connect(out);
  const tiers = [1, 2, 3].map(() => {
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(mood);
    return gain;
  });
  const partBus = context.createGain();
  partBus.gain.value = 1;
  partBus.connect(out);
  const gates = {};
  const open = {};
  for (const role of ['a', 'b', 'c']) {
    gates[role] = context.createGain();
    gates[role].gain.value = 1;
    gates[role].connect(partBus);
    open[role] = true;
  }

  // the sections as they are decided: { variant, transpose, compiled, chart, hits, misses }
  const decided = [];
  const chart = []; // every note that falls, in time order (the game's judge reads it as it grows)
  const queue = []; // events still to schedule: { t, kind: 'band'|'part', ... }
  let transpose = 0;
  let tier = 0;
  let timer = null;
  let started = false;
  const totals = { hits: 0, misses: 0 };

  // the chart the whole song would have, every section as written: what the bar at the top measures against until the end
  const expected = sections.reduce((n, _, i) => n + chartOf(compileSection(song, i, 'normal'), { level, roles, beat }).length, 0);

  function shareOf(stats) {
    const judged = stats.hits + stats.misses;
    return judged > 0 ? stats.hits / judged : 1;
  }

  /** Chooses section `k`'s version from how the one before went, compiles it, and puts its notes in the chart and the queue. */
  function decide(k) {
    const section = song.sections[sections[k].name];
    let variant = 'normal';
    if (k > 0 && !section.fixed) {
      const last = decided[k - 1];
      const enough = last.hits + last.misses >= DECIDE_AFTER;
      const share = shareOf(enough ? last : totals);
      variant = share >= BIG ? 'big' : share < CALM ? 'calm' : 'normal';
    }
    if (variant === 'big' && section.lift) transpose += section.lift;
    const compiled = compileSection(song, k, variant, transpose);
    const notes = chartOf(compiled, { level, roles, beat, section: k });
    const entry = { variant, transpose, compiled, notes, hits: 0, misses: 0, start: sections[k].start, end: sections[k].end, name: sections[k].name };
    decided[k] = entry;
    for (const note of notes) {
      note.next = nextPartNote(compiled.parts[note.role], note.index);
      chart.push(note);
    }
    for (const event of compiled.band) queue.push({ ...event, kind: 'band' });
    for (const role of ['a', 'b', 'c']) for (const note of compiled.parts[role]) queue.push({ ...note, role, kind: 'part' });
    if (variant === 'big') {
      queue.push({ t: entry.start, kind: 'band', inst: 'crash', vel: 1.1, tier: 0 });
      queue.push({ t: entry.start - bar, kind: 'band', inst: 'riser', dur: bar, vel: 1, tier: 0 });
    }
    queue.sort((x, y) => x.t - y.t);
    // the mood of the section, at its start: calm muffles the band, the others open it
    const at = Math.max(context.currentTime, clock.contextTimeOf(entry.start));
    mood.frequency.setTargetAtTime(variant === 'calm' ? 1400 : 18000, at, 0.15);
    bandBus.gain.setTargetAtTime(variant === 'calm' ? 0.7 : variant === 'big' ? 0.95 : 0.85, at, 0.2);
    return entry;
  }

  function nextPartNote(notes, index) {
    return notes[index + 1] ?? null;
  }

  /** Schedules what is due within LOOKAHEAD, and decides the next section when it is time. */
  function pump() {
    if (!started || context.state !== 'running') return;
    const now = context.currentTime;
    const songNow = now - clock.contextTimeOf(0); // the song time being played now (not heard: what the clock schedules against)
    const k = decided.length;
    if (k < sections.length && songNow >= sections[k].start - decideAhead) decide(k);
    while (queue.length) {
      const event = queue[0];
      const at = clock.contextTimeOf(event.t);
      if (at > now + LOOKAHEAD) break;
      queue.shift();
      if (at < now - 0.05) continue; // too late to play (the tab was asleep)
      const when = Math.max(at, now);
      if (event.kind === 'band') {
        band.play(event.inst, { at: when, freq: event.freq, notes: event.notes, dur: event.dur, vel: event.vel, into: event.tier ? tiers[event.tier - 1] : mood });
      } else {
        sounds.note(event.role, { freq: event.freq, at: when, dur: event.dur, vel: event.vel, into: gates[event.role] });
      }
    }
  }

  function setGate(role, on, at = context.currentTime) {
    open[role] = on;
    const gain = gates[role].gain;
    gain.cancelScheduledValues(at);
    gain.setTargetAtTime(on ? 1 : 0, at, on ? 0.005 : 0.02);
  }

  return {
    /** Starts the song `lead` seconds from now: the clock, the first section, the scheduling. */
    start(lead = 0.4) {
      clock.start(null, lead);
      started = true;
      for (const role of ['a', 'b', 'c']) setGate(role, true);
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
      for (const role of ['a', 'b', 'c']) setGate(role, false);
      bandBus.gain.setTargetAtTime(0, context.currentTime, 0.1);
    },
    pump,
    /** The child hit chart note `note`: her part plays on (or comes back, the note played now if its time has passed). */
    hit(note) {
      const entry = decided[note.section];
      if (entry) entry.hits++;
      totals.hits++;
      if (open[note.role]) return;
      const at = clock.contextTimeOf(note.t);
      const now = context.currentTime;
      if (at > now + 0.02) {
        setGate(note.role, true, now); // an early tap: the gate is open before the note, which plays in time
        return;
      }
      sounds.note(note.role, { freq: note.freq, at: now, dur: note.dur, into: partBus });
      const next = note.next ? clock.contextTimeOf(note.next.t) : now;
      setGate(note.role, true, Math.max(now, next - 0.004));
    },
    /** The child missed chart note `note`: her part drops out until she hits again. */
    miss(note) {
      const entry = decided[note.section];
      if (entry) entry.misses++;
      totals.misses++;
      setGate(note.role, false);
    },
    /** A tap with no note: a soft note of the role's, its root in the key now. */
    stray(role) {
      const pitch = decided.at(-1)?.compiled.parts[role]?.[0]?.freq ?? 233;
      sounds.note(role, { freq: pitch, soft: true, into: partBus });
    },
    /** The run of hits is at `next` tier (0-3): the star layers come in, or fade away. */
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
    rootFreq: () => (decided.at(-1)?.compiled.parts.a.find(Boolean)?.freq ?? 233),
    /** The section playing at song time `time`: { index, name, variant, start, end } (null before the first is decided). */
    sectionAt(time) {
      for (let i = decided.length - 1; i >= 0; i--) if (decided[i] && time >= decided[i].start) return { index: i, ...decided[i], compiled: undefined, notes: undefined };
      return decided[0] ? { index: 0, ...decided[0], compiled: undefined, notes: undefined } : null;
    },
    isOpen: role => open[role],
    totals,
  };
}
