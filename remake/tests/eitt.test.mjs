import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../engine/random.js';
import { COLOURS, isWild, makeDeck, newGame, canPlay, playable, play, draw, pass, callEitt, catchEitt } from '../engine/eitt/rules.js';
import { chooseMove, willCallEitt, willCatch } from '../engine/eitt/kambedla.js';
import { SKILL_START, afterRound, inRound } from '../engine/eitt/skill.js';
import { advise } from '../engine/eitt/advice.js';

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

const apply = (game, who, move) =>
  move.type === 'draw' ? draw(game, who).game : move.type === 'pass' ? pass(game, who) : play(game, who, move.cardId, move.colour);

/** Mosi's advice, checked against the rules whatever the state; it is null when there is nothing to advise. */
function checkedAdvice(game) {
  const advice = advise(game);
  const options = playable(game, 'child');
  if (game.winner || (game.turn === 'kambedla' && game.unsaid !== 'child')) {
    assert.equal(advice, null);
  } else if (advice.type === 'eitt') {
    assert.equal(game.unsaid, 'child');
  } else if (advice.type === 'draw') {
    assert.ok(game.turn === 'child' && !game.drew && options.length === 0, 'advised a draw with a card to play');
  } else {
    const chosen = options.find(c => c.id === advice.cardId);
    assert.ok(game.turn === 'child' && chosen, 'advised a card that cannot be played');
    const needsColour = isWild(chosen) && game.hands.child.length > 1;
    assert.equal(advice.colour !== undefined, needsColour);
    if (needsColour) assert.ok(COLOURS.includes(advice.colour));
  }
  return advice;
}

// The child plays like a five-year-old: Mosi's advice half the time, otherwise any card that goes.
function childMove(game, advice, random) {
  if (advice && advice.type !== 'eitt' && random() < 0.5) return advice;
  const options = playable(game, 'child');
  if (game.drew && random() < 0.3) return { type: 'pass' };
  if (options.length === 0) return { type: 'draw' };
  return { type: 'play', cardId: options[Math.floor(random() * options.length)].id, colour: COLOURS[Math.floor(random() * 4)] };
}

test('Kambeðla and Mosi only ever choose legal moves', () => {
  let caught = 0;
  let reshuffled = 0;
  for (let seed = 0; seed < 200; seed++) {
    const random = seededRandom(`eitt-${seed}`);
    const skill = [0, 1][seed] ?? random(); // the two ends, then any skill
    let game = newGame(random);
    for (let steps = 0; !game.winner; steps++) {
      assert.ok(steps < 2000, `round ${seed} never ended`);
      const who = game.turn;
      const advice = checkedAdvice(game);

      if (game.unsaid === (who === 'child' ? 'kambedla' : 'child') && (who === 'kambedla' ? willCatch(skill, random) : random() < 0.5)) {
        game = catchEitt(game, who);
        caught++;
      }

      let move;
      if (who === 'kambedla') {
        const options = playable(game, 'kambedla').map(c => c.id);
        move = chooseMove(game, inRound(skill, game.hands.child.length, game.hands.kambedla.length), random);
        if (move.type === 'draw') assert.deepEqual(options, [], 'she drew with a card to play');
        else assert.ok(options.includes(move.cardId), 'she chose a card that cannot be played');
      } else {
        move = childMove(game, advice, random);
      }
      const pileBefore = game.pile.length + (move.type === 'play' ? 1 : 0);
      game = apply(game, who, move);
      if (game.pile.length < pileBefore) reshuffled++;

      if (game.unsaid === who && (who === 'kambedla' ? willCallEitt(skill, random) : random() < 0.5)) game = callEitt(game, who);
      const all = [...game.deck, ...game.pile, ...game.hands.child, ...game.hands.kambedla];
      assert.equal(new Set(all.map(c => c.id)).size, 108, 'every card is somewhere exactly once');
      assert.equal(all.length, 108);
    }
    assert.equal(game.hands[game.winner].length, 0);
  }
  assert.ok(caught > 0 && reshuffled > 0, `the rounds should have seen catches (${caught}) and reshuffles (${reshuffled})`);
});

test('skill rises after wins, falls after losses, and eases when the child is far behind', () => {
  let state = afterRound({ skill: SKILL_START, losses: 0 }, true);
  assert.deepEqual(state, { skill: 0.6, losses: 0 });
  state = afterRound(state, false); // one loss: down 0.1
  assert.deepEqual(state, { skill: 0.5, losses: 1 });
  state = afterRound(state, false); // a second in a row: down 0.1 more
  assert.deepEqual(state, { skill: 0.3, losses: 2 });
  state = afterRound(state, false); // a third: 0.1 more again
  assert.deepEqual(state, { skill: 0, losses: 3 });
  assert.deepEqual(afterRound(state, false), { skill: 0, losses: 4 }, 'held at 0');
  assert.deepEqual(afterRound({ skill: 1, losses: 0 }, true), { skill: 1, losses: 0 }, 'held at 1');
  assert.deepEqual(afterRound({ skill: 0.5, losses: 2 }, true), { skill: 0.6, losses: 0 }, 'a win ends the run of losses');

  assert.equal(inRound(0.5, 8, 4), 0.2, 'the child holds 4 more cards than she does');
  assert.equal(inRound(0.5, 7, 4), 0.5, 'only 3 more');
  assert.equal(inRound(0.2, 12, 3), 0, 'held at 0');

  const remembered = (ask, skill) => {
    const random = seededRandom('remember');
    return Array.from({ length: 1000 }, () => ask(skill, random)).filter(Boolean).length;
  };
  for (const ask of [willCallEitt, willCatch]) {
    assert.equal(remembered(ask, 1), 1000, 'she always remembers at skill 1');
    assert.ok(remembered(ask, 0) < remembered(ask, 0.5) && remembered(ask, 0.5) < 1000, 'and forgets more as her skill falls');
  }
});
