// The band, synthesised: each function returns one dry mono note or hit as a Float32Array (time 0 = its attack).
import { SR } from './io.mjs';
import { rngFor, biquad, onePoleLP, svf } from './dsp.mjs';

const TAU = 2 * Math.PI;
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
/** Scale a hit so its peak is `vel` (the dB on the desk then means the same for every hit). */
function norm(out, vel) {
  let p = 0;
  for (let i = 0; i < out.length; i++) p = Math.max(p, Math.abs(out[i]));
  if (p > 0) for (let i = 0; i < out.length; i++) out[i] *= vel / p;
  return out;
}

// ---------------- strings ----------------
/**
 * Karplus-Strong electric guitar string with a moving pitch: hz(t) (Hz at time t) or a number; seconds held, then damped.
 * opts: bright (0..1, less loss filtering), pick (0..1 pick position), t60 (s), key (seed), hard (pick hardness 0..1)
 */
export function ksString(hz, seconds, { bright = 0.6, pick = 0.18, t60 = 2.2, key = 'ks', hard = 0.6, release = 0.06, vel = 1 } = {}) {
  const f = typeof hz === 'function' ? hz : () => hz;
  const n = Math.round((seconds + release + 0.02) * SR);
  const out = new Float32Array(n);
  const f0 = f(0);
  const maxD = Math.ceil(SR / 40) + 4;
  const buf = new Float32Array(maxD * 2);
  const size = buf.length;
  // excitation: a pick-shaped noise burst one period long, lowpassed by hardness, comb at the pick position
  const rng = rngFor(key);
  const P = Math.round(SR / f0);
  const exc = new Float32Array(P);
  const lp = onePoleLP(1500 + 9000 * hard);
  for (let i = 0; i < P; i++) exc[i] = lp(rng() * 2 - 1);
  const pd = Math.max(1, Math.round(pick * P));
  const shaped = new Float32Array(P);
  for (let i = 0; i < P; i++) shaped[i] = exc[i] - (i >= pd ? exc[i - pd] : 0);
  let mean = 0;
  for (const v of shaped) mean += v / P;
  let w = 0;
  const s = 0.5 - 0.42 * bright; // loss filter blend: 0.5 = classic average, smaller = brighter
  let prev = 0;
  const relN = Math.round(seconds * SR);
  for (let t = 0; t < n; t++) {
    const fr = f(t / SR);
    const D = SR / fr - s; // the loss filter delays the loop by s samples
    let rp = w - D;
    while (rp < 0) rp += size;
    const i0 = Math.floor(rp);
    const fr0 = rp - i0;
    const a = buf[i0 % size], b = buf[(i0 + 1) % size];
    const y = a + (b - a) * fr0; // read between the two
    let g = 10 ** (-3 / (fr * t60));
    if (t > relN) g *= 10 ** (-3 / (fr * release)); // the fretting hand lets go: -60 dB over `release`
    const filt = (1 - s) * y + s * prev;
    prev = y;
    let v = filt * g;
    if (t < P) v += (shaped[t] - mean) * vel;
    buf[w] = v;
    w = (w + 1) % size;
    out[t] = v;
  }
  // a short fade at the very end
  for (let i = 0; i < 64 && i < n; i++) out[n - 1 - i] *= i / 64;
  return out;
}

/** The twang: a pickup's bright resonance and a little drive on a guitar bus, in place. */
export function pickup(buf, { drive = 1.6, q = 1.2, freq = 2600, gain = 6 } = {}) {
  const hp = biquad('hp', 110, 0.7);
  const pk = biquad('peak', freq, q, gain);
  const lp = biquad('lp', 6500, 0.7);
  for (let i = 0; i < buf.length; i++) {
    const x = pk(hp(buf[i]));
    buf[i] = lp(Math.tanh(x * drive) / Math.tanh(drive));
  }
  return buf;
}

/** Vibrato on one note: a delay line swung by a slow sine (cents deep, Hz fast, starting after `delay` s), in place. */
export function vibrato(buf, { cents = 14, rate = 5.6, delay = 0.25, ramp = 0.3 } = {}) {
  const dev = 2 ** (cents / 1200) - 1;
  const D = dev / (TAU * rate); // seconds of swing for that pitch deviation
  const src = Float32Array.from(buf);
  const base = D * SR + 2;
  for (let t = 0; t < buf.length; t++) {
    const s = t / SR;
    const depth = s < delay ? 0 : Math.min(1, (s - delay) / ramp);
    const d = base + depth * D * SR * Math.sin(TAU * rate * s);
    const p = t - d;
    const i = Math.floor(p);
    const f = p - i;
    const a = i >= 0 ? src[i] : 0, b = i + 1 >= 0 ? src[i + 1] ?? 0 : 0;
    buf[t] = a + (b - a) * f;
  }
  return buf;
}

