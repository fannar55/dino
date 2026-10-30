#!/usr/bin/env node
// Plays a round of "Hvar er vinur minn?" (remake/minnisspil.html) in headless Edge, the way a child does:
// through the real buttons on the page (leaves, the glowing obstacle, the "who" bubbles in #who, the big tap-along
// target), with window.__memory only used to read the state back (and, in rapid mode, to hammer its ask/choose/tap
// paths during scripts). It takes screenshots at the milestones, optionally records the screen as an mp4 and writes a report.
//
//   node remake/tools/memory-playthrough.mjs --out qa/memory/lifandi/t0 [--video]
//     [--size 1280x800] [--mode full|branch|first-minute|rapid|glade] [--reduced-motion] [--no-tap-along] [--usual-order] [--clearance]
//     [--seed 251025] [--query "a=1&b=2"] [--page remake/minnisspil.html] [--browser edge|chrome|<exe>]
//     [--limit 25]            minutes before the run gives up
//
//   full          the whole round: a first reveal, one mismatch, the three pairs (Þríhyrnur first, so the branch has a wrong
//                 friend to pick), the branch (after ~5 s of waiting for the gold arrow, one wrong pick, then the right one and
//                 three taps in the hero shot), then the Kambeðlur, the log (one wrong pick, the Kambeðlur, then the Þríhyrnur and
//                 three taps on "Einn, tveir, ÝTA!"), the crossing, the bark (one wrong pick, the Þórseðlur, then the Kambeðlur
//                 and a tap on each of the three panels) and the grove. The two surprise leaves are opened as well, one before
//                 the first pair and one before the last (report.surprises).
//   branch        like full, but stops when the branch is up and the camera is back on the glade.
//   first-minute  stops when the first pair is matched and its friends have walked home.
//   rapid         like full, but at every step it taps the right button three times in a row and then every other
//                 enabled button three times as well, and while a script runs it keeps tapping every leaf, obstacle and
//                 bubble, the way a six-year-old does. The round must still finish.
//   glade         only the search view: the glade picture and its measurement (report.glade), then stops.
//   --no-tap-along  never taps in a tap-along wait, so the friends finish on their own ("Við gerum þetta saman!").
//   --usual-order   the story modes go to the log as soon as the Þríhyrnur can roll it, before the Kambeðlur are found
//                   (no wrong friend at the log then, and the crossing waits for the last pair).
//   --clearance     while the marsh is laid, the walk to the grove runs or a wrong friend has a go, measures the clearance between the animated bodies (the
//                   game's own anatomical envelopes) every 300 ms; report.clearance has the worst overlaps per moment
//                   (it slows the game down a little, so use it for a check run, not for timings).
//
// <out> is relative to the repo root. It gets NN-name.png at the milestones, report.json, and with --video the
// frames/00001.jpg ..., frames.txt and round.mp4 (CDP screencast, laid out by real time, 15 fps). Without --video the
// game is paused for each milestone picture (report.pauseHolds says nothing moved meanwhile); with --video a milestone
// is the screencast's frame at that instant (NN-name.jpg, 960 px), so the video keeps real time.
// report.json: { errors, steps, timeline, perf, render: { drawCalls, triangles }, glade, gladeAfter, gladeDrift, surprises, who, marks, ... }.
// `who` measures the bubbles the first time they open (each portrait's on-screen size); `marks` are named moments with
// their time into round.mp4 (branch-start / log-start / bark-start: the first tap on the obstacle, branch-end / log-end: the
// cheer, bark-end: the third panel is down).
// `timelineCheck` reads the page's own timeline: the crossing (Mosi's first step onto the deck, the arrival, input back,
// and the seconds between), the marsh (the first tap on the bark, the lay's start, the third panel down, the boardwalk
// built), the walk to the grove (Mosi's first step, all six arrived, the seconds between, the watch after) and the
// longest stretches of watching (a script, a task or a wrong friend's go running) with no new camera framing and no tap,
// with where they fall; with --video each moment also has its time in round.mp4. `takes` lists every camera framing's
// most triangles and draw calls (the shot, what was going on), the heaviest first.
// `surprises` lists each surprise leaf the driver opened: { id, item, at (s) }; `found` and `basketEnd` say what the rules
// and the basket in the ribbon held at the end.
// `steps` are the driver's actions with the wall-clock seconds since launch; `timeline` is what the page itself went
// through (caption, phase, bridge, camera and scripted shot, work button), sampled every 100 ms inside the page.
// `glade` measures the search view (each baby's on-screen height, Mosi, leaves, homes); after the first pair,
// `gladeDrift` is how far that view moved (camera and leaf pixels; 0 means the match script glided back exactly).
// The flow is driven by what the page shows (state-driven), so later chapters change the driver where the flow changes.
// The page is served from the repo root by a throwaway static server on a free port; nothing is left running.

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
  '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};
const MODES = ['full', 'branch', 'first-minute', 'rapid', 'glade'];
// The one pair that can do each obstacle (the game's BRIDGE_OBSTACLES), so the driver can pick right or wrong.
const RIGHT = { branch: 'brontosaurus', log: 'triceratops', bark: 'stegosaurus' };
const VIDEO_FPS = 15;

function parseArgs(argv) {
  const o = { out: '', size: '1280x800', mode: 'full', reducedMotion: false, video: false, seed: '251025', query: '',
    page: 'remake/minnisspil.html', browser: 'edge', limit: 25, tapAlong: true, usualOrder: false, clearance: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--out') o.out = next();
    else if (a === '--size') o.size = next();
    else if (a === '--mode') o.mode = next();
    else if (a === '--reduced-motion') o.reducedMotion = true;
    else if (a === '--video') o.video = true;
    else if (a === '--no-tap-along') o.tapAlong = false;
    else if (a === '--usual-order') o.usualOrder = true;
    else if (a === '--clearance') o.clearance = true;
    else if (a === '--seed') o.seed = next();
    else if (a === '--query') o.query = next();
    else if (a === '--page') o.page = next();
    else if (a === '--browser') o.browser = next();
    else if (a === '--limit') o.limit = Number(next());
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 45).map(l => l.replace(/^\/\/ ?/, '')).join('\n'));
      process.exit(0);
    } else throw new Error(`Unknown argument ${a}`);
  }
  if (!o.out) throw new Error('--out <dir> is required');
  if (!MODES.includes(o.mode)) throw new Error(`--mode must be one of ${MODES.join(', ')}`);
  const m = /^(\d+)x(\d+)$/.exec(o.size);
  if (!m) throw new Error('--size must look like 1280x800');
  o.width = Number(m[1]); o.height = Number(m[2]);
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
      if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
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
  const userDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'memplay-'));
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

