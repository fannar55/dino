#!/usr/bin/env node
// A real-browser check of the remake's sound (61 checks): the theme streamed and looping, the unlock on the first touch,
// the journal's pause, a hidden tab, a sleeping context woken by a touch, the voice ducking the music, steady play and the
// loop point, every sound effect, and silent captures. Real touch and mouse gestures go over the DevTools protocol, and a
// spy records what the page asks of Web Audio and of its media elements.
//
//   node remake/tools/sound-check.mjs                    headless Chrome on this computer, with its own server
//   node remake/tools/sound-check.mjs --browser edge     or Edge (or a path to a Chromium browser)
//   node remake/tools/sound-check.mjs --connect 127.0.0.1:9222 --base http://<this computer>:4190/remake/
//                                                        a browser that is already running, such as Chrome on the tablet
//   [--query "quality=low&debug=1"] [--headful]
//
// On this computer it starts headless with the desktop autoplay policy (a touch is needed before sound) and muted output,
// and serves the repo itself with byte ranges (serve.mjs). On the Android tablet: turn on USB debugging, plug it in, run
// `adb forward tcp:9222 localabstract:chrome_devtools_remote`, start `node remake/tools/serve.mjs --lan`, keep Chrome open on
// the tablet, and pass --connect and --base (the address serve.mjs prints for the tablet). The tablet plays the sound
// aloud; the check opens its own tabs there and closes them at the end. Exit code 0 when every check passes.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { handle } from './serve.mjs';

const BROWSERS = {
  chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
};
const option = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 17).join('\n'));
  process.exit(0);
}
const CONNECT = option('connect', null);
const EXE = BROWSERS[option('browser', 'chrome')] || option('browser');
const HEADFUL = process.argv.includes('--headful');
const QUERY = option('query', 'quality=low&debug=1');
let BASE = option('base', null); // the page's folder as the browser reaches it; by default this script's own server
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Set();
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} ${msg.error.data || ''}`));
        else resolve(msg.result);
      } else if (msg.method) for (const h of this.handlers) h(msg);
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

const openSocket = async url => {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  return ws;
};

/** A browser already running with its DevTools endpoint at host:port (the tablet's Chrome through adb forward). */
async function connect(hostPort) {
  const info = await (await fetch(`http://${hostPort}/json/version`)).json();
  const ws = await openSocket(info.webSocketDebuggerUrl);
  console.log(`connected to ${info.Browser} (${info['User-Agent']})`);
  return { remote: true, cdp: new CDP(ws), ws, targets: [] };
}

async function launch() {
  if (!fs.existsSync(EXE)) throw new Error(`No browser at ${EXE}: pass --browser edge, or the path of a Chromium browser`);
  const userDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sndchk-'));
  const args = [
    HEADFUL ? '' : '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDir}`, '--window-size=1280,800', '--mute-audio',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--use-angle=d3d11', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization', '--enable-unsafe-swiftshader', '--autoplay-policy=document-user-activation-required', 'about:blank',
  ].filter(Boolean);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== '__COMPAT_LAYER'));
  const proc = spawn(EXE, args, { stdio: 'ignore', env });
  const portFile = path.join(userDir, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await sleep(100);
  let lines = [];
  for (let i = 0; i < 50; i++) { lines = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/); if (lines.length >= 2) break; await sleep(100); }
  const ws = await openSocket(`ws://127.0.0.1:${lines[0]}${lines[1]}`);
  return { proc, userDir, cdp: new CDP(ws), ws, targets: [] };
}

