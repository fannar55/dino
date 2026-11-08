// The startle check in detail: the biggest rises of 400 ms loudness (RMS of the mono mix, from one window to the next 400 ms
// later) in the decoded mix.mp3, with the beat each lands on.  node remake/tools/kafli5-lag/remix-a/jumps.mjs [count]
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, SR } from './lib/io.mjs';
import { SPB } from './lib/score.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const [l, r] = decode(join(here, '../../../../qa/remake/kafli5/lag/remix/remix-a/mix.mp3'), 2);
const w = Math.round(0.4 * SR), hop = Math.round(w / 4);
const lv = [];
for (let s = 0; s + w <= l.length; s += hop) {
  let a = 0;
  for (let i = s; i < s + w; i++) a += ((l[i] + r[i]) / 2) ** 2;
  lv.push(10 * Math.log10(a / w + 1e-12));
}
const jumps = [];
for (let i = 4; i < lv.length; i++) if (lv[i] > -40) jumps.push({ db: lv[i] - lv[i - 4], sec: (i * hop) / SR, from: lv[i - 4], to: lv[i] });
jumps.sort((a, b) => b.db - a.db);
const out = [];
for (const j of jumps) {
  if (out.some(o => Math.abs(o.sec - j.sec) < 1)) continue;
  out.push(j);
  if (out.length >= Number(process.argv[2] ?? 10)) break;
}
for (const j of out) console.log(`${j.db.toFixed(1)} dB at ${j.sec.toFixed(2)} s (beat ${((j.sec * SR) / SPB).toFixed(1)}): ${j.from.toFixed(1)} -> ${j.to.toFixed(1)}`);
