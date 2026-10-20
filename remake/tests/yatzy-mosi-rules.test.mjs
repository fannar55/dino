import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES, DICE_COUNT, MAX_ROLLS, SAVE_VERSION, UPPER_BONUS, UPPER_BONUS_THRESHOLD,
  createGame, roll, hold, score, scoreCategory, previews, totals, decideAI, validateGame, restoreGame,
} from '../engine/yatzy-mosi/rules.js';

const ids = CATEGORIES.map(category => category.id);
const clone = value => JSON.parse(JSON.stringify(value));
function deepFreeze(value) {
  Object.freeze(value);
  for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child);
  return value;
}
function hand(dice, rollCount = 1, options = {}) {
  const game = createGame(options); game.dice = [...dice]; game.rollCount = rollCount; return game;
}
function remaining(openIds, dice, rollCount = 1) {
  const game = hand(dice, rollCount);
  for (const player of game.players) for (const category of CATEGORIES) {
    if (!openIds.includes(category.id)) player.scores[category.id] = scoreCategory(category.id, [1, 2, 3, 4, 5]);
  }
  game.turnCount = (15 - openIds.length) * 2;
  validateGame(game); return game;
}
function applyDecision(game, decision = decideAI(game)) {
  if (decision.type === 'score') return score(game, decision.categoryId);
  if (game.rollCount > 0) for (let i = 0; i < DICE_COUNT; i++) game = hold(game, i, decision.held[i]);
  return roll(game);
}

