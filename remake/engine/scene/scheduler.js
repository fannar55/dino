// Coroutine scheduler for scene scripts. A script is a generator function: it yields what it waits
// for and the scheduler resumes it on game-clock time. Generators step synchronously, so a scene can
// fast-forward to an exact time for captures, pause with the clock and be cancelled at any yield.
// (Async functions cannot do this: their continuations run on the microtask queue, out of our hands.)
//
// What a script may yield:
//   a number, or wait(s)   resume after s seconds of scene time, counted from the task's own clock,
//                          so a chain of waits never drifts with frame timing
//   nothing (yield;)       resume on the next frame
//   a handle { done }      resume when it is done (camera moves, walks, lines); cancelled with the task
//   a generator object     run it as a child task and resume with its return value
//   a task                 (from start()) wait for it and resume with its return value
//   all(...items)          run the items side by side; resume with all their values (the first error
//                          cancels the rest)
//   race(...items)         resume with the item that finished earliest; the others are cancelled
//   a Promise              resume when it settles (player input, loading); `pending` counts them so
//                          a seek can let them settle
//   until(fn)              resume when fn() returns true (checked each frame)
// Nothing resumes on a frame where time does not move (pause, frozen captures).

const KIND = Symbol('scene-wait');

function seconds(value) {
  const s = Number(value);
  if (!Number.isFinite(s)) throw new TypeError(`A scene wait needs a number of seconds, not ${String(value)}`);
  return Math.max(0, s);
}

export const wait = value => ({ [KIND]: 'time', seconds: seconds(value) });
export const all = (...items) => ({ [KIND]: 'all', items: items.flat() });
export const race = (...items) => ({ [KIND]: 'race', items: items.flat() });
export const until = predicate => ({ [KIND]: 'until', predicate });

const isIterator = x => Boolean(x) && typeof x.next === 'function' && typeof x.throw === 'function';

