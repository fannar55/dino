import * as THREE from 'three';
import { twoBoneLeg } from '../../engine/ik.js';

// Procedural clips for the biped rig made by bake-biped.js. Rest rotations are identity, so every
// bone turns about world-aligned axes: X forward, Y up, Z the character's right side. Angles are in
// degrees. Each clip loops: its functions repeat over the clip length.
//
//   idle    3.2 s  breathing, arms relaxed down from the A-pose, a slow look about
//   walk    0.9 s  a calm child's walk in place at 0.55 m/s (the actor moves the body at the matched
//                  speed); the legs reach planted feet by two-bone IK (see WALK below)
//   wave    2.4 s  the right arm up, waving three times per loop (waveLeft: the same with the left)
//   point   2.0 s  the right arm pointing ahead, held
//   sit     3.2 s  riding pose for Mosi's saddle: thighs forward and apart, hands forward
//   lifted  1.6 s  lifted up: arms high, legs kicking gently

const FPS = 30;
const D = THREE.MathUtils.degToRad;
const AXIS = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const rot = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(AXIS[axis], D(deg));
// Compose rotations: the first argument is applied last (outermost).
const chain = (...qs) => qs.reduce((acc, q) => acc.multiply(q), new THREE.Quaternion());
const sign = side => (side === 'Left' ? 1 : -1);

// Building blocks. A limb hanging straight down swings forward (+X) with a positive Z rotation.
const swing = deg => rot('z', deg);
const armOut = (side, deg) => rot('x', sign(side) * deg); // raise the arm sideways (negative lowers it)
const legOut = (side, deg) => rot('x', sign(side) * deg); // spread the leg sideways
const lean = deg => rot('z', -deg); // bend the spine or head forward
const tilt = deg => rot('x', deg); // tip toward the right shoulder
const turn = deg => rot('y', deg); // turn toward the left (positive) or the right (negative)
const elbow = deg => rot('z', deg); // bend the forearm forward/up
const knee = deg => rot('z', -deg); // bend the knee (foot goes back)
const ankle = deg => rot('z', deg); // toes up

// Arms relaxed from the bind A-pose (about 38 degrees out) to about 16 degrees out.
const ARMS_DOWN = -22;
// Raising an arm: each armOut on the shoulder, upper arm and forearm adds to the angle from hanging
// straight down (bind upper arm 38-40, forearm 41). A child's arms are short against his head: even
// straight up the hand only reaches the brow, so a raised hand reads by keeping it out to the side.
// Past about 165 the forearm folds over the head, and a swing on a raised arm moves it backwards,
// so raised arms swing forward first (in the bind pose) and then lift.

// Every clip has a track for every bone (identity where its pose leaves the bone alone), so a bone
// one clip turns never keeps that turn when the next clip takes over.
function sampleClip(name, duration, pose, bones, fps = FPS) {
  const frames = Math.round(duration * fps);
  const times = [];
  const quats = {};
  const hips = [];
  const identity = new THREE.Quaternion();
  const animated = Object.keys(bones).filter(n => n !== 'root');
  for (let i = 0; i <= frames; i++) {
    const t = (i / frames) * duration;
    times.push(t);
    const p = pose(t, (2 * Math.PI) / duration);
    for (const bone of animated) {
      const q = p.q[bone] || identity;
      (quats[bone] ||= []).push(q.x, q.y, q.z, q.w);
    }
    const lift = p.hips || new THREE.Vector3();
    hips.push(bones.Hips.position.x + lift.x, bones.Hips.position.y + lift.y, bones.Hips.position.z + lift.z);
  }
  const tracks = Object.entries(quats).map(([bone, values]) => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values));
  tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, hips));
  return new THREE.AnimationClip(name, duration, tracks);
}

