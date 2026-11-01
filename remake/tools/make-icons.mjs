#!/usr/bin/env node
// Mosi's app icons (docs/superpowers/specs/2026-10-31-forrit-an-nets-design.md §3): his head, cut from his render in the book
// (assets/book/images/mosi-render.webp, 1024×768 with alpha) as the owner approved it on 2026-10-31, laid over the page's bar
// colour #cfdde3. Nothing is drawn: the render is padded with transparency (so the frill has room), cut square and scaled. The square cut fills an icon edge to edge (PC, Android's "any", and the iPad, which rounds the corners itself); the
// maskable cut is wider, so the horns and the beak stay inside the circle Android may cut it to (80 % of the width).
// The icons are kept in git; run this again only to make them anew.
//
//   node remake/tools/make-icons.mjs        (FFMPEG= another ffmpeg than the one on PATH)

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const remake = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(remake, 'assets/book/images/mosi-render.webp');
const OUT = path.join(remake, 'assets/icons');
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const BACKGROUND = '0xcfdde3';
const SQUARE = 'format=rgba,pad=1024:828:0:60:color=0x00000000,crop=500:500:440:60';
// Padded 120 px at the top and out to 1060 px wide (both transparent), so a 720 px cut can centre the head: frill, horns and beak
// inside the 80 % circle. (The preview's 620 px cut left the beak's lower edge outside it.)
const MASKABLE = 'format=rgba,pad=1060:888:0:120:color=0x00000000,crop=720:720:327:10';

const ICONS = [
  { file: 'icon-512.png', cut: SQUARE, size: 512 },
  { file: 'icon-192.png', cut: SQUARE, size: 192 },
  { file: 'apple-touch-icon.png', cut: SQUARE, size: 180 },
  { file: 'icon-maskable-512.png', cut: MASKABLE, size: 512 },
];

fs.mkdirSync(OUT, { recursive: true });
for (const { file, cut, size } of ICONS) {
  const graph = `color=c=${BACKGROUND}:s=${size}x${size}[bg];[0]${cut},scale=${size}:${size}:flags=lanczos[fg];[bg][fg]overlay=0:0:format=auto,format=rgb24`;
  execFileSync(FFMPEG, ['-v', 'error', '-y', '-i', SOURCE, '-filter_complex', graph, '-frames:v', '1', path.join(OUT, file)], { stdio: 'inherit' });
  console.log(`${file} ${size}×${size}`);
}
