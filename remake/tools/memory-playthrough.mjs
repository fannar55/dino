#!/usr/bin/env node
// Plays a round of "Hvar er vinur minn?" (remake/minnisspil.html) in headless Edge, the way a child does:
// through the real buttons on the page (leaves, the glowing obstacle, the "who" bubbles in #who, the big tap-along
// target), with window.__memory only used to read the state back (and, in rapid mode, to hammer its ask/choose/tap
// paths during scripts). It takes screenshots at the milestones, optionally records the screen as an mp4 and writes a report.
//
//   node remake/tools/memory-playthrough.mjs --out qa/memory/lifandi/t0 [--video]
//     [--size 1280x800] [--level 1|2] [--mode full|branch|first-minute|rapid|glade|search] [--reduced-motion] [--no-tap-along] [--usual-order] [--clearance] [--gifts-last]
//     [--seed 251025] [--query "a=1&b=2"] [--page remake/minnisspil.html] [--browser edge|chrome|<exe>]
//     [--limit 25]            minutes before the run gives up
//     [--hide-hud]            the corner chip, the pause, Mosi's button and bubble and the tap targets are hidden: the pictures are the world alone (the level cards' pictures)
//     [--unlocked '["steinagljufur"]']   the page's saved key minnisspil.unlocked (the levels the child has opened): the level picker's open state (a new profile has none: level 2 is locked)
//     [--picker-check]        on the welcome card: reads the level cards (report.picker), taps the locked one (nothing may happen) and the other open one (the page must reload at its level; the run then goes on there)
//     [--wrong tunnel=brontosaurus,rocks=brontosaurus]   the wrong friend the driver tries first at an obstacle (level 2; the level's own `wrongFriends` otherwise)
//     [--wrong-all]           the story modes try every wrong friend the bubbles offer at each obstacle, one after the other (every one of level 2's goes), then the right one
//     [--qa-fail species:target]   level 2, with --query qa=1: instead of a wrong friend from the bubbles, the world is asked for that go once the target is next (the Kambeðlur at the rocks are never in the bubbles: they hold the light)
//     [--no-encode]           with --video: keep the frames and the report but do not make round.mp4 (a long encode, run it alone afterwards with --encode-only)
//     [--encode-only]         makes round.mp4, and round-sound.mp4 with the sounds the page played laid under it, from the frames of an earlier --video run in --out; no browser
//     [--stop-after-retry]    stops once a blocked crossing has started again by itself and its friends have arrived (use with --query planblock=cross)
//     [--help-shot]           taps Mosi's button ("Spyrja Mosa") once after the glade picture: a picture (mosi-ask) and report.mosiAsk (the line, the bubble's words, the lines started); an error when no line starts or the bubble stays empty
//     [--toggle-motion]       full and rapid: while Mosi first walks (the crossing) the "Rólegri hreyfing" button is pressed on and off again; report.motionToggle has his animation before, calm and after (it must stay the walk clip)
//     [--cpu-throttle 4]      CDP Emulation.setCPUThrottlingRate (a slower tablet's CPU): the whole run is that many times slower; after the final frame-rate sample the throttle is lifted
//                             and the run waits 15 s, so report.resolution.afterRelief says whether the game's dynamic resolution stepped back up
//
//   full          (after the glade picture, a picture of the overview) the whole round: a first reveal, one mismatch, the three pairs (Þríhyrnur first, so the branch has a wrong
//                 friend to pick), the branch (after ~5 s of waiting for the gold arrow, one wrong pick, then the right one and
//                 three taps in the hero shot), then the Kambeðlur, the log (one wrong pick, the Kambeðlur, then the Þríhyrnur and
//                 three taps on "Einn, tveir, ÝTA!"), the crossing, the bark (one wrong pick, the Þórseðlur, then the Kambeðlur
//                 and a tap on each of the three panels) and the grove. The twelve leaves are all found: the three gift pairs (the shrew,
//                 the hermit crab, the crab) are opened too, the first before the first friend pair, the others after the first and the second
//                 (each pair's first try is a deliberate miss: with another gift, with a friend, then the right one); report.gifts has each pair.
//   branch        like full, but stops when the branch is up and the camera is back on the glade.
//   first-minute  stops when the first pair is matched and its friends have walked home.
//   rapid         like full, but at every step it taps the right button three times in a row and then every other
//                 enabled button three times as well, and while a script runs it keeps tapping every leaf, obstacle and
//                 bubble, the way a six-year-old does. The round must still finish.
//   search        only the search: every friend pair and every gift pair found (the first tries are deliberate misses, the gifts as in `full`), the
//                 pictures of each, and a stop when every leaf is found and every gift pair is in the basket (report.allFound, report.gladeAll, the
//                 picture `all-found`). Level 2 ends its round here until its steps are built; its worst framing (report.renderMax, report.takes) has all eight friends.
//   (level 2, full: finds every pair, then every step (each with a wrong friend first and the taps), the pull and the walk over the trunk, the celebration on Sólarsyllan
//    (the sunset, the stars, the tricks, the fossils in a row: BEAT_STILLS_2) and the ending card. --first pteranodon finds the Flugeðlur first, so that they are a wrong friend at the rocks;
//    report.level2 has the light, the pile and the step state as everyone reaches Sólarsyllan.)
//   glade         only the search view: the glade picture and its measurement (report.glade), a picture of the overview, then stops.
//   --think S       full and rapid: after each pair is home the driver waits S seconds before the next leaf, as a child looks around, so the waiting
//                   friends' play (idle-play.js) is seen (default 11 in full, 0 in rapid; 0 turns it off).
//   --first SPECIES the pair found first in the non-story modes (triceratops, stegosaurus or brontosaurus), so a hold run can watch that pair's waiting place.
//   --restart-at W  celebration, ending or gift: restarts the round there ("Byrja upp á nýtt" while Mosi cheers and the gifts line is on, "Spila aftur" on the card, or while the first gift pair is rising or flying to the basket) and
//                   reports what is left running (report.restartCheck: nothing should be). On level 2 the celebration's restart comes two seconds into it, while
//                   the friends cheer (report.soundsBeforeRestart, report.soundsAfterRestart: no cheer or clap goes on).
//   --restart-at rope   level 2 (use --query qa=1): restarts while the Flugeðlur fly the rope up the cliff (report.beforeRopeRestart, report.restartCheck: the rope, the flight and the upper gorge must be reset)
//   --restart-at pull   level 2 (use --query qa=1): restarts while everyone is on the second rope, the trunk tilted (report.beforePullRestart, report.restartCheck: the trunk upright, the second
//                   rope gone, the Flugeðlur back in the glade, the basket 0 / 4)
//   --restart-at glow   level 2: pauses while the first tap's light is on the plates (report.pauseGlow: the light and the plates must not move, nor anything else), goes on, and restarts there.
//   --restart-at through   level 2 (use --query qa=1): restarts the instant the group is cut to the upper gorge, while Mosi is still hidden in the exit's dark at .02 of his size
//                   (report.beforeThroughRestart, report.afterThroughRestart: Mosi shown at his own scale on his spot, everyone in the glade, the upper gorge hidden and the lower shown)
//   Every restart ("Spila aftur" too) is checked, and what is left fails the run: a clean board (restartLeftovers: no script, beat, gift, idle game, line, card;
//   on level 2 the group in the glade, nothing flying, the tunnel dark) and each mode's own things (report.restartVerdict).
//   The longest watch (timelineCheck.longestWatch) over 9 s fails the run too, but in a slowed run (--cpu-throttle, --clearance).
//   --hold N        first-minute mode only: keeps playing N seconds after the first pair is home (the waiting friends' play, report.idle).
//   --no-tap-along  never taps in a tap-along wait, so the friends finish on their own ("Við gerum þetta saman!").
//   --usual-order   the story modes go to the log as soon as the Þríhyrnur can roll it, before the Kambeðlur are found
//                   (no wrong friend at the log then, and the crossing waits for the last pair).
//   --gifts-last    full and rapid find the three gift pairs only after every friend pair (and the bridge), so the crossing's wait for the gifts is seen:
//                   the gifts-left story, Mosi's line, the gold arrow on a shut leaf and a tap on the staging spot (report.giftsLeft), and that the crossing
//                   starts once, after the last pair has landed in the basket (report.crossAfterGifts). The wait is played in the search view:
//                   report.giftsView (the camera's intent and every shut leaf inside the frame), report.giftsArrow (the finger's box, inside the
//                   screen, off the HUD and the caption) and report.giftsGlide (the camera from the last landing to the crossing's first shot: the
//                   intents it passed, seconds, jumps, Mosi on screen; the frames are in camtrack.json).
//   --clearance     while the marsh is laid, the walk to the grove runs or a wrong friend has a go, measures the clearance between the animated bodies (the
//                   game's own anatomical envelopes) every 300 ms; report.clearance has the worst overlaps per moment
//                   (it slows the game down a little, so use it for a check run, not for timings).
//
// --level N       the level to play (adds ?bord=N, default 1): the obstacles it asks about and the friends the driver tries first at each come from its description
//                 (levels/*.js: steps, wrongFriends). In `glade` and `search` modes report.leafTargets lists the leaf buttons (16 in level 2, each at least 44 px).
//
// <out> is relative to the repo root. It gets NN-name.png at the milestones, report.json, and with --video the
// frames/00001.jpg ..., frames.txt and round.mp4 (CDP screencast, laid out by real time, 15 fps). Without --video the
// game is paused for each milestone picture (report.pauseHolds says nothing moved meanwhile); with --video a milestone
// is the screencast's frame at that instant (NN-name.jpg, 960 px), so the video keeps real time.
// report.json: { errors, steps, timeline, perf, render: { drawCalls, triangles }, glade, gladeAfter, gladeDrift, gifts, who, marks, ... }.
// `who` measures the bubbles the first time they open (each portrait's on-screen size); `marks` are named moments with
// their time into round.mp4 (branch-start / log-start / bark-start: the first tap on the obstacle, branch-end / log-end: the
// cheer, bark-end: the third panel is down).
// `timelineCheck` reads the page's own timeline: the crossing (Mosi's first step onto the deck, the arrival, input back,
// and the seconds between), the marsh (the first tap on the bark, the lay's start, the third panel down, the boardwalk
// built), the walk to the grove (Mosi's first step, all six arrived, the seconds between, the watch after), level 2's end
// (sunLedge: the walk over the trunk starting, everyone on Sólarsyllan, the ending card after the celebration) and the
// longest stretches of watching (a script, a task or a wrong friend's go running) with no new camera framing and no tap,
// with where they fall; with --video each moment also has its time in round.mp4. `takes` lists every camera framing's
// most triangles and draw calls (the shot, what was going on), the heaviest first.
// `celebration` is the page's own list of the celebration's beats in game seconds (every cut and trick, the lines, the end), `idle` the
// waiting friends' play (idle-play.js): every game that started (friend, game, game time, the not-busy seconds it had waited, how far from
// its spot it went) and `idleCheck` the two things the round must show: never two at once, and 6 to 10 seconds between starts while nothing is busy.
// `spoken` is each line of Mosi's the page started and when (game seconds; `speechCheck` counts `won` and the gifts line and says how long the gifts line took to follow Mosi's cheer); `endingCard` the ending card's words (and the gifts row).
// `gifts` lists each gift pair the driver found: { item, id (its first leaf), at (s, when it was opened), foundAt, landedAt (the basket counted it) }; `found` and `basketEnd` say what the rules
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
import { levelNumber } from '../engine/memory/levels/index.js';
import { obstaclesOf } from '../engine/memory/step-rules.js';

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
const MODES = ['full', 'branch', 'first-minute', 'rapid', 'glade', 'search'];
const VIDEO_FPS = 15;

