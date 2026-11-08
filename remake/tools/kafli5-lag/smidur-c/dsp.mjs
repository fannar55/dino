// smidur-c's small DSP kit: seeded noise, filters, a sinc resampler, a feedback-delay-network reverb, an echo, pitch and
// onset measures, and the ffmpeg in and out. Plain Node, no packages.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export const SR = 44100;
export const TAU = Math.PI * 2;

/** A seeded random source (mulberry32): () → [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A seed from any parts (strings, numbers). */
export function seedOf(...parts) {
  let h = 2166136261;
  for (const ch of parts.join('|')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const midiHz = m => 440 * 2 ** ((m - 69) / 12);
const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'F4', 'Bb3', 'C#5' → midi number. */
export function midi(name) {
  if (typeof name === 'number') return name;
  const m = /^([A-G])([b#]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`no note ${name}`);
  return 12 * (Number(m[3]) + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
export const hz = name => midiHz(midi(name));

// ---- biquads (RBJ cookbook), run over a whole buffer in place ----
export function biquadCoefs(type, f, q = 0.707, gainDb = 0) {
  const w = TAU * Math.min(f, SR * 0.49) / SR, cw = Math.cos(w), sw = Math.sin(w), alpha = sw / (2 * q);
  const A = 10 ** (gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'bp': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'peak': b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
    case 'hs': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break;
    }
    case 'ls': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break;
    }
    default: throw new Error(type);
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
export function biquad(x, type, f, q, gainDb) {
  const [b0, b1, b2, a1, a2] = biquadCoefs(type, f, q, gainDb);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y;
  }
  return x;
}
/** One biquad section as a per-sample filter object. */
export function makeBiquad(type, f, q, gainDb) {
  let [b0, b1, b2, a1, a2] = biquadCoefs(type, f, q, gainDb);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return {
    tick(v) { const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; return y; },
    set(t, ff, qq, g) { [b0, b1, b2, a1, a2] = biquadCoefs(t, ff, qq, g); },
  };
}
/** A time-varying state-variable lowpass (12 dB/oct) whose cutoff (Hz) at sample i is cutoff(i); in place. */
export function svfLowpass(x, cutoff, q = 0.6, every = 32) {
  let ic1 = 0, ic2 = 0, g = 0, k = 1 / q, a1 = 0, a2 = 0, a3 = 0;
  for (let i = 0; i < x.length; i++) {
    if (i % every === 0) {
      g = Math.tan(Math.PI * Math.min(cutoff(i), SR * 0.45) / SR);
      a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
    }
    const v3 = x[i] - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2; x[i] = v2;
  }
  return x;
}

/** Plays `x` at speed `rate` (rate > 1 is higher and shorter), a windowed-sinc resampler with an anti-alias cutoff. */
export function resample(x, rate) {
  if (Math.abs(rate - 1) < 1e-9) return Float32Array.from(x);
  const n = Math.floor((x.length - 1) / rate);
  const y = new Float32Array(n);
  const fc = Math.min(1, 1 / rate) * 0.94;
  const half = Math.ceil(12 / fc);
  for (let i = 0; i < n; i++) {
    const pos = i * rate, c = Math.floor(pos);
    let s = 0, wsum = 0;
    for (let k = c - half + 1; k <= c + half; k++) {
      if (k < 0 || k >= x.length) continue;
      const d = pos - k;
      const sinc = d === 0 ? 1 : Math.sin(Math.PI * fc * d) / (Math.PI * fc * d);
      const win = 0.5 + 0.5 * Math.cos(Math.PI * d / half);
      const w = fc * sinc * win;
      s += x[k] * w; wsum += w;
    }
    y[i] = s;
  }
  return y;
}

/** A stereo buffer of `seconds`. */
export const stereo = n => [new Float32Array(n), new Float32Array(n)];
/** Mixes mono `src` into stereo `dst` at sample `at`, gain and pan (-1 left .. 1 right, equal power). */
export function mixIn(dst, src, at, gain = 1, pan = 0) {
  const a = (pan + 1) * Math.PI / 4, gl = Math.cos(a) * gain * Math.SQRT2, gr = Math.sin(a) * gain * Math.SQRT2;
  const [L, R] = dst; const n = L.length;
  for (let i = 0; i < src.length; i++) {
    const j = at + i; if (j < 0) continue; if (j >= n) break;
    L[j] += src[i] * gl; R[j] += src[i] * gr;
  }
}
export function mixStereo(dst, src, at = 0, gain = 1) {
  for (let c = 0; c < 2; c++) {
    const d = dst[c], s = src[c];
    for (let i = 0; i < s.length; i++) { const j = at + i; if (j >= 0 && j < d.length) d[j] += s[i] * gain; }
  }
}

/**
 * A stereo feedback-delay-network reverb (8 lines, Householder matrix, damped lines, input diffusion). Returns the wet signal.
 */
export function reverb([inL, inR], { rt60 = 1.8, damp = 0.35, predelay = 0.012, size = 1, seed = 7, hfRt = null } = {}) {
  const n = inL.length;
  const base = [1123, 1361, 1597, 1871, 2111, 2393, 2647, 2909].map(v => Math.round(v * size));
  const lines = base.map(len => ({ buf: new Float32Array(len), p: 0, len, lp: 0 }));
  const gains = base.map(len => 10 ** (-3 * len / (rt60 * SR)));
  // damping: the line's lowpass pole, so HF decays faster
  const poles = base.map(() => damp);
  const pre = Math.round(predelay * SR);
  const preBuf = new Float32Array(pre + 1); let pp = 0;
  // input diffusers (allpass)
  const ap = [142, 107, 379, 277].map(len => ({ buf: new Float32Array(Math.round(len * size)), p: 0 }));
  const apg = 0.6;
  const outL = new Float32Array(n), outR = new Float32Array(n);
  const N = lines.length; const tmp = new Float64Array(N);
  for (let i = 0; i < n; i++) {
    let x = (inL[i] + inR[i]) * 0.5;
    preBuf[pp] = x; pp = (pp + 1) % preBuf.length; x = preBuf[pp];
    for (const a of ap) { const d = a.buf[a.p]; const v = x + apg * d; a.buf[a.p] = v; x = d - apg * v; a.p = (a.p + 1) % a.buf.length; }
    let sum = 0;
    for (let k = 0; k < N; k++) {
      const l = lines[k];
      let v = l.buf[l.p];
      l.lp = v * (1 - poles[k]) + l.lp * poles[k];
      tmp[k] = l.lp * gains[k]; sum += tmp[k];
    }
    const h = (2 / N) * sum;
    let oL = 0, oR = 0;
    for (let k = 0; k < N; k++) {
      const l = lines[k];
      const fb = tmp[k] - h;
      l.buf[l.p] = fb + x * (k % 2 ? 0.5 : -0.5);
      l.p = (l.p + 1) % l.len;
      if (k % 2) oR += tmp[k] * (k & 2 ? 1 : -1); else oL += tmp[k] * (k & 2 ? 1 : -1);
    }
    outL[i] = oL * 0.5; outR[i] = oR * 0.5;
  }
  return [outL, outR];
}

/** A tempo echo: `delay` samples, `feedback`, each repeat lowpassed and moved toward `pan` side. Returns the wet stereo. */
export function echo(mono, { delay, feedback = 0.35, lp = 2500, repeats = 3, pan = 0.6, gain = 0.5 }) {
  const n = mono.length;
  const out = stereo(n);
  let cur = Float32Array.from(mono);
  let g = gain;
  for (let r = 1; r <= repeats; r++) {
    cur = biquad(Float32Array.from(cur), 'lp', lp, 0.6);
    const shifted = new Float32Array(n);
    for (let i = 0; i + r * delay < n; i++) shifted[i + r * delay] = cur[i];
    mixIn(out, shifted, 0, g, r % 2 ? pan : pan * 0.4);
    g *= feedback;
  }
  return out;
}

// ---- measuring ----
/** YIN pitch of x[start .. start+win] between fmin and fmax: { hz, conf }. */
export function yin(x, start, win, fmin, fmax) {
  const maxT = Math.floor(SR / fmin), minT = Math.max(2, Math.floor(SR / fmax));
  if (start + win + maxT + 2 > x.length) return { hz: 0, conf: 0 };
  const d = new Float64Array(maxT + 2);
  for (let t = 1; t <= maxT + 1; t++) {
    let s = 0;
    for (let i = 0; i < win; i++) { const v = x[start + i] - x[start + i + t]; s += v * v; }
    d[t] = s;
  }
  const c = new Float64Array(maxT + 2); c[0] = 1; let run = 0;
  for (let t = 1; t <= maxT + 1; t++) { run += d[t]; c[t] = run > 0 ? d[t] * t / run : 1; }
  let best = -1;
  for (let t = minT; t <= maxT; t++) {
    if (c[t] < 0.12) { while (t + 1 <= maxT && c[t + 1] < c[t]) t++; best = t; break; }
  }
  if (best < 0) { let m = Infinity; for (let t = minT; t <= maxT; t++) if (c[t] < m) { m = c[t]; best = t; } }
  const a = c[best - 1], b = c[best], e = c[best + 1];
  const den = a - 2 * b + e; const off = den !== 0 ? (a - e) / (2 * den) : 0;
  return { hz: SR / (best + off), conf: 1 - b };
}
/** The median pitch over a span (frames of 2048 every 512), voiced frames only. */
export function medianPitch(x, from, to, fmin, fmax, minConf = 0.75) {
  const out = [];
  const win = Math.min(2048, Math.max(512, Math.floor(SR / fmin) * 3));
  for (let s = Math.max(0, from); s + win + SR / fmin + 4 < Math.min(to, x.length); s += 512) {
    const r = yin(x, s, win, fmin, fmax);
    if (r.conf >= minConf) out.push(r.hz);
  }
  if (!out.length) return { hz: 0, frames: 0 };
  out.sort((p, q) => p - q);
  return { hz: out[Math.floor(out.length / 2)], frames: out.length, lo: out[Math.floor(out.length * 0.2)], hi: out[Math.floor(out.length * 0.8)] };
}
export const cents = (f, ref) => 1200 * Math.log2(f / ref);

// ---- in and out ----
export function decodeMono(path) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
}
export function decodeStereo(path) {
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  const all = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  const n = all.length / 2; const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = all[2 * i]; R[i] = all[2 * i + 1]; }
  return [L, R];
}
/** Writes a 32-bit float stereo WAV. */
export function writeWav(path, [L, R]) {
  const n = L.length; const data = Buffer.alloc(n * 8);
  for (let i = 0; i < n; i++) { data.writeFloatLE(L[i], i * 8); data.writeFloatLE(R[i], i * 8 + 4); }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}
export function encodeMp3(wav, mp3) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', String(SR), '-ac', '2', mp3]);
}
export function peakOf([L, R]) {
  let p = 0; for (let i = 0; i < L.length; i++) { const a = Math.abs(L[i]), b = Math.abs(R[i]); if (a > p) p = a; if (b > p) p = b; }
  return p;
}
