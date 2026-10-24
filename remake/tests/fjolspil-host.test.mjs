// remake/tests/fjolspil-host.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { FakeDocument, pointerEvent } from './fake-dom.mjs';
import { createFjolspil } from '../engine/fjolspil/fjolspil.js';
import { COVER_AFTER_MS, CODE_ALPHABET } from '../engine/fjolspil/protocol.js';
import { qrSvg } from '../engine/fjolspil/qr.js';

globalThis.qrcode = createRequire(import.meta.url)('../vendor/qrcode-generator/qrcode.js');

const THORSEDLA = { name: 'Þórseðla', avatar: 'thorsedla', add: 'Bæta við Þórseðlu', remove: 'Taka Þórseðlu út' };
const KAMBEDLA = { name: 'Kambeðla', avatar: 'kambedla', add: 'Bæta við Kambeðlu', remove: 'Taka Kambeðlu út' };
const LAN = 'http://192.168.1.10:4198';
const SPIL = `${LAN}/remake/spil.html`;

/** The host net as fjolspil.js sees it (net.js's createHostNet), with helpers that say what the meeting point would. */
function fakeNets() {
  const made = [];
  function create(options) {
    const on = { join: new Set(), leave: new Set(), message: new Set(), presence: new Set(), status: new Set(), welcome: new Set() };
    const add = (set, fn) => { set.add(fn); return () => { set.delete(fn); }; };
    const emit = (set, ...args) => { for (const fn of [...set]) fn(...args); };
    const guests = new Set();
    const sent = new Map(); // id -> every message that reached that guest, in order
    const net = {
      options, sent, closed: false, status: 'connecting', reconnects: 0,
      reconnect() { net.reconnects += 1; },
      onJoin: fn => add(on.join, fn),
      onLeave: fn => add(on.leave, fn),
      onMessage: fn => add(on.message, fn),
      onPresence: fn => add(on.presence, fn),
      onWelcome: fn => add(on.welcome, fn),
      onStatus(fn) { const off = add(on.status, fn); fn(net.status); return off; },
      send(id, msg) {
        if (net.closed || !guests.has(id)) return false;
        if (!sent.has(id)) sent.set(id, []);
        sent.get(id).push(msg);
        return true;
      },
      broadcast(msg) { for (const id of guests) net.send(id, msg); },
      transportOf: id => (guests.has(id) ? 'relay' : null),
      close() { if (net.closed) return; net.closed = true; net.setStatus('closed'); },
      // what the meeting point and the guests' phones say
      setStatus(status) { net.status = status; emit(on.status, status); },
      welcome(join = [], code = null) { emit(on.welcome, { code, join }); net.setStatus('connected'); },
      joined(id) { guests.add(id); emit(on.join, id); },
      left(id) { guests.delete(id); emit(on.leave, id); },
      presence(id, present) { emit(on.presence, id, present); },
      hello(id, name, avatar) { emit(on.message, id, { v: 1, type: 'hello', body: { name, avatar } }); },
      act(id, body) { emit(on.message, id, { v: 1, type: 'act', body }); },
      to: id => sent.get(id) ?? [],
      last: id => net.to(id).at(-1),
    };
    made.push(net);
    return net;
  }
  return { made, create };
}

function fakeTimers() {
  let now = 0;
  let next = 1;
  const queue = new Map(); // id -> { at, fn }
  return {
    setTimeout(fn, ms) { queue.set(next, { at: now + ms, fn }); return next++; },
    clearTimeout(id) { queue.delete(id); },
    advance(ms) {
      now += ms;
      for (const [id, timer] of [...queue].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at > now || !queue.has(id)) continue;
        queue.delete(id);
        timer.fn();
      }
    },
  };
}

function fakeStorage() {
  const items = new Map();
  return { items, getItem: key => items.get(key) ?? null, setItem: (key, value) => { items.set(key, String(value)); } };
}

/** A random that walks through the code's letters, so every code it makes is new. */
function stepping() {
  let n = 0;
  return () => ((n++ % CODE_ALPHABET.length) + 0.5) / CODE_ALPHABET.length;
}

