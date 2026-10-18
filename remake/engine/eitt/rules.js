// The rules of "Eitt!", our own two-player Uno. The deck, what may be played on what, what each card does, the
// "Eitt!" call and catching a player who forgot it. It is all plain data and pure functions, with no DOM, no
// three.js and no sound: a Game goes in, a new Game comes out (the one that went in is never changed), and a move
// the rules do not allow throws. The table, Kambeðla's choices and Mosi's advice are built on top of it.
//
// A Card is { id, colour, kind, value }:
//   id      a name that is unique in the deck: 'red-5-a', 'blue-skip-b', 'wild4-c'
//   colour  'red' | 'yellow' | 'green' | 'blue', or null for the two wilds
//   kind    'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4'
//   value   0..9 for a number, otherwise null
//
// A Game is { deck, pile, hands: { child, kambedla }, colour, turn, drew, unsaid, winner }:
//   deck    the cards still to be drawn; the next one is the LAST in the list
//   pile    the cards on the table; the top one is the LAST in the list
//   colour  the colour to match: the top card's own, or the one chosen with a wild
//   turn    'child' | 'kambedla'
//   drew    this turn's player has drawn already: the card drawn may be played (or kept, with pass)
//   unsaid  who played down to one card without calling "Eitt!" and may still be caught, or null
//   winner  null until the round is won
//
// Rules the design leaves open, as decided here:
//  - A player draws only when no card can be played, and only once per turn. A drawn card that cannot be played
//    ends the turn by itself; one that can be played leaves the turn with the player, to play it or to pass.
//  - The player who plays a skip, a reverse, a +2 or a +4 moves again (with two players, the other misses a turn).
//  - The last card wins at once, whatever it is, and its action is not played out: no colour is asked for, and
//    nobody draws.
//  - "Eitt!" has to be called (callEitt) after playing down to one card and before the other player moves. When
//    the other player moves, draws or passes, the chance to catch is gone.

import { seededRandom } from '../random.js';

export const COLOURS = Object.freeze(['red', 'yellow', 'green', 'blue']);

const PLAYERS = ['child', 'kambedla'];
const ACTIONS = ['skip', 'reverse', 'draw2'];
const MOVES_AGAIN = new Set(['skip', 'reverse', 'draw2', 'wild4']); // the player of these moves again

/** The other player. */
export const other = who => (who === 'child' ? 'kambedla' : 'child');

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
 * A new round: the deck shuffled with `random`, 7 cards each, the first number card of the deck on the table, and
 * the child to start. The same random numbers deal the same round.
 */
export function newGame(random = Math.random) {
  const deck = shuffle(makeDeck(), random);
  const child = deck.splice(-7);
  const kambedla = deck.splice(-7);
  const [first] = deck.splice(deck.findLastIndex(card => card.kind === 'number'), 1); // never an action card
  return {
    deck,
    pile: [first],
    hands: { child, kambedla },
    colour: first.colour,
    turn: 'child',
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
  return !game.winner && game.turn === who && !game.drew && playable(game, who).length === 0;
}

function mustPlayer(who) {
  if (!PLAYERS.includes(who)) throw new TypeError(`"${who}" is not a player`);
}

function mustMove(game, who) {
  mustPlayer(who);
  if (game.winner) throw new Error(`The round is over: ${game.winner} won`);
  if (game.turn !== who) throw new Error(`It is ${game.turn}'s turn, not ${who}'s`);
}

// Whoever moves ends the other's chance of being caught, and only a player holding exactly one card can be caught.
function settle(game, mover) {
  const unsaid = game.unsaid === mover && game.hands[mover].length === 1 ? mover : null;
  return { ...game, unsaid };
}

// The turn goes to the other player.
const handOver = (game, who) => ({ ...settle(game, who), turn: other(who), drew: false });

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
  let next = game;
  const cards = [];
  for (let i = 0; i < count; i++) {
    const taken = takeOne(next);
    next = taken.game;
    if (!taken.card) break;
    cards.push(taken.card);
  }
  return { ...next, hands: { ...next.hands, [who]: [...next.hands[who], ...cards] } };
}

/**
 * `who` plays the card `cardId` from their hand. A wild needs `colour`, except as the last card, which wins at
 * once. Skip, reverse, +2 and +4 leave the turn with `who` (+2 and +4 first make the other draw 2 or 4); every
 * other card passes it on. Playing down to one card leaves `unsaid` set until "Eitt!" is called or caught.
 */
export function play(game, who, cardId, colour) {
  mustMove(game, who);
  const card = game.hands[who].find(held => held.id === cardId);
  if (!card) throw new Error(`${who} does not hold ${cardId}`);
  if (!canPlay(card, game)) throw new Error(`${card.id} does not go on ${topCard(game).id} (${game.colour})`);
  const rest = game.hands[who].filter(held => held !== card);
  if (isWild(card) && rest.length > 0 && !COLOURS.includes(colour)) throw new Error(`${card.id} needs a colour`);

  let next = {
    ...game,
    pile: [...game.pile, card],
    hands: { ...game.hands, [who]: rest },
    colour: !isWild(card) ? card.colour : COLOURS.includes(colour) ? colour : game.colour,
    drew: false,
    unsaid: null,
  };
  if (rest.length === 0) return { ...next, winner: who };

  if (card.kind === 'draw2') next = give(next, other(who), 2);
  if (card.kind === 'wild4') next = give(next, other(who), 4);
  return { ...next, turn: MOVES_AGAIN.has(card.kind) ? who : other(who), unsaid: rest.length === 1 ? who : null };
}

/**
 * `who` draws a card, which needs a turn with nothing to play. Returns { game, card }. If the card can be
 * played, the turn stays (drew is set) and `who` plays it or passes; if not, the turn goes to the other player.
 * An empty deck is filled from the table first; with nothing left anywhere `card` is null and the turn passes.
 */
export function draw(game, who) {
  mustMove(game, who);
  if (game.drew) throw new Error(`${who} has drawn already: play the card or pass`);
  if (playable(game, who).length > 0) throw new Error(`${who} has a card to play, and draws only without one`);
  const taken = takeOne(game);
  if (!taken.card) return { game: handOver(taken.game, who), card: null };
  const drawn = settle({ ...taken.game, hands: { ...taken.game.hands, [who]: [...taken.game.hands[who], taken.card] } }, who);
  return { game: canPlay(taken.card, drawn) ? { ...drawn, drew: true } : handOver(drawn, who), card: taken.card };
}

/** `who` keeps the card just drawn and ends the turn. */
export function pass(game, who) {
  mustMove(game, who);
  if (!game.drew) throw new Error(`${who} can pass only after drawing a card that can be played`);
  return handOver(game, who);
}

/** `who` calls "Eitt!" after playing down to one card, before the other player moves. */
export function callEitt(game, who) {
  mustPlayer(who);
  if (game.unsaid !== who) throw new Error(`${who} has no "Eitt!" to call`);
  return { ...game, unsaid: null };
}

/** `catcher` notices that the other player forgot "Eitt!", and the other draws 2. */
export function catchEitt(game, catcher) {
  mustPlayer(catcher);
  const forgot = other(catcher);
  if (game.unsaid !== forgot) throw new Error(`${forgot} has not forgotten "Eitt!"`);
  return { ...give(game, forgot, 2), unsaid: null };
}
