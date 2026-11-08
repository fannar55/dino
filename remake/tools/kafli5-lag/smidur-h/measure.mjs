// Measure what render.mjs made: per-section and per-bar level (all and under 150 Hz), onsets per bar, every call's and horn
// note's pitch and onset, the loop's seam in every stem, loudness and peaks, and the mp3's alignment with the wav.
// node remake/tools/kafli5-lag/smidur-h/measure.mjs [--no-pitch]
process.env.SMIDUR_H_NO_MAIN = '1';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decode, ffmpeg, SR } from './lib/io.mjs';
import { biquad } from './lib/dsp.mjs';
import { track, median } from './lib/pitch.mjs';
import { BPM, TONE, hz, buildScore } from './score.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '../../../..');
const OUT = join(ROOT, 'qa/remake/kafli5/lag/keppni/smidur-h');
const WORK = join(OUT, 'work');
const SPB = (SR * 60) / BPM;
const song = JSON.parse(readFileSync(join(OUT, 'song.json'), 'utf8'));
const report = {};
const db = v => (v > 0 ? 20 * Math.log10(v) : -120);

function mono(file) {
  const { ch } = decode(file, 2);
  const x = new Float32Array(ch[0].length);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * (ch[0][i] + ch[1][i]);
  return x;
}
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };

// --- levels and onsets ----------------------------------------------------------------------------------------------
const mix = mono(join(OUT, 'mix.mp3'));
const low = Float32Array.from(mix);
biquad(low, 'lp', 150, 0.7); biquad(low, 'lp', 150, 0.7);
// spectral-flux onsets (log magnitude, 1024 / 256)
function onsets(x) {
  const N = 1024, H = 256, frames = Math.floor((x.length - N) / H);
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const bins = 128; // a coarse DFT on log-spaced bands is enough for onsets
  const freqs = Array.from({ length: bins }, (_, k) => 60 * (16000 / 60) ** (k / (bins - 1)));
  const cs = freqs.map(f => Float32Array.from({ length: N }, (_, i) => Math.cos((2 * Math.PI * f * i) / SR) * win[i]));
  const sn = freqs.map(f => Float32Array.from({ length: N }, (_, i) => Math.sin((2 * Math.PI * f * i) / SR) * win[i]));
  let prev = new Float32Array(bins);
  const flux = new Float32Array(frames);
  for (let t = 0; t < frames; t++) {
    const o = t * H, cur = new Float32Array(bins);
    let fl = 0;
    for (let k = 0; k < bins; k++) {
      let re = 0, im = 0;
      const c = cs[k], s = sn[k];
      for (let i = 0; i < N; i += 2) { re += x[o + i] * c[i]; im += x[o + i] * s[i]; }
      cur[k] = Math.log1p(1000 * Math.sqrt(re * re + im * im));
      fl += Math.max(0, cur[k] - prev[k]);
    }
    flux[t] = fl; prev = cur;
  }
  const sorted = Array.from(flux).sort((a, b) => a - b), floor = sorted[Math.floor(sorted.length * 0.99)] * 0.12;
  // peak pick: local max over +-3 frames and above a moving median + delta
  const picks = [];
  for (let t = 3; t < frames - 3; t++) {
    let isMax = true;
    for (let k = -3; k <= 3; k++) if (flux[t + k] > flux[t]) { isMax = false; break; }
    if (!isMax) continue;
    const w = Array.from(flux.subarray(Math.max(0, t - 40), Math.min(frames, t + 40))).sort((a, b) => a - b);
    if (flux[t] > w[w.length >> 1] * 1.5 + floor) picks.push(((t * H) + N / 2) / SR);
  }
  return picks;
}
const ons = onsets(mix);
const bars = Math.ceil(song.lengthSec * BPM / 240);
const perBar = [];
for (let k = 0; k < bars; k++) {
  const a = Math.round(k * 4 * SPB), b = Math.min(mix.length, Math.round((k + 1) * 4 * SPB));
  const t0 = a / SR, t1 = b / SR;
  perBar.push({ bar: k, rms: +db(rms(mix, a, b)).toFixed(1), low: +db(rms(low, a, b)).toFixed(1), onsets: ons.filter(t => t >= t0 && t < t1).length });
}
report.sections = song.sections.map(s => {
  const a = Math.round(s.startBeat * SPB), b = Math.min(mix.length, Math.round((s.startBeat + s.beats) * SPB));
  const bs = perBar.slice(s.startBeat / 4, (s.startBeat + s.beats) / 4);
  return { name: s.name, feature: s.feature, startSec: s.startSec, rmsDb: +db(rms(mix, a, b)).toFixed(1), under150Db: +db(rms(low, a, b)).toFixed(1),
    onsetsPerBar: +(bs.reduce((m, x) => m + x.onsets, 0) / bs.length).toFixed(1) };
});
console.log('section                 feature   start    RMS  <150Hz  onsets/bar');
for (const s of report.sections) console.log(s.name.padEnd(22), String(s.feature).padEnd(9), String(s.startSec).padStart(6), String(s.rmsDb).padStart(6), String(s.under150Db).padStart(7), String(s.onsetsPerBar).padStart(8));
console.log('per bar RMS:', perBar.map(b => b.rms).join(' '));
console.log('per bar onsets:', perBar.map(b => b.onsets).join(' '));
report.perBar = perBar;

