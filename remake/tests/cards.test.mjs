import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCards, isUnlocked, isNew, bookState, PLACEHOLDER, FIND_ME } from '../engine/book/cards.js';
import { createSave } from '../engine/save.js';

// The book's cards (assets/book/cards.json): what unlocks each one, and the pages it reads. A card that never unlocks, or data
// that breaks the book, is what would fail a child here.

const SHIPPED = JSON.parse(fs.readFileSync(new URL('../assets/book/cards.json', import.meta.url), 'utf8'));

/** A card as cards.json writes one, with `pages` placeholder pages. */
function card(id, { pages = 3, unlock = { start: true }, spread } = {}) {
  return {
    id, name: id, order: 1, unlock, ...(spread === undefined ? {} : { spread }),
    pages: Array.from({ length: pages }, (_, i) => ({ image: `placeholder-${id}`, text: 'Texti.', audio: `book_${id}_${i + 1}`, sources: [PLACEHOLDER] })),
  };
}

test('parseCards accepts the shipped cards and refuses broken ones', () => {
  assert.deepEqual(parseCards(SHIPPED).map(c => c.id), [
    'mosi', 'kambedla', 'thorsedla', 'gramedla', 'uggedla', 'sloedla', 'flugedla', // the seven dinosaurs, Risaeðlur's tiles
    'kalligrammatid', 'beetle', 'frog', 'snail', 'birds', // chapter 1's five animals
    'waterbeetle', 'waterstrider', 'salamander', 'dragonfly', 'turtle', 'fish', 'earlybird', // and the Fen's, as the child meets them
  ], 'in card order');

  const refused = (cards, pattern, what) => assert.throws(() => parseCards({ cards }), pattern, what);
  refused([card('frog', { pages: 2 })], /"frog".*2 pages/, 'two pages');
  assert.equal(parseCards({ cards: [card('frog', { pages: 6 })] })[0].pages.length, 6, "six pages: the frog's, with its Fen page");
  refused([card('frog', { pages: 11 })], /"frog".*11 pages/, 'eleven pages');
  assert.equal(parseCards({ cards: [card('frog', { pages: 10 })] })[0].pages.length, 10, 'ten pages: a card may have up to ten');
  refused([card('frog'), card('snail'), card('frog')], /"frog".*twice/, 'a duplicate id');
  refused([card('frog', { unlock: { found: 3 } })], /"frog".*unlock/, 'an unlock that is not a find\'s id');
  refused([card('frog', { unlock: { place: '' } })], /"frog".*unlock/, 'a place that is not an id');
  const unsourced = card('frog');
  unsourced.pages[1].sources = [];
  refused([unsourced], /"frog" page 2.*sources/, 'a page with no sources');
  for (const spread of [0, 1.5, '2', -1]) refused([card('frog', { spread })], /"frog".*spread/, `a spread of ${JSON.stringify(spread)}`);
  const nine = Array.from({ length: 9 }, (_, i) => card(`fen${i}`, { spread: 2 }));
  refused(nine, /spread 2.*9 cards/, 'nine cards on one spread: a spread has two pages of four');
  const eight = Array.from({ length: 8 }, (_, i) => card(`fen${i}`, { spread: 2 }));
  assert.equal(parseCards({ cards: eight }).length, 8, 'eight on the last spread');
  refused([...eight, card('owl', { spread: 3 })], /spread 2.*8 cards.*7/, 'but seven when a later spread follows, whose corner takes the eighth place');
});