export function createScheduler({ onError = error => console.error('[scene]', error) } = {}) {
  let time = 0;
  let frame = 0;
  let pending = 0; // promises yielded and not yet settled
  let running = null; // the task being resumed right now
  const live = new Set();

  // Finish a generator that is being cancelled, including a `yield` inside its finally block.
  function close(iterator) {
    try {
      let step = iterator.return?.();
      // A yield inside the finally block suspends it: keep it going (waits there count as zero).
      for (let i = 0; step && !step.done && i < 100; i++) step = iterator.next();
    } catch (error) {
      onError(error);
    }
  }

  class Task {
    constructor(iterator, start, parent) {
      this.iterator = iterator;
      this.t = start; // the task's own clock: the exact scene time of its last resume
      this.parent = parent;
      this.done = false;
      this.cancelled = false;
      this.failed = false;
      this.value = undefined;
      this.error = undefined;
      this.cond = { kind: 'start' };
    }

    cancel() {
      if (this.done) return;
      this.cancelled = true;
      this.done = true;
      live.delete(this);
      const c = this.cond;
      if (c.kind === 'tasks') c.tasks.forEach(task => task.cancel());
      else if (c.kind === 'handle') c.handle.cancel?.();
      else if (c.kind === 'promise' && !c.settled) {
        // Nobody waits for it any more (it lost a race, say), so a seek must not wait for it either. Marked settled,
        // so when it does settle (or never does) it is not counted off again.
        c.settled = true;
        pending--;
      }
      close(this.iterator); // runs the script's finally blocks
    }
  }

  function spawn(item, parent, start = parent ? parent.t : time) {
    const iterator = isIterator(item) ? item : (function* waitFor() { return yield item; })();
    const task = new Task(iterator, start, parent);
    live.add(task);
    return task;
  }

  function condition(task, y) {
    if (y === undefined || y === null) return { kind: 'frame', frame };
    if (typeof y === 'number') return { kind: 'time', until: task.t + seconds(y) };
    if (y instanceof Task) return { kind: 'tasks', mode: 'one', tasks: [y] };
    switch (y[KIND]) {
      case 'time': return { kind: 'time', until: task.t + y.seconds };
      case 'until': return { kind: 'until', predicate: y.predicate };
      case 'all':
      case 'race': return { kind: 'tasks', mode: y[KIND], tasks: y.items.map(item => (item instanceof Task ? item : spawn(item, task))) };
      default: break;
    }
    if (isIterator(y)) return { kind: 'tasks', mode: 'one', tasks: [spawn(y, task)] };
    if (typeof y.then === 'function') {
      const c = { kind: 'promise', settled: false, value: undefined, failed: false, error: undefined };
      pending++;
      y.then(
        value => { if (c.settled) return; c.settled = true; c.value = value; pending--; }, // settled already: cancelled
        error => { if (c.settled) return; c.settled = true; c.failed = true; c.error = error; pending--; },
      );
      return c;
    }
    if (typeof y === 'object' && 'done' in y) {
      // A handle that is already done resumes at the task's own time, so it never adds drift.
      return y.done ? { kind: 'now', value: y } : { kind: 'handle', handle: y };
    }
    throw new TypeError(`A scene script yielded something it cannot wait for: ${String(y)}`);
  }

  // Is the task ready to resume? Returns { at, value, failed, error } or null.
  function ready(task) {
    const c = task.cond;
    switch (c.kind) {
      case 'start': return { at: task.t };
      case 'now': return { at: task.t, value: c.value };
      case 'fail': return { at: task.t, failed: true, error: c.error };
      case 'frame': return frame > c.frame ? { at: time } : null;
      case 'time': return c.until <= time + 1e-9 ? { at: c.until } : null;
      case 'until': {
        let ok;
        try {
          ok = c.predicate();
        } catch (error) {
          return { at: time, failed: true, error };
        }
        return ok ? { at: time } : null;
      }
      case 'handle': return c.handle.done ? { at: time, value: c.handle } : null;
      case 'promise': return c.settled ? { at: time, value: c.value, failed: c.failed, error: c.error } : null;
      case 'tasks': {
        const broken = c.tasks.find(t => t.done && t.failed);
        if (broken) {
          c.tasks.forEach(t => { if (t !== broken) t.cancel(); });
          return { at: Math.max(task.t, broken.t), failed: true, error: broken.error };
        }
        if (c.mode === 'race') {
          if (!c.tasks.length) return { at: task.t };
          let winner = null;
          for (const t of c.tasks) if (t.done && (!winner || t.t < winner.t)) winner = t;
          if (!winner) return null;
          c.tasks.forEach(t => { if (t !== winner) t.cancel(); });
          return { at: Math.max(task.t, winner.t), value: winner.value };
        }
        if (!c.tasks.every(t => t.done)) return null;
        const at = Math.max(task.t, ...c.tasks.map(t => t.t));
        return { at, value: c.mode === 'one' ? c.tasks[0].value : c.tasks.map(t => t.value) };
      }
      default: return null;
    }
  }

  function finish(task, value, failed = false, error = undefined) {
    task.done = true;
    task.value = value;
    task.failed = failed;
    task.error = error;
    live.delete(task);
    if (failed && !task.parent) onError(error);
  }

  // Resume a task as long as it is ready. Returns true if it moved at all.
  function advance(task) {
    let moved = false;
    for (let guard = 0; guard < 10000 && !task.done; guard++) {
      const r = ready(task);
      if (!r) break;
      moved = true;
      task.t = Math.max(task.t, r.at);
      let step;
      running = task;
      try {
        step = r.failed ? task.iterator.throw(r.error) : task.iterator.next(r.value);
      } catch (error) {
        running = null;
        finish(task, undefined, true, error);
        break;
      }
      running = null;
      if (step.done) {
        finish(task, step.value);
        break;
      }
      try {
        task.cond = condition(task, step.value);
      } catch (error) {
        task.cond = { kind: 'fail', error }; // thrown back into the script at its yield
      }
    }
    return moved;
  }

  return {
    /** Scene time at the latest frame. */
    get time() { return time; },
    /** The running task's exact time inside a script (its wait deadline), else the frame time. */
    get now() { return running ? running.t : time; },
    get frame() { return frame; },
    get idle() { return live.size === 0; },
    /** Promises scripts are waiting on; a seek lets them settle before stepping on. */
    get pending() { return pending; },
    /** Start a top-level script (a generator object). Returns its task. */
    run(item) {
      return spawn(item, null);
    },
    /** Start something now, from inside a script, at that script's exact time. Returns its task. */
    start(item) {
      return spawn(item, null, running ? running.t : time);
    },
    /** Advance scene time by dt and resume everything that is ready, in order. */
    update(dt) {
      if (!(dt > 0)) return; // paused or frozen
      time += dt;
      frame++;
      for (let pass = 0; pass < 64; pass++) {
        let moved = false;
        for (const task of [...live]) if (!task.done && advance(task)) moved = true;
        if (!moved) break;
      }
    },
    cancelAll() {
      for (const task of [...live]) task.cancel();
    },
  };
}
