import test from 'node:test';
import assert from 'node:assert/strict';
import { pressable, reducedMotion, TAP_SLOP_PX } from '../engine/book/fx.js';
import { FakeDocument, pointerEvent } from './fake-dom.mjs';

// Touch in the book (engine/book/fx.js), as chapter 1 counts it: a press let go within 12 px is a tap, however long it was
// held, every finger counts on its own, and every tap answers with a squash, a sparkle and a sound.

/** A window whose prefers-reduced-motion is `reduce` or not. */
const windowWith = reduce => ({ matchMedia: query => ({ matches: reduce && query === '(prefers-reduced-motion: reduce)' }) });

/** A control on a page, made pressable, with what it played and the taps it heard. */
function rig({ reduce = false } = {}) {
  const doc = new FakeDocument();
  const el = doc.createElement('button');
  el.rect = { left: 100, top: 100, width: 120, height: 90 };
  doc.body.append(el);
  const sounds = [];
  const taps = [];
  const dispose = pressable(el, { audio: { sfx: name => { sounds.push(name); return true; } }, onTap: event => taps.push(event), win: windowWith(reduce) });
  const finger = (type, options) => el.dispatchEvent(pointerEvent(type, options));
  const sparks = () => doc.body.findAll(e => e.classList.contains('book-spark'));
  return { el, sounds, taps, finger, sparks, dispose };
}

test('a press let go within 12 px is a tap, with its sound and a sparkle', () => {
  const { sounds, taps, finger, sparks } = rig();
  finger('pointerdown', { id: 1, x: 150, y: 140 });
  finger('pointermove', { id: 1, x: 150 + TAP_SLOP_PX - 1, y: 140 });
  finger('pointerup', { id: 1, x: 150 + TAP_SLOP_PX - 1, y: 140 });
  assert.equal(taps.length, 1);
  assert.equal(taps[0].type, 'pointerup', 'the tap hears the finger that lifted');
  assert.deepEqual(sounds, ['tap']);
  assert.equal(sparks().length, 8, 'eight sparks burst round the control');
  for (const spark of sparks()) spark.dispatchEvent(new Event('animationend'));
  assert.equal(sparks().length, 0, 'and are gone once they have faded');
});

test('a finger that moves 12 px is not a tap', () => {
  const { el, sounds, taps, finger, sparks } = rig();
  finger('pointerdown', { id: 1, x: 150, y: 140 });
  finger('pointermove', { id: 1, x: 150, y: 140 + TAP_SLOP_PX });
  assert.equal(el.classList.contains('pressed'), false, 'it springs back as the finger moves on');
  finger('pointerup', { id: 1, x: 150, y: 141 }); // and lifts back near where it landed
  assert.equal(taps.length, 0);
  assert.deepEqual(sounds, []);
  assert.equal(sparks().length, 0);
});

test('a resting thumb does not stop another finger\'s tap', () => {
  const { taps, finger } = rig();
  finger('pointerdown', { id: 1, x: 104, y: 180 }); // the thumb holding the tablet, still
  finger('pointerdown', { id: 2, x: 160, y: 140 });
  finger('pointerup', { id: 2, x: 163, y: 142 });
  assert.equal(taps.length, 1, 'one tap');
  assert.equal(taps[0].pointerId, 2, 'the finger\'s, not the thumb\'s');
});

test('a press shows pressed and springs back on release or cancel', () => {
  const { el, finger } = rig();
  const pressed = () => el.classList.contains('pressed');
  finger('pointerdown', { id: 1, x: 150, y: 140 });
  assert.equal(pressed(), true, 'squashed while the finger is down');
  finger('pointerup', { id: 1, x: 150, y: 140 });
  assert.equal(pressed(), false, 'and springs back when it lifts');
  finger('pointerdown', { id: 1, x: 150, y: 140 });
  finger('pointercancel', { id: 1 });
  assert.equal(pressed(), false, 'or when the touch is cancelled');
  finger('pointerdown', { id: 1, x: 150, y: 140 });
  finger('pointerdown', { id: 2, x: 170, y: 150 });
  finger('pointerup', { id: 2, x: 170, y: 150 });
  assert.equal(pressed(), true, 'held while any finger still presses');
});

test('reduced motion swaps the squash and burst for a fade and keeps the sound', () => {
  const { el, sounds, finger, sparks } = rig({ reduce: true });
  finger('pointerdown', { id: 1, x: 150, y: 140 });
  assert.equal(el.classList.contains('pressed'), false, 'no squash');
  assert.equal(el.classList.contains('pressed-fade'), true, 'a fade instead');
  finger('pointerup', { id: 1, x: 150, y: 140 });
  assert.equal(el.classList.contains('pressed-fade'), false);
  assert.ok(sparks().length > 0, 'still a sparkle');
  assert.ok(sparks().every(spark => spark.classList.contains('fade') && spark.style['--dx'] === undefined), 'that fades where it is, with no burst');
  assert.deepEqual(sounds, ['tap'], 'and the same sound');
  assert.equal(reducedMotion({}), false, 'a window that cannot say asks for nothing');
});

test('dispose removes the listeners', () => {
  const { el, taps, finger, dispose } = rig();
  finger('pointerdown', { id: 1, x: 150, y: 140 });
  dispose();
  assert.equal(el.classList.contains('pressed'), false, 'nothing is left squashed');
  finger('pointerup', { id: 1, x: 150, y: 140 });
  finger('pointerdown', { id: 2, x: 150, y: 140 });
  finger('pointerup', { id: 2, x: 150, y: 140 });
  assert.equal(taps.length, 0);
});
