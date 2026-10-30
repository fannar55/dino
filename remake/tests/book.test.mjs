import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createBook, halsOpen } from '../engine/book/book.js';
import { renderMap, MAP_PLACES } from '../engine/book/map-page.js';
import { TREES, FALL, FOAM, treeBox, lifeClock, createLiveMap, timeLiveMaps } from '../engine/book/map-life.js';
import { createMapMoment, fitMap, zoomTo } from '../engine/book/map-moment.js';
import { parseCards, isUnlocked, PLACEHOLDER } from '../engine/book/cards.js';
import { parseManifest, imageSize } from '../engine/book/media.js';
import { createJournal, FLIGHT_SECONDS } from '../engine/scene/journal.js';
import { createBookAudio } from '../engine/book/book-audio.js';
import { createCardViewer } from '../engine/book/card-viewer.js';
import { createZoom } from '../engine/book/zoom.js';
import { rockYaw, ROCK_SWING } from '../engine/book/skeleton-view.js';
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

/** The book over a save of its own, with what it narrates, the sounds it makes and the games it hands on (and, if `liveMap` is given, the map's living layers made by that factory). */
function savedRig(fill = () => {}, { onTab = null, storage = null, liveMap = null } = {}) {
  const save = createSave(storage);
  fill(save);
  const narrated = [];
  const played = [];
  const sounds = [];
  const audio = { sfx: name => { sounds.push(name); return true; }, stop() {}, narrate: id => { narrated.push(id); return DONE; } };
  const doc = new FakeDocument(['book']);
  const book = createBook(doc, { save, audio, onPause() {}, onPlay: game => played.push(game), onTab, ...(liveMap ? { liveMap } : {}) });
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
  const halves = leaf.findAll(e => e.tagName === 'IMG' && /assets\/book\/map\.webp$/.test(e.src));
  assert.equal(halves.length, 2, 'map.webp, half on each page');
  // a slot for each of the six friends, and none for the Fen
  const marker = id => leaf.findAll(e => e.getAttribute('data-place') === id)[0];
  // each on its pale circle in the painting (1681 by 936 pixels), on the page that has it: Kambeðla's glade at the middle of the left
  // page, Þórseðla's pool on the right; the pixels become percents of the page's 900 by 1000 half of the 1800 by 1000 view
  const spot = (id, left, top) => assert.equal(`${marker(id).style.left} ${marker(id).style.top}`, `${left.toFixed(2)}% ${top.toFixed(2)}%`, `${id} on its circle`);
  spot('kambedla', 559 * 1800 / 1681 / 9, 494 * 1000 / 936 / 10);
  spot('gramedla', 178 * 1800 / 1681 / 9, 107 * 1000 / 936 / 10);
  spot('thorsedla', (1514 * 1800 / 1681 - 900) / 9, 356 * 1000 / 936 / 10);
  for (const id of ['kambedla', 'thorsedla', 'sloedla', 'flugedla', 'uggedla', 'gramedla']) assert.ok(marker(id), `a slot for ${id}`);
  assert.equal(leaf.findAll(e => e.classList.contains('map-marker')).length, 6, 'six slots');
  assert.equal(marker('fen'), undefined, 'the Fen has no slot');
  // Kambeðla's star is in the book: her place is done, a star with her sticker. Slóeðla was found: her sticker. The rest wait, empty.
  const state = id => ['empty', 'found', 'done'].filter(name => marker(id).classList.contains(name));
  assert.deepEqual(state('kambedla'), ['found', 'done']);
  assert.deepEqual(state('sloedla'), ['found']);
  for (const id of ['thorsedla', 'flugedla', 'uggedla', 'gramedla']) assert.deepEqual(state(id), ['empty'], `${id} waits`);
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
  // The page keeps up with what the chapter adds: a place found from Þórseðla's head, and her star.
  save.addPlace('uggedla');
  save.addStar('k2_thorsedla');
  book.refresh();
  assert.deepEqual(state('uggedla'), ['found']);
  assert.deepEqual(state('thorsedla'), ['found', 'done']);
});

test('the Fen has no slot, no name and no star on the map: its painted reed is the Fen', () => {
  const { root } = savedRig(s => { s.addStar('k1_kambedla'); s.addPlace('fen'); s.addStar('k2_thorsedla'); });
  const slots = root.findAll(e => e.classList.contains('map-marker')).map(e => e.getAttribute('data-place'));
  assert.deepEqual(MAP_PLACES.map(place => place.id).sort(), ['flugedla', 'gramedla', 'kambedla', 'sloedla', 'thorsedla', 'uggedla'], 'six places have a slot: the friends\'');
  assert.deepEqual(slots.sort(), ['flugedla', 'gramedla', 'kambedla', 'sloedla', 'thorsedla', 'uggedla'], 'and the book has those six, none of them the Fen');
  assert.equal(root.findAll(e => e.getAttribute('data-place') === 'fen').length, 0, 'no [data-place="fen"]');
  assert.deepEqual(root.findAll(e => e.classList.contains('map-name')).map(e => e.textContent).sort(), ['Burknalautin', 'Fenjaslóðin', 'Rjóðrið', 'Áin'].sort(), 'no name for the Fen, though it is found');
  assert.equal(root.findAll(e => e.classList.contains('map-star')).length, 2, 'a star for Kambeðla and for Þórseðla, and none for the Fen');
});

test('the map\'s life layers are cut from the painting at its size', () => {
  // the water and the mist (tools/map-life-layers.py) are pixels of map.webp, so each lies exactly over it
  const size = path => imageSize(fs.readFileSync(new URL(`../assets/book/${path}`, import.meta.url)));
  assert.deepEqual(size('map.webp'), { width: 1681, height: 936 }, 'the painting');
  for (const layer of ['map-water.webp', 'map-mist.webp']) {
    assert.ok(fs.existsSync(new URL(`../assets/book/${layer}`, import.meta.url)), `${layer} is there`);
    assert.deepEqual(size(layer), { width: 1681, height: 936 }, `${layer} is the painting's size`);
  }
});

test('the living map\'s trees, fall and foam lie inside the painting, each foot below its crown, no tree over a slot', () => {
  const [width, height] = [1681, 936];
  const inside = ([left, top, right, bottom]) => left >= 0 && top >= 0 && right <= width && bottom <= height;
  assert.equal(TREES.length, 18, 'eighteen trees sway');
  TREES.forEach((tree, i) => {
    assert.ok(inside(treeBox(tree)), `tree ${i} moves inside the painting`);
    assert.ok(tree.p[1] > tree.c[1], `tree ${i} stands with its foot below its crown`);
  });
  assert.ok(inside([FALL.left, FALL.top, FALL.right, FALL.bottom]), 'the fall is in the painting');
  assert.ok(FALL.left < FALL.right && FALL.top < FALL.bottom, 'and has a width and a height');
  assert.ok(inside([FOAM.at[0] - FOAM.r[0], FOAM.at[1] - FOAM.r[1], FOAM.at[0] + FOAM.r[0], FOAM.at[1] + FOAM.r[1]]), 'the foam is too');
  // a slot's circle (the view's units, 1800 by 1000) is where a sticker goes: no swaying tree reaches it
  for (const place of MAP_PLACES) {
    const [x, y] = [place.at[0] * width / 1800, place.at[1] * height / 1000];
    const radius = place.size / 2 * Math.max(width / 1800, height / 1000);
    TREES.forEach((tree, i) => {
      const [left, top, right, bottom] = treeBox(tree);
      const near = Math.hypot(x - Math.min(Math.max(x, left), right), y - Math.min(Math.max(y, top), bottom));
      assert.ok(near > radius, `tree ${i} does not reach the ${place.id} slot`);
    });
  }
});

test('the living map\'s clock wraps at an hour', () => {
  assert.equal(lifeClock(0), 0);
  assert.equal(lifeClock(1500), 1.5);
  assert.equal(lifeClock(3_600_000), 0, 'an hour on, the clock starts over');
  assert.ok(Math.abs(lifeClock(3_601_500) - 1.5) < 1e-9, 'and goes on from there');
});

test('there is no living layer where there is no WebGL', () => {
  assert.equal(createLiveMap({}, { half: 0 }), null, 'a canvas that cannot draw');
  assert.equal(createLiveMap({ getContext: () => null }, { half: 0 }), null, 'a canvas with no WebGL');
  assert.equal(timeLiveMaps(), null, 'and so nothing to time');
});

test('a graphics card with no high-precision floats, or a shader that will not build, gets no living layer either', () => {
  // a context that does nothing and answers null to what it is not told otherwise, with a few answers of its own
  const canvasWith = answers => ({
    getContext: () => new Proxy({ FRAGMENT_SHADER: 1, HIGH_FLOAT: 2, ...answers }, { get: (gl, name) => (name in gl ? gl[name] : () => null) }),
  });
  const win = { requestAnimationFrame: () => 1, cancelAnimationFrame() {}, devicePixelRatio: 1 };
  const floats = { getShaderPrecisionFormat: () => ({ precision: 23 }) };
  assert.equal(createLiveMap(canvasWith({ getShaderPrecisionFormat: () => ({ precision: 0 }) }), { half: 0, win }), null, 'no high floats in fragments');
  assert.equal(createLiveMap(canvasWith({ ...floats, getShaderParameter: () => false }), { half: 0, win }), null, 'a shader that does not compile');
  assert.equal(createLiveMap(canvasWith({ ...floats, getShaderParameter: () => true, getProgramParameter: () => false }), { half: 0, win }), null, 'a program that does not link');
  assert.equal(timeLiveMaps(), null, 'none of them was made');
});

/** A stand-in for createLiveMap: records each layer made and what was asked of it. */
function fakeLife({ none = false } = {}) {
  const made = [];
  const liveMap = (canvas, options) => {
    if (none) return null;
    const layer = { canvas, options, starts: 0, stops: 0, destroyed: false, running: false,
      start() { this.starts++; this.running = true; }, stop() { this.stops++; this.running = false; },
      destroy() { this.destroyed = true; this.running = false; } };
    made.push(layer);
    return layer;
  };
  return { liveMap, made };
}

test('the map\'s living layer lies over the painting, under the mist, the trail and the slots', () => {
  const { root } = savedRig();
  const halves = root.findAll(e => e.classList.contains('map-half'));
  assert.equal(halves.length, 2, 'a half of the map on each page');
  const layers = ['map-art', 'map-live', 'map-mist', 'map-route', 'map-name', 'map-marker'];
  for (const half of halves) {
    const side = half.getAttribute('data-half');
    const named = (child, name) => child.classList.contains(name) || child.getAttribute('class') === name; // the trail is an svg: its class is an attribute
    const order = half.children.map(child => layers.find(name => named(child, name))).filter(Boolean);
    assert.deepEqual([...new Set(order)], layers, `${side}: the painting, the living layer, the mist, the trail, then the names and the slots`);
    const layer = name => half.children.find(child => child.classList.contains(name));
    assert.equal(layer('map-art').tagName, 'IMG');
    assert.equal(layer('map-live').tagName, 'CANVAS', `${side}: the living layer is drawn on a canvas`);
    assert.equal(layer('map-live').getAttribute('aria-hidden'), 'true', `${side}: and is decoration`);
    assert.equal(layer('map-mist').tagName, 'IMG');
    assert.match(layer('map-mist').src, /assets\/book\/map-mist\.webp$/, `${side}: the mist layer`);
    assert.equal(layer('map-mist').alt, '', `${side}: the mist is decoration`);
    assert.equal(half.findAll(e => e.classList.contains('map-water')).length, 0, `${side}: no water layer`);
  }
});

