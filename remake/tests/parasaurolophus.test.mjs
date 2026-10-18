import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { clone as cloneSkinned } from '../../dist/vendor/SkeletonUtils.js';
import { createActor } from '../engine/actor.js';
import { emptyWorld, loadCharacter, readGlb, skinnedMeshOf } from './characters.mjs';

// Slóeðla the Parasaurolophus as baked by remake/tools/bake/bake-quadruped.js (kind=hadrosaur, then
// the face and mouth passes), read without textures (no DOM in Node).
const gltfPromise = loadCharacter('sloedla');
const NECK = ['Neck', 'Neck2', 'Neck3'];
const TAIL = Array.from({ length: 6 }, (_, i) => `Tail${i + 1}`);
const CHAIN = ['Hips', 'Spine', 'Chest', ...NECK, 'Head', ...TAIL];
const LEGS = ['BackLegL', 'BackFootL', 'BackLegR', 'BackFootR', 'FrontLegL', 'FrontFootL', 'FrontLegR', 'FrontFootR'];
const BONES = ['root', ...CHAIN, ...LEGS, 'Jaw'];
const FEET = ['FrontFootL', 'FrontFootR', 'BackFootL', 'BackFootR'];
const CLIPS = ['call', 'eat', 'happy', 'idle', 'kink', 'walk'];

// A copy of Slóeðla in the bind pose (the loaded scene itself is never posed).
async function model() {
  const gltf = await gltfPromise;
  const scene = cloneSkinned(gltf.scene);
  return { gltf, scene, mesh: skinnedMeshOf(scene), clip: name => gltf.animations.find(c => c.name === name) };
}

async function stage() {
  const world = emptyWorld();
  const sloedla = await createActor(world, { name: 'sloedla', gltf: await gltfPromise });
  world.actors.set('sloedla', sloedla);
  return { world, sloedla };
}

// The share of a vertex the given bones carry.
function carried(mesh, i, bones) {
  const { skinIndex, skinWeight } = mesh.geometry.attributes;
  const ids = bones.map(n => mesh.skeleton.bones.findIndex(b => b.name === n));
  let w = 0;
  for (let k = 0; k < 4; k++) if (ids.includes(skinIndex.getComponent(i, k))) w += skinWeight.getComponent(i, k);
  return w;
}

// Follows the feet frame by frame from start(), as Kambeðla's and Þórseðla's tests do: the most a foot
// moved along the ground between two frames in which it was down (within 1 mm of its bind-pose
// height), how often a foot lifted, how far a planted foot got from its rest spot, and where each foot
// was set down.
function footWatch(actor) {
  const feet = FEET.map(n => actor.model.getObjectByName(n));
  const read = () => {
    actor.root.updateMatrixWorld(true);
    return feet.map(f => f.getWorldPosition(new THREE.Vector3()));
  };
  const rest = read().map(p => actor.root.worldToLocal(p.clone()));
  let last = null;
  const watch = {
    slide: 0, lifts: 0, reach: 0, spots: [],
    start() { last = null; watch.slide = 0; watch.lifts = 0; watch.reach = 0; watch.spots = []; return watch.sample(); },
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
        if (foot.down && !last[k].down) (watch.spots[k] ||= []).push(foot.p.clone());
      });
      last = now;
      return now;
    },
  };
  return watch;
}
const mm = metres => `${(metres * 1000).toFixed(1)} mm`;

