import { BERJALUNDUR } from './berjalundur.js';
import { STEINAGLJUFUR } from './steinagljufur.js';

/** The levels, in the order the child plays them. Level 1 is always open; the next opens when the one before it is finished. */
export const LEVELS = Object.freeze([BERJALUNDUR, STEINAGLJUFUR]);
export const levelById = id => LEVELS.find(level => level.id === id) ?? null;
export const levelNumber = number => LEVELS.find(level => level.number === number) ?? null;

// The unlocked levels live in one key: a JSON array of level ids. Storage can be missing, blocked or full (a private window, cleared
// site data): every read and write is behind a try/catch, and the game works without it (only level 1 is open then).
const UNLOCKED_KEY = 'minnisspil.unlocked';
const browserStorage = {
  getItem(key) { try { return localStorage.getItem(key); } catch { return null; } },
  setItem(key, value) { localStorage.setItem(key, value); },
};

function savedIds(storage) {
  try {
    const ids = JSON.parse(storage.getItem(UNLOCKED_KEY));
    return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [];
  } catch { return []; }
}

/** The ids of the open levels, a Set that always holds level 1. Only ids of known levels count. */
export function unlockedLevels(storage = browserStorage) {
  const open = new Set([LEVELS[0].id]);
  for (const id of savedIds(storage)) if (levelById(id)) open.add(id);
  return open;
}

/** Opens a level for good: true when it was written, false for an unknown level or storage that does not take it. */
export function unlockLevel(id, storage = browserStorage) {
  if (!levelById(id)) return false;
  try {
    const ids = new Set(savedIds(storage)).add(id);
    storage.setItem(UNLOCKED_KEY, JSON.stringify([...ids]));
    return true;
  } catch { return false; }
}

/**
 * A level played to the end (game.js, at the win): the level itself and the next one are opened for good, as far as storage takes it (so a level
 * reached by ?bord and finished is open the next time too), and the next is taken out of this page's `locked` (chooseLevel's) whether storage took it
 * or not, so that the ending card offers it now. A page opened later reads only storage: without it, the next level is locked there again.
 * Returns the next level, or null after the last.
 */
export function finishLevel(level, locked, storage = browserStorage) {
  const next = LEVELS[LEVELS.indexOf(level) + 1] ?? null;
  unlockLevel(level.id, storage);
  if (next) { unlockLevel(next.id, storage); locked.delete(next.id); }
  return next;
}

/**
 * The level to play from the address (`?bord=2` opens level 2 directly, without being unlocked; a number that is no level is ignored)
 * and the ids of the levels that are still locked (not the one asked for by number).
 */
export function chooseLevel(params, storage = browserStorage) {
  const asked = levelNumber(Number(params?.get?.('bord')));
  const open = unlockedLevels(storage);
  return { level: asked ?? LEVELS[0], locked: new Set(LEVELS.filter(level => level !== asked && !open.has(level.id)).map(level => level.id)) };
}
