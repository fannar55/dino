// Renders the score's parts into the five music stems (pad, bass, beat, lead, animals), each with its own effects: smidur-e's parts,
// with remix-c's automation and its new parts (the grazers' stomps, her wings and the wind, the frogs' boings, the beetles' clicks,
// the snail's slide whistle).
import { join } from 'node:path';
import { SR, decode } from './io.mjs';
import { stereo, addMono, addStereo, mtof, SVF, Biquad, eqStereo, pingPong, reverb, chorus, applyGain } from './dsp.mjs';
import * as V from './synths.mjs';
import { SPB, TONE, sectionAt, LOOP } from './score.mjs';
import { TAKES, loadTake, moved, movedRate, resample } from './takes.mjs';
import { steady, cents } from './pitch.mjs';

const sampleOf = beat => Math.round(beat * SPB);
// Nothing that belongs after the loop may sound inside it: a sound placed on or after the loop's end starts no earlier than it.
const LOOP_END = (LOOP.startBeat + LOOP.beats) * SPB;
function placeAt(y, at, beatSample) {
  if (beatSample >= LOOP_END && at < LOOP_END) return { y: y.subarray(LOOP_END - at), at: LOOP_END };
  return { y, at };
}
const DOTTED8 = 0.75 * SPB;

function cached(map, key, make) {
  if (!map.has(key)) map.set(key, make());
  return map.get(key);
}

// ---- automation (per beat): the pad's filter-house cutoff
const CUT = [
  [0, 350], [16, 3200], [48, 3000], [80, 2300], [96, 1200], [104, 3400], [112, 3000], [128, 3400], [144, 3000], [148, 3800],
  [152, 4800], [156, 6000], [160, 4000], [168, 6500], [176, 4000], [184, 6500], [192, 4300], [208, 2100], [240, 1100],
  [272, 4300], [336, 3900],
];
function cutoffAt(beat) {
  // piecewise: exponential ramps inside the intro, into the break and through the take-off; steps (smoothed later) elsewhere
  if (beat < 16) return 350 * (3200 / 350) ** (beat / 16);
  if (beat >= 240 && beat < 272) return 1100 * (4300 / 1100) ** ((beat - 240) / 32);
  if (beat >= 204 && beat < 208) return 4300 * (2100 / 4300) ** ((beat - 204) / 4);
  let v = CUT[0][1];
  for (const [b, c] of CUT) if (beat >= b) v = c;
  return v;
}
const PUMP = {
  intro: 0.3, groove: 0.5, tuneA: 0.5, grazers: 0.55, turtles: 0.45, frogs: 0.5, lizards: 0.5, flyers: 0.5, stoppdans: 0.5, allir: 0.5,
  break: 0, rise: 0.4, peak1: 0.5, peak2: 0.5, end: 0.38, snail: 0.38,
};

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

// ---------------------------------------------------------------- recorded one-shots (her wings, the wind)
const shots = new Map();
/** A recording from remake/assets/audio, peak-normalised, with where its onset (25% of peak) and its loudest 10 ms lie. */
export function loadShot(AUDIO, file) {
  if (shots.has(file)) return shots.get(file);
  const [x] = decode(join(AUDIO, file));
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < x.length; i++) x[i] /= peak || 1;
  let on = 0;
  while (on < x.length && Math.abs(x[on]) < 0.25) on++;
  const w = Math.round(0.01 * SR);
  let best = 0, bestAt = 0, s = 0;
  for (let i = 0; i < x.length; i++) {
    s += x[i] * x[i];
    if (i >= w) s -= x[i - w] * x[i - w];
    if (s > best) { best = s; bestAt = i - w / 2; }
  }
  const shot = { x, onset: on, peakAt: Math.max(0, Math.round(bestAt)) };
  shots.set(file, shot);
  return shot;
}
function shotOf(AUDIO, ev) {
  const sh = loadShot(AUDIO, ev.file);
  const len = ev.len ? Math.min(sh.x.length, Math.round(ev.len * SR)) : sh.x.length;
  const y = Float32Array.from(sh.x.subarray(0, len));
  const fi = Math.round((ev.fadeIn ?? 0.002) * SR), fo = Math.round((ev.fadeOut ?? 0.03) * SR);
  for (let i = 0; i < fi && i < y.length; i++) y[i] *= (i / fi) ** 2;
  for (let i = 0; i < fo && i < y.length; i++) y[y.length - 1 - i] *= i / fo;
  const lead = ev.align === 'onset' ? sh.onset : ev.align === 'peak' ? sh.peakAt : 0;
  return { y, at: sampleOf(ev.beat) - lead };
}