// Runs inside the page: caption, phase, bridge, camera and work-button changes with the page's own clock, plus the
// largest draw-call and triangle counts seen. Reads window.__demoStats (the world's own per-frame debug copy).
// `take` counts every new framing the camera director put on screen (a shot, cut or glide, and each way back);
// `act` is the adventure's own action and phase; `mosi` is 'walk' or 'deck' while Mosi crosses. Every button the
// child (the driver) clicks is logged with the same clock in window.__taps; window.__origin turns that clock into
// wall-clock time (for the video).
const TIMELINE_JS = `(() => {
  window.__tl = []; window.__max = { drawCalls: 0, triangles: 0 }; window.__takes = {}; let last = '';
  window.__taps = []; window.__origin = performance.timeOrigin;
  document.addEventListener('click', event => {
    const button = event.target.closest && event.target.closest('button'); if (!button) return;
    window.__taps.push({ t: +(performance.now() / 1000).toFixed(2), key: button.dataset.target || (button.dataset.species ? 'who-' + button.dataset.species : button.id || 'button') });
  }, true);
  // Frame times while a script runs (shots re-solve, gestures, dashes), apart from the idle sample at the end.
  window.__scenePerf = []; let previous = 0;
  const tick = now => { const d = window.__demoStats; if (previous && d && d.scene && d.scene.busy) window.__scenePerf.push(now - previous); previous = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  setInterval(() => {
    const m = window.__memory; if (!m) return;
    const d = window.__demoStats || {}, cam = d.camera || {}, s = m.state(), b = m.bridge(), who = m.who ? m.who() : {}, w = d.scene && d.scene.waiting;
    window.__max.drawCalls = Math.max(window.__max.drawCalls, d.drawCalls || 0);
    window.__max.triangles = Math.max(window.__max.triangles, d.triangles || 0);
    const caption = document.getElementById('caption')?.textContent || '', bubbles = who.open ? who.candidates.join('+') : null, wait = w ? w.target + ':' + w.count : null;
    const shot = cam.shot || (cam.returning ? 'return' : ''), scene = Boolean(d.scene && d.scene.busy), takeNumber = cam.takes || 0;
    const adventure = d.bridge && d.bridge.action, act = adventure ? adventure.id + ':' + adventure.phase : null;
    const placed = d.bridge && d.bridge.boardwalk ? d.bridge.boardwalk.panels.filter(p => p.placed).length : 0;
    // The most triangles and draw calls of each camera framing (a shot, a glide, the way back), with what was going on.
    const take = window.__takes[cam.takes || 0] ||= { take: cam.takes || 0, t: +(performance.now() / 1000).toFixed(2), shot: cam.shot || (cam.returning ? 'return' : ''), act, tris: 0, calls: 0 };
    take.tris = Math.max(take.tris, d.triangles || 0); take.calls = Math.max(take.calls, d.drawCalls || 0); take.actEnd = act;
    // How much of that the friends are (the skins and their shadow twins of the ones drawn) and how many are drawn.
    const lod = d.characterLod || [], bodies = lod.filter(c => c.rendered); if ((d.triangles || 0) >= take.tris) { take.actors = Math.round(bodies.reduce((sum, c) => sum + c.mainTriangles + c.shadowTriangles, 0) / 1000); take.drawn = bodies.length; }
    // What each walker of the running action has done (its start and finish in the action's own seconds), the last look.
    if (adventure && d.bridge.routes) (window.__routes ||= {})[adventure.id] = { elapsed: +adventure.elapsed.toFixed(2), routes: d.bridge.routes.map(r => ({ member: r.member, delay: r.delay == null ? null : +r.delay.toFixed(2), duration: +r.duration.toFixed(2), finishedAt: r.finishedAt == null ? null : +r.finishedAt.toFixed(2) })) };
    const mosi = d.scene && d.scene.mosiWalk ? (d.scene.mosiWalk.onDeck ? 'deck' : 'walk') : null;
    const key = [caption, s.phase, s.matchedPairs, b.active, b.failing, b.branch, b.bridgeBuilt, b.atStaging, b.boardwalkBuilt, b.visited, cam.mode, cam.moving, cam.held, bubbles, wait, shot, scene, takeNumber, act, mosi, placed, s.paused].join('|');
    if (key !== last) {
      last = key;
      window.__tl.push({ t: +(performance.now() / 1000).toFixed(2), caption, phase: s.phase, pairs: s.matchedPairs, active: b.active, branch: b.branch,
        bridge: b.bridgeBuilt, staging: b.atStaging, walk: b.boardwalkBuilt, visited: b.visited, cam: (cam.mode || '') + (cam.moving ? '*' : ''), held: Boolean(cam.held), failing: b.failing, who: bubbles, wait, shot, scene, take: takeNumber, act, mosi, placed, paused: Boolean(s.paused) });
    }
  }, 100);
})()`;

// --clearance: while the marsh is laid or the walk to the grove runs, the game's own clearance audit (the anatomical
// envelopes of the six friends and Mosi, the props) every 300 ms; the worst overlap of each pair at each moment is kept.
const CLEARANCE_JS = `(async () => {
  const { assessSceneClearances } = await import('/remake/engine/memory/memory-clearance.js');
  window.__clr = { samples: 0, minimum: null, worst: {} };
  setInterval(() => {
    const d = window.__demoStats, action = d && d.bridge && d.bridge.action; if (!action || !['lay', 'finish', 'fail'].includes(action.id)) return;
    const stats = window.__memory.stats({ collision: true }); stats.collisionObjects = []; // the glade's scenery is far from the marsh; the log, branch and carried bark stay
    const result = assessSceneClearances(stats), clr = window.__clr;
    clr.samples++; if (result.minimum !== null) clr.minimum = clr.minimum === null ? result.minimum : Math.min(clr.minimum, result.minimum);
    for (const hit of result.violations) {
      const key = action.id + '/' + action.phase + ':' + hit.a + ':' + hit.b + ':' + hit.kindA + ':' + hit.kindB;
      if (!clr.worst[key] || hit.clearance < clr.worst[key].clearance) clr.worst[key] = { key, clearance: +hit.clearance.toFixed(3), age: +(action.age || 0).toFixed(2), t: +(performance.now() / 1000).toFixed(2) };
    }
  }, 300);
})()`;

// One read of everything the driver decides on.
const SNAPSHOT_JS = `(() => {
  const m = window.__memory, s = m.state(), b = m.bridge(), d = window.__demoStats || {}, cam = d.camera || {};
  const cancel = document.getElementById('cancel-choice'), who = m.who(), story = m.story(), w = d.scene && d.scene.waiting;
  const buttons = [...document.querySelectorAll('#targets [data-target]')];
  const bubbles = who.open ? [...document.querySelectorAll('#who [data-species]')].map(x => 'who-' + x.dataset.species) : [];
  return {
    phase: s.phase, matched: s.matchedPairs, paused: s.paused,
    cards: s.cards.map(c => ({ id: c.id, species: c.species, item: c.item || null, status: c.status })), found: [...s.found], basket: m.basket(),
    bridge: b, cam: { mode: cam.mode, moving: Boolean(cam.moving), held: Boolean(cam.held), shot: cam.shot || null, take: cam.takes || 0 }, scene: Boolean(d.scene && d.scene.busy),
    act: d.bridge && d.bridge.action ? d.bridge.action.id + ':' + d.bridge.action.phase : null, placed: d.bridge && d.bridge.boardwalk ? d.bridge.boardwalk.panels.filter(p => p.placed).length : 0, fxActive: d.fx ? d.fx.active : 0, landed: Boolean(d.bridge && d.bridge.bridge && d.bridge.bridge.built),
    mosi: d.scene && d.scene.mosiWalk ? (d.scene.mosiWalk.onDeck ? 'deck' : 'walk') : d.scene && d.scene.mosiAcross ? 'across' : null,
    who, story: { kind: story.kind, target: story.target || null, available: Boolean(story.available), automatic: Boolean(story.automatic) },
    wait: w ? { target: w.target, count: w.count, left: w.left } : null, idle: m.idle(),
    trying: Object.values((d.bridge && d.bridge.pairs) || {}).some(p => (p.actors || []).some(a => (a.gesture || '').startsWith('fail-'))),
    arrow: Boolean(document.querySelector('#targets .is-guided')),
    cancel: !cancel.hidden && !cancel.disabled,
    enabled: [...buttons.filter(x => !x.disabled).map(x => x.dataset.target), ...bubbles],
    walking: (d.cells || []).some(c => c.moving || c.queued) || (d.cells || []).some(c => c.status === 'matched' && !c.moved),
    ending: !document.getElementById('ending').hidden,
    caption: document.getElementById('caption')?.textContent || '',
  };
})()`;

