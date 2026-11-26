// Stjörnuhátíðin's band and its six solos (Task 16; spec 6 "Hljómsveitin" and "Sólóin"): each friend plays a part of the song on her
// own cues (the beat map's: hatid-score.js cuesIn), laid over the called dance (hatid-dance.js layer), and in her solo of 12 beats she
// is taken from the dance (take) for a trick of her own. Everything here is a pure function of the song's beat: the same beat gives
// the same pose and the same things wherever the song came from (a pause, `?t=`, the book's tile). Nothing is chapter 5's.
//
//   ROLES                      who plays what: { who: { part, cue } } (the cue kind she plays on, null: on the beat or the bar)
//   roleOf(who, beat, out)     her part's turns added to a pose (dance.js's shape), weighted by her entry, outside her solo
//   SOLO_TRICKS                { who: { beats: 12, moment (solo beat of the trick's own moment), shot } } in the map's order
//   trickOf(who, u, out, o)    her trick u (0..1) through her solo: its pose and its things (out.pose, out.fish, out.berries, out.at,
//                              out.prints, out.rows ...), o: { ground, reduced }
//   lapAt(b, o)                Flugeðla's lap, b solo beats in: { x, z, lift, heading, k (0 on her stand, 1 in the air) }
//   joltAt(beat)               the camera's tremble on Grameðla's stomps: { y (m), pitch (degrees) }
//   createBand(c)              { update(beat), place(), lights(beat), deck, state(), dispose() }
//
// A friend plays only once she has come into the song (entered, from a beat before: Grameðla's first stomp lands on her entry).
import * as THREE from 'three';
import { BEAT, END_BEAT, cuesIn, entered, soloAt } from './hatid-score.js';
import { SONG } from './hatid-song.js';
import { HEAD, partyStands } from './hatid-route.js';
import { BODY, grooveOf, grooveSize, moveAt } from './hatid-dance.js';
import { FRIENDS } from '../engine/scene/journal-data.js';
import { addPlateGlow } from '../engine/plate-glow.js';
import { createModel } from '../world/critters/models.js';
import { berryGeometry } from '../world/props/berries.js';
import { guestSeat } from './hatid-guests.js';

const BAR = SONG.beatsPerBar;
const TAU = Math.PI * 2;
const deg = Math.PI / 180;
const clamp01 = x => Math.min(1, Math.max(0, x));
const smooth = x => { const k = clamp01(x); return k * k * (3 - 2 * k); };
const fract = x => x - Math.floor(x);
const lerp = (a, b, k) => a + (b - a) * k;
const wrap180 = d => ((((d + 180) % 360) + 360) % 360) - 180;
const rnd = (i, k) => fract(Math.sin(i * 12.9898 + k * 78.233 + 0.5) * 43758.5453);
const STANDS = partyStands();
const GROUND = 1.2; // the top's flat (hatid-route.js GROUND), where no ground is given
const SOLO = Object.fromEntries(SONG.song.solos.map(s => [s.who, s]));
const ENTRY = Object.fromEntries(SONG.song.entries.map(e => [e.who, e.beat]));
const SIX = FRIENDS.map(f => f.key);

/** A pose's turn: [pitch, roll, yaw] degrees added to a bone (hatid-dance.js's convention: pitch + up, roll + to her right, yaw + to her left). */
function turn(out, bone, pitch = 0, roll = 0, yaw = 0, k = 1) {
  const t = (out.turns[bone] ??= [0, 0, 0]);
  t[0] += pitch * k;
  t[1] += roll * k;
  t[2] += yaw * k;
}
const chain = (out, bones, pitch, roll, yaw, k = 1) => { for (const b of bones) turn(out, b, pitch, roll, yaw, k); };
/** Up over its first half, held, slammed down over its last third, landing at 1 (as hatid-dance.js's stamp). */
function stampShape(u) {
  if (!(u > 0 && u < 1)) return 0;
  const up = smooth((u - 0.06) / 0.44);
  const down = u > 0.68 ? 1 - ((u - 0.68) / 0.32) ** 2 : 1;
  return up * down;
}
/** A giant stomp's lift: the foot high and heavy, down over the last 45 % (a gentler fall than the drum's, so a 1.35 m leg is not a blur). */
function giantShape(u) {
  if (!(u > 0 && u < 1)) return 0;
  const up = smooth((u - 0.04) / 0.4);
  const down = u > 0.55 ? 1 - ((u - 0.55) / 0.45) ** 1.5 : 1;
  return up * down;
}
/** World [x, z] of a point `ahead` m on her stand's heading and `right` m to her right. */
function onStand(who, ahead, right = 0) {
  const { at, heading } = STANDS[who];
  const fx = Math.cos(heading * deg), fz = Math.sin(heading * deg);
  return [at[0] + fx * ahead - fz * right, at[1] + fz * ahead + fx * right];
}
const bearing = (from, to) => Math.atan2(to[1] - from[1], to[0] - from[0]) / deg;
/** How far she plays: 0 a beat before her entry, 1 on it (Grameðla's first stomp lands on her entry). */
const playing = (who, beat) => (ENTRY[who] === undefined ? 1 : smooth(beat - ENTRY[who] + 1)) * (beat < END_BEAT ? 1 : 0);

// ---------------------------------------------------------------------------------------------
// The parts (spec 6): Grameðla the bass drum, Kambeðla the light show, Uggeðla's tail beats time and her sail changes hue a bar,
// Þórseðla the light tower, Flugeðla the DJ beside Slóeðla, Slóeðla the lead; Mosi and Egill dance in front (the dance's own).
export const ROLES = {
  gramedla: { part: 'drum', cue: 'stomp' },
  kambedla: { part: 'lights', cue: 'plate' },
  uggedla: { part: 'tail', cue: 'tail' },
  thorsedla: { part: 'tower', cue: null },
  flugedla: { part: 'dj', cue: 'scratch' },
  sloedla: { part: 'lead', cue: 'horn' },
  mosi: { part: 'front', cue: null },
  egill: { part: 'front', cue: null },
};
const CUES = Object.fromEntries(['stomp', 'plate', 'tail', 'scratch', 'horn'].map(k => [k, cuesIn(k, -Infinity, Infinity).map(c => c.beat)]));
/** The index of the first cue of `list` at or after `beat` (list.length if none). */
function nextIndex(list, beat) {
  let lo = 0, hi = list.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid] < beat) lo = mid + 1; else hi = mid; }
  return lo;
}
/** The cues of `list` within [beat - before, beat + after]: [{ i, t: beat - cue }]. */
function near(list, beat, before, after) {
  const out = [];
  for (let i = Math.max(0, nextIndex(list, beat - after) - 1); i < list.length && list[i] <= beat + before; i++) {
    const t = beat - list[i];
    if (t >= -before && t <= after) out.push({ i, t });
  }
  return out;
}

/**
 * Grameðla's bass drum: on every stomp cue a foot lands (right, left, ... by the cue's index), lifted DRUM.lift m over the gap before
 * it (two beats at most; the first's windup comes in with her, from a beat before her entry), and stamped down on the cue; outside a called stomp move (the move's own stamps land on
 * the same cues) and outside her solo (her giant stomps). `jolt` is the camera's tremble on each, unless motion is reduced.
 */
