// Grameðla's life in chapter 6 (chapters/kafli6-gramedla.js) and the tools of her body it stands on: the lean she bows, tilts and
// sniffs with (engine/pose/lean.js, moved from Grameðla kemur!'s pose.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { createActor } from '../engine/actor.js';
import { createPointResolver } from '../engine/points.js';
import { createLean, LEAN } from '../engine/pose/lean.js';

// Grameðla's model, read without textures (no DOM in Node), as tests/trex.test.mjs reads it.
const glb = fs.readFileSync(new URL('../assets/characters/trex.glb', import.meta.url));
function loadTrex() {
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
async function gramedla(heading = 90) {
  const world = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000), heightAt: () => 0, actors: new Map() };
  world.resolvePoint = createPointResolver(world);
  const rex = await createActor(world, { name: 'gramedla', gltf: await loadTrex(), position: [0, 0, 0], heading });
  world.actors.set('gramedla', rex);
  return rex;
}
const BENT = ['Spine', 'Chest', 'Neck', 'Head'];
const quats = rex => BENT.map(n => rex.model.getObjectByName(n).quaternion.clone());
// how far apart two turns are, componentwise (the clips' quaternions are float32, a hair off unit length, so angleTo reads noise)
const off = (a, b) => Math.min(...[1, -1].map(s => Math.max(...['x', 'y', 'z', 'w'].map(c => Math.abs(a[c] - s * b[c])))));
const feet = rex => ['LeftFoot', 'RightFoot'].map(n => rex.model.getObjectByName(n).getWorldPosition(new THREE.Vector3()));

test('createLean at theta 0 leaves her as her clip has her; at 0.8 her snout is lower and further forward, her feet where they were', async () => {
  const rex = await gramedla(30);
  for (let i = 0; i < 20; i++) rex.update(1 / 30);
  rex.root.updateMatrixWorld(true);
  const lean = createLean(rex);
  assert.deepEqual(Object.keys(LEAN), ['Spine', 'Chest', 'Neck']);
  const clip = quats(rex), feet0 = feet(rex), snout0 = lean.snout();
  lean.set({ theta: 0 });
  rex.root.updateMatrixWorld(true);
  quats(rex).forEach((q, i) => assert.ok(off(q, clip[i]) < 1e-6, `${BENT[i]} turned at theta 0`));
  assert.ok(lean.snout().distanceTo(snout0) < 1e-6);
  lean.set({ theta: 0.8 });
  rex.root.updateMatrixWorld(true);
  const snout = lean.snout();
  const ahead = new THREE.Vector3(1, 0, 0).applyQuaternion(rex.root.quaternion).setY(0).normalize();
  assert.ok(snout.y < snout0.y - 0.5, `her snout went down only ${(snout0.y - snout.y).toFixed(2)} m`);
  assert.ok(snout.clone().sub(snout0).dot(ahead) > 0.2, 'her snout went forward');
  feet(rex).forEach((p, i) => assert.ok(p.distanceTo(feet0[i]) < 1e-9, 'a foot moved'));
  // turn, roll and pitch move the head only
  const neck = rex.model.getObjectByName('Neck').quaternion.clone();
  lean.set({ theta: 0.8, turn: 0.3, roll: 0.2, pitch: 0.1 });
  assert.ok(off(rex.model.getObjectByName('Neck').quaternion, neck) < 1e-9, 'the head\'s turns moved the neck');
  assert.ok(lean.snout().distanceTo(snout) > 0.1, 'the head did not turn');
  // released, she is as her clip has her
  lean.release();
  quats(rex).forEach((q, i) => assert.ok(off(q, clip[i]) < 1e-6, `${BENT[i]} not let go`));
});

test('the lean laid on every frame does not add up: 200 frames at theta 0.5 give the pose of one', async () => {
  for (const frozen of [false, true]) { // her clip running, and held still (the mixer then leaves her bones alone)
    const [a, b] = [await gramedla(), await gramedla()];
    for (const rex of [a, b]) if (frozen) rex.mixer.timeScale = 0;
    const leanA = createLean(a), leanB = createLean(b);
    const how = { theta: 0.5, turn: 0.2, roll: 0.1, pitch: -0.1 };
    for (let i = 0; i < 200; i++) {
      a.update(1 / 30);
      leanA.set(how);
      b.update(1 / 30);
    }
    leanB.set(how);
    const qa = quats(a), qb = quats(b);
    qa.forEach((q, i) => assert.ok(off(q, qb[i]) < 1e-6, `${frozen ? 'held' : 'running'}: ${BENT[i]} is ${off(q, qb[i])} off the pose of one lean`));
    a.root.updateMatrixWorld(true);
    b.root.updateMatrixWorld(true);
    assert.ok(leanA.snout().distanceTo(leanB.snout()) < 1e-4);
  }
});

