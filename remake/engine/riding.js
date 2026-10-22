import * as THREE from 'three';
import { mergeGeometries } from '../../dist/vendor/BufferGeometryUtils.js';
import { Handle } from './handle.js';
import { reachTwoBones } from './ik.js';
import { sparkleBurst, sparkleTrail } from '../world/props/sparkles.js';

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
/** Grows from nothing past its size and settles back (as the journal's star pops in). */
const popIn = t => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
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
  const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
  const bind = [];
  for (let i = 0; i < position.count; i++) bind.push(new V3().fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix));
  host.root.updateMatrixWorld(true);
  const skin = {
    mesh,
    // Metres in one bind unit (GLTFLoader binds with an identity bind matrix, in the mesh's own units).
    unit: mesh.getWorldScale(new V3()).x / host.root.getWorldScale(new V3()).x,
    bone(name) {
      const bone = findBone(host.model, name);
      const index = mesh.skeleton.bones.indexOf(bone);
      if (index < 0) throw new Error(`${host.name} has no bone named "${name}"`);
      const inverse = mesh.skeleton.boneInverses[index];
      return { bone, index, inverse, at: new V3().setFromMatrixPosition(inverse.clone().invert()) };
    },
    /** The bind-pose vertices that these bones (skeleton indices) carry at least half of. */
    carriedBy(bones) {
      const out = [];
      for (let i = 0; i < bind.length; i++) {
        let share = 0;
        for (let k = 0; k < 4; k++) if (bones.has(skinIndex.getComponent(i, k))) share += skinWeight.getComponent(i, k);
        if (share >= 0.5) out.push(bind[i]);
      }
      return out;
    },
  };
  skins.set(host, skin);
  return skin;
}

/**
 * The height of the top of a skin above (x, z), from its vertices: a plane fitted to the highest of them
 * within `reach` of (x, z) seen from above, in the units of the points. -Infinity where there are none.
 */
function topAt(points, x, z, reach) {
  let top = -Infinity;
  const near = [];
  for (const p of points) {
    if ((p.x - x) ** 2 + (p.z - z) ** 2 > reach * reach) continue;
    near.push(p);
    top = Math.max(top, p.y);
  }
  const layer = near.filter(p => p.y > top - reach); // the top of the skin, not what lies under it
  if (layer.length < 3) return top;
  // Least squares for y = a + b (px - x) + c (pz - z); a is the height at (x, z).
  let n = 0, sx = 0, sz = 0, sy = 0, sxx = 0, szz = 0, sxz = 0, sxy = 0, szy = 0;
  for (const p of layer) {
    const dx = p.x - x;
    const dz = p.z - z;
    n++; sx += dx; sz += dz; sy += p.y; sxx += dx * dx; szz += dz * dz; sxz += dx * dz; sxy += dx * p.y; szy += dz * p.y;
  }
  const det = n * (sxx * szz - sxz * sxz) - sx * (sx * szz - sxz * sz) + sz * (sx * sxz - sxx * sz);
  if (Math.abs(det) < 1e-12) return sy / n;
  return (sy * (sxx * szz - sxz * sxz) - sx * (sxy * szz - sxz * szy) + sz * (sxy * sxz - sxx * szy)) / det;
}

