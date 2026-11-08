// "Kúmbía við tjörnina": the score. An Amazonian cumbia (chicha) in G major at 98 bpm, with a Pacific-coast currulao turn in
// the middle where Slóeðla's horn leads the animals. Every note is placed on the desk here; cues and tune notes are logged.
import { SR } from './lib/io.mjs';
import { B, at, SPB, beatSec } from './lib/mix.mjs';
import * as I from './lib/inst.mjs';
import { call, TONE_MIDI } from './lib/takes.mjs';
import { rand, midiHz } from './lib/dsp.mjs';

// ---------------------------------------------------------------- the form
export const LOOP = { startBeat: B(9), beats: 16 }; // the Baile's second time round
const BAILE = [B(5), B(13)];
export const END_BEAT = B(63);
export const TAIL_SEC = 2.8;

export const SECTIONS = [
  { name: 'Intro', nameIs: 'Inngangur', bars: [1, 4], feature: null,
    what: 'Morning at the pond: a guacharaca scrapes alone, a curlew and a buzzard call from the reeds, the organ and the bass wake up and a twangy guitar run lifts the band in.' },
  { name: 'Groove', nameIs: 'Dansinn byrjar', bars: [5, 12], feature: null,
    what: 'The full cumbia groove: bass on the tresillo, the organ\'s "chucu" chords on every off-beat, congas, tambora and scraper, and the guitar\'s own riff, twice. The loop is the second time.' },
  { name: 'Her song', nameIs: 'Lagið hennar', bars: [13, 20], feature: null,
    what: 'The animals sing her tune, each note by its own group (the camera cuts to each singer), a marimba under them, and the guitar answers every phrase.' },
  { name: 'Grazers', nameIs: 'Grasbítar', bars: [21, 24], feature: 'grazers',
    what: 'The big plant-eaters stomp: the band turns heavy (bass on the half notes, a stomping drum), the herd moos do on the downbeats and the low guitar strings answer.' },
  { name: 'Turtles', nameIs: 'Skjaldbökur', bars: [25, 28], feature: 'turtles',
    what: 'Lazy and late: the groove thins to half-time drums and long organ chords, the turtles hum re on the off-beats and the guitar bends slowly like a turtle\'s neck.' },
  { name: 'Frogs', nameIs: 'Froskar', bars: [29, 32], feature: 'frogs',
    what: 'The scraper stops and the frogs become it: ribbits on every beat and in between, in the scraper\'s rhythm, while the congas hop and the guitar plucks thirds.' },
  { name: 'Lizards', nameIs: 'Smáeðlur', bars: [33, 36], feature: 'lizards',
    what: 'Quick and sharp: the little lizards chirp sol in the timbal-shell (cáscara) rhythm, a bell keeps time and the guitar runs in sixteenths.' },
  { name: 'Flyers', nameIs: 'Smáfuglar', bars: [37, 40], feature: 'flyers',
    what: 'The band opens up to the sky: long bass notes, a high organ, tremolo guitar, and the little flyers whistle and swoop la over it, then the electric band steps aside.' },
  { name: 'Her horn', nameIs: 'Hornið hennar', bars: [41, 48], feature: 'sloedla',
    what: 'The different part: the electric band rests and the old drums of the Pacific coast take over in a rolling three-feel (marimba, cununo drums, bombo, guasá, a 12/8 bell). Slóeðla plays each phrase of her song on her horn and the animals sing it back.' },
  { name: 'Rise', nameIs: 'Allir koma', bars: [49, 52], feature: null,
    what: 'Back to cumbia over her low didgeridoo horn on sol: the animals line up low to high, quarter notes, then eighths, faster and higher, the timbales roll, the guitar trembles upward, a breath of silence.' },
  { name: 'All together', nameIs: 'Allir saman', bars: [53, 60], feature: 'all',
    what: 'The top: her tune by every group at once with her horn, the marimba and both guitars in thirds, the cowbell and timbal shell over the full groove.' },
  { name: 'Ending', nameIs: 'Endir', bars: [61, 63], feature: 'all',
    what: 'The last phrase once more, the band answers "pa-pa-pa" and everyone lands together on one bright chord: all five tones at once and her horn on do.' },
];

// her tune (kept as she has it): sol mi / re mi do / la sol mi sol / la sol mi re do
export const TUNE = [
  ['lizards', 'frogs'],
  ['turtles', 'frogs', 'grazers'],
  ['flyers', 'lizards', 'frogs', 'lizards'],
  ['flyers', 'lizards', 'frogs', 'turtles', 'grazers'],
];
// where each phrase's notes fall, in eighths from the phrase's first bar (a growing tresillo: 0 3 | 0 3 6 | 0 3 6 8 | 0 3 6 8 11)
const TUNE_POS = [[0, 3], [0, 3, 6], [0, 3, 6, 8], [0, 3, 6, 8, 11]];

// ---------------------------------------------------------------- harmony
const CH = {
  G: { root: 43, fifth: 50, stab: [59, 62, 67], pad: [55, 59, 62, 67], strum: [43, 47, 50, 55, 59, 67] },
  C: { root: 48, fifth: 43, stab: [60, 64, 67], pad: [55, 60, 64, 67], strum: [48, 52, 55, 60, 64, 67] },
  D: { root: 50, fifth: 45, stab: [57, 62, 66], pad: [54, 57, 62, 66], strum: [50, 57, 62, 66, 69] },
  Em: { root: 40, fifth: 47, stab: [59, 64, 67], pad: [52, 59, 64, 67], strum: [40, 47, 52, 55, 59, 64] },
  Am: { root: 45, fifth: 52, stab: [57, 60, 64], pad: [57, 60, 64, 69], strum: [45, 52, 57, 60, 64] },
};
const SCALE = new Set([7, 9, 11, 0, 2, 4, 6]);
const approach = to => (SCALE.has((to - 1 + 120) % 12) ? to - 1 : to + 2);
/** The chord of each bar: one name, or [[q, name], ...]. */
const CHORDS = {};
const setBars = (from, names) => names.forEach((n, i) => (CHORDS[from + i] = n));
setBars(1, ['G', 'G', 'G', 'D']);
setBars(5, ['G', 'Em', 'C', 'D', 'G', 'Em', 'C', 'D']);
const SONG = ['G', 'Em', 'D', 'G', 'Em', 'G', 'C', [[0, 'D'], [1.5, 'G']]];
setBars(13, SONG);
setBars(21, ['G', 'C', 'G', 'C']);
setBars(25, ['Am', 'D', 'Am', 'D']);
setBars(29, ['G', 'Em', 'G', 'Em']);
setBars(33, ['G', 'D', 'G', 'D']);
setBars(37, ['C', 'Am', 'C', 'D']);
setBars(41, ['G', 'G', [[0, 'D'], [2, 'G']], [[0, 'D'], [2, 'G']], [[0, 'C'], [2, 'G']], [[0, 'C'], [2, 'G']], [[0, 'C'], [2, 'D'], [3, 'G']], [[0, 'C'], [2, 'D'], [3, 'G']]]);
setBars(49, ['D', 'D', 'D', 'D']);
setBars(53, SONG);
setBars(61, ['C', [[0, 'D'], [1.5, 'G']], 'G']);
const chordAt = (bar, q = 0) => {
  const c = CHORDS[bar];
  if (typeof c === 'string') return c;
  let name = c[0][1];
  for (const [qq, n] of c) if (q >= qq - 1e-9) name = n;
  return name;
};

