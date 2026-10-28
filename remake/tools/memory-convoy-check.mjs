#!/usr/bin/env node
// Actual-world deterministic convoy review. The isolated server suppresses only
// rasterization between captures; all production world/rig/camera/nav updates run.
import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { handle } from './serve.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = process.env.MEMORY_CONVOY_BASELINE === '1';
const diagnosticOnly = process.env.MEMORY_CONVOY_SCOPE === 'traffic-diagnostic';
const partialBoard = process.env.MEMORY_CONVOY_SCOPE === 'partial';
const out = path.resolve(process.env.MEMORY_CHECK_OUT || `qa/memory/convoy/${baseline ? 'before-check' : 'check'}`);
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const report = { passed: false, baseline, diagnosticOnly, partialBoard, timestep: 1 / 30, anatomyInterval: 1 / 10, instrumentation: 'Only renderer.render is suppressed between captures; unmodified production simulation and actual loaded rigs, scenery, terrain, leaves, navigation, camera and surfaces.', errors: [], captures: [] };
const overrides = new Map();
report.sources = {};
// Freeze every memory runtime module for this run, including the rig, gait,
// scenery and FX. A report must identify the actual source that was loaded.
const modules = baseline ? ['world', 'bridge-adventure', 'world-home-nav']
  : (await readdir(path.join(root, 'remake/engine/memory'))).filter(name => name.endsWith('.js')).map(name => name.slice(0, -3)).sort();
