// DJ Flugeðla: her lines placed on the grid (each take's first syllable on its beat) and worked like a DJ works a mic: a level a
// few dB over the music under her, the music ducked while she speaks, an echo thrown on the last word, a megaphone colour, a
// stutter of the first sixteenth. Until a take exists, a soft blip of the line's estimated length stands in for it.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SR, decode } from './io.mjs';
import { stereo, addMono, addStereo, Biquad, pingPong, reverb } from './dsp.mjs';
import { kLoud } from './master.mjs';
import { SPB } from './score.mjs';

export const SLOT = 'remix-a';
const TAKE_DIR = 'remake/assets/audio/kafli5';
export const takeFile = id => `k5_dj_a_${id.replaceAll('-', '_')}.mp3`; // the coordinator's names
export const takePath = (ROOT, id) => join(ROOT, TAKE_DIR, takeFile(id));
const sampleOf = beat => Math.round(beat * SPB);

/** Rough syllable count of an Icelandic line (vowel groups). */
function syllables(text) {
  const m = text.toLowerCase().match(/(au|ei|ey|[aáeéiíoóuúyýæö])+/g);
  return m ? m.length : 1;
}

/** The take's shape: onset (first syllable), voiced end, start of the last word (after the last gap), from a 10 ms envelope. */
export function shapeOf(x) {
  const hop = Math.round(0.0025 * SR), w = Math.round(0.01 * SR);
  const env = [];
  for (let s = 0; s + w <= x.length; s += hop) {
    let a = 0;
    for (let i = s; i < s + w; i++) a += x[i] * x[i];
    env.push(Math.sqrt(a / w));
  }
  const max = Math.max(...env, 1e-9);
  let on = env.findIndex(v => v > 0.2 * max);
  // walk back to where this first rise starts (the consonant), so the attack sits on the grid
  let st = on;
  while (st > 0 && env[st - 1] > 0.05 * max && env[st - 1] < env[st]) st--;
  let end = env.length - 1;
  while (end > 0 && env[end] < 0.08 * max) end--;
  let lastWord = -1;
  const gapMin = Math.round(0.035 / 0.0025);
  for (let i = end, run = 0; i > on; i--) {
    run = env[i] < 0.12 * max ? run + 1 : 0;
    if (run >= gapMin) {
      let j = i + run;
      while (j < end && env[j] < 0.12 * max) j++;
      lastWord = j;
      break;
    }
  }
  const toS = i => Math.round(i * hop + w / 2);
  const onset = Math.max(0, toS(st) - Math.round(0.005 * SR));
  const voicedEnd = Math.min(x.length, toS(end) + w);
  let lw = lastWord > 0 ? toS(lastWord) : -1;
  if (lw < 0 || voicedEnd - lw < 0.15 * SR) lw = Math.max(onset, voicedEnd - Math.round(0.45 * SR));
  return { onset, voicedEnd, lastWord: Math.max(onset, lw - Math.round(0.01 * SR)), peak: max };
}

/**
 * Her mic chain: a low cut, a little presence (tablet speakers), and a gentle compressor (peak follower 2 ms / 90 ms, 3:1 over a
 * threshold 9 dB under the take's peak, soft knee), so her shouts sit on the music without the master limiter squashing them.
 */
function voiceChain(x) {
  const y = Float32Array.from(x);
  for (const f of [new Biquad('hp', 110, 0.7), new Biquad('peak', 3200, 0.9, 2.5)]) f.run(y);
  let pk = 0;
  for (const v of y) pk = Math.max(pk, Math.abs(v));
  const thr = pk * 10 ** (-9 / 20), ratio = 3, knee = 3;
  const att = 1 - Math.exp(-1 / (0.002 * SR)), rel = 1 - Math.exp(-1 / (0.09 * SR));
  let env = 0;
  for (let i = 0; i < y.length; i++) {
    const a = Math.abs(y[i]);
    env += (a - env) * (a > env ? att : rel);
    const over = 20 * Math.log10(Math.max(env, 1e-9) / thr);
    let grDb = 0;
    if (over > knee / 2) grDb = over * (1 - 1 / ratio);
    else if (over > -knee / 2) grDb = ((over + knee / 2) ** 2 / (2 * knee)) * (1 - 1 / ratio);
    y[i] *= 10 ** (-grDb / 20);
  }
  return y;
}

/**
 * Render her lines. `music` is the balanced music (stereo, before ducking). Returns { stem, duck (Float32Array gain for the
 * music), info: [{ key, id, beat, sec, text, take, ... }] }.
 */
