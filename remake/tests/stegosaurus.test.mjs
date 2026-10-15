import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { clone as cloneSkinned } from '../../dist/vendor/SkeletonUtils.js';
import { createActor } from '../engine/actor.js';
import { createPointResolver } from '../engine/points.js';

// Kambeðla as baked by remake/tools/bake/bake-quadruped.js, read without textures (no DOM in Node).
const FILE = new URL('../assets/characters/stegosaurus.glb', import.meta.url);
function readGlb() {
  const glb = fs.readFileSync(FILE);
  const jsonLength = glb.readUInt32LE(12);
  return { glb, jsonLength, json: JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8')) };
}
function loadGlb() {
  const { glb, jsonLength, json } = readGlb();
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const material of json.materials ?? []) {
    delete material.normalTexture;
    if (material.pbrMetallicRoughness) {
      delete material.pbrMetallicRoughness.baseColorTexture;
      delete material.pbrMetallicRoughness.metallicRoughnessTexture;
    }
  }
  let text = Buffer.from(JSON.stringify(json), 'utf8');
  if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
  const rest = glb.subarray(20 + jsonLength);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + text.length + rest.length, 8);
  header.writeUInt32LE(text.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const out = Buffer.concat([header, text, rest]);
  return new Promise((resolve, reject) => new GLTFLoader().parse(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength), '', resolve, reject));
}

const gltfPromise = loadGlb();
const CHAIN = ['Hips', 'Spine', 'Chest', 'Neck', 'Neck2', 'Head', 'Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6'];
const LEGS = ['BackLegL', 'BackFootL', 'BackLegR', 'BackFootR', 'FrontLegL', 'FrontFootL', 'FrontLegR', 'FrontFootR'];
const BONES = ['root', ...CHAIN, ...LEGS];
const FEET = ['FrontFootL', 'FrontFootR', 'BackFootL', 'BackFootR'];

// A copy of Kambeðla in the bind pose (the loaded scene itself is never posed).
async function model() {
  const gltf = await gltfPromise;
  const scene = cloneSkinned(gltf.scene);
  let mesh = null;
  scene.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  return { gltf, scene, mesh, clip: name => gltf.animations.find(c => c.name === name) };
}

async function stage() {
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const world = { scene: new THREE.Scene(), camera, heightAt: () => 0, actors: new Map() };
  world.resolvePoint = createPointResolver(world);
  const kambedla = await createActor(world, { name: 'kambedla', gltf: await gltfPromise });
  world.actors.set('kambedla', kambedla);
  return { world, kambedla };
}

// Follows the feet frame by frame from start(), as Mosi's and Egill's tests do: the most a foot
// moved along the ground between two frames in which it was down (within 1 mm of its bind-pose
// height), how often a foot lifted, how far a planted foot got from its rest spot, and where each
// foot was set down. Make it while the legs are still in the bind pose.
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

