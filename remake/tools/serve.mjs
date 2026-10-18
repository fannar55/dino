#!/usr/bin/env node
// Static server for the remake. Serves the repo root so the page can reach dist/vendor and dist/assets.
//
//   node remake/tools/serve.mjs            -> http://127.0.0.1:4190/remake/
//   node remake/tools/serve.mjs --lan      -> also reachable from a tablet on the same Wi-Fi
//   node remake/tools/serve.mjs --port 8080
//
// It answers byte-range requests, as any real host does. A browser moves about in a sound by asking for ranges of the file: from a
// server that gives none, the theme (assets/audio/theme.mp3) cannot be moved to where the game's clock is, and Safari will not play it.

import http from 'node:http';
import os from 'node:os';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

/** Answers one request (exported so a test can run it on a server of its own). */
export async function handle(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') { res.writeHead(302, { Location: '/remake/' }); res.end(); return; }
    const file = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
    const stat = await fsp.stat(file);
    const target = stat.isDirectory() ? path.join(file, 'index.html') : file;
    const body = await fsp.readFile(target);
    const headers = { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || ''); // bytes=a-b, bytes=a- (to the end), bytes=-n (the last n)
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
      if (start >= body.length || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${body.length}` }); res.end(); return; }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Content-Length': end - start + 1 });
      res.end(body.subarray(start, end + 1));
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': body.length });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const lan = args.includes('--lan');
  const portArg = args.indexOf('--port');
  const port = portArg >= 0 ? Number(args[portArg + 1]) : 4190;
  http.createServer(handle).listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
    console.log(`Mosi remake: http://127.0.0.1:${port}/remake/`);
    if (lan) {
      for (const nets of Object.values(os.networkInterfaces())) {
        for (const n of nets || []) if (n.family === 'IPv4' && !n.internal) console.log(`On your tablet: http://${n.address}:${port}/remake/`);
      }
    }
  });
}
