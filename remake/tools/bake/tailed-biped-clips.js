import * as THREE from 'three';

// Procedural clips for the tailed biped made by bake-tailed-biped.js. Rest rotations are identity, so
// every bone turns about the character's own axes: X forward, Y up, Z its right side. Angles are in
// degrees. Every clip has a track for every bone, so no turn is left behind when clips cross-fade.
//
//   idle  4.0 s  breathing, a slow look about, the tail swaying; the feet stay planted
//   walk  cycle  a calm walk in place. A planted foot sweeps back at exactly stride/cycle, lifts off
//                and sets down straight up and down, and swings forward in an arc, so it stays put
//                when the body moves at that speed (the actor measures it from the Foot bones).
//   roar  3.6 s  a friendly roar: a little wind-up, the mouth wide open, a happy shake of the head,
//                tail up and arms wiggling, then a nod; the feet stay planted
//
// The legs are posed by reaching: the Foot bone (the ball of the foot) is put where the clip wants
// it, the metatarsus turns about it (the heel lifts late in a step), and the thigh and shin bend at
// the knee to reach the heel, the knee pointing forward.

const D = THREE.MathUtils.degToRad;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
const rot = (axis, deg) => new THREE.Quaternion().setFromAxisAngle(axis, D(deg));
// Compose rotations: the first argument is applied last (outermost).
const chain = (...qs) => qs.reduce((acc, q) => acc.multiply(q), new THREE.Quaternion());
const TAU = Math.PI * 2;
const smooth = s => { const t = THREE.MathUtils.clamp(s, 0, 1); return t * t * (3 - 2 * t); };
const ramp = (t, a, b) => smooth((t - a) / (b - a)); // 0 before a, 1 after b

// A rotation that takes direction d0 to d1 and the axis h0 (as near as it can) to h1.
function frameRotation(d0, h0, d1, h1) {
  const basis = (d, h) => {
    const x = d.clone().normalize();
    const z = h.clone().addScaledVector(x, -h.dot(x)).normalize();
    return new THREE.Matrix4().makeBasis(x, z.clone().cross(x), z);
  };
  return new THREE.Quaternion().setFromRotationMatrix(basis(d1, h1).multiply(basis(d0, h0).transpose()));
}

