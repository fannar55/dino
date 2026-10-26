import { pressable, reducedMotion } from './fx.js';
import { FRIENDS, STAR_SVG, friendOf, placeHue } from '../scene/journal.js';

// The book's map, Kortið (spec section 7, the fifth ribbon): a painted watercolour map of the whole journey (assets/book/map.webp):
// the clearing where chapter 1 began, Kambeðla's fern glade in the forest, the sandy trail with Þórseðla's prints along it down to
// the golden Fen, the river with its waterfall, and the Fen's pools, with a pale round clearing in the picture for each place a
// sticker will go. The picture lies across the spread, 1800 by 1000 in the units below, the forest on the left page and the Fen on
// the right (or one above the other on a tablet held upright), each page showing its half; the words on it are the page's own, in
// the book's font, so they read as the rest of the book.
//
// On it a slot for each place a chapter can find: the Fen itself and the six friends of the Star Festival, each on its pale circle
// (Slóeðla, Flugeðla and Uggeðla where they were found from Þórseðla's head, chapter 2). A slot is one of three:
//   empty  a dashed ring in the place's hue: nothing there yet; a tap is only the book's tap
//   found  the place is in the save's places: a round die-cut sticker of the friend (the Fen's is drawn)
//   done   its star is in the book (`k<N>_<key>` for a friend; the Fen's star is Þórseðla's, k2_thorsedla): the sticker wears a star
// A tap on a found or done slot hands it to onTap(id, state, marker): Mosi says its name and one sentence (k2_mosi_map_<id>,
// book.js). The slots are made once and render() only changes their state.
//
// And the trail the child has travelled, in ink, drawn by the game (the picture has no line of its own): three pieces, each along
// the middle of the sandy trail, A from the clearing to the glade (chapter 1's ride), B out of the forest along the prints to the
// Fen (chapter 2's trail) and C across the wetland to Þórseðla's pool. A piece is there once the child has got as far as the place
// it ends at (a place found or done; a later place carries the earlier pieces with it, so the trail never has a gap). The first time
// the page shows a piece the child has not seen yet it draws itself along its length, one piece after another, and the save's
// seen list keeps `map-route-<piece>` so it happens once; afterwards, and with reduced motion, the piece is simply there.

export const MAP_SRC = new URL('../../assets/book/map.webp', import.meta.url).href;
const VIEW = { width: 1800, height: 1000 }; // the view the map is laid out in: each page shows half its width
const PICTURE = { width: 1681, height: 936 }; // map.webp's pixels: stretched to the view, a fifth of a percent off its proportions
const HALF = VIEW.width / 2;
/** A spot in the painted picture's pixels, as a spot in the view's units. */
const onMap = ([x, y]) => [x * VIEW.width / PICTURE.width, y * VIEW.height / PICTURE.height];

/** Each slot's place on the map (the view's units), and the width across its pale circle that the sticker with its rim fills. */
const slot = (id, centre, size) => ({ id, at: onMap(centre), size: Math.round(size * VIEW.width / PICTURE.width) });
export const MAP_PLACES = [
  slot('gramedla', [178, 107], 80), // in the mist beyond the mountains, not yet explored
  slot('kambedla', [559, 494], 88), // her fern glade
  slot('sloedla', [1063, 172], 74), // wading in the far pool to the north-west
  slot('flugedla', [1337, 172], 76), // by the white snag
  slot('thorsedla', [1514, 356], 76), // her lily pool under her two conifers
  slot('uggedla', [1457, 688], 88), // in the reed by the channel, to the south-east
  slot('fen', [1213, 453], 88), // the middle of the wetland
];
const art = path => new URL(`../../assets/${path}`, import.meta.url).href;
/** Each friend's picture on a sticker: the game's own renders (tools/bake/book-render.js). */
const PICTURES = {
  kambedla: art('book/images/kambedla-render-thumb.webp'),
  thorsedla: art('eitt/brontosaurus.webp'),
  gramedla: art('eitt/trex.webp'),
  uggedla: art('book/images/uggedla-render-thumb.webp'),
  sloedla: art('eitt/parasaurolophus.webp'),
  flugedla: art('eitt/pteranodon.webp'),
};
// The Fen's own sticker: a pool, a lily pad with a flower and a tuft of golden reed, drawn as the map is.
const FEN_STICKER = '<svg class="map-fen" viewBox="0 0 64 64" aria-hidden="true">'
  + '<ellipse cx="29" cy="40" rx="23" ry="12" fill="#a9c9c4" stroke="#3b2f25" stroke-width="2.6"/>'
  + '<ellipse cx="25" cy="42" rx="12" ry="5" fill="#7fb3a8"/>'
  + '<path d="M33 39c4-3 10-3 13 0-3 3-9 3-13 0z" fill="#6f9e4e" stroke="#3b2f25" stroke-width="2"/>'
  + '<circle cx="21" cy="38" r="3" fill="#f0a3b6" stroke="#3b2f25" stroke-width="1.6"/>'
  + '<path d="M47 34c-1-9 0-17 3-24M52 34c0-8 2-14 6-19M43 35c-3-7-4-13-3-19" fill="none" stroke="#3b2f25" stroke-width="2.4" stroke-linecap="round"/>'
  + '<path d="M50 10c1.5 1 1.5 3 0 4M58 15c1 1.3.6 3-.8 3.6M40 16c1.3.7 1.5 2.5.3 3.4" fill="none" stroke="#c9b45a" stroke-width="3" stroke-linecap="round"/>'
  + '</svg>';
