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
  'LeftThigh', 'LeftShin', 'LeftMetatarsus', 'LeftFoot', 'RightThigh', 'RightShin', 'RightMetatarsus', 'RightFoot',
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

// The world position of each foot (the ball of the foot, which carries the toes) over a clip.
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

test('walking at its own pace, a foot that is down stays put in the world', async () => {
  const gltf = await fresh();
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const world = { scene: new THREE.Scene(), camera, heightAt: () => 0, actors: new Map() };
  world.resolvePoint = createPointResolver(world);
  const rex = await createActor(world, { name: 'gramedla', gltf });
  world.actors.set('gramedla', rex);
  const probe = rex.walkTo([[30, 0]], { speed: 1 });
  const gait = rex.gait;
  assert.ok(gait && Math.abs(gait.naturalSpeed - 1.12) < 0.01, JSON.stringify(gait && { speed: gait.naturalSpeed, duty: gait.duty }));
  // Walk again at exactly the measured pace; once the walk clip has faded in, follow the feet.
  rex.place(0, 0, 0);
  rex.stop();
  for (let i = 0; i < 60; i++) rex.update(1 / 30);
  const walk = rex.walkTo([[30, 0]], { speed: gait.naturalSpeed });
  const feet = ['LeftFoot', 'RightFoot'].map(n => rex.model.getObjectByName(n));
  const restY = feet.map(f => { rex.root.updateMatrixWorld(true); return rex.root.worldToLocal(f.getWorldPosition(new THREE.Vector3())).y; });
  let last = null;
  let slide = 0;
  let steps = 0;
  for (let i = 0; i < 900 && !walk.done; i++) {
    rex.update(1 / 30);
    rex.root.updateMatrixWorld(true);
    const now = feet.map((f, k) => {
      const p = f.getWorldPosition(new THREE.Vector3());
      return { p, down: rex.root.worldToLocal(p.clone()).y - restY[k] < 0.001 };
    });
    // Skip the first two seconds (the walk fades in from idle and eases up to speed) and the last
    // metre and a half (it settles into the stop).
    if (last && i > 60 && rex.root.position.x < 28.5) {
      now.forEach((foot, k) => {
        if (foot.down && last[k].down) slide = Math.max(slide, Math.hypot(foot.p.x - last[k].p.x, foot.p.z - last[k].p.z));
        if (!foot.down && last[k].down) steps++;
      });
    }
    last = now;
  }
  assert.equal(walk.done, true);
  assert.ok(steps >= 10, `${steps} steps`);
  assert.ok(slide < 0.002, `a planted foot slid ${(slide * 1000).toFixed(1)} mm in one frame`);
  assert.ok(probe.done);
});
