// The calibration probe for Grameðla kemur! (chapters/gramedla3d.js, step 0): loads ?chapter=gramedla3d&kvordun=1 in the headless
// browser the captures use, at each screen shape, and for each of the six settings and both strengths asks world.gramedla.measure():
// the snout tip's depth (k) and parallax, the picture's shares in front of the screen, at it and behind it, the far background's
// parallax, the head's share of the frame, the edge rule (the depth probe's nearest along the border, engine/depth-probe.js), the
// ground rule along the bottom edge, her neck and body back through the screen plane in the frame, and whether she stands in a plant.
// It also plays her idle for a few seconds at each setting and gives the snout's k range (she breathes).
//
//   node remake/tools/gramedla-probe.mjs [--sizes all | --size 1280x800] [--quality tablet] [--json qa/thrividd/gramedla/kvordun/maelingar]
//                                       [--eval "<js>"]   (prints that expression's value instead, once the page is ready)
//
// Exit code 0 always: it measures, the notes judge.
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
const SHAPES = ['1280x800', '1024x768', '1280x720', '1170x540'];

function parseArgs(argv) {
  const o = { size: '1280x800', quality: 'tablet', json: null, timeout: 240, breathe: 4 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--size') o.size = next();
    else if (a === '--sizes') o.size = next() === 'all' ? SHAPES.join(',') : argv[i];
    else if (a === '--quality') o.quality = next();
    else if (a === '--json') o.json = next();
    else if (a === '--timeout') o.timeout = Number(next());
    else if (a === '--breathe') o.breathe = Number(next());
    else if (a === '--eval') o.eval = next();
    else if (a === '--lykill') o.lykill = next();
    else if (a === '--t') o.t = Number(next());
    else if (a === '--hreyfing') o.hreyfing = true;
    else if (a === '--step') o.step = Number(next());
    else if (a === '--shots') { o.shots = next(); if (o.shots === 'none') o.shots = null; }
    else if (a === '--every') o.every = Number(next());
    else if (a === '--plain') o.plain = true;
    else if (a === '--measure') o.measure = next() !== '0';
    else if (a === '--bench') o.bench = next().split(',').map(Number);
    else if (a === '--depth') o.depth = next() !== '0';
    else if (a === '--until') o.until = Number(next());
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

const MEASURE = (index, strength, breathe) => `(async () => {
  const g = window.__world.gramedla;
  g.view.strength = ${strength};
  g.show(${index});
  await window.__advance(2 / 30);
  const row = g.measure();
  let lo = Infinity, hi = 0;
  for (let i = 0; i < ${Math.round(breathe * 10)}; i++) {
    await window.__advance(0.1);
    const k = g.measure().snout.k;
    lo = Math.min(lo, k); hi = Math.max(hi, k);
  }
  row.breathing = { kMin: lo, kMax: hi };
  return row;
})()`;

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
    const mode = o.hreyfing ? `${o.plain ? 'gler=0&' : ''}show=1` : o.lykill ? `lykill=${o.lykill.split(',')[0]}` : 'kvordun=1';
    await send('Page.navigate', { url: `${base}?chapter=gramedla3d&${mode}&quality=${o.quality}&t=${o.hreyfing ? 0 : o.t ?? 1.5}` });
    const t0 = Date.now();
    for (;;) {
      let ready = false;
      // (the show is frozen at its first frame, before its script has set world.gramedla: motion() steps it on)
      try { ready = await evaluate(`Boolean(window.__demoReady && window.__advance${o.hreyfing ? '' : ' && window.__world?.gramedla'})`); } catch { /* loading */ }
      if (ready) break;
      if (Date.now() - t0 > o.timeout * 1000) throw new Error(`the page did not get ready${errors.length ? ': ' + errors[0] : ''}`);
      await sleep(250);
    }
    if (o.hreyfing) return await motion(o, size, evaluate, errors, send);
    if (o.lykill) return await keyFrames(o, size, evaluate, errors);
    if (o.eval) { console.log(JSON.stringify(await evaluate(o.eval), null, 1)); return []; }
    const rows = [];
    for (const strength of [0.02, 0.03]) {
      for (let i = 0; i < 6; i++) rows.push(await evaluate(MEASURE(i, strength, strength === 0.02 ? o.breathe : 0)));
    }
    const state = await evaluate('JSON.parse(JSON.stringify(window.__world.gramedla.state))');
    console.log(`\n=== ${size}: camera pitch ${state.pitch}°, stage pitch ${state.stagePitch}° ===`);
    for (const r of rows) {
      const realOut = (r.snout.parallax * 100).toFixed(2);
      console.log(`${r.setting} ${(r.out * 100).toFixed(1)}% s${r.strength}: snout k ${r.snout.k} (${r.snout.depth} m, u ${r.snout.u} v ${r.snout.v}) parallax ${realOut}% eyes ${r.snout.eyes}` +
        `${r.breathing && Number.isFinite(r.breathing.kMin) ? ` breathing k ${r.breathing.kMin}-${r.breathing.kMax}` : ''} | lean ${r.solved.lean}° at z ${r.solved.z} (err ${r.solved.error})`);
      console.log(`   picture front ${(r.picture.front * 100).toFixed(1)}% at ${(r.picture.at * 100).toFixed(1)}% behind ${(r.picture.behind * 100).toFixed(1)}% sky ${(r.picture.sky * 100).toFixed(1)}% | far k ${r.background.farthestK} (${(r.background.parallax * 100).toFixed(2)}%) | head ${(r.head.height * 100).toFixed(0)}% high ${(r.head.width * 100).toFixed(0)}% wide` +
        ` | edge ${r.edge.ok ? 'ok' : 'BROKEN'} (nearest at the border but the floor k ${r.edge.border} at ${JSON.stringify(r.edge.borderAt)}; her skin ${JSON.stringify(r.edge.her)}; the floor ${r.edge.ground} at ${JSON.stringify(r.edge.groundAt)}) | ground ${r.ground.ok ? 'ok' : 'BROKEN'} (k ${r.ground.k}) | behind in frame ${r.body.behindInFrame} bones, front at edge ${r.body.frontAtEdge.length ? r.body.frontAtEdge.join(', ') : 'none'} | plant ${r.plant ? JSON.stringify(r.plant) : 'none'}`);
    }
    if (errors.length) console.log('page errors:', errors.slice(0, 5));
    if (o.json) {
      await fsp.mkdir(path.dirname(path.resolve(o.json)), { recursive: true });
      await fsp.writeFile(path.resolve(`${o.json}-${size}.json`), JSON.stringify({ size, state, rows }, null, 1));
    }
    return rows;
  } finally {
    await stopBrowser(browser).catch(() => {});
    server.close();
  }
}

