#!/usr/bin/env node
// Stjörnuhátíðin's song: what the picked track H is, measured from its file and its six stems (qa/remake/hatid/lag/hatid-h/, git
// ignores qa/). Nothing is asked of anyone: it reads the files and writes qa/remake/hatid/lag/hatid-h/measure.json, which
// render.mjs reads for the stems' lag and prints for the report.
//   node remake/tools/hatid-lag/measure.mjs
// What it measures:
//   lag        how many samples the stems sit late against song.mp3 (cross-correlation of their sum with the song)
//   downbeat   which of the four beats of the measured grid is beat 1: the kick (drums under 150 Hz) against the snare (drums over
//              1.5 kHz) in each of the four places, and how much the harmony changes on each (the chroma of bass + guitar + piano
//              the half beat after against the half beat before)
//   bars       each stem's RMS (dBFS) bar by bar on that grid, and the vocals' clarity (how much of each bar is a steady pitch)
//   horn       the pitch track of the opening (the stem that holds the lone tune), its notes as MIDI with their onsets
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, decode } from './lib/io.mjs';
import { Biquad } from './lib/dsp.mjs';
import { fft } from './lib/analyze.mjs';
import { track, median } from './lib/pitch.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const H = path.join(ROOT, 'qa/remake/hatid/lag/hatid-h');
export const STEMS = ['drums', 'bass', 'guitar', 'piano', 'other', 'vocals'];
const db = v => (v > 0 ? 20 * Math.log10(v) : -120);
const rms = (x, a, b) => {
  let s = 0;
  a = Math.max(0, a); b = Math.min(x.length, b);
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
};
const filtered = (x, type, f) => {
  const y = Float32Array.from(x);
  for (const q of [0.5412, 1.3066]) new Biquad(type, f, q).run(y);
  return y;
};
const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = midi => `${NOTE[((Math.round(midi) % 12) + 12) % 12]}${Math.floor(Math.round(midi) / 12) - 1}`;

