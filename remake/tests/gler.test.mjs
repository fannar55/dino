import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The glasses renderer (engine/gler.js) draws each eye into a target marked `isXRRenderTarget`, because that mark is the only way
// three r180 tone-maps and sRGB-encodes in the shaders for anything but the screen, and the eyes must be drawn exactly as the screen
// is (the mist and the light shafts blend over encoded values). The mark is three's own, not a promise: three says it will go
// (#23278). These tests read the vendored three and fail when it stops meaning what gler.js needs, so an upgrade of three cannot
// change the picture behind the red and cyan glasses without anyone seeing why.

const three = fs.readFileSync(new URL('../../dist/vendor/three.module.js', import.meta.url), 'utf8');
const gler = fs.readFileSync(new URL('../engine/gler.js', import.meta.url), 'utf8');
const WHY = 'three changed how it treats isXRRenderTarget: look at ensureTargets in remake/engine/gler.js, then check `?gler=1&styrkur=0&adferd=pass` against the same shot without glasses';

test('the eye targets of the glasses renderer are marked as three marks its own screen-like targets', () => {
  assert.match(gler, /\.isXRRenderTarget = true/, 'gler.js marks its eye targets');
  assert.match(gler, /internalFormat = 'RGBA8'/, 'and keeps their storage plain 8-bit');
});

test('three still tone-maps into a target with that mark, as it does onto the screen', () => {
  const places = three.match(/currentRenderTarget === null \|\| _?currentRenderTarget\.isXRRenderTarget === true/g) ?? [];
  assert.equal(places.length, 2, WHY); // the program's parameters, and the renderer's check that they still hold
});

test('three still encodes into such a target in its own colour space, not in linear', () => {
  const places = three.match(/_?currentRenderTarget\.isXRRenderTarget === true \? _?currentRenderTarget\.texture\.colorSpace : LinearSRGBColorSpace/g) ?? [];
  assert.equal(places.length, 2, WHY);
});

test('three still keeps the multisampled storage of such a target free of hardware sRGB', () => {
  assert.match(three, /getInternalFormat\( texture\.internalFormat, glFormat, glType, texture\.colorSpace, renderTarget\.isXRRenderTarget === true \)/, WHY);
});