test('the mist drifts in the stylesheet, the hole is a registered length, and the water\'s light is gone', () => {
  const css = fs.readFileSync(new URL('../book.css', import.meta.url), 'utf8');
  /** The text of one rule, from its selector (at the start of a line) to its closing brace. */
  const rule = selector => {
    const at = css.indexOf(`\n${selector} {`);
    assert.ok(at >= 0, `a rule for ${selector}`);
    return css.slice(at, css.indexOf('}', at));
  };
  assert.doesNotMatch(css, /map-water/, 'nothing of the water\'s light is left in the stylesheet');
  assert.match(css, /@property --map-hole \{\s*syntax: '<length>';\s*inherits: false;\s*initial-value: 0px;\s*\}/, 'the hole is a registered length, so it opens smoothly');
  const mist = rule('.map-mist');
  assert.match(mist, /animation: map-mist-drift 14s [^;]*infinite/, 'the mist slides over fourteen seconds');
  assert.match(css, /@keyframes map-mist-drift \{[^}]*translate: -\.75% 0;[^}]*\}[^}]*translate: \.75% 0;/, 'a little either way: .75 % of a layer twice the page wide is 1.5 % of the page');
  // the living layer: the canvas of its half, hidden until its page has a live layer, which then shows it (fading in) and hides the mist (after the fade)
  const live = rule('.map-live');
  assert.match(live, /inset: 0/);
  assert.match(live, /width: 100%/);
  assert.match(live, /height: 100%/);
  assert.match(live, /display: block/);
  assert.match(live, /pointer-events: none/);
  assert.match(live, /visibility: hidden/, 'nothing shows until the layer is ready');
  assert.match(live, /opacity: 0/);
  assert.match(live, /transition: opacity \.4s/, 'it fades in over 0.4 s');
  const shown = rule('.map-half.live .map-live');
  assert.match(shown, /visibility: visible/);
  assert.match(shown, /opacity: 1/);
  const hidden = rule('.map-half.live .map-mist');
  assert.match(hidden, /visibility: hidden/, 'the CSS mist gives way to the living clouds');
  assert.match(hidden, /transition: visibility 0s \.4s/, 'once the canvas has faded in');
  // less motion: the book's own rule (every animation in it) and one for a map outside the book; no layer is made then
  const calm = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce) {'));
  assert.match(calm, /\.map-mist \{ animation: none; \}/);
  assert.match(calm, /\.book \*, \.book \*::before, \.book \*::after \{ animation: none !important; \}/);
});

test('the map lives while its page shows', () => {
  const { liveMap, made } = fakeLife();
  const { map, leaf } = mapRig({ liveMap });
  const halves = leaf.el.findAll(e => e.classList.contains('map-half'));
  assert.equal(made.length, 0, 'nothing is made until the page shows');
  assert.equal(map.alive(), false);
  map.show(0);
  assert.deepEqual(made.map(layer => layer.options.half), [0, 1], 'a layer for each page');
  assert.deepEqual(made.map(layer => layer.canvas), halves.map(half => half.children.find(child => child.classList.contains('map-live'))), 'drawn on that page\'s canvas');
  assert.deepEqual(made.map(layer => layer.starts), [1, 1], 'each started');
  assert.equal(map.alive(), true);
  assert.deepEqual(halves.map(half => half.classList.contains('live')), [false, false], 'the painting shows until a layer has drawn');
  map.hide();
  assert.deepEqual(made.map(layer => layer.stops), [1, 1], 'turning away stops both');
  assert.equal(map.alive(), false);
  map.show(0);
  assert.equal(made.length, 2, 'the same two layers');
  assert.deepEqual(made.map(layer => layer.starts), [2, 2], 'start again');
  assert.equal(map.alive(), true);
  made.forEach(layer => layer.options.onReady());
  assert.deepEqual(halves.map(half => half.classList.contains('live')), [true, true], 'once a layer has drawn, its page is live');
  map.dispose();
  assert.ok(made.every(layer => layer.destroyed), 'and disposing of the map lets both go');
  assert.equal(map.alive(), false);
  assert.deepEqual(halves.map(half => half.classList.contains('live')), [false, false], 'the painting and the mist, as before');
  map.show(0);
  assert.equal(made.length, 2, 'a map let go makes no more');
});

test('with reduced motion, or without WebGL, the map stays as it was', () => {
  const calm = fakeLife();
  const still = mapRig({ reduced: true, liveMap: calm.liveMap });
  still.map.show(0);
  assert.equal(calm.made.length, 0, 'less motion: no layer is made');
  assert.equal(still.map.alive(), false);

  const none = fakeLife({ none: true });
  const plain = mapRig({ liveMap: none.liveMap });
  plain.map.show(0);
  assert.equal(plain.map.alive(), false, 'no WebGL: nothing is alive');
  assert.equal(plain.leaf.el.findAll(e => e.classList.contains('live')).length, 0, 'and no page is live');
  plain.map.hide();
  plain.map.show(0);
  assert.equal(plain.map.alive(), false);
  assert.equal(plain.map.mistOpen(), false, 'the mist is the mist of before');
});

test('a page whose living layer is lost goes back to the painting and does not bring it back', () => {
  const { liveMap, made } = fakeLife();
  const { map, leaf } = mapRig({ liveMap });
  const halves = leaf.el.findAll(e => e.classList.contains('map-half'));
  map.show(0);
  made.forEach(layer => layer.options.onReady());
  assert.deepEqual(halves.map(half => half.classList.contains('live')), [true, true]);
  made[0].options.onLost(); // the graphics dropped the left page's context
  assert.deepEqual(halves.map(half => half.classList.contains('live')), [false, true], 'the left page is the painting and mist again; the right lives on');
  map.hide();
  map.show(0);
  assert.equal(made.length, 2, 'no new layer for the lost page');
  assert.deepEqual(made.map(layer => layer.starts), [1, 2], 'only the right one is started again');
  assert.deepEqual(halves.map(half => half.classList.contains('live')), [false, true]);
  assert.equal(map.alive(), true, 'the right page is still alive');
  made[1].options.onLost();
  assert.equal(map.alive(), false, 'and when it is lost too, nothing is');
});

test('the hole the living layer is given follows the mist\'s --map-hole', () => {
  const { liveMap, made } = fakeLife();
  const asked = [];
  const { map, leaf } = mapRig({ liveMap, win: { getComputedStyle: el => ({ getPropertyValue: name => { asked.push([el, name]); return '64px'; } }) } });
  const [left] = leaf.el.findAll(e => e.classList.contains('map-half'));
  // the page as laid out is 450 wide (the computed --map-hole is a length of that); a transform on an ancestor (the map in the journey
  // is scaled up to 1.6 times, the book scales as it opens) makes its box on the screen wider, which must not change the answer
  left.clientWidth = 450;
  left.rect = { left: 0, top: 0, width: 720, height: 800 };
  map.show(0);
  const [x, y, r] = made[0].options.hole();
  assert.ok(Math.abs(x - 178) < 0.01 && Math.abs(y - 107) < 0.01, `Grameðla's circle, in the painting's pixels (${x}, ${y})`);
  assert.ok(Math.abs(r - 64 * 1681 / 900) < 0.01, `64 px of a page 450 wide is ${64 * 1681 / 900} picture pixels, whatever its scaled box is (${r})`);
  assert.deepEqual(asked.at(-1), [leaf.el.findAll(e => e.classList.contains('map-mist'))[0], '--map-hole'], 'read from the left page\'s mist');
  assert.deepEqual(made[1].options.hole(), [0, 0, 0], 'the right page has no hole');
  // shut, or with no layout to measure by: no radius
  const shut = fakeLife();
  const closed = mapRig({ liveMap: shut.liveMap, win: { getComputedStyle: () => ({ getPropertyValue: () => '0px' }) } });
  closed.leaf.el.findAll(e => e.classList.contains('map-half'))[0].clientWidth = 450;
  closed.map.show(0);
  assert.equal(shut.made[0].options.hole()[2], 0, 'a shut hole');
  const blind = fakeLife();
  const nothing = mapRig({ liveMap: blind.liveMap });
  nothing.map.show(0);
  assert.equal(blind.made[0].options.hole()[2], 0, 'a window that cannot say');
});

test('turning away from the map, or closing the book, stops its life', () => {
  const { liveMap, made } = fakeLife();
  const { book, root } = savedRig(() => {}, { liveMap });
  assert.equal(made.length, 0, 'nothing is made while the book is shut');
  book.open('map', 'child');
  assert.deepEqual(made.map(layer => layer.options.half), [0, 1], 'a layer for each page');
  assert.deepEqual(made.map(layer => layer.running), [true, true], 'both started with the page');
  const ribbon = tab => root.findAll(e => e.classList.contains('ribbon')).find(r => r.getAttribute('data-tab') === tab);
  const tap = el => {
    el.dispatchEvent(pointerEvent('pointerdown', { x: 10, y: 10 }));
    el.dispatchEvent(pointerEvent('pointerup', { x: 10, y: 10 }));
  };
  tap(ribbon('animals'));
  assert.equal(book.tab, 'animals');
  assert.deepEqual(made.map(layer => layer.running), [false, false], 'another page: nothing draws in the background');
  tap(ribbon('map'));
  assert.equal(book.tab, 'map');
  assert.equal(made.length, 2, 'the same layers');
  assert.deepEqual(made.map(layer => layer.running), [true, true], 'back on the map they run again');
  book.close();
  assert.deepEqual(made.map(layer => layer.running), [false, false], 'a shut book draws nothing');
  assert.deepEqual(made.map(layer => layer.destroyed), [false, false], 'but keeps them for the next time');
});

const PIECES = ['a', 'b', 'c', 'd', 'e', 'f'];
/** A spot in the painting's pixels (1681 by 936), in the map's view units (1800 by 1000). */
const inView = ([x, y]) => [x * 1800 / 1681, y * 1000 / 936];
const START = [249, 736]; // where the trail begins, in the clearing
const ENDS = { kambedla: [531, 532], uggedla: [1413, 684], thorsedla: [1554, 366], flugedla: [1370, 200], sloedla: [1101, 170], gramedla: [218, 116] }; // where each piece ends
// where each piece begins: B takes up on the far side of Kambeðla's circle, and C to F leave a friend's circle on the side the line
// goes on to
const STARTS = [START, [628, 497], [1465, 644], [1500, 320], [1299, 172], [1026, 168]];
const sameSpot = (spot, want) => Math.hypot(spot[0] - want[0], spot[1] - want[1]) < 0.2;
/** The stars in the order of the painted path (the owner, 2026-10-29): Kambeðla, Uggeðla (b), Þórseðla (c), then Flugeðla (d), Slóeðla (e) and Grameðla (f). */
const STARS = ['k1_kambedla', 'k2_uggedla', 'k2_thorsedla', 'k4_flugedla', 'k5_sloedla', 'k6_gramedla'];
/** The places chapter 2 puts on the map today, at Þórseðla's head: the Fen and the three far friends. */
const HEAD_PLACES = ['fen', 'sloedla', 'flugedla', 'uggedla'];
/** The save of a child who has got as far as the `n`th piece of the path: their stars in its order, and, once Þórseðla's is in (chapter 2), the places chapter 2 gives. */
const playedTo = n => save => {
  for (const star of STARS.slice(0, n)) save.addStar(star);
  if (n >= 3) for (const id of HEAD_PLACES) save.addPlace(id);
};
/** The save after chapter 2 as the game plays it today (Uggeðla's chapter is not built): Kambeðla's and Þórseðla's stars, and the places, with Uggeðla only found. */
const today = save => {
  save.addStar('k1_kambedla');
  save.addStar('k2_thorsedla');
  for (const id of HEAD_PLACES) save.addPlace(id);
};

/** The trail's six pieces on the Kortið page of the rig's book, each with the state of its copies on the two pages (alike). */
function trailOf(root) {
  return PIECES.map(id => {
    const states = new Set(root.findAll(e => e.getAttribute('data-piece') === id).map(e => e.getAttribute('data-state')));
    assert.equal(states.size, 1, `piece ${id} is the same on both pages`);
    return [...states][0];
  });
}

/** Where the dot stands on the Kortið page of the rig's book (the view's units): the same on both pages. */
function dotSpot(root) {
  const dots = root.findAll(e => e.getAttribute('class') === 'map-dot');
  assert.equal(dots.length, 2, 'a dot on each page');
  const spots = new Set(dots.map(dot => dot.getAttribute('transform')));
  assert.equal(spots.size, 1, 'the dot is in the same place on both pages');
  return /translate\(([\d.]+) ([\d.]+)\)/.exec([...spots][0]).slice(1).map(Number);
}