// Width and height of a JPEG from its start-of-frame marker.
function jpegSize(bytes) {
  for (let i = 2; i < bytes.length;) {
    const marker = bytes.readUInt16BE(i);
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xffc0 && marker <= 0xffcf && ![0xffc4, 0xffc8, 0xffcc].includes(marker)) {
      return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

// The pose of every bone (world positions) at time t of a clip.
function poseAt(scene, clip, t) {
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(clip).play();
  mixer.setTime(t);
  scene.updateMatrixWorld(true);
  const out = [];
  scene.traverse(o => { if (o.isBone) out.push(o.getWorldPosition(new THREE.Vector3())); });
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
  return out;
}
const gap = (a, b) => Math.max(...a.map((p, i) => p.distanceTo(b[i])));
const loops = (scene, clip) => gap(poseAt(scene, clip, 0), poseAt(scene, clip, clip.duration - 1e-4));

// The tip of her bill: the furthest vertex forward that the Head bone carries alone.
function billTip(mesh) {
  const position = mesh.geometry.attributes.position;
  let tip = -1;
  for (let i = 0; i < position.count; i++) if (carried(mesh, i, ['Head']) > 0.999 && (tip < 0 || position.getX(i) > position.getX(tip))) tip = i;
  return tip;
}
const worldOf = (mesh, i) => mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
const pitchOf = bone => THREE.MathUtils.radToDeg(Math.asin(new THREE.Vector3(1, 0, 0).applyQuaternion(bone.getWorldQuaternion(new THREE.Quaternion())).y));

test('Slóeðla has the hadrosaur skeleton, her clips and fits the budget', async () => {
  const { gltf, mesh } = await model();
  assert.deepEqual(mesh.skeleton.bones.map(b => b.name), BONES);
  // Identity rest rotations: clips turn bones about the character's own axes.
  for (const bone of mesh.skeleton.bones) assert.ok(bone.quaternion.angleTo(new THREE.Quaternion()) < 1e-6, `${bone.name} is turned at rest`);
  const clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
  assert.deepEqual(Object.keys(clips).sort(), CLIPS);
  for (const clip of Object.values(clips)) {
    const animated = new Set(clip.tracks.map(t => t.name.split('.')[0]));
    for (const bone of CHAIN) assert.ok(animated.has(bone), `${clip.name} leaves ${bone} alone`);
    // Only the walk and happy move the legs: in the others footing keeps the feet where they stand.
    const legs = ['walk', 'happy'].includes(clip.name);
    for (const bone of LEGS) assert.equal(animated.has(bone), legs, `${clip.name} ${legs ? 'leaves' : 'moves'} ${bone}`);
    // Grazing and the call open the bill (the mouth pass made their jaw tracks); every clip loops.
    assert.equal(animated.has('Jaw'), ['eat', 'call'].includes(clip.name), `${clip.name} and the jaw`);
    assert.ok(!clip.userData.once, `${clip.name} plays once`);
  }
  assert.ok(mesh.geometry.index.count / 3 <= 40000, `${mesh.geometry.index.count / 3} triangles`);
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  assert.ok(Math.abs(box.max.x - box.min.x - 7.5) < 0.01, `${(box.max.x - box.min.x).toFixed(3)} m from nose to tail tip`);
  assert.ok(box.max.y > 4 && box.max.y < 4.3, `the top of her crest is ${box.max.y.toFixed(2)} m up`);
  assert.ok(Math.abs(box.min.y) < 0.005, 'stands on the ground');

  const { glb, jsonLength, json } = readGlb('sloedla');
  assert.equal(json.meshes.length, 1, 'one skinned mesh');
  assert.equal(json.materials.length, 1);
  const material = json.materials[0];
  assert.ok(!material.doubleSided, 'single-sided');
  assert.ok(Math.abs(material.pbrMetallicRoughness.roughnessFactor - 0.62) < 0.01);
  assert.equal(material.pbrMetallicRoughness.metallicFactor ?? 1, 0);
  assert.ok(material.normalTexture.scale <= 0.6, 'the normal map is softened');
  assert.equal(material.pbrMetallicRoughness.metallicRoughnessTexture, undefined);
  const bin = glb.subarray(20 + jsonLength + 8);
  assert.equal(json.images.length, 2, 'two maps: base colour and normal');
  for (const image of json.images) {
    const view = json.bufferViews[image.bufferView];
    assert.equal(image.mimeType, 'image/jpeg');
    assert.deepEqual(jpegSize(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)), { width: 1024, height: 1024 });
  }
});

test('the neck and tail are chains of joints along their middle, the head turning at the back of the skull', async () => {
  const { scene, mesh } = await model();
  scene.updateMatrixWorld(true);
  const at = name => scene.getObjectByName(name).getWorldPosition(new THREE.Vector3());
  // The neck rises from the chest to the head, each joint further forward and higher than the last.
  const neck = ['Chest', ...NECK, 'Head'].map(at);
  for (let i = 1; i < neck.length; i++) {
    assert.ok(neck[i].x > neck[i - 1].x && neck[i].y > neck[i - 1].y, `neck joint ${i} does not follow the neck`);
    const step = neck[i].distanceTo(neck[i - 1]);
    assert.ok(step > 0.2 && step < 0.35, `neck joint ${i} is ${step.toFixed(2)} m from the last`);
  }
  // The head's joint is at the back of the skull, where the neck meets it: well behind her eyes and
  // under the back of her crest, so the crest's whole base is in front of it.
  const head = neck.at(-1);
  const eyes = mesh.userData.face.eyes.map(e => new THREE.Vector3(...e.centre).applyMatrix4(mesh.matrixWorld));
  for (const eye of eyes) assert.ok(eye.x > head.x + 0.5, `an eye is ${(eye.x - head.x).toFixed(2)} m in front of the head's joint`);
  const position = mesh.geometry.attributes.position;
  let crestBack = Infinity;
  for (let i = 0; i < position.count; i++) if (position.getY(i) > 3.3 && position.getY(i) < 3.45) crestBack = Math.min(crestBack, position.getX(i));
  assert.ok(Math.abs(crestBack - head.x) < 0.1, `the crest's base starts ${(crestBack - head.x).toFixed(2)} m from the head's joint`);
  assert.ok(head.y > 2.5 && head.y < 2.9, `the head's joint is ${head.y.toFixed(2)} m up`);
  // The tail runs back from the hips to near its tip.
  const tail = ['Hips', ...TAIL].map(at);
  for (let i = 1; i < tail.length; i++) assert.ok(tail[i].x < tail[i - 1].x - 0.4, `tail joint ${i} is not behind the last`);
  assert.ok(tail.at(-1).x < -4, `the last tail joint is at x ${tail.at(-1).x.toFixed(2)}`);
  // Every joint lies on the middle line.
  for (const p of [...neck, ...tail]) assert.ok(Math.abs(p.z) < 1e-6);
});

test('every vertex weight sums to one, her crest rides her head and her toenails her feet', async () => {
  const { mesh } = await model();
  const w = mesh.geometry.attributes.skinWeight;
  for (let i = 0; i < w.count; i++) {
    const sum = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i);
    assert.ok(Math.abs(sum - 1) < 1e-3, `vertex ${i} sums to ${sum}`);
  }
  const pos = mesh.geometry.attributes.position;
  let crest = 0, ground = 0;
  for (let i = 0; i < pos.count; i++) {
    // Above her skull (3.45 m) there is only the crest, and the Head bone carries it alone, so it never
    // bends when she nods, grazes or calls.
    if (pos.getY(i) > 3.45) {
      crest++;
      assert.ok(carried(mesh, i, ['Head']) > 0.999, `crest vertex ${i} is not carried by the head alone`);
    }
    // Near the ground (the toenails and the soles) the foot bone carries each vertex alone.
    if (pos.getY(i) < 0.15) {
      ground++;
      const foot = FEET.find(n => carried(mesh, i, [n]) > 0.999);
      assert.ok(foot, `vertex ${i} at (${pos.getX(i).toFixed(2)}, ${pos.getY(i).toFixed(2)}, ${pos.getZ(i).toFixed(2)}) is not carried by a foot`);
    }
  }
  assert.ok(crest > 800, `${crest} vertices of crest`);
  assert.ok(ground > 500, `${ground} vertices near the ground`);
});

