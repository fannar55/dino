#!/usr/bin/env node
// Records a whole round of "Veiddu" (remake/veiddu-lab.html, the live table) as a video, for the owner to watch.
//
//   node remake/tools/veiddu-video.mjs --out qa/remake/veiddu/round-a --seed a
//     [--size 1280x800] [--max 900] [--query "skill=0.2"] [--page remake/veiddu-lab.html] [--browser edge|chrome|<exe>]
//     [--reduced-motion] [--stall 45]
//
// It serves the repo on a throwaway static server, loads <page>?auto=1&seed=<seed> at --size (the child's moves are made by bestAsk,
// after 1.2 s each; everything else plays at its real pace, so the video shows the real feel), records the page with the CDP screencast
// from the moment the game exists (the deal is in the video) until window.__veiddu.phase is 'over' (the win card shows) or --max seconds
// pass, and writes <out>/round.mp4 (15 fps, laid out by real time), <out>/end.png (the win card a few seconds in) and <out>/report.json.
// <out> is relative to the repo root (qa/ is outside git). It logs the round's length and exits 1 if any page error occurs (an exception,
// a console error, a failed load) or the round stalls (nothing changes for --stall seconds), and 2 if the tool itself breaks.
// report.json: { seed, size, finished, roundSeconds, videoSeconds, errors, warnings, stalled, final: { pairs, winners, asks, fishes,
// log }, phaseSeconds, video }. The page is served from the repo root; nothing is left running.

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BROWSERS = {
  edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2',
  '.hdr': 'application/octet-stream', '.exr': 'application/octet-stream', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
};
const FPS = 15;
const END_WAIT_MS = 3500; // after the win card shows: the sticker and the confetti are in
const POLL_MS = 250;

function parseArgs(argv) {
  const o = { out: '', size: '1280x800', seed: 'a', max: 900, query: '', page: 'remake/veiddu-lab.html', browser: 'edge', reducedMotion: false, stall: 45 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--out') o.out = next();
    else if (a === '--size') o.size = next();
    else if (a === '--seed') o.seed = next();
    else if (a === '--max') o.max = Number(next());
    else if (a === '--query') o.query = next();
    else if (a === '--page') o.page = next();
    else if (a === '--browser') o.browser = next();
    else if (a === '--stall') o.stall = Number(next());
    else if (a === '--reduced-motion') o.reducedMotion = true;
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 17).join('\n'));
      process.exit(0);
    } else throw new Error(`Unknown argument ${a}`);
  }
  if (!o.out) o.out = `qa/remake/veiddu/round-${o.seed}`;
  const [w, h] = o.size.split('x').map(Number);
  if (!(w > 0 && h > 0)) throw new Error(`--size must be WIDTHxHEIGHT, not ${o.size}`);
  o.width = w; o.height = h;
  return o;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Waits for a promise, but at most ms, and leaves no timer behind to hold the process open.
const within = (promise, ms) => {
  let timer;
  return Promise.race([promise, new Promise(r => { timer = setTimeout(r, ms); })]).finally(() => clearTimeout(timer));
};

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const file = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      const stat = await fsp.stat(file);
      const target = stat.isDirectory() ? path.join(file, 'index.html') : file;
      const body = await fsp.readFile(target);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

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
      } else if (msg.method) {
        for (const h of this.handlers) h(msg);
      }
    });
    // A dropped socket (the browser closing or crashing) fails the calls it will never answer instead of leaving them waiting.
    ws.addEventListener('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('DevTools socket closed'));
      this.pending.clear();
    });
  }
  send(method, params = {}, sessionId) {
    if (this.ws.readyState !== WebSocket.OPEN) return Promise.reject(new Error('DevTools socket closed'));
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function launchBrowser(o) {
  const exe = BROWSERS[o.browser] || o.browser;
  const userDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'veiddu-video-'));
  const args = [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDir}`,
    `--window-size=${o.width},${o.height}`, '--hide-scrollbars', '--mute-audio', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--use-angle=d3d11', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--autoplay-policy=no-user-gesture-required', 'about:blank',
  ];
  // With __COMPAT_LAYER set (it is on this laptop) Edge relaunches itself without it and the process we spawn exits
  // at once, so waiting for it or killing it misses the real browser. Leave it out, as Edge's relaunch does.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== '__COMPAT_LAYER'));
  const proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'ignore'], env });
  const browser = { exe, proc, exited: new Promise(r => proc.once('exit', r)), userDir, ws: null, cdp: null };
  try {
    const portFile = path.join(userDir, 'DevToolsActivePort');
    for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await sleep(100);
    if (!fs.existsSync(portFile)) throw new Error('Browser did not start (no DevToolsActivePort)');
    let lines = [];
    for (let i = 0; i < 50; i++) {
      lines = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
      if (lines.length >= 2) break;
      await sleep(100);
    }
    const ws = new WebSocket(`ws://127.0.0.1:${lines[0]}${lines[1]}`);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    return Object.assign(browser, { ws, cdp: new CDP(ws) });
  } catch (e) {
    await stopBrowser(browser);
    throw e;
  }
}

