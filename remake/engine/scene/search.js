// The search for hidden things (spec scene 8): the child looks around with a drag (s.search wires
// that to the camera) and taps what they find. A child who is stuck gets a hint, and one who does
// nothing still gets through: after enough hints the thing is found for them, so the search always
// ends and there is no way to fail it.

const DEFAULT_RADIUS = 0.5; // metres: how big a target is to a tap, before the pointer's 44 px minimum
const SEEK_EVERY = 3; // seconds between finds while seeking (captures), when there is no player

/**
 * A scheduler generator: run it as a task, or inside another script with yield*.
 *   targets      [{ name, point, hint, radius = 0.5 }]: what to find. `point` is a point spec, `hint` the line
 *                the speaker says to point the child to it, or a list of lines for its first, second, third hint
 *                (the last again after that). They are tap targets until they are found.
 *   hintAfter    seconds without a find before a hint, and between hints
 *   helpAfter    hints one target gets before the next hint time finds it for the child
 *   quick        { hintAfter, helpAfter } for the targets after one was found for the child, until the child taps
 *                one again: a child who did not find one in all that time is helped sooner with the next (chapter 2's
 *                berries). Left out, every target waits as long.
 *   speaker      who says the hints
 *   onFound      onFound(name, index, how) after each find, index counting from 0, how 'tapped', 'helped' (found for
 *                the child) or 'seeking'. When it returns a task, handle or generator object, the search waits for it
 *                before it takes taps again (a tap meanwhile is lost).
 * Hints go to the first target not found yet, in list order. A hint pans the camera there (director.hint)
 * and says the line, and taps still count while it runs: a find stops it. While seeking, no one taps
 * and no one hints: the next target in the list is found every 3 s.
 */
export function* searchFlow({ s, director }, { targets, hintAfter = 12, helpAfter = 3, quick = null, speaker = 'mosi', onFound }) {
  const names = targets.map(t => t.name);
  const twice = names.find((name, i) => names.indexOf(name) !== i);
  if (twice !== undefined) throw new TypeError(`Search targets need different names: "${twice}" comes twice`);
  for (const t of targets) {
    if (t.hint == null || (Array.isArray(t.hint) && !t.hint.length)) throw new TypeError(`Search target "${t.name}" needs a hint line`);
  }

  const left = [...targets]; // not found yet, in list order
  const hints = new Map(); // name -> hints given
  let found = 0;
  let hint = null; // the hint under way: { pan, line }
  let helped = false; // the last find was made for the child: the next waits are `quick` ones

  function stopHint() {
    hint?.pan.cancel();
    hint?.line.cancel();
    hint = null;
  }

  function* find(target, how) {
    left.splice(left.indexOf(target), 1);
    s.target(target.name, null);
    stopHint();
    helped = how === 'helped';
    const result = onFound?.(target.name, found++, how);
    if (result && typeof result === 'object') yield result;
  }
  const pace = () => (helped && quick ? { hintAfter: quick.hintAfter ?? hintAfter, helpAfter: quick.helpAfter ?? helpAfter } : { hintAfter, helpAfter });
  const lineOf = (target, given) => (Array.isArray(target.hint) ? target.hint[Math.min(given, target.hint.length - 1)] : target.hint);

  try {
    for (const t of targets) s.target(t.name, { point: t.point, radius: t.radius ?? DEFAULT_RADIUS });
    while (left.length) {
      if (s.seeking) {
        yield s.wait(SEEK_EVERY);
        yield* find(left[0], 'seeking');
        continue;
      }
      // A tap on a target that is not found, or the end of the quiet.
      const now = pace();
      const tapped = yield s.race(s.tap(left.map(t => t.name)), s.wait(now.hintAfter));
      if (tapped !== undefined) {
        yield* find(left.find(t => t.name === tapped), 'tapped');
        continue;
      }
      const next = left[0];
      const given = hints.get(next.name) ?? 0;
      if (given >= now.helpAfter) {
        yield* find(next, 'helped');
        continue;
      }
      hints.set(next.name, given + 1);
      stopHint();
      hint = { pan: director.hint(next.point), line: s.say(speaker, lineOf(next, given)) };
    }
  } finally {
    stopHint();
    for (const t of left) s.target(t.name, null);
  }
}
