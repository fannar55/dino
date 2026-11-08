// The choir's made tones (engine/audio/choir-sounds.js): each group's note at its tone, her horn true at a tone and false as chapter
// 4 has it, held with the game and silenced by stop().
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeContext, peakThrough, pitchesOf, centsFromKey } from './fake-audio.mjs';
import fs from 'node:fs';
import * as choirModule from '../engine/audio/choir-sounds.js';
import { createChoirSounds } from '../engine/audio/choir-sounds.js';
import { GROUPS, toneHz } from '../chapters/kafli5-song.js';

const running = () => {
  const context = createFakeContext({ state: 'running' });
  const output = context.createGain();
  output.connect(context.destination);
  return { context, output };
};
/** The sources a call starts: the ones started since `before`. */
const since = (context, before) => context.started.filter(source => !before.has(source));
const startedNow = context => new Set(context.started);
/** How loud `node` reaches `target` at `time`: every gain on the way at that time, multiplied, the loudest way. */
const heardAt = (node, target, time) => {
  if (node === target) return 1;
  const gain = node.kind === 'gain' ? Math.abs(node.gain.valueAt(time)) : 1;
  return gain * Math.max(0, ...node.outputs.filter(out => out.kind).map(out => heardAt(out, target, time)));
};
/** How far `hz` is from `tone` in cents, octaves folded away. */
const offBy = (hz, tone) => {
  const octaves = Math.log2(hz / tone);
  return Math.abs(octaves - Math.round(octaves)) * 1200;
};

test('sing and horn each start one sound at the asked time and level, and stop() silences them', () => {
  const { context, output } = running();
  const sounds = createChoirSounds({ context, output });
  for (const group of GROUPS) {
    const before = startedNow(context);
    assert.equal(sounds.sing(group, { at: 2, level: 0.3, pan: -0.4 }), true);
    const made = since(context, before);
    assert.ok(made.length > 0, group);
    for (const source of made) assert.equal(source.starts[0].when, 2, `${group} starts at the asked time`);
    const peak = Math.max(...made.map(source => peakThrough(source, context.destination)));
    assert.ok(Math.abs(peak - 0.3) < 1e-9, `${group} peaks at its level: ${peak}`);
    for (const source of made) assert.ok(source.stopTime > 2 && source.stopTime < 4.5, `${group} rings out: ${source.stopTime}`);
  }
  const before = startedNow(context);
  assert.equal(sounds.horn('frogs', { at: 1.5, level: 0.2 }), true);
  const horn = since(context, before);
  for (const source of horn) assert.equal(source.starts[0].when, 1.5);
  assert.ok(Math.abs(Math.max(...horn.map(source => peakThrough(source, context.destination))) - 0.2) < 1e-9);
  // the default time is now, and a sound with no level asked for is not silent
  const later = startedNow(context);
  sounds.sing('turtles');
  const now = since(context, later);
  for (const source of now) assert.equal(source.starts[0].when, context.currentTime);
  assert.ok(Math.max(...now.map(source => peakThrough(source, context.destination))) > 0.05);

  context.advance(0.5);
  sounds.stop();
  for (const source of context.started) {
    for (const t of [0.5, 1, 1.6, 2, 2.5, 3]) assert.equal(source.soundingAt(t), false, `${source.kind} at ${t} after stop()`);
  }
});

