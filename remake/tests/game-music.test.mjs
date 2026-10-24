import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameSfx, musicJsonUrl, readMusic, tunedTheme } from '../engine/audio/game-music.js';
import { createSfx } from '../engine/audio/sfx.js';
import { eittSounds, EITT_SFX, EITT_GAPS } from '../engine/eitt/eitt-sounds.js';
import { halsSounds, HALS_SFX, HALS_GAPS } from '../engine/hals/hals-sounds.js';
import { createFakeContext, pitchesOf, withFetch } from './fake-audio.mjs';

// A game with music of its own tunes its effects to that music (engine/audio/game-music.js): "Eitt!" and Háls og hali each to its
// own track, by the music.json beside the track (tools/theme-tempo.mjs --file). A game without one follows the page's theme.

const AUDIO = new URL('../assets/audio/', import.meta.url);
const read = path => JSON.parse(fs.readFileSync(new URL(path, AUDIO), 'utf8'));
const PAGE = read('theme.json'); // chapter 1's page: Little Dino Green Valley, C major
const TRAIL = read('kafli2/theme.json'); // chapter 2's page: Dino Trail, B-flat
const ELSEWHERE = { ...PAGE, key: [440, 495, 556.25, 660, 742.5] }; // A major, so nothing passes by luck
const GAMES = [
  { name: 'Eitt!', music: 'eitt/music.mp3', sounds: eittSounds, names: EITT_SFX, gaps: EITT_GAPS, source: '../engine/eitt/table.js' },
  { name: 'Háls og hali', music: 'hals/music.mp3', sounds: halsSounds, names: HALS_SFX, gaps: HALS_GAPS, source: '../engine/hals/game.js' },
];
const seeded = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

/** A fetch that answers from the files on disk, a 404 for one that is not there. */
const fromDisk = url => {
  const path = new URL(url);
  if (!fs.existsSync(path)) return { ok: false, status: 404, json: async () => { throw new SyntaxError('Unexpected token <'); } };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(path, 'utf8')) };
};

/** Every pitch each of `names` schedules on `sfx` (one name after another, the context moved on between), in order. */
function pitchesOfAll(context, sfx, names) {
  const all = [];
  for (const name of names) {
    const before = context.oscillators.length;
    sfx.play(name, { index: 3 });
    all.push([name, context.oscillators.slice(before).flatMap(pitchesOf)]);
    context.advance(10);
  }
  return all;
}

/** What `names` play with plain effects tuned to `theme`. */
function plain(game, theme) {
  const context = createFakeContext({ state: 'running' });
  return pitchesOfAll(context, createSfx({ context, theme, random: seeded(5), sounds: game.sounds, gaps: game.gaps }), game.names);
}

/** What `names` play on a game's own effects (createGameSfx) on a page with `theme`, once they know their music. */
async function gameEffects(game, theme, music = new URL(game.music, AUDIO).href) {
  const context = createFakeContext({ state: 'running' });
  return withFetch(async asked => {
    const sfx = createGameSfx({ music, context, theme, random: seeded(5), sounds: game.sounds, gaps: game.gaps });
    const tuned = await sfx.ready;
    return { asked, tuned, pitches: pitchesOfAll(context, sfx, game.names) };
  }, fromDisk);
}

const pitchClass = (hz, tuningCents = 0) => (((Math.round(12 * Math.log2(hz / 440) - tuningCents / 100) + 9) % 12) + 12) % 12;
const centsApart = (a, b) => Math.abs(1200 * Math.log2(a / b));

test('each game\'s track has a music.json beside it: its tempo, and its key, measured, C major root first at its own tuning', () => {
  assert.equal(musicJsonUrl('http://x/remake/assets/audio/eitt/music.mp3'), 'http://x/remake/assets/audio/eitt/music.json');
  for (const path of ['eitt/music.json', 'hals/music.json']) {
    const music = read(path);
    assert.equal(music.src, 'music.mp3', path);
    assert.ok(typeof music.name === 'string' && music.name.length > 0, `${path} is named`);
    assert.ok(music.bpm > 60 && music.bpm < 180 && music.beatOffset >= 0, `${path}: a tempo and a first beat`);
    assert.equal(music.key.length, 5);
    assert.deepEqual(music.key.map(hz => pitchClass(hz, music.tuningCents)), [0, 2, 4, 7, 9], `${path}: C D E G A, do first`);
    for (const [i, semis] of [0, 2, 4, 7, 9].entries()) {
      const hz = 440 * 2 ** ((72 + semis - 69) / 12 + music.tuningCents / 1200);
      assert.ok(centsApart(music.key[i], hz) < 0.1, `${path}: ${music.key[i]} Hz is ${semis} semitones over C5 at ${music.tuningCents} cents`);
    }
    assert.ok(fs.existsSync(new URL(path.replace('.json', '.mp3'), AUDIO)), `${path}: beside its track`);
  }
});

