// The search for hidden things (spec scene 8): the child looks around with a drag (s.search wires
// that to the camera) and taps what they find. A child who is stuck gets a hint, and one who does
// nothing still gets through: after enough hints the thing is found for them, so the search always
// ends and there is no way to fail it.

const DEFAULT_RADIUS = 0.5; // metres: how big a target is to a tap, before the pointer's 44 px minimum
const SEEK_EVERY = 3; // seconds between finds while seeking (captures), when there is no player

/**
 * A scheduler generator: run it as a task, or inside another script with yield*.
 *   targets      [{ name, point, hint, radius = 0.5 }]: what to find. `point` is a point spec, `hint` the line
 *                the speaker says to point the child to it. They are tap targets until they are found.
 *   hintAfter    seconds without a find before a hint, and between hints
 *   helpAfter    hints one target gets before the next hint time finds it for the child
 *   speaker      who says the hints
 *   onFound      onFound(name, index) after each find, index counting from 0. When it returns a task, handle or
 *                generator object, the search waits for it before it takes taps again (a tap meanwhile is lost).
 * Hints go to the first target not found yet, in list order. A hint pans the camera there (director.hint)
 * and says the line, and taps still count while it runs: a find stops it. While seeking, no one taps
 * and no one hints: the next target in the list is found every 3 s.
 */
export function* searchFlow({ s, director }, { targets, hintAfter = 12, helpAfter = 3, speaker = 'mosi', onFound }) {
  const names = targets.map(t => t.name);
  const twice = names.find((name, i) => names.indexOf(name) !== i);
  if (twice !== undefined) throw new TypeError(`Search targets need different names: "${twice}" comes twice`);
  for (const t of targets) if (t.hint == null) throw new TypeError(`Search target "${t.name}" needs a hint line`);

  const left = [...targets]; // not found yet, in list order
  const hints = new Map(); // name -> hints given
  let found = 0;
  let hint = null; // the hint under way: { pan, line }

  function stopHint() {
    hint?.pan.cancel();
    hint?.line.cancel();
    hint = null;
  }

  function* find(target) {
    left.splice(left.indexOf(target), 1);
    s.target(target.name, null);
    stopHint();
    const result = onFound?.(target.name, found++);
    if (result && typeof result === 'object') yield result;
  }

  try {
    for (const t of targets) s.target(t.name, { point: t.point, radius: t.radius ?? DEFAULT_RADIUS });
    while (left.length) {
      if (s.seeking) {
        yield s.wait(SEEK_EVERY);
        yield* find(left[0]);
        continue;
      }
      // A tap on a target that is not found, or the end of the quiet.
      const tapped = yield s.race(s.tap(left.map(t => t.name)), s.wait(hintAfter));
      if (tapped !== undefined) {
        yield* find(left.find(t => t.name === tapped));
        continue;
      }
      const next = left[0];
      const given = hints.get(next.name) ?? 0;
      if (given >= helpAfter) {
        yield* find(next);
        continue;
      }
      hints.set(next.name, given + 1);
      stopHint();
      hint = { pan: director.hint(next.point), line: s.say(speaker, next.hint) };
    }
  } finally {
    stopHint();
    for (const t of left) s.target(t.name, null);
  }
}
