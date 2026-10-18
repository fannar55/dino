import * as THREE from 'three';
import { twoBoneLeg, alignFrames } from '../../engine/ik.js';
import { TAU, X, Y, Z, q, turn, bump, ease, spline } from './quadruped-clips.js';

// Clips for a winged character (Flugeðla the Pteranodon) rigged by winged-rig.js. Rest rotations are
// identity, so every bone turns about the character's own axes: X forward, Y up, Z her right side. Her
// bind pose is Tripo's: standing upright, the wings spread to the sides with the membrane hanging
// below them, her torso leaning back about 50 degrees from level.
//
//   idle     4.0 s  standing on her feet, the wings folded at her sides, breathing and looking about
//   walk     (WALK) on her feet and the knuckles of her folded wings, as pterosaurs walked; the feet
//                   land flat and sweep back at exactly the walking speed, so footing plants them
//   takeOff  3.2 s  once: a crouch, the wings open, a leap and two strong wingbeats up to flying height;
//                   it ends where fly begins
//   fly      1.4 s  a calm wingbeat at flying height, the body level, legs trailing, the head steady
//   glide    6.0 s  the wings held out, a gentle bank to one side and the other
//   land     3.0 s  once: from fly's first pose down to the ground, a flare and a soft landing on her
//                   feet, the wings folding; it ends in idle's first pose
//   kink     2.4 s  a friendly nod, standing
//   happy    2.4 s  a happy hop on the spot with a flutter of half-open wings
//   carry    3.6 s  flying with a child on her back: two slow, shallow wingbeats with the back held
//                   steady and level under the seat between the wings (`seat` in the report)
//
// The wings are posed in the chest's frame: folded (FOLD: the wing's plane turned along her side and
// folded in it like a fan, so the membrane gathers between the bones), spread as in the bind pose, or
// in flight (`flightWing`: the whole wing turned at the shoulder so the membrane lies level, raised or
// lowered about the body's long axis, the forearm, the hand and the long finger flexing in and out of the
// wing's plane). In between, each bone's turn is blended, so a wing folds and unfolds at all its joints at
// once. The left wing is the right one's mirror image. The legs reach their feet by the two-bone IK the
// engine's footing uses (engine/ik.js), so footing gets a clip's own pose back; in flight they trail
// behind.
//
// Every clip keys every bone (and the Hips' position), so no turn is left behind when clips cross-fade.
// takeOff and land carry `once` in their extras: the actor plays such a clip once and holds its last
// pose. Flying clips hold the hips at FLIGHT.height: a scene moves her root through the air.

const rad = THREE.MathUtils.degToRad;
const deg = THREE.MathUtils.radToDeg;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SIDES = ['Left', 'Right'];
const smoother = s => { const t = THREE.MathUtils.clamp(s, 0, 1); return t * t * t * (10 + t * (6 * t - 15)); };
// A mirror image across her middle (z to -z): of a turn, and of a direction.
const mirrorQ = qq => new THREE.Quaternion(-qq.x, -qq.y, qq.z, qq.w);
const mirrorV = v => V(v.x, v.y, -v.z);

/** The wing folded on the ground, as pterosaurs folded theirs: the whole wing turned at the shoulder so
 *  its plane stands along her side (swept back `sweep` degrees about the vertical and tipped out `out`
 *  degrees), and in that plane folded like a fan toward the trailing edge, so the membrane gathers
 *  between the bones instead of hanging loose: the arm reaching down, the forearm folded under it to
 *  the hand, whose knuckle rests on the ground, and the long finger folded back up along the forearm
 *  (`knuckle`), its last joints curling in a little (`tip`). Standing and walking, the arm and forearm
 *  reach for the knuckle's spot on the ground in that plane. Degrees. */
export const FOLD = { sweep: 90, out: 12, arm: 72, elbow: 80, wrist: -20, knuckle: 160, tip: 6 };

/** Flight. */
export const FLIGHT = {
  height: 0.63, // the hips' joint above the ground, as a share of her standing height (about 2.6 m)
  nose: 5, // degrees the body points nose-up in level flight
  beat: 1.4, // seconds a calm wingbeat takes
  up: 36, // degrees the wings rise above level at the top of a beat
  down: 24, // and fall below it at the bottom
  trail: 35, // degrees the thighs swing back from standing, so the legs trail behind and a little below her
};

/** The walk on feet and folded wings. */
export const WALK = {
  stride: 1.15, // metres a cycle
  cycle: 1.6, // seconds
  duty: 0.62, // share of the cycle a foot is down
  handDuty: 0.6, // and a hand (the knuckle of the folded wing)
  lag: 0.25, // a hand comes down this share of the cycle after the foot on its side
  lean: 24, // degrees the body leans forward from standing
  centre: 0.35, // how much of a heel's rest offset behind its hip the stance takes out (footing lets a
  // planted foot stand at most about half a metre from its rest spot on her legs)
  lift: 0.07, // metres the heel rises in a swing
  peel: 18, // degrees the heel peels up about the toes before the toes leave
  handLift: 0.09, // metres a knuckle rises in a swing
  reach: 0.2, // metres the knuckles' stance lies ahead of where they rest standing
  keys: 96,
};

