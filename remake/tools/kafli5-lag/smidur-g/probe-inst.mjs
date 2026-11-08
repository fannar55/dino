// Looks at the band's voices one note at a time (run by hand): level, attack, brightness and the first harmonics, so a voice that is
// thin, buzzy or dull shows in numbers. Writes qa/.../tmp/probe-<voice>.wav for the spectrogram too.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import * as I from './lib/inst.mjs';
import { writeWav, midiHz, SR } from './lib/dsp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../../../qa/remake/kafli5/lag/keppni/smidur-g/tmp');
mkdirSync(OUT, { recursive: true });
const harm = (y, hz, from, to) => {
  const a = Math.round(from * SR); const b = Math.round(to * SR);
  const out = [];
  for (let k = 1; k <= 12; k++) {
    const w = (2 * Math.PI * hz * k) / SR;
    let re = 0; let im = 0;
    for (let i = a; i < b; i++) { const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - a)) / (b - a)); re += y[i] * Math.cos(w * i) * win; im += y[i] * Math.sin(w * i) * win; }
    out.push(Math.hypot(re, im) / ((b - a) / 4));
  }
  const m = Math.max(...out);
  return out.map(v => Math.round(20 * Math.log10(v / m + 1e-9)));
};
const stat = (name, y, hz) => {
  let pk = 0; let e = 0;
  for (const v of y) { pk = Math.max(pk, Math.abs(v)); e += v * v; }
  let t3 = 0;
  for (let i = 0; i < y.length; i++) if (Math.abs(y[i]) > pk * 0.7) { t3 = i / SR; break; }
  console.log(name.padEnd(18), 'peak', pk.toFixed(3), 'rms', Math.sqrt(e / y.length).toFixed(3), 'attack(70%)', (t3 * 1000).toFixed(0), 'ms | h1..12 dB:', harm(y, hz, 0.12, 0.3).join(' '));
};
const voices = [
  ['trumpet mf C5', I.horn('trumpet', midiHz(72), 0.6, 0.6, { seed: 3 }), midiHz(72)],
  ['trumpet ff C5', I.horn('trumpet', midiHz(72), 0.6, 0.95, { seed: 3 }), midiHz(72)],
  ['trumpet harmon', I.horn('trumpet', midiHz(76), 0.6, 0.7, { seed: 3, mute: 'harmon' }), midiHz(76)],
  ['trombone G3', I.horn('trombone', midiHz(55), 0.6, 0.7, { seed: 3 }), midiHz(55)],
  ['trombone plunger', I.horn('trombone', midiHz(55), 0.6, 0.7, { seed: 3, mute: 'plunger', wah: 0.85 }), midiHz(55)],
  ['alto D5', I.horn('alto', midiHz(74), 0.6, 0.6, { seed: 3 }), midiHz(74)],
  ['tenor G4', I.horn('tenor', midiHz(67), 0.6, 0.6, { seed: 3 }), midiHz(67)],
  ['bari G3', I.horn('bari', midiHz(55), 0.6, 0.6, { seed: 3 }), midiHz(55)],
  ['clarinet D6', I.horn('clarinet', midiHz(86), 0.6, 0.7, { seed: 3 }), midiHz(86)],
  ['vibes B5', I.vibes(midiHz(83), 0.6, 0.7, { ring: true }), midiHz(83)],
  ['piano B4', I.piano(midiHz(71), 0.6, 0.5), midiHz(71)],
  ['bass G2', I.bass(midiHz(43), 0.36, 0.6), midiHz(43)],
  ['bass G1', I.bass(midiHz(31), 0.36, 0.6), midiHz(31)],
  ['guitar G69', I.guitarChunk([43, 52, 59], 0.16, 0.6), midiHz(43)],
];
const all = [];
for (const [name, y, hz] of voices) {
  stat(name, y, hz);
  all.push(y, new Float32Array(Math.round(0.3 * SR)));
}
const len = all.reduce((s, y) => s + y.length, 0);
const L = new Float32Array(len);
let o = 0;
for (const y of all) { L.set(y, o); o += y.length; }
writeWav(path.join(OUT, 'probe.wav'), L, L);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(OUT, 'probe.wav'), '-lavfi', 'showspectrumpic=s=1400x600:legend=1:fscale=log:scale=log', path.join(OUT, 'probe.png')]);
for (const kind of ['ride', 'kick', 'snare', 'snap']) {
  const y = kind === 'ride' ? I.ride(1, 2) : kind === 'kick' ? I.kick(1, 2) : kind === 'snare' ? I.snare(1, 2) : I.snap(1, 2);
  let pk = 0; let e = 0;
  for (const v of y) { pk = Math.max(pk, Math.abs(v)); e += v * v; }
  console.log(kind.padEnd(18), 'peak', pk.toFixed(3), 'rms', Math.sqrt(e / y.length).toFixed(3));
}
