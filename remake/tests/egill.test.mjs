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

async function stage(gltf = null) {
  gltf ??= await gltfPromise;
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

// Pose a scene by a clip at time t (a clip played once holds its last pose).
function poser(scene, clip) {
  const mixer = new THREE.AnimationMixer(scene);
  const action = mixer.clipAction(clip);
  if (clip.userData.once) { action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; }
  action.play();
  return t => { mixer.setTime(Math.min(t, clip.duration - 1e-4)); scene.updateMatrixWorld(true); };
}
// Every bone's world position at time t of a clip, and its turn.
function bonesAt(scene, clip, t) {
  poser(scene, clip)(t);
  const out = [];
  scene.traverse(o => { if (o.isBone) out.push({ p: o.getWorldPosition(new THREE.Vector3()), q: o.getWorldQuaternion(new THREE.Quaternion()) }); });
  return out;
}
const gap = (a, b) => Math.max(...a.map((bone, i) => bone.p.distanceTo(b[i].p)));
const twist = (a, b) => Math.max(...a.map((bone, i) => THREE.MathUtils.radToDeg(bone.q.angleTo(b[i].q))));
// The vertices of a foot's sole: carried by the foot bone alone, touching the ground in the bind pose.
function soleOf(mesh, name) {
  const bones = mesh.skeleton.bones;
  const b = bones.findIndex(bone => bone.name === name);
  const { position: pos, skinIndex: index, skinWeight: weight } = mesh.geometry.attributes;
  const sole = [];
  for (let i = 0; i < pos.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (index.getComponent(i, k) === b) w += weight.getComponent(i, k);
    if (w > 0.999 && pos.getY(i) < 0.004) sole.push(i);
  }
  return sole;
}

test('Egill has the humanoid skeleton, his clips and fits his budget', async () => {
  const { gltf, mesh } = await model();
  assert.deepEqual(mesh.skeleton.bones.map(b => b.name), BONES);
  const clips = Object.fromEntries(gltf.animations.map(c => [c.name, c.duration]));
  for (const name of ['idle', 'walk', 'wave', 'waveLeft', 'point', 'sit', 'lifted', 'hop']) assert.ok(clips[name] > 0.5, `${name} missing`);
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

test('the hop: he bends his knees, springs up a light 0.25 to 0.35 m with both arms up, and lands softly where he stood', async () => {
  const { scene, mesh, clip } = await model();
  const hop = clip('hop');
  assert.ok(hop, 'hop missing');
  assert.ok(hop.duration >= 0.9 && hop.duration <= 1.2, `the hop is ${hop.duration.toFixed(2)} s long`);
  assert.equal(Boolean(hop.userData.once), true, 'it says it plays once, so the actor plays it once and holds its end');
  // It starts and ends in idle's first pose, so it blends in from idle and back into it (or into a wave).
  const idle = clip('idle');
  const start = bonesAt(scene, idle, 0);
  for (const [when, t] of [['starts', 0], ['ends', hop.duration]]) {
    const pose = bonesAt(scene, hop, t);
    assert.ok(gap(pose, start) < 1e-3 && twist(pose, start) < 0.5, `it ${when} ${mm(gap(pose, start))} and ${twist(pose, start).toFixed(2)} degrees from idle's first pose`);
  }
  scene.updateMatrixWorld(true);
  const bone = name => mesh.skeleton.bones.find(b => b.name === name);
  const feet = FEET.map(name => ({ bone: bone(name), sole: soleOf(mesh, name), rest: bone(name).getWorldPosition(new THREE.Vector3()) }));
  const restHips = bone('Hips').getWorldPosition(new THREE.Vector3()).y;
  const pose = poser(scene, hop);
  const steps = Math.round(hop.duration * 120); // finer than its keys
  const v = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const frames = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * hop.duration;
    pose(t);
    frames.push({
      t,
      hips: bone('Hips').getWorldPosition(new THREE.Vector3()).y - restHips,
      head: bone('Head').getWorldPosition(new THREE.Vector3()),
      hands: ['LeftHand', 'RightHand'].map(name => bone(name).getWorldPosition(new THREE.Vector3())),
      knees: ['LeftLowerLeg', 'RightLowerLeg'].map(name => bone(name).getWorldPosition(new THREE.Vector3())),
      thighs: ['LeftUpperLeg', 'RightUpperLeg'].map(name => bone(name).getWorldPosition(new THREE.Vector3())),
      feet: feet.map(f => ({
        ankle: f.bone.getWorldPosition(new THREE.Vector3()),
        tilt: THREE.MathUtils.radToDeg(f.bone.getWorldQuaternion(q).angleTo(new THREE.Quaternion())),
        sole: f.sole.map(j => mesh.getVertexPosition(j, v).applyMatrix4(mesh.matrixWorld).clone()),
      })),
    });
  }
  // A foot is down while its ankle is within a millimetre of its height in the bind pose. Each foot leaves the
  // ground once, both together, and comes down once.
  const down = (frame, k) => frame.feet[k].ankle.y - feet[k].rest.y < 1e-3;
  const air = feet.map((_, k) => frames.map((frame, i) => (down(frame, k) ? -1 : i)).filter(i => i >= 0));
  for (const k of [0, 1]) {
    const list = air[k];
    assert.ok(list.length > 0, `${FEET[k]} never leaves the ground`);
    assert.equal(list.at(-1) - list[0] + 1, list.length, `${FEET[k]} leaves the ground in one go`);
  }
  const takeOff = Math.max(air[0][0], air[1][0]);
  const touchDown = Math.min(air[0].at(-1), air[1].at(-1));
  assert.ok(Math.abs(air[0][0] - air[1][0]) <= 2 && Math.abs(air[0].at(-1) - air[1].at(-1)) <= 2, 'both feet leave together and land together');
  const airTime = (touchDown - takeOff) / 120;
  assert.ok(airTime > 0.3 && airTime < 0.65, `${airTime.toFixed(2)} s in the air`);
  // Planted before and after: on its own spot, flat, the sole not sliding along the ground or sinking into it.
  let skid = 0;
  let stray = 0;
  let tilt = 0;
  let sink = 0;
  frames.forEach((frame, i) => {
    feet.forEach((f, k) => {
      for (const p of frame.feet[k].sole) sink = Math.max(sink, -p.y);
      if (!down(frame, k)) return;
      stray = Math.max(stray, Math.hypot(frame.feet[k].ankle.x - f.rest.x, frame.feet[k].ankle.z - f.rest.z));
      tilt = Math.max(tilt, frame.feet[k].tilt);
      if (i > 0 && down(frames[i - 1], k)) {
        frame.feet[k].sole.forEach((p, j) => {
          const before = frames[i - 1].feet[k].sole[j];
          if (p.y < 0.002 && before.y < 0.002) skid = Math.max(skid, Math.hypot(p.x - before.x, p.z - before.z));
        });
      }
    });
  });
  assert.ok(stray < 1e-3, `a planted foot strayed ${mm(stray)} from where it stood`);
  assert.ok(skid < 5e-4, `a sole on the ground moved ${mm(skid)} in 1/120 s`);
  assert.ok(tilt < 1, `a planted foot was tilted ${tilt.toFixed(1)} degrees`);
  assert.ok(sink < 1e-3, `a sole sank ${mm(sink)} into the ground`);
  // He bends his knees first: the hips sink and each knee comes forward of the line from hip to ankle.
  const before = frames.slice(0, takeOff);
  const crouch = before.reduce((low, frame) => (frame.hips < low.hips ? frame : low));
  assert.ok(crouch.hips < -0.04 && crouch.hips > -0.12, `he crouches ${mm(-crouch.hips)} before he springs`);
  for (const k of [0, 1]) {
    const hip = crouch.thighs[k];
    const ankle = crouch.feet[k].ankle;
    const knee = crouch.knees[k];
    const along = THREE.MathUtils.clamp((knee.y - hip.y) / (ankle.y - hip.y), 0, 1);
    const ahead = knee.x - THREE.MathUtils.lerp(hip.x, ankle.x, along);
    assert.ok(ahead > 0.02, `the ${k ? 'right' : 'left'} knee bends forward, ${mm(ahead)} ahead of the leg's line`);
  }
  // Up: the hips rise 0.25 to 0.35 m over where they stand, the soles clear the ground by 0.2 m or more, and both
  // hands are up over his head, clear of it.
  const top = frames.reduce((high, frame) => (frame.hips > high.hips ? frame : high));
  assert.ok(top.hips >= 0.25 && top.hips <= 0.35, `the hop rises ${mm(top.hips)}`);
  const clearance = Math.min(...top.feet.flatMap(f => f.sole.map(p => p.y)));
  assert.ok(clearance > 0.2, `the soles are ${mm(clearance)} off the ground at the top`);
  for (const [k, hand] of top.hands.entries()) {
    assert.ok(hand.y > top.head.y, `the ${k ? 'right' : 'left'} hand is up, ${mm(hand.y - top.head.y)} over the head's joint`);
    assert.ok(hand.distanceTo(top.head) > 0.12, `and clear of his head (${mm(hand.distanceTo(top.head))} from its joint)`);
  }
  // Down: a soft bounce, the knees giving a little after the landing and straightening again.
  const after = frames.slice(touchDown);
  const give = Math.min(...after.map(frame => frame.hips));
  assert.ok(give < -0.03 && give > -0.12, `the knees give ${mm(-give)} as he lands`);
  assert.ok(Math.abs(frames.at(-1).hips) < 1e-3, 'and he stands up straight again');
});

test('played by the actor, the hop leaves the ground once and sets each foot back down on the spot it left', async () => {
  // A clip that moves the legs gets them as it is (footing.js), so here the feet are the clip's, cross-fades and all:
  // on the ground they keep within the couple of millimetres that idle's and the wave's breathing moves the hips.
  const { egill } = await stage();
  for (let i = 0; i < 10; i++) egill.update(1 / 30);
  const feet = FEET.map(n => egill.model.getObjectByName(n));
  const read = () => {
    egill.root.updateMatrixWorld(true);
    return feet.map(f => egill.root.worldToLocal(f.getWorldPosition(new THREE.Vector3())));
  };
  const rest = read();
  const action = egill.play('hop', { fade: 0.12 });
  assert.equal(action.loop, THREE.LoopOnce, 'played once');
  const track = [];
  const frames = Math.ceil(action.getClip().duration * 30) + 5;
  for (let i = 0; i < frames; i++) { egill.update(1 / 30); track.push(read()); }
  // Then he waves, as he does in scene 2.
  egill.play('waveLeft', { fade: 0.3 });
  for (let i = 0; i < 60; i++) { egill.update(1 / 30); track.push(read()); }
  for (const k of [0, 1]) {
    const up = track.map(now => now[k].y - rest[k].y);
    const air = up.map((h, i) => (h > 3e-3 ? i : -1)).filter(i => i >= 0);
    assert.ok(air.length > 0 && air.at(-1) - air[0] + 1 === air.length, `${FEET[k]} leaves the ground once`);
    assert.ok(Math.max(...up) > 0.25, `${FEET[k]} rose ${mm(Math.max(...up))}`);
    assert.ok(Math.min(...up) > -3e-3, `${FEET[k]} sank ${mm(-Math.min(...up))} into the ground`);
    const onGround = i => i < air[0] || i > air.at(-1);
    let slide = 0;
    let off = 0;
    track.forEach((now, i) => {
      if (!onGround(i)) return;
      off = Math.max(off, Math.hypot(now[k].x - rest[k].x, now[k].z - rest[k].z));
      if (i > 0 && onGround(i - 1)) slide = Math.max(slide, Math.hypot(now[k].x - track[i - 1][k].x, now[k].z - track[i - 1][k].z));
    });
    assert.ok(off < 2e-3, `on the ground ${FEET[k]} kept within ${mm(off)} of the spot it stood on`);
    assert.ok(slide < 1e-3, `on the ground ${FEET[k]} slid ${mm(slide)} in a frame`);
  }
});

test('one and a half times the size, Egill strides in proportion on planted feet', async () => {
  // A copy scaled as a re-bake at that size would make him.
  const gltf = await loadGlb(new URL('../assets/characters/egill.glb', import.meta.url));
  gltf.scene.scale.setScalar(1.5);
  const { egill } = await stage(gltf);
  const watch = footWatch(egill);
  const spots = [];
  let last = null;
  const sample = () => {
    const now = watch.sample();
    now.forEach((foot, k) => { if (last && foot.down && !last[k].down) (spots[k] ||= []).push(foot.p.clone()); });
    last = now;
  };
  // Walking: a bigger child walks faster in proportion to the square root of his size.
  const walk = egill.walkTo([[5, 0]], { speed: 0.55 * Math.sqrt(1.5) });
  for (let i = 0; i < 600 && egill.root.position.x < 1; i++) egill.update(1 / 30);
  watch.start();
  for (let i = 0; i < 600 && egill.root.position.x < 3.5; i++) { egill.update(1 / 30); sample(); }
  assert.ok(watch.slide < 1e-3, `walking, a planted foot moved ${mm(watch.slide)} in a frame`);
  const strides = spots.flatMap(list => list.slice(1).map((p, i) => p.distanceTo(list[i])));
  assert.ok(strides.length >= 4, `${strides.length} strides`);
  for (const stride of strides) assert.ok(Math.abs(stride - 0.66) < 0.066, `a foot moved ${stride.toFixed(3)} m between plantings (0.44 m at his size)`);
  // Stopping, then turning on the spot.
  for (let i = 0; i < 600 && !walk.done; i++) { egill.update(1 / 30); sample(); }
  for (let i = 0; i < 60; i++) { egill.update(1 / 30); sample(); }
  assert.ok(watch.slide < 1e-3, `stopping, a planted foot moved ${mm(watch.slide)} in a frame`);
  const turn = egill.turnTo(90);
  for (let i = 0; i < 600 && (!turn.done || egill.stepping); i++) { egill.update(1 / 30); sample(); }
  assert.equal(turn.done, true);
  assert.equal(egill.stepping, false);
  assert.ok(watch.slide < 1e-3, `turning, a planted foot moved ${mm(watch.slide)} in a frame`);
});

test('a walk can head for a point spec, resolved when it starts', async () => {
  const { world, egill } = await stage();
  // A stand-in for another actor: a post at (3, 1) facing +Z (heading 90).
  const post = new THREE.Group();
  post.position.set(3, 0, 1);
  post.rotation.y = -Math.PI / 2;
  post.updateMatrixWorld(true);
  world.actors.set('post', {
    root: post,
    centre: out => out.copy(post.position).setY(0.5),
    headPosition: out => out.copy(post.position).setY(1),
  });
  // Half a metre in front of the post's head, in its own frame (x forward): the ground under (3, 1.5).
  const walk = egill.walkTo({ actor: 'post', part: 'head', offset: [0.5, 0, 0], local: true }, { speed: 0.6 });
  post.position.set(9, 0, 9); // moving it now does not move the goal
  for (let i = 0; i < 600 && !walk.done; i++) egill.update(1 / 30);
  assert.equal(walk.done, true);
  assert.ok(egill.root.position.distanceTo(new THREE.Vector3(3, 0, 1.5)) < 1e-3, `ended at ${egill.root.position.toArray().map(v => v.toFixed(3))}`);
  // Several points may mix pairs and specs.
  const back = egill.walkTo([[2, 2], 'post.feet'], { speed: 0.6 });
  for (let i = 0; i < 900 && !back.done; i++) egill.update(1 / 30);
  assert.ok(egill.root.position.distanceTo(new THREE.Vector3(9, 0, 9)) < 1e-3, `ended at ${egill.root.position.toArray().map(v => v.toFixed(3))}`);
});
