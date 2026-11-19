// The chapter's recordings: decode (ffmpeg), measure each take's pitch on its steady part (YIN), and move a take to a tone.
import { execFileSync } from 'node:child_process';

export const SR = 44100;

/** A file decoded to mono float samples at 44.1 kHz. */
export function decodeMono(file) {
  const out = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], {
    maxBuffer: 1 << 28,
  });
  return new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
}

/** YIN on one frame: [f0 or 0, aperiodicity (0 clean .. 1 noise)]. */
function yinFrame(x, start, size, minLag, maxLag, threshold = 0.15) {
  const d = new Float64Array(maxLag + 2);
  for (let tau = 1; tau <= maxLag + 1; tau++) {
    let s = 0;
    for (let i = 0; i < size; i++) {
      const v = x[start + i] - x[start + i + tau];
      s += v * v;
    }
    d[tau] = s;
  }
  // cumulative mean normalised difference
  const c = new Float64Array(maxLag + 2);
  c[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= maxLag + 1; tau++) {
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
    // no dip under the threshold: the global minimum, marked as weak
    let m = Infinity;
    for (let tau = minLag; tau <= maxLag; tau++) if (c[tau] < m) { m = c[tau]; best = tau; }
  }
  const a = c[best - 1] ?? c[best];
  const b = c[best];
  const e = c[best + 1] ?? c[best];
  const den = a - 2 * b + e;
  const shift = den !== 0 ? (0.5 * (a - e)) / den : 0;
  const lag = best + Math.max(-1, Math.min(1, shift));
  return [SR / lag, c[best]];
}

/** Frame-by-frame pitch: [{ t, hz, ap, rms }]. */
export function pitchTrack(x, { fmin = 60, fmax = 3200, size = 1024, hop = 256 } = {}) {
  const minLag = Math.floor(SR / fmax);
  const maxLag = Math.ceil(SR / fmin);
  const frames = [];
  for (let start = 0; start + size + maxLag + 2 < x.length; start += hop) {
    let e = 0;
    for (let i = 0; i < size; i++) e += x[start + i] * x[start + i];
    const rms = Math.sqrt(e / size);
    const [hz, ap] = rms > 1e-4 ? yinFrame(x, start, size, minLag, maxLag) : [0, 1];
    frames.push({ t: (start + size / 2) / SR, hz, ap, rms });
  }
  return frames;
}

const cents = (a, b) => 1200 * Math.log2(a / b);

/**
 * A take's pitch on its steady part: the longest run of clean, loud frames whose pitch stays within 40 cents of its neighbours,
 * weighted to the louder run when two are close. { hz, from, to, frames, clean } or { hz: null } when nothing steady is there.
 */
export function steadyPitch(x, opts = {}) {
  const frames = pitchTrack(x, opts);
  const peak = Math.max(...frames.map(f => f.rms), 1e-9);
  const ok = frames.map(f => f.ap < 0.25 && f.rms > peak * 0.12 && f.hz > 0);
  let best = null;
  for (let i = 0; i < frames.length; i++) {
    if (!ok[i]) continue;
    let j = i;
    while (j + 1 < frames.length && ok[j + 1] && Math.abs(cents(frames[j + 1].hz, frames[j].hz)) < 40) j++;
    const run = frames.slice(i, j + 1);
    const energy = run.reduce((s, f) => s + f.rms, 0);
    if (!best || energy > best.energy) best = { i, j, energy, run };
    i = j;
  }
  if (!best || best.run.length < 6) return { hz: null, frames: best?.run.length ?? 0 };
  const hzs = best.run.map(f => f.hz).sort((a, b) => a - b);
  const median = hzs[Math.floor(hzs.length / 2)];
  const spread = cents(hzs[Math.floor(hzs.length * 0.9)], hzs[Math.floor(hzs.length * 0.1)]);
  return {
    hz: median,
    from: best.run[0].t,
    to: best.run[best.run.length - 1].t,
    frames: best.run.length,
    clean: 1 - best.run.reduce((s, f) => s + f.ap, 0) / best.run.length,
    spread,
  };
}

/** The game's rule (engine/audio/choir-sounds.js takeRate): onto `tone` in the octave nearest the take's own pitch. */
export function takeRate(hz, tone) {
  if (!(hz > 0) || !(tone > 0)) return 1;
  return (tone * 2 ** Math.round(Math.log2(hz / tone))) / hz;
}

/** Resample by `rate` (rate 2 = an octave up, half as long), windowed-sinc (8 taps a side), band-limited when going up. */
export function resample(x, rate) {
  const n = Math.floor(x.length / rate);
  const y = new Float32Array(n);
  const cutoff = Math.min(1, 1 / rate) * 0.94;
  const half = 12;
  for (let i = 0; i < n; i++) {
    const pos = i * rate;
    const base = Math.floor(pos);
    let s = 0;
    let w = 0;
    for (let k = base - half + 1; k <= base + half; k++) {
      if (k < 0 || k >= x.length) continue;
      const t = pos - k;
      const arg = Math.PI * t * cutoff;
      const sinc = t === 0 ? 1 : Math.sin(arg) / arg;
      const win = 0.5 + 0.5 * Math.cos((Math.PI * t) / half);
      const c = sinc * win;
      s += x[k] * c;
      w += c;
    }
    y[i] = w ? s / w : 0;
  }
  return y;
}

/** Resample along a pitch curve: rateAt(i) gives the rate at output sample i (for scoops and smears on her horn). */
export function resampleCurve(x, rateAt, maxOut) {
  const out = [];
  let pos = 0;
  const half = 8;
  for (let i = 0; i < maxOut && pos < x.length - 1; i++) {
    const rate = rateAt(i);
    const cutoff = Math.min(1, 1 / rate) * 0.94;
    const base = Math.floor(pos);
    let s = 0;
    let w = 0;
    for (let k = base - half + 1; k <= base + half; k++) {
      if (k < 0 || k >= x.length) continue;
      const t = pos - k;
      const arg = Math.PI * t * cutoff;
      const sinc = t === 0 ? 1 : Math.sin(arg) / arg;
      const win = 0.5 + 0.5 * Math.cos((Math.PI * t) / half);
      s += x[k] * sinc * win;
      w += sinc * win;
    }
    out.push(w ? s / w : 0);
    pos += rate;
  }
  return Float32Array.from(out);
}
