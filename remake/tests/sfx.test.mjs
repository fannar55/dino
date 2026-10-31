import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSfx } from '../engine/audio/sfx.js';
import { createScene } from '../engine/scene/scene.js';
import { DONE } from '../engine/handle.js';
import { centsFromKey, createFakeContext, peakThrough, pitchesOf } from './fake-audio.mjs';

const THEME = JSON.parse(fs.readFileSync(new URL('../assets/audio/theme.json', import.meta.url), 'utf8'));
const NAMES = ['forest', 'step', 'frog', 'snail', 'beetle', 'birds', 'butterfly', 'flower', 'plate', 'star', 'journal', 'saddle', 'float', 'mapOpen', 'mapPen'];
const ONE_SHOTS = NAMES.filter(name => name !== 'forest');
const MELODIC = ['plate', 'star', 'flower', 'journal', 'saddle', 'float']; // the sounds made of bells

/** A tiny seeded random, so the birds and the croaks are the same on every run. */
const seeded = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

function setup(options = {}) {
  const context = createFakeContext({ state: 'running' });
  const sfx = createSfx({ context, theme: THEME, random: seeded(7), ...options });
  return { context, sfx };
}

test('sfx plays each named sound once per call and ignores unknown names', () => {
  const { context, sfx } = setup();
  for (const name of NAMES) {
    const before = context.started.length;
    assert.equal(sfx.play(name), true, `${name} is a sound`);
    const made = context.started.length - before;
    assert.ok(made > 0, `${name} starts something`);
    context.advance(10); // the sound finishes
    if (name === 'forest') continue; // a loop that is laid once: the next test
    const again = context.started.length;
    assert.equal(sfx.play(name), true);
    assert.equal(context.started.length - again, made, `${name} plays the same again: once per call, not piling up or thinning out`);
    context.advance(10);
  }

  const nodes = context.nodes.length;
  for (const name of ['nope', '', 'Frog', ' frog', 'constructor', '__proto__', 'toString', 'hasOwnProperty', undefined, null, 42, {}, ['frog']]) {
    assert.equal(sfx.play(name), false, `${String(name)} is nothing`);
  }
  assert.equal(context.nodes.length, nodes, 'an unknown name does not so much as make a node');
});

test('the forest is one quiet loop of wind, with birds and rustles that come and go over it on the game clock', () => {
  const { context, sfx } = setup();
  assert.equal(sfx.play('forest'), true);
  const beds = context.bufferSources.filter(source => source.loop);
  assert.equal(beds.length, 1, 'one looping bed of wind');
  assert.equal(beds[0].stopTime, undefined, 'it does not end by itself');
  assert.ok(beds[0].reaches(context.destination));
  const started = context.started.length;
  assert.equal(sfx.play('forest'), false, 'asking again lays no second bed over the first');
  assert.equal(context.started.length, started);

  // Nothing is scheduled while the clock stands still: a held game asks for no new birds.
  for (let i = 0; i < 1000; i++) sfx.update(0);
  assert.equal(context.started.length, started);

  // Every 4.3 to 7.6 s of game time a bird calls, or the leaves rustle.
  const calls = [];
  let seen = started;
  for (let t = 0; t < 240; t += 0.25) {
    sfx.update(0.25);
    context.advance(0.25);
    if (context.started.length > seen) {
      calls.push(t);
      seen = context.started.length;
    }
  }
  assert.ok(calls.length >= 240 / 7.8 - 1 && calls.length <= 240 / 4.1 + 1, `${calls.length} calls in 240 s`);
  calls.slice(1).forEach((t, i) => {
    const gap = t - calls[i];
    assert.ok(gap >= 4.2 && gap <= 7.8, `${gap} s between calls`);
  });
  assert.ok(context.oscillators.some(note => pitchesOf(note).some(hz => hz > 1000)), 'with birdsong in it');
  assert.ok(context.bufferSources.filter(source => !source.loop).length > 0, 'and rustles');

  // It is quiet: the bed reaches the speakers far below any effect (a footfall is about 0.5).
  assert.ok(peakThrough(beds[0], context.destination) < 0.03, `${peakThrough(beds[0], context.destination)}`);

  sfx.stop();
  context.advance(5);
  assert.ok(beds[0].ended, 'stop ends the wind');
  const after = context.started.length;
  for (let i = 0; i < 400; i++) sfx.update(0.25);
  assert.equal(context.started.length, after, 'and the birds with it');
  assert.equal(sfx.play('forest'), true, 'the forest can be laid again');
});