test('the map\'s trail reaches as far as the child has got, and waits unseen until the page is on view', () => {
  // the pieces reached are 'drawn' once the page is shown (until then they wait); the rest are 'next' (one) or 'hidden'
  const reached = count => PIECES.map((id, i) => (i < count ? 'drawn' : i === count ? 'next' : 'hidden'));
  const rigs = [
    ['a fresh save', () => {}, reached(0)],
    ['chapter 1 done: Kambeðla\'s star', save => save.addStar('k1_kambedla'), reached(1)],
    ['her place alone', save => save.addPlace('kambedla'), reached(1)],
    ['Uggeðla\'s star: b is drawn, from the glade past the channel to her', playedTo(2), reached(2)],
    ['Þórseðla\'s place alone (found is enough for c, and carries b and a with it)', save => save.addPlace('thorsedla'), reached(3)],
    ['Þórseðla\'s star alone: the trail has no gap before it', save => save.addStar('k2_thorsedla'), reached(3)],
    ['after chapter 2 as it is played today, Uggeðla only found from her head: a to c are reached, d is ahead, e and f wait', today, reached(3)],
    ['the first three stars and the places: a to c, d ahead', playedTo(3), reached(3)],
    ['Flugeðla\'s star: d is drawn, e ahead', playedTo(4), reached(4)],
    ['Slóeðla\'s star', playedTo(5), reached(5)],
    ['Grameðla\'s star: every piece is reached', playedTo(6), reached(6), true],
    ['a star alone reaches every piece before it, with no gap: Slóeðla\'s', save => save.addStar('k5_sloedla'), reached(5)],
    ['the places alone of Slóeðla, Flugeðla, Uggeðla and the Fen reach nothing: they are found from Þórseðla\'s head, which is not a trip', save => { for (const id of HEAD_PLACES) save.addPlace(id); }, reached(0)],
    ['Uggeðla\'s place alone does not draw b: only her star does', save => { save.addStar('k1_kambedla'); save.addPlace('uggedla'); }, reached(1)],
    ['Grameðla\'s place alone is no piece, though the mist opens at her', save => { playedTo(5)(save); save.addPlace('gramedla'); }, reached(5), true],
  ];
  for (const [what, fill, shown, mist = false] of rigs) {
    const { save, book, root } = savedRig(fill);
    assert.deepEqual(trailOf(root), shown.map(state => (state === 'drawn' ? 'pending' : state)), `${what}: what it has reached waits until the page is shown`);
    assert.deepEqual(save.get().seen, [], `${what}: nothing is kept as seen before it is`);
    book.open('map', 'child');
    assert.deepEqual(trailOf(root), shown, what);
    const kept = PIECES.filter((id, i) => shown[i] === 'drawn').map(id => `map-route-${id}`);
    if (mist) kept.push('map-mist-gramedla'); // she is found or done: the mist opens at her, whether or not her piece is reached
    assert.deepEqual(save.get().seen, kept, `${what}: each piece drawn is kept as seen`);
  }
});

/** The map page alone over a save of its own (no book round it), with the animations it asks for (if `animated`) in the order they began. */
function mapRig({ fill = () => {}, reduced = false, animated = false, liveMap = null, win = {} } = {}) {
  const save = createSave(null);
  fill(save);
  const doc = new FakeDocument();
  const animations = []; // { el, keyframes, options, animation }
  if (animated) {
    const create = doc.createElement.bind(doc);
    doc.createElement = tag => {
      const element = create(tag);
      element.animate = (keyframes, options) => {
        const animation = { cancelled: false, cancel() { this.cancelled = true; }, finish() { this.onfinish?.(); } };
        animations.push({ el: element, keyframes, options, animation });
        return animation;
      };
      return element;
    };
  }
  const leaf = { el: doc.createElement('div'), tiles: [doc.createElement('div'), doc.createElement('div')] };
  leaf.el.append(...leaf.tiles);
  const map = renderMap(leaf, { save, win: { matchMedia: () => ({ matches: reduced }), ...win }, ...(liveMap ? { liveMap } : {}) });
  const reveals = () => animations.filter(({ el }) => el.getAttribute('class') === 'map-route-reveal');
  const spot = () => dotSpot(leaf.el);
  return { save, map, animations, reveals, spot, leaf };
}

test('the way ahead is the first piece not reached, and the slot it leads to is the one that pulses, empty or found', () => {
  const steps = [
    ['a fresh save', () => {}, 'a', 'kambedla', 'empty'],
    ['Kambeðla\'s star', save => save.addStar('k1_kambedla'), 'b', 'uggedla', 'empty'],
    ['Uggeðla\'s star', playedTo(2), 'c', 'thorsedla', 'empty'],
    ['Þórseðla found, her place alone, the far friends not found yet', save => { playedTo(2)(save); save.addPlace('thorsedla'); }, 'd', 'flugedla', 'empty'],
    ['after Þórseðla\'s star, the far friends not found yet', save => { save.addStar('k1_kambedla'); save.addStar('k2_thorsedla'); }, 'd', 'flugedla', 'empty'],
    ['after chapter 2 as it is played today: Flugeðla is found, her sticker on the slot the line leads to', today, 'd', 'flugedla', 'found'],
    ['Flugeðla\'s star: Slóeðla is found, her sticker on the slot the line leads to', playedTo(4), 'e', 'sloedla', 'found'],
    ['Slóeðla\'s star: Grameðla not found', playedTo(5), 'f', 'gramedla', 'empty'],
    ['Grameðla\'s place alone is not her piece: it is still ahead, her slot found', save => { playedTo(5)(save); save.addPlace('gramedla'); }, 'f', 'gramedla', 'found'],
    ['Grameðla\'s star: every piece reached', playedTo(6), null, null, null],
    ['friends found from Þórseðla\'s head only', save => { for (const id of HEAD_PLACES) save.addPlace(id); }, 'a', 'kambedla', 'empty'],
  ];
  for (const [what, fill, next, slot, slotState] of steps) {
    const { map } = mapRig({ fill });
    assert.equal(map.next(), next, `${what}: the piece ahead`);
    assert.deepEqual(PIECES.filter(id => map.routeOf(id) === 'next'), next ? [next] : [], `${what}: exactly one piece is next, or none`);
    // in the book, the slot the way ahead leads to pulses and no other, whether it is still empty or has its sticker
    const { root } = savedRig(fill);
    const pulsing = root.findAll(e => e.classList.contains('map-marker') && e.classList.contains('next')).map(e => e.getAttribute('data-place'));
    assert.deepEqual(pulsing, slot ? [slot] : [], `${what}: the slot that pulses`);
    if (slot) {
      const marker = root.findAll(e => e.getAttribute('data-place') === slot)[0];
      assert.ok(marker.classList.contains(slotState), `${what}: and it is ${slotState}`);
      assert.ok(!marker.classList.contains(slotState === 'empty' ? 'found' : 'empty'), `${what}: and not the other`);
    }
  }
});

test('the route follows the painted path: six pieces, a and c reached by their place, b, d, e and f by their friend\'s star alone', () => {
  assert.deepEqual(PIECES.map(id => mapRig().map.routeOf(id)), ['next', 'hidden', 'hidden', 'hidden', 'hidden', 'hidden'], 'a to f');
  assert.equal(mapRig().map.routeOf('g'), undefined, 'and no more');
  // the dot rests at the end of the last piece drawn: Kambeðla, Uggeðla, Þórseðla, then Flugeðla, Slóeðla and Grameðla, along the painted path
  const stages = [
    ['kambedla', playedTo(1)],
    ['uggedla', playedTo(2)],
    ['thorsedla', playedTo(3)],
    ['flugedla', playedTo(4)],
    ['sloedla', playedTo(5)],
    ['gramedla', playedTo(6)],
  ];
  stages.forEach(([end, fill], i) => {
    const rig = mapRig({ fill: save => { fill(save); for (const id of PIECES.slice(0, i + 1)) save.addSeen(`map-route-${id}`); } });
    assert.equal(rig.map.dotAt(), end, `piece ${PIECES[i]} drawn: the dot rests at ${end}`);
    assert.ok(sameSpot(rig.spot(), inView(ENDS[end])), `${end}: at the end of its piece`);
    assert.equal(rig.map.next(), PIECES[i + 1] ?? null, `${end}: and the next piece is ${PIECES[i + 1] ?? 'none'}`);
  });
  // a friend found from Þórseðla's head is on the map, not on the trail: the three are found, and the way ahead is still d, to Flugeðla
  const found = mapRig({ fill: today });
  assert.deepEqual(['sloedla', 'flugedla', 'uggedla'].map(id => found.map.stateOf(id)), ['found', 'found', 'found']);
  assert.deepEqual(PIECES.map(id => found.map.routeOf(id)), ['pending', 'pending', 'pending', 'next', 'hidden', 'hidden']);
  assert.equal(found.map.next(), 'd');
  assert.equal(found.map.dotAt(), 'start', 'nothing drawn yet: the dot waits at the clearing until the page shows');
  assert.equal(mapRig({ fill: save => { today(save); for (const id of ['a', 'b', 'c']) save.addSeen(`map-route-${id}`); } }).map.dotAt(), 'thorsedla', 'a to c drawn in one go: the dot is at Þórseðla\'s pool');
});

test('the Fen has no piece and no star: it is no end of the route, and Þórseðla\'s star is hers alone', () => {
  const { root } = savedRig(playedTo(6));
  assert.equal(root.findAll(e => e.getAttribute('data-place') === 'fen').length, 0, 'no slot for the Fen even when every friend is done');
  assert.equal(root.findAll(e => e.classList.contains('map-star')).length, 6, 'a star for each of the six friends and none for the Fen');
  const fresh = mapRig();
  assert.equal(fresh.map.stateOf('fen'), undefined, 'the map keeps no state for the Fen');
  assert.equal(fresh.map.markers.size, 6, 'six markers');
  assert.deepEqual([...fresh.map.markers.keys()].sort(), ['flugedla', 'gramedla', 'kambedla', 'sloedla', 'thorsedla', 'uggedla']);
  // the Fen found changes no piece, no slot's state and no ring
  const before = PIECES.map(id => fresh.map.routeOf(id));
  fresh.save.addPlace('fen');
  fresh.map.render();
  assert.deepEqual(PIECES.map(id => fresh.map.routeOf(id)), before, 'no piece is reached by the Fen');
  assert.equal(fresh.map.next(), 'a');
});

test('the way ahead runs a, b, c, d, e, f and then none as the stars come in: Kambeðla, Uggeðla, Þórseðla (found or done), Flugeðla, Slóeðla, Grameðla', () => {
  const steps = [ // what comes into the save, and the piece that is then next
    [() => {}, 'a'],
    [save => save.addStar('k1_kambedla'), 'b'],
    [save => save.addStar('k2_uggedla'), 'c'],
    [save => save.addPlace('thorsedla'), 'd'], // found is enough for her
    [save => save.addStar('k2_thorsedla'), 'd'], // and done is no more
    [save => save.addStar('k4_flugedla'), 'e'],
    [save => save.addStar('k5_sloedla'), 'f'],
    [save => save.addStar('k6_gramedla'), null],
  ];
  steps.forEach(([, next], i) => {
    const { map } = mapRig({ fill: save => steps.slice(0, i + 1).forEach(([add]) => add(save)) });
    assert.equal(map.next(), next, `step ${i}: the piece ahead is ${next}`);
    assert.deepEqual(PIECES.filter(id => map.routeOf(id) === 'next'), next ? [next] : [], `step ${i}: exactly one is next, or none`);
  });
});