test('a card with no spread is on the first, and each spread says where its animals are found', () => {
  const cards = parseCards({
    cards: [card('frog'), card('turtle', { spread: 2 }), card('owl', { spread: 3 })],
    spreads: [{ spread: 2, findMe: 'book_find_me_fen' }],
  });
  assert.deepEqual(cards.map(c => [c.id, c.spread, c.findMe]), [
    ['frog', 1, FIND_ME], // chapter 1's, as cards.json has always written them: no spread
    ['turtle', 2, 'book_find_me_fen'],
    ['owl', 3, FIND_ME], // a spread cards.json says nothing about finds its animals in the forest
  ]);
  const refused = (data, pattern, what) => assert.throws(() => parseCards(data), pattern, what);
  refused({ cards: [card('frog')], spreads: [{ spread: 2 }] }, /spread 2.*findMe/, 'a spread with no line');
  refused({ cards: [card('frog')], spreads: { 2: 'book_find_me_fen' } }, /spreads/, 'spreads that are not a list');

  // The shipped cards: chapter 1's five animals on the first spread, written as they were (no spread), and the Fen's seven on the
  // second. The dinosaurs name no spread either, but they are on the Risaeðlur page and do not count toward a spread's tiles.
  const shipped = parseCards(SHIPPED);
  const first = SHIPPED.cards.filter(c => !('spread' in c) && c.group !== 'dinosaur').map(c => c.id);
  assert.deepEqual(first, ['kalligrammatid', 'beetle', 'frog', 'snail', 'birds']);
  assert.deepEqual(shipped.filter(c => c.group === 'animal' && c.spread === 1).map(c => c.id), first);
  assert.deepEqual(shipped.filter(c => c.spread === 2).map(c => c.findMe), Array(7).fill('book_find_me_fen'), 'the Fen\'s say "Finndu mig í Feninu!"');
  const lines = new Map(JSON.parse(fs.readFileSync(new URL('../assets/audio/book/lines-source.json', import.meta.url), 'utf8')).map(line => [line.id, line]));
  assert.equal(lines.get('book_find_me_fen')?.text, 'Finndu mig í Feninu!');
});

test('a card found again opens on its refind page: the frog\'s Fen page, the last page of any card that names none', () => {
  const cards = parseCards(SHIPPED);
  const frog = cards.find(c => c.id === 'frog');
  assert.equal(frog.refind, 5, 'the frog\'s sixth page, the one the Fen added');
  assert.equal(frog.pages[frog.refind].image, 'fen-frog');
  for (const c of cards.filter(c => c.id !== 'frog' && c.pages.length)) assert.equal(c.refind, c.pages.length - 1, `${c.id}: its last page`);
  assert.equal(parseCards([{ ...card('a', { pages: 4 }), refind: 2 }])[0].refind, 1, 'from 1 in the file, from 0 in code');
  for (const refind of [0, 5, 1.5, '2']) {
    assert.throws(() => parseCards([{ ...card('a', { pages: 4 }), refind }]), /card "a" has a refind/, `refind ${JSON.stringify(refind)}`);
  }
});

test('unlocks follow finds, the star and the start', () => {
  const cards = parseCards(SHIPPED);
  const open = state => cards.filter(c => isUnlocked(c, { stars: [], findings: [], seen: [], places: [], fossils: [], ...state })).map(c => c.id);
  assert.deepEqual(open({}), ['mosi'], 'Mosi from the start');
  assert.deepEqual(open({ findings: ['butterfly'] }), ['mosi', 'kalligrammatid'], 'the butterfly the child taps opens the Kalligrammatid');
  assert.deepEqual(open({ stars: ['k1_kambedla'] }), ['mosi', 'kambedla'], 'Kambeðla with her star');
  assert.equal(open({ stars: ['k1_kambedla'], findings: ['beetle', 'frog', 'snail', 'birds', 'butterfly'] }).length, 7, 'every find chapter 1 makes opens its card');
});

test('new until seen', () => {
  const [mosi, kambedla] = parseCards(SHIPPED);
  const save = createSave(null);
  assert.equal(isNew(mosi, save.get()), true, 'unlocked and never opened');
  assert.equal(isNew(kambedla, save.get()), false, 'a card that is not unlocked is not new');
  assert.equal(save.addSeen('mosi'), true);
  assert.equal(isNew(mosi, save.get()), false);
  assert.equal(save.addSeen('mosi'), false, 'seen once');
});

test("the shipped cards are written and sourced, and the narrator has a line for each page with the page's own text", () => {
  const lines = new Map(JSON.parse(fs.readFileSync(new URL('../assets/audio/book/lines-source.json', import.meta.url), 'utf8')).map(line => [line.id, line]));
  // Mosi's and Kambeðla's ten pages: the five each had keep their lines (1 to 5), the five added later are 6 to 10, in the owner's page
  // order; the other five dinosaurs have nine pages, lines 1 to 9 in page order.
  const LINE_ORDER = { mosi: [1, 6, 7, 3, 8, 9, 10, 2, 4, 5], kambedla: [1, 6, 7, 3, 8, 9, 4, 10, 2, 5] };
  for (const card of parseCards(SHIPPED)) {
    card.pages.forEach((page, i) => {
      assert.ok(!page.sources.includes(PLACEHOLDER), `${card.id} page ${i + 1} is still a placeholder`);
      assert.equal(page.audio, `book_${card.id}_${LINE_ORDER[card.id]?.[i] ?? i + 1}`, `${card.id} page ${i + 1}: the line's id`);
      assert.equal(lines.get(page.audio)?.text, page.text, `${page.audio}: the line says what the page says`);
      assert.equal(lines.get(page.audio)?.speaker, 'narrator');
    });
  }
});

