import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../engine/random.js';
import { COLOURS, isWild, makeDeck, newGame, next, canPlay, playable, play, draw, pass, callEitt, catchEitt } from '../engine/eitt/rules.js';
import { chooseMove, willCallEitt, willCatch } from '../engine/eitt/kambedla.js';
import { SKILL_START, afterRound, inRound } from '../engine/eitt/skill.js';
import { advise, REASONS } from '../engine/eitt/advice.js';
import { createSave } from '../engine/save.js';

const cards = makeDeck();
const card = id => cards.find(c => c.id === id);

/**
 * A round in a chosen state: cards by id (`top` is the table's top card, `hands` one list per seat), the rest of the deck as
 * the deck. Two seats unless said otherwise: 0 is the child's, 1 Kambeðla's.
 */
function table({ top, colour, hands = [[], []], pile, deck, turn = 0, direction = 1 }) {
  const used = new Set([top, ...hands.flat()]);
  return {
    deck: deck ? deck.map(card) : cards.filter(c => !used.has(c.id)),
    pile: (pile ?? [top]).map(card),
    hands: hands.map(hand => hand.map(card)),
    colour: colour ?? card(top).colour,
    turn,
    direction,
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
    const game = newGame({ random: seededRandom(`deal-${seed}`) });
    assert.equal(game.hands.length, 2, 'two players unless asked for more');
    assert.equal(game.hands[0].length, 7);
    assert.equal(game.hands[1].length, 7);
    assert.equal(game.deck.length + game.pile.length + 14, 108);
    assert.equal(game.pile.length, 1);
    assert.equal(game.pile[0].kind, 'number');
    assert.equal(game.colour, game.pile[0].colour);
    assert.deepEqual([game.turn, game.direction, game.drew, game.unsaid, game.winner], [0, 1, false, null, null]);
  }
});

test('a new game of three or four deals 7 each and seat 0 starts', () => {
  for (const players of [3, 4]) {
    const game = newGame({ players, random: seededRandom(`deal-${players}`) });
    assert.equal(game.hands.length, players);
    assert.ok(game.hands.every(hand => hand.length === 7));
    assert.deepEqual([game.turn, game.direction, game.deck.length + game.pile.length + 7 * players], [0, 1, 108]);
  }
  assert.throws(() => newGame({ players: 5 }), RangeError);
  assert.throws(() => newGame({ players: 1 }), RangeError);
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

  const mixed = table({ top: 'red-5-a', hands: [['red-1-a', 'blue-5-a', 'green-9-a', 'wild-b'], []] });
  assert.deepEqual(playable(mixed, 0).map(c => c.id), ['red-1-a', 'blue-5-a', 'wild-b']);
});

test('skip and reverse give the player another turn; draw2 and wild4 make the other draw and miss the turn', () => {
  const start = table({
    top: 'red-7-a',
    hands: [['red-skip-a', 'red-reverse-a', 'red-draw2-a', 'wild4-a', 'wild-a', 'red-3-a', 'blue-1-a'], ['blue-9-a', 'green-9-a']],
  });
  for (const id of ['red-skip-a', 'red-reverse-a']) {
    const after = play(start, 0, id);
    assert.deepEqual([after.turn, after.hands[1].length, after.drew], [0, 2, false], id);
  }
  const plus2 = play(start, 0, 'red-draw2-a');
  assert.deepEqual([plus2.turn, plus2.hands[1].length, plus2.colour], [0, 4, 'red']);
  const plus4 = play(start, 0, 'wild4-a', 'green');
  assert.deepEqual([plus4.turn, plus4.hands[1].length, plus4.colour], [0, 6, 'green']);

  const wild = play(start, 0, 'wild-a', 'blue'); // a plain wild only changes the colour
  assert.deepEqual([wild.turn, wild.hands[1].length, wild.colour], [1, 2, 'blue']);
  assert.equal(play(start, 0, 'red-3-a').turn, 1);
  assert.throws(() => play(start, 0, 'wild-a'), /needs a colour/);
  assert.equal(start.hands[0].length, 7, 'the game that was played from is not changed');
});

