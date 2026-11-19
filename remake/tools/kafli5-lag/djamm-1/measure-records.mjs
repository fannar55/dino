// Round two: measure the other records before building on them (theme-tempo's guesses are not trusted). For each record: its
// length, the beat phase (onset strength of the kick band <120 Hz and the snare/hat band >1.5 kHz folded on a 0.48 s beat, every
// millisecond tried), which beats carry the snare (backbeat), the tuning (cents off A440 from the chroma's fine peak), and per
// bar: level, the low-band root (YIN on <250 Hz) and the top pitch classes (150-2000 Hz). Usage:
//   node remake/tools/kafli5-lag/djamm-1/measure-records.mjs [name ...]   (names: song-3 vidlag fonk slagverk rolegt)
import { decode, SR } from './lib/io.mjs';
import { fft, mono, lowpassed } from './lib/analyze.mjs';
import { Biquad } from './lib/dsp.mjs';
import { yinFrame } from './lib/pitch.mjs';

const BASE = 'remake/assets/audio/sloedla/v2';
const FILES = { 'song-3': 'djamm/song-3.mp3', vidlag: 'djamm-vidlag/song.mp3', fonk: 'djamm-fonk/song.mp3', slagverk: 'djamm-slagverk/song.mp3', rolegt: 'djamm-rolegt/song.mp3', song: 'djamm/song.mp3' };
const PC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BEAT = 0.48;
const db = v => (v > 0 ? 20 * Math.log10(v) : -120);
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['song-3', 'vidlag', 'fonk', 'slagverk', 'rolegt'];