// The saddle --------------------------------------------------------------------------------------
// Sized for Egill, 1.1 m tall. In the sit clip his hips stay at standing height over his root, the
// underside of his thighs is SIT_DEPTH above it and his feet hang 0.19 m below that. On a back as broad
// as Mosi's they would sink into it, so the saddle raises him: he sits astride a narrow seat with his
// shins hanging beside it (they come no nearer the middle than 0.1 m), on a broad pad on the back, with
// a high cantle behind him and a leather loop in front for both hands.
//
// It sits on the top of Mosi's back behind his shoulders, in the middle of the spot the owner marked
// (2026-10-16): Egill's hips AHEAD (1.75 m) in front of the Body bone, which puts them 1.18 m along Mosi
// from his origin, and the pad from 0.74 to 1.44 m (also from his origin). The skin there is the Body's
// alone. With his head straight the frill stays more than 20 cm from Egill, standing and walking; but a
// head turned far round, or raised high, swings the frill's edge back onto him, so while he rides or
// floats up the host's looks are capped (LOOK_CAPS, below).
const LEATHER = '#6f5440'; // the colour of Egill's boots (STYLE.md section 3)
export const SIT_DEPTH = 0.32; // the underside of a sitting rider's thighs above his root (neck-ride.js sits him on her skin with it)
const FEET_BELOW = 0.21; // his feet below his seat, with 2 cm to spare
const AHEAD = 1.75;
const SEAT = { back: -0.17, front: 0.24, halfWidth: 0.095 }; // metres about the rider's hips
const PAD = { back: -0.44, front: 0.26, halfWidth: 0.42, thickness: 0.045 };
// The handle, a leather loop standing across the front of the seat (centre and radius, from the rider's
// root), and where his wrists go to hold it: well within reach of his short arms (0.27 m).
const HANDLE = { x: 0.225, y: 0.4625, radius: 0.105, tube: 0.022 };
const GRIP = { x: 0.18, y: 0.555, z: 0.085 };
// The caps (degrees) on the host's looks while a rider is on the saddle or floating up to it: how far his
// head may turn aside and tilt up. Measured on the baked Mosi with Egill seated, as the gap between their
// skins: without caps, a look round to his left or at Egill on his back comes within 0.4 to 2.4 cm of
// Egill standing. With them every look keeps 13.5 cm or more standing and 8.7 cm or more while Mosi
// walks, even one that asks for 50 degrees up. Watching Egill float up is safe only from starts behind
// the head: at most 1.5 m along Mosi from his origin on his left side, 2.5 m on his right (9 cm or more);
// from beside the head the frill reaches the floating Egill. The up cap is lookAt's own default, so it
// only stops a scene that asks for more.
const LOOK_CAPS = { yaw: 40, up: 30 };

// Builds closed shapes from rings of points that go round the same way (right side, top, left side,
// bottom, seen from behind), joined front to back with both ends closed.
function shapes() {
  const positions = [];
  const indices = [];
  const add = p => positions.push(p.x, p.y, p.z) / 3 - 1;
  return {
    loft(rings) {
      const n = rings[0].length;
      const first = positions.length / 3;
      for (const ring of rings) ring.forEach(add);
      for (let r = 0; r + 1 < rings.length; r++) {
        for (let i = 0; i < n; i++) {
          const a = first + r * n + i;
          const b = first + r * n + ((i + 1) % n);
          indices.push(a, a + n, b, b, a + n, b + n);
        }
      }
      for (const [ring, back] of [[rings[0], true], [rings[rings.length - 1], false]]) {
        const centre = add(ring.reduce((sum, p) => sum.add(p), new V3()).divideScalar(n));
        const start = positions.length / 3;
        ring.forEach(add); // the cap's own corners, so its edge stays crisp
        for (let i = 0; i < n; i++) {
          const a = start + i;
          const b = start + ((i + 1) % n);
          indices.push(...(back ? [centre, a, b] : [centre, b, a]));
        }
      }
    },
    geometry() {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      return geometry;
    },
  };
}

