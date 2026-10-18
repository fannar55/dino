#!/usr/bin/env node
// Bakes the "Eitt!" music small for a tablet: the owner's loop (a stereo mp3 cut to flow from its end into its start) becomes
// remake/assets/audio/eitt/music.mp3, mono, 16 kHz, 64 kbps (1.7 MB, and 13 MB decoded instead of 80), still exactly one period
// of the loop, so the game can loop it with no jump (engine/eitt/eitt-sounds.js).
//
//   node remake/tools/bake-eitt-music.mjs [loop.mp3] [out.mp3]
//   (defaults: qa/remake/eitt/music/eitt-music-2b-loop.mp3 -> remake/assets/audio/eitt/music.mp3; needs ffmpeg on the PATH)
//
// The loop is laid three times end to end before it is mixed down and resampled, and the middle copy is kept, so the resampler's
// edges fall outside it and the end still flows into the start. The mono mix is lifted 1.8 dB to the loudness of the stereo
// channels together (a mix of two different channels is quieter than either).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RATE = 16000;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const input = process.argv[2] ?? path.join(ROOT, 'qa/remake/eitt/music/eitt-music-2b-loop.mp3');
const output = process.argv[3] ?? path.join(ROOT, 'remake/assets/audio/eitt/music.mp3');

const run = (...args) => {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-v', 'error', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg ${args.join(' ')}\n${r.stderr}`);
};
const probe = file => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8' }).stdout);

const seconds = probe(input);
const period = Math.round(seconds * RATE); // samples of one loop at the baked rate (217.42 s is a whole number of them)
if (Math.abs(period - seconds * RATE) > 0.5) throw new Error(`${input} is ${seconds} s: not a whole number of samples at ${RATE} Hz`);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eitt-music-'));
try {
  const wav = path.join(dir, 'loop.wav');
  const mid = path.join(dir, 'mid.wav');
  run('-i', input, '-c:a', 'pcm_f32le', wav); // decoded, with the encoder's padding trimmed
  run('-stream_loop', '2', '-i', wav, '-af',
    `pan=mono|c0=0.5*c0+0.5*c1,volume=1.8dB,aresample=${RATE}:resampler=soxr:precision=28,atrim=start_sample=${period}:end_sample=${period * 2},asetpts=N/SR/TB`,
    '-c:a', 'pcm_f32le', mid);
  run('-i', mid, '-c:a', 'libmp3lame', '-b:a', '64k', '-ar', String(RATE), '-ac', '1', output);
  console.log(`${output}: ${(fs.statSync(output).size / 1048576).toFixed(2)} MB, ${probe(output)} s`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