export const DRUM = { lift: 0.45, gap: 2, jolt: { y: 0.03, pitch: 0.22, decay: 7, hz: 5, lasts: 0.6, giant: 3.5 } };
function drumFeet(beat, out, k) {
  const list = CUES.stomp;
  const i = nextIndex(list, beat);
  if (i >= list.length) return;
  const cue = list[i];
  const gap = Math.min(DRUM.gap, i > 0 ? cue - list[i - 1] : DRUM.gap);
  const u = (beat - (cue - gap)) / gap;
  // (right on the even cues: so the drum's foot is the called stomp's, whose first stamp is the left, on both its calls, 92 and 280)
  out.feet[i % 2 ? 'L' : 'R'] += DRUM.lift * stampShape(u) * k;
  // her lean toward the lifted foot, and a jolt of her head as it lands
  turn(out, 'Hips', 0, (i % 2 ? -1 : 1) * 3 * stampShape(u), 0, k);
  const prev = list[i - 1] ?? -Infinity;
  const since = beat - prev;
  if (since >= 0 && since < 0.6) turn(out, 'Head', -7 * Math.exp(-6 * since) * smooth(since / 0.08), 0, 0, k);
}

/** Uggeðla's tail on each tail cue: a whip to one side (by the cue's index) peaking on the cue, back within a beat after. */
export const TAIL = { degrees: 7, before: 0.45, after: 1 };
function tailWhip(beat) {
  let w = 0;
  for (const { i, t } of near(CUES.tail, beat, TAIL.before, TAIL.after)) {
    const k = t < 0 ? smooth((t + TAIL.before) / TAIL.before) : 1 - smooth(t / TAIL.after);
    w += (i % 2 ? -1 : 1) * k;
  }
  return w;
}

/** Flugeðla's scratch on each scratch cue: her left wing reaches forward onto the deck before it and scrubs back and forth over it. */
export const SCRATCH = { reach: 48, fore: -25, scrub: 9, before: 0.35, hold: 0.7, after: 0.45 };
function scratchOf(beat) {
  const { startBeat: s0, beats } = SOLO.flugedla;
  for (const { t } of near(CUES.scratch, beat, SCRATCH.before, SCRATCH.hold + SCRATCH.after)) {
    if (beat - t >= s0 && beat - t < s0 + beats) continue; // her solo's scratches are her wingbeats in the air, not the deck
    if (t < 0) return { reach: smooth((t + SCRATCH.before) / SCRATCH.before), scrub: 0 };
    if (t < SCRATCH.hold) return { reach: 1, scrub: Math.sin(TAU * (t / SCRATCH.hold)) };
    return { reach: 1 - smooth((t - SCRATCH.hold) / SCRATCH.after), scrub: 0 };
  }
  return { reach: 0, scrub: 0 };
}

/**
 * Slóeðla's horn: on each horn cue her head goes up and her horn with it (HORN.up), turned to whoever she calls (HORN.calls: the
 * next to come into the song, or the child), held two beats and down over the next.
 */
export const HORN = { up: 30, neck: 10, turn: 38, before: 0.3, hold: 2, after: 1, calls: { 0: null, 23: 'gramedla', 47: 'thorsedla', 184: null, 217: 'sky', 252: null, 361: null } };
function hornOf(beat) {
  for (const { i, t } of near(CUES.horn, beat, HORN.before, HORN.hold + HORN.after)) {
    if (CUES.horn[i] >= SOLO.sloedla.startBeat && CUES.horn[i] < SOLO.sloedla.startBeat + SOLO.sloedla.beats) continue; // her solo plays it
    const k = t < 0 ? smooth((t + HORN.before) / HORN.before) : t < HORN.hold ? 1 : 1 - smooth((t - HORN.hold) / HORN.after);
    const to = HORN.calls[CUES.horn[i]] ?? null;
    let yaw = 0, up = 0;
    if (to === 'sky') up = 15;
    else if (to && STANDS[to]) {
      const rel = wrap180(bearing(STANDS.sloedla.at, STANDS[to].at) - STANDS.sloedla.heading);
      yaw = -Math.max(-HORN.turn, Math.min(HORN.turn, rel));
    }
    return { k, yaw, up };
  }
  return { k: 0, yaw: 0, up: 0 };
}

/** Þórseðla the light tower: her neck sways wider with the bar (TOWER.sway degrees a bone more than the groove's), the fireflies up it. */
export const TOWER = { sway: 3, swarm: 5 };

