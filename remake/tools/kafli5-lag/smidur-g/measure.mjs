// Measures the rendered song (I cannot hear it): per section RMS overall and under 150 Hz, onsets per bar, peaks; loudness with
// ffmpeg's ebur128; clipping in the mix and every stem; the loop's seam; the animal calls' landed pitch and their timing on the
// beat; her horn's notes' pitch.  node remake/tools/kafli5-lag/smidur-g/measure.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pitchTrack } from './lib/takes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../../..');
const OUT = path.join(ROOT, 'qa/remake/kafli5/lag/keppni/smidur-g');
const SR = 44100;
const song = JSON.parse(readFileSync(path.join(OUT, 'song.json'), 'utf8'));
const SPB = (SR * 60) / song.bpm;
const SW = 0.64;
const swing = b => { const f = Math.floor(b + 1e-9); const fr = b - f; return f + (fr < 0.5 ? (fr / 0.5) * SW : SW + ((fr - 0.5) / 0.5) * (1 - SW)); };

function decode(file) {
  const out = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  const x = new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
  const n = x.length / 2;
  const L = new Float32Array(n); const R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = x[2 * i]; R[i] = x[2 * i + 1]; }
  return { L, R, n };
}
const db = v => (v > 0 ? 20 * Math.log10(v) : -120);
function lowpass150(x) {
  // two cascaded one-pole lowpasses plus a biquad-ish second stage (about 24 dB/oct at 150 Hz)
  const y = Float32Array.from(x);
  for (let pass = 0; pass < 4; pass++) {
    const a = Math.exp((-2 * Math.PI * 150) / SR);
    let z = 0;
    for (let i = 0; i < y.length; i++) { z = a * z + (1 - a) * y[i]; y[i] = z; }
  }
  return y;
}
function rms(L, R, a, b) {
  let s = 0;
  for (let i = a; i < b; i++) s += L[i] * L[i] + R[i] * R[i];
  return Math.sqrt(s / (2 * Math.max(1, b - a)));
}

