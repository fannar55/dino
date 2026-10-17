import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { clone as cloneSkinned } from '../../dist/vendor/SkeletonUtils.js';
import { createActor } from '../engine/actor.js';
import { emptyWorld, loadCharacter, readGlb, skinnedMeshOf } from './characters.mjs';

// Flugeðla the Pteranodon as baked by remake/tools/bake/bake-quadruped.js (kind=pterosaur: winged-rig.js
// and winged-clips.js, then the face and mouth passes), read without textures (no DOM in Node).
const gltfPromise = loadCharacter('flugedla');
const WING = ['UpperArm', 'Forearm', 'Wrist', 'Claws', 'Finger1', 'Finger2', 'Finger3'];
const CHAIN = ['Hips', 'Spine', 'Chest', 'Neck', 'Neck2', 'Neck3', 'Head', 'Tail1', 'Tail2', 'Tail3'];
const LEGS = ['LeftThigh', 'LeftShin', 'LeftFoot', 'RightThigh', 'RightShin', 'RightFoot'];
const WINGS = ['Left', 'Right'].flatMap(side => WING.map(n => `${side}${n}`));
const BONES = ['root', ...CHAIN, ...LEGS, ...WINGS, 'Jaw'];
const FEET = ['LeftFoot', 'RightFoot'];
const CLIPS = ['carry', 'fly', 'glide', 'happy', 'idle', 'kink', 'land', 'takeOff', 'walk'];
const SPINE = ['Hips', 'Spine', 'Chest'];

// A copy of Flugeðla in the bind pose (the loaded scene itself is never posed).
async function model() {
  const gltf = await gltfPromise;
  const scene = cloneSkinned(gltf.scene);
  return { gltf, scene, mesh: skinnedMeshOf(scene), clip: name => gltf.animations.find(c => c.name === name) };
}

async function stage() {
  const world = emptyWorld();
  const flugedla = await createActor(world, { name: 'flugedla', gltf: await gltfPromise });
  world.actors.set('flugedla', flugedla);
  return { world, flugedla };
}

// The share of a vertex the given bones carry.
function carried(mesh, i, bones) {
  const { skinIndex, skinWeight } = mesh.geometry.attributes;
  const ids = bones.map(n => mesh.skeleton.bones.findIndex(b => b.name === n));
  let w = 0;
  for (let k = 0; k < 4; k++) if (ids.includes(skinIndex.getComponent(i, k))) w += skinWeight.getComponent(i, k);
  return w;
}

// Follows the feet frame by frame from start(), as Kambeðla's tests do: the most a foot moved along the
// ground between two frames in which it was down (its ankle within 1 mm of its bind-pose height), how
// often a foot lifted, how far a planted foot got from its rest spot, and where each foot was set down.
function footWatch(actor) {
  const feet = FEET.map(n => actor.model.getObjectByName(n));
  const read = () => {
    actor.root.updateMatrixWorld(true);
    return feet.map(f => f.getWorldPosition(new THREE.Vector3()));
  };
  const rest = read().map(p => actor.root.worldToLocal(p.clone()));
  let last = null;
  const watch = {
    slide: 0, lifts: 0, reach: 0, spots: [],
    start() { last = null; watch.slide = 0; watch.lifts = 0; watch.reach = 0; watch.spots = []; return watch.sample(); },
    sample() {
      const now = read().map((p, k) => {
        const local = actor.root.worldToLocal(p.clone());
        return { p, down: local.y - rest[k].y < 0.001, reach: Math.hypot(local.x - rest[k].x, local.z - rest[k].z) };
      });
      now.forEach((foot, k) => {
        if (foot.down) watch.reach = Math.max(watch.reach, foot.reach);
        if (!last) return;
        if (foot.down && last[k].down) watch.slide = Math.max(watch.slide, Math.hypot(foot.p.x - last[k].p.x, foot.p.z - last[k].p.z));
        if (!foot.down && last[k].down) watch.lifts++;
        if (foot.down && !last[k].down) (watch.spots[k] ||= []).push(foot.p.clone());
      });
      last = now;
      return now;
    },
  };
  return watch;
}
const mm = metres => `${(metres * 1000).toFixed(1)} mm`;
const deg = THREE.MathUtils.radToDeg;

