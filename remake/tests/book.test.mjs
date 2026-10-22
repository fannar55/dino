import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBook } from '../engine/book/book.js';
import { parseCards, isUnlocked, PLACEHOLDER } from '../engine/book/cards.js';
import { parseManifest } from '../engine/book/media.js';
import { createJournal, FLIGHT_SECONDS } from '../engine/scene/journal.js';
import { createBookAudio } from '../engine/book/book-audio.js';
import { createCardViewer } from '../engine/book/card-viewer.js';
import { createSave } from '../engine/save.js';
import { DONE } from '../engine/handle.js';
import { FakeDocument, pointerEvent } from './fake-dom.mjs';
import { createFakeContext, FakeAudio, withAudio } from './fake-audio.mjs';

// The book's shell (engine/book/book.js): who holds the game while it is open, the ribbons, and a book that is shut saying nothing.

/** The book on a page with its #book, a save in memory, and a record of the pauses it asks for and the sounds it plays. */
function rig({ onPause, audio } = {}) {
  const doc = new FakeDocument(['book']);
  const pauses = [];
  const sounds = [];
  const book = createBook(doc, {
    save: createSave(null),
    audio: audio ?? { sfx: name => { sounds.push(name); return true; }, stop() {}, narrate: () => DONE },
    onPause: onPause ?? (paused => pauses.push(paused)),
  });
  const root = doc.getElementById('book');
  const all = name => root.findAll(e => e.classList.contains(name));
  const ribbon = tab => all('ribbon').find(r => r.getAttribute('data-tab') === tab);
  const tap = el => {
    el.dispatchEvent(pointerEvent('pointerdown', { x: 10, y: 10 }));
    el.dispatchEvent(pointerEvent('pointerup', { x: 10, y: 10 }));
  };
  return { book, root, pauses, sounds, all, ribbon, tap, close: () => tap(all('book-close')[0]) };
}

test('a child\'s open holds the game and closing lets it go', () => {
  const { book, root, pauses, close } = rig();
  assert.equal(root.hidden, true, 'shut until it is opened');
  book.open('animals', 'child');
  assert.equal(book.isOpen, true);
  assert.equal(root.hidden, false);
  assert.equal(book.tab, 'animals');
  assert.deepEqual(pauses, [true], 'the game holds still');
  close();
  assert.equal(book.isOpen, false);
  assert.equal(root.hidden, true);
  assert.deepEqual(pauses, [true, false], 'and goes on when it is shut');

  // A pause that fails is said, and leaves no book half open.
  const reported = [];
  const original = console.error;
  console.error = (...args) => reported.push(args);
  try {
    const broken = rig({ onPause: () => { throw new Error('no audio'); } });
    broken.book.open('stars', 'child');
    assert.equal(broken.root.hidden, false);
    broken.close();
    assert.equal(broken.root.hidden, true);
  } finally {
    console.error = original;
  }
  assert.equal(reported.length, 2);
});

test('a book code opened holds nothing until the child taps inside it', () => {
  const { book, root, pauses, close } = rig();
  book.open('stars', 'script'); // the chapter's last scene, while Mosi speaks
  assert.equal(book.isOpen, true);
  assert.deepEqual(pauses, [], 'the scene goes on under it');
  book.close();
  assert.deepEqual(pauses, [], 'and shutting it lets nothing go');

  book.open('stars', 'script');
  root.dispatchEvent(pointerEvent('pointerdown', { x: 400, y: 300 })); // the child touches the book
  assert.deepEqual(pauses, [true], 'it is the child\'s now');
  root.dispatchEvent(pointerEvent('pointerdown', { x: 420, y: 300 }));
  assert.deepEqual(pauses, [true], 'once');
  close();
  assert.deepEqual(pauses, [true, false], 'and the game goes on when the child shuts it');

  book.open('stars', 'script');
  close(); // a child who only shuts it
  assert.deepEqual(pauses, [true, false], 'resumes nothing that was not held');
});