// Everything that moves, as one list of numbers: the camera, every visible friend's root and nose, Mosi's head.
const POSE_JS = `(() => {
  const d = window.__memory.stats(), values = [...d.camera.position, ...d.camera.target];
  for (const c of d.cells) if (c.position) values.push(...c.position, ...c.feet.flatMap(f => f.position));
  return { values, scene: Boolean(d.scene && d.scene.busy), shot: d.camera.shot || null };
})()`;

// Taps buttons inside the page, `times` clicks each, gapMs apart. A disabled or hidden button ignores the tap, as it does for a child.
const tapJs = (keys, times, gapMs) => `(async () => {
  const find = key => key.startsWith('who-') ? document.querySelector('#who [data-species="' + key.slice(4) + '"]') : document.querySelector('[data-target="' + key + '"]');
  let taps = 0;
  for (const key of ${JSON.stringify(keys)}) for (let i = 0; i < ${times}; i++) {
    const el = find(key);
    if (el && !el.hidden && !el.disabled && !el.closest('[hidden]')) { el.click(); taps++; }
    await new Promise(r => setTimeout(r, ${gapMs}));
  }
  return taps;
})()`;

// Rapid mode while a script runs: every leaf, obstacle and bubble through window.__memory (past the buttons' own disabled
// state), the way a child taps through a cut. The game must ignore every one of them that is not its turn.
const HAMMER_JS = `(() => {
  const m = window.__memory, s = m.state();
  for (const target of ['branch', 'log', 'bark']) { m.ask(target); m.tap(target); }
  for (const species of ['triceratops', 'brontosaurus', 'stegosaurus']) m.choose(species);
  for (const card of s.cards) if (card.status === 'hidden') m.pick(card.id);
  return true;
})()`;

const PERF_JS = seconds => `new Promise(res => {
  const d = []; let last = performance.now(); const t0 = last;
  const f = now => {
    d.push(now - last); last = now;
    if (now - t0 < ${seconds * 1000}) { requestAnimationFrame(f); return; }
    d.shift();
    const s = [...d].sort((a, b) => a - b);
    res({ seconds: +((now - t0) / 1000).toFixed(1), frames: d.length,
      fps: +(1000 / (d.reduce((a, b) => a + b, 0) / d.length)).toFixed(1),
      p50ms: +s[Math.floor(s.length * .5)].toFixed(1), p95ms: +s[Math.floor(s.length * .95)].toFixed(1), worstMs: +s[s.length - 1].toFixed(1) });
  };
  requestAnimationFrame(f);
})`;

// The bubbles as the child sees them: the box and each portrait's on-screen size.
const WHO_JS = `(() => {
  const box = document.getElementById('who'), r = box.getBoundingClientRect();
  return { box: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
    faces: [...box.querySelectorAll('.who-friend')].map(b => { const f = b.querySelector('.who-face').getBoundingClientRect(), n = b.querySelector('.who-name'); return { species: b.dataset.species, width: Math.round(f.width), height: Math.round(f.height), button: Math.round(b.getBoundingClientRect().height), nameFontPx: parseFloat(getComputedStyle(n).fontSize) }; }),
    viewport: { width: innerWidth, height: innerHeight } };
})()`;

const GPU_JS = `(() => {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return 'no webgl2';
  const e = gl.getExtension('WEBGL_debug_renderer_info');
  return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
})()`;

// The spec's pacing, read off the page's own timeline: the crossing (Mosi's first step, his first step onto the deck,
// all six at staging, input back: the camera free again) and, over every stretch where the child only watches (a script,
// a task or a wrong friend's go running), the longest time with no new framing (a cut, a glide or the way back) and
// no tap. Times are the page's clock (performance.now() seconds), as in the timeline; the spans are game time: without
// --video the game is paused for each picture, and those pauses are left out.
function timelineCheck(timeline = [], taps = []) {
  if (!timeline?.length) return null;
  const pauses = [];
  timeline.forEach((e, i) => { if (e.paused && !timeline[i - 1]?.paused) pauses.push([e.t, timeline.slice(i + 1).find(n => !n.paused)?.t ?? Infinity]); });
  const game = t => t - pauses.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(t, b) - a), 0);
  const watching = e => Boolean(e.scene || e.active || e.failing);
  const events = [];
  for (let i = 1; i < timeline.length; i++) {
    const a = timeline[i - 1], b = timeline[i];
    if ((b.take ?? 0) !== (a.take ?? 0)) events.push({ t: b.t, what: 'framing' });
    else if (String(b.cam).endsWith('*') && !String(a.cam).endsWith('*')) events.push({ t: b.t, what: 'glide' });
  }
  for (const tap of taps ?? []) events.push({ t: tap.t, what: `tap ${tap.key}` });
  events.sort((a, b) => a.t - b.t);
  const stretches = [];
  for (let i = 0; i < timeline.length;) {
    if (!watching(timeline[i])) { i++; continue; }
    let j = i; while (j + 1 < timeline.length && watching(timeline[j + 1])) j++;
    const from = timeline[i].t, to = j + 1 < timeline.length ? timeline[j + 1].t : timeline[j].t;
    const marks = [from, ...events.filter(e => e.t > from && e.t < to).map(e => e.t), to];
    for (let k = 1; k < marks.length; k++) {
      const at = [...timeline].reverse().find(e => e.t <= marks[k - 1]) ?? timeline[i];
      stretches.push({ seconds: +(game(marks[k]) - game(marks[k - 1])).toFixed(2), from: marks[k - 1], to: marks[k], caption: at.caption, active: at.active, act: at.act, shot: at.shot });
    }
    i = j + 1;
  }
  const firstStep = timeline.find(e => (e.mosi === 'walk' || e.mosi === 'deck') && e.active === 'cross'), deck = timeline.find(e => e.mosi === 'deck' && e.active === 'cross'), arrive = timeline.find(e => e.staging);
  const input = arrive && timeline.find(e => e.t >= arrive.t && e.staging && !e.scene && !e.held && e.cam === 'auto');
  const span = (a, b) => a && b ? +(game(b.t) - game(a.t)).toFixed(2) : null;
  // The marsh: the first tap on the bark, the lay's start, the third panel down, the boardwalk built.
  const barkTap = (taps ?? []).find(tap => tap.key === 'task-bark'), layStart = timeline.find(e => e.act && e.act.startsWith('lay:')), lastPanel = timeline.find(e => (e.placed ?? 0) >= 3), built = timeline.find(e => e.walk);
  // The walk to the grove: Mosi's first step, all six arrived (the walk is over), the camera back and the ending up.
  const groveStep = timeline.find(e => e.active === 'finish' && (e.mosi === 'walk' || e.mosi === 'deck')), groveArrive = timeline.find(e => e.visited);
  const groveInput = groveArrive && timeline.find(e => e.t >= groveArrive.t && e.visited && !e.scene && !e.held && e.cam === 'auto');
  return {
    framings: events.filter(e => !e.what.startsWith('tap')).length, taps: (taps ?? []).length,
    crossing: firstStep ? { firstStep: firstStep.t, deck: deck?.t ?? null, arrive: arrive?.t ?? null, input: input?.t ?? null, deckToInput: span(deck, input), firstStepToArrive: span(firstStep, arrive), firstStepToInput: span(firstStep, input) } : null,
    marsh: layStart ? { firstTap: barkTap?.t ?? null, layStart: layStart.t, lastPanel: lastPanel?.t ?? null, boardwalk: built?.t ?? null, tapToLastPanel: barkTap && lastPanel ? span(barkTap, lastPanel) : null, layToLastPanel: span(layStart, lastPanel), layToBoardwalk: span(layStart, built) } : null,
    grove: groveStep ? { firstStep: groveStep.t, arrive: groveArrive?.t ?? null, input: groveInput?.t ?? null, firstStepToArrive: span(groveStep, groveArrive), watchAfterArrival: span(groveArrive, groveInput) } : null,
    // The longest stretch, and the five longest (with what was going on), so a long one can be placed.
    longestWatch: stretches.sort((a, b) => b.seconds - a.seconds)[0] ?? { seconds: 0 }, longestWatches: stretches.slice(0, 5),
  };
}

