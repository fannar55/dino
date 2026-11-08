// smidur-b's pitched instruments, all synthesized: low strings (the ostinato), a sub, a brass section (stabs, swells, tuba),
// trumpets for the tune, a string pad and a formant choir, a group chant (hey / ho), a flute, a kalimba, a xylophone, a low
// marimba, a glockenspiel. Each returns mono Float32Array, or { L, R } where the instrument is wide. Deterministic per seed.
import {
  SR, rng, midiHz, saw, pulse, sine, constF, glide, vibrato, noise, adsr, expEnv, mul, scale, addInto, edgeFade, softClip,
  svfLP, bp, lp, hp, peak, modes, onePoleLP,
} from './dsp.mjs';

const len = s => Math.max(1, Math.round(s * SR));

/** Low strings, marcato (the bass ostinato): cello + bass section on `midi`, `dur` s, v 0..1, bright 0..1.3. */
export function lowStrings(midi, dur, v, seed, { bright = 1, octaveDown = 0.45 } = {}) {
  const r = rng(seed);
  const rel = 0.07;
  const n = len(dur + rel + 0.02);
  const out = new Float32Array(n);
  const f = midiHz(midi);
  const voices = [-8, -2, 4, 9];
  for (const c of voices) {
    const ff = constF(n, f * 2 ** (c / 1200));
    addInto(out, saw(n, ff, r()), 0, 0.3);
  }
  if (octaveDown > 0) {
    for (const c of [-5, 5]) addInto(out, saw(n, f / 2 * 2 ** (c / 1200), r()), 0, 0.3 * octaveDown);
  }
  // bow bite: the cutoff opens on the attack and settles
  const base = (700 + 500 * v) * bright, top = (2600 + 1600 * v) * bright;
  const k = Math.exp(-1 / (0.07 * SR));
  let e = 1;
  const fc = new Float32Array(n);
  for (let i = 0; i < n; i++) { fc[i] = base + (top - base) * e; e *= k; }
  svfLP(out, fc, 0.12);
  // body: wood in the low mids and a presence a small speaker can play
  peak(out, 240, 1.1, 3);
  peak(out, 900, 1.2, 3);
  hp(out, 32);
  // rosin: a breath of noise on the attack
  const bow = noise(len(0.05), seed + 3);
  bp(bow, 2400, 1.2);
  mul(bow, expEnv(bow.length, 0.003, 0.012));
  addInto(out, bow, 0, 0.12 * v);
  mul(out, adsr(n, { a: 0.006, d: 0.09, s: 0.62, hold: dur, r: rel }));
  softClip(out, 1.2);
  scale(out, 0.3 + 0.7 * v);
  return edgeFade(out, 0.006);
}

/** Bowed long notes (the bass in the quiet parts): slow attack, dark. */
export function bowedBass(midi, dur, v, seed, { bright = 0.7 } = {}) {
  const r = rng(seed);
  const n = len(dur + 0.6);
  const out = new Float32Array(n);
  const f = midiHz(midi);
  for (const c of [-7, 0, 6]) {
    const ff = vibrato(constF(n, f * 2 ** (c / 1200)), 6, 4.6 + r(), 0.4, r());
    addInto(out, saw(n, ff, r()), 0, 0.33);
  }
  svfLP(out, 600 * bright + 250, 0.1);
  peak(out, 300, 1, 3);
  peak(out, 850, 1.2, 2);
  hp(out, 30);
  mul(out, adsr(n, { a: 0.25, d: 0.5, s: 0.85, hold: dur, r: 0.5, curve: 2 }));
  scale(out, 0.3 + 0.7 * v);
  return edgeFade(out, 0.01);
}

/** Pizzicato low string: the heartbeat of the quiet middle. */
export function pizz(midi, v, seed) {
  const f = midiHz(midi);
  const n = len(0.9);
  const out = modes(n, [{ f, amp: 1, tau: 0.22 }, { f: 2 * f, amp: 0.5, tau: 0.12 }, { f: 3 * f, amp: 0.25, tau: 0.08 }, { f: 4 * f, amp: 0.12, tau: 0.05 }], { bend: 0.01, bendTau: 0.01 });
  const ck = noise(len(0.01), seed);
  lp(ck, 1500);
  addInto(out, ck, 0, 0.2);
  for (let i = 0; i < len(0.003); i++) out[i] *= i / len(0.003);
  scale(out, 0.25 + 0.75 * v);
  return edgeFade(out, 0.02);
}

/** Sub bass under the big parts: sine plus a little second harmonic, the root held. */
export function sub(midi, dur, v) {
  const n = len(dur + 0.08);
  const f = midiHz(midi);
  const out = sine(n, f);
  addInto(out, sine(n, 2 * f), 0, 0.18);
  mul(out, adsr(n, { a: 0.012, d: 0.3, s: 0.8, hold: dur, r: 0.07 }));
  scale(out, v);
  return edgeFade(out, 0.006);
}

