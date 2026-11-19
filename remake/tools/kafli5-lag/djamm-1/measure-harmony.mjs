// The harmony in detail: the bass stem's pitch per eighth (YIN), the band's chroma (guitar + other + piano, 150-2000 Hz) per
// half bar, and what the vocals stem holds (its chroma and its onsets within the bar). Stems are read 1105 samples late (their
// encoder delay against song.mp3, measured by measure-track.mjs). Usage: node .../measure-harmony.mjs [fromBar] [toBar]
import { decode, SR } from './lib/io.mjs';
import { fft, mono, onsets } from './lib/analyze.mjs';
import { yinFrame } from './lib/pitch.mjs';

const DIR = 'remake/assets/audio/sloedla/v2/djamm';
const LAG = 1105;
const T0 = 0.0272, BEAT = 0.48;
const PC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const REF = 440 * 2 ** (2.6 / 1200);
const from = Number(process.argv[2] ?? 8), to = Number(process.argv[3] ?? 24);
const ld = n => {
  const [L, R] = decode(`${DIR}/${n}.mp3`, 2);
  return mono(L, R);
};
const bass = ld('bass'), guitar = ld('guitar'), other = ld('other'), piano = ld('piano'), vocals = ld('vocals');
const band = new Float32Array(guitar.length);
for (let i = 0; i < band.length; i++) band[i] = guitar[i] + other[i] + piano[i];
const at = beat => Math.round((T0 + beat * BEAT) * SR) + LAG;
const name = hz => {
  const m = 69 + 12 * Math.log2(hz / REF);
  const r = Math.round(m);
  return `${PC[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}${Math.abs(m - r) > 0.3 ? '~' : ''}`;
};
function chromaTop(x, a, b, n = 4) {
  const N = 8192, out = new Float64Array(12);
  for (let s = a; s + N <= b; s += N / 4) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let k = Math.ceil((150 * N) / SR); k < (2000 * N) / SR; k++) {
      const midi = 69 + 12 * Math.log2((k * SR) / N / REF), r = Math.round(midi);
      if (Math.abs(midi - r) > 0.35) continue;
      out[((r % 12) + 12) % 12] += re[k] * re[k] + im[k] * im[k];
    }
  }
  const t = out.reduce((p, v) => p + v, 0) || 1;
  return [...out].map((v, i) => [v / t, PC[i]]).sort((p, q) => q[0] - p[0]).slice(0, n).map(([v, p]) => `${p}${Math.round(v * 100)}`).join(' ');
}
for (let bar = from; bar < to; bar++) {
  const eighths = [];
  for (let e = 0; e < 8; e++) {
    const s = at(bar * 4 + e / 2);
    const f = yinFrame(bass, s + 400, 2048, 35, 400);
    eighths.push(f && f.ap < 0.3 ? name(f.hz) : '.');
  }
  const h1 = chromaTop(band, at(bar * 4), at(bar * 4 + 2));
  const h2 = chromaTop(band, at(bar * 4 + 2), at(bar * 4 + 4));
  const vc = chromaTop(vocals, at(bar * 4), at(bar * 4 + 4), 3);
  const seg = vocals.subarray(at(bar * 4), at(bar * 4 + 4));
  const ons = onsets(seg).map(t => (t / BEAT).toFixed(2));
  console.log(`bar ${bar}: bass ${eighths.join(' ')} | band ${h1} / ${h2} | vocals ${vc} on ${ons.slice(0, 8).join(',')}`);
}
