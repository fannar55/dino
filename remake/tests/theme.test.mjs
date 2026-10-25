import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadTheme, themeUrlOf, DEFAULT_THEME } from '../engine/audio/theme.js';
import { beatsAt, followBeat, danceOf, danceAt, danceGrid, foldBeats, waveAt } from '../engine/beat.js';
import { createClock } from '../engine/clock.js';
import { createMusic } from '../engine/audio/music.js';
import { createSfx } from '../engine/audio/sfx.js';
import { FEN_SFX } from '../engine/audio/fen-sounds.js';
import { createBookAudio } from '../engine/book/book-audio.js';
import { BOOK_SFX } from '../engine/book/book-sounds.js';
import { createSave, defaultChapter } from '../engine/save.js';
import { chapter as kafli1 } from '../chapters/kafli1.js';
import { chapter as kafli2 } from '../chapters/kafli2.js';
import { centsFromKey, createFakeContext, FakeMediaElement, peakThrough, pitchesOf, withFetch } from './fake-audio.mjs';

// Each chapter's theme (engine/audio/theme.js): chapter 1's page plays "Little Dino Green Valley" (assets/audio/theme.json), chapter 2's
// "Dino Trail" (assets/audio/kafli2/theme.json), read once as the page loads, with the default if the chapter's cannot be read. Chapter
// 2's effects are tuned to its key, B-flat major, and its forest dances on every second of its 133.3 beats a minute (danceBeats).

const AUDIO = new URL('../assets/audio/', import.meta.url); // what main.js reads themes against: assets/audio/ beside it
const readJson = url => JSON.parse(fs.readFileSync(url, 'utf8'));
const DEFAULT = readJson(new URL('theme.json', AUDIO));
const TRAIL = readJson(new URL('kafli2/theme.json', AUDIO));
const MAIN = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const FRAME = 1 / 60;
const near = (a, b, tolerance, what = '') => assert.ok(Math.abs(a - b) <= tolerance, `${what ? `${what}: ` : ''}${a} is not within ${tolerance} of ${b}`);

/** A fetch that answers from the files on disk: a file that is not there is a 404, as the page's server says. */
const fromDisk = url => {
  const path = new URL(url);
  if (!fs.existsSync(path)) return { ok: false, status: 404, json: async () => { throw new SyntaxError('Unexpected token <'); } };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(path, 'utf8')) };
};

/** The theme a page loads, as main.js picks its chapter: ?chapter= or the one the save is at. Resolves { asked, theme, url }. */
async function pageTheme(search, stars = []) {
  const save = createSave(null);
  for (const star of stars) save.addStar(star);
  const id = (new URLSearchParams(search).get('chapter') || defaultChapter(save)).replace(/[^a-z0-9_-]/gi, '');
  const { chapter } = await import(`../chapters/${id}.js`);
  return withFetch(async asked => ({ asked, ...(await loadTheme(chapter, AUDIO)) }), fromDisk);
}

/** Runs `run` with console.warn caught, and says what it was told. */
async function warned(run) {
  const original = console.warn;
  const told = [];
  console.warn = (...args) => told.push(args.map(String).join(' '));
  try {
    return { told, result: await run() };
  } finally {
    console.warn = original;
  }
}

// ---------------------------------------------------------------------------------------------
// Which theme a page reads

test('chapter 2\'s page asks for kafli2/theme.json, Dino Trail, and chapter 1\'s for theme.json, as before', async () => {
  assert.equal(kafli2.theme, 'kafli2/theme.json', 'chapter 2 names its own theme');
  assert.equal(kafli1.theme, undefined, 'chapter 1 names none: it plays the default');
  for (const [search, stars] of [['?chapter=kafli2', []], ['', ['k1_kambedla']]]) {
    const { told, result } = await warned(() => pageTheme(search, stars));
    assert.deepEqual(result.asked, [new URL('kafli2/theme.json', AUDIO).href], `${search || 'a save with Kambeðla\'s star'} asks for Dino Trail only`);
    assert.equal(result.url.href, new URL('kafli2/theme.json', AUDIO).href, 'its song is read against its own theme.json');
    assert.deepEqual(result.theme, TRAIL);
    assert.equal(result.theme.name, 'Dino Trail');
    assert.equal(new URL(result.theme.src, result.url).href, new URL('kafli2/theme.mp3', AUDIO).href, 'so the music streams kafli2/theme.mp3');
    assert.deepEqual(told, [], 'and says nothing');
  }
  for (const [search, stars] of [['?chapter=kafli1', []], ['', []]]) {
    const { told, result } = await warned(() => pageTheme(search, stars));
    assert.deepEqual(result.asked, [new URL('theme.json', AUDIO).href], `${search || 'a new child'} asks for theme.json only`);
    assert.equal(result.url.href, new URL('theme.json', AUDIO).href);
    assert.deepEqual(result.theme, DEFAULT, 'the theme it always had, Little Dino Green Valley at 95');
    assert.equal(new URL(result.theme.src, result.url).href, new URL('theme.mp3', AUDIO).href);
    assert.deepEqual(told, []);
  }
  assert.equal(themeUrlOf({}, AUDIO).href, new URL(DEFAULT_THEME, AUDIO).href, 'a chapter that names no theme plays the default');
  assert.equal(themeUrlOf(null, AUDIO).href, new URL(DEFAULT_THEME, AUDIO).href);
});