async function stop(browser) {
  if (browser.remote) {
    // Somebody else's browser: close only the tabs this check opened.
    for (const targetId of browser.targets) { try { await Promise.race([browser.cdp.send('Target.closeTarget', { targetId }), sleep(2000)]); } catch {} }
    try { browser.ws.close(); } catch {}
    return;
  }
  try { await Promise.race([browser.cdp.send('Browser.close'), sleep(2000)]); } catch {}
  try { browser.ws.close(); } catch {}
  await sleep(500);
  try { browser.proc.kill(); } catch {}
  if (process.platform === 'win32') {
    const ps = `Get-CimInstance Win32_Process -Filter "Name='${path.basename(EXE)}'" | Where-Object { $_.CommandLine -like '*${path.basename(browser.userDir)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    try { spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore', timeout: 20000 }); } catch {}
  }
  await sleep(1500);
  try { await fsp.rm(browser.userDir, { recursive: true, force: true }); } catch {}
}

// What the page does with Web Audio and its media elements, recorded before any of its code runs.
const SPY = `(() => {
  const spy = window.__spy = { contexts: [], edges: [], frames: [], media: [], seeks: [], elements: [], decodes: 0, beds: 0 };
  let lastFrame = performance.now();
  const tickFrames = now => { spy.frames.push([now, now - lastFrame]); lastFrame = now; requestAnimationFrame(tickFrames); };
  requestAnimationFrame(tickFrames);
  const Original = window.AudioContext;
  window.AudioContext = class extends Original { constructor(...a) { super(...a); spy.contexts.push(this); } };
  const decode = AudioContext.prototype.decodeAudioData;
  AudioContext.prototype.decodeAudioData = function (...a) { spy.decodes++; return decode.apply(this, a); };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...a) { if (this.loop) spy.beds++; return start.apply(this, a); };
  // every audio element the page makes, and everything it is asked to do
  const OriginalAudio = window.Audio;
  window.Audio = function (...a) { const el = new OriginalAudio(...a); spy.elements.push(el); return el; };
  window.Audio.prototype = OriginalAudio.prototype;
  const name = el => (el.currentSrc || el.src).split('/').pop();
  for (const method of ['play', 'pause']) {
    const original = HTMLMediaElement.prototype[method];
    HTMLMediaElement.prototype[method] = function (...args) { spy.media.push([method, name(this), Math.round(performance.now())]); return original.apply(this, args); };
  }
  const time = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
  Object.defineProperty(HTMLMediaElement.prototype, 'currentTime', {
    configurable: true,
    get() { return time.get.call(this); },
    set(value) { spy.seeks.push([name(this), +value.toFixed(3), Math.round(performance.now())]); time.set.call(this, value); },
  });
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) { spy.edges.push({ from: this, to: dest }); return connect.call(this, dest, ...rest); };
})();`;

// Helpers that live in the page.
const HELPERS = `(() => {
  const h = window.__h = {};
  h.theme = () => __spy.elements.find(e => /theme\\.mp3$/.test(e.currentSrc || e.src));
  h.fade = () => { const e = __spy.edges.find(e => e.from instanceof MediaElementAudioSourceNode); return e && e.to; };
  h.seeks = () => __spy.seeks.filter(s => s[0] === 'theme.mp3');
  h.rms = () => {
    if (!h.an) { h.an = __audio.context.createAnalyser(); h.an.fftSize = 2048; __audio.output.connect(h.an); }
    const d = new Float32Array(h.an.fftSize); h.an.getFloatTimeDomainData(d);
    let s = 0; for (const v of d) s += v * v; return Math.sqrt(s / d.length);
  };
  h.level = () => { const e = __spy.edges.find(e => e.to === __audio.output && e.from instanceof GainNode); return e ? e.from.gain.value : null; };
  h.snap = () => {
    const ctx = __audio.context, el = h.theme(), fade = h.fade();
    const playing = Boolean(el) && !el.paused;
    return {
      state: ctx && ctx.state, ctxTime: ctx && +ctx.currentTime.toFixed(3), clock: +__world.clock.time.toFixed(3), clockPaused: __world.clock.paused,
      position: +__music.position.toFixed(3), hidden: document.hidden, vis: document.visibilityState,
      playing, elTime: el && +el.currentTime.toFixed(3), fade: fade && +fade.gain.value.toFixed(3), sounding: playing && Boolean(fade) && fade.gain.value > 0.5,
      seeks: h.seeks().length, level: h.level() && +h.level().toFixed(4), rms: +h.rms().toFixed(5), muted: __music.muted, t: Math.round(performance.now()),
    };
  };
  h.maxRms = async (ms = 200) => { let m = 0; const t0 = performance.now(); while (performance.now() - t0 < ms) { m = Math.max(m, h.rms()); await new Promise(r => setTimeout(r, 15)); } return +m.toFixed(5); };
})();`;

let failures = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}${detail ? `  [${detail}]` : ''}`);
  if (!ok) failures++;
};
/** How far apart the element's clock and the playhead are, the short way round the 351.6 s loop. */
const apart = s => {
  let gap = s.position - s.elTime;
  gap -= Math.round(gap / 351.6) * 351.6;
  return Math.abs(gap);
};

