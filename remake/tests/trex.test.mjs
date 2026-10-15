import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { createActor } from '../engine/actor.js';
import { createPointResolver } from '../engine/points.js';

// Grameðla the T. rex as baked by remake/tools/bake/bake-tailed-biped.js, read without textures (no
// DOM in Node); the GLB's own JSON is kept for the material and texture checks.
const GLB = new URL('../assets/characters/trex.glb', import.meta.url);
const glb = fs.readFileSync(GLB);
const jsonLength = glb.readUInt32LE(12);
const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
const binary = glb.subarray(20 + jsonLength + 8);

function loadGlb() {
  const stripped = JSON.parse(JSON.stringify(json));
  delete stripped.images;
  delete stripped.textures;
  delete stripped.samplers;
  for (const material of stripped.materials ?? []) {
    delete material.normalTexture;
    if (material.pbrMetallicRoughness) {
      delete material.pbrMetallicRoughness.baseColorTexture;
      delete material.pbrMetallicRoughness.metallicRoughnessTexture;
    }
  }
  let text = Buffer.from(JSON.stringify(stripped), 'utf8');
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

// A fresh copy for each test: tests pose and move it.
const fresh = () => loadGlb();
const BONES = ['root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head', 'Jaw',
  'Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6',
  'LeftThigh', 'LeftShin', 'LeftFoot', 'RightThigh', 'RightShin', 'RightFoot',
  'LeftUpperArm', 'LeftLowerArm', 'LeftHand', 'RightUpperArm', 'RightLowerArm', 'RightHand'];
const skinnedMesh = gltf => { let mesh = null; gltf.scene.traverse(o => { if (o.isSkinnedMesh) mesh = o; }); return mesh; };

// Pixel size of a JPEG from its SOF marker.
function jpegSize(bytes) {
  for (let i = 2; i < bytes.length;) {
    const marker = bytes[i + 1];
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
    i += 2 + length;
  }
  return null;
}

test('Grameðla has the tailed-biped skeleton with identity rest rotations and her clips', async () => {
  const gltf = await fresh();
  const mesh = skinnedMesh(gltf);
  assert.deepEqual(mesh.skeleton.bones.map(b => b.name), BONES);
  for (const bone of mesh.skeleton.bones) assert.ok(bone.quaternion.angleTo(new THREE.Quaternion()) < 1e-6, `${bone.name} has a rest rotation`);
  const clips = Object.fromEntries(gltf.animations.map(c => [c.name, c.duration]));
  for (const name of ['idle', 'walk', 'roar']) assert.ok(clips[name] > 1, `${name} missing`);
  // Every clip animates every bone, so no turn is left behind when clips cross-fade.
  for (const clip of gltf.animations) {
    const animated = new Set(clip.tracks.map(t => t.name.split('.')[0]));
    for (const bone of BONES.slice(1)) assert.ok(animated.has(bone), `${clip.name} leaves ${bone} alone`);
  }
});

test('she is 12 m long, stands on the ground and fits the dinosaur budget', async () => {
  const mesh = skinnedMesh(await fresh());
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  assert.ok(Math.abs(box.max.x - box.min.x - 12) < 0.01, `length ${box.max.x - box.min.x}`);
  assert.ok(box.max.y - box.min.y > 4.8 && box.max.y - box.min.y < 5.6, `height ${box.max.y - box.min.y}`);
  assert.ok(Math.abs(box.min.y) < 0.005, 'stands on the ground');
  assert.ok(mesh.geometry.index.count / 3 <= 40000, `${mesh.geometry.index.count / 3} triangles`);
  // One single-sided matte material with two 1024 px JPEG maps (colour and normal).
  assert.equal(json.materials.length, 1);
  const material = json.materials[0];
  assert.ok(!material.doubleSided, 'single-sided');
  assert.ok(Math.abs(material.pbrMetallicRoughness.roughnessFactor - 0.62) < 0.005);
  assert.equal(material.pbrMetallicRoughness.metallicFactor, 0);
  assert.equal(json.images.length, 2);
  for (const image of json.images) {
    assert.equal(image.mimeType, 'image/jpeg');
    const view = json.bufferViews[image.bufferView];
    const size = jpegSize(binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength));
    assert.deepEqual(size, [1024, 1024]);
  }
});

