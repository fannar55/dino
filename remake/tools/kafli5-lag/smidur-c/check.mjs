// smidur-c's ears, since the builder cannot hear: per section the mix's RMS (all and under 150 Hz) and its drum onsets (rises of
// a 23 ms envelope under 150 Hz and over 5 kHz); loudness and true peak of the mix and every stem; the pitch of every chorus note
// and featured call (and the whistle doubling the tune); each call's onset against its beat; and the loop's seam.
import { SR, biquad, decodeStereo, medianPitch, cents } from './dsp.mjs';
import { lufsOf } from './master.mjs';
import { onsetOf, TONE } from './animals.mjs';
import { SPB } from './score.mjs';

const db = v => (v > 0 ? 20 * Math.log10(v) : -Infinity);
const r1 = v => Math.round(v * 10) / 10;
function rms(x, a, b) { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); }
function band(x, type) {
  const y = Float32Array.from(x);
  if (type === 'low') { biquad(y, 'lp', 150, 0.707); biquad(y, 'lp', 150, 0.707); }
  else { biquad(y, 'hp', 5000, 0.707); biquad(y, 'hp', 5000, 0.707); }
  return y;
}
/** Onsets: frames of 1024 (23 ms), hop 256; a rise of 4 dB over the previous frames' mean, above a floor, 70 ms apart. */
function onsets(x, floor) {
  const W = 1024, hop = 256; const env = [];
  for (let i = 0; i + W <= x.length; i += hop) env.push(rms(x, i, i + W));
  const out = []; let last = -1e9;
  for (let t = 3; t < env.length; t++) {
    const prev = (env[t - 1] + env[t - 2] + env[t - 3]) / 3;
    if (env[t] > floor && env[t] > prev * 1.585 && env[t] > env[t - 1] && (t - last) * hop > 0.07 * SR) {
      out.push(t * hop + W / 2); last = t;
    }
  }
  return out;
}
function pct(arr, p) { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(p * (s.length - 1))]; }

