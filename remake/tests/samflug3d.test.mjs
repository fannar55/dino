import test from 'node:test';
import assert from 'node:assert/strict';
import { laneHalf, groundClear, entersAt, CLEAR, TRUNKS, D, CAM_H, tanH, tanV, lanePlants, START_Z, LENGTH, SPEED, LANE } from '../chapters/samflug3d/stage.js';
import { herAt, butterflyAt, heroShare, blackAt, BUTTERFLY_COUNT, CRUISE } from '../chapters/samflug3d/timeline.js';

// Samflug's stage and timeline (chapters/samflug3d/): the lane rule and the 15 seconds.

test('the lane rule: a thing at the clear half width meets the side edge at D or further', () => {
  assert.ok(entersAt(CLEAR) >= D, `enters at ${entersAt(CLEAR).toFixed(2)} m, D ${D}`);
  assert.ok(Math.abs(laneHalf(11, 0.679, 0) - 7.469) < 1e-3);
  assert.ok(TRUNKS[0] > CLEAR + 2, 'the first row of trunks stands well outside the clear width (its crowns reach in)');
});

test('the ground at the bottom edge is D away or further (a level camera CAM_H over the highest ground)', () => {
  assert.ok(CAM_H >= groundClear(D, tanV), `${CAM_H} m over the ground, ${groundClear(D, tanV).toFixed(2)} needed`);
});

test('no planted thing stands inside the clear width, and the lane is planted beyond where the camera goes and looks', () => {
  for (const p of lanePlants()) assert.ok(Math.abs(p.position[0]) > CLEAR, `${p.name} at ${p.position}`);
  assert.ok(LANE.from > START_Z + LENGTH * SPEED.max + 10);
  assert.ok(LANE.to < START_Z - 120);
});

test('her place is continuous over the 15 seconds (no pop) and she is in the cruise place at the beats\' joins', () => {
  let last = herAt(0);
  for (let t = 0.02; t <= 15; t += 0.02) {
    const h = herAt(t);
    assert.ok(Math.abs(h.k - last.k) < 0.12 && Math.abs(h.u - last.u) < 0.01 && Math.abs(h.bank - last.bank) < 0.5, `a jump at ${t.toFixed(2)} s`);
    last = h;
  }
  assert.ok(Math.abs(herAt(4).k - CRUISE.k) < 0.02);
  assert.equal(heroShare(12), 1);
  assert.equal(heroShare(9), 0);
});

test('the butterflies stay out of the hero moment and inside the middle while in front of k 0.65', () => {
  for (let i = 0; i < BUTTERFLY_COUNT; i++) {
    for (let t = 0; t <= 15; t += 0.05) {
      const [u, , k, size] = butterflyAt(i, t);
      if (!size) continue;
      if (k < 0.65) assert.ok(u > 0.2 && u < 0.8, `butterfly ${i} at u ${u.toFixed(2)} k ${k.toFixed(2)}, ${t.toFixed(2)} s`);
      if (heroShare(t) > 0.2) assert.ok(k > 0.9, `butterfly ${i} still near at ${t.toFixed(2)} s`);
    }
  }
});

test('the loop dips through black at its join', () => {
  assert.equal(blackAt(0), 1);
  assert.equal(blackAt(15), 1);
  assert.equal(blackAt(7), 0);
});

test('the frame shapes', () => {
  assert.ok(Math.abs(2 * tanH - 1.358) < 0.002);
});
