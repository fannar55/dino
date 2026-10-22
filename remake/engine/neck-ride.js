import * as THREE from 'three';
import { clone as cloneSkinned } from '../../dist/vendor/SkeletonUtils.js';
import { Handle } from './handle.js';
import { ride, carryRider, SIT_DEPTH } from './riding.js';
import { glints, run, sparkleTrail } from '../world/props/sparkles.js';
import { seededRandom } from './random.js';

// Riding Þórseðla's neck (chapter 2, scenes 6 and 7). Egill sits on the back of her head on a seat with no saddle (riding.js:
// createSeat) while she lifts him to nine metres; then she bends her neck and he slides down it, from her head to her withers,
// and hops off it on a short arc into the saddle on Mosi's back:
//
//   const legs = legsOut(egill).to(1);                  // he sits with his legs out in front of him, as on a broad, flat head
//   const curve = neckCurve(thorsedla);                 // the top of her neck as she stands now, from the head to the withers
//   yield slideDown(egill, thorsedla, saddle);          // down the neck and into the saddle; he rides Mosi from there
//   const drops = waterDrops(world, { seconds: 8 });    // drops falling off her wet neck, a ring where they meet the water
//
// A boy's sit clip lets his feet hang 9 cm below the seat of his trousers, close in under him: on a saddle's narrow ridge they
// hang beside it, but her skull is 1.5 m across and would swallow them, so on her he sits as a child sits on a floor, his legs
// straight out (legsOut). Sizes are metres, the host at her real size (STYLE.md section 3). Everything moves on the game clock
// (world.effects and the rider's own update), so a capture lands on the same frame.

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
const SIDE = new V3(0, 0, 1);
const STRAIGHT = new THREE.Quaternion(); // a leg bone as it was bound: the baked bipeds stand with straight legs
const smooth = t => t * t * (3 - 2 * t);
const clamp01 = t => Math.min(1, Math.max(0, t));
const findBone = (model, name) => model.getObjectByName(name) ?? model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));

/** Her neck from the head to the withers: the joints whose skin tops the slide runs over. */
export const NECK = ['Head', 'Neck5', 'Neck4', 'Neck3', 'Neck2', 'Neck', 'Chest'];

// The slide, in seconds and metres. He turns to face down the neck as he starts (TURN), with a little hop SCOOT high, and slides
// down it for NECK_SHARE of the slide, faster and faster as on a playground slide; he flies off her withers on an arc HOP above
// the straight way to the saddle and bounces once in it (BOUNCE seconds, BOUNCE_HEIGHT up). On the neck the seat of his trousers
// stays CLEARANCE above her skin, and he leans back with its slope, less LEG_DROP (the angle his straight legs fall below his
// thighs), so that they lie along it. A drop of water falls off her neck beside him every DRIP_EVERY seconds.
const SLIDE = {
  turn: 0.45, scoot: 0.06, neckShare: 0.6, hop: 1.1, bounce: 0.3, bounceHeight: 0.08, clearance: 0.06,
  legDrop: THREE.MathUtils.degToRad(8), dripEvery: 0.16,
};
// Drops of water: small, pale and glinting (water is the one wet, shiny thing besides eyes: STYLE.md section 7), falling freely.
const DROP = { size: 0.07, colour: '#d8f1f4', core: '#ffffff', life: 2.4, gravity: 9.8, ring: 0.3 };
const DROP_LOOK = { glow: 1, falloff: 3.2, star: 0, twinkle: 0, rim: 1, vary: 1, core: DROP.core, blending: THREE.AdditiveBlending };
const RING = { life: 2.6, most: 2 }; // the water's rings last 2.6 s (water.js); drops keep at most two of the script's six

