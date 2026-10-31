import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridgeAdventure, BRIDGE_HELPERS, BRIDGE_ACTIONS } from '../engine/memory/bridge-rules.js';
import { createStepRules } from '../engine/memory/step-rules.js';

const HELPERS = ['triceratops', 'brontosaurus', 'stegosaurus'];
const ACTIONS = ['lift', 'roll', 'cross', 'lay', 'finish'];
const empty = () => ({ unlocked: [], free: [], selected: null, active: null, branch: 'down', bridgeBuilt: false, atStaging: false, boardwalkBuilt: false, visited: false, next: 'branch', asking: null, candidates: [], failing: null, phase: 'locked', done: [] });
function run(game, id) {
  assert.equal(game.can(id), true, id + ' is available'); assert.equal(game.choose(id), true);
  assert.equal(game.getState().active, id);
  for (const action of ACTIONS) assert.equal(game.can(action), false, 'one action owns the helpers');
  assert.equal(game.select(null), false); assert.equal(game.complete('wrong'), false);
  assert.equal(game.complete(id), true); assert.equal(game.complete(id), false, 'completion is consumed once');
  assert.equal(game.getState().selected, null); assert.equal(game.getState().active, null);
}
function lift(game) { game.select('brontosaurus'); run(game, 'lift'); }
function build(game) { lift(game); game.select('triceratops'); run(game, 'roll'); }
function stage(game) { build(game); run(game, 'cross'); }
function lay(game) { stage(game); game.select('stegosaurus'); run(game, 'lay'); }
function allFound() { const game = createBridgeAdventure(); HELPERS.forEach(species => game.unlock(species)); return game; }
const permutations = values => values.length === 1 ? [values] : values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index)).map(rest => [value, ...rest]));

test('three helpers and five actions begin locked with no construction or arrival progress', () => {
  assert.deepEqual([...BRIDGE_HELPERS].sort(), [...HELPERS].sort());
  assert.deepEqual([...BRIDGE_ACTIONS].sort(), [...ACTIONS].sort());
  const game = createBridgeAdventure(); assert.deepEqual(game.getState(), empty());
  for (const id of ACTIONS) { assert.equal(game.can(id), false); assert.equal(game.choose(id), false); assert.equal(game.complete(id), false); }
  for (const species of ['tyrannosaurus', undefined, '', 0]) { assert.equal(game.unlock(species), false); assert.equal(game.select(species), false); }
  for (const species of HELPERS) { assert.equal(game.select(species), false); assert.equal(game.unlock(species), true); assert.equal(game.unlock(species), false); }
});

test('construction requires its own selected species and previous stage', () => {
  const game = allFound();
  for (const species of HELPERS) {
    game.select(null); game.select(species); assert.equal(game.can('lift'), species === 'brontosaurus');
    for (const action of ['roll', 'cross', 'lay', 'finish']) assert.equal(game.can(action), false);
  }
  game.select(null); lift(game);
  assert.equal(game.getState().active, null, 'holding is idle, so memory can continue');
  for (const species of HELPERS) {
    game.select(null); game.select(species);
    assert.equal(game.can('roll'), species === 'triceratops'); assert.equal(game.can('lift'), false, 'a held branch is not lifted again');
    assert.equal(game.can('lay'), false, 'bark cannot be placed from the near bank');
  }
  game.select(null); game.select('triceratops'); run(game, 'roll'); run(game, 'cross');
  for (const species of HELPERS) {
    game.select(null); game.select(species); assert.equal(game.can('lay'), species === 'stegosaurus');
    for (const action of ['lift', 'roll', 'cross', 'finish']) assert.equal(game.can(action), false);
  }
});

test('two found pairs can build the main bridge but crossing waits for all six animals', () => {
  const game = createBridgeAdventure(); game.unlock('brontosaurus'); lift(game);
  game.unlock('triceratops'); game.select('triceratops'); run(game, 'roll');
  assert.equal(game.can('cross'), false); assert.equal(game.choose('cross'), false);
  assert.equal(game.getState().atStaging, false); assert.equal(game.getState().visited, false);
  game.unlock('stegosaurus'); assert.equal(game.can('cross'), true);
});

