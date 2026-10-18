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
//   kink  2.4 s  a friendly nod: the chin lifts a little, the head dips twice, the second time less,
//                and the tail wags; the feet stay planted
//   happy 2.4 s  a happy bounce on the spot: two bobs on bent knees, the head up and rocking, the
//                little arms paddling and the tail swishing from side to side; the feet stay planted
//   wade  cycle  a slow walk through shallow water (see WADE below): lower and leaning forward, the
//                snout held low over the water, the feet lifted high out of it, the tail sweeping from
//                side to side for balance; the actor wades at its matched speed (walkTo, clip 'wade')
//
// The bake's `clips` option says which a character gets: Grameðla idle, walk and roar; Uggeðla idle,
// walk, kink, happy and wade.
//
// The legs are posed from where the feet go, by the two-bone IK the engine's footing uses
// (engine/ik.js): the thigh and shin reach the heel (the Foot bone) with the knee pointing forward,
// and the foot (metatarsus, toes and claws as one) is turned as the clip wants, flat on the ground or
// peeling up about the toes. A foot put where the clip has it gets the clip's own pose back.
//
// A sail on the back (Uggeðla's) rides Hips, Spine, Chest and the tail's root. Bending those against
// each other would stretch its top edge or fold it, so with a sail they bend a third as much and the
// neck, head and the tail's end do the moving; turns about the vertical bend the sail like a fin.

const D = THREE.MathUtils.degToRad;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
const rot = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis, D(deg));
// Compose rotations: the first argument is applied last (outermost).
const chain = (...qs) => qs.reduce((acc, q) => acc.multiply(q), new THREE.Quaternion());
const TAU = Math.PI * 2;
const smooth = s => { const t = THREE.MathUtils.clamp(s, 0, 1); return t * t * (3 - 2 * t); };
const ramp = (t, a, b) => smooth((t - a) / (b - a)); // 0 before a, 1 after b
// A smooth rise and fall between a and b (0 outside), 1 in the middle.
const bump = (u, a, b) => Math.sin(Math.PI * THREE.MathUtils.clamp((u - a) / (b - a), 0, 1)) ** 2;
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

// The wade: the walk's steps, shorter and slower, a foot down longer as it pushes through the water
// and lifted higher, out of it. The body sinks and leans forward, and the neck and head go down until
// the snout's tip is `snout` of the height above the ground (the water's surface a little below it).
export const WADE = {
  stride: 0.68, // of the walk's stride
  cycle: 1.5, // of the walk's cycle
  peel: 0.56,
  toeOff: 0.7,
  heelUp: 20,
  toesUp: 8,
  lift: 0.17,
  reach: 0.9,
  crouch: 0.08, // the hips sink this share of the hip's height
  lean: -10, // degrees the body leans forward
  neck: -42, // degrees the neck bends down at its root, all the way down,
  head: 26, // and the head turns back up against it, so the snout stays clear of the chest
  snout: 0.27, // of the height
  sweep: 9, // degrees the last tail bone sweeps to each side
};

