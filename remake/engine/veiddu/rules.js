// The rules of "Veiddu", our Go Fish, for two to four seats (spec §2). A pure module with no DOM, no three.js and no sound: a Game
// goes in, a new Game comes out (the one that went in is never changed), and an act the rules do not allow throws. The table, the
// computer players and Mosi's advice are built on top of it.
//
// A card is { id, kind } (cards.js). A Game is { pond, hands, pairs, turn, phase, asked, winners, pondEmptySaid, log }:
//   pond           the cards still to be fished; the next one is the LAST in the list
//   hands          one list of cards for each seat; a hand never holds two of a kind, since a pair is laid down at once
//   pairs          one list for each seat: the kinds it has laid down, one entry for each pair
//   turn           the seat whose turn it is. At a table of one device seat 0 is the child, 1 Uggeðla and 2 Mosi
//   phase          'ask' (the seat on turn picks a kind and a seat to ask), 'fish' (it must draw from the pond) or 'over'
//   asked          in phase 'fish' after a no: { seat, target, kind }, what was asked; otherwise null
//   winners        the seats with the most pairs once the game is over, otherwise null
//   pondEmptySaid  "the pond is empty" has been said; from then on a no passes the turn instead of sending the asker fishing
//   log            every event so far, in order: the public record the computer players' memories are built from (minds.js)
//
// Every act returns { game, events }. The events, in the order they happen:
//   deal { seat, cardId }        pair { seat, kind, cardIds }      ask { seat, target, kind }
//   give { from, to, kind, cardId }    no { seat (the one asked), kind }
//   fish { seat, cardId, lucky } (the card drawn was the kind asked for)    refill { seat, cardId } (an empty hand draws one)
//   pond-empty                   turn { seat }                     out { seat } (no cards and no pond: the turn goes by)
//   over { winners }
// The cardIds of deal, fish and refill are private to their seat: nobody else saw the card. Everything else is public.
//
// The turn goes round from seat 0 (a yes keeps it, a lucky draw keeps it). A seat that begins its turn, or keeps it, with no cards
// draws one from the pond; with the pond empty too it is out. Some rulings the spec leaves open:
//  - A seat can only ask a seat that holds cards. If every other seat is empty-handed, the pond calls instead (phase 'fish' with
//    asked null) and the draw never counts as lucky.
//  - The game is over when no pair can be made any more: with the whole deck that is when all 26 pairs are down.

import { makeDeck } from './cards.js';

const MIN_SEATS = 2;
const MAX_SEATS = 4;

