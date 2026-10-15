import * as THREE from 'three';
import { Handle } from './handle.js';

// Riding (chapter 1, scenes 5 and 6). Mosi lays his tail down as a ramp (his tailDown clip, played
// once), Egill climbs it to the saddle on Mosi's back and rides there:
//
//   const saddle = createSaddle(mosi);                              // on his back, from now on
//   mosi.play('tailDown', { once: true });
//   yield climbAlong(egill, () => tailPath(mosi), { to: 1 / 3 });  // a climb in legs, a tap each
//   yield climbAlong(egill, () => tailPath(mosi), { from: 1 / 3, to: 2 / 3 });
//   ...
//   const riding = ride(egill, saddle);                              // until riding.stop()
//
// A climb or a ride takes the rider over (actor.control): each frame, in the rider's own update on the
// game clock, it puts the rider's root, and the rider's clips play on top. Update the host before its
// rider (main.js updates the actors in the chapter's order: list the host first), so the rider stands
// on the tail and sits on the saddle as they are in that frame.
//
// Sizes are metres. The host's bones carry its GLB's scale (Mosi's root node makes him 8.5 m long);
// the saddle and the rider follow a bone's place and turn, never its scale.

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
const smooth = t => t * t * (3 - 2 * t);
const clamp01 = t => Math.min(1, Math.max(0, t));
const findBone = (model, name) => model.getObjectByName(name) ?? model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));

// The host's skin as it was bound. What is measured there (the top of the back, the top of the tail)
// is measured in the bind pose, where each bone's inverse bind matrix starts, so it holds in whatever
// pose the clips give the host later.
const skins = new WeakMap();
function skinOf(host) {
  if (skins.has(host)) return skins.get(host);
  let mesh = null;
  host.model.traverse(o => { if (!mesh && o.isSkinnedMesh) mesh = o; });
  if (!mesh) throw new Error(`${host.name} has no skin to climb or sit on`);
  const { position } = mesh.geometry.attributes;
  const bind = [];
  for (let i = 0; i < position.count; i++) bind.push(new V3().fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix));
  const triangles = mesh.geometry.index ? mesh.geometry.index.array : [...bind.keys()];
  host.root.updateMatrixWorld(true);
  const skin = {
    mesh,
    bind,
    // Metres in one bind unit (GLTFLoader binds with an identity bind matrix, in the mesh's own units).
    unit: mesh.getWorldScale(new V3()).x / host.root.getWorldScale(new V3()).x,
    bone(name) {
      const bone = findBone(host.model, name);
      const index = mesh.skeleton.bones.indexOf(bone);
      if (index < 0) throw new Error(`${host.name} has no bone named "${name}"`);
      const inverse = mesh.skeleton.boneInverses[index];
      return { bone, index, inverse, at: new V3().setFromMatrixPosition(inverse.clone().invert()) };
    },
    /** The triangles (vertex index triples) over a box of the bind space seen from above. */
    near(x0, x1, z0, z1) {
      const out = [];
      for (let t = 0; t < triangles.length; t += 3) {
        const a = bind[triangles[t]], b = bind[triangles[t + 1]], c = bind[triangles[t + 2]];
        if (Math.max(a.x, b.x, c.x) < x0 || Math.min(a.x, b.x, c.x) > x1 || Math.max(a.z, b.z, c.z) < z0 || Math.min(a.z, b.z, c.z) > z1) continue;
        out.push(triangles[t], triangles[t + 1], triangles[t + 2]);
      }
      return out;
    },
    /** The height of the top of the skin above (x, z) in the bind space, from the given triangles. */
    topAt(x, z, near) {
      let top = -Infinity;
      for (let t = 0; t < near.length; t += 3) {
        const a = bind[near[t]], b = bind[near[t + 1]], c = bind[near[t + 2]];
        const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
        if (Math.abs(d) < 1e-12) continue;
        const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
        const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
        if (u < 0 || v < 0 || u + v > 1) continue;
        top = Math.max(top, u * a.y + v * b.y + (1 - u - v) * c.y);
      }
      return top;
    },
  };
  skins.set(host, skin);
  return skin;
}