// spectral-flux onsets (mono, 1024-point FFT, hop 256)
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang); const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1; let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j]; const ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr; im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
function onsets(L, R) {
  const size = 1024; const hop = 256;
  const win = Float32Array.from({ length: size }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
  let prev = new Float32Array(size / 2);
  const flux = [];
  for (let s = 0; s + size < L.length; s += hop) {
    const re = new Float64Array(size); const im = new Float64Array(size);
    for (let i = 0; i < size; i++) re[i] = (L[s + i] + R[s + i]) * 0.5 * win[i];
    fft(re, im);
    const mag = new Float32Array(size / 2);
    let f = 0;
    for (let k = 1; k < size / 2; k++) {
      mag[k] = Math.log1p(1000 * Math.hypot(re[k], im[k]));
      const d = mag[k] - prev[k];
      if (d > 0) f += d;
    }
    prev = mag;
    flux.push(f);
  }
  // adaptive threshold: local median + offset, peaks at least 60 ms apart
  const out = [];
  const W = 16;
  for (let i = 1; i < flux.length - 1; i++) {
    const lo = Math.max(0, i - W); const hi = Math.min(flux.length, i + W);
    const loc = flux.slice(lo, hi).sort((a, b) => a - b);
    const med = loc[Math.floor(loc.length / 2)];
    const thr = med * 1.25 + 8;
    if (flux[i] > thr && flux[i] >= flux[i - 1] && flux[i] > flux[i + 1]) {
      const t = (i * hop + size / 2) / SR;
      if (!out.length || t - out[out.length - 1] > 0.06) out.push(t);
    }
  }
  return out;
}

const QUICK = process.argv.includes('--quick');
const report = { sections: [], stems: {}, loop: {}, animals: {}, horn: {} };
const mix = decode(path.join(OUT, 'mix.mp3'));
const lowL = lowpass150(mix.L); const lowR = lowpass150(mix.R);
const on = QUICK ? [] : onsets(mix.L, mix.R);
console.log('section'.padEnd(22), 'from(s)'.padStart(8), 'RMS dB'.padStart(8), '<150 dB'.padStart(8), 'peak dB'.padStart(8), 'onsets/bar'.padStart(11));
for (const s of song.sections) {
  const a = Math.round(swing(s.startBeat) * SPB);
  const b = Math.round(swing(s.startBeat + s.beats) * SPB);
  const r = db(rms(mix.L, mix.R, a, b));
  const lo = db(rms(lowL, lowR, a, b));
  let pk = 0;
  for (let i = a; i < b; i++) pk = Math.max(pk, Math.abs(mix.L[i]), Math.abs(mix.R[i]));
  const bars = s.beats / 4;
  const n = on.filter(t => t >= a / SR && t < b / SR).length;
  const row = { name: s.name, startSec: s.startSec, rms: +r.toFixed(1), low: +lo.toFixed(1), peak: +db(pk).toFixed(1), onsetsPerBar: +(n / bars).toFixed(1) };
  report.sections.push(row);
  console.log(s.name.padEnd(22), s.startSec.toFixed(1).padStart(8), row.rms.toFixed(1).padStart(8), row.low.toFixed(1).padStart(8), row.peak.toFixed(1).padStart(8), row.onsetsPerBar.toFixed(1).padStart(11));
}
// bar by bar RMS (the arc), as a compact line
const arc = [];
for (let bar = 0; bar < 97; bar++) {
  const a = Math.round(swing(bar * 4) * SPB); const b = Math.min(mix.n, Math.round(swing(bar * 4 + 4) * SPB));
  if (a >= mix.n) break;
  arc.push(Math.round(db(rms(mix.L, mix.R, a, b))));
}
report.barRms = arc;
console.log('bar RMS:', arc.join(' '));
// startle check: the biggest jump of a 50 ms window's level over the mean of the 2 s before it
{
  const w = Math.round(0.05 * SR);
  const lv = [];
  for (let i = 0; i + w < mix.n; i += w) lv.push(rms(mix.L, mix.R, i, i + w));
  let worst = { jump: -99, t: 0 };
  for (let i = 40; i < lv.length; i++) {
    let s = 0;
    for (let j = i - 40; j < i; j++) s += lv[j] * lv[j];
    const before = Math.sqrt(s / 40);
    const jump = db(lv[i]) - db(before);
    if (jump > worst.jump) worst = { jump, t: (i * w) / SR };
  }
  report.startle = { jumpDb: +worst.jump.toFixed(1), atSec: +worst.t.toFixed(2) };
  console.log('largest 50 ms jump over the 2 s before:', report.startle.jumpDb, 'dB at', report.startle.atSec, 's');
}

// loudness of the mix
const eb = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path.join(OUT, 'mix.mp3'), '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const last = (re) => { let m; let v = null; const g = new RegExp(re, 'g'); while ((m = g.exec(eb))) v = Number(m[1]); return v; };
report.loudness = { I: last('I:\\s+(-?[\\d.]+) LUFS'), LRA: last('LRA:\\s+(-?[\\d.]+) LU'), truePeak: last('Peak:\\s+(-?[\\d.]+) dBFS') };
console.log('ebur128:', report.loudness);

if (QUICK) process.exit(0);
// stems: peaks and clipping, and the loop's seam (the last 1.5 s before the loop's end against the same before its start)
const ls = Math.round(swing(song.loop.startBeat) * SPB);
const le = Math.round(swing(song.loop.startBeat + song.loop.beats) * SPB);
let sumCheck = null;
for (const [name, rel] of Object.entries(song.stems)) {
  const st = decode(path.join(OUT, rel));
  let pk = 0; let clip = 0;
  for (let i = 0; i < st.n; i++) {
    const a = Math.max(Math.abs(st.L[i]), Math.abs(st.R[i]));
    if (a > pk) pk = a;
    if (a >= 0.999) clip++;
  }
  const w = Math.round(1.5 * SR);
  let d = 0; let e = 0;
  for (let i = 0; i < w; i++) {
    const x1 = st.L[le - w + i] + st.R[le - w + i];
    const x0 = st.L[ls - w + i] + st.R[ls - w + i];
    d += (x1 - x0) ** 2; e += x1 * x1 + x0 * x0;
  }
  // what rings across the end (the 0.3 s after the loop's end, in the song) against what rang into its start
  const w2 = Math.round(0.3 * SR);
  let d2 = 0; let e2 = 0;
  for (let i = 0; i < w2; i++) {
    const a1 = st.L[le + i] + st.R[le + i];
    const a0 = st.L[ls + i] + st.R[ls + i];
    d2 += (a1 - a0) ** 2; e2 += a1 * a1 + a0 * a0;
  }
  const loopRms = db(rms(st.L, st.R, ls, le));
  report.stems[name] = { peak: +db(pk).toFixed(2), clipped: clip, loopRms: +loopRms.toFixed(1) };
  report.loop[name] = { tailDiffDb: e > 0 ? +(10 * Math.log10(d / (e / 2) + 1e-12)).toFixed(1) : null, tailRmsDb: +db(Math.sqrt(e / (2 * w * 2))).toFixed(1) };
  console.log('stem', name.padEnd(8), 'peak', db(pk).toFixed(2), 'dBFS, clipped', clip, '| loop RMS', loopRms.toFixed(1), 'dB, seam diff', report.loop[name].tailDiffDb, 'dB re the tail', `(${report.loop[name].tailRmsDb} dB)`);
  if (!sumCheck) sumCheck = { L: Float32Array.from(st.L), R: Float32Array.from(st.R) };
  else for (let i = 0; i < Math.min(st.n, sumCheck.L.length); i++) { sumCheck.L[i] += st.L[i]; sumCheck.R[i] += st.R[i]; }
  void d2; void e2;
}
let spk = 0;
for (let i = 0; i < sumCheck.L.length; i++) spk = Math.max(spk, Math.abs(sumCheck.L[i]), Math.abs(sumCheck.R[i]));
report.stemSumPeak = +db(spk).toFixed(2);
console.log('the stems summed peak at', report.stemSumPeak, 'dBFS');

// the animals: every processed take's landed pitch, and each cue's onset in the animals stem
const calls = JSON.parse(readFileSync(path.join(OUT, 'tmp/calls.json'), 'utf8'));
const worst = Object.values(calls.takes).sort((a, b) => Math.abs(b.cents ?? 999) - Math.abs(a.cents ?? 999));
report.animals.takes = Object.values(calls.takes).map(t => ({ take: t.take, own: +t.own.toFixed(1), rate: +t.rate.toFixed(4), target: +t.target.toFixed(1), landed: t.landed ? +t.landed.toFixed(1) : null, cents: t.cents == null ? null : +t.cents.toFixed(1) }));
console.log('animal takes (own Hz -> target Hz, landed, cents):');
for (const t of report.animals.takes) console.log(' ', t.take.padEnd(10), String(t.own).padStart(7), '->', String(t.target).padStart(7), String(t.landed).padStart(7), String(t.cents).padStart(6));
void worst;
const an = decode(path.join(OUT, 'stems/animals.mp3'));
const anOn = onsets(an.L, an.R);
const offs = [];
for (const c of song.cues.filter(c => c.kind === 'call')) {
  const t = (swing(c.beat) * SPB) / SR;
  const near = anOn.reduce((best, o) => (Math.abs(o - t) < Math.abs(best - t) ? o : best), Infinity);
  offs.push(Math.round((near - t) * 1000));
}
const absOffs = offs.map(Math.abs).sort((a, b) => a - b);
report.animals.onsetMs = { median: absOffs[Math.floor(absOffs.length / 2)], p90: absOffs[Math.floor(absOffs.length * 0.9)], max: absOffs[absOffs.length - 1], n: offs.length };
console.log('animal cue onsets vs beat (ms): median', report.animals.onsetMs.median, 'p90', report.animals.onsetMs.p90, 'max', report.animals.onsetMs.max, 'of', offs.length);

// her horn: render-free check, the lead stem around a few horn notes where she plays alone (bar 0, the stop-time)
const lead = decode(path.join(OUT, 'stems/lead.mp3'));
const hornChecks = [];
const NAMES = { 0: 'C', 2: 'D', 4: 'E', 5: 'F', 7: 'G', 9: 'A', 11: 'B' };
void NAMES;
const hornCues = song.cues.filter(c => c.kind === 'horn');
for (const c of hornCues.filter((c, i) => ((c.beat >= 0 && c.beat < 4) || (c.beat >= 256 && c.beat < 288)) && (hornCues[i + 1]?.beat ?? 1e9) - c.beat >= 1)) {
  const a = Math.round((swing(c.beat) * SPB) + 0.08 * SR);
  const seg = lead.L.slice(a, a + Math.round(0.18 * SR));
  const fr = pitchTrack(seg, { fmin: 150, fmax: 900, size: 1024, hop: 512 }).filter(f => f.hz > 0 && f.ap < 0.3);
  if (!fr.length) continue;
  const hz = fr.map(f => f.hz).sort((x, y) => x - y)[Math.floor(fr.length / 2)];
  hornChecks.push({ beat: c.beat, hz: +hz.toFixed(1) });
}
// nearest G-pentatonic or scale note and its cents
const near = hz => { const m = 69 + 12 * Math.log2(hz / 440); const r = Math.round(m); return { midi: r, cents: +((m - r) * 100).toFixed(1) }; };
report.horn = hornChecks.map(h => ({ ...h, ...near(h.hz) }));
const hc = report.horn.map(h => Math.abs(h.cents)).sort((a, b) => a - b);
console.log('her horn (alone): notes', hc.length, 'median |cents|', hc[Math.floor(hc.length / 2)], 'max', hc[hc.length - 1]);
writeFileSync(path.join(OUT, 'tmp/measure.json'), `${JSON.stringify(report, null, 2)}\n`);