test('a forest asked for while sound is still waking is laid the moment sound is allowed, and not after it is stopped', () => {
  // The scene asks for the forest on its first frame, and the audio context takes a moment to wake after the touch.
  const context = createFakeContext({ state: 'suspended' });
  const sfx = createSfx({ context, theme: THEME, random: seeded(3) });
  assert.equal(sfx.play('forest'), false, 'not yet');
  sfx.update(0.016);
  assert.equal(context.started.length, 0);

  context.setState('running');
  sfx.update(0.016);
  assert.equal(context.bufferSources.filter(source => source.loop).length, 1, 'the bed is laid on the next frame');
  assert.equal(sfx.play('forest'), false, 'and asking again lays no second');
  sfx.update(0.016);
  assert.equal(context.bufferSources.filter(source => source.loop).length, 1);

  // A forest the scene gave up on before sound woke is not laid afterwards.
  const other = createFakeContext({ state: 'suspended' });
  const quiet = createSfx({ context: other, theme: THEME });
  quiet.play('forest');
  quiet.stop();
  other.setState('running');
  quiet.update(0.016);
  assert.equal(other.started.length, 0);

  // Nor while the book is open or the effects are muted: it waits for them.
  const held = createFakeContext({ state: 'running' });
  const waiting = createSfx({ context: held, theme: THEME });
  waiting.setPaused(true);
  assert.equal(waiting.play('forest'), false);
  waiting.update(0.016);
  assert.equal(held.started.length, 0);
  waiting.setPaused(false);
  waiting.update(0.016);
  assert.equal(held.bufferSources.filter(source => source.loop).length, 1);
});

test('the plate and the star, and the other bell sounds, are tuned to theme.json\'s key', () => {
  const elsewhere = [440, 495, 556.25, 660, 742.5]; // A major pentatonic, so a test cannot pass by luck
  for (const key of [THEME.key, elsewhere]) {
    const { context, sfx } = setup({ theme: { ...THEME, key } });
    for (const name of MELODIC) {
      const before = context.oscillators.length;
      sfx.play(name);
      context.advance(10);
      const notes = context.oscillators.slice(before);
      assert.ok(notes.length >= 2, `${name} rings`);
      for (const note of notes) {
        for (const hz of pitchesOf(note)) assert.ok(centsFromKey(hz, key) < 1, `${name}: ${hz} Hz is within a cent of the key ${key}`);
      }
    }
  }

  // Without a theme.json there is still a key (C major), so they never go out of tune with each other.
  const context = createFakeContext({ state: 'running' });
  const sfx = createSfx({ context, theme: null });
  sfx.play('star');
  assert.ok(context.oscillators.length >= 2);
});

test('the star climbs up the scale as it rises, and a plate lights with more than one note', () => {
  const { context, sfx } = setup();
  const lowestAt = notes => {
    const at = new Map(); // when a note begins -> the lowest pitch that begins then (a bell's body, under its overtone)
    for (const note of notes) at.set(note.starts[0].when, Math.min(at.get(note.starts[0].when) ?? Infinity, pitchesOf(note)[0]));
    return [...at.entries()].sort((a, b) => a[0] - b[0]).map(([, hz]) => hz);
  };
  sfx.play('star');
  const climb = lowestAt(context.oscillators);
  assert.ok(climb.length >= 4, `${climb.length} notes`);
  climb.slice(1).forEach((hz, i) => assert.ok(hz > climb[i], `note ${i + 2} (${hz} Hz) is above the one before (${climb[i]} Hz)`));

  context.advance(10);
  const before = context.oscillators.length;
  sfx.play('plate');
  assert.ok(new Set(lowestAt(context.oscillators.slice(before))).size >= 3, 'a row lights with a little chord');
});

