#!/usr/bin/env node
// Runs a bake page from remake/tools/bake/ in headless Edge and writes the GLB it uploads.
//
//   node remake/tools/bake/bake-character.mjs --page bake-biped --out remake/assets/characters/egill.glb
//     [--query "src=../../assets/characters/source/egill-parts.glb&height=1.1&yaw=90&name=Egill"]
//
// The page reads its options from the query, posts the finished GLB to /__bake-output and sets
// window.__bakeStatus to 'done' (or an error message).

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const outFile = path.resolve(ROOT, arg('--out', 'qa/remake/bake/character.glb'));
const page = arg('--page', 'bake-biped').replace(/[^a-z0-9_-]/gi, '');
const query = arg('--query', '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'POST' && url.pathname === '/__bake-output') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    await fsp.mkdir(path.dirname(outFile), { recursive: true });
    await fsp.writeFile(outFile, Buffer.concat(chunks));
    res.writeHead(200); res.end('ok');
    return;
  }
  try {
    const file = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    const body = await fsp.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const userDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'remake-bake-'));
// With __COMPAT_LAYER set (it is on this laptop) Edge relaunches itself without it and the process we spawn exits
// at once, so waiting for it or killing it misses the real browser. Leave it out, as Edge's relaunch does.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.toUpperCase() !== '__COMPAT_LAYER'));
const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--use-angle=d3d11', 'about:blank'], { stdio: 'ignore', env });
const exited = new Promise(r => proc.once('exit', r));
let ws = null;
let id = 0;
const pending = new Map();
const handlers = [];
const send = (method, params = {}, sessionId) => {
  if (ws?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('DevTools socket closed'));
  const m = { id: ++id, method, params }; if (sessionId) m.sessionId = sessionId; ws.send(JSON.stringify(m)); return new Promise((resolve, reject) => pending.set(m.id, { resolve, reject }));
};
// Waits for a promise, but at most ms, and leaves no timer behind to hold the process open.
const within = (promise, ms) => {
  let timer;
  return Promise.race([promise, new Promise(r => { timer = setTimeout(r, ms); })]).finally(() => clearTimeout(timer));
};

// Browser.close is not enough on Windows: the browser can take a minute or more to exit after it, its helper
// processes (GPU, crashpad) can outlive it, and while any of them runs the profile folder cannot be removed.
async function stopBrowser() {
  await within(send('Browser.close').catch(() => {}), 2000);
  try { ws?.close(); } catch {}
  await within(exited, 5000);
  try { proc.kill(); } catch {}
  killProfileProcesses(EDGE, userDir);
  // A killed browser keeps its files open until it has torn down, which took up to 13 s in tests here.
  await within(exited, 15000);
  for (let i = 0; i < 40; i++) {
    try { await fsp.rm(userDir, { recursive: true, force: true }); return; } catch { await sleep(250); }
  }
  console.warn(`Could not remove ${userDir}`);
}

// Windows only: kill() reaches the browser but not its helpers, so stop every process of this browser that was
// started with this run's profile folder.
function killProfileProcesses(exe, dir) {
  if (process.platform !== 'win32') return;
  const ps = `Get-CimInstance Win32_Process -Filter "Name='${path.basename(exe)}'" | Where-Object { $_.CommandLine -like '*${path.basename(dir)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
  try { spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore', timeout: 20000 }); } catch {}
}

let status = null;
try {
  const portFile = path.join(userDir, 'DevToolsActivePort');
  for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await sleep(100);
  let lines = [];
  for (let i = 0; i < 50; i++) { lines = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/); if (lines.length >= 2) break; await sleep(100); }
  ws = new WebSocket(`ws://127.0.0.1:${lines[0]}${lines[1]}`);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', ev => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
    if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
    else if (msg.method) handlers.forEach(h => h(msg));
  });
  // A dropped socket (the browser closing or crashing) fails the calls it will never answer instead of leaving them waiting.
  ws.addEventListener('close', () => { for (const { reject } of pending.values()) reject(new Error('DevTools socket closed')); pending.clear(); });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  handlers.push(msg => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled') console.log(`[page ${msg.params.type}]`, msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    if (msg.method === 'Runtime.exceptionThrown') console.log('[page exception]', msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  });
  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/remake/tools/bake/${page}.html${query ? `?${query}` : ''}` }, sessionId);
  const finished = s => s === 'done' || String(s).startsWith('error');
  for (let i = 0; i < 1200 && !finished(status); i++) {
    await sleep(250);
    try { status = (await send('Runtime.evaluate', { expression: 'window.__bakeStatus || null', returnByValue: true }, sessionId)).result.value; } catch { status = null; }
  }
} finally {
  await stopBrowser();
  server.close();
}
console.log(`status: ${status || 'timeout'}`);
if (status === 'done') console.log(`wrote ${path.relative(ROOT, outFile).replaceAll('\\', '/')} (${fs.statSync(outFile).size} bytes)`);
else process.exitCode = 1;
