import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createClock } from '../engine/clock.js';
import { createMusic } from '../engine/audio/music.js';
import { createHold } from '../engine/audio/hold.js';
import { createAudioContext, createOutput } from '../engine/audio/output.js';
import { createVoice } from '../engine/scene/voice.js';
import { createFakeContext, FakeContext, withFetch } from './fake-audio.mjs';

const THEME = JSON.parse(fs.readFileSync(new URL('../assets/audio/theme.json', import.meta.url), 'utf8'));
const THEME_URL = 'http://localhost/remake/assets/audio/theme.json';
const SRC_URL = 'http://localhost/dist/assets/audio/little-dino-green-valley.mp3';
const LENGTH = 351.6; // the theme, 556.7 beats

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/** The music on a fake context with its theme decoded, and the game clock it follows. */
async function setup(options = {}, answer) {
  const context = createFakeContext({ duration: LENGTH, ...options });
  const clock = createClock();
  const music = await withFetch(async () => {
    const m = createMusic({ context, theme: THEME, clock, base: THEME_URL });
    await m.ready;
    return m;
  }, answer);
  return { context, clock, music };
}

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
// The theme

test('the theme is fetched against theme.json and loops from the decoded buffer', async () => {
  await withFetch(async asked => {
    const context = createFakeContext({ duration: LENGTH });
    const music = createMusic({ context, theme: THEME, clock: createClock(), base: THEME_URL });
    assert.equal(await music.ready, true);
    assert.deepEqual(asked, [SRC_URL], 'the src is read from theme.json, not from the page');
    assert.equal(context.decoded.length, 1, 'decoded once');
    assert.equal(context.bufferSources.length, 0, 'and it waits for a touch to play');

    music.start();
    assert.equal(context.bufferSources.length, 0, 'the touch only unlocks sound: the next frame starts it, in step with the clock');
    music.update();
    assert.equal(context.bufferSources.length, 1);
    const [source] = context.bufferSources;
    assert.equal(source.buffer, context.decoded[0]);
    assert.equal(source.loop, true, 'it loops');
    assert.equal(source.starts[0].offset, 0, 'from the beginning');
    assert.ok(source.reaches(context.destination), 'and is heard');
  });
});

test('the theme\'s src is read against the URL of theme.json, wherever that is', async () => {
  await withFetch(async asked => {
    const music = createMusic({ context: createFakeContext(), theme: { ...THEME, src: 'songs/valley.mp3' }, clock: createClock(), base: 'http://localhost/a/b/theme.json' });
    await music.ready;
    assert.deepEqual(asked, ['http://localhost/a/b/songs/valley.mp3'], 'beside theme.json, not beside the page');
  });
});

test('nothing plays before the first touch, and the playhead follows the game clock meanwhile', async () => {
  const { context, clock, music } = await setup();
  assert.equal(context.state, 'suspended');
  assert.equal(context.bufferSources.length, 0);
  assert.equal(music.position, 0);
  clock.step(3.5);
  assert.equal(music.position, 3.5, 'the forest dances to the grid before the music is heard');
  clock.step(2);
  assert.equal(music.position, 5.5);
});

test('a browser that lets sound run at once still waits for the start button: the theme begins with the scene', async () => {
  const { context, clock, music } = await setup({ state: 'running' });
  clock.step(2);
  context.advance(2);
  music.update();
  music.update();
  assert.equal(context.bufferSources.length, 0, 'the context runs, the theme decoded, and still nothing plays');
  assert.equal(context.resumes, 0);
  music.start();
  music.update();
  assert.equal(context.bufferSources.length, 1);
  assert.equal(context.resumes, 0, 'a context that already runs is not asked to');
});

