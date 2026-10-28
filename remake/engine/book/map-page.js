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
//   found  the place is in the save's places: a round die-cut sticker of the friend (the Fen's is drawn), which rocks gently
//   done   its star is in the book (`k<N>_<key>` for a friend; the Fen's star is Þórseðla's, k2_thorsedla): the sticker wears a star
// A tap on a found or done slot hands it to onTap(id, state, marker): Mosi says its name and one sentence (k2_mosi_map_<id>,
// book.js). The slots are made once and render() only changes their state.
//
// And the trail the child has travelled, drawn by the game (the picture has no line of its own) as a solid red line, like the travel
// lines in the Indiana Jones films: seven pieces, in the order of the game's script (docs/superpowers/specs/2026-10-28-handrit-leiksins.md,
// one friend a chapter), each from the place before to the next. The first three go along the middle of the sandy trail: A from the
// clearing to the glade (chapter 1's ride), B out of the forest along the prints to the Fen (chapter 2's trail) and C across the
// wetland to Þórseðla's pool. Then D from her pool, round the north of it and west above the Fen, to Slóeðla's far pool (chapter 3),
// E in a low arc to Flugeðla's snag (chapter 4), F south between the Fen and Þórseðla's pool to Uggeðla in her reed (chapter 5) and
// G, the longest, west over the Fen and the forest and across the river at the waterfall's foot, up into the mist to Grameðla
// (chapter 6). A piece is there once the child has got as far as the place it ends at, which the piece's `by` says: A, B and C by
// the place (found or done), D to G by the friend's star alone (done). Slóeðla, Flugeðla and Uggeðla are found from Þórseðla's head
// in chapter 2 and their stickers go on the map then, but that is not a trip to them; the line goes there in the chapter of each,
// and not before. A later piece reached carries the earlier ones with it, so the trail never has a gap. The first time the page
// shows a piece the child has not seen yet it draws itself along its length, one piece after another, and the save's seen list keeps
// `map-route-<piece>` so it happens once; afterwards, and with reduced motion, the piece is simply there. The map in the journey
// (map-moment.js) draws the pieces of the leg ahead on request (drawPieces) whenever a chapter sets out, whether or not they were drawn
// before, and keeps them seen, so the book does not draw them again when the place is found; it draws a map of its own in the overlay
// (each map's mask ids carry its number) from a leaf whose two pages sit side by side.
//
// A red dot says where the child is. While a piece draws in, the dot rides at the head of the line: it moves along the same curve
// over the same time with the same easing, so the two never part. At rest it stands at the end of the last piece drawn (at the start
// of A while none is), and pulses softly; a piece the child has reached but not yet seen drawn leaves it where it was until the page
// shows. Where the story goes next is shown before the child gets there: the first piece not yet reached is a faint dotted red
// line (under the drawn ones), and the slot it leads to pulses: its dashed ring while it is empty, and once the friend is found (the
// far friends are, in chapter 2, before the line goes to them) a soft ring in her hue round her sticker. Exactly one piece is next,
// none once every piece is reached.
//
// And the map is alive. Two layers cut from the painting itself (tools/map-life-layers.py), the same size as it and lying exactly
// over it on each page, keep it moving without a line drawn: a soft light glides across the water (the river, the waterfall, the
// Fen's pools: the layer shows only inside a band that crosses the spread in nine seconds, a little brighter than the painting
// under it, so the light lies on the water and nowhere else); the mist (the cloud over the mountains in the top left) slides gently
// from side to side and breathes over fourteen. The mist hangs round Grameðla's circle until she is found (her place, or her star):
// the first time the page shows her so, the mist is drawn back from her, a round hole in it widening over two seconds, and the
// save's seen list keeps `map-mist-gramedla` so that happens once; afterwards the hole is simply open. (The mist is the slot's: it
// opens when she is found or done, and not when her piece of the trail is reached, which only her star does.) With
// reduced motion nothing glides, drifts or widens: the water layer is not shown, the mist stands, and the hole is just open.
// (The water was first to ripple, an animated SVG noise pushing its pixels about; its noise is drawn again every frame, which
// took about five milliseconds a frame on a laptop's graphics at a tablet's size, more than the four allowed. The light is a mask
// sliding over a picture, which costs next to nothing.)

