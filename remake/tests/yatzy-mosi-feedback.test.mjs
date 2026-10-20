import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame, roll, CATEGORIES, validateGame} from '../engine/yatzy-mosi/rules.js';
import {rollFeedback} from '../engine/yatzy-mosi/feedback.js';

function hand(dice, {open = CATEGORIES.map(c => c.id), rollCount = 3} = {}) {
  const state = roll(createGame({seed: 91}));
  for (const player of state.players) for (const c of CATEGORIES) player.scores[c.id] = open.includes(c.id) ? null : c.id === 'chance' ? 5 : 0;
  state.turnCount = 2 * (15 - open.length); state.dice = dice; state.rollCount = rollCount;
  validateGame(state); return state;
}
test('feedback recognizes useful Yatzy, full houses, runs and multiple matches', () => {
  for (const [dice, kind] of [
    [[4,4,4,4,4], 'yatzy'], [[2,2,2,6,6], 'great'], [[2,3,4,5,6], 'great'],
    [[1,2,3,4,5], 'good'], [[2,2,4,4,5], 'good'], [[3,3,3,1,2], 'good'],
  ]) assert.equal(rollFeedback(hand(dice)).kind, kind);
});
test('Mosi reacts to available categories rather than celebrating unusable duplicate dice', () => {
  assert.equal(rollFeedback(hand([3,3,3,3,3], {open:['sixes']})).kind, 'bad');
  assert.equal(rollFeedback(hand([3,3,3,3,3], {open:['threes']})).kind, 'great');
  assert.equal(rollFeedback(hand([6,6,5,5,4], {open:['chance']})).kind, 'good');
});
test('near-miss optimism requires another roll and a reachable useful combination', () => {
  assert.equal(rollFeedback(hand([1,2,3,4,6], {open:['smallStraight'], rollCount:2})).kind, 'near');
  assert.equal(rollFeedback(hand([1,2,3,4,6], {open:['smallStraight']})).kind, 'bad');
  assert.equal(rollFeedback(hand([1,1,2,4,6], {open:['smallStraight'], rollCount:2})).kind, 'bad');
});
test('feedback is deterministic and cannot alter scoring or the next random roll', () => {
  const state = hand([1,2,3,4,6], {rollCount:1}), before = structuredClone(state);
  assert.deepEqual(rollFeedback(state), rollFeedback(state));
  assert.deepEqual(state, before); assert.deepEqual(roll(state), roll(before));
});
