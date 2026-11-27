#!/usr/bin/env node
// Stjörnuhátíðin's recordings: the party blower, the far fireworks and the small applause the owner said yes to fetching
// (2026-11-27, "Já, sækja": five Freesound HQ previews named to him; he then said "Veldu fyrir mig", so the cuts below are the
// controller's pick: the long blower cut short, two of the fireworks' pops, the fuller applause), cut and levelled by measure into
// remake/assets/audio/hatid/hljod/, with their entries in sounds.json (what each is in the party, where it came from, its licence,
// the fingerprints of source and cut, what was done to it) and hatid/CREDITS.md made from the same list. The party plays them as
// rows of its table (chapters/hatid-score.js PARTY_SOUNDS) through engine/audio/sfx.js SAMPLES.
//
//   node remake/tools/hatid-sounds.mjs [--sources <folder>]   make every file from its source
//   node remake/tools/hatid-sounds.mjs --credits              write CREDITS.md alone, from sounds.json as it is (no source needed)
//
// The sources are not in the repo (git ignores qa/): <folder>/<id>-<use>/<id>-hq.mp3 with <folder>/sources.json beside them
// (title, author, page, preview, licence, sourceSha256), by default qa/remake/hatid/hljod/freesound. They are data from the web:
// only ffmpeg opens them (this tool reads their bytes for the fingerprint and no more), and nothing is run from their folders.
// ffmpeg must be on the PATH. Every file is mono, 44.1 kHz, 96 kbps, its peak at PEAK dBFS, written without tags or dates.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SOURCES = 'qa/remake/hatid/hljod/freesound';
export const OUT = 'remake/assets/audio/hatid/hljod';
const CREDITS = 'remake/assets/audio/hatid/CREDITS.md';
const PEAK = -3; // dBFS of each file's peak: the party sets its level from there

/** Each file: its source (a Freesound id), where in it (s), how long (s), and what it is in the party. */
export const CUTS = [
  { file: 'blower.mp3', source: 484267, start: 0, seconds: 1.6, is: 'the party blower (the moon\'s "Tút!" and the song\'s end)' },
  { file: 'firework-1.mp3', source: 434225, start: 2.7, seconds: 2.4, is: 'fireworks far off, under the last chorus\'s bursts of light' },
  { file: 'firework-2.mp3', source: 434225, start: 20.8, seconds: 3.0, is: 'fireworks far off, under the last chorus\'s bursts of light' },
  { file: 'applause.mp3', source: 462362, start: 0, seconds: 4.4, is: 'the forest claps as the last chord rings' },
  { file: 'applause-short.mp3', source: 462362, start: 0.5, seconds: 2.2, is: 'a small clap as a friend\'s solo ends' },
];

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-v', 'info', '-y', ...args], { maxBuffer: 1 << 26 });
  if (result.status !== 0) throw new Error(String(result.stderr).slice(-600));
  return String(result.stderr);
}

function credits(sounds) {
  const rows = Object.entries(sounds.files).map(([file, f]) => `| \`hljod/${file}\` | ${f.is} | "${f.title}" by ${f.author} | ${f.licence} | ${f.page} |`);
  return [
    '# Stjörnuhátíðin: recordings',
    '',
    'The files are cut and levelled from Freesound HQ previews by `node remake/tools/hatid-sounds.mjs`, which writes their entries in',
    '`hljod/sounds.json` (seconds, gain, fingerprints). CC BY 4.0 asks that the author be named: they are named here.',
    '',
    '| File | In the party | Source | Licence | Page |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

function main(argv) {
  const out = path.join(ROOT, OUT);
  const manifest = path.join(out, 'sounds.json');
  if (argv.includes('--credits')) {
    fs.writeFileSync(path.join(ROOT, CREDITS), credits(JSON.parse(fs.readFileSync(manifest, 'utf8'))));
    return;
  }
  const at = argv.indexOf('--sources');
  const folder = path.resolve(ROOT, at >= 0 ? argv[at + 1] : SOURCES);
  const known = new Map(JSON.parse(fs.readFileSync(path.join(folder, 'sources.json'), 'utf8')).sources.map(s => [s.id, s]));
  fs.mkdirSync(out, { recursive: true });
  const files = {};
  for (const cut of CUTS) {
    const source = known.get(cut.source);
    if (!source) throw new Error(`${cut.file}: source ${cut.source} is not in sources.json`);
    const from = path.join(folder, source.file);
    const bytes = fs.readFileSync(from);
    if (sha256(bytes) !== source.sourceSha256) throw new Error(`${cut.file}: ${source.file} is not the file that was fetched`);
    const fade = Math.min(0.25, cut.seconds / 4);
    const shape = `afade=t=in:d=0.01,afade=t=out:st=${(cut.seconds - fade).toFixed(3)}:d=${fade.toFixed(3)}`;
    const base = ['-ss', String(cut.start), '-t', String(cut.seconds), '-i', from, '-ac', '1', '-ar', '44100'];
    const max = Number(/max_volume: (-?[\d.]+) dB/.exec(ffmpeg([...base, '-af', `${shape},volumedetect`, '-f', 'null', '-']))?.[1]);
    if (!Number.isFinite(max)) throw new Error(`${cut.file}: no peak measured`);
    const gain = Math.round((PEAK - max) * 10) / 10;
    const file = path.join(out, cut.file);
    ffmpeg([...base, '-af', `${shape},volume=${gain}dB`, '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-write_xing', '0', '-id3v2_version', '0', '-b:a', '96k', file]);
    files[cut.file] = {
      is: cut.is, seconds: cut.seconds, title: source.title, author: source.author, licence: source.licence, page: source.page,
      preview: source.preview, sourceSha256: source.sourceSha256, cutSha256: sha256(fs.readFileSync(file)),
      did: `from ${cut.start} s for ${cut.seconds} s, mono, a ${fade} s fade out, ${gain >= 0 ? '+' : ''}${gain} dB to a peak of ${PEAK} dBFS`,
    };
    console.log(cut.file, `${cut.seconds} s`, `${gain} dB`, fs.statSync(file).size, 'bytes');
  }
  const sounds = { about: 'Stjörnuhátíðin: recordings (tools/hatid-sounds.mjs). Freesound HQ previews the owner allowed by name on 2026-11-27.', files };
  fs.writeFileSync(manifest, JSON.stringify(sounds, null, 2) + '\n');
  fs.writeFileSync(path.join(ROOT, CREDITS), credits(sounds));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