function parseArgs(argv) {
  const o = { out: '', size: '1280x800', mode: 'full', reducedMotion: false, video: false, seed: '251025', query: '',
    page: 'remake/minnisspil.html', browser: 'edge', limit: 25, tapAlong: true, usualOrder: false, clearance: false, giftsLast: false, level: 1, hideHud: false, qaFail: null, wrong: null, wrongAll: false, encode: true, encodeOnly: false, unlocked: null, pickerCheck: false, helpShot: false, stopAfterRetry: false, toggleMotion: false, cpuThrottle: 0, hold: 0, think: null, first: null, restartAt: null };
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
    else if (a === '--hold') o.hold = Number(next());
    else if (a === '--think') o.think = Number(next());
    else if (a === '--first') o.first = next();
    else if (a === '--restart-at') { o.restartAt = next(); if (!['celebration', 'ending', 'gift', 'glow', 'through', 'rope', 'pull'].includes(o.restartAt)) throw new Error('--restart-at must be celebration, ending, gift, glow, through, rope or pull'); }
    else if (a === '--gifts-last') o.giftsLast = true;
    else if (a === '--hide-hud') o.hideHud = true;
    else if (a === '--wrong') o.wrong = Object.fromEntries(next().split(',').map(pair => pair.split('=')));
    else if (a === '--wrong-all') o.wrongAll = true;
    else if (a === '--qa-fail') o.qaFail = next();
    else if (a === '--no-encode') o.encode = false;
    else if (a === '--encode-only') o.encodeOnly = true;
    else if (a === '--picker-check') o.pickerCheck = true;
    else if (a === '--unlocked') o.unlocked = next();
    else if (a === '--level') { o.level = Number(next()); if (![1, 2].includes(o.level)) throw new Error('--level must be 1 or 2'); }
    else if (a === '--toggle-motion') o.toggleMotion = true;
    else if (a === '--help-shot') o.helpShot = true;
    else if (a === '--stop-after-retry') o.stopAfterRetry = true;
    else if (a === '--cpu-throttle') { o.cpuThrottle = Number(next()); if (!(o.cpuThrottle >= 1)) throw new Error('--cpu-throttle must be 1 or more'); }
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
  window.__taps = []; window.__origin = performance.timeOrigin; window.__sounds = {}; window.__audioLog = []; const heard = new Set();
  document.addEventListener('click', event => {
    const button = event.target.closest && event.target.closest('button'); if (!button) return;
    window.__taps.push({ t: +(performance.now() / 1000).toFixed(2), key: button.dataset.target || (button.dataset.species ? 'who-' + button.dataset.species : button.id || 'button') });
  }, true);
  // Frame times while a script runs (shots re-solve, gestures, dashes), apart from the idle sample at the end.
  window.__scenePerf = []; let previous = 0;
  const tick = now => { const d = window.__demoStats; if (previous && d && d.scene && d.scene.busy) window.__scenePerf.push(now - previous); previous = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  // The camera on every frame while gifts are still to land, 8 s after the last one lands and for 4 s after the crossing starts (the last 900 frames kept): report.giftsGlide reads the glide out of the last landing from it.
  window.__camTrack = []; let trackStop = 0, lastLeft = -1e9;
  const track = now => {
    const m = window.__memory, d = window.__demoStats, c = d && d.camera;
    if (m && c && c.position && !(trackStop && now > trackStop)) {
      const b = m.bridge(), cross = b.active === 'cross';
      if (cross && !trackStop) trackStop = now + 4000;
      if (m.giftsLeft().toLand > 0) lastLeft = now; // (and for 8 s after the last pair lands, so the glide to the crossing is kept)
      if (cross || now - lastLeft < 8000 || trackStop) {
        const ring = window.__camTrack;
        ring.push({ t: +(now / 1000).toFixed(3), p: c.position.map(v => +v.toFixed(2)), g: c.target.map(v => +v.toFixed(2)), intent: c.intent, moving: Boolean(c.moving), shot: c.shot || null, held: Boolean(c.held), cross, basket: m.basket(), flying: (d.cells || []).some(x => x.gift && ['rise', 'fly'].includes(x.gift.phase)) });
        if (ring.length > 900) ring.shift();
      }
    }
    requestAnimationFrame(track);
  };
  requestAnimationFrame(track);
  setInterval(() => {
    const m = window.__memory; if (!m) return;
    const d = window.__demoStats || {}, cam = d.camera || {}, s = m.state(), b = m.bridge(), who = m.who ? m.who() : {}, w = d.scene && d.scene.waiting;
    window.__max.drawCalls = Math.max(window.__max.drawCalls, d.drawCalls || 0);
    window.__max.triangles = Math.max(window.__max.triangles, d.triangles || 0);
    // The render scale the game's dynamic resolution chose: the lowest it went and every change (it steps down when frames are slow and back up when there is headroom).
    if (Number.isFinite(d.resolutionScale)) { const r = (window.__res ||= { min: d.resolutionScale, last: d.resolutionScale, changes: [] }); r.min = Math.min(r.min, d.resolutionScale); if (d.resolutionScale !== r.last) { r.changes.push({ t: +(performance.now() / 1000).toFixed(1), from: r.last, to: d.resolutionScale }); r.last = d.resolutionScale; } }
    // The sounds the page played (kind and whether recorded or its synth fallback), each counted once.
    for (const entry of (m.audio ? m.audio().log : []) ?? []) { const id = entry.kind + '@' + entry.start; if (!heard.has(id)) { heard.add(id); const k = entry.kind + ':' + entry.source; window.__sounds[k] = (window.__sounds[k] ?? 0) + 1; if (entry.asset && entry.at) window.__audioLog.push({ asset: entry.asset, kind: entry.kind, at: entry.at, level: entry.level, rate: entry.rate, duration: +(entry.end - entry.start).toFixed(3) }); } }
    const word = document.getElementById('beat-word').classList.contains('show') ? document.getElementById('beat-word').textContent : '', ending = !document.getElementById('ending').hidden;
    const caption = document.getElementById('caption')?.textContent || '', bubbles = who.open ? who.candidates.join('+') : null, wait = w ? w.target + ':' + w.count : null;
    const shot = cam.shot || (cam.returning ? 'return' : ''), scene = Boolean(d.scene && d.scene.busy), takeNumber = cam.takes || 0;
    const adventure = d.bridge && d.bridge.action, upperAction = d.levelStats && d.levelStats.upper && d.levelStats.upper.action, act = adventure ? adventure.id + ':' + adventure.phase : upperAction ? upperAction.id + ':' + upperAction.phase : null;
    const placed = d.bridge && d.bridge.boardwalk ? d.bridge.boardwalk.panels.filter(p => p.placed).length : 0;
    // The most triangles and draw calls of each camera framing (a shot, a glide, the way back), with what was going on.
    const take = window.__takes[cam.takes || 0] ||= { take: cam.takes || 0, t: +(performance.now() / 1000).toFixed(2), shot: cam.shot || (cam.returning ? 'return' : ''), act, tris: 0, calls: 0 };
    take.tris = Math.max(take.tris, d.triangles || 0); take.calls = Math.max(take.calls, d.drawCalls || 0); take.actEnd = act;
    // How much of that the friends are (the skins and their shadow twins of the ones drawn) and how many are drawn.
    const lod = d.characterLod || [], bodies = lod.filter(c => c.rendered); if ((d.triangles || 0) >= take.tris) { take.actors = Math.round(bodies.reduce((sum, c) => sum + c.mainTriangles + c.shadowTriangles, 0) / 1000); take.drawn = bodies.length; }
    // What each walker of the running action has done (its start and finish in the action's own seconds), the last look.
    if (adventure && d.bridge.routes) (window.__routes ||= {})[adventure.id] = { elapsed: +adventure.elapsed.toFixed(2), routes: d.bridge.routes.map(r => ({ member: r.member, delay: r.delay == null ? null : +r.delay.toFixed(2), duration: +r.duration.toFixed(2), finishedAt: r.finishedAt == null ? null : +r.finishedAt.toFixed(2) })) };
    const mosi = d.scene && d.scene.mosiWalk ? (d.scene.mosiWalk.onDeck ? 'deck' : 'walk') : null;
    const key = [caption, s.phase, s.matchedPairs, b.active, b.failing, b.branch, b.bridgeBuilt, b.atStaging, b.boardwalkBuilt, b.visited, cam.mode, cam.moving, cam.held, bubbles, wait, shot, scene, takeNumber, act, mosi, placed, s.paused, word, ending, b.onSunLedge].join('|');
    if (key !== last) {
      last = key;
      window.__tl.push({ t: +(performance.now() / 1000).toFixed(2), caption, phase: s.phase, pairs: s.matchedPairs, active: b.active, branch: b.branch,
        bridge: b.bridgeBuilt, staging: b.atStaging, walk: b.boardwalkBuilt, visited: b.visited, cam: (cam.mode || '') + (cam.moving ? '*' : ''), held: Boolean(cam.held), failing: b.failing, who: bubbles, wait, shot, scene, take: takeNumber, act, mosi, placed, paused: Boolean(s.paused), word, ending, sun: b.onSunLedge || undefined, gt: d.levelStats && d.levelStats.upper ? d.levelStats.upper.clock : undefined });
    }
  }, 100);
  // The upper gorge's sight (level 2, ?qa=1): every 300 ms, which friends the camera sees, whether a block or the ground stands between, and whether the HUD or Mosi's bubble covers one.
  window.__sight = { takes: {}, events: [] };
  const HUD = ['progress', 'basket', 'pause', 'mosi-help', 'caption', 'who', 'beat-word', 'holding', 'coach'];
  setInterval(() => {
    const g = window.__gorge, d = window.__demoStats; if (!g || !g.api || !g.api.qaSight || !d) return;
    const sight = g.api.qaSight(); if (!sight) return;
    const cam = d.camera || {}, take = (window.__sight.takes[cam.takes || 0] ||= { take: cam.takes || 0, shot: cam.shot || '', samples: 0, inView: 0, hidden: 0, hiddenBy: {}, hud: 0, hudBy: {}, hiddenNames: {} });
    const rects = HUD.map(id => { const el = document.getElementById(id); if (!el || el.hidden) return null; const r = el.getBoundingClientRect(), style = getComputedStyle(el); return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.3 ? { id, r } : null; }).filter(Boolean);
    let hidden = 0, hud = 0;
    for (const item of sight.items) {
      if (item.by) { hidden++; take.hiddenBy[item.by] = (take.hiddenBy[item.by] || 0) + 1; take.hiddenNames[item.name] = (take.hiddenNames[item.name] || 0) + 1; continue; }
      const covered = rects.find(({ r }) => item.x >= r.left && item.x <= r.right && item.y >= r.top && item.y <= r.bottom);
      if (covered) { hud++; take.hudBy[covered.id] = (take.hudBy[covered.id] || 0) + 1; }
    }
    take.samples++; take.inView = Math.max(take.inView, sight.items.length); take.hidden = Math.max(take.hidden, hidden); take.hud = Math.max(take.hud, hud); take.act = d.levelStats && d.levelStats.upper && d.levelStats.upper.action ? d.levelStats.upper.action.id + ':' + d.levelStats.upper.action.phase : take.act;
    const fresh = sight.items.filter(i => i.by && !(window.__sight.seen ||= new Set()).has(take.take + i.name)); fresh.forEach(i => window.__sight.seen.add(take.take + i.name));
    if (fresh.length && window.__sight.events.length < 120) window.__sight.events.push({ t: +(performance.now() / 1000).toFixed(1), take: take.take, shot: take.shot, cameraAt: sight.cameraAt, hidden: fresh.map(i => i.name + ' ' + JSON.stringify(i.at) + ' by ' + i.by + ' ' + JSON.stringify(i.hit)) });
    if (sight.roof !== null) { take.roof = Math.min(take.roof ?? 99, sight.roof); }
  }, 300);
})()`;

// --clearance: while the marsh is laid or the walk to the grove runs, the game's own clearance audit (the anatomical
// envelopes of the six friends and Mosi, the props) every 300 ms; the worst overlap of each pair at each moment is kept.
const CLEARANCE_JS = `(async () => {
  const { assessSceneClearances } = await import('/remake/engine/memory/memory-clearance.js');
  window.__clr = { samples: 0, minimum: null, worst: {}, plants: { samples: 0, minimum: null, closest: null } };
  // Every 300 ms: how close each friend's feet and Mosi come to the plants the layout placed (the footprint of each kind and
  // size, and half a body's width): a negative number is a plant in somebody's way.
  const FOOT = { fern: .45, bush: .9, rock: .85, rockSmall: .4, flowers: .2, horsetailReed: .5, horsetailTall: .45, treeFern: .4, cycad: .5 };
  setInterval(() => {
    const d = window.__demoStats; if (!d || !d.dressing) return;
    const walkers = [...d.cells.filter(c => c.position).map(c => ({ at: c.position, half: .55 })), { at: d.scene.mosiPosition, half: .9 }];
    const clr = window.__clr.plants; clr.samples++;
    for (const w of walkers) for (const p of d.dressing) {
      const gap = Math.hypot(w.at[0] - p.position[0], w.at[2] - p.position[1]) - (FOOT[p.name] ?? .4) * p.scale - w.half;
      if (clr.minimum === null || gap < clr.minimum) { clr.minimum = +gap.toFixed(2); clr.closest = { plant: p.name, scale: p.scale, at: p.position, walker: w.at.map(v => +v.toFixed(1)), t: +(performance.now() / 1000).toFixed(1) }; }
    }
  }, 300);
  setInterval(() => {
    const d = window.__demoStats, action = d && d.bridge && d.bridge.action, playing = d && d.idle && d.idle.active; if (!playing && (!action || !['lay', 'finish', 'fail'].includes(action.id))) return;
    const stats = window.__memory.stats({ collision: true }); stats.collisionObjects = []; // the glade's scenery is far from the marsh; the log, branch and carried bark stay
    const result = assessSceneClearances(stats), clr = window.__clr;
    clr.samples++; if (result.minimum !== null) clr.minimum = clr.minimum === null ? result.minimum : Math.min(clr.minimum, result.minimum);
    for (const hit of result.violations) {
      const key = (playing ? 'idle/' + playing.game : action.id + '/' + action.phase) + ':' + hit.a + ':' + hit.b + ':' + hit.kindA + ':' + hit.kindB;
      if (!clr.worst[key] || hit.clearance < clr.worst[key].clearance) clr.worst[key] = { key, clearance: +hit.clearance.toFixed(3), age: +((playing ? playing.age : action.age) || 0).toFixed(2), t: +(performance.now() / 1000).toFixed(2) };
    }
  }, 300);
})()`;

// What a restart must leave: a clean board, no script, no beat, no gift, no idle game, nothing said, nothing on the ending card.
const RESTART_JS = `(() => { const m = window.__memory, d = m.stats(), s = m.state(), b = m.bridge();
  return { phase: s.phase, matched: s.matchedPairs, cards: s.cards.length, hiddenCards: s.cards.filter(c => c.status === 'hidden').length, bridge: { active: b.active, visited: b.visited, asking: b.asking, branch: b.branch, boardwalkBuilt: b.boardwalkBuilt },
    sceneBusy: d.scene.busy, waiting: d.scene.waiting, beats: d.scene.beats.length, gifts: d.scene.gifts, idleActive: d.idle && d.idle.active, idleStarts: d.idle && d.idle.starts.length,
    ending: !document.getElementById('ending').hidden, endingGifts: !document.getElementById('ending-gifts').hidden, who: !document.getElementById('who').hidden, word: document.getElementById('beat-word').classList.contains('show'),
    basketText: document.getElementById('basket-text').textContent, giftPhases: d.cells.filter(c => c.gift).map(c => c.gift.phase), giftModelsVisible: d.cells.filter(c => c.gift && c.gift.model && c.gift.model.visible).length, creditsOpen: !document.getElementById('credits').hidden,
    tunnel: (d.levelStats && d.levelStats.tunnel) || null, upper: (d.levelStats && d.levelStats.upper) || null, dusk: (d.levelStats && d.levelStats.dusk) || null, stars: (d.levelStats && d.levelStats.stars) || null, holding: (b.holding || null), action: b.action || null,
    flights: window.__gorge ? window.__gorge.stage.babies.map(a => a.getDebugState().flight).filter(Boolean).length : null, ropeVisible: window.__gorge ? window.__gorge.rope.visible : null, rope2Visible: window.__gorge && window.__gorge.rope2 ? window.__gorge.rope2.visible : null, trunk: window.__gorge && window.__gorge.trunk ? window.__gorge.trunk.debug() : null, flyersHome: window.__gorge ? window.__gorge.stage.babies.filter(a => a.species === 'pteranodon').map(a => ({ visible: a.root.visible, flight: Boolean(a.getDebugState().flight), y: +a.root.position.y.toFixed(2) })) : null, babiesVisible: window.__gorge ? window.__gorge.stage.babies.filter(a => a.root.visible).length : null, babiesTilted: window.__gorge ? window.__gorge.stage.babies.filter(a => Math.abs(a.root.rotation.z) > 1e-6 || Math.abs(a.root.rotation.x) > 1e-6).length : null, lowerVisible: window.__gorge ? window.__gorge.gorge.group.visible : null, upperVisible: window.__gorge ? window.__gorge.upper.group.visible : null,
    caption: document.getElementById('caption').textContent, camera: { mode: d.camera.mode, shot: d.camera.shot, held: d.camera.held }, visibleFriends: d.cells.filter(c => c.actorVisible).length, speech: m.audio().speech.current, speechPending: m.audio().speech.pending, basket: m.basket(), found: m.state().found.length }; })()`;

// (final fix round 1, T-I3) What RESTART_JS read that a restart has left behind: [] for a clean board. Level 2's part (the group in the glade, nothing flying, the
// tunnel dark, the gorges as they start) is read where the page gives it (levelStats; window.__gorge with ?qa=1).
function restartLeftovers(c) {
  if (!c) return ['nothing could be read after the restart'];
  const bad = [], add = (wrong, what) => { if (wrong) bad.push(what); };
  add(c.phase !== 'ready', `the phase is ${c.phase}`);
  add(c.matched || c.found || c.basket || c.hiddenCards !== c.cards, `the board is not new (${c.matched} pairs, ${c.found} found, ${c.basket} in the basket, ${c.hiddenCards} of ${c.cards} leaves shut)`);
  add(!/^0\s*\/\s*[1-9]\d*$/.test((c.basketText || '').trim()), `the basket says ${JSON.stringify(c.basketText)}`);
  add(c.bridge?.active || c.bridge?.asking || c.action || c.holding, `a step goes on (${JSON.stringify({ active: c.bridge?.active, asking: c.bridge?.asking, action: c.action, holding: c.holding })})`);
  add(c.sceneBusy || c.waiting || c.beats, `a script goes on (busy ${c.sceneBusy}, waiting ${JSON.stringify(c.waiting)}, ${c.beats} beats)`);
  add(c.gifts !== 'none' || c.giftPhases?.length || c.giftModelsVisible, `a gift is out (${c.gifts}, phases ${JSON.stringify(c.giftPhases)}, ${c.giftModelsVisible} shown)`);
  add(c.idleActive, `an idle game goes on (${JSON.stringify(c.idleActive)})`);
  add(c.speech || c.speechPending, `Mosi still speaks (${JSON.stringify(c.speech ?? c.speechPending)})`);
  add(c.ending || c.endingGifts || c.creditsOpen || c.who || c.word, `something is still on the screen (${['ending', 'endingGifts', 'creditsOpen', 'who', 'word'].filter(k => c[k]).join(', ')})`);
  if (c.tunnel) add(c.tunnel.light || c.tunnel.plates || c.tunnel.pile || c.tunnel.falling, `the tunnel is not dark and shut (${JSON.stringify({ light: c.tunnel.light, plates: c.tunnel.plates, pile: c.tunnel.pile, falling: c.tunnel.falling })})`);
  if (c.upper) add(c.upper.where !== 'glade' || c.upper.action || c.upper.walking || c.upper.visible, `the group is not back in the glade (${JSON.stringify({ where: c.upper.where, action: c.upper.action, walking: c.upper.walking, upperShown: c.upper.visible })})`);
  add(c.flights, `${c.flights} friends still fly`);
  add(c.ropeVisible || c.rope2Visible, `a rope is still drawn (${c.ropeVisible ? 'the first' : 'the second'})`);
  add(c.babiesTilted, `${c.babiesTilted} friends are still tilted`);
  add(c.lowerVisible === false || c.upperVisible === true, `the gorges are not as they start (lower shown ${c.lowerVisible}, upper shown ${c.upperVisible})`);
  return bad;
}

// (final fix round 1, G-I1) Level 2 with ?qa=1: where the upper mover is and how Mosi stands (shown, his scale and the base a pop grows him back to, how far from his spot), and
// which of the two gorges is shown. THROUGH_CUT_JS restarts in the same breath once the mover is past the cut ('exit'), so the restart comes before Mosi pops out.
const THROUGH_JS = `(() => { const g = window.__gorge; if (!g) return null; const m = g.stage.mosi.actor, u = g.mover.upper, d = u.debug(), spot = g.stage.level.mosiSpot;
  return { phase: d.action ? d.action.phase : null, where: d.where, walking: d.walking, upperVisible: g.upper.group.visible, lowerVisible: g.gorge.group.visible,
    mosi: { visible: m.root.visible, scale: +m.root.scale.x.toFixed(4), base: u.walkers.baseOf(m) ?? null, fromSpot: +Math.hypot(m.root.position.x - spot.x, m.root.position.z - spot.z).toFixed(2) } }; })()`;
const THROUGH_CUT_JS = `(() => { const now = ${THROUGH_JS}; if (now && now.phase === 'exit') window.__memory.restart(); return now; })()`;

// The wait for the gifts is played in the search view: the camera's intent, and every leaf that is still shut inside the frame, how big each is.
// (Task 7 fix round 1) Level 2, ?qa=1: the stars a child plainly sees now: out (hidden.notOut: the ones that would be seen once out), above the haze, on the screen below the HUD and above Mosi's bubble, and not behind the cliffs
// (a ray from the camera through the upper gorge). The camera is the one the page reports (__demoStats.camera), as qaSight builds it.
const SKY_JS = `(() => { const g = window.__gorge, d = window.__demoStats && window.__demoStats.camera; if (!g || !g.stars || !d || !d.position || !d.target) return null;
  const T = g.stage.THREE, cam = new T.PerspectiveCamera(35, innerWidth / innerHeight, .1, 600); cam.position.fromArray(d.position); cam.lookAt(new T.Vector3().fromArray(d.target)); cam.updateMatrixWorld(true);
  const p = g.stars.points, pos = p.geometry.attributes.position, order = p.geometry.attributes.aOrder, out = g.stars.debug().out, R = new T.Raycaster();
  const hud = Math.max(0, ...[...document.querySelectorAll('.topbar, .topbar *')].filter(e => e.offsetParent !== null).map(e => e.getBoundingClientRect().bottom));
  const coach = document.getElementById('coach'), card = document.getElementById('ending');
  const below = Math.min(innerHeight, coach && !coach.hidden ? coach.getBoundingClientRect().top : innerHeight, card && !card.hidden ? card.getBoundingClientRect().top : innerHeight);
  const look = new T.Vector3(); cam.getWorldDirection(look);
  const hidden = { notOut: 0, haze: 0, hud: 0, below: 0, rock: 0 }, seen = [];
  for (let i = 0; i < pos.count; i++) { const dir = new T.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)), w = cam.position.clone().addScaledVector(dir, 450).project(cam);
    if (!(Math.abs(w.x) <= 1 && Math.abs(w.y) <= 1 && w.z < 1)) continue;
    const x = Math.round((w.x + 1) / 2 * innerWidth), y = Math.round((1 - w.y) / 2 * innerHeight);
    const late = order.getX(i) + .9 > out; if (dir.y < .012) { hidden.haze++; continue; }
    if (y < hud + 4) { hidden.hud++; continue; } if (y > below - 4) { hidden.below++; continue; }
    R.set(cam.position, dir.clone().normalize()); R.near = .1; R.far = 440; if (R.intersectObject(g.upper.group, true).length) { hidden.rock++; continue; }
    if (late) { hidden.notOut++; continue; }
    seen.push({ i, x, y, first: i < g.stars.first }); }
  return { seen: seen.length, first: seen.filter(s => s.first).length, hidden, hud: Math.round(hud), look: [+((Math.atan2(look.z, look.x) * 180 / Math.PI + 360) % 360).toFixed(1), +(Math.asin(look.y) * 180 / Math.PI).toFixed(1)], out: g.stars.debug().out, at: seen.slice(0, 40).map(s => [s.x, s.y]) }; })()`;
const GIFTS_VIEW_JS = `(() => { const d = window.__memory.stats({ measure: true }), f = d.frame, shut = f.leaves.filter(l => l.status === 'hidden');
  return { intent: d.camera.intent, moving: d.camera.moving, size: f.size, shutLeaves: shut.length, shutInside: shut.every(l => l.inside), outside: shut.filter(l => !l.inside).map(l => l.cell),
    leafPxMin: { width: Math.round(Math.min(...shut.map(l => l.width))), height: Math.round(Math.min(...shut.map(l => l.height))) }, mosiInside: f.mosi.inside, homesInside: f.homes.every(h => h.inside), mosiAt: d.scene.mosiPosition }; })()`;

// The finger over a guided target (its .tap-hint: the ring and the drawn finger), from the element's own box: whether it is shown and inside the screen, and what it overlaps of the HUD, Mosi's button and the caption.
const ARROW_JS = `(() => {
  const el = document.querySelector('#targets .is-guided'); if (!el) return null;
  const hint = el.querySelector('.tap-hint'); if (!hint) return { leaf: el.dataset.target, noHint: true };
  const r = el.getBoundingClientRect(), h = hint.getBoundingClientRect(), style = getComputedStyle(hint), W = h.width, H = h.height;
  const cx = h.left + W / 2, cy = h.top + H / 2, half = (W + H) / 4;
  const box = (pad, bob) => ({ left: Math.round(cx - half - pad), top: Math.round(cy - half - pad - bob), right: Math.round(cx + half + pad), bottom: Math.round(cy + half + pad + bob) });
  const core = box(0, 4), glow = box(12, 4);
  const hits = [['tally', '.tally'], ['controls', '.corner'], ['mosi', '#mosi-help'], ['caption', '#coach']].map(([name, selector]) => { const e = document.querySelector(selector), b = e && !e.closest('[hidden]') ? e.getBoundingClientRect() : null; return b && b.width ? { name, overlap: core.left < b.right && core.right > b.left && core.top < b.bottom && core.bottom > b.top, glowOverlap: glow.left < b.right && glow.right > b.left && glow.top < b.bottom && glow.bottom > b.top } : null; }).filter(Boolean);
  return { leaf: el.dataset.target, leafBox: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), width: Math.round(r.width), height: Math.round(r.height) },
    arrow: { width: Math.round(W), height: Math.round(H), shown: Number(style.opacity) > 0.5, display: style.display, hasRing: !!hint.querySelector('.tap-ring'), hasFinger: !!hint.querySelector('svg'), side: Math.round(half * 2) }, core, glow,
    insideScreen: core.left >= 0 && core.top >= 0 && core.right <= innerWidth && core.bottom <= innerHeight, glowInside: glow.left >= 0 && glow.top >= 0 && glow.right <= innerWidth && glow.bottom <= innerHeight,
    overHud: hits.filter(h => h.overlap).map(h => h.name), glowOverHud: hits.filter(h => h.glowOverlap).map(h => h.name) }; })()`;

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
    who, story: { key: story.key, kind: story.kind, target: story.target || null, available: Boolean(story.available), automatic: Boolean(story.automatic) },
    giftPhases: (d.cells || []).filter(c => c.gift).map(c => c.gift.phase), giftsLeft: m.giftsLeft(),
    guidedLeaf: (document.querySelector('#targets .is-guided[data-target^="leaf-"]') || {}).dataset?.target || null,
    wait: w ? { target: w.target, count: w.count, left: w.left } : null, idle: m.idle(),
    trying: Object.values((d.bridge && d.bridge.pairs) || {}).some(p => (p.actors || []).some(a => (a.gesture || '').startsWith('fail-'))),
    arrow: Boolean(document.querySelector('#targets .is-guided')),
    tunnel: (d.levelStats && d.levelStats.tunnel) || null, upper: (d.levelStats && d.levelStats.upper) || null, programs: d.programs ?? null,
    cancel: !cancel.hidden && !cancel.disabled,
    blocked: d.bridge && d.bridge.blocked ? d.bridge.blocked.length : 0,
    cancelBox: (() => { const r = cancel.getBoundingClientRect(), cs = getComputedStyle(cancel); return { hidden: cancel.hidden, disabled: cancel.disabled, shown: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, box: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) } }; })(),
    enabled: [...buttons.filter(x => !x.disabled).map(x => x.dataset.target), ...bubbles],
    walking: (d.cells || []).some(c => c.moving || c.queued) || (d.cells || []).some(c => c.status === 'matched' && !c.moved),
    ending: !document.getElementById('ending').hidden, beats: (d.scene && d.scene.beats || []).map(b => b.name), idle: d.idle && d.idle.active ? d.idle.active.game : null,
    caption: document.getElementById('caption')?.textContent || '',
  };
})()`;