test('every vertex weight sums to one', async () => {
  const mesh = skinnedMesh(await fresh());
  const w = mesh.geometry.attributes.skinWeight;
  for (let i = 0; i < w.count; i++) {
    const sum = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i);
    assert.ok(Math.abs(sum - 1) < 1e-3, `vertex ${i} sums to ${sum}`);
  }
});

// The world position of each foot (the Foot bone: the heel, which carries the toes) over a clip.
function feetOver(gltf, clipName, steps) {
  const mixer = new THREE.AnimationMixer(gltf.scene);
  const clip = gltf.animations.find(c => c.name === clipName);
  mixer.clipAction(clip).play();
  const feet = ['LeftFoot', 'RightFoot'].map(n => gltf.scene.getObjectByName(n));
  const out = [];
  for (let i = 0; i <= steps; i++) {
    mixer.setTime((i / steps) * clip.duration);
    gltf.scene.updateMatrixWorld(true);
    out.push(feet.map(f => f.getWorldPosition(new THREE.Vector3())));
  }
  return out;
}

test('standing and roaring, the feet stay planted', async () => {
  const gltf = await fresh();
  gltf.scene.updateMatrixWorld(true);
  const rest = ['LeftFoot', 'RightFoot'].map(n => gltf.scene.getObjectByName(n).getWorldPosition(new THREE.Vector3()));
  for (const clip of ['idle', 'roar']) {
    let worst = 0;
    for (const frame of feetOver(gltf, clip, 90)) frame.forEach((p, k) => { worst = Math.max(worst, p.distanceTo(rest[k])); });
    assert.ok(worst < 0.005, `${clip}: a foot moved ${worst.toFixed(4)} m`);
  }
});

test('the roar opens the mouth wide', async () => {
  const gltf = await fresh();
  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(gltf.animations.find(c => c.name === 'roar')).play();
  const jaw = gltf.scene.getObjectByName('Jaw');
  let widest = 0;
  for (let t = 0; t < 3.6; t += 0.05) {
    mixer.setTime(t);
    widest = Math.max(widest, THREE.MathUtils.radToDeg(jaw.quaternion.angleTo(new THREE.Quaternion())));
  }
  assert.ok(widest > 20 && widest < 35, `the jaw opens ${widest.toFixed(1)} degrees`);
});

// In a scene: the engine's actor, with footing planting her feet (jointed legs, as Egill's).
async function stage() {
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const world = { scene: new THREE.Scene(), camera, heightAt: () => 0, actors: new Map() };
  world.resolvePoint = createPointResolver(world);
  const rex = await createActor(world, { name: 'gramedla', gltf: await fresh() });
  world.actors.set('gramedla', rex);
  return rex;
}

