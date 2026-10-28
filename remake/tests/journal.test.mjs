import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createSave } from '../engine/save.js';
import { createJournal, FLIGHT_SECONDS } from '../engine/scene/journal.js';
import { createStarSprite } from '../engine/scene/star-sprite.js';
import { createScene } from '../engine/scene/scene.js';
import { createPointResolver } from '../engine/points.js';
import { DONE } from '../engine/handle.js';
import { FakeDocument } from './fake-dom.mjs';

const KEY = 'mosi-remake-v1';

/** Web Storage as a plain map. */
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)) };
}
const blocked = () => { throw new DOMException('The site data is blocked', 'SecurityError'); };

// ---------------------------------------------------------------------------------------------
// The save

test('save works when storage throws', () => {
  const storages = {
    'every call throws': { getItem: blocked, setItem: blocked },
    'full, so writes throw': { getItem: () => null, setItem: blocked },
    'reads throw, writes do not': { getItem: blocked, setItem() {} },
    'not a storage at all': {},
    'no storage': null,
  };
  for (const [name, storage] of Object.entries(storages)) {
    const save = createSave(storage);
    assert.deepEqual(save.get(), { stars: [], findings: [], seen: [], places: [] }, name);
    assert.equal(save.addStar('k1_kambedla'), true, name);
    assert.equal(save.addStar('k1_kambedla'), false, `${name}: the star is kept once`);
    save.addFinding('frog');
    assert.deepEqual(save.get(), { stars: ['k1_kambedla'], findings: ['frog'], seen: [], places: [] }, `${name}: what the page was told stays in memory`);
  }

  // Blocked site data can throw on reading globalThis.localStorage itself, which is the default storage.
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: blocked });
  try {
    const save = createSave();
    save.addStar('k1_kambedla');
    assert.deepEqual(save.get().stars, ['k1_kambedla']);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

test('save keeps what was earned for the next visit', () => {
  const storage = memoryStorage();
  const first = createSave(storage);
  assert.equal(first.addStar('k1_kambedla'), true);
  assert.equal(first.addStar('k1_kambedla'), false);
  first.addFinding('beetle');
  first.addFinding('frog');
  first.addFinding('beetle');
  first.addSeen('mosi');
  assert.deepEqual(JSON.parse(storage.getItem(KEY)), { stars: ['k1_kambedla'], findings: ['beetle', 'frog'], seen: ['mosi'], places: [] });

  assert.deepEqual(createSave(storage).get(), { stars: ['k1_kambedla'], findings: ['beetle', 'frog'], seen: ['mosi'], places: [] }, 'the next visit has them');
  assert.deepEqual(createSave(storage, 'another-game').get(), { stars: [], findings: [], seen: [], places: [] }, 'under its own key');

  const copy = first.get();
  copy.stars.push('not-earned');
  assert.deepEqual(first.get().stars, ['k1_kambedla'], 'get hands out a copy');
});

test('save starts empty from damaged data and mends it with the next change', () => {
  const damaged = ['{not json', '[]', '"stars"', 'null', '{"stars":"k1_kambedla","findings":{}}'];
  for (const text of damaged) {
    const storage = memoryStorage({ [KEY]: text });
    const save = createSave(storage);
    assert.deepEqual(save.get(), { stars: [], findings: [], seen: [], places: [] }, text);
    save.addStar('k1_kambedla');
    assert.deepEqual(JSON.parse(storage.getItem(KEY)), { stars: ['k1_kambedla'], findings: [], seen: [], places: [] }, text);
  }
  const mixed = memoryStorage({ [KEY]: '{"stars":["k1_kambedla",7,"",null,"k1_kambedla"],"findings":["frog",{}],"seen":["mosi",3]}' });
  assert.deepEqual(createSave(mixed).get(), { stars: ['k1_kambedla'], findings: ['frog'], seen: ['mosi'], places: [] }, 'what is not an id is dropped, and a repeat');
});

test('save refuses an id that is not a name', () => {
  const save = createSave(null);
  for (const id of ['', 7, null, undefined, {}]) {
    assert.throws(() => save.addStar(id), TypeError);
    assert.throws(() => save.addFinding(id), TypeError);
    assert.throws(() => save.addSeen(id), TypeError);
  }
});

// Review Focus 5: a save from before the book, or a storage that throws, still opens the book, and "Nýtt!" shows until each card is opened.
test('old saves and blocked storage', () => {
  const old = memoryStorage({ [KEY]: JSON.stringify({ stars: ['k1_kambedla'], findings: ['frog'] }) });
  assert.deepEqual(createSave(old).get(), { stars: ['k1_kambedla'], findings: ['frog'], seen: [], places: [] }, 'a save from before the book has seen nothing');

  const save = createSave({ getItem: blocked, setItem: blocked });
  assert.deepEqual(save.get(), { stars: [], findings: [], seen: [], places: [] }, 'a storage that throws still gives the lists');
  assert.equal(save.addSeen('mosi'), true);
  assert.equal(save.addSeen('mosi'), false);
  assert.deepEqual(save.get().seen, ['mosi'], 'and keeps what was seen in memory');
});

test('places survive a round trip', () => {
  const storage = memoryStorage();
  const save = createSave(storage);
  assert.equal(save.addPlace('sloedla'), true, 'a new place');
  assert.equal(save.addPlace('sloedla'), false, 'the same place again is kept once');
  assert.equal(save.addPlace('fen'), true);
  assert.deepEqual(save.get().places, ['sloedla', 'fen'], 'in the order they came');
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).places, ['sloedla', 'fen'], 'written with the rest');
  assert.deepEqual(createSave(storage).get().places, ['sloedla', 'fen'], 'and there on the next visit');
  assert.throws(() => save.addPlace(''), TypeError);
  // A save from before the map has no places, and one with a damaged list keeps only the ids, each once.
  assert.deepEqual(createSave(memoryStorage({ [KEY]: JSON.stringify({ stars: ['k1_kambedla'] }) })).get().places, []);
  assert.deepEqual(createSave(memoryStorage({ [KEY]: '{"places":["uggedla",3,"",null,"uggedla","flugedla"]}' })).get().places, ['uggedla', 'flugedla']);
  // Without storage, in memory.
  const bare = createSave(null);
  bare.addPlace('uggedla');
  assert.deepEqual(bare.get().places, ['uggedla']);
});