test('ribbons switch pages with a turn sound', () => {
  const { book, all, ribbon, tap, sounds } = rig();
  book.open('stars', 'child');
  const leaf = tab => all('book-leaf').find(l => l.getAttribute('data-tab') === tab);
  assert.equal(ribbon('stars').getAttribute('aria-selected'), 'true');
  assert.equal(leaf('stars').hidden, false);
  sounds.length = 0;

  tap(ribbon('animals'));
  assert.equal(book.tab, 'animals');
  assert.equal(ribbon('animals').getAttribute('aria-selected'), 'true');
  assert.equal(ribbon('stars').getAttribute('aria-selected'), 'false');
  assert.equal(leaf('animals').hidden, false);
  assert.equal(leaf('stars').hidden, true);
  assert.deepEqual(sounds, ['turn']);

  tap(ribbon('animals')); // the page that is open already
  assert.equal(book.tab, 'animals');
  assert.deepEqual(sounds, ['turn', 'tap'], 'a tap, and no turn');
  tap(ribbon('stars'));
  assert.equal(book.tab, 'stars');
  assert.deepEqual(sounds, ['turn', 'tap', 'turn']);
});

/** The book over a save of its own, with what it narrates, the sounds it makes and the games it hands on. */
function savedRig(fill = () => {}) {
  const save = createSave(null);
  fill(save);
  const narrated = [];
  const played = [];
  const sounds = [];
  const audio = { sfx: name => { sounds.push(name); return true; }, stop() {}, narrate: id => { narrated.push(id); return DONE; } };
  const doc = new FakeDocument(['book']);
  const book = createBook(doc, { save, audio, onPause() {}, onPlay: game => played.push(game) });
  const root = doc.getElementById('book');
  const tap = el => {
    el.dispatchEvent(pointerEvent('pointerdown', { x: 10, y: 10 }));
    el.dispatchEvent(pointerEvent('pointerup', { x: 10, y: 10 }));
  };
  return { save, book, root, narrated, played, sounds, tap };
}

