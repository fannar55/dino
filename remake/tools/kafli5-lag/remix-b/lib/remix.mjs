// "Aftur! Aftur!" (remix-b): DJ Flugeðla plays Ljósfluguballið as a record. This file is the performance: the moves her hands
// make on the decks (in output beats, against source beats of E's song), the new layers on the output's own grid (crowd claps,
// half-time kicks, the animals' answers and cut-up riffs, beetles, dragonflies, her wing beats), her scratches and her lines.
// Every output beat is on the same 125 bpm grid as the source (beat 0 at 0 s); no move changes the grid.
import { play, brake, rewind, stutter, juggle } from './deck.mjs';
import { baby, chirp, transformer, flare, stab } from './turntable.mjs';

export const OUT_SECTIONS = [
  { id: 'intro', name: 'Needle drop', nameIs: 'Nálin á plötuna', from: 0, to: 16, feature: null,
    what: 'The needle drops on the record at dusk: crackle, the string pad opening, the first fireflies; Flugeðla greets the forest and Egill, and counts in.' },
  { id: 'pullup', name: 'Again!', nameIs: 'Aftur!', from: 16, to: 24, feature: 'flugedla',
    what: 'The first drop, and the crowd loves it so much that she spins the record back ("Aftur!") while the animals clap on the beat, and drops it again.' },
  { id: 'groove', name: 'Dance floor', nameIs: 'Dansgólfið', from: 24, to: 56, feature: null,
    what: 'The dance floor: four on the floor, octave disco bass, the firefly bell riff. Beats 40-56 are the loop.' },
  { id: 'tuneA', name: 'Her song', nameIs: 'Lagið hennar', from: 56, to: 88, feature: null,
    what: 'The animals sing her tune, each note by its own group, as in Ljósfluguballið; the DJ lets it play untouched.' },
  { id: 'grazers', name: 'Grazers', nameIs: 'Grasbítarnir', from: 88, to: 104, feature: 'grazers',
    what: 'Half-time stomp with the big grazers ("Stapp, stapp!"); she drags a moo slowly on the record, then brakes the record to a stop while the animals clap.' },
  { id: 'turtles', name: 'Turtles', nameIs: 'Skjaldbökurnar', from: 104, to: 128, feature: 'turtles',
    what: 'Turtles are slow: the record plays at half speed (an octave down, half-time on the same beat) while she drawls "hægt... hægt...", then "Núna!" and the turtle groove at full speed.' },
  { id: 'frogs', name: 'Frogs', nameIs: 'Froskarnir', from: 128, to: 144, feature: 'frogs',
    what: '"Já, froskadjamm!": the frogs croak in two octaves; in bars 3-4 she juggles two copies of the record so the croaks hop twice.' },
  { id: 'lizards', name: 'Small lizards', nameIs: 'Litlu eðlurnar', from: 144, to: 160, feature: 'lizards',
    what: 'The quick little lizards; "Hraðar!" and the record plays at double speed for two bars (an octave up, double-time), the whole lizard part again in half the time.' },
  { id: 'flyers', name: 'Small flyers', nameIs: 'Litlu flugdýrin', from: 160, to: 168, feature: 'flyers',
    what: 'The small flyers whistle their long la calls high up, the robot voice soars with them.' },
  { id: 'dragonflies', name: 'Dragonflies', nameIs: 'Drekaflugurnar', from: 168, to: 176, feature: 'dragonflies',
    what: 'New guests: dragonflies dart in, their wing buzz swooping onto la like little scratches.' },
  { id: 'solo', name: "Flugeðla's turn", nameIs: 'Plötusnúðurinn', from: 176, to: 184, feature: 'flugedla',
    what: 'Her own solo, beating time with her wings: baby scratches, chirps, a transformer and a flare on her own "Djamm!".' },
  { id: 'beetles', name: 'Beetles', nameIs: 'Bjöllurnar', from: 184, to: 192, feature: 'beetles',
    what: 'New guests: the beetles click along in sixteenths; she cuts the animals\' calls into a new riff from her tune and juggles the beat.' },
  { id: 'callback', name: 'Egill answers', nameIs: 'Egill svarar', from: 192, to: 212, feature: 'flugedla',
    what: 'Call and response: "Egill, segðu já!", the music leaves a gap for Egill, then all the animals answer; "Hærra!", a gap, a bigger answer; then she brakes the record to a stop for Slóeðla.' },
  { id: 'break', name: 'Her horn', nameIs: 'Hornið hennar', from: 212, to: 244, feature: 'sloedla',
    what: 'Slóeðla plays her whole tune on her horn, alone with the fireflies; the decks are still.' },
  { id: 'rise', name: 'The rise', nameIs: 'Upp, upp, upp', from: 244, to: 276, feature: null,
    what: '"Upp með vængina!": everything builds, the animals climb do-re-mi-sol-la; in the last bar she stutters the record faster and faster into the drop.' },
  { id: 'peak1', name: 'All together', nameIs: 'Öll saman', from: 276, to: 316, feature: 'all',
    what: 'The drop, cut short: "Einu sinni enn!", she rewinds and drops the top again; everyone sings her tune with the robot voice and her horn.' },
  { id: 'peak2', name: 'All together, again', nameIs: 'Öll saman aftur', from: 316, to: 348, feature: 'all',
    what: 'Her tune once more, everyone together; the beetles and dragonflies join in; "Jibbí! Stærsta djamm í heimi!"' },
  { id: 'end', name: 'Ending', nameIs: 'Lokin', from: 348, to: 364, feature: 'all',
    what: 'Stop-time last phrase, then do with all five at once held while she says thanks, the last hit, and the record powers down and the needle lifts.' },
];
export const OUT_LOOP = { startBeat: 40, beats: 16 }; // source beats 32-48 (the dance floor), the same as the four bars before
export const LAST_HIT = 360;
export const END_SEC = 363.25 * 0.48 + 0.42; // the needle lifts at 363.25, then a breath of quiet