// Step 1, the key frames (--lykill all | 1,4a,6): each frame set from the table, a few frames drawn, then measured. With --eval the
// expression runs once the first frame named is up (its value printed) instead.
async function keyFrames(o, size, evaluate, errors) {
  const ids = await evaluate('window.__world.gramedla.keys.map(k => k.id)');
  const want = o.lykill === 'all' ? ids : o.lykill.split(',');
  const rows = [];
  for (const id of want) {
    await evaluate(`(async () => { const g = window.__world.gramedla; await g.show(g.keys.findIndex(k => k.id === '${id}')); await window.__advance(4 / 30); })()`);
    if (o.eval) { console.log(JSON.stringify(await evaluate(o.eval), null, 1)); return []; }
    rows.push(await evaluate('JSON.parse(JSON.stringify(window.__world.gramedla.measure()))'));
  }
  const f = x => (x * 100).toFixed(1);
  console.log(`\n=== ${size} ===`);
  for (const r of rows) {
    console.log(`${r.key} ${r.name} (${r.time} s): lead ${r.lead.what} k ${r.lead.k} = ${r.lead.out}% out | picture front ${f(r.picture.front)}% at ${f(r.picture.at)}% behind ${f(r.picture.behind)}% sky ${f(r.picture.sky)}% | far k ${r.background.farthestK} (+${f(r.background.parallax)}%)`);
    console.log(`   edge ${r.edge.ok ? 'ok' : 'BROKEN'} (border k ${r.edge.border} at ${JSON.stringify(r.edge.borderAt)}) | outside the middle ${r.edge.wideOk ? 'ok' : 'BROKEN'} (k ${r.edge.wide} at ${JSON.stringify(r.edge.wideAt)}) | middle k ${r.edge.middle} | ground ${r.ground.ok ? 'ok' : 'BROKEN'} (k ${r.ground.k}; floor at the border k ${r.edge.groundBorder})`);
    for (const [name, a] of Object.entries(r.actors)) console.log(`   ${name}: ${JSON.stringify(a)}`);
    for (const p of r.particles) console.log(`   specks ${p.group} (${p.kind}, ${p.count}): ${p.front} in front, nearest k ${p.nearest.k} (${p.out}%) at u ${p.nearest.u} v ${p.nearest.v}; nearer than k 0.6 outside the middle ${p.wideNear}; in front at an edge ${p.atEdge}`);
    console.log(`   clear: ${JSON.stringify(r.clear)}`);
  }
  if (errors.length) console.log('page errors:', errors.slice(0, 5));
  if (o.json) {
    await fsp.mkdir(path.dirname(path.resolve(o.json)), { recursive: true });
    await fsp.writeFile(path.resolve(`${o.json}-${size}.json`), JSON.stringify({ size, rows }, null, 1));
  }
  return rows;
}

