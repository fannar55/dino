// Mosi as an app (docs/superpowers/specs/2026-10-31-forrit-an-nets-design.md §3): the manifest that lets Android, the PC and the
// iPad install the game, opening full screen at /remake/ with Mosi's head as its icon, and the page head that names it. Only the
// game page asks to be an app: the guest's page and the separate small games stay pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const pngSize = file => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

test('the manifest makes Mosi an app that opens full screen at the game', () => {
  const m = JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.deepEqual({ id: m.id, name: m.name, short_name: m.short_name, lang: m.lang, start_url: m.start_url, scope: m.scope,
    display: m.display, background_color: m.background_color, theme_color: m.theme_color },
  { id: '/remake/', name: 'Mosi', short_name: 'Mosi', lang: 'is', start_url: '/remake/', scope: '/remake/',
    display: 'fullscreen', background_color: '#cfdde3', theme_color: '#cfdde3' });
  assert.equal(m.orientation, undefined, 'the screen may turn');
  assert.deepEqual(m.icons.map(i => [i.src, i.sizes, i.purpose]), [
    ['assets/icons/icon-192.png', '192x192', 'any'], ['assets/icons/icon-512.png', '512x512', 'any'],
    ['assets/icons/icon-maskable-512.png', '512x512', 'maskable']]);
  for (const icon of m.icons) assert.deepEqual(pngSize(fileURLToPath(new URL(`../${icon.src}`, import.meta.url))), icon.sizes.split('x').map(Number));
  assert.deepEqual(pngSize(fileURLToPath(new URL('../assets/icons/apple-touch-icon.png', import.meta.url))), [180, 180]);
});

test('only the game page asks to be an app', () => {
  const page = name => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
  const index = page('index.html');
  assert.match(index, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.match(index, /<link rel="apple-touch-icon" href="\.\/assets\/icons\/apple-touch-icon\.png">/);
  assert.match(index, /<meta name="apple-mobile-web-app-title" content="Mosi">/);
  assert.doesNotMatch(index, /href="data:,"/);
  for (const other of ['spil.html', 'sloedla-lab.html', 'minnisspil.html']) assert.doesNotMatch(page(other), /rel="manifest"/, other);
});
