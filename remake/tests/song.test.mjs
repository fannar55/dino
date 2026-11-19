// A chapter's own song beside the page's theme (engine/audio/song.js): chapter 4's flight song. Silent until the scene plays it, then
// on the game clock from its cue, held with the game, dipped under every line, once to its end, and never again after it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from '../engine/clock.js';
import { createSong } from '../engine/audio/song.js';
import { createFakeContext, FakeMediaElement } from './fake-audio.mjs';

const BASE = 'http://localhost/remake/assets/audio/kafli4/';
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

async function setup({ duration = 20, state = 'running' } = {}) {
  const context = createFakeContext({ state });
  const element = new FakeMediaElement({ duration });
  const clock = createClock();
  let talking = false;
  const song = createSong({ context, clock, src: 'flugstef.mp3', base: BASE, createElement: () => element, speaking: () => talking });
  await song.ready;
  const fade = context.mediaSources[0].outputs[0];
  const volume = context.lastGains[0];
  return { context, element, clock, song, fade, volume, talk: on => { talking = on; } };
}

/** `seconds` go by in frames of 1/60 s, the song updated each frame as the scene's frames do. */
function frames({ clock, context, song }, seconds) {
  for (let left = seconds; left > 1e-9; left -= 1 / 60) {
    const dt = Math.min(1 / 60, left);
    clock.tick(dt);
    context.advance(dt);
    song.update();
  }
}

test('the song streams from its file beside the chapter\'s sounds, and is silent until the scene plays it, touches and holds included', async () => {
  const world = await setup();
  const { element, song, fade, context } = world;
  assert.equal(element.src, `${BASE}flugstef.mp3`);
  assert.equal(element.loop, false, 'it plays once');
  song.touch(); // the start button, and every touch after it
  song.setPaused(true);
  song.setPaused(false); // the book opened and shut
  frames(world, 3);
  assert.equal(element.playCalls, 0, 'nothing plays before the scene asks');
  assert.equal(fade.gain.valueAt(context.currentTime + 1), 0);
  assert.equal(song.playing, false);
});

test('play(at) starts the song `at` seconds in, on the game clock, and heard', async () => {
  const world = await setup();
  const { element, clock, song, fade, context } = world;
  clock.step(42); // the chapter went on a while before the flight
  song.play(0.5);
  assert.equal(song.playing, true);
  frames(world, 0.5);
  assert.ok(element.seeks.some(time => Math.abs(time - 0.5) < 0.1), `it starts at its cue: ${element.seeks}`);
  assert.ok(near(song.position, 1, 1e-6), `its playhead is the cue and the clock since: ${song.position}`);
  assert.ok(Math.abs(element.currentTime - song.position) <= 0.08, 'the sound is on it');
  assert.ok(near(fade.gain.valueAt(context.currentTime + 1), 1), 'heard');
});

test('the song dips 8 dB under every line, and its level is the scene\'s to set', async () => {
  const world = await setup();
  const { song, volume, context } = world;
  song.play(0);
  frames(world, 0.5);
  const normal = volume.gain.valueAt(context.currentTime);
  world.talk(true);
  frames(world, 0.5);
  assert.ok(near(20 * Math.log10(volume.gain.valueAt(context.currentTime) / normal), -8, 1e-6), 'under a line');
  world.talk(false);
  frames(world, 0.5);
  assert.ok(near(volume.gain.valueAt(context.currentTime), normal, 1e-9), 'and back after it');
  song.setLevel(1.5, 1);
  assert.ok(near(volume.gain.valueAt(context.currentTime + 1), normal * 1.5, 1e-9), 'louder through the flight');
  song.lenient(1); // the slow second: the scene may let it run past the slowed clock
});

test('the song is held with the game: silent while held, and back on its playhead after', async () => {
  const world = await setup();
  const { element, song, fade, context } = world;
  song.play(0.5);
  frames(world, 1);
  song.setPaused(true);
  frames(world, 0.2);
  assert.equal(fade.gain.valueAt(context.currentTime + 1), 0, 'silent under the book');
  assert.equal(element.paused, true);
  song.setPaused(false);
  frames(world, 0.5);
  assert.ok(near(fade.gain.valueAt(context.currentTime + 1), 1), 'and heard again');
  assert.ok(Math.abs(element.currentTime - song.position) <= 0.08, 'on its playhead');
});

test('the song plays once: at its end it is done, and neither a hold, a touch nor play starts it again', async () => {
  const world = await setup({ duration: 6 });
  const { element, song, fade, context } = world;
  song.play(0.5);
  frames(world, 7);
  assert.equal(song.playing, false, 'done');
  assert.equal(fade.gain.valueAt(context.currentTime + 1), 0);
  const calls = element.playCalls;
  song.setPaused(true);
  song.setPaused(false);
  song.touch();
  song.play(0.5);
  frames(world, 2);
  assert.equal(element.playCalls, calls, 'it never sounds again');
  assert.equal(fade.gain.valueAt(context.currentTime + 1), 0);
});

test('stop(seconds) fades the song out and it is done', async () => {
  const world = await setup();
  const { song, fade, volume, context } = world;
  song.play(0);
  frames(world, 1);
  const level = volume.gain.valueAt(context.currentTime);
  song.stop(2);
  frames(world, 1);
  assert.ok(volume.gain.valueAt(context.currentTime) < level * 0.6, 'going down');
  assert.equal(song.playing, true, 'still going till the fade is over');
  frames(world, 1.2);
  assert.equal(song.playing, false);
  assert.equal(fade.gain.valueAt(context.currentTime + 1), 0);
});

test('a touch after a play the browser refused starts it (a browser that lets an element play only from a touch)', async () => {
  const world = await setup();
  const { element, song, fade, context } = world;
  element.blocked = true;
  song.play(0.5);
  await new Promise(resolve => setTimeout(resolve, 0)); // the refusal comes back
  frames(world, 0.5);
  assert.equal(fade.gain.valueAt(context.currentTime + 1), 0, 'not heard yet');
  element.blocked = false;
  song.touch();
  frames(world, 0.5);
  assert.ok(near(fade.gain.valueAt(context.currentTime + 1), 1), 'heard after the touch');
  assert.ok(Math.abs(element.currentTime - song.position) <= 0.08, 'on its playhead, where the clock says');
});

test('with no audio (a capture) the song is a playhead and nothing else', () => {
  const clock = createClock();
  const song = createSong({ context: null, clock, src: 'flugstef.mp3', base: BASE });
  clock.step(10);
  song.play(0.5);
  song.update();
  clock.step(2);
  assert.ok(near(song.position, 2.5));
  song.touch();
  song.setPaused(true);
  song.setLevel(1.5, 1);
  song.stop(1);
});
