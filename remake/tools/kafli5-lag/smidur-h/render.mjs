// smidur-h: "Skógurinn spilar" — render the whole song from scratch, deterministically.
// node remake/tools/kafli5-lag/smidur-h/render.mjs
// Writes qa/remake/kafli5/lag/keppni/smidur-h/: mix.mp3, stems/*.mp3, song.json, spectrogram.png, waveform.png (and wav/
// working files under work/).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeWav, encodeMp3, ffmpeg } from './lib/io.mjs';
import { SR, hash, secs, addInto, biquad, fdnReverb, echo, peak, scale, fades, normalize } from './lib/dsp.mjs';
import * as F from './lib/forest.mjs';
import { call, setHljod } from './lib/takes.mjs';
import { buildScore, BPM, KEY, TONE, hz } from './score.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '../../../..');
const HLJOD = join(ROOT, 'remake/assets/audio/kafli5/hljod');
const OUT = join(ROOT, 'qa/remake/kafli5/lag/keppni/smidur-h');
const WORK = join(OUT, 'work');
setHljod(HLJOD);
const SPB = (SR * 60) / BPM; // 24500 samples a beat
const at = b => Math.round(b * SPB);

// --- the animals' calls: which take, which part, its own measured pitch (measure-takes.mjs), how much glide to keep -----
export const RECIPES = {
  grazers: { file: 'grazers-3.mp3', from: 0.04, to: 0.95, ref: 181.5, flatten: 0.6, lead: 0.015 }, // a cow's moo
  grazersChop: { file: 'grazers-3.mp3', from: 0.28, to: 0.8, ref: 181.5, flatten: 0.5 }, // the steady middle of the moo
  turtles: { file: 'turtles-2.mp3', from: 0.0, to: 0.74, ref: 238.4, flatten: 0.85 },
  frogs: { file: 'frogs-5.mp3', from: 0.025, to: 0.42, ref: 1926.3, flatten: 0.3, lead: 0.02 }, // a ribbit
  frogsLow: { file: 'frogs-1.mp3', from: 0.0, to: 0.56, ref: 1147.4, flatten: 0.5 },
  frogsHat: { file: 'frogs-2.mp3', from: 0.008, to: 0.07, ref: 2224.7 }, // one pulse of the trill (its own pitch is a little under the take's)
  lizards: { file: 'lizards-1.mp3', from: 0.0, to: 0.29, ref: 1130, flatten: 0.7 },
  lizardsGecko: { file: 'lizards-3.mp3', from: 0.018, to: 0.15, ref: 2103.4 },
  flyers: { file: 'flyers-3.mp3', from: 0.36, to: 0.72, ref: 1395, flatten: 0.9 }, // the loud top of a curlew's rising whistle
  flyersTrill: { file: 'flyers-1.mp3', from: 0.0, to: 0.95, ref: 2088 },
};
const HORN = { file: 'horn-1.mp3', from: 0.06, to: 2.75, ref: 273.1, flatten: 0.4, lead: 0.035 };
// each group's level trim (their takes differ in loudness)
const TRIM = { grazers: 0.95, turtles: 1.0, frogs: 0.62, lizards: 0.7, flyers: 0.6 };

function renderCall(p) {
  const { group } = p;
  const target = hz(TONE[group]);
  if (p.role === 'hat') {
    const x = call(RECIPES.frogsHat, target, { hp: 2500, attack: 0.001, release: 0.03 });
    for (let i = 0; i < x.length; i++) x[i] *= Math.exp(-i / SR / 0.018);
    return normalize(x);
  }
  if (group === 'grazers') {
    if (p.chop) return call(RECIPES.grazersChop, target * 2 ** (p.octave ?? 0), { dur: p.dur, attack: 0.004, release: 0.04, lp: 3200, hp: 110 });
    return call(RECIPES.grazers, target, { dur: p.dur, attack: 0.006, release: 0.08, hp: 110 });
  }
  if (group === 'turtles') return call(RECIPES.turtles, target, { dur: p.dur, attack: 0.004, release: 0.06 });
  if (group === 'frogs') {
    if (p.low) return call(RECIPES.frogsLow, target / 2, { dur: p.dur, attack: 0.003, release: 0.04 });
    return call(RECIPES.frogs, target, { dur: p.dur, attack: 0.002, release: 0.04 });
  }
  if (group === 'lizards') {
    if (p.gecko) return call(RECIPES.lizardsGecko, target * 2, { dur: p.dur, attack: 0.001, release: 0.03, hp: 900 });
    return call(RECIPES.lizards, target, { dur: p.dur, attack: 0.002, release: 0.04 });
  }
  if (group === 'flyers') {
    if (p.trill) return call(RECIPES.flyersTrill, target * 2, { dur: p.dur, attack: 0.005, release: 0.08 });
    return call(RECIPES.flyers, target, { dur: p.dur, attack: 0.008, release: 0.08 });
  }
  throw new Error(`no call for ${group}`);
}

