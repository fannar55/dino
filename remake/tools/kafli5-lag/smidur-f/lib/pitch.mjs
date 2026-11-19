// Pitch measurement: YIN over short frames, and the steadiest stretch of a take (its "own" pitch, off the glides).
import { SR } from './io.mjs';

/** YIN f0 for one frame starting at `start`; returns { hz, clarity } (clarity 1 = clean period), or hz 0. */
export function yinFrame(x, start, size = 2048, fmin = 60, fmax = 3200) {
  const half = size >> 1;
  const tauMin = Math.max(2, Math.floor(SR / fmax));
  const tauMax = Math.min(half - 1, Math.ceil(SR / fmin));
  const d = new Float64Array(tauMax + 2);
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let s = 0;
    for (let i = 0; i < half; i++) {
      const a = (x[start + i] ?? 0) - (x[start + i + tau] ?? 0);
      s += a * a;
    }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  const c = new Float64Array(tauMax + 2);
  c[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    run += d[tau];
    c[tau] = run > 0 ? (d[tau] * tau) / run : 1;
  }
  let best = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (c[tau] < 0.15) {
      while (tau + 1 <= tauMax && c[tau + 1] < c[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) {
    let m = Infinity;
    for (let tau = tauMin; tau <= tauMax; tau++) if (c[tau] < m) { m = c[tau]; best = tau; }
  }
  // parabolic interpolation
  const a = c[best - 1] ?? c[best], b = c[best], e = c[best + 1] ?? c[best];
  const den = a - 2 * b + e;
  const shift = den !== 0 ? (0.5 * (a - e)) / den : 0;
  const tau = best + Math.max(-1, Math.min(1, shift));
  return { hz: SR / tau, clarity: 1 - Math.min(1, b) };
}

/** A pitch track: frames every `hop` samples with { t, hz, clarity, rms }. */
export function track(x, { size = 2048, hop = 256, fmin = 60, fmax = 3200 } = {}) {
  const frames = [];
  for (let s = 0; s + size <= x.length; s += hop) {
    let e = 0;
    for (let i = 0; i < size; i++) e += x[s + i] * x[s + i];
    const rms = Math.sqrt(e / size);
    const { hz, clarity } = yinFrame(x, s, size, fmin, fmax);
    frames.push({ t: (s + size / 2) / SR, hz, clarity, rms });
  }
  return frames;
}

const cents = (a, b) => 1200 * Math.log2(a / b);

/**
 * The steady part of a take: the longest run of clear, loud frames whose pitch stays within `tol` cents of the run's median,
 * and that median. Returns { hz, from, to, frames, spread } or null.
 */
export function steadyPitch(x, opts = {}) {
  const { tol = 35, minClarity = 0.8, size = 2048, hop = 256, fmin = 60, fmax = 3200 } = opts;
  const fr = track(x, { size, hop, fmin, fmax });
  if (!fr.length) return null;
  const peak = Math.max(...fr.map(f => f.rms));
  const ok = fr.map(f => f.clarity >= minClarity && f.rms >= peak * 0.12);
  let best = null;
  for (let i = 0; i < fr.length; i++) {
    if (!ok[i]) continue;
    // grow a run from i while within tol of the run's running mean (in cents)
    const hzs = [fr[i].hz];
    let sumLog = Math.log2(fr[i].hz);
    let j = i + 1;
    for (; j < fr.length && ok[j]; j++) {
      const mean = 2 ** (sumLog / hzs.length);
      if (Math.abs(cents(fr[j].hz, mean)) > tol) break;
      hzs.push(fr[j].hz);
      sumLog += Math.log2(fr[j].hz);
    }
    const len = hzs.length;
    // weight runs by length and loudness
    const loud = fr.slice(i, i + len).reduce((s, f) => s + f.rms, 0);
    if (!best || loud > best.loud) {
      const sorted = [...hzs].sort((p, q) => p - q);
      const med = sorted[sorted.length >> 1];
      const spread = Math.max(...hzs.map(h => Math.abs(cents(h, med))));
      best = { hz: med, from: fr[i].t, to: fr[i + len - 1].t, frames: len, spread, loud };
    }
  }
  return best;
}

/** Equal-tempered note name of hz (A4 = 440) and its offset in cents. */
export function noteName(hz) {
  const n = 12 * Math.log2(hz / 440) + 69;
  const r = Math.round(n);
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return `${names[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}${n - r >= 0 ? '+' : ''}${Math.round((n - r) * 100)}`;
}
