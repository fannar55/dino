// The show's score (chapter 5, scene 6: the music video): what the festival's light and magic do at each beat of DJ Flugeðla's set,
// read off the set itself (kafli5-set.js: its sections, its tune and its cues), so a set cut again moves the show with it.
//
// Everything here is a pure function of the DANCE beat (kafli5-video.js): the set's beat, spooled back in the rewind and standing
// still in Stoppdans (but the big words, which are a function of the set's own beat: wordAt). An event of the set is kept at the
// dance beat it is heard on, and two that fall on the same dance beat (the drop, and the drop again after the rewind) are one.
// Nothing here knows a clock, a frame or three.js: kafli5-show.js draws it, tests/kafli5-show.test.mjs holds it.
//
//   fireflies   createFireflies: each one's place, size, light and colour at a beat
//   dusk        duskAt: how deep the dusk is (it falls under her horn and stays), liftAt: the soft flashes,
//               capAt: the sun's nightcap, on while the dusk lasts
//   the looks   LOOKS, LOOK_CUES, lookAt: a colour of sky, light, footlights and water for each record of the set (by the SET's beat)
//   fireworks   FIREWORKS, sparkAt: a firework of fireflies over each group on the band's five last hits, and a gold willow on the last
//   splashes    SPLASHES, dropAt, splashRingAt: the crowns of drops on the drops, a ring where a frog lands and where the grazers stomp
//   the count   COUNTS, countAt: the big number on the screen, bigger with every number
//   the words   WORDS, wordAt: the big word on the screen as she shouts it (by the SET's beat)
//   notes       NOTES, noteAt, notePoint: the glowing notes between the groups, her crest and the sky
//   the beat    pulseAt, energyOf, beatRingsAt: the backbeat in the lights, rings of light on the water
import { SONG } from './kafli5-set.js';
import { CAMERA, danceBeatAt, sectionAt } from './kafli5-video.js';
import { CHOIR, GROUPS, SHOTS, WADE, around, seatsOf } from './kafli5-pool.js';
import { FAR_POOL } from './kafli4-route.js';

const SET = SONG.set;
const LEVEL = FAR_POOL.level;
const TAU = 2 * Math.PI;
export const BEAT_SECONDS = 60 / SONG.bpm;
const GRAVITY = 9.81 * BEAT_SECONDS ** 2; // m a beat a beat: drops fall as drops do

const clamp01 = x => Math.min(1, Math.max(0, x));
const smooth = x => { const k = clamp01(x); return k * k * (3 - 2 * k); };
const lerp = (a, b, k) => a + (b - a) * k;
/** A number from 0 to 1 for the whole numbers `i` and `k`, always the same. */
export const hash = (i, k) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const srgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);

