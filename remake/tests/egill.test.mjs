import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { clone as cloneSkinned } from '../../dist/vendor/SkeletonUtils.js';
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
const FEET = ['LeftFoot', 'RightFoot'];

// A copy of Egill in the bind pose (the loaded scene itself is never posed, so every test starts
// from the bind pose).
async function model() {
  const gltf = await gltfPromise;
  const scene = cloneSkinned(gltf.scene);
  let mesh = null;
  scene.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  return { gltf, scene, mesh, clip: name => gltf.animations.find(c => c.name === name) };
}

async function stage() {
  const gltf = await gltfPromise;
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const world = { scene: new THREE.Scene(), camera, heightAt: () => 0, actors: new Map() };
  world.resolvePoint = createPointResolver(world);
  const egill = await createActor(world, { name: 'egill', gltf });
  world.actors.set('egill', egill);
  return { world, egill };
}

// Follows the feet frame by frame from start(), as Mosi's tests do: the most a foot moved along the
// ground between two frames in which it was down (its ankle within 1 mm of its bind-pose height),
// how often a foot lifted, and how far a planted foot got from its rest spot. Make it while the legs
// are still in the bind pose.
function footWatch(actor) {
  const feet = FEET.map(n => actor.model.getObjectByName(n));
  const read = () => {
    actor.root.updateMatrixWorld(true);
    return feet.map(f => f.getWorldPosition(new THREE.Vector3()));
  };
  const rest = read().map(p => actor.root.worldToLocal(p.clone()));
  let last = null;
  const watch = {
    slide: 0, lifts: 0, reach: 0,
    start() { last = null; watch.slide = 0; watch.lifts = 0; watch.reach = 0; return watch.sample(); },
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
      });
      last = now;
      return now;
    },
  };
  return watch;
}
const mm = metres => `${(metres * 1000).toFixed(1)} mm`;

test('Egill has the humanoid skeleton, his clips and fits his budget', async () => {
  const { gltf, mesh } = await model();
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
  const { mesh } = await model();
  const w = mesh.geometry.attributes.skinWeight;
  for (let i = 0; i < w.count; i++) {
    const sum = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i);
    assert.ok(Math.abs(sum - 1) < 1e-3, `vertex ${i} sums to ${sum}`);
  }
});

test('in the idle pose the shirt and waist stay where they are (arms move alone)', async () => {
  const { scene, mesh, clip } = await model();
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(clip('idle')).play();
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
      if (w > 0.999 && pos.getY(i) < 0.004) sole.push(i);
    }
    return { bone, sole, rest: bone.getWorldPosition(new THREE.Vector3()) };
  });
  assert.ok(feet.every(f => f.sole.length > 50), 'each boot has a sole');

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
  assert.ok(speeds.length > steps / 2, `a foot is down for ${speeds.length} of ${2 * steps} samples`);
  const speed = speeds.reduce((sum, v) => sum + v, 0) / speeds.length;
  assert.ok(speed >= 0.5 && speed <= 0.7, `walks at ${speed.toFixed(3)} m/s`);
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
  const { egill } = await stage();
  const walk = egill.walkTo([[3, 0]], { speed: 0.6 });
  assert.ok(egill.gait && egill.gait.naturalSpeed >= 0.5 && egill.gait.naturalSpeed <= 0.7, JSON.stringify(egill.gait && { speed: egill.gait.naturalSpeed }));
  for (let i = 0; i < 300 && !walk.done; i++) egill.update(1 / 30);
  assert.equal(walk.done, true);
  assert.ok(egill.root.position.distanceTo(new THREE.Vector3(3, 0, 0)) < 1e-3);
});