// Width and height of a JPEG from its start-of-frame marker.
function jpegSize(bytes) {
  for (let i = 2; i < bytes.length;) {
    const marker = bytes.readUInt16BE(i);
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xffc0 && marker <= 0xffcf && ![0xffc4, 0xffc8, 0xffcc].includes(marker)) {
      return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

// Pose a scene by a clip at time t (a clip played once holds its last pose).
function poser(scene, clip) {
  const mixer = new THREE.AnimationMixer(scene);
  const action = mixer.clipAction(clip);
  if (clip.userData.once) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
  action.play();
  return t => { mixer.setTime(Math.min(t, clip.duration - 1e-4)); scene.updateMatrixWorld(true); };
}
// Every bone's world position at time t of a clip.
function bonesAt(scene, clip, t) {
  poser(scene, clip)(t);
  const out = [];
  scene.traverse(o => { if (o.isBone) out.push(o.getWorldPosition(new THREE.Vector3())); });
  return out;
}
const gap = (a, b) => Math.max(...a.map((p, i) => p.distanceTo(b[i])));

test('Flugeðla has her winged skeleton, her clips and fits the budget', async () => {
  const { gltf, mesh } = await model();
  assert.deepEqual(mesh.skeleton.bones.map(b => b.name), BONES);
  // Identity rest rotations: clips turn bones about the character's own axes.
  for (const bone of mesh.skeleton.bones) assert.ok(bone.quaternion.angleTo(new THREE.Quaternion()) < 1e-6, `${bone.name} is turned at rest`);
  // The legs are jointed as the engine's footing plants a biped's: thigh, shin, foot.
  for (const side of ['Left', 'Right']) {
    const foot = mesh.skeleton.bones.find(b => b.name === `${side}Foot`);
    assert.deepEqual([foot.parent.name, foot.parent.parent.name, foot.parent.parent.parent.name], [`${side}Shin`, `${side}Thigh`, 'Hips']);
  }
  const clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
  assert.deepEqual(Object.keys(clips).sort(), CLIPS);
  for (const clip of Object.values(clips)) {
    // Every clip keys every bone but the jaw, so no turn is left behind when clips cross-fade.
    const animated = new Set(clip.tracks.map(t => t.name.split('.')[0]));
    for (const bone of BONES.slice(1, -1)) assert.ok(animated.has(bone), `${clip.name} leaves ${bone} alone`);
    // takeOff and land go somewhere and stay: they say so, and the actor plays them once.
    assert.equal(Boolean(clip.userData.once), ['takeOff', 'land'].includes(clip.name), `${clip.name} once`);
  }
  assert.ok(mesh.geometry.index.count / 3 <= 40000, `${mesh.geometry.index.count / 3} triangles`);
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  // 7.5 m from wingtip to wingtip with the wings spread as Tripo made them; standing she is about 4.1 m
  // to the top of her crest.
  assert.ok(Math.abs(box.max.z - box.min.z - 7.5) < 0.01, `${(box.max.z - box.min.z).toFixed(3)} m across the wings`);
  assert.ok(box.max.y > 3.9 && box.max.y < 4.3, `her crest is ${box.max.y.toFixed(2)} m up`);
  assert.ok(Math.abs(box.min.y) < 0.005, 'stands on the ground');

  const { glb, jsonLength, json } = readGlb('flugedla');
  assert.equal(json.meshes.length, 1, 'one skinned mesh');
  assert.equal(json.materials.length, 1);
  const material = json.materials[0];
  assert.ok(!material.doubleSided, 'single-sided');
  assert.ok(Math.abs(material.pbrMetallicRoughness.roughnessFactor - 0.62) < 0.01);
  assert.equal(material.pbrMetallicRoughness.metallicFactor ?? 1, 0);
  assert.ok(material.normalTexture.scale <= 0.6, 'the normal map is softened');
  assert.equal(material.pbrMetallicRoughness.metallicRoughnessTexture, undefined);
  const bin = glb.subarray(20 + jsonLength + 8);
  assert.equal(json.images.length, 2, 'two maps: base colour and normal');
  for (const image of json.images) {
    const view = json.bufferViews[image.bufferView];
    assert.equal(image.mimeType, 'image/jpeg');
    assert.deepEqual(jpegSize(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)), { width: 1024, height: 1024 });
  }
});

test('every vertex weight sums to one; the head and beak, and the claws, ride their bones', async () => {
  const { mesh } = await model();
  const w = mesh.geometry.attributes.skinWeight;
  for (let i = 0; i < w.count; i++) {
    const sum = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i);
    assert.ok(Math.abs(sum - 1) < 1e-3, `vertex ${i} sums to ${sum}`);
  }
  // The crest, high above everything else, and the beak's tip move with the head (and its jaw) alone.
  const pos = mesh.geometry.attributes.position;
  let crest = 0, tip = 0;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 3.6) { crest++; assert.ok(carried(mesh, i, ['Head']) > 0.999, `the crest at vertex ${i} bends`); }
    if (pos.getX(i) > 2.2 && pos.getY(i) > 2.4) { tip++; assert.ok(carried(mesh, i, ['Head', 'Jaw']) > 0.999, `the beak at vertex ${i} bends`); }
  }
  assert.ok(crest > 100 && tip > 20, `${crest} crest and ${tip} beak vertices checked`);
  // The claw tips: the vertices furthest forward of each hand ride the claws' bone.
  for (const side of ['Left', 'Right']) {
    const wrist = mesh.skeleton.bones.find(b => b.name === `${side}Wrist`).getWorldPosition(new THREE.Vector3());
    const near = [];
    for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getZ(i) - wrist.z) < 0.25 && pos.getY(i) > wrist.y - 0.3) near.push(i);
    near.sort((a, b) => pos.getX(b) - pos.getX(a));
    for (const i of near.slice(0, 20)) assert.ok(carried(mesh, i, [`${side}Claws`]) > 0.9, `${side} claw tip ${i} carried ${carried(mesh, i, [`${side}Claws`]).toFixed(2)}`);
  }
});

