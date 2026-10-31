import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMemoryAudio, MEMORY_KEY } from '../engine/memory/audio.js';
import { FakeContext } from './fake-audio.mjs';

async function fixture(run, options = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext'), contexts = [];
  globalThis.AudioContext = class extends FakeContext {
    constructor() { super(); contexts.push(this); this.closeCalls = 0; }
    close() { this.closeCalls++; this.state = 'closed'; return Promise.resolve(); }
    decodeAudioData(bytes) { return options.decode ? options.decode(this, bytes) : super.decodeAudioData(bytes); }
  };
  const audio = createMemoryAudio({ manifestUrl: null, ...options });
  try { await run({ audio, contexts }); }
  finally { audio.dispose(); if (previous) Object.defineProperty(globalThis, 'AudioContext', previous); else delete globalThis.AudioContext; }
}

test('audio remains uninitialized until gesture and notes match the shipped theme', async () => fixture(async ({ audio, contexts }) => {
  audio.reveal('triceratops', 0); audio.win(); audio.pause(false); audio.mute(false);
  assert.equal(contexts.length, 0);
  assert.deepEqual(MEMORY_KEY, JSON.parse(readFileSync(new URL('../assets/audio/theme.json', import.meta.url), 'utf8')).key);
  assert.equal(await audio.unlock(), true);
  assert.equal(contexts.length, 1);
  audio.reveal('triceratops', 0);
  const limiter = contexts[0].of('compressor')[0];
  assert.ok(contexts[0].started.every(source => source.reaches(limiter)));
  assert.equal(audio.getStats().log.filter(entry => entry.kind === 'call').length, 1);
}));

const recordedIds = ['triceratops', 'stegosaurus', 'brontosaurus', 'leaf', 'straw', 'foot', 'branch-lift', 'branch-lower', 'log-roll', 'bridge-land', 'bark-pickup', 'bark-place', 'match-chime', 'win', 'river'];
function recordedFixture({ failed = null, delay = null } = {}) {
  const requested = [];
  return { requested, options: {
    manifestUrl: 'https://game.invalid/soundscape/manifest.json',
    fetcher: async url => {
      requested.push(url);
      if (url.endsWith('manifest.json')) return { ok: true, json: async () => ({ sfx: Object.fromEntries(recordedIds.map((id, index) => [id, { file: `${id}.mp3`, duration: (index + 1) / 10, gain: .6, loopEnd: 1.5 }])) }) };
      const id = url.split('/').at(-1).replace('.mp3', '');
      if (delay) await delay;
      return { ok: id !== failed, arrayBuffer: async () => Uint8Array.of(recordedIds.indexOf(id) + 1).buffer };
    },
    decode: async (context, bytes) => context.createBuffer(1, Math.round(context.sampleRate * new Uint8Array(bytes)[0] / 10), context.sampleRate),
  } };
}

test('recorded preload is silent, caches files, uses actual cue lengths and plays the shipped bank instead of synths', async () => {
  const bank = recordedFixture();
  await fixture(async ({ audio, contexts }) => {
    await audio.preload(); await audio.preload();
    assert.equal(contexts.length, 0, 'network preload neither creates nor wakes audio');
    assert.equal(bank.requested.length, 16, 'manifest plus15cues are fetched once');
    await audio.unlock(); await audio.preload(); const context = contexts[0];
    assert.equal(audio.getStats().recordedLoaded, 15);
    audio.reveal('brontosaurus', 0); audio.reveal('brontosaurus', 1);
    const calls = audio.getStats().log.filter(entry => entry.kind === 'call');
    assert.equal(calls.length, 2); assert.ok(calls.every(entry => entry.source === 'recorded'));
    assert.ok(Math.abs(calls[0].end - calls[0].start - .3) < 1e-8, 'queue follows decoded duration rather than old synthesized motif');
    assert.ok(calls[1].start > calls[0].end);
    const sources = context.started.filter(source => source.buffer.duration === .3);
    assert.equal(sources[0].buffer, sources[1].buffer, 'same species reuses identical recorded motif');
    context.advance(3); audio.match('triceratops'); audio.win();
    for (const [method, argument] of journeyCues) { context.advance(3); audio[method](argument); }
    context.advance(3); audio.footstep('wood', -.2); assert.equal(audio.footstep('wood', .2), false, 'crowded footsteps remain throttled');
    audio.river(true); assert.equal(audio.getStats().riverSource, 'recorded');
    const riverGain = context.of('gain').at(-1); context.advance(2);
    assert.ok(riverGain.gain.value > .59, 'recorded ambience uses its manifest level directly, not the old quiet synthesized-noise multiplier');
    audio.river(true, true); context.advance(2); assert.ok(riverGain.gain.value < .23);
    assert.equal(context.oscillators.length, 0, 'active journey cues use generated files');
    assert.equal(audio.getStats().log.filter(entry => entry.source === 'synth').length, 0);
    assert.equal(audio.getStats().log.filter(entry => entry.asset === 'win').length, 1, 'arrival foley does not duplicate the final fanfare');
    audio.pause(true); assert.equal(audio.getStats().riverPlaying, false); assert.equal(audio.getStats().voices, 0);
    assert.ok(context.started.every(source => source.disconnected));
  }, bank.options);
});

