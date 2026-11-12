// Grameðla kemur!'s timeline (step 2 of the spec: the motion between the approved key frames). Pure: for a second of the show it
// says where everything is, so a seek lands on the frame, the review page (?lykill=N) is the show stopped at its key's second, and
// tests/gramedla3d-keys.test.mjs checks that each key's second gives that key's row (keys.js) and that nothing goes further out
// than the owner's 4 %. The page (director.js) puts the actors and specks where this says.
//
// Places are the key table's: (u, v) in the stage's fixed 16:10 frame, k the depth as a share of the screen plane's D. Between two
// places a thing moves in (u, v, 1/k): even in the frame and even in parallax.
//
// Grameðla's moves need her solved poses (pose.js solves the keys' rows on the page): gramAt(t, rig) takes them as `rig`
// ({ '4a': { x, z, theta, turn, roll, pitch }, '4': ..., '5', '6', '7', '7b' }). Her feet do not slide while she walks: the walk
// clip's second follows the metres walked (GAIT.speed metres for each second of the clip, measured on the model).
import { KEYS, GROUPS, kOf } from './keys.js';

export const LENGTH = 84.8; // s: then the end card
export const FADE = { in: [0, 1.5], out: [83.6, 84.8] };
export const BEATS = [
  { n: 1, name: 'Kyrrð', from: 0, to: 8 },
  { n: 2, name: 'Dynkur', from: 8, to: 16 },
  { n: 3, name: 'Flugeðla', from: 16, to: 26 },
  { n: 4, name: 'Hún kemur', from: 26, to: 50 },
  { n: 5, name: 'Þefið', from: 50, to: 62 },
  { n: 6, name: 'Öskrið', from: 62, to: 68 },
  { n: 7, name: 'Fiðrildið', from: 68, to: LENGTH },
];

// Measured on the models (tools/gramedla-probe.mjs): her walk covers GAIT.speed m for each second of its clip with the feet planted
// (engine/actor.js measureGait); a foot comes down at the clip's 0 and 1.25 s; the roar's jaw is widest at 1.035 s of 3.6.
export const GAIT = { speed: 1.1193, cycle: 2.5, plants: [0, 1.25] };
export const ROAR = { widest: 1.035, length: 3.6 };
export const IDLE = 4; // s: her idle (breathing) clip
export const FLY = 1.4; // s: Flugeðla's flapping clip

// ---- the sound's cues (step 3 hangs the sound on these): seconds in the show. Her footfalls and Flugeðla's wing beats follow from
// the motion: cues(rig) adds them. ----
export const CUES = {
  thump: [8.4, 10.3], // the two thumps far up the lane (the trees shake)
  birdsUp: 10.5, // the flock bursts from the crowns
  hunKemur: 20.3, // Egill: "Hún kemur!"
  flugedlaUp: 22.3, // she lifts off and leaves
  mistStirs: 27.0, // as she walks through its thickest patch (z −32)
  blink: 48.9,
  sniff: [55.3, 56.8, 58.3], // her breath (the puffs)
  breathIn: 62.6,
  roar: 63.97,
  huff: 72.6, // the soft huff that lifts the butterfly
  bless: 79.2, // Egill: "Bless, Grameðla!"
  end: FADE.out[0],
};

