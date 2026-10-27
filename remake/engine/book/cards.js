// The book's cards (spec sections 3 and 6): one per dinosaur the child meets, animal the child finds and fossil the child digs up,
// each with 3 to 10 short pages that the narrator reads (the dinosaurs' have nine or ten, the animals' six or seven, the fossils' three; a page's picture
// may be of any kind, a photograph as well as a drawing, and page one's is also the tile's). A dinosaur whose card is not written
// yet is a teaser: no pages, only a tile, a picture and a line Mosi says when the tile is tapped. They are data, in
// assets/book/cards.json, so a later chapter adds cards, and a spread of the Dýrin page for them, without code:
//
//   { "cards": [ { "id", "name", "order", "group", "unlock", "spread", "refind", "say", "picture",
//                  "pages": [ { "image", "text", "audio", "sources", "model" }, ... ] }, ... ],
//     "spreads": [ { "spread", "findMe" }, ... ] }
//
//   id       the card's name in code, the save's seen list and the style sheet's hues (book.css [data-card])
//   name     what the tile says, in big letters
//   order    where its tile is: the dinosaurs first (Mosi, Kambeðla, ...), then the critters
//   group    'dinosaur' (a tile on the Risaeðlur page), 'animal' (the Dýrin page; what a card with no group is) or 'fossil' (the Safnið
//            page, which opens a fossil's card when the card unlocks with that fossil)
//   unlock   { start: true } from the start, { found: '<id>' } with the find a chapter passes to s.found, { star: '<id>' } with the
//            star it passes to s.star, { place: '<id>' } with a place on the book's map (the save's places: sloedla, flugedla,
//            uggedla, fen) or { fossil: '<kind>' } with a fossil of "Háls og hali" in the collection (the save's getHals().found)
//   refind   (optional) the page, from 1, the card opens on the first time the child opens it after its animal was found again in
//            a new place (chapter 2's frog, in the Fen, whose seventh page is the Fen's); its last page when it says none
//   spread   which spread of the Dýrin page its tile is on, from 1 (chapter 1's animals, which say no spread) up: a spread holds
//            SPREAD_MAX tiles, four on each page, in card order (chapter 2's are on the second, the Fen's); one with a later spread
//            after it holds one fewer, because the corner that turns on lies where the right page's fourth tile would be. Only
//            animals have a spread: the dinosaurs are on one spread of their own and the fossils are stickers.
//   say      a teaser's line (an id in lines.json) that Mosi says when its tile is tapped, in place of a card opening; every card
//            with no pages has one, and a card with pages has none
//   picture  a picture's id in the media manifest that the tile shows; a card with pages shows page one's picture when it names
//            none, and a teaser has to name one
//   image    a picture's id in the media manifest (media.js); page one's picture is also the tile's, unless the card names a picture
//   audio    the narrator's line in lines.json, book_<card>_<n> with n from 1
//   sources  where the page's facts come from (a URL or a reference), kept with the data and never shown to a child;
//            a page still waiting for its text has the one source PLACEHOLDER
//   model    (optional) a 3D model for the page, a path read from remake/ as the images' are (a GLB): the card viewer shows the model
//            on the page's picture, which stays if the model cannot be shown
//
//   findMe   (spreads) the narrator's line for a tile of that spread not found yet, which says where its animal is; a spread the
//            file says nothing about says FIND_ME, "Finndu mig í skóginum!"
//
// parseCards checks all of it once, when the book's data is read, so a slip in the file is said there, naming the card. What the
// unlocks read from the save is bookState's: the book takes it from there and hands it to isUnlocked and isNew.

export const PAGE_MIN = 3;
export const PAGE_MAX = 10; // the animals' cards have six or seven, the dinosaurs' nine or ten, the fossils' three (the spec allows up to ten: 3D page, size, fossils)
export const SPREAD_MAX = 8;
export const GROUPS = ['dinosaur', 'animal', 'fossil'];
export const PLACEHOLDER = 'placeholder';
export const FIND_ME = 'book_find_me';

