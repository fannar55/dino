// smidur-b: renders "Skrúðganga skógarins", the jungle-parade entry of chapter 5's song contest, from scratch and deterministically.
//   node remake/tools/kafli5-lag/smidur-b/render.mjs [--fast]   (--fast: no mp3s, no pictures; the checks only)
// Writes qa/remake/kafli5/lag/keppni/smidur-b/: mix.mp3, stems/{pad,bass,beat,lead,animals}.mp3, song.json, spectrogram.png,
// waveform.png, checks.json. The stems are the mix before its master; their sum is the song.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { SR, Bus, fdnReverb, pingPong, hshelf, filt, biquad } from './dsp.mjs';
import { buildScore, SECTIONS, BPM, SPB, SEC, END_BEAT, LOOP, TONE_MIDI } from './score.mjs';
import { lufs, truePeakDb, limit, glue, sectionMeasures } from './meter.mjs';
import { checks } from './checks.mjs';
import { TAKES } from './voices.mjs';

const OUT = 'qa/remake/kafli5/lag/keppni/smidur-b';
const FAST = process.argv.includes('--fast');
const STEMS = ['pad', 'bass', 'beat', 'lead', 'animals'];
const ROOM = {
  pad: { rt60: 2.8, damp: 4200, pre: 0.025, size: 1.15, wet: 1 },
  bass: { rt60: 1.2, damp: 2500, pre: 0.01, size: 0.8, wet: 0.8 },
  beat: { rt60: 2.0, damp: 5000, pre: 0.015, size: 1.1, wet: 1 },
  lead: { rt60: 2.3, damp: 4800, pre: 0.02, size: 1.0, wet: 1 },
  animals: { rt60: 1.9, damp: 5200, pre: 0.02, size: 0.95, wet: 1 },
};
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

mkdirSync(join(OUT, 'stems'), { recursive: true });
const { events, cues, chorusMelody } = buildScore();
log(`${events.length} events, ${cues.length} cues`);

const LEN = Math.round(END_BEAT * SPB + 3.6 * SR);
const stems = {};
for (const name of STEMS) {
  const dry = new Bus(LEN), hall = new Bus(LEN);
  const echoSend = name === 'lead' || name === 'animals' ? new Bus(LEN) : null;
  let count = 0;
  for (const e of events) {
    if (e.stem !== name) continue;
    const at = Math.round(e.beat * SPB);
    const s = e.make();
    const add = bus => (s instanceof Float32Array ? bus.add(s, at, e.g, e.pan) : bus.add2(s.L, s.R, at, e.g));
    add(dry);
    if (e.hall > 0) (s instanceof Float32Array ? hall.add(s, at, e.g * e.hall, e.pan) : hall.add2(s.L, s.R, at, e.g * e.hall));
    if (echoSend && e.echo > 0) (s instanceof Float32Array ? echoSend.add(s, at, e.g * e.echo, e.pan) : echoSend.add2(s.L, s.R, at, e.g * e.echo));
    count++;
  }
  if (echoSend) {
    const echo = pingPong(echoSend, { d: 0.75 * SEC, fb: 0.4, lpf: 3200 });
    dry.mix(echo, 1);
    hall.mix(echo, 0.6);
  }
  const wet = fdnReverb(hall, ROOM[name]);
  dry.mix(wet, ROOM[name].wet);
  stems[name] = dry;
  log(`${name}: ${count} events, peak ${dry.peak().toFixed(3)}`);
}

// the stems' common level: their sum peaks at -3 dBFS (unmastered, no clipping anywhere)
const sum = new Bus(LEN);
for (const n of STEMS) sum.mix(stems[n]);
const k = 10 ** (-3 / 20) / sum.peak();
for (const n of STEMS) stems[n].scale(k);
sum.scale(k);
// trim the silence after the last hit's ring (no fade: it has rung out), with a 20 ms guard at the very end
let end = LEN;
const quiet = 10 ** (-72 / 20);
while (end > END_BEAT * SPB + SR && Math.abs(sum.L[end - 1]) < quiet && Math.abs(sum.R[end - 1]) < quiet) end--;
end = Math.min(LEN, end + Math.round(0.05 * SR));
log(`length ${(end / SR).toFixed(2)} s`);
const cut = b => { const o = new Bus(end); o.L.set(b.L.subarray(0, end)); o.R.set(b.R.subarray(0, end)); return o; };
for (const n of STEMS) stems[n] = cut(stems[n]);
let mix = cut(sum);
const pre = { L: Float32Array.from(mix.L), R: Float32Array.from(mix.R) };

