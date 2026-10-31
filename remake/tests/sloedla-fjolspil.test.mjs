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
import { createRemoteRound } from '../engine/sloedla/remote-round.js';
import { deviceOf } from '../engine/fjolspil/guest-sloedla.js';
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
  const alives = new Set();
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
    sendSong(n, body) { calls.push(['sendSong', n, body]); return true; },
    send(n, body) { calls.push(['send', n, body]); return true; },
    onAlive(fn) { alives.add(fn); return () => alives.delete(fn); },
  };
  const act = (n, body) => { for (const fn of alives) fn(seats.bySeat(n)); for (const fn of acts) fn(n, body); };
  const alive = n => { for (const fn of alives) fn(seats.bySeat(n)); };
  const join = (guestId, name, avatar) => { seats.join({ guestId, name, avatar }); lobby.refresh(); };
  return { doc, calls, seats, lobby, fjolspil, act, alive, join };
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

// ---- The guest's round: the notes and the clock from the big screen (remote-round.js) ------------------------------------

const START = { kind: 'start', song: { id: 'boogie', name: 'Boogie', bpm: 120, length: 90 }, lanes: ['b', 'a', 'c'], levels: { b: 'barn', a: 'barn', c: 'fullordinn' }, names: { b: 'Egill', a: 'Egill', c: 'Anna' }, mine: 'c' };
const SECTION_0 = { kind: 'notes', section: { index: 0, start: 0, variant: 'normal' }, list: [{ id: 3, t: 2, role: 'a' }, { id: 4, t: 2.5, role: 'c' }] };
const SECTION_1 = { kind: 'notes', section: { index: 1, start: 8, variant: 'big' }, list: [{ id: 9, t: 8.5, role: 'c' }, { id: 10, t: 9, role: 'b' }] };

test('remote round: notes fall in time order with the big screen\'s ids; played finds the guest\'s own', () => {
  const phone = createRemoteRound({ sync: createClockSync(), now: () => 0 });
  for (const body of [START, SECTION_0, SECTION_1]) phone.receive(body);
  assert.deepEqual(phone.conductor.chart.map(note => [note.t, note.role, note.section]), [[2.5, 'c', 0], [8.5, 'c', 1]]);
  assert.deepEqual(phone.receive({ kind: 'played', id: 9, role: 'c', result: 'hit', grade: 'great' }), { kind: 'played', index: 1, verdict: { kind: 'hit', grade: 'great' } });
  assert.equal(phone.receive({ kind: 'played', id: 10, role: 'b', result: 'miss', grade: null }), null); // not on her phone
  assert.deepEqual(phone.conductor.sectionAt(8.6), { index: 1, start: 8, variant: 'big' });
  assert.equal(phone.conductor.length, 90);
  // a tablet has every lane's notes, and every verdict
  const tablet = createRemoteRound({ sync: createClockSync(), now: () => 0, every: true });
  for (const body of [START, SECTION_0, SECTION_1]) tablet.receive(body);
  assert.deepEqual(tablet.conductor.chart.map(note => note.t), [2, 2.5, 8.5, 9]);
  assert.deepEqual(tablet.receive({ kind: 'played', id: 10, role: 'b', result: 'miss', grade: null }), { kind: 'played', index: 3, verdict: { kind: 'miss', grade: null } });
});

test('remote round: the guest\'s song time follows the anchors through the shared clock', () => {
  const sync = createClockSync();
  sync.receive({ sent: 0, host: 5010 }, 20); // the big screen's clock is 5000 ms ahead of hers
  let now = 4500;
  const round = createRemoteRound({ sync, now: () => now });
  round.receive(START);
  assert.equal(round.clock.time(), null); // no anchor yet: no song time
  round.receive({ kind: 'clock', at: 9000, song: 12 });
  assert.ok(Math.abs(round.clock.time() - 12.5) < 0.005);
  assert.ok(Math.abs(round.clock.timeAt(4400) - 12.4) < 0.005); // a tap's own stamp
  round.receive({ kind: 'clock', at: 11000, song: 14.01 }); // the newest anchor counts
  now = 6000;
  assert.ok(Math.abs(round.clock.time() - 14.01) < 0.005);
});

