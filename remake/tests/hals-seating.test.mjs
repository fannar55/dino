// "Háls og hali" over the network (spec §7.2): the players of a game come from the seats of "Fjölspil", and a seat whose
// guest is away can be the computer's until she is back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../engine/random.js';
import { createGame, validateGame } from '../engine/hals/rules.js';
import { rosterOf, computersOf, namesOf, isRemote, withComputer } from '../engine/hals/seating.js';

test('the roster, the computers and the names come from the seats; a seat can be made the computer and back', () => {
  const seats = [{ seat: 0, name: 'Egill', avatar: 'egill', kind: 'host' }, { seat: 1, name: 'Anna', avatar: 'flugedla', kind: 'remote' }, { seat: 2, name: 'Þórseðla', avatar: 'thorsedla', kind: 'ai' }];
  assert.deepEqual(rosterOf(seats), ['egill', 'flugedla', 'thorsedla']);
  assert.deepEqual(computersOf(seats), [false, false, true]);
  assert.deepEqual(namesOf(seats), ['Egill', 'Anna', 'Þórseðla']);
  assert.equal(isRemote(seats, 1), true);
  const game = createGame({ playerCount: 3, computers: computersOf(seats), random: seededRandom('s') });
  const covered = withComputer(game, 1, true);
  assert.equal(covered.players[1].isComputer, true);
  assert.equal(game.players[1].isComputer, false, 'the game that went in is untouched');
  assert.equal(validateGame(covered), true);
});