// juggles (sixteenths): [outStep, srcStep, lenSteps]; every quarter of the output still gets a kick from the record
const J_FROG3 = [[0, 0, 4], [4, 0, 2], [6, 6, 2], [8, 0, 2], [10, 10, 2], [12, 12, 2], [14, 12, 2]];
const J_FROG4 = [[0, 0, 8], [8, 8, 2], [10, 8, 2], [12, 8, 2], [14, 14, 2]];
const J_SOLO = [[0, 0, 2], [2, 0, 2], [4, 4, 2], [6, 4, 2], [8, 0, 4], [12, 12, 2], [14, 14, 1], [15, 14, 1]];
const GAP = { pad: 0, bass: 0, lead: 0, animals: 0, rest: 0.45, vinyl: 1 }; // Egill's gap: kick and hats only

/** The moves on the decks, in time order. */
export function buildMoves() {
  const m = [];
  m.push(play(0, 16, 0, 1, { noFadeIn: true }));
  m.push(play(16, 22, 16));
  m.push(rewind(22, 23.75, 22, 16)); // "Aftur!" (23.75-24: her hand holds the record on the cue)
  m.push(play(24, 56, 16));
  m.push(play(56, 88, 48));
  m.push(play(88, 102, 80));
  m.push(brake(102, 104, 94));
  m.push(play(104, 112, 96, 0.5, { gains: { kick: 0 }, xf: 3 }));
  m.push(play(112, 128, 96));
  m.push(play(128, 136, 112));
  m.push(...juggle(136, 120, J_FROG3));
  m.push(...juggle(140, 124, J_FROG4));
  m.push(play(144, 152, 128));
  m.push(play(152, 160, 128, 2, { gains: { kick: 0 }, xf: 2 }));
  m.push(play(160, 176, 144, 1, { xf: 2 }));
  m.push(play(176, 188, 32, 1, { gains: { lead: 0.35 } }));
  m.push(...juggle(188, 44, J_SOLO, { gains: { lead: 0.35 } }));
  m.push(play(192, 196, 32));
  m.push(play(196, 198, 36, 1, { gains: GAP, xf: 6 }));
  m.push(play(198, 202, 38, 1, { xf: 6 }));
  m.push(play(202, 204, 42, 1, { gains: GAP, xf: 6 }));
  m.push(play(204, 208, 44, 1, { xf: 6 }));
  m.push(play(208, 210, 32));
  m.push(brake(210, 212, 34, { p: 1.1 }));
  m.push(play(212, 244, 160));
  m.push(play(244, 272, 192));
  // the stutter build: half, quarter, eighth and sixteenth slices of the last bar's beats
  m.push(...stutter(272, 220, 0.5, 2), ...stutter(273, 221, 0.25, 4), ...stutter(274, 222, 0.125, 8), ...stutter(275, 223, 0.0625, 16));
  m.push(play(276, 282, 224));
  m.push(rewind(282, 283.75, 230, 224)); // "Einu sinni enn!"
  m.push(play(284, 348, 224));
  m.push(play(348, 360.5, 288));
  m.push(brake(360.5, 363, 300.5, { p: 1.6, noFadeOut: true })); // the power goes off: the last chord slows to rest
  return m;
}

