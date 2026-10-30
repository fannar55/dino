// The menu of Slóeðla's song game (lab page): the best stars kept on the device, the steps and what the DJ says and plays,
// the DJ's lines and the songs' previews and pictures on disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBest } from '../engine/sloedla/best.js';

test('best stars: kept per song and level, only ever higher', () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const best = createBest(storage);
  assert.equal(best.get('pixel', 'barn'), 0);
  assert.equal(best.record('pixel', 'barn', 2), true);
  assert.equal(best.record('pixel', 'barn', 1), false);
  assert.equal(best.get('pixel', 'barn'), 2);
  assert.equal(best.get('pixel', 'fullordinn'), 0);
  assert.equal(createBest(storage).get('pixel', 'barn'), 2, 'still there next time');
});

test('best stars: a storage that throws, or none, works and remembers for the visit', () => {
  const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  for (const best of [createBest(broken), createBest(null)]) {
    assert.equal(best.get('fonk', 'barn'), 0);
    assert.equal(best.record('fonk', 'barn', 3), true);
    assert.equal(best.get('fonk', 'barn'), 3);
  }
});