/** The chroma (12 bins, normalised) of x over [a, b). */
function chroma(x, a, b) {
  const N = 8192, out = new Float64Array(12);
  for (let s = a; s + N <= b; s += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (x[s + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let k = Math.ceil((60 * N) / SR); k < (2000 * N) / SR; k++) {
      const hz = (k * SR) / N, m = Math.hypot(re[k], im[k]);
      out[((Math.round(12 * Math.log2(hz / 440)) + 69) % 12 + 12) % 12] += m;
    }
  }
  const n = Math.hypot(...out) || 1;
  return Array.from(out, v => v / n);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const song = JSON.parse(fs.readFileSync(path.join(H, 'song.json'), 'utf8'));
  const { bpm, beatOffset } = song;
  const spb = (60 / bpm) * SR;
  const [mix] = decode(path.join(H, 'song.mp3'));
  const stem = Object.fromEntries(STEMS.map(s => [s, decode(path.join(H, `${s}.mp3`))[0]]));
  const say = (...a) => console.log(...a);

  // ------------------------------------------------ the stems' lag against song.mp3
  const sum = new Float32Array(mix.length);
  for (const s of STEMS) for (let i = 0; i < sum.length; i++) sum[i] += stem[s][i] ?? 0;
  let best = -Infinity, lag = 0;
  const a0 = Math.round(60 * SR), len = 6 * SR;
  for (let l = -3000; l <= 3000; l++) {
    let c = 0;
    for (let i = 0; i < len; i += 2) c += mix[a0 + i] * sum[a0 + i + l];
    if (c > best) { best = c; lag = l; }
  }
  // how much of the song the stems' sum leaves out, at that lag
  let e = 0, r = 0;
  for (let i = a0; i < a0 + len; i++) { e += (mix[i] - sum[i + lag]) ** 2; r += mix[i] ** 2; }
  say(`stems lag ${lag} samples (${((lag / SR) * 1000).toFixed(1)} ms); residual ${db(Math.sqrt(e / r)).toFixed(1)} dB under the song`);
  for (const s of STEMS) stem[s] = stem[s].subarray(Math.max(0, lag));

  // ------------------------------------------------ the downbeat
  const beatSample = k => Math.round((beatOffset * SR) + k * spb);
  const nBeats = Math.floor((mix.length / SR - beatOffset) / (60 / bpm));
  const kick = filtered(stem.drums, 'lp', 150), snare = filtered(stem.drums, 'hp', 1500);
  const attack = (x, k) => {
    const t = beatSample(k), w = Math.round(0.03 * SR);
    return Math.max(0, rms(x, t - w / 3, t + w) - rms(x, t - 4 * w, t - w / 3));
  };
  const harm = new Float32Array(stem.bass.length);
  for (let i = 0; i < harm.length; i++) harm[i] = stem.bass[i] + stem.guitar[i] + stem.piano[i];
  const change = k => {
    const t = beatSample(k), h = Math.round(spb);
    const p = chroma(harm, t - h, t), q = chroma(harm, t, t + h);
    return 1 - p.reduce((s, v, i) => s + v * q[i], 0);
  };
  const phases = [0, 1, 2, 3].map(() => ({ kick: 0, snare: 0, change: 0, beats: 0 }));
  const perBeat = [];
  for (let k = 1; k < nBeats - 1; k++) {
    const row = { k, kick: attack(kick, k), snare: attack(snare, k), change: change(k) };
    perBeat.push(row);
    const p = phases[k % 4];
    p.kick += row.kick; p.snare += row.snare; p.change += row.change; p.beats++;
  }
  const phaseTable = phases.map((p, i) => ({ phase: i, kick: +(p.kick / p.beats * 1000).toFixed(2), snare: +(p.snare / p.beats * 1000).toFixed(2), change: +(p.change / p.beats).toFixed(3) }));
  say('beat place (k mod 4): kick attack, snare attack (x1000), harmony change:');
  for (const p of phaseTable) say(`  ${p.phase}: ${p.kick}  ${p.snare}  ${p.change}`);

  // ------------------------------------------------ bar by bar, for each of the four possible downbeats the caller picks later
  const barsFor = phase => {
    const first = phase; // bar 0 starts on beat `phase` of the grid (beat 0 at beatOffset)
    const out = [];
    for (let b = 0; ; b++) {
      const a = beatSample(first + 4 * b), z = beatSample(first + 4 * b + 4);
      if (a >= mix.length) break;
      const row = { bar: b, sec: +(a / SR).toFixed(3), mix: +db(rms(mix, a, z)).toFixed(1) };
      for (const s of STEMS) row[s] = +db(rms(stem[s], a, z)).toFixed(1);
      out.push(row);
    }
    return out;
  };
  // the downbeat: kick strongest and the harmony changing most; the place before beatOffset's grid is k = 0
  const score = phaseTable.map(p => p.kick / Math.max(...phaseTable.map(q => q.kick)) + p.change / Math.max(...phaseTable.map(q => q.change)));
  const down = score.indexOf(Math.max(...score));
  // a bar can start before beatOffset's beat 0: the bar before `down` if it fits in the file
  const firstBeat = down - 4 * Math.floor((beatOffset * SR + down * spb) / (4 * spb));
  const bars = barsFor(firstBeat);
  say(`downbeat: grid beat ${down} mod 4 (scores ${score.map(s => s.toFixed(2)).join(' / ')}); bar 0 at ${(beatSample(firstBeat) / SR).toFixed(3)} s`);
  say('bar   sec    mix  ' + STEMS.map(s => s.padStart(7)).join(''));
  for (const row of bars) say(`${String(row.bar).padStart(3)} ${row.sec.toFixed(2).padStart(7)} ${String(row.mix).padStart(6)} ${STEMS.map(s => String(row[s]).padStart(7)).join('')}`);

  // ------------------------------------------------ the vocals: is it voices? clarity bar by bar
  const vocalBars = bars.map(row => {
    const a = beatSample(firstBeat + 4 * row.bar), z = beatSample(firstBeat + 4 * row.bar + 4);
    const fr = track(stem.vocals.subarray(a, z), { win: 2048, hop: 1024, fmin: 80, fmax: 1000 });
    const loud = Math.max(...fr.map(f => f.rms), 1e-9);
    const voiced = fr.filter(f => f.ap < 0.2 && f.rms > 0.1 * loud && f.rms > 0.003);
    return { bar: row.bar, rmsDb: row.vocals, voiced: +(voiced.length / Math.max(1, fr.length)).toFixed(2), medianHz: voiced.length ? +median(voiced.map(f => f.hz)).toFixed(1) : null };
  });
  say('vocals by bar (rms dB, share of frames with a clear pitch, median Hz):');
  say('  ' + vocalBars.map(v => `${v.bar}:${v.rmsDb}/${v.voiced}/${v.medianHz ?? '-'}`).join(' '));

  // ------------------------------------------------ the opening tune: which stem has it, and its notes
  const span = [0, Math.round(22 * SR)];
  const opening = Object.fromEntries(STEMS.map(s => [s, +db(rms(stem[s], ...span)).toFixed(1)]));
  say(`the first 22 s per stem (dBFS): ${JSON.stringify(opening)}`);
  const tuneStems = {};
  for (const s of ['other', 'piano', 'guitar', 'vocals']) {
    const fr = track(stem[s].subarray(0, Math.round(26 * SR)), { win: 2048, hop: 256, fmin: 100, fmax: 1400 });
    const loud = Math.max(...fr.map(f => f.rms), 1e-9);
    // notes: runs of clear frames within 60 cents of each other, at least 120 ms long
    const notes = [];
    let run = [];
    const flush = () => {
      if (run.length * 256 / SR >= 0.12) {
        const m = median(run.map(f => 69 + 12 * Math.log2(f.hz / 440)));
        notes.push({ t: +run[0].t.toFixed(2), seconds: +(run.length * 256 / SR).toFixed(2), midi: +m.toFixed(2), name: noteName(m), hz: +(440 * 2 ** ((m - 69) / 12)).toFixed(1), rmsDb: +db(median(run.map(f => f.rms))).toFixed(1) });
      }
      run = [];
    };
    for (const f of fr) {
      const ok = f.hz > 0 && f.ap < 0.2 && f.rms > 0.08 * loud;
      const m = ok ? 69 + 12 * Math.log2(f.hz / 440) : null;
      if (ok && (!run.length || Math.abs(m - (69 + 12 * Math.log2(run[run.length - 1].hz / 440))) < 0.6)) run.push(f);
      else { flush(); if (ok) run.push(f); }
    }
    flush();
    tuneStems[s] = notes;
    say(`${s}: ${notes.map(n => `${n.t}s ${n.name}(${n.midi}) ${n.seconds}s ${n.rmsDb}dB`).join(' | ')}`);
  }

  const out = { about: 'measure.mjs: H measured from its file and stems', bpm, beatOffset, lagSamples: lag, phaseTable, downbeatPhase: down, firstBeat, bar0Sec: +(beatSample(firstBeat) / SR).toFixed(4), opening, bars, vocalBars, tune: tuneStems, perBeat: perBeat.map(r => ({ k: r.k, kick: +(r.kick * 1000).toFixed(2), snare: +(r.snare * 1000).toFixed(2), change: +r.change.toFixed(3) })) };
  fs.writeFileSync(path.join(H, 'measure.json'), JSON.stringify(out, null, 1) + '\n');
  say('wrote measure.json');
}
