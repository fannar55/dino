import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryMusic, createMemorySpeech } from '../engine/memory/presentation-audio.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
class Media {
  constructor() { this.paused = true; this.currentTime = 0; this.volume = 0; this.events = {}; this.plays = 0; this.reject = false; this.pending = []; }
  addEventListener(name, callback) { this.events[name] = callback; }
  play() { this.plays++; if (this.reject) return Promise.reject(new Error('gesture required')); this.paused = false; return this.defer ? new Promise(resolve => this.pending.push(resolve)) : Promise.resolve(); }
  pause() { this.paused = true; }
  end() { this.paused = true; this.events.ended?.(); }
}
const musicManifest = { provider: 'ElevenLabs', music: { file: 'woodland-theme.mp3', gain: .35, duckGain: .12 } };
const speechManifest = Object.fromEntries(['welcome','lift','held','won','help'].map(id => [id, { src: `assets/audio/memory/${id}.mp3`, mouth: 'ffff000', duration: 1 }]));
const response = data => async () => ({ ok: true, json: async () => data });

test('music waits for a gesture, retries a browser block, and remains audible through actions', async () => {
  const media = new Media(), music = createMemoryMusic({ makeAudio: () => media, fetcher: response(musicManifest) });
  await music.ready; music.pause(false); assert.equal(media.plays, 0);
  media.reject = true; music.unlock(); await flush(); assert.equal(music.getStats().blocked, true);
  media.reject = false; music.unlock(); await flush(); assert.equal(music.getStats().playing, true);
  music.update(2, { action: true, stage: 'marsh' }); assert.ok(media.volume > .27);
  music.update(1, { speech: true }); assert.ok(media.volume < .121);
  music.update(2, {}); assert.ok(media.volume > .32);
});

test('music pause/mute/restart do not let stale play completions stop a newer start', async () => {
  const media = new Media(); media.defer = true;
  const music = createMemoryMusic({ makeAudio: () => media, fetcher: response(musicManifest) });
  await music.ready; music.pause(false); music.unlock();
  music.pause(true); assert.equal(media.paused, true);
  music.pause(false); assert.equal(media.paused, false);
  media.pending[0](); await flush(); assert.equal(media.paused, false);
  media.pending[1](); await flush(); media.currentTime = 12;
  music.mute(true); assert.equal(media.paused, true); assert.equal(media.volume, 0);
  music.mute(false); music.restart(); assert.equal(media.currentTime, 0);
  music.dispose(); for (const resolve of media.pending) resolve(); await flush(); assert.equal(media.paused, true);
});

test('music missing manifest preserves the existing theme without blocking play', async () => {
  const media = new Media(), music = createMemoryMusic({ makeAudio: () => media, fetcher: async () => { throw new Error('offline'); } });
  await music.ready; music.pause(false); music.unlock(); await flush();
  assert.ok(media.src.endsWith('/assets/audio/theme.mp3')); assert.equal(media.paused, false);
});

test('narration waits for camera and game clock, and queues behind current speech', async () => {
  const media = new Media(), speech = createMemorySpeech({ makeAudio: () => media, fetcher: response(speechManifest) });
  await speech.ready; speech.pause(false); speech.queue('lift', { delay: .3 });
  speech.update(10, true); assert.equal(media.plays, 0);
  speech.update(.2); assert.equal(media.plays, 0); speech.update(.11); assert.equal(speech.getStats().current, 'lift');
  speech.queue('held', { delay: .1 }); speech.update(10); assert.equal(speech.getStats().current, 'lift');
  media.end(); speech.update(.2); assert.equal(speech.getStats().current, 'held');
  assert.equal(speech.queue('held'), false);
});

test('narration pause resumes the same playhead; restart and mute cancel stale instructions', async () => {
  const media = new Media(), speech = createMemorySpeech({ makeAudio: () => media, fetcher: response(speechManifest) });
  await speech.ready; speech.pause(false); speech.play('welcome'); await flush(); media.currentTime = .7;
  speech.pause(true); speech.update(10); assert.equal(media.paused, true); assert.equal(media.currentTime, .7);
  speech.pause(false); await flush(); assert.equal(media.paused, false); assert.equal(media.currentTime, .7);
  speech.queue('held'); speech.reset(); speech.update(10); assert.equal(speech.getStats().current, null);
  assert.equal(speech.queue('held'), true); speech.mute(true); speech.mute(false); speech.update(10); assert.equal(speech.getStats().current, null);
});

test('help can speak in its paused dialog; cancelled old promise cannot silence new speech', async () => {
  const media = new Media(); media.defer = true;
  const speech = createMemorySpeech({ makeAudio: () => media, fetcher: response(speechManifest) });
  await speech.ready;
  assert.equal(speech.play('lift'), false); assert.equal(speech.play('help', 0, true), true);
  speech.stop(); speech.pause(false); speech.play('won');
  media.pending[0](); await flush(); assert.equal(media.paused, false); assert.equal(speech.getStats().current, 'won');
  speech.dispose(); media.pending[1](); await flush(); assert.equal(media.paused, true);
});

test('hidden-page suspension silences even help and resumes only when visible again', async () => {
  const media = new Media(), speech = createMemorySpeech({ makeAudio: () => media, fetcher: response(speechManifest) });
  await speech.ready; speech.pause(true); speech.play('help', 0, true); await flush();
  assert.equal(media.paused, false); media.currentTime = .4;
  speech.pause(true, { force: true }); assert.equal(media.paused, true);
  assert.equal(speech.play('help', 0, true), false); speech.update(20); assert.equal(media.currentTime, .4);
  speech.pause(true, { force: false }); await flush(); assert.equal(media.paused, false); assert.equal(media.currentTime, .4);
});
