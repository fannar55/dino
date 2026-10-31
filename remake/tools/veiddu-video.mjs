#!/usr/bin/env node
// Records a whole round of "Veiddu" (remake/veiddu-lab.html, the live table) as a video, for the owner to watch.
//
//   node remake/tools/veiddu-video.mjs --out qa/remake/veiddu/round-a --seed a
//     [--size 1280x800] [--max 900] [--query "skill=0.2"] [--page remake/veiddu-lab.html] [--browser edge|chrome|<exe>]
//     [--reduced-motion] [--stall 45] [--cut 90] [--sound] [--test-line remake/assets/audio/veiddu/x.mp3@12]
//
// It serves the repo on a throwaway static server, loads <page>?auto=1&seed=<seed> at --size (the child's moves are made by bestAsk,
// after 1.2 s each; everything else plays at its real pace, so the video shows the real feel), records the page with the CDP screencast
// from the moment the game exists (the deal is in the video) until window.__veiddu.phase is 'over' (the win card shows) or --max seconds
// pass, and writes <out>/round.mp4 (15 fps, laid out by real time), <out>/end.png (the win card a few seconds in) and <out>/report.json.
// <out> is relative to the repo root (qa/ is outside git). It logs the round's length and exits 1 if any page error occurs (an exception,
// a console error, a failed load) or the round stalls (nothing changes for --stall seconds), and 2 if the tool itself breaks.
// report.json: { seed, size, finished, roundSeconds, videoSeconds, errors, warnings, stalled, final: { pairs, winners, asks, fishes,
// log }, phaseSeconds, video, sound }. The page is served from the repo root; nothing is left running.
//
// --cut <seconds> records only that long and stops there, cleanly (a short clip: not finishing the round is then no failure).
//
// --sound puts the page's sound in round.mp4 (AAC), which is otherwise silent. The browser still plays to no speakers; the tool listens
// to the page instead. Before the page loads it is patched (soundTap below): every connection to a context's destination also goes to
// a MediaStreamAudioDestinationNode of that context, which a MediaRecorder records from the moment the screencast starts; every
// HTMLMediaElement.play() is logged (its file, the time on the page's clock, its volume, and where in the file it starts), which is how
// the recorded voices play (an Audio element, outside the context). At the end the context's recording comes back to the tool, each
// logged file is fetched from the page, and ffmpeg mixes the voices over the recording at their times (adelay, volume, amix with
// normalize=0) and puts the result under the video. Picture and sound are lined up on the wall clock: the video is laid out by when the
// browser drew each frame (not when it reached the tool, 0.1 to 0.7 s later), the voices by when the page asked for them, and the
// recording by a calibration click the page lays in it only (a recorder does not say where its first sample is; the click is found in the
// recording and cut out). report.sound has contexts (what was recorded), lag (how long frames took to reach the tool: for information),
// parts (what was mixed in, and where, in seconds of video), buffers (every buffered sound the page started: its length and when it is
// heard in the video), log (when each game event happened, the same way), and volume.
// --test-line <file>@<seconds> plays that file (a path from the repo root) from the page, <seconds> after the screencast starts, as a
// stand-in for a voice: it tests the mixing path. It can be given more than once.

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
const SOUND_CHUNK = 1 << 20; // characters of a recording read back from the page in one call