// The saddle's shape in its own frame (x forward, y up, z to the right side; metres, on the top of the
// back), from `back(x, z)`, the height of the back there. Returns the geometry, the seat (where the
// rider's root goes), the top of the seat and the grips (where his wrists go).
function saddleShape(back) {
  const build = shapes();
  // The pad: a cushion lying on the back, its edges rounded down onto it.
  const padRings = [];
  for (let k = 0; k <= 16; k++) {
    const x = PAD.back + ((PAD.front - PAD.back) * k) / 16;
    const along = Math.abs((2 * k) / 16 - 1);
    const ring = [];
    for (let j = 0; j <= 16; j++) {
      const z = PAD.halfWidth * (1 - (2 * j) / 16); // the top, right to left
      const edge = Math.max(along, Math.abs(z) / PAD.halfWidth);
      ring.push(new V3(x, back(x, z) + 0.006 + PAD.thickness * Math.sqrt(Math.max(0, 1 - edge ** 6)), z));
    }
    for (let j = 15; j >= 1; j--) ring.push(new V3(x, back(x, ring[j].z) - 0.03, ring[j].z)); // underneath, out of sight
    padRings.push(ring);
  }
  build.loft(padRings);
  // The seat: high enough to keep his feet off the back, narrow enough for his shins to hang beside it,
  // rising behind his hips into a high cantle and in front of his knees into the pommel the loop stands on.
  const feet = Math.max(...[0.1, 0.2].flatMap(x => [-0.17, 0.17].map(z => back(x, z))));
  const top = feet + FEET_BELOW;
  let bottom = Infinity;
  for (let x = SEAT.back; x <= SEAT.front + 1e-9; x += 0.03) for (const z of [-SEAT.halfWidth, 0, SEAT.halfWidth]) bottom = Math.min(bottom, back(x, z));
  bottom -= 0.06; // inside the back
  const profile = x => top + (x < -0.03 ? Math.min(0.14, 18 * (x + 0.03) ** 2) : x > 0.15 ? Math.min(0.07, 10 * (x - 0.15) ** 2) : 0);
  const seatRings = [];
  for (let k = 0; k <= 16; k++) {
    const t = -0.97 + (1.94 * k) / 16;
    const x = (SEAT.back + SEAT.front) / 2 + (t * (SEAT.front - SEAT.back)) / 2;
    const round = (1 - Math.abs(t) ** 4) ** 0.25; // rounded ends seen from above
    const half = SEAT.halfWidth * round;
    const height = (profile(x) - bottom) * round ** 0.8;
    const ring = [];
    for (let j = 0; j < 24; j++) {
      const a = (2 * Math.PI * j) / 24; // from the right side over the top
      const c = Math.cos(a);
      const s = Math.sin(a);
      ring.push(new V3(x, bottom + (height / 2) * (1 + Math.sign(s) * Math.abs(s) ** 0.6), half * Math.sign(c) * Math.abs(c) ** 0.6));
    }
    seatRings.push(ring);
  }
  build.loft(seatRings);
  const seat = new V3(0, top - SIT_DEPTH, 0);
  // The loop: five sixths of a ring standing across the saddle, open at the bottom, where its ends sink
  // into the pommel.
  const loop = new THREE.TorusGeometry(HANDLE.radius, HANDLE.tube, 10, 28, (5 / 3) * Math.PI);
  loop.rotateZ(-Math.PI / 3);
  loop.rotateY(Math.PI / 2);
  loop.translate(HANDLE.x, seat.y + HANDLE.y, 0);
  loop.deleteAttribute('uv');
  return {
    geometry: mergeGeometries([build.geometry(), loop]),
    seat,
    top,
    grips: { left: new V3(GRIP.x, seat.y + GRIP.y, -GRIP.z), right: new V3(GRIP.x, seat.y + GRIP.y, GRIP.z) },
  };
}

/**
 * A saddle on the host's back, hidden until appear(). It hangs on `bone` with the bone's scale
 * undone, so it follows the bone in any pose and stays in metres; `ahead` is how far in front of the
 * bone (along the host, metres) the rider's hips go. Returns
 *   object   the saddle (in the scene, on the bone)
 *   seat     where a rider's root goes, in the world, as of the last update()
 *   grips    { left, right }: where a rider's wrists go to hold the handle, likewise
 *   host     the host
 *   update() brings seat and grips up to date and returns the seat
 *   appear({ duration = 0.8 }) pops the saddle in with a burst of sparkles; returns a Handle
 */
