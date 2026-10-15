import * as THREE from 'three';

// Procedural clips for the biped rig made by bake-biped.js. Rest rotations are identity, so every
// bone turns about world-aligned axes: X forward, Y up, Z the character's right side. Angles are in
// degrees. Each clip loops: its functions repeat over the clip length.
//
//   idle    3.2 s  breathing, arms relaxed down from the A-pose, a slow look about
//   walk    0.95 s a calm child's walk in place (the actor moves the body at the matched speed)
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
function sampleClip(name, duration, pose, bones) {
  const frames = Math.round(duration * FPS);
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

export function authorClips({ bones }) {
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

  // The walk: each hip swings 24 degrees either way; a foot is down while its leg moves back.
  const STRIDE = 24;
  const walk = (t, w) => {
    const q = {};
    const legs = { Left: w * t, Right: w * t + Math.PI };
    for (const [side, phase] of Object.entries(legs)) {
      const forward = Math.cos(phase); // > 0 while the leg swings forward through the air
      q[`${side}UpperLeg`] = swing(STRIDE * Math.sin(phase));
      q[`${side}LowerLeg`] = knee(6 + 42 * Math.max(0, forward) ** 1.3);
      q[`${side}Foot`] = ankle(10 * forward);
      // The arm swings against the leg on its own side.
      q[`${side}UpperArm`] = chain(swing(-0.55 * STRIDE * Math.sin(phase)), armOut(side, ARMS_DOWN + 2));
      q[`${side}LowerArm`] = elbow(12 + 8 * Math.max(0, -Math.sin(phase)));
    }
    const hipsTurn = 4 * Math.sin(w * t);
    q.Hips = chain(turn(-hipsTurn), tilt(2.5 * Math.sin(w * t)));
    q.Spine = turn(0.5 * hipsTurn);
    q.Chest = chain(turn(0.6 * hipsTurn), lean(2));
    q.Head = turn(-0.4 * hipsTurn);
    return { q, hips: new THREE.Vector3(0, 0.01 * Math.cos(2 * w * t) - 0.006, 0) };
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
    sampleClip('walk', 0.95, walk, bones),
    sampleClip('wave', 2.4, waveWith('Right'), bones),
    sampleClip('waveLeft', 2.4, waveWith('Left'), bones),
    sampleClip('point', 2.0, point, bones),
    sampleClip('sit', 3.2, sit, bones),
    sampleClip('lifted', 1.6, lifted, bones),
  ];
}
