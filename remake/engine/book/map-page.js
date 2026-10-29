import { pressable, reducedMotion } from './fx.js';
import { createLiveMap } from './map-life.js';
import { FRIENDS, STAR_SVG, friendOf, placeHue } from '../scene/journal.js';

// The book's map, Kortið (spec section 7, the fifth ribbon): a painted watercolour map of the whole journey (assets/book/map.webp):
// the clearing where chapter 1 began, Kambeðla's fern glade in the forest, the sandy trail with Þórseðla's prints along it down to
// the golden Fen, the river with its waterfall, and the Fen's pools, with a pale round clearing in the picture where each friend's
// sticker will go. The picture lies across the spread, 1800 by 1000 in the units below, the forest on the left page and the Fen on
// the right (or one above the other on a tablet held upright), each page showing its half; the words on it are the page's own, in
// the book's font, so they read as the rest of the book.
//
// On it a slot for each friend of the Star Festival, six of them, each on its pale circle (Slóeðla, Flugeðla and Uggeðla where they
// were found from Þórseðla's head, chapter 2). A slot is one of three:
//   empty  a dashed ring in the place's hue: nothing there yet; a tap is only the book's tap
//   found  the place is in the save's places: a round die-cut sticker of the friend, which rocks gently
//   done   her star is in the book (`k<N>_<key>`): the sticker wears a star
// A tap on a found or done slot hands it to onTap(id, state, marker): Mosi says its name and one sentence (k2_mosi_map_<id>,
// book.js). The slots are made once and render() only changes their state.
//
// The Fen has no slot and no name on the map (the owner, 2026-10-29): the golden reed painted in the middle of the right page is
// the Fen itself, its pale clearing filled with reed (tools/erase-map-spot.py). The save's place `fen`, which chapter 2 adds and
// flies its marker to the book button for, draws nothing here: no sticker, no star, no name and no piece of the trail.
//
// And the trail the child has travelled, drawn by the game (the picture has no line of its own) as a solid red line, like the travel
// lines in the Indiana Jones films: six pieces, each from the place before to the next. The order follows the painted path (the
// owner, 2026-10-29, qa/bokin/leid-tillaga.html, Tillaga B): Rjóðrið, Kambeðla, down Fenjaslóðin past the channel to Uggeðla, up the
// sandy path on the east to Þórseðla, then Flugeðla, Slóeðla and over the waterfall to Grameðla; the Fen lies beside the path and is
// no stop on it. A goes from the clearing to the glade (chapter 1's ride), B out of the forest along the prints and past the channel
// to Uggeðla, C up the sandy path to Þórseðla's pool; D goes from her pool to Flugeðla, E to Slóeðla and F, the longest, west to
// Grameðla. A piece is there once the child has got as far as the place it ends at, which the piece's `by` says: A and C by the
// place (found or done), B, D, E and F by the friend's star alone (done). Slóeðla, Flugeðla and Uggeðla are found from Þórseðla's
// head in chapter 2 and their stickers go on the map then, but that is not a trip to them, so their places reach nothing: the friend
// needs her star, and the line goes to her in the chapter of each, and not before. A later piece reached carries the earlier ones
// with it, so the trail never has a gap: while Uggeðla's chapter is not built, the game plays Þórseðla's after chapter 1, and
// reaching Þórseðla then draws B and C together, the way from the glade past Uggeðla's circle to hers. The first time the page
// shows a piece the child has not seen yet it draws itself along its length, one piece after another, and the save's seen list keeps
// `map-route-<piece>` so it happens once; afterwards, and with reduced motion, the piece is simply there. The map in the journey
// (map-moment.js) draws the pieces of the leg ahead on request (drawPieces) whenever a chapter sets out, whether or not they were
// drawn before, and keeps them seen, so the book does not draw them again when the place is found; it draws a map of its own in the
// overlay (each map's mask ids carry its number) from a leaf whose two pages sit side by side.
//
// A red dot says where the child is. While a piece draws in, the dot rides at the head of the line: it moves along the same curve
// over the same time with the same easing, so the two never part. At rest it stands at the end of the last piece drawn (at the start
// of A while none is), and pulses softly; a piece the child has reached but not yet seen drawn leaves it where it was until the page
// shows. Where the story goes next is shown before the child gets there: the first piece not yet reached is a faint dotted red
// line (under the drawn ones), and the slot it leads to pulses: its dashed ring while it is empty, and once the friend is found (the
// far friends are, in chapter 2, before the line goes to them) a soft ring in her hue round her sticker. Exactly one piece is next,
// none once every piece is reached.
//
// And the map is alive. Over the painting each page has a living layer (map-life.js), a canvas that draws that page's half of the
// painting itself with its own pixels moving: the water runs down the river, the fall falls, the trees sway and the cloud billows
// and drifts. It lies exactly over the painting, under the trail, the names and the slots, so the red line and the stickers stay
// as still and as sharp as they were. The layers are made when the page first shows (WebGL, and a texture or two each, are not
// worth having for a book that never opens on the map), run while it is on view (show() starts them, hide() stops them, and a
// book that is shut or turned to another page draws nothing) and begin to show once their first frame is drawn, the canvas fading
// in over the stylesheet's mist, which then gives way (.live on the page). Where the life cannot be (no WebGL, less motion asked
// for, or a context the graphics lose while the page shows) the page is the painting with the still mist layer over it, as it was
// before the life: a page that has lost its layer does not get it back. dispose() lets the layers go for good.
// The mist (the cloud over the mountains in the top left, cut from the painting: tools/map-life-layers.py) hangs round Grameðla's
// circle until she is found (her place, or her star): the first time the page shows her so, the mist is drawn back from her, a
// round hole in it widening over two seconds, and the save's seen list keeps `map-mist-gramedla` so that happens once; afterwards
// the hole is simply open. (The mist is the slot's: it opens when she is found or done, and not when her piece of the trail is
// reached, which only her star does.) The hole is the stylesheet's --map-hole on the left page's mist layer, a registered length
// so it widens smoothly; the living layer is told its size every frame (the hole it draws, in the painting's pixels) and keeps its
// clouds out of it. With reduced motion nothing moves, drifts or widens: there is no living layer, the mist stands, and the hole is
// just open.

