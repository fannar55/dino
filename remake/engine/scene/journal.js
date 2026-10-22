import { Handle } from '../handle.js';

// Egill's explorer's journal (STYLE.md section 10): a book in the top right corner of the screen with a slot for the star of
// each friend. A tap on it opens the book itself (engine/book/book.js), the living book over the paused game. A star from a
// friend flies into its slot (spec scene 10), a new animal's picture flies into the book, a place found for the book's map
// (Kortið) flies in as a small round marker in its hue, and the save (engine/save.js) keeps what the child has earned.
//
// The motion is driven from update(dt) with game time, like everything else, so a capture finds the star in the same place every
// time and a paused game (the child's open book) holds it in the air. main.js calls update(dt) before the scene's, so a flight that
// a script starts in one frame is counted from the next.
//
// A star id names the chapter and the friend, `k1_kambedla`: the part after the first underscore picks the slot, so the stars of
// later chapters need no change here.

export const FLIGHT_SECONDS = 1.2; // from where the star or the animal was tapped to the book
const POP_SECONDS = 0.5; // the slot swells when the star lands
const BUMP_SECONDS = 0.4; // the book nods when an animal goes in it
const FLYING_STAR_PX = 72; // the size of .flying-star in style.css
const FLYING_FIND_PX = 96; // and of .flying-find
const FLYING_PLACE_PX = 60; // and of .flying-place
const ARC_PX = 120; // the highest a flight bows above the straight line, at most
const TOP_MARGIN_PX = 44; // and it never bows so high that the star (72 px across) leaves the screen

/**
 * The six friends of the Star Festival, one slot each, in the main hue of each: the Main column of STYLE.md section 3's species
 * colour map, which tests/journal.test.mjs holds them to, so a hue that changes there must change here. The book's Stjörnur page
 * shows them too.
 */
export const FRIENDS = [
  { key: 'kambedla', name: 'Kambeðla', colour: '#8f6aa3' },
  { key: 'thorsedla', name: 'Þórseðla', colour: '#e9b14d' },
  { key: 'gramedla', name: 'Grameðla', colour: '#b37955' },
  { key: 'uggedla', name: 'Uggeðla', colour: '#47908a' },
  { key: 'sloedla', name: 'Slóeðla', colour: '#6793d0' },
  { key: 'flugedla', name: 'Flugeðla', colour: '#dc8090' },
];

const STAR_PATH = 'M12 2.4L14.88 9.04L22.08 9.72L16.66 14.51L18.23 21.58L12 17.9L5.77 21.58L7.34 14.51L1.92 9.72L9.12 9.04Z';
export const STAR_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
// A place on the map: a pin with a dot, as a journal's map marks one.
const PIN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22c-.6 0-6.8-6.9-6.8-11.6a6.8 6.8 0 0 1 13.6 0C18.8 15.1 12.6 22 12 22z"/><circle cx="12" cy="10.3" r="2.6"/></svg>';

/**
 * The places of the book's map that are not a friend's (whose hue is the friend's own): the Fen, in its water's teal (the
 * spec's Fen palette, `#3f7a6e`).
 */
const PLACE_HUES = { fen: '#3f7a6e' };
/** The hue a place is marked in: a friend's main hue for the friend's place, or the place's own. */
export const placeHue = id => FRIENDS.find(friend => friend.key === id)?.colour ?? PLACE_HUES[id] ?? '#2f8f86';

/** The friend a star id names: `k1_kambedla` is kambedla's. */
export const friendOf = id => id.slice(id.indexOf('_') + 1);
const slotOf = id => FRIENDS.findIndex(friend => friend.key === friendOf(id));
const ease = t => t * t * (3 - 2 * t);

function needId(id, call) {
  if (typeof id !== 'string' || !id) throw new TypeError(`${call} needs the id of the star or animal, a name, not ${String(id)}`);
}