test('the horn of a group sounds at that group\'s tone; the false horn is off the key by more than 30 cents', () => {
  const { context, output } = running();
  const sounds = createChoirSounds({ context, output });
  for (const group of GROUPS) {
    const before = startedNow(context);
    sounds.horn(group, { at: 1 });
    const pitched = since(context, before).filter(source => source.kind === 'oscillator' && pitchesOf(source).length > 0);
    assert.ok(pitched.length >= 1, group);
    for (const voice of pitched) {
      // after its scoop from under the note, it holds the tone
      for (const t of [1.3, 1.8, 2.2]) assert.ok(offBy(voice.frequency.valueAt(t), toneHz(group)) < 5, `${group} at ${t}: ${voice.frequency.valueAt(t)}`);
    }
    // with no wobble on it: nothing feeds a voice's pitch
    const wobbling = context.nodes.filter(node => node.kind === 'oscillator' && !before.has(node) && node.outputs.some(out => out.kind === 'gain' && out.outputs.some(param => pitched.some(voice => voice.frequency === param))));
    assert.equal(wobbling.length, 0, `${group}: no wobble on the true horn`);
  }
  const key = GROUPS.map(group => toneHz(group));
  const before = startedNow(context);
  assert.equal(sounds.falseHorn({ pan: 0.3 }), true);
  const made = since(context, before).filter(source => source.kind === 'oscillator' && pitchesOf(source).length > 2);
  assert.ok(made.length >= 1, 'the false horn has its voices');
  // where it slips to and holds, 1.6 to 2.1 s in, it is between the key's notes
  const at = made[0].starts[0].when;
  for (const voice of made) {
    for (const t of [1.7, 1.9, 2.05]) assert.ok(centsFromKey(voice.frequency.valueAt(at + t), key) > 30, `false at ${t}: ${voice.frequency.valueAt(at + t)}`);
  }
  // and stop() silences it too: nothing of it reaches the page after
  assert.ok(heardAt(made[0], context.destination, at + 0.5) > 0.01, 'heard before stop()');
  sounds.stop();
  for (const source of made) for (const t of [0.5, 1, 2]) assert.ok(heardAt(source, context.destination, at + t) < 1e-6, `false horn at ${t} after stop()`);
});

test('held with the game, nothing before the first touch, and nothing at all with no audio', () => {
  const { context, output } = running();
  const sounds = createChoirSounds({ context, output });
  sounds.setPaused(true);
  // a held game's master is silent at once, and back after
  const master = context.nodes.find(node => node.kind === 'gain' && node.outputs.includes(output));
  context.advance(0.1);
  assert.ok(master.gain.value < 0.01, `held: ${master.gain.value}`);
  sounds.setPaused(false);
  context.advance(0.2);
  assert.ok(master.gain.value > 0.99, `back: ${master.gain.value}`);

  const asleep = createFakeContext();
  const quiet = createChoirSounds({ context: asleep, output: asleep.destination });
  assert.equal(quiet.sing('frogs'), false);
  assert.equal(quiet.horn('frogs'), false);
  assert.equal(asleep.started.length, 0);

  const none = createChoirSounds({});
  assert.equal(none.sing('frogs'), false);
  assert.equal(none.horn('frogs'), false);
  assert.equal(none.falseHorn(), false);
  assert.equal(none.now, 0);
  none.stop();
  none.setPaused(true);
});

// The recorded tones (Task 6): with the owner's picks each group sings its animal's take tuned to its tone over an instrument note at
// the exact tone, and her horn is a recording tuned to the tone; the made sounds stay where a file cannot be had.
const RECORDED = {
  files: {
    'grazers-1.mp3': { role: 'animal', group: 'grazers', hz: 1059.9, clear: true },
    'turtles-1.mp3': { role: 'animal', group: 'turtles', hz: 126.9, clear: true },
    'frogs-1.mp3': { role: 'animal', group: 'frogs', hz: 2261.3, clear: true },
    'lizards-1.mp3': { role: 'animal', group: 'lizards', hz: 1011.8, clear: true },
    'flyers-1.mp3': { role: 'animal', group: 'flyers', hz: 2481.6, clear: true },
    'instrument.mp3': { role: 'instrument', hz: 440.4 },
    'horn.mp3': { role: 'horn', hz: 86.33 },
    'horn-false.mp3': { role: 'hornFalse', hz: 86.33, wobble: true },
  },
  levels: { animal: 1, instrument: 0.6, horn: 1 },
};
/** A fetch for the recordings: every file answers, but those named in `failing`. */
const fetchFor = (failing = []) => async url => (failing.some(file => String(url).endsWith(file))
  ? { ok: false, status: 404 }
  : { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16), json: async () => RECORDED });