// ---------------- bass ----------------
/** Electric bass: additive pluck with its harmonics up in the mids (tablets hear 200-800 Hz), finger noise, soft drive. */
export function bass(hz, seconds, { vel = 1, key = 'b', bright = 0.75, slideFrom = 0 } = {}) {
  const n = Math.round((seconds + 0.08) * SR);
  const out = new Float32Array(n);
  const H = Math.min(28, Math.floor(4200 / hz));
  const rel = seconds;
  // each harmonic a rotating phasor with its own decay (no sin or exp per sample); a glide falls back to plain phases
  for (let h = 1; h <= H; h++) {
    const amp0 = h === 1 ? 1 : (0.9 * bright + 0.25) / h ** 1.15;
    const dec = Math.exp(-(0.8 + 1.6 * (h - 1) * (1.2 - bright)) / SR);
    if (!slideFrom) {
      const w = (TAU * hz * h) / SR;
      const c = Math.cos(w), sn = Math.sin(w);
      let re = 1, im = 0, amp = amp0;
      for (let t = 0; t < n; t++) {
        out[t] += amp * im;
        const r2 = re * c - im * sn;
        im = re * sn + im * c;
        re = r2;
        amp *= dec;
      }
    } else {
      let ph = 0, amp = amp0;
      for (let t = 0; t < n; t++) {
        const s = t / SR;
        ph += (TAU * h * (slideFrom + (hz - slideFrom) * Math.min(1, s / 0.06))) / SR;
        out[t] += amp * Math.sin(ph);
        amp *= dec;
      }
    }
  }
  for (let t = 0; t < n; t++) {
    const s = t / SR;
    out[t] *= Math.min(1, s / 0.004) * (s > rel ? Math.exp(-(s - rel) / 0.025) : 1);
  }
  // body: a soft drive makes 2nd/3rd harmonics; a mid bump where small speakers live
  // (the sub under 70 Hz eased: a tablet cannot play it and it only eats headroom)
  const pk = biquad('peak', 750, 0.8, 6);
  const pk2 = biquad('peak', 1400, 1.2, 2);
  const ls = biquad('lowshelf', 75, 0.7, -4);
  const lp = biquad('lp', 3600, 0.7);
  const rng = rngFor(key);
  for (let t = 0; t < n; t++) {
    const pluck = t < 300 ? (rng() * 2 - 1) * 0.12 * (1 - t / 300) : 0;
    out[t] = lp(pk2(pk(ls(Math.tanh(2.0 * (out[t] * 0.8 + pluck)) * vel))));
  }
  return out;
}

// ---------------- keys ----------------
const tableCache = new Map();
/** One band-limited period of a combo-organ voice (8' + 4' square-ish and a reedy 2 2/3') for a pitch. */
function organTable(hz, tone) {
  const key = `${Math.round(hz)}:${tone}`;
  if (tableCache.has(key)) return tableCache.get(key);
  const N = 2048;
  const tab = new Float32Array(N);
  const lim = 7000;
  for (let h = 1; h * hz < lim && h < 120; h++) {
    let a = 0;
    if (h % 2 === 1) a += 1 / h; // 8' square
    if (h % 2 === 0 && (h / 2) % 2 === 1) a += 0.55 / (h / 2); // 4' square (odd harmonics of 2f)
    if (h % 3 === 0) a += 0.18 / (h / 3); // a touch of 2 2/3'
    a *= Math.exp(-(((h * hz) / (lim * (0.35 + 0.5 * tone))) ** 2));
    for (let i = 0; i < N; i++) tab[i] += a * Math.sin((TAU * h * i) / N);
  }
  tableCache.set(key, tab);
  return tab;
}
/** A combo-organ chord: hzs held `seconds` (attack a, release r), with its own 6 Hz vibrato. */
export function organ(hzs, seconds, { a = 0.006, r = 0.05, tone = 0.6, vib = 7, key = 'o', swell = 0 } = {}) {
  const n = Math.round((seconds + r + 0.01) * SR);
  const out = new Float32Array(n);
  const rng = rngFor(key);
  for (const hz of hzs) {
    const tab = organTable(hz, tone);
    let p = rng() * 2048;
    for (let t = 0; t < n; t++) {
      const s = t / SR;
      const fm = 1 + (2 ** (vib / 1200) - 1) * Math.sin(TAU * 6.1 * s);
      p += (hz * fm * 2048) / SR;
      if (p >= 2048) p -= 2048;
      const i = p | 0;
      const f = p - i;
      const v = tab[i] + (tab[(i + 1) & 2047] - tab[i]) * f;
      let e = s < a ? s / a : 1;
      if (swell) e *= Math.min(1, s / swell) ** 1.5;
      if (s > seconds) e *= Math.exp(-(s - seconds) / (r / 5));
      out[t] += (v * e) / hzs.length ** 0.6;
    }
  }
  for (let i = 0; i < 128 && i < n; i++) out[n - 1 - i] *= i / 128;
  // key click
  for (let t = 0; t < 120 && t < n; t++) out[t] += (rng() * 2 - 1) * 0.05 * (1 - t / 120);
  return out;
}

