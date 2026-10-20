import test from 'node:test';
import assert from 'node:assert/strict';
import { createYatzyAudio } from '../engine/yatzy-mosi/audio.js';
import { FakeContext } from './fake-audio.mjs';

function audioFixture(run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext'), contexts = [];
  globalThis.AudioContext = class extends FakeContext {
    constructor() { super(); this.closeCalls = 0; contexts.push(this); }
    close() { this.closeCalls++; this.state = 'closed'; return Promise.resolve(); }
  };
  const audio = createYatzyAudio();
  try { run({ audio, contexts }); }
  finally { audio.dispose(); if (previous) Object.defineProperty(globalThis, 'AudioContext', previous); else delete globalThis.AudioContext; }
}

test('Yatzy audio starts only after unlock and routes every bounded voice through the shared limiter', () => {
  audioFixture(({ audio, contexts }) => {
    audio.cue('win'); assert.equal(contexts.length, 0);
    audio.unlock(); assert.equal(contexts.length, 1);
    const context = contexts[0]; audio.cue('win');
    assert.equal(context.started.length, 5);
    const limiter = context.of('compressor')[0]; assert.ok(limiter); assert.equal(limiter.ratio.value, 4);
    for (const source of context.started) { assert.ok(source.reaches(limiter)); assert.ok(source.stopTime > source.starts[0].when); }
    audio.cue('win'); assert.equal(context.started.length, 5, 'same-frame duplicate cues are throttled');
    for (let i = 0; i < 30; i++) { context.currentTime += .1; audio.cue('win'); }
    assert.equal(audio.getStats().voices, 28); assert.equal(context.started.length, 28, 'an audio backlog cannot allocate unbounded sources');
    context.advance(5); assert.equal(audio.getStats().voices, 0);
    for (const source of context.started) assert.equal(source.disconnected, true);
  });
});

test('Yatzy mute and cancel release voice capacity immediately even before asynchronous ended callbacks', () => {
  audioFixture(({ audio, contexts }) => {
    audio.unlock(); const context = contexts[0];
    for (let i = 0; i < 8; i++) { context.currentTime += .1; audio.cue('win'); }
    assert.equal(audio.getStats().voices, 28);
    audio.cancel(); assert.equal(audio.getStats().voices, 0, 'a new game can sound immediately after cancellation');
    const count = context.started.length;
    audio.cue('hold', { index: 2 }); assert.equal(context.started.length, count + 2);
    audio.mute(true); assert.equal(audio.getStats().voices, 0);
    const played = audio.getStats().played; audio.cue('score'); assert.equal(audio.getStats().played, played);
    for (const source of context.started) assert.ok(source.stopTime <= context.currentTime, 'no delayed celebration remains scheduled after mute');
    audio.mute(false); audio.cue('score'); assert.ok(audio.getStats().voices > 0);
    // Late callbacks from the cancelled voices must not remove the new ones.
    const live = audio.getStats().voices; context.advance(0); assert.equal(audio.getStats().voices, live);
  });
});

test('pausing suspends the actual audio clock and unmuting cannot resume it while paused', () => {
  audioFixture(({ audio, contexts }) => {
    audio.unlock(); const context = contexts[0]; audio.cue('score');
    audio.pause(true); const time = context.currentTime, played = audio.getStats().played;
    context.advance(5); assert.equal(context.currentTime, time); assert.equal(context.state, 'suspended');
    audio.cue('hold'); audio.mute(false); assert.equal(context.state, 'suspended'); assert.equal(audio.getStats().played, played);
    audio.pause(false); assert.equal(context.state, 'running');
    context.advance(2); assert.equal(audio.getStats().voices, 0);
  });
});

test('disposing audio cancels scheduled voices and is terminal and idempotent', () => {
  audioFixture(({ audio, contexts }) => {
    audio.unlock(); const context = contexts[0]; audio.cue('win');
    audio.dispose(); audio.dispose();
    assert.equal(context.closeCalls, 1); assert.equal(context.state, 'closed'); assert.equal(audio.getStats().voices, 0);
    const played = audio.getStats().played;
    audio.unlock(); audio.cue('win'); audio.mute(false); audio.pause(false);
    assert.equal(audio.getStats().played, played); assert.equal(contexts.length, 1); assert.equal(context.state, 'closed');
  });
});
