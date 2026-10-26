import { pressable, reducedMotion, sparkle } from './fx.js';
import { bookState } from './cards.js';
import { FOSSIL_KINDS } from '../hals/rules.js';
import { FOSSIL_ART, FOSSIL_HUES } from '../hals/fossil-art.js';

// The Safnið page (Landkönnuðabók, stage 1): the fossil collection, Steingervingasafn. It is the eight finds of "Háls og hali"
// (engine/hals/rules.js FOSSIL_KINDS), four on each page as taped stickers (engine/hals/fossil-art.js), in colour once found (the
// save's getHals().found) and a soft silhouette with a "?" until then. book.js makes it for its Safnið leaf and asks it three things.
//
//   New. A fossil that is found and whose `fossil:<kind>` is not in the save's seen list wears "Nýtt!" (a .badge-new, as an animal's tile
//        does), glows and rocks as a new tile does, and the Safnið ribbon wears a small "Nýtt!" of its own while any is (hasNew, which
//        book.js reads each time it renders). A tap on it marks it seen, and the badge and the ribbon's dot go with it.
//   Tap. A found fossil, once seen, opens its card when the book has one for it (a card of group 'fossil' with pages whose unlock is
//        { fossil: '<kind>' }, cards.js) through onOpenCard, as an animal's tile does. A fossil with no card yet keeps the behaviour
//        it has always had: the narrator says its name and a fact (hals_fossil_<kind>), its name shows over it, and it sparkles. An
//        unfound one wiggles.
//   Full. When all eight are found, the first time the child's book shows the page, Mosi cheers (book_mosi_fossils_all), the stickers
//        sparkle and the book plays its celebration sound, and the save is told (the seen id 'fossils-all') so it happens once: a
//        save that already has all eight celebrates the first time its child opens Safnið, and never again. A line with no recording
//        yet is silent (book-audio.js), which is all right. book.js calls it only for a book the child holds.
//
// All the look is book.css's (.fossil-tile, .fossil-title, .fossil-count, .fossil-name); the stickers are made once and render() only
// changes their state.

const NAME_MS = 2600; // a fossil's name stays over its sticker this long
const SPARKS = 8; // the sparks on each sticker in the celebration
const RIPPLE_MS = 90; // the celebration reaches each sticker this much after the one before
export const ALL_SEEN = 'fossils-all'; // kept in the save's seen list once the full collection has been celebrated
export const ALL_LINE = 'book_mosi_fossils_all'; // Mosi: "Vá! Þú fannst alla átta steingervingana. Safnið er fullt!"
const seenId = kind => `fossil:${kind}`; // kept in the save's seen list once a fossil has been tapped, so it is new no more

/**
 * The page on the Safnið `leaf` (book.js's { el, pages, tiles }), over the `save`, the book's sound (`audio`) and its `cards`
 * (parseCards; only the ones of group 'fossil' matter). `onOpenCard(card, fromRect)` shows a fossil's card; `onChange()` is told after a
 * tap has changed what is new (the book's ribbon asks hasNew again); `win` is the window (less motion). Returns
 *   render()            shows what the save holds now: which fossils are found, which are new, and "n af 8"
 *   hasNew()            whether any fossil is found and not tapped yet (book.js's ribbon dot)
 *   celebrate({ delay }) when all eight are found and the full collection has not been celebrated, the celebration (true), once and
 *                       for all; its sparkles wait `delay` ms, for a book still growing or turning to this page; false otherwise
 *   stop()              cancels the sparkles still waiting (the book was shut or turned away)
 */