export const MAP_SRC = new URL('../../assets/book/map.webp', import.meta.url).href;
export const MIST_SRC = new URL('../../assets/book/map-mist.webp', import.meta.url).href;
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
// The place names, on open spots near what they name (picture pixels): few words, big, in the book's font, each with a halo of
// paper so it reads on the painting; none over a clearing, the trail or the compass.
const NAMES = [
  { text: 'Rjóðrið', at: [228, 786] }, // on the sandy clearing the trail starts from
  { text: 'Burknalautin', at: [616, 584] }, // under the glade
  { text: 'Fenjaslóðin', at: [997, 606], tilt: 30 }, // along the prints, which run down to the right, above them
  { text: 'Áin', at: [600, 268], tilt: 6 }, // on the river below the waterfall
].map(name => ({ ...name, at: onMap(name.at) }));
const BOUNCE_MS = 480;

// The mist round Grameðla (the slot 'gramedla'): a round hole in the mist layer, 1.6 times the width across her circle in radius,
// which the layer's mask draws from its --map-hole (a radius in the page's own units, cqw: 9 to the cqw as the slots are sized; a
// registered length, book.css, so the widening is smooth) and which the first time she is reached widens from nothing over
// MIST_OPEN_MS. Her circle was cleared of mist when the layer was cut, so the hole shows once it is wider than that clearing. The
// living layer is given the same hole (hole() below, in picture pixels) and keeps its clouds out of it, the mist layer being
// hidden behind the canvas once that draws.
const MIST_OPEN_MS = 2000;
const MIST_SEEN = 'map-mist-gramedla';
const HOLE_SHUT = '0cqw';
const holeOpen = size => `${(size * 1.6 / (HALF / 100)).toFixed(2)}cqw`;

