#!/usr/bin/env node
// Contact sheets of the dances in chapter 5's music video (chapters/kafli5-dances.js): one load of the chapter, seeked into the
// set, and then a still at each beat asked for, the dances put at that beat by hand (they are pure functions of the dance beat,
// so no long seek for each still) and the camera where asked. For looking at a move through its beats.
//
//   node remake/tools/kafli5-dans-sheet.mjs --out qa/remake/kafli5/myndband/dansar/<name> \
//     --shot set_turtles --beats 144,146,148,150,152,153,154,156 [--cols 4] [--tile 640] [--size 1280x800] [--reduced]
//     [--cam "x,y,z;tx,ty,tz;fov"]   a camera of your own instead of a named shot (metres; kafli5-pool.js's frame)
//     [--at "angle,distance,over;angle,distance,over;fov"]   the same by the pool's own frame: degrees round its middle, metres
//                                    from it, metres over the water, for the camera and for what it looks at
//     [--stats]                      print what each still draws (window.__demoStats)
//     [--bench 120]                  and what a frame of it costs (window.__benchmark: GPU time, draw calls, triangles)
//
// --beats are the SET's beats (a range `a:b:step` works too); the dance beat of each is worked out as the scene does it (the
// rewind, the freeze). Writes <out>/b<beat>.png and <out>/montage.png. The people and the show stay as they were at the seek.
import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, sleep, launchBrowser, stopBrowser } from './veiddu-video.mjs';
import { danceBeatAt } from '../chapters/kafli5-video.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.ktx2': 'image/ktx2' };
const POOL = { center: [-952, 70], level: 5.4 }; // chapters/kafli4-route.js FAR_POOL (not imported: it needs three)
const SET_AT = 259.2; // s: where an untouched play reaches the set
const BEAT = 0.48;

const args = process.argv.slice(2);
const opt = (name, def = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const out = path.resolve(ROOT, opt('out', 'qa/remake/kafli5/myndband/dansar/latest'));
const [width, height] = opt('size', '1280x800').split('x').map(Number);
const cols = Number(opt('cols', 4));
const tile = Number(opt('tile', 640));
const beats = opt('beats', '64').split(',').flatMap(part => {
  if (!part.includes(':')) return [Number(part)];
  const [a, b, step = 1] = part.split(':').map(Number);
  return Array.from({ length: Math.floor((b - a) / step + 1e-9) + 1 }, (_, i) => +(a + i * step).toFixed(3));
});
const polar = text => { const [angle, distance, over] = text.split(',').map(Number); const a = (angle * Math.PI) / 180; return [POOL.center[0] + distance * Math.cos(a), POOL.level + over, POOL.center[1] + distance * Math.sin(a)]; };
let cam = null;
if (opt('cam')) { const [p, t, fov] = opt('cam').split(';'); cam = { p: p.split(',').map(Number), t: t.split(',').map(Number), fov: Number(fov ?? 46) }; }
if (opt('at')) { const [p, t, fov] = opt('at').split(';'); cam = { p: polar(p), t: polar(t), fov: Number(fov ?? 46) }; }
const shot = opt('shot', cam ? null : 'choir_wide');

const server = await new Promise(resolve => {
  const s = http.createServer(async (req, res) => {
    try {
      const file = path.resolve(ROOT, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      const body = await fsp.readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  s.listen(0, '127.0.0.1', () => resolve(s));
});
await fsp.mkdir(out, { recursive: true });
const browser = await launchBrowser({ browser: 'edge', width, height });
const report = { shots: [] };
try {
  const { cdp } = browser;
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (m, p) => cdp.send(m, p, sessionId);
  const errors = [];
  cdp.handlers.add(msg => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map(a => a.value ?? a.description).join(' '));
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const evaluate = async (expression, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const query = `chapter=kafli5&t=${(SET_AT + 2 * BEAT).toFixed(2)}${args.includes('--reduced') ? '&reduced=1' : ''}`;
  await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/remake/index.html?${query}` });
  const t0 = Date.now();
  while (Date.now() - t0 < 240000 && !(await evaluate('Boolean(window.__demoReady === true && window.__world?.chapterState?.dances)').catch(() => false))) await sleep(250);
  // the dances at a beat of ours, and the camera where we say, each frame from now on
  await evaluate(`(() => {
    const c = window.__world.chapterState;
    const forest = window.__world.forest;
    const update = forest.update.bind(forest);
    window.__dans = { video: null, cam: null };
    forest.update = (dt, t) => {
      const { video, cam } = window.__dans;
      if (video) c.dances.update(video);
      if (cam) {
        const camera = window.__world.camera;
        camera.position.set(...cam.p); camera.up.set(0, 1, 0); camera.lookAt(...cam.t);
        camera.fov = cam.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
      }
      return update(dt, t);
    };
    return true;
  })()`);
  if (shot) await evaluate(`window.__director.cut(${JSON.stringify(shot)}, { check: false })`);
  if (cam) await evaluate(`window.__dans.cam = ${JSON.stringify(cam)}`);
  for (const setBeat of beats) {
    const video = { setBeat, ...danceBeatAt(setBeat), section: null };
    await evaluate(`window.__dans.video = ${JSON.stringify(video)}`);
    await evaluate('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done))))', true);
    const name = `b${String(setBeat).replace('.', '_')}`;
    const data = await send('Page.captureScreenshot', { format: 'png' });
    await fsp.writeFile(path.join(out, `${name}.png`), Buffer.from(data.data, 'base64'));
    const entry = { name };
    if (args.includes('--stats')) { entry.stats = await evaluate('window.__demoStats ? JSON.parse(JSON.stringify(window.__demoStats)) : null'); console.log(name, JSON.stringify(entry.stats)); }
    if (opt('bench')) {
      const b = await evaluate(`window.__benchmark(${Number(opt('bench'))})`, true);
      entry.bench = b;
      console.log(name, `gpu ${b.gpuMs?.median} ms median, ${Number(b.msPerFrame).toFixed(2)} ms a frame, ${b.drawCalls} calls, ${b.triangles} triangles`);
    }
    report.shots.push(entry);
  }
  if (errors.length) console.log(`page errors:\n  ${[...new Set(errors)].slice(0, 8).join('\n  ')}`);
} finally {
  await stopBrowser(browser);
  server.close();
}
await fsp.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
const made = spawnSync(process.execPath, [path.join(ROOT, 'remake/tools/world/montage.mjs'), out, String(cols), String(tile)], { encoding: 'utf8' });
console.log((made.stdout || made.stderr).trim());
