import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FakeDocument, pointerEvent } from './fake-dom.mjs';
import { createGuestPage } from '../engine/fjolspil/guest.js';
import { createJuniorFrame } from '../engine/yatzy-junior/frame.js';
import { keepScreenAwake } from '../engine/wake-lock.js';

function fakeSentinel() {
  const listeners = new Set();
  const sentinel = {
    released: false,
    releaseCalls: 0,
    addEventListener(type, fn) {
      if (type === 'release') listeners.add(fn);
    },
    release() {
      sentinel.releaseCalls++;
      if (!sentinel.released) {
        sentinel.released = true;
        for (const fn of [...listeners]) fn();
      }
      return Promise.resolve();
    },
    dropBySystem() {
      if (!sentinel.released) {
        sentinel.released = true;
        for (const fn of [...listeners]) fn();
      }
    },
  };
  return sentinel;
}

function wakeRig({ hidden = false, active = true, impl = null } = {}) {
  const doc = new FakeDocument();
  doc.hidden = hidden;
  doc.visibilityState = hidden ? 'hidden' : 'visible';
  const winListeners = new Map();
  const sentinels = [];
  const calls = [];
  const win = {
    location: { origin: 'https://mosi.fannar55.workers.dev', search: '' },
    navigator: {
      wakeLock: {
        request(type) {
          calls.push(type);
          if (impl) return impl(type, sentinels);
          const s = fakeSentinel();
          sentinels.push(s);
          return Promise.resolve(s);
        },
      },
    },
    addEventListener(type, fn) {
      if (!winListeners.has(type)) winListeners.set(type, new Set());
      winListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      winListeners.get(type)?.delete(fn);
    },
    fire(type) {
      for (const fn of [...(winListeners.get(type) ?? [])]) fn(new Event(type));
    },
  };
  doc.defaultView = win;
  const lock = keepScreenAwake({ doc, win, active });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return { doc, win, lock, calls, sentinels, flush };
}

test('keepScreenAwake acquires a screen wake lock and re-acquires it when the tablet returns from background', async () => {
  const r = wakeRig();
  await r.flush();
  assert.deepEqual(r.calls, ['screen']);
  assert.equal(r.lock.active, true);
  assert.equal(r.lock.wanted, true);

  // Android / iPadOS releases the WakeLockSentinel automatically when the app or tab hides.
  r.doc.hidden = true;
  r.doc.visibilityState = 'hidden';
  r.sentinels[0].dropBySystem();
  r.doc.dispatchEvent(new Event('visibilitychange'));
  await r.flush();
  assert.equal(r.lock.active, false);
  assert.equal(r.lock.wanted, true);
  assert.equal(r.calls.length, 1, 'never requests while hidden');

  // Coming back to the game asks for a fresh sentinel at once.
  r.doc.hidden = false;
  r.doc.visibilityState = 'visible';
  r.doc.dispatchEvent(new Event('visibilitychange'));
  await r.flush();
  assert.equal(r.calls.length, 2);
  assert.equal(r.lock.active, true);
  assert.equal(r.sentinels[1].released, false);

  r.lock.dispose();
  assert.equal(r.lock.active, false);
  assert.equal(r.sentinels[1].releaseCalls, 1);
});

test('keepScreenAwake retries on the first touch when a browser refuses before a gesture, without duplicate in-flight requests', async () => {
  let allow = false;
  let resolvePending = null;
  const r = wakeRig({
    impl: (_type, sentinels) => {
      if (!allow) return Promise.reject(new Error('NotAllowedError'));
      return new Promise(resolve => {
        resolvePending = () => {
          const s = fakeSentinel();
          sentinels.push(s);
          resolve(s);
        };
      });
    },
  });
  await r.flush();
  assert.equal(r.calls.length, 1);
  assert.equal(r.lock.active, false);

  // Now the child taps Byrja: pointerdown and pointerup fire in the same gesture, asking only once.
  allow = true;
  r.doc.dispatchEvent(pointerEvent('pointerdown'));
  r.doc.dispatchEvent(pointerEvent('pointerup'));
  assert.equal(r.calls.length, 2, 'only one request in flight at a time');
  resolvePending();
  await r.flush();
  assert.equal(r.lock.active, true);

  // Further taps while held cost no extra wakeLock.request calls.
  r.doc.dispatchEvent(pointerEvent('pointerdown'));
  r.doc.dispatchEvent(pointerEvent('pointerup'));
  assert.equal(r.calls.length, 2);
});

test('keepScreenAwake releases a late-resolving sentinel if paused, hidden or disposed meanwhile', async () => {
  let finish = null;
  const r = wakeRig({
    impl: (_type, sentinels) => new Promise(resolve => {
      finish = () => {
        const s = fakeSentinel();
        sentinels.push(s);
        resolve(s);
      };
    }),
  });
  r.lock.setActive(false);
  finish();
  await r.flush();
  assert.equal(r.lock.active, false);
  assert.equal(r.sentinels[0].released, true, 'a lock granted after pause is released at once');

  r.lock.setActive(true);
  r.doc.hidden = true;
  finish();
  await r.flush();
  assert.equal(r.lock.active, false);
  assert.equal(r.sentinels[1].released, true, 'a lock granted after hiding is released at once');
});

test('Fjölspil guest page holds a wake lock across join, lobby and games, and lets go when closed or over', async () => {
  const doc = new FakeDocument(['spil']);
  doc.visibilityState = 'visible';
  const sentinels = [];
  const win = {
    location: { search: '?r=GULL', origin: 'https://mosi.fannar55.workers.dev', protocol: 'https:', host: 'mosi.fannar55.workers.dev' },
    navigator: {
      wakeLock: {
        request() {
          const s = fakeSentinel();
          sentinels.push(s);
          return Promise.resolve(s);
        },
      },
    },
    addEventListener() {},
  };
  let onMessage = null;
  createGuestPage(doc, {
    win,
    params: new URLSearchParams('?r=GULL'),
    net: () => ({ onMessage: fn => { onMessage = fn; }, onStatus() {}, send: () => true, reconnect() {}, close() {} }),
    views: { veiddu: () => {} },
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sentinels.length, 1, 'join screen holds the screen awake');
  assert.equal(sentinels[0].released, false);

  onMessage({ v: 1, type: 'view', seq: 1, body: { screen: 'veiddu', you: 1, turn: 0 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sentinels[0].released, false, 'stays awake while waiting for other players in a game');

  onMessage({ v: 1, type: 'view', seq: 2, body: { screen: 'over', winner: { name: 'Egill', avatar: 'egill' } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sentinels[0].released, true, 'releases when the game is over');
});

test('main.js, book frames and standalone games wire screen wake lock', () => {
  const read = rel => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
  assert.match(read('../main.js'), /const wakeLock = playing \? keepScreenAwake\(\) : null;/);
  assert.match(read('../engine/yatzy-junior/game.js'), /keepScreenAwake\(\)/);
  assert.match(read('../engine/memory/game.js'), /keepScreenAwake\(\)/);
  assert.match(read('../engine/sloedla/lab.js'), /keepScreenAwake\(\)/);

  const doc = new FakeDocument(['villa']);
  doc.getElementById('villa').hidden = true;
  const win = { location: { origin: 'https://mosi.fannar55.workers.dev' }, addEventListener() {}, removeEventListener() {} };
  const frame = createJuniorFrame(doc, { win });
  frame.open();
  const iframe = doc.body.querySelector('iframe');
  assert.match(iframe.getAttribute('allow'), /\bscreen-wake-lock\b/, 'book iframes delegate screen-wake-lock permission');
  frame.close();
});
