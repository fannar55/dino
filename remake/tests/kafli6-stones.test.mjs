// Chapter 6's stepping stones as a state machine (chapters/kafli6-stones.js): five steps, right and wrong stones, taps in the air,
// the help at 6, 12 and 18 s (9 s once the help has hopped), and the game clock. The steps are a fixture of the route's shape
// (kafli6-route.js STEPS), passed explicitly so these tests do not depend on where the route puts its stones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStones, STONE_HELP } from '../chapters/kafli6-stones.js';

const LAND = 1.5; // s a hop takes
const SHAPE = [3, 2, 3, 2, 3];
const STEPS = SHAPE.map((n, s) => ({ stones: Array.from({ length: n }, (_, k) => ({ id: `stone-${s}-${k}`, at: [k, s], right: k === (s % n) })) }));
const rightOf = s => STEPS[s].stones.find(x => x.right).id;
const wrongOf = s => STEPS[s].stones.find(x => !x.right).id;
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} is not ${b}`);

/** Runs `stones` in 0.1 s steps from `from` to `to`; Mosi lands LAND s after every hop. `each(t)` runs before each update. */
function run(stones, from, to, each = null, log = []) {
  let landAt = null;
  for (let t = from; t <= to + 1e-9; t = Math.round((t + 0.1) * 1000) / 1000) {
    each?.(t);
    stones.update(t);
    const now = stones.events();
    for (const e of now) if (e.type === 'hop') landAt = Math.round((e.time + LAND) * 1000) / 1000;
    log.push(...now);
    if (landAt !== null && t >= landAt - 1e-9) {
      landAt = null;
      stones.landed(t);
      for (const e of stones.events()) log.push(e);
    }
    if (stones.state().done) break;
  }
  return log;
}

test('the help constants are the spec\'s', () => {
  assert.deepEqual(STONE_HELP, { hint: 6, name: 12, auto: 18 });
});

test('a child who taps nothing crosses on the help: the first hop at 18 s, each after 9 s on from its landing, all by Mosi; before the first, the glitter at 6 s and the name at 12 s', () => {
  const stones = createStones({ steps: STEPS });
  stones.start(0);
  const log = [...stones.events(), ...run(stones, 0, 400)];
  assert.ok(stones.state().done);
  const hops = log.filter(e => e.type === 'hop');
  assert.equal(hops.length, 5);
  assert.ok(hops.every((h, i) => h.by === 'mosi' && h.stone === rightOf(i) && h.step === i));
  near(hops[0].time, 18, 'first hop');
  for (let i = 1; i < 5; i++) near(hops[i].time - hops[i - 1].time, LAND + 9, `hop ${i} after the landing`);
  const help0 = log.filter(e => e.type === 'help' && e.step === 0).map(e => [e.level, +e.time.toFixed(1)]);
  assert.deepEqual(help0, [['hint', 6], ['name', 12], ['auto', 18]]);
  const help1 = log.filter(e => e.type === 'help' && e.step === 1).map(e => e.level);
  assert.deepEqual(help1, ['hint', 'name', 'auto']);
  assert.deepEqual(log.filter(e => e.type === 'want').map(e => e.step), [0, 1, 2, 3, 4]);
  assert.equal(log.filter(e => e.type === 'done').length, 1);
  assert.ok(log.every((e, i) => i === 0 || e.time >= log[i - 1].time - 1e-9), 'events come in time order');
});

test('a wrong stone wobbles, is not counted, the right one glitters at once, and the step is still wanted', () => {
  const stones = createStones({ steps: STEPS });
  stones.start(0); stones.events();
  const r = stones.tap(wrongOf(0), 2);
  assert.deepEqual(r, { counted: false });
  const log = stones.events();
  assert.deepEqual(log.map(e => e.type), ['wobble', 'help']);
  assert.equal(log[0].stone, wrongOf(0));
  assert.deepEqual([log[1].level, log[1].stone, log[1].step], ['hint', rightOf(0), 0]);
  assert.deepEqual(stones.state(), { step: 0, waiting: true, done: false });
  // a second wrong tap wobbles but the hint is not given twice
  stones.tap(wrongOf(0), 3);
  assert.deepEqual(stones.events().map(e => e.type), ['wobble']);
  // the right one still counts
  assert.deepEqual(stones.tap(rightOf(0), 4), { counted: true });
  const hop = stones.events();
  assert.deepEqual(hop.map(e => [e.type, e.by, e.stone]), [['hop', 'child', rightOf(0)]]);
});

test('a child who taps a wrong stone every 2 s for ever still crosses', () => {
  const stones = createStones({ steps: STEPS });
  stones.start(0);
  const log = [...stones.events()];
  run(stones, 0, 600, t => {
    if (stones.state().waiting && Math.abs(t / 2 - Math.round(t / 2)) < 1e-6) stones.tap(wrongOf(stones.state().step), t);
  }, log);
  assert.ok(stones.state().done);
  const hops = log.filter(e => e.type === 'hop');
  assert.ok(hops.every(h => h.by === 'mosi'));
  const wanted = log.filter(e => e.type === 'want');
  hops.forEach((h, i) => assert.ok(h.time - wanted[i].time <= 18 + 1e-6, `step ${i} took ${h.time - wanted[i].time} s`));
  assert.ok(log.filter(e => e.type === 'wobble').length > 20);
  assert.equal(log.filter(e => e.type === 'help' && e.level === 'hint').length, 5, 'the hint once a step');
});

test('a tap while Mosi is in the air does nothing; the next step is wanted only when he has landed', () => {
  const stones = createStones({ steps: STEPS });
  stones.start(0); stones.events();
  stones.tap(rightOf(0), 1);
  stones.events();
  assert.deepEqual(stones.state(), { step: 0, waiting: false, done: false });
  assert.deepEqual([stones.tap(rightOf(0), 1.5), stones.tap(wrongOf(0), 1.6), stones.tap(rightOf(1), 1.7)], [{ counted: false }, { counted: false }, { counted: false }]);
  stones.update(100); // however long he takes, nothing comes by itself
  assert.deepEqual(stones.events(), []);
  stones.landed(2.5);
  assert.deepEqual(stones.events().map(e => [e.type, e.step, e.stone]), [['want', 1, rightOf(1)]]);
  stones.landed(2.6); // not in the air: nothing
  assert.deepEqual(stones.events(), []);
  assert.deepEqual(stones.state(), { step: 1, waiting: true, done: false });
});

test('a stone of another step, or an unknown one, is not counted and makes no event', () => {
  const stones = createStones({ steps: STEPS });
  stones.start(0); stones.events();
  assert.deepEqual(stones.tap(rightOf(2), 1), { counted: false });
  assert.deepEqual(stones.tap('nothing', 2), { counted: false });
  assert.deepEqual(stones.events(), []);
  assert.deepEqual(stones.tap(rightOf(0), 3), { counted: true }); // the step is still wanted
});

test('the waits are halved once the help has hopped, and whole again once the child taps right', () => {
  const stones = createStones({ steps: STEPS });
  stones.start(0);
  const log = [...stones.events(), ...run(stones, 0, 18 + LAND)]; // step 0 hopped by Mosi, landed
  const wanted1 = log.filter(e => e.type === 'want')[1];
  near(wanted1.time, 19.5, 'step 2 wanted');
  stones.update(19.5 + 8.9); assert.deepEqual(stones.events().map(e => e.level), ['hint', 'name']);
  assert.deepEqual(stones.tap(rightOf(1), 28.4), { counted: true }); // the child taps right before the help
  stones.events();
  stones.landed(30);
  const w = stones.events()[0];
  near(w.time, 30, 'step 3 wanted');
  stones.update(30 + 17.9); assert.deepEqual(stones.events().map(e => e.level), ['hint', 'name']); // whole again: 18 s
  stones.update(30 + 18);
  assert.deepEqual(stones.events().map(e => e.type), ['help', 'hop']);
});

test('time that does not pass holds the task', () => {
  const stones = createStones({ steps: STEPS });
  stones.start(0); stones.events();
  for (let i = 0; i < 100; i++) stones.update(5);
  assert.deepEqual(stones.events(), []);
  stones.update(6);
  assert.deepEqual(stones.events().map(e => e.level), ['hint']);
  for (let i = 0; i < 100; i++) stones.update(6);
  assert.deepEqual(stones.events(), []);
});