test('walking at a calm pace, a planted foot stays put', async () => {
  for (const speed of [0.5, 0.6, 0.7]) {
    const { egill } = await stage();
    const watch = footWatch(egill);
    const walk = egill.walkTo([[4, 0]], { speed });
    for (let i = 0; i < 600 && egill.root.position.x < 1; i++) egill.update(1 / 30);
    watch.start();
    for (let i = 0; i < 600 && egill.root.position.x < 3; i++) { egill.update(1 / 30); watch.sample(); }
    assert.equal(walk.done, false);
    assert.ok(watch.lifts >= 4, `${watch.lifts} steps at ${speed} m/s`);
    assert.ok(watch.slide < 1e-3, `at ${speed} m/s a planted foot moved ${mm(watch.slide)} in a frame`);
  }
});

test('a walk starts without dragging a foot or reaching too far', async () => {
  // From the bind pose, and from wherever a turn on the spot left the feet.
  for (const turnFirst of [null, -40]) {
    const { egill } = await stage();
    const watch = footWatch(egill);
    if (turnFirst !== null) {
      const turn = egill.turnTo(turnFirst);
      for (let i = 0; i < 300 && (!turn.done || egill.stepping); i++) egill.update(1 / 30);
    }
    const h = THREE.MathUtils.degToRad(egill.heading);
    const walk = egill.walkTo([[3 * Math.cos(h), 3 * Math.sin(h)]], { speed: 0.6 });
    watch.start();
    for (let i = 0; i < 75 && !walk.done; i++) { egill.update(1 / 30); watch.sample(); }
    assert.ok(watch.lifts >= 2, 'the feet step');
    assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
    assert.ok(watch.reach < 0.22, `a planted foot was ${watch.reach.toFixed(2)} m from its rest spot`);
  }
});

test('stopping keeps the planted feet where they are and brings the lifted ones down', async () => {
  for (const goal of [2.5, 2.8]) { // two different points of the stride
    const { egill } = await stage();
    const watch = footWatch(egill);
    const walk = egill.walkTo([[goal, 0]], { speed: 0.6 });
    for (let i = 0; i < 600 && !walk.done; i++) {
      egill.update(1 / 30);
      if (egill.root.position.x > goal - 0.5) watch.sample(); // the last half metre, then the stop
    }
    assert.equal(walk.done, true);
    for (let i = 0; i < 60; i++) { egill.update(1 / 30); watch.sample(); }
    assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
    assert.ok(watch.sample().every(foot => foot.down), 'both feet are down two seconds after the stop');
    assert.equal(egill.stepping, false);
  }
});

test('turning on the spot, a planted foot stays put and the feet step around', async () => {
  const { egill } = await stage();
  const watch = footWatch(egill);
  for (let i = 0; i < 10; i++) egill.update(1 / 30);
  watch.start();
  const turn = egill.turnTo(90);
  for (let i = 0; i < 300 && !turn.done; i++) { egill.update(1 / 30); watch.sample(); }
  assert.equal(turn.done, true);
  assert.ok(Math.abs(egill.heading - 90) < 1.5, `heading ${egill.heading}`);
  for (let i = 0; i < 60 && egill.stepping; i++) { egill.update(1 / 30); watch.sample(); }
  assert.equal(egill.stepping, false);
  assert.ok(watch.lifts >= 3, `${watch.lifts} steps`);
  assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
  const end = watch.sample();
  assert.ok(end.every(foot => foot.down && foot.reach < 0.06), `the feet end ${end.map(f => f.reach.toFixed(3)).join(' and ')} m from their rest spots`);
});

test('a clip that leaves the legs alone leaves the planted feet where they stand', async () => {
  const { egill } = await stage();
  const watch = footWatch(egill);
  const turn = egill.turnTo(50);
  for (let i = 0; i < 300 && (!turn.done || egill.stepping); i++) egill.update(1 / 30);
  const before = watch.start().map(foot => foot.p.clone());
  egill.play('wave');
  for (let i = 0; i < 45; i++) { egill.update(1 / 30); watch.sample(); }
  const after = watch.sample();
  assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
  after.forEach((foot, k) => assert.ok(foot.p.distanceTo(before[k]) < 1e-3, `a foot moved ${mm(foot.p.distanceTo(before[k]))} while he waved`));
});
