// remix-c "Leikjadjamm": DJ Flugeðla's party-games remix of Ljósfluguballið (smidur-e), as data. Every event is placed in beats on
// one fixed grid (125 bpm, beat 0 at 0 s). Bars 0-39 keep Ljósfluguballið's places (intro, dance floor, her song, the parade) with
// each group's part turned into a game; bars 40-51 are new (her freeze dance, then everyone dancing); Ljósfluguballið's horn
// break, rise, peak and ending follow 12 bars later than in the original (OFF beats), the rise as her take-off and the ending
// held for the snail. The parts render it (render.mjs); song.json is written from it.
import { rng } from './dsp.mjs';

export const BPM = 125;
export const SPB = 21168; // samples per beat at 44.1 kHz (5292 a sixteenth: the grid is sample-exact)
export const KEY = 'G major';
const OFF = 48; // the original's bars 40+ come 12 bars later here

// Her tune's tones in the robot's octave (G4 to E5): do re mi sol la.
export const TONE = { grazers: 67, turtles: 69, frogs: 71, lizards: 74, flyers: 76 };
export const GROUPS = ['grazers', 'turtles', 'frogs', 'lizards', 'flyers'];

// Her tune (as it is in the game: sol mi / re mi do / la sol mi sol / la sol mi re do), with Ljósfluguballið's 3-3-2 lilt.
export const TUNE = [
  ['lizards', 'frogs'],
  ['turtles', 'frogs', 'grazers'],
  ['flyers', 'lizards', 'frogs', 'lizards'],
  ['flyers', 'lizards', 'frogs', 'turtles', 'grazers'],
];
export const TUNE_AT = [[0, 1.5], [8, 9.5, 11], [16, 17.5, 19, 20], [24, 25.5, 27, 27.5, 28]];
export const TUNE_LEN = [[1.5, 2.5], [1.5, 1.5, 2], [1.5, 1.5, 1, 2], [1.5, 1.5, 0.5, 0.5, 3]];

// Chords: bass root (MIDI), pad voicing (mid range), e-piano voicing, arp tones (high).
export const CHORDS = {
  G: { root: 31, pad: [55, 59, 62, 66, 69], ep: [59, 62, 66, 69], arp: [67, 71, 74, 78, 81] },
  Em: { root: 28, pad: [52, 55, 59, 62, 66], ep: [55, 59, 62, 66], arp: [64, 67, 71, 74, 78] },
  C: { root: 36, pad: [52, 55, 59, 62, 64], ep: [55, 59, 62, 64], arp: [64, 67, 71, 72, 76] },
  D11: { root: 38, pad: [52, 55, 57, 60, 64], ep: [55, 57, 60, 64], arp: [62, 67, 69, 72, 76] },
  D: { root: 38, pad: [54, 57, 62, 64, 66], ep: [54, 57, 62, 66], arp: [62, 66, 69, 74, 78] },
  DF: { root: 42, pad: [54, 57, 62, 66, 69], ep: [57, 62, 66, 69], arp: [62, 66, 69, 74, 78] },
  Am: { root: 33, pad: [52, 55, 59, 60, 64], ep: [55, 59, 60, 64], arp: [64, 67, 69, 71, 76] },
  G69: { root: 31, pad: [55, 59, 62, 64, 69], ep: [59, 62, 64, 69], arp: [67, 69, 71, 74, 76] },
};
const LOOP4 = ['G', 'Em', 'C', 'D11'];

// The form, in bars (4 beats each). `feature` is what the camera follows.
export const SECTIONS = [
  { id: 'intro', name: 'She lands', nameIs: 'Hún lendir', bar: 0, bars: 4, feature: 'flugedla',
    what: 'Dusk at the pond, the string pad opening; her wing beats come in and she lands at the decks: "Velkomin á Stjörnuhátíðina! Ég er DJ Flugeðla!", then counts in, one word a beat.' },
  { id: 'groove', name: 'Dance floor', nameIs: 'Dansgólfið', bar: 4, bars: 8, feature: null,
    what: 'Ljósfluguballið\'s dance floor; she greets Egill and says tonight is games night. Bars 9-12 are the loop.' },
  { id: 'tuneA', name: 'Her song', nameIs: 'Lagið hennar', bar: 12, bars: 8, feature: null,
    what: 'The animals sing her tune, each note by its own group (the camera jumps to each singer), the robot voice echoing.' },
  { id: 'grazers', name: 'Stomp game', nameIs: 'Stappleikur', bar: 20, bars: 4, feature: 'grazers',
    what: '"Grasbítar! Stappið!" A half-time stomp: every stomp a deep thud with a dusty rumble (the ground shakes), the grazers moo their do. "Jörðin hristist!"' },
  { id: 'turtles', name: 'Slow... quick!', nameIs: 'Hægt... snöggt!', bar: 24, bars: 4, feature: 'turtles',
    what: '"Skjaldbökur... hægt... hægt..." Two bars of slow half-time, dark and heavy, the turtles humming long re notes; then "Snöggt!" and two bars of double time, turtles in sixteenths.' },
  { id: 'frogs', name: 'Hop game', nameIs: 'Hoppleikur', bar: 28, bars: 4, feature: 'frogs',
    what: '"Já, froskadjamm!" The frogs croak mi with congas; in bar 31 the beat thins and on every beat she shouts "Hopp!" with a frog croak and a boing (Egill hops); two more hops end the part.' },
  { id: 'lizards', name: 'Faster!', nameIs: 'Hraðar!', bar: 32, bars: 4, feature: 'lizards',
    what: '"Smáeðlur! Hraðar!" Double-time snare, lizards chirp sol in sixteenths; "Hraðar!" again and again, quicker each time, into a stutter.' },
  { id: 'flyers', name: 'Higher!', nameIs: 'Hærra!', bar: 36, bars: 4, feature: 'flyers',
    what: '"Flugdýr! Hærra!" The flyers whistle their la, an octave higher at each "Hærra!" (low, middle, high), the filter opening up with them.' },
  { id: 'stoppdans', name: 'Freeze dance', nameIs: 'Stoppdans', bar: 40, bars: 8, feature: 'flugedla',
    what: 'Her own game. "Stoppdans! Allir dansa!" Everyone dances; "Stopp!" and the music freezes (an icy held chord, the beetles tick the beat), one slow turtle keeps humming: "Ha ha! Skjaldbakan hreyfði sig!" "Dansa!" Again: "Stopp!" "Egill! Ekki hreyfa þig!" "Dansa!"' },
  { id: 'allir', name: 'Everyone dances', nameIs: 'Allir dansa', bar: 48, bars: 4, feature: 'all',
    what: 'After the freezes everything comes back with every group\'s own pattern at once; the last bar thins: "Slóeðla! Spilaðu fyrir okkur!"' },
  { id: 'break', name: 'Her horn', nameIs: 'Hornið hennar', bar: 52, bars: 8, feature: 'sloedla',
    what: 'The drums and bass step away: Slóeðla plays her whole tune on her horn, alone with the fireflies.' },
  { id: 'rise', name: 'Take-off', nameIs: 'Flugtak', bar: 60, bars: 8, feature: 'flugedla',
    what: '"Allir! Upp með vængina!" Ljósfluguballið\'s rise as her take-off: her wing beats quicken, the wind rises, the animals climb do-re-mi-sol-la. "Haltu þér fast, Egill!" The beat drops out for her countdown, þrír, tveir, einn...' },
  { id: 'peak1', name: 'Now!', nameIs: 'Nú!', bar: 68, bars: 8, feature: 'all',
    what: '"Nú!" The drop: the animals sing her tune with the robot voice, her horn answering; she stands in the pond and beats time with her wings (the wing beats are the claps).' },
  { id: 'peak2', name: 'All together', nameIs: 'Allir saman', bar: 76, bars: 8, feature: 'all',
    what: '"Allir saman! Jibbí!" Her tune once more, horn and animals together, every group dancing its own pattern underneath; "Jibbí!" again at the top.' },
  { id: 'end', name: 'Ending', nameIs: 'Lokin', bar: 84, bars: 2, feature: 'all',
    what: 'Stop-time: the last phrase la-sol-mi-re one note a beat, then do with all five groups at once (the pentatonic is the chord), held while everyone dances.' },
  { id: 'snail', name: 'The snail', nameIs: 'Snigillinn', bar: 86, bars: 2, feature: 'snail',
    what: 'A tiny snail slides in, late for the party (a slide-whistle squeak): "Snigillinn er kominn! Loksins!" Its slide whistle climbs to do and lands on the last hit with everyone.' },
];
export const LOOP = { startBeat: 32, beats: 16 }; // bars 9-12 (8-11 from 0): the dance floor; bars 5-8 play the same, so the seam is clean
export const END_BEAT = 352; // the last hit
export const TAIL_SEC = 2.6;

