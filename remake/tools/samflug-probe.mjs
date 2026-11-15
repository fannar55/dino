// Samflug's probe (chapters/samflug3d.js): loads ?chapter=samflug3d in the headless browser the captures use, at each speed, and
// reads world.samflug.measure.sample() (samflug3d/measure.js) at the beats' seconds (the rule 6 table: each thing's parallax range)
// and over the 15 s in 0.25 s steps (the rules); takes the stills (g1- with the glasses, g0- plain) and the GPU time.
//
//   node remake/tools/samflug-probe.mjs [--speeds 0,4,8] [--stills 1] [--sweep 1] [--bench 1] [--out qa/samflug3d] [--eval "<js>"]
//                                       [--query "<more of the address>"] [--step 0.25]
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
const STILLS = [2, 6, 9, 12];
const TABLE = [['Hún kemur', [1, 2, 3.5]], ['Samflug', [5, 6, 7.5, 9]], ['Goggurinn', [11.2, 12, 12.8]], ['Til baka', [14]]];

function parseArgs(argv) {
  const o = { size: '1280x800', quality: 'tablet', speeds: [0, 4, 8], stills: true, sweep: true, bench: true, out: 'qa/samflug3d', timeout: 240, step: 0.25, query: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--speeds') o.speeds = next().split(',').map(Number);
    else if (a === '--stills') o.stills = next() !== '0';
    else if (a === '--sweep') o.sweep = next() !== '0';
    else if (a === '--bench') o.bench = next() !== '0';
    else if (a === '--out') o.out = next();
    else if (a === '--eval') o.eval = next();
    else if (a === '--query') o.query = next();
    else if (a === '--step') o.step = Number(next());
    else if (a === '--quality') o.quality = next();
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

async function page(o, server, speed, fn) {
  const base = `http://127.0.0.1:${server.address().port}/remake/index.html`;
  const [W, H] = o.size.split('x').map(Number);
  const browser = await launchBrowser({ browser: 'edge', width: W, height: H });
  const { cdp } = browser;
  const errors = [];
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (m, p) => cdp.send(m, p, sessionId);
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
    await send('Page.navigate', { url: `${base}?chapter=samflug3d&t=2&quality=${o.quality}&hradi=${speed}${o.query ? '&' + o.query : ''}` });
    const t0 = Date.now();
    for (;;) {
      let ready = false;
      // (a capture's clock stands still: the script, waiting for her saddle, steps on only with __advance)
      try { ready = await evaluate('Boolean(window.__demoReady && window.__advance && window.__world?.samflug) || (window.__demoReady && window.__advance ? window.__advance(0.1).then(() => false) : false)'); } catch { /* loading */ }
      if (ready) break;
      if (Date.now() - t0 > o.timeout * 1000) throw new Error(`the page did not get ready${errors.length ? ': ' + errors.join(' | ') : ''}`);
      await sleep(250);
    }
    await evaluate('window.__advance(0.5)');
    const at = async (t, opts = {}) => {
      await evaluate(`window.__world.samflug.seek(${t})`);
      await evaluate('window.__advance(1 / 30)');
      return evaluate(`window.__world.samflug.measure.sample(${JSON.stringify(opts)})`);
    };
    const shoot = async file => {
      await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      await fsp.writeFile(file, Buffer.from(data, 'base64'));
    };
    return await fn({ evaluate, at, shoot, errors });
  } finally {
    await stopBrowser(browser).catch(() => {});
  }
}

const f2 = x => (x == null ? '-' : (x >= 0 ? '+' : '') + x.toFixed(2));
function tableRow(name, t, r) {
  const h = r.her, e = r.egill, b = r.butterflies, f = r.forest;
  const pxOf = x => (x * 12.8).toFixed(0);
  return `${name.padEnd(10)} ${String(t).padStart(5)}  her ${f2(h?.outFar)}..${f2(h?.outNear)} (${h ? h.span.toFixed(2) : '-'} %, ${h ? h.spanPx : '-'} px; tips L ${f2(h?.tips.left)} R ${f2(h?.tips.right)}, u ${h?.left[0]}-${h?.right[0]})` +
    ` | Egill ${f2(e?.outFar)}..${f2(e?.outNear)} (${e ? e.spanPx : '-'} px)` +
    ` | butterflies ${b ? `${f2(b.outFar)}..${f2(b.outNear)} (${b.spanPx} px)` : 'none'}` +
    ` | forest ${f ? `${f2(f.outNear)}..${f2(f.outFar)} (${pxOf(f.outNear - f.outFar)} px, edge k ${f.border})` : '-'}`;
}

async function run(o) {
  const server = await startServer();
  const lines = [];
  const report = { size: o.size, quality: o.quality, table: {}, sweeps: {}, bench: null, errors: [] };
  const say = s => { console.log(s); lines.push(s); };
  try {
    await fsp.mkdir(path.resolve(o.out), { recursive: true });
    for (const speed of o.speeds) {
      await page(o, server, speed, async ({ evaluate, at, shoot, errors }) => {
        if (o.eval) { console.log(JSON.stringify(await evaluate(o.eval), null, 1)); return; }
        const first = speed === o.speeds[0];
        if (first) {
          report.stage = await evaluate('(() => { const s = window.__world.samflug; return { camY: s.state.camY, D: s.state.D, fly: s.flyLength, fov: window.__world.camera.fov, aspect: window.__world.camera.aspect }; })()');
          say(`stage ${JSON.stringify(report.stage)}`);
        }
        if (o.stills && speed === 4) {
          for (const t of STILLS) {
            await evaluate('window.__world.gler.enable(true)');
            await at(t, { forest: false });
            await shoot(path.resolve(o.out, `g1-${String(t).padStart(2, '0')}s.png`));
            await evaluate('window.__world.gler.enable(false)');
            await evaluate('window.__advance(1 / 30)');
            await shoot(path.resolve(o.out, `g0-${String(t).padStart(2, '0')}s.png`));
            await evaluate('window.__world.gler.enable(true)');
          }
        }
        if (speed === 4 || o.speeds.length === 1) {
          say(`\n=== the rule 6 table (hradi ${speed}): parallax ranges, % of the screen width, out positive (px at 1280) ===`);
          for (const [name, times] of TABLE) {
            for (const t of times) {
              const r = await at(t);
              (report.table[name] ??= []).push(r);
              say(tableRow(name, t, r));
            }
          }
        }
        if (o.sweep) {
          const rows = [];
          for (let t = 0; t <= 15 + 1e-9; t += o.step) rows.push(await at(+t.toFixed(2), { forest: false }));
          report.sweeps[speed] = rows;
          const broken = k => rows.filter(r => !r.rules[k].ok);
          const worst = (k, f) => rows.reduce((w, r) => (f(r) < f(w) ? r : w), rows[0]);
          const r1 = worst('r1', r => r.rules.r1.nearest), r2 = worst('r2', r => r.rules.r2.border);
          const gap = rows.filter(r => r.rules.r5.butterflyGap != null).reduce((w, r) => Math.min(w, r.rules.r5.butterflyGap), Infinity);
          say(`\nsweep hradi ${speed} (${rows.length} frames, 0.25 s): r1 ${broken('r1').length} broken (nearest k ${r1.rules.r1.nearest} = ${r1.rules.r1.out} % at ${r1.t} s)` +
            ` | r2 ${broken('r2').length} broken (nearest at the border k ${r2.rules.r2.border} at ${JSON.stringify(r2.rules.r2.at)}, ${r2.t} s; specks in front at an edge: ${rows.reduce((n, r) => n + r.specks.atEdgeInFront, 0)})` +
            ` | r3 ${broken('r3').length} broken${broken('r3').length ? ` (first ${broken('r3')[0].t} s: ${JSON.stringify(broken('r3')[0].rules.r3.worst)})` : ''}` +
            ` | r5 ${broken('r5').length} broken (butterflies' nearest ${gap.toFixed(2)} m, wing reach ${Math.max(...rows.map(r => r.rules.r5.wingReach))} m of ${rows[0].rules.r5.clear})`);
          for (const r of broken('r1').concat(broken('r2'), broken('r3')).slice(0, 6)) say(`   ${r.t}s ${JSON.stringify(r.rules)}`);
        }
        if (o.bench && speed === 4) {
          await at(7);
          const on = await evaluate('window.__benchmark(90)');
          await evaluate('window.__world.gler.enable(false)');
          await evaluate('window.__advance(1 / 30)');
          const off = await evaluate('window.__benchmark(90)');
          await evaluate('window.__world.gler.enable(true)');
          report.bench = { glasses: on, plain: off };
          say(`\nGPU (${o.quality}, 1280x800, t 7 s): glasses ${on.gpuMs?.median} ms median (${on.msPerFrame.toFixed(1)} ms/frame, ${on.triangles} triangles, ${on.drawCalls} draw calls); plain ${off.gpuMs?.median} ms`);
        }
        if (errors.length) { report.errors.push(...errors); say(`page errors: ${errors.slice(0, 4).join(' | ')}`); }
      });
    }
    if (!o.eval) {
      await fsp.writeFile(path.resolve(o.out, 'maelingar.json'), JSON.stringify(report, null, 1));
      await fsp.writeFile(path.resolve(o.out, 'talur.txt'), lines.join('\n') + '\n');
    }
  } finally {
    server.close();
  }
}

run(parseArgs(process.argv.slice(2))).catch(error => { console.error(error); process.exitCode = 1; });
