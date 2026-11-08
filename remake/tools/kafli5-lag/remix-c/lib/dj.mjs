// DJ Flugeðla's voice: her recorded takes measured (attack, words), placed with the first syllable's attack on the beat, and used as
// a DJ would: echo throws on the last word, a telephone colour, a 16th tremolo, a dark slow-motion colour, a stutter, light pitch,
// a duck of the music under her, and each line set a few dB over the music it sits on.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SR, decode } from './io.mjs';
import { stereo, addMono, Biquad, pingPong, reverb } from './dsp.mjs';
import { resample } from './takes.mjs';
import { kLoudness } from './master.mjs';
import { SPB } from './score.mjs';

export const fileOf = id => `k5_dj_c_${id.replace(/-/g, '_')}.mp3`;

/** The envelope (RMS over `win` s, one value a `hop` s). */
function envelope(x, win = 0.01, hop = 0.0025) {
  const w = Math.round(win * SR), h = Math.round(hop * SR);
  const e = [];
  for (let s = 0; s + w <= x.length; s += h) {
    let a = 0;
    for (let i = s; i < s + w; i++) a += x[i] * x[i];
    e.push(Math.sqrt(a / w));
  }
  return { e, h, w };
}

/**
 * One take, measured: its words (sound runs split by gaps of at least 150 ms under 5% of the loudest envelope, so a stop like the
 * "pp" in "Hopp" stays inside its word) and each word's attack: the first point where the voiced band (100-1500 Hz) passes 25% of
 * its loudest, i.e. the first vowel, past a hissed "S" or "Sn" (where a listener hears the word land).
 */
export function measureTake(x) {
  const { e, h, w } = envelope(x);
  const vb = Float32Array.from(x);
  for (const f of [new Biquad('hp', 100, 0.7), new Biquad('lp', 1500, 0.7), new Biquad('lp', 1500, 0.7)]) f.run(vb);
  const ev = envelope(vb).e;
  const top = Math.max(...e), topV = Math.max(...ev);
  const quiet = e.map(v => v < top * 0.05);
  const minGap = Math.round(0.15 / (h / SR));
  const words = [];
  let i = 0;
  while (i < e.length) {
    while (i < e.length && quiet[i]) i++;
    if (i >= e.length) break;
    let j = i;
    for (;;) {
      while (j < e.length && !quiet[j]) j++;
      let k = j;
      while (k < e.length && quiet[k]) k++;
      if (k >= e.length || k - j >= minGap) break;
      j = k;
    }
    if ((j - i) * h > 0.04 * SR) {
      let a = i;
      while (a < j && ev[a] < topV * 0.25) a++;
      let pk = 0;
      for (let q = i; q < j; q++) pk = Math.max(pk, e[q]);
      if (pk > top * 0.2 && a < j) words.push({ from: i * h, to: j * h + w, attack: a * h + Math.round(w / 2) });
    }
    i = j;
  }
  // the very start of the sound (for cuts): back from the first word's attack to where its envelope first rises over 2%
  for (const wd of words) {
    let s = Math.round((wd.from) / h);
    while (s > 0 && e[s - 1] > top * 0.02) s--;
    wd.start = Math.max(0, s * h - Math.round(0.005 * SR));
  }
  return { words, attack: words[0]?.attack ?? 0, end: words.length ? words[words.length - 1].to : x.length, top };
}

const takes = new Map();
export function loadLine(dir, id) {
  if (takes.has(id)) return takes.get(id);
  const file = join(dir, fileOf(id));
  let t;
  if (existsSync(file)) {
    const [x] = decode(file);
    t = { id, file: fileOf(id), x, real: true, ...measureTake(x) };
  } else t = { id, file: fileOf(id), x: null, real: false };
  takes.set(id, t);
  return t;
}

