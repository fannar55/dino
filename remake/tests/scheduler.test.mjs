import test from 'node:test';
import assert from 'node:assert/strict';
import { createScheduler, wait, all, race, until } from '../engine/scene/scheduler.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

function runFrames(scheduler, dts) {
  for (const dt of dts) scheduler.update(dt);
}

test('chained waits keep exact deadlines whatever the frame timing', () => {
  for (const dt of [0.3, 1 / 60, 0.07, 0.5]) {
    const sched = createScheduler();
    const marks = [];
    sched.run((function* script() {
      for (let i = 0; i < 4; i++) {
        yield wait(0.5);
        marks.push(sched.now);
      }
    })());
    for (let i = 0; i < 400 && !sched.idle; i++) sched.update(dt);
    assert.equal(marks.length, 4);
    [0.5, 1, 1.5, 2].forEach((want, i) => assert.ok(close(marks[i], want), `dt ${dt}: mark ${i} was ${marks[i]}`));
  }
});

test('a script resumes on the frame after its deadline passes, not before', () => {
  const sched = createScheduler();
  let resumedAt = null;
  sched.run((function* script() {
    yield 1;
    resumedAt = sched.time;
  })());
  runFrames(sched, [0.4, 0.4]);
  assert.equal(resumedAt, null);
  sched.update(0.4);
  assert.ok(close(resumedAt, 1.2));
});

test('all() waits for every item and returns their values; race() cancels the losers', () => {
  const sched = createScheduler();
  const log = [];
  function* child(name, seconds) {
    try {
      yield wait(seconds);
      return name;
    } finally {
      log.push(`finally ${name}`);
    }
  }
  let together = null;
  let first = null;
  sched.run((function* script() {
    together = yield all(child('a', 1), child('b', 2));
    log.push(`all at ${sched.now}`);
    first = yield race(child('slow', 5), child('fast', 1));
    log.push(`race at ${sched.now}`);
  })());
  for (let i = 0; i < 100 && !sched.idle; i++) sched.update(0.25);
  assert.deepEqual(together, ['a', 'b']);
  assert.equal(first, 'fast');
  assert.deepEqual(log, ['finally a', 'finally b', 'all at 2', 'finally fast', 'finally slow', 'race at 3']);
});

test('a child generator hands its return value to the parent', () => {
  const sched = createScheduler();
  let got = null;
  function* ask() {
    yield wait(0.2);
    return 42;
  }
  sched.run((function* script() { got = yield ask(); })());
  runFrames(sched, [0.1, 0.1, 0.1]);
  assert.equal(got, 42);
});

test('handles resume the script when done and are cancelled with it', () => {
  const sched = createScheduler();
  const handle = { done: false, cancelled: false, cancel() { this.cancelled = true; this.done = true; } };
  let after = false;
  const task = sched.run((function* script() {
    yield handle;
    after = true;
  })());
  runFrames(sched, [0.1, 0.1]);
  assert.equal(after, false);
  task.cancel();
  assert.equal(handle.cancelled, true);
  assert.equal(after, false);

  const second = { done: false };
  sched.run((function* script() { yield second; after = true; })());
  sched.update(0.1);
  second.done = true;
  sched.update(0.1);
  assert.equal(after, true);
});

test('cancelAll runs finally blocks of every waiting script', () => {
  const sched = createScheduler();
  const cleaned = [];
  for (const name of ['one', 'two']) {
    sched.run((function* script() {
      try { yield wait(10); } finally { cleaned.push(name); }
    })());
  }
  sched.update(0.1);
  sched.cancelAll();
  assert.deepEqual(cleaned.sort(), ['one', 'two']);
  assert.equal(sched.idle, true);
});

test('errors in a child reach the parent, which can catch them', () => {
  const sched = createScheduler({ onError: () => {} });
  let caught = null;
  function* broken() {
    yield wait(0.1);
    throw new Error('boom');
  }
  sched.run((function* script() {
    try { yield broken(); } catch (error) { caught = error.message; }
  })());
  runFrames(sched, [0.1, 0.1]);
  assert.equal(caught, 'boom');
});

test('yielding something unknown throws back into the script', () => {
  const sched = createScheduler({ onError: () => {} });
  let caught = null;
  sched.run((function* script() {
    try { yield Symbol('nope'); } catch (error) { caught = error.constructor.name; }
  })());
  sched.update(0.1);
  assert.equal(caught, 'TypeError');
});

test('promises and until() resume when they are satisfied', async () => {
  const sched = createScheduler();
  let flag = false;
  const order = [];
  sched.run((function* script() {
    const value = yield Promise.resolve('tap');
    order.push(value);
    yield until(() => flag);
    order.push('flag');
  })());
  sched.update(0.1);
  await Promise.resolve();
  sched.update(0.1);
  assert.deepEqual(order, ['tap']);
  flag = true;
  sched.update(0.1);
  assert.deepEqual(order, ['tap', 'flag']);
});

test('yield with nothing waits exactly one frame', () => {
  const sched = createScheduler();
  const frames = [];
  sched.run((function* script() {
    for (let i = 0; i < 3; i++) {
      frames.push(sched.frame);
      yield;
    }
  })());
  runFrames(sched, [0.1, 0.1, 0.1, 0.1]);
  assert.deepEqual(frames, [1, 2, 3]);
});

