// The menu of Slóeðla's song game (lab page): the best stars kept on the device, the steps and what the DJ says and plays,
// the DJ's lines and the songs' previews and pictures on disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBest } from '../engine/sloedla/best.js';
import { createMenu } from '../engine/sloedla/menu.js';

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

const songs = [{ id: 'pixel' }, { id: 'stattu-upp' }];

test('menu: who plays, then the songs; a pick says its line and plays its bit; back and other', () => {
  const menu = createMenu({ songs });
  menu.unlock();
  assert.deepEqual(menu.choose('stig', 'fullordinn'), []);
  menu.choose('brautir', 2);
  assert.deepEqual(menu.toSongs(), [{ hush: true }, { say: 'hvadalag' }]);
  assert.deepEqual(menu.pick('stattu-upp'), [{ hush: true }, { stop: true }, { say: 'lag-stattu-upp' }, { brot: 'stattu-upp' }]);
  assert.deepEqual(menu.pick('nope'), []);
  assert.deepEqual(menu.play(), { song: 'stattu-upp', level: 'fullordinn', lanes: 2 });
  assert.deepEqual(menu.other(), [{ say: 'hvadalag' }]);
  assert.equal(menu.state().step, 'lag');
  assert.deepEqual(menu.back(), [{ hush: true }, { stop: true }, { say: 'hverspilar' }]);
  assert.equal(menu.state().step, 'hver');
});

test('menu: nothing before the first tap; the greeting once when it opens the sound', () => {
  const menu = createMenu({ songs });
  assert.deepEqual(menu.toSongs(), [{ hush: true }]);
  assert.deepEqual(menu.pick('pixel'), [{ hush: true }, { stop: true }]);
  menu.back();
  assert.deepEqual(menu.unlock(), [{ say: 'hverspilar' }]);
  assert.deepEqual(menu.unlock(), []);
});

test('menu: no song, no play; an address song is picked when the songs open', () => {
  assert.equal(createMenu({ songs }).play(), null);
  const menu = createMenu({ songs, song: 'pixel' });
  menu.toSongs();
  assert.equal(menu.state().song, 'pixel');
  assert.equal(createMenu({ songs, song: 'gamalt' }).state().song, null, 'an old or unknown id picks nothing');
});

test('menu: self-play opens on the songs with the address song picked', () => {
  const menu = createMenu({ songs, song: 'stattu-upp', self: true });
  assert.deepEqual(menu.state(), { step: 'lag', level: 'barn', lanes: 3, song: 'stattu-upp', heard: false });
});
