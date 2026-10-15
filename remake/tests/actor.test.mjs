import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { createActor } from '../engine/actor.js';
import { createPointResolver } from '../engine/points.js';

// The real Mosi, with its textures removed so GLTFLoader can parse it without a DOM.
function loadMosi() {
  const glb = fs.readFileSync(new URL('../assets/characters/mosi.glb', import.meta.url));
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
  const buffer = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  return new Promise((resolve, reject) => new GLTFLoader().parse(buffer, '', resolve, reject));
}

const gltfPromise = loadMosi();

// The remake bakes Mosi at his real 8.5 m: one uniform scale on the root node of the game's bake, whose
// size (4.025 m long) these tests were tuned on. Footing scales with the legs, so he behaves the same
// in proportion at any size: stage() and scaledStage() size him relative to the game's bake, and one
// test walks him at his real size.
const REAL = (() => {
  const glb = fs.readFileSync(new URL('../assets/characters/mosi.glb', import.meta.url));
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString('utf8'));
  return json.nodes[json.scenes[0].nodes[0]].scale?.[0] ?? 1;
})();

async function stage() {
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const world = { scene: new THREE.Scene(), camera, heightAt: () => 0, actors: new Map() };
  world.resolvePoint = createPointResolver(world);
  const gltf = await gltfPromise;
  gltf.scene.scale.setScalar(1 / REAL);
  const mosi = await createActor(world, { name: 'mosi', gltf });
  world.actors.set('mosi', mosi);
  return { world, camera, mosi };
}

const headOf = mosi => mosi.model.getObjectByName('Head');
const headQuat = mosi => headOf(mosi).getWorldQuaternion(new THREE.Quaternion());
const angleDeg = (a, b) => THREE.MathUtils.radToDeg(a.angleTo(b));

