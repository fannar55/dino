// The book's cards (spec section 6): one per animal the child meets, each with 3 to 5 short pages that the narrator reads.
// They are data, in assets/book/cards.json, so a later chapter adds cards without code:
//
//   { "cards": [ { "id", "name", "order", "unlock", "pages": [ { "image", "text", "audio", "sources" }, ... ] }, ... ] }
//
//   id       the card's name in code, the save's seen list and the style sheet's hues (book.css [data-card])
//   name     what the tile says, in big letters
//   order    where its tile is: Mosi and Kambeðla first, then the critters
//   unlock   { start: true } from the start, { found: '<id>' } with the find chapter 1 passes to s.found, or
//            { star: '<id>' } with the star it passes to s.star
//   image    a picture's id in the media manifest (media.js); page one's picture is also the tile's
//   audio    the narrator's line in lines.json, book_<card>_<n> with n from 1
//   sources  where the page's facts come from (a URL or a reference), kept with the data and never shown to a child;
//            a page still waiting for its text has the one source PLACEHOLDER
//
// parseCards checks all of it once, when the book's data is read, so a slip in the file is said there, naming the card.

export const PAGE_MIN = 3;
export const PAGE_MAX = 5;
export const PLACEHOLDER = 'placeholder';

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

/**
 * The cards in cards.json (the file's object, or its list of cards), checked and in card order. Throws an Error that names
 * the card, and the page, on a missing field, fewer than PAGE_MIN or more than PAGE_MAX pages, an id used twice, an unknown
 * unlock, or a page with no sources.
 */
export function parseCards(data) {
  const list = Array.isArray(data) ? data : data?.cards;
  if (!Array.isArray(list)) throw new Error('cards.json: the cards should be a list, under "cards"');
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
    return { id: raw.id, name: raw.name, order: raw.order, unlock, pages };
  });
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