test('away from the mouth the welded skin is closed and consistently wound', async () => {
  const { mesh } = await model();
  const pos = mesh.geometry.attributes.position;
  const ids = new Map();
  const rep = new Int32Array(pos.count);
  const key = i => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const weights = [mesh.geometry.attributes.skinIndex, mesh.geometry.attributes.skinWeight];
  let seamWeights = 0;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    if (!ids.has(k)) ids.set(k, i);
    rep[i] = ids.get(k);
    // Both sides of a seam carry the same weights, so the seam stays closed when skinned (the mouth
    // pass gave the lips copies of their own).
    if (rep[i] !== i && carried(mesh, i, ['Head', 'Jaw']) < 0.5) {
      for (const attr of weights) for (let c = 0; c < 4; c++) seamWeights = Math.max(seamWeights, Math.abs(attr.getComponent(i, c) - attr.getComponent(rep[i], c)));
    }
  }
  assert.ok(seamWeights < 1e-6, `the two sides of a seam differ in weight by ${seamWeights}`);
  const edges = new Map();
  const index = mesh.geometry.index;
  for (let t = 0; t < index.count; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = rep[index.getX(t + e)], b = rep[index.getX(t + (e + 1) % 3)];
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      const edge = edges.get(k) || { n: 0, turn: 0, a, b };
      edge.n++;
      edge.turn += a < b ? 1 : -1;
      edges.set(k, edge);
    }
  }
  const head = i => carried(mesh, i, ['Head', 'Jaw']) > 0.9;
  const bad = [...edges.values()].filter(e => (e.n !== 2 || e.turn !== 0) && !(head(e.a) && head(e.b)));
  assert.equal(bad.length, 0, `${bad.length} edges off the head are open, shared by more than two triangles or wound against each other`);
});

test('the wing membrane blends between the long finger, the arm, the body and the thigh, both faces alike', async () => {
  const { scene, mesh, clip } = await model();
  const pos = mesh.geometry.attributes.position;
  const { skinIndex, skinWeight } = mesh.geometry.attributes;
  const names = mesh.skeleton.bones.map(b => b.name);
  const side = 'Right'; // her right wing reaches out to +Z
  const finger = ['Finger1', 'Finger2', 'Finger3'].map(n => `${side}${n}`);
  const arm = ['UpperArm', 'Forearm', 'Wrist'].map(n => `${side}${n}`);
  const holders = [...SPINE, `${side}Thigh`];
  // Out at the tip the membrane follows the finger; along the arm, the arm; at its inner trailing corner
  // the body and the thigh. In the middle of the wing it blends all of them.
  const near = (x0, y0, z0, r) => { const out = []; for (let i = 0; i < pos.count; i++) if (Math.hypot(pos.getX(i) - x0, pos.getY(i) - y0, pos.getZ(i) - z0) < r) out.push(i); return out; };
  const mean = (list, bones) => list.reduce((s, i) => s + carried(mesh, i, bones), 0) / list.length;
  const tip = near(0.45, 3.0, 3.6, 0.15), middle = near(0.05, 2.05, 2.2, 0.15), corner = near(-0.1, 1.25, 0.45, 0.12);
  assert.ok(tip.length > 10 && middle.length > 10 && corner.length > 5, `${tip.length}, ${middle.length}, ${corner.length} membrane vertices`);
  assert.ok(mean(tip, finger) > 0.9, `the finger carries the tip ${mean(tip, finger).toFixed(2)}`);
  assert.ok(mean(corner, holders) > 0.5, `the body and thigh carry the inner corner ${mean(corner, holders).toFixed(2)}`);
  const blend = [finger, arm, holders].map(b => mean(middle, b));
  assert.ok(blend.filter(v => v > 0.1).length >= 2, `the middle of the wing blends: finger ${blend[0].toFixed(2)}, arm ${blend[1].toFixed(2)}, body ${blend[2].toFixed(2)}`);
  // Smoothly: along the wing's edges (the clawed fingers left out), neighbours' weights differ little, so it
  // stretches without tearing or creasing; the steepest changes are just off the finger, whose own weights
  // are fixed.
  const wing = i => pos.getZ(i) > 0.5 && carried(mesh, i, [...finger, ...arm]) > 0.05 && carried(mesh, i, [`${side}Claws`]) < 0.01;
  const weightsOf = i => { const w = new Map(); for (let k = 0; k < 4; k++) w.set(names[skinIndex.getComponent(i, k)], (w.get(names[skinIndex.getComponent(i, k)]) || 0) + skinWeight.getComponent(i, k)); return w; };
  const index = mesh.geometry.index;
  const slopes = [];
  for (let t = 0; t < index.count; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = index.getX(t + e), b = index.getX(t + (e + 1) % 3);
      if (!wing(a) || !wing(b)) continue;
      const wa = weightsOf(a), wb = weightsOf(b);
      const len = Math.hypot(pos.getX(a) - pos.getX(b), pos.getY(a) - pos.getY(b), pos.getZ(a) - pos.getZ(b));
      if (len < 0.02) continue;
      let diff = 0;
      for (const bone of new Set([...wa.keys(), ...wb.keys()])) diff += Math.abs((wa.get(bone) || 0) - (wb.get(bone) || 0));
      slopes.push(diff / 2 / len);
    }
  }
  slopes.sort((a, b) => a - b);
  const share = q => slopes[Math.floor(q * (slopes.length - 1))];
  assert.ok(slopes.length > 10000, `${slopes.length} edges of the wing`);
  assert.ok(share(0.5) < 1 && share(0.99) < 6 && slopes.at(-1) < 20, `the wing's weights change by ${share(0.5).toFixed(2)} a metre (median), ${share(0.99).toFixed(2)} (99 %), ${slopes.at(-1).toFixed(2)} at most`);
  // The membrane is a thin closed shell, about 3.5 cm thick: straight in from a point of one face (against
  // its normal) lies a point of the other face, inside a triangle there. Read between that triangle's
  // corners, its weights are the point's own, so the two faces bend as one: through the flights the gap
  // between them keeps its width, and almost nowhere do they cross. (Where the arm, the body and the thigh
  // all pull on it the membrane creases a little; the single-sided skin hides a crossing, though not quite
  // its shadow.)
  const normal = mesh.geometry.attributes.normal;
  const at = i => new THREE.Vector3().fromBufferAttribute(pos, i);
  const cellOf = p => [p.x, p.y, p.z].map(v => Math.floor(v / 0.06));
  const cells = new Map();
  const around = new Map(); // a wing vertex -> the triangles it is a corner of
  for (let t = 0; t < index.count; t += 3) {
    const corners = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    if (!corners.some(wing)) continue;
    for (const c of corners) (around.get(c) || around.set(c, []).get(c)).push(corners);
    const k = cellOf(corners.reduce((s, i) => s.add(at(i)), new THREE.Vector3()).divideScalar(3)).join(',');
    (cells.get(k) || cells.set(k, []).get(k)).push(corners);
  }
  const ray = new THREE.Ray(), hit = new THREE.Vector3(), tri = new THREE.Triangle();
  const facing = [];
  for (let i = 0; i < pos.count; i += 2) {
    if (!wing(i) || carried(mesh, i, finger) > 0.99) continue;
    const p = at(i), n = new THREE.Vector3().fromBufferAttribute(normal, i);
    ray.set(p.clone().addScaledVector(n, -0.002), n.clone().negate());
    let best = null;
    const [cx, cy, cz] = cellOf(p);
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
      for (const corners of cells.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) {
        if (corners.includes(i)) continue;
        tri.set(...corners.map(at));
        if (tri.getNormal(new THREE.Vector3()).dot(n) > -0.3 || !ray.intersectTriangle(tri.a, tri.b, tri.c, false, hit)) continue;
        const d = hit.distanceTo(p);
        if (d < 0.1 && (!best || d < best.d)) best = { d, corners, share: tri.getBarycoord(hit, new THREE.Vector3()).toArray() };
      }
    }
    if (best) facing.push({ i, ...best });
  }
  const across = facing.map(f => {
    const there = new Map();
    f.corners.forEach((c, k) => { for (const [bone, w] of weightsOf(c)) there.set(bone, (there.get(bone) || 0) + f.share[k] * w); });
    const here = weightsOf(f.i);
    let diff = 0;
    for (const bone of new Set([...here.keys(), ...there.keys()])) diff += Math.abs((here.get(bone) || 0) - (there.get(bone) || 0));
    return diff / 2;
  }).sort((a, b) => a - b);
  const q = (list, f) => list[Math.floor(f * (list.length - 1))];
  assert.ok(facing.length > 500, `${facing.length} points with a point facing them across the membrane`);
  assert.ok(q(across, 0.5) < 0.03 && q(across, 0.95) < 0.1, `facing points differ in weight by ${q(across, 0.5).toFixed(3)} (median), ${q(across, 0.95).toFixed(3)} (95 %)`);
  // The gap through the flights, along the face's own posed normal (that of the triangles around the
  // point), as a share of the gap in the bind pose: below zero the faces crossed.
  const posed = i => mesh.getVertexPosition(i, new THREE.Vector3());
  for (const name of ['fly', 'glide', 'carry']) {
    const flight = clip(name);
    const pose = poser(scene, flight);
    const ratios = [];
    for (let f = 0; f < 12; f++) {
      pose((f / 12) * flight.duration);
      for (const { i, d, corners, share } of facing) {
        const p = posed(i);
        const h = corners.reduce((s, c, k) => s.addScaledVector(posed(c), share[k]), new THREE.Vector3());
        const n = new THREE.Vector3();
        for (const [a, b, c] of around.get(i).map(list => list.map(posed))) n.add(b.sub(a).cross(c.sub(a)));
        n.normalize();
        ratios.push(-h.sub(p).dot(n) / d);
      }
    }
    ratios.sort((a, b) => a - b);
    const crossed = ratios.filter(r => r < 0).length / ratios.length;
    assert.ok(Math.abs(q(ratios, 0.5) - 1) < 0.1 && crossed < 0.02, `${name}: the membrane's faces keep ${q(ratios, 0.5).toFixed(2)} of their gap (median); ${(crossed * 100).toFixed(2)} % of the facing points crossed`);
  }
});