for (const name of modules) {
  const file = baseline ? path.join(root, 'qa/memory/convoy/before', `${name}.js`) : path.join(root, 'remake/engine/memory', `${name}.js`);
  let source = await readFile(file, 'utf8');
  report.sources[name] = { file, sha256: createHash('sha256').update(source).digest('hex') };
  if (name === 'world') {
    const render = 'updateTargets(); renderer.info.reset(); renderer.render(scene, camera);';
    assert.ok(source.includes(render), 'known production drawing call for bounded instrumentation');
    source = source.replace(render, 'updateTargets(); renderer.info.reset(); if (globalThis.__convoyRender) renderer.render(scene, camera);');
  }
  overrides.set(`/remake/engine/memory/${name}.js`, source);
}
if (!baseline) {
  const file = path.join(root, 'remake/engine/footing.js'), source = await readFile(file, 'utf8');
  report.sources.footing = { file, sha256: createHash('sha256').update(source).digest('hex') };
  overrides.set('/remake/engine/footing.js', source);
}
const html = '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}canvas{display:block;width:100%;height:100%}</style><script type="importmap">{"imports":{"three":"/dist/vendor/three.module.js","three/addons/":"/dist/vendor/addons/"}}</script><canvas id="world"></canvas>';
let browser, page, server, failure;
await mkdir(out, { recursive: true });
const watchdog = setTimeout(() => { void browser?.close(); server?.close(); }, 1200000); watchdog.unref();
async function save() { await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
async function capture(name) {
  const state = await page.evaluate(() => { globalThis.__convoyRender = true; __convoy.world.update(0); const state = __convoy.world.getDebug({ collision: false }); globalThis.__convoyRender = false; return state; });
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  report.captures.push({ name, camera: state.camera, bridge: state.bridge, triangles: state.triangles, drawCalls: state.drawCalls });
  console.log(`Captured ${name}`);
}
async function stepUntil(condition, label, limit = 240) {
  let frames = 0;
  while (frames < limit * 30) {
    const result = await page.evaluate(({ condition, count }) => __convoy.batch(condition, count), { condition, count: 20 });
    frames += result.frames;
    await writeFile(path.join(out, 'checkpoint.json'), JSON.stringify({ label, frames, ...result }, null, 2));
    if (result.capture) { await capture(result.capture); await page.evaluate(() => { __convoy.pendingCapture = null; }); }
    if (result.failure) throw new Error(`${label}: ${result.failure}`);
    if (result.done) return result;
  }
  throw new Error(`${label}: exceeded ${limit} game seconds`);
}
async function discover() {
  for (const species of (partialBoard ? ['brontosaurus', 'triceratops'] : ['brontosaurus', 'triceratops', 'stegosaurus'])) {
    await page.evaluate(species => __convoy.discover(species), species);
    await stepUntil('homes', `settle ${species}`);
  }
  await stepUntil('camera', 'settle initial camera');
}
async function action(id, species) {
  if (species) await page.evaluate(species => __convoy.select(species), species);
  await stepUntil('camera', `${id} focus`);
  assert.equal(await page.evaluate(id => __convoy.start(id), id), true, `${id} starts`);
  await stepUntil('action', `${id} completes`);
  await stepUntil('camera', `${id} camera settles`);
  const state = await page.evaluate(() => __convoy.rules.getState());
  assert.ok(id === 'lift' ? state.branch === 'held' : id === 'lower' ? state.branch === 'down' : id === 'roll' ? state.bridgeBuilt : id === 'cross' ? state.atStaging : id === 'lay' ? state.boardwalkBuilt : state.visited, `${id} completed physically`);
  console.log(`Completed ${id}`);
  report.audit = await page.evaluate(() => __convoy.output()); await save();
}
try {
  server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const source = pathname === '/convoy.html' ? html : overrides.get(pathname);
    if (source !== undefined) { res.writeHead(200, { 'Content-Type': pathname.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(source); }
    else void handle(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined, args: ['--enable-unsafe-swiftshader'], env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== '__COMPAT_LAYER')) });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }); page.setDefaultTimeout(120000);
  page.on('pageerror', error => report.errors.push(error.stack || error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) report.errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(`http://127.0.0.1:${server.address().port}/convoy.html?qa&quality=tablet`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ baseline, diagnosticOnly }) => {
    const { createMemoryWorld } = await import('/remake/engine/memory/world.js');
    const { createBridgeAdventure: createRules } = await import('/remake/engine/memory/bridge-rules.js');
    const { createMemoryGame } = await import('/remake/engine/memory/rules.js');
    const { assessBridgeGeometry } = await import('/remake/tools/memory-geometry-check.mjs');
    const { assessSceneClearances } = await import('/remake/engine/memory/memory-clearance.js');
    globalThis.__convoyRender = false;
    const world = await createMemoryWorld({ canvas: document.getElementById('world') }), rules = createRules();
    let seed = 613; const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const cards = createMemoryGame({ random }).getState().cards;
    world.setBoard(cards); world.resize(1280, 800);
    const g = globalThis.__convoy = { world, rules, cards, time: 0, frame: 0, activeRun: null, runs: [], phases: {}, worst: {}, surfaceErrors: {}, crossed: {}, auditFrames: 0, surfaceFrames: 0, pendingCapture: null, captured: new Set(), pauseChecks: [], events: [], failure: null, previous: new Map(), lastPhase: null, lastRecord: null, updateCpu: { maxMs: 0, totalMs: 0, samples: 0, peakPhase: null, phases: {} }, cpuSamples: [] };
    const sync = () => world.setBridgeState(rules.getState());
    function record(s, delta) {
      const a = s.bridge.action, label = a ? `${a.id}/${a.phase}` : s.bridge.stage;
      const actors = Object.entries(s.bridge.pairs).flatMap(([species, pair]) => pair.actors.map((actor, i) => ({ ...actor, id: `${species}-${i}` })));
      let moving = 0; const movingIds = [];
      for (const actor of actors) { const before = g.previous.get(actor.id); if (before && Math.hypot(actor.position[0] - before[0], actor.position[2] - before[2]) > .002) { moving++; movingIds.push(actor.id); } g.previous.set(actor.id, [...actor.position]); }
      const phase = g.phases[label] ??= { frames: 0, gameSeconds: 0, maxMoving: 0 };
      phase.frames++; phase.gameSeconds += delta; phase.maxMoving = Math.max(phase.maxMoving, moving);
      if (g.activeRun) {
        const run = g.activeRun; run.maxMoving = Math.max(run.maxMoving, moving); run.frames++;
        run.lastElapsed = a?.elapsed ?? run.lastElapsed;
        if (a && ['approach', 'return', 'cross', 'finish', 'collect'].includes(a.phase)) for (const route of s.bridge.routes) {
          const id = `${route.species}-${route.member % 2}`, key = `${a.phase}:${id}`, r = run.routes[key] ??= { phase: a.phase, id, duration: route.duration, start: null, finish: null, arrived: false };
          r.duration = route.duration; r.end = route.points.at(-1);
          if (route.started && r.start === null) r.start = g.time - run.start;
          if (route.finished && r.finish === null) r.finish = g.time - run.start;
        }
        for (const route of Object.values(run.routes)) {
          const actor = actors.find(actor => actor.id === route.id);
          if (route.start !== null && actor && Math.hypot(actor.position[0] - route.end[0], actor.position[2] - route.end[2]) < .02) { route.arrived = true; if (route.finish === null) route.finish = g.time - run.start; }
        }
        const captureKey = `${label}/${moving}-moving`;
        if (!baseline && moving >= 2 && ['approach', 'return', 'cross', 'finish'].includes(a?.phase) && !g.captured.has(captureKey)) {
          g.captured.add(captureKey); g.pendingCapture = captureKey.replaceAll('/', '-');
          const before = JSON.stringify({ action: s.bridge.action, poses: actors.map(({ id, position }) => ({ id, position })) });
          for (let i = 0; i < 5; i++) world.update(0, g.time);
          const paused = world.getDebug({ collision: false }), pa = Object.entries(paused.bridge.pairs).flatMap(([species, pair]) => pair.actors.map((actor, i) => ({ id: `${species}-${i}`, position: actor.position })));
          const after = JSON.stringify({ action: paused.bridge.action, poses: pa });
          g.pauseChecks.push({ phase: label, movingIds, holds: before === after });
          if (before !== after) g.failure = `pause changed active convoy ${label}`;
        }
      }
      const geo = assessBridgeGeometry(s.bridge, { requireMarsh: true }); g.surfaceFrames++;
      for (const error of geo.errors) g.surfaceErrors[`${label}:${error}`] = { label, error, frame: g.frame, violations: geo.violations };
      for (const actor of geo.actors) {
        if (actor.water) (g.crossed[actor.id] ??= { river: 0, marsh: 0 }).river++;
        if (actor.marsh) (g.crossed[actor.id] ??= { river: 0, marsh: 0 }).marsh++;
      }
      // Every third 30Hz tick (100ms), including merge and parking turns.
      if (!baseline && !diagnosticOnly && g.frame % 3 === 0 && a && ['approach', 'return', 'cross', 'finish', 'collect'].includes(a.phase)) {
        const precise = world.getDebug({ collision: true }), result = assessSceneClearances(precise); g.auditFrames++;
        for (const hit of result.violations) {
          const key = `${label}:${hit.a}:${hit.b}:${hit.kindA}:${hit.kindB}`;
          if (!g.worst[key] || hit.clearance < g.worst[key].clearance) g.worst[key] = { ...hit, phase: label, frame: g.frame, gameTime: g.time, action: a, actors: precise.collisionActors, bridge: precise.bridge };
        }
      }
      g.lastRecord = { phase: label, moving, movingIds, gameTime: g.time };
    }
    g.tick = (delta = 1 / 30) => {
      g.time += delta; g.frame++; const cpuStart = performance.now(); world.update(delta, g.time);
      const cpuMs = performance.now() - cpuStart; g.updateCpu.samples++; g.updateCpu.totalMs += cpuMs;
      if (cpuMs > g.updateCpu.maxMs) { g.updateCpu.maxMs = cpuMs; g.updateCpu.peakPhase = g.lastRecord?.phase; }
      g.cpuSamples.push(cpuMs); const cpuPhase = g.updateCpu.phases[g.lastRecord?.phase ?? 'initial'] ??= { maxMs: 0, totalMs: 0, samples: 0 };
      cpuPhase.maxMs = Math.max(cpuPhase.maxMs, cpuMs); cpuPhase.totalMs += cpuMs; cpuPhase.samples++;
      const stats = world.getDebug({ collision: false }); record(stats, delta);
      for (const event of world.pollBridgeEvents()) {
        if (event.type === 'bridge-complete') {
          rules.complete(event.id); sync();
          if (g.activeRun) { g.activeRun.end = g.time; g.activeRun.gameSeconds = g.time - g.activeRun.start; g.activeRun.traffic = stats.bridge.traffic; g.runs.push(g.activeRun); g.activeRun = null; }
        } else if (event.type === 'bridge-blocked') { rules.cancel(event.id, { branch: event.branch }); sync(); g.failure = `${event.id} blocked: ${event.reason}`; }
        if (event.type !== 'footstep') g.events.push({ ...event, time: g.time });
      }
      return stats;
    };
    g.batch = (condition, count) => {
      let frames = 0, done = false;
      for (; frames < count; frames++) {
        const s = g.tick();
        done = condition === 'camera' ? s.camera.settled && !s.camera.moving : condition === 'homes' ? s.cells.every(c => !c.moving) : condition === 'action' ? rules.getState().active === null : condition === 'concurrent' ? g.lastRecord.moving >= 2 : false;
        if (done || g.failure || g.pendingCapture) { frames++; break; }
      }
      const state = world.getDebug({ collision: false });
      return { frames, done, failure: g.failure, capture: g.pendingCapture, last: g.lastRecord, action: state.bridge.action, routes: state.bridge.routes, traffic: state.bridge.traffic };
    };
    g.discover = species => { const ids = cards.filter(c => c.species === species).map(c => c.id); ids.forEach(id => world.reveal(id)); for (let i = 0; i < 16; i++) g.tick(); world.match(ids, rules.getState().unlocked.length, species); rules.unlock(species); sync(); };
    g.select = species => { if (rules.getState().selected) rules.select(null); rules.select(species); sync(); };
    g.start = id => { const accepted = world.startBridgeTask(id); if (!accepted) return false; if (!rules.choose(id)) throw new Error('world/controller start mismatch'); sync(); g.activeRun = { id, start: g.time, routes: {}, maxMoving: 0, frames: 0 }; return true; };
    g.restart = () => { rules.restart(); world.setBoard(cards); sync(); g.activeRun = null; g.failure = null; g.previous.clear(); };
    g.output = () => { const samples = [...g.cpuSamples].sort((a, b) => a - b), state = world.getDebug({ collision: false }); return { frames: g.frame, gameSeconds: g.time, runs: g.runs, phases: g.phases, auditFrames: g.auditFrames, surfaceFrames: g.surfaceFrames, surfaceErrors: Object.values(g.surfaceErrors), violations: Object.values(g.worst), crossed: g.crossed, pauseChecks: g.pauseChecks, events: g.events, navigation: state.homeNavigation, traffic: state.bridge.traffic, updateCpu: { ...g.updateCpu, p50Ms: samples[Math.floor(samples.length * .5)], p95Ms: samples[Math.floor(samples.length * .95)], p99Ms: samples[Math.floor(samples.length * .99)] }, last: g.lastRecord }; };
  }, { baseline, diagnosticOnly });
  await discover();
  await action('lift', 'brontosaurus');
  if (!partialBoard) { await action('lower', 'brontosaurus'); await action('lift', 'brontosaurus'); }
  await action('roll', 'triceratops');
  if (!partialBoard) { await action('cross'); await action('lay', 'stegosaurus'); await action('finish'); }
  await capture(partialBoard ? 'partial-board-bridge-built' : 'final-grove');
  if (partialBoard) {
    report.remainingCovers = await page.evaluate(() => __convoy.world.getDebug({ collision: false }).cells.filter(cell => !cell.moved));
    assert.ok(report.remainingCovers.length === 2 && report.remainingCovers.every(cell => cell.status === 'hidden' && !cell.actorVisible), 'both Stegosaurus leaves remain closed');
  }
  report.audit = await page.evaluate(() => __convoy.output());
  report.renderBudget = {
    triangles: Math.max(...report.captures.map(capture => capture.triangles)),
    drawCalls: Math.max(...report.captures.map(capture => capture.drawCalls)),
    limit: { triangles: 250000, drawCalls: 100 },
  };
  assert.deepEqual(report.errors, [], 'no browser/resource errors');
  assert.deepEqual(report.audit.surfaceErrors, [], 'all actual roots and feet have supporting surfaces');
  if (!baseline && !diagnosticOnly) {
    assert.ok(report.renderBudget.triangles <= 250000, `tablet triangle budget: ${report.renderBudget.triangles} <=250000`);
    assert.ok(report.renderBudget.drawCalls <= 100, `tablet draw-call budget: ${report.renderBudget.drawCalls} <=100`);
    assert.deepEqual(report.audit.violations, [], 'no forbidden anatomical intersections during convoy travel');
    for (const run of report.audit.runs) for (const route of Object.values(run.routes)) assert.ok(route.start !== null && route.arrived, `${run.id}/${route.phase}/${route.id} started and physically arrived`);
    for (const id of (partialBoard ? [] : ['cross', 'finish'])) {
      const run = report.audit.runs.find(run => run.id === id); assert.ok(run.maxMoving >= 2, `${id} has concurrent physical motion`);
      const routes = Object.values(run.routes).filter(r => r.phase === id).sort((a, b) => a.start - b.start);
      assert.ok(routes.length === 6 && routes[1].start < routes[0].finish, `${id} second route starts before first arrives`);
    }
    assert.ok(report.audit.pauseChecks.length >= 2 && report.audit.pauseChecks.every(p => p.holds), 'pause holds multiple active routes');
    assert.ok(report.audit.auditFrames > 100, 'actual articulated envelopes audited through motion');
  }
  report.passed = true;
} catch (error) {
  failure = error; report.failure = { message: error.message, stack: error.stack };
  if (page) { report.audit = await page.evaluate(() => globalThis.__convoy?.output()).catch(() => null); await capture('failure').catch(() => {}); }
} finally {
  clearTimeout(watchdog); await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); await save();
}
console.log(JSON.stringify({ passed: report.passed, baseline, out, failure: report.failure?.message, runs: report.audit?.runs.map(({ id, gameSeconds, maxMoving }) => ({ id, gameSeconds, maxMoving })), violations: report.audit?.violations.length, surfaces: report.audit?.surfaceErrors.length }, null, 2));
if (failure) process.exitCode = 1;