// ---------------------------------------------------------------------------------------------
// The journal

const PAGE = ['journal-button', 'star-slots', 'journal-flights', 'journal-badge'];
const FRIENDS = ['Kambeðla', 'Þórseðla', 'Grameðla', 'Uggeðla', 'Slóeðla', 'Flugeðla'];

/** A stand-in for the book (engine/book/book.js): what it was asked to do, and a picture for each find in `pictures`. */
function fakeBook(pictures = {}) {
  return {
    opened: [], options: [], closed: 0, refreshed: 0, isOpen: false,
    open(tab, by, options) { this.opened.push([tab, by]); this.options.push(options); this.isOpen = true; },
    close() { this.closed++; this.isOpen = false; },
    refresh() { this.refreshed++; },
    pictureOf: id => pictures[id] ?? null,
  };
}

/** A journal over a page with the elements index.html has, a save in memory, a book and the book's sound. */
function journalRig({ stored = null, save = null, book = fakeBook(), audio = null } = {}) {
  const doc = new FakeDocument(PAGE);
  const storage = memoryStorage(stored ? { [KEY]: JSON.stringify(stored) } : {});
  const kept = save ?? createSave(storage);
  const journal = createJournal(doc, kept, { book, audio });
  const el = id => doc.getElementById(id);
  /** The journal button's star slots, in the order of the friends. */
  const slots = () => el('star-slots').children;
  const earned = () => slots().map(slot => slot.classList.contains('earned'));
  return { doc, storage, save: kept, journal, book, el, slots, earned };
}

const placeOf = style => {
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(style.transform);
  assert.ok(match, `a position in "${style.transform}"`);
  return { x: Number(match[1]), y: Number(match[2]) };
};

test('findings are counted once per id', () => {
  const { save, journal, el } = journalRig();
  assert.equal(el('journal-button').hidden, true, 'the book stays out of the way until there is something in it');
  assert.equal(journal.addFinding('frog'), true);
  assert.equal(journal.addFinding('frog'), false, 'the same animal again is not a second find');
  assert.equal(journal.addFinding('snail'), true);
  assert.deepEqual(journal.findings, ['frog', 'snail']);
  assert.deepEqual(save.get().findings, ['frog', 'snail']);
  assert.equal(el('journal-button').hidden, false, 'the first find brings the book out');
  assert.throws(() => journal.addFinding(''), TypeError);
});

