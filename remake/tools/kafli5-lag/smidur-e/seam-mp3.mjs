// The loop as the game will hear it: each decoded stem's last 2 loop bars against the same bars one loop earlier, and the
// sample step across the wrap (the loop's last sample to its first) next to the step the song itself takes at the loop's start.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from './lib/io.mjs';
import { loopSeam } from './lib/analyze.mjs';
import { SPB, LOOP } from './lib/score.mjs';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../../../qa/remake/kafli5/lag/keppni/smidur-e');
const S = LOOP.startBeat * SPB, N = LOOP.beats * SPB;
for (const k of ['pad', 'bass', 'beat', 'lead', 'animals']) {
  const [L, R] = decode(join(OUT, 'stems', `${k}.mp3`), 2);
  const seam = loopSeam({ L, R }, S, N, 8 * SPB);
  let wrap = 0, own = 0;
  for (const ch of [L, R]) {
    wrap = Math.max(wrap, Math.abs(ch[S] - ch[S + N - 1]));
    own = Math.max(own, Math.abs(ch[S] - ch[S - 1]));
  }
  console.log(k.padEnd(8), JSON.stringify(seam), `wrap step ${wrap.toFixed(5)}, the song's own step there ${own.toFixed(5)}`);
}
