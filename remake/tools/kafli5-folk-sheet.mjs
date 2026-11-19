#!/usr/bin/env node
// Contact sheets of the people in chapter 5's music video (chapters/kafli5-people.js: Egill, Mosi, Flugeðla, Slóeðla): one load of
// the chapter, seeked into the set, and then a still at each beat asked for. Everything in the video is a pure function of the
// dance beat, so each still is made by putting the video's clock at that beat by hand (the people, the animals' dances and the
// show) and giving the actors a second and a half of frames at it (Slóeðla comes to a pose gently, never in one frame), with the
// camera where asked. As kafli5-dans-sheet.mjs does for the animals.
//
//   node remake/tools/kafli5-folk-sheet.mjs --out qa/remake/kafli5/myndband/folk/<name> \
//     --shot set_flugedla --beats 264,265,266,267 [--cols 4] [--tile 640] [--size 1280x800] [--reduced]
//     [--at "angle,distance,over;angle,distance,over;fov"]   a camera of your own, by the pool's frame: degrees round its middle,
//                                    metres from it, metres over the water, for the camera and for what it looks at
//     [--cam "x,y,z;tx,ty,tz;fov"]   the same in the world's metres
//     [--no-horn]                    her horn is blown on the set's horn cues near a still's beat unless this is given
//     [--view "name@shot@beats"] [--view "name@angle,distance,over;angle,distance,over;fov@beats"] ...
//                                    several sheets from one load (the seek is the slow part): each in <out>/<name>
//
// --beats are the SET's beats (a range `a:b:step` works too). Writes <out>/b<beat>.png and <out>/montage.png.
import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, sleep, launchBrowser, stopBrowser } from './veiddu-video.mjs';
import { danceBeatAt, sectionAt } from '../chapters/kafli5-video.js';
import { SONG } from '../chapters/kafli5-set.js';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.ktx2': 'image/ktx2' };
const POOL = { center: [-952, 70], level: 5.4 }; // chapters/kafli4-route.js FAR_POOL (not imported: it needs three)
const SET_AT = 259.2; // s: where an untouched play reaches the set
const BEAT = 0.48;
const HORNS = SONG.set.cues.filter(event => event.kind === 'horn').map(event => event.beat);

const args = process.argv.slice(2);
const opt = (name, def = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const out = path.resolve(ROOT, opt('out', 'qa/remake/kafli5/myndband/folk/latest'));
const [width, height] = opt('size', '1280x800').split('x').map(Number);
const cols = Number(opt('cols', 4));
const tile = Number(opt('tile', 640));
const beatsOf = text => text.split(',').flatMap(part => {
  if (!part.includes(':')) return [Number(part)];
  const [a, b, step = 1] = part.split(':').map(Number);
  return Array.from({ length: Math.floor((b - a) / step + 1e-9) + 1 }, (_, i) => +(a + i * step).toFixed(3));
});
const polar = text => { const [angle, distance, over] = text.split(',').map(Number); const a = (angle * Math.PI) / 180; return [POOL.center[0] + distance * Math.cos(a), POOL.level + over, POOL.center[1] + distance * Math.sin(a)]; };
const atOf = text => { const [p, t, fov] = text.split(';'); return { p: polar(p), t: polar(t), fov: Number(fov ?? 46) }; };
let cam = null;
if (opt('cam')) { const [p, t, fov] = opt('cam').split(';'); cam = { p: p.split(',').map(Number), t: t.split(',').map(Number), fov: Number(fov ?? 46) }; }
if (opt('at')) cam = atOf(opt('at'));
// the sheets to make: [{ out, shot, cam, beats }]
const views = args.flatMap((arg, i) => (arg === '--view' ? [args[i + 1]] : [])).map(text => {
  const [name, where, list] = text.split('@');
  return { out: path.join(out, name), shot: where.includes(';') ? null : where, cam: where.includes(';') ? atOf(where) : null, beats: beatsOf(list) };
});
if (!views.length) views.push({ out, shot: opt('shot', cam ? null : 'pool_open'), cam, beats: beatsOf(opt('beats', '64')) });

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
for (const view of views) await fsp.mkdir(view.out, { recursive: true });
const browser = await launchBrowser({ browser: 'edge', width, height });
const report = { errors: [] };
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
  while (Date.now() - t0 < 300000 && !(await evaluate('Boolean(window.__demoReady === true && window.__world?.chapterState?.people)').catch(() => false))) await sleep(250);
  // the camera where we say, each frame from now on
  await evaluate(`(() => {
    const forest = window.__world.forest;
    const update = forest.update.bind(forest);
    window.__folk = { cam: null };
    forest.update = (dt, t) => {
      const { cam } = window.__folk;
      if (cam) {
        const camera = window.__world.camera;
        camera.position.set(...cam.p); camera.up.set(0, 1, 0); camera.lookAt(...cam.t);
        camera.fov = cam.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
      }
      return update(dt, t);
    };
    return true;
  })()`);
  for (const view of views) {
  await evaluate(`window.__folk.cam = ${JSON.stringify(view.cam)}`);
  if (view.shot) await evaluate(`window.__director.cut(${JSON.stringify(view.shot)}, { check: false })`);
  for (const setBeat of view.beats) {
    const video = { setBeat, ...danceBeatAt(setBeat), section: sectionAt(setBeat) };
    const horn = !args.includes('--no-horn') && HORNS.some(at => at <= setBeat && at > setBeat - 2.5);
    await evaluate(`(() => {
      const world = window.__world;
      const c = world.chapterState;
      const video = ${JSON.stringify(video)};
      Object.assign(c.video, video);
      try { c.dances?.update(video); } catch (error) { console.error(error); }
      try { c.show?.update(video, 0); } catch (error) { console.error(error); }
      c.people.update(video);
      if (${horn}) c.her.blow({ seconds: 3 });
      for (let i = 0; i < 45; i++) for (const actor of world.actors.values()) actor.update(1 / 30);
      return true;
    })()`);
    await evaluate('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done))))', true);
    const name = `b${String(setBeat).replace('.', '_')}`;
    const data = await send('Page.captureScreenshot', { format: 'png' });
    await fsp.writeFile(path.join(view.out, `${name}.png`), Buffer.from(data.data, 'base64'));
  }
  }
  if (errors.length) console.log(`page errors:\n  ${[...new Set(errors)].slice(0, 8).join('\n  ')}`);
  report.errors = [...new Set(errors)];
} finally {
  await stopBrowser(browser);
  server.close();
}
for (const view of views) {
  const made = spawnSync(process.execPath, [path.join(ROOT, 'remake/tools/world/montage.mjs'), view.out, String(cols), String(tile)], { encoding: 'utf8' });
  console.log((made.stdout || made.stderr).trim());
}
