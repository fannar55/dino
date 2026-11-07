// Chapter 5's task as a state machine (chapters/kafli5-choir.js): the four phrases, followed (1 and 2) and remembered (3 and 4),
// right, wrong and early taps, the help at 5, 10 and 18 s, a child whose hands are off the screen, and the game clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createChoir, HELP, HANDS_OFF, NOTE, ECHO, WHOLE, BETWEEN } from '../chapters/kafli5-choir.js';
import { MELODY, GROUPS } from '../chapters/kafli5-song.js';

const STEP = 0.1;
/** Runs `choir` from `from` to `to` in steps, calling `each(t)` before each update; every event, in order. */
function run(choir, from, to, each = null, log = []) {
  for (let t = from; t <= to + 1e-9; t = Math.round((t + STEP) * 1000) / 1000) {
    each?.(t);
    choir.update(t);
    log.push(...choir.events());
    if (choir.state().done) break;
  }
  return log;
}
const wantedOf = choir => MELODY[choir.state().phrase][choir.state().index];
const wrongFor = group => GROUPS.find(g => g !== group);
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} is not ${b}`);
const sorted = log => log.every((e, i) => i === 0 || e.time >= log[i - 1].time - 1e-9);

test('the help constants are the spec\'s, and the timing ones the plan\'s', () => {
  assert.deepEqual(HELP, { glow: 5, point: 10, auto: 18 });
  assert.equal(NOTE, 0.6);
  assert.equal(ECHO, 0.5);
  assert.equal(WHOLE, 0.6);
  assert.ok(HANDS_OFF.auto < HELP.glow && BETWEEN > 0);
});

test('a child who taps nothing gets every phrase on the help and is done before 4 minutes', () => {
  const choir = createChoir();
  choir.start(0);
  const log = [...choir.events(), ...run(choir, 0, 600)];
  assert.ok(choir.state().done, 'done');
  const done = log.find(e => e.type === 'done');
  assert.ok(done && done.time < 240, `done at ${done?.time}`);
  const counted = log.filter(e => e.type === 'sing' && e.counted);
  assert.deepEqual(counted.map(e => e.group), MELODY.flat());
  assert.ok(counted.every(e => e.auto), 'every note sang by itself');
  assert.deepEqual(log.filter(e => e.type === 'phrase').map(e => e.phrase), [0, 1, 2, 3]);
  // each phrase's first note waits the whole help, so a child who looked away is asked again
  for (let p = 0; p < 4; p++) {
    const first = counted[MELODY.slice(0, p).flat().length];
    const point = log.find(e => e.type === 'help' && e.level === 'point' && e.group === first.group && e.time <= first.time && e.time > first.time - HELP.auto);
    assert.ok(point, `Mosi names the first note of phrase ${p + 1}`);
  }
  assert.ok(sorted(log), 'events come in time order');
});

test('the help comes at 5, 10 and 18 s without a correct tap, and the auto note counts', () => {
  const choir = createChoir();
  choir.start(10);
  const log = [...choir.events(), ...run(choir, 10, 28.7)];
  const first = MELODY[0][0];
  const help = log.filter(e => e.type === 'help');
  assert.deepEqual(help.map(e => [e.level, e.group]), [['glow', first], ['point', first], ['auto', first]]);
  near(help[0].time, 15, 'glow');
  near(help[1].time, 20, 'point');
  near(help[2].time, 28, 'auto');
  const sing = log.find(e => e.type === 'sing');
  assert.deepEqual([sing.group, sing.counted, sing.auto], [first, true, true]);
  near(sing.time, 28, 'it sings at the auto help');
  const echo = log.find(e => e.type === 'echo');
  near(echo.time, 28 + ECHO, 'she echoes it');
  assert.equal(choir.state().index, 1, 'the next note is wanted');
});

test('a wrong tap sings, is not counted, and the same note is still wanted', () => {
  const choir = createChoir();
  choir.start(0);
  const wanted = MELODY[0][0];
  const wrong = wrongFor(wanted);
  run(choir, 0, 3);
  assert.deepEqual(choir.tap(wrong, 3.05), { counted: false });
  const after = choir.events();
  assert.deepEqual(after.map(e => [e.type, e.group, e.counted ?? null]), [['sing', wrong, false], ['light', wanted, null]]);
  assert.equal(after[1].again, true, 'the right one hops and glows again');
  assert.deepEqual([choir.state().phrase, choir.state().index, choir.state().waiting], [0, 0, true]);
  // the help starts again from the wrong tap: no glow at 5 s, a glow at 8.05
  const log = run(choir, 3.1, 8.5);
  const glow = log.filter(e => e.type === 'help');
  assert.equal(glow.length, 1);
  near(glow[0].time, 8.05, 'glow 5 s after the wrong tap');
  assert.deepEqual(choir.tap(wanted, 8.5), { counted: true });
  assert.ok(choir.events().some(e => e.type === 'sing' && e.group === wanted && e.counted));
});

test('a tap while she shows or echoes a phrase sings and is not counted, and the phrase waits for her', () => {
  const choir = createChoir();
  choir.start(0);
  // phrases 1 and 2 tapped right as soon as they are wanted
  let t = 0;
  const shows = [];
  while (choir.state().phrase < 2) {
    t = Math.round((t + STEP) * 1000) / 1000;
    choir.update(t);
    shows.push(...choir.events().filter(e => e.type === 'show'));
    const state = choir.state();
    // a tap during her echo: the next one, early, not counted and the order unbroken
    if (!state.waiting && state.phrase < 2 && t < state.busyUntil && state.index + 1 < MELODY[state.phrase].length) {
      const next = MELODY[state.phrase][state.index + 1];
      const index = state.index;
      assert.deepEqual(choir.tap(next, t), { counted: false }, 'early in her echo');
      assert.equal(choir.state().index, index);
      assert.ok(choir.events().some(e => e.type === 'sing' && e.group === next && !e.counted));
    }
    if (choir.state().waiting) choir.tap(wantedOf(choir), t);
  }
  // phrase 3 is shown first: every tap meanwhile just sings, the right first note too
  const first = MELODY[2][0];
  while (!choir.state().waiting) {
    t = Math.round((t + STEP) * 1000) / 1000;
    choir.update(t);
    shows.push(...choir.events().filter(e => e.type === 'show'));
    if (!choir.state().waiting && shows.length) {
      assert.deepEqual(choir.tap(first, t), { counted: false }, `during the show at ${t}`);
      const sang = choir.events();
      assert.deepEqual(sang.map(e => [e.type, e.counted]), [['sing', false]]);
      assert.equal(choir.state().index, 0);
    }
  }
  assert.deepEqual(shows.map(e => e.group), MELODY[2]);
  // once she is done, the same note is wanted and counts
  assert.equal(choir.state().index, 0);
  assert.deepEqual(choir.tap(first, t), { counted: true });
});

test('phrases 1 and 2 light each note; phrases 3 and 4 show the whole phrase before the first wanted note', () => {
  const choir = createChoir();
  choir.start(0);
  const log = [...choir.events()];
  run(choir, 0, 400, t => {
    choir.update(t);
    log.push(...choir.events());
    if (choir.state().waiting) choir.tap(wantedOf(choir), t);
  }, log);
  const counted = log.filter(e => e.type === 'sing' && e.counted);
  assert.equal(counted.length, 14);
  let n = 0;
  MELODY.forEach((notes, p) => {
    const mine = counted.slice(n, n + notes.length);
    const from = n === 0 ? -1 : counted[n - 1].time;
    n += notes.length;
    const shows = log.filter(e => e.type === 'show' && e.phrase === p);
    const lights = log.filter(e => e.type === 'light' && e.time > from && e.time <= mine.at(-1).time);
    if (p < 2) {
      assert.equal(shows.length, 0, `no show in phrase ${p + 1}`);
      assert.deepEqual(lights.map(e => e.group), notes, `phrase ${p + 1} lit note by note`);
      mine.forEach((sing, i) => assert.ok(lights[i].time <= sing.time, 'lit before it is tapped'));
    } else {
      assert.deepEqual(shows.map(e => e.group), notes, `phrase ${p + 1} shown whole`);
      assert.ok(shows.at(-1).time < mine[0].time, 'shown before the first wanted note');
      shows.forEach((show, i) => i && near(show.time - shows[i - 1].time, NOTE, 'a note apart'));
      assert.equal(lights.length, 0, `no light in phrase ${p + 1}`);
    }
  });
});

test('a phrase event comes after its last echo, and done after the fourth', () => {
  const choir = createChoir();
  choir.start(0);
  const log = [...choir.events(), ...run(choir, 0, 600)];
  const echoes = log.filter(e => e.type === 'echo');
  assert.equal(echoes.length, 14);
  let n = 0;
  MELODY.forEach((notes, p) => {
    n += notes.length;
    const last = echoes[n - 1];
    const at = log.findIndex(e => e.type === 'phrase' && e.phrase === p);
    assert.ok(at > log.indexOf(last), `phrase ${p + 1} after its last echo`);
    near(log[at].time, last.time, 'at once');
  });
  const phrases = log.filter(e => e.type === 'phrase');
  const done = log.findIndex(e => e.type === 'done');
  assert.ok(done > log.indexOf(phrases[3]), 'done after the fourth');
  near(log[done].time, phrases[3].time + MELODY[3].length * WHOLE, 'once she has played it whole');
  assert.equal(log.filter(e => e.type === 'done').length, 1);
  // after it, a tap only sings
  assert.deepEqual(choir.tap('frogs', log[done].time + 1), { counted: false });
});

test('time that does not pass holds the help: no help while update is not called', () => {
  const choir = createChoir();
  choir.start(0);
  choir.events();
  choir.update(2);
  // the book is open (or the tab hidden): the game clock stands at 2 s however long it stays open
  for (let i = 0; i < 300; i++) choir.update(2);
  assert.equal(choir.events().filter(e => e.type === 'help').length, 0);
  choir.update(4.9);
  assert.equal(choir.events().filter(e => e.type === 'help').length, 0, 'not before 5 s of game time');
  choir.update(5);
  const glow = choir.events().filter(e => e.type === 'help');
  assert.deepEqual(glow.map(e => e.level), ['glow']);
});

test('a child who taps right at once finishes all 14 notes with no help event', () => {
  const choir = createChoir();
  choir.start(0);
  const log = [...choir.events()];
  run(choir, 0, 400, t => {
    choir.update(t);
    log.push(...choir.events());
    if (choir.state().waiting) assert.deepEqual(choir.tap(wantedOf(choir), t), { counted: true });
  }, log);
  assert.ok(choir.state().done);
  assert.equal(log.filter(e => e.type === 'help').length, 0);
  assert.equal(log.filter(e => e.type === 'sing' && e.counted).length, 14);
  assert.ok(log.find(e => e.type === 'done').time < 60, 'quick');
});

test('hands off: after a note sings by itself the rest of its phrase comes sooner, and a tap brings the whole help back', () => {
  const choir = createChoir();
  choir.start(0);
  const log = [...choir.events(), ...run(choir, 0, 24)];
  const counted = log.filter(e => e.type === 'sing' && e.counted);
  near(counted[0].time, HELP.auto, 'the first note on the whole help');
  near(counted[1].time, HELP.auto + ECHO + HANDS_OFF.auto, 'the second sooner');
  const second = log.filter(e => e.type === 'help' && e.time > counted[0].time);
  assert.deepEqual(second.map(e => e.level), ['glow', 'auto'], 'a glow and the note, and Mosi lets it be');
  // phrase 2: the first note on the whole help again; a tap on the second ends the hands-off
  let tapped = null;
  const more = run(choir, 24.1, 120, t => {
    choir.update(t);
    const state = choir.state();
    if (state.phrase === 1 && state.index === 1 && state.waiting && tapped === null) {
      tapped = t;
      choir.tap(wantedOf(choir), t);
    }
  });
  const phrase2 = more.filter(e => e.type === 'sing' && e.counted);
  const start = more.find(e => e.type === 'light' && e.group === MELODY[1][0]);
  near(phrase2[0].time - start.time, HELP.auto, 'phrase 2 starts on the whole help');
  near(phrase2[1].time, tapped, 'tapped');
  near(phrase2[2].time - (phrase2[1].time + ECHO), HELP.auto, 'after a tap, the whole help again');
});
