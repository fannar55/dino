import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHold } from '../engine/audio/hold.js';
import { createAudioContext, createOutput } from '../engine/audio/output.js';
import { createVoice } from '../engine/scene/voice.js';
import { createFakeContext, FakeContext } from './fake-audio.mjs';

/** Runs `run` with console.warn caught, and says what it was told. */
async function warned(run) {
  const original = console.warn;
  const told = [];
  console.warn = (...args) => told.push(args.join(' '));
  try {
    await run();
  } finally {
    console.warn = original;
  }
  return told;
}

// ---------------------------------------------------------------------------------------------
// The voice ducks the music

class FakeAudio extends EventTarget {
  static made = [];
  static rejection = null;
  constructor(src) {
    super();
    this.src = src;
    this.paused = true;
    this.ended = false;
    FakeAudio.made.push(this);
  }

  play() {
    this.paused = false;
    return FakeAudio.rejection ? Promise.reject(FakeAudio.rejection) : Promise.resolve();
  }

  pause() { this.paused = true; }
  finish() {
    this.ended = true;
    this.paused = true;
    this.dispatchEvent(new Event('ended'));
  }
}

async function withAudio(run) {
  const original = globalThis.Audio;
  globalThis.Audio = FakeAudio;
  FakeAudio.made = [];
  FakeAudio.rejection = null;
  try {
    await run();
  } finally {
    globalThis.Audio = original;
  }
}

test('a line ducks the music while it plays and lets it up when it ends or is stopped', () => withAudio(async () => {
  const told = [];
  const voice = createVoice({ onSpeaking: on => told.push(on) });
  assert.deepEqual(told, []);

  voice.play('a.mp3');
  assert.deepEqual(told, [true]);
  FakeAudio.made[0].finish();
  assert.deepEqual(told, [true, false], 'the music is back as the line ends, not after the hold the scene adds');

  const second = voice.play('b.mp3');
  voice.stop(second);
  assert.deepEqual(told, [true, false, true, false]);
  voice.stop();
  assert.deepEqual(told, [true, false, true, false], 'stopping what is not playing says nothing');
}));

test('a line that follows another keeps the music down instead of letting it swell between them', () => withAudio(async () => {
  const told = [];
  const voice = createVoice({ onSpeaking: on => told.push(on) });
  const first = voice.play('a.mp3');
  const second = voice.play('b.mp3');
  assert.deepEqual(told, [true], 'ducked once');
  voice.stop(first);
  assert.deepEqual(told, [true], 'the scene stopping the old line (its own, already replaced) does not let the music up');
  assert.equal(FakeAudio.made[1].paused, false, 'and the new line plays on');
  voice.stop(second);
  assert.deepEqual(told, [true, false]);
}));

test('a muted voice makes no sound and ducks nothing', () => withAudio(async () => {
  const told = [];
  const voice = createVoice({ onSpeaking: on => told.push(on) });
  voice.muted = true;
  assert.equal(voice.play('a.mp3'), null);
  assert.equal(voice.play(''), null);
  assert.deepEqual(told, []);

  voice.muted = false;
  voice.play('b.mp3');
  voice.muted = true; // the replay of a capture starting while a line plays
  assert.deepEqual(told, [true, false]);
}));

test('a line the browser will not play does not leave the music down', () => withAudio(async () => {
  const told = [];
  const voice = createVoice({ onSpeaking: on => told.push(on) });
  FakeAudio.rejection = new DOMException('play() failed because the user didn\'t interact', 'NotAllowedError');
  voice.play('a.mp3');
  assert.deepEqual(told, [true]);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(told, [true, false], 'the music is let up when the line proves silent');

  // A pause that interrupts a play() request rejects it with AbortError: the line is only paused, still ducked.
  told.length = 0;
  FakeAudio.rejection = new DOMException('The play() request was interrupted by a call to pause()', 'AbortError');
  voice.play('b.mp3');
  voice.setPaused(true);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(told, [true]);
}));

test('the voice works as before without a music, and a paused line stays a line', () => withAudio(async () => {
  const voice = createVoice();
  const sound = voice.play('a.mp3');
  assert.equal(sound, FakeAudio.made[0]);
  voice.setPaused(true);
  assert.equal(sound.paused, true);
  voice.setPaused(false);
  assert.equal(sound.paused, false);
  FakeAudio.made[0].finish();
  voice.setPaused(false); // a line that has ended is not replayed
  assert.equal(FakeAudio.made.length, 1);
}));

// ---------------------------------------------------------------------------------------------
// What holds the sound

