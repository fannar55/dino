// Chapter 6's call as a state machine (chapters/kafli6-call.js): ask, call, answer, listen, walk; right, wrong and early taps,
// the help at 6, 12 and 18 s (halved after the help has walked), and the game clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCall, thirdOf, CALL_HELP, ASK, ANSWER } from '../chapters/kafli6-call.js';
import { DIRECTIONS } from '../chapters/kafli6-help.js';

const STEP = 0.1;
/** Runs `call` from `from` to `to` in steps, calling `each(t)` before each update; every event, in order. */
function run(call, from, to, each = null, log = []) {
  for (let t = from; t <= to + 1e-9; t = Math.round((t + STEP) * 1000) / 1000) {
    each?.(t);
    call.update(t);
    log.push(...call.events());
    if (call.state().phase === 'done') break;
  }
  return log;
}
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} is not ${b}`);
const other = d => DIRECTIONS.find(x => x !== d);
const types = log => log.map(e => e.type);

test('the call\'s constants are the spec\'s', () => {
  assert.deepEqual(CALL_HELP, { hint: 6, name: 12, auto: 18 });
  assert.equal(ASK, 6);
  assert.deepEqual(ANSWER, { mosi: 1.8, quiet: 1.4, roar: 2.6 });
});

test('three rounds, and no round answers from the direction of the round before', () => {
  for (let s = 0; s < 50; s++) {
    const call = createCall({ seed: `s${s}` });
    assert.equal(call.directions.length, 3);
    assert.ok(call.directions.every((d, i) => i === 0 || d !== call.directions[i - 1]));
    call.start(0);
    const log = [...call.events()];
    let t = 0;
    for (let r = 0; r < 3; r++) {
      assert.equal(call.state().round, r);
      call.tapMosi(t += 1);
      call.update(t += 3.2);
      assert.equal(call.state().phase, 'listen');
      call.tapDirection(call.directions[r], t += 1);
      assert.equal(call.state().phase, 'walk');
      call.arrived(t += 4);
      log.push(...call.events());
    }
    assert.equal(call.state().phase, 'done');
    assert.deepEqual(log.filter(e => e.type === 'answer').map(e => e.direction), call.directions);
    assert.equal(log.filter(e => e.type === 'done').length, 1);
  }
});

test('a child who taps nothing: Mosi roars after 6 s, she answers 3.2 s later, he walks 18 s after that; rounds two and three on halved waits (3 and 9 s)', () => {
  const call = createCall();
  call.start(10);
  const log = [...call.events()];
  let arriveAt = null; // he arrives 4 s after he starts to walk
  run(call, 10, 400, t => {
    if (call.state().phase === 'walk') {
      arriveAt ??= t + 4;
      if (t >= arriveAt - 1e-9) { call.arrived(t); arriveAt = null; }
    }
  }, log);
  const at = (type, i = 0) => log.filter(e => e.type === type && !e.again)[i]; // her first answer of each round
  near(at('call', 0).time, 16, 'round 1 call');
  assert.equal(at('call', 0).by, 'mosi');
  near(at('answer', 0).time, 19.2, 'round 1 answer');
  near(at('walk', 0).time, 37.2, 'round 1 walk');
  assert.equal(at('walk', 0).by, 'mosi');
  // round 2 is asked when he arrived (41.2): 3 s, 3.2 s, 9 s
  const asked2 = at('ask', 1).time;
  near(at('call', 1).time, asked2 + 3, 'round 2 call');
  near(at('answer', 1).time - at('call', 1).time, 3.2, 'round 2 answer');
  near(at('walk', 1).time - at('answer', 1).time, 9, 'round 2 walk');
  near(at('call', 2).time - at('ask', 2).time, 3, 'round 3 call');
  near(at('walk', 2).time - at('answer', 2).time, 9, 'round 3 walk');
  assert.ok(call.state().phase === 'done' && at('done'));
  assert.ok(log.every((e, i) => i === 0 || e.time >= log[i - 1].time - 1e-9), 'events come in time order');
});

test('the help: she roars again and stronger at 6 s, Mosi points at 12 s, he walks at 18 s', () => {
  const call = createCall({ directions: ['left', 'ahead', 'right'] });
  call.start(0);
  call.tapMosi(0);
  const log = [...call.events(), ...run(call, 0, 21.2)];
  const answers = log.filter(e => e.type === 'answer');
  near(answers[0].time, 3.2, 'her answer');
  assert.deepEqual([answers[0].again, answers[0].strong], [false, false]);
  near(answers[1].time, 9.2, 'roars again');
  assert.deepEqual([answers[1].again, answers[1].strong, answers[1].direction], [true, true, 'left']);
  const help = log.find(e => e.type === 'help');
  near(help.time, 15.2, 'points');
  assert.deepEqual([help.level, help.round, help.direction], ['name', 0, 'left']);
  const walk = log.find(e => e.type === 'walk');
  near(walk.time, 21.2, 'walks');
  assert.deepEqual([walk.by, walk.direction], ['mosi', 'left']);
  assert.equal(answers.length, 2);
});

test('a wrong direction swirls, Mosi says „Hlustum aftur!“ and she answers again from the same direction', () => {
  const call = createCall({ directions: ['ahead', 'left', 'right'] });
  call.start(0);
  call.tapMosi(0); call.update(3.2); call.events();
  const r = call.tapDirection('left', 6);
  assert.equal(r.counted, false);
  const log = call.events();
  assert.deepEqual(types(log), ['swirl', 'again', 'answer']);
  assert.equal(log[0].direction, 'left');
  assert.deepEqual([log[2].direction, log[2].again], ['ahead', true]);
  assert.equal(call.state().phase, 'listen');
  assert.equal(call.tapDirection('ahead', 7).counted, true);
  assert.deepEqual(types(call.events()), ['walk']);
});

test('a child who taps a wrong direction every second for ever still finishes; she never answers twice inside 2.6 s', () => {
  const call = createCall({ directions: ['ahead', 'left', 'right'] });
  call.start(0);
  const log = [...call.events()];
  let tapped = 0;
  run(call, 0, 600, t => {
    if (call.state().phase === 'ask') call.tapMosi(t);
    if (call.state().phase === 'listen' && Math.abs(t - Math.round(t)) < 1e-6) {
      call.tapDirection(other(call.state().direction), t);
      tapped++;
    }
    if (call.state().phase === 'walk') call.arrived(t + 2);
    log.push(...call.events());
  }, log);
  assert.equal(call.state().phase, 'done');
  assert.ok(tapped > 20);
  const answers = log.filter(e => e.type === 'answer');
  for (let i = 1; i < answers.length; i++) {
    if (answers[i].round === answers[i - 1].round) assert.ok(answers[i].time - answers[i - 1].time >= ANSWER.roar - 1e-6, `answers ${answers[i - 1].time} and ${answers[i].time}`);
  }
  for (let r = 0; r < 3; r++) {
    const a = log.find(e => e.type === 'answer' && e.round === r && !e.again);
    const w = log.find(e => e.type === 'walk' && e.round === r);
    assert.equal(w.by, 'mosi');
    assert.ok(w.time - a.time <= 18 + 1e-6, `round ${r} walked ${w.time - a.time} s after her answer`);
  }
});

test('a hint that falls due inside her roar waits for it to end', () => {
  const call = createCall({ directions: ['ahead', 'left', 'right'], help: { hint: 2, name: 12, auto: 18 } });
  call.start(0); call.tapMosi(0);
  const log = [...call.events(), ...run(call, 0, 6)];
  const answers = log.filter(e => e.type === 'answer');
  near(answers[0].time, 3.2, 'her answer');
  near(answers[1].time, 5.8, 'the hint waited for her roar to end');
  assert.deepEqual([answers[1].again, answers[1].strong], [true, true]);
  assert.equal(answers.length, 2);
});

test('a direction tapped before she has answered does nothing; tapped while she roars it counts', () => {
  const call = createCall({ directions: ['ahead', 'left', 'right'] });
  call.start(0);
  assert.deepEqual(call.tapDirection('ahead', 1), { counted: false }); // still asked
  call.events();
  call.tapMosi(2);
  assert.deepEqual(call.tapDirection('ahead', 3), { counted: false }); // he roars
  assert.deepEqual(call.tapDirection('left', 4), { counted: false });  // before her answer (5.2)
  assert.deepEqual(types(call.events()), ['call']);
  assert.equal(call.state().phase, 'calling');
  assert.deepEqual(call.tapDirection('ahead', 5.2 + 1), { counted: true }); // while she roars
  const log = call.events();
  assert.deepEqual(types(log), ['answer', 'walk']);
  assert.equal(log[1].by, 'child');
});

test('taps on Mosi or a direction while he walks do nothing; the next round asks when he has arrived', () => {
  const call = createCall({ directions: ['ahead', 'left', 'right'] });
  call.start(0); call.tapMosi(0); call.update(3.2);
  call.tapDirection('ahead', 4);
  call.events();
  assert.deepEqual([call.tapMosi(5), call.tapDirection('ahead', 6), call.tapDirection('left', 7)], [{ counted: false }, { counted: false }, { counted: false }]);
  call.update(200); // however long he takes, nothing comes by itself
  assert.deepEqual(call.events(), []);
  assert.equal(call.state().phase, 'walk');
  call.arrived(8);
  assert.deepEqual(types(call.events()), ['ask']);
  assert.deepEqual([call.state().round, call.state().phase], [1, 'ask']);
  call.arrived(9); // not walking: nothing
  assert.deepEqual(call.events(), []);
  // and after the third, done once; then nothing counts
  call.tapMosi(10); call.update(13.2); call.tapDirection('left', 14); call.arrived(15);
  call.tapMosi(16); call.update(19.2); call.tapDirection('right', 20); call.arrived(21);
  const log = call.events();
  assert.equal(log.filter(e => e.type === 'done').length, 1);
  assert.deepEqual([call.tapMosi(22), call.tapDirection('right', 23)], [{ counted: false }, { counted: false }]);
  call.arrived(24);
  assert.deepEqual(call.events(), []);
});

test('a wrong tap that comes after the roar window brings the hint (strong) and does not move name or walk', () => {
  const call = createCall({ directions: ['ahead', 'left', 'right'] });
  call.start(0); call.tapMosi(0); call.update(3.2); call.events();
  call.tapDirection('right', 4); // inside her roar's 2.6 s: swirl only
  assert.deepEqual(types(call.events()), ['swirl']);
  call.tapDirection('right', 6); // outside: again, and the ladder's hint (strong)
  const log = call.events();
  assert.deepEqual(types(log), ['swirl', 'again', 'answer']);
  assert.equal(log[2].strong, true);
  const rest = run(call, 6, 21.2);
  assert.deepEqual(rest.filter(e => e.type !== 'swirl').map(e => [e.type, +e.time.toFixed(1)]), [['help', 15.2], ['walk', 21.2]]);
});

test('thirdOf: of 1280, 0 and 426 are left, 427 and 853 ahead, 854 and 1279 right', () => {
  assert.deepEqual([0, 426].map(x => thirdOf(x, 1280)), ['left', 'left']);
  assert.deepEqual([427, 853].map(x => thirdOf(x, 1280)), ['ahead', 'ahead']);
  assert.deepEqual([854, 1279].map(x => thirdOf(x, 1280)), ['right', 'right']);
  assert.equal(thirdOf(1280, 1280), 'right');
});

test('time that does not pass holds the call', () => {
  const call = createCall();
  call.start(0);
  call.events();
  for (let i = 0; i < 100; i++) call.update(5);
  assert.deepEqual(call.events(), []);
  assert.equal(call.state().phase, 'ask');
  call.update(6);
  assert.deepEqual(types(call.events()), ['call']);
  for (let i = 0; i < 100; i++) call.update(6);
  assert.deepEqual(call.events(), []);
});
