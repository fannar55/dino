import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../engine/random.js';
import { BOARD, newGame, roll, move } from '../engine/hals/rules.js';

/** A game with the pawns where we want them. */
const at = (child, thorsedla = 0, turn = 'child') => ({ ...newGame(), pos: { child, thorsedla }, turn });
const types = path => path.map(p => p.type);

test('the board has 50 squares, 5 necks up and 5 tails down, and nothing starts on 1 or 50', () => {
  assert.equal(BOARD.size, 50);
  assert.equal(BOARD.necks.length, 5);
  assert.equal(BOARD.tails.length, 5);
  for (const [from, to] of BOARD.necks) assert.ok(from < to, `neck ${from} -> ${to} goes up`);
  for (const [from, to] of BOARD.tails) assert.ok(from > to, `tail ${from} -> ${to} goes down`);

  const starts = [...BOARD.necks, ...BOARD.tails].map(([from]) => from);
  assert.equal(new Set(starts).size, 10, 'no square starts two things');
  assert.ok(!starts.includes(1) && !starts.includes(50), 'nothing starts on 1 or 50');

  const ends = [...BOARD.necks, ...BOARD.tails].map(([, to]) => to);
  const special = [...starts, ...ends, ...BOARD.fruit, ...BOARD.stars];
  assert.equal(new Set(special).size, special.length, 'every end, fruit tree and star has a square of its own');
  assert.ok(special.every(s => s > 1 && s < 50), 'everything lies between the first and the last square');
});

test('a roll out of turn is refused', () => {
  const game = newGame();
  assert.deepEqual(game, { pos: { child: 0, thorsedla: 0 }, turn: 'child', winner: null, rolls: 0 });
  assert.throws(() => move(game, 'thorsedla', 3), /not thorsedla's turn/);
  assert.throws(() => move(game, 'child', 7));
  assert.throws(() => move({ ...at(50), winner: 'child' }, 'child', 1), /over/);
  const dice = Array.from({ length: 600 }, (_, i) => roll(seededRandom(`die-${i}`)));
  assert.ok(dice.every(n => Number.isInteger(n) && n >= 1 && n <= 6));
  assert.equal(new Set(dice).size, 6, 'every face turns up');
});

test('moves resolve necks, tails, fruit and the finish in order', () => {
  // a plain square: one step per square, then the turn passes; the game that went in is left alone
  const start = newGame();
  const plain = move(start, 'child', 2);
  assert.deepEqual(plain.path, [{ type: 'step', square: 1 }, { type: 'step', square: 2 }]);
  assert.deepEqual(plain.game, { pos: { child: 2, thorsedla: 0 }, turn: 'thorsedla', winner: null, rolls: 1 });
  assert.deepEqual(start, newGame());

  // a neck lifts and a tail slides, after the steps; walking over their starts does nothing
  const [nFrom, nTo] = BOARD.necks[0];
  const up = move(at(nFrom - 2), 'child', 2);
  assert.deepEqual(types(up.path), ['step', 'step', 'neck']);
  assert.deepEqual(up.path[2], { type: 'neck', from: nFrom, to: nTo });
  assert.equal(up.game.pos.child, nTo);
  assert.equal(move(at(nFrom - 2), 'child', 3).path.some(p => p.type === 'neck'), false);

  const [tFrom, tTo] = BOARD.tails[0];
  const down = move(at(tFrom - 3, 0), 'child', 3);
  assert.deepEqual(down.path.at(-1), { type: 'tail', from: tFrom, to: tTo });
  assert.equal(down.game.pos.child, tTo);
  assert.equal(down.game.turn, 'thorsedla');

  // fruit: an extra roll, the turn stays; a star changes nothing
  const fruit = BOARD.fruit[0];
  const tree = move(at(fruit - 3), 'child', 3);
  assert.deepEqual(tree.path.at(-1), { type: 'fruit', square: fruit });
  assert.equal(tree.game.turn, 'child');
  assert.equal(tree.game.rolls, 1);
  const star = move(at(0, BOARD.stars[0] - 1, 'thorsedla'), 'thorsedla', 1);
  assert.deepEqual(star.path.at(-1), { type: 'star', square: BOARD.stars[0] });
  assert.equal(star.game.turn, 'child');

  // the finish: stops on 50 and wins, even with a throw to spare
  const finish = move(at(48), 'child', 5);
  assert.deepEqual(finish.path, [{ type: 'step', square: 49 }, { type: 'step', square: 50 }, { type: 'win' }]);
  assert.equal(finish.game.pos.child, 50);
  assert.equal(finish.game.winner, 'child');
  assert.throws(() => move(finish.game, 'thorsedla', 1), /over/);
});

test('a seeded game always ends with a winner', () => {
  for (let seed = 0; seed < 40; seed++) {
    const random = seededRandom(`hals-${seed}`);
    let game = newGame();
    let turns = 0;
    while (!game.winner) {
      assert.ok(++turns < 1000, `game ${seed} does not end`);
      game = move(game, game.turn, roll(random)).game;
    }
    assert.equal(game.pos[game.winner], 50);
    assert.equal(game.rolls, turns);
  }
});
