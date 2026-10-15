#!/usr/bin/env node
// Runs a bake page from remake/tools/bake/ in headless Edge and writes the GLB it uploads.
//
//   node remake/tools/bake/bake-character.mjs --page bake-biped --out remake/assets/characters/egill.glb
//     [--query "src=../../assets/characters/source/egill-parts.glb&height=1.1&yaw=90&name=Egill"]
//     [--timeout 300]   seconds to wait for the page (a busy machine bakes slower)
//
// The page reads its options from the query, posts the finished GLB to /__bake-output and sets
// window.__bakeStatus to 'done' (or an error message).

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
const outFile = path.resolve(ROOT, arg('--out', 'qa/remake/bake/character.glb'));
const page = arg('--page', 'bake-biped').replace(/[^a-z0-9_-]/gi, '');
const query = arg('--query', '');
const timeout = Number(arg('--timeout', 300));
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
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/remake/tools/bake/${page}.html${query ? `?${query}` : ''}` }, sessionId);
  const finished = s => s === 'done' || String(s).startsWith('error');
  for (let i = 0; i < timeout * 4 && !finished(status); i++) {
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
