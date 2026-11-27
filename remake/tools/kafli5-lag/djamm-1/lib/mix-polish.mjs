// Mix polish stage ("Mix B", approved 2026-11-27) for Chapter 5's party set ("Stóra sviðið", djamm-1).
// Takes the 7 separated pre-master stems ({ drums, bass, music, animals, horn, dj, fx }) and produces a
// polished stereo pre-master buffer ready for final -16.0 LUFS mastering:
//   1. Drums: New York parallel compression + top sheen (and parallel punch on full-record climaxes carnival/lastchorus).
//   2. Bass: Sub cleanup (<32 Hz) + small-speaker upper-bass harmonic warmth (140-580 Hz) centered in mono.
//   3. Music: Focused 270 Hz mud carve, disco-funk presence/air, <105 Hz high-pass on vamp sections only, silky break EQ.
//   4. Horn: Mono-safe stereo chorus double-tracking + golden brass presence + subtle forest-hall shimmer.
//   5. Animals: Clarity EQ + blooming chorus double-tracking on anthem, carnival & lastchorus.
//   6. Kick-driven sidechain bounce (subtle 1.0-1.6 dB dip on music/fx).
//   7. Smooth per-section balance automation + mono low-end (<140 Hz) + tablet-safe Mid/Side stage + SSL-style bus glue & tape polish.
import { SR } from './io.mjs';
import { Biquad, eqStereo, stereo, reverb, TAU } from './dsp.mjs';
import { lufs } from './master.mjs';

const dbToGain = d => 10 ** (d / 20);

function cloneStereo(st) {
  return { L: Float32Array.from(st.L), R: Float32Array.from(st.R), n: st.n };
}

function zeroPhaseLP(ch, hz) {
  const y = Float32Array.from(ch);
  new Biquad('lp', hz, Math.SQRT1_2).run(y);
  y.reverse();
  new Biquad('lp', hz, Math.SQRT1_2).run(y);
  y.reverse();
  return y;
}

function zeroPhaseHP(ch, hz) {
  const y = Float32Array.from(ch);
  new Biquad('hp', hz, Math.SQRT1_2).run(y);
  y.reverse();
  new Biquad('hp', hz, Math.SQRT1_2).run(y);
  y.reverse();
  return y;
}

/** Stereo-linked feed-forward soft-knee compressor. */
export function compressStereo(src, {
  thresholdDb = -16,
  ratio = 2.0,
  attackMs = 20,
  releaseMs = 110,
  kneeDb = 4,
  scHpHz = 0,
  makeupDb = 0,
} = {}) {
  const n = src.n;
  let detL = src.L, detR = src.R;
  if (scHpHz > 0) {
    detL = Float32Array.from(src.L);
    detR = Float32Array.from(src.R);
    new Biquad('hp', scHpHz, 0.707).run(detL);
    new Biquad('hp', scHpHz, 0.707).run(detR);
  }
  const att = Math.exp(-1 / ((attackMs / 1000) * SR));
  const rel = Math.exp(-1 / ((releaseMs / 1000) * SR));
  const makeup = dbToGain(makeupDb);
  const halfKnee = kneeDb / 2;
  const slope = 1 - 1 / ratio;
  const out = stereo(n);

  let env = 0, maxGrDb = 0, grSum = 0, activeCount = 0;
  for (let i = 0; i < n; i++) {
    const pk = Math.max(Math.abs(detL[i]), Math.abs(detR[i]));
    env = pk > env ? att * env + (1 - att) * pk : rel * env + (1 - rel) * pk;
    const inDb = 20 * Math.log10(Math.max(env, 1e-9));
    const over = inDb - thresholdDb;
    let grDb = 0;
    if (kneeDb > 0 && over > -halfKnee && over < halfKnee) {
      const x = over + halfKnee;
      grDb = (slope * x * x) / (2 * kneeDb);
    } else if (over >= halfKnee) {
      grDb = slope * over;
    }
    if (grDb > maxGrDb) maxGrDb = grDb;
    if (grDb > 0.1) { grSum += grDb; activeCount++; }
    const g = dbToGain(-grDb) * makeup;
    out.L[i] = src.L[i] * g;
    out.R[i] = src.R[i] * g;
  }
  return { out, maxGrDb, avgGrDb: activeCount ? grSum / activeCount : 0 };
}

