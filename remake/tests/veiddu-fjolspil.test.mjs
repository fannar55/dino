// remake/tests/veiddu-fjolspil.test.mjs
// "Veiddu" in Fjölspil (Task 9): Egill plays from a device of his own, because in Go Fish a hand must be hidden (the owner's answer,
// 2026-11-01, spec section 11). The seat model keeps Egill in seat 0, kind 'host'; a lobby that asks for it (hostOnPhone) binds his phone
// to that seat, and every other game's lobby is exactly what it was.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { FakeDocument, pointerEvent } from './fake-dom.mjs';
import { createFjolspil } from '../engine/fjolspil/fjolspil.js';
import { createSeats, playsFromPhone, HOST_AVATAR } from '../engine/fjolspil/seats.js';
import { COVER_AFTER_MS } from '../engine/fjolspil/protocol.js';
import { createVeidduMulti } from '../engine/veiddu/multi.js';

globalThis.qrcode = createRequire(import.meta.url)('../vendor/qrcode-generator/qrcode.js');

const UGGEDLA = { name: 'Uggeðla', avatar: 'uggedla', add: 'Bæta við Uggeðlu', remove: 'Taka Uggeðlu út' };
const THORSEDLA = { name: 'Þórseðla', avatar: 'thorsedla', add: 'Bæta við Þórseðlu', remove: 'Taka Þórseðlu út' };
const LAN = 'http://192.168.1.10:4198';
const EGILL_PHONE = 'e'.repeat(32);
const ANNA_PHONE = 'a'.repeat(32);

// ---- The seats ----------------------------------------------------------------------------------------------------------------

test('bindHost gives seat 0 a phone, keeps it Egill\'s, and a second phone is refused', () => {
  const seats = createSeats();
  assert.deepEqual(seats.bySeat(0), { seat: 0, name: 'Egill', avatar: 'egill', kind: 'host', guestId: null, present: true, covered: false });
  assert.deepEqual(seats.bindHost(EGILL_PHONE), { ok: true, seat: 0, name: 'Egill' });
  assert.deepEqual(seats.bySeat(0), { seat: 0, name: 'Egill', avatar: 'egill', kind: 'host', guestId: EGILL_PHONE, present: true, covered: false });
  assert.equal(seats.byGuest(EGILL_PHONE).seat, 0, 'his phone is found by its id like a guest\'s');
  assert.deepEqual(seats.bindHost(EGILL_PHONE), { ok: true, seat: 0, name: 'Egill' }, 'the same phone again is its own seat again');
  assert.deepEqual(seats.bindHost(ANNA_PHONE), { ok: false, reason: 'host-taken' });
  assert.deepEqual(seats.bindHost(''), { ok: false, reason: 'bad-id' });
});

test('a phone that is a guest\'s seat cannot be Egill\'s, and Egill\'s phone cannot rename him', () => {
  const seats = createSeats();
  seats.join({ guestId: ANNA_PHONE, name: 'Anna', avatar: 'kambedla' });
  assert.deepEqual(seats.bindHost(ANNA_PHONE), { ok: false, reason: 'already-seated' });
  seats.bindHost(EGILL_PHONE);
  assert.equal(seats.join({ guestId: EGILL_PHONE, name: 'Gunnar', avatar: 'gramedla' }).reason, 'bad-avatar');
  assert.equal(seats.bySeat(0).name, 'Egill');
  assert.equal(seats.bySeat(0).avatar, 'egill');
});

test('without a bound phone nothing about Egill\'s seat is new: no guest may be him, and he is always there', () => {
  const seats = createSeats();
  assert.equal(seats.join({ guestId: ANNA_PHONE, name: 'Egill', avatar: HOST_AVATAR.id }).reason, 'bad-avatar');
  seats.presence(0, false);
  seats.cover(0);
  assert.equal(seats.bySeat(0).present, true, 'he is at the big screen: nothing to be away from');
  assert.equal(seats.bySeat(0).covered, false);
  assert.equal(seats.bySeat(0).kind, 'host');
  assert.deepEqual(seats.dropAbsent(), []);
  assert.equal(playsFromPhone(seats.bySeat(0)), false, 'the big screen\'s Egill sends no acts');
});

test('his phone is away like a guest\'s, the computer covers him, he is himself again, and "Byrjum!" never drops his seat', () => {
  const seats = createSeats();
  seats.bindHost(EGILL_PHONE);
  seats.join({ guestId: ANNA_PHONE, name: 'Anna', avatar: 'kambedla' });
  assert.equal(playsFromPhone(seats.bySeat(0)), true);
  seats.presence(0, false);
  assert.equal(seats.bySeat(0).present, false);
  assert.equal(playsFromPhone(seats.bySeat(0)), false);
  assert.deepEqual(seats.dropAbsent(), [], 'his seat stays');
  seats.cover(0);
  assert.deepEqual([seats.bySeat(0).kind, seats.bySeat(0).covered, seats.bySeat(0).name, seats.bySeat(0).avatar], ['ai', true, 'Egill', 'egill']);
  assert.equal(seats.bySeat(0).guestId, EGILL_PHONE, 'it keeps his phone for when he is back');
  seats.presence(0, true);
  seats.uncover(0);
  assert.deepEqual([seats.bySeat(0).kind, seats.bySeat(0).covered], ['host', false], 'seat 0 is his again, not a guest\'s');
  assert.equal(playsFromPhone(seats.bySeat(0)), true);
});

