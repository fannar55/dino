// Mosi as an installed app that plays with no net (docs/superpowers/specs/2026-10-31-forrit-an-nets-design.md §7). On every
// start of the game page this registers the service worker (remake/sw.js) and, in the installed app, keeps the whole game in the
// device's store:
//   1. a version that was completed last time and is not yet active takes over first (with a reload when another was active);
//   2. the cloud's list (offline.json) is fetched; with no net the line says whether the game is all here;
//   3. the brake ({"burt":true}) removes the store and the worker;
//   4. what the device lacks is downloaded, four files at a time on the start screen and one at a time once Byrja is pressed, so
//      a chapter loading its song does not compete with it; each file is kept only when its size and fingerprint match;
//   5. a complete version takes over on the start screen; after Byrja it waits for the next start, never changing under play.
// The line under Byrja (index.html #forrit-lina) says how far it is, only on the start screen and only in the installed app.
// A browser tab never downloads the game; a tab beside the installed app (a PC or Android, where the two share one store and the
// worker answers both) keeps the kept version fresh, quietly. The rules themselves are in plan.js.
import { lineFor, missingOf, percentOf, unusedOf, isInstalled, mayRegister } from './plan.js';

const FILES = 'mosi-skrar';
const LISTS = 'mosi-listar';
const LIST_URL = '/remake/offline.json';
const listKey = name => `/remake/__listar__/${name}`;
const fileKey = hash => `/remake/__skrar__/${hash}`;
const lastPart = url => url.slice(url.lastIndexOf('/') + 1);
const hex = buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join('');
const asJson = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });

async function readJson(cache, key) {
  const found = await cache.match(key);
  return found ? found.json() : null;
}
const markOf = async (lists, name) => (await readJson(lists, listKey(name)))?.version ?? null;
const storedOf = async files => new Set((await files.keys()).map(request => lastPart(request.url)));