/**
 * The journal on a page that has index.html's journal elements, over a save, with the book it opens (createBook) and the book's
 * sound (createBookAudio) for a new animal. Returns
 *   addStar(id, from)       a star flies from `from` ({ x, y } in screen pixels) to its slot; returns a Handle that is done when it
 *                           has landed and been saved. A star already on its way shares its flight; one the book already has
 *                           flies again and is kept once. A cancelled flight lands at once: the star was earned.
 *   addFinding(id, from)    an animal goes in the book (saved at once); false when it was in it already. A new one's picture (the
 *                           book's pictureOf) flies from `from` ({ x, y } in screen pixels; the middle of the screen without it)
 *                           into the button, where the book nods, `newAnimal` sounds and a badge shows until the book is opened.
 *   addPlace(id, from)      a place goes on the book's map (saved at once); false when it was on it already. A new one's marker, a
 *                           small round pin in its hue (placeHue), flies from `from` ({ x, y } in screen pixels; the middle of the
 *                           screen without it) into the button, where the book nods and badges as for an animal.
 *   update(dt)              moves what moves, with game time
 *   show(on = true)         brings the button out, or puts it away; it comes out by itself with the first star or find
 *   open(tab), close(), isOpen  the book for a scene that ends in it: open() opens it on its stars (or on `tab`, such as 'games')
 *                           as the script's, which holds nothing (book.js), so the scene goes on under it
 *   stars, findings, places the ids, in the order they came
 * A tap on the button opens the book on its animals as the child's, which holds the game until the child shuts it. An animal found
 * since the book was last opened asks it to open on that animal's spread of the Dýrin page, where its tile nods (the newest, if
 * there were more); any opening of the book answers it.
 */
