import { pressable, reducedMotion } from './fx.js';
import { FRIENDS, STAR_SVG, friendOf, placeHue } from '../scene/journal.js';

// The book's map, Kortið (spec section 7, the fifth ribbon): a hand-drawn map of the forest and the Fen in the journal's style
// (assets/book/map.svg): the clearing where chapter 1 began, Kambeðla's fern glade, the trail down to the Fen with Þórseðla's
// prints along it, the river, and the Fen with its pools and its slow channel, joined by dotted paths. The drawing is one picture
// 1800 by 1000 across the spread, the forest on the left page and the Fen on the right (or one above the other on a tablet held
// upright), each page showing its half; the words on it are the page's own, in the book's font, so they read as the rest of the book.
//
// On it a slot for each place a chapter can find: the Fen itself and the six friends of the Star Festival, each where the child
// meets them (Slóeðla, Flugeðla and Uggeðla where they were found from Þórseðla's head, chapter 2). A slot is one of three:
//   empty  a dashed ring in the place's hue: nothing there yet; a tap is only the book's tap
//   found  the place is in the save's places: a round die-cut sticker of the friend (the Fen's is drawn)
//   done   its star is in the book (`k<N>_<key>` for a friend; the Fen's star is Þórseðla's, k2_thorsedla): the sticker wears a star
// A tap on a found or done slot hands it to onTap(id, state, marker): Mosi says its name and one sentence (k2_mosi_map_<id>,
// book.js). The slots are made once and render() only changes their state.

export const MAP_SRC = new URL('../../assets/book/map.svg', import.meta.url).href;
const VIEW = { width: 1800, height: 1000 }; // map.svg's viewBox: each page shows half its width
const HALF = VIEW.width / 2;

/** Each slot's place on the map (map.svg's units). */
export const MAP_PLACES = [
  { id: 'gramedla', at: [238, 236] }, // beyond the mountains, not yet explored
  { id: 'kambedla', at: [556, 404] }, // her fern glade
  { id: 'sloedla', at: [1078, 352] }, // wading in the far pool to the north-west
  { id: 'flugedla', at: [1158, 158] }, // on the white snag
  { id: 'thorsedla', at: [1352, 470] }, // her pool under her two conifers
  { id: 'uggedla', at: [1626, 640] }, // in the reed by the channel, to the south-east
  { id: 'fen', at: [1236, 716] }, // the Fen itself
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
// The place names, where the map has room for them (map.svg's units): few words, big, in the book's font.
const NAMES = [
  { text: 'Rjóðrið', at: [292, 770] },
  { text: 'Burknalautin', at: [556, 522] },
  { text: 'Fenjaslóðin', at: [722, 692], tilt: 12 },
  { text: 'Áin', at: [470, 150], tilt: -8 },
  { text: 'Fenið', at: [1392, 770] },
];
// The Fen's star is the one won there: Þórseðla's.
const PLACE_STARS = { fen: ['k2_thorsedla'] };
const BOUNCE_MS = 480;

/**
 * The map in the Kortið leaf (`leaf`: book.js's { el, pages, tiles }), over the `save`, with the book's sound (`audio`, whose tap
 * every slot plays). `onTap(id, state, marker)` hears a tap on a found or done slot. Returns
 *   render()        shows what the save holds now
 *   markers         id -> the slot's button, for the lab and for probes
 *   stateOf(id)     'empty', 'found' or 'done'
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

  function render() {
    const { stars, places = [] } = save.get();
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
  }

  render();
  return { render, markers: new Map([...markers].map(([id, marker]) => [id, marker.el])), stateOf: id => states.get(id) };
}
