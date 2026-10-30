#!/usr/bin/env node
// Söngur Slóeðlu: the child's notes in a recorded song of the new kind (engine/sloedla/v2), read from the dinosaurs' stems. Each
// owned stem is decoded (ffmpeg, mono, 22050 Hz); its note starts are found by spectral flux (the rise of the spectrum from one
// short frame to the next), put on the song's beat grid, and the child's notes are picked by the song's rules (v2/chart.js):
//   barn        on the beats, never closer than 2 beats, strong beats first (an off-beat only when the next beat has nothing),
//               the dinosaur with the fewest notes so far first, then the stronger start; never more than four in a row at
//               two beats (then a breath); none where the stem hardly plays (bleed); none in the first 2.5 s or the last
//               2 beats of a section
//   fullordinn  the same on 8ths, half a beat apart
// The notes of the song's composed parts ('!') and every `pinned` entry of the chart already written stay as they are, and the
// picked notes fall around them.
//
//   node remake/tools/sloedla-stem-chart.mjs <id> [--write]
// prints the notes per dinosaur and what the rules say of them; --write writes engine/sloedla/v2/songs/<id>.chart.js (the song
// imports it; make it first as `export default { barn: [], fullordinn: [] };`).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FIRST_NOTE, ROLES, timelineOf } from '../engine/sloedla/v2/format.js';
import { partNotes } from '../engine/sloedla/v2/parts.js';
import { GAP, chartProblems, sectionChart } from '../engine/sloedla/v2/chart.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RATE = 22050;
const N = 1024; // frame
const HOP = 256;
const NEAR = 0.035; // s: a start this near a slot is on it
const QUIET = 30; // dB under a stem's loud frames: there it is not playing
const RUN = 4; // the child's notes in a row at the shortest gap before a breath (barn)

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/**
 * How strongly a note starts at each moment: spectral flux (Hann frames of 1024, hop 256), the rise of log magnitude from one frame
 * to the next, summed over the bins, and how loud each frame is (`levels`, dB). `values[i]` is for the frame centred at
 * (i * hop + 512) / rate s.
 */