// The place names, on open spots near what they name (picture pixels): few words, big, in the book's font, each with a halo of
// paper so it reads on the painting; none over a clearing, the trail or the compass.
const NAMES = [
  { text: 'Rjóðrið', at: [228, 786] }, // on the sandy clearing the trail starts from
  { text: 'Burknalautin', at: [616, 584] }, // under the glade
  { text: 'Fenjaslóðin', at: [997, 606], tilt: 30 }, // along the prints, which run down to the right, above them
  { text: 'Áin', at: [600, 268], tilt: 6 }, // on the river below the waterfall
  { text: 'Fenið', at: [1088, 440] }, // in the golden reed, left of its circle
].map(name => ({ ...name, at: onMap(name.at) }));
// The Fen's star is the one won there: Þórseðla's.
const PLACE_STARS = { fen: ['k2_thorsedla'] };
const BOUNCE_MS = 480;

// The trail, in picture pixels, along the middle of the sandy path (the points follow where the path's old painted dots lay, which
// tools/erase-map-dots.py has taken out; its lists are the same but for B). B runs along Þórseðla's prints, which are painted on the
// path, so it keeps 15 pixels to the lower side of them, on the sand, and the prints stay clear. Each piece ends at a place: it is
// there once that place is found or done, or any place after it is.
const ROUTE = [
  { id: 'a', end: 'kambedla', points: [[249, 736], [277, 710], [307, 690], [343, 675], [375, 667], [405, 663], [421, 659], [436, 651], [446, 639], [453, 625], [457, 610], [464, 595], [473, 581], [484, 569], [497, 557], [511, 546], [531, 532]] },
  { id: 'b', end: 'fen', points: [[628, 497], [651, 494], [667, 492], [689, 500], [716, 514], [747, 532], [788, 554], [829, 579], [872, 606], [911, 635], [951, 665], [995, 695], [1043, 717], [1096, 728], [1126, 730]] },
  { id: 'c', end: 'thorsedla', points: [[1126, 730], [1165, 728], [1198, 720], [1230, 709], [1261, 693], [1291, 673], [1317, 652], [1345, 629], [1373, 611], [1401, 595], [1430, 580], [1457, 567], [1487, 553], [1519, 538], [1548, 523], [1576, 506], [1600, 487], [1621, 463], [1628, 434], [1626, 417], [1608, 391], [1586, 378], [1566, 373]] },
];
const ROUTE_MS = 2000; // a piece draws itself over this long
const ROUTE_GAP_MS = 150; // and the next begins this long after it
const SVG_NS = 'http://www.w3.org/2000/svg';
const seenOf = id => `map-route-${id}`;

/**
 * A smooth curve through the points (a Catmull-Rom spline, as cubic Béziers): its path data and its length, in the view's units.
 */
function curve(points) {
  const at = i => points[Math.max(0, Math.min(points.length - 1, i))];
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  let length = 0;
  let from = points[0];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    for (let k = 1; k <= 16; k += 1) { // the length by short chords
      const t = k / 16;
      const u = 1 - t;
      const x = u ** 3 * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * p2[0];
      const y = u ** 3 * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * p2[1];
      length += Math.hypot(x - from[0], y - from[1]);
      from = [x, y];
    }
  }
  return { d, length };
}

/**
 * The map in the Kortið leaf (`leaf`: book.js's { el, pages, tiles }), over the `save`, with the book's sound (`audio`, whose tap
 * every slot plays). `onTap(id, state, marker)` hears a tap on a found or done slot. Returns
 *   render()        shows what the save holds now (the trail's pieces the child has not seen drawn wait, unseen, until show())
 *   show(delayMs)   the page is on view (the book's turn to it has this long to settle): the pieces waiting draw themselves in,
 *                   one after another, and each is kept in the save's seen list; pieces found while it is on view draw at once
 *   hide()          the page is off view: a piece still drawing is finished where it was going
 *   markers         id -> the slot's button, for the lab and for probes
 *   stateOf(id)     'empty', 'found' or 'done'
 *   routeOf(id)     a piece of the trail ('a', 'b', 'c'): 'hidden' (not got that far), 'pending' (got there, not yet drawn in),
 *                   'drawing' or 'drawn'
 */