test('main.js reads the chapter\'s theme once, before it makes the music, and hands the theme and its URL to every sound', () => {
  assert.match(MAIN, /import \{ loadTheme \} from '\.\/engine\/audio\/theme\.js';/);
  assert.match(MAIN, /const \{ theme, url: themeUrl \} = await loadTheme\(chapter, new URL\('\.\/assets\/audio\/', import\.meta\.url\)\);/);
  assert.doesNotMatch(MAIN, /assets\/audio\/theme\.json/, 'no theme.json of its own: the chapter says which');
  const chapterAt = MAIN.indexOf('const { chapter } = await import(');
  const themeAt = MAIN.indexOf('await loadTheme(chapter');
  const musicAt = MAIN.indexOf('createMusic({');
  assert.ok(chapterAt > 0 && chapterAt < themeAt && themeAt < musicAt, 'the chapter is chosen, then its theme read, then the music made');
  assert.match(MAIN, /createMusic\(\{ context: audio, theme, clock, base: themeUrl, output \}\)/);
  assert.match(MAIN, /createSfx\(\{ context: audio, theme, output \}\)/);
  assert.match(MAIN, /createBookAudio\(\{ context: audio, output, theme, lines \}\)/);
  assert.match(MAIN, /no live switch/, 'it says why one read is enough: the hand-over is a new page');
  assert.equal(MAIN.match(/loadTheme\(/g).length, 1, 'read once');
});

test('a chapter\'s theme that cannot be read gives the default, said once; with no theme at all the forest sways without the beat', async () => {
  const default_ = new URL('theme.json', AUDIO).href;
  for (const [what, answer] of [
    ['missing', fromDisk],
    ['not JSON', url => (url.endsWith('broken/theme.json') ? { ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } } : fromDisk(url))],
    ['without a tempo', url => (url.endsWith('broken/theme.json') ? { ok: true, status: 200, json: async () => ({ src: 'x.mp3' }) } : fromDisk(url))],
    ['unreachable', url => { if (url.endsWith('broken/theme.json')) throw new TypeError('Failed to fetch'); return fromDisk(url); }],
  ]) {
    const { told, result } = await warned(() => withFetch(async asked => ({ asked, ...(await loadTheme({ theme: 'broken/theme.json' }, AUDIO)) }), answer));
    assert.deepEqual(result.asked, [new URL('broken/theme.json', AUDIO).href, default_], `${what}: the chapter's, then the default`);
    assert.deepEqual(result.theme, DEFAULT, `${what}: the default theme plays`);
    assert.equal(result.url.href, default_, `${what}: and its song is read against the default's URL`);
    assert.equal(told.length, 1, `${what}: said once (${told.join(' | ')})`);
    assert.match(told[0], /broken\/theme\.json/, 'naming the file');
  }
  // neither can be read: no theme, and the warning the page always gave
  const { told, result } = await warned(() => withFetch(() => loadTheme({ theme: 'broken/theme.json' }, AUDIO), () => ({ ok: false, status: 404 })));
  assert.equal(result.theme, null);
  assert.equal(told.length, 2);
  assert.match(told[1], /No theme tempo found/);
  // a default that cannot be read for a chapter that names none: only the old warning, and no second try
  const plain = await warned(() => withFetch(async asked => ({ asked, ...(await loadTheme(kafli1, AUDIO)) }), () => ({ ok: false, status: 404 })));
  assert.equal(plain.result.asked.length, 1);
  assert.deepEqual(plain.told, ['No theme tempo found; the forest sways without the beat.']);
});

