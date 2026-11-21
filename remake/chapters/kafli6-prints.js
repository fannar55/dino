// Chapter 6's second task, the giant footprints in the fog (docs/superpowers/specs/2026-11-21-kafli-6-bod-til-gramedlu-design.md,
// section 5), as a state machine with no drawing and no sound: the scene (kafli6.js) gives it the child's taps and the game clock, and
// turns what it says happened (events) into lifting fog, rising numbers and Mosi's counting. So every rule is tested in Node
// (tests/kafli6-prints.test.mjs).
//
// Six prints, counted in order from 0 ('want' says which is wanted: the next one shows dimly in the fog). A tap on it makes Mosi
// say its number ('count' by 'child'); he is busy for COUNT s, and the following 'want' comes as they end; 'done' comes COUNT s
// after the sixth. A tap on the next print while he is busy is kept (one) and counts as the busy time ends, so two quick taps count
// one print. Any other tap (the fog, a rock: `index` null or another print) swirls where it landed ('swirl'), counts nothing, and
// brings the hint at once if it has not come ('help' hint: the next print glitters). Without a right tap the help (kafli6-help.js)
// comes from when the print was wanted: it glitters at 8 s, and at 16 s Egill finds it himself ('help' auto, then 'count' by 'egill').
// Wrong taps never move 'auto'. After the help has done a print the waits are halved until the child next taps right.
//
// Rulings: the help's seconds count from the 'want' (after Mosi's number has ended), not from the previous count. A tap kept while
// he is busy is {counted: true}; a second one is {counted: false}. Taps while he is busy that are not on the next print swirl but
// bring no hint (nothing is wanted yet).
//
// Time is the game's (the scene's clock): a paused game gives no time, so no help comes meanwhile.
import { createHelp } from './kafli6-help.js';

export const PRINT_HELP = { hint: 8, auto: 16 };
/** Seconds Mosi takes over a number. */
export const COUNT = 1.6;
const EPS = 1e-9;

export function createPrints({ count = 6, help = PRINT_HELP } = {}) {
  const ladder = createHelp(help);
  const out = [];
  let started = false;
  let done = false;
  let next = 0; // the print wanted now, or the one that follows the number Mosi is saying
  let waiting = false;
  let wantedAt = 0;
  let busyUntil = null; // while Mosi says a number: when he ends
  let kept = false; // a tap on the next print came while he was busy

  const emit = (time, event) => out.push({ type: event.type, time, ...event });

  function want(time) {
    waiting = true;
    wantedAt = time;
    emit(time, { type: 'want', index: next });
    ladder.want(time);
  }
  function takeOver(time, by) {
    emit(time, { type: 'count', index: next, by });
    waiting = false;
    next++;
    busyUntil = time + COUNT;
  }
  function update(now) {
    for (let changed = true; changed && !done;) {
      changed = false;
      if (busyUntil !== null) {
        if (now + EPS < busyUntil) return;
        const at = busyUntil;
        busyUntil = null;
        changed = true;
        if (next >= count) {
          done = true;
          emit(at, { type: 'done' });
          return;
        }
        want(at);
        if (kept) {
          kept = false;
          ladder.done('child');
          takeOver(at, 'child');
        }
      } else if (waiting) {
        for (const level of ladder.update(now)) {
          const at = wantedAt + ladder.times[level];
          emit(at, { type: 'help', level, index: next });
          if (level === 'auto') {
            ladder.done('auto');
            takeOver(at, 'egill');
            changed = true;
          }
        }
      }
    }
  }

  return {
    /** The task begins at `time`: the first print is wanted. */
    start(time) {
      if (started) return;
      started = true;
      want(time);
    },
    /** The child tapped print `index` (null: the fog or a rock, `where` says where) at `time`. */
    tap(index, time, where = null) {
      update(time);
      if (!started || done) return { counted: false };
      if (index === next && next < count) {
        if (busyUntil !== null) {
          if (kept) return { counted: false };
          kept = true;
          return { counted: true };
        }
        ladder.done('child');
        takeOver(time, 'child');
        return { counted: true };
      }
      emit(time, { type: 'swirl', where });
      if (waiting && ladder.wrong(time) === 'hint') emit(time, { type: 'help', level: 'hint', index: next });
      return { counted: false };
    },
    /** The game clock's time now: what was due by then happens. */
    update,
    /** The events since the last call, in time order. */
    events() {
      return out.splice(0).map((event, i) => [event, i]).sort((a, b) => a[0].time - b[0].time || a[1] - b[1]).map(([event]) => event);
    },
    state() {
      return { next, waiting, done };
    },
  };
}
