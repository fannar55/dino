#!/usr/bin/env node
// Headless screenshot + perf capture for the graphics lab (works for any page in this repo).
//
//   node remake/tools/capture.mjs --out qa/remake/shots/round1 \
//     --shot hero="shot=hero&t=2" --shot wide="shot=wide&t=2" \
//     [--page remake/index.html] [--size 1600x900] [--browser edge|chrome]
//     [--ready "window.__demoReady === true"] [--eval "<js run after ready>"]
//     [--settle 400] [--timeout 120] [--perf 0] [--bench 0] [--headful]
//
// For each --shot name=query it loads <page>?<query>, waits until the --ready expression is true,
// runs --eval (optional), waits --settle ms, screenshots to <out>/<name>.png. With --perf N it also
// samples requestAnimationFrame for N seconds after the screenshot. With --bench N it calls
// window.__benchmark(N) (uncapped, GPU-synced frame cost). Writes <out>/report.json with
// GPU string, console errors/warnings, page exceptions, window.__demoStats, benchmark and timings.
// The page is served from the repo root by a throwaway static server; nothing is left running.

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
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
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

function parseArgs(argv) {
  const o = {
    page: 'remake/index.html', out: 'qa/remake/shots/latest', size: '1600x900', browser: 'edge',
    ready: 'window.__demoReady === true', evalJs: '', settle: 400, timeout: 120, perf: 0, bench: 0, shots: [], headful: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--page') o.page = next();
    else if (a === '--out') o.out = next();
    else if (a === '--size') o.size = next();
    else if (a === '--browser') o.browser = next();
    else if (a === '--ready') o.ready = next();
    else if (a === '--eval') o.evalJs = next();
    else if (a === '--settle') o.settle = Number(next());
    else if (a === '--timeout') o.timeout = Number(next());
    else if (a === '--perf') o.perf = Number(next());
    else if (a === '--bench') o.bench = Number(next());
    else if (a === '--headful') o.headful = true;
    else if (a === '--shot') {
      const s = next();
      const eq = s.indexOf('=');
      o.shots.push(eq < 0 ? { name: s, query: '' } : { name: s.slice(0, eq), query: s.slice(eq + 1) });
    } else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 15).join('\n'));
      process.exit(0);
    } else throw new Error(`Unknown argument ${a}`);
  }
  if (!o.shots.length) o.shots.push({ name: 'default', query: '' });
  const [w, h] = o.size.split('x').map(Number);
  o.width = w; o.height = h;
  return o;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function launchBrowser(o) {
  const exe = BROWSERS[o.browser] || o.browser;
  const userDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'gfxcap-'));
  const args = [
    o.headful ? '' : '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDir}`,
    `--window-size=${o.width},${o.height}`, '--hide-scrollbars', '--mute-audio', '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--use-angle=d3d11', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--autoplay-policy=no-user-gesture-required', 'about:blank',
  ].filter(Boolean);
  const proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'ignore'] });
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
  return { proc, userDir, ws, cdp: new CDP(ws) };
}

const PERF_JS = seconds => `new Promise(res => {
  const d = []; let last = performance.now(); const t0 = last;
  const f = now => {
    d.push(now - last); last = now;
    if (now - t0 < ${seconds * 1000}) { requestAnimationFrame(f); return; }
    d.shift();
    const s = [...d].sort((a, b) => a - b);
    res({ seconds: (now - t0) / 1000, frames: d.length,
      avgFps: +(1000 / (d.reduce((a, b) => a + b, 0) / d.length)).toFixed(1),
      p50ms: +s[Math.floor(s.length * .5)].toFixed(1), p95ms: +s[Math.floor(s.length * .95)].toFixed(1),
      worstMs: +s[s.length - 1].toFixed(1) });
  };
  requestAnimationFrame(f);
})`;