// ---------------------------------------------------------------------------------------------
// Dino Trail's key: chapter 2's sounds in B-flat

const A4 = 441.04; // Dino Trail's tuning, measured on its file (+4.1 cents): its notes are equal-tempered from this A
const pitchClass = hz => (((Math.round(12 * Math.log2(hz / A4)) + 9) % 12) + 12) % 12; // C is 0
const offTuning = hz => Math.abs(12 * Math.log2(hz / A4) - Math.round(12 * Math.log2(hz / A4))) * 100; // cents off the semitones
const B_FLAT_PENTATONIC = new Set([10, 0, 2, 5, 7]); // B-flat C D F G
const C_PENTATONIC = new Set([0, 2, 4, 7, 9]); // chapter 1's C D E G A
const sfxFor = theme => {
  const context = createFakeContext({ state: 'running' });
  let seed = 7;
  return { context, sfx: createSfx({ context, theme, random: () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296 }) };
};

test('Dino Trail\'s key is B-flat major\'s pentatonic, root first as theme-tempo.mjs writes it, so every sound\'s key[0] is its do', () => {
  assert.equal(TRAIL.key.length, 5);
  for (const hz of TRAIL.key) assert.ok(offTuning(hz) < 1.5, `${hz} Hz is a semitone of A4 = ${A4}`);
  assert.deepEqual(TRAIL.key.map(pitchClass), [10, 0, 2, 5, 7], 'B-flat C D F G: do re mi sol la');
  for (let i = 1; i < 5; i++) assert.ok(TRAIL.key[i] > TRAIL.key[i - 1], 'climbing');
  assert.ok(TRAIL.key[4] < 2 * TRAIL.key[0], 'inside one octave, so the scale climbs on into the next');
  assert.deepEqual(DEFAULT.key.map(hz => pitchClass(hz)), [0, 2, 4, 7, 9], 'chapter 1\'s stays C major\'s');
});

test('with Dino Trail the counting tone climbs B-flat\'s pentatonic, 1 to 10: every note of it a note of the key, in any octave', () => {
  const { context, sfx } = sfxFor(TRAIL);
  const mains = [];
  const outsideC = new Set();
  for (let index = 1; index <= 10; index++) {
    const before = context.oscillators.length;
    assert.equal(sfx.play('countTone', { index }), true);
    const notes = context.oscillators.slice(before);
    assert.ok(notes.length > 0);
    for (const hz of notes.flatMap(pitchesOf)) {
      assert.ok(centsFromKey(hz, TRAIL.key) < 1, `${index}: ${hz.toFixed(2)} Hz is within a cent of the key`);
      assert.ok(B_FLAT_PENTATONIC.has(pitchClass(hz)) && offTuning(hz) < 1.5, `${index}: ${hz.toFixed(2)} Hz is B-flat C D F or G`);
      if (!C_PENTATONIC.has(pitchClass(hz))) outsideC.add(pitchClass(hz));
    }
    const loudest = Math.max(...notes.map(n => peakThrough(n, context.destination)));
    mains.push(Math.max(...notes.filter(n => peakThrough(n, context.destination) >= loudest - 1e-9).map(n => pitchesOf(n)[0])));
    context.advance(2);
  }
  for (let i = 1; i < 10; i++) assert.ok(mains[i] > mains[i - 1], `${i + 1} above ${i}`);
  assert.deepEqual(mains.map(pitchClass), [10, 0, 2, 5, 7, 10, 0, 2, 5, 7], 'do re mi sol la, twice: one starts on B-flat');
  near(mains[0], TRAIL.key[0], 0.01, 'one is the key\'s root');
  assert.deepEqual([...outsideC].sort((a, b) => a - b), [5, 10], 'F and B-flat sound: it is not C major');
});

test('with Dino Trail every pitched sound chapter 2 plays, and the book\'s, is in its key', () => {
  const chapterSounds = [...FEN_SFX, 'star', 'journal', 'flower', 'float'];
  for (const name of chapterSounds) {
    const { context, sfx } = sfxFor(TRAIL);
    for (const index of [1, 5, 10]) {
      sfx.play(name, { index, seconds: 8 });
      context.advance(12);
    }
    for (const hz of context.oscillators.flatMap(pitchesOf)) assert.ok(centsFromKey(hz, TRAIL.key) < 1, `${name}: ${hz.toFixed(2)} Hz is in B-flat`);
  }
  const context = createFakeContext({ state: 'running' });
  const book = createBookAudio({ context, theme: TRAIL, lines: {} });
  for (const name of BOOK_SFX) {
    book.sfx(name);
    context.advance(10);
  }
  assert.ok(context.oscillators.length > 0);
  for (const hz of context.oscillators.flatMap(pitchesOf)) assert.ok(centsFromKey(hz, TRAIL.key) < 1, `the book: ${hz.toFixed(2)} Hz is in B-flat`);
});

