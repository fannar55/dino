import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { createActor, updateActors } from '../engine/actor.js';
import { createEffects } from '../engine/effects.js';
import { createPointResolver } from '../engine/points.js';
import { createSaddle, ride, floatTo } from '../engine/riding.js';

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

// A frame as main.js runs it: the actors (riders after their hosts), then the effects.
async function stage({ egillFirst = false } = {}) {
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const world = { scene: new THREE.Scene(), camera, heightAt: () => 0, actors: new Map(), effects: createEffects() };
  world.resolvePoint = createPointResolver(world);
  const make = {
    mosi: async () => createActor(world, { name: 'mosi', gltf: await mosiGltf, position: [0, 0, 0], heading: 0 }),
    egill: async () => createActor(world, { name: 'egill', gltf: await egillGltf, position: [1.2, 0, 3.2], heading: 250 }),
  };
  for (const name of egillFirst ? ['egill', 'mosi'] : ['mosi', 'egill']) world.actors.set(name, await make[name]());
  const frame = (dt = 1 / 30) => {
    updateActors(world.actors.values(), dt);
    world.effects.update(dt);
  };
  return { world, mosi: world.actors.get('mosi'), egill: world.actors.get('egill'), frame };
}

const mm = metres => `${(metres * 1000).toFixed(1)} mm`;
const unit = new THREE.Vector3(1, 1, 1);
const handsFrom = (egill, saddle) => ['Left', 'Right'].map(side => {
  const wrist = egill.model.getObjectByName(`${side}Hand`).getWorldPosition(new THREE.Vector3());
  return wrist.distanceTo(side === 'Left' ? saddle.grips.left : saddle.grips.right);
});

test('the saddle starts hidden and appears: it pops in with sparkles and ends visible at full size', async () => {
  const { world, mosi, frame } = await stage();
  const saddle = createSaddle(mosi);
  assert.equal(saddle.object.visible, false, 'hidden until it appears');
  const shown = saddle.appear();
  assert.equal(saddle.object.visible, true);
  assert.ok(saddle.object.getWorldScale(new THREE.Vector3()).x < 0.01, 'it starts from nothing');
  const sparkles = world.scene.children.filter(o => o.isPoints);
  assert.equal(sparkles.length, 1, 'one burst of sparkles, one draw call');
  let biggest = 0;
  let frames = 0;
  for (; frames < 60 && !shown.done; frames++) {
    frame();
    biggest = Math.max(biggest, saddle.object.getWorldScale(new THREE.Vector3()).x);
  }
  assert.equal(shown.done, true);
  assert.ok(Math.abs(frames / 30 - 0.8) < 0.05, `it took ${(frames / 30).toFixed(2)} s`);
  assert.ok(biggest > 1.04, `it overshoots a little before it settles (${biggest.toFixed(2)})`);
  assert.ok(saddle.object.getWorldScale(new THREE.Vector3()).distanceTo(unit) < 1e-6, 'it ends at its full size, in metres');
  assert.equal(saddle.object.visible, true);
  for (let i = 0; i < 10; i++) frame();
  assert.equal(world.scene.children.filter(o => o.isPoints).length, 0, 'the sparkles are gone');
});

test('floatTo lifts the rider onto the seat, and ride keeps him there while Mosi walks', async () => {
  const { world, mosi, egill, frame } = await stage();
  const saddle = createSaddle(mosi);
  const shown = saddle.appear();
  while (!shown.done) frame();
  const ground = egill.root.position.clone();
  const float = floatTo(egill, saddle);
  assert.equal(egill.controlled, true);
  assert.equal(world.scene.children.filter(o => o.isPoints).length, 1, 'one trail of sparkles');
  let highest = 0;
  let frames = 0;
  for (; frames < 120 && !float.done; frames++) {
    frame();
    highest = Math.max(highest, egill.root.position.y);
  }
  assert.equal(float.done, true);
  assert.ok(Math.abs(frames / 30 - 2.2) < 0.05, `the float took ${(frames / 30).toFixed(2)} s`);
  saddle.update();
  assert.ok(egill.root.position.distanceTo(saddle.seat) < 0.01, `he lands ${mm(egill.root.position.distanceTo(saddle.seat))} from the seat`);
  assert.ok(highest > saddle.seat.y + 0.2, 'he comes down into the seat from above it');
  assert.ok(ground.distanceTo(saddle.seat) > 2, 'from where he stood on the ground');
  assert.ok(Math.abs(egill.heading - mosi.heading) < 0.5, 'facing Mosi\'s way');
  assert.ok(egill.root.getWorldScale(new THREE.Vector3()).distanceTo(unit) < 1e-6, 'never taking Mosi\'s scale');
  // The ride takes over without a pop: he does not move further than the seat does, and his sit pose
  // carries on instead of starting again.
  const sit = egill.mixer.existingAction(egill.clips.get('sit'));
  const seatBefore = saddle.seat.clone();
  const before = egill.root.position.clone();
  const sitTime = sit.time;
  ride(egill, saddle);
  frame();
  saddle.update();
  assert.ok(egill.root.position.distanceTo(before) <= saddle.seat.distanceTo(seatBefore) + 1e-4, 'no pop when the ride takes over');
  assert.ok(sit.time > sitTime, 'the sit pose carries on');
  mosi.walkTo([[12, 2]], { speed: 0.95 });
  for (let i = 0; i < 60; i++) frame();
  saddle.update();
  assert.ok(saddle.seat.distanceTo(seatBefore) > 1, 'Mosi has walked on');
  assert.ok(egill.root.position.distanceTo(saddle.seat) < 1e-3, `Egill rides ${mm(egill.root.position.distanceTo(saddle.seat))} from the seat`);
  assert.ok(egill.root.getWorldScale(new THREE.Vector3()).distanceTo(unit) < 1e-6);
});

