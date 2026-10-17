import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { clone as cloneSkinned } from '../../dist/vendor/SkeletonUtils.js';
import { createActor } from '../engine/actor.js';
import { emptyWorld, loadCharacter, readGlb, skinnedMeshOf } from './characters.mjs';

// Uggeðla the Spinosaurus as baked by remake/tools/bake/bake-tailed-biped.js (her legs and arms one part
// each, a sail on her back, the neck and head turned to face forward; then the face and mouth passes),
// read without textures (no DOM in Node).
const gltfPromise = loadCharacter('uggedla');
const TAIL = Array.from({ length: 6 }, (_, i) => `Tail${i + 1}`);
const BONES = ['root', 'Hips', 'Spine', 'Chest', 'Neck', 'Head', ...TAIL,
  'LeftThigh', 'LeftShin', 'LeftFoot', 'RightThigh', 'RightShin', 'RightFoot',
  'LeftUpperArm', 'LeftLowerArm', 'LeftHand', 'RightUpperArm', 'RightLowerArm', 'RightHand', 'Jaw'];
const CLIPS = ['happy', 'idle', 'kink', 'wade', 'walk'];
// The bones her sail may follow: the back below it and the tail's root, never the neck or a limb.
const BACK = ['Hips', 'Spine', 'Chest', 'Tail1', 'Tail2', 'Tail3'];

// A copy of Uggeðla in the bind pose (the loaded scene itself is never posed).
async function model() {
  const gltf = await gltfPromise;
  const scene = cloneSkinned(gltf.scene);
  return { gltf, scene, mesh: skinnedMeshOf(scene), clip: name => gltf.animations.find(c => c.name === name) };
}

// The share of a vertex the given bones carry.
function carried(mesh, i, bones) {
  const { skinIndex, skinWeight } = mesh.geometry.attributes;
  const ids = bones.map(n => mesh.skeleton.bones.findIndex(b => b.name === n));
  let w = 0;
  for (let k = 0; k < 4; k++) if (ids.includes(skinIndex.getComponent(i, k))) w += skinWeight.getComponent(i, k);
  return w;
}
const worldOf = (mesh, i) => mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);

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

// Plays a clip on a copy and calls look(t) at `steps` + 1 times over it.
function over(scene, clip, steps, look) {
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(clip).play();
  for (let i = 0; i <= steps; i++) {
    mixer.setTime((i / steps) * clip.duration);
    scene.updateMatrixWorld(true);
    look((i / steps) * clip.duration, i);
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
}

// The tip of her snout: the furthest vertex forward that the Head bone carries alone.
function snoutTip(mesh) {
  const position = mesh.geometry.attributes.position;
  let tip = -1;
  for (let i = 0; i < position.count; i++) if (carried(mesh, i, ['Head']) > 0.999 && (tip < 0 || position.getX(i) > position.getX(tip))) tip = i;
  return tip;
}

test('Uggeðla has the tailed-biped skeleton with identity rest rotations and her five clips', async () => {
  const { gltf, mesh } = await model();
  assert.deepEqual(mesh.skeleton.bones.map(b => b.name), BONES);
  for (const bone of mesh.skeleton.bones) assert.ok(bone.quaternion.angleTo(new THREE.Quaternion()) < 1e-6, `${bone.name} has a rest rotation`);
  assert.deepEqual(gltf.animations.map(c => c.name).sort(), CLIPS);
  for (const clip of gltf.animations) {
    // Every clip animates every bone, so no turn is left behind when clips cross-fade; the jaw only
    // talking opens.
    const animated = new Set(clip.tracks.map(t => t.name.split('.')[0]));
    for (const bone of BONES.slice(1, -1)) assert.ok(animated.has(bone), `${clip.name} leaves ${bone} alone`);
    assert.ok(!animated.has('Jaw'), `${clip.name} opens the jaw`);
    assert.ok(!clip.userData.once, `${clip.name} plays once`);
  }
  assert.equal(mesh.userData.face.mouth.talk, 6, 'her jaw opens 6 degrees at the loudest syllable');
});

test('she is 14 m long, 7.3 m to the top of her sail, stands on the ground and fits the budget', async () => {
  const { mesh } = await model();
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  assert.ok(Math.abs(box.max.x - box.min.x - 14) < 0.01, `length ${(box.max.x - box.min.x).toFixed(3)}`);
  assert.ok(box.max.y > 7.1 && box.max.y < 7.5, `the top of her sail is ${box.max.y.toFixed(2)} m up`);
  assert.ok(Math.abs(box.min.y) < 0.005, 'stands on the ground');
  assert.ok(mesh.geometry.index.count / 3 <= 40000, `${mesh.geometry.index.count / 3} triangles`);
  // One single-sided matte material with two 1024 px JPEG maps (colour and normal); the sail is a closed
  // shell in the one closed skin, so it shows from both sides.
  const { glb, jsonLength, json } = readGlb('uggedla');
  assert.equal(json.meshes.length, 1, 'one skinned mesh');
  assert.equal(json.materials.length, 1);
  const material = json.materials[0];
  assert.ok(!material.doubleSided, 'single-sided');
  assert.ok(Math.abs(material.pbrMetallicRoughness.roughnessFactor - 0.62) < 0.005);
  assert.equal(material.pbrMetallicRoughness.metallicFactor, 0);
  assert.equal(material.pbrMetallicRoughness.metallicRoughnessTexture, undefined);
  const bin = glb.subarray(20 + jsonLength + 8);
  assert.equal(json.images.length, 2, 'two maps: base colour and normal');
  for (const image of json.images) {
    const view = json.bufferViews[image.bufferView];
    assert.equal(image.mimeType, 'image/jpeg');
    assert.deepEqual(jpegSize(bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength)), { width: 1024, height: 1024 });
  }
});