test('Kambeðla has the quadruped skeleton, the clips and fits the budget', async () => {
  const { gltf, mesh } = await model();
  assert.deepEqual(mesh.skeleton.bones.map(b => b.name), BONES);
  // Identity rest rotations: clips turn bones about the character's own axes.
  for (const bone of mesh.skeleton.bones) assert.ok(bone.quaternion.angleTo(new THREE.Quaternion()) < 1e-6, `${bone.name} is turned at rest`);
  const clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
  assert.deepEqual(Object.keys(clips).sort(), ['eat', 'happy', 'idle', 'kink', 'walk']);
  for (const clip of Object.values(clips)) {
    const animated = new Set(clip.tracks.map(t => t.name.split('.')[0]));
    for (const bone of CHAIN) assert.ok(animated.has(bone), `${clip.name} leaves ${bone} alone`);
    // Only the walk and the hop move the legs: in idle, kink and eat, footing keeps the feet where
    // they stand.
    const legs = ['walk', 'happy'].includes(clip.name);
    for (const bone of LEGS) assert.equal(animated.has(bone), legs, `${clip.name} ${legs ? 'leaves' : 'moves'} ${bone}`);
  }
  assert.ok(mesh.geometry.index.count / 3 <= 40000, 'at most 40k triangles');
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  assert.ok(Math.abs(box.max.x - box.min.x - 7) < 0.01, `${(box.max.x - box.min.x).toFixed(3)} m from nose to tail tip`);
  assert.ok(Math.abs(box.min.y) < 0.005, 'stands on the ground');

  const { glb, jsonLength, json } = readGlb();
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

test('every vertex weight sums to one', async () => {
  const { mesh } = await model();
  const w = mesh.geometry.attributes.skinWeight;
  for (let i = 0; i < w.count; i++) {
    const sum = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i);
    assert.ok(Math.abs(sum - 1) < 1e-3, `vertex ${i} sums to ${sum}`);
  }
});

test('the welded skin is closed and consistently wound, so single-sided it shows no holes', async () => {
  const { mesh } = await model();
  const pos = mesh.geometry.attributes.position;
  const weights = [mesh.geometry.attributes.skinIndex, mesh.geometry.attributes.skinWeight];
  const ids = new Map();
  const rep = new Int32Array(pos.count);
  const key = i => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  let seamWeights = 0;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    if (!ids.has(k)) ids.set(k, i);
    rep[i] = ids.get(k);
    // Both sides of a seam carry the same weights, so the seam stays closed when skinned.
    if (rep[i] !== i) {
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
      const edge = edges.get(k) || { n: 0, turn: 0 };
      edge.n++;
      edge.turn += a < b ? 1 : -1;
      edges.set(k, edge);
    }
  }
  const bad = [...edges.values()].filter(e => e.n !== 2 || e.turn !== 0).length;
  assert.equal(bad, 0, `${bad} edges are open, shared by more than two triangles or wound against each other`);
});

test('the plates and the tail spikes ride rigidly on one bone each', async () => {
  const { mesh } = await model();
  const pos = mesh.geometry.attributes.position;
  const { skinIndex, skinWeight } = mesh.geometry.attributes;
  const bones = mesh.skeleton.bones;
  const riders = new Map();
  let checked = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // The upper halves of the big back plates, and the spikes' tips out to the side of the tail.
    const plate = y > 3.2;
    const spike = x < -3.3 && Math.abs(z) > 0.35;
    if (!plate && !spike) continue;
    checked++;
    assert.ok(skinWeight.getX(i) > 0.999, `vertex ${i} at (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) blends bones`);
    const bone = bones[skinIndex.getX(i)].name;
    riders.set(plate ? 'plates' : 'spikes', (riders.get(plate ? 'plates' : 'spikes') || new Set()).add(bone));
  }
  assert.ok(checked > 200, `${checked} vertices checked`);
  for (const bone of riders.get('plates')) assert.ok(['Hips', 'Spine'].includes(bone), `a back plate rides ${bone}`);
  assert.deepEqual([...riders.get('spikes')], ['Tail5']);
});

