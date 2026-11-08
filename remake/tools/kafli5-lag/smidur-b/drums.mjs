// smidur-b's drums, all synthesized: a big taiko, mid toms (okedo), a tight shime for rolls, a deep frame drum (dum and tek),
// pitched log drums, a shaker, group claps and group stomps. Each returns a mono Float32Array, deterministic for its seed.
// Membranes are modal (circular-membrane ratios), struck with a noise burst; the low ones also speak in the mids (shell, stick)
// so a tablet speaker hears them.
import { SR, rng, noise, modes, expEnv, mul, bp, lp, hp, peak, softClip, scale, addInto, edgeFade } from './dsp.mjs';

const MEMBRANE = [1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156];
const len = s => Math.round(s * SR);

/** Big taiko (odaiko): low boom with a falling pitch, stick, shell. f0 its fundamental, v 0..1. */
export function taiko(v, seed, { f0 = 65.41, decay = 1 } = {}) {
  const r = rng(seed);
  const n = len(1.9);
  const amps = [0.8, 0.55, 0.38, 0.3, 0.2, 0.13, 0.09];
  const taus = [0.4, 0.3, 0.22, 0.19, 0.15, 0.12, 0.1];
  const body = modes(n, MEMBRANE.map((m, i) => ({ f: f0 * m * (1 + (r() - 0.5) * 0.004), amp: amps[i], tau: taus[i] * decay * (0.8 + 0.2 * v), phase: 0 })),
    { bend: 0.42 + 0.1 * v, bendTau: 0.028 });
  // stick and skin: a band of noise that falls fast
  const hitN = len(0.08);
  const hit = noise(hitN, seed + 1);
  bp(hit, 900 + 900 * v, 0.7);
  mul(hit, expEnv(hitN, 0.0008, 0.012 + 0.006 * v));
  // the shell: a darker resonant knock in the low mids
  const shellN = len(0.3);
  const shell = noise(shellN, seed + 2);
  bp(shell, 210, 5);
  mul(shell, expEnv(shellN, 0.001, 0.07));
  const out = new Float32Array(n);
  addInto(out, body, 0, 0.9);
  addInto(out, hit, 0, 0.35 * v + 0.1);
  addInto(out, shell, 0, 2.2);
  softClip(out, 1.4);
  hp(out, 42); hp(out, 42);
  peak(out, 190, 1.1, 4); // low-mid weight a tablet still plays
  scale(out, 0.25 + 0.75 * v ** 1.3);
  return edgeFade(out, 0.02);
}

/** Mid tom (okedo / nagado), f0 90-220 Hz. */
export function tom(v, seed, f0 = 130.81) {
  const r = rng(seed);
  const n = len(0.9);
  const amps = [1, 0.55, 0.35, 0.3, 0.18];
  const taus = [0.3, 0.16, 0.11, 0.1, 0.07];
  const body = modes(n, MEMBRANE.slice(0, 5).map((m, i) => ({ f: f0 * m * (1 + (r() - 0.5) * 0.006), amp: amps[i], tau: taus[i], phase: 0 })),
    { bend: 0.22, bendTau: 0.022 });
  const hitN = len(0.05);
  const hit = noise(hitN, seed + 1);
  bp(hit, 1600 + 1200 * v, 0.8);
  mul(hit, expEnv(hitN, 0.0005, 0.009));
  const out = new Float32Array(n);
  addInto(out, body, 0, 0.8);
  addInto(out, hit, 0, 0.45);
  softClip(out, 1.3);
  hp(out, 50);
  scale(out, 0.2 + 0.8 * v ** 1.2);
  return edgeFade(out, 0.02);
}

