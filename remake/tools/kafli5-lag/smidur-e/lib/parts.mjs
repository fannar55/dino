// Renders the score's parts into the five stems (pad, bass, beat, lead, animals), each with its own effects.
import { join } from 'node:path';
import { SR } from './io.mjs';
import { stereo, addMono, addStereo, mtof, SVF, Biquad, eqStereo, pingPong, reverb, chorus, duckCurve, applyGain } from './dsp.mjs';
import * as V from './synths.mjs';
import { SPB, TONE, sectionAt } from './score.mjs';
import { TAKES, loadTake, moved, resample } from './takes.mjs';

const sampleOf = beat => Math.round(beat * SPB);
const DOTTED8 = 0.75 * SPB;

function cached(map, key, make) {
  if (!map.has(key)) map.set(key, make());
  return map.get(key);
}

// ---- automation (per beat)
const CUT = [
  [0, 350], [16, 3200], [48, 3000], [80, 2300], [96, 2700], [112, 3000], [128, 3400], [144, 4300], [159, 4300], [160, 2100],
  [192, 1100], [224, 4300], [288, 3900],
];
function cutoffAt(beat) {
  // piecewise: exponential ramp inside intro and rise, steps (smoothed later) elsewhere
  if (beat < 16) return 350 * (3200 / 350) ** (beat / 16);
  if (beat >= 192 && beat < 224) return 1100 * (4300 / 1100) ** ((beat - 192) / 32);
  if (beat >= 156 && beat < 160) return 4300 * (2100 / 4300) ** ((beat - 156) / 4);
  let v = CUT[0][1];
  for (const [b, c] of CUT) if (beat >= b) v = c;
  return v;
}
const PUMP = { intro: 0.3, groove: 0.5, tuneA: 0.5, grazers: 0.55, turtles: 0.45, frogs: 0.5, lizards: 0.5, flyers: 0.5, break: 0, rise: 0.4, peak1: 0.5, peak2: 0.5, end: 0.38 };

export function kickSamples(score) {
  return score.kick.filter(k => k.vel > 0.3).map(k => ({ at: sampleOf(k.beat), depth: PUMP[sectionAt(k.beat).id] * Math.min(1, k.vel + 0.1) }));
}
function pump(n, kicks, scale, release = 0.21) {
  const g = new Float32Array(n).fill(1);
  const relN = Math.round(release * SR);
  for (const { at, depth } of kicks) {
    const d0 = depth * scale;
    for (let i = 0; i < relN; i++) {
      const j = at + i;
      if (j >= n) break;
      const x = i / relN;
      const v = 1 - d0 * (0.5 + 0.5 * Math.cos(Math.PI * x)) ** 1.3;
      if (v < g[j]) g[j] = v;
    }
  }
  return g;
}