function rig({ origin = `${LAN}`, search = '?play=1', storage = fakeStorage(), random = stepping(), now } = {}) {
  const doc = new FakeDocument(['fjolspil']);
  const location = new URL(`${origin}/remake/${search}`);
  const listeners = {}; // the window's, by event type
  const win = { location, addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } };
  const fire = type => { for (const fn of listeners[type] ?? []) fn(new Event(type)); };
  const nets = fakeNets();
  const timers = fakeTimers();
  const sfx = [];
  const fjolspil = createFjolspil(doc, { win, storage, random, timers, now, net: nets.create, audio: { sfx: name => sfx.push(name) } });
  const root = doc.getElementById('fjolspil');
  return { doc, win, storage, nets, timers, sfx, fjolspil, root, fire, net: () => nets.made.at(-1) };
}

const $ = (root, selector) => root.querySelector(selector);
const $$ = (root, selector) => root.querySelectorAll(selector);
const tap = el => { // a finger down and up where it landed, as book/fx.js's pressable counts a tap
  el.dispatchEvent(pointerEvent('pointerdown', { x: 10, y: 10 }));
  el.dispatchEvent(pointerEvent('pointerup', { x: 10, y: 10 }));
};
const views = (net, id) => net.to(id).filter(msg => msg.type === 'view');
const seqs = (net, id) => views(net, id).map(msg => msg.seq);
const rising = list => list.every((seq, index) => index === 0 || seq > list[index - 1]);

/** A lobby open with these guests seated in order ([guestId, name, avatar]); returns the lobby's promise too. */
function seated(r, guests, { ai = THORSEDLA } = {}) {
  const started = r.fjolspil.openLobby({ game: 'hals', ai });
  const net = r.net();
  net.welcome();
  for (const [id, name, avatar] of guests) {
    net.joined(id);
    net.hello(id, name, avatar);
  }
  return { started, net };
}

test('the first lobby opens a room with a code and a key kept for a reload', () => {
  const r = rig();
  assert.equal(r.fjolspil.active, false);
  assert.equal(r.nets.made.length, 0, 'no room until a lobby is asked for');
  r.fjolspil.openLobby({ game: 'hals', ai: THORSEDLA });
  assert.equal(r.nets.made.length, 1);
  const kept = JSON.parse(r.storage.getItem('mosi-fjolspil-host'));
  assert.match(kept.code, /^[A-Z]{4}$/);
  assert.match(kept.key, /^[0-9a-f]{32}$/);
  const { options } = r.net();
  assert.ok(options.url.includes(`/fjolspil/ws/${kept.code}?role=host&key=${kept.key}`), options.url);
  assert.ok(options.url.startsWith('ws://192.168.1.10:4198/'));
  assert.deepEqual(options.iceServers, []);
  assert.equal(options.forceRelay, false);
  assert.equal(r.fjolspil.active, true);
  assert.equal(r.fjolspil.code, kept.code);
  assert.equal(r.root.hidden, false);
  assert.deepEqual([...$$(r.root, '.fjolspil-letter')].map(el => el.textContent), [...kept.code]);

  const again = rig({ storage: r.storage }); // the page reloaded: the same room
  again.fjolspil.openLobby({ game: 'hals', ai: THORSEDLA });
  assert.equal(again.net().options.url, options.url);
  assert.equal(again.fjolspil.code, kept.code);
});

test('a code another host has is swapped for a new one, with the same key', () => {
  const r = rig();
  r.fjolspil.openLobby({ game: 'hals', ai: THORSEDLA });
  const first = r.net();
  const { code, key } = JSON.parse(r.storage.getItem('mosi-fjolspil-host'));
  first.setStatus('taken');
  assert.equal(first.closed, true);
  assert.equal(r.nets.made.length, 2);
  const kept = JSON.parse(r.storage.getItem('mosi-fjolspil-host'));
  assert.notEqual(kept.code, code);
  assert.equal(kept.key, key);
  assert.ok(r.net().options.url.includes(`/fjolspil/ws/${kept.code}?role=host&key=${key}`));
  assert.equal(r.fjolspil.code, kept.code);
  assert.deepEqual([...$$(r.root, '.fjolspil-letter')].map(el => el.textContent), [...kept.code], 'the lobby shows the new code');
});

