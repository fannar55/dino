// Prints each take's pitch contour (every ~23 ms: Hz, YIN aperiodicity, level) so the steady part can be picked by eye.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { decodeMono, pitchTrack } from './lib/takes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const HLJOD = path.resolve(here, '../../../assets/audio/kafli5/hljod');
const files = process.argv.slice(2);
for (const file of files) {
  const x = decodeMono(path.join(HLJOD, file));
  const low = /grazers|turtles|horn/.test(file);
  const fr = pitchTrack(x, { fmin: low ? 55 : 180, fmax: 3400, size: 1024, hop: 512 });
  const peak = Math.max(...fr.map(f => f.rms));
  const line = fr
    .filter(f => f.rms > peak * 0.05)
    .map(f => `${f.t.toFixed(2)}:${f.hz.toFixed(0)}${f.ap > 0.25 ? '?' : ''}/${(20 * Math.log10(f.rms / peak)).toFixed(0)}`);
  console.log(file, '\n ', line.join(' '));
}