// Follows the feet frame by frame, as Egill's and Mosi's tests do: the most a foot moved along the
// ground between two frames in which it was down (its heel within 1 mm of its bind-pose height), how
// often a foot lifted, and whether each knee stayed in front of the line from hip to heel (a
// digitigrade leg bends that way only). Make it while the legs are still in the bind pose.
function footWatch(actor) {
  const bones = side => ['Thigh', 'Shin', 'Foot'].map(n => actor.model.getObjectByName(`${side}${n}`));
  const legs = [bones('Left'), bones('Right')];
  const local = bone => actor.root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
  const read = () => { actor.root.updateMatrixWorld(true); return legs.map(([hip, knee, heel]) => ({ hip: local(hip), knee: local(knee), heel: local(heel), world: heel.getWorldPosition(new THREE.Vector3()) })); };
  const rest = read().map(leg => leg.heel.y);
  let last = null;
  const watch = {
    slide: 0, lifts: 0, kneeBack: false,
    start() { last = null; watch.slide = 0; watch.lifts = 0; watch.kneeBack = false; return watch.sample(); },
    sample() {
      const now = read().map((leg, k) => {
        const toHeel = leg.heel.clone().sub(leg.hip), toKnee = leg.knee.clone().sub(leg.hip);
        if (toHeel.x * toKnee.y - toHeel.y * toKnee.x <= 0) watch.kneeBack = true;
        return { p: leg.world, down: leg.heel.y - rest[k] < 0.001 };
      });
      now.forEach((foot, k) => {
        if (!last) return;
        if (foot.down && last[k].down) watch.slide = Math.max(watch.slide, Math.hypot(foot.p.x - last[k].p.x, foot.p.z - last[k].p.z));
        if (!foot.down && last[k].down) watch.lifts++;
      });
      last = now;
      return now;
    },
  };
  return watch;
}
const mm = metres => `${(metres * 1000).toFixed(1)} mm`;

test('the actor measures her calm walking speed from the walk clip', async () => {
  const rex = await stage();
  rex.walkTo([[30, 0]], { speed: 1 });
  assert.ok(rex.gait && Math.abs(rex.gait.naturalSpeed - 1.12) < 0.01, JSON.stringify(rex.gait && { speed: rex.gait.naturalSpeed, duty: rex.gait.duty }));
});

test('walking at a calm pace, a planted foot stays put and the knees bend forward', async () => {
  for (const speed of [0.7, 0.9, 1.12]) {
    const rex = await stage();
    const watch = footWatch(rex);
    const walk = rex.walkTo([[30, 0]], { speed });
    for (let i = 0; i < 900 && rex.root.position.x < 3; i++) rex.update(1 / 30);
    watch.start();
    for (let i = 0; i < 900 && rex.root.position.x < 20; i++) { rex.update(1 / 30); watch.sample(); }
    assert.equal(walk.done, false);
    assert.ok(watch.lifts >= 8, `${watch.lifts} steps at ${speed} m/s`);
    assert.ok(watch.slide < 1e-3, `at ${speed} m/s a planted foot moved ${mm(watch.slide)} in a frame`);
    assert.equal(watch.kneeBack, false, `at ${speed} m/s a knee bent backwards`);
  }
});

test('a walk starts and stops without dragging a foot', async () => {
  for (const goal of [9, 10]) { // two different points of the stride
    const rex = await stage();
    const watch = footWatch(rex);
    const walk = rex.walkTo([[goal, 0]], { speed: 1.12 });
    watch.start();
    for (let i = 0; i < 900 && !walk.done; i++) { rex.update(1 / 30); watch.sample(); }
    assert.equal(walk.done, true);
    for (let i = 0; i < 120; i++) { rex.update(1 / 30); watch.sample(); }
    assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
    assert.ok(watch.sample().every(foot => foot.down), 'both feet are down four seconds after the stop');
    assert.equal(rex.stepping, false);
    assert.equal(watch.kneeBack, false, 'a knee bent backwards');
  }
});

test('turning on the spot, a planted foot stays put and the feet step around', async () => {
  const rex = await stage();
  const watch = footWatch(rex);
  for (let i = 0; i < 10; i++) rex.update(1 / 30);
  watch.start();
  const turn = rex.turnTo(90);
  for (let i = 0; i < 900 && !turn.done; i++) { rex.update(1 / 30); watch.sample(); }
  assert.equal(turn.done, true);
  assert.ok(Math.abs(rex.heading - 90) < 1.5, `heading ${rex.heading}`);
  for (let i = 0; i < 180 && rex.stepping; i++) { rex.update(1 / 30); watch.sample(); }
  assert.equal(rex.stepping, false);
  assert.ok(watch.lifts >= 3, `${watch.lifts} steps`);
  assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
  assert.equal(watch.kneeBack, false, 'a knee bent backwards');
});
