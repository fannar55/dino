// Mosi's saddle (engine/riding.js createSaddle): the owner's Tripo saddle, the same as Flugeðla's, fitted to Mosi's back by
// tools/saddle-fit.mjs --host=mosi and skinned on his bones. It stays out of his skin as he stands and walks, and Egill rides on it:
// his bottom on its seat, his hands on its bar, his feet down on its pad, and nothing of him in Mosi.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { chapterWorld } from './chapter-harness.mjs';
import { loadCharacter, skinnedMeshOf } from './characters.mjs';
import { clone as cloneSkinned } from '../../dist/vendor/SkeletonUtils.js';
import { updateActors } from '../engine/actor.js';
import { createSaddle, ride, MOSI_SADDLE, MOSI_SADDLE_MODEL, SIT_DEPTH } from '../engine/riding.js';
import { skinSurface } from '../engine/skin-surface.js';
import { readGlb, eachPose, checkInPoses, MOSI_POSES } from '../tools/saddle-fit.mjs';

const DT = 1 / 30;
const world = await chapterWorld({
  look: 'lateMorning',
  actors: { mosi: { url: '../assets/characters/mosi.glb', position: [0, 0, 0], heading: 0 }, egill: { url: '../assets/characters/egill.glb', position: [2, 0, 4] } },
});
const mosi = world.actors.get('mosi');
const egill = world.actors.get('egill');
const extras = readGlb(fileURLToPath(MOSI_SADDLE_MODEL)).json.nodes[0].extras;

test('the saddle\'s places in riding.js are its file\'s (Egill is seated on them before the file has loaded)', () => {
  const close = (a, b, label) => a.forEach((x, k) => assert.ok(Math.abs(x - b[k]) < 1e-4, `${label}: ${a} against the file's ${b}`));
  close(MOSI_SADDLE.up, extras.frame.up, 'up');
  close(MOSI_SADDLE.seat.bind, extras.places.seat.bind, 'seat');
  assert.deepEqual(MOSI_SADDLE.seat.weights, extras.places.seat.weights);
  for (const part of ['grips', 'knees', 'ankles']) for (const side of ['left', 'right']) {
    close(MOSI_SADDLE[part][side].bind, extras.places[part][side].bind, `${part}.${side}`);
    assert.deepEqual(MOSI_SADDLE[part][side].weights, extras.places[part][side].weights);
  }
  assert.equal(extras.host, 'mosi');
});

test('it loads onto Mosi\'s own skeleton, hidden, pops on with sparkles and ends at its fitted size', async () => {
  const saddle = createSaddle(mosi);
  assert.equal(await saddle.loaded, true);
  assert.ok(saddle.object.isSkinnedMesh);
  assert.equal(saddle.object.skeleton, skinnedMeshOf(mosi.model).skeleton, 'it moves with his bones, not a copy');
  assert.equal(saddle.object.visible, false, 'hidden until it appears');
  const shown = saddle.appear();
  assert.equal(saddle.object.visible, true);
  assert.ok(saddle.size < 0.01, 'it starts from nothing');
  let biggest = 0, frames = 0;
  for (; frames < 60 && !shown.done; frames++) {
    world.effects.update(DT);
    biggest = Math.max(biggest, saddle.size);
  }
  assert.equal(shown.done, true);
  assert.ok(Math.abs(frames * DT - 0.8) < 0.05, `it took ${(frames * DT).toFixed(2)} s`);
  assert.ok(biggest > 1.04, `it overshoots a little before it settles (${biggest.toFixed(2)})`);
  assert.equal(saddle.size, 1, 'it ends at its fitted size');
  // the owner's saddle as on Flugeðla, made for its 1.1 m rider: 0.8 m front to back, on Mosi's 8.5 m
  world.scene.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(saddle.object).getSize(new THREE.Vector3());
  assert.ok(size.x > 0.7 && size.x < 1 && size.z > 0.5 && size.z < 1.2, `the saddle is ${size.x.toFixed(2)} by ${size.z.toFixed(2)} m`);
  saddle.dispose();
});

