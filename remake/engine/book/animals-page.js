import { pressable, reducedMotion } from './fx.js';
import { isUnlocked, isNew, FIND_ME } from './cards.js';

// The animals page (spec section 3.2): one taped photo of each animal on the Dýrin pages, in card order, Mosi and Kambeðla first and
// then the critters. Each card's spread (cards.js) is a leaf of two pages of its own: chapter 1's animals on the first, the Fen's on
// the second (book.js turns between them). A tile shows its card's first picture and its name in big letters, and it is one of three:
//   found    full colour, breathing, with a twinkle now and then
//   new      found but not opened yet: it glows, rocks a little and wears its "Nýtt!" until its card is opened
//   unfound  the same picture as a dark silhouette with a big "?"; a tap wiggles it, the narrator says where it is (its spread's
//            find-me line: "Finndu mig í skóginum!", or "Finndu mig í Feninu!" for the Fen's) and no card opens
// A tap on a found tile sounds `tile`, marks the card seen and hands the card to onOpenCard with the rectangle of the tile's
// picture, which the card grows out of. All the look is book.css's; the tiles are made once and render() only changes their state.

const PER_PAGE = 4; // the left page of a spread holds four photos, two rows of two; the right page takes the rest
const SAME_TAP_MS = 700; // a second tap this soon after a card opened is the same tap (a double tap)
const WIGGLE_MS = 560;
const NOD_MS = 620;
const MISSING = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48' fill='none' stroke='%236b5a4a' stroke-width='1.5' opacity='.5'%3E%3Cellipse cx='24' cy='34' rx='10.5' ry='9.5'/%3E%3Cellipse cx='24' cy='11' rx='5.4' ry='7.2'/%3E%3Cellipse cx='11.6' cy='16.6' rx='5.2' ry='7' transform='rotate(-30 11.6 16.6)'/%3E%3Cellipse cx='36.4' cy='16.6' rx='5.2' ry='7' transform='rotate(30 36.4 16.6)'/%3E%3C/svg%3E";

/**
 * The animals page, rendered into the two `.book-tiles` boxes inside each of `roots` (the Dýrin leaves, one for each spread of the
 * cards in order, see book.js; one leaf alone may be given as it is), over the book's `cards` (parseCards), their pictures (`media`,
 * parseManifest) and the `save`, with the book's sound (`audio`). `onOpenCard(card, fromRect)` shows a found card. Returns
 *   render()          shows what the save holds now: which animals are found, which are new
 *   nod(id, delay)    the card's tile nods, after `delay` ms (a new animal, where the book has opened for it)
 *   dispose()         takes the page away
 */
export function createAnimalsPage(doc, roots, { cards = [], media = new Map(), save, audio = null, onOpenCard = null, win = globalThis.window } = {}) {
  const leaves = (Array.isArray(roots) ? roots : [roots]).map(root => [...root.querySelectorAll('.book-tiles')]);
  const spreads = [...new Set(cards.map(card => card.spread ?? 1))].sort((a, b) => a - b); // leaves[i] is spreads[i]'s
  const make = (tag, className) => {
    const element = doc.createElement(tag);
    element.className = className;
    return element;
  };
  const tiles = new Map(); // card id -> { card, el, picture, badge, undo }
  let lastOpen = -Infinity;
  let findLine = null; // the narrator saying where an animal is, so a second wiggle does not start it over

  /** A tile: a taped photo of the card's first picture, with the animal's name. */
  function build(card) {
    const el = make('button', 'tile');
    el.setAttribute('type', 'button');
    el.setAttribute('data-card', card.id);
    const picture = make('span', 'tile-picture');
    const image = media.get(card.pages[0].image);
    const img = doc.createElement('img');
    img.src = image?.thumb ?? image?.src ?? MISSING;
    img.alt = '';
    img.draggable = false;
    picture.append(img);
    const name = make('span', 'tile-name');
    name.textContent = card.name;
    el.append(picture, name);
    const badge = make('span', 'badge-new');
    badge.textContent = 'Nýtt!';
    badge.setAttribute('aria-hidden', 'true');
    const tile = { card, el, picture, badge, undo: null };
    tile.undo = pressable(el, { audio, sound: null, win, onTap: () => tap(tile) }); // the tile plays its own sound
    return tile;
  }

  function tap(tile) {
    if (isUnlocked(tile.card, save.get())) openCard(tile);
    else wiggle(tile);
  }

  function openCard(tile) {
    const now = Date.now();
    if (now - lastOpen < SAME_TAP_MS) return; // a double tap opens one card
    lastOpen = now;
    audio?.sfx?.('tile');
    save.addSeen(tile.card.id);
    onOpenCard?.(tile.card, tile.picture.getBoundingClientRect());
    render(); // "Nýtt!" is gone behind the card
  }

  /** An animal not found yet: it wiggles, the narrator says where it is, and the card stays shut. */
  function wiggle(tile) {
    audio?.sfx?.('wiggle');
    if (!findLine || findLine.done) findLine = audio?.narrate?.(tile.card.findMe ?? FIND_ME) ?? null;
    if (typeof tile.el.animate !== 'function') return;
    const turns = reducedMotion(win)
      ? [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }]
      : [{ rotate: '0deg' }, { rotate: '-7deg' }, { rotate: '6deg' }, { rotate: '-4deg' }, { rotate: '2.5deg' }, { rotate: '0deg' }];
    tile.el.animate(turns, { duration: WIGGLE_MS, easing: 'ease-in-out' });
  }

  /** A new animal where the book has opened for it: its tile swells and settles, as the journal's button nods for a find. */
  function nod(id, delay = 0) {
    const tile = tiles.get(id);
    if (typeof tile?.el.animate !== 'function') return;
    const keyframes = reducedMotion(win)
      ? [{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }]
      : [{ scale: '1', rotate: '0deg' }, { scale: '1.14', rotate: '-3deg' }, { scale: '0.97', rotate: '2deg' }, { scale: '1', rotate: '0deg' }];
    tile.el.animate(keyframes, { duration: NOD_MS, delay, easing: 'cubic-bezier(.3, 1.4, .5, 1)' });
  }

  function render() {
    const state = save.get();
    const ordered = [...cards].sort((a, b) => a.order - b.order);
    const placed = new Map(); // spread -> how many of its tiles are placed so far
    ordered.forEach(card => {
      const spread = card.spread ?? 1;
      const i = placed.get(spread) ?? 0;
      placed.set(spread, i + 1);
      if (!tiles.has(card.id)) tiles.set(card.id, build(card));
      const tile = tiles.get(card.id);
      const found = isUnlocked(card, state);
      const fresh = found && isNew(card, state);
      tile.el.classList.toggle('found', found && !fresh);
      tile.el.classList.toggle('new', fresh);
      tile.el.classList.toggle('unfound', !found);
      tile.el.setAttribute('aria-label', found ? card.name : `${card.name} (ófundið)`);
      if (fresh && tile.badge.parentNode !== tile.el) tile.el.append(tile.badge);
      if (!fresh) tile.badge.remove();
      const boxes = leaves[Math.min(spreads.indexOf(spread), leaves.length - 1)] ?? [];
      const box = boxes[i < PER_PAGE ? 0 : Math.min(1, boxes.length - 1)];
      if (box && tile.el.parentNode !== box) box.append(tile.el); // placed once: a tile that moves would start its idle life over
    });
  }

  function dispose() {
    for (const tile of tiles.values()) {
      tile.undo?.();
      tile.el.remove();
    }
    tiles.clear();
  }

  render();
  return { render, nod, dispose };
}
