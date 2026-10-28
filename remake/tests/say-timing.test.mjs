// A spoken line keeps time with its sound (engine/scene/scene.js sayTask, engine/scene/voice.js): over the network a recording
// starts late, and the mouth must not run ahead of the voice nor the next line cut this one short (the owner's bug reports of
// 2026-10-25). The voice fetches a chapter's recordings ahead and says when a sound is heard and when it is over.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createScene } from '../engine/scene/scene.js';
import { createVoice } from '../engine/scene/voice.js';
import { createEffects } from '../engine/effects.js';

/** An <audio> of the test's own: plays when told, is heard and ends when the test says so. */
class FakeAudio extends EventTarget {
  constructor(src) { super(); this.src = src; this.paused = true; this.ended = false; this.currentTime = 0; FakeAudio.made.push(this); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  heard() { this.dispatchEvent(new Event('playing')); }
  over() { this.ended = true; this.dispatchEvent(new Event('ended')); }
}
FakeAudio.made = [];

function withFakeAudio(run) {
  const original = globalThis.Audio;
  globalThis.Audio = FakeAudio;
  FakeAudio.made = [];
  const restore = () => { globalThis.Audio = original; };
  let result;
  try {
    result = run();
  } catch (error) {
    restore();
    throw error;
  }
  if (result && typeof result.then === 'function') return result.finally(restore); // an async run keeps the fake until it is over
  restore();
  return result;
}

test('the voice says when a sound is heard and when it is over, and a newer line ends the older', () => withFakeAudio(() => {
  const voice = createVoice();
  const first = voice.play('a.mp3');
  assert.equal(voice.started(first), false, 'asked for, not heard yet');
  assert.equal(voice.done(first), false);
  FakeAudio.made[0].heard();
  assert.equal(voice.started(first), true);
  FakeAudio.made[0].over();
  assert.equal(voice.done(first), true, 'ended');
  const second = voice.play('b.mp3');
  const third = voice.play('c.mp3');
  assert.equal(voice.done(second), true, 'replaced by the third');
  assert.equal(FakeAudio.made[1].paused, true);
  voice.stop(third);
  assert.equal(voice.done(third), true, 'stopped');
  assert.equal(voice.done({}), true, 'a sound the voice never made is over');
  assert.equal(voice.started({}), false);
}));

test('preload fetches the recordings ahead and plays them from memory; one it cannot fetch is asked for at its cue', async () => withFakeAudio(async () => {
  const fetched = [];
  const voice = createVoice({
    fetchFn: async src => { fetched.push(src); return src.includes('gone') ? { ok: false } : { ok: true, blob: async () => `bytes of ${src}` }; },
    makeUrl: blob => `blob:${blob}`,
  });
  await voice.preload(['one.mp3', 'two.mp3', 'two.mp3', 'gone.mp3', '', null], { atOnce: 2 });
  assert.deepEqual(fetched, ['one.mp3', 'two.mp3', 'gone.mp3'], 'each once, nothing empty');
  assert.equal(voice.preloaded, 2);
  voice.play('one.mp3');
  assert.equal(FakeAudio.made.at(-1).src, 'blob:bytes of one.mp3', 'from memory');
  voice.play('gone.mp3');
  assert.equal(FakeAudio.made.at(-1).src, 'gone.mp3', 'from the network, as before');
  await voice.preload(['one.mp3']);
  assert.equal(fetched.length, 3, 'what is in memory is not fetched again');
}));

/** A scene with one speaker and one recorded line, whose sound the test controls; returns what happened and when. */
function sceneWithLine({ sound }) {
  const talked = [];
  const actor = { talk: () => { talked.push(stage.time); return { token: true }; }, stopTalking() {} };
  const world = { actors: new Map([['mosi', actor]]), effects: createEffects(), chapter: { lines: { hi: { text: 'Halló, Egill!', audio: 'hi' } } } };
  const lines = { hi: { src: 'hi.mp3', duration: 2, mouth: 'fff' } };
  let heardAt = Infinity, overAt = Infinity;
  const voice = {
    play: () => sound ? { line: 'hi' } : null,
    stop() {},
    started: () => stage.time >= heardAt,
    done: () => stage.time >= overAt,
  };
  const ui = { caption: () => 1, clearCaption() {}, reset() {}, setFade() {}, showChoices() {}, hideChoices() {}, tray: { hide() {} }, fadeLevel: 0 };
  const stage = createScene({ world, director: { stop() {}, handheld() {}, cut() {} }, ui, voice, lines, cast: { mosi: { name: 'Mosi' } } });
  let finished = null;
  stage.start(function* (s) { yield s.say('mosi', 'hi'); finished = s.time; });
  stage.begin();
  const run = (seconds, dt = 0.05) => { for (let t = 0; t < seconds - 1e-9; t += dt) stage.update(dt); };
  return { talked, run, finished: () => finished, hear: at => { heardAt = at; }, end: at => { overAt = at; } };
}

test('a line waits for its sound to be heard before the mouth moves, and ends when the sound ends', () => {
  const s = sceneWithLine({ sound: true });
  s.hear(1.5); // the recording starts 1.5 s late, as over the network
  s.end(1.5 + 2);
  s.run(1.4);
  assert.deepEqual(s.talked, [], 'the mouth waits for the voice');
  s.run(0.2);
  assert.equal(s.talked.length, 1);
  assert.ok(Math.abs(s.talked[0] - 1.5) < 0.11, `the mouth starts with the sound (at ${s.talked[0]})`);
  s.run(2.3);
  assert.equal(s.finished(), null, 'the line is still on: its sound has 0.3 s to go, plus the hold');
  s.run(0.7);
  assert.ok(s.finished() !== null && Math.abs(s.finished() - 4.0) < 0.11, `over 0.5 s after the sound ended (at ${s.finished()})`);
});

test('a sound that is never heard holds the line 3 s at most, and one that never ends gets 1.5 s of grace', () => {
  const s = sceneWithLine({ sound: true });
  s.run(3.2);
  assert.equal(s.talked.length, 1);
  assert.ok(Math.abs(s.talked[0] - 3.0) < 0.11, `the mouth goes on without the voice at 3 s (at ${s.talked[0]})`);
  s.run(3.9);
  assert.ok(s.finished() !== null && Math.abs(s.finished() - 7.0) < 0.11, `3 + 2 + 1.5 + the hold (at ${s.finished()})`);
});

test('a line without a sound (a capture, a muted voice) runs on its recorded length as before', () => {
  const s = sceneWithLine({ sound: false });
  s.run(0.1);
  assert.equal(s.talked.length, 1, 'the mouth starts at once');
  assert.ok(s.talked[0] < 0.11, `on the first frame (at ${s.talked[0]})`);
  s.run(2.6);
  assert.ok(s.finished() !== null && Math.abs(s.finished() - 2.5) < 0.11, `2 s and the hold (at ${s.finished()})`);
});