function renderHorn(p) {
  const x = call(HORN, p.f, { dur: p.dur, attack: 0.02, release: 0.18 });
  biquad(x, 'hs', 3500, 0.7, -3);
  return x;
}

export const renderCallForCheck = p => renderCall(p);
export const renderHornForCheck = p => renderHorn(p);

const INSTR = {
  stomp: (p, s) => F.stomp({ ...p, seed: s }),
  clap: (p, s) => F.clap({ ...p, seed: s }),
  snap: (p, s) => F.snap({ seed: s }),
  patsch: (p, s) => F.patsch({ seed: s }),
  chest: (p, s) => F.chest({ seed: s }),
  stick: (p, s) => F.stick({ ...p, seed: s }),
  stones: (p, s) => F.stones({ ...p, seed: s }),
  logMarimba: (p, s) => F.logMarimba({ ...p, seed: s }),
  shell: (p, s) => F.shell({ ...p, seed: s }),
  logBass: (p, s) => F.logBass({ ...p, seed: s }),
  drop: (p, s) => F.drop({ ...p, seed: s }),
  splash: (p, s) => F.splash({ ...p, seed: s }),
  waterDrum: (p, s) => F.waterDrum({ ...p, seed: s }),
  leaves: (p, s) => F.leaves({ ...p, seed: s }),
  rustle: (p, s) => F.rustle({ ...p, seed: s }),
  bbKick: (p, s) => F.bbKick({ seed: s }),
  bbSnare: (p, s) => F.bbSnare({ seed: s }),
  bbHat: (p, s) => F.bbHat({ ...p, seed: s }),
  lipPop: (p, s) => F.lipPop({ ...p, seed: s }),
  tongue: (p, s) => F.tongue({ ...p, seed: s }),
  reed: (p, s) => F.reed({ ...p, seed: s }),
  whistle: (p, s) => F.whistle({ ...p, seed: s }),
  pond: (p, s) => F.pond({ ...p, seed: s }),
  call: p => renderCall(p),
  horn: p => renderHorn(p),
};
// how loud each kind sits before its event gain
const LEVEL = {
  stomp: 0.85, clap: 0.5, snap: 0.28, patsch: 0.45, chest: 0.5, stick: 0.3, stones: 0.32, logMarimba: 0.46, shell: 0.55,
  logBass: 0.33, drop: 0.38, splash: 0.4, waterDrum: 0.6, leaves: 0.2, rustle: 0.2, bbKick: 1.0, bbSnare: 0.7, bbHat: 0.3, lipPop: 0.7,
  tongue: 0.35, reed: 0.2, whistle: 0.26, pond: 0.3, call: 0.8, horn: 0.6,
};
export const STEMS = ['pad', 'bass', 'beat', 'lead', 'animals'];