test('away from the mouth the welded skin is closed and consistently wound', async () => {
  const { mesh } = await model();
  const pos = mesh.geometry.attributes.position;
  const ids = new Map();
  const rep = new Int32Array(pos.count);
  const key = i => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const weights = [mesh.geometry.attributes.skinIndex, mesh.geometry.attributes.skinWeight];
  let seamWeights = 0;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    if (!ids.has(k)) ids.set(k, i);
    rep[i] = ids.get(k);
    // Both sides of a seam carry the same weights, so the seam stays closed when skinned (the mouth
    // pass gave the lips copies of their own).
    if (rep[i] !== i && carried(mesh, i, ['Head', 'Jaw']) < 0.5) {
      for (const attr of weights) for (let c = 0; c < 4; c++) seamWeights = Math.max(seamWeights, Math.abs(attr.getComponent(i, c) - attr.getComponent(rep[i], c)));
    }
  }
  assert.ok(seamWeights < 1e-6, `the two sides of a seam differ in weight by ${seamWeights}`);
  const edges = new Map();
  const index = mesh.geometry.index;
  for (let t = 0; t < index.count; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = rep[index.getX(t + e)], b = rep[index.getX(t + (e + 1) % 3)];
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      const edge = edges.get(k) || { n: 0, turn: 0, a, b };
      edge.n++;
      edge.turn += a < b ? 1 : -1;
      edges.set(k, edge);
    }
  }
  // The open lips and the pocket inside the mouth are on the head: everywhere else every edge is
  // shared by two triangles that run it in opposite directions.
  const head = i => carried(mesh, i, ['Head', 'Jaw']) > 0.9;
  const bad = [...edges.values()].filter(e => (e.n !== 2 || e.turn !== 0) && !(head(e.a) && head(e.b)));
  assert.equal(bad.length, 0, `${bad.length} edges off the head are open, shared by more than two triangles or wound against each other`);
});

