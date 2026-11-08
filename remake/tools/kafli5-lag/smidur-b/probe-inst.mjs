// Each instrument alone: peak, DC, spectral centroid, share of energy over 8 kHz and under 80 Hz, length to -60 dB.
// node remake/tools/kafli5-lag/smidur-b/probe-inst.mjs
import { SR } from './dsp.mjs';
import * as D from './drums.mjs';
import * as I from './inst.mjs';
import * as V from './voices.mjs';

function fftMag(x) {
  let N = 1;
  while (N < x.length) N <<= 1;
  N = Math.min(N, 1 << 16);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < Math.min(N, x.length); i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.min(N, x.length)));
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= N; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < N; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(a * k), s = Math.sin(a * k);
        const xr = re[i + k + len / 2] * c - im[i + k + len / 2] * s, xi = re[i + k + len / 2] * s + im[i + k + len / 2] * c;
        re[i + k + len / 2] = re[i + k] - xr; im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr; im[i + k] += xi;
      }
    }
  }
  const mag = new Float64Array(N / 2);
  for (let i = 0; i < N / 2; i++) mag[i] = re[i] * re[i] + im[i] * im[i];
  return { mag, N };
}
function stats(name, s) {
  const x = s instanceof Float32Array ? s : Float32Array.from(s.L, (v, i) => 0.5 * (v + s.R[i]));
  let pk = 0, dc = 0, last = 0;
  for (let i = 0; i < x.length; i++) { pk = Math.max(pk, Math.abs(x[i])); dc += x[i]; }
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > pk * 1e-3) last = i;
  const { mag, N } = fftMag(x);
  let tot = 0, hi = 0, lo = 0, cen = 0;
  for (let i = 1; i < mag.length; i++) { const f = (i * SR) / N; tot += mag[i]; cen += f * mag[i]; if (f > 8000) hi += mag[i]; if (f < 80) lo += mag[i]; }
  console.log(`${name.padEnd(16)} pk ${pk.toFixed(2)} dc ${(dc / x.length).toExponential(1)} centroid ${(cen / tot).toFixed(0)} Hz  >8k ${((100 * hi) / tot).toFixed(2)}%  <80 ${((100 * lo) / tot).toFixed(1)}%  ring ${(last / SR).toFixed(2)}s`);
}
stats('taiko', D.taiko(1, 1));
stats('taiko2', D.taiko(1, 2, { f0: 55, decay: 1.1 }));
stats('tom', D.tom(1, 3));
stats('shime', D.shime(1, 4));
stats('frameDum', D.frameDum(1, 5));
stats('frameTek', D.frameTek(1, 6));
stats('logDrum', D.logDrum(1, 7, 261.6));
stats('shaker', D.shaker(1, 8));
stats('clap', D.clap(1, 9));
stats('stomp', D.stomp(1, 10));
stats('lowStrings F2', I.lowStrings(41, 0.2, 1, 11));
stats('brass stab F', I.brassChord([53, 57, 60, 65, 69], 0.2, 0.9, 12));
stats('trumpet C5', I.brassNote(72, 0.9, 0.8, 13, { kind: 'tpt' }));
stats('tuba F2', I.brassNote(41, 0.3, 0.8, 14, { kind: 'tuba' }));
stats('pad A3', I.padNote(57, 1.9, 0.5, 15));
stats('choir oo A4', I.choirNote(69, 1.9, 0.5, 16));
stats('chant hey', I.chant('hey', [60, 65, 57], 0.7, 17));
stats('chant ho', I.chant('ho', [60, 65, 57], 0.7, 18));
stats('flute D6', I.flute(86, 0.5, 0.8, 19));
stats('kalimba A4', I.kalimba(69, 0.8, 20));
stats('xylo C6', I.xylo(84, 0.8, 21));
stats('lowMarimba G3', I.lowMarimba(55, 0.8, 22));
stats('glock D6', I.glock(86, 0.8, 23));
stats('horn C4', V.horn('lizards', 1));
stats('marimba F4', V.marimba('grazers'));
for (const [g, ids] of Object.entries(V.TAKES)) for (const id of Object.keys(ids)) stats(`${g}:${id}`, V.call(g, id));
