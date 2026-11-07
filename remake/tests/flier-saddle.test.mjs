// Flugeðla's saddle (engine/flier-saddle.js, fitted by tools/saddle-fit.mjs): a skinned mesh on her own bones that pops on with
// sparkles, and Egill rides on it, his bottom on its seat and his hands on its handlebar (engine/flier.js: rideFlier's saddle).
// The binding is tested on a few plain boxes fitted here (test data, never drawn in the game); the saddle the game draws, once its
// file is in assets/, is held to her skin in every pose she flies in with it on.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { mergeGeometries } from '../../dist/vendor/BufferGeometryUtils.js';
import { clone as cloneSkinned } from '../../dist/vendor/SkeletonUtils.js';
import { chapterWorld } from './chapter-harness.mjs';
import { loadCharacter, skinnedMeshOf } from './characters.mjs';
import { updateActors } from '../engine/actor.js';
import { createFlier, rideFlier } from '../engine/flier.js';
import { createFlierSaddle, SADDLE_MODEL } from '../engine/flier-saddle.js';
import { SIT_DEPTH } from '../engine/riding.js';
import { skinSurface } from '../engine/skin-surface.js';
import { createRoute, LEAP } from '../chapters/kafli4-route.js';
import { backFrame, fitSaddle, writeFitted, eachPose, checkInPoses, skinnedAt, PLACES } from '../tools/saddle-fit.mjs';

const DT = 1 / 30;
const world = await chapterWorld({
  look: 'lateMorning',
  actors: { flugedla: { url: '../assets/characters/pteranodon.glb' }, egill: { url: '../assets/characters/egill.glb' } },
});
const her = world.actors.get('flugedla');
const egill = world.actors.get('egill');
const route = createRoute();

// a few boxes and a bar, fitted to her back and written as the fit tool writes a saddle
const gltf = await loadCharacter('flugedla');
const scene = cloneSkinned(gltf.scene);
scene.updateMatrixWorld(true);
const mesh = skinnedMeshOf(scene);
const frame = backFrame(gltf, mesh);
const skin = skinSurface(mesh, { around: frame.seat, near: 1.4 });
const parts = [
  new THREE.BoxGeometry(0.5, 0.04, 0.5, 6, 1, 6).translate(0, -0.07, 0), // pad
  new THREE.BoxGeometry(0.3, 0.06, 0.2, 3, 1, 2).translate(0, -0.03, 0), // seat
  new THREE.CylinderGeometry(0.015, 0.015, 0.26, 6).rotateX(Math.PI / 2).translate(0.25, 0.17, 0), // handlebar
].map(g => g.toNonIndexed());
const geometry = mergeGeometries(parts);
const index = Array.from({ length: geometry.attributes.position.count }, (_, i) => i);
const fitted = fitSaddle({ positions: geometry.attributes.position.array, normals: geometry.attributes.normal.array, index }, skin, frame);
const names = mesh.skeleton.bones.map(b => b.name);
const used = [...new Set(fitted.weights.flatMap(w => [...w.keys()]))].sort((a, b) => a - b);
const named = w => Object.fromEntries([...w].map(([b, x]) => [names[b], x]));
const placeOf = local => { const { point, weights } = fitted.place(local); return { local, bind: point.toArray(), weights: named(weights) }; };
const places = { seat: placeOf(PLACES.seat) };
for (const part of ['grips', 'knees', 'ankles']) places[part] = { left: placeOf(PLACES[part].left), right: placeOf(PLACES[part].right) };
const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'flier-saddle-')), 'boxes.glb');
writeFitted(file, { glb: { json: {}, bin: Buffer.alloc(0) }, uvs: new Float32Array(index.length * 2), index, material: null }, fitted,
  { joints: used.map(b => names[b]), slot: new Map(used.map((b, k) => [b, k])), extras: { places } });
const boxes = createFlierSaddle(her, { url: pathToFileURL(file).href });
const loaded = await boxes.loaded;

