import test from 'node:test';
import assert from 'node:assert/strict';
import fs, { readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
  // (without her real cries the Flugeðla baby's call is the old synth)
  contexts[0].advance(3); audio.reveal('pteranodon', 1);
  assert.equal(audio.getStats().log.find(entry => entry.kind === 'call' && entry.species === 'pteranodon')?.source, 'synth');
}));

const recordedIds = ['triceratops', 'stegosaurus', 'brontosaurus', 'leaf', 'straw', 'foot', 'branch-lift', 'branch-lower', 'log-roll', 'bridge-land', 'bark-pickup', 'bark-place', 'match-chime', 'win', 'river', 'flyer-1', 'flyer-2'];
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
    assert.equal(bank.requested.length, 18, 'manifest plus 17 cues are fetched once');
    await audio.unlock(); await audio.preload(); const context = contexts[0];
    assert.equal(audio.getStats().recordedLoaded, 17);
    audio.reveal('brontosaurus', 0); audio.reveal('brontosaurus', 1);
    const calls = audio.getStats().log.filter(entry => entry.kind === 'call');
    assert.equal(calls.length, 2); assert.ok(calls.every(entry => entry.source === 'recorded'));
    assert.ok(Math.abs(calls[0].end - calls[0].start - .3) < 1e-8, 'queue follows decoded duration rather than old synthesized motif');
    assert.ok(calls[1].start > calls[0].end);
    const sources = context.started.filter(source => source.buffer.duration === .3);
    assert.equal(sources[0].buffer, sources[1].buffer, 'same species reuses identical recorded motif');
    // The Flugeðla baby's call: chapter 4's two flyer cries in turn, played higher.
    context.advance(3); audio.reveal('pteranodon', 2); context.advance(3); audio.reveal('pteranodon', 2);
    const cries = audio.getStats().log.filter(entry => entry.kind === 'call' && entry.species === 'pteranodon');
    assert.deepEqual(cries.map(entry => entry.asset), ['flyer-1', 'flyer-2']); assert.ok(cries.every(entry => entry.source === 'recorded' && entry.rate > 1.2));
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
    assert.equal(audio.getStats().recordedLoaded, 16); assert.deepEqual(audio.getStats().recordedFailed, ['branch-lower']);
    audio.branchLift(); contexts[0].advance(3); audio.branchLower();
    assert.equal(audio.getStats().log.find(entry => entry.kind === 'branch-lift').source, 'recorded');
    assert.equal(audio.getStats().log.find(entry => entry.kind === 'branch-lower').source, 'synth');
    await audio.preload(); assert.equal(bank.requested.length, 18, 'failed local assets are not fetched repeatedly on every event');
  }, bank.options);
});

