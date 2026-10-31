// Runs the actual game controller and DOM. Only rasterization between captures
// is skipped; a deterministic RAF drives the real game clock and animation.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import http from 'node:http';
import assert from 'node:assert/strict';
import { handle } from './serve.mjs';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'C:/Users/fannare/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out = process.env.MEMORY_CHECK_OUT || 'qa/memory/playful/flow-r1';
await mkdir(out, { recursive: true });
const report = { passed: false, errors: [], captures: [], actions: [], layouts: [] };
const sourcePaths = ['remake/minnisspil.html', 'remake/minnisspil.css', 'remake/engine/footing.js',
  ...(await readdir('remake/engine/memory')).filter(name => name.endsWith('.js')).map(name => `remake/engine/memory/${name}`)];
const sourceHashes = async () => Object.fromEntries(await Promise.all(sourcePaths.map(async path => [path, createHash('sha256').update(await readFile(path)).digest('hex')])));
report.sourceHashes = await sourceHashes();
const source = (await readFile('remake/engine/memory/world.js', 'utf8')).replace('updateTargets(); renderer.info.reset(); renderer.render(scene, camera);', 'updateTargets(); renderer.info.reset(); if(globalThis.__playfulRender) renderer.render(scene, camera);');
let browser, server, page;
async function save() { await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)); }
async function advance(frames = 15) {
  return page.evaluate(frames => {
    for (let i = 0; i < frames; i++) __playfulTick();
    const next = document.getElementById('next-action');
    return { memory: __memory.state(), bridge: __memory.bridge(), stats: __demoStats, next: { visible: !next.hidden, disabled: next.disabled, action: next.dataset.action } };
  }, frames);
}
async function until(predicate, label, seconds = 100) {
  for (let frames = 0; frames < seconds * 30; frames += 10) {
    const state = await advance(10);
    if (predicate(state)) return state;
  }
  throw new Error(`Timed out: ${label}`);
}
async function capture(name) {
  await page.evaluate(() => { __memory.pause(true); __playfulRender = true; __playfulTick(); __playfulRender = false; });
  await page.screenshot({ path: `${out}/${name}.png`, timeout: 45000 });
  const layout = await page.evaluate(() => {
    const rect = element => { const r = element.getBoundingClientRect(); return { id: element.id || element.className, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const visible = el => el && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    return { width: innerWidth, height: innerHeight,
      boxes: [...document.querySelectorAll('.topbar,#progress,#journey,#coach,#next-action,#ending')].filter(visible).map(rect),
      caption: document.querySelector('#caption').textContent, rendering: __demoStats,
    };
  });
  for (const box of layout.boxes) assert.ok(box.left >= -.5 && box.top >= -.5 && box.right <= layout.width + .5 && box.bottom <= layout.height + .5, `${name}: ${box.id} stays in viewport`);
  report.layouts.push({ name, ...layout, rendering: { triangles: layout.rendering.triangles, drawCalls: layout.rendering.drawCalls } });
  report.captures.push(`${name}.png`); await page.evaluate(() => __memory.pause(false)); await save();
}
try {
  server = http.createServer((req, res) => {
    if (new URL(req.url, 'http://localhost').pathname === '/remake/engine/memory/world.js') { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(source); }
    else void handle(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport: { width: 1002, height: 823 } });
  page.on('pageerror', error => report.errors.push(error.stack || error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) report.errors.push(`${response.status()} ${response.url()}`); });
  await page.addInitScript(() => {
    localStorage.setItem('mosi.memory.muted.v1', 'true');
    let callbacks = new Map(), id = 0, timestamp = 1000;
    globalThis.__playfulRender = false;
    globalThis.requestAnimationFrame = callback => { callbacks.set(++id, callback); return id; };
    globalThis.cancelAnimationFrame = key => callbacks.delete(key);
    globalThis.__playfulTick = () => { timestamp += 1000 / 30; const current = [...callbacks.values()]; callbacks = new Map(); for (const callback of current) callback(timestamp); };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/remake/minnisspil.html?qa&seed=613&quality=tablet`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => __memoryReady, undefined, { polling: 100, timeout: 90000 });
  await page.evaluate(() => document.getElementById('start').click());
  await advance(45); await capture('start-owner-size');
  // Queue a child's work click while another discovered pair is still walking.
  // Starting work must not freeze those friends, nor require a second click.
  for (const species of ['brontosaurus', 'triceratops']) {
    const ids = await page.evaluate(species => __memory.state().cards.filter(card => card.species === species).map(card => card.id), species);
    for (const id of ids) {
      await until(s => ['ready', 'one-open'].includes(s.memory.phase) && !s.stats.camera.moving, 'early work: ready to pick');
      await page.evaluate(id => __memory.pick(id), id); await advance(16);
    }
    await until(s => s.memory.cards.filter(c => c.species === species).every(c => c.status === 'matched'), `early work: ${species} matched`);
    if (species === 'brontosaurus') await until(s => s.stats.cells.filter(c => c.species === species).every(c => c.moved) && !s.stats.camera.moving, 'first helper ready');
  }
  await until(s => s.next.visible && !s.next.disabled && s.next.action === 'lift', 'early work button');
  const earlyBefore = await advance(1);
  assert.ok(earlyBefore.stats.cells.some(c => c.moving), 'second pair is still traveling when the child asks to lift');
  await page.evaluate(() => document.getElementById('next-action').click());
  let walkingFrames = 0;
  await until(s => {
    if (s.stats.cells.some(c => c.moving)) { walkingFrames++; assert.equal(s.bridge.active, null, 'work does not freeze home walkers'); }
    return s.bridge.branch === 'held' && !s.bridge.active;
  }, 'queued work starts after friends arrive');
  assert.ok(walkingFrames > 0); report.queuedWork = { passed: true, walkingSamples: walkingFrames };
  await page.evaluate(() => __memory.restart()); await advance(45);
  for (const species of ['brontosaurus', 'triceratops', 'stegosaurus']) {
    const ids = await page.evaluate(species => __memory.state().cards.filter(card => card.species === species).map(card => card.id), species);
    for (const id of ids) {
      await until(s => ['ready', 'one-open'].includes(s.memory.phase) && !s.stats.camera.moving, 'ready to pick');
      await page.evaluate(id => __memory.pick(id), id);
      await advance(16);
    }
    await until(s => s.memory.cards.filter(c => c.species === species).every(c => c.status === 'matched'), `${species} matched`);
  }
  await until(s => s.stats.cells.every(c => !c.moving) && !s.stats.camera.moving, 'all matched friends arrive');
  await capture('matched-owner-size');
  for (const size of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(size); await until(s => s.stats.size.width === size.width && s.stats.size.height === size.height && !s.stats.camera.moving, 'responsive camera'); await capture(`matched-${size.width}`);
  }
  await page.setViewportSize({ width: 1002, height: 823 }); await until(s => s.stats.size.width === 1002 && !s.stats.camera.moving, 'owner size camera');
  for (const [action, done] of [['lift', s => s.bridge.branch === 'held' && !s.bridge.active], ['roll', s => s.bridge.atStaging && !s.bridge.active], ['lay', s => s.bridge.visited && !s.bridge.active]]) {
    await until(s => s.next.visible && !s.next.disabled && s.next.action === action, `ready ${action} button`);
    const before = await page.evaluate(() => ({ action: document.getElementById('next-action').dataset.action, visible: !document.getElementById('next-action').hidden }));
    assert.equal(before.action, action); assert.equal(before.visible, true, `one clear ${action} button`);
    await page.evaluate(() => document.getElementById('next-action').click());
    let observed = new Set(), maxWalking = 0;
    const state = await until(s => { if (s.bridge.active) observed.add(s.bridge.active); maxWalking = Math.max(maxWalking, s.stats.bridge.routes.filter(r => r.started && !r.finished).length); return done(s); }, action === 'roll' ? 'roll and automatic bridge crossing' : action === 'lay' ? 'lay and automatic final crossing' : action);
    report.actions.push({ requested: action, observed: [...observed], maxWalking, state: state.bridge });
    if (action === 'roll') assert.ok(observed.has('cross'), 'river crossing starts without another click');
    if (action === 'lay') assert.ok(observed.has('finish'), 'marsh crossing starts without another click');
    await until(s => !s.stats.camera.moving, 'arrival camera');
    await capture(`after-${action}`);
  }
  await page.evaluate(() => __memory.restart()); await advance(45);
  const reset = await page.evaluate(() => ({ memory: __memory.state(), bridge: __memory.bridge(), routes: __demoStats.bridge.routes }));
  assert.equal(reset.memory.matchedPairs, 0); assert.equal(reset.bridge.active, null); assert.equal(reset.bridge.visited, false); assert.deepEqual(reset.routes, []);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(await sourceHashes(), report.sourceHashes, 'reviewed source stayed fixed during the run');
  report.passed = true;
} catch (error) {
  report.failure = error.stack;
  report.last = await page?.evaluate(() => ({ memory: __memory?.state(), bridge: __memory?.bridge(), stats: __demoStats })).catch(() => null);
  if (page) await capture('failure').catch(() => {});
} finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); await save(); }
console.log(JSON.stringify({ passed: report.passed, out, errors: report.errors, failure: report.failure }, null, 2));
if (!report.passed) process.exitCode = 1;