// The saddle --------------------------------------------------------------------------------------
// Sized for Egill, 1.1 m tall. In the sit clip his hips stay at standing height over his root, the
// underside of his thighs is SIT_DEPTH above it and his feet hang 0.19 m below that. On a back as broad
// as Mosi's they would sink into it, so the saddle raises him: he sits astride a narrow seat with his
// shins hanging beside it (they come no nearer the middle than 0.1 m), on a pad that lies on the back.
const LEATHER = '#6f5440'; // the colour of Egill's boots (STYLE.md section 3)
const SIT_DEPTH = 0.32;
const FEET_BELOW = 0.21; // his feet below his seat, with 2 cm to spare
const AHEAD = 0.45; // the saddle sits this far in front of its bone, where Mosi's back is flatter
const SEAT = { back: -0.16, front: 0.24, halfWidth: 0.095 }; // the seat, about the rider's hips
// The pad stops short of the hips, whose skin Tail1 also carries: it rises a little as the tail goes down.
const PAD = { back: -0.26, front: 0.42, halfWidth: 0.32, thickness: 0.03 };

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
// back), from `back(x, z)`, the height of the back there. Returns the geometry and the seat: where the
// rider's root goes.
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
  // rising behind his hips into a cantle and in front of his knees into a pommel.
  const feet = Math.max(...[0.1, 0.2].flatMap(x => [-0.17, 0.17].map(z => back(x, z))));
  const top = feet + FEET_BELOW;
  let bottom = Infinity;
  for (let x = SEAT.back; x <= SEAT.front + 1e-9; x += 0.03) for (const z of [-SEAT.halfWidth, 0, SEAT.halfWidth]) bottom = Math.min(bottom, back(x, z));
  bottom -= 0.06; // inside the back
  const profile = x => top + (x < -0.02 ? Math.min(0.06, 8 * (x + 0.02) ** 2) : x > 0.15 ? Math.min(0.05, 8 * (x - 0.15) ** 2) : 0);
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
  return { geometry: build.geometry(), seat: new V3(0, top - SIT_DEPTH, 0) };
}

/**
 * A saddle on the host's back. It hangs on `bone` with the bone's scale undone, so it follows the bone
 * in any pose and stays in metres. Returns
 *   object   the saddle (already in the scene, on the bone)
 *   seat     where a rider's root goes, in the world, as of the last update()
 *   host     the host
 *   update() brings `seat` up to date and returns it
 */
export function createSaddle(host, { bone: boneName = 'Body' } = {}) {
  const skin = skinOf(host);
  const { bone, inverse, at } = skin.bone(boneName);
  const unit = skin.unit;
  // On the top of the back, AHEAD in front of the bone, with the model's axes (x forward, y up).
  const near = skin.near(at.x + (AHEAD - 0.6) / unit, at.x + (AHEAD + 0.6) / unit, at.z - 0.5 / unit, at.z + 0.5 / unit);
  const origin = new V3(at.x + AHEAD / unit, 0, at.z);
  origin.y = skin.topAt(origin.x, origin.z, near);
  if (!Number.isFinite(origin.y)) throw new Error(`${host.name} has no back in front of ${boneName} to put a saddle on`);
  const back = (x, z) => {
    const y = skin.topAt(origin.x + x / unit, origin.z + z / unit, near);
    return Number.isFinite(y) ? (y - origin.y) * unit : 0;
  };
  const shape = saddleShape(back);
  const object = new THREE.Mesh(shape.geometry, new THREE.MeshStandardMaterial({ color: LEATHER, roughness: 0.8, metalness: 0 }));
  object.name = `${host.name} saddle`;
  object.castShadow = true;
  object.receiveShadow = true;
  const turn = new THREE.Quaternion();
  inverse.decompose(new V3(), turn, new V3());
  object.position.copy(origin).applyMatrix4(inverse); // in the bone's frame
  object.quaternion.copy(turn); // the bone's own turn in the bind pose, undone
  host.root.updateMatrixWorld(true);
  object.scale.setScalar(host.root.getWorldScale(new V3()).x / bone.getWorldScale(new V3()).x);
  bone.add(object);
  const seat = new V3();
  function update() {
    object.updateWorldMatrix(true, false);
    return seat.copy(shape.seat).applyMatrix4(object.matrixWorld);
  }
  update();
  return { object, seat, host, update };
}