test('the slot the way ahead leads to has its ring, a dashed one while empty and a soft one in her hue round her sticker once found', () => {
  const css = fs.readFileSync(new URL('../book.css', import.meta.url), 'utf8');
  assert.match(css, /\n\.map-marker\.next::before \{[^}]*animation: map-next-pulse/, 'the empty slot\'s dashed ring breathes');
  const ring = /\n\.map-marker\.next\.found::after \{([^}]*)\}/.exec(css);
  assert.ok(ring, 'a found slot ahead has a ring of its own');
  assert.match(ring[1], /var\(--hue\)/, 'in the friend\'s hue');
  assert.match(ring[1], /animation: map-next-ring/, 'which breathes');
  assert.match(css, /@keyframes map-next-ring/);
});

/** The book on the map with an animation for every element, a record of the ones that draw the trail and move the dot, and a save of its own. */
function trailRig({ fill = () => {}, reduced = false } = {}) {
  const save = createSave(null);
  fill(save);
  const doc = new FakeDocument(['book']);
  const drawings = []; // { el, keyframes, options, animation }, in the order the pieces began
  const dots = []; // the same for the dot, a pair (one on each page) after each piece's pair of drawings
  const create = doc.createElement.bind(doc);
  doc.createElement = tag => {
    const element = create(tag);
    element.animate = (keyframes, options) => {
      const animation = { cancelled: false, cancel() { this.cancelled = true; }, finish() { this.onfinish?.(); } };
      // the book's own motions are not the trail's
      if (element.getAttribute('class') === 'map-route-reveal') drawings.push({ el: element, keyframes, options, animation });
      if (element.getAttribute('class') === 'map-dot') dots.push({ el: element, keyframes, options, animation });
      return animation;
    };
    return element;
  };
  const win = { matchMedia: () => ({ matches: reduced }) };
  const root = doc.getElementById('book');
  root.animate = () => ({ cancel() {}, finish() {} });
  const book = createBook(doc, { save, audio: { sfx: () => true, stop() {}, narrate: () => DONE }, onPause() {}, win });
  /** The piece ('a' to 'f') whose drawing animation this is: the one whose group holds the animated path. */
  const pieceOf = drawing => root.findAll(e => e.getAttribute('data-piece') && e.findAll(p => p === drawing.el).length).map(g => g.getAttribute('data-piece'))[0];
  return { save, book, root, drawings, dots, pieceOf };
}

test('each piece of the trail draws itself in the first time the page shows it, one after another, and then is simply there', () => {
  const { save, book, root, drawings, pieceOf } = trailRig({ fill: today }); // after chapter 2 as it is played today
  assert.deepEqual(trailOf(root), ['pending', 'pending', 'pending', 'next', 'hidden', 'hidden']);
  assert.equal(drawings.length, 0, 'nothing is drawn while the book is shut');
  book.open('map', 'child');
  // A, then B, then C: each over 2.65 seconds on both pages at once, each beginning after the one before and after the book's turn;
  // D, the way ahead, and the two after it are not drawn
  assert.deepEqual(drawings.map(drawing => pieceOf(drawing)), ['a', 'a', 'b', 'b', 'c', 'c']);
  assert.deepEqual(drawings.map(drawing => drawing.options.duration), [2650, 2650, 2650, 2650, 2650, 2650]);
  const delays = drawings.map(drawing => drawing.options.delay);
  assert.equal(delays[0], delays[1], 'both pages\' copies of a piece start together');
  assert.ok(delays[0] > 0, 'once the book has settled');
  assert.ok(delays[2] >= delays[0] + 2650 && delays[4] >= delays[2] + 2650, 'one piece after another');
  assert.ok(drawings.every(drawing => drawing.options.fill === 'both'), 'a piece waits hidden until its turn');
  assert.deepEqual(trailOf(root), ['drawing', 'drawing', 'drawing', 'next', 'hidden', 'hidden']);
  assert.deepEqual(save.get().seen, ['map-route-a', 'map-route-b', 'map-route-c'], 'each is kept as seen as it is begun');
  // the piece drawn in to its end is there for good
  drawings[0].animation.finish();
  assert.deepEqual(trailOf(root), ['drawn', 'drawing', 'drawing', 'next', 'hidden', 'hidden']);
  assert.ok(drawings[0].animation.cancelled && drawings[1].animation.cancelled, 'its animations are let go, the line staying');
  // the book shut mid-way finishes what is drawing
  const close = root.findAll(e => e.classList.contains('book-close'))[0];
  close.dispatchEvent(pointerEvent('pointerdown', { x: 10, y: 10 }));
  close.dispatchEvent(pointerEvent('pointerup', { x: 10, y: 10 }));
  assert.deepEqual(trailOf(root), ['drawn', 'drawn', 'drawn', 'next', 'hidden', 'hidden']);
  // and the next time the page is shown there is nothing to draw
  book.open('map', 'child');
  assert.equal(drawings.length, 6, 'no piece draws in twice');
  assert.deepEqual(trailOf(root), ['drawn', 'drawn', 'drawn', 'next', 'hidden', 'hidden']);
});

test('a far friend\'s piece draws in as the others do once her star is in the book, and not for her place', () => {
  // Flugeðla's, d: the places of the three are on the map after chapter 2 and draw nothing; her star draws d
  const seenTo = (n, fill) => s => { fill(s); for (const id of PIECES.slice(0, n)) s.addSeen(`map-route-${id}`); };
  const first = trailRig({ fill: seenTo(3, today) });
  assert.deepEqual(trailOf(first.root), ['drawn', 'drawn', 'drawn', 'next', 'hidden', 'hidden'], 'the three before are there, d ahead, e and f waiting');
  first.book.open('map', 'child');
  assert.equal(first.drawings.length, 0);
  first.save.addStar('k4_flugedla');
  first.book.refresh();
  assert.deepEqual(first.drawings.map(drawing => first.pieceOf(drawing)), ['d', 'd']);
  assert.deepEqual(trailOf(first.root), ['drawn', 'drawn', 'drawn', 'drawing', 'next', 'hidden'], 'and e is ahead now');
  assert.deepEqual(first.save.get().seen, ['map-route-a', 'map-route-b', 'map-route-c', 'map-route-d']);

  // Grameðla's, f, the last: her place draws the mist back and nothing else; her star draws f
  const last = trailRig({ fill: seenTo(5, playedTo(5)) });
  assert.deepEqual(trailOf(last.root), ['drawn', 'drawn', 'drawn', 'drawn', 'drawn', 'next'], 'five before are there, the sixth ahead');
  last.book.open('map', 'child');
  last.save.addPlace('gramedla');
  last.book.refresh();
  assert.equal(last.drawings.length, 0, 'her place alone draws no piece');
  assert.deepEqual(trailOf(last.root), ['drawn', 'drawn', 'drawn', 'drawn', 'drawn', 'next']);
  assert.ok(last.save.get().seen.includes('map-mist-gramedla'), 'but the mist is drawn back from her');
  last.save.addStar('k6_gramedla');
  last.book.refresh();
  assert.deepEqual(last.drawings.map(drawing => last.pieceOf(drawing)), ['f', 'f']);
  assert.deepEqual(trailOf(last.root), ['drawn', 'drawn', 'drawn', 'drawn', 'drawn', 'drawing']);
  assert.deepEqual(last.save.get().seen, ['map-route-a', 'map-route-b', 'map-route-c', 'map-route-d', 'map-route-e', 'map-mist-gramedla', 'map-route-f']);
});

test('a piece the child has seen drawn in is there at once in a book made later, and the one reached since draws in alone', () => {
  const { save, book, root, drawings, pieceOf } = trailRig({ fill: s => { s.addStar('k1_kambedla'); s.addSeen('map-route-a'); } });
  assert.deepEqual(trailOf(root), ['drawn', 'next', 'hidden', 'hidden', 'hidden', 'hidden'], 'A was drawn in on an earlier visit');
  book.open('map', 'child');
  assert.equal(drawings.length, 0, 'and does not draw again');
  // Uggeðla's place is found while the map is on view: it is no trip to her and draws nothing; her star does, and B draws in as soon as the book hears of it
  save.addPlace('uggedla');
  book.refresh();
  assert.equal(drawings.length, 0, 'her place alone draws nothing');
  save.addStar('k2_uggedla');
  book.refresh();
  assert.deepEqual(drawings.map(drawing => pieceOf(drawing)), ['b', 'b']);
  assert.equal(drawings[0].options.delay, 0, 'at once: the page is already on view');
  assert.deepEqual(trailOf(root), ['drawn', 'drawing', 'next', 'hidden', 'hidden', 'hidden']);
  book.refresh();
  assert.equal(drawings.length, 2, 'a refresh does not draw it again');
});

test('with reduced motion the trail is simply there, and still kept as seen', () => {
  const { save, book, root, drawings, dots } = trailRig({ reduced: true, fill: s => { s.addStar('k1_kambedla'); s.addStar('k2_uggedla'); } });
  book.open('map', 'child');
  assert.equal(drawings.length, 0, 'no animation');
  assert.equal(dots.length, 0, 'the dot does not travel either');
  assert.deepEqual(trailOf(root), ['drawn', 'drawn', 'next', 'hidden', 'hidden', 'hidden']);
  assert.deepEqual(save.get().seen, ['map-route-a', 'map-route-b']);
  assert.ok(sameSpot(dotSpot(root), inView(ENDS.uggedla)), 'the dot stands at its final place, the end of the last piece');
});

test('the dot rides at the head of the line: along the same curve, over the same time, with the same easing', () => {
  const { save, book, root, drawings, dots, pieceOf } = trailRig({ fill: playedTo(6) });
  assert.ok(sameSpot(dotSpot(root), inView(START)), 'before the page shows, the dot stands at the clearing');
  book.open('map', 'child');
  assert.deepEqual(drawings.map(drawing => pieceOf(drawing)), ['a', 'a', 'b', 'b', 'c', 'c', 'd', 'd', 'e', 'e', 'f', 'f'], 'all six draw in, one after another');
  assert.deepEqual(save.get().seen, ['map-route-a', 'map-route-b', 'map-route-c', 'map-route-d', 'map-route-e', 'map-route-f', 'map-mist-gramedla']);
  assert.equal(dots.length, drawings.length, 'the dot travels each piece, on both pages');
  const starts = STARTS;
  const stops = [ENDS.kambedla, ENDS.uggedla, ENDS.thorsedla, ENDS.flugedla, ENDS.sloedla, ENDS.gramedla];
  const spots = keyframes => keyframes.map(({ transform }) => /translate\(([\d.]+)px, ([\d.]+)px\)/.exec(transform).slice(1).map(Number));
  drawings.forEach((drawing, i) => {
    const dot = dots[i];
    assert.equal(dot.options.duration, drawing.options.duration, `piece ${pieceOf(drawing)}: the same time`);
    assert.equal(dot.options.delay, drawing.options.delay, `piece ${pieceOf(drawing)}: starting together`);
    assert.equal(dot.options.easing, drawing.options.easing, `piece ${pieceOf(drawing)}: the same easing`);
    assert.equal(dot.options.easing, 'ease-in-out');
    assert.equal(dot.options.fill, 'forwards', `piece ${pieceOf(drawing)}: it waits where it was for its turn and stays at the end`);
    // a position at every share of the line's length: the head's distance along the curve is the keyframe's offset
    const at = spots(dot.keyframes);
    const offsets = dot.keyframes.map(keyframe => keyframe.offset);
    assert.equal(offsets[0], 0);
    assert.equal(offsets.at(-1), 1);
    assert.ok(offsets.every((offset, k) => k === 0 || offset >= offsets[k - 1]), 'the offsets rise');
    const along = at.reduce((sums, spot, k) => [...sums, k === 0 ? 0 : sums[k - 1] + Math.hypot(spot[0] - at[k - 1][0], spot[1] - at[k - 1][1])], []);
    offsets.forEach((offset, k) => assert.ok(Math.abs(along[k] / along.at(-1) - offset) < 0.003, `piece ${pieceOf(drawing)}: the position at ${offset.toFixed(3)} is that far along the curve`));
    assert.ok(sameSpot(at[0], inView(starts[Math.floor(i / 2)])), `piece ${pieceOf(drawing)}: from its start`);
    assert.ok(sameSpot(at.at(-1), inView(stops[Math.floor(i / 2)])), `piece ${pieceOf(drawing)}: to its end`);
  });
  // the pieces take their turns: the dot stays where it was until its own begins, and the first is on the clearing
  assert.ok(sameSpot(dotSpot(root), inView(START)), 'while the first waits and draws, the dot is not moved but by its animation');
  for (const piece of PIECES) {
    drawings.filter(drawing => pieceOf(drawing) === piece)[0].animation.finish();
    assert.ok(dots[PIECES.indexOf(piece) * 2].animation.cancelled && dots[PIECES.indexOf(piece) * 2 + 1].animation.cancelled, `piece ${piece}: its dot animations are let go when it is drawn`);
    assert.ok(sameSpot(dotSpot(root), inView(stops[PIECES.indexOf(piece)])), `piece ${piece} drawn: the dot rests at its end`);
  }
});

