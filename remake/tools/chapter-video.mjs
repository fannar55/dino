#!/usr/bin/env node
// Records a chapter of the remake (remake/index.html?chapter=<id>) as a video, for the owner to watch.
//
//   node remake/tools/chapter-video.mjs --out qa/remake/kafli4/butur1 --chapter flug
//     [--query "a=b&c=d"] [--size 1280x800] [--max 240] [--sound] [--stats] [--browser edge|chrome|<exe>] [--reduced-motion]
//     [--theme <mp3>]
//
// --theme plays another song as the chapter's theme: the server answers every request for a theme.mp3 with that file, so the game
// starts, ducks and raises it as it would its own (a candidate song heard over the picture before it goes into the game).
// It serves the repo on a throwaway static server and loads remake/index.html?chapter=<id>&<query> at --size. When the page says it is
// ready (window.__demoReady: the chapter drawn once behind the black and the start button showing) it starts the screencast and taps
// the start button, as a child would (that also starts the music and lets the browser sound), so second 0 of the video is the scene's
// first frame. It records until the chapter's script has ended (window.__chapterEnd, set by main.js) and two seconds more, or --max
// seconds, and writes <out>/video.mp4 (15 fps, laid out by when the browser drew each frame) and <out>/report.json. <out> is relative
// to the repo root (qa/ is outside git).
//
// report.json: { chapter, size, query, seconds, ended, errors, warnings, timeline, gpu, stats, video, sound }
//   seconds    how long the scene played (start tap to the end, or to --max)
//   timeline   the chapter's scene marks (world.chapterTimeline: { scene, at } in scene seconds) and, for each, `video`: the second of
//              the video in which it was first seen (to a quarter of a second)
//   stats      (--stats) { median, worst, gpu: { median, worst, p95, frames }, perSecond: [{ second, fps, frames, medianMs, worstMs,
//              gpuMedian, gpuWorst, drawCalls, triangles, textureMB }] }: every frame's interval (requestAnimationFrame, ms), and each
//              chapter frame's GPU time (EXT_disjoint_timer_query_webgl2 round the renderer's draw, the shadow pass included), with
//              window.__demoStats' draw calls and triangles once a second. A frame's interval is capped by the display's rate (60 a second
//              headless), so a median of 16.7 ms says "never late"; the GPU times are the cost, the numbers STYLE.md section 11 sets.
//   sound      (--sound) as tools/veiddu-video.mjs makes it: the page's audio contexts recorded and every voice file mixed in at its time
//
// Exit codes: 0 done, 1 a page error (an exception, a console error, a failed load) or the chapter never readied, 2 the tool broke.
// Nothing is left running.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, FPS, sleep, launchBrowser, stopBrowser, startVideo, soundTap, collectSound, mixSound } from './veiddu-video.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};
const POLL_MS = 250;
const TAIL_MS = 2000; // recorded after the script has ended: its last frame held a moment

function parseArgs(argv) {
  const o = { out: '', chapter: '', query: '', size: '1280x800', max: 240, sound: false, stats: false, browser: 'edge', reducedMotion: false, theme: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === '--out') o.out = next();
    else if (a === '--chapter') o.chapter = next();
    else if (a === '--query') o.query = next();
    else if (a === '--size') o.size = next();
    else if (a === '--max') o.max = Number(next());
    else if (a === '--browser') o.browser = next();
    else if (a === '--sound') o.sound = true;
    else if (a === '--stats') o.stats = true;
    else if (a === '--reduced-motion') o.reducedMotion = true;
    else if (a === '--theme') o.theme = path.resolve(next());
    else if (a === '--help' || a === '-h') {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 33).join('\n'));
      process.exit(0);
    } else throw new Error(`Unknown argument ${a}`);
  }
  if (!o.chapter) throw new Error('--chapter <id> is needed');
  if (!/^[a-z0-9_-]+$/i.test(o.chapter)) throw new Error(`--chapter must be a chapter id, not ${o.chapter}`);
  if (!o.out) o.out = `qa/remake/video/${o.chapter}`;
  const [w, h] = o.size.split('x').map(Number);
  if (!(w > 0 && h > 0)) throw new Error(`--size must be WIDTHxHEIGHT, not ${o.size}`);
  if (!(o.max > 0)) throw new Error('--max must be a number of seconds');
  if (o.theme && !fs.existsSync(o.theme)) throw new Error(`--theme: ${o.theme} is not there`);
  o.width = w;
  o.height = h;
  return o;
}

