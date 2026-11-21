import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { onTable } from '../engine/table3d.js';
import { SCREEN, SCREEN_KEY, screenSize, tablePage, tableKnobs } from '../engine/table-stage.js';
import { wholeScreen, isWholeScreen, giveBackScreen, tableStart } from '../engine/table-ui.js';
import { BOOK_3D } from '../engine/book/videos.js';
import { SCALE, POND, LILIES, FROG, BUTTERFLY, KEYS, keyIndex, under } from '../chapters/tjorn3d/keys.js';

// Uggeðla í tjörninni, step 1 (chapters/tjorn3d.js): the key frames as data, and what the two table pages share that no page can
// be asked for without a browser (the screen's size, remembered). The pictures themselves are measured in the browser
// (tools/tjorn3d-probe.mjs); the table's geometry is tested in bord3d.test.mjs.

const close = (a, b, eps, message) => assert.ok(Math.abs(a - b) <= eps, `${message ?? ''} ${a} is not ${b} (within ${eps})`);
const EYE = { x: 0, y: 45 * Math.SQRT1_2, z: 45 * Math.SQRT1_2 }; // the eye between the two, cm: 45 cm from the centre at 45 degrees

test('the keys come in the plan\'s order, and key 4 is three heights of her head', () => {
  assert.deepEqual(KEYS.map(k => k.id), ['1', '2', '3', '4a', '4b', '4c', '5', '6']);
  assert.deepEqual(KEYS.map(k => k.name), ['Kyrr tjörn', 'Skugginn', 'Seglið', 'Höfuðið', 'Höfuðið', 'Höfuðið', 'Fiskurinn', 'Fiðrildið']);
  const heads = KEYS.filter(k => k.id.startsWith('4'));
  assert.deepEqual(heads.map(k => k.her.rise), [{ of: 'head', cm: 5 }, { of: 'head', cm: 6.5 }, { of: 'head', cm: 8 }]);
  for (const k of heads) {
    assert.equal(k.her.heading, 90, 'she faces the viewer');
    assert.equal(k.her.look, 'eye', 'and looks up at him');
    assert.equal(k.says, 'head');
  }
});

test('an address opens a key: lykill=4b is 4b, a bare 4 is 4a, anything else the first', () => {
  const id = value => KEYS[keyIndex(value)].id;
  assert.equal(id('4b'), '4b');
  assert.equal(id(' 4C '), '4c');
  assert.equal(id('4'), '4a');
  assert.equal(id('6'), '6');
  assert.equal(id(null), '1');
  assert.equal(id(''), '1');
  assert.equal(id('9'), '1');
});

test('the scale is in the range the brief gave, and the pond is no deeper than the plan lets it be', () => {
  assert.ok(SCALE >= 0.5 && SCALE <= 0.7, `1 cm is ${SCALE} m`);
  assert.ok(POND.bed <= 15);
  assert.ok(POND.radius / SCALE > 60, 'the bank is far outside any page'); // cm on the table
  for (const key of KEYS) for (const f of key.fish) assert.ok(f.depth > 0 && f.depth < POND.bed, `key ${key.id}: a fish ${f.depth} cm under`);
});

test('what is under the water is put where its picture is to lie: the deeper, the farther from the viewer', () => {
  for (const [seen, depth] of [[[3, -2], 6], [[-8.8, 4.6], 2], [[0, 0], 14]]) {
    const [x, y, z] = under(seen, depth, EYE);
    assert.equal(y, -depth);
    const drawn = onTable(EYE, x, y, z);
    close(drawn[0], seen[0], 1e-9);
    close(drawn[1], seen[1], 1e-9);
  }
  const shallow = under([0, 0], 2, EYE), deep = under([0, 0], 12, EYE);
  assert.ok(deep[2] < shallow[2] && shallow[2] < 0);
  close(deep[2], -12, 1e-9, 'at 45 degrees a thing seen in the middle is as far back as it is deep');
});

test('every fish is seen inside the page of a 10.5 inch tablet, 16:10 or 4:3', () => {
  for (const key of KEYS) {
    for (const f of key.fish) {
      assert.ok(Math.abs(f.seen[0]) + f.size / 2 < 21.3 / 2 + 0.01, `key ${key.id}: a fish seen at x ${f.seen[0]}`);
      assert.ok(Math.abs(f.seen[1]) + f.size / 2 < 14.1 / 2 + 0.01, `key ${key.id}: a fish seen at z ${f.seen[1]}`);
    }
  }
});