function shuffle(cards, random) {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Whether `seat` holds a card of `kind`. */
export const holds = (game, seat, kind) => game.hands[seat].some(card => card.kind === kind);

export const isOver = game => game.phase === 'over';

/** The seats with the most pairs: one seat, or all those that tie. */
export function winners(game) {
  const best = Math.max(...game.pairs.map(laid => laid.length));
  return game.pairs.flatMap((laid, seat) => (laid.length === best ? [seat] : []));
}

/** The seats `seat` may ask: every other seat that holds cards. */
export function legalTargets(game, seat) {
  if (isOver(game)) return [];
  return game.hands.flatMap((hand, other) => (other !== seat && hand.length > 0 ? [other] : []));
}

// ---------------------------------------------------------------------------------------------------------------------------
// Inside an act the game is a draft, a copy that the act changes freely; the game that went in is never touched.

const draft = game => ({
  ...game,
  pond: [...game.pond],
  hands: game.hands.map(hand => [...hand]),
  pairs: game.pairs.map(laid => [...laid]),
});

const finished = (game, draftGame, events) => ({ game: { ...draftGame, log: [...game.log, ...events] }, events });

// Every pair in `seat`'s hand goes down, in the order the pairs complete.
function layPairs(g, seat, events) {
  const singles = [];
  for (const card of g.hands[seat]) {
    const at = singles.findIndex(held => held.kind === card.kind);
    if (at < 0) {
      singles.push(card);
      continue;
    }
    const [held] = singles.splice(at, 1);
    g.pairs[seat].push(card.kind);
    events.push({ type: 'pair', seat, kind: card.kind, cardIds: [held.id, card.id] });
  }
  g.hands[seat] = singles;
}

// "The pond is empty" is said once, when its last card has gone.
function noteEmpty(g, events) {
  if (g.pond.length > 0 || g.pondEmptySaid) return;
  g.pondEmptySaid = true;
  events.push({ type: 'pond-empty' });
}

// Nothing more can happen: the pond is empty and at most one seat holds cards.
const stalled = g => g.pond.length === 0 && g.hands.filter(hand => hand.length > 0).length <= 1;

function end(g, events) {
  g.phase = 'over';
  g.asked = null;
  g.winners = winners(g);
  events.push({ type: 'over', winners: [...g.winners] });
}

// The seat on turn keeps it (`pass` false) or the turn goes on to the next seat that can play. The seat that gets the turn draws
// a card if its hand is empty, and then the phase is 'ask', or 'fish' when there is nobody to ask. `announce` says whose turn it is.
function moveOn(g, events, pass, announce = pass) {
  const seats = g.hands.length;
  for (let step = 0; step <= seats; step++) {
    if (stalled(g)) return end(g, events);
    if (pass) g.turn = (g.turn + 1) % seats;
    const seat = g.turn;
    if (g.hands[seat].length === 0 && g.pond.length === 0) {
      events.push({ type: 'out', seat });
      pass = true;
      announce = true;
      continue;
    }
    if (announce) events.push({ type: 'turn', seat });
    if (g.hands[seat].length === 0) {
      const card = g.pond.pop();
      g.hands[seat].push(card);
      events.push({ type: 'refill', seat, cardId: card.id });
      noteEmpty(g, events);
      if (stalled(g)) return end(g, events);
    }
    g.asked = null;
    g.phase = legalTargets(g, seat).length > 0 ? 'ask' : 'fish';
    return;
  }
  throw new Error('No seat can move');
}

// ---------------------------------------------------------------------------------------------------------------------------

/**
 * A new game: the deck shuffled with `random` (or `stack`, the deck in draw order, for the tutorial and the tests: its first card
 * is dealt first), `hand` cards to each seat round the table from seat 0, every pair laid down, and seat 0 to begin. The
 * rest is the pond. The same random numbers deal the same game.
 */
export function newGame(options = {}) {
  if (typeof options === 'function') throw new TypeError('newGame takes { random, seats, hand, deck, stack }, not the random function itself');
  const { random = Math.random, seats = 3, hand = 5, deck = makeDeck(), stack = null } = options;
  if (!Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS) {
    throw new RangeError(`"Veiddu" is for ${MIN_SEATS} to ${MAX_SEATS} seats, not ${seats}`);
  }
  const order = stack ? [...stack] : shuffle(deck, random);
  if (!Number.isInteger(hand) || hand < 1 || hand * seats > order.length) throw new RangeError(`Cannot deal ${hand} cards to ${seats} seats from ${order.length}`);

  const g = {
    pond: order.slice(hand * seats).reverse(),
    hands: Array.from({ length: seats }, () => []),
    pairs: Array.from({ length: seats }, () => []),
    turn: 0,
    phase: 'ask',
    asked: null,
    winners: null,
    pondEmptySaid: false,
    log: [],
  };
  const events = [];
  for (let i = 0; i < hand * seats; i++) {
    g.hands[i % seats].push(order[i]);
    events.push({ type: 'deal', seat: i % seats, cardId: order[i].id });
  }
  for (let seat = 0; seat < seats; seat++) layPairs(g, seat, events);
  noteEmpty(g, events);
  moveOn(g, events, false, true);
  return { game: { ...g, log: [...events] }, events };
}

function mustAsk(game, seat, target, kind) {
  if (game.phase !== 'ask') throw new Error(`Seat ${seat} cannot ask now: the phase is '${game.phase}'`);
  if (game.turn !== seat) throw new Error(`It is seat ${game.turn}'s turn, not seat ${seat}'s`);
  if (!Number.isInteger(target) || target < 0 || target >= game.hands.length) throw new Error(`There is no seat ${target} at this table`);
  if (target === seat) throw new Error(`Seat ${seat} cannot ask itself`);
  if (game.hands[target].length === 0) throw new Error(`Seat ${target} has no cards to ask for`);
  if (!holds(game, seat, kind)) throw new Error(`Seat ${seat} holds no ${kind} to ask for`);
}

/**
 * `seat` asks seat `target` for `kind`, which it must hold itself. A yes gives the card, lays the pair, and the turn stays. A no
 * sends the asker fishing (phase 'fish', `asked` set); with the pond empty the turn passes at once.
 */
export function ask(game, seat, target, kind) {
  mustAsk(game, seat, target, kind);
  const g = draft(game);
  const events = [{ type: 'ask', seat, target, kind }];
  const at = g.hands[target].findIndex(card => card.kind === kind);
  if (at >= 0) {
    const [card] = g.hands[target].splice(at, 1);
    events.push({ type: 'give', from: target, to: seat, kind, cardId: card.id });
    g.hands[seat].push(card);
    layPairs(g, seat, events);
    moveOn(g, events, false);
  } else {
    events.push({ type: 'no', seat: target, kind });
    if (g.pond.length > 0) {
      g.phase = 'fish';
      g.asked = { seat, target, kind };
    } else {
      noteEmpty(g, events);
      moveOn(g, events, true);
    }
  }
  return finished(game, g, events);
}

/**
 * `seat` draws the top card of the pond. If it is the kind asked for (lucky) the pair goes down and the turn stays. Any other
 * card that pairs with one in the hand goes down too, and the turn passes; a card that pairs with nothing is kept.
 */
export function fish(game, seat) {
  if (game.phase !== 'fish') throw new Error(`Seat ${seat} cannot fish now: the phase is '${game.phase}'`);
  if (game.turn !== seat) throw new Error(`It is seat ${game.turn}'s turn, not seat ${seat}'s`);
  const g = draft(game);
  const card = g.pond.pop();
  const lucky = g.asked !== null && card.kind === g.asked.kind;
  const events = [{ type: 'fish', seat, cardId: card.id, lucky }];
  g.hands[seat].push(card);
  layPairs(g, seat, events);
  noteEmpty(g, events);
  moveOn(g, events, !lucky);
  return finished(game, g, events);
}
