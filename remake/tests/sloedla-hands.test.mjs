import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HAND_IDS, clapPose, pairsOf, shapeOf } from '../engine/sloedla/hands.js';
import { peopleOf } from '../engine/sloedla/claps.js';

test('the clapping hands grow with the heard crowd, clap on the beat, and every hand is a picture we have', () => {
  // 4, 12, 24 people, then the whole hall: two pairs at the edges, then more, then every place along the bottom
  const shown = [0, 8, 16, 24].map(beats => pairsOf(peopleOf(beats), 12));
  assert.deepEqual(shown, [2, 4, 6, 12]);
  assert.equal(pairsOf(0, 12), 0, 'nobody clapping, no hands');
  assert.ok(pairsOf(peopleOf(24), 7) <= 7 && pairsOf(peopleOf(0), 7) === 2, 'upright: two first, never more than the places');
  // palms together on the beat with the jolt, wide apart early in the beat, swinging back in before the next
  assert.equal(clapPose(0).together, 1);
  assert.equal(clapPose(3).hit, 1, 'any beat');
  assert.ok(clapPose(0.42).together < 0.01 && clapPose(0.42).hit < 0.01);
  assert.ok(clapPose(0.75).together < clapPose(0.95).together && clapPose(0.95).together < 1);
  // the hands are the Openclipart files, each one path in a translated group
  for (const id of HAND_IDS) {
    const shape = shapeOf(fs.readFileSync(new URL(`../assets/sloedla/hendur/${id}.svg`, import.meta.url), 'utf8'));
    assert.ok(shape?.d.length > 200 && Number.isFinite(shape.dx) && shape.view.w === 420, `${id} reads`);
  }
  assert.match(fs.readFileSync(new URL('../assets/sloedla/hendur/KREDIT.md', import.meta.url), 'utf8'), /dripsandcastle/);
});