function parseArgs(argv) {
  const o = { out: '', size: '1280x800', seed: 'a', max: 900, query: '', page: 'remake/veiddu-lab.html', browser: 'edge', reducedMotion: false, stall: 45, cut: 0, sound: false, testLines: [] };
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
    else if (a === '--cut') o.cut = Number(next());
    else if (a === '--sound') o.sound = true;
    else if (a === '--test-line') {
      const [file, seconds] = next().split('@');
      if (!file || !(Number(seconds) >= 0)) throw new Error('--test-line needs <file>@<seconds>');
      o.testLines.push({ file: file.replace(/\\/g, '/').replace(/^\//, ''), at: Number(seconds) });
    } else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 32).join('\n'));
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
 * The video: the screencast sends a frame only when the picture changes, so the frames are laid out by time. A clock ticks at FPS from
 * the first frame and, for every tick, writes the latest frame drawn at or before it (again, while nothing changed) to ffmpeg, which
 * reads them from its stdin and encodes round.mp4. That keeps the video at the speed the round was played, and no frames are kept on
 * disk. The time of a frame is when the browser drew it (the screencast says), not when it reached this tool, which is 0.1 to 0.7 s
 * later and not always the same: a video laid out by arrival would show every event late by that much, and could not be lined up with a
 * sound. A tick is written once a frame drawn after it is in hand (nothing can then change what it shows), and at the end up to `endAt`.
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
  const video = { received: 0, t0: null, written: 0, error: null }; // t0: when the first frame was drawn (ms, the wall clock)
  const queue = []; // the frames the clock has not passed: { jpeg, at }
  let shown = null; // the latest frame at or before the clock
  const write = endAt => {
    if (video.t0 === null) return;
    for (;;) {
      const at = video.t0 + (video.written * 1000) / FPS; // when the next picture is shown
      if (!(endAt === undefined ? queue.some(frame => frame.at > at) : at <= endAt)) return;
      while (queue.length && queue[0].at <= at) shown = queue.shift();
      ffmpeg.stdin.write(shown.jpeg);
      video.written++;
    }
  };
  return {
    video,
    frame(jpeg, at) { // a new picture from the screencast, drawn at `at` (ms)
      video.received++;
      video.t0 ??= at;
      queue.push({ jpeg, at });
      write();
    },
    async finish(endAt = Date.now()) {
      write(endAt);
      ffmpeg.stdin.end();
      const code = await within(exited, 5 * 60 * 1000);
      if (code !== 0) video.error = `ffmpeg exited with ${code}: ${stderr.slice(0, 400)}`;
      return video;
    },
  };
}

/**
 * The sound tap (--sound). Its source is sent to the page to run before anything else (Page.addScriptToEvaluateOnNewDocument), so it
 * must stand alone: nothing of this file is in reach there. It makes window.__snd:
 *   start()          begins recording every context that sounds (now, and any made later); returns the page's wall clock then
 *   stop()           ends the recordings; resolves to what was recorded: [{ index, startedAt, click, base64Length, state, sampleRate, mime }]
 *                    (click: { contextTime, at }, the calibration click laid in the recording: see calibrate)
 *   chunk(i, from, n) a piece of recording i as base64 text
 *   fetchSrc(src)    the bytes of a file the page played (an address, a blob: or data: one), as base64 text and its type
 *   plays, buffers, log   what was played from an element, started from a buffer, and happened in the game, all with the wall clock
 * "Wall clock" is performance.timeOrigin + performance.now() in ms, the same clock as Date.now() in the tool.
 */
function soundTap() {
  if (window.__snd) return;
  const clock = () => performance.timeOrigin + performance.now();
  const snd = (window.__snd = { taps: [], plays: [], buffers: [], log: [], recording: false });
  const connect = AudioNode.prototype.connect;
  const disconnect = AudioNode.prototype.disconnect;
  const tapOf = new Map(); // context -> its tap

  function begin(tap) {
    const mime = ['audio/webm;codecs=opus', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
    tap.mime = mime ?? '';
    tap.recorder = new MediaRecorder(tap.node.stream, mime ? { mimeType: mime, audioBitsPerSecond: 192000 } : undefined);
    tap.recorder.ondataavailable = event => { if (event.data.size) tap.chunks.push(event.data); };
    tap.startedAt = clock();
    tap.recorder.onstart = () => { // the recorder takes a moment to start (0.1 to 0.2 s): it is not known where its first sample is
      tap.startedAt = clock();
      calibrate(tap);
    };
    tap.recorder.start(250);
  }
  // A click goes into the recording only (never to the speakers), at a context time whose wall clock time is known: the tool finds the
  // click in the recording and so knows which moment of the page each sample is. It is cut out of the sound afterwards.
  function calibrate(tap) {
    const context = tap.context;
    const time = context.currentTime + 0.4;
    const oscillator = context.createOscillator();
    oscillator.frequency.value = 1000;
    const gain = context.createGain();
    gain.gain.value = 0.9;
    oscillator.connect(gain);
    connect.call(gain, tap.node);
    oscillator.start(time);
    oscillator.stop(time + 0.01);
    tap.click = { contextTime: time, at: clock() + (time - context.currentTime) * 1000 };
  }
  function tapFor(context) {
    let tap = tapOf.get(context);
    if (!tap) {
      tap = { context, node: context.createMediaStreamDestination(), chunks: [], recorder: null, startedAt: null, click: null, b64: '', mime: '' };
      tapOf.set(context, tap);
      snd.taps.push(tap);
      if (snd.recording) begin(tap);
    }
    return tap;
  }
  // Whatever is connected to a destination is also connected to the tap, which the recorder listens to.
  AudioNode.prototype.connect = function (destination, ...rest) {
    const result = connect.call(this, destination, ...rest);
    try {
      if (destination instanceof AudioDestinationNode && this.context instanceof AudioContext) connect.call(this, tapFor(this.context).node);
    } catch { /* the page's sound goes on without the tap */ }
    return result;
  };
  AudioNode.prototype.disconnect = function (...args) {
    const result = disconnect.apply(this, args);
    try {
      const tap = tapOf.get(this.context);
      if (tap && args[0] instanceof AudioDestinationNode) disconnect.call(this, tap.node);
    } catch { /* it was not connected to the tap */ }
    return result;
  };

  // Sounds started from a buffer, with the time they are heard (the context's own time turned into the wall clock).
  const bufferStart = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when = 0, ...rest) {
    try {
      const context = this.context;
      if (this.buffer && context instanceof AudioContext && snd.buffers.length < 50000) {
        snd.buffers.push({ at: clock() + Math.max(0, when - context.currentTime) * 1000, duration: this.buffer.duration, loop: this.loop, rate: this.playbackRate.value });
      }
    } catch { /* only a log */ }
    return bufferStart.call(this, when, ...rest);
  };

  // Sounds played from an element (the recorded voices play from Audio elements). An element routed into a context is already in that
  // context's recording and is not logged.
  const routed = new WeakSet();
  const mediaSource = AudioContext.prototype.createMediaElementSource;
  AudioContext.prototype.createMediaElementSource = function (element) {
    routed.add(element);
    return mediaSource.call(this, element);
  };
  const ids = new WeakMap();
  const idOf = element => {
    if (!ids.has(element)) ids.set(element, ids.size + 1);
    return ids.get(element);
  };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    try {
      if (!routed.has(this)) snd.plays.push({ type: 'play', id: idOf(this), src: this.currentSrc || this.src, at: clock(), volume: this.volume, muted: this.muted, from: this.currentTime });
    } catch { /* only a log */ }
    return play.apply(this, args);
  };
  const pause = HTMLMediaElement.prototype.pause;
  HTMLMediaElement.prototype.pause = function (...args) {
    try {
      if (!routed.has(this)) snd.plays.push({ type: 'pause', id: idOf(this), at: clock(), position: this.currentTime });
    } catch { /* only a log */ }
    return pause.apply(this, args);
  };
  // The files behind blob: addresses (the voice preloads its lines as blobs) stay reachable until the end.
  const blobs = new Map();
  const createObjectURL = URL.createObjectURL;
  URL.createObjectURL = function (object) {
    const url = createObjectURL.call(URL, object);
    blobs.set(url, object);
    return url;
  };

  // When each event of the game happened: the game's log is watched every 10 ms.
  let seen = 0;
  setInterval(() => {
    const log = window.__veiddu?.game?.log;
    if (!log) return;
    if (log.length < seen) seen = 0; // a new round
    for (; seen < log.length; seen++) snd.log.push({ index: seen, type: log[seen].type, seat: log[seen].seat ?? null, lucky: log[seen].lucky ?? false, at: clock() });
  }, 10);

  const toBase64 = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  snd.start = () => {
    snd.recording = true;
    for (const tap of snd.taps) if (!tap.recorder) begin(tap);
    return { at: clock(), taps: snd.taps.length };
  };
  snd.stop = async () => {
    snd.recording = false;
    const out = [];
    for (const [index, tap] of snd.taps.entries()) {
      if (tap.recorder && tap.recorder.state !== 'inactive') {
        await new Promise(resolve => { tap.recorder.onstop = resolve; tap.recorder.stop(); });
      }
      tap.b64 = tap.chunks.length ? await toBase64(new Blob(tap.chunks, { type: tap.mime || 'audio/webm' })) : '';
      out.push({ index, startedAt: tap.startedAt, click: tap.click, base64Length: tap.b64.length, state: tap.context.state, sampleRate: tap.context.sampleRate, mime: tap.mime });
    }
    return out;
  };
  snd.chunk = (index, from, length) => snd.taps[index].b64.slice(from, from + length);
  snd.fetchSrc = async src => {
    const blob = blobs.get(src) ?? (await (await fetch(src)).blob());
    return { type: blob.type, base64: await toBase64(blob) };
  };
}

