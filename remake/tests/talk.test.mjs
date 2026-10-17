import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createActor } from '../engine/actor.js';
import { createScene } from '../engine/scene/scene.js';
import { MOUTH_RATE, TALK, createTalk, mouthAt, mouthFromText } from '../engine/talk.js';
import { emptyWorld, loadCharacter } from './characters.mjs';

// Talking (engine/talk.js): the mouth tracks in lines.json, the tracks made from text, the jaw and
// head while a line plays, and the scene's say() driving them.

const lines = JSON.parse(fs.readFileSync(new URL('../assets/audio/lines.json', import.meta.url), 'utf8'));
const deg = THREE.MathUtils.radToDeg;

test('every recorded line has a mouth track as long as the line, with pauses and loud parts', () => {
  const entries = Object.entries(lines);
  assert.ok(entries.length >= 300);
  for (const [id, line] of entries) {
    assert.match(line.mouth, /^[0-9a-f]+$/, id);
    assert.ok(Math.abs(line.mouth.length - line.duration * MOUTH_RATE) <= 1.5, `${id}: ${line.mouth.length} frames for ${line.duration} s`);
  }
  // Mosi's welcome: a few breaths between its sentences, the mouth wide open on the loudest words.
  const welcome = lines.welcome.mouth;
  assert.ok((welcome.match(/0{4,}/g) || []).length >= 3, welcome);
  assert.ok(welcome.includes('f'), welcome);
});

test('a track reads between its frames and is shut beyond its end', () => {
  assert.equal(mouthAt('0f', 0), 0);
  assert.equal(mouthAt('0f', 0.5 / MOUTH_RATE), 0.5);
  assert.equal(mouthAt('0f', 1 / MOUTH_RATE), 1);
  assert.equal(mouthAt('0f', 2 / MOUTH_RATE), 0);
  assert.equal(mouthAt('', 0.1), 0);
  assert.equal(mouthAt(null, 0.1), 0);
});

test('a line without a recording gets a track from its syllables, the same every time', () => {
  const text = 'Komdu, við skulum skoða skóginn saman!';
  const duration = 0.6 + 6 * 0.42; // the scene's reading pace for six words
  const a = mouthFromText(text, duration);
  assert.equal(a, mouthFromText(text, duration));
  assert.equal(a.length, Math.round(duration * MOUTH_RATE));
  // Ten syllables: as many openings, a breath at the comma.
  const openings = (a.match(/(^|[0-3])[4-9a-f]/g) || []).length;
  assert.ok(openings >= 8 && openings <= 11, `${openings} openings in ${a}`);
  assert.ok(/0{2,}/.test(a), `no breath at the comma: ${a}`);
  assert.notEqual(a, mouthFromText('Allt í lagi, við förum seinna.', duration));
});

test('the talk follows a line, ends with it, and a newer line is not stopped by an older one', () => {
  const talk = createTalk();
  assert.equal(talk.update(1 / 30), null);
  const mouth = '0000ffff0000ffff0000';
  const first = talk.say({ mouth, duration: mouth.length / MOUTH_RATE });
  let widest = 0;
  for (let i = 0; i < 32; i++) {
    const pose = talk.update(1 / 30);
    widest = Math.max(widest, pose ? deg(pose.jaw) : 0);
    if (pose) assert.ok(deg(pose.nod) < TALK.nod + TALK.beat + 0.01 && Math.abs(deg(pose.tilt)) <= TALK.tilt + 1e-9);
  }
  assert.ok(widest > 0.8 * TALK.jaw && widest <= TALK.jaw + 1e-9, `the jaw opened ${widest.toFixed(1)} degrees`);
  assert.equal(talk.speaking, false, 'the line is over');
  for (let i = 0; i < 30; i++) talk.update(1 / 30);
  assert.equal(talk.update(1 / 30), null, 'quiet once the line has settled');
  // A newer line goes on when the older one is stopped.
  talk.say({ text: 'Halló!', duration: 1 });
  const second = talk.say({ text: 'Halló, Egill!', duration: 2 });
  talk.stop(first);
  assert.equal(talk.speaking, true);
  talk.stop(second);
  assert.equal(talk.speaking, false);
});

