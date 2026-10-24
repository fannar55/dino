// The rules of "Eitt!", our own Uno, for two to four players (spec §7.3, the Fjölspil design). The deck, what may be played on
// what, what each card does, the "Eitt!" call and catching a player who forgot it. It is all plain data and pure functions, with no
// DOM, no three.js and no sound: a Game goes in, a new Game comes out (the one that went in is never changed), and a move the
// rules do not allow throws. The table, Kambeðla's choices and Mosi's advice are built on top of it.
//
// A Card is { id, colour, kind, value }:
//   id      a name that is unique in the deck: 'red-5-a', 'blue-skip-b', 'wild4-c'
//   colour  'red' | 'yellow' | 'green' | 'blue', or null for the two wilds
//   kind    'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4'
//   value   0..9 for a number, otherwise null
//
// The players are seats, numbered from 0 round the table; the rules know nothing else of them. At the table of one device seat 0
// is the child's and seat 1 Kambeðla's; who sits where at a bigger table is the table's business.
//
// A Game is { deck, pile, hands, colour, turn, direction, drew, unsaid, winner }:
//   deck       the cards still to be drawn; the next one is the LAST in the list
//   pile       the cards on the table; the top one is the LAST in the list
//   hands      one list of cards for each seat, hands[0] seat 0's: as many as there are players, 2 to 4 (playerCount)
//   colour     the colour to match: the top card's own, or the one chosen with a wild
//   turn       the seat whose turn it is
//   direction  1 or -1, the way the turn goes round the table (next); only a reverse at a table of three or four turns it
//   drew       this turn's player has drawn already: the card drawn may be played (or kept, with pass)
//   unsaid     the seat that played down to one card without calling "Eitt!" and may still be caught, or null
//   winner     the seat that won the round, or null until it is won
// Seat 0 is a number like the others, and falsy: unsaid and winner are compared with null, never taken as true or false.
//
// Rules the design leaves open, as decided here:
//  - A player draws only when no card can be played, and only once per turn. A drawn card that cannot be played
//    ends the turn by itself; one that can be played leaves the turn with the player, to play it or to pass.
//  - With two players, the player who plays a skip, a reverse, a +2 or a +4 moves again (the other misses a turn).
//  - With three or four (spec §7.3), a skip passes the next player by, and a +2 or a +4 makes the next player draw 2 or 4 and
//    miss the turn. A reverse turns the direction, and the turn goes to the player before the one who played it. With two,
//    the next player but one is the player themself, so a skip, a +2 and a +4 follow the rule above, and a reverse (which
//    turned round would only hand the turn on) is a skip, the direction left as it is: a game of two plays as it always did.
//  - The last card wins at once, whatever it is, and its action is not played out: no colour is asked for, and
//    nobody draws.
//  - "Eitt!" has to be called (callEitt) after playing down to one card and before the next player moves. Until then any
//    other player may catch it (catchEitt); when the next player moves, draws or passes, the chance to catch is gone.

import { seededRandom } from '../random.js';

export const COLOURS = Object.freeze(['red', 'yellow', 'green', 'blue']);

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const HAND = 7; // the cards dealt to each player
const ACTIONS = ['skip', 'reverse', 'draw2'];
const PASS_BY = new Set(['skip', 'draw2', 'wild4']); // the next player misses the turn (with two, the player moves again)

/** How many play: the seats at the table, 2 to 4. */
export const playerCount = game => game.hands.length;

/** The seat `steps` places on from the one whose turn it is, the way the table goes round (never negative). */
export function next(game, steps = 1) {
  const n = playerCount(game);
  return (game.turn + game.direction * steps + n * 4) % n;
}

/** The card on top of the table. */
export const topCard = game => game.pile[game.pile.length - 1];

/** A colour change, with or without the four cards. */
export const isWild = card => card.kind === 'wild' || card.kind === 'wild4';

const makeCard = (id, colour, kind, value) => Object.freeze({ id, colour, kind, value });

/** The 108 cards of the deck, in a fixed order (see newGame for the shuffle). */
export function makeDeck() {
  const cards = [];
  for (const colour of COLOURS) {
    cards.push(makeCard(`${colour}-0-a`, colour, 'number', 0));
    for (let value = 1; value <= 9; value++) {
      for (const copy of 'ab') cards.push(makeCard(`${colour}-${value}-${copy}`, colour, 'number', value));
    }
    for (const kind of ACTIONS) {
      for (const copy of 'ab') cards.push(makeCard(`${colour}-${kind}-${copy}`, colour, kind, null));
    }
  }
  for (const kind of ['wild', 'wild4']) {
    for (const copy of 'abcd') cards.push(makeCard(`${kind}-${copy}`, null, kind, null));
  }
  return cards;
}