// ---------- master: tame the air, glue, set the loudness, limit the true peak ----------
for (const ch of [mix.L, mix.R]) { hshelf(ch, 8500, -3); filt(ch, biquad('lp', 15000, 0.7)); }
glue(mix.L, mix.R, { thresholdDb: -20, ratio: 1.7 });
const TARGET = -16, CEIL = -1.7;
let gain = 0, lim = null, meas = null;
const base = { L: Float32Array.from(mix.L), R: Float32Array.from(mix.R) };
for (let it = 0; it < 4; it++) {
  const L = Float32Array.from(base.L), R = Float32Array.from(base.R);
  const m0 = lufs(L, R).integrated;
  if (it === 0) gain = TARGET - m0;
  const g = 10 ** (gain / 20);
  for (let i = 0; i < L.length; i++) { L[i] *= g; R[i] *= g; }
  lim = limit(L, R, { ceilingDb: CEIL });
  meas = lufs(L, R);
  log(`master pass ${it}: gain ${gain.toFixed(2)} dB, limiter ${lim.maxReductionDb.toFixed(2)} dB, ${meas.integrated.toFixed(2)} LUFS`);
  mix = { L, R };
  if (Math.abs(meas.integrated - TARGET) < 0.15) break;
  gain += TARGET - meas.integrated;
}
const tp = truePeakDb(mix.L, mix.R);
log(`mix: ${meas.integrated.toFixed(2)} LUFS, true peak ${tp.toFixed(2)} dBTP`);

