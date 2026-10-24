// remake/tests/fjolspil-guest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeDocument, pointerEvent } from './fake-dom.mjs';
import { createGuestPage } from '../engine/fjolspil/guest.js';
import { renderHals } from '../engine/fjolspil/guest-hals.js';
import { renderEitt } from '../engine/fjolspil/guest-eitt.js';
import { makeDeck } from '../engine/eitt/rules.js';
import { bookSounds, BOOK_GAPS } from '../engine/book/book-sounds.js';
import { FakeContext } from './fake-audio.mjs';

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

test('the page makes no sound before the first touch, and wakes its audio inside every touch, even after an iPhone lock', t => {
  const contexts = [];
  const had = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  globalThis.AudioContext = class extends FakeContext { constructor() { super(); contexts.push(this); } };
  t.after(() => { if (had) Object.defineProperty(globalThis, 'AudioContext', had); else delete globalThis.AudioContext; });
  let audio = null;
  const { doc, net } = rig({ search: '?r=GULL', views: { probe: (el, v, tools) => { audio = tools.audio; } } });
  net.message(view('probe', {}, 1)); // a game screen, as Eitt!'s, with the page's audio
  const options = { sounds: bookSounds, gaps: BOOK_GAPS };
  assert.equal(audio.effects(options), null, 'before any touch a sound is skipped');
  assert.equal(contexts.length, 0, 'and no audio context is made');

  doc.dispatchEvent(pointerEvent('pointerup', { x: 10, y: 10 })); // on an iPhone only the finger lifting is a gesture
  assert.equal(contexts.length, 1, 'the touch made the context');
  const [context] = contexts;
  assert.equal(context.resumes, 1, 'and woke it inside the touch');
  const effects = audio.effects(options);
  assert.ok(effects, 'a game\'s effects now');
  assert.equal(audio.effects(options), effects, 'made once');

  context.setState('interrupted'); // WebKit after the phone was locked, or a call
  const resumes = context.resumes;
  assert.equal(audio.effects(options), effects);
  assert.equal(context.resumes, resumes + 1, 'the next sound asked for (inside a tap) resumes the context');
  assert.equal(context.state, 'running');
  context.setState('suspended');
  doc.dispatchEvent(new Event('touchend'));
  assert.equal(context.resumes, resumes + 2, 'a touch ending anywhere on the page resumes it too');
  context.setState('closed');
  audio.effects(options);
  doc.dispatchEvent(pointerEvent('pointerdown', { x: 10, y: 10 }));
  assert.equal(context.resumes, resumes + 2, 'a closed context is not resumed');
  assert.equal(contexts.length, 1, 'nor made again');
});

test('the hals screen rolls once per view and names whose turn it is', () => {
  const { page, root, net } = rig({ search: '?r=GULL', views: { hals: renderHals } });
  const players = [{ seat: 0, name: 'Egill', avatar: 'egill', square: 23 }, { seat: 1, name: 'Anna', avatar: 'flugedla', square: 17 }];
  net.message(view('hals', { you: 1, turn: 1, canRoll: true, roll: null, players, winner: null }, 1));
  assert.equal($(root, '.spil-hals-turn').textContent, 'Þú átt leik!');
  const die = $(root, '.spil-hals-die');
  tap(die);
  tap(die);
  assert.deepEqual(net.sent.filter(m => m.type === 'act'), [{ v: 1, type: 'act', body: { type: 'roll' } }], 'a double tap rolls once');
  assert.equal(die.disabled, true);
  net.message(view('hals', { you: 1, turn: 0, canRoll: false, roll: { value: 4, by: 1 }, players, winner: null }, 2));
  assert.equal($(root, '.spil-hals-turn').textContent, 'Egill á leik');
  assert.equal($(root, '.spil-hals-die').getAttribute('data-face'), '4');
  assert.equal([...$$(root, '.spil-hals-player')][1].textContent.includes('reitur 17'), true);
  net.message(view('hals', { you: 1, turn: 0, canRoll: false, roll: null, players, winner: 0 }, 3));
  assert.equal($(root, '.spil-words').textContent, 'Egill vann!');
});

test('a seat that comes with no hello of hers (a fresh page) is the big screen\'s: its name on her tag, and hello again later', () => {
  const storage = new FakeStorage();
  storage.setItem('mosi-fjolspil-guest', JSON.stringify({ guestId: 'a'.repeat(32), name: 'Anna', avatar: 'flugedla' }));
  const { root, net } = rig({ search: '?r=GULL', storage });
  net.message({ v: 1, type: 'seat', body: { ok: true, seat: 1, name: 'Anna 2' } });
  assert.equal($(root, '.spil-me').hidden, false);
  assert.equal($(root, '.spil-me-name').textContent, 'Anna 2', 'the name seats.js made unique');
  assert.deepEqual(net.sent, [], 'no hello of her own yet');
  net.statusFn('connected');
  assert.deepEqual(net.sent.at(-1), { v: 1, type: 'hello', body: { name: 'Anna', avatar: 'flugedla' } }, 'seated: hello again (spec §6.4)');
  assert.equal(JSON.parse(storage.getItem('mosi-fjolspil-guest')).name, 'Anna', 'what she typed is what she remembers');
  net.statusFn('no-room');
  assert.equal($(root, '.spil-status').textContent, 'Leiknum er lokið');
});

test('the eitt screen plays a card once, asks a colour for a wild, and offers Eitt! and Grípa!', () => {
  const { root, net } = rig({ search: '?r=GULL', views: { eitt: renderEitt } });
  const card = id => makeDeck().find(c => c.id === id);
  const base = { you: 1, turn: 1, direction: 1, colour: 'red', top: card('red-5-a'), hand: [card('red-7-a'), card('blue-2-a'), card('wild-a')], playable: ['red-7-a', 'wild-a'], canDraw: false, canPass: false, needsColour: null, eittNeeded: false, canCatch: null, counts: [{ seat: 0, name: 'Egill', avatar: 'egill', cards: 5 }, { seat: 1, name: 'Anna', avatar: 'sloedla', cards: 3 }], winner: null };
  net.message(view('eitt', base, 1));
  const cards = [...$$(root, '.spil-eitt-hand .eitt-card')];
  assert.deepEqual(cards.map(el => el.classList.contains('playable')), [true, false, true]);
  tap(cards[0]);
  tap(cards[0]);
  assert.deepEqual(net.sent.filter(m => m.type === 'act'), [{ v: 1, type: 'act', body: { type: 'play', cardId: 'red-7-a' } }]);
  net.message(view('eitt', { ...base, hand: [card('blue-2-a'), card('wild-a')], playable: ['wild-a'] }, 2));
  tap([...$$(root, '.spil-eitt-hand .eitt-card')][1]);
  assert.equal($$(root, '.spil-eitt-colours button').length, 4);
  tap($$(root, '.spil-eitt-colours button')[2]);
  assert.deepEqual(net.sent.at(-1).body, { type: 'play', cardId: 'wild-a', colour: 'green' });
  net.message(view('eitt', { ...base, turn: 0, hand: [card('blue-2-a')], playable: [], eittNeeded: true }, 3));
  assert.equal($(root, '.spil-eitt-eitt').hidden, false);
  tap($(root, '.spil-eitt-eitt'));
  assert.deepEqual(net.sent.at(-1).body, { type: 'eitt' });
  net.message(view('eitt', { ...base, turn: 0, eittNeeded: false, canCatch: 0 }, 4));
  assert.equal($(root, '.spil-eitt-catch').hidden, false);
  assert.equal($(root, '.spil-eitt-turn').textContent, 'Egill á leik');
});