for (const order of permutations(HELPERS)) test('complete chain after discovery order ' + order.join(' / '), () => {
  const game = createBridgeAdventure(); order.forEach(species => game.unlock(species));
  build(game); assert.equal(game.getState().branch, 'down', 'the built bridge lets the branch go'); run(game, 'cross');
  assert.equal(game.getState().atStaging, true); assert.equal(game.getState().branch, 'down');
  assert.equal(game.getState().boardwalkBuilt, false); assert.equal(game.getState().visited, false);
  assert.notEqual(game.getState().phase, 'complete', 'staging is not the ending'); assert.equal(game.can('finish'), false);
  game.select('stegosaurus'); run(game, 'lay');
  assert.equal(game.getState().boardwalkBuilt, true); assert.equal(game.getState().visited, false);
  assert.notEqual(game.getState().phase, 'complete', 'construction is not final arrival');
  run(game, 'finish'); assert.equal(game.getState().visited, true); assert.equal(game.getState().phase, 'complete');
  for (const action of ACTIONS) assert.equal(game.choose(action), false, 'completed work cannot replay rewards');
  for (const species of HELPERS) assert.equal(game.select(species), false);
});

test('the branch stays held from the lift until the bridge is built, then the Þórseðlur are free again', () => {
  const game = allFound(); lift(game);
  for (const species of HELPERS) { game.select(null); game.select(species); assert.equal(game.can('lift'), false); }
  assert.equal(game.getState().free.includes('brontosaurus'), false, 'holding the branch, they are busy');
  game.select(null); game.select('triceratops'); run(game, 'roll');
  assert.equal(game.getState().branch, 'down'); assert.equal(game.getState().bridgeBuilt, true); assert.equal(game.can('cross'), true);
  assert.equal(game.getState().free.includes('brontosaurus'), true, 'the branch let go, they can be chosen again');
  assert.equal(game.can('lift'), false, 'a built bridge does not need another lift');
  run(game, 'cross'); assert.equal(game.getState().branch, 'down');
});

test('immutable snapshots and selection cannot advance construction or hidden timers', () => {
  const game = allFound(); game.select('stegosaurus'); const before = game.getState();
  assert.throws(() => before.unlocked.push('other'), TypeError);
  assert.throws(() => { before.boardwalkBuilt = true; }, TypeError);
  for (let i = 0; i < 100; i++) { assert.equal(game.can('lay'), false); assert.deepEqual(game.getState(), before); }
  assert.equal(game.select('stegosaurus'), true); assert.equal(game.getState().selected, null);
  assert.equal(game.select(null), false); assert.equal(game.choose('unknown'), false);
  build(game); assert.equal(before.bridgeBuilt, false); assert.equal(before.selected, 'stegosaurus');
});

for (const interrupted of ACTIONS) test('restart during ' + interrupted + ' clears all progress and rejects late completion', () => {
  const game = allFound();
  if (interrupted === 'lift') game.select('brontosaurus');
  else if (interrupted === 'roll') { lift(game); game.select('triceratops'); }
  else if (interrupted === 'cross') build(game);
  else if (interrupted === 'lay') { stage(game); game.select('stegosaurus'); }
  else lay(game);
  assert.equal(game.choose(interrupted), true); game.restart(); assert.equal(game.complete(interrupted), false);
  assert.deepEqual(game.getState(), empty());
});

test('a blocked route returns control without completing work and can be retried', () => {
  for (const interrupted of ACTIONS) {
    const game = allFound();
    if (interrupted === 'lift') game.select('brontosaurus');
    else if (interrupted === 'roll') { lift(game); game.select('triceratops'); }
    else if (interrupted === 'cross') build(game);
    else if (interrupted === 'lay') { stage(game); game.select('stegosaurus'); }
    else lay(game);
    const before = game.getState();
    assert.equal(game.cancel(interrupted), false);
    assert.equal(game.choose(interrupted), true);
    assert.equal(game.cancel('wrong'), false);
    assert.equal(game.getState().active, interrupted);
    assert.equal(game.cancel(interrupted), true);
    const after = game.getState();
    assert.equal(after.active, null); assert.equal(after.selected, null);
    for (const field of ['branch', 'bridgeBuilt', 'atStaging', 'boardwalkBuilt', 'visited']) assert.equal(after[field], before[field]);
    assert.equal(game.complete(interrupted), false, 'a late completion cannot award cancelled work');
    if (before.selected) game.select(before.selected);
    assert.equal(game.choose(interrupted), true, 'retry is available');
  }
});

