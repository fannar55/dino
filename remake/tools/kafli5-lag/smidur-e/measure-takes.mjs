// Measures every recorded take's own pitch on its steady part (and its onset), printing a table to compare with sounds.json.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { decode, SR } from './lib/io.mjs';
import { steady, track, median } from './lib/pitch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const HLJOD = join(here, '../../../assets/audio/kafli5/hljod');
const sounds = JSON.parse(readFileSync(join(HLJOD, 'sounds.json'), 'utf8'));

const note = hz => {
  const m = 69 + 12 * Math.log2(hz / 440);
  const r = Math.round(m);
  const n = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][((r % 12) + 12) % 12];
  return `${n}${Math.floor(r / 12) - 1}${(m - r) >= 0 ? '+' : ''}${Math.round((m - r) * 100)}`;
};

for (const [file, e] of Object.entries(sounds.files)) {
  const [x] = decode(join(HLJOD, file));
  const s = steady(x, { fmin: 40, fmax: 4000 });
  const fr = track(x, { fmin: 40, fmax: 4000 });
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  // onset: first sample over 10% of the peak
  let on = 0;
  while (on < x.length && Math.abs(x[on]) < peak * 0.1) on++;
  const loud = fr.reduce((m, g) => Math.max(m, g.rms), 0);
  const voiced = fr.filter(f => f.hz > 0 && f.ap < 0.25 && f.rms > 0.05 * loud);
  const spread = voiced.length ? `${Math.round(Math.min(...voiced.map(f => f.hz)))}-${Math.round(Math.max(...voiced.map(f => f.hz)))}` : '-';
  console.log(
    file.padEnd(16),
    `json ${String(e.hz).padEnd(8)}`,
    s ? `steady ${s.hz.toFixed(1).padStart(7)} ${note(s.hz).padEnd(8)} ${s.from.toFixed(2)}-${s.to.toFixed(2)}s n${s.frames} cl${s.clarity.toFixed(2)}` : 'steady none',
    `len ${(x.length / SR).toFixed(2)} on ${(on / SR).toFixed(3)} peak ${peak.toFixed(2)} voiced ${spread}`,
  );
}
