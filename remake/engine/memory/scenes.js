/**
 * Short scripts on the game clock: each moment of the memory game is a timeline of lines.
 *
 *   const runner = createSceneRunner({ perform: line => { ... } });
 *   runner.play([{ at: 0, shot: ... }, { at: .1, act: ... }, { at: 1, wait: { tap: 'log', count: 3, timeout: 4 } }]);
 *
 * A line is { at, shot?, act?, fx?, sound?, say?, wait? }. perform(line) runs every key except `wait`
 * (the world decides what they mean). `wait = { tap, count, timeout, onTap?(i), onTimeout?() }` stops
 * that script's clock until `count` taps on `tap` or until `timeout` seconds have passed; either way the
 * script then goes on. Lines due at a script's start run inside play(). update(dt) with dt <= 0 (a paused
 * or hidden game) changes nothing. cancelAll() drops every script without calling its onDone.
 */
export function createSceneRunner({ perform = () => {} } = {}) {
  let scripts = [], nextId = 1;
  const EPSILON = 1e-9;
  const performs = line => Object.keys(line).some(key => key !== 'at' && key !== 'wait');

  function fire(script, line) {
    if (performs(line)) perform(line, script.id);
    if (script.cancelled) return;
    if (line.wait) {
      const { tap = '', count = 1, timeout = Infinity } = line.wait;
      script.wait = { spec: line.wait, tap: String(tap), count: Math.max(1, Math.floor(count) || 1), timeout: Math.max(0, Number(timeout) || 0), taps: 0, elapsed: 0 };
    }
  }

  function finish(script) {
    scripts = scripts.filter(value => value !== script);
    script.cancelled = true; script.onDone?.();
  }

  // Run the script forward by `available` seconds of game time, firing lines in order.
  function advance(script, available) {
    while (!script.cancelled) {
      if (script.wait) {
        const wait = script.wait, need = wait.timeout - wait.elapsed;
        if (available + EPSILON < need) { wait.elapsed += available; return; }
        available = Math.max(0, available - Math.max(0, need)); wait.elapsed = wait.timeout; script.wait = null;
        wait.spec.onTimeout?.();
        continue;
      }
      const line = script.lines[script.index];
      if (!line) { finish(script); return; }
      const gap = Math.max(0, line.at - script.clock);
      if (gap > available + EPSILON) { script.clock += available; return; }
      available = Math.max(0, available - gap); script.clock = Math.max(script.clock, line.at); script.index++;
      fire(script, line);
    }
  }

  return {
    /** Start a script. Returns its id. Lines at time 0 run now. */
    play(lines = [], { onDone } = {}) {
      const ordered = lines.map((line, order) => ({ line, order, at: Math.max(0, Number(line.at) || 0) }))
        .sort((a, b) => a.at - b.at || a.order - b.order).map(({ line, at }) => ({ ...line, at }));
      const script = { id: nextId++, lines: ordered, index: 0, clock: 0, wait: null, onDone, cancelled: false };
      scripts.push(script);
      advance(script, 0);
      return script.id;
    },
    update(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      for (const script of [...scripts]) if (!script.cancelled) advance(script, dt);
    },
    /** A tap on `target`. True when a waiting script took it. */
    tap(target) {
      const script = scripts.find(value => !value.cancelled && value.wait?.tap === target);
      if (!script) return false;
      const wait = script.wait, index = wait.taps++;
      if (wait.taps >= wait.count) script.wait = null;
      wait.spec.onTap?.(index);
      if (!script.wait && !script.cancelled) advance(script, 0);
      return true;
    },
    /** The first script that waits for taps: what to tap, how many taps are still needed, seconds left. */
    waiting() {
      const wait = scripts.find(value => value.wait)?.wait;
      return wait ? { target: wait.tap, count: wait.count - wait.taps, left: Math.max(0, wait.timeout - wait.elapsed) } : null;
    },
    cancel(id) {
      const script = scripts.find(value => value.id === id); if (!script) return false;
      script.cancelled = true; scripts = scripts.filter(value => value !== script); return true;
    },
    cancelAll() {
      for (const script of scripts) script.cancelled = true;
      scripts = [];
    },
    busy: () => scripts.length > 0,
    isPlaying: id => scripts.some(value => value.id === id),
  };
}