test('a find flies its picture from the tap to the button, sounds once on landing, and badges the button until the book opens', () => {
  const sounds = [];
  const { journal, book, el } = journalRig({ book: fakeBook({ butterfly: 'assets/book/images/kalligrammatid-life-thumb.jpg', frog: 'assets/book/images/frog-common-thumb.jpg' }), audio: { sfx: name => sounds.push(name) } });
  el('journal-button').rect = { left: 1100, top: 12, width: 160, height: 64 }; // its middle is at 1180, 44
  const flying = el('journal-flights').children;
  assert.equal(journal.addFinding('butterfly', { name: 'butterfly-1', x: 400, y: 300 }), true);
  assert.equal(flying.length, 1);
  assert.equal(flying[0].children[0].src, 'assets/book/images/kalligrammatid-life-thumb.jpg', 'the card\'s own picture flies');
  assert.deepEqual(placeOf(flying[0].style), { x: 400, y: 300 }, 'from where the child tapped');

  journal.update(FLIGHT_SECONDS - 0.02);
  const arriving = placeOf(flying[0].style);
  assert.ok(Math.abs(arriving.x - 1180) < 3 && Math.abs(arriving.y - 44) < 3, `into the button: ${arriving.x}, ${arriving.y}`);
  assert.deepEqual(sounds, [], 'nothing sounds on the way');
  assert.equal(el('journal-badge').hidden, true);
  journal.update(0.03);
  assert.equal(flying.length, 0, 'it has landed');
  assert.deepEqual(sounds, ['newAnimal'], 'a new animal sounds once, as it lands');
  assert.equal(el('journal-badge').hidden, false, 'and the button wears a badge');
  assert.equal(journal.addFinding('butterfly', { x: 10, y: 10 }), false, 'the same animal again');
  assert.equal(flying.length, 0, 'flies nothing');

  el('journal-flights').rect = { left: 0, top: 0, width: 1280, height: 800 };
  journal.addFinding('frog'); // found with no tap to fly from
  assert.deepEqual(placeOf(flying[0].style), { x: 640, y: 400 }, 'it flies from the middle of the screen');

  el('journal-button').dispatchEvent(new Event('click'));
  assert.deepEqual(book.opened, [['animals', 'child']], 'the button opens the child\'s book on its animals');
  assert.equal(el('journal-badge').hidden, true, 'and the badge is gone once the book is open');
});

test('addPlace writes the save once and flies a marker', () => {
  const sounds = [];
  // the storage counts its writes: a place is written when it comes, and never again for the same place
  const storage = memoryStorage();
  let writes = 0;
  const setItem = storage.setItem;
  storage.setItem = (key, value) => { writes++; return setItem(key, value); };
  const { journal, save, el, book } = journalRig({ save: createSave(storage), audio: { sfx: name => sounds.push(name) } });
  el('journal-button').rect = { left: 1100, top: 12, width: 160, height: 64 }; // its middle is at 1180, 44
  const flying = el('journal-flights').children;
  assert.equal(journal.addPlace('sloedla', { x: 300, y: 420 }), true, 'a new place on the map');
  assert.deepEqual(save.get().places, ['sloedla'], 'saved at once');
  assert.equal(writes, 1, 'in one write');
  assert.deepEqual(JSON.parse(storage.getItem(KEY)).places, ['sloedla'], 'to the storage');
  assert.equal(el('journal-button').hidden, false, 'the book comes out for it');
  assert.equal(flying.length, 1, 'a marker flies');
  assert.ok(flying[0].classList.contains('flying-place'), 'a small round marker');
  assert.equal(String(flying[0].style['--hue']).toLowerCase(), '#6793d0', 'in Slóeðla\'s hue');
  assert.deepEqual(placeOf(flying[0].style), { x: 300, y: 420 }, 'from where she was on the screen');
  assert.equal(journal.addPlace('sloedla', { x: 10, y: 10 }), false, 'the same place again');
  assert.equal(flying.length, 1, 'flies nothing more');
  assert.deepEqual(save.get().places, ['sloedla'], 'and is kept once');
  assert.equal(writes, 1, 'without writing the save again');
  journal.update(FLIGHT_SECONDS - 0.02);
  const arriving = placeOf(flying[0].style);
  assert.ok(Math.abs(arriving.x - 1180) < 3 && Math.abs(arriving.y - 44) < 3, `into the button: ${arriving.x}, ${arriving.y}`);
  assert.deepEqual(sounds, []);
  journal.update(0.03);
  assert.equal(flying.length, 0, 'it has landed');
  assert.equal(writes, 1, 'landing writes nothing more');
  assert.deepEqual(sounds, ['newAnimal'], 'the book\'s bell, once');
  assert.equal(el('journal-badge').hidden, false, 'the button wears its badge');
  assert.ok(book.refreshed >= 1, 'and the book shows the place');
  assert.ok(el('journal-button').style.transform.startsWith('scale('), 'the book nods');
  // the Fen is a place too, in the Fen's water teal; a name that is no place is refused
  assert.equal(journal.addPlace('fen'), true);
  assert.equal(String(flying[0].style['--hue']).toLowerCase(), '#3f7a6e');
  assert.deepEqual(journal.places, ['sloedla', 'fen']);
  assert.throws(() => journal.addPlace(''), TypeError);
});