const text = value => typeof value === 'string' && value.trim() !== '';
const UNLOCK_KEYS = ['found', 'star', 'place', 'fossil'];

/** The unlock as cards.json gives it, or null when it is none of the five. */
function unlockOf(value) {
  if (!value || typeof value !== 'object') return null;
  const keys = Object.keys(value);
  if (keys.length !== 1) return null;
  if (keys[0] === 'start') return value.start === true ? { start: true } : null;
  if (UNLOCK_KEYS.includes(keys[0])) return text(value[keys[0]]) ? { [keys[0]]: value[keys[0]] } : null;
  return null;
}

/** The narrator's find-me line of each spread cards.json names: a Map from the spread's number. */
function spreadLines(spreads) {
  const lines = new Map();
  if (spreads === undefined) return lines;
  if (!Array.isArray(spreads)) throw new Error('cards.json: the spreads should be a list, under "spreads"');
  spreads.forEach((raw, index) => {
    const name = Number.isInteger(raw?.spread) && raw.spread > 0 ? `spread ${raw.spread}` : `spread number ${index + 1} in the list`;
    if (!Number.isInteger(raw?.spread) || raw.spread < 1) throw new Error(`cards.json: ${name} has no spread (a whole number from 1)`);
    if (lines.has(raw.spread)) throw new Error(`cards.json: ${name} is there twice`);
    if (!text(raw.findMe)) throw new Error(`cards.json: ${name} has no findMe (the narrator's line for an animal not found yet)`);
    lines.set(raw.spread, raw.findMe);
  });
  return lines;
}

/**
 * The cards in cards.json (the file's object, or its list of cards), checked and in card order, each with its group ('animal' when
 * it names none), its spread (1 when it names none), its spread's find-me line, its `say` (null when it has none) and the
 * `picture` of its tile. Throws an Error that names the card, and the page, on a missing field, an unknown group, fewer than
 * PAGE_MIN or more than PAGE_MAX pages (none is all right for a teaser, which has a say and a picture instead), an id used
 * twice, an unknown unlock, a spread that is not a whole number from 1, more animals on a spread than SPREAD_MAX (or SPREAD_MAX - 1
 * when a later spread follows it), or a page with no sources.
 */
