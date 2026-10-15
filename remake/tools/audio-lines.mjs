#!/usr/bin/env node
// Builds remake/assets/audio/lines.json: every recorded line in the game's narration manifest with
// its exact duration, so scene timing needs no audio decoding at runtime and seeking is exact, and its
// mouth: how loud the voice is, 20 times a second, which the speaker's mouth follows (engine/talk.js).
//   node remake/tools/audio-lines.mjs        (needs ffprobe and ffmpeg on the PATH)
//
// The mouth is one hexadecimal digit a frame (0 shut to f wide open): the loudness of 50 ms of voice
// in decibels, from 20 dB under the line's own loud parts (shut) up to them (open), with quiet frames
// shut, so a pause between words closes the mouth and the syllables show.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MOUTH_RATE = 20; // frames a second
const SAMPLE_RATE = 8000;
const RANGE = 20; // decibels from shut to open
const LOUD = 0.97; // the loud parts: this share of the line's frames is quieter
const GATE = 0.15; // quieter than this share of the range is shut

/** The mouth string for mono 16-bit samples at SAMPLE_RATE. */
export function mouthOf(samples) {
  const size = SAMPLE_RATE / MOUTH_RATE;
  const frames = Math.ceil(samples.length / size);
  const db = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0, n = 0;
    for (let i = f * size; i < Math.min(samples.length, (f + 1) * size); i++) { sum += samples[i] * samples[i]; n++; }
    db[f] = 20 * Math.log10(Math.sqrt(sum / Math.max(1, n)) / 32768 + 1e-9);
  }
  const loud = [...db].sort((a, b) => a - b)[Math.floor(LOUD * (frames - 1))];
  let out = '';
  for (let f = 0; f < frames; f++) {
    const open = Math.min(1, Math.max(0, (db[f] - (loud - RANGE)) / RANGE));
    out += Math.round((open < GATE ? 0 : open) * 15).toString(16);
  }
  return out;
}

function decode(file) {
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', '-'], { maxBuffer: 1 << 28 });
  return new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const audioDir = path.join(ROOT, 'dist/assets/audio');
  const manifest = JSON.parse(fs.readFileSync(path.join(audioDir, 'narration-manifest.json'), 'utf8'));
  const out = {};
  for (const [id, file] of Object.entries(manifest.clips)) {
    const full = path.join(audioDir, file);
    if (!fs.existsSync(full)) { console.warn(`missing ${file}`); continue; }
    const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', full], { encoding: 'utf8' }).trim());
    // Paths are relative to remake/index.html.
    out[id] = { src: `../dist/assets/audio/${file}`, duration: Math.round(seconds * 1000) / 1000, mouth: mouthOf(decode(full)) };
  }
  fs.mkdirSync(path.join(ROOT, 'remake/assets/audio'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'remake/assets/audio/lines.json'), `${JSON.stringify(out, null, 1)}\n`);
  console.log(`${Object.keys(out).length} lines written`);
}
