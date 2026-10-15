import * as THREE from 'three';
import { twoBoneLeg } from '../../engine/ik.js';

// Procedural clips for the tailed biped made by bake-tailed-biped.js. Rest rotations are identity, so
// every bone turns about the character's own axes: X forward, Y up, Z its right side. Angles are in
// degrees. Every clip has a track for every bone, so no turn is left behind when clips cross-fade.
//
//   idle  4.0 s  breathing, a slow look about, the tail swaying; the feet stay planted
//   walk  cycle  a calm walk in place (see WALK below); the actor moves the body at the matched speed
//   roar  3.6 s  a friendly roar: a little wind-up, the mouth wide open, a happy shake of the head,
//                tail up and arms wiggling, then a nod; the feet stay planted
//
// The legs are posed from where the feet go, by the two-bone IK the engine's footing uses
// (engine/ik.js): the thigh and shin reach the heel (the Foot bone) with the knee pointing forward,
// and the foot (metatarsus, toes and claws as one) is turned as the clip wants, flat on the ground or
// peeling up about the toes. A foot put where the clip has it gets the clip's own pose back.

const D = THREE.MathUtils.degToRad;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
const rot = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis, D(deg));
// Compose rotations: the first argument is applied last (outermost).
const chain = (...qs) => qs.reduce((acc, q) => acc.multiply(q), new THREE.Quaternion());
const TAU = Math.PI * 2;
const smooth = s => { const t = THREE.MathUtils.clamp(s, 0, 1); return t * t * (3 - 2 * t); };
const ramp = (t, a, b) => smooth((t - a) / (b - a)); // 0 before a, 1 after b
// A smooth step with no speed and no acceleration at either end.
const smoother = s => { const t = THREE.MathUtils.clamp(s, 0, 1); return t * t * t * (10 + t * (6 * t - 15)); };
// Cubic Hermite through keys [s, value, slope per unit s].
function spline(keys, s) {
  let i = 0;
  while (i < keys.length - 2 && s > keys[i + 1][0]) i++;
  const [s0, p0, m0] = keys[i];
  const [s1, p1, m1] = keys[i + 1];
  const h = s1 - s0;
  const t = THREE.MathUtils.clamp((s - s0) / h, 0, 1);
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * h * m0 + (3 * t2 - 2 * t3) * p1 + (t3 - t2) * h * m1;
}

// The walk. Shares of the cycle from the foot's landing (the other foot lands half a cycle later). A
// foot lands flat and stays put while the body passes over it; as the other foot lands its heel peels
// up about the toes, which stay put too; then it swings forward in an arc, toes up a little late in
// the swing, and comes down flat. Heights are shares of the hip's height above the heel.
export const WALK = {
  peel: 0.5, // the heel starts up
  toeOff: 0.62, // the toes leave the ground
  heelUp: 16, // degrees of heel peel at toe-off
  toesUp: 5, // degrees, late in the swing
  lift: 0.1, // the highest the heel rises in the swing
  reach: 0.95, // the swing has covered the ground by this share of it, then comes straight down
};