/**
 * Brass voice (one note): detuned saws, a scoop into the pitch, a filter that blares open and settles, vibrato on long notes.
 * kind: 'stab' (short and bold), 'swell' (slow crescendo), 'tpt' (a trumpet line), 'tuba' (low and round).
 */
export function brassNote(midi, dur, v, seed, { kind = 'stab', bright = 1 } = {}) {
  const r = rng(seed);
  const rel = kind === 'stab' ? 0.09 : kind === 'swell' ? 0.35 : 0.12;
  const n = len(dur + rel + 0.02);
  const f = midiHz(midi);
  const out = new Float32Array(n);
  const det = kind === 'tpt' ? [-4, 3] : kind === 'tuba' ? [-5, 0, 5] : [-7, -1, 6];
  for (const c of det) {
    const ff = glide(n, f * 2 ** ((c - 30) / 1200), f * 2 ** (c / 1200), 0.018);
    if (dur > 0.45) vibrato(ff, kind === 'tpt' ? 14 : 9, 5.1 + r() * 0.4, 0.3, r());
    addInto(out, saw(n, ff, r()), 0, 1 / det.length);
  }
  if (kind === 'tuba') addInto(out, pulse(n, f, 0.42, r()), 0, 0.25);
  // filter: brightness follows loudness, as on a real horn
  const atk = kind === 'swell' ? Math.max(0.25, dur * 0.85) : kind === 'stab' ? 0.016 : 0.03;
  const lo = kind === 'tuba' ? 220 : 380, span = (kind === 'tuba' ? 900 : 2100 + 1500 * v) * bright;
  const fc = new Float32Array(n);
  const A = len(atk), kd = Math.exp(-1 / (0.18 * SR));
  let e = 0;
  for (let i = 0; i < n; i++) {
    if (i < A) e = (i / A) ** (kind === 'swell' ? 2 : 1);
    else e = 0.62 + (e - 0.62) * kd;
    fc[i] = Math.min(6500, (lo + span * e) * (1 + 0.0009 * (f - 220)));
  }
  svfLP(out, fc, 0.18);
  svfLP(out, 6800, 0);
  const env = kind === 'swell'
    ? (() => { const a = new Float32Array(n); const H = len(dur), R = Math.exp(-1 / (rel * SR)); let y = 0; for (let i = 0; i < n; i++) { if (i < H) y = (i / H) ** 1.8; else y *= R; a[i] = y; } return a; })()
    : adsr(n, { a: kind === 'stab' ? 0.012 : 0.03, d: 0.16, s: kind === 'stab' ? 0.7 : 0.8, hold: dur, r: rel });
  mul(out, env);
  softClip(out, 1.8);
  peak(out, 1200, 0.9, 2);
  scale(out, 0.3 + 0.7 * v);
  return edgeFade(out, 0.006);
}
/** A brass chord: the notes summed, a little apart in the stereo field. Returns { L, R }. */
export function brassChord(midis, dur, v, seed, opts = {}) {
  const parts = midis.map((m, i) => brassNote(m, dur, v, seed + i * 101, opts));
  const n = Math.max(...parts.map(p => p.length));
  const L = new Float32Array(n), R = new Float32Array(n);
  parts.forEach((p, i) => {
    const pan = midis.length > 1 ? -0.5 + i / (midis.length - 1) : 0;
    const th = (pan + 1) * Math.PI / 4;
    addInto(L, p, 0, Math.cos(th) * Math.SQRT2 / Math.sqrt(midis.length));
    addInto(R, p, 0, Math.sin(th) * Math.SQRT2 / Math.sqrt(midis.length));
  });
  return { L, R };
}

/** String pad note: a section of detuned saws, wide, with a crossfade envelope (equal power) of `xf` s each side. { L, R }. */
export function padNote(midi, dur, v, seed, { bright = 1, xf = 0.3 } = {}) {
  const r = rng(seed);
  const n = len(dur + xf);
  const f = midiHz(midi);
  const L = new Float32Array(n), R = new Float32Array(n);
  const cents = [-14, -9, -4, 0, 4, 9, 14];
  cents.forEach((c, i) => {
    const ff = constF(n, f * 2 ** (c / 1200));
    // slow drift, so the section breathes
    const rate = 0.13 + r() * 0.2, ph = r();
    for (let k = 0; k < n; k++) ff[k] *= 2 ** ((3 * Math.sin(2 * Math.PI * (rate * k / SR + ph))) / 1200);
    const s = saw(n, ff, r());
    const pan = -0.8 + (1.6 * i) / (cents.length - 1);
    const th = (pan + 1) * Math.PI / 4;
    addInto(L, s, 0, Math.cos(th) / cents.length * 1.6);
    addInto(R, s, 0, Math.sin(th) / cents.length * 1.6);
  });
  const fc = (900 + 1500 * v) * bright;
  for (const ch of [L, R]) {
    svfLP(ch, fc, 0.05);
    svfLP(ch, fc * 1.6, 0);
    hp(ch, 90);
    peak(ch, 700, 0.8, 1.5);
  }
  // equal-power crossfade envelope: rises over xf, holds, falls over xf after dur
  const X = len(xf), D = len(dur);
  for (let i = 0; i < n; i++) {
    const g = i < X ? Math.sin((Math.PI / 2) * (i / X)) : i < D ? 1 : Math.cos((Math.PI / 2) * Math.min(1, (i - D) / X));
    L[i] *= g * v; R[i] *= g * v;
  }
  return { L, R };
}

