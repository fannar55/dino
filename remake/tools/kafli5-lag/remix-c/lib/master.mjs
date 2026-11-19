// Loudness (ITU-R BS.1770-4, K-weighted, gated), true peak (4x oversampled) and a look-ahead true-peak limiter.
import { SR } from './io.mjs';

function kFilters(fs = SR) {
  // stage 1: high shelf
  let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs);
  const Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q + K * K;
  const s1 = { b0: (Vh + (Vb * K) / Q + K * K) / a0, b1: (2 * (K * K - Vh)) / a0, b2: (Vh - (Vb * K) / Q + K * K) / a0, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  // stage 2: high pass
  f0 = 38.13547087602444; Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / fs);
  a0 = 1 + K / Q + K * K;
  const s2 = { b0: 1, b1: -2, b2: 1, a1: (2 * (K * K - 1)) / a0, a2: (1 - K / Q + K * K) / a0 };
  return [s1, s2];
}
function runBiquad(x, c) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v;
    y[i] = v;
  }
  return y;
}

/** Integrated loudness (LUFS) of a stereo signal; also momentary block loudness list. */
export function lufs(L, R, { from = 0, to = L.length } = {}) {
  const [s1, s2] = kFilters();
  const kl = runBiquad(runBiquad(L.subarray(from, to), s1), s2);
  const kr = runBiquad(runBiquad(R.subarray(from, to), s1), s2);
  const blk = Math.round(0.4 * SR), hop = Math.round(0.1 * SR);
  const z = [];
  for (let s = 0; s + blk <= kl.length; s += hop) {
    let a = 0, b = 0;
    for (let i = s; i < s + blk; i++) {
      a += kl[i] * kl[i];
      b += kr[i] * kr[i];
    }
    z.push((a + b) / blk);
  }
  const ld = v => -0.691 + 10 * Math.log10(v);
  const abs = z.filter(v => ld(v) > -70);
  if (!abs.length) return -Infinity;
  const mean = abs.reduce((p, q) => p + q, 0) / abs.length;
  const rel = ld(mean) - 10;
  const gated = abs.filter(v => ld(v) > rel);
  return ld(gated.reduce((p, q) => p + q, 0) / gated.length);
}

// 4x oversampling interpolator (windowed sinc, 12 taps a side)
const OS = 4, TAPS = 12;
const PHASES = [];
for (let p = 1; p < OS; p++) {
  const frac = p / OS;
  const h = [];
  for (let k = -TAPS + 1; k <= TAPS; k++) {
    const d = k - frac;
    const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / (TAPS + 0.5));
    h.push(((d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d)) * w));
  }
  PHASES.push(h);
}
/** Per-sample true-peak magnitude (max of the sample and the three interpolated points after it). */
export function truePeakTrack(x) {
  const n = x.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = Math.abs(x[i]);
    for (const h of PHASES) {
      let s = 0;
      for (let k = -TAPS + 1, j = 0; k <= TAPS; k++, j++) {
        const idx = i + k;
        if (idx >= 0 && idx < n) s += x[idx] * h[j];
      }
      const a = Math.abs(s);
      if (a > m) m = a;
    }
    out[i] = m;
  }
  return out;
}
export function truePeak(L, R) {
  let m = 0;
  for (const ch of [L, R]) {
    const t = truePeakTrack(ch);
    for (let i = 0; i < t.length; i++) if (t[i] > m) m = t[i];
  }
  return m;
}

/** Look-ahead limiter on both channels together: every true peak ends at or under `ceiling` (linear). In place. */
export function limit(L, R, ceiling, { lookahead = 0.004, release = 0.09 } = {}) {
  const n = L.length;
  const tl = truePeakTrack(L), tr = truePeakTrack(R);
  const gr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = Math.max(tl[i], tr[i]);
    gr[i] = p > ceiling ? ceiling / p : 1;
  }
  const La = Math.max(1, Math.round(lookahead * SR));
  // future minimum over [i, i + La] (monotone deque)
  const m = new Float32Array(n);
  const dq = new Int32Array(n + La + 1);
  let h = 0, t = 0;
  let next = 0;
  for (let i = 0; i < n; i++) {
    while (next < n && next <= i + La) {
      while (t > h && gr[dq[t - 1]] >= gr[next]) t--;
      dq[t++] = next++;
    }
    while (dq[h] < i) h++;
    m[i] = gr[dq[h]];
  }
  // moving average over [i - La, i]
  const g = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += m[i];
    if (i - La - 1 >= 0) acc -= m[i - La - 1];
    g[i] = acc / Math.min(i + 1, La + 1);
  }
  // release smoothing (never above g)
  const a = 1 - Math.exp(-1 / (release * SR));
  let y = 1, most = 1;
  for (let i = 0; i < n; i++) {
    y = Math.min(g[i], y + (1 - y) * a);
    if (y < most) most = y;
    L[i] *= y;
    R[i] *= y;
  }
  return { most };
}

/** Ungated K-weighted loudness (LUFS-like, -0.691 + 10 log10 of the summed channel power) of [from, to) of a stereo signal. */
export function kLoudness(L, R, from = 0, to = L.length) {
  const [s1, s2] = kFilters();
  const a = Math.max(0, from), b = Math.min(L.length, to);
  if (b - a < 64) return -70;
  const kl = runBiquad(runBiquad(L.subarray(a, b), s1), s2);
  const kr = runBiquad(runBiquad(R.subarray(a, b), s1), s2);
  let p = 0;
  for (let i = 0; i < kl.length; i++) p += kl[i] * kl[i] + kr[i] * kr[i];
  return -0.691 + 10 * Math.log10(Math.max(1e-12, p / kl.length));
}
