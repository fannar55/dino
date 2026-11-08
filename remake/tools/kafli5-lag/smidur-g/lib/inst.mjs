// The band's voices, each a function that renders one note to a mono Float32Array (the note plus its ring).
// Horns and reeds are additive (harmonics by a recurrence, their weights at a control rate): brightness follows loudness as in
// real brass (Risset), formants shape the reeds, pitch scoops into notes and vibrato blooms on long ones. Piano, vibes and bass are
// additive with per-partial decay; the guitar is a Karplus-Strong string; the drums are noise and metal made per hit.
import { SR, TAU, rng, lp, hp, bp, peak, svf, filt, biquad } from './dsp.mjs';

const CTRL = 32; // control block (samples)

/**
 * The additive core: a tone whose pitch (Hz) and harmonic weights change over time. `pitch(t)` gives Hz at time t (s);
 * `weights(t, f0, out)` fills out[k-1] with harmonic k's amplitude. Returns length `n` samples.
 */
function additive(n, K, pitch, weights) {
  const y = new Float32Array(n);
  const w0 = new Float64Array(K);
  const w1 = new Float64Array(K);
  let phase = 0;
  let f0 = pitch(0);
  weights(0, f0, w0);
  for (let b = 0; b < n; b += CTRL) {
    const tEnd = Math.min(n, b + CTRL) / SR;
    const fEnd = pitch(tEnd);
    weights(tEnd, fEnd, w1);
    const len = Math.min(CTRL, n - b);
    const kMax = Math.min(K, Math.floor((SR * 0.45) / Math.max(f0, fEnd)));
    for (let i = 0; i < len; i++) {
      const a = i / len;
      const f = f0 + (fEnd - f0) * a;
      phase += (TAU * f) / SR;
      if (phase > TAU) phase -= TAU;
      const s1 = Math.sin(phase);
      const c2 = 2 * Math.cos(phase);
      let sPrev = 0;
      let s = s1;
      let acc = 0;
      for (let k = 0; k < kMax; k++) {
        acc += s * (w0[k] + (w1[k] - w0[k]) * a);
        const next = c2 * s - sPrev;
        sPrev = s;
        s = next;
      }
      y[b + i] = acc;
    }
    f0 = fEnd;
    w0.set(w1);
  }
  return y;
}

/** A note's loudness shape: attack (s) with a small overshoot, a sustain that sags, a release. Returns A(t). */
function shape({ attack, dur, release, sag = 0.12, overshoot = 0.1, swell = 0 }) {
  return t => {
    let a;
    if (t < attack) a = (t / attack) ** 1.5 * (1 + overshoot);
    else if (t < attack + 0.06) a = 1 + overshoot * (1 - (t - attack) / 0.06);
    else a = 1;
    if (t > attack) a *= 1 - sag * Math.min(1, (t - attack) / 1.2);
    if (swell) a *= 1 - swell + swell * Math.min(1, t / Math.max(0.05, dur * 0.8)); // crescendo through the note
    if (t > dur) a *= Math.exp(-(t - dur) / release);
    return a;
  };
}

/** Pitch over time: a scoop from below, delayed vibrato, a slow drift, and optional doit (up) at the end or a glide in. */
function pitchCurve(hz, dur, r, { scoop = 25, scoopTime = 0.035, vib = 0, vibRate = 5.4, vibDelay = 0.22, doit = 0, from = 0, glide = 0.06 }) {
  const drift = r() * TAU;
  const vibPhase = r() * TAU;
  return t => {
    let c = -scoop * Math.exp(-t / scoopTime);
    if (from && t < glide) c += from * (1 - t / glide) ** 2; // a smear in from `from` cents away
    if (vib && t > vibDelay) c += vib * Math.min(1, (t - vibDelay) / 0.25) * Math.sin(TAU * vibRate * t + vibPhase);
    c += 3 * Math.sin(TAU * 0.7 * t + drift);
    if (doit && t > dur - 0.02) c += doit * Math.min(1, (t - dur + 0.02) / 0.14) ** 1.5;
    return hz * 2 ** (c / 1200);
  };
}