// Formants (Hz, gain) of the vowels the choir and the chant sing.
const VOWEL = {
  oo: [[320, 1], [800, 0.3], [2300, 0.05]],
  ah: [[730, 1], [1100, 0.5], [2450, 0.12]],
  oh: [[520, 1], [850, 0.45], [2400, 0.08]],
  eh: [[560, 1], [1800, 0.32], [2500, 0.14]],
  ee: [[300, 1], [2250, 0.2], [2950, 0.1]],
};
function formant(src, vowel, n) {
  const out = new Float32Array(n);
  for (const [f, g] of VOWEL[vowel]) {
    const b = Float32Array.from(src);
    bp(b, f, f < 1000 ? 6 : 9);
    bp(b, f, f < 1000 ? 6 : 9);
    addInto(out, b, 0, g * 3);
  }
  return out;
}

/** Choir pad note ("oo" or "ah"): a few voices with vibrato through formants, with the pad's crossfade. { L, R }. */
export function choirNote(midi, dur, v, seed, { vowel = 'oo', xf = 0.35 } = {}) {
  const r = rng(seed);
  const n = len(dur + xf);
  const f = midiHz(midi);
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let k = 0; k < 4; k++) {
    const ff = vibrato(constF(n, f * 2 ** (((r() - 0.5) * 16) / 1200)), 18, 4.8 + r() * 0.9, 0.35, r());
    const src = saw(n, ff, r());
    onePoleLP(src, 2500);
    const voice = formant(src, vowel, n);
    const pan = k % 2 ? 0.45 : -0.45;
    const th = (pan + 1) * Math.PI / 4;
    addInto(L, voice, 0, Math.cos(th) * 0.5);
    addInto(R, voice, 0, Math.sin(th) * 0.5);
  }
  const X = len(xf), D = len(dur);
  for (let i = 0; i < n; i++) {
    const g = i < X ? Math.sin((Math.PI / 2) * (i / X)) : i < D ? 1 : Math.cos((Math.PI / 2) * Math.min(1, (i - D) / X));
    L[i] *= g * v; R[i] *= g * v;
  }
  for (const ch of [L, R]) lp(ch, 5000);
  return { L, R };
}

/**
 * The chant: a group shout on `midis` ("hey" glides eh->ee, "ho" oh->oo), each voice a little off in pitch and time, with an
 * aspirated h. Returns { L, R }.
 */
export function chant(word, midis, v, seed) {
  const r = rng(seed);
  const dur = word === 'hey' ? 0.2 : 0.24;
  const n = len(dur + 0.2);
  const L = new Float32Array(n), R = new Float32Array(n);
  const [v1, v2] = word === 'hey' ? ['eh', 'ee'] : ['oh', 'oo'];
  const voices = 8;
  for (let k = 0; k < voices; k++) {
    const m = midis[k % midis.length];
    const f = midiHz(m) * 2 ** (((r() - 0.5) * 30) / 1200);
    // a shout scoops up and falls off at its end
    const ff = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      ff[i] = f * 2 ** ((-60 * Math.exp(-t / 0.025) - (t > dur * 0.7 ? 260 * (t - dur * 0.7) / 0.2 : 0)) / 1200);
    }
    const src = saw(n, ff, r());
    addInto(src, noise(n, seed + 7 + k), 0, 0.06);
    onePoleLP(src, 3000);
    const a = formant(src, v1, n), b = formant(src, v2, n);
    const voice = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = Math.min(1, i / (n * 0.7)); voice[i] = a[i] * (1 - t) + b[i] * t; }
    // h: breath through the first vowel's formants
    const h = formant(noise(len(0.04), seed + 30 + k), v1, len(0.04));
    mul(h, expEnv(h.length, 0.006, 0.012));
    const env = adsr(n, { a: 0.018, d: 0.08, s: 0.7, hold: dur, r: 0.06 });
    mul(voice, env);
    const off = Math.round(r() * 0.014 * SR);
    const pan = -0.7 + (1.4 * k) / (voices - 1);
    const th = (pan + 1) * Math.PI / 4;
    addInto(L, h, off, 0.4 * Math.cos(th));
    addInto(R, h, off, 0.4 * Math.sin(th));
    addInto(L, voice, off, Math.cos(th) / Math.sqrt(voices));
    addInto(R, voice, off, Math.sin(th) / Math.sqrt(voices));
  }
  for (const ch of [L, R]) { hp(ch, 160); lp(ch, 5500); scale(ch, v); edgeFade(ch, 0.01); }
  return { L, R };
}

