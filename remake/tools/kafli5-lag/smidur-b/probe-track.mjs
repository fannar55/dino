// Pitch tracks of the takes over time (every 25 ms): Hz, aperiodicity and level, to find the steady, singing part of each call.
// node remake/tools/kafli5-lag/smidur-b/probe-track.mjs [file ...]
import { join } from 'node:path';
import { SR } from './dsp.mjs';
import { HLJOD, SOUNDS, decode, yin } from './samples.mjs';

const RANGE = { grazers: [80, 600], turtles: [60, 600], frogs: [300, 4000], lizards: [300, 4000], flyers: [500, 4000] };
const files = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SOUNDS.files).filter(f => SOUNDS.files[f].group);
for (const file of files) {
  const e = SOUNDS.files[file];
  const [fmin, fmax] = RANGE[e.group] ?? [60, 1000];
  const x = decode(join(HLJOD, file));
  let pk = 0;
  for (const v of x) pk = Math.max(pk, Math.abs(v));
  const rows = [];
  for (let i = 0; i + 2048 < x.length; i += Math.round(0.025 * SR)) {
    let s = 0;
    for (let k = 0; k < 1024; k++) s += x[i + k] * x[i + k];
    const db = 10 * Math.log10(s / 1024 / (pk * pk) + 1e-9);
    const r = yin(x, i, 1024, fmin, fmax, 0.2);
    rows.push(`${(i / SR).toFixed(3)}:${r.hz ? r.hz.toFixed(0) : '-'}${r.ap < 0.2 ? '' : '?'}@${db.toFixed(0)}`);
  }
  console.log(file, rows.join(' '));
}
