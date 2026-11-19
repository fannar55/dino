// The loop in layers (engine/audio/stems.js): chapter 5's band joins a layer at a time under the choir, on the game clock's beat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStems } from '../engine/audio/stems.js';
import { createFakeContext } from './fake-audio.mjs';

const SONG = { bpm: 125, beatOffset: 0, loop: { layers: { drums: 'loop-drums.mp3', bass: 'loop-bass.mp3', music: 'loop-music.mp3' }, startSec: 1.92, seconds: 15.36 } };
const BASE = new URL('https://game.test/assets/audio/kafli5/song/');
const fetched = [];
const fetch = async url => { fetched.push(String(url)); return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) }; };

function make({ time = 0, state = 'running', song = SONG } = {}) {
  const context = createFakeContext({ state });
  const clock = { time };
  const stems = createStems({ context, output: context.destination, clock, song, base: BASE, fetch });
  return { context, clock, stems };
}
/** A frame: the context and the game clock both move on, and the stems get their update. */
function frame({ context, clock, stems }, seconds = 1 / 60) {
  context.advance(seconds);
  clock.time += seconds;
  stems.update();
}

test('every layer starts on the same audio time, inside the loop where the game clock is, and loops the loop only', async () => {
  const game = make({ time: 20 }); // 20 s on the clock is 4.64 s into the second turn of a 15.36 s loop
  game.stems.play();
  await game.stems.ready;
  game.stems.update();
  const sources = game.context.bufferSources;
  assert.equal(sources.length, 3);
  const [{ when, offset }] = sources[0].starts;
  for (const source of sources) {
    assert.deepEqual(source.starts, [{ when, offset }], 'one start, the same for all');
    assert.equal(source.loop, true);
    assert.ok(Math.abs(source.loopStart - 1.92) < 1e-9 && Math.abs(source.loopEnd - 17.28) < 1e-9, `loop ${source.loopStart}-${source.loopEnd}`);
  }
  assert.ok(when > game.context.currentTime, 'a moment ahead, so the three start together');
  const lead = when - game.context.currentTime;
  assert.ok(Math.abs(offset - (1.92 + ((20 + lead) % 15.36))) < 1e-6, `offset ${offset}`);
  assert.deepEqual(fetched.slice(-3).sort(), ['loop-bass.mp3', 'loop-drums.mp3', 'loop-music.mp3'].map(file => new URL(file, BASE).href));
});

test('a layer is silent until it is asked for and fades to its level in the asked seconds', async () => {
  const game = make();
  game.stems.play();
  await game.stems.ready;
  game.stems.update();
  const gainOf = layer => game.context.of('gain').find(node => node.layer === layer).gain;
  for (const layer of ['drums', 'bass', 'music']) assert.equal(gainOf(layer).valueAt(game.context.currentTime + 1), 0, layer);
  const t0 = game.context.currentTime;
  game.stems.layer('drums', 0.5, 1.5);
  assert.ok(Math.abs(gainOf('drums').valueAt(t0 + 0.75) - 0.25) < 1e-6, 'half way after half the time');
  assert.ok(Math.abs(gainOf('drums').valueAt(t0 + 1.5) - 0.5) < 1e-6);
  assert.ok(Math.abs(gainOf('drums').valueAt(t0 + 5) - 0.5) < 1e-6, 'and it stays');
  assert.equal(gainOf('bass').valueAt(t0 + 5), 0, 'the others are as they were');
  assert.equal(game.stems.level('drums'), 0.5);
  assert.throws(() => game.stems.layer('tuba', 1), /no layer/);
});

test('the next beat is on the song\'s grid, for whole beats and for halves', () => {
  const { stems, clock } = make({ time: 10 });
  const beat = 60 / 125;
  // 10 s is 20.83 beats in: the 21st beat is at 10.08 s, the next half beat at 10.08 too (20.5 is past)
  assert.ok(Math.abs(stems.delayToBeat() - (21 * beat - 10)) < 1e-9);
  assert.ok(Math.abs(stems.delayToBeat(0.5) - (21 * beat - 10)) < 1e-9);
  clock.time = 21 * beat;
  assert.ok(stems.delayToBeat() < 1e-9, 'on a beat there is nothing to wait for');
  clock.time = 21 * beat + 0.01;
  assert.ok(Math.abs(stems.delayToBeat(0.5) - (beat / 2 - 0.01)) < 1e-9);
  assert.ok(Math.abs(stems.delayToBeat(4) - (24 * beat - clock.time)) < 1e-9, 'the next bar');
  assert.ok(Math.abs(stems.beatAt() - (clock.time / beat)) < 1e-9);
  // a grid that starts later
  const late = make({ time: 1, song: { ...SONG, beatOffset: 0.3 } });
  assert.ok(Math.abs(late.stems.delayToBeat() - (0.3 + 2 * beat - 1)) < 1e-9);
});