// ---------------------------------------------------------------- pad
export function renderPad(score, n, kicks) {
  const raw = stereo(n);
  const cache = new Map();
  for (const ev of score.pad) {
    const sec = (ev.beats * SPB) / SR;
    ev.notes.forEach((m, k) => {
      const v = cached(cache, `${m}|${sec}|${ev.attack}|${ev.release}|${ev.vel}|${k}`, () =>
        V.stringVoice(mtof(m), sec, { attack: ev.attack, release: ev.release, vel: ev.vel, seed: 31 + m }),
      );
      const at = sampleOf(ev.beat);
      for (let i = 0; i < v.L.length; i++) {
        const j = at + i;
        if (j >= n) break;
        raw.L[j] += v.L[i];
        raw.R[j] += v.R[i];
      }
    });
  }
  // the filter-house sweep: one resonant low-pass per side, its cutoff smoothed over ~60 ms
  const fl = new SVF(), fr = new SVF();
  const out = stereo(n);
  let c = cutoffAt(0);
  const a = 1 - Math.exp(-32 / (0.06 * SR));
  for (let i = 0; i < n; i++) {
    if (i % 32 === 0) {
      c += (cutoffAt(i / SPB) - c) * a;
      fl.set(c, 0.95);
      fr.set(c, 0.95);
    }
    out.L[i] = fl.tick(raw.L[i]);
    out.R[i] = fr.tick(raw.R[i]);
  }
  eqStereo(out, () => [new Biquad('hp', 120, 0.7), new Biquad('peak', 2600, 0.8, 1.5)]);
  const ens = chorus(out, { depthMs: 2.6, cycles: [5, 7, 3], mix: 0.45, baseMs: 8 });
  // e-piano
  const ep = stereo(n);
  const epc = new Map();
  for (const ev of score.ep) {
    ev.notes.forEach((m, k) => {
      const y = cached(epc, `${m}|${ev.dur}|${ev.vel}`, () => V.epiano(mtof(m), ev.dur, { vel: ev.vel }));
      addMono(ep, y, sampleOf(ev.beat), 0.32, (k / Math.max(1, ev.notes.length - 1)) * 0.7 - 0.35);
    });
  }
  const epCh = chorus(ep, { depthMs: 1.8, cycles: [4, 6, 3], mix: 0.4, baseMs: 6 });
  addStereo(ens, epCh, 0, 1);
  applyGain(ens, pump(n, kicks, 1));
  const wet = reverb(ens, { decay: 1.7, damp: 5200, predelay: 0.02, lowcut: 300, seed: 3 });
  addStereo(ens, wet, 0, 0.32);
  return ens;
}

// ---------------------------------------------------------------- bass
export function renderBass(score, n, kicks) {
  const out = stereo(n);
  const cache = new Map();
  for (const ev of score.bass) {
    const y = cached(cache, `${ev.midi}|${ev.dur}|${ev.vel}|${ev.bright}`, () => V.bass(mtof(ev.midi), ev.dur, { vel: ev.vel, bright: ev.bright }));
    addMono(out, y, sampleOf(ev.beat), 0.55, 0);
  }
  eqStereo(out, () => [new Biquad('hp', 28, 0.7), new Biquad('peak', 700, 1, 2.5)]);
  applyGain(out, pump(n, kicks, 0.75, 0.16));
  return out;
}

// ---------------------------------------------------------------- beat
export function renderBeat(score, n) {
  const dry = stereo(n);
  const send = stereo(n);
  const cache = new Map();
  const put = (ev, key, make, gain, pan, rev = 0) => {
    const y = cached(cache, key, make);
    addMono(dry, y, sampleOf(ev.beat), gain, pan);
    if (rev) addMono(send, y, sampleOf(ev.beat), gain * rev, pan);
  };
  for (const ev of score.kick) put(ev, `k${ev.vel.toFixed(3)}|${ev.tone.toFixed(3)}`, () => V.kick({ vel: ev.vel, tone: ev.tone }), 0.64, 0);
  for (const ev of score.clap) put(ev, `c${ev.vel}`, () => V.clap({ vel: ev.vel }), 0.42, 0, 0.35);
  for (const ev of score.hat) put(ev, `h${ev.vel.toFixed(3)}`, () => V.hat({ vel: ev.vel }), 0.3, 0.18);
  for (const ev of score.ohat) put(ev, `o${ev.vel}`, () => V.hat({ vel: ev.vel, open: true, seed: 13 }), 0.24, -0.12, 0.1);
  for (const ev of score.shaker) put(ev, `s${ev.vel.toFixed(3)}`, () => V.shaker({ vel: ev.vel }), 0.26, 0.32);
  for (const ev of score.conga) put(ev, `g${ev.midi}|${ev.vel}`, () => V.drumTone(mtof(ev.midi), { vel: ev.vel, decay: 0.12, slap: 0.3, bend: 0.3 }), 0.34, ev.midi > 70 ? 0.35 : -0.3, 0.2);
  for (const ev of score.tom) put(ev, `t${ev.midi}|${ev.vel}`, () => V.drumTone(mtof(ev.midi), { vel: ev.vel, decay: 0.2, slap: 0.15, bend: 0.5 }), 0.42, (ev.midi - 62) / 20, 0.25);
  for (const ev of score.snare) put(ev, `n${ev.vel.toFixed(3)}`, () => V.snare({ vel: ev.vel }), 0.36, 0.05, 0.3);
  for (const ev of score.cymbal) put(ev, `y${ev.seconds}|${ev.reverse}|${ev.vel}`, () => V.cymbal({ vel: ev.vel, seconds: ev.seconds, reverse: !!ev.reverse }), 0.5, 0, 0.3);
  for (const ev of score.riser) put(ev, `r${ev.seconds}`, () => V.riser({ vel: ev.vel, seconds: ev.seconds }), 0.5, 0, 0.4);
  const wet = reverb(send, { decay: 1.2, damp: 7000, predelay: 0.01, lowcut: 400, seed: 5, size: 0.8 });
  addStereo(dry, wet, 0, 0.5);
  return dry;
}

