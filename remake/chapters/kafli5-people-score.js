// The people's score in the music video (chapter 5, scene 6): what Egill, Mosi, Flugeðla and Slóeðla each do at every beat of
// DJ Flugeðla's set, as plain numbers (metres, degrees, 0..1). Everything here is a pure function of the video's clock
// (kafli5-video.js: { beat, setBeat }): no timers, no state, nothing of three.js. kafli5-people.js lays the numbers on the actors
// and kafli5-sloedla.js on her; tests/kafli5-people.test.mjs holds them.
//
// Two beats are read. The DANCE beat (`beat`) times everything that goes round (a bounce, a sway, a wing beat, a clip): it is
// spooled back in the rewind and stands still in Stoppdans, so the picture does too. The SCORE beat places a move in the song (a
// jump on "Nú!", hands up on "Hendur upp, Egill!"): it is the set's own beat wherever the two agree, and from the drop's second
// coming to "Dansa!" it is the dance beat and the 12 beats the rewind took, so a move written at the set's beat 340 is danced at the
// set's beat 340. In the rewind it runs back from 304 to 296 with the dance beat, and the first drop's moves spool back.
//
// Places are the pool's (kafli5-pool.js): [x, z] in metres, headings in degrees (0 faces +X, 90 faces +Z), heights over the water.
import { SONG } from './kafli5-set.js';
import { BENDS } from './kafli5-video.js';
import { CHOIR, SPOTS, WADE, around, headingTo } from './kafli5-pool.js';
import { FAR_POOL } from './kafli4-route.js';