test('a missing recorded cue falls back locally while other generated cues remain usable', async () => {
  const bank = recordedFixture({ failed: 'branch-lower' });
  await fixture(async ({ audio, contexts }) => {
    await audio.unlock(); await audio.preload();
    assert.equal(audio.getStats().recordedLoaded, 14); assert.deepEqual(audio.getStats().recordedFailed, ['branch-lower']);
    audio.branchLift(); contexts[0].advance(3); audio.branchLower();
    assert.equal(audio.getStats().log.find(entry => entry.kind === 'branch-lift').source, 'recorded');
    assert.equal(audio.getStats().log.find(entry => entry.kind === 'branch-lower').source, 'synth');
    await audio.preload(); assert.equal(bank.requested.length, 16, 'failed local assets are not fetched repeatedly on every event');
  }, bank.options);
});

test('late asset loading cannot start sound during pause or resurrect cancelled events, and duck automation stays bounded', async () => {
  let release; const delay = new Promise(resolve => { release = resolve; });
  const bank = recordedFixture({ delay });
  await fixture(async ({ audio, contexts }) => {
    await audio.unlock(); const context = contexts[0]; audio.reveal('triceratops', 0); audio.pause(true);
    const count = context.started.length; release(); await audio.preload();
    assert.equal(audio.getStats().recordedLoaded, 15); assert.equal(context.started.length, count);
    assert.equal(audio.getStats().voices, 0); assert.equal(context.state, 'suspended');
    audio.pause(false); context.advance(3); assert.equal(context.started.length, count);
    audio.reveal('triceratops', 0); assert.equal(audio.getStats().log.at(-1).source, 'recorded');
    const master = context.of('gain').find(node => node.outputs.some(out => out.kind === 'compressor'));
    audio.duck(true); const events = master.gain.events.length;
    for (let frame = 0; frame < 180; frame++) audio.duck(true);
    assert.equal(master.gain.events.length, events, 'render-frame calls do not accumulate automation');
    context.advance(1); assert.ok(master.gain.value < .55);
    audio.duck(false); context.advance(1); assert.ok(master.gain.value > .85);
    audio.mute(true); audio.dispose(); assert.equal(audio.getStats().recordedLoaded, 0); assert.ok(context.started.every(source => source.disconnected));
  }, bank.options);
});

test('disposing before recorded download completion releases the bank and cannot create a context later', async () => {
  let release; const bank = recordedFixture({ delay: new Promise(resolve => { release = resolve; }) });
  await fixture(async ({ audio, contexts }) => {
    const loading = audio.preload(); audio.dispose(); release(); await loading;
    assert.equal(audio.getStats().recordedLoaded, 0); assert.equal(audio.getStats().recordedFetched, 0);
    await audio.unlock(); assert.equal(contexts.length, 0);
  }, bank.options);
});

test('same-species calls share voiced PCM, different species have distinct motifs, and calls never overlap', async () => fixture(async ({ audio, contexts }) => {
  await audio.unlock(); const context = contexts[0];
  audio.reveal('triceratops', 0);
  audio.reveal('triceratops', 1);
  let calls = audio.getStats().log.filter(entry => entry.kind === 'call');
  assert.equal(calls.length, 2);
  assert.ok(calls[1].start > calls[0].end);
  const sources = context.started.filter(source => source.buffer?.duration > 0.4);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].buffer, sources[1].buffer);
  const pcm = sources[0].buffer.getChannelData(0);
  assert.ok(pcm.some(value => Math.abs(value) > 0.6));
  assert.ok(pcm.every(value => Number.isFinite(value) && Math.abs(value) <= 0.71));
  context.advance(2);
  audio.nest('stegosaurus', 0); context.advance(1);
  audio.nest('brontosaurus', 1);
  calls = audio.getStats().log.filter(entry => entry.kind === 'call');
  assert.equal(new Set(calls.map(entry => +(entry.end - entry.start).toFixed(2))).size, 3);
}));