test('at its own speed the walk sets each foot down flat, holds it still and lifts it cleanly', async () => {
  const { scene, mesh, clip } = await model();
  const walk = clip('walk');
  const bones = mesh.skeleton.bones;
  const pos = mesh.geometry.attributes.position;
  scene.updateMatrixWorld(true);
  const feet = FEET.map(name => {
    const bone = bones.find(b => b.name === name);
    // The sole: vertices carried by the foot bone alone that touch the ground in the bind pose.
    const sole = [];
    for (let i = 0; i < pos.count; i++) if (carried(mesh, i, [name]) > 0.999 && pos.getY(i) < 0.01) sole.push(i);
    return { bone, sole, rest: bone.getWorldPosition(new THREE.Vector3()) };
  });
  assert.ok(feet.every(f => f.sole.length > 20), `each foot has a sole (${feet.map(f => f.sole.length)})`);
  const pose = poser(scene, walk);
  const steps = Math.round(walk.duration * 60); // 60 samples a second
  const dt = walk.duration / steps;
  const ankles = [];
  for (let i = 0; i <= steps; i++) { pose(i * dt); ankles.push(feet.map(f => f.bone.getWorldPosition(new THREE.Vector3()))); }
  const speeds = [];
  for (let i = 1; i <= steps; i++) {
    feet.forEach((f, k) => {
      const a = ankles[i - 1][k], b = ankles[i][k];
      if (Math.abs(a.y - f.rest.y) < 5e-4 && Math.abs(b.y - f.rest.y) < 5e-4) speeds.push((a.x - b.x) / dt);
    });
  }
  assert.ok(speeds.length > steps * 0.9, `a foot is down for ${speeds.length} of ${2 * steps} samples`);
  const speed = speeds.reduce((sum, v) => sum + v, 0) / speeds.length;
  assert.ok(speed >= 0.65 && speed <= 0.8, `walks at ${speed.toFixed(3)} m/s`);
  const spread = Math.max(...speeds.map(v => Math.abs(v - speed)));
  assert.ok(spread < 0.01 * speed, `a planted foot moves back at ${speed.toFixed(3)} m/s, give or take ${spread.toFixed(4)}`);
  // Walk the body at that speed: no part of a sole on the ground moves along it, the sole never sinks,
  // and a foot whose ankle is down stands flat.
  let skid = 0, sink = 0, tilt = 0, last = null;
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), ankle = new THREE.Vector3();
  for (let i = 0; i <= steps; i++) {
    pose(i * dt);
    scene.position.x = speed * i * dt;
    scene.updateMatrixWorld(true);
    const now = feet.map(f => f.sole.map(j => mesh.getVertexPosition(j, v).applyMatrix4(mesh.matrixWorld).clone()));
    feet.forEach((f, k) => {
      for (const p of now[k]) sink = Math.max(sink, -p.y);
      if (last) now[k].forEach((p, j) => { const b = last[k][j]; if (p.y < 0.002 && b.y < 0.002) skid = Math.max(skid, Math.hypot(p.x - b.x, p.z - b.z)); });
      if (Math.abs(f.bone.getWorldPosition(ankle).y - f.rest.y) < 5e-4) tilt = Math.max(tilt, deg(f.bone.getWorldQuaternion(q).angleTo(new THREE.Quaternion())));
    });
    last = now;
  }
  scene.position.x = 0;
  assert.ok(skid < 1e-3, `a sole on the ground moved ${mm(skid)} in 1/60 s`);
  assert.ok(sink < 2e-3, `a sole sank ${mm(sink)} into the ground`);
  assert.ok(tilt < 1, `a planted foot was tilted ${tilt.toFixed(1)} degrees`);

  // The knuckles of the folded wings step too, as pterosaurs walked on them: down, each knuckle sweeps
  // back at the walking speed, so it stays put while she walks; a quarter of a stride after its foot.
  const knuckles = ['LeftFinger1', 'RightFinger1'].map(n => bones.find(b => b.name === n));
  const track = knuckles.map(() => []);
  for (let i = 0; i <= steps; i++) { pose(i * dt); knuckles.forEach((b, k) => track[k].push(b.getWorldPosition(new THREE.Vector3()))); }
  for (const list of track) {
    const low = Math.min(...list.map(p => p.y));
    assert.ok(low < 0.08, `a knuckle comes down to ${low.toFixed(3)} m`);
    const down = [];
    for (let i = 1; i <= steps; i++) if (list[i].y < low + 5e-4 && list[i - 1].y < low + 5e-4) down.push((list[i - 1].x - list[i].x) / dt);
    assert.ok(down.length > steps * 0.4, `a knuckle is down for ${down.length} of ${steps} samples`);
    assert.ok(Math.max(...down.map(s => Math.abs(s - speed))) < 0.02 * speed, 'a knuckle that is down sweeps back at the walking speed');
  }
});

