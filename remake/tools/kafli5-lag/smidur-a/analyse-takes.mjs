// Measures the chapter's recordings for the song: length, peak, onset, and the f0 (YIN median over the loud part), so each call
// can be moved onto its tone and set on its beat. `node remake/tools/kafli5-lag/smidur-a/analyse-takes.mjs`
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decode, SR } from './lib/io.mjs';
import { medianF0, onsetOf, envelope } from './lib/pitch.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const HLJOD = `${ROOT}remake/assets/audio/kafli5/hljod/`;
const sounds = JSON.parse(readFileSync(`${HLJOD}sounds.json`, 'utf8'));
for (const [file, entry] of Object.entries(sounds.files)) {
  const [x] = decode(`${HLJOD}${file}`);
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const on = onsetOf(x, 0.2);
  const env = envelope(x, 441, 441);
  let loud = 0;
  for (const v of env) loud = Math.max(loud, v);
  const above = [...env].map((v, i) => [v, i]).filter(([v]) => v > loud * 0.25).map(([, i]) => i);
  const from = above[0] * 441;
  const to = (above.at(-1) + 1) * 441 + 441;
  const f0 = medianF0(x, from, Math.min(x.length, to), { minHz: 50, maxHz: 3500 });
  const f0b = medianF0(x, from, Math.min(x.length, to), { minHz: 50, maxHz: 3500, size: 4096 });
  console.log(`${file.padEnd(14)} ${(x.length / SR).toFixed(3)}s peak ${peak.toFixed(2)} onset ${on.toFixed(3)}s loud ${(from / SR).toFixed(2)}-${(to / SR).toFixed(2)} f0 ${f0.toFixed(1)} / ${f0b.toFixed(1)} listed ${entry.hz}`);
}