const SET = SONG.set;
/** Seconds a beat (125 beats a minute: 0.48 s). */
export const BEAT = 60 / SONG.bpm;
const LOST = BENDS.rewind.to - BENDS.rewind.from + BENDS.rewind.back; // 12: the beats the rewind takes out of the dance
const LEVEL = FAR_POOL.level;
const TAU = Math.PI * 2;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = x => { const k = clamp(x); return k * k * (3 - 2 * k); };
const frac = x => x - Math.floor(x);
const wrap = a => ((((a + 180) % 360) + 360) % 360) - 180;
/** 0 before `from`, 1 after `to`, eased between. */
const ramp = (b, from, to) => smooth((b - from) / (to - from));
/** 1 from `from` to `to`, rising over the `rise` beats after `from` and falling over the `fall` beats before `to`. */
const span = (b, from, to, rise = 1, fall = rise) => (b <= from || b >= to ? 0 : ramp(b, from, from + rise) * (1 - ramp(b, to - fall, to)));
/** 0 at `from`, 1 at `peak`, 0 at `to`, eased. */
const hump = (b, from, peak, to) => (b <= from || b >= to ? 0 : b < peak ? smooth((b - from) / (peak - from)) : 1 - smooth((b - peak) / (to - peak)));
/** A throw's arc: 0 on the ground at `from` and `to`, 1 at the top between. */
const arc = (b, from, to) => { const u = (b - from) / (to - from); return u <= 0 || u >= 1 ? 0 : 4 * u * (1 - u); };
/** `keys` ([beat, value], rising beats) read at `b`, eased from each key to the next. */
function keyed(keys, b) {
  if (b <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (b < keys[i][0]) return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * smooth((b - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
  }
  return keys.at(-1)[1];
}
const cues = kind => SET.cues.filter(event => event.kind === kind).map(event => event.beat);
const part = id => { const s = SET.sections.find(section => section.id === id); return { from: s.startBeat, to: s.startBeat + s.beats }; };
const line = id => SET.lines.find(entry => entry.id === id).beat;

/** The score beat of the video's clock (see the top of the file). */
export function scoreBeat({ beat, setBeat = beat }) {
  return setBeat >= BENDS.rewind.to && setBeat < BENDS.freeze.to ? beat + LOST : beat;
}
/** The clock at the set's beat `setBeat`, as kafli5.js gives it (for tests and tools). */
export function clockAt(setBeat) {
  const { rewind, freeze } = BENDS;
  let beat = setBeat;
  if (setBeat >= rewind.from && setBeat < rewind.to) beat = rewind.from - ((setBeat - rewind.from) / (rewind.to - rewind.from)) * rewind.back;
  else if (setBeat >= rewind.to && setBeat < freeze.from) beat = setBeat - LOST;
  else if (setBeat >= freeze.from && setBeat < freeze.to) beat = freeze.from - LOST;
  return { beat, setBeat };
}

// ---------------------------------------------------------------------------------------------
// The song's moments, by score beat.

const P = Object.fromEntries(SET.sections.map(section => [section.id, part(section.id)]));
const END = SET.endBeat; // 472: the last hit
/** The beats everyone jumps on: the dance floor opens, the drop and its second coming, the anthem, "Dansa!", the last chorus, the last hit. */
export const JUMPS = [P.groove.from, P.drop.from, P.redrop.from, P.anthem.from, P.carnival.from, P.lastchorus.from, END];
const HOPP = [line('hopp'), line('hopp-2')]; // "Hopp!" in the carnival
const ROARS = cues('roar'); // the forest answers
const HORNS = cues('horn');
const CLAPS = cues('clap');
const WINGS = cues('wings');
const HITS = HORNS.filter(beat => beat >= P.end.from); // the band's last stabs (her horn on each): 460 to 464
/** The silences everyone bends down in before a jump: [from, the jump]. */
const HUSH = [[62, P.groove.from], [294.5, P.drop.from], [306.5, P.redrop.from], [426.6, P.lastchorus.from]];

/** How hard the party is, 0 (standing) to 1.3, at score beat `b`: the same from the drop to Stoppdans, so the rewind's seam does not show. */
const ENERGY = [
  [0, 0], [4, 0.3], [16, 0.35], [32, 0.5], [48, 0.55], [60, 0.85], [62, 0.1], [63.7, 0.1], [64.3, 1], [94, 1], [98, 0.7], [126, 0.7],
  [130, 0.6], [228, 0.6], [234, 0.06], [262, 0.06], [268, 0.5], [286, 0.7], [294, 0.85], [295, 0.3], [296.3, 1.2], [362, 1.2], [372, 1.2],
  [402, 1.2], [405, 0.5], [419, 0.6], [420.6, 0.06], [427, 0.06], [428.3, 1.3], [458, 1.3], [460, 0.7], [471, 0.6], [472.3, 1], [474, 0.4],
  [476.5, 0],
];
export const energy = b => keyed(ENERGY, b);
/** How far everyone is bent down, 0..1 (the hush before a jump), let go over the `release` beats after the jump's own. */
const hush = (b, release = 0.4) => Math.max(...HUSH.map(([from, to]) => span(b, from, to + release, 0.8, release)));
/** 1 while the people stand (the set's start and its end): everything of theirs is given back as it was found. */
const there = b => ramp(b, 0, 3) * (1 - ramp(b, END + 2.5, END + 4.6));

// Where things are, for a look: [x, y, z].
const up = ([x, z], over) => [x, LEVEL + over, z];
const SPOT = [-13.8, 2.4]; // the place over the pool Flugeðla shoots up from on the drop, from the pool's middle (east, south)
const fromMiddle = ([x, z]) => [FAR_POOL.center[0] + x, FAR_POOL.center[1] + z];
const LOOKS = {
  her: up(WADE.at, 2.4),
  flugedla: up(FAR_POOL.landing, 2.2),
  egill: up(SPOTS.egill, 0.9),
  mosi: up(SPOTS.mosi, 2.6),
  pool: up(FAR_POOL.center, 1),
  child: up(around(47.5, 14), 1.1), // out over the water in front of Egill: where his close shot stands
  sky: up(fromMiddle(SPOT), 9),
  grazers: up(CHOIR.grazers.at, 2), turtles: up(CHOIR.turtles.at, 1.7), frogs: up(CHOIR.frogs.at, 0.5), lizards: up(CHOIR.lizards.at, 0.8),
  flyers: up(CHOIR.flyers.at, 1.2), beetles: up(around(173, 29.6), 0.8), over: up(FAR_POOL.center, 7),
};
const GROUP_PARTS = ['grazers', 'turtles', 'frogs', 'lizards', 'flyers', 'beetles'].map(id => [P[id].from, id === 'flyers' ? 'over' : id]);
/** A look: [score beat, whom] keys; the point looked at goes from one to the next over `turn` beats. */
function lookAt(keys, b, turn = 1.5) {
  let i = keys.findLastIndex(([beat]) => beat <= b);
  if (i < 0) i = 0;
  const to = LOOKS[keys[i][1]];
  if (i === 0) return [...to];
  const from = LOOKS[keys[i - 1][1]];
  const k = ramp(b, keys[i][0], keys[i][0] + turn);
  return from.map((v, n) => v + (to[n] - v) * k);
}

// ---------------------------------------------------------------------------------------------
// Egill: a happy six-year-old. He bounces on every beat (in the air between two beats, down on the beat), twists and pumps his arms,
// and jumps with his hop clip where the song jumps; his hands go up, clap or cup his mouth where Flugeðla asks.

/** His hop clip (egill.glb, 1.15 s): he leaves the ground `off` s into it and is down `down` s into it. */
export const HOP = { seconds: 1.15, off: 0.42, down: 0.94, rate: 0.85 };
const HOP_AIR = (HOP.down - HOP.off) / (BEAT * HOP.rate); // beats in the air
const phraseHops = (from, to) => { const out = []; for (let b = from + 6.75; b < to; b += 8) out.push(b); return out; };
const FROZEN = 0.55; // beats into a jump "Stopp!" catches him
/** His jumps: [the beat he leaves the ground, metres over the clip's own 0.29 m, beats of bending down first]. */
export const EGILL_JUMPS = [
  [33.5, 0.08, 1], // "Egill! Ertu tilbúinn?"
  ...phraseHops(P.groove.from, P.groove.to).map(b => [b, 0.05, 1]),
  [P.groove.from, 0.18, 1.8], [P.drop.from, 0.3, 1.5], [P.redrop.from, 0.3, 1.5], [P.anthem.from, 0.2, 1],
  ...phraseHops(P.anthem.from, P.anthem.to).map(b => [b, 0.05, 1]),
  [BENDS.freeze.from - FROZEN, 0.2, 1], // in the air when "Stopp!" comes
  [BENDS.freeze.to - FROZEN, 0.2, 1], // and on "Dansa!" he comes down out of that very jump
  [378.75, 0.05, 1], [384.75, 0.05, 1], ...HOPP.map(b => [b, 0.15, 1]),
  [412, 0.12, 1], [416, 0.25, 1], // the forest answers him
  [P.lastchorus.from, 0.3, 1.4], ...phraseHops(P.lastchorus.from, P.lastchorus.to).map(b => [b, 0.08, 1]),
  [END, 0.3, 1.2],
];
const EGILL_LOOK = [
  [0, 'her'], [16, 'flugedla'], [24, 'pool'], [32, 'flugedla'], [36.5, 'pool'], [96, 'her'], ...GROUP_PARTS, [224, 'her'], [264, 'flugedla'],
  [266.5, 'child'], [294.5, 'sky'], [301, 'pool'], [306.5, 'sky'], [313, 'pool'], [324, 'her'], [340, 'pool'], [404, 'flugedla'], [406, 'child'],
  [413.6, 'flugedla'], [414.8, 'child'], [424.5, 'flugedla'], [427, 'pool'], [434, 'her'], [438, 'pool'], [465, 'flugedla'], [471, 'pool'],
];
/** The two gaps the child shouts "Já!" in, by score beat: Egill cups his hands at his mouth and leans into it. */
export const SHOUTS = [[406.4, 409.6, 0.8], [414.6, 416, 1]];

/**
 * Egill at the clock: {
 *   lift (m off the ground), yaw, roll, lean (degrees: a twist, a lean to his right, a lean forward),
 *   hop: { weight, time } (his hop clip, s into it), wave: { weight, time } (his wave clip),
 *   arms: { right: { up, pump, clap, open, cup }, left: {...} } (0..1: how far each hand is on its way to that pose),
 *   look: [x, y, z], looking (0..1), spin (degrees turned round on the spot), clock (s: his idle clip's time)
 * }
 */
export function egillAt(clock, { reduced = false } = {}) {
  const b = scoreBeat(clock);
  const d = clock.beat;
  const on = there(b);
  const e = energy(b) * on;
  const out = {
    lift: 0, yaw: 0, roll: 0, lean: 0, hop: { weight: 0, time: 0 }, wave: { weight: 0, time: frac((d * BEAT) / 2.4) * 2.4 },
    arms: { right: { up: 0, pump: 0, clap: 0, open: 0, cup: 0 }, left: { up: 0, pump: 0, clap: 0, open: 0, cup: 0 } },
    look: lookAt(EGILL_LOOK, b), looking: 0.85 * on, spin: 0, clock: d * BEAT,
  };
  const side = Math.sin(Math.PI * d); // right on one beat, left on the next
  if (reduced) {
    out.roll = 2.5 * e * Math.sin((TAU * d) / 4);
    out.arms.right.up = out.arms.left.up = 0.7 * span(b, 266.5, 294, 1.5);
    return out;
  }
  // the jump that is on now: the one furthest into its clip's weight
  let jump = null;
  for (const [at, more, lead] of EGILL_JUMPS) {
    const end = at + (HOP.seconds - HOP.off) / (BEAT * HOP.rate);
    const weight = span(b, at - lead, end, 0.3, 0.3);
    if (weight > (jump?.weight ?? 0)) jump = { at, more, lead, weight };
  }
  if (jump) {
    const { at, more, lead, weight } = jump;
    out.hop.weight = weight * on;
    out.hop.time = b < at ? HOP.off * clamp(1 - (at - b) / lead) : Math.min(HOP.seconds, HOP.off + (b - at) * BEAT * HOP.rate);
    out.lift += more * arc(b, at, at + HOP_AIR) * on;
  }
  const free = 1 - out.hop.weight; // how much of him the bounce has
  const quiet = hush(b);
  // the bounce: up between two beats, down on the beat; a twist and a lean with it
  out.lift += 0.075 * e * free * (1 - quiet) * arc(frac(d), 0.1, 0.9);
  out.yaw = 15 * e * free * side;
  out.roll = 5 * e * side + 2 * (1 - clamp(e * 3)) * on * Math.sin((TAU * d) / 8);
  // his arms pump, one up as the other comes down
  const pump = clamp(e * 0.9) * free * (1 - quiet);
  out.arms.right.pump = pump * (0.5 + 0.5 * side);
  out.arms.left.pump = pump * (0.5 - 0.5 * side);
  // "Egill! Ertu tilbúinn?": he waves at her
  out.wave.weight = (span(b, 35.2, 40.5, 0.6) + span(b, 465.5, 471.2, 0.7)) * free;
  // "Klappið með!": hands apart in front, together on every clap of the band
  const clapping = span(b, 41, 62, 1, 0.5) + 0.85 * span(b, 376, 402.5, 1);
  const clap = Math.max(...CLAPS.map(at => hump(b, at - 0.4, at, at + 0.35)));
  for (const arm of [out.arms.right, out.arms.left]) {
    arm.clap = clapping * clap * free;
    arm.open = clapping * (1 - clap) * free;
    arm.pump *= 1 - clapping;
  }
  // "Hendur upp, Egill!": up, and they stay up through the build, swaying; down as he bends for the drop
  const handsUp = span(b, 266.2, 294.6, 1, 0.8) + span(b, 417.6, 424.5, 0.8, 1) + Math.max(...HITS.map(at => hump(b, at - 0.2, at + 0.15, at + 0.9)));
  // a spin on the spot, a bar into every other phrase of the big parts
  const spins = [332, 348, 380, 396, 436, 452];
  out.spin = 360 * spins.reduce((sum, at) => sum + ramp(b, at, at + 2), 0);
  // "Egill, segðu já!": hands at his mouth, leaning into the shout
  let cup = 0;
  for (const [from, to, size] of SHOUTS) cup = Math.max(cup, size * span(b, from, to, 0.7, 0.4));
  out.lean = 14 * cup + 8 * quiet * free * (1 - cup);
  for (const arm of [out.arms.right, out.arms.left]) {
    arm.up = clamp(handsUp) * free * (1 - cup);
    arm.cup = cup;
    arm.pump *= (1 - clamp(handsUp)) * (1 - cup);
    arm.clap *= 1 - cup;
    arm.open *= 1 - cup;
  }
  // with his hands up he sways them from side to side
  out.roll += 4 * clamp(handsUp) * Math.sin((TAU * d) / 2);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Mosi: the size of a small house, and he dances anyway. A heavy sway from his right feet to his left over a bar, the light side's
// feet coming off the ground; his head nods down on the backbeat; he stomps a forefoot with the grazers; and on the jumps he rears a
// little and comes down with a thud.

const MOSI_LOOK = [
  [0, 'her'], [32, 'egill'], [40, 'pool'], [96, 'her'], ...GROUP_PARTS, [224, 'her'], [264, 'egill'], [272, 'pool'], [293, 'sky'], [301, 'pool'],
  [305, 'sky'], [313, 'pool'], [324, 'her'], [372, 'pool'], [404, 'egill'], [420, 'pool'], [434, 'her'], [465, 'flugedla'], [471, 'her'],
];
/** His stomps with the grazers: every other beat of their part, a forefoot at a time. */
export const STOMPS = Array.from({ length: 8 }, (_, k) => P.grazers.from + 2 * k);
const MOSI_REARS = [...JUMPS, ...HOPP, 412, 416];

/**
 * Mosi at the clock: {
 *   side (m to his right), lift (m), yaw, roll (degrees, to his right), rear (degrees, his front up about his hind feet),
 *   nod (degrees, down negative), feet: { fl, fr, bl, br } (m off the ground), tail (degrees, to his right),
 *   look: [x, y, z], looking, clock (s: his idle clip's time)
 * }
 */
export function mosiAt(clock, { reduced = false } = {}) {
  const b = scoreBeat(clock);
  const d = clock.beat;
  const on = there(b);
  const e = Math.min(1.1, energy(b)) * on;
  const sway = Math.sin((TAU * d) / 4); // to his right on the bar's second beat, to his left on its fourth
  const out = {
    side: 0, lift: 0, yaw: 0, roll: 0, rear: 0, nod: 0, feet: { fl: 0, fr: 0, bl: 0, br: 0 }, tail: 0,
    look: lookAt(MOSI_LOOK, b, 3), looking: 0.6 * on, clock: d * BEAT,
  };
  if (reduced) {
    out.roll = 1.2 * e * sway;
    out.nod = -2 * e * (0.5 + 0.5 * Math.cos(Math.PI * (d - 1)));
    return out;
  }
  const stomping = span(b, P.grazers.from - 1.5, P.grazers.to, 1);
  const k = e * (1 - 0.6 * stomping);
  out.roll = 3.2 * k * sway;
  out.side = 0.22 * k * sway;
  out.yaw = 2.5 * k * Math.sin((TAU * (d - 0.5)) / 4);
  const light = 0.16 * k;
  out.feet.fl = out.feet.bl = light * smooth(Math.max(0, sway) * 1.3);
  out.feet.fr = out.feet.br = light * smooth(Math.max(0, -sway) * 1.3);
  out.tail = -14 * k * Math.sin((TAU * (d - 0.7)) / 4) + 5 * e * Math.sin(Math.PI * d);
  // the nod: down on the backbeat, a small one on every beat
  out.nod = -e * (12 * (0.5 + 0.5 * Math.cos(Math.PI * (d - 1))) ** 2 + 3 * (0.5 + 0.5 * Math.cos(TAU * d)));
  // the stomps: a forefoot up slowly, and down hard on the beat; his shoulders dip as it lands
  STOMPS.forEach((at, n) => {
    const foot = n % 2 ? 'fl' : 'fr';
    out.feet[foot] += 0.5 * on * hump(b, at - 1.4, at - 0.3, at);
    out.lift -= 0.05 * on * hump(b, at - 0.05, at + 0.12, at + 0.8);
    out.nod -= 5 * on * hump(b, at - 0.05, at + 0.15, at + 0.9);
    out.roll += (n % 2 ? -1 : 1) * 1.5 * on * hump(b, at - 1.4, at - 0.3, at + 0.3);
  });
  // the rears: his front comes up as the others jump, and down with a thud
  let rear = 0;
  let thud = 0;
  for (const at of MOSI_REARS) {
    rear = Math.max(rear, hump(b, at - 0.4, at + 0.9, at + 2));
    thud = Math.max(thud, hump(b, at + 1.9, at + 2.1, at + 3));
  }
  out.rear = 8 * rear * on;
  out.feet.fl += 0.25 * rear * on;
  out.feet.fr += 0.12 * rear * on;
  out.lift -= 0.06 * thud * on;
  out.nod += 6 * rear * on - 5 * thud * on;
  // the hush before a jump: he bends his head low
  const quiet = hush(b);
  out.nod -= 9 * quiet * on;
  out.lift -= 0.05 * quiet * on;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Flugeðla: the DJ. She stands in the shallows facing her dance floor, bobs, beats the time on the water with her wings, spreads
// them for her welcome, holds them up through the build, bows at the end, and flies: a round over the pool for her welcome, straight
// up out of the pool on "Nú!", and up again, spinning, when the drop comes back.

/** Where she stands ([x, z]) and the way she faces while she plays: across the pool, to everyone. */
export const DECKS = { at: [...FAR_POOL.landing], heading: 240, home: FAR_POOL.facing };
const HOME = [FAR_POOL.landing[0] - FAR_POOL.center[0], FAR_POOL.landing[1] - FAR_POOL.center[1]];
const GROUND = -0.65; // her feet under the water where she stands (kafli4-route.js: in 0.65 m of water)
const SKIM = -1.3; // the path's height when her body skims 1.3 m over the water (her body flies 2.6 m over the path)
// The climb out of the pool, as a flight's keys: she comes in low from the east, goes up drifting on west (so the way she faces
// holds), tips over the top `top` m up, dives over the frogs' side of the pool and pulls out north of Slóeðla, back east.
const rocket = (t, top) => [
  [t - 4.6, 1, 9.5, -0.6], [t - 2.4, -8.5, 5, SKIM], [t, ...SPOT, SKIM + 0.1], [t + 1.1, -14.6, 2.0, 3.2], [t + 2.4, -15.5, 1.5, 0.8 * top],
  [t + 3.5, -16.8, 0.8, top], [t + 4.5, -19, -0.6, 0.76 * top], [t + 5.6, -20, -5.5, 4], [t + 6.8, -14, -11, 3.6], [t + 8, -4, -10.5, 4],
  [t + 9.6, 9, -5, 4.5],
];
/**
 * Her flights. `keys`: [score beat, east, south (m from the pool's middle), m over the water], flown through with the speed each
 * key's neighbours give it, at rest at the first and the last. `from` and `to`: the beats the flight has her (from her bending
 * down to her wings folded again; its keys may start before or end after, for the speed she passes at). `off`: her feet leave the
 * ground; `down`: they are back (null: the flight begins or ends in the air). `spin`: the beats she turns once about herself in.
 */
export const FLIGHTS = [
  { // the welcome: a round over the pool, out over the grazers and the turtles, round over Slóeðla, back past the north shallows
    from: 22.6, to: 36.4, off: 24, down: 32.6, spin: null,
    keys: [
      [23.8, ...HOME, GROUND], [24.8, 8.6, 15.6, 1], [26, 0.5, 8, 2.4], [27.4, -9.5, 3, 3], [28.5, -12.5, -5, 3.8], [29.6, -3, -10.5, 3.2],
      [30.6, 9, -5.5, 3.8], [31.5, 18, 6, 3.4], [32.2, 16.5, 16.5, 1.4], [33, ...HOME, GROUND],
    ],
  },
  { // out to the middle through the countdown, low over the water, and straight up on "Nú!"
    from: 287.2, to: P.rewind.from, off: 288.6, down: null, spin: null,
    keys: [[288, ...HOME, GROUND], [289.4, 8.4, 15.8, 0.6], ...rocket(P.drop.from, 11.2)],
  },
  { // the drop again: up out of the pool once more, spinning, a round over the choir and home
    from: P.redrop.from, to: 326.2, off: null, down: 322.4, spin: [P.redrop.from + 0.6, P.redrop.from + 3.2],
    // (lower: this one is seen from the middle of the pool, set_water_low, with less sky over her)
    keys: [...rocket(P.redrop.from, 7), [319.4, 19, 6, 3.4], [321.2, 16.5, 16.5, 1.4], [322.8, ...HOME, GROUND]],
  },
];
/** Her take-off and landing clips (pteranodon.glb): where in each her feet leave or meet the ground, and how fast they are played. */
export const WING_CLIPS = { takeOff: { seconds: 3.2, off: 0.75, rate: 1.4 }, land: { seconds: 3.0, down: 1.95, rate: 1.25 }, fly: { seconds: 1.4, beats: 3 }, happy: { seconds: 2.4, beats: 4 } };
const BOW_TURN = 30; // degrees she turns aside as she bows
const WING_SLAP = 46; // degrees down from her spread pose: her wing tips on the water where she stands
const FLUGEDLA_LOOK = [
  [0, 'pool'], [32, 'egill'], [38, 'pool'], [226, 'her'], [262, 'pool'], [265.5, 'egill'], [268, 'pool'], [404, 'egill'], [409, 'pool'],
  [413.6, 'egill'], [416, 'pool'],
];

/** A flight's place at score beat `b`: [east, south, over the water], a Hermite curve through its keys in time. */
function flightPoint(flight, b) {
  const keys = flight.keys;
  if (b <= keys[0][0]) return keys[0].slice(1);
  if (b >= keys.at(-1)[0]) return keys.at(-1).slice(1);
  const i = keys.findLastIndex(key => key[0] <= b);
  const speed = n => {
    if (n === 0 || n === keys.length - 1) return [0, 0, 0];
    const dt = keys[n + 1][0] - keys[n - 1][0];
    return [1, 2, 3].map(c => (keys[n + 1][c] - keys[n - 1][c]) / dt);
  };
  const [a, z] = [keys[i], keys[i + 1]];
  const h = z[0] - a[0];
  const u = (b - a[0]) / h;
  const [va, vz] = [speed(i), speed(i + 1)];
  const [u2, u3] = [u * u, u * u * u];
  return [1, 2, 3].map(c => (2 * u3 - 3 * u2 + 1) * a[c] + (u3 - 2 * u2 + u) * h * va[c - 1] + (-2 * u3 + 3 * u2) * z[c] + (u3 - u2) * h * vz[c - 1]);
}
const flightAt = b => FLIGHTS.find(flight => b >= flight.from && b <= flight.to) ?? null;

/**
 * Flugeðla at the clock: {
 *   at: [x, y, z] (where her feet would be were she level, the world's), heading, pitch (nose up), bank (to her right), degrees,
 *   air (0 on the ground .. 1 flying), clips: { takeOff, fly, land, happy: { weight, time } } (the rest of her is her idle clip),
 *   lift (m: her bob where she stands), spread: { left, right } (0 a wing folded as her clip has it .. 1 spread wide), raise:
 *   { left, right } (degrees each wing is lifted about its shoulder; negative: down to the water), bow (degrees her neck and body bend down),
 *   look: [x, y, z], looking, clock (s: her idle clip's time), blink (true on the beat she winks)
 * }
 */
export function flugedlaAt(clock, { reduced = false } = {}) {
  const b = scoreBeat(clock);
  const d = clock.beat;
  const on = there(b);
  const e = energy(b) * on;
  // she turns to her dance floor as the band comes in, and back as it leaves
  const heading = DECKS.home + wrap(DECKS.heading - DECKS.home) * ramp(b, 1, 9) * (1 - ramp(b, END + 0.6, END + 4.4));
  const out = {
    at: [DECKS.at[0], LEVEL + GROUND, DECKS.at[1]], heading, pitch: 0, bank: 0, air: 0,
    clips: { takeOff: { weight: 0, time: 0 }, fly: { weight: 0, time: frac(d / WING_CLIPS.fly.beats) * WING_CLIPS.fly.seconds }, land: { weight: 0, time: 0 }, happy: { weight: 0, time: frac(d / WING_CLIPS.happy.beats) * WING_CLIPS.happy.seconds } },
    lift: 0, spread: { left: 0, right: 0 }, raise: { left: 0, right: 0 }, bow: 0, look: lookAt(FLUGEDLA_LOOK, b, 2), looking: 0.7 * on, clock: d * BEAT, blink: false,
  };
  const quiet = hush(b);
  // where she stands: a bob on the beat, her happy clip a bar long under it
  const wingsUp = span(b, line('wings'), 287.4, 1.5, 1.2); // "Vængina upp!": up, and they stay up through the build
  const welcome = span(b, 13, 22.6, 1, 0.8); // her welcome: wide open
  const goodnight = span(b, line('goodnight') + 3.2, END - 0.4, 1.2, 0.8); // her bow
  const still = span(b, P.fakeend.from, 424.4, 0.5, 0.2); // the ending that is not one: she holds still
  const flick = hump(b, 424.4, 425, 426.6); // "Einu sinni enn!": a wing flicks up
  const point = Math.max(span(b, 404.4, 408.4, 0.8), span(b, 413.8, 416.4, 0.6)); // a wing out to Egill
  out.heading += BOW_TURN * goodnight; // she bows a little aside of her shot's camera: head-on a bow is only a face coming nearer
  if (reduced) {
    out.spread.left = out.spread.right = clamp(0.6 * wingsUp + 0.5 * welcome + 0.6 * goodnight);
    out.raise.left = out.raise.right = 18 * wingsUp;
    out.bow = 14 * goodnight;
    out.lift = 0.02 * e * Math.sin((TAU * d) / 2);
    return out;
  }
  const dance = e * (1 - still) * (1 - goodnight);
  out.clips.happy.weight = clamp(dance * 0.75) * (1 - wingsUp) * (1 - quiet);
  out.lift = 0.07 * dance * (0.5 - 0.5 * Math.cos(TAU * d)) - 0.12 * quiet;
  // folded where she stands (halfway open a wing hangs like washing), and wide open for each thing she does with them
  const both = welcome + wingsUp + goodnight;
  // she beats the time on the water: on each of the band's wing beats her wings open and lift, and come down flat on the water
  const beating = (1 - wingsUp) * (1 - welcome) * on;
  const open = Math.max(...WINGS.map(at => hump(b, at - 0.9, at - 0.25, at + 0.75))) * beating;
  const lifted = Math.max(...WINGS.map(at => hump(b, at - 0.9, at - 0.45, at - 0.05))) * beating;
  const slap = Math.max(...WINGS.map(at => hump(b, at - 0.4, at, at + 0.6))) * beating;
  out.spread.left = clamp(both + open + flick);
  out.spread.right = clamp(both + open + point); // the wing on Egill's side, out to him
  const beatWings = 16 * lifted - WING_SLAP * slap + 7 * dance * (1 - open) * Math.sin(Math.PI * d);
  out.raise.left = beatWings + 16 * welcome * (0.6 + 0.4 * Math.sin(Math.PI * d)) + 42 * wingsUp + 5 * wingsUp * Math.sin(TAU * d) - 22 * goodnight + 30 * flick;
  out.raise.right = beatWings + 16 * welcome * (0.6 - 0.4 * Math.sin(Math.PI * d)) + 42 * wingsUp + 5 * wingsUp * Math.sin(TAU * d) - 22 * goodnight + 8 * point;
  out.bow = 24 * goodnight * (0.75 + 0.25 * Math.sin((TAU * (b - 469)) / 4)) + 6 * quiet;
  out.blink = b >= 424.6 && b < 425.4;
  // her flights
  const flight = flightAt(b);
  if (flight) {
    const [x, z, y] = flightPoint(flight, b);
    const h = 0.12;
    const [ax, az, ay] = flightPoint(flight, b - h);
    const [bx, bz, by] = flightPoint(flight, b + h);
    const [from, to] = [flight.from, flight.keys.at(-1)[0]]; // the beats her way begins and ends on
    const run = Math.hypot(bx - ax, bz - az);
    const speed = Math.hypot(run, by - ay) / (2 * h * BEAT); // m/s
    const level = smooth(run / (2 * h * BEAT) / 5); // 0 going straight up or down: a turn is then no turn
    // in the air from her feet leaving the ground to their coming down; the way she goes is her heading once she moves
    const air = (flight.off === null ? 1 : ramp(b, flight.off - 0.2, flight.off + 1.2)) * (flight.down === null ? 1 : 1 - ramp(b, flight.down - 1.4, flight.down));
    const moving = clamp(speed / 3);
    const way = run > 1e-6 ? (Math.atan2(bz - az, bx - ax) * 180) / Math.PI : heading;
    const facing = heading + wrap(way - heading) * smooth(moving) * (flight.down === null ? 1 : 1 - ramp(b, to - 1.3, to - 0.1)) * (flight.off === null ? 1 : ramp(b, from, from + 1.2));
    // the turn's bank: how fast the way turns at this speed, against gravity
    const [cx, cz] = flightPoint(flight, b - 3 * h);
    const [ex, ez] = flightPoint(flight, b + 3 * h);
    const before = Math.atan2(az - cz, ax - cx);
    const after = Math.atan2(ez - bz, ex - bx);
    const rate = wrap(((after - before) * 180) / Math.PI) / (4 * h * BEAT); // degrees a second
    const bank = clamp((Math.atan((speed * rate * Math.PI) / 180 / 9.81) * 180) / Math.PI, -50, 50) * smooth(moving) * air * level;
    const climb = (Math.atan2(by - ay, Math.max(run, 1e-6)) * 180) / Math.PI;
    out.at = [FAR_POOL.center[0] + x, LEVEL + y, FAR_POOL.center[1] + z];
    out.heading = facing;
    out.pitch = clamp(climb * 0.9, -55, 78) * smooth(moving) * air;
    out.bank = bank + (flight.spin ? 360 * ramp(b, flight.spin[0], flight.spin[1]) : 0);
    out.air = air;
    const { takeOff, land } = WING_CLIPS;
    if (flight.off !== null) {
      out.clips.takeOff.time = clamp(takeOff.off + (b - flight.off) * BEAT * takeOff.rate, 0, takeOff.seconds);
      out.clips.takeOff.weight = span(b, flight.off - 1.3, flight.off + 2.6, 0.5, 0.9);
    }
    if (flight.down !== null) {
      out.clips.land.time = clamp(land.down + (b - flight.down) * BEAT * land.rate, 0, land.seconds);
      out.clips.land.weight = span(b, flight.down - 2.4, flight.down + 2.2, 0.9, 0.6);
    }
    out.clips.fly.weight = air * (1 - out.clips.takeOff.weight) * (1 - out.clips.land.weight);
    out.clips.happy.weight *= 1 - Math.max(air, out.clips.takeOff.weight, out.clips.land.weight);
    // her feet are hers again a beat after they come down
    const grounded = 1 - Math.max(air, out.clips.takeOff.weight, flight.down === null ? 0 : out.clips.land.weight * (1 - ramp(b, flight.down, flight.down + 1.2)));
    out.lift *= grounded;
    out.raise.left *= grounded;
    out.raise.right *= grounded;
    out.bow *= grounded;
    // she comes down with her wings spread, and they stay spread a moment
    const landed = flight.down === null ? 0 : span(b, flight.down - 0.5, flight.down + 2.8, 0.5, 0.9);
    out.spread.left = Math.max(out.spread.left * grounded, landed);
    out.spread.right = Math.max(out.spread.right * grounded, landed);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Slóeðla: the star, shy and gentle. She sways over a bar and bobs with the band, more as the set grows; turns to the group whose
// part it is, where she stands; stands tall and still for her horn; lifts her head high with everyone's jump; and between her horn's answers in
// the last chorus she dances the most she ever does. Her horn itself (her head up, her 'call' clip) is her life's (kafli5-sloedla.js).

const HER_ENERGY = [
  [0, 0], [4, 0.15], [16, 0.22], [32, 0.3], [62, 0.45], [64.5, 0.65], [94, 0.65], [98, 0.8], [126, 0.8], [130, 0.5], [226, 0.5], [231, 0],
  [263, 0], [270, 0.45], [294, 0.8], [296.5, 0.8], [322, 0.8], [326, 0.9], [362, 0.9], [372, 0.9], [402, 0.85], [406, 0.5], [419, 0.5], [421, 0.05],
  [427.5, 0.05], [429, 1], [458, 1], [460, 0.5], [472, 0.6], [476.5, 0],
];
// She faces Egill's bank where she wades, and the choir stands to her right and behind her: so in each group's part she turns to it
// where she stands, her body most of the way (the water hides her feet) and her head the rest. [score beat, degrees round from the way
// she faces]: she is back as she stood before a shot of her own holds on her (112, 224 on).
export const HER_TURNS = (() => {
  const to = at => wrap(headingTo(WADE.at, at) - WADE.heading);
  return [
    [0, 0], [16, to(FAR_POOL.landing)], [28, 0], [98, 30], [106, 0], [120, 30], [P.grazers.from - 3, to(CHOIR.grazers.at)],
    [P.turtles.from - 2, to(CHOIR.turtles.at)], [P.frogs.from - 2, to(CHOIR.frogs.at)], [P.lizards.from - 2, to(CHOIR.lizards.at)],
    [P.flyers.from - 2, to(CHOIR.frogs.at)], [P.beetles.from - 2, to(around(173, 29.6))], [217, 0], [264, to(FAR_POOL.landing)], [270, 0],
    [465, to(FAR_POOL.landing)], [470, 0],
  ];
})();
/** How far her head may turn (degrees), the share of a turn her body takes and how far it goes, and the beats a turn takes. */
export const HER_TURN = { head: 50, body: 0.7, most: 115, beats: 6 };

/**
 * Slóeðla at the clock: {
 *   lift (m), side (m to her right), yaw (degrees her body turns where she stands, as a heading turns), lean (degrees her front
 *   comes up), nod (degrees her head up), turn (degrees her head turns on from her body), tilt (degrees her head leans to her right), tail (degrees),
 *   clock (s: her resting clip's time)
 * }
 */
export function sloedlaAt(clock, { reduced = false } = {}) {
  const b = scoreBeat(clock);
  const d = clock.beat;
  const on = there(b);
  let e = keyed(HER_ENERGY, b) * on;
  // her horn: she stands and blows, and dances between the answers
  const blowing = Math.max(...HORNS.map(at => span(b, at - 1.6, at + 2.6, 1.6, 2)));
  e *= 1 - 0.8 * blowing;
  // and her head comes up with everyone's jump, big and unhurried: she all but stands as it does
  let rise = 0;
  for (const at of JUMPS) rise = Math.max(rise, hump(b, at - 0.5, at + 1.9, at + 5.5));
  e *= 1 - 0.6 * hump(rise, 0, 0.5, 1.0001);
  const i = Math.max(0, HER_TURNS.findLastIndex(([beat]) => beat <= b));
  const turnFrom = i > 0 ? HER_TURNS[i - 1][1] : 0;
  const facing = (turnFrom + (HER_TURNS[i][1] - turnFrom) * ramp(b, HER_TURNS[i][0], HER_TURNS[i][0] + HER_TURN.beats)) * on;
  const body = clamp(facing * HER_TURN.body, -HER_TURN.most, HER_TURN.most);
  const sway = Math.sin((TAU * d) / 4);
  const out = { lift: 0, side: 0, yaw: body, lean: 0, nod: 0, turn: clamp(facing - body, -HER_TURN.head, HER_TURN.head), tilt: 0, tail: 0, clock: d * BEAT };
  // the quiet part is hers: tall and still, her head high
  const tall = (span(b, 229, 264, 3, 2) + span(b, P.fakeend.from, 427, 1.5, 1.5) * 0.6) * on;
  out.lift = 0.14 * tall;
  out.nod = 7 * tall;
  if (reduced) {
    out.side = 0.08 * e * sway;
    out.tilt = 2 * e * sway;
    out.tail = -6 * e * Math.sin((TAU * (d - 0.6)) / 4);
    return out;
  }
  out.side = 0.3 * e * sway;
  out.yaw += 6 * e * Math.sin((TAU * (d - 0.5)) / 4);
  out.tilt = 7.5 * e * sway;
  out.lift += 0.1 * e * (0.5 - 0.5 * Math.cos(Math.PI * d));
  out.nod += 5 * e * Math.cos(Math.PI * d);
  out.turn += 9 * e * Math.sin((TAU * (d - 1)) / 8); // her head sweeps slowly from side to side, two bars a sweep
  out.tail = -20 * e * Math.sin((TAU * (d - 0.6)) / 4) + 6 * e * Math.sin(Math.PI * d);
  out.lift += 0.22 * rise * on;
  out.nod += 11 * rise * on;
  out.lean += 3.5 * rise * on;
  // the hush before a jump: her head comes down a little, to rise from
  const quiet = hush(b, 1.5);
  out.nod -= 5 * quiet * on;
  out.lift -= 0.05 * quiet * on;
  return out;
}