export function createJournal(doc, save, { book = null, audio = null } = {}) {
  const need = id => {
    const element = doc.getElementById(id);
    if (!element) throw new Error(`The journal needs #${id} on the page (see index.html)`);
    return element;
  };
  const button = need('journal-button');
  const slotsEl = need('star-slots');
  const flightsEl = need('journal-flights');
  const badgeEl = need('journal-badge');
  const bookIcon = button.querySelector?.('.journal-icon') ?? null; // where a find lands: the little book on the button

  const flights = new Map(); // 'star:<id>' or 'find:<id>' -> the flight in the air
  let newest = null; // the animal found since the book was last opened, which it opens for
  const motions = []; // { el, age, seconds, amount }: a slot swelling, the book nodding

  const slots = FRIENDS.map(friend => {
    const slot = doc.createElement('span');
    slot.className = 'star-slot';
    slot.style.setProperty('--hue', friend.colour);
    slot.innerHTML = STAR_SVG;
    return slot;
  });
  slotsEl.replaceChildren(...slots);

  /** Lights the slots of the stars the save holds. */
  function render() {
    const got = new Set(save.get().stars.map(friendOf));
    FRIENDS.forEach((friend, i) => slots[i].classList.toggle('earned', got.has(friend.key)));
  }

  function show(on = true) {
    button.hidden = !on;
  }

  /** Opening the book takes the badge off: the child has seen what is new in it. On its animals, it opens for the newest find. */
  function openBook(tab, by) {
    badgeEl.hidden = true;
    const find = newest;
    newest = null;
    book?.open(tab, by, { find });
  }

  /** Swell an element and let it settle, over `seconds` of game time. */
  function swell(el, seconds, amount) {
    motions.push({ el, age: 0, seconds, amount });
  }

  /** The middle of a rectangle, and how much bigger or smaller than `size` it is. */
  function centreOf(rect, size) {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, scale: rect.width ? rect.width / size : 0.4 };
  }

  /** Where a flight ends up: a star in the middle of its slot (or of the button when it has none), an animal or a place on the button's book. */
  function arrival(flight) {
    if (flight.kind === 'star') return centreOf((slots[slotOf(flight.id)] ?? button).getBoundingClientRect(), FLYING_STAR_PX);
    return centreOf((bookIcon ?? button).getBoundingClientRect(), flight.kind === 'place' ? FLYING_PLACE_PX : FLYING_FIND_PX);
  }

  function place(flight) {
    const e = ease(Math.min(1, flight.age / FLIGHT_SECONDS));
    const to = arrival(flight);
    const arc = Math.min(ARC_PX, 0.25 * Math.hypot(to.x - flight.from.x, to.y - flight.from.y));
    const x = flight.from.x + (to.x - flight.from.x) * e;
    const line = flight.from.y + (to.y - flight.from.y) * e;
    const y = Math.max(Math.min(line, TOP_MARGIN_PX), line - arc * Math.sin(Math.PI * e)); // the bow stays on the screen
    const turn = flight.kind === 'star' ? e * 360 : 12 * Math.sin(e * 2 * Math.PI); // a star spins, a picture rocks
    const scale = flight.start + (to.scale - flight.start) * e;
    flight.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) rotate(${turn.toFixed(0)}deg) scale(${scale.toFixed(3)})`;
  }

  /** A new animal is in the book: it nods, the book's bell sounds, and the button wears a badge until the book is opened. */
  function welcome() {
    swell(button, BUMP_SECONDS, 0.15);
    audio?.sfx?.('newAnimal');
    badgeEl.hidden = false;
    book?.refresh?.();
  }

  function land(flight) {
    if (flights.get(flight.key) !== flight) return; // it has landed
    flights.delete(flight.key);
    flight.el.remove();
    if (flight.kind === 'find' || flight.kind === 'place') {
      welcome();
      return;
    }
    save.addStar(flight.id);
    render();
    if (slotOf(flight.id) >= 0) swell(slots[slotOf(flight.id)], POP_SECONDS, 0.7);
    book?.refresh?.();
    flight.handle.finish();
  }

  function fly(flight) {
    flights.set(flight.key, flight);
    flightsEl.append(flight.el);
    place(flight);
  }

  function addStar(id, from) {
    needId(id, 'journal.addStar');
    if (!Number.isFinite(from?.x) || !Number.isFinite(from?.y)) {
      throw new TypeError('journal.addStar needs where the star starts: { x, y } in screen pixels');
    }
    const flying = flights.get(`star:${id}`);
    if (flying) return flying.handle;
    show();
    const flight = { key: `star:${id}`, kind: 'star', id, age: 0, start: 1.1, from: { x: from.x, y: from.y }, el: doc.createElement('div'), handle: null };
    flight.el.className = 'flying-star';
    flight.el.innerHTML = STAR_SVG;
    flight.handle = new Handle('star', () => land(flight));
    fly(flight);
    return flight.handle;
  }

  function addFinding(id, from = null) {
    needId(id, 'journal.addFinding');
    const isNew = save.addFinding(id);
    if (!isNew) return false;
    newest = id;
    show();
    const picture = book?.pictureOf?.(id) ?? null;
    if (!picture) {
      welcome(); // nothing to fly (the book's cards could not be read): it is in the book at once
      return true;
    }
    const screen = flightsEl.getBoundingClientRect(); // the layer the flights cross is the screen
    const start = Number.isFinite(from?.x) && Number.isFinite(from?.y)
      ? { x: from.x, y: from.y }
      : { x: screen.left + screen.width / 2, y: screen.top + screen.height / 2 };
    const flight = { key: `find:${id}`, kind: 'find', id, age: 0, start: 1, from: start, el: doc.createElement('div') };
    flight.el.className = 'flying-find';
    const image = doc.createElement('img');
    image.src = picture;
    image.alt = '';
    flight.el.append(image);
    fly(flight);
    return true;
  }

  function addPlace(id, from = null) {
    needId(id, 'journal.addPlace');
    if (!save.addPlace(id)) return false;
    show();
    const screen = flightsEl.getBoundingClientRect();
    const start = Number.isFinite(from?.x) && Number.isFinite(from?.y)
      ? { x: from.x, y: from.y }
      : { x: screen.left + screen.width / 2, y: screen.top + screen.height / 2 };
    const flight = { key: `place:${id}`, kind: 'place', id, age: 0, start: 1, from: start, el: doc.createElement('div') };
    flight.el.className = 'flying-place';
    flight.el.style.setProperty('--hue', placeHue(id));
    flight.el.innerHTML = PIN_SVG;
    fly(flight);
    return true;
  }

  function update(dt) {
    if (!(dt > 0)) return; // paused or frozen
    for (const flight of [...flights.values()]) {
      flight.age += dt;
      if (flight.age >= FLIGHT_SECONDS - 1e-9) land(flight);
      else place(flight);
    }
    for (const motion of [...motions]) {
      motion.age += dt;
      const p = Math.min(1, motion.age / motion.seconds);
      motion.el.style.transform = p >= 1 ? '' : `scale(${(1 + motion.amount * Math.sin(Math.PI * p)).toFixed(3)})`;
      if (p >= 1) motions.splice(motions.indexOf(motion), 1);
    }
  }

  button.addEventListener('click', () => openBook('animals', 'child'));

  render();
  badgeEl.hidden = true;
  const held = save.get();
  show(held.stars.length > 0 || held.findings.length > 0 || held.places?.length > 0);

  return {
    addStar,
    addFinding,
    addPlace,
    update,
    show,
    open: (tab = 'stars') => openBook(tab, 'script'),
    close: () => book?.close(),
    get isOpen() { return book?.isOpen ?? false; },
    get stars() { return save.get().stars; },
    get findings() { return save.get().findings; },
    get places() { return save.get().places ?? []; },
  };
}
