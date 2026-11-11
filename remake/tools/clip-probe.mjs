// The clip probe for Fiðrildadansinn (chapters/fidrildi3d.js, round 5): plays the whole show in fixed steps in the headless browser
// the captures use and asks, every step, whether a butterfly is inside Mosi or Þórseðla (or the friends further back), and how near
// its wings come to them (engine/clip-probe.js reads the posed body meshes, not the shells the flights keep out of). It exits with 1
// if any butterfly centre is inside a body, or any wing is nearer a body than --clearance while it is not in a meant contact (the
// moth on Mosi's horn, the four sitting on Þórseðla's head, the moth's last settle).
//
//   node remake/tools/clip-probe.mjs [--step 0.0333] [--from 0] [--to 60] [--clearance 0.02] [--json out.json] [--query "gler=0"]
//                                    [--bodies mosi,thorsedla,sloedla,kambedla] [--browser edge|chrome]
//   node remake/tools/clip-probe.mjs --trees [--from 20] [--to 44] [--tolerance 0.02] [--size WxH] [--json out.json]
//
// --trees (round 6) asks instead whether Þórseðla passes through a tree as she walks in: her shell's capsules against the plants
// near her path, each fitted from its model's geometry as stacked discs (engine/tree-probe.js); it exits with 1 if any capsule
// reaches more than --tolerance into a plant at any step, and lists each plant she touches (where, when, how deep, which bone).
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

// the screen shapes the show must hold at: an iPad's 4:3, 16:10, 16:9 and a wide phone (about 19.5:9)
const SHAPES = ['1024x768', '1280x800', '1280x720', '1170x540'];

