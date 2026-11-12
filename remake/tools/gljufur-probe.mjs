// The comfort and clip probe for Gljúfraflugið (chapters/gljufur3d.js): plays the show in fixed steps in the headless browser the
// captures use (window.__advance after a t= seek) and, at every step, asks the chapter's world.gljufur.sample(): D, her, Egill's and
// Grameðla's head as shares of D, and the depth probe's nearest along the frame's border, in the middle 60 % and outside it
// (engine/depth-probe.js: it sees what writes depth, not the spray or other transparent particles). With --clip it also asks
// world.gljufur.clipCheck(): her and Egill's skin against the ground and the gorge's walls, the water and Grameðla's body.
//
//   node remake/tools/gljufur-probe.mjs [--size 1280x800 | --sizes all] [--from 0] [--to 71.5] [--step 0.0333] [--quality tablet]
//                                      [--clip] [--json out.json] [--query "reduced=1"]
//
// It prints, per shot: D's range and its largest change in one step outside cuts, the nearest in the middle (and when), the nearest
// outside the middle, the steps with something nearer than D at the border (edge violations) and with something nearer than 0.6 D
// outside the middle; and with --clip the smallest clearances. Exit code 0 always: it measures, the notes judge.
import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ROOT, sleep, launchBrowser, stopBrowser } from './veiddu-video.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};
const SHAPES = ['1024x768', '1280x800', '1280x720', '1170x540'];

