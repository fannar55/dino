import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { createActor } from '../engine/actor.js';
import { createPointResolver } from '../engine/points.js';

// Egill as baked by remake/tools/bake/bake-biped.js, read without textures (no DOM in Node).
function loadGlb(url) {
  const glb = fs.readFileSync(url);
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
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

const gltfPromise = loadGlb(new URL('../assets/characters/egill.glb', import.meta.url));
const BONES = ['root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head',
  'LeftShoulder', 'LeftUpperArm', 'LeftLowerArm', 'LeftHand', 'RightShoulder', 'RightUpperArm', 'RightLowerArm', 'RightHand',
  'LeftUpperLeg', 'LeftLowerLeg', 'LeftFoot', 'RightUpperLeg', 'RightLowerLeg', 'RightFoot'];

async function skinnedMesh() {
  const gltf = await gltfPromise;
  let mesh = null;
  gltf.scene.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  return { gltf, mesh };
}

test('Egill has the humanoid skeleton, his clips and fits his budget', async () => {
  const { gltf, mesh } = await skinnedMesh();
  assert.deepEqual(mesh.skeleton.bones.map(b => b.name), BONES);
  const clips = Object.fromEntries(gltf.animations.map(c => [c.name, c.duration]));
  for (const name of ['idle', 'walk', 'wave', 'waveLeft', 'point', 'sit', 'lifted']) assert.ok(clips[name] > 0.5, `${name} missing`);
  assert.ok(mesh.geometry.index.count / 3 <= 20000, 'at most 20k triangles');
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  assert.ok(Math.abs(box.max.y - box.min.y - 1.1) < 0.01, `height ${box.max.y - box.min.y}`);
  assert.ok(Math.abs(box.min.y) < 0.005, 'stands on the ground');
  // Every clip animates every bone, so no turn is left behind when clips cross-fade.
  for (const clip of gltf.animations) {
    const animated = new Set(clip.tracks.map(t => t.name.split('.')[0]));
    for (const bone of BONES.slice(1)) assert.ok(animated.has(bone), `${clip.name} leaves ${bone} alone`);
  }
});

test('every vertex weight sums to one', async () => {
  const { mesh } = await skinnedMesh();
  const w = mesh.geometry.attributes.skinWeight;
  for (let i = 0; i < w.count; i++) {
    const sum = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i);
    assert.ok(Math.abs(sum - 1) < 1e-3, `vertex ${i} sums to ${sum}`);
  }
});

test('in the idle pose the shirt and waist stay where they are (arms move alone)', async () => {
  const { gltf, mesh } = await skinnedMesh();
  const scene = gltf.scene;
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(gltf.animations.find(c => c.name === 'idle')).play();
  mixer.setTime(0.8);
  scene.updateMatrixWorld(true);
  const pos = mesh.geometry.attributes.position;
  const before = new THREE.Vector3();
  const after = new THREE.Vector3();
  let worst = 0;
  for (let i = 0; i < pos.count; i++) {
    before.fromBufferAttribute(pos, i);
    if (before.y < 0.45 || before.y > 0.6 || Math.abs(before.z) > 0.1) continue; // the waist, away from the arms
    mesh.getVertexPosition(i, after);
    worst = Math.max(worst, before.distanceTo(after));
  }
  assert.ok(worst < 0.02, `the waist moved ${worst.toFixed(3)} m`);
});

test('the actor measures a calm walking speed from the walk clip', async () => {
  const gltf = await gltfPromise;
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const world = { scene: new THREE.Scene(), camera, heightAt: () => 0, actors: new Map() };
  world.resolvePoint = createPointResolver(world);
  const egill = await createActor(world, { name: 'egill', gltf });
  world.actors.set('egill', egill);
  const walk = egill.walkTo([[3, 0]], { speed: 0.6 });
  assert.ok(egill.gait && egill.gait.naturalSpeed > 0.4 && egill.gait.naturalSpeed < 0.9, JSON.stringify(egill.gait && { speed: egill.gait.naturalSpeed }));
  for (let i = 0; i < 300 && !walk.done; i++) egill.update(1 / 30);
  assert.equal(walk.done, true);
  assert.ok(egill.root.position.distanceTo(new THREE.Vector3(3, 0, 0)) < 1e-3);
});
