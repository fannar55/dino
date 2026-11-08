// remix-a, "Stóra sviðið" (the main stage): DJ Flugeðla's festival remix of Ljósfluguballið (smidur-e), as data. Every event is
// placed in beats on Ljósfluguballið's grid (125 bpm, beat 0 at 0 s, 21168 samples a beat). The parts render it (render.mjs).
// Built on a copy of smidur-e's score: its chords, grooves, chop patterns and her tune are kept; the form is new.
import { rng } from './dsp.mjs';

export const BPM = 125;
export const SPB = 21168;
export const KEY = 'G major';

export const TONE = { grazers: 67, turtles: 69, frogs: 71, lizards: 74, flyers: 76 };
export const GROUPS = ['grazers', 'turtles', 'frogs', 'lizards', 'flyers'];

export const TUNE = [
  ['lizards', 'frogs'],
  ['turtles', 'frogs', 'grazers'],
  ['flyers', 'lizards', 'frogs', 'lizards'],
  ['flyers', 'lizards', 'frogs', 'turtles', 'grazers'],
];
export const TUNE_AT = [[0, 1.5], [8, 9.5, 11], [16, 17.5, 19, 20], [24, 25.5, 27, 27.5, 28]];
export const TUNE_LEN = [[1.5, 2.5], [1.5, 1.5, 2], [1.5, 1.5, 1, 2], [1.5, 1.5, 0.5, 0.5, 3]];

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

// The night, in bars (4 beats each).
export const SECTIONS = [
  { id: 'arrival', name: 'Arrival', nameIs: 'Komið öll', bar: 0, bars: 4, feature: null,
    what: 'Dusk at the pond: the string pad wakes, fireflies blink, and the forest arrives from every side (far calls of every group, the beetles ticking the time, a dragonfly passing).' },
  { id: 'welcome', name: 'Welcome', nameIs: 'Velkomin', bar: 4, bars: 4, feature: 'flugedla',
    what: 'Flugeðla swoops in over the crowd and lands on the stage with three big wing beats: "Halló, skógur! Velkomin á hátíðina!" The whole forest cheers back (beat 24); a soft kick starts.' },
  { id: 'warmup', name: 'Warm-up', nameIs: 'Upphitun', bar: 8, bars: 8, feature: 'flugedla',
    what: 'The warm-up: kick and bass, "Egill! Ertu tilbúinn?", "Klappið með!" and the forest claps with her wing beats; a four-bar build with a high-pass sweep into the first drop.' },
  { id: 'groove', name: 'Dance floor', nameIs: 'Dansgólfið', bar: 16, bars: 8, feature: null,
    what: 'First drop, "Nú byrjar djammið!": the full dance-floor groove, the crowd clapping. Bars 21-24 (20-23 from 0) are the loop.' },
  { id: 'tuneA', name: 'Her song', nameIs: 'Lagið hennar', bar: 24, bars: 8, feature: null,
    what: 'The animals sing her tune, each note by its own group (the camera jumps to each singer); the robot voice echoes, then sings along.' },
  { id: 'grazers', name: 'Grazers', nameIs: 'Grasbítarnir', bar: 32, bars: 4, feature: 'grazers',
    what: 'First act: "Stóru grasbítarnir! Stappið!" A half-time stomp, her wings doubling every stomp, the grazers moo their do in chops.' },
  { id: 'turtles', name: 'Turtles', nameIs: 'Skjaldbökurnar', bar: 36, bars: 4, feature: 'turtles',
    what: '"Skjaldbökurnar... hææægt...": two slow half-time bars, long turtle hums; then "...og hratt!" and the same beat in double time, the turtles humming re in eighths.' },
  { id: 'frogs', name: 'Frogs', nameIs: 'Froskarnir', bar: 40, bars: 4, feature: 'frogs',
    what: '"Já, froskadjamm!": the frogs croak mi in a syncopated pattern in two octaves, with congas.' },
  { id: 'lizards', name: 'Small lizards', nameIs: 'Litlu eðlurnar', bar: 44, bars: 4, feature: 'lizards',
    what: '"Litlu eðlurnar! Svo snöggar!": quick lizards chirp sol in sixteenth flurries; shaker, open hats and the bell riff.' },
  { id: 'flyers', name: 'Small flyers', nameIs: 'Litlu flugdýrin', bar: 48, bars: 4, feature: 'flyers',
    what: '"Og hátt uppi... litlu flugdýrin!": long la whistles with echoes, the robot soaring with them; the brightest groove of the acts.' },
  { id: 'beetles', name: 'Beetles', nameIs: 'Bjöllurnar', bar: 52, bars: 2, feature: 'beetles',
    what: 'Guest act, "Bjöllurnar og drekaflugurnar líka!": the beetles play the drums, wooden clicks on D and G in a 3-3-2 clave over the groove.' },
  { id: 'dragonflies', name: 'Dragonflies', nameIs: 'Drekaflugurnar', bar: 54, bars: 2, feature: 'dragonflies',
    what: 'The dragonflies buzz past the stage (left to right) on D and G, then a buzz that climbs; "Og nú... Slóeðla!" (beat 219).' },
  { id: 'break', name: 'Her horn', nameIs: 'Hornið hennar', bar: 56, bars: 8, feature: 'sloedla',
    what: 'The headliner: the drums and bass step away and Slóeðla plays her whole tune on her horn, alone with the fireflies.' },
  { id: 'rise', name: 'The build', nameIs: 'Upp með vængina', bar: 64, bars: 8, feature: 'flugedla',
    what: 'The long build: "Vængina upp! Hendur upp, Egill!", her wing beats quicken from halves to sixteenths, "Látið heyra í ykkur!" and the forest roars (beat 268); the countdown "Fimm! Fjórir! Þrír! Tveir! Einn!" (beats 278-286), each number answered a beat later by a group, do re mi sol la.' },
  { id: 'drop', name: 'The big drop', nameIs: 'NÚ!', bar: 72, bars: 4, feature: 'all',
    what: '"NÚ!": the biggest drop. All five groups sing their tones at once with a roar of the forest, then each dances its own pattern over the full disco; she laughs, "Ha ha! Jibbíí!"; "Öll saman!" (beat 301.5).' },
  { id: 'anthem', name: 'Anthem', nameIs: 'Öll saman', bar: 76, bars: 8, feature: 'all',
    what: 'The festival anthem: the animals sing her tune with the robot and the whole crowd (a choir an octave down), her horn answers the first phrases then sings along; the forest claps.' },
  { id: 'crowd', name: 'The crowd', nameIs: 'Látið heyra í ykkur', bar: 84, bars: 4, feature: 'flugedla',
    what: 'Call and response: the band drops to kick, claps and a filtered pad; "Látið heyra í ykkur!" and the forest roars (beat 340); "Öll saman!" and everyone answers with the first phrase of her tune (beats 346-348); "Einu sinni enn!" (beat 349.5).' },
  { id: 'onemore', name: 'One more time', nameIs: 'Einu sinni enn', bar: 88, bars: 8, feature: 'all',
    what: 'The last big moment: her tune once more, horn and animals and crowd together, the robot a third above, every group dancing its own pattern underneath.' },
  { id: 'end', name: 'Goodnight', nameIs: 'Góða nótt', bar: 96, bars: 4, feature: 'all',
    what: 'Stop-time: the last phrase la-sol-mi-re one note per beat with her wing beats, then do with all five groups at once (the pentatonic is the chord), held; "Takk fyrir djammið! Góða nótt, skógur!"; the last hit (beat 396), and she flies off into the night (a whoosh).' },
];
export const LOOP = { startBeat: 80, beats: 16 }; // bars 20-23 from 0: the dance floor; bars 16-19 are the same, so the seam is clean.
export const END_BEAT = 396; // the last hit
export const TAIL_SEC = 2.6;

