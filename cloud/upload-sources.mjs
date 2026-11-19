#!/usr/bin/env node
// Puts the source files of chapter 5's song in the Cloudflare R2 bucket `mosi-geymsla`, the project's store for what the game is
// made from and does not ship (the owner's word of 2026-11-11: "R2"). The bucket is bound to no Worker, so nothing in it is served:
// `mosi-myndbond` is the bucket the site streams from, and these files stay out of it.
//
// What goes up, under kafli5-djamm/ (DJ Flugeðla's set "Stóra sviðið", tools/kafli5-lag/djamm-1):
//   records/<folder>/...   the ElevenLabs Music tracks and their stems (remake/assets/audio/sloedla/v2/djamm*, not in git)
//   sounds/...             the Freesound and ElevenLabs sounds the set uses, with their sources.json (qa/, not in git)
//   render/...             the set as rendered: mix.mp3, its stems, song.json, checks.json
// and remake/assets/audio/kafli5/song/SOURCES.md is written from what went up: every key with its size and md5, and how to bring
// the files back for a new render.
//
//   node cloud/upload-sources.mjs          uploads what the bucket's list in SOURCES.md does not have with the same md5
//   node cloud/upload-sources.mjs --list   uploads nothing: prints what would go up
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const BUCKET = 'mosi-geymsla';
const PREFIX = 'kafli5-djamm';
const NOTE = path.join(ROOT, 'remake/assets/audio/kafli5/song/SOURCES.md');
const V2 = 'remake/assets/audio/sloedla/v2';
const RENDER = 'qa/remake/kafli5/lag/djamm/1';
const TYPES = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.json': 'application/json', '.md': 'text/markdown', '.txt': 'text/plain' };

const walk = dir => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)])) : []);
const md5 = file => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
const posix = file => file.split(path.sep).join('/');

/** Every file that goes up: { file (from the repo's root), key }. */
function wanted() {
  const list = [];
  for (const folder of ['djamm', 'djamm-fonk', 'djamm-rolegt', 'djamm-slagverk', 'djamm-vidlag']) {
    for (const file of walk(path.join(ROOT, V2, folder))) list.push({ file, key: `${PREFIX}/records/${folder}/${posix(path.relative(path.join(ROOT, V2, folder), file))}` });
  }
  for (const file of walk(path.join(ROOT, RENDER, 'sounds'))) list.push({ file, key: `${PREFIX}/sounds/${posix(path.relative(path.join(ROOT, RENDER, 'sounds'), file))}` });
  for (const name of ['mix.mp3', 'song.json', 'checks.json']) list.push({ file: path.join(ROOT, RENDER, name), key: `${PREFIX}/render/${name}` });
  for (const file of walk(path.join(ROOT, RENDER, 'stems'))) list.push({ file, key: `${PREFIX}/render/stems/${path.basename(file)}` });
  return list.filter(({ file }) => fs.existsSync(file) && path.extname(file) in TYPES).map(item => ({ ...item, bytes: fs.statSync(item.file).size, md5: md5(item.file) }));
}

const wrangler = args => execFileSync('npx', ['--no-install', 'wrangler', ...args], { cwd: HERE, stdio: 'pipe', shell: process.platform === 'win32' });

/** The keys SOURCES.md says are in the bucket, with their md5. */
function have() {
  if (!fs.existsSync(NOTE)) return new Map();
  return new Map([...fs.readFileSync(NOTE, 'utf8').matchAll(/^\| `([^`]+)` \| (\d+) \| `([0-9a-f]{32})` \|$/gm)].map(([, key, , sum]) => [key, sum]));
}

function note(list) {
  const total = list.reduce((sum, item) => sum + item.bytes, 0);
  return [
    '# Where the song\'s sources are',
    '',
    `The files chapter 5's song is made from are not in git and not in the game: they are in the Cloudflare R2 bucket \`${BUCKET}\` (bound to`,
    'no Worker, so nothing in it is served), put there by `node cloud/upload-sources.mjs`. A new render needs them back where they were:',
    '',
    '```',
    `npx wrangler r2 object get ${BUCKET}/<key> --file <path> --remote`,
    '```',
    '',
    `- \`${PREFIX}/records/<folder>/...\` goes to \`${V2}/<folder>/...\` (the ElevenLabs Music tracks and their stems)`,
    `- \`${PREFIX}/sounds/...\` goes to \`${RENDER}/sounds/...\` (the fetched sounds, with their sources.json)`,
    `- \`${PREFIX}/render/...\` goes to \`${RENDER}/...\` (the set as rendered, which \`node remake/tools/kafli5-song.mjs\` carries into the game)`,
    '',
    `${list.length} files, ${(total / 1024 / 1024).toFixed(1)} MB.`,
    '',
    '| Key | Bytes | md5 |',
    '|---|---|---|',
    ...list.map(item => `| \`${item.key}\` | ${item.bytes} | \`${item.md5}\` |`),
    '',
  ].join('\n');
}

const list = wanted().sort((a, b) => a.key.localeCompare(b.key));
if (process.argv.includes('--list')) {
  for (const item of list) console.log(`${item.key}  ${item.bytes}`);
  console.log(`${list.length} files, ${(list.reduce((sum, item) => sum + item.bytes, 0) / 1024 / 1024).toFixed(1)} MB`);
  process.exit(0);
}
try {
  wrangler(['r2', 'bucket', 'create', BUCKET]);
  console.log(`created the bucket ${BUCKET}`);
} catch {
  // it is there already
}
const there = have();
const done = list.filter(item => there.get(item.key) === item.md5);
let failed = 0;
for (const item of list) {
  if (there.get(item.key) === item.md5) continue;
  try {
    wrangler(['r2', 'object', 'put', `${BUCKET}/${item.key}`, '--file', item.file, '--content-type', TYPES[path.extname(item.file)], '--remote']);
    done.push(item);
    console.log(`up: ${item.key} (${item.bytes} bytes)`);
  } catch (error) {
    failed++;
    console.log(`FAILED: ${item.key}: ${String(error.stderr ?? error.message).split('\n').filter(Boolean).slice(-1)[0]}`);
  }
  fs.writeFileSync(NOTE, note(done.sort((a, b) => a.key.localeCompare(b.key)))); // after every file: what is written is what is up
}
fs.writeFileSync(NOTE, note(done.sort((a, b) => a.key.localeCompare(b.key))));
console.log(`${done.length} of ${list.length} files are in ${BUCKET}; ${failed} failed`);
process.exit(failed ? 1 : 0);
