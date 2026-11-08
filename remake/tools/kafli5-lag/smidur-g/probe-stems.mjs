// The balance (run by hand after a render): each stem's RMS per section from the float WAVs in tmp/, and the premaster's energy in
// three bands (lows < 150 Hz, the body 150-1000 Hz, the bite 1-5 kHz), so a muddy or thin section shows.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../../../qa/remake/kafli5/lag/keppni/smidur-g');
const song = JSON.parse(readFileSync(path.join(OUT, 'song.json'), 'utf8'));
const SR = 44100;
const SPB = (SR * 60) / song.bpm;
const swing = b => { const f = Math.floor(b + 1e-9); const fr = b - f; return f + (fr < 0.5 ? (fr / 0.5) * 0.64 : 0.64 + ((fr - 0.5) / 0.5) * 0.36); };
const readWav = f => {
  const b = readFileSync(f);
  const x = new Float32Array(b.buffer.slice(b.byteOffset + 44, b.byteOffset + b.length));
  const n = x.length / 2;
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) m[i] = (x[2 * i] + x[2 * i + 1]) * 0.5;
  return m;
};
const db = v => (v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf');
const rms = (x, a, b) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
const onePole = (x, f, high = false) => {
  const a = Math.exp((-2 * Math.PI * f) / SR);
  const y = new Float32Array(x.length);
  let z = 0;
  for (let i = 0; i < x.length; i++) { z = a * z + (1 - a) * x[i]; y[i] = high ? x[i] - z : z; }
  return y;
};
const band = (x, lo, hi) => {
  let y = x;
  if (lo) for (let k = 0; k < 3; k++) y = onePole(y, lo, true);
  if (hi) for (let k = 0; k < 3; k++) y = onePole(y, hi);
  return y;
};
const stems = Object.fromEntries(['pad', 'bass', 'beat', 'lead', 'animals'].map(s => [s, readWav(path.join(OUT, 'tmp', `${s}.wav`))]));
const pre = readWav(path.join(OUT, 'tmp', 'premaster.wav'));
const bands = { low: band(pre, 0, 150), body: band(pre, 150, 1000), bite: band(pre, 1000, 5000) };
console.log('section'.padEnd(18), ...Object.keys(stems).map(s => s.padStart(8)), '|', 'low'.padStart(7), 'body'.padStart(7), 'bite'.padStart(7));
for (const s of song.sections) {
  const a = Math.round(swing(s.startBeat) * SPB);
  const b = Math.round(swing(s.startBeat + s.beats) * SPB);
  console.log(s.name.padEnd(18), ...Object.values(stems).map(x => db(rms(x, a, b)).padStart(8)), '|', ...Object.values(bands).map(x => db(rms(x, a, b)).padStart(7)));
}