/** How loud the record's own crackle is (output beats → gain), with half-beat ramps. */
export const VINYL = [[0, 1], [15.5, 1], [16.5, 0.3], [176, 0.3], [177, 0.6], [210, 0.6], [212, 0.1], [243, 0.1], [244, 0.3], [356, 0.3], [360.5, 0.9], [364, 0.9]];

// her tune's groups and their tones (from E's score) for the new riffs; the band answers with all five at once
const FIVE = ['grazers', 'turtles', 'frogs', 'lizards', 'flyers'];

/** New events on the output's own grid: { kick, clap (crowd), calls, beetles, dragonflies, wings, needle, cues }. */
export function buildLayers() {
  const L = { kick: [], crowd: [], calls: [], beetles: [], dragonflies: [], wings: [], cues: [] };
  // kicks where the record's own kick is off the grid feel: half-time under the half-speed turtles, four on the floor at 2x
  for (const [b, v] of [[104, 0.95], [105.5, 0.7], [108, 0.95], [109.5, 0.7]]) L.kick.push({ beat: b, vel: v, tone: 0.8 }); // half-time: one and the and of two
  for (let b = 152; b < 160; b++) L.kick.push({ beat: b, vel: 0.92, tone: 1 });
  // the animals clap on the beat while she rewinds or brakes the record
  for (const b of [22, 23, 102, 103, 210, 211, 282, 283]) L.crowd.push({ beat: b, vel: 0.85 });
  L.crowd.push({ beat: 23.5, vel: 0.6 }, { beat: 283.5, vel: 0.6 });
  // the band answers Egill: all five at once (her tune's tones are the G6/9 chord)
  const answer = (beat, dur, vel) => FIVE.forEach(g => L.calls.push({ group: g, beat, dur, vel: vel * (g === 'grazers' ? 1.2 : 0.8), mode: 'onset' }));
  answer(198, 1, 0.9);
  answer(198.75, 0.7, 0.75);
  answer(204, 0.45, 0.9);
  answer(204.5, 0.45, 0.9);
  answer(205, 1, 1);
  // the cut-up riff: her tune's first phrases chopped to sixteenths (sol mi / re mi do) on the decks
  const R1 = [[0, 'lizards', 0.5], [0.75, 'lizards', 0.25], [1, 'frogs', 0.5], [1.5, 'frogs', 0.25], [1.75, 'frogs', 0.25]];
  const R2 = [[0, 'turtles', 0.5], [0.5, 'frogs', 0.25], [0.75, 'frogs', 0.25], [1, 'grazers', 0.75], [1.75, 'grazers', 0.25]];
  for (const [at, riff] of [[188, R1], [189.5, null], [190, R2]]) if (riff) for (const [o, g, d] of riff) L.calls.push({ group: g, beat: at + o, dur: d, vel: 0.9, mode: 'chop' });
  // beetles: sixteenth clicks, accents on the eighths, a few rests (the solo's second half and softly in the last peak)
  const beetleBar = (bar, vel, rests = []) => {
    for (let s = 0; s < 16; s++) {
      if (rests.includes(s)) continue;
      L.beetles.push({ beat: bar + s / 4, vel: vel * (s % 4 === 0 ? 1 : s % 2 ? 0.55 : 0.8), tone: s % 4 === 2 ? 0.9 : 0.4, accent: s % 2 === 0 });
    }
  };
  beetleBar(185, 0.8, [0, 1, 2, 3]);
  beetleBar(188, 0.9);
  beetleBar(192, 0.75, [7, 11, 15]);
  for (let bar = 316; bar < 348; bar += 4) beetleBar(bar, 0.45, [1, 3, 5, 7, 9, 11, 13, 15]);
  // dragonflies: swoops onto la (E5), some from below, some from above
  const DF = [[169, 0.5, -7], [170.5, 0.5, 5], [171, 1, -7], [172.5, 0.25, -5], [172.75, 0.25, -5], [173, 1, 7], [174.5, 0.5, -7], [175, 0.5, -5], [175.5, 0.5, 12]];
  for (const [b, d, from] of DF) L.dragonflies.push({ beat: b, dur: d, from, vel: 0.9 });
  for (const [b, d, from] of [[322, 1, -7], [330, 1, 7], [338, 1, -7], [346, 1, 12]]) L.dragonflies.push({ beat: b, dur: d, from, vel: 0.55 });
  // her wings beat time (scene 6: she stands in the pond): downbeat and third beat through her solo, every beat in the last chord
  for (let b = 176; b < 210; b += 2) L.wings.push({ beat: b, vel: b % 4 === 0 ? 1 : 0.75 });
  for (let b = 352; b < 360; b++) L.wings.push({ beat: b, vel: 0.8 });
  return L;
}