// Her life (kafli6-gramedla.js gramedlaLife) on the game clock: a scheduler as the scene's, her overlay and the effects ------------
async function herLife(heading = 0) {
  const { createActor: make, updateActors } = await import('../engine/actor.js');
  const { createEffects } = await import('../engine/effects.js');
  const { createScheduler, wait, all, race, until } = await import('../engine/scene/scheduler.js');
  const { gramedlaLife } = await import('../chapters/kafli6-gramedla.js');
  const world = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000), heightAt: () => 0, actors: new Map(), effects: createEffects() };
  world.resolvePoint = createPointResolver(world);
  const her = await make(world, { name: 'gramedla', gltf: await loadTrex(), position: [0, 0, 0], heading });
  world.actors.set('gramedla', her);
  const scheduler = createScheduler({ onError: error => { throw error; } });
  const s = { wait, all, race, until, after: (d, item) => scheduler.start((function* after() { yield wait(d); return yield (typeof item === 'function' ? item() : item); })()) };
  const falls = [], log = [];
  const c = { gramedla: { raw: her }, world, footfall: d => falls.push({ at: scheduler.time, ...d }), sfx: () => {}, log: e => log.push({ at: scheduler.time, ...e }), meet: { stand: { x: 0, z: 0, heading } } };
  const life = gramedlaLife(s, c);
  const clips = [];
  const play = her.play;
  her.play = (name, options) => { clips.push({ at: scheduler.time, name }); return play(name, options); };
  // the game's order (main.js update): the scene, the actors, the effects
  let walking = false;
  const frame = (dt = 1 / 30) => {
    scheduler.update(dt);
    updateActors(world.actors.values(), dt);
    world.effects.update(dt);
    if (her.walking && !walking) clips.push({ at: scheduler.time, name: 'walk' }); // her walks start inside the actor
    walking = her.walking;
  };
  const until_ = (t, dt = 1 / 30) => { while (scheduler.time < t - 1e-9) frame(dt); };
  return { her, life, frame, to: until_, scheduler, falls, log, clips, world, c };
}
const STAND = { x: 0, z: 0, heading: 0 };

test('B6: a wrong tap at 2.7 s, in her 3.4 s roar, roars again and her step waits for that roar to end', async () => {
  const { HER } = await import('../chapters/kafli6-gramedla.js');
  const { life, to, clips, falls } = await herLife();
  life.shape(1, 'left', STAND);
  to(2.7);
  life.shape(1, 'left', STAND); // she answers again where she stands
  to(2.7 + HER.roar + 0.05);
  const after = clips.filter(k => k.at > 2.7 + 1e-6);
  // her second roar is not cut: nothing plays over it before it ends, then her step
  assert.ok(!after.some(k => k.at < 2.7 + HER.roar - 1e-6), `her second roar was cut at ${after.map(k => `${k.at.toFixed(2)} ${k.name}`).join(', ')}`);
  to(12);
  assert.equal(falls.length, 1, 'one thud for her one step');
  assert.ok(falls[0].at > 2.7 + HER.roar, `her thud came at ${falls[0].at.toFixed(2)} s`);
});

test('B6: the untouched answer keeps its times: the roar 3.4 s, then the step, its thud 1.1 s in', async () => {
  const { HER, SHAPE } = await import('../chapters/kafli6-gramedla.js');
  const { life, to, clips, falls } = await herLife();
  life.shape(2, 'ahead', STAND);
  to(10);
  assert.equal(falls.length, 1);
  assert.ok(Math.abs(falls[0].at - (HER.roar + SHAPE.footfall)) < 1 / 30 + 1e-6, `her thud at ${falls[0].at.toFixed(3)} s`);
  assert.ok(clips.some(k => k.name === 'walk' && Math.abs(k.at - HER.roar) < 1 / 30 + 1e-6), 'her step at the roar\'s end');
});

test('B6: hidden, stepped out or disposed in her roar, nothing she had scheduled comes after', async () => {
  const { HER, SHAPE, STEP_OUT } = await import('../chapters/kafli6-gramedla.js');
  for (const how of ['hide', 'stepOut', 'dispose', 'hide in the step']) {
    const { life, to, clips, falls, scheduler } = await herLife();
    life.shape(1, 'right', STAND);
    const at = how === 'hide in the step' ? HER.roar + 0.5 : 2;
    to(at);
    if (how === 'stepOut') scheduler.run(life.stepOut());
    else if (how === 'dispose') life.dispose();
    else life.hide();
    to(at + 8);
    // stepping out she stands (idle) and walks out of the white herself: only her old roar's end (idle) may not come in it
    const walked = at + STEP_OUT.fadeIn + STEP_OUT.from / STEP_OUT.speed;
    const late = clips.filter(k => k.at > at + 1e-6 && (how !== 'stepOut' || (k.name === 'idle' && k.at > at + 0.1 && k.at < walked - 0.1)));
    assert.deepEqual(late.map(k => k.name), [], `${how}: her clips after it: ${late.map(k => `${k.at.toFixed(2)} ${k.name}`).join(', ')}`);
    const thuds = falls.filter(f => f.round !== undefined);
    assert.deepEqual(thuds, [], `${how}: the call's thud came after it`);
    if (how === 'stepOut') assert.equal(falls.filter(f => f.tremble).length, STEP_OUT.footfalls.length, 'stepping out has its own two thuds');
    void SHAPE;
  }
});

