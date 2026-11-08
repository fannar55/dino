// node remake/tools/kafli5-lag/smidur-f/analyse.mjs
// A second look at the rendered files: the mix's long-term octave bands, the song's sections through a tablet-sized speaker
// (a 2nd-order high-pass at 350 Hz), and how much of each stem lives above 200 Hz where small speakers can play it.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { decode, SR } from './lib/io.mjs';
import { biquad } from './lib/dsp.mjs';
import { lufs } from './lib/measure.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../../../../qa/remake/kafli5/lag/keppni/smidur-f');
const song = JSON.parse(readFileSync(join(OUT, 'song.json'), 'utf8'));
const [L, R] = decode(join(OUT, 'mix.mp3'), 2);
const db = e => (10 * Math.log10(e + 1e-20)).toFixed(1);

console.log('octave bands of the mix (dB, energy):');
const bands = [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
console.log(' ', bands.map(f => {
  const a = biquad('bp', f, 1.41), b = biquad('bp', f, 1.41);
  let e = 0;
  for (let i = 0; i < L.length; i++) { const y = b(a((L[i] + R[i]) / 2)); e += y * y; }
  return `${f}:${db(e / L.length)}`;
}).join('  '));

console.log('sections through a small speaker (high-pass 350 Hz), LUFS full / small:');
const hp = () => { const a = biquad('hp', 350, 0.7), b = biquad('hp', 350, 0.7); return x => b(a(x)); };
const hl = hp(), hr = hp();
const sL = Float32Array.from(L, v => hl(v)), sR = Float32Array.from(R, v => hr(v));
for (const s of song.sections) {
  const a = Math.round(s.startSec * SR), b = Math.min(L.length, Math.round((s.startSec + s.beats * 60 / song.bpm) * SR));
  console.log(' ', s.name.padEnd(13), lufs(L.subarray(a, b), R.subarray(a, b)).toFixed(1).padStart(6), lufs(sL.subarray(a, b), sR.subarray(a, b)).toFixed(1).padStart(6));
}
console.log('share of each stem\'s energy above 200 Hz:');
for (const st of ['pad', 'bass', 'beat', 'lead', 'animals']) {
  const [a, b] = decode(join(OUT, 'stems', st + '.mp3'), 2);
  const h1 = biquad('hp', 200, 0.7), h2 = biquad('hp', 200, 0.7);
  let all = 0, hi = 0;
  for (let i = 0; i < a.length; i++) { const m = (a[i] + b[i]) / 2; all += m * m; const y = h2(h1(m)); hi += y * y; }
  console.log(' ', st.padEnd(8), (100 * hi / all).toFixed(0) + '%');
}

// startle check: momentary loudness (400 ms K-weighted windows, 50 ms hop); the biggest jumps over 250 ms
{
  const kw = () => { const a = biquad('highshelf', 1681.97, 0.7072, 4.0), b = biquad('hp', 38.13, 0.5003); return x => b(a(x)); };
  const fl = kw(), fr = kw();
  const hop = Math.round(0.05 * SR), win = 8;
  const e = [];
  let acc = 0, c = 0;
  for (let i = 0; i < L.length; i++) {
    const l = fl(L[i]), r = fr(R[i]);
    acc += l * l + r * r;
    if (++c === hop) { e.push(acc / hop); acc = 0; c = 0; }
  }
  const M = [];
  for (let i = win; i <= e.length; i++) M.push(-0.691 + 10 * Math.log10(e.slice(i - win, i).reduce((s, v) => s + v, 0) / win + 1e-12));
  const jumps = [];
  for (let i = 5; i < M.length; i++) jumps.push({ t: ((i + win) * hop) / SR, from: M[i - 5], to: M[i], d: M[i] - M[i - 5] });
  jumps.sort((a, b) => b.d - a.d);
  const top = [];
  for (const j of jumps) if (top.every(t => Math.abs(t.t - j.t) > 2) && top.length < 6) top.push(j);
  console.log('biggest momentary-loudness rises over 250 ms (s: from → to LUFS):');
  for (const j of top) console.log(`  ${j.t.toFixed(2)}s (beat ${((j.t * song.bpm) / 60).toFixed(1)}): ${j.from.toFixed(1)} → ${j.to.toFixed(1)} (+${j.d.toFixed(1)})`);
  console.log('  loudest momentary:', Math.max(...M).toFixed(1), 'LUFS at', ((M.indexOf(Math.max(...M)) + win) * hop / SR).toFixed(2), 's');
}
