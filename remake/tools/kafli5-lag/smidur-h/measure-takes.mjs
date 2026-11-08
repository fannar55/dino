// Step 1: measure each recording's pitch on its steady part (sounds.json's hz is wrong for several), print a track summary.
// node remake/tools/kafli5-lag/smidur-h/measure-takes.mjs [--verbose]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decode } from './lib/io.mjs';
import { track, steady } from './lib/pitch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../../..');
const hljod = join(root, 'remake/assets/audio/kafli5/hljod');
const sounds = JSON.parse(readFileSync(join(hljod, 'sounds.json'), 'utf8'));
const verbose = process.argv.includes('--verbose');
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const name = hz => {
  const m = 69 + 12 * Math.log2(hz / 440);
  const r = Math.round(m);
  return `${NOTES[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}${m - r >= 0 ? '+' : ''}${Math.round((m - r) * 100)}c`;
};

const out = {};
for (const file of Object.keys(sounds.files)) {
  const { ch } = decode(join(hljod, file));
  const x = ch[0];
  const fmax = /frogs|lizards|flyers/.test(file) ? 4000 : 1600;
  const fr = track(x, 44100, { size: 2048, hop: 256, fmin: 50, fmax });
  const st = steady(fr, { minClarity: 0.55, band: 35 });
  let peak = 0, peakAt = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > peak) { peak = Math.abs(x[i]); peakAt = i / 44100; }
  // onset: first sample over 10% of peak
  let on = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > peak * 0.1) { on = i / 44100; break; }
  out[file] = { listed: sounds.files[file].hz, seconds: +(x.length / 44100).toFixed(3), onset: +on.toFixed(3), peakAt: +peakAt.toFixed(3),
    steady: st ? { hz: +st.hz.toFixed(2), t0: +st.t0.toFixed(3), t1: +st.t1.toFixed(3), frames: st.n } : null };
  console.log(file.padEnd(14), 'listed', String(sounds.files[file].hz).padEnd(8), 'steady', st ? `${st.hz.toFixed(1)} Hz ${name(st.hz)} ${st.t0.toFixed(2)}-${st.t1.toFixed(2)}s (${st.n} fr)` : 'none',
    'len', (x.length / 44100).toFixed(2), 'onset', on.toFixed(3));
  if (verbose) {
    const line = fr.filter((_, i) => i % 4 === 0).map(f => (f.clarity > 0.55 && f.hz ? `${f.t.toFixed(2)}:${f.hz.toFixed(0)}` : `${f.t.toFixed(2)}:-`)).join(' ');
    console.log('   ', line);
  }
}
writeFileSync(join(here, 'takes.json'), JSON.stringify(out, null, 1) + '\n');