/** Her part over the dance's pose (`out`, dance.js's shape), `k` of it. */
export function roleOf(who, beat, out, k = 1) {
  if (!(k > 0)) return out;
  const p = playing(who, beat) * k;
  if (!(p > 0)) return out;
  const m = moveAt(beat);
  switch (who) {
    case 'gramedla': drumFeet(beat, out, p * (m?.move === 'stomp' ? 1 - m.weight : 1)); break;
    case 'uggedla': {
      const w = tailWhip(beat) * p;
      chain(out, BODY.uggedla.tail, 0, 0, TAIL.degrees * w);
      turn(out, 'Spine', 0, -2 * w);
      break;
    }
    case 'thorsedla': chain(out, BODY.thorsedla.neck, 0, 0, TOWER.sway * Math.sin((TAU * beat) / BAR), p); break;
    case 'flugedla': {
      const s = scratchOf(beat);
      const r = s.reach * p * (m ? 1 - m.weight : 1); // in a called move (wings up, a spin) the move wins
      turn(out, 'LeftUpperArm', SCRATCH.reach, 0, SCRATCH.scrub * s.scrub, r);
      turn(out, 'LeftForearm', SCRATCH.fore, 0, 0, r);
      turn(out, 'Head', -6, 0, 9, r); // she looks down at the deck, on her left
      const u = fract(beat);
      turn(out, 'Head', -10 * (0.5 + 0.5 * Math.cos(TAU * u)), 0, 0, p); // her head nodding on the beat
      break;
    }
    case 'sloedla': {
      const h = hornOf(beat);
      const kk = h.k * p;
      turn(out, 'Neck2', HORN.neck, 0, h.yaw * 0.3, kk);
      turn(out, 'Neck3', HORN.neck, 0, h.yaw * 0.3, kk);
      turn(out, 'Head', HORN.up + h.up, 0, h.yaw * 0.4, kk);
      break;
    }
    default: break;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Looking at the soloist: in a solo the others turn their heads to her (the dance's grooveSize already halves them), eased in and out
// over a beat at each end of each solo. Her head as she stands (HEAD); Flugeðla's where her lap has her.
export const LOOK = { yaw: 55, front: 70, past: 145, near: [3, 7], pitch: 25, head: 0.5 };
function soloHead(who, b, o) {
  if (who === 'flugedla') {
    const l = lapAt(b, o);
    return [l.x, (o.ground ?? GROUND) + HEAD.flugedla[1] + l.lift, l.z];
  }
  const [x, z] = onStand(who, HEAD[who][0]);
  return [x, (o.ground ?? GROUND) + HEAD[who][1] + (who === 'thorsedla' ? 3 : 0), z];
}
function lookOf(who, beat, out, o = {}) {
  const solo = soloAt(beat);
  if (!solo || solo.who === who) return out;
  const b = solo.u * SOLO[solo.who].beats;
  const w = smooth(b) * smooth(SOLO[solo.who].beats - b);
  if (!(w > 0)) return out;
  const [hx, hz] = onStand(who, HEAD[who][0]);
  const target = soloHead(solo.who, b, o);
  const rel = wrap180(bearing([hx, hz], [target[0], target[2]]) - STANDS[who].heading);
  const most = who === 'mosi' || who === 'egill' ? LOOK.front : LOOK.yaw;
  // a soloist right behind her (past LOOK.past degrees) she lets go of, all of it at 180 (so one going round behind never flips her head)
  const hold = (1 - smooth((Math.abs(rel) - LOOK.past) / (180 - LOOK.past)))
    * smooth((Math.hypot(target[0] - hx, target[2] - hz) - LOOK.near[0]) / (LOOK.near[1] - LOOK.near[0])); // nor one flying right over her
  const yaw = -Math.max(-most, Math.min(most, rel)) * w * hold;
  const dy = target[1] - ((o.ground ?? GROUND) + HEAD[who][1]);
  const pitch = Math.max(-LOOK.pitch, Math.min(LOOK.pitch, Math.atan2(dy, Math.hypot(target[0] - hx, target[2] - hz)) / deg)) * w * hold;
  const neck = BODY[who].neck;
  turn(out, 'Head', pitch * LOOK.head, 0, yaw * LOOK.head);
  chain(out, neck, (pitch * (1 - LOOK.head)) / neck.length, 0, (yaw * (1 - LOOK.head)) / neck.length);
  return out;
}

// ---------------------------------------------------------------------------------------------
// The solos (the map's: 12 beats each, in its order). Each trick's own moment (`moment`, solo beats in) is what its second shot
// holds (hatid-score.js CAMERA cuts to `trick_<who>` on the solo's seventh beat, b 6).
export const SOLO_TRICKS = {
  kambedla: { beats: 12, moment: 8, what: 'her plates through every hue, a row at a time, the lizards striking them' },
  uggedla: { beats: 12, moment: 9, what: 'five fish leap out of the sea of cloud; she snaps the fifth out of the air' },
  thorsedla: { beats: 12, moment: 7, what: 'her head up into the lights, red berries raining past it' },
  flugedla: { beats: 12, moment: 9, what: 'she flies a lap over the floor and lands back on her stand' },
  sloedla: { beats: 12, moment: 9, what: 'her horn solo, her crest lit note by note' },
  gramedla: { beats: 12, moment: 7, what: 'three giant stomps and a roar; three giant prints light in the floor' },
};
const HUES = Object.fromEntries(FRIENDS.map(({ key, colour }) => {
  const c = new THREE.Color().setStyle(colour, THREE.SRGBColorSpace);
  const hsl = {};
  c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL(hsl.h, 0.9, 0.58, THREE.SRGBColorSpace);
  return [key, `#${c.getHexString(THREE.SRGBColorSpace)}`];
}));
export const BAND_HUES = Object.freeze({ ...HUES });
/** A hue a bar, round the six (the sail's). */
const hueOfBar = (beat, shift = 0) => HUES[SIX[(((Math.floor(beat / BAR) + shift) % 6) + 6) % 6]];

// Flugeðla's lap (the brief: "a circle of 32 m"): up off her stand over two beats, once round a circle LAP.diameter m across that
// starts and ends on her stand and lies over the floor toward the middle, LAP.up m up, and down onto her stand by b 10.8. With less
// motion a smaller, lower circle at the same pace in beats.
export const LAP = { diameter: 32, up: 14, rise: [0, 2.2], round: [1, 10.4], down: [9.3, 10.8], dir: -1, reduced: { diameter: 12, up: 5 } };
const LAP_FROM = STANDS.flugedla;
export function lapAt(b, { reduced = false } = {}) {
  const d = reduced ? LAP.reduced.diameter : LAP.diameter;
  const up = reduced ? LAP.reduced.up : LAP.up;
  const [sx, sz] = LAP_FROM.at;
  const len = Math.hypot(sx, sz);
  const cx = sx - (sx / len) * (d / 2), cz = sz - (sz / len) * (d / 2);
  const t0 = Math.atan2(sz - cz, sx - cx);
  const g = smooth((b - LAP.round[0]) / (LAP.round[1] - LAP.round[0]));
  const phi = t0 + LAP.dir * TAU * g;
  const x = cx + Math.cos(phi) * (d / 2), z = cz + Math.sin(phi) * (d / 2);
  const lift = up * Math.min(smooth((b - LAP.rise[0]) / (LAP.rise[1] - LAP.rise[0])), 1 - smooth((b - LAP.down[0]) / (LAP.down[1] - LAP.down[0])));
  // her heading: the way she flies once she is under way, her stand's at each end
  const along = phi / deg + LAP.dir * 90;
  const h0 = LAP_FROM.heading;
  const start = h0 + 360 * Math.round((t0 / deg + LAP.dir * 90 - h0) / 360);
  const k = smooth((b - 0.7) / 1.3) * (1 - smooth((b - 9.4) / 1.4));
  const base = b < 6 ? start : start + LAP.dir * 360;
  const heading = lerp(base, along, k);
  const air = clamp01(lift / up);
  return { x, z, lift, heading, k, air, g, bank: -LAP.dir * 18 * k };
}

// Uggeðla's fish (the Fen's): five leap in arcs out of the sea of cloud behind her (her own side of the top), the fifth into her jaws
// on b 9, held there and gulped on b 11.3. Each [from b, to b, apex m]; the arcs along the rim, nearer her one after another.
export const FISH = {
  length: 2, sea: -6, rim: 58, arcs: [[0.5, 2.5, 10, -9], [1.8, 3.8, 12, 7], [3.1, 5.1, 13, -5], [4.4, 6.4, 14, 3], [6.2, 9, 8, 0]],
  span: 7, catch: 9, gulp: 11.3, hold: [5, 4.85, 0],
};
const UGG_DIR = Math.atan2(STANDS.uggedla.at[1], STANDS.uggedla.at[0]) / deg;
/** The jaws where she snaps (her head lunged up and forward: a first value, the real jaw takes the fish over its last half beat). */
const SNAP = (() => { const [x, z] = onStand('uggedla', HEAD.uggedla[0] + 0.9); return { x, z, up: HEAD.uggedla[1] + 1.4 }; })();
function fishOf(b, ground) {
  return FISH.arcs.map(([from, to, apex, off], k) => {
    const t = (b - from) / (to - from);
    if (k < 4 && !(t >= 0 && t <= 1)) return { shown: false };
    if (k === 4 && (t < 0 || b >= FISH.gulp)) return { shown: false };
    const a0 = (UGG_DIR + off - FISH.span / 2) * deg, a1 = (UGG_DIR + off + FISH.span / 2) * deg;
    const from3 = [Math.cos(a0) * FISH.rim, FISH.sea, Math.sin(a0) * FISH.rim];
    const to3 = k === 4 ? [SNAP.x, ground + SNAP.up, SNAP.z] : [Math.cos(a1) * FISH.rim, FISH.sea, Math.sin(a1) * FISH.rim];
    const tt = Math.min(1, t);
    const p = [0, 1, 2].map(i => lerp(from3[i], to3[i], tt));
    const peak = apex + Math.max(from3[1], to3[1]);
    p[1] += 4 * (peak - lerp(from3[1], to3[1], 0.5)) * tt * (1 - tt);
    // the way it flies (for its nose)
    const e = Math.min(1, tt + 0.02), q = [0, 1, 2].map(i => lerp(from3[i], to3[i], e));
    q[1] += 4 * (peak - lerp(from3[1], to3[1], 0.5)) * e * (1 - e);
    const heading = Math.atan2(q[2] - p[2], q[0] - p[0]) / deg;
    const pitch = Math.atan2(q[1] - p[1], Math.hypot(q[0] - p[0], q[2] - p[2])) / deg;
    return { shown: true, at: p, heading, pitch, caught: k === 4 && b >= FISH.catch, last: k === 4 ? smooth((b - (FISH.catch - 0.5)) / 0.5) : 0, k };
  });
}

// Þórseðla's berries: BERRIES.count red ones (the Fen's) rain from over her head as it goes up into the lights, past it to the ground,
// each falling over `fall` beats from its own beat in b 2.5 to 10.5, within `radius` m of where her head is at its highest.
export const BERRIES = { count: 60, from: 2.5, to: 10, fall: 2.4, over: 7, radius: [0.6, 3.2], size: 8 };
// Her neck's bones as she stands (her root's frame, metres: tests/characters.mjs's model), the chain her pose turns, for the
// fireflies up it and where her head is (a forward pass of the pose's turns of Hips, the five neck bones and Head)
const THOR_NECK = [['Hips', -2.18, 4.18], ['Neck', 3.26, 4.01], ['Neck2', 4.11, 4.67], ['Neck3', 4.9, 5.4], ['Neck4', 5.63, 6.19], ['Neck5', 6.4, 6.95], ['Head', 7.13, 7.73], ['tip', 7.9, 8.1]];
/** Her neck's points in her root's frame for a pose's turns (pitch about her side, yaw about up, in order from the hips). */
export function thorNeck(turns = {}, lift = 0) {
  const pts = THOR_NECK.map(([, x, y]) => new THREE.Vector3(x, y + lift, 0));
  const q = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0), SIDE = new THREE.Vector3(0, 0, 1);
  THOR_NECK.forEach(([name], i) => {
    const t = turns[name];
    if (!t || name === 'tip') return;
    qa.setFromAxisAngle(UP, t[2] * deg);
    qb.setFromAxisAngle(SIDE, t[0] * deg);
    q.copy(qa).multiply(qb);
    const pivot = pts[i].clone();
    for (let j = i + 1; j < pts.length; j++) pts[j].sub(pivot).applyQuaternion(q).add(pivot);
  });
  return pts.slice(1);
}
/** Her trick's neck up (turns over the groove), `k` of it. */
function thorUp(out, k) {
  turn(out, 'Hips', 8, 0, 0, k);
  [16, 13, 10, 7, 4].forEach((d, i) => turn(out, BODY.thorsedla.neck[i], d, 0, 0, k));
  turn(out, 'Head', -16, 0, 0, k);
  out.feet.L += 0.5 * k;
  out.feet.R += 0.5 * k;
}
const toWorld = (who, [x, y, z], ground) => {
  const { at, heading } = STANDS[who];
  const c = Math.cos(heading * deg), s = Math.sin(heading * deg);
  return [at[0] + c * x - s * z, ground + y, at[1] + s * x + c * z];
};
const BERRY_TOP = (() => { const o = { turns: {}, feet: { L: 0, R: 0 } }; thorUp(o, 1); const p = thorNeck(o.turns).at(-1); return [p.x, p.y, p.z]; })();
function berriesOf(b, ground) {
  const [cx, cy, cz] = toWorld('thorsedla', BERRY_TOP, ground);
  const out = [];
  for (let i = 0; i < BERRIES.count; i++) {
    const start = BERRIES.from + (BERRIES.to - BERRIES.from) * (i / BERRIES.count) + 0.3 * rnd(i, 1);
    const t = (b - start) / BERRIES.fall;
    if (!(t >= 0 && t <= 1)) { out.push(null); continue; }
    const a = rnd(i, 2) * TAU, r = lerp(BERRIES.radius[0], BERRIES.radius[1], Math.sqrt(rnd(i, 3)));
    const top = cy + BERRIES.over * (0.7 + 0.3 * rnd(i, 4));
    out.push([cx + Math.cos(a) * r, lerp(top, ground + 0.2, t * t), cz + Math.sin(a) * r, i]);
  }
  return out;
}

// Grameðla's giant prints: her three giant stomps (landing on the stomp cues at b 2, 4 and 6) each send a giant print of her foot onto
// the floor ahead of her (left, right, left, `ahead` m out, a heel and three toes each `size` across), lit as it lands and lit until
// her solo's end.
export const PRINTS = { at: [2, 4, 6], ahead: [6.5, 10.5, 14.5], side: 1.6, size: 4.2, giant: 1.35, roar: [6.4, 11.4] };
function printsOf(b) {
  const h = STANDS.gramedla.heading;
  return PRINTS.at.map((land, k) => {
    const side = k % 2 ? 1 : -1;
    const [x, z] = onStand('gramedla', PRINTS.ahead[k], side * PRINTS.side);
    const level = b >= land ? smooth((b - land) / 0.12) * (0.75 + 0.25 * Math.exp(-3 * (b - land))) * (1 - smooth((b - 11.2) / 0.8)) : 0;
    // a heel and three toes (as a Grameðla's three-toed foot), facing her way
    const discs = [[0, 0, 0.42], [0.62, -0.32, 0.22], [0.75, 0, 0.24], [0.62, 0.32, 0.22]].map(([a, r, s]) => {
      const fx = Math.cos(h * deg), fz = Math.sin(h * deg);
      const ax = a * PRINTS.size, rx = r * PRINTS.size;
      return [x + fx * ax - fz * rx, z + fz * ax + fx * rx, s * PRINTS.size];
    });
    return { at: [x, z], level, discs, age: b - land };
  });
}

/** Her trick u (0..1) through her solo: `out.pose` (taken from clear) and the trick's things. o: { ground, reduced }. */
export function trickOf(who, u, out = {}, o = {}) {
  const ground = o.ground ?? GROUND;
  const b = u * 12;
  const w = smooth(b / 0.6) * smooth((12 - b) / 0.8); // the trick in and out at the solo's ends
  out.b = b;
  out.w = w;
  switch (who) {
    case 'kambedla': {
      // a row at a time (every half beat), the next row takes the next hue: three at once, all six round in three beats
      const step = Math.floor(b * 2);
      out.rows = [0, 1, 2].map(r => {
        const n = step - ((step - r) % 3 + 3) % 3; // the last step that lit row r
        const age = (b * 2 - n) / 2; // beats since
        return { hue: HUES[SIX[((n % 6) + 6) % 6]], level: 0.55 + 0.45 * Math.exp(-5 * age) };
      });
      out.strike = { step, age: b * 2 - step };
      break;
    }
    case 'uggedla': out.fish = fishOf(b, ground); out.snap = SNAP; break;
    case 'thorsedla': out.berries = berriesOf(b, ground); out.top = toWorld('thorsedla', BERRY_TOP, ground); break;
    case 'flugedla': out.lap = lapAt(b, o); break;
    case 'sloedla': {
      // her crest lit note by note: a row a beat from its base to its tip, then all of it beating with the notes
      const rows = 6;
      out.crest = Array.from({ length: rows }, (_, r) => {
        const on = smooth((b - r - 0.2) / 0.3);
        const note = 0.6 + 0.4 * Math.exp(-5 * fract(b));
        return w * on * (b < rows ? 1 : note);
      });
      break;
    }
    case 'gramedla': out.prints = printsOf(b); break;
    default: break;
  }
  return out;
}

/** The camera's tremble on Grameðla's stomps (from her entry), bigger on her giant three; 0 with less motion. */
export function joltAt(beat, { reduced = false } = {}) {
  if (reduced || !(playing('gramedla', beat) > 0)) return { y: 0, pitch: 0 };
  const list = CUES.stomp;
  const i = nextIndex(list, beat + 1e-9) - 1;
  if (i < 0) return { y: 0, pitch: 0 };
  const a = (beat - list[i]) * BEAT; // seconds since it landed
  const J = DRUM.jolt;
  if (a >= J.lasts) return { y: 0, pitch: 0 };
  const g = SOLO.gramedla;
  const b = list[i] - g.startBeat;
  const giant = PRINTS.at.some(x => Math.abs(x - b) < 1e-6) ? J.giant : 1;
  const k = giant * Math.exp(-J.decay * a) * Math.sin(TAU * J.hz * a) * smooth(a / 0.03);
  return { y: J.y * k, pitch: J.pitch * k };
}

// ---------------------------------------------------------------------------------------------
// Her pose in her solo (a taker's: hatid-dance.js take), over the groove; the dance's own groove size at each end so she comes and
// goes without a jump.
function soloPose(who, beat, out, o) {
  const slot = SOLO[who];
  const b = beat - slot.startBeat;
  const t = trickOf(who, b / slot.beats, {}, o);
  const w = t.w;
  // the groove under it: the dance's size at her solo's ends, a lively one through it
  const inner = who === 'flugedla' ? 0 : 0.7;
  const size = b < slot.beats / 2 ? lerp(grooveSize(who, slot.startBeat - 1e-3), inner, smooth(b / 0.6)) : lerp(grooveSize(who, slot.startBeat + slot.beats + 1e-3), inner, smooth((slot.beats - b) / 0.8));
  grooveOf(who, beat, out, size);
  const u = fract(beat);
  const sway = Math.sin((TAU * beat) / BAR);
  switch (who) {
    case 'kambedla':
      chain(out, BODY.kambedla.tail, -6, 0, 9 * Math.sin(TAU * beat / 2), w);
      turn(out, 'Head', 14, 0, 6 * sway, w);
      out.dip += 0.08 * (0.5 + 0.5 * Math.cos(TAU * u)) * w;
      break;
    case 'uggedla': {
      // watching the fish, then the lunge (b 8.3 to 9: up and forward, jaws open), the snap, held proud, the gulp
      const look = smooth((b - 1) / 1) * (1 - smooth((b - 8.2) / 0.3));
      turn(out, 'Head', 12 * look, 0, -10 * look * Math.sin(TAU * b / 6), w);
      const lunge = smooth((b - 8.1) / 0.8) * (1 - smooth((b - 10.6) / 1));
      turn(out, 'Neck', 18, 0, 0, lunge * w);
      turn(out, 'Head', 12, 0, 0, lunge * w);
      turn(out, 'Spine', 6, 0, 0, lunge * w);
      const open = smooth((b - 8.2) / 0.5) * (1 - smooth((b - 8.8) / 0.22));
      turn(out, 'Jaw', -32 * open, 0, 0, w);
      const gulp = Math.sin(Math.PI * clamp01((b - 11) / 0.6));
      turn(out, 'Head', -10 * gulp, 0, 0, w);
      // her tail on her cues goes on (the band's part, roleOf)
      break;
    }
    case 'thorsedla': {
      const up = smooth(b / 2.5) * (1 - smooth((b - 10.2) / 1.6));
      thorUp(out, up * w);
      turn(out, 'Head', 0, 0, 12 * Math.sin(TAU * b / 2) * up, w); // after the berries
      turn(out, 'Jaw', -14 * up, 0, 0, w);
      break;
    }
    case 'flugedla': {
      const l = t.lap;
      out.lift = l.lift;
      out.spin = STANDS.flugedla.heading - l.heading;
      out.offset = o.offset ? o.offset(l) : null;
      turn(out, 'Hips', 0, l.bank, 0, l.air);
      turn(out, 'Head', 8, 0, 0, l.air);
      out.sky = { rise: 2.5 * Math.sin(Math.PI * l.g), turn: 360 * l.g * -LAP.dir };
      break;
    }
    case 'sloedla': {
      const big = smooth((b - 10) / 0.6) * (1 - smooth((b - 11.4) / 0.5));
      turn(out, 'Neck2', 10 + 6 * big, 0, 0, w);
      turn(out, 'Neck3', 10 + 6 * big, 0, 0, w);
      turn(out, 'Head', 22 + 14 * big + 4 * Math.cos(TAU * u), 0, 14 * Math.sin(TAU * b / 4), w);
      chain(out, BODY.sloedla.tail, -4, 0, 6 * Math.sin(TAU * b / 4), w);
      break;
    }
    case 'gramedla': {
      // the windup's foot down on b 0 (the band's drum), then giant stomps right, left, right landing on b 2, 4, 6, then the roar
      for (let k = 0; k < 3; k++) {
        const land = PRINTS.at[k];
        const s = giantShape((b - (land - 2)) / 2);
        out.feet[k % 2 ? 'L' : 'R'] += PRINTS.giant * s * w;
        turn(out, 'Hips', 0, (k % 2 ? -1 : 1) * 6 * s, 0, w);
        const since = b - land;
        if (since >= 0 && since < 1) { turn(out, 'Head', -12 * Math.exp(-5 * since), 0, 0, w); out.dip += 0.25 * Math.exp(-6 * since) * smooth(since / 0.06) * w; }
      }
      // small stamps on the cues of the roar (she keeps the drum going)
      for (let cue = 7; cue < 12; cue++) {
        const s = stampShape(b - (cue - 1));
        out.feet[cue % 2 ? 'L' : 'R'] += 0.22 * s * w;
      }
      const roar = smooth((b - PRINTS.roar[0]) / 0.5) * (1 - smooth((b - PRINTS.roar[1]) / 0.5));
      turn(out, 'Neck', 10, 0, 0, roar * w);
      turn(out, 'Head', 22, 0, 0, roar * w);
      turn(out, 'Jaw', -34, 0, 0, roar * w);
      turn(out, 'LeftUpperArm', 50, 0, 0, roar * w);
      turn(out, 'RightUpperArm', 50, 0, 0, roar * w);
      break;
    }
    default: break;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The clips of a taken friend: her idle (as the dance plays it, from beat 0) and her trick's own, both timed and weighted by the beat.
function clipsOf(actor) {
  const mixer = actor.mixer;
  const action = name => { const clip = actor.clips.get(name); return clip ? mixer.clipAction(clip) : null; };
  const all = { idle: action('idle'), fly: action('fly'), roar: action('roar'), happy: action('happy') };
  const put = (a, weight, time) => {
    if (!a) return;
    if (!a.isRunning()) { a.reset(); a.play(); }
    a.enabled = true;
    a.setEffectiveTimeScale(1);
    a.setEffectiveWeight(weight);
    const d = a.getClip().duration;
    if (d > 0) a.time = ((time % d) + d) % d;
  };
  return {
    set(beat, weights) {
      const own = Object.values(weights).reduce((s, v) => s + v[0], 0);
      put(all.idle, Math.max(0, 1 - own), beat * BEAT);
      for (const [name, [w, time]] of Object.entries(weights)) put(all[name], w, time);
    },
    stop() { for (const a of Object.values(all)) a?.stop(); },
  };
}

// The glows made on her own skin, as Kambeðla's plates are (engine/plate-glow.js reads a row a vertex, `_platerow`): `rowOf(i, v,
// bone)` gives each vertex of her skin its row (0: off) from where it is in the bind pose and the bone that moves it most.
function addSkinGlow(actor, rowOf, colour) {
  const ATTR = '_platerow';
  let skin = null;
  actor.model.traverse(o => { if (!skin && o.isSkinnedMesh && /_body$/.test(o.name)) skin = o; });
  if (!skin) actor.model.traverse(o => { if (!skin && o.isSkinnedMesh) skin = o; });
  if (!skin) return null;
  const g = skin.geometry;
  const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
  const bones = skin.skeleton.bones;
  const rest = bones.map(b => b.getWorldPosition(new THREE.Vector3()).applyMatrix4(actor.root.matrixWorld.clone().invert()));
  const rows = new Float32Array(pos.count);
  const v = new THREE.Vector3();
  let lit = 0;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    let best = 0, bi = 0;
    for (let k = 0; k < 4; k++) { const wk = sw.getComponent(i, k); if (wk > best) { best = wk; bi = si.getComponent(i, k); } }
    rows[i] = rowOf(v, bones[bi].name, rest[bi]);
    if (rows[i] > 0) lit++;
  }
  const attribute = new THREE.BufferAttribute(rows, 1);
  const given = new Set();
  const give = geometry => { if (geometry && !geometry.attributes[ATTR]) { geometry.setAttribute(ATTR, attribute); given.add(geometry); } };
  give(g);
  const glow = addPlateGlow(actor, { colour, dull: 0 });
  glow.setPulse({ swing: 0 });
  return {
    glow, lit, skin,
    /** The level of detail her skin draws at now has the rows too (they share its vertices). */
    keep() { give(skin.geometry); },
    dispose() { glow.dispose(); for (const geometry of given) geometry.deleteAttribute(ATTR); given.clear(); },
  };
}
/** Uggeðla's sail: her skin more than SAIL.over m over the spine bone that moves it (bind pose), in SAIL.rows rows head to tail. */
export const SAIL = { over: 0.8, bones: ['Hips', 'Spine', 'Chest', 'Tail1', 'Neck'], from: 3.3, to: -3.3, rows: 6, level: 0.42, beat: 0.25, solo: 0.5 }; // (solo 0.8 washed her sail white in its close shots)
const sailRow = (v, bone, rest) => {
  if (!SAIL.bones.includes(bone) || v.y - rest.y <= SAIL.over) return 0;
  return 1 + Math.min(SAIL.rows - 1, Math.max(0, Math.floor(((SAIL.from - v.x) / (SAIL.from - SAIL.to)) * SAIL.rows)));
};
/** Slóeðla's crest: her head's skin over CREST.over m in the bind pose, in rows from its base (front) to its tip (back). */
export const CREST = { over: 3.15, front: 2.45, tip: 0.2, rows: 6 };
const crestRow = (v, bone) => {
  if (bone !== 'Head' || v.y <= CREST.over || v.x > CREST.front) return 0;
  return 1 + Math.min(CREST.rows - 1, Math.max(0, Math.floor(((CREST.front - v.x) / (CREST.front - CREST.tip)) * CREST.rows)));
};

// Kambeðla's plates, the light show: between cues at `base`, on each plate cue a run from her head to her tail (a row each `step`
// beats), each row flashing to full; in an "up" the dance's own run is left.
export const LIGHTS = { base: 0.55, step: 0.14, decay: 6 };
// Her four lizards (four of the guests' six: hatid-guests.js ride), along her back beside her plates, each striking the row it sits by
// on its cue (a hop and a nod): [ahead m, right m, row] in her own frame, the height her back's (bind pose).
export const LIZARDS = { group: 'lizards', who: [0, 1, 2, 3], on: [[1.15, -0.5, 0, 2.5], [0.35, 0.5, 1, 2.8], [-0.45, -0.5, 1, 2.8], [-1.55, 0.5, 2, 2.35]], scale: 3, travel: [22, 32], hop: 0.35 };

// The deck Flugeðla scratches: a flat stone in front of her, at her left wing (the stage's tenth stone: hatid-stage.js).
export const DECK = { ahead: 1.75, right: -0.6, size: [1.5, 0.9, 1.1], yaw: 0 };

/**
 * The band on the party's friends. c: { world, dance (createDance's), stands.party, reduced, top?, plates?, guests (hatid.js's or the
 * top's: ride) }. update(beat) before the dance's (it takes the soloist for her trick and gives her back), its layer laid over
 * everyone in the dance's update, place() after the actors (the things that ride on bones: the fish in her jaws), lights(beat) for the
 * stage (Þórseðla's neck for the fireflies, Flugeðla's lap for her wind, the prints), state() for the tests.
 */
export function createBand(c, { reduced = Boolean(c.reduced) } = {}) {
  const { world, dance } = c;
  const heightAt = c.top?.heightAt ?? world.heightAt ?? (() => 0);
  const ground = who => heightAt(...STANDS[who].at);
  const actors = Object.fromEntries(Object.keys(ROLES).filter(w => c[w]?.raw).map(w => [w, c[w].raw]));
  const o = { reduced, ground: actors.flugedla ? ground('flugedla') : GROUND };
  const captured = new Map(); // who -> { turns, lift, dip, spin } as her pose was laid this frame
  // Flugeðla's lap: her middle on the lap's point, as her root's frame has it
  let flyMiddle = null;
  if (actors.flugedla) {
    const r = actors.flugedla.root;
    r.updateMatrixWorld(true);
    const m = dance.middle('flugedla');
    flyMiddle = r.worldToLocal(m.clone());
  }
  const lapOffset = l => {
    const r = actors.flugedla.root;
    const p = r.worldToLocal(new THREE.Vector3(l.x, r.position.y, l.z));
    return [p.x - flyMiddle.x, p.z - flyMiddle.z];
  };
  let beatNow = null;
  // the parts, over everyone's pose
  const unlayer = dance.layer((who, beat, pose) => {
    const solo = soloAt(beat);
    if (solo?.who !== who) {
      roleOf(who, beat, pose);
      lookOf(who, beat, pose, o);
    } else if (who === 'uggedla') roleOf(who, beat, pose); // her tail beats time through her solo too
    if (who === 'thorsedla' || who === 'kambedla') captured.set(who, { turns: structuredClone(pose.turns), lift: pose.lift, dip: pose.dip, spin: pose.spin });
  });
  // the solos: each taken for her twelve beats
  const clips = {};
  let taken = null;
  function takeFor(beat) {
    const solo = soloAt(beat);
    const who = solo && actors[solo.who] ? solo.who : null;
    if (who === taken) return;
    if (taken) { clips[taken]?.stop(); dance.take(taken, null); }
    taken = who;
    if (!who) return;
    clips[who] ??= clipsOf(actors[who]);
    const opts = who === 'flugedla' ? { ...o, offset: lapOffset } : o;
    dance.take(who, (b, out) => {
      soloPose(who, b, out, opts);
      const slot = SOLO[who];
      const sb = b - slot.startBeat;
      if (who === 'flugedla') {
        // her wings beat from her take-off and settle over the beat and a half after she is down (by the air they folded in 3 frames)
        const flap = smooth(sb / 1.2) * (1 - smooth((sb - 10.2) / 1.6));
        clips.flugedla.set(b, { fly: [0.95 * flap, fract(b) * actors.flugedla.clips.get('fly').duration] });
      } else if (who === 'gramedla') {
        const r = smooth((sb - PRINTS.roar[0]) / 0.5) * (1 - smooth((sb - PRINTS.roar[1]) / 0.5));
        clips.gramedla.set(b, { roar: [0.55 * r, (sb - PRINTS.roar[0]) * BEAT + 0.6] });
      } else clips[who].set(b, {});
    });
  }

  // the things of the solos (drawn only in their solo) and the glows
  const things = new THREE.Group();
  things.name = 'Band things';
  world.scene?.add(things);
  // the fish
  const fishModel = createModel('fish');
  const fishMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1, emissive: new THREE.Color('#5f9fc4'), emissiveIntensity: 0.85 }); // lit, to be seen against the night
  fishMaterial.name = 'band fish';
  // the model's swim is a morph (its own Mesh plays it); held still here, without it (an instanced mesh with morphs and no morph
  // texture breaks three's render: the first stills)
  const fishGeometry = fishModel.geometry.clone();
  fishGeometry.morphAttributes = {};
  fishGeometry.morphTargetsRelative = false;
  const fish = new THREE.InstancedMesh(fishGeometry, fishMaterial, FISH.arcs.length);
  fish.name = 'Band fish';
  fish.frustumCulled = false;
  fish.castShadow = false;
  fish.count = 0;
  things.add(fish);
  // the berries
  const berryMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, emissive: new THREE.Color('#5a0a10'), emissiveIntensity: 0.8 });
  berryMaterial.name = 'band berries';
  const berries = new THREE.InstancedMesh(berryGeometry(), berryMaterial, BERRIES.count);
  berries.name = 'Band berries';
  berries.frustumCulled = false;
  berries.castShadow = false;
  berries.count = 0;
  const red = new THREE.Color('#d8323a');
  for (let i = 0; i < BERRIES.count; i++) berries.setColorAt(i, red);
  things.add(berries);
  // the glows on Uggeðla's sail and Slóeðla's crest
  const sail = actors.uggedla ? addSkinGlow(actors.uggedla, sailRow, HUES.uggedla) : null;
  const crest = actors.sloedla ? addSkinGlow(actors.sloedla, crestRow, HUES.sloedla) : null;
  const effect = world.effects?.add({ label: 'hatid band', update: () => { if (gone) return false; place(); return true; } });
  let gone = false;

  // Kambeðla's lizards: her middle in her root's frame (her spin turns round it)
  let kambMiddle = null;
  if (actors.kambedla) { actors.kambedla.root.updateMatrixWorld(true); kambMiddle = actors.kambedla.root.worldToLocal(dance.middle('kambedla').clone()); }
  const guests = c.guests?.ride ? c.guests : c.top?.guests ?? null;
  const lizardAt = (k, time) => {
    const beat = beatNow;
    if (beat === null || !actors.kambedla) return null;
    const [ahead, right, row, up] = LIZARDS.on[k];
    // over to her back before she comes into the song (from their seats on the rim, hopping), on it until the song ends
    const travel = smooth((beat - LIZARDS.travel[0]) / (LIZARDS.travel[1] - LIZARDS.travel[0]));
    if (!(travel > 0) || beat >= END_BEAT) return null;
    const pose = captured.get('kambedla') ?? { lift: 0, dip: 0, spin: 0 };
    const a = (pose.spin ?? 0) * deg;
    const cx = kambMiddle.x, cz = kambMiddle.z;
    const px = ahead - cx, pz = right - cz;
    const lx = cx + Math.cos(a) * px + Math.sin(a) * pz, lz = cz - Math.sin(a) * px + Math.cos(a) * pz;
    const strike = strikeOf(beat, row, k);
    const p = actors.kambedla.root.localToWorld(new THREE.Vector3(lx, up + (pose.lift ?? 0) - (pose.dip ?? 0) + LIZARDS.hop * strike.hop, lz));
    const heading = STANDS.kambedla.heading - (pose.spin ?? 0) + (right > 0 ? -90 : 90); // facing her plates
    if (travel < 1) {
      // hopping over from her seat
      const seat = guestSeat(LIZARDS.group, LIZARDS.who[k]).at;
      if (seat) {
        const sx = seat[0], sz = seat[1], gy = heightAt(sx, sz);
        const hops = 8;
        const q = new THREE.Vector3(lerp(sx, p.x, travel), lerp(gy, p.y, travel) + Math.abs(Math.sin(travel * hops * Math.PI)) ** 1.5 * 1.2, lerp(sz, p.z, travel));
        return { at: q.toArray(), heading: bearing([sx, sz], [p.x, p.z]), pitch: 0, scale: LIZARDS.scale };
      }
    }
    return { at: p.toArray(), heading, pitch: -0.5 * strike.nod, scale: LIZARDS.scale };
  };
  function strikeOf(beat, row, k) {
    const solo = soloAt(beat);
    let since = Infinity;
    if (solo?.who === 'kambedla') {
      const t = trickOf('kambedla', solo.u, {}, o);
      // every step lights a row: its lizards strike it (the two on the middle row in turn)
      for (let n = t.strike.step; n > t.strike.step - 6 && n >= 0; n--) {
        if (n % 3 !== row) continue;
        if (row === 1 && Math.floor(n / 3) % 2 !== (k === 1 ? 0 : 1)) continue;
        since = (t.strike.step - n + t.strike.age) / 2;
        break;
      }
    } else {
      for (const { t } of near(CUES.plate, beat, 0.3, 1.2)) {
        const s = t - row * LIGHTS.step;
        if (s >= -0.25 && s < since) since = s;
      }
    }
    if (since === Infinity) return { hop: 0, nod: 0 };
    const before = since < 0 ? smooth((since + 0.25) / 0.25) : 0;
    const after = since >= 0 ? Math.exp(-7 * since) : 0;
    return { hop: before, nod: Math.max(before, after) };
  }
  guests?.ride?.((group, k, time) => (group === LIZARDS.group && LIZARDS.who.includes(k) ? lizardAt(LIZARDS.who.indexOf(k), time) : null));

  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), s4 = new THREE.Vector3(), p4 = new THREE.Vector3();
  // where the caught fish lies: across her snout (FISH.hold, her bind pose's model metres), carried by her Jaw bone as her skin is
  // (the Jaw bone's own origin is the hinge, under her eye: the first stills had the fish inside her head)
  let jawBone = null;
  const hold = new THREE.Vector3();
  if (actors.uggedla) {
    let skin = null;
    actors.uggedla.model.traverse(o => { if (o.isSkinnedMesh && !skin) skin = o; });
    const j = skin ? skin.skeleton.bones.findIndex(b => b.name === 'Jaw') : -1;
    if (j >= 0) {
      jawBone = skin.skeleton.bones[j];
      hold.fromArray(FISH.hold).applyMatrix4(skin.bindMatrix).applyMatrix4(skin.skeleton.boneInverses[j]);
    }
  }
  let now = null;

  /** The plates, the sail and the crest at the beat. */
  function glows(beat) {
    const solo = soloAt(beat);
    const plates = c.plates;
    const m = moveAt(beat);
    if (plates?.setRow && !(m?.move === 'up' && m.weight > 0)) { // every frame, so the same beat is the same plates
      if (solo?.who === 'kambedla') {
        const t = trickOf('kambedla', solo.u, {}, o);
        t.rows.forEach((r, i) => { if (i < plates.rows) { plates.setRowColour?.(i, r.hue); plates.setRow(i, r.level * t.w + 1 * (1 - t.w) * LIGHTS.base, { duration: 0 }); } });
      } else {
        for (let r = 0; r < plates.rows; r++) {
          plates.setRowColour?.(r, null);
          let level = LIGHTS.base;
          for (const { t } of near(CUES.plate, beat, 0, 1.5)) {
            const s = t - r * LIGHTS.step;
            if (s >= 0) level = Math.max(level, LIGHTS.base + (1 - LIGHTS.base) * Math.exp(-LIGHTS.decay * s));
          }
          const p = playing('kambedla', beat);
          plates.setRow(r, lerp(1, level, p), { duration: 0 });
        }
      }
    }
    if (sail) {
      const g = sail.glow;
      const p = playing('uggedla', beat);
      const mine = solo?.who === 'uggedla' ? smooth(solo.u * 12 / 0.6) * smooth((1 - solo.u) * 12 / 0.8) : 0;
      const pulse = Math.exp(-4 * fract(beat));
      const tail = Math.abs(tailWhip(beat));
      g.colour.set(mine > 0.5 ? HUES.uggedla : hueOfBar(beat));
      for (let r = 0; r < g.rows; r++) g.setRow(r, clamp01(p * (lerp(SAIL.level, SAIL.solo, mine) + SAIL.beat * pulse + 0.25 * tail)), { duration: 0 });
    }
    if (crest) {
      const g = crest.glow;
      const p = playing('sloedla', beat);
      const h = hornOf(beat);
      const t = solo?.who === 'sloedla' ? trickOf('sloedla', solo.u, {}, o) : null;
      for (let r = 0; r < g.rows; r++) g.setRow(r, clamp01(p * (0.12 + 0.6 * h.k) + (t ? t.crest[r] : 0)), { duration: 0 });
    }
  }

  /** The solos' things: drawn only in their solo. */
  function place() {
    const beat = beatNow;
    if (beat === null) return;
    sail?.keep();
    crest?.keep();
    glows(beat); // after the dance's own (its run of the plates in an up, and its plates back to full after one)
    const solo = soloAt(beat);
    // the fish
    let n = 0;
    if (solo?.who === 'uggedla') {
      const t = trickOf('uggedla', solo.u, {}, { ...o, ground: actors.uggedla ? ground('uggedla') : GROUND });
      const k = FISH.length / 0.3;
      for (const f of t.fish) {
        if (!f.shown) continue;
        p4.fromArray(f.at);
        e4.set(0, -f.heading * deg, f.pitch * deg, 'YXZ');
        if (f.k === 4 && jawBone && f.last > 0) {
          // the last half beat into her jaws, and in them till she gulps it
          jawBone.updateWorldMatrix(true, false);
          const jaw = hold.clone().applyMatrix4(jawBone.matrixWorld);
          p4.lerp(jaw, f.last);
          if (f.caught) e4.set(0, -(STANDS.uggedla.heading + 90) * deg, 0, 'YXZ');
        }
        q4.setFromEuler(e4);
        fish.setMatrixAt(n++, m4.compose(p4, q4, s4.setScalar(k)));
      }
    }
    fish.count = n;
    fish.instanceMatrix.needsUpdate = true;
    // the berries
    let m = 0;
    if (solo?.who === 'thorsedla') {
      const t = trickOf('thorsedla', solo.u, {}, { ...o, ground: actors.thorsedla ? ground('thorsedla') : GROUND });
      for (const bb of t.berries) {
        if (!bb) continue;
        q4.setFromEuler(e4.set(bb[3] + beat * 2, bb[3] * 1.3, 0));
        berries.setMatrixAt(m++, m4.compose(p4.set(bb[0], bb[1], bb[2]), q4, s4.setScalar(BERRIES.size)));
      }
    }
    berries.count = m;
    berries.instanceMatrix.needsUpdate = true;
  }

  return {
    update(beat) {
      beatNow = beat;
      takeFor(beat);
      now = { beat, taken };
    },
    place,
    /** For the stage: Þórseðla's neck (world points, for the fireflies up it), Flugeðla's lap (her wind) and Grameðla's prints. */
    lights(beat) {
      const out = { neck: null, lap: null, prints: null };
      const thor = captured.get('thorsedla');
      if (thor && actors.thorsedla) {
        const g = ground('thorsedla');
        out.neck = thorNeck(thor.turns, thor.lift - (thor.dip ?? 0)).map(p => toWorld('thorsedla', [p.x, p.y, p.z], g));
        out.tower = playing('thorsedla', beat);
      }
      const solo = soloAt(beat);
      if (solo?.who === 'flugedla') {
        const sb = solo.u * 12;
        const g = o.ground;
        const at = bb => { const l = lapAt(bb, o); return [l.x, g + l.lift + 2, l.z]; };
        out.lap = { at, b: sb, wind: smooth((sb - 1.5) / 1) * (1 - smooth((sb - 10.5) / 1.4)) };
      }
      if (solo?.who === 'gramedla') out.prints = printsOf(solo.u * 12);
      return out;
    },
    /** The deck (the stage draws it as its tenth stone): where, how big, how lit (her hue on a scratch). */
    deck: actors.flugedla ? (() => {
      const [x, z] = onStand('flugedla', DECK.ahead, DECK.right);
      return {
        at: [x, z], size: DECK.size, yaw: (STANDS.flugedla.heading + DECK.yaw) * deg,
        rise: beat => smooth(beat - ENTRY.flugedla + 1),
        glow: beat => 0.35 + 0.65 * scratchOf(beat).reach * playing('flugedla', beat),
        colour: HUES.flugedla,
      };
    })() : null,
    jolt: beat => joltAt(beat, { reduced }),
    state() {
      return { beat: now?.beat ?? null, taken: now?.taken ?? null, fish: fish.count, berries: berries.count, sail: sail?.lit ?? 0, crest: crest?.lit ?? 0 };
    },
    parts: { fish, berries, sail, crest },
    dispose() {
      gone = true;
      unlayer();
      if (taken) { clips[taken]?.stop(); dance.take(taken, null); }
      taken = null;
      guests?.ride?.(null);
      for (let r = 0; r < (c.plates?.rows ?? 0); r++) c.plates.setRowColour?.(r, null);
      c.plates?.setAll?.(1, { duration: 0 });
      sail?.dispose();
      crest?.dispose();
      things.removeFromParent();
      fish.dispose(); berries.dispose(); fishGeometry.dispose();
      fishMaterial.dispose(); berryMaterial.dispose(); berries.geometry.dispose();
      void effect;
    },
  };
}