test('a paused game holds a find\'s flight in the air', () => {
  const { journal, el } = journalRig({ book: fakeBook({ frog: 'assets/book/images/frog-common-thumb.jpg' }) });
  journal.addFinding('frog', { x: 200, y: 600 });
  journal.update(0.5);
  const held = placeOf(el('journal-flights').children[0].style);
  for (let i = 0; i < 100; i++) journal.update(0); // the child's book is open: the clock stands still
  assert.deepEqual(placeOf(el('journal-flights').children[0].style), held);
  assert.equal(el('journal-badge').hidden, true, 'not in the book yet');
  journal.update(FLIGHT_SECONDS);
  assert.equal(el('journal-flights').children.length, 0, 'and it lands when the game goes on');
  assert.equal(el('journal-badge').hidden, false);
});

test('a star flies to the journal in 1.2 s and is saved when it lands', () => {
  const { save, journal, el, slots, earned } = journalRig();
  assert.equal(FLIGHT_SECONDS, 1.2);
  slots()[0].rect = { left: 1000, top: 20, width: 30, height: 30 }; // Kambeðla's slot, top right
  const flight = journal.addStar('k1_kambedla', { x: 400, y: 300 });
  assert.equal(flight.done, false);
  assert.equal(el('journal-button').hidden, false, 'the book is there to receive it');
  assert.equal(el('journal-flights').children.length, 1);
  assert.deepEqual(placeOf(el('journal-flights').children[0].style), { x: 400, y: 300 }, 'it starts where the star was on the screen');
  assert.deepEqual(journal.stars, [], 'it is not in the book until it lands');
  assert.deepEqual(save.get().stars, []);

  journal.update(0.6);
  const middle = placeOf(el('journal-flights').children[0].style);
  assert.ok(middle.x > 400 && middle.x < 1015, `on its way across: ${middle.x}`);
  assert.equal(flight.done, false);

  journal.update(0.59); // 1.19 s
  assert.equal(flight.done, false, 'not before 1.2 s');
  assert.deepEqual(save.get().stars, []);
  const arriving = placeOf(el('journal-flights').children[0].style);
  assert.ok(Math.abs(arriving.x - 1015) < 3 && Math.abs(arriving.y - 35) < 3, `at the slot's middle: ${arriving.x}, ${arriving.y}`);

  journal.update(0.02);
  assert.equal(flight.done, true);
  assert.equal(flight.cancelled, false);
  assert.deepEqual(save.get().stars, ['k1_kambedla'], 'saved on landing');
  assert.deepEqual(journal.stars, ['k1_kambedla']);
  assert.equal(el('journal-flights').children.length, 0, 'the flying star is gone');
  assert.deepEqual(earned(), [true, false, false, false, false, false], 'and the slot is lit');
});

test('the flight bows up on its way, but never off the top of the screen', () => {
  const heights = from => {
    const { journal, el, slots } = journalRig();
    slots()[0].rect = { left: 1000, top: 20, width: 30, height: 30 }; // the slot's middle is at 1015, 35
    journal.addStar('k1_kambedla', from);
    const ys = [];
    for (let i = 0; i < 11; i++) {
      journal.update(0.1);
      ys.push(placeOf(el('journal-flights').children[0].style).y);
    }
    return ys;
  };
  const low = heights({ x: 400, y: 500 });
  assert.ok(low[5] < (500 + 35) / 2 - 60, `from the middle of the screen it bows up over the straight line: ${low[5]}`);
  assert.ok(low.every(y => y > 40), 'and stays whole on the screen: it is 72 px across');
  const top = heights({ x: 400, y: 30 }); // a star that was already near the top edge
  assert.ok(top.every(y => y >= 30 && y <= 35), `the bow does not carry it off the top: ${top.join(', ')}`);
});

test('a second call for a star already on its way shares the flight', () => {
  const { save, journal, doc, el } = journalRig();
  const first = journal.addStar('k1_kambedla', { x: 100, y: 100 });
  const made = doc.created;
  const second = journal.addStar('k1_kambedla', { x: 120, y: 90 });
  assert.equal(second, first, 'one star, one flight');
  assert.equal(doc.created, made, 'no second star in the air');
  journal.update(FLIGHT_SECONDS + 0.01);
  assert.equal(first.done, true);
  assert.deepEqual(save.get().stars, ['k1_kambedla']);
  assert.equal(el('journal-flights').children.length, 0);
});

test('a star for a book that already has it still flies, and is still kept once', () => {
  const { save, journal } = journalRig({ stored: { stars: ['k1_kambedla'], findings: [] } });
  const again = journal.addStar('k1_kambedla', { x: 10, y: 10 });
  assert.equal(again.done, false, 'a replay gets its ceremony too');
  journal.update(FLIGHT_SECONDS + 0.01);
  assert.equal(again.done, true);
  assert.deepEqual(save.get().stars, ['k1_kambedla']);
});

