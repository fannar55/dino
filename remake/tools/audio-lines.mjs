#!/usr/bin/env node
// Builds remake/assets/audio/lines.json: every recorded line in the game's narration manifest with
// its exact duration, so scene timing needs no audio decoding at runtime and seeking is exact, and its
// mouth: how loud the voice is, 20 times a second, which the speaker's mouth follows (engine/talk.js).
// The remake's own lines (made by tools/voice-lines.mjs into assets/audio/kafli1/) get the same three
// fields, from the same code.
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

export const LINES_FILE = 'remake/assets/audio/lines.json';
/** Where the remake's own lines are (beside their lines-source.json); relative to the repo root. */
export const REMAKE_AUDIO = 'remake/assets/audio/kafli1';

/** The length of a recording in seconds, to the millisecond. */
export function durationOf(file) {
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());
  return Math.round(seconds * 1000) / 1000;
}

/** The entry of one recording in lines.json: where it plays from, how long it is, and its mouth. */
export function lineEntry(file, src) {
  return { src, duration: durationOf(file), mouth: mouthOf(decode(file)) };
}

/** The game's own lines: every clip of the narration manifest. Paths are relative to remake/index.html. */
export function gameLines(root) {
  const audioDir = path.join(root, 'dist/assets/audio');
  const manifest = JSON.parse(fs.readFileSync(path.join(audioDir, 'narration-manifest.json'), 'utf8'));
  const out = {};
  for (const [id, file] of Object.entries(manifest.clips)) {
    const full = path.join(audioDir, file);
    if (!fs.existsSync(full)) { console.warn(`missing ${file}`); continue; }
    out[id] = lineEntry(full, `../dist/assets/audio/${file}`);
  }
  return out;
}

/** The remake's own lines that have been made (all of them, or just those in `only`), in the order of lines-source.json. */
export function remakeLines(root, only = null) {
  const source = path.join(root, REMAKE_AUDIO, 'lines-source.json');
  if (!fs.existsSync(source)) return {};
  const out = {};
  for (const { id } of JSON.parse(fs.readFileSync(source, 'utf8'))) {
    const full = path.join(root, REMAKE_AUDIO, `${id}.mp3`);
    if ((only && !only.includes(id)) || !fs.existsSync(full)) continue;
    out[id] = lineEntry(full, `${REMAKE_AUDIO.replace(/^remake\//, '')}/${id}.mp3`);
  }
  return out;
}

/** Every line lines.json has: the game's, then the remake's. */
export function buildLines(root) {
  return { ...gameLines(root), ...remakeLines(root) };
}

export function writeLines(root, lines) {
  fs.mkdirSync(path.join(root, path.dirname(LINES_FILE)), { recursive: true });
  fs.writeFileSync(path.join(root, LINES_FILE), `${JSON.stringify(lines, null, 1)}\n`);
}

/** Adds (or renews) the entries of these remake lines and leaves the rest of lines.json as it is. */
export function updateLines(root, ids) {
  const file = path.join(root, LINES_FILE);
  const lines = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  writeLines(root, { ...lines, ...remakeLines(root, ids) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const lines = buildLines(ROOT);
  writeLines(ROOT, lines);
  console.log(`${Object.keys(lines).length} lines written`);
}