/** Smooth raised-cosine-like per-sample automation curve from sectionId -> value map. */
function buildSectionCurve(n, sections, spb, valueBySection, defaultVal = 0, rampSec = 0.42) {
  const raw = new Float32Array(n).fill(defaultVal);
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const s = sections[sIdx];
    const startBeat = s.startBeat ?? s.bar * 4;
    const a = Math.max(0, Math.round(startBeat * spb));
    const nextStart = sIdx + 1 < sections.length
      ? Math.round((sections[sIdx + 1].startBeat ?? sections[sIdx + 1].bar * 4) * spb)
      : n;
    const b = Math.min(n, nextStart);
    raw.fill(valueBySection[s.id] ?? defaultVal, a, b);
  }
  const w = Math.max(1, Math.round((rampSec * SR) / 2));
  const pass = arr => {
    const dst = new Float32Array(n);
    let acc = 0;
    const half = Math.floor(w / 2);
    for (let i = -half; i < n + half; i++) {
      const addIdx = Math.min(n - 1, Math.max(0, i + half));
      const subIdx = Math.min(n - 1, Math.max(0, i - half - 1));
      if (i === -half) {
        acc = 0;
        for (let k = -half; k <= half; k++) acc += arr[Math.min(n - 1, Math.max(0, k))];
      } else {
        acc += arr[addIdx] - arr[subIdx];
      }
      if (i >= 0 && i < n) dst[i] = acc / (2 * half + 1);
    }
    return dst;
  };
  return pass(pass(raw));
}

/** Mono-safe stereo chorus / micro-doubler (two modulated taps per side). */
function stereoDoubler(src, { baseL = 12, baseR = 17, depthL = 2.5, depthR = 2.8, rateL = 0.37, rateR = 0.43, hpHz = 260, lpHz = 5800 } = {}) {
  const n = src.n;
  const maxDel = Math.ceil(((Math.max(baseL + depthL, baseR + depthR) + 4) / 1000) * SR) + 8;
  const ringL = new Float32Array(maxDel);
  const ringR = new Float32Array(maxDel);
  const out = stereo(n);
  let w = 0;
  const readFrac = (buf, del) => {
    let p = w - del;
    if (p < 0) p += maxDel;
    const i0 = Math.floor(p) % maxDel;
    const i1 = (i0 + 1) % maxDel;
    const fr = p - Math.floor(p);
    return buf[i0] + (buf[i1] - buf[i0]) * fr;
  };
  for (let i = 0; i < n; i++) {
    const m = (src.L[i] + src.R[i]) * 0.5;
    ringL[w] = 0.65 * src.R[i] + 0.35 * m;
    ringR[w] = 0.65 * src.L[i] + 0.35 * m;
    const t = i / SR;
    const d1 = ((baseL + depthL * Math.sin(TAU * rateL * t)) / 1000) * SR;
    const d2 = ((baseL * 1.41 + depthL * 0.7 * Math.sin(TAU * (rateL * 1.31) * t + 2.1)) / 1000) * SR;
    const d3 = ((baseR + depthR * Math.sin(TAU * rateR * t + 1.4)) / 1000) * SR;
    const d4 = ((baseR * 0.77 + depthR * 0.8 * Math.sin(TAU * (rateR * 1.23) * t + 3.9)) / 1000) * SR;
    out.L[i] = 0.55 * readFrac(ringL, d1) + 0.45 * readFrac(ringL, d2);
    out.R[i] = 0.55 * readFrac(ringR, d3) + 0.45 * readFrac(ringR, d4);
    w = (w + 1) % maxDel;
  }
  eqStereo(out, () => [new Biquad('hp', hpHz, 0.707), new Biquad('lp', lpHz, 0.707)]);
  return out;
}