export function createSaddle(host, { bone: boneName = 'Body', ahead = AHEAD } = {}) {
  const skin = skinOf(host);
  const { bone, inverse, at } = skin.bone(boneName);
  const unit = skin.unit;
  // The back under the saddle: skin the bone and the bones above it carry (for Mosi's Body bone, the
  // Body's own), never the neck and frill, which turn with his head.
  const chain = new Set();
  for (let b = bone; b?.isBone; b = b.parent) chain.add(skin.mesh.skeleton.bones.indexOf(b));
  const origin = new V3(at.x + ahead / unit, 0, at.z);
  const under = skin.carriedBy(chain).filter(p => Math.abs(p.x - origin.x) < 0.8 / unit && Math.abs(p.z - origin.z) < 0.6 / unit);
  const reach = 0.08 / unit;
  origin.y = topAt(under, origin.x, origin.z, reach);
  if (!Number.isFinite(origin.y)) throw new Error(`${host.name} has no back by ${boneName} to put a saddle on`);
  const back = (x, z) => {
    const y = topAt(under, origin.x + x / unit, origin.z + z / unit, reach);
    return Number.isFinite(y) ? (y - origin.y) * unit : 0;
  };
  const shape = saddleShape(back);
  const object = new THREE.Mesh(shape.geometry, new THREE.MeshStandardMaterial({ color: LEATHER, roughness: 0.8, metalness: 0 }));
  object.name = `${host.name} saddle`;
  object.castShadow = false; // a shadow would cost the shadow pass a draw call for a sliver on his back
  object.receiveShadow = true;
  const turn = new THREE.Quaternion();
  inverse.decompose(new V3(), turn, new V3());
  object.position.copy(origin).applyMatrix4(inverse); // in the bone's frame
  object.quaternion.copy(turn); // the bone's own turn in the bind pose, undone
  host.root.updateMatrixWorld(true);
  const size = host.root.getWorldScale(new V3()).x / bone.getWorldScale(new V3()).x; // undoes the bone's scale
  object.scale.setScalar(size);
  object.visible = false;
  bone.add(object);
  const seat = new V3();
  const grips = { left: new V3(), right: new V3() };
  function update() {
    object.updateWorldMatrix(true, false);
    grips.left.copy(shape.grips.left).applyMatrix4(object.matrixWorld);
    grips.right.copy(shape.grips.right).applyMatrix4(object.matrixWorld);
    return seat.copy(shape.seat).applyMatrix4(object.matrixWorld);
  }
  function appear({ duration = 0.8 } = {}) {
    const world = host.world;
    if (!world?.effects) throw new Error('saddle.appear needs the host\'s world.effects (engine/effects.js), which main.js updates');
    const handle = new Handle(`${host.name} saddle appears`);
    object.scale.setScalar(size);
    update();
    const burst = new V3(0.03, shape.top + 0.1, 0).applyMatrix4(object.matrixWorld); // just above the seat
    object.visible = true;
    object.scale.setScalar(size * 1e-4); // a zero scale would leave the normal matrix singular
    let t = 0;
    world.effects.add({
      update(dt) {
        if (handle.done) return false;
        t += dt;
        const k = clamp01(t / duration);
        object.scale.setScalar(size * Math.max(1e-4, popIn(k)));
        if (k < 1) return true;
        handle.finish();
        return false;
      },
    });
    handle.onCancel = () => object.scale.setScalar(size);
    sparkleBurst(world, burst, { duration, seed: `${host.name} saddle` });
    return handle;
  }
  update();
  return { object, seat, grips, host, update, appear };
}

// The seat with no saddle --------------------------------------------------------------------------
// Chapter 2 (scene 6): Egill sits on the back of Þórseðla's head while she lifts it from the bank to nine metres. Nothing is
// built: the seat is a frame on one of the host's bones that follows the bone's place and the way it faces seen from above,
// but never its pitch or roll, so the rider sits upright however steeply the neck rises under him.

/**
 * A seat on the host's bone `bone`, kept level. `offset` is where the rider's root goes, from the bone, and `grips` where his
 * wrists go, from there; each [across (to the rider's right), up, ahead] in metres in the level frame. Returns
 *   object      null: there is nothing to see
 *   seat        where a rider's root goes, in the world, as of the last update()
 *   grips       { left, right }: where his wrists go, likewise
 *   quaternion  the level frame's turn (x ahead, y up, z to the right, as a saddle's), likewise
 *   host        the host
 *   update()    brings them up to date and returns the seat
 * ride(), floatTo() and floatDown() take it as they take a saddle (they use seat, grips, host and update).
 */