export function sectionAt(beat) {
  let s = SECTIONS[0];
  for (const x of SECTIONS) if (beat >= x.bar * 4) s = x;
  return s;
}

/** The chord of each bar. */
export function chordOfBar(bar) {
  if (bar >= 52 && bar < 60) return ['C', 'C', 'D11', 'D11', 'Em', 'Em', 'Am', 'D11'][bar - 52];
  if (bar >= 64 && bar < 68) return ['C', 'D', 'Em', 'DF'][bar - 64];
  if (bar === 84) return 'C';
  if (bar >= 85) return 'G69';
  return LOOP4[bar % 4];
}

// Her lines: where each is placed (the first syllable's attack on the beat) and what the DJ does with it. `seg` takes one word of a
// take (by index; -1 the last), `head` only its first seconds; `rate` pitches lightly (and so slows/quickens); fx: echo (a throw
// on the last word: time in beats, feedback), radio (a band-pass telephone colour), shake (a 16th tremolo), slow (dark low-pass),
// rev (reverb send), duck (dB the music dips under her), over (dB her words sit over the ducked music under them, or, with `ref`,
// over the music at beat `ref`: the dance just before a freeze or the build before the countdown gap, so she never jumps out of
// the quiet).
export const DJ = [
  { id: 'welcome', beat: 3, echo: [0.75, 0.42], rev: 0.25, duck: 0, over: 3 },
  { id: 'count-in', beat: 12, seg: 0, radio: 1, rev: 0.1, duck: 2, over: 3 },
  { id: 'count-in', beat: 13, seg: 1, radio: 1, rev: 0.1, duck: 2, over: 3 },
  { id: 'count-in', beat: 14, seg: 2, radio: 1, rev: 0.1, duck: 2, over: 3 },
  { id: 'count-in', beat: 15, seg: 3, echo: [0.5, 0.38], rev: 0.2, duck: 3, over: 4 },
  { id: 'hi-egill', beat: 18, rev: 0.12, duck: 4, over: 4 },
  { id: 'grazers-in', beat: 80, rev: 0.25, echo: [0.75, 0.35], duck: 4, over: 4 },
  { id: 'grazers-shake', beat: 88, shake: 0.4, rev: 0.2, duck: 4, over: 4 },
  { id: 'turtles-slow', beat: 96, rate: 0.95, slow: 1, rev: 0.4, duck: 4, over: 4 },
  { id: 'turtles-fast', beat: 104, echo: [0.25, 0.3], rev: 0.15, duck: 4, over: 5 },
  { id: 'frogs-in', beat: 112, echo: [0.5, 0.5], rev: 0.2, duck: 4, over: 5 },
  ...[[120, 0], [121, 0.5], [122, 1], [123, 1.5], [126, 1], [127, 2]].map(([beat, st]) => ({ id: 'hopp', beat, rate: 2 ** (st / 12), rev: 0.15, duck: 3, over: 4 })),
  { id: 'lizards-in', beat: 128, rev: 0.12, duck: 4, over: 4 },
  ...[136, 138, 140, 141].map(beat => ({ id: 'hradar', beat, echo: [0.25, 0.25], rev: 0.12, duck: 3, over: 3 })),
  ...[142, 142.5, 143, 143.25, 143.5, 143.75].map(beat => ({ id: 'hradar', beat, head: 0.1, rev: 0.1, duck: 3, over: 2 })),
  { id: 'flyers-in', beat: 144, echo: [0.75, 0.4], rev: 0.25, duck: 4, over: 4 },
  ...[[148, 0, 0.25], [152, 1, 0.32], [156, 2, 0.4]].map(([beat, st, rev]) => ({ id: 'haerra', beat, rate: 2 ** (st / 12), echo: [0.75, 0.4], rev, duck: 4, over: 4 })),
  { id: 'freeze-in', beat: 160, echo: [0.5, 0.4], rev: 0.2, duck: 4, over: 5 },
  { id: 'stopp', beat: 168, echo: [0.5, 0.45], rev: 0.3, duck: 0, over: 0, ref: 164 },
  { id: 'turtle-moved', beat: 170, rev: 0.15, duck: 0, over: -1, ref: 164 },
  { id: 'dansa', beat: 175, rev: 0.15, duck: 0, over: 0, ref: 164 },
  { id: 'stopp', beat: 184, echo: [0.5, 0.45], rev: 0.3, duck: 0, over: 0, ref: 180 },
  { id: 'egill-freeze', beat: 185, rev: 0.05, duck: 0, over: -3, ref: 180 },
  { id: 'dansa', beat: 191, rev: 0.15, duck: 0, over: 0, ref: 180 },
  { id: 'horn-in', beat: 204, rev: 0.3, duck: 3, over: 4 },
  { id: 'wings-up', beat: 240, echo: [0.75, 0.4], rev: 0.25, duck: 3, over: 4 },
  { id: 'hold', beat: 256, rev: 0.2, duck: 4, over: 4 },
  { id: 'count-in', beat: 269, seg: 2, radio: 1, echo: [0.25, 0.25], rev: 0.15, duck: 0, over: -1, ref: 264 },
  { id: 'count-in', beat: 270, seg: 1, radio: 1, echo: [0.25, 0.25], rev: 0.15, duck: 0, over: -1, ref: 264 },
  { id: 'count-in', beat: 271, seg: 0, radio: 1, echo: [0.25, 0.25], rev: 0.15, duck: 0, over: -1, ref: 264 },
  { id: 'nu', beat: 272, echo: [0.75, 0.5], rev: 0.4, duck: 3, over: 5 },
  { id: 'allir-saman', beat: 302, echo: [0.5, 0.45], rev: 0.25, duck: 4, over: 4 },
  { id: 'allir-saman', beat: 328, seg: -1, echo: [0.5, 0.5], rev: 0.3, duck: 4, over: 4 },
  { id: 'snail', beat: 345, echo: [0.75, 0.4], rev: 0.2, duck: 4, over: 4 },
];

