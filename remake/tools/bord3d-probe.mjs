// The table picture's numbers (chapters/bord3d.js): loads ?chapter=bord3d in the headless browser the captures use, at each screen
// shape and each of Mosi's heights, and asks world.bord.measure(): his highest point's parallax, his picture's distance to each
// edge of the page through both eye cameras, whether it fits, the ground's parallax (none), and how far what each eye sees of his
// picture on the screen is from what it would see of him standing there (nothing).
//
//   node remake/tools/bord3d-probe.mjs [--sizes 1280x800,1024x768] [--heights 4,6,8,10] [--query "skjar=11"] [--json qa/bord3d/numbers.json]
//
// Exit code 1 when the page throws or a measure breaks the geometry (ground parallax, the eyes' error); a size that does not fit
// is a number, not a failure.
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
  const o = { sizes: '1280x800,1024x768', heights: '4,6,8,10', query: '', json: null, timeout: 180 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--sizes') o.sizes = next();
    else if (a === '--heights') o.heights = next();
    else if (a === '--query') o.query = next();
    else if (a === '--json') o.json = next();
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
    for (const height of o.heights.split(',').map(Number)) {
      errors.length = 0;
      await send('Page.navigate', { url: `${base}?chapter=bord3d&haed=${height}&t=2${o.query ? '&' + o.query : ''}` });
      const t0 = Date.now();
      for (;;) {
        let ready = false;
        try { ready = await evaluate('Boolean(window.__demoReady && window.__world?.bord)'); } catch { /* loading */ }
        if (ready) break;
        if (Date.now() - t0 > o.timeout * 1000) throw new Error(`the page did not get ready${errors.length ? ': ' + errors[0] : ''}`);
        await sleep(250);
      }
      const row = await evaluate('window.__world.bord.measure()');
      // how long a new step takes to work out (the page stands still meanwhile)
      row.solveMs = await evaluate('(() => { const t = performance.now(); window.__world.bord.solve(); return Math.round(performance.now() - t); })()');
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
try {
  for (const size of o.sizes.split(',')) {
    const rows = await probe(o, size, base);
    all.push(...rows);
    const p = rows[0].page, seat = rows[0].seat;
    console.log(`\n=== ${size}: the page ${p.W.toFixed(2)} x ${p.Hs.toFixed(2)} cm (${p.inches} inches over ${p.screenPx.join(' x ')} px), eyes ${seat.eyeHeight} cm up, ${seat.R} cm away at ${seat.a} degrees, ${seat.ipd} cm apart ===`);
    console.log('Mosi cm | top cm | parallax cm (formula) | % of width | margins left right top bottom, % (cm)            | fits | ground cm | eyes px | solve ms');
    for (const r of rows) {
      const m = r.margins, pc = x => (x * 100).toFixed(1).padStart(5);
      const edges = ['left', 'right', 'top', 'bottom'].map(k => `${pc(m.share[k])} (${m.cm[k].toFixed(2)})`).join(' ');
      const ground = Math.max(...r.groundParallaxCm.map(Math.abs));
      console.log(`${String(r.mosi.cm).padStart(7)} | ${r.top.cm.toFixed(2).padStart(6)} | ${r.top.parallaxCm.toFixed(3)} (${r.top.formulaCm.toFixed(3)})${' '.repeat(8)} | ${(r.top.share * 100).toFixed(2).padStart(10)} | ${edges} | ${m.fits ? 'yes ' : 'NO  '} | ${ground.toExponential(1)} | ${r.seenErrorPx.toFixed(3).padStart(7)} | ${r.solveMs}`);
      if (r.solved.label) console.log(`        label: ${r.solved.label}`);
      if (r.errors.length) { bad++; console.log(`        ERRORS: ${r.errors.join(' | ')}`); }
      if (ground > 1e-4 || r.seenErrorPx > 0.05 || Math.abs(r.top.parallaxCm - r.top.formulaCm) > 1e-3) { bad++; console.log('        GEOMETRY: the ground has parallax, or an eye does not see him where he stands'); }
      if (m.fits !== r.solved.fits) console.log('        (the label\'s verdict, over his whole breath, differs from this moment\'s)');
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