export function authorClips({ bones, joints: J, toes, height, tailRest = {}, walk: gait }) {
  const names = Object.keys(bones).filter(n => n !== 'root');
  const hasJaw = Boolean(bones.Jaw);
  const hipHeight = J.LeftThigh.y;
  const report = {};

  // --- legs ----------------------------------------------------------------------------------------
  const legs = {};
  for (const side of ['Left', 'Right']) {
    const H0 = J[`${side}Thigh`], K0 = J[`${side}Shin`], A0 = J[`${side}Metatarsus`], B0 = J[`${side}Foot`], T0 = toes[side];
    const hinge = A0.clone().sub(K0).cross(K0.clone().sub(H0)).normalize(); // the knee's axis
    const toHeel = A0.clone().sub(H0);
    const pole = K0.clone().sub(H0).projectOnPlane(toHeel.clone().normalize()).normalize(); // where the knee points
    legs[side] = {
      H0, K0, A0, B0, T0, hinge, pole,
      thigh: K0.distanceTo(H0), shin: A0.distanceTo(K0),
      heelArm: A0.clone().sub(B0), // from the ball to the heel
      stretch: 0,
    };
  }
  const hipsRest = J.Hips;

  // Local rotations for one leg: the ball at `ball` (model frame), the heel lifted `heel` degrees
  // about the ball, the toes curled down `toe` degrees, the Hips moved by `offset` and turned `hipsQ`.
  function legPose(side, ball, heel, toe, offset, hipsQ, q) {
    const L = legs[side];
    const hip = L.H0.clone().sub(hipsRest).applyQuaternion(hipsQ).add(hipsRest).add(offset);
    const heelPos = L.heelArm.clone().applyAxisAngle(Z, -D(heel)).add(ball);
    const reach = heelPos.clone().sub(hip);
    let d = reach.length();
    const most = L.thigh + L.shin;
    L.stretch = Math.max(L.stretch, d / most);
    d = THREE.MathUtils.clamp(d, Math.abs(L.thigh - L.shin) + 1e-4, most - 1e-4);
    const u = reach.clone().normalize();
    const pole = L.pole.clone().applyQuaternion(hipsQ).projectOnPlane(u).normalize();
    const cos = (L.thigh * L.thigh + d * d - L.shin * L.shin) / (2 * L.thigh * d);
    const knee = hip.clone().addScaledVector(u, L.thigh * cos).addScaledVector(pole, L.thigh * Math.sqrt(Math.max(0, 1 - cos * cos)));
    const heelAt = hip.clone().addScaledVector(u, d);
    const hinge = heelAt.clone().sub(knee).cross(knee.clone().sub(hip)).normalize();
    const thighW = frameRotation(L.K0.clone().sub(L.H0), L.hinge, knee.clone().sub(hip), hinge);
    const shinW = frameRotation(L.A0.clone().sub(L.K0), L.hinge, heelAt.clone().sub(knee), hinge);
    const footTurn = rot(Z, -heel);
    const metaW = frameRotation(L.B0.clone().sub(L.A0), Z, ball.clone().sub(heelAt), Z.clone().applyQuaternion(footTurn));
    const toesW = rot(Z, -toe);
    q[`${side}Thigh`] = hipsQ.clone().invert().multiply(thighW);
    q[`${side}Shin`] = thighW.clone().invert().multiply(shinW);
    q[`${side}Metatarsus`] = shinW.clone().invert().multiply(metaW);
    q[`${side}Foot`] = metaW.clone().invert().multiply(toesW);
  }
  const planted = (q, offset, hipsQ) => {
    for (const side of ['Left', 'Right']) legPose(side, legs[side].B0.clone(), 0, 0, offset, hipsQ, q);
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
      const at = bones.Hips.position.clone().add(p.offset || V());
      hips.push(at.x, at.y, at.z);
    }
    const tracks = names.map(bone => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, quats[bone]));
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, hips));
    return new THREE.AnimationClip(name, duration, tracks);
  }

  // --- idle ----------------------------------------------------------------------------------------
  const idle = sample('idle', 4, 120, u => {
    const w = TAU * u;
    const q = {};
    const offset = V(0, 0.006 * hipHeight * Math.sin(w), 0);
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
  const KEYS = 120; // keys per cycle: lift-off and set-down fall on keys
  const STRIDE = gait.stride, CYCLE = gait.cycle;
  const DUTY = Math.round(gait.duty * KEYS) / KEYS;
  const sweep = STRIDE * DUTY; // backward travel while a foot is down
  const edge = 3 / KEYS; // share of the cycle for the straight lift-off, and again for the set-down
  const swingT = 1 - DUTY - 2 * edge;
  const reach = sweep / 2 + edge * STRIDE; // the swing runs from -reach to +reach about the stance centre
  const hEdge = 0.012 * hipHeight, hTop = 0.075 * hipHeight;
  const HEEL = 24; // heel lift at toe-off
  const phases = { Left: 0, Right: 0.5 }; // touch-down
  function footPath(p) { // p = 0 at touch-down: x from the stance centre, y above rest, heel lift, toe curl
    if (p < DUTY) {
      const late = ramp(p, DUTY * 0.55, DUTY);
      return { x: sweep / 2 - p * STRIDE, y: 0, heel: HEEL * late * late, toe: 0 };
    }
    const q = p - DUTY;
    if (q < edge) return { x: -sweep / 2 - q * STRIDE, y: hEdge * (q / edge) ** 2, heel: HEEL + 6 * (q / edge), toe: 8 * (q / edge) };
    const k = q - edge - swingT;
    if (k >= 0) {
      const r = (edge - k) / edge;
      return { x: sweep / 2 + (edge - k) * STRIDE, y: hEdge * r * r, heel: -3 * r, toe: -3 * r };
    }
    const s = (q - edge) / swingT;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h11 = s ** 3 - s ** 2;
    const m = reach; // leaves and arrives moving forward at half the mean swing speed
    return {
      x: -reach * h00 + m * h10 + reach * (1 - h00) + m * h11,
      y: hEdge + (hTop - hEdge) * Math.sin(Math.PI * s),
      heel: THREE.MathUtils.lerp(HEEL + 6, -3, smooth(s * 1.4)),
      toe: 14 * Math.sin(Math.PI * Math.min(1, s * 1.6)) * (1 - smooth((s - 0.6) / 0.4)) - 3 * smooth((s - 0.6) / 0.4),
    };
  }
  const crouch = 0.025 * hipHeight, bob = 0.012 * hipHeight, sway = 0.035 * hipHeight;
  const walk = sample('walk', CYCLE, KEYS, u => {
    const q = {};
    const midLeft = DUTY / 2; // mid-stance of the left foot (the right one half a cycle later)
    const offset = V(0, -crouch + bob * Math.cos(2 * TAU * (u - midLeft)), -sway * Math.cos(TAU * (u - midLeft)));
    const yaw = 3.5 * Math.sin(TAU * (u - midLeft + 0.25));
    const roll = -2 * Math.cos(TAU * (u - midLeft));
    const pitch = 0.8 * Math.cos(2 * TAU * (u - midLeft) + 0.6);
    const hipsQ = chain(rot(Y, yaw), rot(X, roll), rot(Z, pitch));
    q.Hips = hipsQ;
    q.Spine = chain(rot(Y, -0.35 * yaw), rot(X, -0.3 * roll));
    q.Chest = chain(rot(Y, -0.35 * yaw), rot(X, -0.3 * roll), rot(Z, -0.5 * pitch));
    q.Neck = chain(rot(Y, -0.2 * yaw), rot(X, -0.25 * roll), rot(Z, -0.4 * pitch + 1.2 * Math.cos(2 * TAU * (u - midLeft) + 0.9)));
    q.Head = chain(rot(Y, -0.1 * yaw), rot(X, -0.15 * roll), rot(Z, -1.4 * Math.cos(2 * TAU * (u - midLeft) + 1.3)));
    if (hasJaw) q.Jaw = rot(Z, -0.4);
    for (let k = 1; k <= 6; k++) {
      const lag = 0.55 * k;
      q[`Tail${k}`] = tailBase(k, -(0.9 + 0.25 * k) * Math.sin(TAU * (u - midLeft + 0.25) - lag), 0.9 * Math.cos(2 * TAU * (u - midLeft) - 0.5 * k));
    }
    for (const side of ['Left', 'Right']) {
      const phase = TAU * (u - phases[side === 'Left' ? 'Right' : 'Left']); // arms swing with the other leg
      q[`${side}UpperArm`] = rot(Z, 4 * Math.sin(phase));
      q[`${side}LowerArm`] = rot(Z, 3 + 3 * Math.sin(phase - 0.6));
      q[`${side}Hand`] = rot(Z, 3 * Math.sin(phase - 1.2));
      const path = footPath((((u - phases[side]) % 1) + 1) % 1);
      const L = legs[side];
      legPose(side, V(L.B0.x + path.x, L.B0.y + path.y, L.B0.z), path.heel, path.toe, offset, hipsQ, q);
    }
    return { q, offset };
  });
  report.walk = {
    stride: STRIDE, cycle: CYCLE, speed: +(STRIDE / CYCLE).toFixed(4), duty: DUTY,
    stretch: Object.fromEntries(Object.entries(legs).map(([s, L]) => [s, +L.stretch.toFixed(3)])),
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

  return { clips: [idle, walk, roar], report };
}