// ---- helpers ----
const clamp01 = x => Math.min(1, Math.max(0, x));
export const smooth = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const lerp = (a, b, e) => a + (b - a) * e;
const span = (t, a, b) => smooth((t - a) / (b - a));
const mod = (x, m) => ((x % m) + m) % m;
/** Up over [a0, a1], down over [b0, b1]. */
export const bump = (t, a0, a1, b0, b1) => Math.min(span(t, a0, a1), 1 - span(t, b0, b1));
/** Between two frame places, e of the way (even in the frame and in parallax). */
export function between(p, q, e) {
  const ik = lerp(1 / p[2], 1 / q[2], e);
  return [lerp(p[0], q[0], e), lerp(p[1], q[1], e), 1 / ik];
}
/** A path through [t, u, v, k] points, eased into and out of each. */
function track(points) {
  return t => {
    if (t <= points[0][0]) return points[0].slice(1);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      if (t <= b[0]) return between(a.slice(1), b.slice(1), span(t, a[0], b[0]));
    }
    return points[points.length - 1].slice(1);
  };
}
const lerpAngle = (a, b, e) => a + ((((b - a) % 360) + 540) % 360 - 180) * e;
const key = id => KEYS.find(k => k.id === id);
/** A small hover round a place, nothing at second c (so a key's second has its place exactly), only within [a, b]. */
function hover(t, c, a, b, size = 1) {
  const w = bump(t, a, a + 0.7, b - 0.7, b) * size;
  return [0.014 * Math.sin(2.1 * (t - c)) * w, 0.009 * Math.sin(4.2 * (t - c)) * w];
}

// ================================================================================================================================
// The butterfly: out of the light to 2 % and back in (beat 1); back to her snout, lifted off it by the huff to 3.7 %, and away up
// the lane past her head (beat 7). mode: hidden | at (a frame place) | approach (from a place to her snout, e of the way) | snout
// (sitting on it) | lift (from her snout to a place).
const B1 = key('1').butterfly.at;
const B7b = key('7b').butterfly.at;
const BUTTERFLY_IN = track([[0, 0.64, 0.4, 3.6], [3.4, ...B1], [6.4, ...B1], [9.2, 0.56, 0.42, 3.8]]); // back into the light it came from
const BUTTERFLY_OUT = track([[73.6, ...B7b], [76.0, ...B7b], [76.9, 0.78, 0.4, 0.5], [77.8, 0.79, 0.22, 0.9], [79.4, 0.56, 0.4, 3.0], [80.6, 0.53, 0.42, 5]]); // round her head on our right, over her back and up the lane into the light, clear of the crowns
export const BUTTERFLY = { approachFrom: [0.6, -0.1, 1.35], approach: [69.4, 71.6], lift: [72.6, 73.6] };
export function butterflyAt(t) {
  if (t < 9.2) {
    const at = BUTTERFLY_IN(t);
    const [du, dv] = hover(t, key('1').time, 3.4, 6.4);
    return { mode: 'at', at: [at[0] + du, at[1] + dv, at[2]] };
  }
  if (t < BUTTERFLY.approach[0]) return { mode: 'hidden' };
  if (t < BUTTERFLY.approach[1]) return { mode: 'approach', from: BUTTERFLY.approachFrom, e: span(t, ...BUTTERFLY.approach) };
  if (t < BUTTERFLY.lift[0]) return { mode: 'snout' };
  if (t < BUTTERFLY.lift[1]) return { mode: 'lift', to: B7b, e: span(t, ...BUTTERFLY.lift) };
  if (t < 80.6) {
    const at = BUTTERFLY_OUT(t);
    const [du, dv] = hover(t, key('7b').time, 73.6, 76.0);
    return { mode: 'at', at: [at[0] + du, at[1] + dv, at[2]] };
  }
  return { mode: 'hidden' };
}

