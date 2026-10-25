// remake/tests/fjolspil-guest.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { pointerEvent } from './fake-dom.mjs';
import { FakeStorage, rig, $, $$, view, tap } from './fjolspil-guest-rig.mjs';
import { renderHals } from '../engine/fjolspil/guest-hals.js';
import { renderEitt } from '../engine/fjolspil/guest-eitt.js';
import { makeDeck } from '../engine/eitt/rules.js';
import { bookSounds, BOOK_GAPS } from '../engine/book/book-sounds.js';
import { FakeContext } from './fake-audio.mjs';

const hellos = net => net.sent.filter(m => m.type === 'hello');
const ANNA_IN_LOBBY = view('lobby', { seats: [{ seat: 0, name: 'Egill', avatar: 'egill' }, { seat: 1, name: 'Anna', avatar: 'kambedla' }], available: ['sloedla'], you: 1 }, 1);
/** A remembered guest seated in seat 1 by her tap, in a lobby whose free avatars are no longer hers, and then a game. */
function seatedRig(options = {}) {
  const storage = new FakeStorage();
  storage.setItem('mosi-fjolspil-guest', JSON.stringify({ guestId: 'a'.repeat(32), name: 'Anna', avatar: 'kambedla' }));
  const r = rig({ search: '?r=GULL', storage, views: { hals: () => {} }, ...options });
  r.net.statusFn('connected');
  tap($(r.root, '.spil-ready'));
  r.net.message({ v: 1, type: 'seat', body: { ok: true, seat: 1, name: 'Anna' } });
  r.net.message(ANNA_IN_LOBBY);
  r.net.message(view('hals', { you: 1, turn: 1 }, 2));
  return r;
}

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