const recordedChoir = async failing => {
  const { context, output } = running();
  context.decodeAudioData = async () => context.createBuffer(1, context.sampleRate * 3, context.sampleRate); // each take 3 s long
  assert.equal(typeof choirModule.loadChoirRecordings, 'function', 'choir-sounds.js has loadChoirRecordings');
  const recordings = choirModule.loadChoirRecordings(context, { fetch: fetchFor(failing), base: 'http://localhost/remake/assets/audio/kafli5/hljod/', sounds: RECORDED });
  await recordings.ready;
  return { context, recordings, sounds: createChoirSounds({ context, output, recordings }) };
};
const playedFrom = (sources, recordings, file) => sources.filter(source => source.kind === 'bufferSource' && source.buffer && source.buffer === recordings.get(file));

test('with recordings each group sings its picked take within 50 cents of its tone, and the instrument exactly on it', async () => {
  const { context, recordings, sounds } = await recordedChoir();
  const instrumentHz = [];
  const hornHz = [];
  for (const group of GROUPS) {
    const before = startedNow(context);
    assert.equal(sounds.sing(group, { at: 1 }), true, group);
    const made = since(context, before);
    const [take] = playedFrom(made, recordings, `${group}-1.mp3`);
    assert.ok(take, `${group} sings its own take`);
    const sung = RECORDED.files[`${group}-1.mp3`].hz * take.playbackRate.value;
    assert.ok(offBy(sung, toneHz(group)) < 50, `${group}: its take at ${sung.toFixed(1)} Hz is ${offBy(sung, toneHz(group)).toFixed(1)} cents off`);
    assert.ok(take.playbackRate.value > 2 ** -0.5 - 1e-9 && take.playbackRate.value < 2 ** 0.5 + 1e-9, `${group}: moved no more than half an octave`);
    const [instrument] = playedFrom(made, recordings, 'instrument.mp3');
    assert.ok(instrument, `${group}: the instrument plays under it`);
    const note = RECORDED.files['instrument.mp3'].hz * instrument.playbackRate.value;
    assert.ok(offBy(note, toneHz(group)) < 0.01, `${group}: the instrument at ${note.toFixed(2)} Hz is on the tone`);
    instrumentHz.push(note);
    for (const source of [take, instrument]) assert.equal(source.starts[0].when, 1, `${group} at the asked time`);
    // the recording takes the made colour's place, and the instrument the made marimba's
    assert.equal(made.filter(source => source.kind === 'oscillator').length, 0, `${group}: nothing made on top`);
    const beforeHorn = startedNow(context);
    sounds.horn(group, { at: 2 });
    const [blown] = playedFrom(since(context, beforeHorn), recordings, 'horn.mp3');
    assert.ok(blown, `${group}: her horn is the recording`);
    const blownHz = RECORDED.files['horn.mp3'].hz * blown.playbackRate.value;
    assert.ok(offBy(blownHz, toneHz(group)) < 50, `${group}: her horn at ${blownHz.toFixed(1)} Hz`);
    assert.equal(blown.starts[0].when, 2, `${group}: her horn at the asked time`);
    hornHz.push(blownHz);
  }
  // one instrument and one horn for the five, each in one octave: low to high as the groups are
  for (const list of [instrumentHz, hornHz]) for (let i = 1; i < list.length; i++) assert.ok(list[i] > list[i - 1], `${list.map(hz => hz.toFixed(1))} rises`);
  assert.ok(instrumentHz.at(-1) / instrumentHz[0] < 2, 'the instrument\'s five within an octave');
  // her false horn: the horn's take made false, off the key by more than 30 cents where it slides to
  const beforeFalse = startedNow(context);
  assert.equal(sounds.falseHorn(), true);
  const [wrong] = playedFrom(since(context, beforeFalse), recordings, 'horn-false.mp3');
  assert.ok(wrong, 'the recorded false horn');
  const key = GROUPS.map(group => toneHz(group));
  const at = wrong.starts[0].when;
  for (const t of [1.2, 1.6]) {
    const hz = RECORDED.files['horn-false.mp3'].hz * wrong.playbackRate.value * 2 ** (wrong.detune.valueAt(at + t) / 1200);
    assert.ok(centsFromKey(hz, key) > 30, `false at ${t}: ${hz.toFixed(1)} Hz`);
  }
  sounds.stop();
  for (const source of context.started) assert.equal(source.soundingAt(context.currentTime + 1), false, `${source.kind} after stop()`);
});

