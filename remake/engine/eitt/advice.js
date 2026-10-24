// Mosi's advice for the child. It is always good: the move a sharp Kambeðla would make with the child's cards
// (kambedla.js), the same every time he is asked, so asking again never changes his mind. And he says why (task 3b, the
// owner's wish that he teach): each piece of advice carries a reason, whose line he speaks while his card glows. The
// lines are recorded once (assets/audio/eitt/lines-source.json, eitt_why_<reason>), so they name no card: the glowing
// card shows which one he means. He advises one seat, the child's (seat 0 unless said otherwise; spec §7.3: Mosi advises
// Egill alone), and his attack is on the player about to move next, as hers is.

import { canDraw, isWild } from './rules.js';
import { ATTACK_AT, bestColour, nextAfter, sharpMove } from './kambedla.js';

/** Why Mosi advises what he does; each is a line of his, eitt_why_<reason> with its dashes as underscores. */
export const REASONS = Object.freeze([
  'colour', // a card of the table's colour
  'number', // a card of the same number (or symbol), in another colour
  'keep-wild', // a plain card while the child also holds a wild, which is better kept
  'only-wild', // the wild is the only card that fits
  'attack', // a +2 or +4 while the next player (Kambeðla, at a table of two) has 2 cards or fewer
  'keep-attack', // a plain card while the child holds a +2 that is better kept
  'skip', // a skip or a reverse, which lets the child play again
  'most-colour', // the colour to pick after a wild (the colour picker's, adviseColour)
  'change-colour', // a card that switches to the colour the child holds most of
  'draw', // nothing fits
  'eitt', // the child played down to one card and has not called it
  'play-drawn', // the card just drawn fits
]);

/** Why a sharp player plays `move` (a play) with the cards of `who`, whose turn it is. */
function reasonFor(game, who, move) {
  if (game.drew) return 'play-drawn';
  const hand = game.hands[who];
  const card = hand.find(held => held.id === move.cardId);
  const rest = hand.filter(held => held !== card);
  const attack = game.hands[nextAfter(game, who)].length <= ATTACK_AT;
  if (card.kind === 'skip' || card.kind === 'reverse') return 'skip';
  if (attack && (card.kind === 'draw2' || card.kind === 'wild4')) return 'attack';
  if (isWild(card)) return 'only-wild'; // a sharp player plays a wild only when nothing else fits (or to attack)
  if (rest.some(isWild)) return 'keep-wild';
  if (!attack && rest.some(held => held.kind === 'draw2')) return 'keep-attack';
  if (card.colour !== game.colour && card.colour === bestColour(rest)) return 'change-colour';
  return card.colour === game.colour ? 'colour' : 'number';
}

/**
 * The best move now for the child in seat `who`, and why, or null when there is nothing to advise (the round is over, or it is
 * another player's turn):
 *  - { type: 'play', cardId, colour?, reason }: play this card. `colour` is there when it is a wild that is not the last
 *    card: the colour the child holds most of.
 *  - { type: 'draw', reason: 'draw' }: nothing can be played.
 *  - { type: 'eitt', reason: 'eitt' }: the child played down to one card and has not called "Eitt!" yet. (Before that play
 *    he advises the card, and "Eitt!" comes after it.)
 * `reason` is one of REASONS.
 */
export function advise(game, who = 0) {
  if (game.winner !== null) return null;
  if (game.unsaid === who) return { type: 'eitt', reason: 'eitt' };
  if (game.turn !== who) return null;
  const move = sharpMove(game, who);
  if (move.type === 'draw') return canDraw(game, who) ? { ...move, reason: 'draw' } : null;
  return { ...move, reason: reasonFor(game, who, move) };
}

/** The colour Mosi suggests when the child in seat `who` plays the wild `cardId`: the one held most among the other cards ('most-colour'). */
export function adviseColour(game, cardId, who = 0) {
  return bestColour(game.hands[who].filter(card => card.id !== cardId));
}