// Everything that moves, as one list of numbers: the camera, every visible friend's root and nose, Mosi's head.
const POSE_JS = `(() => {
  const d = window.__memory.stats(), values = [...d.camera.position, ...d.camera.target];
  for (const c of d.cells) if (c.position) values.push(...c.position, ...c.feet.flatMap(f => f.position));
  return { values, scene: Boolean(d.scene && d.scene.busy), shot: d.camera.shot || null };
})()`;

// Can a finger reach a button? Its box is sampled on a 5 x 5 grid and each point is asked which element is on top there (elementFromPoint leaves out what has pointer-events: none): how much of the
// button is the topmost thing, whether the middle is, whether the whole box is inside the screen, and what covers the rest (another target's key, a HUD part's id or class).
const REACH_FN = `const reach = el => {
  const r = el.getBoundingClientRect(), covers = {}; let hits = 0;
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const x = r.left + r.width * (i + .5) / 5, y = r.top + r.height * (j + .5) / 5;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) { covers.offscreen = (covers.offscreen ?? 0) + 1; continue; }
    const top = document.elementFromPoint(x, y);
    if (top && (top === el || el.contains(top))) hits++; else { const name = top ? (top.closest('button')?.dataset.target || top.closest('[id]')?.id || String(top.className).split(' ')[0] || top.tagName) : 'nothing'; covers[name] = (covers[name] ?? 0) + 1; }
  }
  const c = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)));
  return { disabled: Boolean(el.disabled), percent: Math.round(hits * 4), centreHit: Boolean(c && (c === el || el.contains(c))), inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    box: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }, covers };
};`;
const reachJs = key => `(() => { ${REACH_FN}
  const key = ${JSON.stringify(key)}, el = key.startsWith('who-') ? document.querySelector('#who [data-species="' + key.slice(4) + '"]') : key === 'cancel-choice' ? document.getElementById('cancel-choice') : document.querySelector('[data-target="' + key + '"]');
  return el ? { found: true, ...reach(el) } : { found: false }; })()`;
