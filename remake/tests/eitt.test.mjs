import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../engine/random.js';
import { COLOURS, makeDeck, newGame, canPlay, playable, play, draw, pass, callEitt, catchEitt } from '../engine/eitt/rules.js';

const cards = makeDeck();
const card = id => cards.find(c => c.id === id);

/** A round in a chosen state: cards by id (`top` is the table's top card), the rest of the deck as the deck. */
function table({ top, colour, child = [], kambedla = [], pile, deck, turn = 'child' }) {
  const used = new Set([top, ...child, ...kambedla]);
  return {
    deck: deck ? deck.map(card) : cards.filter(c => !used.has(c.id)),
    pile: (pile ?? [top]).map(card),
    hands: { child: child.map(card), kambedla: kambedla.map(card) },
    colour: colour ?? card(top).colour,
    turn,
    drew: false,
    unsaid: null,
    winner: null,
  };
}

test('the deck has 108 cards', () => {
  assert.equal(cards.length, 108);
  assert.equal(new Set(cards.map(c => c.id)).size, 108, 'every card has its own id');
  const count = (colour, kind, value = null) => cards.filter(c => c.colour === colour && c.kind === kind && c.value === value).length;
  for (const colour of COLOURS) {
    assert.equal(count(colour, 'number', 0), 1);
    for (let n = 1; n <= 9; n++) assert.equal(count(colour, 'number', n), 2);
    for (const kind of ['skip', 'reverse', 'draw2']) assert.equal(count(colour, kind), 2);
  }
  assert.equal(count(null, 'wild'), 4);
  assert.equal(count(null, 'wild4'), 4);
});

test('a new game deals 7 each and starts on a number card', () => {
  for (let seed = 0; seed < 100; seed++) {
    const game = newGame(seededRandom(`deal-${seed}`));
    assert.equal(game.hands.child.length, 7);
    assert.equal(game.hands.kambedla.length, 7);
    assert.equal(game.deck.length + game.pile.length + 14, 108);
    assert.equal(game.pile.length, 1);
    assert.equal(game.pile[0].kind, 'number');
    assert.equal(game.colour, game.pile[0].colour);
    assert.deepEqual([game.turn, game.drew, game.unsaid, game.winner], ['child', false, null, null]);
  }
});

test('a card plays on its colour, number or symbol, and wilds on anything', () => {
  const red5 = table({ top: 'red-5-a' });
  assert.ok(canPlay(card('red-9-a'), red5), 'the same colour');
  assert.ok(canPlay(card('blue-5-a'), red5), 'the same number');
  assert.ok(!canPlay(card('blue-9-a'), red5), 'nothing in common');
  assert.ok(!canPlay(card('blue-skip-a'), red5), 'a symbol is not a number');
  assert.ok(canPlay(card('wild-a'), red5) && canPlay(card('wild4-a'), red5), 'a wild goes on anything');

  const skip = table({ top: 'red-skip-a' });
  assert.ok(canPlay(card('blue-skip-a'), skip), 'the same symbol');
  assert.ok(!canPlay(card('blue-reverse-a'), skip) && !canPlay(card('blue-5-a'), skip));

  const green = table({ top: 'wild-a', colour: 'green' }); // after a wild, the colour chosen is the one to match
  assert.ok(canPlay(card('green-2-a'), green));
  assert.ok(!canPlay(card('red-2-a'), green));

  const mixed = table({ top: 'red-5-a', child: ['red-1-a', 'blue-5-a', 'green-9-a', 'wild-b'] });
  assert.deepEqual(playable(mixed, 'child').map(c => c.id), ['red-1-a', 'blue-5-a', 'wild-b']);
});

test('skip and reverse give the player another turn; draw2 and wild4 make the other draw and miss the turn', () => {
  const start = table({
    top: 'red-7-a',
    child: ['red-skip-a', 'red-reverse-a', 'red-draw2-a', 'wild4-a', 'wild-a', 'red-3-a', 'blue-1-a'],
    kambedla: ['blue-9-a', 'green-9-a'],
  });
  for (const id of ['red-skip-a', 'red-reverse-a']) {
    const after = play(start, 'child', id);
    assert.deepEqual([after.turn, after.hands.kambedla.length, after.drew], ['child', 2, false], id);
  }
  const plus2 = play(start, 'child', 'red-draw2-a');
  assert.deepEqual([plus2.turn, plus2.hands.kambedla.length, plus2.colour], ['child', 4, 'red']);
  const plus4 = play(start, 'child', 'wild4-a', 'green');
  assert.deepEqual([plus4.turn, plus4.hands.kambedla.length, plus4.colour], ['child', 6, 'green']);

  const wild = play(start, 'child', 'wild-a', 'blue'); // a plain wild only changes the colour
  assert.deepEqual([wild.turn, wild.hands.kambedla.length, wild.colour], ['kambedla', 2, 'blue']);
  assert.equal(play(start, 'child', 'red-3-a').turn, 'kambedla');
  assert.throws(() => play(start, 'child', 'wild-a'), /needs a colour/);
  assert.equal(start.hands.child.length, 7, 'the game that was played from is not changed');
});