test('while riding, each hand holds its grip on the handle, also while Mosi walks', async () => {
  const { mosi, egill, frame } = await stage();
  const saddle = createSaddle(mosi);
  ride(egill, saddle);
  for (let i = 0; i < 45; i++) frame(); // settled in the seat, then the hands go to the handle
  saddle.update();
  for (const [k, gap] of handsFrom(egill, saddle).entries()) assert.ok(gap < 0.03, `${k ? 'right' : 'left'} hand ${mm(gap)} from its grip`);
  mosi.walkTo([[12, -3]], { speed: 0.95 });
  let worst = 0;
  for (let i = 0; i < 90; i++) {
    frame();
    saddle.update();
    worst = Math.max(worst, ...handsFrom(egill, saddle));
  }
  assert.ok(worst < 0.03, `while Mosi walks a hand was up to ${mm(worst)} from its grip`);
});

test('the rider stays on the seat while the host walks', async () => {
  const { mosi, egill, frame } = await stage();
  const saddle = createSaddle(mosi);
  ride(egill, saddle); // from the ground: he settles in over 0.8 s
  const start = saddle.seat.clone();
  mosi.walkTo([[14, 2]], { speed: 0.95 });
  for (let i = 0; i < 60; i++) frame();
  saddle.update();
  assert.ok(saddle.seat.distanceTo(start) > 1, `the saddle moved ${saddle.seat.distanceTo(start).toFixed(2)} m with Mosi`);
  assert.equal(egill.controlled, true);
  assert.ok(egill.root.position.distanceTo(saddle.seat) < 1e-3, `Egill is ${mm(egill.root.position.distanceTo(saddle.seat))} from the seat`);
  assert.ok(Math.abs(egill.heading - mosi.heading) < 0.1, `Egill faces ${egill.heading.toFixed(1)}, Mosi ${mosi.heading.toFixed(1)} degrees`);
  // The seat is on Mosi's shoulders, where it was: the saddle follows the bone it sits on.
  const shoulders = mosi.model.getObjectByName('Shoulders');
  const onShoulders = p => shoulders.worldToLocal(p.clone());
  const before = onShoulders(saddle.seat);
  for (let i = 0; i < 30; i++) frame();
  saddle.update();
  assert.ok(onShoulders(saddle.seat).distanceTo(before) < 1e-4, 'the seat keeps its place on the Shoulders bone');
  assert.ok(egill.root.position.distanceTo(saddle.seat) < 1e-3, `Egill is ${mm(egill.root.position.distanceTo(saddle.seat))} from the seat`);
});

test('the rider never inherits the host\'s scale', async () => {
  const { world, mosi, egill, frame } = await stage();
  assert.ok(mosi.model.getObjectByName('Shoulders').getWorldScale(new THREE.Vector3()).x > 2, 'Mosi\'s bones carry the GLB\'s scale');
  const saddle = createSaddle(mosi);
  ride(egill, saddle);
  mosi.walkTo([[10, 0]], { speed: 0.95 });
  for (let i = 0; i < 45; i++) frame();
  assert.ok(egill.root.getWorldScale(new THREE.Vector3()).distanceTo(unit) < 1e-6, 'Egill keeps his own size');
  assert.ok(egill.model.getWorldScale(new THREE.Vector3()).distanceTo(unit) < 1e-6, 'and so does his model');
  assert.ok(saddle.object.getWorldScale(new THREE.Vector3()).distanceTo(unit) < 1e-6, 'the saddle is in metres, not in Mosi\'s units');
  assert.equal(egill.root.parent, world.scene, 'Egill is not hung on Mosi\'s skeleton');
  // Big and generous for a 1.1 m rider, on an 8.5 m Triceratops.
  const size = new THREE.Box3().setFromObject(saddle.object).getSize(new THREE.Vector3());
  assert.ok(size.x > 0.6 && size.x < 1.2 && size.z > 0.6 && size.z < 1.2, `the saddle is ${size.x.toFixed(2)} by ${size.z.toFixed(2)} m`);
});

test('a rider listed before his host still follows the seat in the same frame', async () => {
  const { world, mosi, egill, frame } = await stage({ egillFirst: true });
  assert.deepEqual([...world.actors.keys()], ['egill', 'mosi'], 'Egill comes first in the chapter');
  const saddle = createSaddle(mosi);
  ride(egill, saddle);
  for (let i = 0; i < 30; i++) frame();
  mosi.walkTo([[12, 0]], { speed: 0.95 });
  let worst = 0;
  for (let i = 0; i < 60; i++) {
    frame();
    saddle.update(); // where the saddle is after this frame
    worst = Math.max(worst, egill.root.position.distanceTo(saddle.seat));
  }
  assert.ok(worst < 1e-3, `Egill trailed the seat by up to ${mm(worst)}`);
});