/** Shime-daiko: high, tight, cracking; the roll drum of the riser. */
export function shime(v, seed, f0 = 440) {
  const n = len(0.32);
  const body = modes(n, [1, 1.594, 2.136, 2.296].map((m, i) => ({ f: f0 * m, amp: [1, 0.6, 0.4, 0.3][i], tau: [0.07, 0.05, 0.035, 0.03][i] })),
    { bend: 0.08, bendTau: 0.01 });
  const hitN = len(0.06);
  const hit = noise(hitN, seed + 1);
  bp(hit, 2600, 0.9);
  mul(hit, expEnv(hitN, 0.0004, 0.01));
  const out = new Float32Array(n);
  addInto(out, body, 0, 0.55);
  addInto(out, hit, 0, 0.7);
  lp(out, 7000);
  scale(out, 0.15 + 0.85 * v ** 1.2);
  return edgeFade(out, 0.01);
}

/** Deep frame drum, struck in the middle by a hand: soft attack, low round tone. */
export function frameDum(v, seed, f0 = 87.31) {
  const n = len(0.8);
  const body = modes(n, [1, 1.594, 2.136, 2.653].map((m, i) => ({ f: f0 * m, amp: [1, 0.4, 0.25, 0.12][i], tau: [0.34, 0.16, 0.1, 0.07][i] })),
    { bend: 0.14, bendTau: 0.03 });
  const thN = len(0.08);
  const th = noise(thN, seed + 1);
  lp(th, 700);
  mul(th, expEnv(thN, 0.003, 0.02));
  const out = new Float32Array(n);
  addInto(out, body, 0, 0.9);
  addInto(out, th, 0, 1.2);
  // a short ramp: a hand, not a stick
  for (let i = 0; i < len(0.004); i++) out[i] *= i / len(0.004);
  peak(out, 260, 1, 3);
  scale(out, 0.2 + 0.8 * v ** 1.2);
  return edgeFade(out, 0.02);
}

/** Frame drum struck at the rim: a ringing slap, the backbeat. */
export function frameTek(v, seed) {
  const n = len(0.25);
  const ring = modes(n, [{ f: 523, amp: 0.5, tau: 0.05 }, { f: 834, amp: 0.4, tau: 0.04 }, { f: 1187, amp: 0.3, tau: 0.03 }, { f: 1610, amp: 0.2, tau: 0.02 }]);
  const sl = noise(n, seed + 1);
  bp(sl, 1100, 1.2);
  mul(sl, expEnv(n, 0.0005, 0.03));
  const cr = noise(len(0.03), seed + 2);
  bp(cr, 3200, 1);
  mul(cr, expEnv(cr.length, 0.0003, 0.005));
  const out = new Float32Array(n);
  addInto(out, ring, 0, 0.6);
  addInto(out, sl, 0, 1.3);
  addInto(out, cr, 0, 0.5);
  hp(out, 250);
  scale(out, 0.15 + 0.85 * v ** 1.2);
  return edgeFade(out, 0.01);
}

/** A pitched log (slit) drum at frequency f: a hollow wooden tok. */
export function logDrum(v, seed, f) {
  const n = len(0.5);
  const body = modes(n, [{ f, amp: 1, tau: 0.17 }, { f: f * 2.01, amp: 0.18, tau: 0.06 }, { f: f * 2.76, amp: 0.22, tau: 0.04 }, { f: f * 5.4, amp: 0.06, tau: 0.015 }],
    { bend: -0.03, bendTau: 0.006 });
  const ck = noise(len(0.02), seed + 1);
  lp(ck, 2500);
  mul(ck, expEnv(ck.length, 0.0003, 0.003));
  const out = new Float32Array(n);
  addInto(out, body, 0, 0.8);
  addInto(out, ck, 0, 0.4);
  scale(out, 0.2 + 0.8 * v ** 1.1);
  return edgeFade(out, 0.01);
}

