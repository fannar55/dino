// A big number in the middle of the screen (chapter 5's countdown: "Fimm! Fjórir! Þrír! Tveir! Einn!"), for a child who is learning
// to read numbers: one clear digit in the game's lettering (Nunito, STYLE.md 10: the card's cream with the ink's outline, as the
// book's button is lettered), over the game and under the caption, the buttons and the book.
//
//   const number = createBigNumber(doc);      // doc: the page (world.page); nothing is put on it until a number shows
//   number.show('5', { scale, opacity });     // every frame it is on: scale 1 is its full size
//   number.hide();
//   number.dispose();                         // off the page
//
// It has no clock and no animation of its own: whoever owns it says every frame what it shows, how big and how clear, as a
// function of the game's time (kafli5-show.js: of the dance beat). So it stands still while the game is held behind the book, and a
// capture (?t=) finds it as it is at that moment. It never takes a tap: the animals under it are still the child's.
const STYLE = [
  'position: fixed', 'inset: 0', 'display: flex', 'align-items: center', 'justify-content: center', 'pointer-events: none',
  'user-select: none', '-webkit-user-select: none', 'overflow: hidden', 'contain: strict',
].join('; ');
const DIGIT = [
  'font-family: inherit', 'font-weight: 900', 'font-size: min(52vh, 80vw)', 'line-height: 1', 'font-variant-numeric: tabular-nums',
  'color: #fffaf0', '-webkit-text-stroke: 0.07em #3b2f25', 'paint-order: stroke fill',
  'text-shadow: 0 0.045em 0 #b75e2e, 0 0.1em 0.14em rgb(40 24 10 / .35)', 'will-change: transform, opacity', 'transform: scale(0)', 'opacity: 0',
].join('; ');

export function createBigNumber(doc) {
  let el = null;
  let digit = null;
  let shown = null; // what is on the screen: { text, scale, opacity }

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
    /** What is on the screen now: null, or { text, scale, opacity }. */
    get shown() { return shown; },
    get element() { return el; },
    show(text, { scale = 1, opacity = 1 } = {}) {
      if (!doc) return;
      if (!el) put();
      if (shown?.text !== text) digit.textContent = text;
      digit.style.transform = `scale(${scale.toFixed(3)})`;
      digit.style.opacity = opacity.toFixed(3);
      el.style.display = 'flex';
      shown = { text, scale, opacity };
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
    },
  };
}