test('already-finished handles between waits add no drift', () => {
  const done = { done: true };
  for (const dt of [1 / 60, 0.07]) {
    const sched = createScheduler();
    const marks = [];
    sched.run((function* script() {
      for (let i = 0; i < 6; i++) {
        yield wait(0.5);
        yield done;
        marks.push(sched.now);
      }
    })());
    for (let i = 0; i < 400 && !sched.idle; i++) sched.update(dt);
    marks.forEach((m, i) => assert.ok(close(m, 0.5 * (i + 1)), `dt ${dt}: ${m}`));
  }
});

test('race() picks the earliest finisher even when both finish in one long frame', () => {
  const sched = createScheduler();
  let winner = null;
  let resumed = null;
  function* after(name, seconds) { yield wait(seconds); return name; }
  sched.run((function* script() {
    winner = yield race(after('later', 0.08), after('sooner', 0.05));
    resumed = sched.now;
  })());
  sched.update(0.1);
  assert.equal(winner, 'sooner');
  assert.ok(close(resumed, 0.05));
});

test('a throwing until() predicate reaches the script instead of the frame loop', () => {
  const sched = createScheduler({ onError: () => {} });
  let caught = null;
  sched.run((function* script() {
    try { yield until(() => { throw new Error('no such actor'); }); } catch (error) { caught = error.message; }
  })());
  assert.doesNotThrow(() => sched.update(0.1));
  assert.equal(caught, 'no such actor');
});

test('edge cases: empty race, NaN waits, falsy errors, fail-fast all, yield in finally', async () => {
  const sched = createScheduler({ onError: () => {} });
  const log = [];
  sched.run((function* script() {
    log.push(['race', yield race()]);
    try { yield NaN; } catch (error) { log.push(['nan', error.constructor.name]); }
    try { yield Promise.reject(); } catch (error) { log.push(['reject', error]); }
    function* boom() { yield wait(0.1); throw undefined; } // eslint-disable-line no-throw-literal
    try { yield all(wait(9), boom()); } catch (error) { log.push(['all', error, sched.now]); }
  })());
  sched.update(0.05);
  await Promise.resolve();
  for (let i = 0; i < 10; i++) sched.update(0.05);
  assert.deepEqual(log.slice(0, 3), [['race', undefined], ['nan', 'TypeError'], ['reject', undefined]]);
  assert.equal(log[3][0], 'all');
  assert.equal(log[3][1], undefined);
  assert.ok(log[3][2] < 1, `all failed at ${log[3][2]}`);

  const cleaned = [];
  const task = sched.run((function* script() {
    try { yield wait(5); } finally { cleaned.push('start'); yield wait(1); cleaned.push('end'); }
  })());
  sched.update(0.1);
  task.cancel();
  assert.deepEqual(cleaned, ['start', 'end']);
});

test('frames where time does not move resume nothing', () => {
  const sched = createScheduler();
  let steps = 0;
  sched.run((function* script() { for (;;) { steps++; yield; } })());
  sched.update(0.1);
  for (let i = 0; i < 30; i++) sched.update(0);
  assert.equal(steps, 1);
});

test('start() runs something now, from the script time, and hands back its value', () => {
  const sched = createScheduler();
  const log = [];
  sched.run((function* script() {
    yield wait(0.25);
    const line = sched.start((function* say() { log.push(['line', sched.now]); yield wait(1); return 'said'; })());
    yield wait(0.5);
    log.push(['meanwhile', sched.now]);
    log.push(['result', yield line, sched.now]);
  })());
  for (let i = 0; i < 40; i++) sched.update(0.1);
  assert.ok(close(log[0][1], 0.25));
  assert.ok(close(log[1][1], 0.75));
  assert.equal(log[2][1], 'said');
  assert.ok(close(log[2][2], 1.25));
});

test('pending counts promises a script waits on', async () => {
  const sched = createScheduler();
  let release;
  sched.run((function* script() { yield new Promise(resolve => { release = resolve; }); })());
  sched.update(0.1);
  assert.equal(sched.pending, 1);
  release();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(sched.pending, 0);
});

test('a promise wait that is cancelled (it lost a race) is no longer pending, and settling later changes nothing', async () => {
  const sched = createScheduler();
  let release;
  let reject;
  const choice = () => new Promise(resolve => { release = resolve; }); // a choice nobody makes
  sched.run((function* script() {
    yield race(choice(), wait(0.5)); // the timer wins and the choice is cancelled
    yield race(new Promise((resolve, fail) => { reject = fail; }), wait(0.5));
  })());
  sched.update(0.1);
  assert.equal(sched.pending, 1, 'the choice is waited on');
  for (let i = 0; i < 6; i++) sched.update(0.1);
  assert.equal(sched.pending, 1, 'the first race is over, its promise no longer counts; the second race waits on its own');
  for (let i = 0; i < 6; i++) sched.update(0.1);
  assert.equal(sched.pending, 0, 'so a seek does not wait on promises nobody waits for');
  assert.equal(sched.idle, true);
  release('yes'); // the child taps after all, long after
  reject(new Error('too late'));
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(sched.pending, 0, 'and the late settling does not count them off twice');

  const seen = createScheduler();
  let open;
  seen.run((function* script() { yield new Promise(resolve => { open = resolve; }); })());
  seen.update(0.1);
  open();
  await Promise.resolve();
  seen.cancelAll(); // settled, but not yet resumed: cancelled now, it must not count itself off again
  assert.equal(seen.pending, 0);
});
