import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { parseManifest, checkMedia, imageSize, parseModels, checkModels, MODEL_BYTES } from '../engine/book/media.js';
import { parseCards } from '../engine/book/cards.js';

// The book's pictures (assets/book/media-manifest.json): every real image open-licensed and credited, small enough for a tablet,
// in a format it reads, and every tile a picture that is there (of any kind: the owner approved photographs as tile pictures).
// checkMedia says what is wrong, one line per problem.

/** The frog's card: page one shows `first`, pages two and three `second`. */
const frogCard = (first, second) => ({
  id: 'frog', name: 'Froskur', order: 5, unlock: { found: 'frog' },
  pages: [first, second, second].map((image, i) => ({ image, text: 'Texti.', audio: `book_frog_${i + 1}`, sources: ['Stocker et al. 2019'] })),
});

const drawing = {
  id: 'frog-drawing', src: 'assets/book/images/frog.webp', thumb: 'assets/book/images/frog-thumb.webp', kind: 'illustration',
  license: 'own', source: 'the owner', width: 1024, height: 768,
};
const fossil = {
  id: 'frog-fossil', src: 'assets/book/images/frog-fossil.jpg', thumb: 'assets/book/images/frog-fossil-thumb.jpg', kind: 'fossil',
  credit: 'A. Person', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  source: 'https://commons.wikimedia.org/wiki/File:Frog_fossil.jpg', modifications: 'Made smaller.', sha256: 'ab'.repeat(32), width: 1024, height: 700,
};

/** checkMedia over these entries and one card, with files that measure as their entries say; `missing` files are not there. */
function problems(entries, { card = frogCard(drawing.id, fossil.id), missing = [] } = {}) {
  const sizes = new Map(entries.flatMap(entry => [[entry.src, { width: entry.width, height: entry.height }], [entry.thumb, { width: 320, height: 240 }]]));
  return checkMedia(parseManifest({ images: entries }), [card], {
    exists: path => sizes.has(path) && !missing.includes(path),
    size: path => sizes.get(path) ?? null,
  });
}

test('checkMedia names every problem', () => {
  assert.deepEqual(problems([drawing, fossil]), [], 'a drawing on page one, and a credited fossil after it');
  assert.deepEqual(problems([drawing, fossil], { card: frogCard(fossil.id, drawing.id) }), [], "a fossil on a card's first page is its tile, and that is all right: any kind may be a tile");
  assert.deepEqual(problems([drawing, { ...fossil, kind: 'photo' }], { card: frogCard(fossil.id, drawing.id) }), [], 'so is a photograph');
  const one = (what, found, pattern) => {
    assert.equal(found.length, 1, `${what}: ${JSON.stringify(found)}`);
    assert.match(found[0], pattern, what);
  };
  one('a missing licence', problems([drawing, { ...fossil, license: undefined }]), /frog-fossil.*licen/i);
  one('an unknown licence', problems([drawing, { ...fossil, license: 'CC BY-NC 4.0' }]), /frog-fossil.*CC BY-NC 4\.0/);
  one('a missing file', problems([drawing, fossil], { missing: [fossil.src] }), /frog-fossil.*frog-fossil\.jpg/);
  one('a 2048 px image', problems([drawing, { ...fossil, width: 2048, height: 1536 }]), /frog-fossil.*2048/);
  one('a PNG photo', problems([drawing, { ...fossil, kind: 'photo', src: 'assets/book/images/frog.png' }]), /frog-fossil.*frog\.png/);

  // A teaser has no pages: its tile is its `picture`, which has to be in the manifest (and may be of any kind, like page one's)
  const teaser = picture => ({ id: 'sloedla', name: 'Slóeðla', order: 6, unlock: { place: 'sloedla' }, say: 'k2_mosi_map_sloedla', picture, pages: [] });
  assert.deepEqual(problems([drawing], { card: teaser(drawing.id) }), [], 'a teaser whose tile is a drawing');
  one('a teaser whose picture is not there', problems([drawing], { card: teaser('render-sloedla') }), /"sloedla".*render-sloedla.*not in the manifest/);
  assert.deepEqual(problems([drawing, fossil], { card: teaser(fossil.id) }), [], 'a teaser whose tile is a fossil');
});

