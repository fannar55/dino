// Mix polish stage ("Mix B", approved 2026-11-28) for Stjörnuhátíðin's song ("hatid.mp3", 84 BPM, D major).
// Takes the pristine core stereo buffer (hatid/base+friends) + the 5 aligned separated stems ({ drums, bass, music, choir, friends })
// and applies 6 surgical mix upgrades while preserving zero-sample alignment and exact beat-map timing:
//   1. Core Mid/Side phase tightening (mono <140 Hz, balanced 140-4800 Hz body, wide starry top >4800 Hz) + opening EQ.
//   2. Small-speaker upper-bass harmonics (145-560 Hz) synthesized cleanly from bass stem alone.
//   3. New York parallel drum punch & snare/hat snap from drums stem alone (off in intro opening, quiet, and final chord).
//   4. Choir center anchor + angelic presence/shimmer from choir stem alone (automatically keeps Flugeðla's 8 call gaps ducked).
//   5. Friends' spotlight across the 6 solos (especially Kambeðla's plates, Uggeðla's splashes, Þórseðla's tone, Grameðla's stomps)
//      + golden horn glow from music stem in intro opening, Slóeðla's solo, and Kyrra stundin.
//   6. Smooth section rebalancing + SSL-style master bus glue + subtle warm analog polish.
import { SR } from './io.mjs';
import { Biquad, eqStereo, stereo, TAU } from './dsp.mjs';
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

function compressStereo(src, { thresholdDb = -16, ratio = 2.0, attackMs = 20, releaseMs = 110, kneeDb = 4, scHpHz = 0, makeupDb = 0 } = {}) {
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
    } else if (over >= halfKnee) grDb = slope * over;
    if (grDb > maxGrDb) maxGrDb = grDb;
    if (grDb > 0.1) { grSum += grDb; activeCount++; }
    const g = dbToGain(-grDb) * makeup;
    out.L[i] = src.L[i] * g;
    out.R[i] = src.R[i] * g;
  }
  return { out, maxGrDb, avgGrDb: activeCount ? grSum / activeCount : 0 };
}

function buildSpanCurve(n, spans, defaultVal = 0, rampSec = 0.8) {
  const raw = new Float32Array(n).fill(defaultVal);
  for (const { aSec, bSec, val } of spans) {
    const a = Math.max(0, Math.round(aSec * SR));
    const b = Math.min(n, Math.round(bSec * SR));
    if (b > a) raw.fill(val, a, b);
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
      } else acc += arr[addIdx] - arr[subIdx];
      if (i >= 0 && i < n) dst[i] = acc / (2 * half + 1);
    }
    return dst;
  };
  return pass(pass(raw));
}

function stereoDoubler(src, { baseL = 13, baseR = 19, depthL = 2.5, depthR = 3.0, rateL = 0.37, rateR = 0.43, hpHz = 550, lpHz = 8500 } = {}) {
  const n = src.n;
  const maxDel = Math.ceil(((Math.max(baseL + depthL, baseR + depthR) + 4) / 1000) * SR) + 8;
  const ringL = new Float32Array(maxDel), ringR = new Float32Array(maxDel);
  const out = stereo(n);
  let w = 0;
  const readFrac = (buf, del) => {
    let p = w - del;
    if (p < 0) p += maxDel;
    const i0 = Math.floor(p) % maxDel, i1 = (i0 + 1) % maxDel;
    return buf[i0] + (buf[i1] - buf[i0]) * (p - Math.floor(p));
  };
  for (let i = 0; i < n; i++) {
    const m = 0.5 * (src.L[i] + src.R[i]);
    ringL[w] = m;
    ringR[w] = m;
    const t = i / SR;
    out.L[i] = readFrac(ringL, ((baseL + depthL * Math.sin(TAU * rateL * t)) / 1000) * SR);
    out.R[i] = readFrac(ringR, ((baseR + depthR * Math.sin(TAU * rateR * t + 1.5)) / 1000) * SR);
    w = (w + 1) % maxDel;
  }
  eqStereo(out, () => [new Biquad('hp', hpHz, 0.707), new Biquad('lp', lpHz, 0.707)]);
  return out;
}

/**
 * Applies the Mix B polish stage to `core` (pristine stereo pre-master) + 5 aligned stems (`{ drums, bass, music, choir, friends }`).
 * `timing`: { bpm, beatOffset, sections, solos }.
 * Returns { mix, metrics } ready for final -16.0 LUFS / -1.5 dBTP mastering.
 */