test('the lilies float at the sides, clear of the middle where she comes up, and the frog and the butterfly have one each', () => {
  for (const l of LILIES) assert.ok(Math.abs(l.at[0]) >= 5, `a lily at x ${l.at[0]}`);
  assert.ok(LILIES[FROG.lily] && LILIES[BUTTERFLY.lily] && FROG.lily !== BUTTERFLY.lily);
});

test('the keys say what the plan says of them', () => {
  const key = id => KEYS[keyIndex(id)];
  assert.equal(key('1').her, null, 'key 1: the pond alone');
  assert.ok(KEYS.slice(1).every(k => k.her), 'she is in every other key');
  assert.equal(key('2').her.sink > 12, true, 'key 2: she is deep down');
  assert.ok(key('2').snoutBubbles.length > 0, 'key 2: bubbles rise');
  assert.deepEqual(key('3').her.rise.of, 'all', 'key 3: the sail is what stands');
  assert.ok(key('3').her.rise.cm >= 3 && key('3').her.rise.cm <= 4, 'key 3: 3 to 4 cm of it');
  assert.ok(key('5').jump && key('5').her.strike === 'fish' && key('5').her.jaw > 0, 'key 5: the fish in the air, her head at it, her jaw open');
  assert.ok(Math.abs(key('5').jump.at[1] - 5) <= 0.5, 'key 5: the fish about 5 cm up');
  assert.equal(key('6').butterfly, 'snout');
  assert.ok(KEYS.filter(k => k.id !== '6').every(k => k.butterfly === 'lily'));
  // what animals do shows on the water: every key has rings, none oftener than a ring lives, no more than the water has room for
  for (const k of KEYS) {
    const rows = [...(k.rings ?? []), ...(k.neckRings ?? [])];
    assert.ok(rows.length + (k.snoutBubbles ?? []).length >= 1, `key ${k.id} has rings`);
    assert.ok(rows.length + (k.snoutBubbles ?? []).length <= 6, `key ${k.id} has at most six ring sources`);
    for (const row of rows) assert.ok(row[3] >= 2.6, `key ${k.id}: a ring every ${row[3]} s`);
    for (const row of k.snoutBubbles ?? []) assert.ok(row[2] >= 2.6);
  }
});

test('the screen\'s size is remembered on the device, one size for both table pages; the address wins and is not written down', () => {
  const kept = new Map();
  const storage = { getItem: k => (kept.has(k) ? kept.get(k) : null), setItem: (k, v) => { kept.set(k, String(v)); } };
  const from = query => screenSize(new URLSearchParams(query), storage);

  assert.equal(from('').inches, SCREEN.inches, 'nothing kept: 10.5');
  const size = from('');
  assert.equal(size.step(1), 11);
  assert.equal(kept.get(SCREEN_KEY), '11');
  assert.equal(from('').inches, 11, 'the next visit (this page or Mosi\'s) starts from it');

  const asked = from('skjar=8');
  assert.equal(asked.inches, 8);
  assert.equal(asked.fromAddress, true);
  assert.equal(kept.get(SCREEN_KEY), '11', 'the address\'s size is not kept');
  assert.equal(from('').inches, 11);

  for (let i = 0; i < 40; i++) size.step(1);
  assert.equal(size.inches, SCREEN.max);
  for (let i = 0; i < 40; i++) size.step(-1);
  assert.equal(size.inches, SCREEN.min);
  assert.equal(kept.get(SCREEN_KEY), String(SCREEN.min));

  kept.set(SCREEN_KEY, '"rugl"');
  assert.equal(from('').inches, SCREEN.inches, 'a kept value that is no size is not taken');
  kept.set(SCREEN_KEY, '99');
  assert.equal(from('').inches, SCREEN.inches);
  assert.equal(screenSize(new URLSearchParams(''), null).inches, SCREEN.inches, 'no storage at all: 10.5, and a step still works');
  assert.equal(screenSize(new URLSearchParams(''), null).step(-1), 10);
});

