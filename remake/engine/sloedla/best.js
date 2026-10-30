// The best stars won in each song of Slóeðla's song game, at each level, kept on the device (localStorage), so the song cards
// can show them. A device that will not store (a private window, storage that throws, none at all) still works: it remembers
// for the visit only.

const KEY = 'mosi-sloedla-best';

/** The best stars on `storage`: get(songId, level) 0-3, record(songId, level, stars) keeps the higher, true if it was a new best. */
export function createBest(storage = globalThis.localStorage) {
  let all = {};
  try {
    all = JSON.parse(storage?.getItem(KEY) ?? '{}') ?? {};
  } catch {
    all = {};
  }
  const keyOf = (songId, level) => `${songId}/${level}`;
  return {
    get(songId, level) {
      return Number(all[keyOf(songId, level)]) || 0;
    },
    record(songId, level, stars) {
      const key = keyOf(songId, level);
      if (!(stars > (Number(all[key]) || 0))) return false;
      all = { ...all, [key]: stars };
      try {
        storage?.setItem(KEY, JSON.stringify(all));
      } catch { /* kept for the visit */ }
      return true;
    },
  };
}