// ---------------------------------------------------------------------------------------------
// The forest's dance at 133.3 beats a minute: on every second beat

const beatTime = (theme, n) => theme.beatOffset + (n * 60) / theme.bpm; // the time of the theme's n-th beat

test('danceGrid: the theme itself without danceBeats, its tempo divided by danceBeats with, from the same beat 0', () => {
  assert.equal(danceGrid(DEFAULT), DEFAULT, 'chapter 1 dances on its own grid, the same object');
  assert.equal(danceGrid({ bpm: 134, beatOffset: 0.36, danceBeats: 1 }).bpm, 134);
  for (const odd of [0, -2, 1.5, '2', null]) assert.equal(danceGrid({ bpm: 134, beatOffset: 0.36, danceBeats: odd }).bpm, 134, `${odd} is no divisor`);
  const grid = danceGrid(TRAIL);
  assert.equal(TRAIL.danceBeats, 2);
  assert.equal(grid.bpm, TRAIL.bpm / 2);
  assert.ok(grid.bpm > 60 && grid.bpm < 100, `danced at ${grid.bpm} a minute, near chapter 1's 95`);
  assert.equal(grid.beatOffset, TRAIL.beatOffset);
  assert.ok(TRAIL.bpm > 130 && TRAIL.bpm < 136, 'the theme keeps its own tempo for the effects and the beat grid');
});

test('with danceBeats 2 the follower nods every other strong beat (every fourth beat of the song), without it every strong beat', () => {
  const run = (theme, seconds) => {
    const grid = danceGrid(theme);
    const nods = [];
    let followed = null;
    for (let t = 0; t < seconds; t += FRAME) {
      followed = followBeat(followed, beatsAt(t, grid), FRAME, grid, false);
      nods.push({ t, nod: danceOf(followed.beats, grid).nod });
    }
    return nods;
  };
  const nodsNear = (nods, time) => Math.max(...nods.filter(n => Math.abs(n.t - time) <= FRAME / 2 + 1e-9).map(n => n.nod));
  const trail = run(TRAIL, 12);
  const plain = run({ ...TRAIL, danceBeats: undefined }, 12);
  for (let n = 0; beatTime(TRAIL, n) < 11.5; n += 2) {
    const at = beatTime(TRAIL, n);
    if (n % 4 === 0) assert.ok(nodsNear(trail, at) > 0.99, `danced at half: the flowers are down on beat ${n} (${at.toFixed(3)} s)`);
    else assert.equal(nodsNear(trail, at), 0, `danced at half: up on beat ${n}, between two nods`);
    assert.ok(nodsNear(plain, at) > 0.99, `danced on every beat: down on every strong beat, ${n} too`);
  }
  // the same, read straight from the music's time (danceAt) and snapped (a capture)
  for (const n of [0, 4, 8, 400]) near(danceAt(beatTime(TRAIL, n), TRAIL).nod, 1, 1e-9, `beat ${n}`);
  for (const n of [2, 6, 402]) assert.equal(danceAt(beatTime(TRAIL, n), TRAIL).nod, 0, `beat ${n}`);
  const grid = danceGrid(TRAIL);
  near(danceOf(followBeat(null, beatsAt(beatTime(TRAIL, 8), grid), FRAME, grid, true).beats, grid).nod, 1, 1e-9, 'a capture on beat 8 has the flowers down');
});

test('danced at half its tempo the grass ripples by at most a tenth a frame, as the forest\'s rule asks; danced at its own it would not', () => {
  const steepest = theme => {
    const grid = danceGrid(theme);
    let most = 0, followed = null, last = null;
    for (let t = 0; t < 6; t += FRAME) {
      followed = followBeat(followed, beatsAt(t, grid), FRAME, grid, false);
      const waves = [1, 2, 4].map(period => waveAt(followed.beats, period));
      if (last) most = Math.max(most, ...waves.map((w, i) => Math.abs(w - last[i])));
      last = waves;
    }
    return most;
  };
  assert.ok(steepest(TRAIL) <= 0.1, `Dino Trail danced at half: ${steepest(TRAIL).toFixed(3)} a frame`);
  assert.ok(steepest(DEFAULT) <= 0.1, `chapter 1 at 95: ${steepest(DEFAULT).toFixed(3)}`);
  assert.ok(steepest({ ...TRAIL, danceBeats: 1 }) > 0.1, 'at 133.3 the grass would twitch: why Dino Trail dances on every second beat');
});

