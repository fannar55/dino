// Prints a take's envelope as text (broadband and the voiced band 100-1500 Hz, 20 ms steps), to see where words and vowels are.
//   node remake/tools/kafli5-lag/remix-c/env-print.mjs count_in stopp ...
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, decode } from './lib/io.mjs';
import { Biquad } from './lib/dsp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '../../../assets/audio/kafli5');
for (const name of process.argv.slice(2)) {
  const [x] = decode(join(DIR, `k5_dj_c_${name}.mp3`));
  const v = Float32Array.from(x);
  for (const f of [new Biquad('hp', 100, 0.7), new Biquad('lp', 1500, 0.7), new Biquad('lp', 1500, 0.7)]) f.run(v);
  const step = Math.round(0.02 * SR);
  const rows = [];
  let topB = 0, topV = 0;
  for (let s = 0; s + step <= x.length; s += step) {
    let a = 0, b = 0;
    for (let i = s; i < s + step; i++) { a += x[i] * x[i]; b += v[i] * v[i]; }
    rows.push([Math.sqrt(a / step), Math.sqrt(b / step)]);
    topB = Math.max(topB, rows.at(-1)[0]);
    topV = Math.max(topV, rows.at(-1)[1]);
  }
  const ch = r => ' .:-=+*#%@'[Math.min(9, Math.round((r) * 9))];
  console.log(`${name}: broadband / voiced, 20 ms a char`);
  console.log(rows.map(r => ch(r[0] / topB)).join(''));
  console.log(rows.map(r => ch(r[1] / topV)).join(''));
}
