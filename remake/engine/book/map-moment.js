import { renderMap, ROUTE_MS, ROUTE_GAP_MS } from './map-page.js';
import { reducedMotion } from './fx.js';

// The map in the journey (spec 2026-10-28-kortid-lifandi-og-i-ferdalaginu-design.md, section 3): at each departure the whole map
// slides up over the running game, draws the red line of the leg ahead (renderMap's drawPieces) while Mosi says where they are going,
// stands a moment and slides away. The game goes on under it: nothing is cut and no book opens.
//
// It is one `.map-moment` element in the page (book.css): a veil that dims the game, over it a paper card holding the map as one
// picture, its two pages side by side as a leaf renderMap draws into (the same map as the book's: the stickers, the trail so far,
// the dot where the child is, the water and the mist). The card is 1.8 to 1 like the map's view and about 86 % of the screen, whichever
// way the tablet is held (fitMap); an upright one has the map as a band across its middle. While the line draws the map comes slowly
// nearer the pieces (zoomTo: at most 1.6 times, and never so near that a piece or the end it leads to leaves the card).
//
// The overlay lets touches through (pointer-events: none, inert): a tap goes to the game behind it, and nothing in it takes one. It
// stands in the page right after the canvas, before the caption, the journal's button and the book, with no z-index of its own: so it
// is over the game, and the caption (Mosi's line), the buttons and the child's book (which opens over everything) are over it. (A
// z-index would have put it over the book, which has none.)
//
// Time is the game's: the journal calls update(dt) with the game clock's step, which counts out the pen sounds and the slide away, so a
// held game (the child's book open) holds the moment's ending and a capture or a test that moves the clock on gets the same overlay
// at the same moment. What draws and slides is the page's own animations, which only show the way. The scene (a chapter's mapMoment
// helper) waits `drawMs` of game time, then for Mosi's line, then closes it and waits what close() says.
//
// The two sounds are named here: `mapOpen` as the map arrives and `mapPen` as each piece begins (the audio may not have them: then it
// plays nothing). With reduced motion the map appears and goes without sliding, zooming or drawing over time (the pieces are simply
// there, and no pen sounds), and the scene's wait for Mosi's line is the only wait.

const VIEW = { width: 1800, height: 1000 }; // the map's view, which the card is the shape of
const SHARE = 0.86; // of the screen's width and of its height, at most
const RATIO = VIEW.width / VIEW.height; // 1.8
const MAX_ZOOM = 1.6;
const ZOOM_PAD = 80; // the view's units kept round the pieces, for the circle they lead to and a margin
const SLIDE_MS = 600;

/** The largest box of the map's shape (1.8 to 1) within 86 % of the screen: an upright tablet gets it wide and short. */
export function fitMap(width, height) {
  const fitted = Math.min(width * SHARE, height * SHARE * RATIO);
  return { width: fitted, height: fitted / RATIO };
}

/**
 * How the map is brought toward a box of it ({ x, y, width, height }, the view's units), as the transform of a map whose origin is
 * its top left: `scale` (1 to 1.6) and the move `x`, `y` in the view's units, after the scaling. The box, with ZOOM_PAD round it,
 * is brought to the middle of the card, as near as 1.6 times lets it be; the map is never moved off its card (no blank edge) and the
 * box stays inside the card.
 */
export function zoomTo({ x, y, width, height }) {
  const [left, top, right, bottom] = [x - ZOOM_PAD, y - ZOOM_PAD, x + width + ZOOM_PAD, y + height + ZOOM_PAD];
  const scale = Math.max(1, Math.min(MAX_ZOOM, VIEW.width / (right - left), VIEW.height / (bottom - top)));
  const keep = (value, least, most) => Math.min(most, Math.max(least, value)) + 0; // + 0: never a negative zero
  return {
    scale,
    x: keep(VIEW.width / 2 - scale * (left + right) / 2, -(scale - 1) * VIEW.width, 0),
    y: keep(VIEW.height / 2 - scale * (top + bottom) / 2, -(scale - 1) * VIEW.height, 0),
  };
}

/**
 * The map moment on a page (`doc`), over the `save`, with the journal's sound (`audio`, whose sfx(name) plays a named effect).
 * Returns
 *   play(ids)   puts the overlay up: the map slides up over the game and draws the pieces `ids` ('a' to 'g', as renderMap's) over the
 *               pieces drawn already, whether or not the child has seen them drawn, and keeps them seen; it zooms toward them as it
 *               does. Gives { drawMs }: how long the slide and the drawing take, in ms of game time (0 with reduced motion). A moment
 *               still on the page gives way to the new one.
 *   close()     the map slides down and away, the line finished where it was. Returns how long that takes, 600 ms (0 with reduced motion,
 *               when it goes at once, and 0 when there is nothing to close); the overlay is taken off the page when update() has counted
 *               that out
 *   update(dt)  the game clock's step in seconds (the journal's update calls it; 0 and less do nothing): sounds each piece's pen as its
 *               turn begins and takes the closed overlay off the page when its slide away is over
 *   isOpen      whether a moment is playing (from play() to close())
 */