test('?relay=1 sends everything through the meeting point, and https asks a STUN server', () => {
  const r = rig({ origin: 'https://mosi.example', search: '?play=1&relay=1' });
  r.fjolspil.openLobby({ game: 'hals', ai: THORSEDLA });
  assert.equal(r.net().options.forceRelay, true);
  assert.deepEqual(r.net().options.iceServers, [{ urls: 'stun:stun.cloudflare.com:3478' }]);
  assert.ok(r.net().options.url.startsWith('wss://mosi.example/fjolspil/ws/'));
});

test('a guest is shown the lobby on arrival, seated on hello, and everyone sees the new seat', () => {
  const r = rig();
  r.fjolspil.openLobby({ game: 'hals', ai: THORSEDLA });
  const net = r.net();
  net.welcome();
  net.joined('g1');
  assert.equal(net.to('g1').length, 1);
  const first = net.to('g1')[0];
  assert.equal(first.type, 'view');
  assert.equal(first.body.screen, 'lobby');
  assert.equal(first.body.you, null);
  assert.deepEqual(first.body.seats.map(seat => seat.name), ['Egill']);
  assert.ok(!first.body.available.includes('thorsedla'), 'the game\'s character is not on offer');
  assert.deepEqual(first.body.available, ['kambedla', 'sloedla', 'gramedla', 'flugedla', 'uggedla']);
  net.joined('g2');

  net.hello('g1', 'Anna', 'kambedla');
  const [, seat, lobby] = net.to('g1');
  assert.deepEqual(seat, { v: 1, type: 'seat', body: { ok: true, seat: 1, name: 'Anna' } });
  assert.equal(lobby.type, 'view');
  assert.equal(lobby.seq, first.seq + 1);
  assert.equal(lobby.body.screen, 'lobby');
  assert.equal(lobby.body.you, 1);
  assert.deepEqual(lobby.body.seats.map(entry => [entry.seat, entry.name, entry.avatar, entry.present]), [[0, 'Egill', 'egill', true], [1, 'Anna', 'kambedla', true]]);
  assert.ok(lobby.body.seats.every(entry => !('guestId' in entry)), 'a guest never sees another\'s id');
  const other = net.last('g2'); // g2, still choosing, sees Anna and her avatar gone
  assert.equal(other.body.screen, 'lobby');
  assert.equal(other.body.you, null);
  assert.deepEqual(other.body.seats.map(entry => entry.name), ['Egill', 'Anna']);
  assert.ok(!other.body.available.includes('kambedla'));
  assert.deepEqual([...$$(r.root, '.fjolspil-seat')].map(el => el.getAttribute('data-state')), ['host', 'taken', 'empty', 'empty']);
  assert.deepEqual(r.sfx, ['tap'], 'the new seat sparkles with the tap');

  net.hello('g2', 'Bjarni', 'kambedla'); // too slow
  assert.deepEqual(net.last('g2'), { v: 1, type: 'seat', body: { ok: false, reason: 'avatar-taken' } });
  assert.equal(r.fjolspil.seats.count, 2);
});

test('a hello between games gives a seat and the closed screen', async () => {
  const r = rig();
  const started = r.fjolspil.openLobby({ game: 'hals', ai: THORSEDLA });
  const net = r.net();
  net.welcome();
  tap($(r.root, '.fjolspil-close'));
  assert.equal(await started, null);
  net.joined('g1');
  net.hello('g1', 'Anna', 'kambedla');
  const [seat, closed] = net.to('g1').slice(-2);
  assert.deepEqual(seat, { v: 1, type: 'seat', body: { ok: true, seat: 1, name: 'Anna' } });
  assert.equal(closed.type, 'view');
  assert.deepEqual(closed.body, { screen: 'closed' });
  assert.equal(r.fjolspil.seats.byGuest('g1').seat, 1, 'the seat is hers for the next game');
  assert.ok(rising(seqs(net, 'g1')));
});

test('Byrjum! resolves with the seats, dropping guests that left the lobby', async () => {
  const r = rig();
  const { started, net } = seated(r, [['g1', 'Anna', 'kambedla'], ['g2', 'Bjarni', 'sloedla']]);
  net.presence('g1', false);
  assert.equal(r.fjolspil.seats.bySeat(1).present, false);
  assert.equal($$(r.root, '.fjolspil-seat')[1].getAttribute('data-state'), 'absent');
  tap($(r.root, '.fjolspil-start'));
  const { seats } = await started;
  assert.equal(seats.length, 2);
  assert.deepEqual(seats.map(seat => [seat.seat, seat.name, seat.guestId]), [[0, 'Egill', null], [1, 'Bjarni', 'g2']]);
  assert.equal(r.fjolspil.seats.count, 2);
  assert.equal(r.fjolspil.seats.byGuest('g1'), null);
  assert.equal(r.root.hidden, true, 'the lobby is gone');
});