/** `promise`, or `fallback` when it has not settled within `ms`. */
function within(promise, ms, fallback) {
  let timer;
  const late = new Promise(resolve => { timer = setTimeout(() => resolve(fallback), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** Runs `work` on each item, `limit()` at a time; stops starting new ones after the first error, which it resolves to (else null). */
function pool(items, limit, work) {
  return new Promise(resolve => {
    let next = 0, running = 0, failure = null;
    const pump = () => {
      while (!failure && running < limit() && next < items.length) {
        const item = items[next++];
        running++;
        work(item).catch(error => { failure ??= error; }).finally(() => { running--; pump(); });
      }
      if (running === 0 && (failure || next >= items.length)) resolve(failure);
    };
    pump();
  });
}

export function createForrit({
  win = globalThis.window, doc = globalThis.document, line = doc?.getElementById('forrit-lina'),
  fetchImpl, cachesImpl, subtle, reload, channel,
} = {}) {
  let phase = null;        // { phase, percent } for lineFor
  let installed = false;   // the line belongs to the installed app only
  let onStartScreen = false;
  let started = false;
  let gone = false;        // the brake

  function show() {
    if (!line) return;
    if (installed && phase && !gone) {
      const text = lineFor(phase);
      if (line.textContent !== text) line.textContent = text;
    }
    line.hidden = !(installed && phase && onStartScreen && !started && !gone);
  }
  const setPhase = next => { phase = next; show(); };

  async function run() {
    if (!mayRegister(win)) return;
    const net = fetchImpl ?? ((...args) => win.fetch(...args));
    const store = cachesImpl ?? win.caches;
    const hasher = subtle ?? win.crypto.subtle;
    const restart = reload ?? (() => win.location.reload());
    const newChannel = channel ?? (() => new MessageChannel());
    const workers = win.navigator.serviceWorker;
    await workers.register('/remake/sw.js', { scope: '/remake/' });
    installed = isInstalled(win);
    if (!installed && !(await store.has(LISTS))) return; // a tab: the game is never downloaded here
    const lists = await store.open(LISTS);
    const files = await store.open(FILES);
    let virk = await markOf(lists, 'virk');
    if (!installed && !virk) return;

    /** Asks the worker to make `version` active; it refuses while another window of the app is open. */
    async function takeOver(version) {
      const ask = (async () => {
        const worker = (await workers.ready)?.active;
        if (!worker) return false;
        const { port1, port2 } = newChannel();
        try {
          const answer = new Promise(resolve => { port1.onmessage = event => resolve(Boolean(event.data?.ok)); });
          worker.postMessage({ type: 'forrit:virkja', version }, [port2]);
          return await within(answer, 10000, false);
        } finally {
          port1.close?.();
        }
      })();
      return within(ask, 15000, false);
    }

    /** Keeps only the lists of `versions`, the three marks and the files those lists use. */
    async function tidy(versions) {
      const kept = [];
      for (const version of new Set(versions.filter(Boolean))) {
        const list = await readJson(lists, listKey(version));
        if (list) kept.push(list);
      }
      if (!kept.length) return;
      const names = new Set(['virk', 'tilbuin', 'sidast', ...kept.map(list => list.version)]);
      for (const request of await lists.keys()) if (!names.has(lastPart(request.url))) await lists.delete(request);
      for (const hash of unusedOf(await storedOf(files), kept)) await files.delete(fileKey(hash));
    }

    // 1. A version completed last time takes over before anything else.
    const tilbuin = await markOf(lists, 'tilbuin');
    if (tilbuin && tilbuin !== virk) {
      const ok = await takeOver(tilbuin);
      if (ok && virk) { restart(); return; }
      if (ok) virk = tilbuin;
    }

    // 2. The cloud's list; with no net, the game plays from what is kept.
    let list;
    try {
      const response = await net(LIST_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`${LIST_URL}: ${response.status}`);
      list = await response.json();
      if (!list.burt && (typeof list.version !== 'string' || !list.files)) throw new Error(`${LIST_URL}: not a list`);
    } catch {
      if (virk) { setPhase({ phase: 'ready' }); return; }
      const begun = await markOf(lists, 'sidast');
      const begunList = begun && await readJson(lists, listKey(begun));
      setPhase({ phase: 'needNet', percent: begunList ? percentOf(begunList, await storedOf(files)) : 0 });
      return;
    }

    // 3. The brake.
    if (list.burt) {
      gone = true;
      show();
      await store.delete(FILES);
      await store.delete(LISTS);
      for (const registration of await workers.getRegistrations()) await registration.unregister();
      return;
    }

    // 4. Nothing new.
    if (list.version === virk) {
      setPhase({ phase: 'ready' });
      if (tilbuin && tilbuin !== virk) await lists.delete(listKey('tilbuin')); // the cloud went back to the active version
      await tidy([virk]);
      return;
    }

    // 5. Download what is missing.
    await lists.put(listKey(list.version), asJson(list));
    await lists.put(listKey('sidast'), asJson({ version: list.version }));
    const kind = virk ? 'update' : 'first';
    Promise.resolve().then(() => win.navigator.storage?.persist?.()).catch(() => {});
    const stored = await storedOf(files);
    setPhase({ phase: kind, percent: percentOf(list, stored) });
    const failure = await pool(missingOf(list, stored), () => (started ? 1 : 4), async file => {
      const response = await net(file.path, { cache: 'reload' }); // never the browser's day-old copy
      if (!response.ok) return;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== file.size) return; // a newer deploy's file: not kept, fetched again next start
      if (hex(await hasher.digest('SHA-256', bytes)).slice(0, 16) !== file.hash) return;
      const type = response.headers.get('content-type') ?? 'application/octet-stream';
      await files.put(fileKey(file.hash), new Response(bytes, { headers: { 'content-type': type, 'content-length': String(bytes.byteLength) } }));
      stored.add(file.hash);
      setPhase({ phase: kind, percent: percentOf(list, stored) });
    });
    if (failure) {
      setPhase({ phase: failure.name === 'QuotaExceededError' ? 'full' : 'needNet', percent: percentOf(list, stored) });
      return;
    }
    if (missingOf(list, stored).length) { // a file did not match: the next start fetches it
      setPhase({ phase: virk ? 'ready' : 'needNet', percent: percentOf(list, stored) });
      return;
    }

    // 6. Complete: it takes over now on the start screen, or at the next start.
    await lists.put(listKey('tilbuin'), asJson({ version: list.version }));
    if (started) return;
    if (!(await takeOver(list.version))) return;
    await tidy([list.version]);
    if (virk) { restart(); return; }
    setPhase({ phase: 'ready' });
  }

  const done = run().catch(error => { console.warn('[forrit]', error); });

  return {
    /** The start screen shows Byrja: the line may show. */
    startScreen() { onStartScreen = true; show(); },
    /** The child pressed Byrja (or the page plays at once): the line goes, and the download takes one file at a time. */
    started() { started = true; show(); },
    done,
  };
}