// --- loudness and peaks ---------------------------------------------------------------------------------------------
function loud(file) {
  const t = ffmpeg(['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const s = t.slice(t.lastIndexOf('Summary'));
  return { lufs: Number(/I:\s+(-?[\d.]+) LUFS/.exec(s)?.[1]), lra: Number(/LRA:\s+(-?[\d.]+) LU/.exec(s)?.[1]), truePeak: Number(/Peak:\s+(-?[\d.]+)/.exec(s.slice(s.indexOf('True peak')))?.[1]) };
}
report.mix = loud(join(OUT, 'mix.mp3'));
console.log('mix.mp3', JSON.stringify(report.mix));
report.stems = {};
for (const s of Object.keys(song.stems)) {
  const { ch } = decode(join(OUT, song.stems[s]), 2);
  let p = 0, clipped = 0;
  for (const c of ch) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > p) p = a; if (a >= 0.999) clipped++; }
  report.stems[s] = { samplePeakDb: +db(p).toFixed(2), clipped, seconds: +(ch[0].length / SR).toFixed(3), ...loud(join(OUT, song.stems[s])) };
  console.log('stem', s.padEnd(8), JSON.stringify(report.stems[s]));
}

// --- the loop's seam ------------------------------------------------------------------------------------------------
const L0 = Math.round(song.loop.startBeat * SPB), L1 = Math.round((song.loop.startBeat + song.loop.beats) * SPB), BAR = Math.round(4 * SPB);
report.loop = {};
for (const s of Object.keys(song.stems)) {
  const res = {};
  for (const [kind, file] of [['wav', join(WORK, `${s}.wav`)], ['mp3', join(OUT, song.stems[s])]]) {
    const { ch } = decode(file, 2);
    let maxd = 0, ref = 0;
    for (const c of ch) for (let i = 0; i < BAR; i++) { maxd = Math.max(maxd, Math.abs(c[L0 - BAR + i] - c[L1 - BAR + i])); ref = Math.max(ref, Math.abs(c[L1 - BAR + i])); }
    // the jump itself: the step from the loop's last sample to its first, against typical sample steps
    let step = 0;
    for (const c of ch) step = Math.max(step, Math.abs(c[L1 - 1] - c[L0]));
    res[kind] = { barBeforeVsLastBarMaxDiffDb: +db(maxd).toFixed(1), barPeakDb: +db(ref).toFixed(1), seamStep: +step.toFixed(4) };
  }
  report.loop[s] = res;
  console.log('loop', s.padEnd(8), JSON.stringify(res));
}

