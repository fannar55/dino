#!/usr/bin/env node
// Stjörnuhátíðin's song: where to repeat H's solo passage (the owner's "Lengja sólóin", 2026-11-24). The solo section is H's
// bars 34-42 (9 bars); six solos of 12 beats need 18. Every candidate plays bars from 34 to 42 in some order, 18 of them, with at
// most two jumps, and then goes on to bar 43 as H does. Each jump (the end of bar X straight into the start of bar Y, Y != X + 1)
// is measured on H and its stems (qa/remake/hatid/lag/hatid-h/, git ignores qa/):
//   harmony   1 - cosine of the chroma (bass + guitar + piano + other) of Y's first two beats against X + 1's (what H plays after
//             X), and of X's last two beats against Y - 1's (what H plays before Y); 0 is the same harmony on both sides
//   levelDb   Y's first beat against X + 1's first beat (RMS of the song), dB
//   flux      the spectral flux across the join as rendered (12 ms crossfade) over the median flux across H's own bar lines
//             in bars 34-42 (1 is as smooth as one of H's own bar lines)
//   fillDb    the drums' last beat of X over the mean of X's other beats (a fill would lead into X + 1, which the jump skips)
//   heldDb    the "other" stem's RMS in the 40 ms before X's end against its RMS in bar X (a note held over the bar line is cut)
// Writes qa/remake/hatid/lag/hatid-h/splice.json and prints the best candidates.
//   node remake/tools/hatid-lag/splice.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, decode } from './lib/io.mjs';
import { fft } from './lib/analyze.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const H = path.join(ROOT, 'qa/remake/hatid/lag/hatid-h');
const LAG = 1105, FADE = Math.round(0.012 * SR);
const FIRST = 34, LAST = 42, WANT = 18;
const db = v => 20 * Math.log10(Math.max(v, 1e-12));

/** The sample where H's bar b starts (bar 0 on H's grid beat 2). */
export const barSample = (song, b) => Math.round((song.beatOffset + (2 + 4 * b) * (60 / song.bpm)) * SR);