/** Flute (piccolo when high): a soft near-sine with breath and a vibrato. */
export function flute(midi, dur, v, seed) {
  const r = rng(seed);
  const n = len(dur + 0.1);
  const f = midiHz(midi);
  const ff = vibrato(glide(n, f * 2 ** (-25 / 1200), f, 0.02), 16, 5.2, 0.18, r());
  const out = sine(n, ff, r());
  addInto(out, sine(n, Float32Array.from(ff, x => 2 * x), r()), 0, 0.22);
  addInto(out, sine(n, Float32Array.from(ff, x => 3 * x), r()), 0, 0.06);
  const br = noise(n, seed + 5);
  bp(br, Math.min(6000, f * 2), 2.5);
  addInto(out, br, 0, 0.07);
  const ch = noise(len(0.04), seed + 6);
  bp(ch, Math.min(5000, f * 3), 1.5);
  mul(ch, expEnv(ch.length, 0.002, 0.01));
  addInto(out, ch, 0, 0.15);
  mul(out, adsr(n, { a: 0.035, d: 0.2, s: 0.85, hold: dur, r: 0.08 }));
  lp(out, 7000);
  scale(out, 0.3 + 0.7 * v);
  return edgeFade(out, 0.006);
}

/** Kalimba: a plucked tine (inharmonic), a short wooden box. */
export function kalimba(midi, v, seed, ring = 0.7) {
  const f = midiHz(midi);
  const n = len(ring * 3);
  const out = modes(n, [{ f, amp: 1, tau: ring }, { f: f * 2, amp: 0.05, tau: ring * 0.3 }, { f: f * 5.93, amp: 0.22, tau: 0.05 }, { f: Math.min(9000, f * 13.1), amp: 0.06, tau: 0.012 }]);
  const ck = noise(len(0.01), seed);
  bp(ck, 1800, 1);
  addInto(out, ck, 0, 0.15);
  lp(out, 7500);
  scale(out, 0.25 + 0.75 * v);
  return edgeFade(out, 0.02);
}

/** Xylophone: a hard mallet on a bright bar (partials 1, 3, 6.3). */
export function xylo(midi, v, seed) {
  const f = midiHz(midi);
  const n = len(1.0);
  const out = modes(n, [{ f, amp: 1, tau: 0.28 }, { f: f * 3, amp: 0.3, tau: 0.07 }, { f: Math.min(8500, f * 6.3), amp: 0.08, tau: 0.02 }]);
  const ck = noise(len(0.008), seed);
  bp(ck, 3000, 1);
  addInto(out, ck, 0, 0.18);
  lp(out, 7800);
  scale(out, 0.25 + 0.75 * v);
  return edgeFade(out, 0.02);
}

/** A low marimba bar (the turtles' instrument): round, woody, partials 1 and 4. */
export function lowMarimba(midi, v, seed) {
  const f = midiHz(midi);
  const n = len(1.2);
  const out = modes(n, [{ f, amp: 1, tau: 0.45 }, { f: f * 3.99, amp: 0.22, tau: 0.08 }, { f: f * 9.9, amp: 0.04, tau: 0.02 }]);
  const ck = noise(len(0.012), seed);
  lp(ck, 1500);
  addInto(out, ck, 0, 0.25);
  peak(out, 400, 1, 2);
  scale(out, 0.25 + 0.75 * v);
  return edgeFade(out, 0.02);
}

/** Glockenspiel: a small steel bar, bell-bright but tamed. */
export function glock(midi, v, seed) {
  const f = midiHz(midi);
  const n = len(1.8);
  const list = [{ f, amp: 1, tau: 0.9 }, { f: f * 2.76, amp: 0.3, tau: 0.25 }, { f: f * 5.4, amp: 0.12, tau: 0.08 }].filter(m => m.f < 7500);
  const out = modes(n, list);
  const ck = noise(len(0.005), seed);
  bp(ck, 4000, 1);
  addInto(out, ck, 0, 0.1);
  lp(out, 7000);
  scale(out, 0.25 + 0.75 * v);
  return edgeFade(out, 0.03);
}
