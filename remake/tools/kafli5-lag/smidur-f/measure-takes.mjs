// Measures every chapter-5 take's own pitch on its steady part (sounds.json's hz is not trusted), its heard onset and length.
// node remake/tools/kafli5-lag/smidur-f/measure-takes.mjs [--track name]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { decode, SR } from './lib/io.mjs';
import { steadyPitch, track, noteName } from './lib/pitch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const HLJOD = join(here, '../../../assets/audio/kafli5/hljod');

/** Time (s) where a take's 5 ms envelope first reaches `db` under its peak: its heard attack. */
export function onsetOf(x, db = -12) {
  const w = Math.round(0.005 * SR);
  let peak = 0;
  const env = [];
  for (let s = 0; s < x.length; s += w) {
    let m = 0;
    for (let i = s; i < Math.min(x.length, s + w); i++) m = Math.max(m, Math.abs(x[i]));
    env.push(m);
    peak = Math.max(peak, m);
  }
  const thr = peak * 10 ** (db / 20);
  const k = env.findIndex(v => v >= thr);
  return (k * w) / SR;
}

export function measureAll() {
  const sounds = JSON.parse(readFileSync(join(HLJOD, 'sounds.json'), 'utf8')).files;
  const out = {};
  for (const name of Object.keys(sounds)) {
    const [x] = decode(join(HLJOD, name));
    const low = name.startsWith('horn-2') ? 40 : name.startsWith('turtles') || name.startsWith('grazers') || name.startsWith('horn') ? 50 : 80;
    const st = steadyPitch(x, { fmin: low, fmax: 3500 });
    out[name] = { listed: sounds[name].hz, steady: st, onset: onsetOf(x), seconds: x.length / SR };
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ti = process.argv.indexOf('--track');
  if (ti > 0) {
    const name = process.argv[ti + 1];
    const [x] = decode(join(HLJOD, name));
    for (const f of track(x, { fmin: 40, fmax: 3500 })) {
      if (f.rms > 0.005) console.log(f.t.toFixed(3), f.hz.toFixed(1).padStart(8), f.clarity.toFixed(2), f.rms.toFixed(3), noteName(f.hz));
    }
  } else {
    const all = measureAll();
    for (const [name, m] of Object.entries(all)) {
      const s = m.steady;
      console.log(
        name.padEnd(14),
        `listed ${String(m.listed ?? '-').padStart(8)}`,
        s ? `steady ${s.hz.toFixed(1).padStart(7)} ${noteName(s.hz).padEnd(8)} ${s.from.toFixed(2)}-${s.to.toFixed(2)}s n=${s.frames} ±${s.spread.toFixed(0)}c` : 'no pitch',
        `onset ${m.onset.toFixed(3)} len ${m.seconds.toFixed(2)}`,
      );
    }
  }
}