const HORN = {
  trumpet: { fmin: 650, fmax: 6500, tilt: 0.12, formant: [[1300, 900, 1.2], [2600, 900, 0.5]], attack: 0.022, release: 0.07 },
  trombone: { fmin: 380, fmax: 3200, tilt: 0.12, formant: [[600, 400, 1.0], [1300, 700, 0.5]], attack: 0.03, release: 0.09 },
  alto: { fmin: 1400, fmax: 6000, tilt: 0.15, formant: [[720, 380, 1.4], [1650, 600, 0.7], [2900, 900, 0.6]], attack: 0.03, release: 0.08, reed: true },
  tenor: { fmin: 1100, fmax: 5000, tilt: 0.15, formant: [[520, 300, 1.4], [1350, 550, 0.8], [2500, 900, 0.5]], attack: 0.032, release: 0.09, reed: true },
  bari: { fmin: 700, fmax: 3600, tilt: 0.15, formant: [[360, 220, 1.3], [1000, 450, 0.8], [2000, 800, 0.4]], attack: 0.035, release: 0.1, reed: true },
  clarinet: { fmin: 2200, fmax: 7000, tilt: 0.35, formant: [[1500, 700, 0.6], [3000, 1000, 0.3]], attack: 0.025, release: 0.08, odd: true },
};

/**
 * A horn or reed note. kind: trumpet | trombone | alto | tenor | bari | clarinet. dur (s) is how long it is held; vel 0..1.
 * opts: scoop, vib (cents), doit (cents), from (cents, a smear in), staccato, swell, mute ('harmon' | 'plunger'), wah (0..1 depth),
 * growl (0..1), seed.
 */
export function horn(kind, hz, dur, vel, opts = {}) {
  const p = HORN[kind];
  const r = rng(opts.seed ?? 1);
  const release = opts.staccato ? 0.035 : p.release;
  const n = Math.ceil((dur + release * 6 + 0.02) * SR);
  const env = shape({ attack: opts.attack ?? p.attack * (1.25 - vel * 0.5), dur, release, sag: opts.sag ?? 0.12, overshoot: opts.staccato ? 0.18 : 0.1, swell: opts.swell ?? 0 });
  const pitch = pitchCurve(hz, dur, r, {
    scoop: opts.scoop ?? (p.reed ? 18 : 28),
    vib: opts.vib ?? (dur > 0.5 ? (p.reed ? 16 : 9) : 0),
    vibRate: opts.vibRate ?? (p.reed ? 5.6 : 5.2),
    doit: opts.doit ?? 0,
    from: opts.from ?? 0,
    glide: opts.glide ?? 0.06,
  });
  const K = 40;
  const dyn = 0.35 + 0.65 * vel;
  const forms = p.formant;
  const weights = (t, f0, out) => {
    const a = env(t);
    const bright = p.fmin + (p.fmax - p.fmin) * Math.min(1.2, (a * dyn) ** 2);
    let norm = 0;
    for (let k = 1; k <= K; k++) {
      const f = k * f0;
      let w = Math.exp(-f / bright) * k ** -p.tilt;
      if (p.odd && f < 2200 && k % 2 === 0) w *= 0.22;
      let fm = 1;
      for (const [fc, bw, g] of forms) fm += g / (1 + ((f - fc) / bw) ** 2);
      w *= fm;
      if (k === 1 && !p.odd) w *= 0.75;
      out[k - 1] = w;
      norm += w * w;
    }
    const g = (a * vel ** 0.9) / Math.sqrt(norm + 1e-9);
    for (let k = 0; k < K; k++) out[k] *= g;
  };
  let y = additive(n, K, pitch, weights);
  // breath: noise at the attack (reeds a little all through)
  const noise = new Float32Array(n);
  for (let i = 0; i < n; i++) noise[i] = r() * 2 - 1;
  bp(noise, p.reed ? 2600 : 1800, 0.9);
  const breath = p.reed ? 0.05 : 0.03;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const atk = Math.exp(-t / 0.03);
    y[i] += noise[i] * env(t) * vel * (breath * 0.4 + breath * atk * 2);
  }
  if (opts.growl) {
    // a flutter growl: the tone shaken at ~30 Hz with some rasp
    const gr = opts.growl;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const m = 1 - gr * 0.45 * (0.5 + 0.5 * Math.sin(TAU * 31 * t + 2 * Math.sin(TAU * 7 * t)));
      y[i] = y[i] * m + noise[i] * env(t) * gr * 0.06;
    }
  }
  if (opts.mute === 'harmon') {
    // thin, buzzy, nasal: lows gone, a peak in the upper mids; the stem hand (wah) moves a band filter
    hp(y, 900, 0.7); hp(y, 700, 0.7);
    peak(y, 1900, 1.6, 7);
    peak(y, 3800, 2, 3);
  }
  if (opts.mute === 'plunger' || opts.wah) {
    const depth = opts.wah ?? 0.8;
    const closed = kind === 'trombone' ? 380 : 800;
    const open = kind === 'trombone' ? 1500 : 2600;
    const wahAt = opts.wahAt ?? 0.35; // when in the note the hand opens (0..1 of dur)
    const dry = Float32Array.from(y);
    const fc = i => {
      const t = i / SR;
      const o = Math.min(1, Math.max(0, (t - dur * wahAt) / 0.09));
      const close = t > dur ? Math.min(1, (t - dur) / 0.05) : 0;
      return closed + (open - closed) * o * (1 - close * 0.8);
    };
    svf(y, fc, 2.2, 'bpn');
    const mix = depth;
    for (let i = 0; i < n; i++) y[i] = y[i] * 1.5 * mix + dry[i] * (1 - mix) * 0.7;
  }
  return y;
}

