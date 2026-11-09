// djamm-1: "Stóra sviðið" rebuilt on the real disco-funk track (remake/assets/audio/sloedla/v2/djamm). The music is the band's
// own six stems, re-arranged bar by bar like a DJ would (mutes, filters, beat repeats, rolls cut from its own drums, a last hit);
// the animals and her horn sing over it in the track's own key. Everything is placed in beats on one grid: 125 bpm, beat 0 at
// 0 s, 21168 samples a beat. The track's own grid: its beat k sits at 27.2 ms + k * 0.48 s in song.mp3 (the stems are 1105 samples
// later: their encoder delay), measured by measure-track.mjs and measure-detail.mjs.
//
// The track (measured): an 8-bar cycle Em7 | A7 | Em7 | A7 | Em7 | A7 | Bm7 | A7 from bar 8 to bar 95 (E Dorian = A Mixolydian:
// the notes of D major); bars 0-7 are its drums alone (muffled); "other" (brass and strings) is in from bar 48 only; bar 96 is its
// last hit, and it fades out after it. The animals sing A major pentatonic, which has no note that clashes with any of the four
// chords: grazers A, turtles B, frogs C#, lizards E, flyers F# (do re mi so la). Her tune keeps its degrees; started on the first
// or the fifth bar of the cycle its last "do" lands on an A7 bar.
import { rng } from './dsp.mjs';

export const BPM = 125;
export const SPB = 21168;
export const KEY = 'A major pentatonic over the band\'s Em7-A7 vamp (E Dorian / A Mixolydian), A4 = 440';

export const TONE = { grazers: 69, turtles: 71, frogs: 73, lizards: 76, flyers: 78 };
export const GROUPS = ['grazers', 'turtles', 'frogs', 'lizards', 'flyers'];

export const TUNE = [
  ['lizards', 'frogs'],
  ['turtles', 'frogs', 'grazers'],
  ['flyers', 'lizards', 'frogs', 'lizards'],
  ['flyers', 'lizards', 'frogs', 'turtles', 'grazers'],
];
export const TUNE_AT = [[0, 1.5], [8, 9.5, 11], [16, 17.5, 19, 20], [24, 25.5, 27, 27.5, 28]];
export const TUNE_LEN = [[1.5, 2.5], [1.5, 1.5, 2], [1.5, 1.5, 1, 2], [1.5, 1.5, 0.5, 0.5, 3]];

