// Mosi's ask and repeat rules for "Hvar er vinur minn?".
//
// The spec asks two things of Mosi:
//  - "Spyrja Mosa" (his round button): when the child taps it, Mosi says the line of the moment again. If he has
//    not yet said one for this moment, he says the level's line for it, or else the level's help line. He never
//    starts over a line he is already saying, and never during a scene or a dialog (`busy`).
//  - Waiting: the finger shows after IDLE_HINT seconds without a tap; after IDLE_REPEAT seconds Mosi says the
//    moment's line once more, and only once for that moment (`repeated` holds the key he repeated for).
// All pure: the game passes in what it knows and plays whatever line comes back.

export const IDLE_HINT = 4;
export const IDLE_REPEAT = 10;
// The old game saved the sound button's state here; the button is gone, so the key is forgotten.
export const OLD_MUTE_KEY = 'mosi.memory.muted.v1';

export function forgetOldMute(storage) {
  try { storage?.removeItem(OLD_MUTE_KEY); } catch { /* storage blocked: nothing to forget */ }
}

// `last` is { id, key } | null: the last line that began and the story key it began under.
export function momentLine({ key, last, voice }) {
  return last?.key === key ? last.id : voice?.[key] ?? null;
}

export function askLine({ key, last, voice, help, speaking, busy }) {
  if (speaking || busy) return null;
  return momentLine({ key, last, voice }) ?? help ?? null;
}

export function repeatDue({ idle, key, repeated, mayAct, speaking, line }) {
  return idle >= IDLE_REPEAT && Boolean(mayAct) && !speaking && line !== null && line !== undefined && repeated !== key;
}
