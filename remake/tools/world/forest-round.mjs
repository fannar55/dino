#!/usr/bin/env node
// One review round for the forest: captures the eight review shots (tablet, with the GPU bench),
// the actor masks, the figure-ground check and a contact sheet; optionally the low preset and the
// golden and evening looks. Prints one summary table.
//   node remake/tools/world/forest-round.mjs --out qa/remake/shots/forest-r5 [--bench 120] [--low] [--looks] [--scene] [--no-mask] [--split]
// --split also measures every shot with split-eval.js: whole frame, shadow pass, main pass and the
// forest's share of the main pass (three r180 counts the shadow pass once info.autoReset is off).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const has = n => args.includes(`--${n}`);
const out = opt('out', 'qa/remake/shots/forest-latest');
const bench = opt('bench', '120');
const SHOTS = ['hero', 'wide', 'low', 'path', 'canopy', 'rim', 'inside', 'face'];
// frames of the played scene: opening, tracking, introduction, the canopy pan (t=39 to 47), the face move (to t=57)
const SCENE = has('scene') ? ['t4', 't12', 't25', 't38', 't43', 't47', 't55', 't58'] : [];
const shotArgs = (extra = '') => [
  ...SHOTS.flatMap(s => ['--shot', `${s}=shot=${s}&t=2${extra}`]),
  ...SCENE.flatMap(s => ['--shot', `${s}=t=${s.slice(1)}${extra}`]),
];

function capture(dir, extra, { benchFrames = bench, evalFile = null } = {}) {
  const a = ['remake/tools/capture.mjs', '--out', dir, '--size', '1280x800', ...shotArgs(extra)];
  if (benchFrames && benchFrames !== '0') a.push('--bench', benchFrames);
  if (evalFile) a.push('--eval', fs.readFileSync(path.join(ROOT, evalFile), 'utf8'));
  // one retry: the browser launch now and then trips over a locked DevToolsActivePort file
  let r = spawnSync('node', a, { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
  if (r.status !== 0 || !fs.existsSync(path.join(ROOT, dir, 'report.json'))) {
    console.log('capture failed, retrying once:', (r.stderr || '').split(/\r?\n/).find(l => /Error/.test(l)) || r.status);
    r = spawnSync('node', a, { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
  }
  if (r.status !== 0) console.log(r.stdout, r.stderr);
  return JSON.parse(fs.readFileSync(path.join(ROOT, dir, 'report.json'), 'utf8'));
}
function splitTable(label, report) {
  console.log(`
${label}`);
  console.log('shot     frame calls / tris   shadow calls / tris   main calls / tris   forest incl. casters   forest main only');
  const f = o => `${String(o.calls).padStart(3)} / ${String(o.tris).padStart(7)}`;
  for (const s of report.shots) {
    const e = (s.errors || []).find(x => x.text.startsWith('split '));
    if (!e) { console.log(`${s.name.padEnd(8)} no split`); continue; }
    const j = JSON.parse(e.text.slice(6));
    console.log(`${s.name.padEnd(8)} ${f(j.frame)}        ${f(j.shadowPass)}         ${f(j.mainPass)}       ${j.forest ? f(j.forest) : "-"}      ${f(j.forestMain)}`);
  }
}
function table(label, report) {
  console.log(`\n${label}`);
  console.log('shot     gpu ms   calls   tris     errors');
  for (const s of report.shots) {
    const b = s.bench || {};
    const errs = (s.errors || []).filter(e => !/favicon/.test(e.text)).length;
    console.log(`${s.name.padEnd(8)} ${String(b.gpuMs?.median ?? '-').padStart(6)}   ${String(b.drawCalls ?? s.stats?.drawCalls ?? '-').padStart(5)}   ${String(b.triangles ?? s.stats?.triangles ?? '-').padStart(6)}   ${errs}`);
  }
}

// --no-tablet: keep an existing tablet capture and mask (to finish a round that stopped half-way)
if (!has('no-tablet')) {
  const tablet = capture(out, '');
  table(`tablet  (${out})`, tablet);
  spawnSync('node', ['remake/tools/world/montage.mjs', out, '4', '640'], { cwd: ROOT, stdio: 'inherit' });
}
if (!has('no-mask') && !has('no-tablet')) {
  const maskDir = `${out}/mask`;
  capture(maskDir, '', { benchFrames: '0', evalFile: 'remake/tools/world/mask-eval.js' });
  console.log('\nfigure-ground (share of the outline with >= 25 % luminance difference)');
  spawnSync('node', ['remake/tools/world/figure-ground.mjs', out, maskDir, '--out', `${out}/mask`], { cwd: ROOT, stdio: 'inherit' });
}
if (has('split')) splitTable('tablet split (shadow pass counted)', capture(`${out}/split`, '', { benchFrames: '0', evalFile: 'remake/tools/world/split-eval.js' }));
if (has('low')) {
  const lowDir = `${out}/low`;
  table(`low  (${lowDir})`, capture(lowDir, '&quality=low'));
  spawnSync('node', ['remake/tools/world/montage.mjs', lowDir, '4', '640'], { cwd: ROOT, stdio: 'inherit' });
  if (has('split')) splitTable('low split (shadow pass counted)', capture(`${lowDir}/split`, '&quality=low', { benchFrames: '0', evalFile: 'remake/tools/world/split-eval.js' }));
}
if (has('looks')) {
  for (const look of ['golden', 'evening']) {
    const dir = `${out}/${look}`;
    table(`${look}  (${dir})`, capture(dir, `&look=${look}`, { benchFrames: '0' }));
    spawnSync('node', ['remake/tools/world/montage.mjs', dir, '4', '640'], { cwd: ROOT, stdio: 'inherit' });
  }
}
