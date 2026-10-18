// The rules of "Háls og hali", our own two-player snakes and ladders: Egill (the child) against the dinosaur
// Þórseðla. A neck is a ladder (she lifts the pawn up); a tail is a snake (the pawn slides down). It is all plain
// data and pure functions, with no DOM, no three.js and no sound, and no hidden randomness: the caller throws the
// die with roll(random), so a seeded game always plays out the same. A game goes in and a new game comes out (the
// one that went in is never changed). The valley, the pawns and the dice are built on top of it.
//
// Squares are numbered 1..50. A pawn at 0 has not entered the valley yet (it waits by the meadow's gate).
//
// A Game is { pos: { child, thorsedla }, turn, winner, rolls }:
//   pos     where each pawn is: 0 (not yet started) or 1..50
//   turn    'child' | 'thorsedla': whose turn it is (the child starts)
//   winner  null until a pawn has reached 50, then the name of that player
//   rolls   how many times the die has been thrown so far
//
// Rules the design leaves open, as decided here:
//  - Reaching or passing 50 wins; the pawn stops on 50 (no bounce back, no exact throw needed).
//  - Only the square a pawn LANDS on counts, never the ones it walks over.
//  - A neck's or tail's far end is a plain square, so one move never chains on to a second neck, tail or fruit
//    (BOARD keeps every end clear of the starts and of the fruit and the stars).
//  - Fruit gives an extra roll to the same player. Stars change nothing; they only ask for a cheer.
//  - Both pawns may share a square.

/** The valley's squares 1..50, and what the board has on them. Frozen: it is read, never changed. */
export const BOARD = deepFreeze({
  size: 50,
  // [from, to]: land on `from` and Þórseðla lifts you up to `to` (from < to).
  necks: [[4, 13], [11, 24], [21, 32], [30, 40], [36, 46]],
  // [from, to]: land on `from` and you slide down to `to` (from > to).
  tails: [[17, 8], [28, 19], [35, 26], [43, 31], [48, 39]],
  // Fruit trees: an extra roll.
  fruit: [7, 18, 29, 41],
  // Star squares: glitter and cheers, no effect on the game.
  stars: [9, 15, 23, 34, 45],
});

const NECKS = new Map(BOARD.necks);
const TAILS = new Map(BOARD.tails);
const FRUIT = new Set(BOARD.fruit);
const STARS = new Set(BOARD.stars);

/** The two players, the child first. */
export const PLAYERS = Object.freeze(['child', 'thorsedla']);

/** The other player. */
export const other = who => (who === 'child' ? 'thorsedla' : 'child');

/** A new game: both pawns before the first square, and the child to throw. */
export function newGame() {
  return { pos: { child: 0, thorsedla: 0 }, turn: 'child', winner: null, rolls: 0 };
}

/** One throw of the die: a whole number 1..6. `random` is a function giving numbers in [0, 1). */
export function roll(random) {
  return Math.min(6, 1 + Math.floor(random() * 6));
}

/**
 * Player `who` moves their pawn `n` squares (1..6) forward. Gives { game, path }, where `game` is the new game and
 * `path` is what the scene should play out, in order:
 *   { type: 'step', square }       the pawn hops onto `square` (one per square, up to 50 at the most)
 *   { type: 'neck', from, to }     landed on a neck: lifted from `from` up to `to`
 *   { type: 'tail', from, to }     landed on a tail: slides from `from` down to `to`
 *   { type: 'fruit', square }      landed on a fruit tree: an extra roll, the turn stays
 *   { type: 'star', square }       landed on a star: glitter and cheers
 *   { type: 'win' }                reached 50: `who` wins
 * The turn passes to the other player, except after fruit (and after a win, when nothing more is played).
 * Throws when the game is won already, when it is not `who`'s turn, or when `n` is not a whole number 1..6.
 */
export function move(game, who, n) {
  if (game.winner) throw new Error(`the game is over: ${game.winner} has won`);
  if (who !== game.turn) throw new Error(`it is not ${who}'s turn (it is ${game.turn}'s)`);
  if (!Number.isInteger(n) || n < 1 || n > 6) throw new Error(`a move is 1..6 squares, not ${n}`);

  const start = game.pos[who];
  const land = Math.min(BOARD.size, start + n);
  const path = [];
  for (let square = start + 1; square <= land; square++) path.push({ type: 'step', square });

  let at = land;
  let turn = other(who);
  let winner = null;
  if (land === BOARD.size) {
    path.push({ type: 'win' });
    winner = who;
    turn = who;
  } else if (NECKS.has(land)) {
    at = NECKS.get(land);
    path.push({ type: 'neck', from: land, to: at });
  } else if (TAILS.has(land)) {
    at = TAILS.get(land);
    path.push({ type: 'tail', from: land, to: at });
  } else if (FRUIT.has(land)) {
    path.push({ type: 'fruit', square: land });
    turn = who;
  } else if (STARS.has(land)) {
    path.push({ type: 'star', square: land });
  }

  return {
    game: { pos: { ...game.pos, [who]: at }, turn, winner, rolls: game.rolls + 1 },
    path,
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