// The night, in bars (4 beats each). `src` is the track's bar each section starts from.
export const SECTIONS = [
  { id: 'arrival', name: 'Arrival', nameIs: 'Komið öll', bar: 0, bars: 4, feature: null,
    what: 'the band heard from far away behind the trees (low-passed, opening up), far calls of every group' },
  { id: 'welcome', name: 'Welcome', nameIs: 'Velkomin', bar: 4, bars: 4, feature: 'flugedla',
    what: 'she swoops in and lands; the band without its drums under her welcome; the forest answers on its tones; the drum fill into the warm-up' },
  { id: 'warmup', name: 'Warm-up', nameIs: 'Upphitun', bar: 8, bars: 8, feature: 'flugedla',
    what: 'the whole band in (no brass yet), the crowd whooping; a build: high-pass sweep, a snare roll cut from its own drums, a riser, a half-beat gap' },
  { id: 'groove', name: 'Dance floor', nameIs: 'Dansgólfið', bar: 16, bars: 8, feature: null,
    what: 'the band flat out, nothing on top: the loop (beats 64-96)' },
  { id: 'tuneA', name: 'Her song', nameIs: 'Lagið hennar', bar: 24, bars: 8, feature: null,
    what: 'the animals sing her tune; guitar and keys a little back' },
  { id: 'grazers', name: 'Grazers', nameIs: 'Grasbítarnir', bar: 32, bars: 4, feature: 'grazers',
    what: 'drums and bass with the guitar far back: the grazers stomp and sing, her wings on the stomps' },
  { id: 'turtles', name: 'Turtles', nameIs: 'Skjaldbökurnar', bar: 36, bars: 4, feature: 'turtles',
    what: 'two slow bars (half-time kick, the band low-passed), then two fast bars (the drums\' first eighth of each beat twice: double time)' },
  { id: 'frogs', name: 'Frogs', nameIs: 'Froskarnir', bar: 40, bars: 4, feature: 'frogs',
    what: 'drums, bass and the wah guitar: the frogs hop on the off-beats' },
  { id: 'lizards', name: 'Small lizards', nameIs: 'Litlu eðlurnar', bar: 44, bars: 4, feature: 'lizards',
    what: 'the drums high-passed (hats and snare), bass back: quick lizard chirps; the brass pickup into the flyers' },
  { id: 'flyers', name: 'Small flyers', nameIs: 'Litlu flugdýrin', bar: 48, bars: 4, feature: 'flyers',
    what: 'the brass and strings come in for the first time; the bass thinned: long flyer whistles' },
  { id: 'beetles', name: 'Beetles', nameIs: 'Bjöllurnar', bar: 52, bars: 2, feature: 'beetles',
    what: 'the drums alone: the beetles play the drum kit' },
  { id: 'dragonflies', name: 'Dragonflies', nameIs: 'Drekaflugurnar', bar: 54, bars: 2, feature: 'dragonflies',
    what: 'drums and strings, the dragonflies buzz past the stage' },
  { id: 'break', name: 'Her horn', nameIs: 'Hornið hennar', bar: 56, bars: 8, feature: 'sloedla',
    what: 'drums and bass out: strings, keys and a soft guitar in a big room under her horn; the bass and a muffled kick creep back' },
  { id: 'rise', name: 'The build', nameIs: 'Upp með vængina', bar: 64, bars: 8, feature: 'flugedla',
    what: 'no bass; the drums, then a roll of their own snare (eighths, sixteenths, thirty-seconds), high-pass sweep and riser; the countdown answered by the groups; one beat of near silence' },
  { id: 'drop', name: 'The big drop', nameIs: 'NÚ!', bar: 72, bars: 4, feature: 'all',
    what: 'the whole band with brass and strings, louder than anywhere else, every group at once' },
  { id: 'anthem', name: 'Anthem', nameIs: 'Öll saman', bar: 76, bars: 8, feature: 'all',
    what: 'everyone sings her tune (each note doubled), her horn echoes it' },
  { id: 'crowd', name: 'The crowd', nameIs: 'Látið heyra í ykkur', bar: 84, bars: 4, feature: 'flugedla',
    what: 'the drums alone: her call and the forest\'s roar, sol-mi; a roll and a riser back into the band' },
  { id: 'onemore', name: 'One more time', nameIs: 'Einu sinni enn', bar: 88, bars: 8, feature: 'all',
    what: 'the band flat out, the tune again with her horn' },
  { id: 'end', name: 'Goodnight', nameIs: 'Góða nótt', bar: 96, bars: 4, feature: 'all',
    what: 'band stabs under the last phrase, everyone on their tones, the band without drums under her goodnight, a drum fill, the last hit (beat 396) and its ring' },
];
export const LOOP = { startBeat: 64, beats: 32 }; // out bars 16-23 = the track's bars 24-31, one whole chord cycle, band only
export const END_BEAT = 396;
export const TAIL_SEC = 2.6;

export function sectionAt(beat) {
  let s = SECTIONS[0];
  for (const x of SECTIONS) if (beat >= x.bar * 4) s = x;
  return s;
}

// Her lines (beat = where the first syllable's attack lands; align 'vowel' puts the first vowel there instead).
export const DJ = [
  { id: 'welcome', beat: 16, echo: 'last', duck: 2, lift: 4 },
  { id: 'egill', beat: 32, radio: true, duck: 3 },
  { id: 'clap', beat: 40, echo: 'last', duck: 3 },
  { id: 'party-on', beat: 60.5, stutter: 2, duck: 3 },
  { id: 'grazers', beat: 128, echo: 'last', duck: 3 },
  { id: 'turtles-slow', beat: 144, radio: true, duck: 2, lift: 4 },
  { id: 'turtles-fast', beat: 152, echo: 'last', duck: 3 },
  { id: 'frogs', beat: 160, echo: 'last', duck: 3 },
  { id: 'lizards', beat: 176, duck: 3 },
  { id: 'flyers', beat: 192, echo: 'last', duck: 3 },
  { id: 'guests', beat: 208, duck: 3 },
  { id: 'sloedla', beat: 219, echo: 'last', duck: 3 },
  { id: 'wings', beat: 256, duck: 3 },
  { id: 'hear-you', beat: 264, echo: 'last', duck: 3 },
  { id: 'count-5', beat: 278, duck: 3 },
  { id: 'count-4', beat: 280, duck: 3 },
  { id: 'count-3', beat: 282, duck: 3 },
  { id: 'count-2', beat: 284, duck: 3 },
  { id: 'count-1', beat: 286, duck: 3 },
  { id: 'now', beat: 288, align: 'vowel', echo: 'last', duck: 3 },
  { id: 'laugh', beat: 292, echo: 'last', duck: 3 },
  { id: 'all', beat: 301.5, duck: 3 },
  { id: 'hear-you', key: 'hear-you-2', beat: 336, echo: 'last', radio: true, duck: 2 },
  { id: 'all', key: 'all-2', beat: 343.5, duck: 2 },
  { id: 'one-more', beat: 349.5, echo: 'last', stutter: 2, duck: 3 },
  { id: 'goodnight', beat: 389, echo: 'last', duck: 2, lift: 3 },
];