test('blocked crossing retains the built bridge and the actually released branch', () => {
  const game = allFound(); build(game); game.choose('cross');
  assert.equal(game.cancel('cross', { branch: 'down' }), true);
  assert.equal(game.getState().branch, 'down'); assert.equal(game.getState().bridgeBuilt, true);
  assert.equal(game.getState().atStaging, false); assert.equal(game.getState().visited, false);
  assert.equal(game.can('cross'), true); assert.equal(game.can('lift'), false);
});

test('repeated mixed commands preserve every stage prerequisite', () => {
  const game = createBridgeAdventure(); let seed = 19; const choices = [...ACTIONS, ...HELPERS, null, 'wrong'];
  for (let i = 0; i < 4000; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = choices[seed % choices.length], before = game.getState(), method = ['unlock', 'select', 'choose', 'complete', 'cancel', 'restart'][(seed >>> 10) % 6];
    if (method === 'choose' && game.can(value)) {
      if (value === 'roll') assert.equal(before.branch, 'held');
      if (value === 'cross') assert.ok(before.bridgeBuilt && HELPERS.every(species => before.unlocked.includes(species)));
      if (value === 'lay') assert.ok(before.atStaging && before.selected === 'stegosaurus');
      if (value === 'finish') assert.ok(before.boardwalkBuilt && before.atStaging);
    }
    game[method](value); const after = game.getState();
    assert.equal(new Set(after.unlocked).size, after.unlocked.length); assert.ok(after.unlocked.every(species => HELPERS.includes(species)));
    if (after.selected) assert.ok(after.unlocked.includes(after.selected));
    if (after.atStaging) assert.ok(after.bridgeBuilt && HELPERS.every(species => after.unlocked.includes(species)));
    if (after.boardwalkBuilt) assert.ok(after.atStaging);
    if (after.visited) assert.ok(after.boardwalkBuilt && after.branch === 'down' && after.active === null);
  }
});

// A level that is not level 1: a task, a "together" step and a travel step. The rules read the ladder from the description.
const fakeLevel = (extra = {}) => ({
  id: 'fake', friends: ['x', 'y'],
  steps: [
    { id: 'a', kind: 'task', target: 'rock', species: 'x' },
    { id: 'b', kind: 'together', target: 'rope', beatWords: ['Einn!', 'Tveir!'] },
    { id: 'c', kind: 'travel', target: 'far', needsAllFound: true, automatic: true },
  ],
  flags: done => ({ rockMoved: done.has('a') }),
  ...extra,
});

test("step rules run any level's ladder", () => {
  const rules = createStepRules(fakeLevel());
  assert.equal(rules.next(), 'rock', 'the first step glows first');
  assert.deepEqual(rules.getState().done, []);
  assert.equal(rules.getState().rockMoved, false, "the level's flags are part of the state");
  assert.deepEqual(rules.ask('rope'), { kind: 'not-yet' }, 'the together step waits for the one before it');
  assert.equal(rules.ask('far'), null, 'a travel step is not an obstacle');
  assert.deepEqual(rules.ask('rock'), { kind: 'find-first' });
  rules.unlock('x');
  assert.deepEqual(rules.ask('rock'), { kind: 'choose', candidates: ['x'] });
  assert.deepEqual(rules.pick('x'), { kind: 'start', action: 'a' });
  assert.equal(rules.complete('a'), true);
  assert.deepEqual(rules.getState().done, ['a']); assert.equal(rules.getState().rockMoved, true);
  assert.equal(rules.next(), 'rope');
  assert.deepEqual(rules.ask('rope'), { kind: 'start', action: 'b' }, 'a together step starts at once');
  const together = rules.getState();
  assert.equal(together.asking, null); assert.deepEqual(together.candidates, []); assert.equal(together.active, 'b', 'no bubbles, the step is running');
  assert.equal(rules.complete('b'), true);
  assert.equal(rules.next(), null, 'a travel step starts on its own');
  assert.equal(rules.can('c'), false, 'y is not found yet'); assert.equal(rules.choose('c'), false);
  rules.unlock('y'); assert.equal(rules.can('c'), true);
  assert.equal(rules.choose('c'), true); assert.equal(rules.complete('c'), true);
  assert.equal(rules.getState().phase, 'complete'); assert.deepEqual(rules.getState().done, ['a', 'b', 'c']);
  rules.restart();
  assert.deepEqual(rules.getState().done, []); assert.equal(rules.getState().rockMoved, false); assert.equal(rules.next(), 'rock');
});