test('B7: her roar of yes ends when its blow gives nothing back', async () => {
  const { life, to, scheduler } = await herLife();
  life.show();
  for (const blow of [() => null, () => undefined, null]) {
    const task = scheduler.run(life.roarYes({ blow }));
    to(scheduler.time + 8);
    assert.equal(task.done, true, `roarYes with blow ${String(blow)} hung`);
  }
  // a Handle it waits for
  const { Handle } = await import('../engine/handle.js');
  const h = new Handle('blow');
  const task = scheduler.run(life.roarYes({ blow: () => h }));
  to(scheduler.time + 8);
  assert.equal(task.done, false, 'it waits for the blow');
  h.finish();
  to(scheduler.time + 0.1);
  assert.equal(task.done, true);
});

test('B5: her tint gives the shared eyelid material back as it was', async () => {
  const { createTint } = await import('../chapters/kafli6-gramedla.js');
  const rex = await gramedla();
  const lids = [];
  rex.model.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m?.customProgramCacheKey?.() === 'eyelids') lids.push(m); });
  assert.ok(lids.length > 0, 'she has eyelids');
  const was = lids.map(m => ({ env: m.envMapIntensity, rough: m.roughness, colour: m.color.getHex(), emissive: m.emissive?.getHex(), fog: m.fog }));
  const tint = createTint(rex.model);
  tint.set(1, 0.7);
  tint.set(0.4, 1);
  tint.dispose();
  lids.forEach((m, i) => assert.deepEqual({ env: m.envMapIntensity, rough: m.roughness, colour: m.color.getHex(), emissive: m.emissive?.getHex(), fog: m.fog }, was[i]));
});

test('B9: her head-down pose found leaves her lean as it was (standing tall, her snout where it was)', async () => {
  const { headDownPose } = await import('../chapters/kafli6-seat.js');
  const { life, her, frame } = await herLife(30);
  life.show();
  for (let i = 0; i < 30; i++) frame();
  for (const pose of [{ theta: -0.3, pitch: 0.35 }, { theta: 0.4, pitch: -0.1, turn: 0.2, roll: 0.05 }]) {
    life.lean.set(pose);
    her.root.updateMatrixWorld(true);
    const before = life.lean.snout();
    headDownPose(her, life.lean, life.hips);
    her.root.updateMatrixWorld(true);
    const moved = life.lean.snout().distanceTo(before);
    assert.ok(moved < 1e-6, `her snout is ${(moved * 1000).toFixed(1)} mm from where it was`);
  }
});

// Mosi's little roar (chapters/kafli6-mosi.js, Task 10) -----------------------------------------------
test("Mosi's little roar opens his jaw 24 degrees at its peak and leaves every bone within 0.5 degrees of where it was", async () => {
  const { chapterWorld } = await import('./chapter-harness.mjs');
  const { chapter } = await import('../chapters/kafli6.js');
  const { smallRoar, SMALL_ROAR } = await import('../chapters/kafli6-mosi.js');
  const world = await chapterWorld(chapter);
  const mosi = world.actors.get('mosi');
  mosi.mixer.timeScale = 0; // held still: the mixer then leaves his bones alone, so a turn left on one would stay
  for (let i = 0; i < 10; i++) mosi.update(1 / 30);
  const bones = [];
  mosi.model.traverse(o => { if (o.isBone) bones.push(o); });
  const before = bones.map(b => b.quaternion.clone());
  const deg = (a, b) => THREE.MathUtils.radToDeg(a.angleTo(b));
  const at = name => bones.findIndex(b => b.name === name);
  const peak = { Neck: 0, Head: 0, Jaw: 0 };
  const roar = smallRoar(null, { mosi: { raw: mosi }, world });
  for (let t = 0; t < SMALL_ROAR.seconds + 0.7; t += 1 / 30) {
    mosi.update(1 / 30);
    for (const name of Object.keys(peak)) peak[name] = Math.max(peak[name], deg(bones[at(name)].quaternion, before[at(name)]));
  }
  assert.ok(roar.done, 'the roar is over');
  assert.ok(Math.abs(peak.Jaw - SMALL_ROAR.jaw) < 1, `his jaw opened ${peak.Jaw.toFixed(1)} degrees`);
  assert.ok(Math.abs(peak.Neck - SMALL_ROAR.neck) < 1.5, `his neck rose ${peak.Neck.toFixed(1)} degrees`);
  assert.ok(Math.abs(peak.Head - SMALL_ROAR.head) < 2, `his head rose ${peak.Head.toFixed(1)} degrees`);
  const worst = bones.map((b, i) => [b.name, deg(b.quaternion, before[i])]).sort((a, b) => b[1] - a[1])[0];
  assert.ok(worst[1] < 0.5, `${worst[0]} left ${worst[1].toFixed(2)} degrees off`);
  assert.equal(mosi.model.position.length(), 0, 'his model back in its frame');
});