// Taking riders over ------------------------------------------------------------------------------
// One thing moves a rider at a time: a new climb or ride ends the one before (and then plays its own clip).
const controllers = new WeakMap();
function take(rider, controller) {
  controllers.get(rider)?.end();
  controllers.set(rider, controller);
  rider.root.rotation.reorder('YZX'); // the lean comes before the heading, so rotation.y stays the heading
  rider.control(controller.drive);
}
function release(rider, controller) {
  if (controllers.get(rider) !== controller) return;
  controllers.delete(rider);
  rider.control(null);
}

/**
 * The rider sits in the saddle: the root follows `saddle.seat` and the host's heading each frame, and the
 * rider plays `sit`. It settles from where the rider stands over `settle` seconds. stop() gives the rider
 * back where it is.
 */
export function ride(rider, saddle, { settle = 0.8 } = {}) {
  const from = { position: rider.root.position.clone(), quaternion: rider.root.quaternion.clone() };
  const facing = new THREE.Quaternion();
  let t = 0;
  const controller = {
    drive(dt) {
      t += dt;
      saddle.update();
      facing.setFromAxisAngle(UP, -THREE.MathUtils.degToRad(saddle.host.heading));
      const k = smooth(clamp01(t / settle));
      rider.root.position.lerpVectors(from.position, saddle.seat, k);
      rider.root.quaternion.slerpQuaternions(from.quaternion, facing, k);
    },
    end() {},
  };
  take(rider, controller);
  rider.play('sit', { fade: 0.5 });
  return { stop: () => release(rider, controller) };
}

// Climbing ----------------------------------------------------------------------------------------

/**
 * World points along the top of the host's tail, as the clips pose it now: from the tip (on the ground
 * once tailDown has laid the tail down) by Tail5 to Tail1, and on to Body.
 */
export function tailPath(host) {
  const skin = skinOf(host);
  let ridge = tails.get(host);
  if (!ridge) tails.set(host, (ridge = tailRidge(skin)));
  host.root.updateMatrixWorld(true);
  return ridge.map(i => skin.mesh.getVertexPosition(i, new V3()).applyMatrix4(skin.mesh.matrixWorld));
}

// The skin's vertices along the top of the tail, chosen in the bind pose: the tail's very end, then the
// highest above each bone and halfway between, from Tail5 to Body. Each frame they are skinned as the
// clips pose them, so the path is the top of the tail as it is drawn, raised by its thickness.
const TAIL = ['Tail5', 'Tail4', 'Tail3', 'Tail2', 'Tail1', 'Body'];
const tails = new WeakMap();
function tailRidge(skin) {
  const chain = TAIL.map(name => skin.bone(name));
  const { skinIndex, skinWeight } = skin.mesh.geometry.attributes;
  // The end of the tail: of the vertices Tail5 carries, the one furthest out past it.
  const out = chain[0].at.clone().sub(chain[1].at).normalize();
  let end = -1;
  for (let i = 0; i < skin.bind.length; i++) {
    let share = 0;
    for (let k = 0; k < 4; k++) if (skinIndex.getComponent(i, k) === chain[0].index) share += skinWeight.getComponent(i, k);
    if (share > 0.5 && (end < 0 || skin.bind[i].dot(out) > skin.bind[end].dot(out))) end = i;
  }
  const stops = [skin.bind[end].clone().lerp(chain[0].at, 0.5)];
  chain.forEach(({ at }, k) => stops.push(at, ...(k + 1 < chain.length ? [at.clone().lerp(chain[k + 1].at, 0.5)] : [])));
  const ridge = [end];
  for (const stop of stops) {
    // The highest vertex within a few centimetres of the stop, seen from above.
    for (const reach of [0.05, 0.1, 0.2].map(m => m / skin.unit)) {
      let best = -1;
      skin.bind.forEach((p, i) => {
        if (Math.hypot(p.x - stop.x, p.z - stop.z) < reach && (best < 0 || p.y > skin.bind[best].y)) best = i;
      });
      if (best >= 0) {
        if (best !== ridge[ridge.length - 1]) ridge.push(best);
        break;
      }
    }
  }
  return ridge;
}