function parseArgs(argv) {
  const given = new Set(argv);
  const o = { step: 1 / 30, from: 0, to: 60, clearance: 0.02, json: null, query: 'gler=0', bodies: 'mosi,thorsedla,sloedla,kambedla', browser: 'edge', timeout: 180, size: '960x600', quality: 'tablet', trace: null, eval: null, jump: 0.3, maxPush: 0.15, maxPushStep: 0.03, trees: false, tolerance: 0.02 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--step') o.step = Number(next());
    else if (a === '--trees') o.trees = true; // Þórseðla's walk against the trees (engine/tree-probe.js), not the butterflies
    else if (a === '--tolerance') o.tolerance = Number(next()); // --trees: how far a capsule may reach into a plant's discs (metres)
    else if (a === '--from') o.from = Number(next());
    else if (a === '--to') o.to = Number(next());
    else if (a === '--clearance') o.clearance = Number(next());
    else if (a === '--json') o.json = next();
    else if (a === '--query') o.query = next();
    else if (a === '--bodies') o.bodies = next();
    else if (a === '--browser') o.browser = next();
    else if (a === '--quality') o.quality = next(); // the page's quality (none: the page's own choice)
    else if (a === '--size') o.size = next(); // the page's size WxH (the screen's shape)
    else if (a === '--sizes') o.size = next() === 'all' ? SHAPES.join(',') : argv[i]; // several, one after the other, each with its table ('all': SHAPES)
    else if (a === '--max-push') o.maxPush = Number(next()); // fail over this push (flown less drawn, metres) outside meant contact
    else if (a === '--max-push-step') o.maxPushStep = Number(next()); // fail over this change of the push in one step (metres)
    else if (a === '--jump') o.jump = Number(next()); // list every move of one butterfly in one step longer than this (metres)
    else if (a === '--eval') o.eval = next(); // an expression to run in the page at the end (to look into one moment), its value printed
    else if (a === '--trace') o.trace = next(); // print one butterfly's place and where it was drawn (state.drawn) every step
    else throw new Error(`unknown argument ${a}`);
  }
  if (o.trees && !given.has('--from')) o.from = 20;
  if (o.trees && !given.has('--to')) o.to = 44;
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
  window.__clip = { probe, points, steps: [], names, last: {}, lastDrawn: {}, detour: {}, jump: { d: 0, name: null, t: null }, jumps: {}, big: [], lastPush: {}, push: {}, pushStep: {}, moves: {} };
  return names;
})()`;

// --trees: the plants within 9 m of her path, fitted once; her shell's capsules against them every step
const TREE_SETUP = `(async () => {
  const { createTreeProbe } = await import('/remake/engine/tree-probe.js');
  const w = window.__world, st = w.dans.state;
  const path = st.thorPath;
  const near = (x, z) => {
    for (let i = 0; i + 1 < path.length; i++) {
      const [ax, az] = path[i], [bx, bz] = path[i + 1];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < 9) return true;
    }
    return false;
  };
  const probe = createTreeProbe(w.forest.placements, { near });
  window.__trees = { probe, shell: w.dans.shellOf('thorsedla'), steps: [], hits: {} };
  return probe.plants.length;
})()`;
const TREE_STEP = (n, step, tolerance) => `(async () => {
  const c = window.__trees, st = window.__world.dans.state;
  for (let i = 0; i < ${n}; i++) {
    await window.__advance(${step}, ${step});
    const found = c.probe.look(c.shell.place()).filter(f => f.depth > ${tolerance});
    c.steps.push({ t: +st.time.toFixed(3), n: found.length });
    for (const f of found) {
      const h = (c.hits[f.plant] ??= { name: f.name, x: f.x, z: f.z, from: st.time, to: st.time, depth: 0, steps: 0 });
      h.to = st.time; h.steps++;
      if (f.depth > h.depth) Object.assign(h, { depth: f.depth, at: st.time, y: f.y, where: f.at, bone: f.bone });
    }
  }
  return st.time;
})()`;

const STEP = (n, step, trace, jump) => `(async () => {
  const c = window.__clip, st = window.__world.dans.state;
  for (let i = 0; i < ${n}; i++) {
    await window.__advance(${step}, ${step});
    const pts = c.points();
    for (const q of pts) {
      const last = c.last[q.name];
      if (last) {
        // the push's own share of the move: how far it went less how far it was drawn to go (a fast flight is not a jump)
        const dr = st.drawn?.[q.name], lastDr = c.lastDrawn[q.name];
        const d = dr && lastDr
          ? Math.hypot(q.p[0] - last[0] - (dr[0] - lastDr[0]), q.p[1] - last[1] - (dr[1] - lastDr[1]), q.p[2] - last[2] - (dr[2] - lastDr[2]))
          : Math.hypot(q.p[0] - last[0], q.p[1] - last[1], q.p[2] - last[2]);
        if (dr && lastDr && d > c.jump.d) c.jump = { d, name: q.name, t: st.time }; // only drawn flights: a landing is the butterflies' own
        if (dr && lastDr && d > (c.jumps[q.name]?.d ?? 0)) c.jumps[q.name] = { d, t: st.time };
        // every move past --jump, with where it was drawn (state.drawn) in the frame, to find the flights to draw again
        if (d > ${jump} && dr && lastDr) { const dr = st.drawn?.[q.name]; c.big.push([q.name, +st.time.toFixed(2), +d.toFixed(2), dr ? window.__world.dans.frameOf(new window.__world.THREE.Vector3(...dr)).map(x => +x.toFixed(2)) : null]); }
      }
      const drawnNow = st.drawn?.[q.name];
      // the push (flown less drawn) and its change in one step, outside meant contact; and the plain move of each group
      const group = q.name === 'hero' ? 'hero' : q.name.startsWith('moth') ? 'moths' : 'swarm';
      if (last) {
        const mv = Math.hypot(q.p[0] - last[0], q.p[1] - last[1], q.p[2] - last[2]);
        if (mv > (c.moves[group]?.d ?? 0)) c.moves[group] = { d: mv, t: st.time, name: q.name };
      }
      const pv = drawnNow && !q.contact ? [q.p[0] - drawnNow[0], q.p[1] - drawnNow[1], q.p[2] - drawnNow[2]] : null;
      if (pv) {
        const m = Math.hypot(...pv);
        if (m > (c.push[q.name]?.d ?? -1)) c.push[q.name] = { d: m, t: st.time };
        const lp = c.lastPush[q.name];
        if (lp) {
          const dm = Math.hypot(pv[0] - lp[0], pv[1] - lp[1], pv[2] - lp[2]);
          if (dm > (c.pushStep[q.name]?.d ?? -1)) c.pushStep[q.name] = { d: dm, t: st.time };
        }
      }
      c.lastPush[q.name] = pv;
      if (drawnNow) {
        // how far the shells moved it from where it was drawn (the detour), at most
        const off = Math.hypot(q.p[0] - drawnNow[0], q.p[1] - drawnNow[1], q.p[2] - drawnNow[2]);
        if (off > (c.detour[q.name]?.d ?? 0)) c.detour[q.name] = { d: off, t: st.time };
      }
      c.last[q.name] = q.p.slice();
      c.lastDrawn[q.name] = st.drawn?.[q.name]?.slice() ?? null;
    }
    const tr = pts.find(q => q.name === ${JSON.stringify(trace)});
    if (tr) { (c.trace ??= []).push([+st.time.toFixed(3), tr.p.map(x => +x.toFixed(3)), st.drawn?.[tr.name]?.map(x => +x.toFixed(3)) ?? null]); }
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
  table.big = c.big;
  table.detours = Object.entries(c.detour).sort((a, b) => b[1].d - a[1].d).map(([name, j]) => name + ' ' + j.d.toFixed(2) + ' m at ' + j.t.toFixed(2) + ' s');
  table.pushes = Object.keys(c.push).map(name => ({ name, push: +c.push[name].d.toFixed(3), pushAt: +c.push[name].t.toFixed(2),
    step: c.pushStep[name] ? +c.pushStep[name].d.toFixed(4) : 0, stepAt: c.pushStep[name] ? +c.pushStep[name].t.toFixed(2) : null }));
  table.moves = Object.fromEntries(Object.entries(c.moves).map(([g, m]) => [g, { metres: +m.d.toFixed(3), name: m.name, t: +m.t.toFixed(2) }]));
  table.jumps = Object.entries(c.jumps).sort((a, b) => b[1].d - a[1].d).slice(0, 8).map(([name, j]) => name + ' ' + j.d.toFixed(3) + ' m at ' + j.t.toFixed(2) + ' s');
  return table;
})()`;

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const sizes = o.size.split(',');
  const results = [];
  for (const size of sizes) {
    if (sizes.length > 1) console.log(`
=== ${size} ===`);
    const json = o.json && sizes.length > 1 ? o.json.replace(/(.json)?$/, `-${size}.json`) : o.json;
    results.push([size, await probe({ ...o, size, json })]);
  }
  if (sizes.length > 1) console.log(`
${results.map(([sz, f]) => `${sz} ${f ? 'FAIL' : 'OK'}`).join('; ')}`);
  process.exit(results.some(([, f]) => f) ? 1 : 0);
}

async function probe(o) {
  if (o.trees) return treeProbe(o);
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}/remake/index.html`;
  const [W, H] = o.size.split('x').map(Number);
  const browser = await launchBrowser({ browser: o.browser, width: W, height: H });
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
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const from = Math.max(0.001, o.from);
    await send('Page.navigate', { url: `${base}?chapter=fidrildi3d${o.quality && o.quality !== "none" ? "&quality=" + o.quality : ""}&t=${from}${o.query ? '&' + o.query : ''}` });
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
      const t = await evaluate(STEP(Math.min(chunk, total - done), o.step, o.trace, o.jump));
      if (Math.round(t) % 10 === 0) process.stdout.write(`  ${t.toFixed(1)} s (${((Date.now() - started) / 1000).toFixed(0)} s)\n`);
    }
    if (o.trace) for (const row of await evaluate('window.__clip.trace || []')) console.log(JSON.stringify(row));
    if (o.eval) console.log(JSON.stringify(await evaluate(o.eval), null, 1));
    const table = await evaluate(TABLE(o.step, o.clearance));
    if (errors.length) table.pageErrors = errors.slice(0, 5);
    console.log(`seconds with a centre inside a body: ${table.secondsInside}`);
    console.log(`  by 5 s: ${JSON.stringify(table.insideBy5s)}`);
    console.log(`passing through (all butterflies): ${JSON.stringify(table.through)}; of the swarm: ${JSON.stringify(table.swarmThrough)}`);
    console.log(`worst moment: ${table.worst.count} inside at ${table.worst.t} s`);
    console.log(`smallest wing clearance (not in contact): ${table.tightest.clearance} m, ${table.tightest.name} at ${table.tightest.t} s by ${table.tightest.body}; steps under ${o.clearance} m: ${table.closeSteps}`);
    console.log(`largest jump of a butterfly in one step (its move less the drawn one): ${table.jump.metres} m, ${table.jump.name} at ${table.jump.t} s`);
    console.log(`  the largest of each (top 8): ${table.jumps.join('; ')}`);
    console.log(`the largest detours (how far the shells took each from its drawn place): ${table.detours.slice(0, 12).join('; ')}`);
    console.log(`jumps longer than ${o.jump} m in one step: ${table.big.length}`);
    for (const b of table.big) console.log(`  ${b[0]} at ${b[1]} s: ${b[2]} m, drawn at (u, v, k) ${b[3]}`);
    console.log(`the push (flown less drawn) per butterfly, outside meant contact (limits ${o.maxPush} m, ${o.maxPushStep} m a step):`);
    const order = n => (n === 'hero' ? 0 : n.startsWith('moth') ? 1 : 2) * 100 + (parseInt(n.replace(/D/g, '')) || 0);
    for (const r of table.pushes.sort((a, b) => order(a.name) - order(b.name))) {
      const bad = (r.push > o.maxPush ? ' PUSH' : '') + (r.step > o.maxPushStep ? ' STEP' : '');
      console.log(`  ${r.name.padEnd(7)} largest push ${r.push.toFixed(3)} m at ${r.pushAt} s; largest change in one step ${r.step.toFixed(4)} m at ${r.stepAt} s${bad}`);
    }
    for (const [g, m] of Object.entries(table.moves)) console.log(`largest plain move in one step, ${g}: ${m.metres} m (${m.name} at ${m.t} s)`);
    table.pushFailures = table.pushes.filter(r => r.push > o.maxPush || r.step > o.maxPushStep).map(r => r.name);
    for (const [k, v] of Object.entries(table.spans)) console.log(`  ${k}: ${v.join(', ')}`);
    if (o.json) await fsp.writeFile(path.resolve(o.json), JSON.stringify(table, null, 2));
    failed = table.secondsInside > 0 || table.closeSteps > 0 || table.pushFailures.length > 0;
    if (table.pushFailures.length) console.log(`pushed too far or too fast: ${table.pushFailures.join(', ')}`);
    console.log(failed ? 'FAIL' : 'OK: no butterfly inside, no wing nearer a body than the clearance');
  } finally {
    await stopBrowser(browser).catch(() => {});
    server.close();
  }
  return failed;
}

