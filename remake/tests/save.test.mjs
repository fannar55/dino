// The child's save (engine/save.js): forgetting it (the address ?nyr=1) and surviving a storage that fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { awardSticker, createSave, defaultChapter, forgetSave } from '../engine/save.js';

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

test('an old chapter 2 save (Þórseðla\'s star, no Uggeðla\'s) opens chapter 2 and loses nothing', () => {
  const stored = {
    stars: ['k1_kambedla', 'k2_thorsedla'], findings: ['beetle', 'dragonfly'], seen: ['mosi'],
    places: ['fen', 'sloedla', 'flugedla', 'uggedla'], hals: { found: [], played: true },
  };
  const storage = memoryStorage({ 'mosi-remake-v1': JSON.stringify(stored) });
  const save = createSave(storage);
  assert.equal(defaultChapter(save), 'kafli2', 'she meets Uggeðla, whose place she has on her map already');
  assert.deepEqual(save.get(), { stars: stored.stars, findings: stored.findings, seen: stored.seen, places: stored.places });
  assert.equal(save.getHalsPlay().played, true, 'Háls og hali stays open');
  // and Uggeðla's star takes her on: to chapter 4, as she has Þórseðla's star already (chapter 4's spec, section 7; the "Áfram"
  // at the end of chapter 2 still leads to chapter 3)
  assert.equal(save.addStar('k2_uggedla'), true);
  assert.equal(defaultChapter(save), 'kafli4');
  assert.deepEqual(save.get().places, stored.places, 'the places are as they were');
});

test('forgetSave never throws: no storage, or one that fails', () => {
  assert.doesNotThrow(() => forgetSave(null));
  assert.doesNotThrow(() => forgetSave({ removeItem() { throw new Error('blocked'); } }));
});

test('minigame stickers persist cleanly, omit empty sticker objects, and awardSticker posts to the book frame', () => {
  const storage = memoryStorage();
  const save = createSave(storage);
  assert.deepEqual(save.getStickers(), { hals: 0, junior: 0, sloedla: 0, minnisspil: 0 });
  save.addStar('k1_kambedla');
  assert.equal('stickers' in JSON.parse(storage.getItem('mosi-remake-v1')), false, 'no stickers key stored until won');

  save.addSticker('junior');
  save.addSticker('sloedla');
  save.addSticker('sloedla');
  save.addSticker('hals');
  save.addSticker('minnisspil');
  const reloaded = createSave(storage);
  assert.deepEqual(reloaded.getStickers(), { hals: 1, junior: 1, sloedla: 2, minnisspil: 1 });
  assert.deepEqual(reloaded.get().stars, ['k1_kambedla']);

  const posted = [];
  const subWin = {
    location: { origin: 'https://mosi.fannar55.workers.dev' },
    parent: { postMessage: (msg, origin) => posted.push([msg, origin]) },
  };
  awardSticker('sloedla', subWin);
  assert.deepEqual(posted, [[{ type: 'mosi:sticker', game: 'sloedla' }, 'https://mosi.fannar55.workers.dev']]);
});
