// Grameðla kemur!'s key frames (chapters/gramedla3d/keys.js): the table the review page and step 2 are set from keeps the show's
// rules (spec docs/superpowers/specs/2026-11-12-gramedla-kemur-3d-design.md, section 2) for what it places itself. Her head, Flugeðla
// and the edges are measured on the page (tools/gramedla-probe.mjs --lykill all); the particles' places are the table's, so their
// numbers are checked here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, GROUPS, MAX_OUT, EDGE_K, MIDDLE, STRENGTH, kOf, outOf, groupPoints, keyIndex } from '../chapters/gramedla3d/keys.js';
import {
  LENGTH, BEATS, CUES, ROAR, butterflyAt, birdsAt, flugedlaAt, gramAt, specksAt, speckAt, treesAt, cues, TREE_SPECS, BUTTERFLY,
} from '../chapters/gramedla3d/timeline.js';

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

// ---- step 2: the timeline between the keys (chapters/gramedla3d/timeline.js) ----
// Her poses as the page solves them (tools/gramedla-probe.mjs, 2026-11-12): the timeline only reads their numbers.
const RIG = {
  '4a': { x: 0, z: -22.785, theta: 0, turn: 0, roll: 0, pitch: 0 },
  4: { x: 0.02, z: -3.859, theta: 0.4867, turn: -0.0088, roll: 0.22, pitch: 0 },
  5: { x: 0.824, z: 0.608, theta: 1.3141, turn: -0.17, roll: 0, pitch: 0 },
  6: { x: 0.439, z: -0.926, theta: 0.5388, turn: -0.07, roll: 0, pitch: -0.1 },
  7: { x: 0.607, z: 0.03, theta: 1.0554, turn: -0.17, roll: 0, pitch: -0.12 },
  '7b': { x: 0.531, z: -0.159, theta: 1.2977, turn: -0.17, roll: 0, pitch: -0.05 },
};
const near = (a, b, what, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${what}: ${a} is not ${b}`);
const nearAll = (a, b, what) => { assert.equal(a.length, b.length, what); a.forEach((x, i) => near(x, b[i], `${what}[${i}]`)); };
const STEP = 1 / 30;
const seconds = function* (from = 0, to = LENGTH) { for (let i = 0; from + i * STEP <= to + 1e-9; i++) yield from + i * STEP; };

test('at each key\'s second the show is that key\'s row: the stills he approved are the show\'s own frames', () => {
  for (const key of KEYS) {
    const t = key.time;
    const what = `${key.id} at ${t} s`;
    // the butterfly
    const b = butterflyAt(t);
    if (key.butterfly?.at) { assert.equal(b.mode, 'at', what); nearAll(b.at, key.butterfly.at, `${what} butterfly`); }
    else if (key.butterfly?.on === 'snout') assert.equal(b.mode, 'snout', what);
    else assert.equal(b.mode, 'hidden', `${what}: no butterfly`);
    // the flock
    const birds = birdsAt(t);
    if (key.birds) {
      key.birds.forEach((row, i) => {
        nearAll(birds[i].slice(0, 3), row.slice(0, 3), `${what} bird ${i}`);
        near(((birds[i][3] - row[3]) % 360 + 360) % 360, 0, `${what} bird ${i} yaw`, 1e-6);
        near(birds[i][4], row[4], `${what} bird ${i} wings`);
      });
    } else assert.equal(birds, null, `${what}: no birds`);
    // Flugeðla
    const f = flugedlaAt(t);
    if (key.flugedla) {
      const k = key.flugedla;
      nearAll(f.beak, k.beak, `${what} beak`);
      for (const p of ['at', 'pitch', 'yaw', 'neck']) near(f[p], k[p] ?? 0, `${what} ${p}`);
      assert.equal(f.egill.point, true, what);
      near(f.egill.weight, 1, `${what} Egill's point`);
      assert.deepEqual([f.egill.lean, f.egill.aim], [k.egill.lean, k.egill.aim], what);
    } else assert.equal(f, null, `${what}: no Flugeðla`);
    // Grameðla: her solved pose, held in the row's clip at its second
    const g = gramAt(t, RIG);
    if (key.gram) {
      for (const p of ['x', 'z', 'theta', 'turn', 'roll', 'pitch']) near(g[p], RIG[key.id][p], `${what} her ${p}`, 1e-6);
      assert.equal(g.layers.length, 1, `${what}: one clip`);
      assert.equal(g.layers[0].clip, key.gram.clip ?? 'idle', what);
      near(g.layers[0].weight, 1, `${what} weight`);
      near(g.layers[0].time, key.gram.at === 'widest' ? ROAR.widest : key.gram.at ?? 0, `${what} clip second`, 1e-6);
    } else assert.equal(g, null, `${what}: not on the stage`);
    // the specks: the row's groups, at the table's places
    const on = specksAt(t);
    assert.deepEqual(Object.keys(on).sort(), [...key.particles].sort(), `${what} specks`);
    for (const name of key.particles) groupPoints(GROUPS[name]).forEach((p, i) => { const s = speckAt(name, i, p, t); nearAll(s.at, p, `${what} ${name} ${i}`); near(s.dx ?? 0, 0, what); near(s.dy ?? 0, 0, what); });
    // the trees
    const trees = treesAt(t, cues(RIG).steps.filter(s => s.t < 37.4));
    if (key.trees) {
      assert.equal(trees.length, 1, `${what}: one bend`);
      assert.deepEqual(TREE_SPECS[trees[0].name], key.trees, what);
      near(trees[0].amp, 1, `${what} bend`);
    } else assert.deepEqual(trees, [], `${what}: the trees as built`);
  }
});

