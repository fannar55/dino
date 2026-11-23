#!/usr/bin/env node
// Checks the chapters on the book's map (engine/book/map-chapters.js) in the real game, by touch, and records it as a video for the
// owner to watch.
//
//   node remake/tools/map-chapters-check.mjs [--out qa/kort-kaflar/video] [--size 1280x800] [--sound] [--browser edge|chrome|<exe>]
//
// It serves the repo on a throwaway server and opens remake/index.html in a headless browser whose save has the first three
// chapters finished, so the page plays chapter 4. Then, with real touches (the DevTools protocol's touch events, a finger down and
// up on the middle of each control), it does what a child would:
//   1  taps the start button, and then the journal's button: the book opens
//   2  taps the Kortið ribbon: the finished places twinkle
//   3  taps Slóeðla's place, found but not finished: no question comes up
//   4  taps Uggeðla's place: "Viltu fara í kafla 2?" comes up; taps "Nei": the card goes, the book is still on its map
//   5  taps Kambeðla's place: "Viltu fara í kafla 1?"; taps "Já!": the page becomes chapter 1's, from its start
//   6  in chapter 1, opens the map again: Flugeðla's place, where the story has come to, asks too (the way back)
// Each step is held to what it should show; the first that does not is said and the exit code is 1. The video (<out>/video.mp4, 15
// frames a second) has a pale ring wherever a finger went down, drawn by this tool and never by the game. With --sound the page's
// sound is under the picture up to the "Já!" (as tools/veiddu-video.mjs records it); after it the page is another and the video is
// silent. <out>/video-stutt.mp4 is the same video with the waits cut out of it (the sound being fetched from the page before the
// "Já!", and chapter 1 loading behind the black), for a phone. <out>/report.json says what was seen, and when (marks, in the video's
// seconds). Nothing is left running.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, sleep, launchBrowser, stopBrowser, startVideo, soundTap, collectSound, mixSound } from './veiddu-video.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};
// The save the check begins with: chapters 1 to 3 finished, the far friends found from Þórseðla's head, the trail drawn before.
const SAVE = {
  stars: ['k1_kambedla', 'k2_uggedla', 'k2_thorsedla'],
  findings: ['butterfly'],
  seen: ['map-route-a', 'map-route-b', 'map-route-c'],
  places: ['fen', 'sloedla', 'flugedla', 'uggedla'],
};

