// Renders the score's parts into the music stems (pad, bass, beat, lead, animals), each with its own effects.
// A copy of smidur-e's parts, with remix-a's new sounds: her wing beats and swoop and the forest's claps (beat), the forest's roar,
// the crowd's choir, the beetles and the dragonflies (animals).
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

// ---- automation (per beat): the pad's filter-house sweep
const CUT = [
  [0, 350], [32, 2400], [64, 3200], [96, 3000], [128, 2300], [144, 1900], [152, 3000], [160, 3000], [176, 3400], [192, 4300],
  [208, 3600], [224, 2100], [256, 1100], [288, 4300], [336, 1700], [352, 4300], [384, 3900],
];
function cutoffAt(beat) {
  if (beat < 32) return 350 * (2400 / 350) ** (beat / 32);
  if (beat >= 48 && beat < 64) return 2400 * (4000 / 2400) ** ((beat - 48) / 16);
  if (beat >= 256 && beat < 288) return 1100 * (4300 / 1100) ** ((beat - 256) / 32);
  if (beat >= 220 && beat < 224) return 3600 * (2100 / 3600) ** ((beat - 220) / 4);
  if (beat >= 344 && beat < 352) return 1700 * (4300 / 1700) ** ((beat - 344) / 8);
  let v = CUT[0][1];
  for (const [b, c] of CUT) if (beat >= b) v = c;
  return v;
}
const PUMP = {
  arrival: 0.3, welcome: 0.3, warmup: 0.45, groove: 0.5, tuneA: 0.5, grazers: 0.55, turtles: 0.45, frogs: 0.5, lizards: 0.5, flyers: 0.5,
  beetles: 0.5, dragonflies: 0.45, break: 0, rise: 0.4, drop: 0.5, anthem: 0.5, crowd: 0.45, onemore: 0.5, end: 0.38,
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

// ---------------------------------------------------------------- beat (and her wings, her swoop, the forest's claps)
const K4 = 'remake/assets/audio/kafli4/hljod';
const WINGS = ['wing-1.mp3', 'wing-2.mp3', 'wing-3.mp3'];
const WHOOSH = ['whoosh-1.mp3', 'whoosh-2.mp3'];
function loadPlain(ROOT, file) {
  const [x] = decode(join(ROOT, K4, file));
  let peak = 0, at = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > peak) { peak = Math.abs(x[i]); at = i; }
  let on = 0;
  while (on < x.length && Math.abs(x[on]) < peak * 0.12) on++;
  // the loudest 50 ms (the swoop's closest point)
  const w = Math.round(0.05 * SR);
  let best = 0, bestAt = 0, acc = 0;
  for (let i = 0; i < x.length; i++) {
    acc += x[i] * x[i];
    if (i >= w) acc -= x[i - w] * x[i - w];
    if (acc > best) { best = acc; bestAt = i - w / 2; }
  }
  let s = 0;
  for (const v of x) s += v * v;
  return { file, x, peak, peakAt: at, onset: on, loudAt: Math.max(0, Math.round(bestAt)), rms: Math.sqrt(s / x.length) };
}
export function renderBeat(score, n, ROOT) {
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
  // the forest's claps
  const cc = new Map();
  for (const ev of score.crowdClap) {
    const c = cached(cc, `cc${ev.vel}`, () => V.crowdClap({ vel: ev.vel }));
    const at = sampleOf(ev.beat);
    for (let i = 0; i < c.L.length && at + i < n; i++) {
      dry.L[at + i] += c.L[i];
      dry.R[at + i] += c.R[i];
      send.L[at + i] += c.L[i] * 0.4;
      send.R[at + i] += c.R[i] * 0.4;
    }
  }
  // her wing beats: the attack on the beat; the take picked by the beat's place in the 4-bar phrase (so the loop repeats)
  const wings = WINGS.map(f => loadPlain(ROOT, f));
  for (const ev of score.wing) {
    const w = wings[(Math.round(ev.beat * 2) % 32) % 3];
    let y = w.x.subarray(Math.max(0, w.onset - Math.round(0.004 * SR)));
    if (ev.len) y = fadeOut(Float32Array.from(y.subarray(0, Math.round(ev.len * SPB))), 0.02);
    const pre = w.onset - Math.max(0, w.onset - Math.round(0.004 * SR));
    const g = (0.17 / w.rms) * ev.vel * 0.42;
    const p = placeAt(y, sampleOf(ev.beat) - pre, sampleOf(ev.beat));
    addMono(dry, p.y, p.at, g, 0);
    addMono(send, p.y, p.at, g * 0.3, 0);
  }
  // her swoop: its closest point on the beat (or its start, for the last one)
  const wh = WHOOSH.map(f => loadPlain(ROOT, f));
  for (const ev of score.whoosh) {
    const w = wh[ev.take % wh.length];
    const at = sampleOf(ev.beat) - (ev.peakAt ? w.loudAt : w.onset);
    const g = (0.12 / w.rms) * ev.vel;
    // a smooth pan from left to right across the swoop
    for (let i = 0; i < w.x.length; i++) {
      const j = at + i;
      if (j < 0) continue;
      if (j >= n) break;
      const a = ((-0.6 + 1.2 * (i / w.x.length) + 1) / 2) * (Math.PI / 2);
      dry.L[j] += w.x[i] * g * Math.cos(a);
      dry.R[j] += w.x[i] * g * Math.sin(a);
    }
    addMono(send, w.x, at, g * 0.3, 0);
  }
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

// ---------------------------------------------------------------- animals (and the crowd, the beetles, the dragonflies)
export function renderAnimals(score, n, kicks, HLJOD, log) {
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
      at = sampleOf(ev.beat) - Math.round(m.onset - start) + Math.round(ev.shift ?? 0);
      len = Math.min(m.y.length - start, Math.round(m.onset - start + ev.dur * 0.48 * SR + 0.06 * SR));
    }
    const y = Float32Array.from(m.y.subarray(start, start + len));
    if (ev.group === 'grazers' || ev.group === 'turtles') new Biquad('peak', 2200, 0.8, 5).run(y);
    const fi = Math.round((ev.mode === 'chop' ? 0.004 : 0.002) * SR);
    for (let i = 0; i < fi && i < y.length; i++) y[i] *= i / fi;
    fadeOut(y, ev.mode === 'chop' ? 0.03 : 0.06);
    return { y, at };
  };
  for (const ev of score.calls) {
    const list = takes[ev.group];
    const take = list[ev.take % list.length];
    const tone = mtof(TONE[ev.group]);
    const cutMode = ev.mode === 'roar' ? 'onset' : ev.mode;
    const key = `${take.file}|${ev.octave}|${cutMode}|${ev.dur}`;
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
    addMono(send, p.y, p.at, gain * (ev.mode === 'chop' ? 0.25 : ev.mode === 'roar' ? 0.6 : 0.4), ev.pan);
    if (ev.group === 'flyers') addMono(flyEcho, p.y, p.at, gain * 0.5, ev.pan);
    log?.push({ group: ev.group, beat: ev.beat, file: m.file, rate: m.rate, hz: m.hz, mode: ev.mode, y: c.y, at: c.at, gain });
  }
  // the crowd's cheer (the forest as one voice)
  const crc = new Map();
  for (const ev of score.crowd) {
    const c = cached(crc, `${ev.seconds}|${ev.seed}`, () => V.crowd(ev.seconds, { vel: 1, seed: ev.seed }));
    const at = sampleOf(ev.beat);
    const g = 0.05 * ev.vel;
    for (let i = 0; i < c.L.length && at + i < n; i++) {
      out.L[at + i] += c.L[i] * g;
      out.R[at + i] += c.R[i] * g;
      send.L[at + i] += c.L[i] * g * 0.7;
      send.R[at + i] += c.R[i] * g * 0.7;
    }
  }
  // the crowd's choir: everyone singing her tune an octave under the robot, three voices a few cents apart
  const ch = stereo(n);
  const chc = new Map();
  for (const ev of score.choir) {
    [[-7, -0.6, 'a'], [0, 0, 'o'], [7, 0.6, 'a']].forEach(([det, pan, vow], k) => {
      const y = cached(chc, `${ev.midi}|${ev.dur}|${ev.vel}|${k}`, () =>
        V.robot(mtof(ev.midi) * 2 ** (det / 1200), ev.dur, { vel: ev.vel, vowels: ['o', vow], morph: 0.2, scoop: 30, vib: 12 + 4 * k }),
      );
      const p = placeAt(y, sampleOf(ev.beat), sampleOf(ev.beat));
      addMono(ch, p.y, p.at, 0.14, pan);
    });
  }
  eqStereo(ch, () => [new Biquad('hp', 140, 0.7), new Biquad('lp', 5000, 0.7)]);
  const chw = chorus(ch, { depthMs: 3, cycles: [4, 6, 3], mix: 0.5, baseMs: 9 });
  addStereo(out, chw, 0, 1);
  addStereo(send, chw, 0, 0.5);
  // the beetles' wooden clicks
  const bc = new Map();
  for (const ev of score.beetle) {
    const y = cached(bc, `${ev.midi}`, () => V.beetle(mtof(ev.midi), { vel: 1, seed: 21 + ev.midi }));
    addMono(out, y, sampleOf(ev.beat), 0.16 * ev.vel, ev.pan ?? 0);
    addMono(send, y, sampleOf(ev.beat), 0.05 * ev.vel, ev.pan ?? 0);
  }
  // the dragonflies, flying from one side to the other
  for (const ev of score.buzz) {
    const y = V.buzz(mtof(ev.midi), ev.dur, { vel: 1, glideTo: ev.glideTo, seed: 22 + ev.midi });
    const at = sampleOf(ev.beat);
    const g = 0.09 * ev.vel;
    for (let i = 0; i < y.length && at + i < n; i++) {
      const u = i / y.length;
      const pan = ev.panFrom + (ev.panTo - ev.panFrom) * u;
      const a = ((pan + 1) / 2) * (Math.PI / 2);
      out.L[at + i] += y[i] * g * Math.cos(a);
      out.R[at + i] += y[i] * g * Math.sin(a);
      send.L[at + i] += y[i] * g * 0.3 * Math.cos(a);
      send.R[at + i] += y[i] * g * 0.3 * Math.sin(a);
    }
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
export function fadeOut(y, sec) {
  const f = Math.min(y.length, Math.round(sec * SR));
  for (let i = 0; i < f; i++) y[y.length - 1 - i] *= i / f;
  return y;
}
export { sampleOf };