/** A vibraphone note with its motor (phase from absolute time `at`, s), mallet click; damped after dur unless `ring`. */
export function vibes(hz, dur, vel, { at = 0, ring = false, seed = 1, motor = 5.6, depth = 0.38 } = {}) {
  const r = rng(seed);
  const tail = ring ? 2.2 : 0.25;
  const n = Math.ceil((dur + tail) * SR);
  const y = new Float32Array(n);
  const modes = [
    [1, 1, 1.6],
    [3.984, 0.22 * (0.5 + vel), 0.28],
    [9.95, 0.07 * vel, 0.07],
  ];
  for (const [ratio, amp, tau] of modes) {
    const f = hz * ratio;
    if (f > SR * 0.45) continue;
    const w = (TAU * f) / SR;
    let ph = r() * 0.3;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let e = Math.exp(-t / tau);
      if (!ring && t > dur) e *= Math.exp(-(t - dur) / 0.06);
      y[i] += Math.sin(ph) * amp * e;
      ph += w;
    }
  }
  // motor tremolo on the whole bar, mallet click
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const m = 1 - depth * (0.5 - 0.5 * Math.cos(TAU * motor * (at + t)));
    const atk = Math.min(1, t / 0.0015);
    y[i] *= m * atk * vel;
  }
  const click = new Float32Array(Math.round(0.006 * SR));
  for (let i = 0; i < click.length; i++) click[i] = (r() * 2 - 1) * Math.exp(-i / (0.0012 * SR));
  lp(click, 3500);
  for (let i = 0; i < click.length; i++) y[i] += click[i] * 0.12 * vel;
  return y;
}

/** A piano note: stretched partials, two strings each (beating), per-partial two-stage decay, hammer, damper after dur. */
export function piano(hz, dur, vel, { seed = 1 } = {}) {
  const r = rng(seed);
  const n = Math.ceil((dur + 0.35) * SR);
  const y = new Float32Array(n);
  const B = 0.00035 * (hz / 261.6) ** 0.5;
  const tau0 = Math.min(6, Math.max(0.5, 3.2 * (261.6 / hz) ** 0.6));
  const bright = 2600 + 6500 * vel;
  for (let k = 1; k <= 28; k++) {
    const f = k * hz * Math.sqrt(1 + B * k * k);
    if (f > SR * 0.45) break;
    const amp = (k ** -0.85) * Math.exp(-f / bright) * (k === 1 ? 0.9 : 1);
    if (amp < 0.002) continue;
    const tau = tau0 / (1 + 0.12 * (k - 1) + f / 6000);
    const det = 1 + (r() - 0.5) * 0.0012;
    const w1 = (TAU * f) / SR;
    const w2 = w1 * det;
    let p1 = r() * TAU;
    let p2 = r() * TAU;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let e = 0.65 * Math.exp(-t / (tau * 0.22)) + 0.35 * Math.exp(-t / tau);
      if (t > dur) e *= Math.exp(-(t - dur) / 0.07);
      y[i] += (Math.sin(p1) + Math.sin(p2)) * 0.5 * amp * e;
      p1 += w1;
      p2 += w2;
    }
  }
  // hammer thump
  const hm = Math.round(0.012 * SR);
  const th = new Float32Array(hm);
  for (let i = 0; i < hm; i++) th[i] = (r() * 2 - 1) * Math.exp(-i / (0.002 * SR));
  lp(th, 1200 + 2500 * vel);
  for (let i = 0; i < hm; i++) y[i] += th[i] * 0.25 * vel;
  for (let i = 0; i < n; i++) y[i] *= vel * Math.min(1, i / 40);
  return y;
}