test('her face takes its own column of the texture', async () => {
  const { mesh } = await model();
  const { uv, position } = mesh.geometry.attributes;
  const eyes = mesh.userData.face.eyes.map(e => new THREE.Vector3(...e.centre));
  const p = new THREE.Vector3();
  let face = 0, faceRight = 0, back = 0, backLeft = 0;
  for (let i = 0; i < uv.count; i++) {
    p.fromBufferAttribute(position, i);
    const pocket = uv.getX(i) < 0.08 && uv.getY(i) < 0.08; // the mouth's pocket, painted into a free corner
    if (!pocket && carried(mesh, i, ['Head', 'Jaw']) > 0.999 && eyes.some(e => e.distanceTo(p) < 0.3)) { face++; if (uv.getX(i) > 0.75) faceRight++; }
    if (p.x < 1) { back++; if (uv.getX(i) <= 0.751) backLeft++; }
  }
  // The skin round her eyes maps to the right-hand quarter, drawn there from the 2048 px source at
  // about one and a half times its old size; everything behind her neck keeps to the rest.
  assert.ok(face > 500 && faceRight === face, `${faceRight} of ${face} vertices round the eyes map to the right-hand column`);
  assert.equal(backLeft, back, 'the body maps to the left');
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
      if (w > 0.999 && pos.getY(i) < 0.02) sole.push(i);
    }
    return { bone, sole, rest: bone.getWorldPosition(new THREE.Vector3()) };
  });
  assert.ok(feet.every(f => f.sole.length > 20), 'each foot has a sole');

  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(walk).play();
  const steps = Math.round(walk.duration * 60); // 60 samples a second
  const dt = walk.duration / steps;
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
  // A calm walk: two or three feet down at a time.
  assert.ok(speeds.length > steps * 2, `a foot is down for ${speeds.length} of ${4 * steps} samples`);
  const speed = speeds.reduce((sum, v) => sum + v, 0) / speeds.length;
  assert.ok(speed >= 0.95 && speed <= 1.15, `walks at ${speed.toFixed(3)} m/s`);
  assert.ok(walk.duration > 2.3, `a stride takes ${walk.duration.toFixed(2)} s`);
  const spread = Math.max(...speeds.map(v => Math.abs(v - speed)));
  assert.ok(spread < 0.01 * speed, `a planted foot moves back at ${speed.toFixed(3)} m/s, give or take ${spread.toFixed(4)}`);

  // Walk the body at that speed: no part of a sole that touches the ground moves along it, the sole
  // never sinks, and a foot whose ankle is down stands flat.
  let skid = 0, sink = 0, tilt = 0, last = null;
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), ankle = new THREE.Vector3();
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
          if (p.y < 0.003 && before.y < 0.003) skid = Math.max(skid, Math.hypot(p.x - before.x, p.z - before.z));
        });
      }
      if (Math.abs(f.bone.getWorldPosition(ankle).y - f.rest.y) < 5e-4) {
        tilt = Math.max(tilt, THREE.MathUtils.radToDeg(f.bone.getWorldQuaternion(q).angleTo(new THREE.Quaternion())));
      }
    });
    last = now;
  }
  scene.position.x = 0;
  assert.ok(skid < 1e-3, `a sole on the ground moved ${mm(skid)} in 1/60 s`);
  assert.ok(sink < 2e-3, `a sole sank ${mm(sink)} into the ground`);
  assert.ok(tilt < 1, `a planted foot was tilted ${tilt.toFixed(1)} degrees`);
});