test('acts come only from present remote seats, and views carry rising seqs', async () => {
  const r = rig();
  const { started, net } = seated(r, [['g1', 'Anna', 'kambedla']]);
  tap($(r.root, '.fjolspil-start'));
  await started;
  const acts = [];
  const off = r.fjolspil.onAct((seat, act) => acts.push([seat, act]));
  net.act('g1', { type: 'roll' });
  assert.deepEqual(acts, [[1, { type: 'roll' }]]);
  net.presence('g1', false);
  net.act('g1', { type: 'roll' });
  assert.equal(acts.length, 1, 'an absent seat is not heard');
  net.presence('g1', true);
  r.fjolspil.seats.cover(1);
  net.act('g1', { type: 'roll' });
  assert.equal(acts.length, 1, 'a covered seat is the computer\'s');
  r.fjolspil.seats.uncover(1);
  net.act('g9', { type: 'roll' }); // nobody's seat
  assert.equal(acts.length, 1);
  net.act('g1', { type: 'pass' });
  assert.deepEqual(acts[1], [1, { type: 'pass' }]);
  off();
  net.act('g1', { type: 'roll' });
  assert.equal(acts.length, 2);

  const before = seqs(net, 'g1').at(-1); // the lobby's views counted for this seat already
  r.fjolspil.send(1, { screen: 'hals', turn: 0 });
  r.fjolspil.send(1, { screen: 'hals', turn: 1 });
  const [a, b] = views(net, 'g1').slice(-2);
  assert.deepEqual([a.seq, b.seq], [before + 1, before + 2]);
  assert.deepEqual(a, { v: 1, type: 'view', seq: before + 1, body: { screen: 'hals', turn: 0 } });
  assert.deepEqual(b.body, { screen: 'hals', turn: 1 });
  assert.ok(rising(seqs(net, 'g1')));
  assert.equal(r.fjolspil.send(0, { screen: 'hals' }), false, 'Egill has no phone');

  r.fjolspil.broadcast({ screen: 'over', winner: { name: 'Anna', avatar: 'kambedla' } });
  assert.deepEqual(net.last('g1').body, { screen: 'over', winner: { name: 'Anna', avatar: 'kambedla' } });
  r.fjolspil.closeGame();
  assert.deepEqual(net.last('g1').body, { screen: 'closed' });
  assert.ok(rising(seqs(net, 'g1')));
});

test('waitFor resolves back when the guest returns, and cover when the button is pressed', async () => {
  const r = rig();
  const { started, net } = seated(r, [['g1', 'Anna', 'kambedla']]);
  tap($(r.root, '.fjolspil-start'));
  await started;

  net.presence('g1', false);
  const back = r.fjolspil.waitFor(1);
  assert.equal(r.fjolspil.waitFor(1), back, 'one wait at a time');
  assert.equal(r.root.hidden, false);
  assert.equal($(r.root, '.fjolspil-wait-words').textContent, 'Bíðum eftir Anna…');
  assert.deepEqual([...$(r.root, '.fjolspil-wait').querySelectorAll('.fjolspil-letter')].map(el => el.textContent), [...r.fjolspil.code]);
  net.presence('g1', true);
  assert.equal(await back, 'back');
  assert.equal($(r.root, '.fjolspil-wait'), null, 'the waiting card is gone');

  net.presence('g1', false);
  const cover = r.fjolspil.waitFor(1);
  assert.equal($(r.root, '.fjolspil-continue'), null);
  r.timers.advance(COVER_AFTER_MS);
  tap($(r.root, '.fjolspil-continue'));
  assert.equal(await cover, 'cover');
  assert.equal(r.fjolspil.seats.bySeat(1).kind, 'ai');
  assert.equal(r.fjolspil.seats.bySeat(1).covered, true);
  assert.equal($(r.root, '.fjolspil-wait'), null);

  const again = r.fjolspil.waitFor(1); // her next turn, still away, the computer playing it
  net.left('g1');
  net.joined('g1'); // her phone woke up
  assert.equal(await again, 'back');
  assert.equal(r.fjolspil.seats.bySeat(1).kind, 'remote', 'she plays her seat again');
  assert.equal(await r.fjolspil.waitFor(1), 'back', 'a guest who is there is not waited for');
});

