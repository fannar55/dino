// Chapter 6's first task, the stepping stones (docs/superpowers/specs/2026-11-21-kafli-6-bod-til-gramedlu-design.md, section 5), as a
// state machine with no drawing and no sound: the scene (kafli6.js) gives it the child's taps and the game clock, and turns what it
// says happened (events) into Mosi's hops, wobbling stones and glitter. So every rule is tested in Node (tests/kafli6-stones.test.mjs).
//
// Five steps (kafli6-route.js STEPS, steps count from 0), each with two or three stones, one of them right (big, flat, dry). A step
// is wanted from `start` and from each `landed`. The right stone: Mosi hops ('hop' by 'child'), and waits in the air until the scene
// says `landed`; the fifth landing is 'done'. A wrong stone of the step wobbles ('wobble', the frog jumps out) and is not counted;
// if the hint has not come yet it comes at once ('help' hint: the right stone glitters). Without a right tap the help (kafli6-help.js)
// comes from when the step was wanted: the right stone glitters at 6 s, Mosi names it at 12 s, he hops himself at 18 s ('help' auto,
// then 'hop' by 'mosi'). Wrong taps never move 'name' or 'auto', so a child who taps wrong for ever still crosses. After the help has
// hopped for him the waits are halved (9 s) until the child next taps the right stone.
//
// A tap on a stone of another step, or any tap while Mosi is in the air, is not counted and makes no event.
//
// Time is the game's (the scene's clock): a paused game gives no time, so no help comes meanwhile.
import { createHelp } from './kafli6-help.js';
import { STEPS } from './kafli6-route.js';

export const STONE_HELP = { hint: 6, name: 12, auto: 18 };

export function createStones({ steps = STEPS, help = STONE_HELP } = {}) {
  const ladder = createHelp(help);
  const out = [];
  let started = false;
  let done = false;
  let step = 0;
  let phase = 'idle'; // 'waiting' for a tap, 'air' while Mosi hops, 'idle' before the start and after the end
  let wantedAt = 0;

  const emit = (time, event) => out.push({ type: event.type, time, ...event });
  const rightOf = () => steps[step].stones.find(s => s.right).id;

  function want(time) {
    phase = 'waiting';
    wantedAt = time;
    emit(time, { type: 'want', step, stone: rightOf() });
    ladder.want(time);
  }
  function hop(time, by) {
    phase = 'air';
    emit(time, { type: 'hop', step, stone: rightOf(), by });
  }
  function update(now) {
    if (phase !== 'waiting') return;
    for (const level of ladder.update(now)) {
      const at = wantedAt + ladder.times[level];
      emit(at, { type: 'help', level, step, stone: rightOf() });
      if (level === 'auto') {
        ladder.done('auto');
        hop(at, 'mosi');
      }
    }
  }

  return {
    /** The task begins at `time`: the first step is wanted. */
    start(time) {
      if (started) return;
      started = true;
      step = 0;
      want(time);
    },
    /** The child tapped stone `id` at `time`. */
    tap(id, time) {
      update(time);
      if (phase !== 'waiting') return { counted: false };
      const stone = steps[step].stones.find(s => s.id === id);
      if (!stone) return { counted: false };
      if (stone.right) {
        ladder.done('child');
        hop(time, 'child');
        return { counted: true };
      }
      emit(time, { type: 'wobble', step, stone: id });
      if (ladder.wrong(time) === 'hint') emit(time, { type: 'help', level: 'hint', step, stone: rightOf() });
      return { counted: false };
    },
    /** Mosi has landed at `time`: the next step is wanted, or the task is done after the fifth. */
    landed(time) {
      update(time);
      if (phase !== 'air') return;
      if (step + 1 >= steps.length) {
        phase = 'idle';
        done = true;
        emit(time, { type: 'done' });
        return;
      }
      step++;
      want(time);
    },
    /** The game clock's time now: what was due by then happens. */
    update,
    /** The events since the last call, in time order. */
    events() {
      return out.splice(0).map((event, i) => [event, i]).sort((a, b) => a[0].time - b[0].time || a[1] - b[1]).map(([event]) => event);
    },
    state() {
      return { step, waiting: phase === 'waiting', done };
    },
  };
}