test('it stays out of his skin as he stands and walks', async () => {
  const saddle = createSaddle(mosi);
  assert.equal(await saddle.loaded, true);
  const gltf = await loadCharacter('mosi');
  const scene = cloneSkinned(gltf.scene);
  scene.updateMatrixWorld(true);
  const mesh = skinnedMeshOf(scene);
  // his skin round the seat (bind frame: his own units, 2.11 m each), posed in the world (metres) for each pose
  const skin = skinSurface(mesh, { around: new THREE.Vector3(...MOSI_SADDLE.seat.bind), near: 0.7 });
  const geo = saddle.object.geometry;
  const bones = mesh.skeleton.bones.map(b => b.name);
  const own = saddle.object.skeleton.bones.map(b => b.name);
  const positions = Array.from({ length: geo.attributes.position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(geo.attributes.position, i));
  const weights = positions.map((_, i) => new Map([0, 1, 2, 3]
    .map(k => [bones.indexOf(own[geo.attributes.skinIndex.getComponent(i, k)]), geo.attributes.skinWeight.getComponent(i, k)])
    .filter(([, w]) => w > 0)));
  const rows = checkInPoses({ positions, weights, contact: new Uint8Array(positions.length) }, skin, visit => eachPose(gltf, scene, mesh, visit, MOSI_POSES));
  assert.equal(rows.length, MOSI_POSES.reduce((n, [, at]) => n + at.length, 0));
  for (const r of rows) {
    assert.ok(r.worst > -0.005, `${r.label}: a vertex is ${(-r.worst * 100).toFixed(1)} cm inside him`);
    assert.ok(r.inside <= positions.length * 0.005, `${r.label}: ${r.inside} of ${positions.length} vertices are inside him`);
  }
  saddle.dispose();
});

test('on it Egill sits on its seat, holds its bar, his feet on its pad, and nothing of him goes into Mosi, standing and walking', async () => {
  mosi.place(0, 0, 0);
  mosi.play('idle', { fade: 0 });
  const saddle = createSaddle(mosi);
  assert.equal(await saddle.loaded, true);
  saddle.show();
  const riding = ride(egill, saddle, { settle: 0 });
  const body = skinnedMeshOf(mosi.model);
  const boy = skinnedMeshOf(egill.model);
  const v = new THREE.Vector3();
  const hit = new THREE.Vector3();
  // inside him by the crossings of rays through his whole posed body
  const now = [];
  const inside = p => {
    const geo = body.geometry;
    now.length = 0;
    for (let i = 0; i < geo.attributes.position.count; i++) now.push(body.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(body.matrixWorld));
    return [[0.1, 1, 0.05], [1, 0.1, -0.2], [-0.2, -0.3, 1]].filter(d => {
      const ray = new THREE.Ray(p, new THREE.Vector3(...d).normalize());
      let n = 0;
      for (let f = 0; f < geo.index.count; f += 3) if (ray.intersectTriangle(now[geo.index.getX(f)], now[geo.index.getX(f + 1)], now[geo.index.getX(f + 2)], false, hit)) n++;
      return n % 2 === 1;
    }).length >= 2;
  };
  const skin = skinSurface(body, { around: new THREE.Vector3(...MOSI_SADDLE.seat.bind), near: 0.8 });
  const problems = [];
  const check = label => {
    world.scene.updateMatrixWorld(true);
    skin.pose();
    saddle.update();
    const bottom = egill.root.position.clone().addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(egill.root.quaternion), SIT_DEPTH);
    const seat = saddle.seat.clone().addScaledVector(new THREE.Vector3(0, 1, 0), SIT_DEPTH);
    if (bottom.distanceTo(seat) > 0.02) problems.push(`${label}: his bottom is ${(bottom.distanceTo(seat) * 100).toFixed(1)} cm from the seat`);
    for (const side of ['Left', 'Right']) {
      const key = side.toLowerCase();
      const wrist = egill.model.getObjectByName(`${side}Hand`).getWorldPosition(new THREE.Vector3());
      if (wrist.distanceTo(saddle.grips[key]) > 0.06) problems.push(`${label}: his ${key} wrist is ${(wrist.distanceTo(saddle.grips[key]) * 100).toFixed(1)} cm from its grip`);
      const foot = egill.model.getObjectByName(`${side}Foot`).getWorldPosition(new THREE.Vector3());
      if (foot.distanceTo(saddle.ankles[key]) > 0.06) problems.push(`${label}: his ${key} foot is ${(foot.distanceTo(saddle.ankles[key]) * 100).toFixed(1)} cm from its place on the pad`);
    }
    boy.skeleton.update();
    let deepest = null;
    for (let i = 0; i < boy.geometry.attributes.position.count; i++) {
      boy.getVertexPosition(i, v).applyMatrix4(boy.matrixWorld);
      const c = skin.closest(v, { reach: 0.1 });
      if (c && c.distance < -0.01 && (!deepest || c.distance < deepest.distance)) deepest = { distance: c.distance, at: v.clone() };
    }
    if (deepest && inside(deepest.at)) problems.push(`${label}: he is ${(-deepest.distance * 100).toFixed(1)} cm inside Mosi`);
  };
  for (let k = 0; k < 30; k++) updateActors(world.actors.values(), DT); // his hands and legs go on over 0.3 s
  check('standing');
  mosi.walkTo([[12, 0]], { speed: 0.95 });
  for (let k = 1; k <= 90; k++) {
    updateActors(world.actors.values(), DT);
    if (k % 15 === 0) check(`walking ${(k * DT).toFixed(1)} s`);
  }
  riding.stop();
  saddle.dispose();
  assert.deepEqual(problems, []);
});
