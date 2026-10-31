// The service worker of Mosi as an installed app (docs/superpowers/specs/2026-10-31-forrit-an-nets-design.md §6). The page
// (engine/offline/forrit.js) downloads the whole game into the device's store and tells this worker when a complete version
// may take over. From then on the worker answers the game from the store, so it plays with no net:
//   - only GET requests of this site, for a file on the active version's list whose bytes are in the store;
//   - everything else goes to the net as before: Fjölspil's room, files not on the list, and the download itself and the list
//     (they ask with cache 'reload' and 'no-store');
//   - until the first whole version is in the store and active it answers nothing, so the game is never half there.
// A classic script with no import: the iPad may not run a service worker written as a module. So the byte ranges are cut by
// its own copy of the rules in cloud/src/range.mjs; remake/tests/forrit-sw.test.mjs runs the same cases on both and keeps them
// the same.
//
// The store (Cache Storage): 'mosi-skrar' holds each file once under its fingerprint (/remake/__skrar__/<hash>), 'mosi-listar'
// the lists (/remake/__listar__/<version>) and three marks, {"version": …}: 'virk' (active, written only here), 'tilbuin'
// (complete) and 'sidast' (the last list begun), both written by the page.
'use strict';

const FILES = 'mosi-skrar';
const LISTS = 'mosi-listar';
const listKey = name => `/remake/__listar__/${name}`;
const fileKey = hash => `/remake/__skrar__/${hash}`;

/** The file on the list a path is answered with: a folder's index.html, the path itself, or the page the cloud serves without .html. */
function fileFor(pathname, files) {
  const listed = path => Object.prototype.hasOwnProperty.call(files, path);
  if (pathname.endsWith('/')) return listed(`${pathname}index.html`) ? `${pathname}index.html` : null;
  if (listed(pathname)) return pathname;
  if (listed(`${pathname}.html`)) return `${pathname}.html`;
  return null;
}

/** Whether a request goes straight to the net: not a GET, another site, the download or the list, or Fjölspil. */
function passesThrough({ method, url, cache }, origin) {
  if (method !== 'GET' || cache === 'reload' || cache === 'no-store') return true;
  const address = new URL(url);
  return address.origin !== origin || address.pathname.startsWith('/fjolspil/');
}

// --- Byte ranges: a copy of cloud/src/range.mjs (bytes=a-b, bytes=a-, bytes=-n; one range only). ---
const RANGE = /^bytes=(\d*)-(\d*)$/;

function isByteRange(rangeHeader) {
  const range = RANGE.exec(rangeHeader ?? '');
  return range !== null && (range[1] !== '' || range[2] !== '');
}

function sliceRange(rangeHeader, body, contentType) {
  if (!isByteRange(rangeHeader)) return null;
  const [, first, last] = RANGE.exec(rangeHeader);
  const bytes = body instanceof Uint8Array ? body : new Uint8Array(body);
  const total = bytes.length;
  const start = first ? Number(first) : Math.max(0, total - Number(last));
  const end = first && last ? Math.min(Number(last), total - 1) : total - 1;
  if (start >= total || start > end) return { status: 416, headers: { 'Content-Range': `bytes */${total}` }, body: null };
  const headers = {
    'Content-Range': `bytes ${start}-${end}/${total}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': String(end - start + 1),
  };
  if (contentType) headers['Content-Type'] = contentType;
  return { status: 206, headers, body: bytes.slice(start, end + 1) };
}
// --- end of the copy ---

// The active version's list, read from the store on the first request after the worker starts, and kept until a new version
// takes over. While there is none it is read again on each request, since the first version may take over at any time.
let active = null;

async function activeList() {
  if (active) return active;
  const lists = await caches.open(LISTS);
  const mark = await lists.match(listKey('virk'));
  if (!mark) return null;
  const { version } = await mark.json();
  const list = await lists.match(listKey(version));
  if (!list) return null;
  active = { version, files: (await list.json()).files };
  return active;
}

/** A stored file as a fresh answer: whole (200), or the byte range asked for (206, or 416 past the end). */
async function fromStore(stored, range) {
  const headers = new Headers(stored.headers);
  if (isByteRange(range)) {
    const sliced = sliceRange(range, await stored.arrayBuffer(), headers.get('content-type'));
    return new Response(sliced.body, { status: sliced.status, headers: sliced.headers });
  }
  return new Response(stored.body, { status: 200, headers });
}

async function answer(request) {
  try {
    const list = await activeList();
    const name = list && fileFor(new URL(request.url).pathname, list.files);
    const stored = name && await (await caches.open(FILES)).match(fileKey(list.files[name].hash));
    if (stored) return await fromStore(stored, request.headers.get('range'));
  } catch {
    // The store could not be read: the net answers, as before the app was installed.
  }
  return fetch(request);
}

/** Makes `version` active, unless another window of the app is open: nothing changes under a child playing there. */
async function takeOver(version) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (windows.filter(client => client.frameType === 'top-level').length > 1) return false;
  const lists = await caches.open(LISTS);
  const list = await lists.match(listKey(version));
  if (!list) return false;
  const { files } = await list.json();
  await lists.put(listKey('virk'), new Response(JSON.stringify({ version }), { headers: { 'content-type': 'application/json' } }));
  active = { version, files };
  return true;
}

self.addEventListener('install', event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', event => {
  if (passesThrough(event.request, self.location.origin)) return;
  event.respondWith(answer(event.request));
});

self.addEventListener('message', event => {
  const { data } = event;
  if (!data || data.type !== 'forrit:virkja') return;
  const port = event.ports && event.ports[0];
  event.waitUntil(takeOver(data.version).catch(() => false).then(ok => { if (port) port.postMessage({ ok }); }));
});

// For the tests (remake/tests/forrit-sw.test.mjs).
self.forrit = { fileFor, passesThrough, isByteRange, sliceRange };