test('a recording that fails to load falls back to the made tone', async () => {
  const { context, recordings, sounds } = await recordedChoir(['frogs-1.mp3', 'instrument.mp3', 'horn.mp3']);
  assert.equal(recordings.get('frogs-1.mp3'), undefined);
  const ours = source => source.kind === 'bufferSource' && source.buffer && Object.keys(RECORDED.files).some(file => recordings.get(file) === source.buffer);
  // the frogs' take failed: their made note (a marimba at the tone and the croak's colour) in its place
  let before = startedNow(context);
  assert.equal(sounds.sing('frogs', { at: 1 }), true);
  let made = since(context, before);
  assert.equal(made.filter(ours).length, 0, 'no recording for the frogs');
  assert.ok(made.some(source => source.kind === 'oscillator' && offBy(source.frequency.valueAt(1.01), toneHz('frogs')) < 5), 'the made marimba on the frogs\' tone');
  // the grazers' take came, but the instrument did not: their take over the made marimba
  before = startedNow(context);
  sounds.sing('grazers', { at: 1 });
  made = since(context, before);
  assert.equal(playedFrom(made, recordings, 'grazers-1.mp3').length, 1, 'the grazers\' own take');
  assert.ok(made.some(source => source.kind === 'oscillator' && offBy(source.frequency.valueAt(1.01), toneHz('grazers')) < 5), 'over the made marimba');
  // the horn failed: the made horn at the tone
  before = startedNow(context);
  sounds.horn('lizards', { at: 1 });
  made = since(context, before);
  assert.equal(made.filter(ours).length, 0, 'no recorded horn');
  assert.ok(made.some(source => source.kind === 'oscillator' && offBy(source.frequency.valueAt(1.5), toneHz('lizards')) < 5), 'the made horn');
  // and when even the list of recordings cannot be had, all is made as before
  const { context: other, output } = running();
  const none = choirModule.loadChoirRecordings(other, { fetch: async () => ({ ok: false, status: 500 }), base: 'http://localhost/x/' });
  await none.ready;
  const plain = createChoirSounds({ context: other, output, recordings: none, random: () => 0.5 });
  assert.equal(plain.sing('turtles', { at: 1 }), true);
  const { context: bare, output: bareOut } = running();
  createChoirSounds({ context: bare, output: bareOut, random: () => 0.5 }).sing('turtles', { at: 1 });
  assert.deepEqual(other.started.map(source => source.kind), bare.started.map(source => source.kind), 'all made, as with no recordings');
});

test('every recording is in CREDITS.md with its licence', () => {
  const folder = new URL('../assets/audio/kafli5/', import.meta.url);
  const sounds = JSON.parse(fs.readFileSync(new URL('hljod/sounds.json', folder), 'utf8'));
  const credits = fs.readFileSync(new URL('CREDITS.md', folder), 'utf8');
  const files = Object.keys(sounds.files);
  assert.ok(files.length >= 6, `the picks: ${files}`);
  // every shipped file is in the list, and every one in the list is shipped
  const shipped = fs.readdirSync(new URL('hljod/', folder)).filter(file => file.endsWith('.mp3'));
  assert.deepEqual([...shipped].sort(), [...files].sort());
  const LICENCE = /CC0 1\.0|CC BY [34]\.0|ElevenLabs sound generation/;
  for (const file of files) {
    const entry = sounds.files[file];
    assert.match(entry.source?.licence ?? '', LICENCE, `${file}: its licence in sounds.json`);
    const line = credits.split('\n').find(text => text.includes(`hljod/${file}`));
    assert.ok(line, `${file} is in CREDITS.md`);
    assert.match(line, LICENCE, `${file}: its licence in CREDITS.md`);
    if (/CC BY/.test(entry.source.licence)) assert.ok(credits.includes(entry.source.author) && credits.includes(entry.source.page), `${file}: its author and page are credited`);
  }
});
