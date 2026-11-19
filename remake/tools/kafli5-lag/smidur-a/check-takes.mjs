// Moves every take onto its tone and measures the result (YIN median per segment, cents off the tone, onset).
import { SR } from './lib/io.mjs';
import { TAKES, take } from './lib/takes.mjs';
import { medianF0, centsToPitchClass } from './lib/pitch.mjs';
import { hz } from './lib/dsp.mjs';

const extra = { 'horn-1': ['F3', 'G3', 'A3', 'C4', 'D4', 'F4'] };
for (const name of Object.keys(TAKES)) {
  const targets = extra[name] ? extra[name].map(hz) : [null];
  for (const target of targets) {
    const t = take(name, target);
    const segs = [];
    let at = 0;
    for (let i = 0; i < TAKES[name].segs.length; i++) {
      const [a, b] = TAKES[name].segs[i];
      const len = Math.round(((b - a) * SR) / t.rates[i]);
      const m = medianF0(t.x, at + 512, Math.min(t.x.length, at + len), { minHz: 50, maxHz: 3800, floor: 0.002 });
      segs.push(`${m.toFixed(1)} (${m ? centsToPitchClass(m, t.hz).toFixed(0) : '?'} c)`);
      at += len;
    }
    console.log(`${name.padEnd(10)} -> ${t.hz.toFixed(2)} Hz  rates ${t.rates.map(r => r.toFixed(3)).join(',')}  len ${(t.x.length / SR).toFixed(2)}s onset ${(t.onset / SR).toFixed(3)}s  f0 ${segs.join(' | ')}`);
  }
}
