import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBook, halsOpen } from '../engine/book/book.js';
import { parseCards, isUnlocked, PLACEHOLDER } from '../engine/book/cards.js';
import { parseManifest } from '../engine/book/media.js';
import { createJournal, FLIGHT_SECONDS } from '../engine/scene/journal.js';
import { createBookAudio } from '../engine/book/book-audio.js';
import { createCardViewer } from '../engine/book/card-viewer.js';
import { createSave } from '../engine/save.js';
import { createGame, applyTurn, FOSSIL_KINDS } from '../engine/hals/rules.js';
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
    broken.book.open('dinosaurs', 'child');
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
  book.open('dinosaurs', 'script'); // the chapter's last scene, while Mosi speaks
  assert.equal(book.isOpen, true);
  assert.deepEqual(pauses, [], 'the scene goes on under it');
  book.close();
  assert.deepEqual(pauses, [], 'and shutting it lets nothing go');

  book.open('dinosaurs', 'script');
  root.dispatchEvent(pointerEvent('pointerdown', { x: 400, y: 300 })); // the child touches the book
  assert.deepEqual(pauses, [true], 'it is the child\'s now');
  root.dispatchEvent(pointerEvent('pointerdown', { x: 420, y: 300 }));
  assert.deepEqual(pauses, [true], 'once');
  close();
  assert.deepEqual(pauses, [true, false], 'and the game goes on when the child shuts it');

  book.open('dinosaurs', 'script');
  close(); // a child who only shuts it
  assert.deepEqual(pauses, [true, false], 'resumes nothing that was not held');
});

test('ribbons switch pages with a turn sound', () => {
  const { book, all, ribbon, tap, sounds } = rig();
  book.open('dinosaurs', 'child');
  const leaf = tab => all('book-leaf').find(l => l.getAttribute('data-tab') === tab);
  assert.equal(ribbon('dinosaurs').getAttribute('aria-selected'), 'true');
  assert.equal(leaf('dinosaurs').hidden, false);
  sounds.length = 0;

  tap(ribbon('animals'));
  assert.equal(book.tab, 'animals');
  assert.equal(ribbon('animals').getAttribute('aria-selected'), 'true');
  assert.equal(ribbon('dinosaurs').getAttribute('aria-selected'), 'false');
  assert.equal(leaf('animals').hidden, false);
  assert.equal(leaf('dinosaurs').hidden, true);
  assert.deepEqual(sounds, ['turn']);

  tap(ribbon('animals')); // the page that is open already
  assert.equal(book.tab, 'animals');
  assert.deepEqual(sounds, ['turn', 'tap'], 'a tap, and no turn');
  tap(ribbon('dinosaurs'));
  assert.equal(book.tab, 'dinosaurs');
  assert.deepEqual(sounds, ['turn', 'tap', 'turn']);
});

/** The book over a save of its own, with what it narrates, the sounds it makes and the games it hands on. */
function savedRig(fill = () => {}, { onTab = null, storage = null } = {}) {
  const save = createSave(storage);
  fill(save);
  const narrated = [];
  const played = [];
  const sounds = [];
  const audio = { sfx: name => { sounds.push(name); return true; }, stop() {}, narrate: id => { narrated.push(id); return DONE; } };
  const doc = new FakeDocument(['book']);
  const book = createBook(doc, { save, audio, onPause() {}, onPlay: game => played.push(game), onTab });
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
  assert.deepEqual(ribbons.map(r => r.getAttribute('data-tab')), ['dinosaurs', 'animals', 'games', 'map', 'fossils'], 'the map after the games');
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
  assert.equal(tile.parentNode.hidden, true, 'no slot for it on the Leikir page until it is open: the page shows only the games that are');
  assert.ok(tile.classList.contains('unfound'), 'shut until her star is in the book');
  assert.match(tile.getAttribute('aria-label'), /stjörnu Þórseðlu/, 'and says what opens it');
  sounds.length = 0;
  tap(tile);
  assert.deepEqual(played, [], 'a tap that did reach it wiggles it, and opens nothing');
  assert.deepEqual(sounds, ['wiggle']);
  save.addStar('k2_thorsedla');
  book.refresh();
  assert.equal(tile.parentNode.hidden, false, 'with her star its slot appears');
  assert.ok(tile.classList.contains('new') && !tile.classList.contains('unfound'), 'with her star it opens, new');
  tap(tile);
  assert.deepEqual(played, ['hals'], 'and a tap plays it');
  assert.ok(tile.classList.contains('found') && !tile.classList.contains('new'), 'new no more once played');
});