test('the book has a Kortið page with the found places', () => {
  const { save, book, root, narrated, sounds, tap } = savedRig(save => {
    save.addStar('k1_kambedla');
    save.addPlace('sloedla');
  });
  const ribbons = root.findAll(e => e.classList.contains('ribbon'));
  assert.deepEqual(ribbons.map(r => r.getAttribute('data-tab')), ['stars', 'animals', 'games', 'map', 'fossils'], 'the map after the games');
  const ribbon = ribbons.find(r => r.getAttribute('data-tab') === 'map');
  assert.match(ribbon.innerHTML, /<span class="ribbon-label">Kortið<\/span>/, 'its ribbon says Kortið');
  assert.match(ribbon.innerHTML, /class="book-icon"/, 'with a drawn icon');
  book.open('map', 'child');
  assert.equal(book.tab, 'map');
  const leaf = root.findAll(e => e.classList.contains('book-leaf') && e.getAttribute('data-tab') === 'map')[0];
  assert.equal(leaf.hidden, false, 'its leaf shows');
  // the drawn map lies across the two pages, half on each
  const halves = leaf.findAll(e => e.tagName === 'IMG' && /assets\/book\/map\.svg$/.test(e.src));
  assert.equal(halves.length, 2, 'map.svg, half on each page');
  // a slot for the Fen and for each of the six friends
  const marker = id => leaf.findAll(e => e.getAttribute('data-place') === id)[0];
  for (const id of ['fen', 'kambedla', 'thorsedla', 'sloedla', 'flugedla', 'uggedla', 'gramedla']) assert.ok(marker(id), `a slot for ${id}`);
  // Kambeðla's star is in the book: her place is done, a star with her sticker. Slóeðla was found: her sticker. The rest wait, empty.
  const state = id => ['empty', 'found', 'done'].filter(name => marker(id).classList.contains(name));
  assert.deepEqual(state('kambedla'), ['found', 'done']);
  assert.deepEqual(state('sloedla'), ['found']);
  for (const id of ['fen', 'thorsedla', 'flugedla', 'uggedla', 'gramedla']) assert.deepEqual(state(id), ['empty'], `${id} waits`);
  const sticker = id => marker(id).findAll(e => e.tagName === 'IMG')[0];
  assert.match(sticker('sloedla').src, /parasaurolophus\.webp$/, 'Slóeðla\'s sticker is her picture');
  assert.equal(sticker('uggedla'), undefined, 'an empty slot shows no one');
  assert.ok(marker('kambedla').findAll(e => e.classList.contains('map-star')).length === 1, 'a done place wears a star');
  assert.ok(marker('sloedla').findAll(e => e.classList.contains('map-star')).length === 0, 'a found one not yet');
  // A tap on a found or done place: Mosi says its name and a sentence. On an empty slot only the book's tap.
  tap(marker('sloedla'));
  tap(marker('kambedla'));
  assert.deepEqual(narrated, ['k2_mosi_map_sloedla', 'k2_mosi_map_kambedla']);
  sounds.length = 0;
  tap(marker('uggedla'));
  assert.deepEqual(narrated, ['k2_mosi_map_sloedla', 'k2_mosi_map_kambedla'], 'an empty slot is silent');
  assert.deepEqual(sounds, ['tap'], 'but for the book\'s tap');
  // The page keeps up with what the chapter adds: a place found from Þórseðla's head, and her star, which is the Fen's too.
  save.addPlace('uggedla');
  save.addStar('k2_thorsedla');
  book.refresh();
  assert.deepEqual(state('uggedla'), ['found']);
  assert.deepEqual(state('thorsedla'), ['found', 'done']);
  assert.deepEqual(state('fen'), ['found', 'done'], 'the Fen is done with Þórseðla\'s star');
  tap(marker('fen'));
  assert.equal(narrated.at(-1), 'k2_mosi_map_fen');
});

test('Háls og hali opens with Þórseðla\'s star', () => {
  const { save, book, root, played, sounds, tap } = savedRig();
  const tile = root.findAll(e => e.getAttribute('data-game') === 'hals')[0];
  book.open('games', 'child');
  assert.equal(tile.parentNode.hidden, false, 'the tile is on the Leikir page');
  assert.ok(tile.classList.contains('unfound'), 'shut until her star is in the book');
  assert.match(tile.getAttribute('aria-label'), /stjörnu Þórseðlu/, 'and says what opens it');
  sounds.length = 0;
  tap(tile);
  assert.deepEqual(played, [], 'it wiggles, and opens nothing');
  assert.deepEqual(sounds, ['wiggle']);
  save.addStar('k2_thorsedla');
  book.refresh();
  assert.ok(tile.classList.contains('new') && !tile.classList.contains('unfound'), 'with her star it opens, new');
  tap(tile);
  assert.deepEqual(played, ['hals'], 'and a tap plays it');
  assert.ok(tile.classList.contains('found') && !tile.classList.contains('new'), 'new no more once played');
});

// Review Focus 2: narration never outlives what it reads, and nothing plays after the book is shut.
test('closing the book stops narration', () => withAudio(() => {
  const audio = createBookAudio({ context: createFakeContext({ state: 'running' }), lines: { book_mosi_1: { src: 'book_mosi_1.mp3', duration: 2 } } });
  const { book, close } = rig({ audio });
  book.open('animals', 'child');
  const line = audio.narrate('book_mosi_1'); // a page reading
  close();
  assert.equal(line.cancelled, true);
  assert.equal(FakeAudio.made[0].paused, true, 'nothing reads on after the book is shut');
}));

