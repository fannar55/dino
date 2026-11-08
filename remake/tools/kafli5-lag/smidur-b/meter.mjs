// smidur-b's meters and master: BS.1770 loudness (K-weighted, gated), a 4x true-peak estimate, a look-ahead true-peak limiter,
// a gentle glue compressor, and the per-section measures the brief asks for (RMS overall and under 150 Hz, drum onsets from a
// 23 ms envelope under 150 Hz and over 5 kHz).
import { SR, biquad, filt } from './dsp.mjs';

function kCoeffs() {
  const fs = SR;
  let K = Math.tan(Math.PI * 1681.974450955533 / fs);
  const Vh = 10 ** (3.999843853973347 / 20), Vb = Vh ** 0.4996667741545416, Q = 0.7071752369554196;
  let a0 = 1 + K / Q + K * K;
  const s1 = { b0: (Vh + Vb * K / Q + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q + K * K) / a0, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
  K = Math.tan(Math.PI * 38.13547087602444 / fs);
  const Q2 = 0.5003270373238773;
  a0 = 1 + K / Q2 + K * K;
  const s2 = { b0: 1, b1: -2, b2: 1, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q2 + K * K) / a0 };
  return [s1, s2];
}
/** K-weighted copies of L, R (for a loudness-like balance of parts). */
export function kWeight(L, R) {
  const [s1, s2] = kCoeffs();
  return { L: filt(filt(Float32Array.from(L), s1), s2), R: filt(filt(Float32Array.from(R), s1), s2) };
}
/** Integrated loudness (LUFS) of stereo L, R, with the short-term max. */
export function lufs(L, R) {
  const [s1, s2] = kCoeffs();
  const kl = filt(filt(Float32Array.from(L), s1), s2);
  const kr = filt(filt(Float32Array.from(R), s1), s2);
  const B = Math.round(0.4 * SR), H = Math.round(0.1 * SR);
  const blocks = [];
  for (let s = 0; s + B <= kl.length; s += H) {
    let a = 0, b = 0;
    for (let i = s; i < s + B; i++) { a += kl[i] * kl[i]; b += kr[i] * kr[i]; }
    blocks.push((a + b) / B);
  }
  const ld = z => -0.691 + 10 * Math.log10(z);
  const abs = blocks.filter(z => ld(z) > -70);
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const rel = ld(mean(abs)) - 10;
  const gated = abs.filter(z => ld(z) > rel);
  // short-term (3 s) max
  let stMax = -Infinity;
  const S = 30;
  for (let i = 0; i + S <= blocks.length; i += 5) stMax = Math.max(stMax, ld(mean(blocks.slice(i, i + S)) || 1e-12));
  return { integrated: ld(mean(gated)), shortTermMax: stMax };
}

// 4x interpolation (windowed sinc, 12 taps a side) for true peak
const OS = 4, TAPS = 12;
const PHASES = (() => {
  const ph = [];
  for (let p = 1; p < OS; p++) {
    const frac = p / OS;
    const c = [];
    for (let k = -TAPS + 1; k <= TAPS; k++) {
      const x = k - frac;
      const s = Math.sin(Math.PI * x) / (Math.PI * x);
      const w = 0.5 + 0.5 * Math.cos(Math.PI * x / (TAPS + 0.5));
      c.push(s * w);
    }
    ph.push(c);
  }
  return ph;
})();
/** Per-sample true-peak estimate (max |x| over the sample and the 3 points after it). */
export function truePeakTrack(x) {
  const n = x.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = Math.abs(x[i]);
    for (const c of PHASES) {
      let s = 0;
      for (let k = 0; k < c.length; k++) {
        const j = i + (k - TAPS + 1);
        if (j >= 0 && j < n) s += x[j] * c[k];
      }
      if (Math.abs(s) > m) m = Math.abs(s);
    }
    out[i] = m;
  }
  return out;
}
export function truePeakDb(L, R) {
  let m = 0;
  for (const ch of [L, R]) { const t = truePeakTrack(ch); for (const v of t) if (v > m) m = v; }
  return 20 * Math.log10(m);
}