test('mute and pause stop queued calls immediately and never revive them on resume', async () => fixture(async ({ audio, contexts }) => {
  await audio.unlock(); const context = contexts[0];
  audio.reveal('brontosaurus', 0); audio.reveal('triceratops', 1); audio.match('triceratops', 0);
  const started = context.started.length;
  audio.pause(true);
  assert.equal(audio.getStats().voices, 0);
  assert.equal(context.state, 'suspended');
  assert.ok(context.started.every(source => source.stopTime <= context.currentTime && source.disconnected));
  audio.mute(true); audio.pause(false);
  assert.equal(context.state, 'suspended');
  audio.reveal('stegosaurus', 2);
  assert.equal(context.started.length, started);
  audio.mute(false); context.advance(5);
  assert.equal(context.started.length, started);
  audio.reveal('stegosaurus', 2);
  assert.ok(audio.getStats().voices > 0);
  const call = audio.getStats().log.filter(entry => entry.kind === 'call').at(-1);
  assert.ok(call.start < context.currentTime + 0.1, 'new call is not delayed behind cancelled chatter');
}));

test('rapid taps remain bounded and all ended or cancelled sources disconnect', async () => fixture(async ({ audio, contexts }) => {
  await audio.unlock(); const context = contexts[0];
  for (let i = 0; i < 80; i++) { audio.nest('triceratops', i); audio.win(); }
  assert.ok(audio.getStats().voices <= audio.getStats().voiceLimit);
  assert.ok(audio.getStats().dropped > 0);
  assert.ok(audio.getStats().log.filter(entry => entry.kind === 'call').length <= 2);
  context.advance(10);
  assert.equal(audio.getStats().voices, 0);
  assert.ok(context.started.every(source => source.disconnected));
  audio.reveal('brontosaurus', 0); audio.cancel();
  assert.equal(audio.getStats().voices, 0);
  const count = context.started.length;
  audio.dispose(); audio.dispose(); await audio.unlock(); audio.win(); audio.mute(false); audio.pause(false);
  assert.equal(context.closeCalls, 1);
  assert.equal(context.started.length, count);
  assert.equal(context.state, 'closed');
}));

test('muted or paused unlock neither creates nor wakes a context', async () => fixture(async ({ audio, contexts }) => {
  audio.mute(true); assert.equal(await audio.unlock(), false);
  assert.equal(contexts.length, 0);
  audio.mute(false); audio.pause(true); assert.equal(await audio.unlock(), false);
  assert.equal(contexts.length, 0);
  audio.pause(false); await audio.unlock(); audio.mute(true);
  const resumes = contexts[0].resumes;
  await audio.unlock(); audio.pause(false);
  assert.equal(contexts[0].resumes, resumes);
}));

test('rock push is quiet bounded foley, effort waits for animal calls, and only butterfly completion flutters', async () => fixture(async ({ audio, contexts }) => {
  assert.equal(audio.rockPush(), false); assert.equal(audio.rockComplete('home'), false);
  await audio.unlock(); const context = contexts[0];
  audio.reveal('triceratops', 0);
  assert.equal(audio.rockPush(), true); assert.equal(audio.rockPush(), false, 'duplicate push is throttled');
  const voiced = audio.getStats().log.filter(entry => ['call', 'effort'].includes(entry.kind));
  assert.ok(voiced[1].start > voiced[0].end, 'effort does not obscure the identifying call');
  context.advance(2);
  assert.equal(audio.rockComplete('home'), true);
  assert.equal(audio.getStats().log.some(entry => entry.kind === 'butterfly-flutter'), false);
  assert.equal(audio.rockComplete('butterfly'), true);
  assert.equal(audio.getStats().log.filter(entry => entry.kind === 'butterfly-flutter').length, 1);
  assert.equal(audio.rockComplete('stegosaurus'), false, 'no other-species task sound exists');
  for (const source of context.started.filter(source => source.buffer)) {
    assert.ok(source.buffer.getChannelData(0).every(Number.isFinite));
  }
}));

test('pause cancels queued rock effort and flutter without replaying them after resume', async () => fixture(async ({ audio, contexts }) => {
  await audio.unlock(); const context = contexts[0];
  audio.rockPush(); audio.rockComplete('butterfly');
  audio.pause(true);
  assert.equal(audio.getStats().voices, 0);
  assert.ok(context.started.every(source => source.stopTime <= context.currentTime && source.disconnected));
  const count = context.started.length;
  assert.equal(audio.rockPush(), false);
  audio.pause(false); context.advance(2);
  assert.equal(context.started.length, count);
  assert.equal(audio.rockPush(), true, 'cancellation resets push throttle for a new action');
  audio.mute(true); assert.equal(audio.rockComplete('home'), false);
  assert.equal(audio.getStats().voices, 0);
}));

const journeyCues = [['branchLift'], ['branchLower'], ['logRoll'], ['bridgeLand'], ['stagingArrival'], ['barkPickup'], ['barkPlace', 0], ['barkPlace', 1], ['barkPlace', 2], ['boardwalkComplete'], ['berryArrival']];