test('fifteen frozen categories expose the agreed labels, descriptions and sections', () => {
  assert.deepEqual(ids, ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes', 'pair', 'twoPairs', 'threeKind', 'fourKind', 'smallStraight', 'largeStraight', 'fullHouse', 'chance', 'yatzy']);
  assert.deepEqual(CATEGORIES.map(category => category.label), ['Einar', 'Tvíar', 'Þristar', 'Fjarkar', 'Fimmur', 'Sexur', 'Eitt par', 'Tvö pör', 'Þrjár eins', 'Fjórar eins', 'Lítil röð', 'Stór röð', 'Fullt hús', 'Séns', 'YATZY']);
  assert.equal(CATEGORIES.filter(category => category.section === 'upper').length, 6);
  assert.equal(CATEGORIES.filter(category => category.section === 'lower').length, 9);
  assert.ok(Object.isFrozen(CATEGORIES));
  assert.ok(CATEGORIES.every(category => Object.isFrozen(category) && category.description.length > 15 && category.max > 0));
  assert.equal(DICE_COUNT, 5); assert.equal(MAX_ROLLS, 3); assert.equal(SAVE_VERSION, 1);
  assert.equal(UPPER_BONUS_THRESHOLD, 63); assert.equal(UPPER_BONUS, 50);
});

test('Scandinavian combinations count the matched dice and require distinct groups', () => {
  assert.equal(scoreCategory('threeKind', [4, 4, 4, 2, 6]), 12);
  assert.equal(scoreCategory('chance', [4, 4, 4, 2, 6]), 20);
  assert.equal(scoreCategory('pair', [2, 2, 5, 5, 1]), 10, 'Highest pair, not the first pair');
  assert.equal(scoreCategory('pair', [6, 6, 6, 6, 6]), 12);
  assert.equal(scoreCategory('twoPairs', [4, 4, 4, 4, 6]), 0, 'Four identical dice are not two distinct pairs');
  assert.equal(scoreCategory('twoPairs', [4, 4, 4, 6, 6]), 20);
  assert.equal(scoreCategory('threeKind', [6, 6, 6, 6, 6]), 18);
  assert.equal(scoreCategory('fourKind', [6, 6, 6, 6, 6]), 24);
  assert.equal(scoreCategory('fourKind', [6, 6, 6, 5, 5]), 0);
  assert.equal(scoreCategory('fullHouse', [6, 6, 6, 5, 5]), 28);
  assert.equal(scoreCategory('fullHouse', [6, 6, 6, 6, 6]), 0, 'No full-house joker rule');
  assert.equal(scoreCategory('fullHouse', [2, 2, 2, 2, 5]), 0);
  assert.equal(scoreCategory('smallStraight', [5, 2, 4, 1, 3]), 15);
  assert.equal(scoreCategory('smallStraight', [1, 2, 3, 4, 4]), 0);
  assert.equal(scoreCategory('smallStraight', [2, 3, 4, 5, 6]), 0);
  assert.equal(scoreCategory('largeStraight', [6, 2, 4, 5, 3]), 20);
  assert.equal(scoreCategory('largeStraight', [1, 2, 3, 4, 5]), 0);
  assert.equal(scoreCategory('yatzy', [1, 1, 1, 1, 1]), 50);
  assert.equal(scoreCategory('yatzy', [6, 6, 6, 6, 5]), 0);
});

test('every ordered five-dice hand agrees with an independent sorted-run oracle', () => {
  // This exhaustive scoring test is never part of a game/AI decision.
  const maxima = Object.fromEntries(ids.map(id => [id, 0]));
  for (let encoded = 0; encoded < 6 ** 5; encoded++) {
    let rest = encoded; const dice = [];
    for (let die = 0; die < 5; die++) {dice.push(1 + rest % 6); rest = Math.floor(rest / 6);}
    const sorted = [...dice].sort((a, b) => a - b), groups = [];
    for (const face of sorted) {
      if (groups.at(-1)?.face === face) groups.at(-1).length++;
      else groups.push({face, length:1});
    }
    const pairs = groups.filter(group => group.length >= 2), sum = dice.reduce((a, b) => a + b, 0);
    for (const category of CATEGORIES) {
      let expected;
      if (category.face) expected = dice.filter(face => face === category.face).reduce((a, b) => a + b, 0);
      else if (category.id === 'pair') expected = pairs.length ? pairs.at(-1).face * 2 : 0;
      else if (category.id === 'twoPairs') expected = pairs.length === 2 ? pairs.reduce((total, group) => total + group.face * 2, 0) : 0;
      else if (category.id === 'threeKind' || category.id === 'fourKind') {
        const needed = category.id === 'threeKind' ? 3 : 4, group = groups.find(group => group.length >= needed);
        expected = group ? group.face * needed : 0;
      } else if (category.id === 'smallStraight') expected = sorted.join('') === '12345' ? 15 : 0;
      else if (category.id === 'largeStraight') expected = sorted.join('') === '23456' ? 20 : 0;
      else if (category.id === 'fullHouse') expected = groups.length === 2 && groups.some(group => group.length === 3) && groups.some(group => group.length === 2) ? sum : 0;
      else if (category.id === 'chance') expected = sum;
      else expected = groups.length === 1 ? 50 : 0;
      const actual = scoreCategory(category.id, dice);
      assert.equal(actual, expected, `${category.id}: ${dice}`);
      maxima[category.id] = Math.max(maxima[category.id], actual);
    }
  }
  for (const category of CATEGORIES) assert.equal(maxima[category.id], category.max, category.id);
});

test('scoring rejects malformed dice, sparse arrays and unknown categories', () => {
  for (const dice of [null, [], [1, 2, 3, 4], [1, 2, 3, 4, 5, 6], [0, 2, 3, 4, 5], [7, 2, 3, 4, 5], [1.5, 2, 3, 4, 5], ['1', 2, 3, 4, 5], [NaN, 2, 3, 4, 5], Array(5)]) {
    assert.throws(() => scoreCategory('chance', dice), TypeError);
  }
  for (const id of ['unknown', '__proto__', 'toString', null, 1]) assert.throws(() => scoreCategory(id, [1, 2, 3, 4, 5]), TypeError);
});

test('totals award exactly 50 at 63 and never count previews or duplicate Yatzy bonuses', () => {
  const card = createGame().players[0].scores;
  Object.assign(card, {ones:2, twos:6, threes:9, fours:12, fives:15, sixes:18});
  assert.deepEqual(totals(card), {upper:62, bonus:0, lower:0, total:62});
  card.ones = 3;
  assert.deepEqual(totals(card), {upper:63, bonus:50, lower:0, total:113});
  card.yatzy = 50; card.threeKind = 18;
  assert.deepEqual(totals(card), {upper:63, bonus:50, lower:68, total:181});
  for (const category of CATEGORIES) card[category.id] = category.max;
  assert.deepEqual(totals(card), {upper:105, bonus:50, lower:219, total:374});
  assert.throws(() => totals({...card, fullHouse:30}), /Impossible/);
});

test('creation, first roll and held rerolls are deterministic and immutable', () => {
  for (const startingPlayer of [0, 1]) {
    const initial = deepFreeze(createGame({seed:0, startingPlayer}));
    assert.equal(validateGame(initial), true); assert.equal(initial.currentPlayer, startingPlayer);
    assert.deepEqual(previews(initial), {});
    const first = roll(initial); assert.deepEqual(first, roll(initial));
    assert.equal(first.rollCount, 1); assert.equal(first.turnCount, 0);
    assert.ok(first.dice.every(face => Number.isInteger(face) && face >= 1 && face <= 6));
    assert.deepEqual(initial.dice, [0, 0, 0, 0, 0]);
    let selected = hold(first, 0); selected = hold(selected, 3, true);
    assert.deepEqual(selected.held, [true, false, false, true, false]); assert.ok(first.held.every(value => !value));
    const second = roll(deepFreeze(selected)); assert.equal(second.rollCount, 2);
    assert.equal(second.dice[0], first.dice[0]); assert.equal(second.dice[3], first.dice[3]);
    assert.notEqual(second.rng, selected.rng); assert.equal(validateGame(second), true);
    const third = roll(second); assert.equal(third.rollCount, 3); assert.equal(validateGame(third), true);
    assert.throws(() => roll(third), /No rolls/); assert.throws(() => hold(third, 0), /attempts left/);
    assert.equal(validateGame(score(deepFreeze(third), 'chance')), true);
  }
  assert.notDeepEqual(roll(createGame({seed:1})).dice, roll(createGame({seed:2})).dice);
  for (const seed of [-1, 2 ** 32, NaN, Infinity, 1.5, '2']) assert.throws(() => createGame({seed}));
  for (const startingPlayer of [-1, 2, .5, '0']) assert.throws(() => createGame({startingPlayer}));
});

test('illegal actions cannot consume a turn, change holds or replace a filled row', () => {
  const initial = deepFreeze(createGame());
  assert.throws(() => hold(initial, 0), /Holding/); assert.throws(() => score(initial, 'chance'), /Roll before/);
  let selected = hand([4, 4, 4, 2, 6]);
  for (const index of [-1, 5, NaN, 1.5, '0']) assert.throws(() => hold(selected, index));
  for (const flag of [null, 1, 'true', []]) assert.throws(() => hold(selected, 0, flag));
  for (let i = 0; i < 5; i++) selected = hold(selected, i, true);
  const snapshot = clone(selected); assert.throws(() => roll(selected), /all dice are held/); assert.deepEqual(selected, snapshot);
  const after = score(deepFreeze(selected), 'threeKind');
  assert.equal(after.players[0].scores.threeKind, 12); assert.equal(after.currentPlayer, 1); assert.equal(after.turnCount, 1);
  assert.equal(after.rollCount, 0); assert.deepEqual(after.dice, [0, 0, 0, 0, 0]); assert.ok(after.held.every(value => !value));
  let back = score(roll(after), 'ones'); back = roll(back);
  assert.equal(back.currentPlayer, 0); assert.throws(() => score(back, 'threeKind'), /already filled/);
  assert.equal(validateGame(back), true);
});

test('zero combinations fill a row permanently while previews never write a score', () => {
  const before = deepFreeze(hand([1, 2, 3, 4, 6]));
  const preview = previews(before); assert.equal(preview.yatzy, 0); assert.equal(preview.chance, 16);
  assert.ok(Object.values(before.players[0].scores).every(value => value === null));
  let game = score(before, 'yatzy'); assert.equal(game.players[0].scores.yatzy, 0);
  game = score(roll(game), 'chance'); game = roll(game);
  assert.equal(Object.hasOwn(previews(game), 'yatzy'), false);
  assert.throws(() => score(game, 'yatzy'), /already filled/);
});

test('restoring a mid-turn save preserves held dice and the exact next reroll', () => {
  let game = roll(createGame({seed:0xffffffff, startingPlayer:1})); game = hold(game, 1, true); game = hold(game, 4, true);
  const restored = restoreGame(JSON.stringify(game)); assert.deepEqual(restored, game);
  assert.deepEqual(roll(restored), roll(game)); assert.notEqual(restored, game);
  assert.notEqual(restored.players[0].scores, game.players[0].scores); assert.notEqual(restored.held, game.held);
  const extra = clone(game); extra.untrusted = {event:'run-code'}; extra.players[0].label = 'Wrong'; extra.players[0].scores.bonus = 900;
  const clean = restoreGame(extra); assert.deepEqual(clean, game, 'Only known data is copied from a valid save');
  clean.held[1] = false; assert.equal(game.held[1], true);
});

test('save guards reject corrupt shape, impossible values, wrong turn balance and forged terminal state', () => {
  const mutations = [
    game => {game.version = 0;}, game => {game.version = '1';}, game => {game.rng = -1;}, game => {game.rng = 2 ** 32;},
    game => {game.players.reverse();}, game => {game.players.pop();}, game => {game.players[0].scores.pair = 9;},
    game => {game.players[0].scores.fullHouse = 30;}, game => {game.players[0].scores.chance = 0;},
    game => {game.players[0].scores.sixes = 5;}, game => {delete game.players[0].scores.ones;},
    game => {game.currentPlayer = 1;}, game => {game.startingPlayer = 2;}, game => {game.turnCount = 1;},
    game => {game.rollCount = 4;}, game => {game.dice[0] = 1;}, game => {game.held[0] = true;},
    game => {game.held[0] = 0;}, game => {game.dice = Array(5);}, game => {game.held = Array(5);},
    game => {game.status = 'finished';}, game => {game.winner = 'you';}, game => {delete game.status;},
  ];
  for (const mutate of mutations) {
    const game = createGame(); mutate(game);
    assert.throws(() => validateGame(game)); assert.equal(restoreGame(game), null);
  }
  for (const input of [null, undefined, [], 1, '', '{', 'null', '[]', ' '.repeat(20001), {turn:'child', scores:{child:{}, sloedla:{}}}]) assert.equal(restoreGame(input), null);
  const accessor = createGame(); Object.defineProperty(accessor, 'rng', {get() {throw new Error('Getter must not run');}});
  assert.equal(restoreGame(accessor), null);
  const inherited = Object.create(createGame()); assert.equal(restoreGame(inherited), null);
  const active = hand([1, 2, 3, 4, 5]); active.dice[1] = 0; assert.equal(restoreGame(active), null);
});

test('only the thirtieth scored turn ends the game, with correct ties and no further actions', () => {
  for (const startingPlayer of [0, 1]) {
    let game = createGame({startingPlayer});
    for (let turn = 0; turn < 30; turn++) {
      const acting = game.currentPlayer;
      game = {...game, dice:[1, 2, 3, 4, 5], rollCount:1};
      game = score(game, ids[Math.floor(turn / 2)]);
      assert.equal(game.turnCount, turn + 1); assert.equal(validateGame(game), true);
      assert.equal(game.players[acting].scores[ids[Math.floor(turn / 2)]], scoreCategory(ids[Math.floor(turn / 2)], [1, 2, 3, 4, 5]));
      assert.equal(game.status, turn === 29 ? 'finished' : 'playing');
      if (turn < 29) assert.equal(game.winner, null);
    }
    assert.equal(game.winner, 'tie'); assert.equal(game.currentPlayer, startingPlayer);
    assert.equal(decideAI(game), null); assert.deepEqual(previews(game), {});
    for (const action of [() => roll(game), () => hold(game, 0), () => score(game, 'chance')]) assert.throws(action, /finished/);
    assert.deepEqual(restoreGame(JSON.stringify(game)), game);
    game.players[0].scores.ones = 2; game.winner = 'you'; assert.equal(validateGame(game), true);
    game.winner = 'mosi'; assert.throws(() => validateGame(game), /winner/);
    game.players[0].scores.ones = 0; assert.equal(validateGame(game), true);
  }
});

test('Mosi recognizes completed hands and makes useful legal holds for each target shape', () => {
  assert.deepEqual(decideAI(hand([5, 5, 5, 5, 5])), {type:'score', categoryId:'yatzy'});
  assert.deepEqual(decideAI(remaining(['largeStraight'], [2, 3, 4, 5, 6])), {type:'score', categoryId:'largeStraight'});
  assert.deepEqual(decideAI(remaining(['pair'], [2, 2, 6, 6, 1])), {type:'score', categoryId:'pair'});
  const four = decideAI(remaining(['fourKind'], [6, 6, 6, 1, 2]));
  assert.equal(four.type, 'roll'); assert.deepEqual(four.held, [true, true, true, false, false]);
  const straight = decideAI(remaining(['largeStraight'], [2, 3, 4, 5, 5]));
  assert.deepEqual(straight, {type:'roll', held:[true, true, true, true, false]});
  const house = decideAI(remaining(['fullHouse'], [2, 2, 2, 2, 2]));
  assert.equal(house.type, 'roll'); assert.equal(house.held.filter(Boolean).length, 3, 'Yatzy must be broken up to seek an exact full house');
  const pairs = decideAI(remaining(['twoPairs'], [4, 4, 4, 4, 2]));
  assert.equal(pairs.type, 'roll'); assert.equal(pairs.held.slice(0, 4).filter(Boolean).length, 2);
  const chance = decideAI(remaining(['chance'], [1, 2, 3, 4, 6], 2));
  assert.deepEqual(chance, {type:'roll', held:[false, false, false, true, true]});
  const last = decideAI(hand([1, 2, 3, 4, 6], 3)); assert.equal(last.type, 'score'); assert.ok(ids.includes(last.categoryId));
});

test('AI is pure, ignores future RNG and returns fresh hold arrays', () => {
  const originalRandom = Math.random; Math.random = () => {throw new Error('AI cannot use random sampling');};
  try {
    const game = deepFreeze(hand([4, 4, 4, 2, 6]));
    const expected = decideAI(game); assert.equal(expected.type, 'roll');
    for (const rng of [0, 1, 100, 928019, 0xffffffff]) assert.deepEqual(decideAI({...game, rng}), expected);
    assert.deepEqual(decideAI(game), expected);
    const changed = decideAI(game); changed.held.fill(false); assert.deepEqual(decideAI(game), expected);
    assert.ok(game.held.every(value => !value)); assert.equal(game.rollCount, 1);
  } finally {Math.random = originalRandom;}
});

test('deterministic AI games terminate legally with fifteen filled rows per player', () => {
  const results = [];
  for (let seed = 0; seed < 32; seed++) {
    let game = createGame({seed, startingPlayer:seed % 2}), decisions = 0, rolls = 0;
    while (game.status === 'playing') {
      const before = clone(game), decision = decideAI(game);
      assert.deepEqual(game, before); assert.deepEqual(decision, decideAI({...game, rng:(game.rng + 1) >>> 0}));
      if (decision.type === 'roll') {rolls++; assert.equal(decision.held.length, 5); assert.ok(decision.held.every(value => typeof value === 'boolean')); assert.ok(decision.held.some(value => !value));}
      else {assert.equal(game.players[game.currentPlayer].scores[decision.categoryId], null); assert.ok(game.rollCount > 0);}
      game = applyDecision(game, decision); assert.equal(validateGame(game), true);
      assert.ok(++decisions <= 120, 'At most three rolls and one score for each of thirty turns');
    }
    assert.equal(game.turnCount, 30); assert.ok(rolls >= 30 && rolls <= 90);
    assert.ok(game.players.every(player => Object.values(player.scores).every(value => value !== null)));
    const values = game.players.map(player => totals(player.scores).total);
    assert.equal(game.winner, values[0] === values[1] ? 'tie' : values[0] > values[1] ? 'you' : 'mosi');
    assert.deepEqual(restoreGame(JSON.stringify(game)), game); results.push(values.join(':'));
  }
  assert.ok(new Set(results).size > 24, 'Different seeds produce varied honest games');
  let first = createGame({seed:173}), second = createGame({seed:173});
  while (first.status === 'playing') {first = applyDecision(first); second = applyDecision(second); assert.deepEqual(first, second);}
});