test('the dot stands where the child is, and a piece reached but not yet seen drawn leaves it there until the page shows', () => {
  const chapter1 = save => save.addStar('k1_kambedla');
  assert.equal(mapRig().map.dotAt(), 'start', 'a fresh save: the clearing, where chapter 1 begins');
  assert.ok(sameSpot(mapRig().spot(), inView(START)));
  const seenA = mapRig({ fill: save => { chapter1(save); save.addSeen('map-route-a'); } });
  assert.equal(seenA.map.dotAt(), 'kambedla', 'chapter 1 done and its trail seen');
  assert.ok(sameSpot(seenA.spot(), inView(ENDS.kambedla)));

  // reached, not yet seen: the dot stays at the clearing until the page is on view; then it travels, and rests at the glade
  const rig = mapRig({ animated: true, fill: chapter1 });
  assert.equal(rig.map.routeOf('a'), 'pending');
  assert.equal(rig.map.dotAt(), 'start', 'the unseen piece does not move it');
  rig.map.show(500);
  assert.equal(rig.map.routeOf('a'), 'drawing');
  assert.equal(rig.map.dotAt(), 'start', 'it is on its way, not yet there');
  rig.reveals()[0].animation.finish();
  assert.equal(rig.map.routeOf('a'), 'drawn');
  assert.equal(rig.map.dotAt(), 'kambedla');
  assert.ok(sameSpot(rig.spot(), inView(ENDS.kambedla)));
  // Uggeðla's star is in while the page is on view: the dot stays at the glade until B has been drawn in
  rig.save.addStar('k2_uggedla');
  rig.map.render();
  assert.equal(rig.map.routeOf('b'), 'drawing');
  assert.equal(rig.map.dotAt(), 'kambedla');
  rig.reveals()[2].animation.finish(); // B's, the first of its two copies
  assert.equal(rig.map.dotAt(), 'uggedla');
  assert.ok(sameSpot(rig.spot(), inView(ENDS.uggedla)));

  // reached while the page is not on view, with reduced motion: it waits there, then rests at the new end as the page shows
  const calm = mapRig({ reduced: true, fill: save => { chapter1(save); save.addSeen('map-route-a'); } });
  calm.save.addStar('k2_uggedla');
  calm.map.render();
  assert.equal(calm.map.routeOf('b'), 'pending');
  assert.equal(calm.map.dotAt(), 'kambedla', 'B is reached but not seen: the dot stays at the glade');
  calm.map.show(500);
  assert.equal(calm.map.routeOf('b'), 'drawn');
  assert.equal(calm.map.dotAt(), 'uggedla');
  assert.ok(sameSpot(calm.spot(), inView(ENDS.uggedla)));

  // Þórseðla's star as chapter 2 gives it today reaches b and c together: they draw one after the other, the dot resting at Uggeðla's
  // circle and then at Þórseðla's
  const both = mapRig({ animated: true, fill: save => { today(save); save.addSeen('map-route-a'); } });
  assert.equal(both.map.dotAt(), 'kambedla', 'a is drawn, b and c wait');
  both.map.show(0);
  assert.deepEqual(['b', 'c'].map(id => both.map.routeOf(id)), ['drawing', 'drawing']);
  assert.equal(both.map.dotAt(), 'kambedla');
  both.reveals()[0].animation.finish(); // B's first copy
  assert.equal(both.map.dotAt(), 'uggedla', 'b done: the dot is at Uggeðla\'s circle');
  both.reveals()[2].animation.finish(); // C's first copy
  assert.equal(both.map.dotAt(), 'thorsedla', 'c done: at Þórseðla\'s');
  assert.ok(sameSpot(both.spot(), inView(ENDS.thorsedla)));

  // the whole trail, as far as Grameðla
  const far = mapRig({ fill: save => { playedTo(6)(save); for (const id of PIECES) save.addSeen(`map-route-${id}`); } });
  assert.equal(far.map.dotAt(), 'gramedla');
  assert.ok(sameSpot(far.spot(), inView(ENDS.gramedla)));
});

/** The animations that open the mist's hole (a mapRig made `animated`), and the mist layers of the map. */
const openingOf = rig => rig.animations.filter(({ el, keyframes }) => el.classList.contains('map-mist') && keyframes.some(keyframe => '--map-hole' in keyframe));
const mistsOf = rig => rig.leaf.el.findAll(e => e.classList.contains('map-mist'));
const GRAMEDLA_SEEN = 'map-mist-gramedla';

test('the mist opens at Grameðla once she is found, the first time drawn open, then simply open', () => {
  // nobody found: the mist keeps to its place, and nothing is kept
  const fresh = mapRig({ animated: true });
  assert.equal(fresh.map.mistOpen(), false, 'a fresh save');
  fresh.map.show(500);
  assert.equal(fresh.map.mistOpen(), false, 'shown with nobody found');
  assert.ok(!fresh.save.get().seen.includes(GRAMEDLA_SEEN));
  assert.equal(openingOf(fresh).length, 0);
  assert.match(mistsOf(fresh)[0].style['--map-hole'], /^0(cqw|px)?$/, 'the hole is shut: no width');
  // a friend found elsewhere does not open it either
  const other = mapRig({ animated: true, fill: save => { save.addPlace('kambedla'); save.addStar('k2_thorsedla'); } });
  other.map.show(0);
  assert.equal(other.map.mistOpen(), false, 'the others are not Grameðla');

  // her star: reached, but the page has not shown it yet
  const star = mapRig({ animated: true, fill: save => { save.addStar('k2_thorsedla'); save.addStar('k6_gramedla'); } });
  assert.equal(star.map.mistOpen(), false, 'reached, but not yet on view');
  assert.ok(!star.save.get().seen.includes(GRAMEDLA_SEEN), 'and not kept as seen');
  assert.equal(openingOf(star).length, 0);
  star.map.show(500);
  assert.equal(star.map.mistOpen(), true, 'the page shows her reached: the mist opens');
  assert.ok(star.save.get().seen.includes(GRAMEDLA_SEEN), 'kept as seen');
  const opening = openingOf(star);
  assert.equal(opening.length, 1, 'drawn once: one animation, on the left page\'s mist, where her slot is');
  const [{ el, keyframes, options }] = opening;
  assert.equal(mistsOf(star).indexOf(el), 0, 'on the left page');
  assert.equal(options.duration, 2000, 'over two seconds');
  assert.equal(options.delay, 500, 'once the book has turned to the page');
  assert.equal(options.fill, 'backwards', 'shut while it waits for its turn');
  const [from, to] = keyframes.map(keyframe => keyframe['--map-hole']);
  assert.match(from, /^0(cqw|px)?$/, 'from shut');
  assert.ok(/cqw$/.test(to), 'to a width that holds to the page it is on');
  const circle = 80 * 1800 / 1681; // the width across her pale circle, in the view's units
  assert.ok(Math.abs(parseFloat(to) * 9 - circle * 1.6) < 1, `a radius of 1.6 times her circle (${to}, 9 to the cqw)`);
  assert.equal(el.style['--map-hole'], to, 'and it stays open when the animation is let go');
  // later renders and shows do not draw it again
  star.map.render();
  star.map.show(0);
  star.map.hide();
  star.map.show(0);
  assert.equal(openingOf(star).length, 1, 'once');
  assert.equal(star.map.mistOpen(), true);

  // her place alone opens it too; and found while the page is on view it opens at once
  const place = mapRig({ animated: true, fill: save => save.addPlace('gramedla') });
  place.map.show(0);
  assert.equal(place.map.mistOpen(), true, 'her place alone');
  const live = mapRig({ animated: true });
  live.map.show(0);
  assert.equal(live.map.mistOpen(), false);
  live.save.addPlace('gramedla');
  live.map.render();
  assert.equal(live.map.mistOpen(), true, 'found while the page is on view');
  assert.equal(openingOf(live)[0].options.delay, 0, 'at once');

  // the next time, it is simply open: the save says it was seen
  const later = mapRig({ animated: true, fill: save => { save.addStar('k6_gramedla'); save.addSeen(GRAMEDLA_SEEN); } });
  assert.equal(later.map.mistOpen(), true, 'open from the start');
  later.map.show(500);
  assert.equal(openingOf(later).length, 0, 'not drawn again');
  assert.equal(mistsOf(later)[0].style['--map-hole'], to, 'but open');

  // hiding the page finishes the opening where it was going
  const half = mapRig({ animated: true, fill: save => save.addPlace('gramedla') });
  half.map.show(0);
  half.map.hide();
  assert.ok(openingOf(half)[0].animation.cancelled, 'the animation is let go');
  assert.equal(mistsOf(half)[0].style['--map-hole'], to, 'the hole stays open');

  // with less motion: simply open, and nothing animates
  const calm = mapRig({ reduced: true, animated: true, fill: save => save.addStar('k6_gramedla') });
  calm.map.show(500);
  assert.equal(calm.map.mistOpen(), true);
  assert.equal(openingOf(calm).length, 0, 'no animation');
  assert.equal(mistsOf(calm)[0].style['--map-hole'], to, 'the hole is open');
  assert.ok(calm.save.get().seen.includes(GRAMEDLA_SEEN), 'still kept as seen');
});

// ---- The map in the journey: pieces drawn on request, and the map moment over the game (map-moment.js) -----------------

test('drawPieces draws named pieces whether or not the save has reached them, and keeps them seen', () => {
  const rig = mapRig({ animated: true });
  assert.equal(rig.map.routeOf('a'), 'next', 'a fresh save has reached nothing');
  assert.equal(rig.map.drawPieces(['a']), 2650, 'one piece takes 2.65 seconds');
  assert.equal(rig.map.routeOf('a'), 'drawing');
  assert.deepEqual(rig.save.get().seen, ['map-route-a'], 'kept as seen');
  assert.deepEqual(rig.reveals().map(({ options }) => [options.delay, options.duration]), [[0, 2650], [0, 2650]], 'on both pages at once, at once');
  rig.reveals()[0].animation.finish();
  assert.equal(rig.map.routeOf('a'), 'drawn');
  assert.equal(rig.map.dotAt(), 'kambedla', 'the dot rests where it ended');

  // two pieces: each after the one before; the delay is when the first begins and is not part of how long it takes
  const two = mapRig({ animated: true });
  assert.equal(two.map.drawPieces(['b', 'c'], { delay: 600 }), 5500, 'two pieces and the gap between them');
  assert.deepEqual(two.reveals().map(({ options }) => options.delay), [600, 600, 3450, 3450]);
  const dots = two.animations.filter(({ el }) => el.getAttribute('class') === 'map-dot');
  assert.deepEqual(dots.map(({ options }) => [options.delay, options.duration]), [[600, 2650], [600, 2650], [3450, 2650], [3450, 2650]], 'the dot rides each piece\'s head');
  assert.deepEqual(['a', 'b', 'c'].map(id => two.map.routeOf(id)), ['next', 'drawing', 'drawing']);
  assert.deepEqual(two.save.get().seen, ['map-route-b', 'map-route-c']);

  // a piece the child has seen is drawn again from its start, and the dot goes back to where it begins
  const again = mapRig({ animated: true, fill: save => { playedTo(3)(save); for (const id of ['a', 'b', 'c']) save.addSeen(`map-route-${id}`); } });
  assert.deepEqual(['a', 'b', 'c'].map(id => again.map.routeOf(id)), ['drawn', 'drawn', 'drawn']);
  assert.equal(again.map.drawPieces(['b', 'c']), 5500);
  assert.deepEqual(['a', 'b', 'c'].map(id => again.map.routeOf(id)), ['drawn', 'drawing', 'drawing'], 'b and c are waiting to be drawn again');
  assert.equal(again.map.dotAt(), 'kambedla', 'the dot waits at the end of a, where b begins');
  assert.deepEqual(again.save.get().seen, ['map-route-a', 'map-route-b', 'map-route-c'], 'and nothing is kept twice');

  // reduced motion draws nothing: the pieces are just there, and kept; so for a page that cannot animate; and an id that is no piece is none
  const calm = mapRig({ reduced: true, animated: true });
  assert.equal(calm.map.drawPieces(['a', 'b']), 0);
  assert.deepEqual(['a', 'b'].map(id => calm.map.routeOf(id)), ['drawn', 'drawn']);
  assert.equal(calm.animations.filter(({ el }) => el.getAttribute('class') === 'map-route-reveal').length, 0, 'no animation');
  assert.deepEqual(calm.save.get().seen, ['map-route-a', 'map-route-b']);
  const plain = mapRig();
  assert.equal(plain.map.drawPieces(['a']), 0, 'a page that cannot animate has it there at once');
  assert.equal(plain.map.routeOf('a'), 'drawn');
  assert.equal(mapRig({ animated: true }).map.drawPieces(['z']), 0);
});

