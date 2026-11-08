// "Dansinn við tjörnina": smidur-c's song for the end of chapter 5, written as a list of the music video's shots. Every note
// is an event on the beat grid (126 bpm, 21000 samples a beat), so 8ths, 16ths and triplets all fall on whole samples.
//
// Shots (bars): the forest wakes 2 | the dance gathers 4 | the dance (THE LOOP) 4 | chorus 1 8 | the grazers 4 | the turtles 4
// | chorus 2 8 | the frogs 4 | the lizards 4 | the flyers 4 | Slóeðla's horn across the valley (engines off) 8 | the build 4 |
// THE DROP: everyone, chorus 3 8 | chorus 4, the biggest 8 | walking home 2 | the last hit.
import { hz, seedOf } from './dsp.mjs';
import { TONE } from './animals.mjs';

export const BPM = 126;
export const SPB = 21000; // samples a beat at 44.1 kHz
export const BEATS_PER_BAR = 4;
export const END_BEAT = 304; // the last hit
export const TAIL_BEATS = 6.5; // the last hit rings this long (no fade)
const LOOP_END = 40; // nothing may reach back over the loop's end

// ---- harmony ----
const GTR = {
  F: ['F2', 'C3', 'F3', 'A3', 'C4', 'F4'], Dm: ['A2', 'D3', 'A3', 'D4', 'F4'], Bb: ['Bb2', 'F3', 'Bb3', 'D4', 'F4'],
  C: ['C3', 'E3', 'G3', 'C4', 'E4'], Gm: ['G2', 'D3', 'G3', 'Bb3', 'D4', 'G4'], C7: ['C3', 'E3', 'Bb3', 'C4', 'E4'],
  'F/A': ['A2', 'C3', 'F3', 'A3', 'C4', 'F4'], 'C/E': ['E2', 'G2', 'C3', 'G3', 'C4', 'E4'],
};
const STR = {
  F: ['F3', 'C4', 'A4', 'F5'], Dm: ['D3', 'A3', 'F4', 'D5'], Bb: ['Bb2', 'F3', 'D4', 'Bb4'], C: ['C3', 'G3', 'E4', 'C5'],
  Gm: ['G2', 'D3', 'Bb3', 'G4'], C7: ['C3', 'G3', 'Bb3', 'E4'], 'F/A': ['A2', 'F3', 'C4', 'A4'], 'C/E': ['E3', 'G3', 'C4', 'G4'],
};
const ROOT = { F: 'F2', Dm: 'D2', Bb: 'Bb1', C: 'C2', Gm: 'G2', C7: 'C2', 'F/A': 'A2', 'C/E': 'E2' };
const FIFTH = { F: 'C3', Dm: 'A2', Bb: 'F2', C: 'G2', Gm: 'D3', C7: 'G2', 'F/A': 'C3', 'C/E': 'G2' };
const THIRD = { F: 'A2', Dm: 'F2', Bb: 'D2', C: 'E2', Gm: 'Bb2', C7: 'E2', 'F/A': 'F2', 'C/E': 'C3' };
const up12 = n => n.replace(/(-?\d)$/, d => String(Number(d) + 1));
const H = n => hz(n);

