// The pond's numbers (chapters/tjorn3d.js): loads ?chapter=tjorn3d at each key and each screen shape in the headless browser the
// captures use and asks world.tjorn.measure(): the highest point over the surface and its parallax, the least distance to each
// edge of the page of everything standing over the surface (through both eye cameras), the deepest things and their parallax, the
// butterfly's clearance in key 6, the surface's own parallax (none), and how far what each eye sees of her picture on the screen
// is from what it would see of her there (nothing).
//
//   node remake/tools/tjorn3d-probe.mjs [--sizes 1280x800,1024x768] [--keys 1,2,3,4a,4b,4c,5,6] [--query "skjar=11"]
//                                       [--json qa/tjorn3d/numbers.json] [--eval "js, its value printed per key"]
//
//   node remake/tools/tjorn3d-probe.mjs --show [--sizes 1280x800] [--query "..."] [--json qa/tjorn3d/syning/timeline.json]
//                                              [--late 0.3 | --without-lines]
//
// --show walks the show itself (?chapter=tjorn3d&t=0, stepped on with window.__advance: every 0,25 s, every 0,05 s round the leap
// and through each of her lines, and every 0,125 s through the butterfly's flight) and asks world.tjorn.measureShow() at each step
// (chapters/tjorn3d/measure.js). A walk is a capture: her lines are not heard, and her mouth moves as it does when they are.
// The picture's reach on the table is in cm and the eyes are where the seat puts them whatever the screen, so one walk gives the
// margins of every screen setting: printed for 9,7 to 12,9 inches in both shapes (16:10 and 4:3), the least margin to each edge
// with its second and whose it is; then the highest point through the show, the clearances, anything inside her, and her mouth
// and the tip of her snout through each line and while the butterfly sits.
// --late <s>: her lines are handed to the scene so much later than the sheet says, as a voice heard that late has her mouth (the
// scene moves her mouth from the moment a line is heard, and a recording is heard a little after it is asked for). --without-lines:
// none is said, which is what the picture was before she spoke. The walk's moments are the same whichever is asked, so two walks
// can be laid side by side.
//
// Exit code 1 when the page throws or a measure breaks the geometry (the surface's parallax, the eyes' error); a key that does not
// keep its margin is a number, not a failure.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ROOT, sleep, launchBrowser, stopBrowser } from './veiddu-video.mjs';
import { CUES } from '../chapters/tjorn3d/sound.js';
import { BUTTERFLY_TIMES } from '../chapters/tjorn3d/show.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ktx2': 'image/ktx2', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

function parseArgs(argv) {
  const o = { sizes: null, keys: '1,2,3,4a,4b,4c,5,6', query: '', json: null, evalJs: '', timeout: 180, show: false, late: 0, mute: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => argv[++i];
    if (a === '--sizes') o.sizes = next();
    else if (a === '--keys') o.keys = next();
    else if (a === '--query') o.query = next();
    else if (a === '--json') o.json = next();
    else if (a === '--eval') o.evalJs = next();
    else if (a === '--timeout') o.timeout = Number(next());
    else if (a === '--show') o.show = true;
    else if (a === '--late') o.late = Number(next());
    else if (a === '--without-lines') o.mute = true;
    else throw new Error(`Unknown argument ${a}`);
  }
  o.sizes ??= o.show ? '1280x800' : '1280x800,1024x768';
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

/** Opens a page of the size in the headless browser and runs `fn({ send, evaluate, errors, load })` on it. */
async function withPage(o, size, fn) {
  const [W, H] = size.split('x').map(Number);
  let browser = null;
  for (let tries = 0; !browser; tries++) { // the browser now and then fails to start on a busy machine
    try { browser = await launchBrowser({ browser: 'edge', width: W, height: H }); } catch (e) { if (tries >= 2) throw e; await sleep(2000); }
  }
  const { cdp } = browser;
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
    /** Loads an address and waits until the page is drawn and `ready` (an expression) holds. */
    const load = async (url, ready) => {
      errors.length = 0;
      await send('Page.navigate', { url });
      const t0 = Date.now();
      for (;;) {
        let is = false;
        try { is = await evaluate(`Boolean(window.__demoReady && ${ready})`); } catch { /* loading */ }
        if (is) break;
        if (Date.now() - t0 > o.timeout * 1000) {
          let has = '';
          try { has = await evaluate('JSON.stringify({ drawn: Boolean(window.__demoReady), tjorn: Object.keys(window.__world?.tjorn ?? {}), advance: typeof window.__advance })'); } catch { /* nothing to say */ }
          throw new Error(`the page did not get ready${errors.length ? ': ' + errors[0] : ''} ${has}`);
        }
        await sleep(250);
      }
    };
    return await fn({ send, evaluate, errors, load });
  } finally {
    await stopBrowser(browser);
  }
}

