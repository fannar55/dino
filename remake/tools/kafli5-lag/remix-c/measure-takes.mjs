// Her takes as remix-c reads them: length, words found (start, attack, end in s), loudness and peak.
//   node remake/tools/kafli5-lag/remix-c/measure-takes.mjs
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR } from './lib/io.mjs';
import { loadLine } from './lib/dj.mjs';
import { kLoudness } from './lib/master.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '../../../assets/audio/kafli5');
const lines = JSON.parse(readFileSync(join(here, 'lines.json'), 'utf8'));
for (const l of lines) {
  const t = loadLine(DIR, l.id);
  if (!t.real) {
    console.log(l.id.padEnd(14), 'missing');
    continue;
  }
  let pk = 0;
  for (const v of t.x) pk = Math.max(pk, Math.abs(v));
  const words = t.words.map(w => `[${(w.start / SR).toFixed(2)} ${(w.attack / SR).toFixed(2)} ${(w.to / SR).toFixed(2)}]`).join(' ');
  console.log(l.id.padEnd(14), `${(t.x.length / SR).toFixed(2)}s`, `${kLoudness(t.x, t.x).toFixed(1)}`, `pk ${(20 * Math.log10(pk)).toFixed(1)}`, `${t.words.length}w`, words);
}