function shuffle(cards, random) {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A new round for `players` (2 to 4, a RangeError otherwise): the deck shuffled with `random`, 7 cards to each seat in turn from
 * the top of the deck (seat 0's first), the first number card of the deck on the table, and seat 0 to start, the table going
 * round from seat 0 to seat 1. The same random numbers deal the same round, and a round of two is dealt as it always was.
 */
export function newGame(options = {}) {
  if (typeof options === 'function') throw new TypeError('newGame takes { players, random }, not the random function itself');
  const { players = 2, random = Math.random } = options;
  if (!Number.isInteger(players) || players < MIN_PLAYERS || players > MAX_PLAYERS) {
    throw new RangeError(`"Eitt!" is for ${MIN_PLAYERS} to ${MAX_PLAYERS} players, not ${players}`);
  }
  const deck = shuffle(makeDeck(), random);
  const hands = Array.from({ length: players }, () => deck.splice(-HAND));
  const [first] = deck.splice(deck.findLastIndex(card => card.kind === 'number'), 1); // never an action card
  return {
    deck,
    pile: [first],
    hands,
    colour: first.colour,
    turn: 0,
    direction: 1,
    drew: false,
    unsaid: null,
    winner: null,
  };
}

/** Whether `card` may go on the table now: the colour to match, the same number or symbol, or any wild. */
export function canPlay(card, game) {
  if (isWild(card) || card.colour === game.colour) return true;
  const up = topCard(game);
  return card.kind === 'number' ? up.kind === 'number' && up.value === card.value : card.kind === up.kind;
}

/** The cards in `who`'s hand that may be played now (whoever's turn it is). */
export const playable = (game, who) => game.hands[who].filter(card => canPlay(card, game));

/** Whether `who` may draw: it is their turn, they have not drawn yet, and no card of theirs can be played. */
export function canDraw(game, who) {
  return game.winner === null && game.turn === who && !game.drew && playable(game, who).length === 0;
}

function mustSeat(game, who) {
  if (!Number.isInteger(who) || who < 0 || who >= playerCount(game)) {
    throw new TypeError(`"${who}" is not a seat at this table of ${playerCount(game)}`);
  }
}

function mustMove(game, who) {
  mustSeat(game, who);
  if (game.winner !== null) throw new Error(`The round is over: seat ${game.winner} won`);
  if (game.turn !== who) throw new Error(`It is seat ${game.turn}'s turn, not seat ${who}'s`);
}

// Whoever moves ends the chance of catching anyone else, and only a player holding exactly one card can be caught.
function settle(game, mover) {
  const unsaid = game.unsaid === mover && game.hands[mover].length === 1 ? mover : null;
  return { ...game, unsaid };
}

// The turn goes on to the next player (`who` is the one whose turn it was).
const handOver = (game, who) => ({ ...settle(game, who), turn: next(game), drew: false });

// `cards` put into `who`'s hand; every other hand stays the list it was.
const adding = (hands, who, cards) => hands.map((hand, seat) => (seat === who ? [...hand, ...cards] : hand));

// The table's cards but the top one become a new, shuffled deck when the deck has run out. The shuffle is seeded
// from the cards themselves, so the rules need no random numbers passed in and a seeded round stays repeatable.
function refilled(game) {
  if (game.deck.length > 0 || game.pile.length < 2) return game;
  const rest = game.pile.slice(0, -1);
  return { ...game, deck: shuffle(rest, seededRandom(rest.map(card => card.id).join(' '))), pile: game.pile.slice(-1) };
}

// One card off the deck, or none when the deck and the table have nothing left to give.
function takeOne(game) {
  const ready = refilled(game);
  if (ready.deck.length === 0) return { game: ready, card: null };
  return { game: { ...ready, deck: ready.deck.slice(0, -1) }, card: ready.deck[ready.deck.length - 1] };
}

// `count` cards into `who`'s hand (fewer if there are no more cards in the whole game).
function give(game, who, count) {
  let after = game;
  const cards = [];
  for (let i = 0; i < count; i++) {
    const taken = takeOne(after);
    after = taken.game;
    if (!taken.card) break;
    cards.push(taken.card);
  }
  return { ...after, hands: adding(after.hands, who, cards) };
}

// Whose turn it is once the player whose turn it was in `game` has played `card` (not their last), and the way the table goes.
function turnAfter(game, card) {
  if (card.kind === 'reverse' && playerCount(game) > 2) {
    const direction = -game.direction;
    return { direction, turn: next({ ...game, direction }) }; // back the other way: the player before
  }
  if (card.kind === 'reverse' || PASS_BY.has(card.kind)) return { turn: next(game, 2) }; // with two, the player again
  return { turn: next(game) };
}

/**
 * `who` plays the card `cardId` from their hand. A wild needs `colour`, except as the last card, which wins at once. A number
 * card or a wild passes the turn to the next player. A skip passes them by; a +2 or a +4 makes them draw 2 or 4, and passes them
 * by too. A reverse turns the direction at a table of three or four, and the turn goes to the player before `who`; with two
 * players a skip, a reverse, a +2 and a +4 all leave the turn with `who`. Playing down to one card leaves `unsaid` set until
 * "Eitt!" is called or caught.
 */
export function play(game, who, cardId, colour) {
  mustMove(game, who);
  const card = game.hands[who].find(held => held.id === cardId);
  if (!card) throw new Error(`Seat ${who} does not hold ${cardId}`);
  if (!canPlay(card, game)) throw new Error(`${card.id} does not go on ${topCard(game).id} (${game.colour})`);
  const rest = game.hands[who].filter(held => held !== card);
  if (isWild(card) && rest.length > 0 && !COLOURS.includes(colour)) throw new Error(`${card.id} needs a colour`);

  let after = {
    ...game,
    pile: [...game.pile, card],
    hands: game.hands.map((hand, seat) => (seat === who ? rest : hand)),
    colour: !isWild(card) ? card.colour : COLOURS.includes(colour) ? colour : game.colour,
    drew: false,
    unsaid: null,
  };
  if (rest.length === 0) return { ...after, winner: who };

  if (card.kind === 'draw2') after = give(after, next(game), 2);
  if (card.kind === 'wild4') after = give(after, next(game), 4);
  return { ...after, ...turnAfter(game, card), unsaid: rest.length === 1 ? who : null };
}

/**
 * `who` draws a card, which needs a turn with nothing to play. Returns { game, card }. If the card can be
 * played, the turn stays (drew is set) and `who` plays it or passes; if not, the turn goes to the next player.
 * An empty deck is filled from the table first; with nothing left anywhere `card` is null and the turn passes.
 */
export function draw(game, who) {
  mustMove(game, who);
  if (game.drew) throw new Error(`Seat ${who} has drawn already: play the card or pass`);
  if (playable(game, who).length > 0) throw new Error(`Seat ${who} has a card to play, and draws only without one`);
  const taken = takeOne(game);
  if (!taken.card) return { game: handOver(taken.game, who), card: null };
  const drawn = settle({ ...taken.game, hands: adding(taken.game.hands, who, [taken.card]) }, who);
  return { game: canPlay(taken.card, drawn) ? { ...drawn, drew: true } : handOver(drawn, who), card: taken.card };
}

/** `who` keeps the card just drawn and ends the turn. */
export function pass(game, who) {
  mustMove(game, who);
  if (!game.drew) throw new Error(`Seat ${who} can pass only after drawing a card that can be played`);
  return handOver(game, who);
}

/** `who` calls "Eitt!" after playing down to one card, before the next player moves. */
export function callEitt(game, who) {
  mustSeat(game, who);
  if (game.unsaid !== who) throw new Error(`Seat ${who} has no "Eitt!" to call`);
  return { ...game, unsaid: null };
}

/**
 * `catcher`, any seat but the forgetful one, notices that the player who played down to one card forgot "Eitt!" (the next
 * player has not moved yet), and that player draws 2.
 */
export function catchEitt(game, catcher) {
  mustSeat(game, catcher);
  const forgot = game.unsaid;
  if (forgot === null) throw new Error('There is nobody to catch: "Eitt!" is not forgotten');
  if (forgot === catcher) throw new Error(`Seat ${catcher} cannot catch their own "Eitt!", only call it`);
  return { ...give(game, forgot, 2), unsaid: null };
}