// Review Focus 1: a child who taps the arrow again and again turns one page per flip, and never past the last page.
test('rapid taps on next turn one page per settled flip and stop at the last page', () => {
  const doc = new FakeDocument(['book']);
  const animations = [];
  const create = doc.createElement.bind(doc);
  doc.createElement = tag => { // every element can animate, and a test says when its animation is over
    const element = create(tag);
    element.animate = () => {
      const animation = { cancel() {}, finish() { this.onfinish?.(); } };
      animations.push(animation);
      return animation;
    };
    return element;
  };
  const root = doc.getElementById('book');
  const viewer = createCardViewer(doc, root, { audio: { sfx() {}, stop() {}, narrate: () => DONE } });
  const card = { id: 'frog', name: 'Froskur', pages: [1, 2, 3].map(n => ({ image: 'none', text: `Texti ${n}.`, audio: `book_frog_${n}`, sources: ['heimild'] })) };
  assert.equal(viewer.open(card), true);
  const next = root.findAll(e => e.classList.contains('card-arrow') && e.classList.contains('next'))[0];
  const tapNext = () => {
    next.dispatchEvent(pointerEvent('pointerdown', { x: 10, y: 10 }));
    next.dispatchEvent(pointerEvent('pointerup', { x: 10, y: 10 }));
  };
  const settle = () => animations.forEach(animation => animation.finish());

  for (let i = 0; i < 5; i++) tapNext();
  assert.equal(viewer.page, 1, 'five taps within one flip turn one page');
  settle();
  tapNext();
  assert.equal(viewer.page, 2, 'and the next flip is the next page');
  settle();
  tapNext();
  assert.equal(viewer.page, 2, 'never past the last page');
});

// ---------------------------------------------------------------------------------------------
// The Fen's animals (chapter 2): their cards, on a second Dýrin spread of their own

