// The festival's three taps as rules (docs/superpowers/specs/2026-11-21-stjornuhatidin-design.md, section 4), with no drawing, no
// sound and no clock of its own: the scene gives the machines the child's taps and the game's time; what happened comes back as
// events. Nothing can fail: a tap at the wrong moment (before `start`, after the task is over, on a lit star, on no star) counts
// nothing, brings no event and no hint, and a child who taps nothing sees it all happen by itself.
//
// createOneTap: the sun's wave and Grameðla's roar. One tap counts. Untouched, Mosi says his line again at `hint` s and it happens
// by itself at `auto` s ('go' by 'help').
// createStars: six stars, tapped in any order, several at once. Tones always rise in the order lit (SONG.motif[n]); a tone never
// sounds within TONE_GAP of the one before, so two taps in one instant give two tones TONE_GAP apart, the lower first. The help
// takes the first unlit friend in `friends`' order; after it lit one by itself the waits are halved until the child lights one.
//
// Time is whatever number the caller gives: a game that does not pass time gives none, so no wait runs out.
import { createHelp } from './kafli6-help.js';
import { FRIENDS } from '../engine/scene/journal-data.js';
import { SONG } from './hatid-song.js';

export const TAP_HELP = {
  sun: { hint: 6, auto: 12 },
  roar: { hint: 6, auto: 12 },
  stars: { hint: 5, auto: 12 },
};
/** Seconds between two tones of the stars. */
export const TONE_GAP = 0.25;

// `help` may be a ladder from createHelp or its seconds ({ hint, auto }).
const ladderOf = help => (typeof help?.want === 'function' ? help : createHelp(help));

/** Events since the last call, in time order (ties keep the order they happened). */
function drain(out) {
  return out.splice(0).map((event, i) => [event, i]).sort((a, b) => a[0].time - b[0].time || a[1] - b[1]).map(([event]) => event);
}

export function createOneTap({ help = TAP_HELP.sun } = {}) {
  const ladder = ladderOf(help);
  const out = [];
  let started = false;
  let waiting = false;
  let done = false;
  let wantedAt = 0;

  const go = (time, by) => {
    out.push({ type: 'go', time, by });
    waiting = false;
    done = true;
  };
  function update(now) {
    if (!waiting) return;
    for (const level of ladder.update(now)) {
      const at = wantedAt + ladder.times[level];
      if (level === 'hint') out.push({ type: 'help', time: at, level: 'hint' });
      else if (level === 'auto') {
        ladder.done('auto');
        go(at, 'help');
      }
    }
  }

  return {
    /** The task begins at `time`: the tap is wanted. */
    start(time) {
      if (started) return;
      started = true;
      waiting = true;
      wantedAt = time;
      out.push({ type: 'want', time });
      ladder.want(time);
    },
    tap(time) {
      update(time);
      if (!started || done) return { counted: false };
      ladder.done('child');
      go(time, 'child');
      return { counted: true };
    },
    update,
    events() { return drain(out); },
    state() { return { waiting, done }; },
  };
}

export function createStars({ friends = FRIENDS.map(f => f.key), help = TAP_HELP.stars } = {}) {
  const ladder = ladderOf(help);
  const out = [];
  const lit = [];
  let started = false;
  let waiting = false;
  let done = false;
  let wantedAt = 0;
  let lastTone = -Infinity; // when the latest tone sounds

  const unlit = () => friends.filter(f => !lit.includes(f));

  function want(time) {
    waiting = true;
    wantedAt = time;
    out.push({ type: 'want', time });
    ladder.want(time);
  }
  function light(friend, time, by) {
    const n = lit.length;
    const at = Math.max(time, lastTone + TONE_GAP);
    lastTone = at;
    lit.push(friend);
    out.push({ type: 'light', time, friend, n, tone: SONG.motif[n], at, by });
    if (lit.length >= friends.length) {
      waiting = false;
      done = true;
      out.push({ type: 'all', time: at, at });
      out.push({ type: 'done', time: at });
    } else {
      want(time);
    }
  }
  function update(now) {
    if (!waiting) return;
    for (const level of ladder.update(now)) {
      const at = wantedAt + ladder.times[level];
      const friend = unlit()[0];
      if (level === 'hint') out.push({ type: 'help', time: at, level: 'hint', friend });
      else if (level === 'auto') {
        ladder.done('auto');
        light(friend, at, 'help');
        if (done) return;
      }
    }
  }

  return {
    /** The stars have arrived at `time`: the first is wanted. */
    start(time) {
      if (started) return;
      started = true;
      want(time);
    },
    /** The child tapped star `friend` (null: no star) at `time`. */
    tap(friend, time) {
      update(time);
      if (!started || done || friend === null || !friends.includes(friend) || lit.includes(friend)) return { counted: false };
      ladder.done('child');
      light(friend, time, 'child');
      return { counted: true };
    },
    update,
    events() { return drain(out); },
    state() { return { lit: [...lit], waiting, done }; },
  };
}
