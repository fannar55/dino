// Checks smidur-c's pitched instruments by measurement (we cannot listen): each note's median pitch against equal temperament,
// how steady it is, and its level. `node test-instruments.mjs` prints a table and writes test WAVs to the output folder.
import { SR, hz, medianPitch, cents, writeWav } from './dsp.mjs';
import { fiddle, whistle, pluck, harp, bass, strum, drone, strings, bodhran } from './instruments.mjs';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = new URL('../../../../qa/remake/kafli5/lag/keppni/smidur-c/test/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const rows = [];
function check(name, y, f, from = 0.15, to = 0.6) {
  const p = medianPitch(y, Math.round(from * SR), Math.round(to * SR), f * 0.6, f * 1.6, 0.5);
  let pk = 0, ss = 0; for (const v of y) { pk = Math.max(pk, Math.abs(v)); ss += v * v; }
  const c = p.hz ? cents(p.hz, f) : NaN;
  rows.push(`${name.padEnd(22)} ${f.toFixed(1).padStart(8)} Hz  got ${p.hz ? p.hz.toFixed(2).padStart(8) : '   none '}  ${Number.isNaN(c) ? '  --' : c.toFixed(1).padStart(6)} c  spread ${p.hz ? cents(p.hi, p.lo).toFixed(1) : '-'} c  frames ${p.frames}  peak ${pk.toFixed(3)} rms ${Math.sqrt(ss / y.length).toFixed(4)}`);
  return c;
}
const all = [];
for (const n of ['G3', 'C4', 'F4', 'A4', 'C5', 'F5', 'A5', 'C6']) {
  const f = hz(n);
  const y = fiddle([{ t: 0, d: 0.8, f, v: 0.7 }], { vibCents: 0, seed: 3 });
  check(`fiddle ${n}`, y, f, 0.25, 0.75); all.push(y);
}
for (const n of ['F2', 'C3', 'F3']) {
  const f = hz(n);
  const y = fiddle([{ t: 0, d: 0.8, f, v: 0.7 }], { vibCents: 0, seed: 3, cello: true });
  check(`cello ${n}`, y, f, 0.25, 0.75); all.push(y);
}
{ // a fiddle phrase with vibrato, slurs and spiccato
  const ph = [
    { t: 0, d: 0.24, f: hz('F4'), v: 0.7 }, { t: 0.24, d: 0.24, f: hz('A4'), v: 0.6, slur: true }, { t: 0.48, d: 0.24, f: hz('C5'), v: 0.7 },
    { t: 0.72, d: 0.9, f: hz('F5'), v: 0.8 }, { t: 1.7, d: 0.2, f: hz('D5'), v: 0.7, spic: true }, { t: 1.95, d: 0.2, f: hz('C5'), v: 0.7, spic: true },
  ];
  const y = fiddle(ph, { seed: 4 }); all.push(y);
  check('fiddle phrase F5 vib', y, hz('F5'), 0.95, 1.55);
}
for (const n of ['F5', 'A5', 'C6', 'D6', 'F6']) {
  const f = hz(n);
  const y = whistle([{ t: 0, d: 0.7, f, v: 0.8, orn: 'cut' }], { seed: 2 });
  check(`whistle ${n}`, y, f, 0.1, 0.6); all.push(y);
}
for (const n of ['F2', 'C3', 'A3', 'C4', 'F4', 'C5', 'A5', 'D6']) {
  const f = hz(n);
  const y = harp({ f, seed: 5 });
  check(`harp ${n}`, y, f, 0.1, 0.6); all.push(y);
}
for (const n of ['Bb1', 'C2', 'D2', 'F2', 'A2', 'C3']) {
  const f = hz(n);
  const y = bass({ f, d: 0.8, seed: 6 });
  check(`bass ${n}`, y, f, 0.08, 0.5); all.push(y);
}
{
  const y = strum([hz('F2'), hz('C3'), hz('F3'), hz('A3'), hz('C4'), hz('F4')], { seed: 7 }); all.push(y);
  const d = drone([hz('F2'), hz('C3'), hz('F3')], { dur: 2, attack: 0.3 }); all.push(d);
  check('drone F2 (root)', d, hz('F2'), 0.5, 1.5);
  const s = strings([hz('F4')], { dur: 1.5 }); all.push(s);
  check('strings F4', s, hz('F4'), 0.6, 1.1);
  for (const tone of [0, 0.5, 1]) all.push(bodhran({ tone, seed: 9 }));
}
console.log(rows.join('\n'));
// one file with every test sound in a row, half a second apart
let total = 0; for (const y of all) total += y.length + SR / 2;
const L = new Float32Array(total), R = new Float32Array(total);
let at = 0; for (const y of all) { let pk = 0; for (const v of y) pk = Math.max(pk, Math.abs(v)); for (let i = 0; i < y.length; i++) { L[at + i] = R[at + i] = 0.5 * y[i] / (pk || 1); } at += y.length + SR / 2; }
writeWav(fileURLToPath(new URL('instruments.wav', OUT)), [L, R]);
