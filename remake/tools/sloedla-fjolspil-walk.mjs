#!/usr/bin/env node
// Söngur Slóeðlu's band, walked end to end in headless Edge over raw CDP (docs/superpowers/specs/2026-10-31-sloedla-fjolspil-design.md):
// three browser contexts of their own, as three devices — the big screen (sloedla-lab.html, 1280×800), Anna's phone
// (spil.html?taeki=simi, 390×844) and Bjarni's tablet (spil.html, 1180×820: a tablet by its size). Egill takes Slóeðla in
// „Spilum saman“; Anna joins on Kambeðla as a grown-up, Bjarni on Þórseðla as a child; „Veljum lag →“, Rokkhopp, „Spila!“. The
// guests tap their notes on time at their buttons (pointer events, from __sloedlaGuest.state()).
//   Song 1 is played to its end with all three: the end's three lines on the big screen, each guest's own on her device.
//   Song 2 („Spilum aftur“): a tap on Bjarni's lane on the big screen does nothing while he plays it; his tablet is closed
//   mid-song, and within 4 s Þórseðla is Egill's and the big screen's taps count on her lane; the end has two lines.
// Checked on the way: no console errors and no failed loads on any page; each guest's every word is the big screen's word on that
// note; the big screen's name tags; the phone shows her lane alone and the tablet all three (the others dim); Egill's record
// holds boogie/barn. Shots and report.json go to qa/remake/sloedla/fjolspil/walk/; the exit code is 1 when a check fails.
//   node remake/tools/sloedla-fjolspil-walk.mjs [base]   (default http://localhost:4231/remake/, the dev server running;
//                                                         EDGE_PATH= another Edge or Chrome)
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = (process.argv[2] ?? 'http://localhost:4231/remake/').replace(/\/?$/, '/');
const OUT = path.join(ROOT, 'qa/remake/sloedla/fjolspil/walk');
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const TAKEN_WITHIN_MS = 4000; // a closed guest's dinosaur is Egill's this soon (spec §8: SILENT_MS and the watch)
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const report = { base: BASE, started: new Date().toISOString(), checks: [], shots: [], errors: {}, songs: [] };
function check(name, ok, detail = null) {
  report.checks.push({ name, ok: Boolean(ok), ...(detail === null ? {} : { detail }) });
  console.log(`${ok ? 'ok ' : 'NOT'} ${name}${detail === null ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
}

// ---- the browser --------------------------------------------------------------------------------------------------------

const userDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sloedla-walk-'));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== '__COMPAT_LAYER'));
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDir}`, '--window-size=1400,1000', '--no-first-run', '--disable-extensions', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: 'ignore', env });
const portFile = path.join(userDir, 'DevToolsActivePort');
for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await sleep(100);
let port = [];
for (let i = 0; i < 50; i++) { port = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/); if (port.length >= 2) break; await sleep(100); }
const ws = new WebSocket(`ws://127.0.0.1:${port[0]}${port[1]}`);
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });

let lastId = 0;
const pending = new Map();
const pageOf = new Map(); // sessionId -> page name, for its errors
ws.addEventListener('message', event => {
  const msg = JSON.parse(String(event.data));
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
    return;
  }
  const name = pageOf.get(msg.sessionId);
  if (!name) return;
  const list = report.errors[name];
  if (msg.method === 'Runtime.exceptionThrown') list.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') list.push(msg.params.args.map(a => a.value ?? a.description).join(' '));
  else if (msg.method === 'Network.responseReceived' && msg.params.response.status >= 400) list.push(`${msg.params.response.status} ${msg.params.response.url}`);
});
const cdp = (method, params = {}, sessionId) => {
  const id = ++lastId;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};