test('the actor measures her walking speed from the walk clip', async () => {
  const { flugedla } = await stage();
  const walk = flugedla.walkTo([[8, 0]], { speed: 0.72 });
  assert.ok(flugedla.gait && flugedla.gait.naturalSpeed >= 0.65 && flugedla.gait.naturalSpeed <= 0.8, JSON.stringify(flugedla.gait && { speed: flugedla.gait.naturalSpeed }));
  for (let i = 0; i < 600 && !walk.done; i++) flugedla.update(1 / 30);
  assert.equal(walk.done, true);
  assert.ok(flugedla.root.position.distanceTo(new THREE.Vector3(8, 0, 0)) < 1e-3);
});

test('walking, a planted foot stays put and strides are the clip\'s own', async () => {
  for (const speed of [0.55, 0.72, 0.9]) {
    const { flugedla } = await stage();
    const watch = footWatch(flugedla);
    const walk = flugedla.walkTo([[30, 0]], { speed });
    for (let i = 0; i < 900 && flugedla.root.position.x < 2; i++) flugedla.update(1 / 30);
    watch.start();
    for (let i = 0; i < 1200 && flugedla.root.position.x < 12; i++) { flugedla.update(1 / 30); watch.sample(); }
    assert.equal(walk.done, false);
    assert.ok(watch.lifts >= 12, `${watch.lifts} steps at ${speed} m/s`);
    assert.ok(watch.slide < 1e-3, `at ${speed} m/s a planted foot moved ${mm(watch.slide)} in a frame`);
    const strides = watch.spots.flatMap(list => list.slice(1).map((p, i) => p.distanceTo(list[i])));
    for (const stride of strides) assert.ok(Math.abs(stride - flugedla.gait.naturalSpeed * flugedla.gait.cycle) < 0.05, `a foot moved ${stride.toFixed(2)} m between plantings`);
  }
});

