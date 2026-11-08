// A look at a finished render: each stem's RMS per section, the animals' and her voice's share of the 1-5 kHz band, and per-bar RMS
// of the mix, so the balance and the shape can be read without ears.  node remake/tools/kafli5-lag/remix-c/look.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { decode } from './lib/io.mjs';
import { Biquad } from './lib/dsp.mjs';
import { SPB, SECTIONS } from './lib/score.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../../../../qa/remake/kafli5/lag/remix/remix-c');
const db = v => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');
const band = (x, lo, hi) => {
  const y = Float32Array.from(x);
  for (const f of [new Biquad('hp', lo, 0.7), new Biquad('hp', lo, 0.7), new Biquad('lp', hi, 0.7), new Biquad('lp', hi, 0.7)]) f.run(y);
  return y;
};
const rms = (x, a, b) => {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
};
const names = ['pad', 'bass', 'beat', 'lead', 'animals', 'dj'];
const st = {};
for (const k of names) {
  const [l, r] = decode(join(OUT, 'stems', `${k}.mp3`), 2);
  st[k] = l.map((v, i) => (v + r[i]) / 2);
}
const mid = {};
for (const k of names) mid[k] = band(st[k], 1000, 5000);
console.log('section'.padEnd(10), names.map(k => k.padStart(8)).join(''), '  | 1-5k:', names.map(k => k.padStart(8)).join(''));
for (const s of SECTIONS) {
  const a = Math.round(s.bar * 4 * SPB), b = Math.round((s.bar + s.bars) * 4 * SPB);
  console.log(s.id.padEnd(10), names.map(k => db(rms(st[k], a, b)).padStart(8)).join(''), '  |      ', names.map(k => db(rms(mid[k], a, b)).padStart(8)).join(''));
}
const checks = JSON.parse(readFileSync(join(OUT, 'checks.json'), 'utf8'));
console.log('bar RMS (mix):');
for (let i = 0; i < checks.barRms.length; i += 8) console.log(String(i).padStart(3), checks.barRms.slice(i, i + 8).map(v => String(v).padStart(6)).join(''));
console.log('bar RMS <150 Hz:');
for (let i = 0; i < checks.barRmsLow.length; i += 8) console.log(String(i).padStart(3), checks.barRmsLow.slice(i, i + 8).map(v => String(v).padStart(6)).join(''));