test('at its own speed the walk sets each foot down flat, holds it still and lifts it cleanly', async () => {
  const { scene, mesh, clip } = await model();
  const walk = clip('walk');
  const bones = mesh.skeleton.bones;
  const pos = mesh.geometry.attributes.position;
  const index = mesh.geometry.attributes.skinIndex;
  const weight = mesh.geometry.attributes.skinWeight;
  scene.updateMatrixWorld(true);
  const feet = FEET.map(name => {
    const bone = bones.find(b => b.name === name);
    const b = bones.indexOf(bone);
    // The sole: vertices carried by the foot bone alone that touch the ground in the bind pose.
    const sole = [];
    for (let i = 0; i < pos.count; i++) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (index.getComponent(i, k) === b) w += weight.getComponent(i, k);
      if (w > 0.999 && pos.getY(i) < 0.01) sole.push(i);
    }
    return { bone, sole, rest: bone.getWorldPosition(new THREE.Vector3()) };
  });
  assert.ok(feet.every(f => f.sole.length > 30), 'each foot has a sole');

  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(walk).play();
  const steps = Math.round(walk.duration * 60); // 60 samples a second
  const dt = walk.duration / steps;
  const ankle = new THREE.Vector3();
  // The clip's own speed: how fast a foot moves back under the body while its ankle is down.
  const ankles = [];
  for (let i = 0; i <= steps; i++) {
    mixer.setTime(i * dt);
    scene.updateMatrixWorld(true);
    ankles.push(feet.map(f => f.bone.getWorldPosition(new THREE.Vector3())));
  }
  const speeds = [];
  for (let i = 1; i <= steps; i++) {
    feet.forEach((f, k) => {
      const a = ankles[i - 1][k], b = ankles[i][k];
      if (Math.abs(a.y - f.rest.y) < 5e-4 && Math.abs(b.y - f.rest.y) < 5e-4) speeds.push((a.x - b.x) / dt);
    });
  }
  assert.ok(speeds.length > steps * 2, `a foot is down for ${speeds.length} of ${4 * steps} samples`);
  const speed = speeds.reduce((sum, v) => sum + v, 0) / speeds.length;
  assert.ok(speed >= 0.8 && speed <= 1.0, `walks at ${speed.toFixed(3)} m/s`);
  const spread = Math.max(...speeds.map(v => Math.abs(v - speed)));
  assert.ok(spread < 0.01 * speed, `a planted foot moves back at ${speed.toFixed(3)} m/s, give or take ${spread.toFixed(4)}`);

  // Now walk the body at that speed: no part of a sole that touches the ground moves along it, the
  // sole never sinks, and a foot whose ankle is down stands flat.
  let skid = 0;
  let sink = 0;
  let tilt = 0;
  let last = null;
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  for (let i = 0; i <= steps; i++) {
    mixer.setTime(i * dt);
    scene.position.x = speed * i * dt;
    scene.updateMatrixWorld(true);
    const now = feet.map(f => f.sole.map(j => mesh.getVertexPosition(j, v).applyMatrix4(mesh.matrixWorld).clone()));
    feet.forEach((f, k) => {
      for (const p of now[k]) sink = Math.max(sink, -p.y);
      if (last) {
        now[k].forEach((p, j) => {
          const before = last[k][j];
          if (p.y < 0.002 && before.y < 0.002) skid = Math.max(skid, Math.hypot(p.x - before.x, p.z - before.z));
        });
      }
      if (Math.abs(f.bone.getWorldPosition(ankle).y - f.rest.y) < 5e-4) {
        tilt = Math.max(tilt, THREE.MathUtils.radToDeg(f.bone.getWorldQuaternion(q).angleTo(new THREE.Quaternion())));
      }
    });
    last = now;
  }
  scene.position.x = 0;
  assert.ok(skid < 5e-4, `a sole on the ground moved ${mm(skid)} in 1/60 s`);
  assert.ok(sink < 1e-3, `a sole sank ${mm(sink)} into the ground`);
  assert.ok(tilt < 1, `a planted foot was tilted ${tilt.toFixed(1)} degrees`);
});

test('the actor measures a calm walking speed from the walk clip', async () => {
  const { kambedla } = await stage();
  const walk = kambedla.walkTo([[6, 0]], { speed: 0.9 });
  assert.ok(kambedla.gait && kambedla.gait.naturalSpeed >= 0.8 && kambedla.gait.naturalSpeed <= 1.0, JSON.stringify(kambedla.gait && { speed: kambedla.gait.naturalSpeed }));
  for (let i = 0; i < 600 && !walk.done; i++) kambedla.update(1 / 30);
  assert.equal(walk.done, true);
  assert.ok(kambedla.root.position.distanceTo(new THREE.Vector3(6, 0, 0)) < 1e-3);
});

