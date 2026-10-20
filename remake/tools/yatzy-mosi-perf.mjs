#!/usr/bin/env node
// Real Edge/ANGLE performance capture. Start only after the shared browser slot is free.
// PLAYWRIGHT_PATH=<absolute playwright directory> node remake/tools/yatzy-mosi-perf.mjs
// YATZY_URL and YATZY_PERF_OUT optionally override the preview and JSON output paths.
// YATZY_PERF_PROFILE=1 captures floating-cup/result idle CPU evidence instead of the four-cycle benchmark.
// No software-renderer flags, accelerated game clock, production changes, or forced quality.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.YATZY_PERF_OUT || path.join(root, 'qa/yatzy-mosi/performance.json');
const url = process.env.YATZY_URL || 'http://127.0.0.1:4197/remake/yatzy-mosi.html?qa';
const viewport = { width: 1440, height: 1000 };
const profiling = process.env.YATZY_PERF_PROFILE === '1';
const errors = [], warnings = [];
const report = {
  startedAt: new Date().toISOString(), url, viewport, deviceScaleFactor: 1, profiling,
  method: profiling
    ? 'Diagnostic run: 5s floating-cup idle, one warm throw, 6s warm result idle, and 8s result idle with CDP CPU sampling, per-stage CPU timers, and browser long tasks/layout counters. No four-cycle benchmark is performed while profiling.'
    : 'Unmodified real game clock; one complete warm throw, 6s warm result-view idle, 8s measured result-view idle, four UI-triggered throws from validated rolled QA states. Each cycle returns across the table, rolls, establishes the overhead angle, and completes its adaptive close dolly. RAF intervals are end-to-end display cadence, not GPU-only timings.',
  launch: { channel: 'msedge', headless: true, ignoreDefaultArgs: ['--enable-unsafe-swiftshader'], args: ['--disable-software-rasterizer'] },
  checks: [], cycles: [], errors, warnings, completed: false,
};
let browser, failure;

function summary(values) {
  if (!values.length) return { count: 0, medianMs: null, p95Ms: null, maxMs: null };
  const sorted = [...values].sort((a, b) => a - b), round = value => +value.toFixed(3);
  const percentile = fraction => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { count: values.length, medianMs: round(percentile(.5)), p95Ms: round(percentile(.95)), maxMs: round(sorted.at(-1)), meanMs: round(mean), meanFps: round(1000 / mean), over25Ms: values.filter(value => value > 25).length, over50Ms: values.filter(value => value > 50).length };
}