const danceOf = setBeat => danceBeatAt(setBeat).beat;
const part = id => SET.sections.find(section => section.id === id);
/** The dance beat a part of the set starts on. */
const startOf = id => danceOf(part(id).startBeat);
const cues = kind => SET.cues.filter(event => event.kind === kind);
/** The events at the dance beats they are heard on (`beat`; `setBeat` the set's), one for each dance beat and `key`. */
function heard(events, key = () => '') {
  const seen = new Set();
  const out = [];
  for (const event of events) {
    const beat = danceOf(event.beat);
    const id = `${beat}|${key(event)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...event, beat, setBeat: event.beat });
  }
  return out.sort((a, b) => a.beat - b.beat);
}

const END = danceOf(SET.endBeat);
const HER = WADE.at; // she stands out in the pool: the swarm's middle, where the bursts start
const POOL = { at: FAR_POOL.center, radius: FAR_POOL.radius };

// ---------------------------------------------------------------------------------------------
// The drops: a peak where the set breaks loose after a build or a false end is a BURST (the fireflies fly out, the water jumps);
// the other peaks are a puff (they swell).

const PEAKS = heard(cues('peak')).map(peak => ({ ...peak, section: sectionAt(peak.setBeat)?.id }));
/** The dance beats of the two big drops: "Nú!" and "Einu sinni enn". */
export const BURSTS = PEAKS.filter(peak => peak.section === 'drop' || peak.section === 'lastchorus').map(peak => peak.beat);
/** The dance beats of the smaller peaks. */
export const PUFFS = PEAKS.filter(peak => !BURSTS.includes(peak.beat)).map(peak => peak.beat);

// ---------------------------------------------------------------------------------------------
// The dusk and the soft flashes

export const DUSK = { sink: 8 }; // beats it sinks over as her horn begins
/**
 * How deep the dusk is at `beat`, 0 (the afternoon) to 1: it sinks as her horn's part begins, and it is dusk from then on (the
 * owner's word of 2026-11-11: the day does not come back on the drop). The party's second half is in the dusk, lit by its
 * fireflies and soft flashes, and so is the chapter's last scene (kafli5.js keeps the dusk when the set is over).
 */
export function duskAt(beat) {
  return smooth((beat - startOf('break')) / DUSK.sink);
}

/**
 * The sun's nightcap (the owner's wish of 2026-11-11), 0 (off) to 1 (on its head): it comes down in the second bar of the sinking
 * dusk, as the camera looks at the sun (kafli5-video.js: set_sun), and stays on, as the dusk does.
 */
export const CAP = { from: 4, beats: 3 }; // down over beats 236 to 239 of the set, seen from the cut at 236
export function capAt(beat) {
  return smooth((beat - startOf('break') - CAP.from) / CAP.beats);
}

export const LIFT = { beats: 2 }; // a flash fades over these; two are never nearer than this (so never two in a second)
/** The soft flashes: the peaks, the crowd's roars and the band's hits, strongest first where two are too near each other. */
export const FLASHES = (() => {
  const all = [
    ...PEAKS.map(({ beat }) => ({ beat, strength: 1 })),
    ...heard(cues('roar')).map(({ beat }) => ({ beat, strength: 0.5 })),
    ...heard(cues('hit')).map(({ beat }) => ({ beat, strength: 0.45 })),
    ...heard(cues('horn')).filter(horn => sectionAt(horn.setBeat)?.id === 'end').map(({ beat }) => ({ beat, strength: 0.6 })),
    { beat: END, strength: 0.8 },
  ].sort((a, b) => b.strength - a.strength || a.beat - b.beat);
  const kept = [];
  for (const flash of all) if (kept.every(other => Math.abs(other.beat - flash.beat) >= LIFT.beats)) kept.push(flash);
  return kept.sort((a, b) => a.beat - b.beat);
})();
/** How much brighter the picture is at `beat` for a flash, 0 to 1: up at once on the hit, then fading over LIFT.beats. */
export function liftAt(beat) {
  let lift = 0;
  for (const flash of FLASHES) {
    const age = beat - flash.beat;
    if (age >= 0 && age < LIFT.beats) lift = Math.max(lift, flash.strength * (1 - age / LIFT.beats) ** 2);
  }
  return lift;
}

// ---------------------------------------------------------------------------------------------
// A colour for each record (the owner's yes of 2026-11-19: "every record of the set gets its own colour of sky and water").
//
// The set is a DJ set: Flugeðla changes record ten times (the set's `record` cues) between six records, and each record has its
// own look: the sky's colour, the light's colour, the footlights and the water's colour. When she changes record the stage turns
// to that record's look over LOOK.turn beats, so "a new colour" is "a new record".
//
// The owner's word on the dusk stands: it falls in the calm middle (her horn's record, `rolegt`) and it is dusk from then to the
// chapter's end, with the sun in its nightcap. So a record played by day has a tint of the golden afternoon (`amount` of the way
// to its colours) and a record played after the dusk has fallen has a colour of the night (`night`: all the way, the sun dim),
// never the day again. The basic record (`vamp`) by day is the afternoon as it is: no look. When Flugeðla says good night the
// stage turns to the calm night (`after`), which the last scene of the chapter is played in.
//
// The footlights are how the animals are seen in the dark half: the fill light's colour from below (`hemi.ground`), pale and
// warm so that what it falls on keeps its own colours, and much stronger than the dusk had it (`hemi.intensity`, a share of the
// afternoon's). What faces up (the ground, the hills) takes the fill light's colour from above (`hemi.sky`), which is the
// night's: so an animal seen close stands lit in its own colours against a darker, coloured ground and sky.
//
// A look has the shape engine/show/dusk.js blends (its DUSK is the look `rose`, as the owner knows it): sun (the light), hemi
// (the fill: its `ground` is the footlights), sky, fog (the haze), water, mosiCloud, exposure, envIntensity; numbers are shares of
// the afternoon's. Nothing here strobes: a turn takes over a second, and nothing in a look follows the beat.

/** Beats a change of look takes; with less motion; and the turn to the calm night as she says good night. */
export const LOOK = { turn: 2.5, calm: 8, settle: 5 };
export const LOOKS = {
  // by day: tints of the golden afternoon
  honey: { // the turtles' slow funk: honey light and green-gold water
    record: 'fonk', night: false, amount: 0.6,
    sun: { color: '#ffb45e', intensity: 1 }, hemi: { sky: '#ecdcae', ground: '#8f7a2e', intensity: 1.1 },
    sky: { zenith: '#86a8b4', horizon: '#ffd07c', glow: '#ffd070', cloud: '#fff0cc', cloudShade: '#dcbf92' },
    fog: { color: '#ecd6a4', sunColor: '#ffc46c' },
    water: { horizon: '#f6d480', zenith: '#7aa37c', deep: '#5c7f3a', glint: '#ffe890' },
    mosiCloud: '#fff0cc', exposure: 1, envIntensity: 1,
  },
  cool: { // the beetles' drums: a fresher, bluer afternoon
    record: 'slagverk', night: false, amount: 0.6,
    sun: { color: '#ffe9cf', intensity: 1 }, hemi: { sky: '#bfe0ff', ground: '#4f6a58', intensity: 1.05 },
    sky: { zenith: '#3f86dc', horizon: '#d2ecf2', glow: '#fff0d0', cloud: '#ffffff', cloudShade: '#b4c6da' },
    fog: { color: '#cfe2e4', sunColor: '#f2e6c8' },
    water: { horizon: '#d4f0f2', zenith: '#3f86dc', deep: '#1f6f92', glint: '#f2ffff' },
    mosiCloud: '#ffffff', exposure: 1, envIntensity: 1,
  },
  // from her horn on: colours of the night
  rose: { // her horn, the calm record: the dusk as it fell from the start (engine/show/dusk.js DUSK, to the letter)
    record: 'rolegt', night: true, amount: 1,
    sun: { color: '#ff9a62', intensity: 0.55 }, hemi: { sky: '#8e9fd6', ground: '#4a4036', intensity: 0.95 },
    sky: { zenith: '#26356e', horizon: '#e9976f', glow: '#ffae78', cloud: '#e0a798', cloudShade: '#5c5784' },
    fog: { color: '#8f7f98', sunColor: '#f2a078' },
    water: { horizon: '#d98c74', zenith: '#2a3a72' },
    mosiCloud: '#e2a69c', exposure: 0.9, envIntensity: 0.7,
  },
  violet: { // the basic record in the night: the build, the drop, everyone's tune, Stoppdans; and the ending that is not one
    record: 'vamp', night: true, amount: 1,
    sun: { color: '#ff9ab8', intensity: 0.5 }, hemi: { sky: '#6a5cc0', ground: '#ffe6cc', intensity: 6 },
    sky: { zenith: '#1d1650', horizon: '#a8548c', glow: '#ff9ac0', cloud: '#9a5c94', cloudShade: '#3c2c70' },
    fog: { color: '#54407a', sunColor: '#c86a98' },
    water: { horizon: '#8c5a8c', zenith: '#241a5c', deep: '#2a3060', glint: '#ffb0d8' },
    mosiCloud: '#a86aa0', exposure: 0.92, envIntensity: 0.6,
  },
  teal: { // the carnival: a turquoise night over a coral edge
    record: 'song3', night: true, amount: 1,
    sun: { color: '#ffa884', intensity: 0.5 }, hemi: { sky: '#17525c', ground: '#fff0d8', intensity: 6 },
    sky: { zenith: '#0a4654', horizon: '#3a9c90', glow: '#a8f0d8', cloud: '#5cbcaa', cloudShade: '#145058' },
    fog: { color: '#2a6a70', sunColor: '#58b4a2' },
    water: { horizon: '#48b0a0', zenith: '#0c4a58', deep: '#0e6a70', glint: '#c8fff4' },
    mosiCloud: '#6cc4b4', exposure: 0.92, envIntensity: 0.6,
  },
  blue: { // the drums alone, "Egill, segðu já!": deep blue, nearly night
    record: 'slagverk', night: true, amount: 1,
    sun: { color: '#a8b8ff', intensity: 0.4 }, hemi: { sky: '#4a6ad0', ground: '#eaf0ff', intensity: 5.5 },
    sky: { zenith: '#08206a', horizon: '#3a7ee0', glow: '#ffc8a0', cloud: '#5a8ad8', cloudShade: '#122468' },
    fog: { color: '#2a4c9a', sunColor: '#6a96e8' },
    water: { horizon: '#3a7ee0', zenith: '#0a1c60', deep: '#123488', glint: '#c8dcff' },
    mosiCloud: '#6a86cc', exposure: 0.9, envIntensity: 0.55,
  },
  gold: { // the last chorus: the brightest and the warmest, a gold edge under a plum sky
    record: 'vidlag', night: true, amount: 1,
    sun: { color: '#ffc070', intensity: 0.65 }, hemi: { sky: '#8a5c38', ground: '#ffe8b4', intensity: 7.5 },
    sky: { zenith: '#b0643a', horizon: '#ffd070', glow: '#ffe09a', cloud: '#ffe0a0', cloudShade: '#a8603c' },
    fog: { color: '#c88a50', sunColor: '#ffc860' },
    water: { horizon: '#ffc860', zenith: '#b06a38', deep: '#8a5a2c', glint: '#fff4c0' },
    mosiCloud: '#ffe0a8', exposure: 1, envIntensity: 0.7,
  },
  night: { // after the set: the calm night the party is heard far away in, and the roar
    record: null, night: true, after: true, amount: 1,
    sun: { color: '#c0b4e8', intensity: 0.35 }, hemi: { sky: '#4a5cae', ground: '#f0e4d0', intensity: 4.5 },
    sky: { zenith: '#0a0c2c', horizon: '#5a4a8c', glow: '#ffc8a0', cloud: '#6a5ea0', cloudShade: '#181840' },
    fog: { color: '#3a3470', sunColor: '#7a6ab4' },
    water: { horizon: '#5a4a8c', zenith: '#0a0e34', deep: '#1a2058', glint: '#e0d8ff' },
    mosiCloud: '#7468a8', exposure: 0.88, envIntensity: 0.55,
  },
};
/**
 * Every change of look, at the set's beat it begins on: [{ beat, record (the record that starts there), look (a key of LOOKS, or
 * null: the afternoon as it is), turn (beats it takes) }]. One for each record she puts on, and the calm night as she says good
 * night. The record of the dusk (her horn's) turns as slowly as the dusk sinks: it is the dusk.
 */
export const LOOK_CUES = (() => {
  const dusk = part('break').startBeat;
  const lookOf = (record, night) => Object.keys(LOOKS).find(id => LOOKS[id].record === record && LOOKS[id].night === night && !LOOKS[id].after) ?? null;
  const list = cues('record').map(({ beat, to }) => {
    const night = beat >= dusk;
    // a record with no look of its own: by day the afternoon as it is, in the night the basic record's (never the day again)
    return { beat, record: to, look: lookOf(to, night) ?? (night ? lookOf('vamp', true) : null), turn: beat === dusk ? DUSK.sink : LOOK.turn };
  });
  if (!list.some(cue => cue.beat === dusk)) list.push({ beat: dusk, record: null, look: 'rose', turn: DUSK.sink }); // (a set cut again: the dusk falls all the same)
  const goodnight = SET.lines.find(line => line.id === 'goodnight')?.beat ?? part('end').startBeat + 5;
  list.push({ beat: goodnight, record: null, look: Object.keys(LOOKS).find(id => LOOKS[id].after), turn: LOOK.settle });
  return list.sort((a, b) => a.beat - b.beat);
})();
/**
 * The look at the set's beat `setBeat`: { from, to (keys of LOOKS, or null: the afternoon), turned (0 to 1: how far it has turned
 * from the one to the other) }. By the SET's beat, as the words: a record is changed on the music's beat, and the light does not
 * spool back in the rewind. With less motion a turn takes LOOK.calm beats at least.
 */
export function lookAt(setBeat, { reduced = false } = {}) {
  let k = -1;
  while (k + 1 < LOOK_CUES.length && LOOK_CUES[k + 1].beat <= setBeat) k++;
  if (k < 0) return { from: null, to: null, turned: 1 };
  const cue = LOOK_CUES[k];
  return { from: k ? LOOK_CUES[k - 1].look : null, to: cue.look, turned: smooth((setBeat - cue.beat) / (reduced ? Math.max(cue.turn, LOOK.calm) : cue.turn)) };
}
/**
 * The light at the set's beat `setBeat` as engine/show/dusk.js mixes it: [[look, weight], ...], at most two (the look it turns
 * from and the one it turns to), the weights 1 together at most; what is left of 1 is the afternoon as it is. With less motion
 * every look is half as deep (as the dusk was from the start).
 */
export function lookMixAt(setBeat, { reduced = false } = {}) {
  const { from, to, turned } = lookAt(setBeat, { reduced });
  const share = reduced ? 0.5 : 1;
  const parts = [];
  if (from && turned < 1) parts.push([LOOKS[from], LOOKS[from].amount * (1 - turned) * share]);
  if (to && turned > 0) parts.push([LOOKS[to], LOOKS[to].amount * turned * share]);
  return parts;
}

// ---------------------------------------------------------------------------------------------
// The beat in the light

/** How hard each part of the set plays, 0 to 1: how much of the beat the lights show. */
const ENERGY = {
  arrival: 0.15, welcome: 0.4, warmup: 0.55, groove: 1, tuneA: 0.7, grazers: 0.9, turtles: 0.6, frogs: 0.8, lizards: 0.9, flyers: 0.8,
  beetles: 0.7, dragonflies: 0.7, break: 0, rise: 0.5, drop: 1, rewind: 1, redrop: 1, anthem: 1, freeze: 0.9, carnival: 1, crowd: 0.6,
  fakeend: 0.3, lastchorus: 1, end: 0.8,
};
export const energyOf = sectionId => ENERGY[sectionId] ?? 0;
/** The backbeat (the bar's second and fourth beats) as a light: 1 on it, fading to nearly nothing before the next. */
export function pulseAt(beat) {
  const since = (((beat - 1) % 2) + 2) % 2;
  return Math.exp(-since * 2.4);
}

export const BEAT_RING = { every: 2, life: 4, grow: 4.2 }; // a ring every second beat, the beats it lives, m a beat it spreads
/**
 * The rings of light on the water at `beat`: one from under her on a bar's first beat and a fainter one from the pool's middle on
 * its third, each spreading and fading over a bar. `emit(x, z, radius, width, level)` for each.
 */
export function beatRingsAt(beat, energy, emit) {
  if (energy <= 0) return;
  const last = Math.floor(beat / BEAT_RING.every) * BEAT_RING.every;
  for (let from = last; from > beat - BEAT_RING.life; from -= BEAT_RING.every) {
    if (from < 0) break;
    const age = beat - from;
    const first = from % 4 === 0;
    const [x, z] = first ? HER : POOL.at;
    emit(x, z, 1.2 + BEAT_RING.grow * age, 0.35 + 0.14 * age, (first ? 0.34 : 0.2) * energy * (1 - age / BEAT_RING.life) ** 2);
  }
}

// ---------------------------------------------------------------------------------------------
// The countdown's big numbers

// beats a number is on, pops in over and goes over; and how big each is, the letters' size as a share of the screen's height: the
// count grows with every number (the owner's yes of 2026-11-18), so "NÚ!" tops them. On a screen held upright a number's size is
// held to `upright` of that share of the screen's width instead, so the word after it, which the width holds, still tops it.
export const COUNT = { on: 1.3, pop: 0.3, out: 0.35, sizes: { 5: 0.4, 4: 0.5, 3: 0.6, 2: 0.72, 1: 0.85 }, upright: 0.68 };
/** The numbers she counts, each at its dance beat: [{ beat, n }]. */
export const COUNTS = heard(cues('count'), event => event.n).map(({ beat, n }) => ({ beat, n }));
const backOut = t => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2; // past its size and back
/**
 * The number on the screen at `beat`: null, or { n, scale, opacity, height, width } (scale 1 is its full size, which is `height`
 * of the screen's height and at most `width` of its width: engine/show/big-number.js). It pops in on its beat and is gone well
 * before the next. With less motion it is half the size and only fades.
 */
export function countAt(beat, { reduced = false } = {}) {
  for (const { beat: from, n } of COUNTS) {
    const age = beat - from;
    if (age < 0 || age >= COUNT.on) continue;
    const height = COUNT.sizes[n] ?? COUNT.sizes[5];
    const size = { height, width: height * COUNT.upright };
    const out = clamp01((age - (COUNT.on - COUNT.out)) / COUNT.out);
    if (reduced) return { n, scale: 0.5, opacity: Math.min(clamp01(age / COUNT.pop), 1 - out), ...size };
    const pop = age < COUNT.pop ? backOut(age / COUNT.pop) : 1;
    return { n, scale: (0.4 + 0.6 * pop) * (1 + 0.22 * out), opacity: Math.min(clamp01(age / 0.1), 1 - out), ...size };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// The big words: what Flugeðla shouts, slammed onto the screen (the owner's yes of 2026-11-18: "NÚ!", "AFTUR!", "STOPP!" and
// "HOPP!", and no others: the gap after "segðu já!" is the child's own).
//
// A word is kept at the SET's beat, not the dance beat: "Aftur!" is shouted inside the rewind, where the dance beat runs
// backwards, and "Stopp!" stands while the dance beat stands still. It is still a pure function of the game's time, so a held game
// and a capture find it as it is at that moment.

/**
 * How a word comes and goes (beats) and how big it is: `across` of the screen's width at most (a long word on a tablet held
 * upright), its letters `height` of the screen's height at most (a short word on one held flat). It comes in fast, a little past
 * its size and back, stands, and bursts away: `burst` bigger as it fades. A word that leaves room over and under it stands `at`
 * that share of the way down what the caption leaves free: in the upper part of the picture, so those the shot is about (Egill
 * hopping, the frogs frozen in the air) are seen under it. "NÚ!" fills the screen and stands in its middle.
 */
export const WORD = { pop: 0.28, out: 0.35, across: 0.88, height: 0.7, burst: 0.1, hop: 0.8, at: 0.34 }; // (hop: the beats a hop takes)
/**
 * Each word: the line of the set it is (SONG.set.lines), how many beats it is on, how wide it is in letter sizes, its outline counted (measured in the
 * page: Nunito at weight 900), and
 *   at     where its middle stands, if not WORD.at: "NÚ!" fills the screen from its middle, and "HOPP!" stands a little lower
 *          than the others, so its hop stays under the stars in the screen's corner
 *   lift   it stands this much lower (in letter sizes, negative: down): "NÚ!" has an accent over it, which wants room at the top
 *   still  it stands dead still and only fades: "STOPP!", through the first beats of the freeze, as the music does
 *   hop    it hops this high (letter sizes) on its second beat: "HOPP!"
 *   again  the set's part on whose first beat it shows once more: the drop after the rewind is the drop again, word and all
 */
const SHOUTS = [
  { line: 'now', on: 2.3, wide: 1.85, at: 0.5, lift: -0.15, again: 'redrop' },
  { line: 'aftur', on: 2, wide: 3.8 }, // to the drop it calls back, where "NÚ!" takes its place
  { line: 'stopp', on: 2, wide: 3.76, still: true }, // gone as the camera finds the turtle that moved
  { line: 'hopp', on: 2.3, wide: 3.3, at: 0.4, hop: 0.12 },
  { line: 'hopp-2', on: 2.3, wide: 3.3, at: 0.4, hop: 0.12 },
];
/** The words on the screen, each at the set's beat it is shouted on: [{ beat, text, on, wide, at, lift, still, hop }]. */
export const WORDS = SHOUTS.flatMap(({ line, again = null, at = WORD.at, lift = 0, still = false, hop = 0, ...word }) => {
  const said = SET.lines.find(entry => entry.id === line);
  if (!said) return []; // a set cut again without that shout plays on without the word
  const one = { ...word, at, lift, still, hop, text: said.text.toLocaleUpperCase('is') };
  return [{ ...one, beat: said.beat }, ...(again && part(again) ? [{ ...one, beat: part(again).startBeat }] : [])];
}).sort((a, b) => a.beat - b.beat);
/**
 * The word on the screen at the set's beat `setBeat`: null, or { text, scale, opacity, height, width, at, lift } (as countAt's, for
 * engine/show/big-number.js). With less motion it is half the size and only fades.
 */
export function wordAt(setBeat, { reduced = false } = {}) {
  for (const word of WORDS) {
    const age = setBeat - word.beat;
    if (age < 0 || age >= word.on) continue;
    const size = { height: WORD.height, width: WORD.across / word.wide, at: word.at };
    const out = clamp01((age - (word.on - WORD.out)) / WORD.out);
    const opacity = Math.min(clamp01(age / 0.1), 1 - out);
    if (reduced) return { text: word.text, scale: 0.5, opacity: Math.min(clamp01(age / WORD.pop), 1 - out), ...size, lift: word.lift };
    const pop = age < WORD.pop ? backOut(age / WORD.pop) : 1;
    const hop = word.hop * Math.sin(Math.PI * clamp01((age - 1) / WORD.hop)); // up and down again, from its second beat
    return { text: word.text, scale: (0.4 + 0.6 * pop) * (word.still ? 1 : 1 + WORD.burst * out), opacity, ...size, lift: word.lift + hop };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// The glowing notes

export const NOTE = { fly: 1.5, rise: 6, arc: 2.5, climb: 8, glow: 0.75, tail: 5 }; // beats and metres
/**
 * Every note of the set, at its dance beat: { beat, from, to, life }. `from` and `to` are a group of the choir, 'crest' (hers) or
 * 'sky'. A note of her tune flies from the group that sings it to her crest; a note of her horn rises from her crest into the sky
 * in the quiet part, and flies from her crest out to a group everywhere else (group after group, low to high).
 */
export const NOTES = (() => {
  const tune = SET.tune.map(note => ({ beat: note.beat, from: note.group, to: 'crest', life: NOTE.fly }));
  const nth = {};
  const horn = cues('horn').map(event => {
    const section = sectionAt(event.beat)?.id;
    if (section === 'break') return { beat: event.beat, from: 'crest', to: 'sky', life: NOTE.rise };
    nth[section] = (nth[section] ?? -1) + 1;
    return { beat: event.beat, from: 'crest', to: GROUPS[nth[section] % GROUPS.length], life: NOTE.fly };
  });
  return heard([...tune, ...horn], note => `${note.from}>${note.to}`).map(({ beat, from, to, life }) => ({ beat, from, to, life }));
})();
/** Where `note` is in its life at `beat`: null (not on), or { u (0 to 1 along its way), glow (0 to 1: the light where it landed) }. */
export function noteAt(note, beat) {
  const age = beat - note.beat;
  const glow = note.to === 'sky' ? 0 : NOTE.glow;
  if (age < 0 || age >= note.life + glow) return null;
  return age < note.life ? { u: age / note.life, glow: 0 } : { u: 1, glow: 1 - (age - note.life) / glow };
}
/** The point `u` of the way of `note` from `a` to `b` ([x, y, z]), into `out` ([x, y, z]): an arc, or a wavering climb into the sky. */
export function notePoint(note, a, b, u, out) {
  if (note.to === 'sky') {
    out[0] = a[0] + 0.7 * Math.sin(u * 5 + note.beat);
    out[1] = a[1] + NOTE.climb * (1 - (1 - u) ** 2);
    out[2] = a[2] + 0.7 * Math.sin(u * 4 + note.beat * 1.7);
    return out;
  }
  const k = 0.5 * u + 0.5 * smooth(u);
  out[0] = lerp(a[0], b[0], k);
  out[1] = lerp(a[1], b[1], k) + NOTE.arc * Math.sin(Math.PI * u);
  out[2] = lerp(a[2], b[2], k);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The splashes

const PADS = seatsOf('frogs').map(seat => seat.at);
/** The lily pad ([x, z]) of the frog that calls on the set's beat `setBeat`: each call the next frog's, by its dance beat alone. */
export const padOf = setBeat => PADS[Math.round(danceOf(setBeat) * 4) % PADS.length];

export const SPLASH = { ring: 4, rim: 0.8, crowns: 12, height: 4.5, frogAfter: 0.8 }; // beats a ring lives; the crowns' place and height
/**
 * Every splash of the set: { beat, at: [x, z], drops, up (m a beat), spread (m a beat), ring (m a beat), seed }. On the bursts and
 * the last hit the water jumps up all round the pool (SPLASH.crowns crowns near its rim); a frog's call makes a small one at a lily
 * pad as the frog lands (SPLASH.frogAfter beats after its call); and in the grazers' part each stomp (their calls) sends a ring out
 * over the water from the bank at their feet, with no drops.
 */
export const SPLASHES = (() => {
  const out = [];
  const speedFor = height => Math.sqrt(2 * GRAVITY * height);
  [...BURSTS, END].forEach((beat, n) => {
    for (let k = 0; k < SPLASH.crowns; k++) {
      const angle = TAU * (k + 0.5 * hash(k, n + 40)) / SPLASH.crowns;
      const far = POOL.radius * (SPLASH.rim - 0.14 * hash(k, n + 50));
      out.push({
        beat: beat + 0.2 * hash(k, n + 60), at: [POOL.at[0] + far * Math.cos(angle), POOL.at[1] + far * Math.sin(angle)],
        drops: 20, up: speedFor(SPLASH.height * (beat === END ? 0.7 : 1)), spread: 0.75, ring: 1.6, seed: 100 * (n + 1) + k,
      });
    }
  });
  heard(cues('call').filter(call => call.group === 'frogs')).forEach((call, k) => {
    out.push({ beat: call.beat + SPLASH.frogAfter, at: padOf(call.setBeat), drops: 5, up: speedFor(0.45), spread: 0.3, ring: 0.8, seed: 1000 + k });
  });
  const feet = [-6, 5, 0].map(turn => around(CHOIR.grazers.angle + turn, POOL.radius - 1.5)); // the water's edge before the three of them
  heard(cues('call').filter(call => call.group === 'grazers' && sectionAt(call.beat)?.id === 'grazers')).forEach((call, k) => {
    out.push({ beat: call.beat, at: feet[k % feet.length], drops: 0, up: 0, spread: 0, ring: 1.4, seed: 2000 + k });
  });
  return out.sort((a, b) => a.beat - b.beat);
})();
/** The longest a splash's drops are in the air, beats. */
export const SPLASH_AIR = Math.max(...SPLASHES.map(splash => (2 * splash.up) / GRAVITY));
/** Drop `j` of `splash`, `age` beats after it: false (not in the air), or `out` = { x, y (over the water), z, size, level }. */
export function dropAt(splash, j, age, out) {
  if (age < 0) return false;
  const h = k => hash(splash.seed * 17 + j, k);
  const up = splash.up * (0.55 + 0.45 * h(1));
  const y = up * age - 0.5 * GRAVITY * age * age;
  if (y < 0) return false;
  const angle = TAU * (j + h(2)) / splash.drops;
  const far = 0.15 + splash.spread * (0.4 + 0.6 * h(3)) * age;
  out.x = splash.at[0] + far * Math.cos(angle);
  out.z = splash.at[1] + far * Math.sin(angle);
  out.y = y;
  out.size = splash.drops > 6 ? 0.22 + 0.26 * h(4) : 0.1 + 0.1 * h(4);
  out.level = Math.min(1, 0.35 + y * 3);
  return out;
}
/** The ring `splash` leaves on the water, `age` beats after it: null, or { radius, width, level }. */
export function splashRingAt(splash, age) {
  if (age < 0 || age >= SPLASH.ring) return null;
  return { radius: 0.3 + splash.ring * age, width: 0.12 + 0.07 * age, level: (splash.drops > 6 ? 0.7 : 0.5) * (1 - age / SPLASH.ring) ** 2 };
}

// ---------------------------------------------------------------------------------------------
// The fireflies

export const FIREFLIES = { count: 240, rise: [12, 24], size: 0.36 }; // how many (half with less motion), beats one takes up out of the reed (the first, the rest), m across
const WARM = ['#ffd56a', '#ffe9a8', '#ffb347', '#fff1cf'].map(srgb);
const PARTY = ['#ff7fa6', '#7fe3d2', '#ffd56a', '#ff9d4a', '#b8f070'].map(srgb); // the confetti's colours on a burst
const [BURST_ONE, BURST_TWO] = BURSTS;
/**
 * How many of the fireflies are out at a dance beat, 0 to 1 (by its `rank`, each has its turn): the first rise as the set starts,
 * more drift in with the music, all of them gather round her in the quiet part and burst out on the drop, fewer through the middle
 * of the set, all again from the second burst through the last chorus, and they sink away after the last hit.
 */
const OUT = [
  [startOf('arrival'), 0], [startOf('welcome'), 0.3], [startOf('tuneA'), 0.36], [startOf('dragonflies'), 0.4], [startOf('break') + 6, 1],
  [BURST_ONE + 4, 1], [startOf('anthem') + 4, 0.75], [startOf('freeze') + 6, 0.7], [startOf('carnival'), 0.7],
  [startOf('crowd'), 0.55], [startOf('fakeend'), 0.45], [BURST_TWO, 1], [END, 1], [END + 4.5, 0],
];
export function outAt(beat) {
  if (beat <= OUT[0][0]) return OUT[0][1];
  for (let k = 1; k < OUT.length; k++) {
    if (beat <= OUT[k][0]) return lerp(OUT[k - 1][1], OUT[k][1], (beat - OUT[k - 1][0]) / (OUT[k][0] - OUT[k - 1][0] || 1));
  }
  return OUT.at(-1)[1];
}
/** The dance beat a firefly of `rank` first comes out on. */
function firstOut(rank) {
  for (let k = 1; k < OUT.length; k++) {
    if (OUT[k][1] * 1.06 >= rank) {
      const [b0, v0] = OUT[k - 1];
      const [b1, v1] = OUT[k];
      return v1 === v0 ? b0 : lerp(b0, b1, clamp01((rank / 1.06 - v0) / (v1 - v0)));
    }
  }
  return OUT.at(-1)[0];
}
const GATHER = 14; // beats they take to come to her from all over the pool
/** How much the fireflies are gathered round her, 0 to 1: through the quiet part and the build, and again before the second burst. */
export function gatherAt(beat) {
  if (beat < BURST_ONE) return smooth((beat - (startOf('break') - 8)) / GATHER);
  if (beat < BURST_TWO) return smooth((beat - (BURST_TWO - GATHER - 2)) / GATHER);
  return 0;
}
/** How tight and how low the swarm round her is: wide and high under her horn, drawn in and down to the water through the build. */
function tightAt(beat) {
  if (beat >= BURST_ONE) return { wide: 0.65, high: 0.45 }; // the second gathering, before "Einu sinni enn"
  const k = smooth((beat - startOf('rise')) / (BURST_ONE - 2 - startOf('rise')));
  return { wide: lerp(1, 0.6, k), high: lerp(1, 0.4, k) };
}

/**
 * The fireflies: `count` of them, each with its own home in the reed, its own place over the pool, its own way round her and its
 * own way out on each burst. Returns { count, at(i, beat, energy, out) }: firefly `i` at dance beat `beat` in a part of the set
 * that plays `energy` hard (energyOf), into `out` = { x, y, z, size (m), level (0 to 1), r, g, b }. With less motion (`reduced`)
 * they only drift where they are: no swarm, no burst, no beat, half the size.
 */
export function createFireflies({ count = FIREFLIES.count, reduced = false } = {}) {
  const swarm = (f, beat, out) => {
    const { wide, high } = tightAt(beat);
    const angle = f.round + f.turn * beat;
    out[0] = HER[0] + Math.cos(angle) * f.reach * wide;
    out[1] = LEVEL + 0.5 + f.height * high + 0.35 * Math.sin(beat * f.bob + f.round);
    out[2] = HER[1] + Math.sin(angle) * f.reach * wide;
    return out;
  };
  const flies = Array.from({ length: count }, (_, i) => {
    const h = k => hash(i + 1, k);
    const rank = (i * 0.61803398875 + 0.37) % 1; // each its turn, evenly
    const reed = FAR_POOL.reeds[rank < 0.3 || h(2) < 0.75 ? 1 : 0]; // the first all rise out of her reed; of the rest some live in the small one by Mosi
    const [ra, rr] = [TAU * h(3), reed.radius * 0.85 * Math.sqrt(h(4))];
    const [wa, wr] = [TAU * h(6), POOL.radius * 1.08 * Math.sqrt(h(7))];
    const f = {
      rank, first: firstOut(rank), rise: lerp(FIREFLIES.rise[0], FIREFLIES.rise[1], smooth(firstOut(rank) / startOf('warmup'))),
      home: [reed.at[0] + rr * Math.cos(ra), LEVEL + 0.5 + 1.3 * h(5), reed.at[1] + rr * Math.sin(ra)],
      place: [POOL.at[0] + wr * Math.cos(wa), LEVEL + 1 + 5.5 * h(8) ** 2, POOL.at[1] + wr * Math.sin(wa)],
      sway: [1.2 + 1.3 * h(9), 0.3 + 0.4 * h(10), 1.2 + 1.3 * h(11)],
      pace: [TAU / (9 + 12 * h(12)), TAU / (5 + 6 * h(13)), TAU / (9 + 12 * h(14))],
      round: TAU * h(15), turn: (h(16) < 0.5 ? -1 : 1) * TAU / (24 + 24 * h(17)), reach: 3.5 + 4.5 * h(18), height: 0.3 + 6.2 * h(19),
      bob: TAU / (3 + 3 * h(26)), twinkle: TAU / (2.5 + 4 * h(27)),
      size: FIREFLIES.size * (0.75 + 0.5 * h(28)) * (reduced ? 0.5 : 1),
      warm: WARM[Math.floor(h(29) * WARM.length)], party: PARTY[Math.floor(h(30) * PARTY.length)],
      from: [], to: [],
    };
    BURSTS.forEach((beat, k) => {
      const [angle, far] = [TAU * h(20 + k), 5 + 19 * Math.sqrt(h(22 + k))];
      f.from[k] = swarm(f, beat - 1e-6, [0, 0, 0]); // where it is in the swarm as the drop lands
      f.to[k] = [HER[0] + far * Math.cos(angle), LEVEL + 2 + 9 * h(24 + k), HER[1] + far * Math.sin(angle)];
    });
    return f;
  });
  const p = [0, 0, 0];
  const q = [0, 0, 0];

  function at(i, beat, energy, out) {
    const f = flies[i];
    // drifting round its own place over the pool
    p[0] = f.place[0] + f.sway[0] * Math.sin(beat * f.pace[0] + f.round);
    p[1] = f.place[1] + f.sway[1] * Math.sin(beat * f.pace[1] + f.round * 2);
    p[2] = f.place[2] + f.sway[2] * Math.sin(beat * f.pace[2] + f.round * 3);
    let since = -1; // beats since the last burst
    let swell = 0;
    if (!reduced) {
      const k = beat >= BURST_TWO ? 1 : beat >= BURST_ONE ? 0 : -1;
      if (k >= 0) {
        // out from her over the whole pool, fast and then slower, and sinking slowly; then home to its own place
        since = beat - BURSTS[k];
        const flown = 1 - Math.exp(-since / 0.75);
        const settled = Math.min(1, since / 3);
        q[0] = lerp(f.from[k][0], f.to[k][0], flown) + (p[0] - f.place[0]) * settled;
        q[1] = lerp(f.from[k][1], f.to[k][1], flown) + 1.5 * Math.sin(Math.PI * Math.min(1, since / 2.5)) - Math.min(2.5, 0.09 * Math.max(0, since - 2.5)) + (p[1] - f.place[1]) * settled;
        q[2] = lerp(f.from[k][2], f.to[k][2], flown) + (p[2] - f.place[2]) * settled;
        const bursting = 1 - smooth((since - 8) / 16);
        for (let n = 0; n < 3; n++) p[n] = lerp(p[n], q[n], bursting);
        swell = Math.exp(-since / 3);
      }
      for (const puff of PUFFS) if (beat >= puff) swell = Math.max(swell, 0.6 * Math.exp(-(beat - puff) / 3));
      const gathered = gatherAt(beat);
      if (gathered > 0) {
        swarm(f, beat, q);
        for (let n = 0; n < 3; n++) p[n] = lerp(p[n], q[n], gathered);
      }
    }
    // up out of the reed, the first time it comes out
    const risen = smooth((beat - f.first) / f.rise);
    out.x = lerp(f.home[0], p[0], risen);
    out.y = lerp(f.home[1], p[1], risen) + 1.2 * Math.sin(Math.PI * risen);
    out.z = lerp(f.home[2], p[2], risen);
    const shown = clamp01((outAt(beat) * 1.06 - f.rank) / 0.06) * Math.min(1, risen * 4);
    out.level = shown * (0.62 + 0.38 * Math.sin(beat * f.twinkle + f.round * 5));
    const loud = beat >= BURST_TWO && beat < END ? 1.25 : 1; // the last chorus: the biggest
    const fresh = 1 + 1.2 * (1 - risen); // bigger as it lifts out of the reed, so the eye finds it
    out.size = f.size * fresh * (reduced ? 1 : (1 + 0.35 * pulseAt(beat) * energy) * (1 + 0.9 * swell) * loud);
    const festive = since >= 0 ? 0.3 + 0.7 * Math.exp(-since / 10) : 0;
    out.r = lerp(f.warm[0], f.party[0], festive);
    out.g = lerp(f.warm[1], f.party[1], festive);
    out.b = lerp(f.warm[2], f.party[2], festive);
    return out;
  }
  return { count, at };
}

// ---------------------------------------------------------------------------------------------
// The firefly fireworks (the owner's yes of 2026-11-19: "firefly fireworks at the end").
//
// On each of the band's five last hits a clump of fireflies bursts into a flower over the group that sings that hit, in the
// group's own colour; and on the very last hit of the set a big gold willow opens over the pool, hangs and falls. They are
// fireflies: points of the show's one draw call of lights (engine/show/lights.js), FIREWORK.budget of them at most, no sound of
// their own (the band's hits are the bangs).
//
// The camera is close on a group at each of the five hits and stays one beat (kafli5-video.js CAMERA), so a flower stands where
// that shot sees it: in the upper half of the shot's own picture, as far from the camera as what the shot looks at (the group),
// its size a share of the picture's there. So a shot aimed again moves its flower with it. The willow stands the same way in
// the shot that holds the last hit and its ring. Each is a pure function of the dance beat: a held game finds it as it is.

/** Each group's colour, low to high: its firework's (the willow is gold, the chapter's glow). */
export const GROUP_COLOURS = { grazers: '#ff7a2a', turtles: '#9df04a', frogs: '#3fe0d0', lizards: '#ff5c96', flyers: '#9a7cff' };
export const FIREWORK = {
  budget: 400, // points, all the fireworks together
  // a flower: its rays (each a spark and the points of its tail, on the way it flew) and the flash in its middle, the beats it
  // lives, how fast it opens (beats to 63 %), where in its shot's picture its middle stands (`up`: a share of half the picture's
  // height over its middle) and how big it is there (`radius`: the same share), how much thinner it is along the camera's way
  // (it faces the camera: none of it sinks into the hill behind the group), how far it sinks in its life (radii), and its
  // sparks' size (radii)
  flower: { rays: 23, tail: 1, life: 5, hold: 0.45, open: 0.2, up: 0.42, radius: 0.55, flat: 0.5, sink: 1.1, size: 0.2 },
  // the willow: its arms and the points of each arm's tail (they hang on the way the arm flew, back to `trail` of its age), the
  // beats it lives (gone as the show ends), how fast its arms fly out, where it stands in its shot (m ahead of the camera; `up`
  // as a flower's), how far its arms reach out and up (m), how far they fall in its life (m), its sparks' size (m), and its gold
  willow: { arms: 32, tail: 4, trail: 0.65, life: 4.8, hold: 0.6, open: 0.5, ahead: 23, up: 0.42, reach: 11, rise: 6, fall: 9, size: 1, colour: '#ffae28' },
};
const AUTHORED_ASPECT = 16 / 10; // the shape the shots are written for (engine/camera/director.js)
const shotAt = setBeat => SHOTS[CAMERA.findLast(cut => cut.beat <= setBeat)?.cut] ?? null;
/**
 * A place in a shot's picture: `ahead` m from the camera along its way, `across` and `up` shares of half the picture's width and
 * height there (16:10; a screen held upright sees as wide and more over and under). Returns { at: [x, y, z], half: half the
 * picture's height there (m), right, top, toward: the camera's own axes }.
 */
export function inShot(shot, ahead, across = 0, up = 0) {
  const [p, t] = [shot.position, shot.target];
  const way = [t[0] - p[0], t[1] - p[1], t[2] - p[2]];
  const length = Math.hypot(...way);
  const f = way.map(v => v / length);
  const flat = Math.hypot(f[0], f[2]) || 1;
  const right = [-f[2] / flat, 0, f[0] / flat];
  const top = [right[1] * f[2] - right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1] - right[1] * f[0]];
  const half = ahead * Math.tan((shot.fov * Math.PI) / 360);
  const at = [0, 1, 2].map(n => p[n] + f[n] * ahead + right[n] * across * half * AUTHORED_ASPECT + top[n] * up * half);
  return { at, half, right, top, toward: f.map(v => -v) };
}
/**
 * Every firework of the set, at its dance beat: { beat, kind ('flower' or 'willow'), group (a flower's), colour ([r, g, b] as the
 * screen shows it), at: [x, y, z], radius (m), size (m: a spark's), points, axes (the camera's right, top and toward of the shot
 * it is seen in), seed }. The five flowers are the end's five hits (her horn's five notes there), each the group's that the set
 * has singing on that hit, and on the last of the five, where all five sing, the one group not yet heard.
 */
export const FIREWORKS = (() => {
  const out = [];
  const hits = heard(cues('horn').filter(horn => sectionAt(horn.beat)?.id === 'end')).slice(0, GROUPS.length);
  const sung = [];
  hits.forEach((hit, k) => {
    const calls = cues('call').filter(call => call.beat === hit.setBeat).map(call => call.group);
    const group = calls.find(name => !sung.includes(name)) ?? GROUPS.find(name => !sung.includes(name));
    sung.push(group);
    const shot = shotAt(hit.setBeat);
    if (!shot) return;
    const far = Math.hypot(...shot.target.map((v, n) => v - shot.position[n]));
    const { at, half, right, top, toward } = inShot(shot, far, 0, FIREWORK.flower.up);
    const radius = FIREWORK.flower.radius * half;
    out.push({ beat: hit.beat, kind: 'flower', group, colour: srgb(GROUP_COLOURS[group]), at, radius, size: FIREWORK.flower.size * radius, points: 1 + FIREWORK.flower.rays * (FIREWORK.flower.tail + 1), axes: [right, top, toward], seed: 3000 + 97 * k });
  });
  const last = shotAt(SET.endBeat);
  if (last) {
    const { at, right, top, toward } = inShot(last, FIREWORK.willow.ahead, 0, FIREWORK.willow.up);
    out.push({ beat: END, kind: 'willow', group: null, colour: srgb(FIREWORK.willow.colour), at, radius: FIREWORK.willow.reach, size: FIREWORK.willow.size, points: FIREWORK.willow.arms * (FIREWORK.willow.tail + 1), axes: [right, top, toward], seed: 4000 });
  }
  return out;
})();
const WHITE = [1, 0.97, 0.88];
/**
 * Point `j` of `firework`, `age` beats after it: false (not there), or `out` = { x, y, z, size (m), level (0 to 1), r, g, b }.
 *
 * A flower: point 0 is the flash in its middle, gone in a third of a beat; the rest are its rays, each a spark that flies out of
 * the middle to its place in a round flower in a fifth of a second with a smaller point after it, hangs there twinkling and
 * sinks slowly as it fades. The willow: its arms fly out and up of its middle like an umbrella, slow down and fall, and each
 * leaves a tail of points hanging on the way it came. With less motion (`reduced`) nothing flies: a firework fades in whole
 * where it would stand open, half the size, and fades out.
 */
export function sparkAt(firework, j, age, out, { reduced = false } = {}) {
  const willow = firework.kind === 'willow';
  const spec = willow ? FIREWORK.willow : FIREWORK.flower;
  if (age < 0 || age >= spec.life || j < 0 || j >= firework.points) return false;
  const [right, top, toward] = firework.axes;
  const fade = 1 - smooth((age - spec.life * spec.hold) / (spec.life * (1 - spec.hold)));
  let [a, u, d] = [0, 0, 0]; // across, up and toward the camera, m from its middle
  let [size, level, pale] = [firework.size, fade, 0];
  if (!willow && j === 0) {
    if (reduced || age >= 0.35) return false;
    size = firework.radius * (0.5 + age / 0.35);
    level = 0.5 * (1 - age / 0.35) ** 2;
    pale = 0.4;
  } else {
    const n = willow ? j : j - 1;
    const ray = Math.floor(n / (spec.tail + 1));
    const link = n % (spec.tail + 1); // 0: the spark itself; then its tail
    const h = k => hash(firework.seed + ray, k);
    const twinkle = 0.74 + 0.26 * Math.sin(age * (3 + 5 * h(3)) + TAU * h(4));
    if (willow) {
      const [turn, tilt] = [TAU * (ray + 0.6 * h(1)) / spec.arms, (0.22 + 0.67 * ((ray * 0.61803398875) % 1)) * (Math.PI / 2)];
      // a tail's point hangs where the arm was earlier on its way
      const then = (reduced ? spec.life * 0.5 : age) * (1 - (spec.trail * link) / spec.tail);
      const flown = 1 - Math.exp(-then / spec.open);
      const far = (0.6 + 0.4 * h(2)) * flown;
      a = Math.cos(turn) * Math.cos(tilt) * firework.radius * far;
      d = Math.sin(turn) * Math.cos(tilt) * firework.radius * far * FIREWORK.flower.flat;
      u = Math.sin(tilt) * spec.rise * far - spec.fall * (then / spec.life) ** 2;
      size *= (1 - 0.14 * link) * (1 + 0.5 * Math.exp(-age / 0.3));
      level *= (1 - 0.17 * link) * twinkle;
      pale = link ? 0 : 0.08;
    } else {
      const [z, turn] = [1 - (2 * (ray + 0.5)) / spec.rays, TAU * ray * 0.61803398875 + 0.5 * h(2)]; // evenly over a ball
      const ring = Math.sqrt(Math.max(0, 1 - z * z));
      const flown = reduced ? 1 : 1 - Math.exp(-age / spec.open);
      const far = firework.radius * (0.8 + 0.2 * h(5)) * flown * (link ? 0.7 : 1);
      a = ring * Math.cos(turn) * far;
      u = ring * Math.sin(turn) * far - (reduced ? 0 : spec.sink * firework.radius * (age / spec.life) ** 2);
      d = z * far * spec.flat;
      size *= (link ? 0.6 : 1) * (0.85 + 0.3 * h(6)) * (1 + 0.8 * Math.exp(-age / 0.3));
      level *= (link ? 0.75 : 1) * twinkle;
    }
  }
  if (reduced) { size *= 0.5; level = Math.min(fade, clamp01(age / 0.5)) * 0.8; }
  out.x = firework.at[0] + right[0] * a + top[0] * u + toward[0] * d;
  out.y = firework.at[1] + right[1] * a + top[1] * u + toward[1] * d;
  out.z = firework.at[2] + right[2] * a + top[2] * u + toward[2] * d;
  out.size = size;
  out.level = clamp01(level);
  out.r = lerp(firework.colour[0], WHITE[0], pale);
  out.g = lerp(firework.colour[1], WHITE[1], pale);
  out.b = lerp(firework.colour[2], WHITE[2], pale);
  return out;
}