/** A page in a browser context of its own (a device): its evaluate, taps and shots. */
async function open(name, address, width, height, { mobile = false } = {}) {
  const { browserContextId } = await cdp('Target.createBrowserContext');
  const { targetId } = await cdp('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await cdp('Target.attachToTarget', { targetId, flatten: true });
  pageOf.set(sessionId, name);
  report.errors[name] = [];
  const send = (method, params) => cdp(method, params, sessionId);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await send('Page.navigate', { url: address });
  const ev = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`${name}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  const until = async (expression, timeout = 30000) => {
    for (const end = Date.now() + timeout; Date.now() < end; await sleep(100)) if (await ev(expression).catch(() => false)) return true;
    return false;
  };
  const tapAt = async (x, y) => {
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  };
  const tap = async (selector, dy = 0) => {
    if (!(await until(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); return Boolean(el && !el.disabled && el.getBoundingClientRect().width > 0); })()`))) throw new Error(`${name}: no ${selector}`);
    const r = await ev(`(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    await tapAt(r.x, r.y + dy);
  };
  const shot = async file => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, file), Buffer.from(data, 'base64'));
    report.shots.push(`qa/remake/sloedla/fjolspil/walk/${file}`);
  };
  const close = () => cdp('Target.disposeBrowserContext', { browserContextId });
  return { name, ev, until, tap, tapAt, shot, close };
}

// ---- the people ---------------------------------------------------------------------------------------------------------

/** A guest joins from her device: her name, her dinosaur, her level, „Tilbúin/n“. */
async function join(page, { name, avatar, level }) {
  if (!(await page.until(`Boolean(document.querySelector('.spil-avatar[data-id="${avatar}"]:not([disabled])'))`))) throw new Error(`${page.name}: ${avatar} is not offered`);
  await sleep(600);
  await page.ev(`(() => { const n = document.getElementById('spil-name'); n.value = ${JSON.stringify(name)}; n.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await page.tap(`.spil-avatar[data-id="${avatar}"]`);
  await sleep(800);
  await page.tap(`.spil-join .spil-level[data-level="${level}"]`);
  await sleep(800);
  await page.tap('.spil-ready');
}

/** Her taps: each of her notes on time at her button (a pointer event the page stamps itself), from a timer in her page. */
const startTapping = page => page.ev(`(() => {
  clearInterval(window.__tapper);
  const done = new Set();
  window.__tapper = setInterval(() => {
    const s = window.__sloedlaGuest?.state();
    if (!s?.playing || !s.button) return;
    for (const note of s.notes) {
      if (done.has(note.id) || note.t - s.time > 0.02 || s.time - note.t > 0.15) continue;
      done.add(note.id);
      const c = document.querySelector('.sl-guest-canvas');
      const r = c.getBoundingClientRect();
      c.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + s.button.x, clientY: r.top + s.button.y, bubbles: true, cancelable: true, pointerId: 1 }));
    }
  }, 4);
  return true;
})()`);

const guestState = page => page.ev('window.__sloedlaGuest?.state() ?? null');

/** Her every word is the big screen's word on that note: a hit with the same grade. */
function sameWords(who, state) {
  const heard = new Map(state.heard.map(word => [word.id, word]));
  const wrong = state.words.filter(word => heard.get(word.id)?.kind !== 'hit' || heard.get(word.id)?.grade !== word.grade);
  check(`${who}: ${state.words.length} words on the device, each the big screen's`,state.words.length > 0 && wrong.length === 0,
    wrong.length ? wrong.slice(0, 5).map(word => ({ id: word.id, hers: word.grade, big: heard.get(word.id) ?? null })) : `${state.heard.length} words heard`);
}

const lineup = big => big.ev('window.__sloedla.band.lineup()?.map(l => [l.role, l.name, l.level, l.judged]) ?? null');
const score = big => big.ev('(({ hits, strays, misses }) => ({ hits, strays, misses }))(window.__sloedla.state().score)');
/** A tap on lane `lane` of the big screen, at its button. */
async function bigTap(big, lane) {
  const spot = await big.ev(`window.__sloedla.round.game.spot(${lane})`);
  await big.tapAt(spot.x, spot.y);
  await sleep(150);
}
/** A new song has started on the big screen (another round than the one before). */
async function waitRound(big) {
  if (!(await big.until(`Boolean(window.__sloedla.round) && window.__sloedla.round !== window.__walkRound`, 90000))) throw new Error('the song did not start');
  await big.ev('window.__walkRound = window.__sloedla.round');
}
const untilSong = (big, seconds) => big.until(`(window.__sloedla.state()?.time ?? -1) >= ${seconds}`, 120000);
async function waitEnd(big) {
  if (!(await big.until('Boolean(window.__sloedlaResult)', 300000))) throw new Error('the song did not end');
  await sleep(4500); // the lines rise, the buttons after them
  return big.ev('(({ stars, points, hits, total, players }) => ({ stars, points, hits, total, players }))(window.__sloedlaResult)');
}
const bigLines = big => big.ev(`[...document.querySelectorAll('#end:not([hidden]) .sl-line')].map(line => ({ name: line.querySelector('.sl-line-name')?.textContent, pictures: line.querySelectorAll('img').length, points: line.querySelector('.sl-line-points')?.textContent }))`);
const guestLine = page => page.ev(`(() => { const end = document.querySelector('.sl-guest-end'); return end ? { name: end.querySelector('.sl-guest-name')?.textContent ?? null, points: end.querySelector('.sl-guest-points')?.textContent ?? null, stars: end.querySelectorAll('.sl-guest-star.lit').length } : null; })()`);

// ---- the walk -----------------------------------------------------------------------------------------------------------

fs.mkdirSync(OUT, { recursive: true });
let failed = null;
try {
  const big = await open('big', `${BASE}sloedla-lab.html?lag=boogie&stig=barn&brautir=3`, 1280, 800);
  if (!(await big.until('window.__sloedlaReady === true', 30000))) throw new Error('the big screen did not get ready');
  await sleep(3500);
  await big.tap('[data-together]');
  await sleep(1500);
  await big.tap('[data-tag="a"]', -96); // Slóeðla, over her feet
  await sleep(1200);
  const code = await big.ev('window.__sloedla.bandRoom.code');
  check('„Spilum saman“ opens a room with a code', /^[A-Z]{4}$/.test(code ?? ''), code);

  const anna = await open('anna', `${BASE}spil.html?r=${code}&taeki=simi`, 390, 844, { mobile: true });
  await join(anna, { name: 'Anna', avatar: 'kambedla', level: 'fullordinn' });
  await big.until(`document.querySelector('.sl-tag[data-tag="b"]')?.textContent === 'Anna'`, 15000);
  const bjarni = await open('bjarni', `${BASE}spil.html?r=${code}`, 1180, 820, { mobile: true });
  await join(bjarni, { name: 'Bjarni', avatar: 'thorsedla', level: 'barn' });
  await big.until(`document.querySelector('.sl-tag[data-tag="c"]')?.textContent === 'Bjarni'`, 15000);
  await sleep(1200);
  const tags = await big.ev(`Object.fromEntries([...document.querySelectorAll('.sl-tag[data-tag]')].map(tag => [tag.dataset.tag, tag.textContent]))`);
  check('the big screen\'s tags: Anna, Egill, Bjarni under their dinosaurs', tags.b === 'Anna' && tags.a === 'Egill' && tags.c === 'Bjarni', tags);
  await big.shot('01-saman.png');
  await anna.shot('01-anna-lobby.png');

  // ---- song 1: all three to the end
  await big.tap('[data-to-songs]');
  await sleep(1500);
  await big.tap('[data-song="boogie"]');
  await sleep(1200);
  await big.tap('#play');
  await waitRound(big);
  await startTapping(anna);
  await startTapping(bjarni);
  check('song 1\'s lineup: Anna (grown-up) and Bjarni (child) play from their devices, Egill here', JSON.stringify(await lineup(big)) === JSON.stringify([['b', 'Anna', 'fullordinn', 'grace'], ['a', 'Egill', 'barn', 'here'], ['c', 'Bjarni', 'barn', 'grace']]), await lineup(big));
  await untilSong(big, 16);
  await big.shot('02-big-song.png');
  await anna.shot('02-anna-song.png');
  await bjarni.shot('02-bjarni-song.png');
  const annaPlays = await guestState(anna), bjarniPlays = await guestState(bjarni);
  check('Anna\'s phone: her lane alone (Kambeðla)', annaPlays?.device === 'simi' && annaPlays.playing && JSON.stringify(annaPlays.lanes) === '["b"]', { device: annaPlays?.device, lanes: annaPlays?.lanes });
  check('Bjarni\'s tablet: the whole stage, his lane lit and the others dim', bjarniPlays?.device === 'spjald' && bjarniPlays.playing && bjarniPlays.mine === 'c' && JSON.stringify(bjarniPlays.lanes) === '["b","a","c"]', { device: bjarniPlays?.device, lanes: bjarniPlays?.lanes, mine: bjarniPlays?.mine });
  const end1 = await waitEnd(big);
  report.songs.push(end1);
  sameWords('Anna', await guestState(anna));
  sameWords('Bjarni', await guestState(bjarni));
  await big.shot('03-big-end.png');
  await anna.shot('03-anna-end.png');
  await bjarni.shot('03-bjarni-end.png');
  const lines1 = await bigLines(big);
  check('song 1\'s end: three lines, Egill, Anna and Bjarni', lines1.map(line => line.name).join() === 'Egill,Anna,Bjarni', lines1);
  const annaLine = await guestLine(anna), bjarniLine = await guestLine(bjarni);
  check('Anna\'s phone shows the band\'s stars and her line', annaLine?.name === 'Anna' && annaLine.stars === end1.stars, annaLine);
  check('Bjarni\'s tablet shows the band\'s stars and his line', bjarniLine?.name === 'Bjarni' && bjarniLine.stars === end1.stars, bjarniLine);
  const record = await big.ev(`JSON.parse(localStorage.getItem('mosi-sloedla-met') ?? '{}')`);
  check('the band\'s stars are in Egill\'s record under boogie/barn', record['boogie/barn']?.stars === end1.stars, record);

  // ---- song 2: Bjarni's tablet goes mid-song
  await big.ev('window.__sloedlaResult = null');
  await big.tap('[data-again]');
  await waitRound(big);
  await startTapping(anna);
  await startTapping(bjarni);
  await untilSong(big, 10);
  const before = await score(big);
  await bigTap(big, 2);
  const after = await score(big);
  check('while Bjarni plays Þórseðla a tap on her lane on the big screen does nothing', after.hits + after.strays === before.hits + before.strays, { before, after });
  await bjarni.close();
  const closedAt = Date.now();
  const taken = await big.until(`window.__sloedla.band.lineup()?.[2]?.name === 'Egill'`, TAKEN_WITHIN_MS + 1000);
  const tookMs = Date.now() - closedAt;
  check(`Bjarni's tablet closed: Þórseðla is Egill's within ${TAKEN_WITHIN_MS / 1000} s`, taken && tookMs <= TAKEN_WITHIN_MS, { ms: tookMs, lineup: await lineup(big) });
  const was = await score(big);
  await bigTap(big, 2);
  const now = await score(big);
  check('then the big screen\'s taps count on her lane', now.hits + now.strays === was.hits + was.strays + 1, { was, now });
  await big.shot('04-big-taken.png');
  const end2 = await waitEnd(big);
  report.songs.push(end2);
  sameWords('Anna (song 2)', await guestState(anna));
  const lines2 = await bigLines(big);
  check('song 2\'s end: two lines, Egill (Slóeðla and Þórseðla) and Anna', lines2.map(line => `${line.name}:${line.pictures}`).join() === 'Egill:2,Anna:1', lines2);
  await big.shot('05-big-end.png');
  await anna.shot('05-anna-end.png');
  for (const [name, list] of Object.entries(report.errors)) check(`no console errors or failed loads on ${name}'s page`, list.length === 0, list.length ? list.slice(0, 5) : null);
} catch (error) {
  failed = error;
  check('the walk ran to its end', false, error.message);
} finally {
  report.finished = new Date().toISOString();
  report.ok = !failed && report.checks.every(entry => entry.ok);
  fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  ws.close();
  edge.kill();
  await sleep(300);
  await fsp.rm(userDir, { recursive: true, force: true }).catch(() => {});
}
console.log(report.ok ? `walk: every check passed (${report.checks.length})` : 'walk: a check failed');
process.exit(report.ok ? 0 : 1);
