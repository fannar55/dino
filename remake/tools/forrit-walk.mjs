#!/usr/bin/env node
// Mosi as an installed app, walked end to end (docs/superpowers/specs/2026-10-31-forrit-an-nets-design.md §10): the staged site
// served by wrangler dev at http://127.0.0.1:8797, and headless Edge over raw CDP as one device (1180×820, a fresh profile of its
// own, its save holding Kambeðla's and Þórseðla's stars so the book's Leikir page has Eitt!, Háls og hali and Litla Yatzy).
//   1. A tab (?forrit=1): the worker is registered, nothing is downloaded and the list is never asked for.
//   2. The installed app (?forrit=uppsett): the line counts from „Sæki leikinn í tækið“ to „Tilbúinn án nets ✓“ (never 5 min
//      standing still), and the store holds every file of the list.
//   3. Offline (wrangler stopped): every listed file answers from the store with its size; Byrja starts the chapter; the book
//      opens on every ribbon; Eitt!, Háls og hali and Litla Yatzy open and close; Fjölspil says „Fjölspil þarf net“; no file the
//      game asks for is missing, and no console error but the net's.
//   4. A new version (a line added to remake/README.md in the site): only that file is fetched, the page reloads itself once on
//      the start screen, the new version is active and the old README is gone from the store.
//   5. The guest's page (spil.html) never asks for the list, and comes from the net, not the app's store.
// Shots and report.json go to qa/remake/forrit/walk/; the exit code is 1 when a check fails. At the end wrangler's whole process
// tree is stopped (a workerd left behind locks cloud/site) and the site is staged again.
//   node remake/tools/forrit-walk.mjs [--lock <dir>]   (--lock: the one-capture-at-a-time lock, a dir taken with mkdir and given
//                                                       back; EDGE_PATH= another Edge or Chrome; WRANGLER= another wrangler)
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { writeOfflineList } from '../../cloud/src/offline-list.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLOUD = path.join(ROOT, 'cloud');
const SITE = path.join(CLOUD, 'site');
const OUT = path.join(ROOT, 'qa/remake/forrit/walk');
const PORT = 8797;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const WRANGLER = process.env.WRANGLER ?? 'wrangler';
const lockAt = process.argv.indexOf('--lock');
const LOCK = lockAt > 0 ? process.argv[lockAt + 1] : null;
const SAVE = { stars: ['k1_kambedla', 'k2_thorsedla'], findings: [], seen: [], places: [] };
const READY = 'Tilbúinn án nets ✓';
const NEEDS_NET = 'Fjölspil þarf net';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const js = value => JSON.stringify(value);

fs.mkdirSync(OUT, { recursive: true });
const report = { origin: ORIGIN, started: new Date().toISOString(), checks: [], shots: [], errors: [], failedLoads: [] };
function check(name, ok, detail = null) {
  report.checks.push({ name, ok: Boolean(ok), ...(detail === null ? {} : { detail }) });
  console.log(`${ok ? 'ok ' : 'NOT'} ${name}${detail === null ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}

/** `promise`, or a rejection with `message` after `ms`; the timer never outlives it. */
function within(promise, ms, message) {
  let timer;
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message())), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

// ---- the lock, the site and the cloud -----------------------------------------------------------------------------------

let locked = false;
async function takeLock() {
  if (!LOCK) return;
  for (let waited = 0; ; waited += 5000) {
    try {
      fs.mkdirSync(LOCK);
      locked = true;
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (waited === 0) console.log(`waiting for the capture lock ${LOCK}`);
      if (waited >= 30 * 60000) throw new Error('the capture lock stayed taken for 30 min');
      await sleep(5000);
    }
  }
}

function stage() {
  const run = spawnSync(process.execPath, [path.join(CLOUD, 'stage.mjs')], { cwd: ROOT, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`stage.mjs: ${(run.stderr || run.stdout).trim()}`);
  return run.stdout.trim();
}

// Edge's launcher hands the browser to another process and exits, so the launcher's process tree does not hold the browser:
// every Edge process that uses this walk's profile folder is stopped.
function stopEdge() {
  if (edge) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { encoding: 'utf8' });
  if (!userDir) return;
  const script = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${userDir}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
}

const workerdRunning = () => /workerd\.exe/i.test(spawnSync('tasklist', ['/FI', 'IMAGENAME eq workerd.exe', '/NH'], { encoding: 'utf8' }).stdout ?? '');

let wrangler = null;
async function startWrangler() {
  const child = spawn(WRANGLER, ['dev', '--ip', '127.0.0.1', '--port', String(PORT)], { cwd: CLOUD, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  wrangler = child;
  let log = '';
  const ready = new Promise((resolve, reject) => {
    const hear = chunk => { log += chunk; if (/Ready on/.test(log)) resolve(); };
    child.stdout.on('data', hear);
    child.stderr.on('data', hear);
    child.on('exit', code => reject(new Error(`wrangler dev ended (${code}): ${log.slice(-600)}`)));
  });
  await within(ready, 90000, () => `wrangler dev was not ready in 90 s: ${log.slice(-600)}`);
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${ORIGIN}/remake/offline.json`, { cache: 'no-store' })).ok) return; } catch { /* not yet */ }
    await sleep(200);
  }
  throw new Error('wrangler dev never answered');
}

