// DJ Flugeðla's voice: her recorded takes (or a soft placeholder blip of the right length while a take is missing), measured
// (where the first syllable's attack is, where the words are), placed on the grid and dressed like a DJ would: echo throws on
// the last word, a stutter of the first syllable, a radio colour, and a duck of the music under her.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { decode, SR } from './io.mjs';
import { Biquad, OnePole, stereo, addMono, panGains } from './dsp.mjs';
import { SPB } from './score.mjs';

const N = s => Math.max(1, Math.round(s * SR));

/** The take's file for a line id (the coordinator's name first, then the contract's), or null. */
export function takeFile(dir, slot, id) {
  for (const f of [`k5_dj_b_${id.replace(/-/g, '_')}.mp3`, `k5_dj_${slot}_${id}.mp3`]) if (existsSync(join(dir, f))) return f;
  return null;
}

/** A 5 ms RMS envelope (one value per 1 ms hop). */
function envelope(x) {
  const hop = Math.round(0.001 * SR), win = Math.round(0.005 * SR);
  const e = new Float32Array(Math.ceil(x.length / hop));
  for (let k = 0; k < e.length; k++) {
    let s = 0;
    const a = k * hop;
    for (let i = a; i < a + win && i < x.length; i++) s += x[i] * x[i];
    e[k] = Math.sqrt(s / win);
  }
  return { e, hop };
}

/** Measure a take: its attack (first syllable), its words (voiced runs split by gaps), its voiced end. */
export function measureTake(x) {
  const { e, hop } = envelope(x);
  let peak = 0;
  for (const v of e) peak = Math.max(peak, v);
  const on = 0.15 * peak, off = 0.05 * peak;
  let attack = 0;
  while (attack < e.length && e[attack] < on) attack++;
  // words: runs above `off`, a gap is 70 ms or more below it
  const words = [];
  let k = attack, start = attack, quiet = 0, last = attack;
  for (; k < e.length; k++) {
    if (e[k] >= off) {
      if (quiet >= 70 && words.length < 64) {
        words.push({ from: start * hop, to: (last + 1) * hop });
        start = k;
      }
      quiet = 0;
      last = k;
    } else quiet++;
  }
  words.push({ from: start * hop, to: (last + 1) * hop });
  // each word's own attack (15% of its own peak)
  for (const w of words) {
    let p = 0;
    for (let j = w.from / hop; j < w.to / hop; j++) p = Math.max(p, e[j]);
    let j = w.from / hop;
    while (j < w.to / hop && e[j] < 0.15 * p) j++;
    w.attack = j * hop;
  }
  return { attack: attack * hop, words, end: (last + 1) * hop, peak };
}

/** The take's words grouped: a new group starts after a gap of `gapMs` or more. Each group: { from, to, attack }. */
export function groupsOf(m, gapMs) {
  const gap = (gapMs / 1000) * SR;
  const out = [];
  for (const w of m.words) {
    const last = out[out.length - 1];
    if (last && w.from - last.to < gap) last.to = w.to;
    else out.push({ ...w });
  }
  return out;
}

/** Placeholder: soft vowel blips, one per estimated syllable, as long as the line will be. */
export function placeholder(text) {
  const syl = Math.max(1, (text.match(/[aeiouyáéíóúýæö]+/gi) || []).length);
  const n = N(syl * 0.17 + 0.25);
  const y = new Float32Array(n);
  for (let s = 0; s < syl; s++) {
    const a = Math.round(s * 0.17 * SR);
    for (let i = 0; i < N(0.12); i++) {
      const t = i / SR;
      y[a + i] += Math.sin(2 * Math.PI * (s === 0 ? 660 : 520) * t) * Math.sin((Math.PI * i) / N(0.12)) * 0.05;
    }
  }
  return y;
}

/** Load a line: its samples (mono), what it is, and its measure. */
export function loadLine(dir, slot, line) {
  const f = takeFile(dir, slot, line.id);
  const x = f ? decode(join(dir, f))[0] : placeholder(line.text);
  return { ...line, file: f, x, m: measureTake(x), placeholder: !f };
}

/**
 * Place one line. Returns { dry: mono Float32Array over the whole song (her voice as placed), fx: stereo (echoes, stutter),
 * at: sample of the first syllable's attack, from/to: samples of the voiced part }.
 * `place` = { beat, words?: [beats per word], stutter?: { times, len (beats) }, echo?: { beats, fb, last (true: last word) },
 * radio?: bool, gain?: dB }
 */