/** An upright bass pizzicato: harmonics strong in the mids (it must speak on a tablet), a finger thump, a slight pitch sag. */
export function bass(hz, dur, vel, { seed = 1, slide = 0 } = {}) {
  const r = rng(seed);
  const n = Math.ceil((dur + 0.12) * SR);
  const y = new Float32Array(n);
  const amps = [0.75, 1.0, 0.85, 0.62, 0.48, 0.34, 0.24, 0.17, 0.12, 0.08, 0.06, 0.045, 0.03, 0.02];
  const tau0 = 0.75;
  const lift = amps.map((_, j) => { const f = (j + 1) * hz; return f < 60 ? 0.6 : 1 + 0.9 * Math.exp(-(Math.log2(f / 380) ** 2) / 1.1); });
  for (let k = 1; k <= amps.length; k++) {
    let ph = r() * 0.2;
    const tau = tau0 / (1 + 0.32 * (k - 1));
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const sag = 1 + 0.006 * Math.exp(-t / 0.03) + (slide ? (slide / 1200) * Math.LN2 * Math.exp(-t / 0.05) : 0);
      const f = k * hz * sag;
      if (f > SR * 0.45) break;
      ph += (TAU * f) / SR;
      let e = Math.exp(-t / tau) * (0.85 + 0.15 * Math.exp(-t / 0.05));
      if (t > dur) e *= Math.exp(-(t - dur) / 0.04);
      y[i] += Math.sin(ph) * amps[k - 1] * lift[k - 1] * e;
    }
  }
  // finger: a soft thump with a little string click
  const fm = Math.round(0.025 * SR);
  const th = new Float32Array(fm);
  for (let i = 0; i < fm; i++) th[i] = (r() * 2 - 1) * Math.exp(-i / (0.004 * SR));
  lp(th, 1100);
  for (let i = 0; i < fm; i++) y[i] += th[i] * 0.35;
  // a gentle saturation adds the growl that carries pitch on small speakers
  for (let i = 0; i < n; i++) {
    const v = y[i] * 0.9;
    y[i] = Math.tanh(v * 1.4) / 1.4;
    y[i] *= vel * Math.min(1, i / 30);
  }
  return y;
}

/** One string, Karplus-Strong, damped after dur (a Freddie Green chunk lets go fast). */
function ksString(hz, dur, vel, r, { bright = 0.5, damp = 0.025 } = {}) {
  const n = Math.ceil((dur + damp * 8) * SR);
  const y = new Float32Array(n);
  const period = SR / hz;
  const N = Math.floor(period);
  const frac = period - N;
  const buf = new Float32Array(N + 2);
  for (let i = 0; i < buf.length; i++) buf[i] = r() * 2 - 1;
  // shape the pluck: darker for soft strokes
  let z = 0;
  const a = 0.25 + 0.6 * bright * vel;
  for (let i = 0; i < buf.length; i++) { z = z + a * (buf[i] - z); buf[i] = z; }
  let idx = 0;
  let last = 0;
  const loss = 0.996;
  // allpass for the fractional delay
  const c = (1 - frac) / (1 + frac);
  let apX = 0;
  let apY = 0;
  for (let i = 0; i < n; i++) {
    const cur = buf[idx];
    const nxt = buf[(idx + 1) % N];
    let v = 0.5 * (cur + nxt) * loss;
    const ap = c * v + apX - c * apY;
    apX = v;
    apY = ap;
    v = ap;
    buf[idx] = v;
    idx = (idx + 1) % N;
    const t = i / SR;
    let e = 1;
    if (t > dur) e = Math.exp(-(t - dur) / damp);
    y[i] = cur * e;
    last = cur;
  }
  return y;
}

/** A rhythm-guitar chunk: the chord's strings strummed down (a few ms apart), short, through an archtop's body. */
export function guitarChunk(midis, dur, vel, { seed = 1 } = {}) {
  const r = rng(seed);
  const n = Math.ceil((dur + 0.3) * SR);
  const y = new Float32Array(n);
  midis.forEach((m, j) => {
    const hz = 440 * 2 ** ((m - 69) / 12);
    const s = ksString(hz, dur, vel, r, { bright: 0.45 });
    const off = Math.round((j * 0.006 + r() * 0.002) * SR);
    for (let i = 0; i < s.length && i + off < n; i++) y[i + off] += s[i] * (0.8 + 0.2 * r());
  });
  peak(y, 180, 1.2, 3);
  peak(y, 450, 1.0, 2);
  peak(y, 2500, 0.8, -4);
  hp(y, 90);
  lp(y, 5500);
  for (let i = 0; i < n; i++) y[i] *= vel * 0.45;
  return y;
}