const readJson = path => JSON.parse(fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const CARD_DATA = readJson('assets/book/cards.json');
const CARDS = parseCards(CARD_DATA);
const MEDIA = parseManifest(readJson('assets/book/media-manifest.json'));
/** The Fen's seven new cards, each by the finding that opens it (world/critters/models.js's kinds, which chapter 2 passes to s.found). */
const FEN = { waterbeetle: 'waterBeetle', waterstrider: 'waterStrider', salamander: 'salamander', dragonfly: 'dragonfly', turtle: 'turtle', fish: 'fish', earlybird: 'earlyBird' };
const FEN_NAMES = { waterbeetle: 'Brunnklukka', waterstrider: 'Vatnalæsingi', salamander: 'Salamandra', dragonfly: 'Drekafluga', turtle: 'Skjaldbaka', fish: 'Fiskur', earlybird: 'Fornfugl' };
/** The frog's five pages as chapter 1 wrote and recorded them, which its Fen page must leave alone. */
const FROG_PAGES = [
  ['placeholder-frog', 'Þetta er froskur. Froskar hoppuðu um þegar risaeðlurnar voru uppi!'],
  ['frog-skeleton', 'Forfeður froskanna fengu lengri fætur og styttra skott. Þá fóru þeir að hoppa!'],
  ['triadobatrachus-fossil', 'Við vitum þetta af steingervingum. Þessi forni ættingi froska var enn með skott!'],
  ['frog-photo', 'Froskar lifðu af þegar risaeðlurnar dóu út. Þeir eru enn að hoppa!'],
  ['eopelobates-fossil', 'Stukku fyrstu froskarnir langt eða hoppuðu þeir stutt? Það vitum við ekki enn.'],
];

test('the fen cards unlock with their findings and have three pages each', () => {
  const nobody = { stars: [], findings: [], seen: [] };
  for (const [id, find] of Object.entries(FEN)) {
    const card = CARDS.find(c => c.id === id);
    assert.ok(card, `a card for the ${find}`);
    assert.equal(card.id, find.toLowerCase(), 'its id is its finding\'s, in lower case (the narrator\'s lines are lower case)');
    assert.deepEqual(card.unlock, { found: find }, `${id} opens with the ${find} the child finds`);
    assert.equal(isUnlocked(card, nobody), false, `${id} waits for its animal`);
    assert.equal(isUnlocked(card, { ...nobody, findings: [find] }), true, `${id} opens once it is found`);
    assert.equal(card.name, FEN_NAMES[id], 'with the name the game gives it');
    assert.equal(card.pages.length, 3, `${id} has three pages`);
    assert.equal(card.spread, 2, `${id} is on the Fen's spread`);
    assert.equal(card.pages[0].image, `fen-${id}`, 'its tile is our drawing of it');
    assert.equal(MEDIA.get(`fen-${id}`)?.src, `assets/book/images/fen-${id}.svg`);
    card.pages.forEach((page, i) => {
      assert.equal(page.audio, `book_${id}_${i + 1}`);
      assert.ok(!page.sources.includes(PLACEHOLDER) && page.sources.every(source => source.length > 40), `${id} page ${i + 1} says where its facts are from`);
      assert.ok(page.text.length <= 105, `${id} page ${i + 1} is short enough to read aloud: ${page.text.length} letters`);
    });
    const raw = CARD_DATA.cards.find(c => c.id === id);
    assert.match(raw.wanted ?? '', /Wikimedia Commons/, `${id} names the photograph it wants, for the owner to approve`);
  }
  // The frog is chapter 1's card: the Fen adds a sixth page about its eggs and tadpoles, and leaves the five it had alone.
  const frog = CARDS.find(c => c.id === 'frog');
  assert.deepEqual(frog.unlock, { found: 'frog' }, 'the frog in the third print opens the frog\'s card, as the forest\'s frog does');
  assert.equal(frog.spread, 1, 'on the first spread still');
  assert.equal(frog.pages.length, 6);
  assert.deepEqual(frog.pages.slice(0, 5).map(page => [page.image, page.text]), FROG_PAGES, 'its five pages as they were recorded');
  frog.pages.forEach((page, i) => assert.equal(page.audio, `book_frog_${i + 1}`));
  const fenPage = frog.pages[5];
  assert.equal(fenPage.image, 'fen-frog');
  assert.match(fenPage.text, /halakört/, 'the Fen page is about tadpoles');
  assert.ok(fenPage.sources.some(source => source.includes('10.1038/s41586-024-08055-y')), 'with the oldest tadpole (Chuliver et al. 2024) for its wonder');
  assert.match(CARD_DATA.cards.find(c => c.id === 'frog').pages[5].wanted ?? '', /Wikimedia Commons/);
  assert.match(CARD_DATA.note, /six/i, 'and the note says why the frog has six pages');
  // The turtle's third page is about one of the oldest turtles, with teeth and a shell on its belly only: its own drawing.
  assert.equal(CARDS.find(c => c.id === 'turtle').pages[2].image, 'fen-turtle-old');
  assert.equal(MEDIA.get('fen-turtle-old')?.src, 'assets/book/images/fen-turtle-old.svg');
});

/** The book over the shipped cards and pictures and a save of its own, with what it narrates and the sounds it makes. */
function fenRig({ fill = () => {}, animate = false } = {}) {
  const save = createSave(null);
  fill(save);
  const narrated = [];
  const sounds = [];
  const audio = { sfx: name => { sounds.push(name); return true; }, stop() {}, narrate: id => { narrated.push(id); return DONE; } };
  const doc = new FakeDocument(['book', 'journal-button', 'star-slots', 'journal-flights', 'journal-badge']);
  const animations = []; // { el, keyframes, options, animation }
  if (animate) { // every element can animate, and a test says when its animations are over
    const animated = element => {
      element.animate = (keyframes, options) => {
        const animation = { cancel() {}, finish() { this.onfinish?.(); } };
        animations.push({ el: element, keyframes, options, animation });
        return animation;
      };
      return element;
    };
    const create = doc.createElement.bind(doc);
    doc.createElement = tag => animated(create(tag));
    animated(doc.getElementById('book'));
  }
  const book = createBook(doc, { cards: CARDS, media: MEDIA, save, audio, onPause() {} });
  const root = doc.getElementById('book');
  const tap = el => {
    el.dispatchEvent(pointerEvent('pointerdown', { x: 10, y: 10 }));
    el.dispatchEvent(pointerEvent('pointerup', { x: 10, y: 10 }));
  };
  const leaves = () => root.findAll(e => e.classList.contains('book-leaf') && e.getAttribute('data-tab') === 'animals');
  const leaf = n => leaves().find(e => e.getAttribute('data-spread') === String(n));
  const page = (n, side) => leaf(n).findAll(e => e.classList.contains('book-page') && e.classList.contains(side))[0];
  const tilesOn = (n, side) => page(n, side).findAll(e => e.classList.contains('tile')).map(e => e.getAttribute('data-card'));
  const corner = (n, way) => leaf(n).findAll(e => e.classList.contains('spread-turn') && e.classList.contains(way))[0];
  const tile = id => root.findAll(e => e.classList.contains('tile') && e.getAttribute('data-card') === id)[0];
  return { doc, save, book, root, narrated, sounds, animations, tap, leaves, leaf, page, tilesOn, corner, tile };
}

test('the Dýrin page has a second spread for the Fen, turned at the page corner', () => {
  const { save, book, narrated, sounds, tap, leaves, leaf, tilesOn, corner, tile } = fenRig();
  assert.deepEqual(leaves().map(e => e.getAttribute('data-spread')), ['1', '2'], 'a spread for the forest and one for the Fen');
  assert.deepEqual(tilesOn(1, 'left'), ['mosi', 'kambedla', 'kalligrammatid', 'beetle'], 'chapter 1\'s animals as they were: four on the left');
  assert.deepEqual(tilesOn(1, 'right'), ['frog', 'snail', 'birds'], 'and three on the right');
  assert.deepEqual(tilesOn(2, 'left'), ['waterbeetle', 'waterstrider', 'salamander', 'dragonfly'], 'the Fen\'s, four on the left');
  assert.deepEqual(tilesOn(2, 'right'), ['turtle', 'fish', 'earlybird'], 'and three on the right, in the order the child meets them');

  book.open('animals', 'child');
  assert.equal(book.spread, 1, 'the book opens on the forest\'s animals');
  assert.equal(leaf(1).hidden, false);
  assert.equal(leaf(2).hidden, true);
  assert.equal(corner(1, 'next').hidden, true, 'no corner to turn while no animal of the Fen is found: chapter 1\'s book as it was');
  assert.equal(corner(1, 'prev'), undefined, 'and nothing before the first spread');

  save.addFinding('frog'); // the Fen's frog is chapter 1's, on the first spread
  book.refresh();
  assert.equal(corner(1, 'next').hidden, true, 'the frog opens nothing new');
  save.addFinding('waterBeetle');
  book.refresh();
  assert.equal(corner(1, 'next').hidden, false, 'a Fen animal found shows the corner');
  sounds.length = 0;
  tap(corner(1, 'next'));
  assert.equal(book.spread, 2, 'the corner turns to the Fen');
  assert.equal(book.tab, 'animals');
  assert.deepEqual(sounds, ['turn'], 'with the page turn\'s sound');
  assert.equal(leaf(1).hidden, true);
  assert.equal(leaf(2).hidden, false);
  assert.equal(corner(2, 'next'), undefined, 'the last spread has no corner on');
  assert.ok(tile('waterbeetle').classList.contains('new'), 'the beetle is new on its spread');
  assert.ok(tile('turtle').classList.contains('unfound'), 'the rest wait');

  tap(tile('turtle'));
  assert.equal(narrated.at(-1), 'book_find_me_fen', 'an animal of the Fen not found yet says "Finndu mig í Feninu!"');
  tap(corner(2, 'prev'));
  assert.equal(book.spread, 1, 'and the corner back turns to the forest');
  tap(tile('snail'));
  assert.equal(narrated.at(-1), 'book_find_me', 'whose animals say "Finndu mig í skóginum!"');

  tap(corner(1, 'next'));
  book.close();
  book.open('animals', 'child');
  assert.equal(book.spread, 1, 'the Dýrin page remembers nothing: it opens on the first spread again');
  assert.equal(leaf(2).hidden, true);
});

test('a corner takes a tap only where it is drawn, so it never takes a tile\'s', () => {
  // The corner's square is larger than what is drawn of it (its turned-up corner and the arrow): the rest lets taps through to the
  // tiles beside it (the book lab measures it: __demoStats.cornerSteals, none at any screen).
  const css = fs.readFileSync(new URL('../book.css', import.meta.url), 'utf8');
  assert.match(/\.spread-turn \{([^}]*)\}/.exec(css)?.[1] ?? '', /pointer-events:\s*none/, 'the square itself takes no tap');
  assert.match(css, /\.spread-turn :is\(\.corner-under, \.corner-flap, \.book-arrow path\) \{ pointer-events: visiblePainted; \}/, 'what is drawn of it does');
});

