// The score of smidur-b's song, "Skrúðganga skógarins" (the forest's parade): a list of units, each a shot of the music video,
// written as events on a sample-exact grid (126 bpm: 21000 samples a beat). Growth is made by adding and subtracting; a
// brightness arc opens and closes the filters across the units; the middle is "engines off" (no drums, her horn calling her song,
// the forest echoing it), the riser gathers the drums bar by bar, the drop is the chorus bigger, and the end is a written
// stop-time cadence (la - sol - mi - re over Bb A G C) landing on DO, the last hit.
import { hash } from './dsp.mjs';
import * as D from './drums.mjs';
import * as I from './inst.mjs';
import * as V from './voices.mjs';
import { MELODY } from '../../../chapters/kafli5-song.js';

export const BPM = 126;
export const SPB = 21000; // samples a beat at 44.1 kHz
export const SEC = 60 / BPM;
export const END_BEAT = 296; // the last hit
export const LOOP = { startBeat: 24, beats: 16 }; // bars 7-10; bars 5-6 play what bars 9-10 play, so its seams carry the same tails

// ---------- the units (bars of 4 beats) ----------
export const SECTIONS = [
  { name: 'Intro: the forest wakes', nameIs: 'Skógurinn vaknar', startBeat: 0, beats: 16, feature: null,
    what: 'A string pad opens out of the dark; far away Slóeðla calls sol-mi on her horn; the five groups wake one after another, low to high (F G A C D); a heartbeat frame drum, shakers and a bowed bass join; the toms roll the parade in.' },
  { name: 'Parade arrives (loop)', nameIs: 'Skrúðgangan kemur', startBeat: 16, beats: 24, feature: 'all',
    what: 'The groove: taiko in 3+3+2, a driving low-string ostinato, shakers, log drums; trumpets call sol-mi, brass and a shouted chant answer (ba-BAP HEY / HO). Bars 7-10 are the seamless 4-bar loop.' },
  { name: 'Grazers', nameIs: 'Grasbítarnir', startBeat: 40, beats: 16, feature: 'grazers',
    what: 'The big plant-eaters march: stomps on every beat, heavy taiko, a tuba riff on F; the moo chopped into a dance on F (MOOO mo-mo mo, and a stutter).' },
  { name: 'Turtles', nameIs: 'Skjaldbökurnar', startBeat: 56, beats: 16, feature: 'turtles',
    what: 'Slow and steady: half-time taiko, pitched log drums and a low marimba on G; the turtles sing and groan on G.' },
  { name: 'Chorus 1', nameIs: 'Viðlag 1', startBeat: 72, beats: 32, feature: 'all',
    what: 'Her song: each of the 14 notes sung by its animal, doubled by trumpets and the marimba; every phrase answered by brass stabs, the taiko and HEY / HO.' },
  { name: 'Frogs', nameIs: 'Froskarnir', startBeat: 104, beats: 16, feature: 'frogs',
    what: 'Bouncy: syncopated toms, sixteenth shakers, a kalimba on A; ribbits, croaks and peeps hop around A.' },
  { name: 'Small lizards', nameIs: 'Litlu eðlurnar', startBeat: 120, beats: 16, feature: 'lizards',
    what: 'Quick and clicky: shime ghost notes, claps, a xylophone on C; the lizards chirp and sing on C.' },
  { name: 'Chorus 2', nameIs: 'Viðlag 2', startBeat: 136, beats: 32, feature: 'all',
    what: 'Her song again, a flute added an octave over the trumpets, the chant louder.' },
  { name: 'Small flyers', nameIs: 'Litlu flugdýrin', startBeat: 168, beats: 16, feature: 'flyers',
    what: 'High and light: the drums thin out, a flute and glockenspiel on D; trills and a curlew scooping up into D; the low end fades toward the quiet.' },
  { name: "Middle: Slóeðla's horn", nameIs: 'Horn Slóeðlu', startBeat: 184, beats: 32, feature: 'sloedla',
    what: 'Engines off: no drums, the filters closed; her horn calls her song phrase by phrase and the forest echoes each softly; one kalimba pluck swims in the echo; a didgeridoo drone and a pizzicato heartbeat come in; she stops on re, the do held back.' },
  { name: 'Riser', nameIs: 'Allir safnast saman', startBeat: 216, beats: 16, feature: 'all',
    what: 'The drums gather: quarters, eighths, sixteenths, a shime roll; the strings climb the pentatonic; a brass swell; the animals stack up low to high; a half-beat breath.' },
  { name: 'Final chorus (drop)', nameIs: 'Lokaviðlag', startBeat: 232, beats: 64, feature: 'all',
    what: 'The chorus bigger, twice: everyone, her horn on the tune, a piccolo an octave up, the full kit; the last phrase becomes a stop-time cadence, la - sol - mi - re on half notes over a bass walking Bb A G C.' },
  { name: 'Ending', nameIs: 'Endir', startBeat: 296, beats: 4, feature: 'all',
    what: 'DO: the last hit, everyone on F, the five animals singing their tones together; it rings out, no fade.' },
];