/** The whole song: sections, events, cues, the chorus melody's notes and the loop. */
export function score() {
  const ev = [];
  const cues = [];
  const melody = [];
  const add = e => { ev.push(e); return e; };
  const cue = (beat, kind, extra = {}) => cues.push({ beat, kind, ...extra });

  // ---------------------------------------------------------------- building blocks
  /** An animal's call on its tone at `beat`, held `beats` (cut there with a short release). */
  function call(group, beat, beats = 1, { gain = 1, long = null, send = 0.22, pan = null, quiet = false, noPreroll = false } = {}) {
    const PAN = { grazers: -0.5, turtles: -0.25, frogs: 0.05, lizards: 0.3, flyers: 0.55 };
    add({ stem: 'animals', kind: 'call', group, beat, beats, long: long ?? beats >= 2, gain, send, pan: pan ?? PAN[group], noPreroll: noPreroll || beat === LOOP_END });
    cue(beat, 'call', { group, ...(quiet ? { quiet: true } : {}) });
  }
  /** Her horn (the recorded alphorn) on `note` at `beat` for `beats`; `valley` sends it to the valley echo. */
  function horn(note, beat, beats, { gain = 1, valley = false, send = 0.3 } = {}) {
    add({ stem: 'lead', kind: 'horn', f: H(note), beat, beats, gain, valley, send, pan: -0.12 });
    cue(beat, 'horn', { note });
  }
  function fiddle(beat, notes, { gain = 1, pan = -0.22, send = 0.2, cello = false, key = null, press } = {}) {
    add({ stem: 'lead', kind: 'fiddle', beat, notes, gain, pan, send, cello, key, press });
  }
  function whistle(beat, notes, { gain = 1, pan = 0.22, send = 0.24, key = null } = {}) {
    add({ stem: 'lead', kind: 'whistle', beat, notes, gain, pan, send, key });
  }
  /** Eighth notes from a list of names (null = rest), each `len` of an eighth; slurs in pairs (the reel's bowing). */
  function eighths(names, { v = 0.7, len = 0.92, spic = false, slurPairs = true, step = 0.5, accent = [0] } = {}) {
    const out = [];
    names.forEach((n, i) => {
      if (!n) return;
      out.push({ b: i * step, d: step * len, n, v: accent.includes(i) ? Math.min(1, v + 0.12) : v, slur: Boolean(slurPairs && i % 2 === 1 && names[i - 1]), spic });
    });
    return out;
  }
  function harpNote(note, beat, { gain = 1, pan = 0.38, send = 0.3, key = null } = {}) {
    add({ stem: 'pad', kind: 'harp', f: H(note), beat, gain, pan, send, key: key ?? `harp|${beat}|${note}` });
  }
  /** A harp run of 16ths (or `step`) over `names`. */
  function harpRun(beat, names, { step = 0.25, gain = 0.8, pan = 0.38 } = {}) {
    names.forEach((n, i) => harpNote(n, beat + i * step, { gain: gain * (0.85 + 0.15 * (i % 2)), pan }));
  }
  function strings(chord, beat, beats, { gain = 0.5, shape = 'swell', high = false, tremolo = 0, notes = null, key = null, pan = 0, send = 0.3 } = {}) {
    let ns = notes ?? STR[chord];
    if (high) ns = [...ns, up12(ns[ns.length - 1]), up12(ns[ns.length - 2])];
    add({ stem: 'pad', kind: 'strings', freqs: ns.map(H), beat, beats, gain, shape, tremolo, pan, send, key: key ?? `str|${beat}|${chord}` });
  }

  /**
   * The dance's groove over bars [from, to), `chords` one entry per bar ('F' or ['C', 'F'] for two halves). Seeds come from the
   * bar's place in its 4-bar cycle, so the same bar sounds the same wherever it is (the loop and the bar before it).
   */
  function groove(fromBar, chords, o = {}) {
    const {
      strum = 'eighths', strumGain = 0.5, bass = true, bassGain = 1, bod = 'reel', bodGain = 1, stomps = [0, 2], stompGain = 0.8,
      claps = [1, 3], clapGain = 0.55, fill = true, str = 0, strHigh = false, style = 'g', bassStyle = 'walk', bodTone = 0, cycStart = 0,
    } = o;
    chords.forEach((ch, k) => {
      const bar = fromBar + k;
      const b0 = bar * 4;
      const cyc = (k + cycStart) % 4;
      const halves = Array.isArray(ch) ? ch : [ch, ch];
      const key = `${style}|${cyc}|${halves.join(',')}`;
      const chordAt = beat => halves[beat < 2 ? 0 : 1];
      // guitar
      if (strum !== 'none') {
        const VEL = [0.95, 0.4, 0.65, 0.45, 0.85, 0.4, 0.65, 0.5];
        const step = strum === 'quarters' ? 1 : 0.5;
        for (let s = 0; s < 4; s += step) {
          const i = Math.round(s * 2);
          const c = chordAt(s); const down = i % 2 === 0;
          const notes = down ? GTR[c] : GTR[c].slice(-4);
          add({ stem: 'pad', kind: 'strum', beat: b0 + s, freqs: notes.map(H), down, v: VEL[i] * (strum === 'quarters' ? 0.8 : 1), dampBeats: step * 0.95, gain: strumGain, pan: -0.38, send: 0.16, key: `${key}|st|${i}` });
        }
      }
      // bass
      if (bass) {
        const [c1, c2] = halves;
        const notes = c1 === c2
          ? (bassStyle === 'roots' ? [[0, ROOT[c1], 1.6], [2, FIFTH[c1], 1.6]] : [[0, ROOT[c1], 1.4], [2, FIFTH[c1], 0.9], [3, THIRD[c1], 0.85]])
          : [[0, ROOT[c1], 1.6], [2, ROOT[c2], 0.9], [3, FIFTH[c2], 0.85]];
        for (const [b, n, d] of notes) add({ stem: 'bass', kind: 'bass', beat: b0 + b, f: H(n), beats: d, v: 0.85, gain: bassGain, pan: 0, send: 0.04, key: `${key}|bs|${b}` });
      }
      // bodhrán
      if (bod !== 'none') {
        const V = [1.0, 0.32, 0.55, 0.32, 0.85, 0.32, 0.6, 0.42];
        const T = [0.05, 0.55, 0.3, 0.55, 0.12, 0.55, 0.35, 0.5];
        const soft = bod === 'soft' ? 0.55 : bod === 'light' ? 0.7 : 1;
        for (let i = 0; i < 8; i++) {
          if (fill && cyc === 3 && i >= 6) continue;
          add({ stem: 'beat', kind: 'bodhran', beat: b0 + i / 2, v: V[i] * soft, tone: Math.min(1, T[i] + bodTone), up: i % 2 === 1, gain: bodGain, pan: -0.08, send: 0.1, key: `${key}|bd|${i}` });
        }
        if (fill && cyc === 3) {
          [[3, 0.6, 0.4], [3 + 1 / 3, 0.5, 0.5], [3 + 2 / 3, 0.72, 0.28]].forEach(([b, v, t], j) =>
            add({ stem: 'beat', kind: 'bodhran', beat: b0 + b, v: v * soft, tone: Math.min(1, t + bodTone), up: j === 1, gain: bodGain, pan: -0.08, send: 0.1, key: `${key}|fill|${j}` }));
        }
      }
      for (const s of stomps) add({ stem: 'beat', kind: 'stomp', beat: b0 + s, v: s === 0 ? 1 : 0.8, gain: stompGain, pan: 0, send: 0.08, key: `${key}|sp|${s}` });
      for (const s of claps) add({ stem: 'beat', kind: 'clap', beat: b0 + s, v: 1, gain: clapGain, pan: s % 2 ? 0.18 : -0.18, send: 0.12, key: `${key}|cl|${s}` });
      if (str > 0) {
        if (halves[0] === halves[1]) strings(halves[0], b0, 4, { gain: str, high: strHigh, shape: 'bar', key: `${key}|str` });
        else { strings(halves[0], b0, 2, { gain: str, high: strHigh, shape: 'bar', key: `${key}|str0` }); strings(halves[1], b0 + 2, 2, { gain: str, high: strHigh, shape: 'bar', key: `${key}|str1` }); }
      }
    });
  }

  // the chorus: her 14 notes, 2 bars a phrase; animals sing, the whistle doubles, the fiddle answers in the gaps
  const CHORUS_CHORDS = ['F', 'Bb', ['C', 'F'], ['F', 'C'], 'Dm', 'Bb', ['Bb', 'C'], 'F'];
  const TUNE = [
    ['lizards', 0, 2, 'C', 'cut'], ['frogs', 2, 2, 'A', 'roll'],
    ['turtles', 8, 1, 'G', null], ['frogs', 9, 1, 'A', null], ['grazers', 10, 2, 'F', 'cut'],
    ['flyers', 16, 1, 'D', null], ['lizards', 17, 1, 'C', null], ['frogs', 18, 1, 'A', null], ['lizards', 19, 1, 'C', 'tap'],
    ['flyers', 24, 1, 'D', null], ['lizards', 25, 1, 'C', null], ['frogs', 26, 1, 'A', null], ['turtles', 27, 1, 'G', null],
    ['grazers', 28, 4, 'F', 'slide'],
  ];
  // the octave each tune note sits in, for the whistle's line F5..D6 (do .. la)
  const OCT5 = { F: 'F5', G: 'G5', A: 'A5', C: 'C6', D: 'D6' };
  const shift = (n, o) => n.replace(/(-?\d)$/, d => String(Number(d) + o));
  const ANSWERS = {
    a1: ['F5', 'D5', 'Bb4', 'D5', 'F5', 'D5', 'C5', 'A4'],
    a2: ['A4', 'C5', 'F5', 'A5', 'G5', 'E5', 'C5', 'E5'],
    a3: ['Bb4', 'D5', 'F5', 'Bb5', 'A5', 'F5', 'D5', 'C5'],
  };
  /**
   * One chorus at bar `bar`. `level` 1..4 grows it: 1 the first, 2 the second (harp and more strings), 3 the drop (her horn,
   * the fiddle on the tune, everything), 4 the biggest (the whistle an octave up, strings high, stomps on every beat).
   */
  function chorus(bar, level, { last = 'run' } = {}) {
    const B = bar * 4;
    groove(bar, CHORUS_CHORDS, {
      style: `ch${Math.min(level, 3)}`, str: [0, 0.4, 0.55, 0.8, 1.0][level], strHigh: level >= 3, fill: false, bassGain: [0, 1, 1.05, 1.15, 1.2][level],
      stomps: level >= 3 ? [0, 1, 2, 3] : [0, 2], stompGain: [0, 0.75, 0.8, 0.9, 1.0][level], clapGain: [0, 0.5, 0.55, 0.65, 0.7][level],
      strumGain: [0, 0.5, 0.55, 0.6, 0.62][level], bodGain: [0, 0.9, 0.95, 1.1, 1.2][level],
    });
    // the tune
    const wl = [];
    TUNE.forEach(([group, b, d, deg, orn], i) => {
      call(group, B + b, d, { gain: [0, 1, 1, 1.08, 1.12][level] });
      melody.push({ group, beat: B + b });
      const n = level >= 4 ? shift(OCT5[deg], 1) : OCT5[deg];
      wl.push({ b, d: d * 0.94 - 0.04, n, v: 0.85, orn, slur: false });
      if (level >= 3) horn(shift(OCT5[deg], -2), B + b, d, { gain: level >= 4 ? 0.95 : 0.85 });
    });
    whistle(B, wl, { gain: level >= 4 ? 0.62 : 0.8, key: `tune|${level}` });
    if (level >= 3) {
      // the fiddle takes the tune too, an octave under the whistle (or with it, at the top)
      const fl = TUNE.map(([, b, d, deg]) => ({ b, d: d * 0.95, n: level >= 4 ? OCT5[deg] : shift(OCT5[deg], -1), v: 0.8 }));
      fiddle(B, fl, { gain: 0.75, pan: -0.25, key: `ftune|${level}` });
    }
    // the answers, in the gaps (bars 2, 4, 6) and the run at the end
    const ans = [[4, ANSWERS.a1], [12, ANSWERS.a2], [20, ANSWERS.a3]];
    for (const [b, names] of ans) {
      const ns = level >= 4 ? names.map(n => shift(n, 1)) : names;
      fiddle(B + b, eighths(ns, { v: 0.72, accent: [0, 4] }), { gain: 0.9, key: `ans|${level}|${b}` });
      if (level >= 2) harpRun(B + b + 2, ['F5', 'G5', 'A5', 'C6', 'D6', 'F6', 'G6', 'A6'], { gain: 0.45 + 0.1 * level });
    }
    if (last === 'run') fiddle(B + 30, eighths(['A5', 'G5', 'F5', 'E5'], { v: 0.72 }), { gain: 0.9, key: `run|${level}` });
    cue(B, 'hit', { what: `chorus ${level}` });
  }

  /**
   * A featured part at `bar`: the instrument calls (two beats of 8ths), the group answers on its tone, bars 1-3; in bar 4 the
   * group sings three beats on its own and the instrument leads on into the next shot.
   */
  function feature(bar, group, o) {
    const B = bar * 4;
    groove(bar, ['F', 'Dm', 'Bb', 'C'], o.groove);
    const answers = o.answers ?? [[2], [6, 7], [10, 10.5, 11], [12, 13, 14]];
    answers.flat().forEach(b => {
      call(group, B + b, o.callBeats ?? (b % 1 ? 0.5 : 1), { gain: o.callGain ?? 1 });
      if (o.double) o.double(B + b, b % 1 ? 0.5 : 1);
    });
    o.calls.forEach(([b, names]) => o.play(B + b, names));
    if (o.fillIn) o.play(B + 15, o.fillIn);
    cue(B, 'hit', { what: group });
  }

  // ---------------------------------------------------------------- 1. the forest wakes (bars 0-1)
  add({ stem: 'pad', kind: 'drone', freqs: ['F2', 'C3', 'F3'].map(H), beat: 0, beats: 8.6, attack: 2.6, release: 0.8, gain: 0.3, pan: 0, send: 0.35, key: 'drone|intro' });
  harpRun(0, ['F3', 'A3', 'C4', 'F4', 'A4', 'C5', 'F5', 'A5'], { step: 0.5, gain: 0.55 });
  harpRun(4, ['D4', 'F4', 'A4', 'D5', 'F5', 'A5', 'D6', 'F6'], { step: 0.5, gain: 0.6 });
  // a bird in the trees (the whistle's trills) and the first animals waking, far off
  whistle(2, [{ b: 0, d: 0.45, n: 'D6', v: 0.5, orn: 'trill', up: H('F6') }, { b: 0.5, d: 0.4, n: 'C6', v: 0.45, slur: true }], { gain: 0.6, send: 0.45 });
  whistle(6, [{ b: 0, d: 0.45, n: 'F6', v: 0.5, orn: 'trill', up: H('G6') }, { b: 0.5, d: 0.9, n: 'D6', v: 0.45, slur: true, orn: 'cut' }], { gain: 0.6, send: 0.45 });
  call('flyers', 3, 1, { gain: 0.5, send: 0.45, quiet: true });
  call('frogs', 5, 1, { gain: 0.55, send: 0.4, quiet: true });
  call('lizards', 7, 1, { gain: 0.55, send: 0.4, quiet: true });

  // ---------------------------------------------------------------- 2. the dance gathers (bars 2-5)
  // bar 2: guitar on the beats, the bass, a stomp; bar 3: the guitar's 8ths, the bodhrán soft; bars 4-5 are the loop's bars 3-4
  groove(2, ['F'], { style: 'g2', strum: 'quarters', strumGain: 0.45, bod: 'none', stomps: [0, 2], stompGain: 0.55, claps: [], fill: false });
  groove(3, ['Dm'], { style: 'g3', strum: 'eighths', strumGain: 0.48, bod: 'soft', stomps: [0, 2], stompGain: 0.65, claps: [], fill: false });
  // the whistle teases her song and the animals answer: "sol, mi" ... "la, sol"
  whistle(8, [{ b: 0, d: 1.8, n: 'C6', v: 0.75, orn: 'cut' }, { b: 2, d: 1.8, n: 'A5', v: 0.7, orn: 'roll' }], { gain: 0.75 });
  call('lizards', 12, 1); call('frogs', 14, 1);
  whistle(16, [{ b: 0, d: 0.9, n: 'D6', v: 0.75, orn: 'cut' }, { b: 1, d: 0.9, n: 'C6', v: 0.7 }], { gain: 0.75 });
  call('flyers', 18, 1); call('lizards', 19, 1);

  // ---------------------------------------------------------------- 3. the dance: the groove, THE LOOP (bars 6-9 = beats 24-40)
  const LOOP = { style: 'loop', strumGain: 0.5, str: 0.2 };
  groove(4, ['Bb', 'C'], { ...LOOP, cycStart: 2 }); // bars 4-5 are the same as the loop's bars 3-4 (8, 9)
  const riff = (beat, key) => {
    fiddle(beat, eighths(['F4', 'A4', 'C5', 'A4', 'F5', 'C5', 'A4', 'C5'], { v: 0.66, accent: [0, 4] }), { gain: 0.85, key: `${key}|0` });
    fiddle(beat + 4, eighths(['D5', 'A4', 'F4', 'A4', 'D5', 'E5', 'F5', 'D5'], { v: 0.66, accent: [0, 4] }), { gain: 0.85, key: `${key}|1` });
    fiddle(beat + 8, eighths(['Bb4', 'D5', 'F5', 'D5', 'Bb4', 'F5', 'D5', 'Bb4'], { v: 0.66, accent: [0, 4] }), { gain: 0.85, key: `${key}|2` });
  };
  const turnaround = (beat) => fiddle(beat, eighths(['C5', 'E5', 'G5', 'E5', 'C5', 'Bb4', 'A4', 'G4'], { v: 0.68, accent: [0, 4] }), { gain: 0.85, key: 'turn' });
  turnaround(20); // the fiddle comes in on the turnaround, the same bar that ends the loop
  groove(6, ['F', 'Dm', 'Bb', 'C'], { ...LOOP });
  riff(24, 'riff'); turnaround(36);

  // ---------------------------------------------------------------- 4. chorus 1 (bars 10-17)
  chorus(10, 1);

  // ---------------------------------------------------------------- 5. the grazers (bars 18-21): big and low, stomping
  const cello = (beat, names) => fiddle(beat, eighths(names, { v: 0.75, accent: [0], len: 0.95 }), { gain: 1.0, cello: true, pan: -0.3, key: `cello|${names}` });
  feature(18, 'grazers', {
    groove: { style: 'graz', stomps: [0, 1, 2, 3], stompGain: 0.85, bassGain: 1.0, strumGain: 0.34, bod: 'light', claps: [], str: 0 },
    answers: [[2], [6, 7], [10, 11], [12, 13, 14]],
    calls: [[0, ['F2', 'A2', 'C3', 'A2']], [4, ['D3', 'C3', 'A2', 'F2']], [8, ['Bb2', 'C3', 'D3', 'F3']]],
    fillIn: ['C3', 'E3'],
    play: cello,
    double: (beat, d) => fiddle(beat, [{ b: 0, d: d * 0.9, n: 'F3', v: 0.55 }], { gain: 0.55, cello: true, pan: -0.45, key: 'dblF3' }),
  });
  // ---------------------------------------------------------------- 6. the turtles (bars 22-25): slow, steady, plucked
  const pick = (beat, names) => names.forEach((n, i) => add({ stem: 'lead', kind: 'pick', f: H(n), beat: beat + i * 0.5, beats: 0.5, gain: 0.9, pan: -0.15, send: 0.18, key: `pick|${n}|${i}` }));
  feature(22, 'turtles', {
    groove: { style: 'turt', stomps: [0], stompGain: 0.65, strumGain: 0.32, bod: 'soft', claps: [1, 3], clapGain: 0.35, bassGain: 0.85, bassStyle: 'roots', str: 0 },
    answers: [[2], [6, 7], [10, 11], [12, 13, 14]],
    calls: [[0, ['F3', 'G3', 'A3', 'C4']], [4, ['D4', 'C4', 'A3', 'F3']], [8, ['Bb3', 'A3', 'G3', 'F3']]],
    fillIn: ['E3', 'G3'],
    play: pick,
    double: beat => add({ stem: 'lead', kind: 'pick', f: H('G3'), beat, beats: 0.6, gain: 0.55, pan: -0.3, send: 0.18, key: 'dblG3' }),
  });

  // ---------------------------------------------------------------- 7. chorus 2 (bars 26-33)
  chorus(26, 2);

  // ---------------------------------------------------------------- 8. the frogs (bars 34-37): hopping on the fiddle
  const spic = (beat, names) => fiddle(beat, eighths(names, { v: 0.7, spic: true, slurPairs: false, accent: [0] }), { gain: 0.95, key: `spic|${names}` });
  feature(34, 'frogs', {
    groove: { style: 'frog', strumGain: 0.34, bod: 'light', stomps: [0], stompGain: 0.6, clapGain: 0.4, bassGain: 0.9, str: 0 },
    answers: [[2], [6, 7], [10, 10.5, 11], [12, 13, 13.5, 14]],
    calls: [[0, ['A4', 'C5', 'A4', 'F4']], [4, ['D5', 'C5', 'A4', 'C5']], [8, ['Bb4', 'C5', 'D5', 'F5']]],
    fillIn: ['E5', 'G5'],
    play: spic,
    double: (beat, d) => fiddle(beat, [{ b: 0, d: 0.2, n: 'A5', v: 0.55, spic: true }], { gain: 0.5, pan: 0.0, key: 'dblA5' }),
  });
  // ---------------------------------------------------------------- 9. the lizards (bars 38-41): quick on the whistle
  const wh = (beat, names) => whistle(beat, names.map((n, i) => ({ b: i * 0.5, d: 0.44, n, v: 0.75, orn: i === 0 ? 'cut' : null, slur: i % 2 === 1 })), { gain: 0.8, key: `wh|${names}` });
  feature(38, 'lizards', {
    groove: { style: 'liz', strumGain: 0.34, bod: 'light', stomps: [0], stompGain: 0.6, clapGain: 0.4, bassGain: 0.9, str: 0, bodTone: 0.1 },
    answers: [[2], [6, 7], [10, 10.5, 11], [12, 12.5, 13, 14]],
    calls: [[0, ['F5', 'A5', 'C6', 'A5']], [4, ['D6', 'C6', 'A5', 'F5']], [8, ['F5', 'G5', 'A5', 'Bb5']]],
    fillIn: ['G5', 'A5'],
    play: wh,
    double: (beat, d) => whistle(beat, [{ b: 0, d: Math.min(0.4, d * 0.8), n: 'C6', v: 0.5 }], { gain: 0.45, pan: 0.35, key: 'dblC6' }),
  });
  // ---------------------------------------------------------------- 10. the flyers (bars 42-45): high and light, harp and whistle
  const hp = (beat, names) => names.forEach((n, i) => harpNote(n, beat + i * 0.5, { gain: 0.85, pan: 0.45 }));
  feature(42, 'flyers', {
    groove: { style: 'fly', strumGain: 0.28, bassGain: 0.6, bod: 'soft', bodTone: 0.25, stomps: [], claps: [1, 3], clapGain: 0.4, str: 0.12, strHigh: true },
    answers: [[2], [6, 7], [10, 10.5, 11], [12, 13, 14]],
    calls: [[0, ['F5', 'A5', 'C6', 'D6']], [4, ['D6', 'A5', 'F5', 'D5']], [8, ['Bb5', 'D6', 'F6', 'D6']]],
    play: hp,
    double: (beat, d) => whistle(beat, [{ b: 0, d: Math.min(0.42, d * 0.8), n: 'D6', v: 0.5, orn: 'cut' }], { gain: 0.42, pan: 0.5, key: 'dblD6' }),
  });
  // the flyers lift off: a harp glissando up to the top, a whistle trill, and the dance stops
  harpRun(182, ['D5', 'F5', 'G5', 'A5', 'C6', 'D6', 'F6', 'A6'], { step: 0.25, gain: 0.7, pan: 0.45 });
  whistle(183, [{ b: 0, d: 0.9, n: 'D6', v: 0.55, orn: 'trill', up: H('F6') }], { gain: 0.6, send: 0.5 });

  // ---------------------------------------------------------------- 11. engines off: Slóeðla's horn across the valley (bars 46-53)
  add({ stem: 'pad', kind: 'drone', freqs: ['F2', 'C3', 'F3'].map(H), beat: 184, beats: 33, attack: 1.2, release: 1.6, gain: 0.2, pan: 0, send: 0.4, key: 'drone|mid' });
  harpRun(184, ['F3', 'A3', 'C4', 'F4', 'A4', 'C5', 'F5', 'A5'], { step: 0.5, gain: 0.5 });
  // her call, and the valley answers a bar later (the echo); the harp fills the echoes' gaps
  horn('C4', 188, 2, { valley: true, gain: 0.85 }); horn('A3', 190, 2, { valley: true, gain: 0.85 });
  harpNote('C5', 194, { gain: 0.45 }); harpNote('A4', 195, { gain: 0.4 });
  horn('G3', 196, 1, { valley: true, gain: 0.85 }); horn('A3', 197, 1, { valley: true, gain: 0.85 }); horn('F3', 198, 2, { valley: true, gain: 0.85 });
  harpRun(200, ['D4', 'F4', 'A4', 'D5', 'F5', 'A5'], { step: 0.5, gain: 0.45 });
  horn('D4', 204, 1, { valley: true, gain: 0.85 }); horn('C4', 205, 1, { valley: true, gain: 0.85 }); horn('A3', 206, 1, { valley: true, gain: 0.85 }); horn('C4', 207, 1, { valley: true, gain: 0.85 });
  harpRun(208, ['Bb3', 'D4', 'F4', 'Bb4', 'D5', 'F5'], { step: 0.5, gain: 0.45 });
  strings('F', 200, 16, { notes: ['F4', 'C5', 'F5'], gain: 0.16, shape: 'slow', key: 'air' });
  horn('D4', 212, 1, { valley: true, gain: 0.85 }); horn('C4', 213, 1, { valley: true, gain: 0.85 }); horn('A3', 214, 1, { valley: true, gain: 0.85 }); horn('G3', 215, 1, { valley: true, gain: 0.85 });
  // a heartbeat comes back in the second half: the bodhrán's open skin, softly, on 1 and 3
  for (let b = 200; b < 216; b += 2) add({ stem: 'beat', kind: 'bodhran', beat: b, v: 0.22 + 0.012 * (b - 200), tone: 0.05, up: false, gain: 0.8, pan: 0, send: 0.2, key: `heart|${b % 4}` });

  // ---------------------------------------------------------------- 12. the build (bars 54-57): the bodhrán doubles bar by bar
  horn('F3', 216, 4, { valley: true, gain: 1 });
  cue(216, 'riser');
  add({ stem: 'beat', kind: 'riser', beat: 216, beats: 16, v: 0.35, pan: 0, send: 0.2, key: 'riser' });
  const BUILD = ['Dm', 'Bb', 'C', 'C'];
  BUILD.forEach((ch, k) => {
    const b0 = 216 + k * 4;
    const per = [4, 8, 12, 16][k];
    for (let i = 0; i < per; i++) {
      const x = (k * 4 + (i / per) * 4) / 16; // 0 .. 1 through the build
      add({ stem: 'beat', kind: 'bodhran', beat: b0 + (i * 4) / per, v: 0.35 + 0.55 * x + (i % (per / 4) === 0 ? 0.12 : 0), tone: 0.1 + 0.5 * x, up: i % 2 === 1, gain: 1, pan: -0.08, send: 0.12, key: `build|${k}|${i}` });
    }
    const st = [[0], [0, 2], [0, 1, 2, 3], [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]][k];
    for (const s of st) add({ stem: 'beat', kind: 'stomp', beat: b0 + s, v: 0.6 + 0.1 * k, gain: 0.85, pan: 0, send: 0.08, key: `bst|${k}|${s}` });
    const cl = [[], [], [1, 3], [0.5, 1, 1.5, 2, 2.5, 3, 3.5]][k];
    for (const s of cl) add({ stem: 'beat', kind: 'clap', beat: b0 + s, v: 1, gain: 0.5 + 0.05 * k, pan: s % 1 ? 0.2 : -0.2, send: 0.12, key: `bcl|${k}|${s}` });
    strings(ch, b0, 4, { gain: 0.22 + 0.12 * k, tremolo: 0.6, shape: 'rise', notes: k < 2 ? STR[ch] : ['C4', 'G4', 'E5', 'G5'], key: `bstr|${k}` });
    if (k >= 2) for (let s = 0; s < 4; s += k === 3 ? 0.5 : 1) add({ stem: 'bass', kind: 'bass', beat: b0 + s, f: H('C2'), beats: k === 3 ? 0.4 : 0.8, v: 0.8, gain: 0.8 + 0.1 * k, pan: 0, send: 0.04, key: `bbs|${k}|${s}` });
    if (k >= 2) for (let s = 0; s < 4; s += k === 3 ? 0.5 : 1) add({ stem: 'pad', kind: 'strum', beat: b0 + s, freqs: GTR.C.map(H), down: true, v: 0.5 + 0.1 * k, dampBeats: k === 3 ? 0.45 : 0.9, gain: 0.45, pan: -0.38, send: 0.16, key: `bgt|${k}|${s}` });
  });
  whistle(224, [{ b: 0, d: 3.8, n: 'G5', v: 0.6, orn: 'trill', up: H('A5') }], { gain: 0.6 });
  fiddle(228, eighths(['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'Bb5', 'C6'], { v: 0.75, slurPairs: false, accent: [0, 4] }), { gain: 0.95, key: 'climb' });
  // the animals line up, low to high, and the drop starts on the first note of her song
  call('grazers', 227, 1); call('turtles', 228, 1); call('frogs', 229, 1); call('lizards', 230, 1); call('flyers', 231, 1);

  // ---------------------------------------------------------------- 13-14. THE DROP: the final chorus twice, the biggest
  cue(232, 'drop');
  add({ stem: 'pad', kind: 'drone', freqs: ['F2', 'C3'].map(H), beat: 232, beats: 64, attack: 0.3, release: 0.6, gain: 0.22, pan: 0, send: 0.3, key: 'drone|final' });
  chorus(58, 3);
  chorus(66, 4, { last: 'none' });

  // ---------------------------------------------------------------- 15. walking home (bars 74-75) and the last hit (beat 304)
  // her last phrase broadened over a falling bass: la (Bb), sol (F/A), mi (Gm7), re (C7) ... do.
  const HOME = [['Bb', 296, 'flyers', 'D6', 'D4'], ['F/A', 298, 'lizards', 'C6', 'C4'], ['Gm', 300, 'frogs', 'A5', 'A3'], ['C7', 302, 'turtles', 'G5', 'G3']];
  for (const [ch, b, group, wn, hn] of HOME) {
    call(group, b, 2, { gain: 1.05 });
    horn(hn, b, 2, { gain: 0.95 });
    add({ stem: 'bass', kind: 'bass', beat: b, f: H({ Bb: 'Bb2', 'F/A': 'A2', Gm: 'G2', C7: 'C2' }[ch]), beats: 1.9, v: 0.85, gain: 1, pan: 0, send: 0.05, key: `home|${b}` });
    add({ stem: 'pad', kind: 'strum', beat: b, freqs: GTR[ch].map(H), down: true, v: 0.75, dampBeats: 1.9, gain: 0.5, pan: -0.38, send: 0.2, key: `hst|${b}` });
    add({ stem: 'beat', kind: 'stomp', beat: b, v: 0.8, gain: 0.85, pan: 0, send: 0.08, key: `hsp|${b}` });
    add({ stem: 'beat', kind: 'bodhran', beat: b, v: 0.8, tone: 0.1, up: false, gain: 1, pan: -0.08, send: 0.12, key: `hbd|${b}` });
    add({ stem: 'beat', kind: 'bodhran', beat: b + 1, v: 0.45, tone: 0.45, up: true, gain: 1, pan: -0.08, send: 0.12, key: `hbd2|${b}` });
    strings(ch, b, 2, { gain: 0.5, shape: 'bar', high: true, key: `hstr|${b}` });
  }
  whistle(296, HOME.map(([, b, , wn]) => ({ b: b - 296, d: 1.85, n: wn, v: 0.8, orn: b === 296 ? 'cut' : null })), { gain: 0.75, key: 'homewh' });
  fiddle(296, HOME.map(([, b, , wn]) => ({ b: b - 296, d: 1.9, n: wn.replace(/\d$/, d => String(Number(d) - 1)), v: 0.75, vib: 22 })), { gain: 0.8, key: 'homefd' });
  // the last hit: everyone on F, the grazers, frogs and lizards singing an F major chord with her horn
  const E = END_BEAT;
  call('grazers', E, 3, { gain: 1.1, long: true }); call('frogs', E, 2, { gain: 0.9 }); call('lizards', E, 2, { gain: 0.9 });
  horn('F3', E, 4, { gain: 1 });
  add({ stem: 'bass', kind: 'bass', beat: E, f: H('F2'), beats: 3, v: 1, gain: 1.1, pan: 0, send: 0.06, key: 'endbass' });
  add({ stem: 'pad', kind: 'strum', beat: E, freqs: GTR.F.map(H), down: true, v: 0.95, dampBeats: 5, gain: 0.6, pan: -0.38, send: 0.25, key: 'endst' });
  strings('F', E, 4, { gain: 0.6, high: true, shape: 'end', key: 'endstr' });
  harpRun(E, ['F3', 'C4', 'F4', 'A4', 'C5', 'F5'], { step: 1 / 6, gain: 0.7 });
  whistle(E, [{ b: 0, d: 1.6, n: 'F5', v: 0.8, orn: 'cut' }], { gain: 0.7, key: 'endwh' });
  fiddle(E, [{ b: 0, d: 1.6, n: 'F4', v: 0.8, vib: 20 }], { gain: 0.8, key: 'endfd' });
  add({ stem: 'beat', kind: 'stomp', beat: E, v: 1, gain: 1, pan: 0, send: 0.1, key: 'endsp' });
  add({ stem: 'beat', kind: 'bodhran', beat: E, v: 1, tone: 0.02, up: false, gain: 1.1, pan: -0.08, send: 0.15, key: 'endbd' });
  add({ stem: 'beat', kind: 'clap', beat: E, v: 1, gain: 0.7, pan: 0, send: 0.15, key: 'endcl' });
  cue(E, 'hit', { what: 'the last hit' }); cue(E, 'end');

  // the valley echo of her horn and the whistle's birds only answer in the middle; Flugeðla's wings beat on every beat (picture)
  const sections = [
    S('Forest wakes', 'Skógurinn vaknar', 0, 8, null, 'A reed drone swells in, the harp ripples up an F chord, a bird trills on the whistle; a flyer, a frog and a lizard call from far off.'),
    S('The dance gathers', 'Dansinn safnast', 8, 16, null, 'The guitar strums on the beat, the bass and stomps come in, then the bodhrán; the whistle teases her song (sol, mi / la, sol) and the lizards, frogs and flyers answer; the fiddle enters on the turnaround.'),
    S('The dance (loop)', 'Dansinn', 24, 16, null, 'The full reel groove (F Dm Bb C): guitar 8ths, walking bass, bodhrán, stomps on 1 and 3, claps on 2 and 4, soft strings, the fiddle\'s riff. The game\'s loop.'),
    S('Chorus 1', 'Viðlag 1', 40, 32, 'all', 'Her song: each of the 14 notes sung by its animal, doubled by the tin whistle; the fiddle answers in every gap; strings swell.'),
    S('The grazers', 'Grasbítarnir', 72, 16, 'grazers', 'A low bowed cello calls, the grazers answer on F, stomping on every beat.'),
    S('The turtles', 'Skjaldbökurnar', 88, 16, 'turtles', 'Plucked guitar calls, slow and steady; the turtles answer on G.'),
    S('Chorus 2', 'Viðlag 2', 104, 32, 'all', 'Her song again, bigger: more strings, harp runs in the answers.'),
    S('The frogs', 'Froskarnir', 136, 16, 'frogs', 'The fiddle hops in spiccato; the frogs answer on A, faster each bar.'),
    S('The small lizards', 'Litlu eðlurnar', 152, 16, 'lizards', 'The tin whistle darts with cuts; the lizards answer on C.'),
    S('The small flyers', 'Litlu flugdýrin', 168, 16, 'flyers', 'High and light: harp and whistle call, the flyers answer on D, no stomps; a harp glissando lifts them off.'),
    S('Slóeðla\'s horn', 'Horn Slóeðlu', 184, 32, 'sloedla', 'Engines off: no drums, no bass. A drone and the harp; her recorded horn sings her song\'s phrases slowly and the valley echoes each a bar later; a soft heartbeat on the bodhrán returns halfway.'),
    S('The build', 'Uppbyggingin', 216, 16, 'all', 'Her horn holds do; the bodhrán doubles bar by bar (quarters, 8ths, triplets, 16ths), stomps and claps gather, tremolo strings rise, a wind sweeps up, the fiddle climbs, the animals line up low to high.'),
    S('Final chorus (the drop)', 'Lokaviðlag', 232, 32, 'all', 'Everyone: the five animals, her horn on every note, the fiddle on the tune, full strings and harp.'),
    S('Final chorus, the biggest', 'Stærsta viðlagið', 264, 32, 'all', 'The same, bigger: the whistle an octave up, strings in a high octave, stomps on every beat.'),
    S('Walking home', 'Heim á leið', 296, 8, 'all', 'A written cadence: her last phrase broadened (la, sol, mi, re) over a falling bass (Bb, A, G, C), each note sung by its animal with her horn.'),
    S('The last hit', 'Lokahöggið', 304, TAIL_BEATS, 'all', 'Everyone on F: grazers, frogs and lizards sing an F major chord with her horn; stomp, bodhrán, guitar, strings; it rings out, no fade.'),
  ];
  return { sections, events: ev, cues: cues.sort((a, b) => a.beat - b.beat), melody, loop: { startBeat: 24, beats: 16 } };
}
function S(name, nameIs, startBeat, beats, feature, what) { return { name, nameIs, startBeat, beats, feature, what }; }
export { TONE };