test('a view that says the big screen is paused puts it in the status line, and the next view clears it', () => {
  const { root, net } = rig({ search: '?r=GULL', views: { yatzy: () => {} } });
  net.statusFn('connected');
  net.message({ v: 1, type: 'seat', body: { ok: true, seat: 1, name: 'Ásta' } });
  net.message(view('yatzy', { paused: true }, 5));
  assert.equal($(root, '.spil-status').textContent, 'Stóri skjárinn er í hléi');
  net.message(view('yatzy', {}, 6));
  assert.equal($(root, '.spil-status').textContent, '');
  net.message(view('yatzy', { paused: true }, 7));
  net.message({ v: 1, type: 'seat', body: { ok: true, seat: 1, name: 'Ásta' } });
  assert.equal($(root, '.spil-status').textContent, 'Stóri skjárinn er í hléi', 'her seat told again is no new view');
  net.message(view('closed', {}, 8));
  assert.equal($(root, '.spil-status').textContent, '', 'a screen of the page\'s own clears it too');
  net.message(view('yatzy', { paused: true }, 9));
  net.statusFn('host-gone');
  assert.equal($(root, '.spil-status').textContent, '', 'the big screen gone: the wait screen has its own words');
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
  assert.deepEqual(net.sent.at(-1), { v: 1, type: 'hello', body: { name: 'Anna 2', avatar: 'flugedla' } }, 'seated: hello again with her seat (spec §6.4)');
  net.message({ v: 1, type: 'seat', body: { ok: true, seat: 1, name: 'Anna 2' } });
  assert.equal($(root, '.spil-me-name').textContent, 'Anna 2');
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

test('a seated page asks for its seat again with the seat\'s own name and avatar, never the join screen\'s checks', () => {
  // A second tab of her phone, opened before the first had its seat: it remembers her id, but no name and no avatar
  const storage = new FakeStorage();
  storage.setItem('mosi-fjolspil-guest', JSON.stringify({ guestId: 'a'.repeat(32), name: null, avatar: null }));
  const { root, net } = rig({ search: '?r=GULL', storage, views: { hals: () => {} } });
  net.statusFn('connected');
  net.message({ v: 1, type: 'seat', body: { ok: true, seat: 1, name: 'Anna' } }); // the big screen knows her id
  net.message(ANNA_IN_LOBBY); // her seat with her avatar, which the free ones do not list
  net.message(view('hals', { you: 1, turn: 1 }, 2));
  assert.deepEqual(hellos(net), []);
  net.statusFn('host-gone');
  net.statusFn('connected');
  assert.deepEqual(hellos(net).at(-1), { v: 1, type: 'hello', body: { name: 'Anna', avatar: 'kambedla' } });
  assert.equal($(root, '.spil-status').textContent, '', 'never "Skrifaðu nafnið þitt" over a game');

  const seated = seatedRig(); // seated by her own tap, in a lobby whose free avatars are no longer hers
  seated.net.statusFn('host-gone');
  seated.net.statusFn('connected');
  assert.deepEqual(hellos(seated.net).at(-1).body, { name: 'Anna', avatar: 'kambedla' });
});

test('on the wait screen with the socket open the page asks for its seat every five seconds, until the big screen answers', () => {
  const { page, net, timers } = seatedRig();
  net.statusFn('host-gone');
  assert.equal(page.screen, 'wait');
  let before = hellos(net).length;
  net.statusFn('connected'); // a socket open again, the big screen not heard yet
  assert.equal(hellos(net).length, before + 1, 'at once');
  timers.advance(5000);
  assert.equal(hellos(net).length, before + 2, 'and again five seconds later');
  assert.deepEqual(hellos(net).at(-1).body, { name: 'Anna', avatar: 'kambedla' });
  net.message(view('hals', { you: 1, turn: 0 }, 3)); // the big screen answers with her game
  assert.equal(page.screen, 'game');
  timers.advance(60000);
  assert.equal(hellos(net).length, before + 2, 'none after a view came');

  net.statusFn('host-gone');
  before = hellos(net).length;
  net.statusFn('connected');
  net.message({ v: 1, type: 'seat', body: { ok: true, seat: 1, name: 'Anna' } });
  timers.advance(60000);
  assert.equal(hellos(net).length, before + 1, 'none after her seat came');

  net.statusFn('host-gone');
  before = hellos(net).length;
  net.statusFn('connected');
  net.statusFn('offline'); // the socket closed under it
  timers.advance(60000);
  assert.equal(hellos(net).length, before + 1, 'none once the status is not connected');
  net.statusFn('connected');
  timers.advance(10 * 60000);
  assert.equal(hellos(net).length, before + 2 + 24, 'at once, then 24 more five seconds apart: two minutes');
  assert.equal(timers.count, 0, 'and then it stops');
});

test('a page whose seat another tab took offers it back: a tap on the wait screen takes it again', () => {
  const { page, root, net } = seatedRig();
  net.statusFn('host-gone');
  assert.equal($(root, '.spil-retake').hidden, true, 'the big screen gone: the page tries by itself, nothing to tap');
  net.statusFn('connected');
  net.message(view('hals', { you: 1, turn: 1 }, 3));
  net.statusFn('replaced');
  assert.equal(page.screen, 'wait');
  assert.equal($(root, '.spil-words').textContent, 'Bíðum eftir stóra skjánum…');
  const retake = $(root, '.spil-retake');
  assert.equal(retake.hidden, false);
  assert.equal(retake.textContent, 'Pikkaðu hér til að taka sætið þitt aftur');
  tap(retake);
  assert.equal(net.reconnects, 1, 'a new socket takes the seat back from the other tab');
  net.statusFn('connecting');
  assert.equal(retake.hidden, true, 'asked: the line goes');
  net.statusFn('connected');
  assert.deepEqual(hellos(net).at(-1).body, { name: 'Anna', avatar: 'kambedla' });
  net.statusFn('host-gone');
  assert.equal(retake.hidden, true);
  tap(retake);
  assert.equal(net.reconnects, 1, 'after host-gone a tap does nothing of its own');
});

test('?debug=1 shows the connection in small type under the status line, every second: status, way, last word heard and seat', () => {
  let clock = 1000;
  const { root, net, timers } = seatedRig({ search: '?r=GULL&debug=1', now: () => clock });
  net.transport = 'relay';
  clock = 4000;
  timers.advance(1000);
  assert.equal($(root, '.spil-debug').textContent, '[connected · relay · 3s · seat 1]');
  net.statusFn('connecting'); // the status line's words change, and the readout stays under them
  assert.equal($(root, '.spil-status').textContent, 'Tengist…');
  assert.match($(root, '.spil-debug').textContent, /^\[connecting · relay · 3s · seat 1\]$/);
  assert.equal($(root, '.spil-debug').getAttribute('aria-hidden'), 'true', 'a screen reader keeps to the words');
  assert.equal($(root, '.spil-status .spil-debug'), null, 'outside the status line, which stays empty (and small) without words');
  assert.equal(rig({ search: '?r=GULL' }).root.querySelector('.spil-debug'), null, 'not without ?debug=1');
});

test('a guest dropped at Byrjum! who taps again with another avatar keeps her own hello when the connection comes back', () => {
  const { page, root, net } = seatedRig();
  net.message(view('lobby', { seats: [{ seat: 0, name: 'Egill', avatar: 'egill' }], available: ['kambedla', 'sloedla'], you: null }, 3));
  assert.equal(page.screen, 'join', 'dropped while away: one tap seats her again');
  tap($$(root, '.spil-avatar')[1]);
  tap($(root, '.spil-ready'));
  assert.deepEqual(hellos(net).at(-1).body, { name: 'Anna', avatar: 'sloedla' });
  net.statusFn('connected'); // before the answer came
  assert.deepEqual(hellos(net).at(-1).body, { name: 'Anna', avatar: 'sloedla' }, 'her tap, not the avatar she had');
});
