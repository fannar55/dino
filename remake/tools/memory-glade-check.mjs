#!/usr/bin/env node
// Focused cutaway/readability and paused reduced-motion reveal regression.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { handle } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = process.env.MEMORY_CHECK_OUT || 'qa/memory/polish/glade-review';
const report = { passed: false, errors: [], captures: [], layouts: [] };
let server, browser, page, failure;
const ready = () => page.waitForFunction(() => { const c = window.__memory.stats().camera; return c.settled && !c.moving; }, undefined, { timeout: 20000 });
async function capture(name) {
  const layout = await page.evaluate(() => {
    const visible = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
    const box = el => { const r = el.getBoundingClientRect(); return { id: el.dataset.target || el.id || el.className, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return { width: innerWidth, height: innerHeight,
      overlays: [...document.querySelectorAll('#coach,#progress,#journey,#overview-hint,.game-title,nav')].filter(visible).map(box),
      targets: [...document.querySelectorAll('.world-target:not(:disabled)')].map(el => { const r = box(el); return { ...r, hit: el.contains(document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)) }; }),
      leaves: window.__memory.stats().cells.filter(c => c.leafBounds).map(c => ({ id: c.id, ...c.leafBounds })) };
  });
  report.layouts.push({ name, ...layout });
  const inside = r => r.left >= -.5 && r.top >= -.5 && r.right <= layout.width + .5 && r.bottom <= layout.height + .5;
  for (const r of [...layout.overlays, ...layout.targets]) assert.ok(inside(r), `${name}: ${r.id} is fully visible`);
  if (name.includes('glade')) {
    assert.equal(layout.targets.length, 6);
    for (const r of layout.leaves) {
      assert.ok(inside(r), `${name}: leaf ${r.id} rim is fully visible`);
      for (const o of layout.overlays) assert.ok(Math.min(r.right, o.right) - Math.max(r.left, o.left) <= .5 || Math.min(r.bottom, o.bottom) - Math.max(r.top, o.top) <= .5, `${name}: leaf ${r.id} rim clears ${o.id}`);
    }
    for (const r of layout.targets) assert.ok(r.hit && r.width >= 43.9 && r.height >= 43.9, `${name}: ${r.id} is an unobstructed 44px target`);
  } else assert.equal(layout.targets.length, 0, 'overview is inspection only');
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  report.captures.push({ name, stats: await page.evaluate(() => window.__memory.stats()) }); console.log(`Captured ${name}`);
}
try {
  await mkdir(out, { recursive: true });
  server = http.createServer(handle); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined, args: ['--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) report.errors.push(`${response.status()} ${response.url()}`); });
  await page.addInitScript(() => localStorage.setItem('mosi.memory.muted.v1', 'true'));
  await page.goto(`http://127.0.0.1:${server.address().port}/remake/minnisspil.html?qa&seed=613`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__memoryReady, undefined, { timeout: 90000 });
  await page.locator('#start').click(); await ready();
  if (process.env.MEMORY_GLADE_MODE === 'single') {
    await capture('desktop-glade');
  } else {
  for (const [name, size] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]]) {
    await page.setViewportSize(size); await ready();
    await capture(`${name}-glade`);
    await page.locator('#camera').click(); await ready(); await capture(`${name}-overview`);
    await page.locator('#camera').click(); await ready();
  }
  await page.locator('#pause').click(); await page.locator('#motion').click(); await page.locator('#pause-dialog [data-resume]').click();
  await ready();
  await page.evaluate(() => document.addEventListener('click', () => {
    window.__qaPausedLeaf = window.__memory.stats().cells[0].open; window.__memory.pause(true);
  }, { once: true }));
  await page.locator('[data-target="leaf-0"]').click();
  assert.equal(await page.evaluate(() => window.__memory.state().paused), true);
  await page.waitForTimeout(250);
  report.pausedLeaf = await page.evaluate(() => ({ before: window.__qaPausedLeaf, after: window.__memory.stats().cells[0].open, phase: window.__memory.state().phase }));
  assert.equal(report.pausedLeaf.before, 0); assert.equal(report.pausedLeaf.after, 0, 'reduced-motion reveal does not advance while paused before its first frame');
  await page.evaluate(() => window.__memory.pause(false));
  await page.waitForFunction(() => window.__memory.stats().cells[0].open === 1);
  report.pausedLeaf.resumed = true;
  }
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { failure = error; report.failure = error.stack; await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ passed: report.passed, output: out, errors: report.errors, pausedLeaf: report.pausedLeaf }));
if (failure) throw failure;