export function onsetStrength(samples, rate = RATE) {
  const win = Float64Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const frames = Math.max(0, Math.floor((samples.length - N) / HOP) + 1);
  const values = new Float32Array(frames);
  const levels = new Float32Array(frames);
  const re = new Float64Array(N), im = new Float64Array(N);
  let last = null;
  for (let f = 0; f < frames; f++) {
    let power = 0;
    for (let i = 0; i < N; i++) { const x = samples[f * HOP + i]; power += x * x; re[i] = x * win[i]; im[i] = 0; }
    levels[f] = 10 * Math.log10(power / N + 1e-12);
    fft(re, im);
    const mags = new Float64Array(N / 2);
    let flux = 0;
    for (let k = 1; k < N / 2; k++) {
      mags[k] = Math.log1p(1000 * Math.hypot(re[k], im[k]));
      if (last) flux += Math.max(0, mags[k] - last[k]);
    }
    values[f] = flux;
    last = mags;
  }
  return { hop: HOP / rate, centre: N / 2 / rate, values, levels };
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;

/**
 * The note starts on the beat grid: for each slot (`slotsPerBeat` a beat from `offset` s, the first beat, to `length` s of song),
 * the strongest flux within 35 ms, kept when it reaches the larger of 0.15 of the stem's 95th percentile and its median plus
 * twice its median absolute deviation, and only where the stem plays: within QUIET dB of its loud frames (its 95th percentile),
 * so another instrument's bleed into a silent stem is no note. Returns [{ beat, strength }], `beat` from the first beat.
 */
export function gridOnsets(strength, { bpm, offset = 0, slotsPerBeat = 1, length }) {
  const { hop, centre, values, levels } = strength;
  const loud = quantile(Float32Array.from(levels).sort(), 0.95);
  const sorted = Float32Array.from(values).sort();
  const median = quantile(sorted, 0.5);
  const deviations = Float32Array.from(values, v => Math.abs(v - median)).sort();
  const threshold = Math.max(0.15 * quantile(sorted, 0.95), median + 2 * quantile(deviations, 0.5), 1e-9);
  const beat = 60 / bpm;
  const onsets = [];
  for (let k = 0; (k / slotsPerBeat) * beat < length; k++) {
    const t = offset + (k / slotsPerBeat) * beat; // in the file
    const from = Math.max(0, Math.ceil((t - NEAR - centre) / hop));
    const to = Math.min(values.length - 1, Math.floor((t + NEAR - centre) / hop));
    let peak = 0;
    let level = -Infinity;
    for (let i = from; i <= to; i++) { peak = Math.max(peak, values[i]); level = Math.max(level, levels[i]); }
    if (peak >= threshold && level >= loud - QUIET) onsets.push({ beat: k / slotsPerBeat, strength: peak });
  }
  return onsets;
}

/**
 * The child's notes from the dinosaurs' note starts: `onsets` and `layers` by owner ({ a: [{ beat, strength, layer? }] },
 * { a: 'piano' }), `fixed` the notes already there ([{ beat, owner }]), `ends` the beats where sections end (no note in the
 * last gap before one). Returns [{ beat, owner, layer }] by beat.
 */
export function pickChart({ onsets, layers, level = 'barn', bpm, length, fixed = [], ends = [] }) {
  const beat = 60 / bpm;
  const step = level === 'fullordinn' ? 0.5 : 1;
  const gap = GAP[level];
  const last = length / beat;
  const at = Object.fromEntries(Object.entries(onsets).map(([owner, list]) => [owner, new Map(list.map(o => [o.beat, o]))]));
  const counts = Object.fromEntries(Object.keys(onsets).map(owner => [owner, fixed.filter(n => n.owner === owner).length]));
  const chosen = [];
  // a breath (barn): after RUN notes in a row at the shortest gap, the next comes later
  const run = b => {
    const before = [...fixed, ...chosen].map(n => n.beat).filter(x => x < b - 1e-9).sort((x, y) => y - x);
    if (!before.length || b - before[0] > gap + 1e-9) return 0;
    let n = 1;
    while (n < before.length && before[n - 1] - before[n] <= gap + 1e-9) n++;
    return n;
  };
  const free = b => ![...fixed, ...chosen].some(n => Math.abs(n.beat - b) < gap - 1e-6) && !ends.some(e => b > e - gap + 1e-9 && b < e)
    && (level === 'fullordinn' || run(b) < RUN);
  const candidates = b => Object.keys(at).filter(owner => at[owner].has(b));
  const weak = b => (level === 'fullordinn' ? !Number.isInteger(b) : b % 2 === 1);
  for (let b = Math.ceil(FIRST_NOTE / beat / step - 1e-9) * step; b < last - 1e-9; b += step) {
    if (!free(b)) continue;
    const here = candidates(b);
    if (!here.length) continue;
    if (weak(b) && free(b + step) && candidates(b + step).length) continue;
    here.sort((x, y) => counts[x] - counts[y] || at[y].get(b).strength - at[x].get(b).strength);
    const owner = here[0];
    chosen.push({ beat: b, owner, layer: at[owner].get(b).layer ?? layers[owner] });
    counts[owner]++;
  }
  return chosen;
}

/** A stem decoded to mono at 22050 Hz. */
function decode(file) {
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(RATE), '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length / 4);
}

/** How long each picked note is: to its owner's next start, from a quarter to one beat. */
function withLengths(notes, onsets) {
  return notes.map(note => {
    const next = onsets[note.owner].find(o => o.beat > note.beat + 1e-9);
    const dur = Math.min(1, Math.max(0.25, next ? next.beat - note.beat : 1));
    return { ...note, dur };
  });
}

async function main(id, write) {
  const songFile = path.join(ROOT, 'remake/engine/sloedla/v2/songs', `${id}.js`);
  const song = (await import(pathToFileURL(songFile).href)).default;
  const { beat, length, sections } = timelineOf(song);
  const ends = sections.map(s => s.startBeat + s.bars * 4);
  const folder = path.join(ROOT, 'remake/assets/audio/sloedla/v2', id);
  const chart = {};
  for (const level of ['barn', 'fullordinn']) {
    const slotsPerBeat = level === 'fullordinn' ? 2 : 1;
    const onsets = {};
    const layers = {};
    for (const layer of song.layers) {
      if (!layer.stem || !layer.owner) continue;
      const found = gridOnsets(onsetStrength(decode(path.join(folder, layer.stem))), { bpm: song.tempo.bpm, offset: song.tempo.offset, slotsPerBeat, length });
      const mine = new Map((onsets[layer.owner] ?? []).map(o => [o.beat, o]));
      for (const o of found) if (!mine.has(o.beat) || mine.get(o.beat).strength < o.strength) mine.set(o.beat, { ...o, layer: layer.id });
      onsets[layer.owner] = [...mine.values()].sort((x, y) => x.beat - y.beat);
      layers[layer.owner] ??= layer.id;
    }
    const pinned = (song.chart?.[level] ?? []).filter(n => n.pinned);
    const marks = [];
    for (const layer of song.layers) {
      if (!layer.part || !layer.owner) continue;
      sections.forEach((_, i) => partNotes(song, layer, i).forEach(n => { if (n.mark) marks.push({ beat: n.beat, owner: layer.owner }); }));
    }
    // the composed parts' '!' notes are fixed at both levels (the grown-ups keep every note the child has)
    const fixed = [...pinned, ...marks];
    const picked = withLengths(pickChart({ onsets, layers, level, bpm: song.tempo.bpm, length, fixed, ends }), onsets);
    chart[level] = [...pinned, ...picked].sort((x, y) => x.beat - y.beat);
    const counts = ROLES.map(r => `${r} ${chart[level].filter(n => n.owner === r).length}`).join(', ');
    console.log(`${level}: ${chart[level].length} stem notes (${counts}); starts found: ${Object.entries(onsets).map(([o, l]) => `${o} ${l.length}`).join(', ')}`);
  }
  const check = { ...song, chart };
  for (const level of ['barn', 'fullordinn']) {
    const notes = sections.flatMap((_, i) => sectionChart(check, i, 'normal', { level }));
    const problems = chartProblems(notes, { level, beat });
    console.log(`${level} as played: ${notes.length} notes (${ROLES.map(r => `${r} ${notes.filter(n => n.role === r).length}`).join(', ')})${problems.length ? `; ${problems.join('; ')}` : '; the rules hold'}`);
  }
  if (write) {
    const line = n => `    { beat: ${n.beat}, owner: '${n.owner}', layer: '${n.layer}'${n.dur !== undefined ? `, dur: ${n.dur}` : ''}${n.pitch !== undefined ? `, pitch: ${n.pitch}` : ''}${n.pinned ? ', pinned: true' : ''} },`;
    const text = `// The child's notes on the stems of ${song.name} (${id}.js), written by remake/tools/sloedla-stem-chart.mjs from the stems' note
// starts. An entry with pinned: true is kept as it is when the tool writes this again; the others are made anew.
export default {
  barn: [
${chart.barn.map(line).join('\n')}
  ],
  fullordinn: [
${chart.fullordinn.map(line).join('\n')}
  ],
};
`;
    const target = path.join(ROOT, 'remake/engine/sloedla/v2/songs', `${id}.chart.js`);
    fs.writeFileSync(target, text);
    console.log(`wrote ${path.relative(ROOT, target)}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [id] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  if (!id) throw new Error('Name a song: node remake/tools/sloedla-stem-chart.mjs <id> [--write]');
  await main(id, process.argv.includes('--write'));
}