test('the book and a hidden tab each hold the sound, which goes on only when both let go', () => {
  const log = [];
  const part = name => ({ setPaused: paused => log.push(`${name}:${paused}`) });
  const hold = createHold([part('voice'), part('music')]);

  hold('hidden', false); // the page opens in a visible tab
  assert.deepEqual(log, []);

  hold('book', true);
  assert.deepEqual(log, ['voice:true', 'music:true']);
  hold('hidden', true);
  hold('hidden', false); // the tab comes back, but the child is still in the book
  hold('book', true);
  assert.deepEqual(log, ['voice:true', 'music:true'], 'no change, no call');

  hold('book', false);
  assert.deepEqual(log, ['voice:true', 'music:true', 'voice:false', 'music:false']);
  hold('hidden', true);
  hold('hidden', true);
  assert.equal(log.length, 6);
  hold('hidden', false);
  assert.deepEqual(log.slice(6), ['voice:false', 'music:false']);
});

// ---------------------------------------------------------------------------------------------
// The audio context and its output

test('the page gets an audio context when the browser has one, and none when it has not', async () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const hadWebkit = Object.getOwnPropertyDescriptor(globalThis, 'webkitAudioContext');
  try {
    delete globalThis.AudioContext;
    delete globalThis.webkitAudioContext;
    assert.equal(createAudioContext(), null, 'no Web Audio');

    globalThis.webkitAudioContext = FakeContext; // older Safari
    assert.ok(createAudioContext() instanceof FakeContext);

    globalThis.AudioContext = class { constructor() { throw new Error('the device has no audio output'); } };
    const told = await warned(async () => {
      assert.equal(createAudioContext(), null, 'a context the device refuses to make is no context');
    });
    assert.equal(told.length, 1, 'and it says so once');
  } finally {
    for (const [name, descriptor] of [['AudioContext', had], ['webkitAudioContext', hadWebkit]]) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test('everything is heard through one output that leaves headroom and limits peaks', () => {
  const context = createFakeContext();
  const output = createOutput(context);
  const [limiter] = context.of('compressor');
  assert.ok(output.reaches(limiter) && limiter.outputs.includes(context.destination), 'headroom, then a limiter, then the speakers');
  assert.ok(output.gain.valueAt(0) < 1);
  assert.ok(limiter.threshold.valueAt(0) < 0 && limiter.ratio.valueAt(0) > 1);
});

// ---------------------------------------------------------------------------------------------
// main.js: the wiring that cannot run in Node

const MAIN = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('main.js lets the beat read the music\'s playhead, and ducks the music under the voice', () => {
  assert.match(MAIN, /const musicTime = \(\) => music\.position;/, 'one source for the beat: the music\'s playhead on the game clock');
  assert.match(MAIN, /createVoice\(\{ onSpeaking: on => music\.duck\(on\) \}\)/, 'a line ducks the theme');
  assert.match(MAIN, /music\.update\(\)/, 'and the sound is kept on the playhead each frame');
  assert.match(MAIN, /sfx\.update\(dt\)/, 'the forest\'s birds are scheduled on the game clock');
});

test('main.js starts the sound on the first touch and holds it with the book and the tab', () => {
  assert.match(MAIN, /button\.addEventListener\('click', \(\) => \{[^}]*music\.start\(\)/, 'the start button is the first touch');
  assert.match(MAIN, /window\.addEventListener\('pointerup', \(\) => \{ if \(stage\.started\) music\.start\(\); \}/, 'any later touch wakes sound the system put to sleep');
  assert.match(MAIN, /document\.addEventListener\('visibilitychange', \(\) => hold\('hidden', document\.hidden\)\)/, 'a hidden tab holds the sound with the clock that stops');
  assert.match(MAIN, /\nhold\('hidden', document\.hidden\);/, 'also one that opens hidden');
  assert.match(MAIN, /createHold\(\[voice, music, sfx\]\)/, 'the voice, the music and the effects follow the same hold');
});

test('main.js keeps captures and review shots silent and gives the scene its effects', () => {
  assert.match(MAIN, /voice\.muted = true;\s*music\.muted = true;\s*sfx\.muted = true;/, 'the seek replay is silent');
  assert.match(MAIN, /const playing = params\.get\('t'\) === null && params\.get\('shot'\) === null && Boolean\(chapter\.script\);/);
  assert.match(MAIN, /const audio = playing \? createAudioContext\(\) : null;/, 'a capture or a review shot makes no audio context at all');
  assert.match(MAIN, /createScene\(\{[^}]*\bsfx\b[^}]*\}\)/, 'the scene can play effects');
  assert.match(MAIN, /theme, clock, base: themeUrl/, 'the music reads its file against theme.json\'s own URL');
});