// ---------------------------------------------------------------- lead
export function renderLead(score, n, kicks, HLJOD) {
  const robot = stereo(n);
  const rc = new Map();
  for (const ev of score.robot) {
    const y = cached(rc, JSON.stringify(ev).replace(/"beat":[\d.]+,/, ''), () =>
      V.robot(mtof(ev.midi), ev.dur, { vel: ev.vel, vowels: ev.vowels, morph: ev.morph ?? 0.12 }),
    );
    addMono(robot, y, sampleOf(ev.beat), 0.5, 0.05);
  }
  const robotCh = chorus(robot, { depthMs: 1.2, cycles: [3, 5, 2], mix: 0.3, baseMs: 5 });
  const bells = stereo(n);
  const bc = new Map();
  for (const ev of score.bell) {
    const y = cached(bc, `${ev.midi}|${ev.vel.toFixed(3)}|${ev.decay}|${ev.bright ?? 1}`, () => V.bell(mtof(ev.midi), { vel: ev.vel, decay: ev.decay, bright: ev.bright ?? 1 }));
    addMono(bells, y, sampleOf(ev.beat), 0.4, ev.pan ?? 0);
  }
  eqStereo(bells, () => [new Biquad('hp', 400, 0.7)]);
  // her horn and the marimba (the chapter's recordings)
  const rec = stereo(n);
  const horn = loadTake(HLJOD, TAKES.horn[0]);
  const hornLevel = 0.62 / rmsOf(horn.x, horn.steadyFrom, horn.steadyTo);
  for (const ev of score.horn) {
    const rate = mtof(ev.midi) / horn.hz;
    const y = cached(rc, `horn${ev.midi}`, () => resample(horn.x, rate));
    const on = horn.onset / rate;
    const len = Math.min(y.length, Math.round(on + ev.dur * SR + 0.16 * SR));
    const cut = fadeOut(y.subarray(0, len), 0.16);
    addMono(rec, cut, sampleOf(ev.beat) - Math.round(on), hornLevel * 0.13 * ev.vel, -0.05);
  }
  const mar = loadTake(HLJOD, { file: 'marimba.mp3', fmin: 300, fmax: 900 });
  const marLevel = 0.5 / rmsOf(mar.x, 0, 0.3);
  for (const ev of score.marimba) {
    const rate = mtof(ev.midi) / mar.hz;
    const y = cached(rc, `mar${ev.midi}`, () => fadeOut(resample(mar.x, rate).slice(0, Math.round(1.4 * SR)), 0.5));
    addMono(rec, y, sampleOf(ev.beat) - Math.round(mar.onset / rate), marLevel * 0.055 * ev.vel, 0.1);
  }
  const out = stereo(n);
  addStereo(out, robotCh, 0, 1);
  addStereo(out, bells, 0, 1);
  applyGain(out, pump(n, kicks, 0.25));
  addStereo(out, rec, 0, 1);
  const echoes = stereo(n);
  addStereo(echoes, robotCh, 0, 0.22);
  addStereo(echoes, bells, 0, 0.5);
  addStereo(echoes, rec, 0, 0.16);
  const dl = pingPong(echoes, DOTTED8, 0.42, 4500, 300);
  const sendR = stereo(n);
  addStereo(sendR, robotCh, 0, 0.3);
  addStereo(sendR, bells, 0, 0.35);
  addStereo(sendR, rec, 0, 0.42);
  addStereo(sendR, dl, 0, 0.3);
  const wet = reverb(sendR, { decay: 2.2, damp: 6000, predelay: 0.03, lowcut: 350, seed: 9, size: 1.15 });
  addStereo(out, dl, 0, 1);
  addStereo(out, wet, 0, 0.42);
  return out;
}