// ================================================================ the band: which bar of the track each bar plays, and the DJ's hands
export const STEMS = ['drums', 'bass', 'guitar', 'other', 'piano', 'vocals'];
const MUSIC = ['guitar', 'other', 'piano', 'vocals'];
const ALL = STEMS;
const OFF = -Infinity;

export function buildBand() {
  const bars = new Array(100).fill(null);
  const put = (out, src, count) => {
    for (let k = 0; k < count; k++) bars[out + k] = src + k;
  };
  put(0, 8, 4); // arrival: cycle bars 1-4
  put(4, 12, 4); // welcome: 5-8
  put(8, 16, 8); // warm-up
  put(16, 24, 8); // dance floor (the loop)
  put(24, 32, 8); // her song
  put(32, 40, 4); // grazers
  put(36, 12, 4); // turtles
  put(40, 16, 4); // frogs
  put(44, 44, 4); // lizards (bar 47 has the brass pickup into bar 48)
  for (let b = 48; b < 96; b++) bars[b] = b; // from the flyers on, the track's own bars (brass and strings in)
  put(96, 88, 3); // goodnight: Em7 A7 Em7; bar 99 is the last hit only
  const srcOf = o => 4 * bars[Math.floor(o / 4)] + (o - 4 * Math.floor(o / 4));

  const B = { bars, over: [], gain: {}, lp: {}, hp: {}, verb: [], echo: [], riser: [] };
  for (const s of STEMS) {
    B.gain[s] = [[-1, 0]];
    B.lp[s] = [];
    B.hp[s] = [];
  }
  const cur = Object.fromEntries(STEMS.map(s => [s, 0]));
  // a level change on a bar line or beat: ramp in the 11 ms just before it (the new bar's own pre-attack stays whole)
  const set = (stems, beat, db) => {
    for (const s of stems) {
      const g = B.gain[s], last = g[g.length - 1];
      if (last[0] === beat - 0.012) last[1] = db; // a second change on the same beat replaces the first
      else g.push([beat - 0.035, cur[s]], [beat - 0.012, db]);
      cur[s] = db;
    }
  };
  // a slow level move from one beat to another (it starts with a step to db0 like set())
  const ramp = (stems, from, to, db0, db1) => {
    set(stems, from, db0);
    for (const s of stems) {
      B.gain[s].push([to, db1]);
      cur[s] = db1;
    }
  };
  const lp = (stems, from, to, f0, f1) => stems.forEach(s => B.lp[s].push({ from, to, f0, f1 }));
  const hp = (stems, from, to, f0, f1) => stems.forEach(s => B.hp[s].push({ from, to, f0, f1 }));
  // an override: these stems play source beat `s` from out beat `o` for `n` beats (beat repeats, rolls, hits)
  const over = (stems, o, n, s, o2 = {}) => B.over.push({ stems, o, n, s, g: o2.g ?? 1, hold: o2.hold, tau: o2.tau, fade: o2.fade });

  // -------- arrival (0-16): far away, opening up
  ramp(ALL, 0, 15.9, -9, -4);
  lp(ALL, 0, 16, 260, 2200);
  // -------- welcome (16-32): the band without drums; the drums come in on the fill at beat 30
  set(ALL, 16, 0);
  set(['drums'], 16, OFF);
  set(['drums'], 30, 0);
  // -------- warm-up (32-64), with its build in bars 14-15
  set(ALL, 32, 0);
  hp(['bass', ...MUSIC], 56, 63.5, 20, 320);
  hp(['drums'], 60, 63.5, 20, 220);
  // the snare roll: the backbeat hit of the track's bar 17 (kick, snare, hats), eighths then sixteenths
  const ROLL = 4 * 17 + 1;
  for (let b = 60; b < 62; b += 0.5) over(['drums'], b, 0.5, ROLL, { g: 0.55 + 0.1 * (b - 60) });
  for (let b = 62; b < 63.5; b += 0.25) over(['drums'], b, 0.25, ROLL, { g: 0.75 + 0.12 * (b - 62) });
  set(ALL, 63.5, OFF);
  B.riser.push({ beat: 48, beats: 15.5, vel: 0.22 });
  // -------- dance floor (64-96): flat out, nothing else
  set(ALL, 64, 0);
  // -------- her song (96-128)
  // (as ramps that start on beat 96, so nothing changes inside the loop before it)
  ramp(['guitar'], 96, 96.5, 0, -4);
  ramp(['other', 'piano'], 96, 96.5, 0, -6);
  ramp(['vocals'], 96, 96.5, 0, -3);
  // -------- grazers (128-144): drums and bass, the guitar far back
  set(['bass'], 128, 0);
  set(['guitar'], 128, -9);
  set(['other', 'piano', 'vocals'], 128, OFF);
  // -------- turtles (144-160): two slow bars, two fast ones
  set(['drums'], 144, -2);
  // half time: the bar's first beat (kick) on 1 and its backbeat (kick and snare) on 3, the beats between left out
  for (let b = 144; b < 152; b += 4) {
    over(['drums'], b, 1, srcOf(b), { hold: 0.85, tau: 0.06 });
    over(['drums'], b + 1, 1, srcOf(b), { g: 0 });
    over(['drums'], b + 2, 1, srcOf(b + 1), { hold: 0.85, tau: 0.06 });
    over(['drums'], b + 3, 1, srcOf(b), { g: 0 });
  }
  set(['bass'], 144, 0);
  set(['guitar', 'piano', 'other'], 144, -1);
  lp(['bass', ...MUSIC], 144, 152, 1200, 1200);
  set(['drums'], 152, 0);
  set(['bass'], 152, 0);
  set(['guitar'], 152, 0);
  set(['piano', 'other', 'vocals'], 152, OFF);
  for (let b = 152; b < 160; b += 0.5) over(['drums'], b, 0.5, srcOf(Math.floor(b))); // each beat's first eighth twice
  // -------- frogs (160-176): drums, bass, the wah guitar
  set(['bass'], 160, -1);
  set(['vocals'], 160, 0);
  // -------- lizards (176-192): the drums high-passed, the bass back
  hp(['drums'], 176, 190, 450, 450);
  set(['bass'], 176, -3);
  set(['piano'], 176, -6);
  set(['other'], 188, 0); // the brass pickup in the track's bar 47
  // -------- flyers (192-208): brass and strings in
  set(['drums'], 192, -2);
  set(['bass'], 192, -4);
  hp(['bass'], 192, 208, 90, 90);
  set(['guitar'], 192, -3);
  set(['other'], 192, 1);
  set(['piano', 'vocals'], 192, 0);
  // -------- beetles (208-216): the drums alone; dragonflies (216-224): drums and strings
  set(['drums'], 208, 0);
  B.verb.push({ stems: ['drums'], from: 208, to: 216, send: 0.45 }); // a big room fills the gaps between the kicks
  set(['bass', ...MUSIC], 208, OFF);
  set(['other'], 216, -2);
  set(['guitar'], 216, -8);
  hp(['drums'], 216, 223, 20, 120);
  // the drums' last beat thrown into the echo as the band leaves for her horn
  B.echo.push({ stems: ['drums'], from: 223, to: 224, fb: 0.5, send: 0.6 });
  // -------- her horn (224-256): no drums, no bass; a big room
  set(['drums'], 224, OFF);
  set(['guitar'], 224, -9);
  set(['other'], 224, -1);
  set(['piano'], 224, -2);
  lp(['guitar', 'other', 'piano'], 224, 256, 2400, 2400);
  B.verb.push({ stems: ['guitar', 'other', 'piano'], from: 223.5, to: 256, send: 0.5 });
  ramp(['bass'], 240, 254, -14, -5);
  lp(['bass'], 240, 256, 300, 300);
  ramp(['drums'], 248, 255.9, -16, -7);
  lp(['drums'], 248, 256, 140, 140);
  // -------- the build (256-288): no bass; drums, then the roll; high-pass sweep; one beat of near silence before the drop
  set(['drums'], 256, -1);
  set(['bass'], 256, OFF);
  set(['guitar', 'other', 'piano', 'vocals'], 256, -2);
  lp(MUSIC, 256, 272, 900, 6000);
  hp(MUSIC, 272, 287.5, 20, 450);
  hp(['drums'], 268, 287.5, 20, 260);
  const ROLL2 = 4 * 65 + 1;
  for (let b = 272; b < 280; b += 0.5) over(['drums'], b, 0.5, ROLL2, { g: 0.6 + 0.02 * (b - 272) });
  for (let b = 280; b < 284; b += 0.25) over(['drums'], b, 0.25, ROLL2, { g: 0.78 + 0.03 * (b - 280) });
  for (let b = 284; b < 287.5; b += 0.125) over(['drums'], b, 0.125, ROLL2, { g: 0.9 + 0.03 * (b - 284) });
  set(ALL, 287.5, OFF);
  B.riser.push({ beat: 256, beats: 31, vel: 0.28 });
  // -------- the drop (288-304): the whole band, a little hotter than anywhere else
  set(ALL, 288, 0);
  set(['drums', 'bass'], 288, 1.5);
  set(['other'], 288, 1);
  // -------- anthem (304-336)
  set(['drums', 'bass'], 304, 0);
  set(['guitar', 'other', 'piano'], 304, -3);
  // -------- the crowd (336-352): drums alone, then the band comes back through a roll
  set(['drums'], 336, 0);
  set(MUSIC, 336, OFF);
  set(['bass'], 336, -2);
  B.verb.push({ stems: ['drums'], from: 336, to: 348, send: 0.45 });
  set(['bass', 'guitar', 'other', 'piano'], 348, -2);
  hp(['bass', 'guitar', 'other', 'piano'], 348, 351.5, 400, 60);
  const ROLL3 = 4 * 85 + 1;
  for (let b = 348; b < 351.5; b += 0.25) over(['drums'], b, 0.25, ROLL3, { g: 0.6 + 0.1 * (b - 348) });
  set(ALL, 351.5, OFF);
  B.riser.push({ beat: 344, beats: 7.5, vel: 0.24 });
  // -------- one more time (352-384)
  set(ALL, 352, 0);
  set(['guitar', 'other', 'piano'], 352, -2);
  // -------- goodnight (384-396): stabs on the four beats, then the band without drums, a fill, the last hit
  for (let b = 384; b < 388; b++) over(ALL, b, 1, srcOf(b), { hold: 0.32, tau: 0.07 });
  set(['drums'], 388, OFF);
  set(['bass', 'guitar', 'other', 'piano'], 388, -3);
  set(['vocals'], 388, OFF);
  set(['drums'], 394, 0);
  over(['drums'], 394, 2, 4 * 95 + 2); // the track's own fill at the end of its last cycle
  set(['bass', 'guitar', 'other', 'piano'], 396, 0);
  set(['drums'], 396, 0);
  // the last hit: an A7 downbeat (the track's bar 83, the bass on A) and the drummer's real last hit (bar 96), ringing out
  over(['bass', 'guitar', 'other', 'piano'], 396, 6, 4 * 83, { hold: 0.55, tau: 0.42 });
  over(['drums'], 396, 6, 4 * 96, { hold: 2.5, tau: 0.7 });
  B.verb.push({ stems: ['bass', 'guitar', 'other', 'piano', 'drums'], from: 395.9, to: 402, send: 0.35 });
  // the band's level by section (dB, on every stem): the drop the loudest, the rest a little under it
  B.level = [[0, 0], [32, -1], [128, -1.5], [144, -1], [224, 0], [256, -1], [288, 1], [304, -0.5], [336, -1], [352, -0.5]];
  return B;
}

