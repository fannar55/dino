import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { guard } from '../engine/guard.js';

test('a guarded call that throws is said once, returns nothing, and is tried again every frame, so it can recover', () => {
  const told = [];
  const original = console.error;
  console.error = (...args) => told.push(args);
  try {
    let broken = true;
    let calls = 0;
    const update = guard('music', dt => {
      calls++;
      if (broken) throw new Error('the element is gone');
      return dt * 2;
    });
    assert.equal(update(1), undefined);
    assert.equal(update(1), undefined);
    assert.equal(told.length, 1, 'once, not every frame');
    assert.match(told[0].join(' '), /music/);
    assert.match(told[0].join(' '), /the element is gone/);
    broken = false;
    assert.equal(update(3), 6, 'it passes its arguments and its value through');
    assert.equal(calls, 3);
  } finally {
    console.error = original;
  }
});

test('main.js guards the music and the sound effects, which run before the actors, the camera and the forest', () => {
  const main = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
  assert.match(main, /import \{ guard \} from '\.\/engine\/guard\.js';/);
  assert.match(main, /const updateMusic = guard\('music', \(\) => music\.update\(\)\);/);
  assert.match(main, /const updateSfx = guard\('sfx', dt => sfx\.update\(dt\)\);/);
  const frame = main.slice(main.indexOf('function update(dt) {'), main.indexOf('function startScene()'));
  assert.match(frame, /updateMusic\(\);/);
  assert.match(frame, /updateSfx\(dt\);/);
  assert.doesNotMatch(frame, /\bmusic\.update\(\)|\bsfx\.update\(dt\)/, 'and calls them only through the guards');
});
