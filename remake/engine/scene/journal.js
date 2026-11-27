import { Handle } from '../handle.js';
import { createMapMoment } from '../book/map-moment.js';
import { FRIENDS, SEVENTH_SLOT, STAR_SVG, placeHue, friendOf } from './journal-data.js';
export { FRIENDS, SEVENTH_SLOT, STAR_SVG, placeHue, friendOf };

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
 * The book sends the friends' six stars up to the sky (launchStars: the festival's scene 2, chapters/hatid.js): a copy of the
 * button's book swells out into the middle of the screen over `swell` s; one star for each friend leaves it `gap` s after the one
 * before and flies `seconds` to its place, a rocket's short tail behind it; `back` s after the last has arrived the book is back
 * in the button.
 */
export const LAUNCH = { swell: 0.6, seconds: 1.4, gap: 0.18, back: 0.6 };
const LAUNCH_BOOK_PX = 132; // the size of .flying-book in style.css
const ROCKET_SCALE = [0.8, 0.42]; // a launched star's size (of FLYING_STAR_PX) as it leaves the book and as it arrives on the sky
// The book's own picture where the page's button has none to copy (as index.html's .journal-icon)
const BOOK_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="5" width="31" height="38" rx="5" fill="#e07a3f" stroke="#3b2f25" stroke-width="2.5"/><path d="M9 10a5 5 0 0 1 5-5h4v38h-4a5 5 0 0 1-5-5z" fill="#c9622b" stroke="#3b2f25" stroke-width="2.5" stroke-linejoin="round"/></svg>';

// A place on the map: a pin with a dot, as a journal's map marks one.
const PIN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22c-.6 0-6.8-6.9-6.8-11.6a6.8 6.8 0 0 1 13.6 0C18.8 15.1 12.6 22 12 22z"/><circle cx="12" cy="10.3" r="2.6"/></svg>';

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
 *   addFinding(id, from, { again })  an animal goes in the book (saved at once); false when it was in it already. A new one's
 *                           picture (the book's pictureOf) flies from `from` ({ x, y } in screen pixels; the middle of the screen
 *                           without it) into the button, where the book nods, `newAnimal` sounds and a badge shows until the book is
 *                           opened. With `again`, an animal the book has already, found in a new place (chapter 2's frog, whose card
 *                           has a page for the Fen), flies in all the same, once while the game runs, and nothing is saved.
 *   addPlace(id, from)      a place goes on the book's map (saved at once); false when it was on it already. A new one's marker, a
 *                           small round pin in its hue (placeHue), flies from `from` ({ x, y } in screen pixels; the middle of the
 *                           screen without it) into the button, where the book nods and badges as for an animal.
 *   update(dt)              moves what moves, with game time
 *   show(on = true)         brings the button out, or puts it away; it comes out by itself with the first star or find
 *   open(tab, { nod }), close(), isOpen  the book for a scene that ends in it: open() opens it on its dinosaurs (or on `tab`, such as
 *                           'games' or 'map') as the script's, which holds nothing (book.js), so the scene goes on under it; `nod` (a card's id)
 *                           nods that card's tile once the book has grown, as chapter 2's end has Þórseðla's, new, nod on the Risaeðlur page
 *   seen(id)                the save marks `id` seen (save.addSeen, once however often it is called) and the book is refreshed;
 *                           true when it was new. The festival calls it with 'hatid' as the seventh star lifts Egill
 *   stars, findings, places the ids, in the order they came
 * Once the festival has been seen (`hatid` in the save's seen) a seventh slot follows the six: empty, in SEVENTH_SLOT's hue,
 * blinking slowly (style.css .star-slot.unknown), never earned, a hint of story 2.
 *   mapMoment               the map in the journey (engine/book/map-moment.js), which a scene plays at a departure: the whole map slides
 *                           up over the game, draws the leg ahead and slides away. The journal owns it because it has the save (the
 *                           pieces drawn are kept as seen) and the sound, and it is counted on the game clock by update(dt) below.
 *                           (map-moment.js draws the map, map-page.js, which takes its friends and hues from this file: the two
 *                           import each other, and each uses the other only when called, not as it loads.)
 * A tap on the button opens the book on its animals as the child's, which holds the game until the child shuts it. An animal found
 * since the book was last opened asks it to open on that animal's spread of the Dýrin page, where its tile nods (the newest, if
 * there were more); any opening of the book answers it.
 */