export function authorWingedClips(rig, options = {}) {
  const { bones, joints: J, H } = rig;
  const walkSet = { ...WALK, ...Object.fromEntries(Object.entries(options).filter(([k]) => k in WALK)) };
  // Every lift-off and set-down falls on a key.
  for (const key of ['duty', 'handDuty', 'lag']) walkSet[key] = Math.round(walkSet[key] * walkSet.keys) / walkSet.keys;
  // Probes may try other folds and flights: options.fold and options.flight override FOLD and flight.
  const fold = { ...FOLD, ...options.fold };
  const flight = { ...FLIGHT, ...options.flight };
  const all = rig.names.filter(n => n !== 'root');
  const rest = Object.fromEntries(all.map(n => [n, bones[n].position.clone()]));
  const reset = () => { for (const n of all) { bones[n].position.copy(rest[n]); bones[n].quaternion.identity(); } };
  const update = () => bones.root.updateMatrixWorld(true);
  const worldQ = n => bones[n].getWorldQuaternion(new THREE.Quaternion());
  const worldP = n => bones[n].getWorldPosition(V());
  // Turn a bone so its world turn (the model's frame: the root never turns) is `w`.
  const setWorld = (n, w) => { bones[n].quaternion.copy(worldQ(bones[n].parent.name).invert().multiply(w)); update(); };

  // The body's own long axis (hips to chest) in the bind pose, and how far it leans back from level.
  const torso = J.Chest.clone().sub(J.Hips).normalize();
  const torsoAngle = deg(Math.atan2(torso.y, torso.x));
  // Level flight: the hips pitched so the body points flight.nose degrees nose-up.
  const flightPitch = flight.nose - torsoAngle;
  const flyY = flight.height * H;

  // --- wings -------------------------------------------------------------------------------------------
  const WING = ['UpperArm', 'Forearm', 'Wrist', 'Claws', 'Finger1', 'Finger2', 'Finger3'];
  const CHILD = { UpperArm: 'Forearm', Forearm: 'Wrist', Wrist: 'Finger1', Finger1: 'Finger2', Finger2: 'Finger3' };
  const wingInfo = Object.fromEntries(rig.wings.map(w => [w.side, w]));
  // A set of local turns for one wing: { UpperArm: Quaternion, ... }, for the right side.
  const identityWing = () => Object.fromEntries(WING.map(n => [n, new THREE.Quaternion()]));
  // The folded wing's local turns (FOLD), and the plane it stands in (chest frame, right wing): its normal,
  // and the way along the wing in it (the bind's "out"), which points back along her side.
  function foldedWing({ sweep, out, arm, elbow, wrist, knuckle, tip } = fold) {
    const w = identityWing();
    w.UpperArm = q(X, rad(-out)).multiply(q(Y, rad(-sweep))).multiply(q(X, rad(arm)));
    w.Forearm = q(X, rad(elbow));
    w.Wrist = q(X, rad(wrist));
    w.Finger1 = q(X, rad(knuckle));
    w.Finger2 = q(X, rad(tip));
    w.Finger3 = q(X, rad(tip));
    return w;
  }
  const folded = foldedWing();
  const foldPlane = q(X, rad(-fold.out)).multiply(q(Y, rad(-fold.sweep)));
  const foldBack = Z.clone().applyQuaternion(foldPlane);
  // In the chest's frame, with the body in level flight: forward (the flap axis), up (the sweep axis).
  const flightTurn = new THREE.Quaternion().setFromAxisAngle(Z, rad(-flightPitch));
  const flightForward = X.clone().applyQuaternion(flightTurn);
  const flightUp = Y.clone().applyQuaternion(flightTurn);
  const levelWing = -90 - flightPitch; // the shoulder's pitch that lays the membrane level in flight
  /**
   * The right wing in flight: `lift` degrees above level (negative: below), swept forward `sweep`,
   * twisted nose-up `twist`; the forearm, the hand and the finger folded in the wing's plane (`elbow`,
   * `wrist`, `knuckle`: toward the trailing edge), the finger's last two joints bent up out of it
   * (`bend`: [Finger2, Finger3], degrees, tips up).
   */
  function flightWing({ lift = 0, sweep = 0, twist = 0, elbow = 0, wrist = 0, knuckle = 0, bend = [0, 0], claws = 0 } = {}) {
    const w = identityWing();
    w.UpperArm = new THREE.Quaternion().setFromAxisAngle(flightForward, rad(-lift))
      .multiply(new THREE.Quaternion().setFromAxisAngle(flightUp, rad(sweep)))
      .multiply(q(Z, rad(levelWing + twist)));
    w.Forearm = q(X, rad(elbow));
    w.Wrist = q(X, rad(wrist));
    w.Finger1 = q(X, rad(knuckle));
    // Bent up out of the wing's plane: about the bind's vertical, which flight turns to point forward.
    w.Finger2 = q(Y, rad(-bend[0]));
    w.Finger3 = q(Y, rad(-bend[1]));
    w.Claws = q(Z, rad(claws));
    return w;
  }
  const mixWing = (a, b, t) => Object.fromEntries(WING.map(n => [n, a[n].clone().slerp(b[n], t)]));
  /** Put a wing's turns on a side (the left gets their mirror image). */
  function setWing(side, turns) {
    for (const n of WING) bones[`${side}${n}`].quaternion.copy(side === 'Right' ? turns[n] : mirrorQ(turns[n]));
  }
  const setWings = (turns, left = turns) => { setWing('Right', turns); setWing('Left', left); };
  /** A folded wing whose hand rests on the ground: the upper arm and forearm reach so the knuckle is at
   *  `target` (model frame), the elbow bending back along her side (in the folded wing's plane), the hand
   *  and the finger as folded. */
  const knuckleInForearm = J.RightWrist.clone().sub(J.RightForearm).add(J.RightFinger1.clone().sub(J.RightWrist).applyQuaternion(folded.Wrist));
  const upperArm = J.RightForearm.clone().sub(J.RightUpperArm);
  const bendNormal = upperArm.clone().cross(knuckleInForearm).normalize();
  function reachKnuckle(side, target) {
    const right = side === 'Right';
    const S = worldP(`${side}UpperArm`);
    const pole = (right ? foldBack.clone() : mirrorV(foldBack)).applyQuaternion(worldQ('Chest'));
    const l1 = upperArm.length(), l2 = knuckleInForearm.length();
    const toTarget = target.clone().sub(S);
    const d = THREE.MathUtils.clamp(toTarget.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
    const along = toTarget.clone().normalize();
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const across = pole.addScaledVector(along, -pole.dot(along)).normalize();
    const elbow = S.clone().addScaledVector(along, a).addScaledVector(across, h);
    const end = S.clone().addScaledVector(along, d);
    const u0 = right ? upperArm : mirrorV(upperArm), k0 = right ? knuckleInForearm : mirrorV(knuckleInForearm);
    const n0 = right ? bendNormal : mirrorV(bendNormal).negate();
    const n = elbow.clone().sub(S).cross(end.clone().sub(elbow)).normalize();
    setWorld(`${side}UpperArm`, alignFrames(u0, n0, elbow.clone().sub(S), n));
    setWorld(`${side}Forearm`, alignFrames(k0, n0, end.clone().sub(elbow), n));
  }

  // --- legs: two-bone IK as footing reaches them -------------------------------------------------------
  const legs = Object.fromEntries(rig.legs.map(l => [l.side, {
    side: l.side,
    hip: rest[`${l.side}Thigh`].clone(), // the hip joint in the hips' frame
    ik: twoBoneLeg(rest[`${l.side}Shin`], rest[`${l.side}Foot`]),
    heel: l.heel.clone(), // the heel's rest spot (model frame)
    toe: l.toe.clone().sub(l.heel), // the toes' ground contact from the heel
  }]));
  /** Put a leg's heel at `heel` (model frame), the foot turned `foot` there (model frame), for the hips
   *  as posed; the knee points forward. */
  function plantLeg(side, heel, foot = new THREE.Quaternion()) {
    const L = legs[side];
    update();
    const hipsQ = worldQ('Hips');
    const toAnkle = heel.clone().sub(L.hip.clone().applyQuaternion(hipsQ).add(worldP('Hips')));
    const hinge = toAnkle.clone().normalize().cross(X);
    const knee = new THREE.Quaternion();
    L.stretch = Math.max(L.stretch ?? 0, toAnkle.length() / L.ik.length);
    const thighTurn = L.ik.reach(toAnkle, hinge, new THREE.Quaternion(), knee);
    bones[`${side}Thigh`].quaternion.copy(hipsQ.invert().multiply(thighTurn));
    bones[`${side}Shin`].quaternion.copy(knee);
    bones[`${side}Foot`].quaternion.copy(thighTurn.multiply(knee).invert().multiply(foot));
  }
  const standLegs = () => { for (const side of SIDES) plantLeg(side, legs[side].heel); };
  /** Legs trailing behind in flight (`tuck` 1), a little apart; `kick` swings them a little. */
  function trailLegs(tuck = 1, kick = 0) {
    for (const side of SIDES) {
      const s = side === 'Right' ? 1 : -1;
      bones[`${side}Thigh`].quaternion.copy(turn(0, rad(s * 4 * tuck), rad((-flight.trail + kick) * tuck)));
      bones[`${side}Shin`].quaternion.copy(q(Z, rad(40 * tuck)));
      bones[`${side}Foot`].quaternion.copy(q(Z, rad(-60 * tuck)));
    }
  }

  // --- body --------------------------------------------------------------------------------------------
  const neckNames = rig.chains.neck.slice(0, -1);
  const tailNames = rig.chains.tail;
  /** The hips at `y` metres above their rest height (and `x` forward), pitched nose-up `pitch` degrees,
   *  rolled to her right `roll`, turned to her left `yaw`. */
  function hips({ x = 0, y = 0, pitch = 0, roll = 0, yaw = 0 } = {}) {
    bones.Hips.position.copy(rest.Hips).add(V(x, y, 0));
    bones.Hips.quaternion.copy(turn(rad(yaw), rad(roll), rad(pitch)));
  }
  /** The neck's three joints and the head: [yaw, roll, pitch] each, degrees. */
  function neckPose(neck, head) {
    neckNames.forEach((n, i) => bones[n].quaternion.copy(turn(...(neck[i] || [0, 0, 0]).map(rad))));
    bones.Head.quaternion.copy(turn(...head.map(rad)));
  }
  /** The tail: pitch up and a sway to her left, both degrees, more toward the tip. */
  function tailPose(pitch, sway = 0) {
    tailNames.forEach((n, i) => bones[n].quaternion.copy(turn(rad(sway * (0.6 + 0.4 * i)), 0, rad(i ? pitch * 0.3 : pitch))));
  }
  // The neck and head in level flight: the neck stretched forward and up, the head level.
  const FLY_NECK = [[0, 0, 10], [0, 0, 12], [0, 0, 12]], FLY_HEAD = [0, 0, 20];
  const FLY_TAIL = 26; // the tail straight out behind

  // --- poses held and blended --------------------------------------------------------------------------
  /** The pose the bones are in now (every bone's turn and the hips' position). */
  const snapshot = () => ({ q: Object.fromEntries(all.map(n => [n, bones[n].quaternion.clone()])), hips: bones.Hips.position.clone() });
  /** The pose a pose function gives. */
  const grab = (pose, ...args) => { reset(); pose(...args); const s = snapshot(); reset(); return s; };
  /** Put the bones in a blend of two poses. */
  function blend(a, b, t) {
    for (const n of all) bones[n].quaternion.copy(a.q[n]).slerp(b.q[n], t);
    bones.Hips.position.lerpVectors(a.hips, b.hips, t);
  }
  /** The legs as they stand, and as they trail behind in flight, blended (`k` 1: trailing). */
  function legsBetween(k, kick = 0) {
    const stood = SIDES.map(s => ['Thigh', 'Shin', 'Foot'].map(n => bones[`${s}${n}`].quaternion.clone()));
    trailLegs(1, kick);
    SIDES.forEach((s, i) => ['Thigh', 'Shin', 'Foot'].forEach((n, j) => {
      const b = bones[`${s}${n}`];
      b.quaternion.copy(stood[i][j].slerp(b.quaternion, k));
    }));
  }

  // --- sampling ----------------------------------------------------------------------------------------
  function sample(name, duration, keys, pose, { once = false } = {}) {
    const times = [];
    const quats = new Map(all.map(n => [n, []]));
    const hipsAt = [];
    for (let f = 0; f <= keys; f++) {
      const u = f / keys;
      reset();
      pose(u, u * duration);
      times.push(u * duration);
      for (const n of all) {
        const list = quats.get(n), qq = bones[n].quaternion;
        // Keep neighbouring keys on the same side of the quaternion sphere.
        if (list.length && list.at(-4) * qq.x + list.at(-3) * qq.y + list.at(-2) * qq.z + list.at(-1) * qq.w < 0) list.push(-qq.x, -qq.y, -qq.z, -qq.w);
        else list.push(qq.x, qq.y, qq.z, qq.w);
      }
      hipsAt.push(bones.Hips.position.x, bones.Hips.position.y, bones.Hips.position.z);
    }
    reset();
    const tracks = all.map(n => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, times, quats.get(n)));
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, hipsAt));
    const clip = new THREE.AnimationClip(name, duration, tracks);
    if (once) clip.userData.once = true;
    return clip;
  }

  // --- standing on feet and knuckles -------------------------------------------------------------------
  // The folded wings' knuckles rest on the ground a little ahead of the shoulders and out to the sides;
  // the arm and forearm reach them, the elbows bending back and out.
  const KNUCKLE_Y = 0.012 * H; // the knuckle's joint above the ground when the finger's edge rests on it
  const handRest = side => V(J.RightUpperArm.x + 0.1 * H, KNUCKLE_Y, (side === 'Right' ? 1 : -1) * 0.17 * H);
  /** The folded wings with their knuckles on their rest spots, moved by `right` and `left` (model frame). */
  function standArms(right = V(), left = right) {
    setWings(folded);
    update();
    reachKnuckle('Right', handRest('Right').add(right));
    reachKnuckle('Left', handRest('Left').add(left));
  }

  // --- idle: standing, the wings folded ----------------------------------------------------------------
  // A slow breath, the head looking about a little, the folded fingers swaying with the breath, the tail
  // swaying; feet and knuckles stay where they stand.
  const idlePose = u => {
    const breath = Math.sin(TAU * u);
    // The hips stay where they stand, so the legs stay at rest and footing keeps the feet where they are;
    // the breath lifts the spine and the chest.
    bones.Spine.quaternion.copy(turn(0, 0, rad(-2 + 0.8 * breath)));
    bones.Chest.quaternion.copy(turn(0, 0, rad(-2 + 1.2 * Math.sin(TAU * u - 0.4))));
    neckPose([[3 * Math.sin(TAU * u + 0.8), 0, 2 + 1.2 * Math.sin(TAU * u + 0.5)], [2 * Math.sin(TAU * u + 1.1), 0, 1], [0, 0, 0]],
      [6 * Math.sin(TAU * u + 1.4), 3 * Math.sin(2 * TAU * u), 2 * Math.sin(TAU * u + 1.2)]);
    tailPose(2 * breath, 5 * Math.sin(TAU * u - 0.6));
    standArms();
    for (const side of SIDES) bones[`${side}Finger1`].quaternion.multiply(q(X, rad((side === 'Right' ? 1 : -1) * 1.5 * Math.sin(TAU * u - 0.9))));
  };
  // The right wing's turns as she stands (idle's first pose), for blends into and out of standing.
  const standWing = (() => {
    reset();
    idlePose(0);
    const w = Object.fromEntries(WING.map(n => [n, bones[`Right${n}`].quaternion.clone()]));
    reset();
    return w;
  })();

  // Opening and folding go in stages, each bone's turn blended between them: the folded wing lifts off the
  // ground (LIFTED), swings out to her side still folded (OUT), and opens into the raised wing of a first
  // beat; folding is the same way back.
  const LIFTED = foldedWing({ ...fold, out: 26, arm: 28, elbow: 118 });
  const OUT = foldedWing({ ...fold, sweep: 25, out: 12, arm: -15, elbow: 105, wrist: -5, knuckle: 140 });
  /** The right wing `k` of the way (0 to 1) from standing folded to `open` (a wing's turns). */
  function unfold(k, open) {
    if (k < 0.3) return mixWing(standWing, LIFTED, smoother(k / 0.3));
    if (k < 0.6) return mixWing(LIFTED, OUT, smoother((k - 0.3) / 0.3));
    return mixWing(OUT, open, smoother((k - 0.6) / 0.4));
  }

  // --- kink: a friendly nod ----------------------------------------------------------------------------
  const kinkPose = u => {
    const lift = 6 * bump(u, 0, 0.22);
    const nod = 26 * bump(u, 0.14, 0.5) + 16 * bump(u, 0.46, 0.8);
    bones.Spine.quaternion.copy(turn(0, 0, rad(-2 - 1.5 * bump(u, 0.14, 0.5))));
    bones.Chest.quaternion.copy(turn(0, 0, rad(-2 - 2 * bump(u, 0.14, 0.5))));
    neckPose([[0, 0, 2 + 0.3 * lift - 0.25 * nod], [0, 0, -0.2 * nod], [0, 0, -0.2 * nod]], [0, 4 * bump(u, 0.05, 0.9), lift - 0.5 * nod]);
    tailPose(0, 8 * Math.sin(2 * TAU * u) * bump(u, 0.1, 0.95));
    standArms();
  };

  // --- happy: a hop and a flutter ----------------------------------------------------------------------
  // She crouches, hops so her feet leave the ground, the wings lifting off the ground, opening halfway and
  // fluttering; she lands softly and folds them again. The clip keys the legs, so footing hands them to it.
  const half = flightWing({ lift: 28, elbow: 40, wrist: 20, knuckle: 60, sweep: -10 });
  const happyPose = u => {
    const hop = H * spline([[0, 0, 0], [0.16, -0.02, 0], [0.4, 0.05, 0], [0.58, 0, -0.5], [0.68, -0.015, 0], [0.84, 0.003, 0], [1, 0, 0]], u);
    const open = ease(u, 0.08, 0.3) * (1 - ease(u, 0.7, 0.95));
    const flutter = Math.sin(TAU * 4 * u) * open;
    hips({ y: hop, pitch: 3 * open });
    bones.Spine.quaternion.copy(turn(0, 0, rad(-2)));
    bones.Chest.quaternion.copy(turn(0, 0, rad(-2)));
    neckPose([[0, 0, 2], [0, 0, 3 * open], [0, 0, 0]], [0, 6 * Math.sin(TAU * 2 * u) * open, 6 * open]);
    tailPose(6 * open, 10 * Math.sin(TAU * 2 * u) * open);
    const w = unfold(0.82 * open, half);
    w.UpperArm.premultiply(q(torso, rad(-12 * flutter)));
    setWings(w);
    update();
    const air = Math.max(0, hop - 0.012 * H);
    for (const side of SIDES) plantLeg(side, legs[side].heel.clone().add(V(0, air, 0)), q(Z, rad(-25 * Math.min(1, air / (0.02 * H)))));
  };

  // --- fly: a calm wingbeat ----------------------------------------------------------------------------
  // The beat starts at the top: the downstroke takes 55 % of it, the wing straight and the tips lagging
  // up; on the upstroke the forearm and the finger fold a little toward the body. The body rises a little
  // on the downstroke; the neck takes the bob out so the head travels steadily.
  const DOWN = 0.55;
  const beatPhase = u => (u < DOWN ? 0.5 * (u / DOWN) : 0.5 + 0.5 * ((u - DOWN) / (1 - DOWN)));
  function beatWing(u, { up = flight.up, down = flight.down } = {}) {
    const p = beatPhase(u); // 0 top, 0.5 bottom, 1 top
    const c = Math.cos(TAU * p);
    const lift = (up - down) / 2 + ((up + down) / 2) * c;
    const upstroke = u >= DOWN ? Math.sin(Math.PI * (u - DOWN) / (1 - DOWN)) : 0;
    const lag = Math.sin(TAU * p + 0.9);
    return flightWing({ lift, twist: -4 * Math.sin(TAU * p), elbow: 12 * upstroke, knuckle: 14 * upstroke, bend: [6 * lag, 10 * lag], sweep: 3 * upstroke });
  }
  const flyBody = (u, { bob = 0.05, pitch = 1.5 } = {}) => {
    const p = beatPhase(u);
    hips({ y: flyY - rest.Hips.y + bob * Math.sin(TAU * p - 0.6), pitch: flightPitch + pitch * Math.sin(TAU * p + 0.4) });
    neckPose(FLY_NECK.map((a, i) => [a[0], a[1], a[2] - (i === 0 ? pitch * Math.sin(TAU * p + 0.4) : 0)]), [FLY_HEAD[0], FLY_HEAD[1], FLY_HEAD[2] - 0.5 * pitch * Math.sin(TAU * p + 0.4)]);
    tailPose(FLY_TAIL + 3 * Math.sin(TAU * p - 1), 2 * Math.sin(TAU * u));
    trailLegs(1, 3 * Math.sin(TAU * p - 0.8));
  };
  const flyPose = u => {
    flyBody(u);
    setWings(beatWing(u));
  };

  // --- glide: wings held, a gentle bank ----------------------------------------------------------------
  const glideWing = (bank, u) => flightWing({ lift: 6, twist: 2, bend: [8, 12 + 2 * Math.sin(TAU * u)], elbow: 0 });
  const glidePose = u => {
    const bank = 9 * Math.sin(TAU * u);
    hips({ y: flyY - rest.Hips.y + 0.03 * Math.sin(TAU * 2 * u), pitch: flightPitch + 1, roll: bank, yaw: 3 * Math.sin(TAU * u) });
    // The head stays level: the neck takes out the bank.
    neckPose(FLY_NECK.map((a, i) => [a[0] - (i === 1 ? 1.5 * Math.sin(TAU * u) : 0), a[1] - bank / 3, a[2]]), [FLY_HEAD[0] + 4 * Math.sin(TAU * u), FLY_HEAD[1], FLY_HEAD[2]]);
    tailPose(FLY_TAIL, -4 * Math.sin(TAU * u));
    trailLegs(1, 1.5 * Math.sin(TAU * 2 * u));
    const right = glideWing(bank, u), left = glideWing(-bank, u);
    // The wing on the inside of the bank rises a little, the outer one dips.
    right.UpperArm.premultiply(q(flightForward, rad(0.25 * bank)));
    left.UpperArm.premultiply(q(flightForward, rad(-0.25 * bank)));
    setWings(right, left);
  };

  // --- carry: flying with a child on her back ----------------------------------------------------------
  // Two slow, shallow beats; the back under the seat stays level and steady: the hips do not bob or pitch
  // with the beat, only the wings move.
  const carryPose = u => {
    const v = (2 * u) % 1;
    hips({ y: flyY - rest.Hips.y, pitch: flightPitch });
    neckPose(FLY_NECK, [FLY_HEAD[0] + 3 * Math.sin(TAU * u), FLY_HEAD[1], FLY_HEAD[2]]);
    tailPose(FLY_TAIL, 2 * Math.sin(TAU * u));
    trailLegs(1, 2 * Math.sin(TAU * v - 0.8));
    setWings(beatWing(v, { up: 22, down: 14 }));
  };

  // --- takeOff: from standing to flying height ---------------------------------------------------------
  // A crouch with the wings opening and rising, a leap, and two strong beats that carry her up as the
  // body tips forward to level and the legs swing back. It ends exactly in fly's first pose.
  const TAKEOFF = 3.2;
  const BEATS = 0.75; // the first downstroke starts here; two beats take the rest
  // The hips' rise above their rest height: a crouch, the leap, and the climb on the two beats.
  const climbY = t => spline([[0, 0, 0], [0.45, -0.07 * H, 0], [0.95, 0.1 * H, 0.35 * H], [1.5, 0.15 * H, 0], [2.3, 0.24 * H, 0.08 * H], [TAKEOFF, flyY - rest.Hips.y, 0]], t);
  const flyStart = grab(flyPose, 0);
  const takeOffRaw = t => {
    const open = ease(t, 0.1, BEATS);
    const level = smoother((t - 0.6) / 1.5);
    hips({ y: climbY(t), pitch: flightPitch * level - 7 * bump(t, 0.15, 0.8) });
    neckPose(FLY_NECK.map(a => a.map(v => v * level)), [0, 0, FLY_HEAD[2] * level - 8 * bump(t, 0.1, 0.8)]);
    tailPose(FLY_TAIL * level + 8 * bump(t, 0.3, 1.0), 0);
    // The wings open and rise during the crouch, then two beats, big and growing calmer, that end at the
    // top of a beat as fly starts.
    const beats = THREE.MathUtils.clamp((t - BEATS) / ((TAKEOFF - BEATS) / 2), 0, 2);
    const big = { up: 52 - 16 * Math.min(1, beats / 2), down: 36 - 12 * Math.min(1, beats / 2) };
    setWings(t < BEATS ? unfold(open, beatWing(0, { up: 52, down: 36 })) : beatWing(beats % 1, big));
    // The feet stand and push off; after the leap they swing back and trail.
    update();
    for (const side of SIDES) plantLeg(side, legs[side].heel.clone().add(V(0, Math.max(0, climbY(t) - 0.03 * H), 0)), q(Z, rad(-35 * ease(t, 0.55, 0.95))));
    legsBetween(ease(t, 0.85, 1.7), 3 * Math.sin(TAU * beatPhase(beats % 1) - 0.8) * Math.min(1, beats));
  };
  const takeOffPose = (u, t) => {
    takeOffRaw(t);
    if (t > TAKEOFF - 0.6) blend(snapshot(), flyStart, smoother((t - (TAKEOFF - 0.6)) / 0.6));
  };

  // --- land: from flying height to standing ------------------------------------------------------------
  // From fly's first pose a glide down; a flare (the body tips up, the wings sweep forward and brake), the
  // legs swing down and forward to meet the ground, a soft landing on her feet, and the wings fold. It
  // ends exactly in idle's first pose.
  const LAND = 3.0;
  const TOUCH = 2.1;
  const idleStart = grab(idlePose, 0);
  const landRaw = t => {
    const upright = ease(t, 1.0, TOUCH);
    const flare = bump(t, 1.0, 2.5);
    const absorb = 0.05 * H * bump(t, TOUCH - 0.05, LAND);
    const y = (flyY - rest.Hips.y) * (1 - smoother(t / TOUCH)) - absorb;
    hips({ y, pitch: flightPitch * (1 - upright) + 12 * flare });
    neckPose(FLY_NECK.map(a => a.map(v => v * (1 - upright))), [0, 0, FLY_HEAD[2] * (1 - upright) + 6 * flare]);
    tailPose(FLY_TAIL * (1 - upright) - 6 * flare, 0);
    const brake = flightWing({ lift: 12 + 26 * flare, sweep: 20 * flare, twist: 16 * flare, bend: [10, 14] });
    setWings(t < TOUCH ? brake : unfold(1 - ease(t, TOUCH - 0.05, LAND - 0.1), brake));
    // The feet reach down and forward for the ground, toes up, and stand from the touch.
    update();
    const reach = 1 - ease(t, 1.6, TOUCH);
    for (const side of SIDES) plantLeg(side, legs[side].heel.clone().add(V(0.05 * H * reach, Math.max(0, y + absorb), 0)), q(Z, rad(18 * reach)));
    legsBetween(1 - ease(t, 0.8, 1.7));
  };
  const landPose = (u, t) => {
    if (t < 0.5) {
      landRaw(t);
      blend(flyStart, snapshot(), smoother(t / 0.5));
      return;
    }
    landRaw(t);
    if (t > LAND - 0.5) blend(snapshot(), idleStart, smoother((t - (LAND - 0.5)) / 0.5));
  };

  // --- walk: on her feet and the knuckles of her folded wings ------------------------------------------
  // Four beats in lateral sequence: left foot, left hand (lag later), right foot, right hand. A planted
  // foot is flat and sweeps back at exactly stride / cycle; its heel peels up about the toes at the end of
  // its stance, then it swings forward in an arc and comes down flat. A hand (the knuckle of the folded
  // wing) does the same without the peel. The body leans forward onto the hands, bobs a little and rolls
  // over the side whose feet are down; the neck takes most of it out.
  const { stride: S, cycle: C, duty, handDuty, lag } = walkSet;
  const walkLean = -4 - walkSet.lean;
  // A foot (or a knuckle) at share p of its own cycle from touch-down: x from the middle of its stance, y
  // above the ground and the foot's pitch (negative: heel up). Down, it sweeps back at exactly the walking
  // speed, the heel peeling up about the toes at the end (`peel`); it lifts off straight up and sets down
  // straight down while still moving with the ground (EDGE of the cycle each), so nothing on the ground
  // slides, and swings forward in an arc between.
  const EDGE = 4 / walkSet.keys;
  const footPath = (p, d, rise, peel) => {
    const sweep = S * d;
    if (p < d) return { x: sweep / 2 - S * p, y: 0, pitch: peel ? -peel * ease(p, d - 0.12, d) : 0, down: true };
    const k = p - d;
    const edgeY = 0.25 * rise;
    if (k < EDGE) return { x: -sweep / 2 - S * k, y: edgeY * (k / EDGE) ** 2, pitch: -peel, down: false };
    const swing = 1 - d - 2 * EDGE;
    const back = k - EDGE - swing;
    if (back >= 0) return { x: sweep / 2 + S * (EDGE - back), y: edgeY * ((EDGE - back) / EDGE) ** 2, pitch: 0, down: false };
    const s = (k - EDGE) / swing;
    const from = -sweep / 2 - S * EDGE, to = sweep / 2 + S * EDGE;
    return { x: from + (to - from) * smoother(s), y: edgeY + (rise - edgeY) * Math.sin(Math.PI * s) ** 1.2, pitch: -peel * (1 - ease(s, 0, 0.45)), down: false };
  };
  const footCentre = walkSet.centre * (J.RightThigh.x - J.RightFoot.x);
  const handSpot = side => handRest(side).add(V(walkSet.reach, 0, 0));
  const walkPose = u => {
    const roll = 1.5 * Math.cos(TAU * u);
    hips({ y: -0.025 * H + 0.012 * H * Math.cos(2 * TAU * u), pitch: walkLean + 1 * Math.sin(2 * TAU * u), roll, yaw: 2 * Math.sin(TAU * u) });
    bones.Spine.quaternion.copy(turn(rad(-1 * Math.sin(TAU * u)), 0, 0));
    neckPose([[0, -roll / 2, 10], [-1.5 * Math.sin(TAU * u), 0, 8], [0, 0, 4]], [-2 * Math.sin(TAU * u), -roll / 2, walkSet.lean - 20 - 1.2 * Math.sin(2 * TAU * u)]);
    tailPose(10, 6 * Math.sin(TAU * u - 0.8));
    setWings(folded);
    update();
    for (const side of SIDES) {
      const phase = side === 'Left' ? 0 : 0.5;
      // The hand.
      const hp = (((u - phase - lag) % 1) + 1) % 1;
      const hand = footPath(hp, handDuty, walkSet.handLift, 0);
      const spot = handSpot(side).add(V(hand.x, hand.y, 0));
      reachKnuckle(side, spot);
      // The foot.
      const fp = (((u - phase) % 1) + 1) % 1;
      const foot = footPath(fp, duty, walkSet.lift, walkSet.peel);
      const L = legs[side];
      // Peeling about the toes: the heel rises and moves as the foot turns about the toes' contact.
      const pitch = q(Z, rad(foot.pitch));
      const toeAt = L.heel.clone().add(L.toe).add(V(foot.x + footCentre, foot.y, 0));
      const heel = toeAt.clone().sub(L.toe.clone().applyQuaternion(pitch));
      plantLeg(side, heel, pitch);
    }
  };

  // How far the walk stretches a leg (hip to heel, as a share of the straight leg): under 1, the legs reach
  // every spot the clip puts the feet on.
  for (const L of Object.values(legs)) L.stretch = 0;
  const walkClip = sample('walk', C, walkSet.keys, walkPose);
  const walkStretch = Math.max(...Object.values(legs).map(L => L.stretch));
  const clips = [
    sample('idle', 4.0, 120, idlePose),
    walkClip,
    sample('takeOff', TAKEOFF, 96, takeOffPose, { once: true }),
    sample('fly', flight.beat, 56, flyPose),
    sample('glide', 6.0, 120, glidePose),
    sample('land', LAND, 90, landPose, { once: true }),
    sample('kink', 2.4, 72, kinkPose),
    sample('happy', 2.4, 72, happyPose),
    sample('carry', 3.6, 108, carryPose),
  ];

  // --- the seat: where a child sits on her back in carry -----------------------------------------------
  // The top of her back between the wings in carry's pose, where the skin follows the spine alone (the
  // shoulders' skin also follows the beating arms): on her middle line, between the hips and the
  // shoulders, the highest point of the skin the hips, the spine and the chest carry all but entirely.
  // The bone that carries it most is the one a saddle follows; the seat is given in that bone's frame and in
  // the model's frame in carry (and, through the bone's rest, in the bind pose).
  reset();
  carryPose(0);
  update();
  const mesh = rig.mesh;
  const spineIndex = ['Hips', 'Spine', 'Chest'].map(n => mesh.skeleton.bones.indexOf(bones[n]));
  const shoulder = worldP('RightUpperArm').add(worldP('LeftUpperArm')).multiplyScalar(0.5);
  const hipsAt = worldP('Hips');
  const pos = mesh.geometry.attributes.position, si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
  let top = null;
  const v = V();
  for (let i = 0; i < pos.count; i++) {
    let w = 0, best = -1, most = 0;
    for (let k = 0; k < 4; k++) {
      const b = si.getComponent(i, k), x = sw.getComponent(i, k);
      if (spineIndex.includes(b)) w += x;
      if (x > most) { most = x; best = b; }
    }
    if (w < 0.97) continue;
    mesh.getVertexPosition(i, v);
    if (Math.abs(v.z) > 0.012 * H || v.x > shoulder.x || v.x < hipsAt.x) continue;
    if (!top || v.y > top.y) top = { p: v.clone(), bone: best };
  }
  const seatBone = mesh.skeleton.bones[top.bone];
  const seatLocal = seatBone.worldToLocal(top.p.clone());
  reset();
  update();

  const r3 = x => +x.toFixed(3);
  const report = {
    flight: { height: r3(flyY), pitch: +flightPitch.toFixed(1), torso: +torsoAngle.toFixed(1), beat: flight.beat },
    walk: { stride: S, cycle: C, speed: r3(S / C), duty, handDuty, lag, stretch: r3(walkStretch) },
    seat: { bone: seatBone.name, local: seatLocal.toArray().map(r3), carry: top.p.toArray().map(r3), bind: rig.joints[seatBone.name].clone().add(seatLocal).toArray().map(r3) },
  };
  return { clips, report };
}
