// remake/tests/fjolspil-guest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeDocument, pointerEvent } from './fake-dom.mjs';
import { createGuestPage } from '../engine/fjolspil/guest.js';

class FakeStorage { constructor() { this.map = new Map(); } getItem(k) { return this.map.get(k) ?? null; } setItem(k, v) { this.map.set(k, String(v)); } }
function fakeNet() {
  const net = { sent: [], connected: [], reconnects: 0, status: 'idle', onMessage: fn => { net.message = fn; }, onStatus: fn => { net.statusFn = fn; }, send: m => { net.sent.push(m); return true; }, reconnect() { net.reconnects += 1; }, close() {} };
  return net;
}
function rig({ search = '', storage = new FakeStorage(), views = {} } = {}) {
  const doc = new FakeDocument(['spil']);
  const net = fakeNet();
  const listeners = {}; // the window's, by event type
  const win = { location: { search, origin: 'http://192.168.1.10:4198', protocol: 'http:', host: '192.168.1.10:4198' }, addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } };
  const page = createGuestPage(doc, { win, storage, params: new URLSearchParams(search), net: ({ code }) => { net.connected.push(code); return net; }, views });
  const fire = type => { for (const fn of listeners[type] ?? []) fn(new Event(type)); };
  return { doc, page, net, storage, fire, root: doc.getElementById('spil') };
}
const $ = (root, s) => root.querySelector(s);
const $$ = (root, s) => root.querySelectorAll(s);
const view = (screen, body, seq) => ({ v: 1, type: 'view', seq, body: { screen, ...body } });
const tap = el => { // a finger down and up where it landed, as book/fx.js's pressable counts a tap (book.test.mjs)
  el.dispatchEvent(pointerEvent('pointerdown', { x: 10, y: 10 }));
  el.dispatchEvent(pointerEvent('pointerup', { x: 10, y: 10 }));
};

test('without a code in the address the page asks for one, in any case', () => {
  const { page, root, net } = rig();
  assert.equal(page.screen, 'code');
  const digits = [...$$(root, '.spil-digit')];
  assert.equal(digits.length, 4);
  digits.forEach((el, i) => { el.value = 'gull'[i]; el.dispatchEvent(new Event('input')); });
  tap($(root, '.spil-go'));
  assert.deepEqual(net.connected, ['GULL']);
  assert.equal(page.screen, 'join');
});

test('with ?r= the page connects at once, then asks for a name and an avatar and sends hello', () => {
  const { page, root, net, storage } = rig({ search: '?r=gull' });
  assert.deepEqual(net.connected, ['GULL']);
  assert.equal(page.screen, 'join');
  net.message(view('lobby', { seats: [{ seat: 0, name: 'Egill', avatar: 'egill' }], available: ['sloedla', 'gramedla'], you: null }, 1));
  assert.deepEqual([...$$(root, '.spil-avatar')].map(el => [el.getAttribute('data-id'), el.disabled]), [['kambedla', true], ['sloedla', false], ['gramedla', false], ['thorsedla', true], ['flugedla', true], ['uggedla', true]]);
  $(root, '.spil-name').value = '  Anna   Lísa Guðmundsdóttir ';
  tap($$(root, '.spil-avatar')[1]);
  tap($(root, '.spil-ready'));
  assert.deepEqual(net.sent.at(-1), { v: 1, type: 'hello', body: { name: 'Anna Lísa Gu', avatar: 'sloedla' } });
  net.message({ v: 1, type: 'seat', body: { ok: true, seat: 1 } });
  net.message(view('lobby', { seats: [{ seat: 0, name: 'Egill', avatar: 'egill' }, { seat: 1, name: 'Anna Lísa Gu', avatar: 'sloedla' }], available: ['gramedla'], you: 1 }, 2));
  assert.equal(page.screen, 'lobby');
  assert.deepEqual(JSON.parse(storage.getItem('mosi-fjolspil-guest')).name, 'Anna Lísa Gu');
  assert.match(JSON.parse(storage.getItem('mosi-fjolspil-guest')).guestId, /^[0-9a-f]{32}$/);
});