test('start wakes the context inside the touch, plays the theme from its beginning and starts the playhead at 0', async () => {
  const { context, clock, music } = await setup();
  clock.step(7.3); // the child looked at the start button for a while
  music.start();
  assert.equal(context.resumes, 1, 'resume() was called by start itself, before anything is awaited');
  assert.equal(context.state, 'running');
  assert.equal(music.position, 7.3, 'until the theme sounds the playhead is the clock\'s');
  music.update(); // the next frame
  assert.equal(context.bufferSources.length, 1);
  assert.equal(context.bufferSources[0].starts[0].offset, 0);
  assert.equal(music.position, 0, 'the beat grid begins with the music');
  clock.step(1.25);
  context.advance(1.25);
  assert.equal(music.position, 1.25);

  music.start();
  music.start();
  music.update();
  assert.equal(context.bufferSources.length, 1, 'another touch does not start a second sound');
  assert.equal(context.resumes, 1, 'nor ask the browser again');
});

test('the playhead loops with the file, so the beat grid restarts from the file\'s own beatOffset', async () => {
  const { clock, music } = await setup();
  music.start();
  music.update();
  clock.step(LENGTH - 1);
  assert.ok(near(music.position, LENGTH - 1));
  clock.step(5);
  assert.ok(near(music.position, 4), `${music.position} s into the second time round`);
  clock.step(LENGTH * 2);
  assert.ok(near(music.position, 4), 'and the third and fourth');
});

// ---------------------------------------------------------------------------------------------
// Pause

test('pause and resume follow the game clock', async () => {
  const { context, clock, music } = await setup();
  music.start();
  music.update();
  const [first] = context.bufferSources;
  const fade = first.outputs[0]; // the sound's own fader, which it lets go of when it has ended
  clock.step(20);
  context.advance(20);
  music.setPaused(true);
  context.advance(0.5);

  assert.ok(first.stopTime !== undefined && first.ended, 'the sound has stopped');
  assert.ok(fade.gain.valueAt(first.stopTime) < 0.001, 'after fading out, not cut mid-wave');

  // The book is open (or the tab is hidden and draws no frames): the clock stands still, but the audio's time goes on.
  clock.setPaused(true);
  for (let frame = 0; frame < 30; frame++) {
    assert.equal(clock.tick(1), 0);
    context.advance(1);
    music.update(); // frames go on while the book is open
  }
  assert.ok(near(music.position, 20), 'the playhead stood still with the clock');
  assert.equal(context.bufferSources.length, 1, 'and nothing sounds meanwhile');

  clock.setPaused(false);
  music.setPaused(false);
  assert.equal(context.bufferSources.length, 1, 'letting go starts nothing: the next frame does, when the clock has ticked');
  assert.equal(clock.tick(1 / 60), 1 / 60);
  music.update();
  assert.equal(context.bufferSources.length, 2);
  const second = context.bufferSources[1];
  assert.ok(near(second.starts[0].offset, music.position), 'on the playhead');
  assert.ok(near(second.starts[0].offset, 20, 0.02), `it is back at the clock's 20 s, not where the audio's time would have put it (${second.starts[0].offset})`);
  assert.ok(second.reaches(context.destination));

  clock.step(5);
  context.advance(5);
  music.update();
  assert.equal(context.bufferSources.length, 2, 'and it plays on from there without a jump');
  assert.ok(near(music.position, 25, 0.02));
});

test('only a frame starts the sound, so it never starts behind a clock that was late', async () => {
  const { context, clock, music } = await setup();
  music.start();
  music.update();
  clock.step(8);
  context.advance(8);
  music.setPaused(true); // the tab is hidden
  context.advance(4); // four seconds with no frames at all
  music.setPaused(false); // and it comes back
  context.advance(0.5); // but its first frame is half a second late
  assert.equal(context.bufferSources.length, 1, 'the tab\'s event starts no sound');

  assert.equal(clock.tick(4.5), 0.1, 'the clock counts at most 0.1 s of all that time');
  music.update();
  assert.equal(context.bufferSources.length, 2);
  assert.ok(near(context.bufferSources[1].starts[0].offset, 8.1), `it starts where the clock is now (${context.bufferSources[1].starts[0].offset})`);
  for (let frame = 0; frame < 120; frame++) {
    clock.tick(1 / 60);
    context.advance(1 / 60);
    music.update();
  }
  assert.equal(context.bufferSources.length, 2, 'and two seconds of steady frames later it has not had to jump');
});