test('a kept game finds Egill\'s phone again: bound, absent until it says hello, covered if it was', () => {
  const seats = createSeats();
  seats.bindHost(EGILL_PHONE);
  seats.join({ guestId: ANNA_PHONE, name: 'Anna', avatar: 'kambedla' });
  seats.presence(0, false);
  seats.cover(0);
  const kept = JSON.parse(JSON.stringify(seats.snapshot()));
  const back = createSeats({ from: kept });
  assert.deepEqual(back.bySeat(0), { seat: 0, name: 'Egill', avatar: 'egill', kind: 'ai', guestId: EGILL_PHONE, present: false, covered: true });
  assert.equal(back.bySeat(1).guestId, ANNA_PHONE);
  assert.equal(back.bySeat(1).present, false);
  const plain = createSeats({ from: createSeats().snapshot() });
  assert.equal(plain.bySeat(0).guestId, null, 'a game that kept Egill at the big screen has him there');
  assert.equal(plain.bySeat(0).present, true);
  seats.unbindHost();
  assert.deepEqual(seats.bySeat(0), { seat: 0, name: 'Egill', avatar: 'egill', kind: 'host', guestId: null, present: true, covered: false });
});

// ---- The host session ---------------------------------------------------------------------------------------------------------

/** The host net as fjolspil.js sees it (as fjolspil-host.test.mjs has it), with helpers that say what the meeting point would. */
function fakeNets() {
  const made = [];
  function create(options) {
    const on = { join: new Set(), leave: new Set(), message: new Set(), presence: new Set(), status: new Set(), welcome: new Set() };
    const add = (set, fn) => { set.add(fn); return () => { set.delete(fn); }; };
    const emit = (set, ...args) => { for (const fn of [...set]) fn(...args); };
    const guests = new Set();
    const sent = new Map();
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
      setStatus(status) { net.status = status; emit(on.status, status); },
      welcome(join = [], code = null) { emit(on.welcome, { code, join }); net.setStatus('connected'); },
      joined(id) { guests.add(id); emit(on.join, id); },
      left(id) { guests.delete(id); emit(on.leave, id); },
      presence(id, present) { emit(on.presence, id, present); },
      hello(id, name, avatar) { emit(on.message, id, { v: 1, type: 'hello', body: { name, avatar } }); },
      act(id, body) { emit(on.message, id, { v: 1, type: 'act', body }); },
      to: id => sent.get(id) ?? [],
      last: id => net.to(id).at(-1),
      lastOf: (id, type) => net.to(id).filter(msg => msg.type === type).at(-1),
    };
    made.push(net);
    return net;
  }
  return { made, create };
}

