import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGame } from '../engine/memory/rules.js';

const fixed = () => createMemoryGame({ random: () => 0.999 });
const pairIds = (game, species) => game.getState().cards.filter(card => card.species === species).map(card => card.id);
function revealTwo(game, first, second) {
  assert.equal(game.pick(first)[0]?.type, 'reveal');
  game.advance(0.45);
  assert.equal(game.pick(second)[0]?.type, 'reveal');
  return game.advance(0.45);
}
function invariant(game) {
  const state = game.getState();
  assert.equal(new Set(state.cards.map(card => card.id)).size, state.cards.length);
  assert.ok(state.cards.filter(card => card.status === 'open').length <= 2);
  assert.equal(state.cards.filter(card => card.status === 'matched').length, 2 * state.matchedPairs);
  assert.equal(new Set(state.selected).size, state.selected.length);
  assert.ok(state.selected.every(id => state.cards[id].status !== 'hidden'));
  // Surprise leaves (species null) hide no friend: they are never part of a pair.
  for (const name of new Set(state.cards.map(card => card.species).filter(Boolean))) {
    const pair = state.cards.filter(card => card.species === name);
    assert.equal(pair.length, 2);
    assert.notEqual(pair.filter(card => card.status === 'matched').length, 1);
  }
}

test('new game has three shuffled pairs, two surprise leaves and independent, deeply immutable snapshots', () => {
  const game = fixed(), before = game.getState();
  assert.equal(before.phase, 'ready');
  assert.equal(before.cards.length, 8);
  assert.equal(before.cards.filter(card => card.species === null).length, 2);
  assert.equal(before.matchedPairs, 0);
  assert.equal(before.paused, false);
  assert.ok(before.cards.every(card => card.status === 'hidden'));
  assert.throws(() => { before.cards[0].species = 'changed'; }, TypeError);
  assert.throws(() => { before.selected.push(0); }, TypeError);
  game.pick(0);
  assert.equal(before.cards[0].status, 'hidden');
  assert.equal(game.getState().cards[0].status, 'open');
  invariant(game);
});

test('supplied random source controls Fisher-Yates shuffle and each restart reshuffles', () => {
  let sample = 0.999, calls = 0;
  const roster = ['a', 'b', 'c'];
  const game = createMemoryGame({ species: roster, random: () => { calls++; return sample; } });
  const names = () => game.getState().cards.map(card => card.species ?? card.item);
  assert.deepEqual(names(), ['a', 'a', 'b', 'b', 'c', 'c', 'berries', 'butterfly']);
  assert.equal(calls, 7);
  roster[0] = 'external change';
  sample = 0;
  game.restart();
  assert.deepEqual(names(), ['a', 'b', 'b', 'c', 'c', 'berries', 'butterfly', 'a']);
  assert.equal(calls, 14);
  invariant(game);
});

test('first reveal has a readability lock; same, invalid and third cards never reveal', () => {
  const game = fixed();
  for (const invalid of [-1, 8, 1.5, NaN, '0', null]) assert.deepEqual(game.pick(invalid), []);
  assert.deepEqual(game.pick(0), [{ type: 'reveal', ids: [0], species: 'triceratops' }]);
  assert.equal(game.getState().phase, 'revealing');
  assert.deepEqual(game.pick(0), []);
  assert.deepEqual(game.pick(2), []);
  game.advance(0.44);
  assert.deepEqual(game.pick(2), []);
  game.advance(0.01);
  assert.equal(game.getState().phase, 'one-open');
  assert.deepEqual(game.pick(0), []);
  game.pick(2);
  assert.deepEqual(game.pick(4), []);
  assert.deepEqual(game.getState().selected, [0, 2]);
  invariant(game);
});

test('mismatch exposes both for 1.5 seconds after reveal and locks during closing', () => {
  const game = fixed();
  assert.deepEqual(revealTwo(game, 0, 2), []);
  assert.equal(game.getState().phase, 'mismatch');
  assert.deepEqual(game.advance(1.49), []);
  assert.equal(game.getState().cards.filter(card => card.status === 'open').length, 2);
  assert.deepEqual(game.pick(4), []);
  assert.deepEqual(game.advance(0.01), [{ type: 'conceal', ids: [0, 2] }]);
  assert.deepEqual(game.getState().selected, []);
  assert.ok(game.getState().cards.every(card => card.status === 'hidden'));
  assert.deepEqual(game.pick(0), []);
  game.advance(0.29);
  assert.deepEqual(game.pick(0), []);
  game.advance(0.01);
  assert.equal(game.getState().phase, 'ready');
  assert.equal(game.pick(0)[0].type, 'reveal');
});