test('a remembered guest needs one tap; a taken avatar sends her back to choose', () => {
  const storage = new FakeStorage();
  storage.setItem('mosi-fjolspil-guest', JSON.stringify({ guestId: 'a'.repeat(32), name: 'Anna', avatar: 'kambedla' }));
  const { page, root, net } = rig({ search: '?r=GULL', storage });
  assert.equal($(root, '.spil-name').value, 'Anna');
  assert.equal($$(root, '.spil-avatar')[0].getAttribute('aria-pressed'), 'true');
  tap($(root, '.spil-ready'));
  assert.deepEqual(net.sent.at(-1).body, { name: 'Anna', avatar: 'kambedla' });
  net.message({ v: 1, type: 'seat', body: { ok: false, reason: 'avatar-taken' } });
  assert.equal(page.screen, 'join');
  assert.equal($$(root, '.spil-avatar')[0].disabled, true);
  assert.equal($(root, '.spil-status').textContent, 'Þessi var tekinn, veldu annan');
});

test('views arrive in order, status screens have their words, and a game view goes to its renderer', () => {
  const rendered = [];
  const { page, root, net } = rig({ search: '?r=GULL', views: { hals: (el, v) => rendered.push(v.turn) } });
  net.message(view('closed', {}, 3));
  assert.equal($(root, '.spil-words').textContent, 'Bíðum eftir næsta leik');
  net.message(view('over', { winner: { name: 'Bjarni', avatar: 'gramedla' } }, 2));
  assert.equal(page.screen, 'closed', 'an older view is ignored');
  net.message(view('hals', { turn: 2 }, 4));
  assert.deepEqual([page.screen, rendered], ['game', [2]]);
  net.statusFn('host-gone');
  assert.equal($(root, '.spil-words').textContent, 'Bíðum eftir stóra skjánum…');
  net.statusFn('no-room');
  assert.equal(page.screen, 'code');
  assert.equal($(root, '.spil-status').textContent, 'Þessi kóði er ekki í gangi');
});

test('a new connection starts the views afresh, so a big screen that reloaded while the phone slept is not ignored', () => {
  const { page, root, net } = rig({ search: '?r=GULL' });
  net.message(view('closed', {}, 5));
  assert.equal(page.screen, 'closed');
  net.statusFn('connecting');
  net.message(view('over', { winner: { name: 'Bjarni', avatar: 'gramedla' } }, 1));
  assert.equal(page.screen, 'over');
  assert.equal($(root, '.spil-words').textContent, 'Bjarni vann!');
});

test('a guest with a seat says hello again when the connection is back, and one without waits for her tap', () => {
  const storage = new FakeStorage();
  storage.setItem('mosi-fjolspil-guest', JSON.stringify({ guestId: 'a'.repeat(32), name: 'Anna', avatar: 'kambedla' }));
  const { page, root, net } = rig({ search: '?r=GULL', storage });
  net.statusFn('connected');
  assert.deepEqual(net.sent, [], 'remembered is not seated: the first hello is her tap');
  tap($(root, '.spil-ready'));
  net.message({ v: 1, type: 'seat', body: { ok: true, seat: 1 } });
  net.message(view('lobby', { seats: [{ seat: 0, name: 'Egill', avatar: 'egill' }, { seat: 1, name: 'Anna', avatar: 'kambedla' }], available: ['sloedla'], you: 1 }, 1));
  assert.equal(page.screen, 'lobby');
  assert.equal(net.sent.length, 1);
  net.statusFn('offline');
  net.statusFn('connecting');
  net.statusFn('connected');
  assert.equal(net.sent.length, 2);
  assert.deepEqual(net.sent.at(-1), { v: 1, type: 'hello', body: { name: 'Anna', avatar: 'kambedla' } }, 'her seat is asked for again (spec §6.4)');
  net.statusFn('host-gone');
  assert.equal(page.screen, 'wait');
  net.statusFn('connected'); // the big screen is back
  assert.equal(net.sent.length, 3);
  assert.deepEqual(net.sent.at(-1).body, { name: 'Anna', avatar: 'kambedla' });
});

test('a hello sent before the socket opened is sent again once it has', () => {
  const { root, net } = rig({ search: '?r=GULL' });
  $(root, '.spil-name').value = 'Bjarni';
  tap($$(root, '.spil-avatar')[2]);
  tap($(root, '.spil-ready'));
  net.statusFn('connected');
  assert.deepEqual(net.sent.map(m => m.body), [{ name: 'Bjarni', avatar: 'gramedla' }, { name: 'Bjarni', avatar: 'gramedla' }]);
});

test('the page coming back into view, or the network coming back, reconnects at once', () => {
  const { doc, net, fire } = rig({ search: '?r=GULL' });
  doc.visibilityState = 'hidden';
  fire('visibilitychange');
  assert.equal(net.reconnects, 0, 'not when it goes away');
  doc.visibilityState = 'visible';
  fire('visibilitychange');
  assert.equal(net.reconnects, 1);
  fire('online');
  assert.equal(net.reconnects, 2);
});