// ---------------------------------------------------------------- beat
export function renderBeat(score, n, AUDIO) {
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
  for (const ev of score.riser) put(ev, `r${ev.seconds}|${ev.from}|${ev.to}|${ev.vel}`, () => V.riser({ vel: ev.vel, seconds: ev.seconds, from: ev.from ?? 300, to: ev.to ?? 7000 }), 0.5, 0, 0.4);
  for (const ev of score.stomp) put(ev, `st${ev.vel}`, () => V.stomp({ vel: ev.vel }), 0.62, 0, 0.12);
  // her wings and the wind (chapter 4's recordings)
  for (const ev of score.sample) {
    const { y, at } = shotOf(AUDIO, ev);
    const g = (ev.group === 'wings' ? 0.42 : 0.5) * ev.vel;
    addMono(dry, y, at, g, ev.pan ?? 0);
    if (ev.rev) addMono(send, y, at, g * ev.rev, ev.pan ?? 0);
  }
  const wet = reverb(send, { decay: 1.2, damp: 7000, predelay: 0.01, lowcut: 400, seed: 5, size: 0.8 });
  addStereo(dry, wet, 0, 0.5);
  eqStereo(dry, () => [new Biquad('hp', 30, 0.7)]);
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
  // the frogs' hops: a spring boing on each
  for (const ev of score.boing) {
    const y = cached(bc, `boing${ev.midi}|${ev.vel}`, () => V.boing(mtof(ev.midi), { vel: ev.vel }));
    addMono(bells, y, sampleOf(ev.beat), 0.55, (ev.midi - 77) / 16);
  }
  eqStereo(bells, () => [new Biquad('hp', 300, 0.7)]);
  // her horn and the marimba (the chapter's recordings)
  const rec = stereo(n);
  const horn = loadTake(HLJOD, TAKES.horn[0]);
  const hornLevel = 0.62 / rmsOf(horn.x, horn.steadyFrom, horn.steadyTo);
  for (const ev of score.horn) {
    const rate = mtof(ev.midi) / horn.hz;
    const y = cached(rc, `horn${ev.midi}`, () => resample(horn.x, rate));
    const on = horn.onset / rate;
    const len = Math.min(y.length, Math.round(on + ev.dur * SR + 0.16 * SR));
    const cut = fadeOut(Float32Array.from(y.subarray(0, len)), 0.16);
    const p = placeAt(cut, sampleOf(ev.beat) - Math.round(on), sampleOf(ev.beat));
    addMono(rec, p.y, p.at, hornLevel * 0.13 * ev.vel, -0.05);
  }
  const mar = loadTake(HLJOD, { file: 'marimba.mp3', fmin: 300, fmax: 900 });
  const marLevel = 0.5 / rmsOf(mar.x, 0, 0.3);
  for (const ev of score.marimba) {
    const rate = mtof(ev.midi) / mar.hz;
    const y = cached(rc, `mar${ev.midi}`, () => fadeOut(resample(mar.x, rate).slice(0, Math.round(1.4 * SR)), 0.5));
    const p = placeAt(y, sampleOf(ev.beat) - Math.round(mar.onset / rate), sampleOf(ev.beat));
    addMono(rec, p.y, p.at, marLevel * 0.055 * ev.vel, 0.1);
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
export function renderAnimals(score, n, kicks, HLJOD, log, synthLog) {
  const out = stereo(n);
  const send = stereo(n);
  const flyEcho = stereo(n);
  const takes = {};
  for (const [g, list] of Object.entries(TAKES)) if (g !== 'horn') takes[g] = list.map(t => loadTake(HLJOD, t));
  const LEVEL = { grazers: 0.2, turtles: 0.19, frogs: 0.15, lizards: 0.13, flyers: 0.13 };
  const settled = new Map();
  const cutOf = (ev, m) => {
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
    if (ev.group === 'grazers' || ev.group === 'turtles') new Biquad('peak', 2200, 0.8, 5).run(y); // presence for tablet speakers
    const fi = Math.round((ev.mode === 'chop' ? 0.004 : 0.002) * SR);
    for (let i = 0; i < fi && i < y.length; i++) y[i] *= i / fi;
    fadeOut(y, ev.mode === 'chop' ? 0.03 : 0.06);
    return { y, at };
  };
  for (const ev of score.calls) {
    const list = takes[ev.group];
    const take = list[ev.take % list.length];
    const tone = mtof(TONE[ev.group]);
    // the take's own steady pitch puts it near the tone; then the cut call itself is measured (the part a listener hears as its
    // note) and the rate trimmed until that part is within 6 cents
    const key = `${take.file}|${ev.octave}|${ev.mode}|${ev.dur}`;
    let m, c;
    if (settled.has(key)) {
      m = movedRate(take, settled.get(key));
      c = cutOf(ev, m);
    } else {
      m = moved(take, tone, ev.octave);
      c = cutOf(ev, m);
      let best = { err: Infinity, m, c };
      for (let pass = 0; pass < 5; pass++) {
        const s = steady(c.y, { fmin: Math.max(60, m.hz / 1.45), fmax: Math.min(5000, m.hz * 1.45), win: 1024, hop: 128 });
        if (!s) break;
        let err = cents(s.hz, tone);
        err -= 1200 * Math.round(err / 1200);
        if (Math.abs(err) < Math.abs(best.err)) best = { err, m, c };
        if (Math.abs(err) <= 6) break;
        m = movedRate(take, m.rate * 2 ** (-err / 1200));
        c = cutOf(ev, m);
      }
      ({ m, c } = best);
      settled.set(key, m.rate);
    }
    const norm = 0.25 / rmsOf(m.y, m.steadyFrom, m.steadyTo, true);
    const gain = LEVEL[ev.group] * ev.vel * norm;
    const p = placeAt(c.y, c.at, sampleOf(ev.beat));
    addMono(out, p.y, p.at, gain, ev.pan);
    addMono(send, p.y, p.at, gain * (ev.mode === 'chop' ? 0.25 : 0.4), ev.pan);
    if (ev.group === 'flyers') addMono(flyEcho, p.y, p.at, gain * 0.5, ev.pan);
    log?.push({ group: ev.group, beat: ev.beat, file: m.file, rate: m.rate, hz: m.hz, mode: ev.mode, y: c.y, at: c.at, gain });
  }
  // the beetles' clock in the freezes
  const cc = new Map();
  for (const ev of score.tick) {
    const y = cached(cc, `tick${ev.midi}|${ev.vel}`, () => V.click(mtof(ev.midi), { vel: ev.vel }));
    addMono(out, y, sampleOf(ev.beat), 0.3, ev.pan);
    addMono(send, y, sampleOf(ev.beat), 0.3 * 0.35, ev.pan);
  }
  // the snail's slide whistle
  for (const ev of score.whistle) {
    const y = V.slideWhistle(ev.path, (ev.beats * SPB) / SR, ev.hold, { vel: ev.vel });
    const at = sampleOf(ev.beat);
    addMono(out, y, at, 0.22, 0.15);
    addMono(send, y, at, 0.22 * 0.4, 0.15);
    synthLog?.push({ group: 'snail', beat: ev.beat, y, at, glideSec: (ev.beats * SPB) / SR, hold: ev.hold, check: ev.check });
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
function rmsOf(x, fromSec, toSec) {
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
