// "Skógurinn spilar" (the forest plays): the score. The forest is the band: feet, hands, sticks, stones, hollow logs, water,
// leaves and mouths are the drums; the animals' own calls, cut and moved to their tones, are the bass, the hi-hats, the riffs
// and the tune; a hollow-log bass and wind in hollow reeds hold the harmony.
//
// 108 bpm, 4/4, G major (the five tones: grazers G, turtles A, frogs B, lizards D, flyers E). Every event is placed in beats
// on the grid; the render turns beats into samples (24500 a beat).
//
// Her tune (a new one, by the rules): mi sol / la sol mi / do re mi sol / la sol mi re do. Phrase 3 climbs the choir from the
// grazers to the lizards, phrase 4 comes down the whole choir from the flyers to the grazers. One phrase per two bars, every
// note on a beat; the band answers in the gap, and the gap shrinks as the phrases grow.

export const BPM = 108;
export const KEY = 'G major';
export const GROUPS = ['grazers', 'turtles', 'frogs', 'lizards', 'flyers'];

const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function hz(n) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
  const midi = 12 * (Number(m[3]) + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

// The animals' tones, each in the octave nearest its own call.
export const TONE = { grazers: 'G3', turtles: 'A3', frogs: 'B6', lizards: 'D6', flyers: 'E6' };
// The same tones in the octave where the logs and her horn play the tune.
const LOG = { grazers: 'G4', turtles: 'A4', frogs: 'B4', lizards: 'D5', flyers: 'E5' };
const HORN = { grazers: 'G3', turtles: 'A3', frogs: 'B3', lizards: 'D4', flyers: 'E4' };
const DROP = { grazers: 'G5', turtles: 'A5', frogs: 'B5', lizards: 'D6', flyers: 'E6' };

/** Her tune: four phrases of group ids. */
export const TUNE = [
  ['frogs', 'lizards'],
  ['flyers', 'lizards', 'frogs'],
  ['grazers', 'turtles', 'frogs', 'lizards'],
  ['flyers', 'lizards', 'frogs', 'turtles', 'grazers'],
];
// Where each note falls in a pass of 32 beats, and how long it is held.
const TUNE_AT = [
  [[0, 1], [1, 2]],
  [[8, 1], [9, 1], [10, 2]],
  [[16, 1], [17, 1], [18, 1], [19, 2.5]],
  [[24, 1], [25, 1], [26, 1], [27, 1], [28, 3]],
];
// The chords of a pass, a bar each.
const PASS_CHORDS = ['G', 'C', 'Em', 'D', 'C', 'G', 'D', 'G'];

const CH = {
  G: { reed: ['B3', 'D4', 'G4'], top: 'D5', root: 'G2', fifth: 'D3' },
  C: { reed: ['C4', 'E4', 'G4'], top: 'E5', root: 'C3', fifth: 'G2' },
  Em: { reed: ['B3', 'E4', 'G4'], top: 'B4', root: 'E2', fifth: 'B2' },
  D: { reed: ['A3', 'D4', 'F#4'], top: 'A4', root: 'D3', fifth: 'A2' },
  Am7: { reed: ['A3', 'C4', 'E4', 'G4'], top: 'E5', root: 'A2', fifth: 'E3' },
  Bm: { reed: ['B3', 'D4', 'F#4'], top: 'B4', root: 'B2', fifth: 'F#2' },
};

// Where the groups stand by the pond (pan).
const PAN = { grazers: -0.45, turtles: -0.2, frogs: 0.05, lizards: 0.3, flyers: 0.5 };

export function buildScore() {
  const ev = [];
  const sections = [];
  const tuneNotes = [];
  const cues = [];
  const SW = 0.035; // 16th swing in beats
  const sw = b => (Math.abs((b * 4) % 2 - 1) < 1e-6 ? b + SW : b);

  const add = (b, i, s, p = {}, g = 1, pan = 0, rv = 0.12, ec = 0) => ev.push({ b, i, s, p, g, pan, rv, ec });
  const call = (b, group, role, p = {}, g = 1, extra = {}) => {
    add(b, 'call', 'animals', { group, ...p }, g, extra.pan ?? PAN[group] + (p.panShift ?? 0), extra.rv ?? 0.16, extra.ec ?? 0);
    cues.push({ beat: b, kind: 'call', group, role });
  };
  const section = (name, nameIs, startBeat, beats, feature, what) => sections.push({ name, nameIs, startBeat, beats, feature, what });

  // --- building blocks ----------------------------------------------------------------------------------------------
  const reeds = (b, chord, beats, g = 0.5, { top = false, attack = 0.25 } = {}) => {
    const c = CH[chord];
    const notes = top ? [...c.reed, c.top] : c.reed;
    notes.forEach((n, k) => add(b, 'reed', 'pad', { f: hz(n), dur: beats * 60 / BPM - 0.05, attack }, g * (k === notes.length - 1 && top ? 0.6 : 1), (k / (notes.length - 1)) * 0.8 - 0.4, 0.3));
  };
  const bass = (b, note, beats, g = 1, punch = 1) => add(b, 'logBass', 'bass', { f: hz(note), dur: beats * 60 / BPM * 0.92, punch }, g, 0, 0.02);
  const stompAt = (b, g = 1, size = 1) => add(b, 'stomp', 'beat', { size }, g, 0, 0.06);
  const clapAt = (b, g = 1, hands = 3) => add(b, 'clap', 'beat', { hands }, g, 0, 0.14);
  const patschAt = (b, g = 1) => add(b, 'patsch', 'beat', {}, g, -0.15, 0.08);
  const snapAt = (b, g = 1) => add(b, 'snap', 'beat', {}, g, 0.35, 0.15);
  const stickAt = (b, g = 1, pitch = 1) => add(sw(b), 'stick', 'beat', { pitch }, g, 0.3, 0.1);
  const stonesAt = (b, g = 1) => add(sw(b), 'stones', 'beat', {}, g, -0.35, 0.12);
  const leavesAt = (b, g = 1, dur = 0.07) => add(sw(b), 'leaves', 'beat', { dur }, g, 0.2, 0.06);
  const dropAt = (b, note, g = 1, s = 'lead', pan = 0.1) => add(b, 'drop', s, { f: hz(note) }, g, pan, 0.25, 0.15);
  const logAt = (b, note, g = 1, dur = 0.7) => add(b, 'logMarimba', 'lead', { f: hz(note), dur }, g, 0.12, 0.18);
  const shellAt = (b, note, g = 1) => add(sw(b), 'shell', 'beat', { f: hz(note) }, g, -0.25, 0.1);
  const frogTick = (b, g = 1) => add(sw(b), 'call', 'animals', { group: 'frogs', role: 'hat' }, g, 0.12, 0.05);
  const frogHats = (bar, g = 1, pattern = [0.5, 1.5, 2.5, 3.5]) => {
    for (const o of pattern) { frogTick(bar * 4 + o, g * (o % 1 === 0.5 ? 1 : 0.7)); cues.push({ beat: sw(bar * 4 + o), kind: 'call', group: 'frogs', role: 'hat' }); }
  };
  const shaker = (bar, g = 1, sixteenths = true) => {
    for (let k = 0; k < (sixteenths ? 16 : 8); k++) {
      const o = sixteenths ? k / 4 : k / 2;
      const acc = o % 1 === 0.5 ? 1 : o % 1 === 0 ? 0.55 : 0.4;
      leavesAt(bar * 4 + o, g * acc);
    }
  };
  // the main stomp groove of one bar
  const groove = (bar, g = 1, { kick = [0, 2.5], back = 'both', sticks = true, shake = true, ghost = true } = {}) => {
    const b = bar * 4;
    for (const o of kick) stompAt(b + o, g * (o === 0 ? 1 : 0.82));
    if (ghost) stompAt(b + 1.75, g * 0.38, 0.8);
    if (back === 'both' || back === 'patsch') { patschAt(b + 1, g * 0.8); patschAt(b + 3, g * 0.8); }
    if (back === 'both' || back === 'clap') { clapAt(b + 1, g * 0.75); clapAt(b + 3, g * 0.8); }
    if (sticks) for (const o of [0.5, 1.5, 2.5, 3.5]) stickAt(b + o, g * 0.32);
    if (shake) shaker(bar, g * 0.45);
  };
  // the band's answers after each phrase (pass 1: feet, hands and sticks)
  const answersFeet = (p0, g = 1) => {
    // after phrase 1 (bar 1 of the pass): boom boom CLAP, tick-a-tick CLACK
    stompAt(p0 + 4, g); stompAt(p0 + 4.5, g * 0.85); clapAt(p0 + 5, g * 0.9, 4);
    stickAt(p0 + 6, g * 0.6); stickAt(p0 + 6.25, g * 0.5); stickAt(p0 + 6.5, g * 0.6); stonesAt(p0 + 7, g * 0.7);
    // after phrase 2: slap slap CLAP, bloop, CLAP
    patschAt(p0 + 12.5, g); patschAt(p0 + 13, g); clapAt(p0 + 13.5, g * 0.9, 4);
    add(p0 + 14.5, 'drop', 'beat', { f: hz('D5'), size: 1.6 }, g * 0.7, -0.2, 0.3);
    clapAt(p0 + 15, g * 0.9, 4);
    // after phrase 3: boom CLAP boom CLAP
    stompAt(p0 + 22, g); clapAt(p0 + 22.5, g * 0.8); stompAt(p0 + 23, g); clapAt(p0 + 23.5, g * 0.9);
    // after phrase 4: snap snap
    snapAt(p0 + 30.5, g * 0.8); snapAt(p0 + 31, g * 0.9);
  };
  // one pass of her tune by the animals, doubled by the logs (and her horn when asked)
  const tunePass = (p0, { log = 0.55, horn = 0, role = 'tune', g = 1 } = {}) => {
    TUNE.forEach((phrase, pi) => phrase.forEach((group, ni) => {
      const [o, len] = TUNE_AT[pi][ni];
      const b = p0 + o;
      call(b, group, role, { dur: len * 60 / BPM * 0.95, tune: true }, g);
      tuneNotes.push({ group, beat: b });
      if (log) logAt(b, LOG[group], log, Math.min(1.2, len * 60 / BPM));
      if (horn) { add(b, 'horn', 'lead', { f: hz(HORN[group]), dur: len * 60 / BPM * 0.98 }, horn, -0.1, 0.25); cues.push({ beat: b, kind: 'horn', note: HORN[group] }); }
    }));
  };
  const passHarmony = (p0, { g = 0.5, top = false, bassG = 1, walk = false, moo = 0 } = {}) => {
    PASS_CHORDS.forEach((c, k) => {
      const b = p0 + k * 4;
      reeds(b, c, 4, g, { top });
      if (bassG) {
        bass(b, CH[c].root, 2.4, bassG);
        bass(b + 2.5, walk && k % 2 ? CH[c].fifth : CH[c].root, 1.4, bassG * 0.8, 0.7);
      }
      if (moo && c !== 'D') { call(b, 'grazers', 'bass', { dur: 0.32, chop: true }, moo); }
    });
  };

  // ==================================================================================================================
  // 0. Inngangur: the forest wakes, one sound at a time (bars 0-3)
  section('Intro', 'Inngangur', 0, 16, null, 'The pond wakes up one sound at a time: a water drop, then sticks, then feet, then hands; the frogs tick last.');
  add(0, 'pond', 'pad', { dur: 10.5 }, 0.22, 0, 0.1);
  // bar 0: drops alone, a hint of the tune's shape
  [[0, 'B5'], [1, 'D6'], [2, 'E6'], [2.5, 'D6'], [3, 'B5']].forEach(([o, n], k) => dropAt(o, n, 0.55 + 0.05 * k));
  // bar 1: sticks join on the eighths
  [[4, 'G5'], [5, 'B5'], [6, 'D6'], [7, 'E6'], [7.5, 'G6']].forEach(([o, n]) => dropAt(o, n, 0.55));
  for (let o = 4; o < 8; o += 0.5) stickAt(o, o % 1 ? 0.3 : 0.42);
  // bar 2: feet and leaves
  [[8, 'E6'], [9, 'D6'], [10, 'B5'], [11, 'D6']].forEach(([o, n]) => dropAt(o, n, 0.5));
  for (let o = 8; o < 12; o += 0.5) stickAt(o, o % 1 ? 0.3 : 0.4);
  stompAt(8, 0.55); stompAt(10, 0.55); stompAt(10.5, 0.4);
  shaker(2, 0.25);
  // bar 3: hands, then the frogs tick, and a stick roll into the tune
  [[12, 'G5'], [13, 'A5'], [14, 'B5']].forEach(([o, n]) => dropAt(o, n, 0.5));
  stompAt(12, 0.65); stompAt(14, 0.65); stompAt(14.5, 0.5);
  clapAt(13, 0.6); clapAt(15, 0.7);
  shaker(3, 0.32);
  for (let o = 12; o < 15; o += 0.5) stickAt(o, 0.35);
  for (let o = 15; o < 16; o += 0.25) stickAt(o, 0.32 + (o - 15) * 0.3);
  frogHats(3, 0.7, [2.5, 3, 3.5]);
  cues.push({ beat: 0, kind: 'hit' });

  // ==================================================================================================================
  // 1. Her song, the first time: the animals pass it along, the band answers with feet and hands (bars 4-11)
  section('Her song', 'Lagið hennar', 16, 32, null, 'The animals sing her tune for the first time, note by note, each group on its own tone (the camera hops to each singer); feet, hands and sticks answer every phrase.');
  tunePass(16, { log: 0.6, g: 1.15 });
  answersFeet(16, 0.62);
  PASS_CHORDS.forEach((c, k) => reeds(16 + k * 4, c, 4, k < 4 ? 0.3 : 0.38));
  for (let bar = 4; bar < 12; bar++) {
    stompAt(bar * 4, 0.5);
    if (bar >= 8) { shaker(bar, 0.3, false); const c = CH[PASS_CHORDS[bar - 4]]; bass(bar * 4, c.root, 2.4, 0.75); patschAt(bar * 4 + 1, 0.35); patschAt(bar * 4 + 3, 0.35); }
  }
  cues.push({ beat: 16, kind: 'hit' });

  // ==================================================================================================================
  // 2. Grazers: their moo is the bass (bars 12-19; the loop is bars 16-19)
  section('Grazers', 'Grasbítar', 48, 32, 'grazers', 'The big plant-eaters stomp the beat and their moo, chopped, becomes the bass line on do; the whole band grooves. Bars 16-19 are the loop.');
  call(48, 'grazers', 'solo', { dur: 0.95 }, 1.05);
  stompAt(48, 1.0, 1.35);
  cues.push({ beat: 48, kind: 'hit' });
  const GRAZE = ['G', 'C', 'Em', 'C'];
  for (let bar = 12; bar < 20; bar++) {
    const b = bar * 4, k = bar % 4, c = GRAZE[k];
    reeds(b, c, 4, 0.42);
    bass(b, CH[c].root, 2.2, 0.9);
    bass(b + 2.5, CH[c].root, 1.3, 0.7, 0.7);
    groove(bar, 0.95, { back: 'both' });
    // the moo riff (skip the first moo of bar 12: the hello moo sings there)
    if (bar !== 12) call(b, 'grazers', 'bass', { dur: 0.36, chop: true }, 0.9);
    call(b + 1.5, 'grazers', 'bass', { dur: 0.2, chop: true }, 0.7);
    call(b + 2, 'grazers', 'bass', { dur: 0.16, chop: true, octave: 1 }, 0.55);
    call(b + 2.5, 'grazers', 'bass', { dur: 0.3, chop: true }, 0.8);
    if (k === 3) {
      // the stutter fill: m-m-m-m into the next bar
      for (const o of [3, 3.25, 3.5, 3.75]) call(b + o, 'grazers', 'bass', { dur: 0.12, chop: true, octave: o === 3.75 ? 1 : 0 }, 0.6 + (o - 3) * 0.3);
    } else call(b + 3.5, 'grazers', 'bass', { dur: 0.16, chop: true }, 0.6);
    frogHats(bar, 0.45);
    // drops answer every second bar (the lead of the loop)
    if (k === 1) { dropAt(b + 2.5, 'B5', 0.45); dropAt(b + 3, 'D6', 0.5); }
    if (k === 3) { dropAt(b + 1.5, 'E6', 0.45); dropAt(b + 2, 'D6', 0.45); dropAt(b + 2.5, 'B5', 0.45); dropAt(b + 3, 'G5', 0.5); }
  }

  // ==================================================================================================================
  // 3. Turtles: shell drums (bars 20-23)
  section('Turtles', 'Skjaldbökur', 80, 16, 'turtles', 'The turtles drum on their shells, a rolling tom groove on re and mi; their deep call sings re on the accents.');
  const TURT = ['Am7', 'D', 'Am7', 'D'];
  for (let bar = 20; bar < 24; bar++) {
    const b = bar * 4, k = bar - 20, c = TURT[k];
    reeds(b, c, 4, 0.36);
    bass(b, CH[c].root, 1.4, 0.9); bass(b + 1.5, CH[c].root, 0.9, 0.6, 0.6); bass(b + 2.5, CH[c].fifth, 1.3, 0.75, 0.7);
    stompAt(b, 0.9); stompAt(b + 2.5, 0.7);
    clapAt(b + 1, 0.5, 2); clapAt(b + 3, 0.6, 2);
    shaker(bar, 0.3, false);
    // shells: low A2, mid E3, high A3
    const pat = [[0, 'A2', 1], [0.75, 'A2', 0.6], [1.5, 'E3', 0.8], [2, 'A3', 0.9], [2.25, 'A3', 0.55], [2.75, 'E3', 0.7], [3.5, 'A2', 0.8]];
    if (k === 3) pat.push([3.25, 'E3', 0.6], [3.75, 'A3', 0.7]);
    for (const [o, n, gg] of pat) shellAt(b + o, n, gg * 0.75);
    call(b, 'turtles', 'riff', { dur: 0.5 }, 0.95);
    call(b + 2.5, 'turtles', 'riff', { dur: 0.32 }, 0.8);
    if (k === 1 || k === 3) call(b + 3.5, 'turtles', 'riff', { dur: 0.25 }, 0.7);
  }
  add(92, 'rustle', 'beat', { dur: 4 * 60 / BPM, bright: 1 }, 0.35, 0, 0.1);

  // ==================================================================================================================
  // 4. The chorus: her song again, with the whole band (bars 24-31)
  section('Chorus', 'Viðlag', 96, 32, null, 'Her tune again over the full stomp groove; the water drops echo each phrase, the grazers moo the bass on do, the lizards tick the offbeats.');
  tunePass(96, { log: 0.5 });
  passHarmony(96, { g: 0.45, walk: true, moo: 0.75 });
  for (let bar = 24; bar < 32; bar++) {
    groove(bar, 1.0, { back: 'both' });
    frogHats(bar, 0.5);
    if (bar >= 28) for (const o of [0.5, 1.5, 2.5, 3.5]) call(bar * 4 + o, 'lizards', 'riff', { dur: 0.12, gecko: true }, 0.38);
  }
  // drops echo the phrases (two beats after)
  [[99, 'B5'], [100, 'D6'], [108, 'E6'], [108.5, 'D6'], [109, 'B5'], [117.5, 'G5'], [118, 'A5'], [118.5, 'B5'], [119, 'D6']].forEach(([b, n]) => dropAt(b, n, 0.5, 'lead', 0.35));
  cues.push({ beat: 96, kind: 'hit' });

  // ==================================================================================================================
  // 5. Frogs: a beatbox break (bars 32-35)
  section('Frogs', 'Froskar', 128, 16, 'frogs', 'The band drops out; mouths beatbox and the frogs take over: ribbits on mi in a syncopated riff, their trill as the hi-hat.');
  for (let bar = 32; bar < 36; bar++) {
    const b = bar * 4, k = bar - 32;
    reeds(b, k % 2 ? 'C' : 'G', 4, 0.34);
    add(b, 'bbKick', 'beat', {}, 1.0, 0, 0.05); add(b + 1.75, 'bbKick', 'beat', {}, 0.7, 0, 0.05); add(b + 2.5, 'bbKick', 'beat', {}, 0.9, 0, 0.05);
    add(b + 1, 'bbSnare', 'beat', {}, 0.9, 0.05, 0.1); add(b + 3, 'bbSnare', 'beat', {}, 0.95, 0.05, 0.1);
    for (let o = 0; o < 4; o += 0.5) add(sw(b + o + 0.25), 'bbHat', 'beat', {}, 0.32, 0.3, 0.05);
    if (k === 3) add(b + 3.5, 'bbHat', 'beat', { open: true }, 0.4, 0.3, 0.1);
    // a cheek-pop bass: do and sol
    for (const [o, n] of [[0, 'G3'], [0.75, 'G3'], [1.5, 'D4'], [2.5, 'G3'], [3.25, 'B3']]) add(b + o, 'lipPop', 'bass', { f: hz(n) }, 1.0, 0, 0.05);
    // the frogs' riff
    const riff = k % 2 === 0 ? [0.5, 1.25, 2, 2.75, 3.5] : [0.5, 1, 1.5, 2.25, 3, 3.25, 3.5];
    for (const o of riff) call(b + o, 'frogs', 'riff', { dur: 0.2 }, 1.05);
    // the low frog answers an octave down
    call(b + 3.75, 'frogs', 'riff', { dur: 0.2, low: true }, 0.9);
    frogHats(bar, 0.7, [0.25, 0.75, 1.25, 1.75, 2.25, 2.75, 3.25, 3.75]);
    if (k >= 2) add(b + 3.5, 'tongue', 'beat', { f: 1600 }, 0.4, -0.3, 0.1);
  }

  // ==================================================================================================================
  // 6. Lizards: clicks and offbeat chirps (bars 36-39)
  section('Lizards', 'Eðlur', 144, 16, 'lizards', 'The small lizards click a clave rhythm and chirp sol on every offbeat; feet and hands come back underneath.');
  const LIZ = ['G', 'C', 'G', 'D'];
  for (let bar = 36; bar < 40; bar++) {
    const b = bar * 4, k = bar - 36, c = LIZ[k];
    reeds(b, c, 4, 0.36);
    bass(b, CH[c].root, 0.9, 0.85); bass(b + 1, hz(CH[c].root) < 120 ? CH[c].fifth : CH[c].root, 0.4, 0.5, 0.5);
    bass(b + 2, CH[c].root, 0.9, 0.75); bass(b + 3, CH[c].fifth, 0.9, 0.6, 0.6);
    groove(bar, 0.85, { back: 'clap', sticks: false, ghost: k > 0 });
    // gecko clicks on a clave: 3-3-2
    for (const o of [0, 0.75, 1.5, 2.5, 3]) call(b + o, 'lizards', 'riff', { dur: 0.12, gecko: true }, 0.65);
    // lizard chirps on the offbeats
    for (const o of [0.5, 1.5, 2.5, 3.5]) call(b + o, 'lizards', 'riff', { dur: 0.16 }, 0.6, { pan: 0.45 });
    stonesAt(b + 3.75, 0.5);
    frogHats(bar, 0.35);
  }
  add(156, 'rustle', 'beat', { dur: 4 * 60 / BPM, bright: 1.2 }, 0.3, 0, 0.1);

  // ==================================================================================================================
  // 7. Flyers: the rain bridge, half time, no home chord (bars 40-47)
  section('Flyers in the rain', 'Flugeðlur í rigningu', 160, 32, 'flyers', 'A summer shower: half-time feet, rain on the pond, chords that float without coming home; the small flyers whistle la through the trees and echo, a grass whistle sings a new melody.');
  add(160, 'splash', 'beat', { size: 1 }, 0.5, 0, 0.3);
  cues.push({ beat: 160, kind: 'hit' });
  add(160, 'pond', 'pad', { dur: 18 }, 0.2, 0, 0.1);
  const BRIDGE = ['C', 'D', 'Bm', 'Em', 'C', 'D', 'Am7', 'D'];
  const WHISTLE = [
    [[0, 'E5', 2], [2, 'G5', 2]], [[0, 'F#5', 1], [1, 'E5', 1], [2, 'D5', 2]], [[0, 'D5', 2], [2, 'B4', 1], [3, 'D5', 1]], [[0, 'E5', 3.5]],
    [[0, 'G5', 2], [2, 'A5', 2]], [[0, 'B5', 1], [1, 'A5', 1], [2, 'F#5', 2]], [[0, 'E5', 2], [2, 'G5', 1], [3, 'A5', 1]], [[0, 'A5', 3.5]],
  ];
  const FLY = [[3], [2.5], [], [1, 2, 3], [3], [2.5], [], [1, 2, 2.5, 3, 3.5]];
  for (let bar = 40; bar < 48; bar++) {
    const b = bar * 4, k = bar - 40, c = BRIDGE[k];
    reeds(b, c, 4, 0.5, { top: true, attack: 0.5 });
    bass(b, CH[c].root, 3.6, 0.8, 0.5);
    stompAt(b, 0.75); if (k % 2) stompAt(b + 2.5, 0.5);
    clapAt(b + 2, 0.55, 4); snapAt(b + 2, 0.5);
    for (const o of [0.5, 1.5, 2.5, 3.5]) leavesAt(b + o, 0.18, 0.12);
    // rain: tiny high drops
    for (let d = 0; d < 14; d++) add(b + ((d * 0.618 * 4 + k * 0.37) % 4), 'drop', 'beat', { f: 2400 + ((d * 733 + k * 151) % 2600), size: 0.4 }, 0.12, ((d * 0.37) % 1.4) - 0.7, 0.2);
    for (const [o, n, len] of WHISTLE[k]) add(b + o, 'whistle', 'lead', { f0: hz(n) * 0.94, f1: hz(n), dur: len * 60 / BPM * 0.95, glide: 0.06 }, 0.42, 0.15, 0.22, 0.25);
    for (const o of FLY[k]) call(b + o, 'flyers', 'solo', { dur: 0.6 }, 0.85, { ec: 0.45 });
    if (k === 2 || k === 6) call(b + 1, 'flyers', 'solo', { dur: 0.7, trill: true }, 0.5, { ec: 0.35 });
  }
  add(188, 'rustle', 'beat', { dur: 4 * 60 / BPM, bright: 1 }, 0.35, 0, 0.1);

  // ==================================================================================================================
  // 8. Slóeðla: her horn plays her song (bars 48-55)
  section('Her horn', 'Hornið hennar', 192, 32, 'sloedla', 'Brave now, Slóeðla plays her song on her horn, phrase by phrase; the pond answers each phrase with water drops, the band walks softly underneath.');
  TUNE.forEach((phrase, pi) => phrase.forEach((group, ni) => {
    const [o, len] = TUNE_AT[pi][ni];
    const b = 192 + o;
    const hold = ni === phrase.length - 1 ? len + 0.6 : len;
    add(b, 'horn', 'lead', { f: hz(HORN[group]), dur: hold * 60 / BPM }, 0.95, -0.05, 0.3);
    cues.push({ beat: b, kind: 'horn', note: HORN[group] });
  }));
  // the pond answers each phrase
  [[196.5, 'B5'], [197, 'D6'], [205, 'E6'], [205.5, 'D6'], [206, 'B5'], [213.5, 'G5'], [214, 'A5'], [214.5, 'B5'], [215, 'D6']].forEach(([b, n]) => dropAt(b, n, 0.42, 'lead', 0.4));
  // her flourish at the end, her horn's own: sol la sol, do
  [[220, 'D4', 0.5], [220.5, 'E4', 0.5], [221, 'D4', 1], [222, 'G3', 2]].forEach(([b, n, len]) => { add(b, 'horn', 'lead', { f: hz(n), dur: len * 60 / BPM }, 0.85, -0.05, 0.3); cues.push({ beat: b, kind: 'horn', note: n }); });
  passHarmony(192, { g: 0.4, bassG: 0.8 });
  for (let bar = 48; bar < 56; bar++) {
    const b = bar * 4;
    stompAt(b, 0.7); stompAt(b + 2.5, 0.55);
    patschAt(b + 1, 0.6); patschAt(b + 3, 0.65); snapAt(b + 3, 0.35);
    shaker(bar, 0.25, false);
  }

  // ==================================================================================================================
  // 9. The rise: everyone comes, up the choir faster and faster (bars 56-59)
  section('Everyone comes', 'Allir koma', 224, 16, null, 'The rise: the groups call up the choir, low to high, in quarters, then eighths, then sixteenths; feet and sticks double, leaves swell, a whistle slides up.');
  cues.push({ beat: 224, kind: 'rise' });
  // up the choir, low to high, round and round: quarters, eighths, eighths, then sixteenths to the top
  let up = 0;
  ['C', 'C', 'D', 'D'].forEach((c, k) => {
    const b = 224 + k * 4;
    reeds(b, c, 4, 0.42 + k * 0.05, { top: k >= 2 });
    const step = [1, 0.5, 0.5, 0.5][k];
    for (let o = 0; o < (k === 3 ? 3 : 4) - 1e-9; o += step) {
      call(b + o, GROUPS[up % 5], 'rise', { dur: Math.min(0.5, step * 60 / BPM * 0.9) }, 0.7 + k * 0.08);
      up++;
    }
    if (k === 3) for (const [o, group] of [[3, 'turtles'], [3.25, 'frogs'], [3.5, 'lizards'], [3.75, 'flyers']]) call(b + o, group, 'rise', { dur: 0.13 }, 0.9);
    const kicks = [[0, 2], [0, 1, 2, 3], [0, 1, 2, 3, 3.5], [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]][k];
    for (const o of kicks) stompAt(b + o, 0.6 + k * 0.08);
    for (const o of [1, 3]) clapAt(b + o, 0.6 + k * 0.08);
    if (k === 3) for (const o of [0, 2]) clapAt(b + o, 0.7);
    const sstep = [0.5, 0.5, 0.25, 0.25][k];
    for (let o = 0; o < 4; o += sstep) stickAt(b + o, 0.25 + k * 0.06 + (o / 4) * 0.08);
    bass(b, CH[c].root, 1.8, 0.85); bass(b + 2, CH[c].root, 1.8, 0.85);
    if (k >= 2) for (const o of [0.5, 1.5, 2.5, 3.5]) bass(b + o, CH[c].fifth, 0.4, 0.5, 0.5);
  });
  add(232, 'rustle', 'beat', { dur: 8 * 60 / BPM, bright: 1.1 }, 0.4, 0, 0.1);
  add(236, 'whistle', 'lead', { f0: hz('D5'), f1: hz('D6'), dur: 3.9 * 60 / BPM, glide: 3.6 * 60 / BPM, vib: 0.003 }, 0.32, 0.2, 0.25, 0.2);

  // ==================================================================================================================
  // 10. The peak: all together (bars 60-67)
  section('All together', 'Allir saman', 240, 32, 'all', 'Everyone together: the animals sing her tune with her horn and the logs, the whole forest grooves, and every gap is a shout of all five groups at once.');
  cues.push({ beat: 240, kind: 'peak' });
  tunePass(240, { log: 0.55, horn: 0.7, role: 'tune' });
  passHarmony(240, { g: 0.5, top: true, walk: true, moo: 0.8 });
  for (let bar = 60; bar < 68; bar++) {
    groove(bar, 1.05, { back: 'both' });
    frogHats(bar, 0.55);
    for (const o of [0.5, 1.5, 2.5, 3.5]) call(bar * 4 + o, 'lizards', 'riff', { dur: 0.12, gecko: true }, 0.38);
  }
  // shouts: all five groups at once in the gaps
  const shout = (b, g = 0.6) => { for (const group of GROUPS) call(b, group, 'chord', { dur: 0.3 }, g); };
  shout(245); shout(246.5); shout(253.5); shout(254.5, 0.65); shout(262.5);
  [[263, 'B5'], [263.5, 'D6'], [270, 'E6'], [270.5, 'G6']].forEach(([b, n]) => dropAt(b, n, 0.5, 'lead', 0.35));

  // ==================================================================================================================
  // 11. The end: the last phrase once more, and ta-da (bars 68-71)
  section('Ending', 'Endir', 272, 16, 'all', 'Her last phrase once more, down the whole choir with her horn, a pickup of feet and hands, then all five groups sing their tones together with her horn: ta-da. One last drop.');
  TUNE[3].forEach((group, ni) => {
    const [o, len] = TUNE_AT[3][ni];
    const b = 272 + o - 24;
    call(b, group, 'tag', { dur: len * 60 / BPM * 0.95 }, 1);
    logAt(b, LOG[group], 0.55, Math.min(1.2, len * 60 / BPM));
    add(b, 'horn', 'lead', { f: hz(HORN[group]), dur: len * 60 / BPM }, 0.7, -0.1, 0.25);
    cues.push({ beat: b, kind: 'horn', note: HORN[group] });
  });
  reeds(272, 'D', 4, 0.5, { top: true }); reeds(276, 'G', 4, 0.5, { top: true });
  bass(272, 'D3', 3.6, 0.9); bass(276, 'G2', 1.8, 0.9);
  for (const o of [272, 272.5, 273, 273.5, 274, 274.5, 275, 275.5]) leavesAt(o, 0.35);
  stompAt(272, 0.9); clapAt(273, 0.75); stompAt(274.5, 0.8); clapAt(275, 0.8); stompAt(276, 0.95);
  // pickup: boom boom, clap clap clap
  stompAt(278, 0.85); stompAt(278.5, 0.85); clapAt(279, 0.8, 4); clapAt(279.33, 0.8, 4); clapAt(279.67, 0.85, 4);
  // ta-da
  for (const group of GROUPS) call(280, group, 'chord', { dur: 1.1 }, 0.85);
  add(280, 'horn', 'lead', { f: hz('G3'), dur: 1.7 }, 0.85, -0.1, 0.3);
  cues.push({ beat: 280, kind: 'horn', note: 'G3' });
  for (const n of ['G4', 'B4', 'D5', 'G5']) logAt(280, n, 0.45, 1.4);
  reeds(280, 'G', 3, 0.5, { top: true });
  bass(280, 'G2', 2.6, 1.0);
  stompAt(280, 1.0, 1.2); clapAt(280, 0.9, 5); add(280, 'splash', 'beat', { size: 0.8 }, 0.35, 0, 0.3);
  dropAt(282, 'G6', 0.6, 'lead', 0);
  cues.push({ beat: 280, kind: 'end' });

  // the song's dynamics: each part's overall level (the rise climbs into the peak); the loop (bars 16-19) sits in one level
  const DYN = [[0, 1], [16, 1], [48, 0.86], [80, 0.84], [96, 1], [128, 1.0], [144, 0.86], [160, 0.8], [192, 0.8], [224, 0.8], [240, 1.15], [272, 1.12]];
  const dyn = b => {
    if (b >= 224 && b < 240) return 0.8 + ((b - 224) / 16) * 0.3;
    let g = 1;
    for (const [s0, v] of DYN) if (b >= s0) g = v;
    return g;
  };
  for (const e of ev) e.g *= dyn(e.b);

  ev.sort((a, b) => a.b - b.b);
  cues.sort((a, b) => a.beat - b.beat);
  return { events: ev, sections, tuneNotes, cues, endBeat: 286, loop: { startBeat: 64, beats: 16 } };
}