test('a walk starts without dragging a foot, and stopping brings the lifted feet down', async () => {
  for (const turnFirst of [null, -40]) {
    const { flugedla } = await stage();
    const watch = footWatch(flugedla);
    if (turnFirst !== null) {
      const turn = flugedla.turnTo(turnFirst);
      for (let i = 0; i < 600 && (!turn.done || flugedla.stepping); i++) flugedla.update(1 / 30);
    }
    const h = THREE.MathUtils.degToRad(flugedla.heading);
    const walk = flugedla.walkTo([[8 * Math.cos(h), 8 * Math.sin(h)]], { speed: 0.72 });
    watch.start();
    for (let i = 0; i < 150 && !walk.done; i++) { flugedla.update(1 / 30); watch.sample(); }
    assert.ok(watch.lifts >= 4, 'the feet step');
    assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
  }
  for (const goal of [6, 6.4, 6.8]) { // different points of the stride
    const { flugedla } = await stage();
    const watch = footWatch(flugedla);
    const walk = flugedla.walkTo([[goal, 0]], { speed: 0.72 });
    for (let i = 0; i < 900 && !walk.done; i++) { flugedla.update(1 / 30); if (flugedla.root.position.x > goal - 1) watch.sample(); }
    assert.equal(walk.done, true);
    for (let i = 0; i < 120; i++) { flugedla.update(1 / 30); watch.sample(); }
    assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
    assert.ok(watch.sample().every(foot => foot.down), 'every foot is down four seconds after the stop');
    assert.equal(flugedla.stepping, false);
  }
});

test('turning on the spot, a foot that is down stays put, and idle and the nod keep the feet where they stand', async () => {
  for (const goal of [75, 180]) {
    const { flugedla } = await stage();
    const watch = footWatch(flugedla);
    for (let i = 0; i < 10; i++) flugedla.update(1 / 30);
    watch.start();
    const turn = flugedla.turnTo(goal);
    for (let i = 0; i < 600 && (!turn.done || flugedla.stepping); i++) { flugedla.update(1 / 30); watch.sample(); }
    assert.equal(turn.done, true);
    assert.ok(Math.abs(flugedla.heading - goal) < 1.5, `heading ${flugedla.heading}`);
    assert.ok(watch.lifts >= 4, `${watch.lifts} steps`);
    assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
  }
  for (const clip of ['idle', 'kink']) {
    const { flugedla } = await stage();
    const watch = footWatch(flugedla);
    const turn = flugedla.turnTo(50);
    for (let i = 0; i < 600 && (!turn.done || flugedla.stepping); i++) flugedla.update(1 / 30);
    const before = watch.start().map(foot => foot.p.clone());
    flugedla.play(clip);
    for (let i = 0; i < 150; i++) { flugedla.update(1 / 30); watch.sample(); }
    const after = watch.sample();
    assert.ok(watch.slide < 1e-3, `${clip}: a planted foot moved ${mm(watch.slide)} in a frame`);
    after.forEach((foot, k) => assert.ok(foot.p.distanceTo(before[k]) < 1e-3, `${clip}: a foot moved ${mm(foot.p.distanceTo(before[k]))}`));
  }
});

test('the nod dips the head and brings it back', async () => {
  const { scene, clip } = await model();
  const kink = clip('kink');
  const pose = poser(scene, kink);
  const head = scene.getObjectByName('Head');
  const pitchAt = t => { pose(t); const f = new THREE.Vector3(1, 0, 0).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion())); return deg(Math.asin(f.y)); };
  const pitches = Array.from({ length: 49 }, (_, i) => pitchAt((i / 48) * kink.duration));
  assert.ok(Math.min(...pitches) < pitches[0] - 15, `the head dips ${(pitches[0] - Math.min(...pitches)).toFixed(1)} degrees`);
  assert.ok(Math.abs(pitches.at(-1) - pitches[0]) < 1, 'it comes back to where it started');
});

test('taking off, she leaps and climbs to flying height; landing, she comes down onto her feet', async () => {
  const { scene, mesh, clip } = await model();
  const [takeOff, fly, land, idle] = ['takeOff', 'fly', 'land', 'idle'].map(clip);
  // takeOff ends exactly where fly begins; land begins there and ends exactly where idle begins, so the
  // actor's cross-fades join them without a jump.
  assert.ok(gap(bonesAt(scene, takeOff, takeOff.duration), bonesAt(scene, fly, 0)) < 2e-3, 'takeOff ends in fly\'s first pose');
  assert.ok(gap(bonesAt(scene, land, 0), bonesAt(scene, fly, 0)) < 2e-3, 'land starts in fly\'s first pose');
  assert.ok(gap(bonesAt(scene, land, land.duration), bonesAt(scene, idle, 0)) < 2e-3, 'land ends in idle\'s first pose');
  const feet = FEET.map(n => scene.getObjectByName(n));
  const hips = scene.getObjectByName('Hips');
  const low = (c, t) => { poser(scene, c)(t); return Math.min(...feet.map(f => f.getWorldPosition(new THREE.Vector3()).y)); };
  scene.updateMatrixWorld(true);
  const rest = Math.min(...feet.map(f => f.getWorldPosition(new THREE.Vector3()).y));
  // Standing at the start; in the air by the end of the leap; up at flying height at the end.
  assert.ok(Math.abs(low(takeOff, 0) - rest) < 0.01, 'she starts on her feet');
  assert.ok(low(takeOff, 1.2) > rest + 0.3, `her feet are ${(low(takeOff, 1.2) - rest).toFixed(2)} m up after the leap`);
  poser(scene, takeOff)(takeOff.duration);
  const flying = hips.getWorldPosition(new THREE.Vector3()).y;
  assert.ok(flying > 2.4 && flying < 2.9, `her hips are ${flying.toFixed(2)} m up at the end`);
  assert.ok(Math.abs(low(land, land.duration) - rest) < 0.01, 'she ends on her feet');
  // Coming down she touches the ground with her feet before the wings have folded.
  assert.ok(low(land, 2.3) - rest < 0.02, 'her feet are on the ground after the touch-down');
  assert.ok(mesh.geometry.index.count > 0);
});