function parseArgs(argv) {
  const o = { size: '1280x800', from: 0, to: 71.5, step: 1 / 30, quality: 'tablet', clip: false, json: null, query: '', timeout: 240 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--size') o.size = next();
    else if (a === '--sizes') o.size = next() === 'all' ? SHAPES.join(',') : argv[i];
    else if (a === '--from') o.from = Number(next());
    else if (a === '--to') o.to = Number(next());
    else if (a === '--step') o.step = Number(next());
    else if (a === '--quality') o.quality = next();
    else if (a === '--clip') o.clip = true;
    else if (a === '--json') o.json = next();
    else if (a === '--query') o.query = next();
    else if (a === '--timeout') o.timeout = Number(next());
  }
  return o;
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const file = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      const stat = await fsp.stat(file);
      const target = stat.isDirectory() ? path.join(file, 'index.html') : file;
      const body = await fsp.readFile(target);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const STEP = (n, step, clip) => `(async () => {
  const w = window.__world;
  const rows = [];
  for (let i = 0; i < ${n}; i++) {
    await window.__advance(${step}, ${step});
    const row = w.gljufur.sample();
    ${clip ? 'row.clip = w.gljufur.clipCheck();' : ''}
    rows.push(row);
  }
  return rows;
})()`;

function table(rows, step) {
  const shots = [];
  let last = null;
  for (const r of rows) {
    if (!last || r.shot !== last.shot) shots.push({ shot: r.shot, from: r.tau, to: r.tau, rows: [] });
    const s = shots.at(-1);
    s.to = r.tau;
    s.rows.push(r);
    last = r;
  }
  const out = [];
  for (const s of shots) {
    let dMin = Infinity, dMax = 0, dStep = 0, dStepAt = null;
    let mid = { k: Infinity }, wide = { k: Infinity }, edge = 0, edgeFirst = null, edgeMin = { k: Infinity }, nearWide = 0, herMin = { k: Infinity }, gramMin = { k: Infinity };
    let prev = null;
    for (const r of s.rows) {
      dMin = Math.min(dMin, r.D); dMax = Math.max(dMax, r.D);
      if (prev) { const d = Math.abs(r.D - prev.D); if (d > dStep) { dStep = d; dStepAt = r.tau; } }
      if (r.middle < mid.k) mid = { k: r.middle, at: r.tau, where: r.middleAt };
      if (r.wide < wide.k) wide = { k: r.wide, at: r.tau, where: r.wideAt };
      if (r.border < 1) { edge++; edgeFirst ??= r.tau; }
      if (r.border < edgeMin.k) edgeMin = { k: r.border, at: r.tau, where: r.borderAt };
      if (r.wide < 0.6) nearWide++;
      if (r.her.k < herMin.k) herMin = { k: r.her.k, at: r.tau, u: r.her.u, v: r.her.v };
      if (r.gramedla.k > 0 && r.gramedla.k < gramMin.k && r.gramedla.u > 0 && r.gramedla.u < 1 && r.gramedla.v > 0 && r.gramedla.v < 1) gramMin = { k: r.gramedla.k, at: r.tau };
      prev = r;
    }
    out.push({
      shot: s.shot, from: s.from, to: s.to, D: [+dMin.toFixed(2), +dMax.toFixed(2)], dStep: +dStep.toFixed(3), dStepAt,
      middle: mid, wide, edgeSteps: edge, edgeSeconds: +(edge * step).toFixed(2), edgeFirst, nearestAtBorder: edgeMin, nearWideSteps: nearWide, her: herMin, gramedlaHead: gramMin,
    });
  }
  return out;
}

async function probe(o, size) {
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}/remake/index.html`;
  const [W, H] = size.split('x').map(Number);
  const browser = await launchBrowser({ browser: 'edge', width: W, height: H });
  const { cdp } = browser;
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (m, p) => cdp.send(m, p, sessionId);
    const errors = [];
    cdp.handlers.add(msg => {
      if (msg.sessionId === sessionId && msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const from = Math.max(0.001, o.from);
    await send('Page.navigate', { url: `${base}?chapter=gljufur3d&quality=${o.quality}&t=${from}${o.query ? '&' + o.query : ''}` });
    const t0 = Date.now();
    for (;;) {
      let ready = false;
      try { ready = await evaluate('Boolean(window.__demoReady && window.__advance && window.__world?.gljufur)'); } catch { /* loading */ }
      if (ready) break;
      if (Date.now() - t0 > o.timeout * 1000) throw new Error('the page did not get ready');
      await sleep(250);
    }
    const rows = [];
    const total = Math.round((o.to - from) / o.step);
    const chunk = 30;
    const started = Date.now();
    for (let done = 0; done < total; done += chunk) {
      rows.push(...await evaluate(STEP(Math.min(chunk, total - done), o.step, o.clip)));
      const t = rows.at(-1).tau;
      if (Math.round(t) % 10 === 0) process.stdout.write(`  ${size} ${t.toFixed(1)} s (${((Date.now() - started) / 1000).toFixed(0)} s)\n`);
    }
    const shots = table(rows, o.step);
    console.log(`\n=== ${size}: ${rows.length} steps, ${o.from}-${o.to} s ===`);
    for (const s of shots) {
      console.log(`${s.shot.padEnd(9)} ${s.from.toFixed(2)}-${s.to.toFixed(2)}  D ${s.D[0]}-${s.D[1]} m (largest step ${s.dStep} at ${s.dStepAt})  middle nearest k ${s.middle.k} at ${s.middle.at} ${JSON.stringify(s.middle.where)}  outside middle nearest k ${s.wide.k} at ${s.wide.at} ${JSON.stringify(s.wide.where)}`);
      console.log(`          edge (border nearer than D): ${s.edgeSteps} steps (${s.edgeSeconds} s, first ${s.edgeFirst}); nearest at the border k ${s.nearestAtBorder.k} at ${s.nearestAtBorder.at} ${JSON.stringify(s.nearestAtBorder.where)}; under 0.6 D outside the middle: ${s.nearWideSteps} steps; her nearest k ${s.her.k} at ${s.her.at}${Number.isFinite(s.gramedlaHead.k) ? `; Grameðla's head nearest k ${s.gramedlaHead.k} at ${s.gramedlaHead.at}` : ''}`);
    }
    if (o.clip) {
      const worst = key => rows.filter(r => r.clip[key] !== null).reduce((a, r) => (!a || r.clip[key] < a.clip[key] ? r : a), null);
      for (const key of ['ground', 'water', 'gramedla']) {
        const r = worst(key);
        console.log(`clip ${key}: smallest clearance ${r ? r.clip[key] : 'none near'} m${r ? ` at ${r.tau} (${r.shot})${key === 'ground' ? ' ' + JSON.stringify(r.clip.groundAt) : ''}` : ''}`);
      }
      const under = rows.filter(r => r.clip.ground !== null && r.clip.ground < 0);
      console.log(`  steps with skin under the ground or in a wall: ${under.length}${under.length ? ` (${under[0].tau}-${under.at(-1).tau})` : ''}`);
      const wet = rows.filter(r => r.clip.water !== null && r.clip.water < 0);
      console.log(`  steps with skin under the water: ${wet.length}${wet.length ? ` (${wet.map(r => r.tau).filter((t, i, a) => i === 0 || t - a[i - 1] > 0.1).join(', ')})` : ''}`);
      console.log(`  steps with a point inside Grameðla: ${rows.filter(r => r.clip.inside > 0).length}`);
    }
    if (errors.length) console.log('page errors:', errors.slice(0, 5));
    if (o.json) await fsp.writeFile(path.resolve(o.json.replace(/(\.json)?$/, `-${size}.json`)), JSON.stringify({ size, shots, rows }, null, 1));
    return shots;
  } finally {
    await stopBrowser(browser).catch(() => {});
    server.close();
  }
}

const o = parseArgs(process.argv.slice(2));
for (const size of o.size.split(',')) await probe(o, size);
