// Grameðla kemur!'s key frames (chapters/gramedla3d/keys.js): the table the review page and step 2 are set from keeps the show's
// rules (spec docs/superpowers/specs/2026-11-12-gramedla-kemur-3d-design.md, section 2) for what it places itself. Her head, Flugeðla
// and the edges are measured on the page (tools/gramedla-probe.mjs --lykill all); the particles' places are the table's, so their
// numbers are checked here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, GROUPS, MAX_OUT, EDGE_K, MIDDLE, STRENGTH, kOf, outOf, groupPoints, keyIndex } from '../chapters/gramedla3d/keys.js';

const nearestOut = kOf(MAX_OUT) - 1e-9; // k no nearer than this
const inMiddle = ([u, v]) => u >= MIDDLE[0] && u <= MIDDLE[1] && v >= MIDDLE[0] && v <= MIDDLE[1];

test('the owner\'s calibration: 4 % out at strength 0.02, k and out the inverse of each other', () => {
  assert.equal(STRENGTH, 0.02);
  assert.equal(MAX_OUT, 0.04);
  assert.ok(Math.abs(kOf(0.04) - 1 / 3) < 1e-12);
  for (const out of [0, 0.01, 0.025, 0.04]) assert.ok(Math.abs(outOf(kOf(out)) - out) < 1e-12);
});

test('every frame names its time, its beat (1 to 7) and what leads it; the seven beats are all there, in the show\'s order', () => {
  const ids = new Set();
  for (const key of KEYS) {
    assert.ok(Number.isFinite(key.time) && key.time >= 0 && key.time <= 72, `${key.id} has a time in the show`);
    assert.ok(key.n >= 1 && key.n <= 7, `${key.id} is one of the seven`);
    assert.ok(key.name && key.leadText && key.lead, `${key.id} says what it is and what leads it`);
    assert.ok(!ids.has(key.id), `${key.id} once`);
    ids.add(key.id);
  }
  assert.deepEqual([...new Set(KEYS.map(k => k.n))], [1, 2, 3, 4, 5, 6, 7]);
  const main = KEYS.filter(k => !k.variant);
  assert.equal(main.length, 7);
  for (let i = 1; i < main.length; i++) assert.ok(main[i].time > main[i - 1].time, 'the main frames in time order');
  assert.equal(KEYS[keyIndex('4a')].id, '4a');
  assert.equal(KEYS[keyIndex(6)].id, '6');
  assert.equal(KEYS[keyIndex('nothing')].id, '1');
});

test('nothing the table places is further out than 4 %', () => {
  for (const key of KEYS) {
    if (key.gram?.k !== undefined) assert.ok(key.gram.k >= nearestOut, `${key.id}: her nearest at k ${key.gram.k}`);
    if (key.butterfly?.at) assert.ok(key.butterfly.at[2] >= nearestOut, `${key.id}: the butterfly`);
    if (key.flugedla) assert.ok(key.flugedla.beak[2] >= nearestOut, `${key.id}: the beak`);
    for (const b of key.birds ?? []) assert.ok(b[2] >= nearestOut, `${key.id}: a bird`);
  }
  for (const [name, spec] of Object.entries(GROUPS)) {
    for (const p of groupPoints(spec)) assert.ok(p[2] >= nearestOut, `${name}: a speck at k ${p[2]}`);
  }
});

test('the specks, birds and butterfly nearer than k 0.6 are inside the middle of the frame, and none in front of the screen at an edge', () => {
  const check = (what, p) => {
    if (p[2] < EDGE_K) assert.ok(inMiddle(p), `${what} at ${p.map(x => x.toFixed(3))} is near and outside the middle`);
    if (p[2] < 1) assert.ok(p[0] > 0.05 && p[0] < 0.95 && p[1] > 0.05 && p[1] < 0.95, `${what} in front at an edge`);
  };
  for (const [name, spec] of Object.entries(GROUPS)) for (const p of groupPoints(spec)) check(name, p);
  for (const key of KEYS) {
    if (key.butterfly?.at) check(`${key.id} butterfly`, key.butterfly.at);
    for (const b of key.birds ?? []) check(`${key.id} bird`, b);
    if (key.flugedla) check(`${key.id} beak`, key.flugedla.beak);
  }
});

test('the specks: by kind, in front only where a frame means them to be, the beats\' targets kept', () => {
  const front = name => groupPoints(GROUPS[name]).filter(p => p[2] < 1).length;
  assert.equal(front('motesFar'), 0, 'the lane\'s motes all behind the screen');
  assert.equal(front('leavesFar') + front('pollenFar'), 0, 'the falling leaves and pollen of the thud behind it');
  const near = groupPoints(GROUPS.motesNear).map(p => outOf(p[2]));
  assert.ok(Math.min(...near) >= 0.01 - 1e-9 && Math.max(...near) <= 0.02 + 1e-9, 'Kyrrð\'s motes 1 to 2 % out');
  const puffs = groupPoints(GROUPS.puffs);
  assert.ok(puffs.length >= 2 && puffs.length <= 3 && puffs.every(p => p[2] >= kOf(0.04) - 1e-9), 'two or three puffs, none nearer than her snout');
  const blast = ['blastMotes', 'blastPollen', 'blastLeaves'].flatMap(n => groupPoints(GROUPS[n]));
  const most = Math.max(...blast.map(p => outOf(p[2])));
  assert.ok(most >= 0.03 && most <= 0.04, `the roar's blast reaches 3 to 4 % out (${(most * 100).toFixed(2)} %)`);
  for (const key of KEYS) for (const name of key.particles ?? []) assert.ok(GROUPS[name], `${key.id}: a group named ${name}`);
  // the specks are seeded: a page and this test lay them out alike
  assert.deepEqual(groupPoints(GROUPS.blastMotes), groupPoints(GROUPS.blastMotes));
});

test('the frames\' rows: Hún kemur at the screen plane, nothing of hers nearer; the calibrated pose at 4 %; the roar under it', () => {
  const by = id => KEYS.find(k => k.id === id);
  assert.equal(by('4').gram.k, 1);
  assert.ok(by('4a').gram.stand.depth >= 25, 'her shape far up the lane');
  assert.ok(Math.abs(by('5').gram.k - kOf(0.04)) < 1e-12);
  assert.ok(by('6').gram.k > kOf(0.04) && by('6').gram.clip === 'roar');
  assert.equal(by('7').butterfly.on, 'snout');
  assert.ok(Math.abs(by('7').gram.k - kOf(0.03)) < 1e-12, 'her snout 3 % out with the butterfly on it');
  const b7 = outOf(by('7b').butterfly.at[2]);
  assert.ok(b7 >= 0.035 - 1e-9 && b7 <= 0.04 + 1e-9, 'the butterfly between her and us 3.5 to 4 % out');
  for (const id of ['1', '2', '3']) assert.equal(by(id).gram, null, `${id}: she is not on the stage yet`);
});