// The trail, in picture pixels. Its order follows the painted path (the owner, 2026-10-29; qa/bokin/leid-tillaga.html, Tillaga B): the
// circles are not on the sandy path, so a piece keeps to the path as far as it can and leaves it for the circle it ends at, which
// it stops at the edge of. A goes along the middle of the sandy path from the clearing to Kambeðla's glade; B takes up on the far side
// of the glade and runs along Þórseðla's prints, which are painted on the path, so it keeps 15 pixels to the lower side of them, on
// the sand, and the prints stay clear, then past the channel to the edge of Uggeðla's circle; C leaves her circle up the sandy path on
// the east and rounds Þórseðla's pool to the edge of her circle. D to F have no path in the picture and go over open ground, each
// keeping clear of the circles, the place names and the compass: D from Þórseðla's circle north-west to Flugeðla's, E west from
// there to Slóeðla's and F, from Slóeðla's, west along the north over the waterfall and into the mist to the edge of Grameðla's. The
// Fen has no piece: it lies beside the path and is a named place with no slot (NAMES). Each piece ends at a place and says how it
// is reached: `by: 'place'`, once that place is found or done, or `by: 'star'`, once the friend's star is in the book (a place
// found does not do: Uggeðla's, Flugeðla's and Slóeðla's are found from Þórseðla's head, which is not a trip to them); any place
// reached after it reaches it too.
const ROUTE = [
  { id: 'a', end: 'kambedla', by: 'place', points: [[249, 736], [277, 710], [307, 690], [343, 675], [375, 667], [405, 663], [421, 659], [436, 651], [446, 639], [453, 625], [457, 610], [464, 595], [473, 581], [484, 569], [497, 557], [511, 546], [531, 532]] },
  { id: 'b', end: 'uggedla', by: 'star', points: [[628, 497], [651, 494], [667, 492], [689, 500], [716, 514], [747, 532], [788, 554], [829, 579], [872, 606], [911, 635], [951, 665], [995, 695], [1043, 717], [1096, 728], [1126, 730], [1165, 728], [1198, 722], [1235, 712], [1275, 700], [1315, 690], [1355, 684], [1395, 682], [1413, 684]] },
  { id: 'c', end: 'thorsedla', by: 'place', points: [[1465, 644], [1478, 610], [1495, 575], [1519, 545], [1548, 523], [1576, 506], [1600, 487], [1621, 463], [1628, 434], [1626, 417], [1608, 391], [1586, 378], [1554, 366]] },
  { id: 'd', end: 'flugedla', by: 'star', points: [[1500, 320], [1470, 285], [1435, 250], [1400, 222], [1370, 200]] },
  { id: 'e', end: 'sloedla', by: 'star', points: [[1299, 172], [1250, 160], [1200, 152], [1150, 158], [1101, 170]] },
  { id: 'f', end: 'gramedla', by: 'star', points: [[1026, 168], [960, 160], [880, 152], [800, 146], [720, 140], [640, 136], [560, 134], [490, 140], [430, 150], [370, 150], [310, 140], [260, 128], [218, 116]] },
];
export const ROUTE_MS = 2650; // a piece draws itself over this long
export const ROUTE_GAP_MS = 200; // and the next begins this long after it
const DOT_R = 9; // the dot that says where the child is, in the view's units
const SVG_NS = 'http://www.w3.org/2000/svg';
const seenOf = id => `map-route-${id}`;
// Each trail piece's mask is found by its id, which must be one of a kind in the page: the book's map and the map in the journey's
// overlay (map-moment.js) are on the page together, so each map's ids carry its own number.
let mapsMade = 0;

/**
 * A smooth curve through the points (a Catmull-Rom spline, as cubic Béziers): its path data, its length and the short chords the
 * length was walked by, in the view's units. `samples` are the chords' ends, from the curve's start (at 0) to its end (at its
 * length), each as { x, y, at } with `at` the distance along the curve, so where the line's head is at any share of the length is
 * known without asking the browser to measure the path.
 */
function curve(points) {
  const at = i => points[Math.max(0, Math.min(points.length - 1, i))];
  let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  let length = 0;
  let from = points[0];
  const samples = [{ x: from[0], y: from[1], at: 0 }];
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
      samples.push({ x, y, at: length });
    }
  }
  return { d, length, samples };
}

