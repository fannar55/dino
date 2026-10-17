import test from 'node:test';
import assert from 'node:assert/strict';
import { createEffects } from '../engine/effects.js';
import { createScene } from '../engine/scene/scene.js';

/** Runs `run` with console.error caught, and gives back what it was told. */
function quietly(run) {
  const told = [];
  const original = console.error;
  console.error = (...args) => told.push(args);
  try {
    run();
  } finally {
    console.error = original;
  }
  return told;
}

test('an effect runs every frame while its update returns true, and is dropped once it returns false', () => {
  const effects = createEffects();
  let left = 3;
  const effect = effects.add({ update: dt => (left -= 1) > 0 && dt > 0 });
  assert.equal(effects.size, 1);
  effects.update(0.1);
  effects.update(0.1);
  assert.equal(effects.size, 1);
  effects.update(0.1);
  assert.equal(effects.size, 0, 'it said it was done');
  assert.equal(effects.has(effect), false);
});

test('one effect that throws is dropped and said once; the others go on, this frame and after', () => {
  const effects = createEffects();
  const ran = [];
  let throws = 0;
  const told = quietly(() => {
    effects.add({ update: () => { ran.push('before'); return true; } });
    const broken = effects.add({ label: 'a hold on a point that is gone', update: () => { throws++; throw new Error('No actor named "nobody"'); } });
    effects.add({ update: () => { ran.push('after'); return true; } });
    effects.update(1 / 30);
    assert.equal(effects.has(broken), false, 'the one that threw is gone');
    effects.update(1 / 30);
    effects.update(1 / 30);
  });
  assert.deepEqual(ran, ['before', 'after', 'before', 'after', 'before', 'after'], 'the frame goes on past it, and so do the frames after');
  assert.equal(throws, 1, 'it is not called again');
  assert.equal(told.length, 1, 'one message');
  assert.match(told[0].join(' '), /a hold on a point that is gone/, 'that names the effect');
  assert.match(told[0].join(' '), /nobody/, 'and gives its error');
  assert.equal(effects.size, 2);
});

test('clear() drops every effect, and an effect cleared in the middle of a frame is not run in it', () => {
  const effects = createEffects();
  const ran = [];
  effects.add({ update: () => { ran.push('first'); effects.clear(); return true; } });
  effects.add({ update: () => { ran.push('second'); return true; } });
  effects.update(0.1);
  assert.deepEqual(ran, ['first'], 'the second was cleared before its turn');
  assert.equal(effects.size, 0);
  effects.update(0.1);
  assert.deepEqual(ran, ['first']);
});

test('stopping the scene clears world.effects: nothing it set going keeps running', () => {
  const effects = createEffects();
  const world = { actors: new Map(), effects };
  const stage = createScene({ world, director: { stop() {}, handheld() {} }, ui: { reset() {} }, voice: { stop() {} } });
  let glowing = 0;
  effects.add({ update: () => { glowing++; return true; } }); // a plate glow, which never ends by itself
  effects.update(0.1);
  stage.stop();
  assert.equal(effects.size, 0);
  effects.update(0.1);
  assert.equal(glowing, 1);
});
