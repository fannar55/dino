// The service worker of the installed app (remake/sw.js, spec §6): once a whole version of the game is in the device's store
// and marked active, it answers the game from there, so the game plays with no net. Pages are found under every name the cloud
// answers them at, sounds are cut into ranges exactly as the cloud cuts them (Safari asks for ranges), and the download, the
// list and Fjölspil always go to the net. A new version takes over only when the app has one window, so nothing changes under
// a child who is playing in another.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createCaches } from './fake-caches.mjs';
import * as cloud from '../../cloud/src/range.mjs';

const ORIGIN = 'https://mosi.example';
const SOURCE = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const THEME = fs.readFileSync(new URL('../assets/audio/theme.mp3', import.meta.url));

/** sw.js loaded as the browser loads it, with a store, a net that records what it is asked, the given window clients, and the
 * clients known by id (`known`: { id: { url, frameType } }, what clients.get answers). */
function load({ windows = [{ frameType: 'top-level' }], known = {}, net = async () => new Response('from the net') } = {}) {
  const handlers = {};
  const fetched = [];
  const caches = createCaches(ORIGIN);
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, handler) => { handlers[type] = handler; },
    skipWaiting: async () => {},
    clients: { claim: async () => {}, matchAll: async () => windows, get: async id => known[id] },
  };
  const ctx = { self, caches, Response, Request, Headers, URL, fetch: async request => { fetched.push(request); return net(request); } };
  vm.runInNewContext(SOURCE, ctx);
  /** Sends an event to the worker; resolves to what it answered (respondWith), or undefined when it let the request pass. */
  async function dispatch(type, init = {}) {
    let answered;
    const waits = [];
    handlers[type]({ ...init, respondWith: promise => { answered = promise; }, waitUntil: promise => { waits.push(promise); } });
    await Promise.all(waits);
    return answered;
  }
  const get = (path, headers = {}) => dispatch('fetch', { request: new Request(ORIGIN + path, { headers }) });
  return { sw: self.forrit, caches, fetched, dispatch, get };
}

const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const LISTS = 'mosi-listar', FILES = 'mosi-skrar';

/** Puts a version's list and its files in the store: files is { path: [body, contentType] }, each hashed by its path. */
async function seed(caches, version, files) {
  const lists = await caches.open(LISTS), store = await caches.open(FILES);
  const listed = {};
  for (const [path, [body, type]] of Object.entries(files)) {
    const hash = `${version}${path.length}`.padEnd(16, '0') + path.replace(/\W/g, '').slice(-4);
    listed[path] = { size: body.length, hash };
    await store.put(`/remake/__skrar__/${hash}`, new Response(body, { headers: { 'content-type': type } }));
  }
  await lists.put(`/remake/__listar__/${version}`, json({ version, files: listed }));
}
const markActive = async (caches, version) => (await caches.open(LISTS)).put('/remake/__listar__/virk', json({ version }));

test('a page is found under every name the cloud answers it at', () => {
  const { sw } = load();
  const files = { '/remake/index.html': {}, '/remake/spil.html': {}, '/remake/yatzy-junior.html': {}, '/remake/assets/x.mp3': {} };
  const at = p => sw.fileFor(p, files);
  assert.equal(at('/remake/'), '/remake/index.html');
  assert.equal(at('/remake/spil'), '/remake/spil.html');
  assert.equal(at('/remake/spil.html'), '/remake/spil.html');
  assert.equal(at('/remake/yatzy-junior'), '/remake/yatzy-junior.html');
  assert.equal(at('/remake/assets/x.mp3'), '/remake/assets/x.mp3');
  assert.equal(at('/remake/nope.js'), null);
  assert.equal(at('/fjolspil/ws/GULL'), null);
});

test('the download, the list, Fjölspil and anything not plain go to the network', () => {
  const { sw } = load();
  const o = ORIGIN, r = (url, extra = {}) => ({ method: 'GET', url: o + url, cache: 'default', ...extra });
  assert.equal(sw.passesThrough(r('/remake/index.html'), o), false);
  for (const req of [r('/remake/a.png', { cache: 'reload' }), r('/remake/offline.json', { cache: 'no-store' }),
    r('/fjolspil/ws/GULL'), r('/remake/a.png', { method: 'POST' }), { method: 'GET', url: 'https://other.example/x', cache: 'default' }])
    assert.equal(sw.passesThrough(req, o), true, req.url);
});

test('a sound is cut from the store exactly as the cloud cuts it', () => {
  const { sw } = load();
  const total = THEME.length;
  const plain = sliced => sliced && { status: sliced.status, headers: { ...sliced.headers }, body: sliced.body && Buffer.from(sliced.body) };
  for (const range of ['bytes=0-99', `bytes=${total - 10}-${total + 5000}`, 'bytes=0-', 'bytes=1000000-', 'bytes=-50', 'bytes=90000000-', 'bytes=200-100'])
    assert.deepEqual(plain(sw.sliceRange(range, THEME, 'audio/mpeg')), plain(cloud.sliceRange(range, THEME, 'audio/mpeg')), range);
  for (const header of [null, '', 'bytes=-', 'bytes=0-1,5-6', 'items=0-1', 'bytes=a-b', 'bytes=5-'])
    assert.equal(sw.isByteRange(header), cloud.isByteRange(header), String(header));
});

test('with no active version every request goes to the network', async () => {
  const { caches, fetched, get } = load();
  await seed(caches, 'v1', { '/remake/index.html': ['<html>v1', 'text/html'] }); // listed and stored, but not yet active
  const answer = await get('/remake/');
  assert.equal(await answer.text(), 'from the net');
  assert.equal(fetched.length, 1);
});

