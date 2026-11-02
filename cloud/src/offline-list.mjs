// The list the installed app downloads the game from (spec §4): site/remake/offline.json, written by stage.mjs. Every staged
// file is in it under its path in the site ('/remake/…', '/dist/…'), with its size and a fingerprint, the first 16 hex characters
// of the SHA-256 of its bytes. The version is the fingerprint of all those lines together, so it changes when any file
// changes and stays the same when nothing did. The service worker, the list itself and the cloud's _headers are left out: the
// browser fetches the worker itself, and the other two never go into the app. With the brake (--burt) the list says only
// {"burt":true}, and every device lets go of the app and plays from the net (remake/sw.js).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const LEFT_OUT = ['_headers', 'remake/offline.json', 'remake/sw.js'];

/** The first 16 hex characters of the SHA-256 of `bytes`. */
export const fingerprint = bytes => crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);

/** True when the path needs no encoding in an address, so the list, the cloud and the browser all name it alike. */
export const isSafeName = rel => encodeURI(`/${rel}`) === `/${rel}`;

/** The list of `files` ({ rel, bytes }, rel relative to the site with forward slashes): { version, files: { '/rel': { size, hash } } }. */
export function offlineList(files) {
  const listed = files.filter(({ rel }) => !LEFT_OUT.includes(rel))
    .map(({ rel, bytes }) => [`/${rel}`, { size: bytes.length, hash: fingerprint(bytes) }])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const lines = listed.map(([key, { size, hash }]) => `${key} ${size} ${hash}\n`).join('');
  return { version: fingerprint(Buffer.from(lines, 'utf8')), files: Object.fromEntries(listed) };
}

/** Every file under `dir`, relative to it with forward slashes. */
function filesOf(dir, prefix = '') {
  return fs.readdirSync(path.join(dir, prefix), { withFileTypes: true }).flatMap(entry => {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return filesOf(dir, rel);
    return entry.isFile() ? [rel] : [];
  });
}

/** Writes siteDir/remake/offline.json from the files in the site, or the brake with `burt`. Returns { files, version }. */
export function writeOfflineList(siteDir, { burt = false } = {}) {
  const target = path.join(siteDir, 'remake', 'offline.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (burt) {
    fs.writeFileSync(target, JSON.stringify({ burt: true }));
    return { files: 0, version: null };
  }
  const list = offlineList(filesOf(siteDir).map(rel => ({ rel, bytes: fs.readFileSync(path.join(siteDir, rel)) })));
  fs.writeFileSync(target, JSON.stringify(list));
  return { files: Object.keys(list.files).length, version: list.version };
}