/** Where, in the video, a moment of the page's wall clock (ms) is seen and heard: seconds from the video's first frame. */
const videoSecond = (at, video) => (at - video.t0) / 1000;

/** Where the calibration click starts in a recording (seconds from its first sample), or null: its first sample louder than half the click. */
function findClick(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-t', '5', '-i', file, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { maxBuffer: 1 << 26 });
  const samples = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.length / 4));
  const peak = samples.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
  if (peak < 0.3) return null;
  return samples.findIndex(x => Math.abs(x) >= peak * 0.5) / 48000;
}

/**
 * Puts the sound under the video: the context's recordings, with each voice file the page played mixed in at its time, as AAC in
 * `out` (the video is copied as it is). Returns what was mixed. Nothing here needs the browser: everything it needs is in `sound`.
 */
function muxSound({ silent, out, recordings, voices, seconds, workDir, video }) {
  const inputs = [];
  const filters = [];
  const mixed = [];
  const stereo = 'aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo';
  // a sound that began before the video did loses its beginning; one that begins after it is put off
  const place = offsetMs => (offsetMs >= 0 ? [`adelay=${Math.round(offsetMs)}:all=1`] : [`atrim=start=${(-offsetMs / 1000).toFixed(3)}`, 'asetpts=PTS-STARTPTS']);
  for (const rec of recordings) {
    const k = inputs.length + 1;
    inputs.push(rec.file);
    const offsetMs = rec.startedAt - video.t0;
    // the calibration click is cut out to the sample (aeval knows each sample's time; the volume filter's enable works by whole frames)
    const click = rec.clickAt === null ? [] : [`aeval='val(0)*not(between(t,${(rec.clickAt - 0.003).toFixed(4)},${(rec.clickAt + 0.02).toFixed(4)}))':c=same`];
    filters.push(`[${k}:a]${['asetpts=PTS-STARTPTS', ...click, stereo, ...place(offsetMs)].join(',')}[a${k}]`);
    mixed.push({ kind: 'context', file: path.basename(rec.file), offsetMs: Math.round(offsetMs), calibrated: rec.clickAt !== null, clickAt: rec.clickAt });
  }
  for (const voice of voices) {
    const k = inputs.length + 1;
    inputs.push(voice.file);
    const offsetMs = voice.at - video.t0;
    const cut = [`atrim=start=${voice.from.toFixed(3)}${voice.length === null ? '' : `:end=${(voice.from + voice.length).toFixed(3)}`}`, 'asetpts=PTS-STARTPTS'];
    filters.push(`[${k}:a]${[stereo, ...cut, `volume=${voice.volume.toFixed(3)}`, ...place(offsetMs)].join(',')}[a${k}]`);
    mixed.push({ kind: 'voice', src: voice.src, at: +videoSecond(voice.at, video).toFixed(2), from: voice.from, length: voice.length, volume: voice.volume });
  }
  const n = inputs.length;
  filters.push(`${Array.from({ length: n }, (_, i) => `[a${i + 1}]`).join('')}amix=inputs=${n}:normalize=0:duration=longest,apad=whole_dur=${seconds.toFixed(3)}[mix]`);
  const args = ['-y', '-loglevel', 'error', '-i', silent, ...inputs.flatMap(file => ['-i', file]), '-filter_complex', filters.join(';'),
    '-map', '0:v', '-map', '[mix]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', seconds.toFixed(3), out];
  const result = spawnSync('ffmpeg', args, { encoding: 'utf8', cwd: workDir });
  if (result.status !== 0) throw new Error(`ffmpeg could not mix the sound: ${String(result.stderr).slice(0, 600)}`);
  return mixed;
}