/** The piece of a take a placement uses: the whole line, one word (`seg`), or a word's first seconds (`head`); then its rate. */
function pieceOf(t, d, placeholderSec) {
  if (!t.real) {
    const y = new Float32Array(Math.round(placeholderSec * SR));
    for (let i = 0; i < Math.round(0.04 * SR); i++) y[i] = 0.05 * Math.sin((2 * Math.PI * 880 * i) / SR) * (1 - i / (0.04 * SR)); // a soft blip
    return { y, attack: 0, lastFrom: Math.round(placeholderSec * 0.6 * SR), placeholder: true };
  }
  const words = t.words;
  let from, to, attack;
  if (d.seg !== undefined) {
    const k = d.seg < 0 ? words.length + d.seg : d.seg;
    const wd = words[k];
    if (!wd) throw new Error(`${t.id} has ${words.length} words, no word ${d.seg}`);
    from = wd.start;
    to = Math.min(t.x.length, wd.to + Math.round(0.06 * SR));
    attack = wd.attack - from;
  } else {
    from = words[0].start;
    to = t.x.length;
    attack = words[0].attack - from;
  }
  if (d.head) to = Math.min(to, from + attack + Math.round(d.head * SR));
  let y = Float32Array.from(t.x.subarray(from, to));
  const fo = Math.min(y.length, Math.round((d.head ? 0.012 : 0.03) * SR));
  for (let i = 0; i < fo; i++) y[y.length - 1 - i] *= i / fo;
  for (let i = 0; i < Math.min(y.length, 64); i++) y[i] *= i / 64;
  // the echo throw takes the end of the last word: its last 0.4 s of voice (or `echo[2]` s)
  let lastFrom = Math.max(attack, lastLoud(envelope(y, 0.02, 0.005), y.length) - Math.round((d.echo?.[2] ?? 0.4) * SR));
  const rate = d.rate ?? 1;
  if (rate !== 1) {
    y = resample(y, rate);
    attack = Math.round(attack / rate);
    lastFrom = Math.round(lastFrom / rate);
  }
  return { y, attack, lastFrom };
}

/** Effects that colour the dry voice itself. */
function colour(y, d) {
  if (d.radio) {
    // a telephone band with a little drive
    const hp = [new Biquad('hp', 450, 0.8), new Biquad('hp', 450, 0.8)], lp = [new Biquad('lp', 3200, 0.8), new Biquad('lp', 3200, 0.8)];
    const pk = new Biquad('peak', 1500, 1, 5);
    for (let i = 0; i < y.length; i++) {
      let v = y[i];
      for (const f of hp) v = f.tick(v);
      for (const f of lp) v = f.tick(v);
      v = pk.tick(v);
      y[i] = Math.tanh(v * 2.2) / 1.6;
    }
  }
  if (d.slow) {
    const lp = new Biquad('lp', 2400, 0.7), sh = new Biquad('lowshelf', 250, 0.7, 3);
    for (let i = 0; i < y.length; i++) y[i] = sh.tick(lp.tick(y[i]));
  }
  if (d.shake) {
    // the ground shakes her voice: a 16th-note tremolo
    const f = 4 / (SPB / SR) / 1; // sixteenths per second
    for (let i = 0; i < y.length; i++) y[i] *= 1 - d.shake * (0.5 + 0.5 * Math.sin((2 * Math.PI * f * i) / SR));
  }
  return y;
}

/**
 * Render the dj stem. `music` is the music's sum (before the master, after balance) for the level under each line. Returns
 * { dj (stereo), duck (Float32Array gain for the music), placed: [{ id, beat, sec, text, ... levels }] }.
 */
