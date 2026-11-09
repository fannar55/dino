// Which notes a record holds: sharp spectral peaks (16384-point frames) summed per semitone, in two bands (bass 35-260 Hz, the
// rest 260-2500 Hz), with each pitch class's mean cents; per section of bars if asked. A second look next to measure-records.mjs
// for records whose chroma reads both F and F#. Usage: node .../measure-notes.mjs <file> [fromS toS]...
import { decode, SR } from './lib/io.mjs';
import { fft, mono } from './lib/analyze.mjs';

const PC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const [file, ...spans] = process.argv.slice(2);
const [L, R] = decode(file, 2);
const x = mono(L, R);
const ranges = [];
for (let i = 0; i < spans.length; i += 2) ranges.push([+spans[i], +spans[i + 1]]);
if (!ranges.length) ranges.push([2, x.length / SR - 2]);
const N = 16384;
for (const [a, b] of ranges) {
  const bands = { bass: [35, 260], mid: [260, 2500] };
  const acc = { bass: new Float64Array(12), mid: new Float64Array(12) }, cents = { bass: new Float64Array(12), mid: new Float64Array(12) };
  for (let s = Math.round(a * SR); s + N < b * SR; s += N / 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    const p = new Float64Array(N / 2);
    for (let k = 0; k < N / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
    for (const [band, [lo, hi]] of Object.entries(bands)) {
      for (let k = Math.ceil((lo * N) / SR); k < (hi * N) / SR; k++) {
        if (!(p[k] > p[k - 1] && p[k] >= p[k + 1] && p[k] > 3 * (p[k - 4] + p[k + 4]))) continue;
        const d = (0.5 * (p[k - 1] - p[k + 1])) / (p[k - 1] - 2 * p[k] + p[k + 1]);
        const hz = ((k + d) * SR) / N, m = 69 + 12 * Math.log2(hz / 440), r = Math.round(m), pc = ((r % 12) + 12) % 12;
        const w = Math.sqrt(p[k]);
        acc[band][pc] += w;
        cents[band][pc] += w * (m - r) * 100;
      }
    }
  }
  for (const band of ['bass', 'mid']) {
    const t = acc[band].reduce((p, v) => p + v, 0) || 1;
    const line = [...acc[band]].map((v, i) => [v / t, i]).sort((p, q) => q[0] - p[0]).map(([v, i]) => `${PC[i]}${Math.round(v * 100)}(${(cents[band][i] / (acc[band][i] || 1)).toFixed(0)}c)`).join(' ');
    console.log(`${a}-${b}s ${band}: ${line}`);
  }
}