test('flying, the body stays level at flying height while the wings beat; gliding, she banks gently', async () => {
  const { scene, clip } = await model();
  const hips = scene.getObjectByName('Hips'), chest = scene.getObjectByName('Chest');
  const tips = ['LeftFinger3', 'RightFinger3'].map(n => scene.getObjectByName(n));
  const fly = clip('fly');
  const pose = poser(scene, fly);
  let lowTip = Infinity, highTip = -Infinity, steepest = 0, lowest = Infinity, highest = -Infinity;
  for (let i = 0; i <= 56; i++) {
    pose((i / 56) * fly.duration);
    const h = hips.getWorldPosition(new THREE.Vector3()), c = chest.getWorldPosition(new THREE.Vector3());
    steepest = Math.max(steepest, Math.abs(deg(Math.atan2(c.y - h.y, Math.hypot(c.x - h.x, c.z - h.z)))));
    lowest = Math.min(lowest, h.y); highest = Math.max(highest, h.y);
    for (const t of tips) { const y = t.getWorldPosition(new THREE.Vector3()).y; lowTip = Math.min(lowTip, y); highTip = Math.max(highTip, y); }
  }
  assert.ok(steepest < 10, `her body tips up to ${steepest.toFixed(1)} degrees from level`);
  assert.ok(lowest > 2.4 && highest - lowest < 0.15, `her hips bob between ${lowest.toFixed(2)} and ${highest.toFixed(2)} m`);
  assert.ok(highTip - lowTip > 2, `the wingtips beat through ${(highTip - lowTip).toFixed(2)} m`);
  const glide = clip('glide');
  const gpose = poser(scene, glide);
  const rolls = [];
  for (let i = 0; i <= 60; i++) {
    gpose((i / 60) * glide.duration);
    const side = new THREE.Vector3(0, 0, 1).applyQuaternion(hips.getWorldQuaternion(new THREE.Quaternion()));
    rolls.push(deg(Math.asin(side.y)));
  }
  assert.ok(Math.max(...rolls) > 5 && Math.min(...rolls) < -5 && Math.max(...rolls.map(Math.abs)) < 12, `she banks between ${Math.min(...rolls).toFixed(1)} and ${Math.max(...rolls).toFixed(1)} degrees`);
});

test('carrying, a seat on her back between the wings stays put and level, and her back under it', async () => {
  const { scene, mesh, clip } = await model();
  const carry = clip('carry');
  const pose = poser(scene, carry);
  pose(0);
  // The seat, as the bake finds it: on her middle line between the hips and the shoulders, the top of the
  // skin that the spine carries all but entirely. It follows the bone that carries it most.
  const pos = mesh.geometry.attributes.position;
  const shoulders = ['LeftUpperArm', 'RightUpperArm'].map(n => scene.getObjectByName(n).getWorldPosition(new THREE.Vector3()));
  const hipsX = scene.getObjectByName('Hips').getWorldPosition(new THREE.Vector3()).x;
  const v = new THREE.Vector3();
  let top = null;
  for (let i = 0; i < pos.count; i++) {
    if (carried(mesh, i, SPINE) < 0.97) continue;
    mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
    if (Math.abs(v.z) > 0.05 || v.x > shoulders[0].x || v.x < hipsX) continue;
    if (!top || v.y > top.p.y) top = { p: v.clone(), i };
  }
  assert.ok(top, 'there is a seat');
  const { skinIndex, skinWeight } = mesh.geometry.attributes;
  let k = 0;
  for (let c = 1; c < 4; c++) if (skinWeight.getComponent(top.i, c) > skinWeight.getComponent(top.i, k)) k = c;
  const bone = mesh.skeleton.bones[skinIndex.getComponent(top.i, k)];
  assert.equal(bone.name, 'Spine');
  assert.ok(top.p.y > 2.6 && top.p.y < 3.0, `the seat is ${top.p.y.toFixed(2)} m up`);
  // A stand-in for the saddle: an object on that bone at the seat, level when carry starts.
  const seat = new THREE.Object3D();
  bone.add(seat);
  seat.position.copy(bone.worldToLocal(top.p.clone()));
  seat.quaternion.copy(bone.getWorldQuaternion(new THREE.Quaternion()).invert());
  scene.updateMatrixWorld(true);
  // The back under the seat: the skin within 30 cm of it that the spine carries all but entirely.
  const under = [];
  for (let i = 0; i < pos.count; i++) {
    mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
    if (v.distanceTo(top.p) < 0.3 && carried(mesh, i, SPINE) > 0.97) under.push([i, seat.worldToLocal(v.clone())]);
  }
  assert.ok(under.length > 20, `${under.length} vertices of her back under the seat`);
  const start = seat.getWorldPosition(new THREE.Vector3());
  let moved = 0, tilt = 0, slip = 0;
  for (let s = 0; s <= 108; s++) {
    pose((s / 108) * carry.duration);
    moved = Math.max(moved, seat.getWorldPosition(new THREE.Vector3()).distanceTo(start));
    tilt = Math.max(tilt, deg(new THREE.Vector3(0, 1, 0).applyQuaternion(seat.getWorldQuaternion(new THREE.Quaternion())).angleTo(new THREE.Vector3(0, 1, 0))));
    for (const [i, local] of under) slip = Math.max(slip, seat.worldToLocal(mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld)).distanceTo(local));
  }
  assert.ok(moved < 0.01, `the seat moved ${mm(moved)} through carry`);
  assert.ok(tilt < 1, `the seat tilted ${tilt.toFixed(2)} degrees`);
  assert.ok(slip < 0.005, `her back under the seat moved ${mm(slip)} against it`);
  // In carry she flies: the seat is over her back, the wings beat beside it.
  const tips = ['LeftFinger3', 'RightFinger3'].map(n => scene.getObjectByName(n));
  const heights = [];
  for (let s = 0; s <= 36; s++) { pose((s / 36) * carry.duration); heights.push(tips[1].getWorldPosition(new THREE.Vector3()).y); }
  assert.ok(Math.max(...heights) - Math.min(...heights) > 1, 'the wings beat while she carries');
});