test('pausing twice, or letting go without a pause, changes nothing; pausing before the touch keeps the music quiet', async () => {
  const { context, clock, music } = await setup();
  music.setPaused(false);
  music.setPaused(true);
  music.setPaused(true);
  music.start();
  music.update();
  assert.equal(context.bufferSources.length, 0, 'held: the touch unlocks sound but the music waits');
  assert.equal(context.state, 'running');
  music.setPaused(false);
  music.update();
  assert.equal(context.bufferSources.length, 1);
  music.setPaused(false);
  music.update();
  assert.equal(context.bufferSources.length, 1);
  clock.step(2);
  assert.ok(near(music.position, 2));
});

test('a tab that comes back wakes a context the system put to sleep, but only once the child has touched the page', async () => {
  const { context, music } = await setup();
  music.setPaused(true);
  music.setPaused(false);
  assert.equal(context.resumes, 0, 'before the first touch nothing asks the browser for sound');

  music.start();
  assert.equal(context.resumes, 1);
  music.setPaused(true);
  context.setState('suspended'); // a locked tablet
  music.setPaused(false);
  assert.equal(context.resumes, 2);
});

// ---------------------------------------------------------------------------------------------
// Ducking

/** The knob the whole theme goes through on its way to the speakers. */
const volumeOf = context => context.lastGains[0];

test('duck lowers the gain by 8 dB over 0.3 s and restores it', async () => {
  const { context, music } = await setup();
  music.start();
  const volume = volumeOf(context).gain;
  const normal = volume.valueAt(context.currentTime);
  assert.ok(normal > 0.2 && normal < 1, `the theme sits at ${normal} in the mix`);

  context.advance(2);
  music.duck(true);
  const t0 = context.currentTime;
  const ducked = normal * 10 ** (-8 / 20);
  assert.ok(near(volume.valueAt(t0), normal), 'it starts from where it was');
  assert.ok(near(volume.valueAt(t0 + 0.15), (normal + ducked) / 2, 1e-9), 'and glides');
  assert.ok(near(volume.valueAt(t0 + 0.3), ducked, 1e-9), 'to 8 dB below in 0.3 s');
  assert.ok(near(20 * Math.log10(volume.valueAt(t0 + 0.3) / normal), -8, 1e-9));
  assert.ok(near(volume.valueAt(t0 + 60), ducked, 1e-9), 'and stays there');

  context.advance(5);
  music.duck(false);
  const t1 = context.currentTime;
  assert.ok(near(volume.valueAt(t1), ducked, 1e-9));
  assert.ok(near(volume.valueAt(t1 + 0.3), normal, 1e-9), 'restored over the same 0.3 s');
  assert.ok(near(volume.valueAt(t1 + 60), normal, 1e-9));
});

test('a line that ends mid-duck lets the music up from where it had got to, without a jump', async () => {
  const { context, music } = await setup();
  music.start();
  const volume = volumeOf(context).gain;
  const normal = volume.valueAt(0);
  const ducked = normal * 10 ** (-8 / 20);
  context.advance(1);
  music.duck(true);
  context.advance(0.1);
  const midway = volume.valueAt(context.currentTime);
  assert.ok(near(midway, normal - (normal - ducked) / 3, 1e-9), 'a third of the way down');
  music.duck(false);
  assert.ok(near(volume.valueAt(context.currentTime), midway, 1e-9), 'the way back starts there');
  assert.ok(near(volume.valueAt(context.currentTime + 0.3), normal, 1e-9));
});

