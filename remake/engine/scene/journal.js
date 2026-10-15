import { Handle } from '../handle.js';

// Egill's explorer's journal (STYLE.md section 10): a book in the top right corner of the screen with a
// slot for the star of each friend, and a page that opens when the child taps it, with the stars and the
// animals found along the way. A star from a friend flies into its slot (spec scene 10), and the save
// (engine/save.js) keeps what the child has earned.
//
// The motion is driven from update(dt) with game time, like everything else, so a capture finds the
// star in the same place every time and a paused game holds it in the air. main.js calls update(dt)
// before the scene's, so a flight that a script starts in one frame is counted from the next.
//
// A star id names the chapter and the friend, `k1_kambedla`: the part after the first underscore picks
// the slot, so the stars of later chapters need no change here.

export const FLIGHT_SECONDS = 1.2; // from where the star was tapped to its slot in the book
const POP_SECONDS = 0.5; // the slot swells when the star lands
const BUMP_SECONDS = 0.4; // the book nods when an animal goes in it
const FLYING_STAR_PX = 72; // the size of .flying-star in style.css
const ARC_PX = 120; // the highest a flight bows above the straight line, at most
const TOP_MARGIN_PX = 44; // and it never bows so high that the star (72 px across) leaves the screen

/** The six friends of the Star Festival, one slot each, in the main hue of each (STYLE.md section 3). */
const FRIENDS = [
  { key: 'kambedla', name: 'Kambeðla', colour: '#8f6aa3' },
  { key: 'thorsedla', name: 'Þórseðla', colour: '#e6bf55' },
  { key: 'gramedla', name: 'Grameðla', colour: '#b37955' },
  { key: 'uggedla', name: 'Uggeðla', colour: '#e06a55' },
  { key: 'sloedla', name: 'Slóeðla', colour: '#5f8fd6' },
  { key: 'flugedla', name: 'Flugeðla', colour: '#ea8db3' },
];

/** What the animals the child can find are called in the book; any other find is shown by its id. */
const ANIMALS = { butterfly: 'Fiðrildi', birds: 'Fuglar', frog: 'Froskur', snail: 'Snigill', beetle: 'Bjalla' };

const STAR_PATH = 'M12 2.4L14.88 9.04L22.08 9.72L16.66 14.51L18.23 21.58L12 17.9L5.77 21.58L7.34 14.51L1.92 9.72L9.12 9.04Z';
const STAR_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;

const friendOf = id => id.slice(id.indexOf('_') + 1);
const slotOf = id => FRIENDS.findIndex(friend => friend.key === friendOf(id));
const ease = t => t * t * (3 - 2 * t);

function needId(id, call) {
  if (typeof id !== 'string' || !id) throw new TypeError(`${call} needs the id of the star or animal, a name, not ${String(id)}`);
}

/**
 * The journal on a page that has index.html's journal elements, over a save. Returns
 *   addStar(id, from)  a star flies from `from` ({ x, y } in screen pixels) to its slot; returns a
 *                      Handle that is done when it has landed and been saved. A star already on its way
 *                      shares its flight; one the book already has flies again and is kept once.
 *                      A cancelled flight lands at once: the star was earned.
 *   addFinding(id)     an animal goes in the book; false when it was in it already
 *   update(dt)         moves what moves, with game time
 *   show(on = true)    brings the book out, or puts it away; it comes out by itself with the first find
 *   open(), close(), isOpen    the page
 *   stars, findings    the ids, in the order they came
 */
