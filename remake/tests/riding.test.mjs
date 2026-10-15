import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { createActor } from '../engine/actor.js';
import { createPointResolver } from '../engine/points.js';
import { createSaddle, ride } from '../engine/riding.js';

// Mosi (8.5 m) and Egill (1.1 m) as the remake bakes them, read without textures (no DOM in Node).
function loadGlb(url) {
  const glb = fs.readFileSync(url);
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const material of json.materials ?? []) {
    delete material.normalTexture;
    delete material.occlusionTexture;
    delete material.emissiveTexture;
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

const mosiGltf = loadGlb(new URL('../assets/characters/mosi.glb', import.meta.url));
const egillGltf = loadGlb(new URL('../assets/characters/egill.glb', import.meta.url));

async function stage({ mosi: withMosi = true } = {}) {
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const world = { scene: new THREE.Scene(), camera, heightAt: () => 0, actors: new Map() };
  world.resolvePoint = createPointResolver(world);
  // Mosi first: the game updates the actors in the chapter's order, the host before its rider.
  if (withMosi) world.actors.set('mosi', await createActor(world, { name: 'mosi', gltf: await mosiGltf, position: [0, 0, 0], heading: 0 }));
  world.actors.set('egill', await createActor(world, { name: 'egill', gltf: await egillGltf, position: [-6, 0, 2], heading: 0 }));
  const frame = (dt = 1 / 30) => { for (const actor of world.actors.values()) actor.update(dt); };
  return { world, mosi: world.actors.get('mosi'), egill: world.actors.get('egill'), frame };
}

const mm = metres => `${(metres * 1000).toFixed(1)} mm`;
test('the rider stays on the seat while the host walks', async () => {
  const { mosi, egill, frame } = await stage();
  const saddle = createSaddle(mosi);
  ride(egill, saddle);
  const start = saddle.seat.clone();
  mosi.walkTo([[14, 2]], { speed: 0.95 });
  for (let i = 0; i < 60; i++) frame();
  saddle.update();
  assert.ok(saddle.seat.distanceTo(start) > 1, `the saddle moved ${saddle.seat.distanceTo(start).toFixed(2)} m with Mosi`);
  assert.equal(egill.controlled, true);
  assert.ok(egill.root.position.distanceTo(saddle.seat) < 1e-3, `Egill is ${mm(egill.root.position.distanceTo(saddle.seat))} from the seat`);
  assert.ok(Math.abs(egill.heading - mosi.heading) < 0.1, `Egill faces ${egill.heading.toFixed(1)}, Mosi ${mosi.heading.toFixed(1)} degrees`);
  // The seat is on Mosi's back, where it was: the saddle follows the bone it sits on.
  const body = mosi.model.getObjectByName('Body');
  const onBack = p => body.worldToLocal(p.clone());
  const before = onBack(saddle.seat);
  for (let i = 0; i < 30; i++) frame();
  saddle.update();
  assert.ok(onBack(saddle.seat).distanceTo(before) < 1e-4, 'the seat keeps its place on the Body bone');
  assert.ok(egill.root.position.distanceTo(saddle.seat) < 1e-3, `Egill is ${mm(egill.root.position.distanceTo(saddle.seat))} from the seat`);
});

test('the rider never inherits the host\'s scale', async () => {
  const { world, mosi, egill, frame } = await stage();
  const unit = new THREE.Vector3(1, 1, 1);
  assert.ok(mosi.model.getObjectByName('Body').getWorldScale(new THREE.Vector3()).x > 2, 'Mosi\'s bones carry the GLB\'s scale');
  const saddle = createSaddle(mosi);
  ride(egill, saddle);
  mosi.walkTo([[10, 0]], { speed: 0.95 });
  for (let i = 0; i < 45; i++) frame();
  assert.ok(egill.root.getWorldScale(new THREE.Vector3()).distanceTo(unit) < 1e-6, 'Egill keeps his own size');
  assert.ok(egill.model.getWorldScale(new THREE.Vector3()).distanceTo(unit) < 1e-6, 'and so does his model');
  assert.ok(saddle.object.getWorldScale(new THREE.Vector3()).distanceTo(unit) < 1e-6, 'the saddle is in metres, not in Mosi\'s units');
  assert.equal(egill.root.parent, world.scene, 'Egill is not hung on Mosi\'s skeleton');
  // Sized for a 1.1 m rider: a pad about as long as his seat and thighs, on an 8.5 m Triceratops.
  const size = new THREE.Box3().setFromObject(saddle.object).getSize(new THREE.Vector3());
  assert.ok(size.x > 0.4 && size.x < 1.2 && size.z > 0.3 && size.z < 1.2, `the saddle is ${size.x.toFixed(2)} by ${size.z.toFixed(2)} m`);
});