test('all three construction stages have gesture-gated bounded foley and effort never overlaps a call', async () => fixture(async ({ audio, contexts }) => {
  for (const [method, argument] of journeyCues) assert.equal(audio[method](argument), false, 'journey remains silent before gesture');
  await audio.unlock(); const context = contexts[0];
  audio.reveal('brontosaurus', 0); audio.branchLift();
  const voiced = audio.getStats().log.filter(entry => ['call', 'effort'].includes(entry.kind));
  assert.ok(voiced[1].start > voiced[0].end);
  context.advance(2);
  for (const [method, argument] of journeyCues) {
    assert.equal(audio[method](argument), true); assert.equal(audio[method](argument), false, 'duplicate event is throttled'); context.advance(1);
  }
  const kinds = new Set(audio.getStats().log.map(entry => entry.kind));
  for (const kind of ['branch-lift', 'branch-lower', 'log-roll', 'bridge-land', 'staging-arrival', 'bark-pickup', 'bark-place', 'boardwalk-complete', 'berry-arrival']) assert.ok(kinds.has(kind));
  assert.equal(audio.getStats().log.filter(entry => entry.kind === 'bark-place').length, 3, 'three distinct panel events each sound exactly once');
  for (const source of context.started.filter(source => source.buffer)) assert.ok(source.buffer.getChannelData(0).every(value => Number.isFinite(value) && Math.abs(value) <= 0.71));
  assert.equal(audio.getStats().voices, 0, 'completed bridge sounds clean their nodes');
}));

test('pausing or muting cancels every bridge cue without stale sounds on resume', async () => fixture(async ({ audio, contexts }) => {
  await audio.unlock(); const context = contexts[0];
  for (const [method, argument] of journeyCues) audio[method](argument);
  assert.ok(audio.getStats().voices <= audio.getStats().voiceLimit);
  audio.pause(true); const count = context.started.length;
  assert.equal(audio.getStats().voices, 0);
  for (const [method, argument] of journeyCues) assert.equal(audio[method](argument), false);
  audio.pause(false); context.advance(5); assert.equal(context.started.length, count);
  assert.equal(audio.branchLift(), true, 'cancel resets cue throttle');
  audio.mute(true); assert.equal(audio.branchLower(), false);
  assert.ok(context.started.every(source => source.disconnected));
}));

test('river ambience is one gesture-gated loop with bounded PCM and explicit lifecycle cleanup', async () => fixture(async ({ audio, contexts }) => {
  assert.equal(audio.river(true), false); assert.equal(contexts.length, 0);
  await audio.unlock(); const context = contexts[0], firstNode = context.nodes.length;
  assert.equal(audio.getStats().riverPlaying, false, 'unlock alone does not start ambience');
  assert.equal(audio.river(true), true);
  const loop = context.started.at(-1), riverNodes = context.nodes.slice(firstNode);
  for (let frame = 0; frame < 120; frame++) audio.river(true);
  assert.equal(context.started.length, 1, 'render-frame calls reuse one source');
  assert.equal(loop.loop, true); assert.equal(audio.getStats().voices, 0, 'ambience does not consume the SFX voice pool');
  const pcm = loop.buffer.getChannelData(0);
  assert.ok(pcm.some(value => Math.abs(value) > .05));
  assert.ok(pcm.every(value => Number.isFinite(value) && Math.abs(value) < .66));
  assert.ok(Math.abs(pcm[0] - pcm.at(-1)) < .2, 'loop boundary stays within the normal filtered-noise step');
  const gain = riverNodes.find(node => node.kind === 'gain');
  context.advance(2); const fullLevel = gain.gain.value;
  audio.river(true, true); context.advance(1);
  assert.ok(gain.gain.value < fullLevel * .6, 'speech/action duck lowers the existing loop');
  assert.equal(context.started.length, 1);

  audio.pause(true);
  assert.equal(audio.getStats().riverPlaying, false);
  assert.ok(loop.stopTime <= context.currentTime && riverNodes.every(node => node.disconnected));
  assert.equal(audio.river(true), false);
  audio.pause(false); context.advance(1);
  assert.equal(context.started.length, 1, 'resume waits for a fresh active request');
  assert.equal(audio.river(false), false); assert.equal(context.started.length, 1);
  audio.river(true); const second = context.started.at(-1);
  assert.equal(second.buffer, loop.buffer, 'restarts reuse the prepared PCM');
  audio.mute(true); assert.ok(second.disconnected && second.stopTime <= context.currentTime);
  audio.mute(false); assert.equal(audio.getStats().riverPlaying, false);
  audio.river(true); audio.cancel(); assert.equal(audio.getStats().riverPlaying, false);
  const afterCancel = context.started.length;
  await audio.unlock(); assert.equal(context.started.length, afterCancel);
  audio.river(true); audio.dispose();
  assert.equal(audio.getStats().riverPlaying, false);
  assert.ok(context.started.every(source => source.disconnected));
  assert.equal(audio.river(true), false); assert.equal(context.closeCalls, 1);
}));