// ---------------------------------------------------------------- the score
export function buildScore() {
  const S = {
    pad: [], ep: [], bass: [], kick: [], clap: [], hat: [], ohat: [], shaker: [], conga: [], tom: [], snare: [], cymbal: [],
    riser: [], robot: [], bell: [], marimba: [], horn: [], calls: [], cues: [], tuneNotes: [],
    stomp: [], boing: [], tick: [], whistle: [], sample: [], dj: DJ.map(d => ({ ...d })),
  };
  const sw = 0.028; // swing on the off-sixteenths (beats)
  const at16 = (bar, step) => bar * 4 + step / 4 + (step % 2 ? sw : 0);

  // -------- drums
  const fourFloor = (bar, vel = 1, tone = 1) => {
    for (let b = 0; b < 4; b++) S.kick.push({ beat: bar * 4 + b, vel, tone });
  };
  const claps = (bar, vel = 0.8) => {
    for (const b of [1, 3]) S.clap.push({ beat: bar * 4 + b, vel });
  };
  const hats16 = (bar, vel = 0.32) => {
    for (let s = 0; s < 16; s++) {
      if (s % 4 === 2) continue; // the open hat takes the off-beat
      S.hat.push({ beat: at16(bar, s), vel: vel * [1, 0.5, 0, 0.62][s % 4] + (s % 4 === 0 ? 0 : 0.02) });
    }
  };
  const openHats = (bar, vel = 0.42) => {
    for (const b of [0.5, 1.5, 2.5, 3.5]) S.ohat.push({ beat: bar * 4 + b, vel });
  };
  const shaker16 = (bar, vel = 0.3) => {
    for (let s = 0; s < 16; s++) S.shaker.push({ beat: at16(bar, s), vel: vel * (s % 4 === 0 ? 1 : s % 2 ? 0.55 : 0.75) });
  };
  const congas = (bar, vel = 0.5) => {
    const pat = [[2, 74], [5, 67], [7, 74], [10, 79], [11, 74], [13, 67], [15, 74]];
    for (const [s, m] of pat) S.conga.push({ beat: at16(bar, s), midi: m, vel: vel * (s === 10 ? 1 : 0.8) });
  };
  // double time over the same beat: a snare on every eighth off-beat
  const doubleSnare = (bar, vel = 0.4) => {
    for (const b of [0.5, 1.5, 2.5, 3.5]) S.snare.push({ beat: bar * 4 + b, vel });
  };

  // -------- bass
  const BASS_PAT = [[0, 0, 2, 1], [2, 1, 1.6, 0.8], [4, 0, 2, 0.95], [6, 1, 1, 0.75], [7, 1, 1, 0.55], [8, 0, 2, 1], [10, 1, 1.6, 0.8], [12, 0, 2, 0.95], [14, 1, 1.6, 0.8]];
  const discoBass = (bar, vel = 1, bright = 1, { walk = true } = {}) => {
    const ch = CHORDS[chordOfBar(bar)];
    const last = walk && bar % 4 === 3 && chordOfBar(bar) === 'D11';
    for (const [s, oct, len, v] of BASS_PAT) {
      if (last && s >= 12) continue;
      S.bass.push({ beat: at16(bar, s), dur: (len / 4) * 0.48, midi: ch.root + 12 * oct, vel: v * vel, bright });
    }
    if (last) [50, 48, 45, 42].forEach((m, k) => S.bass.push({ beat: at16(bar, 12 + k), dur: 0.11, midi: m, vel: 0.8 * vel, bright }));
  };

  // -------- pad, e-piano, arp
  const padBar = (bar, opts = {}) => {
    const name = opts.chord ?? chordOfBar(bar);
    S.pad.push({ beat: bar * 4, beats: opts.beats ?? 4, notes: CHORDS[name].pad, attack: opts.attack ?? 0.05, release: opts.release ?? 0.3, vel: opts.vel ?? 1 });
  };
  const EP_STEPS = [3, 6, 10, 14];
  const epComp = (bar, vel = 0.5) => {
    const ch = CHORDS[chordOfBar(bar)];
    for (const s of EP_STEPS) S.ep.push({ beat: at16(bar, s), dur: 0.13, notes: ch.ep, vel: vel * (s === 10 ? 1 : 0.85) });
  };
  const ARP = [0, -1, 2, 4, -1, 3, 2, -1, 0, 2, -1, 4, 3, -1, 1, 2];
  const arpBar = (bar, vel = 0.4, oct = 12) => {
    const ch = CHORDS[chordOfBar(bar)];
    ARP.forEach((k, s) => {
      if (k < 0) return;
      S.bell.push({ beat: at16(bar, s), midi: ch.arp[k] + oct, vel: vel * (s % 4 === 0 ? 1 : 0.72), decay: 0.32, pan: s % 2 ? 0.45 : -0.45, delay: 1 });
    });
  };
  const PENTA = [67, 69, 71, 74, 76];
  const twinkles = (bar, count, seed, vel = 0.22) => {
    const r = rng(seed);
    for (let k = 0; k < count; k++) {
      const step = Math.floor(r() * 16);
      const midi = PENTA[Math.floor(r() * 5)] + (r() < 0.5 ? 24 : 36);
      S.bell.push({ beat: bar * 4 + step / 4, midi: Math.min(midi, 100), vel: vel * (0.6 + 0.4 * r()), decay: 0.7, pan: r() * 1.6 - 0.8, delay: 1, bright: 0.5 });
    }
  };

  // -------- animals
  const PAN = { grazers: -0.35, turtles: -0.18, frogs: 0.18, lizards: 0.35, flyers: 0 };
  const call = (group, beat, o = {}) => {
    S.calls.push({ group, beat, dur: o.dur ?? 1, vel: o.vel ?? 1, take: o.take ?? 0, mode: o.mode ?? 'onset', octave: o.octave ?? 0, pan: o.pan ?? PAN[group] });
    S.cues.push({ beat: round(beat), kind: 'call', group });
  };
  const sing = (hook, { robot = 'none', horn = 'none', vel = 1, marimba = true } = {}) => {
    TUNE.forEach((phrase, p) => {
      phrase.forEach((g, k) => {
        const beat = hook + TUNE_AT[p][k];
        const dur = TUNE_LEN[p][k];
        call(g, beat, { dur, vel, pan: PAN[g] * 0.5 });
        S.tuneNotes.push({ group: g, beat });
        if (marimba) S.marimba.push({ beat, midi: TONE[g], vel: 0.55 });
        const echo = robot === 'echo' && p < 2;
        if (robot === 'unison' || (robot === 'echo' && p >= 2)) S.robot.push({ beat, dur: dur * 0.48 * 0.92, midi: TONE[g], vel: robot === 'echo' ? 0.6 : 0.85, vowels: ['u', 'a'] });
        if (echo) {
          const last = k === phrase.length - 1;
          S.robot.push({ beat: beat + 4, dur: (last && p === 1 ? 1 : dur) * 0.48 * 0.92, midi: TONE[g], vel: 0.8, vowels: ['o', 'a'] });
        }
        if (robot === 'third') S.robot.push({ beat, dur: dur * 0.48 * 0.92, midi: thirdAbove(TONE[g]), vel: 0.62, vowels: ['e', 'a'] });
        if (horn === 'echo' && p < 2) {
          const last = k === phrase.length - 1;
          hornNote(beat + 4, last && p === 1 ? 1 : dur, TONE[g] - 12, 0.9);
        }
        if ((horn === 'echo' && p >= 2) || horn === 'unison') hornNote(beat, dur, TONE[g] - 12, 0.85);
      });
    });
  };
  const hornNote = (beat, beats, midi, vel = 1) => {
    S.horn.push({ beat, dur: Math.min(beats * 0.48, 2.5), midi, vel });
    S.cues.push({ beat: round(beat), kind: 'horn' });
  };
  const chopPattern = (group, bar, steps, o = {}) => {
    steps.forEach(([s, len, take = 0, oct = 0], k) =>
      call(group, at16(bar, s) - (s % 2 ? sw : 0), { dur: len / 4, take, octave: oct, mode: 'chop', vel: (o.vel ?? 1) * (k === 0 ? 1 : 0.88), pan: o.pan }),
    );
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
      [[0, 2, 0], [3, 2, 1], [6, 2, 0], [8, 1, 1], [10, 2, 0], [12, 1, 1], [13, 1, 0], [14, 2, 1]],
    ],
    lizards: [
      [[2, 1, 0], [3, 1, 1], [4, 1, 0], [7, 1, 1], [10, 1, 0], [11, 1, 1], [12, 1, 0], [15, 1, 1]],
      [[2, 1, 0], [3, 1, 1], [4, 1, 0], [6, 1, 1], [8, 1, 0], [10, 1, 1], [12, 1, 0], [13, 1, 1], [14, 1, 0], [15, 1, 1]],
    ],
  };
  // her wings: one beat of them (chapter 4's wing foley, three takes in turn)
  let wingK = 0;
  const wing = (beat, vel, o = {}) => {
    S.sample.push({ beat, file: `kafli4/hljod/wing-${(wingK++ % 3) + 1}.mp3`, vel, align: 'onset', pan: o.pan ?? 0, rev: o.rev ?? 0.15, group: 'wings' });
    S.cues.push({ beat: round(beat), kind: 'wings' });
  };
  // the beetles keep the beat while everything is frozen: tick (G6) on 1 and 3, tock (D6) on 2 and 4
  const beetles = (from, beats) => {
    for (let b = 0; b < beats; b++) {
      const beat = from + b;
      S.tick.push({ beat, midi: b % 2 ? 86 : 91, vel: b % 4 === 0 ? 1 : 0.8, pan: b % 2 ? 0.25 : -0.25 });
      S.cues.push({ beat: round(beat), kind: 'call', group: 'beetles' });
    }
  };

  // ======== Intro (bars 0-3): she flies in and lands
  for (let bar = 0; bar < 4; bar++) {
    padBar(bar, { attack: bar === 0 ? 1.2 : 0.3, release: 0.6, vel: 1 });
    twinkles(bar, [3, 5, 6, 7][bar], 100 + bar, 0.2 + bar * 0.03);
  }
  for (let bar = 2; bar < 4; bar++) for (let b = 0; b < 4; b++) S.kick.push({ beat: bar * 4 + b, vel: 0.45 + (bar - 2) * 0.15 + b * 0.03, tone: 0.25 });
  S.bass.push({ beat: 8, dur: 1.9, midi: 36, vel: 0.55, bright: 0.25 });
  S.bass.push({ beat: 12, dur: 1.3, midi: 38, vel: 0.6, bright: 0.3 });
  [[12, 0.15], [12.5, 0.2], [13, 0.25], [13.5, 0.3], [14, 0.35], [14.5, 0.4], [15, 0.45], [15.25, 0.5], [15.5, 0.55], [15.75, 0.6]].forEach(([b, v]) => S.hat.push({ beat: b, vel: v * 0.6 }));
  S.cymbal.push({ beat: 12, seconds: 4 * 0.48, reverse: true, vel: 0.22 });
  // her wings, nearer each beat, then the landing
  [[0, 0.3, -0.5], [1, 0.42, -0.3], [2, 0.6, -0.1]].forEach(([b, v, p]) => wing(b, v, { pan: p, rev: 0.35 }));
  S.sample.push({ beat: 1.5, file: 'kafli4/hljod/whoosh-3.mp3', vel: 0.3, align: 'peak', pan: 0.2, rev: 0.3, group: 'fx' });
  S.cues.push({ beat: 2.5, kind: 'land' });
  call('frogs', 9.5, { take: 1, vel: 0.4, pan: 0.6 });
  call('lizards', 11, { vel: 0.35, pan: -0.6 });
  S.cues.push({ beat: 12, kind: 'rise' });

  // ======== Dance floor (bars 4-11): two identical 4-bar halves (the loop is the second)
  for (let bar = 4; bar < 12; bar++) {
    fourFloor(bar);
    hats16(bar);
    shaker16(bar, 0.16);
    discoBass(bar);
    padBar(bar);
    arpBar(bar, 0.4);
  }
  S.cymbal.push({ beat: 16, seconds: 2.2, vel: 0.11 });
  S.cues.push({ beat: 16, kind: 'hit' });

  // ======== Her song, sung by the animals (bars 12-19)
  for (let bar = 12; bar < 20; bar++) {
    fourFloor(bar);
    claps(bar);
    hats16(bar, 0.28);
    openHats(bar, 0.36);
    discoBass(bar, 0.95);
    padBar(bar, { vel: 0.85 });
    epComp(bar, 0.42);
  }
  S.cymbal.push({ beat: 48, seconds: 2.4, vel: 0.12 });
  S.cues.push({ beat: 48, kind: 'hit' });
  sing(48, { robot: 'echo' });

  // ======== Stomp game: grazers (bars 20-23), half time, each stomp a deep thud with a rumble
  for (let bar = 20; bar < 24; bar++) {
    S.kick.push({ beat: bar * 4, vel: 1, tone: 1 }, { beat: bar * 4 + 2, vel: 0.95, tone: 1 });
    if (bar % 2 === 1) S.kick.push({ beat: bar * 4 + 3.5, vel: 0.55, tone: 0.8 });
    for (const b of [0, 2]) {
      S.stomp.push({ beat: bar * 4 + b, vel: b ? 0.9 : 1 });
      S.cues.push({ beat: bar * 4 + b, kind: 'stomp' });
    }
    S.clap.push({ beat: bar * 4 + 2, vel: 0.85 });
    for (const b of [0.5, 1.5, 2.5, 3.5]) S.hat.push({ beat: bar * 4 + b, vel: 0.22 });
    const ch = CHORDS[chordOfBar(bar)];
    S.bass.push({ beat: bar * 4, dur: 1.4 * 0.48, midi: ch.root, vel: 1, bright: 0.7 });
    S.bass.push({ beat: bar * 4 + 1.5, dur: 0.4 * 0.48, midi: ch.root + 12, vel: 0.7, bright: 0.7 });
    S.bass.push({ beat: bar * 4 + 2, dur: 1.4 * 0.48, midi: ch.root, vel: 0.95, bright: 0.7 });
    S.bass.push({ beat: bar * 4 + 3.5, dur: 0.4 * 0.48, midi: ch.root + 12, vel: 0.7, bright: 0.7 });
    padBar(bar, { vel: 0.8 });
    chopPattern('grazers', bar, CHOPS.grazers[bar - 20], { vel: 1 });
  }
  S.cues.push({ beat: 80, kind: 'hit' });

  // ======== Slow... quick!: turtles (bars 24-25 slow half time, 26-27 double time)
  for (let bar = 24; bar < 26; bar++) {
    S.kick.push({ beat: bar * 4, vel: 1, tone: 0.8 }, { beat: bar * 4 + 2.5, vel: 0.5, tone: 0.5 });
    S.clap.push({ beat: bar * 4 + 2, vel: 0.7 });
    S.snare.push({ beat: bar * 4 + 2, vel: 0.3 });
    for (let s = 0; s < 8; s++) S.hat.push({ beat: bar * 4 + s / 2, vel: s % 2 ? 0.16 : 0.1 });
    const ch = CHORDS[chordOfBar(bar)];
    S.bass.push({ beat: bar * 4, dur: 2.3 * 0.48, midi: ch.root, vel: 0.95, bright: 0.35 });
    S.bass.push({ beat: bar * 4 + 2.5, dur: 1.3 * 0.48, midi: ch.root, vel: 0.7, bright: 0.35 });
    padBar(bar, { vel: 0.8, attack: 0.3, release: 0.5 });
  }
  // the turtles hum long, slow re notes
  for (const [b, d] of [[98, 1.8], [100, 1.8], [102, 1.8]]) call('turtles', b, { dur: d, vel: 0.95, pan: -0.25 });
  S.cymbal.push({ beat: 100, seconds: 4 * 0.48, reverse: true, vel: 0.14 });
  for (let bar = 26; bar < 28; bar++) {
    fourFloor(bar, 0.95);
    claps(bar, 0.75);
    doubleSnare(bar, 0.42);
    hats16(bar, 0.28);
    const ch = CHORDS[chordOfBar(bar)];
    for (let e = 0; e < 8; e++) S.bass.push({ beat: bar * 4 + e / 2, dur: 0.2, midi: ch.root + (e % 2 ? 12 : 0), vel: 0.85, bright: 0.85 });
    padBar(bar, { vel: 0.85 });
    // turtles in sixteenths (every one but the downbeats)
    const steps = [];
    for (let s = 1; s < 16; s++) if (s % 4) steps.push([s, 0.9]);
    chopPattern('turtles', bar, steps, { vel: 0.7 });
    const tomPat = bar === 27 ? [[12, 0], [13, -2], [14, -5], [15, -7]] : [[7, 0], [15, -5]];
    for (const [s, d] of tomPat) S.tom.push({ beat: at16(bar, s), midi: ch.root + 24 + 7 + d, vel: 0.6 });
  }
  S.cymbal.push({ beat: 104, seconds: 2.2, vel: 0.12 });
  S.cues.push({ beat: 96, kind: 'slow' }, { beat: 104, kind: 'quick' });

  // ======== Hop game: frogs (bars 28-31); bar 30 thins to the hops, two more hops at the end of bar 31
  const hops = [[120, 71], [121, 74], [122, 76], [123, 79], [126, 79], [127, 83]];
  for (let bar = 28; bar < 32; bar++) {
    const hopBar = bar === 30;
    if (!hopBar) {
      fourFloor(bar);
      claps(bar, 0.75);
      hats16(bar, 0.26);
      congas(bar, 0.45);
      discoBass(bar, 1, 1, { walk: false });
    } else {
      fourFloor(bar, 0.9, 0.7);
      for (let b = 0; b < 4; b++) S.bass.push({ beat: bar * 4 + b, dur: 0.18, midi: CHORDS[chordOfBar(bar)].root + 12, vel: 0.85, bright: 0.9 });
    }
    padBar(bar, { vel: 0.85 });
  }
  chopPattern('frogs', 28, CHOPS.frogs[0], { vel: 0.95 });
  chopPattern('frogs', 29, CHOPS.frogs[0], { vel: 0.95 });
  chopPattern('frogs', 31, [[0, 2, 0], [3, 2, 1], [6, 2, 0]], { vel: 0.95 });
  for (const [b, m] of hops) {
    S.boing.push({ beat: b, midi: m, vel: 0.9 });
    call('frogs', b, { dur: 0.7, vel: 0.9, take: 1, pan: (m - 77) / 20 });
    S.cues.push({ beat: b, kind: 'hop' });
  }

  // ======== Faster!: lizards (bars 32-35), double time; the last bar a snare run into the flyers
  for (let bar = 32; bar < 36; bar++) {
    fourFloor(bar);
    claps(bar);
    hats16(bar, 0.24);
    openHats(bar, 0.32);
    shaker16(bar, 0.28);
    if (bar < 35) doubleSnare(bar, 0.36 + 0.06 * (bar - 32));
    else for (let k = 0; k < 16; k++) S.snare.push({ beat: bar * 4 + k / 4, vel: 0.3 + 0.3 * (k / 15) });
    discoBass(bar);
    padBar(bar, { vel: 0.85 });
    epComp(bar, 0.32);
    arpBar(bar, 0.22);
    if (bar < 34) chopPattern('lizards', bar, CHOPS.lizards[bar - 32 ? 1 : 0], { vel: 0.9 });
    else {
      const steps = [];
      for (let s = 0; s < 16; s++) if (s % 4) steps.push([s, 0.9, s % 2]);
      chopPattern('lizards', bar, steps, { vel: 0.75 });
    }
  }
  S.riser.push({ beat: 136, seconds: 8 * 0.48, vel: 0.22, from: 600, to: 9000 });
  S.cues.push({ beat: 128, kind: 'quick' });

  // ======== Higher!: flyers (bars 36-39), an octave higher at each "Hærra!"
  for (let bar = 36; bar < 40; bar++) {
    fourFloor(bar);
    claps(bar);
    hats16(bar, 0.28);
    openHats(bar, 0.4);
    shaker16(bar, 0.24);
    congas(bar, 0.3);
    discoBass(bar);
    padBar(bar, { vel: 0.9 });
    epComp(bar, 0.34);
    arpBar(bar, 0.24 + 0.04 * (bar - 36), bar >= 38 ? 24 : 12);
    const oct = [-1, 0, 1, 1][bar - 36];
    const flyer = bar === 39 ? [[0, 4], [4, 4], [8, 4], [12, 4]] : [[0, 8], [10, 6]];
    for (const [s, len] of flyer) call('flyers', bar * 4 + s / 4, { dur: len / 4, vel: 0.95, octave: oct, pan: (s / 16) * 1.0 - 0.4 });
    if (bar === 39) for (const s of [2, 6, 10, 14]) call('flyers', bar * 4 + s / 4, { dur: 0.5, vel: 0.55, octave: 0, pan: 0.4 - s / 20 });
    S.cues.push({ beat: bar * 4, kind: 'higher' });
  }
  [[144, 74, 3.6], [148, 76, 3.6], [152, 79, 3.6], [156, 81, 3.4]].forEach(([b, m, beats]) => S.robot.push({ beat: b, dur: beats * 0.48, midi: m, vel: 0.5, vowels: ['o', 'a'], morph: 0.4 }));

  // ======== Freeze dance (bars 40-47): dance 2 bars, freeze 2, dance 2, freeze 2
  const danceBar = (bar, { last = false } = {}) => {
    fourFloor(bar);
    claps(bar, 0.85);
    hats16(bar, 0.3);
    openHats(bar, 0.42);
    shaker16(bar, 0.24);
    congas(bar, 0.32);
    for (const b of [1, 3]) S.snare.push({ beat: bar * 4 + b, vel: 0.4 });
    discoBass(bar, 1, 1, { walk: false });
    padBar(bar);
    epComp(bar, 0.38);
    arpBar(bar, 0.2);
    if (last) S.snare.push({ beat: bar * 4 + 3.5, vel: 0.5 }, { beat: bar * 4 + 3.75, vel: 0.6 });
  };
  const freeze = from => {
    // the music stops; what is left is the moment frozen: its chord held bright and still, ice twinkling, the beetles' clock
    S.pad.push({ beat: from, beats: 8, notes: CHORDS.C.pad.map(m => m + 12), attack: 0.015, release: 0.5, vel: 0.85 });
    S.pad.push({ beat: from, beats: 8, notes: [CHORDS.C.root + 24, CHORDS.C.root + 31], attack: 0.015, release: 0.5, vel: 0.75 });
    const r = rng(from);
    for (let s = 0; s < 32; s++) {
      if (r() < 0.45) continue;
      const midi = [76, 79, 83, 84, 88][Math.floor(r() * 5)] + 12;
      S.bell.push({ beat: from + s / 4, midi, vel: 0.08 + 0.06 * r(), decay: 0.4, pan: r() * 1.4 - 0.7, delay: 1, bright: 0.4 });
    }
    beetles(from, 8);
    S.cymbal.push({ beat: from + 4, seconds: 4 * 0.48, reverse: true, vel: 0.16 });
    S.cues.push({ beat: from, kind: 'freeze' }, { beat: from + 8, kind: 'dance' });
  };
  danceBar(40);
  danceBar(41, { last: true });
  S.cymbal.push({ beat: 160, seconds: 2.4, vel: 0.14 });
  freeze(168);
  call('turtles', 168.75, { dur: 1.25, vel: 0.85, pan: -0.4 }); // one slow turtle keeps going...
  call('turtles', 169.75, { dur: 0.6, vel: 0.6, pan: -0.4 }); // ...and stops, late
  danceBar(44);
  danceBar(45, { last: true });
  S.cymbal.push({ beat: 176, seconds: 2.4, vel: 0.14 });
  freeze(184);
  call('frogs', 189.5, { dur: 0.4, vel: 0.35, take: 1, pan: 0.5 }); // a frog nearly moves

  // ======== Everyone dances (bars 48-51): every group's own pattern at once; the last bar thins for her horn
  for (let bar = 48; bar < 51; bar++) {
    danceBar(bar);
    chopPattern('grazers', bar, CHOPS.grazers[bar % 4], { vel: 0.5 });
    chopPattern('turtles', bar, CHOPS.turtles[0], { vel: 0.4 });
    chopPattern('frogs', bar, CHOPS.frogs[0].filter(([s]) => s >= 3), { vel: 0.38 });
    chopPattern('lizards', bar, CHOPS.lizards[0], { vel: 0.32 });
    call('flyers', bar * 4 + 0.5, { dur: 1.5, vel: 0.45, pan: 0.5 });
  }
  S.cymbal.push({ beat: 192, seconds: 2.6, vel: 0.16 });
  S.cues.push({ beat: 192, kind: 'hit' });
  // bar 51: the kick and pad only, then the break
  for (let b = 0; b < 4; b++) S.kick.push({ beat: 204 + b, vel: 0.75 - b * 0.08, tone: 0.6 });
  padBar(51, { vel: 0.9, release: 0.6 });
  S.bass.push({ beat: 204, dur: 1.4, midi: 38, vel: 0.6, bright: 0.3 });
  S.cymbal.push({ beat: 204, seconds: 4 * 0.48, reverse: true, vel: 0.15 });

  // ======== Her horn (bars 52-59), as Ljósfluguballið's break
  for (let bar = 52; bar < 60; bar++) {
    const name = chordOfBar(bar);
    const prev = bar > 52 ? chordOfBar(bar - 1) : null;
    if (name !== prev) {
      let len = 1;
      while (bar + len < 60 && chordOfBar(bar + len) === name) len++;
      S.pad.push({ beat: bar * 4, beats: len * 4, notes: CHORDS[name].pad, attack: 0.5, release: 0.9, vel: 0.95 });
    }
    const ep = CHORDS[name].ep;
    for (let b = 0; b < 4; b++) S.ep.push({ beat: bar * 4 + b + 0.5, dur: 0.4, notes: [ep[(b + bar) % ep.length] + 12], vel: 0.32 });
    twinkles(bar, 4, 200 + bar - 12, 0.2);
    if (bar >= 56) {
      for (let b = 0; b < 4; b++) S.shaker.push({ beat: bar * 4 + b + 0.5, vel: 0.12 + (bar - 56) * 0.04 });
      S.bass.push({ beat: bar * 4, dur: 3.6 * 0.48, midi: CHORDS[name].root + 12, vel: 0.3 + (bar - 56) * 0.07, bright: 0.25 });
    }
  }
  S.cues.push({ beat: 208, kind: 'hit' });
  TUNE.forEach((phrase, p) => phrase.forEach((g, k) => {
    const lens = [[1.5, 5], [1.5, 1.5, 4.5], [1.5, 1.5, 1, 3.5], [1.5, 1.5, 0.5, 0.5, 4]];
    hornNote(208 + TUNE_AT[p][k], lens[p][k], TONE[g] - 12, 1);
  }));

  // ======== Take-off (bars 60-67): Ljósfluguballið's rise with her wings and the wind; the beat drops out for the countdown
  const GAP = 269; // from here only the pad, the riser, the wind, her wings and her countdown until the drop at 272
  for (let bar = 60; bar < 68; bar++) {
    const u = (bar - 60) / 7;
    for (let b = 0; b < 4; b++) if (bar * 4 + b < GAP) S.kick.push({ beat: bar * 4 + b, vel: 0.5 + 0.42 * u, tone: 0.3 + 0.7 * u });
    padBar(bar, { vel: 0.85 + 0.15 * u });
    if (bar >= 62) for (const b of [0.5, 1.5, 2.5, 3.5]) if (bar * 4 + b < GAP) S.hat.push({ beat: bar * 4 + b, vel: 0.2 + 0.15 * u });
    if (bar < 64) discoBass(bar, 0.6 + 0.2 * u, 0.6);
    else {
      const root = CHORDS[chordOfBar(bar)].root;
      for (let e = 0; e < 8; e++) if (bar * 4 + e / 2 < GAP) S.bass.push({ beat: bar * 4 + e / 2, dur: 0.2, midi: root + (e % 2 ? 12 : 0), vel: 0.75 + 0.2 * u, bright: 0.6 + 0.4 * u });
    }
    const per = bar < 62 ? 2 : bar < 64 ? 1 : bar < 66 ? 0.5 : 0.25;
    for (let b = 0; b < 4; b += per) if (bar * 4 + b + (bar < 62 ? 1 : 0) < GAP) S.snare.push({ beat: bar * 4 + b + (bar < 62 ? 1 : 0), vel: 0.16 + 0.5 * ((bar - 60 + b / 4) / 8) });
    if (bar >= 64) arpBar(bar, 0.16 + 0.1 * u, bar >= 66 ? 24 : 12);
  }
  for (let b = 268; b < GAP; b += 0.125) S.snare.push({ beat: b, vel: 0.6 });
  S.bell.splice(0, S.bell.length, ...S.bell.filter(e => !(e.beat >= GAP && e.beat < 272)));
  S.riser.push({ beat: 240, seconds: 32 * 0.48, vel: 0.46 });
  S.cymbal.push({ beat: 264, seconds: 8 * 0.48, reverse: true, vel: 0.2 });
  S.cues.push({ beat: 240, kind: 'rise' });
  GROUPS.slice(0, 4).forEach((g, k) => {
    for (let b = 0; b < 4; b++) call(g, 240 + k * 4 + b, { mode: 'chop', dur: 0.7, vel: 0.8 + 0.05 * k, take: b % 2 && g !== 'turtles' && g !== 'flyers' ? 1 : 0 });
  });
  for (let e = 0; e < 16; e++) call(GROUPS[e % 5], 256 + e / 2, { mode: 'chop', dur: 0.45, vel: 0.85, take: 0 });
  for (let s = 0; s < 32; s++) if (264 + s / 4 < GAP) call(GROUPS[s % 5], 264 + s / 4, { mode: 'chop', dur: 0.24, vel: 0.8 + 0.15 * (s / 32), take: 0 });
  [[256, 67, 4], [260, 69, 4], [264, 71, 4], [268, 72, 1]].forEach(([b, m, beats], k) =>
    S.robot.push({ beat: b, dur: beats * 0.48 * 0.97, midi: m, vel: 0.45 + 0.08 * k, vowels: ['u', 'a'], morph: 0.6 }),
  );
  // her wings: every two beats, then every beat, then every half beat; a big beat on each count and on the drop
  for (let b = 240; b < 256; b += 2) wing(b, 0.4 + 0.15 * ((b - 240) / 16), { pan: ((b / 2) % 2 ? 0.3 : -0.3) });
  for (let b = 256; b < 264; b++) wing(b, 0.5 + 0.1 * ((b - 256) / 8), { pan: b % 2 ? 0.3 : -0.3 });
  for (let b = 264; b < 269; b += 0.5) wing(b, 0.55 + 0.1 * ((b - 264) / 5), { pan: (b * 2) % 2 ? 0.35 : -0.35 });
  for (const b of [269, 270, 271]) wing(b, 0.7, { rev: 0.3 });
  wing(272, 0.8, { rev: 0.3 });
  S.sample.push({ beat: 248, file: 'kafli4/hljod/gust-1.mp3', vel: 0.25, align: 'start', fadeIn: 0.4, pan: -0.3, rev: 0.1, group: 'fx' });
  S.sample.push({ beat: 256, file: 'kafli4/hljod/airflow.mp3', vel: 0.5, align: 'start', len: 16 * 0.48, fadeIn: 16 * 0.48, fadeOut: 0.08, rev: 0, group: 'fx' });
  S.sample.push({ beat: 260, file: 'kafli4/hljod/gust-3.mp3', vel: 0.22, align: 'start', fadeIn: 0.8, pan: 0.3, rev: 0.1, group: 'fx' });
  S.sample.push({ beat: 272, file: 'kafli4/hljod/whoosh-2.mp3', vel: 0.35, align: 'peak', rev: 0.2, group: 'fx' });
  S.cues.push({ beat: 269, kind: 'countdown' });

  // ======== Now! / All together (bars 68-83): Ljósfluguballið's peak, her wings beating time with the claps
  for (let bar = 68; bar < 84; bar++) {
    fourFloor(bar);
    claps(bar, 0.85);
    hats16(bar, 0.3);
    openHats(bar, 0.42);
    shaker16(bar, 0.26);
    congas(bar, bar < 76 ? 0.3 : 0.38);
    for (const b of [1, 3]) S.snare.push({ beat: bar * 4 + b, vel: 0.42 });
    discoBass(bar);
    padBar(bar);
    if (bar >= 76) S.pad.push({ beat: bar * 4, beats: 4, notes: CHORDS[chordOfBar(bar)].pad.slice(2).map(m => m + 12), attack: 0.05, release: 0.3, vel: 0.45 });
    epComp(bar, 0.4);
    arpBar(bar, bar < 76 ? 0.16 : 0.24);
    for (const b of [1, 3]) wing(bar * 4 + b, 0.42, { pan: b === 1 ? -0.4 : 0.4, rev: 0.1 });
  }
  S.cymbal.push({ beat: 272, seconds: 2.6, vel: 0.16 }, { beat: 304, seconds: 2.6, vel: 0.15 });
  S.cues.push({ beat: 272, kind: 'peak' }, { beat: 304, kind: 'peak' });
  sing(272, { robot: 'unison', horn: 'echo' });
  sing(304, { robot: 'third', horn: 'unison' });
  for (let bar = 76; bar < 84; bar++) {
    chopPattern('turtles', bar, CHOPS.turtles[0], { vel: 0.34 });
    if (bar % 2 === 0) chopPattern('frogs', bar, CHOPS.frogs[0].filter(([s]) => s >= 3), { vel: 0.32 });
    else chopPattern('lizards', bar, CHOPS.lizards[0], { vel: 0.3 });
  }

  // ======== Ending (bars 84-87): stop-time last phrase, then do held by all five; the snail arrives; the last hit at 352
  S.cymbal.push({ beat: 332, seconds: 4 * 0.48, reverse: true, vel: 0.14 });
  TUNE[3].slice(0, 4).forEach((g, k) => {
    const beat = 336 + k;
    call(g, beat, { dur: 0.9, vel: 1, pan: 0 });
    S.marimba.push({ beat, midi: TONE[g], vel: 0.6 });
    S.robot.push({ beat, dur: 0.38, midi: TONE[g], vel: 0.8, vowels: ['o', 'a'] });
    hornNote(beat, 0.8, TONE[g] - 12, 0.85);
    const name = k < 2 ? 'C' : 'D11';
    S.pad.push({ beat, beats: 0.45, notes: CHORDS[name].pad, attack: 0.004, release: 0.12, vel: 0.9 });
    S.ep.push({ beat, dur: 0.2, notes: CHORDS[name].ep, vel: 0.5 });
    S.bass.push({ beat, dur: 0.2, midi: CHORDS[name].root + 12, vel: 0.9, bright: 0.8 });
    S.kick.push({ beat, vel: 0.85, tone: 1 });
    S.clap.push({ beat, vel: 0.35 + 0.1 * k });
  });
  S.cues.push({ beat: 336, kind: 'hit' });
  for (const g of GROUPS) call(g, 340, { dur: 4, vel: g === 'grazers' ? 0.9 : 0.62 });
  S.marimba.push({ beat: 340, midi: 67, vel: 0.6 });
  hornNote(340, 5, 55, 0.85);
  S.robot.push({ beat: 340, dur: 7.6 * 0.48, midi: 67, vel: 0.65, vowels: ['o', 'a'], morph: 0.5 });
  S.pad.push({ beat: 340, beats: 12, notes: CHORDS.G69.pad, attack: 0.02, release: 0.5, vel: 0.85 });
  S.bass.push({ beat: 340, dur: 3.5 * 0.48, midi: 31, vel: 1, bright: 0.8 });
  S.bass.push({ beat: 344, dur: 3.5 * 0.48, midi: 43, vel: 0.85, bright: 0.6 });
  S.bass.push({ beat: 348, dur: 3.5 * 0.48, midi: 31, vel: 0.85, bright: 0.6 });
  S.cymbal.push({ beat: 340, seconds: 3, vel: 0.16 });
  for (let b = 340; b < 352; b++) S.kick.push({ beat: b, vel: 0.8, tone: 0.9 });
  for (let b = 341; b < 352; b += 2) S.clap.push({ beat: b, vel: 0.6 });
  for (let b = 340; b < 352; b++) S.ohat.push({ beat: b + 0.5, vel: 0.28 });
  for (let b = 344; b < 352; b += 2) wing(b + 1, 0.35, { pan: b % 4 ? 0.4 : -0.4, rev: 0.1 });
  // the snail: a little squeak as it slides in, then its slide whistle climbs to do and lands on the last hit
  S.whistle.push({ beat: 343.5, path: [[0, 79], [0.6, 86], [1, 83]], beats: 0.75, hold: 0, vel: 0.55 });
  S.whistle.push({ beat: 350, path: [[0, 67], [0.25, 69], [0.55, 79], [1, 91]], beats: 2, hold: 0.9, vel: 0.6, check: 91 });
  S.cues.push({ beat: 343.5, kind: 'call', group: 'snail' }, { beat: 350, kind: 'call', group: 'snail' });
  S.kick.push({ beat: 352, vel: 0.9, tone: 1 });
  S.clap.push({ beat: 352, vel: 0.6 });
  S.bass.push({ beat: 352, dur: 0.9, midi: 31, vel: 1, bright: 0.8 });
  S.pad.push({ beat: 352, beats: 1.2, notes: CHORDS.G69.pad, attack: 0.004, release: 0.6, vel: 0.95 });
  S.ep.push({ beat: 352, dur: 1.2, notes: [...CHORDS.G69.ep, 74], vel: 0.6 });
  S.bell.push({ beat: 352, midi: 91, vel: 0.35, decay: 0.9, pan: 0, delay: 1 });
  call('grazers', 352, { dur: 2, vel: 0.9, pan: 0 });
  S.marimba.push({ beat: 352, midi: 67, vel: 0.5 });
  S.cues.push({ beat: 340, kind: 'hit' }, { beat: 352, kind: 'end' });

  // section dynamics (Ljósfluguballið's, at the same sections)
  const DYN = {
    groove: { kick: 0.8, bass: 0.8, pad: 0.85, hat: 0.85 },
    tuneA: { kick: 0.9, bass: 0.9 },
    grazers: { kick: 0.82, bass: 0.84 },
    turtles: { kick: 0.84, bass: 0.86, hat: 0.9 },
    frogs: { kick: 0.9, bass: 0.92 },
    lizards: { kick: 0.95, bass: 0.96 },
    flyers: { kick: 1, bass: 1 },
    stoppdans: { kick: 0.95, bass: 0.95 },
    end: { kick: 0.92 },
    snail: { kick: 0.9 },
  };
  for (const part of ['kick', 'bass', 'pad', 'hat']) for (const ev of S[part]) {
    const f = DYN[sectionAt(ev.beat).id]?.[part];
    if (f) ev.vel = +(ev.vel * f).toFixed(4);
  }
  // a group's chop never doubles its own note of her tune: the tune note wins
  const clash = c => c.mode === 'chop' && S.tuneNotes.some(t => t.group === c.group && Math.abs(t.beat - c.beat) < 0.5);
  const dropped = S.calls.filter(clash);
  S.calls = S.calls.filter(c => !clash(c));
  for (const d of dropped) {
    const i = S.cues.findIndex(q => q.kind === 'call' && q.group === d.group && q.beat === round(d.beat));
    if (i >= 0) S.cues.splice(i, 1);
  }
  for (const d of S.dj) S.cues.push({ beat: d.beat, kind: 'dj', id: d.id });
  S.cues.sort((a, b) => a.beat - b.beat || a.kind.localeCompare(b.kind));
  return S;
}

const round = b => Math.round(b * 1000) / 1000;
function thirdAbove(m) {
  const scale = [67, 69, 71, 72, 74, 76, 78, 79, 81, 83, 84];
  return scale[scale.indexOf(m) + 2];
}