// Follows the feet frame by frame from start(): the most a foot moved along the ground between two
// frames in which it was down (within 1 mm of its bind-pose height), how often a foot lifted, and
// how far a planted foot got from its rest spot under the body (the leg's reach).
// Make it while the legs are still in the bind pose.
function footWatch(mosi) {
  const feet = ['FrontFootL', 'FrontFootR', 'BackFootL', 'BackFootR'].map(n => mosi.model.getObjectByName(n));
  const read = () => {
    mosi.root.updateMatrixWorld(true);
    return feet.map(f => f.getWorldPosition(new THREE.Vector3()));
  };
  const rest = read().map(p => mosi.root.worldToLocal(p.clone()));
  let last = null;
  const watch = {
    slide: 0, lifts: 0, reach: 0,
    start() { last = null; watch.slide = 0; watch.lifts = 0; watch.reach = 0; return watch.sample(); },
    sample() {
      const now = read().map((p, k) => {
        const local = mosi.root.worldToLocal(p.clone());
        return { p, down: local.y - rest[k].y < 0.001, reach: Math.hypot(local.x - rest[k].x, local.z - rest[k].z) };
      });
      now.forEach((foot, k) => {
        if (foot.down) watch.reach = Math.max(watch.reach, foot.reach);
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

test('the gait is measured from the walk clip', async () => {
  const { mosi } = await stage();
  mosi.walkTo([[3, 0]], { speed: 0.6 });
  assert.ok(mosi.gait && mosi.gait.naturalSpeed > 0.1 && mosi.gait.naturalSpeed < 1, JSON.stringify(mosi.gait));
});

test('frozen frames do not pile the head look up on itself', async () => {
  const { mosi } = await stage();
  mosi.lookAt([1.5, 1.6, 4], { weight: 0.7 }); // well to his right
  for (let i = 0; i < 90; i++) mosi.update(1 / 30);
  const before = headQuat(mosi);
  for (let i = 0; i < 60; i++) mosi.update(0); // a paused or frozen capture keeps rendering
  assert.ok(angleDeg(before, headQuat(mosi)) < 0.01, `head drifted ${angleDeg(before, headQuat(mosi)).toFixed(2)} degrees`);
});

test('a target behind him turns the head sideways without tipping it', async () => {
  const { mosi } = await stage();
  const rest = new THREE.Vector3();
  for (let i = 0; i < 5; i++) mosi.update(1 / 30);
  const head = headOf(mosi);
  const forwardAt = () => new THREE.Vector3(1, 0, 0).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
  rest.copy(forwardAt());
  mosi.lookAt([-6, 1.9, 0.2], { weight: 1 }); // behind him, a little above head height
  for (let i = 0; i < 120; i++) mosi.update(1 / 30);
  const now = forwardAt();
  const pitchChange = Math.abs(THREE.MathUtils.radToDeg(Math.asin(now.y) - Math.asin(rest.y)));
  assert.ok(pitchChange < 32, `head tipped ${pitchChange.toFixed(1)} degrees`);
});

test('turning during a walk ends the walk, and the turn finishes', async () => {
  const { mosi } = await stage();
  const walk = mosi.walkTo([[6, 0]], { speed: 0.6 });
  for (let i = 0; i < 30; i++) mosi.update(1 / 30);
  const turn = mosi.turnTo(90);
  assert.equal(walk.done, true);
  assert.equal(mosi.walking, false);
  for (let i = 0; i < 300 && !turn.done; i++) mosi.update(1 / 30);
  assert.equal(turn.done, true);
  assert.ok(Math.abs(mosi.heading - 90) < 1.5, `heading ${mosi.heading}`);
});

test('walking to where he already stands settles a walk in progress', async () => {
  const { mosi } = await stage();
  mosi.walkTo([[6, 0]], { speed: 0.6 });
  for (let i = 0; i < 30; i++) mosi.update(1 / 30);
  const here = mosi.root.position;
  const handle = mosi.walkTo([here.x, here.z]);
  assert.equal(handle.done, true);
  assert.equal(mosi.walking, false);
  const x = mosi.root.position.x;
  for (let i = 0; i < 30; i++) mosi.update(1 / 30);
  assert.equal(mosi.root.position.x, x);
});

test('a walk arrives on its path and stop() settles everything', async () => {
  const { mosi } = await stage();
  const walk = mosi.walkTo([[2, 1], [4, 0]], { speed: 0.6 });
  for (let i = 0; i < 900 && !walk.done; i++) mosi.update(1 / 30);
  assert.equal(walk.done, true);
  assert.ok(mosi.root.position.distanceTo(new THREE.Vector3(4, 0, 0)) < 1e-3);
  mosi.walkTo([[0, 0]]);
  mosi.lookAt('camera');
  mosi.stop();
  assert.equal(mosi.walking, false);
});

test('turning on the spot, a foot that is down stays put and the feet step around', async () => {
  const { mosi } = await stage();
  const watch = footWatch(mosi);
  for (let i = 0; i < 10; i++) mosi.update(1 / 30);
  watch.start();
  const turn = mosi.turnTo(75);
  for (let i = 0; i < 300 && !turn.done; i++) { mosi.update(1 / 30); watch.sample(); }
  assert.equal(turn.done, true);
  assert.ok(Math.abs(mosi.heading - 75) < 1.5, `heading ${mosi.heading}`);
  for (let i = 0; i < 60 && mosi.stepping; i++) { mosi.update(1 / 30); watch.sample(); }
  assert.equal(mosi.stepping, false);
  assert.ok(watch.lifts >= 4, `${watch.lifts} steps`);
  assert.ok(watch.slide < 1e-3, `a planted foot moved ${(watch.slide * 1000).toFixed(1)} mm in a frame`);
});

test('stopping keeps the planted feet where they are and brings the lifted ones down', async () => {
  const { mosi } = await stage();
  const watch = footWatch(mosi);
  const walk = mosi.walkTo([[4, 0]], { speed: 0.65 });
  for (let i = 0; i < 900 && !walk.done; i++) {
    mosi.update(1 / 30);
    if (mosi.root.position.x > 3.5) watch.sample(); // the last half metre, then the stop
  }
  assert.equal(walk.done, true);
  for (let i = 0; i < 60; i++) { mosi.update(1 / 30); watch.sample(); }
  assert.ok(watch.slide < 1e-3, `a planted foot moved ${(watch.slide * 1000).toFixed(1)} mm in a frame`);
  assert.ok(watch.sample().every(foot => foot.down), 'every foot is down two seconds after the stop');
  assert.equal(mosi.stepping, false);
});

test('a walk starts without dragging a foot or reaching too far', async () => {
  // From the bind pose, and from wherever a turn on the spot left the feet.
  for (const turnFirst of [null, -40]) {
    const { mosi } = await stage();
    const watch = footWatch(mosi);
    if (turnFirst !== null) {
      const turn = mosi.turnTo(turnFirst);
      for (let i = 0; i < 300 && (!turn.done || mosi.stepping); i++) mosi.update(1 / 30);
    }
    const h = THREE.MathUtils.degToRad(mosi.heading);
    const walk = mosi.walkTo([[4 * Math.cos(h), 4 * Math.sin(h)]], { speed: 0.65 });
    watch.start();
    for (let i = 0; i < 90 && !walk.done; i++) { mosi.update(1 / 30); watch.sample(); }
    assert.ok(watch.lifts >= 2, 'the feet step');
    assert.ok(watch.slide < 1e-3, `a planted foot moved ${(watch.slide * 1000).toFixed(1)} mm in a frame`);
    assert.ok(watch.reach < 0.62, `a planted foot was ${watch.reach.toFixed(2)} m from its rest spot`);
  }
});

test('on a curve the planted feet stay put and within reach', async () => {
  const { mosi } = await stage();
  const watch = footWatch(mosi);
  // A quarter circle of 4 m radius between two straights.
  const rad = THREE.MathUtils.degToRad;
  const arc = [30, 60, 90].map(a => [2 + 4 * Math.sin(rad(a)), 4 * (1 - Math.cos(rad(a)))]);
  const walk = mosi.walkTo([[2, 0], ...arc, [6, 6]], { speed: 0.65 });
  watch.start();
  for (let i = 0; i < 1200 && !walk.done; i++) { mosi.update(1 / 30); watch.sample(); }
  assert.equal(walk.done, true);
  assert.ok(watch.slide < 1e-3, `a planted foot moved ${(watch.slide * 1000).toFixed(1)} mm in a frame`);
  assert.ok(watch.reach < 0.62, `a planted foot was ${watch.reach.toFixed(2)} m from its rest spot`);
});

// Mosi at `scale` times the game's size (REAL is his real 8.5 m, about twice it).
async function scaledStage(scale) {
  const gltf = await loadMosi();
  gltf.scene.scale.setScalar(scale / REAL);
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const world = { scene: new THREE.Scene(), camera, heightAt: () => 0, actors: new Map() };
  world.resolvePoint = createPointResolver(world);
  const mosi = await createActor(world, { name: 'mosi', gltf });
  world.actors.set('mosi', mosi);
  return { world, mosi };
}

// Where each foot was set down, in order (world x and z), as footWatch samples them.
function plantings(watch) {
  const spots = [];
  const sample = watch.sample;
  let last = null;
  watch.sample = () => {
    const now = sample();
    now.forEach((foot, k) => {
      if (last && foot.down && !last[k].down) (spots[k] ||= []).push(foot.p.clone());
    });
    last = now;
    return now;
  };
  return spots;
}

test('twice the size, Mosi strides twice as far and keeps his planted feet still', async () => {
  const { mosi } = await scaledStage(2);
  const watch = footWatch(mosi);
  const spots = plantings(watch);
  // A bigger animal walks faster in proportion to the square root of its size.
  const walk = mosi.walkTo([[14, 0]], { speed: 0.65 * Math.SQRT2 });
  for (let i = 0; i < 900 && mosi.root.position.x < 2; i++) mosi.update(1 / 30);
  watch.start();
  for (let i = 0; i < 900 && mosi.root.position.x < 11; i++) { mosi.update(1 / 30); watch.sample(); }
  assert.equal(walk.done, false);
  assert.ok(watch.slide < 1e-3, `a planted foot moved ${(watch.slide * 1000).toFixed(1)} mm in a frame`);
  const strides = spots.flatMap(list => list.slice(1).map((p, i) => p.distanceTo(list[i])));
  assert.ok(strides.length >= 4, `${strides.length} strides`);
  for (const stride of strides) assert.ok(Math.abs(stride - 3.4) < 0.34, `a foot moved ${stride.toFixed(2)} m between plantings (the clip's stride is 1.7 m at his size today)`);
});

test('at his real 8.5 m, Mosi strides in proportion and keeps his planted feet still', async () => {
  assert.ok(Math.abs(REAL - 8.5 / 4.025) < 0.01, `the remake's Mosi is ${(4.025 * REAL).toFixed(2)} m long`);
  const { mosi } = await scaledStage(REAL);
  const watch = footWatch(mosi);
  const spots = plantings(watch);
  const walk = mosi.walkTo([[7 * REAL, 0]], { speed: 0.65 * Math.sqrt(REAL) });
  for (let i = 0; i < 900 && mosi.root.position.x < REAL; i++) mosi.update(1 / 30);
  watch.start();
  for (let i = 0; i < 900 && mosi.root.position.x < 5.5 * REAL; i++) { mosi.update(1 / 30); watch.sample(); }
  assert.equal(walk.done, false);
  assert.ok(watch.slide < 1e-3, `a planted foot moved ${(watch.slide * 1000).toFixed(1)} mm in a frame`);
  const strides = spots.flatMap(list => list.slice(1).map((p, i) => p.distanceTo(list[i])));
  assert.ok(strides.length >= 4, `${strides.length} strides`);
  for (const stride of strides) assert.ok(Math.abs(stride - 1.7 * REAL) < 0.17 * REAL, `a foot moved ${stride.toFixed(2)} m between plantings`);
});

test('twice the size, Mosi turns on the spot in as many steps as at his own size', async () => {
  const steps = {};
  for (const scale of [1, 2]) {
    const { mosi } = await scaledStage(scale);
    const watch = footWatch(mosi);
    for (let i = 0; i < 10; i++) mosi.update(1 / 30);
    watch.start();
    const turn = mosi.turnTo(75);
    for (let i = 0; i < 600 && (!turn.done || mosi.stepping); i++) { mosi.update(1 / 30); watch.sample(); }
    assert.equal(turn.done, true);
    assert.ok(watch.slide < 1e-3, `at ${scale}x a planted foot moved ${(watch.slide * 1000).toFixed(1)} mm in a frame`);
    steps[scale] = watch.lifts;
  }
  assert.ok(Math.abs(steps[2] - steps[1]) <= 1, `${steps[1]} steps at his size, ${steps[2]} at twice it`);
});

test('a clip played once holds its last frame, and loops again when played without once', async () => {
  const { mosi } = await stage();
  const action = mosi.play('walk', { once: true, fade: 0.2 });
  assert.equal(action.loop, THREE.LoopOnce);
  for (let i = 0; i < 105; i++) mosi.update(1 / 30); // 3.5 s, past the end of the 2.9 s clip
  assert.equal(action.time, action.getClip().duration);
  const foot = mosi.model.getObjectByName('FrontFootL');
  const held = foot.getWorldPosition(new THREE.Vector3());
  for (let i = 0; i < 30; i++) mosi.update(1 / 30);
  assert.ok(foot.getWorldPosition(new THREE.Vector3()).distanceTo(held) < 1e-6, 'the last frame holds');
  mosi.play('idle');
  assert.equal(mosi.play('walk').loop, THREE.LoopRepeat);
});

test('while controlled, the root stays where it is put and a walk waits', async () => {
  const { mosi } = await stage();
  const walk = mosi.walkTo([[4, 0]], { speed: 0.6 });
  for (let i = 0; i < 15; i++) mosi.update(1 / 30);
  mosi.controlled = true;
  mosi.root.position.set(1, 2, 3);
  for (let i = 0; i < 30; i++) mosi.update(1 / 30);
  assert.deepEqual(mosi.root.position.toArray(), [1, 2, 3]);
  assert.equal(walk.done, false);
  // control(fn) hands each update's dt to fn first, to put the root; control(null) gives the actor back.
  const steps = [];
  mosi.control(dt => { steps.push(dt); mosi.root.position.x += 0.5; });
  for (let i = 0; i < 4; i++) mosi.update(1 / 30);
  assert.equal(steps.length, 4);
  assert.equal(mosi.root.position.x, 3);
  mosi.control(null);
  assert.equal(mosi.controlled, false);
  mosi.update(1 / 30);
  assert.equal(steps.length, 4);
});

test('frozen frames leave a stepping foot where it is', async () => {
  const { mosi } = await stage();
  mosi.turnTo(60);
  for (let i = 0; i < 12; i++) mosi.update(1 / 30); // a step is under way
  const foot = mosi.model.getObjectByName('FrontFootR');
  const before = foot.getWorldPosition(new THREE.Vector3());
  for (let i = 0; i < 60; i++) mosi.update(0);
  mosi.root.updateMatrixWorld(true);
  assert.ok(foot.getWorldPosition(new THREE.Vector3()).distanceTo(before) < 1e-6);
});