export function createSeat(host, { bone: boneName, offset = [0, 0, 0], grips: hands = {} } = {}) {
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
  function update() {
    bone.updateWorldMatrix(true, false);
    bone.matrixWorld.decompose(origin, turn, facing);
    facing.copy(ahead).applyQuaternion(turn).setY(0);
    // A bone pointing straight up or down has no way it faces seen from above: the host's own way, then.
    if (facing.lengthSq() < 1e-8) facing.set(1, 0, 0).applyQuaternion(host.root.quaternion).setY(0);
    quaternion.setFromAxisAngle(UP, -Math.atan2(facing.z, facing.x));
    grips.left.copy(holds.left).applyQuaternion(quaternion).add(origin);
    grips.right.copy(holds.right).applyQuaternion(quaternion).add(origin);
    return seat.copy(at).applyQuaternion(quaternion).add(origin);
  }
  update();
  return { object: null, seat, grips, quaternion, host, update };
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
function handsOn(rider, grips) {
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

const HANDS_IN = 0.3; // seconds for his hands to go to the handle once he is in the seat

/**
 * The rider sits in the saddle: the root follows `saddle.seat` and the host's heading each frame, the
 * rider plays `sit`, and once seated his hands go to the handle's grips. A rider who is not on the seat
 * yet settles into it over `settle` seconds; one who is (after floatTo) stays exactly on it. stop()
 * gives the rider back where he is.
 */
export function ride(rider, saddle, { settle = 0.8 } = {}) {
  const from = { position: rider.root.position.clone(), quaternion: rider.root.quaternion.clone() };
  const blend = from.position.distanceTo(saddle.update()) < 0.02 ? 0 : settle;
  const hands = handsOn(rider, saddle.grips);
  const facing = new THREE.Quaternion();
  let t = 0;
  const controller = {
    drive(dt) {
      t += dt;
      hands.restore();
      saddle.update();
      facing.setFromAxisAngle(UP, -THREE.MathUtils.degToRad(saddle.host.heading));
      const k = blend > 0 ? smooth(clamp01(t / blend)) : 1;
      rider.root.position.lerpVectors(from.position, saddle.seat, k);
      rider.root.quaternion.slerpQuaternions(from.quaternion, facing, k);
    },
    pose() { hands.apply(smooth(clamp01((t - blend) / HANDS_IN))); },
    end() {
      hands.restore();
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
// seat is; he takes the sit pose for the last FLOAT_SIT seconds, so he lands sitting.
const FLOAT_HOVER = 0.9;
const FLOAT_SIT = 0.6;

/**
 * Lift the rider, cartoon-style, from where he stands onto the saddle's seat over `duration` seconds,
 * playing `lifted` and leaving a trail of sparkles. Returns a Handle that finishes with him exactly on
 * the seat, facing the host's way; he stays held there until ride() takes over (or another float).
 */
export function floatTo(rider, saddle, { duration = 2.2 } = {}) {
  const world = rider.world;
  if (!world?.effects) throw new Error('floatTo needs the rider\'s world.effects (engine/effects.js), which main.js updates');
  const handle = new Handle(`${rider.name} floats up`);
  const start = rider.root.position.clone();
  const startTurn = rider.root.quaternion.clone();
  const rise = new V3();
  const hover = new V3();
  const facing = new THREE.Quaternion();
  let t = 0;
  let sitting = false;
  const controller = {
    drive(dt) {
      if (!handle.cancelled) t += dt;
      const end = saddle.update();
      const u = clamp01(t / duration);
      const k = smooth(u);
      rise.set(start.x, end.y + FLOAT_HOVER, start.z);
      hover.copy(end).addScaledVector(UP, FLOAT_HOVER);
      const a = (1 - k) ** 3, b = 3 * (1 - k) ** 2 * k, c = 3 * (1 - k) * k * k, e = k ** 3;
      rider.root.position.set(0, 0, 0).addScaledVector(start, a).addScaledVector(rise, b).addScaledVector(hover, c).addScaledVector(end, e);
      facing.setFromAxisAngle(UP, -THREE.MathUtils.degToRad(saddle.host.heading));
      rider.root.quaternion.slerpQuaternions(startTurn, facing, smooth(clamp01(u / 0.7)));
      if (!sitting && t >= duration - FLOAT_SIT) {
        sitting = true;
        rider.play('sit', { fade: FLOAT_SIT });
      }
      if (u >= 1 && !handle.done) handle.finish();
    },
    end() {
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
  let t = 0;
  let standing = false;
  const controller = {
    drive(dt) {
      if (!handle.cancelled) t += dt;
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
    end() {
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