export function checkAll({ OUT, song, json, stems, dryAnimals, renders, LEN, stemPeaks }) {
  const report = {};
  // ---- the mix, as the listener gets it (the mp3)
  const [L, R] = decodeStereo(OUT + 'mix.mp3');
  const mono = new Float32Array(L.length); for (let i = 0; i < L.length; i++) mono[i] = (L[i] + R[i]) * 0.5;
  const low = band(mono, 'low'), high = band(mono, 'high');
  const lowEnv = [], highEnv = [];
  for (let i = 0; i + 1024 <= mono.length; i += 256) { lowEnv.push(rms(low, i, i + 1024)); highEnv.push(rms(high, i, i + 1024)); }
  const lowOn = onsets(low, pct(lowEnv, 0.9) * 0.12), highOn = onsets(high, pct(highEnv, 0.9) * 0.12);
  report.sections = song.sections.map(s => {
    const a = Math.round(s.startBeat * SPB), b = Math.min(mono.length, Math.round((s.startBeat + s.beats) * SPB));
    const bars = s.beats / 4;
    const lo = lowOn.filter(t => t >= a && t < b).length, hi = highOn.filter(t => t >= a && t < b).length;
    return { name: s.name, startBeat: s.startBeat, rmsDb: r1(db(rms(mono, a, b))), lowRmsDb: r1(db(rms(low, a, b))), highRmsDb: r1(db(rms(high, a, b))), lowOnsetsPerBar: r1(lo / bars), highOnsetsPerBar: r1(hi / bars) };
  });
  // ---- loudness and peaks
  report.mix = lufsOf(OUT + 'mix.mp3');
  report.stems = {};
  for (const s of Object.keys(json.stems)) {
    const m = lufsOf(OUT + json.stems[s]);
    const [a, b] = decodeStereo(OUT + json.stems[s]);
    let pk = 0; for (let i = 0; i < a.length; i++) pk = Math.max(pk, Math.abs(a[i]), Math.abs(b[i]));
    report.stems[s] = { lufs: m.lufs, truePeak: m.truePeak, samplePeakDb: r1(db(pk)), lengthSec: +(a.length / SR).toFixed(3) };
  }
  // ---- pitches: every recorded call (chorus notes and featured calls) on the dry animals bus, octave-free
  const groupsOf = {};
  const calls = renders.filter(r => r.e.kind === 'call');
  report.calls = calls.map(r => {
    const beatS = Math.round(r.e.beat * SPB);
    const span = Math.min(r.len - r.pre, Math.round(r.e.beats * SPB * 0.85));
    const target = TONE[r.e.group];
    const p = medianPitch(dryAnimals, beatS + Math.round(0.01 * SR), beatS + span, 80, 4000, 0.6);
    let c = p.hz ? cents(p.hz, target) : NaN; c -= Math.round(c / 1200) * 1200;
    // the onset: the first frame from 60 ms before the beat where the envelope reaches a quarter of its peak in the note
    const w0 = beatS - Math.round(0.06 * SR);
    const seg = dryAnimals.slice(Math.max(0, w0), beatS + Math.round(Math.min(0.3 * SR, span)));
    const on = onsetOf(seg) + Math.max(0, w0) - beatS;
    (groupsOf[r.e.group] ??= []).push(c);
    return { group: r.e.group, beat: r.e.beat, hz: p.hz ? r1(p.hz) : null, cents: Number.isNaN(c) ? null : Math.round(c), onsetMs: r1(on / SR * 1000) };
  });
  const isChorus = b => json.chorusMelody.some(m => m.beat === b);
  const chorusCalls = report.calls.filter(c => isChorus(c.beat));
  const featCalls = report.calls.filter(c => !isChorus(c.beat));
  const summary = list => {
    const cs = list.map(c => c.cents).filter(c => c != null), os = list.map(c => Math.abs(c.onsetMs));
    return { n: list.length, measured: cs.length, centsMedianAbs: cs.length ? Math.round(pct(cs.map(Math.abs), 0.5)) : null, centsWorst: cs.length ? Math.max(...cs.map(Math.abs)) : null, onsetMsWorst: r1(Math.max(...os)), onsetMsMedian: r1(pct(os, 0.5)) };
  };
  report.chorusNotes = summary(chorusCalls);
  report.featureCalls = summary(featCalls);
  report.byGroup = Object.fromEntries(Object.entries(groupsOf).map(([g, cs]) => [g, { median: Math.round(pct(cs.filter(c => !Number.isNaN(c)), 0.5)) }]));
  // the whistle doubling her tune: each note's pitch in its own render
  const wn = [];
  for (const r of renders.filter(x => x.e.kind === 'whistle')) {
    for (const n of r.e.notes) {
      const a = Math.round(n.b * SPB + 0.06 * SR), b = Math.round((n.b + n.d) * SPB - 0.03 * SR);
      const target = 440 * 2 ** ((noteMidi(n.n) - 69) / 12);
      const p = medianPitch(r.y, a, b, target * 0.7, target * 1.4, 0.6);
      wn.push(p.hz ? cents(p.hz, target) : NaN);
    }
  }
  report.whistleTune = { n: wn.length, centsWorst: r1(Math.max(...wn.map(Math.abs))) };
  // ---- the loop's seam: the bar before the loop against the loop's last bar, per stem
  const ls = Math.round(song.loop.startBeat * SPB), le = Math.round((song.loop.startBeat + song.loop.beats) * SPB);
  report.loopSeam = {};
  for (const [s, [a, b]] of Object.entries(stems)) {
    let md = 0, pk = 0;
    for (let k = 1; k <= 4 * SPB; k++) {
      md = Math.max(md, Math.abs(a[ls - k] - a[le - k]), Math.abs(b[ls - k] - b[le - k]));
    }
    for (let i = ls; i < le; i++) pk = Math.max(pk, Math.abs(a[i]), Math.abs(b[i]));
    report.loopSeam[s] = pk > 0 ? r1(db(md / pk)) : 'silent';
  }
  report.preMasterStemPeaksDb = Object.fromEntries(Object.entries(stemPeaks).map(([k, v]) => [k, r1(v)]));
  print(report);
  return report;
}
const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteMidi(n) { const m = /^([A-G])([b#]?)(-?\d)$/.exec(n); return 12 * (Number(m[3]) + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); }
function print(r) {
  console.log('\nsection                     rms   <150Hz  >5kHz  lowOn/bar  highOn/bar');
  for (const s of r.sections) console.log(`${s.name.padEnd(26)} ${String(s.rmsDb).padStart(6)} ${String(s.lowRmsDb).padStart(7)} ${String(s.highRmsDb).padStart(6)} ${String(s.lowOnsetsPerBar).padStart(9)} ${String(s.highOnsetsPerBar).padStart(10)}`);
  console.log('mix', JSON.stringify(r.mix));
  console.log('stems', JSON.stringify(r.stems));
  console.log('chorus notes', JSON.stringify(r.chorusNotes), 'feature calls', JSON.stringify(r.featureCalls));
  console.log('by group (median cents)', JSON.stringify(r.byGroup), 'whistle tune', JSON.stringify(r.whistleTune));
  const bad = r.calls.filter(c => c.cents == null || Math.abs(c.cents) > 40 || Math.abs(c.onsetMs) > 8);
  console.log('calls off (>40 c or >8 ms):', bad.length, JSON.stringify(bad.slice(0, 12)));
  console.log('loop seam (dB, worst diff of the bar before against the last bar, re the loop peak)', JSON.stringify(r.loopSeam));
  console.log('pre-master stem peaks (dBFS)', JSON.stringify(r.preMasterStemPeaksDb));
}