test('each game\'s effects take its own music\'s key, whatever the page\'s theme', async () => {
  for (const game of GAMES) {
    const music = read(game.music.replace('.mp3', '.json'));
    for (const page of [PAGE, TRAIL, ELSEWHERE]) {
      const { asked, tuned, pitches } = await gameEffects(game, page);
      assert.deepEqual(asked, [new URL(game.music.replace('.mp3', '.json'), AUDIO).href], `${game.name} reads its track's music.json`);
      assert.equal(tuned, true, `${game.name} is tuned to its music`);
      assert.deepEqual(pitches, plain(game, { ...page, key: music.key }), `${game.name} on a page in ${page.key[0]} Hz plays in its music's key`);
    }
    // and the key matters: on a page elsewhere, its own effects would have played other notes
    assert.notDeepEqual(plain(game, { ...ELSEWHERE, key: music.key }), plain(game, ELSEWHERE), `${game.name}'s notes follow the key`);
  }
});

test('a game whose track has no music.json follows the page\'s theme, as every game once did', async () => {
  const game = GAMES[0];
  const { asked, tuned, pitches } = await gameEffects(game, ELSEWHERE, new URL('yatzy-junior/music.mp3', AUDIO).href); // Litla Yatzy has no music yet
  assert.equal(asked.length, 1);
  assert.equal(tuned, false);
  assert.deepEqual(pitches, plain(game, ELSEWHERE));
  // a music.json without five notes, a track that is not there at all, and no music named: the page's theme
  assert.equal(tunedTheme(ELSEWHERE, { key: [440, 495] }), ELSEWHERE);
  assert.equal(tunedTheme(ELSEWHERE, null), ELSEWHERE);
  assert.equal(await withFetch(() => readMusic('not a url'), fromDisk), null);
  const context = createFakeContext({ state: 'running' });
  const none = createGameSfx({ context, theme: ELSEWHERE, random: seeded(5), sounds: game.sounds, gaps: game.gaps });
  assert.equal(await none.ready, false);
  assert.deepEqual(pitchesOfAll(context, none, game.names), plain(game, ELSEWHERE));
  // silent (a capture): nothing is fetched, and nothing plays
  const silent = await withFetch(async asked => ({ asked, sfx: createGameSfx({ music: new URL(game.music, AUDIO).href, theme: PAGE }) }), fromDisk);
  assert.deepEqual(silent.asked, []);
  assert.equal(silent.sfx.play('tap'), false);
});

test('effects tuned once the music is known keep whether they are muted and held', async () => {
  const game = GAMES[1];
  const context = createFakeContext({ state: 'running' });
  await withFetch(async () => {
    const sfx = createGameSfx({ music: new URL(game.music, AUDIO).href, context, theme: ELSEWHERE, sounds: game.sounds, gaps: game.gaps });
    sfx.muted = true;
    assert.equal(await sfx.ready, true);
    assert.equal(sfx.muted, true);
    assert.equal(sfx.play('tap'), false, 'still muted');
    sfx.muted = false;
    assert.equal(sfx.play('tap'), true);
    sfx.setPaused(true);
    assert.equal(sfx.play('roll'), false, 'held');
    sfx.setPaused(false);
    assert.equal(sfx.play('roll'), true);
  }, fromDisk);
});

test('the games build their effects with createGameSfx on their own track; on chapter 1\'s page that moves them by a few cents at most', () => {
  for (const game of GAMES) {
    const text = fs.readFileSync(new URL(game.source, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    assert.match(text, /import \{ createGameSfx \} from '\.\.\/audio\/game-music\.js';/, game.name);
    assert.doesNotMatch(text, /createSfx\(/, `${game.name} makes no effects of its own beside them`);
    assert.match(text, new RegExp(`const MUSIC = asset\\('assets/audio/${game.music.replace('.', '\\.')}'\\);`), `${game.name} plays ${game.music}`);
    assert.match(text, /createGameSfx\(\{\s*music: (MUSIC|musicUrl),/, `${game.name} tunes its effects to that track`);
    // chapter 1's theme is C major too: its games were in their music's key already, within a few cents
    const music = read(game.music.replace('.mp3', '.json'));
    for (let i = 0; i < 5; i++) assert.ok(centsApart(music.key[i], PAGE.key[i]) < 4, `${game.name}: ${music.key[i]} against the page's ${PAGE.key[i]}`);
  }
});