test('with three, a reverse turns the table and a skip jumps one', () => {
  const game = table({ top: 'red-5-a', hands: [['red-reverse-a', 'red-skip-a', 'blue-3-a'], ['green-1-a'], ['yellow-2-a']] });
  const reversed = play(game, 0, 'red-reverse-a');
  assert.deepEqual([reversed.direction, reversed.turn], [-1, 2]);
  const skipped = play(game, 0, 'red-skip-a');
  assert.deepEqual([skipped.direction, skipped.turn], [1, 2]);
  assert.equal(next(reversed), 1, 'and from seat 2 the table goes on to 1');
});

test('with two, a reverse still gives the mover another turn', () => {
  const game = table({ top: 'red-5-a', hands: [['red-reverse-a', 'blue-3-a'], ['green-1-a']] });
  assert.equal(play(game, 0, 'red-reverse-a').turn, 0);
});

test('+2 and +4 land on the next player, who misses the turn', () => {
  const game = table({ top: 'red-5-a', hands: [['red-draw2-a', 'wild4-a', 'blue-3-a'], ['green-1-a'], ['yellow-2-a']] });
  const two = play(game, 0, 'red-draw2-a');
  assert.deepEqual([two.hands[1].length, two.hands[2].length, two.turn], [3, 1, 2]);
  const four = play(game, 0, 'wild4-a', 'blue');
  assert.deepEqual([four.hands[1].length, four.turn, four.colour], [5, 2, 'blue']);
});

test('a move out of turn is refused', () => {
  const theirs = table({ top: 'red-7-a', turn: 1, hands: [['red-3-a', 'blue-1-a'], ['red-9-a', 'blue-9-a']] });
  assert.throws(() => play(theirs, 0, 'red-3-a'), /turn/);
  assert.throws(() => draw(theirs, 0), /turn/);
  assert.throws(() => pass(theirs, 0), /turn/);

  const mine = { ...theirs, turn: 0 };
  assert.throws(() => play(mine, 0, 'blue-1-a'), /does not go on/);
  assert.throws(() => play(mine, 0, 'red-9-a'), /does not hold/);
  assert.throws(() => draw(mine, 0), /has a card to play/);
  assert.throws(() => pass(mine, 0), /only after drawing/);

  const after = play(mine, 0, 'red-3-a'); // a second tap on the same card comes too late
  assert.throws(() => play(after, 0, 'red-3-a'), /turn/);
});

test('playing to one card without Eitt can be caught for two cards', () => {
  const start = table({ top: 'red-7-a', hands: [['red-3-a', 'blue-1-a'], ['red-9-a', 'green-9-a', 'blue-9-a']] });
  const played = play(start, 0, 'red-3-a');
  assert.equal(played.unsaid, 0);

  const caught = catchEitt(played, 1); // forgotten, and noticed
  assert.deepEqual([caught.hands[0].length, caught.unsaid, caught.turn], [3, null, 1]);
  assert.throws(() => catchEitt(caught, 1), /not forgotten/);

  const called = callEitt(played, 0); // called in time: nothing to catch
  assert.equal(called.unsaid, null);
  assert.throws(() => catchEitt(called, 1), /not forgotten/);
  assert.throws(() => callEitt(called, 0), /no "Eitt!"/);

  const late = play(played, 1, 'red-9-a'); // the other player moved: too late
  assert.equal(late.unsaid, null);
  assert.throws(() => catchEitt(late, 1), /not forgotten/);

  const hers = table({ top: 'red-7-a', turn: 1, hands: [['red-1-a', 'blue-1-a', 'green-1-a'], ['red-9-a', 'blue-9-a']] });
  const forgot = play(hers, 1, 'red-9-a'); // and she can forget too
  assert.equal(forgot.unsaid, 1);
  assert.equal(catchEitt(forgot, 0).hands[1].length, 3);
});

