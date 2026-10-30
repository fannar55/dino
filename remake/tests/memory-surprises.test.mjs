import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryGame, MEMORY_TIMING } from '../engine/memory/rules.js';

// random() = .999 never swaps, so the deck keeps its build order: the three friend pairs, then the three gift pairs
// (shrew, hermitCrab, crab) as ids 6 and 7, 8 and 9, 10 and 11.
const fixed = options => createMemoryGame({ random: () => 0.999, ...options });
const FRIENDS = ['triceratops', 'stegosaurus', 'brontosaurus'], GIFTS = ['shrew', 'hermitCrab', 'crab'];
const giftIds = (game, item) => game.getState().cards.filter(card => card.item === item).map(card => card.id);
const pairIds = (game, species) => game.getState().cards.filter(card => card.species === species).map(card => card.id);
// Two leaves, one reveal after the other, then whatever the second reveal settles into (a gift or a match, or a mismatch's hold).
function open(game, first, second) {
  game.pick(first); game.advance(MEMORY_TIMING.reveal);
  game.pick(second);
  return game.advance(MEMORY_TIMING.reveal);
}
const findGift = (game, item) => { const ids = giftIds(game, item); const events = open(game, ...ids); game.advance(MEMORY_TIMING.travel); return events; };
const findFriends = (game, names = FRIENDS) => names.forEach(name => { open(game, ...pairIds(game, name)); game.advance(MEMORY_TIMING.travel); });

test('deck has 12 cards: 3 friend pairs and 3 gift pairs', () => {
  const state = fixed().getState();
  assert.equal(state.cards.length, 12);
  const friends = state.cards.filter(card => card.species !== null);
  assert.equal(friends.length, 6);
  for (const name of FRIENDS) assert.equal(friends.filter(card => card.species === name).length, 2);
  assert.ok(friends.every(card => !('item' in card)), 'a friend card is { id, species, status }');
  const gifts = state.cards.filter(card => card.species === null);
  assert.equal(gifts.length, 6);
  for (const item of GIFTS) assert.equal(gifts.filter(card => card.item === item).length, 2);
  assert.ok(gifts.every(card => card.status === 'hidden'));
  assert.deepEqual(Object.keys(gifts[0]).sort(), ['id', 'item', 'species', 'status']);
  assert.deepEqual([...state.found], []);
  assert.throws(() => { state.found.push('shrew'); }, TypeError);
});

test('a gift leaf reveals like a friend leaf: reveal with the item and no species', () => {
  const game = fixed(), [first] = giftIds(game, 'crab');
  assert.deepEqual(game.pick(first), [{ type: 'reveal', ids: [first], species: null, item: 'crab' }]);
  assert.equal(game.getState().phase, 'revealing');
  assert.equal(game.getState().cards[first].status, 'open');
  game.advance(MEMORY_TIMING.reveal);
  assert.equal(game.getState().phase, 'one-open');
  const [friend] = pairIds(game, 'triceratops');
  assert.deepEqual(game.pick(friend), [{ type: 'reveal', ids: [friend], species: 'triceratops', item: null }]);
});

test('a gift pair is found, joins found, and does not count as a friend pair', () => {
  const game = fixed(), ids = giftIds(game, 'hermitCrab');
  assert.deepEqual(open(game, ...ids), [{ type: 'gift', ids, item: 'hermitCrab', giftIndex: 0 }]);
  let state = game.getState();
  assert.equal(state.phase, 'matching');
  assert.equal(state.matchedPairs, 0);
  assert.deepEqual([...state.found], ['hermitCrab']);
  assert.ok(ids.every(id => state.cards[id].status === 'found'));
  // It waits as a match does: nothing can be picked until the travel is over.
  assert.deepEqual(game.pick(pairIds(game, 'triceratops')[0]), []);
  assert.deepEqual(game.advance(MEMORY_TIMING.travel - .01), []);
  assert.deepEqual(game.advance(.01), []);
  state = game.getState();
  assert.equal(state.phase, 'ready');
  assert.deepEqual([...state.selected], []);
  // The next gift pair is the second: its index follows, and found keeps the order.
  assert.deepEqual(open(game, ...giftIds(game, 'shrew')), [{ type: 'gift', ids: giftIds(game, 'shrew'), item: 'shrew', giftIndex: 1 }]);
  game.advance(MEMORY_TIMING.travel);
  assert.deepEqual([...game.getState().found], ['hermitCrab', 'shrew']);
  assert.equal(game.getState().matchedPairs, 0);
});

