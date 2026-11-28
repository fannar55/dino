#!/usr/bin/env node
// Mastering polish ("Mix B", approved 2026-11-28) for Chapter 4's flight song ("Vængir yfir dalnum", flugstef.mp3).
// Takes a stereo input MP3/WAV (default: remake/assets/audio/kafli4/flugstef.mp3) and applies:
//   1. Mid/Side phase tightening: mono low-end (<140 Hz), balanced cinema body width (140-4800 Hz), wide top sheen (>4800 Hz).
//   2. Mid/Side orchestral EQ: 265 Hz mud carve, subtle -1.3 dB center speech pocket at 2.35 kHz (Mid only) so Egill & Flugeðla
//      read clearly without ducking the orchestra, +1.5 dB Side brass/string glow, +2.2 dB silky top (capped below 13.6 kHz).
//   3. Dedicated Gorge (Beat D, 80.5-105.5 s) midrange clarity rescue so strings stay present on Android tablet speakers.
//   4. Parallel orchestral warmth compression + smooth beat-by-beat dynamic ride (taming 12.6 LU -> ~8.4 LU while keeping
//      the waterfall burst & golden sky as the undisputed climax).
//   5. Gentle cinema bus glue + warm analog polish + look-ahead true-peak mastering to -13.4 LUFS / -1.5 dBTP at 192 kbps.
//
// Usage:
//   node remake/tools/kafli4-flugstef-polish.mjs <input.mp3> <output.mp3>
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, decode, writeWav, encodeMp3, ebur128 } from './kafli5-lag/djamm-1/lib/io.mjs';
import { Biquad, eqStereo, stereo } from './kafli5-lag/djamm-1/lib/dsp.mjs';
import { lufs, limit } from './kafli5-lag/djamm-1/lib/master.mjs';
import { compressStereo } from './kafli5-lag/djamm-1/lib/mix-polish.mjs';

const dbToGain = d => 10 ** (d / 20);
const gainToDb = g => 20 * Math.log10(Math.max(g, 1e-12));

export const FLIGHT_BEATS = [
  { id: 'A', startSec: 0.0, endSec: 15.5 },
  { id: 'B', startSec: 15.5, endSec: 35.5 },
  { id: 'C1', startSec: 35.5, endSec: 60.5 },
  { id: 'C2', startSec: 60.5, endSec: 80.5 },
  { id: 'D', startSec: 80.5, endSec: 105.5 },
  { id: 'E1', startSec: 105.5, endSec: 116.7 },
  { id: 'E2', startSec: 116.7, endSec: 126.25 },
  { id: 'F', startSec: 126.25, endSec: 151.25 },
  { id: 'G', startSec: 151.25, endSec: 171.25 },
  { id: 'tail', startSec: 171.25, endSec: 184.71 },
];

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

