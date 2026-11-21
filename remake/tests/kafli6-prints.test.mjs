// Chapter 6's giant footprints as a state machine (chapters/kafli6-prints.js): six prints counted in order, Mosi's number taking
// COUNT s, taps kept while he says it, wrong taps, the help at 8 and 16 s (4 and 8 s once Egill has found one), and the game clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrints, PRINT_HELP, COUNT } from '../chapters/kafli6-prints.js';

const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} is not ${b}`);
function run(prints, from, to, each = null, log = []) {
  for (let t = from; t <= to + 1e-9; t = Math.round((t + 0.1) * 1000) / 1000) {
    each?.(t);
    prints.update(t);
    log.push(...prints.events());
    if (prints.state().done) break;
  }
  return log;
}

test('the constants are the spec\'s', () => {
  assert.deepEqual(PRINT_HELP, { hint: 8, auto: 16 });
  assert.equal(COUNT, 1.6);
});

test('six prints are counted in order and done comes 1.6 s after the sixth', () => {
  const prints = createPrints();
  prints.start(0);
  const log = [...prints.events()];
  let t = 0;
  for (let i = 0; i < 6; i++) {
    assert.deepEqual(prints.state(), { next: i, waiting: true, done: false });
    t += 1;
    assert.deepEqual(prints.tap(i, t), { counted: true });
    log.push(...prints.events());
    t += COUNT;
    prints.update(t);
    log.push(...prints.events());
  }
  assert.deepEqual(log.filter(e => e.type === 'count').map(e => [e.index, e.by]), [0, 1, 2, 3, 4, 5].map(i => [i, 'child']));
  assert.deepEqual(log.filter(e => e.type === 'want').map(e => e.index), [0, 1, 2, 3, 4, 5]);
  const done = log.filter(e => e.type === 'done');
  assert.equal(done.length, 1);
  near(done[0].time, log.filter(e => e.type === 'count')[5].time + COUNT, 'done');
  assert.ok(prints.state().done);
  assert.deepEqual(prints.tap(5, t + 1), { counted: false });
  assert.deepEqual(prints.events(), []);
});

test('a child who taps nothing: Egill finds the first at 16 s and each after 8 s on; the help comes at 8 and 16 s', () => {
  const prints = createPrints();
  prints.start(0);
  const log = [...prints.events(), ...run(prints, 0, 400)];
  assert.ok(prints.state().done);
  const counts = log.filter(e => e.type === 'count');
  assert.equal(counts.length, 6);
  assert.ok(counts.every((c, i) => c.by === 'egill' && c.index === i));
  near(counts[0].time, 16, 'the first');
  const first = log.filter(e => e.type === 'help' && e.index === 0).map(e => [e.level, +e.time.toFixed(1)]);
  assert.deepEqual(first, [['hint', 8], ['auto', 16]]);
  // each after 8 s on from its want, which comes as Mosi ends the number before
  const wants = log.filter(e => e.type === 'want');
  for (let i = 1; i < 6; i++) {
    near(wants[i].time, counts[i - 1].time + COUNT, `want ${i}`);
    near(counts[i].time - wants[i].time, 8, `print ${i}`);
  }
  assert.ok(log.every((e, i) => i === 0 || e.time >= log[i - 1].time - 1e-9), 'events come in time order');
});

test('a tap on the cloud swirls there, counts nothing, and the next print glitters at once', () => {
  const prints = createPrints();
  prints.start(0); prints.events();
  assert.deepEqual(prints.tap(null, 2, [3, 4]), { counted: false });
  const log = prints.events();
  assert.deepEqual(log.map(e => e.type), ['swirl', 'help']);
  assert.deepEqual(log[0].where, [3, 4]);
  assert.deepEqual([log[1].level, log[1].index], ['hint', 0]);
  assert.deepEqual(prints.state(), { next: 0, waiting: true, done: false });
  // a print out of order also swirls and counts nothing
  assert.deepEqual(prints.tap(3, 3), { counted: false });
  assert.deepEqual(prints.events().map(e => e.type), ['swirl']);
  // and wrong taps never move auto: the print is still found at 16 s
  prints.update(15.9); assert.deepEqual(prints.events(), []);
  prints.update(16); assert.deepEqual(prints.events().map(e => e.type), ['help', 'count']);
});

test('the next print tapped while Mosi says a number is kept and counts as he ends', () => {
  const prints = createPrints();
  prints.start(0);
  prints.tap(0, 1); prints.events();
  assert.deepEqual(prints.tap(1, 1.5), { counted: true }); // kept
  assert.deepEqual(prints.events(), []);
  prints.update(2.5); assert.deepEqual(prints.events(), []);
  prints.update(2.6);
  const log = prints.events();
  assert.deepEqual(log.map(e => [e.type, e.index, e.by]), [['want', 1, undefined], ['count', 1, 'child']]);
  near(log[1].time, 2.6, 'counts as he ends');
  assert.deepEqual(prints.state(), { next: 2, waiting: false, done: false });
});

test('two taps on the next print while he says a number count one print, not two', () => {
  const prints = createPrints();
  prints.start(0);
  prints.tap(0, 1); prints.events();
  assert.deepEqual([prints.tap(1, 1.2), prints.tap(1, 1.4)], [{ counted: true }, { counted: false }]);
  prints.update(2.6);
  const log = prints.events();
  assert.equal(log.filter(e => e.type === 'count').length, 1);
  prints.update(4.2); // his second number ends: the third print is wanted, nothing was kept for it
  const rest = prints.events();
  assert.deepEqual(rest.map(e => [e.type, e.index]), [['want', 2]]);
});

test('a kept tap on the sixth print or a tap after the end does not outlive the task', () => {
  const prints = createPrints({ count: 2 });
  prints.start(0);
  prints.tap(0, 1); prints.tap(1, 1.2); // kept
  prints.update(2.6); // counts the second print
  prints.events();
  assert.deepEqual(prints.tap(2, 3), { counted: false }); // no third print: swirl only, nothing counts
  prints.update(4.2);
  assert.deepEqual(prints.events().filter(e => e.type !== 'swirl').map(e => e.type), ['done']);
});

test('time that does not pass holds both tasks', () => {
  const prints = createPrints();
  prints.start(0); prints.events();
  for (let i = 0; i < 100; i++) prints.update(7);
  assert.deepEqual(prints.events(), []);
  prints.update(8);
  assert.deepEqual(prints.events().map(e => e.level), ['hint']);
  for (let i = 0; i < 100; i++) prints.update(8);
  assert.deepEqual(prints.events(), []);
});