// --trees: her walk against the trees
async function treeProbe(o) {
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}/remake/index.html`;
  const [W, H] = o.size.split('x').map(Number);
  const browser = await launchBrowser({ browser: o.browser, width: W, height: H });
  const { cdp } = browser;
  let failed = true;
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const send = (m, p) => cdp.send(m, p, sessionId);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    await send('Page.navigate', { url: `${base}?chapter=fidrildi3d${o.quality && o.quality !== 'none' ? '&quality=' + o.quality : ''}&t=${Math.max(0.001, o.from)}${o.query ? '&' + o.query : ''}` });
    const t0 = Date.now();
    for (;;) {
      let ready = false;
      try { ready = await evaluate('Boolean(window.__demoReady && window.__advance && window.__world?.dans && window.__world.forest?.placements)'); } catch { /* loading */ }
      if (ready) break;
      if (Date.now() - t0 > o.timeout * 1000) throw new Error('the page did not get ready');
      await sleep(250);
    }
    const plants = await evaluate(TREE_SETUP);
    console.log(`tree probe: Þórseðla's shell against ${plants} plants within 9 m of her path; ${o.from}-${o.to} s in steps of ${o.step.toFixed(4)} s, tolerance ${o.tolerance} m`);
    const total = Math.round((o.to - Math.max(0.001, o.from)) / o.step);
    const chunk = Math.max(1, Math.round(1 / o.step));
    for (let done = 0; done < total; done += chunk) await evaluate(TREE_STEP(Math.min(chunk, total - done), o.step, o.tolerance));
    const r = await evaluate(`(() => { const c = window.__trees; return { steps: c.steps.length, bad: c.steps.filter(s => s.n > 0).length, hits: Object.entries(c.hits).map(([i, h]) => ({ plant: +i, ...h })) }; })()`);
    console.log(`steps with her inside a plant: ${r.bad} of ${r.steps} (${(r.bad * o.step).toFixed(2)} s)`);
    for (const h of r.hits.sort((a, b) => a.from - b.from)) console.log(`  plant ${h.plant} ${h.name} at (${h.x}, ${h.z}): ${h.from.toFixed(2)}-${h.to.toFixed(2)} s, ${h.steps} steps, deepest ${h.depth.toFixed(2)} m at ${h.at.toFixed(2)} s (${h.bone}, ${h.y} m up at x, z ${h.where})`);
    if (o.json) await fsp.writeFile(path.resolve(o.json), JSON.stringify(r, null, 2));
    failed = r.bad > 0;
    console.log(failed ? 'FAIL' : 'OK: she passes through no plant');
  } finally {
    await stopBrowser(browser).catch(() => {});
    server.close();
  }
  return failed;
}

main().catch(e => { console.error(e); process.exit(2); });
