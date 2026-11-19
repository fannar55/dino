// Octave-band energy of each stem (and the mix) over a span of beats: node bands.mjs [fromBeat] [toBeat]
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, SR } from './lib/io.mjs';
import { SPB } from './lib/score.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../../../../qa/remake/kafli5/lag/keppni/smidur-e');
const from = Number(process.argv[2] ?? 32), to = Number(process.argv[3] ?? 48);
const N = 8192;
function fftMag(x) {
  const re = Float64Array.from(x), im = new Float64Array(x.length);
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2;
        const br = re[q] * cr - im[q] * ci, bi = re[q] * ci + im[q] * cr;
        re[q] = re[p] - br; im[q] = im[p] - bi; re[p] += br; im[p] += bi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  const m = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) m[k] = re[k] * re[k] + im[k] * im[k];
  return m;
}
const edges = [20, 40, 80, 160, 320, 640, 1280, 2560, 5120, 10240, 20000];
const show = name => {
  const [l, r] = decode(name === 'mix' ? join(OUT, 'mix.mp3') : join(OUT, 'stems', `${name}.mp3`), 2);
  const a = Math.round(from * SPB), b = Math.round(to * SPB);
  const acc = new Float64Array(N / 2);
  const w = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  let frames = 0;
  for (let s = a; s + N <= b; s += N / 2) {
    const x = new Float64Array(N);
    for (let i = 0; i < N; i++) x[i] = ((l[s + i] + r[s + i]) / 2) * w[i];
    const m = fftMag(x);
    for (let k = 0; k < N / 2; k++) acc[k] += m[k];
    frames++;
  }
  const bands = [];
  for (let e = 0; e < edges.length - 1; e++) {
    let s = 0;
    for (let k = Math.ceil((edges[e] * N) / SR); k < Math.min(N / 2, (edges[e + 1] * N) / SR); k++) s += acc[k];
    bands.push(s / frames);
  }
  return bands;
};
const names = ['mix', 'pad', 'bass', 'beat', 'lead', 'animals'];
console.log(`beats ${from}-${to}; dB per octave band (relative to the mix's loudest band)`);
const all = names.map(show);
const ref = Math.max(...all[0]);
console.log('band'.padEnd(10), names.map(n => n.padStart(8)).join(''));
for (let e = 0; e < edges.length - 1; e++)
  console.log(`${edges[e]}-${edges[e + 1]}`.padEnd(10), all.map(b => (10 * Math.log10(b[e] / ref + 1e-12)).toFixed(1).padStart(8)).join(''));