test('walking at a calm pace, a planted foot stays put and strides are the clip\'s own', async () => {
  for (const speed of [0.7, 0.9, 1.1]) {
    const { kambedla } = await stage();
    const watch = footWatch(kambedla);
    const walk = kambedla.walkTo([[30, 0]], { speed });
    for (let i = 0; i < 900 && kambedla.root.position.x < 2; i++) kambedla.update(1 / 30);
    watch.start();
    for (let i = 0; i < 1200 && kambedla.root.position.x < 14; i++) { kambedla.update(1 / 30); watch.sample(); }
    assert.equal(walk.done, false);
    assert.ok(watch.lifts >= 16, `${watch.lifts} steps at ${speed} m/s`);
    assert.ok(watch.slide < 1e-3, `at ${speed} m/s a planted foot moved ${mm(watch.slide)} in a frame`);
    const strides = watch.spots.flatMap(list => list.slice(1).map((p, i) => p.distanceTo(list[i])));
    for (const stride of strides) assert.ok(Math.abs(stride - kambedla.gait.naturalSpeed * kambedla.gait.cycle) < 0.05, `a foot moved ${stride.toFixed(2)} m between plantings`);
  }
});

test('a walk starts without dragging a foot or reaching too far', async () => {
  // From the bind pose, and from wherever a turn on the spot left the feet.
  for (const turnFirst of [null, -40]) {
    const { kambedla } = await stage();
    const watch = footWatch(kambedla);
    if (turnFirst !== null) {
      const turn = kambedla.turnTo(turnFirst);
      for (let i = 0; i < 600 && (!turn.done || kambedla.stepping); i++) kambedla.update(1 / 30);
    }
    const h = THREE.MathUtils.degToRad(kambedla.heading);
    const walk = kambedla.walkTo([[8 * Math.cos(h), 8 * Math.sin(h)]], { speed: 0.9 });
    watch.start();
    for (let i = 0; i < 150 && !walk.done; i++) { kambedla.update(1 / 30); watch.sample(); }
    assert.ok(watch.lifts >= 4, 'the feet step');
    assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
    assert.ok(watch.reach < 1.07, `a planted foot was ${watch.reach.toFixed(2)} m from its rest spot`);
  }
});

test('stopping keeps the planted feet where they are and brings the lifted ones down', async () => {
  for (const goal of [6, 6.6, 7.2]) { // different points of the stride
    const { kambedla } = await stage();
    const watch = footWatch(kambedla);
    const walk = kambedla.walkTo([[goal, 0]], { speed: 0.9 });
    for (let i = 0; i < 900 && !walk.done; i++) {
      kambedla.update(1 / 30);
      if (kambedla.root.position.x > goal - 1) watch.sample(); // the last metre, then the stop
    }
    assert.equal(walk.done, true);
    for (let i = 0; i < 120; i++) { kambedla.update(1 / 30); watch.sample(); }
    assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
    assert.ok(watch.sample().every(foot => foot.down), 'every foot is down four seconds after the stop');
    assert.equal(kambedla.stepping, false);
  }
});

test('turning on the spot, a foot that is down stays put and the feet step around', async () => {
  for (const goal of [75, 180]) {
    const { kambedla } = await stage();
    const watch = footWatch(kambedla);
    for (let i = 0; i < 10; i++) kambedla.update(1 / 30);
    watch.start();
    const turn = kambedla.turnTo(goal);
    for (let i = 0; i < 600 && (!turn.done || kambedla.stepping); i++) { kambedla.update(1 / 30); watch.sample(); }
    assert.equal(turn.done, true);
    assert.equal(kambedla.stepping, false);
    assert.ok(Math.abs(kambedla.heading - goal) < 1.5, `heading ${kambedla.heading}`);
    assert.ok(watch.lifts >= 4, `${watch.lifts} steps`);
    assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
  }
});

