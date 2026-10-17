#!/usr/bin/env node
// Contact sheet of a capture folder: node remake/tools/world/montage.mjs <folder> [cols] [width]
// Writes <folder>/montage.png (shots in report order, labelled by file name) with ffmpeg.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [dir, colsArg, widthArg] = process.argv.slice(2);
if (!dir) { console.log('usage: montage.mjs <folder> [cols=4] [tileWidth=640]'); process.exit(1); }
const cols = Number(colsArg) || 4;
const width = Number(widthArg) || 640;
let names = [];
try {
  names = JSON.parse(fs.readFileSync(path.join(dir, 'report.json'), 'utf8')).shots.map(s => `${s.name}.png`);
} catch {
  names = fs.readdirSync(dir).filter(f => f.endsWith('.png') && f !== 'montage.png');
}
names = names.filter(n => fs.existsSync(path.join(dir, n)));
const rows = Math.ceil(names.length / cols);
const inputs = names.flatMap(n => ['-i', path.resolve(dir, n)]);
// ffmpeg runs inside the Windows font folder so drawtext finds arial.ttf without a drive colon
const filters = names.map((n, i) => `[${i}:v]scale=${width}:-1,drawtext=fontfile=arial.ttf:text='${n.replace('.png', '')}':x=8:y=8:fontsize=18:fontcolor=yellow:box=1:boxcolor=black@0.5[v${i}]`);
const layout = names.map((_, i) => `${(i % cols) * width}_${Math.floor(i / cols) * Math.round(width * 0.625)}`).join('|');
const graph = `${filters.join(';')};${names.map((_, i) => `[v${i}]`).join('')}xstack=inputs=${names.length}:layout=${layout}:fill=black[out]`;
const out = path.resolve(dir, 'montage.png');
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', graph, '-map', '[out]', out], { encoding: 'utf8', cwd: 'C:/Windows/Fonts' });
if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
console.log(`wrote ${out} (${names.length} shots, ${cols}x${rows})`);
