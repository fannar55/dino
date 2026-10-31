// The stars of Slóeðla's song game: how they fly, turn, land and shine (star-motion.js), and the star model on disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { END, barPlace, barStar, countUp, endSpots, endStar, endTimes, isNewBest } from '../engine/sloedla/star-motion.js';
import { STAR_SHARES } from '../engine/sloedla/chart.js';

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
  assert.deepEqual(times.launches.map(t => Number(t.toFixed(2))), [0.6, 1.05]);
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

test('five stars land 0.45 s apart and turn together after the fifth; the end waits for the count', () => {
  const times = endTimes(5);
  assert.ok(Math.abs(times.launches[4] - times.launches[0] - 4 * 0.45) < 1e-9);
  assert.ok(times.together >= times.lands[4]);
  assert.ok(times.countFrom >= times.together + END.together - 1e-9);
  assert.equal(times.done, times.countTo + END.rest);
  assert.equal(endTimes(4).together, null, 'only all five turn together');
});

test('five end stars in an arc: the middle biggest and highest, the sides even, all on a phone and a laptop', () => {
  for (const [w, h, portrait] of [[390, 844, true], [1280, 800, false], [768, 1024, true]]) {
    const spots = endSpots({ w, h, portrait });
    assert.equal(spots.length, 5);
    assert.ok(spots.every(s => s.x - s.size >= w * 0.02 && s.x + s.size <= w * 0.98), `${w}×${h}: inside`);
    assert.ok(spots[2].size > spots[1].size && spots[1].size > spots[0].size, 'bigger to the middle');
    assert.ok(spots[2].y < spots[1].y && spots[1].y < spots[0].y, 'higher to the middle');
    assert.ok(Math.abs((spots[0].x + spots[4].x) / 2 - w / 2) < 1 && Math.abs(spots[0].y - spots[4].y) < 1e-9, 'even');
    for (let i = 0; i < 4; i++) assert.ok(spots[i + 1].x - spots[i].x >= spots[i].size + spots[i + 1].size * 0.9, 'they do not overlap');
  }
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

test('the count rises from 0 to the notes played, whole numbers', () => {
  const seen = [0, 0.25, 0.5, 0.75, 1, 1.5].map(t => countUp(t, 0.25, 1.25, 45));
  assert.deepEqual([seen[0], seen.at(-1)], [0, 45]);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1] && Number.isInteger(seen[i]));
});

test('a new record is more stars or more points', () => {
  assert.equal(isNewBest({ stars: 3, points: 5000 }, { stars: 3, points: 4000 }), true);
  assert.equal(isNewBest({ stars: 3, points: 4000 }, { stars: 4, points: 9000 }), false);
  assert.equal(isNewBest({ stars: 0, points: 0 }), false);
});

// the owner makes the star in Tripo3D (2026-10-30); until his file is here the game draws the flat stars, and this waits
const STAR = new URL('../assets/sloedla/stjarna/stjarna.glb', import.meta.url);
test('the star is on disk, a GLB, small, where it is from and its facing said', { skip: !fs.existsSync(STAR) && 'waiting for the owner\'s star' }, () => {
  const bytes = fs.readFileSync(STAR);
  assert.equal(bytes.subarray(0, 4).toString('latin1'), 'glTF');
  assert.ok(bytes.length < 300_000);
  const credits = fs.readFileSync(new URL('../assets/sloedla/stjarna/KREDIT.md', import.meta.url), 'utf8');
  assert.match(credits, /stjarna\.glb/);
  assert.match(credits, /Tripo3D|CC0|public domain|almenningseign/i);
  assert.match(credits, /facing/);
});