test('held with the game they fall silent, and let go they are on the beat the clock stood on', async () => {
  const game = make({ time: 3 });
  game.stems.play();
  await game.stems.ready;
  game.stems.update();
  for (let i = 0; i < 120; i++) frame(game); // two seconds of play
  const first = game.context.bufferSources.slice();
  game.stems.setPaused(true); // the book opens: the game clock stands
  for (let i = 0; i < 300; i++) { game.context.advance(1 / 60); game.stems.update(); } // five seconds, the clock still
  for (const source of first) assert.ok(source.stopTime !== undefined && source.stopTime <= game.context.currentTime, 'the old sources were stopped');
  assert.equal(game.context.bufferSources.length, 3, 'nothing new while held');
  game.stems.setPaused(false);
  game.stems.update();
  const again = game.context.bufferSources.slice(3);
  assert.equal(again.length, 3);
  const { when, offset } = again[0].starts[0];
  const lead = when - game.context.currentTime;
  assert.ok(Math.abs(offset - (1.92 + ((game.clock.time + lead) % 15.36))) < 1e-6, 'where the clock is, not where the speakers went');
  for (const source of again) assert.deepEqual(source.starts, [{ when, offset }]);
});

test('if the sound and the clock come apart the layers start again where the clock is', async () => {
  const game = make();
  game.stems.play();
  await game.stems.ready;
  game.stems.update();
  for (let i = 0; i < 60; i++) frame(game);
  assert.equal(game.context.bufferSources.length, 3, 'in step, nothing restarts');
  game.clock.time += 0.4; // a long frame the clock counted and the speakers did not wait for
  frame(game);
  frame(game);
  assert.equal(game.context.bufferSources.length, 6, 'started again');
  const { when, offset } = game.context.bufferSources[3].starts[0];
  assert.ok(Math.abs(offset - (1.92 + ((game.clock.time - 1 / 60 + (when - (game.context.currentTime - 1 / 60))) % 15.36))) < 0.02, `offset ${offset}`);
});

test('a stop fades them out and they do not come back; without an audio context it is a beat and nothing else', async () => {
  const game = make();
  game.stems.play();
  await game.stems.ready;
  game.stems.update();
  game.stems.stop(1);
  const bus = game.context.of('gain').find(node => node.bus).gain;
  assert.ok(bus.valueAt(game.context.currentTime + 1.01) < 1e-6);
  for (let i = 0; i < 120; i++) frame(game);
  assert.equal(game.context.bufferSources.length, 3);
  assert.equal(game.stems.playing, false);

  const silent = createStems({ context: null, clock: { time: 1 }, song: SONG, base: BASE, fetch });
  silent.play();
  silent.layer('drums', 1, 1);
  silent.update();
  silent.setPaused(true);
  silent.stop();
  assert.equal(await silent.ready, false);
  assert.ok(silent.delayToBeat() >= 0);
});

test('under a spoken line the whole loop dips, and comes back after it', async () => {
  const context = createFakeContext({ state: 'running' });
  const clock = { time: 0 };
  let line = false;
  const stems = createStems({ context, output: context.destination, clock, song: SONG, base: BASE, fetch, speaking: () => line });
  stems.play();
  await stems.ready;
  stems.update();
  const game = { context, clock, stems };
  for (let i = 0; i < 60; i++) frame(game);
  const out = context.lastGains[0].gain; // the last gain before the page's output
  assert.ok(Math.abs(out.valueAt(context.currentTime) - 1) < 1e-6, 'full with nobody speaking');
  line = true;
  for (let i = 0; i < 60; i++) frame(game);
  const dipped = out.valueAt(context.currentTime);
  assert.ok(dipped > 0.3 && dipped < 0.5, `about 8 dB down: ${dipped}`);
  line = false;
  for (let i = 0; i < 120; i++) frame(game);
  assert.ok(out.valueAt(context.currentTime) > 0.95, 'and back');
});