// Every enabled target (a leaf, an obstacle, a home) and the bubbles that a finger cannot fully reach right now.
const ENABLED_REACH_JS = `(() => { ${REACH_FN}
  return [...document.querySelectorAll('#targets .world-target:not(:disabled), #who .who-friend')].filter(el => !el.closest('[hidden]')).map(el => ({ key: el.dataset.target || 'who-' + el.dataset.species, ...reach(el) })).filter(x => x.percent < 70 || !x.centreHit || !x.inside); })()`;

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
const hammerJs = level => `(() => {
  const m = window.__memory, s = m.state();
  for (const target of ${JSON.stringify(Object.keys(obstaclesOf(level)))}) { m.ask(target); m.tap(target); }
  for (const species of ${JSON.stringify(level.friends)}) m.choose(species);
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
  // `input` is now the ending card: the celebration (a script) runs between the arrival and it.
  const groveInput = groveArrive && timeline.find(e => e.t >= groveArrive.t && e.visited && e.ending);
  // Level 2's end: the walk over the trunk starting, everyone on Sólarsyllan (the walk is over), and the ending card after the celebration.
  const sunWalk = timeline.find(e => e.active === 'walk'), sunArrive = timeline.find(e => e.sun), sunInput = sunArrive && timeline.find(e => e.t >= sunArrive.t && e.ending);
  return {
    framings: events.filter(e => !e.what.startsWith('tap')).length, taps: (taps ?? []).length,
    crossing: firstStep ? { firstStep: firstStep.t, deck: deck?.t ?? null, arrive: arrive?.t ?? null, input: input?.t ?? null, deckToInput: span(deck, input), firstStepToArrive: span(firstStep, arrive), firstStepToInput: span(firstStep, input) } : null,
    marsh: layStart ? { firstTap: barkTap?.t ?? null, layStart: layStart.t, lastPanel: lastPanel?.t ?? null, boardwalk: built?.t ?? null, tapToLastPanel: barkTap && lastPanel ? span(barkTap, lastPanel) : null, layToLastPanel: span(layStart, lastPanel), layToBoardwalk: span(layStart, built) } : null,
    grove: groveStep ? { firstStep: groveStep.t, arrive: groveArrive?.t ?? null, input: groveInput?.t ?? null, firstStepToArrive: span(groveStep, groveArrive), watchAfterArrival: span(groveArrive, groveInput) } : null,
    sunLedge: sunWalk ? { walk: sunWalk.t, arrive: sunArrive?.t ?? null, input: sunInput?.t ?? null, walkToArrive: span(sunWalk, sunArrive), watchAfterArrival: span(sunArrive, sunInput), walkToInput: span(sunWalk, sunInput) } : null,
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

// The waiting friends' play (idle-play.js), checked over the round: never two at once, and each game starting 6 to 10 seconds
// (of not-busy time) after the one before; no friend further than 1.5 m from its spot.
function idleCheck(idle) {
  if (!idle) return null;
  const starts = idle.starts ?? [], waits = starts.map(item => item.waited), games = {}, friends = {};
  for (const item of starts) { games[item.game] = (games[item.game] ?? 0) + 1; friends[item.friend] = (friends[item.friend] ?? 0) + 1; }
  // Two at once would be a start before the game before it ended (a game that was cut short by something busy ends at that moment).
  const overlapping = starts.filter((item, i) => i && starts[i - 1].ended != null && item.t < starts[i - 1].ended - 1e-6 || i && starts[i - 1].ended == null);
  const outOfRange = starts.filter(item => item.waited < IDLE_GAP.min - .001 || item.waited > IDLE_GAP.max + .1);
  const far = Math.max(0, ...starts.map(item => item.far ?? 0));
  return { starts: starts.length, games, friends, glances: idle.glances, overlapsInGame: idle.overlaps, overlapping: overlapping.length, spacing: { min: waits.length ? Math.min(...waits) : null, max: waits.length ? Math.max(...waits) : null, outOfRange: outOfRange.map(item => ({ t: item.t, waited: item.waited, game: item.game })) },
    farthestFromSpot: far, stopped: starts.reduce((all, item) => ({ ...all, [item.stopped ?? 'running']: (all[item.stopped ?? 'running'] ?? 0) + 1 }), {}),
    passed: !overlapping.length && !idle.overlaps && !outOfRange.length && far <= 1.5 };
}
const IDLE_GAP = { min: 6, max: 10 };

async function main() {
  const o = parseArgs(process.argv.slice(2));
  // The level being played: what it has to be asked (the one pair that can do each obstacle, the game's own rule: step-rules.js obstaclesOf), whom the driver tries first at each (its `wrongFriends`).
  const LEVEL = levelNumber(o.level), OBSTACLE_IDS = Object.keys(obstaclesOf(LEVEL));
  const RIGHT = Object.fromEntries(Object.entries(obstaclesOf(LEVEL)).map(([target, value]) => [target, value.species]));
  const outDir = path.resolve(ROOT, o.out);
  await fsp.mkdir(outDir, { recursive: true });
  const framesDir = path.join(outDir, 'frames');
  if (o.video) { await fsp.rm(framesDir, { recursive: true, force: true }); await fsp.mkdir(framesDir, { recursive: true }); }

  const errors = [];
  const report = {
    page: o.page, level: o.level, mode: o.mode, size: o.size, seed: o.seed, query: o.query, reducedMotion: o.reducedMotion, cpuThrottle: o.cpuThrottle || null, startedAt: new Date().toISOString(),
    finished: false, stalled: null, roundSeconds: null, errors, steps: [], shots: [], pauseHolds: [], timeline: [], perf: null, render: null, renderMax: null, gpu: null, video: null,
  };
  // (final fix round 1, T-I3) A restart's verdict: the mode's own [wrong, what] pairs, then restartLeftovers over report.restartCheck; each that is wrong fails the run.
  const restartVerdict = (mode, own = []) => {
    const bad = [...own.filter(([wrong]) => wrong).map(([, what]) => what), ...restartLeftovers(report.restartCheck)];
    report.restartVerdict = { mode, passed: !bad.length, bad };
    if (bad.length) errors.push(`--restart-at ${mode}: ${bad.join('; ')}`);
    return report.restartVerdict;
  };
  const server = await startServer();
  const query = [`seed=${o.seed}`, o.level > 1 ? `bord=${o.level}` : '', o.query].filter(Boolean).join('&');
  const url = `http://127.0.0.1:${server.address().port}/${o.page.replace(/\\/g, '/').replace(/^\//, '')}?${query}`;
  const browser = await launchBrowser(o).catch(error => { server.close(); throw error; });
  const { cdp } = browser;
  // (final fix round 1, T-M12) Ctrl+C: the browser and the server are stopped before the process goes, as the finally below does.
  let interrupted = false;
  const onInterrupt = () => {
    if (interrupted) return; interrupted = true;
    console.error('Interrupted: stopping the browser and the server (the report is not written)');
    stopBrowser(browser).catch(() => {}).finally(() => { server.close(); process.exit(130); });
  };
  process.on('SIGINT', onInterrupt);
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
    const phone = o.width < 768 || o.height < 500; // (a phone held sideways, 844x390, is a phone too: touch and the mobile media features)
    await send('Emulation.setDeviceMetricsOverride', { width: o.width, height: o.height, deviceScaleFactor: 1, mobile: phone });
    if (phone) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (o.cpuThrottle > 1) await send('Emulation.setCPUThrottlingRate', { rate: o.cpuThrottle });
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

    // Mosi's repeat (once idle passes 10 s with a line for the moment): wait at a moment that has a line until idle is about 15 s; the line must begin once more, and never twice for the same moment.
    // The page's own record of every line that began, with the story key it began under (polled every 100 ms), so that the repeat can be told from the line itself.
    const LINELOG_JS = `(() => { if (window.__lineLog) return; window.__lineLog = []; let seen = 0; setInterval(() => { const st = window.__memory.audio().speech.started, last = window.__memory.lastLine(); for (; seen < st.length; seen++) window.__lineLog.push({ id: st[seen].id, t: st[seen].t, key: last ? last.key : null }); }, 100); })()`;
    const idleRepeatCheck = async where => {
      if (report.idleRepeat) return;
      const key = (await ev(SNAPSHOT_JS)).story.key, last = await ev('window.__memory.lastLine()');
      const line = (last?.key === key ? last.id : LEVEL.voice?.[key]) ?? null;
      const lines = async () => (await ev('window.__lineLog || []')).filter(x => x.key === key && x.id === line);
      let at = null, waited = false;
      if (line && (await lines()).length < 2) {
        // (a touch on the empty screen: the idle clock starts from 0, so the wait is the whole 15 s and the repeat falls inside it)
        await ev("document.getElementById('game').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))");
        step(`idle wait for Mosi's repeat (${where})`, { key, line }); waited = true;
        // (about 15 s: the repeat also waits until his voice has been quiet 3 s, so a line still playing may push it a little later; up to 24 s)
        await waitFor(`window.__memory.idle() > 15 && (window.__memory.idle() > 24 || window.__lineLog.filter(x => x.key === ${JSON.stringify(key)} && x.id === ${JSON.stringify(line)}).length >= 2)`, 60000, "Mosi's repeat"); await sleep(2000);
      }
      const same = line ? await lines() : [], now = await ev(SNAPSHOT_JS);
      at = same[1]?.t ?? null;
      report.idleRepeat = { key, line, at, beganOnTheMoment: same.length, repeats: Math.max(0, same.length - 1), earlierInTheWait: !waited && same.length >= 2, keyAfter: now.story.key, where };
      step('idle repeat', report.idleRepeat);
      if (same.length > 2) errors.push('Mosi repeated his line twice for one moment: ' + JSON.stringify(report.idleRepeat));
      else if (line && same.length < 2 && now.story.key === key) errors.push("Mosi's line never began again after the long idle: " + JSON.stringify(report.idleRepeat));
    };

    if (o.unlocked) await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('minnisspil.unlocked', ${JSON.stringify(o.unlocked)}); } catch {}` });
    await send('Page.navigate', { url });
    if (await waitFor('window.__memoryReady === true', 120000, 'the page to be ready') < 0) throw new Error('The page never became ready');
    report.gpu = await ev(GPU_JS).catch(e => `error: ${e.message}`);
    report.reducedMotionActive = await ev("matchMedia('(prefers-reduced-motion: reduce)').matches").catch(() => null);
    step('loaded', { url: url.replace(/^http:\/\/127\.0\.0\.1:\d+/, '') });
    // The credits the page built behind the ending card's "i" (hidden until the card shows): each group's Líkan or Hljóð, Leyfi and Frá rows.
    report.creditsBuilt = await ev("[...document.querySelectorAll('#credits .credit-group')].map(group => [...group.querySelectorAll('p')].map(p => p.textContent).join(' | '))").catch(() => null);
    if (o.video) await send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 960, maxHeight: 960, everyNthFrame: 2 });
    // Named moments, kept with the wall clock so they can be placed in round.mp4 (its first frame's stamp) afterwards.
    report.marks = [];
    const mark = name => { if (report.marks.some(entry => entry.name === name)) return; report.marks.push({ name, at: Date.now() / 1000, t: T() }); step(`mark ${name}`); };
    await ev(TIMELINE_JS); await ev(LINELOG_JS);
    if (o.hideHud) await ev("document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '.topbar, #coach, #mosi-help, #targets, #who, #beat-word { display: none !important }' }))");
    if (o.clearance) await ev(CLEARANCE_JS);
    await sleep(700);
    await shot('welcome');
    if (o.pickerCheck) {
      const READ = `(() => ({ url: location.search, level: document.querySelector('.level-card[aria-current="true"]')?.dataset.level ?? null, open: document.getElementById('welcome').open, startFocused: document.activeElement?.id === 'start',
        cards: [...document.querySelectorAll('#level-cards .level-card')].map(card => ({ level: card.dataset.level, disabled: card.getAttribute('aria-disabled'), current: card.getAttribute('aria-current'), label: card.getAttribute('aria-label'), text: card.textContent.trim(), padlock: card.textContent.includes('🔒'), box: (r => ({ width: Math.round(r.width), height: Math.round(r.height) }))(card.getBoundingClientRect()) })) }))()`;
      report.picker = { before: await ev(READ) };
      const locked = report.picker.before.cards.find(card => card.disabled === 'true'), other = report.picker.before.cards.find(card => card.disabled === 'false' && card.current !== 'true');
      if (locked) { await ev(`document.querySelector('.level-card[data-level="${locked.level}"]').click()`); await sleep(300); report.picker.afterLockedTap = await ev(READ); report.picker.afterLockedTap.shook = await ev(`document.querySelector('.level-card[data-level="${locked.level}"]').classList.contains('nope')`); await shot('picker-locked-tapped'); }
      if (other) {
        await ev(`document.querySelector('.level-card[data-level="${other.level}"]').click()`);
        await sleep(1200); await waitFor('window.__memoryReady === true', 120000, 'the page of the other level');
        await ev(TIMELINE_JS); await ev(LINELOG_JS); await sleep(800); report.picker.afterOtherTap = await ev(READ); await shot('picker-other-level-opened');
      }
      step('the level picker', { before: report.picker.before.cards.map(c => `${c.level}:${c.disabled === 'true' ? 'locked' : c.current === 'true' ? 'here' : 'open'}`).join(' '), lockedTapStayed: report.picker.afterLockedTap ? report.picker.afterLockedTap.url === report.picker.before.url && report.picker.afterLockedTap.open : null, otherTapWent: report.picker.afterOtherTap?.url ?? null });
    }

    await ev(`document.getElementById('start').click()`);
    const roundStart = Date.now();
    step('start clicked');
    await sleep(2500);
    await shot('glade');
    if (o.helpShot) {
      // Mosi's button (bottom left): once his own line is over a tap must make him say a line, with its words in the bubble.
      await waitFor('(a => !a.current && !a.pending)(window.__memory.audio().speech)', 15000, "Mosi's line to end"); await sleep(600);
      const askedBefore = (await ev('window.__memory.audio().speech.started')).length;
      await ev(`document.getElementById('mosi-help').click()`);
      const askAt = await waitFor(`window.__memory.audio().speech.started.length > ${askedBefore}`, 6000, "Mosi's answer to the button");
      await sleep(500);
      const askedStarted = (await ev('window.__memory.audio().speech.started')).slice(askedBefore);
      report.mosiAsk = { line: await ev('window.__memory.lastLine()'), caption: await ev(`(document.getElementById('caption')?.textContent || '').trim()`), started: askedStarted.map(x => x.id), seconds: askAt };
      step('Mosi button', report.mosiAsk);
      if (!askedStarted.length) errors.push('the "Spyrja Mosa" button started no line: ' + JSON.stringify(report.mosiAsk));
      if (!report.mosiAsk.caption) errors.push("the \"Spyrja Mosa\" button left Mosi's bubble empty: " + JSON.stringify(report.mosiAsk));
      await shot('mosi-ask');
      await waitFor('(a => !a.current && !a.pending)(window.__memory.audio().speech)', 15000, "Mosi's answer to end"); await sleep(400);
    }
    // The search view: every baby's on-screen size (projected posed bounds, hidden ones measured at their cells),
    // Mosi and the leaves, with whether each is inside the frame.
    report.glade = await ev('window.__memory.stats({ measure: true }).frame').catch(e => ({ error: e.message }));
    if (report.glade?.babies) step('glade measured', { babyHeights: report.glade.babies.map(b => `${b.species}:${b.height}`).join(' '), mosi: report.glade.mosi?.height, allInside: [...report.glade.leaves, report.glade.mosi].every(b => b?.inside), homesInside: report.glade.homes.every(b => b?.inside) });
    // The twelve leaf buttons as the page lays them out: none under 44 px either way, and how many pairs overlap each other.
    const LEAF_BOXES_JS = (only = '') => `(() => { const boxes = [...document.querySelectorAll('.world-target[data-target^="leaf-"]${only}')].map(b => { const r = b.getBoundingClientRect(); return { key: b.dataset.target, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), width: Math.round(r.width), height: Math.round(r.height) }; });
      let overlaps = 0, deepest = 0; for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) { const a = boxes[i], b = boxes[j], ox = (a.width + b.width) / 2 - Math.abs(a.x - b.x), oy = (a.height + b.height) / 2 - Math.abs(a.y - b.y); if (ox > 0 && oy > 0) { overlaps++; deepest = Math.max(deepest, Math.min(ox, oy)); } }
      return { count: boxes.length, minWidth: Math.min(...boxes.map(b => b.width)), minHeight: Math.min(...boxes.map(b => b.height)), overlaps, deepestOverlap: Math.round(deepest), boxes }; })()`;
    report.leafTargets = await ev(LEAF_BOXES_JS()).catch(e => ({ error: e.message }));
    step('leaf buttons', { count: report.leafTargets?.count, min: `${report.leafTargets?.minWidth}x${report.leafTargets?.minHeight}`, overlaps: report.leafTargets?.overlaps, deepest: report.leafTargets?.deepestOverlap });
    // The overview button once at the start, as a child would peek at the whole place: the picture shows that no edge of the world is in sight.
    if (o.mode === 'full' || o.mode === 'glade') {
      await ev(`window.__memory.camera('overview')`); await waitFor(`!window.__demoStats.camera.moving`, 20000, 'overview camera'); await sleep(600);
      await shot('overview');
      await ev(`window.__memory.camera('auto')`); await waitFor(`!window.__demoStats.camera.moving`, 20000, 'play camera');
    }
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
    if (o.first && order.includes(o.first)) order.splice(0, order.length, o.first, ...order.filter(sp => sp !== o.first));
    // The gift pairs, in card order. `full` and `rapid` find them: the first before the first friend pair, the second after the first and the
    // third after the second (every one after the last friend pair with --gifts-last). The first try of the first two is a deliberate miss.
    const giftItems = [...new Set(first.cards.filter(c => c.item).map(c => c.item))];
    report.gifts = [];
    const giftAt = giftItems.map((_, k) => o.giftsLast ? LEVEL.friends.length : k); // matched friend pairs when each pair is opened
    const giftMissed = new Set(), wantGifts = o.mode === 'full' || o.mode === 'rapid' || o.mode === 'search';
    let giftsLeftChecked = false;
    const hiddenGift = (s, item) => s.cards.filter(c => c.item === item && c.status === 'hidden').map(c => c.id);
    const hidden = (s, species) => s.cards.filter(c => c.species === species && c.status === 'hidden').map(c => c.id);
    report.cancelCheck = {}; let sawFailing = false, lastReach = 0;
    report.blocked = []; report.blockedRetry = []; let blockedSeen = 0, retryWatch = null; // (the adventure's own list of walks it gave up)
    let missPlan = 0; // 0 not yet, 1 first card of the miss is open, 2 done
    let lastKey = '', lastProgress = Date.now(), lastAsk = 0, lastCancel = 0, lastHammer = 0, arrowWaited = false, tapWait = null;
    const wrongTried = {}; // the wrong friends each obstacle has had so far (one each by default: the branch, the log and the bark; --wrong-all tries every one the bubbles offer)
    const WRONG = LEVEL.wrongFriends ?? {}; // whom the driver tries first at each (level 1's log: the right friend is the Þríhyrnur, so its other free pair, the Kambeðlur, goes)
    let barkTaps = 0, runTake = null, holdFrom = null, thinkUntil = 0;
    const thought = new Set();
    const limitMs = o.limit * 60 * 1000, stallMs = 4 * 60 * 1000;

    // One step of the child: the right button, and in rapid mode three taps on it and then on every other enabled target.
    const act = async (key, what, extra = {}) => {
      const s = await ev(SNAPSHOT_JS);
      const keys = [key];
      if (rapid) for (const other of s.enabled) if (!keys.includes(other)) keys.push(other);
      // Could a finger reach it? (disabled, not inside the screen, covered by the HUD or by another target)
      const reach = await ev(reachJs(key)).catch(() => null), tally = (report.reach ||= { checks: 0, hard: [], sampled: 0, obstructed: {} });
      tally.checks++;
      if (reach && (!reach.found || reach.disabled || !reach.centreHit || reach.percent < 50 || !reach.inside)) { tally.hard.push({ key, t: T(), what, ...reach }); step('TARGET HARD TO REACH', { key, ...reach }); }
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
      // Every 2.5 s: which enabled targets a finger cannot fully reach (under the HUD, off the screen, overlapped by a neighbour).
      if (!s.paused && Date.now() - lastReach > 2500) {
        lastReach = Date.now();
        const list = await ev(ENABLED_REACH_JS).catch(() => []), tally = (report.reach ||= { checks: 0, hard: [], sampled: 0, obstructed: {} });
        tally.sampled++;
        for (const x of list) {
          const id = x.key + ' by ' + Object.keys(x.covers).sort().join('+'), entry = (tally.obstructed[id] ||= { key: x.key, covers: x.covers, firstAt: T(), samples: 0, worstPercent: 100, centreHit: true, inside: true, box: x.box, caption: s.caption, act: s.act, shot: s.cam.shot });
          entry.samples++; entry.worstPercent = Math.min(entry.worstPercent, x.percent); entry.centreHit &&= x.centreHit; entry.inside &&= x.inside;
        }
      }
      // "Aftur" (#cancel-choice) must be on screen whenever the bubbles are open, also when they come back after a wrong friend's go.
      if (s.bridge.failing) sawFailing = true; else if (!s.bridge.asking) sawFailing = false;
      if (s.who.open) {
        const kind = sawFailing ? 'reopened' : 'opened', c = (report.cancelCheck[kind] ||= { checks: 0, failures: 0 });
        let box = s.cancelBox;
        if (!(box.shown && !box.hidden && !box.disabled && box.inside)) { await sleep(120); box = (await ev(SNAPSHOT_JS)).cancelBox; } // (a frame later: the state can change between two frames)
        c.checks++;
        if (!(box.shown && !box.hidden && !box.disabled && box.inside)) {
          c.failures++; errors.push(`#cancel-choice is not on screen with the bubbles open (${kind}, asking ${s.who.asking}): ${JSON.stringify(box)}`);
          step('CANCEL BUTTON MISSING with the bubbles open', { kind, asking: s.who.asking, box });
        }
        if (sawFailing) { report.cancelCheck.afterWrong = (report.cancelCheck.afterWrong ?? 0) + 1; sawFailing = false; }
      }
      for (const g of report.gifts) {
        if (!g.foundAt && s.found.includes(g.item)) g.foundAt = T();
      }
      if (s.basket > report.gifts.filter(g => g.landedAt).length) { const g = report.gifts.find(x => x.foundAt && !x.landedAt); if (g) g.landedAt = T(); }
      if (s.placed >= 3 && s.bridge.active === 'lay') mark('bark-end');
      // A walk the adventure gave up (planning-timeout, no-clear-route): "bridge-blocked". Each one is listed; a blocked crossing or walk to the grove is watched until it starts again by itself
      // (the gold arrow on its place meanwhile: the staging spot or the grove).
      if (s.blocked < blockedSeen) blockedSeen = s.blocked;
      if (s.blocked > blockedSeen) {
        const list = await ev('window.__demoStats.bridge.blocked');
        for (const entry of list.slice(blockedSeen)) { report.blocked.push({ ...entry, t: T() }); step('BRIDGE BLOCKED', entry); }
        blockedSeen = list.length;
        const last = list.at(-1);
        if (['cross', 'finish'].includes(last.id)) retryWatch = { id: last.id, reason: last.reason, t: T(), caption: s.caption, captions: [s.caption], arrowAt: null, restartedAt: null };
      }
      if (retryWatch) {
        const target = retryWatch.id === 'cross' ? 'task-staging' : 'task-grove';
        if (s.caption && !retryWatch.captions.includes(s.caption)) retryWatch.captions.push(s.caption);
        if (!retryWatch.arrowAt && await ev(`Boolean(document.querySelector('#targets .is-guided[data-target="${target}"]'))`)) {
          retryWatch.arrowAt = T();
          retryWatch.arrow = await ev(ARROW_JS).catch(e => ({ error: e.message }));
          retryWatch.button = await ev(`(() => { const b = document.querySelector('[data-target="${target}"]'), r = b.getBoundingClientRect(); return { enabled: !b.disabled, ring: b.classList.contains('choice-visible'), onScreen: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, width: Math.round(r.width), height: Math.round(r.height) }; })()`);
          step(`the gold arrow on ${target} while the blocked ${retryWatch.id} waits`, { caption: s.caption, arrow: retryWatch.arrow?.insideScreen, button: retryWatch.button });
          // (not a paused milestone: a pause takes the arrow away and restarts the wait)
          await shot(`blocked-${retryWatch.id}-gold-arrow-while-it-waits`);
        }
        if (!retryWatch.restartedAt && s.bridge.active === retryWatch.id) {
          retryWatch.restartedAt = T(); retryWatch.secondsToRetry = +(retryWatch.restartedAt - retryWatch.t).toFixed(1);
          step(`the blocked ${retryWatch.id} starts again by itself`, { seconds: retryWatch.secondsToRetry, arrowSeen: Boolean(retryWatch.arrowAt) });
          report.blockedRetry.push(retryWatch); retryWatch = null;
        }
      }
      // "Rólegri hreyfing" pressed on and off while Mosi walks: his animation must stay the walk clip (it used to switch to a still idle).
      if (o.toggleMotion && !report.motionToggle && (s.mosi === 'walk' || s.mosi === 'deck')) {
        const read = () => ev(`(() => { const d = window.__memory.stats(); return { walking: Boolean(d.scene.mosiWalk), animation: d.scene.mosiAnimation, pressed: document.getElementById('motion').getAttribute('aria-pressed') }; })()`);
        await sleep(450); // (his walk clip has faded in: it takes .25 s)
        const before = await read();
        await ev(`document.getElementById('motion').click()`); await sleep(350); const calm = await read();
        await ev(`document.getElementById('motion').click()`); await sleep(350); const after = await read();
        const walks = value => value.walking && value.animation.some(a => a.clip === 'walk' && a.timeScale > 0 && a.weight > .95) && !value.animation.some(a => a.clip === 'idle' && a.weight > .05); // only the walk clip, at full weight (the old code faded him to a still idle)
        report.motionToggle = { during: s.bridge.active, before, calm, after, passed: [before, calm, after].every(walks) && calm.pressed === 'true' && after.pressed === 'false' };
        step('calm motion pressed on and off while Mosi walks', report.motionToggle);
        if (!report.motionToggle.passed) errors.push(`Mosi did not keep his walk clip when calm motion was pressed mid-walk: ${JSON.stringify(report.motionToggle)}`);
      }
      if (o.stopAfterRetry && report.blockedRetry.at(-1)?.restartedAt && s.bridge.atStaging && !s.scene && !s.cam.held) { report.finished = true; step('the retried crossing has arrived: stop'); await sleep(800); await shot('retried-crossing-arrived'); break; }
      if (s.bridge.active === 'cross' && !report.crossAfterGifts) report.crossAfterGifts = { at: T(), basket: s.basket, giftsLeft: s.giftsLeft, lastLanded: report.gifts.map(g => g.landedAt).filter(Boolean).at(-1) ?? null };
      if (s.bridge.active === 'finish' && (s.mosi === 'walk' || s.mosi === 'deck')) mark('grove-start');
      if (s.bridge.visited) mark('grove-end');
      if (s.ending) {
        report.finished = true; step('ending'); await sleep(1500); await shot('ending');
        report.endingCard = await ev(`(() => { const row = document.getElementById('ending-gifts'), size = el => parseFloat(getComputedStyle(el).fontSize); return { copy: document.getElementById('ending-copy').textContent, gifts: row.hidden ? null : document.getElementById('ending-gifts-text').textContent, giftsFontPx: row.hidden ? null : size(row), copyFontPx: size(document.getElementById('ending-copy')), again: document.getElementById('again').textContent.trim(), basketInCard: !row.hidden && Boolean(row.querySelector('svg')), foundInRules: window.__memory.state().found, basket: window.__memory.basket() }; })()`);
        step('the ending card', report.endingCard ?? {});
        // The small "i": the credits of the three models (one Líkan / Leyfi / Frá group each), open for a picture, then shut.
        try {
          await ev(`document.getElementById('credits-toggle').click()`); await sleep(400);
          report.credits = await ev(`(() => { const box = document.getElementById('credits'), toggle = document.getElementById('credits-toggle'), r = box.getBoundingClientRect(), t = toggle.getBoundingClientRect(), card = document.getElementById('ending').getBoundingClientRect();
            return { open: !box.hidden, groups: box.querySelectorAll('.credit-group').length, rows: [...box.querySelectorAll('p')].map(p => p.textContent), fontPx: parseFloat(getComputedStyle(box.querySelector('p')).fontSize), box: { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) }, insideScreen: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, toggle: { width: Math.round(t.width), height: Math.round(t.height) }, expanded: toggle.getAttribute('aria-expanded'), closedByDefault: true }; })()`);
          await shot('ending-credits'); await ev(`document.getElementById('credits-toggle').click()`); await sleep(150);
          report.credits.closedAgain = await ev(`document.getElementById('credits').hidden`);
        } catch (e) { report.credits = { error: e.message }; }
        if (o.restartAt === 'ending') {
          const beats = await ev('window.__memory.stats().scene.beats'); if (beats.length) report.celebration = { beats, seconds: +(beats.at(-1).t - beats[0].t).toFixed(2), cuts: beats.filter(b => b.cut).map(b => b.t).map((t, i, all) => i ? +(t - all[i - 1]).toFixed(2) : null).filter(Boolean) };
          await ev(`document.getElementById('again').click()`); await sleep(1500); report.restartCheck = await ev(RESTART_JS); step('after Spila aftur', report.restartCheck);
          restartVerdict('ending'); }
        break;
      }
      // search: every leaf found (the friends home, the fossil pairs in the basket) and nothing moving: level 2's round waits here until its steps are built.
      if (o.mode === 'search' && s.phase === 'won' && s.basket >= giftItems.length && !s.walking && !s.cam.moving && !s.cam.held && !s.scene && !s.giftPhases.some(phase => phase !== 'done')) {
        report.finished = true; step('every leaf is found and every gift pair is in the basket: the round waits', { basket: s.basket, matched: s.matched, caption: s.caption }); await sleep(2500);
        report.gladeAll = await ev('window.__memory.stats({ measure: true }).frame').catch(e => ({ error: e.message })); await shot('all-found');
        step('the frame with every friend home', { babiesInside: report.gladeAll.babies?.filter(b => b.visible).every(b => b.inside), visibleBabies: report.gladeAll.babies?.filter(b => b.visible).length, mosiInside: report.gladeAll.mosi?.inside, homesInside: report.gladeAll.homes?.every(b => b.inside) });
        report.allFound = await ev(`(() => { const d = window.__demoStats; return { drawCalls: d.drawCalls, triangles: d.triangles, camera: d.camera.intent, babiesRendered: d.characterLod.filter(c => c.rendered).length, babiesVisible: d.cells.filter(c => c.actorVisible).length, tunnel: window.__memory.targets().find(t => t.id === 'tunnel') ?? null, gorge: window.__memory.stats().levelStats?.gorge ?? null }; })()`).catch(e => ({ error: e.message }));
        break;
      }
      // Level 2: everyone has walked over the trunk to Sólarsyllan; the celebration plays on to the ending card (Task 7), as level 1's does. The level's state is kept once, as they arrive.
      if (LEVEL.number === 2 && s.bridge.onSunLedge && !report.level2) {
        step('everyone is on Sólarsyllan, over the trunk: the celebration', { light: s.tunnel?.light, pile: s.tunnel?.pile, upper: s.upper, caption: s.caption });
        report.level2 = await ev(`(() => { const d = window.__demoStats; return { tunnel: d.levelStats.tunnel, gorge: d.levelStats.gorge, targets: window.__memory.targets().filter(t => t.type === 'task'), story: window.__memory.story(), bridge: window.__memory.bridge(), drawCalls: d.drawCalls, triangles: d.triangles }; })()`).catch(e => ({ error: e.message }));
      }
      if (o.mode === 'branch' && s.bridge.branch === 'held' && !s.bridge.active && !s.cam.moving && !s.cam.held && !s.scene) {
        report.finished = true; step('the branch is up'); await sleep(800); await shot('branch-held'); break;
      }
      // The match script holds the camera until it has glided back to the glade.
      if (o.mode === 'first-minute' && s.matched >= 1 && s.phase === 'ready' && !s.walking && !s.cam.moving && !s.cam.held && !s.scene && (holdFrom ??= Date.now()) && Date.now() - holdFrom >= o.hold * 1000) {
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
      // A gift: its first leaf (the animal standing, Mosi's "Hvar er hin?"), a miss, the pair rising, flying and the basket counting it; and the wait for them.
      if (s.phase === 'one-open' && s.cards.some(c => c.status === 'open' && c.item)) waited ||= await milestone('gift-first', 'gift-first-leaf', 900);
      if (s.phase === 'mismatch' && s.cards.some(c => c.status === 'open' && c.item)) waited ||= await milestone('gift-mismatch', 'gift-mismatch', 800);
      if (s.giftPhases.includes('rise')) waited ||= await milestone('gift-rise', 'gift-pair-rises', 450);
      if (s.giftPhases.includes('fly')) waited ||= await milestone('gift-fly', 'gift-pair-flies', 250);
      if (s.basket >= 1) waited ||= await milestone('gift-basket', 'gift-in-basket', 350);
      if (/gifts-left$/.test(s.story.key)) waited ||= await milestone('gifts-left', 'gifts-left-wait', 1500);
      // The branch: the obstacle glowing, the arrow after hesitating, the bubbles, a wrong friend's go and Mosi's laugh,
      // the walk there, each tap of the tap-along (or the timeout's "Við gerum þetta saman!") and the cheer.
      if (s.story.kind === 'work' && s.story.target === 'branch' && s.story.available && !s.cam.held && !s.scene) waited ||= await milestone('glow-branch', 'branch-glowing', 400);
      // The bark at the marsh sways as well as glows: two pictures a moment apart.
      if (s.story.kind === 'work' && s.story.target === 'bark' && s.story.available && !s.cam.held && !s.scene) { waited ||= await milestone('glow-bark', 'bark-glowing', 400); if (seen.has('glow-bark')) waited ||= await milestone('glow-bark-2', 'bark-glowing-later', 650); }
      if (s.arrow) waited ||= await milestone('arrow', 'gold-arrow', 200);
      if (s.who.open) waited ||= await milestone(`who-${s.who.asking}`, `who-${s.who.asking}`, 450);
      if (s.bridge.failing && s.trying && s.caption !== 'Kannski einhver annar?') waited ||= await milestone(LEVEL.number > 1 ? `fail-${s.bridge.asking}-${s.bridge.failing}` : `fail-${s.bridge.failing}`, LEVEL.number > 1 ? `fail-${s.bridge.asking}-${s.bridge.failing}` : `fail-${s.bridge.failing}`, 500);
      if (s.bridge.failing && s.caption === 'Kannski einhver annar?') waited ||= await milestone(LEVEL.number > 1 ? `mosi-laugh-${s.bridge.asking}-${s.bridge.failing}` : `mosi-laugh-${s.bridge.asking}`, LEVEL.number > 1 ? `mosi-laughs-${s.bridge.asking}-${s.bridge.failing}` : `mosi-laughs-${s.bridge.asking}`, 350);
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
      // The wrong friend wades in at the marsh's edge: the last hop into the mud in the close shot (it starts a moment before they land), then just after the landing.
      if (s.bridge.failing && s.bridge.asking === 'bark' && s.act === 'fail:run') { runTake ??= s.cam.take; if (s.cam.take > runTake) waited ||= await milestone('mud-hop', 'footsteps-in-the-mud', 150); }
      if (s.bridge.failing && s.bridge.asking === 'bark' && s.act === 'fail:try') waited ||= await milestone('mud-landed', 'footsteps-in-the-mud-landed', 0);
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
      if (o.restartAt === 'gift' && (s.giftPhases.includes('rise') || s.giftPhases.includes('fly'))) {
        await sleep(350); report.beforeGiftRestart = await ev(RESTART_JS);
        step('restart while a gift pair flies', { basket: report.beforeGiftRestart.basketText, phases: report.beforeGiftRestart.giftPhases });
        // The render scale must be back at 1 a moment after the restart (it steps down again only if the next 1.2 s are slow).
        report.resolutionRestart = { before: await ev('window.__demoStats.resolutionScale') };
        await ev('window.__memory.restart()'); await sleep(150); report.resolutionRestart.after = await ev('window.__demoStats.resolutionScale'); await sleep(1350);
        report.restartCheck = await ev(RESTART_JS); step('after the restart', { ...report.restartCheck, resolution: report.resolutionRestart });
        restartVerdict('gift', [[report.resolutionRestart.after !== 1, `the render scale is ${report.resolutionRestart.after} after the restart`]]);
        report.finished = true; break;
      }
      if (o.restartAt === 'glow' && s.bridge.active === 'light' && s.tunnel && s.tunnel.light > .3) {
        // Paused while the plates glow: the light, the plates and every pose must stand still; then on, and a restart in the middle of it.
        await ev('window.__memory.pause(true)'); await sleep(300);
        const before = await ev(POSE_JS), l1 = (await ev(SNAPSHOT_JS)).tunnel; await sleep(1200);
        const after = await ev(POSE_JS), l2 = (await ev(SNAPSHOT_JS)).tunnel;
        report.pauseGlow = { light: [l1.light, l2.light], plates: [l1.plates, l2.plates], drift: +Math.max(...before.values.map((v, i) => Math.abs(v - after.values[i]))).toExponential(2), still: l1.light === l2.light && l1.plates === l2.plates };
        step('paused while the plates glow', report.pauseGlow); await shot('paused-while-glowing');
        await ev('window.__memory.pause(false)'); await sleep(500);
        const during = (await ev(SNAPSHOT_JS)).tunnel; step('restart while the tunnel glows', { light: during.light, plates: during.plates, pile: during.pile });
        await ev('window.__memory.restart()'); await sleep(1500);
        report.restartCheck = await ev(RESTART_JS); step('after the restart', report.restartCheck); await shot('restarted');
        const g = report.pauseGlow;
        restartVerdict('glow', [[!g.still, `the light or the plates moved while paused (${JSON.stringify({ light: g.light, plates: g.plates })})`], [!(g.drift < 1e-6), `a pose drifted ${g.drift} while paused`]]);
        report.finished = true; break;
      }
      if (o.qaFail && LEVEL.number === 2 && !seen.has('qa-fail') && s.story.target === o.qaFail.split(':')[1] && s.story.available && !s.cam.held && !s.scene && !s.bridge.active && !s.walking && !s.who.open) {
        seen.add('qa-fail'); const [species, target] = o.qaFail.split(':');
        step(`QA: the world is asked for ${species}'s go at the ${target}`);
        const started = await ev(`window.__gorge.api.startFail(${JSON.stringify(species)}, ${JSON.stringify(target)}, { qa: true })`).catch(e => e.message);
        step('the go started', { started });
        if (started === true) {
          report.qaFail = { species, target, pictures: [], before: (await ev(SNAPSHOT_JS)).tunnel }; let tries = 0;
          while (tries++ < 120) {
            const now = await ev(SNAPSHOT_JS).catch(() => null); if (!now) break;
            if (now.trying && !report.qaFail.pictures.includes('try')) { report.qaFail.pictures.push('try'); await milestone(`qa-fail-${species}-${target}`, `qa-fail-${target}-${species}`, 900); }
            if (!(await ev('window.__gorge.mover.isBusy()'))) break;
            await sleep(250);
          }
          // The light the pair holds must not have dropped or moved while it had its go.
          report.qaFail.after = (await ev(SNAPSHOT_JS)).tunnel; report.qaFail.holdsLight = report.qaFail.before.light === report.qaFail.after.light && report.qaFail.before.plates === report.qaFail.after.plates && report.qaFail.after.light >= .99;
          step('the go is over', { species, target, light: [report.qaFail.before.light, report.qaFail.after.light], plates: [report.qaFail.before.plates, report.qaFail.after.plates], holdsLight: report.qaFail.holdsLight });
          if (!report.qaFail.holdsLight) errors.push(`the light dropped during the QA go: ${JSON.stringify(report.qaFail)}`);
        }
        continue;
      }
      // (level 2: two seconds into the celebration, while the friends' cheer plays, the stars come out and the light goes on to the evening; what was
      // playing just before and what plays in the 1.5 s after are kept, so a cheer or a clap that goes on is seen: Task 7 fix round 1)
      if (o.restartAt === 'celebration' && (LEVEL.number === 2 ? s.beats.includes('sun-sets') : s.beats.includes('mosi-cheer'))) {
        const SOUNDS_JS = `(() => { const a = window.__memory.audio(); return { voices: a.voices, played: a.played, log: a.log.slice(-8).map(e => e.kind + (e.asset ? ':' + e.asset : '')) }; })()`;
        await sleep(LEVEL.number === 2 ? 2000 : 1200); // (level 1: Mosi's gifts line is on its way, or playing)
        if (LEVEL.number === 2) report.soundsBeforeRestart = await ev(SOUNDS_JS);
        step('restart in the middle of the celebration'); await ev('window.__memory.restart()'); await sleep(1500);
        report.restartCheck = await ev(RESTART_JS); step('after the restart', report.restartCheck);
        if (LEVEL.number === 2) { const after = await ev(SOUNDS_JS); report.soundsAfterRestart = { ...after, newSince: after.played - report.soundsBeforeRestart.played }; }
        const heard = report.soundsAfterRestart;
        restartVerdict('celebration', heard ? [[heard.newSince !== 0, `${heard.newSince} sounds started after the restart (${JSON.stringify(heard.log.slice(-Math.max(1, heard.newSince)))})`], [heard.voices !== 0, `${heard.voices} sounds still play`]] : []);
        report.finished = true; break;
      }
      // The celebration: a picture a moment into each beat (the pair eating, each trick, Mosi's cheer with the gifts risen, the last wide shot).
      const BEAT_STILLS = { 'wide-start': ['celebration-arrived', 500], 'eat-triceratops': ['eating-trihyrnur', 700], 'eat-stegosaurus': ['eating-kambedlur', 700], 'eat-brontosaurus': ['eating-thorsedlur', 700], 'wide-eating': ['eating-all', 500],
        'trick-triceratops': ['trick-trihyrnur-hop', 400], 'trick-stegosaurus': ['trick-kambedlur-happy', 500], 'trick-brontosaurus': ['trick-thorsedlur-happy', 600], 'mosi-cheer': ['mosi-cheers-gifts-rising', 800], 'gifts-seen': ['gifts-from-the-side', 700], 'final-wide': ['final-wide-shot', 600] };
      // (level 2's, on Sólarsyllan: the sunset and the first stars, each pair's trick, the fossils glowing in a row, Mosi over them, the last wide shot under the stars)
      const BEAT_STILLS_2 = { 'sun-sets': ['sun-sets-first-stars', 2600], 'trick-stegosaurus': ['trick-kambedlur-glow', 700], 'trick-triceratops': ['trick-thrihyrnur-butt', 800], 'trick-brontosaurus': ['trick-thorsedlur-reach-high', 1300],
        'trick-pteranodon': ['trick-flugedlur-circle', 1600], 'fossils-glow': ['fossils-glow-in-a-row', 2000], 'mosi-cheer': ['mosi-cheers-over-the-fossils', 700], 'final-wide': ['final-wide-under-the-stars', 1200] };
      const stills = LEVEL.number === 2 ? BEAT_STILLS_2 : BEAT_STILLS;
      for (const name of s.beats) if (stills[name]) {
        const took = await milestone(`beat-${name}`, stills[name][0], stills[name][1]); waited ||= took;
        // (Task 7 fix round 1) the stars a child sees in the celebration's two wide shots (report.sky)
        if (took && LEVEL.number === 2 && ['sun-sets', 'final-wide'].includes(name)) (report.sky ??= {})[name] = await ev(SKY_JS).catch(e => String(e.message ?? e));
      }
      // The waiting friends at play during the search (the first two kinds of game the page starts).
      if (s.idle && [...seen].filter(key => key.startsWith('idle-')).length < 2) waited ||= await milestone(`idle-${s.idle}`, `idle-${s.idle}`, 1300);
      if (s.bridge.active && !['lift', 'roll', 'cross', 'lay', 'finish'].includes(s.bridge.active)) waited ||= await milestone(`active-${s.bridge.active}`, `task-${s.bridge.active}`, 3000);
      if (s.bridge.branch === 'held') waited ||= await milestone('held', 'branch-held', 600);
      if (s.bridge.bridgeBuilt) waited ||= await milestone('bridge', 'bridge-built', 600);
      if (s.bridge.atStaging) waited ||= await milestone('staging', 'at-staging', 600);
      if (s.bridge.boardwalkBuilt) waited ||= await milestone('walkway', 'walkway-built', 600);
      // Level 2's first two tasks: the dark tunnel before, each step of the light, the lit tunnel with the pile in it, each hit, the pile coming down and on its steps.
      if (LEVEL.number === 2 && s.tunnel) {
        if (s.story.kind === 'work' && s.story.target === 'tunnel' && s.story.available && !s.cam.held && !s.scene && !s.bridge.active && !s.bridge.asking) waited ||= await milestone('tunnel-dark', 'tunnel-dark-before', 700);
        if (s.bridge.active === 'light') for (const [n, at] of [[1, .38], [2, .7], [3, .99]]) if (s.tunnel.light >= at - .04) waited ||= await milestone(`light-${n}`, `light-stage-${n}`, 450);
        if (s.bridge.active === 'light' && s.tunnel.light >= .99 && s.cam.shot === 'hero') waited ||= await milestone('tunnel-lit-pile', 'tunnel-lit-the-pile', 1100);
        if (s.bridge.tunnelLit && s.tunnel.light >= .99 && !s.bridge.active && !s.scene && !s.cam.held && !s.cam.moving && s.story.target === 'rocks') waited ||= await milestone('tunnel-lit-glade', 'tunnel-lit-glade-view', 500);
        if (s.bridge.active === 'headbutt' && s.cam.shot === 'hero' && s.wait) waited ||= await milestone('pile-before', 'pile-before-the-hits', 350);
        if (s.bridge.active === 'headbutt') for (const n of [1, 2, 3]) if (s.tunnel.pile >= n) waited ||= await milestone(`hit-${n}`, `headbutt-hit-${n}`, n === 3 ? 200 : 120);
        if (s.bridge.active === 'headbutt' && s.tunnel.pile >= 3 && s.tunnel.falling) waited ||= await milestone('pile-falling', 'pile-falling-into-steps', 900);
        if (s.bridge.rocksFallen && !s.tunnel.falling && !s.scene && !s.cam.held && !s.cam.moving) waited ||= await milestone('pile-fallen', 'pile-fallen-steps', 700);
      }
      // Level 2's steps after the rockfall: the walk through the tunnel, the ledge before and each pull of the slab, the ramp, the cliff before, each wingbeat, the rope round the tree and drawn taut, the climb.
      if (LEVEL.number === 2 && s.upper) {
        const u = s.upper, a = u.action ?? {}, act = s.bridge.active;
        if (act === 'through') {
          // (final fix round 1, G-M1) the renderer's programs over the walk through: the last count before the cut, the first after it and at the line-up.
          // The plates' lamp is never hidden now (it goes dark), so the cut adds no light and no lit material is compiled anew there.
          const p = (report.throughPrograms ??= { beforeCut: null, afterCut: null, lineup: null, samples: [] }), cut = ['exit', 'lineup'].includes(a.phase);
          if (!cut) p.beforeCut = s.programs; else if (p.afterCut === null) p.afterCut = s.programs;
          if (a.phase === 'lineup') p.lineup = s.programs;
          if (`${p.samples.at(-1)?.[0]}:${p.samples.at(-1)?.[1]}` !== `${a.phase}:${s.programs}`) p.samples.push([a.phase, s.programs]);
          if (a.phase === 'gather') waited ||= await milestone('through-gather', 'through-everyone-runs-to-the-tunnel', 600);
          if (a.phase === 'enter' && s.cam.shot === 'hero') waited ||= await milestone('through-enter', 'through-into-the-lit-tunnel', 700);
          if (a.phase === 'exit' && a.arrived >= 1) waited ||= await milestone('through-exit', 'through-out-of-the-tunnel', 500);
          if (a.phase === 'lineup') waited ||= await milestone('through-floor', 'through-on-the-floor-before-the-ledge', 300);
        }
        if (s.story.kind === 'work' && s.story.target === 'ledge' && s.story.available && !s.cam.held && !s.scene && !s.bridge.active && !s.bridge.asking) waited ||= await milestone('ledge-before', 'ledge-before-the-slab-comes-down', 900);
        if (act === 'reach') {
          if (u.slab <= 32) waited ||= await milestone('slab-1', 'slab-step-1', 350);
          if (u.slab <= 11) waited ||= await milestone('slab-2', 'slab-step-2', 350);
          if (u.slab <= -23) waited ||= await milestone('slab-3', 'slab-ramp-down', 500);
          if (a.phase === 'ascend') waited ||= await milestone('ramp-walk', 'everyone-walks-up-the-ramp', 700);
        }
        if (s.story.kind === 'work' && s.story.target === 'cliff' && s.story.available && !s.cam.held && !s.scene && !s.bridge.active && !s.bridge.asking) waited ||= await milestone('cliff-before', 'cliff-before-the-rope-flies', 900);
        if (act === 'fly') {
          if (a.phase === 'ready' && a.given >= 1) waited ||= await milestone('wing-0', 'wingbeat-0-rope-lifted', 300);
          if (a.phase === 'leg' && a.done >= 1) waited ||= await milestone('wing-1', 'wingbeat-1-up-the-cliff', 500);
          if (a.phase === 'leg' && a.done >= 2) waited ||= await milestone('wing-2', 'wingbeat-2-to-the-tree', 400);
          if (a.phase === 'wrap') waited ||= await milestone('rope-wrap', 'rope-round-the-tree', 1100);
          if (a.phase === 'tie') waited ||= await milestone('rope-taut', 'rope-drawn-taut', 1000);
          if (a.phase === 'cheer') waited ||= await milestone('rope-tied', 'rope-tied-the-flugedlur-land', 500);
        }
        if (act === 'climb') {
          if (s.cam.shot === 'wide' && !seen.has('climb-follow')) waited ||= await milestone('climb-start', 'climb-start-the-rope-beside-the-path', 600);
          if (s.cam.shot === 'follow') waited ||= await milestone('climb-follow', 'climb-handrail-follow', 700);
          if (s.cam.shot === 'wide' && seen.has('climb-follow')) waited ||= await milestone('climb-high', 'climb-high-on-the-cliff', 900);
          if (a.phase === 'cheer') waited ||= await milestone('climb-top', 'climb-everyone-on-the-rim', 500);
        }
        // Task 6: the trunk standing at the gap, the rope flown out and tied at its top, the nine on the rope, each tilt, the fall and its dust, the bridge, the walk, Sólarsyllan.
        if (s.story.kind === 'work' && s.story.target === 'trunk' && s.story.available && !s.cam.held && !s.scene && !s.bridge.active && !s.bridge.asking) waited ||= await milestone('trunk-before', 'trunk-standing-at-the-gap', 900);
        if (act === 'pull') {
          if (a.phase === 'leg' && s.cam.shot === 'follow') waited ||= await milestone('pull-flight', 'pull-rope-flown-over-the-gap', 1400);
          if (a.phase === 'knot') waited ||= await milestone('pull-knot', 'pull-rope-tied-at-the-top', 700);
          if (a.phase === 'ready' && (a.given ?? 0) === 0) waited ||= await milestone('pull-line', 'pull-nine-on-the-rope', 500);
          if (a.phase === 'landed') waited ||= await milestone('pull-fall', 'pull-trunk-falls-dust', 220);
          if (a.phase === 'cheer') waited ||= await milestone('pull-bridge', 'pull-trunk-lies-as-a-bridge', 600);
        }
        if (act === 'walk') {
          if (s.cam.shot === 'follow') waited ||= await milestone('walk-across', 'walk-across-the-trunk', 900);
          if (s.cam.shot === 'follow' && seen.has('walk-across')) waited ||= await milestone('walk-across-2', 'walk-across-the-trunk-later', 1200);
          if (a.phase === 'cheer' && !report.walk) { report.walk = { seconds: a.walked ?? null, arrived: a.times ?? null }; step('the walk', report.walk); }
          if (a.phase === 'cheer') waited ||= await milestone('walk-sun', 'walk-everyone-on-solarsyllan', 400);
        }
        if (o.restartAt === 'pull' && act === 'pull' && a.phase === 'tug' && u.trunk && u.trunk.angle > 3) {
          report.beforePullRestart = await ev(RESTART_JS); step('restart while everyone pulls', { phase: a.phase, trunk: report.beforePullRestart.trunk, rope2: report.beforePullRestart.rope2Visible, basket: report.beforePullRestart.basketText });
          await shot('pull-before-the-restart');
          await ev('window.__memory.restart()'); await sleep(1600);
          report.restartCheck = await ev(RESTART_JS); step('after the restart', { trunk: report.restartCheck.trunk, rope2: report.restartCheck.rope2Visible, flyers: report.restartCheck.flyersHome, basket: report.restartCheck.basketText, upper: report.restartCheck.upper && report.restartCheck.upper.where, flights: report.restartCheck.flights });
          // (the basket, the flights, the second rope and the glade are in restartLeftovers now, with the rest of a clean board)
          const c = report.restartCheck;
          report.restartPull = restartVerdict('pull', [[!c.trunk || Math.abs(c.trunk.angle) > .01, `the trunk is not upright: ${JSON.stringify(c.trunk)}`], [!/^0\s*\/\s*4$/.test((c.basketText || '').trim()), `the basket is not 0 / 4 (${JSON.stringify(c.basketText)})`]]);
          await shot('restarted-after-the-pull'); report.finished = true; break;
        }
        if (o.restartAt === 'rope' && act === 'fly' && ['leg', 'wrap'].includes(a.phase) && u.rope) {
          await sleep(500);
          report.beforeRopeRestart = await ev(RESTART_JS); step('restart while the rope is in flight', { phase: a.phase, rope: u.rope, flights: report.beforeRopeRestart.flights, upper: report.beforeRopeRestart.upper?.where });
          await ev('window.__memory.restart()'); await sleep(1600);
          report.restartCheck = await ev(RESTART_JS); step('after the restart', { upper: report.restartCheck.upper, flights: report.restartCheck.flights, ropeVisible: report.restartCheck.ropeVisible, babiesVisible: report.restartCheck.babiesVisible, babiesTilted: report.restartCheck.babiesTilted, lowerVisible: report.restartCheck.lowerVisible, hiddenCards: report.restartCheck.hiddenCards, basket: report.restartCheck.basketText });
          // (the rope, the flights, the glade and the tilted friends are in restartLeftovers; before it, the rope must have been in flight)
          restartVerdict('rope', [[!report.beforeRopeRestart?.ropeVisible, 'the rope was not drawn when the restart came: it tested nothing']]);
          await shot('restarted-after-the-rope'); report.finished = true; break;
        }
        // (final fix round 1, G-I1) The restart the instant the group is cut to the upper gorge: polled every few milliseconds from the first frame of the walk
        // through, and restarted in the same breath as the page is seen past the cut, so Mosi is still hidden in the exit's dark at .02 of his size.
        if (o.restartAt === 'through' && act === 'through') {
          let before = await ev(THROUGH_CUT_JS); const until = Date.now() + 20000;
          while (before && before.phase !== 'exit' && Date.now() < until) { await sleep(10); before = await ev(THROUGH_CUT_JS); }
          report.beforeThroughRestart = before; step('restart at the cut to the upper gorge', before);
          await sleep(1600);
          report.restartCheck = await ev(RESTART_JS); report.afterThroughRestart = await ev(THROUGH_JS); step('after the restart', report.afterThroughRestart);
          const b = before?.mosi, m = report.afterThroughRestart?.mosi;
          restartVerdict('through', [
            [!before, 'window.__gorge is missing: run it with --query qa=1'],
            [before && before.phase !== 'exit', `the restart did not come at the cut (the walk through was at ${before?.phase})`],
            [b && b.visible && b.scale >= b.base * .9, `Mosi was already out of the dark at the restart (${JSON.stringify(b)}): it tested nothing`],
            [before && (!before.upperVisible || before.lowerVisible), `the cut had not shown the upper gorge yet (${JSON.stringify(before)}): it tested nothing`],
            [m && !m.visible, 'Mosi is hidden'],
            [m && (m.base === null || Math.abs(m.scale - m.base) > 1e-3), `Mosi's scale is ${m?.scale}, his own ${m?.base}`],
            [m && m.fromSpot > .5, `Mosi is ${m?.fromSpot} m from his spot in the glade`],
          ]);
          await shot('restarted-after-the-tunnel'); report.finished = true; break;
        }
      }
      if (waited) continue;

      const mayAct = !s.paused && !s.cam.moving && !s.cam.held && !s.bridge.active;
      // A child looks around once a pair is home: the waiting friends play (in the story modes, between the leaves).
      const thinkSeconds = o.think ?? (o.mode === 'full' ? 11 : 0);
      if (thinkSeconds > 0 && mayAct && s.phase === 'ready' && s.matched >= 1 && !s.walking && !s.who.open && !s.wait && !thought.has(s.matched)) {
        thought.add(s.matched); thinkUntil = Date.now() + thinkSeconds * 1000; step('looks around', { seconds: thinkSeconds, pairs: s.matched });
      }
      if (Date.now() < thinkUntil && mayAct && !s.wait) { await sleep(150); continue; }
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
          else await sleep(rapid ? 100 : LEVEL.number === 2 ? 250 : 500);
          for (let i = 1; i <= count; i++) {
            const tapped = await ev(tapJs([`task-${target}`], 1, 0));
            step(`tap along ${target} ${bark ? barkTaps : i}`, { taken: tapped });
            // The picture once this step has landed (a step of the lift takes about 0.6 s, a third of the roll 0.77 s, the big word
            // of a panel is up at once).
            // (level 2's steps have their own pictures, by the light and the pile; a picture here would hold the next tap back past the wait's 4 s)
            if (shots && LEVEL.number !== 2) await (bark ? milestone(`bark-word-${barkTaps}`, `bark-word-${barkTaps}`, 280) : milestone(`tap-${target}-${i}`, `${target === 'branch' ? 'hero' : target}-tap-${i}`, target === 'log' ? 450 : 520));
            // (the trunk: a child pulls about once a second, and each pull is a lean of a second; a picture as each tilt lands, all three inside the wait's 4 s)
            if (target === 'trunk') { await sleep(rapid ? 200 : 820); if (shots) await milestone(`pull-tilt-${i}`, `pull-tilt-${i}`, 0); continue; }
            await sleep(rapid ? 120 : 250);
          }
        }
      } else if (s.who.open && mayAct) {
        // The bubbles: at the branch, the log and the bark in the story modes one wrong friend first (at the branch the
        // Þríhyrnur, at the log the Kambeðlur, the only other free pair there, at the bark the Þórseðlur), then the right one.
        const right = RIGHT[s.who.asking], tried = (wrongTried[s.who.asking] ??= new Set()), first = o.wrong?.[s.who.asking] ?? WRONG[s.who.asking];
        const wanted = o.wrongAll ? s.who.candidates.filter(sp => sp !== right && !tried.has(sp)).sort((a, b) => (b === first) - (a === first)) : tried.size ? [] : [s.who.candidates.find(sp => sp === first && sp !== right) ?? s.who.candidates.find(sp => sp !== right)].filter(Boolean);
        const wrong = wanted[0];
        const pick = story && OBSTACLE_IDS.includes(s.who.asking) && wrong ? wrong : s.who.candidates.includes(right) ? right : null;
        if (pick === wrong && pick) tried.add(pick);
        if (pick) await act(`who-${pick}`, `pick ${pick} for the ${s.who.asking}${pick === right ? '' : ' (the wrong friend, on purpose)'}`);
        else if (s.cancel) { await ev(`document.getElementById('cancel-choice').click()`); step('close the bubbles: nobody there can do it'); }
      } else if (o.mode !== 'search' && s.story.kind === 'work' && s.story.available && s.story.target && mayAct && ['ready', 'won'].includes(s.phase) && !s.walking && Date.now() - lastAsk > 1500
        && !(story && !o.usualOrder && s.story.target === 'log' && s.cards.some(c => c.species && c.status !== 'matched'))) {
        // (The story modes find every pair before the log, so the Kambeðlur can be its wrong friend; --usual-order does not.)
        // Hesitate once (full mode, at the branch) so the gold arrow shows, then tap the glowing obstacle.
        if (o.mode !== 'rapid' && !arrowWaited && s.story.target === 'branch') {
          arrowWaited = true; step('wait for the gold arrow');
          if (await waitFor('window.__memory.idle() > 4.4 && document.querySelector("#targets .is-guided")', 12000, 'the gold arrow') >= 0) await milestone('arrow', 'gold-arrow', 150);
          await idleRepeatCheck('the branch');
          continue;
        }
        // (level 2: Mosi says what the tunnel and the rockfall are when they come; a child listens to him first, so the driver waits for his line to end)
        if (LEVEL.number === 2 && !seen.has(`listened-${s.story.target}`)) { seen.add(`listened-${s.story.target}`); await sleep(600); await waitFor('(a => !a.current && !a.pending)(window.__memory.audio().speech)', 9000, "Mosi's line to end"); await idleRepeatCheck(`the ${s.story.target}`); continue; }
        lastAsk = Date.now();
        if (OBSTACLE_IDS.includes(s.story.target)) mark(`${s.story.target}-start`);
        const where = await ev(`(() => { const t = window.__memory.targets().find(t => t.type === 'task' && t.id === ${JSON.stringify(s.story.target)}); return t ? { x: Math.round(t.x), y: Math.round(t.y), enabled: t.enabled } : null; })()`);
        await act(`task-${s.story.target}`, `tap the ${s.story.target}`, { since: +((Date.now() - lastProgress) / 1000).toFixed(1), at: where });
      } else if (s.phase === 'one-open' && mayAct && s.cards.some(c => c.status === 'open' && c.item)) {
        // A gift's first leaf is open. The first two pairs are tried wrongly once (with another gift, then with a friend), then the partner.
        const open = s.cards.find(c => c.status === 'open'), k = giftItems.indexOf(open.item);
        let target;
        if (!giftMissed.has(open.item) && k < 2) {
          giftMissed.add(open.item);
          target = k === 0 ? hiddenGift(s, giftItems[1])[0] : s.cards.find(c => c.species && c.status === 'hidden')?.id;
          if (leaf(target)) { await act(`leaf-${target}`, `pick leaf ${target} (${s.cards[target].item ?? s.cards[target].species}) to miss the ${open.item} on purpose`); continue; }
        }
        target = hiddenGift(s, open.item).find(leaf);
        if (target !== undefined) await act(`leaf-${target}`, `pick leaf ${target} (the other ${open.item})`);
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
        // With every friend found, the bridge built and gifts left (--gifts-last): Mosi says so, the gold arrow points at a shut leaf and a tap on the staging spot says the same.
        if (wantGifts && o.giftsLast && /gifts-left$/.test(s.story.key) && !giftsLeftChecked) {
          giftsLeftChecked = true; step('every friend home, the bridge built, gifts left: hesitate for the arrow');
          const speechBefore = (await ev('window.__memory.audio().speech.started')).filter(x => x.id === 'giftsLeft').length;
          // The wait is played in the search view (camera intent 'glade'): once the glide has settled, every shut leaf is inside the frame.
          await waitFor('!window.__demoStats.camera.moving', 20000, 'the wait camera');
          report.giftsView = await ev(GIFTS_VIEW_JS); step('the wait view', report.giftsView);
          const arrowAt = await waitFor('window.__memory.idle() > 4.4 && document.querySelector("#targets .is-guided")', 15000, 'the gold arrow on a shut leaf');
          const arrow = await ev(SNAPSHOT_JS); await milestone('gifts-left-arrow', 'gifts-left-gold-arrow', 200);
          report.giftsArrow = await ev(ARROW_JS).catch(e => ({ error: e.message })); step('the gold arrow', report.giftsArrow ?? {});
          const stagingButton = LEVEL.number > 1 ? { present: false } : await ev(`(() => { const b = document.querySelector('[data-target="task-staging"]'); if (!b) return { present: false }; const r = b.getBoundingClientRect(); return { present: true, enabled: !b.disabled, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), onScreen: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; })()`);
          const before = await ev(SNAPSHOT_JS);
          const leafButtons = await ev(LEAF_BOXES_JS(':not(:disabled)')); delete leafButtons.boxes; // the shut leaves' buttons as the wide view lays them out
          if (LEVEL.number === 1) await act('task-staging', 'tap the staging spot with gifts left'); await sleep(1800);
          const after = await ev(SNAPSHOT_JS); await milestone('gifts-left-tap', 'gifts-left-staging-tap', 100);
          const spoken = (await ev('window.__memory.audio().speech.started')).filter(x => x.id === 'giftsLeft');
          report.giftsLeft = { stagingButton, story: before.story.key, caption: before.caption, arrowAfterIdle: arrowAt >= 0, guidedLeaf: arrow.guidedLeaf, guidedLeafHidden: arrow.guidedLeaf ? before.cards[Number(arrow.guidedLeaf.slice(5))].status === 'hidden' : null,
            leafButtons, linesBeforeTap: speechBefore, linesAfterTap: spoken.length, crossStartedByTap: after.bridge.active === 'cross' || after.mosi === 'walk', captionAfterTap: after.caption, giftsLeft: after.giftsLeft };
          step('gifts left check', report.giftsLeft); continue;
        }
        const dueItem = wantGifts ? giftItems.find((item, k) => !s.found.includes(item) && s.matched >= giftAt[k]) : undefined;
        if (dueItem !== undefined) {
          const firstLeaf = hiddenGift(s, dueItem).find(leaf);
          if (firstLeaf !== undefined) {
            if (!report.gifts.some(g => g.item === dueItem)) report.gifts.push({ item: dueItem, id: firstLeaf, at: T() });
            await act(`leaf-${firstLeaf}`, `pick gift leaf ${firstLeaf} (${dueItem})`); continue;
          }
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
      if (rapid && (s.scene || s.cam.held) && Date.now() - lastHammer > 400) { lastHammer = Date.now(); await ev(hammerJs(LEVEL)); }
      await sleep(rapid ? 120 : 150);
    }
    report.roundSeconds = +((Date.now() - roundStart) / 1000).toFixed(1);
    for (const entry of report.marks) entry.round = +(entry.at - roundStart / 1000).toFixed(1);
    try { const end = await ev(SNAPSHOT_JS); report.found = end.found; report.basketEnd = end.basket; } catch {}
    try { report.storage = await ev("(() => { try { return localStorage.getItem('minnisspil.unlocked'); } catch (e) { return 'blocked: ' + e.message; } })()"); } catch {}
    if (retryWatch) report.blockedRetry.push({ ...retryWatch, neverRetried: true });

    // ---- what the run looked like -----------------------------------------------------------------------------
    try { report.timeline = await ev('window.__tl'); report.taps = await ev('window.__taps'); report.pageOrigin = await ev('window.__origin'); } catch {}
    report.timelineCheck = timelineCheck(report.timeline, report.taps);
    // (final fix round 1, T-M11) The spec: no watch longer than about 8 s without a cut or a tap (Ruling 31). longestWatch is the longest stretch of game time,
    // while a script, a task or a wrong friend's go runs, with no new framing (a cut or the start of a glide) and no tap: over 9 s fails the run.
    // A slowed run (--cpu-throttle, --clearance) is not timed: its seconds are the slow machine's.
    const watch = report.timelineCheck?.longestWatch;
    if (watch && watch.seconds > 9 && !o.cpuThrottle && !o.clearance) errors.push(`the longest watch is ${watch.seconds} s with no new framing and no tap (over 9 s): ${JSON.stringify({ act: watch.act, shot: watch.shot, caption: watch.caption })}`);
    // The glide from the search view into the crossing once the last gift pair has landed (--gifts-last): from the camera on every frame.
    try {
      const track = await ev('window.__camTrack');
      if (o.giftsLast && track?.length && LEVEL.number === 1) {
        const [w, h] = o.size.split('x').map(Number);
        report.giftsGlide = analyseGlide(track, w / h, report.giftsView?.mosiAt);
        const keep = report.giftsGlide.landedAt != null ? track.filter(f => f.t >= report.giftsGlide.landedAt - 1.5) : track.slice(-300);
        await fsp.writeFile(path.join(outDir, 'camtrack.json'), JSON.stringify(keep));
        step('the glide into the crossing', { ...report.giftsGlide, intents: report.giftsGlide.intents?.length });
      }
    } catch (e) { report.giftsGlide = { error: e.message }; }
    try {
      // Every line of Mosi's that began, with the game clock (the speech's own log, not a sample), and how long the gifts line took to follow the gifts beat.
      report.spoken = await ev('window.__memory.audio().speech.started'); report.sounds = await ev('window.__sounds'); report.audioLog = await ev('window.__audioLog');
      // The page's own sounds (the juice pass: Litla Yatzy's, on the buttons, the picker, the basket, the dots and the end) that sounded, and when;
      // with --video each kind is rendered once in the page, to lay under the video too.
      report.uiSounds = ((await ev('window.__memory.audio().ui?.asked ?? []')) ?? []).filter(sound => sound.sounded);
      if (o.video) report.uiRendered = await renderUiSounds(ev, outDir, report.uiSounds).catch(error => ({ error: error.message }));
      const beats = (await ev('window.__memory.stats().scene.beats')) ?? [], cheer = beats.find(b => b.name === (LEVEL.number === 2 ? 'fossils-glow' : 'mosi-cheer')), giftsLine = LEVEL.number === 2 ? 'gifts4' : 'gifts3', wonLine = LEVEL.number === 2 ? 'g2_won' : 'won', gifts = report.spoken.find(s => s.id === giftsLine);
      // (level 2: g2_won as the Flugeðlur circle, gifts4 over the glowing row; giftsLag from the row's beat)
      report.speechCheck = { won: report.spoken.filter(s => s.id === wonLine).length, [giftsLine]: report.spoken.filter(s => s.id === giftsLine).length, wonBeforeGifts: (report.spoken.find(s => s.id === wonLine)?.t ?? Infinity) < (gifts?.t ?? -Infinity), giftsLag: cheer && gifts ? +(gifts.t - cheer.t).toFixed(2) : null,
        giftLines: report.spoken.filter(s => /^gift_/.test(s.id)).map(s => s.id), giftsLeftLines: report.spoken.filter(s => s.id === 'giftsLeft').length };
    } catch {}
    // Where the round ended (a finished round or a stuck one): the page's own state, to read when it did not finish.
    try { report.endState = await ev(`(() => { const d = window.__memory.stats(), b = d.bridge || {}; return { action: b.action ? { id: b.action.id, phase: b.action.phase, age: b.action.age } : null, scene: { busy: d.scene.busy, waiting: d.scene.waiting }, camera: { mode: d.camera.mode, moving: d.camera.moving, held: d.camera.held, shot: d.camera.shot }, bridge: window.__memory.bridge(), pairs: Object.fromEntries(Object.entries(b.pairs || {}).map(([k, p]) => [k, { ready: p.ready, actors: (p.actors || []).map(a => ({ at: a.position && a.position.map(v => +v.toFixed(2)), motion: a.motion, gesture: a.gesture })) }])), idle: d.idle && d.idle.active, homeNavigation: d.homeNavigation && { planned: d.homeNavigation.planned, failures: d.homeNavigation.failures, maxPlanningMs: d.homeNavigation.maxPlanningMs, maxIterations: d.homeNavigation.maxIterations, maxSliceMs: d.homeNavigation.maxSliceMs, lastPlan: d.homeNavigation.lastPlan, lastTrafficBlock: d.homeNavigation.lastTrafficBlock }, cells: d.cells.map(c => ({ id: c.id, species: c.species, status: c.status, moved: c.moved, moving: c.moving, at: c.position && c.position.map(v => +v.toFixed(2)) })) }; })()`); } catch (e) { report.endState = { error: e.message }; }
    try {
      const d = await ev('window.__memory.stats()');
      report.idle = d.idle; report.idleCheck = idleCheck(d.idle);
      const beats = d.scene?.beats ?? [];
      if (beats.length) report.celebration = { beats, seconds: +(beats.at(-1).t - beats[0].t).toFixed(2), cuts: beats.filter(b => b.cut).map(b => b.t).map((t, i, all) => i ? +(t - all[i - 1]).toFixed(2) : null).filter(Boolean) };
    } catch {}
    try {
      const takes = Object.values(await ev('window.__takes')).sort((a, b) => b.tris - a.tris);
      report.takes = takes; report.routes = await ev('window.__routes');
      // The action's own seconds (the game clock; the wall-clock spans above run a little longer when a frame takes over 50 ms).
      if (report.timelineCheck?.grove && report.routes?.finish) report.timelineCheck.grove.actionSeconds = report.routes.finish.elapsed;
      if (report.timelineCheck?.marsh && report.routes?.lay) report.timelineCheck.marsh.actionSeconds = report.routes.lay.elapsed;
      if (report.timelineCheck) report.timelineCheck.takes = takes.length;
      if (o.clearance) report.clearance = await ev('window.__clr');
    } catch {}
    if (report.timelineCheck) step('timeline check', { crossing: report.timelineCheck.crossing?.deckToInput ?? null, marsh: report.timelineCheck.marsh?.layToBoardwalk ?? null, grove: report.timelineCheck.grove?.firstStepToArrive ?? null, sunLedge: report.timelineCheck.sunLedge?.watchAfterArrival ?? null, longestWatch: report.timelineCheck.longestWatch?.seconds ?? null });
    try {
      report.perf = await ev(PERF_JS(4));
      report.render = await ev(`(() => { const s = window.__demoStats || {}; return { drawCalls: s.drawCalls, triangles: s.triangles, textures: s.textures, geometries: s.geometries, resolutionScale: s.resolutionScale }; })()`);
      report.renderMax = await ev('window.__max'); report.sight = await ev('window.__sight || null');
      // What one world.getDebug() costs here (it used to run on every frame for window.__demoStats; now only when it is read).
      report.debugCostMs = await ev("(() => { const t = performance.now(); for (let i = 0; i < 20; i++) window.__memory.stats({ collision: false }); return +((performance.now() - t) / 20).toFixed(2); })()").catch(() => null);
      // The ending render scale: a full 1280x800 round that ends below 1 is flagged (the scale must recover once the frames are fast again).
      const res = (await ev('window.__res')) ?? {}, end = report.render?.resolutionScale;
      report.resolution = { end, min: res.min ?? null, changes: res.changes ?? [], flag: o.mode === 'full' && o.width === 1280 && o.height === 800 && Number.isFinite(end) && end < 0.999 ? (o.cpuThrottle > 1 ? 'ends below 1 (CPU throttled: expected)' : 'ENDS BELOW 1 AT 1280x800') : null };
      report.scenePerf = await ev(`(() => { const d = window.__scenePerf.slice(1), s = [...d].sort((a, b) => a - b); return d.length ? { frames: d.length, fps: +(1000 / (d.reduce((a, b) => a + b, 0) / d.length)).toFixed(1), p95ms: +s[Math.floor(s.length * .95)].toFixed(1), worstMs: +s[s.length - 1].toFixed(1) } : null; })()`);
      // Throttled: lift the throttle and give the game 15 s of fast frames; the render scale must have stepped back up (.05 at a time, at most every 4 s).
      if (o.cpuThrottle > 1) {
        await send('Emulation.setCPUThrottlingRate', { rate: 1 }); await sleep(15000);
        report.resolution.afterRelief = await ev('window.__demoStats.resolutionScale'); report.resolution.lastChanges = ((await ev('window.__res')) ?? {}).changes?.slice(-8) ?? [];
      }
    } catch (e) { report.perf = { error: e.message }; }
    if (o.video) {
      await send('Page.stopScreencast').catch(() => {});
      await sleep(300);
    }
  } catch (e) {
    fatal = e; errors.push(`driver: ${e.stack || e.message}`.slice(0, 900));
  } finally {
    // (final fix round 1, T-M12) the browser and the server go first: an encode can take long, and a throw in it must not leave Edge running
    if (o.video) await Promise.allSettled(frames.writes);
    await stopBrowser(browser);
    server.close();
    process.off('SIGINT', onInterrupt);
    if (o.video) try {
      report.video = await makeVideo(framesDir, outDir, frames, { encode: o.encode });
      if (o.encode && report.video.file) report.soundtrack = await makeSoundtrack(outDir, report, frames.stamps.find(Number.isFinite), report.video.videoSeconds);
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
    } catch (e) { errors.push(`video: ${e.stack || e.message}`.slice(0, 900)); }
    report.finishedAt = new Date().toISOString();
    report.totalSeconds = T();
    await fsp.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  }
  const r = report;
  console.log(`${r.finished ? 'FINISHED' : 'NOT FINISHED'} ${o.mode} ${o.size}: round ${r.roundSeconds}s, ${r.errors.length} errors, ${r.steps.length} steps, perf ${JSON.stringify(r.perf)}, render ${JSON.stringify(r.render)}`);
  if (r.video) console.log(`Video: ${r.video.file ?? 'none'} (${r.video.frames} frames${r.video.error ? ', ' + r.video.error : ''})`);
  if (r.marks?.length) console.log(`Marks: ${r.marks.map(m => `${m.name} ${m.video ?? m.round}s`).join(', ')}`);
  if (r.timelineCheck) console.log(`Timeline check: crossing ${JSON.stringify(r.timelineCheck.crossing)}, marsh ${JSON.stringify(r.timelineCheck.marsh)}, grove ${JSON.stringify(r.timelineCheck.grove)}, Sólarsyllan ${JSON.stringify(r.timelineCheck.sunLedge)}, longest watch ${JSON.stringify(r.timelineCheck.longestWatch)}${r.timelineCheck.video ? `, video ${JSON.stringify(r.timelineCheck.video)}` : ''}`);
  if (r.takes?.length) console.log(`Heaviest framings: ${r.takes.slice(0, 5).map(t => `#${t.take} ${t.shot || '-'} ${t.act ?? ''} ${Math.round(t.tris / 1000)}k/${t.calls} (friends ${t.actors ?? '?'}k, ${t.drawn ?? '?'} drawn)`).join(' | ')}`);
  if (r.clearance) console.log(`Plants: ${r.clearance.plants?.samples} samples, closest gap ${r.clearance.plants?.minimum} m ${JSON.stringify(r.clearance.plants?.closest)}`);
  if (r.clearance) console.log(`Clearance: ${r.clearance.samples} samples, minimum ${r.clearance.minimum}, ${Object.keys(r.clearance.worst).length} overlaps ${JSON.stringify(Object.values(r.clearance.worst).sort((a, b) => a.clearance - b.clearance).slice(0, 6))}`);
  if (r.reach) console.log(`Targets a finger could not fully reach: ${r.reach.hard.length} of ${r.reach.checks} taps; ${Object.keys(r.reach.obstructed).length} kinds in ${r.reach.sampled} samples of the enabled ones${Object.keys(r.reach.obstructed).length ? ' ' + JSON.stringify(Object.values(r.reach.obstructed).slice(0, 8).map(x => ({ key: x.key, by: x.covers, worst: x.worstPercent, centre: x.centreHit, inside: x.inside, n: x.samples }))) : ''}`);
  if (r.blocked) console.log(`Blocked walks (bridge-blocked): ${r.blocked.length}${r.blocked.length ? ' ' + JSON.stringify(r.blocked) : ''}; retried by itself: ${JSON.stringify((r.blockedRetry ?? []).map(x => ({ id: x.id, reason: x.reason, seconds: x.secondsToRetry, arrow: x.arrowAt != null, captions: x.captions })))}`);
  if (r.resolution) console.log(`Resolution scale: end ${r.resolution.end}, lowest ${r.resolution.min}, ${r.resolution.changes.length} changes${r.resolution.afterRelief !== undefined ? `, ${r.resolution.afterRelief} after 15 s without the throttle` : ''}${r.resolution.flag ? ' - FLAG: ' + r.resolution.flag : ''}`);
  if (r.resolutionRestart) console.log(`Resolution across the restart: ${JSON.stringify(r.resolutionRestart)}`);
  if (r.restartVerdict) console.log(`Restart (${r.restartVerdict.mode}): ${r.restartVerdict.passed ? 'clean' : `NOT CLEAN: ${r.restartVerdict.bad.join('; ')}`}`);
  if (r.throughPrograms) console.log(`Programs over the through cut: ${r.throughPrograms.beforeCut} before, ${r.throughPrograms.afterCut} after, ${r.throughPrograms.lineup} at the line-up (${JSON.stringify(r.throughPrograms.samples)})`);
  if (r.cancelCheck) console.log(`"Aftur" check with the bubbles open: ${JSON.stringify(r.cancelCheck)}`);
  if (r.debugCostMs != null) console.log(`One world.getDebug() call: ${r.debugCostMs} ms`);
  console.log(`GPU: ${r.gpu}`);
  console.log(`Report: ${path.relative(ROOT, path.join(outDir, 'report.json')).replace(/\\/g, '/')}`);
  if (fatal || !r.finished || r.errors.length) process.exitCode = 1;
}

