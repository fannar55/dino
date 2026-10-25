// The bug report tool's pure parts (engine/villa/skyrsla.js) and the console ring it reads (engine/console-log.js). The overlay
// itself is a browser matter; the dev server's filing of a report is in serve.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { installConsoleLog, describe } from '../engine/console-log.js';
import { buildReport, boxToImage, fileStamp, folderName, normalizeBox, section, snapshotHtml } from '../engine/villa/skyrsla.js';

/** A console and a window of the test's own. */
function fakes() {
  const said = [];
  const con = { log: (...a) => said.push(['log', a]), warn: (...a) => said.push(['warn', a]), error: (...a) => said.push(['error', a]) };
  const handlers = {};
  const win = { addEventListener: (type, fn) => { handlers[type] = fn; } };
  let t = 1000;
  return { con, win, said, handlers, now: () => (t += 10) };
}

test('the console ring keeps the last lines with their time and level, and the console still speaks', () => {
  const { con, win, said, handlers, now } = fakes();
  const ring = installConsoleLog({ limit: 3, con, win, now });
  con.log('one', 1, { a: [1, 2] });
  con.warn('two');
  con.error(new TypeError('three'));
  assert.deepEqual(said.map(([level]) => level), ['log', 'warn', 'error'], 'every line reached the browser console');
  const entries = ring.entries();
  assert.deepEqual(entries.map(e => [e.level, e.t]), [['log', 10], ['warn', 20], ['error', 30]]);
  assert.equal(entries[0].text, 'one 1 {"a":[1,2]}');
  assert.match(entries[2].text, /^TypeError: three/);
  handlers.error({ error: new Error('boom'), filename: 'http://x/remake/main.js', lineno: 12, colno: 3 });
  assert.equal(ring.entries().length, 3, 'the ring holds three');
  assert.deepEqual(ring.entries().map(e => e.level), ['warn', 'error', 'uncaught'], 'the oldest went');
  assert.match(ring.entries()[2].text, /^Error: boom.*\(main\.js:12:3\)$/);
  handlers.unhandledrejection({ reason: 'no' });
  assert.equal(ring.entries()[2].text, 'no');
  assert.equal(ring.entries()[2].level, 'unhandled');
  ring.clear();
  assert.deepEqual(ring.entries(), []);
});

test('describe says what a console argument is, and cuts long ones', () => {
  assert.equal(describe('x'), 'x');
  assert.equal(describe(undefined), 'undefined');
  assert.equal(describe(null), 'null');
  assert.equal(describe({ n: 1n }), '{"n":"1n"}');
  const loop = {}; loop.self = loop;
  assert.equal(describe(loop), '[object Object]', 'a circular object is named, not thrown at');
  assert.equal(describe('a'.repeat(700)).length, 601);
  assert.equal(describe(function named() {}), '[function named]');
});

test('a report section that throws costs only that section', () => {
  assert.deepEqual(section(() => 1), 1);
  assert.deepEqual(section(() => { throw new Error('no'); }), { error: 'no' });
  const report = buildReport({
    chapterId: 'kafli2',
    clock: () => ({ time: 12.3456, paused: true }),
    camera: () => ({ position: [1.23456, 2, 3], target: [0, 1, 0], fov: 40.04, mode: 'shot' }),
    actors: () => [{ name: 'mosi', position: [1.00004, 0, 2], heading: 90.04 }],
    save: () => { throw new Error('storage gone'); },
    consoleLog: () => [{ t: 1, level: 'log', text: 'hi' }],
    text: 'Fiðrildið svífur',
    boxes: [{ x: 1, y: 2, w: 3, h: 4 }],
  }, { now: new Date('2026-10-25T18:32:05Z') });
  assert.equal(report.time, '2026-10-25T18:32:05.000Z');
  assert.equal(report.chapter.id, 'kafli2');
  assert.deepEqual(report.chapter.clock, { time: 12.3456, paused: true });
  assert.deepEqual(report.camera, { position: [1.235, 2, 3], target: [0, 1, 0], fov: 40, mode: 'shot' });
  assert.deepEqual(report.actors, [{ name: 'mosi', position: [1, 0, 2], heading: 90 }]);
  assert.deepEqual(report.save, { error: 'storage gone' }, 'the broken section says so');
  assert.deepEqual(report.console, [{ t: 1, level: 'log', text: 'hi' }]);
  assert.equal(report.text, 'Fiðrildið svífur');
  assert.deepEqual(report.boxes, [{ x: 1, y: 2, w: 3, h: 4 }]);
  assert.equal(report.build, null, 'the server fills the build in');
  assert.equal(report.panels, null, 'a part not given is null, not missing');
});

test('boxes: a drag in any direction is one rectangle, and it scales to the screenshot', () => {
  assert.deepEqual(normalizeBox({ x: 10.4, y: 20 }, { x: 4, y: 30.6 }), { x: 4, y: 20, w: 6, h: 11 });
  assert.deepEqual(boxToImage({ x: 4, y: 20, w: 6, h: 11 }, { width: 100, height: 50 }, { width: 200, height: 100 }), { x: 8, y: 40, w: 12, h: 22 });
  assert.deepEqual(boxToImage({ x: 4, y: 20, w: 6, h: 11, view: { width: 50, height: 25 } }, { width: 100, height: 50 }, { width: 200, height: 100 }), { x: 16, y: 80, w: 24, h: 44 }, 'a box drawn in another view keeps its place in the picture');
});

test('the layers page shows the stylesheets, the layers and the screenshot behind them, at the view size', () => {
  const html = snapshotHtml({ width: 1280, height: 800, styles: ['/remake/style.css', '/remake/book.css'], bodyClass: 'playing', parts: ['<div id="caption">Hæ</div>'], note: 'two <layers>' });
  assert.match(html, /<link rel="stylesheet" href="\/remake\/style\.css">\n<link rel="stylesheet" href="\/remake\/book\.css">/);
  assert.match(html, /width: 1280px; height: 800px/);
  assert.match(html, /url\("skjaskot\.png"\)/);
  assert.match(html, /<body class="playing">/);
  assert.match(html, /<div id="caption">Hæ<\/div>/);
  assert.match(html, /<!-- two &lt;layers&gt; -->/, 'the note cannot end the comment or start a tag');
});

test('the folder is named by the time and the chapter, in file-safe characters', () => {
  const date = new Date(2026, 9, 25, 18, 32, 5);
  assert.equal(fileStamp(date), '2026-10-25_183205');
  assert.equal(folderName(date, 'kafli2'), '2026-10-25_183205-kafli2');
  assert.equal(folderName(date, '../Kafli 2/x'), '2026-10-25_183205-kafli2x');
  assert.equal(folderName(date, null), '2026-10-25_183205-leikur');
});
