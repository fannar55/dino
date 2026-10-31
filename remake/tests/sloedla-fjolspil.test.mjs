// Söngur Slóeðlu in fjölspil (docs/superpowers/specs/2026-10-31-sloedla-fjolspil-design.md): up to three people play one song,
// Egill at the big screen and guests on phones or tablets, each on her own dinosaur and level, the big screen judging every tap.
// The owner's lean rule: a few tests of the fiddly parts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, REMOTE_GRACE } from '../engine/sloedla/chart.js';
import { canTwoLanes, groupsOf, laneRules, linesOf, lineupOf, lobbyOf, mineFor, takeOver } from '../engine/sloedla/lineup.js';
import { createClockSync, hostSongTime, songTimeAt } from '../engine/sloedla/clock-sync.js';
import { createSeats } from '../engine/fjolspil/seats.js';
import { createBandLobby } from '../engine/sloedla/band-lobby.js';
import { createBandHost } from '../engine/sloedla/fjolspil-song.js';
import { FakeDocument } from './fake-dom.mjs';
import { createRequire } from 'node:module';

globalThis.qrcode = createRequire(import.meta.url)('../vendor/qrcode-generator/qrcode.js'); // the QR card's encoder

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

// ---- „Spilum saman“: the band host in the menu (fjolspil-song.js) and the stage's QR card (band-lobby.js) ----------------

/** A room as the band host sees it (fjolspil.js's): real seats, every call kept, acts sent by the test. */
function fakeRoom() {
  const doc = new FakeDocument();
  doc.add('saman', 'section');
  const calls = [];
  const acts = new Set();
  const seats = createSeats();
  const lobby = createBandLobby(doc, {
    seats: { list: () => seats.list(), bySeat: n => seats.bySeat(n) },
    onStart: () => calls.push(['start']),
    onClose: () => calls.push(['close']),
  });
  const fjolspil = {
    seats,
    openLobby(options) {
      calls.push(['openLobby', options]);
      lobby.show({ joinUrl: 'http://192.168.1.5:4231/remake/spil.html', code: 'GULL', lanMissing: false });
      return new Promise(resolve => { fjolspil.finish = resolve; });
    },
    setLobby(change) { calls.push(['setLobby', change]); lobby.refresh(); },
    onAct(fn) { acts.add(fn); return () => acts.delete(fn); },
    broadcast(body) { calls.push(['broadcast', body]); },
    closeGame() { calls.push(['closeGame']); },
  };
  const act = (n, body) => { for (const fn of acts) fn(n, body); };
  const join = (guestId, name, avatar) => { seats.join({ guestId, name, avatar }); lobby.refresh(); };
  return { doc, calls, seats, lobby, fjolspil, act, join };
}

test('the song lobby offers the free dinosaurs, asks a level and closes at three', () => {
  const room = fakeRoom();
  const host = createBandHost({ fjolspil: room.fjolspil, lobby: room.lobby });
  host.open({ lanes: 3, mine: 'a', level: 'barn' });
  const [name, options] = room.calls[0];
  assert.equal(name, 'openLobby');
  assert.deepEqual(options.offer, ['kambedla', 'thorsedla']);
  assert.equal(options.max, 3);
  assert.equal(options.ask, 'level');
  assert.deepEqual(options.note, { text: 'Egill velur lag…' });
  const card = room.doc.getElementById('saman');
  assert.equal(card.hidden, false, 'the QR card is on the stage');
  assert.equal(card.querySelectorAll('.sl-saman-letter').map(el => el.textContent).join(''), 'GULL');
  host.update({ lanes: 2, mine: 'a', level: 'barn', song: 'pixel' });
  const [, change] = room.calls.at(-1);
  assert.deepEqual([change.offer, change.max], [['thorsedla'], 2]);
  assert.deepEqual(change.note, { text: 'Pixlaferð', picture: 'assets/sloedla/valmynd/pixel.webp' });
});

test('a guest\'s level act sets her seat\'s level', () => {
  const room = fakeRoom();
  createBandHost({ fjolspil: room.fjolspil, lobby: room.lobby }).open({ lanes: 3, mine: 'a', level: 'barn' });
  room.join('g1', 'Anna', 'thorsedla');
  room.act(1, { type: 'level', level: 'fullordinn' });
  assert.equal(room.seats.bySeat(1).level, 'fullordinn');
  room.act(1, { type: 'level', level: 'meistari' });
  assert.equal(room.seats.bySeat(1).level, 'fullordinn', 'a level the song has not is not taken');
});

test('a new guest is told once', () => {
  const room = fakeRoom();
  const joined = [];
  const seen = [];
  const host = createBandHost({ fjolspil: room.fjolspil, lobby: room.lobby, onJoin: seat => joined.push(seat.name), onSeats: list => seen.push(list.length) });
  host.open({ lanes: 3, mine: 'a', level: 'barn' });
  room.join('g1', 'Anna', 'thorsedla');
  room.act(1, { type: 'level', level: 'barn' });
  room.join('g2', 'Bjarni', 'kambedla');
  assert.deepEqual(joined, ['Anna', 'Bjarni']);
  assert.equal(seen.at(-1), 3, 'the seats as they are now: Egill, Anna and Bjarni');
});

test('Spila einn tells every phone thanks for playing', async () => {
  const room = fakeRoom();
  const host = createBandHost({ fjolspil: room.fjolspil, lobby: room.lobby });
  const seated = host.open({ lanes: 3, mine: 'a', level: 'barn' });
  room.fjolspil.finish(null); // the room's lobby ends at „Spila einn“ (fjolspil.js's onClose)
  host.close();
  assert.ok(room.calls.some(([name]) => name === 'close'), 'the lobby is closed');
  assert.deepEqual(room.calls.at(-1), ['broadcast', { screen: 'sloedla', phase: 'bless' }]);
  assert.equal(room.doc.getElementById('saman').hidden, true, 'the QR card leaves the stage');
  assert.equal(await seated, null);
});