// ================================================================================================================================
// The flock: up out of the crowns far up the lane, at us, wheeling round the middle of the picture at 2 to 2.5 % (frame 2's ring,
// turning slowly about its middle), then back in and up over the crowns: back behind the screen before any of them reaches the top.
const RING = key('2').birds;
const RING_MID = [0.5, 0.42];
const WHEEL = 0.45; // rad/s
const WING_HZ = 2.6;
export const FLOCK = { from: 10.5, arrive: 12.4, leave: 14.6, back: 15.5, up: [15.3, 16.6] };
// each bird starts from the crowns in the same order round the middle as its place in the ring, so no two paths cross
let FLOCK_FROM = null;
const flockFrom = i => {
  FLOCK_FROM ??= RING.map((_, j) => { const [u, v] = ringAt(j, FLOCK.arrive).at; return [0.5 + (u - RING_MID[0]) * 0.6, 0.12 + (v - RING_MID[1]) * 0.3, 4.6]; });
  return FLOCK_FROM[i];
};
function ringAt(i, t) {
  const [u, v, k, yaw] = RING[i];
  const a = WHEEL * (t - key('2').time);
  const du = (u - RING_MID[0]) * 1.6, dv = v - RING_MID[1]; // turned in metres of the 16:10 frame, not in shares
  const ru = du * Math.cos(a) - dv * Math.sin(a), rv = du * Math.sin(a) + dv * Math.cos(a);
  return { at: [RING_MID[0] + ru / 1.6, RING_MID[1] + rv, k], yaw: yaw + (a * 180) / Math.PI };
}
export function birdsAt(t) {
  if (t < FLOCK.from || t > FLOCK.up[1]) return null;
  return RING.map((row, i) => {
    let at, yaw;
    const start = FLOCK.from + 0.08 * i;
    if (t < FLOCK.arrive) {
      // they burst off the tree and ease into the ring: well over a second from the screen plane to the ring
      const x = Math.min(1, Math.max(0, (t - start) / (FLOCK.arrive - start)));
      at = between(flockFrom(i), ringAt(i, FLOCK.arrive).at, 1 - (1 - x) ** 2);
      yaw = lerpAngle(90, ringAt(i, FLOCK.arrive).yaw, span(t, FLOCK.arrive - 0.5, FLOCK.arrive));
    } else if (t <= FLOCK.leave) {
      ({ at, yaw } = ringAt(i, t));
    } else {
      const last = ringAt(i, FLOCK.leave);
      const back = span(t, FLOCK.leave, FLOCK.back);
      const up = span(t, ...FLOCK.up);
      const k = 1 / lerp(1 / last.at[2], 0.6, back);
      at = [last.at[0] + (last.at[0] - RING_MID[0]) * 0.8 * back, lerp(last.at[1], -0.2, up), k];
      yaw = lerpAngle(last.yaw, 270, span(t, FLOCK.leave, FLOCK.leave + 0.6));
    }
    const wing = 0.5 + 0.5 * Math.sin(2 * Math.PI * WING_HZ * (t - key('2').time) + Math.asin(2 * row[4] - 1));
    return [at[0], at[1], at[2], yaw, wing];
  });
}

// ================================================================================================================================
// Flugeðla with Egill: from deep in the lane straight at us, flapping; she brakes with her wings up at the screen (frame 3: beak
// 1.5 % out), Egill points back; then back in and up and away. Her flapping clip slows to its first frame (wings up) as she
// brakes and starts again as she lifts.
const F3 = key('3').flugedla;
export const FLIGHT = { from: [0.47, 0.5, 6.0], start: 15.6, brake: [18.8, 19.6], hold: 22.3, gone: 25.4 };
const FLUG_OUT = track([[FLIGHT.hold, ...F3.beak], [23.6, 0.45, 0.36, 1.4], [FLIGHT.gone, 0.34, -0.75, 1.4]]);
function flyTime(t) {
  const [b0, b1] = FLIGHT.brake;
  if (t <= b1) {
    // the clip at its own pace, slowing evenly to a stop on its first frame at b1
    const back = t >= b0 ? (b1 - t) ** 2 / (2 * (b1 - b0)) : (b1 - b0) / 2 + (b0 - t);
    return mod(-back, FLY);
  }
  if (t <= FLIGHT.hold) return 0;
  const a = t - FLIGHT.hold, r = 0.6;
  return mod(a <= r ? (a * a) / (2 * r) : r / 2 + (a - r), FLY);
}
export function flugedlaAt(t) {
  if (t < FLIGHT.start || t > FLIGHT.gone) return null;
  const [b0, b1] = FLIGHT.brake;
  const beak = t <= b1 ? between(FLIGHT.from, F3.beak, span(t, FLIGHT.start, b1) ** 1.2) : FLUG_OUT(t);
  // while her wings spread widest in the brake she keeps to the middle (their span is nine tenths of the picture), and only then
  // slides to frame 3's place as they close
  if (t <= b1) beak[0] = lerp(beak[0], lerp(0.49, F3.beak[0], span(t, 18.65, b1)), span(t, 16.6, 17.6));
  const brake = span(t, b0, b1), leave = span(t, FLIGHT.hold, FLIGHT.hold + 1.1);
  const w = bump(t, 19.8, 20.3, 22.0, 22.5); // Egill's point
  return {
    beak, clip: F3.clip, at: flyTime(t),
    pitch: lerp(lerp(0, F3.pitch, brake), 35, leave),
    yaw: lerp(lerp(0, F3.yaw, span(t, b0 - 0.2, b1)), 0, span(t, FLIGHT.hold + 0.3, FLIGHT.hold + 1.3)),
    neck: lerp(F3.neck, 0, span(t, FLIGHT.hold, FLIGHT.hold + 0.9)) * brake,
    egill: { point: w > 0, weight: w, lean: F3.egill.lean, aim: F3.egill.aim },
    // out of the far mist, not out of nothing: faint for her first moments and in the haze's colours while far (k 6 is 39 m)
    seen: span(t, FLIGHT.start, FLIGHT.start + 0.9),
    haze: t <= b1 ? smooth((beak[2] - 2.2) / (FLIGHT.from[2] - 2.2)) : 0,
  };
}

