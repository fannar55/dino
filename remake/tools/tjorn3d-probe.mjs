// The pond's numbers (chapters/tjorn3d.js): loads ?chapter=tjorn3d at each key and each screen shape in the headless browser the
// captures use and asks world.tjorn.measure(): the highest point over the surface and its parallax, the least distance to each
// edge of the page of everything standing over the surface (through both eye cameras), the deepest things and their parallax, the
// butterfly's clearance in key 6, the surface's own parallax (none), and how far what each eye sees of her picture on the screen
// is from what it would see of her there (nothing).
//
//   node remake/tools/tjorn3d-probe.mjs [--sizes 1280x800,1024x768] [--keys 1,2,3,4a,4b,4c,5,6] [--query "skjar=11"]
//                                       [--json qa/tjorn3d/numbers.json] [--eval "js, its value printed per key"]
//
// Exit code 1 when the page throws or a measure breaks the geometry (the surface's parallax, the eyes' error); a key that does not
// keep its margin is a number, not a failure.
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

function parseArgs(argv) {
  const o = { sizes: '1280x800,1024x768', keys: '1,2,3,4a,4b,4c,5,6', query: '', json: null, evalJs: '', timeout: 180 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--sizes') o.sizes = next();
    else if (a === '--keys') o.keys = next();
    else if (a === '--query') o.query = next();
    else if (a === '--json') o.json = next();
    else if (a === '--eval') o.evalJs = next();
    else if (a === '--timeout') o.timeout = Number(next());
    else throw new Error(`Unknown argument ${a}`);
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

async function probe(o, size, base) {
  const [W, H] = size.split('x').map(Number);
  const browser = await launchBrowser({ browser: 'edge', width: W, height: H });
  const { cdp } = browser;
  const rows = [];
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (m, p) => cdp.send(m, p, sessionId);
    const errors = [];
    cdp.handlers.add(msg => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
      else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map(a => a.value ?? a.description ?? a.type).join(' '));
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    for (const key of o.keys.split(',')) {
      errors.length = 0;
      await send('Page.navigate', { url: `${base}?chapter=tjorn3d&lykill=${key}&t=2${o.query ? '&' + o.query : ''}` });
      const t0 = Date.now();
      for (;;) {
        let ready = false;
        try { ready = await evaluate('Boolean(window.__demoReady && window.__world?.tjorn?.view.key)'); } catch { /* loading */ }
        if (ready) break;
        if (Date.now() - t0 > o.timeout * 1000) throw new Error(`the page did not get ready${errors.length ? ': ' + errors[0] : ''}`);
        await sleep(250);
      }
      const row = await evaluate('window.__world.tjorn.measure()');
      // how long a new key takes to work out (the page stands still meanwhile)
      row.solveMs = await evaluate('(() => { const t = performance.now(); window.__world.tjorn.solve(); return Math.round(performance.now() - t); })()');
      if (o.evalJs) row.evaluated = await evaluate(o.evalJs);
      row.size = size;
      row.errors = [...errors];
      rows.push(row);
    }
  } finally {
    await stopBrowser(browser);
  }
  return rows;
}

const o = parseArgs(process.argv.slice(2));
const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}/remake/index.html`;
const all = [];
let bad = 0;
const f = (x, n = 2, w = 0) => (x === null || x === undefined ? '-' : x.toFixed(n)).padStart(w);
try {
  for (const size of o.sizes.split(',')) {
    const rows = await probe(o, size, base);
    all.push(...rows);
    const p = rows[0].page, seat = rows[0].seat;
    console.log(`\n=== ${size}: the page ${p.W.toFixed(2)} x ${p.Hs.toFixed(2)} cm (${p.inches} inches over ${p.screenPx.join(' x ')} px), eyes ${seat.eyeHeight} cm up, ${seat.R} cm away at ${seat.a} degrees, ${seat.ipd} cm apart; 1 cm = ${rows[0].scale} m ===`);
    console.log('key | highest over the surface   | parallax cm (formula) | % width | least margin of what stands: left right top bottom, % (cm) | fits | deepest seen: cm under, parallax cm (% width) | surface cm | eyes px | solve ms');
    for (const r of rows) {
      const m = r.margins;
      const edges = m.share ? ['left', 'right', 'top', 'bottom'].map(k => `${f(m.share[k] * 100, 1, 5)} (${f(m.cm[k], 2)})`).join(' ') : 'nothing stands over the surface';
      const surface = Math.max(...r.surfaceParallaxCm.map(Math.abs));
      const top = r.top ? `${r.top.of.padEnd(9)} ${f(r.top.cm, 2, 5)} cm` : 'nothing'.padEnd(18);
      const deep = r.deepest.seen;
      console.log(`${r.key.padEnd(3)} | ${top.padEnd(26)} | ${r.top ? `${f(r.top.parallaxCm, 3)} (${f(r.top.formulaCm, 3)})` : '-'}${' '.repeat(8)} | ${f(r.top ? r.top.share * 100 : null, 2, 7)} | ${edges} | ${m.fits ? 'yes ' : 'NO  '} | ${deep.of} ${f(deep.cm, 1)} cm, ${f(deep.parallaxCm, 3)} (${f(deep.share * 100, 2)} %) | ${surface.toExponential(1)} | ${f(r.seenErrorPx, 3, 7)} | ${r.solveMs}`);
      console.log(`      label: ${r.label}`);
      if (r.her) console.log(`      her: head ${f(r.her.headCm)} cm, highest ${f(r.her.topCm)} cm, lowest ${f(r.her.lowCm)} cm, root ${f(r.her.sinkCm)} cm under at [${r.her.at.join(', ')}], tipped ${r.her.pitch} degrees`);
      console.log(`      tops (cm): ${Object.entries(r.tops).map(([n, v]) => `${n} ${v === null ? '-' : f(v)}`).join(', ')}; the bed ${f(r.deepest.bed.cm, 1)} cm under shows ${f(r.deepest.bed.shows * 100, 0)} % (parallax ${f(r.deepest.bed.parallaxCm, 3)} cm)`);
      if (r.butterfly) console.log(`      butterfly: its lowest point ${f(r.butterfly.feetOverSkinCm, 3)} cm over her skin where it stands, its nearest point to her skin ${f(r.butterfly.leastToSkinCm, 3)} cm (wings ${r.butterfly.spanCm} cm across)`);
      if (o.evalJs) console.log(`      eval: ${JSON.stringify(r.evaluated)}`);
      if (r.errors.length) { bad++; console.log(`      ERRORS: ${r.errors.join(' | ')}`); }
      if (surface > 1e-4 || r.seenErrorPx > 0.05 || (r.top && Math.abs(r.top.parallaxCm - r.top.formulaCm) > 1e-3)) { bad++; console.log('      GEOMETRY: the surface has parallax, or an eye does not see her where she is'); }
    }
  }
} finally {
  server.close();
}
if (o.json) {
  const file = path.resolve(ROOT, o.json);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(all, null, 1));
  console.log(`\nWritten: ${path.relative(ROOT, file).replace(/\\/g, '/')}`);
}
process.exit(bad ? 1 : 0);