// How far the search view moved between two measurements: camera position and the leaves still on the board.
function frameDrift(before, after) {
  if (!before?.camera || !after?.camera) return null;
  const camera = Math.max(...before.camera.position.map((v, i) => Math.abs(v - after.camera.position[i])), ...before.camera.quaternion.map((v, i) => Math.abs(v - after.camera.quaternion[i])));
  let leafPixels = 0;
  for (const leaf of after.leaves) {
    const old = before.leaves.find(value => value.cell === leaf.cell);
    if (old && leaf.status === 'hidden' && old.status === 'hidden') leafPixels = Math.max(leafPixels, ...['left', 'top', 'right', 'bottom'].map(k => Math.abs(leaf[k] - old[k])));
  }
  return { camera: +camera.toExponential(2), leafPixels: +leafPixels.toFixed(2) };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(ROOT, o.out);
  await fsp.mkdir(outDir, { recursive: true });
  const framesDir = path.join(outDir, 'frames');
  if (o.video) { await fsp.rm(framesDir, { recursive: true, force: true }); await fsp.mkdir(framesDir, { recursive: true }); }

  const errors = [];
  const report = {
    page: o.page, mode: o.mode, size: o.size, seed: o.seed, query: o.query, reducedMotion: o.reducedMotion, startedAt: new Date().toISOString(),
    finished: false, stalled: null, roundSeconds: null, errors, steps: [], shots: [], pauseHolds: [], timeline: [], perf: null, render: null, renderMax: null, gpu: null, video: null,
  };
  const server = await startServer();
  const query = [`seed=${o.seed}`, o.query].filter(Boolean).join('&');
  const url = `http://127.0.0.1:${server.address().port}/${o.page.replace(/\\/g, '/').replace(/^\//, '')}?${query}`;
  const browser = await launchBrowser(o);
  const { cdp } = browser;
  const t0 = Date.now();
  const T = () => +((Date.now() - t0) / 1000).toFixed(1);
  const frames = { n: 0, stamps: [], writes: [] };
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
      } else if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(msg.params.type)) {
        errors.push(`console.${msg.params.type}: ${msg.params.args.map(a => a.value ?? a.description ?? a.type).join(' ')}`.slice(0, 600));
      } else if (msg.method === 'Log.entryAdded' && ['error', 'warning'].includes(msg.params.entry.level)) {
        const e = msg.params.entry;
        if (!/favicon\.ico/.test(e.url || e.text || '')) errors.push(`log.${e.level}: ${e.text} ${e.url || ''}`.slice(0, 600));
      } else if (msg.method === 'Page.screencastFrame') {
        const n = ++frames.n, p = msg.params;
        frames.stamps.push(p.metadata?.timestamp ?? null);
        frames.last = p.data;
        frames.writes.push(fsp.writeFile(path.join(framesDir, `${String(n).padStart(5, '0')}.jpg`), Buffer.from(p.data, 'base64')));
        send('Page.screencastFrameAck', { sessionId: p.sessionId }).catch(() => {});
      }
    });
    await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
    const phone = o.width < 768;
    await send('Emulation.setDeviceMetricsOverride', { width: o.width, height: o.height, deviceScaleFactor: 1, mobile: phone });
    if (phone) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (o.reducedMotion) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

    const ev = async (expression, awaitPromise = true) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const step = (what, extra = {}) => { report.steps.push({ t: T(), what, ...extra }); console.log(`[${T()}] ${what}${Object.keys(extra).length ? ' ' + JSON.stringify(extra) : ''}`); };
    let shotCount = 0;
    const shot = async name => {
      const label = `${String(++shotCount).padStart(2, '0')}-${name}`;
      const d = await send('Page.captureScreenshot', { format: 'png' });
      await fsp.writeFile(path.join(outDir, `${label}.png`), Buffer.from(d.data, 'base64'));
      report.shots.push({ name: label, t: T() }); console.log(`[${T()}] shot ${label}`);
    };
    const waitFor = async (expr, ms, label) => {
      const s = Date.now();
      while (Date.now() - s < ms) { try { if (await ev(`Boolean(${expr})`)) return (Date.now() - s) / 1000; } catch {} await sleep(150); }
      step(`TIMEOUT waiting for ${label}`); return -1;
    };

    await send('Page.navigate', { url });
    if (await waitFor('window.__memoryReady === true', 120000, 'the page to be ready') < 0) throw new Error('The page never became ready');
    report.gpu = await ev(GPU_JS).catch(e => `error: ${e.message}`);
    report.reducedMotionActive = await ev("matchMedia('(prefers-reduced-motion: reduce)').matches").catch(() => null);
    step('loaded', { url: url.replace(/^http:\/\/127\.0\.0\.1:\d+/, '') });
    if (o.video) await send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 960, maxHeight: 960, everyNthFrame: 2 });
    // Named moments, kept with the wall clock so they can be placed in round.mp4 (its first frame's stamp) afterwards.
    report.marks = [];
    const mark = name => { if (report.marks.some(entry => entry.name === name)) return; report.marks.push({ name, at: Date.now() / 1000, t: T() }); step(`mark ${name}`); };
    await ev(TIMELINE_JS);
    if (o.clearance) await ev(CLEARANCE_JS);
    await sleep(700);
    await shot('welcome');

    await ev(`document.getElementById('start').click()`);
    const roundStart = Date.now();
    step('start clicked');
    await sleep(2500);
    await shot('glade');
    // The search view: every baby's on-screen size (projected posed bounds, hidden ones measured at their cells),
    // Mosi and the leaves, with whether each is inside the frame.
    report.glade = await ev('window.__memory.stats({ measure: true }).frame').catch(e => ({ error: e.message }));
    if (report.glade?.babies) step('glade measured', { babyHeights: report.glade.babies.map(b => `${b.species}:${b.height}`).join(' '), mosi: report.glade.mosi?.height, allInside: [...report.glade.leaves, report.glade.mosi].every(b => b?.inside) });
    if (o.mode === 'glade') report.finished = Boolean(report.glade?.babies);

    // ---- the round, driven by what the page shows -------------------------------------------------------------
    const rapid = o.mode === 'rapid', shots = o.mode !== 'rapid', story = ['full', 'branch', 'rapid'].includes(o.mode);
    const seen = new Set();
    // A picture the first time `key` is seen (after delayMs, so the thing has had time to show). True if it waited.
    const milestone = async (key, name, delayMs = 0) => {
      if (seen.has(key)) return false;
      seen.add(key);
      if (!shots) return false;
      if (delayMs) await sleep(delayMs);
      // A capture takes a second or more here. Without a video the game is paused for it (the game clock
      // stops, as it does for a child's pause), so the picture is the moment it is named after.
      if (o.video) {
        // With the screencast running a full capture lags by a second or more, so the moment's picture is
        // the screencast's latest frame (960 px JPEG), taken the instant it is due.
        if (!frames.last) return true;
        const label = `${String(++shotCount).padStart(2, '0')}-${name}`;
        await fsp.writeFile(path.join(outDir, `${label}.jpg`), Buffer.from(frames.last, 'base64'));
        report.shots.push({ name: label, t: T(), from: 'screencast' }); console.log(`[${T()}] frame ${label}`);
        return true;
      }
      await ev('window.__memory.pause(true)');
      const held = await ev(POSE_JS);
      await shot(name);
      // While paused nothing may move: not the camera, not a friend, not a running script.
      const after = await ev(POSE_JS), drift = Math.max(...held.values.map((v, i) => Math.abs(v - after.values[i])));
      report.pauseHolds.push({ shot: name, drift: +drift.toExponential(2), scene: held.scene, shotKind: held.shot });
      await ev('window.__memory.pause(false)');
      return true;
    };
    const first = await ev(SNAPSHOT_JS);
    step('cards', { cards: first.cards.map(c => `${c.id}:${c.species}`).join(' ') });
    // The pairs are found in this order (in the story modes the Þríhyrnur first, so the branch has a wrong friend to
    // pick). The first try is a deliberate mismatch: a card of the first species, then a card of the last one.
    const order = (story ? ['triceratops', 'brontosaurus', 'stegosaurus'] : ['brontosaurus', 'triceratops', 'stegosaurus']).filter(sp => first.cards.some(c => c.species === sp));
    for (const sp of new Set(first.cards.map(c => c.species))) if (sp && !order.includes(sp)) order.push(sp);
    // The surprise leaves, in card order. `full` and `rapid` open one before the first pair and one before the last.
    const surpriseIds = first.cards.filter(c => c.item).map(c => c.id);
    report.surprises = [];
    const surpriseAt = [0, 2]; // matched pairs when each one is opened (full and rapid)
    const hidden = (s, species) => s.cards.filter(c => c.species === species && c.status === 'hidden').map(c => c.id);
    let missPlan = 0; // 0 not yet, 1 first card of the miss is open, 2 done
    let lastKey = '', lastProgress = Date.now(), lastAsk = 0, lastCancel = 0, lastHammer = 0, overviewDone = false, arrowWaited = false, tapWait = null;
    const wrongDone = new Set(); // the obstacles that have had their wrong friend (one each: the branch, the log and the bark)
    const WRONG = { branch: 'triceratops', log: 'triceratops', bark: 'brontosaurus' }; // whom the driver tries first at each (the log's right friend is the Þríhyrnur, so its other free pair, the Kambeðlur, goes)
    let barkTaps = 0;
    const limitMs = o.limit * 60 * 1000, stallMs = 4 * 60 * 1000;

    // One step of the child: the right button, and in rapid mode three taps on it and then on every other enabled target.
    const act = async (key, what, extra = {}) => {
      const s = await ev(SNAPSHOT_JS);
      const keys = [key];
      if (rapid) for (const other of s.enabled) if (!keys.includes(other)) keys.push(other);
      const taps = await ev(tapJs(keys, rapid ? 3 : 1, rapid ? 10 : 0));
      let after = {};
      if (rapid) { await sleep(300); const a = await ev(SNAPSHOT_JS); after = { after: `${a.phase}/${a.matched}${a.bridge.selected ? '/sel:' + a.bridge.selected : ''}`, open: a.cards.filter(c => c.status !== 'hidden').map(c => c.id + c.status[0]).join(',') }; }
      step(what, { ...extra, ...(rapid ? { targets: keys.length, taps, ...after } : {}) });
      // The first leaf tapped: the squash and its puff, a moment (80 ms) after the tap.
      if (key.startsWith('leaf-')) await milestone('squash', 'leaf-squash', 80);
      // The first time the bubbles open: how big each portrait is on this screen.
      if (key.startsWith('task-') && !report.who) { await sleep(500); const who = await ev('window.__memory.who()'); if (who.open) { report.who = await ev(WHO_JS); step('bubbles measured', { faces: report.who.faces.map(f => `${f.species}:${f.width}x${f.height}`).join(' ') }); } }
    };

    for (;;) {
      if (o.mode === 'glade') break;
      if (Date.now() - roundStart > limitMs) { report.stalled = `over the ${o.limit} minute limit`; step('TIMEOUT round limit'); break; }
      const s = await ev(SNAPSHOT_JS);
      const progress = [s.phase, s.matched, s.bridge.active, s.bridge.failing, s.bridge.branch, s.bridge.bridgeBuilt, s.bridge.atStaging, s.bridge.boardwalkBuilt, s.bridge.visited,
        s.bridge.asking, s.who.open, s.wait?.count, s.cam.moving, s.cam.held, s.cam.shot, s.scene, s.walking].join('|');
      if (progress !== lastKey) { lastKey = progress; lastProgress = Date.now(); }
      if (Date.now() - lastProgress > stallMs) { report.stalled = `no change for ${stallMs / 1000}s at ${progress}`; step('STALLED', { at: progress, caption: s.caption }); break; }

      if (!s.wait) tapWait = null;
      if (s.placed >= 3 && s.bridge.active === 'lay') mark('bark-end');
      if (s.bridge.active === 'finish' && (s.mosi === 'walk' || s.mosi === 'deck')) mark('grove-start');
      if (s.bridge.visited) mark('grove-end');
      if (s.ending) { report.finished = true; step('ending'); await sleep(1500); await shot('ending'); break; }
      if (o.mode === 'branch' && s.bridge.branch === 'held' && !s.bridge.active && !s.cam.moving && !s.cam.held && !s.scene) {
        report.finished = true; step('the branch is up'); await sleep(800); await shot('branch-held'); break;
      }
      // The match script holds the camera until it has glided back to the glade.
      if (o.mode === 'first-minute' && s.matched >= 1 && s.phase === 'ready' && !s.walking && !s.cam.moving && !s.cam.held && !s.scene) {
        report.finished = true; step('first pair is home'); await sleep(800); await shot('first-pair-home');
        // After the match script has glided back, the search view must be the frame it was before.
        report.gladeAfter = await ev('window.__memory.stats({ measure: true }).frame').catch(e => ({ error: e.message }));
        report.gladeDrift = frameDrift(report.glade, report.gladeAfter);
        step('glade after the first pair', report.gladeDrift ?? {});
        break;
      }

      // Milestone pictures. Waiting for one makes the snapshot stale, so the loop starts over after it.
      let waited = false;
      if (s.phase === 'one-open') waited ||= await milestone('one-open', 'first-reveal', 350);
      // The first friend waiting alone wonders (from 1.3 s after its leaf opened).
      if (s.phase === 'one-open' && seen.has('one-open')) waited ||= await milestone('wonder', 'wonder', 1300);
      if (s.phase === 'mismatch') waited ||= await milestone('mismatch', 'mismatch', 400);
      if (s.phase === 'mismatch' && seen.has('mismatch')) waited ||= await milestone('mismatch-duck', 'mismatch-duck', 350);
      // The wrong pair closes (1.5 s after the mismatch began): the leaves drop with a bounce and a bonk.
      if (s.phase === 'mismatch' && seen.has('mismatch-duck')) waited ||= await milestone('mismatch-close', 'mismatch-close', 750);
      // The match script: the face cut (startle), the run and nuzzle, the walk home (follow), Mosi's clap (wide).
      if (s.cam.shot === 'face') waited ||= await milestone('match-closeup', 'match-closeup', 150);
      if (s.cam.shot === 'face' && seen.has('match-closeup')) waited ||= await milestone('run-together', 'run-together', 450);
      if (s.cam.shot === 'face' && seen.has('run-together')) waited ||= await milestone('nuzzle-glitter', 'nuzzle-glitter', 600);
      if (s.cam.shot === 'follow') waited ||= await milestone('walk-home', 'walk-home', 900);
      if (s.cam.shot === 'wide') waited ||= await milestone('home-clap', 'home-clap', 500);
      if (s.matched > 0 && !s.cam.held) waited ||= await milestone(`matched-${s.matched}`, `match-${s.matched}`, 300);
      // A surprise leaf was found: the pop (stars, flight) and then the basket counting it.
      if (s.found.length) waited ||= await milestone('surprise-pop', 'surprise-pop', 650);
      if (s.basket >= 1) waited ||= await milestone('surprise-basket', 'surprise-in-basket', 350);
      // The branch: the obstacle glowing, the arrow after hesitating, the bubbles, a wrong friend's go and Mosi's laugh,
      // the walk there, each tap of the tap-along (or the timeout's "Við gerum þetta saman!") and the cheer.
      if (s.story.kind === 'work' && s.story.target === 'branch' && s.story.available && !s.cam.held && !s.scene) waited ||= await milestone('glow-branch', 'branch-glowing', 400);
      // The bark at the marsh sways as well as glows: two pictures a moment apart.
      if (s.story.kind === 'work' && s.story.target === 'bark' && s.story.available && !s.cam.held && !s.scene) { waited ||= await milestone('glow-bark', 'bark-glowing', 400); if (seen.has('glow-bark')) waited ||= await milestone('glow-bark-2', 'bark-glowing-later', 650); }
      if (s.arrow) waited ||= await milestone('arrow', 'gold-arrow', 200);
      if (s.who.open) waited ||= await milestone(`who-${s.who.asking}`, `who-${s.who.asking}`, 450);
      if (s.bridge.failing && s.trying && s.caption !== 'Kannski einhver annar?') waited ||= await milestone(`fail-${s.bridge.failing}`, `fail-${s.bridge.failing}`, 500);
      if (s.bridge.failing && s.caption === 'Kannski einhver annar?') waited ||= await milestone(`mosi-laugh-${s.bridge.asking}`, `mosi-laughs-${s.bridge.asking}`, 350);
      if (s.bridge.active === 'lift' && s.cam.shot === 'follow') waited ||= await milestone('bronto-walk', 'brontos-walk-to-branch', 500);
      if (s.caption === 'Við gerum þetta saman!') waited ||= await milestone(`together-${s.bridge.active}`, `timeout-together-${s.bridge.active === 'roll' ? 'log' : s.bridge.active === 'lay' ? 'bark' : 'branch'}`, 300);
      if (s.bridge.branch === 'held' && !s.bridge.active && !s.landed && s.scene && s.cam.shot === 'hero') { mark('branch-end'); waited ||= await milestone('cheer', 'cheer-branch-up', 450); }
      // The log: the Þríhyrnur walking over, the landing (its splash, the jolt), the low hero shot of the bridge, the cheer,
      // then the branch let go and the Þórseðlur walking home.
      if (s.bridge.active === 'roll' && s.cam.shot === 'follow') waited ||= await milestone('tri-walk', 'trihyrnur-walk-to-log', 350);
      if (s.bridge.active === 'roll' && s.landed) waited ||= await milestone('landing', 'log-lands-splash', 120);
      if (s.bridge.active === 'roll' && s.landed && s.cam.shot === 'hero') waited ||= await milestone('bridge-hero', 'bridge-hero-low', 450);
      if (s.landed && seen.has('bridge-hero') && s.scene && s.cam.shot === 'face' && !s.walking && !s.bridge.atStaging && !s.mosi) { mark('log-end'); waited ||= await milestone('tri-cheer', 'trihyrnur-cheer', 400); }
      if (s.act && s.act.startsWith('lower:')) waited ||= await milestone('branch-lower', 'branch-lowers', 450);
      if (s.act === 'lower:return') waited ||= await milestone('brontos-rejoin', 'brontos-rejoin', 900);
      // The crossing: beside them as Mosi steps on, over his shoulder at mid-bridge, the friends behind, the arrival.
      if (s.bridge.active === 'cross' && s.cam.shot === 'follow' && s.mosi === 'deck') waited ||= await milestone('cross-follow', 'cross-follow', 300);
      if (s.bridge.active === 'cross' && s.cam.shot === 'shoulder') waited ||= await milestone('cross-shoulder', 'cross-shoulder-mid-bridge', 500);
      if (s.bridge.active === 'cross' && s.cam.shot === 'follow' && seen.has('cross-shoulder')) waited ||= await milestone('cross-behind', 'cross-friends-behind', 400);
      if ((s.bridge.active === 'cross' || s.bridge.atStaging) && s.cam.shot === 'wide' && seen.has('cross-shoulder')) waited ||= await milestone('cross-arrival', 'cross-arrival', 600);
      // The marsh: the wrong friend wading in (steps and hops in the mud), the Kambeðlur lifting the bark and carrying it, each
      // panel down with its mud thrown up and the finished boardwalk (below: walkway-built).
      if (s.bridge.failing && s.bridge.asking === 'bark' && s.act === 'fail:try') waited ||= await milestone('mud-steps', 'footsteps-in-the-mud', 120);
      if (s.act === 'lay:pickup') waited ||= await milestone('bark-pickup', 'kambedlur-pick-up-bark', 120);
      if (s.act === 'lay:carry') waited ||= await milestone('bark-carry', 'kambedlur-carry-bark', 800);
      for (let n = 1; n <= 3; n++) if (s.placed >= n && s.bridge.active === 'lay') waited ||= await milestone(`bark-splash-${n}`, `bark-${n}-lands-splash`, 150);
      // The third panel is down: the whole boardwalk, done, in the cut that follows (Mosi claps).
      if (s.placed >= 3 && s.bridge.active === 'lay' && s.cam.shot === 'wide') waited ||= await milestone('boardwalk-done', 'boardwalk-finished', 500);
      // The walk to the grove: Mosi leads (wide, then beside the boardwalk, over his shoulder, the friends behind, the arrival).
      if (s.bridge.active === 'finish' && s.cam.shot === 'wide' && !seen.has('grove-walk')) waited ||= await milestone('grove-walk', 'grove-walk-starts', 500);
      if (s.bridge.active === 'finish' && s.cam.shot === 'follow') waited ||= await milestone('grove-follow', 'grove-follow', 450);
      if (s.bridge.active === 'finish' && s.cam.shot === 'shoulder') waited ||= await milestone('grove-shoulder', 'grove-shoulder', 500);
      if (s.bridge.active === 'finish' && s.cam.shot === 'follow' && seen.has('grove-shoulder')) waited ||= await milestone('grove-behind', 'grove-friends-behind', 450);
      if (s.bridge.active === 'finish' && s.cam.shot === 'wide' && seen.has('grove-shoulder')) waited ||= await milestone('grove-arrival', 'grove-arrival-mosi', 900);
      if (s.bridge.active && !['lift', 'roll', 'cross', 'lay', 'finish'].includes(s.bridge.active)) waited ||= await milestone(`active-${s.bridge.active}`, `task-${s.bridge.active}`, 3000);
      if (s.bridge.branch === 'held') waited ||= await milestone('held', 'branch-held', 600);
      if (s.bridge.bridgeBuilt) waited ||= await milestone('bridge', 'bridge-built', 600);
      if (s.bridge.atStaging) waited ||= await milestone('staging', 'at-staging', 600);
      if (s.bridge.boardwalkBuilt) waited ||= await milestone('walkway', 'walkway-built', 600);
      if (waited) continue;

      // The overview button once, when the log is across, as a child would peek at the whole place.
      if (o.mode === 'full' && !overviewDone && s.bridge.bridgeBuilt && !s.bridge.active && s.phase === 'ready' && !s.cam.moving) {
        overviewDone = true;
        await ev(`window.__memory.camera('overview')`); await waitFor(`!window.__demoStats.camera.moving`, 20000, 'overview camera'); await sleep(500);
        await shot('overview');
        await ev(`window.__memory.camera('auto')`); await waitFor(`!window.__demoStats.camera.moving`, 20000, 'play camera');
        continue;
      }

      const mayAct = !s.paused && !s.cam.moving && !s.cam.held && !s.bridge.active;
      const leaf = id => id !== undefined && s.enabled.includes(`leaf-${id}`);
      if (o.mode === 'first-minute' && s.matched >= 1) {
        // The first pair is found: wait for its friends to walk home, and pick nothing more.
      } else if (s.wait && s.wait.target) {
        // The tap-along under the still shot: three taps, a picture after each (its "Upp!" or "Einn!", "Tveir!", "ÝTA!" is
        // up), or none at all.
        if (o.tapAlong && tapWait !== s.wait.target) {
          const target = s.wait.target, bark = target === 'bark', count = s.wait.count;
          tapWait = target;
          // The bark: one wait for each panel. A picture of the still shot before its tap (the panel held over its place).
          if (bark) { barkTaps++; await sleep(rapid ? 100 : 350); if (shots) await milestone(`bark-still-${barkTaps}`, `bark-still-${barkTaps}`, 0); await sleep(rapid ? 0 : 150); }
          else await sleep(rapid ? 100 : 500);
          for (let i = 1; i <= count; i++) {
            const tapped = await ev(tapJs([`task-${target}`], 1, 0));
            step(`tap along ${target} ${bark ? barkTaps : i}`, { taken: tapped });
            // The picture once this step has landed (a step of the lift takes about 0.6 s, a third of the roll 0.77 s, the big word
            // of a panel is up at once).
            if (shots) await (bark ? milestone(`bark-word-${barkTaps}`, `bark-word-${barkTaps}`, 280) : milestone(`tap-${target}-${i}`, `${target === 'branch' ? 'hero' : target}-tap-${i}`, target === 'log' ? 450 : 520));
            await sleep(rapid ? 120 : 250);
          }
        }
      } else if (s.who.open && mayAct) {
        // The bubbles: at the branch, the log and the bark in the story modes one wrong friend first (at the branch the
        // Þríhyrnur, at the log the Kambeðlur, the only other free pair there, at the bark the Þórseðlur), then the right one.
        const right = RIGHT[s.who.asking], wrong = s.who.candidates.find(sp => sp === WRONG[s.who.asking] && sp !== right) ?? s.who.candidates.find(sp => sp !== right);
        const pick = story && !wrongDone.has(s.who.asking) && ['branch', 'log', 'bark'].includes(s.who.asking) && wrong ? wrong : s.who.candidates.includes(right) ? right : null;
        if (pick === wrong && pick) wrongDone.add(s.who.asking);
        if (pick) await act(`who-${pick}`, `pick ${pick} for the ${s.who.asking}${pick === right ? '' : ' (the wrong friend, on purpose)'}`);
        else if (s.cancel) { await ev(`document.getElementById('cancel-choice').click()`); step('close the bubbles: nobody there can do it'); }
      } else if (s.story.kind === 'work' && s.story.available && s.story.target && mayAct && ['ready', 'won'].includes(s.phase) && !s.walking && Date.now() - lastAsk > 1500
        && !(story && !o.usualOrder && s.story.target === 'log' && s.cards.some(c => c.species && c.status !== 'matched'))) {
        // (The story modes find every pair before the log, so the Kambeðlur can be its wrong friend; --usual-order does not.)
        // Hesitate once (full mode, at the branch) so the gold arrow shows, then tap the glowing obstacle.
        if (o.mode !== 'rapid' && !arrowWaited && s.story.target === 'branch') {
          arrowWaited = true; step('wait for the gold arrow');
          if (await waitFor('window.__memory.idle() > 5.4 && document.querySelector("#targets .is-guided")', 12000, 'the gold arrow') >= 0) await milestone('arrow', 'gold-arrow', 150);
          continue;
        }
        lastAsk = Date.now();
        if (['branch', 'log', 'bark'].includes(s.story.target)) mark(`${s.story.target}-start`);
        const where = await ev(`(() => { const t = window.__memory.targets().find(t => t.type === 'task' && t.id === ${JSON.stringify(s.story.target)}); return t ? { x: Math.round(t.x), y: Math.round(t.y), enabled: t.enabled } : null; })()`);
        await act(`task-${s.story.target}`, `tap the ${s.story.target}`, { since: +((Date.now() - lastProgress) / 1000).toFixed(1), at: where });
      } else if (s.phase === 'one-open' && mayAct) {
        const open = s.cards.find(c => c.status === 'open');
        if (missPlan === 1 && order.length > 1) {
          const miss = hidden(s, order[order.length - 1])[0];
          if (leaf(miss)) { missPlan = 2; await act(`leaf-${miss}`, `pick leaf ${miss} (${s.cards[miss].species}) to miss on purpose`); continue; }
        }
        const partner = hidden(s, open?.species).find(leaf);
        if (partner !== undefined) await act(`leaf-${partner}`, `pick leaf ${partner} (partner of ${open.id}, ${open.species})`);
      } else if (s.phase === 'ready' && mayAct && !s.bridge.asking) {
        let id;
        const due = o.mode === 'full' || rapid ? surpriseIds.find((value, k) => k < surpriseAt.length && s.matched >= surpriseAt[k] && s.cards[value].status === 'hidden') : undefined;
        if (due !== undefined && leaf(due) && !report.surprises.some(entry => entry.id === due)) {
          report.surprises.push({ id: due, item: s.cards[due].item, at: T() });
          await act(`leaf-${due}`, `pick surprise leaf ${due} (${s.cards[due].item})`); continue;
        }
        if (missPlan === 0 && s.matched === 0) { id = hidden(s, order[0])[0]; if (leaf(id)) missPlan = 1; }
        else {
          const species = order.find(sp => s.cards.some(c => c.species === sp && c.status !== 'matched'));
          id = species === undefined ? undefined : hidden(s, species)[0];
        }
        if (leaf(id)) await act(`leaf-${id}`, `pick leaf ${id} (${s.cards[id].species})`);
      } else if (s.bridge.asking && s.cancel && !s.who.open && Date.now() - lastProgress > 8000 && Date.now() - lastCancel > 8000) {
        // Bubbles a stray tap opened and nothing came of them: "Aftur" closes them.
        lastCancel = Date.now();
        await ev(`document.getElementById('cancel-choice').click()`);
        step('close stray bubbles', { asking: s.bridge.asking });
      }
      // Rapid: while a script holds the camera, tap everything anyway, every 0.4 s.
      if (rapid && (s.scene || s.cam.held) && Date.now() - lastHammer > 400) { lastHammer = Date.now(); await ev(HAMMER_JS); }
      await sleep(rapid ? 120 : 150);
    }
    report.roundSeconds = +((Date.now() - roundStart) / 1000).toFixed(1);
    for (const entry of report.marks) entry.round = +(entry.at - roundStart / 1000).toFixed(1);
    try { const end = await ev(SNAPSHOT_JS); report.found = end.found; report.basketEnd = end.basket; } catch {}

    // ---- what the run looked like -----------------------------------------------------------------------------
    try { report.timeline = await ev('window.__tl'); report.taps = await ev('window.__taps'); report.pageOrigin = await ev('window.__origin'); } catch {}
    report.timelineCheck = timelineCheck(report.timeline, report.taps);
    try {
      const takes = Object.values(await ev('window.__takes')).sort((a, b) => b.tris - a.tris);
      report.takes = takes; report.routes = await ev('window.__routes');
      // The action's own seconds (the game clock; the wall-clock spans above run a little longer when a frame takes over 50 ms).
      if (report.timelineCheck?.grove && report.routes?.finish) report.timelineCheck.grove.actionSeconds = report.routes.finish.elapsed;
      if (report.timelineCheck?.marsh && report.routes?.lay) report.timelineCheck.marsh.actionSeconds = report.routes.lay.elapsed;
      if (report.timelineCheck) report.timelineCheck.takes = takes.length;
      if (o.clearance) report.clearance = await ev('window.__clr');
    } catch {}
    if (report.timelineCheck) step('timeline check', { crossing: report.timelineCheck.crossing?.deckToInput ?? null, marsh: report.timelineCheck.marsh?.layToBoardwalk ?? null, grove: report.timelineCheck.grove?.firstStepToArrive ?? null, longestWatch: report.timelineCheck.longestWatch?.seconds ?? null });
    try {
      report.perf = await ev(PERF_JS(4));
      report.render = await ev(`(() => { const s = window.__demoStats || {}; return { drawCalls: s.drawCalls, triangles: s.triangles, textures: s.textures, geometries: s.geometries, resolutionScale: s.resolutionScale }; })()`);
      report.renderMax = await ev('window.__max');
      report.scenePerf = await ev(`(() => { const d = window.__scenePerf.slice(1), s = [...d].sort((a, b) => a - b); return d.length ? { frames: d.length, fps: +(1000 / (d.reduce((a, b) => a + b, 0) / d.length)).toFixed(1), p95ms: +s[Math.floor(s.length * .95)].toFixed(1), worstMs: +s[s.length - 1].toFixed(1) } : null; })()`);
    } catch (e) { report.perf = { error: e.message }; }
    if (o.video) {
      await send('Page.stopScreencast').catch(() => {});
      await sleep(300);
    }
  } catch (e) {
    fatal = e; errors.push(`driver: ${e.stack || e.message}`.slice(0, 900));
  } finally {
    if (o.video) {
      await Promise.allSettled(frames.writes);
      report.video = await makeVideo(framesDir, outDir, frames);
      // Each mark's place in round.mp4: seconds after the first screencast frame; the timeline check's moments too.
      const first = frames.stamps.find(Number.isFinite);
      if (Number.isFinite(first)) for (const entry of report.marks ?? []) entry.video = +(entry.at - first).toFixed(1);
      if (Number.isFinite(first) && report.timelineCheck && report.pageOrigin) {
        const video = t => Number.isFinite(t) ? +(report.pageOrigin / 1000 + t - first).toFixed(1) : null, check = report.timelineCheck;
        check.video = { crossingFirstStep: video(check.crossing?.firstStep), crossingDeck: video(check.crossing?.deck), crossingArrive: video(check.crossing?.arrive), crossingInput: video(check.crossing?.input),
          marshFirstTap: video(check.marsh?.firstTap), marshLayStart: video(check.marsh?.layStart), marshLastPanel: video(check.marsh?.lastPanel), marshBoardwalk: video(check.marsh?.boardwalk),
          groveFirstStep: video(check.grove?.firstStep), groveArrive: video(check.grove?.arrive), groveInput: video(check.grove?.input),
          longestWatchFrom: video(check.longestWatch?.from), longestWatchTo: video(check.longestWatch?.to) };
      }
    }
    report.finishedAt = new Date().toISOString();
    report.totalSeconds = T();
    await stopBrowser(browser);
    server.close();
    await fsp.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  }
  const r = report;
  console.log(`${r.finished ? 'FINISHED' : 'NOT FINISHED'} ${o.mode} ${o.size}: round ${r.roundSeconds}s, ${r.errors.length} errors, ${r.steps.length} steps, perf ${JSON.stringify(r.perf)}, render ${JSON.stringify(r.render)}`);
  if (r.video) console.log(`Video: ${r.video.file ?? 'none'} (${r.video.frames} frames${r.video.error ? ', ' + r.video.error : ''})`);
  if (r.marks?.length) console.log(`Marks: ${r.marks.map(m => `${m.name} ${m.video ?? m.round}s`).join(', ')}`);
  if (r.timelineCheck) console.log(`Timeline check: crossing ${JSON.stringify(r.timelineCheck.crossing)}, marsh ${JSON.stringify(r.timelineCheck.marsh)}, grove ${JSON.stringify(r.timelineCheck.grove)}, longest watch ${JSON.stringify(r.timelineCheck.longestWatch)}${r.timelineCheck.video ? `, video ${JSON.stringify(r.timelineCheck.video)}` : ''}`);
  if (r.takes?.length) console.log(`Heaviest framings: ${r.takes.slice(0, 5).map(t => `#${t.take} ${t.shot || '-'} ${t.act ?? ''} ${Math.round(t.tris / 1000)}k/${t.calls} (friends ${t.actors ?? '?'}k, ${t.drawn ?? '?'} drawn)`).join(' | ')}`);
  if (r.clearance) console.log(`Clearance: ${r.clearance.samples} samples, minimum ${r.clearance.minimum}, ${Object.keys(r.clearance.worst).length} overlaps ${JSON.stringify(Object.values(r.clearance.worst).sort((a, b) => a.clearance - b.clearance).slice(0, 6))}`);
  console.log(`GPU: ${r.gpu}`);
  console.log(`Report: ${path.relative(ROOT, path.join(outDir, 'report.json')).replace(/\\/g, '/')}`);
  if (fatal || !r.finished || r.errors.length) process.exitCode = 1;
}