async function probe(o, size, base) {
  const rows = [];
  await withPage(o, size, async ({ evaluate, errors, load }) => {
    for (const key of o.keys.split(',')) {
      await load(`${base}?chapter=tjorn3d&lykill=${key}&t=2${o.query ? '&' + o.query : ''}`, 'window.__world?.tjorn?.view.key');
      const row = await evaluate('window.__world.tjorn.measure()');
      // how long a new key takes to work out (the page stands still meanwhile)
      row.solveMs = await evaluate('(() => { const t = performance.now(); window.__world.tjorn.solve(); return Math.round(performance.now() - t); })()');
      if (o.evalJs) row.evaluated = await evaluate(o.evalJs);
      row.size = size;
      row.errors = [...errors];
      rows.push(row);
    }
  });
  return rows;
}

// ---- the show's timeline ----
const LENGTH = 62; // s (chapters/tjorn3d/show.js)
// her lines (the sheet's), each as long as lines.json says its recording is
const RECORDED = JSON.parse(fs.readFileSync(path.join(ROOT, 'remake/assets/audio/lines.json'), 'utf8'));
const SAID = CUES.filter(c => c.line !== undefined).map(c => ({ t: c.t, line: c.line, seconds: RECORDED[c.line]?.duration ?? 1.5 }));
const QUARTER = 0.25;
// from s, to s, ms a step: each line (from the quarter second before it to the one after its end and a second more: room for a
// line said late, and the walk's other moments stay where they were), the leap and the catch, the butterfly's flight
const FINE = [
  ...SAID.map(c => [Math.floor((c.t - 0.1) / QUARTER) * QUARTER, Math.ceil((c.t + c.seconds + 1) / QUARTER) * QUARTER, 50]),
  [42.5, 46, 50], [50, 58.5, 125],
];
const stepAt = ms => FINE.find(([from, to]) => ms >= from * 1000 && ms < to * 1000)?.[2] ?? 250;
const SCREENS = [9.7, 10, 10.5, 11, 12.9].flatMap(inches => [[16, 10], [4, 3]].map(([w, h]) => ({ inches, shape: `${w}:${h}`, W: (inches * 2.54 * w) / Math.hypot(w, h), Hs: (inches * 2.54 * h) / Math.hypot(w, h) })));
const DESIGN = [10, 10.5, 11]; // the owner's tablet is 10 to 11 inches: the rule must hold at these
const MARGIN = 0.04;

async function walk(o, size, base) {
  const rows = [];
  let errors = [];
  await withPage(o, size, async page => {
    await page.load(`${base}?chapter=tjorn3d&t=0${o.query ? '&' + o.query : ''}`, 'window.__advance'); // (the scene has not taken a step yet: the first one starts the show, and the first moment asked is the first step's)
    // her lines later, or not at all: the seconds of the page's own line cues are moved (the first is far from the show's start)
    const shift = o.mute ? 1000 : o.late;
    let shifted = !shift;
    for (let ms = 0; ms < LENGTH * 1000;) {
      const step = stepAt(ms);
      ms += step;
      rows.push(await page.evaluate(`(async () => { await window.__advance(${step / 1000}); return window.__world.tjorn.measureShow(); })()`));
      if (!shifted) {
        shifted = await page.evaluate(`(() => { const lines = window.__world.tjorn.lines; if (!lines || lines.log.length) return false; for (const cue of lines.lines) cue.t += ${shift}; return true; })()`);
        if (!shifted) throw new Error('the lines could not be moved');
      }
      if (ms % 5000 === 0) process.stderr.write(`  ${ms / 1000} s\n`);
    }
    errors = [...page.errors];
  });
  return { rows, errors };
}

