import test from 'node:test';
import assert from 'node:assert/strict';
import { createBook } from '../engine/book/book.js';
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
