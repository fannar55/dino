// Measures each of her takes: length, the first attack, the voiced end, the start of the last word, loudness and peak.
//   node remake/tools/kafli5-lag/remix-a/measure-takes.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SR, decode, ebur128 } from './lib/io.mjs';
import { shapeOf, takePath, readLines } from './lib/dj.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '../../../..');
for (const l of readLines(join(here, 'lines.json'))) {
  const f = takePath(ROOT, l.id);
  const [x] = decode(f);
  const s = shapeOf(x);
  let pk = 0;
  for (const v of x) pk = Math.max(pk, Math.abs(v));
  const e = ebur128(f);
  const sec = v => (v / SR).toFixed(3);
  console.log(l.id.padEnd(13), `len ${sec(x.length)} on ${sec(s.onset)} end ${sec(s.voicedEnd)} voiced ${((s.voicedEnd - s.onset) / SR).toFixed(2)}s (${((s.voicedEnd - s.onset) / SR / 0.48).toFixed(1)} beats) last word ${sec(s.lastWord)} (+${((s.lastWord - s.onset) / SR / 0.48).toFixed(2)} b)`, `${e.lufs} LUFS pk ${(20 * Math.log10(pk)).toFixed(1)}`, l.text);
}
