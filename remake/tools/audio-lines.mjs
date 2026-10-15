#!/usr/bin/env node
// Builds remake/assets/audio/lines.json: every recorded line in the game's narration manifest with
// its exact duration, so scene timing needs no audio decoding at runtime and seeking is exact.
//   node remake/tools/audio-lines.mjs        (needs ffprobe on the PATH)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const audioDir = path.join(ROOT, 'dist/assets/audio');
const manifest = JSON.parse(fs.readFileSync(path.join(audioDir, 'narration-manifest.json'), 'utf8'));
const out = {};
for (const [id, file] of Object.entries(manifest.clips)) {
  const full = path.join(audioDir, file);
  if (!fs.existsSync(full)) { console.warn(`missing ${file}`); continue; }
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', full], { encoding: 'utf8' }).trim());
  // Paths are relative to remake/index.html.
  out[id] = { src: `../dist/assets/audio/${file}`, duration: Math.round(seconds * 1000) / 1000 };
}
fs.mkdirSync(path.join(ROOT, 'remake/assets/audio'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'remake/assets/audio/lines.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`${Object.keys(out).length} lines written`);
