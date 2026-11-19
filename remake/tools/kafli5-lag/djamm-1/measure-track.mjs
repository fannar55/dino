// Measure the real track before building on it: stems' alignment with song.mp3, how well they sum to it, what is in vocals.mp3,
// the grid (kick onsets folded on the beat), the key (chroma of the mix) and the bass roots per bar (the chord cycle), each
// stem's level per bar, and how the track ends. Writes work/track.json under the output folder and prints a summary.
// Run from the worktree root: node remake/tools/kafli5-lag/djamm-1/measure-track.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { decode, SR } from './lib/io.mjs';
import { fft, mono } from './lib/analyze.mjs';
import { Biquad } from './lib/dsp.mjs';

const DIR = 'remake/assets/audio/sloedla/v2/djamm';
const OUT = 'qa/remake/kafli5/lag/djamm/1/work';
const NAMES = ['song', 'drums', 'bass', 'guitar', 'other', 'piano', 'vocals'];
const PC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const db = v => (v > 0 ? 20 * Math.log10(v) : -120);
const T0 = 0.0272, BEAT = 0.48, BAR = 1.92;
const REF = 440 * 2 ** (2.6 / 1200);

const A = {};
for (const n of NAMES) {
  const [L, R] = decode(`${DIR}/${n}.mp3`, 2);
  A[n] = { L, R, m: mono(L, R) };
  console.log(n, (L.length / SR).toFixed(3), 's');
}

// --- alignment: FFT cross-correlation of a 2^18 window (about 5.9 s) at a few places
function xcorrLag(a, b, at, maxLag = 4000) {
  const N = 1 << 19, W = 1 << 18;
  const ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N);
  for (let i = 0; i < W; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / W);
    ar[i] = (a[at + i] || 0) * w;
    br[i] = (b[at + i] || 0) * w;
  }
  fft(ar, ai);
  fft(br, bi);
  // a * conj(b), then inverse via conj trick
  const cr = new Float64Array(N), ci = new Float64Array(N);
  for (let k = 0; k < N; k++) {
    cr[k] = ar[k] * br[k] + ai[k] * bi[k];
    ci[k] = -(ai[k] * br[k] - ar[k] * bi[k]);
  }
  fft(cr, ci);
  let best = -Infinity, lag = 0;
  for (let l = -maxLag; l <= maxLag; l++) {
    const v = cr[(l + N) % N];
    if (v > best) {
      best = v;
      lag = l;
    }
  }
  return lag; // b is `lag` samples later than a when lag < 0 ... see sign check below
}

const rep = { lags: {}, sumResidualDb: null };
const spots = [20, 70, 120, 170].map(s => Math.round(s * SR));
for (const n of NAMES.slice(1)) rep.lags[n] = spots.map(at => xcorrLag(A.song.m, A[n].m, at));
// sum of stems against the song at lags -3000..3000 by direct residual on a 4 s window (coarse to fine)
const sum = new Float32Array(A.drums.m.length);
for (const n of NAMES.slice(1)) for (let i = 0; i < sum.length; i++) sum[i] += A[n].m[i];
rep.lagSum = spots.map(at => xcorrLag(A.song.m, sum, at));
function residual(lag, a0 = 10 * SR, a1 = 185 * SR) {
  let e = 0, s = 0;
  for (let i = a0; i < a1; i++) {
    const d = A.song.m[i] - (sum[i - lag] || 0);
    e += d * d;
    s += A.song.m[i] * A.song.m[i];
  }
  return db(Math.sqrt(e / s));
}
// the sign: if song[i] matches sum[i - lag], then sum is `lag` samples earlier... try both signs
const l0 = rep.lagSum[1];
rep.residual = { [l0]: +residual(l0).toFixed(1), [-l0]: +residual(-l0).toFixed(1), 0: +residual(0).toFixed(1) };
console.log('lags (samples) of each stem vs song at 20/70/120/170 s:', JSON.stringify(rep.lags));
console.log('lag of the stems sum:', rep.lagSum, 'residual song - sum (dB re song):', rep.residual);

// --- per bar levels of every file
const nBars = Math.floor((A.song.m.length / SR - T0) / BAR) + 1;
const barS = k => Math.round((T0 + k * BAR) * SR);
rep.barRms = {};
for (const n of NAMES) {
  const x = A[n].m;
  rep.barRms[n] = [];
  for (let k = 0; k < nBars; k++) {
    const a = barS(k), b = Math.min(x.length, barS(k + 1));
    let s = 0;
    for (let i = a; i < b; i++) s += x[i] * x[i];
    rep.barRms[n].push(+db(Math.sqrt(s / Math.max(1, b - a))).toFixed(1));
  }
}

