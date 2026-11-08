// Measuring what cannot be heard: loudness (BS.1770), peaks, section shape (RMS, under 150 Hz, onsets a bar), pitch and timing
// of the animals' notes, and the loop's seam.
import { spawnSync } from 'node:child_process';
import { SR } from './io.mjs';
import { biquad } from './dsp.mjs';
import { yinFrame } from './pitch.mjs';

/** Integrated loudness (LUFS) of stereo Float32 channels, BS.1770-4 gating. */
export function lufs(L, R) {
  const kw = () => {
    const a = biquad('highshelf', 1681.97, 0.7072, 4.0);
    const b = biquad('hp', 38.13, 0.5003);
    return x => b(a(x));
  };
  const fl = kw(), fr = kw();
  const block = Math.round(0.4 * SR), hop = Math.round(0.1 * SR);
  const n = L.length;
  const sq = new Float64Array(Math.ceil(n / hop) + 1);
  // energy per 100 ms hop
  let acc = 0, h = 0, c = 0;
  for (let i = 0; i < n; i++) {
    const l = fl(L[i]), r = fr(R[i]);
    acc += l * l + r * r;
    if (++c === hop) { sq[h++] = acc; acc = 0; c = 0; }
  }
  const blocks = [];
  for (let i = 0; i + 4 <= h; i++) {
    const e = (sq[i] + sq[i + 1] + sq[i + 2] + sq[i + 3]) / block;
    blocks.push(e);
  }
  const ld = e => -0.691 + 10 * Math.log10(e + 1e-20);
  const abs = blocks.filter(e => ld(e) > -70);
  const m1 = abs.reduce((s, e) => s + e, 0) / abs.length;
  const rel = abs.filter(e => ld(e) > ld(m1) - 10);
  return ld(rel.reduce((s, e) => s + e, 0) / rel.length);
}

/** ffmpeg's ebur128 summary of a file: { I (LUFS), LRA, TP (dBTP) }. */
export function ebur(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const text = r.stderr;
  const summary = text.slice(text.lastIndexOf('Summary:'));
  const num = re => {
    const m = summary.match(re);
    return m ? parseFloat(m[1]) : null;
  };
  return { I: num(/I:\s+(-?[\d.]+) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/Peak:\s+(-?[\d.]+) dBFS/) };
}

/** Peak (sample) of channels, in dBFS. */
export function peakDb(...chans) {
  let p = 0;
  for (const c of chans) for (let i = 0; i < c.length; i++) p = Math.max(p, Math.abs(c[i]));
  return 20 * Math.log10(p + 1e-20);
}
/** True peak estimate (4x oversampled, windowed-sinc) of channels, dBTP. */
export function truePeakDb(...chans) {
  const taps = 32, os = 4;
  const kern = [];
  for (let p = 0; p < os; p++) {
    const k = [];
    for (let j = -taps / 2; j < taps / 2; j++) {
      const x = j - p / os;
      const s = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * x) / (taps / 2 + 1));
      k.push(s * w);
    }
    kern.push(k);
  }
  let peak = 0;
  for (const c of chans) {
    for (let i = taps; i < c.length - taps; i++) {
      if (Math.abs(c[i]) < 0.5 * peak && Math.abs(c[i + 1]) < 0.5 * peak) continue;
      for (let p = 1; p < os; p++) {
        let s = 0;
        const k = kern[p];
        for (let j = 0; j < taps; j++) s += c[i + j - taps / 2 + 1] * k[j];
        peak = Math.max(peak, Math.abs(s));
      }
      peak = Math.max(peak, Math.abs(c[i]));
    }
  }
  return 20 * Math.log10(peak + 1e-20);
}

/** RMS (dBFS) of a stereo stretch, and of its content under 150 Hz. */
export function rmsStretch(L, R, from, to) {
  const lp1 = biquad('lp', 150, 0.7071), lp2 = biquad('lp', 150, 0.7071);
  let e = 0, el = 0;
  // run the lowpass from a little before to settle
  const pre = Math.max(0, from - 4410);
  for (let i = pre; i < to; i++) {
    const m = (L[i] + R[i]) / 2;
    const lo = lp2(lp1(m));
    if (i >= from) {
      e += (L[i] * L[i] + R[i] * R[i]) / 2;
      el += lo * lo;
    }
  }
  const n = to - from;
  return { rms: 10 * Math.log10(e / n + 1e-20), low: 10 * Math.log10(el / n + 1e-20) };
}

/** Onsets: a high-frequency-weighted energy flux, peaks over an adaptive threshold. Returns onset sample indices. */
export function onsets(L, R) {
  const hop = 441, win = 1024;
  const hp = biquad('hp', 1500, 0.7);
  const m = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) m[i] = hp((L[i] + R[i]) / 2);
  const env = [];
  for (let s = 0; s + win < m.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + win; i++) e += m[i] * m[i];
    env.push(Math.log10(e + 1e-9));
  }
  const flux = env.map((v, i) => Math.max(0, v - (env[i - 1] ?? v)));
  const out = [];
  for (let i = 2; i < flux.length - 2; i++) {
    const lo = Math.max(0, i - 15), hi = Math.min(flux.length, i + 15);
    let mean = 0;
    for (let j = lo; j < hi; j++) mean += flux[j];
    mean /= hi - lo;
    if (flux[i] > 0.12 && flux[i] > mean * 1.6 && flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1]) {
      if (!out.length || i * hop - out[out.length - 1] > 0.06 * SR) out.push(i * hop);
    }
  }
  return out;
}

/** Pitch (Hz) of a mono buffer around sample `at` (a 2048 window), folded to the octave nearest `near`, with its clarity. */
export function pitchAt(x, at, near) {
  const size = 2048;
  const fmin = Math.max(50, near / 2.2), fmax = Math.min(4000, near * 2.2);
  const { hz, clarity } = yinFrame(x, Math.max(0, at), size, fmin, fmax);
  const f = hz * 2 ** Math.round(Math.log2(near / hz));
  return { hz: f, clarity };
}

/**
 * The heard attack (sample) of a note placed at `at`: on a 5 ms RMS envelope (2.5 ms hop) over [at-40 ms, at+150 ms], the first
 * point that rises 30% of the way from the level just before the window to the window's peak. Tails of earlier sounds raise
 * the floor, not the rise, so the new note's attack is found even over them.
 */
export function attackNear(x, at) {
  const hop = Math.round(0.0025 * SR), w = Math.round(0.005 * SR);
  const a = Math.max(0, at - Math.round(0.04 * SR)), b = Math.min(x.length - w, at + Math.round(0.15 * SR));
  const env = [];
  for (let s = a; s < b; s += hop) {
    let e = 0;
    for (let i = s; i < s + w; i++) e += x[i] * x[i];
    env.push(Math.sqrt(e / w));
  }
  const floor = Math.min(...env.slice(0, 6));
  const peak = Math.max(...env);
  const thr = floor + 0.3 * (peak - floor);
  const k = env.findIndex((v, i) => i >= 4 && v >= thr);
  return a + Math.max(0, k) * hop;
}
