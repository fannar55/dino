import * as THREE from 'three';
import { Handle } from './handle.js';
import { reachTwoBones } from './ik.js';
import { createFlierSaddle } from './flier-saddle.js';
import { sparkleTrail } from '../world/props/sparkles.js';

// Riding (chapter 1, scenes 5 and 6). A saddle pops onto Mosi's back, Egill floats up into it,
// cartoon-style, and rides there holding its handle:
//
//   const saddle = createSaddle(mosi);    // on his back behind the shoulders, hidden for now
//   yield saddle.appear();                // it pops in with a burst of sparkles
//   yield floatTo(egill, saddle);         // up, across and down into the seat, leaving sparkles behind
//   const riding = ride(egill, saddle);   // he sits there, hands on the handle, until riding.stop()
//   yield floatDown(egill, saddle, spot); // and off again: the float up backwards, onto his feet on the ground
//
// The float and the ride take the rider over (actor.control): each frame, in the rider's own update on
// the game clock, they put the rider's root, and after his clips the ride lays his hands on the handle.
// updateActors (actor.js) updates riders after their hosts, so a rider sits on the saddle as it is in
// that frame. What moves by itself (the pop, the sparkles) runs on world.effects (engine/effects.js).
//
// Yield a float outside any race. A float that is cancelled (its Handle, or the task waiting on it) stops
// where it had got to and leaves the rider held there, in mid-air and controlled, and the host's looks
// still capped: nothing puts him down. Only ride() or another float takes him on from there (and ends the
// caps), so a script that races a float must start one of those itself when the float loses.
//
// Sizes are metres. The host's bones carry its GLB's scale (Mosi's root node makes him 8.5 m long);
// the saddle and the rider follow a bone's place and turn, never its scale.

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
const smooth = t => t * t * (3 - 2 * t);
const clamp01 = t => Math.min(1, Math.max(0, t));
const findBone = (model, name) => model.getObjectByName(name) ?? model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));

/**
 * The heading (degrees: 0 facing +X, 90 facing +Z, as actor.js counts it) that a turned root faces, read from its quaternion:
 * the way its +X axis points, seen from above. An actor reads its heading from rotation.y, which is right only for a turn about
 * the vertical alone; a quaternion a controller has set past 90 degrees decomposes as (180, 180 - y, 180) and reads wrong.
 */
export function headingOf(quaternion) {
  const forward = new V3(1, 0, 0).applyQuaternion(quaternion);
  return THREE.MathUtils.radToDeg(Math.atan2(forward.z, forward.x));
}