/** How loud the finished track is, by ffmpeg's volumedetect: { mean, max } in dB, or null. */
function loudness(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const mean = /mean_volume: (-?[\d.]+) dB/.exec(r.stderr);
  const max = /max_volume: (-?[\d.]+) dB/.exec(r.stderr);
  return mean && max ? { mean: Number(mean[1]), max: Number(max[1]) } : null;
}

const median = values => (values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : 0);
const EXTENSIONS = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/webm': 'webm' };

/**
 * Ends the page's recordings and brings back what the tap saw (see soundTap): the recordings are written beside the video as
 * sound-context-<n>.webm, the files the page played from elements are fetched into `workDir`, and the logs come back as they are.
 */
async function collectSound(ev, workDir, outDir) {
  const summary = await ev('window.__snd.stop()');
  const logs = await ev('({ plays: window.__snd.plays, buffers: window.__snd.buffers, log: window.__snd.log })');
  const recordings = [];
  for (const rec of summary) {
    if (!rec.base64Length) continue;
    let base64 = '';
    for (let from = 0; from < rec.base64Length; from += SOUND_CHUNK) base64 += await ev(`window.__snd.chunk(${rec.index}, ${from}, ${SOUND_CHUNK})`);
    const file = path.join(outDir, `sound-context-${rec.index}.webm`);
    await fsp.writeFile(file, Buffer.from(base64, 'base64'));
    recordings.push({ file, startedAt: rec.startedAt, click: rec.click });
  }
  // What was played from elements: each play, up to the pause that cut it, if one came.
  const voices = [];
  const playing = new Map();
  for (const event of logs.plays) {
    if (event.type === 'play') {
      const voice = { ...event, length: null, file: null };
      voices.push(voice);
      playing.set(event.id, voice);
    } else if (playing.has(event.id)) {
      const voice = playing.get(event.id);
      voice.length = Math.max(0, (event.at - voice.at) / 1000);
      playing.delete(event.id);
    }
  }
  const fetched = new Map();
  for (const voice of voices) {
    if (voice.muted || !(voice.volume > 0)) continue;
    if (!fetched.has(voice.src)) {
      const got = await ev(`window.__snd.fetchSrc(${JSON.stringify(voice.src)})`).catch(() => null);
      if (got?.base64) {
        const file = path.join(workDir, `voice-${fetched.size + 1}.${EXTENSIONS[got.type] ?? 'bin'}`);
        await fsp.writeFile(file, Buffer.from(got.base64, 'base64'));
        fetched.set(voice.src, file);
      } else fetched.set(voice.src, null);
    }
    voice.file = fetched.get(voice.src);
  }
  return { summary, recordings, voices, buffers: logs.buffers, log: logs.log };
}