test('a flight that is cancelled still lands the star: the child earned it', () => {
  const { save, journal, el, earned } = journalRig();
  const flight = journal.addStar('k1_kambedla', { x: 0, y: 0 });
  journal.update(0.3);
  flight.cancel();
  assert.equal(flight.done, true);
  assert.deepEqual(save.get().stars, ['k1_kambedla']);
  assert.equal(el('journal-flights').children.length, 0);
  assert.equal(earned()[0], true);
  assert.doesNotThrow(() => journal.update(1), 'nothing is left to move');
});

test('time that does not move does not move the star', () => {
  const { journal, el } = journalRig();
  const flight = journal.addStar('k1_kambedla', { x: 50, y: 60 });
  journal.update(0);
  journal.update(-1);
  assert.deepEqual(placeOf(el('journal-flights').children[0].style), { x: 50, y: 60 });
  assert.equal(flight.done, false);
});

test('a star lands in its friend\'s slot, whatever the chapter number', () => {
  const { journal, save, earned } = journalRig();
  journal.addStar('k2_thorsedla', { x: 0, y: 0 });
  journal.addStar('k5_flugedla', { x: 0, y: 0 });
  journal.update(FLIGHT_SECONDS + 0.01);
  assert.deepEqual(earned(), [false, true, false, false, false, true]);
  journal.addStar('k9_nobody', { x: 0, y: 0 });
  journal.update(FLIGHT_SECONDS + 0.01);
  assert.deepEqual(earned(), [false, true, false, false, false, true], 'a star with no friend slot lights none');
  assert.deepEqual(save.get().stars, ['k2_thorsedla', 'k5_flugedla', 'k9_nobody'], 'but it is kept');
});

test('the book shows what the save already holds', () => {
  const { journal, el, earned } = journalRig({ stored: { stars: ['k1_kambedla'], findings: ['frog', 'snail'] } });
  assert.equal(el('journal-button').hidden, false);
  assert.deepEqual(earned(), [true, false, false, false, false, false]);
  assert.deepEqual(journal.stars, ['k1_kambedla']);
  assert.deepEqual(journal.findings, ['frog', 'snail']);
});

test('the button opens the child\'s book on its animals, and a scene opens it on its dinosaurs', () => {
  const { journal, book, el } = journalRig({ stored: { stars: ['k1_kambedla'], findings: ['frog'] } });
  assert.equal(journal.isOpen, false);
  el('journal-button').dispatchEvent(new Event('click'));
  assert.deepEqual(book.opened, [['animals', 'child']], 'the child\'s, which holds the game (book.js)');
  assert.equal(journal.isOpen, true);
  journal.close();
  assert.equal(book.closed, 1);
  assert.equal(journal.isOpen, false);
  journal.open(); // as s.journal.open does: the last scene opens the book while Mosi speaks
  assert.deepEqual(book.opened.at(-1), ['dinosaurs', 'script'], 'the script\'s, which holds nothing');
  assert.equal(book.options.at(-1).nod, null, 'and nods no tile');
  journal.open('dinosaurs', { nod: 'thorsedla' }); // chapter 2's end: Þórseðla, new, nods
  assert.deepEqual(book.opened.at(-1), ['dinosaurs', 'script']);
  assert.equal(book.options.at(-1).nod, 'thorsedla', 'the book is asked to nod her tile');
});

test('the book keeps up with a star that lands', () => {
  const { journal, book } = journalRig();
  journal.addStar('k1_kambedla', { x: 0, y: 0 });
  journal.update(FLIGHT_SECONDS + 0.01);
  assert.equal(book.refreshed, 1, 'the book shows what the star opened (a friend\'s card, her game, her place on the map)');
});

test('the book can be brought out and put away', () => {
  const { journal, el } = journalRig();
  journal.show();
  assert.equal(el('journal-button').hidden, false);
  journal.show(false);
  assert.equal(el('journal-button').hidden, true);
});

test('main.js ties the book the child holds to the clock and the sound', () => {
  const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // The sound (the voice, the music and the effects: engine/audio/hold.js) is held with the clock, and let go with it.
  const wiring = /createBook\(document, \{[\s\S]*?onPause: paused => \{\s*clock\.setPaused\(paused\);\s*hold\('book', paused\);\s*\},?\s*\}\)/;
  assert.match(main, wiring, 'createBook gets an onPause that sets the clock and then holds the sound');
});

test('the journal says so when the page lacks a piece of it', () => {
  const doc = new FakeDocument(PAGE.filter(id => id !== 'journal-flights'));
  assert.throws(() => createJournal(doc, createSave(null)), /journal-flights/);
});