// ================================================================================================================================
// Grameðla. Her root's place and how she leans (theta, turn, roll, pitch: pose.js's lean) apart, and the clips she is in:
// idle (breathing), walk (its second from the metres walked) and roar, each with a weight.
// Her walk in (the owner, 2026-11-12: she popped in; she must come small out of the far distance): from the lane's far end (her
// root 54 m from the lens, z −46), inside the morning mist, all the way to frame 4's spot, at 1.64 m/s (her walk clip at 1.46 times
// its pace; it was 2.2 and read as brisk), easing in and out over `ramp` s. She sets off while Flugeðla is still in front ("Hún
// kemur!" is said of her), hidden in the haze: HAZE says how she firms up out of it by her distance.
export const WALK_IN = { from: 19.0, to: 47.3, ramp: 2.5 };
// her depth from the lens (m): at `far` and beyond she is all mist colour (haze 1), at `gone` not drawn at all (seen 0), fully drawn
// from `seen` in, and in her own colours from `clear` in (frame 4a, 31 m, is clear of it)
export const HAZE = { gone: 54, seen: 43, far: 50, clear: 32 };
// at z −10 the lane runs between a cycad on her right and a broadleaf on her left, nearer together than her feet are wide: on her
// straight line her right foot went 0.7 m into the cycad's widest fronds, and 0.5 m to her left (+x) her left foot went as deep into
// the broadleaf's, so her line runs CYCAD.shift m to her left, between them (none at 4a or at 4), and both brush the tips of the
// fronds as she passes (they shudder at her steps). `along`: metres from frame 4's spot it comes in from, is full from and to, and is gone by
const CYCAD = { shift: 0.25, along: [14, 10, 4, 0.5] };
const CAMERA_Z = 8; // stage.js CAMERA's z: her depth is from it
// her other poses: her head straightening as she leaves, and where she stops at the end, short of the plants by the lane
// (between frames 5, 6 and 7 she steps back to frame 4's own pose and spot)
export function gramPoses(rig) {
  const p = { ...rig };
  const lean = (base, over) => ({ x: base.x, z: base.z, theta: 0, turn: 0, roll: 0, pitch: 0, ...over });
  p['4s'] = { ...rig['4'], roll: 0 }; // frame 4 without its head tilt (that comes and goes round its second alone)
  p.up = lean(rig['7b'], { theta: 0.62, pitch: -0.05 });
  p.exit = lean({ x: 0.1, z: -7.0 }, { theta: 0.3 }); // short of the cycad and the broadleaf that flank the lane at z −10
  return p;
}
const dist = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);
const lerpPose = (a, b, e) => ({ theta: lerp(a.theta, b.theta, e), turn: lerp(a.turn, b.turn, e), roll: lerp(a.roll ?? 0, b.roll ?? 0, e), pitch: lerp(a.pitch ?? 0, b.pitch ?? 0, e) });
// the walk in: speeding up over `ramp`, steady, slowing over `ramp` (metres walked by second t, for a speed of 1 m/s)
function walkProfile(t) {
  const { from, to, ramp: R } = WALK_IN;
  const T = to - from, x = Math.min(T, Math.max(0, t - from));
  if (x < R) return (x * x) / (2 * R);
  if (x <= T - R) return x - R / 2;
  return T - R - (T - x) ** 2 / (2 * R);
}
// root moves: [t0, t1, from, to, walk second at t0 (null: no stepping), +1 forward or -1 backing]
const STEPS = [
  [50.6, 54.6, '4s', '5', 0.6, 1],
  // between the things that come out she steps back to frame 4's spot (her snout at the screen plane) and rests there
  [59.0, 61.8, '5', '4s', 0.7, -1],
  [62.9, 65.0, '4s', '6', 0.7, 1],
  [66.4, 68.4, '6', '4s', 0.7, -1],
  [69.4, 71.4, '4s', '7', 0.7, 1],
  [72.6, 73.6, '7', '7b', null, 0],
  [76.6, 83.8, '7b', 'exit', 0.7, -1],
];
// and her lean between poses: [t0, t1, from, to]
const LEANS = [
  [50.6, 54.6, '4s', '5'],
  [59.0, 61.8, '5', '4s'],
  [62.9, 65.0, '4s', '6'],
  [66.4, 68.4, '6', '4s'],
  [69.4, 71.4, '4s', '7'],
  [72.6, 73.6, '7', '7b'],
  [77.2, 78.8, '7b', 'up'], // once the butterfly is past her head
  [78.8, 83.8, 'up', 'exit'],
];
// the roar: its clip from 0 so its widest jaw is at frame 6's second; [in, in, out, out] its weight
export const ROARING = { at: key('6').time - ROAR.widest, weight: [64.2, 64.7, 66.15, 66.55] };