test('every vertex weight sums to one, the head rides its bone whole and the sail its back', async () => {
  const { scene, mesh } = await model();
  scene.updateMatrixWorld(true);
  const w = mesh.geometry.attributes.skinWeight;
  for (let i = 0; i < w.count; i++) {
    const sum = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i);
    assert.ok(Math.abs(sum - 1) < 1e-3, `vertex ${i} sums to ${sum}`);
  }
  const pos = mesh.geometry.attributes.position;
  const eyes = mesh.userData.face.eyes.map(e => new THREE.Vector3(...e.centre));
  const front = Math.min(...eyes.map(e => e.x)) - 0.3;
  // The back beside the sail: its highest point away from the midline.
  let backTop = 0;
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getZ(i)) > 0.45 && pos.getX(i) > -0.5 && pos.getX(i) < 2) backTop = Math.max(backTop, pos.getY(i));
  let head = 0, sail = 0;
  for (let i = 0; i < pos.count; i++) {
    // From just behind her eyes to the tip of her snout the head (and the jaw the mouth pass cut) carry
    // every vertex alone: the long snout never bends.
    if (pos.getX(i) > front && pos.getY(i) > 4) {
      head++;
      assert.ok(carried(mesh, i, ['Head', 'Jaw']) > 0.999, `vertex ${i} at x ${pos.getX(i).toFixed(2)} is not carried by the head alone`);
    }
    // The sail above her back follows the back below it and the tail's root only.
    if (pos.getY(i) > backTop + 0.4 && pos.getX(i) > -4.3 && pos.getX(i) < 2.3) {
      sail++;
      assert.ok(carried(mesh, i, BACK) > 0.995, `sail vertex ${i} at (${pos.getX(i).toFixed(2)}, ${pos.getY(i).toFixed(2)}) follows another bone`);
    }
  }
  assert.ok(head > 2000, `${head} vertices of head in front of the eyes`);
  assert.ok(sail > 1500, `${sail} vertices of sail`);
});