test('the join address is the page\'s own unless the page is on loopback', () => {
  const lan = rig({ origin: LAN });
  lan.fjolspil.openLobby({ game: 'hals', ai: THORSEDLA });
  assert.equal(lan.fjolspil.joinUrl, SPIL);
  assert.equal($(lan.root, '.fjolspil-qr').innerHTML, qrSvg(`${SPIL}?r=${lan.fjolspil.code}`));
  lan.net().welcome(['http://10.0.0.5:4198/remake/spil.html']);
  assert.equal(lan.fjolspil.joinUrl, SPIL, 'a page reached on the LAN keeps its own address');
  assert.equal($(lan.root, '.fjolspil-note').hidden, true);

  const home = rig({ origin: 'http://127.0.0.1:4198' });
  home.fjolspil.openLobby({ game: 'hals', ai: THORSEDLA });
  home.net().welcome([SPIL, 'http://10.0.0.5:4198/remake/spil.html']);
  assert.equal(home.fjolspil.joinUrl, SPIL);
  assert.equal($(home.root, '.fjolspil-qr').innerHTML, qrSvg(`${SPIL}?r=${home.fjolspil.code}`));
  assert.equal($(home.root, '.fjolspil-note').hidden, true);

  const alone = rig({ origin: 'http://localhost:4198' });
  alone.fjolspil.openLobby({ game: 'hals', ai: THORSEDLA });
  alone.net().welcome([]);
  assert.equal(alone.fjolspil.joinUrl, 'http://localhost:4198/remake/spil.html', 'this PC can still join itself');
  assert.equal($(alone.root, '.fjolspil-note').hidden, false, 'the lobby says --lan is missing');
});

test('a phone that comes back to its seat is sent its newest view, never the join screen', async () => {
  const r = rig();
  const { started, net } = seated(r, [['g1', 'Anna', 'kambedla']]);
  net.left('g1');
  assert.equal(r.fjolspil.seats.bySeat(1).present, false);
  net.joined('g1'); // back in the lobby
  assert.equal(r.fjolspil.seats.bySeat(1).present, true);
  assert.equal(net.last('g1').body.screen, 'lobby');
  assert.equal(net.last('g1').body.you, 1);
  tap($(r.root, '.fjolspil-start'));
  await started;

  r.fjolspil.send(1, { screen: 'hals', turn: 1 });
  const seq = net.last('g1').seq;
  net.presence('g1', false);
  net.joined('g1'); // the phone woke up and reconnected
  assert.equal(r.fjolspil.seats.byGuest('g1').seat, 1, 'her seat is kept');
  assert.equal(r.fjolspil.seats.bySeat(1).present, true);
  assert.equal(net.last('g1').type, 'view');
  assert.deepEqual(net.last('g1').body, { screen: 'hals', turn: 1 });
  assert.ok(net.last('g1').seq > seq);
  net.hello('g1', 'Anna', 'kambedla'); // and says hello again, as it does after every reconnect
  assert.deepEqual(net.to('g1').at(-2), { v: 1, type: 'seat', body: { ok: true, seat: 1, name: 'Anna' } });
  assert.deepEqual(net.last('g1').body, { screen: 'hals', turn: 1 });

  r.fjolspil.closeGame();
  net.joined('g1');
  assert.deepEqual(net.last('g1').body, { screen: 'closed' }, 'between games');
  assert.ok(rising(seqs(net, 'g1')));
});