test('Mosi\'s footfall is a low thump that falls on alternate sides', () => {
  const { context, sfx } = setup();
  const sides = [];
  for (let i = 0; i < 4; i++) {
    const before = context.of('panner').length;
    sfx.play('step');
    context.advance(1);
    const pans = new Set(context.of('panner').slice(before).map(panner => panner.pan.valueAt(1e9)));
    assert.equal(pans.size, 1, 'both halves of a footfall are on the same side');
    sides.push(Math.sign([...pans][0]));
  }
  assert.deepEqual(sides.map(Math.abs), [1, 1, 1, 1]);
  assert.equal(new Set(sides).size, 2);
  sides.slice(1).forEach((side, i) => assert.notEqual(side, sides[i], 'left, right, left, right'));
  assert.ok(context.oscillators.every(note => pitchesOf(note).every(hz => hz < 200)), 'a big animal: nothing high');
});

test('nothing sounds before the first touch, while muted, or while the game is held', () => {
  const asleep = createFakeContext({ state: 'suspended' });
  const sleeper = createSfx({ context: asleep, theme: THEME });
  for (const name of NAMES) assert.equal(sleeper.play(name), false, `${name}: the browser has not allowed sound yet`);
  sleeper.update(1);
  assert.equal(asleep.started.length, 0);
  asleep.setState('running');
  assert.equal(sleeper.play('frog'), true, 'the first touch lets it');

  const { context, sfx } = setup();
  sfx.muted = true;
  assert.equal(sfx.muted, true);
  for (const name of NAMES) assert.equal(sfx.play(name), false, `${name} while muted`);
  assert.equal(context.started.length, 0);
  sfx.muted = false;

  assert.equal(sfx.play('forest'), true);
  const master = context.lastGains[0];
  assert.equal(master.gain.valueAt(context.currentTime + 5), 1);
  sfx.setPaused(true);
  assert.ok(master.gain.valueAt(context.currentTime + 1) < 0.001, 'the book is open: the forest goes quiet, its tails with it');
  assert.equal(sfx.play('frog'), false, 'and nothing new sounds');
  const held = context.started.length;
  for (let i = 0; i < 400; i++) sfx.update(0.25);
  assert.equal(context.started.length, held);
  sfx.setPaused(false);
  assert.ok(master.gain.valueAt(context.currentTime + 1) > 0.999, 'and it comes back');
  assert.equal(sfx.play('frog'), true);
});

test('a muted forest lays no new birds, and a page with no Web Audio has silent effects', () => {
  const { context, sfx } = setup();
  sfx.play('forest');
  context.advance(1);
  sfx.muted = true;
  const before = context.started.length;
  for (let i = 0; i < 400; i++) sfx.update(0.25);
  assert.equal(context.started.length, before);

  for (const nothing of [null, undefined]) {
    const silent = createSfx({ context: nothing, theme: THEME });
    for (const name of NAMES) assert.equal(silent.play(name), false);
    silent.update(1);
    silent.setPaused(true);
    silent.stop();
    silent.muted = true;
    assert.equal(silent.muted, true);
  }
});

