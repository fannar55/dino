// Measures each recording's pitch on its steady part and prints it beside sounds.json's value (run by hand while composing).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { decodeMono, steadyPitch, SR } from './lib/takes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const HLJOD = path.resolve(here, '../../../assets/audio/kafli5/hljod');
const sounds = JSON.parse(readFileSync(path.join(HLJOD, 'sounds.json'), 'utf8'));
for (const [file, info] of Object.entries(sounds.files)) {
  const x = decodeMono(path.join(HLJOD, file));
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const p = steadyPitch(x, { fmin: 55, fmax: 3200 });
  const lo = steadyPitch(x, { fmin: 55, fmax: 900 });
  console.log(
    file.padEnd(16),
    `listed ${String(info.hz).padStart(8)}`,
    `steady ${p.hz ? p.hz.toFixed(1).padStart(7) : '   none'}`,
    p.hz ? `[${p.from.toFixed(2)}-${p.to.toFixed(2)} s, ${p.frames} fr, clean ${p.clean.toFixed(2)}, spread ${p.spread.toFixed(0)}c]` : '',
    `| <900: ${lo.hz ? lo.hz.toFixed(1) : 'none'}${lo.hz ? ` [${lo.from.toFixed(2)}-${lo.to.toFixed(2)}]` : ''}`,
    `| ${(x.length / SR).toFixed(2)} s peak ${peak.toFixed(2)}`,
  );
}