test('an open book that a find asks for turns once, straight to its spread, and the tile nods after the turn', () => {
  const { book, sounds, animations, tile, leaf, save } = fenRig({ animate: true });
  save.addFinding('turtle');
  book.open('stars', 'child');
  animations.forEach(a => a.animation.finish());
  sounds.length = 0;
  animations.length = 0;
  book.open('animals', 'child', { find: 'turtle' }); // the journal's button, with the book open (a script opened it on its stars)
  assert.equal(book.tab, 'animals');
  assert.equal(book.spread, 2, 'on the turtle\'s spread');
  assert.deepEqual(sounds, ['turn'], 'one turn, and one turn\'s sound');
  const nod = animations.find(a => a.el === tile('turtle') && /scale/.test(JSON.stringify(a.keyframes)));
  assert.ok(nod, 'the turtle nods');
  assert.ok(nod.options.delay >= 500, `once the turn has settled (after ${nod.options.delay} ms)`);
  animations.forEach(a => a.animation.finish());
  assert.equal(leaf(1).hidden, true, 'the first spread was never turned to on the way');
  // On the find's spread already: no turn, and the nod at once.
  sounds.length = 0;
  animations.length = 0;
  book.open('animals', 'child', { find: 'turtle' });
  assert.deepEqual(sounds, [], 'no turn');
  assert.equal(animations.find(a => a.el === tile('turtle'))?.options.delay, 0, 'and the nod straight away');
});

