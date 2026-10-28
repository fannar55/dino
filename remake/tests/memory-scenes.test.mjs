import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneRunner } from '../engine/memory/scenes.js';

// A script is a timeline of lines on the game clock. perform(line) runs every key but `wait`.
function fixture() {
  const performed = [];
  const runner = createSceneRunner({ perform: line => performed.push(line.name) });
  return { runner, performed };
}

test('scene lines fire in order at their times', () => {
  const { runner, performed } = fixture();
  runner.play([{ at: 1.0, act: 'c', name: 'c' }, { at: 0, act: 'a', name: 'a' }, { at: .5, act: 'b', name: 'b' }]);
  runner.update(.4);
  assert.deepEqual(performed, ['a']);
  runner.update(.2);
  assert.deepEqual(performed, ['a', 'b']);
  assert.equal(runner.busy(), true);
});

test('scene wait holds until count taps', () => {
  const { runner, performed } = fixture();
  const taps = [];
  runner.play([{ at: 0, wait: { tap: 'log', count: 3, timeout: 4, onTap: i => taps.push(i) } }, { at: .1, fx: 'dust', name: 'after' }]);
  assert.deepEqual(runner.waiting(), { target: 'log', count: 3, left: 4 });
  runner.update(1);
  assert.deepEqual(performed, [], 'the script clock stops while it waits');
  assert.equal(runner.tap('branch'), false, 'a tap nobody waits for is not taken');
  for (let i = 0; i < 3; i++) assert.equal(runner.tap('log'), true);
  assert.deepEqual(taps, [0, 1, 2]);
  assert.equal(runner.waiting(), null);
  runner.update(.1);
  assert.deepEqual(performed, ['after']);
});

test('scene wait times out after 4 s of game time', () => {
  const { runner, performed } = fixture();
  let timeouts = 0;
  runner.play([{ at: 0, wait: { tap: 'log', count: 3, timeout: 4, onTimeout: () => timeouts++ } }, { at: .1, act: 'go', name: 'after' }]);
  runner.tap('log');
  runner.update(3.9);
  assert.equal(runner.waiting()?.target, 'log');
  assert.equal(runner.waiting().count, 2);
  assert.equal(timeouts, 0);
  runner.update(.2);
  assert.equal(timeouts, 1);
  assert.equal(runner.waiting(), null);
  runner.update(.1);
  assert.deepEqual(performed, ['after'], 'the script continues after the timeout');
  runner.update(10);
  assert.equal(timeouts, 1);
});

test('scene paused frames change nothing', () => {
  const { runner, performed } = fixture();
  runner.play([{ at: 0, wait: { tap: 'log', count: 1, timeout: 4 } }, { at: .2, act: 'later', name: 'later' }]);
  runner.update(1.5);
  const before = runner.waiting();
  runner.update(0); runner.update(-1); runner.update(NaN);
  assert.deepEqual(runner.waiting(), before);
  assert.equal(before.left, 2.5);
  assert.deepEqual(performed, []);
});

test('scene cancelAll stops every script', () => {
  const { runner, performed } = fixture();
  let done = 0;
  runner.play([{ at: 0, act: 'a', name: 'a' }, { at: 1, act: 'b', name: 'b' }], { onDone: () => done++ });
  runner.play([{ at: 0, wait: { tap: 'log', count: 2, timeout: 4 } }, { at: .5, act: 'c', name: 'c' }]);
  assert.equal(runner.busy(), true);
  runner.cancelAll();
  assert.equal(runner.busy(), false);
  assert.equal(runner.waiting(), null);
  assert.equal(runner.tap('log'), false);
  runner.update(5);
  assert.deepEqual(performed, ['a']);
  assert.equal(done, 0, 'a cancelled script never reports done');
  runner.play([{ at: 0, act: 'd', name: 'd' }], { onDone: () => done++ });
  runner.update(.1);
  assert.equal(done, 1);
  assert.equal(runner.busy(), false);
});