test('happy, she hops on the spot with a flutter, and lands on her feet', async () => {
  const { scene, clip } = await model();
  const happy = clip('happy');
  assert.ok(gap(bonesAt(scene, happy, 0), bonesAt(scene, happy, happy.duration - 1e-4)) < 0.005, 'happy loops');
  const feet = FEET.map(n => scene.getObjectByName(n));
  scene.updateMatrixWorld(true);
  const rest = feet.map(f => f.getWorldPosition(new THREE.Vector3()));
  const pose = poser(scene, happy);
  let top = 0;
  for (let i = 0; i <= 72; i++) {
    pose((i / 72) * happy.duration);
    top = Math.max(top, Math.min(...feet.map((f, k) => f.getWorldPosition(new THREE.Vector3()).y - rest[k].y)));
  }
  assert.ok(top > 0.08 && top < 0.4, `both feet leave the ground by ${(top * 100).toFixed(1)} cm`);
  // In a scene the clip takes the legs, and back in idle the feet stand where they rest.
  const { flugedla } = await stage();
  const watch = footWatch(flugedla);
  watch.start();
  flugedla.play('happy');
  let lifted = false;
  for (let i = 0; i < 60; i++) { flugedla.update(1 / 30); lifted ||= watch.sample().every(foot => !foot.down); }
  flugedla.play('idle');
  for (let i = 0; i < 30; i++) flugedla.update(1 / 30);
  assert.ok(lifted, 'the feet left the ground in the scene');
  assert.ok(watch.sample().every(foot => foot.down && foot.reach < 0.01), 'and stand on their rest spots again');
});

test('the mouth pass gave her a jaw: her beak opens a little when she talks, without teeth', async () => {
  const { scene, mesh } = await model();
  scene.updateMatrixWorld(true);
  const jaw = scene.getObjectByName('Jaw');
  assert.equal(jaw?.parent?.name, 'Head');
  assert.deepEqual(mesh.userData.face.mouth, { talk: 6 });
  const k = mesh.skeleton.bones.indexOf(jaw);
  const { skinIndex, skinWeight, position } = mesh.geometry.attributes;
  const jawCarried = [];
  for (let i = 0; i < position.count; i++) {
    let w = 0;
    for (let c = 0; c < 4; c++) if (skinIndex.getComponent(i, c) === k) w += skinWeight.getComponent(i, c);
    if (w > 0.9) jawCarried.push(i);
  }
  assert.ok(jawCarried.length > 300, `the jaw carries ${jawCarried.length} vertices`);
  const at = i => mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
  let tip = 0;
  for (let i = 0; i < position.count; i++) if (at(i).x > at(tip).x) tip = i; // the tip of her upper beak
  const chin = jawCarried.reduce((a, b) => (at(b).x > at(a).x ? b : a)); // the tip of the lower beak
  const before = [at(tip), at(chin)];
  jaw.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, -1).applyQuaternion(jaw.parent.getWorldQuaternion(new THREE.Quaternion()).invert()), THREE.MathUtils.degToRad(6));
  scene.updateMatrixWorld(true);
  assert.ok(at(tip).distanceTo(before[0]) < 1e-3, `the tip of the upper beak moved ${mm(at(tip).distanceTo(before[0]))}`);
  assert.ok(before[1].y - at(chin).y > 0.08, `the lower beak's tip dropped ${(before[1].y - at(chin).y).toFixed(3)} m`);
  // Talking, the actor opens it by face.mouth.talk at the loudest.
  const quiet = (await stage()).flugedla, loud = (await stage()).flugedla;
  loud.talk({ mouth: 'ffffffffffffffffffffffffffffff', duration: 1.5 });
  for (let i = 0; i < 20; i++) { quiet.update(1 / 30); loud.update(1 / 30); }
  const opened = deg(loud.model.getObjectByName('Jaw').quaternion.angleTo(quiet.model.getObjectByName('Jaw').quaternion));
  assert.ok(opened > 4.5 && opened < 6.5, `her beak opened ${opened.toFixed(1)} degrees`);
});