// Browser.close is not enough on Windows: the browser can take a minute or more to exit after it, its helper
// processes (GPU, crashpad) can outlive it, and while any of them runs the profile folder cannot be removed.
async function stopBrowser(browser) {
  if (browser.cdp) await within(browser.cdp.send('Browser.close').catch(() => {}), 2000);
  try { browser.ws?.close(); } catch {}
  await within(browser.exited, 5000);
  try { browser.proc.kill(); } catch {}
  killProfileProcesses(browser.exe, browser.userDir);
  // A killed browser keeps its files open until it has torn down, which took up to 13 s in tests here.
  await within(browser.exited, 15000);
  for (let i = 0; i < 40; i++) {
    try { await fsp.rm(browser.userDir, { recursive: true, force: true }); return; } catch { await sleep(250); }
  }
  console.warn(`Could not remove ${browser.userDir}`);
}

// Windows only: kill() reaches the browser but not its helpers, so stop every process of this browser that was
// started with this run's profile folder.
function killProfileProcesses(exe, userDir) {
  if (process.platform !== 'win32') return;
  const ps = `Get-CimInstance Win32_Process -Filter "Name='${path.basename(exe)}'" | Where-Object { $_.CommandLine -like '*${path.basename(userDir)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  try { spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore', timeout: 20000 }); } catch {}
}

/**
 * The video: the screencast sends a frame only when the picture changes, so the frames are laid out by real time. A clock ticks at FPS
 * and, for every tick that has gone by, writes the latest frame (again, while nothing changed) to ffmpeg, which reads them from its
 * stdin and encodes round.mp4. That keeps the video at the speed the round was played, and no frames are kept on disk.
 */
function startVideo(file, width, height) {
  const even = n => n - (n % 2);
  const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-vf', `scale=${even(width)}:${even(height)}`, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', file];
  const ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  ffmpeg.stderr.on('data', chunk => { stderr += chunk; });
  ffmpeg.stdin.on('error', () => {}); // ffmpeg closed early: its exit code says so
  const exited = new Promise(resolve => ffmpeg.once('close', code => resolve(code)));
  const video = { frames: 0, received: 0, last: null, t0: null, written: 0, error: null };
  const tick = () => {
    if (!video.last) return;
    const due = Math.floor(((Date.now() - video.t0) / 1000) * FPS) + 1;
    while (video.written < due) {
      ffmpeg.stdin.write(video.last);
      video.written++;
    }
  };
  const timer = setInterval(tick, 1000 / FPS / 2);
  return {
    video,
    frame(jpeg) { // a new picture from the screencast
      video.received++;
      if (!video.last) video.t0 = Date.now();
      video.last = jpeg;
      tick();
    },
    async finish() {
      clearInterval(timer);
      tick();
      ffmpeg.stdin.end();
      const code = await within(exited, 5 * 60 * 1000);
      if (code !== 0) video.error = `ffmpeg exited with ${code}: ${stderr.slice(0, 400)}`;
      return video;
    },
  };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(ROOT, o.out);
  await fsp.mkdir(outDir, { recursive: true });
  const errors = [];
  const warnings = [];
  const report = {
    page: o.page, seed: o.seed, size: o.size, reducedMotion: o.reducedMotion, startedAt: new Date().toISOString(),
    finished: false, stalled: null, roundSeconds: null, videoSeconds: null, errors, warnings, final: null, phaseSeconds: {}, gpu: null, video: null,
  };
  const server = await startServer();
  const query = ['auto=1', `seed=${encodeURIComponent(o.seed)}`, o.query].filter(Boolean).join('&');
  const url = `http://127.0.0.1:${server.address().port}/${o.page.replace(/\\/g, '/').replace(/^\//, '')}?${query}`;
  const browser = await launchBrowser(o);
  const { cdp } = browser;
  const videoFile = path.join(outDir, 'round.mp4');
  const recorder = startVideo(videoFile, o.width, o.height);
  let fatal = null;
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (m, p) => cdp.send(m, p, sessionId);
    cdp.handlers.add(msg => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        errors.push(`exception: ${d.exception?.description || d.text} @${d.url || ''}:${d.lineNumber}`.slice(0, 900));
      } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(msg.params.type)) {
        errors.push(`console.${msg.params.type}: ${msg.params.args.map(a => a.value ?? a.description ?? a.type).join(' ')}`.slice(0, 600));
      } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'warning') {
        warnings.push(`console.warning: ${msg.params.args.map(a => a.value ?? a.description ?? a.type).join(' ')}`.slice(0, 400));
      } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        const e = msg.params.entry;
        if (!/favicon\.ico/.test(e.url || e.text || '')) errors.push(`log.error: ${e.text} ${e.url || ''}`.slice(0, 600));
      } else if (msg.method === 'Page.screencastFrame') {
        recorder.frame(Buffer.from(msg.params.data, 'base64'));
        send('Page.screencastFrameAck', { sessionId: msg.params.sessionId }).catch(() => {});
      }
    });
    await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
    const phone = o.width < 768 || o.height < 500; // (a phone held sideways, 844x390, is a phone too: touch and the mobile media features)
    await send('Emulation.setDeviceMetricsOverride', { width: o.width, height: o.height, deviceScaleFactor: 1, mobile: phone });
    if (phone) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (o.reducedMotion) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const ev = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };

    // The screencast starts as soon as the game exists, so the deal is in the video.
    await send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: o.width, maxHeight: o.height, everyNthFrame: 1 });
    const t0 = Date.now();
    await send('Page.navigate', { url });
    for (let n = 0; n < 1200; n++) { // up to 2 minutes for the page to load
      if (await ev('typeof window.__veiddu === "object"').catch(() => false)) break;
      await sleep(100);
    }
    if (!(await ev('typeof window.__veiddu === "object"').catch(() => false))) throw new Error('The page never made window.__veiddu');
    const dealAt = Date.now();
    report.gpu = await ev(`(() => { const gl = document.createElement('canvas').getContext('webgl2'); if (!gl) return 'no webgl2'; const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })()`).catch(e => `error: ${e.message}`);
    console.log(`[0.0] game is up (page load ${((dealAt - t0) / 1000).toFixed(1)} s), seed ${o.seed}, ${o.size}`);

    // The round: poll the game's phase until it is over; a round that stops changing is a stall.
    let last = { phase: null, log: -1 };
    let changedAt = Date.now();
    let overAt = null;
    const seen = {};
    let polled = Date.now();
    let beat = Date.now();
    while (Date.now() - dealAt < o.max * 1000) {
      let now;
      try {
        now = await ev('({ phase: window.__veiddu.phase, log: window.__veiddu.game ? window.__veiddu.game.log.length : 0, dealt: window.__veiddu.dealt })');
      } catch (e) { errors.push(`driver: ${e.message}`); break; }
      const tickNow = Date.now();
      seen[now.phase] = (seen[now.phase] ?? 0) + (tickNow - polled) / 1000;
      polled = tickNow;
      if (now.phase !== last.phase || now.log !== last.log) {
        last = now;
        changedAt = tickNow;
      }
      if (tickNow - beat >= 20000) { // a sign of life every 20 s
        beat = tickNow;
        console.log(`[${((tickNow - dealAt) / 1000).toFixed(0)}] ${now.phase}, ${now.log} events so far`);
      }
      if (now.phase === 'over') { overAt = tickNow; break; }
      if (tickNow - changedAt > o.stall * 1000) { report.stalled = { phase: now.phase, log: now.log, seconds: o.stall, at: +((tickNow - dealAt) / 1000).toFixed(1) }; break; }
      await sleep(POLL_MS);
    }
    report.phaseSeconds = Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, +v.toFixed(1)]));
    if (overAt) {
      report.finished = true;
      report.roundSeconds = +((overAt - dealAt) / 1000).toFixed(1);
      await sleep(END_WAIT_MS);
      const png = await send('Page.captureScreenshot', { format: 'png' });
      await fsp.writeFile(path.join(outDir, 'end.png'), Buffer.from(png.data, 'base64'));
      await sleep(1000);
    }
    report.final = await ev(`(() => {
      const g = window.__veiddu.game; if (!g) return null;
      const by = type => [0, 1, 2].map(seat => g.log.filter(e => e.type === type && (e.seat === seat)).length);
      return { phase: window.__veiddu.phase, pairs: g.pairs.map(p => p.length), winners: g.winners, asks: by('ask'), fishes: by('fish'), lucky: g.log.filter(e => e.type === 'fish' && e.lucky).length, noes: g.log.filter(e => e.type === 'no').length, log: g.log.length, pond: g.pond.length,
        title: document.querySelector('.veiddu-win h2')?.textContent ?? null, sticker: Boolean(document.querySelector('.veiddu-sticker') && !document.querySelector('.veiddu-sticker').hidden) };
    })()`).catch(e => ({ error: e.message }));
    await send('Page.stopScreencast').catch(() => {});
  } catch (e) {
    fatal = e;
    errors.push(`driver: ${e.stack || e.message}`.slice(0, 900));
  } finally {
    report.video = await recorder.finish();
    if (!report.video.error && fs.existsSync(videoFile)) {
      report.video = { file: path.relative(ROOT, videoFile).replace(/\\/g, '/'), bytes: fs.statSync(videoFile).size, frames: report.video.written, received: report.video.received, fps: FPS };
      report.videoSeconds = +(report.video.frames / FPS).toFixed(1);
    }
    report.finishedAt = new Date().toISOString();
    await stopBrowser(browser);
    server.close();
    await fsp.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  }
  const r = report;
  console.log(`${r.finished ? 'FINISHED' : 'NOT FINISHED'} seed ${o.seed} ${o.size}: round ${r.roundSeconds ?? '-'} s (${r.roundSeconds ? (r.roundSeconds / 60).toFixed(1) : '-'} min), ${r.errors.length} errors, ${r.warnings.length} warnings${r.stalled ? `, STALLED in ${r.stalled.phase} at ${r.stalled.at} s` : ''}`);
  if (r.final) console.log(`Final: pairs ${JSON.stringify(r.final.pairs)}, winners ${JSON.stringify(r.final.winners)}, asks ${JSON.stringify(r.final.asks)}, fishes ${JSON.stringify(r.final.fishes)}, lucky ${r.final.lucky}, noes ${r.final.noes}, card "${r.final.title}", sticker ${r.final.sticker}`);
  console.log(`Seconds in each phase: ${JSON.stringify(r.phaseSeconds)}`);
  if (r.video?.file) console.log(`Video: ${r.video.file} (${r.videoSeconds} s, ${(r.video.bytes / 1e6).toFixed(1)} MB, ${r.video.received} screencast frames)`);
  else console.log(`Video: none${r.video?.error ? ` (${r.video.error})` : ''}`);
  for (const e of r.errors.slice(0, 10)) console.log(`  error: ${e}`);
  for (const w of [...new Set(r.warnings)].slice(0, 5)) console.log(`  warning: ${w}`);
  console.log(`GPU: ${r.gpu}`);
  console.log(`Report: ${path.relative(ROOT, path.join(outDir, 'report.json')).replace(/\\/g, '/')}`);
  if (fatal || !r.finished || r.errors.length || r.stalled) process.exitCode = fatal ? 2 : 1;
}

main().catch(e => { console.error(e); process.exit(2); });