// Legs by two-bone IK (engine/ik.js, the same the footing uses in a scene) ----------------------
// The walk is authored from where the feet go, not from joint angles: each leg reaches its foot from
// the hip, with the knee pointing along `forward`.
function legSolver(bones, side) {
  const hip = bones[`${side}UpperLeg`].position.clone(); // the hip joint, in the hips' frame
  const leg = twoBoneLeg(bones[`${side}LowerLeg`].position, bones[`${side}Foot`].position);
  return {
    length: leg.length,
    /** The hip joint (model frame) for the hips at `position`, turned `turn`. */
    hipAt: (position, turn) => hip.clone().applyQuaternion(turn).add(position),
    /** Local turns of thigh, shin and foot that put the ankle at `ankle` with the foot turned `foot`
     *  (both in the model frame), for the hips at `position` turned `turn`. */
    solve(position, turn, ankle, foot, forward = AXIS.x) {
      const toAnkle = ankle.clone().sub(hip.clone().applyQuaternion(turn).add(position));
      const hinge = toAnkle.clone().normalize().cross(forward);
      const knee = new THREE.Quaternion();
      const thighTurn = leg.reach(toAnkle, hinge, new THREE.Quaternion(), knee);
      return {
        thigh: turn.clone().invert().multiply(thighTurn),
        shin: knee,
        foot: thighTurn.multiply(knee).invert().multiply(foot),
      };
    },
  };
}

// A smooth step with no speed and no acceleration at either end.
const smoother = s => s * s * s * (10 + s * (6 * s - 15));
// Cubic Hermite through keys [s, value, slope per unit s].
function spline(keys, s) {
  let i = 0;
  while (i < keys.length - 2 && s > keys[i + 1][0]) i++;
  const [s0, p0, m0] = keys[i];
  const [s1, p1, m1] = keys[i + 1];
  const h = s1 - s0;
  const t = THREE.MathUtils.clamp((s - s0) / h, 0, 1);
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * h * m0 + (3 * t2 - 2 * t3) * p1 + (t3 - t2) * h * m1;
}

// The walk. Times are shares of the cycle from the foot's landing (the other foot lands half a cycle
// later). A foot lands flat and stays put while the body passes over it; just after the other foot
// has landed, its heel peels up about the toe, which stays put too; then it swings forward, toes up
// late in the swing, flattens, and comes straight down at the end. The hips are as high as the legs
// allow (the longest hip-to-ankle reach is `reach` of the straight leg, so the knee never locks),
// smoothed: the bob follows the stride.
export const WALK = {
  cycle: 0.8, // seconds per stride (two steps): 150 steps a minute, a small child's cadence
  speed: 0.55, // metres a second
  peel: 0.52, // the heel starts up (the other foot has landed at 0.5)
  toeOff: 0.64, // the toe leaves the ground
  heelUp: 22, // degrees of heel peel at toe-off
  toesUp: 8, // degrees, late in the swing
  reach: 0.995, // the longest hip-to-ankle reach, as a share of the straight leg
  hipsBlur: 0.03, // how much the hips' path is smoothed (a share of the cycle)
};
// The swing, over its own time s from 0 (toe-off) to 1 (landing): the ankle's height above its rest
// height (metres; `peeled` is its height at toe-off) and the foot's pitch (degrees, toes up), as
// [s, value, slope] keys. The foot covers the ground by SWING_REACH and comes straight down after.
const swingLift = peeled => [[0, peeled, 0], [0.22, peeled + 0.006, 0], [0.55, 0.03, -0.06], [0.8, 0.012, -0.06], [0.92, 0.0035, -0.045], [1, 0, -0.04]];
const swingPitch = heelUp => [[0, -heelUp, 0], [0.4, -4, 50], [0.7, WALK.toesUp, 0], [0.9, 0, 0], [1, 0, 0]];
const SWING_REACH = 0.95;