/** Her scratches: { src: 'djamm' | group, at (beats), strokes (relative beats, seconds in the sound) }. */
export function buildScratches() {
  const S = [];
  const dj = (at, strokes, gain = 1) => S.push({ src: 'djamm', at, strokes, gain });
  const an = (group, at, strokes, gain = 1) => S.push({ src: group, at, strokes, gain });
  // p0/p1: seconds from the sound's attack ("Dj" .. "a" of Djamm), so the strokes rub the first syllable
  dj(6, [...baby(0, 0.5, 0, 0.22), ...baby(0.5, 0.5, 0, 0.22), ...chirp(1, 0.25, 0, 0.16), ...chirp(1.25, 0.25, 0, 0.16), ...stab(1.5, 0.25, 0, 0.18)], 0.8);
  an('grazers', 100, [{ t0: 0, t1: 1, p0: 0, p1: 0.26 }, { t0: 1, t1: 2, p0: 0.26, p1: 0.02 }], 1);
  an('frogs', 126, [...chirp(0, 0.5, 0, 0.12), ...chirp(0.5, 0.5, 0, 0.12), ...baby(1, 0.25, 0, 0.08), ...baby(1.25, 0.25, 0, 0.08)], 0.9);
  an('lizards', 150, [{ t0: 0, t1: 0.75, p0: 0, p1: 0.2, shape: 'scribble', hz: 18 }, ...stab(0.75, 0.25, 0, 0.1)], 0.8);
  dj(181, [
    ...baby(0, 0.5, 0, 0.24), ...baby(0.5, 0.5, 0, 0.24),
    ...chirp(1, 0.5, 0, 0.2), ...chirp(1.5, 0.25, 0, 0.14), ...chirp(1.75, 0.25, 0, 0.14),
    ...transformer(2, 1, 0, 0.42, 8),
  ]);
  an('frogs', 189.5, [...chirp(0, 0.5, 0, 0.12)], 0.9);
  dj(191, [...flare(0, 0.5, 0, 0.22), ...stab(0.5, 0.25, 0, 0.16), ...stab(0.75, 0.25, 0, 0.16)], 0.85);
  dj(205.75, [...stab(0, 0.25, 0, 0.18)], 0.8);
  dj(338, [...transformer(0, 1, 0, 0.4, 6), ...chirp(1, 0.5, 0, 0.18), ...stab(1.5, 0.5, 0, 0.3)], 0.8);
  return S.filter(s => s.strokes.length);
}

/** Her lines on the grid: beat (first syllable's attack) or split (ms gap) + beats per word group, and how they are dressed. */
export const PLACES = {
  welcome: { beat: 2, echo: { beats: 0.5, fb: 0.4, taps: 3 } },
  'egill-ready': { beat: 8 },
  'count-in': { split: 300, beats: [12, 13, 14, 15] },
  aftur: { beat: 22, echo: { beats: 0.25, fb: 0.5, taps: 4 } },
  grazers: { split: 300, beats: [88, 92] },
  'turtles-slow': { split: 300, beats: [104, 107, 110], echo: { beats: 1, fb: 0.35, taps: 2 } },
  'turtles-now': { beat: 112, echo: { beats: 0.5, fb: 0.4, taps: 3 } },
  frogs: { beat: 128, stutter: { times: 2, len: 0.25 }, echo: { beats: 0.5, fb: 0.5, taps: 4 } },
  lizards: { split: 300, beats: [144, 147] },
  faster: { beat: 151, echo: { beats: 0.25, fb: 0.45, taps: 3 } },
  flyers: { beat: 160, echo: { beats: 0.75, fb: 0.45, taps: 3 } },
  dragonflies: { beat: 168 },
  'my-turn': { beat: 176, echo: { beats: 0.5, fb: 0.4, taps: 3 } },
  djamm: { beat: 180, echo: { beats: 0.25, fb: 0.5, taps: 4 } },
  beetles: { beat: 184 },
  'egill-yes': { beat: 192 },
  louder: { beat: 200, echo: { beats: 0.5, fb: 0.4, taps: 2 } },
  sloedla: { split: 180, beats: [206, 208] },
  'wings-up': { beat: 244, echo: { beats: 0.5, fb: 0.4, taps: 3 } },
  'hold-on': { beat: 260 },
  everyone: { beat: 273, radio: false },
  'one-more': { beat: 281, echo: { beats: 0.5, fb: 0.45, taps: 3 } },
  biggest: { split: 180, beats: [320, 322], echo: { beats: 0.5, fb: 0.45, taps: 3 } },
  thanks: { beat: 354 },
};
