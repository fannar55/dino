// Octave-band levels (dB) of the rendered mix per section, to see the spectral balance (is the low end swallowing the mids?).
// node remake/tools/kafli5-lag/smidur-b/probe-bands.mjs
import { readFileSync } from 'node:fs';
import { SR, biquad, filt } from './dsp.mjs';
import { decode } from './samples.mjs';

const OUT = 'qa/remake/kafli5/lag/keppni/smidur-b';
const song = JSON.parse(readFileSync(`${OUT}/song.json`, 'utf8'));
const x = decode(`${OUT}/mix.mp3`);
const spb = (60 / song.bpm) * SR;
const centers = [40, 80, 160, 315, 630, 1250, 2500, 5000, 10000];
const bands = centers.map(fc => {
  const y = Float32Array.from(x);
  filt(y, biquad('bp', fc, 1.41)); filt(y, biquad('bp', fc, 1.41));
  return y;
});
console.log('section'.padEnd(26), centers.map(c => String(c).padStart(6)).join(''));
for (const s of song.sections) {
  const a = Math.round(s.startBeat * spb), b = Math.min(x.length, Math.round((s.startBeat + s.beats) * spb));
  const row = bands.map(y => { let q = 0; for (let i = a; i < b; i++) q += y[i] * y[i]; return 10 * Math.log10(q / (b - a) + 1e-14); });
  console.log(s.name.slice(0, 25).padEnd(26), row.map(v => v.toFixed(1).padStart(6)).join(''));
}