// ---------- files ----------
function wav(path, L, R) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 8);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 8, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34); buf.write('data', 36); buf.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) { buf.writeFloatLE(L[i], 44 + i * 8); buf.writeFloatLE(R[i], 48 + i * 8); }
  writeFileSync(path, buf);
}
const ff = args => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { maxBuffer: 1 << 26, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}: ${r.stderr}`);
  return r;
};
const mp3 = (src, dst) => ff(['-i', src, '-c:a', 'libmp3lame', '-b:a', '192k', '-ar', '44100', '-ac', '2', dst]);
const ebur = path => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const s = r.stderr;
  const I = +(s.match(/I:\s+(-?[\d.]+) LUFS/g)?.pop().match(/-?[\d.]+/)[0]);
  const P = +(s.match(/Peak:\s+(-?[\d.]+) dBFS/g)?.pop().match(/-?[\d.]+/)[0]);
  return { lufs: I, truePeak: P };
};

const tmp = join(OUT, 'tmp');
mkdirSync(tmp, { recursive: true });
let loud = { lufs: +meas.integrated.toFixed(2), truePeak: +tp.toFixed(2) };
const stemLoud = {};
if (!FAST) {
  wav(join(tmp, 'mix.wav'), mix.L, mix.R);
  mp3(join(tmp, 'mix.wav'), join(OUT, 'mix.mp3'));
  loud = ebur(join(OUT, 'mix.mp3'));
  log(`mix.mp3 (ffmpeg ebur128): ${loud.lufs} LUFS, true peak ${loud.truePeak} dBTP`);
  for (const n of STEMS) {
    wav(join(tmp, `${n}.wav`), stems[n].L, stems[n].R);
    mp3(join(tmp, `${n}.wav`), join(OUT, 'stems', `${n}.mp3`));
    stemLoud[n] = ebur(join(OUT, 'stems', `${n}.mp3`));
    log(`stems/${n}.mp3: ${stemLoud[n].lufs} LUFS, true peak ${stemLoud[n].truePeak} dBTP`);
  }
  const W = Math.round(end / SR * 20);
  ff(['-i', join(OUT, 'mix.mp3'), '-lavfi', `showspectrumpic=s=${Math.min(3000, W)}x600:legend=1:fscale=log:color=intensity:stop=12000`, join(OUT, 'spectrogram.png')]);
  ff(['-i', join(OUT, 'mix.mp3'), '-filter_complex', `showwavespic=s=${Math.min(3000, W)}x400:split_channels=0:colors=0x2c7fb8`, '-frames:v', '1', join(OUT, 'waveform.png')]);
}
rmSync(tmp, { recursive: true, force: true });

// ---------- the brief's measures and checks ----------
const sec = SECTIONS.map(s => ({ ...s, beats: s.name === 'Ending' ? (end / SPB) - s.startBeat : s.beats }));
const perSection = sectionMeasures(pre.L, pre.R, sec, SPB);
const perSectionMastered = sectionMeasures(mix.L, mix.R, sec, SPB);
const stemSum = (() => {
  let d = 0;
  for (let i = 0; i < end; i++) {
    let l = 0, r = 0;
    for (const n of STEMS) { l += stems[n].L[i]; r += stems[n].R[i]; }
    d = Math.max(d, Math.abs(l - pre.L[i]), Math.abs(r - pre.R[i]));
  }
  return d;
})();
const stemPeaks = Object.fromEntries(STEMS.map(n => [n, +(20 * Math.log10(stems[n].peak())).toFixed(2)]));
const loopSeam = (() => {
  // the loop's seam: what plays in the bar before the loop (its tails enter the loop's start) against the loop's last bar (whose
  // tails would): equal, the jump from the loop's end back to its start is seamless. dB of the largest difference.
  const a = Math.round(LOOP.startBeat * SPB), b = Math.round((LOOP.startBeat + LOOP.beats) * SPB), bar = 4 * SPB;
  const o = {};
  for (const n of STEMS) {
    let m = 0;
    for (let i = 1; i <= bar; i++) m = Math.max(m, Math.abs(stems[n].L[a - i] - stems[n].L[b - i]), Math.abs(stems[n].R[a - i] - stems[n].R[b - i]));
    o[n] = +(20 * Math.log10(m + 1e-12)).toFixed(1);
  }
  return o;
})();
const pitch = checks({ stems, chorusMelody });
const report = {
  bpm: BPM, samplesPerBeat: SPB, lengthSec: +(end / SR).toFixed(3), loudnessJs: { lufs: +meas.integrated.toFixed(2), truePeak: +tp.toFixed(2), shortTermMax: +meas.shortTermMax.toFixed(2) },
  loudness: loud, stemLoudness: stemLoud, stemPeaksDbfs: stemPeaks, stemSumError: stemSum, limiterMaxReductionDb: +lim.maxReductionDb.toFixed(2),
  loopSeamDiffDb: loopSeam, perSection, perSectionMastered, ...pitch,
};
writeFileSync(join(OUT, 'checks.json'), JSON.stringify(report, null, 2) + '\n');

// ---------- song.json ----------
const sources = [
  ...new Set(Object.values(TAKES).flatMap(g => Object.values(g).map(t => t.file))),
  'marimba.mp3', 'horn-1.mp3', 'horn-2.mp3',
].map(f => {
  const licence = { 'grazers-3.mp3': 'CC0 1.0', 'turtles-2.mp3': 'ElevenLabs sound generation, made for this game', 'turtles-1.mp3': 'ElevenLabs sound generation, made for this game',
    'frogs-5.mp3': 'CC0 1.0', 'frogs-1.mp3': 'ElevenLabs sound generation, made for this game', 'frogs-2.mp3': 'ElevenLabs sound generation, made for this game',
    'lizards-2.mp3': 'ElevenLabs sound generation, made for this game', 'lizards-3.mp3': 'CC0 1.0', 'flyers-1.mp3': 'ElevenLabs sound generation, made for this game',
    'flyers-3.mp3': 'CC BY 4.0, "Curlew .wav" by Benboncan', 'marimba.mp3': 'CC0 1.0', 'horn-1.mp3': 'CC0 1.0', 'horn-2.mp3': 'CC0 1.0' }[f];
  return `remake/assets/audio/kafli5/hljod/${f} (${licence})`;
});
const song = {
  slot: 'smidur-b',
  name: 'Skrúðganga skógarins',
  style: 'A rhythm-driven cinematic jungle parade: synthesized taiko, toms, frame and log drums, a 3+3+2 low-string ostinato, brass stabs and a shouted HEY/HO answering the animal choir.',
  bpm: BPM, beatZeroSec: 0, key: 'F major', lengthSec: +(end / SR).toFixed(3),
  sections: SECTIONS.map(s => ({ name: s.name, nameIs: s.nameIs, startBeat: s.startBeat, beats: s.beats, startSec: +(s.startBeat * SEC).toFixed(3), feature: s.feature, what: s.what })),
  chorusMelody,
  loop: { ...LOOP, startSec: +(LOOP.startBeat * SEC).toFixed(3), endSec: +((LOOP.startBeat + LOOP.beats) * SEC).toFixed(3), bars: '7-10' },
  stems: Object.fromEntries(STEMS.map(n => [n, `stems/${n}.mp3`])),
  sources,
  loudness: { lufs: loud.lufs, truePeak: loud.truePeak },
  cues,
  tones: Object.fromEntries(Object.entries(TONE_MIDI).map(([g, m]) => [g, +(440 * 2 ** ((m - 69) / 12)).toFixed(2)])),
};
writeFileSync(join(OUT, 'song.json'), JSON.stringify(song, null, 2) + '\n');
log('done');
console.log(JSON.stringify({ loudness: loud, stemPeaks, stemSum, loopSeam, perSection }, null, 1));