/** The least margin to each edge over the rows, for a screen W x Hs cm: { left: { cm, share, t, of }, ... }. */
function leastMargins(rows, W, Hs) {
  const least = {};
  for (const r of rows) {
    for (const [of, b] of Object.entries(r.box)) {
      if (!b) continue;
      for (const [edge, cm, whole] of [['left', b.x0 + W / 2, W], ['right', W / 2 - b.x1, W], ['top', b.z0 + Hs / 2, Hs], ['bottom', Hs / 2 - b.z1, Hs]]) {
        if (!least[edge] || cm < least[edge].cm) least[edge] = { cm, share: cm / whole, t: r.t, of };
      }
    }
  }
  return least;
}

function reportShow(rows) {
  const f = (x, n = 2, w = 0) => (x === null || x === undefined ? '-' : x.toFixed(n)).padStart(w);
  console.log(`\n--- the least margin of everything standing over the surface, over the whole show (${rows.length} moments; her skin has ${Math.max(...rows.map(r => r.vertices))} points) ---`);
  console.log('screen            page cm          left                         right                        top                          bottom                       4 %');
  let fits = true;
  for (const s of SCREENS) {
    const m = leastMargins(rows, s.W, s.Hs);
    const ok = Object.values(m).every(e => e.share >= MARGIN - 1e-9);
    const design = DESIGN.includes(s.inches);
    if (design && !ok) fits = false;
    const cell = e => `${f(e.share * 100, 1, 5)} % ${f(e.cm, 2, 5)} cm ${f(e.t, 2, 5)} s ${e.of}`.padEnd(29);
    console.log(`${String(s.inches).padStart(4)}" ${s.shape.padEnd(5)} ${design ? '*' : ' '}  ${f(s.W, 2)} x ${f(s.Hs, 2)}    ${['left', 'right', 'top', 'bottom'].map(e => cell(m[e])).join('')}${ok ? 'holds' : 'NOT: ' + Object.entries(m).filter(([, e]) => e.share < MARGIN - 1e-9).map(([edge, e]) => `${edge} ${f((MARGIN * (edge === 'left' || edge === 'right' ? s.W : s.Hs)) - e.cm, 2)} cm short`).join(', ')}`);
  }
  console.log('(* the design range, 10 to 11 inches)');
  // who is nearest each edge at the tight setting, by who it is
  for (const s of SCREENS.filter(x => x.inches === 10)) {
    console.log(`\n--- 10" ${s.shape}: each one's own least margin (cm; the rule asks ${f(MARGIN * s.W, 2)} at the sides, ${f(MARGIN * s.Hs, 2)} at top and bottom) ---`);
    for (const of of ['her', 'held', 'fish', 'frog', 'butterfly', 'drops', 'lilies']) {
      const m = leastMargins(rows.map(r => ({ t: r.t, box: { [of]: r.box[of] } })), s.W, s.Hs);
      if (!m.left) continue;
      console.log(`  ${of.padEnd(10)} ${['left', 'right', 'top', 'bottom'].map(e => `${e} ${f(m[e].cm, 2, 5)} at ${f(m[e].t, 2, 5)} s`).join('   ')}`);
    }
  }
  console.log('\n--- the highest point over the surface, every two seconds and at each part\'s highest (cm, whose, parallax cm, % of a 10,5" 16:10 page\'s width) ---');
  const W105 = SCREENS.find(s => s.inches === 10.5 && s.shape === '16:10').W;
  const line = r => `${f(r.t, 2, 6)} s  ${(r.part ?? '').padEnd(10)} ${r.top ? `${f(r.top.cm, 2, 5)} cm  ${r.top.of.padEnd(9)} ${f(r.top.parallaxCm, 3)} cm  ${f((r.top.parallaxCm / W105) * 100, 2)} %` : 'nothing'}${r.her ? `   her head ${f(r.her.headCm, 2)} top ${f(r.her.topCm, 2)} root ${f(r.her.sinkCm, 2)} under` : ''}`;
  for (const r of rows) if (Math.abs(r.t / 2 - Math.round(r.t / 2)) < 1e-6) console.log(line(r));
  console.log('  highest of each part:');
  for (const part of [...new Set(rows.map(r => r.part))]) {
    const best = rows.filter(r => r.part === part && r.top).sort((a, b) => b.top.cm - a.top.cm)[0];
    if (best) console.log('  ' + line(best));
  }
  console.log('\n--- nothing through another (least over the show, cm, with its second) ---');
  const least = (pick, keep = () => true) => rows.filter(r => keep(r) && pick(r) !== null && pick(r) !== undefined).sort((a, b) => pick(a) - pick(b))[0];
  const say = (name, r, pick, more = '') => console.log(`  ${name.padEnd(46)} ${r ? `${f(pick(r), 3, 7)} cm at ${f(r.t, 2, 5)} s${more && r ? more(r) : ''}` : '   -'}`);
  say('the butterfly in the air, to her skin', least(r => r.clear.butterflyCm, r => r.butterfly.on === 'air'), r => r.clear.butterflyCm);
  say('the butterfly on her snout, to her skin', least(r => r.clear.butterflyCm, r => r.butterfly.on === 'snout'), r => r.clear.butterflyCm);
  say('  its lowest point over the skin under it', least(r => r.butterfly.sits?.leastOverSkinCm), r => r.butterfly.sits.leastOverSkinCm);
  say('the butterfly on its lily, to her skin', least(r => r.clear.butterflyCm, r => r.butterfly.on === 'lily'), r => r.clear.butterflyCm);
  say('the fish in the air, to her skin', least(r => r.clear.airFishCm), r => r.clear.airFishCm, r => `  (the tip of her snout ${f(r.tipToFishCm, 2)} cm from its middle)`);
  say('a fish under the water, to her skin', least(r => r.clear.fishCm), r => r.clear.fishCm, r => `  (${r.clear.fishOf === 'jumper' ? 'the leaping fish on its way up' : 'fish ' + r.clear.fishOf})`);
  say('where she cuts the surface, to a lily\'s pad', least(r => r.clear.padsCm), r => r.clear.padsCm);
  say('where the leaping fish cuts it, to a pad', least(r => r.clear.jumperPadsCm), r => r.clear.jumperPadsCm);
  say('fish to fish', least(r => r.clear.fishApartCm), r => r.clear.fishApartCm);
  const inside = rows.filter(r => r.clear.inside.length);
  console.log(inside.length ? `  INSIDE HER: ${inside.map(r => `${r.clear.inside.join('+')} at ${f(r.t, 2)} s`).join(', ')}` : '  no point of the butterfly or of a fish is inside her at any moment');
  const strikes = rows.filter(r => r.strike && r.strike.weight >= 0.999);
  if (strikes.length) {
    const worst = strikes.slice().sort((a, b) => b.strike.tipToTargetCm - a.strike.tipToTargetCm)[0];
    const taken = strikes.find(r => r.t >= 43.84) ?? worst;
    console.log(`  while the tip of her snout leads her head (${f(strikes[0].t, 2)} to ${f(strikes.at(-1).t, 2)} s) it is at most ${f(worst.strike.tipToTargetCm, 2)} cm from where it is put (at ${f(worst.t, 2)} s), ${f(taken.strike.tipToTargetCm, 2)} cm as her jaws shut (${f(taken.t, 2)} s)`);
  }
  const air = rows.filter(r => r.clear.airFishCm !== null && r.tipToFishCm !== null);
  if (air.length) console.log(`  the last moment the fish is its own (${f(air.at(-1).t, 2)} s): the tip of her snout ${f(air.at(-1).tipToFishCm, 2)} cm from its middle, her skin ${f(air.at(-1).clear.airFishCm, 2)} cm from it, her jaw open ${f(air.at(-1).her?.jaw, 0)} degrees`);
  const hold = rows.filter(r => r.t >= 36.4 && r.t <= 42 && r.her);
  if (hold.length) console.log(`\n--- the hold (36,4 to 42 s): her head between ${f(Math.min(...hold.map(r => r.her.headCm)), 2)} and ${f(Math.max(...hold.map(r => r.her.headCm)), 2)} cm over the table ---`);
  // her lines: her mouth and the tip of her snout through each (a line's seconds are its recording's, its silent end too)
  const far = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const most = (list, pick) => list.reduce((best, r) => (best === null || pick(r) > pick(best) ? r : best), null);
  console.log(`\n--- her lines${o.mute ? ', NOT SAID in this walk (the picture without them, at the seconds the sheet has them)' : o.late ? `, each handed to the scene ${o.late} s LATER than the sheet says (a voice heard that late)` : ''}: her mouth (how open her speaking has it, 0 to 1; her jaw in degrees from shut, whatever opened it) and the tip of her snout ---`);
  for (const said of SAID.map(c => ({ ...c, t: Math.round((c.t + (o.mute ? 0 : o.late)) * 1000) / 1000 }))) {
    const mine = rows.filter(r => r.her && r.t >= said.t - 1e-6 && r.t <= said.t + said.seconds + 1e-6);
    if (!mine.length) { console.log(`  ${said.line.padEnd(20)} at ${f(said.t, 2, 5)} s: she is not there`); continue; }
    const before = rows.filter(r => r.her && r.t < said.t - 1e-6).at(-1) ?? mine[0];
    const open = most(mine, r => r.her.mouth ?? 0), wide = most(mine, r => r.her.jawDeg ?? 0);
    const spoke = mine.filter(r => r.her.speaking);
    const moved = most(mine, r => far(r.her.tip, before.her.tip));
    const low = mine.reduce((a, r) => (r.her.mouthCm < a.her.mouthCm ? r : a));
    const chin = mine.reduce((a, r) => (r.her.headLowCm - r.her.mouthCm < a.her.headLowCm - a.her.mouthCm ? r : a));
    const near = mine.filter(r => r.clear.butterflyCm !== null).sort((a, b) => a.clear.butterflyCm - b.clear.butterflyCm)[0];
    console.log(`  ${said.line.padEnd(20)} ${f(said.t, 2, 5)} to ${f(said.t + said.seconds, 2, 5)} s (${mine.length} moments, speaking in ${spoke.length}${spoke.length ? `: ${f(spoke[0].t, 2)} to ${f(spoke.at(-1).t, 2)} s` : ''})`);
    console.log(`      her mouth opens to ${f(open.her.mouth, 2)} at most (at ${f(open.t, 2)} s), her jaw to ${f(wide.her.jawDeg, 1)} degrees (at ${f(wide.t, 2)} s; the timeline's own jaw ${f(Math.max(...mine.map(r => r.her.jaw)), 1)}); just before the line it was ${f(before.her.jawDeg, 1)} degrees, in its first moment ${f(mine[0].her.jawDeg, 1)}`);
    console.log(`      the tip of her snout is at most ${f(far(moved.her.tip, before.her.tip), 3)} cm from where it was just before the line (at ${f(moved.t, 2)} s); her mouth is ${f(low.her.mouthCm, 2)} cm over the water at its lowest (at ${f(low.t, 2)} s), ${f(mine.at(-1).her.mouthCm, 2)} cm at the line's end; the lowest point of her head and jaw is ${f(chin.her.mouthCm - chin.her.headLowCm, 2)} cm under her mouth at most (at ${f(chin.t, 2)} s, ${f(chin.her.headLowCm, 2)} cm over the water then; ${f(before.her.mouthCm - before.her.headLowCm, 2)} just before the line)${near ? `; the butterfly (${near.butterfly.on}) is ${f(near.clear.butterflyCm, 3)} cm from her skin at its nearest (at ${f(near.t, 2)} s)` : ''}`);
  }
  const sits = rows.filter(r => r.her && r.butterfly.on === 'snout');
  if (sits.length) {
    const from = sits[0];
    const moved = most(sits, r => far(r.her.tip, from.her.tip));
    let step = null;
    for (let i = 1; i < sits.length; i++) { const d = far(sits[i].her.tip, sits[i - 1].her.tip) / (sits[i].t - sits[i - 1].t); if (!step || d > step.d) step = { d, t: sits[i].t }; }
    const down = most(sits, r => from.her.tip[1] - r.her.tip[1]), up = most(sits, r => r.her.tip[1] - from.her.tip[1]);
    console.log(`\n--- while the butterfly sits on her snout (${f(BUTTERFLY_TIMES.land, 1)} to ${f(BUTTERFLY_TIMES.off, 1)} s; ${sits.length} moments from ${f(from.t, 2)} s) ---`);
    console.log(`  the tip of her snout is at most ${f(far(moved.her.tip, from.her.tip), 3)} cm from where it was as it landed (at ${f(moved.t, 2)} s): ${f(from.her.tip[1] - down.her.tip[1], 3)} cm lower at most (at ${f(down.t, 2)} s), ${f(up.her.tip[1] - from.her.tip[1], 3)} cm higher at most (at ${f(up.t, 2)} s); its greatest speed ${f(step?.d, 2)} cm/s (at ${f(step?.t, 2)} s)`);
    console.log(`  her jaw is open ${f(Math.max(...sits.map(r => r.her.jawDeg ?? 0)), 1)} degrees at most; the butterfly's nearest point to her skin ${f(Math.min(...sits.map(r => r.clear.butterflyCm)), 3)} cm, its lowest point over the skin under it ${f(Math.min(...sits.map(r => r.butterfly.sits?.leastOverSkinCm ?? Infinity)), 3)} cm`);
  }
  console.log(`drops in the air at most: ${Math.max(...rows.map(r => r.drops))} (at ${f(rows.slice().sort((a, b) => b.drops - a.drops)[0].t, 2)} s)`);
  return fits;
}

