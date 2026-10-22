import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSfx } from '../engine/audio/sfx.js';
import { FEN_SFX } from '../engine/audio/fen-sounds.js';
import { createScene } from '../engine/scene/scene.js';
import { centsFromKey, createFakeContext, peakThrough, pitchesOf } from './fake-audio.mjs';

// Chapter 2's sounds (engine/audio/fen-sounds.js and the Fen's bed in engine/audio/sfx.js): the footprints' splash, ripple and
// counting tone, the berries, Þórseðla's sniff, breath and chew, the lift, the wind up high, the slide and the landing, the map's
// mark, the Fen's own animals, and the bed of water and frogs that takes over from the forest's wind.

const THEME = JSON.parse(fs.readFileSync(new URL('../assets/audio/theme.json', import.meta.url), 'utf8'));
const NAMES = [
  'splash', 'ripple', 'countTone', 'berryPop', 'sniff', 'breathHuge', 'chew', 'liftTone', 'windHigh', 'slide', 'landSaddle', 'mapMark',
  'dragonfly', 'turtle', 'fish', 'earlyBird',
];
const seeded = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

function setup(options = {}) {
  const context = createFakeContext({ state: 'running' });
  const sfx = createSfx({ context, theme: THEME, random: seeded(11), ...options });
  return { context, sfx };
}

/** The lowest note that begins at each moment, in time order (a bell's body, under its overtone). */
function lowestAt(notes) {
  const at = new Map();
  for (const note of notes) at.set(note.starts[0].when, Math.min(at.get(note.starts[0].when) ?? Infinity, pitchesOf(note)[0]));
  return [...at.entries()].sort((a, b) => a[0] - b[0]).map(([, hz]) => hz);
}

test('chapter 2\'s sounds are the ones the brief names, and the Fen\'s animals\'', () => {
  assert.deepEqual([...FEN_SFX].sort(), [...NAMES].sort());
});

test('each of chapter 2\'s sounds plays once per call, ends by itself, closes on silence and stays well below clipping', () => {
  for (const name of NAMES) {
    const { context, sfx } = setup();
    assert.equal(sfx.play(name, { index: 3, seconds: 8 }), true, `${name} is a sound`);
    const sources = [...context.started];
    assert.ok(sources.length > 0, `${name} starts something`);
    const longest = name === 'liftTone' ? 9.5 : name === 'windHigh' ? 6 : 4;
    for (const source of sources) {
      assert.ok(source.stopTime !== undefined && source.stopTime - context.currentTime <= longest, `${name}: every note ends within ${longest} s`);
    }
    for (const gain of context.of('gain')) {
      const last = gain.gain.events.at(-1);
      if (last?.type === 'exponential') assert.ok(last.value <= 0.0001, `${name}: a note fades to nothing`);
    }
    const notes = sources.map(source => ({ from: source.starts[0].when, to: source.stopTime, peak: peakThrough(source, context.destination) }));
    const loudest = Math.max(...notes.map(a => notes.filter(b => b.from <= a.from && a.from < b.to).reduce((sum, b) => sum + b.peak, 0)));
    assert.ok(loudest > 0.02 && loudest <= 0.6, `${name}: ${loudest.toFixed(3)} at most`);
    context.advance(12);
    assert.ok(sources.every(source => source.ended && source.disconnected), `${name}: it lets go when it is done`);
  }
});

test('every note of chapter 2\'s sounds is a note of the theme\'s key, and a glide runs from one to another', () => {
  const elsewhere = [440, 495, 556.25, 660, 742.5]; // A major pentatonic, so a test cannot pass by luck
  for (const key of [THEME.key, elsewhere]) {
    for (const name of NAMES) {
      const { context, sfx } = setup({ theme: { ...THEME, key } });
      for (const index of [1, 4, 10]) {
        sfx.play(name, { index, seconds: 8 });
        context.advance(12);
      }
      if (!['sniff', 'windHigh'].includes(name)) assert.ok(context.oscillators.length > 0, `${name} has notes`); // those two are only air
      for (const note of context.oscillators) {
        for (const hz of pitchesOf(note)) assert.ok(centsFromKey(hz, key) < 1, `${name}: ${hz.toFixed(2)} Hz is within a cent of the key`);
      }
    }
  }
});