export function createMapMoment(doc, { save, audio = null, win = globalThis.window } = {}) {
  let current = null; // { el, card, veil, map, animated, age, cues, closing, closeAge, onResize }

  const make = (tag, className) => {
    const element = doc.createElement(tag);
    element.className = className;
    return element;
  };

  /** The overlay goes in the page right after the canvas (so over the game and under all the rest), or first in a page without one. */
  function put(el) {
    const view = doc.getElementById?.('view');
    if (view?.after && view.parentNode) view.after(el);
    else if (doc.body.prepend) doc.body.prepend(el);
    else doc.body.append(el);
  }

  /** The card is the map's box in this window. */
  function size(card) {
    const width = win?.innerWidth;
    const height = win?.innerHeight;
    if (!(width > 0 && height > 0)) return; // the stylesheet's own sizes then (the same 86 %)
    const box = fitMap(width, height);
    card.style.setProperty('--moment-w', `${box.width}px`);
    card.style.setProperty('--moment-h', `${box.height}px`);
  }

  function letGo(moment) {
    if (moment.onResize) win?.removeEventListener?.('resize', moment.onResize);
    moment.onResize = null;
  }

  function dispose() {
    if (!current) return;
    const moment = current;
    current = null;
    letGo(moment);
    moment.el.remove();
  }

  function play(ids) {
    if (!Array.isArray(ids)) throw new TypeError('mapMoment.play needs the pieces to draw, as an array of their ids: ["a"]');
    dispose(); // one still on the page gives way
    const el = make('div', 'map-moment');
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('inert', '');
    const veil = make('div', 'map-veil');
    const card = make('div', 'map-card');
    const zoom = make('div', 'map-zoom');
    const pages = [make('div', ''), make('div', '')];
    zoom.append(...pages);
    card.append(zoom);
    el.append(veil, card);
    size(card);
    put(el);

    const animated = !reducedMotion(win) && typeof card.animate === 'function';
    const map = renderMap({ el: zoom, tiles: pages }, { save, win });
    const moment = { el, card, veil, map, animated, age: 0, cues: [], closing: false, closeAge: 0, onResize: () => size(card) };
    current = moment;
    win?.addEventListener?.('resize', moment.onResize);

    audio?.sfx?.('mapOpen');
    const drawing = map.drawPieces(ids, { delay: animated ? SLIDE_MS : 0 });
    if (!animated) return { drawMs: 0 };
    const drawMs = SLIDE_MS + drawing;
    // a pen for each piece as its turn begins
    const real = [...new Set(ids)].filter(id => map.routeOf(id) !== undefined);
    if (drawing) real.forEach((id, i) => moment.cues.push({ at: SLIDE_MS + i * (ROUTE_MS + ROUTE_GAP_MS), name: 'mapPen', sounded: false }));

    card.animate([{ transform: 'translateY(100vh)' }, { transform: 'translateY(0)' }], { duration: SLIDE_MS, easing: 'ease-out', fill: 'backwards' });
    veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: SLIDE_MS, easing: 'ease-out', fill: 'backwards' });
    const { scale, x, y } = zoomTo(map.bounds(ids));
    if (scale > 1.0001) { // the map comes nearer the leg over the whole of the slide and the drawing, and stays there
      const at = `translate(${(x / VIEW.width * 100).toFixed(3)}%, ${(y / VIEW.height * 100).toFixed(3)}%) scale(${scale.toFixed(4)})`;
      zoom.animate([{ transform: 'none' }, { transform: at }], { duration: drawMs, easing: 'ease-in-out', fill: 'forwards' });
    }
    return { drawMs };
  }

  function close() {
    const moment = current;
    if (!moment || moment.closing) return 0;
    letGo(moment);
    moment.map.hide(); // a line still being drawn is finished where it was going
    if (!moment.animated) {
      dispose();
      return 0;
    }
    moment.closing = true;
    moment.closeAge = 0;
    moment.card.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(100vh)' }], { duration: SLIDE_MS, easing: 'ease-in', fill: 'forwards' });
    moment.veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SLIDE_MS, easing: 'ease-in', fill: 'forwards' });
    return SLIDE_MS;
  }

  function update(dt) {
    const moment = current;
    if (!moment || !(dt > 0)) return; // none on the page, or the game is held
    moment.age += dt * 1000;
    for (const cue of moment.cues) {
      if (cue.sounded || moment.age < cue.at - 1e-6) continue;
      cue.sounded = true;
      audio?.sfx?.(cue.name);
    }
    if (!moment.closing) return;
    moment.closeAge += dt * 1000;
    if (moment.closeAge >= SLIDE_MS - 1e-6) dispose();
  }

  return {
    play,
    close,
    update,
    get isOpen() { return Boolean(current) && !current.closing; },
  };
}