/** Every bar sequence from FIRST, ending on LAST, WANT bars long, with at most two jumps: [[from, to], ...] runs. */
export function candidates() {
  const out = [];
  const runLen = ([a, b]) => b - a + 1;
  const push = runs => { if (runs.reduce((s, r) => s + runLen(r), 0) === WANT) out.push(runs); };
  for (let x1 = FIRST; x1 <= LAST; x1++) for (let y1 = FIRST; y1 <= LAST; y1++) {
    if (y1 === x1 + 1) continue;
    push([[FIRST, x1], [y1, LAST]]);
    for (let x2 = y1; x2 <= LAST; x2++) for (let y2 = FIRST; y2 <= LAST; y2++) {
      if (y2 === x2 + 1) continue;
      push([[FIRST, x1], [y1, x2], [y2, LAST]]);
    }
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const song = JSON.parse(fs.readFileSync(path.join(H, 'song.json'), 'utf8'));
  const monoOf = file => { const [L, R] = decode(file, 2); return { L, R, m: Float32Array.from(L, (v, i) => 0.5 * (v + R[i])) }; };
  const mix = monoOf(path.join(H, 'song.mp3')).m;
  const st = {};
  for (const s of ['drums', 'bass', 'guitar', 'piano', 'other']) st[s] = monoOf(path.join(H, `${s}.mp3`)).m.subarray(LAG);
  const harm = Float32Array.from(st.bass, (v, i) => v + st.guitar[i] + st.piano[i] + st.other[i]);
  const s = b => barSample(song, b);
  const beat = (60 / song.bpm) * SR;
  const rms = (x, a, b) => { a = Math.round(a); b = Math.round(b); let e = 0; for (let i = a; i < b; i++) e += x[i] * x[i]; return Math.sqrt(e / Math.max(1, b - a)); };
  const chroma = (x, a, b) => {
    a = Math.round(a); b = Math.round(b);
    const N = 8192, out = new Float64Array(12);
    for (let p = a; p + N <= b; p += N / 2) {
      const re = new Float64Array(N), im = new Float64Array(N);
      for (let i = 0; i < N; i++) re[i] = x[p + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
      fft(re, im);
      for (let k = Math.ceil((60 * N) / SR); k < (2000 * N) / SR; k++) out[((Math.round(12 * Math.log2((k * SR) / N / 440)) + 69) % 12 + 12) % 12] += Math.hypot(re[k], im[k]);
    }
    const n = Math.hypot(...out) || 1;
    return Array.from(out, v => v / n);
  };
  const cosine = (p, q) => p.reduce((sum, v, i) => sum + v * q[i], 0);
  const spec = (x, at) => {
    const N = 1024, re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[at + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    return Array.from({ length: N / 2 }, (_, k) => Math.log1p(100 * Math.hypot(re[k], im[k])));
  };
  const fluxOf = (x, at) => { const p = spec(x, at - 1024), q = spec(x, at); return p.reduce((sum, v, k) => sum + Math.max(0, q[k] - v), 0); };
  // H's own bar lines in the passage, as the yardstick
  const own = [];
  for (let b = FIRST + 1; b <= LAST; b++) own.push(fluxOf(mix, s(b)));
  own.sort((a, b) => a - b);
  const ownMedian = own[own.length >> 1];
  /** The join of the end of bar x into the start of bar y, rendered as the render does it. */
  const seam = (x, y) => {
    const J = s(x + 1), Y = s(y), w = 3 * 1024;
    const x2 = new Float32Array(2 * w);
    for (let i = 0; i < w; i++) x2[i] = mix[J - w + i];
    for (let i = 0; i < w; i++) x2[w + i] = mix[Y + i];
    for (let k = 0; k < FADE; k++) { const f = (k + 0.5) / FADE; x2[w - FADE + k] = mix[J - FADE + k] * (1 - f) + mix[Y - FADE + k] * f; }
    const harmony = +((1 - cosine(chroma(harm, Y, Y + 2 * beat), chroma(harm, J, J + 2 * beat))) + (1 - cosine(chroma(harm, J - 2 * beat, J), chroma(harm, Y - 2 * beat, Y)))).toFixed(3);
    const levelDb = +(db(rms(mix, Y, Y + beat)) - db(rms(mix, J, J + beat))).toFixed(1);
    const flux = +(fluxOf(x2, w) / ownMedian).toFixed(2);
    const drumsBeats = [0, 1, 2, 3].map(k => rms(st.drums, s(x) + k * beat, s(x) + (k + 1) * beat));
    const fillDb = +(db(drumsBeats[3]) - db((drumsBeats[0] + drumsBeats[1] + drumsBeats[2]) / 3)).toFixed(1);
    const heldDb = +(db(rms(st.other, J - 0.04 * SR, J)) - db(rms(st.other, s(x), J))).toFixed(1);
    return { x, y, harmony, levelDb, flux, fillDb, heldDb };
  };
  const seams = new Map();
  const seamOf = (x, y) => { const k = `${x}>${y}`; if (!seams.has(k)) seams.set(k, seam(x, y)); return seams.get(k); };
  const scored = candidates().map(runs => {
    const joins = runs.slice(1).map((run, i) => seamOf(runs[i][1], run[0]));
    // the cost: the worst join's harmony, plus its level step and flux over H's own, in like measure
    const cost = Math.max(...joins.map(j => j.harmony + Math.abs(j.levelDb) / 6 + Math.max(0, j.flux - 1) / 2));
    return { bars: runs.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(', '), runs, joins, cost: +cost.toFixed(3) };
  }).sort((a, b) => a.cost - b.cost || a.joins.length - b.joins.length);
  const named = {
    a: scored.find(c => c.bars === '34-42, 34-42'),
    b: scored.filter(c => c.runs[0][1] === 42 && c.runs[1][0] === 35).sort((p, q) => p.cost - q.cost)[0],
  };
  const out = { about: 'splice.mjs: the solo passage repeated, every candidate with its joins measured', ownBarLineFluxMedian: +ownMedian.toFixed(1), named, best: scored.slice(0, 12), count: scored.length };
  fs.writeFileSync(path.join(H, 'splice.json'), JSON.stringify(out, null, 1) + '\n');
  const line = c => `${c.bars}  cost ${c.cost}  ${c.joins.map(j => `[${j.x}>${j.y} harmony ${j.harmony} level ${j.levelDb} dB flux ${j.flux} fill ${j.fillDb} dB held ${j.heldDb} dB]`).join(' ')}`;
  console.log(`${scored.length} candidates; H's own bar lines in 34-42: flux median ${ownMedian.toFixed(1)}`);
  console.log(`(a) ${line(named.a)}`);
  console.log(`(b) ${line(named.b)}`);
  for (const c of scored.slice(0, 12)) console.log(`    ${line(c)}`);
}