/** Marimba bar (modal): partials 1, 4, 10 with their own decays, a mallet knock, resonator sustain. */
export function marimba(hz, { vel = 1, soft = 0.4, len = 1.6 } = {}) {
  const n = Math.round(len * SR);
  const out = new Float32Array(n);
  const t60f = Math.max(0.35, 1.6 - (hz - 200) / 900);
  const modes = [
    [1, 1, t60f],
    [3.98, 0.32 * (1 - soft * 0.6), t60f * 0.28],
    [9.85, 0.11 * (1 - soft * 0.8), t60f * 0.1],
  ];
  for (const [r, amp, t60] of modes) {
    const f = hz * r;
    if (f > 16000) continue;
    const k = 6.9 / t60;
    for (let t = 0; t < n; t++) {
      const s = t / SR;
      out[t] += amp * Math.sin(TAU * f * s) * Math.exp(-k * s) * Math.min(1, s / 0.0012);
    }
  }
  // mallet: a short soft knock
  const lp = biquad('lp', 1800 + 2500 * (1 - soft), 0.7);
  const rng = rngFor('m' + hz);
  for (let t = 0; t < 220; t++) out[t] += lp((rng() * 2 - 1) * 0.25 * (1 - t / 220));
  for (let t = 0; t < n; t++) out[t] *= vel;
  return out;
}

// ---------------- drums and hand percussion ----------------
/** A membrane: circular-membrane modes over a pitch drop; `damp` short for slaps and mutes; `slap` adds the crack. */
export function membrane(hz, { t60 = 0.35, drop = 0.18, dropT = 0.012, slap = 0, key = 'mem', vel = 1, modes = [1, 1.594, 2.136, 2.296, 2.653], amps = [1, 0.5, 0.32, 0.22, 0.14], body = 1 } = {}) {
  const len = Math.max(t60, 0.08) * 1.2 + 0.02;
  const n = Math.round(len * SR);
  const out = new Float32Array(n);
  modes.forEach((r, j) => {
    let p = 0;
    const k = 6.9 / (t60 * (j === 0 ? 1 : 0.7 / (1 + j * 0.25)));
    for (let t = 0; t < n; t++) {
      const s = t / SR;
      const f = hz * r * (1 + drop * Math.exp(-s / dropT));
      p += (TAU * f) / SR;
      out[t] += body * amps[j] * Math.sin(p) * Math.exp(-k * s) * Math.min(1, s / 0.0008);
    }
  });
  const rng = rngFor(key);
  const bp = biquad('bp', 2400, 0.8);
  const hp = biquad('hp', 900, 0.7);
  const nlen = Math.round((slap ? 0.035 : 0.006) * SR);
  for (let t = 0; t < nlen && t < n; t++) {
    const e = Math.exp(-t / (nlen / 4));
    out[t] += hp(bp(rng() * 2 - 1)) * e * (slap ? 2.2 * slap : 0.35);
  }
  for (let t = 0; t < n; t++) out[t] *= vel;
  return norm(out, vel);
}

/** Güiro / guacharaca scrape: noise through a ridge train; long (down) or short (up) strokes. */
export function scrape(seconds, { ridge = 62, bright = 0.6, key = 'g', vel = 1 } = {}) {
  const n = Math.round((seconds + 0.02) * SR);
  const out = new Float32Array(n);
  const rng = rngFor(key);
  const bp = biquad('bp', 3000 + 2500 * bright, 1.1);
  const bp2 = biquad('bp', 5500 + 2000 * bright, 2.5);
  const hp = biquad('hp', 1400, 0.7);
  let ph = rng();
  for (let t = 0; t < n; t++) {
    const s = t / SR;
    const r = ridge * (1 + 0.25 * (s / seconds)); // the stick speeds up across the ridges
    ph += r / SR;
    const am = (0.5 + 0.5 * Math.cos(TAU * ph)) ** 6;
    const e = Math.min(1, s / 0.006) * (s > seconds ? Math.exp(-(s - seconds) / 0.006) : 1) * (0.7 + 0.3 * Math.sin((Math.PI * Math.min(s, seconds)) / seconds));
    const x = rng() * 2 - 1;
    out[t] = hp(bp(x) * 0.8 + bp2(x) * 0.5) * (0.25 + am) * e * vel;
  }
  return norm(out, vel);
}