test('index.html has every element the journal, the book and the tray ask for', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of [...PAGE, 'book', 'tray', 'view']) assert.ok(html.includes(`id="${id}"`), `#${id} is on the page`);
  assert.match(html, /<div id="tray"[^>]* hidden>/, 'the tray starts put away');
  assert.match(html, /<button id="journal-button"[^>]* hidden>/, 'and so does the book\'s button');
  assert.match(html, /<div id="book"[^>]* hidden>/, 'and the book');
});

// ---------------------------------------------------------------------------------------------
// The star

test('the star rises from its point and then hovers, as a function of the clock', () => {
  const from = new THREE.Vector3(1, 1.5, 2);
  const sprite = createStarSprite({ from });
  const at = age => { sprite.at(age); return sprite.object.position.clone(); };
  assert.ok(at(0).distanceTo(from) < 1e-9, 'it starts at the point');
  assert.ok(at(1).y > at(0.5).y && at(0.5).y > 1.5, 'it rises');
  assert.ok(at(30).y > 1.5 + 1.5, 'and ends up well above the plates');
  for (const age of [0, 0.4, 2, 9]) {
    const p = at(age);
    assert.ok(Math.abs(p.x - 1) < 1e-9 && Math.abs(p.z - 2) < 1e-9, 'straight up');
  }
  const early = at(3.7);
  at(11);
  assert.deepEqual(at(3.7), early, 'the same age is the same place, whatever came before');
  assert.ok(sprite.object.scale.x > 0);
  assert.equal(sprite.point, sprite.object.position, 'the point to tap is the sprite itself');
  assert.doesNotThrow(() => sprite.dispose());
});

/** A pointer that remembers what the scene asked of it, and lets a test tap. */
function fakePointer() {
  const targets = new Map();
  const listeners = { tap: [], drag: [] };
  return {
    targets,
    addTarget: (name, spec) => targets.set(name, spec),
    removeTarget: name => targets.delete(name),
    on(event, fn) {
      listeners[event].push(fn);
      return () => {
        const i = listeners[event].indexOf(fn);
        if (i >= 0) listeners[event].splice(i, 1);
      };
    },
    /** A tap on a target; a target that is not there is not hit, as with the real pointer. */
    tap: name => listeners.tap.slice().forEach(fn => fn({ name: targets.has(name) ? name : null, x: 0, y: 0 })),
  };
}

/**
 * The scene over a real journal on a fake page, with a camera 10 m from the origin looking at it.
 * `step(seconds)` runs frames of a tenth of a second the way main.js does: the journal first, then the scene.
 */
function starRig({ withJournal = true } = {}) {
  const camera = new THREE.PerspectiveCamera(40, 800 / 500, 0.1, 1200);
  camera.position.set(0, 1.6, 10);
  camera.lookAt(0, 1.6, 0);
  camera.updateMatrixWorld();
  const scene3 = new THREE.Scene();
  const world = {
    camera, scene: scene3, actors: new Map(),
    renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 500 }) } },
  };
  world.resolvePoint = createPointResolver(world);
  const rig = journalRig();
  const asked = [];
  const finds = [];
  const places = [];
  const journal = withJournal
    ? {
      addStar(id, from) { asked.push({ id, from }); return rig.journal.addStar(id, from); },
      addFinding(id, from) { finds.push({ id, from }); return rig.journal.addFinding(id, from); },
      addPlace(id, from) { places.push({ id, from }); return rig.journal.addPlace(id, from); },
      open: (tab, options) => rig.journal.open(tab, options),
      close: () => rig.journal.close(),
    }
    : null;
  const pointer = fakePointer();
  const stage = createScene({
    world, director: { stop() {}, handheld() {} }, ui: { reset() {} }, voice: { stop() {} }, pointer, journal,
  });
  const step = (seconds, dt = 0.1) => {
    for (let i = 0; i < Math.round(seconds / dt); i++) {
      rig.journal.update(dt);
      stage.update(dt);
    }
  };
  return { ...rig, world, scene3, pointer, stage, s: stage.s, step, asked, finds, places };
}

const STAR = 'k1_kambedla';
const PLATES = [0, 1.8, 0];