export function sectionAt(beat) {
  let s = SECTIONS[0];
  for (const x of SECTIONS) if (beat >= x.bar * 4) s = x;
  return s;
}

export function chordOfBar(bar) {
  if (bar >= 56 && bar < 64) return ['C', 'C', 'D11', 'D11', 'Em', 'Em', 'Am', 'D11'][bar - 56];
  if (bar >= 68 && bar < 72) return ['C', 'D', 'Em', 'DF'][bar - 68];
  if (bar === 96) return 'C';
  if (bar >= 97) return 'G69';
  return LOOP4[bar % 4];
}

// Her lines (lines.json), where each lands and what is done with it. echo: tempo echo thrown on the last word; radio: a band-passed
// megaphone colour; stutter: the first sixteenth of the line repeated that many times on the sixteenths before it.
export const DJ = [
  { id: 'welcome', beat: 16, echo: 'last', duck: 2, lift: 4 },
  { id: 'egill', beat: 32, radio: true, duck: 3 },
  { id: 'clap', beat: 40, echo: 'last', duck: 3 },
  { id: 'party-on', beat: 64, echo: 'last', stutter: 2, duck: 4 },
  { id: 'grazers', beat: 128, echo: 'last', duck: 4 },
  { id: 'turtles-slow', beat: 144, radio: true, duck: 4 },
  { id: 'turtles-fast', beat: 152, echo: 'last', duck: 4 },
  { id: 'frogs', beat: 160, echo: 'last', duck: 4 },
  { id: 'lizards', beat: 176, duck: 4 },
  { id: 'flyers', beat: 192, echo: 'last', duck: 4 },
  { id: 'guests', beat: 208, duck: 4 },
  { id: 'sloedla', beat: 219, echo: 'last', duck: 4 },
  { id: 'wings', beat: 256, duck: 3 },
  { id: 'hear-you', beat: 264, echo: 'last', duck: 3 },
  { id: 'count-5', beat: 278, duck: 3 },
  { id: 'count-4', beat: 280, duck: 3 },
  { id: 'count-3', beat: 282, duck: 3 },
  { id: 'count-2', beat: 284, duck: 3 },
  { id: 'count-1', beat: 286, duck: 3 },
  { id: 'now', beat: 288, echo: 'last', duck: 4 },
  { id: 'laugh', beat: 292, echo: 'last', duck: 4 },
  { id: 'all', beat: 301.5, duck: 4 },
  { id: 'hear-you', beat: 336, echo: 'last', radio: true, duck: 3, key: 'hear-you-2' },
  { id: 'all', beat: 343.5, duck: 3, key: 'all-2' },
  { id: 'one-more', beat: 349.5, echo: 'last', stutter: 2, duck: 3 },
  { id: 'goodnight', beat: 389, echo: 'last', duck: 3, lift: 3 },
];