/** Look-ahead true-peak limiter, stereo-linked, in place: ceiling (dBTP), look-ahead (s), release (s). */
export function limit(L, R, { ceilingDb = -1.6, look = 0.004, release = 0.09 } = {}) {
  const n = L.length;
  const c = 10 ** (ceilingDb / 20);
  const tl = truePeakTrack(L), tr = truePeakTrack(R);
  const req = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = Math.max(tl[i], tr[i]); req[i] = p > c ? c / p : 1; }
  const La = Math.round(look * SR);
  // forward min over [i, i+La] (deque)
  const fmin = new Float32Array(n);
  const dq = [];
  let head = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (dq.length > head && req[dq[dq.length - 1]] >= req[i]) dq.pop();
    dq.push(i);
    while (dq[head] > i + La) head++;
    fmin[i] = req[dq[head]];
  }
  const kr = Math.exp(-1 / (release * SR));
  const g = new Float32Array(n);
  let y = 1;
  for (let i = 0; i < n; i++) { y = Math.min(fmin[i], 1 - (1 - y) * kr); g[i] = y; }
  // smooth with a moving average shorter than the look-ahead (never above what a peak needs)
  const M = Math.max(1, Math.floor(La / 2));
  let acc = 0;
  let minG = 1;
  for (let i = 0; i < n; i++) {
    acc += g[i];
    if (i >= M) acc -= g[i - M];
    const s = acc / Math.min(M, i + 1);
    L[i] *= s; R[i] *= s;
    if (s < minG) minG = s;
  }
  return { maxReductionDb: -20 * Math.log10(minG) };
}

/** A gentle stereo-linked RMS compressor (glue), in place. */
export function glue(L, R, { thresholdDb = -18, ratio = 1.8, attack = 0.012, release = 0.18, makeupDb = 0 } = {}) {
  const ka = Math.exp(-1 / (attack * SR)), krl = Math.exp(-1 / (release * SR));
  const kRms = Math.exp(-1 / (0.03 * SR));
  let ms = 0, gDb = 0;
  const mk = 10 ** (makeupDb / 20);
  for (let i = 0; i < L.length; i++) {
    ms = kRms * ms + (1 - kRms) * 0.5 * (L[i] * L[i] + R[i] * R[i]);
    const lvl = 10 * Math.log10(ms + 1e-12);
    const over = lvl - thresholdDb;
    const want = over > 0 ? -over * (1 - 1 / ratio) : 0;
    gDb = want < gDb ? ka * gDb + (1 - ka) * want : krl * gDb + (1 - krl) * want;
    const g = 10 ** (gDb / 20) * mk;
    L[i] *= g; R[i] *= g;
  }
}

/** The brief's per-section measures on a stereo mix. */
export function sectionMeasures(L, R, sections, spb) {
  const n = L.length;
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = 0.5 * (L[i] + R[i]);
  const low = Float32Array.from(mono);
  filt(low, biquad('lp', 150, 0.5412)); filt(low, biquad('lp', 150, 1.3066));
  const high = Float32Array.from(mono);
  filt(high, biquad('hp', 5000, 0.5412)); filt(high, biquad('hp', 5000, 1.3066));
  // 23 ms envelopes, hop 256
  const W = Math.round(0.023 * SR), HOP = 256;
  const env = x => {
    const e = [];
    for (let s = 0; s + W <= n; s += HOP) { let a = 0; for (let i = s; i < s + W; i++) a += x[i] * x[i]; e.push(10 * Math.log10(a / W + 1e-14)); }
    return e;
  };
  const eLow = env(low), eHigh = env(high);
  const onsets = e => {
    const mx = Math.max(...e);
    const floor = mx - 40;
    const look = Math.ceil(W / HOP); // compare with the minimum over the last 23 ms
    const out = [];
    let last = -1e9;
    for (let k = look; k < e.length; k++) {
      let mn = Infinity;
      for (let j = k - look; j < k; j++) mn = Math.min(mn, e[j]);
      if (e[k] > floor && e[k] - mn > 6 && (k - last) * HOP > 0.06 * SR) { out.push(k * HOP + W / 2); last = k; }
    }
    return out;
  };
  const oLow = onsets(eLow), oHigh = onsets(eHigh);
  const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return 10 * Math.log10(s / Math.max(1, b - a) + 1e-14); };
  return sections.map(s => {
    const a = Math.round(s.startBeat * spb), b = Math.min(n, Math.round((s.startBeat + s.beats) * spb));
    const bars = s.beats / 4;
    const lo = oLow.filter(t => t >= a && t < b).length, hi = oHigh.filter(t => t >= a && t < b).length;
    return {
      name: s.name, rmsDb: +rms(mono, a, b).toFixed(1), rmsUnder150Db: +rms(low, a, b).toFixed(1), rmsOver5kDb: +rms(high, a, b).toFixed(1),
      onsetsUnder150: lo, onsetsOver5k: hi, perBarUnder150: +(lo / bars).toFixed(2), perBarOver5k: +(hi / bars).toFixed(2),
    };
  });
}