test('bounds(ids) is the box round the pieces\' curves, in the view\'s units', () => {
  const { map } = mapRig();
  const near = (got, want, what) => assert.ok(Math.abs(got - want) < 10, `${what}: ${got.toFixed(1)} is not near ${want.toFixed(1)}`);
  // a: from the clearing to the glade, x 249 to 531 and y 532 to 736 in the painting's pixels
  const a = map.bounds(['a']);
  near(a.x, inView([249, 0])[0], 'a left');
  near(a.y, inView([0, 532])[1], 'a top');
  near(a.x + a.width, inView([531, 0])[0], 'a right');
  near(a.y + a.height, inView([0, 736])[1], 'a bottom');
  // b alone: from the glade's far side along the prints and past the channel to Uggeðla's circle, x 628 to 1413 and y 492 to 730
  const b = map.bounds(['b']);
  near(b.x, inView([628, 0])[0], 'b left');
  near(b.y, inView([0, 492])[1], 'b top');
  near(b.x + b.width, inView([1413, 0])[0], 'b right');
  near(b.y + b.height, inView([0, 730])[1], 'b bottom');
  // f, the long one west over the north: x 218 to 1026, y 116 to 168
  const f = map.bounds(['f']);
  near(f.x, inView([218, 0])[0], 'f left');
  near(f.y, inView([0, 116])[1], 'f top');
  near(f.x + f.width, inView([1026, 0])[0], 'f right');
  near(f.y + f.height, inView([0, 168])[1], 'f bottom');
  // b and c together: from the glade's far side past Uggeðla's circle to Þórseðla's pool and the north of it
  const both = map.bounds(['b', 'c']);
  near(both.x, inView([628, 0])[0], 'b+c left');
  near(both.y, inView([0, 366])[1], 'b+c top');
  near(both.x + both.width, inView([1628, 0])[0], 'b+c right');
  near(both.y + both.height, inView([0, 730])[1], 'b+c bottom');
  const whole = { x: 0, y: 0, width: 1800, height: 1000 };
  assert.deepEqual(map.bounds([]), whole, 'no piece: the whole map');
  assert.deepEqual(map.bounds(['z']), whole, 'and an id that is no piece is none');
});

