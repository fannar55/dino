// Söngur Slóeðlu in fjölspil (docs/superpowers/specs/2026-10-31-sloedla-fjolspil-design.md): up to three people play one song,
// Egill at the big screen and guests on phones or tablets, each on her own dinosaur and level, the big screen judging every tap.
// The owner's lean rule: a few tests of the fiddly parts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, REMOTE_GRACE } from '../engine/sloedla/chart.js';
import { canTwoLanes, groupsOf, laneRules, linesOf, lineupOf, lobbyOf, mineFor, takeOver } from '../engine/sloedla/lineup.js';
import { createClockSync, hostSongTime, songTimeAt } from '../engine/sloedla/clock-sync.js';

const seat = (n, avatar, extra = {}) => ({ seat: n, name: ['Egill', 'Anna', 'Bjarni'][n], avatar, kind: n ? 'remote' : 'host', present: true, level: null, ...extra });
test('lineup: Egill\'s dinosaur is never offered, nor Kambeðla with two; three seats with three dinosaurs, two with two', () => {
  assert.deepEqual(lobbyOf({ lanes: 3, mine: 'a' }).offer, ['kambedla', 'thorsedla']);
  assert.deepEqual(lobbyOf({ lanes: 2, mine: 'c' }).offer, ['sloedla']);
  assert.ok(lobbyOf({ lanes: 3, mine: 'a' }).reserved.includes('sloedla'));
  assert.deepEqual([lobbyOf({ lanes: 3, mine: 'a' }).max, lobbyOf({ lanes: 2, mine: 'a' }).max], [3, 2]);
});
test('lineup: each guest plays her dinosaur at her level; Egill plays every one nobody holds', () => {
  const seats = [seat(0, 'egill'), seat(1, 'thorsedla', { level: 'fullordinn' })];
  const lanes = lineupOf({ lanes: 3, mine: 'a', level: 'barn', seats });
  assert.deepEqual(lanes.map(l => [l.role, l.name, l.level, l.judged]), [['b', 'Egill', 'barn', 'here'], ['a', 'Egill', 'barn', 'here'], ['c', 'Anna', 'fullordinn', 'grace']]);
  assert.deepEqual(groupsOf(lanes), [{ player: 0, roles: ['b', 'a'], level: 'barn' }, { player: 1, roles: ['c'], level: 'fullordinn' }]);
});
test('lineup: an absent guest\'s dinosaur is Egill\'s; a guest who drops out mid-song hands hers to Egill at his level', () => {
  const seats = [seat(0, 'egill'), seat(1, 'kambedla', { present: false })];
  assert.equal(lineupOf({ lanes: 3, mine: 'a', level: 'barn', seats })[0].name, 'Egill');
  const live = lineupOf({ lanes: 3, mine: 'a', level: 'barn', seats: [seat(0, 'egill'), seat(1, 'kambedla', { level: 'fullordinn' })] });
  assert.deepEqual(takeOver(live, 'b', 'barn')[0], { role: 'b', player: 0, name: 'Egill', level: 'barn', judged: 'here' });
});
test('lineup: two dinosaurs only when no guest holds Kambeðla and at most one guest; Egill moves off a dinosaur that leaves', () => {
  assert.equal(canTwoLanes([seat(0, 'egill'), seat(1, 'kambedla')]), false);
  assert.equal(canTwoLanes([seat(0, 'egill'), seat(1, 'sloedla'), seat(2, 'thorsedla')]), false);
  assert.equal(canTwoLanes([seat(0, 'egill'), seat(1, 'sloedla')]), true);
  assert.equal(mineFor({ lanes: 2, mine: 'b', seats: [seat(0, 'egill'), seat(1, 'sloedla')] }), 'c');
  assert.equal(mineFor({ lanes: 3, mine: 'c', seats: [seat(0, 'egill'), seat(1, 'thorsedla')] }), 'b');
});
test('lineup: a lane\'s rules and the end lines', () => {
  assert.deepEqual(laneRules({ level: 'fullordinn', judged: 'grace' }), { windows: LEVELS.fullordinn, fall: 1.6, grace: REMOTE_GRACE });
  assert.equal(laneRules({ level: 'barn', judged: 'outside' }).grace, Infinity);
  const lanes = lineupOf({ lanes: 3, mine: 'a', level: 'barn', seats: [seat(0, 'egill'), seat(1, 'thorsedla')] });
  assert.deepEqual(linesOf(lanes, [{ points: 300, great: 2 }, { points: 500, great: 4 }, { points: 900, great: 7 }]), [
    { player: 0, name: 'Egill', roles: ['b', 'a'], points: 800, great: 6 }, { player: 1, name: 'Anna', roles: ['c'], points: 900, great: 7 }]);
});
test('clock: the shortest round trip sets the shared clock; a stamp becomes the song\'s time within 5 ms', () => {
  const sync = createClockSync();
  sync.receive({ sent: 0, host: 5025 }, 40);     // a slow, lopsided trip says 5005
  sync.receive({ sent: 100, host: 5105 }, 110);  // a quick one says 5000
  assert.equal(sync.offset, 5000);
  const anchor = { at: 9000, song: 12 };
  assert.ok(Math.abs(songTimeAt(anchor, sync.toHost(4500)) - 12.5) < 0.005);
});
test('clock: following, an answer near the best trip moves the clock 2 ms at most; a slow one is not believed', () => {
  const sync = createClockSync();
  sync.receive({ sent: 100, host: 5105 }, 110);
  sync.follow();
  sync.receive({ sent: 200, host: 5225 }, 210); // says 5020
  assert.equal(sync.offset, 5002);
  sync.receive({ sent: 300, host: 5400 }, 350); // a 50 ms trip
  assert.equal(sync.offset, 5002);
});
test('clock: a stamp from the future or two seconds old is no tap', () => {
  assert.equal(hostSongTime({ songNow: 10, perfNow: 5000, at: 4900 }), 9.9);
  assert.equal(hostSongTime({ songNow: 10, perfNow: 5000, at: 5100 }), null);
  assert.equal(hostSongTime({ songNow: 10, perfNow: 5000, at: 2900 }), null);
});