test('chapter 1\'s frog found again in the Fen flies into the book once, and the book opens on its spread', () => {
  const { doc, save, book, animations, tile, tap } = fenRig({ animate: true, fill: s => s.addFinding('frog') }); // found in the forest
  const sounds = [];
  const journal = createJournal(doc, save, { book, audio: { sfx: name => sounds.push(name) } });
  const flights = doc.getElementById('journal-flights').children;
  assert.equal(journal.addFinding('frog'), false, 'the same frog again, as chapter 1 finds it: nothing');
  assert.equal(flights.length, 0);
  assert.equal(journal.addFinding('frog', null, { again: true }), true, 'found again in a new place (the third print)');
  assert.equal(flights.length, 1, 'its picture flies');
  assert.deepEqual(save.get().findings, ['frog'], 'and nothing more is saved');
  journal.update(FLIGHT_SECONDS + 0.1);
  assert.deepEqual(sounds, ['newAnimal'], 'it lands with the book\'s bell');
  assert.equal(doc.getElementById('journal-badge').hidden, false, 'and the badge, for its new page');
  assert.equal(journal.addFinding('frog', null, { again: true }), false, 'once: a second splash of the print flies nothing');
  doc.getElementById('journal-button').dispatchEvent(new Event('click'));
  assert.equal(book.spread, 1, 'the frog is on the first spread');
  assert.ok(animations.some(a => a.el === tile('frog') && /scale/.test(JSON.stringify(a.keyframes))), 'and it nods there');
  // its card opens on the page the Fen added, its sixth, once; after that on its first, as any card does
  tap(tile('frog'));
  assert.equal(book.cardViewer.isOpen, true, 'the frog\'s card opens');
  assert.equal(book.cardViewer.page, 5, 'on its sixth page, the Fen\'s');
  book.cardViewer.close(true);
  const now = Date.now;
  Date.now = () => now() + 1000; // a second tap, not the same one (animals-page.js: a double tap opens one card)
  try {
    tap(tile('frog'));
  } finally {
    Date.now = now;
  }
  assert.equal(book.cardViewer.page, 0, 'and the next time on its first');
});

