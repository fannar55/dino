// The guest page's test rig, shared by the guest's test files (fjolspil-guest.test.mjs, fjolspil-guest-yatzy.test.mjs): the
// page in a FakeDocument with a fake connection (net.message(...) brings what the big screen sends, net.statusFn(...) what the
// connection says, net.sent holds what the page sent), a phone's storage, timers that run when the test says, and the few
// helpers every test of the page uses.
import { FakeDocument, pointerEvent } from './fake-dom.mjs';
import { createGuestPage } from '../engine/fjolspil/guest.js';

export class FakeStorage { constructor() { this.map = new Map(); } getItem(k) { return this.map.get(k) ?? null; } setItem(k, v) { this.map.set(k, String(v)); } }
export function fakeNet() {
  const net = { sent: [], connected: [], reconnects: 0, status: 'idle', transport: null, onMessage: fn => { net.message = fn; }, onStatus: fn => { net.statusFn = fn; }, send: m => { net.sent.push(m); return true; }, reconnect() { net.reconnects += 1; }, close() {} };
  return net;
}
/** Timers that run when the test says: advance(ms) runs everything due by then, in order. */
export function fakeTimers() {
  let now = 0;
  let next = 1;
  const queue = new Map(); // id -> { at, fn }
  return {
    setTimeout(fn, ms = 0) { queue.set(next, { at: now + ms, fn }); return next++; },
    clearTimeout(id) { queue.delete(id); },
    get count() { return queue.size; },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...queue].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        queue.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = end;
    },
  };
}
export function rig({ search = '', storage = new FakeStorage(), views = {}, timers = fakeTimers(), now = () => 0 } = {}) {
  const doc = new FakeDocument(['spil']);
  const net = fakeNet();
  const listeners = {}; // the window's, by event type
  const win = { location: { search, origin: 'http://192.168.1.10:4198', protocol: 'http:', host: '192.168.1.10:4198' }, addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } };
  const page = createGuestPage(doc, { win, storage, params: new URLSearchParams(search), net: ({ code }) => { net.connected.push(code); return net; }, views, timers, now });
  const fire = type => { for (const fn of listeners[type] ?? []) fn(new Event(type)); };
  return { doc, page, net, storage, fire, timers, root: doc.getElementById('spil') };
}
export const $ = (root, s) => root.querySelector(s);
export const $$ = (root, s) => root.querySelectorAll(s);
export const view = (screen, body, seq) => ({ v: 1, type: 'view', seq, body: { screen, ...body } });
export const tap = el => { // a finger down and up where it landed, as book/fx.js's pressable counts a tap (book.test.mjs)
  el.dispatchEvent(pointerEvent('pointerdown', { x: 10, y: 10 }));
  el.dispatchEvent(pointerEvent('pointerup', { x: 10, y: 10 }));
};