test('the music ducks before it starts too: a first line under a start button ducks the first notes', async () => {
  const { context, music } = await setup({ state: 'running' });
  const volume = volumeOf(context).gain;
  const normal = volume.valueAt(0);
  music.duck(true);
  context.advance(1);
  music.start();
  assert.ok(near(volume.valueAt(context.currentTime), normal * 10 ** (-8 / 20), 1e-9));
});

// ---------------------------------------------------------------------------------------------
// The sound stays on the playhead

test('the sound is brought back to the playhead when the clock has lost time', async () => {
  const { context, clock, music } = await setup();
  music.start();
  music.update();
  clock.step(10);
  context.advance(10);
  music.update();
  assert.equal(context.bufferSources.length, 1, 'in step: nothing to do');

  // A long frame: the audio went on for 1.5 s, the clock counts at most 0.1 s of it.
  context.advance(1.5);
  assert.equal(clock.tick(1.5), 0.1);
  music.update();
  assert.equal(context.bufferSources.length, 2, 'a new sound starts at the playhead');
  const [old, fresh] = context.bufferSources;
  assert.ok(near(fresh.starts[0].offset, 10.1), `${fresh.starts[0].offset}`);
  assert.ok(near(music.position, 10.1), 'the playhead is the clock\'s, it does not go to the sound');
  const oldFade = old.outputs[0];
  context.advance(0.2);
  assert.ok(old.ended, 'the old one faded out and stopped');
  assert.ok(oldFade.gain.valueAt(old.stopTime) < 0.001);
  assert.ok(fresh.outputs[0].gain.valueAt(context.currentTime) > 0.99, 'the new one faded in: a short crossfade, no click');
});

test('a small drift is left alone, and a long one is mended once, not on every frame', async () => {
  const { context, clock, music } = await setup();
  music.start();
  music.update();
  clock.step(5);
  context.advance(5.06);
  music.update();
  assert.equal(context.bufferSources.length, 1, '60 ms is within what a frame can lose');

  context.advance(0.5);
  music.update();
  assert.equal(context.bufferSources.length, 2, '560 ms is not');
  context.advance(0.3);
  clock.step(0.1); // the clock lags again, but a jump so soon after the last one would only stutter
  music.update();
  assert.equal(context.bufferSources.length, 2, 'one jump at a time');

  context.advance(2); // a second of calm later the next jump is allowed
  music.update();
  assert.equal(context.bufferSources.length, 3);
});

test('a context that sleeps is not chased, and the sound is brought to the playhead once it runs again', async () => {
  const { context, clock, music } = await setup();
  music.start();
  music.update();
  clock.step(5);
  context.advance(5);
  music.update();

  context.setState('suspended'); // the system puts sound to sleep: a locked tablet
  clock.step(40); // and the game goes on without it
  music.update();
  music.update();
  assert.equal(context.bufferSources.length, 1, 'the audio\'s own time stands still while it sleeps, so there is nothing to compare, and nothing new is queued');
  assert.ok(near(music.position, 45), 'the playhead goes on');

  context.setState('running');
  context.advance(0.1);
  music.update();
  assert.equal(context.bufferSources.length, 2, 'once it runs again it is brought to the playhead');
  assert.ok(near(context.bufferSources[1].starts[0].offset, 45));
  assert.ok(near(music.position, 45));
});

// ---------------------------------------------------------------------------------------------
// Silence

test('a muted music makes no sound, and un-muting brings it back on the playhead', async () => {
  const { context, clock, music } = await setup();
  music.muted = true;
  assert.equal(music.muted, true);
  music.start();
  music.update();
  assert.equal(context.bufferSources.length, 0, 'start does not break the mute');
  clock.step(9);
  assert.ok(near(music.position, 9), 'the playhead still follows the clock');

  music.muted = false;
  music.update();
  assert.equal(context.bufferSources.length, 1);
  assert.ok(near(context.bufferSources[0].starts[0].offset, 0), 'the music begins when it first sounds');
  clock.step(4);
  context.advance(4);
  music.muted = true;
  context.advance(1);
  assert.ok(context.bufferSources[0].ended, 'muting stops it at once');
  music.update();
  assert.equal(context.bufferSources.length, 1, 'and keeps it stopped');
  clock.step(6);
  music.muted = false;
  music.update();
  assert.ok(near(context.bufferSources[1].starts[0].offset, 10), 'and it returns where the clock is');
});