test('a teaser card has no pages, but a line for Mosi to say and a picture for its tile', () => {
  const teaser = (extra = {}) => ({ id: 'sloedla', name: 'Slóeðla', order: 1, group: 'dinosaur', unlock: { place: 'sloedla' }, pages: [], ...extra });
  const [parsed] = parseCards({ cards: [teaser({ say: 'k2_mosi_map_sloedla', picture: 'render-sloedla' })] });
  assert.deepEqual([parsed.group, parsed.say, parsed.picture, parsed.pages.length], ['dinosaur', 'k2_mosi_map_sloedla', 'render-sloedla', 0]);
  assert.throws(() => parseCards({ cards: [teaser({ picture: 'render-sloedla' })] }), /"sloedla".*say/, 'no say');
  assert.throws(() => parseCards({ cards: [teaser({ say: 'k2_mosi_map_sloedla' })] }), /"sloedla".*picture/, 'no picture');
  assert.throws(() => parseCards({ cards: [teaser({ say: 'k2_mosi_map_sloedla', picture: 'render-sloedla', group: 'plant' })] }), /"sloedla".*group/, 'an unknown group');

  const frog = parseCards({ cards: [card('frog')] })[0];
  assert.deepEqual([frog.group, frog.say, frog.picture], ['animal', null, 'placeholder-frog'], "a card with pages is an animal, says nothing, and its tile is page one's picture");
  const own = card('frog');
  own.picture = 'render-frog';
  own.pages[2].model = 'assets/characters/frog.glb';
  const [custom] = parseCards({ cards: [own] });
  assert.equal(custom.picture, 'render-frog', 'a picture of its own');
  assert.deepEqual(custom.pages.map(page => page.model), [null, null, 'assets/characters/frog.glb'], 'a page may carry a 3D model');
});

test('a place and a fossil unlock a card, read from the save by bookState', () => {
  const save = createSave(null);
  const place = parseCards({ cards: [card('sloedla', { unlock: { place: 'sloedla' } })] })[0];
  const fossil = parseCards({ cards: [card('amber', { unlock: { fossil: 'amber' } })] })[0];
  assert.deepEqual(bookState(save), { stars: [], findings: [], seen: [], places: [], fossils: [] });
  assert.equal(isUnlocked(place, bookState(save)), false);
  assert.equal(isUnlocked(fossil, bookState(save)), false);
  save.addPlace('sloedla');
  save.addHalsFound('amber');
  assert.equal(isUnlocked(place, bookState(save)), true, 'the place on the map');
  assert.equal(isUnlocked(fossil, bookState(save)), true, 'the fossil in the collection');
  assert.equal(isNew(place, bookState(save)), true, 'unlocked and not opened');
  assert.equal(isUnlocked(place, bookState(createSave(null))), false, 'another save has neither');
});

test("the shipped dinosaurs are the seven, in order; the five after Kambeðla have nine pages each, no say, and a render as page one and tile", () => {
  const dinosaurs = parseCards(SHIPPED).filter(c => c.group === 'dinosaur');
  assert.deepEqual(dinosaurs.map(c => c.id), ['mosi', 'kambedla', 'thorsedla', 'gramedla', 'uggedla', 'sloedla', 'flugedla']);
  assert.deepEqual(dinosaurs.slice(2).map(c => [c.id, c.pages.length, c.say, c.picture, c.pages[0].image]), [
    ['thorsedla', 9, null, 'render-thorsedla', 'render-thorsedla'],
    ['gramedla', 9, null, 'render-gramedla', 'render-gramedla'],
    ['uggedla', 9, null, 'render-uggedla', 'render-uggedla'],
    ['sloedla', 9, null, 'render-sloedla', 'render-sloedla'],
    ['flugedla', 9, null, 'render-flugedla', 'render-flugedla'],
  ]);
  assert.deepEqual(dinosaurs.slice(2).map(c => c.unlock), [{ star: 'k2_thorsedla' }, { star: 'k3_gramedla' }, { place: 'uggedla' }, { place: 'sloedla' }, { place: 'flugedla' }]);
  assert.deepEqual(dinosaurs.slice(0, 2).map(c => c.pages.length), [10, 10], 'Mosi and Kambeðla have ten pages each');
  assert.ok(parseCards(SHIPPED).filter(c => c.group !== 'dinosaur').every(c => c.group === 'animal'), 'the rest are animals');
});
