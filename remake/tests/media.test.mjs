import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseManifest, checkMedia, imageSize } from '../engine/book/media.js';
import { parseCards } from '../engine/book/cards.js';

// The book's pictures (assets/book/media-manifest.json): every real image open-licensed and credited, small enough for a tablet,
// in a format it reads, and every tile a drawing. checkMedia says what is wrong, one line per problem.

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
  const one = (what, found, pattern) => {
    assert.equal(found.length, 1, `${what}: ${JSON.stringify(found)}`);
    assert.match(found[0], pattern, what);
  };
  one('a missing licence', problems([drawing, { ...fossil, license: undefined }]), /frog-fossil.*licen/i);
  one('an unknown licence', problems([drawing, { ...fossil, license: 'CC BY-NC 4.0' }]), /frog-fossil.*CC BY-NC 4\.0/);
  one('a missing file', problems([drawing, fossil], { missing: [fossil.src] }), /frog-fossil.*frog-fossil\.jpg/);
  one('a 2048 px image', problems([drawing, { ...fossil, width: 2048, height: 1536 }]), /frog-fossil.*2048/);
  one('a PNG photo', problems([drawing, { ...fossil, kind: 'photo', src: 'assets/book/images/frog.png' }]), /frog-fossil.*frog\.png/);
  one('a fossil on a card\'s first page', problems([drawing, fossil], { card: frogCard(fossil.id, drawing.id) }), /"frog".*frog-fossil.*fossil/);

  // A teaser has no pages: its tile is its `picture`, which has to be in the manifest and a drawing like page one's
  const teaser = picture => ({ id: 'sloedla', name: 'Slóeðla', order: 6, unlock: { place: 'sloedla' }, say: 'k2_mosi_map_sloedla', picture, pages: [] });
  assert.deepEqual(problems([drawing], { card: teaser(drawing.id) }), [], 'a teaser whose tile is a drawing');
  one('a teaser whose picture is not there', problems([drawing], { card: teaser('render-sloedla') }), /"sloedla".*render-sloedla.*not in the manifest/);
  one('a teaser whose picture is a fossil', problems([drawing, fossil], { card: teaser(fossil.id) }), /"sloedla".*frog-fossil.*fossil/);
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
