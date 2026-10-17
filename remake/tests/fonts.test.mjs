// The bundled typeface (STYLE.md section 10): Nunito, one rounded face that has every Icelandic letter, kept in assets/fonts/ with its
// licence so the game and the book read the same on a tablet that is offline. The owner chose it on 2026-10-17 for the book and for
// the chapter's captions and buttons. These tests pin the file's bytes, the one @font-face the game's sheet and the book's sheet
// each declare, the font stack both start with Nunito, and the preload in both pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

const FONT = new URL('../assets/fonts/nunito-latin.woff2', import.meta.url);
const LICENCE = new URL('../assets/fonts/OFL.txt', import.meta.url);
const FONT_SHA256 = 'ba344451eab25b217a165363b1982048a5e5830a0daf36577973955a04cac793'; // Google Fonts' Nunito v32, Latin subset (a variable font)
const LICENCE_SHA256 = '580df76c95a1ec5ab878ceb25bb3d85c6a076804e9c970c8c6972aea775fdf65'; // googlefonts/nunito OFL.txt
const STACK = '"Nunito", ui-rounded, "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fileOf = name => new URL(`../${name}`, import.meta.url);
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const read = name => fs.readFileSync(fileOf(name), 'utf8');

/** The declarations of every @font-face in a style sheet, one object each, with the white space made single. */
function fontFaces(css) {
  return [...stripComments(css).matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => Object.fromEntries(
    body.split(';').map(declaration => declaration.trim()).filter(Boolean).map(declaration => {
      const colon = declaration.indexOf(':');
      return [declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim().replace(/\s+/g, ' ')];
    })));
}
const nunitoFaces = sheet => fontFaces(read(sheet)).filter(face => /^["']?Nunito["']?$/.test(face['font-family']));

test('the font is Nunito\'s Latin variable font, byte for byte', () => {
  assert.ok(fs.existsSync(FONT), 'remake/assets/fonts/nunito-latin.woff2 is there');
  const bytes = fs.readFileSync(FONT);
  assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', 'a WOFF2 file');
  assert.equal(bytes.length, 39128);
  assert.equal(sha256(bytes), FONT_SHA256);
});

test('the licence travels with the font: the SIL Open Font License, Version 1.1, byte for byte', () => {
  assert.ok(fs.existsSync(LICENCE), 'remake/assets/fonts/OFL.txt sits beside the font');
  const bytes = fs.readFileSync(LICENCE);
  const text = bytes.toString('utf8');
  assert.match(text, /SIL Open Font License, Version 1\.1/, 'it names the licence');
  assert.match(text, /The Nunito Project Authors/, 'and whose font it covers');
  assert.equal(sha256(bytes), LICENCE_SHA256);
});

for (const sheet of ['style.css', 'book.css']) {
  test(`${sheet} declares Nunito once: the bundled file, weights 400 to 900, no network and no installed copy`, () => {
    const faces = nunitoFaces(sheet);
    assert.equal(faces.length, 1, `${sheet} has exactly one @font-face for "Nunito"`);
    const [face] = faces;
    const source = /^url\("([^"]+)"\) format\("woff2"\)$/.exec(face.src);
    assert.ok(source, `its only source is the file, as woff2 (no local(), no second url): ${face.src}`);
    assert.doesNotMatch(source[1], /^([a-z][a-z0-9+.-]*:|\/\/)/i, 'a path, not an address on the network');
    assert.equal(new URL(source[1], fileOf(sheet)).href, FONT.href, 'the url, read from the style sheet, reaches the bundled file');
    assert.equal(face['font-weight'], '400 900');
    assert.equal(face['font-display'], 'block', 'a local file is there before the first frame, so no frame shows a fallback face');
  });
}

test('the game\'s sheet and the book\'s sheet declare the same @font-face, word for word', () => {
  // The lab links only book.css and the game links only style.css, and neither sheet can take the other without its page-wide
  // rules (body, the tray, the journal), so each declares the face. In a page that links both, the two are one face by one url.
  const [game, book] = [nunitoFaces('style.css'), nunitoFaces('book.css')];
  assert.ok(game.length === 1 && book.length === 1, 'each has the face to compare');
  assert.deepEqual(book, game);
});

test('the page and the book name Nunito first, in the same stack', () => {
  const style = stripComments(read('style.css'));
  const page = /^html, body\s*\{([^}]*)\}/m.exec(style)?.[1];
  assert.ok(page, 'style.css has its html, body rule');
  assert.equal(/(?:^|;)\s*font-family:\s*([^;]+)/.exec(page)?.[1].trim(), STACK, 'the page reads Nunito: captions, buttons, the start screen and the journal');

  const book = stripComments(read('book.css'));
  assert.equal(/--book-font:\s*([^;]+);/.exec(book)?.[1].trim(), STACK, '--book-font starts with Nunito');
  assert.match(/^\.book\s*\{([^}]*)\}/m.exec(book)?.[1] ?? '', /font-family:\s*var\(--book-font\)/, 'and the book reads it');
});

test('no other typeface is named in either sheet, so Nunito shows everywhere (the debug readout keeps its monospace)', () => {
  for (const sheet of ['style.css', 'book.css']) {
    const css = stripComments(read(sheet)).replace(/@font-face\s*\{[^}]*\}/g, '');
    const named = [...css.matchAll(/(?:^|[;{\s])(font-family|font)\s*:\s*([^;}]+)/g)].map(([, property, value]) => `${property}: ${value.trim()}`);
    assert.ok(named.length >= 2, `${sheet} sets fonts to check`);
    for (const declaration of named) {
      assert.match(declaration, /: (inherit|var\(--book-font\)|"Nunito", .+|.*\bmonospace)$/, `${sheet} keeps to Nunito's stack, inherits it or is the readout: ${declaration}`);
    }
  }
});

test('both pages preload the font, so no frame shows a fallback face', () => {
  for (const page of ['index.html', 'book-lab.html']) {
    const preloads = [...read(page).matchAll(/<link\b[^>]*>/gi)].map(match => match[0]).filter(tag => /\brel="preload"/i.test(tag));
    assert.equal(preloads.length, 1, `${page} has one preload`);
    const [tag] = preloads;
    assert.match(tag, /\bas="font"/);
    assert.match(tag, /\btype="font\/woff2"/);
    assert.match(tag, /\bcrossorigin\b/, 'a font is always fetched anonymously, and a preload without crossorigin would be fetched a second time');
    assert.equal(new URL(/\bhref="([^"]+)"/.exec(tag)?.[1] ?? 'missing', fileOf(page)).href, FONT.href, 'and it is the file the style sheets use');
  }
});
