// Per-bar RMS of the mastered mix (dB), all and under 150 Hz, to see the arc bar by bar: `node bars.mjs`
import { fileURLToPath } from 'node:url';
import { decodeStereo, biquad } from './dsp.mjs';
import { SPB } from './score.mjs';

const OUT = fileURLToPath(new URL('../../../../qa/remake/kafli5/lag/keppni/smidur-c/', import.meta.url));
const [L, R] = decodeStereo(OUT + 'mix.mp3');
const m = new Float32Array(L.length); for (let i = 0; i < m.length; i++) m[i] = (L[i] + R[i]) / 2;
const lo = Float32Array.from(m); biquad(lo, 'lp', 150, 0.707); biquad(lo, 'lp', 150, 0.707);
const rows = [];
for (let bar = 0; bar * 4 * SPB < m.length; bar++) {
  const a = bar * 4 * SPB, b = Math.min(m.length, a + 4 * SPB);
  let s = 0, sl = 0; for (let i = a; i < b; i++) { s += m[i] * m[i]; sl += lo[i] * lo[i]; }
  rows.push(`${String(bar).padStart(3)} ${(10 * Math.log10(s / (b - a))).toFixed(1).padStart(6)} ${(10 * Math.log10(sl / (b - a))).toFixed(1).padStart(6)}`);
}
console.log('bar    rms  <150');
for (let i = 0; i < rows.length; i += 4) console.log(rows.slice(i, i + 4).join('   |'));