// The camera's frames around the last gift pair's landing and the crossing's start, read out: the intents it passed through, how far and how fast it moved
// (a jump over 3 m in one frame is a cut), how long the glide took, whether Mosi (his feet and head, from his place in the wait) stayed on the screen, and how
// long after the landing the crossing began. Points are projected with the game's own lens (35 degrees, the page's aspect).
function analyseGlide(track, aspect, mosiAt) {
  const landed = track.find(f => f.basket > 0 && track.every(g => g.basket <= f.basket) && f.basket === Math.max(...track.map(g => g.basket)));
  const cross = track.find(f => f.cross);
  if (!landed || !cross) return { error: 'no landing or no crossing in the camera track', frames: track.length };
  const view = track.filter(f => f.t >= landed.t - 1.2 && f.t <= cross.t + 2.0);
  const sub = (a, b) => a.map((v, i) => v - b[i]), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = a => { const l = Math.hypot(...a); return a.map(v => v / l); }, crossP = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const tan = Math.tan(35 / 2 * Math.PI / 180);
  const inside = (frame, point) => { const f = norm(sub(frame.g, frame.p)), r = norm(crossP(f, [0, 1, 0])), u = crossP(r, f), rel = sub(point, frame.p), z = dot(rel, f); if (z <= 0) return false; return Math.abs(dot(rel, r) / (z * tan * aspect)) <= 1 && Math.abs(dot(rel, u) / (z * tan)) <= 1; };
  const mosiPoints = mosiAt ? [mosiAt, [mosiAt[0], mosiAt[1] + 2.1, mosiAt[2]]] : [];
  let maxStep = 0, peakSpeed = 0, jumps = 0, mosiOut = 0, glideFrames = 0, cutStep = 0;
  const intents = [];
  for (let i = 0; i < view.length; i++) {
    const f = view[i], last = intents.at(-1);
    if (!last || last.intent !== f.intent || last.moving !== f.moving || last.shot !== f.shot) intents.push({ at: +(f.t - landed.t).toFixed(2), intent: f.intent, moving: f.moving, shot: f.shot, cross: f.cross });
    if (i && f.t <= cross.t + 0.4) {
      const step = Math.hypot(...sub(f.p, view[i - 1].p)), dt = f.t - view[i - 1].t;
      if (f.t < cross.t - 0.05) { maxStep = Math.max(maxStep, step); if (dt > 0) peakSpeed = Math.max(peakSpeed, step / dt); if (step > 3) jumps++; }
      else cutStep = Math.max(cutStep, step); // the crossing's own first shot is a cut (scenes/cross.js)
    }
    if (f.t >= landed.t && f.t < cross.t && f.moving) glideFrames++;
    if (f.t >= landed.t && f.t <= cross.t + 0.1 && mosiPoints.some(point => !inside(f, point))) mosiOut++;
  }
  const glade = view.filter(f => f.t < landed.t && f.intent !== 'glade' && !f.cross);
  const movingSpan = view.filter(f => f.t >= landed.t && f.t < cross.t && f.moving);
  return { landedAt: landed.t, crossAt: cross.t, secondsToCrossing: +(cross.t - landed.t).toFixed(2), glideSeconds: movingSpan.length ? +(movingSpan.at(-1).t - movingSpan[0].t).toFixed(2) : 0, glideFrames,
    beforeLandingNotGlade: glade.length, maxStepMetres: +maxStep.toFixed(2), crossingCutMetres: +cutStep.toFixed(2), peakSpeedMetresPerSecond: +peakSpeed.toFixed(1), jumpsOver3m: jumps, mosiOutFrames: mosiOut, mosiChecked: mosiPoints.length > 0,
    intentAtLanding: landed.intent, intentAtCrossing: cross.intent, intents, frames: view.length, from: view[0].p, to: view.at(-1).p };
}

