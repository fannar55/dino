// Stjörnuhátíðin's called dance (Task 15; spec 6 "Dansinn er nýr", the calls' words spec 12): Slóeðla calls a move in a call's gap
// ("Hendur upp!", "Stappa!", "Snúa!", "Hoppa!": CALL_LINE, captions only in this chunk) and on the bar after it everyone does it,
// once a dance beat (SONG.danceBeats song beats) for as long as the map's callAt says, each in her own body; between calls each
// grooves in her own way (a bob, a sway on the bar and a foot that taps down on every beat). Everything is a pure function of the
// song's beat: the same beat gives the same pose whatever came before (a pause, `?t=`, the book's tile). Nothing here is chapter 5's
// but Egill's own moves (Task 15b, the owner's word of 2026-11-27): his hands, his shrug, his elbows, his arm reach and his hop clip
// are engine/pose/egill-hands.js, shared with chapter 5's music show, and his bounce, twist and sway are its numbers (EGILL). None
// of his bones is ever made longer.
//
//   MOVES, CALL_LINE, HOP         the four moves, the calls' line ids, each one's hop (m off the ground)
//   moveAt(beat)                  { move, call, n, length, weight, from, to } while a call's move runs (n: dance beats into it;
//                                 weight: in over DANCE.in beats from its first, out over DANCE.out after its last), else null
//   moveOf(who, move, n, out)     her pose for the move n dance beats into it (its fraction is the phase), unweighted
//   grooveOf(who, beat, out, size) her groove at the beat, `size` of itself
//   createDance(c)                { update(beat), feetAt(beat), places(), middle(who), take(who, fn), layer(fn), state(), setOn(on), dispose() }
//
// A pose (`out`): { lift (m: her model off the ground), spin (degrees about the up, round her body's middle), dip (m: her body
// down on bent legs, feet kept), turns { bone: [pitch, roll, yaw] } (degrees about her own side, front and up: pitch + noses and
// arms up, a tail down; roll + tips toward her right; yaw + to her left), feet { L, R } (m: a foot lifted, in front a little),
// glow (0..1: Kambeðla's plates' run, null: not hers); and Egill's own: hands { right, left: { up, pump, open, clap, cup } } (0..1:
// how far each hand is on its way to that pose, egill-hands.js), roll (degrees: his whole body tipped to his right about his feet, as
// chapter 5 sways him), clip (null, or { weight, time }: his hop clip) }.
import * as THREE from 'three';
import { BEAT, END_BEAT, callAt, entered, soloAt } from './hatid-score.js';
import { SONG } from './hatid-song.js';
import { FRIENDS8 } from './hatid-route.js';
import { rotateBoneWorld } from '../engine/actor.js';
import { reachTwoBones } from '../engine/ik.js';
import { egillArms, layHands, HOP_CLIP } from '../engine/pose/egill-hands.js';

export const MOVES = ['up', 'stomp', 'spin', 'hop'];
export const CALL_LINE = { up: 'h_sloedla_up', stomp: 'h_sloedla_stomp', spin: 'h_sloedla_spin', hop: 'h_sloedla_hop' };
/** m off the ground at the top of a hop; the two biggest bounce on bent legs instead (HOP_BOUNCE m down on the beat). */
export const HOP = { egill: 0.35, mosi: 0.3, kambedla: 0.12, sloedla: 0.2, uggedla: 0.15, flugedla: 0.8, thorsedla: 0, gramedla: 0 };
export const HOP_BOUNCE = { thorsedla: 0.35, gramedla: 0.3 };
/**
 * in, out: beats a move takes to come in from its first beat and to go after its last (a quarter beat put Egill's arms up 160
 * degrees in five frames: the 12 degrees a frame rule); turn: dance beats a spin takes round; follow: the beats over which the
 * drawings in the sky go from their traced pose to their friends' bones (the bar before the dance); quiet: the groove's size in the
 * quiet part; solo: the others' groove in a solo; reducedSpin: with less motion a spin is a turn of this many degrees each way
 * and back, not round; reducedHop: and a hop this share of itself.
 */
export const DANCE = { in: 1, out: 1.5, turn: 2, follow: [68, 72], quiet: 0.4, solo: 0.5, reducedSpin: 35, reducedHop: 0.5, skyHop: 1.5 };
/**
 * (Task 17 fix 1) In the quiet part Egill and Mosi look up as the fireflies gather and rise (hatid-stage.js FIREFLY_QUIET): from
 * `from` over a bar, down again over the bar before `to` (the last chorus); degrees of pitch (+ up) on their own bones.
 */
export const LOOK_UP = { from: 228, to: 252, egill: { Neck: 12, Head: 20 }, mosi: { Neck: 14, Head: 12 } };
/** How far Egill and Mosi look up at the beat, 0 to 1. */
export function lookUpAt(beat) {
  return smooth((beat - LOOK_UP.from) / BAR) * (1 - smooth((beat - (LOOK_UP.to - BAR)) / BAR));
}

const DB = SONG.danceBeats; // song beats a dance beat
const BAR = SONG.beatsPerBar;
const TAU = Math.PI * 2;
const clamp01 = x => Math.min(1, Math.max(0, x));
const smooth = x => { const k = clamp01(x); return k * k * (3 - 2 * k); };
const fract = x => x - Math.floor(x);
const rad = THREE.MathUtils.degToRad;