test('a child tapping fast does not pile sounds up', () => {
  const { context, sfx } = setup();
  let played = 0;
  for (let i = 0; i < 100; i++) if (sfx.play('frog')) played++;
  assert.equal(played, 1, 'a croak is not on top of another croak');

  context.advance(5);
  played = 0;
  for (let i = 0; i < 200; i++) if (sfx.play('plate')) played++;
  assert.ok(played >= 4 && played < 20, `${played} plates sounded at once`);
  const live = context.started.filter(source => !source.ended).length;
  assert.ok(live <= 64, `${live} notes at once`);

  context.advance(30);
  assert.equal(sfx.play('plate'), true, 'once they have died away, new ones play');
  assert.ok(context.started.filter(source => source.ended).every(source => source.disconnected), 'and a finished sound lets go of its nodes');
});

test('every sound ends by itself and stays well below clipping', () => {
  for (const name of ONE_SHOTS) {
    const { context, sfx } = setup();
    sfx.play(name);
    const sources = [...context.started];
    for (const source of sources) {
      assert.ok(source.stopTime !== undefined, `${name}: every note has an end`);
      assert.ok(source.stopTime - context.currentTime < 4, `${name}: and it comes soon`);
    }
    // The envelopes close on silence, so a note stopped at its end does not click.
    for (const gain of context.of('gain')) {
      const last = gain.gain.events.at(-1);
      if (last?.type === 'exponential') assert.ok(last.value <= 0.0001, `${name}: a note fades to nothing`);
    }
    // The loudest the sound can be: the notes that sound together, each at its peak.
    const notes = sources.map(source => ({ from: source.starts[0].when, to: source.stopTime, peak: peakThrough(source, context.destination) }));
    const loudest = Math.max(...notes.map(a => notes.filter(b => b.from <= a.from && a.from < b.to).reduce((sum, b) => sum + b.peak, 0)));
    assert.ok(loudest > 0.05 && loudest <= 0.6, `${name}: ${loudest.toFixed(3)} at most`);
    context.advance(10);
    assert.ok(sources.every(source => source.ended && source.disconnected), `${name}: it lets go when it is done`);
  }
});

// ---------------------------------------------------------------------------------------------
// s.sfx

function stageWith(extra) {
  return createScene({ world: { actors: new Map() }, director: { stop() {}, handheld() {} }, ui: { reset() {} }, voice: { stop() {} }, ...extra });
}

test('s.sfx plays a sound by name and is done at once', () => {
  const played = [];
  const { s } = stageWith({ sfx: { play: name => { played.push(name); return true; } } });
  assert.equal(s.sfx('frog'), DONE);
  assert.equal(s.sfx('plate'), DONE);
  assert.deepEqual(played, ['frog', 'plate']);
  assert.equal(s.sfx('no-such-sound'), DONE, 'an unknown name is the effects\' business, and does nothing');
});

test('s.sfx makes no sound while the scene is seeking: the replay of a capture is silent, critter reactions included', () => {
  const played = [];
  const stage = stageWith({ sfx: { play: name => { played.push(name); return true; } } });
  stage.seeking = true;
  assert.equal(stage.s.sfx('frog'), DONE);
  assert.deepEqual(played, []);
  stage.seeking = false;
  stage.s.sfx('frog');
  assert.deepEqual(played, ['frog']);
});

test('s.sfx says what it needs when the scene has no effects', () => {
  const { s } = stageWith({});
  assert.throws(() => s.sfx('frog'), /s\.sfx needs .*sfx/);
  const stage = stageWith({});
  stage.seeking = true;
  assert.throws(() => stage.s.sfx('frog'), /s\.sfx needs/, 'also in a capture: a missing dependency is a bug in either');
});

test('stopping the scene stops the forest loop it started', () => {
  let stopped = 0;
  const stage = stageWith({ sfx: { play: () => true, stop: () => { stopped++; } } });
  stage.stop();
  assert.equal(stopped, 1);
  assert.doesNotThrow(() => stageWith({}).stop(), 'a scene without effects stops as before');
  assert.doesNotThrow(() => stageWith({ sfx: { play: () => true } }).stop(), 'and effects without a stop');
});
