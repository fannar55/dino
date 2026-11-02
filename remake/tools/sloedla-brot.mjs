#!/usr/bin/env node
// Söngur Slóeðlu: a song's preview for the menu (engine/sloedla/brot.js): about ten seconds from the song time its entry names
// (v2/songs/index.js `brot`, its chorus), faded in and out and levelled, into remake/assets/audio/sloedla/v2/<id>/brot.mp3.
//   node remake/tools/sloedla-brot.mjs <id> [--seconds 10]
//       a song made only of recorded stems: the stems mixed as the game plays them (each layer's gain), from tempo.offset + brot
//   node remake/tools/sloedla-brot.mjs <id> --source <audio file> --lead <s>
//       any song, from a recording of a round (the lab's ?sjalf=1&upptaka=1&hljod=0&dj=0&ahorfendur=0, rec.mjs): song time 0 is
//       `lead` s into it (the clock's 0.4 s); a song with composed parts (its tune is made in code, not in a file) needs this
// Fades: 0.4 s in, 1.2 s out. Levelled to -17 LUFS (as the songs in the game, before the glue), true peak -2 dB, two passes of
// ffmpeg's loudnorm. Stereo mp3 at 96 kbps (about 120 KB).
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TARGET = { I: -17, TP: -2, LRA: 11 };

const argv = process.argv.slice(2);
const value = name => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const id = argv.find((a, i) => !a.startsWith('--') && !['--source', '--lead', '--seconds'].includes(argv[i - 1]));
if (!id) throw new Error('Name a song: node remake/tools/sloedla-brot.mjs <id> [--source <file> --lead <s>] [--seconds 10]');
const { SONGS_V2 } = await import(pathToFileURL(path.join(ROOT, 'remake/engine/sloedla/v2/songs/index.js')).href);
const entry = SONGS_V2.find(e => e.id === id);
if (!entry) throw new Error(`No song called ${id}.`);
if (!(entry.brot >= 0)) throw new Error(`${id} has no brot (song time of its preview) in v2/songs/index.js.`);
const song = (await entry.load()).default;
const seconds = Number(value('--seconds') ?? 10);
const source = value('--source');
const folder = path.join(ROOT, 'remake/assets/audio/sloedla/v2', id);
const out = path.join(folder, 'brot.mp3');

let inputs, start;
if (source) {
  if (value('--lead') === undefined) throw new Error('--source needs --lead (where song time 0 is in it, s).');
  inputs = [{ file: path.resolve(source), gain: 1 }];
  start = Number(value('--lead')) + entry.brot;
} else {
  if (song.layers.some(layer => layer.part)) throw new Error(`${id} has composed parts (made in code, in no file): record a round and give it as --source.`);
  inputs = song.layers.filter(layer => layer.stem).map(layer => ({ file: path.join(folder, layer.stem), gain: layer.gain ?? 1 }));
  start = song.tempo.offset + entry.brot;
}

const shape = `afade=t=in:d=0.4,afade=t=out:st=${(seconds - 1.2).toFixed(2)}:d=1.2`;
const mix = inputs.length === 1
  ? `[0:a]volume=${inputs[0].gain},${shape}`
  : `${inputs.map((input, i) => `[${i}:a]volume=${input.gain}[a${i}]`).join(';')};${inputs.map((_, i) => `[a${i}]`).join('')}amix=inputs=${inputs.length}:normalize=0,${shape}`;
const args = filter => ['-v', 'error', ...inputs.flatMap(input => ['-ss', start.toFixed(3), '-t', String(seconds), '-i', input.file]), '-filter_complex', filter];
// pass 1: measure (loudnorm prints its JSON to stderr, at the info level)
const pass1 = spawnSync('ffmpeg', ['-hide_banner', ...args(`${mix},loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json`).slice(2), '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
const measured = JSON.parse(/\{[^{}]*"input_i"[^{}]*\}/.exec(pass1.stderr ?? '')?.[0] ?? '{}');
const second = measured.input_i
  ? `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`
  : `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}`;
fs.mkdirSync(folder, { recursive: true });
execFileSync('ffmpeg', ['-y', ...args(`${mix},${second}`), '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '96k', out], { stdio: ['ignore', 'inherit', 'inherit'] });
console.log(`wrote ${path.relative(ROOT, out)} (${fs.statSync(out).size} bytes) from ${source ? path.basename(source) : `${inputs.length} stems`} at ${start.toFixed(2)} s`);
