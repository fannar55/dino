// The tools of Slóeðla's new song system: the variety check (every song its own) and, later, the stem charts and the music
// tool's own forms. The owner's lean rule: a few tests of the fiddly parts.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formOf, tapLikeness, tapsOf, varietyProblems } from '../tools/sloedla-variety.mjs';
import { SONGS } from '../engine/sloedla/songs/index.js';
import { SONGS_V2 } from '../engine/sloedla/v2/songs/index.js';
import { makeSong } from './sloedla-v2-fixture.mjs';

const madeOld = entry => !entry.file || fs.existsSync(new URL(`../engine/sloedla/songs/${entry.file}`, import.meta.url));
const madeNew = entry => fs.existsSync(new URL(`../engine/sloedla/v2/songs/${entry.file}`, import.meta.url));

test('variety: taps, form and likeness; every v2 song is its own', async () => {
  const song = makeSong();
  assert.equal(formOf(song), '2A 8B 8C 8B 4D');
  const taps = tapsOf(song);
  assert.equal(taps.length, 30);
  assert.equal(taps[2], 'a0,c4');
  assert.equal(taps[3], 'b0,c4');
  assert.equal(tapLikeness(['a0', 'b4'], ['a0', 'c4']), 0.5);
  const fresh = await Promise.all(SONGS_V2.filter(madeNew).map(async entry => (await entry.load()).default));
  const old = await Promise.all(SONGS.filter(madeOld).map(async entry => (await entry.load()).default));
  assert.ok(fresh.length >= 1 && old.length >= 4);
  assert.ok(tapsOf(old[0]).length > 30, 'an old song has its taps too');
  assert.deepEqual(varietyProblems(fresh, [...old, ...fresh]), []);
  assert.ok(varietyProblems([song], [song, { ...song, id: 'twin' }]).some(p => p.includes('twin')), 'a twin is caught');
});