export function authorClips({ bones, joints: J, toes, height = 1, snout = null, sail = false, tailRest = {}, walk: gait, clips: wanted = ['idle', 'walk', 'roar'] }) {
  const names = Object.keys(bones).filter(n => n !== 'root');
  const hasJaw = Boolean(bones.Jaw);
  const hipsRest = bones.Hips.position.clone();
  const report = {};
  // How much the back bends against itself: a sail on it wants it stiff.
  const back = sail ? 0.35 : 1;

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

  // Where a point carried by the head (model frame, bind pose) is in a pose; the bones go back to rest.
  const onHead = (point, { q, offset }) => {
    for (const n of names) bones[n].quaternion.copy(q[n] || new THREE.Quaternion());
    bones.Hips.position.copy(hipsRest).add(offset || V());
    bones.root.updateMatrixWorld(true);
    const p = point.clone().sub(J.Head).applyMatrix4(bones.Head.matrixWorld);
    for (const n of names) bones[n].quaternion.identity();
    bones.Hips.position.copy(hipsRest);
    bones.root.updateMatrixWorld(true);
    return p;
  };

  // --- idle ----------------------------------------------------------------------------------------
  const hipHeight = J.LeftThigh.y - J.LeftFoot.y; // the hip above the heel
  const idle = () => sample('idle', 4, 120, u => {
    const w = TAU * u;
    const q = {};
    const offset = V(0, 0.008 * hipHeight * Math.sin(w), 0);
    const hipsQ = rot(Z, 0.4 * Math.sin(w + 0.4));
    q.Hips = hipsQ;
    q.Spine = rot(Z, -0.6 * back * Math.sin(w));
    q.Chest = rot(Z, 1.0 * back * Math.sin(w - 0.3)); // breathing lifts the chest
    q.Neck = chain(rot(Y, 3 * Math.sin(w + 0.5)), rot(Z, -0.8 * Math.sin(w)));
    q.Head = chain(rot(Y, 4 * Math.sin(w + 0.9)), rot(X, 2 * Math.sin(2 * w)), rot(Z, 1 * Math.sin(w + 1.4)));
    if (hasJaw) q.Jaw = rot(Z, -0.6 * (0.5 + 0.5 * Math.sin(w - 0.6)));
    for (let k = 1; k <= 6; k++) q[`Tail${k}`] = tailBase(k, 2.2 * (0.5 + 0.18 * k) * Math.sin(w - 0.5 * k), -0.6 * (k <= 3 ? back : 1) * Math.sin(w - 0.4 * k));
    for (const side of ['Left', 'Right']) {
      const s = side === 'Left' ? 0 : 0.7;
      q[`${side}UpperArm`] = rot(Z, 3 * Math.sin(w + 1 + s));
      q[`${side}LowerArm`] = rot(Z, 4 * Math.sin(w + 1.5 + s));
      q[`${side}Hand`] = rot(Z, 3 * Math.sin(w + 2 + s));
    }
    planted(q, offset, hipsQ);
    return { q, offset };
  });

  // --- walking: the walk and the wade --------------------------------------------------------------
  // A walk cycle in place, S metres a cycle of CYCLE seconds. `w` says when a foot peels and leaves the
  // ground and how high it swings (WALK, WADE); `o` how the body moves (shares of the hip's height,
  // degrees); upper(u, b, q) poses the spine, neck, head and tail, arms(side, own, q) an arm by its
  // leg's own share of the cycle. Returns the cycle's frame(u), make() for the clip and its report.
  function walkCycle(name, S, CYCLE, keys, w, o, upper, arms) {
    const lift = w.lift * hipHeight;
    // The swing, over its own time s from 0 (toe-off) to 1 (landing): the heel's height above its rest
    // height and the foot's pitch (degrees, toes up), as [s, value, slope] keys.
    const swingLift = peeled => [[0, peeled, 0], [0.22, peeled + 0.2 * lift, 0], [0.55, lift, -2 * lift], [0.8, 0.4 * lift, -2 * lift], [0.92, 0.12 * lift, -1.5 * lift], [1, 0, -1.3 * lift]];
    const swingPitch = [[0, -w.heelUp, 0], [0.4, -3, 40], [0.7, w.toesUp, 0], [0.9, 0, 0], [1, 0, 0]];
    // The body: it bobs a little (highest over a planted foot), sways over the planted foot, turns its
    // hips with the swinging leg and rolls over the planted one; the spine, neck and head take most of
    // it back, so the head stays calm. The tail swings against the hips, a wave down its length.
    const crouch = o.crouch * hipHeight, bob = o.bob * hipHeight, sway = o.sway * hipHeight;
    const body = u => {
      const mid = w.peel / 2; // the middle of the left foot's flat stance
      const offset = V(0, -crouch + bob * Math.cos(2 * TAU * (u - mid)), -sway * Math.cos(TAU * (u - mid)));
      const yaw = o.yaw * Math.sin(TAU * (u - mid + 0.25));
      const roll = -o.roll * Math.cos(TAU * (u - mid));
      const pitch = o.pitch * Math.cos(2 * TAU * (u - mid) + 0.6);
      const turn = chain(rot(Y, yaw), rot(X, roll), rot(Z, pitch));
      return { offset, yaw, roll, pitch, mid, q: o.lean ? chain(rot(Z, o.lean), turn) : turn };
    };
    // A foot at share u of its own cycle: the heel (model frame, x along the walk) and the foot's turn.
    // While the heel peels it turns about the toes' contact, where the foot landed plus the toes' reach.
    let land = 0;
    const peelHeel = (L, pitch) => {
      const heel = L.toe.clone().applyAxisAngle(Z, D(pitch)).negate(); // toes to heel
      return heel.set(land + L.toe.x + heel.x, L.rest.y + L.toe.y + heel.y, L.rest.z);
    };
    function footAt(L, u) {
      if (u < w.peel) return { heel: V(land - S * u, L.rest.y, L.rest.z), pitch: 0 };
      if (u < w.toeOff) {
        const pitch = -w.heelUp * smoother((u - w.peel) / (w.toeOff - w.peel));
        const heel = peelHeel(L, pitch);
        return { heel: heel.setX(heel.x - S * u), pitch };
      }
      const s = (u - w.toeOff) / (1 - w.toeOff);
      const start = peelHeel(L, -w.heelUp);
      const x = start.x + (land + S - start.x) * smoother(s / w.reach);
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
    // reach balance. (Standing in mid-stride, from between the two heels.)
    const restX = (legs.Left.rest.x + legs.Right.rest.x) / 2;
    let best = Infinity, bestLand = 0;
    for (let x = restX - 0.1 * S; x < restX + 0.6 * S; x += 0.002 * S) {
      land = x;
      let most = 0;
      for (let i = 0; i < keys; i++) most = Math.max(most, reachAt(i / keys));
      if (most < best) { best = most; bestLand = x; }
    }
    land = bestLand;
    const frame = u => {
      const q = {};
      const b = body(u);
      q.Hips = b.q;
      upper(u, b, q);
      const position = hipsRest.clone().add(b.offset);
      for (const L of Object.values(legs)) {
        const own = (u + phase[L.side]) % 1;
        const foot = footAt(L, own);
        L.solve(position, b.q, foot.heel, rot(Z, foot.pitch), q);
        arms(L.side, own, q);
      }
      return { q, offset: b.offset };
    };
    return {
      frame,
      make: () => sample(name, CYCLE, keys, frame),
      report: {
        stride: S, cycle: CYCLE, speed: +(S / CYCLE).toFixed(4), land: +(land - restX).toFixed(3),
        reach: +best.toFixed(3), // the longest hip-to-heel reach, as a share of the straight leg
      },
    };
  }

  // --- walk ----------------------------------------------------------------------------------------
  const walk = () => {
    const cycle = walkCycle('walk', gait.stride, gait.cycle, 120, WALK, { crouch: 0.03, bob: 0.012, sway: 0.04, yaw: 3.5, roll: 2, pitch: 0.8 }, (u, b, q) => {
      q.Spine = chain(rot(Y, -0.35 * b.yaw), rot(X, -0.3 * b.roll));
      q.Chest = chain(rot(Y, -0.35 * b.yaw), rot(X, -0.3 * b.roll), rot(Z, -0.5 * b.pitch));
      q.Neck = chain(rot(Y, -0.2 * b.yaw), rot(X, -0.25 * b.roll), rot(Z, -0.4 * b.pitch + 1.2 * Math.cos(2 * TAU * (u - b.mid) + 0.9)));
      q.Head = chain(rot(Y, -0.1 * b.yaw), rot(X, -0.15 * b.roll), rot(Z, -1.4 * Math.cos(2 * TAU * (u - b.mid) + 1.3)));
      if (hasJaw) q.Jaw = rot(Z, -0.4);
      for (let k = 1; k <= 6; k++) {
        q[`Tail${k}`] = tailBase(k, -(0.9 + 0.25 * k) * Math.sin(TAU * (u - b.mid + 0.25) - 0.55 * k), 0.9 * (k <= 3 ? back : 1) * Math.cos(2 * TAU * (u - b.mid) - 0.5 * k));
      }
    }, (side, own, q) => {
      // The arms swing a little with the other leg.
      const arm = TAU * (own - 0.5);
      q[`${side}UpperArm`] = rot(Z, 4 * Math.sin(arm));
      q[`${side}LowerArm`] = rot(Z, 3 + 3 * Math.sin(arm - 0.6));
      q[`${side}Hand`] = rot(Z, 3 * Math.sin(arm - 1.2));
    });
    report.walk = cycle.report;
    return cycle.make();
  };

  // --- wade ----------------------------------------------------------------------------------------
  // Slow steps through shallow water: the body low and leaning forward, the neck and head lowered so
  // the snout is held low over the water and steady, while the body sways over the feet; the feet come
  // up high out of the water; the tail sweeps wide from side to side for balance, a wave down its
  // length, its first bones (under the sail) only a little; the arms held in, paddling a little.
  const wade = () => {
    let low = 0; // how far down the neck and head go (0 to 1, WADE.neck and WADE.head at 1), found below
    const cycle = walkCycle('wade', WADE.stride * gait.stride, WADE.cycle * gait.cycle, 150, WADE,
      { crouch: WADE.crouch, bob: 0.008, sway: 0.03, yaw: 2.5, roll: 1.5, pitch: 0.5, lean: WADE.lean }, (u, b, q) => {
        const step = 2 * TAU * (u - b.mid);
        q.Spine = chain(rot(Y, -0.3 * b.yaw), rot(X, -0.3 * back * b.roll));
        q.Chest = chain(rot(Y, -0.3 * b.yaw), rot(X, -0.3 * back * b.roll));
        q.Neck = chain(rot(Y, -0.3 * b.yaw), rot(X, -0.3 * b.roll), rot(Z, low * WADE.neck - 0.4 * b.pitch + 0.6 * Math.cos(step + 0.9)));
        q.Head = chain(rot(Y, -0.2 * b.yaw + 2 * Math.sin(TAU * (u - b.mid) + 1.2)), rot(X, -0.25 * b.roll), rot(Z, low * WADE.head - 0.7 * Math.cos(step + 1.3)));
        if (hasJaw) q.Jaw = rot(Z, -0.4);
        // The tail is held out level against the lean by its end bones (the first ones carry the sail,
        // which leans with the body), and sweeps: the wave travels down it.
        for (let k = 1; k <= 6; k++) {
          const sweep = WADE.sweep * (k <= 3 ? 0.12 + 0.08 * k : 0.25 * (k - 2)) * Math.sin(TAU * (u - b.mid + 0.25) - 0.5 * k);
          q[`Tail${k}`] = tailBase(k, -sweep, (k <= 3 ? 0 : -WADE.lean / 3) + 0.6 * (k <= 3 ? back : 1) * Math.cos(step - 0.5 * k));
        }
      }, (side, own, q) => {
        const arm = TAU * (own - 0.5);
        q[`${side}UpperArm`] = rot(Z, 8 + 3 * Math.sin(arm));
        q[`${side}LowerArm`] = rot(Z, 10 + 4 * Math.sin(arm - 0.6));
        q[`${side}Hand`] = rot(Z, 4 * Math.sin(arm - 1.2));
      });
    // Down until the snout's tip is WADE.snout of the height above the ground, mid-stance.
    const target = WADE.snout * height;
    let lo = 0, hi = 1;
    if (snout) {
      for (let i = 0; i < 30; i++) {
        low = (lo + hi) / 2;
        if (onHead(snout, cycle.frame(0.25)).y > target) lo = low; else hi = low;
      }
      low = (lo + hi) / 2;
    } else low = 0.6;
    const tips = [0, 0.25, 0.5, 0.75].map(u => onHead(snout || J.Head, cycle.frame(u)).y);
    report.wade = { ...cycle.report, low: +low.toFixed(3), snout: tips.map(y => +y.toFixed(2)) };
    return cycle.make();
  };

  // --- roar ----------------------------------------------------------------------------------------
  const ROAR = 3.6;
  const roar = () => sample('roar', ROAR, Math.round(ROAR * 30), (u, t) => {
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

  // --- kink: a friendly nod -------------------------------------------------------------------------
  // A small lift of the chin first, then two nods, the second smaller, and back to rest. The neck
  // takes part of each nod and the body dips a little with it; the tail gives a happy wag.
  const kink = () => sample('kink', 2.4, 72, u => {
    const q = {};
    const lift = bump(u, 0, 0.2);
    const nod = bump(u, 0.12, 0.5) + 0.6 * bump(u, 0.45, 0.8);
    const wag = bump(u, 0.1, 0.95);
    const offset = V(0, -0.006 * hipHeight * nod, 0);
    const hipsQ = rot(Z, -0.6 * nod);
    q.Hips = hipsQ;
    q.Spine = rot(Z, -0.4 * back * nod);
    q.Chest = rot(Z, -0.4 * back * nod);
    q.Neck = chain(rot(Y, 1.5 * Math.sin(TAU * u) * wag), rot(Z, 3 * lift - 7 * nod));
    q.Head = chain(rot(Y, 2.5 * Math.sin(TAU * u + 0.6) * wag), rot(X, 3 * bump(u, 0.05, 0.9)), rot(Z, 6 * lift - 13 * nod));
    if (hasJaw) q.Jaw = rot(Z, -0.5);
    for (let k = 1; k <= 6; k++) q[`Tail${k}`] = tailBase(k, (k <= 3 ? 1 : 2.5) * (0.5 + 0.3 * k) * wag * Math.sin(2 * TAU * u - 0.6 * k));
    for (const side of ['Left', 'Right']) {
      const s = side === 'Left' ? 0 : 0.8;
      q[`${side}UpperArm`] = rot(Z, 4 * wag * Math.sin(2 * TAU * u + s));
      q[`${side}LowerArm`] = rot(Z, 5 * wag * Math.sin(2 * TAU * u + s - 0.6));
      q[`${side}Hand`] = rot(Z, 4 * wag * Math.sin(2 * TAU * u + s - 1.2));
    }
    planted(q, offset, hipsQ);
    return { q, offset };
  });

  // --- happy: a happy bounce on the spot -------------------------------------------------------------
  // Two bobs on bent knees in a loop, the head held up and rocking from side to side, the little arms
  // paddling and the tail swishing wide.
  const happy = () => sample('happy', 2.4, 72, u => {
    const q = {};
    const bob = 0.5 - 0.5 * Math.cos(2 * TAU * u); // down twice a loop
    const offset = V(0, -0.035 * hipHeight * bob, 0);
    const hipsQ = rot(Z, -1.2 * Math.sin(2 * TAU * u));
    q.Hips = hipsQ;
    q.Spine = rot(X, 1.5 * back * Math.sin(TAU * u));
    q.Chest = chain(rot(X, 1.5 * back * Math.sin(TAU * u)), rot(Z, 0.8 * back * Math.sin(2 * TAU * u)));
    q.Neck = chain(rot(Y, 3 * Math.sin(TAU * u)), rot(Z, 5 + 3 * Math.sin(2 * TAU * u + 0.8)));
    q.Head = chain(rot(Y, 6 * Math.sin(TAU * u + 0.4)), rot(X, 7 * Math.sin(TAU * u + 0.9)), rot(Z, 4 + 4 * Math.sin(2 * TAU * u + 1.4)));
    if (hasJaw) q.Jaw = rot(Z, -2 - 2 * bob);
    for (let k = 1; k <= 6; k++) q[`Tail${k}`] = tailBase(k, (k <= 3 ? 1.5 + 0.8 * k : 3.5 * (k - 2)) * Math.sin(TAU * u - 0.55 * k), 1.5 * (k <= 3 ? back : 1) * bob);
    for (const side of ['Left', 'Right']) {
      const s = side === 'Left' ? 0 : Math.PI;
      q[`${side}UpperArm`] = rot(Z, 10 + 10 * Math.sin(2 * TAU * u + s));
      q[`${side}LowerArm`] = rot(Z, 12 + 12 * Math.sin(2 * TAU * u + s + 0.7));
      q[`${side}Hand`] = rot(Z, 10 * Math.sin(2 * TAU * u + s + 1.4));
    }
    planted(q, offset, hipsQ);
    return { q, offset };
  });

  const authors = { idle, walk, roar, kink, happy, wade };
  const clips = wanted.map(name => {
    if (!authors[name]) throw new Error(`no clip called ${name}`);
    return authors[name]();
  });
  report.stretch = Object.fromEntries(Object.values(legs).map(L => [L.side, +L.stretch.toFixed(3)]));

  return { clips, report };
}