test('late asset loading cannot start sound during pause or resurrect cancelled events, and duck automation stays bounded', async () => {
  let release; const delay = new Promise(resolve => { release = resolve; });
  const bank = recordedFixture({ delay });
  await fixture(async ({ audio, contexts }) => {
    await audio.unlock(); const context = contexts[0]; audio.reveal('triceratops', 0); audio.pause(true);
    const count = context.started.length; release(); await audio.preload();
    assert.equal(audio.getStats().recordedLoaded, 17); assert.equal(context.started.length, count);
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

test("every line Mosi says goes through the pronunciation standard: each hard word's inflection is a form of its word, a line's say gets the lexicon too, and the owner's picks are sent as he heard them", async () => {
  const tool = await import('../tools/memory-voices.mjs'), { readLexicon } = await import('../tools/pronunciation.mjs');
  const lexicon = readLexicon(tool.ROOT), states = tool.statesOf(lexicon, tool.recordOf(tool.readManifest(), {}));
  assert.deepEqual(states.flatMap(item => item.uncovered.map(word => `${item.id}: ${word}`)), [], "add each to its word's forms (or except) in remake/assets/audio/pronunciation.json, or it is sent as written");
  // by the tracked record (the manifest's keys), every MP3 is of the request sent now, or of the book's that Ný 3 replaces (waiting for him): none is stale
  assert.deepEqual(states.filter(item => !['same', 'ny3'].includes(item.state)).map(item => `${item.id}: ${item.state}`), []);
  for (const item of states) {
    if (item.line.kept !== undefined) { assert.equal(item.key, item.ownKey, `${item.id}: kept, sent as its own fields`); continue; }
    for (const word of item.sent.words.filter(found => found.recipe)) {
      const recipe = lexicon.words[word.id].recipes[word.recipe];
      for (const form of recipe.say === undefined ? [] : word.forms) assert.ok(item.sent.text.includes(typeof recipe.say === 'string' ? recipe.say : recipe.say[form]), `${item.id}: ${form} is sent as its recipe says`);
    }
  }
  for (const id of ['who', 'won', 'push', 'roll', 'gift_shrew', 'help', 'cross', 'held', 'find_stego', 'g2_ledge_ready']) assert.ok(states.find(item => item.id === id).line.kept, `${id}: the owner's pick by ear stays kept`);
  // A line that keeps its own say or context names what it fixes, as main's lines do (heard.mjs fixesProblems).
  assert.deepEqual(tool.fixesFindings(lexicon), []);
});

// The lines whose shipped take the owner rejected and whose new take he has not picked yet: id -> why, and where the candidates are.
const WAITING = {};

test("the owner's verdicts (remake/assets/audio/heard/, set minnisspil): no line sends a request he rejected and no shipped MP3 is a take he rejected, but those waiting for his pick; the takes he picked are the ones that ship", async () => {
  const tool = await import('../tools/memory-voices.mjs'), { readLexicon } = await import('../tools/pronunciation.mjs'), { readHeard, rejection } = await import('../tools/heard.mjs');
  const heard = readHeard(tool.ROOT), states = tool.statesOf(readLexicon(tool.ROOT), tool.recordOf(tool.readManifest(), {}), tool.LINES, heard);
  assert.ok(heard.verdicts.some(verdict => verdict.id.startsWith(`${tool.SET}/`)), 'the tal page of 2026-11-02 is imported');
  const refused = states.filter(item => rejection(heard, item.key)).map(item => item.id);
  // (a shipped take he rejected: by the record's key or by the MP3's sha256, as --verify finds it)
  const shippedNo = states.filter(item => tool.rejectedMp3(heard, item.id) || (item.shipped && rejection(heard, item.shipped))).map(item => item.id);
  assert.deepEqual(tool.verdictIssues(states, heard).rejectedByOwner, shippedNo, '--verify fails on the same lines');
  assert.deepEqual(refused.filter(id => !Object.hasOwn(WAITING, id)), [], 'these send a request the owner rejected: change the recipe or seed (memory-voices.mjs --dry and --try)');
  assert.deepEqual(shippedNo.filter(id => !Object.hasOwn(WAITING, id)), [], 'these ship a take the owner rejected: make them again (memory-voices.mjs --plan)');
  for (const [id, why] of Object.entries(WAITING)) {
    assert.ok(why.length > 20, `${id}: WAITING says why`);
    assert.ok(shippedNo.includes(id), `${id} no longer ships a rejected take: take it out of WAITING`);
  }
  // Each take he said yes to that is a line's request now is the very MP3 that line ships (installed from the take he heard).
  const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const yes = heard.verdicts.filter(verdict => verdict.id.startsWith(`${tool.SET}/`) && verdict.verdict === 'ja');
  for (const item of states) {
    const picked = yes.filter(verdict => verdict.key === item.key && !rejection(heard, item.key));
    if (picked.length) assert.ok(picked.some(verdict => verdict.mp3 === sha(path.join(tool.ROOT, 'remake/assets/audio/memory', `${item.id}.mp3`))), `${item.id}: ships the take he picked (${picked.map(verdict => verdict.id).join(', ')})`);
  }
});

test('Ný 3 (kafli4 a86be9b): a line the owner has not approved is sent with its caption as context and seed 7, an approved key keeps its request, a kept line is untouched, and an A/B leaves it put', async () => {
  const tool = await import('../tools/memory-voices.mjs'), { readLexicon } = await import('../tools/pronunciation.mjs'), { VOICE_LINES } = await import('../engine/memory/voice-lines.js'), { readHeard } = await import('../tools/heard.mjs');
  const lexicon = readLexicon(tool.ROOT);
  const verdicts = entries => ({ verdicts: [], byKey: new Map(entries.map(([key, ...said]) => [key, said.map((verdict, i) => ({ verdict, id: `minnisspil/x${i}`, date: '2026-11-06' }))])) });
  const none = verdicts([]);
  // an unapproved line: the text sent stays, the context is the request's context (none here) and then the caption, the seed 7
  const match = VOICE_LINES.match, book = tool.bookRequest(match, lexicon), bookKey = tool.fingerprintOf(book);
  const plain = tool.memoryRequest(match, lexicon, { heard: none });
  assert.equal(plain.ny3, true); assert.equal(plain.text, book.text); assert.equal(plain.context, match.text); assert.equal(plain.seed, 7);
  assert.notEqual(tool.fingerprintOf(plain), bookKey);
  // the book's context comes first (g2_flown's Flugeðla sentence), then the caption, not the say (g2_light_ready sends Hver in IPA)
  const flown = tool.bookRequest(VOICE_LINES.g2_flown, lexicon);
  assert.ok(flown.context, 'g2_flown has the book\'s Flugeðla context');
  assert.equal(tool.memoryRequest(VOICE_LINES.g2_flown, lexicon, { heard: none }).context, `${flown.context} ${VOICE_LINES.g2_flown.text}`);
  const light = tool.memoryRequest(VOICE_LINES.g2_light_ready, lexicon, { heard: none });
  assert.equal(light.context, VOICE_LINES.g2_light_ready.text); assert.equal(light.text, tool.bookRequest(VOICE_LINES.g2_light_ready, lexicon).text);
  // an approved key keeps its request exactly; a later "nei" on it puts the line on Ný 3 (his latest verdict, as the guard reads it)
  const approved = tool.memoryRequest(match, lexicon, { heard: verdicts([[bookKey, 'ja']]) });
  assert.equal(tool.fingerprintOf(approved), bookKey); assert.equal(approved.ny3, undefined); assert.equal(approved.approved.id, 'minnisspil/x0');
  assert.equal(tool.memoryRequest(match, lexicon, { heard: verdicts([[bookKey, 'ja', 'nei']]) }).ny3, true);
  // the A/B's fixed point: he picks the new take (old "nei", new "ja"), and the line stays on Ný 3, whose take he approved
  const newKey = tool.fingerprintOf(plain), picked = verdicts([[bookKey, 'nei'], [newKey, 'ja']]);
  assert.equal(tool.fingerprintOf(tool.memoryRequest(match, lexicon, { heard: picked })), newKey);
  assert.ok(tool.approval(picked, newKey));
  assert.equal(tool.statesOf(lexicon, { match: newKey }, [['match', match]], picked)[0].state, 'same');
  assert.equal(tool.statesOf(lexicon, { match: bookKey }, [['match', match]], none)[0].state, 'ny3', 'its MP3 is of the book\'s request: waiting for him, which --verify allows');
  // a kept line is untouched, whatever is heard; any other line needs the verdicts passed through
  const who = VOICE_LINES.who, whoKey = tool.fingerprintOf(tool.ownRequest(who));
  for (const heard of [none, verdicts([[whoKey, 'nei']])]) assert.equal(tool.fingerprintOf(tool.memoryRequest(who, lexicon, { heard })), whoKey);
  assert.throws(() => tool.memoryRequest(match, lexicon), /needs the owner's verdicts/);
  // in the repo now (2026-11-08): 11 kept, 17 sent as the book has them because he approved that take, 13 under Ný 3 whose new
  // take he picked (first and package C's three waiting lines on 2026-11-08), and level 1's 9 under Ný 3 waiting for his ear.
  // When a verdict moves a line, move it here.
  const heardNow = readHeard(tool.ROOT), split = { kept: [], approved: [], ny3Picked: [], ny3Waiting: [] };
  for (const item of tool.statesOf(lexicon, tool.recordOf(tool.readManifest(), {}), tool.LINES, heardNow)) {
    if (item.line.kept !== undefined) split.kept.push(item.id);
    else if (item.sent.approved) split.approved.push(item.id);
    else if (item.sent.ny3) split[tool.approval(heardNow, item.key) ? 'ny3Picked' : 'ny3Waiting'].push(item.id);
    else assert.fail(`${item.id}: neither kept, approved nor under Ný 3`);
  }
  assert.deepEqual(split, {
    kept: ['help', 'won', 'held', 'roll', 'cross', 'find_stego', 'who', 'push', 'findFirst', 'gift_shrew', 'g2_ledge_ready'],
    approved: ['match', 'find_bronto', 'build', 'other', 'g2_welcome', 'gifts4', 'gift_ammonite', 'gift_trilobite', 'gift_fern', 'gift_footprint', 'g2_cliff_ready', 'g2_climb', 'g2_pull_ready', 'g2_pull', 'g2_bridge', 'g2_won', 'g2_help'],
    ny3Picked: ['first', 'together', 'lift_ready', 'roll_ready', 'lay_ready', 'g2_left', 'g2_light_ready', 'g2_lit', 'g2_rocks_ready', 'g2_rocks_done', 'g2_through', 'g2_reached', 'g2_flown'],
    ny3Waiting: ['welcome', 'lift', 'walkway', 'finish', 'notYet', 'giftsLeft', 'gifts3', 'gift_hermitCrab', 'gift_crab'],
  });
  // the A/B page: the new take picked when it opens, "Báðar rangar" for both wrong
  const html = tool.janoPage({ title: 't', intro: 'i', none: { label: 'Báðar rangar', how: 'h' }, sections: [{ title: 's', rows: [{ id: 'match', text: 'x', takes: [{ id: 'match_gamla', label: 'Gamla', src: 'a.mp3' }, { id: 'match_nyja', label: 'Nýja', src: 'b.mp3', checked: true }] }] }] });
  assert.match(html, /value="match_nyja" checked>/); assert.doesNotMatch(html, /value="match_gamla" checked/); assert.match(html, /value=""> Báðar rangar/);
});

test('memory-voices.mjs reads its command line strictly: an unknown flag, a stray word, two modes or no mode at all prints the usage and makes nothing', async () => {
  const tool = await import('../tools/memory-voices.mjs');
  for (const argv of [[], ['stray'], ['--bogus'], ['--dry', 'stray'], ['--dry', '--plan'], ['--dry', '--dry'], ['--out', 'x'], ['--only'], ['--only', '--all'], ['--only', 'match', '--all'], ['--only', 'nope'], ['--plan', '--only', 'match'], ['--verify', '--all'], ['--dry', '--all'], ['--ab'], ['--ab', '--out', 'x'], ['--dry', '--out', 'x'], ['--try'], ['--try', 'c.json', '--only', 'match']]) {
    assert.throws(() => tool.parseArgs(argv), error => error.message.endsWith(tool.USAGE), argv.join(' ') || '(a plain run)');
  }
  const parsed = argv => { const { mode, only, all, out, file } = tool.parseArgs(argv); return { mode, only, all, out, file }; };
  assert.deepEqual(parsed(['--only', 'match,other']), { mode: 'make', only: ['match', 'other'], all: false, out: null, file: null });
  assert.deepEqual(parsed(['--all']), { mode: 'make', only: null, all: true, out: null, file: null });
  assert.deepEqual(parsed(['--dry-run', '--only', 'match']), { mode: 'dry', only: ['match'], all: false, out: null, file: null });
  for (const mode of ['dry', 'plan', 'verify']) assert.equal(parsed([`--${mode}`]).mode, mode);
  assert.deepEqual(parsed(['--ab', '--all', '--out', 'qa/x']), { mode: 'ab', only: null, all: true, out: 'qa/x', file: null });
  assert.deepEqual(parsed(['--try', 'c.json']), { mode: 'try', only: null, all: false, out: null, file: 'c.json' });
  // the command itself: exit 1 with the usage, nothing made (a stray word after --dry)
  const { spawnSync } = await import('node:child_process');
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name !== 'ELEVENLABS_API_KEY'));
  const run = spawnSync(process.execPath, [path.join(tool.ROOT, 'remake/tools/memory-voices.mjs'), '--dry', 'stray'], { encoding: 'utf8', env });
  assert.equal(run.status, 1); assert.equal(run.stdout, ''); assert.match(run.stderr, /Unknown argument: stray\s+Usage: memory-voices\.mjs/);
});

test('what a make installs (installPlan): only the lines named with --only or --all, a kept line never made again, and never a request the owner said "nei" to', async () => {
  const tool = await import('../tools/memory-voices.mjs'), { readLexicon } = await import('../tools/pronunciation.mjs'), { readHeard } = await import('../tools/heard.mjs');
  const lexicon = readLexicon(tool.ROOT), heard = readHeard(tool.ROOT), record = tool.recordOf(tool.readManifest(), {});
  const states = tool.statesOf(lexicon, record, tool.LINES, heard);
  assert.throws(() => tool.installPlan(states, { heard }), /--only <ids>, or say --all\. Nothing was made\.\nUsage:/);
  assert.throws(() => tool.installPlan(states, { only: [], heard }), /--only <ids>, or say --all/);
  assert.throws(() => tool.installPlan(states, { only: ['match'], all: true, heard }), /do not go together/);
  assert.throws(() => tool.installPlan(states, { only: ['nope'], heard }), /Not a memory line: nope/);
  // --all: every line; a kept one is only written back to the manifest (its kept request's key); the MP3s mastered anew are --plan's
  const all = tool.installPlan(states, { all: true, heard });
  assert.deepEqual(all.map(item => item.id), tool.LINES.map(([id]) => id));
  for (const item of all) assert.equal(item.install, item.line.kept === undefined, `${item.id}: ${item.line.kept === undefined ? 'made' : 'kept, never made again'}`);
  assert.deepEqual(all.filter(item => item.master).map(item => item.id), tool.planOf(lexicon, record, heard).make.map(item => item.id));
  assert.deepEqual(tool.installPlan(states, { only: ['who'], heard }).map(({ id, install, master }) => ({ id, install, master })), [{ id: 'who', install: false, master: false }]);
  // the request a line sends now is one he said "nei" to: the make stops before anything is asked (T-M3, the guard); a kept line's too
  const withNo = (key, id) => {
    const no = { id: `${tool.SET}/${id}_x`, key, verdict: 'nei', date: '2026-11-06' };
    return { ...heard, verdicts: [...heard.verdicts, no], byKey: new Map([...heard.byKey, [key, [...(heard.byKey.get(key) ?? []), no]]]) };
  };
  for (const id of ['welcome', 'g2_lit', 'who']) {
    const key = states.find(item => item.id === id).key, heardNo = withNo(key, id);
    const again = tool.statesOf(lexicon, record, tool.LINES.filter(([line]) => line === id), heardNo);
    assert.equal(again[0].key, key, `${id}: still sends that request`);
    assert.throws(() => tool.installPlan(again, { only: [id], heard: heardNo }), /The owner rejected exactly this request/, id);
  }
});

test('the record of which request made each MP3 is tracked in the manifest (a key per line), so --plan and --verify say the same with the local index as without it', async () => {
  const tool = await import('../tools/memory-voices.mjs'), { readLexicon } = await import('../tools/pronunciation.mjs'), { readHeard } = await import('../tools/heard.mjs');
  const lexicon = readLexicon(tool.ROOT), heard = readHeard(tool.ROOT), manifest = tool.readManifest();
  for (const [id] of tool.LINES) assert.match(manifest[id]?.key ?? '', /^[0-9a-f]{64}$/, `${id}: the manifest records the key of the request that made its MP3`);
  const tracked = tool.statesOf(lexicon, tool.recordOf(manifest, {}), tool.LINES, heard);
  assert.deepEqual(tool.statesOf(lexicon, tool.recordOf(manifest, tool.readIndex()), tool.LINES, heard), tracked, 'the local index adds nothing');
  for (const item of tracked) if (item.line.kept !== undefined) assert.equal(manifest[item.id].key, item.ownKey, `${item.id}: kept, recorded as its kept request`);
  // what --verify reads from it: no issue from the record, none rejected, level 1's nine waiting for his ear (first went in on
  // 2026-11-08, his pick of its Ný 3 take); --plan lists those nine
  const { issues, waitingForOwner, rejectedByOwner } = tool.verdictIssues(tracked, heard);
  assert.deepEqual(issues, []); assert.deepEqual(rejectedByOwner, []);
  assert.deepEqual(waitingForOwner, ['welcome', 'lift', 'walkway', 'finish', 'notYet', 'giftsLeft', 'gifts3', 'gift_hermitCrab', 'gift_crab']);
  assert.deepEqual(tool.planOf(lexicon, tool.recordOf(manifest, {}), heard).make.map(item => item.id), waitingForOwner);
  // the manifest's key wins; the index (before 2026-11-06) only fills a line the manifest has none for
  assert.deepEqual(tool.recordOf({ a: { key: 'k1' }, b: { src: 'b.mp3' } }, { a: 'old', b: 'k2', c: 'k3' }), { a: 'k1', b: 'k2', c: 'k3' });
});

test('--verify fails when a shipped take is one the owner said "nei" to, by the record\'s key or by the MP3 he heard', async () => {
  const tool = await import('../tools/memory-voices.mjs');
  const said = (...verdicts) => verdicts.map((verdict, i) => ({ verdict, id: `minnisspil/x${i}`, date: '2026-11-06' }));
  const heard = { verdicts: [], byKey: new Map([['k-no', said('ja', 'nei')], ['k-yes', said('nei', 'ja')]]) };
  const states = [{ id: 'a', state: 'same', shipped: 'k-no' }, { id: 'b', state: 'same', shipped: 'k-yes' }, { id: 'c', state: 'same', shipped: 'k-yes' }, { id: 'd', state: 'ny3', shipped: 'k-other' }];
  const found = tool.verdictIssues(states, heard, id => (id === 'c' ? { verdict: 'nei' } : null));
  assert.deepEqual(found.rejectedByOwner, ['a', 'c']); assert.deepEqual(found.waitingForOwner, ['d']);
  assert.deepEqual(found.issues, ['a', 'c'].map(id => `${id}: ships a take the owner said "nei" to: make it again (--plan)`));
});

test('a take is mastered to a part file and goes over the shipped MP3 only when its length checks out', async t => {
  const { spawnSync } = await import('node:child_process');
  if (spawnSync('ffmpeg', ['-version']).status !== 0) { t.skip('no ffmpeg'); return; }
  const tool = await import('../tools/memory-voices.mjs'), os = await import('node:os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-master-')), target = path.join(dir, 'match.mp3');
  try {
    const raw = path.join(tool.ROOT, 'remake/assets/audio/memory/match.mp3');
    fs.writeFileSync(target, 'the shipped take');
    assert.throws(() => tool.master(raw, target, () => { throw new Error('too short'); }), /too short/);
    assert.equal(fs.readFileSync(target, 'utf8'), 'the shipped take', 'a take that fails its check leaves the shipped MP3 as it was');
    assert.deepEqual(fs.readdirSync(dir), ['match.mp3'], 'and no part file behind');
    let checked = null;
    tool.master(raw, target, part => { checked = part; assert.ok(fs.statSync(part).size > 1000); });
    assert.equal(checked, path.join(dir, 'match.part.mp3'));
    assert.notEqual(fs.readFileSync(target).subarray(0, 16).toString(), 'the shipped take'); assert.deepEqual(fs.readdirSync(dir), ['match.mp3']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