test('remote round: notes that come after their time keep the chart in order and throw nothing', () => {
  const round = createRemoteRound({ sync: createClockSync(), now: () => 0, every: true });
  round.receive(START);
  round.receive(SECTION_1);
  assert.doesNotThrow(() => {
    round.receive(SECTION_0); // late: earlier than the notes already falling
    round.receive(SECTION_1); // again
    round.receive({ kind: 'notes' });
    round.receive({ kind: 'notes', section: { index: 2 }, list: [{ id: 'x', t: 'soon', role: 'a' }, null] });
    round.receive(null);
    round.receive({ kind: 'played', id: 99, result: 'hit' });
  });
  assert.deepEqual(round.conductor.chart.map(note => note.t), [8.5, 9]);
  round.receive({ kind: 'notes', section: { index: 2, start: 16, variant: 'calm' }, list: [{ id: 12, t: 16.5, role: 'a' }, { id: 11, t: 16.2, role: 'b' }] });
  assert.deepEqual(round.conductor.chart.map(note => note.t), [8.5, 9, 16.2, 16.5]);
});

test('device: 390×844 is a phone, 1180×820 a tablet, ?taeki overrides', () => {
  assert.equal(deviceOf(390, 844), 'simi');
  assert.equal(deviceOf(844, 390), 'simi');
  assert.equal(deviceOf(1180, 820), 'spjald');
  assert.equal(deviceOf(390, 844, 'spjald'), 'spjald');
  assert.equal(deviceOf(1180, 820, 'simi'), 'simi');
  assert.equal(deviceOf(1180, 820, 'eitthvad'), 'spjald');
});

// ---- The round over the net: the big screen's side (fjolspil-song.js's round half) ----------------------------------------

/** The page's clock and timers, moved on by the test: intervals run at their times as `advance` passes them. */
function fakeTime(start = 10000) {
  let now = start;
  let next = 1;
  const intervals = new Map();
  return {
    perf: () => now,
    timers: {
      setInterval(fn, ms) { intervals.set(next, { fn, ms, at: now + ms }); return next++; },
      clearInterval(id) { intervals.delete(id); },
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...intervals.values()].filter(timer => timer.at <= end).sort((x, y) => x.at - y.at)[0];
        if (!due) break;
        now = due.at;
        due.at += due.ms;
        due.fn();
      }
      now = end;
    },
  };
}

const SONG = { id: 'boogie', name: 'Rokkhopp', bpm: 150, length: 90 };
const BOOGIE = { name: 'Rokkhopp', picture: 'assets/sloedla/valmynd/boogie.webp' };

/** Egill on Slóeðla (a grown-up), guests from their phones; the round's game and clock as fakes that keep what they are told. */
function bandRound(guests = [['g1', 'Anna', 'thorsedla']]) {
  const room = fakeRoom();
  const time = fakeTime();
  const host = createBandHost({ fjolspil: room.fjolspil, lobby: room.lobby, perf: time.perf, timers: time.timers });
  for (const [id, name, avatar] of guests) room.join(id, name, avatar);
  const lineup = lineupOf({ lanes: 3, mine: 'a', level: 'fullordinn', seats: room.seats.list() });
  const game = { taps: [], lineups: [], tap(lane, at) { this.taps.push([lane, at]); }, setLineup(next) { this.lineups.push(next); } };
  const clock = { time: () => 20 };
  host.ready('boogie');
  const begin = () => host.beginRound({ song: SONG, lineup, clock, level: 'fullordinn', game });
  const songs = n => room.calls.filter(([name, seatN]) => name === 'sendSong' && seatN === n).map(([, , body]) => body);
  return { room, time, host, game, begin, songs };
}

test('a guest\'s tap is judged on her own lane at its stamp', () => {
  const band = bandRound();
  band.begin();
  band.room.act(1, { type: 'tap', at: 9950 }); // 50 ms ago on the big screen's clock, the song now at 20 s
  assert.equal(band.game.taps.length, 1);
  const [lane, at] = band.game.taps[0];
  assert.equal(lane, 2, 'Þórseðla\'s lane');
  assert.ok(Math.abs(at - 19.95) < 1e-9);
});

test('a tap from the future or two seconds old is not judged', () => {
  const band = bandRound();
  band.room.act(1, { type: 'tap', at: 9990 }); // before the round
  band.begin();
  band.room.act(1, { type: 'tap', at: 10100 });
  band.room.act(1, { type: 'tap', at: 7000 });
  band.room.act(1, { type: 'tap', at: 'now' });
  assert.deepEqual(band.game.taps, []);
});

test('three silent seconds give her dinosaur to Egill at his level; heard again she learns she is in next time', () => {
  const band = bandRound();
  band.begin();
  band.time.advance(2500);
  band.room.alive(1); // her phone asked the time
  band.time.advance(2900);
  assert.deepEqual(band.game.lineups, [], '2.9 s quiet: still hers');
  band.time.advance(700);
  const egill = { role: 'c', player: 0, name: 'Egill', level: 'fullordinn', judged: 'here' };
  assert.deepEqual(band.game.lineups.at(-1)[2], egill);
  assert.deepEqual(band.host.lineup()[2], egill);
  band.room.alive(1);
  band.room.alive(1);
  const late = band.room.calls.filter(([name, n, body]) => name === 'send' && n === 1 && body.phase === 'late');
  assert.deepEqual(late, [['send', 1, { screen: 'sloedla', phase: 'late', song: BOOGIE }]], 'told once');
});