async function actorOf(name) {
  const world = emptyWorld();
  const actor = await createActor(world, { name, gltf: await loadCharacter(name) });
  world.actors.set(name, actor);
  return { world, actor };
}

// The angle a bone has turned from the pose the clip gave it.
const turned = (bone, from) => deg(bone.quaternion.angleTo(from));

test('Grameðla opens her jaw with the voice, and her head moves a little', async () => {
  const { actor } = await actorOf('gramedla');
  const jaw = actor.model.getObjectByName('Jaw');
  const head = actor.model.getObjectByName('Head');
  for (let i = 0; i < 20; i++) actor.update(1 / 30);
  const token = actor.talk({ mouth: lines.welcome.mouth, duration: lines.welcome.duration });
  let widest = 0, headMost = 0, shutFrames = 0;
  for (let i = 0; i < Math.round(lines.welcome.duration * 30); i++) {
    // The clip's own pose for this frame: the layers are laid on top of it.
    actor.update(1 / 30);
    widest = Math.max(widest, actor.mouthOpen);
    if (actor.mouthOpen < 0.05) shutFrames++;
  }
  assert.ok(widest > 0.85, `the mouth opened to ${widest.toFixed(2)}`);
  assert.ok(shutFrames > 10, `the mouth shut in only ${shutFrames} frames (the pauses)`);
  // The layers are undone before the next frame: paused frames hold the pose without piling up.
  actor.talk({ mouth: 'ffffffffffffffffffff', duration: 1 });
  for (let i = 0; i < 10; i++) actor.update(1 / 30);
  actor.update(0);
  const jawNow = jaw.quaternion.clone(), headNow = head.quaternion.clone();
  for (let i = 0; i < 30; i++) actor.update(0);
  assert.ok(turned(jaw, jawNow) < 0.01 && turned(head, headNow) < 0.01, 'a frozen frame moved the jaw or head');
  // How far the jaw opens past the clip: measured against the same frame without talking.
  const quiet = (await actorOf('gramedla')).actor;
  const loud = (await actorOf('gramedla')).actor;
  loud.talk({ mouth: 'ffffffffffffffffffff', duration: 1 });
  for (let i = 0; i < 15; i++) { quiet.update(1 / 30); loud.update(1 / 30); }
  const opened = turned(loud.model.getObjectByName('Jaw'), quiet.model.getObjectByName('Jaw').quaternion);
  headMost = turned(loud.model.getObjectByName('Head'), quiet.model.getObjectByName('Head').quaternion);
  assert.ok(opened > 0.8 * TALK.jaw && opened < TALK.jaw + 0.5, `the jaw opened ${opened.toFixed(1)} degrees past the clip`);
  assert.ok(headMost > 0.5 && headMost < 4, `the head moved ${headMost.toFixed(2)} degrees`);
  // Opening means the chin goes down.
  const chin = new THREE.Vector3(1, 0, 0);
  const jawTip = a => chin.clone().applyQuaternion(a.model.getObjectByName('Jaw').getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(jawTip(loud).y < jawTip(quiet).y - 0.1, 'the jaw opened upward');
  actor.stopTalking(token);
});

test('Mosi opens his beak a little and nods; Egill talks with his head alone', async () => {
  for (const [name, beak] of [['mosi', 7], ['egill', 0]]) {
    const quiet = (await actorOf(name)).actor;
    const loud = (await actorOf(name)).actor;
    loud.talk({ mouth: 'ffffffffffffffffffffffffffffff', duration: 1.5 });
    for (let i = 0; i < 20; i++) { quiet.update(1 / 30); loud.update(1 / 30); }
    const moved = turned(loud.model.getObjectByName('Head'), quiet.model.getObjectByName('Head').quaternion);
    assert.ok(moved > 0.5 && moved < 4, `${name}'s head moved ${moved.toFixed(2)} degrees`);
    const jaw = loud.model.getObjectByName('Jaw');
    if (!beak) { assert.equal(jaw, undefined, `${name} has a jaw: the owner wants his mouth closed`); continue; }
    const opened = turned(jaw, quiet.model.getObjectByName('Jaw').quaternion);
    assert.ok(opened > 0.8 * beak && opened < beak + 0.5, `${name}'s beak opened ${opened.toFixed(1)} degrees`);
  }
});

test('the mouth pass gave Mosi a jaw under his beak: the lower beak drops, the hook stays', async () => {
  const gltf = await loadCharacter('mosi');
  gltf.scene.updateMatrixWorld(true);
  let mesh = null;
  gltf.scene.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  const jaw = gltf.scene.getObjectByName('Jaw');
  assert.equal(jaw?.parent?.name, 'Head');
  assert.deepEqual(mesh.userData.face.mouth, { talk: 7 });
  const k = mesh.skeleton.bones.indexOf(jaw);
  const { skinIndex, skinWeight, position } = mesh.geometry.attributes;
  const carried = [];
  for (let i = 0; i < position.count; i++) {
    let w = 0;
    for (let c = 0; c < 4; c++) if (skinIndex.getComponent(i, c) === k) w += skinWeight.getComponent(i, c);
    if (w > 0.9) carried.push(i);
  }
  assert.ok(carried.length > 300, `the jaw carries ${carried.length} vertices`);
  // The lowest point of the beak's hook and the jaw's front, before and after the beak opens 7 degrees.
  const at = i => mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
  let hook = 0;
  for (let i = 0; i < position.count; i++) if (at(i).x > at(hook).x) hook = i; // the beak's tip, the front of Mosi
  const front = carried.reduce((a, b) => (at(b).x > at(a).x ? b : a));
  const before = [at(hook), at(front)];
  const left = new THREE.Vector3(0, 0, -1);
  jaw.quaternion.setFromAxisAngle(left.applyQuaternion(jaw.parent.getWorldQuaternion(new THREE.Quaternion()).invert()), THREE.MathUtils.degToRad(7));
  gltf.scene.updateMatrixWorld(true);
  assert.ok(at(hook).distanceTo(before[0]) < 1e-6, 'the hook of the upper beak moved');
  assert.ok(before[1].y - at(front).y > 0.04, `the jaw's front dropped ${(before[1].y - at(front).y).toFixed(3)} m`);
});

test('s.say makes the speaking actor talk for the line, with its recording\'s mouth', async () => {
  const { world, actor } = await actorOf('mosi');
  world.chapter = { lines: { welcome: { text: 'Halló, Egill!', audio: 'welcome' }, plain: { text: 'Komdu, við skulum skoða skóginn saman!' } } };
  const ui = { caption: () => 1, clearCaption() {}, showChoices() {}, hideChoices() {}, setFade() {}, fadeLevel: 0, reset() {} };
  const voice = { play: () => null, stop() {} };
  const director = { stop() {}, handheld() {} };
  const stage = createScene({ world, director, ui, voice, lines, cast: { mosi: { name: 'Mosi' } } });
  const said = [];
  const talk = actor.talk;
  actor.talk = line => { said.push(line); return talk(line); };
  let during = 0, after = null;
  stage.start(function* script(s) {
    yield s.say('mosi', 'welcome');
    after = actor.talking;
    yield s.say('mosi', 'plain');
    yield s.say('narrator', 'plain'); // not an actor: nothing talks
  });
  stage.begin();
  const frames = Math.ceil((lines.welcome.duration + 0.5) * 30);
  for (let i = 0; i < frames + 30 * 8; i++) {
    stage.update(1 / 30);
    actor.update(1 / 30);
    if (i < frames - 20 && actor.talking) during++;
  }
  assert.equal(said.length, 2);
  assert.equal(said[0].mouth, lines.welcome.mouth);
  assert.equal(said[0].duration, lines.welcome.duration);
  assert.equal(said[1].mouth, undefined);
  assert.ok(said[1].text.startsWith('Komdu'));
  assert.ok(during > 0.9 * (frames - 35), `talking in ${during} frames of the line`);
  assert.equal(after, false, 'still talking after the line');
  assert.equal(stage.idle, true);
});