export function authorClips({ bones, joints: J, toes, tailRest = {}, walk: gait }) {
  const names = Object.keys(bones).filter(n => n !== 'root');
  const hasJaw = Boolean(bones.Jaw);
  const hipsRest = bones.Hips.position.clone();
  const report = {};

  // --- legs ----------------------------------------------------------------------------------------
  const legs = {};
  for (const side of ['Left', 'Right']) {
    const hip = bones[`${side}Thigh`].position.clone(); // the hip joint, in the hips' frame
    const ik = twoBoneLeg(bones[`${side}Shin`].position, bones[`${side}Foot`].position);
    const rest = J[`${side}Foot`].clone(); // the heel, model frame
    legs[side] = {
      side, ik, rest,
      toe: V(toes[side].x - rest.x, toes[side].y - rest.y, 0), // the toes' ground contact, in the foot's frame
      stretch: 0,
      /** The hip joint (model frame) for the hips at `position`, turned `turn`. */
      hipAt: (position, turn) => hip.clone().applyQuaternion(turn).add(position),
      /** Local turns of thigh, shin and foot into q: the heel at `heel`, the foot turned `foot` (model
       *  frame), for the hips at `position` turned `turn`. */
      solve(position, turn, heel, foot, q) {
        const toAnkle = heel.clone().sub(hip.clone().applyQuaternion(turn).add(position));
        this.stretch = Math.max(this.stretch, toAnkle.length() / ik.length);
        const hinge = toAnkle.clone().normalize().cross(X); // the knee points forward
        const knee = new THREE.Quaternion();
        const thighTurn = ik.reach(toAnkle, hinge, new THREE.Quaternion(), knee);
        q[`${side}Thigh`] = turn.clone().invert().multiply(thighTurn);
        q[`${side}Shin`] = knee;
        q[`${side}Foot`] = thighTurn.multiply(knee).invert().multiply(foot);
      },
    };
  }
  const flat = new THREE.Quaternion();
  const planted = (q, offset, hipsQ) => {
    const position = hipsRest.clone().add(offset);
    for (const L of Object.values(legs)) L.solve(position, hipsQ, L.rest, flat, q);
  };
  const tailBase = (k, extraYaw = 0, extraPitch = 0) => chain(rot(Y, (tailRest[`Tail${k}`] || 0) + extraYaw), rot(Z, extraPitch));

  // Samples pose(u, t) at keys + 1 times over the clip (u from 0 to 1), a track for every bone.
  function sample(name, duration, keys, pose) {
    const times = [];
    const quats = {};
    const hips = [];
    const identity = new THREE.Quaternion();
    for (let f = 0; f <= keys; f++) {
      const u = f / keys;
      const p = pose(u, u * duration);
      times.push(u * duration);
      for (const bone of names) {
        const q = p.q[bone] || identity;
        (quats[bone] ||= []).push(q.x, q.y, q.z, q.w);
      }
      const at = hipsRest.clone().add(p.offset || V());
      hips.push(at.x, at.y, at.z);
    }
    const tracks = names.map(bone => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, quats[bone]));
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, hips));
    return new THREE.AnimationClip(name, duration, tracks);
  }

  // --- idle ----------------------------------------------------------------------------------------
  const hipHeight = J.LeftThigh.y - J.LeftFoot.y; // the hip above the heel
  const idle = sample('idle', 4, 120, u => {
    const w = TAU * u;
    const q = {};
    const offset = V(0, 0.008 * hipHeight * Math.sin(w), 0);
    const hipsQ = rot(Z, 0.4 * Math.sin(w + 0.4));
    q.Hips = hipsQ;
    q.Spine = rot(Z, -0.6 * Math.sin(w));
    q.Chest = rot(Z, 1.0 * Math.sin(w - 0.3)); // breathing lifts the chest
    q.Neck = chain(rot(Y, 3 * Math.sin(w + 0.5)), rot(Z, -0.8 * Math.sin(w)));
    q.Head = chain(rot(Y, 4 * Math.sin(w + 0.9)), rot(X, 2 * Math.sin(2 * w)), rot(Z, 1 * Math.sin(w + 1.4)));
    if (hasJaw) q.Jaw = rot(Z, -0.6 * (0.5 + 0.5 * Math.sin(w - 0.6)));
    for (let k = 1; k <= 6; k++) q[`Tail${k}`] = tailBase(k, 2.2 * (0.5 + 0.18 * k) * Math.sin(w - 0.5 * k), -0.6 * Math.sin(w - 0.4 * k));
    for (const side of ['Left', 'Right']) {
      const s = side === 'Left' ? 0 : 0.7;
      q[`${side}UpperArm`] = rot(Z, 3 * Math.sin(w + 1 + s));
      q[`${side}LowerArm`] = rot(Z, 4 * Math.sin(w + 1.5 + s));
      q[`${side}Hand`] = rot(Z, 3 * Math.sin(w + 2 + s));
    }
    planted(q, offset, hipsQ);
    return { q, offset };
  });

  // --- walk ----------------------------------------------------------------------------------------
  const KEYS = 120; // keys per cycle
  const S = gait.stride, CYCLE = gait.cycle;
  const lift = WALK.lift * hipHeight;
  // The swing, over its own time s from 0 (toe-off) to 1 (landing): the heel's height above its rest
  // height and the foot's pitch (degrees, toes up), as [s, value, slope] keys.
  const swingLift = peeled => [[0, peeled, 0], [0.22, peeled + 0.2 * lift, 0], [0.55, lift, -2 * lift], [0.8, 0.4 * lift, -2 * lift], [0.92, 0.12 * lift, -1.5 * lift], [1, 0, -1.3 * lift]];
  const swingPitch = [[0, -WALK.heelUp, 0], [0.4, -3, 40], [0.7, WALK.toesUp, 0], [0.9, 0, 0], [1, 0, 0]];
  // The body: it bobs a little (highest over a planted foot), sways over the planted foot, turns its
  // hips with the swinging leg and rolls over the planted one; the spine, neck and head take most of
  // it back, so the head stays calm. The tail swings against the hips, a wave down its length.
  const crouch = 0.03 * hipHeight, bob = 0.012 * hipHeight, sway = 0.04 * hipHeight;
  const body = u => {
    const mid = WALK.peel / 2; // the middle of the left foot's flat stance
    const offset = V(0, -crouch + bob * Math.cos(2 * TAU * (u - mid)), -sway * Math.cos(TAU * (u - mid)));
    const yaw = 3.5 * Math.sin(TAU * (u - mid + 0.25));
    const roll = -2 * Math.cos(TAU * (u - mid));
    const pitch = 0.8 * Math.cos(2 * TAU * (u - mid) + 0.6);
    return { offset, yaw, roll, pitch, mid, q: chain(rot(Y, yaw), rot(X, roll), rot(Z, pitch)) };
  };
  // A foot at share u of its own cycle: the heel (model frame, x along the walk) and the foot's turn.
  // While the heel peels it turns about the toes' contact, where the foot landed plus the toes' reach.
  let land = 0;
  const peelHeel = (L, pitch) => {
    const heel = L.toe.clone().applyAxisAngle(Z, D(pitch)).negate(); // toes to heel
    return heel.set(land + L.toe.x + heel.x, L.rest.y + L.toe.y + heel.y, L.rest.z);
  };
  function footAt(L, u) {
    if (u < WALK.peel) return { heel: V(land - S * u, L.rest.y, L.rest.z), pitch: 0 };
    if (u < WALK.toeOff) {
      const pitch = -WALK.heelUp * smoother((u - WALK.peel) / (WALK.toeOff - WALK.peel));
      const heel = peelHeel(L, pitch);
      return { heel: heel.setX(heel.x - S * u), pitch };
    }
    const s = (u - WALK.toeOff) / (1 - WALK.toeOff);
    const start = peelHeel(L, -WALK.heelUp);
    const x = start.x + (land + S - start.x) * smoother(s / WALK.reach);
    const y = L.rest.y + spline(swingLift(start.y - L.rest.y), s);
    return { heel: V(x - S * u, y, L.rest.z), pitch: spline(swingPitch, s) };
  }
  const phase = { Left: 0, Right: 0.5 };
  const reachAt = u => {
    const b = body(u);
    const position = hipsRest.clone().add(b.offset);
    let most = 0;
    for (const L of Object.values(legs)) {
      const { heel } = footAt(L, (u + phase[L.side]) % 1);
      most = Math.max(most, heel.distanceTo(L.hipAt(position, b.q)) / L.ik.length);
    }
    return most;
  };
  // The feet land where the furthest reach of the legs over the cycle is least: the front and back
  // reach balance.
  let best = Infinity, bestLand = 0;
  for (let x = legs.Left.rest.x - 0.1 * S; x < legs.Left.rest.x + 0.6 * S; x += 0.002 * S) {
    land = x;
    let most = 0;
    for (let i = 0; i < KEYS; i++) most = Math.max(most, reachAt(i / KEYS));
    if (most < best) { best = most; bestLand = x; }
  }
  land = bestLand;
  const walk = sample('walk', CYCLE, KEYS, u => {
    const q = {};
    const b = body(u);
    q.Hips = b.q;
    q.Spine = chain(rot(Y, -0.35 * b.yaw), rot(X, -0.3 * b.roll));
    q.Chest = chain(rot(Y, -0.35 * b.yaw), rot(X, -0.3 * b.roll), rot(Z, -0.5 * b.pitch));
    q.Neck = chain(rot(Y, -0.2 * b.yaw), rot(X, -0.25 * b.roll), rot(Z, -0.4 * b.pitch + 1.2 * Math.cos(2 * TAU * (u - b.mid) + 0.9)));
    q.Head = chain(rot(Y, -0.1 * b.yaw), rot(X, -0.15 * b.roll), rot(Z, -1.4 * Math.cos(2 * TAU * (u - b.mid) + 1.3)));
    if (hasJaw) q.Jaw = rot(Z, -0.4);
    for (let k = 1; k <= 6; k++) {
      q[`Tail${k}`] = tailBase(k, -(0.9 + 0.25 * k) * Math.sin(TAU * (u - b.mid + 0.25) - 0.55 * k), 0.9 * Math.cos(2 * TAU * (u - b.mid) - 0.5 * k));
    }
    const position = hipsRest.clone().add(b.offset);
    for (const L of Object.values(legs)) {
      const own = (u + phase[L.side]) % 1;
      const foot = footAt(L, own);
      L.solve(position, b.q, foot.heel, rot(Z, foot.pitch), q);
      // The arms swing a little with the other leg.
      const arm = TAU * (own - 0.5);
      q[`${L.side}UpperArm`] = rot(Z, 4 * Math.sin(arm));
      q[`${L.side}LowerArm`] = rot(Z, 3 + 3 * Math.sin(arm - 0.6));
      q[`${L.side}Hand`] = rot(Z, 3 * Math.sin(arm - 1.2));
    }
    return { q, offset: b.offset };
  });
  report.walk = {
    stride: S, cycle: CYCLE, speed: +(S / CYCLE).toFixed(4), land: +(land - legs.Left.rest.x).toFixed(3),
    reach: +best.toFixed(3), // the longest hip-to-heel reach, as a share of the straight leg
  };

  // --- roar ----------------------------------------------------------------------------------------
  const ROAR = 3.6;
  const roar = sample('roar', ROAR, Math.round(ROAR * 30), (u, t) => {
    const q = {};
    const wind = ramp(t, 0, 0.6) * (1 - ramp(t, 0.6, 1.0)); // the wind-up
    const open = ramp(t, 0.72, 1.0) * (1 - ramp(t, 2.15, 2.6)); // the roar itself
    const nod = ramp(t, 2.4, 2.7) * (1 - ramp(t, 3.2, 3.6)); // happy nods at the end
    const shake = Math.sin(TAU * 2.6 * (t - 0.9)) * open;
    const offset = V(0.03 * hipHeight * open - 0.01 * hipHeight * wind, -0.03 * hipHeight * wind + 0.012 * hipHeight * open, 0);
    const hipsQ = rot(Z, 2.5 * wind - 2 * open);
    q.Hips = hipsQ;
    q.Spine = rot(Z, 1.5 * wind - 1.5 * open);
    q.Chest = rot(Z, 3 * wind - 1.5 * open);
    q.Neck = chain(rot(Y, 2 * shake), rot(Z, 7 * wind - 6 * open + 2 * nod * Math.sin(TAU * 2 * (t - 2.4))));
    q.Head = chain(rot(Y, 6 * shake), rot(X, 3 * shake), rot(Z, 6 * wind + 16 * open - 5 * nod * Math.sin(TAU * 2 * (t - 2.4))));
    if (hasJaw) q.Jaw = rot(Z, -26 * open - 2 * wind);
    for (let k = 1; k <= 6; k++) {
      const wag = 7 * open * Math.sin(TAU * 2 * t - 0.6 * k);
      q[`Tail${k}`] = tailBase(k, wag, -(3 + 0.6 * k) * open - 1.5 * wind);
    }
    for (const side of ['Left', 'Right']) {
      const s = side === 'Left' ? 0 : Math.PI;
      q[`${side}UpperArm`] = rot(Z, 14 * open + 8 * open * Math.sin(TAU * 3 * t + s) + 4 * wind);
      q[`${side}LowerArm`] = rot(Z, 18 * open + 6 * open * Math.sin(TAU * 3 * t + s + 0.8));
      q[`${side}Hand`] = rot(Z, 10 * open * Math.sin(TAU * 3 * t + s + 1.6));
    }
    planted(q, offset, hipsQ);
    return { q, offset };
  });
  report.stretch = Object.fromEntries(Object.values(legs).map(L => [L.side, +L.stretch.toFixed(3)]));

  return { clips: [idle, walk, roar], report };
}