export function createJournal(doc, save, { book = null, audio = null, win = globalThis.window } = {}) {
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
  const foundAgain = new Set(); // the animals found again in a new place while the game runs (addFinding's again): each flies once
  const motions = []; // { el, age, seconds, amount }: a slot swelling, the book nodding
  const mapMoment = createMapMoment(doc, { save, audio, win });

  const slots = FRIENDS.map(friend => {
    const slot = doc.createElement('span');
    slot.className = 'star-slot';
    slot.style.setProperty('--hue', friend.colour);
    slot.innerHTML = STAR_SVG;
    return slot;
  });
  slotsEl.replaceChildren(...slots);
  const seventh = doc.createElement('span'); // after the six once the festival has been seen; never earned
  seventh.className = 'star-slot unknown';
  seventh.style.setProperty('--hue', SEVENTH_SLOT.colour);
  seventh.innerHTML = STAR_SVG;

  /** Lights the slots of the stars the save holds. */
  function render() {
    const got = new Set(save.get().stars.map(friendOf));
    FRIENDS.forEach((friend, i) => slots[i].classList.toggle('earned', got.has(friend.key)));
    const festival = (save.get().seen ?? []).includes('hatid');
    if (festival && seventh.parentNode !== slotsEl) slotsEl.append(seventh);
    if (!festival && seventh.parentNode === slotsEl) seventh.remove();
  }

  /** The save marks `id` seen, once; the slots and the book show it. */
  function seen(id) {
    needId(id, 'journal.seen');
    const fresh = save.addSeen(id);
    render();
    if (fresh) book?.refresh?.();
    return fresh;
  }

  function show(on = true) {
    button.hidden = !on;
  }

  let buttonBeckons = false;
  function beckonButton(on = true) {
    buttonBeckons = Boolean(on);
    button.classList.toggle('beckon', buttonBeckons);
  }

  /** Opening the book takes the badge off: the child has seen what is new in it. On its animals, it opens for the newest find. */
  function openBook(tab, by, { nod = null } = {}) {
    beckonButton(false);
    badgeEl.hidden = true;
    const find = newest;
    newest = null;
    book?.open(tab, by, { find, nod });
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

  function place(flight, to = arrival(flight)) {
    const e = ease(Math.min(1, flight.age / FLIGHT_SECONDS));
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
    const previous = flights.get(flight.key);
    if (previous) {
      flights.delete(flight.key);
      previous.el.remove();
      previous.handle?.finish?.();
    }
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

  function addFinding(id, from = null, { again = false } = {}) {
    needId(id, 'journal.addFinding');
    const isNew = save.addFinding(id);
    if (!isNew && (!again || foundAgain.has(id))) return false;
    if (!isNew) {
      foundAgain.add(id); // found again in a new place: it flies in, and the save has it already
      book?.foundAgain?.(id); // and its card opens on the page that place added
    }
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

  // ---- the six stars out of the book (launchStars) ----
  const launches = new Set();
  /**
   * The book swells in the middle of the screen and sends one star for each friend to `to[k]` ({ x, y } in screen pixels, in
   * FRIENDS' order), LAUNCH.gap s apart, each LAUNCH.seconds in the air; then the book goes back to the button. `onLand(k)` is
   * called as star k arrives (the scene hangs its own star on the sky there). A Handle, done when the book is back. Nothing is
   * saved and the slots are not touched: the stars are the friends' own, which the save already has (or never had).
   */
  function launchStars(to, { seconds = LAUNCH.seconds, gap = LAUNCH.gap, onLand = null } = {}) {
    if (!Array.isArray(to) || to.length !== FRIENDS.length || !to.every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y))) {
      throw new TypeError(`journal.launchStars needs ${FRIENDS.length} places, { x, y } in screen pixels, one for each friend's star`);
    }
    show();
    const screen = flightsEl.getBoundingClientRect();
    const middle = { x: screen.left + screen.width / 2, y: screen.top + screen.height / 2 };
    const book = doc.createElement('div');
    book.className = 'flying-book';
    book.innerHTML = bookIcon?.outerHTML ?? BOOK_SVG;
    flightsEl.append(book);
    const launch = {
      age: 0, seconds: Math.max(0.1, seconds), gap: Math.max(0, gap), onLand, book, middle,
      stars: to.map((place, k) => ({ k, to: { x: place.x, y: place.y }, el: null, landed: false })),
      handle: null,
    };
    launch.handle = new Handle('stars out of the book', () => endLaunch(launch));
    launches.add(launch);
    moveLaunch(launch);
    return launch.handle;
  }
  /** Where the book sits on the button now, and its scale there. */
  const bookHome = () => centreOf((bookIcon ?? button).getBoundingClientRect(), LAUNCH_BOOK_PX);
  function moveLaunch(launch) {
    const { age, middle, gap, seconds } = launch;
    const home = bookHome();
    const lastAt = LAUNCH.swell + (launch.stars.length - 1) * gap + seconds;
    // out and back: 0 at the button, 1 in the middle of the screen
    const out = age < LAUNCH.swell ? ease(age / LAUNCH.swell) : age < lastAt ? 1 : 1 - ease(Math.min(1, (age - lastAt) / LAUNCH.back));
    const x = home.x + (middle.x - home.x) * out;
    const y = home.y + (middle.y - home.y) * out;
    const scale = home.scale + (1 - home.scale) * out;
    const nod = age >= LAUNCH.swell && age < lastAt ? 1 + 0.06 * Math.sin(Math.PI * Math.min(1, ((age - LAUNCH.swell) % gap) / Math.max(0.05, gap))) : 1;
    launch.book.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) scale(${(scale * nod).toFixed(3)})`;
    for (const star of launch.stars) {
      const flown = age - (LAUNCH.swell + star.k * gap);
      if (flown < 0 || star.landed) continue;
      if (flown >= seconds - 1e-9) {
        star.landed = true;
        star.el?.remove();
        star.el = null;
        launch.onLand?.(star.k);
        continue;
      }
      if (!star.el) {
        star.el = doc.createElement('div');
        star.el.className = 'flying-star rocket';
        star.el.dataset.k = String(star.k);
        star.el.style.setProperty('--hue', FRIENDS[star.k]?.colour ?? '#f2b630');
        star.el.innerHTML = `<span class="rocket-tail"></span>${STAR_SVG}`;
        flightsEl.append(star.el);
      }
      // the journal's flight backwards: from the book up to its place, bowing on the way, turned along its way with its tail behind
      const e = ease(Math.min(1, flown / seconds));
      const { to } = star;
      const arc = Math.min(ARC_PX, 0.25 * Math.hypot(to.x - middle.x, to.y - middle.y));
      const side = to.x < middle.x ? -1 : 1;
      const px = middle.x + (to.x - middle.x) * e - side * arc * 0.35 * Math.sin(Math.PI * e);
      const py = middle.y + (to.y - middle.y) * e - arc * 0.5 * Math.sin(Math.PI * e);
      const ahead = Math.min(1, e + 0.02);
      const nx = middle.x + (to.x - middle.x) * ahead - side * arc * 0.35 * Math.sin(Math.PI * ahead);
      const ny = middle.y + (to.y - middle.y) * ahead - arc * 0.5 * Math.sin(Math.PI * ahead);
      const turn = Math.atan2(ny - py, nx - px) * 180 / Math.PI;
      const size = ROCKET_SCALE[0] + (ROCKET_SCALE[1] - ROCKET_SCALE[0]) * e;
      star.el.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -50%) scale(${size.toFixed(3)})`;
      star.el.style.setProperty('--way', `${turn.toFixed(0)}deg`);
    }
    if (age >= lastAt + LAUNCH.back - 1e-9) {
      endLaunch(launch);
      launch.handle.finish();
    }
  }
  function endLaunch(launch) {
    if (!launches.delete(launch)) return;
    for (const star of launch.stars) {
      star.el?.remove();
      if (!star.landed) { star.landed = true; launch.onLand?.(star.k); } // a cancelled launch puts every star in its place
    }
    launch.book.remove();
  }

  function update(dt) {
    if (!(dt > 0)) return; // paused or frozen
    for (const launch of [...launches]) {
      launch.age += dt;
      moveLaunch(launch);
    }
    mapMoment.update(dt);
    if (flights.size) {
      // Batch DOM rect reads before style.transform writes to avoid read/write layout thrashing across multiple flights.
      const active = [...flights.values()];
      const moving = [];
      for (const flight of active) {
        flight.age += dt;
        if (flight.age < FLIGHT_SECONDS - 1e-9) moving.push([flight, arrival(flight)]);
      }
      for (const flight of active) {
        if (flight.age >= FLIGHT_SECONDS - 1e-9) land(flight);
      }
      for (const [flight, to] of moving) place(flight, to);
    }
    if (motions.length) {
      for (let i = motions.length - 1; i >= 0; i--) {
        const motion = motions[i];
        motion.age += dt;
        const p = Math.min(1, motion.age / motion.seconds);
        motion.el.style.transform = p >= 1 ? '' : `scale(${(1 + motion.amount * Math.sin(Math.PI * p)).toFixed(3)})`;
        if (p >= 1) motions.splice(i, 1);
      }
    }
  }

  let tutorialTarget = null;
  function lockTutorial(target = null) {
    tutorialTarget = target;
    book?.lockTutorial?.(target);
  }

  button.addEventListener('click', () => {
    if (tutorialTarget !== null && tutorialTarget !== 'button') return;
    openBook('animals', buttonBeckons || tutorialTarget === 'button' ? 'script' : 'child');
  });

  render();
  badgeEl.hidden = true;
  const held = save.get();
  show(held.stars.length > 0 || held.findings.length > 0 || held.places?.length > 0);

  return {
    addStar,
    addFinding,
    addPlace,
    launchStars,
    seen,
    update,
    show,
    mapMoment,
    open: (tab = 'dinosaurs', { nod = null } = {}) => openBook(tab, 'script', { nod }),
    close: () => book?.close(),
    /** The book's close beckons the child (book.js beckonClose): a scene that opened the book and waits for them to shut it. */
    beckonClose: on => book?.beckonClose?.(on),
    /** A ribbon in the open book beckons the child (book.js beckonTab): a scene tutorial guiding them through the tabs. */
    beckonTab: tab => book?.beckonTab?.(tab),
    /** The journal button in the top-right corner beckons the child to tap it and reopen the book. */
    beckonButton,
    lockTutorial,
    handToChild: () => book?.handToChild?.(),
    playGame: (game, options) => book?.playGame?.(game, options) ?? null,
    get isOpen() { return book?.isOpen ?? false; },
    get tab() { return book?.tab ?? 'animals'; },
    get stars() { return save.get().stars; },
    get findings() { return save.get().findings; },
    get places() { return save.get().places ?? []; },
  };
}