/** Kick-driven sidechain gain curve from a stereo trigger stem (<115 Hz). */
function kickDuckCurve(triggerStem, maxDuckDbCurve, { threshDb = -22, attackMs = 3, releaseMs = 110 } = {}) {
  const n = triggerStem.n;
  const monoKick = new Float32Array(n);
  for (let i = 0; i < n; i++) monoKick[i] = 0.5 * (triggerStem.L[i] + triggerStem.R[i]);
  new Biquad('lp', 115, 0.707).run(monoKick);
  new Biquad('hp', 35, 0.707).run(monoKick);

  const att = Math.exp(-1 / ((attackMs / 1000) * SR));
  const rel = Math.exp(-1 / ((releaseMs / 1000) * SR));
  const g = new Float32Array(n);
  let env = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(monoKick[i]);
    env = a > env ? att * env + (1 - att) * a : rel * env + (1 - rel) * a;
    const db = 20 * Math.log10(Math.max(env, 1e-9));
    const strength = Math.max(0, Math.min(1, (db - threshDb) / 10));
    g[i] = dbToGain(-strength * maxDuckDbCurve[i]);
  }
  return g;
}

/**
 * Applies the Mix B polish to the 7 pre-master stems without mutating the inputs.
 * Returns { mix, metrics } where `mix` is a stereo Float32 buffer ready for final LUFS/true-peak mastering.
 */