/**
 * The map in the Kortið leaf (`leaf`: book.js's { el, pages, tiles }), over the `save`, with the book's sound (`audio`, whose tap
 * every slot plays). `onTap(id, state, marker)` hears a tap on a found or done slot, and, once the Fen is found, a tap on its name
 * (`onTap('fen', 'found', the name's element)`: no slot's button). `liveMap` makes each page's living layer, with createLiveMap's
 * signature (map-life.js; a test gives its own). Returns
 *   render()        shows what the save holds now (the trail's pieces the child has not seen drawn wait, unseen, until show())
 *   show(delayMs)   the page is on view (the book's turn to it has this long to settle): the pieces waiting draw themselves in,
 *                   one after another, and each is kept in the save's seen list; pieces found while it is on view draw at once;
 *                   and the living layers are started (startLife)
 *   hide()          the page is off view: a piece still drawing is finished where it was going, and the living layers stop
 *   startLife()     makes each page's living layer the first time (never with reduced motion), and starts them: a page whose layer
 *                   cannot be made, or was lost, stays the painting and the still mist for good. show() does this
 *   stopLife()      stops the layers drawing (hide() does this); startLife() runs them again
 *   dispose()       lets the living layers go for good, their graphics contexts with them: the map is then the painting and the mist
 *   alive()         whether some living layer is running now
 *   drawPieces(ids, { delay })  the named pieces ('a' to 'f') draw themselves in on request, in the order given, whether or not the save
 *                   has reached them or they were drawn before, and are kept as seen; returns the ms it takes after `delay` (0 with
 *                   reduced motion: they are simply there). It is the map in the journey's (map-moment.js), and it is not show()'s
 *   bounds(ids)     the box round the named pieces' curves, { x, y, width, height } in the view's units (the whole view for none)
 *   markers        id -> the slot's button, for the lab and for probes (six: the Fen has no slot)
 *   stateOf(id)     'empty', 'found' or 'done'
 *   routeOf(id)     a piece of the trail ('a' to 'f'): 'hidden' (not got that far), 'next' (the first not got to: a dotted
 *                   line), 'pending' (got there, not yet drawn in), 'drawing' or 'drawn'
 *   next()          the piece shown as next, or null once every piece is reached
 *   dotAt()         where the dot rests: the place the last piece drawn ends at ('kambedla', 'uggedla', 'thorsedla', 'flugedla', 'sloedla',
 *                   'gramedla'), or 'start' (the clearing) while none is drawn
 *   mistOpen()      whether the mist has been drawn back from Grameðla's circle: false until she is found or done and the page has
 *                   shown it (show() opens it, over two seconds the first time, and keeps `map-mist-gramedla` in the save's seen
 *                   list), true from then on, and true as soon as she is found with reduced motion
 */