// The owner, 22 October: Háls og hali waits for Þórseðla's star, and once it is open it stays open. A game of it once kept marks the
// save (hals.played) for good, and a save from before that mark is open while it keeps a game under way. The rig's onTab is
// main.js's, which builds the board on the Leikir page whenever halsOpen says so (kafli2.test.mjs holds main.js to it). Each rig
// opens the book on the Leikir page and taps the tile once; `stored` is a save as the page kept it (an older one, say).
function halsRig(fill, stored = null) {
  const prewarmed = [];
  let kept = null;
  const storage = stored && { getItem: () => JSON.stringify(stored), setItem() {} };
  const rig = savedRig(save => { kept = save; fill(save); }, { storage, onTab: tab => { if (tab === 'games' && halsOpen(kept)) prewarmed.push(tab); } });
  const tile = rig.root.findAll(e => e.getAttribute('data-game') === 'hals')[0];
  rig.book.open('games', 'child');
  rig.sounds.length = 0;
  rig.tap(tile);
  return { ...rig, tile, prewarmed };
}
const halsGame = () => applyTurn(createGame({ playerCount: 2, vsComputer: true, mode: 'adventure' }), 3);
const SETUP = { players: 1, mode: 'adventure' };
/** A save from before the mark, with a game under way in it and no star. */
const OLD_SAVE = () => ({ stars: [], findings: [], seen: ['hals'], hals: { found: ['tooth'], game: { state: halsGame(), setup: SETUP } } });

/** Open, as the tile shows it: no wiggle, a tap plays the game, and the Leikir page builds its board. */
function assertHalsOpen({ save, tile, played, sounds, prewarmed }) {
  assert.equal(save.get().stars.includes('k2_thorsedla'), false, 'without her star');
  assert.equal(halsOpen(save), true);
  assert.ok(!tile.classList.contains('unfound'), 'the tile is open');
  assert.match(tile.getAttribute('aria-label'), /spil við Þórseðlu/, 'and says what it is');
  assert.deepEqual(sounds, ['tile'], 'a tap does not wiggle it');
  assert.deepEqual(played, ['hals'], 'it plays the game');
  assert.deepEqual(prewarmed, ['games'], 'and the Leikir page builds its board');
}

test('Háls og hali in a fresh save is shut: it wiggles and its board is not built', () => {
  const { save, book, tile, played, sounds, prewarmed } = halsRig(() => {});
  assert.equal(halsOpen(save), false);
  assert.ok(tile.classList.contains('unfound'), 'shut');
  assert.deepEqual(sounds, ['wiggle'], 'a tap wiggles it');
  assert.deepEqual(played, [], 'and opens nothing');
  assert.deepEqual(prewarmed, [], 'the Leikir page builds no board');
  book.refresh();
  assert.ok(tile.classList.contains('unfound'), 'still shut');
  // nor does an older save's game that the game would not go on with: one of the old board of 80 (version 1), or one without
  // its setup
  const old = halsRig(() => {}, { stars: [], hals: { found: [], game: { state: { ...halsGame(), version: 1 }, setup: SETUP } } });
  assert.equal(halsOpen(old.save), false, 'a game of the old board does not open it');
  assert.deepEqual(old.sounds, ['wiggle']);
  const bare = halsRig(() => {}, { stars: [], hals: { found: [], game: { state: halsGame() } } });
  assert.equal(halsOpen(bare.save), false, 'nor a game without its setup');
});

test('Háls og hali stays open once a game of it is won, and on the next visit', () => {
  // the game set up is kept (engine/hals/game.js keep), then won, which forgets it
  const files = new Map();
  const storage = { getItem: k => files.get(k) ?? null, setItem: (k, v) => files.set(k, v) };
  const first = createSave(storage);
  first.setHalsPlay({ game: { state: halsGame(), setup: SETUP } });
  first.setHalsPlay({ game: null });
  const stored = JSON.parse(files.get('mosi-remake-v1'));
  assert.deepEqual(stored.hals, { found: [], played: true }, 'the game is forgotten, and kept as played');
  const won = halsRig(() => {}, stored);
  assert.equal(won.save.getHalsPlay().game, null);
  assertHalsOpen(won);
});

test('Háls og hali stays open after "Nýr leikur" and leaving, in a new save and in an older one', () => {
  // "Nýr leikur" forgets the game under way (engine/hals/game.js), and the child shuts the game before choosing who plays
  const fresh = halsRig(save => {
    save.setHalsPlay({ game: { state: halsGame(), setup: SETUP } });
    save.setHalsPlay({ game: null });
  });
  assertHalsOpen(fresh);
  // the same in a save from before the mark: forgetting its game marks it played
  const old = halsRig(save => save.setHalsPlay({ game: null }), OLD_SAVE());
  assert.deepEqual(old.save.getHalsPlay(), { game: null, intro: false, hello: false, played: true });
  assertHalsOpen(old);
});