test('a music that cannot play still gives the forest its beat', async () => {
  for (const [name, options, answer] of [
    ['a missing file', {}, () => ({ ok: false, status: 404 })],
    ['a failed network', {}, () => { throw new TypeError('Failed to fetch'); }],
    ['audio that will not decode', { decodeError: new DOMException('Unable to decode audio data', 'EncodingError') }],
  ]) {
    const told = await warned(async () => {
      const { context, clock, music } = await setup(options, answer);
      assert.equal(await music.ready, false, name);
      music.start();
      music.update();
      music.setPaused(true);
      music.setPaused(false);
      music.duck(true);
      assert.equal(context.bufferSources.length, 0, name);
      clock.step(12.5);
      assert.equal(music.position, 12.5, `${name}: the playhead goes on with the clock`);
    });
    assert.equal(told.length, 1, `${name}: said once what is wrong`);
    assert.match(told[0], /theme/i, name);
  }
});

test('a page with no Web Audio, or a capture that makes none, has a music that is a playhead and nothing else', async () => {
  await withFetch(async asked => {
    for (const context of [null, undefined]) {
      const clock = createClock();
      const music = createMusic({ context, theme: THEME, clock, base: THEME_URL });
      assert.equal(await music.ready, false);
      music.start();
      music.update();
      music.duck(true);
      music.setPaused(true);
      music.muted = true;
      assert.equal(music.muted, true);
      clock.step(2);
      assert.equal(music.position, 2);
    }
    assert.deepEqual(asked, [], 'and nothing is fetched');

    const clock = createClock();
    const noTheme = createMusic({ context: createFakeContext(), theme: null, clock, base: THEME_URL });
    assert.equal(await noTheme.ready, false);
    assert.deepEqual(asked, [], 'a missing theme.json is not fetched for either');
    clock.step(2);
    assert.equal(noTheme.position, 2);
  });
});

test('when the browser keeps the sound locked, the playhead goes on, and the theme begins when a touch finally wakes it', async () => {
  const { context, clock, music } = await setup({ blocked: true });
  music.start(); // resume() is refused: no throw, no unhandled rejection
  await Promise.resolve();
  assert.equal(context.state, 'suspended');
  clock.step(30);
  music.update();
  assert.equal(context.bufferSources.length, 0, 'nothing is queued behind a locked context');
  assert.ok(near(music.position, 30), 'captions and the dance go on without sound');

  context.blocked = false;
  music.start(); // the next touch
  await Promise.resolve();
  assert.equal(context.state, 'running');
  music.update();
  assert.equal(context.bufferSources.length, 1);
  assert.equal(context.bufferSources[0].starts[0].offset, 0, 'from its beginning, as it would have on the first touch');
  assert.equal(music.position, 0, 'and the playhead with it');
});

test('a context that wakes a moment after the touch gets the theme from its beginning, not a theme that is already behind', async () => {
  const { context, clock, music } = await setup({ blocked: true });
  clock.step(4);
  music.start();
  clock.step(0.6); // frames go on while the audio device wakes up
  music.update();
  context.blocked = false;
  await context.resume();
  clock.step(0.1);
  music.update();
  assert.equal(context.bufferSources.length, 1, 'one start, no restart');
  assert.equal(context.bufferSources[0].starts[0].offset, 0);
  for (let frame = 0; frame < 120; frame++) {
    clock.tick(1 / 60);
    context.advance(1 / 60);
    music.update();
  }
  assert.equal(context.bufferSources.length, 1, 'and it stays on the playhead');
});

test('createMusic says what it needs', () => {
  assert.throws(() => createMusic({ context: createFakeContext(), theme: THEME }), /clock/);
});

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
