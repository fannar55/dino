import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBookAudio } from '../engine/book/book-audio.js';
import { BOOK_SFX, BOOK_GAPS } from '../engine/book/book-sounds.js';
import { createMusic, DUCK_DB } from '../engine/audio/music.js';
import { createSfx } from '../engine/audio/sfx.js';
import { createHold } from '../engine/audio/hold.js';
import { createVoice } from '../engine/scene/voice.js';
import { createClock } from '../engine/clock.js';
import { centsFromKey, createFakeContext, FakeAudio, pitchesOf, withAudio } from './fake-audio.mjs';

// The book's sound (engine/book/book-audio.js): a narrator that never reads past what it should, and small effects in the theme's
// key, heard while the game stands still behind the child's book.

const THEME = JSON.parse(fs.readFileSync(new URL('../assets/audio/theme.json', import.meta.url), 'utf8'));
const LINES = {
  book_mosi_1: { src: 'assets/audio/book/book_mosi_1.mp3', duration: 2.1 },
  book_mosi_2: { src: 'assets/audio/book/book_mosi_2.mp3', duration: 1.8 },
};

function setup() {
  const context = createFakeContext({ state: 'running' });
  const output = context.createGain();
  return { context, output, audio: createBookAudio({ context, output, theme: THEME, lines: LINES }) };
}

/** Runs `run` with console.warn caught, and says what it was told. */
function warned(run) {
  const original = console.warn;
  const told = [];
  console.warn = (...args) => told.push(args.join(' '));
  try {
    run();
  } finally {
    console.warn = original;
  }
  return told;
}

test('narration plays the line\'s recording, and a new line replaces it', () => withAudio(() => {
  const { audio } = setup();
  const first = audio.narrate('book_mosi_1');
  assert.equal(FakeAudio.made[0].src, LINES.book_mosi_1.src);
  assert.equal(FakeAudio.made[0].paused, false, 'it plays');
  assert.equal(first.done, false);

  const second = audio.narrate('book_mosi_2');
  assert.equal(first.cancelled, true, 'the first line is cancelled');
  assert.equal(FakeAudio.made[0].paused, true, 'and silent');
  assert.equal(FakeAudio.made[1].paused, false);
  FakeAudio.made[1].finish();
  assert.equal(second.done && !second.cancelled, true, 'done when its recording ends');
}));

test('a line with no recording is done at once and warns once', () => withAudio(() => {
  const { audio } = setup();
  const told = warned(() => {
    assert.equal(audio.narrate('book_frog_2').done, true);
    assert.equal(audio.narrate('book_frog_2').done, true);
    audio.narrate('book_snail_3');
  });
  assert.deepEqual(told, ['[book] no recording for book_frog_2', '[book] no recording for book_snail_3']);
  assert.equal(FakeAudio.made.length, 0, 'nothing tries to play');
}));

test('stop and muting end the narration', () => withAudio(() => {
  const { audio } = setup();
  const line = audio.narrate('book_mosi_1');
  audio.stop();
  assert.equal(line.cancelled, true);
  assert.equal(FakeAudio.made[0].paused, true);

  const again = audio.narrate('book_mosi_2');
  audio.muted = true;
  assert.equal(again.cancelled, true);
  assert.equal(FakeAudio.made[1].paused, true);
  assert.equal(audio.narrate('book_mosi_1').done, true, 'a muted book reads nothing');
  assert.equal(FakeAudio.made.length, 2);
  assert.equal(audio.sfx('tap'), false, 'and makes no sound');
}));

test('book sounds are in the theme\'s key and keep their gaps', () => {
  const elsewhere = [440, 495, 556.25, 660, 742.5]; // A major pentatonic, so a test cannot pass by luck
  for (const key of [THEME.key, elsewhere]) {
    const context = createFakeContext({ state: 'running' });
    const audio = createBookAudio({ context, theme: { ...THEME, key }, lines: {} });
    for (const name of BOOK_SFX) {
      const before = context.oscillators.length;
      audio.sfx(name);
      context.advance(10);
      for (const note of context.oscillators.slice(before)) {
        for (const hz of pitchesOf(note)) assert.ok(centsFromKey(hz, key) < 1, `${name}: ${hz} Hz is within a cent of the key ${key}`);
      }
    }
  }

  const { context, audio } = setup();
  for (const name of ['tap', 'turn', 'wiggle']) {
    assert.ok(BOOK_GAPS[name] > 0, `${name} has a gap`);
    assert.equal(audio.sfx(name), true);
    assert.equal(audio.sfx(name), false, `${name} tapped twice at once sounds once`);
    context.advance(BOOK_GAPS[name] + 0.01);
    assert.equal(audio.sfx(name), true, `and again after its gap`);
  }
});

test('every BOOK_SFX name plays', () => {
  const { context, audio } = setup();
  for (const name of BOOK_SFX) {
    const before = context.started.length;
    assert.equal(audio.sfx(name), true, name);
    assert.ok(context.started.length > before, `${name} makes a sound`);
    context.advance(10);
  }
  assert.equal(audio.sfx('frogs'), false, 'an unknown name does nothing');
});

test('book sounds dip while the narrator speaks', () => withAudio(() => {
  const { context, output, audio } = setup();
  const own = context.of('gain').find(gain => gain.outputs.includes(output)); // the effects' own gain, on its way out
  const level = () => own.gain.valueAt(context.currentTime + 1);
  assert.ok(Math.abs(level() - 1) < 1e-3, 'full while nobody speaks');
  audio.narrate('book_mosi_1');
  assert.ok(Math.abs(level() - 10 ** (DUCK_DB / 20)) < 0.01, `${DUCK_DB} dB under the narrator: ${level()}`);
  context.advance(1);
  FakeAudio.made[0].finish();
  assert.ok(Math.abs(level() - 1) < 1e-3, 'and back when the line ends');
}));

test('the book sounds while the game\'s sound is held', () => withAudio(() => {
  const context = createFakeContext({ state: 'running' });
  const output = context.createGain();
  const sfx = createSfx({ context, theme: THEME, output });
  const hold = createHold([createVoice(), createMusic({ clock: createClock() }), sfx]); // the game's parts, as main.js holds them
  hold('book', true); // the child holds the book
  assert.equal(sfx.play('frog'), false, 'the game\'s own effects are held');

  const book = createBookAudio({ context, output, theme: THEME, lines: LINES });
  assert.equal(book.sfx('turn'), true, 'the book\'s are not');
  const line = book.narrate('book_mosi_1');
  assert.equal(FakeAudio.made.at(-1).paused, false, 'and its narrator reads');
  assert.equal(line.done, false);
}));
