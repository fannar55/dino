// The clip probe for Fiðrildadansinn (chapters/fidrildi3d.js, round 5): plays the whole show in fixed steps in the headless browser
// the captures use and asks, every step, whether a butterfly is inside Mosi or Þórseðla (or the friends further back), and how near
// its wings come to them (engine/clip-probe.js reads the posed body meshes, not the shells the flights keep out of). It exits with 1
// if any butterfly centre is inside a body, or any wing is nearer a body than --clearance while it is not in a meant contact (the
// moth on Mosi's horn, the four sitting on Þórseðla's head, the moth's last settle).
//
//   node remake/tools/clip-probe.mjs [--step 0.0333] [--from 0] [--to 60] [--clearance 0.02] [--json out.json] [--query "gler=0"]
//                                    [--bodies mosi,thorsedla,sloedla,kambedla] [--browser edge|chrome]
//
// The page is opened at ?chapter=fidrildi3d&t=<from> (a silent seek that freezes), then main.js's window.__advance steps it on.
// A chapter that says which butterflies it has (world.dans.butterflies(): [{ name, p, wing, contact }]) is asked; an older one is
// read from the scene (the three moths by the hero's geometry, the swarm from world.dans.state.swarm), with its contacts by time.
import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ROOT, sleep, launchBrowser, stopBrowser } from './veiddu-video.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.hdr': 'application/octet-stream', '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream', '.mp3': 'audio/mpeg', '.wasm': 'application/wasm', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function parseArgs(argv) {
  const o = { step: 1 / 30, from: 0, to: 60, clearance: 0.02, json: null, query: 'gler=0', bodies: 'mosi,thorsedla,sloedla,kambedla', browser: 'edge', timeout: 180, trace: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--step') o.step = Number(next());
    else if (a === '--from') o.from = Number(next());
    else if (a === '--to') o.to = Number(next());
    else if (a === '--clearance') o.clearance = Number(next());
    else if (a === '--json') o.json = next();
    else if (a === '--query') o.query = next();
    else if (a === '--bodies') o.bodies = next();
    else if (a === '--browser') o.browser = next();
    else if (a === '--trace') o.trace = next(); // print one butterfly's place (and, for the swarm, where it was drawn) every step
    else throw new Error(`unknown argument ${a}`);
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

// In the page: the probe and the butterflies, once.
const SETUP = bodies => `(async () => {
  const { createClipProbe } = await import('/remake/engine/clip-probe.js');
  const w = window.__world;
  const names = ${JSON.stringify(bodies)}.filter(n => w.actors.has(n));
  const probe = createClipProbe(w, names);
  let points = w.dans.butterflies;
  if (!points) {
    // an older show: the three moths are the scene's meshes that share the hero's geometry, the swarm is in its state
    const st = w.dans.state, V = new w.THREE.Vector3();
    let heroMesh = null;
    w.forest.butterflies.hero.group.traverse(o => { if (o.isMesh && !heroMesh) heroMesh = o; });
    const moths = [];
    w.scene.traverse(o => { if (o.isMesh && o.geometry === heroMesh.geometry) moths.push(o); });
    heroMesh.geometry.computeBoundingSphere();
    const reach = o => heroMesh.geometry.boundingSphere.radius * o.getWorldScale(V).x;
    const sit = [0, 6, 12, 18];
    points = () => {
      const t = st.time, out = [];
      moths.forEach((o, i) => {
        o.getWorldPosition(V);
        const hero = o === heroMesh;
        out.push({ name: hero ? 'hero' : 'moth-' + i, p: V.toArray(), wing: reach(o), contact: hero && ((t >= 17.4 && t < 27) || t >= 55.2) });
      });
      (st.swarm || []).forEach((a, i) => {
        if (a[1] < -40) return;
        const s = sit.indexOf(i);
        out.push({ name: 's' + i, p: a, wing: 0.21, contact: s >= 0 && t >= 50.9 + 0.5 * s && t < 55.5 });
      });
      return out;
    };
  }
  window.__clip = { probe, points, steps: [], names, last: {}, jump: { d: 0, name: null, t: null }, jumps: {} };
  return names;
})()`;

const STEP = (n, step, trace) => `(async () => {
  const c = window.__clip, st = window.__world.dans.state;
  for (let i = 0; i < ${n}; i++) {
    await window.__advance(${step}, ${step});
    const pts = c.points();
    for (const q of pts) {
      const last = c.last[q.name];
      if (last) {
        const d = Math.hypot(q.p[0] - last[0], q.p[1] - last[1], q.p[2] - last[2]);
        if (d > c.jump.d) c.jump = { d, name: q.name, t: st.time };
        if (d > (c.jumps[q.name]?.d ?? 0)) c.jumps[q.name] = { d, t: st.time };
      }
      c.last[q.name] = q.p.slice();
    }
    const tr = pts.find(q => q.name === ${JSON.stringify(trace)});
    if (tr) { const i = /^s(\\d+)$/.exec(tr.name); (c.trace ??= []).push([+st.time.toFixed(3), tr.p.map(x => +x.toFixed(3)), i ? st.swarmDrawn[+i[1]]?.map(x => +x.toFixed(3)) : null]); }
    const found = c.probe.look(pts).filter(f => f.inside || f.clearance < 0.3);
    c.steps.push({ t: +st.time.toFixed(3), found });
  }
  return st.time;
})()`;

const TABLE = (step, clearance) => `(async () => {
  const { clipTable } = await import('/remake/engine/clip-probe.js');
  const c = window.__clip;
  const table = clipTable(c.steps, ${step}, { clearance: ${clearance} });
  const swarm = {};
  for (const s of c.steps) for (const f of s.found) if (f.inside && /^s\\d/.test(f.name)) (swarm[f.body] ??= new Set()).add(f.name);
  table.swarmThrough = Object.fromEntries(Object.entries(swarm).map(([k, v]) => [k, v.size]));
  const buckets = {};
  for (const s of c.steps) if (s.found.some(f => f.inside)) { const b = Math.floor(s.t / 5) * 5; buckets[b] = +((buckets[b] ?? 0) + ${step}).toFixed(3); }
  table.insideBy5s = buckets;
  table.steps = c.steps.length;
  table.jump = { metres: +c.jump.d.toFixed(4), name: c.jump.name, t: c.jump.t == null ? null : +c.jump.t.toFixed(3) };
  table.jumps = Object.entries(c.jumps).sort((a, b) => b[1].d - a[1].d).slice(0, 8).map(([name, j]) => name + ' ' + j.d.toFixed(3) + ' m at ' + j.t.toFixed(2) + ' s');
  return table;
})()`;

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}/remake/index.html`;
  const browser = await launchBrowser({ browser: o.browser, width: 960, height: 600 });
  const { cdp } = browser;
  let failed = true;
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
    await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 600, deviceScaleFactor: 1, mobile: false });
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const from = Math.max(0.001, o.from);
    await send('Page.navigate', { url: `${base}?chapter=fidrildi3d&quality=tablet&t=${from}${o.query ? '&' + o.query : ''}` });
    const t0 = Date.now();
    for (;;) {
      let ready = false;
      try { ready = await evaluate('Boolean(window.__demoReady && window.__advance && window.__world?.dans)'); } catch { /* loading */ }
      if (ready) break;
      if (Date.now() - t0 > o.timeout * 1000) throw new Error('the page did not get ready');
      await sleep(250);
    }
    const names = await evaluate(SETUP(o.bodies.split(',')));
    console.log(`clip probe: bodies ${names.join(', ')}; ${o.from}-${o.to} s in steps of ${o.step.toFixed(4)} s`);
    const total = Math.round((o.to - from) / o.step);
    const chunk = Math.max(1, Math.round(1 / o.step));
    const started = Date.now();
    for (let done = 0; done < total; done += chunk) {
      const t = await evaluate(STEP(Math.min(chunk, total - done), o.step, o.trace));
      if (Math.round(t) % 10 === 0) process.stdout.write(`  ${t.toFixed(1)} s (${((Date.now() - started) / 1000).toFixed(0)} s)\n`);
    }
    if (o.trace) for (const row of await evaluate('window.__clip.trace || []')) console.log(JSON.stringify(row));
    const table = await evaluate(TABLE(o.step, o.clearance));
    if (errors.length) table.pageErrors = errors.slice(0, 5);
    console.log(`seconds with a centre inside a body: ${table.secondsInside}`);
    console.log(`  by 5 s: ${JSON.stringify(table.insideBy5s)}`);
    console.log(`passing through (all butterflies): ${JSON.stringify(table.through)}; of the swarm: ${JSON.stringify(table.swarmThrough)}`);
    console.log(`worst moment: ${table.worst.count} inside at ${table.worst.t} s`);
    console.log(`smallest wing clearance (not in contact): ${table.tightest.clearance} m, ${table.tightest.name} at ${table.tightest.t} s by ${table.tightest.body}; steps under ${o.clearance} m: ${table.closeSteps}`);
    console.log(`largest move of a butterfly in one step: ${table.jump.metres} m, ${table.jump.name} at ${table.jump.t} s`);
    console.log(`  the largest of each (top 8): ${table.jumps.join('; ')}`);
    for (const [k, v] of Object.entries(table.spans)) console.log(`  ${k}: ${v.join(', ')}`);
    if (o.json) await fsp.writeFile(path.resolve(o.json), JSON.stringify(table, null, 2));
    failed = table.secondsInside > 0 || table.closeSteps > 0;
    console.log(failed ? 'FAIL' : 'OK: no butterfly inside, no wing nearer a body than the clearance');
  } finally {
    await stopBrowser(browser).catch(() => {});
    server.close();
  }
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