test('the active version answers from the store, whole and in ranges, offline', async () => {
  const { caches, fetched, get } = load({ net: async () => { throw new TypeError('Failed to fetch'); } });
  await seed(caches, 'v1', {
    '/remake/index.html': ['<html>v1', 'text/html; charset=utf-8'],
    '/remake/spil.html': ['<html>spil', 'text/html; charset=utf-8'],
    '/remake/assets/audio/theme.mp3': [THEME, 'audio/mpeg'],
  });
  await markActive(caches, 'v1');

  const page = await get('/remake/');
  assert.equal(page.status, 200);
  assert.equal(page.redirected, false);
  assert.equal(await page.text(), '<html>v1');
  assert.equal(await (await get('/remake/spil?r=GULL')).text(), '<html>spil');

  const sound = await get('/remake/assets/audio/theme.mp3', { range: 'bytes=0-99' });
  assert.equal(sound.status, 206);
  assert.equal(sound.headers.get('content-range'), `bytes 0-99/${THEME.length}`);
  assert.equal(sound.headers.get('content-type'), 'audio/mpeg');
  assert.ok(Buffer.from(await sound.arrayBuffer()).equals(THEME.subarray(0, 100)));
  const whole = await get('/remake/assets/audio/theme.mp3');
  assert.equal(whole.status, 200);
  assert.ok(Buffer.from(await whole.arrayBuffer()).equals(THEME));

  assert.equal(fetched.length, 0, 'the net was never asked');
});

test('a version takes over only when it is the only window', async () => {
  const windows = [{ frameType: 'top-level' }, { frameType: 'top-level' }];
  const { caches, dispatch, get } = load({ windows, net: async () => { throw new TypeError('Failed to fetch'); } });
  await seed(caches, 'v1', { '/remake/index.html': ['<html>v1', 'text/html'] });
  await seed(caches, 'v2', { '/remake/index.html': ['<html>v2', 'text/html'] });
  await markActive(caches, 'v1');
  assert.equal(await (await get('/remake/')).text(), '<html>v1');

  const ask = async () => {
    const { port1, port2 } = new MessageChannel();
    const answer = new Promise(resolve => { port1.onmessage = event => { resolve(event.data); port1.close(); }; });
    await dispatch('message', { data: { type: 'forrit:virkja', version: 'v2' }, ports: [port2] });
    return answer;
  };
  const active = async () => (await (await caches.open(LISTS)).match('/remake/__listar__/virk')).json();

  assert.deepEqual({ ...(await ask()) }, { ok: false }, 'another window of the app is open');
  assert.deepEqual(await active(), { version: 'v1' });
  assert.equal(await (await get('/remake/')).text(), '<html>v1');

  windows.splice(1, 1, { frameType: 'top-level', url: `${ORIGIN}/remake/spil.html?r=GULL` }); // a guest tab is not Mosi: does not block
  assert.deepEqual({ ...(await ask()) }, { ok: true }, 'a non-Mosi tab does not hold Mosi back');
  assert.deepEqual(await active(), { version: 'v2' });
  assert.equal(await (await get('/remake/')).text(), '<html>v2');
});

test('only Mosi and the frames inside him answer from the store: another page in a tab of its own goes to the net', async () => {
  const known = {
    mosi: { url: `${ORIGIN}/remake/?forrit=uppsett`, frameType: 'top-level' },
    yatzy: { url: `${ORIGIN}/remake/yatzy-junior.html?inbook=1`, frameType: 'nested' }, // Litla Yatzy, a frame in the book
    song: { url: `${ORIGIN}/remake/sloedla-lab.html`, frameType: 'top-level' }, // Söngur Slóeðlu, not part of the app
  };
  const { sw, caches, fetched, dispatch } = load({ known });
  await seed(caches, 'v1', {
    '/remake/index.html': ['<html>v1', 'text/html'],
    '/remake/sloedla-lab.html': ['<html>song v1', 'text/html'],
    '/remake/spil.html': ['<html>spil v1', 'text/html'],
    '/remake/yatzy-junior.html': ['<html>yatzy v1', 'text/html'],
    '/remake/main.js': ['// v1', 'text/javascript'],
  });
  await markActive(caches, 'v1');
  // A navigation as the browser sends it (a Request made here cannot be one).
  const page = (path, destination = 'document') => ({ method: 'GET', url: ORIGIN + path, cache: 'default', mode: 'navigate', destination, headers: new Headers() });
  const asked = async (request, clientId = '') => {
    if (sw.passesThrough(request, ORIGIN)) return 'the browser';
    const answer = await dispatch('fetch', { request, clientId });
    return answer ? (await answer).text() : 'the browser';
  };
  const file = path => new Request(ORIGIN + path);

  assert.equal(await asked(page('/remake/')), '<html>v1');
  assert.equal(await asked(page('/remake/index.html?play=1')), '<html>v1');
  assert.equal(await asked(page('/remake/yatzy-junior.html?inbook=1', 'iframe')), '<html>yatzy v1');
  assert.equal(await asked(file('/remake/main.js'), 'mosi'), '// v1');
  assert.equal(await asked(file('/remake/main.js'), 'yatzy'), '// v1');
  assert.equal(await asked(file('/remake/main.js')), '// v1', 'a request with no client (a worker of the game) stays with the app');
  assert.equal(fetched.length, 0);

  assert.equal(await asked(page('/remake/sloedla-lab.html')), 'the browser');
  assert.equal(await asked(page('/remake/spil?r=GULL')), 'the browser');
  assert.equal(await asked(file('/remake/main.js'), 'song'), 'from the net');
});
