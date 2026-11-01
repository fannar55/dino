// The page's rules for the app's download (remake/engine/offline/plan.js, spec §7): the line under Byrja in the owner's words,
// which files are still to fetch, how far the download is, which stored files no list uses any more, and who downloads at all:
// only the installed app, never a tab, and never the home server.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineFor, missingOf, percentOf, unusedOf, isInstalled, mayRegister } from '../engine/offline/plan.js';

const NB = ' ';

test('the line under Byrja says how far the download is, in the words the owner chose', () => {
  assert.equal(lineFor({ phase: 'first', percent: 40 }), `Sæki leikinn í tækið … 40${NB}%`);
  assert.equal(lineFor({ phase: 'update', percent: 7 }), `Sæki nýja útgáfu … 7${NB}%`);
  assert.equal(lineFor({ phase: 'ready' }), 'Tilbúinn án nets ✓');
  assert.equal(lineFor({ phase: 'needNet', percent: 60 }), `Vantar net til að klára (60${NB}%)`);
  assert.equal(lineFor({ phase: 'full' }), 'Ekki nóg pláss í tækinu');
});

test('what to fetch, how far it is, and what to throw away', () => {
  const list = { version: 'v', files: { '/a': { size: 30, hash: 'h1' }, '/b': { size: 70, hash: 'h2' }, '/c': { size: 70, hash: 'h2' } } };
  assert.deepEqual(missingOf(list, new Set(['h1'])), [{ path: '/b', size: 70, hash: 'h2' }]);
  assert.equal(percentOf(list, new Set(['h1'])), 17); // 30 of 170
  assert.equal(percentOf(list, new Set(['h1', 'h2'])), 100);
  assert.equal(percentOf({ version: 'v', files: { '/a': { size: 999, hash: 'h1' }, '/b': { size: 1, hash: 'h2' } } }, new Set(['h1'])), 99, 'never 100 before the last file');
  assert.equal(percentOf({ version: 'e', files: {} }, new Set()), 100);
  assert.deepEqual(unusedOf(new Set(['h1', 'h2', 'old']), [list]), ['old']);
});

/** A window at `href`, shown as `display` (what the display-mode media query matches), with or without a service worker. */
function win(href, { display = 'browser', standalone, serviceWorker = {} } = {}) {
  return {
    location: new URL(href),
    matchMedia: query => ({ matches: query === `(display-mode: ${display})` }),
    navigator: { standalone, ...(serviceWorker ? { serviceWorker } : {}) },
  };
}

test('only the installed app downloads, and the home server never registers', () => {
  const app = 'https://mosi.fannar55.workers.dev/remake/';
  assert.equal(isInstalled(win(app, { display: 'fullscreen' })), true);
  assert.equal(isInstalled(win(app, { display: 'standalone' })), true);
  assert.equal(isInstalled(win(app, { standalone: true })), true, 'the iPad home-screen app');
  assert.equal(isInstalled(win(app)), false, 'a tab');
  assert.equal(isInstalled(win('http://localhost:8797/remake/?forrit=uppsett')), true, 'the walk');
  assert.equal(isInstalled(win('https://x.example/remake/?forrit=uppsett')), false);

  assert.equal(mayRegister(win(app)), true);
  assert.equal(mayRegister(win('http://localhost:4231/remake/')), false, 'the home server');
  assert.equal(mayRegister(win('http://127.0.0.1:8797/remake/?forrit=1')), true);
  assert.equal(mayRegister(win('http://localhost:8797/remake/?forrit=uppsett')), true);
  assert.equal(mayRegister(win('http://192.168.1.10:4231/remake/?forrit=1')), false, 'a tablet at home');
  assert.equal(mayRegister(win(app, { serviceWorker: null })), false, 'a browser with no service workers');
});