test('on a curve the planted feet stay put and within reach', async () => {
  const { kambedla } = await stage();
  const watch = footWatch(kambedla);
  // A quarter circle of 8 m radius between two straights.
  const rad = THREE.MathUtils.degToRad;
  const arc = [30, 60, 90].map(a => [3 + 8 * Math.sin(rad(a)), 8 * (1 - Math.cos(rad(a)))]);
  const walk = kambedla.walkTo([[3, 0], ...arc, [11, 12]], { speed: 0.9 });
  watch.start();
  for (let i = 0; i < 2400 && !walk.done; i++) { kambedla.update(1 / 30); watch.sample(); }
  assert.equal(walk.done, true);
  assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
  assert.ok(watch.reach < 1.15, `a planted foot was ${watch.reach.toFixed(2)} m from its rest spot`);
});

test('idle, the nod and eating leave the planted feet where they stand', async () => {
  for (const clip of ['idle', 'kink', 'eat']) {
    const { kambedla } = await stage();
    const watch = footWatch(kambedla);
    const turn = kambedla.turnTo(50);
    for (let i = 0; i < 600 && (!turn.done || kambedla.stepping); i++) kambedla.update(1 / 30);
    const before = watch.start().map(foot => foot.p.clone());
    kambedla.play(clip);
    for (let i = 0; i < 150; i++) { kambedla.update(1 / 30); watch.sample(); }
    const after = watch.sample();
    assert.ok(watch.slide < 1e-3, `${clip}: a planted foot moved ${mm(watch.slide)} in a frame`);
    after.forEach((foot, k) => assert.ok(foot.p.distanceTo(before[k]) < 1e-3, `${clip}: a foot moved ${mm(foot.p.distanceTo(before[k]))}`));
  }
});

test('the nod dips the head and brings it back', async () => {
  const { scene, clip } = await model();
  const kink = clip('kink');
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(kink).play();
  const head = scene.getObjectByName('Head');
  const pitchAt = t => {
    mixer.setTime(t);
    scene.updateMatrixWorld(true);
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
    return THREE.MathUtils.radToDeg(Math.asin(forward.y));
  };
  const pitches = Array.from({ length: 49 }, (_, i) => pitchAt((i / 48) * kink.duration));
  assert.ok(Math.min(...pitches) < -15, `the head dips ${Math.min(...pitches).toFixed(1)} degrees at most`);
  assert.ok(Math.abs(pitches[0]) < 1 && Math.abs(pitches.at(-1)) < 1, 'it starts and ends looking ahead');
});

// The loaded clip's pose at its start and at its end: the same, so it loops without a jump.
function loops(scene, clip) {
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(clip).play();
  const pose = t => {
    mixer.setTime(t);
    scene.updateMatrixWorld(true);
    const out = [];
    scene.traverse(o => { if (o.isBone) out.push(o.getWorldPosition(new THREE.Vector3())); });
    return out;
  };
  const first = pose(0), last = pose(clip.duration - 1e-4);
  mixer.stopAllAction();
  return Math.max(...first.map((p, i) => p.distanceTo(last[i])));
}

test('eating, the head comes down in front of her to a child\'s hand and goes back up', async () => {
  const { scene, mesh, clip } = await model();
  const eat = clip('eat');
  assert.ok(eat.duration >= 1.8 && eat.duration <= 2.2, `eat lasts ${eat.duration} s`);
  assert.ok(loops(scene, eat) < 0.005, 'eat loops');
  // The mouth: the most forward vertex the Head bone carries alone.
  const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
  const head = mesh.skeleton.bones.findIndex(b => b.name === 'Head');
  let beak = -1;
  for (let i = 0; i < position.count; i++) {
    if (skinIndex.getX(i) === head && skinWeight.getX(i) > 0.999 && (beak < 0 || position.getX(i) > position.getX(beak))) beak = i;
  }
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(eat).play();
  const v = new THREE.Vector3();
  let low = null;
  for (let i = 0; i <= 60; i++) {
    mixer.setTime((i / 60) * eat.duration);
    scene.updateMatrixWorld(true);
    mesh.getVertexPosition(beak, v).applyMatrix4(mesh.matrixWorld);
    if (!low || v.y < low.y) low = v.clone();
  }
  const fore = scene.getObjectByName('FrontFootL').getWorldPosition(new THREE.Vector3());
  assert.ok(low.y > 0.85 && low.y < 1.15, `the mouth comes down to ${low.y.toFixed(2)} m`);
  assert.ok(low.x > fore.x + 1, `the mouth is ${(low.x - fore.x).toFixed(2)} m ahead of the fore feet`);
});

