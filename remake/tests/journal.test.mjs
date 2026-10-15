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
    assert.deepEqual(save.get(), { stars: [], findings: [] }, name);
    assert.equal(save.addStar('k1_kambedla'), true, name);
    assert.equal(save.addStar('k1_kambedla'), false, `${name}: the star is kept once`);
    save.addFinding('frog');
    assert.deepEqual(save.get(), { stars: ['k1_kambedla'], findings: ['frog'] }, `${name}: what the page was told stays in memory`);
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
  assert.deepEqual(JSON.parse(storage.getItem(KEY)), { stars: ['k1_kambedla'], findings: ['beetle', 'frog'] });

  assert.deepEqual(createSave(storage).get(), { stars: ['k1_kambedla'], findings: ['beetle', 'frog'] }, 'the next visit has them');
  assert.deepEqual(createSave(storage, 'another-game').get(), { stars: [], findings: [] }, 'under its own key');

  const copy = first.get();
  copy.stars.push('not-earned');
  assert.deepEqual(first.get().stars, ['k1_kambedla'], 'get hands out a copy');
});

test('save starts empty from damaged data and mends it with the next change', () => {
  const damaged = ['{not json', '[]', '"stars"', 'null', '{"stars":"k1_kambedla","findings":{}}'];
  for (const text of damaged) {
    const storage = memoryStorage({ [KEY]: text });
    const save = createSave(storage);
    assert.deepEqual(save.get(), { stars: [], findings: [] }, text);
    save.addStar('k1_kambedla');
    assert.deepEqual(JSON.parse(storage.getItem(KEY)), { stars: ['k1_kambedla'], findings: [] }, text);
  }
  const mixed = memoryStorage({ [KEY]: '{"stars":["k1_kambedla",7,"",null,"k1_kambedla"],"findings":["frog",{}]}' });
  assert.deepEqual(createSave(mixed).get(), { stars: ['k1_kambedla'], findings: ['frog'] }, 'what is not an id is dropped, and a repeat');
});

test('save refuses an id that is not a name', () => {
  const save = createSave(null);
  for (const id of ['', 7, null, undefined, {}]) {
    assert.throws(() => save.addStar(id), TypeError);
    assert.throws(() => save.addFinding(id), TypeError);
  }
});

// ---------------------------------------------------------------------------------------------
// The journal

const PAGE = [
  'journal-button', 'star-slots', 'finding-count', 'journal-flights',
  'journal-page', 'journal-close', 'journal-stars', 'journal-finds', 'journal-empty',
];
const FRIENDS = ['Kambeðla', 'Þórseðla', 'Grameðla', 'Uggeðla', 'Slóeðla', 'Flugeðla'];

/** A journal over a page with the elements index.html has, and a save in memory. */
function journalRig({ stored = null, save = null, onPause } = {}) {
  const doc = new FakeDocument(PAGE);
  const storage = memoryStorage(stored ? { [KEY]: JSON.stringify(stored) } : {});
  const kept = save ?? createSave(storage);
  const journal = createJournal(doc, kept, { onPause });
  const el = id => doc.getElementById(id);
  /** The journal button's star slots, in the order of the friends. */
  const slots = () => el('star-slots').children;
  const earned = () => slots().map(slot => slot.classList.contains('earned'));
  return { doc, storage, save: kept, journal, el, slots, earned };
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
  assert.equal(el('finding-count').textContent, '2');
  assert.equal(el('finding-count').hidden, false);
  assert.equal(el('journal-button').hidden, false, 'the first find brings the book out');
  assert.throws(() => journal.addFinding(''), TypeError);
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
  assert.equal(el('finding-count').textContent, '2');
});

test('the book opens on a tap and shows the stars and the finds, and closes again', () => {
  const { journal, el } = journalRig({ stored: { stars: ['k1_kambedla'], findings: ['frog', 'comet'] } });
  const page = el('journal-page');
  const click = () => new Event('click');
  assert.equal(page.hidden, true);
  assert.equal(journal.isOpen, false);

  el('journal-button').dispatchEvent(click());
  assert.equal(page.hidden, false);
  assert.equal(journal.isOpen, true);
  const named = (parent, name) => parent.findAll(e => e.classList.contains(name));
  const cards = el('journal-stars').children;
  assert.deepEqual(cards.map(card => named(card, 'journal-star-name')[0].textContent), FRIENDS);
  assert.deepEqual(cards.map(card => card.classList.contains('earned')), [true, false, false, false, false, false]);
  assert.deepEqual(el('journal-finds').children.map(chip => chip.textContent), ['Froskur', 'comet'], 'known animals by their name, others as they are');
  assert.equal(el('journal-empty').hidden, true, 'no hint to look for animals once there are some');

  el('journal-close').dispatchEvent(click());
  assert.equal(page.hidden, true);
  assert.equal(journal.isOpen, false);

  journal.open();
  page.dispatchEvent(click()); // the dimmed edge around the card
  assert.equal(journal.isOpen, false);
});