function walkIn(t, poses) {
  const a = poses['4a'], b = poses['4'];
  const L1 = dist(a, b);
  const speed = L1 / (walkProfile(WALK_IN.to) - walkProfile(key('4a').time));
  const sAt4a = speed * walkProfile(key('4a').time);
  const s = speed * walkProfile(t);
  // the line from frame 4's spot through 4a's, that far beyond it where she starts
  const ux = (a.x - b.x) / L1, uz = (a.z - b.z) / L1;
  const along = L1 + sAt4a - s; // metres from frame 4's spot
  const [c0, c1, c2, c3] = CYCAD.along;
  const aside = CYCAD.shift * Math.min(smooth((c0 - along) / (c0 - c1)), smooth((along - c3) / (c2 - c3)));
  return { x: b.x + ux * along + aside, z: b.z + uz * along, walkTime: mod(key('4a').gram.at + (s - sAt4a) / GAIT.speed, GAIT.cycle), speed: speed * Math.max(0, walkProfile(t + 0.01) - walkProfile(t - 0.01)) / 0.02, start: { x: b.x + ux * (L1 + sAt4a), z: b.z + uz * (L1 + sAt4a) } };
}

/** Grameðla at second t: null before she is on the stage; else { x, z, theta, turn, roll, pitch, layers: [{ clip, time, weight }], speed }. */
export function gramAt(t, rig) {
  if (t < WALK_IN.from) return null;
  const poses = gramPoses(rig);
  // ---- her root ----
  let x, z, walk = null, speed = 0, seen = 1, haze = 0;
  if (t <= WALK_IN.to) {
    const w = walkIn(t, poses);
    ({ x, z } = w);
    speed = w.speed;
    const depth = CAMERA_Z - z;
    seen = smooth((HAZE.gone - depth) / (HAZE.gone - HAZE.seen));
    haze = smooth((depth - HAZE.clear) / (HAZE.far - HAZE.clear));
    walk = { time: w.walkTime, weight: 1 - span(t, WALK_IN.to - 0.7, WALK_IN.to + 0.1) };
  } else {
    let at = poses['4'];
    x = at.x; z = at.z;
    for (const [t0, t1, from, to, second, way] of STEPS) {
      if (t < t0) break;
      const a = poses[from], b = poses[to], d = dist(a, b), e = span(t, t0, t1);
      x = lerp(a.x, b.x, e); z = lerp(a.z, b.z, e);
      if (t <= t1 && second !== null) {
        speed = (d * 6 * clamp01((t - t0) / (t1 - t0)) * (1 - clamp01((t - t0) / (t1 - t0)))) / (t1 - t0);
        walk = { time: mod(second + (way * d * e) / GAIT.speed, GAIT.cycle), weight: bump(t, t0, t0 + 0.6, t1 - 0.6, t1) };
      }
    }
  }
  // ---- her lean ----
  let lean = t <= WALK_IN.to
    ? lerpPose({ theta: 0, turn: 0, roll: 0, pitch: 0 }, { ...poses['4'], roll: 0 }, span(t, 44.4, WALK_IN.to))
    : { ...poses['4'], roll: 0 };
  for (const [t0, t1, from, to] of LEANS) if (t >= t0) lean = lerpPose(poses[from], poses[to], span(t, t0, t1));
  // frame 4's head tilt, on its own: up and down again round its second
  if (t < 50) lean.roll = poses['4'].roll * bump(t, 47.0, 47.7, 48.6, 49.6);
  // the roar's first breath rears her head up: held down a little then, so it stays off the top edge (none left by frame 6)
  // her last stride into frame 5 would carry the snout a hair past 4 %: a hair less lean then
  lean.theta += 0.015 * bump(t, 53.0, 54.2, 56.2, 57.4);
  const rear = bump(t, 63.95, 64.25, 64.6, 64.95);
  if (rear > 0) { lean.pitch -= 0.25 * rear; lean.theta += 0.08 * rear; }
  // ---- her clips ----
  const roarW = bump(t, ...ROARING.weight);
  const walkW = walk ? walk.weight : 0;
  const layers = [];
  const idleW = Math.max(0, 1 - walkW - roarW);
  if (idleW > 0) layers.push({ clip: 'idle', time: idleTime(t), weight: idleW });
  if (walkW > 0) layers.push({ clip: 'walk', time: walk.time, weight: walkW });
  if (roarW > 0) layers.push({ clip: 'roar', time: Math.min(ROAR.length, Math.max(0, t - ROARING.at)), weight: roarW });
  return { x, z, ...lean, layers, speed, seen, haze };
}
// her idle's second: 0 at each of frames 4, 5, 7 and 7b (they were solved there), each held to its frame while her other clips
// carry her between them; between 7 and 7b one breath at twice the pace (the huff)
function idleTime(t) {
  if (t < 52.6) return mod(t - key('4').time, IDLE);
  // around frame 5 (her snout at 4 %, the limit) the breath swings to and fro about the frame's moment of it, never into the
  // part of the clip (its second 0.8–1.8) that pushes the snout 0.02 % further out
  if (t < 70.0) return mod(0.3 * Math.sin((2 * Math.PI * (t - key('5').time)) / IDLE), IDLE);
  if (t < key('7').time) return mod(t - key('7').time, IDLE);
  if (t < key('7b').time) return mod(2 * (t - key('7').time), IDLE);
  return mod(t - key('7b').time, IDLE);
}

