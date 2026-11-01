// What a phone sees and does in "Veiddu" in Fjölspil (spec section 11; Task 9): the pure part of the round the big screen plays with
// guests. The big screen decides everything (the rules, the random numbers); a phone only shows its own hand and sends what its player
// chose, and the screen checks it here before it lets the rules see it. No DOM, no sound, no timers: the table (multi.js), the phone's
// screen (fjolspil/guest-veiddu.js) and the tests all hold the same functions.
//
// A view is what ONE seat is sent (viewFor): her own hand and nobody else's cards, only how many the others hold, the kinds each seat has
// laid down (public: every pair was shown), the size of the pond, whose turn it is and what is being asked. It never holds the rules'
// log (which has the private card ids of every deal and every fish), the pond's cards or another hand, so a phone cannot show what it
// must not know:
//   { screen: 'veiddu', seat, hand, counts, catches, pond, turn, phase, asked, mode, targets, lastEvent, names, avatars, away, winners }
//     seat       the seat this view is for
//     hand       her cards, [{ id, kind }], in the order of the kinds
//     counts     how many cards each seat holds (a number for each seat, hers too)
//     catches    the kinds each seat has laid down, a list for each seat
//     pond       how many cards the pond holds
//     turn       the seat whose turn it is; phase the rules' phase: 'ask', 'fish' or 'over'
//     asked      the question being answered, or the one just answered no: { from, to, kind, no } (no: the answer was no, so `from` fishes)
//     mode       what SHE does now, the one thing the table waits for from her: 'ask' (pick a card and a seat), 'fish' (the pond), 'give'
//                (she is asked and holds it: tap the card), 'no' (she is asked and lacks it: "Farðu að veiða!"), 'wait' or 'over'
//     targets    in mode 'ask', the seats she may ask (those that hold cards); else []
//     lastEvent  the last public thing, { type, ... } (an ask, a yes, a no, a pair, a fish, the pond empty): no card ids, nothing private
//     names, avatars   each seat's name and avatar id; away  the seats whose phones are away (the computer plays them, or they are waited for)
//     winners    at the end, the seats with the most pairs
// An act is what a phone sends (actOf): { type: 'ask', target, kind }, { type: 'give', cardId }, { type: 'no' } or { type: 'fish' }.

import { KINDS } from './cards.js';
import { SEAT, VEIDDU_SKILL_START } from './minds.js';
import { afterRound } from '../eitt/skill.js';
import { holds, isOver, legalTargets } from './rules.js';