// ---------------------------------------------------------------- the composer's hands
export function compose(desk) {
  const cues = [];
  const tuneNotes = [];
  const calls = []; // every animal call with its target, for the pitch check
  const cue = (beat, kind, extra = {}) => cues.push({ beat: +beat.toFixed(4), kind, ...extra });

  // keys: in the Baile both rounds share their random choices, so the loop is the same bar for bar
  const k = (inst, beat) => (beat >= BAILE[0] && beat < BAILE[1] ? `${inst}:b${((beat - BAILE[0]) % 16).toFixed(4)}` : `${inst}:${beat.toFixed(4)}`);
  const jit = (inst, beat, ms) => Math.round(((beat >= BAILE[0] && beat < BAILE[1] ? rand(k(inst, beat) + 'j', 0, ms) : rand(k(inst, beat) + 'j', -ms, ms)) / 1000) * SR);
  const vr = (inst, beat, lo, hi) => rand(k(inst, beat) + 'v', lo, hi);

  // the fader ride: each section's level, so the song breathes (the rise climbs beat by beat)
  const RIDE = [[1, -2], [5, -3.5], [13, -3], [21, -3.5], [25, -3], [29, -2.5], [33, -2], [37, -3], [41, -1.5], [49, -5], [53, 1.5]];
  const ride = beat => {
    const bar = Math.floor(beat / 4) + 1;
    if (bar >= 49 && bar <= 52) return -5 + 4 * ((beat - B(49)) / 16);
    let v = 0;
    for (const [b, d] of RIDE) if (bar >= b) v = d;
    return v;
  };
  const put = (stem, buf, beat, o = {}) => {
    const s = at(beat) + (o.shift ?? 0);
    const r = ride(beat) * (stem === 'animals' ? 0.5 : 1);
    const lift = stem === 'beat' ? o.lift ?? 9 : 0; // the hand percussion is the heart of cumbia: up front
    desk.put(stem, buf, s, { ...o, db: (o.db ?? 0) + r + lift, beatSample: at(beat) });
  };

  // ---------- percussion ----------
  const kick = (beat, vel = 1, db = -9) => put('beat', I.lowDrum(64, { vel, key: k('kick', beat), knock: 0.35 }), beat, { db, lift: 3, shift: jit('kick', beat, 2) });
  const stomp = (beat, vel = 1) => put('beat', I.lowDrum(52, { vel, t60: 0.5, knock: 0.7, key: k('stomp', beat) }), beat, { db: -10, lift: 3, send: 0.12 });
  const palo = (beat, vel = 1) => put('beat', I.woodClick(1150, { vel, key: k('palo', beat), t60: 0.05 }), beat, { db: -22, pan: -0.1, send: 0.1, shift: jit('palo', beat, 3) });
  const guiro = (beat, len, vel = 1) =>
    put('beat', I.scrape(len, { ridge: len > 0.1 ? 58 : 85, key: k('guiro', beat), vel }), beat, { db: -18, pan: 0.32, send: 0.08, shift: jit('guiro', beat, 3) });
  const guiroBeat = (beat, vel = 1) => {
    guiro(beat, 0.155, vel * vr('gv', beat, 0.9, 1));
    guiro(beat + 0.5, 0.05, 0.6 * vel * vr('gv', beat + 0.5, 0.85, 1));
    guiro(beat + 0.75, 0.045, 0.55 * vel * vr('gv', beat + 0.75, 0.85, 1));
  };
  const shaker = (beat, vel = 1) => put('beat', I.shake(0.07, { key: k('sh', beat), vel }), beat, { db: -28, pan: -0.38, send: 0.06, shift: jit('sh', beat, 4) });
  const shaker16 = (bar, vel = 1) => {
    for (let s = 0; s < 16; s++) shaker(B(bar, s / 4), vel * (s % 4 === 2 ? 1 : s % 2 ? 0.45 : 0.7) * vr('shv', B(bar, s / 4), 0.85, 1));
  };
  const shaker8 = (bar, vel = 1) => {
    for (let e = 0; e < 8; e++) shaker(B(bar, e / 2), vel * (e % 2 ? 1 : 0.6));
  };
  const llamador = (beat, vel = 1) =>
    put('beat', I.membrane(310, { t60: 0.14, slap: 0.15, key: k('ll', beat), vel }), beat, { db: -15, pan: 0.12, send: 0.1, shift: jit('ll', beat, 3) + Math.round(0.004 * SR) });
  const conga = (beat, type, vel = 1) => {
    const o = { key: k('cg' + type, beat), vel };
    const buf =
      type === 'O' ? I.membrane(228, { t60: 0.32, drop: 0.08, ...o }) :
      type === 'o' ? I.membrane(176, { t60: 0.36, drop: 0.08, ...o }) :
      type === 's' ? I.membrane(240, { t60: 0.07, slap: 1, ...o }) :
      type === 'h' ? I.membrane(200, { t60: 0.05, slap: 0, body: 0.6, ...o }) :
      I.membrane(260, { t60: 0.04, slap: 0.2, body: 0.4, ...o });
    put('beat', buf, beat, { db: type === 'h' || type === 't' ? -21 : -13, pan: -0.25, send: 0.12, shift: jit('cg', beat, 4) });
  };
  // a two-bar conga part in sixteenths
  const CONGA = ['h.t.s..Oh.t.s.OO', 'h.t.s..Oh.t.s.oo'];
  const congaBar = (bar, which, vel = 1) => {
    [...CONGA[which]].forEach((c, s) => c !== '.' && conga(B(bar, s / 4), c, vel * vr('cgv', B(bar, s / 4), 0.85, 1)));
  };
  const shell = (beat, vel = 1) => put('beat', I.woodClick(1650, { vel, key: k('shell', beat), t60: 0.035, noise: 0.9 }), beat, { db: -21, pan: 0.36, send: 0.1, shift: jit('shell', beat, 3) });
  const CASCARA = ['x.x.xx.x', '.xx.x.x.'];
  const timbal = (beat, vel = 1, hi = true) =>
    put('beat', I.membrane(hi ? 520 : 410, { t60: 0.45, drop: 0.04, slap: 0.2, key: k('tb', beat), vel, modes: [1, 1.5, 1.98, 2.44, 2.9], amps: [1, 0.6, 0.4, 0.3, 0.2] }), beat, { db: -16, pan: 0.3, send: 0.15 });
  const bell = (beat, vel = 1, mouth = false) => put('beat', I.cowbell({ vel, key: k('bell', beat), mouth, hz: 780 }), beat, { db: -25, pan: 0.18, send: 0.1, shift: jit('bell', beat, 3) });

  // ---------- bass ----------
  const bassNote = (midi, beat, beats, vel = 1, o = {}) =>
    put('bass', I.bass(midiHz(midi), beats * beatSec * 0.92, { vel, key: k('bass', beat), ...o }), beat, { db: -9, shift: jit('bass', beat, 2) });
  const bassCumbia = (bar, vel = 1, nextName = null) => {
    const c = CH[chordAt(bar)];
    const next = CH[nextName ?? chordAt(bar + 1, 0) ?? 'G'] ?? c;
    bassNote(c.root, B(bar, 0), 0.75, vel);
    bassNote(c.root, B(bar, 1.5), 0.4, 0.75 * vel);
    bassNote(c.fifth, B(bar, 2), 0.75, 0.9 * vel);
    bassNote(approach(next.root), B(bar, 3.5), 0.4, 0.7 * vel);
  };
  const bassHalf = (bar, vel = 1) => {
    const c = CH[chordAt(bar)];
    bassNote(c.root, B(bar, 0), 1.8, vel);
    bassNote(c.fifth, B(bar, 2), 1.8, 0.9 * vel);
  };

  // ---------- organ ----------
  const organHit = (notes, beat, beats, o = {}) => {
    const buf = I.organ(notes.map(midiHz), beats * beatSec, { key: k('org', beat), ...o });
    desk.putSub('organ', buf, at(beat) + jit('org', beat, 2), { db: (o.db ?? -15) + ride(beat), beatSample: at(beat) });
  };
  const chucu = (bar, vel = 1) => {
    for (let q = 0; q < 4; q++) {
      const c = CH[chordAt(bar, q + 0.5)];
      organHit(c.stab, B(bar, q + 0.5), 0.2, { db: -17 + 20 * Math.log10(vel), tone: 0.55 });
    }
  };
  const pad = (bar, beats = 4, o = {}) => {
    const c = CH[chordAt(bar, o.q ?? 0)];
    const notes = o.up ? c.pad.map(m => m + 12) : c.pad;
    organHit(notes, B(bar, o.q ?? 0), beats, { db: o.db ?? -24, tone: o.tone ?? 0.35, a: 0.05, r: 0.25, swell: o.swell ?? 0, vib: 9 });
  };

  // ---------- guitars ----------
  const gtr = (part, midi, beat, beats, o = {}) => {
    const hz = o.bend ? s => midiHz(midi + o.bend * Math.min(1, Math.max(0, (s - (o.bendAt ?? 0.08)) / (o.bendTime ?? 0.18)))) : midiHz(midi);
    let buf = I.ksString(hz, Math.max(0.06, beats * beatSec * 0.95), { key: k('g' + part + midi, beat), bright: o.bright ?? 0.72, pick: o.pick ?? 0.14, t60: o.t60 ?? 1.6, hard: 0.7, vel: o.vel ?? 1 });
    if (beats * beatSec > 0.35 && !o.noVib) buf = I.vibrato(buf, { cents: o.vib ?? 16, rate: 5.4, delay: 0.18 });
    desk.putSub('gtr' + part, buf, at(beat) + jit('g' + part, beat, 3), { db: (o.db ?? 0) + ride(beat), beatSample: at(beat) });
  };
  /** a line of [pos8, midi, dur8, opts] from a bar's start */
  const line = (part, bar, notes, o = {}) => notes.forEach(([p, m, d, oo]) => gtr(part, m + (o.oct ?? 0) * 12, B(bar, p / 2), d / 2, { ...o, ...oo }));
  /** the diatonic third above (or below) in G major */
  const third = (m, dir = 1) => {
    const steps = [];
    for (let x = m + dir; steps.length < 2; x += dir) if (SCALE.has(((x % 12) + 12) % 12)) steps.push(x);
    return steps[1];
  };
  const strum = (bar, q, name, beats = 2, o = {}) => {
    CH[name].strum.forEach((m, i) => gtr(2, m + 12, B(bar, q) + i * 0.012 / beatSec * (o.down === false ? -1 : 1) + (o.down === false ? 0.06 / beatSec : 0), beats, { vel: 0.5, noVib: true, db: -4, t60: 1.2 }));
  };

  // ---------- marimba ----------
  const marimbaTone = (group, beat, o = {}) => {
    const c = call('marimba', { group, octave: o.oct ?? 0, seconds: o.seconds ?? 1.2, fadeOut: 0.3 });
    put('lead', c.buf, beat, { db: o.db ?? -13, pan: o.pan ?? 0.05, send: 0.18, shift: -Math.round(c.onset * SR) });
  };
  const marimbaSynth = (midi, beat, o = {}) => put('pad', I.marimba(midiHz(midi), { vel: o.vel ?? 1, soft: o.soft ?? 0.4 }), beat, { db: o.db ?? -12, pan: o.pan ?? 0, send: 0.2, shift: jit('mar', beat, 4) });

  // ---------- the animals and her horn ----------
  const PAN = { grazers: -0.5, turtles: -0.25, frogs: 0, lizards: 0.25, flyers: 0.5 };
  const LEVEL = { grazers: -9.5, turtles: -9.5, frogs: -10, lizards: -11, flyers: -10 };
  const TRIM = { 'grazers-3': 0, 'grazers-2': -1, 'turtles-2': 0, 'frogs-5': 0, 'frogs-1': -2, 'frogs-2': -3, 'lizards-2': 0, 'lizards-3': -2, 'flyers-3': 0, 'flyers-2': -2 };
  const animal = (name, beat, o = {}) => {
    const c = call(name, { seconds: o.seconds ?? 0, fadeOut: o.fadeOut ?? 0.05 });
    const db = LEVEL[c.group] + (TRIM[name] ?? 0) + (o.db ?? 0);
    put('animals', c.buf, beat, { db, pan: (o.pan ?? PAN[c.group]) + (o.panJ ? rand(k('pan' + name, beat), -o.panJ, o.panJ) : 0), send: o.send ?? 0.18, shift: -Math.round(c.onset * SR) });
    if (!o.silentCue) cue(beat, 'call', { group: c.group });
    calls.push({ beat, name, group: c.group, target: c.target, onsetInBuf: c.onset, tune: !!o.tune });
    if (o.tune) tuneNotes.push({ group: c.group, beat: +beat.toFixed(4) });
    return c;
  };
  const MAIN = { grazers: 'grazers-3', turtles: 'turtles-2', frogs: 'frogs-5', lizards: 'lizards-2', flyers: 'flyers-3' };
  const SECOND = { grazers: 'grazers-2', turtles: null, frogs: 'frogs-1', lizards: 'lizards-3', flyers: 'flyers-2' };
  const HORN_MIDI = { grazers: 55, turtles: 57, frogs: 59, lizards: 62, flyers: 64 }; // her horn's octave: G3 A3 B3 D4 E4
  const horn = (group, beat, beats, o = {}) => {
    const c = call('horn-1', { group, octave: o.oct ?? 0, seconds: beats * beatSec + 0.12, fadeOut: 0.16 });
    put('lead', c.buf, beat, { db: o.db ?? -7, pan: 0, send: o.send ?? 0.22, shift: -Math.round(c.onset * SR) });
    cue(beat, 'horn', { group });
  };
  /** her tune, sung by the animals from bar `bar` (8 bars; or one phrase), each note by its group */
  const singTune = (bar, { phrases = [0, 1, 2, 3], double = false, marimba = true, withHorn = false, db = 0 } = {}) => {
    for (const p of phrases) {
      const pb = bar + 2 * (phrases.length === 1 ? 0 : p);
      TUNE[p].forEach((g, i) => {
        const beat = B(pb, TUNE_POS[p][i] / 2);
        const nextPos = TUNE_POS[p][i + 1] ?? 16;
        const dur = ((nextPos - TUNE_POS[p][i]) / 2) * beatSec;
        animal(MAIN[g], beat, { tune: true, db, seconds: Math.max(0.5, Math.min(1.3, dur + 0.25)), fadeOut: 0.12 });
        if (double && SECOND[g]) animal(SECOND[g], beat, { db: db - 3, silentCue: true, seconds: Math.max(0.35, Math.min(1.0, dur + 0.1)), fadeOut: 0.1 });
        if (marimba) marimbaTone(g, beat, { db: double ? -12 : -14 });
        if (withHorn) horn(g, beat, Math.min(3, (nextPos - TUNE_POS[p][i]) / 2) * 0.98, { db: -11 });
      });
    }
  };

  // ================================================================ 1. Intro (bars 1-4)
  for (let q = 0; q < 16; q++) guiroBeat(B(1, q), 1);
  animal('flyers-3', B(1, 2), { send: 0.35 });
  animal('flyers-2', B(2, 2.5), { send: 0.35, db: -2 });
  for (let bar = 2; bar <= 4; bar++) {
    palo(B(bar, 1.5), 0.7);
    palo(B(bar, 3.5), 0.7);
    for (let q = 0; q < 4; q++) llamador(B(bar, q + 0.5), bar === 2 ? 0.5 : 0.7);
  }
  shaker8(3, 0.6);
  shaker16(4, 0.8);
  pad(3, 4, { swell: 3.5, db: -24 });
  pad(4, 4, { db: -24 });
  bassNote(43, B(3, 0), 1.8, 0.8);
  bassNote(50, B(3, 2), 1.4, 0.7);
  bassNote(50, B(4, 0), 0.75, 0.85);
  bassNote(50, B(4, 1.5), 0.4, 0.7);
  bassNote(45, B(4, 2), 0.75, 0.8);
  bassNote(42, B(4, 3.5), 0.4, 0.75);
  kick(B(3, 0), 0.6);
  kick(B(4, 0), 0.7);
  kick(B(4, 2), 0.75);
  // the twang run that lifts the band in
  line(1, 4, [[3, 62, 1], [4, 64, 1], [5, 66, 1], [6, 69, 1], [7, 71, 1]], { vel: 0.9 });
  for (let s = 0; s < 4; s++) timbal(B(4, 3 + s / 4), 0.25 + 0.1 * s, s % 2 === 0);
  cue(B(5), 'hit');

  // ================================================================ groove helpers
  const groove = (bar, o = {}) => {
    if (o.kick !== false) { kick(B(bar, 0), 0.9); kick(B(bar, 2), 0.8); }
    if (o.palo !== false) { palo(B(bar, 1.75), 0.8); palo(B(bar, 3.5), 0.9); }
    if (o.guiro !== false) for (let q = 0; q < 4; q++) guiroBeat(B(bar, q), o.guiroVel ?? 1);
    if (o.llamador !== false) for (let q = 0; q < 4; q++) llamador(B(bar, q + 0.5), 0.85);
    if (o.conga !== false) congaBar(bar, (bar + 1) % 2, o.congaVel ?? 0.9);
    if (o.shaker !== false) shaker16(bar, o.shakerVel ?? 0.8);
    if (o.bass !== false) bassCumbia(bar, o.bassVel ?? 1);
    if (o.chucu !== false) chucu(bar, o.chucuVel ?? 1);
  };
  const GANCHO = [
    [[0, 71, 1], [1, 74, 1], [3, 79, 2], [5, 78, 1], [6, 76, 1], [7, 74, 1]],
    [[0, 76, 2.5], [3, 71, 1], [4, 74, 1.5], [6, 71, 1], [7, 67, 1]],
    [[0, 64, 1], [1, 67, 1], [3, 72, 2], [5, 71, 1], [6, 69, 1], [7, 67, 1]],
    [[0, 69, 2.5], [3, 66, 1], [4, 69, 1], [5, 74, 3]],
  ];

  // ================================================================ 2. Groove (bars 5-12)
  for (let bar = 5; bar <= 12; bar++) {
    groove(bar);
    line(1, bar, GANCHO[(bar - 5) % 4], { vel: 0.95 });
  }

  // ================================================================ 3. Her song (bars 13-20)
  for (let bar = 13; bar <= 20; bar++) groove(bar, { bass: bar !== 20, chucuVel: 0.85 });
  // bar 20: D then G with the tune's last do
  bassNote(50, B(20, 0), 0.75, 1);
  bassNote(43, B(20, 1.5), 1.2, 0.95);
  bassNote(50, B(20, 3), 0.4, 0.8);
  bassNote(42, B(20, 3.5), 0.4, 0.75);
  singTune(13);
  const ANSWERS = {
    14: [[2, 67, 0.5], [3, 71, 0.5], [4, 74, 1], [6, 76, 1.5]],
    16: [[3, 74, 1], [4, 71, 1], [5, 74, 1], [6, 79, 2]],
    18: [[3, 71, 0.5], [4, 74, 0.5], [5, 76, 1], [6, 74, 1], [7, 71, 1]],
    20: [[5, 74, 0.5], [6, 76, 0.5], [7, 79, 1]],
  };
  for (const [bar, notes] of Object.entries(ANSWERS)) line(1, +bar, notes, { vel: 0.9 });

  // ================================================================ 4a. Grazers (bars 21-24)
  for (let bar = 21; bar <= 24; bar++) {
    groove(bar, { kick: false, conga: false, llamador: false, bass: false, chucu: false, shakerVel: 0.6 });
    stomp(B(bar, 0), 1);
    stomp(B(bar, 2), 0.8);
    bassHalf(bar, 1);
    pad(bar, 4, { db: -27, tone: 0.45 });
  }
  cue(B(21), 'hit');
  animal('grazers-3', B(21, 0), { seconds: 1.4 });
  animal('grazers-3', B(22, 0), { seconds: 1.4 });
  animal('grazers-3', B(23, 0), { seconds: 1.1 });
  animal('grazers-2', B(23, 2.5), { seconds: 0.45 });
  animal('grazers-2', B(24, 0), { seconds: 0.4 });
  animal('grazers-2', B(24, 1), { seconds: 0.4 });
  animal('grazers-3', B(24, 2), { seconds: 1.2 });
  line(1, 21, [[4, 55, 1], [5, 57, 1], [6, 59, 1], [7, 62, 1]], { vel: 0.75, bright: 0.6 });
  line(1, 22, [[4, 60, 1], [5, 59, 1], [6, 57, 1], [7, 55, 1]], { vel: 0.75, bright: 0.6 });
  line(1, 23, [[4, 62, 1], [5, 59, 1], [6, 55, 2]], { vel: 0.75, bright: 0.6 });
  line(1, 24, [[5, 60, 1], [6, 64, 1], [7, 67, 1]], { vel: 0.75, bright: 0.6 });

  // ================================================================ 4b. Turtles (bars 25-28)
  for (let bar = 25; bar <= 28; bar++) {
    kick(B(bar, 0), 0.75);
    palo(B(bar, 2.5), 0.6);
    guiro(B(bar, 0), 0.2, 0.7);
    guiro(B(bar, 2), 0.2, 0.6);
    llamador(B(bar, 1.5), 0.7);
    llamador(B(bar, 3.5), 0.7);
    conga(B(bar, 1.75), 'O', 0.6);
    conga(B(bar, 3.75), 'o', 0.6);
    shaker8(bar, 0.5);
    const c = CH[chordAt(bar)];
    bassNote(c.root, B(bar, 0), 1.4, 0.95);
    bassNote(c.fifth, B(bar, 2), 1.2, 0.85);
    bassNote(approach(CH[chordAt(bar + 1) ?? 'G'].root), B(bar, 3.5), 0.4, 0.7);
    pad(bar, 4, { db: -25, tone: 0.3 });
  }
  cue(B(25), 'hit');
  animal('turtles-2', B(25, 1.5));
  animal('turtles-2', B(26, 1.5));
  animal('turtles-2', B(26, 3));
  animal('turtles-2', B(27, 1.5));
  animal('turtles-2', B(28, 1), { seconds: 0.55 });
  animal('turtles-2', B(28, 2), { seconds: 0.55 });
  animal('turtles-2', B(28, 3), { seconds: 0.7 });
  // the slow bends
  gtr(1, 69, B(26, 0), 1, { bend: 2, bendAt: 0.12, bendTime: 0.3, vel: 0.9 });
  line(1, 26, [[2, 69, 1], [3, 66, 1.5]], { vel: 0.85 });
  gtr(1, 76, B(28, 0), 1, { bend: 2, bendAt: 0.12, bendTime: 0.3, vel: 0.9 });
  line(1, 28, [[2, 74, 1], [3, 72, 0.5], [4, 69, 2]], { vel: 0.85 });

  // ================================================================ 4c. Frogs (bars 29-32)
  for (let bar = 29; bar <= 32; bar++) groove(bar, { guiro: false, congaVel: 1.05 });
  for (let bar = 29; bar <= 32; bar++) {
    // the frogs are the scraper: long, short, short on each beat (varied bar by bar)
    const last = bar === 32;
    for (let q = 0; q < 4; q++) {
      const b = B(bar, q);
      if (q === 0) animal('frogs-1', b, { seconds: 0.42, panJ: 0.15 });
      else animal('frogs-5', b, { seconds: 0.28, panJ: 0.15 });
      if (q === 1 || q === 3 || last) animal('frogs-2', b + 0.5, { seconds: 0.16, db: -2, panJ: 0.2 });
      if ((q === 3 && bar % 2 === 0) || (last && q >= 2)) animal('frogs-2', b + 0.75, { seconds: 0.13, db: -3, panJ: 0.2 });
    }
    // the scraper's own shimmer, much quieter, so the frogs lead
    for (let q = 0; q < 4; q++) guiro(B(bar, q), 0.12, 0.35);
  }
  cue(B(29), 'hit');
  const T = (m, n) => [n[0], m, n[2]];
  line(1, 30, [[5, 76, 0.5], [6, 74, 0.5], [7, 71, 1]], { vel: 0.8, noVib: true });
  line(2, 30, [[5, 76, 0.5], [6, 74, 0.5], [7, 71, 1]].map(n => T(third(n[1], -1), n)), { vel: 0.7, noVib: true });
  line(1, 32, [[4, 74, 0.5], [5, 72, 0.5], [6, 71, 0.5], [7, 69, 1]], { vel: 0.8, noVib: true });
  line(2, 32, [[4, 74, 0.5], [5, 72, 0.5], [6, 71, 0.5], [7, 69, 1]].map(n => T(third(n[1], -1), n)), { vel: 0.7, noVib: true });

  // ================================================================ 4d. Lizards (bars 33-36)
  for (let bar = 33; bar <= 36; bar++) {
    groove(bar, {});
    for (let q = 0; q < 4; q++) bell(B(bar, q), q === 0 ? 0.9 : 0.6, q % 2 === 1);
  }
  cue(B(33), 'hit');
  for (let bar = 33; bar <= 36; bar++) {
    [...CASCARA[(bar - 33) % 2]].forEach((c, e) => {
      if (c !== 'x') return;
      const long = (e === 0 && bar % 2 === 1) || (bar === 36 && e === 6);
      animal(long ? 'lizards-2' : 'lizards-3', B(bar, e / 2), long ? { seconds: 0.5 } : { db: 0, panJ: 0.12 });
    });
  }
  const RUN = (bar, ns) => ns.forEach((m, i) => m && gtr(1, m, B(bar, 2 + i / 4), 0.25, { vel: 0.75, noVib: true, t60: 0.9 }));
  RUN(34, [69, 71, 69, 66, 69, 71, 74, 76]);
  RUN(36, [74, 76, 74, 71, 69, 71, 74, 78]);

  // ================================================================ 4e. Flyers (bars 37-40)
  for (let bar = 37; bar <= 40; bar++) {
    kick(B(bar, 0), 0.7);
    palo(B(bar, 3.5), 0.6);
    guiro(B(bar, 0), 0.18, 0.6);
    guiro(B(bar, 2), 0.18, 0.5);
    llamador(B(bar, 1.5), 0.6);
    llamador(B(bar, 3.5), 0.6);
    shaker8(bar, 0.5);
    const c = CH[chordAt(bar)];
    bassNote(c.root, B(bar, 0), 2.6, 0.85);
    bassNote(c.fifth, B(bar, 3), 0.9, 0.7);
    pad(bar, 4, { up: true, db: -25, tone: 0.3, swell: bar === 37 ? 2 : 0 });
  }
  cue(B(37), 'hit');
  animal('flyers-3', B(37, 0), { send: 0.4 });
  animal('flyers-2', B(37, 2), { send: 0.4 });
  animal('flyers-3', B(38, 0), { send: 0.4 });
  animal('flyers-2', B(38, 2.5), { send: 0.4 });
  animal('flyers-3', B(39, 0), { send: 0.4 });
  animal('flyers-3', B(39, 1), { send: 0.4, seconds: 0.35, db: -2 });
  animal('flyers-2', B(39, 2), { send: 0.4 });
  animal('flyers-2', B(40, 0), { send: 0.4 });
  animal('flyers-3', B(40, 1.5), { send: 0.4, seconds: 0.4 });
  // tremolo guitar soaring
  const trem = (m, from, beats, vel = 0.5) => {
    for (let s = 0; s < beats * 4; s++) gtr(1, m, from + s / 4, 0.25, { vel: vel * (s % 2 ? 0.8 : 1), noVib: true, t60: 0.8, bright: 0.8 });
  };
  trem(76, B(37, 0), 2); trem(79, B(37, 2), 2);
  trem(81, B(38, 0), 3); trem(79, B(38, 3), 1);
  trem(79, B(39, 0), 2); trem(76, B(39, 2), 2);
  trem(78, B(40, 0), 2);
  line(1, 40, [[4, 76, 1], [5, 74, 1], [6, 71, 1], [7, 69, 1.5]], { vel: 0.8 });

  // ================================================================ 5. Her horn: marimba and drums in three (bars 41-48)
  const tri = (bar, t) => B(bar, t / 3);
  cue(B(41), 'hit');
  const PH_T = [[0, 6], [0, 3, 6], [0, 3, 6, 9], [0, 3, 6, 8, 9]];
  const PH_LEN = [[6, 6], [3, 3, 6], [3, 3, 3, 3], [3, 3, 2, 1, 3]];
  for (let bar = 41; bar <= 48; bar++) {
    // bombo and the 12/8 bell
    put('beat', I.lowDrum(70, { vel: 0.9, t60: 0.45, knock: 0.3, key: k('bombo', B(bar)) }), B(bar, 0), { db: -12, lift: 3 });
    put('beat', I.lowDrum(76, { vel: 0.55, t60: 0.3, knock: 0.3, key: k('bombo2', B(bar)) }), tri(bar, 6), { db: -14, lift: 3 });
    [0, 2, 4, 5, 7, 9, 11].forEach(t => put('beat', I.woodClick(2100, { vel: t === 0 ? 0.9 : 0.65, key: k('cl', tri(bar, t)), t60: 0.05 }), tri(bar, t), { db: -24, pan: 0.3, send: 0.15, shift: jit('cl', tri(bar, t), 3) }));
    // cununos: hembra open on each beat's last triplet, macho slap on 2 and 4
    [2, 5, 8, 11].forEach(t => put('beat', I.membrane(205, { t60: 0.3, drop: 0.1, key: k('cun', tri(bar, t)), vel: 0.8 }), tri(bar, t), { db: -14, pan: -0.28, send: 0.15, shift: jit('cun', tri(bar, t), 4) }));
    [3, 9].forEach(t => put('beat', I.membrane(265, { t60: 0.08, slap: 0.9, key: k('cunm', tri(bar, t)), vel: 0.7 }), tri(bar, t), { db: -16, pan: -0.15, send: 0.15 }));
    // guasá on every triplet
    for (let t = 0; t < 12; t++) put('beat', I.shake(0.09, { key: k('gua', tri(bar, t)), vel: t % 3 === 0 ? 0.9 : 0.5, tone: 5200, attack: 0.02 }), tri(bar, t), { db: -28, pan: 0.42, send: 0.08 });
    // marimba: bordón (low, synthesised) on 0 and 2 of each beat, tiple (the real marimba) on 1 and 2
    for (let q = 0; q < 4; q++) {
      const c = CH[chordAt(bar, q)];
      const low = c.root < 45 ? c.root + 12 : c.root; // G2 → G3 etc.
      marimbaSynth(low, tri(bar, 3 * q), { vel: 0.95, soft: 0.5, db: -15, pan: -0.15 });
      marimbaSynth(c.fifth < low ? c.fifth + 12 : c.fifth, tri(bar, 3 * q + 2), { vel: 0.7, soft: 0.5, db: -17, pan: -0.15 });
      const hi = c.stab.map(m => m + 12);
      marimbaSynth(hi[(q + bar) % 3], tri(bar, 3 * q + 1), { vel: 0.6, soft: 0.3, db: -19, pan: 0.2 });
    }
  }
  for (let p = 0; p < 4; p++) {
    const hb = 41 + 2 * p;
    TUNE[p].forEach((g, i) => {
      horn(g, tri(hb, PH_T[p][i]), (PH_LEN[p][i] / 3) * 0.95, { db: -14, send: 0.3 });
      const ab = tri(hb + 1, PH_T[p][i]);
      animal(MAIN[g], ab, { tune: true, seconds: Math.max(0.45, Math.min(1.2, (PH_LEN[p][i] / 3) * beatSec + 0.2)), fadeOut: 0.12 });
      marimbaTone(g, ab, { db: -15 });
    });
  }

  // ================================================================ 6. Rise (bars 49-52)
  cue(B(49), 'rise');
  // her low horn: the didgeridoo on sol, held across the four bars in overlapping breaths
  {
    const breaths = [B(49, 0), B(50, 0), B(51, 0), B(52, 0)];
    breaths.forEach((b, i) => {
      const c = call('horn-2', { group: 'lizards' });
      const buf = Float32Array.from(c.buf);
      const fi = Math.round((i ? 0.3 : 0.12) * SR), fo = Math.round(0.45 * SR);
      for (let j = 0; j < fi; j++) buf[j] *= Math.sin((Math.PI / 2) * (j / fi));
      for (let j = 0; j < fo; j++) buf[buf.length - 1 - j] *= Math.sin((Math.PI / 2) * (j / fo));
      put('lead', buf, b, { db: -10 + 1.5 * i, pan: 0, send: 0.15, shift: -Math.round((i ? 0.3 : 0) * SR) });
    });
    cue(B(49), 'horn', { group: 'lizards' });
  }
  for (let bar = 49; bar <= 52; bar++) {
    const lift = (bar - 49) / 3; // 0..1
    const stopAt = bar === 52 ? 3.5 : 4;
    for (let q = 0; q < stopAt; q++) kick(B(bar, q), 0.55 + 0.35 * lift);
    for (let q = 0; q < 4 && q < stopAt; q++) guiroBeat(B(bar, q), 0.8 + 0.2 * lift);
    for (let q = 0; q < 4; q++) if (q + 0.5 < stopAt) llamador(B(bar, q + 0.5), 0.6 + 0.3 * lift);
    if (bar >= 50) for (let s = 0; s < stopAt * 4; s++) shaker(B(bar, s / 4), (0.4 + 0.4 * lift) * (s % 2 ? 0.6 : 1));
    if (bar >= 50) [...CONGA[bar % 2]].forEach((c, s) => c !== '.' && s / 4 < stopAt && conga(B(bar, s / 4), c, 0.7 + 0.3 * lift));
    for (let e = 0; e < stopAt * 2; e++) bassNote(e % 2 ? 50 : 50, B(bar, e / 2), 0.4, (0.7 + 0.3 * lift) * (e % 2 ? 0.8 : 1));
    organHit(CH.D.pad.map(m => m + (bar >= 51 ? 12 : 0)), B(bar, 0), bar === 52 ? 3.4 : 4, { db: -23 + 4 * lift, tone: 0.3 + 0.4 * lift, a: 0.1, r: bar === 52 ? 0.04 : 0.2, vib: 9 });
  }
  // the timbales roll up, softly
  for (let e = 0; e < 4; e++) timbal(B(51, 2 + e / 2), 0.25 + 0.05 * e, e % 2 === 0);
  for (let s = 0; s < 14; s++) timbal(B(52, s / 4), 0.25 + 0.03 * s, s % 2 === 0);
  put('pad', I.riser(3.5 * beatSec, { key: 'riser', vel: 1 }), B(52, 0), { db: -26, send: 0.3 });
  // the guitar trembles upward
  trem(69, B(51, 0), 2, 0.34); trem(71, B(51, 2), 2, 0.38);
  trem(74, B(52, 0), 2, 0.41); trem(76, B(52, 2), 1, 0.45); trem(78, B(52, 3), 0.5, 0.49);
  // the animals line up, low to high, faster and higher
  const ORDER = ['grazers', 'turtles', 'frogs', 'lizards', 'flyers'];
  const LADDER = { grazers: 'grazers-3', turtles: 'turtles-2', frogs: 'frogs-5', lizards: 'lizards-2', flyers: 'flyers-2' };
  const PENTA = [55, 57, 59, 62, 64]; // G3 A3 B3 D4 E4 for the marimba's octaves
  let li = 0;
  const step = (beat, secs, oct) => {
    const g = ORDER[li % 5];
    animal(LADDER[g], beat, { seconds: secs, fadeOut: 0.06 });
    marimbaSynth(PENTA[li % 5] + 12 * oct, beat, { vel: 0.8, soft: 0.3, db: -14, pan: 0.1 });
    li++;
  };
  for (let q = 0; q < 4; q++) step(B(49, q), 0.55, 1);
  step(B(50, 0), 0.55, 1);
  li = 0;
  for (let e = 2; e < 7; e++) step(B(50, e / 2), 0.3, 1);
  li = 0;
  for (let e = 0; e < 8; e++) step(B(51, e / 2), 0.28, 1 + Math.floor(e / 5));
  li = 3;
  for (let e = 0; e < 7; e++) step(B(52, e / 2), 0.26, 2 + Math.floor((e + 3) / 5) - 1);

  // ================================================================ 7. All together (bars 53-60)
  cue(B(53), 'peak');
  for (let bar = 53; bar <= 60; bar++) {
    groove(bar, { bass: bar !== 60, shakerVel: 0.9, congaVel: 1 });
    pad(bar, 4, { db: -26, tone: 0.3 });
    CASCARA[(bar - 53) % 2].split('').forEach((c, e) => c === 'x' && shell(B(bar, e / 2), 0.8));
    for (let q = 0; q < 4; q++) bell(B(bar, q), q === 0 ? 0.9 : 0.55, q % 2 === 1);
  }
  bassNote(50, B(60, 0), 0.75, 1);
  bassNote(43, B(60, 1.5), 1.2, 0.95);
  bassNote(50, B(60, 3), 0.4, 0.8);
  bassNote(47, B(60, 3.5), 0.4, 0.75);
  singTune(53, { double: true, withHorn: true });
  // answers in thirds
  for (const [bar, notes] of Object.entries(ANSWERS)) {
    const b = +bar + 40;
    if (b > 56) continue;
    line(1, b, notes, { vel: 0.9, db: 2 });
    line(2, b, notes.map(n => T(third(n[1], -1), n)), { vel: 0.75, db: 2 });
  }
  // bars 57-60: the guitars play the tune too, in thirds an octave over the animals' marimba
  const TUNE_MIDI = { grazers: 67, turtles: 69, frogs: 71, lizards: 74, flyers: 76 };
  for (const p of [2, 3]) {
    const pb = 57 + 2 * (p - 2);
    TUNE[p].forEach((g, i) => {
      const pos = TUNE_POS[p][i];
      const dur = ((TUNE_POS[p][i + 1] ?? 16) - pos) / 2;
      const m = TUNE_MIDI[g] + 12;
      gtr(1, m, B(pb, pos / 2), Math.min(dur, 2), { vel: 0.8, db: 2 });
      gtr(2, third(m, -1), B(pb, pos / 2), Math.min(dur, 2), { vel: 0.65, db: 2 });
    });
  }
  // the flyers' descant on the last four bars
  animal('flyers-2', B(57, 2.5), { db: -4, send: 0.3 });
  animal('flyers-2', B(59, 2.5), { db: -4, send: 0.3 });

  // ================================================================ 8. Ending (bars 61-63)
  for (let bar = 61; bar <= 62; bar++) {
    const stop = bar === 62 ? 2.5 : 4;
    kick(B(bar, 0), 0.9);
    if (stop > 2) kick(B(bar, 2), 0.8);
    for (let q = 0; q < stop; q++) guiroBeat(B(bar, q), 1);
    for (let q = 0; q < 4; q++) if (q + 0.5 < stop) llamador(B(bar, q + 0.5), 0.85);
    for (let s = 0; s < stop * 4; s++) shaker(B(bar, s / 4), 0.8 * (s % 2 ? 0.6 : 1));
    for (let q = 0; q < 4; q++) if (q + 0.5 < stop) organHit(CH[chordAt(bar, q + 0.5)].stab, B(bar, q + 0.5), 0.2, { db: -17, tone: 0.55 });
    for (let q = 0; q < 4; q++) if (q < stop) bell(B(bar, q), q === 0 ? 0.9 : 0.55, q % 2 === 1);
  }
  bassCumbia(61, 1, 'D');
  bassNote(50, B(62, 0), 0.75, 1);
  bassNote(43, B(62, 1.5), 0.9, 0.95);
  singTune(61, { phrases: [3], double: true, withHorn: true });
  TUNE[3].forEach((g, i) => {
    const pos = TUNE_POS[3][i];
    const dur = ((TUNE_POS[3][i + 1] ?? 13) - pos) / 2;
    gtr(1, TUNE_MIDI[g] + 12, B(61, pos / 2), Math.min(dur, 2), { vel: 0.8 });
    gtr(2, third(TUNE_MIDI[g] + 12, -1), B(61, pos / 2), Math.min(dur, 2), { vel: 0.65 });
  });
  // "pa-pa-pa": three short band hits, then everyone lands
  for (const q of [2.5, 3, 3.5]) {
    organHit(CH.G.stab, B(62, q), 0.18, { db: -15, tone: 0.6 });
    strum(62, q, 'G', 0.2);
    conga(B(62, q), q === 3.5 ? 's' : 'O', 0.9);
    bassNote(q === 3 ? 47 : 43, B(62, q), 0.3, 0.9);
    cue(B(62, q), 'hit');
  }
  kick(B(62, 3), 0.7);
  const FIN = B(63, 0);
  cue(FIN, 'end');
  kick(FIN, 0.9);
  bassNote(43, FIN, 3.2, 1);
  organHit([55, 59, 62, 64, 69, 71], FIN, 3.4, { db: -17, tone: 0.5, a: 0.015, r: 0.9 });
  strum(63, 0, 'G', 3.5);
  put('beat', I.scrape(0.42, { ridge: 50, key: 'finscrape' }), FIN, { db: -20, pan: 0.3, send: 0.2 });
  timbal(FIN, 0.5, false);
  bell(FIN, 0.7);
  for (const g of ORDER) {
    animal(MAIN[g], FIN, { seconds: 1.6, fadeOut: 0.5, db: -3 });
  }
  horn('grazers', FIN, 3.6, { db: -12, send: 0.3 });
  marimbaTone('grazers', FIN, { db: -13, seconds: 2.2 });
  marimbaTone('lizards', FIN, { db: -15, seconds: 2.2 });

  return { cues: cues.sort((a, b) => a.beat - b.beat), tuneNotes: tuneNotes.sort((a, b) => a.beat - b.beat), calls };
}