async function main() {
  let server = null;
  if (!BASE) {
    server = http.createServer(handle);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    BASE = `http://127.0.0.1:${server.address().port}/remake/`;
  }
  if (!BASE.endsWith('/')) BASE += '/';
  const browser = CONNECT ? await connect(CONNECT) : await launch();
  const { cdp } = browser;
  const problems = [];
  try {
    const attach = async url => {
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
      browser.targets.push(targetId);
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (m, p) => cdp.send(m, p, sessionId);
      await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');
      if (!browser.remote) { // a real tablet has its own screen and fingers
        await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
        await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      }
      await send('Page.addScriptToEvaluateOnNewDocument', { source: SPY });
      const ev = async (expression, awaitPromise = true) => {
        const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
      };
      const page = { targetId, sessionId, send, ev, audioRequests: [] };
      cdp.handlers.add(msg => {
        if (msg.sessionId !== sessionId) return;
        if (msg.method === 'Network.requestWillBeSent' && /\.mp3$/.test(msg.params.request.url)) page.audioRequests.push({ url: msg.params.request.url.split('/').slice(3).join('/'), range: msg.params.request.headers.Range || msg.params.request.headers.range || null });
        if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(msg.params.type)) problems.push(`[${url}] console.${msg.params.type}: ${msg.params.args.map(a => a.value ?? a.description ?? a.type).join(' ').slice(0, 300)}`);
        if (msg.method === 'Runtime.exceptionThrown') problems.push(`[${url}] exception: ${(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text).slice(0, 300)}`);
      });
      await send('Page.navigate', { url: BASE + url });
      return page;
    };
    const waitFor = async (page, expr, ms = 120000) => {
      const t0 = Date.now();
      for (;;) {
        try { if (await page.ev(`Boolean(${expr})`)) return true; } catch {}
        if (Date.now() - t0 > ms) return false;
        await sleep(250);
      }
    };
    const rectOf = (page, selector) => page.ev(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const touch = async (page, x, y) => {
      await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await sleep(60);
      await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const click = async (page, x, y) => {
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    };

    // ---- A. load, and before the first touch -------------------------------------------------
    console.log('\n== before the first touch ==');
    console.log(`(the page: ${BASE}?${QUERY})`);
    const page = await attach(`?${QUERY}`);
    const loaded = await waitFor(page, 'window.__demoReady === true');
    check(loaded, 'the page is ready');
    await page.ev(HELPERS, false);
    const ready = await page.ev('__music.ready');
    check(ready === true, 'the theme\'s file opened while the start button waits', String(ready));
    const el = await page.ev(`(() => { const e = __h.theme(); return e && { src: e.currentSrc, loop: e.loop, preload: e.preload, duration: e.duration, readyState: e.readyState, paused: e.paused }; })()`);
    console.log('   ', JSON.stringify(el));
    check(el && el.src === new URL('assets/audio/theme.mp3', BASE).href && el.loop && el.preload === 'auto', 'it streams theme.json\'s src (the 96 kbps copy), looping, preload auto', JSON.stringify(el));
    check(el && Math.abs(el.duration - 351.6) < 0.1, 'and Chrome knows its length to be 351.6 s, the delay and padding trimmed (the beat grid was measured on the trimmed file)', String(el && el.duration));
    check(el && el.paused === true, 'it is not playing');
    console.log('    audio files asked for so far:', JSON.stringify(page.audioRequests));
    check(page.audioRequests.length >= 1 && page.audioRequests.every(r => r.url === 'remake/assets/audio/theme.mp3'), 'only the compressed copy is requested (in byte ranges); dist/ is not touched');
    check(await page.ev('__spy.decodes') === 0, 'and nothing is decoded into memory (decodeAudioData is never called)');
    let s = await page.ev('__h.snap()');
    console.log('   ', JSON.stringify(s));
    check(s.state === 'suspended', 'the browser keeps the audio context asleep before a touch (real autoplay policy)', s.state);
    check(!s.playing, 'nothing plays');
    check(Math.abs(s.position - s.clock) < 0.5 && s.clock > 0.5, 'the playhead follows the game clock meanwhile', `clock ${s.clock}, position ${s.position}`);
    check(s.rms === 0, 'and the output is silent');
    const fps = await page.ev(`new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(+(n / 2).toFixed(1)); }; requestAnimationFrame(f); })`);
    console.log(`    (headless frame rate here: ${fps} fps)`);

    // ---- B. the first touch ------------------------------------------------------------------
    console.log('\n== the first touch (the start button, by finger) ==');
    const start = await rectOf(page, '#start');
    await touch(page, start.x, start.y);
    const askedAtOnce = await page.ev('__sfx.play("forest")'); // the scene asks on its first frame, before the context has woken
    let woke = false;
    const touchedAt = Date.now();
    for (let i = 0; i < 500 && !woke; i++) {
      await sleep(50);
      s = await page.ev('__h.snap()');
      woke = s.state === 'running' && s.sounding && s.ctxTime > 0.3 && s.fade > 0.5;
    }
    console.log(`    (this PC's media output took ${Date.now() - touchedAt} ms to start; the decoded-buffer build woke in 118-325 ms here)`);
    console.log(`    (the context woke and the theme came up ${Date.now() - touchedAt} ms after the touch)`);
    console.log('   ', JSON.stringify(s));
    check(woke, 'the touch woke the audio context and the theme came up', s.state);
    check(s.seeks === 0 && s.elTime < 1, 'from the theme\'s beginning, without anyone moving the element', `seeks ${s.seeks}, element at ${s.elTime}`);
    check(apart(s) < 0.1, 'and the playhead is where the element is', `position ${s.position}, element ${s.elTime}`);
    await sleep(400);
    check(askedAtOnce === false && await page.ev('__spy.beds') === 1, 'the forest asked for before the context woke was laid once it had (one bed of wind)', `asked: ${askedAtOnce}`);
    await sleep(1500);
    const rmsPlaying = await page.ev('__h.maxRms(400)');
    check(rmsPlaying > 0.005, 'music reaches the output', `rms ${rmsPlaying}`);
    await sleep(4000);
    s = await page.ev('__h.snap()');
    console.log('   ', JSON.stringify(s));
    const longFrames = await page.ev(`__spy.frames.filter(f => f[1] > 40).map(f => [Math.round(f[0]), Math.round(f[1])])`);
    console.log('    frames over 40 ms since the page loaded (time ms, length ms):', JSON.stringify(longFrames.slice(-12)));
    console.log('    seeks of the theme so far:', JSON.stringify(await page.ev('__h.seeks()')));
    check(s.seeks <= 1, 'the first six seconds pass with at most the one correction a long first frame can cost', `seeks ${s.seeks}`);
    check(s.sounding && apart(s) <= 0.1 + 1e-9, 'what is heard is on the playhead (within the 100 ms the music allows)', `element ${s.elTime}, position ${s.position}`);

    // ---- C. the child's book -----------------------------------------------------------------
    console.log('\n== the journal page the child opens ==');
    await page.ev(`document.getElementById('journal-button').hidden = false`, false);
    const book = await rectOf(page, '#journal-button');
    const pre = await page.ev('__h.snap()');
    await click(page, book.x, book.y);
    // The sound is gone within the 40 ms fade (an automation on the audio thread); the element is stopped by the first frame after that,
    // and opening the book is a long frame on this machine (about 500 ms): wait for the stop instead of guessing when it comes.
    let stoppedAfter = 0;
    while (stoppedAfter < 4000 && await page.ev('!__h.theme().paused')) { await sleep(50); stoppedAfter += 50; }
    await sleep(300);
    s = await page.ev('__h.snap()');
    console.log('   ', JSON.stringify(s), `(the element was stopped within ${stoppedAfter} ms of the touch's return)`);
    check(s.clockPaused === true, 'the clock holds');
    check(!s.playing && s.fade === 0, 'the music fades out and its element is stopped', `playing ${s.playing}, fade ${s.fade}`);
    const silent = await page.ev('__h.maxRms(300)');
    check(silent < 1e-4, 'and the output falls silent', `rms ${silent}`);
    const heldAt = s.position;
    const heldEl = s.elTime;
    const heldSeeks = s.seeks;
    console.log(`    (the element was at ${pre.elTime} and the playhead at ${pre.position} when the book was opened)`);
    {
      // when, in page time, the seeks since the snapshot before the touch happened, against when the element was paused and the long frames
      const log = await page.ev(`({ seeks: __h.seeks().slice(${pre.seeks}), media: __spy.media.filter(m => m[1] === 'theme.mp3' && m[2] > ${pre.t}), frames: __spy.frames.filter(f => f[0] > ${pre.t} && f[1] > 60).map(f => [Math.round(f[0]), Math.round(f[1])]) })`);
      console.log(`    snapshot before the touch at ${pre.t}; the theme's seeks since: ${JSON.stringify(log.seeks)}; its play/pause calls since: ${JSON.stringify(log.media)}; frames over 60 ms since: ${JSON.stringify(log.frames)}`);
    }
    await sleep(2500);
    s = await page.ev('__h.snap()');
    check(s.position === heldAt && Math.abs(s.elTime - heldEl) < 0.001 && s.seeks === heldSeeks, 'for as long as the book is open the playhead and the element stand still, and nothing is moved', `position ${heldAt} -> ${s.position}, element ${heldEl} -> ${s.elTime}, seeks ${heldSeeks} -> ${s.seeks}`);
    {
      // The sound is gone within the 40 ms fade (an automation on the audio thread); the element itself is stopped by the first frame after
      // that, and opening the book can take a long frame (509 ms in one run), during which the element plays on, silent.
      const long = (await page.ev(`__spy.frames.filter(f => f[0] > ${pre.t} && f[1] > 60).reduce((sum, f) => sum + f[1], 0)`)) / 1000;
      check(heldEl - pre.elTime >= 0 && heldEl - pre.elTime < 0.35 + long, 'the element stopped within a fade of where it was when the book opened, plus the long frames that came between', `element ${pre.elTime} -> ${heldEl}, long frames ${long.toFixed(3)} s`);
    }
    const close = await rectOf(page, '#journal-close');
    await click(page, close.x, close.y);
    await sleep(500);
    s = await page.ev('__h.snap()');
    console.log('   ', JSON.stringify(s));
    check(s.clockPaused === false && s.sounding, 'closing the book lets the music go on');
    check(s.seeks <= pre.seeks + 4 && apart(s) < 0.15, 'on the playhead (a few silent seeks at most, to land on it)', `seeks ${pre.seeks} -> ${s.seeks}, element ${s.elTime}, position ${s.position}`);
    const back = await page.ev('__h.maxRms(400)');
    check(back > 0.005, 'and it is heard again', `rms ${back}`);

    // ---- D. a hidden tab ---------------------------------------------------------------------
    console.log('\n== the tab is hidden ==');
    const second = await cdp.send('Target.createTarget', { url: 'about:blank' });
    await cdp.send('Target.activateTarget', { targetId: second.targetId });
    await sleep(800);
    const vis = await page.ev('({ hidden: document.hidden, vis: document.visibilityState })');
    let simulated = false;
    if (!vis.hidden) {
      console.log('    (this headless Chrome does not hide a background tab: simulating the browser\'s own event)');
      simulated = true;
      await page.ev(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange'));`, false);
    }
    await sleep(500);
    const hiddenPre = await page.ev('__h.snap()');
    s = hiddenPre;
    console.log('   ', JSON.stringify(s));
    check(s.hidden === true, `the page is hidden${simulated ? ' (simulated)' : ' (really)'}`);
    check(!s.playing, 'the music is held and its element stopped while the tab is hidden', `playing ${s.playing}`);
    const heldHidden = s.position;
    await sleep(3000);
    s = await page.ev('__h.snap()');
    check(s.position === heldHidden && !s.playing && Math.abs(s.elTime - hiddenPre.elTime) < 0.001, 'and stays held, the playhead and the element where they were', `position ${heldHidden} -> ${s.position}, element ${hiddenPre.elTime} -> ${s.elTime}`);
    if (simulated) await page.ev(`delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange'));`, false);
    else await cdp.send('Target.activateTarget', { targetId: page.targetId });
    await sleep(900);
    s = await page.ev('__h.snap()');
    console.log('   ', JSON.stringify(s));
    check(s.hidden === false && s.sounding, 'back in view the music goes on');
    check(s.seeks <= hiddenPre.seeks + 4 && apart(s) < 0.15, 'on the playhead the clock implies (a few silent seeks at most)',`seeks ${hiddenPre.seeks} -> ${s.seeks}, element ${s.elTime}, position ${s.position}, held at ${heldHidden}`);
    await cdp.send('Target.closeTarget', { targetId: second.targetId });

    // ---- E. both reasons at once -------------------------------------------------------------
    console.log('\n== the book and a hidden tab together ==');
    await click(page, book.x, book.y);
    await sleep(300);
    await page.ev(`Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'));`, false);
    await sleep(200);
    await page.ev(`delete document.hidden; document.dispatchEvent(new Event('visibilitychange'));`, false);
    await sleep(500);
    s = await page.ev('__h.snap()');
    check(s.clockPaused === true && !s.playing, 'the tab coming back does not start the sound under an open book', `playing ${s.playing}`);
    await click(page, close.x, close.y);
    await sleep(600);
    s = await page.ev('__h.snap()');
    check(s.clockPaused === false && s.sounding, 'shutting the book does');

    // ---- F. sound the system put to sleep ---------------------------------------------------
    console.log('\n== a locked tablet: the context is put to sleep, and a touch wakes it ==');
    const beforeSleep = await page.ev('__h.snap()');
    await page.ev('__audio.context.suspend()');
    await sleep(2500);
    s = await page.ev('__h.snap()');
    console.log('   ', JSON.stringify(s));
    check(s.state === 'suspended', 'the system has put sound to sleep');
    check(!s.playing, 'the music stopped its element, since nothing it plays could be heard');
    const gapBefore = s.position - s.elTime;
    const canvas = await rectOf(page, '#view');
    await touch(page, canvas.x, canvas.y);
    await sleep(2200);
    s = await page.ev('__h.snap()');
    console.log('   ', JSON.stringify(s));
    check(s.state === 'running', 'the next touch, anywhere, wakes it', s.state);
    check(s.sounding && apart(s) <= 0.15 && s.seeks <= beforeSleep.seeks + 4, 'and the sound is brought to the playhead, which went on without it', `element ${s.elTime}, position ${s.position}, was ${gapBefore.toFixed(2)} s apart, seeks ${beforeSleep.seeks} -> ${s.seeks}`);

    // ---- G. the voice ducks the music --------------------------------------------------------
    console.log('\n== a recorded line ducks the music ==');
    const series = await page.ev(`new Promise(resolve => {
      const out = []; const t0 = performance.now();
      __scene.s.say('mosi', 'welcome'); // 6.49 s
      const tick = () => {
        out.push([+((performance.now() - t0) / 1000).toFixed(2), +__h.level().toFixed(4)]);
        if (performance.now() - t0 < 9500) setTimeout(tick, 50); else resolve(out);
      };
      tick();
    })`);
    const normal = series[0][1];
    const lowest = Math.min(...series.map(p => p[1]));
    const reached = series.find(p => p[1] <= lowest + 0.002);
    const risen = series.filter(p => p[0] > 3).find(p => p[1] >= normal - 0.002);
    console.log(`    level ${normal} -> ${lowest} (${(20 * Math.log10(lowest / normal)).toFixed(2)} dB), lowest reached at ${reached[0]} s, back to normal at ${risen && risen[0]} s`);
    check(Math.abs(normal - 0.6) < 0.01, 'the theme sits at 0.6 in the mix', String(normal));
    check(Math.abs(20 * Math.log10(lowest / normal) + 8) < 0.2, 'under the line it is 8 dB down (the element goes through Web Audio, so it ducks)', `${(20 * Math.log10(lowest / normal)).toFixed(2)} dB`);
    check(reached[0] <= 0.6, 'within about 0.3 s of the line starting', `${reached[0]} s (includes the first sample's delay)`);
    check(risen && risen[0] >= 6.0 && risen[0] <= 7.6, 'and back up as the line ends (6.49 s)', `${risen && risen[0]} s`);

    // ---- G2. a line, and the book opens in the middle of it ---------------------------------
    console.log('\n== a line is playing when the child opens the book ==');
    await page.ev(`__scene.s.say('mosi', 'welcome'); 0`, false);
    await sleep(1800);
    const mediaBefore = await page.ev('__spy.media.length');
    let line = await page.ev('({ level: +__h.level().toFixed(4), sounding: __h.snap().sounding })');
    check(line.level < 0.25 && line.sounding, 'the line plays and the music sits under it', JSON.stringify(line));
    await click(page, book.x, book.y);
    await sleep(600);
    const calls = await page.ev(`__spy.media.slice(${mediaBefore})`);
    line = await page.ev('({ level: +__h.level().toFixed(4), sounding: __h.snap().sounding, playing: __h.snap().playing, clockPaused: __world.clock.paused })');
    console.log('    media calls since the book opened:', JSON.stringify(calls), JSON.stringify(line));
    check(calls.some(c => c[0] === 'pause' && c[1] === 'welcome.mp3'), 'the line is paused with the book');
    check(calls.some(c => c[0] === 'pause' && c[1] === 'theme.mp3') && !line.playing && line.clockPaused, 'and so are the music (its element too) and the clock');
    await sleep(8000); // longer than what is left of the line: if the line went on it would end and the music would come up
    line = await page.ev('({ level: +__h.level().toFixed(4), sounding: __h.snap().sounding })');
    check(line.level < 0.25 && !line.sounding, 'eight seconds later the line has not ended behind the book: the music is still ducked, and still held', JSON.stringify(line));
    const mediaMid = await page.ev('__spy.media.length');
    await click(page, close.x, close.y);
    await sleep(1000);
    const after = await page.ev(`__spy.media.slice(${mediaMid})`);
    line = await page.ev('({ level: +__h.level().toFixed(4), sounding: __h.snap().sounding })');
    check(after.some(c => c[0] === 'play' && c[1] === 'welcome.mp3'), 'shutting the book plays the line on');
    check(line.sounding && line.level < 0.25, 'and the music comes back under it', JSON.stringify(line));
    // the line plays on, as long as this machine's output takes to take it up again; the music comes up within a second of its end
    const lineState = () => page.ev(`(() => { const e = [...__spy.elements].reverse().find(e => /welcome\\.mp3$/.test(e.currentSrc || e.src)); return e ? { at: +e.currentTime.toFixed(2), of: +e.duration.toFixed(2), paused: e.paused, ended: e.ended } : null; })()`);
    const ended = l => Boolean(l) && (l.ended || (l.paused && l.at >= l.of - 0.05));
    let waitedForLine = 0;
    for (; waitedForLine < 30000; waitedForLine += 250) {
      const l = await lineState();
      const up = (await page.ev('__h.level()')) > 0.55;
      if (ended(l) || up) break;
      await sleep(250);
    }
    const lineAtTheEnd = await lineState();
    console.log(`    ${(1.0 + waitedForLine / 1000).toFixed(1)} s after the book was shut the music is ${(await page.ev('__h.level()')) > 0.55 ? 'coming up' : 'still down'}; the line:`, JSON.stringify(lineAtTheEnd));
    await sleep(1200);
    line = await page.ev('({ level: +__h.level().toFixed(4), sounding: __h.snap().sounding })');
    check(line.sounding && Math.abs(line.level - 0.6) < 0.01 && (lineAtTheEnd === null || ended(lineAtTheEnd)), 'when the line ends the music comes up (and not before)', JSON.stringify(line));

    // ---- G3. steady play, and the loop ------------------------------------------------------
    console.log('\n== 25 s of steady play ==');
    const soakFrom = await page.ev('({ seeks: __h.seeks().length, frames: __spy.frames.length })');
    await sleep(25000);
    const soak = await page.ev(`({ seeks: __h.seeks().length, long: __spy.frames.slice(${soakFrom.frames}).filter(f => f[1] > 100).map(f => Math.round(f[1])), snap: __h.snap() })`);
    console.log('    frames over 100 ms in those 25 s:', JSON.stringify(soak.long), ' ', JSON.stringify(soak.snap));
    check(soak.seeks - soakFrom.seeks <= soak.long.length, 'the element is moved only where a frame was long', `seeks ${soak.seeks - soakFrom.seeks}, long frames ${soak.long.length}`);
    check(apart(soak.snap) <= 0.1 + 1e-9, 'and what is heard is on the playhead', `element ${soak.snap.elTime}, position ${soak.snap.position}`);

    console.log('\n== the loop: the clock is taken to 12 s before the end of the 351.6 s file ==');
    await page.ev('__world.clock.step(__music.position < 339 ? 339.6 - __music.position : 0)', false);
    await sleep(2000);
    let loop = await page.ev('__h.snap()');
    console.log('   ', JSON.stringify(loop));
    check(loop.sounding && apart(loop) <= 0.1 + 1e-9 && loop.position > 339, 'the sound followed the playhead to the end of the file', `element ${loop.elTime}, position ${loop.position}`);
    const seeksAtEnd = loop.seeks;
    const framesAtEnd = await page.ev('__spy.frames.length');
    await sleep(15000);
    loop = await page.ev('__h.snap()');
    console.log('   ', JSON.stringify(loop));
    const wrapSeeks = await page.ev(`__h.seeks().slice(${seeksAtEnd})`);
    const wrapLong = await page.ev(`__spy.frames.slice(${framesAtEnd}).filter(f => f[1] > 100).map(f => Math.round(f[1]))`);
    console.log('    seeks while it went round the end:', JSON.stringify(wrapSeeks), ' frames over 100 ms:', JSON.stringify(wrapLong));
    check(loop.position < 10 && wrapSeeks.length <= wrapLong.length && apart(loop) <= 0.1 + 1e-9, 'across the end of the file both wrapped together, the element moved only where a frame was long', `element ${loop.elTime}, position ${loop.position}, seeks ${wrapSeeks.length}, long frames ${wrapLong.length}`);

    // ---- H. effects --------------------------------------------------------------------------
    console.log('\n== effects ==');
    await page.ev('__music.muted = true', false); // so the effects are heard alone
    await sleep(600);
    check(!(await page.ev('__h.snap()')).playing, 'muting stops the music\'s element');
    const names = ['step', 'frog', 'snail', 'beetle', 'birds', 'butterfly', 'flower', 'plate', 'star', 'journal', 'saddle', 'float'];
    const peaks = {};
    for (const name of names) {
      const result = await page.ev(`(async () => { const played = __sfx.play(${JSON.stringify(name)}); const peak = await __h.maxRms(1200); return { played, peak }; })()`);
      peaks[name] = result;
      await sleep(900);
    }
    console.log('    ' + names.map(n => `${n} ${peaks[n].peak}`).join(', '));
    check(names.every(n => peaks[n].played === true && peaks[n].peak > 0.001), 'every sound plays and reaches the output');
    const loudest = Math.max(...names.map(n => peaks[n].peak));
    check(loudest < 0.5, 'none is anywhere near clipping', `loudest rms ${loudest}`);
    await page.ev('__scene.s.sfx("forest")', false);
    await sleep(5000);
    const forest = await page.ev('__h.maxRms(600)');
    console.log(`    forest rms ${forest}`);
    check(forest > 1e-4 && forest < 0.03, 'the forest is a quiet bed', `rms ${forest}`);
    await page.ev('__music.muted = false', false);
    await sleep(1500);
    s = await page.ev('__h.snap()');
    check(s.sounding && apart(s) <= 0.15, 'un-muting brings the music back on the playhead', `element ${s.elTime}, position ${s.position}`);

    // ---- I. a capture and a review shot ------------------------------------------------------
    console.log('\n== captures are silent ==');
    for (const query of ['?t=3&quality=low', '?shot=hero&quality=low']) {
      const cap = await attach(query);
      const ok = await waitFor(cap, 'window.__demoReady === true');
      const info = await cap.ev(`({ context: __audio.context, mp3: performance.getEntriesByType('resource').filter(r => r.name.endsWith('.mp3')).length, contexts: window.__spy.contexts.length, elements: window.__spy.elements.length, position: __music.position, clock: __world.clock.time })`);
      info.ready = await cap.ev('__music.ready');
      check(ok && info.context === null && info.contexts === 0 && info.elements === 0 && info.mp3 === 0 && info.ready === false, `${query}: no audio context and no audio element are made, and the theme is not loaded`, JSON.stringify(info));
      check(Math.abs(info.position - info.clock) < 1e-9, `${query}: the playhead is the clock, as before`, `${info.position} / ${info.clock}`);
    }
  } finally {
    console.log(problems.length ? '\nconsole problems:\n  ' + [...new Set(problems)].join('\n  ') : '\nno console errors, warnings or exceptions');
    await stop(browser);
    server?.close();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
  process.exitCode = failures ? 1 : 0;
}

main().catch(e => { console.error(e); process.exit(2); });
