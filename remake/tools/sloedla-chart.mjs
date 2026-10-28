#!/usr/bin/env node
// Writes the sheet of Slóeðla's song game (engine/sloedla/chart.js makeChart) for a song: its notes at each level, made from the
// song's beat grid, beside the song as <song>.notes.json. The grid comes from the song's json (bpm, beatOffset: measure it first
// with tools/theme-tempo.mjs --file), the length from the mp3 itself (ffprobe), and the notes stop a few seconds before the end so
// the song can fade out under the stars.
//
//   node remake/tools/sloedla-chart.mjs [remake/assets/audio/sloedla/dino-trail.mp3] [--seed sloedla]
//
// The same song and seed always give the same sheet.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS, makeChart } from '../engine/sloedla/chart.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TAIL = 4; // s at the end of the song with no notes (the fade out)
const FIRST_BEAT = 8; // two bars in before the first note, so it can fall into sight

const args = process.argv.slice(2);
const seedAt = args.indexOf('--seed');
const seed = seedAt >= 0 ? args[seedAt + 1] : 'sloedla';
const songArg = args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--seed') ?? 'remake/assets/audio/sloedla/dino-trail.mp3';
const song = path.resolve(ROOT, songArg);
const grid = JSON.parse(fs.readFileSync(song.replace(/\.mp3$/i, '.json'), 'utf8'));
if (!(grid.bpm > 0) || !Number.isFinite(grid.beatOffset)) throw new Error(`${songArg}: its json has no bpm and beatOffset; run theme-tempo.mjs --file first`);
const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', song], { encoding: 'utf8' }).trim());
const to = Math.floor(((duration - TAIL - grid.beatOffset) * grid.bpm) / 60);

const levels = {};
for (const [level, { fall }] of Object.entries(LEVELS)) {
  levels[level] = { fall, notes: makeChart({ bpm: grid.bpm, beatOffset: grid.beatOffset, from: FIRST_BEAT, to, level, seed }) };
}
const sheet = {
  song: path.basename(song),
  bpm: grid.bpm,
  beatOffset: grid.beatOffset,
  duration,
  seed,
  comment: `Made by tools/sloedla-chart.mjs from ${path.basename(song)}'s grid (engine/sloedla/chart.js makeChart). Roles: a Slóeðla (horn), b Kambeðla (plates), c Þórseðla (drum); step 0 is do of the song's key.`,
  levels,
};
// one note a line, so a change to the sheet reads well in a diff
const text = JSON.stringify(sheet, null, 1).replace(/\{\s+"t": ([^,]+),\s+"beat": ([^,]+),\s+"role": ("[abc]"),\s+"step": (\d+)\s+\}/g, '{ "t": $1, "beat": $2, "role": $3, "step": $4 }');
const out = song.replace(/\.mp3$/i, '.notes.json');
fs.writeFileSync(out, text + '\n');
for (const [level, { notes }] of Object.entries(levels)) {
  const by = role => notes.filter(n => n.role === role).length;
  console.log(`${level}: ${notes.length} notes (Slóeðla ${by('a')}, Kambeðla ${by('b')}, Þórseðla ${by('c')}), ${notes[0].t} s to ${notes.at(-1).t} s`);
}
console.log(`wrote ${path.relative(ROOT, out).replace(/\\/g, '/')}`);
