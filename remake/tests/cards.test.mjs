import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCards, isUnlocked, isNew, PLACEHOLDER } from '../engine/book/cards.js';
import { createSave } from '../engine/save.js';

// The book's cards (assets/book/cards.json): what unlocks each one, and the pages it reads. A card that never unlocks, or data
// that breaks the book, is what would fail a child here.

const SHIPPED = JSON.parse(fs.readFileSync(new URL('../assets/book/cards.json', import.meta.url), 'utf8'));

/** A card as cards.json writes one, with `pages` placeholder pages. */
function card(id, { pages = 3, unlock = { start: true } } = {}) {
  return {
    id, name: id, order: 1, unlock,
    pages: Array.from({ length: pages }, (_, i) => ({ image: `placeholder-${id}`, text: 'Texti.', audio: `book_${id}_${i + 1}`, sources: [PLACEHOLDER] })),
  };
}

test('parseCards accepts the seven cards and refuses broken ones', () => {
  assert.deepEqual(parseCards(SHIPPED).map(c => c.id), ['mosi', 'kambedla', 'kalligrammatid', 'beetle', 'frog', 'snail', 'birds'], 'in card order');

  const refused = (cards, pattern, what) => assert.throws(() => parseCards({ cards }), pattern, what);
  refused([card('frog', { pages: 2 })], /"frog".*2 pages/, 'two pages');
  refused([card('frog', { pages: 6 })], /"frog".*6 pages/, 'six pages');
  refused([card('frog'), card('snail'), card('frog')], /"frog".*twice/, 'a duplicate id');
  refused([card('frog', { unlock: { found: 3 } })], /"frog".*unlock/, 'an unlock that is not a find\'s id');
  const unsourced = card('frog');
  unsourced.pages[1].sources = [];
  refused([unsourced], /"frog" page 2.*sources/, 'a page with no sources');
});

test('unlocks follow finds, the star and the start', () => {
  const cards = parseCards(SHIPPED);
  const open = state => cards.filter(c => isUnlocked(c, { stars: [], findings: [], seen: [], ...state })).map(c => c.id);
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
  for (const card of parseCards(SHIPPED)) {
    card.pages.forEach((page, i) => {
      assert.ok(!page.sources.includes(PLACEHOLDER), `${card.id} page ${i + 1} is still a placeholder`);
      assert.equal(page.audio, `book_${card.id}_${i + 1}`, `${card.id} page ${i + 1}: the line's id`);
      assert.equal(lines.get(page.audio)?.text, page.text, `${page.audio}: the line says what the page says`);
      assert.equal(lines.get(page.audio)?.speaker, 'narrator');
    });
  }
});
