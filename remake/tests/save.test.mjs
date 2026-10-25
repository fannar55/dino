// The child's save (engine/save.js): forgetting it (the address ?nyr=1) and surviving a storage that fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSave, defaultChapter, forgetSave } from '../engine/save.js';

/** A storage of the test's own, as the browser's localStorage behaves. */
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), get size() { return map.size; } };
}

test('forgetSave takes the save away, and the next save starts from the first chapter', () => {
  const storage = memoryStorage({ 'mosi-remake-v1': JSON.stringify({ stars: ['k1_kambedla'], findings: ['beetle'], seen: [], places: [] }), other: 'kept' });
  assert.equal(defaultChapter(createSave(storage)), 'kafli2', 'with Kambeðla\'s star the save is at chapter 2');
  forgetSave(storage);
  assert.equal(storage.getItem('mosi-remake-v1'), null);
  assert.equal(storage.getItem('other'), 'kept', 'only the game\'s own key goes');
  const fresh = createSave(storage);
  assert.deepEqual(fresh.get(), { stars: [], findings: [], seen: [], places: [] });
  assert.equal(defaultChapter(fresh), 'kafli1');
});

test('forgetSave never throws: no storage, or one that fails', () => {
  assert.doesNotThrow(() => forgetSave(null));
  assert.doesNotThrow(() => forgetSave({ removeItem() { throw new Error('blocked'); } }));
});