/** Shaker: a cloud of beads, forward (alt false) or back (alt true) stroke. */
export function shaker(v, seed, alt = false) {
  const n = len(0.14);
  const r = rng(seed);
  const out = new Float32Array(n);
  // beads: sparse clicks of noise, denser at the stroke's peak
  const env = expEnv(n, alt ? 0.016 : 0.007, alt ? 0.038 : 0.026);
  for (let i = 0; i < n; i++) {
    const dens = 0.25 + 0.75 * env[i];
    out[i] = r() < dens ? (r() * 2 - 1) * env[i] : 0;
  }
  bp(out, alt ? 4300 : 5200, 0.9);
  hp(out, 2200);
  lp(out, 7600);
  lp(out, 8500);
  scale(out, 1.6 * (0.1 + 0.9 * v ** 1.3));
  return edgeFade(out, 0.01);
}

/** A group clap: several hands, each a few bursts. */
export function clap(v, seed, hands = 4) {
  const r = rng(seed);
  const n = len(0.32);
  const out = new Float32Array(n);
  for (let h = 0; h < hands; h++) {
    const off = Math.round(r() * 0.012 * SR) + (h === 0 ? 0 : 0);
    const f = 1100 + r() * 700;
    const one = new Float32Array(n);
    const nz = noise(n, seed + 10 + h);
    // three quick bursts then a short tail
    for (const [t, tau, g] of [[0, 0.0025, 1], [0.008, 0.003, 0.9], [0.017, 0.004, 0.8], [0.026, 0.035, 0.7]]) {
      const s = Math.round(t * SR);
      const k = Math.exp(-1 / (tau * SR));
      let e = g;
      for (let i = s; i < n; i++) { one[i] += nz[i] * e; e *= k; if (e < 1e-4) break; }
    }
    bp(one, f, 1.1);
    addInto(out, one, h === 0 ? 0 : off, 1 / Math.sqrt(hands));
  }
  hp(out, 500);
  lp(out, 7000);
  scale(out, 1.4 * (0.15 + 0.85 * v ** 1.2));
  return edgeFade(out, 0.01);
}

/** A group stomp on a wooden floor: a low thud, the boards, the scuff. */
export function stomp(v, seed, feet = 3) {
  const r = rng(seed);
  const n = len(0.5);
  const out = new Float32Array(n);
  for (let k = 0; k < feet; k++) {
    const off = k === 0 ? 0 : Math.round((0.004 + r() * 0.012) * SR);
    const f = 52 + r() * 10;
    const body = modes(n, [{ f, amp: 1, tau: 0.11 }, { f: f * 3.4, amp: 0.35, tau: 0.06 }, { f: 185 + r() * 30, amp: 0.4, tau: 0.07 }], { bend: 1.0, bendTau: 0.018 });
    const th = noise(len(0.1), seed + 20 + k);
    lp(th, 900);
    mul(th, expEnv(th.length, 0.001, 0.018));
    addInto(out, body, off, 0.45 / Math.sqrt(feet));
    addInto(out, th, off, 1.1 / Math.sqrt(feet));
  }
  softClip(out, 1.5);
  hp(out, 45);
  peak(out, 400, 1, 2);
  scale(out, 0.2 + 0.8 * v ** 1.2);
  return edgeFade(out, 0.02);
}

/** A soft rising noise sweep for the riser: seconds long, band-passed upward, swelling. */
export function sweep(seconds, seed, { f0 = 300, f1 = 4200 } = {}) {
  const n = len(seconds);
  const nz = noise(n, seed);
  // pinkish: two one-pole low-passes mixed
  const out = new Float32Array(n);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < n; i++) { s1 = 0.97 * s1 + 0.03 * nz[i]; s2 = 0.6 * s2 + 0.4 * nz[i]; out[i] = s1 * 2.5 + s2 * 0.5; }
  // moving band
  let ic1 = 0, ic2 = 0;
  const k = 2 - 2 * 0.55;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = f0 * (f1 / f0) ** (t * t);
    const g = Math.tan(Math.PI * f / SR);
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = out[i] - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
    out[i] = v1 * (t ** 1.6);
  }
  lp(out, 7000);
  return edgeFade(out, 0.03, 0.05);
}