// Step 2, the motion (--hreyfing): the show stepped from its first frame to its end card, sampled at each step.
async function motion(o, size, evaluate, errors, send) {
  const step = o.step ?? 1 / 30;
  const every = o.every ?? 3;
  const measure = o.measure ?? true;
  const depth = o.depth ?? true;
  // the page is frozen at 0: stepped on until the show has begun (its models in, her poses solved)
  for (let i = 0; i < 900; i++) {
    if (await evaluate('Boolean(window.__world?.gramedla?.sample && window.__world.gramedla.state.showing)')) break;
    await evaluate('window.__advance(1 / 30)');
  }
  const length = await evaluate('window.__world.gramedla.length');
  const until = Math.min(length, o.until ?? length);
  const cues = await evaluate('JSON.parse(JSON.stringify(window.__world.gramedla.cues))');
  const rows = [], bench = [];
  const benchAt = [...(o.bench ?? [])].sort((a, b) => a - b);
  let nextShot = every, shots = 0, n = 0;
  const started = Date.now();
  if (o.shots) await fsp.mkdir(path.resolve(o.shots), { recursive: true });
  const shoot = async name => {
    await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    await fsp.writeFile(path.resolve(o.shots, name), Buffer.from(data, 'base64'));
    shots++;
  };
  for (;;) {
    const t = await evaluate('window.__world.gramedla.state.t');
    if (measure) rows.push(await evaluate(`JSON.parse(JSON.stringify(window.__world.gramedla.sample({ depth: ${depth}, clear: ${n % 3 === 0} })))`));
    if (o.shots && t >= nextShot - 1e-6 && t < length) {
      await shoot(`${o.plain ? 'g0' : 'g1'}-${String(Math.round(t)).padStart(2, '0')}s.png`);
      nextShot += every;
    }
    while (benchAt.length && t >= benchAt[0] - 1e-6) {
      const at = benchAt.shift();
      bench.push({ t: +t.toFixed(2), at, ...(await evaluate('window.__benchmark(60)')) });
    }
    if (t >= until - 1e-6) break;
    await evaluate(`window.__advance(${step}, ${step})`);
    n++;
    if (n % 300 === 0) console.log(`  ${size}: ${t.toFixed(1)} s (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  }
  // the end card, and "Aftur": the show again from the top
  let card = null, again = null;
  if (until >= length) {
    await evaluate('window.__advance(0.5)');
    card = await evaluate('Boolean([...document.querySelectorAll("button")].find(b => /Aftur/.test(b.textContent)))');
    await evaluate('[...document.querySelectorAll("button")].find(b => /Aftur/.test(b.textContent))?.click()');
    await evaluate('window.__advance(4)');
    again = await evaluate('({ t: window.__world.gramedla.state.t, showing: window.__world.gramedla.state.showing, card: Boolean([...document.querySelectorAll("button")].find(b => /Aftur/.test(b.textContent))) })');
    if (o.shots) await shoot(`${o.plain ? 'g0' : 'g1'}-aftur-4s.png`);
  }
  const out = { size, step, length, cues, card, again, bench, errors: errors.slice(0, 20), seconds: (Date.now() - started) / 1000, rows };
  console.log(`${size}: ${rows.length} steps, ${shots} stills, end card ${card}, again ${JSON.stringify(again)}, errors ${errors.length}, ${out.seconds.toFixed(0)} s`);
  if (errors.length) console.log('page errors:', errors.slice(0, 5));
  if (bench.length) for (const b of bench) console.log(`  bench ${b.at} s: gpu ${JSON.stringify(b.gpuMs)} ms/frame ${b.msPerFrame?.toFixed(1)}`);
  if (o.json) {
    await fsp.mkdir(path.dirname(path.resolve(o.json)), { recursive: true });
    await fsp.writeFile(path.resolve(`${o.json}-${size}.json`), JSON.stringify(out));
  }
  return rows;
}

const o = parseArgs(process.argv.slice(2));
for (const size of o.size.split(',')) await probe(o, size);