// ---------------------------------------------------------------- the score
export function buildScore() {
  const S = {
    pad: [], ep: [], bass: [], kick: [], clap: [], hat: [], ohat: [], shaker: [], conga: [], tom: [], snare: [], cymbal: [],
    riser: [], robot: [], bell: [], marimba: [], horn: [], calls: [], cues: [], tuneNotes: [],
    wing: [], whoosh: [], crowdClap: [], crowd: [], choir: [], beetle: [], buzz: [], hpf: [],
  };
  const sw = 0.028;
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
      if (s % 4 === 2) continue;
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
  // the forest claps on 2 and 4, and she beats time with her wings on the same beats
  const crowdClaps = (bar, vel = 0.7, wings = 0) => {
    for (const b of [1, 3]) {
      S.crowdClap.push({ beat: bar * 4 + b, vel });
      if (wings) wing(bar * 4 + b, wings);
    }
  };
  const wing = (beat, vel = 1, len = 0) => {
    S.wing.push({ beat, vel, len });
    S.cues.push({ beat: round(beat), kind: 'wings' });
  };

  // -------- bass
  const BASS_PAT = [[0, 0, 2, 1], [2, 1, 1.6, 0.8], [4, 0, 2, 0.95], [6, 1, 1, 0.75], [7, 1, 1, 0.55], [8, 0, 2, 1], [10, 1, 1.6, 0.8], [12, 0, 2, 0.95], [14, 1, 1.6, 0.8]];
  const discoBass = (bar, vel = 1, bright = 1) => {
    const ch = CHORDS[chordOfBar(bar)];
    const last = bar % 4 === 3 && chordOfBar(bar) === 'D11';
    for (const [s, oct, len, v] of BASS_PAT) {
      if (last && s >= 12) continue;
      S.bass.push({ beat: at16(bar, s), dur: (len / 4) * 0.48, midi: ch.root + 12 * oct, vel: v * vel, bright });
    }
    if (last) [50, 48, 45, 42].forEach((m, k) => S.bass.push({ beat: at16(bar, 12 + k), dur: 0.11, midi: m, vel: 0.8 * vel, bright }));
  };
  const rootBass = (bar, vel = 0.7, bright = 0.5) => {
    // half-time roots: a long root and a short octave answer
    const ch = CHORDS[chordOfBar(bar)];
    S.bass.push({ beat: bar * 4, dur: 1.7 * 0.48, midi: ch.root, vel, bright });
    S.bass.push({ beat: bar * 4 + 2.5, dur: 0.4 * 0.48, midi: ch.root + 12, vel: vel * 0.7, bright });
    S.bass.push({ beat: bar * 4 + 3, dur: 0.8 * 0.48, midi: ch.root, vel: vel * 0.85, bright });
  };

  // -------- pad, e-piano, arp, twinkles
  const padBar = (bar, opts = {}) => {
    const name = chordOfBar(bar);
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
    S.calls.push({ group, beat, dur: o.dur ?? 1, vel: o.vel ?? 1, take: o.take ?? 0, mode: o.mode ?? 'onset', octave: o.octave ?? 0, pan: o.pan ?? PAN[group], shift: o.shift ?? 0 });
    if (!o.noCue) S.cues.push({ beat: round(beat), kind: 'call', group });
  };
  // the forest answers her: every group on its own tone at once (the pentatonic chord), three of each a few ms apart, with a
  // cheer of the crowd over it
  const roar = (beat, vel = 1, seconds = 2.2, seed = 1) => {
    const r = rng(500 + seed);
    for (const g of GROUPS) {
      S.cues.push({ beat: round(beat), kind: 'call', group: g });
      for (let k = 0; k < 3; k++)
        call(g, beat, { mode: 'roar', dur: 2.6, vel: vel * (g === 'grazers' ? 0.55 : 0.42) * (k ? 0.7 : 1), take: k, pan: (r() * 2 - 1) * 0.85, shift: r() * 0.05 * SPB, noCue: true });
    }
    S.crowd.push({ beat, vel, seconds, seed: 30 + seed });
    S.cues.push({ beat: round(beat), kind: 'roar' });
  };
  const sing = (hook, { robot = 'none', horn = 'none', vel = 1, marimba = true, choir = 0 } = {}) => {
    TUNE.forEach((phrase, p) => {
      phrase.forEach((g, k) => {
        const beat = hook + TUNE_AT[p][k];
        const dur = TUNE_LEN[p][k];
        call(g, beat, { dur, vel, pan: PAN[g] * 0.5 });
        S.tuneNotes.push({ group: g, beat });
        if (marimba) S.marimba.push({ beat, midi: TONE[g], vel: 0.55 });
        if (choir) S.choir.push({ beat, dur: dur * 0.48 * 0.94, midi: TONE[g] - 12, vel: choir });
        const echo = robot === 'echo' && p < 2;
        if (robot === 'unison' || (robot === 'echo' && p >= 2)) S.robot.push({ beat, dur: dur * 0.48 * 0.92, midi: TONE[g], vel: robot === 'echo' ? 0.6 : 0.85, vowels: ['u', 'a'] });
        if (echo) {
          const last = k === phrase.length - 1;
          S.robot.push({ beat: beat + 4, dur: (last && p === 1 ? 1 : dur) * 0.48 * 0.92, midi: TONE[g], vel: 0.8, vowels: ['o', 'a'] });
        }
        if (robot === 'third') S.robot.push({ beat, dur: dur * 0.48 * 0.92, midi: thirdAbove(TONE[g]), vel: 0.62, vowels: ['e', 'a'] });
        if (horn === 'echo' && p < 2) {
          const last = k === phrase.length - 1;
          hornNote(beat + 4, (last && p === 1 ? 1 : dur), TONE[g] - 12, 0.9);
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
      call(group, at16(bar, s) - (s % 2 ? sw : 0), { dur: len / 4, take, octave: oct, mode: 'chop', vel: (o.vel ?? 1) * (k === 0 ? 1 : 0.88) }),
    );
  };
  const CHOPS = {
    grazers: [
      [[0, 5, 0], [6, 4, 1], [12, 3, 0]],
      [[0, 4, 1], [6, 2, 0], [8, 2, 1], [12, 4, 0]],
      [[0, 5, 0], [6, 4, 1], [12, 3, 0]],
      [[0, 3, 1], [4, 3, 0], [8, 2, 1], [10, 2, 0], [12, 4, 1]],
    ],
    turtles: [
      [[2, 1.6], [6, 1.6], [10, 1.6], [14, 1.6]],
      [[2, 1.6], [6, 1.6], [10, 1.6], [14, 1.6]],
      [[2, 1.6], [6, 1.6], [10, 1.6], [14, 1.6]],
      [[2, 1.6], [6, 1.6], [10, 1.6], [12, 1.6], [14, 1.6]],
    ],
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
  // -------- the new animals
  const CLAVE = [[0, 79, 1], [3, 74, 0.8], [6, 79, 0.85], [8, 86, 0.7], [10, 74, 0.8], [12, 79, 0.9], [14, 86, 0.75]];
  const beetles = (bar, vel = 0.6, fill = false) => {
    const steps = fill ? [...CLAVE, [1, 74, 0.5], [5, 74, 0.5], [9, 74, 0.5], [13, 74, 0.55], [15, 86, 0.6]] : CLAVE;
    for (const [s, m, v] of steps) {
      S.beetle.push({ beat: at16(bar, s), midi: m, vel: vel * v, pan: m === 86 ? 0.55 : m === 74 ? -0.4 : 0.1 });
      S.cues.push({ beat: round(at16(bar, s)), kind: 'call', group: 'beetles' });
    }
  };
  const tick8 = (bar, vel = 0.2) => {
    for (let e = 0; e < 8; e++) S.beetle.push({ beat: bar * 4 + e / 2 + (e % 2 ? sw * 2 : 0), midi: e % 2 ? 86 : 79, vel: vel * (e % 2 ? 0.7 : 1), pan: e % 2 ? 0.5 : -0.5 });
    S.cues.push({ beat: bar * 4, kind: 'call', group: 'beetles' });
  };
  const fly = (beat, beats, midi, o = {}) => {
    S.buzz.push({ beat, dur: beats * 0.48, midi, vel: o.vel ?? 0.5, glideTo: o.glideTo ?? 0, panFrom: o.panFrom ?? -0.8, panTo: o.panTo ?? 0.8 });
    S.cues.push({ beat: round(beat), kind: 'call', group: 'dragonflies' });
  };

  // ======== Arrival (bars 0-3): the forest gathers
  for (let bar = 0; bar < 8; bar++) {
    padBar(bar, { attack: bar === 0 ? 1.2 : 0.3, release: 0.6, vel: 1.1 + 0.03 * bar });
    twinkles(bar, [3, 4, 5, 6, 6, 6, 7, 8][bar], 100 + bar, 0.2 + bar * 0.015);
  }
  for (let bar = 1; bar < 6; bar++) tick8(bar, 0.16 + 0.035 * bar);
  // far calls of every group, coming from every side
  call('frogs', 2, { take: 1, vel: 0.35, pan: 0.7 });
  call('lizards', 4.5, { vel: 0.3, pan: -0.7 });
  call('turtles', 6, { vel: 0.35, pan: -0.5 });
  call('flyers', 7.5, { vel: 0.35, pan: 0.4 });
  call('grazers', 9, { vel: 0.4, pan: -0.6, dur: 1.5 });
  call('frogs', 10.5, { vel: 0.4, pan: 0.5 });
  call('lizards', 11.5, { take: 0, vel: 0.35, pan: 0.65 });
  fly(3, 6, 74, { vel: 0.22, panFrom: -0.9, panTo: 0.9 });
  S.robot.push({ beat: 8, dur: 1.5 * 0.48, midi: 74, vel: 0.3, vowels: ['u', 'o'] });
  S.robot.push({ beat: 9.5, dur: 2.2 * 0.48, midi: 71, vel: 0.3, vowels: ['u', 'o'] });

  // ======== Welcome (bars 4-7): she swoops in and lands
  S.whoosh.push({ beat: 13.2, take: 0, vel: 0.8, peakAt: true });
  S.cues.push({ beat: 13, kind: 'whoosh' });
  wing(14, 0.9);
  wing(14.75, 0.8);
  wing(15.5, 1);
  S.cymbal.push({ beat: 12, seconds: 4 * 0.48, reverse: true, vel: 0.12 });
  roar(24, 0.75, 2.4, 1);
  S.bass.push({ beat: 24, dur: 1.9, midi: 31, vel: 0.5, bright: 0.25 });
  for (let bar = 4; bar < 8; bar++) for (let b = 0; b < 4; b++) S.kick.push({ beat: bar * 4 + b, vel: 0.32 + (bar - 4) * 0.06 + b * 0.015, tone: 0.2 + 0.03 * (bar - 4) });
  for (let bar = 4; bar < 8; bar++) for (const b of [0.5, 1.5, 2.5, 3.5]) S.shaker.push({ beat: bar * 4 + b, vel: 0.1 + 0.02 * (bar - 4) });
  [[28, 0.15], [28.5, 0.2], [29, 0.25], [29.5, 0.3], [30, 0.35], [30.5, 0.4], [31, 0.45], [31.25, 0.5], [31.5, 0.55], [31.75, 0.6]].forEach(([b, v]) => S.hat.push({ beat: b, vel: v * 0.6 }));
  S.cymbal.push({ beat: 28, seconds: 4 * 0.48, reverse: true, vel: 0.16 });
  S.cues.push({ beat: 16, kind: 'hit' }, { beat: 28, kind: 'rise' });

  // ======== Warm-up (bars 8-15)
  for (let bar = 8; bar < 16; bar++) {
    const u = (bar - 8) / 7;
    fourFloor(bar, 0.75 + 0.15 * u, 0.65 + 0.35 * u);
    padBar(bar, { vel: 0.85 });
    if (bar < 12) rootBass(bar, 0.6, 0.4);
    else discoBass(bar, 0.75, 0.7);
    openHats(bar, 0.22 + 0.12 * u);
    if (bar >= 10) shaker16(bar, 0.1 + 0.08 * u);
    if (bar >= 11) crowdClaps(bar, 0.55 + 0.2 * u, bar >= 12 ? 0.45 : 0.6);
    if (bar >= 13) hats16(bar, 0.2 + 0.05 * u);
    if (bar >= 14) arpBar(bar, 0.14 + 0.06 * (bar - 14));
  }
  S.cymbal.push({ beat: 32, seconds: 2.2, vel: 0.1 });
  S.cues.push({ beat: 32, kind: 'hit' }, { beat: 48, kind: 'rise' });
  // the crowd gets excited: whoops from all over the forest, between her words
  [['lizards', 36.5, 0.6], ['flyers', 38, -0.5], ['frogs', 43.5, 0.5], ['grazers', 46, -0.6], ['lizards', 47.5, 0.7], ['turtles', 50, -0.4],
    ['flyers', 51.5, 0.3], ['frogs', 53.5, -0.6], ['lizards', 55, 0.6], ['frogs', 57.5, 0.4], ['flyers', 59, -0.3], ['grazers', 60, -0.5],
    ['lizards', 61.5, 0.5], ['frogs', 62.5, -0.5]].forEach(([g, beat, pan], k) => call(g, beat, { dur: 1, vel: 0.4 + 0.02 * k, pan, take: k % 2 }));
  // the build into the first drop: snare roll, riser, high-pass sweep
  for (let bar = 14; bar < 16; bar++) {
    const per = bar === 14 ? 0.5 : 0.25;
    for (let b = 0; b < 4; b += per) S.snare.push({ beat: bar * 4 + b, vel: 0.14 + 0.32 * ((bar - 14 + b / 4) / 2) });
  }
  S.riser.push({ beat: 48, seconds: 16 * 0.48, vel: 0.24 });
  S.cymbal.push({ beat: 60, seconds: 4 * 0.48, reverse: true, vel: 0.2 });
  S.hpf.push({ from: 56, to: 64, hz: 260 });

  // ======== Dance floor (bars 16-23): two identical 4-bar halves (the loop is the second)
  for (let bar = 16; bar < 24; bar++) {
    fourFloor(bar);
    hats16(bar);
    shaker16(bar, 0.16);
    discoBass(bar);
    padBar(bar);
    arpBar(bar, 0.4);
    crowdClaps(bar, 0.55, 0.32);
  }
  S.cymbal.push({ beat: 64, seconds: 2.2, vel: 0.12 });
  roar(64, 0.5, 1.6, 2);
  S.cues.push({ beat: 64, kind: 'hit' });

  // ======== Her song, sung by the animals (bars 24-31)
  for (let bar = 24; bar < 32; bar++) {
    fourFloor(bar);
    claps(bar);
    hats16(bar, 0.28);
    openHats(bar, 0.36);
    discoBass(bar, 0.95);
    padBar(bar, { vel: 0.85 });
    epComp(bar, 0.42);
    crowdClaps(bar, 0.32, 0);
  }
  S.cymbal.push({ beat: 96, seconds: 2.4, vel: 0.12 });
  S.cues.push({ beat: 96, kind: 'hit' });
  sing(96, { robot: 'echo' });

  // ======== The acts (bars 32-55): each group brought on stage
  // grazers: half-time stomp, her wings on every stomp
  for (let bar = 32; bar < 36; bar++) {
    S.kick.push({ beat: bar * 4, vel: 1, tone: 1 }, { beat: bar * 4 + 2, vel: 0.95, tone: 1 });
    if (bar % 2 === 1) S.kick.push({ beat: bar * 4 + 3.5, vel: 0.55, tone: 0.8 });
    S.clap.push({ beat: bar * 4 + 2, vel: 0.85 });
    S.crowdClap.push({ beat: bar * 4 + 2, vel: 0.6 });
    wing(bar * 4, 0.7);
    wing(bar * 4 + 2, 0.8);
    for (const b of [0.5, 1.5, 2.5, 3.5]) S.hat.push({ beat: bar * 4 + b, vel: 0.22 });
    const ch = CHORDS[chordOfBar(bar)];
    S.bass.push({ beat: bar * 4, dur: 1.4 * 0.48, midi: ch.root, vel: 1, bright: 0.7 });
    S.bass.push({ beat: bar * 4 + 1.5, dur: 0.4 * 0.48, midi: ch.root + 12, vel: 0.7, bright: 0.7 });
    S.bass.push({ beat: bar * 4 + 2, dur: 1.4 * 0.48, midi: ch.root, vel: 0.95, bright: 0.7 });
    S.bass.push({ beat: bar * 4 + 3.5, dur: 0.4 * 0.48, midi: ch.root + 12, vel: 0.7, bright: 0.7 });
    padBar(bar, { vel: 0.8 });
    chopPattern('grazers', bar, CHOPS.grazers[bar - 32], { vel: 1 });
  }
  S.cues.push({ beat: 128, kind: 'hit' });
  // turtles: two slow bars (half time, long hums), then the same beat in double time
  for (let bar = 36; bar < 40; bar++) {
    const ch = CHORDS[chordOfBar(bar)];
    padBar(bar, { vel: 0.85 });
    if (bar < 38) {
      S.kick.push({ beat: bar * 4, vel: 0.9, tone: 0.9 });
      S.clap.push({ beat: bar * 4 + 2, vel: 0.7 });
      S.crowdClap.push({ beat: bar * 4 + 2, vel: 0.45 });
      for (const b of [1, 3]) S.hat.push({ beat: bar * 4 + b, vel: 0.2 });
      S.bass.push({ beat: bar * 4, dur: 3.4 * 0.48, midi: ch.root, vel: 0.85, bright: 0.45 });
      call('turtles', bar * 4 + 1, { mode: 'chop', dur: 1.6, vel: 0.9 });
      call('turtles', bar * 4 + 3, { mode: 'chop', dur: 0.9, vel: 0.75 });
      S.tom.push({ beat: bar * 4 + 3.5, midi: ch.root + 24 + 7, vel: 0.5 });
    } else {
      fourFloor(bar, 0.95);
      claps(bar, 0.75);
      crowdClaps(bar, 0.5, 0.35);
      hats16(bar, 0.3);
      shaker16(bar, 0.2);
      discoBass(bar, 0.95, 0.9);
      for (let e = 0; e < 8; e++) call('turtles', bar * 4 + e / 2 + 0.25, { mode: 'chop', dur: 0.32, vel: 0.8 });
      const tomPat = bar === 39 ? [[12, 0], [13, -2], [14, -5], [15, -7]] : [[7, 0], [15, -5]];
      for (const [s, d] of tomPat) S.tom.push({ beat: at16(bar, s), midi: ch.root + 24 + 7 + d, vel: 0.6 });
    }
  }
  S.cues.push({ beat: 152, kind: 'hit' });
  // frogs: congas
  for (let bar = 40; bar < 44; bar++) {
    fourFloor(bar);
    claps(bar, 0.75);
    crowdClaps(bar, 0.4, 0);
    hats16(bar, 0.26);
    discoBass(bar);
    padBar(bar, { vel: 0.85 });
    congas(bar, 0.45);
    chopPattern('frogs', bar, CHOPS.frogs[bar - 40], { vel: 0.95 });
  }
  // lizards: shaker, open hats, the bell riff again
  for (let bar = 44; bar < 48; bar++) {
    fourFloor(bar);
    claps(bar);
    hats16(bar, 0.24);
    openHats(bar, 0.36);
    shaker16(bar, 0.28);
    discoBass(bar);
    padBar(bar, { vel: 0.85 });
    epComp(bar, 0.32);
    arpBar(bar, 0.22);
    chopPattern('lizards', bar, CHOPS.lizards[bar - 44], { vel: 0.9 });
  }
  // flyers: brightest groove, long whistles, the robot soars
  for (let bar = 48; bar < 52; bar++) {
    fourFloor(bar);
    claps(bar);
    crowdClaps(bar, 0.4, 0);
    hats16(bar, 0.28);
    openHats(bar, 0.4);
    shaker16(bar, 0.24);
    congas(bar, 0.3);
    discoBass(bar);
    padBar(bar, { vel: 0.9 });
    epComp(bar, 0.34);
    arpBar(bar, 0.28);
    const flyer = bar === 51 ? [[0, 4], [4, 4], [8, 4], [12, 4]] : [[0, 8], [10, 6]];
    for (const [s, len] of flyer) call('flyers', bar * 4 + s / 4, { dur: len / 4, vel: 0.95, pan: (s / 16) * 1.0 - 0.4 });
  }
  [[192, 74, 3.6], [196, 76, 3.6], [200, 79, 3.6], [204, 81, 3.4]].forEach(([b, m, beats]) => S.robot.push({ beat: b, dur: beats * 0.48, midi: m, vel: 0.5, vowels: ['o', 'a'], morph: 0.4 }));
  // guests: the beetles drum (bars 52-53), the dragonflies buzz past (54-55)
  for (let bar = 52; bar < 56; bar++) {
    fourFloor(bar, bar === 55 ? 0.8 : 0.95, bar === 55 ? 0.6 : 1);
    if (bar < 55) claps(bar, 0.7);
    if (bar < 55) hats16(bar, bar < 54 ? 0.18 : 0.24);
    discoBass(bar, bar === 55 ? 0.7 : 0.95, 0.85);
    padBar(bar, { vel: 0.85 });
    if (bar < 54) beetles(bar, 0.75, bar === 53);
    else beetles(bar, 0.4);
  }
  S.cues.push({ beat: 208, kind: 'hit' });
  fly(216, 3.5, 74, { vel: 0.55, panFrom: -0.9, panTo: 0.9 });
  fly(218, 2, 79, { vel: 0.45, panFrom: 0.9, panTo: -0.6 });
  fly(220, 4, 74, { vel: 0.4, glideTo: mtofLocal(86), panFrom: -0.4, panTo: 0.4 });
  S.cymbal.push({ beat: 220, seconds: 4 * 0.48, reverse: true, vel: 0.15 });

  // ======== Her horn (bars 56-63): the headliner
  for (let bar = 56; bar < 64; bar++) {
    const name = chordOfBar(bar);
    const prev = bar > 56 ? chordOfBar(bar - 1) : null;
    if (name !== prev) {
      let len = 1;
      while (bar + len < 64 && chordOfBar(bar + len) === name) len++;
      S.pad.push({ beat: bar * 4, beats: len * 4, notes: CHORDS[name].pad, attack: 0.5, release: 0.9, vel: 0.95 });
    }
    const ep = CHORDS[name].ep;
    for (let b = 0; b < 4; b++) S.ep.push({ beat: bar * 4 + b + 0.5, dur: 0.4, notes: [ep[(b + bar) % ep.length] + 12], vel: 0.32 });
    twinkles(bar, 4, 200 + bar, 0.2);
    if (bar >= 60) {
      for (let b = 0; b < 4; b++) S.shaker.push({ beat: bar * 4 + b + 0.5, vel: 0.12 + (bar - 60) * 0.04 });
      S.bass.push({ beat: bar * 4, dur: 3.6 * 0.48, midi: CHORDS[name].root + 12, vel: 0.3 + (bar - 60) * 0.07, bright: 0.25 });
    }
  }
  S.cues.push({ beat: 224, kind: 'hit' });
  TUNE.forEach((phrase, p) => phrase.forEach((g, k) => {
    const lens = [[1.5, 5], [1.5, 1.5, 4.5], [1.5, 1.5, 1, 3.5], [1.5, 1.5, 0.5, 0.5, 4]];
    hornNote(224 + TUNE_AT[p][k], lens[p][k], TONE[g] - 12, 1);
  }));

  // ======== The build (bars 64-71)
  for (let bar = 64; bar < 72; bar++) {
    const u = (bar - 64) / 7;
    fourFloor(bar, 0.5 + 0.42 * u, 0.3 + 0.7 * u);
    padBar(bar, { vel: 0.85 + 0.15 * u });
    if (bar >= 66) for (const b of [0.5, 1.5, 2.5, 3.5]) S.hat.push({ beat: bar * 4 + b, vel: 0.2 + 0.15 * u });
    if (bar < 68) discoBass(bar, 0.6 + 0.2 * u, 0.6);
    else {
      const root = CHORDS[chordOfBar(bar)].root;
      for (let e = 0; e < 8; e++) S.bass.push({ beat: bar * 4 + e / 2, dur: 0.2, midi: root + (e % 2 ? 12 : 0), vel: 0.75 + 0.2 * u, bright: 0.6 + 0.4 * u });
    }
    // snare roll, quickening
    const per = bar < 66 ? 2 : bar < 68 ? 1 : bar < 70 ? 0.5 : 0.25;
    for (let b = 0; b < 4; b += per) S.snare.push({ beat: bar * 4 + b + (bar < 66 ? 1 : 0), vel: 0.14 + 0.42 * ((bar - 64 + b / 4) / 8) });
    if (bar >= 68) arpBar(bar, 0.14 + 0.1 * u, bar >= 70 ? 24 : 12);
    if (bar >= 66) crowdClaps(bar, 0.35 + 0.3 * u, 0);
  }
  // her wings quicken: halves, quarters, eighths, sixteenths (each cut to its step)
  for (let b = 256; b < 264; b += 2) wing(b, 0.6);
  for (let b = 264; b < 272; b += 1) wing(b, 0.62);
  for (let b = 272; b < 280; b += 0.5) wing(b, 0.55, 0.5);
  for (let b = 280; b < 288; b += 0.25) wing(b, 0.4 + 0.25 * ((b - 280) / 8), 0.25);
  S.riser.push({ beat: 256, seconds: 32 * 0.48, vel: 0.3 });
  S.cymbal.push({ beat: 280, seconds: 8 * 0.48, reverse: true, vel: 0.2 });
  S.cues.push({ beat: 256, kind: 'rise' });
  // the forest climbs with her: one group a bar on the quarters, then her call and their roar, then eighths and sixteenths
  ['grazers', 'turtles'].forEach((g, k) => {
    for (let b = 0; b < 4; b++) call(g, 256 + k * 4 + b, { mode: 'chop', dur: 0.7, vel: 0.75, take: b % 2 && g !== 'turtles' ? 1 : 0 });
  });
  roar(268, 0.85, 2.2, 3);
  for (let e = 0; e < 8; e++) call(GROUPS[e % 5], 272 + e / 2, { mode: 'chop', dur: 0.45, vel: 0.8 });
  for (let s = 0; s < 8; s++) call(GROUPS[s % 5], 276 + s / 4, { mode: 'chop', dur: 0.24, vel: 0.8 });
  // the countdown: she calls each number on its beat and a group answers on the next, do re mi sol la (call and response),
  // doubled by the robot and the marimba; the flyers' la leads straight into the drop
  GROUPS.forEach((g, k) => {
    const beat = 279 + 2 * k;
    call(g, beat, { dur: 0.9, vel: 0.95, pan: 0 });
    S.marimba.push({ beat, midi: TONE[g], vel: 0.6 });
    S.robot.push({ beat, dur: 0.85 * 0.48, midi: TONE[g], vel: 0.55 + 0.06 * k, vowels: ['o', 'a'] });
    S.cues.push({ beat: beat - 1, kind: 'count', n: 5 - k });
  });
  fly(272, 16, 67, { vel: 0.32, glideTo: mtofLocal(79), panFrom: -0.6, panTo: 0.6 });
  S.hpf.push({ from: 280, to: 288, hz: 160 });

  // ======== The big drop (bars 72-75)
  for (let bar = 72; bar < 76; bar++) {
    fourFloor(bar);
    claps(bar, 0.85);
    crowdClaps(bar, 0.6, 0.5);
    hats16(bar, 0.3);
    openHats(bar, 0.42);
    shaker16(bar, 0.26);
    congas(bar, 0.34);
    for (const b of [1, 3]) S.snare.push({ beat: bar * 4 + b, vel: 0.42 });
    discoBass(bar);
    padBar(bar);
    S.pad.push({ beat: bar * 4, beats: 4, notes: CHORDS[chordOfBar(bar)].pad.slice(2).map(m => m + 12), attack: 0.05, release: 0.3, vel: 0.4 });
    epComp(bar, 0.4);
    arpBar(bar, 0.3);
    // every group dances its own pattern
    chopPattern('grazers', bar, CHOPS.grazers[bar - 72].filter(([s]) => s === 0 || s >= 8), { vel: 0.5 });
    chopPattern('turtles', bar, CHOPS.turtles[0], { vel: 0.4 });
    chopPattern('frogs', bar, CHOPS.frogs[0].filter(([s]) => s >= 3), { vel: 0.4 });
    chopPattern('lizards', bar, CHOPS.lizards[0].filter(([s]) => s >= 8), { vel: 0.36 });
    if (bar % 2 === 1) call('flyers', bar * 4 + 2, { dur: 1.8, vel: 0.6, pan: bar === 73 ? -0.4 : 0.4 });
  }
  roar(288, 1, 2.6, 4);
  for (const g of GROUPS) call(g, 288, { dur: 3, vel: g === 'grazers' ? 0.85 : 0.6, pan: PAN[g] * 1.4 });
  S.cymbal.push({ beat: 288, seconds: 2.8, vel: 0.18 });
  S.whoosh.push({ beat: 287, take: 1, vel: 0.5, peakAt: true });
  S.cues.push({ beat: 288, kind: 'peak' });
  fly(296, 4, 79, { vel: 0.3, panFrom: 0.8, panTo: -0.8 });

  // ======== Anthem (bars 76-83): everyone sings her tune
  for (let bar = 76; bar < 84; bar++) {
    fourFloor(bar);
    claps(bar, 0.85);
    crowdClaps(bar, 0.6, 0.4);
    hats16(bar, 0.3);
    openHats(bar, 0.42);
    shaker16(bar, 0.26);
    congas(bar, 0.3);
    for (const b of [1, 3]) S.snare.push({ beat: bar * 4 + b, vel: 0.42 });
    discoBass(bar);
    padBar(bar);
    epComp(bar, 0.4);
    arpBar(bar, 0.16);
  }
  S.cymbal.push({ beat: 304, seconds: 2.6, vel: 0.16 });
  S.cues.push({ beat: 304, kind: 'peak' });
  sing(304, { robot: 'unison', horn: 'echo', choir: 0.5 });

  // ======== The crowd (bars 84-87): call and response
  for (let bar = 84; bar < 88; bar++) {
    fourFloor(bar, 0.85, 0.7);
    crowdClaps(bar, 0.75, 0.5);
    padBar(bar, { vel: 0.85 });
    openHats(bar, 0.25);
    rootBass(bar, 0.65, 0.45);
    hats16(bar, 0.16);
  }
  roar(340, 0.7, 2.6, 5);
  // the answer to "Öll saman!": everyone sings the first phrase, sol mi
  [['lizards', 346, 1.5], ['frogs', 347.5, 2]].forEach(([g, beat, dur]) => {
    call(g, beat, { dur, vel: 1, pan: 0 });
    S.choir.push({ beat, dur: dur * 0.48 * 0.94, midi: TONE[g] - 12, vel: 0.6 });
    S.robot.push({ beat, dur: dur * 0.48 * 0.92, midi: TONE[g], vel: 0.7, vowels: ['u', 'a'] });
    S.marimba.push({ beat, midi: TONE[g], vel: 0.55 });
    S.crowd.push({ beat, vel: 0.45, seconds: dur * 0.48, seed: 60 + beat });
  });
  for (let b = 348; b < 352; b += 0.25) S.snare.push({ beat: b, vel: 0.2 + 0.3 * ((b - 348) / 4) });
  S.cymbal.push({ beat: 348, seconds: 4 * 0.48, reverse: true, vel: 0.2 });
  S.hpf.push({ from: 344, to: 352, hz: 120 });

  // ======== One more time (bars 88-95)
  for (let bar = 88; bar < 96; bar++) {
    fourFloor(bar);
    claps(bar, 0.85);
    crowdClaps(bar, 0.65, 0.45);
    hats16(bar, 0.3);
    openHats(bar, 0.42);
    shaker16(bar, 0.26);
    congas(bar, 0.38);
    for (const b of [1, 3]) S.snare.push({ beat: bar * 4 + b, vel: 0.42 });
    discoBass(bar);
    padBar(bar);
    S.pad.push({ beat: bar * 4, beats: 4, notes: CHORDS[chordOfBar(bar)].pad.slice(2).map(m => m + 12), attack: 0.05, release: 0.3, vel: 0.45 });
    epComp(bar, 0.4);
    arpBar(bar, 0.24);
    chopPattern('turtles', bar, CHOPS.turtles[0], { vel: 0.34 });
    if (bar % 2 === 0) chopPattern('frogs', bar, CHOPS.frogs[0].filter(([s]) => s >= 3), { vel: 0.32 });
    else chopPattern('lizards', bar, CHOPS.lizards[0], { vel: 0.3 });
  }
  roar(352, 0.8, 2.2, 6);
  S.cymbal.push({ beat: 352, seconds: 2.6, vel: 0.15 });
  S.cues.push({ beat: 352, kind: 'peak' });
  sing(352, { robot: 'third', horn: 'unison', choir: 0.55 });

  // ======== Goodnight (bars 96-99)
  S.cymbal.push({ beat: 380, seconds: 4 * 0.48, reverse: true, vel: 0.14 });
  TUNE[3].slice(0, 4).forEach((g, k) => {
    const beat = 384 + k;
    call(g, beat, { dur: 0.9, vel: 1, pan: 0 });
    S.marimba.push({ beat, midi: TONE[g], vel: 0.6 });
    S.robot.push({ beat, dur: 0.38, midi: TONE[g], vel: 0.8, vowels: ['o', 'a'] });
    S.choir.push({ beat, dur: 0.4, midi: TONE[g] - 12, vel: 0.5 });
    hornNote(beat, 0.8, TONE[g] - 12, 0.85);
    const name = k < 2 ? 'C' : 'D11';
    S.pad.push({ beat, beats: 0.45, notes: CHORDS[name].pad, attack: 0.004, release: 0.12, vel: 0.9 });
    S.ep.push({ beat, dur: 0.2, notes: CHORDS[name].ep, vel: 0.5 });
    S.bass.push({ beat, dur: 0.2, midi: CHORDS[name].root + 12, vel: 0.9, bright: 0.8 });
    S.kick.push({ beat, vel: 0.85, tone: 1 });
    S.clap.push({ beat, vel: 0.35 + 0.1 * k });
    wing(beat, 0.55 + 0.1 * k);
  });
  S.cues.push({ beat: 384, kind: 'hit' });
  for (const g of GROUPS) call(g, 388, { dur: 4, vel: g === 'grazers' ? 0.9 : 0.62 });
  S.crowd.push({ beat: 388, vel: 0.5, seconds: 3, seed: 70 });
  S.marimba.push({ beat: 388, midi: 67, vel: 0.6 });
  hornNote(388, 5, 55, 0.85);
  S.robot.push({ beat: 388, dur: 7.6 * 0.48, midi: 67, vel: 0.6, vowels: ['o', 'a'], morph: 0.5 });
  S.pad.push({ beat: 388, beats: 8, notes: CHORDS.G69.pad, attack: 0.02, release: 0.5, vel: 0.85 });
  S.bass.push({ beat: 388, dur: 3.5 * 0.48, midi: 31, vel: 1, bright: 0.8 });
  S.bass.push({ beat: 392, dur: 3.5 * 0.48, midi: 43, vel: 0.85, bright: 0.6 });
  S.cymbal.push({ beat: 388, seconds: 3, vel: 0.16 });
  for (let b = 388; b < 396; b++) S.kick.push({ beat: b, vel: 0.62, tone: 0.8 });
  for (const b of [389, 391, 393, 395]) S.crowdClap.push({ beat: b, vel: 0.45 });
  for (let b = 388; b < 396; b++) S.ohat.push({ beat: b + 0.5, vel: 0.24 });
  [88, 86, 83, 81, 79, 76, 74, 71].forEach((m, k) => S.bell.push({ beat: 392 + k * 0.5, midi: m, vel: 0.28, decay: 0.6, pan: k % 2 ? 0.5 : -0.5, delay: 1 }));
  // the last hit, and she flies off
  S.kick.push({ beat: 396, vel: 0.9, tone: 1 });
  S.clap.push({ beat: 396, vel: 0.6 });
  S.bass.push({ beat: 396, dur: 0.9, midi: 31, vel: 1, bright: 0.8 });
  S.pad.push({ beat: 396, beats: 1.2, notes: CHORDS.G69.pad, attack: 0.004, release: 0.6, vel: 0.95 });
  S.ep.push({ beat: 396, dur: 1.2, notes: [...CHORDS.G69.ep, 74], vel: 0.6 });
  S.bell.push({ beat: 396, midi: 91, vel: 0.35, decay: 0.9, pan: 0, delay: 1 });
  call('grazers', 396, { dur: 2, vel: 0.9, pan: 0 });
  S.marimba.push({ beat: 396, midi: 67, vel: 0.5 });
  wing(396, 0.8);
  wing(397, 0.6);
  S.whoosh.push({ beat: 397.5, take: 0, vel: 0.45, peakAt: false });
  S.cues.push({ beat: 396, kind: 'end' }, { beat: 397.5, kind: 'whoosh' });

  // the crowd cheers each act as she finishes naming it (and cheers Slóeðla onto the stage, then hushes for her horn)
  [[134, 0.35], [154.5, 0.35], [164, 0.4], [183, 0.4], [198.5, 0.4], [213.5, 0.4], [223.5, 0.45]].forEach(([beat, vel], k) => {
    S.crowd.push({ beat, vel, seconds: 1.8, seed: 80 + k });
    S.cues.push({ beat, kind: 'cheer' });
  });

  // section dynamics
  const DYN = {
    welcome: { kick: 0.9 },
    warmup: { kick: 1, bass: 0.95, pad: 0.95 },
    groove: { kick: 0.82, bass: 0.82, pad: 0.85, hat: 0.85 },
    tuneA: { kick: 0.9, bass: 0.9 },
    grazers: { kick: 0.82, bass: 0.84 },
    turtles: { kick: 0.84, bass: 0.86, hat: 0.9 },
    frogs: { kick: 0.9, bass: 0.92 },
    lizards: { kick: 0.95, bass: 0.96 },
    beetles: { kick: 0.9, bass: 0.92 },
    dragonflies: { kick: 0.9, bass: 0.92 },
    crowd: { kick: 0.85, pad: 0.85 },
    end: { kick: 0.92 },
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
  for (const d of DJ) S.cues.push({ beat: d.beat, kind: 'dj', id: d.id });
  S.cues.sort((a, b) => a.beat - b.beat || a.kind.localeCompare(b.kind));
  return S;
}

const round = b => Math.round(b * 1000) / 1000;
function mtofLocal(m) {
  return 440 * 2 ** ((m - 69) / 12);
}
function thirdAbove(m) {
  const scale = [67, 69, 71, 72, 74, 76, 78, 79, 81, 83, 84];
  return scale[scale.indexOf(m) + 2];
}