// ---------- chords ----------
const CH = {
  F: { bass: 41, pad: [57, 60, 65, 67], brass: [53, 57, 60, 65, 69] },
  Dm: { bass: 38, pad: [57, 60, 62, 65], brass: [50, 57, 62, 65, 69] },
  Bb: { bass: 46, pad: [58, 62, 65, 72], brass: [46, 58, 62, 65, 70] },
  C: { bass: 36, pad: [55, 60, 62, 67], brass: [48, 55, 60, 64, 67] },
  Gm7: { bass: 43, pad: [55, 58, 62, 65], brass: [43, 55, 58, 62, 65] },
  Am: { bass: 45, pad: [57, 60, 64, 67], brass: [45, 57, 60, 64, 69] },
  Csus4: { bass: 36, pad: [55, 60, 65, 67], brass: [48, 55, 60, 65, 67] },
  FA: { bass: 45, pad: [57, 60, 65, 69], brass: [45, 57, 60, 65, 69] },
};
const CHORUS_CHORDS = [['F'], ['Dm'], ['Bb'], ['C'], ['Dm'], ['C'], ['Bb', 'C'], ['F']];
/** The chord per bar (a bar may split in halves). */
const BARS = [
  ['F'], ['F'], ['Bb'], ['C'], // intro
  ['F'], ['C'], ['F'], ['Bb'], ['F'], ['C'], // parade
  ['F'], ['Bb'], ['F'], ['Bb'], // grazers
  ['Gm7'], ['C'], ['Gm7'], ['C'], // turtles
  ...CHORUS_CHORDS,
  ['Dm'], ['Am'], ['Dm'], ['F'], // frogs
  ['F'], ['Am'], ['F'], ['C'], // lizards
  ...CHORUS_CHORDS,
  ['Bb'], ['Gm7'], ['Bb'], ['Gm7'], // flyers
  ['Dm'], ['Bb'], ['F'], ['Csus4'], ['Dm'], ['Bb'], ['Gm7'], ['C'], // middle
  ['Bb'], ['Bb'], ['C'], ['C'], // riser
  ...CHORUS_CHORDS,
  ...CHORUS_CHORDS.slice(0, 6), ['Bb', 'FA'], ['Gm7', 'C'], // final; its last two bars are the cadence
  ['F'], // the last hit
];
/** The chord name sounding at `beat`. */
export function chordAt(beat) {
  const bar = Math.floor(beat / 4);
  const c = BARS[Math.min(bar, BARS.length - 1)];
  return c.length === 1 ? c[0] : c[(beat % 4) < 2 ? 0 : 1];
}

// ---------- the brightness arc: filters open as the energy grows and close in the middle ----------
const ARC = [[0, 0.35], [16, 0.78], [40, 0.78], [72, 0.9], [104, 1.0], [104.01, 0.88], [136, 0.95], [168, 1.05], [176, 0.95], [184, 0.5],
  [200, 0.5], [216, 0.58], [232, 1.15], [296, 1.22], [320, 1.22]];
export function bright(beat) {
  for (let i = 1; i < ARC.length; i++) {
    if (beat <= ARC[i][0]) {
      const [b0, v0] = ARC[i - 1], [b1, v1] = ARC[i];
      return v0 + (v1 - v0) * ((beat - b0) / (b1 - b0));
    }
  }
  return ARC[ARC.length - 1][1];
}

// ---------- the tune ----------
export const TONE_MIDI = { grazers: 65, turtles: 67, frogs: 69, lizards: 72, flyers: 74 };
/** Her song's rhythm inside one 8-bar chorus: [beat, group, beats]. */
const TUNE = [
  [0, 'lizards', 2], [2, 'frogs', 2],
  [8, 'turtles', 1], [9, 'frogs', 1], [10, 'grazers', 2],
  [16, 'flyers', 1], [17, 'lizards', 1], [18, 'frogs', 1], [19, 'lizards', 1.25],
  [24, 'flyers', 1], [25, 'lizards', 1], [26, 'frogs', 1], [27, 'turtles', 1], [28, 'grazers', 4],
];
const CADENCE = [[24, 'flyers', 2], [26, 'lizards', 2], [28, 'frogs', 2], [30, 'turtles', 2], [32, 'grazers', 3]];
{
  const flat = MELODY.flat();
  if (TUNE.map(t => t[1]).join() !== flat.join() || [...TUNE.slice(0, 9), ...CADENCE].map(t => t[1]).join() !== flat.join()) {
    throw new Error('smidur-b: the tune is not MELODY');
  }
}
/** Which take each group sings the tune with. */
const TUNE_TAKE = { grazers: 'moo', turtles: 'sing', frogs: 'ribbit', lizards: 'sing', flyers: 'trill' };

// ---------- patterns ----------
const VEL = { X: 1, x: 0.75, o: 0.5, q: 0.3, '-': 0.18 };
const pat = s => [...s].map((c, i) => [i, VEL[c] ?? 0]).filter(([, v]) => v > 0);