export function renderStems(score, { onlyStems = STEMS } = {}) {
  const N = at(score.endBeat);
  const stems = {};
  for (const s of onlyStems) stems[s] = { L: new Float32Array(N), R: new Float32Array(N), rvL: new Float32Array(N), rvR: new Float32Array(N), ecL: new Float32Array(N), ecR: new Float32Array(N) };
  const cache = new Map();
  for (const e of score.events) {
    if (!stems[e.s]) continue;
    // a seed named by what the event is and where it sits in its 4-bar cycle: repeated bars sound the same
    const seed = hash(`${e.i}|${JSON.stringify(e.p)}|${(((e.b % 16) + 16) % 16).toFixed(4)}`);
    const key = `${e.i}|${JSON.stringify(e.p)}|${seed}`;
    let buf = cache.get(key);
    if (!buf) { buf = INSTR[e.i](e.p, seed); cache.set(key, buf); }
    const trim = e.i === 'call' ? TRIM[e.p.group] : 1;
    const g = e.g * LEVEL[e.i] * trim;
    const st = stems[e.s];
    // a take whose attack swells is started a little early, so its onset lands on the beat
    const lead = e.i === 'horn' ? HORN.lead : e.i === 'call' && !e.p.chop && !e.p.low && !e.p.gecko && !e.p.trill && e.p.role !== 'hat' ? RECIPES[e.p.group].lead ?? 0 : 0;
    const pos = at(e.b) - secs(lead);
    let L, R;
    if (Array.isArray(buf)) [L, R] = buf; else { L = buf; R = buf; }
    const pan = Math.max(-1, Math.min(1, e.pan));
    const gl = Array.isArray(buf) ? 1 : Math.cos(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
    const gr = Array.isArray(buf) ? 1 : Math.sin(((pan + 1) * Math.PI) / 4) * Math.SQRT2;
    addInto(st.L, L, pos, g * gl); addInto(st.R, R, pos, g * gr);
    if (e.rv) { addInto(st.rvL, L, pos, g * gl * e.rv); addInto(st.rvR, R, pos, g * gr * e.rv); }
    if (e.ec) { addInto(st.ecL, L, pos, g * gl * e.ec); addInto(st.ecR, R, pos, g * gr * e.ec); }
  }
  const out = {};
  for (const s of onlyStems) {
    const st = stems[s];
    const [wl, wr] = fdnReverb(st.rvL, st.rvR, { rt60: 1.35, damp: 4800, pre: 0.014, hp: s === 'bass' ? 400 : 160 });
    const [el, er] = echo(st.ecL, st.ecR, { time: 0.75 * 60 / BPM, feedback: 0.38, lp: 5000, hp: 400 });
    for (let i = 0; i < N; i++) { st.L[i] += wl[i] + el[i]; st.R[i] += wr[i] + er[i]; }
    // keep each stem's very low end tidy (nothing useful under 35 Hz)
    biquad(st.L, 'hp', s === 'bass' || s === 'beat' ? 32 : 90, 0.7); biquad(st.R, 'hp', s === 'bass' || s === 'beat' ? 32 : 90, 0.7);
    out[s] = [st.L, st.R];
  }
  return out;
}

// --- master -------------------------------------------------------------------------------------------------------------
function loudness(wav) {
  const t = ffmpeg(['-hide_banner', '-nostats', '-i', wav, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const I = /I:\s+(-?[\d.]+) LUFS/.exec(t.slice(t.lastIndexOf('Summary')));
  const P = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(t.slice(t.lastIndexOf('True peak')));
  return { lufs: I ? Number(I[1]) : NaN, truePeak: P ? Number(P[1]) : NaN };
}
/** Inter-sample peak estimate at i: max of the sample and three points between it and the next (8-tap sinc). */
function truePeakTrack(x) {
  const n = x.length, p = new Float32Array(n);
  const taps = [0.25, 0.5, 0.75].map(fr => {
    const w = [];
    for (let k = -3; k <= 4; k++) { const t = fr - k; const a = Math.PI * t; const s = Math.sin(a) / a; const win = 0.5 + 0.5 * Math.cos((Math.PI * t) / 4.5); w.push(s * win); }
    return w;
  });
  for (let i = 0; i < n; i++) {
    let m = Math.abs(x[i]);
    if (i >= 3 && i < n - 4) for (const w of taps) {
      let s = 0;
      for (let k = 0; k < 8; k++) s += x[i - 3 + k] * w[k];
      const a = Math.abs(s); if (a > m) m = a;
    }
    p[i] = m;
  }
  return p;
}
function limiter(L, R, ceilingDb, { look = 0.004, release = 0.09 } = {}) {
  const c = 10 ** (ceilingDb / 20), n = L.length;
  const pl = truePeakTrack(L), pr = truePeakTrack(R);
  const gr = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = Math.max(pl[i], pr[i]); gr[i] = p > c ? c / p : 1; }
  const W = secs(look);
  // sliding minimum over [i, i+W]
  const m = new Float32Array(n);
  const dq = [];
  let head = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (dq.length > head && gr[dq[dq.length - 1]] >= gr[i]) dq.pop();
    dq.push(i);
    while (dq[head] > i + W) head++;
    m[i] = gr[dq[head]];
  }
  const rel = 1 - Math.exp(-1 / (SR * release));
  const s = new Float32Array(n);
  let g = 1;
  for (let i = 0; i < n; i++) { g = Math.min(m[i], g + (1 - g) * rel); s[i] = g; }
  // moving average over W so the gain glides down before each peak
  let acc = 0;
  let maxRed = 1;
  for (let i = 0; i < n; i++) {
    acc += s[i]; if (i >= W) acc -= s[i - W];
    const gg = Math.min(s[i], acc / Math.min(i + 1, W));
    L[i] *= gg; R[i] *= gg;
    if (gg < maxRed) maxRed = gg;
  }
  return 20 * Math.log10(maxRed);
}

export function master(stems, { target = -16, ceiling = -1.6 } = {}) {
  const N = stems.pad[0].length;
  const sumL = new Float32Array(N), sumR = new Float32Array(N);
  for (const s of STEMS) for (let i = 0; i < N; i++) { sumL[i] += stems[s][0][i]; sumR[i] += stems[s][1][i]; }
  // a touch of air and a little less mud, then level
  const tmp = join(WORK, 'premaster.wav');
  writeWav(tmp, [sumL, sumR]);
  const pre = loudness(tmp);
  let gain = 10 ** ((target - pre.lufs) / 20);
  let mix, red, meas;
  for (let it = 0; it < 4; it++) {
    const L = Float32Array.from(sumL, v => v * gain), R = Float32Array.from(sumR, v => v * gain);
    red = limiter(L, R, ceiling);
    mix = [L, R];
    writeWav(join(WORK, 'mix.wav'), mix);
    meas = loudness(join(WORK, 'mix.wav'));
    if (Math.abs(meas.lufs - target) < 0.15) break;
    gain *= 10 ** ((target - meas.lufs) / 20);
  }
  return { mix, gain, preLufs: pre.lufs, limiterMaxDb: red, wavMeas: meas };
}

// --- main ---------------------------------------------------------------------------------------------------------------
async function main() {
  const t0 = Date.now();
  mkdirSync(join(OUT, 'stems'), { recursive: true });
  mkdirSync(WORK, { recursive: true });
  const score = buildScore();
  const stems = renderStems(score);
  console.log('stems rendered', ((Date.now() - t0) / 1000).toFixed(1), 's');
  // stem bus levels
  const BUS = { pad: 1.0, bass: 1.0, beat: 1.0, lead: 1.0, animals: 1.0 };
  for (const s of STEMS) for (const ch of stems[s]) scale(ch, BUS[s]);
  const m = master(stems);
  console.log('master: pre', m.preLufs.toFixed(2), 'LUFS, gain', (20 * Math.log10(m.gain)).toFixed(2), 'dB, limiter max', m.limiterMaxDb.toFixed(2), 'dB, wav', JSON.stringify(m.wavMeas));
  encodeMp3(join(WORK, 'mix.wav'), join(OUT, 'mix.mp3'));
  let mixMeas = loudness(join(OUT, 'mix.mp3'));
  console.log('mix.mp3', JSON.stringify(mixMeas));
  // stems: the song before its master, at the master's gain; lowered together if any would peak over -1 dBTP
  let stemGain = m.gain;
  let worst = -Infinity;
  for (const s of STEMS) for (const ch of stems[s]) worst = Math.max(worst, 20 * Math.log10(peak(ch) * stemGain));
  const stemTrim = worst > -1.5 ? -1.5 - worst : 0;
  stemGain *= 10 ** (stemTrim / 20);
  for (const s of STEMS) {
    const L = Float32Array.from(stems[s][0], v => v * stemGain), R = Float32Array.from(stems[s][1], v => v * stemGain);
    writeWav(join(WORK, `${s}.wav`), [L, R]);
    encodeMp3(join(WORK, `${s}.wav`), join(OUT, 'stems', `${s}.mp3`));
  }
  console.log('stems at master gain', (20 * Math.log10(m.gain)).toFixed(2), 'dB', stemTrim ? `then ${stemTrim.toFixed(2)} dB together (loudest stem peak)` : '');
  // pictures
  ffmpeg(['-v', 'error', '-y', '-i', join(OUT, 'mix.mp3'), '-lavfi', 'showspectrumpic=s=1600x600:legend=1:fscale=log:stop=12000', join(OUT, 'spectrogram.png')]);
  ffmpeg(['-v', 'error', '-y', '-i', join(OUT, 'mix.mp3'), '-filter_complex', 'showwavespic=s=1600x400:split_channels=1:colors=#2b7a4b|#4b8fd1', '-frames:v', '1', join(OUT, 'waveform.png')]);
  // song.json
  const lengthSec = +(at(score.endBeat) / SR).toFixed(3);
  const song = {
    slot: 'smidur-h',
    name: 'Skógurinn spilar',
    style: 'Stomp-style body percussion and sound-collage pop: the pond animals\' own calls are the bass, hi-hats, riffs and tune, and feet, hands, sticks, stones, hollow logs, water drops, leaves and mouths are the drums.',
    bpm: BPM, beatZeroSec: 0, key: KEY, lengthSec,
    tune: [['frogs', 'lizards'], ['flyers', 'lizards', 'frogs'], ['grazers', 'turtles', 'frogs', 'lizards'], ['flyers', 'lizards', 'frogs', 'turtles', 'grazers']],
    sections: score.sections.map(s => ({ ...s, startSec: +((s.startBeat * 60) / BPM).toFixed(3) })),
    tuneNotes: score.tuneNotes,
    cues: score.cues.map(c => ({ ...c, beat: +c.beat.toFixed(3) })),
    loop: score.loop,
    stems: { pad: 'stems/pad.mp3', bass: 'stems/bass.mp3', beat: 'stems/beat.mp3', lead: 'stems/lead.mp3', animals: 'stems/animals.mp3' },
    stemLevel: { relativeToMixGainDb: +stemTrim.toFixed(2), note: 'stems are the pre-master sum at the master\'s gain (before its limiter)' + (stemTrim ? ', lowered together so no stem peaks over -1.5 dBFS' : '') },
    sources: [
      'remake/assets/audio/kafli5/hljod/grazers-3.mp3 (CC0 1.0, "z-moo01.wav" by Zozzy)',
      'remake/assets/audio/kafli5/hljod/turtles-2.mp3 (ElevenLabs sound generation, made for this game)',
      'remake/assets/audio/kafli5/hljod/frogs-1.mp3 (ElevenLabs sound generation, made for this game)',
      'remake/assets/audio/kafli5/hljod/frogs-2.mp3 (ElevenLabs sound generation, made for this game)',
      'remake/assets/audio/kafli5/hljod/frogs-5.mp3 (CC0 1.0, "Frog.ogg" by egomassive)',
      'remake/assets/audio/kafli5/hljod/lizards-1.mp3 (ElevenLabs sound generation, made for this game)',
      'remake/assets/audio/kafli5/hljod/lizards-3.mp3 (CC0 1.0, "ThằngLằng.wav" by SieuAmThanh)',
      'remake/assets/audio/kafli5/hljod/flyers-1.mp3 (ElevenLabs sound generation, made for this game)',
      'remake/assets/audio/kafli5/hljod/flyers-3.mp3 (CC BY 4.0, "Curlew .wav" by Benboncan)',
      'remake/assets/audio/kafli5/hljod/horn-1.mp3 (CC0 1.0, "Alpenhorn.aiff" by Danjocross)',
      'everything else synthesized in remake/tools/kafli5-lag/smidur-h/lib/forest.mjs',
    ],
    loudness: { lufs: mixMeas.lufs, truePeak: mixMeas.truePeak },
  };
  writeFileSync(join(OUT, 'song.json'), JSON.stringify(song, null, 1) + '\n');
  console.log('done', ((Date.now() - t0) / 1000).toFixed(1), 's; length', lengthSec, 's');
}

// run when called as a script (not when measure.mjs imports it)
if (!process.env.SMIDUR_H_NO_MAIN) main();