test('the open book keeps up with a star that lands and an animal that is found', () => {
  const { journal, el } = journalRig();
  journal.open();
  assert.equal(el('journal-empty').hidden, false, 'an empty book says where animals are found');
  journal.addFinding('beetle');
  journal.addStar('k1_kambedla', { x: 0, y: 0 });
  journal.update(FLIGHT_SECONDS + 0.01);
  assert.deepEqual(el('journal-finds').children.map(chip => chip.textContent), ['Bjalla']);
  assert.equal(el('journal-empty').hidden, true);
  assert.equal(el('journal-stars').children[0].classList.contains('earned'), true);
});

test('the book can be brought out and put away', () => {
  const { journal, el } = journalRig();
  journal.show();
  assert.equal(el('journal-button').hidden, false);
  journal.show(false);
  assert.equal(el('journal-button').hidden, true);
});

// A page the child opens holds the game (R24): the journal asks, through onPause, for the clock and the
// voice to be paused while the child's page is open. A page that code opens does not.

/** The journal with a recorder for the pauses it asks for, and a tap on a page element. */
function pauseRig(options) {
  const pauses = [];
  const rig = journalRig({ ...options, onPause: paused => pauses.push(paused) });
  const tap = id => rig.el(id).dispatchEvent(new Event('click'));
  return { ...rig, pauses, tap };
}

test('a page the child opens pauses the game until the child closes it', () => {
  const { journal, pauses, tap, el } = pauseRig({ stored: { stars: [], findings: ['frog'] } });
  assert.deepEqual(pauses, [], 'nothing is paused while the book is shut');

  tap('journal-button'); // the child taps the book
  assert.equal(journal.isOpen, true);
  assert.deepEqual(pauses, [true]);
  tap('journal-close');
  assert.equal(journal.isOpen, false);
  assert.deepEqual(pauses, [true, false], 'and the game goes on when it is shut');

  tap('journal-button');
  el('journal-page').dispatchEvent(new Event('click')); // the dimmed edge around the card shuts it too
  assert.equal(journal.isOpen, false);
  assert.deepEqual(pauses, [true, false, true, false]);
});

test('a page a script opens does not pause the game, and the child closing it resumes nothing', () => {
  const { journal, pauses, tap } = pauseRig({ stored: { stars: ['k1_kambedla'], findings: [] } });
  journal.open(); // as s.journal.open does: the last scene fades into the book while Mosi speaks
  assert.equal(journal.isOpen, true);
  assert.deepEqual(pauses, [], 'the clock goes on under a page the scene opened');

  tap('journal-close'); // the child shuts the page the script opened
  assert.equal(journal.isOpen, false);
  assert.deepEqual(pauses, [], 'nothing pauses and nothing resumes that was not paused');

  journal.open();
  journal.close();
  assert.deepEqual(pauses, []);
});

test('code that closes a page the child opened lets the game go on, and an open page keeps whoever opened it', () => {
  const { journal, pauses, tap } = pauseRig();
  tap('journal-button');
  journal.open(); // it is open already, and the child's
  assert.deepEqual(pauses, [true]);
  journal.close(); // the game must not be left paused with no page showing
  assert.equal(journal.isOpen, false);
  assert.deepEqual(pauses, [true, false]);

  journal.open();
  tap('journal-button'); // a key press on the book under a page the script opened does not make it the child's
  assert.deepEqual(pauses, [true, false], 'still not paused');
  tap('journal-close');
  assert.deepEqual(pauses, [true, false]);

  tap('journal-button'); // and the child can open it again afterwards
  assert.deepEqual(pauses, [true, false, true]);
});