const GPU_JS = `(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return 'no webgl2';
  const e = gl.getExtension('WEBGL_debug_renderer_info');
  return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
})()`;

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(ROOT, o.out);
  await fsp.mkdir(outDir, { recursive: true });
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}/${o.page.replace(/\\/g, '/').replace(/^\//, '')}`;
  const browser = await launchBrowser(o);
  const { cdp } = browser;
  const report = { page: o.page, size: o.size, browser: o.browser, startedAt: new Date().toISOString(), gpu: null, shots: [] };
  let log = [];
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (m, p) => cdp.send(m, p, sessionId);
    cdp.handlers.add(msg => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(msg.params.type)) {
        log.push({ kind: `console.${msg.params.type}`, text: msg.params.args.map(a => a.value ?? a.description ?? a.type).join(' ').slice(0, 600) });
      } else if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        log.push({ kind: 'exception', text: `${d.exception?.description || d.text} @${d.url || ''}:${d.lineNumber}`.slice(0, 900) });
      } else if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(msg.params.entry.level)) {
        log.push({ kind: `log.${msg.params.entry.level}`, text: `${msg.params.entry.text} ${msg.params.entry.url || ''}`.slice(0, 600) });
      }
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: o.width, height: o.height, deviceScaleFactor: 1, mobile: false });
    const evaluate = async (expression, awaitPromise = false) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    for (const shot of o.shots) {
      log = [];
      const url = shot.query ? `${base}?${shot.query}` : base;
      const entry = { name: shot.name, query: shot.query, file: null, ok: false, loadMs: null, errors: null, stats: null, perf: null };
      const t0 = Date.now();
      await send('Page.navigate', { url });
      let ready = false;
      while (Date.now() - t0 < o.timeout * 1000) {
        try { ready = await evaluate(`Boolean(${o.ready})`); } catch { ready = false; }
        if (ready) break;
        await sleep(250);
      }
      entry.loadMs = Date.now() - t0;
      if (!ready) entry.timeout = true;
      if (!report.gpu) {
        try { report.gpu = await evaluate(GPU_JS); } catch (e) { report.gpu = `error: ${e.message}`; }
      }
      if (o.evalJs) {
        try { await evaluate(`(async () => { ${o.evalJs} })()`, true); } catch (e) { log.push({ kind: 'eval-error', text: e.message }); }
      }
      await sleep(o.settle);
      const shotData = await send('Page.captureScreenshot', { format: 'png' });
      const file = path.join(outDir, `${shot.name}.png`);
      await fsp.writeFile(file, Buffer.from(shotData.data, 'base64'));
      entry.file = path.relative(ROOT, file).replace(/\\/g, '/');
      try { entry.stats = await evaluate('window.__demoStats ? JSON.parse(JSON.stringify(window.__demoStats)) : null'); } catch { entry.stats = null; }
      if (o.perf > 0) {
        try { entry.perf = await evaluate(PERF_JS(o.perf), true); } catch (e) { entry.perf = { error: e.message }; }
      }
      if (o.bench > 0) {
        try {
          entry.bench = await evaluate(`window.__benchmark ? window.__benchmark(${o.bench}) : { error: 'window.__benchmark missing' }`, true);
        } catch (e) { entry.bench = { error: e.message }; }
      }
      entry.errors = log.slice(0, 40);
      entry.ok = ready && !log.some(l => l.kind === 'exception' || l.kind === 'console.error');
      report.shots.push(entry);
      const perfText = entry.perf && entry.perf.avgFps ? ` ${entry.perf.avgFps}fps p95 ${entry.perf.p95ms}ms` : '';
      const b = entry.bench;
      const gpuText = b && b.gpuMs && b.gpuMs.median != null ? `gpu ${b.gpuMs.median}ms median, ` : '';
      const benchText = b ? (b.error ? ` bench error: ${b.error}` : ` bench ${gpuText}${Number(b.msPerFrame).toFixed(2)}ms/frame wall, ${b.drawCalls} calls, ${b.triangles} tris, ${b.textureMB} MB tex`) : '';
      console.log(`${entry.ok ? 'OK  ' : 'FAIL'} ${shot.name} -> ${entry.file} (${entry.loadMs}ms${entry.timeout ? ', READY TIMEOUT' : ''}, ${log.length} log entries${perfText}${benchText})`);
      for (const l of log.slice(0, 8)) console.log(`     ${l.kind}: ${l.text}`);
    }
  } finally {
    report.finishedAt = new Date().toISOString();
    await fsp.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    try { await cdp.send('Browser.close'); } catch {}
    try { browser.ws.close(); } catch {}
    await sleep(300);
    try { browser.proc.kill(); } catch {}
    server.close();
    for (let i = 0; i < 10; i++) {
      try { await fsp.rm(browser.userDir, { recursive: true, force: true }); break; } catch { await sleep(300); }
    }
  }
  console.log(`GPU: ${report.gpu}`);
  console.log(`Report: ${path.relative(ROOT, path.join(outDir, 'report.json')).replace(/\\/g, '/')}`);
  if (report.shots.some(s => !s.ok)) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exit(2); });
