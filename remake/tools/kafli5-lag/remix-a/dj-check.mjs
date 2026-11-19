// Where each of her lines lands in the rendered dj stem (stems/dj.mp3): the first sample over 20% of the line's own peak, from 10 ms
// before its beat, against the beat (ms); and the line's peak.  node remake/tools/kafli5-lag/remix-a/dj-check.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { decode, SR } from './lib/io.mjs';
import { SPB } from './lib/score.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../../../../qa/remake/kafli5/lag/remix/remix-a');
const song = JSON.parse(readFileSync(join(OUT, 'song.json'), 'utf8'));
const [l, r] = decode(join(OUT, 'stems/dj.mp3'), 2);
const list = song.dj;
list.forEach((d, k) => {
  const at = Math.round(d.beat * SPB);
  const end = k + 1 < list.length ? Math.min(Math.round(list[k + 1].beat * SPB), at + 4 * SR) : at + 4 * SR;
  let pk = 0;
  for (let i = at; i < end; i++) pk = Math.max(pk, Math.abs(l[i]), Math.abs(r[i]));
  let i = at - Math.round(0.01 * SR);
  while (i < end && Math.max(Math.abs(l[i]), Math.abs(r[i])) < 0.2 * pk) i++;
  console.log(String(d.beat).padStart(6), d.id.padEnd(13), `attack ${(((i - at) / SR) * 1000).toFixed(0).padStart(4)} ms`, `peak ${(20 * Math.log10(pk)).toFixed(1)} dBFS`, d.text);
});