test('the actor measures her walking speed from the walk clip', async () => {
  const { sloedla } = await stage();
  const walk = sloedla.walkTo([[12, 0]], { speed: 1 });
  assert.ok(sloedla.gait && sloedla.gait.naturalSpeed >= 0.95 && sloedla.gait.naturalSpeed <= 1.15, JSON.stringify(sloedla.gait && { speed: sloedla.gait.naturalSpeed }));
  for (let i = 0; i < 900 && !walk.done; i++) sloedla.update(1 / 30);
  assert.equal(walk.done, true);
  assert.ok(sloedla.root.position.distanceTo(new THREE.Vector3(12, 0, 0)) < 1e-3);
});

test('walking, a planted foot stays put and strides are the clip\'s own', async () => {
  for (const speed of [0.8, 1.0, 1.3]) {
    const { sloedla } = await stage();
    const watch = footWatch(sloedla);
    const walk = sloedla.walkTo([[50, 0]], { speed });
    for (let i = 0; i < 1200 && sloedla.root.position.x < 3; i++) sloedla.update(1 / 30);
    watch.start();
    for (let i = 0; i < 2400 && sloedla.root.position.x < 24; i++) { sloedla.update(1 / 30); watch.sample(); }
    assert.equal(walk.done, false);
    assert.ok(watch.lifts >= 20, `${watch.lifts} steps at ${speed} m/s`);
    assert.ok(watch.slide < 1e-3, `at ${speed} m/s a planted foot moved ${mm(watch.slide)} in a frame`);
    const strides = watch.spots.flatMap(list => list.slice(1).map((p, i) => p.distanceTo(list[i])));
    for (const stride of strides) assert.ok(Math.abs(stride - sloedla.gait.naturalSpeed * sloedla.gait.cycle) < 0.1, `a foot moved ${stride.toFixed(2)} m between plantings`);
  }
});

test('a walk starts without dragging a foot or reaching too far', async () => {
  // From the bind pose, and from wherever a turn on the spot left the feet.
  for (const turnFirst of [null, -40]) {
    const { sloedla } = await stage();
    const watch = footWatch(sloedla);
    if (turnFirst !== null) {
      const turn = sloedla.turnTo(turnFirst);
      for (let i = 0; i < 900 && (!turn.done || sloedla.stepping); i++) sloedla.update(1 / 30);
    }
    const h = THREE.MathUtils.degToRad(sloedla.heading);
    const walk = sloedla.walkTo([[12 * Math.cos(h), 12 * Math.sin(h)]], { speed: 1 });
    watch.start();
    for (let i = 0; i < 180 && !walk.done; i++) { sloedla.update(1 / 30); watch.sample(); }
    assert.ok(watch.lifts >= 4, 'the feet step');
    assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
    assert.ok(watch.reach < 1.4, `a planted foot was ${watch.reach.toFixed(2)} m from its rest spot`);
  }
});

test('stopping keeps the planted feet where they are and brings the lifted ones down', async () => {
  for (const goal of [9, 10, 11]) { // different points of the stride
    const { sloedla } = await stage();
    const watch = footWatch(sloedla);
    const walk = sloedla.walkTo([[goal, 0]], { speed: 1 });
    for (let i = 0; i < 1200 && !walk.done; i++) {
      sloedla.update(1 / 30);
      if (sloedla.root.position.x > goal - 2) watch.sample(); // the last two metres, then the stop
    }
    assert.equal(walk.done, true);
    for (let i = 0; i < 150; i++) { sloedla.update(1 / 30); watch.sample(); }
    assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
    assert.ok(watch.sample().every(foot => foot.down), 'every foot is down five seconds after the stop');
    assert.equal(sloedla.stepping, false);
  }
});

