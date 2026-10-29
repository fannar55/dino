import test from 'node:test';
import assert from 'node:assert/strict';
import { nextStoryStep } from '../engine/memory/playful-flow.js';

const all = ['triceratops', 'brontosaurus', 'stegosaurus'];
const ready = Object.fromEntries(all.map(name => [name, true]));
const state = extra => ({ unlocked: [], selected: null, active: null, branch: 'down', bridgeBuilt: false, atStaging: false, boardwalkBuilt: false, visited: false, ...extra });
const memory = { phase: 'ready' };

test('finding a helper offers one direct job only when its physical pair is ready', () => {
  const bridge = state({ unlocked: ['brontosaurus'] });
  assert.equal(nextStoryStep(memory, bridge).available, false);
  const next = nextStoryStep(memory, bridge, ready);
  assert.equal(next.action, 'lift'); assert.equal(next.target, 'branch');
  assert.equal(next.available, true); assert.equal(next.automatic, undefined);
  assert.equal(bridge.selected, null, 'showing the next job does not select a pair or lock memory play');
});
test('guidance never reveals which covered leaf contains a missing helper', () => {
  const next = nextStoryStep(memory, state({ unlocked: ['stegosaurus'] }), ready);
  assert.equal(next.kind, 'search'); assert.equal(next.action, undefined);
  assert.equal(next.target, undefined);
});
test('each child action respects the previous construction step', () => {
  assert.equal(nextStoryStep(memory, state({ unlocked: all }), ready).action, 'lift');
  assert.equal(nextStoryStep(memory, state({ unlocked: all, branch: 'held' }), ready).action, 'roll');
  assert.equal(nextStoryStep(memory, state({ unlocked: all, bridgeBuilt: true, atStaging: true }), ready).action, 'lay');
  assert.equal(nextStoryStep(memory, state({ unlocked: ['brontosaurus'], branch: 'held' }), ready).kind, 'search');
});
test('a finished bridge leads onward automatically after all friends have physically arrived', () => {
  const bridge = state({ unlocked: all, bridgeBuilt: true });
  assert.equal(nextStoryStep(memory, bridge, { ...ready, stegosaurus: false }).automatic, undefined);
  assert.equal(nextStoryStep(memory, bridge, { ...ready, stegosaurus: false }).kind, 'arriving');
  assert.equal(nextStoryStep(memory, state({ unlocked: ['triceratops', 'brontosaurus'], bridgeBuilt: true }), ready).automatic, undefined);
  const next = nextStoryStep(memory, bridge, ready);
  assert.equal(next.action, 'cross'); assert.equal(next.automatic, true);
});
test('the finished walkway leads to the grove without an extra selection step', () => {
  const next = nextStoryStep(memory, state({ unlocked: all, bridgeBuilt: true, atStaging: true, boardwalkBuilt: true }), ready);
  assert.equal(next.action, 'finish'); assert.equal(next.automatic, true);
});
test('Mosi names the obstacle, never the friend who can do it, and there is no button to press', () => {
  const names = /þórseðl|þríhyrn|kambeðl/i;
  for (const bridge of [state({ unlocked: all }), state({ unlocked: all, branch: 'held' }), state({ unlocked: all, bridgeBuilt: true, atStaging: true }), state({ unlocked: all, branch: 'held', asking: 'log' }), state({ unlocked: all, failing: 'stegosaurus' })]) {
    const next = nextStoryStep(memory, bridge, ready);
    assert.doesNotMatch(next.prompt, names, next.key);
    assert.equal(next.label, undefined, 'the gold "Áfram" button is gone');
  }
  assert.equal(nextStoryStep(memory, state({ unlocked: all, asking: 'branch' }), ready).prompt, 'Hver getur þetta?');
  assert.equal(nextStoryStep(memory, state({ unlocked: all, failing: 'triceratops' }), ready).prompt, 'Kannski einhver annar?');
});
test('an active action or final arrival cannot enqueue another action', () => {
  for (const active of ['lift', 'roll', 'cross', 'lay', 'finish']) {
    const next = nextStoryStep(memory, state({ unlocked: all, active, boardwalkBuilt: true }), ready);
    assert.equal(next.kind, 'action'); assert.equal(next.automatic, undefined); assert.equal(next.action, undefined);
  }
  assert.equal(nextStoryStep(memory, state({ visited: true, boardwalkBuilt: true }), ready).kind, 'celebrate');
});