export function parseCards(data) {
  const list = Array.isArray(data) ? data : data?.cards;
  if (!Array.isArray(list)) throw new Error('cards.json: the cards should be a list, under "cards"');
  const findMe = spreadLines(Array.isArray(data) ? undefined : data?.spreads);
  const ids = new Set();
  const cards = list.map((raw, index) => {
    const name = text(raw?.id) ? `"${raw.id}"` : `number ${index + 1}`;
    const fail = problem => { throw new Error(`cards.json: card ${name} ${problem}`); };
    for (const field of ['id', 'name']) if (!text(raw?.[field])) fail(`has no ${field}`);
    if (!Number.isFinite(raw.order)) fail('has no order (a number)');
    if (ids.has(raw.id)) fail('is there twice: each card has an id of its own');
    ids.add(raw.id);
    const group = raw.group ?? 'animal';
    if (!GROUPS.includes(group)) fail(`has a group ${JSON.stringify(raw.group)}: it is one of ${GROUPS.join(', ')}, or none for an animal`);
    const unlock = unlockOf(raw.unlock);
    if (!unlock) {
      fail(`has an unknown unlock ${JSON.stringify(raw.unlock)}: it is { start: true }, { found: '<id>' }, { star: '<id>' }, { place: '<id>' } or { fossil: '<kind>' }`);
    }
    const spread = raw.spread ?? 1;
    if (!Number.isInteger(spread) || spread < 1) fail(`has a spread ${JSON.stringify(raw.spread)}: it is a whole number from 1, or none for the first`);
    if (!Array.isArray(raw.pages)) fail('has no pages');
    for (const field of ['say', 'picture']) if (raw[field] !== undefined && !text(raw[field])) fail(`has a ${field} ${JSON.stringify(raw[field])}: it is an id`);
    const teaser = raw.pages.length === 0;
    if (teaser) {
      if (!text(raw.say)) fail('has no pages and no say: a card with no pages is a teaser, and has the line Mosi says when its tile is tapped');
      if (!text(raw.picture)) fail('has no pages and no picture: a teaser has the picture its tile shows');
    } else {
      if (raw.pages.length < PAGE_MIN || raw.pages.length > PAGE_MAX) fail(`has ${raw.pages.length} pages; a card has ${PAGE_MIN} to ${PAGE_MAX}`);
      if (raw.say !== undefined) fail('has pages and a say: only a teaser, a card with no pages, has a say');
    }
    const pages = raw.pages.map((page, i) => {
      const where = `page ${i + 1}`;
      for (const field of ['image', 'text', 'audio']) if (!text(page?.[field])) fail(`${where} has no ${field}`);
      if (!Array.isArray(page.sources) || page.sources.length === 0 || !page.sources.every(text)) {
        fail(`${where} has no sources: every page says where its facts come from (or "${PLACEHOLDER}" until it is written)`);
      }
      if (page.model !== undefined && !text(page.model)) fail(`${where} has a model ${JSON.stringify(page.model)}: it is a path to a GLB`);
      return { image: page.image, text: page.text, audio: page.audio, sources: [...page.sources], model: page.model ?? null };
    });
    const refind = raw.refind ?? Math.max(pages.length, 1);
    if (!Number.isInteger(refind) || refind < 1 || refind > Math.max(pages.length, 1)) fail(`has a refind ${JSON.stringify(raw.refind)}: it is one of its pages, from 1`);
    return {
      id: raw.id, name: raw.name, order: raw.order, group, unlock, spread, refind: refind - 1, findMe: findMe.get(spread) ?? FIND_ME,
      say: raw.say ?? null, picture: raw.picture ?? pages[0].image, pages,
    };
  });
  const counts = new Map();
  for (const card of cards) if (card.group === 'animal') counts.set(card.spread, (counts.get(card.spread) ?? 0) + 1);
  const last = Math.max(...counts.keys());
  for (const [spread, count] of counts) {
    if (count > SPREAD_MAX) throw new Error(`cards.json: spread ${spread} has ${count} cards; a spread holds ${SPREAD_MAX}, four on each page`);
    if (spread < last && count > SPREAD_MAX - 1) {
      throw new Error(`cards.json: spread ${spread} has ${count} cards; a spread with a later one after it holds ${SPREAD_MAX - 1}, because its corner on takes the eighth place`);
    }
  }
  return cards.sort((a, b) => a.order - b.order);
}

/**
 * What the unlocks read, from the save: { stars, findings, seen, places, fossils }, each a list of ids. The fossils are the
 * collection of "Háls og hali" (save.getHals().found); a save from before the map has no places, and one with no collection no fossils.
 */
export function bookState(save) {
  const state = save?.get?.() ?? {};
  return {
    stars: state.stars ?? [],
    findings: state.findings ?? [],
    seen: state.seen ?? [],
    places: state.places ?? [],
    fossils: save?.getHals?.().found ?? [],
  };
}

/** Can the child open this card yet? `state` is bookState(save): { stars, findings, seen, places, fossils }. */
export function isUnlocked(card, state) {
  const { unlock } = card;
  if (unlock.start) return true;
  if ('found' in unlock) return (state?.findings ?? []).includes(unlock.found);
  if ('place' in unlock) return (state?.places ?? []).includes(unlock.place);
  if ('fossil' in unlock) return (state?.fossils ?? []).includes(unlock.fossil);
  return (state?.stars ?? []).includes(unlock.star);
}

/** Unlocked, and not opened yet: the tile wears its "Nýtt!". */
export function isNew(card, state) {
  return isUnlocked(card, state) && !(state?.seen ?? []).includes(card.id);
}
