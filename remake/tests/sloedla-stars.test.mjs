// The stars of Slóeðla's song game: how they fly, turn, land and shine (star-motion.js), and the star model on disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { END, barStar, countUp, endStar, endTimes, isNewBest } from '../engine/sloedla/star-motion.js';

test('an end star flies from the bar to its place, turns twice, and lands on time', () => {
  const times = endTimes(2);
  const from = { x: 500, y: 30 }, to = { x: 400, y: 300 };
  const at = t => endStar({ t, i: 0, earned: true, from, to, size: 80, times });
  assert.equal(at(times.launches[0] - 0.01).shown, false);
  assert.deepEqual([at(times.launches[0]).x, at(times.launches[0]).y], [500, 30]);
  const landed = at(times.lands[0]);
  assert.ok(Math.abs(landed.x - 400) < 1e-6 && Math.abs(landed.y - 300) < 1e-6);
  assert.ok(Math.abs(landed.spin - 4 * Math.PI) < 1e-6, 'two turns');
  assert.equal(landed.gold, 1);
  assert.ok(at(times.lands[0] + 0.05).size > 80 * 1.1, 'it bounces');
  assert.ok(Math.abs(at(times.lands[0] + 0.8).size - 80) < 80 * 0.02, 'and settles');
  assert.ok(Math.abs(at(times.lands[0] + 3).tilt) <= 0.12, 'the sway stays small');
  const shines = Array.from({ length: 80 }, (_, k) => at(times.lands[0] + 1 + k * 0.1).shine);
  assert.ok(shines.some(s => s > 0.5) && shines.filter(s => s > 0).length < 30, 'a gloss now and then, not always');
  assert.deepEqual(times.launches.map(t => Number(t.toFixed(2))), [0.6, 1.3]);
});

test('no stars: nothing flies, the count and the end still come', () => {
  const times = endTimes(0);
  assert.deepEqual(times.launches, []);
  assert.equal(times.together, null);
  const glass = endStar({ t: 1, i: 1, earned: false, from: { x: 0, y: 0 }, to: { x: 200, y: 300 }, size: 80, times });
  assert.equal(glass.glass, true);
  assert.equal(glass.shown, true);
  assert.ok(Math.abs(glass.x - 200) < 4 && Math.abs(glass.y - 300) < 4, 'it shivers in its place');
  assert.ok(times.done > times.countTo && times.countTo > times.countFrom);
});

test('three stars turn together after the third lands; the end waits for the count', () => {
  const times = endTimes(3);
  assert.ok(times.together >= times.lands[2]);
  assert.ok(times.countFrom >= times.together + END.together - 1e-9);
  assert.equal(times.done, times.countTo + END.rest);
});

test('two bar stars reached close together move on their own', () => {
  const a = barStar({ t: 10.25, x: 300, y: 30, size: 20, litAt: 10 });
  const b = barStar({ t: 10.25, x: 500, y: 30, size: 20, litAt: 10.2 });
  assert.ok(a.y < 30 && b.y < 30, 'both jump');
  assert.notEqual(a.spin, b.spin);
  const glass = barStar({ t: 10.25, x: 700, y: 30, size: 20, litAt: Infinity });
  assert.equal(glass.glass, true);
  assert.equal(glass.gold, 0);
  const later = barStar({ t: 12, x: 300, y: 30, size: 20, litAt: 10 });
  assert.equal(later.gold, 1);
  assert.ok(Math.abs(later.y - 30) <= 2, 'back on the bar, bobbing');
});

test('the count rises from 0 to the notes played, whole numbers; a new best is more stars than before', () => {
  const seen = [0, 0.25, 0.5, 0.75, 1, 1.5].map(t => countUp(t, 0.25, 1.25, 45));
  assert.deepEqual([seen[0], seen.at(-1)], [0, 45]);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1] && Number.isInteger(seen[i]));
  assert.equal(isNewBest(2, 1), true);
  assert.equal(isNewBest(2, 2), false);
  assert.equal(isNewBest(0, 0), false);
});
