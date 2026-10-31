import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridgeAdventure, BRIDGE_ACTIONS } from '../engine/memory/bridge-rules.js';

// "Hver getur þetta?": the child taps the obstacle that glows, then picks a friend from the bubbles.
const found = (...species) => { const bridge = createBridgeAdventure(); species.forEach(name => bridge.unlock(name)); return bridge; };
const all = () => found('triceratops', 'brontosaurus', 'stegosaurus');
function solve(bridge, target, species) {
  assert.equal(bridge.ask(target).kind, 'choose');
  const pick = bridge.pick(species);
  assert.equal(pick.kind, 'start');
  assert.equal(bridge.complete(pick.action), true);
}

test('next is branch, then log while the branch is held, then bark at staging', () => {
  const bridge = all();
  assert.equal(BRIDGE_ACTIONS.includes('lower'), false, 'the branch is never put down by hand');
  assert.equal(bridge.next(), 'branch');
  solve(bridge, 'branch', 'brontosaurus');
  assert.equal(bridge.getState().branch, 'held');
  assert.equal(bridge.next(), 'log');
  solve(bridge, 'log', 'triceratops');
  assert.equal(bridge.next(), null, 'the crossing starts on its own');
  assert.equal(bridge.choose('cross'), true); assert.equal(bridge.complete('cross'), true);
  assert.equal(bridge.next(), 'bark');
  solve(bridge, 'bark', 'stegosaurus');
  assert.equal(bridge.next(), null);
});

test('ask with no found pair says find-first', () => {
  const bridge = createBridgeAdventure();
  assert.deepEqual(bridge.ask('branch'), { kind: 'find-first' });
  assert.equal(bridge.getState().phase, 'locked', 'no bubbles open');
  assert.equal(bridge.pick('brontosaurus'), null);
});

test('ask on a not-yet obstacle says not-yet', () => {
  const bridge = all();
  assert.deepEqual(bridge.ask('log'), { kind: 'not-yet' });
  assert.deepEqual(bridge.ask('bark'), { kind: 'not-yet' });
  assert.equal(bridge.pick('triceratops'), null, 'a not-yet answer opens no bubbles');
  assert.equal(bridge.ask('rock'), null, 'an unknown target is ignored');
});

test('a busy pair is not a candidate', () => {
  const bridge = all();
  solve(bridge, 'branch', 'brontosaurus');
  const ask = bridge.ask('log');
  assert.equal(ask.kind, 'choose');
  assert.deepEqual([...ask.candidates].sort(), ['stegosaurus', 'triceratops']);
  assert.equal(ask.candidates.includes('brontosaurus'), false, 'the brontos are holding the branch');
  assert.equal(bridge.pick('brontosaurus'), null);
  // Only the busy pair found: Mosi's hint, never an empty row of bubbles (Review Focus 4).
  const alone = found('brontosaurus');
  solve(alone, 'branch', 'brontosaurus');
  assert.deepEqual(alone.ask('log'), { kind: 'find-first' });
  assert.notEqual(alone.getState().phase, 'choosing');
});

test('wrong pick fails, then failDone returns to choosing', () => {
  const bridge = found('triceratops', 'brontosaurus');
  assert.deepEqual(bridge.ask('branch'), { kind: 'choose', candidates: ['triceratops', 'brontosaurus'] });
  assert.equal(bridge.getState().phase, 'choosing');
  assert.deepEqual(bridge.pick('triceratops'), { kind: 'fail' });
  const failing = bridge.getState();
  assert.equal(failing.phase, 'failing'); assert.equal(failing.failing, 'triceratops'); assert.equal(failing.active, null);
  assert.equal(bridge.pick('brontosaurus'), null, 'no pick while the wrong friend is still trying');
  assert.equal(bridge.ask('branch'), null, 'no new bubbles during the failure');
  assert.equal(bridge.failDone(), true);
  assert.equal(bridge.failDone(), false, 'a failure is over once');
  const again = bridge.getState();
  assert.equal(again.phase, 'choosing'); assert.equal(again.asking, 'branch'); assert.deepEqual(again.candidates, ['triceratops', 'brontosaurus']);
  assert.equal(again.branch, 'down', 'a failure changes nothing in the world');
  assert.deepEqual(bridge.pick('brontosaurus'), { kind: 'start', action: 'lift' });
});

test('right pick starts the action; picks during an action are ignored', () => {
  const bridge = all();
  bridge.ask('branch');
  assert.deepEqual(bridge.pick('brontosaurus'), { kind: 'start', action: 'lift' });
  const state = bridge.getState();
  assert.equal(state.active, 'lift'); assert.equal(state.selected, 'brontosaurus'); assert.equal(state.asking, null);
  // Double taps on a bubble, a tap on the obstacle, a tap on another bubble: all ignored (Review Focus 1).
  for (const species of ['brontosaurus', 'brontosaurus', 'triceratops', 'stegosaurus']) assert.equal(bridge.pick(species), null);
  assert.equal(bridge.ask('branch'), null); assert.equal(bridge.ask('log'), null);
  assert.equal(bridge.failDone(), false); assert.equal(bridge.dismiss(), false);
  assert.equal(bridge.getState().active, 'lift');
  assert.equal(bridge.complete('lift'), true);
  assert.equal(bridge.getState().branch, 'held'); assert.equal(bridge.getState().phase, 'available');
  assert.equal(bridge.pick('triceratops'), null, 'a pick needs its own question first');
  // Closing the bubbles leaves nothing open, and restart clears a question too.
  bridge.ask('log'); assert.equal(bridge.dismiss(), true); assert.equal(bridge.pick('triceratops'), null);
  bridge.ask('log'); bridge.pick('stegosaurus'); bridge.restart();
  assert.equal(bridge.getState().failing, null); assert.equal(bridge.getState().asking, null); assert.equal(bridge.failDone(), false);
});
