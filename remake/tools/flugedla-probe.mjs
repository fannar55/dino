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
    else if (a === '--eval-fjor') o.evalFjor = next();
    else if (a === '--query') o.query = next();
    else if (a === '--step') o.step = Number(next());
    else if (a === '--only') o.only = next().split(',');
    else if (a === '--size') o.size = next();
    else if (a === '--from') o.from = Number(next());
    else if (a === '--bench-at') o.benchAt = next().split(',').map(Number);
    else if (a === '--to') o.to = Number(next());
    else if (a === '--plane') o.plane = next();
    else if (a === '--talur') o.talur = next();
    else if (a === '--prefix') o.prefix = next(); // the fast take's stills: <prefix>-<s>s.png (fjor-g1 by default)
    else if (a === '--fjor-stills') o.fjorStills = next().split(',').map(Number);
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
      if (trial === 'fjor') { await fjorTrial(o, server, { say, report }); continue; }
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
        const herSpans = rows.filter(r => r.her && r.her.near[2] < 1).map(r => r.her.span);
        say(`\n=== trial ${trial} (${rows.length} frames, 1/${Math.round(1 / o.step)} s, film ${rows[0].t}-${rows.at(-1).t} s) ===`);
        say(`r4 ${broken('r4').length} broken (nearest at the border k ${edge.rules.r4.border} at ${edge.trialT} s, clouds in front at an edge ${rows.reduce((n, r) => n + r.rules.r4.cloudsAtEdge, 0)})` +
          ` | r5 ${broken('r5').length} broken (nearest ${nearest.rules.r5.out} % at ${nearest.trialT} s)` +
          ` | r6 ${broken('r6').length} broken${broken('r6').length ? ` (first ${broken('r6')[0].trialT} s ${JSON.stringify(broken('r6')[0].rules.r6.worst)})` : ''}` +
          ` | r9 ${broken('r9').length} broken (butterfly to her ${Number.isFinite(gap) ? gap.toFixed(2) : '-'} m, her to plants ${Number.isFinite(plant) ? plant.toFixed(2) : '-'} m)` +
          ` | r10 ${broken('r10').length} broken (her span in front ${herSpans.length ? Math.min(...herSpans).toFixed(2) + '-' + Math.max(...herSpans).toFixed(2) : '-'} %)`);
        const spans = list => { const out = []; for (const r of list) { const l = out.at(-1); if (l && r.trialT - l[1] < o.step * 1.5) l[1] = r.trialT; else out.push([r.trialT, r.trialT]); } return out.map(([a, b]) => `${a.toFixed(2)}-${b.toFixed(2)}`).join(', '); };
        for (const k of ['r4', 'r5', 'r6', 'r9', 'r10']) if (broken(k).length) say(`   ${k} broken at (trial s) ${spans(broken(k))}`);
        for (const k of ['r4', 'r5', 'r6', 'r9', 'r10']) for (const r of broken(k).slice(0, 2)) say(`   ${k} at ${r.trialT} s (film ${r.t}): ${JSON.stringify(r.rules[k])}`);
        if (o.stills) for (const t of trial === 'beygja' ? [3, 6.5, 9] : [5, 15, 21.5, 26.5, 30]) {
          await evaluate(`window.__world.flugedla3d.seek(${t})`);
          await evaluate('window.__advance(1 / 30)');
          await shoot(path.resolve(o.out, `${trial}-g1-${t}s.png`));
        }
        if (errors.length) { report.errors.push(...errors); say(`page errors: ${errors.slice(0, 4).join(' | ')}`); }
      });
    }
    if (!o.eval && !o.only) {
      await fsp.writeFile(path.resolve(o.out, 'maelingar.json'), JSON.stringify(report, null, 1));
      await fsp.writeFile(path.resolve(o.out, o.talur ?? 'talur.txt'), lines.join('\n') + '\n');
    }
  } finally {
    server.close();
  }
}