test('a decided section and every verdict reach every phone', () => {
  const band = bandRound([['g1', 'Anna', 'thorsedla'], ['g2', 'Bjarni', 'kambedla']]);
  assert.deepEqual(band.room.calls.find(([name]) => name === 'broadcast'), ['broadcast', { screen: 'sloedla', phase: 'ready', song: BOOGIE }]);
  band.host.decided([{ t: 2.4, role: 'a' }, { t: 2.8, role: 'c' }], { index: 0, start: 0, variant: 'normal', transpose: 0 }); // before the round
  band.begin();
  band.host.decided([{ t: 8.2, role: 'b' }, { t: 8.6, role: 'c' }], { index: 1, start: 8, variant: 'big', transpose: 0 });
  band.host.judged({ index: 3, lane: 2, role: 'c', kind: 'hit', grade: 'great' });
  for (const [n, mine] of [[1, 'c'], [2, 'b']]) {
    assert.deepEqual(band.songs(n), [
      { kind: 'start', song: SONG, lanes: ['b', 'a', 'c'], levels: { b: 'barn', a: 'fullordinn', c: 'barn' }, names: { b: 'Bjarni', a: 'Egill', c: 'Anna' }, mine },
      { kind: 'clock', at: 10000, song: 20 },
      { kind: 'notes', section: { index: 0, start: 0, variant: 'normal' }, list: [{ id: 0, t: 2.4, role: 'a' }, { id: 1, t: 2.8, role: 'c' }] },
      { kind: 'notes', section: { index: 1, start: 8, variant: 'big' }, list: [{ id: 2, t: 8.2, role: 'b' }, { id: 3, t: 8.6, role: 'c' }] },
      { kind: 'played', id: 3, role: 'c', result: 'hit', grade: 'great' },
    ]);
  }
  band.time.advance(2000);
  assert.deepEqual(band.songs(1).at(-1), { kind: 'clock', at: 12000, song: 20 }, 'an anchor every two seconds');
});

test('a tap from a guest whose dinosaur Egill took is not heard', () => {
  const band = bandRound();
  band.begin();
  band.room.seats.presence(1, false); // her phone stopped answering
  band.time.advance(600);
  assert.equal(band.host.lineup()[2].name, 'Egill');
  band.room.seats.presence(1, true);
  band.room.act(1, { type: 'tap', at: 10550 });
  assert.deepEqual(band.game.taps, []);
});

test('the end gives each guest the band\'s stars and her own line', () => {
  const band = bandRound([['g1', 'Anna', 'thorsedla'], ['g2', 'Bjarni', 'kambedla']]);
  band.begin();
  band.host.endRound({ stars: 4, players: [
    { player: 0, name: 'Egill', roles: ['a'], points: 2400, great: 9 },
    { player: 1, name: 'Anna', roles: ['c'], points: 1800, great: 6 },
    { player: 2, name: 'Bjarni', roles: ['b'], points: 900, great: 2 },
  ] });
  const ends = band.room.calls.filter(([name, , body]) => name === 'send' && body.phase === 'end');
  assert.deepEqual(ends, [
    ['send', 1, { screen: 'sloedla', phase: 'end', stars: 4, line: { name: 'Anna', roles: ['c'], points: 1800, great: 6 } }],
    ['send', 2, { screen: 'sloedla', phase: 'end', stars: 4, line: { name: 'Bjarni', roles: ['b'], points: 900, great: 2 } }],
  ]);
  const before = band.room.calls.length;
  band.time.advance(5000);
  assert.equal(band.room.calls.length, before, 'no anchors, no silence watch after the end');
});

test('a phone back mid-song with „Tilbúin!“ again gives her dinosaur to Egill and learns she is in next time', () => {
  const band = bandRound();
  band.room.act(1, { type: 'ready' }); // at „Spila!“, before the round: nothing
  band.begin();
  assert.equal(band.host.lineup()[2].name, 'Anna');
  band.room.act(1, { type: 'ready' }); // her page was reloaded: it has no song
  assert.equal(band.host.lineup()[2].name, 'Egill');
  assert.equal(band.game.lineups.length, 1);
  const late = band.room.calls.filter(([name, n, body]) => name === 'send' && n === 1 && body.phase === 'late');
  assert.deepEqual(late, [['send', 1, { screen: 'sloedla', phase: 'late', song: BOOGIE }]]);
});
