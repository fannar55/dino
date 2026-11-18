// A big number or one big word in the middle of the screen (chapter 5's countdown: "Fimm! Fjórir! Þrír! Tveir! Einn!", and the
// words Flugeðla shouts: "NÚ!"), for a child who is learning to read: one clear digit or word in the game's lettering (Nunito,
// STYLE.md 10: the card's cream with the ink's outline, as the book's button is lettered), over the game and under the caption,
// the buttons and the book.
//
//   const number = createBigNumber(doc);      // doc: the page (world.page); nothing is put on it until a number shows
//   number.show('5', { scale, opacity });     // every frame it is on: scale 1 is its full size
//   number.show('NÚ!', { scale, opacity, height: 0.7, width: 0.49, lift: -0.15 });
//   number.show('HOPP!', { scale, opacity, height: 0.7, width: 0.27, at: 0.34 });
//   number.hide();
//   number.dispose();                         // off the page
//
// Its full size is `height` of the screen's height (the letters' own size: a capital stands LETTERS.cap of that), but never more
// than `width` of the screen's width, so a long word fits a tablet held upright; `lift` moves it up (in letter sizes; down if
// negative), for a word with an accent over it or one that hops. It stands in what the caption leaves free (ROOM px at the bottom
// are the caption's), so a word and Flugeðla's line under it never sit on each other: in the middle of it, or with its middle
// `at` that share of the way down it (0.34: in the upper part of the picture, over the heads of those the shot is about).
//
// It has no clock and no animation of its own: whoever owns it says every frame what it shows, how big and how clear, as a
// function of the game's time (kafli5-show.js: of the set's beat). So it stands still while the game is held behind the book, and a
// capture (?t=) finds it as it is at that moment. It never takes a tap: the animals under it are still the child's.

/** Px at the bottom of the screen left to the caption (style.css .caption: 24 px up, 88.5 px high with one line of text). */
export const ROOM = 120;
/**
 * The lettering's measures, in letter sizes (the page's Nunito at weight 900, measured in the page): how high a capital and a
 * digit stand over the line, how far an accent reaches over that, where the line is under the middle of the letters' box, how far
 * the outline reaches outside a letter, and how wide a digit is.
 */
export const LETTERS = { cap: 0.72, accent: 0.24, line: 0.33, outline: 0.035, digit: 0.6 };

const STYLE = [
  'position: fixed', 'inset: 0', 'box-sizing: border-box', `padding-bottom: ${ROOM}px`, 'display: flex', 'align-items: center',
  'justify-content: center', 'pointer-events: none', 'user-select: none', '-webkit-user-select: none', 'overflow: hidden', 'contain: strict',
].join('; ');
const DIGIT = [
  'font-family: inherit', 'font-weight: 900', 'font-size: min(52vh, 80vw)', 'line-height: 1', 'white-space: nowrap', 'font-variant-numeric: tabular-nums',
  'color: #fffaf0', '-webkit-text-stroke: 0.07em #3b2f25', 'paint-order: stroke fill',
  'text-shadow: 0 0.045em 0 #b75e2e, 0 0.1em 0.14em rgb(40 24 10 / .35)', 'will-change: transform, opacity', 'transform: scale(0)', 'opacity: 0',
].join('; ');

export function createBigNumber(doc) {
  let el = null;
  let digit = null;
  let shown = null; // what is on the screen: { text, scale, opacity, height, width, lift, at }
  let size = null; // the font size it has now, as it is written in its style

  /** The overlay goes in the page right after the canvas, so over the game and under all the rest (as the map moment's does). */
  function put() {
    el = doc.createElement('div');
    el.className = 'big-number';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = STYLE;
    digit = doc.createElement('span');
    digit.style.cssText = DIGIT;
    el.append(digit);
    const view = doc.getElementById?.('view');
    if (view?.after && view.parentNode) view.after(el);
    else doc.body.append(el);
  }

  return {
    /** What is on the screen now: null, or { text, scale, opacity, height, width, lift, at }. */
    get shown() { return shown; },
    get element() { return el; },
    show(text, { scale = 1, opacity = 1, height = 0.52, width = 0.8, lift = 0, at = 0.5 } = {}) {
      if (!doc) return;
      if (!el) put();
      if (shown?.text !== text) digit.textContent = text;
      const fontSize = `min(${+(height * 100).toFixed(2)}vh, ${+(width * 100).toFixed(2)}vw)`;
      if (fontSize !== size) digit.style.fontSize = size = fontSize;
      const place = at === 0.5 ? '' : `translateY(calc((100vh - ${ROOM}px) * ${(at - 0.5).toFixed(3)})) `;
      digit.style.transform = `${place}translateY(${(-lift).toFixed(3)}em) scale(${scale.toFixed(3)})`;
      digit.style.opacity = opacity.toFixed(3);
      el.style.display = 'flex';
      shown = { text, scale, opacity, height, width, lift, at };
    },
    hide() {
      if (!shown) return;
      el.style.display = 'none'; // (its own display would win over `hidden`)
      shown = null;
    },
    dispose() {
      el?.remove();
      el = null;
      digit = null;
      shown = null;
      size = null;
    },
  };
}