// ---- the fast take (?profa=fjor): the loosened rules of 2026-11-16 (the plan's section 12) ----
// 6 % budget; past 3 % out in u 0.2-0.8 unless in a fast pass; a thing an edge cuts in front of the screen only for a moment
// (dwell: consecutive frames with the border's nearest non-floor depth in front, k < 1); the floor at the bottom edge to about k 0.6.
// (round 3, real seconds: the forest's hold 1, the flock's layers, the near sweep under her, the nose-over, out of the cloud over the
// gorge, the dive's peak, the gorge with birds twice, up the falls, the crest's hold)
const FJOR_STILLS = [5.0, 23.96, 27.52, 32.52, 34.58, 35.13, 39.13, 43.13, 47.93, 52.13];
async function fjorTrial(o, server, { say, report }) {
  await page(o, server, `profa=fjor${o.plane ? '&d=' + o.plane : ''}`, async ({ evaluate, shoot, errors }) => {
    if (o.evalFjor) { console.log(JSON.stringify(await evaluate(o.evalFjor), null, 1)); return; } // (--eval-fjor "<js>": on the fast take's page)
    const length = await evaluate('window.__world.flugedla3d.length');
    const D = await evaluate('window.__world.flugedla3d.state.D');
    const rows = [];
    const t0 = o.from ?? 0, t1 = Math.min(length, o.to ?? length); // --from/--to: sweep one part of the take (real seconds)
    for (let i = 0; t0 + i * o.step <= t1 + 1e-9; i++) {
      const t = +(t0 + i * o.step).toFixed(4);
      await evaluate(`window.__world.flugedla3d.seek(${t})`);
      await evaluate('window.__advance(1 / 60)');
      await evaluate('window.__advance(1 / 60)'); // (a second frame: what reads last frame's pose, as the butterfly's keep-clear, reads this second's)
      const r = await evaluate(`(() => { const f = window.__world.flugedla3d; const r = f.measure.sample({ groundApart: true }); const st = f.state; return { her: r.her, butterfly: r.butterfly, background: r.background, gap: r.rules.r9.butterflyGap, plants: r.rules.r9.plants, nearest: r.rules.r5.nearest, cam: { ...st.cam }, herInfo: st.herInfo, bfly: st.butterfly && st.butterfly.at, white: st.white, story: st.story, rate: st.rate, thor: null, place: st.place, flock: st.flock ? st.flock.map(x => ({ ...x })) : [], birds: st.birds ? st.birds.map(x => ({ k: x.k, u: x.u, dart: x.dart })) : [], camPitch: st.cam.pitch, gaps: (() => { const T = window.__world.THREE, v = new T.Vector3(); const hb = []; f.cast.her.model.traverse(o => { if (o.isBone) hb.push(o.getWorldPosition(new T.Vector3())); }); let flock = Infinity, birds = Infinity, bf = Infinity; for (const m of f.fjor.life.flock) { if (!m || !m.actor.root.visible) continue; m.actor.model.traverse(o => { if (o.isBone) { o.getWorldPosition(v); for (const h of hb) flock = Math.min(flock, h.distanceTo(v)); bf = Math.min(bf, f.cast.butterfly.position.distanceTo(v)); } }); } for (const b of st.birds ?? []) { v.fromArray(b.world); for (const h of hb) birds = Math.min(birds, h.distanceTo(v)); } const mem = []; f.fjor.life.flock.forEach((m, i) => { if (!m || !m.actor.root.visible) return; const bs = []; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; m.actor.model.traverse(o => { if (o.isBone) { const p = o.getWorldPosition(new T.Vector3()); bs.push(p); const q = p.clone().project(window.__world.camera); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); } }); mem.push({ i, bs, box: [x0, x1, y0, y1] }); }); const pairs = []; for (let a = 0; a < mem.length; a++) for (let b = a + 1; b < mem.length; b++) { let g = Infinity; for (const p of mem[a].bs) for (const q of mem[b].bs) g = Math.min(g, p.distanceTo(q)); const A = mem[a].box, B = mem[b].box; const ov = Math.max(0, Math.min(A[1], B[1]) - Math.max(A[0], B[0])) * Math.max(0, Math.min(A[3], B[3]) - Math.max(A[2], B[2])); const area = Math.min((A[1] - A[0]) * (A[3] - A[2]), (B[1] - B[0]) * (B[3] - B[2])); pairs.push([mem[a].i, mem[b].i, +g.toFixed(2), area > 0 ? +(ov / area).toFixed(2) : 0]); } const herEach = mem.map(m => { let g = Infinity; for (const p of m.bs) for (const h of hb) g = Math.min(g, p.distanceTo(h)); return [m.i, +g.toFixed(2)]; }); return { flock: +flock.toFixed(2), birds: +birds.toFixed(2), bfFlock: +bf.toFixed(2), pairs, herEach }; })() }; })()`);
      r.t = t;
      rows.push(r);
    }
    const s = 0.02 * 100;
    const outOf = k => s * (1 / k - 1);
    const fx = x => (x == null || !Number.isFinite(x) ? '-' : (x >= 0 ? '+' : '') + x.toFixed(2)); // ('-': none in a --from/--to part)
    say(`\n=== trial fjor (${rows.length} frames, 1/${Math.round(1 / o.step)} s, ${length.toFixed(2)} s, D ${D} m) ===`);
    // her and the butterfly's parallax through the take
    const her = rows.filter(r => r.her), bf = rows.filter(r => r.butterfly);
    const herFar = Math.min(...her.map(r => r.her.outFar)), herNear = Math.max(...her.map(r => r.her.outNear));
    const bfNear = Math.max(...bf.map(r => r.butterfly.outNear)), bfFar = Math.min(...bf.map(r => r.butterfly.outFar));
    const herSpan = her.filter(r => r.her.near[2] < 1).map(r => r.her.span);
    say(`her: ${fx(herFar)}..${fx(herNear)} % over the take (span in front ${Math.min(...herSpan).toFixed(2)}-${Math.max(...herSpan).toFixed(2)} %); the butterfly ${fx(bfFar)}..${fx(bfNear)} %`);
    const runs = (pred) => { const out = []; for (const r of rows) { const l = out.at(-1); if (pred(r)) { if (l && r.t - l.b < o.step * 1.5) { l.b = r.t; l.rows.push(r); } else out.push({ a: r.t, b: r.t, rows: [r] }); } } return out; };
    // round 2: her chest (her body's middle, the page's herInfo.chestK) through the take, the forest part (to 14.4 s) on its own
    const chest = rows.filter(r => r.herInfo?.chestK > 0 && r.white < 0.99).map(r => ({ t: r.t, out: outOf(r.herInfo.chestK) }));
    const med = list => { const s2 = list.map(x => x.out).sort((a, b) => a - b); return s2[Math.floor(s2.length / 2)]; };
    const share = (list, lim) => list.filter(x => x.out >= lim).length / Math.max(1, list.length);
    const storyOf = new Map(rows.map(r => [r.t, r.story ?? r.t]));
    const forest = chest.filter(x => storyOf.get(x.t) < 13.44);
    say(`her chest: median ${fx(med(chest))} % over the take, past +2 % ${(100 * share(chest, 2)).toFixed(0)} % of the time; the forest part (story 0-13.44 s): median ${fx(med(forest))} %, past +2 % ${(100 * share(forest, 2)).toFixed(0)} %, past +3.5 % ${(100 * share(forest, 3.5)).toFixed(0)} %; range ${fx(Math.min(...chest.map(x => x.out)))}..${fx(Math.max(...chest.map(x => x.out)))} %`);
    const herNearOut = r => outOf(r.her.near[2]);
    say(`her nearest point: median ${fx(med(her.map(r => ({ out: herNearOut(r) }))))} %, past +4.5 % ${(100 * share(her.map(r => ({ out: herNearOut(r) })), 4.5)).toFixed(0)} % of the time`);
    // round 3: each part of the take (story seconds): her chest and nearest point, the camera's pitch, her pitch, the edges (walls)
    const VT = await evaluate('window.__world.flugedla3d.fjor.warp && 32.21');
    const PARTS = [['forest', 0, 13.44], ['climb', 13.44, 19.68], ['flock', 19.68, 30.24], ['nose-over and dive', 30.24, VT + 2.7], ['gorge', VT + 2.7, VT + 12.2], ['up the falls', VT + 12.2, VT + 16.4], ['crest', VT + 16.4, 99]];
    for (const [name, a, b] of PARTS) {
      const pr = rows.filter(r => (r.story ?? r.t) >= a && (r.story ?? r.t) < b && r.her && r.white < 0.99);
      if (!pr.length) continue;
      const ch = pr.filter(r => r.herInfo?.chestK > 0).map(r => outOf(r.herInfo.chestK));
      const nr = pr.map(herNearOut);
      const edge = pr.filter(r => r.background.border != null).map(r => outOf(r.background.border));
      const pitches = pr.map(r => r.camPitch ?? 0), hp = pr.map(r => r.herInfo?.pitch ?? 0);
      say(`  ${name} (story ${a.toFixed(2)}-${Math.min(b, rows.at(-1).story ?? b).toFixed(2)} s): chest ${fx(Math.min(...ch))}..${fx(Math.max(...ch))} % (median ${fx(med(ch.map(out => ({ out }))))}), nearest point ${fx(Math.min(...nr))}..${fx(Math.max(...nr))} %; camera pitch ${Math.min(...pitches).toFixed(0)}..${Math.max(...pitches).toFixed(0)} deg, her pitch ${Math.min(...hp).toFixed(0)}..${Math.max(...hp).toFixed(0)} deg; the nearest thing at an edge to ${edge.length ? fx(Math.max(...edge)) : '-'} % (median ${edge.length ? fx(med(edge.map(out => ({ out })))) : '-'})`);
    }
    // the flock: each member's parallax range (its body's middle), the layers; the birds
    const fr = rows.filter(r => r.flock?.length);
    if (fr.length) {
      const n = Math.max(...fr.map(r => r.flock.length));
      for (let i = 0; i < n; i++) {
        const ks = fr.map(r => r.flock[i]).filter(Boolean).filter(x => x.u > -0.05 && x.u < 1.05 && x.v < 1.0);
        if (!ks.length) continue;
        say(`  flock ${i} (${ks[0].layer}): body ${fx(Math.min(...ks.map(x => outOf(x.k))))}..${fx(Math.max(...ks.map(x => outOf(x.k))))} % while in the picture`);
      }
      const g = rows.filter(r => r.gaps && Number.isFinite(r.gaps.flock)).reduce((w, r) => (!w || r.gaps.flock < w.gaps.flock ? r : w), null);
      const gb = rows.filter(r => r.gaps && Number.isFinite(r.gaps.bfFlock)).reduce((w, r) => (!w || r.gaps.bfFlock < w.gaps.bfFlock ? r : w), null);
      // member to member (bones as points, wings included) and her to each; how long two overlap in the picture (bone boxes, the
      // smaller's share) by more than half
      const pairMin = new Map(), herMin = new Map(), overlap = new Map();
      for (const r of rows) {
        for (const [a, b, g, ov] of r.gaps?.pairs ?? []) {
          const key = a + '-' + b;
          if (!pairMin.has(key) || g < pairMin.get(key).g) pairMin.set(key, { g, t: r.t });
          if (ov > 0.5) overlap.set(key, (overlap.get(key) ?? 0) + o.step);
        }
        for (const [i, g] of r.gaps?.herEach ?? []) if (!herMin.has(i) || g < herMin.get(i).g) herMin.set(i, { g, t: r.t });
      }
      const pm = [...pairMin.entries()].sort((x, y) => x[1].g - y[1].g);
      say(`  member to member, the smallest gaps: ${pm.slice(0, 6).map(([k, v]) => `${k} ${v.g} m (${v.t.toFixed(2)} s)`).join(', ')}; pairs under 1 m: ${pm.filter(([, v]) => v.g < 1).length}`);
      say(`  her to each member: ${[...herMin.entries()].sort((x, y) => x[0] - y[0]).map(([i, v]) => `${i} ${v.g} m (${v.t.toFixed(2)} s)`).join(', ')}`);
      say(`  overlapping in the picture by more than half: ${[...overlap.entries()].map(([k, v]) => `${k} ${v.toFixed(2)} s`).join(', ') || 'never'}`);
      say(`  the smallest gap, her bones to a flock member's bones: ${g ? g.gaps.flock + ' m at ' + g.t + ' s' : '-'}; the butterfly to a flock member's bones ${gb ? gb.gaps.bfFlock + ' m at ' + gb.t + ' s' : '-'}`);
    }
    const br = rows.filter(r => r.birds?.length);
    if (br.length) {
      const all = br.flatMap(r => r.birds.filter(x => x.u > 0 && x.u < 1));
      const darts = all.filter(x => x.dart);
      const gb = rows.filter(r => r.gaps && Number.isFinite(r.gaps.birds)).reduce((w, r) => (!w || r.gaps.birds < w.gaps.birds ? r : w), null);
      say(`  the birds: ${fx(Math.min(...all.map(x => outOf(x.k))))}..${fx(Math.max(...all.map(x => outOf(x.k))))} % (the darting ones ${darts.length ? fx(Math.min(...darts.map(x => outOf(x.k)))) + '..' + fx(Math.max(...darts.map(x => outOf(x.k)))) : '-'} %); the nearest to her bones ${gb ? gb.gaps.birds + ' m at ' + gb.t + ' s' : '-'}`);
    }
    // the holds (from the page's take): how far out and where in the picture
    for (const [a, b] of (await evaluate('window.__world.flugedla3d.fjor.holds')) ?? []) {
      const hr = rows.filter(r => r.t >= a && r.t <= b && r.her);
      if (!hr.length) continue;
      const ch = hr.filter(r => r.herInfo?.chestK > 0).map(r => outOf(r.herInfo.chestK));
      const us = hr.map(r => (r.her.left[0] + r.her.right[0]) / 2);
      say(`  hold ${a}-${b} s (${(b - a).toFixed(2)} s): chest ${fx(Math.min(...ch))}..${fx(Math.max(...ch))} %, nearest point to ${fx(Math.max(...hr.map(herNearOut)))} %, her middle at u ${Math.min(...us).toFixed(2)}-${Math.max(...us).toFixed(2)}, wings u ${Math.min(...hr.map(r => r.her.left[0])).toFixed(2)}-${Math.max(...hr.map(r => r.her.right[0])).toFixed(2)}`);
    }
    // the slow stretches (round 2b): what is how far out in each
    for (const [a, b] of (await evaluate('window.__world.flugedla3d.fjor.slows')) ?? []) {
      const sr = rows.filter(r => r.t >= a && r.t <= b && r.her);
      if (!sr.length) continue;
      const ch = sr.filter(r => r.herInfo?.chestK > 0).map(r => outOf(r.herInfo.chestK));
      const us = sr.map(r => (r.her.left[0] + r.her.right[0]) / 2);
      const th = sr.map(r => r.thor?.head).filter(h => h && h.inView);
      const bfs = sr.filter(r => r.butterfly).map(r => r.butterfly.outNear);
      say(`  slow ${a.toFixed(2)}-${b.toFixed(2)} s (${(b - a).toFixed(2)} s real, story ${(sr[0].story ?? 0).toFixed(2)}-${(sr.at(-1).story ?? 0).toFixed(2)} s, speed down to ${Math.min(...sr.map(r => r.rate ?? 1)).toFixed(2)}): her chest ${fx(Math.min(...ch))}..${fx(Math.max(...ch))} %, her nearest point ${fx(Math.min(...sr.map(herNearOut)))}..${fx(Math.max(...sr.map(herNearOut)))} %, her middle at u ${Math.min(...us).toFixed(2)}-${Math.max(...us).toFixed(2)}; the butterfly to ${bfs.length ? fx(Math.max(...bfs)) : '-'} %${th.length ? '; the head of Þórseðla ' + fx(Math.min(...th.map(h => outOf(h.k)))) + '..' + fx(Math.max(...th.map(h => outOf(h.k)))) + ' %' : ''}`);
    }
    // Þórseðla (round 2b)
    const tr = rows.filter(r => r.thor && r.thor.seen > 0);
    if (tr.length) {
      const hs = rows.filter(r => r.thor?.head?.inView).map(r => ({ t: r.t, out: outOf(r.thor.head.k), u: r.thor.head.u, v: r.thor.head.v }));
      const top = hs.reduce((w, x) => (!w || x.out > w.out ? x : w), null);
      const linger = runs(r => r.thor?.head?.inView && outOf(r.thor.head.k) >= 3.5);
      const near = tr.reduce((w, r) => (!w || r.thor.near.k < w.thor.near.k ? r : w), null);
      say(`Þórseðla: in the picture ${tr[0].t.toFixed(2)}-${tr.at(-1).t.toFixed(2)} s (${tr.length} frames); her nearest point to ${fx(outOf(near.thor.near.k))} % (${near.thor.near.name}, ${near.t} s), the farthest of her nearest ${fx(Math.min(...tr.map(r => outOf(r.thor.near.k))))} %`);
      say(`  her head: the peak ${top ? fx(top.out) + ' % at ' + top.t + ' s (u ' + top.u + ', v ' + top.v + ')' : '-'}; past +3.5 %: ${linger.map(x => x.a.toFixed(2) + '-' + x.b.toFixed(2) + ' s (' + (x.b - x.a + o.step).toFixed(2) + ' s real, u ' + Math.min(...x.rows.map(r => r.thor.head.u)).toFixed(2) + '-' + Math.max(...x.rows.map(r => r.thor.head.u)).toFixed(2) + ')').join(', ') || 'never'}`);
      const all = rows.filter(r => r.thor);
      const g = key => all.reduce((w, r) => { const x = r.thor[key]; const v = typeof x === 'object' ? x.gap : x; return !w || v < w.v ? { v, t: r.t, what: x?.name } : w; }, null);
      const gh = g('gapHer'), gb = g('gapBf'), gc = g('gapCam');
      say(`  the smallest gaps to her body (her bones as balls): Flugeðla's bones ${gh.v} m (${gh.what}, ${gh.t} s), the butterfly ${gb.v} m (${gb.t} s), the camera ${gc.v} m (${gc.t} s)`);
    }
    // her wing cut by a side edge while in front of the screen: how long
    const wingCut = runs(r => r.her && r.white < 0.99 && ((r.her.left[0] <= 0.005 && r.her.left[2] < 1) || (r.her.right[0] >= 0.995 && r.her.right[2] < 1)));
    const wl = wingCut.reduce((w, x) => (!w || x.b - x.a > w.b - w.a ? x : w), null);
    say(`her wing at a side edge in front of the screen: ${wingCut.length} times, ${wingCut.reduce((n, x) => n + x.rows.length, 0)} frames; the longest ${wl ? `${wl.a.toFixed(2)}-${wl.b.toFixed(2)} s (${(wl.b - wl.a + o.step).toFixed(2)} s)` : '-'}`);
    // the greatest out, and how long each stretch past 4 % lasts
    const nearestOut = r => outOf(Math.min(r.her?.near[2] ?? Infinity, r.butterfly?.near[2] ?? Infinity, r.background.nearest ?? Infinity));
    const most = rows.reduce((w, r) => (nearestOut(r) > nearestOut(w) ? r : w), rows[0]);
    say(`the greatest out: ${fx(nearestOut(most))} % at ${most.t} s (budget 6 %)`);
    for (const lim of [4, 5]) {
      const list = runs(r => nearestOut(r) >= lim);
      say(`  past ${lim} %: ${list.map(x => `${x.a.toFixed(2)}-${x.b.toFixed(2)} s (${(x.b - x.a + o.step).toFixed(2)} s, to ${fx(Math.max(...x.rows.map(nearestOut)))} %)`).join(', ') || 'never'}`);
    }
    const over6 = rows.filter(r => nearestOut(r) > 6.02);
    say(`  past 6 %: ${over6.length} frames${over6.length ? ` (first ${over6[0].t} s)` : ''}`);
    // past 3 % out outside u 0.2-0.8
    const wide = rows.filter(r => [r.her, r.butterfly].some(x => x && ((outOf(x.left[2]) > 3 && x.left[0] < 0.2) || (outOf(x.right[2]) > 3 && x.right[0] > 0.8))));
    say(`past 3 % out outside u 0.2-0.8 (her or the butterfly): ${wide.length} frames${wide.length ? ' at ' + runs(r => wide.includes(r)).map(x => `${x.a.toFixed(2)}-${x.b.toFixed(2)}`).join(', ') : ''}`);
    // the edge: a non-floor thing cut by an edge in front of the screen, and how long it dwells
    const cut = runs(r => r.white < 0.99 && r.background.border < 1);
    const worstDwell = cut.reduce((w, x) => (!w || x.b - x.a > w.b - w.a ? x : w), null);
    const worstEdge = rows.filter(r => r.white < 0.99).reduce((w, r) => (r.background.border < w.background.border ? r : w), rows[0]);
    say(`the edge (not the floor): in front at an edge in ${cut.length} stretches; the longest ${worstDwell ? `${worstDwell.a.toFixed(2)}-${worstDwell.b.toFixed(2)} s (${(worstDwell.b - worstDwell.a + o.step).toFixed(2)} s, to ${fx(outOf(Math.min(...worstDwell.rows.map(r => r.background.border))))} %)` : '-'}; the nearest at an edge k ${worstEdge.background.border} (${fx(outOf(worstEdge.background.border))} %) at ${worstEdge.t} s, at ${JSON.stringify(worstEdge.background.borderAt)}`);
    const longer = cut.filter(x => x.b - x.a + o.step > 0.4 + 1e-6);
    say(`  stretches longer than 0.4 s: ${longer.map(x => `${x.a.toFixed(2)}-${x.b.toFixed(2)}`).join(', ') || 'none'}`);
    const floor = rows.filter(r => r.background.groundBorder != null && r.white < 0.99).reduce((w, r) => (!w || r.background.groundBorder < w.background.groundBorder ? r : w), null);
    say(`the floor at the bottom edge: nearest k ${floor?.background.groundBorder ?? '-'} at ${floor?.t ?? '-'} s`);
    // each plant on its own (the depth probe sees the border's nearest, not which thing it is): how long each trunk or crown is cut
    // by an edge in front of the screen, and how fast the nearest things cross the picture (degrees a second)
    const plantsList = await evaluate(`(() => { const f = window.__world.flugedla3d; const pts = f.fjor.path.pts.filter(q => q.y < 30); const out = []; for (const pl of (window.__world.forest?.placements ?? [])) { if (!pl.model) continue; let near = Infinity; for (let i = 0; i < pts.length; i += 6) near = Math.min(near, Math.hypot(pl.x - pts[i].x, pl.z - pts[i].z)); if (near > 30) continue; const m = pl.model, sc = pl.scale ?? 1, cs = Math.cos(pl.rot ?? 0), sn = Math.sin(pl.rot ?? 0); const cr = m.crown; out.push({ name: pl.name, x: pl.x, y: pl.y, z: pl.z, top: (m.trunk?.top ?? m.height ?? 2) * sc, r: (m.trunk?.r ?? 0.3) * sc, crown: cr ? [pl.x + (cr.c[0] * cs - cr.c[2] * sn) * sc, pl.y + cr.c[1] * sc, pl.z + (cr.c[0] * sn + cr.c[2] * cs) * sc, Math.max(cr.r, cr.ry ?? cr.r) * sc] : null }); } return out; })()`);
    const tanV = Math.tan((23 * Math.PI) / 180), tanH = tanV * 1.6;
    const basis = c => {
      const y = (c.yaw * Math.PI) / 180, p = ((c.pitch ?? 0) * Math.PI) / 180, a = -((c.roll ?? 0) * Math.PI) / 180;
      const f = [Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)];
      const r0 = [Math.cos(y), 0, Math.sin(y)];
      const u0 = [r0[1] * f[2] - r0[2] * f[1], r0[2] * f[0] - r0[0] * f[2], r0[0] * f[1] - r0[1] * f[0]];
      const right = r0.map((v, i) => v * Math.cos(a) + u0[i] * Math.sin(a)), up = u0.map((v, i) => -r0[i] * Math.sin(a) + v * Math.cos(a));
      return { f, right, up, p: [c.x, c.y, c.z] };
    };
    const view = (b, q) => { const d = [q[0] - b.p[0], q[1] - b.p[1], q[2] - b.p[2]]; const dot = v => d[0] * v[0] + d[1] * v[1] + d[2] * v[2]; return [dot(b.right), dot(b.up), dot(b.f)]; };
    const partsOf = pl => { const trunk = []; for (let h = pl.y + 0.5; h < pl.y + pl.top; h += 1.2) trunk.push([pl.x, h, pl.z, pl.r]); return pl.crown ? [['trunk', trunk], ['crown', [pl.crown]]] : [['trunk', trunk]]; };
    const dwell = new Map(); // plant index -> current run { a, b, k }
    const runsOf = [];
    let fastest = { w: 0 };
    const angular = [];
    let prevDir = new Map();
    for (const r of rows) {
      const b = basis(r.cam);
      const nowDir = new Map();
      let frameMax = 0, frameWho = null;
      for (const [i, pl] of plantsList.entries()) {
       let seen = false;
       for (const [part, balls] of partsOf(pl)) {
        let cutK = Infinity;
        for (const [x, y, z, R] of balls) {
          const [vx, vy, vz] = view(b, [x, y, z]);
          if (vz + R <= 0) continue;
          const dz = Math.max(vz, 0.01);
          const inside = Math.abs(vx) - R < tanH * dz && Math.abs(vy) - R < tanV * dz;
          if (!inside) continue;
          seen = true;
          const cut = Math.abs(vx) + R > tanH * dz || Math.abs(vy) + R > tanV * dz;
          const k = Math.max(0.01, vz - R) / D;
          if (cut && k < 1 && r.white < 0.99) cutK = Math.min(cutK, k);
        }
        const key = i + part;
        const run = dwell.get(key);
        if (cutK < 1) {
          if (run && r.t - run.b < o.step * 1.5) { run.b = r.t; run.k = Math.min(run.k, cutK); } else { if (run) runsOf.push(run); dwell.set(key, { a: r.t, b: r.t, k: cutK, name: pl.name + ' ' + part, part }); }
        } else if (run) { runsOf.push(run); dwell.delete(key); }
       }
        // its trunk at the camera's height (or its crown): the direction in the camera's frame, for the angular speed
        if (seen) {
          const q = [pl.x, Math.min(pl.y + pl.top, Math.max(pl.y, r.cam.y)), pl.z];
          const [vx, vy, vz] = view(b, q);
          const n = Math.hypot(vx, vy, vz);
          if (vz > 0 && n < 40) {
            const dir = [vx / n, vy / n, vz / n];
            nowDir.set(i, dir);
            const last = prevDir.get(i);
            if (last) {
              const w = (Math.acos(Math.min(1, dir[0] * last[0] + dir[1] * last[1] + dir[2] * last[2])) * 180) / Math.PI / o.step;
              if (w > frameMax) { frameMax = w; frameWho = { name: pl.name, dist: +n.toFixed(1) }; }
            }
          }
        }
      }
      prevDir = nowDir;
      angular.push({ t: r.t, w: frameMax, who: frameWho });
      if (frameMax > fastest.w) fastest = { t: r.t, w: frameMax, who: frameWho };
    }
    for (const run of dwell.values()) runsOf.push(run);
    runsOf.sort((x, y) => (y.b - y.a) - (x.b - x.a));
    const longest = runsOf[0];
    say(`each plant cut by an edge in front of the screen (${plantsList.length} plants near the line): ${runsOf.length} times; the longest ${longest ? `${(longest.b - longest.a + o.step).toFixed(2)} s (${longest.name}, ${longest.a.toFixed(2)}-${longest.b.toFixed(2)} s, nearest k ${longest.k.toFixed(2)} = ${fx(outOf(longest.k))} %)` : '-'}; over 0.4 s: ${runsOf.filter(x => x.b - x.a + o.step > 0.4 + 1e-6).length}; the nearest such: ${(() => { const n = runsOf.reduce((w, x) => (!w || x.k < w.k ? x : w), null); return n ? `k ${n.k.toFixed(2)} = ${fx(outOf(n.k))} % (${n.name} at ${n.a.toFixed(2)} s, for ${(n.b - n.a + o.step).toFixed(2)} s)` : '-'; })()}`);
    for (const part of ['trunk', 'crown']) { const list = runsOf.filter(x => x.part === part); const n = list.reduce((w, x) => (!w || x.k < w.k ? x : w), null); say(`  ${part}s: ${list.length} times, the longest ${list[0] ? (list[0].b - list[0].a + o.step).toFixed(2) + ' s (k ' + list[0].k.toFixed(2) + ', at ' + list[0].a.toFixed(2) + ' s)' : '-'}, over 0.4 s: ${list.filter(x => x.b - x.a + o.step > 0.4 + 1e-6).length}, the nearest k ${n ? n.k.toFixed(2) + ' (' + fx(outOf(n.k)) + ' %, ' + (n.b - n.a + o.step).toFixed(2) + ' s)' : '-'}`); }
    say(`  the 5 longest: ${runsOf.slice(0, 5).map(x => `${x.name} ${x.a.toFixed(2)}-${x.b.toFixed(2)} s (${(x.b - x.a + o.step).toFixed(2)} s, k ${x.k.toFixed(2)})`).join('; ')}`);
    const sorted = angular.map(a => a.w).filter(w => w > 0).sort((x, y) => x - y);
    say(`the nearest plants' angular speed across the picture: fastest ${fastest.w.toFixed(0)} deg/s at ${fastest.t} s (${fastest.who?.name}, ${fastest.who?.dist} m); per frame's fastest: median ${sorted[Math.floor(sorted.length / 2)]?.toFixed(0)} deg/s; at ${[2.5, 6, 10.6, 12.5, 25.5].map(t => { const a = angular.reduce((w, x) => (Math.abs(x.t - t) < Math.abs(w.t - t) ? x : w), angular[0]); return `${t} s ${a.w.toFixed(0)}`; }).join(', ')} deg/s`);
    // rule 9
    const gaps = rows.filter(r => r.gap != null), plantRows = rows.filter(r => r.plants);
    const gap = gaps.reduce((w, r) => (r.gap < w.gap ? r : w), gaps[0]), plant = plantRows.reduce((w, r) => (r.plants.gap < w.plants.gap ? r : w), plantRows[0]);
    say(`rule 9: the butterfly to her at least ${gap?.gap ?? '-'} m (at ${gap?.t} s); her to the plants at least ${plant?.plants.gap ?? '-'} m (${plant?.plants.what}, at ${plant?.t} s); under 0.5 m: ${gaps.filter(r => r.gap < 0.5).length} frames${gaps.filter(r => r.gap < 0.5).length ? ' at ' + runs(r => r.gap != null && r.gap < 0.5).map(x => `${x.a.toFixed(2)}-${x.b.toFixed(2)}`).join(', ') : ''}; her into a plant (gap < 0): ${plantRows.filter(r => r.plants.gap < 0).length} frames${plantRows.filter(r => r.plants.gap < 0).length ? ' at ' + runs(r => r.plants && r.plants.gap < 0).map(x => `${x.a.toFixed(2)}-${x.b.toFixed(2)}`).join(', ') : ''}`);
    // the butterfly's travels in the picture
    const us = bf.map(r => r.bfly?.[0]).filter(Number.isFinite), vs = bf.map(r => r.bfly?.[1]).filter(Number.isFinite);
    say(`the butterfly in the picture: u ${Math.min(...us).toFixed(2)}-${Math.max(...us).toFixed(2)}, v ${Math.min(...vs).toFixed(2)}-${Math.max(...vs).toFixed(2)}`);
    report.trials.fjor = rows.map(r => ({ t: r.t, cam: r.cam, white: r.white, her: r.her && { outNear: r.her.outNear, outFar: r.her.outFar, span: r.her.span, left: r.her.left, right: r.her.right }, butterfly: r.butterfly && { outNear: r.butterfly.outNear, at: r.bfly }, border: r.background.border, borderAt: r.background.borderAt, floor: r.background.groundBorder, gap: r.gap, plants: r.plants, herInfo: r.herInfo }));
    if (o.stills) for (const t of o.fjorStills ?? FJOR_STILLS) {
      await evaluate(`window.__world.flugedla3d.seek(${t})`);
      for (let i = 0; i < 3; i++) await evaluate('window.__advance(1 / 30)'); // (the valley shows its sections from the frame after a jump)
      await shoot(path.resolve(o.out, `${o.prefix ?? "fjor-g1"}-${t}s.png`));
    }
    if (o.bench) {
      for (const t of o.benchAt ?? [5.3, 12.0, 23.96, 27.52, 33.0, 35.13, 39.13, 43.13, 47.93, 52.13]) {
        await evaluate(`window.__world.flugedla3d.seek(${t})`);
        await evaluate('window.__advance(1 / 30)');
        const on = await evaluate('window.__benchmark(90)');
        report.bench['fjor-' + t] = on;
        say(`GPU with the glasses at ${t} s: ${on.gpuMs?.median} ms median (${on.msPerFrame.toFixed(1)} ms/frame, ${on.triangles} triangles, ${on.drawCalls} draw calls)`);
      }
    }
    if (errors.length) { report.errors.push(...errors); say(`page errors: ${errors.slice(0, 4).join(' | ')}`); }
  });
}

run(parseArgs(process.argv.slice(2))).catch(error => { console.error(error); process.exitCode = 1; });
