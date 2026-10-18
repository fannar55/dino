import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createClock } from '../engine/clock.js';
import { createMusic } from '../engine/audio/music.js';
import { createFakeContext, FakeMediaElement, withFetch } from './fake-audio.mjs';

const THEME = JSON.parse(fs.readFileSync(new URL('../assets/audio/theme.json', import.meta.url), 'utf8'));
const THEME_URL = 'http://localhost/remake/assets/audio/theme.json';
const SRC_URL = 'http://localhost/remake/assets/audio/theme.mp3';
const LENGTH = 351.6; // the theme, 556.7 beats

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

/**
 * The music on a fake context, streaming from a fake audio element, with the game clock it follows. `fade` is the music's own
 * fader, the gain node between the element and the volume knob.
 */
async function setup({ context: contextOptions = {}, element: elementOptions = {}, theme = THEME, base = THEME_URL } = {}) {
  const context = createFakeContext(contextOptions);
  const element = new FakeMediaElement({ duration: LENGTH, ...elementOptions });
  const clock = createClock();
  const music = createMusic({ context, theme, clock, base, createElement: () => element });
  await music.ready;
  return { context, element, clock, music, fade: context.mediaSources[0]?.outputs[0] };
}

/** `seconds` go by in frames of 1/60 s: the clock ticks (unless it is held), the audio moves on, and the music has its frame. */
function frames({ clock, context, music }, seconds) {
  for (let left = seconds; left > 1e-9; left -= 1 / 60) {
    const dt = Math.min(1 / 60, left);
    clock.tick(dt);
    context.advance(dt);
    music.update();
  }
}

