// Stages the site for the cloud (spec §9.2): remake/ into cloud/site/remake/ and dist/vendor/ (three.js) into
// cloud/site/dist/vendor/, so the paths are the ones tools/serve.mjs serves at home. What the game never loads stays behind:
// remake/tests/, remake/tools/, remake/prompts/, the Tripo sources in remake/assets/characters/source/ and any node_modules/.
// Workers Static Assets take no file over 25 MiB, so one is refused here, by name, before anything is copied. Run it again
// whenever the game changes: cloud/site/ is emptied first. Prints { files, bytes }.
//
//   node cloud/stage.mjs        (npm run stage in cloud/, npm run stage:cloud at the root)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cloud = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(cloud);
const site = path.join(cloud, 'site');
const MAX_BYTES = 25 * 1024 * 1024;

const SOURCES = [
  { from: 'remake', to: 'remake', skip: ['tests', 'tools', 'prompts', 'assets/characters/source'] },
  { from: 'dist/vendor', to: 'dist/vendor', skip: [] },
];

/** Every file under `dir`, as paths relative to it with forward slashes, leaving out `skip` and any node_modules/. */
function filesOf(dir, skip, prefix = '') {
  return fs.readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap(entry => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return entry.name === 'node_modules' || skip.includes(rel) ? [] : filesOf(dir, skip, rel);
    return entry.isFile() ? [rel] : [];
  });
}

const copies = SOURCES.flatMap(({ from, to, skip }) => filesOf(path.join(repo, from), skip).map(rel => ({
  source: path.join(repo, from, rel),
  target: path.join(site, to, rel),
  size: fs.statSync(path.join(repo, from, rel)).size,
})));

const tooBig = copies.filter(copy => copy.size > MAX_BYTES);
if (tooBig.length) {
  for (const { source, size } of tooBig) console.error(`over 25 MiB (${size} bytes): ${path.relative(repo, source).split(path.sep).join('/')}`);
  process.exit(1);
}

fs.rmSync(site, { recursive: true, force: true });
for (const { source, target } of copies) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
console.log({ files: copies.length, bytes: copies.reduce((sum, copy) => sum + copy.size, 0) });
