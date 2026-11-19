// Stages the site for the cloud (spec §9.2): remake/ into cloud/site/remake/, dist/vendor/ (three.js) into
// cloud/site/dist/vendor/ and dist/assets/audio/ (the old game's voice lines, which remake/assets/audio/lines.json points at)
// into cloud/site/dist/assets/audio/, so the paths are the ones tools/serve.mjs serves at home. What the game never loads
// stays behind: remake/tests/, remake/tools/, remake/prompts/, the Tripo sources in remake/assets/characters/source/ and any
// node_modules/. Nothing that may be a secret is published: no file or folder whose name starts with a dot (.env, .git,
// .wrangler and the like) and no *.pem or *.key, even when git ignores it and it sits in the working tree.
// Workers Static Assets take no file over 25 MiB, so one is refused here, by name, before anything is copied. Run it again
// whenever the game changes: cloud/site/ is emptied first (npm run dev and npm run deploy run it first). A name that an address
// would have to encode (a space, an Icelandic letter) is refused the same way, so the app's list and the cloud name every file
// alike. Then it writes site/_headers (src/cache.mjs), which keeps the site's pictures, models and sounds in the browser for a
// day, and last site/remake/offline.json (src/offline-list.mjs), the list the installed app downloads the whole game from. With
// --burt the list is the brake, {"burt":true}, and every device lets go of the app (README: „Forritið og án nets“). Prints
// { files, bytes, version }.
//
//   node cloud/stage.mjs [--burt]        (npm run stage in cloud/, npm run stage:cloud at the root)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { headersFile } from './src/cache.mjs';
import { isSafeName, writeOfflineList } from './src/offline-list.mjs';

const cloud = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(cloud);
const site = path.join(cloud, 'site');
const MAX_BYTES = 25 * 1024 * 1024;

const linesJson = JSON.parse(fs.readFileSync(path.join(repo, 'remake/assets/audio/lines.json'), 'utf8'));
const usedDistAudio = new Set(
  Object.values(linesJson)
    .map(entry => /^\.\.\/\.\.\/dist\/assets\/audio\/(.+)$/.exec(entry?.src ?? '')?.[1])
    .filter(Boolean),
);

const SOURCES = [
  { from: 'remake', to: 'remake', skip: ['tests', 'tools', 'prompts', 'assets/characters/source'] },
  { from: 'dist/vendor', to: 'dist/vendor', skip: [] },
  { from: 'dist/assets/audio', to: 'dist/assets/audio', skip: [], keep: rel => usedDistAudio.has(rel) || /\.txt$/i.test(rel) },
];

/** A name never published: a dotfile or dot-folder, or a key or certificate. */
const isPrivate = name => name.startsWith('.') || /\.(?:pem|key)$/i.test(name);

/** Every file under `dir`, as paths relative to it with forward slashes, leaving out `skip`, any node_modules/ and the private names. */
function filesOf(dir, skip, prefix = '', keep = null) {
  return fs.readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap(entry => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (isPrivate(entry.name)) return [];
    if (entry.isDirectory()) return entry.name === 'node_modules' || skip.includes(rel) ? [] : filesOf(dir, skip, rel, keep);
    return entry.isFile() && (!keep || keep(rel)) ? [rel] : [];
  });
}

const copies = SOURCES.flatMap(({ from, to, skip, keep }) => filesOf(path.join(repo, from), skip, '', keep).map(rel => ({
  source: path.join(repo, from, rel),
  target: path.join(site, to, rel),
  size: fs.statSync(path.join(repo, from, rel)).size,
})));

const tooBig = copies.filter(copy => copy.size > MAX_BYTES);
if (tooBig.length) {
  for (const { source, size } of tooBig) console.error(`over 25 MiB (${size} bytes): ${path.relative(repo, source).split(path.sep).join('/')}`);
  process.exit(1);
}

const published = copy => path.relative(site, copy.target).split(path.sep).join('/');
const unsafe = copies.filter(copy => !isSafeName(published(copy)));
if (unsafe.length) {
  for (const copy of unsafe) console.error(`needs encoding in an address: ${published(copy)}`);
  process.exit(1);
}

fs.rmSync(site, { recursive: true, force: true });
for (const { source, target } of copies) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
fs.writeFileSync(path.join(site, '_headers'), headersFile());
const { version } = writeOfflineList(site, { burt: process.argv.includes('--burt') });
console.log({ files: copies.length, bytes: copies.reduce((sum, copy) => sum + copy.size, 0), version });