function parseArgs(argv) {
  const o = { out: 'qa/kort-kaflar/video', size: '1280x800', sound: false, browser: 'edge' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--out') o.out = next();
    else if (a === '--size') o.size = next();
    else if (a === '--browser') o.browser = next();
    else if (a === '--sound') o.sound = true;
    else throw new Error(`Unknown argument ${a}`);
  }
  const [w, h] = o.size.split('x').map(Number);
  if (!(w > 0 && h > 0)) throw new Error(`--size must be WIDTHxHEIGHT, not ${o.size}`);
  o.width = w;
  o.height = h;
  return o;
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const asked = path.resolve(ROOT, `.${decodeURIComponent(url.pathname)}`);
      if (!asked.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      const stat = await fsp.stat(asked);
      const target = stat.isDirectory() ? path.join(asked, 'index.html') : asked;
      const body = await fsp.readFile(target);
      const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? ''); // byte ranges, as tools/serve.mjs gives them (the theme)
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
        if (start > end || start >= body.length) { res.writeHead(416, { 'Content-Range': `bytes */${body.length}` }); res.end(); return; }
        res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${body.length}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': 'no-store' });
        res.end(body.subarray(start, end + 1));
        return;
      }
      res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Sent to every page before it runs: the save, once, and the ring that shows where a finger went down (the tool's, in the video only). */
function seed(save) {
  try {
    if (!localStorage.getItem('mosi-remake-v1')) localStorage.setItem('mosi-remake-v1', JSON.stringify(save));
  } catch { /* a page without storage */ }
  window.__finger = (x, y) => {
    const ring = document.createElement('div');
    ring.style.cssText = `position:fixed;z-index:99999;left:${x - 34}px;top:${y - 34}px;width:68px;height:68px;border-radius:50%;border:5px solid rgb(255 255 255 / .95);box-shadow:0 0 0 3px rgb(0 0 0 / .45);pointer-events:none;`;
    document.documentElement.append(ring);
    ring.animate([{ opacity: 1, transform: 'scale(.6)' }, { opacity: 0, transform: 'scale(1.25)' }], { duration: 900, easing: 'ease-out', fill: 'forwards' }).onfinish = () => ring.remove();
  };
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(ROOT, o.out);
  await fsp.mkdir(outDir, { recursive: true });
  const errors = [];
  const steps = [];
  const marks = {}; // name -> when (the clock's ms), made the video's seconds at the end
  const mark = name => { marks[name] = Date.now(); };
  const report = { size: o.size, startedAt: new Date().toISOString(), steps, errors, marks: null, video: null, sound: null, short: null, ok: false };
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}/remake/index.html`;
  const browser = await launchBrowser(o);
  const { cdp } = browser;
  const finalFile = path.join(outDir, 'video.mp4');
  const videoFile = o.sound ? path.join(outDir, 'video-silent.mp4') : finalFile;
  const workDir = o.sound ? await fsp.mkdtemp(path.join(os.tmpdir(), 'kort-sound-')) : null;
  const recorder = startVideo(videoFile, o.width, o.height);
  const lagSamples = [];
  let sound = null;
  let failed = null;
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
      } else if (msg.method === 'Page.screencastFrame') {
        if (o.sound && msg.params.metadata?.timestamp) lagSamples.push(Date.now() - msg.params.metadata.timestamp * 1000);
        recorder.frame(Buffer.from(msg.params.data, 'base64'), msg.params.metadata?.timestamp ? msg.params.metadata.timestamp * 1000 : Date.now());
        send('Page.screencastFrameAck', { sessionId: msg.params.sessionId }).catch(() => {});
      }
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${seed.toString()})(${JSON.stringify(SAVE)})` });
    if (o.sound) await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${soundTap.toString()})()` });
    await send('Emulation.setDeviceMetricsOverride', { width: o.width, height: o.height, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    const ev = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const until = async (expression, what, seconds = 120) => {
      for (let n = 0; n < seconds * 10; n++) {
        if (await ev(expression).catch(() => false)) return;
        await sleep(100);
      }
      throw new Error(`Waited ${seconds} s and never saw: ${what}`);
    };
    /** A finger down and up on the middle of the element, as the tablet sends it. */
    const touch = async (selector, what) => {
      const at = await ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } : null; })()`);
      if (!at) throw new Error(`Nothing to touch for ${what} (${selector})`);
      await ev(`window.__finger?.(${at.x}, ${at.y})`);
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(at.x), y: Math.round(at.y) }] });
      await sleep(90);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      return at;
    };
    const step = async (name, check, what) => {
      const seen = await ev(check);
      steps.push({ name, seen });
      if (!seen || seen.ok === false) throw new Error(`${name}: ${what} (${JSON.stringify(seen)})`);
      console.log(`ok  ${name}`);
    };
    const ask = `(() => { const el = document.querySelector('.map-ask'); return { open: Boolean(el) && !el.hidden, words: el?.querySelector('.map-ask-words')?.textContent ?? null }; })()`;

    // 1 the game as the child finds it: the save is at chapter 4
    await send('Page.navigate', { url: base });
    await until('window.__demoReady === true', 'the chapter ready behind its start button');
    await step('the page plays chapter 4', `(() => ({ ok: new URLSearchParams(location.search).get('chapter') === null && window.__save.get().stars.length === 3, stars: window.__save.get().stars }))()`, 'the save should have three stars and the address name no chapter');
    await send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: o.width, maxHeight: o.height, everyNthFrame: 1 });
    if (o.sound) report.sound = { startedAt: (await ev('window.__snd.start()')).at };
    await touch('#start', 'the start button');
    await until('window.__scene?.started === true || document.getElementById("start")?.hidden === true', 'the scene started', 30);
    await sleep(2500);
    await touch('#journal-button', 'the journal button');
    await until('window.__book.isOpen === true', 'the book open', 10);
    await sleep(1400);

    // 2 the map: finished places twinkle, the others do not
    await touch('.ribbon[data-tab="map"]', 'the Kortið ribbon');
    await until('window.__book.tab === "map"', 'the map', 10);
    await sleep(3600);
    await step('finished places twinkle, the others do not', `(() => { const asks = [...document.querySelectorAll('#book .book-leaf[data-tab="map"] .map-marker')].filter(m => m.classList.contains('asks')).map(m => m.dataset.place).sort(); return { ok: asks.join() === 'kambedla,thorsedla,uggedla', asks, twinkles: document.querySelectorAll('#book .map-marker.asks .map-glitter').length }; })()`, 'Kambeðla, Uggeðla and Þórseðla should ask, and no other');
    await step('a place that asks is big enough for a finger', `(() => { const r = document.querySelector('#book .map-marker[data-place="uggedla"]').getBoundingClientRect(); return { ok: Math.min(r.width, r.height) >= 88, width: Math.round(r.width), height: Math.round(r.height) }; })()`, 'at least 88 px');

    // 3 a place found but not finished starts nothing
    await touch('#book .map-marker[data-place="sloedla"]', 'Slóeðla\'s place');
    await sleep(2600);
    await step('a place not finished asks nothing', `(() => { const a = ${ask}; return { ok: !a.open, ...a, chapter: new URLSearchParams(location.search).get('chapter') }; })()`, 'no card should be up');

    // 4 a finished place asks; no puts the card away and leaves the map
    await touch('#book .map-marker[data-place="uggedla"]', 'Uggeðla\'s place');
    await sleep(700);
    await step('Uggeðla\'s place asks about chapter 2', `(() => { const a = ${ask}; return { ok: a.open && a.words === 'Viltu fara í kafla 2?', ...a }; })()`, 'the card should say "Viltu fara í kafla 2?"');
    await step('the answers are big and on the screen', `(() => { const boxes = [...document.querySelectorAll('.map-ask-answer')].map(b => b.getBoundingClientRect()); return { ok: boxes.length === 2 && boxes.every(r => r.height >= 88 && r.width >= 150 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight), boxes: boxes.map(r => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]) }; })()`, 'two answers at least 88 px high, inside the screen');
    await sleep(2600);
    await touch('.map-ask-answer.no', '"Nei"');
    await sleep(500);
    await step('no puts the card away and leaves everything as it was', `(() => { const a = ${ask}; return { ok: !a.open && window.__book.isOpen && window.__book.tab === 'map' && new URLSearchParams(location.search).get('chapter') === null && window.__save.get().stars.length === 3, ...a }; })()`, 'the map should be as it was, on chapter 4\'s page');
    await sleep(1200);

    // 5 yes goes to the chapter, from its start
    await touch('#book .map-marker[data-place="kambedla"]', 'Kambeðla\'s place');
    await sleep(700);
    await step('Kambeðla\'s place asks about chapter 1', `(() => { const a = ${ask}; return { ok: a.open && a.words === 'Viltu fara í kafla 1?', ...a }; })()`, 'the card should say "Viltu fara í kafla 1?"');
    await sleep(2600);
    mark('held'); // the card has been read: from here to the yes the tool only fetches the sound
    if (o.sound) sound = await collectSound(ev, workDir, outDir).catch(e => { errors.push(`sound: ${e.message}`.slice(0, 600)); return null; });
    await sleep(300);
    mark('yes');
    await touch('.map-ask-answer.yes', '"Já!"');
    await until(`new URLSearchParams(location.search).get('chapter') === 'kafli1' && window.__demoReady === true`, 'chapter 1\'s page, ready behind its start button');
    await step('yes opened chapter 1 from its start', `(() => { const start = document.getElementById('start'); return { ok: location.search === '?chapter=kafli1' && Boolean(start) && !start.hidden && !window.__book.isOpen, search: location.search, startShows: Boolean(start) && !start.hidden, stars: window.__save.get().stars.length }; })()`, 'the address should be ?chapter=kafli1, its start button showing');
    mark('ready');
    await sleep(1200);
    await touch('#start', 'chapter 1\'s start button');
    await sleep(5000);

    // 6 in the old chapter the place the story has come to asks too
    await touch('#journal-button', 'the journal button');
    await until('window.__book.isOpen === true', 'the book open', 10);
    await sleep(1200);
    await touch('.ribbon[data-tab="map"]', 'the Kortið ribbon');
    await until('window.__book.tab === "map"', 'the map', 10);
    await sleep(2600);
    await step('in chapter 1 the place the story has come to asks too', `(() => { const asks = [...document.querySelectorAll('#book .book-leaf[data-tab="map"] .map-marker')].filter(m => m.classList.contains('asks')).map(m => m.dataset.place).sort(); return { ok: asks.join() === 'flugedla,kambedla,thorsedla,uggedla', asks }; })()`, 'Flugeðla\'s place should ask as well');
    await touch('#book .map-marker[data-place="flugedla"]', 'Flugeðla\'s place');
    await sleep(700);
    await step('Flugeðla\'s place asks about chapter 4', `(() => { const a = ${ask}; return { ok: a.open && a.words === 'Viltu fara í kafla 4?', ...a }; })()`, 'the card should say "Viltu fara í kafla 4?"');
    await sleep(2800);
    report.ok = true;
  } catch (e) {
    failed = e;
    errors.push(`check: ${e.message}`.slice(0, 900));
  } finally {
    try {
      report.video = await recorder.finish();
      if (o.sound && sound && report.video) {
        try {
          Object.assign(report.sound ??= {}, mixSound(sound, recorder.video, lagSamples, videoFile, finalFile, workDir));
        } catch (e) {
          errors.push(`sound: ${e.message}`.slice(0, 600));
          await fsp.copyFile(videoFile, finalFile).catch(() => {});
        }
      } else if (o.sound) await fsp.copyFile(videoFile, finalFile).catch(() => {});
    } catch (e) {
      errors.push(`video: ${e.message}`.slice(0, 600));
    }
    // The short video: the waits cut out (held -> yes, and the black from a little after the yes to chapter 1's start button).
    try {
      const t0 = recorder.video?.t0;
      if (report.video && t0 && marks.held && marks.yes && marks.ready && fs.existsSync(finalFile)) {
        const at = name => +((marks[name] - t0) / 1000).toFixed(2);
        report.marks = Object.fromEntries(Object.keys(marks).map(name => [name, at(name)]));
        const keep = [[0, at('held')], [at('yes') - 0.2, at('yes') + 1.6], [at('ready') - 0.8, 1e6]];
        const picked = keep.map(([from, to]) => `between(t,${from},${to})`).join('+');
        const short = path.join(outDir, 'video-stutt.mp4');
        const hasSound = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', finalFile], { encoding: 'utf8' }).stdout.includes('audio');
        const args = ['-y', '-loglevel', 'error', '-i', finalFile, '-vf', `select='${picked}',setpts=N/FRAME_RATE/TB`,
          ...(hasSound ? ['-af', `aselect='${picked}',asetpts=N/SR/TB`] : []), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', short];
        const made = spawnSync('ffmpeg', args, { encoding: 'utf8' });
        if (made.status === 0) report.short = { file: path.relative(ROOT, short), kept: keep.map(([from, to]) => [from, Math.min(to, 9999)]) };
        else errors.push(`sound: the short video was not made: ${made.stderr}`.slice(0, 400));
      }
    } catch (e) {
      errors.push(`sound: the short video was not made: ${e.message}`.slice(0, 400));
    }
    await stopBrowser(browser);
    server.close();
    if (workDir) await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
    report.finishedAt = new Date().toISOString();
    await fsp.writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(report, null, 1)}\n`);
  }
  console.log(failed ? `FAILED  ${failed.message}` : `All ${steps.length} checks held. ${path.relative(ROOT, finalFile)}`);
  if (errors.length) console.log(errors.map(e => `  ${e}`).join('\n'));
  process.exit(failed || errors.some(e => !e.startsWith('sound:')) ? 1 : 0);
}

main().catch(e => {
  console.error(e);
  process.exit(2);
});
