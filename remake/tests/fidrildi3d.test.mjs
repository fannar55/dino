// Fiðrildadansinn (chapters/fidrildi3d.js), round 6: the walk the forest is cleared for is the walk she walks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { THOR_FROM, leaveOut } from '../chapters/fidrildi3d.js';
import { WALK } from '../chapters/fidrildi3d-walk.js';
import { plantVolumes } from '../engine/tree-probe.js';

test('the sweep in fidrildi3d-walk.js was made for her way in as it is (make it again: clip-probe.mjs --sweep)', () => {
  assert.ok(WALK, 'the sweep is there');
  assert.deepEqual(WALK.route, THOR_FROM, 'made for this THOR_FROM');
  assert.ok(WALK.poses.length > 100 && WALK.capsules.length > 300, 'her places through the walk and her capsules at several moments');
  const [first] = WALK.poses, last = WALK.poses[WALK.poses.length - 1];
  assert.ok(Math.hypot(first[0] - THOR_FROM[0][0], first[2] - THOR_FROM[0][1]) < 0.05, 'from where she stands at the start');
  assert.ok(Math.hypot(last[0] - WALK.spot[0], last[2] - WALK.spot[1]) < 0.05, 'to her spot');
});

// a plant of one box, `size` metres across and `height` tall, standing at (x, z)
function boxPlant(x, z, size, height) {
  const h = size / 2;
  const pos = [];
  for (const [a, b, c] of [[-h, 0, -h], [h, 0, -h], [h, 0, h], [-h, 0, h], [-h, height, -h], [h, height, -h], [h, height, h], [-h, height, h]]) pos.push(a, b, c);
  const idx = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  const placement = { name: 'box', x, y: 0, z, rot: 0, scale: 1, model: { solid: { pos, idx }, thin: null, height, radius: h } };
  const v = plantVolumes(placement);
  return [{ name: 'box', x, z, height, radius: h }, placement, v];
}

test('the place grows without a plant on her way and keeps one beside it, and the low ones she walks through', () => {
  const mid = WALK.poses[Math.floor(WALK.poses.length / 2)];
  assert.equal(leaveOut(...boxPlant(mid[0], mid[2], 1, 6).slice(0, 2)), true, 'a plant where she walks');
  assert.equal(leaveOut(...boxPlant(mid[0] + 20, mid[2] - 20, 1, 6).slice(0, 2)), false, 'one 28 m off her way');
  assert.equal(leaveOut(...boxPlant(mid[0], mid[2], 0.6, 1).slice(0, 2)), false, 'a low one (a fern) under her');
  const [, , v] = boxPlant(0, 0, 1, 6);
  assert.ok(v.discs.length >= 17 && v.discs.every(d => Math.abs(d.r - Math.SQRT1_2) < 1e-6 || d.r < 0.8), 'a box fits as discs round its corners');
});