// frames/%05d.jpg -> round.mp4 at 15 fps. The screencast sends a frame only when the picture changes (about 22 a second
// while the scene moves here), so the frames are laid out by the time the browser stamped on each (frames.txt, ffmpeg's
// concat list) and the video plays at the speed the round was played. Without usable stamps it falls back to a plain
// 15 fps sequence, and the report's captureSeconds against videoSeconds shows by how much that speed is off.
async function makeVideo(framesDir, outDir, frames) {
  const info = { frames: frames.n, file: null, bytes: null, captureSeconds: null, videoSeconds: null, timing: null };
  if (!frames.n) { info.error = 'the screencast sent no frames'; return info; }
  const stamps = frames.stamps;
  if (stamps.length > 1 && stamps.every(Number.isFinite)) info.captureSeconds = +(stamps[stamps.length - 1] - stamps[0]).toFixed(1);
  const file = path.join(outDir, 'round.mp4');
  const name = i => `frames/${String(i + 1).padStart(5, '0')}.jpg`;
  const pad = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  let args;
  if (info.captureSeconds !== null) {
    info.timing = 'real';
    // Frames can arrive out of order (a loaded browser sends some a hundred milliseconds late), and a negative gap would
    // stretch the video, so they are laid out in the order of their stamps.
    const order = stamps.map((stamp, i) => ({ i, stamp })).sort((a, b) => a.stamp - b.stamp || a.i - b.i), list = [];
    for (let k = 0; k < order.length; k++) {
      const next = k + 1 < order.length ? order[k + 1].stamp - order[k].stamp : 1 / VIDEO_FPS;
      list.push(`file '${name(order[k].i)}'`, `duration ${Math.max(next, 0.001).toFixed(4)}`);
    }
    list.push(`file '${name(order.at(-1).i)}'`); // ffmpeg's concat demuxer drops the last duration unless the file comes once more
    await fsp.writeFile(path.join(outDir, 'frames.txt'), list.join('\n') + '\n');
    args = ['-f', 'concat', '-safe', '0', '-i', path.join(outDir, 'frames.txt'), '-vf', `fps=${VIDEO_FPS},${pad}`, '-fps_mode', 'cfr'];
    info.videoSeconds = info.captureSeconds;
  } else {
    info.timing = 'sequence';
    args = ['-framerate', String(VIDEO_FPS), '-i', path.join(framesDir, '%05d.jpg'), '-vf', pad];
    info.videoSeconds = +(frames.n / VIDEO_FPS).toFixed(1);
  }
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-crf', '23', file], { encoding: 'utf8', timeout: 10 * 60 * 1000 });
  if (r.status !== 0) { info.error = `ffmpeg failed: ${(r.stderr || r.error?.message || '').slice(0, 400)}`; return info; }
  info.file = path.relative(ROOT, file).replace(/\\/g, '/');
  info.bytes = fs.statSync(file).size;
  return info;
}

main().catch(e => { console.error(e); process.exit(2); });