export function renderMap(leaf, { save, onTap = null, audio = null, win = globalThis.window } = {}) {
  const doc = leaf.el.ownerDocument;
  const make = (tag, className) => {
    const element = doc.createElement(tag);
    element.className = className;
    return element;
  };
  const friendNames = new Map(FRIENDS.map(friend => [friend.key, friend.name]));
  const nameOf = id => (id === 'fen' ? 'Fenið' : friendNames.get(id) ?? id);
  // A spot on the map, as its page's left and top in percent, on the half of the map that has it.
  const halfOf = ([x]) => (x < HALF ? 0 : 1);
  const spot = (el, [x, y], half) => {
    el.style.setProperty('left', `${(((x - half * HALF) / HALF) * 100).toFixed(2)}%`);
    el.style.setProperty('top', `${((y / VIEW.height) * 100).toFixed(2)}%`);
  };

  // Each page: its half of the drawing, with the names and the slots on it.
  const halves = leaf.tiles.map((box, half) => {
    box.classList.add('map-tiles');
    const el = make('div', 'map-half');
    el.setAttribute('data-half', half ? 'right' : 'left');
    const drawing = doc.createElement('img');
    drawing.className = 'map-art';
    drawing.src = MAP_SRC;
    drawing.alt = '';
    drawing.draggable = false;
    el.append(drawing);
    box.append(el);
    return el;
  });
  // The trail: over each half's drawing an svg of that half (the same view, cropped to it), holding every piece, so a piece that
  // crosses the spine is drawn on both pages, and drawn in on both at once.
  const svgEl = (tag, attributes = {}) => {
    const element = doc.createElementNS ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    return element;
  };
  const pieces = ROUTE.map(({ id, end, points }) => ({ id, end, ...curve(points.map(onMap)), state: 'hidden', groups: [], reveals: [], animations: [] }));
  halves.forEach((el, half) => {
    const svg = svgEl('svg', { class: 'map-route', viewBox: `${half * HALF} 0 ${HALF} ${VIEW.height}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    for (const piece of pieces) {
      const maskId = `${seenOf(piece.id)}-${half ? 'right' : 'left'}`;
      const group = svgEl('g', { class: 'map-route-piece', 'data-piece': piece.id, 'data-state': 'hidden' });
      const mask = svgEl('mask', { id: maskId, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: VIEW.width, height: VIEW.height });
      // the ink is the dashed line, seen through this: a plain wide stroke that draws itself along the path (its dash is the
      // path's whole length, shifted back until it has all come in), so the dashes themselves stay as they are
      const reveal = svgEl('path', { class: 'map-route-reveal', d: piece.d, 'stroke-dasharray': `${piece.length.toFixed(1)} ${piece.length.toFixed(1)}`, 'stroke-dashoffset': piece.length.toFixed(1) });
      mask.append(reveal);
      const line = svgEl('path', { class: 'map-route-line', d: piece.d, mask: `url(#${maskId})` });
      group.append(mask, line);
      svg.append(group);
      piece.groups.push(group);
      piece.reveals.push(reveal);
    }
    el.append(svg);
  });
  for (const name of NAMES) {
    const half = halfOf(name.at);
    const label = make('span', 'map-name');
    label.textContent = name.text;
    if (name.tilt) label.style.setProperty('--tilt', `${name.tilt}deg`);
    spot(label, name.at, half);
    halves[half].append(label);
  }

  const markers = new Map(); // id -> { el, sticker, star }
  const states = new Map(); // id -> 'empty' | 'found' | 'done'
  for (const place of MAP_PLACES) {
    const half = halfOf(place.at);
    const el = make('button', 'map-marker');
    el.setAttribute('type', 'button');
    el.setAttribute('data-place', place.id);
    el.style.setProperty('--hue', placeHue(place.id));
    el.style.setProperty('--size', place.size); // across its pale circle, in the view's units
    spot(el, place.at, half);
    const sticker = make('span', 'map-sticker');
    if (place.id === 'fen') sticker.innerHTML = FEN_STICKER;
    else {
      const img = doc.createElement('img');
      img.src = PICTURES[place.id];
      img.alt = '';
      img.draggable = false;
      sticker.append(img);
    }
    const star = make('span', 'map-star');
    star.innerHTML = STAR_SVG;
    pressable(el, { audio, win, onTap: () => tap(place.id) }); // the book's tap, as every control's; a place found says more
    markers.set(place.id, { el, sticker, star });
    halves[half].append(el);
  }

  function tap(id) {
    const state = states.get(id);
    if (state === 'empty') return;
    const { el } = markers.get(id);
    if (typeof el.animate === 'function' && !reducedMotion(win)) {
      el.animate([{ scale: '1' }, { scale: '1.16' }, { scale: '1' }], { duration: BOUNCE_MS, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
    }
    onTap?.(id, state, el);
  }

  // ---- The trail ----------------------------------------------------------------------------------------------------------

  let shown = false; // the page is on view: a piece that has not been drawn in is drawn in now, not kept for later

  function setState(piece, state) {
    piece.state = state;
    const hidden = piece.length.toFixed(1);
    for (const group of piece.groups) group.setAttribute('data-state', state);
    for (const reveal of piece.reveals) reveal.setAttribute('stroke-dashoffset', state === 'drawn' ? '0' : hidden);
  }

  /** A piece drawn in to its end, by its animation or at once. */
  function finish(piece) {
    if (piece.state !== 'drawing') return;
    const { animations } = piece;
    piece.animations = [];
    setState(piece, 'drawn'); // before the animations go, which would show the piece hidden for a frame
    for (const animation of animations) animation.cancel();
  }

  /** A piece the child has not seen drawn: kept in the save as seen, and drawn along its length after `delay` ms, or just there. */
  function draw(piece, delay) {
    save.addSeen(seenOf(piece.id));
    if (reducedMotion(win) || !piece.reveals.every(reveal => typeof reveal.animate === 'function')) {
      setState(piece, 'drawn');
      return;
    }
    setState(piece, 'drawing');
    // both pages' copies start together and run alike, so a piece that crosses the spine is one line
    piece.animations = piece.reveals.map(reveal => reveal.animate(
      [{ strokeDashoffset: piece.length }, { strokeDashoffset: 0 }],
      { duration: ROUTE_MS, delay, easing: 'ease-in-out', fill: 'both' },
    ));
    piece.animations[0].onfinish = () => finish(piece);
  }

  /** The pieces waiting draw in, in the trail's order, each after the one before (those still drawing count as before). */
  function drawWaiting(delay) {
    let before = pieces.filter(piece => piece.state === 'drawing').length;
    for (const piece of pieces) {
      if (piece.state !== 'pending') continue;
      draw(piece, delay + before * (ROUTE_MS + ROUTE_GAP_MS));
      before += 1;
    }
  }

  function show(delay = 0) {
    shown = true;
    update();
    drawWaiting(delay);
  }

  function hide() {
    shown = false;
    for (const piece of pieces) finish(piece);
  }

  /** Shows what the save holds now; a piece of the trail it has just reached draws in at once if the page is on view. */
  function render() {
    update();
    if (shown) drawWaiting(0);
  }

  function update() {
    const { stars, places = [], seen = [] } = save.get();
    const won = new Set(stars);
    const friendsWon = new Set(stars.map(friendOf));
    const found = new Set(places);
    for (const place of MAP_PLACES) {
      const done = place.id in PLACE_STARS ? PLACE_STARS[place.id].some(id => won.has(id)) : friendsWon.has(place.id);
      const state = done ? 'done' : found.has(place.id) ? 'found' : 'empty';
      if (states.get(place.id) === state) continue;
      states.set(place.id, state);
      const { el, sticker, star } = markers.get(place.id);
      el.classList.toggle('empty', state === 'empty');
      el.classList.toggle('found', state !== 'empty');
      el.classList.toggle('done', state === 'done');
      // an empty slot shows no one: the sticker is on it once found, and the star once done
      el.replaceChildren(...(state === 'empty' ? [] : state === 'done' ? [sticker, star] : [sticker]));
      el.setAttribute('aria-label', state === 'empty' ? 'Ófundinn staður' : nameOf(place.id));
    }
    // the trail: a piece is there once its place or a later one is, and is waiting to be drawn in until the child has seen that
    const got = ROUTE.map(({ end }) => states.get(end) !== 'empty');
    pieces.forEach((piece, i) => {
      if (piece.state === 'drawing' || piece.state === 'drawn') return;
      const reached = got.slice(i).some(Boolean);
      const state = !reached ? 'hidden' : seen.includes(seenOf(piece.id)) ? 'drawn' : 'pending';
      if (piece.state !== state) setState(piece, state);
    });
  }

  render();
  return {
    render,
    show,
    hide,
    markers: new Map([...markers].map(([id, marker]) => [id, marker.el])),
    stateOf: id => states.get(id),
    routeOf: id => pieces.find(piece => piece.id === id)?.state,
  };
}