function buildBeatCurve(n, valueById, defaultVal = 0, rampSec = 1.6) {
  const raw = new Float32Array(n).fill(defaultVal);
  for (const b of FLIGHT_BEATS) {
    const a = Math.max(0, Math.round(b.startSec * SR));
    const e = Math.min(n, Math.round(b.endSec * SR));
    raw.fill(valueById[b.id] ?? defaultVal, a, e);
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

/** Applies the Mix B orchestral mastering polish to stereo Float32 arrays { L, R, n }. */
export function polishFlightSong(src) {
  const n = src.n;

  // 1. Mid/Side phase tightening: mono <140 Hz, balanced cinema width 140-4800 Hz, airy >4800 Hz
  const lowL = zeroPhaseLP(src.L, 140);
  const lowR = zeroPhaseLP(src.R, 140);
  const hiL = new Float32Array(n), hiR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    hiL[i] = src.L[i] - lowL[i];
    hiR[i] = src.R[i] - lowR[i];
  }
  const bodyL = zeroPhaseLP(hiL, 4800);
  const bodyR = zeroPhaseLP(hiR, 4800);

  const bodySideScale = buildBeatCurve(n, {
    A: 0.68, B: 0.66, C1: 0.62, C2: 0.66, D: 0.68, E1: 0.66, E2: 0.72, F: 0.74, G: 0.76, tail: 0.74,
  }, 0.68, 1.8);
  const airSideScale = buildBeatCurve(n, {
    A: 0.86, B: 0.86, C1: 0.84, C2: 0.88, D: 0.85, E1: 0.90, E2: 0.96, F: 1.00, G: 0.92, tail: 0.90,
  }, 0.88, 1.8);

  const midSig = new Float32Array(n), sideSig = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lowMono = 0.5 * (lowL[i] + lowR[i]);
    const bMid = 0.5 * (bodyL[i] + bodyR[i]);
    const bSide = 0.5 * (bodyL[i] - bodyR[i]) * bodySideScale[i];
    const aL = hiL[i] - bodyL[i];
    const aR = hiR[i] - bodyR[i];
    midSig[i] = lowMono + bMid + 0.5 * (aL + aR);
    sideSig[i] = bSide + 0.5 * (aL - aR) * airSideScale[i];
  }

  // 2. Mid/Side orchestral EQ + subtle center speech clarity pocket
  for (const f of [
    new Biquad('hp', 30, 0.707),
    new Biquad('peak', 265, 1.3, -1.6),
    new Biquad('peak', 680, 0.9, 0.7),
    new Biquad('peak', 2350, 1.1, -1.3),
    new Biquad('peak', 5400, 0.75, 2.2),
    new Biquad('peak', 8800, 0.85, 1.8),
    new Biquad('lp', 13600, 0.707),
  ]) f.run(midSig);

  for (const f of [
    new Biquad('hp', 120, 0.707),
    new Biquad('peak', 265, 1.2, -1.5),
    new Biquad('peak', 2500, 0.85, 1.5),
    new Biquad('peak', 5800, 0.75, 2.4),
    new Biquad('peak', 9000, 0.85, 2.0),
    new Biquad('lp', 13600, 0.707),
  ]) f.run(sideSig);

  const eqd = stereo(n);
  for (let i = 0; i < n; i++) {
    eqd.L[i] = midSig[i] + sideSig[i];
    eqd.R[i] = midSig[i] - sideSig[i];
  }

  // 3. Dedicated Gorge (Beat D) midrange clarity rescue
  const gorgeMask = buildBeatCurve(n, { D: 1 }, 0, 2.0);
  const gorgePolished = cloneStereo(eqd);
  eqStereo(gorgePolished, () => [
    new Biquad('peak', 110, 1.0, -1.8),
    new Biquad('peak', 1100, 0.85, 2.6),
    new Biquad('peak', 3200, 0.9, 2.2),
  ]);
  for (let i = 0; i < n; i++) {
    const m = gorgeMask[i];
    if (m > 0) {
      eqd.L[i] = eqd.L[i] * (1 - m) + gorgePolished.L[i] * m;
      eqd.R[i] = eqd.R[i] * (1 - m) + gorgePolished.R[i] * m;
    }
  }

  // 4. Parallel orchestral warmth compression
  const parSrc = cloneStereo(eqd);
  eqStereo(parSrc, () => [new Biquad('hp', 75, 0.707), new Biquad('lp', 6500, 0.707), new Biquad('peak', 1200, 0.8, 1.5)]);
  const parComp = compressStereo(parSrc, { thresholdDb: -26, ratio: 4.5, attackMs: 12, releaseMs: 140, kneeDb: 6, makeupDb: 9 });
  for (let i = 0; i < n; i++) {
    parComp.out.L[i] = Math.tanh(parComp.out.L[i] * 1.45) / 1.45;
    parComp.out.R[i] = Math.tanh(parComp.out.R[i] * 1.45) / 1.45;
  }
  const parBlend = buildBeatCurve(n, {
    A: dbToGain(-13.0), B: dbToGain(-14.5), C1: dbToGain(-11.5), C2: dbToGain(-13.5),
    D: dbToGain(-10.5), E1: dbToGain(-11.5), E2: dbToGain(-13.0), F: dbToGain(-13.5),
    G: dbToGain(-11.5), tail: dbToGain(-13.0),
  }, dbToGain(-13.0), 1.8);
  for (let i = 0; i < n; i++) {
    eqd.L[i] += parComp.out.L[i] * parBlend[i];
    eqd.R[i] += parComp.out.R[i] * parBlend[i];
  }

  // 5. Smooth beat-by-beat dynamic ride
  const beatGainDb = buildBeatCurve(n, {
    A: 0.8, B: -1.3, C1: 2.2, C2: 0.4, D: 4.5, E1: 1.2, E2: 0.6, F: 0.3, G: 2.5, tail: 1.8,
  }, 0, 2.0);
  for (let i = 0; i < n; i++) {
    const g = dbToGain(beatGainDb[i]);
    eqd.L[i] *= g;
    eqd.R[i] *= g;
  }
  const easeN = Math.round(0.4 * SR);
  for (let i = 0; i < easeN; i++) {
    const g = i / easeN;
    eqd.L[n - 1 - i] *= g;
    eqd.R[n - 1 - i] *= g;
  }

  // 6. Cinema bus glue + subtle warm analog polish
  const preNorm = dbToGain(-13.8 - lufs(eqd.L, eqd.R));
  for (let i = 0; i < n; i++) {
    eqd.L[i] *= preNorm;
    eqd.R[i] *= preNorm;
  }
  const busComp = compressStereo(eqd, { thresholdDb: -12.0, ratio: 1.8, attackMs: 30, releaseMs: 140, kneeDb: 5, scHpHz: 100, makeupDb: 0 });
  const mix = busComp.out;
  for (let i = 0; i < n; i++) {
    mix.L[i] = 0.93 * mix.L[i] + 0.07 * (Math.tanh(mix.L[i] * 1.5) / 1.5);
    mix.R[i] = 0.93 * mix.R[i] + 0.07 * (Math.tanh(mix.R[i] * 1.5) / 1.5);
  }
  return { mix, metrics: { parallelWarmthMaxGrDb: +parComp.maxGrDb.toFixed(1), busGlueMaxGrDb: +busComp.maxGrDb.toFixed(2) } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) {
    console.error('Usage: node remake/tools/kafli4-flugstef-polish.mjs <input.mp3> <output.mp3>');
    process.exit(1);
  }
  const targetLufs = -13.4;
  const [L, R] = decode(input, 2);
  const { mix: glued } = polishFlightSong({ L, R, n: L.length });
  const workDir = join(dirname(resolve(output)), '.work-flugstef');
  mkdirSync(workDir, { recursive: true });
  const wav = join(workDir, 'mix.wav');

  const render = (g, c) => {
    const outL = Float32Array.from(glued.L, v => v * g);
    const outR = Float32Array.from(glued.R, v => v * g);
    const lim = limit(outL, outR, dbToGain(c));
    return { L: outL, R: outR, lim };
  };
  let gain = dbToGain(targetLufs - lufs(glued.L, glued.R));
  let ceiling = -1.7;
  let mastered;
  for (let it = 0; it < 4; it++) {
    mastered = render(gain, ceiling);
    const cur = lufs(mastered.L, mastered.R);
    if (Math.abs(cur - targetLufs) < 0.04) break;
    gain *= dbToGain(targetLufs - cur);
  }
  writeWav(wav, mastered.L, mastered.R);
  encodeMp3(wav, output);
  let eb = ebur128(output);
  for (let it = 0; it < 4 && (Math.abs(eb.lufs - targetLufs) > 0.08 || eb.truePeak > -1.35); it++) {
    if (eb.truePeak > -1.35) ceiling -= (eb.truePeak + 1.5);
    gain *= dbToGain(targetLufs - eb.lufs);
    mastered = render(gain, ceiling);
    writeWav(wav, mastered.L, mastered.R);
    encodeMp3(wav, output);
    eb = ebur128(output);
  }
  rmSync(workDir, { recursive: true, force: true });
  console.log(`Written ${output}: ${eb.lufs} LUFS, ${eb.truePeak} dBTP, LRA ${eb.lra} LU (limiter max ${gainToDb(mastered.lim.most).toFixed(2)} dB)`);
}