test('a gift and a friend mismatch and both close', () => {
  const game = fixed(), [gift] = giftIds(game, 'shrew'), [friend] = pairIds(game, 'stegosaurus');
  assert.deepEqual(open(game, gift, friend), []);
  assert.equal(game.getState().phase, 'mismatch');
  assert.ok([gift, friend].every(id => game.getState().cards[id].status === 'open'));
  assert.deepEqual(game.advance(MEMORY_TIMING.mismatch), [{ type: 'conceal', ids: [gift, friend] }]);
  game.advance(MEMORY_TIMING.close);
  const state = game.getState();
  assert.equal(state.phase, 'ready');
  assert.ok([gift, friend].every(id => state.cards[id].status === 'hidden'));
  assert.deepEqual([...state.found], []);
  assert.equal(state.matchedPairs, 0);
});

test('two different gifts mismatch', () => {
  const game = fixed(), [shrew] = giftIds(game, 'shrew'), [crab] = giftIds(game, 'crab');
  assert.deepEqual(open(game, shrew, crab), []);
  assert.equal(game.getState().phase, 'mismatch');
  assert.deepEqual(game.advance(MEMORY_TIMING.mismatch), [{ type: 'conceal', ids: [shrew, crab] }]);
  game.advance(MEMORY_TIMING.close);
  assert.equal(game.getState().phase, 'ready');
  assert.deepEqual([...game.getState().found], []);
  // They are still hidden and still pair with their own.
  assert.equal(open(game, ...giftIds(game, 'shrew'))[0].type, 'gift');
});

test('found gifts cannot be picked again', () => {
  const game = fixed(), ids = giftIds(game, 'crab');
  findGift(game, 'crab');
  for (const id of ids) assert.deepEqual(game.pick(id), []);
  assert.equal(game.getState().found.length, 1);
  assert.equal(game.getState().phase, 'ready');
  // Another leaf can be picked at once.
  assert.equal(game.pick(pairIds(game, 'brontosaurus')[0])[0].type, 'reveal');
});

test('a gift cannot be picked while a leaf is still opening', () => {
  const game = fixed(), [gift] = giftIds(game, 'shrew');
  game.pick(pairIds(game, 'brontosaurus')[0]);
  assert.deepEqual(game.pick(gift), []);
  assert.equal(game.getState().cards[gift].status, 'hidden');
});

test('won waits for the last gift pair', () => {
  const game = fixed();
  findFriends(game);
  assert.equal(game.getState().matchedPairs, 3);
  assert.equal(game.getState().phase, 'ready', 'three friend pairs are not the whole round any more');
  findGift(game, 'shrew'); findGift(game, 'hermitCrab');
  assert.equal(game.getState().phase, 'ready');
  const ids = giftIds(game, 'crab');
  assert.equal(open(game, ...ids)[0].type, 'gift');
  const events = game.advance(MEMORY_TIMING.travel);
  assert.deepEqual(events, [{ type: 'won', ids: game.getState().cards.map(card => card.id) }]);
  assert.equal(game.getState().phase, 'won');
  assert.deepEqual([...game.getState().found], ['shrew', 'hermitCrab', 'crab']);
});

test('won also waits for the last friend pair when every gift is found first', () => {
  const game = fixed();
  for (const item of GIFTS) findGift(game, item);
  findFriends(game, ['triceratops', 'stegosaurus']);
  assert.equal(game.getState().phase, 'ready');
  open(game, ...pairIds(game, 'brontosaurus'));
  assert.equal(game.advance(MEMORY_TIMING.travel)[0].type, 'won');
  assert.equal(game.getState().phase, 'won');
});

test('restart puts every gift back under a leaf and forgets what was found', () => {
  const game = fixed();
  findGift(game, 'shrew');
  game.restart();
  assert.deepEqual([...game.getState().found], []);
  assert.equal(game.getState().cards.filter(card => card.item && card.status === 'hidden').length, 6);
});

test('the gifts are a choice: none, one, or any distinct names', () => {
  assert.equal(fixed({ gifts: [] }).getState().cards.length, 6);
  assert.equal(fixed({ gifts: ['shrew'] }).getState().cards.length, 8);
  const frog = fixed({ gifts: ['frog'] });
  assert.equal(frog.getState().cards.find(card => card.item).item, 'frog');
  for (const gifts of [['a', 'a'], [''], [1], 'shrew', null]) assert.throws(() => createMemoryGame({ gifts }), TypeError);
  // With no gift the round is the friends alone, as before.
  const plain = fixed({ gifts: [] });
  findFriends(plain);
  assert.equal(plain.getState().phase, 'won');
});
