// What the child has earned, kept in the browser so it is still there next time: the stars from the
// friends who accepted the invitation, the animals found along the way, and the book's cards the child
// has opened (a card is "Nýtt!" until it is seen). A save from before the book has no seen list, and
// reads as having seen nothing.
//
// Storage can fail in many ways (blocked site data, a full disk, a private window, even reading
// globalThis.localStorage can throw), and the game must not stop for any of them: every call to the
// storage sits in try/catch, and the save then lives in memory for as long as the page does.

/** The browser's storage, or nothing when it cannot even be looked at. */
function defaultStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The ids of a stored list: strings only, each once. */
const idsOf = value => (Array.isArray(value) ? [...new Set(value.filter(id => typeof id === 'string' && id))] : []);

/**
 * `get()` is a copy of { stars, findings, seen }, each a list of ids in the order they came. `addStar(id)`,
 * `addFinding(id)` and `addSeen(id)` keep an id once however often they are called, and say whether it was new.
 */
export function createSave(storage = defaultStorage(), key = 'mosi-remake-v1') {
  const data = { stars: [], findings: [], seen: [] }; // all there is when the storage does not work

  try {
    const stored = JSON.parse(storage?.getItem(key) ?? 'null');
    if (stored && typeof stored === 'object') {
      data.stars = idsOf(stored.stars);
      data.findings = idsOf(stored.findings);
      data.seen = idsOf(stored.seen); // none in a save from before the book
    }
  } catch {
    // nothing stored, or nothing that can be read: start empty
  }

  function add(list, id) {
    if (typeof id !== 'string' || !id) throw new TypeError(`A save keeps ids, which are names, not ${String(id)}`);
    if (data[list].includes(id)) return false;
    data[list].push(id);
    try {
      storage?.setItem(key, JSON.stringify(data));
    } catch {
      // not kept for next time; still kept for now
    }
    return true;
  }

  return {
    get: () => ({ stars: [...data.stars], findings: [...data.findings], seen: [...data.seen] }),
    addStar: id => add('stars', id),
    addFinding: id => add('findings', id),
    addSeen: id => add('seen', id),
  };
}