test('her neck and head face forward: the eyes either side of her middle, the snout on it', async () => {
  const { scene, mesh } = await model();
  scene.updateMatrixWorld(true);
  const eyes = mesh.userData.face.eyes.map(e => new THREE.Vector3(...e.centre).applyMatrix4(mesh.matrixWorld));
  assert.ok(Math.abs(eyes[0].z + eyes[1].z) < 0.06, `the eyes sit ${(eyes[0].z + eyes[1].z).toFixed(3)} m off her middle`);
  assert.ok(Math.abs(eyes[0].x - eyes[1].x) < 0.06, `one eye is ${Math.abs(eyes[0].x - eyes[1].x).toFixed(3)} m ahead of the other`);
  const tip = worldOf(mesh, snoutTip(mesh));
  assert.ok(Math.abs(tip.z) < 0.08, `the snout's tip is ${tip.z.toFixed(3)} m off her middle`);
  // The head turns about the top of its neck, behind the eyes; the neck's joint is lower down the neck.
  const at = name => scene.getObjectByName(name).getWorldPosition(new THREE.Vector3());
  const [chest, neck, head] = ['Chest', 'Neck', 'Head'].map(at);
  assert.ok(neck.x > chest.x && head.x > neck.x && head.y > neck.y, 'the neck rises forward from the chest to the head');
  for (const eye of eyes) assert.ok(eye.x > head.x + 0.5, `an eye is ${(eye.x - head.x).toFixed(2)} m in front of the head's joint`);
});

test('her sail never stretches or folds, whatever she does', async () => {
  const { gltf, scene, mesh } = await model();
  scene.updateMatrixWorld(true);
  const pos = mesh.geometry.attributes.position, idx = mesh.geometry.index.array;
  let backTop = 0;
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getZ(i)) > 0.45 && pos.getX(i) > -0.5 && pos.getX(i) < 2) backTop = Math.max(backTop, pos.getY(i));
  const upper = new Set();
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) > backTop + 0.4 && pos.getX(i) > -4.3 && pos.getX(i) < 2.3) upper.add(i);
  const tris = [];
  for (let t = 0; t < idx.length; t += 3) if (upper.has(idx[t]) && upper.has(idx[t + 1]) && upper.has(idx[t + 2])) tris.push(t);
  // The top edge: the highest vertex in every 10 cm along her.
  const bins = new Map();
  for (const i of upper) { const b = Math.round(pos.getX(i) * 10); if (!bins.has(b) || pos.getY(i) > pos.getY(bins.get(b))) bins.set(b, i); }
  const edge = [...bins.keys()].sort((a, b) => a - b).map(b => bins.get(b));
  const read = () => { const P = new Map(); for (const i of upper) P.set(i, worldOf(mesh, i)); return P; };
  const length = P => edge.slice(1).reduce((sum, i, k) => sum + P.get(i).distanceTo(P.get(edge[k])), 0);
  const normal = (P, t) => P.get(idx[t + 1]).clone().sub(P.get(idx[t])).cross(P.get(idx[t + 2]).clone().sub(P.get(idx[t])));
  const edges = [...new Set(tris.flatMap(t => [0, 1, 2].map(e => [idx[t + e], idx[t + ((e + 1) % 3)]].sort((a, b) => a - b).join(','))))].map(k => k.split(',').map(Number));
  const rest = read();
  const restLength = length(rest);
  const restNormals = tris.map(t => normal(rest, t));
  const restEdges = edges.map(([a, b]) => rest.get(a).distanceTo(rest.get(b)));
  assert.ok(edge.length > 40 && tris.length > 2500, `${edge.length} points along the top, ${tris.length} triangles`);
  for (const clip of gltf.animations) {
    let lo = Infinity, hi = 0, turned = 0;
    const stretch = [];
    over(scene, clip, 24, () => {
      const P = read();
      const r = length(P) / restLength;
      lo = Math.min(lo, r);
      hi = Math.max(hi, r);
      // A sliver of a triangle turns over at a hair's move; the sail's own triangles never do.
      tris.forEach((t, k) => { if (restNormals[k].length() > 1e-4 && normal(P, t).dot(restNormals[k]) < 0) turned++; });
      edges.forEach(([a, b], k) => stretch.push(P.get(a).distanceTo(P.get(b)) / restEdges[k]));
    });
    stretch.sort((a, b) => a - b);
    assert.ok(lo > 0.98 && hi < 1.02, `${clip.name}: the sail's top edge is ${(100 * (lo - 1)).toFixed(1)} to +${(100 * (hi - 1)).toFixed(1)} % of its length`);
    assert.equal(turned, 0, `${clip.name}: ${turned} sail triangles turn over`);
    // Its skin: all but the odd edge in a hundred keep their length within 3 %.
    const p1 = stretch[Math.floor(0.01 * stretch.length)], p99 = stretch[Math.floor(0.99 * stretch.length)];
    assert.ok(p1 > 0.97 && p99 < 1.03, `${clip.name}: the sail's edges stretch by x${p1.toFixed(3)} to x${p99.toFixed(3)}`);
  }
});