function startServer(theme = null) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const asked = path.resolve(ROOT, `.${decodeURIComponent(url.pathname)}`);
      if (!asked.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      const file = theme && url.pathname.endsWith('/theme.mp3') ? theme : asked; // --theme: the candidate song in the theme's place
      const stat = await fsp.stat(file);
      const target = stat.isDirectory() ? path.join(file, 'index.html') : file;
      const body = await fsp.readFile(target);
      const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
      // Byte ranges, as tools/serve.mjs gives them: the music seeks its theme by them (engine/audio/music.js).
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
        if (start > end || start >= body.length) {
          res.writeHead(416, { 'Content-Range': `bytes */${body.length}` });
          res.end();
          return;
        }
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

/**
 * The frame log, sent to the page before anything else runs (it must stand alone). Every requestAnimationFrame interval goes into
 * window.__frames ({ at, ms }); window.__gpuTap() wraps the renderer's draw in a GPU timer query (once the page has a renderer), whose
 * results go into window.__gpu ({ at, ms }) as they come in. `at` is performance.now().
 */
function frameLog() {
  if (window.__frames) return;
  const frames = (window.__frames = []);
  let last = null;
  const tick = now => {
    if (last !== null) frames.push({ at: now, ms: now - last });
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__gpu = [];
  window.__gpuTap = () => {
    const renderer = window.__world?.renderer;
    if (!renderer || renderer.__timed) return Boolean(renderer?.__timed);
    const gl = renderer.getContext();
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (!ext) return false;
    const waiting = [];
    const render = renderer.render.bind(renderer);
    renderer.render = (scene, camera) => {
      while (waiting.length && gl.getQueryParameter(waiting[0].query, gl.QUERY_RESULT_AVAILABLE)) {
        const { query, at } = waiting.shift();
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) window.__gpu.push({ at, ms: gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6 });
        gl.deleteQuery(query);
      }
      if (waiting.length > 8) return render(scene, camera); // results lag: draw untimed rather than pile up queries
      const query = gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
      try {
        return render(scene, camera);
      } finally {
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        waiting.push({ query, at: performance.now() });
      }
    };
    renderer.__timed = true;
    return true;
  };
}

const median = values => (values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : null);
const pct = (values, p) => (values.length ? [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] : null);
const round = (x, n = 2) => (x === null || x === undefined ? null : +x.toFixed(n));

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(ROOT, o.out);
  await fsp.mkdir(outDir, { recursive: true });
  const errors = [];
  const warnings = [];
  const report = {
    chapter: o.chapter, size: o.size, query: o.query, reducedMotion: o.reducedMotion, theme: o.theme ? path.relative(ROOT, o.theme) : null, startedAt: new Date().toISOString(),
    seconds: null, ended: false, errors, warnings, timeline: [], gpu: null, stats: null, video: null,
  };
  const server = await startServer(o.theme);
  const query = [`chapter=${o.chapter}`, o.query].filter(Boolean).join('&');
  const url = `http://127.0.0.1:${server.address().port}/remake/index.html?${query}`;
  const browser = await launchBrowser(o);
  const { cdp } = browser;
  const finalFile = path.join(outDir, 'video.mp4');
  const videoFile = o.sound ? path.join(outDir, 'video-silent.mp4') : finalFile; // with --sound the picture is made first and the sound put under it
  const workDir = o.sound ? await fsp.mkdtemp(path.join(os.tmpdir(), 'chapter-sound-')) : null;
  const recorder = startVideo(videoFile, o.width, o.height);
  const lagSamples = [];
  let sound = null;
  let fatal = null;
  let ready = false;
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
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${frameLog.toString()})()` });
    if (o.sound) await send('Page.addScriptToEvaluateOnNewDocument', { source: `(${soundTap.toString()})()` });
    const phone = o.width < 768 && o.height < 768;
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
    for (let n = 0; n < 2400 && !ready; n++) { // up to 2 minutes for the chapter to ready itself
      ready = await ev('window.__demoReady === true').catch(() => false);
      if (!ready) await sleep(50);
    }
    if (!ready) throw new Error('The chapter never readied (window.__demoReady)');
    report.gpu = await ev(`(() => { const gl = window.__world.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })()`).catch(e => `error: ${e.message}`);
    const timed = o.stats ? await ev('window.__gpuTap()').catch(() => false) : false;
    await send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: o.width, maxHeight: o.height, everyNthFrame: 1 });
    if (o.sound) report.sound = { startedAt: (await ev('window.__snd.start()')).at };
    // The start button, as a child taps it: the scene opens from black and the music begins.
    const startAt = Date.now();
    const perfAtStart = await ev(`(() => { const b = document.getElementById('start'); if (b && !b.hidden) b.click(); return performance.now(); })()`);
    console.log(`[0.0] ${o.chapter} started (page ready in ${((startAt - t0) / 1000).toFixed(1)} s), ${o.size}${timed ? ', GPU timed' : o.stats ? ', no GPU timer' : ''}`);

    const marks = [];
    const samples = []; // once a second: window.__demoStats
    let endedAt = null;
    let lastSample = 0;
    let beat = Date.now();
    while (Date.now() - startAt < o.max * 1000) {
      let now;
      try {
        now = await ev('({ end: window.__chapterEnd === true, timeline: window.__timeline?.() ?? null, elapsed: window.__scene?.elapsed ?? 0 })');
      } catch (e) {
        errors.push(`driver: ${e.message}`);
        break;
      }
      const second = (Date.now() - startAt) / 1000;
      for (const mark of (now.timeline ?? []).slice(marks.length)) marks.push({ ...mark, video: +second.toFixed(2) });
      if (o.stats && second - lastSample >= 1) {
        lastSample = Math.floor(second);
        const stats = await ev('window.__demoStats ? JSON.parse(JSON.stringify(window.__demoStats)) : null').catch(() => null);
        if (stats) samples.push({ second: lastSample, ...stats });
      }
      if (Date.now() - beat >= 20000) {
        beat = Date.now();
        console.log(`[${second.toFixed(0)}] scene ${now.elapsed.toFixed(1)} s, ${marks.length} marks${marks.length ? ` (last ${marks.at(-1).scene})` : ''}`);
      }
      if (now.end) {
        endedAt = Date.now();
        break;
      }
      await sleep(POLL_MS);
    }
    if (endedAt) {
      report.ended = true;
      await sleep(TAIL_MS);
    }
    report.seconds = +(((endedAt ?? Date.now()) - startAt) / 1000).toFixed(1);
    report.timeline = marks;
    if (o.stats) {
      const log = await ev(`({ frames: window.__frames.filter(f => f.at >= ${perfAtStart}), gpu: window.__gpu.filter(f => f.at >= ${perfAtStart}) })`);
      const bySecond = new Map();
      const slot = at => {
        const s = Math.floor((at - perfAtStart) / 1000);
        if (!bySecond.has(s)) bySecond.set(s, { frames: [], gpu: [] });
        return bySecond.get(s);
      };
      for (const f of log.frames) slot(f.at).frames.push(f.ms);
      for (const g of log.gpu) slot(g.at).gpu.push(g.ms);
      const sampleAt = new Map(samples.map(s => [s.second, s]));
      const gpuAll = log.gpu.map(g => g.ms);
      report.stats = {
        median: round(median(log.frames.map(f => f.ms))),
        worst: round(Math.max(0, ...log.frames.map(f => f.ms))),
        gpu: gpuAll.length ? { median: round(median(gpuAll)), p95: round(pct(gpuAll, 0.95)), worst: round(Math.max(...gpuAll)), frames: gpuAll.length } : null,
        perSecond: [...bySecond.keys()].sort((a, b) => a - b).map(second => {
          const { frames, gpu } = bySecond.get(second);
          const s = sampleAt.get(second) ?? {};
          return {
            second, frames: frames.length, medianMs: round(median(frames)), worstMs: round(Math.max(0, ...frames)),
            gpuMedian: round(median(gpu)), gpuWorst: gpu.length ? round(Math.max(...gpu)) : null,
            fps: s.fps ?? null, drawCalls: s.drawCalls ?? null, triangles: s.triangles ?? null, textureMB: s.textureMB ?? null,
          };
        }),
      };
    }
    if (o.sound) sound = await collectSound(ev, workDir, outDir).catch(e => { errors.push(`sound: ${e.message}`.slice(0, 600)); return null; });
    await send('Page.stopScreencast').catch(() => {});
  } catch (e) {
    fatal = e;
    errors.push(`driver: ${e.stack || e.message}`.slice(0, 900));
  } finally {
    report.video = await recorder.finish();
    if (o.sound && !report.video.error && sound) {
      try {
        Object.assign(report.sound, mixSound(sound, recorder.video, lagSamples, videoFile, finalFile, workDir));
      } catch (e) {
        errors.push(`sound: ${e.message}`.slice(0, 700));
      }
    }
    if (o.sound) {
      if (!fs.existsSync(finalFile) && fs.existsSync(videoFile)) fs.copyFileSync(videoFile, finalFile); // no sound: the silent picture is still the video
      if (fs.existsSync(finalFile)) fs.rmSync(videoFile, { force: true });
    }
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
    if (!report.video.error && fs.existsSync(finalFile)) {
      report.video = { file: path.relative(ROOT, finalFile).replace(/\\/g, '/'), bytes: fs.statSync(finalFile).size, frames: report.video.written, received: report.video.received, fps: FPS, seconds: +(report.video.written / FPS).toFixed(1) };
    }
    report.finishedAt = new Date().toISOString();
    await stopBrowser(browser);
    server.close();
    await fsp.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  }
  const r = report;
  console.log(`${r.ended ? 'ENDED' : `NOT ENDED (max ${o.max} s)`} ${o.chapter} ${o.size}: ${r.seconds ?? '-'} s, ${r.errors.length} errors, ${r.warnings.length} warnings`);
  if (r.timeline.length) console.log(`Timeline: ${r.timeline.map(m => `${m.scene}@${Number(m.at).toFixed(1)} (video ${m.video})`).join(', ')}`);
  if (r.stats) console.log(`Frames: median ${r.stats.median} ms, worst ${r.stats.worst} ms; GPU ${r.stats.gpu ? `median ${r.stats.gpu.median} ms, p95 ${r.stats.gpu.p95} ms, worst ${r.stats.gpu.worst} ms over ${r.stats.gpu.frames} frames` : 'not timed'}`);
  if (r.sound?.volume) console.log(`Sound: ${r.sound.parts.length} part(s) mixed, click ${r.sound.parts[0]?.calibrated ? 'found' : 'NOT found'}, mean ${r.sound.volume.mean} dB, max ${r.sound.volume.max} dB`);
  else if (o.sound) console.log('Sound: none was recorded');
  if (r.video?.file) console.log(`Video: ${r.video.file} (${r.video.seconds} s, ${(r.video.bytes / 1e6).toFixed(1)} MB)`);
  else console.log(`Video: none${r.video?.error ? ` (${r.video.error})` : ''}`);
  for (const e of r.errors.slice(0, 10)) console.log(`  error: ${e}`);
  for (const w of [...new Set(r.warnings)].slice(0, 5)) console.log(`  warning: ${w}`);
  console.log(`GPU: ${r.gpu}`);
  console.log(`Report: ${path.relative(ROOT, path.join(outDir, 'report.json')).replace(/\\/g, '/')}`);
  if (fatal) process.exitCode = 2;
  else if (r.errors.length || !ready) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exit(2); });