// A path of points, by its length: where it is `s` metres along it.
function measured(points) {
  const at = [0];
  for (let i = 1; i < points.length; i++) at.push(at[i - 1] + points[i].distanceTo(points[i - 1]));
  const length = at[at.length - 1];
  return {
    length,
    point(s, out) {
      if (points.length < 2) return out.copy(points[0]);
      const d = Math.min(length, Math.max(0, s));
      let i = 1;
      while (i < points.length - 1 && at[i] < d) i++;
      const span = at[i] - at[i - 1];
      return out.lerpVectors(points[i - 1], points[i], span > 0 ? (d - at[i - 1]) / span : 0);
    },
  };
}

const STEP_ON = 0.5; // seconds to step from where the rider stands onto the path
const SLOPE_SPAN = 0.3; // metres before and after the rider where the slope is read: steadier over joints

/**
 * Climb along a path of world points, `pathFn()` read afresh each frame (so it can follow a tail), at
 * `speed` m/s, from `from` to `to` (shares of its length: a climb in legs, one per tap or drag). The
 * rider is taken over, walks with the `walk` clip at the matching pace and leans with the slope; the
 * handle finishes at `to`, where the rider then stands still, held on the path, until the next leg or a
 * ride takes over.
 */
export function climbAlong(rider, pathFn, { speed = 0.45, from = 0, to = 1 } = {}) {
  const handle = new Handle(`${rider.name} climb`);
  const pathOf = typeof pathFn === 'function' ? pathFn : () => pathFn;
  const base = rider.gait ? speed / rider.gait.naturalSpeed : 1;
  const start = { position: rider.root.position.clone(), quaternion: rider.root.quaternion.clone() };
  const here = new V3();
  const behind = new V3();
  const ahead = new V3();
  const lean = new THREE.Euler(0, 0, 0, 'YZX');
  const pose = new THREE.Quaternion();
  let share = from;
  let walked = 0; // seconds walking
  let since = 0; // seconds since the climb began, for stepping on
  let heading = -rider.root.rotation.y;
  let moving = true;
  let walk = null;
  // He stops where he is, still held on the path, and stands; unless a climb or ride takes over, which
  // plays its own clip (a next leg walks straight on).
  function halt(stand) {
    if (!moving) return;
    moving = false;
    if (stand) rider.play('idle', { fade: 0.4 });
  }
  const controller = {
    drive(dt) {
      const path = measured(pathOf());
      since += dt;
      if (moving) {
        walked += dt;
        // Easing into the first steps and out of the last ones, the clip in step with the ground.
        const left = (to - share) * path.length;
        const pace = Math.min(1, 0.3 + (0.7 * walked) / 0.5) * Math.min(1, 0.4 + (0.6 * left) / 0.3);
        walk?.setEffectiveTimeScale(base * pace);
        if (path.length > 0) share = Math.min(to, share + (speed * pace * dt) / path.length);
        if (share >= to || path.length === 0) {
          halt(true);
          since = Math.max(since, STEP_ON);
          handle.finish();
        }
      }
      const s = share * path.length;
      path.point(s, here);
      path.point(s + SLOPE_SPAN, ahead).sub(path.point(s - SLOPE_SPAN, behind));
      const flat = Math.hypot(ahead.x, ahead.z);
      if (flat > 1e-6) heading = Math.atan2(ahead.z, ahead.x);
      pose.setFromEuler(lean.set(0, -heading, Math.atan2(ahead.y, flat)));
      const k = smooth(clamp01(since / STEP_ON));
      rider.root.position.lerpVectors(start.position, here, k);
      rider.root.quaternion.slerpQuaternions(start.quaternion, pose, k);
    },
    end() {
      halt(false);
      handle.cancel();
    },
  };
  handle.onCancel = () => halt(true);
  take(rider, controller);
  walk = rider.play('walk', { fade: 0.3, timeScale: 0.3 * base });
  return handle;
}
