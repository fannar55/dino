import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { qrModules, qrSvg } from '../engine/fjolspil/qr.js';

const lib = createRequire(import.meta.url)('../vendor/qrcode-generator/qrcode.js');
const URL_TEXT = 'http://192.168.1.10:4198/remake/spil.html?r=GULL';

test('a join address becomes a QR code with its finder patterns', () => {
  const { size, dark } = qrModules(URL_TEXT, { lib });
  assert.ok(size >= 21 && (size - 17) % 4 === 0, `a QR size: ${size}`);
  for (const [r, c] of [[0, 0], [0, 6], [6, 0], [6, 6], [0, size - 1], [size - 1, 0]]) assert.equal(dark(r, c), true, `finder corner ${r},${c}`);
  assert.equal(dark(1, 1), false, 'inside the finder ring');
});

test('the svg is deterministic, has a quiet zone of four, and is coloured by CSS', () => {
  const svg = qrSvg(URL_TEXT, { lib });
  const { size } = qrModules(URL_TEXT, { lib });
  assert.equal(svg, qrSvg(URL_TEXT, { lib }));
  assert.match(svg, new RegExp(`viewBox="0 0 ${size + 8} ${size + 8}"`));
  assert.match(svg, /fill="currentColor"/);
  assert.match(svg, /M4 4h1v1h-1z/, 'the first dark module sits after the quiet zone');
  assert.throws(() => qrSvg(URL_TEXT, { lib: null }), /encoder is not loaded/);
});