test('matches are counted once, retain their slots and complete only after travel', () => {
  const game = fixed(), roster = ['triceratops', 'stegosaurus', 'brontosaurus'];
  for (const [nestIndex, species] of roster.entries()) {
    const ids = pairIds(game, species);
    assert.deepEqual(revealTwo(game, ...ids), [{ type: 'match', ids, species, nestIndex }]);
    assert.equal(game.getState().phase, 'matching');
    assert.equal(game.getState().matchedPairs, nestIndex + 1);
    for (const id of ids) assert.deepEqual(game.pick(id), []);
    assert.deepEqual(game.advance(0.99), []);
    const events = game.advance(0.01);
    assert.deepEqual(events, nestIndex === 2 ? [{ type: 'won', ids: [0, 1, 2, 3, 4, 5, 6, 7] }] : []);
    assert.equal(game.getState().phase, nestIndex === 2 ? 'won' : 'ready');
    invariant(game);
  }
  assert.deepEqual(game.advance(100), []);
  assert.deepEqual(game.pick(0), []);
  assert.equal(game.getState().matchedPairs, 3);
});

test('pause freezes input and every timed stage; invalid time cannot corrupt the game', () => {
  const game = fixed();
  game.pick(0); game.advance(0.2); game.pause(true);
  const frozen = game.getState();
  assert.deepEqual(game.advance(100), []);
  assert.deepEqual(game.pick(1), []);
  assert.deepEqual(game.getState(), frozen);
  game.pause(false); game.advance(0.24);
  assert.equal(game.getState().phase, 'revealing');
  game.advance(0.01); game.pick(2); game.advance(0.45);
  game.advance(0.7); game.pause(true); game.advance(100); game.pause(false);
  assert.deepEqual(game.advance(0.79), []);
  assert.equal(game.advance(0.01)[0].type, 'conceal');
  game.pause(true); game.advance(100); game.pause(false); game.advance(0.3);
  revealTwo(game, 0, 1); game.advance(0.5);
  game.pause(true); game.advance(100); game.pause(false); game.advance(0.49);
  assert.equal(game.getState().phase, 'matching');
  game.advance(0.01);
  assert.equal(game.getState().phase, 'ready');
  const before = game.getState();
  for (const dt of [-1, 0, NaN, Infinity, '1']) assert.deepEqual(game.advance(dt), []);
  assert.deepEqual(game.getState(), before);
});

test('restart during reveal, mismatch and matching discards all previous pending work', () => {
  const game = fixed();
  const stages = [
    () => game.pick(0),
    () => revealTwo(game, 0, 2),
    () => revealTwo(game, 0, 1),
  ];
  for (const enter of stages) {
    enter(); game.pause(true); game.restart();
    assert.equal(game.getState().phase, 'ready');
    assert.equal(game.getState().paused, false);
    assert.equal(game.getState().matchedPairs, 0);
    assert.deepEqual(game.advance(100), []);
    invariant(game);
  }
});

test('large and partitioned time steps emit the same ordered events and final state', () => {
  for (const second of [1, 2]) {
    const large = fixed(), small = fixed();
    for (const game of [large, small]) { game.pick(0); game.advance(0.45); game.pick(second); }
    const expected = large.advance(3), actual = [];
    for (let i = 0; i < 300; i++) actual.push(...small.advance(0.01));
    assert.deepEqual(actual, expected);
    assert.deepEqual(small.getState(), large.getState());
    invariant(large);
  }
});

test('repeated arbitrary input preserves pair and selection invariants', () => {
  let seed = 12345;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  const game = createMemoryGame({ random });
  for (let i = 0; i < 2000; i++) {
    game.pick(Math.floor(random() * 10) - 1);
    game.advance(random() * 0.8);
    if (i % 113 === 0) game.pause(!game.getState().paused);
    if (i % 397 === 0) game.restart();
    invariant(game);
  }
});

test('custom roster supports a single pair and rejects invalid setup', () => {
  const game = createMemoryGame({ species: ['triceratops'], surprises: [], random: () => 0 });
  revealTwo(game, 0, 1);
  assert.equal(game.advance(1)[0].type, 'won');
  for (const species of [[], ['a', 'a'], [''], [1], 'a']) {
    assert.throws(() => createMemoryGame({ species }), TypeError);
  }
  assert.throws(() => createMemoryGame({ random: 4 }), TypeError);
  for (const sample of [-0.1, 1, NaN, Infinity]) {
    assert.throws(() => createMemoryGame({ random: () => sample }), RangeError);
  }
});