function flux(x, hop = 64) {
  // onset strength: positive change of a 3 ms rectified envelope, per hop
  const n = Math.floor(x.length / hop), env = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < hop; j++) s += Math.abs(x[i * hop + j]);
    env[i] = s / hop;
  }
  const sm = new Float64Array(n);
  for (let i = 0; i < n; i++) sm[i] = 0.7 * (sm[i - 1] || 0) + 0.3 * env[i];
  const f = new Float64Array(n);
  for (let i = 1; i < n; i++) f[i] = Math.max(0, sm[i] - sm[i - 1]);
  return { f, hop };
}
function phase({ f, hop }, from, to) {
  // best offset (s) of a 0.48 s grid, and the strength per offset relative to the mean
  let best = 0, bv = -1, tot = 0;
  const vals = [];
  for (let ms = 0; ms < 480; ms++) {
    let s = 0;
    for (let t = ms / 1000 + Math.ceil((from - ms / 1000) / BEAT) * BEAT; t < to; t += BEAT) {
      const i = Math.round((t * SR) / hop);
      s += Math.max(f[i - 1] || 0, f[i] || 0, f[i + 1] || 0);
    }
    vals.push(s);
    tot += s;
    if (s > bv) {
      bv = s;
      best = ms;
    }
  }
  return { ms: best, contrast: +(bv / (tot / 480)).toFixed(2), half: +(vals[(best + 240) % 480] / bv).toFixed(2) };
}
function chroma(x, a, b, lo = 150, hi = 2000, ref = 440) {
  const N = 8192, out = new Float64Array(12);
  for (let s = a; s + N <= b; s += N / 4) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (x[s + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    for (let k = Math.ceil((lo * N) / SR); k < (hi * N) / SR; k++) {
      const midi = 69 + 12 * Math.log2((k * SR) / N / ref), r = Math.round(midi);
      if (Math.abs(midi - r) > 0.35) continue;
      out[((r % 12) + 12) % 12] += re[k] * re[k] + im[k] * im[k];
    }
  }
  const t = out.reduce((p, v) => p + v, 0) || 1;
  return [...out].map(v => v / t);
}
function tuning(x) {
  // the cents offset where the folded spectrum (sharp peaks only) is strongest
  const N = 16384, hist = new Float64Array(100);
  for (let s = Math.round(5 * SR); s + N < x.length - 5 * SR; s += N * 2) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = x[s + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
    fft(re, im);
    const p = new Float64Array(N / 2);
    for (let k = 0; k < N / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
    for (let k = Math.ceil((150 * N) / SR); k < (1500 * N) / SR; k++) {
      if (!(p[k] > p[k - 1] && p[k] > p[k + 1] && p[k] > 4 * (p[k - 3] + p[k + 3]))) continue;
      const d = (0.5 * (p[k - 1] - p[k + 1])) / (p[k - 1] - 2 * p[k] + p[k + 1]);
      const hz = ((k + d) * SR) / N, m = 69 + 12 * Math.log2(hz / 440);
      const c = Math.round((m - Math.round(m)) * 100 + 50) % 100;
      hist[c] += Math.sqrt(p[k]);
    }
  }
  let bi = 0;
  hist.forEach((v, i) => (v > hist[bi] ? (bi = i) : 0));
  return bi - 50;
}
const hp = (x, f = 1500) => {
  const y = Float32Array.from(x);
  for (const q of [0.54, 1.31]) new Biquad('hp', f, q).run(y);
  return y;
};

for (const n of names) {
  const [L, R] = decode(FILES[n] ? `${BASE}/${FILES[n]}` : n, 2); // a name above, or a path
  const x = mono(L, R), dur = x.length / SR;
  console.log(`\n=== ${n} (${FILES[n]}) ${dur.toFixed(2)} s`);
  const lo = flux(lowpassed(x, 120)), hi = flux(hp(x));
  const pk = phase(lo, 2, dur - 4), ph = phase(hi, 2, dur - 4);
  console.log(`beat phase: kick ${pk.ms} ms (contrast ${pk.contrast}, half-beat ${pk.half}) | hats/snare ${ph.ms} ms (contrast ${ph.contrast}, half ${ph.half})`);
  const win = [];
  for (let a = 2; a + 12 < dur - 2; a += 12) win.push(phase(hi, a, a + 12).ms);
  console.log('hats/snare phase per 12 s window (ms):', win.join(' '));
  if (process.env.PHASE_ONLY) continue;
  const t0 = ph.contrast > 1.4 ? ph.ms / 1000 : pk.ms / 1000; // the hats/snare attack is the sharper mark (the kick band flux peaks ~25 ms after its start)
  // snare on which beat of a pair: high band strength on even vs odd beats from t0
  const at = (t) => Math.round((t * SR) / hi.hop);
  const beatStr = [0, 0, 0, 0], kickStr = [0, 0, 0, 0];
  for (let k = 0; t0 + k * BEAT < dur - 2; k++) {
    const i = at(t0 + k * BEAT), j = Math.round(((t0 + k * BEAT) * SR) / lo.hop);
    beatStr[k % 4] += Math.max(hi.f[i - 1] || 0, hi.f[i] || 0, hi.f[i + 1] || 0);
    kickStr[k % 4] += Math.max(lo.f[j - 1] || 0, lo.f[j] || 0, lo.f[j + 1] || 0);
  }
  const nrm = a => a.map(v => (v / Math.max(...a)).toFixed(2)).join(' ');
  console.log(`grid t0 ${(t0 * 1000).toFixed(0)} ms; beats 0-3 (mod 4) high band ${nrm(beatStr)} | kick ${nrm(kickStr)}`);
  const cents = tuning(x);
  const ref = 440 * 2 ** (cents / 1200);
  console.log(`tuning ${cents > 0 ? '+' : ''}${cents} cents`);
  const whole = chroma(x, Math.round(4 * SR), x.length - Math.round(4 * SR), 150, 2000, ref);
  console.log('whole chroma:', whole.map((v, i) => [v, PC[i]]).sort((p, q) => q[0] - p[0]).map(([v, p]) => `${p}${Math.round(v * 100)}`).join(' '));
  const bass = lowpassed(x, 250);
  const name = hz => {
    const m = 69 + 12 * Math.log2(hz / ref), r = Math.round(m);
    return `${PC[((r % 12) + 12) % 12]}${Math.abs(m - r) > 0.3 ? '~' : ''}`;
  };
  const nBars = Math.floor((dur - t0) / (4 * BEAT));
  for (let bar = 0; bar < nBars; bar++) {
    const a = Math.round((t0 + bar * 4 * BEAT) * SR), b = Math.round((t0 + (bar + 1) * 4 * BEAT) * SR);
    let s = 0;
    for (let i = a; i < b; i++) s += x[i] * x[i];
    const roots = [];
    for (let e = 0; e < 8; e++) {
      const st = Math.round((t0 + (bar * 4 + e / 2) * BEAT) * SR) + 600;
      const f = yinFrame(bass, st, 4096, 35, 300);
      roots.push(f && f.ap < 0.35 ? name(f.hz) : '.');
    }
    const c = chroma(x, a, b, 150, 2000, ref).map((v, i) => [v, PC[i]]).sort((p, q) => q[0] - p[0]).slice(0, 5).map(([v, p]) => `${p}${Math.round(v * 100)}`).join(' ');
    console.log(`bar ${String(bar).padStart(3)} ${(a / SR).toFixed(2).padStart(6)}s ${db(Math.sqrt(s / (b - a))).toFixed(1).padStart(6)} dB | low ${roots.join(' ')} | ${c}`);
  }
}