function skinOf(host) {
  let mesh = null; // the body: the skinned mesh with the most vertices
  host.model.traverse(o => {
    if (o.isSkinnedMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o;
  });
  if (!mesh) throw new Error(`${host.name} has no skin`);
  return mesh;
}

/**
 * Where the host's eyes are, between the two (the face pass's eyes, carried by her Head bone): a function (out) -> the point in
 * the world as she is posed now, which is also a point spec (engine/points.js). Without eyes, her head bone.
 */
export function eyesOf(host) {
  const mesh = skinOf(host);
  const head = findBone(host.model, 'Head');
  const eyes = mesh.userData.face?.eyes;
  const index = mesh.skeleton.bones.indexOf(head);
  if (!eyes?.length || index < 0) return (out = new V3()) => host.headPosition(out);
  const local = eyes.reduce((sum, eye) => sum.add(new V3(...eye.centre)), new V3()).divideScalar(eyes.length)
    .applyMatrix4(mesh.bindMatrix).applyMatrix4(mesh.skeleton.boneInverses[index]);
  return (out = new V3()) => {
    head.updateWorldMatrix(true, false);
    return out.copy(local).applyMatrix4(head.matrixWorld);
  };
}

// The height of her eyes above her root through a clip, sampled once on a copy of her that nobody sees (her own pose is never
// touched): what lets one clip hand over to another where both hold her head at the same height.
const EYE_SAMPLES = 120;
const eyeTables = new WeakMap();
function eyeTable(host, clipName) {
  if (!eyeTables.has(host)) eyeTables.set(host, new Map());
  const tables = eyeTables.get(host);
  if (tables.has(clipName)) return tables.get(clipName);
  const clip = host.clips.get(clipName);
  if (!clip) throw new Error(`${host.name} has no clip named "${clipName}"`);
  const copy = cloneSkinned(host.model);
  copy.position.set(0, 0, 0);
  copy.quaternion.identity();
  const eyes = eyesOf({ name: host.name, model: copy, headPosition: out => out.set(0, 0, 0) });
  const mixer = new THREE.AnimationMixer(copy);
  mixer.clipAction(clip).play();
  const heights = [];
  for (let i = 0; i <= EYE_SAMPLES; i++) {
    mixer.setTime(Math.min(clip.duration - 1e-4, (i / EYE_SAMPLES) * clip.duration));
    copy.updateMatrixWorld(true);
    heights.push(eyes().y);
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(copy);
  const table = { duration: clip.duration, heights };
  tables.set(clipName, table);
  return table;
}

/** The height of the host's eyes above her root `time` seconds into a clip (sampled: eyeTable). */
export function eyeHeightIn(host, clipName, time) {
  const { duration, heights } = eyeTable(host, clipName);
  const u = THREE.MathUtils.clamp(time / duration, 0, 1) * EYE_SAMPLES;
  const i = Math.min(EYE_SAMPLES - 1, Math.floor(u));
  return heights[i] + (heights[i + 1] - heights[i]) * (u - i);
}

/** The first time in a clip at which the host's eyes are `height` above her root (the clip's end if they never are). */
export function clipTimeForEyes(host, clipName, height) {
  const { duration, heights } = eyeTable(host, clipName);
  for (let i = 0; i < EYE_SAMPLES; i++) {
    const a = heights[i] - height, b = heights[i + 1] - height;
    if (a === 0) return (i / EYE_SAMPLES) * duration;
    if (a * b < 0) return ((i + a / (a - b)) / EYE_SAMPLES) * duration;
  }
  return duration;
}

// The top of her skin over each joint of the neck, measured once in the bind pose: the highest point of the skin's middle strip
// across the neck there, taken square to the neck (the bones run low in it: at Neck5 the top is 0.9 m above them). Each is kept
// in its joint's own frame, so it moves with the bone as the clips turn it, as the skin there does.
const tops = new WeakMap();
function topsOf(host) {
  if (tops.has(host)) return tops.get(host);
  const mesh = skinOf(host);
  const position = mesh.geometry.attributes.position;
  const bind = [];
  for (let i = 0; i < position.count; i++) bind.push(new V3().fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix));
  host.root.updateMatrixWorld(true);
  const unit = mesh.getWorldScale(new V3()).x / host.root.getWorldScale(new V3()).x; // metres in one bind unit
  const joints = NECK.map(name => {
    const bone = findBone(host.model, name);
    const index = mesh.skeleton.bones.indexOf(bone);
    if (index < 0) throw new Error(`${host.name} has no bone named "${name}" in her neck`);
    const inverse = mesh.skeleton.boneInverses[index];
    return { name, bone, inverse, at: new V3().setFromMatrixPosition(inverse.clone().invert()) };
  });
  const d = new V3();
  const list = joints.map((joint, i) => {
    // Square to the neck; but the head is level as it was bound, and its top is straight above it.
    const along = joint.name === 'Head' ? new V3(1, 0, 0)
      : new V3().subVectors(joints[Math.min(joints.length - 1, i + 1)].at, joints[Math.max(0, i - 1)].at).normalize();
    const up = UP.clone().addScaledVector(along, -along.y).normalize();
    const side = new V3().crossVectors(along, up);
    let top = -Infinity;
    for (const p of bind) {
      d.subVectors(p, joint.at);
      if (Math.abs(d.dot(along)) > 0.15 / unit || Math.abs(d.dot(side)) > 0.12 / unit) continue;
      top = Math.max(top, d.dot(up));
    }
    if (!Number.isFinite(top)) throw new Error(`${host.name} has no skin over ${joint.name}`);
    return { name: joint.name, bone: joint.bone, local: joint.at.clone().addScaledVector(up, top).applyMatrix4(joint.inverse), top: top * unit };
  });
  tops.set(host, list);
  return list;
}

/**
 * The top of the host's neck as she stands now, from her head to her withers: a CatmullRomCurve3 through the skin's top over
 * Head, Neck5 to Neck and Chest (NECK), in the world. Pass the curve it gave before as `out` to have it brought up to date.
 */
export function neckCurve(host, out = null) {
  const list = topsOf(host);
  host.root.updateMatrixWorld(true);
  const curve = out ?? new THREE.CatmullRomCurve3(list.map(() => new V3()), false, 'centripetal');
  list.forEach((top, i) => curve.points[i].copy(top.local).applyMatrix4(top.bone.matrixWorld));
  curve.needsUpdate = true; // its lengths are measured again
  return curve;
}

/**
 * The rider sits with his legs straight out in front of him, laid over whatever his clips pose (sit), blended in and out:
 * `to(weight, { duration })` (1 out, 0 his clip's own legs) and `stop({ duration })`, after which his clips have his legs again.
 * It runs on world.effects, after the actors, so it lays the legs over the pose his clips gave him in that frame.
 */
export function legsOut(rider) {
  const world = rider.world;
  const legs = ['LeftLowerLeg', 'RightLowerLeg', 'LeftFoot', 'RightFoot']
    .map(name => findBone(rider.model, name))
    .filter(Boolean)
    .map(bone => ({ bone, clip: bone.quaternion.clone(), applied: new THREE.Quaternion(), fresh: true }));
  let weight = 0, from = 0, goal = 0, t = 0, span = 0, over = false;
  const effect = {
    label: `${rider.name}'s legs out`,
    update(dt) {
      t += dt;
      weight = span > 0 ? from + (goal - from) * smooth(clamp01(t / span)) : goal;
      for (const leg of legs) {
        // What his clips gave the bone: the mixer leaves a bone alone when its value has not changed since the frame before, so a
        // bone still as it was left last frame still has the clip's pose from then.
        if (leg.fresh || !leg.bone.quaternion.equals(leg.applied)) leg.clip.copy(leg.bone.quaternion);
        leg.fresh = false;
        leg.bone.quaternion.copy(leg.clip).slerp(STRAIGHT, weight);
        leg.applied.copy(leg.bone.quaternion);
      }
      if (!over || weight > 0) return true;
      for (const leg of legs) leg.bone.quaternion.copy(leg.clip);
      return false;
    },
  };
  const control = {
    get weight() { return weight; },
    to(value, { duration = 0.4 } = {}) {
      from = weight;
      goal = clamp01(value);
      t = 0;
      span = duration;
      over = false;
      if (!world.effects.has(effect)) {
        for (const leg of legs) leg.fresh = true;
        world.effects.add(effect);
      }
      return control;
    },
    stop({ duration = 0.4 } = {}) {
      control.to(0, { duration });
      over = true;
    },
  };
  world.effects.add(effect);
  return control;
}

/**
 * The script's rings for drops of water: `ring(point, strength)` makes one on the water (world.forest.water.rippleAt) unless
 * `most` of its own are still spreading, so drops never take every one of the six rings the water keeps for the script.
 */
export function ringsFor(world, { most = RING.most } = {}) {
  const live = [];
  return (point, strength = DROP.ring) => {
    const water = world.forest?.water;
    if (!water?.rippleAt) return null;
    const now = world.clock?.time ?? 0;
    while (live.length && now - live[0] > RING.life) live.shift();
    if (live.length >= most) return null;
    live.push(now);
    return water.rippleAt(point, strength);
  };
}

/**
 * Drops of water falling off something wet (her neck as she lifts it out of the trees, the neck he slides down): one set of
 * soft glints (sparkles.js; one draw call), each falling freely from where `drip(point)` lets it go, for `seconds` seconds.
 * A drop that comes down on the water there makes a faint ring (`ring`: ringsFor's, by default); one that meets the ground or
 * anything else is gone. Returns { drip(point), handle }: the handle finishes when the last drop has fallen.
 */
export function waterDrops(world, { seconds = 8, count = 24, seed = 'drops', ring = ringsFor(world) } = {}) {
  const set = glints(world, { count, life: DROP.life, spread: 0, fall: 0, size: DROP.size, colour: DROP.colour, seed, look: DROP_LOOK });
  set.points.name = 'Drops';
  set.birth.fill(1e6); // none is alive before it is let go
  const random = seededRandom(`${seed} ways`);
  const drops = Array.from({ length: count }, () => ({ live: false, p: new V3(), v: new V3(), floor: 0, wet: false }));
  let next = 0;
  let age = 0;
  const step = now => {
    const dt = now - age;
    age = now;
    let moved = false;
    drops.forEach((drop, i) => {
      if (!drop.live) return;
      drop.v.y -= DROP.gravity * dt;
      drop.p.addScaledVector(drop.v, dt);
      if (drop.p.y <= drop.floor) {
        drop.live = false;
        set.birth[i] = 1e6;
        set.points.geometry.attributes.birth.needsUpdate = true;
        if (drop.wet) ring([drop.p.x, drop.floor, drop.p.z]);
      } else set.position.set([drop.p.x, drop.p.y, drop.p.z], i * 3);
      moved = true;
    });
    if (moved) set.points.geometry.attributes.position.needsUpdate = true;
  };
  const handle = run(world, set, seconds + DROP.life, 'water drops', step);
  return {
    handle,
    drip(point) {
      if (handle.done || age > seconds) return;
      const i = next;
      next = (next + 1) % count;
      const drop = drops[i];
      drop.live = true;
      drop.p.copy(point);
      drop.v.set((random() - 0.5) * 0.5, -0.3 * random(), (random() - 0.5) * 0.5);
      const surface = world.forest?.water?.surfaceAt?.(point.x, point.z) ?? null;
      drop.wet = surface !== null;
      drop.floor = drop.wet ? surface : (world.heightAt?.(point.x, point.z) ?? 0);
      set.position.set([point.x, point.y, point.z], i * 3);
      set.birth[i] = age;
      set.points.geometry.attributes.position.needsUpdate = true;
      set.points.geometry.attributes.birth.needsUpdate = true;
    },
  };
}

/**
 * The slide (scene 7): the rider sits (sit), turns to face down the host's neck and slides down it from where he sits to her
 * withers (neckCurve), faster and faster, his legs out and leaning back with the slope, the seat of his trousers just over her
 * skin; then he leaves it on a short arc into `saddle.seat` (createSaddle's, on Mosi), bounces once there and rides
 * (ride(rider, saddle)), leaving a trail of sparkles and drops of water falling off her neck with a ring where they meet the
 * water. `legs` is a legsOut of his that is going already (it takes it on), `ring` makes the drops' rings (waterDrops). Takes
 * `duration` seconds. Returns a Handle that finishes with him riding: `handle.riding` is the ride, `handle.along`
 * the metres he has slid down her neck so far and `handle.phase` where he is ('neck', 'arc', 'bounce', 'saddle'). The host's
 * neck may move while he slides: the curve follows it every frame.
 */
export function slideDown(rider, host, saddle, { duration = 3.2, seed = 'slide', legs: given = null, ring = undefined } = {}) {
  const world = rider.world;
  if (!world?.effects) throw new Error('slideDown needs the rider\'s world.effects (engine/effects.js), which main.js updates');
  const handle = new Handle(`${rider.name} slides down ${host.name}'s neck`);
  handle.along = 0;
  handle.phase = 'neck';
  const curve = neckCurve(host);
  const length = () => curve.getLength();
  // Where he starts on the neck: the point of its top nearest the seat of his trousers.
  const bottom = rider.root.position.clone().addScaledVector(UP, SIT_DEPTH);
  let start = 0;
  let best = Infinity;
  for (let i = 0; i <= 80; i++) {
    const d = curve.getPointAt(i / 80).distanceTo(bottom);
    if (d < best) { best = d; start = i / 80; }
  }
  const startAlong = start * length();
  const from = rider.root.position.clone();
  const fromTurn = rider.root.quaternion.clone();
  const tNeck = SLIDE.neckShare * duration;
  const tLand = duration - SLIDE.bounce;
  const point = new V3(), tangent = new V3(), normal = new V3(), body = new V3(), onNeck = new V3();
  const slideTurn = new THREE.Quaternion(), facing = new THREE.Quaternion(), yaw = new THREE.Quaternion(), pitch = new THREE.Quaternion();
  const leftNeck = { at: new V3(), turn: new THREE.Quaternion(), set: false };
  const legs = given ?? legsOut(rider);
  legs.to(1, { duration: given ? 0.2 : 0.01 });
  const drops = waterDrops(world, { seconds: tNeck + 0.2, seed: `${seed} drops`, ring });
  const random = seededRandom(`${seed} drips`);
  let nextDrip = SLIDE.turn;
  let t = 0;

  // On the neck `along` metres down it: his root, and his turn facing down it, leaning back with its slope.
  function onTheNeck(along, outAt, outTurn) {
    const u = clamp01(along / length());
    curve.getPointAt(u, point);
    curve.getTangentAt(u, tangent); // down the neck, toward her withers
    normal.copy(UP).addScaledVector(tangent, -tangent.y);
    if (normal.lengthSq() < 1e-8) normal.copy(UP);
    normal.normalize();
    const slope = Math.asin(THREE.MathUtils.clamp(-tangent.y, -1, 1)); // down the neck, positive
    yaw.setFromAxisAngle(UP, -Math.atan2(tangent.z, tangent.x));
    pitch.setFromAxisAngle(SIDE, -Math.max(0, slope - SLIDE.legDrop));
    outTurn.copy(yaw).multiply(pitch);
    body.copy(UP).applyQuaternion(outTurn);
    return outAt.copy(point).addScaledVector(normal, SLIDE.clearance).addScaledVector(body, -SIT_DEPTH);
  }

  const controller = {
    drive(dt) {
      if (!handle.cancelled) t += dt;
      neckCurve(host, curve);
      const seat = saddle.update();
      facing.setFromAxisAngle(UP, -THREE.MathUtils.degToRad(saddle.host.heading));
      if (t < tNeck) {
        // Down the neck, slowly at first while he turns round, then faster and faster.
        const k = t / tNeck;
        const along = startAlong + (length() - startAlong) * k * k;
        handle.along = along - startAlong;
        onTheNeck(along, onNeck, slideTurn);
        const turned = smooth(clamp01(t / SLIDE.turn));
        rider.root.position.lerpVectors(from, onNeck, turned).addScaledVector(UP, SLIDE.scoot * Math.sin(Math.PI * turned)); // a little hop round
        rider.root.quaternion.slerpQuaternions(fromTurn, slideTurn, turned);
        if (t >= nextDrip) {
          nextDrip += SLIDE.dripEvery;
          const side = (random() < 0.5 ? -1 : 1) * (0.25 + 0.3 * random());
          drops.drip(point.clone().addScaledVector(new V3().crossVectors(tangent, normal).normalize(), side).addScaledVector(normal, -0.15));
        }
      } else if (t < tLand) {
        // Off her withers, on an arc into the saddle.
        if (!leftNeck.set) {
          onTheNeck(length(), leftNeck.at, leftNeck.turn);
          leftNeck.set = true;
          handle.along = length() - startAlong;
          handle.phase = 'arc';
        }
        const k = (t - tNeck) / (tLand - tNeck);
        rider.root.position.lerpVectors(leftNeck.at, seat, k).addScaledVector(UP, 4 * SLIDE.hop * k * (1 - k));
        rider.root.quaternion.slerpQuaternions(leftNeck.turn, facing, smooth(k));
        if (k > 0.45 && legs.weight >= 1) legs.to(0, { duration: 0.4 });
      } else {
        // A bounce in the saddle.
        handle.phase = 'bounce';
        const k = clamp01((t - tLand) / (duration - tLand));
        rider.root.position.copy(seat).addScaledVector(UP, SLIDE.bounceHeight * Math.sin(Math.PI * k));
        rider.root.quaternion.copy(facing);
        if (k >= 1 && !handle.done) {
          handle.phase = 'saddle';
          rider.root.position.copy(seat);
          handle.finish();
          handle.riding = ride(rider, saddle, { settle: 0 }); // ends this controller: he rides from here
        }
      }
    },
    end() {
      if (!handle.done) handle.cancel(); // a slide that is cancelled leaves him held where he got to
      legs.stop();
    },
  };
  carryRider(rider, controller);
  rider.play('sit', { fade: 0.3 });
  const trail = new V3();
  sparkleTrail(world, () => rider.centre(trail), { duration: 0.85 * duration, count: 50, seed: `${seed} sparkles` });
  return handle;
}
