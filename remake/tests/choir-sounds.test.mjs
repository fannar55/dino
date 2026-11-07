// The choir's made tones (engine/audio/choir-sounds.js): each group's note at its tone, her horn true at a tone and false as chapter
// 4 has it, held with the game and silenced by stop().
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFakeContext, peakThrough, pitchesOf, centsFromKey } from './fake-audio.mjs';
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