test('the counting tone climbs the key one step for each number, 1 to 10, two octaves at most: the chapter\'s learning beat', () => {
  // each count's own note: the scale of the key from its root, do re mi sol la, then an octave up
  const scale = [...THEME.key, ...THEME.key.map(hz => hz * 2)];
  const mains = [];
  const { context: c2, sfx: s2 } = setup();
  for (let index = 1; index <= 10; index++) {
    const before = c2.oscillators.length;
    s2.play('countTone', { index });
    const notes = c2.oscillators.slice(before);
    mains.push(Math.max(...notes.filter(n => peakThrough(n, c2.destination) >= Math.max(...notes.map(m => peakThrough(m, c2.destination))) - 1e-9).map(n => pitchesOf(n)[0])));
    c2.advance(2);
  }
  mains.forEach((hz, i) => assert.ok(Math.abs(hz - scale[i]) < 0.01, `${i + 1}: ${hz.toFixed(1)} Hz, the key's step ${scale[i].toFixed(1)}`));
  for (let i = 1; i < mains.length; i++) assert.ok(mains[i] > mains[i - 1], 'each above the one before');
  assert.ok(mains.at(-1) / mains[0] <= 4 + 1e-9, 'the ten within two octaves');
  // a count out of range is still a note of the scale, never a buzzer
  for (const index of [0, -3, 11, 99, undefined, 'x']) {
    const before = c2.oscillators.length;
    assert.equal(s2.play('countTone', { index }), true);
    assert.ok(c2.oscillators.slice(before).flatMap(pitchesOf).every(hz => centsFromKey(hz, THEME.key) < 1));
    c2.advance(2);
  }
});

test('a berry\'s pop steps up the key with the count, and a wrong print\'s splash is soft and low', () => {
  const { context, sfx } = setup();
  const tops = [];
  for (let index = 1; index <= 5; index++) {
    const before = context.oscillators.length;
    sfx.play('berryPop', { index });
    const notes = context.oscillators.slice(before);
    tops.push(lowestAt(notes).at(-1));
    context.advance(2);
  }
  for (let i = 1; i < tops.length; i++) assert.ok(tops[i] > tops[i - 1], `berry ${i + 1}'s bell above berry ${i}'s`);
  // the splash: no harsh square or saw, and nothing up where a buzzer would be
  const before = context.oscillators.length;
  sfx.play('splash');
  const notes = context.oscillators.slice(before);
  assert.ok(notes.every(n => n.type === 'sine' || n.type === 'triangle'), 'round notes only');
  const quiet = setup();
  quiet.sfx.play('splash');
  const peak = Math.max(...quiet.context.started.map(s => peakThrough(s, quiet.context.destination)));
  assert.ok(peak <= 0.2, `a splash peaks at ${peak.toFixed(3)}`);
});

test('the lift\'s tone rises for as long as the lift does, and ends higher than it starts', () => {
  for (const seconds of [8, 6.5]) {
    const { context, sfx } = setup();
    sfx.play('liftTone', { seconds });
    const glide = context.oscillators.find(n => pitchesOf(n).length >= 2 && pitchesOf(n).at(-1) > pitchesOf(n)[0]);
    assert.ok(glide, 'a rising glide');
    const ramp = glide.frequency.events.at(-1);
    assert.ok(Math.abs(ramp.time - context.currentTime - seconds) < 0.05, `it rises for ${(ramp.time - context.currentTime).toFixed(2)} s`);
    assert.ok(pitchesOf(glide).at(-1) / pitchesOf(glide)[0] >= 2, 'an octave or more');
    const climb = lowestAt(context.oscillators.filter(n => n !== glide));
    for (let i = 1; i < climb.length; i++) assert.ok(climb[i] >= climb[i - 1], 'its bells climb');
  }
});