test('turning on the spot, a foot that is down stays put and the feet step around', async () => {
  for (const goal of [75, 180]) {
    const { sloedla } = await stage();
    const watch = footWatch(sloedla);
    for (let i = 0; i < 10; i++) sloedla.update(1 / 30);
    watch.start();
    const turn = sloedla.turnTo(goal);
    for (let i = 0; i < 1200 && (!turn.done || sloedla.stepping); i++) { sloedla.update(1 / 30); watch.sample(); }
    assert.equal(turn.done, true);
    assert.equal(sloedla.stepping, false);
    assert.ok(Math.abs(sloedla.heading - goal) < 1.5, `heading ${sloedla.heading}`);
    assert.ok(watch.lifts >= 4, `${watch.lifts} steps`);
    assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
  }
});

test('on a curve the planted feet stay put and within reach', async () => {
  const { sloedla } = await stage();
  const watch = footWatch(sloedla);
  // A quarter circle of 8 m radius between two straights.
  const rad = THREE.MathUtils.degToRad;
  const arc = [30, 60, 90].map(a => [4 + 8 * Math.sin(rad(a)), 8 * (1 - Math.cos(rad(a)))]);
  const walk = sloedla.walkTo([[4, 0], ...arc, [12, 14]], { speed: 1 });
  watch.start();
  for (let i = 0; i < 2400 && !walk.done; i++) { sloedla.update(1 / 30); watch.sample(); }
  assert.equal(walk.done, true);
  assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
  assert.ok(watch.reach < 1.5, `a planted foot was ${watch.reach.toFixed(2)} m from its rest spot`);
});

test('idle, the nod, grazing and the call leave the planted feet where they stand', async () => {
  for (const clip of ['idle', 'kink', 'eat', 'call']) {
    const { sloedla } = await stage();
    const watch = footWatch(sloedla);
    const turn = sloedla.turnTo(50);
    for (let i = 0; i < 900 && (!turn.done || sloedla.stepping); i++) sloedla.update(1 / 30);
    const before = watch.start().map(foot => foot.p.clone());
    sloedla.play(clip);
    for (let i = 0; i < 180; i++) { sloedla.update(1 / 30); watch.sample(); }
    const after = watch.sample();
    assert.ok(watch.slide < 1e-3, `${clip}: a planted foot moved ${mm(watch.slide)} in a frame`);
    after.forEach((foot, k) => assert.ok(foot.p.distanceTo(before[k]) < 1e-3, `${clip}: a foot moved ${mm(foot.p.distanceTo(before[k]))}`));
  }
});

test('the nod dips the head and brings it back', async () => {
  const { scene, clip } = await model();
  const kink = clip('kink');
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(kink).play();
  const head = scene.getObjectByName('Head');
  const pitchAt = t => {
    mixer.setTime(t);
    scene.updateMatrixWorld(true);
    return pitchOf(head);
  };
  const pitches = Array.from({ length: 49 }, (_, i) => pitchAt((i / 48) * kink.duration));
  assert.ok(Math.min(...pitches) < -15, `the head dips ${Math.min(...pitches).toFixed(1)} degrees at most`);
  assert.ok(Math.abs(pitches[0]) < 1 && Math.abs(pitches.at(-1)) < 1, 'it starts and ends looking ahead');
});

