// Flugeðla og fiðrildið's probe (chapters/flugedla3d.js), step 1: loads the key frames and the two motion trials in the headless
// browser the captures use and reads world.flugedla3d.measure (flugedla3d/measure.js): each key frame's table row (every thing's
// parallax range) and its rules, the stills (g1-<id> with the glasses, g0-<id> plain), the trials swept in 1/30 s steps, the ground
// rule on a 4:3 picture over the whole film, the camera's own numbers and the GPU time.
//
//   node remake/tools/flugedla-probe.mjs [--keys 1] [--stills 1] [--trials beygja,upp] [--bench 1] [--step 0.0333]
//                                        [--out qa/flugedla3d] [--only 7,7b] [--eval "<js>"] [--query "<more address>"]
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
  const o = { size: '1280x800', quality: 'tablet', keys: true, stills: true, trials: ['beygja', 'upp'], bench: true, out: 'qa/flugedla3d', timeout: 300, step: 1 / 30, query: '', only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--keys') o.keys = next() !== '0';
    else if (a === '--stills') o.stills = next() !== '0';
    else if (a === '--trials') o.trials = next().split(',').filter(Boolean);
    else if (a === '--bench') o.bench = next() !== '0';
    else if (a === '--out') o.out = next();
    else if (a === '--eval') o.eval = next();
    else if (a === '--query') o.query = next();
    else if (a === '--step') o.step = Number(next());
    else if (a === '--only') o.only = next().split(',');
    else if (a === '--size') o.size = next();
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

async function page(o, server, query, fn) {
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
    await send('Page.navigate', { url: `${base}?chapter=flugedla3d&t=0&quality=${o.quality}&${query}${o.query ? '&' + o.query : ''}` });
    const t0 = Date.now();
    for (;;) {
      let ready = false;
      try { ready = await evaluate('Boolean(window.__demoReady && window.__advance && window.__world?.flugedla3d?.measure) || (window.__demoReady && window.__advance ? window.__advance(0.1).then(() => false) : false)'); } catch { /* loading */ }
      if (ready) break;
      if (Date.now() - t0 > o.timeout * 1000) throw new Error(`the page did not get ready${errors.length ? ': ' + errors.join(' | ') : ''}`);
      await sleep(250);
    }
    await evaluate('window.__advance(0.5)');
    const shoot = async file => {
      await evaluate('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      await fsp.writeFile(file, Buffer.from(data, 'base64'));
    };
    return await fn({ evaluate, shoot, errors });
  } finally {
    await stopBrowser(browser).catch(() => {});
  }
}

const f2 = x => (x == null ? '-' : (x >= 0 ? '+' : '') + x.toFixed(2));
const pxOf = x => (x * 12.8).toFixed(0);
function keyRow(id, name, r) {
  const h = r.her, b = r.butterfly, g = r.background;
  const herText = h
    ? `her ${f2(h.outFar)}..${f2(h.outNear)} (span ${h.span.toFixed(2)} %, ${h.spanPx} px; tips L u ${h.tips.left.u} ${f2(h.tips.left.out)} R u ${h.tips.right.u} ${f2(h.tips.right.out)})`
    : 'her -';
  const bText = b ? `butterfly ${f2(b.outFar)}..${f2(b.outNear)} (${(b.width * 100).toFixed(1)} % wide = ${(b.width * 1280).toFixed(0)} px)` : 'butterfly -';
  const gText = `background ${f2(g.outNear)}..${f2(g.outFar)} (${pxOf(g.outNear - g.outFar)} px; edge k ${g.border}${g.sky > 0.01 ? `, sky ${(g.sky * 100).toFixed(0)} %` : ''})`;
  return `${(id + ' ' + name).padEnd(24)} ${herText} | ${bText} | ${gText}${r.white > 0 ? ` | white ${r.white}` : ''}`;
}
const ruleText = r => Object.entries(r.rules).map(([k, v]) => `${k} ${v.ok ? 'ok' : 'BROKEN'}`).join(', ');

async function run(o) {
  const server = await startServer();
  const lines = [];
  const report = { size: o.size, quality: o.quality, keys: {}, trials: {}, bench: {}, ground43: null, camera: null, errors: [] };
  const say = s => { console.log(s); lines.push(s); };
  try {
    await fsp.mkdir(path.resolve(o.out), { recursive: true });
    if (o.keys || o.eval) {
      await page(o, server, 'lykill=1', async ({ evaluate, shoot, errors }) => {
        if (o.eval) { console.log(JSON.stringify(await evaluate(o.eval), null, 1)); return; }
        const keys = await evaluate('window.__world.flugedla3d.keys.map(k => ({ id: k.id, name: k.name, time: k.time }))');
        const info = await evaluate('(() => { const f = window.__world.flugedla3d; return { base: f.state.base, D: f.state.D, fov: window.__world.camera.fov, aspect: window.__world.camera.aspect, camera: f.route.stats, butterflySpan: f.cast.butterflySpan }; })()');
        report.camera = info.camera;
        say(`stage: lane ground ${info.base.toFixed(2)} m, D ${info.D} m, fov ${info.fov}, aspect ${info.aspect.toFixed(3)}; butterfly model span ${info.butterflySpan.toFixed(4)} (scaled to its BUTTERFLY_SPAN)`);
        say(`camera: greatest turn rate ${info.camera.maxTurn} deg/s; shortest change of a rate ${info.camera.shortestChange} s; backwards up to ${info.camera.maxBack} m/s, up ${info.camera.maxUp} m/s, down ${info.camera.maxDown} m/s`);
        say(`\n=== the key frames: parallax ranges, % of the screen's width, out positive (px at 1280) ===`);
        for (const [i, k] of keys.entries()) {
          if (o.only && !o.only.includes(k.id)) continue;
          await evaluate(`window.__world.flugedla3d.show(${i})`);
          await evaluate('window.__advance(1 / 30)');
          await evaluate('window.__advance(1 / 30)');
          const r = await evaluate('window.__world.flugedla3d.measure.sample()');
          report.keys[k.id] = r;
          say(keyRow(k.id, k.name, r));
          say(`${''.padEnd(24)} rules: ${ruleText(r)}${r.rules.r9.butterflyGap != null ? `; butterfly to her ${r.rules.r9.butterflyGap} m` : ''}${r.rules.r9.plants ? `; her to the plants ${r.rules.r9.plants.gap} m (${r.rules.r9.plants.what})` : ''}; r10 ${JSON.stringify(r.rules.r10)}${r.rules.r6.worst ? `; r6 worst ${JSON.stringify(r.rules.r6.worst)}` : ''}${r.rules.r4.ok ? '' : `; r4 ${JSON.stringify(r.rules.r4)}`}`);
          if (o.stills) {
            await evaluate('window.__world.gler.enable(true)');
            await evaluate('window.__advance(1 / 30)');
            await shoot(path.resolve(o.out, `g1-${k.id}.png`));
            await evaluate('window.__world.gler.enable(false)');
            await evaluate('window.__advance(1 / 30)');
            await shoot(path.resolve(o.out, `g0-${k.id}.png`));
            await evaluate('window.__world.gler.enable(true)');
          }
          if (o.bench && ['1', '6', '7'].includes(k.id)) {
            await evaluate('window.__advance(1 / 30)');
            const on = await evaluate('window.__benchmark(90)');
            report.bench[k.id] = on;
            say(`${''.padEnd(24)} GPU with the glasses: ${on.gpuMs?.median} ms median (${on.msPerFrame.toFixed(1)} ms/frame, ${on.triangles} triangles, ${on.drawCalls} draw calls)`);
          }
        }
        // the ground rule on a 4:3 picture over the whole film, every 0.1 s
        const g = await evaluate(`(() => { const f = window.__world.flugedla3d; let worst = null; for (let t = 0; t <= 76; t += 0.1) { f.apply(t, {}); const r = f.measure.groundOn43(); if (!worst || r.k < worst.k) worst = { ...r, t: +t.toFixed(1) }; } f.show(f.view.index); return worst; })()`);
        report.ground43 = g;
        say(`\nthe ground rule on 4:3 (1024x768: the 16:10 width kept), the whole film every 0.1 s: the ground at the bottom edge no nearer than k ${g.k} (at ${g.t} s, ${g.at < 0 ? 'left corner' : g.at > 0 ? 'right corner' : 'middle'})`);
        if (errors.length) { report.errors.push(...errors); say(`page errors: ${errors.slice(0, 4).join(' | ')}`); }
      });
    }
    for (const trial of o.trials) {
      await page(o, server, `profa=${trial}`, async ({ evaluate, shoot, errors }) => {
        const length = await evaluate('window.__world.flugedla3d.length');
        const rows = [];
        for (let i = 0; i * o.step <= length + 1e-9; i++) {
          const t = +(i * o.step).toFixed(4);
          await evaluate(`window.__world.flugedla3d.seek(${t})`);
          await evaluate('window.__advance(1 / 60)');
          const r = await evaluate('window.__world.flugedla3d.measure.sample()');
          r.trialT = t;
          rows.push(r);
        }
        report.trials[trial] = rows.map(r => ({ t: r.trialT, film: r.t, rules: r.rules, white: r.white, her: r.her && { outNear: r.her.outNear, outFar: r.her.outFar, span: r.her.span }, butterfly: r.butterfly && { outNear: r.butterfly.outNear, width: r.butterfly.width }, background: { outNear: r.background.outNear, outFar: r.background.outFar } }));
        const broken = k => rows.filter(r => !r.rules[k].ok);
        const nearest = rows.reduce((w, r) => (r.rules.r5.nearest < w.rules.r5.nearest ? r : w), rows[0]);
        const edge = rows.reduce((w, r) => (r.rules.r4.border < w.rules.r4.border && r.white < 0.99 ? r : w), rows[0]);
        const gap = rows.filter(r => r.rules.r9.butterflyGap != null).reduce((w, r) => Math.min(w, r.rules.r9.butterflyGap), Infinity);
        const plant = rows.filter(r => r.rules.r9.plants).reduce((w, r) => Math.min(w, r.rules.r9.plants.gap), Infinity);
        const spans = rows.filter(r => r.her && r.her.near[2] < 1).map(r => r.her.span);
        say(`\n=== trial ${trial} (${rows.length} frames, 1/${Math.round(1 / o.step)} s, film ${rows[0].t}-${rows.at(-1).t} s) ===`);
        say(`r4 ${broken('r4').length} broken (nearest at the border k ${edge.rules.r4.border} at ${edge.trialT} s, clouds in front at an edge ${rows.reduce((n, r) => n + r.rules.r4.cloudsAtEdge, 0)})` +
          ` | r5 ${broken('r5').length} broken (nearest ${nearest.rules.r5.out} % at ${nearest.trialT} s)` +
          ` | r6 ${broken('r6').length} broken${broken('r6').length ? ` (first ${broken('r6')[0].trialT} s ${JSON.stringify(broken('r6')[0].rules.r6.worst)})` : ''}` +
          ` | r9 ${broken('r9').length} broken (butterfly to her ${Number.isFinite(gap) ? gap.toFixed(2) : '-'} m, her to plants ${Number.isFinite(plant) ? plant.toFixed(2) : '-'} m)` +
          ` | r10 ${broken('r10').length} broken (her span in front ${spans.length ? Math.min(...spans).toFixed(2) + '-' + Math.max(...spans).toFixed(2) : '-'} %)`);
        for (const k of ['r4', 'r5', 'r6', 'r9', 'r10']) for (const r of broken(k).slice(0, 3)) say(`   ${k} at ${r.trialT} s (film ${r.t}): ${JSON.stringify(r.rules[k])}`);
        if (o.stills) for (const t of trial === 'beygja' ? [3, 6.5, 9] : [5, 15, 21, 30]) {
          await evaluate(`window.__world.flugedla3d.seek(${t})`);
          await evaluate('window.__advance(1 / 30)');
          await shoot(path.resolve(o.out, `${trial}-g1-${t}s.png`));
        }
        if (errors.length) { report.errors.push(...errors); say(`page errors: ${errors.slice(0, 4).join(' | ')}`); }
      });
    }
    if (!o.eval && !o.only) {
      await fsp.writeFile(path.resolve(o.out, 'maelingar.json'), JSON.stringify(report, null, 1));
      await fsp.writeFile(path.resolve(o.out, 'talur.txt'), lines.join('\n') + '\n');
    }
  } finally {
    server.close();
  }
}

run(parseArgs(process.argv.slice(2))).catch(error => { console.error(error); process.exitCode = 1; });