test('standing, nodding and bouncing, her feet stay planted', async () => {
  const { scene, clip } = await model();
  scene.updateMatrixWorld(true);
  const feet = ['LeftFoot', 'RightFoot'].map(n => scene.getObjectByName(n));
  const rest = feet.map(f => f.getWorldPosition(new THREE.Vector3()));
  for (const name of ['idle', 'kink', 'happy']) {
    let worst = 0;
    over(scene, clip(name), 72, () => feet.forEach((f, k) => { worst = Math.max(worst, f.getWorldPosition(new THREE.Vector3()).distanceTo(rest[k])); }));
    assert.ok(worst < 0.005, `${name}: a foot moved ${worst.toFixed(4)} m`);
  }
});

test('her friendly nod dips the head twice and comes back to rest', async () => {
  const { scene, clip } = await model();
  const kink = clip('kink');
  const head = scene.getObjectByName('Head');
  const pitch = () => THREE.MathUtils.radToDeg(Math.asin(new THREE.Vector3(1, 0, 0).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion())).y));
  const pitches = [];
  over(scene, kink, 96, () => pitches.push(pitch()));
  // Dips: local lows of the head's pitch more than 10 degrees below rest.
  const dips = pitches.filter((p, i) => i > 0 && i < pitches.length - 1 && p < pitches[i - 1] && p <= pitches[i + 1] && p < -10);
  assert.equal(dips.length, 2, `the head dips ${dips.length} times (${pitches.map(p => p.toFixed(0)).join(' ')})`);
  assert.ok(dips[0] < dips[1], 'the second nod is the smaller');
  assert.ok(Math.abs(pitches[0]) < 0.5 && Math.abs(pitches.at(-1)) < 0.5, 'the nod starts and ends at rest');
});

test('happy, she bobs twice on bent knees with the tail swishing, and the bounce loops', async () => {
  const { scene, clip } = await model();
  const happy = clip('happy');
  const hips = scene.getObjectByName('Hips');
  const tip = scene.getObjectByName('Tail6');
  const heights = [], sideways = [];
  let first = null, last = null;
  over(scene, happy, 96, (t, i) => {
    heights.push(hips.getWorldPosition(new THREE.Vector3()).y);
    sideways.push(tip.getWorldPosition(new THREE.Vector3()).z);
    const pose = [];
    scene.traverse(o => { if (o.isBone) pose.push(o.getWorldPosition(new THREE.Vector3())); });
    if (i === 0) first = pose;
    last = pose;
  });
  const top = Math.max(...heights);
  const lows = heights.filter((h, i) => i > 0 && i < heights.length - 1 && h < heights[i - 1] && h <= heights[i + 1] && h < top - 0.05);
  assert.equal(lows.length, 2, `the hips dip ${lows.length} times`);
  const swish = Math.max(...sideways) - Math.min(...sideways);
  assert.ok(swish > 0.5, `the tail's tip swishes ${swish.toFixed(2)} m from side to side`);
  assert.ok(Math.max(...first.map((p, i) => p.distanceTo(last[i]))) < 0.005, 'happy loops');
});

