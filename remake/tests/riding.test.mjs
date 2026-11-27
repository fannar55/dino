import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { createActor, updateActors } from '../engine/actor.js';
import { createEffects } from '../engine/effects.js';
import { createPointResolver } from '../engine/points.js';
import { createSaddle, createSeat, ride, floatTo, floatDown, headingOf } from '../engine/riding.js';

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
const thorsedlaGltf = loadGlb(new URL('../assets/characters/brontosaurus.glb', import.meta.url));

// A frame as main.js runs it: the actors (riders after their hosts), then the effects.
async function stage({ egillFirst = false } = {}) {
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const world = { scene: new THREE.Scene(), camera, heightAt: () => 0, actors: new Map(), effects: createEffects() };
  world.resolvePoint = createPointResolver(world);
  world.loadModel = url => loadGlb(new URL(url)); // Mosi's saddle's file, as the chapters' worlds load it
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
  assert.equal(await saddle.loaded, true, 'its file loads onto him');
  assert.equal(saddle.object.visible, false, 'hidden until it appears');
  const shown = saddle.appear();
  assert.equal(saddle.object.visible, true);
  assert.ok(saddle.size < 0.01, 'it starts from nothing');
  const sparkles = world.scene.children.filter(o => o.isPoints);
  assert.equal(sparkles.length, 1, 'one burst of sparkles, one draw call');
  let biggest = 0;
  let frames = 0;
  for (; frames < 60 && !shown.done; frames++) {
    frame();
    biggest = Math.max(biggest, saddle.size);
  }
  assert.equal(shown.done, true);
  assert.ok(Math.abs(frames / 30 - 0.8) < 0.05, `it took ${(frames / 30).toFixed(2)} s`);
  assert.ok(biggest > 1.04, `it overshoots a little before it settles (${biggest.toFixed(2)})`);
  assert.equal(saddle.size, 1, 'it ends at its full size');
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
  assert.ok(mosi.lookYawLimit < 55 && mosi.lookUpLimit <= 30, 'Mosi\'s looks are capped while Egill floats up');
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

test('floatTo with sit false ends with him held at the point in his lifted pose', async () => {
  const { egill, frame } = await stage();
  const high = egill.root.position.clone().add(new THREE.Vector3(0, 14, 0)); // the festival's seventh star: 14 m over him in 9 s
  const light = { seat: high, update: () => high, host: { heading: egill.heading, lookYawLimit: Infinity, lookUpLimit: Infinity } };
  const up = floatTo(egill, light, { duration: 9, sit: false });
  let fastest = 0;
  let last = egill.root.position.clone();
  let frames = 0;
  for (; frames < 400 && !up.done; frames++) {
    frame();
    fastest = Math.max(fastest, egill.root.position.distanceTo(last) * 30);
    last = egill.root.position.clone();
  }
  assert.equal(up.done, true);
  assert.ok(Math.abs(frames / 30 - 9) < 0.05, `the float took ${(frames / 30).toFixed(2)} s`);
  assert.ok(fastest <= 2, `slowly: never over 2 m/s (${fastest.toFixed(2)})`);
  for (let i = 0; i < 60; i++) frame();
  assert.ok(egill.root.position.distanceTo(high) < 0.01, `held ${mm(egill.root.position.distanceTo(high))} from the point`);
  const weight = clip => egill.mixer.existingAction(egill.clips.get(clip))?.getEffectiveWeight() ?? 0;
  assert.ok(weight('lifted') > 0.99, `in his lifted pose (${weight('lifted').toFixed(2)})`);
  assert.equal(weight('sit'), 0, 'never sat');
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

// The smallest distance between Egill's skin and the skin Mosi's head, jaw and neck carry (the frill
// with them), as the clips pose both now; anything over 10 cm reads as Infinity, which is all clear.
function frillGap(mosi, egill) {
  const skinOf = actor => {
    let mesh = null;
    actor.model.traverse(o => { if (o.isSkinnedMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o; });
    return mesh;
  };
  const mosiSkin = skinOf(mosi);
  const egillSkin = skinOf(egill);
  const front = new Set(['Neck', 'Head', 'Jaw'].map(n => mosiSkin.skeleton.bones.findIndex(b => b.name === n)).filter(i => i >= 0));
  const { skinIndex, skinWeight } = mosiSkin.geometry.attributes;
  const frontVertices = [];
  for (let i = 0; i < skinIndex.count; i++) {
    let share = 0;
    for (let k = 0; k < 4; k++) if (front.has(skinIndex.getComponent(i, k))) share += skinWeight.getComponent(i, k);
    if (share >= 0.25) frontVertices.push(i);
  }
  const cell = 0.1;
  const v = new THREE.Vector3();
  return () => {
    mosi.root.updateMatrixWorld(true);
    egill.root.updateMatrixWorld(true);
    const grid = new Map();
    for (const i of frontVertices) {
      mosiSkin.getVertexPosition(i, v).applyMatrix4(mosiSkin.matrixWorld);
      const key = `${Math.floor(v.x / cell)},${Math.floor(v.y / cell)},${Math.floor(v.z / cell)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(v.clone());
    }
    let gap = Infinity;
    for (let i = 0; i < egillSkin.geometry.attributes.position.count; i += 2) {
      egillSkin.getVertexPosition(i, v).applyMatrix4(egillSkin.matrixWorld);
      const cx = Math.floor(v.x / cell), cy = Math.floor(v.y / cell), cz = Math.floor(v.z / cell);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const p of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) gap = Math.min(gap, p.distanceTo(v));
      }
    }
    return gap > cell ? Infinity : gap;
  };
}

test('while Mosi carries Egill his looks are capped, so his frill stays clear of Egill looking up and round, standing and walking', async () => {
  const { mosi, egill, frame } = await stage();
  const saddle = createSaddle(mosi);
  const riding = ride(egill, saddle);
  const gap = frillGap(mosi, egill);
  assert.ok(mosi.lookYawLimit < 55 && mosi.lookUpLimit <= 30, `looks capped at ${mosi.lookYawLimit} degrees aside and ${mosi.lookUpLimit} up`);
  for (let i = 0; i < 30; i++) frame();
  // Up and round to his left, asking for 50 degrees up (more than lookAt's own 30), and at Egill on his
  // back with lookAt's defaults: uncapped, each brings the frill's edge within a few millimetres of him.
  // The walk bobs and turns his head on top of the look, so the gap is smaller then.
  const lookAbout = (frames, every) => {
    let worst = Infinity;
    for (const [target, maxPitch] of [[{ actor: 'mosi', offset: [2, 6, -4], local: true }, 50], ['egill.head', 30]]) {
      mosi.lookAt(target, { weight: 1, maxPitch });
      for (let i = 0; i < frames; i++) {
        frame();
        if (i % every === every - 1) worst = Math.min(worst, gap());
      }
      mosi.lookAt(null);
      for (let i = 0; i < 30; i++) frame();
    }
    return worst;
  };
  const standing = lookAbout(60, 5);
  mosi.walkTo([[60, 0]], { speed: 0.95 });
  const walking = lookAbout(150, 3);
  assert.equal(mosi.walking, true, 'he walked all through the looks');
  assert.ok(standing > 0.04, `standing, the frill came within ${mm(standing)} of Egill`);
  assert.ok(walking > 0.04, `walking, the frill came within ${mm(walking)} of Egill`);
  riding.stop();
  assert.equal(mosi.lookYawLimit, Infinity, 'the caps go when the ride stops');
  assert.equal(mosi.lookUpLimit, Infinity);
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
  // The seat is on Mosi's back, where it was: the saddle follows the bone it sits on.
  const body = mosi.model.getObjectByName('Body');
  const onBody = p => body.worldToLocal(p.clone());
  const before = onBody(saddle.seat);
  for (let i = 0; i < 30; i++) frame();
  saddle.update();
  assert.ok(onBody(saddle.seat).distanceTo(before) < 1e-4, 'the seat keeps its place on the Body bone');
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
  assert.equal(egill.root.parent, world.scene, 'Egill is not hung on Mosi\'s skeleton');
  // the saddle is skinned on Mosi's own bones: it moves with his back, its places in metres in the world (tests/mosi-saddle.test.mjs)
  assert.equal(await saddle.loaded, true);
  assert.ok(saddle.object.isSkinnedMesh);
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

// Off again (chapter 1, scene 7): Egill floats down from the saddle onto the ground beside Mosi, the way he came up.
const playing = (actor, clip) => actor.mixer.existingAction(actor.clips.get(clip))?.getEffectiveWeight() ?? 0;

test('floatDown lifts the rider off the seat and sets him down on the ground, standing, given back', async () => {
  const { world, mosi, egill, frame } = await stage();
  const saddle = createSaddle(mosi);
  const riding = ride(egill, saddle);
  for (let i = 0; i < 45; i++) frame();
  saddle.update();
  const seat = saddle.seat.clone();
  const spot = new THREE.Vector3(1.2, 0, 3.4); // beside his right shoulder, where a float up may start
  const down = floatDown(egill, saddle, [spot.x, spot.z], { heading: 120 });
  assert.equal(egill.controlled, true);
  assert.ok(mosi.lookYawLimit <= 40 && mosi.lookUpLimit <= 30, 'Mosi\'s looks stay capped while Egill floats down');
  assert.equal(world.scene.children.filter(o => o.isPoints).length, 1, 'one trail of sparkles');
  let highest = 0;
  let frames = 0;
  for (; frames < 120 && !down.done; frames++) {
    frame();
    highest = Math.max(highest, egill.root.position.y);
  }
  assert.equal(down.done, true);
  assert.ok(Math.abs(frames / 30 - 2.2) < 0.05, `the float took ${(frames / 30).toFixed(2)} s`);
  assert.ok(highest > seat.y + 0.2, 'he rises off the seat before he comes down');
  assert.ok(egill.root.position.distanceTo(spot) < 0.01, `he lands ${mm(egill.root.position.distanceTo(spot))} from the spot`);
  assert.equal(egill.controlled, false, 'on the ground he is his own again');
  assert.ok(Math.abs(egill.heading - 120) < 0.5, `facing ${egill.heading.toFixed(1)} degrees, as asked`);
  assert.equal(mosi.lookYawLimit, Infinity, 'the caps go when he is down');
  assert.equal(mosi.lookUpLimit, Infinity);
  for (let i = 0; i < 6; i++) frame();
  assert.ok(playing(egill, 'idle') > 0.99 && playing(egill, 'sit') < 0.01 && playing(egill, 'lifted') < 0.01, 'he stands');
  assert.ok(egill.root.getWorldScale(new THREE.Vector3()).distanceTo(unit) < 1e-6, 'never taking Mosi\'s scale');
  // The ride is over: Mosi walks on without him, and stopping the old ride changes nothing.
  riding.stop();
  mosi.walkTo([[12, -2]], { speed: 0.95 });
  for (let i = 0; i < 60; i++) frame();
  assert.ok(egill.root.position.distanceTo(spot) < 0.01, 'Egill stays where he landed');
  assert.equal(egill.controlled, false);
});

test('a rider given back faces where he faced: turned about the vertical alone, whatever the heading', async () => {
  const { mosi, egill, frame } = await stage();
  mosi.place(0, 0, 150);
  const saddle = createSaddle(mosi);
  const riding = ride(egill, saddle);
  for (let i = 0; i < 30; i++) frame();
  riding.stop();
  assert.ok(Math.abs(egill.heading - 150) < 0.5, `he faces ${egill.heading.toFixed(1)} degrees, Mosi 150`);
  assert.ok(Math.abs(egill.root.rotation.x) < 1e-9 && Math.abs(egill.root.rotation.z) < 1e-9, 'upright');
  egill.turnTo(200);
  for (let i = 0; i < 90; i++) frame();
  assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(egill.root.quaternion).y > 0.999, 'and still upright after he turns by himself');
});

test('headingOf reads the way a turned root faces from its quaternion, past 90 degrees too', () => {
  const root = new THREE.Object3D();
  for (const heading of [0, 45, 120, 136.4, 150, 179, -30, -120]) {
    root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -THREE.MathUtils.degToRad(heading));
    const read = headingOf(root.quaternion);
    const off = ((read - heading + 540) % 360) - 180;
    assert.ok(Math.abs(off) < 1e-6, `${heading} degrees reads as ${read.toFixed(3)}`);
  }
});

test('floatDown with no heading sets him down facing the way he faced in the saddle, past 90 degrees too', async () => {
  const { mosi, egill, frame } = await stage();
  mosi.place(0, 0, 150);
  const saddle = createSaddle(mosi);
  ride(egill, saddle);
  for (let i = 0; i < 30; i++) frame();
  // beside his left shoulder, where a float up may start: 1.2 m along him and 3.4 m out, in his own frame
  const spot = new THREE.Vector3(1.2, 0, -3.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), -THREE.MathUtils.degToRad(150));
  const down = floatDown(egill, saddle, [spot.x, spot.z]);
  while (!down.done) frame();
  assert.ok(Math.abs(egill.heading - 150) < 0.5, `he faces ${egill.heading.toFixed(1)} degrees, as he did on Mosi at 150`);
});

test('the float down is the float up backwards, so a spot a float may start from is one he may land on', async () => {
  const { mosi, egill, frame } = await stage();
  const saddle = createSaddle(mosi);
  mosi.mixer.timeScale = 0; // he holds his breath, so the seat stays put between the two floats
  const spot = [1.2, 3.4];
  egill.place(spot[0], spot[1], 250);
  const up = floatTo(egill, saddle);
  const upPath = [egill.root.position.clone()];
  while (!up.done) {
    frame();
    upPath.push(egill.root.position.clone());
  }
  ride(egill, saddle);
  for (let i = 0; i < 30; i++) frame();
  const down = floatDown(egill, saddle, spot);
  const downPath = [egill.root.position.clone()];
  while (!down.done) {
    frame();
    downPath.push(egill.root.position.clone());
  }
  assert.equal(downPath.length, upPath.length, 'it takes as long');
  let worst = 0;
  for (let i = 0; i < downPath.length; i++) worst = Math.max(worst, downPath[i].distanceTo(upPath[upPath.length - 1 - i]));
  assert.ok(worst < 0.002, `the way down strays ${mm(worst)} from the way up`);
});

// A seat with no saddle (chapter 2, scene 6): on one of a host's bones, kept level however the bone turns, so a rider sits
// upright on Þórseðla's neck while she lifts it from the bank to nine metres.
test('a seat on a neck bone rides and floats', async () => {
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const world = { scene: new THREE.Scene(), camera, heightAt: () => 0, actors: new Map(), effects: createEffects() };
  world.resolvePoint = createPointResolver(world);
  const thorsedla = await createActor(world, { name: 'thorsedla', gltf: await thorsedlaGltf, position: [0, 0, 0], heading: 0 });
  const egill = await createActor(world, { name: 'egill', gltf: await egillGltf, position: [10.4, 0, 1.2], heading: 180 });
  world.actors.set('thorsedla', thorsedla);
  world.actors.set('egill', egill);
  const frame = (dt = 1 / 30) => {
    updateActors(world.actors.values(), dt);
    world.effects.update(dt);
  };
  const seat = createSeat(thorsedla, { bone: 'Neck5', offset: [0, 0.55, 0], grips: { left: [-0.35, 0.3, 0.45], right: [0.35, 0.3, 0.45] } });
  assert.equal(seat.object, null, 'no saddle to see');
  assert.equal(seat.host, thorsedla);
  const neck5 = thorsedla.model.getObjectByName('Neck5');
  const UP = new THREE.Vector3(0, 1, 0);
  // Level: its up is the world's, its forward the bone's own turned flat, and the seat is 0.55 m straight above the bone.
  const level = (when) => {
    seat.update();
    const up = UP.clone().applyQuaternion(seat.quaternion);
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(seat.quaternion);
    const along = new THREE.Vector3(1, 0, 0).applyQuaternion(neck5.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
    assert.ok(up.angleTo(UP) < 1e-6, `${when}: the seat is level`);
    assert.ok(forward.angleTo(along) < 1e-6, `${when}: facing the way the bone does, seen from above`);
    const above = seat.seat.clone().sub(neck5.getWorldPosition(new THREE.Vector3()));
    assert.ok(above.distanceTo(new THREE.Vector3(0, 0.55, 0)) < 1e-6, `${when}: the seat is ${above.toArray().map(v => v.toFixed(3))} from the bone`);
    // The grips: ahead of the seat, one to each side of it, at the same height.
    const left = seat.grips.left.clone().sub(seat.seat), right = seat.grips.right.clone().sub(seat.seat);
    const side = new THREE.Vector3(0, 0, 1).applyQuaternion(seat.quaternion);
    assert.ok(Math.abs(left.dot(side) + 0.35) < 1e-6 && Math.abs(right.dot(side) - 0.35) < 1e-6, `${when}: a grip on each side`);
    assert.ok(Math.abs(left.dot(forward) - 0.45) < 1e-6 && Math.abs(left.y - 0.3) < 1e-6 && Math.abs(right.y - 0.3) < 1e-6, `${when}: ahead of the seat, up`);
  };
  level('standing');
  // Her head comes down to the bank, and he floats up onto the seat behind it, as onto a saddle.
  thorsedla.play('lowerHead');
  for (let i = 0; i < 30 * 5; i++) frame();
  level('head down');
  const float = floatTo(egill, seat);
  let frames = 0;
  for (; frames < 120 && !float.done; frames++) frame();
  assert.equal(float.done, true);
  assert.ok(Math.abs(frames / 30 - 2.2) < 0.05, `the float took ${(frames / 30).toFixed(2)} s`);
  seat.update();
  assert.ok(egill.root.position.distanceTo(seat.seat) < 0.01, `he lands ${mm(egill.root.position.distanceTo(seat.seat))} from the seat`);
  assert.ok(Math.abs(egill.heading - thorsedla.heading) < 0.5, 'facing her way');
  // She lifts him to her full height: the ride keeps him on the seat all the way, upright.
  ride(egill, seat);
  thorsedla.play('liftUp', { fade: 0.3 });
  let worst = 0, tipped = 0;
  for (let i = 0; i < 30 * 8.5; i++) {
    frame();
    seat.update();
    worst = Math.max(worst, egill.root.position.distanceTo(seat.seat));
    tipped = Math.max(tipped, UP.clone().applyQuaternion(egill.root.quaternion).angleTo(UP));
  }
  assert.ok(worst < 0.05, `through the lift he was up to ${mm(worst)} from the seat`);
  assert.ok(THREE.MathUtils.radToDeg(tipped) < 1e-3, `he leaned ${THREE.MathUtils.radToDeg(tipped).toFixed(2)} degrees`);
  level('at the top');
  assert.ok(seat.seat.y > 8 && seat.seat.y < 9.5, `the seat ends ${seat.seat.y.toFixed(2)} m up`);
  assert.equal(egill.controlled, true);
  assert.ok(thorsedla.lookYawLimit <= 40 && thorsedla.lookUpLimit <= 30, 'her looks are capped while he rides her neck');
  // And down again, the float up backwards, onto his feet on the ground, given back.
  const down = floatDown(egill, seat, [10.4, 1.2], { heading: 180 });
  for (let i = 0; i < 120 && !down.done; i++) frame();
  assert.equal(down.done, true);
  assert.equal(egill.controlled, false);
  assert.ok(egill.root.position.distanceTo(new THREE.Vector3(10.4, 0, 1.2)) < 0.01, 'he lands where he was told');
  assert.equal(thorsedla.lookYawLimit, Infinity, 'her caps go when he is down');
});

test('a seat needs its bone, and faces the host\'s way when its bone points straight up', async () => {
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const world = { scene: new THREE.Scene(), camera, heightAt: () => 0, actors: new Map(), effects: createEffects() };
  world.resolvePoint = createPointResolver(world);
  const thorsedla = await createActor(world, { name: 'thorsedla', gltf: await thorsedlaGltf, position: [0, 0, 0], heading: 30 });
  assert.throws(() => createSeat(thorsedla, { offset: [0, 0.5, 0] }), /needs the bone/);
  const seat = createSeat(thorsedla, { bone: 'Head' });
  const head = thorsedla.model.getObjectByName('Head');
  const faces = () => {
    seat.update();
    const f = new THREE.Vector3(1, 0, 0).applyQuaternion(seat.quaternion);
    return THREE.MathUtils.radToDeg(Math.atan2(f.z, f.x));
  };
  // The head turned nearly straight up, straight up and a little past: the seat keeps the host's way, no flip.
  for (const pitch of [85, 90, 95]) {
    head.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(pitch));
    thorsedla.root.updateMatrixWorld(true);
    assert.ok(Math.abs(((faces() - 30 + 540) % 360) - 180) < 1e-3, `at ${pitch} degrees up the seat faces ${faces().toFixed(2)}, she 30`);
  }
  // Turned a little aside and nearly level, it faces the head's own way.
  head.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(-20));
  thorsedla.root.updateMatrixWorld(true);
  assert.ok(Math.abs(faces() - 50) < 0.5, `turned 20 degrees aside the seat faces ${faces().toFixed(2)}`);
});

// Grameðla's head (chapter 6, kafli6-seat.js): Egill astride behind her brow, his seat and soles on her skin with her head down on the
// ground, standing, and through her stride.
const trexGltf = loadGlb(new URL('../assets/characters/trex.glb', import.meta.url));
async function onGrameðla() {
  const { HEAD_SEAT, createHips, headDownPose } = await import('../chapters/kafli6-seat.js');
  const { createLean } = await import('../engine/pose/lean.js');
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const world = { scene: new THREE.Scene(), camera, heightAt: () => 0, actors: new Map(), effects: createEffects() };
  world.resolvePoint = createPointResolver(world);
  const her = await createActor(world, { name: 'gramedla', gltf: await trexGltf, position: [0, 0, 0], heading: 30 });
  const egill = await createActor(world, { name: 'egill', gltf: await egillGltf, position: [6, 0, 3], heading: 0 });
  world.actors.set('gramedla', her);
  world.actors.set('egill', egill);
  const lean = createLean(her);
  const hips = createHips(her);
  let laid = null;
  her.setOverlay(() => { hips.set(laid?.hips ?? 0); lean.set({ theta: laid?.theta ?? 0, pitch: laid?.pitch ?? 0 }); });
  const frame = (dt = 1 / 30) => { updateActors(world.actors.values(), dt); world.effects.update(dt); };
  /** Hold her in `pose` (down, up, or stride at a share of its clip) and let him settle there. */
  const hold = (pose, at = 0) => {
    laid = null;
    const action = her.play(pose === 'stride' ? 'stride' : 'idle', { fade: 0, timeScale: 0 });
    action.time = pose === 'stride' ? at * action.getClip().duration : 0;
    her.mixer.update(0);
    if (pose === 'down') laid = headDownPose(her, lean, hips);
    for (let k = 0; k < 4; k++) frame();
    her.root.updateMatrixWorld(true);
    return laid;
  };
  hold.lay = pose => { laid = pose; };
  let body = null;
  her.model.traverse(o => { if (o.isSkinnedMesh && (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count)) body = o; });
  const head = her.model.getObjectByName('Head');
  const ray = new THREE.Raycaster();
  /** How far `local` (a point in her Head bone's frame) stands straight over her skin now. */
  const over = local => {
    const p = new THREE.Vector3(...local).applyMatrix4(head.matrixWorld);
    ray.set(p.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(body, false)[0];
    return hit ? p.y - hit.point.y : Infinity;
  };
  const refresh = () => { body.skeleton.update(); body.computeBoundingSphere(); };
  return { world, her, egill, frame, hold, over, refresh, HEAD_SEAT, body, head, lean, hips, headDownPose };
}

test('the seat is on her skin: his seat 0.01 m over it, his soles 0.125 m, with her head down, standing and at four moments of the stride', async () => {
  const { her, egill, hold, over, refresh, HEAD_SEAT, body, head } = await onGrameðla();
  const { skinSurface } = await import('../engine/skin-surface.js');
  her.root.updateMatrixWorld(true);
  const skin = skinSurface(body, { around: body.worldToLocal(head.getWorldPosition(new THREE.Vector3())), near: 2.5 });
  let his = null;
  egill.model.traverse(o => { if (o.isSkinnedMesh && (!his || o.geometry.attributes.position.count > his.geometry.attributes.position.count)) his = o; });
  /** How his skin meets hers now: how many of his vertices are inside her and how deep, and the least air under the rest. */
  const meets = () => {
    skin.pose();
    egill.root.updateMatrixWorld(true);
    his.skeleton.update();
    const v = new THREE.Vector3();
    let inside = 0, deepest = 0, air = Infinity;
    for (let i = 0; i < his.geometry.attributes.position.count; i += 2) {
      his.getVertexPosition(i, v).applyMatrix4(his.matrixWorld);
      const d = skin.closest(v).distance;
      if (d < 0) { inside++; deepest = Math.max(deepest, -d); } else air = Math.min(air, d);
    }
    return { inside, deepest, air };
  };
  const seat = createSeat(her, HEAD_SEAT);
  egill.play('sit', { fade: 0 });
  const riding = ride(egill, seat, { settle: 0 });
  const poses = [['down'], ['up'], ['stride', 0], ['stride', 0.25], ['stride', 0.5], ['stride', 0.75]];
  for (const [pose, at] of poses) {
    hold(pose, at);
    refresh();
    const name = pose + (at === undefined ? '' : ` ${at}`);
    const s = over(HEAD_SEAT.skin.seat);
    assert.ok(Math.abs(s - 0.01) < 0.02, `${name}: his seat is ${(s * 100).toFixed(1)} cm over her skin`);
    for (const side of ['left', 'right']) {
      const a = over(HEAD_SEAT.skin.ankles[side]);
      assert.ok(Math.abs(a - 0.125) < 0.03, `${name}: his ${side} sole is ${(a * 100).toFixed(1)} cm over her skin`);
    }
    // none of him is in her, and the lowest of him (his seat, his soles) is on her, not over her
    const meet = meets();
    assert.ok(meet.deepest < 0.02, `${name}: ${meet.inside} of his vertices are in her skin, ${(meet.deepest * 100).toFixed(1)} cm at most`);
    assert.ok(meet.air < 0.03, `${name}: the lowest of him is ${(meet.air * 100).toFixed(1)} cm over her skin`);
    // he rides it: his root where the seat is, upright, facing her way
    assert.ok(egill.root.position.distanceTo(seat.update()) < 0.01, `${name}: he is on the seat`);
    assert.ok(Math.abs(((egill.heading - her.heading + 540) % 360) - 180) < 2, `${name}: he faces her way`);
  }
  riding.stop();
});

// Audit B2: a frame where the clock stands still (the book's pause, a bug report's still, a ?t= link) after a frame that ran, her hips
// pitched: her feet stay where they were (they jumped 44-60 cm forward when her Hips' tilt was left on for her feet to be solved in).
test('on a frozen frame with her hips pitched her feet stay where they were, at every heading', async () => {
  const { her, frame, hold, lean, hips, headDownPose } = await onGrameðla();
  const feet = () => { her.root.updateMatrixWorld(true); return ['LeftFoot', 'RightFoot'].map(n => her.model.getObjectByName(n).getWorldPosition(new THREE.Vector3())); };
  // her idle running at its own pace, as in scene 7 (the mixer sets her Hips on every frame that runs, and on no frame that does not)
  for (let k = 0; k < 30; k++) frame(1 / 30);
  const down = headDownPose(her, lean, hips);
  assert.ok(down.hips > 0.1, `her hips pitch ${down.hips.toFixed(3)} rad in the head-down pose`);
  const poses = [down, { theta: 0, pitch: 0.25, hips: 0.25 }];
  for (const [heading, pose] of [[0, down], [90, down], [180, down], [0, poses[1]], [90, poses[1]], [180, poses[1]]]) {
    her.place(0, 0, heading);
    hold.lay(pose);
    for (let k = 0; k < 30; k++) frame(1 / 30);
    const ran = feet();
    for (let k = 0; k < 3; k++) frame(0);
    const frozen = feet();
    for (const i of [0, 1]) assert.ok(ran[i].distanceTo(frozen[i]) < 0.001, `heading ${heading}: on a frozen frame her foot jumped ${(ran[i].distanceTo(frozen[i]) * 100).toFixed(1)} cm`);
    // and the clock going on again: the same pose as before the freeze
    frame(1 / 30);
    const again = feet();
    for (const i of [0, 1]) assert.ok(ran[i].distanceTo(again[i]) < 0.001, `heading ${heading}: after the freeze her foot is ${(ran[i].distanceTo(again[i]) * 100).toFixed(1)} cm off`);
  }
});

test('with her head down the seat is under 2.4 m over the ground and her feet have not moved', async () => {
  const { her, hold, refresh, HEAD_SEAT, head } = await onGrameðla();
  const feet = () => ['LeftFoot', 'RightFoot'].map(n => her.model.getObjectByName(n).getWorldPosition(new THREE.Vector3()));
  hold('up');
  const before = feet();
  const down = hold('down');
  refresh();
  const after = feet();
  for (const k of [0, 1]) assert.ok(before[k].distanceTo(after[k]) < 0.01, `her foot moved ${(before[k].distanceTo(after[k]) * 100).toFixed(1)} cm`);
  assert.ok(Math.abs(down.snout - 0.2) < 0.02, `her jaw's underside is ${down.snout.toFixed(2)} m over the ground`);
  assert.ok(down.low > 0.18, `nothing of her head is under the ground (lowest ${down.low.toFixed(2)} m)`);
  assert.ok(down.hips <= THREE.MathUtils.degToRad(25) + 1e-6, `her hips pitch ${THREE.MathUtils.radToDeg(down.hips).toFixed(1)} degrees`);
  const seatY = new THREE.Vector3(...HEAD_SEAT.skin.seat).applyMatrix4(head.matrixWorld).y - 0.32;
  assert.ok(seatY < 2.4, `the seat (his root) is ${seatY.toFixed(2)} m over the ground`);
});
