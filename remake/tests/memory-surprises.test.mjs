import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGame } from '../engine/memory/rules.js';

// random() = .999 never swaps, so the deck keeps its build order: three pairs, then the two surprises.
const fixed = options => createMemoryGame({ random: () => 0.999, ...options });
const surpriseIds = game => game.getState().cards.filter(card => card.item).map(card => card.id);
const pairIds = (game, species) => game.getState().cards.filter(card => card.species === species).map(card => card.id);

test('deck has 8 cards: 3 pairs and 2 surprises', () => {
  const state = fixed().getState();
  assert.equal(state.cards.length, 8);
  const pairs = state.cards.filter(card => card.species !== null);
  assert.equal(pairs.length, 6);
  for (const name of new Set(pairs.map(card => card.species))) assert.equal(pairs.filter(card => card.species === name).length, 2);
  const surprises = state.cards.filter(card => card.species === null);
  assert.deepEqual(surprises.map(card => card.item).sort(), ['berries', 'butterfly']);
  assert.ok(surprises.every(card => card.status === 'hidden'));
  assert.deepEqual([...state.found], []);
  assert.throws(() => { state.found.push('berries'); }, TypeError);
});

test('a surprise picked first is found and the phase stays ready', () => {
  const game = fixed(), [id] = surpriseIds(game), item = game.getState().cards[id].item;
  assert.deepEqual(game.pick(id), [{ type: 'surprise', ids: [id], item }]);
  const state = game.getState();
  assert.equal(state.phase, 'ready');
  assert.deepEqual([...state.selected], []);
  assert.equal(state.cards[id].status, 'found');
  assert.deepEqual([...state.found], [item]);
  // Nothing was started: no timed stage waits, and the next leaf may be picked at once.
  assert.deepEqual(game.advance(10), []);
  assert.equal(game.pick(pairIds(game, 'triceratops')[0])[0].type, 'reveal');
});

test('a surprise picked second keeps the first leaf open', () => {
  const game = fixed(), [first, twin] = pairIds(game, 'stegosaurus'), [surprise] = surpriseIds(game);
  game.pick(first); game.advance(.45);
  assert.equal(game.getState().phase, 'one-open');
  assert.equal(game.pick(surprise)[0].type, 'surprise');
  const state = game.getState();
  assert.equal(state.phase, 'one-open');
  assert.deepEqual([...state.selected], [first]);
  assert.equal(state.cards[first].status, 'open');
  // The first leaf's twin still matches it.
  assert.equal(game.pick(twin)[0].type, 'reveal');
  assert.deepEqual(game.advance(.45), [{ type: 'match', ids: [first, twin], species: 'stegosaurus', nestIndex: 0 }]);
  assert.equal(game.getState().matchedPairs, 1);
});

test('a surprise cannot be picked while a leaf is still opening', () => {
  const game = fixed(), [surprise] = surpriseIds(game);
  game.pick(pairIds(game, 'brontosaurus')[0]);
  assert.deepEqual(game.pick(surprise), []);
  assert.equal(game.getState().cards[surprise].status, 'hidden');
});

test('found surprises cannot be picked again', () => {
  const game = fixed(), [id] = surpriseIds(game);
  game.pick(id);
  assert.deepEqual(game.pick(id), []);
  assert.equal(game.getState().found.length, 1);
  for (const other of surpriseIds(game).slice(1)) assert.equal(game.pick(other)[0].type, 'surprise');
  assert.deepEqual([...game.getState().found].sort(), ['berries', 'butterfly']);
});

test('won ignores unfound surprises', () => {
  const game = fixed();
  let last = [];
  for (const species of ['triceratops', 'stegosaurus', 'brontosaurus']) {
    const [a, b] = pairIds(game, species);
    game.pick(a); game.advance(.45); game.pick(b); game.advance(.45);
    last = game.advance(1);
  }
  assert.equal(last[0].type, 'won');
  assert.equal(game.getState().phase, 'won');
  assert.deepEqual([...game.getState().found], []);
  assert.ok(surpriseIds(game).every(id => game.getState().cards[id].status === 'hidden'));
});

test('restart reshuffles the surprises back in and forgets what was found', () => {
  const game = fixed(), [id] = surpriseIds(game);
  game.pick(id); game.restart();
  assert.deepEqual([...game.getState().found], []);
  assert.equal(game.getState().cards.filter(card => card.item && card.status === 'hidden').length, 2);
});

test('the surprises are a choice: none, one, or any distinct names', () => {
  assert.equal(fixed({ surprises: [] }).getState().cards.length, 6);
  assert.equal(fixed({ surprises: ['berries'] }).getState().cards.length, 7);
  const frog = fixed({ surprises: ['frog'] });
  assert.equal(frog.getState().cards.find(card => card.item).item, 'frog');
  for (const surprises of [['a', 'a'], [''], [1], 'berries', null]) assert.throws(() => createMemoryGame({ surprises }), TypeError);
});
