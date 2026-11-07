// Chapter 5's task, the animals' choir (docs/superpowers/specs/2026-11-07-kafli-5-bod-til-sloedlu-design.md, section 5), as a state
// machine with no drawing and no sound: the scene (kafli5.js) gives it the child's taps and the game clock, and turns what it says
// happened (events) into light, sound and motion. So every rule is tested in Node (tests/kafli5-choir.test.mjs).
//
// Her song (kafli5-song.js MELODY) comes back phrase by phrase, phrases counted from 0. In phrases 0 and 1 (follow) the right group
// lights up, one note at a time. In phrases 2 and 3 (remember) she plays the phrase first, a note every NOTE seconds, and Egill
// repeats it. A right tap: the group sings, and ECHO s later she answers it on her horn ('echo'), and the next note is wanted. After
// a phrase's last echo she plays it whole ('phrase', WHOLE s a note); BETWEEN s after that the next phrase begins, and after the
// fourth she remembers the whole song ('done').
//
// The child can never fail. A wrong tap sings happily and is not counted; the right group hops and glows again ('light', again) and
// the help starts over for the same note. A tap while she shows or echoes (before `busyUntil`) just sings. Without a right tap the
// help comes at HELP's times from when the note was wanted: the right group glows harder and hops ('glow'), Mosi names it ('point'),
// and it sings by itself and counts ('auto'). A child whose hands are off the screen (a note sang by itself and nothing has been
// touched since) gets the rest of that phrase sooner (HANDS_OFF: a glow and the note, no naming), so the chapter keeps its length;
// each phrase's first note waits the whole help again, so a child who looked away is asked again, and any tap brings it back.
//
// Time is the game's (the scene's clock): a paused game (the book open, a hidden tab) gives no time, so no help comes meanwhile.
import { MELODY } from './kafli5-song.js';

/** Seconds without a right tap before each help. */
export const HELP = { glow: 5, point: 10, auto: 18 };
/** The help for the rest of a phrase once a note sang by itself and nothing has been touched since. */
export const HANDS_OFF = { glow: 1.5, auto: 4 };
export const NOTE = 0.6; // s between the notes she shows
export const ECHO = 0.5; // s from a counted note to her echo
export const WHOLE = 0.6; // s a note when she plays a finished phrase
export const BETWEEN = 3.5; // s from her whole phrase's end to the next phrase (her step out, a line)
const LEVELS = ['glow', 'point', 'auto'];
const EPS = 1e-9;

export function createChoir({ melody = MELODY, help = HELP, quick = HANDS_OFF, between = BETWEEN } = {}) {
  const out = []; // events that have happened, not yet taken
  const queue = []; // events and steps still to come, in time order
  let order = 0;
  let started = false;
  let done = false;
  let phrase = 0;
  let index = 0;
  let busyUntil = Infinity; // nothing is wanted before the start
  let wantedSince = null; // when the wanted note became wanted (null: none is)
  let given = new Set(); // the help levels given for it since then
  let handsOff = false;
  const modeOf = p => (p < 2 ? 'follow' : 'remember');

  const emit = (time, event) => out.push({ type: event.type, time, ...event });
  function schedule(time, event, step = null) {
    queue.push({ time, event, step, order: order++ });
    queue.sort((a, b) => a.time - b.time || a.order - b.order);
  }

  /** The note at (phrase, index) is wanted from `time`. */
  function want(time) {
    wantedSince = time;
    given = new Set();
    busyUntil = time;
    if (modeOf(phrase) === 'follow') emit(time, { type: 'light', group: melody[phrase][index] });
  }
  function begin(p, time) {
    phrase = p;
    index = 0;
    if (modeOf(p) === 'follow') {
      want(time);
      return;
    }
    const notes = melody[p];
    busyUntil = time + notes.length * NOTE;
    notes.forEach((group, i) => schedule(time + i * NOTE, { type: 'show', phrase: p, index: i, group }));
    schedule(busyUntil, null, want);
  }
  function finish(time) {
    emit(time, { type: 'phrase', phrase });
    const whole = time + melody[phrase].length * WHOLE;
    if (phrase + 1 >= melody.length) {
      busyUntil = Infinity;
      schedule(whole, { type: 'done' }, () => { done = true; });
      return;
    }
    const next = phrase + 1;
    const at = whole + between;
    busyUntil = at + (modeOf(next) === 'remember' ? melody[next].length * NOTE : 0);
    schedule(at, null, t => begin(next, t));
  }
  /** The wanted note counts at `time` (a right tap, or the help's own). */
  function count(time, auto) {
    const group = melody[phrase][index];
    emit(time, auto ? { type: 'sing', group, counted: true, auto: true } : { type: 'sing', group, counted: true });
    wantedSince = null;
    busyUntil = time + ECHO;
    schedule(time + ECHO, { type: 'echo', group }, t => {
      if (index + 1 < melody[phrase].length) {
        index++;
        want(t);
      } else {
        finish(t);
      }
    });
  }
  /** The help due by `now` for the wanted note; whether any came. */
  function helpBy(now) {
    if (wantedSince === null || done) return false;
    const plan = handsOff && index > 0 ? quick : help;
    for (const level of LEVELS) {
      if (given.has(level) || !Number.isFinite(plan[level])) continue;
      const at = wantedSince + plan[level];
      if (now + EPS < at) return false;
      given.add(level);
      const group = melody[phrase][index];
      emit(at, { type: 'help', level, group });
      if (level === 'auto') {
        handsOff = true;
        count(at, true);
        return true;
      }
    }
    return false;
  }
  function update(now) {
    for (let changed = true; changed;) {
      changed = false;
      while (queue.length && queue[0].time <= now + EPS) {
        const { time, event, step } = queue.shift();
        if (event) emit(time, event);
        step?.(time);
        changed = true;
      }
      if (helpBy(now)) changed = true;
    }
  }

  return {
    /** The task begins at `time`: phrase 1's first group lights up. */
    start(time) {
      if (started) return;
      started = true;
      begin(0, time);
      update(time);
    },
    /** The child tapped `group` at `time`: it sings, and counts if it is the wanted note and she is not busy. */
    tap(group, time) {
      update(time);
      handsOff = false;
      if (!started || done || wantedSince === null || time + EPS < busyUntil) {
        emit(time, { type: 'sing', group, counted: false });
        return { counted: false };
      }
      const wanted = melody[phrase][index];
      if (group === wanted) {
        count(time, false);
        return { counted: true };
      }
      emit(time, { type: 'sing', group, counted: false });
      wantedSince = time; // the help starts over for the same note
      given = new Set();
      emit(time, { type: 'light', group: wanted, again: true });
      return { counted: false };
    },
    /** The game clock's time now: what was due by then happens. */
    update,
    /** The events since the last call, in time order. */
    events() {
      return out.splice(0).map((event, i) => [event, i]).sort((a, b) => a[0].time - b[0].time || a[1] - b[1]).map(([event]) => event);
    },
    state() {
      return { phrase, index, mode: modeOf(phrase), waiting: started && !done && wantedSince !== null, busyUntil, done };
    },
  };
}