test('the shipped manifest is complete', () => {
  const file = path => new URL(`../${path}`, import.meta.url); // paths are read from remake/, as the page reads them
  const read = path => JSON.parse(fs.readFileSync(file(path), 'utf8'));
  const found = checkMedia(parseManifest(read('assets/book/media-manifest.json')), parseCards(read('assets/book/cards.json')), {
    exists: path => fs.existsSync(file(path)),
    size: path => imageSize(fs.readFileSync(file(path))),
  });
  assert.deepEqual(found, []);
});

// The 3D pages' models (the manifest's "models"): a museum's scan is credited and open-licensed like a picture, and light enough
// for the tablet; every page that has a model finds it there.
test('checkModels names every problem', () => {
  const scan = {
    id: 'mosi-skeleton', src: 'assets/book/models/mosi-skeleton.glb', credit: 'Smithsonian Institution', license: 'CC0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', source: 'https://3d.si.edu/object/3d/x', sha256: 'cd'.repeat(32), triangles: 49998, bytes: 1696276,
  };
  const card = model => ({ id: 'mosi', name: 'Mosi', order: 1, unlock: { start: true }, pages: [{ image: 'x', text: 'Texti.', audio: 'book_mosi_1', sources: ['heimild'], model }] });
  const check = (entries, model = scan.src, sizes = { [scan.src]: scan.bytes }) => checkModels(parseModels({ models: entries }), [card(model)], { bytes: path => sizes[path] ?? null });
  const one = (what, found, pattern) => {
    assert.equal(found.length, 1, `${what}: ${JSON.stringify(found)}`);
    assert.match(found[0], pattern, what);
  };
  assert.deepEqual(check([scan]), [], 'a credited CC0 scan on its page');
  assert.deepEqual(check([], null, {}), [], 'no models and no page that has one');
  one('a page whose model is not listed', check([], scan.src), /"mosi" page 1.*mosi-skeleton.glb.*not in the manifest/);
  one('no credit', check([{ ...scan, credit: undefined }]), /mosi-skeleton.*credit/);
  one('a licence that is not open', check([{ ...scan, license: 'CC BY-NC 4.0' }]), /mosi-skeleton.*CC BY-NC 4.0/);
  one('too many triangles', check([{ ...scan, triangles: 150000 }]), /mosi-skeleton.*150000 triangles/);
  one('too heavy', check([scan], scan.src, { [scan.src]: MODEL_BYTES + 1 }), /mosi-skeleton.*bytes/);
  one('not there', check([scan], scan.src, {}), /mosi-skeleton.*not there/);
  assert.deepEqual(check([{ ...scan, turn: 'rock' }]), [], 'a slab that rocks');
  one('a turn the view does not know', check([{ ...scan, turn: 'spin' }]), /mosi-skeleton.*turn is spin/);
  assert.throws(() => parseModels({ models: [scan, { ...scan }] }), /model "mosi-skeleton" is there twice/);
});

test('the shipped models are complete, and each file is the one its sha256 names', () => {
  const file = path => new URL(`../${path}`, import.meta.url);
  const read = path => JSON.parse(fs.readFileSync(file(path), 'utf8'));
  const data = read('assets/book/media-manifest.json');
  const models = parseModels(data);
  const found = checkModels(models, parseCards(read('assets/book/cards.json')), {
    bytes: path => (fs.existsSync(file(path)) ? fs.statSync(file(path)).size : null),
  });
  assert.deepEqual(found, []);
  assert.ok(models.has('assets/book/models/mosi-skeleton.glb'), "Mosi's skeleton is there (the owner's pick, 2026-10-26)");
  for (const model of models.values()) {
    const bytes = fs.readFileSync(file(model.src));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), model.sha256, `${model.id}: the file is the one the manifest names`);
    assert.equal(bytes.length, model.bytes, `${model.id}: its size`);
  }
});