// ---------------------------------------------------------------- animals
export function renderAnimals(score, n, kicks, HLJOD, log) {
  const out = stereo(n);
  const send = stereo(n);
  const flyEcho = stereo(n);
  const takes = {};
  for (const [g, list] of Object.entries(TAKES)) if (g !== 'horn') takes[g] = list.map(t => loadTake(HLJOD, t));
  const LEVEL = { grazers: 0.2, turtles: 0.19, frogs: 0.15, lizards: 0.13, flyers: 0.13 };
  for (const ev of score.calls) {
    const list = takes[ev.group];
    const take = list[ev.take % list.length];
    const m = moved(take, mtof(TONE[ev.group]), ev.octave);
    const norm = 0.25 / rmsOf(m.y, m.steadyFrom, m.steadyTo, true);
    let start, at, len;
    if (ev.mode === 'chop') {
      start = Math.max(0, Math.round(m.steadyFrom * SR - 0.006 * SR));
      at = sampleOf(ev.beat);
      len = Math.min(m.y.length - start, Math.round(ev.dur * 0.48 * SR * 0.95));
    } else {
      start = Math.max(0, Math.round(m.onset - 0.002 * SR));
      at = sampleOf(ev.beat) - Math.round(m.onset - start);
      len = Math.min(m.y.length - start, Math.round(m.onset - start + ev.dur * 0.48 * SR + 0.06 * SR));
    }
    const y = Float32Array.from(m.y.subarray(start, start + len));
    const fi = Math.round((ev.mode === 'chop' ? 0.004 : 0.002) * SR);
    if (ev.group === 'grazers' || ev.group === 'turtles') new Biquad('peak', 2200, 0.8, 5).run(y); // presence for tablet speakers
    for (let i = 0; i < fi && i < y.length; i++) y[i] *= i / fi;
    fadeOut(y, ev.mode === 'chop' ? 0.03 : 0.06);
    const gain = LEVEL[ev.group] * ev.vel * norm;
    addMono(out, y, at, gain, ev.pan);
    addMono(send, y, at, gain * (ev.mode === 'chop' ? 0.25 : 0.4), ev.pan);
    if (ev.group === 'flyers') addMono(flyEcho, y, at, gain * 0.5, ev.pan);
    log?.push({ group: ev.group, beat: ev.beat, file: m.file, rate: m.rate, hz: m.hz, mode: ev.mode, y, at, gain });
  }
  applyGain(out, pump(n, kicks, 0.12));
  const dl = pingPong(flyEcho, DOTTED8, 0.4, 6000, 600);
  addStereo(send, dl, 0, 0.3);
  addStereo(out, dl, 0, 0.8);
  const wet = reverb(send, { decay: 1.6, damp: 6500, predelay: 0.02, lowcut: 300, seed: 11 });
  addStereo(out, wet, 0, 0.45);
  return out;
}

// ---- helpers
function rmsOf(x, fromSec, toSec, samples = false) {
  const a = Math.max(0, Math.round(fromSec * SR)), b = Math.min(x.length, Math.max(a + 64, Math.round(toSec * SR)));
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a)) || 1e-3;
}
function fadeOut(y, sec) {
  const f = Math.min(y.length, Math.round(sec * SR));
  for (let i = 0; i < f; i++) y[y.length - 1 - i] *= i / f;
  return y;
}
export { sampleOf };