function fakeTimers() {
  let now = 0;
  let next = 1;
  const queue = new Map();
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

function rig({ storage = fakeStorage() } = {}) {
  const doc = new FakeDocument(['fjolspil']);
  const win = { location: new URL(`${LAN}/remake/?play=1`), addEventListener() {} };
  const nets = fakeNets();
  const timers = fakeTimers();
  const fjolspil = createFjolspil(doc, { win, storage, random: () => 0.5, timers, net: nets.create, audio: { sfx() {} } });
  return { doc, storage, nets, timers, fjolspil, root: doc.getElementById('fjolspil'), net: () => nets.made.at(-1) };
}
const $ = (root, selector) => root.querySelector(selector);
const $$ = (root, selector) => root.querySelectorAll(selector);
const tap = el => {
  el.dispatchEvent(pointerEvent('pointerdown', { x: 10, y: 10 }));
  el.dispatchEvent(pointerEvent('pointerup', { x: 10, y: 10 }));
};
const states = root => [...$$(root, '.fjolspil-seat')].map(el => el.getAttribute('data-state'));

test('Veiddu\'s lobby offers Egill\'s seat to a phone: it waits, then his phone is bound and acts from it are heard as seat 0', () => {
  const r = rig();
  const started = r.fjolspil.openLobby({ game: 'veiddu', ai: UGGEDLA, hostOnPhone: true });
  const net = r.net();
  net.welcome();
  assert.deepEqual(states(r.root), ['waiting', 'empty', 'empty', 'empty'], 'Egill\'s seat waits for his device');
  assert.equal($$(r.root, '.fjolspil-name')[0].textContent, 'Egill…');
  assert.equal($(r.root, '.fjolspil-start').disabled, true);

  net.joined('egill-phone');
  assert.equal(net.lastOf('egill-phone', 'view').body.host, 'free', 'the phone is offered Egill\'s portrait');
  assert.equal(net.lastOf('egill-phone', 'view').body.you, null);
  net.hello('egill-phone', 'Egill', 'egill');
  assert.deepEqual(net.lastOf('egill-phone', 'seat').body, { ok: true, seat: 0, name: 'Egill' });
  assert.equal(net.lastOf('egill-phone', 'view').body.you, 0);
  assert.equal(net.lastOf('egill-phone', 'view').body.host, 'mine');
  assert.deepEqual(states(r.root), ['taken', 'empty', 'empty', 'empty']);
  const bound = r.fjolspil.seats.bySeat(0);
  assert.deepEqual([bound.kind, bound.name, bound.avatar, bound.guestId], ['host', 'Egill', 'egill', 'egill-phone']);
  assert.equal($(r.root, '.fjolspil-start').disabled, true, 'a second seat is needed too');

  net.joined('anna');
  assert.equal(net.lastOf('anna', 'view').body.host, 'taken', 'nobody else is offered his portrait');
  net.hello('anna', 'Anna', 'kambedla');
  assert.equal($(r.root, '.fjolspil-start').disabled, false);

  const heard = [];
  r.fjolspil.onAct((seat, body) => heard.push([seat, body]));
  net.act('egill-phone', { type: 'ask', target: 1, kind: 'froskur' });
  net.act('anna', { type: 'fish' });
  assert.deepEqual(heard, [[0, { type: 'ask', target: 1, kind: 'froskur' }], [1, { type: 'fish' }]], 'Egill\'s phone is heard as seat 0');
  assert.equal(r.fjolspil.send(0, { screen: 'veiddu', you: 0 }), true, 'a view for seat 0 reaches his phone');
  assert.deepEqual(net.last('egill-phone').body, { screen: 'veiddu', you: 0 });
  assert.equal(net.last('anna').body.screen, 'lobby', 'and not hers');

  tap($(r.root, '.fjolspil-start'));
  return started.then(opened => {
    assert.equal(opened.seats.length, 2);
    assert.deepEqual([opened.seats[0].seat, opened.seats[0].kind, opened.seats[0].guestId], [0, 'host', 'egill-phone']);
  });
});

test('a second phone cannot be Egill, and "Byrjum!" waits for his phone when it is away', () => {
  const r = rig();
  r.fjolspil.openLobby({ game: 'veiddu', ai: UGGEDLA, hostOnPhone: true });
  const net = r.net();
  net.welcome();
  net.joined('egill-phone');
  net.hello('egill-phone', 'Egill', 'egill');
  net.joined('other');
  net.hello('other', 'Egill', 'egill');
  assert.deepEqual(net.lastOf('other', 'seat').body, { ok: false, reason: 'host-taken' });
  assert.equal(r.fjolspil.seats.bySeat(0).guestId, 'egill-phone');
  net.joined('anna');
  net.hello('anna', 'Anna', 'kambedla');
  assert.equal($(r.root, '.fjolspil-start').disabled, false);
  net.presence('egill-phone', false);
  assert.deepEqual(states(r.root).slice(0, 2), ['absent', 'taken']);
  assert.equal($(r.root, '.fjolspil-start').disabled, true, 'Egill\'s phone must be there to begin');
  net.presence('egill-phone', true);
  assert.equal($(r.root, '.fjolspil-start').disabled, false);
});

test('Egill\'s dropout waits with the QR code, then "Halda áfram án Egils", and the computer covers his seat', async () => {
  const r = rig();
  const started = r.fjolspil.openLobby({ game: 'veiddu', ai: UGGEDLA, hostOnPhone: true });
  const net = r.net();
  net.welcome();
  for (const [id, name, avatar] of [['egill-phone', 'Egill', 'egill'], ['anna', 'Anna', 'kambedla']]) {
    net.joined(id);
    net.hello(id, name, avatar);
  }
  tap($(r.root, '.fjolspil-start'));
  await started;

  net.presence('egill-phone', false);
  const wait = r.fjolspil.waitFor(0);
  assert.equal($(r.root, '.fjolspil-wait-words').textContent, 'Bíðum eftir Agli…');
  assert.deepEqual([...$(r.root, '.fjolspil-wait').querySelectorAll('.fjolspil-letter')].map(el => el.textContent), [...r.fjolspil.code]);
  assert.match($(r.root, '.fjolspil-wait .fjolspil-qr').innerHTML, /<svg/);
  assert.equal($(r.root, '.fjolspil-continue'), null);
  r.timers.advance(COVER_AFTER_MS);
  assert.equal($(r.root, '.fjolspil-continue').textContent, 'Halda áfram án Egils');
  tap($(r.root, '.fjolspil-continue'));
  assert.equal(await wait, 'cover');
  const covered = r.fjolspil.seats.bySeat(0);
  assert.deepEqual([covered.kind, covered.covered, covered.name], ['ai', true, 'Egill']);

  const heard = [];
  r.fjolspil.onAct((seat, body) => heard.push([seat, body]));
  net.act('egill-phone', { type: 'fish' }); // a phone that is away, or a seat the computer plays, is not heard
  assert.deepEqual(heard, []);

  const again = r.fjolspil.waitFor(0); // his next turn, the computer still in his seat
  net.presence('egill-phone', true); // his phone is back
  assert.equal(await again, 'back');
  assert.deepEqual([r.fjolspil.seats.bySeat(0).kind, r.fjolspil.seats.bySeat(0).covered], ['host', false], 'seat 0 is his again');
  net.act('egill-phone', { type: 'fish' });
  assert.deepEqual(heard, [[0, { type: 'fish' }]]);
});

test('a reload of Egill\'s phone, or of the big screen, finds his seat by the kept id', async () => {
  const r = rig();
  const started = r.fjolspil.openLobby({ game: 'veiddu', ai: UGGEDLA, hostOnPhone: true });
  const net = r.net();
  net.welcome();
  for (const [id, name, avatar] of [['egill-phone', 'Egill', 'egill'], ['anna', 'Anna', 'kambedla']]) {
    net.joined(id);
    net.hello(id, name, avatar);
  }
  tap($(r.root, '.fjolspil-start'));
  await started;
  r.fjolspil.send(0, { screen: 'veiddu', you: 0, marker: 1 });
  // the phone reloads: it connects again with the same id, and has no hello of its own to say
  net.left('egill-phone');
  assert.equal(r.fjolspil.seats.bySeat(0).present, false);
  net.joined('egill-phone');
  assert.deepEqual(net.lastOf('egill-phone', 'seat').body, { ok: true, seat: 0, name: 'Egill' });
  assert.equal(r.fjolspil.seats.bySeat(0).present, true);
  assert.equal(net.last('egill-phone').body.marker, 1, 'and gets the newest view of the game back');

  // the big screen reloads: a new page, the kept seats (snapshot) with Egill's phone in seat 0, absent until it says hello
  const kept = JSON.parse(JSON.stringify(r.fjolspil.seats.snapshot()));
  const again = rig({ storage: r.storage });
  await again.fjolspil.resume(kept);
  assert.equal(again.fjolspil.seats.bySeat(0).guestId, 'egill-phone');
  assert.equal(again.fjolspil.seats.bySeat(0).present, false);
  const net2 = again.net();
  net2.welcome();
  net2.joined('egill-phone');
  assert.equal(again.fjolspil.seats.bySeat(0).present, true, 'he is seated again with no lobby');
  net2.hello('egill-phone', 'Egill', 'egill'); // the phone's own hello after the reconnect
  assert.deepEqual(net2.lastOf('egill-phone', 'seat').body, { ok: true, seat: 0, name: 'Egill' });
});

test('every other game\'s lobby is what it was: no host offer, Egill is at the big screen, his portrait is no guest\'s', () => {
  const r = rig();
  r.fjolspil.openLobby({ game: 'eitt', ai: THORSEDLA });
  const net = r.net();
  net.welcome();
  assert.deepEqual(states(r.root), ['host', 'empty', 'empty', 'empty']);
  net.joined('anna');
  assert.equal('host' in net.lastOf('anna', 'view').body, false, 'the lobby view has no host key');
  assert.deepEqual(Object.keys(net.lastOf('anna', 'view').body).sort(), ['available', 'screen', 'seats', 'you']);
  net.hello('anna', 'Egill', 'egill');
  assert.deepEqual(net.lastOf('anna', 'seat').body, { ok: false, reason: 'bad-avatar' });
  net.hello('anna', 'Anna', 'kambedla');
  assert.equal(net.lastOf('anna', 'seat').body.ok, true);
  assert.equal($(r.root, '.fjolspil-start').disabled, false, 'Egill is there at the big screen: two seats are enough');
  const heard = [];
  r.fjolspil.onAct((seat, body) => heard.push([seat, body]));
  net.act('anna', { type: 'draw' });
  assert.deepEqual(heard, [[1, { type: 'draw' }]]);
  assert.equal(r.fjolspil.send(0, { screen: 'eitt' }), false, 'Egill has no phone');
});

test('after Veiddu another game\'s lobby gives Egill back to the big screen', () => {
  const r = rig();
  r.fjolspil.openLobby({ game: 'veiddu', ai: UGGEDLA, hostOnPhone: true });
  const net = r.net();
  net.welcome();
  net.joined('egill-phone');
  net.hello('egill-phone', 'Egill', 'egill');
  assert.equal(r.fjolspil.seats.bySeat(0).guestId, 'egill-phone');
  tap($(r.root, '.fjolspil-close')); // the X: back to the book
  r.fjolspil.openLobby({ game: 'eitt', ai: THORSEDLA });
  assert.deepEqual(r.fjolspil.seats.bySeat(0), { seat: 0, name: 'Egill', avatar: 'egill', kind: 'host', guestId: null, present: true, covered: false });
  assert.deepEqual(states(r.root), ['host', 'empty', 'empty', 'empty']);
  assert.equal(net.lastOf('egill-phone', 'view').body.you, null, 'his phone is told it has no seat now');
  assert.equal(r.fjolspil.send(0, { screen: 'eitt' }), false);
  const heard = [];
  r.fjolspil.onAct((seat, body) => heard.push([seat, body]));
  net.act('egill-phone', { type: 'draw' });
  assert.deepEqual(heard, [], 'a phone with no seat is not heard');
});

// ---- The phone page: "Ég er Egill" -----------------------------------------------------------------------------------------

import { FakeStorage, rig as guestRig, $ as g$, view as guestView, tap as guestTap } from './fjolspil-guest-rig.mjs';

const hellos = net => net.sent.filter(m => m.type === 'hello');
const EGILL_SEAT = { seat: 0, name: 'Egill', avatar: 'egill' };

test('a lobby that wants Egill on a device offers his portrait first, and one tap sends hello as Egill with no name typed', () => {
  const storage = new FakeStorage();
  const r = guestRig({ search: '?r=GULL', storage });
  r.net.statusFn('connected');
  assert.equal(g$(r.root, '.spil-host').hidden, true, 'no offer before the lobby has said so');
  r.net.message(guestView('lobby', { host: 'free', seats: [{ ...EGILL_SEAT, present: false }], available: ['kambedla', 'sloedla'], you: null }, 1));
  const button = g$(r.root, '.spil-host');
  assert.equal(button.hidden, false);
  assert.equal(g$(r.root, '.spil-host-words').textContent, 'Ég er Egill');
  assert.match(g$(r.root, '.spil-host-face img').src, /egill-render\.webp$/);
  assert.equal(g$(r.root, '.spil-join').classList.contains('with-host'), true);
  assert.equal(g$(r.root, '.spil-name').value, '', 'nothing is typed');
  guestTap(button);
  assert.deepEqual(hellos(r.net).at(-1), { v: 1, type: 'hello', body: { name: 'Egill', avatar: 'egill' } });
  r.net.message({ v: 1, type: 'seat', body: { ok: true, seat: 0, name: 'Egill' } });
  r.net.message(guestView('lobby', { host: 'mine', seats: [EGILL_SEAT, { seat: 1, name: 'Anna', avatar: 'kambedla' }], available: ['sloedla'], you: 0 }, 2));
  assert.equal(r.page.screen, 'lobby');
  assert.equal(g$(r.root, '.spil-me-name').textContent, 'Egill');
  const kept = JSON.parse(storage.getItem('mosi-fjolspil-guest'));
  assert.deepEqual([kept.name, kept.avatar], ['Egill', 'egill'], 'the phone remembers whose it is');
});

test('a lobby that keeps Egill at the big screen offers no portrait, and a taken seat takes the offer away', () => {
  const r = guestRig({ search: '?r=GULL' });
  r.net.statusFn('connected');
  r.net.message(guestView('lobby', { seats: [{ ...EGILL_SEAT }], available: ['kambedla'], you: null }, 1));
  assert.equal(g$(r.root, '.spil-host').hidden, true);
  r.net.message(guestView('lobby', { host: 'free', seats: [{ ...EGILL_SEAT }], available: ['kambedla'], you: null }, 2));
  assert.equal(g$(r.root, '.spil-host').hidden, false);
  guestTap(g$(r.root, '.spil-host'));
  r.net.message({ v: 1, type: 'seat', body: { ok: false, reason: 'host-taken' } });
  assert.equal(r.page.screen, 'join');
  assert.equal(g$(r.root, '.spil-host').hidden, true, 'another phone is Egill\'s');
  assert.equal(g$(r.root, '.spil-status').textContent, 'Þessi var tekinn, veldu annan');
  r.net.message(guestView('lobby', { host: 'taken', seats: [{ ...EGILL_SEAT }], available: ['kambedla'], you: null }, 3));
  assert.equal(g$(r.root, '.spil-host').hidden, true);
});

test('Egill\'s phone remembered after a reload: it goes back to its seat, and a reconnect says hello as Egill again', () => {
  const storage = new FakeStorage();
  storage.setItem('mosi-fjolspil-guest', JSON.stringify({ guestId: 'e'.repeat(32), name: 'Egill', avatar: 'egill' }));
  const r = guestRig({ search: '?r=GULL', storage });
  r.net.statusFn('connected');
  assert.equal(hellos(r.net).length, 0, 'a fresh page says no hello: the big screen tells it its seat');
  r.net.message({ v: 1, type: 'seat', body: { ok: true, seat: 0, name: 'Egill' } });
  assert.equal(g$(r.root, '.spil-me-name').textContent, 'Egill');
  assert.match(g$(r.root, '.spil-me-face img').src, /egill-render\.webp$/);
  r.net.statusFn('connecting');
  r.net.statusFn('connected');
  assert.deepEqual(hellos(r.net).at(-1).body, { name: 'Egill', avatar: 'egill' }, 'the reconnect is Egill\'s hello, not a guest\'s');
  assert.equal(g$(r.root, '.spil-avatar[aria-pressed="true"]'), null, 'and Egill\'s portrait is not one of the six friends');
});

test('Veiddu Fjölspil starts with Egill at the big screen: connecting one phone enables "Byrjum!" immediately and Egill plays on the host screen', async () => {
  const doc = new FakeDocument(['fjolspil', 'veiddu']);
  const win = { location: new URL(`${LAN}/remake/?play=1`), addEventListener() {} };
  const nets = fakeNets();
  const timers = fakeTimers();
  const fjolspil = createFjolspil(doc, { win, storage: fakeStorage(), random: () => 0.5, timers, net: nets.create, audio: { sfx() {} } });
  const uggHome = doc.createElement('div');
  const veidduRoot = doc.getElementById('veiddu');
  const multi = createVeidduMulti(doc, {
    root: veidduRoot, fjolspil, save: null, win, calm: () => true,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: id => timers.clearTimeout(id),
    uggedla: { windowEl: doc.createElement('div'), frameEl: doc.createElement('div'), home: uggHome, view: () => null, start() {}, stop() {} },
    sound: { sfx() {}, splashes: { play() {} }, say: () => 0, speech: { stop() {}, cut() {}, talking: false }, clock: () => 0, lineMs: () => 10 },
    words: { SAY: { yes: 'Já', give: 'Gjörðu', no: 'Nei', childNo: 'Farðu að veiða!', lucky: 'Heppilegt', empty: 'Tóm' }, asking: k => `Áttu ${k}?` },
  });
  const lobbyRoot = doc.getElementById('fjolspil');
  const openPromise = multi.openLobby();
  const net = nets.made.at(-1);
  net.welcome();
  assert.deepEqual(states(lobbyRoot), ['host', 'empty', 'empty', 'empty'], 'Egill is already seated at the big screen');
  assert.equal($(lobbyRoot, '.fjolspil-start').disabled, true, 'waiting for at least one opponent');

  net.joined('anna-phone');
  net.hello('anna-phone', 'Anna', 'kambedla');
  assert.deepEqual(states(lobbyRoot), ['host', 'taken', 'empty', 'empty']);
  assert.equal($(lobbyRoot, '.fjolspil-start').disabled, false, 'connecting one phone enables "Byrjum!" immediately');

  tap($(lobbyRoot, '.fjolspil-start'));
  assert.equal(await openPromise, true, 'the round begins');
  assert.equal(multi.isOn, true);
  const multiEl = veidduRoot.querySelector('.veiddu-multi');
  assert.equal(multiEl.dataset.host, 'screen');

  // Advance timers through deal() and initial pair animations
  for (let step = 0; step < 30 && multi.dealt < 1; step++) {
    timers.advance(500);
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(multi.dealt, 1, 'deal() completed without crashing');
  assert.equal(multi.phase, '0 ask', 'Egill is on turn to ask on the big screen');

  const handCards = $$(multiEl, '.veiddu-hand .veiddu-card');
  assert.equal(handCards.length, multi.game.hands[0].length, 'all of Egill\'s cards are in the host hand');
  assert.ok(handCards.length > 0);
  for (const cardEl of handCards) {
    assert.equal(cardEl.style.visibility, '', 'each card in Egill\'s hand is visible after the deal');
  }

  // Pick a kind that Anna does NOT hold so we test asking -> "Nei!" -> fishing on the host screen
  const annaKinds = new Set(multi.game.hands[1].map(c => c.kind));
  const askCardEl = handCards.find(c => !annaKinds.has(c.dataset.kind)) ?? handCards[0];
  const askKind = askCardEl.dataset.kind;
  tap(askCardEl);
  assert.equal(askCardEl.classList.contains('picked'), true, 'tapping a card lifts it on the host screen');
  const annaPlace = $$(multiEl, '.veiddu-place').find(el => el.dataset.seat === '1');
  assert.equal(annaPlace.classList.contains('is-target'), true, 'opponent place lights up as target');

  // Tap opponent place to ask
  tap(annaPlace);
  for (let step = 0; step < 10 && !multi.phase.startsWith('1 '); step++) {
    timers.advance(200);
    await new Promise(resolve => setImmediate(resolve));
  }
  const annaView = net.lastOf('anna-phone', 'view').body;
  assert.equal(annaView.asked.kind, askKind, 'Anna\'s phone immediately sees what Egill asked for');

  if (multi.phase === '1 no') {
    net.act('anna-phone', { type: 'no' });
    for (let step = 0; step < 10 && multi.phase !== '0 fish'; step++) {
      timers.advance(200);
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.equal(multi.phase, '0 fish', 'Egill must now fish on the host screen');
    const pondEl = $(multiEl, '.veiddu-pond');
    assert.equal(pondEl.classList.contains('calls'), true, 'pond glows for Egill');
    tap(pondEl);
    for (let step = 0; step < 20 && multi.phase === 'busy'; step++) {
      timers.advance(300);
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  // Now when it is Anna's turn on her phone ('1 ask'), test Anna asking Egill for a card Egill holds ('0 give')
  if (multi.phase === '1 ask') {
    const egillKinds = new Set(multi.game.hands[0].map(c => c.kind));
    const shared = multi.game.hands[1].find(c => egillKinds.has(c.kind));
    const unshared = multi.game.hands[1].find(c => !egillKinds.has(c.kind));
    if (shared) {
      net.act('anna-phone', { type: 'ask', target: 0, kind: shared.kind });
      for (let step = 0; step < 10 && multi.phase !== '0 give'; step++) {
        timers.advance(200);
        await new Promise(resolve => setImmediate(resolve));
      }
      assert.equal(multi.phase, '0 give', 'host screen waits for Egill to give the matching card');
      const giveBtn = $$(multiEl, '.veiddu-hand .veiddu-card').find(c => c.dataset.kind === shared.kind);
      const givenCardId = giveBtn.dataset.id;
      assert.equal(giveBtn.classList.contains('hint'), true, 'matching card in Egill\'s hand lights up');
      tap(giveBtn);
      for (let step = 0; step < 20 && multi.phase === 'busy'; step++) {
        timers.advance(300);
        await new Promise(resolve => setImmediate(resolve));
      }
      const afterGiveCards = $$(multiEl, '.veiddu-hand .veiddu-card');
      assert.equal(
        afterGiveCards.some(c => c.dataset.id === givenCardId),
        false,
        'given card is removed from Egill\'s DOM hand on the host screen',
      );
      assert.deepEqual(
        afterGiveCards.map(c => c.dataset.id).sort(),
        multi.game.hands[0].map(c => c.id).sort(),
        'DOM hand on host screen matches game.hands[0] after giving a card',
      );
    } else if (unshared) {
      net.act('anna-phone', { type: 'ask', target: 0, kind: unshared.kind });
      for (let step = 0; step < 10 && multi.phase !== '0 no'; step++) {
        timers.advance(200);
        await new Promise(resolve => setImmediate(resolve));
      }
      assert.equal(multi.phase, '0 no', 'host screen waits for Egill to tap Farðu að veiða!');
      const fishBtn = $(multiEl, '.veiddu-fish-button');
      assert.ok(fishBtn, 'Farðu að veiða! button appears on the host screen');
      tap(fishBtn);
      for (let step = 0; step < 10 && multi.phase !== '1 fish'; step++) {
        timers.advance(200);
        await new Promise(resolve => setImmediate(resolve));
      }
      assert.equal(multi.phase, '1 fish', 'Anna\'s phone is told to fish');
    }
  }

  multi.leave({ close: true });
});

test('host screen removes a card from Egill\'s hand when he gives it away and pairs up cleanly when he receives one', async () => {
  const doc = new FakeDocument(['fjolspil', 'veiddu']);
  const win = { location: new URL(`${LAN}/remake/?play=1`), addEventListener() {} };
  const nets = fakeNets();
  const timers = fakeTimers();
  const fjolspil = createFjolspil(doc, { win, storage: fakeStorage(), random: () => 0.5, timers, net: nets.create, audio: { sfx() {} } });
  const uggHome = doc.createElement('div');
  const veidduRoot = doc.getElementById('veiddu');
  const multi = createVeidduMulti(doc, {
    root: veidduRoot, fjolspil, save: null, win, calm: () => true,
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: id => timers.clearTimeout(id),
    uggedla: { windowEl: doc.createElement('div'), frameEl: doc.createElement('div'), home: uggHome, view: () => null, start() {}, stop() {} },
    sound: { sfx() {}, splashes: { play() {} }, say: () => 0, speech: { stop() {}, cut() {}, talking: false }, clock: () => 0, lineMs: () => 10 },
    words: { SAY: { yes: 'Já', give: 'Gjörðu', no: 'Nei', childNo: 'Farðu að veiða!', lucky: 'Heppilegt', empty: 'Tóm' }, asking: k => `Áttu ${k}?` },
  });
  const lobbyRoot = doc.getElementById('fjolspil');
  const openPromise = multi.openLobby();
  const net = nets.made.at(-1);
  net.welcome();
  net.joined('fannar-phone');
  net.hello('fannar-phone', 'Fannar', 'flugedla');
  tap($(lobbyRoot, '.fjolspil-start'));
  await openPromise;
  multi.leave({ close: false });

  // Resume with a known state: seat 1 (Fannar) is on turn to ask; both hold snigill and fiskur-gulur
  const kept = {
    hands: [
      [{ id: 'snigill-1', kind: 'snigill' }, { id: 'fiskur-gulur-1', kind: 'fiskur-gulur' }, { id: 'fiskur-blar-1', kind: 'fiskur-blar' }],
      [{ id: 'snigill-2', kind: 'snigill' }, { id: 'fiskur-gulur-2', kind: 'fiskur-gulur' }, { id: 'froskur-1', kind: 'froskur' }],
    ],
    pairs: [[], []],
    pond: [{ id: 'snigill-3', kind: 'snigill' }, { id: 'snigill-4', kind: 'snigill' }],
    turn: 1,
    phase: 'ask',
    winners: [],
    log: [],
  };
  assert.equal(multi.show(fjolspil.seats.list(), kept), true);
  for (let step = 0; step < 10 && multi.phase === 'busy'; step++) {
    timers.advance(200);
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(multi.phase, '1 ask');
  const multiEl = veidduRoot.querySelector('.veiddu-multi');
  assert.deepEqual(
    $$(multiEl, '.veiddu-hand .veiddu-card').map(c => c.dataset.id),
    ['snigill-1', 'fiskur-gulur-1', 'fiskur-blar-1'],
  );

  // 1) Fannar asks Egill for snigill -> Egill gives snigill-1 -> snigill-1 MUST leave Egill's DOM hand
  net.act('fannar-phone', { type: 'ask', target: 0, kind: 'snigill' });
  for (let step = 0; step < 10 && multi.phase !== '0 give'; step++) {
    timers.advance(200);
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(multi.phase, '0 give');
  const snigillBtn = $$(multiEl, '.veiddu-hand .veiddu-card').find(c => c.dataset.kind === 'snigill');
  tap(snigillBtn);
  for (let step = 0; step < 20 && multi.phase === 'busy'; step++) {
    timers.advance(300);
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(multi.phase, '1 ask', 'Fannar gets another turn after pairing snigill');
  assert.deepEqual(
    $$(multiEl, '.veiddu-hand .veiddu-card').map(c => c.dataset.id),
    ['fiskur-gulur-1', 'fiskur-blar-1'],
    'snigill-1 was removed from Egill\'s visible hand on the host screen',
  );

  // 2) Fannar asks for froskur (which Egill does not hold) -> Egill taps Farðu að veiða! -> Fannar fishes -> Egill's turn
  net.act('fannar-phone', { type: 'ask', target: 0, kind: 'froskur' });
  for (let step = 0; step < 10 && multi.phase !== '0 no'; step++) {
    timers.advance(200);
    await new Promise(resolve => setImmediate(resolve));
  }
  tap($(multiEl, '.veiddu-fish-button'));
  for (let step = 0; step < 10 && multi.phase !== '1 fish'; step++) {
    timers.advance(200);
    await new Promise(resolve => setImmediate(resolve));
  }
  net.act('fannar-phone', { type: 'fish' });
  for (let step = 0; step < 20 && multi.phase === 'busy'; step++) {
    timers.advance(300);
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(multi.phase, '0 ask', 'Egill is now on turn');

  // 3) Egill asks Fannar for fiskur-gulur -> Fannar gives fiskur-gulur-2 -> Egill pairs fiskur-gulur -> both removed from Egill's hand
  const gulurBtn = $$(multiEl, '.veiddu-hand .veiddu-card').find(c => c.dataset.kind === 'fiskur-gulur');
  tap(gulurBtn);
  const fannarPlace = $$(multiEl, '.veiddu-place').find(el => el.dataset.seat === '1');
  tap(fannarPlace);
  for (let step = 0; step < 10 && multi.phase !== '1 give'; step++) {
    timers.advance(200);
    await new Promise(resolve => setImmediate(resolve));
  }
  net.act('fannar-phone', { type: 'give', cardId: 'fiskur-gulur-2' });
  for (let step = 0; step < 20 && multi.phase === 'busy'; step++) {
    timers.advance(300);
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.deepEqual(
    $$(multiEl, '.veiddu-hand .veiddu-card').map(c => c.dataset.id),
    ['fiskur-blar-1'],
    'after receiving and pairing fiskur-gulur, only fiskur-blar-1 remains in Egill\'s visible hand',
  );

  multi.leave({ close: true });
});