export function placeLine(L, place, n) {
  const dry = new Float32Array(n);
  const fx = stereo(n);
  const g = 10 ** ((place.gain ?? 0) / 20);
  let x = L.x;
  if (place.radio) {
    x = Float32Array.from(x);
    for (const f of [new Biquad('hp', 420, 0.8), new Biquad('lp', 3800, 0.8), new Biquad('peak', 1500, 1, 4)]) f.run(x);
    for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 2.2) / 1.6;
  }
  const put = (from, to, at) => {
    for (let i = from; i < to; i++) {
      const j = at + (i - from);
      if (j >= 0 && j < n) dry[j] += x[i] * g;
    }
  };
  let at, startS, endS;
  if (place.split) {
    // cut the take into word groups and put each group's attack on its beat
    const gs = groupsOf(L.m, place.split);
    if (gs.length < place.beats.length) throw new Error(`${L.id}: ${gs.length} word groups, ${place.beats.length} beats`);
    // the last placed group takes every group after it
    place.beats.forEach((b, k) => {
      const w = gs[k];
      const to = k + 1 < place.beats.length ? gs[k + 1].from : x.length;
      const pre = Math.min(w.from, Math.round(0.004 * SR));
      const wa = Math.round(b * SPB) - (w.attack - w.from);
      fadeCopy(x, dry, w.from - pre, Math.min(to, x.length), wa - pre, g);
    });
    at = Math.round(place.beats[0] * SPB);
    startS = at;
    const lastG = gs[place.beats.length - 1];
    endS = Math.round(place.beats[place.beats.length - 1] * SPB) - lastG.attack + L.m.end;
    L.groups = gs;
  } else {
    at = Math.round(place.beat * SPB);
    const off = at - L.m.attack;
    put(0, x.length, off);
    startS = at;
    endS = off + L.m.end;
  }
  // stutter: the first syllable's first `len` beats, `times` times on the grid just before the line
  if (place.stutter) {
    const { times, len } = place.stutter;
    const chunk = Math.round(len * SPB * 0.8);
    for (let k = 0; k < times; k++) {
      const where = at - Math.round((times - k) * len * SPB);
      fadeCopy(x, fx.L, L.m.attack - N(0.003), L.m.attack + chunk, where - N(0.003), g * (0.55 + 0.15 * k) * 0.71);
      fadeCopy(x, fx.R, L.m.attack - N(0.003), L.m.attack + chunk, where - N(0.003), g * (0.55 + 0.15 * k) * 0.71);
    }
  }
  // echo throw: the last word into a filtered ping-pong delay
  if (place.echo) {
    const ws = L.m.words;
    const w = ws[ws.length - 1];
    let offAt = at - L.m.attack;
    if (place.split) {
      const gs = L.groups, k = place.beats.length - 1;
      offAt = Math.round(place.beats[k] * SPB) - gs[k].attack;
    }
    const send = new Float32Array(n);
    fadeCopy(x, send, Math.max(0, w.from - N(0.003)), Math.min(x.length, L.m.end + N(0.03)), offAt + Math.max(0, w.from - N(0.003)), g);
    const d = Math.round((place.echo.beats ?? 0.5) * SPB);
    const fb = place.echo.fb ?? 0.45;
    const hp = new Biquad('hp', 550, 0.7), lp = new OnePole(4200);
    // delay line: taps alternate left/right, each a little darker and thinner
    let s0 = 0, s1 = n - 1;
    while (s0 < n && send[s0] === 0) s0++;
    while (s1 > s0 && send[s1] === 0) s1--;
    const taps = place.echo.taps ?? 4;
    for (let k = 1; k <= taps; k++) {
      const gain = fb ** k;
      const [gl, gr] = panGains(k % 2 ? -0.6 : 0.6);
      const lpk = new OnePole(4200 / (1 + 0.35 * k)), hpk = new Biquad('hp', 550 + 120 * k, 0.7);
      for (let i = s0; i < Math.min(n, s1 + N(0.05)); i++) {
        const j = i + d * k;
        if (j >= n) break;
        const v = hpk.tick(lpk.tick(send[i])) * gain;
        fx.L[j] += v * gl;
        fx.R[j] += v * gr;
      }
    }
    endS = Math.max(endS, offAt + L.m.end + d * taps);
  }
  return { dry, fx, at, from: startS, to: Math.min(n, endS) };
}

function fadeCopy(x, dst, from, to, at, g) {
  from = Math.max(0, from);
  to = Math.min(x.length, to);
  const f = Math.min(Math.round(0.003 * SR), (to - from) >> 2);
  for (let i = from; i < to; i++) {
    let w = 1;
    if (i - from < f) w = (i - from) / f;
    if (to - i < f) w = Math.min(w, (to - i) / f);
    const j = at + (i - from);
    if (j >= 0 && j < dst.length) dst[j] += x[i] * g * w;
  }
}

/** Duck curve from her voice: 1 where she is silent, down to 10^(-depthDb/20) under her loudest, smooth (15 ms / 220 ms). */
export function duckFrom(voice, depthDb = 3.5, { ref = null } = {}) {
  const n = voice.length;
  const g = new Float32Array(n).fill(1);
  const att = 1 - Math.exp(-1 / (0.015 * SR)), rel = 1 - Math.exp(-1 / (0.22 * SR));
  let env = 0, peak = ref ?? 0;
  if (!ref) for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(voice[i]));
  const floor = 10 ** (-depthDb / 20);
  for (let i = 0; i < n; i++) {
    const a = Math.min(1, (Math.abs(voice[i]) / (peak * 0.35 || 1)));
    env += (a - env) * (a > env ? att : rel);
    g[i] = 1 - (1 - floor) * Math.min(1, env);
  }
  return g;
}