/** Puts the sound `collectSound` brought under the video in `silent`, as `out`. Returns what report.sound gets. */
function mixSound(sound, video, lagSamples, silent, out, workDir) {
  // lagSamples are only for the report: how long after it was drawn each frame reached the tool (the video is laid out by when it was drawn)
  if (!sound) throw new Error('the page gave no sound');
  if (!sound.recordings.length) throw new Error(`nothing was recorded from the page (contexts: ${JSON.stringify(sound.summary)})`);
  const spread = [...lagSamples].sort((a, b) => a - b);
  // Each recording: where the click is in it says which moment of the page its first sample is (the recorder's own start is not exact).
  const recordings = sound.recordings.map(rec => {
    const clickAt = rec.click ? findClick(rec.file) : null;
    return { ...rec, clickAt, startedAt: clickAt === null ? rec.startedAt : rec.click.at - clickAt * 1000 };
  });
  const parts = muxSound({ silent, out, recordings, voices: sound.voices.filter(voice => voice.file), seconds: video.written / FPS, workDir, video });
  const at = ms => +videoSecond(ms, video).toFixed(3);
  return {
    contexts: sound.summary.map(({ index, state, sampleRate, mime, base64Length }) => ({ index, state, sampleRate, mime, bytes: Math.round(base64Length * 0.75) })),
    lag: { frames: spread.length, median: Math.round(median(lagSamples)), p10: Math.round(spread[Math.floor(spread.length * 0.1)] ?? 0), p90: Math.round(spread[Math.floor(spread.length * 0.9)] ?? 0), max: Math.round(spread.at(-1) ?? 0) },
    parts,
    unplayed: sound.voices.filter(voice => !voice.file).map(voice => voice.src),
    buffers: sound.buffers.map(({ at: ms, duration, loop, rate }) => ({ at: at(ms), duration: +duration.toFixed(3), loop, rate })),
    log: sound.log.map(({ index, type, seat, lucky, at: ms }) => ({ index, type, seat, lucky, at: at(ms) })),
    volume: loudness(out),
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
  const finalFile = path.join(outDir, 'round.mp4');
  const videoFile = o.sound ? path.join(outDir, 'round-silent.mp4') : finalFile; // with --sound the picture is made first and the sound put under it
  const workDir = o.sound ? await fsp.mkdtemp(path.join(os.tmpdir(), 'veiddu-sound-')) : null;
  const recorder = startVideo(videoFile, o.width, o.height);
  const lagSamples = []; // how long after it was drawn each screencast frame reached the tool (ms)
  let sound = null; // what the page's sound tap gave back: { summary, files, plays, buffers, log }
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
        if (o.sound && msg.params.metadata?.timestamp) lagSamples.push(Date.now() - msg.params.metadata.timestamp * 1000);
        recorder.frame(Buffer.from(msg.params.data, 'base64'), msg.params.metadata?.timestamp ? msg.params.metadata.timestamp * 1000 : Date.now());
        send('Page.screencastFrameAck', { sessionId: msg.params.sessionId }).catch(() => {});
      }
    });
    await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
    if (o.sound) await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${soundTap.toString()})()` });
    const phone = o.width < 768 || o.height < 500; // (a phone held sideways, 844x390, is a phone too: touch and the mobile media features)
    await send('Emulation.setDeviceMetricsOverride', { width: o.width, height: o.height, deviceScaleFactor: 1, mobile: phone });
    if (phone) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (o.reducedMotion) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const ev = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };

    const t0 = Date.now();
    await send('Page.navigate', { url });
    for (let n = 0; n < 2400; n++) { // up to 2 minutes for the page to load
      if (await ev('typeof window.__veiddu === "object"').catch(() => false)) break;
      await sleep(50);
    }
    if (!(await ev('typeof window.__veiddu === "object"').catch(() => false))) throw new Error('The page never made window.__veiddu');
    // The screencast starts the moment the game exists (its first deal begins a moment later), so the deal is in the video.
    await send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: o.width, maxHeight: o.height, everyNthFrame: 1 });
    const dealAt = Date.now();
    if (o.sound) {
      const started = await ev('window.__snd.start()');
      report.sound = { startedAt: started.at, contextsAtStart: started.taps };
      if (o.testLines.length) { // stand-ins for voices: plain Audio elements, as the table's voice plays its lines
        const lines = o.testLines.map(line => ({ url: `http://127.0.0.1:${server.address().port}/${line.file}`, at: line.at }));
        await ev(`${JSON.stringify(lines)}.forEach(line => setTimeout(() => new Audio(line.url).play().catch(error => console.warn('test line:', error.message)), line.at * 1000))`);
      }
    }
    report.gpu = await ev(`(() => { const gl = document.createElement('canvas').getContext('webgl2'); if (!gl) return 'no webgl2'; const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })()`).catch(e => `error: ${e.message}`);
    console.log(`[0.0] game is up (page load ${((dealAt - t0) / 1000).toFixed(1)} s), seed ${o.seed}, ${o.size}`);

    // The round: poll the game's phase until it is over; a round that stops changing is a stall.
    let last = { phase: null, log: -1 };
    let changedAt = Date.now();
    let overAt = null;
    const seen = {};
    let polled = Date.now();
    let beat = Date.now();
    const limitMs = (o.cut || o.max) * 1000;
    while (Date.now() - dealAt < limitMs) {
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
    if (o.cut && !overAt && !report.stalled && Date.now() - dealAt >= limitMs) report.cut = o.cut;
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
    if (o.sound) sound = await collectSound(ev, workDir, outDir).catch(e => { errors.push(`sound: ${e.message}`.slice(0, 600)); return null; });
    await send('Page.stopScreencast').catch(() => {});
  } catch (e) {
    fatal = e;
    errors.push(`driver: ${e.stack || e.message}`.slice(0, 900));
  } finally {
    report.video = await recorder.finish();
    if (o.sound && !report.video.error) {
      try {
        Object.assign(report.sound, mixSound(sound, recorder.video, lagSamples, videoFile, finalFile, workDir));
      } catch (e) {
        errors.push(`sound: ${e.message}`.slice(0, 700));
      }
      if (!fs.existsSync(finalFile) && fs.existsSync(videoFile)) fs.copyFileSync(videoFile, finalFile); // no sound: the silent picture is still the round
      if (fs.existsSync(finalFile)) fs.rmSync(videoFile, { force: true });
    }
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
    if (!report.video.error && fs.existsSync(finalFile)) {
      report.video = { file: path.relative(ROOT, finalFile).replace(/\\/g, '/'), bytes: fs.statSync(finalFile).size, frames: report.video.written, received: report.video.received, fps: FPS };
      report.videoSeconds = +(report.video.frames / FPS).toFixed(1);
    }
    report.finishedAt = new Date().toISOString();
    await stopBrowser(browser);
    server.close();
    await fsp.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  }
  const r = report;
  console.log(`${r.finished ? 'FINISHED' : r.cut ? `CUT at ${r.cut} s` : 'NOT FINISHED'} seed ${o.seed} ${o.size}: round ${r.roundSeconds ?? '-'} s (${r.roundSeconds ? (r.roundSeconds / 60).toFixed(1) : '-'} min), ${r.errors.length} errors, ${r.warnings.length} warnings${r.stalled ? `, STALLED in ${r.stalled.phase} at ${r.stalled.at} s` : ''}`);
  if (r.final) console.log(`Final: pairs ${JSON.stringify(r.final.pairs)}, winners ${JSON.stringify(r.final.winners)}, asks ${JSON.stringify(r.final.asks)}, fishes ${JSON.stringify(r.final.fishes)}, lucky ${r.final.lucky}, noes ${r.final.noes}, card "${r.final.title}", sticker ${r.final.sticker}`);
  console.log(`Seconds in each phase: ${JSON.stringify(r.phaseSeconds)}`);
  if (r.sound?.volume) console.log(`Sound: ${r.sound.parts.length} part(s) mixed (${r.sound.parts.filter(part => part.kind === 'voice').length} voices), frames reached the tool ${r.sound.lag.median} ms after they were drawn (90% within ${r.sound.lag.p90}), click ${r.sound.parts[0]?.calibrated ? 'found' : 'NOT found'}, mean ${r.sound.volume.mean} dB, max ${r.sound.volume.max} dB`);
  else if (r.sound) console.log('Sound: none was recorded');
  if (r.video?.file) console.log(`Video: ${r.video.file} (${r.videoSeconds} s, ${(r.video.bytes / 1e6).toFixed(1)} MB, ${r.video.received} screencast frames)`);
  else console.log(`Video: none${r.video?.error ? ` (${r.video.error})` : ''}`);
  for (const e of r.errors.slice(0, 10)) console.log(`  error: ${e}`);
  for (const w of [...new Set(r.warnings)].slice(0, 5)) console.log(`  warning: ${w}`);
  console.log(`GPU: ${r.gpu}`);
  console.log(`Report: ${path.relative(ROOT, path.join(outDir, 'report.json')).replace(/\\/g, '/')}`);
  if (fatal || (!r.finished && !r.cut) || r.errors.length || r.stalled) process.exitCode = fatal ? 2 : 1;
}

main().catch(e => { console.error(e); process.exit(2); });
