#!/usr/bin/env node
// Veiddu's card pictures: each animal's picture is a square crop of a photo the book already owns, cut tight on the animal and
// saved as a 480 x 480 WebP in remake/assets/veiddu/<id>.webp. This is technical work on pictures the game owns, not new art.
//
//   node remake/tools/veiddu-cards.mjs                 crop every entry of remake/assets/veiddu/crops.json
//   node remake/tools/veiddu-cards.mjs --id froskur    only that one
//   node remake/tools/veiddu-cards.mjs --src <file> --id fiskur-raudur [--box x,y,size] [--credit "<name>"]
//       [--license "<licence>"] [--license-url <url>] [--source <url or words>]
//                                                      the same for one of the owner's fish images, which come as files
//                                                      (a square cut round the middle unless --box gives x,y,size; --quality 82)
//
// crops.json is { "<id>": { "src": "<book image name>", "x": n, "y": n, "size": n } }: the box is square and in the pixels of
// remake/assets/book/images/<src>.jpg. For each entry the tool copies the source's credit, licence and source fields from the
// book's media-manifest.json into credits.json, with what was done and the sha256 of the new file. The owner's own fish need no
// credit (licence "own"); a fish picked from the web needs its credit, licence and source given here.
// Needs ffmpeg on the PATH.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = 'remake/assets/veiddu';
const BOOK = 'remake/assets/book';
const SIDE = 480; // px, a card picture's side
const QUALITY = '82';

const argv = process.argv.slice(2);
const opt = name => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const readJson = (file, fallback) => (fs.existsSync(path.join(ROOT, file)) ? JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')) : fallback);
const writeJson = (file, data) => fs.writeFileSync(path.join(ROOT, file), `${JSON.stringify(data, null, 2)}\n`);
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex');

/** Crops `input` to the square (or its middle, with no box) and saves it as a WebP; fails the run when ffmpeg does. */
function cut(input, output, box) {
  const crop = box ? `crop=${box.size}:${box.size}:${box.x}:${box.y}` : 'crop=min(iw\\,ih):min(iw\\,ih)';
  const args = ['-v', 'error', '-y', '-i', input, '-vf', `${crop},scale=${SIDE}:${SIDE}:flags=lanczos`, '-c:v', 'libwebp', '-quality', opt('quality') ?? QUALITY, '-frames:v', '1', output];
  const run = spawnSync('ffmpeg', args, { cwd: ROOT, encoding: 'utf8' });
  if (run.status !== 0) {
    console.error(`ffmpeg failed for ${output}:\n${run.stderr || run.error}`);
    process.exit(1);
  }
}

const credits = readJson(`${OUT_DIR}/credits.json`, {});

if (opt('src')) {
  // One of the owner's fish images.
  const id = opt('id');
  if (!id) throw new Error('--src needs --id <the fish id>');
  const [x, y, size] = (opt('box') ?? '').split(',').map(Number);
  const box = opt('box') ? { x, y, size } : null;
  const output = `${OUT_DIR}/${id}.webp`;
  cut(path.resolve(opt('src')), output, box);
  const own = !opt('credit');
  credits[id] = {
    image: output.replace('remake/', ''),
    from: null,
    credit: opt('credit') ?? null,
    license: opt('license') ?? 'own',
    licenseUrl: opt('license-url') ?? null,
    source: opt('source') ?? (own ? `Mynd frá eigandanum (${path.basename(opt('src'))})` : null),
    modifications: `${box ? `Skorið ferningslaga (x ${x}, y ${y}, ${size} punktar)` : 'Skorið ferningslaga um miðjuna'} og minnkað í ${SIDE} × ${SIDE} punkta; vistað sem WebP.`,
    sha256: sha256(output),
  };
  console.log(`${id}: ${output}`);
} else {
  const crops = readJson(`${OUT_DIR}/crops.json`, {});
  const manifest = readJson(`${BOOK}/media-manifest.json`, { images: [] });
  const only = opt('id');
  if (only && !crops[only]) throw new Error(`${only} is not in crops.json`);
  fs.mkdirSync(path.join(ROOT, OUT_DIR), { recursive: true });
  for (const [id, { src, x, y, size }] of Object.entries(crops)) {
    if (only && id !== only) continue;
    const input = `${BOOK}/images/${src}.jpg`;
    const original = manifest.images.find(entry => entry.id === src);
    if (!original) throw new Error(`${src} is not in the book's media-manifest.json`);
    if (!fs.existsSync(path.join(ROOT, input))) throw new Error(`${input} is missing`);
    if (![x, y, size].every(Number.isInteger) || x < 0 || y < 0 || size < 1) throw new Error(`${id}: the box needs whole numbers x, y and size`);
    const output = `${OUT_DIR}/${id}.webp`;
    cut(input, output, { x, y, size });
    credits[id] = {
      image: output.replace('remake/', ''),
      from: src,
      credit: original.credit,
      license: original.license,
      licenseUrl: original.licenseUrl,
      source: original.source,
      modifications: `Skorið ferningslaga úr mynd bókarinnar (x ${x}, y ${y}, ${size} punktar) og minnkað í ${SIDE} × ${SIDE} punkta; vistað sem WebP. Myndinni er ekki breytt að öðru leyti.`,
      sha256: sha256(output),
    };
    console.log(`${id}: ${output} (${src}, ${size} px at ${x},${y})`);
  }
}

writeJson(`${OUT_DIR}/credits.json`, credits);
