// Measurements: section RMS (all and under 150 Hz), onsets per bar (spectral flux), the loop seam, call pitches and timing.
import { SR } from './io.mjs';
import { Biquad } from './dsp.mjs';
import { steady, cents } from './pitch.mjs';

const db = v => (v > 0 ? 20 * Math.log10(v) : -120);

export function mono(L, R) {
  const m = new Float32Array(L.length);
  for (let i = 0; i < L.length; i++) m[i] = (L[i] + R[i]) * 0.5;
  return m;
}
function rms(x, a, b) {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
}
export function lowpassed(x, f = 150) {
  const y = Float32Array.from(x);
  for (const q of [0.54, 1.31]) new Biquad('lp', f, q).run(y); // 4th-order Butterworth
  return y;
}

// radix-2 FFT (in place, real input packed into re/im)
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

/** Onset times (s) by log-magnitude spectral flux with an adaptive threshold. */
export function onsets(x, { win = 1024, hop = 256, delta = 0.35 } = {}) {
  const w = new Float64Array(win).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / win));
  let prev = null;
  const flux = [];
  for (let s = 0; s + win < x.length; s += hop) {
    const re = new Float64Array(win), im = new Float64Array(win);
    for (let i = 0; i < win; i++) re[i] = x[s + i] * w[i];
    fft(re, im);
    const mag = new Float64Array(win / 2);
    for (let k = 0; k < win / 2; k++) mag[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));
    let f = 0;
    if (prev) for (let k = 0; k < win / 2; k++) f += Math.max(0, mag[k] - prev[k]);
    flux.push(f);
    prev = mag;
  }
  const mean = flux.reduce((a, b) => a + b, 0) / flux.length;
  const out = [];
  const W = 8;
  for (let i = 1; i < flux.length - 1; i++) {
    let loc = 0;
    for (let k = Math.max(0, i - W); k <= Math.min(flux.length - 1, i + W); k++) loc += flux[k];
    loc /= 2 * W + 1;
    if (flux[i] > flux[i - 1] && flux[i] >= flux[i + 1] && flux[i] > loc + delta * mean && flux[i] > 0.3 * mean) {
      const t = (i * hop + win / 2) / SR;
      if (!out.length || t - out[out.length - 1] > 0.05) out.push(t);
    }
  }
  return out;
}

/** Per-section stats of a stereo mix. */
export function sectionStats(L, R, sections, spb) {
  const m = mono(L, R);
  const low = lowpassed(m, 150);
  const on = onsets(m);
  return sections.map(s => {
    const a = Math.round(s.startBeat * spb), b = Math.min(m.length, Math.round((s.startBeat + s.beats) * spb));
    const bars = s.beats / 4;
    const count = on.filter(t => t * SR >= a && t * SR < b).length;
    let peak = 0;
    for (let i = a; i < b; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
    return { id: s.id, rms: +db(rms(m, a, b)).toFixed(1), rmsLow: +db(rms(low, a, b)).toFixed(1), peak: +db(peak).toFixed(1), onsetsPerBar: +(count / bars).toFixed(1) };
  });
}

/** Per-bar RMS (dB) of a mono signal. */
export function barRms(x, spb, bars) {
  const out = [];
  for (let k = 0; k < bars; k++) out.push(+db(rms(x, Math.round(k * 4 * spb), Math.min(x.length, Math.round((k + 1) * 4 * spb)))).toFixed(1));
  return out;
}

/**
 * How cleanly the loop repeats: [S+skip, S+N) against [S-N+skip, S), so both sides are preceded by the same music (the bars before
 * S-N are the intro, whose tails would otherwise count). Worst and RMS difference in dB, and the loop's own RMS.
 */
export function loopSeam(st, startS, lenS, skipS = 0) {
  let d2 = 0, s2 = 0, worst = 0;
  for (const ch of [st.L, st.R]) {
    for (let i = skipS; i < lenS; i++) {
      const a = ch[startS + i], b = ch[startS - lenS + i];
      d2 += (a - b) ** 2;
      s2 += a * a;
      worst = Math.max(worst, Math.abs(a - b));
    }
  }
  const m = 2 * (lenS - skipS);
  return { loopRmsDb: +db(Math.sqrt(s2 / m)).toFixed(1), diffRmsDb: +db(Math.sqrt(d2 / m)).toFixed(1), worstDiffDb: +db(worst).toFixed(1) };
}

/** Pitch of one rendered call (dry), and where its attack lands against its beat. */
const pitchCache = new Map();
export function callCheck(entry, targetHz, beatSample) {
  const key = `${entry.file}|${entry.rate}|${entry.y.length}|${entry.mode}`;
  if (!pitchCache.has(key))
    pitchCache.set(key, steady(entry.y, { fmin: Math.max(60, entry.hz / 1.45), fmax: Math.min(5000, entry.hz * 1.45), win: 1024, hop: 128 }));
  const s = pitchCache.get(key);
  // attack: first sample of the placed call over 12% of its peak
  let peak = 0;
  for (const v of entry.y) peak = Math.max(peak, Math.abs(v));
  let on = 0;
  while (on < entry.y.length && Math.abs(entry.y[on]) < peak * 0.12) on++;
  const attackMs = ((entry.at + on - beatSample) / SR) * 1000;
  let c = s ? cents(s.hz, targetHz) : null;
  if (c !== null) c -= 1200 * Math.round(c / 1200); // any octave
  return { hz: s ? +s.hz.toFixed(1) : null, cents: c === null ? null : Math.round(c), attackMs: Math.round(attackMs) };
}

/** Startle check: the largest rise in 400 ms loudness (dB, RMS of the mono mix) from one window to the next, and where. */
export function biggestJump(x, win = 0.4) {
  const w = Math.round(win * SR);
  const lv = [];
  for (let s = 0; s + w <= x.length; s += Math.round(w / 4)) lv.push(db(rms(x, s, s + w)));
  let best = { db: -99, sec: 0 };
  for (let i = 4; i < lv.length; i++) {
    const d = lv[i] - lv[i - 4];
    if (d > best.db && lv[i] > -40) best = { db: +d.toFixed(1), sec: +((i * w) / 4 / SR).toFixed(2) };
  }
  return best;
}
export { fft };