function walkGait({ bones, joints, soles }) {
  const S = WALK.speed * WALK.cycle; // stride: metres a foot moves forward per cycle
  const legs = Object.fromEntries(['Left', 'Right'].map(side => {
    const ankle = joints[`${side}Foot`];
    const toe = soles?.[side]?.toe ?? ankle.x + 0.12;
    return [side, {
      solver: legSolver(bones, side),
      rest: ankle.clone(),
      toe: new THREE.Vector3(toe - ankle.x, -ankle.y, 0), // the front of the sole, in the foot's frame
      offset: side === 'Left' ? 0 : 0.5,
    }];
  }));

  // The pelvis: it turns with the leading leg (the left hip is forward as the left foot lands), drops
  // on the side of the swinging leg and shifts over the planted foot.
  const pelvis = u => {
    const turn = -4 * Math.cos(2 * Math.PI * u); // degrees, positive turns left
    const roll = 2.5 * Math.sin(2 * Math.PI * u); // positive drops the right side
    const sway = -0.006 * Math.sin(2 * Math.PI * u); // metres toward the right
    return { turn, roll, sway, q: chain(rot('y', turn), rot('x', roll)) };
  };

  // A foot at share u of its own cycle: ankle position relative to the body (x along the walk) and
  // pitch (degrees, toes up). The body moves S per cycle; `land` is where the foot lands (body frame,
  // chosen below).
  let land = 0;
  // While the heel peels, the ankle turns about the toe's ground contact (where the foot landed,
  // plus the toe's reach; world frame, from where the body was at the landing).
  const peelAnkle = (L, pitch) => {
    const ankle = L.toe.clone().applyQuaternion(rot('z', pitch)).negate(); // toe to ankle
    return ankle.set(land + L.toe.x + ankle.x, ankle.y, L.rest.z);
  };
  function footAt(L, u) {
    if (u < WALK.peel) return { ankle: new THREE.Vector3(land - S * u, L.rest.y, L.rest.z), pitch: 0 };
    if (u < WALK.toeOff) {
      const pitch = -WALK.heelUp * smoother((u - WALK.peel) / (WALK.toeOff - WALK.peel));
      const ankle = peelAnkle(L, pitch);
      return { ankle: ankle.setX(ankle.x - S * u), pitch };
    }
    // The swing, from toe-off to the next landing, S further on.
    const s = (u - WALK.toeOff) / (1 - WALK.toeOff);
    const start = peelAnkle(L, -WALK.heelUp);
    const x = start.x + (land + S - start.x) * smoother(Math.min(1, s / SWING_REACH));
    const y = L.rest.y + spline(swingLift(start.y - L.rest.y), s);
    return { ankle: new THREE.Vector3(x - S * u, y, L.rest.z), pitch: spline(swingPitch(WALK.heelUp), s) };
  }

  // The hips' height: for each moment, the highest the hips can be with both ankles within reach,
  // then that curve blurred (a Gaussian over the loop, so no wiggles) and lowered until it fits.
  const hipsRest = bones.Hips.position;
  const allowedAt = u => {
    const p = pelvis(u);
    const hipsAt = new THREE.Vector3(hipsRest.x, 0, hipsRest.z + p.sway);
    let most = Infinity;
    for (const L of Object.values(legs)) {
      const { ankle } = footAt(L, (u + L.offset) % 1);
      const hip = L.solver.hipAt(hipsAt, p.q);
      const r2 = (ankle.x - hip.x) ** 2 + (ankle.z - hip.z) ** 2;
      const reach = WALK.reach * L.solver.length;
      most = Math.min(most, ankle.y + Math.sqrt(Math.max(0, reach * reach - r2)) - hip.y);
    }
    return most;
  };
  // The feet land where the hips' lowest point is highest: the front and back reach balance.
  const lowest = () => Math.min(...Array.from({ length: 120 }, (_, i) => allowedAt(i / 120)));
  let best = -Infinity;
  let bestLand = 0;
  for (let x = legs.Left.rest.x - 0.05; x < legs.Left.rest.x + 0.2; x += 0.001) {
    land = x;
    const h = lowest();
    if (h > best) { best = h; bestLand = x; }
  }
  land = bestLand;
  const SAMPLES = 360;
  const allowed = Array.from({ length: SAMPLES }, (_, i) => allowedAt(i / SAMPLES));
  const sigma = WALK.hipsBlur * SAMPLES;
  const kernel = Array.from({ length: Math.ceil(3 * sigma) * 2 + 1 }, (_, j) => Math.exp(-0.5 * ((j - Math.ceil(3 * sigma)) / sigma) ** 2));
  const weight = kernel.reduce((sum, w) => sum + w, 0);
  const blurred = allowed.map((_, i) => kernel.reduce((sum, w, j) => sum + w * allowed[(i + j - (kernel.length - 1) / 2 + SAMPLES) % SAMPLES], 0) / weight);
  const fit = Math.max(...blurred.map((h, i) => h - allowed[i])) + 0.0003;
  const curve = blurred.map(h => h - fit);
  const hipsY = u => {
    const f = (((u % 1) + 1) % 1) * SAMPLES;
    const i = Math.floor(f);
    return THREE.MathUtils.lerp(curve[i % SAMPLES], curve[(i + 1) % SAMPLES], f - i);
  };

  return { legs, pelvis, footAt, hipsY };
}

