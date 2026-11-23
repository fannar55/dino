// Chapter 6's invitation to tap (chapters/kafli6-glitter.js; the owner's F1 reports 4, 5 and 9 of 2026-11-23): at the call, before
// Mosi has called, Mosi glitters; once she has answered, the three ways glitter alike; when her head is down, her head glitters. Each
// from the frame its wait begins, on the screen at both shapes, gone the frame its tap is taken; and the untouched play's lines and
// times do not move.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import * as kafli6 from '../chapters/kafli6.js';
import { playUnattended } from './chapter-harness.mjs';

const WAYS = ['dir-left', 'dir-ahead', 'dir-right'];
/** What should glitter while the chapter waits as `waiting` says (null: nothing of this round's). */
function expected(c) {
  const w = c.waiting;
  if (!w) return null;
  if (w.task === 'call') return w.names.includes('mosi') ? ['mosi'] : WAYS;
  if (w.task === 'head') return ['gramedla-head'];
  return null;
}
const inFrame = (point, camera) => {
  const p = point.clone().project(camera);
  return p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
};

function playIt({ aspect = 1.6, child = null } = {}) {
  const seen = { waits: [], late: [], stray: [], off: [], far: [], kinds: new Set(), cloudLook: [] };
  let last = null;
  return playUnattended(kafli6, {
    seeking: false, limit: 620, shaped: true, aspect,
    onFrame(frame) {
      const { world } = frame;
      const c = world.chapterState;
      if (!c) return;
      world.camera.updateMatrixWorld();
      const want = expected(c);
      const glitter = world.scene.children.filter(o => o.isPoints && o.name.startsWith('Glitter '));
      const time = c.s.time;
      if (!want) {
        if (glitter.length || c.beckoning) seen.stray.push(`${glitter.map(o => o.name).join(', ') || 'beckoning'} at ${time.toFixed(2)} s (waiting ${c.waiting?.task ?? 'nothing'})`);
      } else {
        const key = `${c.waiting.task} ${want.join(',')} ${c.waiting.since}`;
        if (key !== last) {
          last = key;
          seen.waits.push({ key, since: c.waiting.since, first: time });
          seen.kinds.add(want.join(','));
        }
        const names = new Set(glitter.map(o => o.name.slice('Glitter '.length)));
        const missing = want.filter(name => !names.has(name));
        if (missing.length || String(c.beckoning?.names) !== String(want)) seen.late.push(`${missing.join(',') || c.beckoning?.names} at ${time.toFixed(2)} s`);
        for (const o of glitter) {
          if ((o.material.fog !== false || o.material.blending !== THREE.NormalBlending)) seen.cloudLook.push(o.name);
          const name = o.name.slice('Glitter '.length);
          const p = new THREE.Vector3().fromArray(o.geometry.attributes.position.array, 0);
          const aim = world.resolvePoint(c.aims[name], new THREE.Vector3());
          if (p.distanceTo(aim) > 3) seen.far.push(`${name} ${p.distanceTo(aim).toFixed(2)} m from its target at ${time.toFixed(2)} s`);
          // on the screen once the shot for the wait has cut (the chapter's own test gives a wait 2.6 s for that)
          if (time - c.waiting.since >= 2.6 && !inFrame(p, world.camera)) seen.off.push(`${name} at ${time.toFixed(2)} s`);
        }
      }
      child?.(c, frame, seen);
    },
  }).then(run => ({ ...run, watched: seen }));
}

/** Taps the right thing half a second after each of the three waits begins (Mosi, her way, her head). */
function quickChild(c, frame, seen) {
  const call = c.callTask?.state();
  let want = null;
  if (call && call.phase === 'ask') want = { key: `ask ${call.round}`, right: 'mosi' };
  else if (call && call.phase === 'listen') want = { key: `listen ${call.round}`, right: `dir-${call.direction}` };
  else if (c.waiting?.task === 'head') want = { key: 'head', right: 'gramedla-head' };
  if (!want) return;
  if (seen.quick?.key !== want.key) seen.quick = { key: want.key, since: c.s.time, done: false };
  if (!seen.quick.done && c.s.time - seen.quick.since >= 0.5) {
    seen.quick.done = true;
    seen.taps = (seen.taps ?? 0) + 1;
    frame.pointer.tap(want.right, { x: 640, y: 400 });
  }
}

const once = new Map();
const play = (name, options) => {
  if (!once.has(name)) once.set(name, playIt(options));
  return once.get(name);
};
const wide = () => play('wide', {});
const upright = () => play('upright', { aspect: 0.625 });
const quick = () => play('quick', { child: quickChild });

function checkWaits(run, what) {
  const { task, watched } = run;
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.equal(task.done, true, `${what}: the chapter ended`);
  assert.deepEqual([...watched.kinds].sort(), ['dir-left,dir-ahead,dir-right', 'gramedla-head', 'mosi'], `${what}: all three waits came`);
  for (const wait of watched.waits) assert.ok(wait.first - wait.since <= 1 / 30 + 1e-6, `${what}: ${wait.key} was first seen ${(wait.first - wait.since).toFixed(3)} s late`);
  assert.deepEqual(watched.late, [], `${what}: a wait without its glitter`);
  assert.deepEqual(watched.stray, [], `${what}: glitter with no wait for it`);
  assert.deepEqual(watched.far, [], `${what}: glitter away from what it marks`);
  assert.deepEqual(watched.off, [], `${what}: glitter off the screen`);
  assert.deepEqual(watched.cloudLook, [], `${what}: glitter that is added to the picture (white in the cloud) or takes fog`);
}

test('untouched, wide: each of the three waits glitters on its target from its first frame, on the screen, and nothing else does', async () => {
  const run = await wide();
  checkWaits(run, 'wide');
  assert.equal(run.watched.waits.length, 7, 'three asks, three answers and her head');
});

test('untouched, upright (aspect 0.625): the same', async () => {
  checkWaits(await upright(), 'upright');
});

test('a child who taps right half a second into each wait: the glitter is gone the frame the tap is taken', async () => {
  const run = await quick();
  checkWaits(run, 'quick');
  assert.equal(run.watched.taps, 7, 'Mosi three times, her way three times, her head once');
});

test('the untouched play says the same lines at the same times as before the glitter (.tools/kafli6/uttekt-said-head.txt)', async () => {
  const file = new URL('../../.tools/kafli6/uttekt-said-head.txt', import.meta.url);
  const said = (await wide()).seen.said.map(e => `${e.id} ${e.at.toFixed(3)}`);
  if (fs.existsSync(file)) {
    const before = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    assert.deepEqual(said, before);
  }
  const end = (await wide()).world.chapterTimeline.at(-1);
  assert.equal(end.at.toFixed(1), '460.1', 'the untouched play ends where it did');
});