test('a star is saved once even when tapped twice', () => {
  const { stage, s, pointer, scene3, save, step, asked, el } = starRig();
  const done = [];
  stage.start(function* script() { done.push(yield s.star(STAR, PLATES)); });
  step(3);
  assert.ok(pointer.targets.has(`star:${STAR}`), 'the star is there to tap');
  assert.equal(scene3.children.length, 1);

  pointer.tap(`star:${STAR}`);
  pointer.tap(`star:${STAR}`); // a second tap on it in the same frame
  step(0.1);
  pointer.tap(`star:${STAR}`); // and one while it is on its way: it is no longer there
  step(0.5);
  assert.equal(asked.length, 1, 'one star sent to the journal');
  assert.equal(el('journal-flights').children.length, 1, 'one star in the air');
  assert.equal(pointer.targets.size, 0, 'nothing left to tap');
  assert.equal(scene3.children.length, 0, 'and none in the forest');
  assert.deepEqual(done, [], 'the scene goes on when the star has landed');

  step(1.2);
  assert.deepEqual(done, ['tapped']);
  assert.deepEqual(save.get().stars, [STAR], 'kept once');
  assert.equal(el('journal-flights').children.length, 0);
});

test('the star leaves from the spot on the screen where it was when it was tapped', () => {
  const { stage, s, pointer, world, step, asked } = starRig();
  stage.start(function* script() { yield s.star(STAR, PLATES); });
  step(2.5);
  const sprite = pointer.targets.get(`star:${STAR}`).point; // the sprite's own position: it stays where the star ended
  pointer.tap(`star:${STAR}`);
  step(0.2);
  const where = world.resolvePoint(sprite).project(world.camera);
  assert.equal(asked.length, 1);
  assert.ok(Math.abs(asked[0].from.x - ((where.x + 1) / 2) * 800) < 1e-6, 'in canvas pixels');
  assert.ok(Math.abs(asked[0].from.y - ((1 - where.y) / 2) * 500) < 1e-6);
});

test('s.star waits 8 s for a tap and then sends the star to the journal on its own', () => {
  const { stage, s, pointer, scene3, save, step, el } = starRig();
  const done = [];
  stage.start(function* script() { done.push([yield s.star(STAR, PLATES), s.time]); });
  step(7.8);
  assert.ok(pointer.targets.has(`star:${STAR}`), 'still waiting at 7.8 s');
  assert.equal(el('journal-flights').children.length, 0);
  step(0.4);
  assert.equal(pointer.targets.size, 0, 'the child did not tap: the star goes by itself');
  assert.equal(scene3.children.length, 0);
  assert.equal(el('journal-flights').children.length, 1);
  step(0.8); // 9.0 s: 1.0 s into the flight
  assert.deepEqual(done, []);
  assert.deepEqual(save.get().stars, []);
  step(0.4);
  assert.equal(done.length, 1);
  assert.equal(done[0][0], 'idle');
  assert.ok(Math.abs(done[0][1] - 9.2) < 0.15, `landed at about 9.2 s: ${done[0][1]}`);
  assert.deepEqual(save.get().stars, [STAR]);
});

test('seeking, s.star takes the star after 1.5 s, whatever the child does', () => {
  const { stage, s, pointer, save, step } = starRig();
  stage.seeking = true;
  const done = [];
  stage.start(function* script() { done.push([yield s.star(STAR, PLATES), s.time]); });
  step(1.0);
  pointer.tap(`star:${STAR}`); // a real tap does not change when a capture lands
  step(0.4);
  assert.equal(pointer.targets.size, 1, 'at 1.4 s the star is still up');
  step(0.2);
  assert.equal(pointer.targets.size, 0, 'taken at 1.5 s');
  step(1.3);
  assert.equal(done.length, 1);
  assert.equal(done[0][0], 'tapped');
  assert.ok(Math.abs(done[0][1] - 2.7) < 0.15, `1.5 s plus the 1.2 s flight: ${done[0][1]}`);
  assert.deepEqual(save.get().stars, [STAR]);
});

test('the star rises from its point and its tap target follows it', () => {
  const { stage, s, pointer, world, scene3, step } = starRig();
  const from = new THREE.Vector3(1, 1.5, 0);
  stage.start(function* script() { yield s.star(STAR, from.toArray()); });
  step(0.1);
  const target = pointer.targets.get(`star:${STAR}`);
  assert.ok(target.radius >= 0.3 && target.radius <= 2, `a finger's worth of star: ${target.radius} m`);
  const here = () => world.resolvePoint(target.point);
  assert.ok(here().distanceTo(from) < 0.3, 'it starts at the point it rises from');
  step(3);
  assert.ok(here().y > from.y + 1.5, 'it has risen');
  assert.ok(Math.abs(here().x - 1) < 1e-9 && Math.abs(here().z) < 1e-9, 'straight up');
  assert.ok(here().distanceTo(scene3.children[0].position) < 1e-9, 'the target is where the sprite is');
});