// frames/%05d.jpg -> round.mp4 at 15 fps. The screencast sends a frame only when the picture changes (about 22 a second
// while the scene moves here), so the frames are laid out by the time the browser stamped on each (frames.txt, ffmpeg's
// concat list) and the video plays at the speed the round was played. Without usable stamps it falls back to a plain
// 15 fps sequence, and the report's captureSeconds against videoSeconds shows by how much that speed is off.
async function makeVideo(framesDir, outDir, frames, { encode = true } = {}) {
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
  await fsp.writeFile(path.join(outDir, 'frames-stamps.json'), JSON.stringify(stamps));
  if (!encode) { info.encoded = false; return info; }
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', file], { encoding: 'utf8', timeout: 60 * 60 * 1000 });
  if (r.status !== 0) { info.error = `ffmpeg failed: ${(r.stderr || r.error?.message || '').slice(0, 400)}`; return info; }
  info.file = path.relative(ROOT, file).replace(/\\/g, '/');
  info.bytes = fs.statSync(file).size;
  return info;
}

// The page's own sounds are made on the spot by Litla Yatzy's sound code (engine/yatzy-junior/sounds.js), so there is no file to lay: each name that
// sounded is rendered once in the page with that same code into an OfflineAudioContext (mono, 44.1 kHz, 3 s) and kept beside the frames as
// ui-sounds/<name>.f32 (raw float32) for the soundtrack. A kind may be more than one name (the end: the confetti's rustle and the fanfare).
const UI_NAMES = { tap: ['tap'], oh: ['oh'], bubble: ['bubble'], close: ['close'], dialog: ['pause'], dialogClose: ['resume'], land: ['land'], pip: ['pip'], win: ['confetti', 'fanfare'] };
const UI_LEVEL = .9; // how loud they are laid: as in the page (its output's headroom; they dip under Mosi's voice there, not here: they are short and few)
async function renderUiSounds(ev, outDir, asked) {
  const names = [...new Set(asked.flatMap(sound => UI_NAMES[sound.kind] ?? []))]; if (!names.length) return { names: [] };
  await fsp.mkdir(path.join(outDir, 'ui-sounds'), { recursive: true });
  // (one name at a time, cut where it falls silent: one answer with them all was too big for the DevTools socket, which closed)
  for (const name of names) {
    const text = await ev(`(async () => {
      const base = new URL('./engine/', location.href);
      const { createSfx } = await import(new URL('audio/sfx.js', base)), { juniorSounds } = await import(new URL('yatzy-junior/sounds.js', base));
      const theme = await fetch(new URL('../assets/audio/theme.json', base)).then(r => r.ok ? r.json() : null, () => null);
      const context = new OfflineAudioContext(1, 44100 * 3, 44100);
      Object.defineProperty(context, 'state', { value: 'running' }); // (the sounds play only on a running context; an offline one runs once it renders)
      createSfx({ context, theme, output: context.destination, sounds: tools => juniorSounds(tools, () => ({})) }).play(${JSON.stringify(name)});
      const data = (await context.startRendering()).getChannelData(0); let last = 0;
      for (let i = 0; i < data.length; i++) if (Math.abs(data[i]) > 1e-4) last = i;
      const bytes = new Uint8Array(data.slice(0, Math.min(data.length, last + 2205)).buffer); let text = '';
      for (let i = 0; i < bytes.length; i += 32768) text += String.fromCharCode(...bytes.subarray(i, i + 32768));
      return btoa(text);
    })()`);
    await fsp.writeFile(path.join(outDir, 'ui-sounds', name + '.f32'), Buffer.from(text, 'base64'));
  }
  return { names };
}

