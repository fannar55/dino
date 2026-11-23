import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBook } from '../engine/book/book.js';
import { MAP_CHAPTERS, askLine, askText, chapterAsked, chapterDone, chapterSearch, onwardChapter, storyChapter } from '../engine/book/map-chapters.js';
import { createSave, defaultChapter } from '../engine/save.js';
import { DONE } from '../engine/handle.js';
import { FakeDocument, pointerEvent } from './fake-dom.mjs';

// The chapters on the book's map (the owner, 2026-11-23): a finished chapter's place twinkles and asks "Viltu fara í kafla 2?" when
// tapped, Mosi saying it aloud; only a yes goes to the chapter, a no leaves everything as it was, and a place whose chapter is not
// finished starts nothing. What the child meets is held here; the map itself is book.test.mjs's.

const STARS = ['k1_kambedla', 'k2_uggedla', 'k2_thorsedla', 'k4_flugedla', 'k5_sloedla', 'k6_gramedla']; // in the story's order
const PLACES = ['kambedla', 'uggedla', 'thorsedla', 'flugedla', 'sloedla', 'gramedla'];

/** A save that has finished the first `done` chapters, with the far friends found from Þórseðla's head once hers is. */
function saveAt(done) {
  const save = createSave(null);
  for (const star of STARS.slice(0, done)) save.addStar(star);
  if (done >= 3) for (const place of ['fen', 'sloedla', 'flugedla', 'uggedla']) save.addPlace(place);
  return save;
}

/** The book open on its map over a save that has finished `done` chapters, on the page of the chapter `playing`. */
function mapRig({ done = 3, playing = null, onChapter } = {}) {
  const save = saveAt(done);
  const narrated = [];
  const sounds = [];
  const went = [];
  let stops = 0;
  const audio = { sfx: name => { sounds.push(name); return true; }, stop() { stops += 1; }, narrate: id => { narrated.push(id); return DONE; } };
  const doc = new FakeDocument(['book']);
  const book = createBook(doc, { save, audio, onPause() {}, chapterId: playing, onChapter: onChapter ?? (id => went.push(id)) });
  const root = doc.getElementById('book');
  const tap = el => {
    el.dispatchEvent(pointerEvent('pointerdown', { x: 10, y: 10 }));
    el.dispatchEvent(pointerEvent('pointerup', { x: 10, y: 10 }));
  };
  book.open('map', 'child');
  const marker = id => root.findAll(e => e.classList.contains('map-marker') && e.getAttribute('data-place') === id)[0];
  const ask = book.mapAsk;
  return { save, book, root, narrated, sounds, went, tap, marker, ask, stops: () => stops };
}

