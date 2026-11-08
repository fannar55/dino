// Pitch and onset measures for the checks: YIN f0 over frames, a median f0 of a span, an envelope onset finder.
import { SR } from './io.mjs';

/** YIN f0 (Hz) of the frame of `x` starting at `start`, `size` samples, searching `minHz`..`maxHz`; 0 when unvoiced. */
export function yin(x, start, size = 2048, minHz = 60, maxHz = 4000, threshold = 0.15) {
  const maxLag = Math.min(Math.floor(SR / minHz), size - 1);
  const minLag = Math.max(2, Math.floor(SR / maxHz));
  const d = new Float64Array(maxLag + 1);
  const w = size - maxLag;
  if (w < 64 || start + size > x.length) return { hz: 0, clarity: 0 };
  for (let tau = 1; tau <= maxLag; tau++) {
    let s = 0;
    for (let i = 0; i < w; i++) {
      const v = x[start + i] - x[start + i + tau];
      s += v * v;
    }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  const c = new Float64Array(maxLag + 1);
  c[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    run += d[tau];
    c[tau] = run > 0 ? (d[tau] * tau) / run : 1;
  }
  let best = -1;
  for (let tau = minLag; tau <= maxLag; tau++) {
    if (c[tau] < threshold) {
      while (tau + 1 <= maxLag && c[tau + 1] < c[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) {
    let m = Infinity;
    for (let tau = minLag; tau <= maxLag; tau++) if (c[tau] < m) { m = c[tau]; best = tau; }
    if (m > 0.35) return { hz: 0, clarity: 1 - m };
  }
  // parabolic interpolation
  const a = c[best - 1] ?? c[best];
  const b = c[best];
  const e = c[best + 1] ?? c[best];
  const den = a - 2 * b + e;
  const shift = den !== 0 ? (0.5 * (a - e)) / den : 0;
  return { hz: SR / (best + shift), clarity: 1 - b };
}

/** The median of the voiced YIN f0s over [from, to) samples of `x`, hop 512. */
export function medianF0(x, from = 0, to = x.length, opts = {}) {
  const size = opts.size ?? 2048;
  const hz = [];
  for (let s = from; s + size <= to; s += 512) {
    const r = yin(x, s, size, opts.minHz, opts.maxHz, opts.threshold);
    // skip quiet frames
    let e = 0;
    for (let i = 0; i < size; i++) e += x[s + i] * x[s + i];
    if (r.hz > 0 && r.clarity > 0.6 && Math.sqrt(e / size) > (opts.floor ?? 0.003)) hz.push(r.hz);
  }
  if (!hz.length) return 0;
  hz.sort((p, q) => p - q);
  return hz[Math.floor(hz.length / 2)];
}

/** An RMS envelope of `x`, window `win` samples, hop `hop`. */
export function envelope(x, win = 1014, hop = 256) {
  const n = Math.floor((x.length - win) / hop) + 1;
  const env = new Float32Array(Math.max(0, n));
  for (let k = 0; k < n; k++) {
    let s = 0;
    const o = k * hop;
    for (let i = 0; i < win; i++) s += x[o + i] * x[o + i];
    env[k] = Math.sqrt(s / win);
  }
  return env;
}

/** The time (s) where `x` first rises over `fraction` of its peak 10 ms RMS. */
export function onsetOf(x, fraction = 0.2) {
  const env = envelope(x, 441, 64);
  let peak = 0;
  for (const v of env) peak = Math.max(peak, v);
  for (let k = 0; k < env.length; k++) if (env[k] >= peak * fraction) return (k * 64 + 220) / SR;
  return 0;
}

/** Cents from `hz` to the nearest of `targets` (Hz, any octave): { name, cents }. */
export function centsToPitchClass(hz, target) {
  const c = 1200 * Math.log2(hz / target);
  const wrapped = ((c % 1200) + 1800) % 1200 - 600;
  return wrapped;
}
