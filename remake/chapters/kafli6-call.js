// Chapter 6's third task, the call (docs/superpowers/specs/2026-11-21-kafli-6-bod-til-gramedlu-design.md, section 5), as a state
// machine with no drawing and no sound: the scene (kafli6.js) gives it the child's taps and the game clock, and turns what it says
// happened (events) into roars, light in the fog and Mosi's walk. So every rule is tested in Node (tests/kafli6-call.test.mjs).
//
// Three rounds (rounds count from 0). A round: Mosi is asked to call ('ask'); the child taps him, or he calls himself after ASK s
// ('call'); he roars a little, is quiet, and she answers from one of three directions ('answer', then listening). The right
// direction makes Mosi walk that way ('walk' by the child); a wrong one swirls the fog there ('swirl') and, unless she answered
// less than ANSWER.roar s ago, Mosi says "Hlustum aftur!" ('again') and she answers again from the same direction. Without a right
// tap the help (kafli6-help.js) comes at CALL_HELP's times from the start of her roar: she roars again, stronger (the hint is an
// 'answer' with again and strong), Mosi points with his head ('help', level 'name'), and he walks himself ('walk' by 'mosi').
// The scene tells the call when he has arrived (`arrived`): the next round is asked, or the call is done after the third.
//
// Rulings (the brief left these open):
// - A wrong tap that gets an answer is the ladder's hint (strong) if the hint has not come yet; a wrong tap inside the roar's
//   seconds only swirls and leaves the hint where it was. A hint that falls due inside those seconds waits for them to end.
//   So she never answers twice inside ANSWER.roar s, and wrong taps never move 'name' or 'walk': a child who taps wrong for ever
//   still finishes.
// - The ladder's halving and Mosi's wait of ASK s both follow the ladder's `quick` (it ends only when the child taps a right
//   direction), so a child who taps nothing gets 3 s and 9 s in the rounds after the first.
// - `counted` is true only for a tap that did something the child can be credited with: Mosi in 'ask', the right direction.
// - Before `start` and after 'done', taps and `arrived` do nothing.
//
// Time is the game's (the scene's clock): a paused game gives no time, so nothing comes meanwhile.
import { createHelp, callDirections, DIRECTIONS } from './kafli6-help.js';

export const CALL_HELP = { hint: 6, name: 12, auto: 18 };
/** Seconds Mosi waits for the child's tap before he calls himself. */
export const ASK = 6;
/** Seconds: his little roar, the silence, her roar. */
export const ANSWER = { mosi: 1.8, quiet: 1.4, roar: 2.6 };
const EPS = 1e-9;

/** Which direction a tap at x of a screen `width` wide is in: a third of the screen each (a tap that landed on no target). */
export const thirdOf = (x, width) => DIRECTIONS[Math.min(2, Math.max(0, Math.floor((3 * x) / width)))];

export function createCall({ rounds = 3, help = CALL_HELP, seed = 'kafli6-kall', directions = callDirections(seed, rounds) } = {}) {
  const ladder = createHelp(help);
  const out = [];
  let started = false;
  let round = 0;
  let phase = 'ask';
  let askedAt = 0; // when the round was asked
  let callAt = 0; // when he called (his little roar begins)
  let listenAt = 0; // when her first roar began, from which the ladder counts
  let lastAnswer = -Infinity; // when her latest roar began
  let pendingHint = null; // a hint that fell due inside her roar: when it may come

  const emit = (time, event) => out.push({ type: event.type, time, ...event });
  const direction = () => directions[round];

  function ask(time) {
    phase = 'ask';
    askedAt = time;
    emit(time, { type: 'ask', round });
  }
  function call(time, by) {
    phase = 'calling';
    callAt = time;
    emit(time, { type: 'call', round, by });
  }
  function listen(time) {
    phase = 'listen';
    listenAt = time;
    lastAnswer = time;
    pendingHint = null;
    emit(time, { type: 'answer', round, direction: direction(), again: false, strong: false });
    ladder.want(time);
  }
  function walk(time, by) {
    phase = 'walk';
    pendingHint = null;
    emit(time, { type: 'walk', round, direction: direction(), by });
  }
  function answerAgain(time, strong) {
    lastAnswer = time;
    emit(time, { type: 'answer', round, direction: direction(), again: true, strong });
  }
  function flushHint(upTo) {
    if (pendingHint !== null && pendingHint <= upTo + EPS) {
      const at = pendingHint;
      pendingHint = null;
      answerAgain(at, true);
    }
  }

  function update(now) {
    if (!started) return;
    for (let changed = true; changed;) {
      changed = false;
      if (phase === 'ask') {
        const at = askedAt + ASK * (ladder.quick ? 0.5 : 1);
        if (now + EPS >= at) { call(at, 'mosi'); changed = true; }
      } else if (phase === 'calling') {
        const at = callAt + ANSWER.mosi + ANSWER.quiet;
        if (now + EPS >= at) { listen(at); changed = true; }
      } else if (phase === 'listen') {
        flushHint(now);
        for (const level of ladder.update(now)) {
          const at = listenAt + ladder.times[level];
          if (level === 'hint') {
            const free = lastAnswer + ANSWER.roar;
            if (at + EPS >= free) answerAgain(at, true);
            else pendingHint = free;
          } else if (level === 'name') {
            flushHint(at);
            emit(at, { type: 'help', level: 'name', round, direction: direction() });
          } else {
            flushHint(at);
            ladder.done('auto');
            walk(at, 'mosi');
            changed = true;
          }
        }
        flushHint(now);
      }
    }
  }

  return {
    /** The call begins at `time`: round 1 is asked. */
    start(time) {
      if (started) return;
      started = true;
      round = 0;
      ask(time);
    },
    /** The child tapped Mosi at `time`: he calls, if he is being asked. */
    tapMosi(time) {
      update(time);
      if (!started || phase !== 'ask') return { counted: false };
      call(time, 'child');
      return { counted: true };
    },
    /** The child tapped `direction` ('left', 'ahead', 'right') at `time`. */
    tapDirection(tapped, time) {
      update(time);
      if (!started || phase !== 'listen') return { counted: false };
      if (tapped === direction()) {
        ladder.done('child');
        walk(time, 'child');
        return { counted: true };
      }
      emit(time, { type: 'swirl', direction: tapped });
      if (time + EPS >= lastAnswer + ANSWER.roar) {
        const strong = ladder.wrong(time) === 'hint';
        emit(time, { type: 'again', round });
        answerAgain(time, strong);
      }
      return { counted: false };
    },
    /** Mosi has walked his steps and arrived at `time`: the next round is asked, or the call is done. */
    arrived(time) {
      update(time);
      if (!started || phase !== 'walk') return;
      if (round + 1 >= rounds) {
        phase = 'done';
        emit(time, { type: 'done' });
        return;
      }
      round++;
      ask(time);
    },
    /** The game clock's time now: what was due by then happens. */
    update,
    /** The events since the last call, in time order. */
    events() {
      return out.splice(0).map((event, i) => [event, i]).sort((a, b) => a[0].time - b[0].time || a[1] - b[1]).map(([event]) => event);
    },
    state() {
      return { round, phase, direction: direction() };
    },
    directions,
  };
}
