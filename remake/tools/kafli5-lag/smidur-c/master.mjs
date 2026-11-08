// smidur-c's master: the top tamed (a child's ears: a shelf from 8 kHz and a gentle lowpass), a slow glue compressor, a
// look-ahead true-peak limiter (4x interpolated peaks), and the gain that puts it at -16 LUFS, measured by ffmpeg's ebur128.
import { spawnSync } from 'node:child_process';
import { SR, biquad, writeWav, encodeMp3 } from './dsp.mjs';

/** Integrated loudness, LRA and true peak of a file (ffmpeg ebur128, which reports on stderr). */
export function lufsOf(path) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  return parseEbur(r.stderr);
}
export function parseEbur(text) {
  const sum = text.slice(text.lastIndexOf('Summary:'));
  const I = /I:\s+(-?[\d.]+) LUFS/.exec(sum), LRA = /LRA:\s+(-?[\d.]+) LU/.exec(sum), P = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(sum);
  return { lufs: I ? Number(I[1]) : NaN, lra: LRA ? Number(LRA[1]) : NaN, truePeak: P ? Number(P[1]) : NaN };
}
/** True-peak estimate of every sample: the max of the sample and three cubic-interpolated points after it, over both channels. */
function truePeaks([L, R]) {
  const n = L.length; const tp = new Float32Array(n);
  for (const x of [L, R]) {
    for (let i = 0; i < n; i++) {
      const xm = x[i - 1] ?? 0, x0 = x[i], x1 = x[i + 1] ?? 0, x2 = x[i + 2] ?? 0;
      let m = Math.abs(x0);
      for (const t of [0.25, 0.5, 0.75]) {
        // Catmull-Rom
        const v = 0.5 * ((2 * x0) + (-xm + x1) * t + (2 * xm - 5 * x0 + 4 * x1 - x2) * t * t + (-xm + 3 * x0 - 3 * x1 + x2) * t * t * t);
        if (Math.abs(v) > m) m = Math.abs(v);
      }
      if (m > tp[i]) tp[i] = m;
    }
  }
  return tp;
}
/** A look-ahead limiter to `ceil` (linear): the gain ramps down over `la` samples before a peak and recovers over `rel` s. */
export function limit([L, R], ceil, { la = Math.round(0.004 * SR), rel = 0.12 } = {}) {
  const n = L.length; const tp = truePeaks([L, R]);
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = tp[i] > ceil ? ceil / tp[i] : 1;
  // backward: reach each dip by a straight ramp over `la`
  for (let i = n - 2; i >= 0; i--) g[i] = Math.min(g[i], g[i + 1] + (1 - g[i + 1]) / la);
  // forward: recover slowly
  const k = 1 - Math.exp(-1 / (rel * SR));
  let gs = 1;
  for (let i = 0; i < n; i++) { gs = Math.min(g[i], gs + (1 - gs) * k); g[i] = gs; }
  // the windowed max over the look-ahead, so the ramp holds through the peak
  const out = [new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) { out[0][i] = L[i] * g[i]; out[1][i] = R[i] * g[i]; }
  return out;
}
/** A slow RMS compressor (glue): 2:1 above `thrDb`, 30 ms attack, 250 ms release, linked stereo. */
function glue([L, R], thrDb, ratio = 2) {
  const n = L.length; const out = [new Float32Array(n), new Float32Array(n)];
  let env = 0; const ka = 1 - Math.exp(-1 / (0.03 * SR)), kr = 1 - Math.exp(-1 / (0.25 * SR));
  for (let i = 0; i < n; i++) {
    const p = (L[i] * L[i] + R[i] * R[i]) * 0.5;
    env += (p - env) * (p > env ? ka : kr);
    const db = 10 * Math.log10(env + 1e-12);
    const over = db - thrDb;
    const gDb = over > 0 ? -over * (1 - 1 / ratio) : 0;
    const g = 10 ** (gDb / 20);
    out[0][i] = L[i] * g; out[1][i] = R[i] * g;
  }
  return out;
}

/** Masters the pre-master sum: returns { mix, lufs, truePeak }, measured on the encoded mp3 as the listener gets it. */
export function master(sum, tmp) {
  let x = [Float32Array.from(sum[0]), Float32Array.from(sum[1])];
  for (const ch of x) { biquad(ch, 'hs', 8000, 0.7, -4); biquad(ch, 'lp', 13500, 0.6); biquad(ch, 'hp', 28, 0.7); }
  x = glue(x, -20, 1.8);
  let gain = 1, ceilDb = -1.7, mix = x, res = null;
  for (let pass = 0; pass < 3; pass++) {
    // loudness on the WAV (fast), then one mp3 and its true peak
    for (let it = 0; it < 4; it++) {
      const g = [x[0].map(v => v * gain), x[1].map(v => v * gain)];
      mix = limit(g, 10 ** (ceilDb / 20));
      writeWav(tmp + 'm.wav', mix);
      res = lufsOf(tmp + 'm.wav');
      const err = -16 - res.lufs;
      if (Math.abs(err) < 0.2) break;
      gain *= 10 ** (err / 20);
    }
    encodeMp3(tmp + 'm.wav', tmp + 'm.mp3');
    res = lufsOf(tmp + 'm.mp3');
    if (res.truePeak <= -1.1) break;
    ceilDb -= res.truePeak + 1.1 + 0.2;
  }
  return { mix, lufs: res.lufs, truePeak: res.truePeak };
}