/** Stops wrangler with its whole process tree (cmd, node, workerd) and waits until no workerd is left. */
async function stopWrangler() {
  if (!wrangler) return;
  spawnSync('taskkill', ['/PID', String(wrangler.pid), '/T', '/F'], { encoding: 'utf8' });
  wrangler = null;
  for (let i = 0; i < 50 && workerdRunning(); i++) await sleep(200);
}

// ---- the browser --------------------------------------------------------------------------------------------------------

let edge = null, ws = null, userDir = null;
let lastId = 0;
const pending = new Map();
const cdp = (method, params = {}, sessionId) => {
  const id = ++lastId;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};

const requests = []; // { url, at } as the page asked
const responses = []; // { url, status, type, fromServiceWorker }
const failures = []; // same-site loads that failed: { url, error }
let navigations = 0; // the main frame's
let errors = []; // console errors and exceptions

async function openBrowser() {
  userDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'forrit-walk-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== '__COMPAT_LAYER'));
  edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDir}`, '--window-size=1180,820', '--no-first-run', '--disable-extensions', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: 'ignore', env });
  const portFile = path.join(userDir, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await sleep(100);
  let port = [];
  for (let i = 0; i < 50; i++) { port = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/); if (port.length >= 2) break; await sleep(100); }
  ws = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', event => {
    const msg = JSON.parse(String(event.data));
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
      return;
    }
    const { method, params } = msg;
    if (method === 'Network.requestWillBeSent') requests.push({ url: params.request.url, id: params.requestId });
    else if (method === 'Network.responseReceived') responses.push({ url: params.response.url, status: params.response.status, type: params.type, fromServiceWorker: Boolean(params.response.fromServiceWorker) });
    else if (method === 'Network.loadingFailed') {
      const asked = requests.findLast(r => r.id === params.requestId);
      if (asked?.url.startsWith(ORIGIN)) failures.push({ url: asked.url, error: params.errorText });
    } else if (method === 'Page.frameNavigated' && !params.frame.parentId) navigations++;
    else if (method === 'Runtime.exceptionThrown') errors.push(params.exceptionDetails.exception?.description || params.exceptionDetails.text);
    else if (method === 'Runtime.consoleAPICalled' && params.type === 'error') errors.push(params.args.map(a => a.value ?? a.description).join(' '));
  });

  // The device's one page, in the browser's own profile (on disk, so the store may hold the whole game).
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  const send = (method, params) => cdp(method, params, sessionId);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1180, height: 820, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { if (location.origin === ${js(ORIGIN)} && !localStorage.getItem('mosi-remake-v1')) localStorage.setItem('mosi-remake-v1', ${js(JSON.stringify(SAVE))}); } catch {}`,
  });
  const ev = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const until = async (expression, timeout = 30000, every = 150) => {
    for (const end = Date.now() + timeout; Date.now() < end; await sleep(every)) if (await ev(expression).catch(() => false)) return true;
    return false;
  };
  const loaded = address => until(`document.readyState === 'complete' && location.href === ${js(address)}`, 60000);
  const go = async address => { await send('Page.navigate', { url: address }); return loaded(address); };
  const reload = async () => { const at = await ev('location.href'); await send('Page.reload', {}); await sleep(300); return loaded(at); };
  const visible = selector => `[...document.querySelectorAll(${js(selector)})].find(el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !el.disabled && getComputedStyle(el).visibility !== 'hidden'; })`;
  const tap = async (selector, timeout = 10000) => {
    if (!(await until(`Boolean(${visible(selector)})`, timeout))) throw new Error(`nothing to tap: ${selector}`);
    const at = await ev(`(() => { const b = ${visible(selector)}.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
  };
  const shot = async file => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, file), Buffer.from(data, 'base64'));
    report.shots.push(`qa/remake/forrit/walk/${file}`);
  };
  return { ev, until, go, reload, tap, shot, visible };
}

// What the page's store holds: the active version, its list and the fingerprints kept.
const STORE = `(async () => {
  const lists = await caches.open('mosi-listar');
  const mark = await lists.match('/remake/__listar__/virk');
  const virk = mark ? (await mark.json()).version : null;
  const list = virk ? await (await lists.match('/remake/__listar__/' + virk)).json() : null;
  const kept = (await caches.has('mosi-skrar')) ? (await (await caches.open('mosi-skrar')).keys()).map(r => r.url.split('/').pop()) : [];
  return { virk, listed: list ? Object.keys(list.files).length : 0, kept };
})()`;
const LINE = `(document.getElementById('forrit-lina')?.textContent ?? null)`; // in brackets: `??` binds looser than `===`
const pathOf = url => new URL(url).pathname;
const asked = (since, file) => requests.slice(since).some(r => r.url.startsWith(ORIGIN) && pathOf(r.url) === file);
const netErrors = list => list.filter(text => !/WebSocket|Failed to load resource|net::ERR_|Failed to fetch|NetworkError/i.test(String(text)));

// ---- the walk -----------------------------------------------------------------------------------------------------------

let failed = null;
try {
  await takeLock();
  if (workerdRunning()) throw new Error('a workerd is already running: stop it first (it would lock cloud/site)');
  report.staged = stage();
  await startWrangler();
  const page = await openBrowser();

  // 1. A tab.
  let since = requests.length;
  await page.go(`${ORIGIN}/remake/?forrit=1`);
  await sleep(8000);
  const tab = await page.ev(`(async () => ({ registered: (await navigator.serviceWorker.getRegistrations()).length, ...(await ${STORE}) }))()`);
  check('a tab: the worker is registered', tab.registered === 1, { registered: tab.registered });
  check('a tab: nothing is downloaded', tab.kept.length === 0, { kept: tab.kept.length });
  check('a tab: the list is never asked for', !asked(since, '/remake/offline.json'));

  // 2. The installed app downloads the whole game.
  const staged = JSON.parse(fs.readFileSync(path.join(SITE, 'remake/offline.json'), 'utf8'));
  await page.go(`${ORIGIN}/remake/?forrit=uppsett`);
  const counting = await page.until(`(${LINE})?.startsWith('Sæki leikinn í tækið')`, 60000, 100);
  check('the app: the line says it is downloading the game', counting, await page.ev(LINE));
  const startedAt = Date.now();
  // Done while the line keeps moving: wrangler dev on a busy machine serves 195 MB slowly (7 to over 10 min), a stuck download
  // stands still. At most 5 min without a change, and 30 min in all.
  let ready = false;
  for (let seen = null, movedAt = Date.now(); Date.now() - movedAt < 5 * 60000 && Date.now() - startedAt < 30 * 60000; await sleep(1000)) {
    const now = await page.ev(LINE);
    if (now === READY) { ready = true; break; }
    if (now !== seen) { seen = now; movedAt = Date.now(); }
  }
  check(`the app: the line reads „${READY}“`, ready, { line: await page.ev(LINE), seconds: Math.round((Date.now() - startedAt) / 1000) });
  const store = await page.ev(STORE);
  const wanted = [...new Set(Object.values(staged.files).map(file => file.hash))];
  const kept = new Set(store.kept);
  const missing = wanted.filter(hash => !kept.has(hash));
  check('the app: the store holds every file of the list, and its version is active', store.virk === staged.version && missing.length === 0,
    { virk: store.virk, version: staged.version, files: Object.keys(staged.files).length, distinct: wanted.length, kept: kept.size, missing: missing.slice(0, 5) });
  await page.until(`!document.getElementById('start').hidden`, 120000);
  check('the app: the line shows under Byrja', await page.ev(`!document.getElementById('forrit-lina').hidden`));
  await page.shot('1-tilbuinn.png');

  // 3. Offline.
  await stopWrangler();
  check('offline: the cloud is down', !(await fetch(`${ORIGIN}/remake/`).then(() => true, () => false)));
  errors = [];
  failures.length = 0;
  await page.reload();
  const answers = await page.ev(`(async () => {
    const lists = await caches.open('mosi-listar');
    const { version } = await (await lists.match('/remake/__listar__/virk')).json();
    const list = await (await lists.match('/remake/__listar__/' + version)).json();
    const paths = Object.keys(list.files);
    const bad = [];
    let next = 0;
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (next < paths.length) {
        const p = paths[next++];
        try {
          const r = await fetch(p);
          const size = (await r.arrayBuffer()).byteLength;
          if (r.status !== 200 || size !== list.files[p].size) bad.push([p, r.status, size, list.files[p].size]);
        } catch (error) { bad.push([p, String(error)]); }
      }
    }));
    return { files: paths.length, bad: bad.length, first: bad.slice(0, 5) };
  })()`);
  check('offline: every listed file answers 200 with its size', answers.files > 0 && answers.bad === 0, answers);
  await page.until(`!document.getElementById('start').hidden`, 120000);
  check(`offline: the line reads „${READY}“`, (await page.ev(LINE)) === READY, await page.ev(LINE));
  await page.shot('2-an-nets-byrja.png');
  await page.tap('#start');
  check('offline: Byrja starts the chapter (a caption within 15 s)', await page.until(`!document.getElementById('caption').hidden`, 15000));
  await sleep(1500);
  await page.shot('2-an-nets-kafli.png');

  await page.tap('#journal-button', 30000);
  check('offline: the book opens', await page.until(`!document.getElementById('book').hidden`, 5000));
  await sleep(1500);
  for (const tab of ['dinosaurs', 'animals', 'games', 'map', 'fossils']) {
    // a leaf is display: contents, its pages have the size
    const shown = `Boolean(${page.visible(`.book-leaf[data-tab="${tab}"]:not([hidden]) .book-page`)})`;
    await page.tap(`.ribbon[data-tab="${tab}"]`);
    // A tap while the book still opens (on the map, where the story left it) is let go: the child taps again.
    if (!(await page.until(shown, 3000))) await page.tap(`.ribbon[data-tab="${tab}"]`);
    await sleep(1400);
    check(`offline: the book's ${tab} leaf shows`, await page.until(shown, 5000));
    await page.shot(`2-an-nets-bok-${tab}.png`);
  }
  await page.tap('.ribbon[data-tab="games"]');
  await sleep(1400);

  await page.tap('#book [data-game="eitt"]');
  check('offline: Eitt! opens', await page.until(`!document.getElementById('eitt').hidden`, 10000));
  await sleep(2500);
  await page.shot('2-an-nets-eitt.png');
  await page.tap('#eitt .eitt-close');
  check('offline: Eitt! closes', await page.until(`document.getElementById('eitt').hidden`, 10000));
  await sleep(1200);

  await page.tap('#book [data-game="hals"]');
  check('offline: Háls og hali opens', await page.until(`!document.getElementById('hals').hidden`, 10000));
  await sleep(2500);
  await page.shot('2-an-nets-hals.png');
  await page.tap('#hals .hals-multi');
  const needsNet = await page.until(`[...document.querySelectorAll('#fjolspil .fjolspil-lobby .fjolspil-needs-net')].some(el => el.textContent === ${js(NEEDS_NET)} && el.getBoundingClientRect().width > 0)`, 5000);
  check(`offline: Fjölspil says „${NEEDS_NET}“`, needsNet);
  await sleep(600);
  await page.shot('2-an-nets-fjolspil.png');
  await page.tap('#fjolspil .fjolspil-close');
  await sleep(1000);
  await page.tap('#hals .hals-close');
  check('offline: Háls og hali closes', await page.until(`document.getElementById('hals').hidden`, 10000));
  await sleep(1200);

  await page.tap('#book [data-game="yatzy-junior"]');
  const junior = await page.until(`document.querySelector('.junior-frame-page')?.contentDocument?.querySelector('#game')?.dataset.startup === 'ready'`, 45000, 300);
  check('offline: Litla Yatzy opens with its game', junior, await page.ev(`document.querySelector('.junior-frame-page')?.contentDocument?.querySelector('#game')?.dataset.startup ?? null`));
  await sleep(1500);
  await page.shot('2-an-nets-litla-yatzy.png');
  // Its button's own click: the frame's styles left main with yatzy.css (8053203), so the frame lies unseen under the game and a
  // tap at the button's place lands on what covers it.
  await page.ev(`document.querySelector('.junior-close')?.click()`);
  check('offline: Litla Yatzy closes', await page.until(`!document.querySelector('.junior-frame')`, 10000));

  // A load the page itself let go (net::ERR_ABORTED: a game's music when the game closes) is not missing: a file the worker
  // could not answer fails with net::ERR_FAILED.
  const missed = failures.filter(f => f.error !== 'net::ERR_ABORTED' && !/\/remake\/offline\.json$|\/fjolspil\//.test(pathOf(f.url)));
  report.failedLoads = failures;
  check('offline: no file the game asked for was missing', missed.length === 0, missed.slice(0, 8));
  const offlineErrors = netErrors(errors);
  report.errors.push(...errors.map(text => `offline: ${text}`));
  check('offline: no console error but the net\'s', offlineErrors.length === 0, offlineErrors.slice(0, 5));

  // 4. A new version: one line more in the README.
  const readme = staged.files['/remake/README.md'];
  fs.appendFileSync(path.join(SITE, 'remake/README.md'), '\n<!-- forrit-walk -->\n');
  const { version: next } = writeOfflineList(SITE);
  await startWrangler();
  since = requests.length;
  const fromResponse = responses.length;
  const navigatedBefore = navigations;
  await page.go(`${ORIGIN}/remake/?forrit=uppsett`); // Byrja is not pressed
  const switched = await page.until(`(async () => { const r = await (await caches.open('mosi-listar')).match('/remake/__listar__/virk'); return Boolean(r) && (await r.json()).version === ${js(next)}; })()`, 5 * 60000, 500);
  await sleep(8000); // the reload and its load
  await page.until(`document.readyState === 'complete'`, 60000);
  const listed = new Set([...Object.keys(staged.files)]);
  const fromNet = [...new Set(responses.slice(fromResponse).filter(r => r.url.startsWith(ORIGIN) && !r.fromServiceWorker && listed.has(pathOf(r.url))).map(r => pathOf(r.url)))];
  check('a new version: it becomes active', switched, { next });
  check('a new version: only the changed file is fetched', fromNet.length === 1 && fromNet[0] === '/remake/README.md', fromNet.slice(0, 8));
  check('a new version: the page reloads itself once', navigations - navigatedBefore === 2, { navigations: navigations - navigatedBefore });
  const after = await page.ev(STORE);
  check('a new version: the old README is gone from the store', after.virk === next && !after.kept.includes(readme.hash), { virk: after.virk, oldReadme: readme.hash });
  await page.until(`!document.getElementById('start').hidden`, 120000);
  await page.shot('3-ny-utgafa.png');

  // 5. The guest's page.
  since = requests.length;
  const guestFrom = responses.length;
  await page.go(`${ORIGIN}/remake/spil.html`);
  await sleep(8000);
  check('the guest\'s page never asks for the list', !asked(since, '/remake/offline.json'));
  const guestPage = responses.slice(guestFrom).find(r => r.type === 'Document' && pathOf(r.url).startsWith('/remake/spil'));
  check('the guest\'s page comes from the net, not the app\'s store', Boolean(guestPage) && !guestPage.fromServiceWorker, guestPage ?? null);
  await page.shot('4-spil.png');
  report.errors.push(...errors.map(text => `online: ${text}`));
} catch (error) {
  failed = error;
  check('the walk ran to its end', false, error.message);
} finally {
  await stopWrangler();
  check('nothing of wrangler is left running', !workerdRunning());
  try { report.restaged = stage(); } catch (error) { check('the site is staged again', false, error.message); }
  report.finished = new Date().toISOString();
  report.ok = !failed && report.checks.every(entry => entry.ok);
  fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  try { ws?.close(); } catch { /* gone */ }
  stopEdge();
  await sleep(500);
  if (userDir) await fsp.rm(userDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }).catch(() => {});
  if (locked) fs.rmSync(LOCK, { recursive: true, force: true });
}
console.log(report.ok ? `walk: every check passed (${report.checks.length})` : 'walk: a check failed');
process.exit(report.ok ? 0 : 1);
