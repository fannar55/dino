#!/usr/bin/env node
// Functional/browser gate; this is not a device GPU performance benchmark.
// PLAYWRIGHT_PATH points to the installed package. MEMORY_URL may override the temporary local server.
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { handle } from './serve.mjs';
import { assessBridgeGeometry } from './memory-geometry-check.mjs';

await import('../tests/setup.mjs');
const { assessSceneClearances, bridgeCollisionObjects } = await import('../engine/memory/memory-clearance.js');

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const scope = process.env.MEMORY_CHECK_SCOPE || 'full';
const polish = scope.startsWith('polish'), journeyOnly = scope === 'polish-journey';
const out = process.env.MEMORY_CHECK_OUT || path.join(root, polish ? `qa/memory/polish/${journeyOnly ? 'final-check' : 'check'}` : 'qa/memory/three-step/check');
const report = { startedAt: new Date().toISOString(), passed: false, checks: [], captures: [], rendering: [], layouts: [], layoutErrors: [], errors: [], warnings: [] };
report.scope = scope;
let server, browser, page, failure;
const watchdog = setTimeout(async () => {
  report.timedOut = true;
  await checkpoint('watchdog').catch(() => {});
  await browser?.close(); server?.close();
}, 1800000);
watchdog.unref();
const state = () => page.evaluate(() => window.__memory.state());
const bridge = () => page.evaluate(() => window.__memory.bridge());
const phase = value => page.waitForFunction(value => window.__memory.state().phase === value, value, { timeout: 18000 });
const leaf = id => `[data-target="leaf-${id}"]`;
const task = id => `[data-target="task-${id}"]`;
const TASK_IDS = ['branch', 'log', 'staging', 'bark', 'grove'];
const HELPERS = ['triceratops', 'brontosaurus', 'stegosaurus'];
const camera = () => page.evaluate(() => window.__memory.stats().camera);
// A viewport capture avoids Playwright's unrelated element scrolling/stability
// wait. Freeze the same scene during one bounded transport retry, if needed.
async function viewportPixels(options = {}, worldOnly = false) {
  const wasPaused = (await state()).paused;
  if (!wasPaused) await page.evaluate(() => window.__memory.pause(true));
  try {
    const clip = worldOnly ? await page.locator('#world').evaluate(element => {
      const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
    }) : undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await page.screenshot({ ...options, clip, timeout: 45000,
          ...(worldOnly ? { style: '#game > :not(#world){visibility:hidden!important}' } : {}) });
      } catch (error) {
        if (attempt || error.name !== 'TimeoutError' || page.isClosed()) throw error;
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      }
    }
  } finally {
    if (!wasPaused && !page.isClosed()) await page.evaluate(() => window.__memory.pause(false));
  }
}
const worldPixels = () => viewportPixels({}, true);
const cameraReady = (mode = 'auto') => page.waitForFunction(mode => {
  const value = window.__memory.stats().camera; return value.mode === mode && value.settled && !value.moving;
}, mode, { timeout: 20000 });
async function resizeTo(size) {
  await page.setViewportSize(size);
  await page.waitForFunction(size => {
    const stats = window.__memory.stats();
    return stats.size.width === size.width && stats.size.height === size.height && stats.camera.settled && !stats.camera.moving;
  }, size, { timeout: 20000 });
}
async function checkpoint(label) {
  if (!page || page.isClosed()) return;
  const metrics = await page.evaluate(() => ({
    livePeak: window.__memoryBudget, geometry: window.__memoryGeometry,
    cameraAudit: window.__memoryCameraAudit, collisionAudit: window.__memoryCollision,
    audioAudit: window.__memoryAudioAudit, navigationAudit: window.__memoryNavigationAudit,
  }));
  Object.assign(report, metrics);
  report.lastCheckpoint = { label, at: new Date().toISOString() };
  await writeFile(path.join(out, 'checkpoint.json'), JSON.stringify({
    passed: false, status: 'in-progress', ...report.lastCheckpoint, ...metrics,
  }, null, 2));
}
async function capture(name) {
  const wasPaused = (await state()).paused;
  if (!wasPaused) await page.evaluate(() => window.__memory.pause(true));
  try {
  await viewportPixels({ path: path.join(out, `${name}.png`) }); report.captures.push(`${name}.png`);
  const overlays = await page.evaluate(() => {
    const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
    const rect = element => { const r = element.getBoundingClientRect(); return { id: element.id || element.className, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
    const boxes = [...document.querySelectorAll('#coach,#ending,#holding,#progress,#journey,#overview-hint,.game-title,nav')].filter(visible).map(rect);
    const caption = document.querySelector('#caption'), lines = [];
    if (visible(caption)) {
      const range = document.createRange(); range.selectNodeContents(caption);
      for (const r of range.getClientRects()) lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    return { width: innerWidth, height: innerHeight, boxes, caption: caption.textContent, lines };
  });
  (report.overlayBounds ??= []).push({ capture: name, ...overlays });
  for (const box of [...overlays.boxes, ...overlays.lines.map(line => ({ id: 'caption text', ...line }))]) {
    if (box.left < -.5 || box.right > overlays.width + .5 || box.top < -.5 || box.bottom > overlays.height + .5) {
      report.layoutErrors.push(`${name}: ${box.id} must stay inside the viewport`);
    }
  }
  const stats = await page.evaluate(() => window.__demoStats);
  if (stats) report.rendering.push({ capture: name, ...stats });
  await checkpoint(name);
  console.log(`Captured ${name}`);
  } finally {
    if (!wasPaused && !page.isClosed()) await page.evaluate(() => window.__memory.pause(false));
  }
}
async function click(selector) {
  await page.waitForFunction(selector => {
    const element = document.querySelector(selector); return element && !element.disabled && !element.hidden;
  }, selector);
  const hit = await page.locator(selector).evaluate(element => {
    const r = element.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    return { x, y, unobstructed: element.contains(document.elementFromPoint(x, y)) };
  });
  assert.ok(hit.unobstructed, `${selector} centre must receive a real pointer click`);
  await page.mouse.click(hit.x, hit.y);
}
async function layout(label, expected) {
  const check = { ok: (value, message) => { if (!value) report.layoutErrors.push(message); }, equal: (value, expected, message) => { if (value !== expected) report.layoutErrors.push(message); } };
  const measurement = await page.evaluate(() => {
    const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
    const active = [...document.querySelectorAll('.world-target:not(:disabled)')].map(element => {
      const r = element.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
      return { id: element.dataset.target, x: r.x, y: r.y, w: r.width, h: r.height,
        hit: element.contains(document.elementFromPoint(x, y)) };
    });
    const overlays = [...document.querySelectorAll('#coach,#ending,#holding,#progress,#journey,#overview-hint,.game-title,nav')].filter(visible).map(element => ({ id: element.id || element.className || element.tagName, ...rect(element) }));
    const activeLeafIds = new Set(active.filter(target => target.id.startsWith('leaf-')).map(target => target.id));
    const leaves = window.__memory.stats().cells.filter(cell => cell.leafBounds && activeLeafIds.has(`leaf-${cell.id}`)).map(cell => ({ id: `leaf-rim-${cell.id}`, x: cell.leafBounds.left, y: cell.leafBounds.top, w: cell.leafBounds.width, h: cell.leafBounds.height }));
    const controls = [...document.querySelectorAll('button:not(.world-target):not(:disabled)')].filter(visible).map(element => {
      const r = rect(element), x = r.x + r.w / 2, y = r.y + r.h / 2;
      return { id: element.id || element.textContent.trim(), ...r, hit: element.contains(document.elementFromPoint(x, y)) };
    });
    return { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth + 1, active, overlays, controls, leaves };
  });
  report.layouts.push({ label, ...measurement });
  check.equal(measurement.overflow, false, `${label}: no horizontal overflow`);
  if (expected !== undefined) check.equal(measurement.active.length, expected, `${label}: expected active targets`);
  for (const target of measurement.active) {
    check.ok(target.w >= 43.9 && target.h >= 43.9, `${label}: ${target.id} is at least44px`);
    check.ok(target.x >= -0.5 && target.y >= -0.5 && target.x + target.w <= measurement.width + 0.5
      && target.y + target.h <= measurement.height + 0.5, `${label}: ${target.id} fully inside viewport`);
    check.ok(target.hit, `${label}: ${target.id} centre unobstructed`);
  }
  for (let i = 0; i < measurement.active.length; i++) for (let j = i + 1; j < measurement.active.length; j++) {
    const a = measurement.active[i], b = measurement.active[j];
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    check.ok(overlapX <= 0.5 || overlapY <= 0.5, `${label}: ${a.id} and ${b.id} must not overlap`);
  }
  for (const rim of measurement.leaves) check.ok(rim.x >= -.5 && rim.y >= -.5 && rim.x + rim.w <= measurement.width + .5 && rim.y + rim.h <= measurement.height + .5, `${label}: ${rim.id} stays fully inside the viewport`);
  for (const a of [...measurement.active, ...measurement.leaves]) for (const b of measurement.overlays) {
    const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    check.ok(overlapX <= 0.5 || overlapY <= 0.5, `${label}: ${a.id} must not be covered by ${b.id}`);
  }
  for (const control of measurement.controls) {
    check.ok(control.w >= 43.9 && control.h >= 43.9, `${label}: ${control.id} control is at least44px`);
    check.ok(control.hit && control.x >= -0.5 && control.y >= -0.5 && control.x + control.w <= measurement.width + 0.5
      && control.y + control.h <= measurement.height + 0.5, `${label}: ${control.id} control is on screen and unobstructed`);
  }
}
async function restartThroughDialog() {
  await click('#pause'); await page.locator('#pause-dialog').waitFor({ state: 'visible' });
  await click('#restart'); await phase('ready'); await cameraReady();
}
async function framing(label, hazard = null) {
  const view = await page.evaluate(() => {
    const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
    return { width: innerWidth, height: innerHeight,
      actors: Object.values(window.__memory.stats().bridge.pairs).flatMap(pair => pair.actors),
      overlays: [...document.querySelectorAll('#coach,#ending,#holding,#progress,#journey,#overview-hint,.game-title,nav')].filter(visible).map(element => {
        const r = element.getBoundingClientRect(); return { id: element.id || element.className || element.tagName, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      }) };
  });
  (report.framing ??= []).push({ label, ...view });
  assert.equal(view.actors.length, 6, `${label}: all six helpers remain present`);
  const visibleIds = hazard && (await page.evaluate(() => window.__memoryAssessGeometry(window.__memory.stats().bridge).actors)).filter(actor => actor[hazard]).map(actor => actor.id);
  const selectedSpecies = (await bridge()).selected;
  for (const actor of view.actors) {
    if (visibleIds && !visibleIds.includes(actor.id)) continue;
    if (!hazard && selectedSpecies && !actor.id.startsWith(`${selectedSpecies}-`)) continue;
    if (!actor.screen?.visible || !actor.headScreen?.visible) report.layoutErrors.push(`${label}: ${actor.id} body/head stays inside camera frame`);
    const p = actor.headScreen;
    if (p) for (const overlay of view.overlays) if (!(p.x < overlay.left || p.x > overlay.right || p.y < overlay.top || p.y > overlay.bottom)) {
      report.layoutErrors.push(`${label}: ${actor.id} face is obscured by ${overlay.id}`);
    }
  }
}
async function matchSpecies(species, settle = true) {
  if ((await bridge()).selected !== null) await click('#cancel-choice');
  const ids = (await state()).cards.filter(card => card.species === species).map(card => card.id);
  await click(leaf(ids[0])); await phase('one-open'); await click(leaf(ids[1]));
  // The matched status persists after the brief transfer phase. Await it so
  // a slow diagnostic round trip cannot miss an otherwise successful match.
  await page.waitForFunction(ids => ids.every(id => window.__memory.state().cards[id].status === 'matched'), ids, { timeout: 18000 });
  await page.waitForFunction(() => ['ready', 'won'].includes(window.__memory.state().phase));
  if (settle) await page.waitForFunction(ids => window.__memory.stats().cells.filter(cell => ids.includes(cell.id)).every(cell => cell.moved && !cell.moving), ids, { timeout: 90000 });
  else if ((await state()).phase === 'ready' && await page.evaluate(() => window.__memory.stats().cells.some(cell => cell.moving))) {
    assert.ok(await page.locator('.world-target[data-target^="leaf-"]:not(:disabled)').count() > 0, 'valid memory input remains available during home travel');
  }
  if (settle) await cameraReady();
  return ids;
}
async function selectHelpers(species) {
  if ((await bridge()).selected !== null && (await bridge()).selected !== species) await click('#cancel-choice');
  const index = await page.evaluate(species => window.__memory.stats().nests.find(nest => nest.species === species).index, species);
  if ((await bridge()).selected !== species) await click(`[data-target="nest-${index}"]`);
  assert.equal((await bridge()).selected, species);
  await cameraReady();
  return index;
}
async function waitAction(id) {
  await page.waitForFunction(id => {
    const b = window.__memory.bridge();
    const complete = id === 'lift' ? b.branch === 'held' : id === 'lower' ? b.branch === 'down' : id === 'roll' ? b.bridgeBuilt : id === 'cross' ? b.atStaging : id === 'lay' ? b.boardwalkBuilt : b.visited;
    if (b.active === null && !complete) throw new Error(`${id} stopped before completing: ${document.getElementById('caption').textContent}`);
    return b.active === null && complete;
  }, id, { timeout: 90000 });
  assert.equal((await bridge()).selected, null, 'every completed action clears helper selection');
  await cameraReady();
}
// Arm inside the page BEFORE starting/resuming motion. Host-side pointer calls,
// screenshots and diagnostic IPC must not consume a brief observation window.
async function armPause(request) {
  await page.evaluate(request => {
    const marker = window.__memoryPauseMarker = { request, status: 'armed', started: false };
    if (request.triggerSelector) document.querySelector(request.triggerSelector).addEventListener('click', () => { marker.triggered = true; }, { once: true });
    function sample() {
      if (window.__memoryPauseMarker !== marker || marker.status !== 'armed') return;
      if (request.triggerSelector && !marker.triggered) { requestAnimationFrame(sample); return; }
      const stats = window.__demoStats, world = stats?.bridge, active = world?.action, camera = stats?.camera;
      if (!stats) { requestAnimationFrame(sample); return; }
      let ready = false;
      if (request.kind === 'camera') {
        ready = camera.mode === request.mode && camera.moving && camera.progress > .12 && camera.progress < .85;
        if (ready) {
          const before = JSON.stringify({ memory: window.__memory.state(), bridge: window.__memory.bridge() });
          for (let id = 0; id < 6; id++) window.__memory.pick(id);
          for (let index = 0; index < 3; index++) window.__memory.nest(index);
          for (const id of ['branch', 'log', 'staging', 'bark', 'grove']) window.__memory.task(id);
          window.__memoryCameraAttempt = { guarded: before === JSON.stringify({ memory: window.__memory.state(), bridge: window.__memory.bridge() }), enabled: document.querySelectorAll('.world-target:not(:disabled)').length };
        }
      } else if (request.kind === 'camera-settled') {
        ready = camera.mode === request.mode && !camera.moving && camera.settled;
      } else if (request.kind === 'work-progress') {
        ready = window.__memory.bridge().boardwalkBuilt || active?.elapsed >= request.from + .3;
      } else if (request.kind === 'memory-phase') {
        ready = window.__memory.state().phase === request.phase;
      } else if (request.kind === 'greeting') {
        ready = world.pairs[request.species].actors.every(actor => ['delight', 'greet'].includes(actor.gesture) || ['delight', 'greet'].includes(actor.motion));
      } else {
        if (active?.id === request.id) marker.started = true;
        if (marker.started && !active) {
          marker.status = 'failed'; marker.error = `${request.id} ended before its observation: ${document.getElementById('caption').textContent}`; return;
        }
        if (request.kind === 'panel') {
          ready = active?.id === 'lay' && active.panel === request.panel && active.phase === 'place' && active.progress > .35 && active.progress < .8 && !camera.moving;
        } else {
          const id = request.id, motionPhase = { lift: 'lift', lower: 'release', roll: 'roll', cross: 'cross', finish: 'finish' }[id];
          const actors = ['cross', 'finish'].includes(id) ? window.__memoryAssessGeometry(world).actors : [];
          const onBridge = id === 'cross' ? actors.some(actor => actor.water) : id === 'finish' ? actors.some(actor => actor.marsh) : true;
          const cargo = world.boardwalk?.cargo;
          const matchingPhase = id === 'lay' ? active?.phase === 'carry' && active.progress > (request.carryProgress ?? .65) && cargo?.visible && cargo.corners.length === 8 : ['cross', 'finish'].includes(id) ? true : active?.phase === motionPhase;
          const readableMotion = id === 'roll' ? active?.progress >= .45 && active.progress < .7 : active?.progress > .2 && active.progress < .8;
          ready = active?.id === id && matchingPhase && onBridge && !camera.moving && (['cross', 'finish', 'lay'].includes(id) || readableMotion);
        }
      }
      if (ready) { window.__memory.pause(true); marker.status = 'paused'; return; }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }, request);
}
async function waitForPause() {
  await page.waitForFunction(() => {
    const marker = window.__memoryPauseMarker;
    if (marker?.status === 'failed') throw new Error(marker.error);
    return marker?.status === 'paused';
  }, undefined, { timeout: 90000 });
}
async function startPausedAction(targetId, id, screenshot, finish = true, keepPaused = false) {
  await armPause({ kind: 'action', id }); await click(task(targetId));
  await pausedAction(id, screenshot, finish, keepPaused);
}
async function assertBridgeReset() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const rules = await bridge(), world = await page.evaluate(() => window.__memory.stats().bridge);
  assert.equal(rules.phase, 'locked'); assert.deepEqual(rules.unlocked, []);
  assert.equal(rules.branch, 'down'); assert.equal(rules.bridgeBuilt, false); assert.equal(rules.atStaging, false); assert.equal(rules.boardwalkBuilt, false); assert.equal(rules.visited, false);
  assert.equal(world.action, null); assert.equal(world.branch.held, false); assert.equal(world.bridge.built, false); assert.equal(world.grove.visited, false);
  const cells = await page.evaluate(() => window.__memory.stats().cells);
  assert.ok(cells.every(cell => !cell.actorVisible && !cell.moving && !cell.moved && cell.open === 0), 'restart hides all actors and clears travel');
  if (polish) {
    const navigation = await page.evaluate(() => window.__memory.stats().homeNavigation);
    assert.deepEqual(navigation.queued, [], 'restart clears waiting corridor reservations');
    assert.deepEqual(navigation.active, [], 'restart cancels every active home route');
  }
  assert.ok(world.boardwalk.panels.every(panel => !panel.placed), 'restart removes every placed bark panel');
  assert.equal((await camera()).mode, 'auto');
}

async function pausedAction(id, screenshot, finish = true, keepPaused = false) {
  await waitForPause();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const heldRules = await bridge(), heldWorld = await page.evaluate(() => window.__memory.stats().bridge);
  const heldFx = await page.evaluate(() => window.__memory.stats().fx);
  assert.equal(heldRules.active, id);
  await page.evaluate(ids => { for (const id of ids) window.__memory.task(id); window.__memory.nest(0); window.__memory.pick(0); }, TASK_IDS);
  assert.deepEqual(await bridge(), heldRules, 'repeated commands cannot replace active work');
  assert.equal(await page.locator('.world-target:not(:disabled)').count(), 0, 'an active task locks board, nests and tasks');
  assert.equal(await page.locator('.pair-selected').count(), 0, 'no selection ring is left at a moving pair’s old position');
  const before = await worldPixels(); await page.waitForTimeout(350);
  assert.deepEqual(await bridge(), heldRules); assert.deepEqual(await page.evaluate(() => window.__memory.stats().bridge), heldWorld);
  assert.deepEqual(await page.evaluate(() => window.__memory.stats().fx), heldFx, 'pause freezes emitted foot dust and leaf particles');
  assert.ok(before.equals(await worldPixels()), `paused ${id} canvas is pixel-stable`);
  assert.equal(await page.evaluate(() => window.__memory.audio().voices), 0);
  assert.equal(await page.evaluate(() => window.__memory.audio().riverPlaying), false, 'pause also stops the river loop');
  assert.equal(await page.evaluate(() => window.__memory.audio().music.playing), false, 'pause also stops the actual music media element');
  if (id === 'cross') await framing('paused bridge crossing', 'water');
  if (id === 'finish') await framing('paused bark crossing', 'marsh');
  if (screenshot) await capture(screenshot);
  if (!keepPaused) await page.evaluate(() => window.__memory.pause(false));
  if (finish) await waitAction(id);
}

async function verifyCrossing(action = 'cross') {
  const trace = await page.evaluate(() => window.__memoryCrossing);
  assert.ok(trace?.length > 10, 'crossing has measured animation samples');
  const evidence = {}, final = assessBridgeGeometry(await page.evaluate(() => window.__memory.stats().bridge));
  for (const species of HELPERS) for (let member = 0; member < 2; member++) {
    const id = `${species}-${member}`, positions = trace.map(frame => frame.actors.find(actor => actor.id === id)).filter(Boolean);
    const overRiver = positions.filter(actor => action === 'cross' ? actor.water : actor.marsh), arrival = final.actors.find(actor => actor.id === id);
    const distinctRiverPositions = new Set(overRiver.map(actor => actor.position.map(value => value.toFixed(3)).join(','))).size;
    assert.ok(overRiver.length >= 2, `${id} actually traverses the river`);
    assert.ok(distinctRiverPositions >= 2, `${id} moves across the bridge rather than only repeating a frozen position`);
    if (action === 'cross') assert.ok(positions.some(actor => actor.bank === 'near'), `${id} starts on the near bank`);
    else assert.ok(positions.some(actor => actor.staging), `${id} starts at staging before the marsh`);
    assert.ok(arrival?.bank === 'far' && !arrival.marsh && (action === 'cross' ? arrival.staging : arrival.destination), `${id} finishes in the correct dry destination`);
    evidence[id] = { measuredFrames: positions.length, overRiverFrames: overRiver.length, distinctRiverPositions, feetChecked: Math.max(...positions.map(actor => actor.feetChecked)),
      near: positions[0].position, far: arrival.position, bridgeSample: overRiver[Math.floor(overRiver.length / 2)].position };
  }
  (report.crossingEvidence ??= {})[action] = evidence;
  await page.evaluate(() => { window.__memoryCrossing = null; });
}

async function assertWorldInputBlocked(label) {
  assert.equal(await page.locator('.world-target:not(:disabled)').count(), 0, `${label}: DOM targets are disabled`);
  const guarded = await page.evaluate(ids => {
    const before = { memory: window.__memory.state(), bridge: window.__memory.bridge() };
    for (let id = 0; id < 6; id++) window.__memory.pick(id);
    for (let index = 0; index < 3; index++) window.__memory.nest(index);
    for (const id of ids) window.__memory.task(id);
    return JSON.stringify(before) === JSON.stringify({ memory: window.__memory.state(), bridge: window.__memory.bridge() });
  }, TASK_IDS);
  assert.equal(guarded, true, `${label}: direct handlers also reject input`);
}

async function cameraTransition(mode, screenshot, keepPaused = false) {
  assert.notEqual((await camera()).mode, mode, 'a transition starts from the other camera mode');
  await page.evaluate(() => window.__memory.pause(true));
  await armPause({ kind: 'camera', mode });
  await click('#camera');
  // A caller may intentionally keep its action paused between observations.
  await page.evaluate(() => window.__memory.pause(false));
  await waitForPause();
  assert.deepEqual(await page.evaluate(() => window.__memoryCameraAttempt), { guarded: true, enabled: 0 }, 'camera gating works before the test pauses the world');
  await assertWorldInputBlocked(`camera ${mode} travel`);
  // Let already-submitted rendering/LOD work settle without advancing the game clock.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const frozenCamera = await camera(), frozenWorld = await page.evaluate(() => window.__memory.stats().bridge);
  const pixels = await worldPixels(); await page.waitForTimeout(250);
  assert.deepEqual(await camera(), frozenCamera, 'pause freezes the camera interpolation');
  assert.deepEqual(await page.evaluate(() => window.__memory.stats().bridge), frozenWorld, 'camera pause also freezes actors/effects');
  const afterPixels = await worldPixels();
  if (!pixels.equals(afterPixels)) {
    await writeFile(path.join(out, `${screenshot || mode}-before.png`), pixels);
    await writeFile(path.join(out, `${screenshot || mode}-after.png`), afterPixels);
  }
  assert.ok(pixels.equals(afterPixels), 'paused cinematic frame is pixel-stable');
  if (screenshot) await capture(screenshot);
  await armPause({ kind: 'camera-settled', mode });
  await page.evaluate(() => window.__memory.pause(false)); await waitForPause(); await cameraReady(mode);
  if (mode === 'overview') await assertWorldInputBlocked('settled inspection overview');
  if (!keepPaused) await page.evaluate(() => window.__memory.pause(false));
}

async function responsive(label, checkActors = false) {
  for (const [suffix, size] of [['wide', { width: 1280, height: 800 }], ['portrait', { width: 820, height: 1180 }], ['phone', { width: 390, height: 844 }]]) {
    await resizeTo(size); await page.waitForTimeout(100);
    await layout(`${label} ${suffix}`); if (checkActors) await framing(`${label} ${suffix}`); await capture(`${label}-${suffix}`);
  }
  await resizeTo({ width: 1280, height: 800 });
}

try {
  await mkdir(out, { recursive: true });
  let url = process.env.MEMORY_URL;
  if (!url) {
    server = http.createServer(handle);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    url = `http://127.0.0.1:${server.address().port}/remake/minnisspil.html?qa&seed=613`;
  }
  report.url = url;
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined,
    args: ['--enable-unsafe-swiftshader'] });
  report.browser = browser.version();
  page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(18000);
  // The anatomical separating-axis audit is deliberately outside the page's
  // RAF so its CPU work cannot force the game's dynamic resolution downward.
  await page.exposeFunction('__memoryAssessClearances', snapshot => {
    const result = assessSceneClearances(snapshot);
    const objects = [...(snapshot.collisionObjects ?? []), ...bridgeCollisionObjects(snapshot.bridge)];
    const violations = result.violations.map(hit => ({ ...hit, evidence: {
      actor: snapshot.collisionActors.find(actor => actor.id === hit.a),
      other: snapshot.collisionActors.find(actor => actor.id === hit.b) ?? objects.find(object => object.id === hit.b),
      action: snapshot.bridge.action,
    } }));
    return { minimum: result.minimum, violations, permitted: result.permittedContacts?.length || 0 };
  });
  await page.addInitScript(() => localStorage.setItem('mosi.memory.muted.v1', 'false'));
  page.on('pageerror', error => report.errors.push({ type: 'javascript', message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') report.errors.push({ type: 'console', message: message.text() });
    else if (message.type() === 'warning') report.warnings.push(message.text());
  });
  page.on('response', response => {
    if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) report.errors.push({ type: 'http', status: response.status(), url: response.url() });
  });
  page.on('requestfailed', request => {
    if (!/ERR_ABORTED/.test(request.failure()?.errorText || '')) report.errors.push({ type: 'request', url: request.url(), message: request.failure()?.errorText });
  });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__memoryReady || document.getElementById('error')?.hidden === false, undefined, { timeout: 90000 });
  assert.equal(await page.evaluate(() => window.__memoryReady), true, 'scene loads');
  assessBridgeGeometry(await page.evaluate(() => window.__memory.stats().bridge), { requireMarsh: true });
  await page.evaluate(async () => {
    const assess = (await import('./tools/memory-geometry-check.mjs')).assessBridgeGeometry;
    window.__memoryAssessGeometry = (world, options = {}) => assess(world, { ...options, requireMarsh: true });
    window.__memoryBudget = { drawCalls: 0, triangles: 0, minimumResolutionScale: 1, sampledFrames: 0 };
    window.__memoryNavigationAudit = { maxSliceMs: 0, maxPlanningMs: 0, maxPendingPlans: 0, maxQueued: 0, maxActive: 0, maxDeferred: 0, maxFailures: 0 };
    window.__memoryGeometry = { frames: 0, errors: [], samples: [], stages: [], actorsWithFeet: [], maxWaterActors: 0, movingCellsChecked: 0 };
    window.__memoryCameraAudit = { movingFrames: 0, overviewFrames: 0, errors: [], intents: [] };
    window.__memoryCollision = { frames: 0, duringCameraTravel: 0, allIds: [], minimum: null, permitted: 0, worst: {}, stages: [], pending: false, errors: [] };
    window.__memoryAudioAudit = { kinds: {}, assets: {}, speechLines: [], musicSource: null, maxActionVolume: 0, maxIdleVolume: 0, maxSpeechTarget: 0, speechMusicFrames: 0, decoded: 0, failed: [], footPuffs: 0 };
    const seenAudio = new Set(); let lastCollisionAt = -Infinity, lastSpeechId = null, stableSpeechFrames = 0;
    let previousCameraFrame = null;
    function sample(now) {
      // The game already publishes actual render/root/foot data each frame.
      // Clone anatomical envelopes only when dispatching a clearance sample.
      const stats = window.__demoStats;
      if (!stats) { requestAnimationFrame(sample); return; }
      window.__memoryBudget.sampledFrames++;
      if (Number.isFinite(stats.resolutionScale)) window.__memoryBudget.minimumResolutionScale = Math.min(window.__memoryBudget.minimumResolutionScale, stats.resolutionScale);
      const nav = stats.homeNavigation, navGate = window.__memoryNavigationAudit;
      if (nav) {
        for (const [key, value] of Object.entries({ maxSliceMs: nav.maxSliceMs, maxPlanningMs: nav.maxPlanningMs, maxPendingPlans: nav.pendingPlans, maxQueued: nav.queued.length, maxActive: nav.active.length, maxDeferred: nav.deferred, maxFailures: nav.failures })) navGate[key] = Math.max(navGate[key], value || 0);
      }
      const audio = window.__memory.audio(), audioGate = window.__memoryAudioAudit;
      audioGate.decoded = Math.max(audioGate.decoded, audio.recordedLoaded);
      audioGate.failed = [...new Set([...audioGate.failed, ...audio.recordedFailed, ...audio.speech.errors])];
      audioGate.musicSource = audio.music.source; audioGate.footPuffs = Math.max(audioGate.footPuffs, stats.fx?.footPuffs || 0);
      if (audio.speech.current && !audioGate.speechLines.includes(audio.speech.current)) audioGate.speechLines.push(audio.speech.current);
      if (audio.music.playing && !audio.speech.playing) {
        const key = window.__memory.bridge().active ? 'maxActionVolume' : 'maxIdleVolume'; audioGate[key] = Math.max(audioGate[key], audio.music.volume);
      }
      if (audio.speech.playing && audio.music.playing) {
        stableSpeechFrames = lastSpeechId === audio.speech.current ? stableSpeechFrames + 1 : 1;
        if (stableSpeechFrames > 1) { audioGate.speechMusicFrames++; audioGate.maxSpeechTarget = Math.max(audioGate.maxSpeechTarget, audio.music.target); }
        lastSpeechId = audio.speech.current;
      } else { lastSpeechId = null; stableSpeechFrames = 0; }
      for (const event of audio.log) {
        const key = `${event.kind}/${event.asset}/${event.start}/${event.end}`; if (seenAudio.has(key)) continue; seenAudio.add(key);
        if (event.source === 'recorded') { audioGate.kinds[event.kind] = (audioGate.kinds[event.kind] || 0) + 1; audioGate.assets[event.asset] = (audioGate.assets[event.asset] || 0) + 1; }
      }
      if (now - lastCollisionAt >= 80 && !window.__memory.state().paused && !window.__memoryCollision.pending && !window.__memoryStopCollision) {
        const stats = window.__memory.stats();
        lastCollisionAt = now; const gate = window.__memoryCollision;
        const stage = stats.bridge.action ? `${stats.bridge.action.id}/${stats.bridge.action.phase}/${stats.bridge.action.panel}` : stats.bridge.stage;
        gate.pending = true;
        window.__memoryAssessClearances({ collisionActors: stats.collisionActors, collisionObjects: stats.collisionObjects, bridge: stats.bridge }).then(result => {
          gate.frames++; if (stats.camera.moving) gate.duringCameraTravel++;
          if (!gate.stages.includes(stage)) gate.stages.push(stage);
          if (result.minimum !== null) gate.minimum = gate.minimum === null ? result.minimum : Math.min(gate.minimum, result.minimum);
          gate.permitted += result.permitted;
          for (const actor of stats.collisionActors || []) if (!gate.allIds.includes(actor.id)) gate.allIds.push(actor.id);
          for (const hit of result.violations) {
            const key = `${stage}:${hit.a}:${hit.b}:${hit.kindA}:${hit.kindB}`, old = gate.worst[key];
            if ((!old || hit.clearance < old.clearance) && (old || Object.keys(gate.worst).length < 80)) gate.worst[key] = { ...hit, stage, cameraMoving: stats.camera.moving, positions: stats.collisionActors.map(actor => ({ id: actor.id, position: actor.position, yaw: actor.yaw })) };
          }
        }).catch(error => { if (!gate.errors.includes(error.message)) gate.errors.push(error.message); }).finally(() => { gate.pending = false; });
      }
      if (stats?.drawCalls > window.__memoryBudget.drawCalls) {
        window.__memoryBudget.drawCalls = stats.drawCalls;
        window.__memoryBudget.drawCallPeakState = { phase: window.__memory.state().phase, bridge: window.__memory.bridge(), camera: { mode: stats.camera.mode, intent: stats.camera.intent, progress: stats.camera.progress }, size: stats.size, resolutionScale: stats.resolutionScale };
      }
      if (stats?.triangles > window.__memoryBudget.triangles) {
        window.__memoryBudget.triangles = stats.triangles;
        window.__memoryBudget.peakState = { phase: window.__memory.state().phase, bridge: window.__memory.bridge(), size: stats.size, resolutionScale: stats.resolutionScale };
      }
      if (stats?.bridge) {
        const extraActors = (stats.cells ?? []).filter(cell => cell.actorVisible && cell.position).map(cell => ({ id: `leaf-${cell.id}`, position: cell.position, feet: cell.feet }));
        const geometry = window.__memoryAssessGeometry(stats.bridge, { extraActors }), gate = window.__memoryGeometry;
        const stage = stats.bridge.action ? `${stats.bridge.action.id}/${stats.bridge.action.phase}` : stats.bridge.stage;
        gate.frames++; gate.maxWaterActors = Math.max(gate.maxWaterActors, geometry.actors.filter(actor => actor.water).length);
        gate.movingCellsChecked += (stats.cells ?? []).filter(cell => cell.actorVisible && cell.moving && cell.position).length;
        if (!gate.stages.includes(stage)) gate.stages.push(stage);
        for (const error of geometry.errors) { const key = `${stage}: ${error}`; if (!gate.errors.includes(key) && gate.errors.length < 50) { gate.errors.push(key); gate.samples.push({ stage, violations: geometry.violations }); } }
        for (const actor of geometry.actors) if (actor.feetChecked && !gate.actorsWithFeet.includes(actor.id)) gate.actorsWithFeet.push(actor.id);
        if (window.__memoryCrossing && ['cross', 'finish'].includes(stats.bridge.action?.id)) window.__memoryCrossing.push(geometry);
      }
      const c = stats.camera, audit = window.__memoryCameraAudit;
      const cameraError = message => { if (!audit.errors.includes(message)) audit.errors.push(message); };
      if (!audit.intents.includes(c.intent)) audit.intents.push(c.intent);
      if (c.moving) audit.movingFrames++;
      if (c.mode === 'overview') audit.overviewFrames++;
      if (c.moving || c.mode === 'overview') {
        if (c.worldInputEnabled) cameraError('world input enabled during camera travel or overview');
        if (document.querySelector('.world-target:not(:disabled)')) cameraError('live DOM world target during camera travel or overview');
      }
      const action = stats.bridge.action;
      if (c.mode === 'auto' && c.moving && action && previousCameraFrame?.moving && previousCameraFrame.mode === 'auto'
          && previousCameraFrame.intent === c.intent && previousCameraFrame.actionId === action.id && previousCameraFrame.actionPhase === action.phase
          && action.elapsed > previousCameraFrame.elapsed + 1e-6) cameraError('action advanced during automatic focus travel');
      previousCameraFrame = { mode: c.mode, moving: c.moving, intent: c.intent, actionId: action?.id, actionPhase: action?.phase, elapsed: action?.elapsed };
      if (window.__memoryReleasedCross && stats?.bridge?.action?.id === 'cross') {
        window.__memoryReleasedCross.frames++;
        window.__memoryReleasedCross.maxLift = Math.max(window.__memoryReleasedCross.maxLift, stats.bridge.branch.lift);
      }
      if (window.__memoryFastMatch) {
        const fast = window.__memoryFastMatch;
        fast.triangles = Math.max(fast.triangles, stats.triangles); fast.drawCalls = Math.max(fast.drawCalls, stats.drawCalls);
        fast.moving = Math.max(fast.moving, stats.cells.filter(cell => cell.moving).length);
        fast.visible = Math.max(fast.visible, stats.cells.filter(cell => cell.actorVisible).length);
        fast.queued = Math.max(fast.queued || 0, stats.homeNavigation?.queued.length || 0);
      }
      if (window.__memoryFreezeQueued && window.__memory.state().matchedPairs === window.__memoryFreezeQueued && stats.homeNavigation?.queued.length) {
        window.__memoryFreezeQueued = false;
        window.__memoryQueuedTransfer = { state: window.__memory.state(), navigation: stats.homeNavigation, cells: stats.cells };
        window.__memory.pause(true);
      }
      if (window.__memoryPanelCounts) {
        const count = stats.bridge.boardwalk.panels.filter(panel => panel.placed).length;
        if (window.__memoryPanelCounts.at(-1) !== count) window.__memoryPanelCounts.push(count);
      }
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  report.graphics = await page.evaluate(() => {
    const canvas = document.getElementById('world'), gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return null;
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return { renderer: gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL || gl.RENDERER), vendor: gl.getParameter(extension?.UNMASKED_VENDOR_WEBGL || gl.VENDOR),
      version: gl.getParameter(gl.VERSION), drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight] };
  });
  await page.evaluate(() => document.fonts.ready);
  await capture('initial');
  assert.equal(await page.evaluate(() => window.__memory.audio().riverPlaying), false, 'welcome is silent before a gesture');
  await click('#start'); await phase('ready'); await cameraReady();
  await page.waitForFunction(() => window.__memory.audio().riverPlaying);
  assert.equal((await state()).cards.length, 6);
  assert.equal(await page.locator('.world-target[data-target^="leaf-"]').count(), 6);
  const hiddenNames = await page.locator('.world-target[data-target^="leaf-"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
  assert.ok(hiddenNames.every(name => !/Þríhyrna|Kambeðla|Þórseðla/.test(name)), 'hidden accessible labels cannot reveal species');
  assert.equal((await bridge()).phase, 'locked');
  const hiddenBridge = await page.evaluate(() => window.__memory.stats().bridge);
  assert.equal(hiddenBridge.branch.held, false); assert.equal(hiddenBridge.bridge.built, false);
  assert.equal(hiddenBridge.grove.visited, false);
  for (const id of TASK_IDS) assert.equal(await page.locator(task(id)).isDisabled(), true, 'tasks locked before helpers are found');
  await page.evaluate(ids => { for (const id of ids) window.__memory.task(id); }, [...TASK_IDS, 'invalid']);
  assert.equal((await bridge()).phase, 'locked', 'direct repeated actions cannot bypass locked tasks');
  await layout('tablet leaves', 6); await capture('play');
  report.checks.push('Six identical hidden choices load, accessible names hide species, tablet touch targets fit without overlap.');
  if (!journeyOnly) {
    await cameraTransition('overview', 'camera-overview-paused'); await responsive('overview');
    await cameraTransition('auto', 'camera-return-paused'); await responsive('clearing');
    report.checks.push('Overview is inspection-only; moving camera disables DOM and direct world input; pause freezes camera pixels and returning restores usable current-stage targets.');
  } else {
    const source = path.join(root, 'qa/memory/polish/check/report.json'), prior = JSON.parse(await readFile(source, 'utf8'));
    assert.deepEqual(prior.layoutErrors, []); assert.deepEqual(prior.cameraAudit.errors, []);
    assert.deepEqual(prior.errors, []); assert.deepEqual(prior.geometry.errors, []); assert.deepEqual(Object.values(prior.collisionAudit.worst), []);
    assert.equal(prior.fastMatch.visible, 6); assert.ok(prior.fastMatch.moving >= 2 && prior.queuedTransfer.navigation.queued.length > 0);
    assert.ok(prior.fastMatch.triangles <= 250000 && prior.fastMatch.drawCalls <= 100);
    assert.ok(prior.checks.some(check => check.startsWith('Fast valid matching')));
    report.retainedPreflight = { source, sourcePassed: prior.passed, note: 'Only completed preflight checks are retained; that run later stopped at the blocked first lift.', checks: prior.checks, fastMatch: prior.fastMatch, queuedRestart: true, layouts: prior.layouts.map(value => value.label), livePeak: prior.livePeak };
    const lowerSource = path.join(root, 'qa/memory/polish/journey-check/report.json'), lower = JSON.parse(await readFile(lowerSource, 'utf8'));
    assert.ok(lower.preLoweredCross.frames > 0); assert.equal(lower.preLoweredCross.maxLift, 0);
    assert.deepEqual(lower.layoutErrors, []); assert.deepEqual(lower.errors, []);
    report.retainedManualLower = { source: lowerSource, sourcePassed: lower.passed, note: 'Manual post-build lowering, pause and controls completed in this earlier run; its later geometric failures remain recorded there.', preLoweredCross: lower.preLoweredCross, recordedLowerCalls: lower.audioAudit.kinds['branch-lower'] };
  }

  if (scope === 'full') {
  const initial = await state(), first = initial.cards[0], other = initial.cards.find(card => card.species !== first.species);
  const memoryCamera = await camera();
  await click(leaf(first.id)); await phase('one-open'); await capture('revealed-one');
  assert.deepEqual((await camera()).position, memoryCamera.position, 'a leaf reveal preserves spatial memory instead of moving the camera');
  await click(leaf(other.id)); await phase('mismatch');
  await page.waitForTimeout(500);
  assert.equal((await state()).cards.filter(card => card.status === 'open').length, 2, 'mismatch remains visible for reading');
  assert.equal(await page.locator('.world-target[data-target^="leaf-"]:not(:disabled)').count(), 0, 'third reveal blocked');
  // Screenshot capture can take longer than the reading hold on a software renderer; freeze only the capture.
  await page.evaluate(() => window.__memory.pause(true)); await capture('revealed-two');
  await page.evaluate(() => window.__memory.pause(false));
  await click('#pause'); await page.locator('#pause-dialog').waitFor({ state: 'visible' });
  const paused = await state(); assert.equal(paused.paused, true);
  await page.waitForTimeout(850);
  assert.deepEqual(await state(), paused, 'pause freezes pending mismatch state');
  assert.equal(await page.evaluate(() => window.__memory.audio().voices), 0, 'pause cancels queued sound');
  assert.equal(await page.evaluate(() => window.__memory.audio().riverPlaying), false);
  await click('#pause-dialog [data-resume]'); await phase('ready');
  assert.ok((await state()).cards.every(card => card.status === 'hidden'));
  report.checks.push('Mismatch exposes both, blocks third input, freezes under pause, then closes and returns to ready.');

  await click(leaf(first.id)); await phase('one-open');
  await click('#sound');
  const muted = await page.evaluate(() => window.__memory.audio());
  assert.equal(muted.muted, true); assert.equal(muted.voices, 0); assert.equal(muted.riverPlaying, false);
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(() => window.__memory.audio().played), muted.played);
  await click('#sound'); await restartThroughDialog();
  const pair = (await state()).cards.filter(card => card.species === 'triceratops').map(card => card.id);
  await click(leaf(pair[0])); await phase('one-open'); await armPause({ kind: 'memory-phase', phase: 'matching' });
  await click(leaf(pair[1])); await waitForPause();
  await restartThroughDialog();
  const reset = await state(); assert.equal(reset.matchedPairs, 0); assert.ok(reset.cards.every(card => card.status === 'hidden'));
  const resetWorld = await page.evaluate(() => window.__memory.stats());
  assert.ok(resetWorld.nests.every(nest => nest.count === 0), 'restart clears nest residents');
  assert.ok(resetWorld.cells.every(cell => !cell.moving && !cell.moved), 'restart cancels old travel');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const settledReset = await page.evaluate(() => window.__memory.stats());
  assert.ok(settledReset.cells.every(cell => !cell.moving && !cell.moved && !cell.actorVisible && cell.open === 0), 'settled restart hides every actor and closes every cover');
  assert.equal((await bridge()).phase, 'locked', 'restart relocks helper tasks');
  report.checks.push('Mute cancels calls; restarting during a matched transfer restores six hidden leaves and empty nests.');
  }

  if (!journeyOnly) {
  await page.evaluate(() => { window.__memoryFastMatch = { triangles: 0, drawCalls: 0, moving: 0, visible: 0, queued: 0 }; });
  for (const species of ['brontosaurus', 'triceratops', 'stegosaurus']) await matchSpecies(species, false);
  await page.waitForFunction(() => window.__memory.stats().cells.every(cell => cell.moved && !cell.moving), undefined, { timeout: 90000 });
  await cameraReady(); await capture('fast-match-settled');
  report.fastMatch = await page.evaluate(() => { const result = window.__memoryFastMatch; window.__memoryFastMatch = null; return result; });
  assert.equal(report.fastMatch.visible, 6); assert.ok(report.fastMatch.moving >= 2);
  await restartThroughDialog(); await assertBridgeReset();
  if (polish) {
    const ids = (await state()).cards.filter(card => card.species === 'triceratops').map(card => card.id);
    await click(leaf(ids[0])); await phase('one-open');
    await page.evaluate(() => { window.__memoryFreezeQueued = 1; }); await click(leaf(ids[1]));
    await page.waitForFunction(() => Boolean(window.__memoryQueuedTransfer), undefined, { timeout: 30000 });
    report.queuedTransfer = await page.evaluate(() => window.__memoryQueuedTransfer);
    assert.ok(report.queuedTransfer.navigation.queued.length > 0, 'restart case reaches a real queued home route');
    await capture('queued-transfer-before-restart'); await restartThroughDialog(); await assertBridgeReset();
    await page.waitForTimeout(350); await assertBridgeReset();
  }
  report.checks.push('Fast valid matching waits only for rule-ready, permits new choices during previous home travel and measures the six-visible-actor rendering peak.');
  }

  if (!polish) {
  await matchSpecies('stegosaurus');
  assert.deepEqual((await bridge()).unlocked, ['stegosaurus']);
  await selectHelpers('stegosaurus');
  for (const id of TASK_IDS) assert.equal(await page.locator(task(id)).isDisabled(), true, 'Stegosaurus alone cannot skip to a later construction');
  await page.evaluate(() => window.__memory.task('bark')); assert.equal((await bridge()).active, null);
  await restartThroughDialog();
  }

  if (!polish) {
    await matchSpecies('triceratops'); await selectHelpers('triceratops');
    assert.equal(await page.locator(task('log')).isDisabled(), true);
    await page.evaluate(() => window.__memory.task('log')); assert.equal((await bridge()).active, null);
  }
  await matchSpecies('brontosaurus'); await selectHelpers('brontosaurus');
  await layout('Brontosaurus branch choice'); await capture('branch-choice');
  await startPausedAction('branch', 'lift', 'branch-lift-paused');
  assert.equal((await bridge()).branch, 'held');
  assert.equal(await page.locator('#holding').isVisible(), true);
  assert.equal(await page.locator('.world-target[data-target^="leaf-"]:not(:disabled)').count(), polish ? 4 : 2, 'holding permits every unfinished memory pair');
  if (polish) {
    assert.equal((await state()).matchedPairs, 1, 'Brontosaurus lifts while four covers remain closed');
    await matchSpecies('triceratops');
    assert.equal((await bridge()).branch, 'held', 'the next pair can plan its home route around the holding pair');
  }
  await selectHelpers('triceratops'); await startPausedAction('log', 'roll', 'log-roll-paused');
  assert.equal((await bridge()).bridgeBuilt, true); assert.equal((await bridge()).branch, 'held');
  assert.equal(await page.locator(task('staging')).isDisabled(), true, 'a built bridge still waits for the third pair');
  await page.evaluate(() => window.__memory.task('staging')); assert.equal((await bridge()).active, null);

  const lastPair = (await state()).cards.filter(card => card.species === 'stegosaurus').map(card => card.id);
  await click(leaf(lastPair[0])); await phase('one-open');
  await page.evaluate(() => window.__memory.task('staging')); assert.equal((await bridge()).active, null, 'crossing cannot interrupt a memory turn');
  await click(leaf(lastPair[1])); await phase('won');
  assert.equal((await bridge()).branch, 'held', 'memory remains playable while Brontosaurus holds');
  if (await page.evaluate(() => window.__memory.stats().cells.some(cell => cell.moving))) {
    assert.equal(await page.locator(task('staging')).isDisabled(), true, 'all six must physically arrive before crossing');
    await page.evaluate(() => window.__memory.task('staging')); assert.equal((await bridge()).active, null);
  }
  await page.waitForFunction(() => window.__memory.stats().cells.every(cell => !cell.moving), undefined, { timeout: 90000 }); await cameraReady();
  assert.equal(await page.locator('#ending').isVisible(), false, 'matching every pair is not environmental completion');
  await capture('memory-matched'); report.allSixVisible = await page.evaluate(() => window.__memory.stats());
  assert.equal(report.allSixVisible.cells.filter(cell => cell.actorVisible).length, 6);
  if (!journeyOnly) {
    await selectHelpers('brontosaurus'); await startPausedAction('branch', 'lower', 'branch-lower-paused');
    assert.equal((await bridge()).bridgeBuilt, true); assert.equal((await bridge()).branch, 'down');
  } else assert.equal((await bridge()).branch, 'held', 'fresh final journey exercises automatic release before crossing');
  await page.evaluate(() => { window.__memoryCrossing = []; window.__memoryReleasedCross = { frames: 0, maxLift: 0 }; });
  await startPausedAction('staging', 'cross', 'main-bridge-cross-paused'); await verifyCrossing('cross');
  const releaseTrace = await page.evaluate(() => window.__memoryReleasedCross);
  if (journeyOnly) { report.automaticReleaseCross = releaseTrace; assert.ok(releaseTrace.maxLift > 0); assert.equal((await bridge()).branch, 'down'); }
  else { report.preLoweredCross = releaseTrace; assert.equal(releaseTrace.maxLift, 0); }
  assert.ok(releaseTrace.frames > 0);
  await page.evaluate(() => { window.__memoryReleasedCross = null; });
  assert.equal((await bridge()).atStaging, true); assert.equal((await bridge()).visited, false);
  assert.equal(await page.locator('#ending').isVisible(), false, 'staging is not the ending');
  assert.equal(await page.locator(task('grove')).isDisabled(), true, 'the marsh still blocks the final grove');
  await responsive('staging', true);
  report.checks.push('Species prerequisites, memory-turn and physical-arrival guards hold; all six reach staging without triggering the ending. Surface and anatomical clearance are assessed separately.');

  for (const species of ['triceratops', 'brontosaurus']) {
    await page.evaluate(species => {
      const index = window.__memory.stats().nests.find(nest => nest.species === species).index;
      window.__memory.nest(index); window.__memory.task('bark');
    }, species);
    assert.equal((await bridge()).active, null, 'the wrong pair cannot build the bark walkway');
  }
  await selectHelpers('stegosaurus'); await responsive('bark-choice', true);
  await page.evaluate(() => { window.__memoryPanelCounts = []; });
  await startPausedAction('bark', 'lay', 'bark-carry-paused', false, true);
  const carried = report.rendering.findLast(frame => frame.capture === 'bark-carry-paused').bridge.boardwalk.cargo;
  assert.equal(carried.visible, true); assert.equal(carried.corners.length, 8);
  assert.ok(carried.corners.every(point => point.length === 3 && point.every(Number.isFinite)), 'cargo evidence uses finite actual transformed corners');
  await cameraTransition('overview', 'bark-overview-paused', true);
  const workBefore = await page.evaluate(() => window.__memory.stats().bridge.action?.elapsed);
  await armPause({ kind: 'work-progress', from: workBefore });
  await page.evaluate(() => window.__memory.pause(false)); await waitForPause();
  const workAfter = await page.evaluate(() => ({ elapsed: window.__memory.stats().bridge.action?.elapsed, built: window.__memory.bridge().boardwalkBuilt }));
  assert.ok(workAfter.built || workAfter.elapsed > workBefore, 'overview inspects ongoing work without cancelling or freezing it');
  await cameraTransition('auto', 'bark-focus-return-paused', true);
  for (const panel of [1, 2]) {
    await armPause({ kind: 'panel', id: 'lay', panel });
    await page.evaluate(() => window.__memory.pause(false)); await waitForPause();
    assert.equal(await page.evaluate(panel => window.__memory.stats().bridge.boardwalk.panels[panel].placed, panel), false, 'the panel remains real cargo while being lowered');
    await capture(panel === 1 ? 'bark-second-panel-place' : 'bark-third-panel-place');
  }
  await page.evaluate(() => window.__memory.pause(false));
  await waitAction('lay');
  const builtWalkway = await page.evaluate(() => window.__memory.stats().bridge.boardwalk);
  assert.equal(builtWalkway.panels.length, 3); assert.ok(builtWalkway.panels.every(panel => panel.placed));
  report.panelProgress = await page.evaluate(() => window.__memoryPanelCounts);
  assert.deepEqual(report.panelProgress, [0, 1, 2, 3], 'three panels are visibly placed in sequence');
  await page.evaluate(() => { window.__memoryPanelCounts = null; });
  assert.equal((await bridge()).boardwalkBuilt, true); assert.equal((await bridge()).visited, false);
  assert.equal(await page.locator('#ending').isVisible(), false, 'the ending waits for final arrival');
  await responsive('boardwalk-built', true);

  await page.evaluate(() => { window.__memoryCrossing = []; });
  await startPausedAction('grove', 'finish', 'marsh-cross-paused'); await verifyCrossing('finish');
  assert.equal((await bridge()).visited, true); assert.equal(await page.locator('#ending').isVisible(), true);
  const completed = await bridge();
  await page.evaluate(ids => { for (const id of ids) window.__memory.task(id); }, TASK_IDS);
  assert.deepEqual(await bridge(), completed, 'completed tasks do not replay rewards');
  await responsive('final-grove', true);
  const greetingTargets = await page.locator('.world-target[data-target^="nest-"]:not(:disabled)').count();
  assert.equal(greetingTargets, 3, 'all three final pairs offer a greeting');
  for (const species of HELPERS) {
    const index = await page.evaluate(species => window.__memory.stats().nests.find(nest => nest.species === species).index, species);
    const selector = `[data-target="nest-${index}"]`;
    await armPause({ kind: 'greeting', species, triggerSelector: selector });
    await click(selector); await waitForPause();
    assert.ok(await page.evaluate(species => window.__memory.stats().bridge.pairs[species].actors.every(actor => ['delight', 'greet'].includes(actor.gesture) || ['delight', 'greet'].includes(actor.motion)), species), `${species} actually responds to its final greeting target`);
    await page.evaluate(() => window.__memory.pause(false));
  }
  await cameraTransition('overview', 'final-overview-paused'); await responsive('final-overview');
  await cameraTransition('auto', 'final-return-paused');
  report.checks.push('Only Stegosaurus builds three actual bark panels; overview preserves ongoing work; all six reach the final grove and arrival unlocks the ending. Surface and anatomical clearance are assessed separately.');

  await click('#again'); await phase('ready'); await cameraReady(); await assertBridgeReset();
  await resizeTo({ width: 390, height: 844 }); await layout('phone replay leaves', 6);
  if (!polish) {
  await click('#pause'); await click('#motion'); assert.equal(await page.locator('#motion').getAttribute('aria-pressed'), 'true');
  await click('#pause-dialog [data-resume]');
  for (const mode of ['overview', 'auto']) {
    await click('#camera'); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal((await camera()).mode, mode); assert.equal((await camera()).moving, false, 'reduced-motion framing settles directly');
    if (mode === 'overview') await assertWorldInputBlocked('reduced-motion overview');
  }
  await matchSpecies('stegosaurus'); await matchSpecies('brontosaurus');
  await selectHelpers('brontosaurus'); await click(task('branch')); await waitAction('lift');
  await matchSpecies('triceratops'); assert.equal((await bridge()).branch, 'held');
  await selectHelpers('triceratops'); await click(task('log')); await waitAction('roll');
  await click(task('staging')); await waitAction('cross'); await responsive('calm-staging', true);
  await selectHelpers('stegosaurus'); await armPause({ kind: 'action', id: 'lay', carryProgress: .15 });
  await click(task('bark')); await waitForPause();
  await capture('restart-during-bark'); await restartThroughDialog(); await assertBridgeReset();
  await page.waitForTimeout(300); assert.equal((await bridge()).phase, 'locked', 'no abandoned panel completion can leak into replay');
  assert.equal(await page.locator('#ending').isVisible(), false);
  report.checks.push('Replay resets all stages/camera; reduced-motion framing snaps with safe input; restarting during Stegosaurus cargo work clears actors, panels and pending completion.');
  }

  report.final = { state: await state(), bridge: await bridge(), world: await page.evaluate(() => window.__memory.stats()), audio: await page.evaluate(() => window.__memory.audio()) };
  report.worstCaptured = { drawCalls: Math.max(...report.rendering.map(stage => stage.drawCalls)), triangles: Math.max(...report.rendering.map(stage => stage.triangles)),
    textures: Math.max(...report.rendering.map(stage => stage.textures)) };
  report.livePeak = await page.evaluate(() => window.__memoryBudget);
  report.geometry = await page.evaluate(() => window.__memoryGeometry);
  report.cameraAudit = await page.evaluate(() => window.__memoryCameraAudit);
  await page.evaluate(() => { window.__memoryStopCollision = true; });
  await page.waitForFunction(() => !window.__memoryCollision.pending);
  report.collisionAudit = await page.evaluate(() => window.__memoryCollision);
  report.audioAudit = await page.evaluate(() => window.__memoryAudioAudit);
  report.navigationAudit = await page.evaluate(() => window.__memoryNavigationAudit);
  assert.ok(report.geometry.movingCellsChecked > 0, 'actual home-transfer positions were included in water-safety checks');
  assert.deepEqual(report.geometry.errors, [], 'all six helpers stay on dry ground or physically placed bridge/bark surfaces');
  assert.deepEqual(report.cameraAudit.errors, [], 'camera focus and overview consistently guard world input and preserve action timing');
  assert.ok(report.cameraAudit.movingFrames > 0 && report.cameraAudit.overviewFrames > 0, 'camera travel and inspection both received live samples');
  assert.ok(report.collisionAudit.frames > 100 && report.collisionAudit.duringCameraTravel > 0, 'anatomical clearance is measured during motion and camera travel');
  assert.equal(report.collisionAudit.allIds.filter(id => id !== 'mosi').length, 6, 'all six real animated actors were audited');
  assert.deepEqual(report.collisionAudit.errors, [], 'clearance audit completes without missing data or geometry errors');
  assert.deepEqual(Object.values(report.collisionAudit.worst), [], 'anatomical envelopes do not overlap outside explicit task contacts');
  assert.equal(report.audioAudit.decoded, 15); assert.equal(report.audioAudit.musicSource, 'ElevenLabs'); assert.deepEqual(report.audioAudit.failed, []);
  for (const kind of ['call', 'leaf', 'match-chime', 'footstep', 'branch-lift', 'branch-lower', 'log-roll', 'bridge-land', 'staging-arrival', 'bark-pickup', 'bark-place', 'boardwalk-complete', 'berry-arrival', 'win']) assert.ok(report.audioAudit.kinds[kind] > 0, `${kind} is driven by a real recorded cue during the game`);
  assert.ok(report.audioAudit.maxActionVolume > .25 && report.audioAudit.maxIdleVolume > .3, 'music remains audible through actions and ordinary play');
  assert.ok(report.audioAudit.speechMusicFrames > 0 && report.audioAudit.maxSpeechTarget <= .151 && report.audioAudit.footPuffs > 0, 'narration consistently ducks music while actual footsteps generate dust');
  assert.ok(report.livePeak.drawCalls <= 100, `draw-call budget: ${report.livePeak.drawCalls} <=100`);
  assert.ok(report.livePeak.triangles <= 250000, `triangle budget: ${report.livePeak.triangles} <=250000`);
  assert.deepEqual(report.layoutErrors, [], 'all responsive touch controls fit without occlusion or overlap');
  assert.deepEqual(report.errors, [], 'no JavaScript, console or asset load failures');
  report.passed = true;
  console.log(JSON.stringify({ passed: true, checks: report.checks, captures: report.captures, output: out }, null, 2));
} catch (error) {
  failure = error; report.failure = { message: error.message, stack: error.stack };
  if (page) {
    await checkpoint('failure').catch(() => {});
    report.debug = await page.evaluate(() => ({ ready: window.__memoryReady, state: window.__memory?.state(), stats: window.__memory?.stats(), audio: window.__memory?.audio(), error: document.getElementById('error-copy')?.textContent })).catch(() => null);
    await capture('failure').catch(() => {});
  }
} finally {
  clearTimeout(watchdog); await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
}
if (failure) throw failure;
