// Chapter 4's flight route (chapters/kafli4-route.js): the beats of the spec's section 5, a schedule that keeps every big moment on its
// second, the climb up the falls in E, the animals along C and the end over the far pool.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoute, BEATS, FASTER_LAST, LEAP, FALLS, POOL } from '../chapters/kafli4-route.js';

test('the beats come in the spec order and the flight lasts 170 s', () => {
  assert.deepEqual(Object.keys(BEATS), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'END']);
  assert.equal(BEATS.END, 170);
  assert.ok(FASTER_LAST < BEATS.E && FASTER_LAST > BEATS.D);
});

test('progress is monotonic and spans the route', () => {
  const r = createRoute();
  let last = -1;
  for (let t = 0; t <= 170; t += 0.5) {
    const u = r.progressAt(t);
    assert.ok(u >= last, `t=${t}`);
    last = u;
  }
  assert.equal(r.progressAt(0), 0);
  assert.equal(r.progressAt(170), 1);
});

test('she sits on the snag top until the leap, then flies at 6 to 18 m/s, and the falls are climbed in E', () => {
  const r = createRoute();
  assert.equal(r.progressAt(LEAP), 0, 'still on the snag at the leap');
  const perch = r.pointAt(0);
  assert.ok(Math.hypot(perch.x - r.tree[0], perch.z - r.tree[2]) < 0.01 && perch.y > r.tree[1], 'over the snag top');
  for (let t = Math.ceil(LEAP + 1); t < 170; t += 1) {
    const v = r.curve.getPointAt(r.progressAt(t)).distanceTo(r.curve.getPointAt(r.progressAt(t - 1)));
    assert.ok(v >= 6 && v <= 18, `t=${t} v=${v}`);
  }
  const y = t => r.pointAt(r.progressAt(t)).y;
  assert.ok(y(BEATS.F) - y(BEATS.E) >= 40, `climbed ${y(BEATS.F) - y(BEATS.E)} m`);
  // the climb goes up past the lip of the falls, 3 m clear of the falling water (which falls just off the cliff's face)
  for (let t = BEATS.E; t <= BEATS.F; t += 0.1) {
    const p = r.pointAt(r.progressAt(t));
    if (p.y < FALLS.top + 1 && p.y > FALLS.base + 2) assert.ok(p.x - FALLS.face >= 3, `t=${t.toFixed(1)}: ${(p.x - FALLS.face).toFixed(2)} m from the cliff`);
  }
});

test('low over the water in B to D: 2 to 3 m up on the river, 4 to 6 m in the gorge', () => {
  const r = createRoute();
  for (let t = 22; t < BEATS.E; t += 0.5) {
    const s = r.distanceAt(t);
    const level = r.riverLevelAt(s);
    assert.notEqual(level, null, `t=${t}: over the river`);
    const alt = r.pointAt(s / r.length).y - level;
    const [low, high] = t < BEATS.D - 3 ? [2, 3.3] : t > BEATS.D + 3 ? [4, 6] : [2, 6];
    assert.ok(alt >= low && alt <= high, `t=${t}: ${alt.toFixed(2)} m over the water`);
  }
});

test('nine animal groups along C in order: frogs, lizards, birds, frogs, turtles, birds, lizards, dragonflies, lizards', () => {
  const r = createRoute();
  assert.deepEqual(r.groups.map(g => g.id), ['frogs-1', 'lizards-1', 'birds-1', 'frogs-2', 'turtles', 'birds-2', 'lizards-2', 'dragonflies', 'lizards-3']);
  assert.deepEqual(r.groups.map(g => g.kind), ['frogs', 'lizards', 'birds', 'frogs', 'turtle', 'birds', 'lizards', 'dragonflies', 'lizards']);
  const uC = r.progressAt(BEATS.C);
  const uD = r.progressAt(BEATS.D);
  assert.ok(r.groups.every((g, i, a) => g.u > uC && g.u < uD && (i === 0 || g.u > a[i - 1].u)));
});

test('the route ends in the far pool, north of the river below the gorge', () => {
  const r = createRoute();
  const end = r.pointAt(1);
  assert.ok(Math.hypot(end.x - r.pool.center[0], end.z - r.pool.center[1]) < r.pool.radius);
  const near = r.river.nearest(POOL.center[0], POOL.center[1]);
  assert.ok(near.d < r.gorge.from, 'below the gorge');
  assert.equal(near.side, 1, 'north of the river');
  assert.ok(end.y > POOL.level + 1 && end.y < POOL.level + 5, 'just over the water as she comes in');
});

test('beats name where she is, the lanes cover B to the middle of D, and the cameos lie in C and D', () => {
  const r = createRoute();
  assert.equal(r.beatAt(0), 'A');
  assert.equal(r.beatAt(BEATS.C + 0.1), 'C');
  assert.equal(r.beatAt(169.9), 'G');
  const [lane] = r.lanes;
  assert.equal(lane.half, 4);
  assert.ok(lane.from > r.progressAt(BEATS.B) && lane.to < r.progressAt(BEATS.E) && lane.to > r.progressAt(BEATS.D));
  const tOf = u => { let lo = 0, hi = 170; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (r.progressAt(m) < u) lo = m; else hi = m; } return lo; };
  const bank = tOf(r.nearestU(r.cameos.bank.at));
  const rim = tOf(r.nearestU(r.cameos.rim.at));
  assert.ok(bank > BEATS.C && bank < BEATS.D, `the bank cameo at ${bank}`);
  assert.ok(rim > BEATS.D && rim < BEATS.E, `the rim cameo at ${rim}`);
  assert.ok(r.cameos.rim.at[1] - r.riverLevelAt(r.distanceAt(rim), 30) > 25, 'Mosi up on the rim');
});