test('the ids in the map stay unique when a second map is drawn in the same page', () => {
  // the book's map and the map moment's are on the page together: a mask is found by its id, so the two must not share one
  const doc = new FakeDocument();
  const make = () => {
    const leaf = { el: doc.createElement('div'), tiles: [doc.createElement('div'), doc.createElement('div')] };
    leaf.el.append(...leaf.tiles);
    renderMap(leaf, { save: createSave(null), win: { matchMedia: () => ({ matches: false }) } });
    return leaf;
  };
  const maps = [make(), make(), make()];
  const idsOf = leaf => leaf.el.findAll(e => e.getAttribute('id')).map(e => e.getAttribute('id'));
  const all = maps.flatMap(idsOf);
  assert.equal(all.length, 3 * 6 * 2, 'a mask for each of six pieces on each of two pages, in each map');
  assert.equal(new Set(all).size, all.length, 'every id is one of a kind');
  for (const leaf of maps) { // and each map's lines are masked by its own masks
    const own = new Set(idsOf(leaf));
    const lines = leaf.el.findAll(e => e.getAttribute('class') === 'map-route-line');
    assert.equal(lines.length, 12);
    for (const line of lines) assert.ok(own.has(/^url\(#(.+)\)$/.exec(line.getAttribute('mask'))[1]), 'a line is masked by a mask of its own map');
  }
});

test('fitMap keeps the whole map inside the screen, landscape and upright', () => {
  for (const [width, height] of [[1366, 1024], [1024, 1366], [1920, 1080], [820, 1180], [1180, 820]]) {
    const box = fitMap(width, height);
    assert.ok(box.width <= width * 0.86 + 1e-9 && box.height <= height * 0.86 + 1e-9, `${width}x${height}: within 86 % of each side`);
    assert.ok(Math.abs(box.width / box.height - 1.8) < 1e-9, `${width}x${height}: the map's own shape, 1.8 to 1`);
    assert.ok(box.width >= width * 0.86 - 1e-9 || box.height >= height * 0.86 - 1e-9, `${width}x${height}: and as big as that lets it be`);
  }
  assert.deepEqual(fitMap(1000, 1000), { width: 860, height: 860 / 1.8 }, 'a square screen: the width limits, and the map is letterboxed');
  const upright = fitMap(1024, 1366);
  assert.ok(upright.width < 1024 && upright.height < 1366 / 2, 'upright: as wide as the screen lets it be, a band across the middle');
});

test('the zoom eases toward the leg, at most 1.6 times, and never cuts the pieces out of the card', () => {
  const { map } = mapRig();
  const boxes = [
    map.bounds(['a']), map.bounds(['b', 'c']), map.bounds(['d']), map.bounds(['f']), map.bounds(['a', 'b', 'c', 'd', 'e', 'f']),
    { x: 0, y: 0, width: 10, height: 10 }, { x: 1790, y: 990, width: 10, height: 10 }, { x: 900, y: 500, width: 0, height: 0 },
    { x: 20, y: 400, width: 700, height: 300 }, { x: 1100, y: 40, width: 650, height: 80 },
  ];
  for (const box of boxes) {
    const { scale, x, y } = zoomTo(box);
    const what = JSON.stringify(box);
    assert.ok(scale >= 1 && scale <= 1.6 + 1e-9, `${what}: at least 1 and at most 1.6 times (${scale})`);
    assert.ok(x <= 1e-9 && x >= -(scale - 1) * 1800 - 1e-9 && y <= 1e-9 && y >= -(scale - 1) * 1000 - 1e-9, `${what}: the map still covers the card`);
    const [left, right, top, bottom] = [box.x * scale + x, (box.x + box.width) * scale + x, box.y * scale + y, (box.y + box.height) * scale + y];
    assert.ok(left >= -1e-9 && right <= 1800 + 1e-9 && top >= -1e-9 && bottom <= 1000 + 1e-9, `${what}: the pieces stay inside the card (${[left, right, top, bottom].map(Math.round)})`);
  }
  assert.deepEqual(zoomTo({ x: 0, y: 0, width: 1800, height: 1000 }), { scale: 1, x: 0, y: 0 }, 'the whole map is not zoomed');
  assert.ok(zoomTo(map.bounds(['a'])).scale > 1.5, 'a short leg is brought near');
  assert.ok(zoomTo(map.bounds(['b', 'c'])).scale < 1.5, 'a long one is not, or it would be cut off');
});

/** The box round some pieces of the trail, as the map says it. */
const boundsOf = ids => mapRig().map.bounds(ids);

/**
 * The map moment on a page of its own, over a save of its own, in a window `size` big: the animations it asks for (recorded, and
 * finished by hand), the sounds it makes, and the page's resize listener. `ids` are the elements the page already has; `liveMap`
 * makes the map's living layers (as renderMap's; fakeLife's, to see them).
 */
function momentRig({ fill = () => {}, reduced = false, size = [1366, 1024], ids = [], liveMap } = {}) {
  const save = createSave(null);
  fill(save);
  const doc = new FakeDocument(ids);
  const animations = []; // { el, keyframes, options, animation }
  const create = doc.createElement.bind(doc);
  doc.createElement = tag => {
    const element = create(tag);
    element.animate = (keyframes, options) => {
      const animation = { cancelled: false, cancel() { this.cancelled = true; }, finish() { this.onfinish?.(); } };
      animations.push({ el: element, keyframes, options, animation });
      return animation;
    };
    return element;
  };
  const sounds = [];
  const listeners = new Map();
  const win = {
    innerWidth: size[0], innerHeight: size[1], matchMedia: () => ({ matches: reduced }),
    addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type),
  };
  const moment = createMapMoment(doc, { save, audio: { sfx: name => { sounds.push(name); return true; } }, win, liveMap });
  const overlays = () => doc.body.children.filter(e => e.classList.contains('map-moment'));
  return { save, doc, moment, animations, sounds, win, listeners, overlays };
}

test('the map moment slides up over the game, draws the leg ahead and goes', () => {
  const rig = momentRig();
  assert.equal(rig.overlays().length, 0, 'nothing on the page until it is played');
  assert.equal(rig.moment.isOpen, false);
  const { drawMs } = rig.moment.play(['a']);
  assert.equal(drawMs, 3250, 'the slide up (0.6 s) and the one piece (2.65 s)');
  assert.equal(rig.overlays().length, 1, 'one overlay');
  assert.equal(rig.moment.isOpen, true);
  const [overlay] = rig.overlays();
  assert.equal(overlay.findAll(e => e.classList.contains('map-tiles')).length, 2, 'the map as one picture: both its pages, side by side');
  const states = id => overlay.findAll(e => e.getAttribute('data-piece') === id).map(e => e.getAttribute('data-state'));
  assert.deepEqual(states('a'), ['drawing', 'drawing'], 'piece a is drawing, on both pages');
  assert.deepEqual(rig.save.get().seen, ['map-route-a'], 'and kept as seen');
  assert.equal(overlay.getAttribute('aria-hidden'), 'true', 'a picture for the eyes: Mosi says the words');
  assert.notEqual(overlay.getAttribute('inert'), null, 'and nothing in it takes a touch or a tab');

  const card = overlay.findAll(e => e.classList.contains('map-card'))[0];
  const zoom = overlay.findAll(e => e.classList.contains('map-zoom'))[0];
  const veil = overlay.findAll(e => e.classList.contains('map-veil'))[0];
  const slideIn = rig.animations.find(({ el }) => el === card);
  assert.equal(slideIn.options.duration, 600, 'it slides up in 0.6 s');
  assert.match(slideIn.keyframes[0].transform, /^translateY\(100vh\)$/, 'from below the screen');
  assert.match(slideIn.keyframes.at(-1).transform, /^translateY\(0(px)?\)$/, 'to its place');
  assert.ok(rig.animations.some(({ el, keyframes }) => el === veil && keyframes[0].opacity === 0 && keyframes.at(-1).opacity === 1), 'the game goes dim as it comes');
  const move = rig.animations.find(({ el }) => el === zoom);
  assert.equal(move.options.duration, 3250, 'the zoom lasts as long as the slide and the drawing');
  assert.equal(move.options.fill, 'forwards');
  assert.equal(move.options.easing, 'ease-in-out');
  const reveals = rig.animations.filter(({ el }) => el.getAttribute('class') === 'map-route-reveal');
  assert.deepEqual(reveals.map(({ options }) => [options.delay, options.duration]), [[600, 2650], [600, 2650]], 'the line begins as the map has arrived');

  // the sounds: the map's on its arrival, and a pen's as the piece begins, in game time
  assert.deepEqual(rig.sounds, ['mapOpen']);
  rig.moment.update(0.5);
  assert.deepEqual(rig.sounds, ['mapOpen'], 'the pen is not yet at work');
  rig.moment.update(0.1);
  assert.deepEqual(rig.sounds, ['mapOpen', 'mapPen'], 'it is, as the piece begins');
  rig.moment.update(3);
  assert.deepEqual(rig.sounds, ['mapOpen', 'mapPen'], 'once for a piece');

  // away: it slides down in 0.6 s, the line finished where it was, and the overlay is gone when that is over
  assert.equal(rig.moment.close(), 600);
  assert.equal(rig.moment.isOpen, false, 'the moment is over');
  assert.equal(rig.overlays().length, 1, 'but it is still sliding away');
  assert.deepEqual(states('a'), ['drawn', 'drawn'], 'the line is finished');
  const slideOut = rig.animations.filter(({ el }) => el === card)[1];
  assert.equal(slideOut.options.duration, 600);
  assert.match(slideOut.keyframes.at(-1).transform, /^translateY\(100vh\)$/, 'down and off the screen');
  assert.equal(slideOut.options.fill, 'forwards', 'and it stays off until it is taken away');
  rig.moment.update(0.59);
  assert.equal(rig.overlays().length, 1);
  rig.moment.update(0.02);
  assert.equal(rig.overlays().length, 0, 'the overlay is gone after 0.6 s of the game clock');
  assert.equal(rig.moment.close(), 0, 'nothing to close');
  assert.deepEqual(rig.save.get().seen, ['map-route-a']);
});

test('the map moment draws two pieces for a long leg, over the pieces already drawn, and a held game holds the closing', () => {
  const rig = momentRig({ fill: save => { save.addStar('k1_kambedla'); save.addSeen('map-route-a'); } });
  const { drawMs } = rig.moment.play(['b', 'c']);
  assert.equal(drawMs, 6100, 'the slide, two pieces and the gap between them');
  const [overlay] = rig.overlays();
  const states = id => [...new Set(overlay.findAll(e => e.getAttribute('data-piece') === id).map(e => e.getAttribute('data-state')))];
  assert.deepEqual(['a', 'b', 'c'].map(states), [['drawn'], ['drawing'], ['drawing']], 'the glade\'s piece stays as it was, the two ahead draw');
  assert.ok(sameSpot(dotSpot(overlay), inView(ENDS.kambedla)), 'the dot waits where the child is, at the glade, until the line goes on');
  const reveals = rig.animations.filter(({ el }) => el.getAttribute('class') === 'map-route-reveal');
  assert.deepEqual(reveals.map(({ options }) => options.delay), [600, 600, 3450, 3450]);
  assert.deepEqual(rig.save.get().seen, ['map-route-a', 'map-route-b', 'map-route-c']);
  rig.moment.update(0.6);
  rig.moment.update(2.85);
  assert.deepEqual(rig.sounds, ['mapOpen', 'mapPen', 'mapPen'], 'a pen for each piece, as each begins');
  // the zoom frames the two pieces with room round them, short of the 1.6 times
  const zoom = overlay.findAll(e => e.classList.contains('map-zoom'))[0];
  const [, to] = rig.animations.find(({ el }) => el === zoom).keyframes.map(({ transform }) => transform);
  const [, tx, ty, scale] = /^translate\((-?[\d.]+)%, (-?[\d.]+)%\) scale\(([\d.]+)\)$/.exec(to).map(Number);
  const want = zoomTo(boundsOf(['b', 'c']));
  assert.ok(Math.abs(scale - want.scale) < 0.001 && Math.abs(tx - want.x / 18) < 0.01 && Math.abs(ty - want.y / 10) < 0.01, 'toward the two pieces, in percent of the card');
  assert.ok(scale > 1 && scale < 1.6);
  // a game that is held (the child's book open) does not move the closing on
  assert.equal(rig.moment.close(), 600);
  rig.moment.update(0);
  rig.moment.update(-1);
  assert.equal(rig.overlays().length, 1, 'held where it was');
  rig.moment.update(0.6);
  assert.equal(rig.overlays().length, 0);
});

test('with reduced motion the map appears and goes without sliding or zooming, the line simply there', () => {
  const rig = momentRig({ reduced: true });
  const { drawMs } = rig.moment.play(['b', 'c']);
  assert.equal(drawMs, 0, 'nothing to wait for: the scene waits for Mosi\'s line');
  assert.equal(rig.animations.length, 0, 'nothing slides, zooms or draws');
  assert.equal(rig.overlays().length, 1, 'but the map is there');
  assert.equal(rig.moment.isOpen, true, 'and stays until it is closed');
  const [overlay] = rig.overlays();
  const states = id => [...new Set(overlay.findAll(e => e.getAttribute('data-piece') === id).map(e => e.getAttribute('data-state')))];
  assert.deepEqual(['b', 'c'].map(states), [['drawn'], ['drawn']]);
  assert.deepEqual(rig.save.get().seen, ['map-route-b', 'map-route-c'], 'still kept as seen');
  assert.deepEqual(rig.sounds, ['mapOpen'], 'the map\'s sound, and no pen: nothing is drawn');
  assert.equal(rig.moment.close(), 0);
  assert.equal(rig.moment.isOpen, false);
  assert.equal(rig.overlays().length, 0, 'it goes at once');
});

test('the map moment plays again over pieces the child has seen, and a second play replaces a first', () => {
  const rig = momentRig({ fill: save => { save.addStar('k1_kambedla'); save.addSeen('map-route-a'); } });
  assert.equal(rig.moment.play(['a']).drawMs, 3250, 'a seen piece is drawn again');
  const [first] = rig.overlays();
  assert.deepEqual(first.findAll(e => e.getAttribute('data-piece') === 'a').map(e => e.getAttribute('data-state')), ['drawing', 'drawing']);
  assert.equal(rig.moment.play(['a']).drawMs, 3250);
  assert.equal(rig.overlays().length, 1, 'one overlay, never two');
  assert.notEqual(rig.overlays()[0], first, 'the new one');
  assert.equal(first.parentNode, null, 'the old one gone');
});

test('the map in the journey lives while it plays and lets its living layers go when it leaves', () => {
  const { liveMap, made } = fakeLife();
  const rig = momentRig({ liveMap });
  assert.equal(made.length, 0, 'nothing is made until it is played');
  rig.moment.play(['a']);
  const [overlay] = rig.overlays();
  const halves = overlay.findAll(e => e.classList.contains('map-half'));
  assert.deepEqual(made.map(layer => layer.options.half), [0, 1], 'a layer for each of its two pages');
  assert.deepEqual(made.map(layer => layer.canvas), halves.map(half => half.children.find(child => child.classList.contains('map-live'))), 'drawn on the overlay\'s own canvases');
  assert.deepEqual(made.map(layer => layer.starts), [1, 1], 'both started as the map slides up');
  assert.deepEqual(made.map(layer => layer.running), [true, true]);
  // it stops drawing as it slides away, and is let go when it is gone
  assert.equal(rig.moment.close(), 600);
  assert.deepEqual(made.map(layer => layer.running), [false, false], 'nothing draws under a map that is leaving');
  assert.deepEqual(made.map(layer => layer.destroyed), [false, false], 'but they are not let go while it still slides');
  rig.moment.update(0.59);
  assert.deepEqual(made.map(layer => layer.destroyed), [false, false]);
  rig.moment.update(0.02);
  assert.equal(rig.overlays().length, 0, 'the overlay is gone');
  assert.deepEqual(made.map(layer => layer.destroyed), [true, true], 'and its graphics contexts with it');
  assert.equal(made.length, 2, 'no layer made after the first two');
});

test('a journey map played over another lets the first one\'s life go', () => {
  const { liveMap, made } = fakeLife();
  const rig = momentRig({ liveMap });
  rig.moment.play(['a']);
  const [first] = rig.overlays();
  assert.equal(made.length, 2);
  rig.moment.play(['b']);
  assert.equal(first.parentNode, null, 'the first overlay is gone');
  assert.equal(made.length, 4, 'two new layers for the second map');
  assert.deepEqual(made.slice(0, 2).map(layer => layer.destroyed), [true, true], 'the first map\'s layers are let go');
  assert.deepEqual(made.slice(0, 2).map(layer => layer.running), [false, false]);
  assert.deepEqual(made.slice(2).map(layer => [layer.starts, layer.destroyed, layer.running]), [[1, false, true], [1, false, true]], 'the second map\'s are started and kept');
  const [second] = rig.overlays();
  assert.deepEqual(made.slice(2).map(layer => layer.canvas), second.findAll(e => e.classList.contains('map-live')), 'on the second overlay\'s canvases');
});

test('with reduced motion the map in the journey makes no living layer', () => {
  const { liveMap, made } = fakeLife();
  const rig = momentRig({ liveMap, reduced: true });
  rig.moment.play(['b', 'c']);
  assert.equal(rig.overlays().length, 1, 'the map is there, the painting and the still mist');
  assert.equal(made.length, 0, 'no living layer is made');
  assert.equal(rig.moment.close(), 0);
  assert.equal(rig.overlays().length, 0);
  assert.equal(made.length, 0);
});

test('the card is sized by fitMap, and keeps to it when the window changes', () => {
  const rig = momentRig({ size: [1024, 1366] });
  rig.moment.play(['a']);
  const card = rig.overlays()[0].findAll(e => e.classList.contains('map-card'))[0];
  const upright = fitMap(1024, 1366);
  assert.equal(card.style['--moment-w'], `${upright.width}px`);
  assert.equal(card.style['--moment-h'], `${upright.height}px`);
  rig.win.innerWidth = 1366;
  rig.win.innerHeight = 1024;
  rig.listeners.get('resize')();
  assert.equal(card.style['--moment-w'], `${fitMap(1366, 1024).width}px`, 'turned on its side');
  rig.moment.close();
  assert.equal(rig.listeners.has('resize'), false, 'the window is let go when it closes');
});

test('the overlay stands after the canvas and before the caption, the buttons and the book, so the book opens over it', () => {
  const rig = momentRig({ ids: ['view', 'caption', 'journal-button', 'book'] });
  const page = ['view', 'caption', 'journal-button', 'book'].map(id => rig.doc.getElementById(id));
  rig.doc.body.append(...page);
  rig.moment.play(['a']);
  assert.deepEqual(rig.doc.body.children.map(e => e.id || e.className), ['view', 'map-moment', 'caption', 'journal-button', 'book'], 'over the game, under all the rest');
  rig.moment.close();
  rig.moment.update(0.6);
  assert.deepEqual(rig.doc.body.children.map(e => e.id), ['view', 'caption', 'journal-button', 'book']);
  // a page with no canvas (the lab): the first of its body
  const lab = momentRig({ ids: ['book'] });
  lab.doc.body.append(lab.doc.getElementById('book'));
  lab.moment.play(['a']);
  assert.deepEqual(lab.doc.body.children.map(e => e.id || e.className), ['map-moment', 'book']);
});

test('the overlay\'s style: over the game and let touches through, a veil, a paper card, and still with less motion', () => {
  const css = fs.readFileSync(new URL('../book.css', import.meta.url), 'utf8');
  const rule = selector => {
    const at = css.indexOf(`\n${selector} {`);
    assert.ok(at >= 0, `a rule for ${selector}`);
    return css.slice(at, css.indexOf('\n}', at));
  };
  const moment = rule('.map-moment');
  assert.match(moment, /position: fixed; inset: 0/, 'over the whole screen');
  assert.match(moment, /pointer-events: none/, 'a tap goes through to the game');
  assert.doesNotMatch(moment, /z-index/, 'its place in the page, after the canvas, puts it under the caption and the book (map-moment.js)');
  assert.match(rule('.map-veil'), /background: rgb\(20 16 10 \/ \.35\)/, 'the game dims by 35 %');
  const card = rule('.map-card');
  assert.match(card, /width: var\(--moment-w, min\(86vw, 154\.8vh\)\)/, 'about 86 % of the screen, 1.8 to 1, before the script sizes it');
  assert.match(card, /box-shadow/, 'with a shadow');
  assert.match(css, /\.map-moment \.map-tiles \{[^}]*container-type: size/, 'each page of the map is a box that sizes its half, as the book\'s tiles do');
  const calm = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce) {'));
  assert.match(calm, /\.map-moment \*, \.map-moment \*::before, \.map-moment \*::after \{ animation: none !important; \}/, 'the map outside the book stands as still as in it');
});

test('the book opened during a map moment leaves no overlay behind, and the pieces are seen', () => {
  // The child taps the journal button while the map is up: the book opens over it (the page's order, above), the game is held, and when
  // the child shuts the book the scene goes on, ends the moment and the overlay goes. What the moment drew is kept: the book does not
  // draw it again when its place is found.
  const save = createSave(null);
  const doc = new FakeDocument(['book', 'journal-button', 'star-slots', 'journal-flights', 'journal-badge']);
  const drawings = []; // the red lines drawn in, in the book or on the map moment
  const create = doc.createElement.bind(doc);
  doc.createElement = tag => {
    const element = create(tag);
    element.animate = () => {
      const animation = { cancel() {}, finish() { this.onfinish?.(); } };
      if (element.getAttribute('class') === 'map-route-reveal') drawings.push(animation);
      return animation;
    };
    return element;
  };
  const root = doc.getElementById('book');
  root.animate = () => ({ cancel() {}, finish() {} });
  const audio = { sfx: () => true, stop() {}, narrate: () => DONE };
  const paused = [];
  const book = createBook(doc, { save, audio, onPause: on => paused.push(on), win: { matchMedia: () => ({ matches: false }) } });
  const journal = createJournal(doc, save, { book, audio, win: { matchMedia: () => ({ matches: false }) } });
  const overlays = () => doc.body.children.filter(e => e.classList.contains('map-moment'));

  const { drawMs } = journal.mapMoment.play(['a']);
  assert.equal(drawMs, 3250);
  assert.equal(drawings.length, 2, 'piece a drawing, on the overlay\'s two pages');
  doc.getElementById('journal-button').dispatchEvent(new Event('click'));
  assert.equal(book.isOpen, true, 'the child\'s book opens');
  assert.deepEqual(paused, [true], 'and holds the game');
  assert.equal(overlays().length, 1, 'the map goes on under it: it is not the book\'s to close');
  journal.update(0); // the held game's clock does not move
  assert.equal(overlays().length, 1);

  book.close(); // the child is done; the scene's wait goes on and then ends the moment
  assert.deepEqual(paused, [true, false]);
  assert.equal(journal.mapMoment.isOpen, true, 'the moment is still its scene\'s to end');
  assert.equal(journal.mapMoment.close(), 600);
  journal.update(0.6);
  assert.equal(overlays().length, 0, 'no overlay left behind');
  assert.deepEqual(save.get().seen, ['map-route-a'], 'the piece is seen');

  // the book's map: Kambeðla not found yet, so a is still the way ahead there; once she is, it is simply drawn, not drawn in again
  const reveals = () => root.findAll(e => e.getAttribute('class') === 'map-route-reveal');
  const piece = id => [...new Set(root.findAll(e => e.getAttribute('data-piece') === id).map(e => e.getAttribute('data-state')))];
  book.open('map', 'child');
  assert.deepEqual(piece('a'), ['next'], 'the way ahead, as before');
  save.addStar('k1_kambedla');
  const before = drawings.length;
  book.refresh();
  assert.deepEqual(piece('a'), ['drawn'], 'her place found: a is simply there');
  assert.equal(drawings.length, before, 'not drawn in again');
  assert.ok(reveals().length > 0);
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

// A skeleton lying in its stone (Slóeðla's Joe, Flugeðla's cousin; the manifest's turn: 'rock') rocks face on, so its flat back
// is not shown unless a finger turns it; a standing skeleton turns round (2026-10-28).
test('a slab model is asked to rock face on, a standing skeleton to turn round', async () => {
  const doc = new FakeDocument(['book']);
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const asked = [];
  const view = { canvas: doc.createElement('canvas'), mount() {}, show: async (src, options) => { asked.push([src, options?.rock === true]); return true; }, hide() {} };
  const models = new Map([
    ['standing.glb', { credit: 'Smithsonian Institution', license: 'CC0', source: 'https://3d.si.edu/t-rex' }],
    ['slab.glb', { credit: 'luiscoya', license: 'CC BY 4.0', source: 'https://sketchfab.com/x', turn: 'rock' }],
  ]);
  const card = { id: 'two', name: 'Tvær', pages: ['standing.glb', 'slab.glb'].map((model, i) => ({ image: 'none', text: `Texti ${i + 1}.`, audio: `book_two_${i + 1}`, sources: ['heimild'], model })) };
  const viewer = createCardViewer(doc, doc.getElementById('book'), { audio: { sfx() {}, stop() {}, narrate: () => DONE }, models, skeleton: view });
  viewer.open(card, null, 0);
  await flush();
  viewer.next();
  await flush();
  assert.deepEqual(asked, [['standing.glb', false], ['slab.glb', true]]);
  viewer.close(true);

  assert.equal(rockYaw(0), 0, 'a slab starts face on');
  const swing = Array.from({ length: 600 }, (_, i) => rockYaw(i / 10));
  assert.ok(Math.max(...swing.map(Math.abs)) <= ROCK_SWING + 1e-9, 'and never turns further than its swing');
  assert.ok(Math.min(...swing) < -0.9 * ROCK_SWING && Math.max(...swing) > 0.9 * ROCK_SWING, 'it goes both ways within a minute');
});

// The owner (2026-10-26): a tap on the model takes it to the whole screen, as a tap on a picture does; and the ⓘ says who made it.
test('a tap on the model takes it to the whole screen and back, and while the model shows the ⓘ names its maker', async () => {
  const doc = new FakeDocument(['book']);
  const root = doc.getElementById('book');
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const zoomed = [];
  const zoom = { isOpen: false, open() {}, openModel(canvas, back) { zoomed.push({ canvas, back }); this.isOpen = true; return true; }, close() {} };
  const canvas = doc.createElement('canvas');
  const mounts = [];
  let modelShows = true;
  const view = { canvas, mount: into => mounts.push(into), show: async () => modelShows, hide() {} };
  const media = parseManifest({ images: [{ id: 'hatcher', src: 'a.jpg', kind: 'fossil', credit: 'Gareth Milner', license: 'CC BY 2.0', source: 'https://commons.wikimedia.org/wiki/File:A.jpg' }] });
  const models = new Map([['assets/book/models/mosi-skeleton.glb', { credit: 'Smithsonian Institution', license: 'CC0', source: 'https://3d.si.edu/object/3d/x' }]]);
  const card = {
    id: 'mosi', name: 'Mosi',
    pages: [1, 2].map(n => ({ image: 'hatcher', text: `Texti ${n}.`, audio: `book_mosi_${n}`, sources: ['heimild'], model: n === 1 ? 'assets/book/models/mosi-skeleton.glb' : null })),
  };
  const viewer = createCardViewer(doc, root, { audio: { sfx() {}, stop() {}, narrate: () => DONE }, zoom, media, models, skeleton: view });
  const figure = root.findAll(e => e.classList.contains('card-image'))[0];
  const credit = root.findAll(e => e.classList.contains('card-credit'))[0];
  const words = () => credit.children.map(row => row.children.map(part => part.textContent).join(' ')).join(' / ');

  viewer.open(card, null, 0);
  assert.match(words(), /Mynd Gareth Milner/, 'before the model is on, the ⓘ is the photo\'s');
  await flush();
  assert.match(words(), /Líkan Smithsonian Institution \/ Leyfi CC0 \/ Frá 3d\.si\.edu/, 'with the model on, the ⓘ names the model\'s maker, its licence and where it is from');
  view.onTap();
  assert.equal(zoomed.length, 1, 'a tap on the model takes it to the whole screen');
  assert.equal(zoomed[0].canvas, canvas, 'its own canvas, as it is');
  view.onTap();
  assert.equal(zoomed.length, 1, 'a tap on the model at full screen does not open it again (the zoom shuts it)');
  zoom.isOpen = false;
  zoomed[0].back();
  assert.equal(mounts.at(-1), figure, 'and when the zoom is shut the canvas goes back to the card\'s photo');
  viewer.next();
  assert.match(words(), /Mynd Gareth Milner/, 'the next page, which has no model, has the photo\'s ⓘ again');
  view.onTap();
  assert.equal(zoomed.length, 1, 'and a tap where no model shows takes nothing to the screen');
  viewer.close(true);

  modelShows = false; // no WebGL: the picture stays, and so does its ⓘ
  viewer.open(card, null, 0);
  await flush();
  assert.match(words(), /Mynd Gareth Milner/);
  view.onTap();
  assert.equal(zoomed.length, 1, 'a model that cannot show is never taken to the screen');
  viewer.close(true);
});

test('the zoom carries a model\'s canvas to the whole screen: a finger that turns it keeps it there, a tap or the close puts it back', () => {
  const doc = new FakeDocument(['book']);
  const root = doc.getElementById('book');
  const zoom = createZoom(doc, { root, win: null });
  const layer = root.findAll(e => e.classList.contains('zoom'))[0];
  const frame = root.findAll(e => e.classList.contains('zoom-frame'))[0];
  const home = doc.createElement('figure');
  const canvas = doc.createElement('canvas');
  canvas.rect = { left: 100, top: 80, width: 400, height: 300 };
  home.append(canvas);
  let backs = 0;
  const back = () => { backs++; home.append(canvas); };
  const press = (type, x, id = 1) => layer.dispatchEvent(pointerEvent(type, { id, x, y: 100 }));

  assert.equal(zoom.openModel(canvas, back), true);
  assert.equal(layer.hidden, false, 'the zoom shows');
  assert.equal(canvas.parentNode, frame, 'with the canvas on its mat');
  assert.ok(frame.classList.contains('model'), 'in place of a picture');
  assert.equal(frame.style['--ratio'], '400 / 300', 'in the shape the canvas had on the card');
  press('pointerdown', 100);
  press('pointermove', 160);
  press('pointerup', 160);
  assert.equal(zoom.isOpen, true, 'a finger that turns the model does not shut it');
  assert.equal(frame.style.transform, undefined, 'nor moves the mat');
  press('pointerdown', 100, 2);
  press('pointerup', 100, 2);
  assert.equal(zoom.isOpen, false, 'a tap shuts it');
  assert.equal(backs, 1, 'and the canvas is let go back to its card');
  assert.equal(canvas.parentNode, home);
  assert.ok(!frame.classList.contains('model'));

  const img = doc.createElement('img');
  img.src = 'a.jpg';
  assert.equal(zoom.open(img), true, 'a picture zooms as before');
  assert.ok(!frame.classList.contains('model'));
  zoom.close(true);
  assert.equal(zoom.openModel(canvas, back), true);
  assert.equal(zoom.close(true), true, 'the book shut with the model at full screen');
  assert.equal(backs, 2, 'still puts the canvas back');
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
  assert.deepEqual(frog.unlock, { found: 'frog' }, 'the frog in the Fen opens the frog\'s card, as the forest\'s frog does');
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
  assert.equal(journal.addFinding('frog', null, { again: true }), true, 'found again in a new place (the Fen)');
  assert.equal(flights.length, 1, 'its picture flies');
  assert.deepEqual(save.get().findings, ['frog'], 'and nothing more is saved');
  journal.update(FLIGHT_SECONDS + 0.1);
  assert.deepEqual(sounds, ['newAnimal'], 'it lands with the book\'s bell');
  assert.equal(doc.getElementById('journal-badge').hidden, false, 'and the badge, for its new page');
  assert.equal(journal.addFinding('frog', null, { again: true }), false, 'once: a second tap on it flies nothing');
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