export function polishMix(raw, sections, spb) {
  const n = raw.drums.n;
  const curve = (map, def = 0, ramp = 0.42) => buildSectionCurve(n, sections, spb, map, def, ramp);

  // 1. Drums: parallel NY compression + top sheen
  const drums = cloneStereo(raw.drums);
  eqStereo(drums, () => [
    new Biquad('hp', 30, 0.707),
    new Biquad('peak', 280, 1.3, -1.0),
    new Biquad('peak', 2600, 1.0, 1.2),
    new Biquad('highshelf', 7500, 0.7, 1.6),
  ]);
  const parDrumSrc = cloneStereo(raw.drums);
  eqStereo(parDrumSrc, () => [new Biquad('hp', 48, 0.707), new Biquad('peak', 3000, 1.0, 2.4)]);
  const parDrumComp = compressStereo(parDrumSrc, {
    thresholdDb: -30, ratio: 8, attackMs: 2.5, releaseMs: 65, kneeDb: 6, makeupDb: 11,
  });
  for (let i = 0; i < n; i++) {
    parDrumComp.out.L[i] = Math.tanh(parDrumComp.out.L[i] * 1.5) / 1.5;
    parDrumComp.out.R[i] = Math.tanh(parDrumComp.out.R[i] * 1.5) / 1.5;
  }
  const parDrumBlend = curve({
    arrival: dbToGain(-15), welcome: dbToGain(-13), warmup: dbToGain(-11.5),
    groove: dbToGain(-9.2), tuneA: dbToGain(-9.8), grazers: dbToGain(-10.2),
    lizards: dbToGain(-9.5), flyers: dbToGain(-9.5), beetles: dbToGain(-8.0), dragonflies: dbToGain(-10.0),
    break: dbToGain(-18), rise: dbToGain(-10.5), drop: dbToGain(-8.0), rewind: dbToGain(-11.5),
    redrop: dbToGain(-8.0), anthem: dbToGain(-8.5), freeze: dbToGain(-14),
    crowd: dbToGain(-8.0), fakeend: dbToGain(-13), end: dbToGain(-10.0),
  }, dbToGain(-11.5));
  for (let i = 0; i < n; i++) {
    drums.L[i] += parDrumComp.out.L[i] * parDrumBlend[i];
    drums.R[i] += parDrumComp.out.R[i] * parDrumBlend[i];
  }

  // 2. Bass: sub control + small-speaker upper-bass harmonics (centered)
  const bass = cloneStereo(raw.bass);
  eqStereo(bass, () => [
    new Biquad('hp', 32, 0.707),
    new Biquad('peak', 250, 1.3, -1.0),
    new Biquad('peak', 900, 1.0, 1.8),
  ]);
  const bassFund = new Float32Array(n);
  for (let i = 0; i < n; i++) bassFund[i] = 0.5 * (bass.L[i] + bass.R[i]);
  new Biquad('hp', 55, 0.707).run(bassFund);
  new Biquad('lp', 210, 0.707).run(bassFund);
  const bassHarm = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = bassFund[i] * 2.6;
    bassHarm[i] = Math.tanh(x) + 0.16 * x * x;
  }
  new Biquad('hp', 140, 0.707).run(bassHarm);
  new Biquad('lp', 580, 0.707).run(bassHarm);
  const harmGain = dbToGain(-9.0);
  for (let i = 0; i < n; i++) {
    const m = 0.5 * (bass.L[i] + bass.R[i]) + bassHarm[i] * harmGain;
    bass.L[i] = m;
    bass.R[i] = m;
  }

  // 3. Music: EQ clarity, vamp low-cut, silky break EQ, parallel punch on full-record climaxes
  const music = cloneStereo(raw.music);
  eqStereo(music, () => [
    new Biquad('hp', 32, 0.707),
    new Biquad('peak', 270, 1.4, -1.5),
    new Biquad('peak', 1400, 0.9, 1.1),
    new Biquad('peak', 3100, 0.85, 2.3),
    new Biquad('highshelf', 8400, 0.7, 2.2),
  ]);
  const vampMask = curve({
    arrival: 1, welcome: 1, warmup: 1, groove: 1, tuneA: 1, grazers: 1,
    turtles: 0, frogs: 0, lizards: 1, flyers: 1, beetles: 1, dragonflies: 1,
    break: 0, rise: 1, drop: 1, rewind: 1, redrop: 1, anthem: 1, freeze: 1,
    carnival: 0, crowd: 1, fakeend: 1, lastchorus: 0, end: 1,
  }, 0, 0.35);
  const musicHpL = zeroPhaseHP(music.L, 105);
  const musicHpR = zeroPhaseHP(music.R, 105);
  for (let i = 0; i < n; i++) {
    const m = vampMask[i];
    if (m > 0) {
      music.L[i] = music.L[i] * (1 - m) + musicHpL[i] * m;
      music.R[i] = music.R[i] * (1 - m) + musicHpR[i] * m;
    }
  }
  const breakMask = curve({ break: 1 }, 0, 0.6);
  const breakSilk = cloneStereo(music);
  eqStereo(breakSilk, () => [new Biquad('peak', 250, 1.1, -2.8), new Biquad('highshelf', 6000, 0.7, 2.4)]);
  for (let i = 0; i < n; i++) {
    const m = breakMask[i];
    if (m > 0) {
      music.L[i] = music.L[i] * (1 - m) + breakSilk.L[i] * m;
      music.R[i] = music.R[i] * (1 - m) + breakSilk.R[i] * m;
    }
  }
  const fullRecPunchMask = curve({ carnival: dbToGain(-10.5), lastchorus: dbToGain(-8.5) }, 0, 0.45);
  const parMusicSrc = cloneStereo(music);
  eqStereo(parMusicSrc, () => [new Biquad('hp', 55, 0.707), new Biquad('peak', 3000, 0.9, 1.8)]);
  const parMusicComp = compressStereo(parMusicSrc, {
    thresholdDb: -24, ratio: 5, attackMs: 8, releaseMs: 80, kneeDb: 5, makeupDb: 7.5,
  });
  for (let i = 0; i < n; i++) {
    const g = fullRecPunchMask[i];
    if (g > 0) {
      music.L[i] += parMusicComp.out.L[i] * g;
      music.R[i] += parMusicComp.out.R[i] * g;
    }
  }

  // 4. Horn: double-tracked chorus + golden presence + subtle forest shimmer
  const horn = cloneStereo(raw.horn);
  eqStereo(horn, () => [
    new Biquad('hp', 95, 0.707),
    new Biquad('peak', 260, 1.3, -1.5),
    new Biquad('peak', 2200, 0.9, 2.6),
    new Biquad('highshelf', 5200, 0.7, 2.2),
  ]);
  const hornDbl = stereoDoubler(horn, { baseL: 12, baseR: 17, depthL: 2.5, depthR: 2.8, rateL: 0.37, rateR: 0.43, hpHz: 260, lpHz: 5800 });
  const hornRev = reverb(horn, { decay: 1.5, damp: 5200, predelay: 0.025, size: 1.0, lowcut: 380, seed: 42 });
  const hornDblCurve = curve({ break: dbToGain(-7.5), anthem: dbToGain(-7.0), lastchorus: dbToGain(-6.5), end: dbToGain(-7.5) }, dbToGain(-10.0), 0.5);
  const hornRevCurve = curve({ break: dbToGain(-14.0), anthem: dbToGain(-17.0), lastchorus: dbToGain(-16.0), end: dbToGain(-14.0) }, dbToGain(-19.0), 0.5);
  for (let i = 0; i < n; i++) {
    horn.L[i] += hornDbl.L[i] * hornDblCurve[i] + hornRev.L[i] * hornRevCurve[i];
    horn.R[i] += hornDbl.R[i] * hornDblCurve[i] + hornRev.R[i] * hornRevCurve[i];
  }

  // 5. Animals: clarity + wide choir bloom on climaxes
  const animals = cloneStereo(raw.animals);
  eqStereo(animals, () => [
    new Biquad('hp', 80, 0.707),
    new Biquad('peak', 280, 1.3, -1.0),
    new Biquad('peak', 3000, 0.9, 2.2),
    new Biquad('highshelf', 8000, 0.7, 1.4),
  ]);
  const animDbl = stereoDoubler(animals, { baseL: 11, baseR: 16, depthL: 2.2, depthR: 2.6, rateL: 0.47, rateR: 0.53, hpHz: 320, lpHz: 6800 });
  const animDblCurve = curve({
    arrival: dbToGain(-17), welcome: dbToGain(-15), warmup: dbToGain(-15), tuneA: dbToGain(-12),
    grazers: dbToGain(-15), turtles: dbToGain(-15), frogs: dbToGain(-15),
    lizards: dbToGain(-14), flyers: dbToGain(-13), beetles: dbToGain(-16), dragonflies: dbToGain(-13),
    drop: dbToGain(-10.0), redrop: dbToGain(-10.0), anthem: dbToGain(-8.5), carnival: dbToGain(-10.0),
    lastchorus: dbToGain(-7.8), end: dbToGain(-9.0),
  }, dbToGain(-15), 0.45);
  for (let i = 0; i < n; i++) {
    animals.L[i] += animDbl.L[i] * animDblCurve[i];
    animals.R[i] += animDbl.R[i] * animDblCurve[i];
  }

  // 6. FX & DJ voice polish
  const fx = cloneStereo(raw.fx);
  eqStereo(fx, () => [
    new Biquad('hp', 36, 0.707),
    new Biquad('peak', 300, 1.3, -1.0),
    new Biquad('peak', 2600, 1.0, 1.0),
    new Biquad('highshelf', 8500, 0.7, 1.2),
  ]);
  const dj = cloneStereo(raw.dj);
  eqStereo(dj, () => [
    new Biquad('hp', 95, 0.707),
    new Biquad('peak', 310, 1.2, -1.0),
    new Biquad('peak', 2700, 1.0, 2.0),
  ]);

  // 7. Kick-driven sidechain bounce
  const gMusicSc = kickDuckCurve(raw.drums, curve({
    warmup: 0.7, groove: 1.6, tuneA: 1.3, grazers: 1.1, lizards: 0.9, flyers: 0.9,
    drop: 1.5, redrop: 1.5, anthem: 1.4,
  }, 0, 0.35), { threshDb: -22, attackMs: 3, releaseMs: 110 });
  const gFxVampSc = kickDuckCurve(raw.drums, curve({ drop: 1.3, redrop: 1.2, anthem: 1.0 }, 0, 0.35), { threshDb: -22, attackMs: 3, releaseMs: 110 });
  const gFxFullSc = kickDuckCurve(raw.music, curve({ carnival: 1.2, lastchorus: 1.4 }, 0, 0.35), { threshDb: -20, attackMs: 4, releaseMs: 110 });
  for (let i = 0; i < n; i++) {
    music.L[i] *= gMusicSc[i];
    music.R[i] *= gMusicSc[i];
    const fg = gFxVampSc[i] * gFxFullSc[i];
    fx.L[i] *= fg;
    fx.R[i] *= fg;
  }

  // 8. Smooth section rebalancing + mono low-end (<140 Hz) + tablet-safe Mid/Side stage
  const gDrums = curve({
    arrival: 1.0, welcome: 0.8, warmup: 0.7, groove: 2.2, tuneA: 1.3, grazers: 1.1,
    lizards: 2.4, flyers: 1.9, beetles: 2.5, dragonflies: 1.6,
    break: 0, rise: 0.8, drop: 1.1, rewind: 0.5, redrop: 0.9,
    anthem: 1.3, freeze: 0.4, crowd: 1.3, fakeend: 0.5, end: 1.0,
  }, 0.5);
  const gBass = curve({
    arrival: 1.0, welcome: 0.8, warmup: 0.7, groove: 2.1, tuneA: 1.3, grazers: 1.1,
    lizards: 2.2, flyers: 1.7, dragonflies: 1.4,
    rise: 0.7, drop: 1.1, rewind: 0.5, redrop: 0.9,
    anthem: 1.2, freeze: 0.4, fakeend: 0.5, end: 1.0,
  }, 0.5);
  const gMusic = curve({
    arrival: 1.0, welcome: 0.8, warmup: 0.7, groove: 2.4, tuneA: 1.5, grazers: 1.1,
    turtles: 0.4, frogs: 0.6, lizards: 2.4, flyers: 1.9, dragonflies: 1.6,
    break: -2.2, rise: 0.8, drop: 1.2, rewind: 0.6, redrop: 1.0,
    anthem: 1.4, freeze: 0.4, carnival: 1.0, crowd: 0.6, fakeend: 0.5, lastchorus: 2.5, end: 1.0,
  }, 0.5, 0.48);
  const gAnimals = curve({
    arrival: 1.0, welcome: 0.7, warmup: 0.6, tuneA: 1.2, grazers: 1.2, turtles: 1.2, frogs: 1.1,
    lizards: 2.2, flyers: 1.7, beetles: 1.2, dragonflies: 1.6,
    rise: 0.7, drop: 1.1, redrop: 1.1, anthem: 1.6, carnival: 1.0, crowd: 0.8, lastchorus: 2.6, end: 1.2,
  }, 0.5);
  const gHorn = curve({ break: 1.8, anthem: 1.4, lastchorus: 2.2, end: 1.2 }, 0.6, 0.48);
  const gFx = curve({ drop: -0.2, redrop: 0.0, carnival: 0.0, crowd: 0.8, lastchorus: 1.1 }, 0.4);
  const gDj = curve({
    welcome: 1.0, warmup: 1.0, grazers: 1.2, turtles: 1.3, frogs: 1.0,
    lizards: 2.0, flyers: 1.8, beetles: 2.0, dragonflies: 1.6,
    rise: 1.0, drop: 2.4, rewind: 1.4, redrop: 1.8, anthem: 1.2,
    freeze: 1.0, carnival: 2.2, crowd: 1.4, fakeend: 0.8, end: 1.4,
  }, 1.0, 0.35);

  const wideBus = stereo(n);
  const centerBus = stereo(n);
  for (let i = 0; i < n; i++) {
    const gd = dbToGain(gDrums[i]), gb = dbToGain(gBass[i]), gm = dbToGain(gMusic[i]);
    const ga = dbToGain(gAnimals[i]), gh = dbToGain(gHorn[i]), gf = dbToGain(gFx[i]), gj = dbToGain(gDj[i]);
    wideBus.L[i] = drums.L[i] * gd + music.L[i] * gm + animals.L[i] * ga + horn.L[i] * gh + fx.L[i] * gf;
    wideBus.R[i] = drums.R[i] * gd + music.R[i] * gm + animals.R[i] * ga + horn.R[i] * gh + fx.R[i] * gf;
    centerBus.L[i] = bass.L[i] * gb + dj.L[i] * gj;
    centerBus.R[i] = bass.R[i] * gb + dj.R[i] * gj;
  }

  const lowL = zeroPhaseLP(wideBus.L, 140);
  const lowR = zeroPhaseLP(wideBus.R, 140);
  const sideGainCurve = curve({
    arrival: 1.02, welcome: 1.04, warmup: 1.06, groove: 1.14, tuneA: 1.12,
    grazers: 1.06, turtles: 1.08, frogs: 1.08, lizards: 1.08, flyers: 1.10, beetles: 1.08, dragonflies: 1.06,
    break: 1.08, rise: 1.08, drop: 1.18, rewind: 1.08, redrop: 1.18, anthem: 1.20,
    freeze: 1.02, carnival: 1.18, crowd: 1.10, fakeend: 1.04, lastchorus: 1.24, end: 1.14,
  }, 1.06, 0.48);

  const preBus = stereo(n);
  for (let i = 0; i < n; i++) {
    const lowMono = 0.5 * (lowL[i] + lowR[i]);
    const hiL = wideBus.L[i] - lowL[i];
    const hiR = wideBus.R[i] - lowR[i];
    const mid = 0.5 * (hiL + hiR);
    const side = 0.5 * (hiL - hiR) * sideGainCurve[i];
    preBus.L[i] = lowMono + mid + side + centerBus.L[i];
    preBus.R[i] = lowMono + mid - side + centerBus.R[i];
  }

  const easeN = Math.round(0.3 * SR);
  for (let i = 0; i < easeN; i++) {
    const g = i / easeN;
    preBus.L[n - 1 - i] *= g;
    preBus.R[n - 1 - i] *= g;
  }

  // 9. SSL-style master bus glue + subtle warm tape polish
  const preNorm = dbToGain(-16.2 - lufs(preBus.L, preBus.R));
  for (let i = 0; i < n; i++) {
    preBus.L[i] *= preNorm;
    preBus.R[i] *= preNorm;
  }
  const busComp = compressStereo(preBus, {
    thresholdDb: -14.5, ratio: 2.0, attackMs: 25, releaseMs: 115, kneeDb: 4, scHpHz: 95, makeupDb: 0,
  });
  const mix = busComp.out;
  for (let i = 0; i < n; i++) {
    mix.L[i] = 0.91 * mix.L[i] + 0.09 * (Math.tanh(mix.L[i] * 1.65) / 1.65);
    mix.R[i] = 0.91 * mix.R[i] + 0.09 * (Math.tanh(mix.R[i] * 1.65) / 1.65);
  }

  return {
    mix,
    metrics: {
      drumsParallelMaxGrDb: +parDrumComp.maxGrDb.toFixed(1),
      masterBusGlueMaxGrDb: +busComp.maxGrDb.toFixed(2),
      masterBusGlueAvgGrDb: +busComp.avgGrDb.toFixed(2),
    },
  };
}
