// Mosi's ask and repeat rules for "Hvar er vinur minn?".
//
// The spec asks two things of Mosi:
//  - "Spyrja Mosa" (his round button): when the child taps it, Mosi says what to do now: the instruction of the
//    moment. If the moment has none, he says the level's help line. He never starts over a line he is already
//    saying, and never during a scene or a dialog (`busy`).
//  - Waiting: the finger shows after IDLE_HINT seconds without a tap; after IDLE_REPEAT seconds Mosi says the
//    moment's instruction once more, and only once for that moment (`repeated` holds the key he repeated for).
// The instruction is never a reaction line (a match, a gift, "not that one"): a waiting moment has its own line
// (`voice[key]`), and a kind of moment may have one for all its keys (`kinds[kind]`, e.g. a search says `first`).
// It also says which beats of a tap-along he counts aloud (`countLine`).
// All pure: the game passes in what it knows and plays whatever line comes back.

export const IDLE_HINT = 4;
export const IDLE_REPEAT = 10;
// The old game saved the sound button's state here; the button is gone, so the key is forgotten.
export const OLD_MUTE_KEY = 'mosi.memory.muted.v1';

export function forgetOldMute(storage) {
  try { storage?.removeItem(OLD_MUTE_KEY); } catch { /* storage blocked: nothing to forget */ }
}

// The instruction of a moment: its own line, else its kind's line, else none.
export function momentLine({ key, kind, voice, kinds }) {
  return voice?.[key] ?? kinds?.[kind] ?? null;
}

export function askLine({ key, kind, voice, kinds, help, speaking, busy }) {
  if (speaking || busy) return null;
  return momentLine({ key, kind, voice, kinds }) ?? help ?? null;
}

export function repeatDue({ idle, key, repeated, mayAct, speaking, line }) {
  return idle >= IDLE_REPEAT && Boolean(mayAct) && !speaking && line !== null && line !== undefined && repeated !== key;
}

// Mosi counts a tap-along's beat only where its big word is the word of one of his counting takes (voice-lines.js COUNT_TAKES, the
// owner's ruling of 2026-11-08): by the word itself, never by a list of steps, so a beat word changed later cannot be voiced wrongly.
// «Einn!» gives its take; «Upp!», «ÝTA!», «BÚMM!», «TOGA!» and the bark's «Ein!»/«Tvær!»/«Þrjár!» give none (null).
export function countLine(word, takes) {
  if (typeof word !== 'string') return null;
  return Object.entries(takes ?? {}).find(([, take]) => take.word === word)?.[0] ?? null;
}
