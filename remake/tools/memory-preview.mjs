// Bounded scene review; deliberately omits full regression coverage.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { handle } from './serve.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = path.resolve(process.env.MEMORY_CHECK_OUT || 'qa/memory/large-board/first-look');
const report = { errors: [], captures: [], layoutErrors: [] }; let browser, server, page;
const timeout = setTimeout(() => { void browser?.close(); server?.close(); }, 240000); timeout.unref();
try {
  await mkdir(out, { recursive: true }); server = http.createServer(handle);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, channel: 'msedge', args: ['--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }); page.setDefaultTimeout(30000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) report.errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(`http://127.0.0.1:${server.address().port}/remake/minnisspil.html?qa&seed=613`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__memoryReady || !document.querySelector('#error').hidden, undefined, { timeout: 90000 });
  if (!await page.evaluate(() => window.__memoryReady)) throw new Error('Scene failed to load');
  await page.evaluate(async () => {
    const { assessBridgeGeometry } = await import('./tools/memory-geometry-check.mjs');
    window.__preview = { peakTriangles: 0, peakCalls: 0, geometryErrors: [], geometrySamples: [], crossed: [], crossingSamples: {}, currentWaterActors: 0, currentDeckActors: 0, movingCellsChecked: 0 };
    function sample() {
      const stats = window.__memory.stats(), gate = window.__preview;
      if (stats.triangles > gate.peakTriangles) { gate.peakTriangles = stats.triangles; gate.peakState = { memory: window.__memory.state().phase, bridge: window.__memory.bridge(), size: stats.size }; }
      gate.peakCalls = Math.max(gate.peakCalls, stats.drawCalls);
      if (gate.fastMatch) {
        const fast = gate.fastMatch;
        fast.triangles = Math.max(fast.triangles, stats.triangles); fast.drawCalls = Math.max(fast.drawCalls, stats.drawCalls);
        fast.moving = Math.max(fast.moving, stats.cells.filter(cell => cell.moving).length);
        fast.visible = Math.max(fast.visible, stats.cells.filter(cell => cell.actorVisible).length);
      }
      try {
        const extraActors = stats.cells.filter(cell => cell.actorVisible && cell.position).map(cell => ({ id: `leaf-${cell.id}`, position: cell.position, feet: cell.feet }));
        const checked = assessBridgeGeometry(stats.bridge, { extraActors });
        gate.movingCellsChecked += stats.cells.filter(cell => cell.moving && cell.position).length;
        const stage = stats.bridge.action ? `${stats.bridge.action.id}/${stats.bridge.action.phase}` : stats.bridge.stage;
        for (const error of checked.errors) { const message = `${stage}: ${error}`; if (!gate.geometryErrors.includes(message)) { gate.geometryErrors.push(message); gate.geometrySamples.push({ stage, violations: checked.violations }); } }
        gate.currentWaterActors = checked.actors.filter(actor => actor.water).length;
        gate.currentDeckActors = checked.actors.filter(actor => actor.onDeck).length;
        for (const actor of checked.actors) if (actor.water) {
          if (!gate.crossed.includes(actor.id)) gate.crossed.push(actor.id);
          const samples = gate.crossingSamples[actor.id] ??= [];
          const last = samples.at(-1);
          if (!last || Math.hypot(actor.position[0] - last[0], actor.position[2] - last[2]) > .02) samples.push(actor.position);
        }
      } catch (error) { if (!gate.geometryErrors.includes(error.message)) gate.geometryErrors.push(error.message); }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  const click = selector => page.locator(selector).click();
  const waitPhase = phase => page.waitForFunction(phase => window.__memory.state().phase === phase, phase);
  async function shot(name) {
    const layout = await page.evaluate(() => {
      const wasPaused = window.__memory.state().paused;
      if (wasPaused) window.__memory.pause(false);
      const rect = element => { const r = element.getBoundingClientRect(); return { id: element.dataset.target || element.id || element.className, x: r.x, y: r.y, w: r.width, h: r.height,
        hit: element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }; };
      const targets = [...document.querySelectorAll('.world-target:not(:disabled)')].map(rect);
      const overlays = [...document.querySelectorAll('#coach,#ending,#holding,#progress,.game-title,nav')].filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden').map(rect);
      const errors = [], overlap = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > .5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > .5;
      const leaves = window.__memory.stats().cells.filter(cell => cell.leafBounds).map(cell => ({ id: `leaf-rim-${cell.id}`, x: cell.leafBounds.left, y: cell.leafBounds.top, w: cell.leafBounds.width, h: cell.leafBounds.height }));
      for (const box of leaves) {
        if (box.x < -.5 || box.y < -.5 || box.x + box.w > innerWidth + .5 || box.y + box.h > innerHeight + .5) errors.push(`${box.id} is clipped by the viewport`);
        for (const overlay of overlays) if (overlap(box, overlay)) errors.push(`${box.id} overlaps ${overlay.id}`);
      }
      for (const box of overlays) if (box.x < -.5 || box.y < -.5 || box.x + box.w > innerWidth + .5 || box.y + box.h > innerHeight + .5) errors.push(`${box.id} is clipped by the viewport`);
      const caption = document.querySelector('#caption'), captionLines = [];
      if (caption.getClientRects().length) {
        const range = document.createRange(); range.selectNodeContents(caption);
        for (const r of range.getClientRects()) {
          captionLines.push({ x: r.x, y: r.y, w: r.width, h: r.height });
          if (r.left < -.5 || r.right > innerWidth + .5 || r.top < -.5 || r.bottom > innerHeight + .5) errors.push('caption text is clipped by the viewport');
        }
      }
      for (const a of targets) {
        if (!a.hit || a.w < 43.9 || a.h < 43.9 || a.x < 0 || a.y < 0 || a.x + a.w > innerWidth + .5 || a.y + a.h > innerHeight + .5) errors.push(`${a.id} is small, clipped or centre-obscured`);
        for (const b of overlays) if (overlap(a, b)) errors.push(`${a.id} overlaps ${b.id}`);
      }
      for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) if (overlap(targets[i], targets[j])) errors.push(`${targets[i].id} overlaps ${targets[j].id}`);
      if (wasPaused) window.__memory.pause(true);
      return { targets, overlays, leaves, caption: caption.textContent, captionLines, errors };
    });
    for (const message of layout.errors) report.layoutErrors.push(`${name}: ${message}`);
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    report.captures.push({ name, layout, stats: await page.evaluate(() => window.__memory.stats()) });
    console.log(`Captured ${name}`);
  }
  async function both(name) {
    const priorPaused = await page.evaluate(() => window.__memory.state().paused);
    const freeze = !priorPaused && await page.evaluate(() => Boolean(window.__memory.bridge().active));
    if (freeze) await page.evaluate(() => window.__memory.pause(true));
    await shot(name);
    await page.setViewportSize({ width: 820, height: 1180 }); await page.waitForTimeout(120); await shot(`${name}-portrait-tablet`);
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(120); await shot(`${name}-phone`);
    await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(120);
    if (freeze) await page.evaluate(() => window.__memory.pause(false));
  }
  async function match(species, settle = true) {
    const ids = await page.evaluate(species => window.__memory.state().cards.filter(card => card.species === species).map(card => card.id), species);
    await click(`[data-target="leaf-${ids[0]}"]`); await waitPhase('one-open'); await click(`[data-target="leaf-${ids[1]}"]`);
    await page.waitForFunction(() => ['ready','won'].includes(window.__memory.state().phase));
    if (settle) await page.waitForFunction(ids => window.__memory.stats().cells.filter(cell => ids.includes(cell.id)).every(cell => cell.moved && !cell.moving), ids);
    else if (await page.evaluate(() => window.__memory.state().phase === 'ready' && window.__memory.stats().cells.some(cell => cell.moving))) {
      if (!await page.locator('.world-target[data-target^="leaf-"]:not(:disabled)').count()) throw new Error('Physical transfer incorrectly locks valid memory input');
    }
  }
  async function select(species) {
    const index = await page.evaluate(species => window.__memory.stats().nests.find(nest => nest.species === species).index, species);
    await click(`[data-target="nest-${index}"]`);
  }
  await click('#start'); await both('initial');
  if (['targeted', 'review'].includes(process.env.MEMORY_PREVIEW_MODE)) {
    await page.evaluate(() => { window.__preview.fastMatch = { triangles: 0, drawCalls: 0, moving: 0, visible: 0 }; });
    for (const species of ['brontosaurus','triceratops','stegosaurus']) await match(species, false);
    await page.evaluate(() => window.__memory.pause(true)); await both('fast-match'); await page.evaluate(() => window.__memory.pause(false));
    await page.waitForFunction(() => window.__memory.stats().cells.every(cell => !cell.moving));
    report.fastMatch = await page.evaluate(() => { const result = window.__preview.fastMatch; window.__preview.fastMatch = null; return result; });
    await click('#pause'); await click('#restart');
  }
  await match('triceratops'); await match('brontosaurus'); await select('brontosaurus'); await both('branch-choice'); await click('[data-target="task-branch"]');
  await page.waitForFunction(() => window.__memory.bridge().branch === 'held' && !window.__memory.bridge().active, undefined, { timeout: 45000 });
  await both('held'); await select('brontosaurus'); await both('lower-choice');
  if (process.env.MEMORY_PREVIEW_MODE !== 'targeted') {
  await match('stegosaurus'); await select('triceratops'); await both('log-choice'); await click('[data-target="task-log"]');
  await page.waitForFunction(() => { const a = window.__memory.stats().bridge.action; if (a?.phase === 'roll' && a.progress >= .45 && a.progress < .7) { window.__memory.pause(true); return true; } return false; });
  await both('rolling'); await page.evaluate(() => window.__memory.pause(false));
  await page.waitForFunction(() => window.__memory.bridge().bridgeBuilt && !window.__memory.bridge().active, undefined, { timeout: 45000 });
  await both('built'); await click('[data-target="task-grove"]');
  await page.waitForFunction(() => {
    const action = window.__memory.stats().bridge.action;
    if (action?.phase === 'cross' && window.__preview.currentWaterActors > 0 && window.__preview.currentDeckActors >= 2) { window.__memory.pause(true); return true; }
    return false;
  }, undefined, { timeout: 45000 });
  await both('crossing'); await page.evaluate(() => window.__memory.pause(false));
  await page.waitForFunction(() => window.__memory.bridge().visited, undefined, { timeout: 45000 });
  await both('arrival');
  }
  report.gate = await page.evaluate(() => window.__preview);
  report.final = await page.evaluate(() => ({ state: window.__memory.state(), bridge: window.__memory.bridge(), world: window.__memory.stats() }));
} catch (error) {
  report.failure = error.message;
  if (page) { report.gate = await page.evaluate(() => window.__preview).catch(() => null); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally {
  clearTimeout(timeout); await browser?.close(); if (server) await new Promise(resolve => server.close(resolve));
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
}
const gateSummary = report.gate && { ...report.gate, crossingSamples: Object.fromEntries(Object.entries(report.gate.crossingSamples ?? {}).map(([id, samples]) => [id, samples.length])) };
console.log(JSON.stringify({ failure: report.failure, errors: report.errors, layoutErrors: report.layoutErrors, gate: gateSummary, fastMatch: report.fastMatch, out }, null, 2));
if (report.failure) process.exitCode = 1;
