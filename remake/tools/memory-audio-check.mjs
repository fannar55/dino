#!/usr/bin/env node
// Real browser decoding/playback lifecycle probe. Does not claim subjective listening QA.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { handle } from './serve.mjs';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = path.join(root, 'qa/memory/soundscape-generation/browser');
const report = { passed: false, errors: [] };
let server, browser, page, failure;
const stats = () => page.evaluate(() => window.__memory.audio());
try {
  await mkdir(out, { recursive: true });
  server = http.createServer(handle); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, channel: process.platform === 'win32' ? 'msedge' : undefined, args: ['--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) report.errors.push(`${response.status()} ${response.url()}`); });
  await page.addInitScript(() => {
    localStorage.setItem('mosi.memory.muted.v1', 'false');
    const NativeAudio = window.Audio; window.__qaAudio = [];
    window.Audio = function (...args) { const element = new NativeAudio(...args); window.__qaAudio.push(element); return element; };
    window.Audio.prototype = NativeAudio.prototype;
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/remake/minnisspil.html?qa&seed=613`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__memoryReady, undefined, { timeout: 90000 });
  report.beforeGesture = await stats();
  assert.equal(report.beforeGesture.state, 'uninitialized'); assert.equal(report.beforeGesture.music.playing, false);
  assert.equal(report.beforeGesture.recordedFetched, 15); assert.equal(report.beforeGesture.music.source, 'ElevenLabs');
  await page.locator('#start').click();
  await page.waitForFunction(() => { const a = window.__memory.audio(); return a.recordedLoaded === 15 && a.music.playing && a.music.position > .3 && a.speech.playing; });
  report.welcome = await stats();
  assert.deepEqual(report.welcome.recordedFailed, []); assert.equal(report.welcome.riverSource, 'recorded');
  assert.ok(report.welcome.music.target <= .151, 'narration ducks music');
  await page.evaluate(() => { window.__qaVoice = window.__qaAudio.find(element => !element.loop && !element.paused); });
  const voiceTime = () => page.evaluate(() => window.__qaVoice?.currentTime);
  const beforeVoice = await voiceTime(); await page.waitForTimeout(500);
  assert.equal((await stats()).speech.current, 'welcome', 'closing the welcome dialog does not stop its new narration');
  assert.ok(await voiceTime() > beforeVoice + .1, 'actual welcome playhead keeps advancing');
  await page.locator('#pause').click();
  const pausedVoice = await voiceTime(); assert.equal((await stats()).speech.current, 'welcome', 'pause retains the active line');
  await page.waitForTimeout(300); const heldVoice = await voiceTime();
  assert.ok(Math.abs(heldVoice - pausedVoice) < .015, 'pause freezes the actual speech media clock');
  await page.locator('#pause-dialog [data-resume]').click();
  await page.waitForFunction(before => window.__qaVoice.currentTime > before + .1, pausedVoice);
  report.welcomePause = { before: beforeVoice, paused: pausedVoice, held: heldVoice, resumed: await voiceTime() };
  assert.equal((await stats()).speech.current, 'welcome', 'resume continues the same narration');
  const first = await page.evaluate(() => window.__memory.state().cards[0].id);
  await page.locator(`[data-target="leaf-${first}"]`).click();
  await page.waitForFunction(() => window.__memory.audio().log.some(e => e.kind === 'call' && e.source === 'recorded'));
  report.reveal = await stats();
  assert.equal(report.reveal.speech.playing, false, 'identifying creature call has its own space');
  const beforeMusic = report.reveal.music.position; await page.waitForTimeout(500);
  assert.ok((await stats()).music.position > beforeMusic, 'actual media playback clock advances');
  await page.locator('#sound').click(); report.muted = await stats();
  assert.equal(report.muted.muted, true); assert.equal(report.muted.voices, 0); assert.equal(report.muted.riverPlaying, false);
  assert.equal(report.muted.music.playing, false); assert.equal(report.muted.speech.playing, false);
  await page.waitForTimeout(250); assert.equal((await stats()).music.position, report.muted.music.position);
  await page.locator('#sound').click(); await page.waitForFunction(() => window.__memory.audio().music.playing);
  await page.locator('#pause').click(); report.paused = await stats();
  assert.equal(report.paused.music.playing, false); assert.equal(report.paused.riverPlaying, false);
  await page.waitForTimeout(250); assert.equal((await stats()).music.position, report.paused.music.position);
  await page.locator('#pause-dialog [data-resume]').click(); await page.waitForFunction(() => window.__memory.audio().music.playing);
  report.resumed = await stats(); assert.equal(report.resumed.voices, 0, 'resume does not replay cancelled short cues');

  // Exercise the complete real decoded bank while the game itself is paused.
  await page.evaluate(async () => {
    window.__memory.pause(true);
    const { createMemoryAudio } = await import('./engine/memory/audio.js');
    window.__audioProbe = createMemoryAudio(); await window.__audioProbe.preload(); await window.__audioProbe.unlock(); await window.__audioProbe.preload();
  });
  const cues = [['reveal', 'triceratops', 0], ['reveal', 'stegosaurus', 1], ['reveal', 'brontosaurus', 2], ['conceal'], ['match', 'triceratops', 0], ['branchLift'], ['branchLower'], ['logRoll'], ['bridgeLand'], ['barkPickup'], ['barkPlace', 0], ['stagingArrival'], ['boardwalkComplete'], ['berryArrival'], ['win'], ['footstep', 'wood', .2]];
  for (const cue of cues) { await page.evaluate(([method, ...args]) => window.__audioProbe[method](...args), cue); await page.waitForTimeout(300); }
  await page.evaluate(() => window.__audioProbe.river(true)); report.bank = await page.evaluate(() => window.__audioProbe.getStats());
  assert.equal(report.bank.recordedLoaded, 15); assert.equal(report.bank.riverSource, 'recorded'); assert.equal(report.bank.dropped, 0);
  assert.ok(report.bank.recordedPlayed > 15); assert.ok(report.bank.log.every(entry => entry.source === 'recorded'));
  await page.evaluate(() => window.__audioProbe.pause(true));
  report.bankPaused = await page.evaluate(() => window.__audioProbe.getStats());
  assert.equal(report.bankPaused.voices, 0); assert.equal(report.bankPaused.riverPlaying, false);
  await page.evaluate(() => window.__audioProbe.pause(false)); await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__audioProbe.getStats().voices), 0);
  await page.evaluate(() => window.__audioProbe.dispose());
  report.bankDisposed = await page.evaluate(() => window.__audioProbe.getStats());
  assert.equal(report.bankDisposed.state, 'closed'); assert.equal(report.bankDisposed.recordedLoaded, 0);
  assert.deepEqual(report.errors, []); report.passed = true;
  console.log(JSON.stringify({ passed: true, recordedLoaded: report.bank.recordedLoaded, recordedPlayed: report.bank.recordedPlayed, music: report.welcome.music.source, speechClips: report.welcome.speech.loaded, out }));
} catch (error) { failure = error; report.failure = error.message; if (page) report.last = await stats().catch(() => null); }
finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
if (failure) throw failure;
