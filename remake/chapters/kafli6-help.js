// Chapter 6's help ladder (docs/superpowers/specs/2026-11-21-kafli-6-bod-til-gramedlu-design.md, section 5), shared by the call, the
// stones and the prints: no drawing, no sound, no clock of its own. A step is wanted at `want(time)`; `update(time)` says which
// rungs have come due since the last call ('hint', then 'name' if the task has one, then 'auto'), each once a step, in order.
// A wrong tap brings the hint forward ('hint' at once if the step has not had it) and never moves `auto`, so wrong taps cannot
// hold a task. After the help has done a step itself (`done('auto')`) every wait is halved until the child next taps right
// (`done('child')`); each task starts whole. Time is whatever number the caller gives: a paused game gives none, so no help comes.
import { seededRandom } from '../engine/random.js';

const LEVELS = ['hint', 'name', 'auto'];
const EPS = 1e-9;

export function createHelp({ hint, name = null, auto }) {
  const whole = name === null ? { hint, auto } : { hint, name, auto };
  let quick = false;
  let wantedAt = null; // when the step became wanted (null: none is wanted)
  let given = new Set(); // the rungs given for this step

  const timesNow = () => {
    const k = quick ? 0.5 : 1;
    return Object.fromEntries(Object.entries(whole).map(([level, seconds]) => [level, seconds * k]));
  };

  return {
    /** A step is wanted from `time`. */
    want(time) {
      wantedAt = time;
      given = new Set();
    },
    /** The rungs that have come due by `time` since the last call, in order. */
    update(time) {
      if (wantedAt === null) return [];
      const times = timesNow();
      const due = [];
      for (const level of LEVELS) {
        if (!(level in times) || given.has(level)) continue;
        if (time + EPS < wantedAt + times[level]) break;
        given.add(level);
        due.push(level);
      }
      if (given.has('auto')) wantedAt = null; // the ladder is spent; the caller finishes the step with done()
      return due;
    },
    /** A wrong tap at `time`: 'hint' at once if the step has not had it, else null. `auto` stays where it was. */
    wrong() {
      if (wantedAt === null || given.has('hint') || given.has('auto')) return null;
      given.add('hint');
      return 'hint';
    },
    /** The step is over: by 'auto' (the help did it: the waits are halved) or by 'child' (whole again). */
    done(by) {
      quick = by === 'auto';
      wantedAt = null;
    },
    get times() { return timesNow(); },
    get quick() { return quick; },
  };
}

export const DIRECTIONS = ['left', 'ahead', 'right'];

/** The directions of the call's rounds, drawn from `seed`, never the same twice in a row. */
export function callDirections(seed, rounds = 3) {
  const random = seededRandom(seed);
  const out = [];
  for (let i = 0; i < rounds; i++) {
    const pool = DIRECTIONS.filter(d => d !== out[i - 1]);
    out.push(pool[Math.floor(random() * pool.length)]);
  }
  return out;
}
