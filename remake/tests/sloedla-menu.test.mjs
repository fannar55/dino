// The menu of Slóeðla's song game (lab page): the best stars kept on the device, the steps and what the DJ says and plays,
// the DJ's lines and the songs' previews and pictures on disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBest } from '../engine/sloedla/best.js';
import { createMenu } from '../engine/sloedla/menu.js';
import { DJ_LINES, createDj } from '../engine/sloedla/dj.js';
import { SONGS_V2 } from '../engine/sloedla/v2/songs/index.js';
import { createFakeContext } from './fake-audio.mjs';
import fs from 'node:fs';
import { createBrot } from '../engine/sloedla/brot.js';
import { timelineOf } from '../engine/sloedla/v2/format.js';

/** A storage in memory, like localStorage, with `seed` entries in it. */
function memoryStorage(seed = {}) {
  const store = new Map(Object.entries(seed));
  return { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
}

test('records: stars and points kept per song and level, each only ever higher', () => {
  const storage = memoryStorage();
  const best = createBest(storage);
  assert.deepEqual(best.get('pixel', 'barn'), { stars: 0, points: 0 });
  assert.equal(best.record('pixel', 'barn', { stars: 3, points: 6000 }), true);
  assert.equal(best.record('pixel', 'barn', { stars: 2, points: 7000 }), true, 'more points is a record');
  assert.equal(best.record('pixel', 'barn', { stars: 2, points: 5000 }), false);
  assert.deepEqual(best.get('pixel', 'fullordinn'), { stars: 0, points: 0 });
  assert.deepEqual(createBest(storage).get('pixel', 'barn'), { stars: 3, points: 7000 }, 'kept on the device');
});

test('records: the old three-star records are not read as five', () => {
  const storage = memoryStorage({ 'mosi-sloedla-best': JSON.stringify({ 'pixel/barn': 3 }) });
  assert.deepEqual(createBest(storage).get('pixel', 'barn'), { stars: 0, points: 0 });
});

test('records: a storage that throws, or none, works and remembers for the visit', () => {
  const broken = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
  for (const best of [createBest(broken), createBest(null)]) {
    assert.deepEqual(best.get('fonk', 'barn'), { stars: 0, points: 0 });
    assert.equal(best.record('fonk', 'barn', { stars: 4, points: 8200 }), true);
    assert.deepEqual(best.get('fonk', 'barn'), { stars: 4, points: 8200 });
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

test('every song has the DJ\'s line, more than one way of saying it', () => {
  for (const { id } of SONGS_V2) assert.ok(DJ_LINES[`lag-${id}`]?.length >= 2, id);
  assert.ok(DJ_LINES.hverspilar?.length >= 1 && DJ_LINES.hvadalag?.length >= 2);
  assert.equal(DJ_LINES['lag-stattu-upp'][0], 'Blár ópal! Stattu upp, svo gott að það ætti að vera bannað!');
});

test('hush stops the line he is saying', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  try {
    const context = createFakeContext({ state: 'running' });
    const talks = [];
    const dj = createDj({ context, output: context.destination, src: id => id, onTalk: (at, seconds) => talks.push(seconds) });
    await dj.load();
    assert.ok(dj.play('hvadalag') > 0);
    const take = context.bufferSources.at(-1);
    assert.ok(DJ_LINES.hvadalag.includes(dj.said()), 'the words of the take he says, for the bubble');
    dj.hush();
    assert.ok(take.stopTime !== undefined && take.stopTime <= context.currentTime + 0.1, 'stopped at once');
    assert.equal(talks.at(-1), 0, 'the music comes back up');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('every song has its preview on disk, about ten seconds, from inside the song', async () => {
  for (const entry of SONGS_V2) {
    const song = (await entry.load()).default;
    assert.ok(entry.brot >= 0 && entry.brot + 10 <= timelineOf(song).length, entry.id);
    assert.ok(fs.statSync(new URL(`../assets/audio/sloedla/v2/${entry.id}/brot.mp3`, import.meta.url)).size > 40_000, entry.id);
  }
});

test('the preview player: one at a time, faded out on stop', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  try {
    const context = createFakeContext({ state: 'running' });
    const brot = createBrot({ context, output: context.destination, src: id => id });
    await brot.play('a');
    const a = context.bufferSources.at(-1);
    await brot.play('b');
    const b = context.bufferSources.at(-1);
    assert.notEqual(a, b);
    assert.ok(a.stopTime !== undefined && a.stopTime <= context.currentTime + 0.35, 'the last one goes when the next comes');
    assert.equal(b.stopTime, undefined);
    brot.stop();
    assert.ok(b.stopTime !== undefined && b.stopTime <= context.currentTime + 0.35);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('every song has its picture on disk, its source and licence said', () => {
  const credits = fs.readFileSync(new URL('../assets/sloedla/valmynd/KREDIT.md', import.meta.url), 'utf8');
  for (const entry of [...SONGS_V2, { id: 'dj', card: 'dj.webp' }]) {
    assert.ok(fs.existsSync(new URL(`../assets/sloedla/valmynd/${entry.card}`, import.meta.url)), entry.id);
    assert.ok(credits.includes(entry.card), `KREDIT.md says where ${entry.card} is from`);
    if (entry.hue) assert.match(entry.hue, /^#[0-9a-f]{6}$/i);
  }
});