/** Pose her in a clip at a time, as the game does (her model current). */
function pose(clip, time) {
  her.mixer.stopAllAction();
  her.mixer.clipAction(her.clips.get(clip)).play();
  her.mixer.setTime(time);
  world.scene.updateMatrixWorld(true);
}

test('the saddle loads onto her own skeleton, hidden until it is shown', () => {
  assert.equal(loaded, true);
  const saddle = boxes.mesh;
  assert.ok(saddle.isSkinnedMesh);
  const body = skinnedMeshOf(her.model);
  assert.equal(saddle.skeleton, body.skeleton, 'it moves with her bones, not a copy');
  assert.equal(saddle.visible, false);
  assert.equal(saddle.castShadow, false);
  let inModel = false;
  her.model.traverse(o => { if (o === saddle) inModel = true; });
  assert.ok(inModel, 'it is in her model: hidden with her, and drawn with her actor by the warm-ups');
  boxes.show();
  assert.equal(saddle.visible, true);
  boxes.hide();
});

test('drawn, it bends with her bones as the fit worked it out: the file names her bones', () => {
  const saddle = boxes.mesh;
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  for (const [clip, at] of [['fly', 0.3], ['glide', 1], ['idle', 0]]) {
    pose(clip, at);
    saddle.skeleton.update();
    const matrices = saddle.skeleton.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, saddle.skeleton.boneInverses[i]));
    let most = 0;
    for (let i = 0; i < fitted.positions.length; i += 7) {
      saddle.getVertexPosition(i, v).applyMatrix4(saddle.matrixWorld);
      skinnedAt(fitted.positions[i], fitted.weights[i], matrices, w);
      most = Math.max(most, v.distanceTo(w));
    }
    assert.ok(most < 1e-4, `${clip} ${at}: a vertex is ${most.toFixed(5)} m from where the fit puts it`);
  }
});

test('loaded while she is away from the middle of the world and turned, it is on her back where the fit put it', async () => {
  her.root.position.set(37, 4, -21);
  her.root.rotation.set(0, 1.1, 0.3);
  pose('glide', 1.5); // her world matrices as the page has them (three keeps her bindMatrixInverse as their inverse)
  const away = createFlierSaddle(her, { url: pathToFileURL(file).href });
  assert.equal(await away.loaded, true);
  pose('glide', 1.5);
  const saddle = away.mesh;
  saddle.skeleton.update();
  const matrices = saddle.skeleton.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, saddle.skeleton.boneInverses[i]));
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  let most = 0;
  for (let i = 0; i < fitted.positions.length; i += 7) {
    saddle.getVertexPosition(i, v).applyMatrix4(saddle.matrixWorld);
    most = Math.max(most, v.distanceTo(skinnedAt(fitted.positions[i], fitted.weights[i], matrices, w)));
  }
  assert.ok(most < 1e-4, `a vertex is ${most.toFixed(4)} m from where the fit puts it`);
  const at = away.update();
  const spine = her.model.getObjectByName('Spine').getWorldPosition(new THREE.Vector3());
  assert.ok(at.seat.distanceTo(spine) < 0.6, `the seat is ${at.seat.distanceTo(spine).toFixed(2)} m from her spine`);
  away.dispose();
  her.root.position.set(0, 0, 0);
  her.root.rotation.set(0, 0, 0);
});