// --- mp3 alignment: where the mix.mp3's first strong transient sits against the wav ---------------------------------
{
  const w = mono(join(WORK, 'mix.wav'));
  const a = Math.round(48 * SPB) - 2000, n = 8000;
  let best = 0, bestLag = 0;
  for (let lag = -1200; lag <= 1200; lag++) {
    let s = 0;
    for (let i = 0; i < n; i += 2) s += w[a + i] * mix[a + i + lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  report.mp3LagSamples = bestLag;
  console.log('mp3 vs wav lag (samples):', bestLag);
}

// --- pitches and onsets of every call and horn note (isolated, the same code as the render) -------------------------
if (!process.argv.includes('--no-pitch')) {
  const R = await import('./render.mjs');
  const score = buildScore();
  const seen = new Map();
  const cents = (a, b) => 1200 * Math.log2(a / b);
  const rows = [];
  for (const e of score.events) {
    if (e.i !== 'call' && e.i !== 'horn') continue;
    const key = JSON.stringify([e.i, e.p]);
    if (seen.has(key)) { seen.get(key).count++; continue; }
    const p = e.p;
    let x, target;
    if (e.i === 'horn') {
      target = p.f;
      x = R.renderHornForCheck(p);
    } else {
      x = R.renderCallForCheck(p);
      const base = hz(TONE[p.group]);
      target = p.role === 'hat' ? base : p.group === 'grazers' && p.chop ? base * 2 ** (p.octave ?? 0) : p.group === 'frogs' && p.low ? base / 2 : (p.group === 'lizards' && p.gecko) || (p.group === 'flyers' && p.trill) ? base * 2 : base;
    }
    let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v));
    let on = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > pk * 0.25) { on = i / SR; break; }
    on -= e.i === 'horn' ? 0.035 : p.group === 'grazers' && !p.chop ? 0.015 : p.group === 'frogs' && !p.low && p.role !== 'hat' ? 0.02 : 0; // the render starts these early
    const look = Math.min(x.length / SR, Math.max(0.06, Math.min(0.45, (p.dur ?? 0.4))));
    const fr = track(x.subarray(0, Math.round(look * SR)), SR, { size: 1024, hop: 128, fmin: target / 1.9, fmax: target * 1.9 }).filter(f => f.clarity > 0.5 && f.hz);
    const med = fr.length ? median(fr.map(f => f.hz)) : null;
    const row = { kind: e.i, group: p.group ?? 'horn', role: p.role ?? (p.tune ? 'tune' : ''), variant: [p.chop && 'chop', p.octave && `oct${p.octave}`, p.low && 'low', p.gecko && 'gecko', p.trill && 'trill', p.role === 'hat' && 'hat'].filter(Boolean).join(','),
      dur: p.dur, target: +target.toFixed(1), measured: med ? +med.toFixed(1) : null, cents: med ? Math.round(cents(med, target)) : null, onsetMs: Math.round(on * 1000), count: 1 };
    seen.set(key, row); rows.push(row);
  }
  report.pitches = rows;
  const bad = rows.filter(r => r.cents === null || Math.abs(r.cents) > 20);
  console.log(`calls/horn variants: ${rows.length}, over 20 cents or unmeasured: ${bad.length}`);
  for (const r of rows) console.log(' ', r.kind.padEnd(5), r.group.padEnd(8), (r.variant || r.role).padEnd(10), 'dur', String(r.dur?.toFixed?.(2)).padEnd(5), 'target', String(r.target).padEnd(7), 'got', String(r.measured).padEnd(7), 'cents', String(r.cents).padStart(4), 'onset', `${r.onsetMs}ms`, 'x', r.count);
  // tune notes in place: the animals stem around each tune note
  const an = mono(join(WORK, 'animals.wav'));
  const inPlace = song.tuneNotes.map(t => {
    const a = Math.round(t.beat * SPB) + Math.round(0.03 * SR);
    const target = hz(TONE[t.group]);
    const fr = track(an.subarray(a, a + Math.round(0.2 * SR)), SR, { size: 1024, hop: 128, fmin: target / 1.9, fmax: target * 1.9 }).filter(f => f.clarity > 0.5 && f.hz);
    const med = fr.length ? median(fr.map(f => f.hz)) : null;
    return { ...t, cents: med ? Math.round(cents(med, target)) : null };
  });
  report.tuneInPlace = inPlace;
  console.log('tune notes in place (cents):', inPlace.map(t => `${t.group.slice(0, 2)}${t.cents}`).join(' '));
}
writeFileSync(join(OUT, 'measure.json'), JSON.stringify(report, null, 1) + '\n');