export function createMuseumPage(leaf, { save, audio = null, win = globalThis.window, cards = [], onOpenCard = null, onChange = null } = {}) {
  const doc = leaf.el.ownerDocument;
  const make = (tag, className) => {
    const element = doc.createElement(tag);
    element.className = className;
    return element;
  };
  const fossilCards = cards.filter(card => card.group === 'fossil' && card.pages?.length > 0);
  const cardOf = kind => fossilCards.find(card => card.unlock.fossil === kind.id) ?? null;

  const stickers = FOSSIL_KINDS.map(kind => {
    const tile = make('button', 'tile fossil-tile');
    tile.setAttribute('type', 'button');
    tile.setAttribute('data-fossil', kind.id);
    tile.style.setProperty('--hue', FOSSIL_HUES[kind.id]);
    const picture = make('span', 'tile-picture');
    picture.innerHTML = FOSSIL_ART[kind.id];
    const name = make('span', 'tile-name');
    const badge = make('span', 'badge-new');
    badge.textContent = 'Nýtt!';
    badge.setAttribute('aria-hidden', 'true');
    tile.append(picture, name);
    return { tile, picture, name, badge, kind };
  });
  const title = make('h2', 'fossil-title');
  title.textContent = 'Steingervingasafn';
  const count = make('p', 'fossil-count');
  const nameBubble = make('div', 'fossil-name'); // the name over a sticker tapped
  nameBubble.setAttribute('aria-live', 'polite');
  nameBubble.hidden = true;
  const [left, right] = leaf.tiles;
  left.classList.add('fossil-tiles');
  right.classList.add('fossil-tiles');
  left.append(...stickers.slice(0, 4).map(sticker => sticker.tile));
  right.append(...stickers.slice(4).map(sticker => sticker.tile));
  leaf.pages[0].append(title);
  leaf.pages[1].append(count);
  leaf.el.append(nameBubble);

  const waiting = new Set(); // the timers of a celebration's sparkles
  let nameTimer = 0;

  /** The fossils found, in colour with their names (and "Nýtt!" until tapped); the rest are soft silhouettes with a "?". */
  function render() {
    const state = bookState(save);
    for (const { tile, name, badge, kind } of stickers) {
      const has = state.fossils.includes(kind.id);
      const fresh = has && !state.seen.includes(seenId(kind.id));
      tile.classList.toggle('found', has && !fresh);
      tile.classList.toggle('new', fresh);
      tile.classList.toggle('unfound', !has);
      name.textContent = has ? kind.name : '?';
      tile.setAttribute('aria-label', has ? kind.name : 'Ófundinn steingervingur');
      if (fresh && badge.parentNode !== tile) tile.append(badge);
      if (!fresh) badge.remove();
    }
    const found = FOSSIL_KINDS.filter(kind => state.fossils.includes(kind.id)).length;
    count.textContent = `${found} af ${FOSSIL_KINDS.length}`;
  }

  function hasNew() {
    const state = bookState(save);
    return FOSSIL_KINDS.some(kind => state.fossils.includes(kind.id) && !state.seen.includes(seenId(kind.id)));
  }

  /** An unfound sticker wiggles (and says so with its sound), as a tile does that waits for its animal. */
  function wiggle(tile) {
    audio?.sfx?.('wiggle');
    if (typeof tile.animate !== 'function') return;
    tile.animate(reducedMotion(win)
      ? [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }]
      : [{ rotate: '0deg' }, { rotate: '-7deg' }, { rotate: '6deg' }, { rotate: '-3deg' }, { rotate: '0deg' }], { duration: 520, easing: 'ease-in-out' });
  }

  /** The name of a found sticker in a bubble over it, placed in the spread's own pixels (its leaf lies on the spread). */
  function showName({ tile, kind }) {
    nameBubble.textContent = kind.name;
    nameBubble.hidden = false;
    const rect = tile.getBoundingClientRect?.();
    const box = (leaf.el.parentNode ?? leaf.el).getBoundingClientRect?.();
    if (rect?.width && box) {
      nameBubble.style.setProperty('left', `${(rect.left + rect.width / 2 - box.left).toFixed(1)}px`);
      nameBubble.style.setProperty('top', `${(rect.top - box.top).toFixed(1)}px`);
    }
    nameBubble.getAnimations?.().forEach(animation => animation.cancel());
    if (typeof nameBubble.animate === 'function') {
      nameBubble.animate(reducedMotion(win) ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translate(-50%, -80%) scale(.6)' }, { opacity: 1, transform: 'translate(-50%, -100%) scale(1)' }],
        { duration: 360, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
    }
    clearTimeout(nameTimer);
    nameTimer = setTimeout(() => { nameBubble.hidden = true; }, NAME_MS);
    nameTimer?.unref?.(); // in Node (the tests) a timer must not keep the process waiting
  }

  /**
   * A tap on a sticker. A found one is seen (so it is new no more), then opens its card if the book has one, or else says its name and a
   * fact, shows its name over it and sparkles. An unfound one wiggles.
   */
  function tap(sticker) {
    const { tile, kind } = sticker;
    if (tile.classList.contains('unfound')) {
      wiggle(tile);
      return;
    }
    const wasNew = save.addSeen(seenId(kind.id));
    render();
    if (wasNew) onChange?.();
    const card = cardOf(kind);
    if (card) {
      audio?.sfx?.('tile');
      onOpenCard?.(card, sticker.picture.getBoundingClientRect());
      return;
    }
    audio?.narrate?.(`hals_fossil_${kind.id}`);
    sparkle(tile, 12, win);
    if (typeof tile.animate === 'function' && !reducedMotion(win)) {
      tile.animate([{ scale: '1' }, { scale: '1.1' }, { scale: '1' }], { duration: 480, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
    }
    showName(sticker);
  }

  function celebrate({ delay = 0 } = {}) {
    const state = bookState(save);
    if (state.seen.includes(ALL_SEEN) || !FOSSIL_KINDS.every(kind => state.fossils.includes(kind.id))) return false;
    save.addSeen(ALL_SEEN); // once and for all, whatever happens next
    audio?.narrate?.(ALL_LINE);
    audio?.sfx?.('celebrate');
    stickers.forEach(({ tile }, i) => {
      const burst = () => {
        sparkle(tile, SPARKS, win);
        if (typeof tile.animate === 'function' && !reducedMotion(win)) {
          tile.animate([{ scale: '1' }, { scale: '1.12' }, { scale: '1' }], { duration: 480, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
        }
      };
      const wait = delay + i * RIPPLE_MS;
      if (wait <= 0) {
        burst();
        return;
      }
      const timer = setTimeout(() => {
        waiting.delete(timer);
        burst();
      }, wait);
      timer?.unref?.();
      waiting.add(timer);
    });
    return true;
  }

  function stop() {
    for (const timer of waiting) clearTimeout(timer);
    waiting.clear();
  }

  for (const sticker of stickers) pressable(sticker.tile, { audio, sound: null, win, onTap: () => tap(sticker) });
  render();
  return { render, hasNew, celebrate, stop };
}
