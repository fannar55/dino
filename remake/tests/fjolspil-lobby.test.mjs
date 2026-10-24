// remake/tests/fjolspil-lobby.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { FakeDocument } from './fake-dom.mjs';
import { createLobby } from '../engine/fjolspil/lobby.js';
import { createSeats } from '../engine/fjolspil/seats.js';
import { COVER_AFTER_MS } from '../engine/fjolspil/protocol.js';

globalThis.qrcode = createRequire(import.meta.url)('../vendor/qrcode-generator/qrcode.js');
const JOIN = 'http://192.168.1.10:4198/remake/spil.html';

const THORSEDLA = { name: 'Þórseðla', avatar: 'thorsedla', add: 'Bæta við Þórseðlu', remove: 'Taka Þórseðlu út' };
function rig({ ai = THORSEDLA } = {}) {
  const doc = new FakeDocument(['fjolspil']);
  const seats = createSeats({ reserved: [ai.avatar] });
  const calls = { addAi: 0, start: 0, close: 0, cont: [] };
  const timers = { queue: [], setTimeout: (fn, ms) => { timers.queue.push({ fn, ms }); return timers.queue.length; }, clearTimeout: id => { timers.queue[id - 1] = null; } };
  const lobby = createLobby(doc, { seats, timers, onAddAi: () => calls.addAi++, onStart: () => calls.start++, onClose: () => calls.close++, onContinue: seat => calls.cont.push(seat) });
  return { doc, seats, lobby, calls, timers, root: doc.getElementById('fjolspil') };
}
const $ = (root, selector) => root.querySelector(selector);
const $$ = (root, selector) => root.querySelectorAll(selector);

test('the lobby shows the QR, the code, four seats and a start that waits for a second seat', () => {
  const { seats, lobby, root } = rig();
  lobby.show({ joinUrl: JOIN, code: 'GULL', ai: THORSEDLA });
  assert.equal(root.hidden, false);
  assert.match($(root, '.fjolspil-qr').innerHTML, /<svg/);
  assert.deepEqual([...$$(root, '.fjolspil-letter')].map(el => el.textContent), ['G', 'U', 'L', 'L']);
  assert.deepEqual([...$$(root, '.fjolspil-seat')].map(el => el.getAttribute('data-state')), ['host', 'empty', 'empty', 'empty']);
  assert.equal($(root, '.fjolspil-start').disabled, true);
  assert.equal($(root, '.fjolspil-ai').textContent, 'Bæta við Þórseðlu');
  seats.join({ guestId: 'g1', name: '<b>Anna</b>', avatar: 'kambedla' });
  lobby.refresh();
  assert.equal($$(root, '.fjolspil-seat')[1].getAttribute('data-state'), 'taken');
  assert.equal($$(root, '.fjolspil-seat')[1].querySelector('.fjolspil-name').textContent, '<b>Anna</b>');
  assert.equal($(root, '.fjolspil-start').disabled, false);
  seats.presence(1, false);
  lobby.refresh();
  assert.equal($$(root, '.fjolspil-seat')[1].getAttribute('data-state'), 'absent');
  assert.equal($(root, '.fjolspil-start').disabled, true, 'an absent guest does not count');
});

test('without --lan the lobby says so', () => {
  const { lobby, root } = rig();
  lobby.show({ joinUrl: 'http://127.0.0.1:4198/remake/spil.html', code: 'GULL', ai: null, lanMissing: true });
  assert.equal($(root, '.fjolspil-note').textContent, 'Keyrðu þjóninn með --lan svo símar nái í hann.');
  assert.equal($(root, '.fjolspil-ai').hidden, true);
});

test('the waiting card names the guest and offers to go on without her after 20 seconds', () => {
  const { seats, lobby, root, calls, timers } = rig();
  seats.join({ guestId: 'g1', name: 'Anna', avatar: 'kambedla' });
  seats.presence(1, false);
  lobby.waitFor({ seat: 1, joinUrl: JOIN, code: 'GULL' });
  assert.equal($(root, '.fjolspil-wait-words').textContent, 'Bíðum eftir Anna…');
  assert.equal($(root, '.fjolspil-continue'), null);
  const timer = timers.queue.find(Boolean);
  assert.equal(timer.ms, COVER_AFTER_MS);
  timer.fn();
  assert.equal($(root, '.fjolspil-continue').textContent, 'Halda áfram án Anna');
  $(root, '.fjolspil-continue').dispatchEvent(new Event('click'));
  assert.deepEqual(calls.cont, [1]);
  lobby.hideWaiting();
  assert.equal($(root, '.fjolspil-wait-words'), null);
});