// ---------------------------------------------------------------- drums

function noiseArr(n, r) {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = r() * 2 - 1;
  return x;
}
/** Metal: six detuned square partials (the 808 cymbal trick) plus noise, band-passed. */
function metal(n, r, base = 1, tune = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]) {
  const x = new Float32Array(n);
  for (const f0 of tune) {
    const f = f0 * base * (1 + (r() - 0.5) * 0.01);
    let ph = r();
    const inc = f / SR;
    for (let i = 0; i < n; i++) {
      ph += inc;
      if (ph >= 1) ph -= 1;
      x[i] += ph < 0.5 ? 1 : -1;
    }
  }
  return x;
}

/** A ride cymbal stroke: stick tick, a bell-ish ping and the wash. */
export function ride(vel, seed = 1, { bell = 0.3 } = {}) {
  const r = rng(seed);
  const n = Math.round(1.8 * SR);
  const y = new Float32Array(n);
  const m = metal(n, r, 2.6);
  hp(m, 3200, 0.8); hp(m, 2600, 0.8);
  lp(m, 11000);
  const nz = noiseArr(n, r);
  hp(nz, 5000);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    y[i] = m[i] * 0.05 * (Math.exp(-t / 0.9) * 0.6 + Math.exp(-t / 0.12) * 0.4) + nz[i] * 0.06 * Math.exp(-t / 0.35);
  }
  // ping partials
  for (const [f, a, tau] of [[612, 0.5, 0.5], [1689, 0.35, 0.4], [3300, 0.3, 0.3], [5120, 0.2, 0.25]]) {
    const w = (TAU * f * (1 + (r() - 0.5) * 0.004)) / SR;
    for (let i = 0; i < n; i++) y[i] += Math.sin(w * i) * a * bell * 0.15 * Math.exp(-i / (tau * SR));
  }
  // stick
  const st = noiseArr(Math.round(0.006 * SR), r);
  hp(st, 4000);
  for (let i = 0; i < st.length; i++) y[i] += st[i] * 0.35 * Math.exp(-i / (0.0012 * SR));
  for (let i = 0; i < n; i++) y[i] *= vel * Math.min(1, i / 8);
  return y;
}
/** A crash, soft-edged (no startle): metal and noise, slower attack. */
export function crash(vel, seed = 1) {
  const r = rng(seed);
  const n = Math.round(3 * SR);
  const m = metal(n, r, 1.9);
  const nz = noiseArr(n, r);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = m[i] * 0.04 + nz[i] * 0.22;
  hp(y, 2200, 0.7); hp(y, 1800, 0.7);
  lp(y, 9000);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    y[i] *= vel * Math.min(1, t / 0.012) * (Math.exp(-t / 1.3) * 0.75 + Math.exp(-t / 0.15) * 0.25);
  }
  return y;
}
/** Hi-hat: 'foot' (the chick on 2 and 4) or 'closed' (stick). */
export function hat(kind, vel, seed = 1) {
  const r = rng(seed);
  const n = Math.round((kind === 'foot' ? 0.09 : 0.07) * SR);
  const m = metal(n, r, 3.1);
  const nz = noiseArr(n, r);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = m[i] * 0.05 + nz[i] * 0.3;
  hp(y, 6500, 0.8);
  const tau = kind === 'foot' ? 0.022 : 0.016;
  for (let i = 0; i < n; i++) y[i] *= Math.exp(-i / (tau * SR)) * Math.min(1, i / 20);
  if (kind === 'foot') {
    const ck = noiseArr(n, r);
    bp(ck, 1100, 2);
    for (let i = 0; i < n; i++) y[i] += ck[i] * 0.2 * Math.exp(-i / (0.012 * SR));
  }
  for (let i = 0; i < n; i++) y[i] *= vel;
  return y;
}
/** A soft kick (feathered on every beat in this style), with a beater click so small speakers feel it. */
export function kick(vel, seed = 1) {
  const r = rng(seed);
  const n = Math.round(0.35 * SR);
  const y = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 52 + 70 * Math.exp(-t / 0.03);
    ph += (TAU * f) / SR;
    y[i] = Math.sin(ph) * Math.exp(-t / 0.13) + Math.sin(2 * ph) * 0.25 * Math.exp(-t / 0.05);
  }
  const ck = noiseArr(Math.round(0.01 * SR), r);
  bp(ck, 2400, 1.2);
  for (let i = 0; i < ck.length; i++) y[i] += ck[i] * 0.3 * Math.exp(-i / (0.002 * SR));
  for (let i = 0; i < n; i++) y[i] *= vel;
  return y;
}
/** Snare: two drum modes and the wires. */
export function snare(vel, seed = 1, { rim = false } = {}) {
  const r = rng(seed);
  const n = Math.round(0.3 * SR);
  const y = new Float32Array(n);
  if (rim) {
    // cross-stick: a woody click
    for (const [f, a, tau] of [[520, 0.6, 0.03], [1350, 0.5, 0.018], [2900, 0.3, 0.01]]) {
      const w = (TAU * f) / SR;
      for (let i = 0; i < n; i++) y[i] += Math.sin(w * i) * a * Math.exp(-i / (tau * SR));
    }
    const nz = noiseArr(Math.round(0.01 * SR), r);
    bp(nz, 3000, 1.5);
    for (let i = 0; i < nz.length; i++) y[i] += nz[i] * 0.4 * Math.exp(-i / (0.002 * SR));
  } else {
    for (const [f, a, tau] of [[188, 0.7, 0.06], [336, 0.4, 0.04]]) {
      const w = (TAU * f) / SR;
      for (let i = 0; i < n; i++) y[i] += Math.sin(w * i) * a * Math.exp(-i / (tau * SR));
    }
    const nz = noiseArr(n, r);
    bp(nz, 3800, 0.6);
    hp(nz, 900);
    for (let i = 0; i < n; i++) y[i] += nz[i] * 0.75 * Math.exp(-i / (0.085 * SR));
  }
  for (let i = 0; i < n; i++) y[i] *= vel * Math.min(1, i / 10);
  return y;
}
/** A brush: 'sweep' (a swish over `len` s) or 'tap'. */
export function brush(kind, vel, seed = 1, len = 0.4) {
  const r = rng(seed);
  const n = Math.round((kind === 'sweep' ? len + 0.1 : 0.15) * SR);
  const y = noiseArr(n, r);
  bp(y, kind === 'sweep' ? 3400 : 2600, 0.7);
  hp(y, 700);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = kind === 'sweep' ? Math.sin(Math.PI * Math.min(1, t / len)) ** 1.5 * 0.35 : Math.exp(-t / 0.04);
    y[i] *= e * vel;
  }
  return y;
}
/** A tom for soft fills. */
export function tom(hz, vel, seed = 1) {
  const r = rng(seed);
  const n = Math.round(0.5 * SR);
  const y = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * hz * (1 + 0.25 * Math.exp(-t / 0.04))) / SR;
    y[i] = Math.sin(ph) * Math.exp(-t / 0.22) + Math.sin(ph * 1.5) * 0.2 * Math.exp(-t / 0.08);
  }
  const nz = noiseArr(Math.round(0.03 * SR), r);
  bp(nz, 1800, 1);
  for (let i = 0; i < nz.length; i++) y[i] += nz[i] * 0.25 * Math.exp(-i / (0.006 * SR));
  for (let i = 0; i < n; i++) y[i] *= vel;
  return y;
}
/** A finger snap. */
export function snap(vel, seed = 1) {
  const r = rng(seed);
  const n = Math.round(0.12 * SR);
  const y = noiseArr(n, r);
  bp(y, 2300, 2.2);
  const y2 = noiseArr(n, r);
  hp(y2, 4500);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    y[i] = (y[i] * 1.6 * Math.exp(-t / 0.018) + y2[i] * 0.25 * Math.exp(-t / 0.006)) * Math.min(1, i / 6) * vel;
  }
  return y;
}
/** A temple block (the turtles' shells): a woody resonance at hz. */
export function block(hz, vel, seed = 1) {
  const r = rng(seed);
  const n = Math.round(0.28 * SR);
  const y = new Float32Array(n);
  for (const [ratio, a, tau] of [[1, 1, 0.075], [2.72, 0.35, 0.03], [4.9, 0.12, 0.012]]) {
    const w = (TAU * hz * ratio) / SR;
    const ph = r();
    for (let i = 0; i < n; i++) y[i] += Math.sin(w * i + ph) * a * Math.exp(-i / (tau * SR));
  }
  const nz = noiseArr(Math.round(0.004 * SR), r);
  bp(nz, hz * 2, 1.5);
  for (let i = 0; i < nz.length; i++) y[i] += nz[i] * 0.5;
  for (let i = 0; i < n; i++) y[i] *= vel * Math.min(1, i / 12);
  return y;
}
