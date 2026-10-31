// The records of each song of Slóeðla's song game, at each level: the most stars won (of five) and the most points, each kept
// on its own, on the device (localStorage), so the song cards can show them. A device that will not store (a private window,
// storage that throws, none at all) still works: it remembers for the visit only. The records of three stars (before
// 2026-10-31, key 'mosi-sloedla-best') are not read: stars of three are not stars of five.

const KEY = 'mosi-sloedla-met';
const NONE = Object.freeze({ stars: 0, points: 0 });

/**
 * The records on `storage`: get(songId, level) → { stars, points }; record(songId, level, { stars, points }) keeps the higher of
 * each, true if either rose.
 */
export function createBest(storage = globalThis.localStorage) {
  let all = {};
  try {
    all = JSON.parse(storage?.getItem(KEY) ?? '{}') ?? {};
  } catch {
    all = {};
  }
  const keyOf = (songId, level) => `${songId}/${level}`;
  const read = key => ({ stars: Number(all[key]?.stars) || 0, points: Number(all[key]?.points) || 0 });
  return {
    get(songId, level) {
      return all[keyOf(songId, level)] ? read(keyOf(songId, level)) : { ...NONE };
    },
    record(songId, level, { stars = 0, points = 0 } = {}) {
      const key = keyOf(songId, level);
      const was = read(key);
      if (!(stars > was.stars || points > was.points)) return false;
      all = { ...all, [key]: { stars: Math.max(stars, was.stars), points: Math.max(points, was.points) } };
      try {
        storage?.setItem(KEY, JSON.stringify(all));
      } catch { /* kept for the visit */ }
      return true;
    },
  };
}
