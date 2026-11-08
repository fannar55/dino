// Pitch measurement: a YIN tracker and the "steady part" of a take (the longest run of frames whose pitch stays within a
// small band), so a glide or a sub-harmonic does not decide where a call is moved.

/** YIN pitch of one frame: { hz, clarity } (clarity 1 - dprime at the dip; 0 when unvoiced). */
export function yinFrame(x, start, size, sr, fmin = 50, fmax = 3200) {
  const tauMin = Math.max(2, Math.floor(sr / fmax)), tauMax = Math.min(size - 2, Math.ceil(sr / fmin));
  const d = new Float64Array(tauMax + 2);
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let s = 0;
    for (let i = 0; i < size - tauMax - 1; i++) {
      const v = x[start + i] - x[start + i + tau];
      s += v * v;
    }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  const dp = new Float64Array(tauMax + 2);
  dp[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    run += d[tau];
    dp[tau] = run > 0 ? (d[tau] * tau) / run : 1;
  }
  let best = -1;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (dp[tau] < 0.15) {
      while (tau + 1 <= tauMax && dp[tau + 1] < dp[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) {
    // fall back to the global minimum
    let m = Infinity;
    for (let tau = tauMin; tau <= tauMax; tau++) if (dp[tau] < m) { m = dp[tau]; best = tau; }
  }
  const a = dp[best - 1], b = dp[best], c = dp[best + 1];
  const den = a - 2 * b + c;
  const shift = den !== 0 ? (0.5 * (a - c)) / den : 0;
  const tau = best + Math.max(-1, Math.min(1, shift));
  return { hz: sr / tau, clarity: Math.max(0, 1 - b) };
}

/** Track pitch over a signal: frames every `hop` samples. */
export function track(x, sr, { size = 2048, hop = 256, fmin = 50, fmax = 3200 } = {}) {
  const out = [];
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  for (let s = 0; s + size < x.length; s += hop) {
    let e = 0;
    for (let i = 0; i < size; i++) e += x[s + i] * x[s + i];
    const rms = Math.sqrt(e / size);
    const f = rms > peak * 0.03 ? yinFrame(x, s, size, sr, fmin, fmax) : { hz: 0, clarity: 0 };
    out.push({ t: (s + size / 2) / sr, rms, ...f });
  }
  return out;
}

const cents = (a, b) => 1200 * Math.log2(a / b);

/** The steady part: the longest run of clear frames whose pitch stays within `band` cents of its running median. */
export function steady(frames, { minClarity = 0.6, band = 40 } = {}) {
  let best = null;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].clarity < minClarity || !frames[i].hz) continue;
    const run = [frames[i].hz];
    let j = i + 1;
    for (; j < frames.length; j++) {
      const f = frames[j];
      if (f.clarity < minClarity || !f.hz) break;
      const med = median(run);
      if (Math.abs(cents(f.hz, med)) > band) break;
      run.push(f.hz);
    }
    if (!best || run.length > best.n) best = { i, j, n: run.length, hz: median(run), t0: frames[i].t, t1: frames[j - 1].t };
  }
  return best;
}

export function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s[s.length >> 1];
}

/** Median pitch of a signal segment (for checking a moved note): YIN over frames, clear ones only. */
export function segmentPitch(x, sr, t0, t1, opts = {}) {
  const a = Math.max(0, Math.floor(t0 * sr)), b = Math.min(x.length, Math.floor(t1 * sr));
  const fr = track(x.subarray(a, b), sr, { size: 2048, hop: 256, ...opts }).filter(f => f.clarity > 0.5 && f.hz);
  if (!fr.length) return null;
  return median(fr.map(f => f.hz));
}