// the owner (2026-10-30): give the star life as Mario's star has it: a few quick turns, a look about, glitter, a heartbeat
test('a landed star is alive: a heartbeat in its size, a few quick turns now and then, a look about between', () => {
  const times = endTimes(1);
  const at = t => endStar({ t, i: 0, earned: true, from: { x: 0, y: 0 }, to: { x: 100, y: 100 }, size: 80, times });
  const start = times.lands[0] + 1.2;
  const sizes = Array.from({ length: 200 }, (_, k) => at(start + k * 0.01).size); // 2 s
  assert.ok(Math.max(...sizes) / Math.min(...sizes) > 1.06, 'it beats');
  const peaks = sizes.filter((s, k) => k > 0 && k < sizes.length - 1 && s > sizes[k - 1] && s >= sizes[k + 1] && s > 80 * 1.02).length;
  assert.ok(peaks >= 3 && peaks <= 5, `a double beat each second (${peaks} peaks in 2 s)`);
  const spins = Array.from({ length: 1000 }, (_, k) => at(start + k * 0.01).spin); // 10 s
  assert.ok(spins.some((s, k) => k + 80 < spins.length && spins[k + 80] - s >= 4 * Math.PI), 'a few quick turns in under a second');
  assert.ok(spins.some((s, k) => k + 150 < spins.length && Math.abs(spins[k + 150] - s) < Math.PI / 2
    && spins.slice(k, k + 150).some(x => Math.abs(x - s) > 0.15)), 'between them it looks about a little');
});

test('a star reached on the bar lives more quietly: a smaller beat, its turns further apart', () => {
  const at = t => barStar({ t, x: 300, y: 30, size: 20, litAt: 10 });
  const sizes = Array.from({ length: 200 }, (_, k) => at(12 + k * 0.01).size);
  const beat = Math.max(...sizes) / Math.min(...sizes);
  assert.ok(beat > 1.02 && beat < 1.08, `a small beat (${beat.toFixed(3)})`);
  const spins = Array.from({ length: 1200 }, (_, k) => at(11 + k * 0.01).spin); // 12 s
  assert.ok(spins.some((s, k) => k + 100 < spins.length && spins[k + 100] - s >= 2 * Math.PI), 'now and then a quick turn');
});

// the owner: a star that moves must come to rest facing front, never on its side
const offFront = spin => Math.abs(Math.atan2(Math.sin(spin), Math.cos(spin))); // 0 facing front, π/2 on its side
test('stars come to rest facing front, never on their side', () => {
  for (let t = 0; t < 30; t += 0.1) assert.ok(offFront(barStar({ t, x: 300, y: 30, size: 20, litAt: Infinity }).spin) <= 0.4, `glass on the bar at ${t.toFixed(1)}`);
  for (const litAt of [10, 10.37, 11.9, 13.3]) {
    for (let life = 0; life < 3.9; life += 0.05) {
      const s = barStar({ t: litAt + 0.5 + life, x: 300, y: 30, size: 20, litAt });
      assert.ok(offFront(s.spin) <= 0.25, `reached at ${litAt}, ${life.toFixed(2)} s after its turn: ${offFront(s.spin).toFixed(2)} off the front`);
    }
  }
  const times = endTimes(5);
  const after = times.together + END.together - times.lands[0]; // after the five turned together, before its next burst of turns
  for (let s = after + 0.1; s < 4.5; s += 0.05) {
    const star = endStar({ t: times.lands[0] + s, i: 0, earned: true, from: { x: 0, y: 0 }, to: { x: 100, y: 100 }, size: 80, times });
    assert.ok(offFront(star.spin) <= 0.35, `the end's star ${s.toFixed(2)} s after landing`);
  }
});

// five stars on the bar must not crowd (4 and 5 are 12 % apart): they stand evenly, and the gold runs evenly between them
test('the bar: its stars stand evenly, the gold reaches each just as its share is played', () => {
  assert.deepEqual(STAR_SHARES.map(s => Math.round(barPlace(s) * 600) / 100), [1, 2, 3, 4, 5], 'a sixth of the bar apart');
  assert.equal(barPlace(0), 0);
  assert.equal(barPlace(1), 1);
  assert.equal(barPlace(-1), 0);
  assert.equal(barPlace(2), 1);
  for (let s = 0; s < 1; s += 0.01) assert.ok(barPlace(s + 0.01) > barPlace(s), 'the gold only grows');
});
