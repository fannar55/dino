// What holds the game's sound. The sound follows the game clock, which stands still while the child's book is open and while the
// tab is hidden (a hidden tab draws no frames), so each of those holds the voice, the music and the effects, and the sound goes on
// only when none of them does: a tab that comes back must not start the sound under a book that is still open.

/**
 * `parts` are what has setPaused(paused). Returns hold(reason, on): `on` says whether `reason` holds the sound now. A part is
 * told only when the sound goes from held to not held or back.
 */
export function createHold(parts) {
  const reasons = new Set();
  let held = false;
  return function hold(reason, on) {
    if (on) reasons.add(reason);
    else reasons.delete(reason);
    if ((reasons.size > 0) === held) return;
    held = !held;
    for (const part of parts) part.setPaused(held);
  };
}