test('its places (seat, grips) follow her as its vertices do', () => {
  pose('fly', 0.7);
  const at = boxes.update();
  const saddle = boxes.mesh;
  // the seat's place is on the seat's top: within a centimetre of the drawn saddle's surface
  const corner = i => saddle.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(saddle.matrixWorld);
  const tri = new THREE.Triangle();
  const on = new THREE.Vector3();
  let nearest = Infinity;
  for (let i = 0; i < saddle.geometry.attributes.position.count; i += 3) {
    tri.set(corner(i), corner(i + 1), corner(i + 2)).closestPointToPoint(at.seat, on);
    nearest = Math.min(nearest, on.distanceTo(at.seat));
  }
  assert.ok(nearest < 0.01, `the seat's place is ${nearest.toFixed(3)} m from the saddle`);
  // a grip on the bar: as far from the seat as in the saddle's own frame
  const local = new THREE.Vector3(...PLACES.grips.left);
  assert.ok(Math.abs(at.grips.left.distanceTo(at.seat) - local.length()) < 0.02, `the left grip is ${at.grips.left.distanceTo(at.seat).toFixed(3)} m from the seat`);
});

test('it pops on with sparkles over the seat, and has its full size when the pop is done', () => {
  const effects = world.effects;
  const before = effects.size ?? null;
  const handle = boxes.appear({ duration: 0.8 });
  assert.equal(boxes.mesh.visible, true);
  if (before !== null) assert.ok(effects.size > before, 'the pop and the sparkles run on world.effects');
  for (let t = 0; t < 1; t += DT) effects.update(DT);
  assert.equal(handle.done, true);
  boxes.hide();
});

test('on the saddle Egill sits on its seat and holds its bar, through the take-off and the flight', () => {
  boxes.show();
  const flier = createFlier(her, route, { world });
  const riding = rideFlier(egill, flier, { saddle: boxes });
  const hand = side => egill.model.getObjectByName(`${side}Hand`);
  let worstSeat = 0, worstHand = 0;
  for (let t = LEAP - 1; t <= LEAP + 8; t += DT) {
    flier.update(t);
    updateActors(world.actors.values(), DT);
    if (t < LEAP - 0.5) continue; // his hands go onto the bar over the ride's first 0.4 s
    world.scene.updateMatrixWorld(true);
    const at = boxes.update();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(egill.root.quaternion);
    const bottom = egill.root.position.clone().addScaledVector(up, SIT_DEPTH);
    worstSeat = Math.max(worstSeat, bottom.distanceTo(at.seat));
    for (const [side, grip] of [['Left', at.grips.left], ['Right', at.grips.right]]) {
      worstHand = Math.max(worstHand, hand(side).getWorldPosition(new THREE.Vector3()).distanceTo(grip));
    }
  }
  assert.ok(worstSeat < 0.02, `his bottom goes ${worstSeat.toFixed(3)} m from the seat`);
  assert.ok(worstHand < 0.08, `a wrist goes ${worstHand.toFixed(3)} m from its grip (5 cm behind and over the bar is his hand round it)`);
  riding.stop();
  flier.stop();
  boxes.hide();
});

// --- the saddle the game draws -------------------------------------------------------------------------------------------------
const real = fileURLToPath(SADDLE_MODEL);
const hasReal = fs.existsSync(real);

