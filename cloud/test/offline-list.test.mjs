// The list the installed app downloads from (cloud/src/offline-list.mjs, spec §4): every staged file with its size and a
// fingerprint of its bytes, and a version that changes when any file changes. The service worker, the list itself and the
// cloud's _headers are left out. A name that an address would have to encode is refused, so the list and the cloud agree on every
// path. With the brake, the list says only {"burt":true} and every device lets go of the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fingerprint, isSafeName, offlineList, writeOfflineList } from '../src/offline-list.mjs';

const sha = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const F = (rel, text) => ({ rel, bytes: Buffer.from(text) });

test('every staged file is listed with its size and fingerprint, and the same game gives the same version', () => {
  const files = [F('remake/index.html', '<html>'), F('remake/assets/a.mp3', 'abc'), F('_headers', 'x'), F('remake/sw.js', 'y'), F('remake/offline.json', 'z')];
  const list = offlineList(files);
  assert.deepEqual(Object.keys(list.files), ['/remake/assets/a.mp3', '/remake/index.html']);
  assert.deepEqual(list.files['/remake/index.html'], { size: 6, hash: sha('<html>') });
  assert.equal(fingerprint(Buffer.from('<html>')), sha('<html>'));
  assert.match(list.version, /^[0-9a-f]{16}$/);
  assert.equal(offlineList([...files].reverse()).version, list.version);
  const changed = offlineList([F('remake/index.html', '<html>'), F('remake/assets/a.mp3', 'abd')]);
  assert.notEqual(changed.version, list.version);
  assert.equal(changed.files['/remake/index.html'].hash, list.files['/remake/index.html'].hash);
});

test('a name that needs encoding in an address is not safe', () => {
  assert.equal(isSafeName('remake/assets/x-1.mp3'), true);
  assert.equal(isSafeName('remake/a b.mp3'), false);
  assert.equal(isSafeName('remake/þ.mp3'), false);
});

test('writeOfflineList writes the list into the site, or the brake', t => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'forrit-list-'));
  t.after(() => fs.rmSync(site, { recursive: true, force: true }));
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(site, rel)), { recursive: true }); fs.writeFileSync(path.join(site, rel), text); };
  put('remake/index.html', '<html>');
  put('remake/sw.js', 'self');
  put('_headers', '/*');
  const listFile = path.join(site, 'remake/offline.json');

  const written = writeOfflineList(site, {});
  assert.equal(written.files, 1);
  const list = JSON.parse(fs.readFileSync(listFile, 'utf8'));
  assert.deepEqual(list, offlineList([F('remake/index.html', '<html>'), F('remake/sw.js', 'self'), F('_headers', '/*')]));
  assert.equal(written.version, list.version);

  const brake = writeOfflineList(site, { burt: true });
  assert.equal(fs.readFileSync(listFile, 'utf8'), '{"burt":true}');
  assert.equal(brake.version, null);
});