test('anyone may catch a forgotten Eitt! until the next player moves', () => {
  const game = table({ top: 'red-5-a', hands: [['red-7-a', 'blue-3-a'], ['green-1-a', 'green-2-a'], ['yellow-2-a', 'yellow-3-a'], ['blue-9-a', 'blue-8-a']] });
  const down = play(game, 0, 'red-7-a');
  assert.equal(down.unsaid, 0);
  assert.throws(() => catchEitt(down, 0), /has not forgotten|cannot catch/);
  const caught = catchEitt(down, 2);
  assert.deepEqual([caught.hands[0].length, caught.unsaid], [3, null]);
  const moved = draw(down, 1).game;
  assert.throws(() => catchEitt(moved, 3));
  assert.equal(callEitt(down, 0).unsaid, null);
});

test('drawing from an empty deck reshuffles the table', () => {
  const empty = table({
    top: 'red-7-a',
    pile: ['green-1-a', 'green-2-a', 'blue-3-a', 'red-7-a'],
    deck: [],
    hands: [['blue-1-a'], ['red-9-a']],
  });
  const { game, card: drawn } = draw(empty, 0);
  assert.ok(['green-1-a', 'green-2-a', 'blue-3-a'].includes(drawn.id), 'the card comes from the old table');
  assert.deepEqual(game.pile.map(c => c.id), ['red-7-a'], 'only the top card stays on the table');
  assert.equal(game.deck.length, 2);
  assert.equal(game.hands[0].length, 2);
  assert.equal(game.turn, 1, 'it could not be played, so the turn went on');

  const bare = draw({ ...empty, pile: [card('red-7-a')] }, 0); // nothing left anywhere
  assert.equal(bare.card, null);
  assert.equal(bare.game.turn, 1);

  const plus2 = table({ top: 'red-7-a', deck: ['blue-1-a'], pile: ['green-1-a', 'green-2-a', 'red-7-a'], hands: [['red-draw2-a', 'blue-4-a'], ['green-9-a']] });
  assert.equal(play(plus2, 0, 'red-draw2-a').hands[1].length, 3, 'a +2 also draws from the reshuffled table');
});

test('the last card wins, even a wild', () => {
  const wild = table({ top: 'red-7-a', hands: [['wild4-a'], ['red-9-a', 'blue-9-a']] });
  const won = play(wild, 0, 'wild4-a'); // no colour asked for
  assert.deepEqual([won.winner, won.hands[0].length, won.hands[1].length], [0, 0, 2]);
  assert.throws(() => draw(won, 1), /over/);
  assert.throws(() => play(won, 1, 'red-9-a'), /over/);

  const number = table({ top: 'red-7-a', turn: 1, hands: [['blue-1-a', 'blue-2-a'], ['red-3-a']] });
  assert.equal(play(number, 1, 'red-3-a').winner, 1);
});

const apply = (game, who, move) =>
  move.type === 'draw' ? draw(game, who).game : move.type === 'pass' ? pass(game, who) : play(game, who, move.cardId, move.colour);

/** Mosi's advice for seat 0, checked against the rules whatever the state; it is null when there is nothing to advise. */
function checkedAdvice(game) {
  const advice = advise(game, 0);
  const options = playable(game, 0);
  if (game.winner !== null || (game.turn === 1 && game.unsaid !== 0)) {
    assert.equal(advice, null);
  } else if (advice.type === 'eitt') {
    assert.equal(game.unsaid, 0);
  } else if (advice.type === 'draw') {
    assert.ok(game.turn === 0 && !game.drew && options.length === 0, 'advised a draw with a card to play');
  } else {
    const chosen = options.find(c => c.id === advice.cardId);
    assert.ok(game.turn === 0 && chosen, 'advised a card that cannot be played');
    const needsColour = isWild(chosen) && game.hands[0].length > 1;
    assert.equal(advice.colour !== undefined, needsColour);
    if (needsColour) assert.ok(COLOURS.includes(advice.colour));
  }
  return advice;
}