export function polishHatidMix(core, stems, { bpm, beatOffset, sections, solos }) {
  const n = core.n;
  const beatS = 60 / bpm;
  const beatSec = b => beatOffset + b * beatS;
  const secSpans = map => sections.map((s, idx) => ({
    aSec: idx === 0 ? 0 : beatSec(s.startBeat),
    bSec: idx === sections.length - 1 ? n / SR + 1 : beatSec(s.startBeat + s.beats),
    val: map[s.id] ?? 0,
  }));
  const soloSpan = who => {
    const s = solos.find(x => x.who === who);
    return { aSec: beatSec(s.startBeat), bSec: beatSec(s.startBeat + s.beats) };
  };

  // 1. Core Mid/Side phase tightening + opening EQ
  const lowL = zeroPhaseLP(core.L, 140), lowR = zeroPhaseLP(core.R, 140);
  const hiL = new Float32Array(n), hiR = new Float32Array(n);
  for (let i = 0; i < n; i++) { hiL[i] = core.L[i] - lowL[i]; hiR[i] = core.R[i] - lowR[i]; }
  const bodyL = zeroPhaseLP(hiL, 4800), bodyR = zeroPhaseLP(hiR, 4800);

  const bodySideScale = buildSpanCurve(n, secSpans({ intro: 0.76, dance: 0.76, solos: 0.78, quiet: 0.62, chorus: 0.80, chord: 0.66 }), 0.76, 1.4);
  const airSideScale = buildSpanCurve(n, secSpans({ intro: 0.95, dance: 0.98, solos: 0.95, quiet: 0.85, chorus: 1.08, chord: 0.90 }), 0.96, 1.4);

  const midSig = new Float32Array(n), sideSig = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lowMono = 0.5 * (lowL[i] + lowR[i]);
    const bMid = 0.5 * (bodyL[i] + bodyR[i]);
    const bSide = 0.5 * (bodyL[i] - bodyR[i]) * bodySideScale[i];
    const aL = hiL[i] - bodyL[i], aR = hiR[i] - bodyR[i];
    midSig[i] = lowMono + bMid + 0.5 * (aL + aR);
    sideSig[i] = bSide + 0.5 * (aL - aR) * airSideScale[i];
  }
  for (const f of [
    new Biquad('hp', 32, 0.707),
    new Biquad('lowshelf', 90, 0.7, -1.6),
    new Biquad('peak', 245, 1.2, -1.8),
    new Biquad('peak', 1100, 0.85, 0.9),
    new Biquad('peak', 2900, 0.8, 2.3),
    new Biquad('peak', 6500, 0.7, 3.0),
    new Biquad('highshelf', 10500, 0.7, 2.3),
  ]) f.run(midSig);
  for (const f of [
    new Biquad('hp', 120, 0.707),
    new Biquad('peak', 245, 1.1, -1.6),
    new Biquad('peak', 3100, 0.8, 2.7),
    new Biquad('peak', 6800, 0.7, 3.2),
    new Biquad('highshelf', 10500, 0.7, 2.6),
  ]) f.run(sideSig);

  const mix = stereo(n);
  for (let i = 0; i < n; i++) { mix.L[i] = midSig[i] + sideSig[i]; mix.R[i] = midSig[i] - sideSig[i]; }

  // 2. Small-speaker upper-bass harmonics from bass stem
  const bassFund = new Float32Array(n);
  for (let i = 0; i < n; i++) bassFund[i] = 0.5 * (stems.bass.L[i] + stems.bass.R[i]);
  new Biquad('hp', 48, 0.707).run(bassFund);
  new Biquad('lp', 195, 0.707).run(bassFund);
  const bassHarm = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = bassFund[i] * 3.0; bassHarm[i] = Math.tanh(x) + 0.18 * x * x; }
  new Biquad('hp', 145, 0.707).run(bassHarm);
  new Biquad('lp', 560, 0.707).run(bassHarm);
  const bhg = dbToGain(-7.5);
  for (let i = 0; i < n; i++) { const h = bassHarm[i] * bhg; mix.L[i] += h; mix.R[i] += h; }

  // 3. New York parallel drum punch from drums stem
  const parDrumSrc = cloneStereo(stems.drums);
  eqStereo(parDrumSrc, () => [new Biquad('hp', 52, 0.707), new Biquad('peak', 3200, 1.0, 2.8), new Biquad('highshelf', 8000, 0.7, 2.2)]);
  const parDrumComp = compressStereo(parDrumSrc, { thresholdDb: -31, ratio: 7, attackMs: 3, releaseMs: 70, kneeDb: 6, makeupDb: 11 });
  for (let i = 0; i < n; i++) {
    parDrumComp.out.L[i] = Math.tanh(parDrumComp.out.L[i] * 1.5) / 1.5;
    parDrumComp.out.R[i] = Math.tanh(parDrumComp.out.R[i] * 1.5) / 1.5;
  }
  const parDrumBlend = buildSpanCurve(n, [
    { aSec: 0, bSec: beatSec(28), val: 0 },
    { aSec: beatSec(28), bSec: beatSec(72), val: dbToGain(-13.5) },
    { aSec: beatSec(72), bSec: beatSec(136), val: dbToGain(-9.2) },
    { aSec: beatSec(136), bSec: beatSec(208), val: dbToGain(-10.5) },
    { aSec: beatSec(208), bSec: beatSec(252), val: 0 },
    { aSec: beatSec(252), bSec: beatSec(348), val: dbToGain(-8.2) },
    { aSec: beatSec(348), bSec: n / SR + 1, val: 0 },
  ], 0, 0.8);
  for (let i = 0; i < n; i++) {
    const g = parDrumBlend[i];
    if (g > 0) { mix.L[i] += parDrumComp.out.L[i] * g; mix.R[i] += parDrumComp.out.R[i] * g; }
  }

  // 4. Choir center anchor + starry shimmer from choir stem
  const choirMono = new Float32Array(n);
  for (let i = 0; i < n; i++) choirMono[i] = 0.5 * (stems.choir.L[i] + stems.choir.R[i]);
  for (const f of [
    new Biquad('hp', 170, 0.707), new Biquad('peak', 310, 1.2, -1.8),
    new Biquad('peak', 2800, 0.9, 3.0), new Biquad('highshelf', 7200, 0.7, 3.0),
  ]) f.run(choirMono);
  const choirComp = compressStereo({ L: choirMono, R: Float32Array.from(choirMono), n }, { thresholdDb: -26, ratio: 3.0, attackMs: 12, releaseMs: 110, kneeDb: 5, makeupDb: 4 });
  const choirShimmer = stereoDoubler(choirComp.out);
  const choirCenterBlend = buildSpanCurve(n, secSpans({ intro: 0, dance: dbToGain(-10.0), solos: 0, quiet: 0, chorus: dbToGain(-7.2), chord: 0 }), 0, 0.9);
  const choirShimBlend = buildSpanCurve(n, secSpans({ intro: 0, dance: dbToGain(-16.0), solos: 0, quiet: 0, chorus: dbToGain(-12.5), chord: 0 }), 0, 0.9);
  for (let i = 0; i < n; i++) {
    const gc = choirCenterBlend[i], gs = choirShimBlend[i];
    if (gc > 0 || gs > 0) {
      mix.L[i] += choirComp.out.L[i] * gc + choirShimmer.L[i] * gs;
      mix.R[i] += choirComp.out.R[i] * gc + choirShimmer.R[i] * gs;
    }
  }

  // 5. Friends' solo spotlight + golden horn glow
  const frClean = cloneStereo(stems.friends);
  eqStereo(frClean, () => [new Biquad('hp', 45, 0.707), new Biquad('peak', 250, 1.2, -1.2), new Biquad('peak', 2700, 0.9, 2.4), new Biquad('highshelf', 6500, 0.7, 1.8)]);
  const frComp = compressStereo(frClean, { thresholdDb: -24, ratio: 4.0, attackMs: 2, releaseMs: 60, kneeDb: 4, makeupDb: 5 });
  const friendsBoost = buildSpanCurve(n, [
    { aSec: beatSec(28), bSec: beatSec(72), val: dbToGain(-10.5) },
    { aSec: beatSec(72), bSec: beatSec(136), val: dbToGain(-12.0) },
    { ...soloSpan('kambedla'), val: dbToGain(-4.2) },
    { ...soloSpan('uggedla'), val: dbToGain(-6.5) },
    { ...soloSpan('thorsedla'), val: dbToGain(-6.0) },
    { ...soloSpan('flugedla'), val: dbToGain(-9.5) },
    { ...soloSpan('sloedla'), val: 0 },
    { ...soloSpan('gramedla'), val: dbToGain(-6.5) },
    { aSec: beatSec(252), bSec: beatSec(348), val: dbToGain(-9.5) },
  ], 0, 0.45);
  for (let i = 0; i < n; i++) {
    const g = friendsBoost[i];
    if (g > 0) { mix.L[i] += frComp.out.L[i] * g; mix.R[i] += frComp.out.R[i] * g; }
  }

  const musicGlow = cloneStereo(stems.music);
  eqStereo(musicGlow, () => [new Biquad('hp', 160, 0.707), new Biquad('peak', 260, 1.2, -1.5), new Biquad('peak', 2300, 0.9, 2.6), new Biquad('highshelf', 6500, 0.7, 2.4)]);
  const hornGlowBlend = buildSpanCurve(n, [
    { aSec: 0, bSec: beatSec(28), val: dbToGain(-9.0) },
    { ...soloSpan('sloedla'), val: dbToGain(-7.5) },
    { aSec: beatSec(208), bSec: beatSec(246), val: dbToGain(-9.5) },
  ], 0, 0.8);
  for (let i = 0; i < n; i++) {
    const g = hornGlowBlend[i];
    if (g > 0) {
      const m = 0.5 * (musicGlow.L[i] + musicGlow.R[i]), s = 0.5 * (musicGlow.L[i] - musicGlow.R[i]) * 0.65;
      mix.L[i] += (m + s) * g;
      mix.R[i] += (m - s) * g;
    }
  }

  // 6. Smooth section balance + SSL bus glue + warm analog polish
  const secGainDb = buildSpanCurve(n, [
    { aSec: 0, bSec: beatSec(28), val: 1.4 },
    { aSec: beatSec(28), bSec: beatSec(72), val: 0.9 },
    { aSec: beatSec(72), bSec: beatSec(136), val: 0.2 },
    { ...soloSpan('kambedla'), val: 1.2 }, { ...soloSpan('uggedla'), val: 0.9 },
    { ...soloSpan('thorsedla'), val: 0.7 }, { ...soloSpan('flugedla'), val: 0.4 },
    { ...soloSpan('sloedla'), val: 0.9 }, { ...soloSpan('gramedla'), val: 0.7 },
    { aSec: beatSec(208), bSec: beatSec(246), val: 1.5 },
    { aSec: beatSec(246), bSec: beatSec(252), val: 0.0 },
    { aSec: beatSec(252), bSec: beatSec(348), val: 0.8 },
    { aSec: beatSec(348), bSec: n / SR + 1, val: 1.6 },
  ], 0, 0.85);
  for (let i = 0; i < n; i++) { const g = dbToGain(secGainDb[i]); mix.L[i] *= g; mix.R[i] *= g; }

  const easeN = Math.round(0.35 * SR);
  for (let i = 0; i < easeN; i++) { const g = i / easeN; mix.L[n - 1 - i] *= g; mix.R[n - 1 - i] *= g; }

  const preNorm = dbToGain(-16.3 - lufs(mix.L, mix.R));
  for (let i = 0; i < n; i++) { mix.L[i] *= preNorm; mix.R[i] *= preNorm; }

  const busComp = compressStereo(mix, { thresholdDb: -14.5, ratio: 2.0, attackMs: 25, releaseMs: 125, kneeDb: 4, scHpHz: 95, makeupDb: 0 });
  const glued = busComp.out;
  for (let i = 0; i < n; i++) {
    glued.L[i] = 0.92 * glued.L[i] + 0.08 * (Math.tanh(glued.L[i] * 1.6) / 1.6);
    glued.R[i] = 0.92 * glued.R[i] + 0.08 * (Math.tanh(glued.R[i] * 1.6) / 1.6);
  }
  return {
    mix: glued,
    metrics: {
      drumsParallelMaxGrDb: +parDrumComp.maxGrDb.toFixed(1),
      masterBusGlueMaxGrDb: +busComp.maxGrDb.toFixed(2),
      masterBusGlueAvgGrDb: +busComp.avgGrDb.toFixed(2),
    },
  };
}
