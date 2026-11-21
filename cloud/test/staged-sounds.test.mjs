// The old game's sounds the staged site must hold (cloud/src/staged-sounds.mjs): the files under dist/assets/audio/ that the
// game's lines (remake/assets/audio/lines.json) point at. A line's `src` is an address relative to remake/, the page's folder,
// as the browser resolves it: "../dist/assets/audio/welcome.mp3" is /dist/assets/audio/welcome.mp3. From 12 to 21 November 2026
// staging looked for "../../dist/..." instead, found none, and the cloud answered 404 for Mosi's welcome in chapter 1 and for
// every line of Þrívíddarsafnið, while both played at home.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { distAudioOf, missingDistAudio } from '../src/staged-sounds.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lines = JSON.parse(fs.readFileSync(path.join(repo, 'remake/assets/audio/lines.json'), 'utf8'));

test('a line whose src leads into dist/assets/audio/ names that file, however the address is written; any other line names none', () => {
  const named = distAudioOf({
    welcome: { src: '../dist/assets/audio/welcome.mp3' },
    dotted: { src: './../dist/assets/audio/deep/one.mp3' },
    own: { src: 'assets/audio/kafli1/k1_mosi_hello.mp3' },
    outside: { src: '../../dist/assets/audio/not-in-the-site.mp3' },
    vendor: { src: '../dist/vendor/three.js' },
    silent: { text: 'no sound yet' },
    broken: null,
  });
  assert.deepEqual([...named].sort(), ['deep/one.mp3', 'welcome.mp3']);
});

test('the game\'s own lines name the old game\'s sounds it plays: Mosi\'s welcome and the lines of Þrívíddarsafnið', () => {
  const named = distAudioOf(lines);
  assert.ok(named.has('welcome.mp3'), 'chapter 1 opens with it (chapters/kafli1.js, audio: \'welcome\')');
  for (const id of ['name_trex', 'statue_trex_special', 'name_stegosaurus', 'statue_stegosaurus_special']) {
    assert.ok(named.has(`${id}.mp3`), `Þrívíddarsafnið says ${id} (chapters/safn3d.js)`);
  }
  const pointing = Object.values(lines).filter(entry => /(^|\/)dist\/assets\/audio\//.test(entry?.src ?? '')).length;
  assert.ok(pointing > 0 && named.size > 0);
  assert.equal(named.size, new Set(Object.values(lines).map(entry => entry?.src).filter(src => /(^|\/)dist\/assets\/audio\//.test(src ?? ''))).size,
    'every line that points into dist/assets/audio/ is counted: none is lost to the way its address is written');
});

test('every old-game sound the lines name is in the repo, so staging can copy it', () => {
  assert.deepEqual(missingDistAudio(distAudioOf(lines), path.join(repo, 'dist/assets/audio')), []);
  assert.deepEqual(missingDistAudio(new Set(['welcome.mp3', 'never-recorded.mp3']), path.join(repo, 'dist/assets/audio')), ['never-recorded.mp3']);
});

test('stage.mjs takes the list from here and refuses to stage when a named sound is missing', () => {
  const stage = fs.readFileSync(path.join(repo, 'cloud/stage.mjs'), 'utf8');
  assert.match(stage, /from '\.\/src\/staged-sounds\.mjs'/);
  assert.match(stage, /distAudioOf\(/);
  assert.match(stage, /missingDistAudio\(/);
  assert.doesNotMatch(stage, /\\\.\\\.\\\/\\\.\\\.\\\/dist/, 'no pattern of its own for the address');
});