// --- grid: kick onsets (drums under 120 Hz, energy flux) folded on the beat
{
  const lo = Float32Array.from(A.drums.m);
  for (const q of [0.54, 1.31]) new Biquad('lp', 120, q).run(lo);
  const hop = 64, w = 512, env = [];
  for (let s = 0; s + w < lo.length; s += hop) {
    let a = 0;
    for (let i = s; i < s + w; i++) a += lo[i] * lo[i];
    env.push(Math.sqrt(a / w));
  }
  const fl = env.map((v, i) => (i ? Math.max(0, v - env[i - 1]) : 0));
  // peaks of flux over a local threshold
  const on = [];
  for (let i = 2; i < fl.length - 2; i++) {
    let loc = 0;
    for (let j = Math.max(0, i - 200); j < Math.min(fl.length, i + 200); j++) loc = Math.max(loc, fl[j]);
    if (fl[i] > 0.35 * loc && fl[i] >= fl[i - 1] && fl[i] > fl[i + 1] && fl[i] >= fl[i - 2] && fl[i] > fl[i + 2]) on.push(((i + 1) * hop + w / 2) / SR);
  }
  const ph = on.filter(t => t > 16 && t < 184).map(t => ((t - T0) / BEAT) % 1).map(p => (p > 0.5 ? p - 1 : p) * BEAT * 1000);
  ph.sort((a, b) => a - b);
  const near = ph.filter(p => Math.abs(p) < 60);
  rep.kick = { onsets: on.length, within60msOfBeat: near.length, medianMs: near[near.length >> 1], q10: near[Math.floor(near.length * 0.1)], q90: near[Math.floor(near.length * 0.9)] };
  console.log('kick onsets vs grid (T0=27.2 ms):', rep.kick);
  // per bar: how many of the four beats have a kick within 40 ms
  rep.kicksPerBar = [];
  for (let k = 0; k < nBars; k++) {
    let c = 0;
    for (let b = 0; b < 4; b++) {
      const t = T0 + k * BAR + b * BEAT;
      if (on.some(o => Math.abs(o - t) < 0.04)) c++;
    }
    rep.kicksPerBar.push(c);
  }
}

// --- chroma per bar
function chroma(x, a, b, fLo, fHi) {
  const N = 8192, out = new Float64Array(12);
  const win = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  for (let s = a; s + N <= b; s += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * win[i];
    fft(re, im);
    for (let k = Math.ceil((fLo * N) / SR); k < (fHi * N) / SR; k++) {
      const f = (k * SR) / N;
      const midi = 69 + 12 * Math.log2(f / REF);
      const r = Math.round(midi);
      if (Math.abs(midi - r) > 0.35) continue;
      out[((r % 12) + 12) % 12] += re[k] * re[k] + im[k] * im[k];
    }
  }
  const t = out.reduce((p, v) => p + v, 0) || 1;
  return Array.from(out, v => v / t);
}
rep.bassRoot = [];
rep.bassChroma = [];
const mixChroma = new Float64Array(12);
rep.mixChord = [];
// triad templates for the mix chord per bar
const triads = [];
for (let r = 0; r < 12; r++) {
  triads.push({ name: PC[r], pcs: [r, (r + 4) % 12, (r + 7) % 12] });
  triads.push({ name: PC[r] + 'm', pcs: [r, (r + 3) % 12, (r + 7) % 12] });
}
for (let k = 0; k < nBars; k++) {
  const a = barS(k), b = Math.min(A.song.m.length, barS(k + 1));
  if (b - a < 8192) break;
  const bc = chroma(A.bass.m, a, b, 30, 330);
  const top = bc.map((v, i) => [v, i]).sort((p, q) => q[0] - p[0]);
  rep.bassRoot.push(PC[top[0][1]] + (top[0][0] < 0.3 ? '?' : ''));
  rep.bassChroma.push(bc.map(v => +v.toFixed(2)));
  const mc = chroma(A.song.m, a, b, 100, 2000);
  for (let i = 0; i < 12; i++) mixChroma[i] += mc[i];
  let best = null;
  for (const t of triads) {
    const s = t.pcs.reduce((p, i) => p + mc[i], 0) + 0.5 * bc[t.pcs[0]];
    if (!best || s > best.s) best = { s, name: t.name };
  }
  rep.mixChord.push(best.name);
}
// key by Krumhansl-Kessler profiles
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
function corr(a, b) {
  const ma = a.reduce((p, v) => p + v, 0) / 12, mb = b.reduce((p, v) => p + v, 0) / 12;
  let n = 0, da = 0, dbb = 0;
  for (let i = 0; i < 12; i++) {
    n += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    dbb += (b[i] - mb) ** 2;
  }
  return n / Math.sqrt(da * dbb);
}
const keys = [];
for (let r = 0; r < 12; r++) {
  keys.push({ key: PC[r] + ' major', r: corr(Array.from(mixChroma), MAJ.map((_, i) => MAJ[(i - r + 12) % 12])) });
  keys.push({ key: PC[r] + ' minor', r: corr(Array.from(mixChroma), MIN.map((_, i) => MIN[(i - r + 12) % 12])) });
}
keys.sort((p, q) => q.r - p.r);
rep.key = keys.slice(0, 4).map(k => ({ key: k.key, r: +k.r.toFixed(3) }));
rep.mixChromaPct = Object.fromEntries(PC.map((p, i) => [p, +(100 * mixChroma[i] / mixChroma.reduce((s, v) => s + v, 0)).toFixed(1)]));
console.log('key:', rep.key, rep.mixChromaPct);