// ================================================================ the animals, her horn, her wings
export function buildScore() {
  const S = { calls: [], cues: [], tuneNotes: [], horn: [], wing: [], whoosh: [], buzz: [], kick: [], robot: [], bell: [], marimba: [], crowd: [], choir: [], beetle: [] };
  const at16 = (bar, step) => bar * 4 + step / 4;
  const round = b => Math.round(b * 1000) / 1000;
  const PAN = { grazers: -0.35, turtles: -0.18, frogs: 0.18, lizards: 0.35, flyers: 0 };
  const call = (group, beat, o = {}) => {
    S.calls.push({ group, beat, dur: o.dur ?? 1, vel: o.vel ?? 1, take: o.take ?? 0, mode: o.mode ?? 'onset', octave: o.octave ?? 0, pan: o.pan ?? PAN[group], shift: o.shift ?? 0 });
    if (!o.noCue) S.cues.push({ beat: round(beat), kind: 'call', group });
  };
  const wing = (beat, vel = 1, len = 0) => {
    S.wing.push({ beat, vel, len });
    S.cues.push({ beat: round(beat), kind: 'wings' });
  };
  // the forest answers her: every group on its own tone at once, three of each a few ms apart
  const roar = (beat, vel = 1, seed = 1) => {
    const r = rng(500 + seed);
    for (const g of GROUPS) {
      S.cues.push({ beat: round(beat), kind: 'call', group: g });
      for (let k = 0; k < 3; k++)
        call(g, beat, { mode: 'roar', dur: 2.6, vel: vel * (g === 'grazers' ? 0.55 : 0.42) * (k ? 0.7 : 1), take: k, pan: (r() * 2 - 1) * 0.85, shift: r() * 0.05 * SPB, noCue: true });
    }
    S.cues.push({ beat: round(beat), kind: 'roar' });
  };
  const hornNote = (beat, beats, midi, vel = 1) => {
    S.horn.push({ beat, dur: Math.min(beats * 0.48, 2.5), midi, vel });
    S.cues.push({ beat: round(beat), kind: 'horn' });
  };
  // her tune, sung by the animals; `voices` 2 doubles every note (a second take, the other side); the horn echoes or joins
  const sing = (hook, { horn = 'none', vel = 1, voices = 1 } = {}) => {
    TUNE.forEach((phrase, p) => {
      phrase.forEach((g, k) => {
        const beat = hook + TUNE_AT[p][k];
        const dur = TUNE_LEN[p][k];
        call(g, beat, { dur, vel, pan: voices > 1 ? -0.35 : PAN[g] * 0.5 });
        if (voices > 1) call(g, beat, { dur, vel: vel * 0.8, take: 1, pan: 0.35, shift: 0.008 * 44100, noCue: true });
        S.tuneNotes.push({ group: g, beat });
        if (horn === 'echo' && p < 2) {
          const last = k === phrase.length - 1;
          hornNote(beat + 4, last && p === 1 ? 1 : dur, TONE[g] - 12, 0.9);
        }
        if ((horn === 'echo' && p >= 2) || horn === 'unison') hornNote(beat, dur, TONE[g] - 12, 0.85);
      });
    });
  };
  const chopPattern = (group, bar, steps, o = {}) => {
    steps.forEach(([s, len, take = 0, oct = 0], k) => call(group, at16(bar, s), { dur: len / 4, take, octave: oct, mode: 'chop', vel: (o.vel ?? 1) * (k === 0 ? 1 : 0.88) }));
  };
  const CHOPS = {
    grazers: [
      [[0, 5, 0], [6, 4, 1], [12, 3, 0]],
      [[0, 4, 1], [6, 2, 0], [8, 2, 1], [12, 4, 0]],
      [[0, 5, 0], [6, 4, 1], [12, 3, 0]],
      [[0, 3, 1], [4, 3, 0], [8, 2, 1], [10, 2, 0], [12, 4, 1]],
    ],
    turtles: [[[2, 1.6], [6, 1.6], [10, 1.6], [14, 1.6]]],
    frogs: [
      [[0, 2, 0], [3, 2, 1], [6, 2, 0], [10, 2, 1], [12, 2, 0], [14, 2, 1]],
      [[0, 2, 0], [3, 2, 1], [6, 2, 0], [10, 2, 1], [12, 2, 0], [14, 2, 1]],
      [[0, 2, 0], [3, 2, 1], [6, 2, 0], [10, 2, 1], [12, 2, 0], [14, 2, 1]],
      [[0, 2, 0], [3, 2, 1], [6, 2, 0], [8, 1, 1], [10, 2, 0], [12, 1, 1], [13, 1, 0], [14, 2, 1]],
    ],
    lizards: [
      [[2, 1, 0], [3, 1, 1], [4, 1, 0], [7, 1, 1], [10, 1, 0], [11, 1, 1], [12, 1, 0], [15, 1, 1]],
      [[2, 1, 0], [3, 1, 1], [4, 1, 0], [7, 1, 1], [10, 1, 0], [11, 1, 1], [12, 1, 0], [15, 1, 1]],
      [[2, 1, 0], [3, 1, 1], [4, 1, 0], [7, 1, 1], [10, 1, 0], [11, 1, 1], [12, 1, 0], [15, 1, 1]],
      [[2, 1, 0], [3, 1, 1], [4, 1, 0], [6, 1, 1], [8, 1, 0], [10, 1, 1], [12, 1, 0], [13, 1, 1], [14, 1, 0], [15, 1, 1]],
    ],
  };
  const fly = (beat, beats, midi, o = {}) => {
    S.buzz.push({ beat, dur: beats * 0.48, midi, vel: o.vel ?? 0.5, glideTo: o.glideTo ?? 0, panFrom: o.panFrom ?? -0.8, panTo: o.panTo ?? 0.8 });
    S.cues.push({ beat: round(beat), kind: 'call', group: 'dragonflies' });
  };
  const hit = beat => S.cues.push({ beat, kind: 'hit' });

  // ======== arrival: far calls of every group, from every side
  call('frogs', 2, { take: 1, vel: 0.2, pan: 0.7 });
  call('lizards', 4.5, { vel: 0.18, pan: -0.7 });
  call('turtles', 6, { vel: 0.2, pan: -0.5 });
  call('flyers', 7.5, { vel: 0.2, pan: 0.4 });
  call('grazers', 9, { vel: 0.24, pan: -0.6, dur: 1.5 });
  call('frogs', 10.5, { vel: 0.24, pan: 0.5 });
  call('lizards', 11.5, { take: 0, vel: 0.2, pan: 0.65 });
  // ======== welcome: she swoops in and lands; the forest answers
  S.whoosh.push({ beat: 13.2, take: 0, vel: 0.3, peakAt: true });
  S.cues.push({ beat: 13, kind: 'whoosh' });
  wing(14, 0.9);
  wing(14.75, 0.8);
  wing(15.5, 1);
  hit(16);
  roar(24, 0.75, 1);
  // ======== warm-up: the drums in; whoops from all over the forest between her words
  hit(32);
  [['lizards', 36.5, 0.6], ['flyers', 38, -0.5], ['frogs', 43.5, 0.5], ['grazers', 46, -0.6], ['lizards', 47.5, 0.7], ['turtles', 50, -0.4],
    ['flyers', 51.5, 0.3], ['frogs', 53.5, -0.6], ['lizards', 55, 0.6], ['frogs', 57.5, 0.4], ['flyers', 59, -0.3]].forEach(([g, beat, pan], k) =>
    call(g, beat, { dur: 1, vel: 0.45 + 0.02 * k, pan, take: k % 2 }));
  S.cues.push({ beat: 48, kind: 'rise' });
  hit(64);
  // ======== her song
  hit(96);
  sing(96);
  // ======== the acts
  hit(128);
  for (let bar = 32; bar < 36; bar++) {
    wing(bar * 4, 0.7);
    wing(bar * 4 + 2, 0.8);
    chopPattern('grazers', bar, CHOPS.grazers[bar - 32], { vel: 0.85 });
  }
  hit(144);
  for (let bar = 36; bar < 40; bar++) {
    if (bar < 38) {
      call('turtles', bar * 4 + 1, { mode: 'chop', dur: 1.6, vel: 0.9 });
      call('turtles', bar * 4 + 3, { mode: 'chop', dur: 0.9, vel: 0.6 });
    } else for (let e = 0; e < 8; e++) call('turtles', bar * 4 + e / 2 + 0.25, { mode: 'chop', dur: 0.32, vel: 0.8 });
  }
  hit(152);
  hit(160);
  for (let bar = 40; bar < 44; bar++) chopPattern('frogs', bar, CHOPS.frogs[bar - 40], { vel: 0.95 });
  hit(176);
  for (let bar = 44; bar < 48; bar++) chopPattern('lizards', bar, CHOPS.lizards[bar - 44], { vel: 0.9 });
  hit(192);
  for (let bar = 48; bar < 52; bar++) {
    const flyer = bar === 51 ? [[0, 4], [4, 4], [8, 4], [12, 4]] : [[0, 8], [10, 6]];
    for (const [s, len] of flyer) call('flyers', bar * 4 + s / 4, { dur: len / 4, vel: 0.95, pan: (s / 16) * 1.0 - 0.4 });
  }
  // the beetles are the drummer: a cue on every beat and off-beat of their two bars
  hit(208);
  for (let b = 208; b < 216; b += 0.5) S.cues.push({ beat: b, kind: 'call', group: 'beetles' });
  hit(216);
  fly(216, 3.5, 76, { vel: 0.5, panFrom: -0.9, panTo: 0.9 });
  fly(218, 2, 81, { vel: 0.4, panFrom: 0.9, panTo: -0.6 });
  fly(220, 3.5, 76, { vel: 0.36, glideTo: 440 * 2 ** ((88 - 69) / 12), panFrom: -0.4, panTo: 0.4 });
  // ======== her horn: the headliner
  hit(224);
  TUNE.forEach((phrase, p) => phrase.forEach((g, k) => {
    const lens = [[1.5, 5], [1.5, 1.5, 4.5], [1.5, 1.5, 1, 3.5], [1.5, 1.5, 0.5, 0.5, 4]];
    hornNote(224 + TUNE_AT[p][k], lens[p][k], TONE[g] - 12, 1);
  }));
  // ======== the build: her wings quicken; the forest climbs with her; the countdown
  S.cues.push({ beat: 256, kind: 'rise' });
  for (let b = 256; b < 264; b += 2) wing(b, 0.6);
  for (let b = 264; b < 272; b += 1) wing(b, 0.62);
  for (let b = 272; b < 280; b += 0.5) wing(b, 0.55, 0.5);
  for (let b = 280; b < 287; b += 0.25) wing(b, 0.4 + 0.25 * ((b - 280) / 8), 0.25);
  ['grazers', 'turtles'].forEach((g, k) => {
    for (let b = 0; b < 4; b++) call(g, 256 + k * 4 + b, { mode: 'chop', dur: 0.7, vel: 0.75, take: b % 2 && g !== 'turtles' ? 1 : 0 });
  });
  roar(268, 0.85, 3);
  for (let e = 0; e < 8; e++) call(GROUPS[e % 5], 272 + e / 2, { mode: 'chop', dur: 0.45, vel: 0.8 });
  for (let s = 0; s < 8; s++) call(GROUPS[s % 5], 276 + s / 4, { mode: 'chop', dur: 0.24, vel: 0.8 });
  GROUPS.forEach((g, k) => {
    const beat = 279 + 2 * k;
    call(g, beat, { dur: 0.9, vel: 0.95, pan: 0 });
    S.cues.push({ beat: beat - 1, kind: 'count', n: 5 - k });
  });
  // ======== the drop
  roar(288, 1, 4);
  for (const g of GROUPS) call(g, 288, { dur: 3, vel: g === 'grazers' ? 0.85 : 0.6, pan: PAN[g] * 1.4 });
  for (let bar = 72; bar < 76; bar++) {
    chopPattern('grazers', bar, CHOPS.grazers[bar - 72].filter(([s]) => s === 0 || s >= 8), { vel: 0.45 });
    chopPattern('turtles', bar, CHOPS.turtles[0], { vel: 0.36 });
    chopPattern('frogs', bar, CHOPS.frogs[0].filter(([s]) => s >= 3), { vel: 0.36 });
    chopPattern('lizards', bar, CHOPS.lizards[0].filter(([s]) => s >= 8), { vel: 0.32 });
    if (bar % 2 === 1) call('flyers', bar * 4 + 2, { dur: 1.8, vel: 0.55, pan: bar === 73 ? -0.4 : 0.4 });
  }
  S.whoosh.push({ beat: 287, take: 1, vel: 0.5, peakAt: true });
  S.cues.push({ beat: 288, kind: 'peak' });
  // ======== anthem: everyone sings her tune
  S.cues.push({ beat: 304, kind: 'peak' });
  sing(304, { horn: 'echo', voices: 2 });
  // ======== the crowd: call and response
  roar(340, 0.5, 5);
  [['lizards', 346, 1.5], ['frogs', 347.5, 2]].forEach(([g, beat, dur]) => {
    call(g, beat, { dur, vel: 1, pan: -0.3 });
    call(g, beat, { dur, vel: 0.8, take: 1, pan: 0.3, shift: 0.008 * 44100, noCue: true });
  });
  // ======== one more time
  roar(352, 0.5, 6);
  S.cues.push({ beat: 352, kind: 'peak' });
  sing(352, { horn: 'unison', voices: 2 });
  for (let bar = 88; bar < 96; bar++) {
    chopPattern('turtles', bar, CHOPS.turtles[0], { vel: 0.3 });
    if (bar % 2 === 0) chopPattern('frogs', bar, CHOPS.frogs[0].filter(([s]) => s >= 3), { vel: 0.28 });
    else chopPattern('lizards', bar, CHOPS.lizards[0], { vel: 0.26 });
  }
  // ======== goodnight
  hit(384);
  TUNE[3].slice(0, 4).forEach((g, k) => {
    const beat = 384 + k;
    call(g, beat, { dur: 0.9, vel: 1, pan: 0 });
    hornNote(beat, 0.8, TONE[g] - 12, 0.85);
    wing(beat, 0.55 + 0.1 * k);
  });
  for (const g of GROUPS) call(g, 388, { dur: 4, vel: g === 'grazers' ? 0.9 : 0.62 });
  hornNote(388, 5, TONE.grazers - 12, 0.85);
  // the last hit, and she flies off
  call('grazers', 396, { dur: 2, vel: 0.9, pan: 0 });
  wing(396, 0.8);
  wing(397, 0.6);
  S.whoosh.push({ beat: 397.5, take: 0, vel: 0.45, peakAt: false });
  S.cues.push({ beat: 396, kind: 'end' }, { beat: 397.5, kind: 'whoosh' });

  // a group's chop never doubles its own note of her tune: the tune note wins
  const clash = c => c.mode === 'chop' && S.tuneNotes.some(t => t.group === c.group && Math.abs(t.beat - c.beat) < 0.5);
  const dropped = S.calls.filter(clash);
  S.calls = S.calls.filter(c => !clash(c));
  for (const d of dropped) {
    const i = S.cues.findIndex(q => q.kind === 'call' && q.group === d.group && q.beat === round(d.beat));
    if (i >= 0) S.cues.splice(i, 1);
  }
  for (const d of DJ) S.cues.push({ beat: d.beat, kind: 'dj', id: d.key ?? d.id });
  S.cues.sort((a, b) => a.beat - b.beat || a.kind.localeCompare(b.kind));
  return S;
}
