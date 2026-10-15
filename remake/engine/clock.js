// The game clock. Everything time-driven reads it, so pausing stops the whole game consistently,
// and captures can step it deterministically to an exact time and then freeze it.
export function createClock() {
  let time = 0;
  let paused = false;
  let frozen = false;
  let scale = 1;
  return {
    get time() { return time; },
    get paused() { return paused; },
    get frozen() { return frozen; },
    setPaused(value) { paused = Boolean(value); },
    setScale(value) { scale = Math.max(0, Number(value) || 0); },
    /** Advance by real seconds from the frame loop; returns the game delta actually applied. */
    tick(realDelta) {
      if (paused || frozen) return 0;
      const dt = Math.min(Math.max(realDelta, 0), 0.1) * scale;
      time += dt;
      return dt;
    },
    /** Advance by an exact game delta (seeking, tests). Ignores pause and freeze. */
    step(dt) { time += dt; return dt; },
    /** Stop the frame loop from advancing time (deterministic captures). */
    freeze() { frozen = true; },
  };
}
