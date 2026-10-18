// Kambeðla's choices at the table. She has no view of the child's cards, only of how many there are.
//
// At skill 1 she plays sharp: she keeps her wilds for last and her +2s for the attack, plays a +2 or a +4 as soon as the
// other player is down to 2 cards or fewer (spec section 6: "spilar +2 og +4 þegar barnið nálgast Eitt!"), and picks the
// colour she holds most of. Mosi's advice is the same sharp choice, made with the child's cards (advice.js). At skill 0 she is mild: any card that may be
// played, and a colour at random. In between, each choice is a sharp one with a chance equal to her skill, and she
// forgets to call "Eitt!", or to notice that the child forgot it, more and more as her skill falls.
//
// All the random numbers come in as `random()`, a function that gives numbers in [0, 1), so a seeded round is
// played the same way every time.

import { COLOURS, isWild, other, playable } from './rules.js';
import { clampSkill } from './skill.js';

export const ATTACK_AT = 2; // a +2 or +4 is played when the other player is down to this many cards, or fewer
const REMEMBER_EITT_AT_ZERO = 0.2; // the chance that she calls "Eitt!" at skill 0 (at skill 1 it is 1)
const NOTICE_AT_ZERO = 0.3; // the chance that she catches a forgotten "Eitt!" at skill 0

const pick = (list, random) => list[Math.min(list.length - 1, Math.floor(random() * list.length))];

/** The colour held most among `cards`; a tie, or no coloured card at all, is left to `random`. */
export function bestColour(cards, random = () => 0) {
  const held = COLOURS.map(colour => cards.filter(card => card.colour === colour).length);
  const most = Math.max(...held);
  return pick(COLOURS.filter((colour, i) => held[i] === most), random);
}

// How much a sharp player wants to play `card` now (higher is better): attacks when the other is nearly out, then
// the skips and reverses that give another turn, then numbers, with the colour held most winning among equals, then a
// +2 kept for the attack, then the wilds.
function worth(card, hand, otherCards) {
  const attack = otherCards <= ATTACK_AT;
  if (attack && card.kind === 'draw2') return 400;
  if (attack && card.kind === 'wild4') return 390;
  if (card.kind === 'wild') return 0; // wilds are kept for last, the +4 longest of all
  if (card.kind === 'wild4') return -10;
  const held = hand.filter(mine => mine.colour === card.colour).length;
  if (card.kind === 'draw2') return 50 + held; // kept until the other is nearly out, unless nothing else but a wild goes
  return (card.kind === 'number' ? 100 : 200) + held; // skip and reverse give another turn
}

function sharpCard(game, who, options, random) {
  const hand = game.hands[who];
  const otherCards = game.hands[other(who)].length;
  const best = Math.max(...options.map(card => worth(card, hand, otherCards)));
  return pick(options.filter(card => worth(card, hand, otherCards) === best), random);
}

// The play of `card`; a wild takes the colour from `colourFrom(the rest of the hand)`, except as the last card.
function playing(game, who, card, colourFrom) {
  const rest = game.hands[who].filter(held => held !== card);
  const move = { type: 'play', cardId: card.id };
  if (isWild(card) && rest.length > 0) move.colour = colourFrom(rest);
  return move;
}

/**
 * The move a sharp player makes as `who`: { type: 'play', cardId, colour? } or { type: 'draw' }. It is the same
 * choice for the same cards (ties go to `random`, which gives the first by default), so it is also what Mosi
 * advises the child.
 */
export function sharpMove(game, who, random = () => 0) {
  const options = playable(game, who);
  if (options.length === 0) return { type: 'draw' };
  return playing(game, who, sharpCard(game, who, options, random), rest => bestColour(rest, random));
}

/**
 * Kambeðla's move on her turn: { type: 'play', cardId, colour? } or { type: 'draw' }. She draws only when she has
 * nothing to play, and after drawing a card that can be played she plays it (a wild as her last card needs no
 * colour). Both the card and the colour are chosen sharply with a chance equal to `skill`, otherwise by chance.
 */
export function chooseMove(game, skill, random = Math.random) {
  if (game.winner || game.turn !== 'kambedla') throw new Error('It is not Kambeðla\'s turn');
  const options = playable(game, 'kambedla');
  if (options.length === 0) return { type: 'draw' };
  const sharp = clampSkill(skill);
  const card = random() < sharp ? sharpCard(game, 'kambedla', options, random) : pick(options, random);
  return playing(game, 'kambedla', card, rest => (random() < sharp ? bestColour(rest, random) : pick(COLOURS, random)));
}

const remembers = (skill, atZero, random) => {
  const sharp = clampSkill(skill);
  return sharp >= 1 || random() < atZero + (1 - atZero) * sharp;
};

/** Whether she remembers to call "Eitt!" after playing down to one card: always at skill 1. */
export const willCallEitt = (skill, random = Math.random) => remembers(skill, REMEMBER_EITT_AT_ZERO, random);

/** Whether she notices that the child forgot "Eitt!": always at skill 1. */
export const willCatch = (skill, random = Math.random) => remembers(skill, NOTICE_AT_ZERO, random);