export function authorClips({ bones, joints, soles }) {
  const relaxedArms = (t, w, extra = {}) => ({
    LeftUpperArm: chain(swing(2), armOut('Left', ARMS_DOWN + 1.5 * Math.sin(w * t))),
    RightUpperArm: chain(swing(2), armOut('Right', ARMS_DOWN + 1.5 * Math.sin(w * t + 1))),
    LeftLowerArm: elbow(8),
    RightLowerArm: elbow(8),
    ...extra,
  });

  const idle = (t, w) => ({
    q: {
      Spine: lean(0.6 * Math.sin(w * t)),
      Chest: lean(-1.2 * Math.sin(w * t)),
      Neck: turn(2 * Math.sin(w * t)),
      Head: chain(turn(3 * Math.sin(w * t)), tilt(1.5 * Math.sin(2 * w * t))),
      ...relaxedArms(t, w),
    },
    hips: new THREE.Vector3(0, 0.002 * Math.sin(w * t), 0),
  });

  // The walk (WALK above): the legs reach the feet, the arms swing against the legs, the spine turns
  // a little against the pelvis and the head stays steady.
  const gait = walkGait({ bones, joints, soles });
  const walk = t => {
    const u = t / WALK.cycle; // the left foot lands at 0, the right at 0.5
    const q = {};
    const p = gait.pelvis(u);
    const hips = new THREE.Vector3(bones.Hips.position.x, gait.hipsY(u), bones.Hips.position.z + p.sway);
    for (const [side, L] of Object.entries(gait.legs)) {
      const own = (u + L.offset) % 1;
      const foot = gait.footAt(L, own);
      const leg = L.solver.solve(hips, p.q, foot.ankle, rot('z', foot.pitch));
      q[`${side}UpperLeg`] = leg.thigh;
      q[`${side}LowerLeg`] = leg.shin;
      q[`${side}Foot`] = leg.foot;
      // The arm swings forward as the other leg does, a little behind it.
      const arm = -18 * Math.cos(2 * Math.PI * (own - 0.04));
      q[`${side}UpperArm`] = chain(swing(arm), armOut(side, ARMS_DOWN + 2));
      q[`${side}LowerArm`] = elbow(12 + 12 * Math.max(0, arm / 18));
    }
    q.Hips = p.q;
    q.Spine = chain(turn(-0.6 * p.turn), tilt(-0.6 * p.roll), lean(2));
    q.Chest = chain(turn(-0.6 * p.turn), tilt(-0.3 * p.roll), lean(1));
    q.Head = chain(turn(0.2 * p.turn), tilt(-0.1 * p.roll), lean(-2));
    return { q, hips: hips.sub(bones.Hips.position) };
  };

  // Upper arm at about 115 degrees (elbow out at shoulder height), the forearm waving 138-182 about
  // the elbow so the hand stays out beside the head; the hand trails the forearm. The chest leans
  // away from the raised arm and the head tips toward it.
  const waveWith = side => (t, w) => {
    const m = side === 'Right' ? 1 : -1;
    return {
      q: {
        ...relaxedArms(t, w),
        [`${side}Shoulder`]: armOut(side, 10),
        [`${side}UpperArm`]: chain(armOut(side, 65), swing(12)),
        [`${side}LowerArm`]: armOut(side, 45 + 22 * Math.sin(3 * w * t)),
        [`${side}Hand`]: armOut(side, 10 * Math.sin(3 * w * t - 0.8)),
        Chest: tilt(-3 * m),
        Head: chain(tilt(4 * m), turn(-4 * m)),
      },
      hips: new THREE.Vector3(0, 0.002 * Math.sin(w * t), 0),
    };
  };

  const point = (t, w) => ({
    q: {
      ...relaxedArms(t, w),
      RightUpperArm: chain(swing(82), armOut('Right', -25)),
      RightLowerArm: elbow(4),
      Chest: turn(-6),
      Head: chain(turn(-8), lean(-3)),
    },
    hips: new THREE.Vector3(0, 0.002 * Math.sin(w * t), 0),
  });

  const sit = (t, w) => ({
    q: {
      LeftUpperLeg: chain(swing(80), legOut('Left', 28)),
      RightUpperLeg: chain(swing(80), legOut('Right', 28)),
      LeftLowerLeg: knee(85),
      RightLowerLeg: knee(85),
      LeftFoot: ankle(10),
      RightFoot: ankle(10),
      Spine: lean(4 + 0.6 * Math.sin(w * t)),
      Chest: lean(-1 * Math.sin(w * t)),
      Head: chain(turn(4 * Math.sin(w * t)), lean(-2)),
      LeftUpperArm: chain(swing(40), armOut('Left', -15)),
      RightUpperArm: chain(swing(40), armOut('Right', -15)),
      LeftLowerArm: elbow(50),
      RightLowerArm: elbow(50),
    },
    hips: new THREE.Vector3(0, 0, 0),
  });

  const lifted = (t, w) => {
    const q = {
      // Arms up in a V (upper arms about 150 degrees, forearms 162), clear of the head.
      LeftShoulder: armOut('Left', 8),
      RightShoulder: armOut('Right', 8),
      LeftUpperArm: chain(armOut('Left', 102 + 4 * Math.sin(w * t)), swing(8)),
      RightUpperArm: chain(armOut('Right', 102 + 4 * Math.sin(w * t + 0.5)), swing(8)),
      LeftLowerArm: armOut('Left', 12),
      RightLowerArm: armOut('Right', 12),
      Head: lean(-8),
      Chest: lean(-3),
    };
    for (const [side, phase] of [['Left', 0], ['Right', Math.PI]]) {
      q[`${side}UpperLeg`] = swing(10 + 12 * Math.sin(w * t + phase));
      q[`${side}LowerLeg`] = knee(25 + 15 * Math.sin(w * t + phase + 1));
      q[`${side}Foot`] = ankle(-10);
    }
    return { q, hips: new THREE.Vector3(0, 0, 0) };
  };

  return [
    sampleClip('idle', 3.2, idle, bones),
    sampleClip('walk', WALK.cycle, walk, bones, 120 / WALK.cycle), // 120 keys a cycle, as the actor samples it
    sampleClip('wave', 2.4, waveWith('Right'), bones),
    sampleClip('waveLeft', 2.4, waveWith('Left'), bones),
    sampleClip('point', 2.0, point, bones),
    sampleClip('sit', 3.2, sit, bones),
    sampleClip('lifted', 1.6, lifted, bones),
  ];
}
