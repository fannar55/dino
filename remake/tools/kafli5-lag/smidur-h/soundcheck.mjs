// Sound check: every forest instrument and call variant alone, in a row, 0.6 s apart, to look at (I cannot hear):
// node remake/tools/kafli5-lag/smidur-h/soundcheck.mjs → qa/.../smidur-h/work/soundcheck.{wav,png} and a list of what is where.
process.env.SMIDUR_H_NO_MAIN = '1';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeWav, ffmpeg, SR } from './lib/io.mjs';
import { addInto, peak } from './lib/dsp.mjs';
import * as F from './lib/forest.mjs';
import { hz } from './score.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../../../../qa/remake/kafli5/lag/keppni/smidur-h/work');
const R = await import('./render.mjs');
const items = [
  ['stomp', () => F.stomp({ seed: 3 })], ['stomp big', () => F.stomp({ seed: 3, size: 1.35 })], ['clap', () => F.clap({ seed: 4 })[0]],
  ['snap', () => F.snap({ seed: 5 })], ['patsch', () => F.patsch({ seed: 6 })], ['stick', () => F.stick({ seed: 7 })], ['stones', () => F.stones({ seed: 8 })],
  ['log G4', () => F.logMarimba({ f: hz('G4'), seed: 9 })], ['shell A2', () => F.shell({ f: hz('A2'), seed: 1 })], ['bass G2', () => F.logBass({ f: hz('G2'), dur: 0.5 })],
  ['bass E2', () => F.logBass({ f: hz('E2'), dur: 0.5 })], ['drop B5', () => F.drop({ f: hz('B5') })], ['splash', () => F.splash({ seed: 2 })],
  ['leaves', () => F.leaves({ seed: 2 })], ['bbKick', () => F.bbKick({})], ['bbSnare', () => F.bbSnare({})], ['bbHat', () => F.bbHat({})],
  ['lipPop G3', () => F.lipPop({ f: hz('G3') })], ['reed B3', () => F.reed({ f: hz('B3'), dur: 0.5 })], ['whistle E5', () => F.whistle({ f0: hz('E5') * 0.94, f1: hz('E5'), dur: 0.5, glide: 0.06 })],
  ['moo G3', () => R.renderCallForCheck({ group: 'grazers', dur: 0.5 })], ['moo chop', () => R.renderCallForCheck({ group: 'grazers', dur: 0.3, chop: true })],
  ['turtle A3', () => R.renderCallForCheck({ group: 'turtles', dur: 0.5 })], ['ribbit B6', () => R.renderCallForCheck({ group: 'frogs', dur: 0.5 })],
  ['frog hat', () => R.renderCallForCheck({ group: 'frogs', role: 'hat' })], ['lizard D6', () => R.renderCallForCheck({ group: 'lizards', dur: 0.5 })],
  ['gecko D7', () => R.renderCallForCheck({ group: 'lizards', dur: 0.12, gecko: true })], ['curlew E6', () => R.renderCallForCheck({ group: 'flyers', dur: 0.5 })],
  ['horn G3', () => R.renderHornForCheck({ f: hz('G3'), dur: 0.5 })],
];
const gap = Math.round(0.6 * SR);
const x = new Float32Array(gap * items.length + SR);
items.forEach(([name, f], k) => { const b = f(); addInto(x, b, k * gap, 0.8 / Math.max(1e-9, peak(b))); });
writeWav(join(OUT, 'soundcheck.wav'), [x]);
ffmpeg(['-v', 'error', '-y', '-i', join(OUT, 'soundcheck.wav'), '-lavfi', 'showspectrumpic=s=1800x700:legend=1:fscale=log:stop=12000:scale=log', join(OUT, 'soundcheck.png')]);
console.log(items.map(([n], k) => `${(k * 0.6).toFixed(1)}s ${n}`).join(' | '));
