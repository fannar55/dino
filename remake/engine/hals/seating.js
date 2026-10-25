// "Háls og hali" played from the seats of "Fjölspil" (spec §7.2): who plays, in what order, and as what, comes from the
// seats (fjolspil/seats.js) and not from the fixed rosters of a game on one tablet. Seat n is player n of the rules and
// piece n on the board, Egill in seat 0 on Mosi; a guest plays the friend she picked as her avatar, and the game's own
// character, Þórseðla, plays as the computer. Pure: no DOM, no network, so the game and the tests share it.
//
// A seat's guest who is away when her turn comes can be covered ("Halda áfram án Önnu", spec §4 step 6, §7.1): the
// computer plays her seat until she is back. withComputer is that switch on the rules' state, which keeps everything else.

import { validateGame } from './rules.js';

/** The pieces in seat order: each seat's avatar id (Egill's is 'egill', Mosi with Egill in the saddle). */
export const rosterOf = seats => seats.map(seat => seat.avatar);

/** Which players the computer plays: the game's own character, and a guest's seat while it is covered. */
export const computersOf = seats => seats.map(seat => seat.kind === 'ai');

/** The names the screens show, in seat order. */
export const namesOf = seats => seats.map(seat => seat.name);

/** Whether seat `index` is a guest's, played from her phone (not Egill, not the computer, not covered). */
export const isRemote = (seats, index) => seats[index]?.kind === 'remote';

/**
 * The rules' state with player `index` played by the computer (`isComputer` true) or by its seat again (false); the state
 * that went in is left alone, and the one that comes out passes validateGame.
 */
export function withComputer(state, index, isComputer) {
  validateGame(state);
  if (!state.players[index]) throw new RangeError(`there is no player ${index}`);
  const next = {
    ...state,
    players: state.players.map((player, i) => (i === index ? { ...player, isComputer: Boolean(isComputer) } : player)),
  };
  validateGame(next);
  return next;
}