test('the page in centimetres, and the seat\'s knobs', () => {
  const page = tablePage({ innerWidth: 1280, innerHeight: 800, screen: { width: 1280, height: 800 } }, 10.5);
  close(page.W, 22.62, 0.01);
  close(page.Hs, 14.13, 0.01);
  const flat = tablePage({ innerWidth: 1024, innerHeight: 768, screen: { width: 1024, height: 768 } }, 10.5);
  close(flat.W, 21.34, 0.01);
  close(flat.Hs, 16.0, 0.01);
  const knobs = tableKnobs(new URLSearchParams('sjon=1&fjarlaegd=50'));
  assert.deepEqual(knobs.seat, { R: 50, a: 45, ipd: 5.8 });
  assert.equal(knobs.mode, 'sjon');
  assert.equal(tableKnobs(new URLSearchParams('gler=0')).mode, 'mono');
  assert.equal(tableKnobs(new URLSearchParams('')).mode, 'gler');
});

test('the tap that starts a table page asks for the whole screen: once, not when the page has it, and a refusal is no error', async () => {
  const page = ({ can = true, whole = false, refuse = false, old = false } = {}) => {
    const doc = { asked: [], fullscreenElement: whole ? {} : null, documentElement: {} };
    const ask = options => { doc.asked.push(options); return refuse ? Promise.reject(new Error('no')) : Promise.resolve(); };
    if (can) doc.documentElement[old ? 'webkitRequestFullscreen' : 'requestFullscreen'] = ask;
    return doc;
  };
  let doc = page();
  assert.equal(await wholeScreen(doc), true);
  assert.deepEqual(doc.asked, [{ navigationUI: 'hide' }]);
  doc = page({ whole: true });
  assert.equal(isWholeScreen(doc), true);
  assert.equal(await wholeScreen(doc), false);
  assert.equal(doc.asked.length, 0, 'it has the whole screen: nothing is asked');
  assert.equal(await wholeScreen(page({ can: false })), false, 'a browser without it');
  assert.equal(await wholeScreen(page({ refuse: true })), false, 'a refusal is an answer, not an error');
  assert.equal(await wholeScreen(page({ old: true })), true, 'the older name');
  assert.equal(await wholeScreen(null), false);

  // the glasses' button, or Byrja when the glasses' picture did not load
  const button = () => ({ taps: [], addEventListener(type, fn, options) { this.taps.push([type, fn, options]); } });
  const glasses = { element: {}, button: button() };
  doc = page();
  assert.equal(await tableStart(doc, Promise.resolve(glasses)), glasses, 'the start is handed on as it is');
  assert.equal(glasses.button.taps.length, 1);
  assert.equal(glasses.button.taps[0][0], 'click');
  glasses.button.taps[0][1]();
  assert.equal(doc.asked.length, 1, 'the tap asks');
  const byrja = button();
  doc = Object.assign(page(), { getElementById: id => (id === 'start' ? byrja : null) });
  assert.equal(await tableStart(doc, Promise.resolve(null)), null);
  byrja.taps[0][1]();
  assert.equal(doc.asked.length, 1, 'Byrja asks as well');
});