// ---------------------------------------------------------------------------------------------
// The music's loop: its length read from the file, and the beat grid folded into it

const LENGTH = 176.24; // Dino Trail's loop, as the file says (no number in the code: the element's duration)

/** Dino Trail streaming from a fake element `duration` s long, touched and heard. */
async function playingTrail(duration = LENGTH) {
  const context = createFakeContext();
  const element = new FakeMediaElement({ duration });
  const clock = createClock();
  const music = createMusic({ context, theme: TRAIL, clock, base: new URL('kafli2/theme.json', AUDIO), createElement: () => element });
  assert.equal(await music.ready, true);
  const world = { context, element, clock, music };
  music.start();
  frames(world, 0.2);
  return world;
}

/** `seconds` go by in frames: the clock ticks, the audio moves on, the music has its frame, and `each` sees the frame. */
function frames({ clock, context, music }, seconds, each = () => {}) {
  for (let left = seconds; left > 1e-9; left -= FRAME) {
    const dt = Math.min(FRAME, left);
    clock.tick(dt);
    context.advance(dt);
    music.update();
    each(dt);
  }
}

test('Dino Trail streams kafli2/theme.mp3 and its playhead loops with the file\'s own length, whatever that is', async () => {
  for (const duration of [LENGTH, 200]) {
    const world = await playingTrail(duration);
    const { element, music } = world;
    assert.equal(element.src, new URL('kafli2/theme.mp3', AUDIO).href);
    assert.equal(element.loop, true);
    frames(world, duration - 1 - 0.2);
    near(music.position, duration - 1, 0.01, `${duration} s: a second before the end`);
    frames(world, 5);
    near(music.position, 4, 0.01, `${duration} s: 4 s into the second time round`);
    near(element.currentTime, 4, 0.01, 'the element wrapped with it');
    assert.equal(element.seeks.length, 0, 'together, unmoved');
  }
});

test('the beat read from Dino Trail\'s playhead restarts at the file\'s beatOffset each loop, and the forest follows it without a jump', async () => {
  const world = await playingTrail();
  const { music } = world;
  const grid = danceGrid(TRAIL);
  let followed = null, last = null, most = 0;
  const follow = dt => {
    followed = followBeat(followed, beatsAt(music.position, grid), dt, grid, false);
    const waves = [1, 2, 4].map(period => waveAt(followed.beats, period));
    if (last) most = Math.max(most, ...waves.map((w, i) => Math.abs(w - last[i])));
    last = waves;
  };
  frames(world, LENGTH - 3 - music.position, follow); // to 3 s before the end
  const before = music.position;
  frames(world, 3 + TRAIL.beatOffset, follow); // round the loop, to the file's beat 0
  const after = music.position;
  assert.ok(before > LENGTH - 4 && after < 1, `round the loop (${before.toFixed(2)} s, then ${after.toFixed(2)} s)`);
  near(after, TRAIL.beatOffset, 0.02, 'on the file\'s first beat again');
  near(foldBeats(beatsAt(after, TRAIL) + 0.5) - 0.5, 0, 0.05, 'where the grid has its beat 0: a strong beat');
  // the grid restarts: 176.24 s are 391.6 beats, so straight on it would be 0.4 of a beat elsewhere (3.6 round the fold)
  const straightOn = beatsAt(after + LENGTH, TRAIL);
  const gap = Math.abs(foldBeats(straightOn - beatsAt(after, TRAIL) + 2) - 2);
  near(gap, Math.abs(foldBeats((LENGTH * TRAIL.bpm) / 60 + 2) - 2), 0.01, 'folded into the loop, not counted on');
  assert.ok(gap > 0.1, 'which is a step the follower has to ease over');
  // and the forest never jumped: no wave moved more than a tenth of its range from one frame to the next, the seam included
  assert.ok(most <= 0.1, `the steepest frame: ${most.toFixed(3)}`);
  frames(world, 8, follow);
  near(foldBeats(followed.beats - beatsAt(music.position, grid) + 2) - 2, 0, 0.01, 'and the follower is back on the grid within a few seconds');
});
