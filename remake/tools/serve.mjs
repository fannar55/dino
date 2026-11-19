#!/usr/bin/env node
// Static server for the remake. Serves the repo root so the page can reach dist/vendor and dist/assets.
//
//   node remake/tools/serve.mjs            -> http://127.0.0.1:4190/remake/
//   node remake/tools/serve.mjs --lan      -> also reachable from a tablet on the same Wi-Fi
//   node remake/tools/serve.mjs --port 8080
//
// It answers byte-range requests, as any real host does. A browser moves about in a sound or video by asking for ranges of the
// file: from a server that gives none, the theme (assets/audio/theme.mp3) cannot be moved to where the game's clock is, and
// Safari will not play it. The book's eight educational videos (/myndbond/<id>.mp4, served from R2 in the cloud) are streamed
// here from ../myndband-gramedla/out/ (or <root>/myndbond/ when present).
//
// It is also Fjölspil's meeting point at home (spec §9.1): the WebSocket at /fjolspil/ws/<code> is tools/fjolspil-server.mjs,
// and with --lan the phone page's addresses are printed too, as the host's QR code carries them.
//
// It also files the game's bug reports (engine/villa): POST /villa with { report, files } writes qa/villur/<time>-<chapter>/ with
// skyrsla.json (the report, with this checkout's commit added), skjaskot.jpg, merkt.jpg and spjold.html, and answers { folder }.
// qa/ is outside git. A report over REPORT_LIMIT bytes is refused (413), one that is not { report, files } too (400). GET /villa
// answers 204 with X-Villa: 1, which is how the tool learns that this server is there before it sends (the cloud has no /villa).

import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { attachFjolspil, lanJoinUrls } from './fjolspil-server.mjs';
import { folderName } from '../engine/villa/skyrsla.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VIDEOS_OUT = path.resolve(ROOT, '../myndband-gramedla/out');
const VIDEO_FILES = {
  'heimur.mp4': 'heimur-2.mp4',
  'grannar.mp4': 'grannar-sfx.mp4',
  'thorsedla.mp4': 'thorsedla-sfx.mp4',
  'gramedla.mp4': 'gramedla-hljod.mp4',
  'landrek.mp4': 'landrek.mp4',
  'fuglar.mp4': 'fuglar-sfx.mp4',
  'raf.mp4': 'raf-sfx.mp4',
  'steinn.mp4': 'steinn-sfx.mp4',
};
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

const REPORTS = 'qa/villur'; // where the bug reports land: one folder each, under the repo root, outside git
const REPORT_LIMIT = 25 * 1024 * 1024; // bytes of one report: two PNGs of the frame, the layers page and the JSON
// The files a report may bring, and nothing else: the pictures as JPEG (PNG from an older page still taken), the layers page as text.
const REPORT_FILES = { 'skjaskot.jpg': 'jpeg', 'merkt.jpg': 'jpeg', 'skjaskot.png': 'png', 'merkt.png': 'png', 'spjold.html': 'text' };

/** Resolves a `/myndbond/<name>.mp4` path to `<root>/myndbond/<name>.mp4` if there, or `videosDir/<mapped>.mp4`. */
function resolveVideo(pathname, root, videosDir) {
  const match = /^\/myndbond\/([a-z0-9-]+\.mp4)$/.exec(pathname);
  if (!match) return null;
  const inRoot = path.join(root, 'myndbond', match[1]);
  if (fs.existsSync(inRoot)) return inRoot;
  const mapped = VIDEO_FILES[match[1]] ?? match[1];
  return path.join(videosDir, mapped);
}

/**
 * Answers one request (exported so a test can run it on a server of its own, with a `root` and a `reportLimit` of its own):
 * POST /villa files a bug report; `/myndbond/<id>.mp4` streams an educational video; anything else is a file under the root.
 */
export async function handle(req, res, { root = ROOT, videosDir = VIDEOS_OUT, reportLimit = REPORT_LIMIT } = {}) {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/villa') {
      if (req.method === 'POST') { await saveReport(req, res, { root, reportLimit }); return; }
      if (req.method === 'GET' || req.method === 'HEAD') { res.writeHead(204, { 'X-Villa': '1', 'Cache-Control': 'no-store' }); res.end(); return; } // "I am here"
    }
    if (url.pathname === '/') { res.writeHead(302, { Location: `/remake/${url.search}` }); res.end(); return; }
    const videoFile = resolveVideo(decodeURIComponent(url.pathname), root, videosDir);
    const file = videoFile ?? path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!videoFile && file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const stat = await fsp.stat(file);
    const target = stat.isDirectory() ? path.join(file, 'index.html') : file;
    const size = (target === file ? stat : await fsp.stat(target)).size;
    const headers = { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes' };
    const head = req.method === 'HEAD';
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || ''); // bytes=a-b, bytes=a- (to the end), bytes=-n (the last n)
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); res.end(); return; }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
      if (head) { res.end(); return; }
      fs.createReadStream(target, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': size });
    if (head) { res.end(); return; }
    fs.createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404); res.end('not found');
  }
}

