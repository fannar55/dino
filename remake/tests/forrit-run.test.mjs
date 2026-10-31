// The installed app's download (remake/engine/offline/forrit.js, spec §7): on each start it fetches the cloud's list, downloads
// what the device lacks (four at a time on the start screen, one at a time once the child pressed Byrja), keeps a file only when
// its size and fingerprint match, and says how far it is in the line under Byrja. A complete new version takes over on the start
// screen, never in the middle of play. With no net the game plays from what is kept; a full device and the brake are said and
// obeyed. A browser tab never downloads the game, and the home server never registers the worker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createForrit } from '../engine/offline/forrit.js';
import { offlineList } from '../../cloud/src/offline-list.mjs';
import { createCaches } from './fake-caches.mjs';
import { FakeDocument } from './fake-dom.mjs';

const NB = ' ';
const APP = 'http://localhost:8797/remake/?forrit=uppsett';
const TAB = 'http://localhost:8797/remake/?forrit=1';
const LIST = '/remake/offline.json';
const offline = async () => { throw new TypeError('Failed to fetch'); };
const typeOf = path => (path.endsWith('.html') ? 'text/html' : path.endsWith('.mp3') ? 'audio/mpeg' : 'application/octet-stream');

/**
 * The cloud: a site { path: text } and its list. `served` may give other bytes for a path (a newer deploy landing mid-download),
 * and `answer(path, init, plain)` may stand in for any fetch, with `plain` the cloud's own answer. Every fetch is recorded.
 */
function cloud(site) {
  const state = { site, served: {}, answer: null, burt: false, fetched: [] };
  state.list = () => offlineList(Object.entries(state.site).map(([path, text]) => ({ rel: path.slice(1), bytes: Buffer.from(text) })));
  const plain = async path => {
    if (path === LIST) return Response.json(state.burt ? { burt: true } : state.list());
    const text = state.served[path] ?? state.site[path];
    return text === undefined ? new Response('not here', { status: 404 }) : new Response(Buffer.from(text), { headers: { 'content-type': typeOf(path) } });
  };
  state.fetchImpl = async (path, init) => {
    state.fetched.push([path, init]);
    return state.answer ? state.answer(path, init, plain) : plain(path, init);
  };
  state.files = () => state.fetched.map(([path]) => path).filter(path => path !== LIST);
  return state;
}

/** A device: its store, and the game's window; the worker answers forrit:virkja with `answer` and, when ok, marks the version active. */
function device() {
  const caches = createCaches('http://localhost:8797');
  const dev = { caches, posted: [], registered: [], unregistered: 0, reloads: 0, answer: { ok: true } };
  const registration = {
    active: {
      postMessage(message, [port]) {
        dev.posted.push(message);
        const { ok } = dev.answer;
        const mark = ok ? caches.open('mosi-listar').then(lists => lists.put('/remake/__listar__/virk', Response.json({ version: message.version }))) : Promise.resolve();
        mark.then(() => port.postMessage({ ok }));
      },
    },
    unregister: async () => { dev.unregistered++; return true; },
  };
  const window = (href, display) => ({
    location: new URL(href),
    matchMedia: query => ({ matches: query === `(display-mode: ${display})` }),
    navigator: {
      serviceWorker: {
        register: async (url, options) => { dev.registered.push([url, options]); return registration; },
        ready: Promise.resolve(registration),
        getRegistrations: async () => [registration],
      },
      storage: { persist: async () => true },
    },
  });
  /** One start of the game page; its line records every text it is given. */
  dev.start = (site, { href = APP, display = 'browser', startScreen = true } = {}) => {
    const doc = new FakeDocument(['forrit-lina']);
    const line = doc.getElementById('forrit-lina');
    line.hidden = true;
    const texts = [];
    let text = '';
    Object.defineProperty(line, 'textContent', { get: () => text, set: value => { text = value; texts.push(value); } });
    site.fetched.length = 0;
    const forrit = createForrit({
      win: window(href, display), doc, fetchImpl: site.fetchImpl, cachesImpl: caches, subtle: globalThis.crypto.subtle,
      reload: () => { dev.reloads++; }, channel: () => new MessageChannel(),
    });
    if (startScreen) forrit.startScreen();
    return { forrit, line, texts };
  };
  return dev;
}