try {
  assert.equal(process.platform, 'win32', 'This hardware baseline requires installed Windows Edge.');
  assert.ok(new URL(url).searchParams.has('qa'), 'The performance page must explicitly opt in to QA.');
  browser = await chromium.launch(report.launch);
  report.browserVersion = browser.version();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
  page.setDefaultTimeout(45000);
  page.on('pageerror', error => errors.push({ type: 'javascript', message: error.message }));
  page.on('console', message => {
    if (message.type() === 'error') errors.push({ type: 'console', message: message.text() });
    else if (message.type() === 'warning' && /webgl|shader|context/i.test(message.text())) warnings.push(message.text());
  });
  page.on('response', response => { if (response.status() >= 400) errors.push({ type: 'http', status: response.status(), url: response.url() }); });
  page.on('requestfailed', request => { if (!/ERR_ABORTED/.test(request.failure()?.errorText || '')) errors.push({ type: 'network', url: request.url(), message: request.failure()?.errorText }); });
  const browserSession = await browser.newBrowserCDPSession();
  try { report.systemGpu = (await browserSession.send('SystemInfo.getInfo')).gpu; }
  catch (error) { warnings.push(`CDP GPU metadata unavailable: ${error.message}`); }
  await browserSession.detach();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  await page.waitForFunction(() => window.__yatzyQA || !document.getElementById('error').hidden, undefined, { timeout: 90000 });
  assert.ok(await page.evaluate(() => Boolean(window.__yatzyQA)), 'game initializes');
  report.graphics = await page.evaluate(() => {
    const renderer = window.__yatzyQA.world.renderer, gl = renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
    const canvas = renderer.domElement;
    return {
      renderer: gl.getParameter(extension?.UNMASKED_RENDERER_WEBGL || gl.RENDERER),
      vendor: gl.getParameter(extension?.UNMASKED_VENDOR_WEBGL || gl.VENDOR), version: gl.getParameter(gl.VERSION),
      drawingBuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
      canvas: { width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight },
      contextAttributes: gl.getContextAttributes(), quality: window.__yatzyQA.world.q.name,
    };
  });
  assert.doesNotMatch(report.graphics.renderer, /swiftshader|llvmpipe|softpipe|software|basic render/i, 'Hardware timing cannot be reported from a software GL renderer.');
  assert.match(report.graphics.renderer, /intel|nvidia|amd|radeon|iris|geforce|arc\b/i, 'Identify the actual hardware GPU before accepting the baseline.');
  report.checks.push('Actual game WebGL context identifies a hardware GPU.');

  // Browser-only observer. It reads public QA state and renderer counters without
  // wrapping render(), creating another GL context, or changing production modules.
  await page.evaluate(async profiling => {
    const rules = await import('./engine/yatzy-mosi/rules.js');
    const qa = window.__yatzyQA;
    const stageNames = ['dice', 'opponent', 'effects', 'worldUpdate', 'forestUpdate', 'render'];
    const stages = new Float64Array(stageNames.length), longTasks = [];
    if (profiling) {
      for (const [object, method, index] of [[qa.dice, 'update', 0], [qa.opponent, 'update', 1], [qa.effects, 'update', 2], [qa.world, 'update', 3], [qa.world.forest, 'update', 4], [qa.world, 'render', 5]]) {
        const original = object[method];
        object[method] = function (a, b, c) { const start = performance.now(); try { return original.call(this, a, b, c); } finally { stages[index] += performance.now() - start; } };
      }
      new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push({ start: entry.startTime, duration: entry.duration, name: entry.name }); }).observe({ type: 'longtask', buffered: true });
    }
    function resources() {
      const render = qa.world.renderer, canvas = render.domElement, sceneGeometries = new Set(), sceneObjectIds = []; let objects = 0;
      qa.world.scene.traverse(object => { objects++; sceneObjectIds.push(object.uuid); if (object.geometry) sceneGeometries.add(object.geometry.uuid); });
      return { ...qa.world.getStats(), programs: render.info.programs.length, objects, renderFrame: render.info.render.frame,
        sceneGeometryIds: [...sceneGeometries].sort(),
        sceneObjectIds: sceneObjectIds.sort(),
        canvas: { width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight },
        effects: qa.effects.getStats(), audio: qa.audio.getStats(), view: qa.world.getViewState(), cameraPosition: qa.world.camera.position.toArray() };
    }
    function capture({ mode, durationMs = 8000 }) {
      const intervals = [], rollIntervals = [], resultCameraIntervals = [], closeZoomIntervals = [], returnCameraIntervals = [], started = performance.now(), deadline = started + 45000;
      let previous = null, previousRolling = false, rollingSeen = false, begin = null, previousCaptured = false, previousResultCamera = false, previousCloseZoom = false, previousReturnCamera = false;
      let maxCalls = 0, maxTriangles = 0, maxParticles = 0, maxWaves = 0, maxVoices = 0, maxGeometries = 0, maxTextures = 0;
      const before = resources();
      const cpuFrames = []; stages.fill(0);
      return new Promise((resolve, reject) => {
        function frame(now) {
          const status = qa.getStatus(), rolling = status.phase === 'rolling', view = qa.world.getViewState();
          if (document.hidden || status.paused) { reject(new Error('Performance capture was paused/backgrounded.')); return; }
          if (now > deadline) { reject(new Error('Performance capture exceeded its deadline.')); return; }
          rollingSeen ||= rolling;
          const captured = mode === 'idle' || rollingSeen;
          if (captured) {
            if (begin === null) begin = now;
            if (previous !== null && previousCaptured) {
              const delta = now - previous;
              intervals.push(delta);
              if (profiling) cpuFrames.push({ at: now - begin, delta, stages: Array.from(stages) });
              if (previousRolling) rollIntervals.push(delta);
              if (previousResultCamera) resultCameraIntervals.push(delta);
              if (previousCloseZoom) closeZoomIntervals.push(delta);
              if (previousReturnCamera) returnCameraIntervals.push(delta);
            }
            const render = qa.world.renderer.info;
            maxCalls = Math.max(maxCalls, render.render.calls); maxTriangles = Math.max(maxTriangles, render.render.triangles);
            maxGeometries = Math.max(maxGeometries, render.memory.geometries); maxTextures = Math.max(maxTextures, render.memory.textures);
            const fx = qa.effects.getStats();
            maxParticles = Math.max(maxParticles, fx.active); maxWaves = Math.max(maxWaves, fx.waves || 0); maxVoices = Math.max(maxVoices, qa.audio.getStats().voices);
          }
          stages.fill(0);
          if (mode === 'roll' ? rollingSeen && !rolling && view.mode === 'dice' && view.blend === 1 && view.zoom === 1 && !view.transitioning : begin !== null && now - begin >= durationMs) {
            resolve({ intervals, rollIntervals, resultCameraIntervals, closeZoomIntervals, returnCameraIntervals, elapsedMs: now - begin, before, after: resources(), maxCalls, maxTriangles, maxParticles, maxWaves, maxVoices, maxGeometries, maxTextures,
              ...(profiling ? { stageNames, cpuFrames, longTasks: longTasks.filter(task => task.start >= begin && task.start <= now) } : {}) }); return;
          }
          previous = now; previousRolling = rolling; previousCaptured = captured;
          previousResultCamera = captured && view.mode === 'dice' && view.transitioning;
          previousCloseZoom = previousResultCamera && view.blend === 1 && view.zoom < 1;
          previousReturnCamera = captured && view.mode === 'table' && view.transitioning;
          requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });
    }
    window.__yatzyPerf = { resources, capture, reset(seed, rolled = false) { const fresh = rules.createGame({ seed }), state = rolled ? rules.roll(fresh) : fresh; rules.validateGame(state); qa.setState(state); } };
  }, profiling);
  const resources = () => page.evaluate(() => window.__yatzyPerf.resources());
  const settled = () => page.waitForFunction(() => {
    const qa = window.__yatzyQA;
    const view = qa.world.getViewState(), fx = qa.effects.getStats();
    return qa.getStatus().phase === 'human' && !qa.getStatus().paused && view.mode === 'dice' && view.blend === 1 && view.zoom === 1 && !view.transitioning && !fx.active && !fx.waves && qa.audio.getStats().voices === 0;
  });
  const performRoll = async () => {
    const before = await page.evaluate(() => window.__yatzyQA.getState());
    await page.evaluate(() => { window.__yatzyPerf.pending = window.__yatzyPerf.capture({ mode: 'roll' }); });
    await page.locator('#roll').click();
    const capture = await page.evaluate(() => window.__yatzyPerf.pending);
    assert.ok(capture.rollIntervals.length > 30, 'Measured a complete animated throw.');
    assert.ok(capture.resultCameraIntervals.length > 10, 'Measured the actual travel to the result view.');
    assert.ok(capture.closeZoomIntervals.length > 5, 'Measured the additional close dolly after the overhead angle is established.');
    const stateAndFaces = await page.evaluate(() => ({ state: window.__yatzyQA.getState(), faces: window.__yatzyQA.dice.getDebugState().up }));
    assert.equal(stateAndFaces.state.rollCount, before.rollCount + 1); assert.deepEqual(stateAndFaces.faces, stateAndFaces.state.dice);
    return { ...capture, frameTimes: summary(capture.rollIntervals), resultCameraFrameTimes: summary(capture.resultCameraIntervals), closeZoomFrameTimes: summary(capture.closeZoomIntervals), returnCameraFrameTimes: summary(capture.returnCameraIntervals), wholeCycleFrameTimes: summary(capture.intervals), dice: stateAndFaces.faces };
  };

  await page.locator('#start').click();
  await page.evaluate(() => window.__yatzyPerf.reset(0x50301));
  if (profiling) {
    await page.waitForTimeout(3000);
    report.readyCupIdle = await page.evaluate(() => window.__yatzyPerf.capture({ mode: 'idle', durationMs: 5000 }));
    report.readyCupIdle.frameTimes = summary(report.readyCupIdle.intervals);
  }
  report.warmThrow = await performRoll();
  await settled(); await page.waitForTimeout(6000);
  report.baseline = await resources();
  let profiler, metricsBefore;
  if (profiling) {
    profiler = await page.context().newCDPSession(page);
    await profiler.send('Performance.enable'); await profiler.send('Profiler.enable');
    metricsBefore = (await profiler.send('Performance.getMetrics')).metrics;
    await profiler.send('Profiler.setSamplingInterval', { interval: 1000 }); await profiler.send('Profiler.start');
  }
  report.idle = await page.evaluate(() => window.__yatzyPerf.capture({ mode: 'idle', durationMs: 8000 }));
  if (profiler) {
    const { profile } = await profiler.send('Profiler.stop');
    const metricsAfter = (await profiler.send('Performance.getMetrics')).metrics;
    report.idle.browserMetrics = Object.fromEntries(metricsAfter.filter(metric => /Duration|Count|JSHeapUsedSize/.test(metric.name)).map(metric => [metric.name, metric.value - (metricsBefore.find(before => before.name === metric.name)?.value || 0)]));
    const totals = new Map();
    for (let i = 0; i < profile.samples.length; i++) totals.set(profile.samples[i], (totals.get(profile.samples[i]) || 0) + profile.timeDeltas[i] / 1000);
    report.idle.cpuProfileTop = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([id, milliseconds]) => ({ milliseconds, ...profile.nodes.find(node => node.id === id).callFrame }));
    const file = output.replace(/\.json$/i, '-idle.cpuprofile');
    await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, JSON.stringify(profile)); report.cpuProfile = file;
    await profiler.detach();
  }
  report.idle.frameTimes = summary(report.idle.intervals);
  assert.ok(report.idle.intervals.length > 100, 'Steady idle includes enough measured display frames.');

  await page.locator('#pause').click();
  await page.waitForFunction(() => window.__yatzyQA.getStatus().paused);
  await page.waitForTimeout(100);
  const pausedBefore = await page.evaluate(() => ({ frame: window.__yatzyQA.world.renderer.info.render.frame, snapshot: window.__yatzyQA.getSnapshot() }));
  await page.waitForTimeout(650);
  const pausedAfter = await page.evaluate(() => ({ frame: window.__yatzyQA.world.renderer.info.render.frame, snapshot: window.__yatzyQA.getSnapshot() }));
  assert.equal(pausedAfter.frame, pausedBefore.frame, 'Pause must submit no new render frames.');
  for (const field of ['dice', 'opponent', 'effects', 'view']) assert.deepEqual(pausedAfter.snapshot[field], pausedBefore.snapshot[field], `Pause freezes ${field}.`);
  report.pause = { durationMs: 650, renderFramesSubmitted: pausedAfter.frame - pausedBefore.frame, posesFrozen: true };
  report.checks.push('Actual pause dialog stops rendering and freezes dice, Mosi, and particles.');
  await page.locator('#pause-dialog [data-close]').click();
  await page.waitForFunction(() => !window.__yatzyQA.getStatus().paused);

  for (let index = 0; index < (profiling ? 0 : 4); index++) {
    await page.evaluate(seed => window.__yatzyPerf.reset(seed, true), 0x50311 + index);
    const cycle = await performRoll();
    await settled(); await page.waitForTimeout(250);
    cycle.settled = await resources();
    for (const name of ['textures', 'programs', 'objects']) assert.equal(cycle.settled[name], report.baseline[name], `Cycle ${index + 1} does not grow ${name}.`);
    assert.deepEqual(cycle.settled.sceneGeometryIds, report.baseline.sceneGeometryIds, 'Adaptive framing reuses the same scene-owned geometry identities.');
    assert.deepEqual(cycle.settled.sceneObjectIds, report.baseline.sceneObjectIds, 'Throws and camera travel reuse the same scene objects.');
    assert.equal(cycle.settled.view.mode, 'dice'); assert.equal(cycle.settled.view.blend, 1); assert.equal(cycle.settled.view.zoom, 1);
    assert.equal(cycle.settled.view.transitioning, false); assert.equal(cycle.settled.view.reframing, false);
    assert.deepEqual(cycle.settled.canvas, report.baseline.canvas, 'Compare stable resources at the same canvas resolution.');
    assert.ok(cycle.settled.cameraPosition.every(Number.isFinite), 'Adaptive framing has a finite settled endpoint; random layouts may change it.');
    assert.ok(cycle.returnCameraIntervals.length > 10, 'Reroll travels back across the table before its result view.');
    assert.equal(cycle.settled.effects.active, 0); assert.equal(cycle.settled.audio.voices, 0);
    assert.equal(cycle.settled.effects.waves, 0);
    assert.ok(cycle.maxParticles <= cycle.settled.effects.capacity); assert.ok(cycle.maxWaves <= cycle.settled.effects.waveCapacity); assert.ok(cycle.maxVoices <= 28);
    report.cycles.push(cycle);
  }
  report.roll = summary(report.cycles.flatMap(cycle => cycle.rollIntervals));
  report.resultCamera = summary(report.cycles.flatMap(cycle => cycle.resultCameraIntervals));
  report.closeZoom = summary(report.cycles.flatMap(cycle => cycle.closeZoomIntervals));
  report.returnCamera = summary(report.cycles.flatMap(cycle => cycle.returnCameraIntervals));
  report.final = await resources();
  if (!profiling) {
    const last = report.cycles.at(-1), previous = report.cycles.at(-2);
    assert.equal(last.settled.geometries, previous.settled.geometries, 'GPU geometry uploads plateau after previously culled meshes first enter the adaptive framing.');
    assert.equal(last.maxGeometries, previous.maxGeometries, 'The same plateau holds during throws and both camera stages.');
    report.geometryUploads = { before: report.baseline.geometries, afterCycles: report.cycles.map(cycle => cycle.settled.geometries), sceneGeometryCount: report.baseline.sceneGeometryIds.length, identitiesStable: true, plateau: true };
    report.checks.push('Four real throws agree with logical dice and reuse identical scene-owned geometry; first-visible GPU uploads plateau, texture/shader/object counts remain constant, and both VFX pools and audio voices drain between throws.');
  }
  // Screenshot/DOM checks intentionally happen after all timing samples.
  const labels = () => page.evaluate(() => {
    const state = window.__yatzyQA.getState(), scene = document.querySelector('.scene').getBoundingClientRect();
    return { dice: state.dice, held: state.held, targets: [...document.querySelectorAll('.die-target')].map(button => {
      const rect = button.getBoundingClientRect(), center = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return { index: Number(button.dataset.index), value: Number(button.dataset.value), badge: getComputedStyle(button, '::before').content,
        hidden: button.hidden, held: button.classList.contains('held'), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        withinScene: rect.left >= scene.left && rect.right <= scene.right && rect.top >= scene.top && rect.bottom <= scene.bottom,
        receivesPointer: button === center || button.contains(center) };
    }) };
  });
  const checkLabels = result => {
    assert.equal(result.targets.length, 5);
    assert.deepEqual(result.targets.map(target => target.value), result.dice);
    assert.ok(result.targets.every(target => !target.hidden && target.value >= 1 && target.value <= 6 && target.badge === `"${target.value}"`), 'Five rendered result badges match legal logical dice.');
  };
  await mkdir(path.dirname(output), { recursive: true });
  report.desktopLabels = await labels(); checkLabels(report.desktopLabels);
  report.captures = [path.join(path.dirname(output), 'perf-rolled.png')];
  await page.screenshot({ path: report.captures[0] });
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(700);
  report.mobileBeforeHold = await labels(); checkLabels(report.mobileBeforeHold);
  await page.keyboard.press('1');
  await page.waitForFunction(() => !window.__yatzyQA.world.getViewState().transitioning);
  await page.waitForTimeout(100);
  report.mobileHeld = await labels(); checkLabels(report.mobileHeld);
  assert.equal(report.mobileHeld.held[0], true); assert.equal(report.mobileHeld.targets[0].held, true);
  if (!report.mobileHeld.targets.every(target => target.withinScene && target.receivesPointer)) warnings.push('One or more narrow-layout targets are clipped or occluded; inspect mobileHeld in this report.');
  report.captures.push(path.join(path.dirname(output), 'perf-mobile-held.png'));
  await page.screenshot({ path: report.captures[1] });
  report.checks.push('Settled desktop/mobile result badges match all five legal dice; mobile hold updates its marker.');
  assert.deepEqual(errors, [], 'No JavaScript, HTTP, or WebGL errors.');
  report.completed = true;
} catch (error) {
  failure = error; report.failure = { message: error.message, stack: error.stack };
} finally {
  if (browser) { await browser.close(); report.browserClosed = true; }
  report.finishedAt = new Date().toISOString();
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ completed: report.completed, browserClosed: report.browserClosed, graphics: report.graphics, idle: report.idle?.frameTimes, roll: report.roll, resultCamera: report.resultCamera, closeZoom: report.closeZoom, returnCamera: report.returnCamera, pause: report.pause, geometryUploads: report.geometryUploads, baseline: { ...report.baseline, sceneGeometryIds: undefined, sceneObjectIds: undefined }, final: { ...report.final, sceneGeometryIds: undefined, sceneObjectIds: undefined }, errors, output, failure: report.failure?.message }, null, 2));
}
if (failure) throw failure;