test('a move out of turn is refused', () => {
  const theirs = table({ top: 'red-7-a', turn: 'kambedla', child: ['red-3-a', 'blue-1-a'], kambedla: ['red-9-a', 'blue-9-a'] });
  assert.throws(() => play(theirs, 'child', 'red-3-a'), /turn/);
  assert.throws(() => draw(theirs, 'child'), /turn/);
  assert.throws(() => pass(theirs, 'child'), /turn/);

  const mine = { ...theirs, turn: 'child' };
  assert.throws(() => play(mine, 'child', 'blue-1-a'), /does not go on/);
  assert.throws(() => play(mine, 'child', 'red-9-a'), /does not hold/);
  assert.throws(() => draw(mine, 'child'), /has a card to play/);
  assert.throws(() => pass(mine, 'child'), /only after drawing/);

  const after = play(mine, 'child', 'red-3-a'); // a second tap on the same card comes too late
  assert.throws(() => play(after, 'child', 'red-3-a'), /turn/);
});

test('playing to one card without Eitt can be caught for two cards', () => {
  const start = table({ top: 'red-7-a', child: ['red-3-a', 'blue-1-a'], kambedla: ['red-9-a', 'green-9-a', 'blue-9-a'] });
  const played = play(start, 'child', 'red-3-a');
  assert.equal(played.unsaid, 'child');

  const caught = catchEitt(played, 'kambedla'); // forgotten, and noticed
  assert.deepEqual([caught.hands.child.length, caught.unsaid, caught.turn], [3, null, 'kambedla']);
  assert.throws(() => catchEitt(caught, 'kambedla'), /not forgotten/);

  const called = callEitt(played, 'child'); // called in time: nothing to catch
  assert.equal(called.unsaid, null);
  assert.throws(() => catchEitt(called, 'kambedla'), /not forgotten/);
  assert.throws(() => callEitt(called, 'child'), /no "Eitt!"/);

  const late = play(played, 'kambedla', 'red-9-a'); // the other player moved: too late
  assert.equal(late.unsaid, null);
  assert.throws(() => catchEitt(late, 'kambedla'), /not forgotten/);

  const hers = table({ top: 'red-7-a', turn: 'kambedla', child: ['red-1-a', 'blue-1-a', 'green-1-a'], kambedla: ['red-9-a', 'blue-9-a'] });
  const forgot = play(hers, 'kambedla', 'red-9-a'); // and she can forget too
  assert.equal(forgot.unsaid, 'kambedla');
  assert.equal(catchEitt(forgot, 'child').hands.kambedla.length, 3);
});

test('drawing from an empty deck reshuffles the table', () => {
  const empty = table({
    top: 'red-7-a',
    pile: ['green-1-a', 'green-2-a', 'blue-3-a', 'red-7-a'],
    deck: [],
    child: ['blue-1-a'],
    kambedla: ['red-9-a'],
  });
  const { game, card: drawn } = draw(empty, 'child');
  assert.ok(['green-1-a', 'green-2-a', 'blue-3-a'].includes(drawn.id), 'the card comes from the old table');
  assert.deepEqual(game.pile.map(c => c.id), ['red-7-a'], 'only the top card stays on the table');
  assert.equal(game.deck.length, 2);
  assert.equal(game.hands.child.length, 2);
  assert.equal(game.turn, 'kambedla', 'it could not be played, so the turn went on');

  const bare = draw({ ...empty, pile: [card('red-7-a')] }, 'child'); // nothing left anywhere
  assert.equal(bare.card, null);
  assert.equal(bare.game.turn, 'kambedla');

  const plus2 = table({ top: 'red-7-a', deck: ['blue-1-a'], pile: ['green-1-a', 'green-2-a', 'red-7-a'], child: ['red-draw2-a', 'blue-4-a'], kambedla: ['green-9-a'] });
  assert.equal(play(plus2, 'child', 'red-draw2-a').hands.kambedla.length, 3, 'a +2 also draws from the reshuffled table');
});

test('the last card wins, even a wild', () => {
  const wild = table({ top: 'red-7-a', child: ['wild4-a'], kambedla: ['red-9-a', 'blue-9-a'] });
  const won = play(wild, 'child', 'wild4-a'); // no colour asked for
  assert.deepEqual([won.winner, won.hands.child.length, won.hands.kambedla.length], ['child', 0, 2]);
  assert.throws(() => draw(won, 'kambedla'), /over/);
  assert.throws(() => play(won, 'kambedla', 'red-9-a'), /over/);

  const number = table({ top: 'red-7-a', turn: 'kambedla', child: ['blue-1-a', 'blue-2-a'], kambedla: ['red-3-a'] });
  assert.equal(play(number, 'kambedla', 'red-3-a').winner, 'kambedla');
});