test('grazing, the tip of her bill comes down to the grass in front of her feet, crops and goes back up', async () => {
  const { scene, mesh, clip } = await model();
  const eat = clip('eat');
  assert.ok(eat.duration >= 3 && eat.duration <= 4.5, `eat lasts ${eat.duration} s`);
  assert.ok(loops(scene, eat) < 0.005, 'eat loops');
  const tip = billTip(mesh);
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(eat).play();
  const jaw = scene.getObjectByName('Jaw');
  let low = null, opened = 0, neckLow = Infinity;
  const neckBones = NECK.map(n => scene.getObjectByName(n));
  for (let i = 0; i <= 72; i++) {
    mixer.setTime((i / 72) * eat.duration);
    scene.updateMatrixWorld(true);
    const p = worldOf(mesh, tip);
    if (!low || p.y < low.y) low = p;
    opened = Math.max(opened, THREE.MathUtils.radToDeg(jaw.quaternion.angleTo(new THREE.Quaternion())));
    for (const b of neckBones) neckLow = Math.min(neckLow, b.getWorldPosition(new THREE.Vector3()).y);
  }
  const fore = scene.getObjectByName('FrontFootL').getWorldPosition(new THREE.Vector3());
  assert.ok(low.y > 0.05 && low.y < 0.25, `the tip of her bill comes down to ${low.y.toFixed(2)} m`);
  assert.ok(low.x > fore.x + 0.6, `it is ${(low.x - fore.x).toFixed(2)} m ahead of the fore feet`);
  assert.ok(Math.abs(low.z) < 0.05, 'straight ahead of her');
  assert.ok(neckLow > 1, `her neck's joints stay ${neckLow.toFixed(2)} m up`);
  // The bill opens a little before each crop and as she chews.
  assert.ok(opened > 5 && opened < 9, `her bill opens ${opened.toFixed(1)} degrees`);
});

test('calling, she fills her chest, raises her head with the crest lying back and opens her bill', async () => {
  const { scene, mesh, clip } = await model();
  const call = clip('call');
  assert.ok(call.duration >= 4 && call.duration <= 6, `the call lasts ${call.duration} s`);
  assert.ok(loops(scene, call) < 0.005, 'the call loops');
  const tip = billTip(mesh);
  scene.updateMatrixWorld(true);
  const rest = worldOf(mesh, tip);
  // The crest (above the skull) and her back (the skin the head and neck bones leave alone).
  const position = mesh.geometry.attributes.position;
  const crest = [], back = [];
  for (let i = 0; i < position.count; i += 2) {
    if (position.getY(i) > 3.45) crest.push(i);
    else if (carried(mesh, i, ['Head', 'Jaw', ...NECK]) < 0.01 && position.getY(i) > 2.3) back.push(i);
  }
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(call).play();
  const head = scene.getObjectByName('Head'), spine = scene.getObjectByName('Spine'), jaw = scene.getObjectByName('Jaw');
  let pitch = -Infinity, rise = -Infinity, fill = 1, opened = 0, clear = Infinity, scale = 0;
  const s = new THREE.Vector3(), t = new THREE.Vector3(), r = new THREE.Quaternion();
  for (let i = 0; i <= 50; i++) {
    mixer.setTime((i / 50) * call.duration);
    scene.updateMatrixWorld(true);
    pitch = Math.max(pitch, pitchOf(head));
    rise = Math.max(rise, worldOf(mesh, tip).y - rest.y);
    fill = Math.max(fill, spine.scale.x);
    opened = Math.max(opened, THREE.MathUtils.radToDeg(jaw.quaternion.angleTo(new THREE.Quaternion())));
    head.matrixWorld.decompose(t, r, s);
    scale = Math.max(scale, Math.abs(s.x - 1), Math.abs(s.y - 1), Math.abs(s.z - 1));
    if (i % 5 === 0) {
      const c = crest.map(j => worldOf(mesh, j)), b = back.map(j => worldOf(mesh, j));
      for (const p of c) for (const q of b) clear = Math.min(clear, p.distanceToSquared(q));
    }
  }
  assert.ok(pitch > 25 && pitch < 40, `her head rises ${pitch.toFixed(1)} degrees`);
  assert.ok(rise > 0.6, `the tip of her bill rises ${rise.toFixed(2)} m`);
  // The chest fills: the Spine bone grows by about 6 % and the head keeps its size.
  assert.ok(fill > 1.04 && fill < 1.08, `her chest grows to ${fill.toFixed(3)}`);
  assert.ok(scale < 1e-4, `her head's size changes by ${scale}`);
  assert.ok(opened > 7 && opened < 11, `her bill opens ${opened.toFixed(1)} degrees`);
  assert.ok(Math.sqrt(clear) > 0.1, `the crest comes within ${Math.sqrt(clear).toFixed(2)} m of her back`);
});

