// Mosi's advice for the child. It is always good: the move a sharp Kambeðla would make with the child's cards
// (kambedla.js), the same every time he is asked, so asking again never changes his mind.

import { canDraw } from './rules.js';
import { bestColour, sharpMove } from './kambedla.js';

/**
 * The child's best move now, or null when there is nothing to advise (the round is over, or it is Kambeðla's turn):
 *  - { type: 'play', cardId, colour? }: play this card. `colour` is there when it is a wild that is not the last
 *    card: the colour the child holds most of.
 *  - { type: 'draw' }: nothing can be played.
 *  - { type: 'eitt' }: the child played down to one card and has not called "Eitt!" yet. (Before that play he
 *    advises the card, and "Eitt!" comes after it.)
 */
export function advise(game) {
  if (game.winner) return null;
  if (game.unsaid === 'child') return { type: 'eitt' };
  if (game.turn !== 'child') return null;
  const move = sharpMove(game, 'child');
  return move.type === 'draw' && !canDraw(game, 'child') ? null : move;
}

/** The colour Mosi suggests when the child plays the wild `cardId`: the one held most among the other cards. */
export function adviseColour(game, cardId) {
  return bestColour(game.hands.child.filter(card => card.id !== cardId));
}