// The sounds the page played, laid under the video: each recorded cue of the audio log (its file, when it began by the wall clock, how loud and how fast) and each of Mosi's lines
// (the speech log), mixed to one mono track in the file's own time (the screencast's first frame is 0) and muxed into round-sound.mp4. The music is left out: the owner
// listens to the cues and the voice. The envelope of each cue is the page's own (full for 70 % of it, then down to nothing).
async function makeSoundtrack(outDir, report, first, seconds) {
  if (!Number.isFinite(first) || !(seconds > 0)) return { error: 'no first frame stamp' };
  const RATE = 44100, total = Math.ceil((seconds + 2) * RATE), mix = new Float32Array(total), cache = new Map();
  const pcm = file => {
    if (!cache.has(file)) {
      const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
      cache.set(file, r.status === 0 ? new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length)) : null);
    }
    return cache.get(file);
  };
  const lay = (data, at, level, rate = 1, fade = true) => {
    if (!data || !(at >= -1)) return false;
    const start = Math.round(at * RATE), n = Math.floor(data.length / rate);
    for (let i = 0; i < n; i++) {
      const j = start + i; if (j < 0 || j >= total) continue;
      const x = i * rate, k = Math.floor(x), f = x - k, value = (data[k] ?? 0) * (1 - f) + (data[k + 1] ?? 0) * f, u = i / n;
      mix[j] += value * (fade && u > .7 ? level * Math.pow(.0001 / Math.max(level, .0002), (u - .7) / .3) : level);
    }
    return true;
  };
  // (a cue's file: as the soundscapes' manifests name it, which may be a path into another game's sounds, level 2's claps and cheer from
  // Söngur Slóeðlu: Task 7 fix round 1; else <id>.mp3 beside them). Every level's folder (gorge/, grove/...) and the shared one.
  const named = new Map(), scapes = path.join(ROOT, 'remake/assets/audio/memory/soundscape');
  const dirs = [...fs.readdirSync(scapes, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name + '/'), ''];
  for (const dir of dirs) {
    const file = path.join(ROOT, 'remake/assets/audio/memory/soundscape', dir, 'manifest.json');
    if (fs.existsSync(file)) for (const [id, entry] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')).sfx ?? {})) if (!named.has(id)) named.set(id, path.resolve(path.dirname(file), entry.file));
  }
  const cueFile = id => [named.get(id), ...dirs.map(dir => path.join(ROOT, 'remake/assets/audio/memory/soundscape', dir, id + '.mp3'))].find(file => file && fs.existsSync(file));
  let cues = 0, voices = 0;
  for (const cue of report.audioLog ?? []) { const file = cueFile(cue.asset); if (file && lay(pcm(file), cue.at / 1000 - first, cue.level ?? .5, cue.rate ?? 1)) cues++; }
  for (const line of report.spoken ?? []) { const file = path.join(ROOT, 'remake/assets/audio/memory', line.id + '.mp3'); if (line.at && fs.existsSync(file) && lay(pcm(file), line.at / 1000 - first, .74, 1, false)) voices++; }
  // (the page's own sounds, rendered in the page: renderUiSounds)
  let ui = 0;
  const raw = file => { const bytes = fs.readFileSync(file); return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)); };
  for (const sound of report.uiSounds ?? []) for (const name of UI_NAMES[sound.kind] ?? []) {
    const file = path.join(outDir, 'ui-sounds', name + '.f32');
    if (sound.wall && fs.existsSync(file) && lay(cache.get(file) ?? cache.set(file, raw(file)).get(file), sound.wall / 1000 - first, UI_LEVEL, 1, false)) ui++;
  }
  let peak = 0; for (const v of mix) peak = Math.max(peak, Math.abs(v));
  if (peak > .95) for (let i = 0; i < mix.length; i++) mix[i] *= .95 / peak;
  const track = path.join(outDir, 'soundtrack.m4a'), silent = path.join(outDir, 'round.mp4'), sound = path.join(outDir, 'round-sound.mp4');
  let r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'f32le', '-ar', String(RATE), '-ac', '1', '-i', '-', '-c:a', 'aac', '-b:a', '128k', track], { input: Buffer.from(mix.buffer), maxBuffer: 1 << 28 });
  if (r.status !== 0) return { error: String(r.stderr).slice(0, 300) };
  r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', silent, '-i', track, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'copy', '-shortest', sound], { encoding: 'utf8', timeout: 20 * 60 * 1000 });
  if (r.status !== 0) return { error: String(r.stderr).slice(0, 300) };
  return { file: path.relative(ROOT, sound).replace(/\\/g, '/'), cues, voices, ui, peak: +peak.toFixed(2), seconds: +seconds.toFixed(1) };
}

// --encode-only: the video and its sound from the frames of an earlier --video run (--no-encode) in --out, with no browser.
async function encodeOnly(o) {
  const outDir = path.resolve(ROOT, o.out), report = JSON.parse(await fsp.readFile(path.join(outDir, 'report.json'), 'utf8'));
  const framesDir = path.join(outDir, 'frames'), names = (await fsp.readdir(framesDir)).filter(name => name.endsWith('.jpg')), stamps = JSON.parse(await fsp.readFile(path.join(outDir, 'frames-stamps.json'), 'utf8'));
  const frames = { n: names.length, stamps };
  report.video = await makeVideo(framesDir, outDir, frames, { encode: true });
  if (report.video.file) report.soundtrack = await makeSoundtrack(outDir, report, stamps.find(Number.isFinite), report.video.videoSeconds);
  await fsp.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log('Video:', JSON.stringify(report.video), 'Sound:', JSON.stringify(report.soundtrack));
}

if (process.argv.includes('--encode-only')) encodeOnly(parseArgs(process.argv.slice(2))).catch(e => { console.error(e); process.exit(2); });
else main().catch(e => { console.error(e); process.exit(2); });
