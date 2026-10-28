// A required tap on an actor that also ends by itself (R12): a wait for the child with no hints. Chapter 1's float into the
// saddle and chapter 2's basket held up both wait this way.
//
//   const how = yield* tapOrWait(s, 'egill', s.wait(6));   // 'egill' if he was tapped, else what `idle` gave

/**
 * Puts a tap target on actor `name` (its body centre, `radius` metres) and waits for a tap on it or for `idle` (anything a scene can
 * wait on) to end, whichever comes first; the target comes off either way. Resolves with the name tapped, or `idle`'s value.
 */
export function* tapOrWait(s, name, idle, { radius = 0.7 } = {}) {
  s.target(name, { point: name, radius });
  try {
    return yield s.race(s.tap(name), idle);
  } finally {
    s.target(name, null);
  }
}