test('taking the computer player out sends every guest the lobby again, with its new seat', () => {
  const r = rig();
  r.fjolspil.openLobby({ game: 'hals', ai: THORSEDLA });
  const net = r.net();
  net.welcome();
  tap($(r.root, '.fjolspil-ai'));
  assert.deepEqual(r.fjolspil.seats.list().map(seat => [seat.name, seat.kind]), [['Egill', 'host'], ['Þórseðla', 'ai']]);
  assert.equal($(r.root, '.fjolspil-ai').textContent, 'Taka Þórseðlu út');
  net.joined('g1');
  net.hello('g1', 'Anna', 'kambedla');
  assert.equal(net.last('g1').body.you, 2);
  net.joined('g2'); // still choosing
  tap($(r.root, '.fjolspil-ai'));
  assert.equal(r.fjolspil.seats.byGuest('g1').seat, 1);
  assert.equal(net.last('g1').body.screen, 'lobby');
  assert.equal(net.last('g1').body.you, 1, 'her seat moved up');
  assert.deepEqual(net.last('g1').body.seats.map(seat => seat.name), ['Egill', 'Anna']);
  assert.deepEqual(net.last('g2').body.seats.map(seat => seat.name), ['Egill', 'Anna']);
  assert.equal(net.last('g2').body.you, null);
  assert.deepEqual([...$$(r.root, '.fjolspil-seat')].map(el => el.getAttribute('data-state')), ['host', 'taken', 'empty', 'empty']);
  assert.equal($(r.root, '.fjolspil-ai').textContent, 'Bæta við Þórseðlu');
});

test('the room and the seats outlive a game: the next lobby shows who is there', async () => {
  const r = rig();
  const first = seated(r, [['g1', 'Anna', 'kambedla'], ['g2', 'Bjarni', 'sloedla']]);
  tap($(r.root, '.fjolspil-ai')); // Þórseðla too
  tap($(r.root, '.fjolspil-start'));
  await first.started;
  const net = first.net;
  net.presence('g2', false);
  r.fjolspil.seats.cover(2); // Bjarni went away and the computer finished his game
  net.presence('g2', true);
  r.fjolspil.closeGame();

  const next = r.fjolspil.openLobby({ game: 'eitt', ai: KAMBEDLA });
  assert.equal(r.nets.made.length, 1, 'the same room');
  assert.deepEqual(r.fjolspil.seats.list().map(seat => [seat.name, seat.kind]), [['Egill', 'host'], ['Anna', 'remote'], ['Bjarni', 'remote']],
    'Bjarni plays his seat again, and Háls og hali\'s character has left the table');
  assert.equal(net.last('g1').body.screen, 'lobby', 'the phones see the next lobby by themselves');
  assert.equal(net.last('g1').body.you, 1);
  assert.equal(net.last('g2').body.you, 2);
  assert.equal($(r.root, '.fjolspil-ai').hidden, true, 'Anna has Kambeðla already, so the game\'s Kambeðla does not come');
  assert.ok(!net.last('g1').body.available.includes('kambedla'));
  assert.ok(net.last('g1').body.available.includes('thorsedla'), 'Þórseðla is free again');
  tap($(r.root, '.fjolspil-start'));
  assert.equal((await next).seats.length, 3);
});

test('another tab taking the room ends the session here', async () => {
  const r = rig();
  const started = r.fjolspil.openLobby({ game: 'hals', ai: THORSEDLA });
  r.net().welcome();
  r.net().setStatus('replaced');
  assert.equal(await started, null);
  assert.equal(r.root.hidden, true);
  assert.equal(r.fjolspil.active, false);
  assert.equal(await r.fjolspil.openLobby({ game: 'hals', ai: THORSEDLA }), null);
  assert.equal(r.nets.made.length, 1, 'and does not take it back');
});

test('a kept game seats its guests again without the lobby', async () => {
  const r = rig();
  const kept = {
    max: 4, reserved: ['thorsedla'],
    seats: [
      { seat: 0, name: 'Egill', avatar: 'egill', kind: 'host', guestId: null, present: true, covered: false },
      { seat: 1, name: 'Anna', avatar: 'kambedla', kind: 'remote', guestId: 'g1', present: true, covered: false },
      { seat: 2, name: 'Þórseðla', avatar: 'thorsedla', kind: 'ai', guestId: null, present: true, covered: false },
    ],
  };
  await r.fjolspil.resume(kept);
  assert.equal(r.fjolspil.active, true);
  assert.equal(r.nets.made.length, 1);
  assert.equal(r.root.hidden, true, 'no lobby');
  assert.deepEqual(r.fjolspil.seats.list().map(seat => [seat.name, seat.present]), [['Egill', true], ['Anna', false], ['Þórseðla', true]]);
  const net = r.net();
  net.welcome();
  net.joined('g1');
  assert.equal(r.fjolspil.seats.bySeat(1).present, true);
  assert.deepEqual(net.last('g1').body, { screen: 'closed' }, 'until the game sends its view');
  r.fjolspil.send(1, { screen: 'hals', turn: 2 });
  assert.deepEqual(net.last('g1').body, { screen: 'hals', turn: 2 });
});