test('a star that is stopped leaves nothing behind, and one on its way still lands', () => {
  const waiting = starRig();
  waiting.stage.start(function* script() { yield waiting.s.star(STAR, PLATES); });
  waiting.step(1);
  waiting.stage.stop();
  assert.equal(waiting.scene3.children.length, 0, 'no sprite');
  assert.equal(waiting.pointer.targets.size, 0, 'no target');
  assert.equal(waiting.stage.idle, true);
  assert.deepEqual(waiting.save.get().stars, [], 'a star nobody took is not earned');

  const flying = starRig();
  flying.stage.start(function* script() { yield flying.s.star(STAR, PLATES); });
  flying.step(1);
  flying.pointer.tap(`star:${STAR}`);
  flying.step(0.5);
  assert.equal(flying.el('journal-flights').children.length, 1);
  flying.stage.stop();
  assert.deepEqual(flying.save.get().stars, [STAR], 'tapped, so earned');
  assert.equal(flying.el('journal-flights').children.length, 0);
});

test('s.found puts an animal in the book, once, from where the child tapped it', () => {
  const { s, journal, save, finds } = starRig();
  const tap = { name: 'frog-1', x: 320, y: 410 };
  assert.equal(s.found('frog', tap), DONE);
  assert.equal(s.found('frog'), DONE);
  assert.equal(s.found('beetle'), DONE);
  assert.deepEqual(journal.findings, ['frog', 'beetle']);
  assert.deepEqual(save.get().findings, ['frog', 'beetle']);
  assert.equal(finds[0].from, tap, 'the tap goes to the journal, which flies the picture from it');
});

test('s.place puts a place on the book\'s map, once, from where it is on the screen', () => {
  const { s, journal, save, places } = starRig();
  const from = { x: 512, y: 330 };
  assert.equal(s.place('uggedla', from), DONE);
  assert.equal(s.place('uggedla'), DONE);
  assert.deepEqual(journal.places, ['uggedla']);
  assert.deepEqual(save.get().places, ['uggedla']);
  assert.equal(places[0].from, from, 'the point goes to the journal, which flies the marker from it');
  const { s: bare } = starRig({ withJournal: false });
  assert.throws(() => bare.place('uggedla'), /journal/);
});

test('s.journal.open and close open and shut the book on its dinosaurs, as the script\'s, while the scene goes on', () => {
  const { stage, s, journal, book, step } = starRig();
  assert.equal(s.journal.open(), DONE);
  assert.deepEqual(book.opened, [['dinosaurs', 'script']], 'which holds nothing (book.js)');
  assert.equal(s.journal.open('dinosaurs', { nod: 'thorsedla' }), DONE);
  assert.equal(book.options.at(-1).nod, 'thorsedla', 'a scene can ask for a tile to nod');
  assert.equal(s.journal.close(), DONE);
  assert.equal(journal.isOpen, false);

  // A scene that ends in the book: it goes on under the open book, and the book can be shut by the scene.
  const seen = [];
  stage.start(function* script() {
    s.journal.open();
    yield s.wait(1);
    seen.push(['open', journal.isOpen, s.time]);
    s.journal.close();
    seen.push(['shut', journal.isOpen]);
  });
  step(1.2);
  assert.deepEqual(seen, [['open', true, 1], ['shut', false]], 'time moved while the book was open');
});

test('s.star and s.found say so when the scene has no journal', () => {
  const { s } = starRig({ withJournal: false });
  assert.throws(() => s.star(STAR, PLATES), /journal/);
  assert.throws(() => s.found('frog'), /journal/);
  assert.throws(() => s.journal.open(), /journal/);
  assert.throws(() => s.journal.close(), /journal/);
  const bare = createScene({ world: {}, director: {}, ui: {}, voice: {} });
  assert.throws(() => bare.s.star(STAR, PLATES), /journal/);
  assert.throws(() => bare.s.journal.open(), /journal/);
});

test('the button\'s slots are in each friend\'s main hue as STYLE.md section 3 has it, so they cannot drift from it again', () => {
  // STYLE.md's species colour map: the row of each friend, and its Main column.
  const style = fs.readFileSync(new URL('../STYLE.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const section = style.slice(style.indexOf('## 3. Characters'), style.indexOf('## 4. '));
  const rows = section.split('\n').filter(line => line.startsWith('|')).map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
  const main = rows[0].indexOf('Main');
  assert.ok(main > 0, 'the table has a Main column');
  const hueOf = name => {
    const row = rows.find(cells => cells[0] === name);
    assert.ok(row, `STYLE.md has a row for ${name}`);
    return /#[0-9a-f]{6}/i.exec(row[main])[0].toLowerCase();
  };
  const { slots } = journalRig(); // the map's markers take their hues from the same list (journal.js FRIENDS)
  FRIENDS.forEach((name, i) => {
    assert.equal(String(slots()[i].style['--hue']).toLowerCase(), hueOf(name), `${name}'s slot`);
  });
  assert.equal(hueOf('Uggeðla'), '#47908a', 'Uggeðla is teal');
});
