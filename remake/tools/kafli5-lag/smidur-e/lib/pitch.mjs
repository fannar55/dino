// Pitch by YIN (de Cheveigné & Kawahara), frame by frame, and the steady part of a take.
import { SR } from './io.mjs';

/** YIN f0 of one frame starting at `start`: { hz, ap } (ap = aperiodicity, lower is clearer) or null. */
export function yinFrame(x, start, win = 2048, fmin = 50, fmax = 4000, sr = SR) {
  const maxLag = Math.min(Math.floor(sr / fmin), win - 1);
  const minLag = Math.max(2, Math.floor(sr / fmax));
  if (start + win + maxLag > x.length) return null;
  const d = new Float64Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let s = 0;
    for (let i = 0; i < win; i++) {
      const v = x[start + i] - x[start + i + tau];
      s += v * v;
    }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  const dn = new Float64Array(maxLag + 1);
  dn[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    run += d[tau];
    dn[tau] = run > 0 ? (d[tau] * tau) / run : 1;
  }
  let tau = -1;
  for (let t = minLag; t <= maxLag; t++) {
    if (dn[t] < 0.15) {
      while (t + 1 <= maxLag && dn[t + 1] < dn[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // global minimum as a weaker answer
    let best = minLag;
    for (let t = minLag; t <= maxLag; t++) if (dn[t] < dn[best]) best = t;
    tau = best;
  }
  if (tau <= minLag || tau >= maxLag) return null;
  const a = dn[tau - 1], b = dn[tau], c = dn[tau + 1];
  const den = a - 2 * b + c;
  const shift = den !== 0 ? (0.5 * (a - c)) / den : 0;
  const lag = tau + Math.max(-1, Math.min(1, shift));
  return { hz: sr / lag, ap: b };
}

function rmsAt(x, start, win) {
  let s = 0;
  for (let i = start; i < start + win && i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / win);
}

/** Track of frames: [{ t, hz, ap, rms }]. */
export function track(x, { win = 2048, hop = 256, fmin = 50, fmax = 4000, sr = SR } = {}) {
  const out = [];
  for (let s = 0; s + win * 2 < x.length; s += hop) {
    const f = yinFrame(x, s, win, fmin, fmax, sr);
    out.push({ t: (s + win / 2) / sr, hz: f?.hz ?? 0, ap: f?.ap ?? 1, rms: rmsAt(x, s, win) });
  }
  return out;
}

const cents = (a, b) => 1200 * Math.log2(a / b);

/**
 * The steady part: the longest run of loud, clear frames whose pitch stays within ±`tol` cents of the run's running median.
 * Returns { hz (median of the run), from, to (s), frames, clarity } or null.
 */
export function steady(x, opts = {}) {
  const tol = opts.tol ?? 35;
  const fr = track(x, opts);
  if (!fr.length) return null;
  const peak = Math.max(...fr.map(f => f.rms));
  const good = fr.map(f => f.hz > 0 && f.ap < (opts.apMax ?? 0.25) && f.rms > peak * (opts.floor ?? 0.12));
  let best = null;
  for (let i = 0; i < fr.length; i++) {
    if (!good[i]) continue;
    const run = [fr[i].hz];
    let j = i + 1;
    while (j < fr.length && good[j]) {
      const med = median(run);
      if (Math.abs(cents(fr[j].hz, med)) > tol) break;
      run.push(fr[j].hz);
      j++;
    }
    if (!best || run.length > best.n) best = { i, j, n: run.length, hz: median(run) };
  }
  if (!best || best.n < 3) return null;
  const seg = fr.slice(best.i, best.j);
  return {
    hz: best.hz,
    from: seg[0].t,
    to: seg[seg.length - 1].t,
    frames: best.n,
    clarity: 1 - median(seg.map(f => f.ap)),
  };
}

export function median(a) {
  const s = [...a].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export { cents };