test('the game\'s saddle stays out of her skin in every pose she flies in with it on', { skip: hasReal ? false : `no ${path.basename(real)} yet (the owner's Tripo model, tools/saddle-fit.mjs)` }, async () => {
  const saddle = createFlierSaddle(her);
  assert.equal(await saddle.loaded, true);
  const geo = saddle.mesh.geometry;
  const positions = Array.from({ length: geo.attributes.position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(geo.attributes.position, i));
  const weights = positions.map((_, i) => new Map([0, 1, 2, 3].map(k => [geo.attributes.skinIndex.getComponent(i, k), geo.attributes.skinWeight.getComponent(i, k)]).filter(([, w]) => w > 0)));
  const rows = checkInPoses({ positions, weights, contact: new Uint8Array(positions.length) }, skin, visit => eachPose(gltf, scene, mesh, visit));
  for (const r of rows) {
    assert.ok(r.worst > -0.01, `${r.label}: a vertex is ${(-r.worst * 100).toFixed(1)} cm inside her`);
    assert.ok(r.inside <= positions.length * 0.01, `${r.label}: ${r.inside} of ${positions.length} vertices are inside her`);
  }
  saddle.dispose();
});

test('on the game\'s saddle Egill sits on its seat, holds its bar, and nothing of him goes into her: head, legs or feet', { skip: hasReal ? false : `no ${path.basename(real)} yet` }, async () => {
  const saddle = createFlierSaddle(her);
  assert.equal(await saddle.loaded, true);
  saddle.show();
  const flier = createFlier(her, route, { world });
  const riding = rideFlier(egill, flier, { saddle });
  const body = skinnedMeshOf(her.model);
  const boy = skinnedMeshOf(egill.model);
  const herSkin = skinSurface(body, { around: frame.seat, near: 2.2 });
  const v = new THREE.Vector3();
  const now = [];
  // inside her by the crossings of rays through her whole posed body (the closest-point side test errs where sheets meet)
  const inside = p => {
    const geo = body.geometry;
    now.length = 0;
    for (let i = 0; i < geo.attributes.position.count; i++) now.push(body.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(body.matrixWorld));
    const hit = new THREE.Vector3();
    return [[0.1, 1, 0.05], [1, 0.1, -0.2], [-0.2, -0.3, 1]].filter(d => {
      const ray = new THREE.Ray(p, new THREE.Vector3(...d).normalize());
      let n = 0;
      for (let f = 0; f < geo.index.count; f += 3) if (ray.intersectTriangle(now[geo.index.getX(f)], now[geo.index.getX(f + 1)], now[geo.index.getX(f + 2)], false, hit)) n++;
      return n % 2 === 1;
    }).length >= 2;
  };
  const moments = new Set([LEAP - 0.5, LEAP + 0.6, LEAP + 1.4, LEAP + 3, LEAP + 6, 40, 41, 60, 80].map(t => Math.round(t / DT)));
  const problems = [];
  for (let k = 0; k <= Math.max(...moments); k++) {
    const t = k * DT;
    flier.update(t);
    updateActors(world.actors.values(), DT);
    if (!moments.has(k)) continue;
    world.scene.updateMatrixWorld(true);
    herSkin.pose();
    const at = saddle.update();
    const turn = riding.frame(new THREE.Quaternion());
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(turn);
    const ahead = new THREE.Vector3(1, 0, 0).applyQuaternion(turn);
    const across = new THREE.Vector3(0, 0, 1).applyQuaternion(turn);
    boy.skeleton.update();
    let bottom = Infinity, deepest = null;
    for (let i = 0; i < boy.geometry.attributes.position.count; i++) {
      boy.getVertexPosition(i, v).applyMatrix4(boy.matrixWorld);
      const d = v.clone().sub(at.seat);
      if (Math.abs(d.dot(across)) < 0.08 && Math.abs(d.dot(ahead)) < 0.08) bottom = Math.min(bottom, d.dot(up));
      const c = herSkin.closest(v, { reach: 0.1 });
      if (c && c.distance < -0.015 && (!deepest || c.distance < deepest.distance)) deepest = { distance: c.distance, at: v.clone() };
    }
    if (bottom < -0.015 || bottom > 0.03) problems.push(`t=${t.toFixed(1)}: his bottom is ${(bottom * 100).toFixed(1)} cm over the seat`);
    if (deepest && inside(deepest.at)) problems.push(`t=${t.toFixed(1)}: he is ${(-deepest.distance * 100).toFixed(1)} cm inside her`);
    for (const [side, grip] of [['Left', at.grips.left], ['Right', at.grips.right]]) {
      const off = egill.model.getObjectByName(`${side}Hand`).getWorldPosition(new THREE.Vector3()).distanceTo(grip);
      if (off > 0.07) problems.push(`t=${t.toFixed(1)}: his ${side.toLowerCase()} wrist is ${(off * 100).toFixed(1)} cm from its grip`);
    }
  }
  riding.stop();
  flier.stop();
  saddle.dispose();
  assert.deepEqual(problems, []);
});