// ================================================================================================================================
// The specks. Each group's points are the table's (keys.js, groupPoints); at each key's second they are at their places, and
// between they drift. alpha: how lit the group is (0: not drawn). The leaves and pollen of the thump fall (metres down, dy), the
// puffs of her breath come from her nostrils and sink away (each puff's own age, for its fade), the roar's blast streams out of her
// mouth to the table's places at frame 6's second and a little beyond (never past 4 %).
const KEY_TIMES = [...new Set(KEYS.map(k => k.time))].sort((a, b) => a - b);
/** 0 at every key's second, up to 1 between: how far the specks have drifted from their places. */
export function drift(t) {
  let a = -KEY_TIMES[0], b = KEY_TIMES[0];
  for (let i = 0; i < KEY_TIMES.length; i++) {
    if (t <= KEY_TIMES[i]) { b = KEY_TIMES[i]; a = i ? KEY_TIMES[i - 1] : -b; break; }
    a = KEY_TIMES[i]; b = a + 2 * (LENGTH - a);
  }
  return Math.sin((Math.PI * (t - a)) / (b - a)) ** 2;
}
export const PUFF = { cycle: 1.5, ages: [0.25, 0.75, 1.25], on: [55.0, 59.2] };
// the blast: out of her mouth and slowing, reach × (1 − e^(−(t − from)/tau)) of the way to the table's places, which it is at frame 6's second
export const BLAST = { from: ROARING.at, reach: 1.08 };
BLAST.tau = (key('6').time - BLAST.from) / Math.log(BLAST.reach / (BLAST.reach - 1));
const FALL = 0.35; // m/s