export function createJournal(doc, save) {
  const need = id => {
    const element = doc.getElementById(id);
    if (!element) throw new Error(`The journal needs #${id} on the page (see index.html)`);
    return element;
  };
  const button = need('journal-button');
  const slotsEl = need('star-slots');
  const countEl = need('finding-count');
  const flightsEl = need('journal-flights');
  const pageEl = need('journal-page');
  const closeEl = need('journal-close');
  const starsEl = need('journal-stars');
  const findsEl = need('journal-finds');
  const emptyEl = need('journal-empty');

  const flights = new Map(); // star id -> the flight in the air
  const motions = []; // { el, age, seconds, amount }: a slot swelling, the book nodding
  let isOpen = false;

  const slots = FRIENDS.map(friend => {
    const slot = doc.createElement('span');
    slot.className = 'star-slot';
    slot.style.setProperty('--hue', friend.colour);
    slot.innerHTML = STAR_SVG;
    return slot;
  });
  slotsEl.replaceChildren(...slots);

  const cards = FRIENDS.map(friend => {
    const card = doc.createElement('li');
    card.className = 'journal-star';
    card.style.setProperty('--hue', friend.colour);
    const icon = doc.createElement('span');
    icon.className = 'journal-star-icon';
    icon.innerHTML = STAR_SVG;
    const name = doc.createElement('span');
    name.className = 'journal-star-name';
    name.textContent = friend.name;
    card.append(icon, name);
    return card;
  });
  starsEl.replaceChildren(...cards);

  /** Lights what the save holds and lists the finds. */
  function render() {
    const { stars, findings } = save.get();
    const got = new Set(stars.map(friendOf));
    FRIENDS.forEach((friend, i) => {
      slots[i].classList.toggle('earned', got.has(friend.key));
      cards[i].classList.toggle('earned', got.has(friend.key));
    });
    countEl.textContent = String(findings.length);
    countEl.hidden = findings.length === 0;
    emptyEl.hidden = findings.length > 0;
    findsEl.replaceChildren(...findings.map(id => {
      const chip = doc.createElement('li');
      chip.className = 'journal-find';
      chip.textContent = ANIMALS[id] ?? id;
      return chip;
    }));
  }

  function show(on = true) {
    button.hidden = !on;
  }

  function setOpen(value) {
    isOpen = Boolean(value);
    pageEl.hidden = !isOpen;
    if (isOpen) render();
  }

  /** Swell an element and let it settle, over `seconds` of game time. */
  function swell(el, seconds, amount) {
    motions.push({ el, age: 0, seconds, amount });
  }

  /** Where a star ends up: the middle of its slot, or of the book when it has none, and how big to be there. */
  function arrival(id) {
    const rect = (slots[slotOf(id)] ?? button).getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, scale: rect.width ? rect.width / FLYING_STAR_PX : 0.4 };
  }

  function place(flight) {
    const e = ease(Math.min(1, flight.age / FLIGHT_SECONDS));
    const to = arrival(flight.id);
    const arc = Math.min(ARC_PX, 0.25 * Math.hypot(to.x - flight.from.x, to.y - flight.from.y));
    const x = flight.from.x + (to.x - flight.from.x) * e;
    const line = flight.from.y + (to.y - flight.from.y) * e;
    const y = Math.max(Math.min(line, TOP_MARGIN_PX), line - arc * Math.sin(Math.PI * e)); // the bow stays on the screen
    const scale = 1.1 + (to.scale - 1.1) * e;
    flight.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%) rotate(${(e * 360).toFixed(0)}deg) scale(${scale.toFixed(3)})`;
  }

  function land(flight) {
    if (flights.get(flight.id) !== flight) return; // it has landed
    flights.delete(flight.id);
    flight.el.remove();
    save.addStar(flight.id);
    render();
    if (slotOf(flight.id) >= 0) swell(slots[slotOf(flight.id)], POP_SECONDS, 0.7);
    flight.handle.finish();
  }

  function addStar(id, from) {
    needId(id, 'journal.addStar');
    if (!Number.isFinite(from?.x) || !Number.isFinite(from?.y)) {
      throw new TypeError('journal.addStar needs where the star starts: { x, y } in screen pixels');
    }
    const flying = flights.get(id);
    if (flying) return flying.handle;
    show();
    const flight = { id, age: 0, from: { x: from.x, y: from.y }, el: doc.createElement('div'), handle: null };
    flight.el.className = 'flying-star';
    flight.el.innerHTML = STAR_SVG;
    flight.handle = new Handle('star', () => land(flight));
    flights.set(id, flight);
    flightsEl.append(flight.el);
    place(flight);
    return flight.handle;
  }

  function addFinding(id) {
    needId(id, 'journal.addFinding');
    const isNew = save.addFinding(id);
    if (isNew) {
      render();
      show();
      swell(button, BUMP_SECONDS, 0.15);
    }
    return isNew;
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

  button.addEventListener('click', () => setOpen(true));
  closeEl.addEventListener('click', () => setOpen(false));
  pageEl.addEventListener('click', event => {
    if (event.target === pageEl) setOpen(false); // the dimmed edge around the card
  });

  render();
  pageEl.hidden = true;
  const held = save.get();
  show(held.stars.length > 0 || held.findings.length > 0);

  return {
    addStar,
    addFinding,
    update,
    show,
    open: () => setOpen(true),
    close: () => setOpen(false),
    get isOpen() { return isOpen; },
    get stars() { return save.get().stars; },
    get findings() { return save.get().findings; },
  };
}