test('the Fen\'s bed takes over from the forest\'s wind: one quiet loop of water, with frogs, drips, bubbles and a hum on the game clock', () => {
  const { context, sfx } = setup();
  assert.equal(sfx.play('forest'), true);
  const wind = context.bufferSources.find(source => source.loop);
  assert.equal(sfx.play('fen'), true, 'the Fen\'s bed is laid');
  assert.ok(wind.stopTime !== undefined, 'and the forest\'s wind is let go');
  const fen = context.bufferSources.filter(source => source.loop && source !== wind);
  assert.ok(fen.length >= 1 && fen.length <= 2, `${fen.length} loops of water`);
  for (const loop of fen) {
    assert.equal(loop.stopTime, undefined, 'it does not end by itself');
    assert.ok(peakThrough(loop, context.destination) < 0.03, `and it is quiet (${peakThrough(loop, context.destination).toFixed(4)})`);
  }
  assert.equal(sfx.play('fen'), false, 'asking again lays no second bed');
  // it fades in over a couple of seconds, not at once
  const fade = context.of('gain').find(g => g.gain.events.some(e => e.type === 'linear' && e.value === 1 && e.time - context.currentTime >= 1.5));
  assert.ok(fade, 'a cross-fade');

  // Every 1.2 to 3.4 s of game time something small sounds over it; nothing while the clock stands still.
  const started = context.started.length;
  for (let i = 0; i < 300; i++) sfx.update(0);
  assert.equal(context.started.length, started);
  const calls = [];
  let seen = started;
  for (let t = 0; t < 240; t += 0.1) {
    sfx.update(0.1);
    context.advance(0.1);
    if (context.started.length > seen) {
      calls.push(t);
      seen = context.started.length;
    }
  }
  assert.ok(calls.length >= 240 / 3.5 && calls.length <= 240 / 1.1, `${calls.length} calls in 240 s`);
  calls.slice(1).forEach((t, i) => assert.ok(t - calls[i] >= 1.1 && t - calls[i] <= 3.5, `${(t - calls[i]).toFixed(1)} s between calls`));
  const late = context.oscillators.filter(n => n.starts[0].when > 0.5);
  assert.ok(late.some(n => pitchesOf(n).some(hz => hz < 300)), 'frogs, low');
  assert.ok(late.some(n => pitchesOf(n).some(hz => hz > 1000)), 'drips and a bird, high');
  for (const note of late) for (const hz of pitchesOf(note)) assert.ok(centsFromKey(hz, THEME.key) < 1, `the bed's ${hz.toFixed(1)} Hz is in the key`);

  // The forest again (another chapter's arrival) lets the water go; stop ends whichever is laid.
  assert.equal(sfx.play('forest'), true);
  for (const loop of fen) assert.ok(loop.stopTime !== undefined, 'the water is let go for the wind');
  sfx.play('fen');
  sfx.stop();
  context.advance(6);
  assert.ok(context.bufferSources.filter(source => source.loop).every(source => source.ended), 'stop ends every bed');
  const after = context.started.length;
  for (let i = 0; i < 200; i++) sfx.update(0.25);
  assert.equal(context.started.length, after, 'and nothing more is scheduled');
});

test('a Fen asked for before sound wakes is laid as soon as it does, and replaces a forest that was waiting too', () => {
  const context = createFakeContext({ state: 'suspended' });
  const sfx = createSfx({ context, theme: THEME, random: seeded(5) });
  sfx.play('forest');
  sfx.play('fen');
  context.setState('running');
  sfx.update(0.016);
  const loops = context.bufferSources.filter(source => source.loop);
  assert.ok(loops.length >= 1, 'the bed is laid on the next frame');
  assert.ok(loops.every(source => peakThrough(source, context.destination) < 0.03), 'the Fen\'s, not the forest\'s and the Fen\'s together');
  assert.equal(sfx.play('forest'), true, 'and the forest can come back');
});

test('s.sfx passes a sound its detail (the count, the lift\'s length)', () => {
  const played = [];
  const { s } = createScene({
    world: { actors: new Map() }, director: { stop() {}, handheld() {} }, ui: { reset() {} }, voice: { stop() {} },
    sfx: { play: (name, detail) => { played.push([name, detail]); return true; } },
  });
  s.sfx('countTone', { index: 4 });
  s.sfx('splash');
  assert.deepEqual(played, [['countTone', { index: 4 }], ['splash', undefined]]);
});
