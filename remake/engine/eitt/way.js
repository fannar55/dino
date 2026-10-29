// The way the turn goes round the table of "Eitt!": a pair of curved arrows round the pile, on the big screen and on every phone
// (a round of Fjölspil with three or four seats; with two a reverse is only a skip, and there is no way to show).
//
// The seats sit as the big screen lays them out: Egill at the bottom, the others across the top in seat order, so the turn goes
// round clockwise while the rules' `direction` is 1, and the arrows turn anticlockwise when a reverse makes it -1. A phone lays
// its own seat at the bottom and the others after it in the same order, so the picture is the same on every screen. The arrows
// turn slowly the way the turn goes (a CSS animation), and when a reverse flips them they spin round once as they change over
// (transform only); under reduced motion they hold still and only change over.
//
// The look is eitt.css's `.eitt-way`; this file draws the arrows from plain geometry and keeps the element's direction.

const INK = '#3b2f25';
const CREAM = '#fffaf0';
const R = 86; // the arrows' radius, in a 224 x 224 box with room for the heads
const BODY = 8; // an arrow's thickness
const EDGE = 3.5; // and the ink round it
const HEAD = 21; // a head's length, and
const HALF = 14; // its half width

const deg = degrees => (degrees * Math.PI) / 180;
const round = n => n.toFixed(1);

/** One arrow: an arc from `from` to `to` degrees (clockwise from the right) and its head, as the SVG's numbers. */
function arrow(from, to) {
  const at = (r, a) => [r * Math.cos(deg(a)), r * Math.sin(deg(a))];
  const [x0, y0] = at(R, from);
  const [x1, y1] = at(R, to);
  const tangent = [-Math.sin(deg(to)), Math.cos(deg(to))];
  const normal = [Math.cos(deg(to)), Math.sin(deg(to))];
  const corner = (along, across) => `${round(x1 + tangent[0] * along + normal[0] * across)},${round(y1 + tangent[1] * along + normal[1] * across)}`;
  return {
    arc: `M${round(x0)} ${round(y0)}A${R} ${R} 0 0 1 ${round(x1)} ${round(y1)}`,
    head: [corner(HEAD, 0), corner(-2, HALF), corner(-2, -HALF)].join(' '),
  };
}

// Two arrows half a turn apart, each a little under a third of the way round, the heads clear of a card's corners on the pile.
const ARROWS = [arrow(-170, -25), arrow(10, 155)];

/** The arrows' picture: ink under cream, as the game's other signs (a stroke of ink, then the same in cream). */
export const WAY_SVG = '<svg viewBox="-112 -112 224 224" aria-hidden="true" focusable="false">'
  + `<g fill="${INK}" stroke="${INK}" stroke-linecap="round" stroke-linejoin="round">`
  + ARROWS.map(({ arc, head }) => `<path d="${arc}" fill="none" stroke-width="${BODY + 2 * EDGE}"/><polygon points="${head}" stroke-width="${2 * EDGE}"/>`).join('')
  + '</g>'
  + `<g fill="${CREAM}" stroke="${CREAM}" stroke-linecap="round" stroke-linejoin="round">`
  + ARROWS.map(({ arc, head }) => `<path d="${arc}" fill="none" stroke-width="${BODY}"/><polygon points="${head}" stroke-width="0"/>`).join('')
  + '</g></svg>';

/** The length of the spin when a reverse flips the arrows, in ms. */
export const WAY_MS = 700;

/** The element for the arrows, to be put in the pile beside its ring; its direction is set by setWay. */
export function wayElement(doc) {
  const el = doc.createElement('div');
  el.className = 'eitt-way';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = WAY_SVG;
  return el;
}

/**
 * The arrows go the way `direction` says (1: clockwise, -1: anticlockwise). Where they were going the other way they spin round
 * once as they change over, unless `calm`; the first time they are set there is nothing to turn. True when they turned.
 */
export function setWay(el, direction, { calm = false } = {}) {
  const way = direction === -1 ? '-1' : '1';
  const was = el.dataset.way;
  el.dataset.way = way;
  if (was === undefined || was === way) return false;
  if (!calm && typeof el.animate === 'function') {
    // The sheet already shows the new way, so the animation starts from the old one (the mirror image) and turns into it.
    el.animate([
      { transform: 'scaleX(-1) rotate(0deg) scale(1)' },
      { transform: 'scaleX(0) rotate(-180deg) scale(1.18)', offset: 0.5 },
      { transform: 'scaleX(1) rotate(-360deg) scale(1)' },
    ], { duration: WAY_MS, easing: 'cubic-bezier(.4, 0, .25, 1)' });
  }
  return true;
}
