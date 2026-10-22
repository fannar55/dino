// The book's cards (spec section 6): one per animal the child meets, each with 3 to 5 short pages that the narrator reads (the
// frog has six: chapter 2 added its Fen page to the card the owner had approved). They are data, in assets/book/cards.json, so a
// later chapter adds cards, and a spread of the Dýrin page for them, without code:
//
//   { "cards": [ { "id", "name", "order", "unlock", "spread", "pages": [ { "image", "text", "audio", "sources" }, ... ] }, ... ],
//     "spreads": [ { "spread", "findMe" }, ... ] }
//
//   id       the card's name in code, the save's seen list and the style sheet's hues (book.css [data-card])
//   name     what the tile says, in big letters
//   order    where its tile is: Mosi and Kambeðla first, then the critters
//   unlock   { start: true } from the start, { found: '<id>' } with the find a chapter passes to s.found, or
//            { star: '<id>' } with the star it passes to s.star
//   spread   which spread of the Dýrin page its tile is on, from 1 (chapter 1's animals, which say no spread) up: a spread holds
//            SPREAD_MAX tiles, four on each page, in card order (chapter 2's are on the second, the Fen's)
//   image    a picture's id in the media manifest (media.js); page one's picture is also the tile's
//   audio    the narrator's line in lines.json, book_<card>_<n> with n from 1
//   sources  where the page's facts come from (a URL or a reference), kept with the data and never shown to a child;
//            a page still waiting for its text has the one source PLACEHOLDER
//
//   findMe   (spreads) the narrator's line for a tile of that spread not found yet, which says where its animal is; a spread the
//            file says nothing about says FIND_ME, "Finndu mig í skóginum!"
//
// parseCards checks all of it once, when the book's data is read, so a slip in the file is said there, naming the card.

export const PAGE_MIN = 3;
export const PAGE_MAX = 6; // the owner's cards have 3 to 5; the frog has six, its Fen page added to the card the owner approved
export const SPREAD_MAX = 8;
export const PLACEHOLDER = 'placeholder';
export const FIND_ME = 'book_find_me';

const text = value => typeof value === 'string' && value.trim() !== '';

/** The unlock as cards.json gives it, or null when it is none of the three. */
function unlockOf(value) {
  if (!value || typeof value !== 'object') return null;
  const keys = Object.keys(value);
  if (keys.length !== 1) return null;
  if (keys[0] === 'start') return value.start === true ? { start: true } : null;
  if (keys[0] === 'found') return text(value.found) ? { found: value.found } : null;
  if (keys[0] === 'star') return text(value.star) ? { star: value.star } : null;
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
 * The cards in cards.json (the file's object, or its list of cards), checked and in card order, each with its spread (1 when
 * it names none) and its spread's find-me line. Throws an Error that names the card, and the page, on a missing field, fewer
 * than PAGE_MIN or more than PAGE_MAX pages, an id used twice, an unknown unlock, a spread that is not a whole number from 1,
 * a spread with more than SPREAD_MAX cards, or a page with no sources.
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
    const unlock = unlockOf(raw.unlock);
    if (!unlock) fail(`has an unknown unlock ${JSON.stringify(raw.unlock)}: it is { start: true }, { found: '<id>' } or { star: '<id>' }`);
    const spread = raw.spread ?? 1;
    if (!Number.isInteger(spread) || spread < 1) fail(`has a spread ${JSON.stringify(raw.spread)}: it is a whole number from 1, or none for the first`);
    if (!Array.isArray(raw.pages)) fail('has no pages');
    if (raw.pages.length < PAGE_MIN || raw.pages.length > PAGE_MAX) fail(`has ${raw.pages.length} pages; a card has ${PAGE_MIN} to ${PAGE_MAX}`);
    const pages = raw.pages.map((page, i) => {
      const where = `page ${i + 1}`;
      for (const field of ['image', 'text', 'audio']) if (!text(page?.[field])) fail(`${where} has no ${field}`);
      if (!Array.isArray(page.sources) || page.sources.length === 0 || !page.sources.every(text)) {
        fail(`${where} has no sources: every page says where its facts come from (or "${PLACEHOLDER}" until it is written)`);
      }
      return { image: page.image, text: page.text, audio: page.audio, sources: [...page.sources] };
    });
    return { id: raw.id, name: raw.name, order: raw.order, unlock, spread, findMe: findMe.get(spread) ?? FIND_ME, pages };
  });
  const counts = new Map();
  for (const card of cards) counts.set(card.spread, (counts.get(card.spread) ?? 0) + 1);
  for (const [spread, count] of counts) {
    if (count > SPREAD_MAX) throw new Error(`cards.json: spread ${spread} has ${count} cards; a spread holds ${SPREAD_MAX}, four on each page`);
  }
  return cards.sort((a, b) => a.order - b.order);
}

/** Can the child open this card yet? `state` is the save's get(): { stars, findings, seen }. */
export function isUnlocked(card, state) {
  const { unlock } = card;
  if (unlock.start) return true;
  if ('found' in unlock) return (state?.findings ?? []).includes(unlock.found);
  return (state?.stars ?? []).includes(unlock.star);
}

/** Unlocked, and not opened yet: the tile wears its "Nýtt!". */
export function isNew(card, state) {
  return isUnlocked(card, state) && !(state?.seen ?? []).includes(card.id);
}