/** Which groups are drawn at second t, and how: { name: { alpha, ... } }. */
export function specksAt(t) {
  const on = {};
  on.motesFar = { alpha: 1 };
  const near = bump(t, 0.3, 1.5, 6.6, 8.0);
  if (near > 0) on.motesNear = { alpha: near };
  const fall = bump(t, 8.4, 9.0, 15.4, 16.4);
  if (fall > 0) on.leavesFar = on.pollenFar = { alpha: fall };
  // (her breath is no longer the table's puffs: vfx.js puffs it out of her nostrils at each sniff)
  if (t > BLAST.from && t < 67.6) {
    const a = bump(t, BLAST.from, BLAST.from + 0.2, 66.4, 67.6);
    on.blastMotes = on.blastPollen = on.blastLeaves = { alpha: a };
  }
  return on;
}
/** Where speck i of group `name` (its table place p) is at second t: { at: [u, v, k], dx, dy (m), age (puffs) }. */
export function speckAt(name, i, p, t) {
  const spec = GROUPS[name];
  if (name === 'puffs') {
    const age = mod(t - key('5').time + PUFF.ages[i], PUFF.cycle);
    // along the three places by age (each puff's place is one age), on past the last, back to the first's nostril before it
    const pts = spec.points, A = PUFF.ages;
    let at;
    if (age <= A[1]) at = between(pts[0], pts[1], (age - A[0]) / (A[1] - A[0]));
    else at = between(pts[1], pts[2], (age - A[1]) / (A[2] - A[1]));
    return { at, age };
  }
  if (spec.stream) {
    const s = BLAST.reach * (1 - Math.exp(-Math.max(0, t - BLAST.from) / BLAST.tau));
    const f = spec.stream.from;
    return { at: [f[0] + (p[0] - f[0]) * s, f[1] + (p[1] - f[1]) * s, f[2] + (p[2] - f[2]) * s] };
  }
  if (name === 'leavesFar' || name === 'pollenFar') {
    const k2 = key('2').time;
    const sway = (name === 'leavesFar' ? 0.35 : 0.15) * Math.sin(1.7 * (t - k2) + i);
    return { at: p, dy: -FALL * (t - k2), dx: sway - (name === 'leavesFar' ? 0.35 : 0.15) * Math.sin(i) };
  }
  const d = drift(t);
  return { at: [p[0] + 0.012 * d * Math.sin(0.37 * t + i * 1.7), p[1] + 0.01 * d * Math.cos(0.29 * t + i * 2.3), p[2]] };
}