test('the whole screen is given back when the page took it, and left alone when it did not; an app shown whole is not asked', async () => {
  const page = ({ whole = 'none', can = true, refuse = false, old = false, shown = false } = {}) => {
    const root = {};
    const doc = { left: 0, asked: 0, documentElement: root, fullscreenElement: whole === 'mine' ? root : whole === 'other' ? {} : null };
    if (can) doc[old ? 'webkitExitFullscreen' : 'exitFullscreen'] = () => { doc.left++; return refuse ? Promise.reject(new Error('no')) : Promise.resolve(); };
    root.requestFullscreen = () => { doc.asked++; return Promise.resolve(); };
    doc.defaultView = { matchMedia: query => ({ matches: shown && query === '(display-mode: fullscreen)' }) };
    return doc;
  };
  let doc = page({ whole: 'mine' });
  assert.equal(await giveBackScreen(doc), true, 'the root of the page fills the screen: its own taking, given back');
  assert.equal(doc.left, 1);
  doc = page({ whole: 'other' });
  assert.equal(await giveBackScreen(doc), false, 'something else of the page fills the screen: not what the start took');
  assert.equal(doc.left, 0);
  doc = page();
  assert.equal(await giveBackScreen(doc), false, 'nothing was taken (refused, or the book round the frame has the whole screen itself)');
  assert.equal(doc.left, 0);
  assert.equal(await giveBackScreen(page({ whole: 'mine', can: false })), false, 'a browser that cannot');
  assert.equal(await giveBackScreen(page({ whole: 'mine', refuse: true })), false, 'a refusal is an answer, not an error');
  assert.equal(await giveBackScreen(page({ whole: 'mine', old: true })), true, 'the older name');
  assert.equal(await giveBackScreen(null), false);

  // the installed app (manifest.webmanifest: display fullscreen), or a browser or a book that is whole-screen already: the
  // page has the whole screen, asks for nothing, and so has nothing to give back
  doc = page({ shown: true });
  assert.equal(isWholeScreen(doc), true);
  assert.equal(await wholeScreen(doc), false);
  assert.equal(doc.asked, 0);
  assert.equal(await giveBackScreen(doc), false);
  assert.equal(doc.left, 0, 'the whole screen of the app is left alone');
  assert.equal(JSON.parse(fs.readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8')).display, 'fullscreen');
  doc = page();
  assert.equal(isWholeScreen(doc), false);
  assert.equal(await wholeScreen(doc), true, 'a page in a tab of a browser asks');
});

test('the show: its tile in the book, the last under "3D myndbönd", with a picture of the show itself; "Hætta" gives the whole screen back and leaves', () => {
  const tile = BOOK_3D.find(entry => entry.id === 'tjorn3d');
  assert.ok(tile, 'the pond show has a tile');
  assert.equal(BOOK_3D.at(-1), tile, 'after the four shows that were there');
  assert.equal(tile.chapter, 'tjorn3d', 'the tile plays the chapter of the show (show-player.js: ?chapter=tjorn3d&syning=1, from the glasses)');
  assert.deepEqual(tile.unlock, { start: true }, 'open from the start, as the other shows');
  const source = fs.readFileSync(new URL('../chapters/tjorn3d.js', import.meta.url), 'utf8');
  // the name is a working one, said in two places only: the tile's and the chapter's own title
  assert.equal(tile.title, tile.name);
  assert.equal(source.match(/^  title: '([^']+)',$/m)?.[1], tile.title, 'the chapter is called what its tile is called');
  assert.ok(tile.label.startsWith(`${tile.name}, `) && /á borði/.test(tile.label) && /flatur/.test(tile.label) && tile.label.endsWith('með rauðum og bláum gleraugum'),
    'the label says it is watched on a table, the screen lying flat, with the glasses');
  assert.match(tile.hue, /^#[0-9a-f]{6}$/);
  assert.equal(new Set(BOOK_3D.map(entry => entry.hue)).size, BOOK_3D.length, 'its colour is no other show’s');
  // its picture: there, a WebP as the other shows' are, and the tool that makes it again writes that very file at their size
  assert.match(tile.poster, /tjorn3d-thumb\.webp$/);
  const picture = fs.readFileSync(new URL('../assets/book/videos/tjorn3d-thumb.webp', import.meta.url));
  assert.equal(picture.toString('latin1', 0, 4) + picture.toString('latin1', 8, 12), 'RIFFWEBP');
  assert.ok(picture.length > 3000 && picture.length < 45000, `the picture is ${picture.length} bytes`);
  const tool = fs.readFileSync(new URL('../tools/tjorn3d-tile.mjs', import.meta.url), 'utf8');
  assert.match(tool, /out: 'remake\/assets\/book\/videos\/tjorn3d-thumb\.webp'/);
  assert.match(tool, /size: \[640, 360\]/);
  // the show is the page without lykill= (the key page is a review tool, not for the book), and "Hætta" on its end card gives
  // the whole screen back before it leaves for the book
  assert.match(source, /const SHOW = params\.get\('lykill'\) === null;/);
  assert.match(source, /startButton: doc => tableStart\(doc, glassesStart\(doc, /, 'the glasses start it, and their tap asks for the whole screen');
  assert.match(source, /endCard\(doc, \{ onAgain: [^}]*\}, onQuit: \(\) => \{ sound\.end\(\); leaveShow\(win\); \} \}\)/, 'the end card: Aftur again; Hætta ends the sound and leaves');
  // and leaving is the chapter's own: the whole screen given back, then the book's way out (show-player.js)
  assert.match(source, /^import \{ leaveShow as leaveForBook \} from '\.\.\/engine\/book\/show-player\.js';$/m);
  assert.match(source, /^const leaveShow = win => \{ giveBackScreen\(win\?\.document\); return leaveForBook\(win\); \};$/m);
});