test('each friend\'s place stands for her chapter, in the story\'s order, and her star says it is finished', () => {
  assert.deepEqual(MAP_CHAPTERS.map(row => row.place), PLACES);
  assert.deepEqual(MAP_CHAPTERS.map(row => row.chapter), ['kafli1', 'kafli2', 'kafli3', 'kafli4', 'kafli5', 'kafli6']);
  assert.deepEqual(MAP_CHAPTERS.map(row => row.number), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(MAP_CHAPTERS.map(row => row.star), STARS);
  // the stars are the ones the game plays the chapters by: with the first n the save is at chapter n + 1
  MAP_CHAPTERS.forEach((row, i) => {
    assert.equal(defaultChapter(saveAt(i)), row.chapter, `with ${i} stars the story is at ${row.chapter}`);
    assert.equal(chapterDone(row.chapter, saveAt(i)), false);
    assert.equal(chapterDone(row.chapter, saveAt(i + 1)), true, `${row.star} finishes ${row.chapter}`);
  });
  assert.equal(chapterDone('djamm', saveAt(6)), false, 'a show is no chapter of the story');
});

test('a finished chapter\'s place twinkles and asks; the others do what they always did', () => {
  const { marker, tap, narrated, ask, went } = mapRig({ done: 3, playing: 'kafli4' });
  for (const id of ['kambedla', 'uggedla', 'thorsedla']) {
    assert.equal(marker(id).classList.contains('asks'), true, `${id}: finished, so it asks`);
    assert.equal(marker(id).findAll(e => e.classList.contains('map-glitter')).length, 3, `${id}: three gold twinkles round it`);
    assert.equal(marker(id).findAll(e => e.classList.contains('map-star')).length, 1, `${id}: and its star still`);
  }
  assert.equal(marker('uggedla').getAttribute('aria-label'), 'Uggeðla: fara í kafla 2');
  for (const id of ['flugedla', 'sloedla', 'gramedla']) {
    assert.equal(marker(id).classList.contains('asks'), false, `${id}: not finished`);
    assert.equal(marker(id).findAll(e => e.classList.contains('map-glitter')).length, 0, `${id}: no twinkle`);
  }
  assert.equal(marker('sloedla').getAttribute('aria-label'), 'Slóeðla');

  // a place found but not finished: Mosi says its name and a sentence, as before, and no question comes up
  tap(marker('sloedla'));
  assert.deepEqual(narrated, ['k2_mosi_map_sloedla']);
  assert.equal(ask.isOpen, false);
  // the place of the chapter being played, not finished yet: the same
  tap(marker('flugedla'));
  assert.deepEqual(narrated, ['k2_mosi_map_sloedla', 'k2_mosi_map_flugedla']);
  assert.equal(ask.isOpen, false);
  // an empty place: nothing
  tap(marker('gramedla'));
  assert.equal(narrated.length, 2);
  assert.equal(ask.isOpen, false);
  assert.deepEqual(went, [], 'no place that is not finished starts a chapter');
});

test('the question: the friend\'s sticker, "Viltu fara í kafla 2?", "Já!" and "Nei", and Mosi says it aloud', () => {
  const { marker, tap, narrated, ask, went } = mapRig({ done: 3, playing: 'kafli4' });
  assert.equal(ask.el.hidden, true, 'no card until a place is tapped');
  tap(marker('uggedla'));
  assert.equal(ask.isOpen, true);
  assert.equal(ask.el.hidden, false);
  assert.equal(ask.el.getAttribute('role'), 'dialog');
  assert.equal(ask.el.getAttribute('aria-label'), 'Viltu fara í kafla 2?');
  const words = ask.el.findAll(e => e.classList.contains('map-ask-words'))[0];
  assert.equal(words.textContent, 'Viltu fara í kafla 2?', 'the owner\'s own words');
  assert.match(ask.el.findAll(e => e.tagName === 'IMG')[0].src, /uggedla-render-thumb\.webp$/, 'Uggeðla on the card, the map\'s own picture of her');
  assert.equal(ask.yes.textContent, 'Já!');
  assert.equal(ask.no.textContent, 'Nei');
  assert.deepEqual(ask.el.findAll(e => e.tagName === 'BUTTON'), [ask.yes, ask.no], 'two answers, yes first, and nothing else to tap');
  assert.deepEqual(narrated, ['book_mosi_kafli_2'], 'Mosi asks it aloud, and says nothing else');
  assert.deepEqual(went, [], 'the tap alone goes nowhere: it only asks');

  // every chapter's question
  for (const { number } of MAP_CHAPTERS) {
    assert.equal(askText(number), `Viltu fara í kafla ${number}?`);
    assert.equal(askLine(number), `book_mosi_kafli_${number}`);
  }
});

test('yes goes to that chapter, from its start; nothing more can be tapped while the page changes', () => {
  const { marker, tap, ask, went, stops } = mapRig({ done: 3, playing: 'kafli4' });
  tap(marker('thorsedla'));
  const before = stops();
  tap(ask.yes);
  assert.deepEqual(went, ['kafli3'], 'Þórseðla\'s place is chapter 3 (her star is k2_thorsedla, from the days hers was chapter 2)');
  assert.ok(stops() > before, 'Mosi\'s question ends');
  assert.equal(ask.el.classList.contains('going'), true, 'the card stands, its answers out of reach');
  tap(ask.yes);
  tap(ask.no);
  ask.el.dispatchEvent(pointerEvent('pointerdown'));
  ask.el.dispatchEvent(pointerEvent('pointerup'));
  assert.deepEqual(went, ['kafli3'], 'once');
  assert.equal(ask.isOpen, true, 'and a no after the yes changes nothing');

  // the page it goes to is the chapter's own, from its start: no time, no shot, only the quality and the debug switch kept
  assert.equal(chapterSearch('kafli3', ''), '?chapter=kafli3');
  assert.equal(chapterSearch('kafli3', '?chapter=kafli5&quality=low&debug=1&t=40&play=1&shot=hero&nyr=1'), '?quality=low&debug=1&chapter=kafli3');
  const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  assert.match(main, /onChapter: id => \{ location\.search = chapterSearch\(id, location\.search\); \}/, 'main.js loads the chapter\'s page on the yes');
  assert.match(main, /createBook\(document, \{[^}]*\bchapterId,/s, 'and tells the book which chapter this page plays');
});

test('no closes the question and leaves everything as it was', () => {
  const { save, marker, tap, ask, went, book, root } = mapRig({ done: 3, playing: 'kafli4' });
  const before = JSON.stringify(save.get());
  const classes = id => marker(id).className;
  const looked = PLACES.map(classes);
  tap(marker('kambedla'));
  assert.equal(ask.isOpen, true);
  tap(ask.no);
  assert.equal(ask.isOpen, false);
  assert.equal(ask.el.hidden, true);
  assert.deepEqual(went, [], 'no chapter starts');
  assert.equal(JSON.stringify(save.get()), before, 'the save is as it was');
  assert.deepEqual(PLACES.map(classes), looked, 'and the map');
  assert.equal(book.isOpen, true, 'the book stays open on the map');
  assert.equal(book.tab, 'map');

  // a tap beside the card is a no too; and it can be asked again
  tap(marker('kambedla'));
  ask.el.dispatchEvent(pointerEvent('pointerdown'));
  ask.el.dispatchEvent(pointerEvent('pointerup'));
  assert.equal(ask.isOpen, false, 'beside the card');
  tap(marker('uggedla'));
  assert.equal(ask.row.chapter, 'kafli2');
  // shutting the book puts the card away with it
  tap(root.findAll(e => e.classList.contains('book-close'))[0]);
  assert.equal(ask.isOpen, false);
  assert.equal(book.isOpen, false);
  assert.deepEqual(went, []);
  // and so does turning to another page
  book.open('map', 'child');
  tap(marker('uggedla'));
  assert.equal(ask.isOpen, true);
  tap(root.findAll(e => e.classList.contains('ribbon') && e.getAttribute('data-tab') === 'games')[0]);
  assert.equal(ask.isOpen, false);
  assert.deepEqual(went, []);
});

test('a yes that cannot be followed puts the card away: nothing is left standing with nothing to tap', () => {
  const original = console.error;
  const reported = [];
  console.error = (...args) => reported.push(args);
  try {
    const { marker, tap, ask } = mapRig({ done: 2, playing: 'kafli3', onChapter: () => { throw new Error('no address'); } });
    tap(marker('kambedla'));
    tap(ask.yes);
    assert.equal(ask.isOpen, false);
    assert.equal(reported.length, 1);
  } finally {
    console.error = original;
  }
});

test('in an old chapter the place the story has come to asks too: the way back', () => {
  // The story is at chapter 5 (four stars); the child went back to chapter 2 from the map.
  const old = mapRig({ done: 4, playing: 'kafli2' });
  assert.equal(storyChapter(old.save), 'kafli5');
  assert.equal(old.marker('sloedla').classList.contains('asks'), true, 'Slóeðla\'s place, where the story is, twinkles');
  assert.equal(old.marker('sloedla').classList.contains('done'), false, 'though it has no star');
  assert.equal(old.marker('gramedla').classList.contains('asks'), false, 'a chapter beyond it does not');
  old.tap(old.marker('sloedla'));
  assert.equal(old.ask.isOpen, true);
  assert.deepEqual(old.narrated, ['book_mosi_kafli_5']);
  old.tap(old.ask.yes);
  assert.deepEqual(old.went, ['kafli5']);

  // On the page of chapter 5 itself her place does what it always did: Mosi says her name.
  const there = mapRig({ done: 4, playing: 'kafli5' });
  assert.equal(there.marker('sloedla').classList.contains('asks'), false);
  there.tap(there.marker('sloedla'));
  assert.deepEqual(there.narrated, ['k2_mosi_map_sloedla']);
  assert.equal(there.ask.isOpen, false);

  // The story's place may still be an empty ring (Uggeðla's, before she is found): in an old chapter it asks all the same.
  const early = mapRig({ done: 1, playing: 'kafli1' });
  assert.equal(early.marker('uggedla').classList.contains('empty'), true);
  assert.equal(early.marker('uggedla').classList.contains('asks'), true);
  assert.equal(early.marker('uggedla').getAttribute('aria-label'), 'Ófundinn staður: fara í kafla 2');
  early.tap(early.marker('uggedla'));
  assert.deepEqual(early.narrated, ['book_mosi_kafli_2']);
  early.tap(early.ask.yes);
  assert.deepEqual(early.went, ['kafli2']);
  // while on the story's own page an empty ring stays silent
  const first = mapRig({ done: 1, playing: 'kafli2' });
  assert.equal(first.marker('uggedla').classList.contains('asks'), false);
  first.tap(first.marker('uggedla'));
  assert.equal(first.ask.isOpen, false);

  // A page that plays no chapter of the story (a show, the lab): only finished places ask.
  assert.equal(chapterAsked('sloedla', saveAt(4), null), null);
  assert.equal(chapterAsked('sloedla', saveAt(4), 'djamm'), null);
  assert.equal(chapterAsked('kambedla', saveAt(4), 'djamm').chapter, 'kafli1');
  assert.equal(chapterAsked('fen', saveAt(4), 'kafli2'), null, 'the Fen is no chapter');
  // With every chapter finished the story has come to its end, and every place asks.
  assert.equal(storyChapter(saveAt(6)), null);
  for (const place of PLACES) assert.ok(chapterAsked(place, saveAt(6), 'kafli6'), place);
});

test('a place asks as soon as its chapter is finished, while the book is open', () => {
  const { save, book, marker } = mapRig({ done: 1, playing: 'kafli2' });
  assert.equal(marker('uggedla').classList.contains('asks'), false);
  save.addPlace('uggedla');
  book.refresh();
  assert.equal(marker('uggedla').classList.contains('asks'), false, 'found is not finished');
  save.addStar('k2_uggedla');
  book.refresh();
  assert.equal(marker('uggedla').classList.contains('asks'), true);
  assert.equal(marker('uggedla').findAll(e => e.classList.contains('map-glitter')).length, 3);
  assert.equal(marker('uggedla').findAll(e => e.classList.contains('map-star')).length, 1);
});

test('"Áfram" after an old chapter leads to where the story has come to; a first play leads on as it always did', () => {
  // first plays: on to the chapter's own next (chapter.next), whatever the save
  assert.equal(onwardChapter({ playing: 'kafli2', next: 'kafli3', again: false, save: saveAt(2) }), 'kafli3');
  assert.equal(onwardChapter({ playing: 'kafli6', next: null, again: false, save: saveAt(6) }), null, 'the last chapter has no Áfram');
  // a save from the old chapter 2 (Þórseðla's star, not Uggeðla's) plays chapter 2 for the first time: Áfram is chapter 3 still
  const old = createSave(null);
  for (const star of ['k1_kambedla', 'k2_thorsedla', 'k2_uggedla']) old.addStar(star);
  assert.equal(onwardChapter({ playing: 'kafli2', next: 'kafli3', again: false, save: old }), 'kafli3');
  // an old chapter played again, the story at chapter 5: back to chapter 5, not on to chapter 3
  assert.equal(onwardChapter({ playing: 'kafli2', next: 'kafli3', again: true, save: saveAt(4) }), 'kafli5');
  assert.equal(onwardChapter({ playing: 'kafli4', next: 'kafli5', again: true, save: saveAt(4) }), 'kafli5');
  // every chapter finished: an old chapter leads on in order, and the last has no Áfram
  assert.equal(onwardChapter({ playing: 'kafli2', next: 'kafli3', again: true, save: saveAt(6) }), 'kafli3');
  assert.equal(onwardChapter({ playing: 'kafli6', next: null, again: true, save: saveAt(6) }), null);

  const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  assert.match(main, /const playedAgain = chapterDone\(chapterId, save\);/, 'main.js knows a chapter played again by its star, read before the page plays');
  assert.match(main, /onwardChapter\(\{ playing: chapterId, next: chapter\.next \?\? null, again: playedAgain, save \}\)/, 'and its Áfram goes where onwardChapter says');
});

test('the card is made for a six-year-old\'s finger: big answers, and the twinkles hold still when less motion is asked for', () => {
  const css = fs.readFileSync(new URL('../book.css', import.meta.url), 'utf8');
  const rule = selector => css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{[^}]*\\}`))?.[0] ?? '';
  assert.match(rule('.map-ask-answer'), /min-height: max\(var\(--book-target\), 12cqmin\)/, 'each answer at least the book\'s target high');
  assert.match(rule('.map-ask-answer'), /min-width: clamp\(170px/, 'and wide');
  assert.match(rule('.map-ask-words'), /font-size: clamp\(36px/, 'the question in big letters');
  assert.match(rule('.map-ask'), /position: absolute;[^}]*inset: 0/, 'the veil covers the whole book: nothing behind it takes a tap');
  assert.match(rule('.map-glitter'), /background: var\(--book-twinkle\)/, 'the glitter is the book\'s own gold twinkle');
  assert.match(rule('.map-glitter'), /pointer-events: none/, 'and takes no tap from its place');
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.book \.map-glitter \{ animation: twinkle-fade/, 'with less motion it only fades in and out where it is');
});

test('Mosi has a recording for every chapter\'s question', () => {
  const lines = JSON.parse(fs.readFileSync(new URL('../assets/audio/lines.json', import.meta.url), 'utf8'));
  const source = JSON.parse(fs.readFileSync(new URL('../assets/audio/book/lines-source.json', import.meta.url), 'utf8'));
  const WORDS = ['eitt', 'tvö', 'þrjú', 'fjögur', 'fimm', 'sex'];
  for (const { number } of MAP_CHAPTERS) {
    const id = askLine(number);
    const line = source.find(entry => entry.id === id);
    assert.ok(line, `${id} is in the book's lines`);
    assert.equal(line.speaker, 'mosi');
    assert.equal(line.text, `Viltu fara í kafla ${WORDS[number - 1]}?`, 'the number as a word, as it is said');
    assert.ok(lines[id]?.src, `${id} has its recording`);
    assert.ok(fs.existsSync(new URL(`../${lines[id].src}`, import.meta.url)), `${lines[id].src} is there`);
  }
});
