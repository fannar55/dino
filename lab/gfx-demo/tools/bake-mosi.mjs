#!/usr/bin/env node
// Runs tools/bake/bake-mosi.html in headless Edge and writes the baked GLB it uploads.
//
//   node lab/gfx-demo/tools/bake-mosi.mjs [--out qa/gfx-demo/bake/triceratops.glb] [--query "fit=blend&tex=1024"]
//
// The page loads the Tripo export (lab/gfx-demo/assets/tripo/triceratops.glb) and the current game model
// (dist/assets/dinosaurs/triceratops.glb) for bone names, rest orientations, size and clip timing.

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const args = process.argv.slice(2);
const arg = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const outFile = path.resolve(ROOT, arg('--out', 'qa/gfx-demo/bake/triceratops.glb'));
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

const userDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'gfxbake-'));
const proc = spawn(EDGE, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--use-angle=d3d11', 'about:blank'], { stdio: 'ignore' });
const portFile = path.join(userDir, 'DevToolsActivePort');
for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await sleep(100);
let lines = [];
for (let i = 0; i < 50; i++) { lines = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/); if (lines.length >= 2) break; await sleep(100); }
const ws = new WebSocket(`ws://127.0.0.1:${lines[0]}${lines[1]}`);
await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
let id = 0;
const pending = new Map();
const handlers = [];
ws.addEventListener('message', ev => {
  const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
  if (msg.id && pending.has(msg.id)) { const { resolve, reject } = pending.get(msg.id); pending.delete(msg.id); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); }
  else if (msg.method) handlers.forEach(h => h(msg));
});
const send = (method, params = {}, sessionId) => { const m = { id: ++id, method, params }; if (sessionId) m.sessionId = sessionId; ws.send(JSON.stringify(m)); return new Promise((resolve, reject) => pending.set(m.id, { resolve, reject })); };

let status = null;
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  handlers.push(msg => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.consoleAPICalled') console.log(`[page ${msg.params.type}]`, msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    if (msg.method === 'Runtime.exceptionThrown') console.log('[page exception]', msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  });
  await send('Runtime.enable', {}, sessionId);
  await send('Page.enable', {}, sessionId);
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/lab/gfx-demo/tools/bake/bake-mosi.html${query ? `?${query}` : ''}` }, sessionId);
  for (let i = 0; i < 600 && !status; i++) {
    await sleep(250);
    try { status = (await send('Runtime.evaluate', { expression: 'window.__bakeStatus || null', returnByValue: true }, sessionId)).result.value; } catch { status = null; }
  }
} finally {
  try { await send('Browser.close'); } catch {}
  try { ws.close(); } catch {}
  await sleep(300);
  try { proc.kill(); } catch {}
  server.close();
  for (let i = 0; i < 10; i++) { try { await fsp.rm(userDir, { recursive: true, force: true }); break; } catch { await sleep(300); } }
}
console.log(`status: ${status || 'timeout'}`);
if (status === 'done') console.log(`wrote ${path.relative(ROOT, outFile).replaceAll('\\', '/')} (${fs.statSync(outFile).size} bytes)`);
else process.exitCode = 1;