test('happy, she hops on the spot and her feet leave the ground a little', async () => {
  const { scene, clip } = await model();
  const happy = clip('happy');
  assert.ok(happy.duration >= 1.3 && happy.duration <= 1.7, `happy lasts ${happy.duration} s`);
  assert.ok(loops(scene, happy) < 0.005, 'happy loops');
  const feet = FEET.map(n => scene.getObjectByName(n));
  scene.updateMatrixWorld(true);
  const rest = feet.map(f => f.getWorldPosition(new THREE.Vector3()));
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(happy).play();
  let top = 0, air = 0;
  for (let i = 0; i <= 90; i++) {
    mixer.setTime((i / 90) * happy.duration);
    scene.updateMatrixWorld(true);
    const lift = Math.min(...feet.map((f, k) => f.getWorldPosition(new THREE.Vector3()).y - rest[k].y));
    top = Math.max(top, lift);
    if (lift > 0.01) air++;
  }
  assert.ok(top > 0.04 && top < 0.15, `all four feet leave the ground by ${(top * 100).toFixed(1)} cm`);
  assert.ok(air >= 10, `in the air for ${air} of 91 samples`);
  // In a scene the clip takes the legs, and back in idle the feet stand where they rest.
  const { kambedla } = await stage();
  const watch = footWatch(kambedla);
  watch.start();
  kambedla.play('happy');
  let lifted = false;
  for (let i = 0; i < 60; i++) { kambedla.update(1 / 30); lifted ||= watch.sample().every(foot => !foot.down); }
  kambedla.play('idle');
  for (let i = 0; i < 30; i++) kambedla.update(1 / 30);
  assert.ok(lifted, 'the feet left the ground in the scene');
  assert.ok(watch.sample().every(foot => foot.down && foot.reach < 0.01), 'and stand on their rest spots again');
});

test('the plate mask counts the back plates in rows from the head', async () => {
  const { mesh } = await model();
  const rows = mesh.geometry.attributes._platerow; // glTF's custom attribute _PLATEROW
  assert.ok(rows, 'the mesh has a plateRow attribute');
  const pos = mesh.geometry.attributes.position;
  const xs = new Map();
  for (let i = 0; i < rows.count; i++) {
    const row = rows.getX(i);
    assert.ok(Number.isInteger(row) && row >= 0 && row <= 6, `vertex ${i} has row ${row}`);
    if (pos.getY(i) > 3.2) assert.ok(row > 0, 'the tops of the big back plates are in a row');
    if (pos.getX(i) < -3.3 && Math.abs(pos.getZ(i)) > 0.35) assert.equal(row, 0, 'the tail spikes are not plates');
    if (pos.getY(i) < 1.5) assert.equal(row, 0, 'nothing low on the body is a plate');
    if (row > 0) (xs.get(row) || xs.set(row, []).get(row)).push(pos.getX(i));
  }
  const count = Math.max(...xs.keys());
  assert.ok(count >= 3 && count <= 6, `${count} rows`);
  const mean = list => list.reduce((a, b) => a + b, 0) / list.length;
  for (let row = 1; row <= count; row++) assert.ok(xs.get(row)?.length > 100, `row ${row} has plates`);
  for (let row = 2; row <= count; row++) assert.ok(mean(xs.get(row)) < mean(xs.get(row - 1)), `row ${row} lies behind row ${row - 1}`);
});
