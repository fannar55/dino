import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { createActor } from '../engine/actor.js';
import { createPointResolver } from '../engine/points.js';
import { createSaddle, ride, tailPath, climbAlong } from '../engine/riding.js';

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
const pitchOf = actor => THREE.MathUtils.radToDeg(Math.asin(new THREE.Vector3(1, 0, 0).applyQuaternion(actor.root.getWorldQuaternion(new THREE.Quaternion())).y));

// Where a path of points is at `s` metres from its start.
function along(points, s) {
  for (let i = 1; i < points.length; i++) {
    const length = points[i].distanceTo(points[i - 1]);
    if (s <= length || i === points.length - 1) return points[i - 1].clone().lerp(points[i], Math.min(1, s / length));
    s -= length;
  }
  return points[0].clone();
}
const lengthOf = points => points.slice(1).reduce((sum, p, i) => sum + p.distanceTo(points[i]), 0);

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

test('climbAlong reaches the end of the path and ends', async () => {
  const { egill } = await stage({ mosi: false });
  // A flat metre, then a metre up at 45 degrees.
  const path = [new THREE.Vector3(-6, 0, 2), new THREE.Vector3(-5, 0, 2), new THREE.Vector3(-4, 1, 2)];
  const length = lengthOf(path);
  const climb = climbAlong(egill, () => path, { speed: 0.45 });
  assert.equal(egill.controlled, true);
  assert.equal(climb.done, false);
  let frames = 0;
  let pitch = null;
  let timeScale = null;
  for (; frames < 900 && !climb.done; frames++) {
    egill.update(1 / 30);
    const x = egill.root.position.x;
    if (pitch === null && x > -4.6) {
      pitch = pitchOf(egill); // on the slope, clear of the bend
      timeScale = egill.mixer.existingAction(egill.clips.get('walk')).getEffectiveTimeScale();
    }
  }
  assert.equal(climb.done, true);
  assert.ok(egill.root.position.distanceTo(path[2]) < 1e-3, `Egill stopped ${mm(egill.root.position.distanceTo(path[2]))} from the end`);
  const seconds = frames / 30;
  assert.ok(seconds > length / 0.45 && seconds < 1.4 * length / 0.45, `${length.toFixed(2)} m took ${seconds.toFixed(1)} s`);
  assert.ok(Math.abs(pitch - 45) < 4, `on the slope he leans ${pitch.toFixed(1)} degrees`);
  assert.ok(Math.abs(timeScale - 0.45 / egill.gait.naturalSpeed) < 0.02, `the walk plays at ${timeScale.toFixed(2)}x`);
  for (let i = 0; i < 30; i++) egill.update(1 / 30);
  assert.ok(egill.root.position.distanceTo(path[2]) < 1e-3, 'he stays at the end');
  assert.equal(egill.controlled, true);
});

test('a climb in legs stops where each leg ends and goes on from there', async () => {
  const { egill } = await stage({ mosi: false });
  const path = [new THREE.Vector3(-6, 0, 2), new THREE.Vector3(-4, 1, 2), new THREE.Vector3(-3, 1.5, 3)];
  const length = lengthOf(path);
  for (const [from, to] of [[0, 1 / 3], [1 / 3, 2 / 3], [2 / 3, 1]]) {
    const leg = climbAlong(egill, () => path, { from, to });
    for (let i = 0; i < 900 && !leg.done; i++) egill.update(1 / 30);
    assert.equal(leg.done, true);
    const end = along(path, to * length);
    assert.ok(egill.root.position.distanceTo(end) < 1e-3, `the leg to ${to.toFixed(2)} stopped ${mm(egill.root.position.distanceTo(end))} from its end`);
    // Between legs he stands still where the leg ended, still held on the path.
    for (let i = 0; i < 45; i++) egill.update(1 / 30);
    assert.ok(egill.root.position.distanceTo(end) < 1e-3, 'he stands still between legs');
    assert.equal(egill.controlled, true);
  }
});

test('a climb or a ride that takes over a climb plays its own clip', async () => {
  const { mosi, egill, frame } = await stage();
  const weight = name => egill.mixer.existingAction(egill.clips.get(name))?.getEffectiveWeight() ?? 0;
  const path = [new THREE.Vector3(-6, 0, 2), new THREE.Vector3(-3, 1.5, 2)];
  const first = climbAlong(egill, () => path, { to: 0.5 });
  for (let i = 0; i < 20; i++) frame();
  const second = climbAlong(egill, () => path, { from: 0.2 });
  assert.equal(first.cancelled, true);
  assert.equal(weight('idle'), 0, 'a next leg walks straight on, without standing first');
  for (let i = 0; i < 20; i++) frame();
  ride(egill, createSaddle(mosi));
  assert.equal(second.cancelled, true);
  for (let i = 0; i < 30; i++) frame();
  assert.ok(weight('sit') > 0.99 && weight('idle') < 0.01, `sit ${weight('sit').toFixed(2)}, idle ${weight('idle').toFixed(2)}`);
});

// The top of Mosi's skin under each point, from his skinned vertices as the clips pose them.
function skinTop(actor) {
  let mesh = null;
  actor.model.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  actor.root.updateMatrixWorld(true);
  const pos = mesh.geometry.attributes.position;
  const world = [];
  for (let i = 0; i < pos.count; i++) world.push(mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
  const index = mesh.geometry.index.array;
  return (x, z) => {
    let top = -Infinity;
    for (let t = 0; t < index.length; t += 3) {
      const a = world[index[t]], b = world[index[t + 1]], c = world[index[t + 2]];
      // Barycentric coordinates of (x, z) in the triangle seen from above.
      const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(d) < 1e-12) continue;
      const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
      const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
      if (u < 0 || v < 0 || u + v > 1) continue;
      top = Math.max(top, u * a.y + v * b.y + (1 - u - v) * c.y);
    }
    return top;
  };
}

test('the tail path runs along the top of the laid-down tail, from the ground up to the back', async () => {
  const { mosi, frame } = await stage();
  mosi.play('tailDown', { once: true });
  for (let i = 0; i < 75; i++) frame(); // 2.5 s: the clip has played and holds
  const path = tailPath(mosi);
  assert.ok(path.length >= 6, `${path.length} points`);
  assert.ok(path[0].y < 0.3, `the climb starts ${path[0].y.toFixed(2)} m up`);
  const hindFoot = mosi.model.getObjectByName('BackFootR').getWorldPosition(new THREE.Vector3());
  assert.ok(path[0].x < hindFoot.x - 1.5, 'it starts well behind the hind legs');
  const back = path[path.length - 1];
  assert.ok(back.y > 2.6, `and ends on his back, ${back.y.toFixed(2)} m up`);
  // Wherever Egill's feet are on it, they are on the skin: within 5 cm of its top.
  const top = skinTop(mosi);
  const length = lengthOf(path);
  let worst = 0;
  for (let s = 0.1; s < length - 0.05; s += 0.1) {
    const p = along(path, s);
    worst = Math.max(worst, Math.abs(top(p.x, p.z) - p.y));
  }
  assert.ok(worst < 0.05, `the path is up to ${mm(worst)} off the top of the skin`);
});