// The host's skin as it was bound. What is measured there (the top of his back) is measured in the bind
// pose, where each bone's inverse bind matrix starts, so it holds in whatever pose the clips give him
// later. Only vertices are read: every level of detail shares them (character-lod.js swaps only the
// triangles), so the measure is the same whatever level is drawing.
const skins = new WeakMap();
function skinOf(host) {
  if (skins.has(host)) return skins.get(host);
  let mesh = null; // the body: the skinned mesh with the most vertices, not an eyelid or a shadow caster
  host.model.traverse(o => {
    if (o.isSkinnedMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o;
  });
  if (!mesh) throw new Error(`${host.name} has no skin to sit on`);
  const skin = {
    mesh,
    bone(name) {
      const bone = findBone(host.model, name);
      const index = mesh.skeleton.bones.indexOf(bone);
      if (index < 0) throw new Error(`${host.name} has no bone named "${name}"`);
      const inverse = mesh.skeleton.boneInverses[index];
      return { bone, index, inverse, mesh };
    },
  };
  skins.set(host, skin);
  return skin;
}

// The saddle --------------------------------------------------------------------------------------
// The owner's Tripo saddle, the same as Flugeðla's (engine/flier-saddle.js), fitted to Mosi's back by tools/saddle-fit.mjs --host=mosi:
// its pad draped over his back behind his shoulders, on the spot the owner marked (2026-10-16: Egill's hips 1.75 m in front of the
// Body bone, 1.18 m along Mosi from his origin), and bound to his Body bone, so it moves with his back as he stands and walks. Egill
// sits on its seat with his hands round its handlebar, leaning to it, his knees out to the sides over Mosi's broad back and his feet
// back on the pad (Egill is 1.1 m tall; the back is more than a metre across, so he kneels astride it as on Flugeðla's).
//
// With his head straight Mosi's frill stays clear of Egill, standing and walking; but a head turned far round, or raised high, swings
// the frill's edge back onto him, so while he rides or floats up the host's looks are capped (LOOK_CAPS, below).
export const SIT_DEPTH = 0.32; // the underside of a sitting rider's thighs above his root (neck-ride.js sits him on her skin with it)
export const MOSI_SADDLE_MODEL = new URL('../assets/characters/mosi-saddle.glb', import.meta.url).href;
// Its places as saddle-fit wrote them into the file (extras.places: bind points in his own units, with their weights) and the up of
// its frame (extras.frame.up), so that Egill can be seated on it from the first frame, before the file has loaded; tests/riding.test.mjs
// keeps them the file's.
export const MOSI_SADDLE = {
  up: [0, 1, 0],
  seat: { bind: [0.55836, 1.56824, -0.00207], weights: { Body: 1 } },
  grips: { left: { bind: [0.66573, 1.64886, -0.07305], weights: { Body: 1 } }, right: { bind: [0.66573, 1.64886, 0.07847], weights: { Body: 1 } } },
  knees: { left: { bind: [0.63781, 1.62074, -0.12552], weights: { Body: 1 } }, right: { bind: [0.63873, 1.61877, 0.12545], weights: { Body: 1 } } },
  ankles: { left: { bind: [0.59579, 1.56509, -0.14913], weights: { Body: 1 } }, right: { bind: [0.59704, 1.56268, 0.14746], weights: { Body: 1 } } },
};
// Each wrist from the middle of its grip on the bar, [ahead, up, across] in the saddle's frame: a little behind and over it, his hand
// round the bar (as on Flugeðla's: engine/flier.js WRIST). And how far his spine leans forward to the bar (flier.js LEAN).
const WRIST = [-0.04, 0.03, 0];
const LEAN = 12;
// The caps (degrees) on the host's looks while a rider is on the saddle or floating up to it: how far his
// head may turn aside and tilt up. Measured on the baked Mosi with Egill seated, as the gap between their
// skins: without caps, a look round to his left or at Egill on his back comes within 0.4 to 2.4 cm of
// Egill standing. With them every look keeps 13.5 cm or more standing and 8.7 cm or more while Mosi
// walks, even one that asks for 50 degrees up. Watching Egill float up is safe only from starts behind
// the head: at most 1.5 m along Mosi from his origin on his left side, 2.5 m on his right (9 cm or more);
// from beside the head the frill reaches the floating Egill. The up cap is lookAt's own default, so it
// only stops a scene that asks for more.
const LOOK_CAPS = { yaw: 40, up: 30 };

/**
 * Mosi's saddle on the host's back (the file fitted to Mosi's, `url`), hidden until show() or appear(). Returns
 *   object   the saddle's mesh, on his skeleton next to his body (null until its file has loaded)
 *   loaded   a Promise of true once it is on him (false where the file could not be had: he is ridden bare-backed, on its places)
 *   seat     where a rider's root goes, in the world, as of the last update()
 *   grips    { left, right }: where a rider's wrists go to hold the bar, likewise
 *   knees, ankles  { left, right }: where his knees bend toward and his feet go, likewise (ride() lays his legs on them)
 *   lean     the degrees his spine leans forward to the bar as he rides
 *   host     the host
 *   update() brings them up to date and returns the seat
 *   show() / hide()  on his back at once, or off; shown: whether it is
 *   appear({ duration = 0.8 }) pops the saddle in with a burst of sparkles; returns a Handle
 *   size     its size from its seat (1 as fitted): chapter 1's glitter swells it a little and back
 */
export function createSaddle(host, { url = MOSI_SADDLE_MODEL, places = MOSI_SADDLE } = {}) {
  const fitted = createFlierSaddle(host, { url, places });
  // The seat's bone, for its frame: the way up and ahead on his back as it is posed now.
  const boneName = Object.keys(places.seat.weights).reduce((a, b) => (places.seat.weights[a] >= places.seat.weights[b] ? a : b));
  const { bone, inverse, mesh } = skinOf(host).bone(boneName);
  const upBind = new V3(...places.up);
  const seat = new V3();
  const grips = { left: new V3(), right: new V3() };
  const knees = { left: new V3(), right: new V3() };
  const ankles = { left: new V3(), right: new V3() };
  const toWorld = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const up = new V3();
  const wrist = new V3();
  const scratch = new V3();
  function update() {
    host.root.updateMatrixWorld(true);
    const on = fitted.update();
    toWorld.multiplyMatrices(bone.matrixWorld, inverse).multiply(mesh.bindMatrix);
    toWorld.decompose(scratch, turn, wrist);
    up.copy(upBind).applyQuaternion(turn).normalize();
    seat.copy(on.seat).addScaledVector(up, -SIT_DEPTH);
    wrist.set(WRIST[0], WRIST[1], WRIST[2]).applyQuaternion(turn);
    for (const side of ['left', 'right']) {
      grips[side].copy(on.grips[side]).add(wrist);
      knees[side].copy(on.knees[side]);
      ankles[side].copy(on.ankles[side]);
    }
    return seat;
  }
  update();
  return {
    host, seat, grips, knees, ankles, lean: LEAN, flatFeet: true, // his back is broad: Egill's soles lie on the pad (legsOn)
    loaded: fitted.loaded,
    get object() { return fitted.mesh; },
    get shown() { return fitted.shown; },
    get size() { return fitted.size; },
    set size(k) { fitted.size = k; },
    update,
    show() { fitted.show(); },
    hide() { fitted.hide(); },
    appear(options) { return fitted.appear(options); },
    dispose() { fitted.dispose(); },
  };
}

// The seat with no saddle --------------------------------------------------------------------------
const SEAT_FLAT = 0.3; // below this much of the bone's way lying flat, the seat turns toward the host's own way
// Chapter 2 (scene 6): Egill sits on the back of Þórseðla's head while she lifts it from the bank to nine metres. Nothing is
// built: the seat is a frame on one of the host's bones that follows the bone's place and the way it faces seen from above,
// but never its pitch or roll, so the rider sits upright however steeply the neck rises under him.

/**
 * A seat on the host's bone `bone` (required), kept level. `offset` is where the rider's root goes, from the bone, and `grips` where
 * his wrists go, from there; each [across (to the rider's right), up, ahead] in metres in the level frame. The way it faces is the
 * bone's own seen from above; as the bone comes near to pointing straight up or down (less than SEAT_FLAT of it lies flat), it turns
 * to the host's own way, so that it never flips. Returns
 *   object      null: there is nothing to see
 *   seat        where a rider's root goes, in the world, as of the last update()
 *   grips       { left, right }: where his wrists go, likewise
 *   quaternion  the level frame's turn (x ahead, y up, z to the right, as a saddle's), likewise
 *   host        the host
 *   update()    brings them up to date and returns the seat
 * ride(), floatTo() and floatDown() take it as they take a saddle (they use seat, grips, host and update).
 *
 * With `skin` the rider sits on the host's skin instead: { seat, grips: { left, right }, knees, ankles }, points in the bone's own
 * frame (they turn with it, so they stay on her skin however her head pitches). The seat of his trousers goes on `seat` (his root
 * SIT_DEPTH under it, upright), his wrists to `grips`, and his legs astride to `knees` and `ankles` (legsOn), his spine leaning
 * `lean` degrees and his soles flat (`flatFeet`) on a broad top. The seat then also returns knees, ankles, lean and flatFeet.
 */
export function createSeat(host, { bone: boneName, offset = [0, 0, 0], grips: hands = {}, skin = null, lean = 0, flatFeet = false } = {}) {
  if (!boneName) throw new TypeError('createSeat needs the bone the seat is on: { bone: \'Head\' }');
  const { bone, inverse } = skinOf(host).bone(boneName);
  // The way the host faces, in the bone's own frame as it was bound (the host faces +X in its model's frame).
  const ahead = new V3(1, 0, 0).transformDirection(inverse);
  const frame = ([across, up, forward]) => new V3(forward, up, across); // [across, up, ahead] -> (ahead, up, across)
  const at = frame(offset);
  const holds = { left: frame(hands.left ?? [-0.12, 0.45, 0.08]).add(at), right: frame(hands.right ?? [0.12, 0.45, 0.08]).add(at) };
  const seat = new V3();
  const grips = { left: new V3(), right: new V3() };
  const quaternion = new THREE.Quaternion();
  const origin = new V3();
  const turn = new THREE.Quaternion();
  const facing = new V3();
  const hostWay = new V3();
  const pair = p => ({ left: new V3(...p.left), right: new V3(...p.right) });
  const on = skin && { seat: new V3(...skin.seat), grips: pair(skin.grips), knees: skin.knees && pair(skin.knees), ankles: skin.ankles && pair(skin.ankles) };
  const knees = on?.knees ? { left: new V3(), right: new V3() } : null;
  const ankles = on?.ankles ? { left: new V3(), right: new V3() } : null;
  function update() {
    bone.updateWorldMatrix(true, false);
    bone.matrixWorld.decompose(origin, turn, facing);
    facing.copy(ahead).applyQuaternion(turn).setY(0);
    // Near straight up or down a bone has little way it faces seen from above: toward the host's own way, all of it at the last.
    const flat = facing.length();
    if (flat < SEAT_FLAT) {
      hostWay.set(1, 0, 0).applyQuaternion(host.root.quaternion).setY(0).normalize();
      const k = flat / SEAT_FLAT;
      facing.multiplyScalar(flat > 1e-6 ? k / flat : 0).addScaledVector(hostWay, 1 - k);
      if (facing.lengthSq() < 1e-8) facing.copy(hostWay);
    }
    quaternion.setFromAxisAngle(UP, -Math.atan2(facing.z, facing.x));
    if (on) {
      for (const side of ['left', 'right']) {
        grips[side].copy(on.grips[side]).applyMatrix4(bone.matrixWorld);
        knees?.[side].copy(on.knees[side]).applyMatrix4(bone.matrixWorld);
        ankles?.[side].copy(on.ankles[side]).applyMatrix4(bone.matrixWorld);
      }
      return seat.copy(on.seat).applyMatrix4(bone.matrixWorld).addScaledVector(UP, -SIT_DEPTH);
    }
    grips.left.copy(holds.left).applyQuaternion(quaternion).add(origin);
    grips.right.copy(holds.right).applyQuaternion(quaternion).add(origin);
    return seat.copy(at).applyQuaternion(quaternion).add(origin);
  }
  update();
  return { object: null, seat, grips, knees, ankles, lean: on ? lean : 0, flatFeet: Boolean(on && flatFeet), quaternion, host, update };
}

// Taking riders over ------------------------------------------------------------------------------
// One thing moves a rider at a time: a new float or ride ends the one before.
const controllers = new WeakMap();
// Cap the host's looks while a rider is on him (LOOK_CAPS); returns what puts the earlier caps back.
function capLooks(host) {
  const before = { yaw: host.lookYawLimit, up: host.lookUpLimit };
  host.lookYawLimit = Math.min(before.yaw ?? Infinity, LOOK_CAPS.yaw);
  host.lookUpLimit = Math.min(before.up ?? Infinity, LOOK_CAPS.up);
  return () => {
    host.lookYawLimit = before.yaw ?? Infinity;
    host.lookUpLimit = before.up ?? Infinity;
  };
}

function take(rider, controller) {
  controllers.get(rider)?.end();
  controllers.set(rider, controller);
  rider.control(controller.drive, controller.pose ?? null);
}
function release(rider, controller) {
  if (controllers.get(rider) !== controller) return;
  controller.end();
  controllers.delete(rider);
  // Given back turned about the vertical alone, as the actor turns itself (it reads its heading from rotation.y).
  rider.root.rotation.set(0, -THREE.MathUtils.degToRad(headingOf(rider.root.quaternion)), 0);
  rider.control(null);
}

/**
 * Something else that carries a rider (neck-ride.js: the slide down Þórseðla's neck) takes him over as a float or a ride does:
 * `controller` is { drive(dt), pose?(dt), end() }, and the float or ride before it ends (end() is called on it). The next
 * float or ride ends this one in turn. Returns what gives him back where he is (the controller's end() is called).
 */
export function carryRider(rider, controller) {
  take(rider, controller);
  return { release: () => release(rider, controller) };
}

// The rider's hands on the saddle's handle. After his clips have posed his arms, each arm reaches for
// its grip (ik.js's reachTwoBones: upper arm and forearm, the elbow bending where the clip bends it),
// the target blended in from the clip's own wrist. The clip's arm pose goes back before his clips run
// again, because the mixer leaves a bone alone when its value does not change (the sit clip holds the
// arms still).
export function handsOn(rider, grips) {
  const arms = [['Left', grips.left], ['Right', grips.right]].map(([side, grip]) => {
    const upper = findBone(rider.model, `${side}UpperArm`);
    const lower = findBone(rider.model, `${side}LowerArm`);
    const hand = findBone(rider.model, `${side}Hand`);
    return upper && lower && hand ? { upper, lower, hand, grip, upperTurn: new THREE.Quaternion(), lowerTurn: new THREE.Quaternion() } : null;
  }).filter(Boolean);
  let applied = false;
  const wrist = new V3();
  const target = new V3();
  return {
    restore() {
      if (!applied) return;
      for (const arm of arms) {
        arm.upper.quaternion.copy(arm.upperTurn);
        arm.lower.quaternion.copy(arm.lowerTurn);
      }
      applied = false;
    },
    apply(weight) {
      if (weight <= 0) return;
      rider.root.updateMatrixWorld(true);
      for (const arm of arms) {
        arm.upperTurn.copy(arm.upper.quaternion);
        arm.lowerTurn.copy(arm.lower.quaternion);
        target.lerpVectors(arm.hand.getWorldPosition(wrist), arm.grip, weight);
        reachTwoBones(arm.upper, arm.lower, arm.hand, target);
      }
      applied = true;
    },
  };
}

// The rider's legs astride a back, and his spine leaning to the grips. After his clips have posed him, his spine leans `lean` degrees
// forward and each leg reaches for its ankle's place (ik.js reachTwoBones: thigh and shin, the knee bending toward its pole), the
// targets blended in from the clip's own ankle and knee. With `flatFeet` (a broad back: Mosi's) his feet keep the clip's turn under
// him, soles down, as his shins swing out; else they roll with his shins. As with the hands, the clip's pose goes back before his
// clips run again. Apply it before the hands: they reach from where the spine has put the shoulders.
const LEAN_AXIS = new V3(0, 0, 1);
export function legsOn(rider, ankles, knees, { lean = 0, flatFeet = false } = {}) {
  const legs = [['Left', ankles.left, knees.left], ['Right', ankles.right, knees.right]].map(([side, ankle, knee]) => {
    const upper = findBone(rider.model, `${side}UpperLeg`);
    const lower = findBone(rider.model, `${side}LowerLeg`);
    const foot = findBone(rider.model, `${side}Foot`);
    return upper && lower && foot ? { upper, lower, foot, ankle, knee, upperTurn: new THREE.Quaternion(), lowerTurn: new THREE.Quaternion(), footTurn: new THREE.Quaternion() } : null;
  }).filter(Boolean);
  const spine = findBone(rider.model, 'Spine');
  const spineTurn = new THREE.Quaternion();
  const bend = new THREE.Quaternion();
  const sole = new THREE.Quaternion();
  const shin = new THREE.Quaternion();
  let applied = false;
  const at = new V3();
  const target = new V3();
  const pole = new V3();
  return {
    restore() {
      if (!applied) return;
      for (const leg of legs) {
        leg.upper.quaternion.copy(leg.upperTurn);
        leg.lower.quaternion.copy(leg.lowerTurn);
        leg.foot.quaternion.copy(leg.footTurn);
      }
      spine?.quaternion.copy(spineTurn);
      applied = false;
    },
    apply(weight) {
      if (weight <= 0) return;
      if (spine) {
        spineTurn.copy(spine.quaternion);
        spine.quaternion.multiply(bend.setFromAxisAngle(LEAN_AXIS, -THREE.MathUtils.degToRad(lean * weight)));
      }
      rider.root.updateMatrixWorld(true);
      for (const leg of legs) {
        leg.upperTurn.copy(leg.upper.quaternion);
        leg.lowerTurn.copy(leg.lower.quaternion);
        leg.footTurn.copy(leg.foot.quaternion);
        if (flatFeet) leg.foot.getWorldQuaternion(sole); // the sit clip's foot under him: sole down, toes ahead
        target.lerpVectors(leg.foot.getWorldPosition(at), leg.ankle, weight);
        pole.lerpVectors(leg.lower.getWorldPosition(at), leg.knee, weight);
        reachTwoBones(leg.upper, leg.lower, leg.foot, target, pole);
        // on a broad back (flatFeet) the foot keeps that turn as the shin swings out astride, so his soles stay on the pad, not
        // turned out to the side; on a narrow one it rolls with the shin, against her flank
        if (flatFeet) {
          leg.lower.getWorldQuaternion(shin);
          leg.foot.quaternion.slerp(shin.invert().multiply(sole), weight);
        }
      }
      applied = true;
    },
  };
}

const HANDS_IN = 0.3; // seconds for his hands to go to the handle once he is in the seat

/**
 * The rider sits in the saddle: the root follows `saddle.seat` and the host's heading each frame, the
 * rider plays `sit`, and once seated his hands go to the handle's grips, and on a saddle with places for
 * them (Mosi's: knees, ankles) his legs go astride the back and his spine leans `saddle.lean` degrees to
 * the bar. A rider who is not on the seat yet settles into it over `settle` seconds, his legs going astride
 * as his hands go to the bar; one who is (after floatTo, which has laid his legs there) stays exactly on
 * it, his legs astride at once. stop() gives the rider back where he is.
 */
export function ride(rider, saddle, { settle = 0.8 } = {}) {
  const from = { position: rider.root.position.clone(), quaternion: rider.root.quaternion.clone() };
  const blend = from.position.distanceTo(saddle.update()) < 0.02 ? 0 : settle;
  const hands = handsOn(rider, saddle.grips);
  const legs = saddle.knees && saddle.ankles ? legsOn(rider, saddle.ankles, saddle.knees, { lean: saddle.lean ?? 0, flatFeet: Boolean(saddle.flatFeet) }) : null;
  const facing = new THREE.Quaternion();
  let t = 0;
  const controller = {
    drive(dt) {
      t += dt;
      hands.restore();
      legs?.restore();
      saddle.update();
      facing.setFromAxisAngle(UP, -THREE.MathUtils.degToRad(saddle.host.heading));
      const k = blend > 0 ? smooth(clamp01(t / blend)) : 1;
      rider.root.position.lerpVectors(from.position, saddle.seat, k);
      rider.root.quaternion.slerpQuaternions(from.quaternion, facing, k);
    },
    pose() {
      const k = smooth(clamp01((t - blend) / HANDS_IN));
      legs?.apply(blend > 0 ? k : 1); // first: the spine's lean moves his shoulders, which the hands reach from
      hands.apply(k);
    },
    end() {
      hands.restore();
      legs?.restore();
      uncap();
    },
  };
  take(rider, controller);
  const uncap = capLooks(saddle.host);
  rider.play('sit', { fade: 0.5 });
  return { stop: () => release(rider, controller) };
}

// The float: a cubic curve, eased at both ends, from where he stands straight up toward FLOAT_HOVER m
// above the seat, across, and down onto it, so it peaks about half a metre over the seat wherever the
// seat is; he takes the sit pose for the last FLOAT_SIT seconds, so he lands sitting, and on a saddle with places for his legs
// they open astride onto it over those seconds (ride() keeps them there).
const FLOAT_HOVER = 0.9;
const FLOAT_SIT = 0.6;

/**
 * Lift the rider, cartoon-style, from where he stands onto the saddle's seat over `duration` seconds,
 * playing `lifted` and leaving a trail of sparkles. Returns a Handle that finishes with him exactly on
 * the seat, facing the host's way; he stays held there until ride() takes over (or another float).
 * With `carryLegs` his legs open astride as they will sit, carried down with him (each place as far over the saddle's as he is
 * over the seat), not reaching down to it ahead of him: for a seat close over skin (createSeat `skin`), where they would go into it.
 */
export function floatTo(rider, saddle, { duration = 2.2, carryLegs = false } = {}) {
  const world = rider.world;
  if (!world?.effects) throw new Error('floatTo needs the rider\'s world.effects (engine/effects.js), which main.js updates');
  const handle = new Handle(`${rider.name} floats up`);
  const start = rider.root.position.clone();
  const startTurn = rider.root.quaternion.clone();
  const rise = new V3();
  const hover = new V3();
  const facing = new THREE.Quaternion();
  const astride = saddle.knees && saddle.ankles;
  const pair = () => ({ left: new V3(), right: new V3() });
  const carried = astride && carryLegs ? { ankles: pair(), knees: pair(), over: new V3() } : null;
  const legs = astride ? legsOn(rider, carried?.ankles ?? saddle.ankles, carried?.knees ?? saddle.knees, { lean: saddle.lean ?? 0, flatFeet: Boolean(saddle.flatFeet) }) : null;
  let t = 0;
  let sitting = false;
  const controller = {
    drive(dt) {
      if (!handle.cancelled) t += dt;
      legs?.restore();
      const end = saddle.update();
      const u = clamp01(t / duration);
      const k = smooth(u);
      rise.set(start.x, end.y + FLOAT_HOVER, start.z);
      hover.copy(end).addScaledVector(UP, FLOAT_HOVER);
      const a = (1 - k) ** 3, b = 3 * (1 - k) ** 2 * k, c = 3 * (1 - k) * k * k, e = k ** 3;
      rider.root.position.set(0, 0, 0).addScaledVector(start, a).addScaledVector(rise, b).addScaledVector(hover, c).addScaledVector(end, e);
      if (carried) {
        carried.over.subVectors(rider.root.position, end);
        for (const side of ['left', 'right']) {
          carried.ankles[side].copy(saddle.ankles[side]).add(carried.over);
          carried.knees[side].copy(saddle.knees[side]).add(carried.over);
        }
      }
      facing.setFromAxisAngle(UP, -THREE.MathUtils.degToRad(saddle.host.heading));
      rider.root.quaternion.slerpQuaternions(startTurn, facing, smooth(clamp01(u / 0.7)));
      if (!sitting && t >= duration - FLOAT_SIT) {
        sitting = true;
        rider.play('sit', { fade: FLOAT_SIT });
      }
      if (u >= 1 && !handle.done) handle.finish();
    },
    pose() { legs?.apply(smooth(clamp01((t - (duration - FLOAT_SIT)) / FLOAT_SIT))); },
    end() {
      legs?.restore();
      if (!handle.done) handle.cancel(); // a cancelled float leaves him held where he is
      uncap();
    },
  };
  take(rider, controller);
  const uncap = capLooks(saddle.host);
  rider.play('lifted', { fade: 0.3 });
  const trail = new V3();
  sparkleTrail(world, () => rider.centre(trail), { duration: 0.9 * duration, seed: `${rider.name} float` });
  return handle;
}

/**
 * The float down: the float up backwards. The rider rises off the seat, floats out over the host's side and comes down onto
 * `spot` ([x, z] on the ground, or a point spec taken where it is now) over `duration` seconds, playing `lifted` with a trail of
 * sparkles, and lands standing (idle) facing `heading` (degrees; when left out, the way he faces now, read by headingOf from the
 * turn a ride has given him, since his own heading reads wrong past 90 degrees while he rides). It takes him over from a
 * ride, which ends. The curve and its timing are floatTo's reversed, so a spot a float up may start from is one he may land on
 * (LOOK_CAPS above: the host's looks are capped until he is down). Returns a Handle that finishes with him on the ground, given
 * back (actor.control(null)), so footing has his feet from there.
 */
const LEGS_OFF = 0.4; // seconds his legs take to come off a saddle's pad as he rises off it (floatDown)
export function floatDown(rider, saddle, spot, { duration = 2.2, heading = headingOf(rider.root.quaternion) } = {}) {
  const world = rider.world;
  if (!world?.effects) throw new Error('floatDown needs the rider\'s world.effects (engine/effects.js), which main.js updates');
  const handle = new Handle(`${rider.name} floats down`);
  const ground = Array.isArray(spot) && spot.length === 2 ? new V3(spot[0], 0, spot[1]) : world.resolvePoint(spot, new V3());
  ground.y = world.heightAt?.(ground.x, ground.z) ?? ground.y;
  const startTurn = rider.root.quaternion.clone();
  const facing = new THREE.Quaternion().setFromAxisAngle(UP, -THREE.MathUtils.degToRad(heading));
  const lift = new V3();
  const over = new V3();
  const legs = saddle.knees && saddle.ankles ? legsOn(rider, saddle.ankles, saddle.knees, { lean: saddle.lean ?? 0, flatFeet: Boolean(saddle.flatFeet) }) : null;
  let t = 0;
  let standing = false;
  const controller = {
    drive(dt) {
      if (!handle.cancelled) t += dt;
      legs?.restore();
      const seat = saddle.update();
      const u = clamp01(t / duration);
      const k = smooth(u);
      lift.copy(seat).addScaledVector(UP, FLOAT_HOVER);
      over.set(ground.x, seat.y + FLOAT_HOVER, ground.z);
      const a = (1 - k) ** 3, b = 3 * (1 - k) ** 2 * k, c = 3 * (1 - k) * k * k, e = k ** 3;
      rider.root.position.set(0, 0, 0).addScaledVector(seat, a).addScaledVector(lift, b).addScaledVector(over, c).addScaledVector(ground, e);
      rider.root.quaternion.slerpQuaternions(startTurn, facing, smooth(clamp01((u - 0.3) / 0.7)));
      if (!standing && t >= duration - FLOAT_SIT) {
        standing = true;
        rider.play('idle', { fade: FLOAT_SIT });
      }
      if (u >= 1 && !handle.done) {
        handle.finish();
        release(rider, controller); // on his feet: footing takes them from here
      }
    },
    pose() { legs?.apply(1 - smooth(clamp01(t / LEGS_OFF))); },
    end() {
      legs?.restore();
      if (!handle.done) handle.cancel(); // a cancelled float leaves him held where he is
      uncap();
    },
  };
  take(rider, controller);
  const uncap = capLooks(saddle.host);
  rider.play('lifted', { fade: FLOAT_SIT });
  const trail = new V3();
  sparkleTrail(world, () => rider.centre(trail), { duration: 0.9 * duration, seed: `${rider.name} float down` });
  return handle;
}