const KIND = new Map(KINDS.map(kind => [kind.id, kind]));
const ORDER = KINDS.map(kind => kind.id);
const byKind = (a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.id.localeCompare(b.id);

/** How hard a seat the computer plays for a guest who is away plays: mild (a mind's skill, 0 to 1), as Eitt!'s covered seats do. */
export const COVER_SKILL = 0.5;

/** "Áttu frosk?": the question for a kind. */
export const questionText = kind => `Áttu ${KIND.get(kind).ask}?`;

/** The kind's name as the card says it ("Froskur"). */
export const kindName = kind => KIND.get(kind)?.name ?? '';

const isSeat = (game, n) => Number.isInteger(n) && n >= 0 && n < game.hands.length;

/**
 * The public part of a rules event, or null for one a phone has no use for: no card ids (a deal, a fish and a refill are private to
 * their seat), only who did what with which kind.
 */
export function publicEvent(event) {
  switch (event?.type) {
    case 'ask': return { type: 'ask', seat: event.seat, target: event.target, kind: event.kind };
    case 'give': return { type: 'give', from: event.from, to: event.to, kind: event.kind };
    case 'no': return { type: 'no', seat: event.seat, kind: event.kind };
    case 'pair': return { type: 'pair', seat: event.seat, kind: event.kind };
    case 'fish': return { type: 'fish', seat: event.seat, lucky: Boolean(event.lucky) };
    case 'pond-empty': return { type: 'pond-empty' };
    case 'over': return { type: 'over', winners: [...event.winners] };
    default: return null;
  }
}

/**
 * What seat `seat` is sent. `awaiting` is { seat, need, kind? } while the table waits for somebody's act (need 'ask', 'fish', 'give' with the
 * kind asked, or 'no' with it) and null while it plays something out; `pending` is { from, to, kind } while a question waits for its answer
 * (the rules have not seen it yet). `names` and `avatars` are the seats' (strings, per seat), `away` the seats whose phones are away.
 */
export function viewFor(game, seat, { awaiting = null, pending = null, lastEvent = null, names = [], avatars = [], away = [] } = {}) {
  const over = isOver(game);
  const mine = awaiting !== null && awaiting.seat === seat && !over;
  const asked = pending !== null
    ? { from: pending.from, to: pending.to, kind: pending.kind, no: false }
    : game.phase === 'fish' && game.asked
      ? { from: game.asked.seat, to: game.asked.target, kind: game.asked.kind, no: true }
      : null;
  return {
    screen: 'veiddu',
    seat,
    hand: [...game.hands[seat]].sort(byKind).map(card => ({ id: card.id, kind: card.kind })),
    counts: game.hands.map(hand => hand.length),
    catches: game.pairs.map(laid => [...laid]),
    pond: game.pond.length,
    turn: game.turn,
    phase: game.phase,
    asked,
    mode: over ? 'over' : mine ? awaiting.need : 'wait',
    targets: mine && awaiting.need === 'ask' ? legalTargets(game, seat) : [],
    lastEvent: lastEvent ? { ...lastEvent } : null,
    names: game.hands.map((_, n) => String(names[n] ?? '')),
    avatars: game.hands.map((_, n) => avatars[n] ?? null),
    away: game.hands.flatMap((_, n) => (away.includes(n) ? [n] : [])),
    winners: over ? [...game.winners] : [],
  };
}

/**
 * An act from seat `seat`, checked against the game and what the table waits for: the act as the table will play it, or null for one that
 * is not allowed (nothing changes; the table sends the phone its view again so it rights itself). A seat may do exactly the one thing
 * `awaiting` says, and only if the rules allow it: to ask a seat that holds cards for a kind it holds itself, to give the card asked
 * for, to say no only when it lacks the kind, to fish when the pond calls.
 */
export function actOf(game, seat, act, awaiting) {
  if (act === null || typeof act !== 'object' || typeof act.type !== 'string') return null;
  if (!awaiting || awaiting.seat !== seat || !isSeat(game, seat) || isOver(game)) return null;
  switch (act.type) {
    case 'ask': {
      if (awaiting.need !== 'ask' || game.turn !== seat || game.phase !== 'ask') return null;
      if (!isSeat(game, act.target) || !legalTargets(game, seat).includes(act.target)) return null;
      if (typeof act.kind !== 'string' || !holds(game, seat, act.kind)) return null;
      return { type: 'ask', target: act.target, kind: act.kind };
    }
    case 'give': {
      if (awaiting.need !== 'give' || typeof act.cardId !== 'string') return null;
      const card = game.hands[seat].find(held => held.id === act.cardId);
      return card && card.kind === awaiting.kind ? { type: 'give', cardId: card.id } : null;
    }
    case 'no':
      return awaiting.need === 'no' && !holds(game, seat, awaiting.kind) ? { type: 'no' } : null;
    case 'fish':
      return awaiting.need === 'fish' && game.turn === seat && game.phase === 'fish' ? { type: 'fish' } : null;
    default:
      return null;
  }
}

/** The winners' words with the seats' names: "Anna vann!", "Anna og Egill unnu jafnt!", "Anna, Egill og Uggeðla unnu jafnt!". */
export function winnersWords(winners, names) {
  const who = winners.map(seat => names[seat] ?? '');
  if (who.length === 1) return `${who[0]} vann!`;
  const list = who.length === 2 ? who.join(' og ') : `${who.slice(0, -1).join(', ')} og ${who.at(-1)}`;
  return `${list} unnu jafnt!`;
}

/**
 * Whether Egill (seat 0) is among the winners: a tie he is in counts as a win, as in the solo round (his sticker, his wins). Pure, so the
 * tests can say it without the table.
 */
export const childWon = winners => winners.includes(SEAT.child);

/**
 * The save after a round (`was` is getVeiddu()): the minds' next skill and the child's losses in a row (eitt/skill.js afterRound), and one more
 * win when the child is among the winners, alone or in a tie. A round the child is not among the winners of leaves the wins and adds a loss.
 */
export function afterRoundSave(was, winners) {
  const won = childWon(winners);
  return { ...afterRound({ skill: was?.skill ?? VEIDDU_SKILL_START, losses: was?.losses ?? 0 }, won), wins: (was?.wins ?? 0) + (won ? 1 : 0) };
}

// ---- A round kept in the save -----------------------------------------------------------------------------------------------------

const DECK = new Map(KINDS.flatMap(kind => [1, 2, 3, 4].map(n => [`${kind.id}-${n}`, Object.freeze({ id: `${kind.id}-${n}`, kind: kind.id })])));

/**
 * A round of "Fjölspil" kept in the save (JSON) as the rules' data again, every card the deck's own; null unless it is a whole round of two
 * to four seats still under way (the deck complete, nobody holding two of a kind, the pairs and the turn possible).
 */
export function keptGameOf(state) {
  if (!state || typeof state !== 'object') return null;
  const { pond, hands, pairs, turn, phase, asked, pondEmptySaid, log, winners } = state;
  if (!Array.isArray(pond) || !Array.isArray(hands) || hands.length < 2 || hands.length > 4 || !hands.every(Array.isArray)) return null;
  if (!Array.isArray(pairs) || pairs.length !== hands.length || !pairs.every(laid => Array.isArray(laid) && laid.every(kind => ORDER.includes(kind)))) return null;
  const ids = [...pond, ...hands.flat()].map(card => card?.id);
  const laidCards = pairs.flat().length * 2;
  if (ids.length + laidCards !== DECK.size || new Set(ids).size !== ids.length || !ids.every(id => DECK.has(id))) return null;
  const copies = new Map();
  for (const id of ids) copies.set(DECK.get(id).kind, (copies.get(DECK.get(id).kind) ?? 0) + 1);
  for (const kind of ORDER) { // the cards still in play and the pairs laid add up to the four of each kind
    const laid = pairs.flat().filter(held => held === kind).length * 2;
    if ((copies.get(kind) ?? 0) + laid !== 4) return null;
  }
  for (const hand of hands) if (new Set(hand.map(card => DECK.get(card.id).kind)).size !== hand.length) return null; // never two of a kind
  if (!isSeat({ hands }, turn) || (phase !== 'ask' && phase !== 'fish') || winners !== null || typeof pondEmptySaid !== 'boolean') return null;
  if (asked !== null && !(isSeat({ hands }, asked?.seat) && isSeat({ hands }, asked?.target) && ORDER.includes(asked?.kind) && asked.seat === turn)) return null;
  if (phase === 'fish' && pond.length === 0) return null; // a seat that must fish has a pond to fish in
  const card = held => DECK.get(held.id);
  const events = Array.isArray(log) ? log.filter(event => event && typeof event === 'object' && typeof event.type === 'string') : [];
  return {
    pond: pond.map(card), hands: hands.map(hand => hand.map(card)), pairs: pairs.map(laid => [...laid]), turn, phase,
    asked: asked === null ? null : { seat: asked.seat, target: asked.target, kind: asked.kind }, winners: null, pondEmptySaid, log: events,
  };
}