test('a guest dropped at Byrjum! whose phone stays connected is told she has no seat', async () => {
  const r = rig();
  const { started, net } = seated(r, [['g1', 'Anna', 'kambedla'], ['g2', 'Bjarni', 'sloedla']]);
  net.presence('g1', false); // her pings went unanswered, and her socket is still open
  const bjarni = net.to('g2').length;
  tap($(r.root, '.fjolspil-start'));
  await started;
  assert.equal(r.fjolspil.seats.byGuest('g1'), null);
  const told = net.last('g1');
  assert.equal(told.type, 'view');
  assert.equal(told.body.screen, 'lobby');
  assert.equal(told.body.you, null, 'no seat: her phone goes back to the join screen');
  assert.deepEqual(told.body.seats.map(seat => seat.name), ['Egill', 'Bjarni']);
  assert.equal(net.to('g2').length, bjarni, 'a guest who plays is sent nothing by the lobby');

  net.presence('g1', true); // her pongs come again
  assert.ok(net.last('g1').seq > told.seq);
  assert.equal(net.last('g1').body.screen, 'lobby');
  assert.equal(net.last('g1').body.you, null);
  net.hello('g1', 'Anna', 'kambedla');
  assert.deepEqual(net.to('g1').at(-2), { v: 1, type: 'seat', body: { ok: true, seat: 2, name: 'Anna' } });
  assert.deepEqual(net.last('g1').body, { screen: 'closed' }, 'she plays the next game');
  assert.ok(rising(seqs(net, 'g1')));
});

test('one wait at a time: a wait for another seat is refused while one is on', async () => {
  const r = rig();
  const { started, net } = seated(r, [['g1', 'Anna', 'kambedla'], ['g2', 'Bjarni', 'sloedla']]);
  tap($(r.root, '.fjolspil-start'));
  await started;
  net.presence('g1', false);
  net.presence('g2', false);
  const anna = r.fjolspil.waitFor(1);
  assert.equal(r.fjolspil.waitFor(1), anna, 'the same seat: the same wait');
  await assert.rejects(r.fjolspil.waitFor(2), { message: 'a wait is pending for seat 1' });
  assert.equal($(r.root, '.fjolspil-wait-words').textContent, 'Bíðum eftir Anna…', 'the first wait goes on');
  assert.equal(r.fjolspil.seats.bySeat(2).covered, false, 'nobody is covered by it');
  net.presence('g1', true);
  assert.equal(await anna, 'back');
});

test('closing the game, or another tab taking the room, ends a wait with closed', async () => {
  const r = rig();
  const { started, net } = seated(r, [['g1', 'Anna', 'kambedla']]);
  tap($(r.root, '.fjolspil-start'));
  await started;
  net.presence('g1', false);
  const closing = r.fjolspil.waitFor(1);
  r.fjolspil.closeGame();
  assert.equal(await closing, 'closed');
  assert.equal($(r.root, '.fjolspil-wait'), null, 'the waiting card is gone');
  assert.equal(r.root.hidden, true);
  assert.equal(r.fjolspil.seats.bySeat(1).covered, false);

  const replaced = r.fjolspil.waitFor(1);
  assert.notEqual(replaced, closing, 'a new wait');
  net.setStatus('replaced');
  assert.equal(await replaced, 'closed');
  assert.equal($(r.root, '.fjolspil-wait'), null);
  assert.equal(r.root.hidden, true);
});

