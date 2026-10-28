#!/usr/bin/env node
// Bounded visual/render regression after the complete memory-check gameplay gate.
// This measures submitted geometry/calls, not device FPS.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { handle } from './serve.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = process.env.MEMORY_CHECK_OUT || path.join(root, 'qa/memory/three-step/render-final');
const report = { scope: 'render-only', passed: false, captures: [], errors: [], layouts: [] };
const sizes = [['wide', { width: 1280, height: 800 }], ['portrait', { width: 820, height: 1180 }], ['phone', { width: 390, height: 844 }]];
const helpers = ['brontosaurus', 'triceratops', 'stegosaurus'];
let server, browser, page, failure;
const watchdog = setTimeout(() => { void browser?.close(); server?.close(); }, 360000);
watchdog.unref();
const wait = (fn, arg, timeout = 90000) => page.waitForFunction(fn, arg, { timeout });
const ready = () => wait(() => window.__memory.stats().camera.settled && !window.__memory.stats().camera.moving);
async function click(selector) {
  await wait(selector => { const el = document.querySelector(selector); return el && !el.disabled && !el.hidden; }, selector, 20000);
  const hit = await page.locator(selector).evaluate(el => { const r = el.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; return { x, y, hit: el.contains(document.elementFromPoint(x, y)) }; });
  assert.ok(hit.hit, `${selector} receives real input`); await page.mouse.click(hit.x, hit.y);
}
async function resize(size) {
  await page.setViewportSize(size);
  await wait(size => { const s = window.__memory.stats(); return s.size.width === size.width && s.size.height === size.height && s.camera.settled && !s.camera.moving; }, size);
}
async function capture(name) {
  const layout = await page.evaluate(() => {
    const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    return { width: innerWidth, height: innerHeight, elements: [...document.querySelectorAll('#coach,#ending,#holding,#progress,#journey,#overview-hint,.game-title,nav,button:not(:disabled)')].filter(visible).map(el => {
      const r = el.getBoundingClientRect(); return { id: el.dataset.target || el.id || el.className, x: r.x, y: r.y, w: r.width, h: r.height };
    }) };
  });
  for (const box of layout.elements) assert.ok(box.x >= -.5 && box.y >= -.5 && box.x + box.w <= layout.width + .5 && box.y + box.h <= layout.height + .5, `${name}: ${box.id} is inside viewport`);
  report.layouts.push({ name, ...layout });
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  report.captures.push({ name, stats: await page.evaluate(() => window.__memory.stats()) }); console.log(`Captured ${name}`);
}
async function select(species) {
  if (await page.evaluate(() => window.__memory.bridge().selected !== null)) { await click('#cancel-choice'); await ready(); }
  const index = await page.evaluate(species => window.__memory.stats().nests.find(n => n.species === species).index, species);
  await click(`[data-target="nest-${index}"]`); await ready();
}
async function completed(action) {
  await wait(action => { const b = window.__memory.bridge(); return b.active === null && (action === 'lift' ? b.branch === 'held' : action === 'roll' ? b.bridgeBuilt : action === 'cross' ? b.atStaging : action === 'lay' ? b.boardwalkBuilt : b.visited); }, action);
  await ready();
}
async function action(target, action) { await click(`[data-target="task-${target}"]`); await completed(action); }
async function freezeAt(fn, name) {
  await wait(source => { if (Function(`return (${source})`)()()) { window.__memory.pause(true); return true; } return false; }, fn.toString());
  await capture(name); await page.evaluate(() => window.__memory.pause(false));
}
try {
  await mkdir(out, { recursive: true });
  server = http.createServer(handle); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined, args: ['--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport: sizes[0][1], deviceScaleFactor: 1 });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) report.errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(`http://127.0.0.1:${server.address().port}/remake/minnisspil.html?qa&seed=613`, { waitUntil: 'domcontentloaded' });
  await wait(() => window.__memoryReady || document.getElementById('error')?.hidden === false);
  assert.equal(await page.evaluate(() => window.__memoryReady), true);
  await page.evaluate(() => {
    window.__renderGate = { frames: 0, triangles: 0, drawCalls: 0, stages: {} };
    function sample() {
      const s = window.__memory.stats(), g = window.__renderGate, a = s.bridge.action;
      const label = `${s.size.width}x${s.size.height}/${s.camera.mode}/${s.camera.intent}/${a?.id || s.bridge.stage}`;
      const state = { camera: s.camera, bridge: window.__memory.bridge(), size: s.size, triangles: s.triangles, drawCalls: s.drawCalls };
      g.frames++; if (s.triangles > g.triangles) { g.triangles = s.triangles; g.trianglePeak = state; }
      if (s.drawCalls > g.drawCalls) { g.drawCalls = s.drawCalls; g.drawPeak = state; }
      const stage = g.stages[label] ??= { frames: 0, drawCalls: 0, triangles: 0 }; stage.frames++;
      stage.drawCalls = Math.max(stage.drawCalls, s.drawCalls); stage.triangles = Math.max(stage.triangles, s.triangles);
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  await click('#start'); await ready(); await capture('initial');
  for (const species of helpers) {
    const ids = await page.evaluate(species => window.__memory.state().cards.filter(c => c.species === species).map(c => c.id), species);
    await click(`[data-target="leaf-${ids[0]}"]`); await wait(() => window.__memory.state().phase === 'one-open');
    await click(`[data-target="leaf-${ids[1]}"]`); await wait(() => ['ready', 'won'].includes(window.__memory.state().phase));
  }
  await wait(() => window.__memory.stats().cells.every(c => c.moved && !c.moving)); await ready();
  await select('brontosaurus'); await click('[data-target="task-branch"]');
  await freezeAt(() => { const s = window.__memory.stats(); return s.bridge.action?.phase === 'lift' && s.bridge.action.progress > .4 && !s.camera.moving; }, 'branch-mid-lift');
  await completed('lift'); await select('brontosaurus');
  for (const [label, size] of sizes) { await resize(size); await capture(`branch-held-${label}`); }
  await resize(sizes[0][1]); await select('triceratops'); await action('log', 'roll'); await action('staging', 'cross');
  await select('stegosaurus'); await click('[data-target="task-bark"]');
  await freezeAt(() => { const s = window.__memory.stats(), a = s.bridge.action, r = s.bridge.boardwalk.cargo.rotation; return a?.phase === 'carry' && a.progress > .65 && Math.abs(Math.atan2(Math.sin(r - Math.PI / 2), Math.cos(r - Math.PI / 2))) < .5 && !s.camera.moving; }, 'bark-carry');
  await freezeAt(() => { const a = window.__memory.stats().bridge.action; return a?.phase === 'place' && a.panel === 2 && a.progress > .35 && a.progress < .8; }, 'bark-third-panel');
  await completed('lay'); await capture('boardwalk-built'); await action('grove', 'finish');
  for (const [label, size] of sizes) {
    await resize(size); await capture(`final-grove-${label}`);
    for (const species of helpers) { const index = await page.evaluate(species => window.__memory.stats().nests.find(n => n.species === species).index, species); await click(`[data-target="nest-${index}"]`); }
    await click('#camera'); await ready(); await capture(`greetings-overview-${label}`);
    await click('#camera'); await ready();
  }
  report.peak = await page.evaluate(() => window.__renderGate);
  assert.ok(report.peak.triangles <= 250000, `triangles ${report.peak.triangles} <=250000`);
  assert.ok(report.peak.drawCalls <= 100, `draw calls ${report.peak.drawCalls} <=100`);
  assert.deepEqual(report.errors, []); report.passed = true;
  console.log(JSON.stringify({ passed: true, peak: { triangles: report.peak.triangles, drawCalls: report.peak.drawCalls }, out }));
} catch (error) {
  failure = error; report.failure = error.message;
  if (page) { report.peak = await page.evaluate(() => window.__renderGate).catch(() => null); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally {
  clearTimeout(watchdog); await browser?.close(); if (server) await new Promise(resolve => server.close(resolve));
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
}
if (failure) throw failure;
