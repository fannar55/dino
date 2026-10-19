// What the child has earned, kept in the browser so it is still there next time: the stars from the
// friends who accepted the invitation, the animals found along the way, and the book's cards the child
// has opened (a card is "Nýtt!" until it is seen). A save from before the book has no seen list, and
// reads as having seen nothing. Kambeðla's card game, "Eitt!", keeps its own: her skill, the rounds the
// child has lost in a row, the stickers won and whether the tutorial has been through (engine/eitt/table.js);
// it is stored only once the game has been played, so a save from before the game reads as it always did.
// "Háls og hali" keeps the fossil kinds the child has found, as hals: { found: [...] }, in the same way: stored with
// the first find, and a save without it loads as before (engine/hals/rules.js has the kinds). Beside them it keeps the game
// left under way (hals.game: the rules' state and who plays, which engine/hals/game.js checks with validateGame before it
// offers "Halda áfram") and whether Mosi has said his intro and Þórseðla her hello (hals.intro, hals.hello), each only
// once it is there.
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

const count = value => (Number.isInteger(value) && value > 0 ? value : 0);

/** The game's state as stored: { skill (0 to 1, or null before the first round), losses, wins, tutorialDone }, or null. */
function eittOf(value) {
  if (!value || typeof value !== 'object') return null;
  const skill = Number.isFinite(value.skill) && value.skill >= 0 && value.skill <= 1 ? value.skill : null;
  return { skill, losses: count(value.losses), wins: count(value.wins), tutorialDone: value.tutorialDone === true };
}

/**
 * The fossil collection as stored: { found } with the ids of the kinds found, in the order they came, and what else the
 * game keeps: `game` (the game under way, a plain object: game.js validates it), `intro` and `hello` (true once said); or null.
 */
function halsOf(value) {
  if (!value || typeof value !== 'object') return null;
  const game = value.game && typeof value.game === 'object' && !Array.isArray(value.game) ? value.game : null;
  return { found: idsOf(value.found), ...(game && { game }), ...(value.intro === true && { intro: true }), ...(value.hello === true && { hello: true }) };
}

/**
 * `get()` is a copy of { stars, findings, seen }, each a list of ids in the order they came. `addStar(id)`,
 * `addFinding(id)` and `addSeen(id)` keep an id once however often they are called, and say whether it was new.
 * `getEitt()` is a copy of the card game's { skill, losses, wins, tutorialDone } (skill null before the first
 * round), and `setEitt(changes)` keeps what it is given and leaves the rest as it was.
 * `getHals()` is a copy of the fossil collection, { found }, and `addHalsFound(kind)` adds a kind of fossil, once however
 * often it is called, and says whether it was new (get() leaves the collection out, so its shape stays the same).
 * `getHalsPlay()` is { game, intro, hello }: the game left under way (or null) and whether the intro and the hello have been
 * said; `setHalsPlay(changes)` keeps what it is given (game: null forgets the game) and leaves the rest as it was.
 */
export function createSave(storage = defaultStorage(), key = 'mosi-remake-v1') {
  const data = { stars: [], findings: [], seen: [] }; // all there is when the storage does not work
  let eitt = null; // the card game's, once a round has been played
  let hals = null; // the fossil collection, once the first fossil has been found

  try {
    const stored = JSON.parse(storage?.getItem(key) ?? 'null');
    if (stored && typeof stored === 'object') {
      data.stars = idsOf(stored.stars);
      data.findings = idsOf(stored.findings);
      data.seen = idsOf(stored.seen); // none in a save from before the book
      eitt = eittOf(stored.eitt); // none in a save from before the game
      hals = halsOf(stored.hals); // none in a save from before the fossils
    }
  } catch {
    // nothing stored, or nothing that can be read: start empty
  }

  function write() {
    try {
      storage?.setItem(key, JSON.stringify({ ...data, ...(eitt && { eitt }), ...(hals && { hals }) }));
    } catch {
      // not kept for next time; still kept for now
    }
  }

  function add(list, id) {
    if (typeof id !== 'string' || !id) throw new TypeError(`A save keeps ids, which are names, not ${String(id)}`);
    if (data[list].includes(id)) return false;
    data[list].push(id);
    write();
    return true;
  }

  return {
    get: () => ({ stars: [...data.stars], findings: [...data.findings], seen: [...data.seen] }),
    addStar: id => add('stars', id),
    addFinding: id => add('findings', id),
    addSeen: id => add('seen', id),
    getEitt: () => ({ skill: eitt?.skill ?? null, losses: eitt?.losses ?? 0, wins: eitt?.wins ?? 0, tutorialDone: eitt?.tutorialDone ?? false }),
    setEitt(changes) {
      eitt = eittOf({ ...eitt, ...changes }) ?? eittOf({});
      write();
    },
    getHals: () => ({ found: [...(hals?.found ?? [])] }),
    addHalsFound(kind) {
      if (typeof kind !== 'string' || !kind) throw new TypeError(`A save keeps ids, which are names, not ${String(kind)}`);
      if (hals?.found.includes(kind)) return false;
      hals = { ...hals, found: [...(hals?.found ?? []), kind] };
      write();
      return true;
    },
    getHalsPlay: () => ({
      game: hals?.game ? JSON.parse(JSON.stringify(hals.game)) : null,
      intro: hals?.intro === true,
      hello: hals?.hello === true,
    }),
    setHalsPlay(changes = {}) {
      const next = { ...hals, found: hals?.found ?? [] };
      if ('game' in changes) next.game = changes.game ? JSON.parse(JSON.stringify(changes.game)) : null;
      if ('intro' in changes) next.intro = changes.intro === true;
      if ('hello' in changes) next.hello = changes.hello === true;
      hals = halsOf(next);
      write();
    },
  };
}