test('a phone at a full table is told so and stays in the room, and a seated guest whose phone slept keeps her seat', async () => {
  const r = rig();
  const { started, net } = seated(r, [['g1', 'Anna', 'kambedla'], ['g2', 'Bjarni', 'sloedla'], ['g3', 'Dóra', 'gramedla']]);
  tap($(r.root, '.fjolspil-start'));
  await started;
  r.fjolspil.send(1, { screen: 'hals', turn: 1 });
  net.joined('g4'); // a fifth phone: the room holds more phones than the table has seats
  net.hello('g4', 'Siggi', 'flugedla');
  assert.deepEqual(net.last('g4'), { v: 1, type: 'seat', body: { ok: false, reason: 'full' } }, 'her phone says "Borðið er fullt (4)"');
  assert.equal(r.fjolspil.seats.byGuest('g4'), null);
  assert.equal(net.closed, false, 'nothing is closed');

  net.left('g1'); // Anna's phone sleeps, and its socket closes
  assert.equal(r.fjolspil.seats.bySeat(1).present, false);
  net.hello('g4', 'Siggi', 'flugedla'); // the fifth phone tries again
  assert.deepEqual(net.last('g4').body, { ok: false, reason: 'full' }, 'Anna\'s seat is not free: it waits for her');
  assert.equal(r.fjolspil.seats.count, 4);
  net.joined('g1'); // her phone is back
  assert.deepEqual(net.to('g1').slice(-2).map(msg => msg.type), ['seat', 'view']);
  assert.deepEqual(net.to('g1').at(-2).body, { ok: true, seat: 1, name: 'Anna' });
  assert.deepEqual(net.last('g1').body, { screen: 'hals', turn: 1 });
  assert.equal(r.fjolspil.seats.bySeat(1).present, true);

  r.fjolspil.closeGame();
  r.fjolspil.openLobby({ game: 'hals', ai: THORSEDLA });
  assert.equal(net.last('g4').body.screen, 'lobby', 'the fifth phone is still in the room: the next lobby reaches it');
  assert.equal(net.last('g4').body.you, null);
});

test('a page\'s views count from its clock, so a reloaded big screen\'s are newer than the old page\'s on every phone', async () => {
  let time = 1_000_000;
  const first = rig({ now: () => time });
  const one = seated(first, [['g1', 'Anna', 'kambedla']]);
  const seq = views(one.net, 'g1')[0].seq;
  assert.ok(seq >= 1_000_000, `the first view to a guest counts from the page's clock (${seq})`);
  for (let n = 0; n < 5; n++) first.fjolspil.send(1, { screen: 'hals', turn: n });
  const old = one.net.last('g1').seq;

  time += 2000; // the big screen reloads two seconds on, in the same tab: the same room, and a phone that never heard host-gone
  const again = rig({ now: () => time, storage: first.storage });
  const two = seated(again, [['g1', 'Anna', 'kambedla']]);
  assert.equal(again.fjolspil.code, first.fjolspil.code, 'the same room');
  assert.ok(views(two.net, 'g1')[0].seq > old, 'its first view is newer than the old page\'s last');
  assert.ok(rising(seqs(two.net, 'g1')));

  const real = rig(); // and the page's own clock by default
  const before = Date.now();
  const three = seated(real, [['g1', 'Anna', 'kambedla']]);
  assert.ok(views(three.net, 'g1')[0].seq >= before);
});

test('a fresh page of a seated guest is told her seat, as a hello is answered, before her newest view', async () => {
  const r = rig();
  const { started, net } = seated(r, [['g1', 'Anna', 'kambedla']]);
  tap($(r.root, '.fjolspil-start'));
  await started;
  r.fjolspil.send(1, { screen: 'hals', turn: 1 });
  net.left('g1');
  const before = net.to('g1').length;
  net.joined('g1'); // a new tab with the same remembered id, which has said no hello
  const got = net.to('g1').slice(before);
  assert.deepEqual(got.map(msg => msg.type), ['seat', 'view']);
  assert.deepEqual(got[0], { v: 1, type: 'seat', body: { ok: true, seat: 1, name: 'Anna' } });
  assert.deepEqual(got[1].body, { screen: 'hals', turn: 1 });
});

test('the big screen tries its socket again when its page comes back into view or the network is back', () => {
  const r = rig();
  r.fire('online'); // no room yet: nothing to try
  r.fjolspil.openLobby({ game: 'hals', ai: THORSEDLA });
  const net = r.net();
  net.welcome();
  r.doc.visibilityState = 'hidden';
  r.fire('visibilitychange');
  assert.equal(net.reconnects, 0, 'not when it goes away');
  r.doc.visibilityState = 'visible';
  r.fire('visibilitychange');
  assert.equal(net.reconnects, 1);
  r.fire('online');
  assert.equal(net.reconnects, 2);
  net.setStatus('replaced'); // another tab has the room: taking it back would take it from that one
  r.fire('online');
  r.fire('visibilitychange');
  assert.equal(net.reconnects, 2);
});
