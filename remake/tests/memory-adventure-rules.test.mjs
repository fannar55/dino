import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryAdventure, MEMORY_ROCKS } from '../engine/memory/adventure-rules.js';

test('both rocks are locked until the Triceratops match explicitly unlocks helpers', () => {
  const game = createMemoryAdventure();
  assert.deepEqual(game.getState(), { unlocked: false, selected: false, active: null, completed: [], phase: 'locked' });
  assert.equal(game.select(), false);
  for (const id of MEMORY_ROCKS) { assert.equal(game.choose(id), false); assert.equal(game.complete(id), false); }
  assert.equal(game.unlock(), true); assert.equal(game.unlock(), false);
  assert.equal(game.getState().phase, 'available');
  assert.equal(game.choose('home'), false, 'unlock does not implicitly select helpers');
});

test('select toggles without starting work, and unknown tasks cannot start', () => {
  const game = createMemoryAdventure(); game.unlock();
  assert.equal(game.select(), true); assert.equal(game.getState().phase, 'selected');
  for (const id of ['stegosaurus', 'brontosaurus', 'third-rock', '', null, 0]) assert.equal(game.choose(id), false);
  assert.equal(game.select(), true); assert.equal(game.getState().phase, 'available');
  assert.equal(game.choose('butterfly'), false);
});

for (const order of [['home', 'butterfly'], ['butterfly', 'home']]) {
  test(`both rocks complete in ${order.join(' then ')} order without duplicate rewards`, () => {
    const game = createMemoryAdventure(); game.unlock(); game.select();
    for (const [index, id] of order.entries()) {
      assert.equal(game.choose(id), true); assert.equal(game.getState().phase, 'busy');
      assert.equal(game.getState().active, id);
      assert.equal(game.select(), false, 'busy helpers cannot be deselected');
      for (const target of MEMORY_ROCKS) assert.equal(game.choose(target), false, 'only one rock can be active');
      assert.equal(game.complete(MEMORY_ROCKS.find(target => target !== id)), false, 'wrong completion cannot advance task');
      assert.equal(game.complete(id), true); assert.equal(game.complete(id), false);
      assert.deepEqual(game.getState().completed, order.slice(0, index + 1));
      assert.equal(game.choose(id), false, 'completed rock cannot be repeated');
      assert.equal(game.getState().phase, index ? 'complete' : 'selected');
    }
    assert.equal(game.select(), false); assert.equal(game.getState().selected, false);
    assert.equal(game.getState().active, null);
  });
}

test('snapshots cannot mutate rules and old snapshots retain their original progress', () => {
  const game = createMemoryAdventure(); game.unlock(); game.select();
  const before = game.getState();
  assert.throws(() => { before.unlocked = false; }, TypeError);
  assert.throws(() => before.completed.push('home'), TypeError);
  game.choose('home'); game.complete('home');
  assert.deepEqual(before.completed, []); assert.equal(before.phase, 'selected');
  assert.deepEqual(game.getState().completed, ['home']);
});

test('restart abandons active work and rejects late completion until a new task is chosen', () => {
  const game = createMemoryAdventure(); game.unlock(); game.select(); game.choose('butterfly');
  game.restart();
  assert.equal(game.complete('butterfly'), false); assert.equal(game.getState().phase, 'locked');
  game.unlock(); game.select();
  assert.equal(game.complete('butterfly'), false);
  game.choose('home'); game.complete('home'); game.restart();
  assert.deepEqual(game.getState().completed, []); assert.equal(game.getState().selected, false);
});

test('adventure has no timer or memory-win dependency; progress changes only through explicit events', () => {
  const game = createMemoryAdventure(); game.unlock(); game.select(); game.choose('home');
  const active = game.getState();
  for (let i = 0; i < 100; i++) assert.deepEqual(game.getState(), active);
  assert.equal(game.complete('home'), true);
  assert.equal(game.choose('butterfly'), true, 'optional discovery remains available after opening the home path');
  assert.equal(game.complete('butterfly'), true);
});