// The child plays like a five-year-old: Mosi's advice half the time, otherwise any card that goes.
function childMove(game, advice, random) {
  if (advice && advice.type !== 'eitt' && random() < 0.5) return advice;
  const options = playable(game, 0);
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
    let game = newGame({ random });
    for (let steps = 0; game.winner === null; steps++) {
      assert.ok(steps < 2000, `round ${seed} never ended`);
      const who = game.turn;
      const advice = checkedAdvice(game);

      if (game.unsaid !== null && game.unsaid !== who && (who === 1 ? willCatch(skill, random) : random() < 0.5)) {
        game = catchEitt(game, who);
        caught++;
      }

      let move;
      if (who === 1) {
        const options = playable(game, 1).map(c => c.id);
        move = chooseMove(game, 1, inRound(skill, game.hands[0].length, game.hands[1].length), random);
        if (move.type === 'draw') assert.deepEqual(options, [], 'she drew with a card to play');
        else assert.ok(options.includes(move.cardId), 'she chose a card that cannot be played');
      } else {
        move = childMove(game, advice, random);
      }
      const pileBefore = game.pile.length + (move.type === 'play' ? 1 : 0);
      game = apply(game, who, move);
      if (game.pile.length < pileBefore) reshuffled++;

      if (game.unsaid === who && (who === 1 ? willCallEitt(skill, random) : random() < 0.5)) game = callEitt(game, who);
      const all = [...game.deck, ...game.pile, ...game.hands.flat()];
      assert.equal(new Set(all.map(c => c.id)).size, 108, 'every card is somewhere exactly once');
      assert.equal(all.length, 108);
    }
    assert.equal(game.hands[game.winner].length, 0);
  }
  assert.ok(caught > 0 && reshuffled > 0, `the rounds should have seen catches (${caught}) and reshuffles (${reshuffled})`);
});

test('Kambeðla attacks the player about to move, not anyone else who is low', () => {
  const game = table({ top: 'red-5-a', hands: [['red-9-a'], ['red-draw2-a', 'red-1-a'], ['green-1-a', 'green-2-a', 'green-3-a']], turn: 1 });
  assert.equal(chooseMove(game, 1, 1, () => 0).cardId, 'red-1-a', 'seat 2 is next and is not low');
  const low = table({ top: 'red-5-a', hands: [['red-9-a', 'red-8-a', 'red-7-a'], ['red-draw2-a', 'red-1-a'], ['green-1-a', 'green-2-a']], turn: 1 });
  assert.equal(chooseMove(low, 1, 1, () => 0).cardId, 'red-draw2-a');
});

test('Mosi advises seat 0 against the player about to move', () => {
  const game = table({ top: 'red-5-a', hands: [['red-draw2-a', 'red-1-a'], ['green-1-a', 'green-2-a'], ['yellow-1-a', 'yellow-2-a', 'yellow-3-a']] });
  assert.equal(advise(game, 0).reason, 'attack');
});

test('where the player about to move is not Kambeðla, Mosi gives the same move with its plain reason, never an attack line', () => {
  const low = table({ top: 'red-5-a', hands: [['red-draw2-a', 'red-1-a'], ['green-1-a', 'green-2-a'], ['yellow-1-a', 'yellow-2-a', 'yellow-3-a']] });
  assert.deepEqual(advise(low, 0, { attackable: false }), { ...advise(low, 0), reason: 'colour' }, 'the +2, for its colour');
  const keep = table({ top: 'red-5-a', hands: [['red-draw2-a', 'red-1-a'], ['green-1-a', 'green-2-a', 'green-3-a', 'green-4-a'], ['yellow-1-a']] });
  assert.equal(advise(keep, 0).reason, 'keep-attack');
  assert.deepEqual(advise(keep, 0, { attackable: false }), { ...advise(keep, 0), reason: 'colour' });
  const wild = table({ top: 'red-5-a', hands: [['wild4-a', 'red-1-a'], ['green-1-a'], ['yellow-1-a', 'yellow-2-a', 'yellow-3-a']] });
  assert.equal(advise(wild, 0).reason, 'attack');
  assert.equal(advise(wild, 0, { attackable: false }).reason, 'change-colour', 'a +4 when something else fits is its colour change');
  for (let seed = 0; seed < 60; seed++) { // and in whole rounds of three and four, never
    const random = seededRandom(`not-hers-${seed}`);
    let game = newGame({ players: 3 + (seed % 2), random });
    for (let steps = 0; game.winner === null && steps < 2000; steps++) {
      const advice = advise(game, 0, { attackable: false });
      assert.ok(!['attack', 'keep-attack'].includes(advice?.reason), `round ${seed}: "${advice?.reason}"`);
      game = apply(game, game.turn, chooseMove(game, game.turn, random(), random));
      if (game.unsaid !== null) game = callEitt(game, game.unsaid);
    }
  }
});

