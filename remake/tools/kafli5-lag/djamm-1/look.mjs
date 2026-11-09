// Look at a stretch of the render: RMS per quarter beat of the mix and of each stem (dBFS), from the mp3s.
//   node remake/tools/kafli5-lag/djamm-1/look.mjs <fromBeat> <toBeat> [step=0.25]
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from './lib/io.mjs';
import { mono } from './lib/analyze.mjs';
import { SPB } from './lib/score.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../../../../qa/remake/kafli5/lag/djamm/1');
const [from, to, step = 0.25] = process.argv.slice(2).map(Number);
const files = { mix: 'mix.mp3', drums: 'stems/drums.mp3', bass: 'stems/bass.mp3', music: 'stems/music.mp3', animals: 'stems/animals.mp3', horn: 'stems/horn.mp3', dj: 'stems/dj.mp3' };
const x = {};
for (const [k, f] of Object.entries(files)) x[k] = mono(...decode(join(OUT, f), 2));
console.log(['beat', ...Object.keys(files)].join('\t'));
for (let b = from; b < to; b += step) {
  const a = Math.round(b * SPB), e = Math.round((b + step) * SPB);
  const row = [b.toFixed(2)];
  for (const k of Object.keys(files)) {
    let s = 0;
    for (let i = a; i < e; i++) s += x[k][i] * x[k][i];
    row.push((10 * Math.log10(s / (e - a) + 1e-12)).toFixed(1));
  }
  console.log(row.join('\t'));
}