// ---------------------------------------------------------------------------------------------
// The calls' moves on the map: each from its doBeat to where callAt stops calling it (the next call, its section's end or 8 dance
// beats), read from callAt itself so the map alone says it.
const SPANS = SONG.song.calls.map((call, i) => {
  let to = call.doBeat;
  while (callAt(to)?.doing && callAt(to).move === call.move) to += 1 / 8;
  return { i, move: call.move, from: call.doBeat, to };
});
export function moveAt(beat) {
  for (const s of SPANS) {
    if (!(beat >= s.from && beat < s.to + DANCE.out)) continue;
    const weight = smooth((beat - s.from) / DANCE.in) * (beat < s.to ? 1 : 1 - smooth((beat - s.to) / DANCE.out));
    return { move: s.move, call: s.i, n: (beat - s.from) / DB, length: (s.to - s.from) / DB, weight, from: s.from, to: s.to };
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Each one's body (her own bones, tests/characters.mjs's models): her neck from its base, her tail from its root, her hips (what a
// dip lowers), her legs (pivot: a quadruped's front legs, children of her root, lifted as they are; jointed: thigh, shin, foot,
// reached with ik.js) and her arms or wings.
const range = (name, n) => Array.from({ length: n }, (_, i) => `${name}${i + 1}`);
const NECKS = (n) => ['Neck', ...Array.from({ length: n - 1 }, (_, i) => `Neck${i + 2}`)];
const JOINTED = { L: ['LeftThigh', 'LeftShin', 'LeftFoot'], R: ['RightThigh', 'RightShin', 'RightFoot'] };
export const BODY = {
  // Egill's legs are short: a foot reached high folds them past what the reach holds steady, so his foot comes up as a march (march:
  // his thigh forward and his shin back, degrees for a foot STAMP.egill m up), the reach only keeping his feet down in a dip; and he
  // dances on soft knees (soft: m his hips are always down: a straight leg's reach turns his knee far for a millimetre's dip)
  egill: { march: { thigh: 55, shin: -70 }, soft: 0.03, neck: ['Neck'], tail: [], hips: 'Hips', legs: 'jointed', feet: { L: ['LeftUpperLeg', 'LeftLowerLeg', 'LeftFoot'], R: ['RightUpperLeg', 'RightLowerLeg', 'RightFoot'] } },
  mosi: { neck: ['Neck'], tail: range('Tail', 5), hips: 'Body', legs: 'pivot', feet: { L: 'FrontLegL', R: 'FrontLegR' } },
  thorsedla: { neck: NECKS(5), tail: range('Tail', 8), hips: 'Hips', legs: 'pivot', feet: { L: 'FrontLegL', R: 'FrontLegR' } },
  sloedla: { neck: NECKS(3), tail: range('Tail', 6), hips: 'Hips', legs: 'pivot', feet: { L: 'FrontLegL', R: 'FrontLegR' } },
  kambedla: { neck: NECKS(2), tail: range('Tail', 6), hips: 'Hips', legs: 'pivot', feet: { L: 'FrontLegL', R: 'FrontLegR' } },
  uggedla: { neck: ['Neck'], tail: range('Tail', 6), hips: 'Hips', legs: 'jointed', feet: JOINTED },
  gramedla: { neck: ['Neck'], tail: range('Tail', 6), hips: 'Hips', legs: 'jointed', feet: JOINTED },
  flugedla: { neck: NECKS(3), tail: range('Tail', 3), hips: 'Hips', legs: 'jointed', feet: JOINTED },
};
/** The foot whose landing the floor lights (a quadruped's front feet; the bipeds' feet), by leg. */
const FOOT_BONE = {
  egill: { L: 'LeftFoot', R: 'RightFoot' }, uggedla: { L: 'LeftFoot', R: 'RightFoot' }, gramedla: { L: 'LeftFoot', R: 'RightFoot' }, flugedla: { L: 'LeftFoot', R: 'RightFoot' },
  mosi: { L: 'FrontFootL', R: 'FrontFootR' }, thorsedla: { L: 'FrontFootL', R: 'FrontFootR' }, sloedla: { L: 'FrontFootL', R: 'FrontFootR' }, kambedla: { L: 'FrontFootL', R: 'FrontFootR' },
};

// ---------------------------------------------------------------------------------------------
// Poses
const HAND_POSES = ['up', 'pump', 'open', 'clap', 'cup'];
function clear(out) {
  out.lift = 0;
  out.spin = 0;
  out.dip = 0;
  if (!out.turns) out.turns = {};
  for (const k of Object.keys(out.turns)) delete out.turns[k];
  if (!out.feet) out.feet = { L: 0, R: 0 };
  out.feet.L = 0;
  out.feet.R = 0;
  out.glow = null;
  if (!out.hands) out.hands = { right: {}, left: {} };
  for (const side of ['right', 'left']) for (const name of HAND_POSES) out.hands[side][name] = 0;
  out.roll = 0;
  out.clip = null;
  out.offset = null; // (Task 16, a solo's taker) [x, z] m her body is moved in her root's frame: Flugeðla's lap
  out.sky = null; // (Task 16, a solo's taker) { rise, turn } for her drawing in place of the dance's own
  out.legs = null; // (Task 16) 0 to 1: how much her jointed legs keep her feet (eased in with the groove at her entry; null: all)
  return out;
}
/** Add [pitch, roll, yaw] degrees, times k, to a bone of the pose. */
function turn(out, bone, pitch = 0, roll = 0, yaw = 0, k = 1) {
  const t = (out.turns[bone] ??= [0, 0, 0]);
  t[0] += pitch * k;
  t[1] += roll * k;
  t[2] += yaw * k;
}
/** The same turn spread over a chain of bones (each `each` degrees). */
function chain(out, bones, pitch, roll, yaw, k = 1) {
  for (const bone of bones) turn(out, bone, pitch, roll, yaw, k);
}

/**
 * The groove: on every beat her body dips (knees bend, `dip` m at the beat) and her head nods (`nod` degrees down at the beat); over
 * the bar she sways (`sway` degrees a neck or tail bone, yaw, one way on the bar's first half and the other on its second) and a foot
 * taps (`tap` m, the feet in turn, lifted through a beat and down on the next). Each her own (first values: calm, the song is H).
 */
export const GROOVE = {
  egill: { dip: 0.05, nod: 6, sway: 7, tap: 0.06 },
  mosi: { dip: 0.08, nod: 7, sway: 5, tap: 0.12 },
  thorsedla: { dip: 0.12, nod: 3, sway: 3, tap: 0.16 },
  sloedla: { dip: 0.06, nod: 7, sway: 5, tap: 0.1 },
  kambedla: { dip: 0.06, nod: 6, sway: 7, tap: 0.1 },
  uggedla: { dip: 0.1, nod: 5, sway: 4, tap: 0.12 },
  gramedla: { dip: 0.12, nod: 5, sway: 4, tap: 0 }, // her feet are the band's bass drum (Task 16)
  flugedla: { dip: 0.05, nod: 8, sway: 4, tap: 0.06 },
};
const onBeat = u => 0.5 + 0.5 * Math.cos(TAU * u); // 1 on the beat, 0 between
/** A foot lifted through a beat and set down on the next: 0 at both ends. */
const tapShape = u => Math.sin(Math.PI * clamp01(u)) ** 2;

/**
 * (Task 15b) Egill's own dance, chapter 5's numbers (its show's egillAt): his bounce (m: up between two beats, down on the beat), his
 * twist and his tip to the side (degrees, right on one beat and left on the next), the sway of his hands up (upRoll degrees, over
 * two beats), and with less motion only a slow small roll (reducedRoll degrees over four beats) and his hands up at reducedUp.
 * hop: his hop clip in the party's hop, a hop on every dance beat: `ground` of each dance beat round the beat itself he is on the
 * ground (the clip's landing and its crouch for the next, quicker than the clip's own), the rest he is in the air (the clip's air,
 * slower), lifted `more` m over the clip's own as chapter 5 lifts him.
 */
export const EGILL = { bounce: 0.075, twist: 15, roll: 5, upRoll: 4, reducedRoll: 2.5, reducedUp: 0.7, hop: { ground: 0.4, more: 0.1 } };
/** 0 on the ground at the ends, 1 at the top. */
const arc = (u, from, to) => { const k = (u - from) / (to - from); return k <= 0 || k >= 1 ? 0 : 4 * k * (1 - k); };
/** 1 from `from` to `to`, rising over `rise` beats and falling over `fall` beats before `to`. */
const span = (b, from, to, rise, fall) => (b <= from || b >= to ? 0 : smooth((b - from) / rise) * (1 - smooth((b - (to - fall)) / fall)));
/** The last chorus's call gaps, where Egill claps on the beat while Slóeðla calls: [from, to] beats. */
const CLAP_GAPS = SONG.song.calls.filter(call => call.beat >= SONG.song.sections.find(s => s.id === 'chorus').startBeat).map(call => [call.beat, call.doBeat]);
/** His hands together on the beat (chapter 5's clap: in over 0.4 beat before it, apart again 0.35 after). */
const clapShape = u => (u >= 0.6 ? smooth((u - 0.6) / 0.4) : u < 0.35 ? 1 - smooth(u / 0.35) : 0);
/** His hop clip and lift `n` dance beats into the party's hop: { time (s into the clip), lift (m over the clip's own) }. */
export function egillHopAt(n) {
  const { ground, more } = EGILL.hop;
  const v = fract(n + ground / 2);
  if (v < ground) {
    // down: the clip's landing to its end, then from its start through its crouch to where it leaves the ground
    const land = HOP_CLIP.seconds - HOP_CLIP.down;
    const t = (v / ground) * (land + HOP_CLIP.off);
    return { time: t < land ? HOP_CLIP.down + t : t - land, lift: 0 };
  }
  const k = (v - ground) / (1 - ground);
  return { time: HOP_CLIP.off + (HOP_CLIP.down - HOP_CLIP.off) * k, lift: more * arc(k, 0, 1) };
}
function egillGroove(beat, out, size, reduced) {
  const k = size * (1 - lookUpAt(beat)); // still in the quiet part, where he looks up
  if (!(k > 0)) return;
  if (reduced) { out.roll += EGILL.reducedRoll * k * Math.sin((TAU * beat) / 4); return; }
  const side = Math.sin(Math.PI * beat); // right on one beat, left on the next
  out.lift += EGILL.bounce * k * arc(fract(beat), 0.1, 0.9);
  out.spin += EGILL.twist * k * side;
  out.roll += EGILL.roll * k * side;
  // his fists pump, one up as the other comes down; in the last chorus's gaps he claps on the beat
  let clapping = 0;
  for (const [from, to] of CLAP_GAPS) clapping = Math.max(clapping, span(beat, from, to, 1, 0.5));
  const clap = clapShape(fract(beat));
  const { right, left } = out.hands;
  right.pump = k * (1 - clapping) * (0.5 + 0.5 * side);
  left.pump = k * (1 - clapping) * (0.5 - 0.5 * side);
  right.clap = left.clap = k * clapping * clap;
  right.open = left.open = k * clapping * (1 - clap);
}

export function grooveOf(who, beat, out = {}, size = 1, { reduced = false } = {}) {
  clear(out);
  const g = GROOVE[who];
  if (!g || !(size > 0)) return out;
  const u = fract(beat);
  const sway = Math.sin((TAU * beat) / BAR);
  const body = BODY[who];
  out.dip = g.dip * onBeat(u) * size;
  turn(out, 'Head', -g.nod * onBeat(u), 0, 0, size);
  chain(out, body.neck, 0, 0, g.sway, sway * size);
  chain(out, body.tail, 0, 0, g.sway * 1.2, sway * size);
  if (who === 'egill') {
    turn(out, 'Spine', 0, g.sway, 0, sway * size); // his hips and shoulders rock with the bar
    egillGroove(beat, out, size, reduced); // and his own bounce, twist and fists
  }
  if (who === 'uggedla') { turn(out, 'LeftUpperArm', 10, 0, 0, sway * size); turn(out, 'RightUpperArm', -10, 0, 0, sway * size); }
  if (who === 'flugedla') { turn(out, 'LeftUpperArm', 0, 8, 0, onBeat(u) * size); turn(out, 'RightUpperArm', 0, -8, 0, onBeat(u) * size); }
  if (g.tap > 0) {
    const k = Math.floor(beat);
    out.feet[k % 2 ? 'R' : 'L'] = g.tap * tapShape(u) * size;
  }
  return out;
}

/**
 * A stamp: the foot up over the dance beat's first half, held, and brought down over its last third, fastest as it lands on the next
 * (0 at both ends; a third, not a fifth: a quicker slam turned Egill's shin 20 degrees in a frame).
 */
function stampShape(u) {
  const up = smooth((u - 0.06) / 0.44);
  const down = u > 0.68 ? 1 - ((u - 0.68) / 0.32) ** 2 : 1;
  return up * down;
}
/** A turn round over DANCE.turn dance beats, eased each time round (she faces the child at each end). */
function spinAngle(n) {
  const k = n / DANCE.turn;
  const f = fract(k);
  return 360 * (Math.floor(k) + f - Math.sin(TAU * f) / TAU);
}
/** Egill's hands on their way to `pose` (egill-hands.js HANDS: up, pump, open, clap), `right` and `left` of the way. */
function egillHands(out, pose, right, left = right) {
  out.hands.right[pose] += right;
  out.hands.left[pose] += left;
}
export const STAMP = { egill: 0.22, mosi: 0.4, thorsedla: 0.7, sloedla: 0.35, kambedla: 0.3, uggedla: 0.55, gramedla: 0.7, flugedla: 0.3 };

/**
 * Her pose for `move`, `n` dance beats into it (n's fraction is where she is in this dance beat): each in her own body.
 *   up     Egill both arms up over his head, Mosi his head and horn up, Þórseðla her whole neck up, Uggeðla her arms up and her sail
 *          waving, Flugeðla both wings up (flapping), Kambeðla her tail up and her plates lit in a run, Slóeðla her crest thrown back,
 *          Grameðla her little arms up and her jaws open: up on the dance beat and pumped between
 *   stomp  a foot (left on the first, then right, ...) up and stamped down on every dance beat; Grameðla's lands on the map's
 *          stomp cue, and she leans into it
 *   spin   round on the spot over DANCE.turn dance beats (arms, wings and tails out); Þórseðla and Grameðla only their heads and tails
 *          round, one way and back
 *   hop    off the ground by HOP on every dance beat, landing on the next; the two biggest bounce on bent legs
 */
export function moveOf(who, move, n, out = {}, { reduced = false } = {}) {
  clear(out);
  const u = fract(n);
  const pump = 0.85 + 0.15 * Math.cos(TAU * u); // full on the dance beat
  const body = BODY[who];
  if (!body) return out;
  switch (move) {
    case 'up': {
      if (who === 'egill') {
        // (Task 15b) chapter 5's "Hendur upp, Egill!": his hands up in a V over his head with a shrug, held up through the move and
        // swaying side to side over two beats (his bounce is the groove's, under it)
        egillHands(out, 'up', reduced ? EGILL.reducedUp : 1);
        if (!reduced) out.roll = EGILL.upRoll * Math.sin(Math.PI * n * DB);
      } else if (who === 'mosi') {
        turn(out, 'Neck', 18, 0, 0, pump);
        turn(out, 'Head', 24, 0, 0, pump);
      } else if (who === 'thorsedla') {
        // her front up off the ground (her "hands"), her body tipped up on her hind legs, and her whole neck up
        turn(out, 'Hips', 7);
        out.feet.L = out.feet.R = 0.55;
        [14, 12, 10, 8, 6].forEach((d, i) => turn(out, body.neck[i], d, 0, 0, pump));
        turn(out, 'Head', -14, 0, 0, pump);
      } else if (who === 'uggedla') {
        turn(out, 'LeftUpperArm', 115, 0, 0, pump);
        turn(out, 'RightUpperArm', 115, 0, 0, pump);
        turn(out, 'Spine', 0, 9 * Math.sin(TAU * u)); // her sail waves side to side
        turn(out, 'Chest', 0, 6 * Math.sin(TAU * u));
        turn(out, 'Head', 14, 0, 0, pump);
      } else if (who === 'flugedla') {
        const flap = 0.75 + 0.25 * Math.cos(TAU * 2 * u);
        turn(out, 'LeftUpperArm', 20, 95, 0, flap);
        turn(out, 'RightUpperArm', 20, -95, 0, flap);
        turn(out, 'Head', 15, 0, 0, pump);
        out.lift = 0.12 * pump; // up on her toes
      } else if (who === 'kambedla') {
        chain(out, body.tail, -8, 0, 0, pump);
        turn(out, 'Head', 10, 0, 0, pump);
        out.glow = u;
      } else if (who === 'sloedla') {
        turn(out, 'Neck2', 9, 0, 0, pump);
        turn(out, 'Neck3', 9, 0, 0, pump);
        turn(out, 'Head', 26, 0, 0, pump);
      } else if (who === 'gramedla') {
        turn(out, 'LeftUpperArm', 70, 0, 0, pump);
        turn(out, 'RightUpperArm', 70, 0, 0, pump);
        turn(out, 'Jaw', -20, 0, 0, pump);
        turn(out, 'Head', 12, 0, 0, pump);
      }
      break;
    }
    case 'stomp': {
      const k = Math.floor(n);
      const side = k % 2 ? 'R' : 'L';
      const lean = -Math.sin(Math.PI * n); // toward the lifted foot, upright as each lands
      out.feet[side] = STAMP[who] * stampShape(u);
      const landed = k > 0 ? 6 * u * Math.exp(1 - 6 * u) : 0; // the stamp's bump, a sixth of a dance beat after a foot comes down
      out.dip = 0.06 * landed;
      if (who === 'egill') {
        turn(out, 'Spine', 0, 6 * lean);
        // (Task 15b) his fists pump as in chapter 5, one up as the other comes down, with his feet: the fist over the other foot up
        const s = Math.sin(Math.PI * n);
        if (!reduced) egillHands(out, 'pump', 0.5 + 0.5 * s, 0.5 - 0.5 * s);
      } else if (who === 'mosi') {
        turn(out, 'Neck', -8 * landed);
        turn(out, 'Head', -10, 0, 0, landed);
      } else if (who === 'thorsedla') {
        chain(out, body.neck, -2, 0, 0, landed);
        chain(out, body.tail, 2, 0, 0, landed);
      } else if (who === 'sloedla') {
        turn(out, 'Head', -9, 0, 0, landed);
        chain(out, body.tail.slice(0, 3), 0, 0, 6 * lean);
      } else if (who === 'kambedla') {
        chain(out, body.tail, 3, 0, 4 * lean, 1);
        turn(out, 'Head', -6, 0, 0, landed);
      } else if (who === 'uggedla') {
        turn(out, 'Spine', 0, 5 * lean);
        chain(out, body.tail, 0, 0, 3 * lean);
        turn(out, 'Head', -7, 0, 0, landed);
      } else if (who === 'gramedla') {
        turn(out, 'Hips', 0, 4 * lean);
        turn(out, 'Head', -8, 0, 0, landed);
        turn(out, 'Jaw', -6, 0, 0, landed);
      } else if (who === 'flugedla') {
        turn(out, 'LeftUpperArm', 0, 25, 0, landed);
        turn(out, 'RightUpperArm', 0, -25, 0, landed);
        turn(out, 'Head', -8, 0, 0, landed);
      }
      break;
    }
    case 'spin': {
      const swing = Math.sin((TAU * n) / DANCE.turn);
      if (who === 'thorsedla' || who === 'gramedla') {
        const neck = who === 'thorsedla' ? 7 : 22;
        chain(out, body.neck, 0, 0, neck, swing);
        turn(out, 'Head', 0, 0, who === 'thorsedla' ? 10 : 15, swing);
        chain(out, body.tail, 0, 0, who === 'thorsedla' ? 4.5 : 6, swing);
        turn(out, 'Hips', 0, 4 * swing);
        break;
      }
      out.spin = reduced ? DANCE.reducedSpin * swing : spinAngle(n);
      if (who === 'egill') {
        // (Task 15b) as chapter 5 turns him on the spot: his fists pumping, one up as the other comes down on each beat
        const s = Math.sin(Math.PI * n * DB);
        if (!reduced) egillHands(out, 'pump', 0.5 + 0.5 * s, 0.5 - 0.5 * s);
      } else if (who === 'flugedla') { turn(out, 'LeftUpperArm', 0, 75); turn(out, 'RightUpperArm', 0, -75); }
      else if (who === 'uggedla') { turn(out, 'LeftUpperArm', 60, 30); turn(out, 'RightUpperArm', 60, -30); }
      else if (who === 'mosi') chain(out, body.tail, -5, 0, 0);
      else if (who === 'kambedla') chain(out, body.tail, -4, 0, 0);
      else if (who === 'sloedla') { chain(out, body.tail, -4, 0, 0); turn(out, 'Head', 15); }
      break;
    }
    case 'hop': {
      const air = 4 * u * (1 - u);
      if (HOP_BOUNCE[who]) {
        out.dip = HOP_BOUNCE[who] * onBeat(u);
        chain(out, body.neck, who === 'thorsedla' ? 3 : 8, 0, 0, 1 - onBeat(u));
        chain(out, body.tail, -2, 0, 0, 1 - onBeat(u));
        break;
      }
      out.lift = HOP[who] * air * (reduced ? DANCE.reducedHop : 1);
      if (who === 'egill' && !reduced) {
        // (Task 15b) his own hop clip (its arms flung up), off the ground and down again with the party's hop, lifted as chapter 5 lifts it
        const h = egillHopAt(n);
        out.clip = { weight: 1, time: h.time };
        out.lift = h.lift;
      } else if (who === 'flugedla') { turn(out, 'LeftUpperArm', 10, 70, 0, air); turn(out, 'RightUpperArm', 10, -70, 0, air); }
      else if (who === 'uggedla') { turn(out, 'LeftUpperArm', 50, 0, 0, air); turn(out, 'RightUpperArm', 50, 0, 0, air); }
      else if (who === 'mosi') { turn(out, 'Head', 12, 0, 0, air); chain(out, body.tail, -4, 0, 0, air); }
      else if (who === 'kambedla') chain(out, body.tail, -5, 0, 0, air);
      else if (who === 'sloedla') { turn(out, 'Head', 14, 0, 0, air); chain(out, body.tail, -4, 0, 0, air); }
      break;
    }
    default:
      break;
  }
  return out;
}

/** Egill's hands of b x k into a's (poses). */
export function addHands(a, b, k = 1) {
  if (!b.hands || !a.hands) return a;
  for (const side of ['right', 'left']) for (const name of HAND_POSES) a.hands[side][name] += (b.hands[side][name] ?? 0) * k;
  return a;
}
/** Egill's hands in a pose times k. */
function scaleHands(a, k) {
  for (const side of ['right', 'left']) for (const name of HAND_POSES) a.hands[side][name] *= k;
}
/** a + b x k into a (poses). */
function addPose(a, b, k = 1, spin = true) {
  a.lift += b.lift * k;
  if (spin) a.spin += b.spin; // a turn is never scaled: it ends on whole turns
  a.dip += b.dip * k;
  for (const [bone, t] of Object.entries(b.turns)) turn(a, bone, t[0], t[1], t[2], k);
  a.feet.L += b.feet.L * k;
  a.feet.R += b.feet.R * k;
  addHands(a, b, k);
  a.roll += (b.roll ?? 0) * k;
  if (b.clip && k > 0) a.clip = { weight: b.clip.weight * k, time: b.clip.time };
  if (b.glow !== null && k > 0) a.glow = b.glow;
  return a;
}

// ---------------------------------------------------------------------------------------------
// The groove's size: from her entry into the song (Mosi and Egill with the choir), DANCE.quiet of itself in the quiet part (over a
// bar either side), DANCE.solo in another's solo, and none in the last chord (Task 17's end pose) or after the song.
const QUIET = SONG.song.sections.find(s => s.id === 'quiet');
const CHORD = SONG.song.sections.find(s => s.id === 'chord');
const SOLOS_AT = SONG.song.sections.find(s => s.id === 'solos');
const ENTRY = who => (SONG.song.entries.some(e => e.who === who) ? who : 'choir');
function quietAt(beat) {
  const a = smooth((beat - QUIET.startBeat) / BAR), b = 1 - smooth((beat - (QUIET.startBeat + QUIET.beats - BAR)) / BAR);
  return Math.min(a, b);
}
export function grooveSize(who, beat) {
  if (!(beat >= 0) || beat >= END_BEAT) return 0;
  const chord = 1 - smooth((beat - CHORD.startBeat) / 2);
  const solo = soloAt(beat);
  const soloing = smooth((beat - SOLOS_AT.startBeat) / 1) * (1 - smooth((beat - (SOLOS_AT.startBeat + SOLOS_AT.beats - 1)) / 1));
  const others = solo && solo.who !== who ? 1 - (1 - DANCE.solo) * soloing : 1;
  return entered(ENTRY(who), beat) * (1 - (1 - DANCE.quiet) * quietAt(beat)) * chord * others;
}

// ---------------------------------------------------------------------------------------------
// The dance laid on the eight (actor.setOverlay: over her clip and footing, before look and talk), each frame from the pose the
// last update(beat) made. Her bones are put back as her clip had them before each frame's turns (a guard: the mixer leaves a bone
// alone whose value it did not change), so nothing piles up and the same beat gives the same pose.
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();
const qc = new THREE.Quaternion();
const qm = new THREE.Quaternion();
// (Task 16) the lift, m, over which a jointed leg eases into its reach outside the groove (pose.legs)
const LEG_EASE = 0.05;
const FRONT = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
const SIDE = new THREE.Vector3(0, 0, 1);
const ONE = new THREE.Vector3(1, 1, 1);
/** (Task 15b) degrees Egill's upper arms are rolled out and up (and pitched back over his head) before the reach takes his hands up. */
const UP_SWING = { out: 150, forward: 15 };
const handFrame = new THREE.Matrix4();
const handQ = new THREE.Quaternion();

/** Bones whose turn and place a pose changes: put back as the clip left them where the mixer has not set them since. */
function guard(bones) {
  const before = bones.map(b => [b.quaternion.clone(), b.position.clone()]);
  const after = bones.map(b => [b.quaternion.clone(), b.position.clone()]);
  let armed = false;
  return {
    begin() {
      bones.forEach((b, i) => {
        if (armed && b.quaternion.equals(after[i][0])) b.quaternion.copy(before[i][0]);
        if (armed && b.position.equals(after[i][1])) b.position.copy(before[i][1]);
        before[i][0].copy(b.quaternion);
        before[i][1].copy(b.position);
      });
    },
    end() { bones.forEach((b, i) => { after[i][0].copy(b.quaternion); after[i][1].copy(b.position); }); armed = true; },
    release() {
      if (armed) bones.forEach((b, i) => {
        if (b.quaternion.equals(after[i][0])) b.quaternion.copy(before[i][0]);
        if (b.position.equals(after[i][1])) b.position.copy(before[i][1]);
      });
      armed = false;
    },
  };
}

/** One friend's rig: her bones by name, her guard, her body's middle in her root (what a spin turns round). */
function rigOf(who, actor) {
  const byName = new Map();
  actor.model.traverse(o => { if (o.isBone && !byName.has(o.name)) byName.set(o.name, o); });
  const body = BODY[who];
  const names = new Set([body.hips, ...body.neck, ...body.tail, 'Head', 'Jaw', 'Spine', 'Chest', 'Hips']);
  for (const side of ['Left', 'Right']) for (const part of ['Shoulder', 'UpperArm', 'LowerArm', 'Forearm', 'Hand']) names.add(`${side}${part}`);
  for (const leg of Object.values(body.feet)) for (const name of [leg].flat()) names.add(name);
  const bones = [...names].map(n => byName.get(n)).filter(Boolean);
  // her middle, from her bones' spread in her root (the bind bounds are the actor's own; a bone box keeps it to her skeleton)
  actor.root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const inv = actor.root.matrixWorld.clone().invert();
  byName.forEach(b => box.expandByPoint(b.getWorldPosition(v1).applyMatrix4(inv)));
  const middle = box.getCenter(new THREE.Vector3()).setY(0);
  const order = new Map();
  let k = 0;
  actor.model.traverse(o => { if (o.isBone) order.set(o.name, k++); });
  const arms = who === 'egill' ? egillArms(actor.model) : null; // (Task 15b) his arms, posed by his hands (egill-hands.js)
  const hipsRest = byName.get(body.hips)?.position.clone() ?? null; // (Task 15b) his hips' place as the dance found it (his hop clip moves it)
  return { who, actor, body, byName, bones, guard: guard(bones), middle, order, arms, hipsRest };
}

/** Lay `pose` on her (in her overlay): model lift and spin, the dip with her feet kept, the turns, the feet lifted. */
function lay(rig, pose) {
  const { actor, body, byName } = rig;
  const { model, root } = actor;
  rig.guard.begin();
  // her model off the ground and round her middle
  const a = rad(pose.spin);
  const c = rig.middle;
  const cs = Math.cos(a), sn = Math.sin(a);
  model.rotation.set(0, a, 0);
  if (pose.roll) model.quaternion.multiply(qa.setFromAxisAngle(FRONT, rad(pose.roll))); // (Task 15b) Egill tipped about his feet
  model.position.set(c.x - (cs * c.x + sn * c.z), pose.lift, c.z - (-sn * c.x + cs * c.z));
  if (pose.offset) { model.position.x += pose.offset[0]; model.position.z += pose.offset[1]; } // (Task 16) her lap
  root.updateMatrixWorld(true);
  model.getWorldQuaternion(qm);
  const front = v1.copy(FRONT).applyQuaternion(qm);
  const side = SIDE.clone().applyQuaternion(qm);
  const up = UP;
  // the dip: her hips down, her feet where they were
  const hips = byName.get(body.hips);
  const jointed = body.legs === 'jointed';
  const kept = {};
  if (jointed) for (const [s, [, , foot]] of Object.entries(body.feet)) { const f = byName.get(foot); if (f) kept[s] = f.getWorldPosition(new THREE.Vector3()); }
  const dip = pose.dip + (body.soft ?? 0);
  if (hips && dip) {
    const p = hips.getWorldPosition(v2).addScaledVector(up, -dip);
    hips.parent.worldToLocal(p);
    hips.position.copy(p);
    hips.updateMatrixWorld(true);
  }
  // the turns, parents first
  const names = Object.keys(pose.turns).filter(n => byName.has(n)).sort((x, y) => rig.order.get(x) - rig.order.get(y));
  for (const name of names) {
    const [pitch, roll, yaw] = pose.turns[name];
    if (!pitch && !roll && !yaw) continue;
    qa.setFromAxisAngle(up, rad(yaw));
    qb.setFromAxisAngle(side, rad(pitch));
    qc.setFromAxisAngle(front, rad(roll));
    rotateBoneWorld(byName.get(name), qa.multiply(qb).multiply(qc));
  }
  // (Task 15b) Egill's hands where his pose has them, in his own frame (his model's place and turn under his root, his feet's middle
  // at its origin), each arm bent to its goal by chapter 5's reach: no bone longer
  if (rig.arms && pose.hands) {
    // his arms swung up and out in an arc as his hands go up (UP_SWING), so the reach starts near the V and bends each arm the last
    // of the way: from his hanging arms the reach turned them 60 degrees in a frame as the goal swept up past his shoulder
    for (const arm of rig.arms) {
      const w = pose.hands[arm.key].up;
      if (!(w > 0)) continue;
      qb.setFromAxisAngle(side, rad(UP_SWING.forward * w));
      qc.setFromAxisAngle(front, rad(-arm.sign * UP_SWING.out * w));
      rotateBoneWorld(arm.upper, qb.multiply(qc));
    }
    handFrame.compose(model.position, model.quaternion, ONE).premultiply(root.matrixWorld);
    root.getWorldQuaternion(handQ).multiply(model.quaternion);
    layHands({ matrix: handFrame, quaternion: handQ, head: byName.get('Head') }, rig.arms, pose.hands);
  }
  // the feet: a jointed leg reaches its foot back to where it stood (lifted, a little forward); a pivot leg is lifted as it is
  for (const s of ['L', 'R']) {
    const h = pose.feet[s];
    if (jointed) {
      const [thighName, shinName, footName] = body.feet[s];
      const thigh = byName.get(thighName), shin = byName.get(shinName), foot = byName.get(footName);
      if (!thigh || !shin || !foot || !kept[s]) continue;
      if (!dip && !(h > 0)) continue;
      const lift = body.march ? 0 : Math.max(0, h);
      const target = kept[s].addScaledVector(up, lift).addScaledVector(front, lift * 0.3);
      const pole = shin.getWorldPosition(new THREE.Vector3()).addScaledVector(front, 2);
      if (dip || lift > 0) {
        // (Task 16) eased in as she comes into the groove (pose.legs) or as a foot lifts (over LEG_EASE m), so the leg does not snap
        // to the reach in the frame it starts (a 15 degree shin at Uggeðla's entry; the band's drum before Grameðla's)
        const w = Math.max(pose.legs ?? 1, smooth(Math.min(1, lift / LEG_EASE)));
        const was = w < 1 ? [thigh, shin, foot].map(b => b.quaternion.clone()) : null;
        reachTwoBones(thigh, shin, foot, target, pole);
        if (was) {
          [thigh, shin, foot].forEach((b, i) => b.quaternion.copy(was[i].slerp(b.quaternion, w)));
          thigh.updateMatrixWorld(true);
        }
      }
      if (body.march && h > 0) {
        const k = h / STAMP[rig.who];
        rotateBoneWorld(thigh, qa.setFromAxisAngle(side, rad(body.march.thigh * k)));
        rotateBoneWorld(shin, qa.setFromAxisAngle(side, rad(body.march.shin * k)));
      }
    } else if (h > 0) {
      const leg = byName.get(body.feet[s]);
      if (!leg) continue;
      const p = leg.getWorldPosition(v2).addScaledVector(up, h).addScaledVector(front, h * 0.25);
      leg.parent.worldToLocal(p);
      leg.position.copy(p);
      leg.updateMatrixWorld(true);
    }
  }
  rig.guard.end();
}

/**
 * The dance on the party's eight: `c` { world, top?, stands.party, reduced, figures? (the constellations), plates? (Kambeðla's glow),
 * <who>.raw (the actors) }. update(beat) each frame before the actors: her clip at the beat (her idle; in her solo her happy, or
 * Grameðla's roar, until Task 16), her root on her stand, and the pose (grooveOf, and moveOf while a call's move runs, its weight)
 * laid over it in her own update; the six drawings follow their friends' bones from DANCE.follow (Flugeðla's flier drawing kept in
 * its traced pose, lifted with her hop and twirled flat in the sky's plane with her spin); Kambeðla's plates run in her up.
 *   feetAt(beat)      the feet that land, [{ who, x, z, age (beats since it came down), radius, level }] for the floor
 *   places()          { who: [x, z] } where each stands; middle(who) her body's middle in the world now
 *   take(who, fn)     a solo or the quiet part takes her: fn(beat, out) gives her pose (the same shape, filled from clear) in place of
 *                     the dance's; take(who, null) gives her back. Her clip is then the taker's to set too (fn may play its own).
 *   layer(fn)         fn(who, beat, out) after the dance's pose of each, before it is laid (the band's parts, Task 16)
 *   state()           { beat, move, weight, poses: { who: { lift, spin, dip, feet } } }
 *   setOn(on)         the dance off (her clip alone) or on again, for the benches' pairs
 *   dispose()         the overlays off, her bones and plates back, the drawings held still again
 */
export function createDance(c, { reduced = Boolean(c.reduced) } = {}) {
  const who8 = FRIENDS8.filter(who => c[who]?.raw);
  const heightAt = c.top?.heightAt ?? c.world.heightAt ?? (() => 0);
  const rigs = new Map(who8.map(who => [who, rigOf(who, c[who].raw)]));
  const poses = new Map(who8.map(who => [who, clear({})]));
  const scratch = clear({});
  const takers = new Map();
  const layers = [];
  const held = new Map(); // who -> { clip, action, from }
  let now = null;
  let plateGlow = false;
  // where each foot stands (world, her idle at the start), for the floor
  const feetHome = new Map();
  for (const [who, rig] of rigs) {
    rig.actor.root.updateMatrixWorld(true);
    const spots = {};
    for (const [s, name] of Object.entries(FOOT_BONE[who])) {
      const bone = rig.byName.get(name);
      const p = bone ? bone.getWorldPosition(new THREE.Vector3()) : rig.actor.root.position.clone();
      spots[s] = [p.x, p.z];
    }
    const m = rig.middle.clone().applyMatrix4(rig.actor.root.matrixWorld);
    spots.middle = [m.x, m.z];
    feetHome.set(who, spots);
  }
  // each held on her stand (actor.control: her root where the dance puts it and her feet as her clip has them, no footing stepping
  // by its own clock, so the same beat is the same pose), the pose laid over her clip
  for (const [who, rig] of rigs) {
    const { at, heading } = c.stands.party[who];
    rig.actor.control(() => { rig.actor.root.position.set(at[0], heightAt(at[0], at[1]), at[1]); }, null);
    rig.actor.place?.(at[0], at[1], heading);
    rig.actor.setOverlay(() => lay(rig, poses.get(who)));
  }

  /**
   * Her clips at the beat: her idle, and in her solo (until Task 16's tricks) her happy (Grameðla her roar) eased in and out over
   * SOLO_FADE beats; both times and weights from the beat, so no crossfade's own clock is in it. Gives how far her solo has her (0 to 1).
   */
  const SOLO_FADE = 0.5;
  const SOLOS = SONG.song.solos;
  function clipFor(who, beat) {
    const actor = c[who].raw;
    let state = held.get(who);
    if (!state) {
      const mixer = actor.mixer;
      const idle = actor.clips.get('idle');
      const own = actor.clips.get('happy') ?? actor.clips.get('roar') ?? null;
      const hop = who === 'egill' ? actor.clips.get('hop') : null; // (Task 15b) his hop clip in "Hoppa!"
      state = { idle: idle ? mixer.clipAction(idle) : null, own: own ? mixer.clipAction(own) : null, hop: hop ? mixer.clipAction(hop) : null, slot: SOLOS.find(s => s.who === who) ?? null };
      mixer.stopAllAction();
      held.set(who, state);
    }
    const slot = state.slot;
    const w = slot ? smooth((beat - slot.startBeat) / SOLO_FADE) * (1 - smooth((beat - (slot.startBeat + slot.beats - SOLO_FADE)) / SOLO_FADE)) : 0;
    const put = (action, weight, from) => {
      if (!action) return;
      if (!action.isRunning()) { action.reset(); action.play(); }
      action.enabled = true;
      action.setEffectiveTimeScale(1);
      action.setEffectiveWeight(weight);
      const duration = action.getClip().duration;
      if (duration > 0) action.time = ((((beat - from) * BEAT) % duration) + duration) % duration;
    };
    put(state.idle, 1 - w, 0);
    if (state.own) put(state.own, w, slot ? slot.startBeat : 0);
    return w;
  }
  /**
   * (Task 15b) Egill's hop clip at the pose's weight and time (held: its time is the pose's, not the mixer's), his idle under it the
   * rest; off when the pose has none (and his idle left to whoever has him).
   */
  function hopClipFor(who, clip) {
    const state = held.get(who);
    const action = state?.hop;
    if (!action) return;
    const w = clip ? clamp01(clip.weight) : 0;
    // always playing, at no weight between hops: the mixer then puts back what the clip moves (his hips' place, which his idle does
    // not move) as it stood when the dance began, so a hop leaves nothing behind and the same beat is the same pose
    if (!action.isRunning()) {
      const rig = rigs.get(who);
      rig.byName.get(rig.body.hips)?.position.copy(rig.hipsRest);
      action.reset();
      action.play();
    }
    action.enabled = true;
    action.setEffectiveTimeScale(0);
    action.setEffectiveWeight(w);
    if (clip) action.time = Math.min(clip.time, action.getClip().duration - 1e-4); // (its end would loop round to its start)
    if (w > 0) state.idle?.setEffectiveWeight(Math.max(0, 1 - w));
  }

  let on = true;
  function update(beat) {
    if (!on) { for (const who of who8) { clipFor(who, beat); clear(poses.get(who)); hopClipFor(who, null); } now = { beat, move: null, weight: 0 }; return; }
    const m = moveAt(beat);
    for (const who of who8) {
      const actor = c[who].raw;
      const { at } = c.stands.party[who];
      const pose = poses.get(who);
      const taker = takers.get(who);
      if (taker) {
        clear(pose);
        taker(beat, pose);
      } else {
        const solo = clipFor(who, beat); // 0 to 1: her own solo has her
        actor.root.position.set(at[0], heightAt(at[0], at[1]), at[1]);
        grooveOf(who, beat, pose, (1 - solo) * grooveSize(who, beat), { reduced });
        pose.legs = smooth(Math.min(1, grooveSize(who, beat) / 0.1));
        if (m && solo < 1 && m.weight > 0) {
          const n = Math.min(m.n, m.length);
          moveOf(who, m.move, n, scratch, { reduced });
          // in a stomp or a hop the feet are the move's, not the groove's taps
          if (m.move === 'stomp' || m.move === 'hop') { pose.feet.L *= 1 - m.weight; pose.feet.R *= 1 - m.weight; }
          if (who === 'egill') {
            // (Task 15b) his hands are the move's; in a stomp or a hop so are his feet, so his bounce and twist give way to it
            scaleHands(pose, 1 - m.weight);
            if (m.move === 'stomp' || m.move === 'hop') { pose.lift *= 1 - m.weight; pose.spin *= 1 - m.weight; }
            // and with his hands up he bounces as chapter 5 has him (up between the beats), not down on bent knees: his short arms
            // keep his hands over his head
            if (m.move === 'up') pose.dip *= 1 - m.weight;
          }
          addPose(pose, scratch, m.weight);
        }
        const up = LOOK_UP[who] ? lookUpAt(beat) : 0;
        if (up > 0) for (const [bone, d] of Object.entries(LOOK_UP[who])) turn(pose, bone, d, 0, 0, up);
      }
      for (const fn of layers) fn(who, beat, pose);
      hopClipFor(who, taker ? null : pose.clip);
    }
    // the drawings dance with them
    const figures = c.figures;
    if (figures?.follow) {
      const live = smooth((beat - DANCE.follow[0]) / (DANCE.follow[1] - DANCE.follow[0]));
      for (const who of who8) {
        if (who === 'mosi' || who === 'egill') continue; // no drawing of their own
        // a hop seen from far off: the drawing hops DANCE.skyHop degrees at the top of hers (and dips with the two that bounce)
        const pose = poses.get(who);
        const bounce = m?.move === 'hop' && HOP_BOUNCE[who] ? m.weight * onBeat(fract(Math.min(m.n, m.length))) : 0;
        const rise = HOP[who] > 0 ? (DANCE.skyHop * pose.lift) / HOP[who] : -0.4 * DANCE.skyHop * bounce;
        try {
          // Flugeðla's drawing is her flier: held in its traced pose (it folds on her standing bones), it hops with her and twirls in
          // the sky's plane as she spins (a turn of the flier in depth squeezed it to a knot: the first stills)
          if (pose.sky) figures.follow(who, { live: who === 'flugedla' ? 0 : live, rise: pose.sky.rise ?? 0, turn: pose.sky.turn ?? 0 }); // (Task 16) a solo's own
          else if (who === 'flugedla') figures.follow(who, { live: 0, rise, turn: pose.spin });
          else figures.follow(who, { live, rise });
        } catch { /* not in the sky */ }
      }
    }
    // Kambeðla's plates run head to tail in her up
    const plates = c.plates;
    const kamb = poses.get('kambedla');
    if (plates?.setRow) {
      if (kamb && kamb.glow !== null && m?.move === 'up') {
        const w = m.weight;
        for (let r = 0; r < plates.rows; r++) {
          const wave = 0.5 + 0.5 * Math.cos(TAU * (kamb.glow - r / plates.rows / 2));
          plates.setRow(r, 1 - w + w * (0.45 + 0.55 * wave), { duration: 0 });
        }
        plateGlow = true;
      } else if (plateGlow) {
        plates.setAll(1, { duration: 0 });
        plateGlow = false;
      }
    }
    now = { beat, move: m?.move ?? null, weight: m?.weight ?? 0 };
  }

  /** The feet that came down last, as the floor lights them: the groove's taps each beat, a stamp's or a hop's landing each dance beat. */
  function feetAt(beat) {
    const out = [];
    const m = moveAt(beat);
    const doing = m && beat < m.to && m.weight > 0.5 ? m : null;
    for (const who of who8) {
      if (who === 'sloedla' || who === 'flugedla') continue; // on the stage, not the floor
      if (takers.has(who)) continue;
      const home = feetHome.get(who);
      const size = grooveSize(who, beat);
      const bounce = doing?.move === 'hop' && HOP_BOUNCE[who];
      if (doing && (doing.move === 'stomp' || doing.move === 'hop') && doing.n >= 1) {
        const k = Math.floor(doing.n);
        const age = (doing.n - k) * DB;
        if (doing.move === 'stomp') {
          const side = (k - 1) % 2 ? 'R' : 'L';
          out.push({ who, x: home[side][0], z: home[side][1], age, radius: FOOT_RADIUS[who] * 1.3, level: 1.3 });
        } else {
          out.push({ who, x: home.middle[0], z: home.middle[1], age, radius: (bounce ? 1.3 : 1) * HOP_RADIUS[who], level: 1.2 });
        }
        continue;
      }
      if (!(size > 0.05) || !(GROOVE[who].tap > 0)) continue;
      const k = Math.floor(beat);
      const side = (k - 1) % 2 ? 'R' : 'L';
      out.push({ who, x: home[side][0], z: home[side][1], age: fract(beat), radius: FOOT_RADIUS[who], level: size });
    }
    return out;
  }

  return {
    update,
    feetAt,
    /** Her body's middle in the world now (what a spin turns her round; a hop lifts it). */
    middle(who) { const rig = rigs.get(who); rig.actor.root.updateMatrixWorld(true); return rig.middle.clone().applyMatrix4(rig.actor.model.matrixWorld); },
    places: () => Object.fromEntries(who8.map(who => [who, [...c.stands.party[who].at]])),
    take(who, fn) { if (fn) takers.set(who, fn); else { takers.delete(who); held.delete(who); } },
    layer(fn) { layers.push(fn); return () => { const i = layers.indexOf(fn); if (i >= 0) layers.splice(i, 1); }; },
    /** The dance off (everyone in her clip alone, a still drawing) or on again: the benches' pairs. */
    setOn(value) { on = Boolean(value); },
    state() {
      return {
        beat: now?.beat ?? null, move: now?.move ?? null, weight: now?.weight ?? 0,
        poses: Object.fromEntries([...poses].map(([who, p]) => [who, { lift: p.lift, spin: p.spin, dip: p.dip, feet: { ...p.feet } }])),
      };
    },
    dispose() {
      for (const rig of rigs.values()) { rig.actor.setOverlay(null); rig.guard.release(); if (rig.actor.controlled) rig.actor.control(null); }
      for (const state of held.values()) state.hop?.stop(); // (Task 15b) Egill's hop clip off
      if (plateGlow) c.plates?.setAll?.(1, { duration: 0 });
      for (const who of who8) { try { c.figures?.follow?.(who, { live: 0, carry: false }); } catch { /* no drawing */ } }
      takers.clear();
      layers.length = 0;
    },
  };
}
/** m round a foot's step of light; a hop's landing under all of her. */
export const FOOT_RADIUS = { egill: 1.3, mosi: 2.4, thorsedla: 3.4, sloedla: 2.2, kambedla: 2.3, uggedla: 2.8, gramedla: 3.2, flugedla: 1.8 };
export const HOP_RADIUS = { egill: 2.7, mosi: 4.5, thorsedla: 5, sloedla: 4, kambedla: 4.2, uggedla: 4.5, gramedla: 5, flugedla: 3.5 };