// --- vocals: what is in it (bands, and envelope correlation with the other stems)
function bands(x, a, b) {
  const N = 4096, e = { sub: 0, low: 0, mid: 0, high: 0 };
  for (let s = a; s + N <= b; s += N * 4) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = (k * SR) / N, p = re[k] * re[k] + im[k] * im[k];
      if (f < 100) e.sub += p;
      else if (f < 400) e.low += p;
      else if (f < 2500) e.mid += p;
      else e.high += p;
    }
  }
  const t = e.sub + e.low + e.mid + e.high || 1;
  return Object.fromEntries(Object.entries(e).map(([k, v]) => [k, +(100 * v / t).toFixed(1)]));
}
rep.bands = {};
for (const n of NAMES) rep.bands[n] = bands(A[n].m, 16 * SR, 184 * SR);
function envOf(x) {
  const h = Math.round(0.05 * SR), e = [];
  for (let s = 16 * SR; s + h < 184 * SR; s += h) {
    let a = 0;
    for (let i = s; i < s + h; i++) a += x[i] * x[i];
    e.push(Math.sqrt(a / h));
  }
  return e;
}
function pear(a, b) {
  const n = a.length, ma = a.reduce((p, v) => p + v, 0) / n, mb = b.reduce((p, v) => p + v, 0) / n;
  let s = 0, da = 0, dbb = 0;
  for (let i = 0; i < n; i++) {
    s += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    dbb += (b[i] - mb) ** 2;
  }
  return +(s / Math.sqrt(da * dbb)).toFixed(2);
}
const envs = Object.fromEntries(NAMES.map(n => [n, envOf(A[n].m)]));
rep.envCorr = {};
for (const a of NAMES.slice(1)) {
  rep.envCorr[a] = {};
  for (const b of NAMES.slice(1)) if (a !== b) rep.envCorr[a][b] = pear(envs[a], envs[b]);
}
console.log('bands % (16-184 s):', JSON.stringify(rep.bands));
console.log('50 ms envelope correlation:', JSON.stringify(rep.envCorr));

// --- the end: 100 ms RMS over the last 12 s
{
  const x = A.song.m, h = Math.round(0.1 * SR), e = [];
  for (let s = x.length - 12 * SR; s + h <= x.length; s += h) {
    let a = 0;
    for (let i = s; i < s + h; i++) a += x[i] * x[i];
    e.push([+(s / SR).toFixed(1), +db(Math.sqrt(a / h)).toFixed(1)]);
  }
  rep.endEnv = e;
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/track.json`, JSON.stringify(rep, null, 1));
console.log('bars', nBars);
const row = k => [k, ...NAMES.map(n => rep.barRms[n][k]), rep.kicksPerBar[k], rep.bassRoot[k], rep.mixChord[k]].join('\t');
console.log(['bar', ...NAMES, 'kicks', 'root', 'chord'].join('\t'));
for (let k = 0; k < nBars; k++) console.log(row(k));
console.log('end:', rep.endEnv.map(p => p.join(':')).join(' '));