/** Process the sub-buses into their stems (guitars: pickup, spring, chorus; organ: a beat-locked chorus). */
export function finish(desk) {
  const tempoHz = 1 / (2 * beatSec); // one cycle every two beats: locked to the grid, so the loop repeats exactly
  for (const [name, pan, db] of [['gtr1', -0.32, -9], ['gtr2', 0.34, -11]]) {
    const bus = desk.subs[name];
    if (!bus) continue;
    I.pickup(bus, { drive: 1.7 });
    const spring = springOf(bus);
    const L = new Float32Array(desk.n), R = new Float32Array(desk.n);
    const a = ((pan + 1) * Math.PI) / 4;
    const gl = Math.cos(a), gr = Math.sin(a);
    for (let t = 0; t < desk.n; t++) {
      L[t] = bus[t] * gl + spring[t] * 0.22 * gr;
      R[t] = bus[t] * gr + spring[t] * 0.22 * gl;
    }
    desk.addStereo('lead', L, R, { db, send: 0.12 });
  }
  const org = desk.subs.organ;
  if (org) {
    const [L, R] = chorusLocked(org, tempoHz);
    desk.addStereo('pad', L, R, { db: 0, send: 0.2 });
  }
}

import { springReverb, biquad } from './lib/dsp.mjs';
function springOf(bus) {
  return springReverb(bus, { decay: 0.8, delay: 0.031, tone: 3800, chirp: 0.6, stages: 10 });
}
function chorusLocked(input, rate) {
  const n = input.length;
  const L = new Float32Array(n), R = new Float32Array(n);
  const base = 0.011 * SR, depth = 0.0022 * SR;
  const lp = biquad('lp', 5200, 0.7);
  const lp2 = biquad('lp', 5200, 0.7);
  for (let t = 0; t < n; t++) {
    const ph = (2 * Math.PI * rate * t) / SR;
    for (const [out, off, f] of [[L, 0, lp], [R, Math.PI / 2, lp2]]) {
      const p = t - (base + depth * Math.sin(ph + off));
      const i = Math.floor(p);
      const fr = p - i;
      const a = i >= 0 ? input[i] : 0, b = i + 1 >= 0 ? input[i + 1] ?? 0 : 0;
      out[t] = f(input[t] * 0.7 + (a + (b - a) * fr) * 0.55);
    }
  }
  return [L, R];
}

export { SPB };
