#!/usr/bin/env node
// GPU cost of forest parts, robust to the noisy timer: variants are captured interleaved, several
// rounds, and the median of the per-round medians is reported.
//   node remake/tools/world/forest-profile.mjs --shot hero [--quality low] [--rounds 3]
//     [--variants "base=,grass=grass,trees=trees,ground=ground,shadows=shadows,all=grass,trees,ground,far,air"]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const shot = opt('shot', 'hero');
const quality = opt('quality', 'tablet');
const rounds = Number(opt('rounds', '3'));
const variants = opt('variants', 'base=;grass=grass;trees=trees;ground=ground;shadows=shadows;all=grass,trees,ground,far,air')
  .split(';').map(v => { const [name, off] = v.split('='); return { name, off: off || '' }; });
const out = path.join(os.tmpdir(), `forest-profile-${process.pid}`);
const results = Object.fromEntries(variants.map(v => [v.name, []]));
for (let r = 0; r < rounds; r++) {
  const shotArgs = variants.flatMap(v => ['--shot', `${v.name}=shot=${shot}&t=2&quality=${quality}${v.off ? `&forestOff=${v.off}` : ''}`]);
  spawnSync('node', ['remake/tools/capture.mjs', '--out', out, '--size', '1280x800', '--bench', '150', ...shotArgs], { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
  const rep = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8'));
  for (const s of rep.shots) if (s.bench?.gpuMs?.median != null) results[s.name].push(s.bench.gpuMs.median);
}
fs.rmSync(out, { recursive: true, force: true });
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const base = med(results.base || [0]);
console.log(`${shot} (${quality}), ${rounds} rounds, GPU median ms`);
for (const v of variants) {
  const m = med(results[v.name]);
  const delta = v.name === 'base' ? '' : `  -> hidden part costs ${(base - m).toFixed(2)} ms`;
  console.log(`${v.name.padEnd(8)} ${m.toFixed(2)}  [${results[v.name].map(x => x.toFixed(2)).join(' ')}]${delta}`);
}