export function renderMap(leaf, { save, onTap = null, audio = null, win = globalThis.window, liveMap = createLiveMap } = {}) {
  const doc = leaf.el.ownerDocument;
  const make = (tag, className) => {
    const element = doc.createElement(tag);
    element.className = className;
    return element;
  };
  const layer = (className, src) => {
    const image = make('img', className);
    image.src = src;
    image.alt = '';
    image.draggable = false;
    return image;
  };
  const friendNames = new Map(FRIENDS.map(friend => [friend.key, friend.name]));
  const nameOf = id => friendNames.get(id) ?? id;
  // A spot on the map, as its page's left and top in percent, on the half of the map that has it.
  const halfOf = ([x]) => (x < HALF ? 0 : 1);
  const spot = (el, [x, y], half) => {
    el.style.setProperty('left', `${(((x - half * HALF) / HALF) * 100).toFixed(2)}%`);
    el.style.setProperty('top', `${((y / VIEW.height) * 100).toFixed(2)}%`);
  };

  // Each page: its half of the drawing, with the living layer (a canvas of this page's half, which draws the painting moving once
  // startLife() has made it) and the mist over it, and the names and the slots on them. The painting and the mist are the
  // painting's own size and lie exactly where it does (the stylesheet puts both alike), so they match it pixel for pixel; the
  // canvas is the page's own size, drawn from the same pixels.
  const mists = []; // each page's mist layer
  const canvases = []; // each page's living layer's canvas
  const halves = leaf.tiles.map((box, half) => {
    box.classList.add('map-tiles');
    const el = make('div', 'map-half');
    el.setAttribute('data-half', half ? 'right' : 'left');
    const drawing = layer('map-art', MAP_SRC);
    const canvas = make('canvas', 'map-live');
    canvas.setAttribute('aria-hidden', 'true');
    const mist = layer('map-mist', MIST_SRC);
    el.append(drawing, canvas, mist);
    canvases.push(canvas);
    mists.push(mist);
    box.append(el);
    return el;
  });
  // Grameðla's hole is in the left page's mist, round her slot (the layer is the whole view, so her place on it is her place on
  // the map, in percent), shut until she is reached.
  const gramedla = MAP_PLACES.find(place => place.id === 'gramedla');
  mists[0].style.setProperty('--map-hole-x', `${(gramedla.at[0] / VIEW.width * 100).toFixed(2)}%`);
  mists[0].style.setProperty('--map-hole-y', `${(gramedla.at[1] / VIEW.height * 100).toFixed(2)}%`);
  mists[0].style.setProperty('--map-hole', HOLE_SHUT);
  // The trail: over each half's drawing an svg of that half (the same view, cropped to it), holding every piece and the dot, so a
  // piece or the dot that crosses the spine is drawn on both pages, and moves on both at once.
  const svgEl = (tag, attributes = {}) => {
    const element = doc.createElementNS ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    return element;
  };
  const pieces = ROUTE.map(({ id, end, points }) => ({ id, end, ...curve(points.map(onMap)), state: 'hidden', groups: [], reveals: [], animations: [] }));
  const dots = []; // each half's copy of the dot
  mapsMade += 1;
  const mapNumber = mapsMade;
  halves.forEach((el, half) => {
    const svg = svgEl('svg', { class: 'map-route', viewBox: `${half * HALF} 0 ${HALF} ${VIEW.height}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    for (const piece of pieces) {
      const maskId = `${seenOf(piece.id)}-${half ? 'right' : 'left'}-${mapNumber}`;
      const group = svgEl('g', { class: 'map-route-piece', 'data-piece': piece.id, 'data-state': 'hidden' });
      const mask = svgEl('mask', { id: maskId, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: VIEW.width, height: VIEW.height });
      // the red line is seen through this: a plain wide stroke that draws itself along the path (its dash is the path's whole
      // length, shifted back until it has all come in)
      const reveal = svgEl('path', { class: 'map-route-reveal', d: piece.d, 'stroke-dasharray': `${piece.length.toFixed(1)} ${piece.length.toFixed(1)}`, 'stroke-dashoffset': piece.length.toFixed(1) });
      mask.append(reveal);
      // the dotted way ahead, under the line that will cover it, which the style shows for a piece that is next or being drawn in
      const ahead = svgEl('path', { class: 'map-route-ahead', d: piece.d });
      const line = svgEl('path', { class: 'map-route-line', d: piece.d, mask: `url(#${maskId})` });
      group.append(mask, ahead, line);
      svg.append(group);
      piece.groups.push(group);
      piece.reveals.push(reveal);
    }
    // the dot: a ring that pulses at rest behind a red disc, in a group that is moved to where it is (the start of A for now)
    const dot = svgEl('g', { class: 'map-dot', transform: `translate(${pieces[0].samples[0].x.toFixed(1)} ${pieces[0].samples[0].y.toFixed(1)})` });
    dot.append(svgEl('circle', { class: 'map-dot-ring', r: DOT_R }), svgEl('circle', { class: 'map-dot-core', r: DOT_R }));
    svg.append(dot);
    dots.push(dot);
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
  let found = new Set(); // the save's places, as update() last read them
  for (const place of MAP_PLACES) {
    const half = halfOf(place.at);
    const el = make('button', 'map-marker');
    el.setAttribute('type', 'button');
    el.setAttribute('data-place', place.id);
    el.style.setProperty('--hue', placeHue(place.id));
    el.style.setProperty('--size', place.size); // across its pale circle, in the view's units
    spot(el, place.at, half);
    const sticker = make('span', 'map-sticker');
    const img = doc.createElement('img');
    img.src = PICTURES[place.id];
    img.alt = '';
    img.draggable = false;
    sticker.append(img);
    const star = make('span', 'map-star');
    star.innerHTML = STAR_SVG;
    pressable(el, { audio, win, onTap: () => tap(place.id) }); // the book's tap, as every control's; a place found says more
    markers.set(place.id, { el, sticker, star });
    halves[half].append(el);
  }

  /** The little bounce of a tap that is heard: a slot's button or a name springs out and back (scale is a property of its own, so it goes with whatever transform the element has). */
  function bounce(el) {
    if (typeof el.animate === 'function' && !reducedMotion(win)) {
      el.animate([{ scale: '1' }, { scale: '1.16' }, { scale: '1' }], { duration: BOUNCE_MS, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
    }
  }

  function tap(id) {
    const state = states.get(id);
    if (state === 'empty') return;
    const { el } = markers.get(id);
    bounce(el);
    onTap?.(id, state, el);
  }

  // ---- The mist round Grameðla --------------------------------------------------------------------------------------------

  let mistIsOpen = false; // drawn back from her circle: set as soon as it is begun, the animation only shows the way
  let opening = null; // the animation widening the hole, while it runs

  /** Draws the mist back from her circle: the hole is open, widening to it after `delay` ms, or at once (`delay` null). */
  function openMist(delay) {
    mistIsOpen = true;
    const open = holeOpen(gramedla.size);
    const [mist] = mists;
    mist.style.setProperty('--map-hole', open); // what stays when the animation is let go
    if (delay === null || reducedMotion(win) || typeof mist.animate !== 'function') return;
    opening = mist.animate([{ '--map-hole': HOLE_SHUT }, { '--map-hole': open }], { duration: MIST_OPEN_MS, delay, easing: 'ease-out', fill: 'backwards' });
    opening.onfinish = () => { opening = null; };
  }

  /** Once she is found or done, the page on view draws the mist back (the first time it sees her so) and keeps that in the save. */
  function showMist(delay) {
    if (states.get('gramedla') === 'empty') return;
    save.addSeen(MIST_SEEN);
    if (!mistIsOpen) openMist(delay);
  }

  // ---- The living layers --------------------------------------------------------------------------------------------------

  const lives = [null, null]; // each page's living layer, once startLife() has made it
  const lifeless = [false, false]; // a page that is the painting and the still mist for good: no WebGL, or its layer was lost, or let go
  const [gramedlaLeft, gramedlaTop] = [gramedla.at[0] * PICTURE.width / VIEW.width, gramedla.at[1] * PICTURE.height / VIEW.height];

  /**
   * The hole in the clouds on the left page, [x, y, r] in the painting's pixels: round Grameðla's circle, as wide as the mist's
   * --map-hole is now (the computed length in px, which is of the page as it is laid out: a page is half the painting, 840.5 pixels of
   * it) and r 0 while it is shut, or where nothing can be measured.
   */
  function hole() {
    const open = parseFloat(win.getComputedStyle?.(mists[0])?.getPropertyValue('--map-hole'));
    const width = halves[0].getBoundingClientRect().width;
    return [gramedlaLeft, gramedlaTop, open > 0 && width > 0 ? open * PICTURE.width / (2 * width) : 0];
  }

  /** Lets a page go to the painting and the mist, for good, and its layer with it. */
  function loseLife(half) {
    lifeless[half] = true;
    halves[half].classList.remove('live');
    const layer = lives[half];
    lives[half] = null;
    layer?.destroy();
  }

  /** The living layer of a page, made now: null (and the page without life for good) where it cannot be made. */
  function makeLife(half) {
    let layer = null;
    try {
      layer = liveMap(canvases[half], {
        half,
        win,
        hole: half ? () => [0, 0, 0] : hole,
        onReady: () => halves[half].classList.add('live'),
        onLost: () => loseLife(half),
      });
    } catch (error) {
      console.error(error);
    }
    if (!layer) lifeless[half] = true;
    return layer;
  }

  /** Makes the living layers the first time they are asked for, and runs them. Not with reduced motion, and not on a page without life. */
  function startLife() {
    if (reducedMotion(win)) return;
    halves.forEach((el, half) => {
      if (lifeless[half]) return;
      lives[half] ??= makeLife(half);
      lives[half]?.start();
    });
  }

  /** Stops the layers drawing, whatever the reason: they are not on view. */
  function stopLife() {
    for (const layer of lives) layer?.stop();
  }

  /** Lets the layers go: their graphics contexts are given up, so the map is the painting and the mist from now on. */
  function dispose() {
    halves.forEach((el, half) => loseLife(half));
  }

  // ---- The trail ----------------------------------------------------------------------------------------------------------

  let shown = false; // the page is on view: a piece that has not been drawn in is drawn in now, not kept for later
  let rests = 'start'; // where the dot stands when it is not travelling: the place the last piece drawn ends at, or 'start'

  /** Puts the dot where the pieces drawn say it rests (it only moves along a piece while that is being drawn in). */
  function settleDot() {
    const last = pieces.findLast(piece => piece.state === 'drawn');
    rests = last ? last.end : 'start';
    const { x, y } = (last ?? pieces[0]).samples[last ? last.samples.length - 1 : 0];
    const travelling = pieces.some(piece => piece.state === 'drawing');
    for (const dot of dots) {
      dot.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      dot.setAttribute('data-moving', travelling ? 'yes' : 'no'); // it pulses only when it is not travelling
    }
  }

  function setState(piece, state) {
    piece.state = state;
    const hidden = piece.length.toFixed(1);
    for (const group of piece.groups) group.setAttribute('data-state', state);
    for (const reveal of piece.reveals) reveal.setAttribute('stroke-dashoffset', state === 'drawn' ? '0' : hidden);
    settleDot();
  }

  /** A piece drawn in to its end, by its animation or at once. */
  function finish(piece) {
    if (piece.state !== 'drawing') return;
    const { animations } = piece;
    piece.animations = [];
    setState(piece, 'drawn'); // before the animations go, which would show the piece hidden for a frame
    for (const animation of animations) animation.cancel();
  }

  /** Whether a piece can be drawn in over time: not with reduced motion, and not on a page that cannot animate (then it is just there). */
  const canAnimate = () => !reducedMotion(win) && [...pieces[0].reveals, ...dots].every(element => typeof element.animate === 'function');

  /** A piece: kept in the save as seen, and drawn along its length after `delay` ms, or just there. */
  function draw(piece, delay) {
    save.addSeen(seenOf(piece.id));
    if (!canAnimate()) {
      setState(piece, 'drawn');
      return;
    }
    setState(piece, 'drawing');
    // both pages' copies start together and run alike, so a piece that crosses the spine is one line
    const timing = { duration: ROUTE_MS, delay, easing: 'ease-in-out' };
    piece.animations = piece.reveals.map(reveal => reveal.animate(
      [{ strokeDashoffset: piece.length }, { strokeDashoffset: 0 }],
      { ...timing, fill: 'both' },
    ));
    // The dot rides at the line's head: a keyframe for every chord of the curve, at its share of the length, under the same
    // timing, so it is where the head is at every moment. Unlike the line it does not wait at the piece's start for its turn
    // (it would stand over the piece before, which is still being drawn): it stays where it was until the piece begins, and
    // stays at the end when it is done, until the piece is finished and the dot rests there.
    const keyframes = piece.samples.map(({ x, y, at }) => ({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`, offset: Math.min(1, at / piece.length) }));
    piece.animations.push(...dots.map(dot => dot.animate(keyframes, { ...timing, fill: 'forwards' })));
    piece.animations[0].onfinish = () => finish(piece);
  }

  /**
   * The pieces waiting draw in, in the trail's order, each after the one before (those still drawing count as before); and the mist
   * is drawn back from Grameðla if she is reached and it has not been.
   */
  function drawWaiting(delay) {
    let before = pieces.filter(piece => piece.state === 'drawing').length;
    for (const piece of pieces) {
      if (piece.state !== 'pending') continue;
      draw(piece, delay + before * (ROUTE_MS + ROUTE_GAP_MS));
      before += 1;
    }
    showMist(delay);
  }

  const piecesOf = ids => [...new Set(ids)].map(id => pieces.find(piece => piece.id === id)).filter(Boolean);

  /**
   * The named pieces draw themselves in on request, in the order given, the first after `delay` ms and each next after the one before
   * (and the gap): whether or not the save has reached them, and whether or not they were drawn before (one that was is drawn again
   * from its start, the dot waiting where the piece before it ended). Each is kept in the save's seen list. Returns how long it all
   * takes in ms, from the first piece's start to the last one's end, not counting `delay`: 0 where nothing is drawn over time (reduced
   * motion, a page that cannot animate, ids that are no pieces), the pieces simply there.
   */
  function drawPieces(ids, { delay = 0 } = {}) {
    const chosen = piecesOf(ids);
    for (const piece of chosen) finish(piece); // one still drawing is brought to its end first
    if (canAnimate()) for (const piece of chosen) setState(piece, 'drawing'); // all hidden at once, each waiting its turn, so the dot rests where the piece before them ends
    chosen.forEach((piece, i) => draw(piece, delay + i * (ROUTE_MS + ROUTE_GAP_MS)));
    return canAnimate() && chosen.length ? chosen.length * ROUTE_MS + (chosen.length - 1) * ROUTE_GAP_MS : 0;
  }

  /** The box round the named pieces' curves, in the view's units ({ x, y, width, height }): the whole view for no piece. */
  function bounds(ids) {
    const chosen = piecesOf(ids);
    if (!chosen.length) return { x: 0, y: 0, width: VIEW.width, height: VIEW.height };
    let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const piece of chosen) {
      for (const { x, y } of piece.samples) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  function show(delay = 0) {
    shown = true;
    update();
    drawWaiting(delay);
    startLife();
  }

  function hide() {
    shown = false;
    for (const piece of pieces) finish(piece);
    opening?.cancel(); // the hole stays as wide as it was going to be
    opening = null;
    stopLife(); // nothing draws in the background
  }

  /** Shows what the save holds now; a piece of the trail it has just reached draws in at once if the page is on view. */
  function render() {
    update();
    if (shown) drawWaiting(0);
  }

  function update() {
    const { stars, places = [], seen = [] } = save.get();
    const friendsWon = new Set(stars.map(friendOf));
    found = new Set(places);
    for (const place of MAP_PLACES) {
      const state = friendsWon.has(place.id) ? 'done' : found.has(place.id) ? 'found' : 'empty';
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
    // the trail: a piece is there once its place (a and c: found or done) or its friend's star (b, d, e and f: done; her place may be
    // found from Þórseðla's head, which is not a trip to her) or a later piece's is, and is waiting to be drawn in until the child has
    // seen that; the first one not there yet is next, a dotted way ahead, and the slot it leads to pulses, empty or found
    const got = ROUTE.map(({ end, by }) => (by === 'star' ? states.get(end) === 'done' : states.get(end) !== 'empty'));
    const reachedAt = i => got.slice(i).some(Boolean);
    const next = ROUTE.findIndex((_, i) => !reachedAt(i));
    pieces.forEach((piece, i) => {
      if (piece.state === 'drawing' || piece.state === 'drawn') return;
      const state = reachedAt(i) ? (seen.includes(seenOf(piece.id)) ? 'drawn' : 'pending') : i === next ? 'next' : 'hidden';
      if (piece.state !== state) setState(piece, state);
    });
    for (const [id, { el }] of markers) el.classList.toggle('next', next >= 0 && ROUTE[next].end === id);
    // the mist: once she is reached and it was seen drawn back (or with less motion, which draws nothing), it is simply open
    if (!mistIsOpen && states.get('gramedla') !== 'empty' && (seen.includes(MIST_SEEN) || reducedMotion(win))) openMist(null);
  }

  render();
  return {
    render,
    show,
    hide,
    startLife,
    stopLife,
    dispose,
    alive: () => lives.some(layer => layer?.running),
    drawPieces,
    bounds,
    markers: new Map([...markers].map(([id, marker]) => [id, marker.el])),
    stateOf: id => states.get(id),
    routeOf: id => pieces.find(piece => piece.id === id)?.state,
    next: () => pieces.find(piece => piece.state === 'next')?.id ?? null,
    dotAt: () => rests,
    mistOpen: () => mistIsOpen,
  };
}
