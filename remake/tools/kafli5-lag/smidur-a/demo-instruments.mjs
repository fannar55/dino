// Renders each instrument alone and measures it (peak, NaN, YIN f0 against the asked pitch, length) so the voices can be checked
// without ears. Writes qa/remake/kafli5/lag/keppni/smidur-a/demo/instruments.wav and its spectrogram.
import { fileURLToPath } from 'node:url';
import { SR, writeWav, ffmpeg } from './lib/io.mjs';
import { hz, seedOf } from './lib/dsp.mjs';
import * as I from './lib/instruments.mjs';
import { medianF0 } from './lib/pitch.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const OUT = `${ROOT}qa/remake/kafli5/lag/keppni/smidur-a/demo/`;
const tests = [
  ['strings vln A4', () => I.strings({ f: hz('A4'), dur: 1.5, vel: 0.7, seed: 1 }), hz('A4')],
  ['strings vc G3', () => I.strings({ f: hz('G3'), dur: 1.5, vel: 0.7, seed: 2, section: 'vc' }), hz('G3')],
  ['strings tremolo D5', () => I.strings({ f: hz('D5'), dur: 1.5, vel: 0.5, seed: 3, tremolo: 7 }), hz('D5')],
  ['staccato vln C6', () => I.strings({ f: hz('C6'), dur: 0.12, vel: 0.8, seed: 4, attack: 0.012, release: 0.12, vibDepth: 0, voices: 4, bite: 1.5 }), hz('C6')],
  ['pizz F2', () => I.pizz({ f: hz('F2'), vel: 0.8, seed: 5 }), hz('F2')],
  ['pizz C4', () => I.pizz({ f: hz('C4'), vel: 0.8, seed: 6 }), hz('C4')],
  ['harp F4', () => I.harp({ f: hz('F4'), vel: 0.8, seed: 7 }), hz('F4')],
  ['horn C4', () => I.brass({ f: hz('C4'), dur: 1.2, vel: 0.8, seed: 8, kind: 'horn' }), hz('C4')],
  ['trumpet A4', () => I.brass({ f: hz('A4'), dur: 1.0, vel: 0.8, seed: 9, kind: 'trumpet' }), hz('A4')],
  ['trombone F3', () => I.brass({ f: hz('F3'), dur: 1.0, vel: 0.8, seed: 10, kind: 'trombone' }), hz('F3')],
  ['tuba F2', () => I.brass({ f: hz('F2'), dur: 0.8, vel: 0.8, seed: 11, kind: 'tuba' }), hz('F2')],
  ['flute D5', () => I.wind({ f: hz('D5'), dur: 1.2, vel: 0.7, seed: 12, kind: 'flute' }), hz('D5')],
  ['piccolo D6', () => I.wind({ f: hz('D6'), dur: 1.0, vel: 0.7, seed: 13, kind: 'piccolo' }), hz('D6')],
  ['clarinet A4', () => I.wind({ f: hz('A4'), dur: 1.0, vel: 0.7, seed: 14, kind: 'clarinet' }), hz('A4')],
  ['oboe G5', () => I.wind({ f: hz('G5'), dur: 1.0, vel: 0.7, seed: 15, kind: 'oboe' }), hz('G5')],
  ['bassoon F3', () => I.wind({ f: hz('F3'), dur: 1.0, vel: 0.7, seed: 16, kind: 'bassoon' }), hz('F3')],
  ['timpani F2', () => I.timpani({ f: hz('F2'), vel: 0.8, seed: 17 }), hz('F2')],
  ['gran cassa', () => I.granCassa({ vel: 0.8, seed: 18 }), 0],
  ['snare', () => I.snare({ vel: 0.8, seed: 19 }), 0],
  ['cymbal', () => I.cymbal({ vel: 0.7, seed: 20 }), 0],
  ['cymbal swell', () => I.cymbalSwell({ dur: 2, vel: 0.7, seed: 21 }), 0],
  ['triangle', () => I.triangle({ vel: 0.7 }), 0],
  ['glock C6', () => I.glock({ f: hz('C6'), vel: 0.7, seed: 22 }), hz('C6')],
  ['woodblock', () => I.woodblock({ vel: 0.7, seed: 23 }), 0],
  ['tambourine', () => I.tambourine({ vel: 0.7, seed: 24 }), 0],
  ['shaker', () => I.shaker({ vel: 0.7, seed: 25 }), 0],
];
const gap = Math.round(0.3 * SR);
const parts = [];
let total = 0;
for (const [name, make, f0] of tests) {
  const t0 = Date.now();
  const x = make();
  const ms = Date.now() - t0;
  let peak = 0;
  let bad = 0;
  for (const v of x) { if (!Number.isFinite(v)) bad++; peak = Math.max(peak, Math.abs(v)); }
  let pitch = '';
  if (f0) {
    const m = medianF0(x, Math.round(0.05 * SR), Math.min(x.length, Math.round(0.6 * SR)), { minHz: 40, maxHz: 3000, floor: 0.0005 });
    pitch = `f0 ${m.toFixed(1)} want ${f0.toFixed(1)} (${(1200 * Math.log2(m / f0)).toFixed(0)} c)`;
  }
  console.log(`${name.padEnd(20)} ${(x.length / SR).toFixed(2)}s peak ${peak.toFixed(3)} ${bad ? `NaN ${bad}` : ''} ${pitch} ${ms}ms`);
  parts.push(x);
  total += x.length + gap;
}
const L = new Float32Array(total);
let o = 0;
for (const x of parts) { L.set(x.map(v => v * 0.8), o); o += x.length + gap; }
writeWav(`${OUT}instruments.wav`, [L, L]);
ffmpeg(['-i', `${OUT}instruments.wav`, '-lavfi', 'showspectrumpic=s=1600x600:legend=1:scale=log:fscale=lin:stop=10000', `${OUT}instruments-spectrum.png`]);
void seedOf;