const storedHashes = async caches => new Set((await (await caches.open('mosi-skrar')).keys()).map(request => request.url.split('/').pop()));
const markOf = async (caches, name) => {
  const found = await (await caches.open('mosi-listar')).match(`/remake/__listar__/${name}`);
  return found ? (await found.json()).version : null;
};
const SITE = () => ({ '/remake/index.html': '<html>mosi', '/remake/assets/a.mp3': 'a sound', '/dist/vendor/three.module.js': 'three' });
const manyFiles = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [`/remake/assets/f${i}.png`, `file ${i}`]));
const turn = () => new Promise(resolve => setImmediate(resolve));
const until = async check => { for (let i = 0; i < 1000 && !check(); i++) await turn(); };

test('the first download stores every file and the line counts up to ready', async () => {
  const site = cloud(SITE()), dev = device();
  const { forrit, line, texts } = dev.start(site);
  await forrit.done;
  const list = site.list();
  const stored = await storedHashes(dev.caches);
  for (const [path, { hash }] of Object.entries(list.files)) assert.ok(stored.has(hash), path);
  for (const [path, init] of site.fetched) assert.equal(init.cache, path === LIST ? 'no-store' : 'reload', path);
  assert.equal(texts[0], `Sæki leikinn í tækið … 0${NB}%`);
  assert.equal(texts.at(-1), 'Tilbúinn án nets ✓');
  assert.equal(line.hidden, false);
  assert.equal(await markOf(dev.caches, 'virk'), list.version);
  assert.equal(dev.reloads, 0, 'the first version needs no reload');
});

test('four at a time on the start screen, one at a time after Byrja', async () => {
  const site = cloud(manyFiles(12)), dev = device();
  const waiting = [];
  let inFlight = 0, most = 0;
  site.answer = (path, init, plain) => {
    if (path === LIST) return plain(path);
    inFlight++; most = Math.max(most, inFlight);
    return new Promise(resolve => waiting.push(() => { inFlight--; resolve(plain(path)); }));
  };
  const { forrit } = dev.start(site);
  await until(() => waiting.length === 4);
  await turn();
  assert.equal(most, 4, 'four at once on the start screen');

  forrit.started();
  for (const release of waiting.splice(0)) release();
  most = 0;
  while ((await storedHashes(dev.caches)).size < 12) {
    await until(() => waiting.length > 0);
    waiting.shift()?.();
    await turn();
  }
  await forrit.done;
  assert.equal(most, 1, 'one at a time after Byrja');
});

test('a file whose fingerprint is wrong is not kept, and the next start fetches only what is missing', async () => {
  const site = cloud(SITE()), dev = device();
  site.served['/remake/assets/a.mp3'] = 'a SOUND'; // a newer deploy's bytes, the same size
  const first = dev.start(site);
  await first.forrit.done;
  const list = site.list();
  assert.equal((await storedHashes(dev.caches)).has(list.files['/remake/assets/a.mp3'].hash), false);
  assert.equal(await markOf(dev.caches, 'tilbuin'), null);
  assert.notEqual(first.texts.at(-1), 'Tilbúinn án nets ✓');

  delete site.served['/remake/assets/a.mp3'];
  const second = dev.start(site);
  await second.forrit.done;
  assert.deepEqual(site.fetched.map(([path]) => path), [LIST, '/remake/assets/a.mp3']);
  assert.equal(second.texts.at(-1), 'Tilbúinn án nets ✓');
});