test('a pause callback that throws does not leave the page half open', () => {
  const doc = new FakeDocument(PAGE);
  const journal = createJournal(doc, createSave(null), { onPause: () => { throw new Error('no audio'); } });
  const reported = [];
  const consoleError = console.error;
  console.error = (...args) => reported.push(args);
  try {
    doc.getElementById('journal-button').dispatchEvent(new Event('click'));
    assert.equal(journal.isOpen, true);
    assert.equal(doc.getElementById('journal-page').hidden, false);
    doc.getElementById('journal-close').dispatchEvent(new Event('click'));
    assert.equal(journal.isOpen, false);
    assert.equal(doc.getElementById('journal-page').hidden, true);
    assert.equal(reported.length, 2, 'it was reported each time');
    assert.match(String(reported[0][1]), /no audio/);
  } finally {
    console.error = consoleError;
  }
});

test('main.js ties a page the child opens to the clock and the voice', () => {
  const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const wiring = /createJournal\(document, save, \{[\s\S]*?onPause: paused => \{\s*clock\.setPaused\(paused\);\s*voice\.setPaused\(paused\);\s*\},?\s*\}\)/;
  assert.match(main, wiring, 'createJournal gets an onPause that sets the clock and then the voice');
});

test('the journal says so when the page lacks a piece of it', () => {
  const doc = new FakeDocument(PAGE.filter(id => id !== 'journal-flights'));
  assert.throws(() => createJournal(doc, createSave(null)), /journal-flights/);
});

test('index.html has every element the journal and the tray ask for', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const id of [...PAGE, 'tray', 'view']) assert.ok(html.includes(`id="${id}"`), `#${id} is on the page`);
  assert.match(html, /<div id="tray"[^>]* hidden>/, 'the tray starts put away');
  assert.match(html, /<button id="journal-button"[^>]* hidden>/, 'and so does the book');
  assert.match(html, /<div id="journal-page"[^>]* hidden>/, 'and its page');
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
function starRig({ withJournal = true, onPause } = {}) {
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
  const rig = journalRig({ onPause });
  const asked = [];
  const journal = withJournal
    ? {
      addStar(id, from) { asked.push({ id, from }); return rig.journal.addStar(id, from); },
      addFinding: id => rig.journal.addFinding(id),
      open: () => rig.journal.open(),
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
  return { ...rig, world, scene3, pointer, stage, s: stage.s, step, asked };
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

test('s.found puts an animal in the book, once', () => {
  const { s, journal, save } = starRig();
  assert.equal(s.found('frog'), DONE);
  assert.equal(s.found('frog'), DONE);
  assert.equal(s.found('beetle'), DONE);
  assert.deepEqual(journal.findings, ['frog', 'beetle']);
  assert.deepEqual(save.get().findings, ['frog', 'beetle']);
});

test('s.journal.open and close show and hide the page without pausing the game', () => {
  const pauses = [];
  const { stage, s, journal, step } = starRig({ onPause: paused => pauses.push(paused) });
  assert.equal(s.journal.open(), DONE);
  assert.equal(journal.isOpen, true);
  assert.equal(s.journal.close(), DONE);
  assert.equal(journal.isOpen, false);
  assert.deepEqual(pauses, [], 'a script that opens the book does not stop the clock');

  // A scene that ends in the book: it goes on under the open page, and the page can be shut by the scene.
  const seen = [];
  stage.start(function* script() {
    s.journal.open();
    yield s.wait(1);
    seen.push(['open', journal.isOpen, s.time]);
    s.journal.close();
    seen.push(['shut', journal.isOpen]);
  });
  step(1.2);
  assert.deepEqual(seen, [['open', true, 1], ['shut', false]], 'time moved while the page was open');
  assert.deepEqual(pauses, []);
});

test('a page the child shuts, that a script opened, leaves the scene running', () => {
  const pauses = [];
  const { stage, s, journal, step, el } = starRig({ onPause: paused => pauses.push(paused) });
  const seen = [];
  stage.start(function* script() {
    s.journal.open();
    yield s.wait(0.5);
    seen.push(['after the child shut it', journal.isOpen, s.time]);
    yield s.wait(0.5);
    seen.push(['end', s.time]);
  });
  step(0.3);
  el('journal-close').dispatchEvent(new Event('click')); // the child shuts it under the scene
  step(0.8);
  assert.deepEqual(seen, [['after the child shut it', false, 0.5], ['end', 1]]);
  assert.deepEqual(pauses, [], 'neither a pause nor a resume');
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