test('wading, she is lower, the snout held low over the water and the tail sweeping', async () => {
  const { scene, mesh, clip } = await model();
  const tipIndex = snoutTip(mesh);
  const hips = scene.getObjectByName('Hips');
  const tail = scene.getObjectByName('Tail6');
  const hipsIn = name => { let sum = 0, n = 0; over(scene, clip(name), 48, () => { sum += hips.getWorldPosition(new THREE.Vector3()).y; n++; }); return sum / n; };
  const lower = hipsIn('walk') - hipsIn('wade');
  assert.ok(lower > 0.1, `wading she is ${lower.toFixed(2)} m lower than walking`);
  let highest = 0, lowest = Infinity;
  const sideways = [];
  over(scene, clip('wade'), 48, () => {
    const y = worldOf(mesh, tipIndex).y;
    highest = Math.max(highest, y);
    lowest = Math.min(lowest, y);
    sideways.push(tail.getWorldPosition(new THREE.Vector3()).z);
  });
  // At rest the snout's tip is 4.7 m up; wading it hangs about 1.8 to 2 m up.
  assert.ok(highest < 2.2 && lowest > 1.5, `the snout's tip goes from ${lowest.toFixed(2)} to ${highest.toFixed(2)} m up`);
  const sweep = Math.max(...sideways) - Math.min(...sideways);
  assert.ok(sweep > 0.8, `the tail's last joint sweeps ${sweep.toFixed(2)} m from side to side`);
});

// In a scene: the engine's actor, with footing planting her feet (jointed legs, as Grameðla's).
async function stage() {
  const world = emptyWorld();
  const uggedla = await createActor(world, { name: 'uggedla', gltf: await gltfPromise });
  world.actors.set('uggedla', uggedla);
  return uggedla;
}

