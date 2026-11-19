// RMS of the mix (and of the dj stem and the music without her) per half beat over a span of beats, to read the freezes, the gap
// before the drop and her lines without ears.  node remake/tools/kafli5-lag/remix-c/beats.mjs <fromBeat> <toBeat>
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from './lib/io.mjs';
import { SPB } from './lib/score.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../../../../qa/remake/kafli5/lag/remix/remix-c');
const from = Number(process.argv[2] ?? 160), to = Number(process.argv[3] ?? 200);
const monoOf = f => {
  const [l, r] = decode(f, 2);
  return l.map((v, i) => (v + r[i]) / 2);
};
const mix = monoOf(join(OUT, 'mix.mp3'));
const dj = monoOf(join(OUT, 'stems/dj.mp3'));
const mus = monoOf(join(OUT, 'stems/pad.mp3'));
for (const k of ['bass', 'beat', 'lead', 'animals']) {
  const x = monoOf(join(OUT, `stems/${k}.mp3`));
  for (let i = 0; i < mus.length; i++) mus[i] += x[i];
}
const db = (x, a, b) => {
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  const v = Math.sqrt(s / Math.max(1, b - a));
  return v > 0 ? (20 * Math.log10(v)).toFixed(1) : '-inf';
};
console.log('beat    mix    music  dj');
for (let b = from; b < to; b += 0.5) {
  const a = Math.round(b * SPB), e = Math.round((b + 0.5) * SPB);
  console.log(String(b).padEnd(7), db(mix, a, e).padStart(6), db(mus, a, e).padStart(6), db(dj, a, e).padStart(6));
}