test('happy, she rears so that her front feet leave the ground, and lands on them again', async () => {
  const { scene, clip } = await model();
  const happy = clip('happy');
  assert.ok(loops(scene, happy) < 0.005, 'happy loops');
  const feet = FEET.map(n => scene.getObjectByName(n));
  scene.updateMatrixWorld(true);
  const rest = feet.map(f => f.getWorldPosition(new THREE.Vector3()));
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(happy).play();
  let top = 0, hind = 0, air = 0;
  for (let i = 0; i <= 96; i++) {
    mixer.setTime((i / 96) * happy.duration);
    scene.updateMatrixWorld(true);
    const lift = feet.map((f, k) => f.getWorldPosition(new THREE.Vector3()).distanceTo(rest[k]));
    top = Math.max(top, Math.min(lift[0], lift[1]));
    hind = Math.max(hind, lift[2], lift[3]);
    if (Math.min(lift[0], lift[1]) > 0.05) air++;
  }
  assert.ok(top > 0.25 && top < 0.7, `her front feet leave the ground by ${(top * 100).toFixed(1)} cm`);
  assert.ok(hind < 0.02, `a hind foot moved ${(hind * 100).toFixed(1)} cm`);
  assert.ok(air >= 15, `the front feet are up for ${air} of 97 samples`);
  // In a scene the clip takes the legs, and back in idle the feet stand where they rest.
  const { sloedla } = await stage();
  const watch = footWatch(sloedla);
  watch.start();
  sloedla.play('happy');
  let lifted = false;
  for (let i = 0; i < 72; i++) { sloedla.update(1 / 30); const now = watch.sample(); lifted ||= !now[0].down && !now[1].down; }
  sloedla.play('idle');
  for (let i = 0; i < 45; i++) sloedla.update(1 / 30);
  assert.ok(lifted, 'the front feet left the ground in the scene');
  assert.ok(watch.sample().every(foot => foot.down && foot.reach < 0.01), 'and stand on their rest spots again');
});

test('the mouth pass gave her a jaw: it drops when she talks and the bill above stays', async () => {
  const { scene, mesh } = await model();
  scene.updateMatrixWorld(true);
  const jaw = scene.getObjectByName('Jaw');
  assert.equal(jaw?.parent?.name, 'Head');
  assert.deepEqual(mesh.userData.face.mouth, { talk: 8 });
  const k = mesh.skeleton.bones.indexOf(jaw);
  const { skinIndex, skinWeight, position } = mesh.geometry.attributes;
  const jawCarried = [];
  for (let i = 0; i < position.count; i++) {
    let w = 0;
    for (let c = 0; c < 4; c++) if (skinIndex.getComponent(i, c) === k) w += skinWeight.getComponent(i, c);
    if (w > 0.9) jawCarried.push(i);
  }
  assert.ok(jawCarried.length > 300, `the jaw carries ${jawCarried.length} vertices`);
  const at = i => worldOf(mesh, i);
  const nose = billTip(mesh); // the tip of her upper bill
  const chin = jawCarried.reduce((a, b) => (at(b).x > at(a).x ? b : a));
  const before = [at(nose), at(chin)];
  jaw.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, -1).applyQuaternion(jaw.parent.getWorldQuaternion(new THREE.Quaternion()).invert()), THREE.MathUtils.degToRad(8));
  scene.updateMatrixWorld(true);
  assert.ok(at(nose).distanceTo(before[0]) < 1e-6, 'the tip of the bill moved');
  assert.ok(before[1].y - at(chin).y > 0.06, `the chin dropped ${(before[1].y - at(chin).y).toFixed(3)} m`);

  // Talking, the actor opens it by face.mouth.talk at the loudest.
  const quiet = (await stage()).sloedla, loud = (await stage()).sloedla;
  loud.talk({ mouth: 'ffffffffffffffffffffffffffffff', duration: 1.5 });
  for (let i = 0; i < 20; i++) { quiet.update(1 / 30); loud.update(1 / 30); }
  const a = loud.model.getObjectByName('Jaw').quaternion, b = quiet.model.getObjectByName('Jaw').quaternion;
  const opened = THREE.MathUtils.radToDeg(a.angleTo(b));
  assert.ok(opened > 6 && opened < 8.5, `her jaw opened ${opened.toFixed(1)} degrees`);
});