// ================================================================================================================================
// The trees: bends laid over each other, each a spec (cast.js bendTrees: a shake of the far crowns, or bent away from the lane)
// at an amplitude (−1..1). Frame 2's shake and frame 6's bend are 1 at their seconds; nothing else then.
const SHAKE1 = { shake: 2.4, depth: [34, 50] };
const NEAR_STEP = [{ shake: 0.6, depth: [12, 26] }, { shake: 0.6, depth: [26, 40] }];
export const TREE_SPECS = { far: SHAKE1, thump: key('2').trees, blast: key('6').trees, step0: NEAR_STEP[0], step1: NEAR_STEP[1] };
const osc = (t, t0, hz) => Math.cos(2 * Math.PI * hz * (t - t0));
/** [{ name, amp }] at second t; `steps`: her footfalls in beat 4, [{ t, depth }] (cues(rig)). */
export function treesAt(t, steps = []) {
  const out = [];
  const a1 = bump(t, 8.4, 8.7, 8.9, 11.0) * osc(t, 8.7, 0.9);
  if (a1) out.push({ name: 'far', amp: a1 });
  const a2 = bump(t, 10.3, 10.6, 13.4, 15.4) * osc(t, key('2').time, 0.9);
  if (a2) out.push({ name: 'thump', amp: a2 });
  // (held still round frame 4a's second, which has the trees as built)
  // (held still round every key's second, which has the trees as built or as its row bends them)
  const still4a = Math.min(...KEY_TIMES.map(k => smooth(Math.abs(t - k) / 0.5)));
  for (const s of steps) {
    const x = (t - s.t) / 0.7;
    if (x <= 0 || x >= 1 || !still4a || s.depth > 42) continue; // (far up the lane the near trees do not feel her)
    const amp = (1 - x) ** 2 * Math.sin(2 * Math.PI * 2.2 * (t - s.t)) * still4a;
    out.push({ name: s.depth < 26 ? 'step0' : 'step1', amp });
  }
  // the blast: bent away as her jaw opens, held, and swinging back to rest
  const k6 = key('6').time;
  const a6 = t < k6 ? span(t, 64.2, k6) : t <= 65.7 ? 1 : (1 - span(t, 65.7, 68.0)) * osc(t, 65.7, 0.8);
  if (a6) out.push({ name: 'blast', amp: a6 });
  return out.filter(o => Math.abs(o.amp) > 1e-6);
}

// ================================================================================================================================
// The mist stirs as she comes (its cards' level and a slow sway): 1 and still but for that.
export function mistAt(t) {
  const e = bump(t, CUES.mistStirs, CUES.mistStirs + 1.5, 34.5, 38.5);
  return { level: 1 + 0.25 * e, sway: 0.8 * e * Math.sin(0.9 * (t - CUES.mistStirs)) };
}

// ================================================================================================================================
/** The cues with those the motion makes: her footfalls (beat 4 and her steps after, with the depth of each) and the wing beats. */
export function cues(rig) {
  const steps = [];
  let last = null;
  for (let t = WALK_IN.from; t <= LENGTH; t += 1 / 120) {
    const g = gramAt(t, rig);
    const walk = g?.layers.find(l => l.clip === 'walk');
    if (!walk || walk.weight < 0.3) { last = null; continue; }
    if (last !== null) {
      // a foot comes down when the clip's second passes its plant (backing, the clip runs backwards)
      const d = mod(walk.time - last + GAIT.cycle / 2, GAIT.cycle) - GAIT.cycle / 2;
      const [lo, hi] = d >= 0 ? [last, last + d] : [last + d, last];
      for (const plant of GAIT.plants) {
        for (let n = -1; n <= 1; n++) {
          const p = plant + n * GAIT.cycle;
          if (d !== 0 && p > lo && p <= hi) steps.push({ t: +t.toFixed(3), depth: +(8 - g.z).toFixed(2), foot: plant === 0 ? 'left' : 'right' });
        }
      }
    }
    last = walk.time;
  }
  const wings = [];
  let prev = null;
  for (let t = FLIGHT.start; t <= FLIGHT.gone; t += 1 / 120) {
    const f = flugedlaAt(t);
    if (prev !== null && f.at < prev - FLY / 2) wings.push(+t.toFixed(3));
    prev = f.at;
  }
  return { ...CUES, steps, wings };
}