/** Says `text` with `status`; the body of a refusal is a plain sentence. */
function answer(res, status, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(text);
}

/** The request's body, whole; over `limit` bytes it is read to the end and refused with a 413. */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0, over = false;
    req.on('data', chunk => {
      if (over) return;
      size += chunk.length;
      if (size > limit) { over = true; chunks.length = 0; return; }
      chunks.push(chunk);
    });
    req.on('end', () => (over ? reject(Object.assign(new Error(`the report is over ${limit} bytes`), { status: 413 })) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}

/** This checkout's commit and refs, { commit, refs }, or null where git does not answer (a root that is no repository). */
function gitInfo(root) {
  return new Promise(resolve => {
    execFile('git', ['-C', root, 'log', '-1', '--format=%h %D'], { timeout: 3000, windowsHide: true }, (error, stdout) => {
      if (error || !stdout.trim()) { resolve(null); return; }
      const [commit, ...refs] = stdout.trim().split(' ');
      resolve({ commit, refs: refs.join(' ') });
    });
  });
}

/**
 * Files one bug report from the game (engine/villa/villa.js): { report, files } -> qa/villur/<time>-<chapter>/ with skyrsla.json
 * (the report, this checkout's build and where it was filed added), and the files of REPORT_FILES that came (PNGs as data URLs,
 * the layers page as text). Answers { folder } (root-relative, forward slashes). A second report in the same second gets -2.
 */
async function saveReport(req, res, { root, reportLimit }) {
  let body;
  try {
    body = await readBody(req, reportLimit);
  } catch (error) {
    answer(res, error.status ?? 400, error.message);
    return;
  }
  let sent;
  try {
    sent = JSON.parse(body.toString('utf8'));
  } catch {
    answer(res, 400, 'the report is not JSON');
    return;
  }
  if (!sent || typeof sent !== 'object' || !sent.report || typeof sent.report !== 'object' || !sent.files || typeof sent.files !== 'object') {
    answer(res, 400, 'a report is { report, files }');
    return;
  }
  const now = new Date();
  const name = folderName(now, sent.report.chapter?.id);
  let folder = path.join(root, REPORTS, name);
  for (let n = 2; fs.existsSync(folder); n++) folder = path.join(root, REPORTS, `${name}-${n}`);
  await fsp.mkdir(folder, { recursive: true });
  const saved = { folder: path.relative(root, folder).split(path.sep).join('/'), at: now.toISOString() };
  const report = { ...sent.report, build: await gitInfo(root), saved };
  await fsp.writeFile(path.join(folder, 'skyrsla.json'), `${JSON.stringify(report, null, 2)}\n`);
  for (const [file, kind] of Object.entries(REPORT_FILES)) {
    const value = sent.files[file];
    if (typeof value !== 'string') continue;
    if (kind === 'png' || kind === 'jpeg') {
      const match = new RegExp(`^data:image/${kind};base64,([A-Za-z0-9+/=]+)$`).exec(value);
      if (match) await fsp.writeFile(path.join(folder, file), Buffer.from(match[1], 'base64'));
    } else {
      await fsp.writeFile(path.join(folder, file), value);
    }
  }
  answer(res, 200, JSON.stringify({ folder: saved.folder }), 'application/json');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const lan = args.includes('--lan');
  const portArg = args.indexOf('--port');
  const port = portArg >= 0 ? Number(args[portArg + 1]) : 4190;
  const server = http.createServer(handle);
  attachFjolspil(server, { join: () => lan ? lanJoinUrls(port) : [] });
  server.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
    console.log(`Mosi remake: http://127.0.0.1:${port}/remake/`);
    if (lan) {
      for (const nets of Object.values(os.networkInterfaces())) {
        for (const n of nets || []) if (n.family === 'IPv4' && !n.internal) console.log(`On your tablet: http://${n.address}:${port}/remake/`);
      }
      for (const url of lanJoinUrls(port)) console.log(`Fjölspil: ${url}`);
    }
  });
}