test('a new version before Byrja takes over at once with a reload; after Byrja it waits for the next start', async () => {
  // (a) on the start screen
  const site = cloud(SITE()), dev = device();
  await dev.start(site).forrit.done;
  const v1 = site.list();
  site.site['/remake/assets/a.mp3'] = 'a new sound';
  const v2 = site.list();
  const update = dev.start(site);
  await update.forrit.done;
  assert.deepEqual(site.files(), ['/remake/assets/a.mp3'], 'only the changed file');
  assert.ok(update.texts.some(text => text.startsWith('Sæki nýja útgáfu … ')), update.texts.join(' | '));
  assert.deepEqual({ ...dev.posted.at(-1) }, { type: 'forrit:virkja', version: v2.version });
  assert.equal(dev.reloads, 1);
  const stored = await storedHashes(dev.caches);
  assert.equal(stored.has(v1.files['/remake/assets/a.mp3'].hash), false, 'the old sound is gone');
  assert.equal(stored.has(v2.files['/remake/assets/a.mp3'].hash), true);

  // (b) the child pressed Byrja before the new version was all there
  site.site['/remake/assets/a.mp3'] = 'a third sound';
  const v3 = site.list();
  const playing = dev.start(site);
  playing.forrit.started();
  await playing.forrit.done;
  assert.equal(dev.reloads, 1, 'no reload while playing');
  assert.equal(await markOf(dev.caches, 'tilbuin'), v3.version);
  assert.equal(await markOf(dev.caches, 'virk'), v2.version);
  assert.equal(playing.line.hidden, true);

  const next = dev.start(site);
  await next.forrit.done;
  assert.deepEqual({ ...dev.posted.at(-1) }, { type: 'forrit:virkja', version: v3.version });
  assert.equal(dev.reloads, 2, 'the next start takes it over at once');
  assert.deepEqual(site.fetched, [], 'before anything else');
});

test('without a network the line says ready when a version is kept, otherwise how far it got', async () => {
  const site = cloud(SITE()), dev = device();
  await dev.start(site).forrit.done;
  site.answer = offline;
  const kept = dev.start(site);
  await kept.forrit.done;
  assert.deepEqual(kept.texts, ['Tilbúinn án nets ✓']);
  assert.equal(kept.line.hidden, false);

  const half = cloud({ '/remake/a.png': 'aaaa', '/remake/b.png': 'bbbb' }), other = device();
  half.answer = (path, init, plain) => (path === '/remake/b.png' ? offline() : plain(path)); // the net drops before the second file
  await other.start(half).forrit.done;
  half.answer = offline;
  const cut = other.start(half);
  await cut.forrit.done;
  assert.deepEqual(cut.texts, [`Vantar net til að klára (50${NB}%)`]);
});

test('a full device says so and stops', async () => {
  const site = cloud(manyFiles(8)), dev = device();
  (await dev.caches.open('mosi-skrar')).put = async () => { throw new DOMException('full', 'QuotaExceededError'); };
  const { forrit, texts } = dev.start(site);
  await forrit.done;
  assert.equal(texts.at(-1), 'Ekki nóg pláss í tækinu');
  assert.ok(site.files().length <= 4, `no further fetches (${site.files().length})`);
});

test('the brake removes everything', async () => {
  const site = cloud(SITE()), dev = device();
  await dev.start(site).forrit.done;
  site.burt = true;
  const { forrit, line } = dev.start(site);
  await forrit.done;
  assert.deepEqual(await dev.caches.keys(), []);
  assert.ok(dev.unregistered >= 1);
  assert.equal(line.hidden, true);
});

test('a browser tab and the home server never download', async () => {
  const site = cloud(SITE()), dev = device();
  const tab = dev.start(site, { href: TAB });
  await tab.forrit.done;
  assert.equal(dev.registered.length, 1, 'the worker is registered');
  assert.deepEqual(site.fetched, [], 'nothing is downloaded');
  assert.equal(tab.line.hidden, true);

  const home = device();
  await home.start(site, { href: 'http://localhost:4231/remake/' }).forrit.done;
  assert.equal(home.registered.length, 0);
});

test('a tab beside the installed app keeps the kept version fresh, quietly', async () => {
  // On a PC or Android the app and the browser share one store, and the worker answers tabs from it too.
  const site = cloud(SITE()), dev = device();
  await dev.start(site).forrit.done;
  site.site['/remake/assets/a.mp3'] = 'a new sound';
  const v2 = site.list();
  const tab = dev.start(site, { href: TAB });
  await tab.forrit.done;
  assert.deepEqual(site.files(), ['/remake/assets/a.mp3']);
  assert.equal(await markOf(dev.caches, 'virk'), v2.version);
  assert.equal(tab.line.hidden, true);
  assert.deepEqual(tab.texts, [], 'no line in a tab');
});