// Follows the feet frame by frame, as Grameðla's test does: the most a foot moved along the ground
// between two frames in which it was down (its heel within 1 mm of its bind-pose height), how often a
// foot lifted, and whether each knee stayed in front of the line from hip to heel. Make it while the
// legs are still in the bind pose.
function footWatch(actor) {
  const bones = side => ['Thigh', 'Shin', 'Foot'].map(n => actor.model.getObjectByName(`${side}${n}`));
  const legs = [bones('Left'), bones('Right')];
  const local = bone => actor.root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
  const read = () => { actor.root.updateMatrixWorld(true); return legs.map(([hip, knee, heel]) => ({ hip: local(hip), knee: local(knee), heel: local(heel), world: heel.getWorldPosition(new THREE.Vector3()) })); };
  const rest = read().map(leg => leg.heel.y);
  let last = null;
  const watch = {
    slide: 0, lifts: 0, kneeBack: false,
    start() { last = null; watch.slide = 0; watch.lifts = 0; watch.kneeBack = false; return watch.sample(); },
    sample() {
      const now = read().map((leg, k) => {
        const toHeel = leg.heel.clone().sub(leg.hip), toKnee = leg.knee.clone().sub(leg.hip);
        if (toHeel.x * toKnee.y - toHeel.y * toKnee.x <= 0) watch.kneeBack = true;
        return { p: leg.world, down: leg.heel.y - rest[k] < 0.001 };
      });
      now.forEach((foot, k) => {
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

test('when she talks her jaw opens a little and shuts again', async () => {
  const uggedla = await stage();
  const jaw = uggedla.model.getObjectByName('Jaw');
  for (let i = 0; i < 10; i++) uggedla.update(1 / 30);
  uggedla.talk({ text: 'Halló! Ég heiti Uggeðla og ég elska vatnið.', duration: 3 });
  let widest = 0;
  for (let i = 0; i < 90; i++) {
    uggedla.update(1 / 30);
    widest = Math.max(widest, THREE.MathUtils.radToDeg(jaw.quaternion.angleTo(new THREE.Quaternion())));
  }
  assert.ok(widest > 3 && widest <= 6.01, `the jaw opens ${widest.toFixed(1)} degrees`);
  for (let i = 0; i < 60; i++) uggedla.update(1 / 30);
  assert.ok(THREE.MathUtils.radToDeg(jaw.quaternion.angleTo(new THREE.Quaternion())) < 0.1, 'the jaw is shut after the line');
});

test('the actor measures her calm walking speed from the walk clip', async () => {
  const uggedla = await stage();
  uggedla.walkTo([[30, 0]], { speed: 1 });
  assert.ok(uggedla.gait && Math.abs(uggedla.gait.naturalSpeed - 1.143) < 0.01, JSON.stringify(uggedla.gait && { speed: uggedla.gait.naturalSpeed, duty: uggedla.gait.duty }));
});

test('walking at a calm pace, a planted foot stays put and the knees bend forward', async () => {
  for (const speed of [0.8, 1, 1.143]) {
    const uggedla = await stage();
    const watch = footWatch(uggedla);
    const walk = uggedla.walkTo([[40, 0]], { speed });
    for (let i = 0; i < 900 && uggedla.root.position.x < 3; i++) uggedla.update(1 / 30);
    watch.start();
    for (let i = 0; i < 900 && uggedla.root.position.x < 22; i++) { uggedla.update(1 / 30); watch.sample(); }
    assert.equal(walk.done, false);
    assert.ok(watch.lifts >= 8, `${watch.lifts} steps at ${speed} m/s`);
    assert.ok(watch.slide < 1e-3, `at ${speed} m/s a planted foot moved ${mm(watch.slide)} in a frame`);
    assert.equal(watch.kneeBack, false, `at ${speed} m/s a knee bent backwards`);
  }
});

test('a walk starts and stops without dragging a foot', async () => {
  for (const goal of [10, 11.5]) { // two different points of the stride
    const uggedla = await stage();
    const watch = footWatch(uggedla);
    const walk = uggedla.walkTo([[goal, 0]], { speed: 1.143 });
    watch.start();
    for (let i = 0; i < 900 && !walk.done; i++) { uggedla.update(1 / 30); watch.sample(); }
    assert.equal(walk.done, true);
    for (let i = 0; i < 150; i++) { uggedla.update(1 / 30); watch.sample(); }
    assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
    assert.ok(watch.sample().every(foot => foot.down), 'both feet are down five seconds after the stop');
    assert.equal(uggedla.stepping, false);
    assert.equal(watch.kneeBack, false, 'a knee bent backwards');
  }
});

test('turning on the spot, a planted foot stays put and the feet step around', async () => {
  const uggedla = await stage();
  const watch = footWatch(uggedla);
  for (let i = 0; i < 10; i++) uggedla.update(1 / 30);
  watch.start();
  const turn = uggedla.turnTo(90);
  for (let i = 0; i < 1200 && !turn.done; i++) { uggedla.update(1 / 30); watch.sample(); }
  assert.equal(turn.done, true);
  assert.ok(Math.abs(uggedla.heading - 90) < 1.5, `heading ${uggedla.heading}`);
  for (let i = 0; i < 240 && uggedla.stepping; i++) { uggedla.update(1 / 30); watch.sample(); }
  assert.equal(uggedla.stepping, false);
  assert.ok(watch.lifts >= 3, `${watch.lifts} steps`);
  assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
  assert.equal(watch.kneeBack, false, 'a knee bent backwards');
});

test('she wades along a path at her slow wading pace, each planted foot holding still', async () => {
  const uggedla = await stage();
  const watch = footWatch(uggedla);
  const wade = uggedla.walkTo([[6, 2], [12, 0]], { speed: 0.5, clip: 'wade' });
  watch.start();
  let wading = false;
  for (let i = 0; i < 1800 && !wade.done; i++) {
    uggedla.update(1 / 30);
    watch.sample();
    if (uggedla.mixer.existingAction(uggedla.clips.get('wade'))?.getEffectiveWeight() === 1) wading = true;
  }
  assert.equal(wade.done, true, 'she gets there');
  assert.ok(wading, 'the wade clip plays');
  for (let i = 0; i < 150; i++) { uggedla.update(1 / 30); watch.sample(); }
  assert.ok(watch.lifts >= 6, `${watch.lifts} steps`);
  assert.ok(watch.slide < 1e-3, `a planted foot moved ${mm(watch.slide)} in a frame`);
  assert.equal(watch.kneeBack, false, 'a knee bent backwards');
  assert.equal(uggedla.stepping, false);
  // The walk's own gait is still the walk's.
  assert.ok(uggedla.gait === undefined || Math.abs(uggedla.gait.naturalSpeed - 1.143) < 0.01);
});