test('a step the one before it has not finished cannot start, even by asking', () => {
  const rules = createStepRules(fakeLevel()); rules.unlock('x'); rules.unlock('y');
  for (const id of ['b', 'c']) assert.equal(rules.can(id), false);
  assert.deepEqual(rules.ask('rope'), { kind: 'not-yet' });
  assert.equal(rules.getState().active, null, 'a not-yet answer starts nothing');
  assert.equal(rules.select('x'), true); assert.equal(rules.choose('a'), true);
  assert.deepEqual(rules.ask('rope'), null, 'nothing is asked while a step runs'); assert.equal(rules.getState().active, 'a');
});

test("cancel hands the level's onCancel the step, the options and the done steps", () => {
  const calls = [];
  const rules = createStepRules(fakeLevel({ onCancel: (id, opts, done) => calls.push([id, opts, [...done]]) }));
  rules.unlock('x'); rules.select('x');
  assert.equal(rules.cancel('a', { why: 'blocked' }), false); assert.equal(calls.length, 0, 'nothing runs, nothing to cancel');
  rules.choose('a');
  assert.equal(rules.cancel('b', { why: 'blocked' }), false); assert.equal(calls.length, 0, 'another step is not the running one');
  assert.equal(rules.cancel('a', { why: 'blocked' }), true);
  assert.deepEqual(calls, [['a', { why: 'blocked' }, []]]);
  assert.equal(rules.getState().active, null); assert.deepEqual(rules.getState().done, [], 'a cancelled step is not done');
});

test('holds keep a species busy until the named step', () => {
  const game = allFound(); lift(game);
  assert.equal(game.getState().free.includes('brontosaurus'), false, 'holding the branch');
  assert.equal(game.getState().free.includes('triceratops'), true);
  game.select('triceratops'); run(game, 'roll');
  assert.equal(game.getState().free.includes('brontosaurus'), true, 'the roll let the branch go');
  // The same rule in a level of another shape: x is busy after a until b is done.
  const rules = createStepRules(fakeLevel({ steps: [
    { id: 'a', kind: 'task', target: 'rock', species: 'x', holds: 'b' },
    { id: 'b', kind: 'task', target: 'log', species: 'y' },
  ] }));
  rules.unlock('x'); rules.unlock('y'); rules.select('x'); rules.choose('a'); rules.complete('a');
  assert.deepEqual([...rules.getState().free], ['y']);
  assert.deepEqual(rules.ask('log'), { kind: 'choose', candidates: ['y'] }, 'only the free pair can be chosen');
  rules.pick('y'); rules.complete('b');
  assert.deepEqual([...rules.getState().free], ['x', 'y']);
});

test("level 1's state keeps today's five fields and adds the done steps", () => {
  const game = allFound();
  assert.deepEqual(game.getState().done, []);
  lift(game); assert.deepEqual(game.getState().done, ['lift']); assert.equal(game.getState().branch, 'held');
  game.select('triceratops'); run(game, 'roll'); assert.deepEqual(game.getState().done, ['lift', 'roll']);
  run(game, 'cross'); game.select('stegosaurus'); run(game, 'lay'); run(game, 'finish');
  assert.deepEqual(game.getState().done, ACTIONS);
  assert.deepEqual(Object.keys(game.getState()), Object.keys(empty()), 'done is not one of the listed fields: snapshots still compare as before');
  game.restart(); assert.deepEqual(game.getState().done, []);
});