test('Mosi says why: every piece of his advice is legal and carries one of his reasons, which fits the move', () => {
  assert.deepEqual([...REASONS].sort(), ['attack', 'change-colour', 'colour', 'draw', 'eitt', 'keep-attack', 'keep-wild', 'most-colour', 'number', 'only-wild', 'play-drawn', 'skip']);
  const given = new Set();
  for (let seed = 0; seed < 150; seed++) {
    const random = seededRandom(`mosi-${seed}`);
    const skill = random();
    let game = newGame({ random });
    for (let steps = 0; game.winner === null; steps++) {
      assert.ok(steps < 2000, `round ${seed} never ended`);
      const advice = checkedAdvice(game); // legal, as in the test above
      if (advice) {
        assert.ok(REASONS.includes(advice.reason), `"${advice.reason}" is not one of Mosi's reasons`);
        given.add(advice.reason);
        const card = game.hands[0].find(held => held.id === advice.cardId);
        const fits = { draw: advice.type === 'draw', eitt: advice.type === 'eitt', 'play-drawn': game.drew,
          colour: card?.colour === game.colour, number: card && !isWild(card) && card.colour !== game.colour,
          skip: card?.kind === 'skip' || card?.kind === 'reverse', 'only-wild': playable(game, 0).every(isWild),
          attack: game.hands[1].length <= 2 && (card?.kind === 'draw2' || card?.kind === 'wild4'),
          'keep-wild': game.hands[0].some(held => held !== card && isWild(held)),
          'keep-attack': game.hands[0].some(held => held !== card && held.kind === 'draw2'), 'change-colour': card?.colour !== game.colour };
        assert.ok(fits[advice.reason], `"${advice.reason}" does not fit ${JSON.stringify(advice)} on ${game.pile.at(-1).id} (${game.colour})`);
      }
      // The child does as Mosi says (and calls "Eitt!" when he says so); Kambeðla plays at some skill.
      if (game.unsaid === 0 && game.turn === 1) game = callEitt(game, 0);
      if (game.turn === 0) {
        game = advice.type === 'eitt' ? callEitt(game, 0) : apply(game, 0, advice);
        if (game.unsaid === 0 && random() < 0.6) game = callEitt(game, 0);
      } else {
        game = apply(game, 1, chooseMove(game, 1, skill, random));
        if (game.unsaid === 1) game = callEitt(game, 1);
      }
    }
  }
  for (const reason of REASONS.filter(r => r !== 'most-colour')) assert.ok(given.has(reason), `Mosi never said "${reason}"`);
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

test('the save keeps a game under way with its seats, and forgets it on null', () => {
  const save = createSave(null);
  assert.equal(save.getEitt().game, null);
  const game = newGame({ players: 3, random: seededRandom('kept') });
  save.setEitt({ game, seats: { max: 4, reserved: ['kambedla'], seats: [] } });
  assert.deepEqual(save.getEitt().game, game);
  assert.notEqual(save.getEitt().game, game, 'a copy');
  assert.deepEqual(save.getEitt().seats.reserved, ['kambedla']);
  save.setEitt({ wins: 1 });
  assert.deepEqual(save.getEitt().game, game, 'other changes leave it');
  save.setEitt({ game: null });
  assert.equal(save.getEitt().game, null);
});