test('nothing the timeline places is further out than 4 %; small things in front stay off the edges and in the middle when near', () => {
  const nearest = kOf(MAX_OUT) - 1e-9;
  const inMiddle = ([u, v]) => u >= MIDDLE[0] && u <= MIDDLE[1] && v >= MIDDLE[0] && v <= MIDDLE[1];
  const small = (what, p) => {
    assert.ok(p[2] >= nearest, `${what} at k ${p[2]}`);
    if (p[2] < 1) assert.ok(p[0] > 0.02 && p[0] < 0.98 && p[1] > 0.02 && p[1] < 0.98, `${what} in front at an edge: ${p.map(x => x.toFixed(3))}`);
    if (p[2] < EDGE_K) assert.ok(inMiddle(p), `${what} near and outside the middle: ${p.map(x => x.toFixed(3))}`);
  };
  for (const t of seconds()) {
    const b = butterflyAt(t);
    if (b.at) small(`butterfly at ${t.toFixed(2)}`, b.at);
    if (b.to) small(`butterfly lifting to at ${t.toFixed(2)}`, b.to);
    if (b.from) assert.ok(b.from[2] >= 1, 'it comes to her snout from behind the screen');
    for (const row of birdsAt(t) ?? []) small(`bird at ${t.toFixed(2)}`, row);
    const f = flugedlaAt(t);
    if (f) small(`beak at ${t.toFixed(2)}`, f.beak);
    for (const name of Object.keys(specksAt(t))) groupPoints(GROUPS[name]).forEach((p, i) => small(`${name} ${i} at ${t.toFixed(2)}`, speckAt(name, i, p, t).at));
  }
});

test('what comes out comes slowly: a second at least on the way from the screen plane, along the line of sight', () => {
  // the butterfly to frame 1, the flock, Flugeðla's beak and the butterfly to her snout: from k 1 to their nearest takes 1 s or more
  const wayOut = (fn, from, to) => {
    let cross = null, peak = Infinity, peakAt = null;
    for (const t of seconds(from, to)) {
      const k = fn(t);
      if (k == null) continue;
      if (cross === null && k < 1) cross = t;
      if (k < peak - 1e-6) { peak = k; peakAt = t; }
    }
    return { cross, peak, peakAt, way: peakAt - cross };
  };
  const bird = t => { const r = birdsAt(t); return r ? Math.min(...r.map(x => x[2])) : null; };
  const checks = {
    butterfly: wayOut(t => butterflyAt(t).at?.[2] ?? null, 0, 9),
    birds: wayOut(bird, 10, 13),
    beak: wayOut(t => flugedlaAt(t)?.beak[2] ?? null, 15, 21),
  };
  for (const [what, c] of Object.entries(checks)) assert.ok(c.way >= 1 - 1e-6, `${what}: ${c.way.toFixed(2)} s from the screen plane to its nearest`);
  assert.ok(BUTTERFLY.approach[1] - BUTTERFLY.approach[0] >= 2, 'the butterfly comes back to her snout over two seconds');
});

test('the beats run end to end, the cues are in order within the show, and her footfalls and the wing beats follow from the motion', () => {
  assert.equal(BEATS[0].from, 0);
  for (let i = 1; i < BEATS.length; i++) assert.equal(BEATS[i].from, BEATS[i - 1].to, `beat ${BEATS[i].n} follows ${BEATS[i - 1].n}`);
  assert.equal(BEATS.at(-1).to, LENGTH);
  const all = cues(RIG);
  const times = name => [].concat(all[name]).map(c => (typeof c === 'number' ? c : c.t));
  for (const name of Object.keys(all)) {
    const list = times(name);
    for (const t of list) assert.ok(t >= 0 && t <= LENGTH, `${name} at ${t}`);
    for (let i = 1; i < list.length; i++) assert.ok(list[i] > list[i - 1], `${name} in order`);
  }
  assert.ok(CUES.thump[0] < CUES.birdsUp && CUES.birdsUp < CUES.hunKemur && CUES.hunKemur < CUES.roar && CUES.roar < CUES.huff && CUES.huff < CUES.bless);
  assert.ok(all.steps.length >= 15, 'her walk up the lane is heard');
  assert.ok(all.wings.length >= 3, 'Flugeðla\'s wings beat');
  // each cue of beat 4's walk has the depth of her footfall
  for (const s of all.steps) assert.ok(s.depth > 0 && (s.foot === 'left' || s.foot === 'right'));
});