/** Shaker / maracas / guasá: filtered noise with a grainy envelope. */
export function shake(seconds, { tone = 7000, key = 's', vel = 1, attack = 0.008 } = {}) {
  const n = Math.round((seconds + 0.03) * SR);
  const out = new Float32Array(n);
  const rng = rngFor(key);
  const bp = biquad('bp', tone, 0.9);
  const hp = biquad('hp', 3000, 0.7);
  for (let t = 0; t < n; t++) {
    const s = t / SR;
    const e = env(s, attack, seconds / 2.5);
    const grain = rng() < 0.35 ? 1 : 0.35;
    out[t] = hp(bp(rng() * 2 - 1)) * e * grain * vel;
  }
  for (let i = 0; i < 220 && i < n; i++) out[n - 1 - i] *= i / 220;
  return norm(out, vel);
}

/** A wooden click (claves, the timbal shell "cáscara", the tambora's rim "palo"). */
export function woodClick(hz, { t60 = 0.06, key = 'w', vel = 1, noise = 0.6 } = {}) {
  const n = Math.round((t60 * 1.3 + 0.01) * SR);
  const out = new Float32Array(n);
  const rng = rngFor(key);
  const bp = biquad('bp', hz * 2.2, 1.5);
  const k = 6.9 / t60;
  for (let t = 0; t < n; t++) {
    const s = t / SR;
    out[t] = (Math.sin(TAU * hz * s) * 0.8 + Math.sin(TAU * hz * 2.71 * s) * 0.25) * Math.exp(-k * s);
    if (t < 400) out[t] += bp(rng() * 2 - 1) * noise * Math.exp(-t / 70);
    out[t] *= vel * Math.min(1, s / 0.0004);
  }
  return norm(out, vel);
}

/** A small cowbell (campana / bongo bell): inharmonic partials, a strike, soft by default. */
export function cowbell({ hz = 820, vel = 1, t60 = 0.28, key = 'c', mouth = 0 } = {}) {
  const n = Math.round((t60 + 0.02) * SR);
  const out = new Float32Array(n);
  const parts = [[1, 1], [1.505, 0.6], [2.37, 0.25], [3.1, 0.12]];
  for (const [r, a] of parts) {
    const k = 6.9 / (t60 / r ** 0.5);
    for (let t = 0; t < n; t++) {
      const s = t / SR;
      out[t] += a * Math.sin(TAU * hz * r * s) * Math.exp(-k * s);
    }
  }
  const rng = rngFor(key);
  const bp = biquad('bp', 3200, 1);
  for (let t = 0; t < 300; t++) out[t] += bp(rng() * 2 - 1) * 0.6 * Math.exp(-t / 60);
  const lp = biquad('lp', mouth ? 1800 : 5200, 0.7);
  for (let t = 0; t < n; t++) out[t] = lp(out[t]) * vel * Math.min(1, t / 20);
  return norm(out, vel);
}

/** The kick/tambora body: a round low drum whose harmonics reach the mids (felt on big speakers, heard on small). */
export function lowDrum(hz, { t60 = 0.32, vel = 1, key = 'k', knock = 0.5 } = {}) {
  const n = Math.round((t60 + 0.05) * SR);
  const out = new Float32Array(n);
  let p = 0;
  for (let t = 0; t < n; t++) {
    const s = t / SR;
    const f = hz * (1 + 1.2 * Math.exp(-s / 0.018));
    p += (TAU * f) / SR;
    const e = Math.exp((-6.9 * s) / t60) * Math.min(1, s / 0.001);
    out[t] = (Math.sin(p) + 0.35 * Math.sin(2 * p + 0.3) + 0.18 * Math.sin(3 * p)) * e;
  }
  const rng = rngFor(key);
  const bp = biquad('bp', 1100, 0.9);
  for (let t = 0; t < 500; t++) out[t] += bp(rng() * 2 - 1) * knock * Math.exp(-t / 90);
  for (let t = 0; t < n; t++) out[t] = Math.tanh(out[t] * 1.3 * vel) * 0.85;
  return out;
}

/** A soft riser: noise through a sweeping lowpass, swelling to its end (the rise into the top). */
export function riser(seconds, { from = 400, to = 7000, key = 'r', vel = 1 } = {}) {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  const rng = rngFor(key);
  const f = svf(1.4);
  for (let t = 0; t < n; t++) {
    const u = t / n;
    const fc = from * (to / from) ** (u * u);
    out[t] = f(rng() * 2 - 1, fc) * u ** 2.2 * vel * (u > 0.97 ? (1 - u) / 0.03 : 1);
  }
  return out;
}