/** The music playing: touched, and a moment of frames so the theme is heard. */
async function playing(options) {
  const world = await setup(options);
  world.music.start();
  frames(world, 0.2);
  return world;
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

const later = () => new Promise(resolve => setTimeout(resolve, 0));

// ---------------------------------------------------------------------------------------------
// The theme

test('the theme streams from an audio element routed through Web Audio, read against theme.json\'s URL, and is never decoded', async () => {
  await withFetch(async asked => {
    const { context, element, music } = await setup();
    assert.equal(await music.ready, true);
    assert.equal(element.src, SRC_URL, 'the src is read from theme.json, not from the page');
    assert.equal(element.loop, true, 'it loops');
    assert.equal(element.preload, 'auto');
    assert.deepEqual(asked, [], 'the page fetches nothing itself: the element streams the file');
    assert.equal(context.decoded.length, 0, 'and nothing of the 351.6 s is decoded into memory');
    assert.equal(context.bufferSources.length, 0);
    assert.equal(context.mediaSources.length, 1);
    assert.equal(context.mediaSources[0].element, element);
    assert.ok(context.mediaSources[0].reaches(context.destination), 'it is heard through the graph, so it can be ducked');
    assert.equal(element.playCalls, 0, 'and it waits for a touch to play');
  });
});

test('the theme\'s src is read against the URL of theme.json, wherever that is', async () => {
  const { element } = await setup({ theme: { ...THEME, src: 'songs/valley.mp3' }, base: 'http://localhost/a/b/theme.json' });
  assert.equal(element.src, 'http://localhost/a/b/songs/valley.mp3', 'beside theme.json, not beside the page');
});

test('nothing plays before the first touch, and the playhead follows the game clock meanwhile', async () => {
  const { context, element, clock, music } = await setup();
  assert.equal(context.state, 'suspended');
  assert.equal(element.playCalls, 0);
  assert.equal(music.position, 0);
  clock.step(3.5);
  assert.equal(music.position, 3.5, 'the forest dances to the grid before the music is heard');
  clock.step(2);
  music.update();
  assert.equal(music.position, 5.5);
  assert.equal(element.playCalls, 0);
});

test('a browser that lets sound run at once still waits for the start button: the theme begins with the scene', async () => {
  const world = await setup({ context: { state: 'running' } });
  frames(world, 2);
  assert.equal(world.element.playCalls, 0, 'the context runs, the theme is loaded, and still nothing plays');
  assert.equal(world.context.resumes, 0);
  world.music.start();
  assert.equal(world.element.playCalls, 1);
  assert.equal(world.context.resumes, 0, 'a context that already runs is not asked to');
});

test('the touch wakes the context and starts the element inside the touch, silent; the next frames bring it up at the theme\'s beginning', async () => {
  const world = await setup();
  const { context, element, clock, music, fade } = world;
  clock.step(7.3); // the child looked at the start button for a while
  music.start();
  assert.equal(context.resumes, 1, 'resume() was called by start itself, before anything is awaited');
  assert.equal(context.state, 'running');
  assert.equal(element.playCalls, 1, 'so was play(): a media element starts from a touch or not at all (iOS)');
  assert.equal(fade.gain.valueAt(context.currentTime + 5), 0, 'and nothing is heard yet');
  assert.equal(music.position, 7.3, 'until the theme sounds the playhead is the clock\'s');

  frames(world, 0.06);
  assert.equal(fade.gain.valueAt(context.currentTime + 1), 0, 'it is not brought up until the element has been seen to keep pace with the audio clock');
  assert.equal(music.position, clock.time, 'and the playhead has not started: it is still the clock\'s');
  frames(world, 0.2); // the media clock has moved steadily: the theme is playing, from its beginning
  assert.equal(fade.gain.valueAt(context.currentTime + 1), 1, 'now it comes up');
  const [from, to] = fade.gain.events.slice(-2);
  assert.ok(to.type === 'linear' && to.value === 1 && to.time - from.time >= 0.02 && to.time - from.time <= 0.1, 'over a few frames, not with a click');
  assert.ok(near(music.position, element.currentTime), 'the playhead is where the element is');
  assert.ok(music.position > 0.1 && music.position < 0.3, `the beat grid begins with the music (${music.position})`);
  assert.equal(element.seeks.length, 0, 'it was not even moved');

  music.start();
  music.start();
  frames(world, 0.1);
  assert.equal(element.playCalls, 1, 'another touch does not start it again');
  assert.equal(context.resumes, 1, 'nor ask the browser again');
});

test('the playhead loops with the file, so the beat grid restarts from the file\'s own beatOffset', async () => {
  const world = await playing();
  const { element, music } = world;
  frames(world, LENGTH - 1 - 0.2);
  assert.ok(near(music.position, LENGTH - 1, 0.01), `${music.position}`);
  frames(world, 5);
  assert.ok(near(music.position, 4, 0.01), `${music.position} s into the second time round`);
  assert.ok(near(element.currentTime, 4, 0.01), `the element wrapped with it (${element.currentTime})`);
  assert.equal(element.seeks.length, 0, 'together, without anyone moving it');
});

test('a resume that goes round the end of the file while the element is being watched is not taken for a stall', async () => {
  const world = await playing();
  const { context, element, clock, music, fade } = world;
  frames(world, LENGTH - 0.15 - 0.2); // 0.15 s from the end of the file
  music.setPaused(true);
  clock.setPaused(true);
  frames(world, 0.2);
  assert.equal(element.paused, true);
  assert.ok(element.currentTime > LENGTH - 0.15 && element.currentTime < LENGTH - 0.05, `stopped just before the end (${element.currentTime})`);
  clock.setPaused(false);
  music.setPaused(false);
  frames(world, 0.2); // it plays on, round the end of the file, in the first tenth of a second
  assert.ok(element.currentTime < 0.3, `round the end (${element.currentTime})`);
  assert.equal(fade.gain.valueAt(context.currentTime + 1), 1, 'and the sound is up at once: going round the loop is not a reason to look again');
  assert.equal(element.seeks.length, 0);
});

test('the element and the playhead need not wrap in the same frame: a little ahead or behind across the loop point is still on it', async () => {
  for (const [what, audio, game] of [['ahead of', 0.05, 0], ['behind', 0, 0.05]]) {
    const world = await playing();
    const { clock, context, element, music } = world;
    frames(world, LENGTH - 2 - 0.2);
    context.advance(audio); // the element is ahead by 50 ms
    clock.step(game); // or the playhead is
    frames(world, 4);
    assert.ok(music.position < 3 && element.currentTime < 3, `both are past the loop point (${music.position}, ${element.currentTime})`);
    assert.equal(element.seeks.length, 0, `the element ${what} the playhead wrapped without a jump (a gap of ${LENGTH} s would be one)`);
  }
});

// ---------------------------------------------------------------------------------------------
// Pause

test('pause and resume follow the game clock', async () => {
  const world = await playing();
  const { context, element, clock, music, fade } = world;
  frames(world, 20);
  const heldAt = music.position;
  music.setPaused(true);
  assert.equal(fade.gain.valueAt(context.currentTime + 0.05), 0, 'the sound fades out');
  assert.equal(element.paused, false, 'and the element stops once it has faded, not in the middle of a wave');

  // The book is open (or the tab is hidden and draws no frames): the clock stands still, but the audio's time goes on.
  clock.setPaused(true);
  frames(world, 30);
  assert.equal(element.paused, true, 'the element has stopped');
  assert.ok(near(music.position, heldAt), 'the playhead stood still with the clock');
  assert.ok(near(element.currentTime, heldAt, 0.08), `and so did the element (${element.currentTime} against ${heldAt})`);
  assert.equal(element.seeks.length, 0);

  clock.setPaused(false);
  music.setPaused(false);
  assert.equal(element.paused, true, 'letting go starts nothing: the next frame does, when the clock has ticked');
  frames(world, 0.3);
  assert.equal(element.paused, false);
  assert.ok(near(element.currentTime, music.position, 0.1), 'it is back on the playhead');
  assert.ok(near(music.position, heldAt + 0.3, 0.01), 'which is the clock\'s 20 s, not where the audio\'s time would have put it');
  assert.equal(element.seeks.length, 0, 'continued where it was, so no seek was needed');
  assert.equal(fade.gain.valueAt(context.currentTime + 0.1), 1, 'and it is heard again');

  frames(world, 5);
  assert.ok(near(music.position, heldAt + 5.3, 0.01) && near(element.currentTime, music.position, 0.1));
  assert.equal(element.seeks.length, 0, 'and plays on from there without a jump');
});

test('a hidden tab stops the element at once, since no frame will come to finish a fade; coming back starts it on the first frame', async () => {
  globalThis.document = { hidden: true };
  try {
    const world = await playing();
    const { context, element, clock, music, fade } = world;
    frames(world, 8);
    music.setPaused(true); // the tab is hidden
    assert.equal(element.paused, true, 'paused at once');
    assert.equal(fade.gain.valueAt(context.currentTime + 0.1), 0);
    const heldAt = element.currentTime;
    context.advance(4); // four seconds with no frames at all
    assert.equal(element.currentTime, heldAt, 'a paused element stands still');

    globalThis.document = { hidden: false };
    music.setPaused(false); // and it comes back
    context.advance(0.5); // but its first frame is half a second late
    assert.equal(element.paused, true, 'the tab\'s event starts no sound');
    assert.equal(clock.tick(4.5), 0.1, 'the clock counts at most 0.1 s of all that time');
    music.update();
    assert.equal(element.paused, false);
    assert.equal(element.seeks.length, 1, 'it was put where the clock is now');
    assert.ok(near(element.seeks[0], music.position, 0.02), `${element.seeks[0]} against ${music.position}`);
    frames(world, 2);
    assert.equal(element.seeks.length, 1, 'and two seconds of steady frames later it has not had to jump');
    assert.equal(fade.gain.valueAt(context.currentTime + 0.1), 1);
  } finally {
    delete globalThis.document;
  }
});

test('pausing twice, or letting go without a pause, changes nothing; pausing before the touch keeps the music quiet', async () => {
  const world = await setup();
  const { context, element, music } = world;
  music.setPaused(false);
  music.setPaused(true);
  music.setPaused(true);
  music.start();
  frames(world, 0.5);
  assert.equal(element.playCalls, 0, 'held: the touch unlocks sound but the music waits');
  assert.equal(context.state, 'running');
  music.setPaused(false);
  frames(world, 0.5);
  assert.equal(element.playCalls, 1);
  assert.equal(element.paused, false);
  music.setPaused(false);
  frames(world, 0.5);
  assert.equal(element.playCalls, 1);
  assert.equal(element.seeks.length, 0);
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
  const world = await setup({ context: { state: 'running' } });
  const volume = volumeOf(world.context).gain;
  const normal = volume.valueAt(0);
  world.music.duck(true);
  world.context.advance(1);
  world.music.start();
  frames(world, 0.2);
  assert.ok(near(volume.valueAt(world.context.currentTime), normal * 10 ** (-8 / 20), 1e-9));
});

// ---------------------------------------------------------------------------------------------
// The sound stays on the playhead

test('the sound is brought back to the playhead when the clock has lost time: a dip, a seek, and back up', async () => {
  const world = await playing();
  const { context, element, clock, music, fade } = world;
  frames(world, 10);
  assert.equal(element.seeks.length, 0, 'in step: nothing to do');

  // A long frame: the audio went on for 1.5 s, the clock counts at most 0.1 s of it.
  context.advance(1.5);
  assert.equal(clock.tick(1.5), 0.1);
  const playhead = music.position;
  assert.ok(element.currentTime - playhead > 1.3);
  music.update();
  const jumpedAt = context.currentTime;
  assert.equal(fade.gain.valueAt(jumpedAt), 1, 'it starts fading from where it was');
  assert.equal(fade.gain.valueAt(jumpedAt + 0.03), 0, 'down to nothing in a few frames');
  assert.equal(element.seeks.length, 0, 'and is not moved while it is still heard');
  frames(world, 1 / 60);
  assert.equal(element.seeks.length, 0, 'nor while it is still fading');

  frames(world, 0.5);
  assert.equal(element.seeks.length, 1, 'then the element is put on the playhead');
  assert.ok(near(element.seeks[0], playhead, 0.1), `${element.seeks[0]} against ${playhead}`);
  assert.ok(near(element.currentTime, music.position, 0.1), 'the playhead is the clock\'s, it did not go to the sound');
  assert.equal(fade.gain.valueAt(context.currentTime + 0.1), 1, 'and it fades back in');
  frames(world, 3);
  assert.equal(element.seeks.length, 1, 'once');
});

test('a small drift is left alone, and a long one is mended once, not on every frame', async () => {
  const world = await playing();
  const { context, element, clock, music } = world;
  frames(world, 5);
  context.advance(0.06);
  music.update();
  frames(world, 0.1);
  assert.equal(element.seeks.length, 0, '60 ms is within what a frame can lose');

  context.advance(0.5);
  music.update();
  frames(world, 0.3);
  assert.equal(element.seeks.length, 1, '560 ms is not');

  context.advance(0.3); // the clock lags again, but a jump so soon after the last one would only stutter
  clock.tick(0.3);
  music.update();
  frames(world, 0.2);
  assert.equal(element.seeks.length, 1, 'one jump at a time');

  context.advance(2); // a second of calm later the next jump is allowed
  clock.tick(0.1);
  music.update();
  frames(world, 0.3);
  assert.equal(element.seeks.length, 2);
});

test('a context that sleeps is not chased, and the sound is brought to the playhead once it runs again', async () => {
  const world = await playing();
  const { context, element, clock, music, fade } = world;
  frames(world, 5);

  context.setState('suspended'); // the system puts sound to sleep: a locked tablet
  clock.step(40); // and the game goes on without it
  music.update();
  music.update();
  assert.equal(element.paused, true, 'its element is stopped, since nothing it plays can be heard');
  assert.equal(element.seeks.length, 0, 'and not chased');
  assert.ok(near(music.position, 45.2, 0.05), 'the playhead goes on');

  context.setState('running');
  frames(world, 0.3);
  assert.equal(element.seeks.length, 1, 'once it runs again it is brought to the playhead');
  assert.ok(near(element.seeks[0], 45.2, 0.3), `${element.seeks[0]}`);
  assert.equal(element.paused, false);
  assert.ok(near(element.currentTime, music.position, 0.1));
  assert.equal(fade.gain.valueAt(context.currentTime + 0.1), 1);
});

test('a seek that takes time is not heard: the element is put ahead by what the last seek cost, and comes up only when it is on the playhead', async () => {
  const world = await playing({ element: { seekLatency: 0.12 } });
  const { context, element, clock, music, fade } = world;
  frames(world, 10);
  context.advance(1.5); // a long frame
  clock.tick(1.5);
  music.update();

  let loudest = 0;
  let samples = 0;
  let backAt = null;
  const jumpedAt = context.currentTime;
  for (let frame = 0; frame < 60; frame++) {
    clock.tick(1 / 60);
    context.advance(1 / 60);
    music.update();
    if (context.currentTime - jumpedAt > 0.04 && !near(element.currentTime, music.position, 0.08)) { // past the dip, and off the playhead
      loudest = Math.max(loudest, fade.gain.valueAt(context.currentTime));
      samples++;
    }
    if (backAt === null && fade.gain.valueAt(context.currentTime + 0.1) === 1) backAt = context.currentTime; // the moment it is brought up
  }
  assert.ok(backAt - jumpedAt < 0.55, `the music was out for ${(backAt - jumpedAt).toFixed(2)} s: a dip, two seeks of 0.12 s each followed by a look of 0.1 s`);
  assert.ok(samples >= 4, `the element was off the playhead for a while (${samples} frames)`);
  assert.equal(element.seeks.length, 2, 'a seek, a look at where it landed (0.12 s late), and a second seek ahead of the playhead by that');
  assert.equal(loudest, 0, 'it stayed silent all that time');
  assert.ok(near(element.currentTime, music.position, 0.08), `on the playhead (${element.currentTime} against ${music.position})`);
  assert.equal(fade.gain.valueAt(context.currentTime + 0.1), 1, 'and then it is heard');
  frames(world, 5);
  assert.equal(element.seeks.length, 2, 'and it stays there: the next jump would have the cost right from the start');
});

test('in a lenient window a long frame moves the playhead to the sound, with no dip and no seek, so the theme never repeats', async () => {
  const world = await playing();
  const { context, element, clock, music, fade } = world;
  frames(world, 10);
  music.lenient(4); // main.js, as a place changes: its forest is built in one long frame
  const before = music.position;
  context.advance(1.8); // the sound plays on through it...
  assert.equal(clock.tick(1.8), 0.1, '...and the clock counts 0.1 s of it');
  music.update();
  assert.equal(element.seeks.length, 0, 'the element is not sent back');
  assert.equal(fade.gain.valueAt(context.currentTime + 0.05), 1, 'and the sound does not dip');
  assert.ok(near(music.position, element.currentTime, 0.01), `the playhead went to the sound (${music.position} against ${element.currentTime})`);
  assert.ok(music.position > before + 1.8, `forward by the long frame: ${before.toFixed(2)} -> ${music.position.toFixed(2)} s`);
  context.advance(0.6); // the first draw of the new place: another long frame, still in the window
  clock.tick(0.6);
  music.update();
  frames(world, 2);
  assert.equal(element.seeks.length, 0);
  assert.ok(near(music.position, element.currentTime, 0.02));

  frames(world, 2.5); // the window (4 s of game time) is over: a long frame now is mended as ever
  context.advance(1.5);
  clock.tick(1.5);
  music.update();
  assert.equal(fade.gain.valueAt(context.currentTime + 0.03), 0, 'it dips');
  frames(world, 0.5);
  assert.equal(element.seeks.length, 1, 'and the element is put on the playhead');
});

test('outside a lenient window the same long frame seeks the sound back to the playhead, as before', async () => {
  const world = await playing();
  const { context, element, clock, music } = world;
  frames(world, 10);
  const before = music.position;
  context.advance(1.8);
  clock.tick(1.8);
  music.update();
  frames(world, 0.5);
  assert.equal(element.seeks.length, 1);
  assert.ok(near(music.position, before + 0.1 + 0.5, 0.02), 'the playhead is the clock\'s');
  assert.throws(() => music.lenient(-1), /seconds/);
  assert.throws(() => music.lenient(NaN), /seconds/);
});

// ---------------------------------------------------------------------------------------------
// Silence

test('a muted music makes no sound, and un-muting brings it back on the playhead', async () => {
  const world = await setup();
  const { context, element, clock, music, fade } = world;
  music.muted = true;
  assert.equal(music.muted, true);
  music.start();
  frames(world, 0.5);
  assert.equal(element.playCalls, 0, 'start does not break the mute');
  clock.step(9);
  assert.ok(near(music.position, 9.5, 0.01), 'the playhead still follows the clock');

  music.muted = false;
  frames(world, 0.5);
  assert.equal(element.playCalls, 1);
  assert.ok(element.currentTime < 0.6, 'the music begins when it first sounds');
  frames(world, 4);
  const heardAt = music.position;
  music.muted = true;
  assert.equal(fade.gain.valueAt(context.currentTime + 0.05), 0, 'muting fades it out');
  frames(world, 0.2);
  assert.equal(element.paused, true, 'and stops it');
  clock.step(6);
  music.muted = false;
  frames(world, 0.3);
  assert.equal(element.paused, false);
  assert.ok(near(music.position, heardAt + 6.5, 0.1), `it returns where the clock is (${music.position})`);
  assert.ok(near(element.currentTime, music.position, 0.1));
  assert.equal(fade.gain.valueAt(context.currentTime + 0.1), 1);
});

test('a music that cannot play still gives the forest its beat', async () => {
  for (const [name, options] of [
    ['a missing or undecodable file', { element: { loadError: true } }],
    ['a browser that cannot play MP3', { element: { playError: new DOMException('The element has no supported sources.', 'NotSupportedError') } }],
  ]) {
    const told = await warned(async () => {
      const world = await setup(options);
      const { element, clock, music } = world;
      music.start();
      await later();
      frames(world, 1);
      music.setPaused(true);
      music.setPaused(false);
      music.duck(true);
      music.muted = true;
      music.muted = false;
      frames(world, 1);
      assert.equal(element.seeks.length, 0, name);
      assert.ok(element.playCalls <= 1, `${name}: asked once at most (${element.playCalls})`);
      clock.step(12.5);
      assert.ok(near(music.position, 14.5, 0.1), `${name}: the playhead goes on with the clock (${music.position})`);
    });
    assert.equal(told.length, 1, `${name}: said once what is wrong`);
    assert.match(told[0], /theme/i, name);
  }

  const told = await warned(async () => {
    const context = createFakeContext();
    context.createMediaElementSource = () => { throw new DOMException('no such thing', 'NotSupportedError'); };
    const music = createMusic({ context, theme: THEME, clock: createClock(), base: THEME_URL, createElement: () => new FakeMediaElement() });
    assert.equal(await music.ready, false);
    music.start();
    music.update();
  });
  assert.equal(told.length, 1, 'a browser that cannot route an element into Web Audio says so once');
});

test('a play() that a pause interrupted is not a failure: the music plays when it is asked again', async () => {
  const told = await warned(async () => {
    const world = await setup({ element: { playError: new DOMException('The play() request was interrupted by a call to pause().', 'AbortError') } });
    const { element, music } = world;
    music.start();
    await later();
    element.playError = null;
    frames(world, 0.5);
    assert.equal(element.paused, false, 'it is played again');
    assert.equal(world.fade.gain.valueAt(world.context.currentTime + 0.1), 1);
  });
  assert.deepEqual(told, [], 'and nobody is warned');
});

test('a page with no Web Audio, or a capture that makes none, has a music that is a playhead and nothing else', async () => {
  await withFetch(async asked => {
    let made = 0;
    const createElement = () => { made++; return new FakeMediaElement(); };
    for (const context of [null, undefined]) {
      const clock = createClock();
      const music = createMusic({ context, theme: THEME, clock, base: THEME_URL, createElement });
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
    const clock = createClock();
    const noTheme = createMusic({ context: createFakeContext(), theme: null, clock, base: THEME_URL, createElement });
    assert.equal(await noTheme.ready, false);
    clock.step(2);
    assert.equal(noTheme.position, 2);
    assert.equal(made, 0, 'no element is made for any of them, so nothing is loaded');
    assert.deepEqual(asked, []);
  });
});

test('when the browser keeps the sound locked, the playhead goes on, and the theme begins when a touch finally wakes it', async () => {
  const world = await setup({ context: { blocked: true } });
  const { context, element, clock, music } = world;
  music.start(); // resume() is refused: no throw, no unhandled rejection
  await later();
  assert.equal(context.state, 'suspended');
  clock.step(30);
  music.update();
  assert.ok(near(music.position, 30), 'captions and the dance go on without sound');
  assert.equal(world.fade.gain.valueAt(10), 0, 'and nothing is heard');

  context.blocked = false;
  music.start(); // the next touch
  await later();
  assert.equal(context.state, 'running');
  frames(world, 0.2);
  assert.ok(element.currentTime < 0.3, `from its beginning, as it would have on the first touch (${element.currentTime})`);
  assert.ok(near(music.position, element.currentTime), 'and the playhead with it');
  assert.equal(world.fade.gain.valueAt(context.currentTime + 0.1), 1);
  assert.equal(element.seeks.length, 0);
});

test('a context that wakes a moment after the touch gets the theme from its beginning, not a theme that is already behind', async () => {
  const world = await setup({ context: { blocked: true }, element: { startLatency: 0.15 } });
  const { context, element, clock, music } = world;
  clock.step(4);
  music.start();
  await later();
  clock.step(0.6); // frames go on while the audio device wakes up
  music.update();
  context.blocked = false;
  await context.resume();
  frames(world, 3);
  assert.equal(element.seeks.length, 0, 'one start, no restart');
  assert.ok(near(music.position, element.currentTime, 0.02), `on the playhead (${music.position} against ${element.currentTime})`);
  assert.ok(music.position > 2.5 && music.position < 3.1, `the playhead began when the theme did (${music.position})`);
  assert.equal(world.fade.gain.valueAt(context.currentTime + 0.1), 1);
});

test('a play() the browser refuses is not asked again every frame, only at the next touch', async () => {
  const world = await setup({ element: { blocked: true } });
  const { context, element, music } = world;
  music.start();
  await later();
  frames(world, 1);
  assert.equal(element.playCalls, 1, 'refused once, and not asked again');
  assert.equal(world.fade.gain.valueAt(context.currentTime + 1), 0);

  element.blocked = false;
  music.start(); // a real touch
  frames(world, 0.3);
  assert.equal(element.playCalls, 2);
  assert.equal(element.paused, false);
  assert.equal(world.fade.gain.valueAt(context.currentTime + 0.1), 1);
});

test('a browser that pauses the element on its own (another app took the sound) gets it played again, on the playhead', async () => {
  const world = await playing();
  const { element, music, fade } = world;
  frames(world, 5);
  const asked = element.playCalls;
  element.pause(); // the system's doing
  frames(world, 0.5);
  assert.equal(element.playCalls, asked + 1, 'it is played again, once');
  assert.equal(element.paused, false);
  assert.ok(near(element.currentTime, music.position, 0.1), `${element.currentTime} against ${music.position}`);
  assert.equal(element.seeks.length, 0, 'it was out for two frames: no need to move it');
  assert.equal(fade.gain.valueAt(world.context.currentTime + 0.1), 1);

  // And if the browser will not play it again without a touch, it waits for one instead of asking every frame.
  element.blocked = true;
  element.pause();
  for (let frame = 0; frame < 3; frame++) {
    frames(world, 1 / 60);
    await later(); // the browser's refusal reaches the music between two frames
  }
  const refused = element.playCalls;
  assert.ok(refused > asked + 1 && refused <= asked + 3, `asked again and refused (${refused - asked - 1} times)`);
  frames(world, 1);
  assert.equal(element.playCalls, refused, 'and then left alone');
  assert.equal(fade.gain.valueAt(world.context.currentTime + 1), 0);
});

test('a file that cannot be moved (a server with no byte ranges) is not moved: the beat follows the music, once told, and the sound is never interrupted', async () => {
  const told = await warned(async () => {
    const world = await playing({ element: { seekable: false } });
    const { context, element, clock, music, fade } = world;
    frames(world, 10);
    assert.ok(near(music.position, element.currentTime, 0.01), 'the playhead began where the element is');

    // The clock loses time, which would be a jump for a file that can be moved.
    context.advance(1.5);
    clock.tick(1.5);
    music.update();
    assert.equal(fade.gain.valueAt(context.currentTime + 0.1), 1, 'the sound does not dip: nothing is going to be moved');
    assert.equal(element.seeks.length, 0, 'and nothing is, since a seek would send it back to the start');
    assert.ok(near(music.position, element.currentTime, 0.05), `the playhead went to the element (${music.position} against ${element.currentTime})`);
    frames(world, 3);
    assert.equal(element.seeks.length, 0);
    context.advance(1.5); // and again, a while later
    clock.tick(1.5);
    music.update();
    assert.equal(element.seeks.length, 0);
    assert.ok(near(music.position, element.currentTime, 0.05));

    // A pause and a resume go on from where the element stopped, which is where the clock stopped.
    music.setPaused(true);
    clock.setPaused(true);
    frames(world, 2);
    assert.equal(element.paused, true);
    clock.setPaused(false);
    music.setPaused(false);
    frames(world, 0.5);
    assert.equal(element.paused, false);
    assert.equal(element.seeks.length, 0);
    assert.ok(near(music.position, element.currentTime, 0.1));
    assert.equal(fade.gain.valueAt(context.currentTime + 0.1), 1);

    // The game goes on for a long while with the sound asleep: the element is not sent to where the clock is, the clock's playhead comes to the element.
    context.setState('suspended');
    clock.step(40);
    music.update();
    context.setState('running');
    frames(world, 0.5);
    assert.equal(element.seeks.length, 0, 'not even then');
    assert.equal(element.paused, false);
    assert.ok(near(music.position, element.currentTime, 0.1), `${music.position} against ${element.currentTime}`);
    assert.equal(fade.gain.valueAt(context.currentTime + 0.1), 1);
  });
  assert.equal(told.length, 1, 'and it said once, for whoever runs the server, what is wrong');
  assert.match(told[0], /byte ranges/);
});

test('a context that says it runs but whose clock stands still is asleep: nothing is started, moved or left playing, and the music begins when the clock moves', async () => {
  const world = await setup();
  const { context, element, clock, music, fade } = world;
  context.stalled = true;
  music.start();
  frames(world, 3); // a device that is slow to start: the context runs, its clock does not
  assert.equal(context.state, 'running');
  assert.equal(element.seeks.length, 0);
  assert.equal(fade.gain.valueAt(10), 0, 'nothing is heard, and nothing is brought up on a clock that stands still');
  assert.equal(music.position, clock.time, 'the playhead has not started');

  context.stalled = false; // the device wakes
  frames(world, 0.4);
  assert.equal(fade.gain.valueAt(context.currentTime + 0.1), 1, 'now the music comes up');
  assert.ok(music.position < 0.5 && near(music.position, element.currentTime, 0.02), `from the theme\'s beginning (${music.position})`);
  assert.equal(element.seeks.length, 0);

  // And if it stalls while the music is heard, the element is stopped at once, and the music is brought back to the playhead when it moves again.
  context.stalled = true;
  frames(world, 0.5);
  assert.equal(element.paused, true);
  context.stalled = false;
  frames(world, 0.6);
  assert.equal(element.paused, false);
  assert.ok(near(element.currentTime, music.position, 0.1), `${element.currentTime} against ${music.position}`);
  assert.equal(fade.gain.valueAt(context.currentTime + 0.1), 1);
});

test('an element whose clock moves a moment and then stands still is not taken for playing: the music waits until it keeps pace', async () => {
  const world = await setup({ element: { freeze: { at: 0.012, for: 3 } } });
  const { context, element, music, fade } = world;
  music.start();
  frames(world, 2.5);
  assert.ok(element.currentTime < 0.02, 'its clock reached 12 ms and stopped');
  assert.equal(fade.gain.valueAt(context.currentTime + 1), 0, 'the music is not brought up on a clock that is not running');
  assert.equal(element.seeks.length, 0, 'and the element is not moved: it is not behind, it has not started');
  assert.equal(music.position, world.clock.time, 'the playhead has not started');

  frames(world, 1.5); // the device is up
  assert.equal(fade.gain.valueAt(context.currentTime + 0.1), 1);
  assert.ok(near(music.position, element.currentTime, 0.02) && music.position < 1.5, `the theme begins at its beginning, when it is playing (${music.position})`);
  assert.equal(element.seeks.length, 0);
  frames(world, 5);
  assert.equal(element.seeks.length, 0, 'and goes on in step');
});

test('an element that crawls (a starved pipeline) is not taken for playing, and the music comes up once it keeps pace', async () => {
  const world = await setup({ element: { rate: 0.4 } });
  const { context, element, music, fade } = world;
  music.start();
  frames(world, 2);
  assert.ok(element.currentTime > 0.5 && element.currentTime < 1, `its clock moves, at 0.4 of the audio clock's rate (${element.currentTime})`);
  assert.equal(fade.gain.valueAt(context.currentTime + 1), 0, 'the music is not brought up');
  assert.equal(element.seeks.length, 0, 'and the element is not moved either');
  assert.equal(music.position, world.clock.time, 'the playhead has not started');

  element.rate = 1;
  frames(world, 0.5);
  assert.equal(fade.gain.valueAt(context.currentTime + 0.1), 1);
  assert.ok(near(music.position, element.currentTime, 0.02));
  assert.equal(element.seeks.length, 0);
});

test('createMusic says what it needs', () => {
  assert.throws(() => createMusic({ context: createFakeContext(), theme: THEME }), /clock/);
});