// ---------- building ----------
export function buildScore() {
  const events = [];
  const cues = [];
  const chorusMelody = [];
  const seedOf = (...p) => hash(...p.map(x => (typeof x === 'number' ? x.toFixed(3) : x)));
  const loopSafe = b => (b >= 16 && b < 40 ? b % 8 : b); // bars 5-10 render alike every 2 bars
  const add = (stem, beat, make, o = {}) => events.push({ stem, beat, make, g: o.g ?? 1, pan: o.pan ?? 0, hall: o.hall ?? 0, echo: o.echo ?? 0 });
  const cue = (beat, kind, extra = {}) => cues.push({ beat: +beat.toFixed(4), kind, ...extra });

  // drums
  const PANS = { taiko: 0, taiko2: 0, tomHi: 0.35, tomMid: 0.05, tomLo: -0.3, shime: 0.25, dum: -0.12, tek: 0.18, log: -0.32, shaker: 0.42, clap: 0, stomp: 0 };
  const HALL = { taiko: 0.3, taiko2: 0.25, tomHi: 0.28, tomMid: 0.28, tomLo: 0.28, shime: 0.18, dum: 0.22, tek: 0.25, log: 0.3, shaker: 0.12, clap: 0.3, stomp: 0.22 };
  const GAIN = { taiko: 0.95, taiko2: 0.8, tomHi: 0.55, tomMid: 0.6, tomLo: 0.62, shime: 0.3, dum: 0.55, tek: 0.4, log: 0.42, shaker: 0.22, clap: 0.45, stomp: 0.6 };
  function drum(name, beat, v, extra = {}) {
    const sd = seedOf(name, loopSafe(beat), v, extra.f ?? 0);
    const make = {
      taiko: () => D.taiko(v, sd),
      taiko2: () => D.taiko(v, sd, { f0: 49.0, decay: 1.2 }),
      tomHi: () => D.tom(v, sd, 196.0),
      tomMid: () => D.tom(v, sd, 146.83),
      tomLo: () => D.tom(v, sd, 110.0),
      shime: () => D.shime(v, sd),
      dum: () => D.frameDum(v, sd),
      tek: () => D.frameTek(v, sd),
      log: () => D.logDrum(v, sd, extra.f),
      shaker: () => D.shaker(v, sd, extra.alt),
      clap: () => D.clap(v, sd),
      stomp: () => D.stomp(v, sd),
    }[name];
    add('beat', beat, make, { g: (GAIN[name] ?? 0.5) * (extra.g ?? 1), pan: extra.pan ?? PANS[name], hall: HALL[name] });
  }
  /** One bar of a pattern string at bar start `b0`, scaled by `g`. */
  function bar(name, b0, s, g = 1, extra = {}) {
    for (const [step, v] of pat(s)) {
      const beat = b0 + step / 4;
      if (name === 'shaker') drum(name, beat, v * g, { alt: step % 2 === 1, ...extra });
      else drum(name, beat, Math.min(1, v * g), extra);
    }
  }
  const fill = (b0, g = 1, steps = '............xxXX') => {
    const toms = ['tomHi', 'tomHi', 'tomMid', 'tomLo'];
    for (const [step, v] of pat(steps)) drum(toms[(step - 12 + 4) % 4] ?? 'tomMid', b0 + step / 4, Math.min(1, v * g));
  };
  const logRiff = (b0, chord, s = '..o..o....o..o..', g = 1) => {
    const c = CH[chord];
    const notes = [c.pad[0], c.pad[2], c.pad[1], c.pad[3]].map(m => 440 * 2 ** ((m - 69) / 12));
    pat(s).forEach(([step, v], i) => drum('log', b0 + step / 4, v * g, { f: notes[i % notes.length] }));
  };

  // bass: the low-string ostinato, 3+3+2 accents
  const OST = [[0, 0, 1], [0.5, 0, 0.5], [1, 12, 0.72], [1.5, 0, 0.9], [2, 0, 0.5], [2.5, 12, 0.72], [3, 0, 0.9], [3.5, 7, 0.6]];
  function ostinato(b0, g = 1, { octaveDown = 0.45, up = 0, len = 0.42, from = 0, to = 4 } = {}) {
    for (const [t, iv, v] of OST) {
      if (t < from || t >= to) continue;
      const beat = b0 + t;
      const m = CH[chordAt(beat)].bass + iv + up;
      const sd = seedOf('ost', loopSafe(beat), m);
      const br = bright(beat);
      add('bass', beat, () => I.lowStrings(m, len * SEC, v * g, sd, { bright: br, octaveDown }), { g: 0.5, hall: 0.08 });
    }
  }
  function bowed(beat, beats, v, chord = chordAt(beat)) {
    const m = CH[chord].bass + 12;
    add('bass', beat, () => I.bowedBass(m, beats * SEC, v, seedOf('bow', beat, m), { bright: bright(beat) }), { g: 0.5, hall: 0.2 });
  }
  function subBass(beat, beats, v, chord = chordAt(beat)) {
    const m = CH[chord].bass - 12 < 28 ? CH[chord].bass : CH[chord].bass - 12;
    add('bass', beat, () => I.sub(m, beats * SEC - 0.03, v), { g: 0.35 });
  }

  // pad: the string section per bar (or half bar), a choir over it where asked
  function pad(beat, beats, v, { choir = 0, vowel = 'oo', chord = chordAt(beat) } = {}) {
    const br = bright(beat);
    for (const m of CH[chord].pad) {
      const sd = seedOf('pad', loopSafe(beat), m);
      add('pad', beat, () => I.padNote(m, beats * SEC, v, sd, { bright: br, xf: 0.3 }), { g: 0.42, hall: 0.35 });
      if (choir > 0) add('pad', beat, () => I.choirNote(m + (m < 60 ? 12 : 0), beats * SEC, choir, seedOf('choir', beat, m), { vowel, xf: 0.35 }), { g: 0.3, hall: 0.45 });
    }
  }
  const padBars = (b0, bars, v, o = {}) => {
    for (let k = 0; k < bars; k++) {
      const b = b0 + 4 * k;
      const c = BARS[b / 4];
      if (c.length === 1) pad(b, 4, v, o);
      else { pad(b, 2, v, { ...o, chord: c[0] }); pad(b + 2, 2, v, { ...o, chord: c[1] }); }
    }
  };

  // lead: brass, trumpets, her horn, the feature instruments
  function stab(beat, v, { beats = 0.38, chord = chordAt(beat), kind = 'stab', g = 1 } = {}) {
    const br = bright(beat);
    const sd = seedOf('stab', loopSafe(beat), chord);
    add('lead', beat, () => I.brassChord(CH[chord].brass, beats * SEC, v, sd, { kind, bright: br }), { g: 0.55 * g, hall: 0.28 });
  }
  function chantAt(beat, word, v) {
    const c = CH[chordAt(beat)];
    const notes = [c.brass[2], c.brass[3], c.brass[1]];
    add('lead', beat, () => I.chant(word, notes, v, seedOf('chant', loopSafe(beat), word)), { g: 0.5, hall: 0.3 });
  }
  function trumpet(beat, midi, beats, v, g = 1) {
    const sd = seedOf('tpt', loopSafe(beat), midi);
    const br = bright(beat);
    add('lead', beat, () => I.brassNote(midi, beats * SEC, v, sd, { kind: 'tpt', bright: br }), { g: 0.42 * g, pan: 0.08, hall: 0.25 });
    add('lead', beat, () => I.brassNote(midi - 12, beats * SEC, v * 0.8, sd + 1, { kind: 'tpt', bright: br * 0.8 }), { g: 0.22 * g, pan: -0.1, hall: 0.25 });
  }
  function hornNote(beat, group, beats, v, { echo = 0, hall = 0.35, g = 1 } = {}) {
    add('lead', beat, () => V.horn(group, beats * SEC, { v }), { g: 0.5 * g, pan: -0.05, hall, echo });
    cue(beat, 'horn', { group });
  }
  function animal(beat, group, id, o = {}) {
    const { from = 'start', steps = null, seconds = null, v = 1, g = 1, hall = 0.18, echo = 0 } = o;
    const secs = seconds ?? (steps ? steps * SEC / 4 : null);
    add('animals', beat, () => V.call(group, id, { from, seconds: secs, v }), { g: 0.62 * g, pan: V.PAN[group], hall, echo });
    cue(beat, 'call', { group });
  }

  // ---------- the chorus (8 bars at c) ----------
  function chorus(c, { level = 1, flute = 0, hornOn = false, cadence = false, piccolo = false, final = false } = {}) {
    const tune = cadence ? [...TUNE.slice(0, 9), ...CADENCE] : TUNE;
    for (const [t, group, beats] of tune) {
      const beat = c + t;
      const m = TONE_MIDI[group];
      chorusMelody.push({ group, beat });
      const short = beats <= 1;
      animal(beat, group, TUNE_TAKE[group], { seconds: short ? 0.9 * SEC : null, v: 1, g: final ? 1.05 : 1 });
      add('lead', beat, () => V.marimba(group, { seconds: Math.max(0.6, beats * SEC + 0.2), v: 1 }), { g: 0.34, pan: 0.05, hall: 0.2 });
      trumpet(beat, m, beats - 0.12, 0.8 * level, final ? 1.1 : 1);
      if (flute) add('lead', beat, () => I.flute(m + 12, (beats - 0.1) * SEC, 0.8, seedOf('fl', beat, m)), { g: 0.28 * flute, pan: 0.2, hall: 0.3 });
      if (piccolo && beats >= 2) add('lead', beat, () => I.glock(m + 12, 0.9, seedOf('gl', beat, m)), { g: 0.16, pan: 0.3, hall: 0.3 });
      if (hornOn) hornNote(beat, group, beats - 0.05, 1, { g: 0.9 });
    }
    // the answers: ba-BAP ... HEY / HO, the taiko on the shout
    const answers = cadence ? [[4, 'hey'], [12, 'ho'], [20, 'hey']] : [[4, 'hey'], [12, 'ho'], [20, 'hey']];
    for (const [a, word] of answers) {
      stab(c + a + 0.5, 0.75 * level);
      stab(c + a + 1, 0.85 * level);
      chantAt(c + a + 2, word, (final ? 0.85 : 0.65) * level);
      stab(c + a + 2, 0.9 * level, { beats: 0.3 });
      cue(c + a + 2, 'hit');
    }
    if (!cadence) stab(c + 28, 0.7 * level, { beats: 3.4, kind: 'swell', chord: 'F' });
    // drums: call bars in 3+3+2, answer bars hit on the shout and fill into the next phrase
    for (let k = 0; k < 8; k++) {
      const b = c + 4 * k;
      if (cadence && k >= 6) break;
      const call = k % 2 === 0;
      bar('taiko', b, call ? 'X.....x.....x...' : 'X.......X.......', level);
      if (final) bar('taiko2', b, call ? 'X...........x...' : 'X.......X.......', level * 0.9);
      bar('tek', b, '....X.......X...', level);
      bar('clap', b, '....X.......X...', level * (final ? 1 : 0.8));
      bar('stomp', b, final ? 'X.x.....X.x.....' : 'X.......X.......', level * 0.85);
      bar('shaker', b, 'oqxqoqxqoqxqoqxq', level * (final ? 1.1 : 1));
      bar('shime', b, final ? 'qqoqqqoqqqoqqqoq' : 'o.x.o.x.o.x.o.x.', level * 0.6);
      bar('dum', b, '..o..o....o..o..', level * 0.8);
      if (call) logRiff(b, chordAt(b), '...o..o...o..o..', level * 0.8);
      if (!call) fill(b, level * (k === 7 ? 1 : 0.8), k === 7 ? '........ooxxxxXX' : '............xxXX');
      // bass, pad
      const split = BARS[b / 4].length > 1;
      ostinato(b, level, { octaveDown: final ? 0.7 : 0.5 });
      if (final) { if (split) { subBass(b, 2, 0.55, BARS[b / 4][0]); subBass(b + 2, 2, 0.55, BARS[b / 4][1]); } else subBass(b, 4, 0.55); }
    }
    padBars(c, cadence ? 6 : 8, final ? 0.6 : 0.5, final ? { choir: 0.5, vowel: 'ah' } : {});
    cue(c, 'hit');
  }

  // =====================================================================
  // 1. Intro: the forest wakes (bars 1-4, beats 0-16)
  padBars(0, 4, 0.42);
  hornNote(2, 'lizards', 2, 0.8, { echo: 0.35, hall: 0.6, g: 0.75 });
  hornNote(4, 'frogs', 3.5, 0.8, { echo: 0.35, hall: 0.6, g: 0.75 });
  // the five wake, low to high, answering her
  animal(8, 'grazers', 'moo', { v: 0.7, hall: 0.4 });
  animal(9, 'turtles', 'sing', { v: 0.7, hall: 0.4 });
  animal(10, 'frogs', 'ribbit', { v: 0.7, hall: 0.4 });
  animal(11, 'lizards', 'sing', { v: 0.7, hall: 0.4 });
  animal(12, 'flyers', 'curlew', { v: 0.75, hall: 0.4 });
  // a heartbeat, the shakers wake, the bass bows
  bar('dum', 8, 'o.......o.......', 0.55);
  bar('dum', 12, 'o.......o...o...', 0.65);
  bar('shaker', 8, '....q...q...o...', 0.6);
  bar('shaker', 12, 'q.q.o.o.oqoqxqxq', 0.75);
  logRiff(12, 'C', '...o..o...o.....', 0.5);
  bowed(8, 4, 0.5, 'Bb');
  bowed(12, 4, 0.6, 'C');
  bar('taiko', 12, 'o.......o.......', 0.6);
  fill(12, 0.7, '........q.o.oxxX');
  cue(16, 'hit');

  // 2. Parade arrives (bars 5-10, beats 16-40); bars 7-10 are the loop
  for (let k = 0; k < 6; k++) {
    const b = 16 + 4 * k;
    const callBar = k % 2 === 0;
    const turn = k === 1 || k === 5; // b' (the C bars): HO and a fill
    bar('taiko', b, callBar ? 'X.....x.....x...' : 'X.......X.......', 0.85);
    bar('tek', b, '....x.......x...', 0.85);
    bar('shaker', b, 'oqxqoqxqoqxqoqxq', 0.85);
    bar('dum', b, '..o..o....o..o..', 0.7);
    bar('stomp', b, 'x...............', 0.7);
    if (callBar) logRiff(b, chordAt(b), '...o..o...o..o..', 0.7);
    ostinato(b, 0.85);
    pad(b, 4, 0.45);
    if (callBar) {
      trumpet(b, 72, 1.8, 0.7);
      trumpet(b + 2, 69, 1.8, 0.7);
      animal(b, 'grazers', 'moo', { from: 'hit', steps: 3, v: 0.55, g: 0.8 });
      animal(b + 2.5, 'frogs', 'ribbit', { v: 0.5, g: 0.8 });
    } else {
      stab(b + 0.5, 0.65);
      stab(b + 1, 0.75);
      chantAt(b + 2, turn ? 'ho' : 'hey', 0.55);
      stab(b + 2, 0.8, { beats: 0.3 });
      cue(b + 2, 'hit');
      animal(b + 1.5, 'lizards', 'chirp', { v: 0.5, g: 0.8 });
      animal(b + 1.75, 'lizards', 'chirp', { v: 0.4, g: 0.8 });
      animal(b + 3, 'flyers', 'trill', { from: 'hit', steps: 3, v: 0.45, g: 0.8 });
      if (turn) fill(b, 0.75);
    }
  }

  // 3. Grazers (bars 11-14, beats 40-56)
  const GRAZE = [
    [[0, 'start', 6], [8, 'hit', 2], [10, 'hit', 2], [12, 'hit', 4]],
    [[0, 'hit', 2], [3, 'hit', 2], [6, 'start', 6], [14, 'hit', 2]],
    [[0, 'start', 6], [8, 'hit', 2], [10, 'hit', 2], [12, 'hit', 4]],
    [[0, 'hit', 2], [3, 'hit', 2], [6, 'start', 4], [12, 'hit', 1], [13, 'hit', 1], [14, 'hit', 1], [15, 'hit', 1]],
  ];
  for (let k = 0; k < 4; k++) {
    const b = 40 + 4 * k;
    bar('taiko', b, 'X.....x.....x...', 1);
    bar('stomp', b, 'x...x...x...x...', 0.85);
    bar('tek', b, '....x.......x...', 0.8);
    bar('shaker', b, 'o.x.o.x.o.x.o.x.', 0.7);
    if (k === 3) fill(b, 0.8);
    ostinato(b, 0.95, { octaveDown: 0.75 });
    pad(b, 4, 0.36);
    const root = CH[chordAt(b)].bass;
    for (const [step, iv, len] of [[4, 0, 2], [6, 0, 2], [10, 7, 2], [12, 12, 3]]) {
      const beat = b + step / 4;
      add('lead', beat, () => I.brassNote(root + iv, len * SEC / 4, 0.8, seedOf('tuba', beat), { kind: 'tuba', bright: bright(beat) }), { g: 0.5, pan: -0.25, hall: 0.2 });
    }
    for (const [step, from, steps] of GRAZE[k]) animal(b + step / 4, 'grazers', 'moo', { from, steps, v: 1 });
  }

  // 4. Turtles (bars 15-18, beats 56-72)
  for (let k = 0; k < 4; k++) {
    const b = 56 + 4 * k;
    bar('taiko', b, 'X.......x.......', 0.85);
    bar('dum', b, '...o...o...o..o.', 0.8);
    bar('tek', b, '....x.......x...', 0.75);
    bar('shaker', b, 'o.x.o.x.o.x.o.x.', 0.75);
    logRiff(b, chordAt(b), '..o..o....o..o..', 0.8);
    if (k === 3) fill(b, 0.85);
    ostinato(b, 0.85);
    pad(b, 4, 0.38);
    const riff = chordAt(b) === 'Gm7' ? [[0, 55], [3, 62], [6, 55], [8, 58], [11, 62], [14, 55]] : [[0, 55], [3, 60], [6, 55], [8, 62], [11, 60], [14, 55]];
    for (const [step, m] of riff) add('lead', b + step / 4, () => I.lowMarimba(m, 0.8, seedOf('lmar', b + step / 4, m)), { g: 0.45, pan: -0.15, hall: 0.25 });
    const T = k < 3
      ? [[0, 'sing'], [6, 'groan'], [8, 'sing'], [11, 'groan', 2], [12, 'sing']]
      : [[0, 'sing'], [4, 'groan'], [8, 'sing'], [10, 'sing', 2], [12, 'sing'], [14, 'groan', 2]];
    for (const [step, id, steps] of T) animal(b + step / 4, 'turtles', id, { steps: steps ?? null, from: steps ? 'hit' : 'start', v: 1 });
  }

  // 5. Chorus 1 (bars 19-26, beats 72-104)
  chorus(72, { level: 0.95 });

  // 6. Frogs (bars 27-30, beats 104-120)
  const FROG = [
    [[0, 'ribbit'], [3, 'croak', 2], [6, 'ribbit'], [10, 'peep', 3], [12, 'croak', 2], [14, 'ribbit', 2]],
    [[0, 'peep', 2], [2, 'peep', 2], [4, 'ribbit'], [8, 'croak', 4], [12, 'ribbit'], [14, 'ribbit', 2]],
  ];
  for (let k = 0; k < 4; k++) {
    const b = 104 + 4 * k;
    bar('taiko', b, 'X.....x.........', 0.85);
    bar('tomHi', b, '..o.....o....o..', 0.8);
    bar('tomMid', b, '.....o.....o....', 0.8);
    bar('tek', b, '....X.......X...', 0.8);
    bar('shaker', b, 'oqxqoqxqoqxqoqxq', 0.85);
    bar('dum', b, '......o...o.....', 0.7);
    if (k === 3) fill(b, 0.85);
    ostinato(b, 0.85);
    pad(b, 4, 0.38);
    const ch = chordAt(b);
    const riff = ch === 'Am' ? [[0, 69], [3, 69], [4, 72], [6, 81], [8, 69], [10, 76], [11, 69], [14, 72]] : ch === 'F' ? [[0, 69], [3, 69], [4, 72], [6, 81], [8, 69], [10, 77], [11, 69], [14, 72]] : [[0, 69], [3, 69], [4, 72], [6, 81], [8, 69], [10, 74], [11, 69], [14, 72]];
    for (const [step, m] of riff) add('lead', b + step / 4, () => I.kalimba(m, step % 4 === 0 ? 0.85 : 0.65, seedOf('kal', b + step / 4, m)), { g: 0.4, pan: 0.12, hall: 0.25 });
    const P = k === 3 ? [[0, 'peep', 2], [2, 'peep', 2], [4, 'ribbit'], [8, 'croak', 4], [12, 'ribbit', 1], [13, 'ribbit', 1], [14, 'ribbit', 1], [15, 'ribbit', 1]] : FROG[k % 2];
    for (const [step, id, steps] of P) animal(b + step / 4, 'frogs', id, { steps: steps ?? null, from: steps ? 'hit' : 'start', v: 1 });
  }

  // 7. Small lizards (bars 31-34, beats 120-136)
  const LIZ = [
    [[0, 'sing', 3], [3, 'chirp'], [6, 'chirp'], [7, 'chirp'], [8, 'sing', 4], [12, 'chirp'], [14, 'chirp']],
    [[0, 'chirp'], [2, 'chirp'], [4, 'sing', 3], [8, 'chirp'], [10, 'chirp'], [11, 'chirp'], [12, 'sing', 4]],
  ];
  for (let k = 0; k < 4; k++) {
    const b = 120 + 4 * k;
    bar('taiko', b, 'X.......x.......', 0.85);
    bar('shime', b, 'qqoqqqoqqqoqqqoq', 0.75);
    bar('clap', b, '....X.......X...', 0.8);
    bar('tek', b, '....x.......x...', 0.7);
    bar('shaker', b, 'o.x.o.x.o.x.o.x.', 0.7);
    bar('dum', b, '..o.......o.....', 0.6);
    if (k === 3) fill(b, 0.85);
    ostinato(b, 0.85);
    pad(b, 4, 0.38);
    const riff = [[0, 84], [2, 79], [3, 84], [6, 81], [8, 84], [10, 86], [11, 84], [14, 79]];
    for (const [step, m] of riff) add('lead', b + step / 4, () => I.xylo(m, step % 4 === 0 ? 0.85 : 0.6, seedOf('xy', b + step / 4, m)), { g: 0.32, pan: 0.28, hall: 0.25 });
    for (const [step, id, steps] of LIZ[k % 2]) animal(b + step / 4, 'lizards', id, { steps: steps ?? null, from: 'start', v: id === 'chirp' ? 0.9 : 1 });
  }

  // 8. Chorus 2 (bars 35-42, beats 136-168)
  chorus(136, { level: 1, flute: 1 });

  // 9. Small flyers (bars 43-46, beats 168-184): lighter, the low end leaving
  const FLY = [
    [[0, 'curlew'], [4, 'trill', 4], [10, 'trill', 1, 'hit'], [11, 'trill', 1, 'hit'], [12, 'curlew']],
    [[0, 'trill'], [8, 'curlew'], [14, 'trill', 1, 'hit'], [15, 'trill', 1, 'hit']],
  ];
  for (let k = 0; k < 4; k++) {
    const b = 168 + 4 * k;
    const fade = 1 - 0.15 * k;
    if (k < 3) bar('taiko', b, 'X...............', 0.7 * fade);
    bar('tek', b, '....o.......o...', 0.9 * fade);
    bar('shaker', b, 'oqxqoqxqoqxqoqxq', 0.7 * fade);
    bar('shime', b, 'q.q.q.q.q.q.q.q.', 0.7 * fade);
    if (k < 3) bar('tomHi', b, '..........o..o..', 0.7 * fade);
    ostinato(b, 0.7 * fade, { octaveDown: 0, up: 12, to: k === 3 ? 2 : 4 });
    pad(b, 4, 0.4);
    const fl = [[0, 86, 3], [4, 84, 2], [6, 86, 2], [8, 81, 4], [12, 86, 4]];
    for (const [step, m, len] of fl) add('lead', b + step / 4, () => I.flute(m, (len / 4) * SEC * 0.95, 0.75, seedOf('fly', b + step / 4, m)), { g: 0.34, pan: 0.3, hall: 0.35 });
    add('lead', b, () => I.glock(86, 0.7, seedOf('gl', b)), { g: 0.2, pan: 0.4, hall: 0.4 });
    add('lead', b + 2.5, () => I.glock(81, 0.5, seedOf('gl', b + 2.5)), { g: 0.16, pan: 0.4, hall: 0.4 });
    for (const [step, id, steps, from] of FLY[k % 2]) animal(b + step / 4, 'flyers', id, { steps: steps ?? null, from: from ?? 'start', v: 1 });
  }

  // 10. Middle: Slóeðla's horn (bars 47-54, beats 184-216). Engines off.
  padBars(184, 8, 0.45, { choir: 0.32, vowel: 'oo' });
  for (let k = 0; k < 8; k++) bowed(184 + 4 * k, 4, k < 4 ? 0.32 : 0.38);
  const H = { echo: 0.38, hall: 0.55 };
  hornNote(184, 'lizards', 2, 1, H); hornNote(186, 'frogs', 2, 1, H);
  hornNote(192, 'turtles', 1, 1, H); hornNote(193, 'frogs', 1, 1, H); hornNote(194, 'grazers', 2, 1, H);
  hornNote(200, 'flyers', 1, 1, H); hornNote(201, 'lizards', 1, 1, H); hornNote(202, 'frogs', 1, 1, H); hornNote(203, 'lizards', 1, 1, H);
  hornNote(208, 'flyers', 1, 1, H); hornNote(209, 'lizards', 1, 1, H); hornNote(210, 'frogs', 1, 1, H); hornNote(211, 'turtles', 4.5, 1, H);
  const E = { v: 0.75, g: 0.7, hall: 0.5, echo: 0.3 };
  animal(188, 'lizards', 'sing', E); animal(189, 'frogs', 'ribbit', E);
  animal(196, 'turtles', 'sing', E); animal(197, 'frogs', 'ribbit', E); animal(198, 'grazers', 'moo', E);
  animal(204, 'flyers', 'trill', { ...E, seconds: 0.45 }); animal(205, 'lizards', 'sing', { ...E, seconds: 0.45 }); animal(206, 'frogs', 'ribbit', E); animal(207, 'lizards', 'sing', { ...E, seconds: 0.45 });
  animal(212, 'flyers', 'trill', { ...E, seconds: 0.45 }); animal(213, 'lizards', 'sing', { ...E, seconds: 0.45 }); animal(214, 'frogs', 'ribbit', E); animal(215, 'turtles', 'sing', E);
  for (const [beat, m] of [[190.5, 69], [199.5, 72], [206.5, 74], [214.5, 69]]) {
    add('lead', beat, () => I.kalimba(m, 0.6, seedOf('drop', beat), 0.9), { g: 0.4, pan: 0.25, hall: 0.5, echo: 0.5 });
  }
  add('lead', 200, () => V.drone(16 * SEC + 0.3, 77, { v: 1 }), { g: 0.2, pan: 0, hall: 0.3 });
  for (const beat of [200, 202, 204, 206, 208, 210, 212, 214]) {
    const m = CH[chordAt(beat)].bass + 12;
    add('bass', beat, () => I.pizz(m, 0.45, seedOf('pz', beat)), { g: 0.45, hall: 0.25 });
  }

  // 11. Riser (bars 55-58, beats 216-232): the drums gather, everyone stacks up, a half-beat breath
  cue(216, 'riser');
  bar('taiko', 216, 'o...o...o...o...', 0.55);
  bar('shime', 216, 'q.q.q.q.q.q.q.q.', 0.7);
  bar('taiko', 220, 'o.o.o.o.o.o.o.o.', 0.62);
  bar('shime', 220, 'qqqqqqqqqqqqqqqq', 0.75);
  bar('tomLo', 220, '......o.......o.', 0.6);
  bar('taiko', 224, 'x.o.x.o.x.o.x.o.', 0.75);
  bar('shime', 224, 'oooooooooooooooo', 0.85);
  bar('tomMid', 224, '.o.o.o.o.o.o.o.o', 0.7);
  bar('tomHi', 224, 'o.o.o.o.o.o.o.o.', 0.65);
  for (let i = 0; i < 28; i++) drum('shime', 228 + i / 8, 0.45 + 0.55 * (i / 27)); // the roll in 32nds, up to the breath
  bar('taiko', 228, 'x.x.x.x.X.X.X...', 0.9);
  bar('tomLo', 228, '.x.x.x.x.x.x.x..', 0.85);
  add('beat', 224, () => D.sweep(7.5 * SEC, 99), { g: 0.16, pan: 0, hall: 0.3 });
  ostinato(216, 0.5);
  ostinato(220, 0.62);
  for (let i = 0; i < 30; i++) {
    const beat = 224 + i / 4;
    const m = CH[chordAt(beat)].bass + (i % 2 ? 12 : 0);
    add('bass', beat, () => I.lowStrings(m, 0.2 * SEC, 0.6 + 0.35 * (i / 29), seedOf('rost', beat, m), { bright: bright(beat) }), { g: 0.5, hall: 0.08 });
  }
  padBars(216, 4, 0.5);
  stab(216, 0.55, { beats: 7.8, kind: 'swell', chord: 'Bb' });
  stab(224, 0.85, { beats: 7.4, kind: 'swell', chord: 'C' });
  const climb = [53, 55, 57, 60, 62, 65, 67, 69, 60, 62, 65, 67, 69, 72, 74, 77];
  climb.forEach((m, i) => add('lead', 216 + i / 2, () => I.lowStrings(m, 0.42 * SEC, 0.55 + 0.02 * i, seedOf('climb', i), { bright: 1, octaveDown: 0 }), { g: 0.3, pan: 0.2, hall: 0.3 }));
  const climb2 = [60, 62, 65, 67, 69, 72, 74, 77, 62, 65, 67, 69, 72, 74, 77, 79, 65, 67, 69, 72, 74, 77, 79, 81, 69, 72, 74, 77, 79, 81];
  climb2.forEach((m, i) => add('lead', 224 + i / 4, () => I.lowStrings(m, 0.22 * SEC, 0.7 + 0.01 * i, seedOf('climb2', i), { bright: 1.1, octaveDown: 0 }), { g: 0.3, pan: 0.2, hall: 0.3 }));
  for (const [beat, g, id, o] of [
    [216, 'grazers', 'moo', {}], [218, 'turtles', 'sing', {}],
    [220, 'grazers', 'moo', { from: 'hit', steps: 3 }], [221, 'turtles', 'sing', {}], [222, 'frogs', 'ribbit', {}], [223, 'frogs', 'ribbit', {}],
    [224, 'grazers', 'moo', { from: 'hit', steps: 2 }], [224.5, 'turtles', 'sing', { steps: 2 }], [225, 'frogs', 'ribbit', {}], [225.5, 'lizards', 'chirp', {}],
    [226, 'frogs', 'ribbit', {}], [226.5, 'lizards', 'chirp', {}], [227, 'flyers', 'trill', { from: 'hit', steps: 2 }], [227.5, 'flyers', 'trill', { from: 'hit', steps: 2 }],
    [228, 'grazers', 'moo', { from: 'hit', steps: 2 }], [228.5, 'turtles', 'sing', { steps: 2 }], [229, 'frogs', 'ribbit', { steps: 2 }], [229.5, 'lizards', 'sing', { steps: 2 }],
    [230, 'flyers', 'trill', { from: 'hit', steps: 2 }], [230.5, 'flyers', 'curlew', { steps: 3 }], [231, 'lizards', 'chirp', {}], [231.25, 'lizards', 'chirp', {}],
  ]) animal(beat, g, id, { v: 0.7 + 0.3 * ((beat - 216) / 16), ...o });

  // 12. The drop: the final chorus, twice, the second ending in the cadence
  cue(232, 'drop');
  chorus(232, { level: 1.05, flute: 1.2, hornOn: true, piccolo: true, final: true });
  chorus(264, { level: 1.08, flute: 1.2, hornOn: true, piccolo: true, final: true, cadence: true });
  // the cadence: stop-time hits on la, sol, mi, re (288, 290, 292, 294), toms rolling between, the bass walking Bb A G C
  for (const [beat, chord] of [[288, 'Bb'], [290, 'FA'], [292, 'Gm7'], [294, 'C']]) {
    drum('taiko', beat, 1);
    drum('taiko2', beat, 0.9);
    drum('stomp', beat, 0.85);
    drum('clap', beat, 0.7);
    stab(beat, 0.95, { beats: 1.2, chord });
    const m = CH[chord].bass;
    add('bass', beat, () => I.lowStrings(m, 1.4 * SEC, 1, seedOf('cad', beat), { bright: bright(beat), octaveDown: 0.8 }), { g: 0.5, hall: 0.1 });
    subBass(beat, 1.6, 0.6, chord);
    for (const [s, v] of pat('....oxxX')) drum(['tomHi', 'tomMid', 'tomLo', 'tomLo'][(s - 4) % 4], beat + s / 4, v * (0.75 + (beat - 288) / 24));
    drum('shime', beat + 1, 0.5);
    cue(beat, 'hit');
  }
  padBars(288, 1, 0.6, { choir: 0.5, vowel: 'ah' });
  pad(292, 2, 0.6, { choir: 0.5, vowel: 'ah', chord: 'Gm7' });
  pad(294, 2, 0.6, { choir: 0.5, vowel: 'ah', chord: 'C' });

  // 13. DO: the last hit
  const L = END_BEAT;
  drum('taiko', L, 1); drum('taiko2', L, 1); drum('stomp', L, 0.9); drum('tomLo', L, 0.8); drum('clap', L, 0.6);
  add('lead', L, () => I.brassChord([41, 53, 57, 60, 65, 69, 72], 2.4 * SEC, 1, seedOf('end'), { kind: 'tpt', bright: 1.1 }), { g: 0.6, hall: 0.4 });
  add('bass', L, () => I.lowStrings(41, 3 * SEC, 1, seedOf('endb'), { bright: 1, octaveDown: 0.9 }), { g: 0.5, hall: 0.2 });
  subBass(L, 3, 0.7, 'F');
  pad(L, 4, 0.6, { choir: 0.55, vowel: 'ah', chord: 'F' });
  add('lead', L, () => I.glock(77, 0.8, seedOf('endg')), { g: 0.18, pan: 0.3, hall: 0.5 });
  for (const g of ['turtles', 'frogs', 'lizards', 'flyers']) animal(L, g, TUNE_TAKE[g], { v: 0.9, hall: 0.35 }); // the grazers' do is the tune's
  cue(L, 'end');

  events.sort((a, b) => a.beat - b.beat);
  cues.sort((a, b) => a.beat - b.beat || a.kind.localeCompare(b.kind));
  return { events, cues, chorusMelody };
}