test('a page corner turns the spread with the book\'s own page turn', () => {
  const { book, animations, tap, leaf, page, corner } = fenRig({ animate: true, fill: save => save.addFinding('fish') });
  book.open('animals', 'child');
  animations.length = 0;
  tap(corner(1, 'next'));
  const out = page(1, 'right');
  const into = page(2, 'left');
  assert.ok(out.classList.contains('turning') && into.classList.contains('turning'), 'the right page lifts over the spine and the Fen\'s left one comes down');
  assert.equal(leaf(1).hidden, false, 'the old pages stay while one of them turns');
  const turn = animations.filter(a => a.el === out || a.el === into);
  assert.equal(turn.length, 2, 'two halves, as a ribbon turns the page');
  assert.match(JSON.stringify(turn[0].keyframes), /rotateY/, 'about the spine');
  turn.forEach(a => a.animation.finish());
  assert.equal(out.classList.contains('turning'), false, 'and when it has turned the pages lie flat');
  assert.equal(leaf(1).hidden, true);
  tap(corner(2, 'prev'));
  assert.ok(page(2, 'left').classList.contains('turning') && page(1, 'right').classList.contains('turning'), 'back the other way');
});

test('the book opened after a find lands on the spread that holds the new animal, and nods it there', () => {
  const { doc, save, book, animations, tile } = fenRig({ animate: true });
  const journal = createJournal(doc, save, { book, audio: { sfx() {} } });
  const button = doc.getElementById('journal-button');
  const nods = id => animations.filter(a => a.el === tile(id) && /scale/.test(JSON.stringify(a.keyframes))).length;

  journal.addFinding('turtle');
  journal.update(FLIGHT_SECONDS + 0.1); // it has landed in the book
  button.dispatchEvent(new Event('click'));
  assert.equal(book.tab, 'animals');
  assert.equal(book.spread, 2, 'the turtle is on the Fen\'s spread, so the book opens there');
  assert.equal(nods('turtle'), 1, 'and the turtle nods');
  book.close();

  button.dispatchEvent(new Event('click'));
  assert.equal(book.spread, 1, 'no new find: the first spread, as always');
  assert.equal(nods('turtle'), 1, 'and nothing nods');
  book.close();

  journal.addFinding('snail'); // chapter 1's snail is on the first spread
  journal.update(FLIGHT_SECONDS + 0.1);
  button.dispatchEvent(new Event('click'));
  assert.equal(book.spread, 1);
  assert.equal(nods('snail'), 1, 'the snail nods on the first spread');
  book.close();

  journal.addFinding('fish');
  journal.update(FLIGHT_SECONDS + 0.1);
  journal.open('stars'); // a scene opens the book on its stars: the find does not turn it
  assert.equal(book.tab, 'stars');
  book.close();
  button.dispatchEvent(new Event('click'));
  assert.equal(book.spread, 1, 'the book was opened since the fish came: the first spread');
});