export function renderDj(DJ, lines, ROOT, n, music, { lift = 5 } = {}) {
  const byId = Object.fromEntries(lines.map(l => [l.id, l]));
  const dry = stereo(n);
  const echoSend = stereo(n);
  const duck = new Float32Array(n).fill(1);
  const info = [];
  const musicInt = kLoud(music.L, music.R, 0, n);
  for (const d of DJ) {
    const line = byId[d.id];
    if (!line) throw new Error(`no line ${d.id} in lines.json`);
    const file = takePath(ROOT, d.id);
    const has = existsSync(file);
    let x, sh;
    if (has) {
      [x] = decode(file);
      // a 3 ms fade-in: some takes begin on their consonant at full strength (the coordinator: an L, not a cut)
      const fi = Math.round(0.003 * SR);
      for (let i = 0; i < fi && i < x.length; i++) x[i] *= i / fi;
      sh = shapeOf(x);
      x = voiceChain(x);
    } else {
      const len = Math.round((0.12 + 0.19 * syllables(line.text)) * SR);
      x = new Float32Array(len + Math.round(0.25 * SR));
      const bl = Math.round(0.05 * SR);
      for (let i = 0; i < bl; i++) x[i] = Math.sin((2 * Math.PI * 1318.5 * i) / SR) * Math.sin((Math.PI * i) / bl) * 0.5;
      sh = { onset: 0, voicedEnd: len, lastWord: Math.round(len * 0.6), peak: 0.5 };
    }
    const at = sampleOf(d.beat) - sh.onset; // first syllable's attack on the beat
    const a = at + sh.onset, b = Math.min(n, at + sh.voicedEnd);
    // her level: a few dB over the music under her (after the duck), kept within reach of the song's own loudness
    const under = kLoud(music.L, music.R, a, b);
    // the take, coloured first (a megaphone: band-passed and driven), so her level is set on what is heard
    let y = Float32Array.from(x);
    if (d.radio && has) {
      const r = Float32Array.from(y);
      for (const f of [new Biquad('hp', 450, 0.7), new Biquad('hp', 450, 0.7), new Biquad('lp', 3800, 0.7), new Biquad('lp', 3800, 0.7), new Biquad('peak', 1800, 1, 4)]) f.run(r);
      let pr = 0, py = 0;
      for (let i = 0; i < r.length; i++) {
        pr = Math.max(pr, Math.abs(r[i]));
        py = Math.max(py, Math.abs(y[i]));
      }
      const k = py / (pr || 1);
      for (let i = 0; i < y.length; i++) y[i] = 0.3 * y[i] + 0.8 * Math.tanh((2.2 * r[i] * k) / (py || 1)) * (py / 2.2);
    }
    let gain;
    if (has) {
      const voiceLoud = kLoud(y, y, sh.onset, sh.voicedEnd) - 3.01; // mono into both sides: count it once
      const target = Math.min(musicInt + 5, Math.max(musicInt - 4, under - d.duck + (d.lift ?? lift)));
      gain = 10 ** ((target - voiceLoud) / 20);
      if (!(gain > 0.01 && gain < 30)) throw new Error(`line ${d.id}: gain ${gain} (voice ${voiceLoud}, music ${under})`);
    } else gain = 0.06;
    for (let i = 0; i < y.length; i++) y[i] *= gain;
    addMono(dry, y, at, 1, 0);
    // stutter: the first sixteenth again on the sixteenths before the line
    if (d.stutter && has) {
      const len = Math.round(SPB / 4);
      const chunk = Float32Array.from(y.subarray(sh.onset, sh.onset + len));
      const f = Math.round(0.006 * SR);
      for (let i = 0; i < f && i < chunk.length; i++) {
        chunk[i] *= i / f;
        chunk[chunk.length - 1 - i] *= i / f;
      }
      for (let k = 1; k <= d.stutter; k++) addMono(dry, chunk, sampleOf(d.beat - k / 4), 0.8, k % 2 ? -0.3 : 0.3);
    }
    // echo throw: the last word into the tempo echo
    if (d.echo === 'last') addMono(echoSend, y.subarray(sh.lastWord), at + sh.lastWord, 1, 0);
    // duck the music while she speaks: 40 ms down before her attack, back up over 250 ms after her last syllable
    const depth = 10 ** (-d.duck / 20);
    const dn = Math.round(0.04 * SR), up = Math.round(0.25 * SR);
    for (let j = Math.max(0, a - dn); j < Math.min(n, b + up); j++) {
      let g;
      if (j < a) g = 1 - (1 - depth) * ((j - (a - dn)) / dn);
      else if (j < b) g = depth;
      else g = depth + (1 - depth) * ((j - b) / up);
      if (g < duck[j]) duck[j] = g;
    }
    info.push({
      key: d.key ?? d.id, id: d.id, beat: d.beat, sec: +((d.beat * SPB) / SR).toFixed(3), text: line.text, take: has ? `${TAKE_DIR}/${takeFile(d.id)}` : null,
      seconds: +((sh.voicedEnd - sh.onset) / SR).toFixed(2), musicUnderLufs: +under.toFixed(1), gainDb: +(20 * Math.log10(gain)).toFixed(1),
      fx: { echo: d.echo ?? null, radio: !!d.radio, stutter: d.stutter ?? 0, duckDb: d.duck },
    });
  }
  // the echoes (dotted eighths, bouncing left and right, thinned so they never muddy her next words) and a small stage reverb
  const ec = pingPong(echoSend, 0.75 * SPB, 0.42, 4800, 500);
  const stem = stereo(n);
  addStereo(stem, dry, 0, 1);
  addStereo(stem, ec, 0, 0.55);
  const send = stereo(n);
  addStereo(send, dry, 0, 0.18);
  addStereo(send, ec, 0, 0.15);
  const wet = reverb(send, { decay: 1.1, damp: 6500, predelay: 0.02, lowcut: 400, seed: 17, size: 0.9 });
  addStereo(stem, wet, 0, 1);
  return { stem, duck, info, musicInt };
}

export function readLines(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}
