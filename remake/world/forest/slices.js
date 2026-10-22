// Long builds in slices. A forest takes one to three seconds to build (world/forest/forest.js): in one go that is a frozen picture,
// which is fine behind the black of a fade but not while the child watches (main.js builds a chapter's later places while the start
// button waits and while the first scenes play). So the build is written as a generator that yields now and then, at points where
// it can stop for a frame without anything being half made (after a tree has been tried, a row of grass or of the ground laid, a
// bucket of plants merged), and one of two runners drives it:
//
//   runSync(steps)                  to the end at once, as before (the start place, a seek, the tests): returns its value
//   runSliced(steps, { budget, wait, onSlice })   a slice at a time: it runs on until `budget()` milliseconds have gone, waits for
//                                   `wait()` (the next frame), and goes on; resolves to its value. `budget` is read before each
//                                   slice, so the page can give a build more while the screen is black. `onSlice(ms)` hears how long
//                                   each slice took (a probe, a test)
//
// A step function calls another with `yield* other()`. What it builds is the same however it is driven: the yields only stop it.

/**
 * What a step yields when the next one is long by itself (some 20 to 30 ms: a whole prop made in one go): runSliced ends the slice
 * there, unless it is the slice's first step, so that the long step begins a slice of its own instead of coming on top of the budget.
 * runSync takes no notice of it. Any other value a step yields is only a mark for whoever reads the steps (world/forest/forest.js
 * yields the name of the part it has just made, 'noise', 'ground', 'grass', ..., to profile a build by): both runners pass it by.
 */
export const FRESH = Symbol('fresh slice');

/** The next frame (requestAnimationFrame), or the next turn of the event loop where there are no frames (Node). */
export const nextFrame = () => new Promise(resolve => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
  else setTimeout(resolve, 0);
});

export function runSync(steps) {
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}

export async function runSliced(steps, { budget = () => 20, wait = nextFrame, onSlice = null } = {}) {
  for (;;) {
    const start = performance.now();
    const limit = Math.max(1, budget());
    let next;
    let ran = 0;
    do {
      next = steps.next();
      ran++;
    } while (!next.done && performance.now() - start < limit && !(next.value === FRESH && ran > 1));
    onSlice?.(performance.now() - start);
    if (next.done) return next.value;
    await wait();
  }
}
