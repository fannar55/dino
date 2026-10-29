import test from 'node:test';
import assert from 'node:assert/strict';
import { createBridgeAdventure, BRIDGE_HELPERS, BRIDGE_ACTIONS } from '../engine/memory/bridge-rules.js';

const HELPERS = ['triceratops', 'brontosaurus', 'stegosaurus'];
const ACTIONS = ['lift', 'roll', 'cross', 'lay', 'finish'];
const empty = () => ({ unlocked: [], free: [], selected: null, active: null, branch: 'down', bridgeBuilt: false, atStaging: false, boardwalkBuilt: false, visited: false, next: 'branch', asking: null, candidates: [], failing: null, phase: 'locked' });
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
  build(game); assert.equal(game.getState().branch, 'held'); run(game, 'cross');
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

test('the branch stays held from the lift until the crossing puts it down', () => {
  const game = allFound(); lift(game);
  for (const species of HELPERS) { game.select(null); game.select(species); assert.equal(game.can('lift'), false); }
  game.select(null); game.select('triceratops'); run(game, 'roll');
  assert.equal(game.getState().branch, 'held'); assert.equal(game.getState().bridgeBuilt, true); assert.equal(game.can('cross'), true);
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