test('Háls og hali in an older save with a game under way and no mark is open', () => {
  const old = halsRig(() => {}, OLD_SAVE());
  assert.equal(old.save.getHalsPlay().played, false, 'no mark');
  assert.ok(old.save.getHalsPlay().game, 'a game under way');
  assertHalsOpen(old);
});

test('Háls og hali with Þórseðla\'s star is open: a tap plays it, and its board is built', () => {
  const { save, tile, played, sounds, prewarmed } = halsRig(save => save.addStar('k2_thorsedla'));
  assert.equal(halsOpen(save), true);
  assert.ok(!tile.classList.contains('unfound'), 'open');
  assert.deepEqual(sounds, ['tile'], 'a tap does not wiggle');
  assert.deepEqual(played, ['hals'], 'it plays the game');
  assert.deepEqual(prewarmed, ['games'], 'the Leikir page builds its board');
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

test('a 3D page keeps its picture and reads its line where the model cannot show, and the arrows flip; with the model on, only the arrows flip', async () => {
  const doc = new FakeDocument(['book', 'book-two']);
  const lines = [];
  const zoomed = [];
  const audio = { sfx() {}, stop() {}, narrate: id => { lines.push(id); return DONE; } };
  const zoom = { open: img => zoomed.push(img), close() {} };
  const card = {
    id: 'bones', name: 'Beinagrind',
    pages: [1, 2, 3].map(n => ({ image: 'none', text: `Texti ${n}.`, audio: `book_bones_${n}`, sources: ['heimild'], model: n === 2 ? 'assets/characters/mosi.glb' : null })),
  };
  const press = (el, type, x) => el.dispatchEvent(pointerEvent(type, { x, y: 100 }));
  const tap = el => { press(el, 'pointerdown', 10); press(el, 'pointerup', 10); };
  const swipeLeft = el => { press(el, 'pointerdown', 200); press(el, 'pointermove', 100); press(el, 'pointerup', 100); };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const partsOf = (root, name) => root.findAll(e => e.classList.contains(name));
  const arrow = root => partsOf(root, 'card-arrow').find(e => e.classList.contains('next'));

  // Here there is no WebGL: the page's picture stays, its line is read, and the arrow goes on to the next page.
  const root = doc.getElementById('book');
  const bare = createCardViewer(doc, root, { audio, zoom });
  assert.equal(bare.open(card, null, 1), true);
  await flush();
  const [first, second] = root.findAll(e => e.tagName === 'IMG');
  assert.equal(second.hidden, false, 'the picture of the page is showing');
  assert.equal(first.hidden, true);
  assert.equal(partsOf(root, 'card-model')[0].hidden, true, 'and the canvas for the model is not');
  assert.equal(lines.at(-1), 'book_bones_2', 'the page is read');
  tap(partsOf(root, 'card-photo')[0]);
  assert.equal(zoomed.length, 1, 'a tap on the picture still zooms it, as it is only a picture here');
  tap(arrow(root));
  assert.equal(bare.page, 2, 'the arrow flips to the third page');
  bare.close(true);

  // With a model on the canvas the finger is the model's: a swipe does not flip and a tap does not zoom; the arrows do, and the model goes.
  const asked = [];
  let sent = 0;
  const view = { mount() {}, show: async src => { asked.push(src); return true; }, hide: () => { sent++; } };
  const root2 = doc.getElementById('book-two');
  const viewer = createCardViewer(doc, root2, { audio, zoom, skeleton: view });
  viewer.open(card, null, 0);
  swipeLeft(partsOf(root2, 'card')[0]);
  assert.equal(viewer.page, 1, 'a page with no model flips with a swipe');
  await flush();
  assert.deepEqual(asked, ['assets/characters/mosi.glb'], 'the model of the page is asked for once it is turned to');
  swipeLeft(partsOf(root2, 'card')[0]);
  assert.equal(viewer.page, 1, 'with the model on, a swipe does not flip');
  tap(partsOf(root2, 'card-photo')[0]);
  assert.equal(zoomed.length, 1, 'and a tap on the picture does not zoom');
  const before = sent;
  tap(arrow(root2));
  assert.equal(viewer.page, 2, 'the arrow flips');
  assert.ok(sent > before, 'and the model is sent away');
  viewer.close(true);
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
/** The frog's seven pages in the owner's order (2026-10-26): the five chapter 1 wrote and recorded (page one has a photograph now), a new one, and the Fen's tadpole page last. */
const FROG_PAGES = [
  ['frog-common', 'Þetta er froskur. Froskar hoppuðu um þegar risaeðlurnar voru uppi!', 'book_frog_1'],
  ['frog-skeleton', 'Forfeður froskanna fengu lengri fætur og styttra skott. Þá fóru þeir að hoppa!', 'book_frog_2'],
  ['triadobatrachus-fossil', 'Við vitum þetta af steingervingum. Þessi forni ættingi froska var enn með skott!', 'book_frog_3'],
  ['frog-photo', 'Froskar lifðu af þegar risaeðlurnar dóu út. Þeir eru enn að hoppa!', 'book_frog_4'],
  ['eopelobates-fossil', 'Stukku fyrstu froskarnir langt eða hoppuðu þeir stutt? Það vitum við ekki enn.', 'book_frog_5'],
  ['frog-bartz', 'Á veturna sefur froskurinn á botni tjarnarinnar, þar til vorar.', 'book_frog_7'],
  ['frog-growth', 'Úr froskaeggjum í vatninu koma halakörtur. Elsta halakartan sem við þekkjum var lengri en höndin á þér!', 'book_frog_6'],
];
/** The Fen's seven cards, page by page as the owner approved them: each page's picture and the number of its line (book_<card>_<n>). */
const FEN_PAGES = {
  waterbeetle: [['diving-beetle', 1], ['diving-beetle-leaf', 4], ['coptoclava-fossil', 2], ['diving-beetle-water', 3], ['diving-beetle-larva', 5], ['diving-beetle-top', 6]],
  waterstrider: [['waterstrider-river', 1], ['waterstrider-lake', 4], ['waterstrider-sharp', 2], ['waterstrider-gerridae', 5], ['waterstrider-remigis', 3], ['waterstrider-pair', 6]],
  salamander: [['fire-salamander', 1], ['chunerpeton-life', 4], ['chunerpeton-fossil', 2], ['jeholotriton-fossil', 3], ['giant-salamander', 5], ['salamander-eggs', 6]],
  dragonfly: [['emperor-dragonfly', 1], ['dragonfly-eyes', 4], ['isophlebia-fossil', 2], ['meganeura-model', 5], ['emperor-dragonfly', 6], ['dragonfly-nymph', 3]],
  turtle: [['pond-turtle', 1], ['proganochelys-fossil', 2], ['proganochelys-life', 4], ['odontochelys-fossil', 3], ['odontochelys-life', 5], ['pond-turtle', 6]],
  fish: [['gar-longnose', 1], ['lepidotes-solnhofen', 2], ['lepidotes-scarborough', 4], ['lepidotes-lehavre', 5], ['spinosaurus-life', 3], ['gar-boston', 6]],
  earlybird: [['archaeopteryx-nt', 1], ['archaeopteryx-eichstatt', 4], ['archaeopteryx-durbed', 2], ['archaeopteryx-feather', 5], ['archaeopteryx-berlin', 3], ['archaeopteryx-skull', 6]],
};

test('the fen cards unlock with their findings and have six pages each, every picture a photograph, a fossil or a scientist\'s drawing', () => {
  const nobody = { stars: [], findings: [], seen: [] };
  for (const [id, find] of Object.entries(FEN)) {
    const card = CARDS.find(c => c.id === id);
    assert.ok(card, `a card for the ${find}`);
    assert.equal(card.id, find.toLowerCase(), 'its id is its finding\'s, in lower case (the narrator\'s lines are lower case)');
    assert.deepEqual(card.unlock, { found: find }, `${id} opens with the ${find} the child finds`);
    assert.equal(isUnlocked(card, nobody), false, `${id} waits for its animal`);
    assert.equal(isUnlocked(card, { ...nobody, findings: [find] }), true, `${id} opens once it is found`);
    assert.equal(card.name, FEN_NAMES[id], 'with the name the game gives it');
    assert.equal(card.pages.length, 6, `${id} has six pages`);
    assert.equal(card.spread, 2, `${id} is on the Fen's spread`);
    assert.deepEqual(card.pages.map(page => [page.image, Number(page.audio.replace(`book_${id}_`, ''))]), FEN_PAGES[id], `${id}: its pictures and lines, page by page`);
    assert.equal(card.picture, FEN_PAGES[id][0][0], 'its tile is page one\'s picture');
    assert.notEqual(MEDIA.get(card.picture)?.kind, 'placeholder', 'which is no placeholder drawing of ours');
    for (const [image] of FEN_PAGES[id]) {
      assert.match(MEDIA.get(image)?.src ?? '', /^assets\/book\/images\/[a-z0-9-]+\.jpg$/, `${id}: ${image} is a JPEG in the pictures folder`);
    }
    card.pages.forEach((page, i) => {
      assert.ok(!page.sources.includes(PLACEHOLDER) && page.sources.every(source => source.length > 40), `${id} page ${i + 1} says where its facts are from`);
      assert.ok(page.text.length <= 105, `${id} page ${i + 1} is short enough to read aloud: ${page.text.length} letters`);
    });
    const raw = CARD_DATA.cards.find(c => c.id === id);
    assert.equal(raw.wanted, undefined, `${id} wants no photograph any more: every page has one`);
  }
  // The frog is chapter 1's card: it has seven pages in the owner's order, the Fen's page about its tadpoles last, and the five
  // chapter 1 wrote and recorded keep their words and lines.
  const frog = CARDS.find(c => c.id === 'frog');
  assert.deepEqual(frog.unlock, { found: 'frog' }, 'the frog in the third print opens the frog\'s card, as the forest\'s frog does');
  assert.equal(frog.spread, 1, 'on the first spread still');
  assert.equal(frog.pages.length, 7);
  assert.deepEqual(frog.pages.map(page => [page.image, page.text, page.audio]), FROG_PAGES, 'its pages as the owner ordered them');
  const fenPage = frog.pages[6];
  assert.match(fenPage.text, /halakört/, 'the Fen page is about tadpoles');
  assert.ok(fenPage.sources.some(source => source.includes('10.1038/s41586-024-08055-y')), 'with the oldest tadpole (Chuliver et al. 2024) for its wonder');
  assert.equal(CARD_DATA.cards.find(c => c.id === 'frog').pages.some(page => 'wanted' in page), false, 'and no page waits for a photograph');
  assert.match(CARD_DATA.note, /frog's seventh/i, 'and the note says which page is the frog\'s Fen page');
  // No card shows a placeholder drawing (the owner's photographs and renders replaced them), and no card's page is an SVG.
  for (const card of CARDS) {
    for (const page of card.pages) {
      assert.notEqual(MEDIA.get(page.image)?.kind, 'placeholder', `${card.id}: ${page.image} is no placeholder drawing`);
      assert.doesNotMatch(MEDIA.get(page.image)?.src ?? '', /\.svg$/, `${card.id}: ${page.image} is no SVG`);
    }
  }
});

/** The book over the shipped cards and pictures and a save of its own, with what it narrates and the sounds it makes. */
function fenRig({ fill = () => {}, animate = false, cards = CARDS } = {}) {
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
  const book = createBook(doc, { cards, media: MEDIA, save, audio, onPause() {} });
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
  assert.deepEqual(tilesOn(1, 'left'), ['kalligrammatid', 'beetle', 'frog', 'snail'], 'chapter 1\'s animals, the dinosaurs being on the Risaeðlur page: four on the left');
  assert.deepEqual(tilesOn(1, 'right'), ['birds'], 'and the last on the right');
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
  book.open('dinosaurs', 'child');
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
  // its card opens on the page the Fen added, its seventh, once; after that on its first, as any card does
  tap(tile('frog'));
  assert.equal(book.cardViewer.isOpen, true, 'the frog\'s card opens');
  assert.equal(book.cardViewer.page, 6, 'on its seventh page, the Fen\'s');
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
  journal.open('dinosaurs'); // a scene opens the book on its dinosaurs: the find does not turn it
  assert.equal(book.tab, 'dinosaurs');
  book.close();
  button.dispatchEvent(new Event('click'));
  assert.equal(book.spread, 1, 'the book was opened since the fish came: the first spread');
});

// ---------------------------------------------------------------------------------------------
// The new structure (Landkönnuðabók, stage 1): Risaeðlur first, no Stjörnur, the games that are open, the nod at the chapter's end

test('the ribbons are Risaeðlur, Dýrin, Leikir, Kortið and Safnið, and there is no Stjörnur page', () => {
  const { root, all, ribbon, book } = rig();
  assert.deepEqual(all('ribbon').map(r => r.getAttribute('data-tab')), ['dinosaurs', 'animals', 'games', 'map', 'fossils']);
  const labels = all('ribbon').map(r => /<span class="ribbon-label">([^<]*)<\/span>/.exec(r.innerHTML)?.[1]);
  assert.deepEqual(labels, ['Risaeðlur', 'Dýrin', 'Leikir', 'Kortið', 'Safnið']);
  assert.match(ribbon('dinosaurs').innerHTML, /<img class="book-icon ribbon-pic"[^>]*mosi-render-thumb\.webp[^>]*alt=""/, 'Mosi\'s render, small, is the dinosaurs\' icon');
  assert.equal(root.findAll(e => e.getAttribute('data-tab') === 'stars').length, 0, 'no ribbon, leaf or panel of the stars');
  assert.equal(root.findAll(e => e.classList.contains('star-tile')).length, 0, 'and none of its star tiles');
  assert.throws(() => book.open('stars', 'child'), /no page "stars"/);
});

// Every shipped dinosaur has its card now; this is the book as it was before the last five were written: they are teasers (no pages,
// Mosi's line), which the code still supports for a dinosaur whose card comes later.
const WITH_TEASERS = CARDS.map(c => (['thorsedla', 'gramedla', 'uggedla', 'sloedla', 'flugedla'].includes(c.id)
  ? { ...c, pages: [], say: c.id === 'gramedla' ? 'book_mosi_later' : `k2_mosi_map_${c.id}` } : c));

test('the Risaeðlur page has the seven dinosaurs: the ones met in colour, the rest dark, and a teaser says Mosi\'s line and opens no card', () => {
  const { book, narrated, sounds, tap, tilesOn, tile, root } = fenRig({
    cards: WITH_TEASERS,
    fill: save => { save.addStar('k1_kambedla'); save.addPlace('sloedla'); save.addSeen('mosi'); },
  });
  const leaf = root.findAll(e => e.classList.contains('book-leaf') && e.getAttribute('data-tab') === 'dinosaurs')[0];
  const onPage = side => leaf.findAll(e => e.classList.contains('book-page') && e.classList.contains(side))[0]
    .findAll(e => e.classList.contains('tile')).map(e => e.getAttribute('data-card'));
  assert.deepEqual(onPage('left'), ['mosi', 'kambedla', 'thorsedla', 'gramedla'], 'four on the left page');
  assert.deepEqual(onPage('right'), ['uggedla', 'sloedla', 'flugedla'], 'and three on the right');
  const unfound = ['thorsedla', 'gramedla', 'uggedla', 'flugedla'];
  for (const id of ['mosi', 'kambedla', 'sloedla']) assert.ok(!tile(id).classList.contains('unfound'), `${id} has been met`);
  for (const id of unfound) assert.ok(tile(id).classList.contains('unfound'), `${id} has not`);
  assert.ok(tile('kambedla').classList.contains('new') && tile('sloedla').classList.contains('new'), 'Kambeðla and Slóeðla are new');
  assert.ok(tile('mosi').classList.contains('found'), 'Mosi, seen already, is just found');
  assert.equal(tilesOn(1, 'left').includes('mosi'), false, 'Mosi is not on the Dýrin page');

  book.open('dinosaurs', 'child');
  sounds.length = 0;
  tap(tile('sloedla')); // met, with no card yet: Mosi says his map line about her
  assert.deepEqual(narrated, ['k2_mosi_map_sloedla']);
  assert.equal(book.cardViewer.isOpen, false, 'no card opens');
  assert.ok(!tile('sloedla').classList.contains('new'), 'and her tile is seen: no Nýtt! any more');
  assert.deepEqual(sounds, ['tile']);
  tap(tile('flugedla')); // not met: Mosi says he will find her later
  assert.equal(narrated.at(-1), 'book_mosi_later');
  assert.equal(book.cardViewer.isOpen, false);
  tap(tile('kambedla')); // met, with a card: it opens
  assert.equal(book.cardViewer.isOpen, true, 'Kambeðla\'s card opens');
});

test('with the shipped cards every dinosaur met opens its own card, and one not met still says Mosi\'s later line', () => {
  const { book, narrated, tap, tile } = fenRig({
    fill: save => { save.addStar('k1_kambedla'); save.addPlace('sloedla'); save.addPlace('flugedla'); },
  });
  book.open('dinosaurs', 'child');
  assert.ok(tile('sloedla').classList.contains('new'), 'her tile is new');
  tap(tile('sloedla'));
  assert.equal(book.cardViewer.isOpen, true, "Slóeðla's card opens (nine pages)");
  assert.equal(narrated.includes('k2_mosi_map_sloedla'), false, 'and Mosi says no map line in its place');
  book.cardViewer.close?.();
  tap(tile('gramedla')); // not met
  assert.equal(narrated.at(-1), 'book_mosi_later');
  assert.equal(book.cardViewer.isOpen, false, 'a dinosaur not met opens nothing');
});

test('the Leikir page shows only the games that are open', () => {
  const { save, book, root } = savedRig();
  const slot = game => root.findAll(e => e.getAttribute('data-game') === game)[0].parentNode;
  book.open('games', 'child');
  assert.equal(slot('eitt').hidden, true, 'no Eitt! without Kambeðla\'s star');
  assert.equal(slot('hals').hidden, true, 'no Háls og hali without Þórseðla\'s');
  assert.equal(slot('yatzy-junior').hidden, false, 'Litla Yatzy always');
  save.addStar('k1_kambedla');
  book.refresh();
  assert.equal(slot('eitt').hidden, false, 'Eitt! appears with k1_kambedla');
  assert.equal(slot('hals').hidden, true);
  save.addStar('k2_thorsedla');
  book.refresh();
  assert.equal(slot('hals').hidden, false, 'and Háls og hali with her star');
});

test('the book opened for a dinosaur nods its tile once it has grown, and the journal passes the nod on', () => {
  const { doc, save, book, animations, tile } = fenRig({ animate: true, fill: s => s.addStar('k2_thorsedla') });
  const nods = id => animations.filter(a => a.el === tile(id) && /scale/.test(JSON.stringify(a.keyframes)));
  const journal = createJournal(doc, save, { book, audio: { sfx() {} } });
  journal.open('dinosaurs', { nod: 'thorsedla' }); // chapter 2's end
  assert.equal(book.tab, 'dinosaurs');
  assert.equal(nods('thorsedla').length, 1, 'Þórseðla\'s tile nods');
  assert.ok(nods('thorsedla')[0].options.delay >= 300, `once the book has grown (after ${nods('thorsedla')[0].options.delay} ms)`);
  assert.equal(nods('mosi').length, 0, 'and only hers');
  assert.ok(tile('thorsedla').classList.contains('new'), 'she is new');
  journal.open('map'); // then it turns to the map
  assert.equal(book.tab, 'map');
});

// Review Focus 1: a child's save from before the change opens the new book with every find still there.
test('a save from before this change opens the new book with the right dinosaurs met and no animal missing', () => {
  // as chapter 2's print wrote it: both stars, the far friends' places, the finds of both chapters, and some cards seen; no hals mark
  const old = {
    stars: ['k1_kambedla', 'k2_thorsedla'],
    findings: ['butterfly', 'beetle', 'frog', 'snail', 'birds', 'waterBeetle', 'turtle'],
    seen: ['mosi', 'kambedla', 'kalligrammatid', 'frog'],
    places: ['fen', 'sloedla', 'flugedla', 'uggedla'],
  };
  const doc = new FakeDocument(['book']);
  const save = createSave({ getItem: () => JSON.stringify(old), setItem() {} });
  const book = createBook(doc, { cards: CARDS, media: MEDIA, save, audio: { sfx: () => true, stop() {}, narrate: () => DONE }, onPause() {} });
  const root = doc.getElementById('book');
  const state = id => root.findAll(e => e.classList.contains('tile') && e.getAttribute('data-card') === id)[0].classList;
  const unfound = group => CARDS.filter(c => c.group === group && state(c.id).contains('unfound')).map(c => c.id);
  assert.deepEqual(unfound('dinosaur'), ['gramedla'], 'every friend met is met: only Grameðla, who waits for chapter 3, is dark');
  assert.ok(state('mosi').contains('found') && state('kambedla').contains('found'), 'Mosi and Kambeðla, seen before, are just found');
  assert.ok(['thorsedla', 'uggedla', 'sloedla', 'flugedla'].every(id => state(id).contains('new')), 'and the four met since are new');
  assert.deepEqual(unfound('animal'), ['waterstrider', 'salamander', 'dragonfly', 'fish', 'earlybird'], 'every animal found is found; the rest wait');
  assert.ok(state('frog').contains('found') && state('beetle').contains('new'), 'with their new and seen as they were');
  assert.deepEqual(save.get().seen, old.seen, 'opening the book marks nothing seen');
  const slot = game => root.findAll(e => e.getAttribute('data-game') === game)[0].parentNode;
  assert.deepEqual(['eitt', 'hals', 'yatzy-junior'].map(game => slot(game).hidden), [false, false, false], 'and the three games it had earned are on the Leikir page');
  assert.equal(book.tab, 'animals');
});

// ---------------------------------------------------------------------------------------------
// Safnið (museum-page.js): new fossils, the full collection celebrated once, a fossil's card

test('a fossil found and not tapped yet wears Nýtt!, so does the Safnið ribbon, and a tap clears both and opens the fossil card', () => {
  // the data has the eight fossil cards: a found fossil's sticker opens its card, an unfound one wiggles
  const { save, book, root, narrated, sounds, tap } = fenRig({
    fill: s => { s.addHalsFound('tooth'); s.addHalsFound('amber'); },
  });
  const sticker = kind => root.findAll(e => e.getAttribute('data-fossil') === kind)[0];
  const badges = el => el.findAll(e => e.classList.contains('badge-new')).map(e => e.textContent);
  const dots = () => root.findAll(e => e.classList.contains('ribbon') && e.getAttribute('data-tab') === 'fossils')[0]
    .findAll(e => e.classList.contains('ribbon-new')).map(e => e.textContent);
  assert.deepEqual([badges(sticker('tooth')), badges(sticker('amber')), badges(sticker('egg'))], [['Nýtt!'], ['Nýtt!'], []], 'the two found wear Nýtt!, the unfound none');
  assert.ok(sticker('tooth').classList.contains('new') && sticker('egg').classList.contains('unfound'));
  assert.deepEqual(dots(), ['Nýtt!'], 'and the Safnið ribbon shows its dot');

  book.open('fossils', 'child');
  sounds.length = 0;
  tap(sticker('egg')); // not found: it wiggles and no card opens
  assert.deepEqual(sounds, ['wiggle']);
  assert.equal(book.cardViewer.isOpen, false);
  tap(sticker('tooth')); // its card opens in the card viewer
  assert.equal(book.cardViewer.isOpen, true, 'the tooth card opens');
  assert.equal(book.cardViewer.card.id, 'tooth');
  assert.equal(book.cardViewer.card.pages.length, 3, 'three pages');
  assert.ok(!narrated.includes('hals_fossil_tooth'), 'in place of the fact the game says');
  assert.deepEqual(badges(sticker('tooth')), [], 'the tooth is new no more');
  assert.ok(save.get().seen.includes('fossil:tooth'));
  assert.deepEqual(dots(), ['Nýtt!'], 'the ribbon keeps its dot while the amber is new');
  book.cardViewer.close(true);
  tap(sticker('amber'));
  assert.equal(book.cardViewer.card.id, 'amber', 'the amber card opens');
  assert.deepEqual([badges(sticker('amber')), dots()], [[], []], 'and the sticker and the ribbon are clear');
});

test('a fossil whose card the book was not given keeps the tap it had: the narrator says its name and a fact', () => {
  const { save, book, root, narrated, tap } = fenRig({
    fill: s => s.addHalsFound('tooth'),
    cards: CARDS.filter(c => c.group !== 'fossil'),
  });
  book.open('fossils', 'child');
  tap(root.findAll(e => e.getAttribute('data-fossil') === 'tooth')[0]);
  assert.equal(narrated.at(-1), 'hals_fossil_tooth');
  assert.equal(book.cardViewer.isOpen, false, 'no card opens');
  assert.ok(save.get().seen.includes('fossil:tooth'), 'and the fossil is seen all the same');
});

test('with all eight fossils found, Safnið is celebrated the first time the child shows it and never again, and a book a script opened keeps quiet', () => {
  const eight = save => FOSSIL_KINDS.forEach(kind => save.addHalsFound(kind.id));
  const { save, book, narrated, sounds, tap, root } = fenRig({ fill: eight });
  const ribbon = tab => root.findAll(e => e.classList.contains('ribbon') && e.getAttribute('data-tab') === tab)[0];
  book.open('games', 'child');
  assert.equal(narrated.includes('book_mosi_fossils_all'), false, 'not before the child turns to Safnið');
  tap(ribbon('fossils')); // a ribbon turn
  assert.deepEqual(narrated.filter(id => id === 'book_mosi_fossils_all'), ['book_mosi_fossils_all'], 'Mosi cheers');
  assert.ok(sounds.includes('celebrate'), 'with the celebration sound');
  assert.ok(save.get().seen.includes('fossils-all'), 'and the save says it was done');
  tap(ribbon('games'));
  tap(ribbon('fossils'));
  book.close();
  book.open('fossils', 'child');
  assert.equal(narrated.filter(id => id === 'book_mosi_fossils_all').length, 1, 'a second turn, and a second open, do not cheer again');
  // a save that has all eight and was never celebrated, on a book a script opened: silent
  const quiet = fenRig({ fill: eight });
  quiet.book.open('fossils', 'script');
  assert.equal(quiet.narrated.length, 0, 'a book the child does not hold says nothing');
  assert.equal(quiet.save.get().seen.includes('fossils-all'), false, 'and keeps the celebration for the child');
});