export function renderDj(score, n, music, dir, lines) {
  const dry = stereo(n), echoIn = stereo(n), revIn = stereo(n);
  const duck = new Float32Array(n).fill(1);
  const placed = [];
  const textOf = Object.fromEntries(lines.map(l => [l.id, l.text]));
  for (const d of score.dj) {
    const t = loadLine(dir, d.id);
    const est = estimateSec(textOf[d.id] ?? '');
    const p = pieceOf(t, d, d.head ? 0.12 : d.seg !== undefined ? 0.5 : est);
    const y = colour(p.y, d);
    const beatS = Math.round(d.beat * SPB);
    const at = beatS - p.attack;
    // the line's level: its own loudness against the music's over the same span (or over a reference span, for lines in a freeze)
    const span = [at, Math.min(n, at + y.length)];
    const refS = d.ref !== undefined ? Math.round(d.ref * SPB) : span[0];
    const refSpan = [refS, Math.min(n, refS + (span[1] - span[0]))];
    const mus = kLoudness(music.L, music.R, refSpan[0], refSpan[1]);
    let gain = 1;
    if (!p.placeholder) {
      const vl = kLoudness(y, y, 0, y.length) - 3.01; // centre-panned: each side gets 1/sqrt(2)
      gain = 10 ** ((mus + (d.lift ?? 4) - vl) / 20);
    }
    addMono(dry, y, at, gain, 0);
    // the echo throw: only the last word goes into the delay
    if (d.echo && !p.placeholder) {
      const last = Float32Array.from(y.subarray(p.lastFrom));
      const fi = Math.min(last.length, Math.round(0.012 * SR));
      for (let i = 0; i < fi; i++) last[i] *= i / fi;
      addMono(echoIn, last, at + p.lastFrom, gain, 0);
    }
    addMono(revIn, y, at, gain * (d.rev ?? 0.15), 0);

    // duck the music under her: down by `duck` dB from 15 ms before her attack, back over 250 ms after her voice ends
    if (d.duck) {
      const depth = 1 - 10 ** (-d.duck / 20);
      const env = p.placeholder ? null : envelope(y, 0.02, 0.005);
      const voicedEnd = p.placeholder ? y.length : lastLoud(env, y.length);
      const a = Math.round(0.015 * SR), r = Math.round(0.25 * SR);
      for (let i = -a; i < voicedEnd + r; i++) {
        const j = at + p.attack + i;
        if (j < 0 || j >= n) continue;
        let k = 1;
        if (i < 0) k = (i + a) / a;
        else if (i > voicedEnd - p.attack) k = Math.max(0, 1 - (i - (voicedEnd - p.attack)) / r);
        const g = 1 - depth * (0.5 - 0.5 * Math.cos(Math.PI * k));
        if (g < duck[j]) duck[j] = g;
      }
    }
    placed.push({ id: d.id, beat: d.beat, sec: +((d.beat * SPB) / SR).toFixed(3), text: textOf[d.id], seg: d.seg, head: d.head, rate: d.rate,
      real: t.real, at, len: y.length, gainDb: +(20 * Math.log10(gain)).toFixed(1), musicLufs: +mus.toFixed(1), attackSec: +(p.attack / SR).toFixed(3) });
  }
  // the echo throws: one tempo delay per time used, each band-limited like an old tape echo
  const out = stereo(n);
  for (let i = 0; i < n; i++) {
    out.L[i] = dry.L[i];
    out.R[i] = dry.R[i];
  }
  const times = [...new Set(score.dj.filter(d => d.echo).map(d => d.echo.join(',')))];
  for (const key of times) {
    const [beats, fb] = key.split(',').map(Number);
    const src = stereo(n);
    for (const d of score.dj) {
      if (!d.echo || d.echo.join(',') !== key) continue;
      const pl = placed.find(q => q.id === d.id && q.beat === d.beat);
      for (let i = pl.at; i < Math.min(n, pl.at + pl.len + Math.round(0.05 * SR)); i++) {
        src.L[i] += echoIn.L[i];
        src.R[i] += echoIn.R[i];
      }
    }
    const e = pingPong(src, beats * SPB, fb, 5200, 450);
    for (let i = 0; i < n; i++) {
      out.L[i] += e.L[i] * 0.55;
      out.R[i] += e.R[i] * 0.55;
    }
  }
  const wet = reverb(revIn, { decay: 1.3, damp: 6500, predelay: 0.02, lowcut: 350, seed: 17, size: 0.9 });
  for (let i = 0; i < n; i++) {
    out.L[i] += wet.L[i] * 0.6;
    out.R[i] += wet.R[i] * 0.6;
  }
  for (const f of [new Biquad('hp', 90, 0.7)]) f.run(out.L);
  for (const f of [new Biquad('hp', 90, 0.7)]) f.run(out.R);
  return { dj: out, duck, placed };
}

function lastLoud(env, len) {
  const top = Math.max(...env.e);
  let k = env.e.length - 1;
  while (k > 0 && env.e[k] < top * 0.1) k--;
  return Math.min(len, k * env.h + env.w);
}

/** A placeholder's length: about 0.19 s a syllable, a pause at each mark, a quarter second after. */
export function estimateSec(text) {
  const syll = (text.toLowerCase().match(/(au|ei|ey|[aáeéiíoóuúyýæö])+/g) ?? []).length;
  const marks = (text.match(/[!?.,]+/g) ?? []).length;
  return 0.19 * syll + 0.22 * Math.max(0, marks - 1) + 0.25;
}