const o = parseArgs(process.argv.slice(2));
const server = await startServer();
const base = `http://127.0.0.1:${server.address().port}/remake/index.html`;
const all = [];
let bad = 0;
const f = (x, n = 2, w = 0) => (x === null || x === undefined ? '-' : x.toFixed(n)).padStart(w);
try {
  for (const size of o.show ? o.sizes.split(',') : []) {
    const { rows, errors } = await walk(o, size, base);
    all.push(...rows.map(r => ({ ...r, size })));
    console.log(`\n=== the show, walked on a ${size} page ===`);
    reportShow(rows);
    if (errors.length) { bad++; console.log(`ERRORS: ${errors.join(' | ')}`); }
  }
  for (const size of o.show ? [] : o.sizes.split(',')) {
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
      if (r.butterfly) console.log(`      butterfly (wings ${r.butterfly.spanCm} cm across): the least height of any point of it over the skin under it ${f(r.butterfly.leastOverSkinCm, 3)} cm, its nearest point to her skin ${f(r.butterfly.leastToSkinCm, 3)} cm, its lowest point ${f(r.butterfly.feetOverPerchCm, 3)} cm over the place it stands on`);
      if (r.clear) console.log(`      nothing through another: the nearest fish under the water is ${f(r.clear.fishCm)} cm from her skin${r.clear.jumperCm === null ? '' : `, the fish in the air ${f(r.clear.jumperCm)} cm`}`);
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
