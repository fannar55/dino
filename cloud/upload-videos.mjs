#!/usr/bin/env node
// Uploads the book's eight educational videos from myndband-gramedla/out/ to the Cloudflare R2 bucket `mosi-myndbond`
// (bound as env.VIDEOS in wrangler.toml and served at /myndbond/<id>.mp4 by src/worker.mjs).
//
//   node upload-videos.mjs            -> uploads all 8 videos to remote R2 (`--remote`)
//   node upload-videos.mjs --local    -> puts them in local Miniflare R2 for `wrangler dev`
//   node upload-videos.mjs gramedla   -> uploads only the named video(s)

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, '../../myndband-gramedla/out');
const BUCKET = 'mosi-myndbond';
const WRANGLER_MAX_BYTES = 295 * 1024 * 1024; // stay safely under wrangler r2 object put's 300 MiB ceiling

export const VIDEOS = [
  { id: 'heimur', key: 'heimur.mp4', file: 'heimur-2.mp4' },
  { id: 'grannar', key: 'grannar.mp4', file: 'grannar-sfx.mp4' },
  { id: 'thorsedla', key: 'thorsedla.mp4', file: 'thorsedla-sfx.mp4' },
  { id: 'gramedla', key: 'gramedla.mp4', file: 'gramedla-hljod.mp4' },
  { id: 'landrek', key: 'landrek.mp4', file: 'landrek.mp4' },
  { id: 'fuglar', key: 'fuglar.mp4', file: 'fuglar-sfx.mp4' },
  { id: 'raf', key: 'raf.mp4', file: 'raf-sfx.mp4' },
  { id: 'steinn', key: 'steinn.mp4', file: 'steinn-sfx.mp4' },
  { id: 'tennur', key: 'tennur.mp4', file: 'tennur.mp4' },
];

function wrangler(args, options = {}) {
  const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return execFileSync(cmd, ['wrangler', ...args], { cwd: HERE, stdio: 'inherit', shell: process.platform === 'win32', ...options });
}

/** Ensures a file over Wrangler's 300 MiB CLI limit has a <295 MiB H.264 +faststart copy ready for R2 upload. */
function fileForUpload(srcPath) {
  const size = fs.statSync(srcPath).size;
  if (size <= WRANGLER_MAX_BYTES) return srcPath;
  const r2Path = srcPath.replace(/\.mp4$/i, '-r2.mp4');
  if (fs.existsSync(r2Path) && fs.statSync(r2Path).size <= WRANGLER_MAX_BYTES) return r2Path;
  console.log(`[upload-videos] ${path.basename(srcPath)} is ${(size / 1024 / 1024).toFixed(1)} MB (>300 MiB Wrangler CLI limit); encoding <280 MiB R2 copy...`);
  execFileSync('ffmpeg', [
    '-y', '-i', srcPath,
    '-c:v', 'libx264', '-crf', '23', '-maxrate', '2400k', '-bufsize', '4800k', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
    r2Path,
  ], { stdio: 'inherit' });
  return r2Path;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const local = args.includes('--local');
  const picked = args.filter(a => !a.startsWith('--'));
  const list = picked.length ? VIDEOS.filter(v => picked.includes(v.id) || picked.includes(v.key)) : VIDEOS;
  if (!list.length) {
    console.error(`Unknown video(s): ${picked.join(', ')}. Known: ${VIDEOS.map(v => v.id).join(', ')}`);
    process.exit(1);
  }
  if (!local) {
    try {
      wrangler(['r2', 'bucket', 'create', BUCKET], { stdio: 'pipe' });
      console.log(`Created R2 bucket: ${BUCKET}`);
    } catch {
      // Bucket already exists.
    }
  }
  for (const video of list) {
    const rawPath = path.join(OUT_DIR, video.file);
    if (!fs.existsSync(rawPath)) throw new Error(`Missing video file: ${rawPath}`);
    const uploadPath = local ? rawPath : fileForUpload(rawPath);
    const mb = (fs.statSync(uploadPath).size / 1024 / 1024).toFixed(1);
    console.log(`\nUploading ${video.key} (${mb} MB from ${path.basename(uploadPath)}) -> ${BUCKET}/${video.key} (${local ? 'local' : 'remote'})...`);
    wrangler([
      'r2', 'object', 'put', `${BUCKET}/${video.key}`,
      '--file', uploadPath,
      '--content-type', 'video/mp4',
      local ? '--local' : '--remote',
    ]);
  }
  console.log('\nAll videos uploaded.');
}