export const MAP_SRC = new URL('../../assets/book/map.webp', import.meta.url).href;
export const WATER_SRC = new URL('../../assets/book/map-water.webp', import.meta.url).href;
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

// The life. (The water's light is the stylesheet's alone: .map-water.) The mist round Grameðla (the slot 'gramedla'): a round hole in the mist layer, 1.6 times the width across her circle in radius,
// which the layer's mask draws from its --map-hole (a radius in the page's own units, cqw: 9 to the cqw as the slots are sized) and
// which the first time she is reached widens from nothing over MIST_OPEN_MS. Her circle was cleared of mist when the layer was
// cut, so the hole shows once it is wider than that clearing.
const MIST_OPEN_MS = 2000;
const MIST_SEEN = 'map-mist-gramedla';
const HOLE_SHUT = '0cqw';
const holeOpen = size => `${(size * 1.6 / (HALF / 100)).toFixed(2)}cqw`;

// The trail, in picture pixels (the points follow where the path's old painted dots lay, which tools/erase-map-dots.py has taken
// out; its lists are the same but for B). A, B and C go along the middle of the sandy path; B runs along Þórseðla's prints, which are
// painted on the path, so it keeps 15 pixels to the lower side of them, on the sand, and the prints stay clear. D to G have no path
// in the picture and go over open ground, each keeping clear of the circles, the place names and the compass: D leaves Þórseðla's
// pool in an arc round the north of her circle and runs west above the Fen, under Flugeðla's circle, to the edge of Slóeðla's; E is
// a low arc to the north, clear of D, from Slóeðla's circle to Flugeðla's; F goes south between the Fen's circle and Þórseðla's,
// crossing D and C once each, to Uggeðla's; G, from Uggeðla's, runs west-north-west over the Fen and the forest (crossing C once),
// south of "Áin", across the river at the waterfall's foot and up into the mist to the edge of Grameðla's circle. Each piece ends at a place and says how it
// is reached: `by: 'place'`, once that place is found or done, or `by: 'star'`, once the friend's star is in the book (a place
// found does not do); any place reached after it reaches it too.
const ROUTE = [
  { id: 'a', end: 'kambedla', by: 'place', points: [[249, 736], [277, 710], [307, 690], [343, 675], [375, 667], [405, 663], [421, 659], [436, 651], [446, 639], [453, 625], [457, 610], [464, 595], [473, 581], [484, 569], [497, 557], [511, 546], [531, 532]] },
  { id: 'b', end: 'fen', by: 'place', points: [[628, 497], [651, 494], [667, 492], [689, 500], [716, 514], [747, 532], [788, 554], [829, 579], [872, 606], [911, 635], [951, 665], [995, 695], [1043, 717], [1096, 728], [1126, 730]] },
  { id: 'c', end: 'thorsedla', by: 'place', points: [[1126, 730], [1165, 728], [1198, 720], [1230, 709], [1261, 693], [1291, 673], [1317, 652], [1345, 629], [1373, 611], [1401, 595], [1430, 580], [1457, 567], [1487, 553], [1519, 538], [1548, 523], [1576, 506], [1600, 487], [1621, 463], [1628, 434], [1626, 417], [1608, 391], [1586, 378], [1566, 373]] },
  { id: 'd', end: 'sloedla', by: 'star', points: [[1566, 373], [1572, 335], [1552, 300], [1515, 285], [1470, 282], [1420, 280], [1370, 272], [1320, 262], [1270, 252], [1220, 240], [1170, 228], [1125, 212], [1098, 200]] },
  { id: 'e', end: 'flugedla', by: 'star', points: [[1100, 160], [1140, 140], [1200, 128], [1260, 135], [1300, 155]] },
  { id: 'f', end: 'uggedla', by: 'star', points: [[1360, 205], [1385, 260], [1400, 320], [1405, 380], [1400, 440], [1405, 500], [1420, 560], [1440, 620], [1452, 645]] },
  { id: 'g', end: 'gramedla', by: 'star', points: [[1413, 684], [1330, 645], [1240, 606], [1150, 570], [1060, 535], [970, 500], [880, 462], [790, 420], [700, 375], [610, 340], [530, 300], [470, 262], [420, 228], [360, 190], [300, 158], [250, 135], [214, 122]] },
];
export const ROUTE_MS = 2000; // a piece draws itself over this long
export const ROUTE_GAP_MS = 150; // and the next begins this long after it
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
 * every slot plays). `onTap(id, state, marker)` hears a tap on a found or done slot. Returns
 *   render()        shows what the save holds now (the trail's pieces the child has not seen drawn wait, unseen, until show())
 *   show(delayMs)   the page is on view (the book's turn to it has this long to settle): the pieces waiting draw themselves in,
 *                   one after another, and each is kept in the save's seen list; pieces found while it is on view draw at once
 *   hide()          the page is off view: a piece still drawing is finished where it was going
 *   drawPieces(ids, { delay })  the named pieces ('a' to 'g') draw themselves in on request, in the order given, whether or not the save
 *                   has reached them or they were drawn before, and are kept as seen; returns the ms it takes after `delay` (0 with
 *                   reduced motion: they are simply there). It is the map in the journey's (map-moment.js), and it is not show()'s
 *   bounds(ids)     the box round the named pieces' curves, { x, y, width, height } in the view's units (the whole view for none)
 *   markers        id -> the slot's button, for the lab and for probes
 *   stateOf(id)     'empty', 'found' or 'done'
 *   routeOf(id)     a piece of the trail ('a' to 'g'): 'hidden' (not got that far), 'next' (the first not got to: a dotted
 *                   line), 'pending' (got there, not yet drawn in), 'drawing' or 'drawn'
 *   next()          the piece shown as next, or null once every piece is reached
 *   dotAt()         where the dot rests: the place the last piece drawn ends at ('kambedla', 'fen', 'thorsedla', 'sloedla', 'flugedla',
 *                   'uggedla', 'gramedla'), or 'start' (the clearing) while none is drawn
 *   mistOpen()      whether the mist has been drawn back from Grameðla's circle: false until she is found or done and the page has
 *                   shown it (show() opens it, over two seconds the first time, and keeps `map-mist-gramedla` in the save's seen
 *                   list), true from then on, and true as soon as she is found with reduced motion
 */
export function renderMap(leaf, { save, onTap = null, audio = null, win = globalThis.window } = {}) {
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
  const nameOf = id => (id === 'fen' ? 'Fenið' : friendNames.get(id) ?? id);
  // A spot on the map, as its page's left and top in percent, on the half of the map that has it.
  const halfOf = ([x]) => (x < HALF ? 0 : 1);
  const spot = (el, [x, y], half) => {
    el.style.setProperty('left', `${(((x - half * HALF) / HALF) * 100).toFixed(2)}%`);
    el.style.setProperty('top', `${((y / VIEW.height) * 100).toFixed(2)}%`);
  };

  // Each page: its half of the drawing, with the water and the mist over it, and the names and the slots on them. The layers are
  // the painting's own size and lie exactly where it does (the stylesheet puts all three alike), so they match it pixel for pixel.
  const mists = []; // each page's mist layer
  const halves = leaf.tiles.map((box, half) => {
    box.classList.add('map-tiles');
    const el = make('div', 'map-half');
    el.setAttribute('data-half', half ? 'right' : 'left');
    const drawing = layer('map-art', MAP_SRC);
    const water = layer('map-water', WATER_SRC);
    const mist = layer('map-mist', MIST_SRC);
    el.append(drawing, water, mist);
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
  }

  function hide() {
    shown = false;
    for (const piece of pieces) finish(piece);
    opening?.cancel(); // the hole stays as wide as it was going to be
    opening = null;
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
    // the trail: a piece is there once its place (A to C: found or done) or its friend's star (D to G: done; her place is found from
    // Þórseðla's head, not visited) or a later piece's is, and is waiting to be drawn in until the child has seen that; the first one
    // not there yet is next, a dotted way ahead, and the slot it leads to pulses, empty or found
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
