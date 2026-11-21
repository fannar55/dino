// Chapter 6's help ladder (chapters/kafli6-help.js): the rungs at their seconds, halving, wrong taps, the game clock, the call's directions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHelp, callDirections, DIRECTIONS } from '../chapters/kafli6-help.js';

test('hint, name and auto come at their seconds, once each, in order', () => {
  const help = createHelp({ hint: 6, name: 12, auto: 18 }); help.want(100);
  assert.deepEqual([105.9, 106, 117.9, 118, 200].map(t => help.update(t)), [[], ['hint'], ['name'], ['auto'], []]);
});

test('a ladder with no name has two rungs: { hint: 8, auto: 16 } gives both at 16 s', () => {
  const help = createHelp({ hint: 8, auto: 16 }); help.want(0);
  assert.deepEqual(help.times, { hint: 8, auto: 16 });
  assert.deepEqual(help.update(16), ['hint', 'auto']);
  const again = createHelp({ hint: 8, auto: 16 }); again.want(0);
  assert.deepEqual([7.9, 8, 15.9, 16].map(t => again.update(t)), [[], ['hint'], [], ['auto']]);
});

test('once the help has done a step the waits are halved, and whole again when the child taps right', () => {
  const help = createHelp({ hint: 6, name: 12, auto: 18 }); help.want(0); help.update(18); help.done('auto');
  assert.deepEqual(help.times, { hint: 3, name: 6, auto: 9 });
  assert.equal(help.quick, true);
  help.want(20);
  assert.deepEqual([22.9, 23, 25.9, 26, 28.9, 29].map(t => help.update(t)), [[], ['hint'], [], ['name'], [], ['auto']]);
  help.done('auto');
  help.want(40); help.done('child');
  assert.deepEqual(help.times, { hint: 6, name: 12, auto: 18 });
  assert.equal(help.quick, false);
});

test('a wrong tap brings the hint forward and never moves auto', () => {
  const help = createHelp({ hint: 6, name: 12, auto: 18 }); help.want(0);
  assert.deepEqual([help.wrong(2), help.wrong(3)], ['hint', null]);
  assert.deepEqual([help.update(17.9), help.update(18)], [['name'], ['auto']]);
});

test('a wrong tap after the hint has come gives nothing, and one before a step is wanted gives nothing', () => {
  const help = createHelp({ hint: 6, auto: 12 });
  assert.equal(help.wrong(0), null);
  help.want(0); help.update(6);
  assert.equal(help.wrong(7), null);
  help.update(12); help.done('child');
  assert.equal(help.wrong(13), null);
});

test('time that does not pass holds the help', () => {
  const help = createHelp({ hint: 6, name: 12, auto: 18 }); help.want(0);
  for (let i = 0; i < 100; i++) assert.deepEqual(help.update(5), []);
  assert.deepEqual(help.update(5), []);
  assert.deepEqual(help.update(6), ['hint']);
  for (let i = 0; i < 100; i++) assert.deepEqual(help.update(6), []);
});

test('the directions: three of the three, never the same twice in a row, the same for the same seed, each first at least 40 times of 200 seeds', () => {
  assert.deepEqual(DIRECTIONS, ['left', 'ahead', 'right']);
  const firsts = { left: 0, ahead: 0, right: 0 };
  for (let s = 0; s < 200; s++) {
    const d = callDirections(`seed-${s}`);
    assert.equal(d.length, 3);
    assert.ok(d.every(x => DIRECTIONS.includes(x)));
    assert.ok(d.every((x, i) => i === 0 || x !== d[i - 1]), `no repeat: ${d}`);
    assert.deepEqual(callDirections(`seed-${s}`), d);
    firsts[d[0]]++;
  }
  for (const k of DIRECTIONS) assert.ok(firsts[k] >= 40, `${k} first only ${firsts[k]} times`);
  assert.equal(callDirections('x', 5).length, 5);
});
