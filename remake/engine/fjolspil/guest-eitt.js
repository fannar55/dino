// The guest's screen of "Eitt!" on her phone or tablet (spec §7.3, §6.3 and §8). Eitt! has no shared screen (the owner's decision
// of 24 October, spec §7.3): nobody needs to look at anyone else's screen. Egill's screen is the big screen's own table with his
// hand, and every other device shows the whole game, with its own hand:
//   at the top     the others' hands face down, a fan for each other seat in the order the turn goes after hers, with its
//                  picture, its name and how many cards it holds (.spil-eitt-counts of .spil-eitt-seat; .turn on the one whose
//                  turn it is, .won on the winner)
//   in the middle  the table: the deck (.spil-eitt-deck, the table's .eitt-deck: a tap draws, and it calls, while the view says
//                  she may) and the card on top inside the ring of the colour in play (.spil-eitt-pile, the table's .eitt-ring),
//                  with "Áfram" (.spil-eitt-pass) after a card drawn that goes, "Eitt!" (.spil-eitt-eitt) while she owes it and
//                  "Grípa!" (.spil-eitt-catch) while another seat forgot hers, beside it (.spil-eitt-actions)
//   at the bottom  her own hand in an arc (.spil-eitt-hand), the table's cards (table.js's cardElement and eitt.css) in the
//                  order the table lays Egill's in, each showing at least 88 px across (a hand too big for one row lies in
//                  rows, as on the table), what may be played lifted (.playable)
// and whose turn it is over them all (.spil-eitt-turn: "Þú átt leik!", "Anna á leik"; at the end "{name} vann!").
//
// A tap on a card that may be played sends act { type: 'play', cardId }; a wild that is not her last card first brings up the
// four colours (.spil-eitt-colours, the table's .eitt-colours) and goes with the one picked. A card that may not go wiggles, and
// so does the deck while she may not draw. The big screen decides everything (its rules, its random): an act waits for the next
// view, so a second tap before it sends nothing, and an act it refuses comes back as a fresh view.
//
// The cards fly on the device as on the table, with transform and opacity only (a fade under reduced motion): when the card on
// top changes, the new one flies onto the pile from the fan of whoever played it (view.lastPlay.seat), or from her own hand; a
// card drawn flies from the deck into her hand, the cards of a +2, a +4 or a catch one after another, and a new round is dealt
// into it. The device plays Eitt!'s own effects (eitt-sounds.js through game-music.js's createGameSfx, tuned to the game's music
// as the table's are), on the guest page's audio context, which her first tap wakes: the flick of a card landing on the pile, the
// draw, the wiggle, the horn of her "Eitt!" or her catch, the pop of a +2 or a +4 as it lands and of each card one (or a catch)
// gives her, the sparkle of a colour chosen and the fanfare of her win (the horn of another's). The others' draws sound on their
// own devices. Never a voice and never the music: those are Egill's screen's (spec §7.3, §13).
//
// renderEitt(root, view, { send, doc, audio }) is guest.js's game screen for 'eitt': `root` is the page's .spil-game, the same one
// while eitt views follow one another, so the screen is built in it once and updated after; send(act) sends act { … } to the big
// screen, and audio.effects(options) gives the page's own effects for these sounds (guest.js). Names are text, never markup. The
// look is spil.css's "Eitt!" part over eitt.css's cards.

import { cardElement, sortHand } from '../eitt/table.js';
import { COLOURS, isWild } from '../eitt/rules.js';
import { eittSounds, EITT_GAPS } from '../eitt/eitt-sounds.js';
import { avatarOf } from './seats.js';
import { pressable, reducedMotion, sparkle } from '../book/fx.js';

/** Everything the screen says. */
const WORDS = {
  mine: 'Þú átt leik!',
  theirs: name => `${name} á leik`,
  won: name => `${name} vann!`,
  pass: 'Áfram',
  eitt: 'Eitt!',
  catch: 'Grípa!',
  draw: 'Draga spil',
  hand: 'Spilin þín',
  others: 'Hin',
  cards: (name, n) => `${name} á ${n} spil`,
};
const COLOUR_NAME = { red: 'Rautt', yellow: 'Gult', green: 'Grænt', blue: 'Blátt' };

const REMAKE = new URL('../../', import.meta.url);
const asset = path => new URL(path, REMAKE).href;
/** The device's effects: the table's, tuned to the key of the game's music (its music.json; the music itself never plays here). */
const EFFECTS = { music: asset('assets/audio/eitt/music.mp3'), sounds: eittSounds, gaps: EITT_GAPS };

const TAP_PX = 88; // the least a card of the hand shows across (STYLE.md): a hand that would show less lies in rows
const FLY_MS = 430; // a card onto the pile, as on the table
const DRAW_MS = 400; // a card from the deck into the hand
const DEAL_MS = 360;
const DEAL_GAP = 105; // between two cards dealt
const GIVE_GAP = 170; // and between the cards of a +2, a +4 or a catch
const GLIDE_MS = 320; // the hand closing up or making room
const FAN_MAX = 8; // the backs a seat's fan shows at most; its number says how many there are
const PILE_KEEP = 3; // the cards the pile shows, the top one last

const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h13M12 5.5l6.5 6.5L12 18.5" fill="none" stroke="#3b2f25" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12h13M12 5.5l6.5 6.5L12 18.5" fill="none" stroke="#fffaf0" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Each .spil-game this screen has been built in, and its parts. */
const built = new WeakMap();
/** The screen shown last (a page shows one at a time), and the windows that already lay its hand out again when resized. */
let shown = null;
const resizing = new WeakSet();

/** The screen of `view` in `root`: built the first time, updated after. */
export function renderEitt(root, view, { send, doc = root.ownerDocument, audio = null } = {}) {
  const at = built.get(root) ?? build(root, doc);
  at.send = send;
  at.audio = audio;
  shown = at;
  update(at, view && typeof view === 'object' ? view : {});
}

function build(root, doc) {
  const make = (tag, className, html = '') => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (tag === 'button') el.type = 'button';
    if (html) el.innerHTML = html;
    return el;
  };

  const screen = make('div', 'spil-eitt');
  const turnEl = make('h2', 'spil-eitt-turn');
  turnEl.setAttribute('aria-live', 'polite');
  const countsEl = make('ul', 'spil-eitt-counts');
  countsEl.setAttribute('aria-label', WORDS.others);
  const tableEl = make('div', 'spil-eitt-table');
  const deckEl = make('button', 'eitt-deck spil-eitt-deck', '<span class="eitt-card back"></span>');
  deckEl.setAttribute('aria-label', WORDS.draw);
  const pileEl = make('div', 'spil-eitt-pile');
  const ringEl = make('div', 'eitt-ring');
  ringEl.hidden = true;
  pileEl.append(ringEl);
  const actionsEl = make('div', 'spil-eitt-actions');
  const passEl = make('button', 'eitt-pass spil-eitt-pass', `<span>${WORDS.pass}</span>${ARROW}`);
  const eittEl = make('button', 'eitt-eitt needed spil-eitt-eitt', `<span>${WORDS.eitt}</span>`);
  const catchEl = make('button', 'eitt-eitt needed spil-eitt-catch', `<span>${WORDS.catch}</span>`);
  passEl.hidden = true;
  eittEl.hidden = true;
  catchEl.hidden = true;
  actionsEl.append(passEl, eittEl, catchEl);
  const coloursEl = make('div', 'eitt-colours spil-eitt-colours');
  coloursEl.hidden = true;
  const colourEls = COLOURS.map(colour => {
    const button = make('button', colour);
    button.dataset.colour = colour;
    button.setAttribute('aria-label', COLOUR_NAME[colour]);
    coloursEl.append(button);
    return button;
  });
  tableEl.append(deckEl, pileEl, actionsEl, coloursEl);
  const handEl = make('div', 'spil-eitt-hand');
  handEl.setAttribute('aria-label', WORDS.hand);
  screen.append(turnEl, countsEl, tableEl, handEl);
  root.replaceChildren(screen);

  const at = {
    doc, win: doc.defaultView ?? undefined, make,
    screen, turnEl, countsEl, deckEl, pileEl, ringEl, coloursEl, passEl, eittEl, catchEl, handEl,
    send: null, audio: null,
    view: null, // the view shown
    sent: false, // an act is on its way to the big screen: nothing more until the next view
    choosing: null, // the wild whose colour is being picked
    cards: new Map(), // card id -> its button in the hand
    seats: new Map(), // seat -> its fan at the top
    topId: null, // the card on top of the pile
  };
  press(at, deckEl, () => tapDeck(at));
  press(at, passEl, () => act(at, { type: 'pass' }), 'tap');
  press(at, eittEl, () => { if (act(at, { type: 'eitt' })) play(at, 'horn'); });
  press(at, catchEl, () => { if (act(at, { type: 'catch' })) play(at, 'horn'); });
  for (const button of colourEls) press(at, button, () => chooseColour(at, button.dataset.colour));
  if (at.win && !resizing.has(at.win)) { // one listener for the page, whichever screen is on it (a new root after every wait)
    resizing.add(at.win);
    at.win.addEventListener?.('resize', () => { if (shown?.view && shown.screen.isConnected) layHand(shown); });
  }
  built.set(root, at);
  return at;
}

// ---- Touch and sound ------------------------------------------------------------------------------------------------

/**
 * A control of the game: a tap through the book's pressable (its squash and its sparks; `sound` one of the game's own effects,
 * none where the act has its own), and Enter or Space on it when it has the focus.
 */
function press(at, el, onTap, sound = null) {
  pressable(el, { audio: { sfx: name => play(at, name) }, sound, win: at.win, onTap: event => { if (!el.disabled) onTap(event); } });
  el.addEventListener('click', event => {
    if (event.detail !== 0 || el.disabled) return; // a pointer's click is pressable's already
    if (sound) play(at, sound);
    onTap(event);
  });
}

/** One of the game's effects on this device: skipped until the first touch wakes the page's audio (guest.js), never in the way. */
function play(at, name) {
  try {
    at.audio?.effects?.(EFFECTS)?.play(name);
  } catch {
    // no sound here
  }
}

/** An act to the big screen, one for each view: what came of it is the next view. False when one is on its way already. */
function act(at, body) {
  if (at.sent || !at.view) return false;
  at.sent = true;
  at.deckEl.classList.remove('draw');
  at.send?.(body);
  return true;
}

const playableIds = view => new Set(Array.isArray(view?.playable) ? view.playable : []);

function tapCard(at, id) {
  const view = at.view;
  const card = view?.hand?.find?.(held => held?.id === id);
  const el = at.cards.get(id);
  if (!card || !el || at.sent) return;
  if (at.choosing) { // another card, or the same again, puts the colours away
    const same = at.choosing === id;
    at.choosing = null;
    showColours(at);
    if (same) return;
  }
  if (!playableIds(view).has(id)) {
    nope(at, el);
    return;
  }
  if (isWild(card) && view.hand.length > 1) { // the colour first (a wild as the last card wins at once, with none)
    at.choosing = id;
    showColours(at);
    return;
  }
  if (act(at, { type: 'play', cardId: id })) el.classList.add('going');
}

function chooseColour(at, colour) {
  const cardId = at.choosing;
  if (!cardId || at.sent || !COLOURS.includes(colour)) return;
  at.choosing = null;
  showColours(at);
  play(at, 'sparkle');
  if (act(at, { type: 'play', cardId, colour })) at.cards.get(cardId)?.classList.add('going');
}

function tapDeck(at) {
  if (!at.view || at.sent) return;
  if (at.view.canDraw !== true) {
    nope(at, at.deckEl);
    return;
  }
  act(at, { type: 'draw' });
}

/** The colour buttons while a wild waits for its colour, and the wild marked. */
function showColours(at) {
  at.coloursEl.hidden = !at.choosing;
  for (const [id, el] of at.cards) el.classList.toggle('picked', at.choosing === id);
}

/** A wiggle: no. */
function nope(at, el) {
  play(at, 'wiggle');
  if (typeof el.animate !== 'function') return;
  el.animate(reducedMotion(at.win)
    ? [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }]
    : ['0', '-7', '6', '-4', '2', '0'].map(deg => ({ transform: `rotate(${deg}deg)` })), { duration: 480, easing: 'ease-in-out' });
}

// ---- The view -------------------------------------------------------------------------------------------------------

const isSeat = value => Number.isInteger(value);

function update(at, view) {
  const prev = at.view;
  at.view = view;
  at.sent = false;
  const counts = Array.isArray(view.counts) ? view.counts.filter(entry => isSeat(entry?.seat)) : [];
  const nameOf = seat => String(counts.find(entry => entry.seat === seat)?.name ?? '');
  const over = isSeat(view.winner);
  const lastPlay = view.lastPlay && isSeat(view.lastPlay.seat) ? view.lastPlay : null;
  // A new round being dealt: nothing played on it yet, after the end of the last one (or as this screen first opens).
  const fresh = !over && lastPlay === null && (!prev || isSeat(prev.winner));
  // Where the cards, the fans and the deck were, for the flights (as this screen first opens: the deck, for a deal).
  const before = prev ? where(at) : fresh ? { hand: new Map(), fans: new Map(), deck: rectOf(at.deckEl.firstElementChild ?? at.deckEl) } : null;

  at.turnEl.textContent = over ? WORDS.won(nameOf(view.winner)) : view.turn === view.you ? WORDS.mine : WORDS.theirs(nameOf(view.turn));
  at.turnEl.classList.toggle('mine', !over && view.turn === view.you);
  at.turnEl.classList.toggle('won', over);

  renderSeats(at, view, counts, over);
  const cards = handOf(view);
  renderPile(at, view, lastPlay, before, fresh ? cards.length : 0);
  renderHand(at, cards, before, fresh);

  at.deckEl.classList.toggle('draw', view.canDraw === true);
  at.passEl.hidden = over || view.canPass !== true;
  at.eittEl.hidden = over || view.eittNeeded !== true;
  at.catchEl.hidden = over || !isSeat(view.canCatch);
  if (at.choosing && (over || !playableIds(view).has(at.choosing))) at.choosing = null; // the wild no longer goes
  showColours(at);
  if (over && !(prev && isSeat(prev.winner))) play(at, view.winner === view.you ? 'fanfare' : 'horn');
}

/** The view's hand, the cards it can show, in the table's order. */
const handOf = view => sortHand(Array.isArray(view.hand) ? view.hand.filter(card => typeof card?.id === 'string') : []);

function rectOf(el) {
  if (!el || el.isConnected === false || typeof el.getBoundingClientRect !== 'function') return null;
  const box = el.getBoundingClientRect();
  return box.width ? box : null;
}

function where(at) {
  return {
    hand: new Map([...at.cards].map(([id, el]) => [id, rectOf(el)])),
    fans: new Map([...at.seats].map(([seat, fan]) => [seat, rectOf(fan.fan.lastElementChild ?? fan.fan)])),
    deck: rectOf(at.deckEl.firstElementChild ?? at.deckEl),
  };
}

// ---- The others, at the top ----------------------------------------------------------------------------------------

function renderSeats(at, view, counts, over) {
  const n = counts.length;
  const after = seat => (((seat - view.you) % n) + n) % n; // the turn's order after hers
  const others = counts.filter(entry => entry.seat !== view.you).sort((a, b) => after(a.seat) - after(b.seat));
  for (const [seat, fan] of at.seats) {
    if (others.some(entry => entry.seat === seat)) continue;
    fan.li.remove();
    at.seats.delete(seat);
  }
  const rows = others.map(entry => {
    let fan = at.seats.get(entry.seat);
    if (!fan) at.seats.set(entry.seat, (fan = makeSeat(at, entry.seat)));
    const name = String(entry.name ?? '');
    const cards = Number.isInteger(entry.cards) && entry.cards > 0 ? entry.cards : 0;
    setFace(fan, entry.avatar);
    fan.name.textContent = name;
    fan.count.textContent = String(cards);
    setBacks(at, fan, cards);
    fan.li.setAttribute('aria-label', WORDS.cards(name, cards));
    fan.li.style.setProperty('--c', avatarOf(entry.avatar)?.colour ?? 'transparent');
    fan.li.classList.toggle('turn', !over && view.turn === entry.seat);
    fan.li.classList.toggle('won', over && view.winner === entry.seat);
    return fan.li;
  });
  const now = [...at.countsEl.children];
  if (now.length !== rows.length || rows.some((li, k) => now[k] !== li)) at.countsEl.replaceChildren(...rows);
}

function makeSeat(at, seat) {
  const li = at.make('li', 'spil-eitt-seat');
  li.dataset.seat = String(seat);
  const fan = at.make('span', 'spil-eitt-fan');
  fan.setAttribute('aria-hidden', 'true');
  const face = at.make('span', 'spil-face spil-eitt-face');
  const picture = at.make('img', 'spil-picture');
  picture.alt = '';
  face.append(picture);
  const name = at.make('span', 'spil-eitt-name');
  const count = at.make('span', 'spil-eitt-count');
  count.setAttribute('aria-hidden', 'true');
  li.append(fan, face, name, count);
  return { li, fan, face, picture, name, count };
}

function setFace({ face, picture }, id) {
  const avatar = avatarOf(id);
  const src = avatar ? asset(avatar.picture) : null;
  if (src && picture.src !== src) picture.src = src; // never an empty src, which a browser would read as the page
  picture.hidden = !avatar;
  face.style.setProperty('--c', avatar?.colour ?? 'transparent');
}

/** A seat's fan: so many backs (FAN_MAX at most), fanned. */
function setBacks(at, fan, cards) {
  const want = Math.min(cards, FAN_MAX);
  while (fan.fan.children.length > want) fan.fan.children[fan.fan.children.length - 1].remove();
  while (fan.fan.children.length < want) fan.fan.append(cardElement(at.doc, null, 'span'));
  [...fan.fan.children].forEach((back, k) => back.style.setProperty('--i', ((k - (want - 1) / 2)).toFixed(2)));
  fan.fan.style.setProperty('--n', String(want));
}

// ---- The table: the deck and the pile -------------------------------------------------------------------------------

/** How a card lies on the pile: askew by its own id, the same way every time. */
function tiltOf(id) {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const unit = shift => ((h >>> shift) % 1000) / 500 - 1;
  return { r: unit(0) * 10, x: unit(10) * 4, y: unit(20) * 3 };
}

/**
 * The card on top inside the ring of the colour in play. A new one flies in from whoever played it (`lastPlay`: her own hand,
 * or that seat's fan), or from the deck as a round begins (after the `dealt` cards of the deal).
 */
function renderPile(at, view, lastPlay, before, dealt) {
  const top = typeof view.top?.id === 'string' ? view.top : null;
  at.ringEl.hidden = !top;
  at.ringEl.className = COLOURS.includes(view.colour) ? `eitt-ring ${view.colour}` : 'eitt-ring';
  const old = [...at.pileEl.children].filter(el => el !== at.ringEl);
  if (!top) {
    for (const el of old) el.remove();
    at.topId = null;
    return;
  }
  if (top.id === at.topId) return;
  at.topId = top.id;
  if (dealt) for (const el of old) el.remove(); // a new round: the last one's cards are gone
  const el = cardElement(at.doc, top);
  const tilt = tiltOf(top.id);
  el.style.setProperty('--r', `${tilt.r.toFixed(1)}deg`);
  el.style.setProperty('--x', `${tilt.x.toFixed(1)}%`);
  el.style.setProperty('--y', `${tilt.y.toFixed(1)}%`);
  at.pileEl.append(el);
  const shown = [...at.pileEl.children].filter(child => child !== at.ringEl);
  for (const gone of shown.slice(0, Math.max(0, shown.length - PILE_KEEP))) gone.remove();
  if (!before) return; // the screen as it opens on a round under way: the table as it stands
  const from = lastPlay === null ? before.deck : lastPlay.seat === view.you ? before.hand.get(lastPlay.cardId) : before.fans.get(lastPlay.seat);
  fly(at, el, from ?? before.deck, { duration: FLY_MS, delay: dealt ? dealt * DEAL_GAP + DEAL_MS : 0 }).then(() => {
    play(at, 'flick');
    sparkle(at.pileEl, 6, at.win);
    if (top.kind === 'draw2' || top.kind === 'wild4') play(at, 'pop'); // the next one draws
    if (isWild(top) && lastPlay !== null && lastPlay.seat !== view.you) play(at, 'sparkle'); // hers sparkled as she chose it
  });
}

// ---- Her hand ---------------------------------------------------------------------------------------------------------

function renderHand(at, cards, before, fresh) {
  const ids = new Set(cards.map(card => card.id));
  for (const [id, el] of at.cards) {
    if (ids.has(id)) continue;
    el.remove();
    at.cards.delete(id);
  }
  const added = [];
  for (const card of cards) {
    if (at.cards.has(card.id)) continue;
    const el = cardElement(at.doc, card, 'button');
    press(at, el, () => tapCard(at, card.id));
    at.cards.set(card.id, el);
    added.push(el);
  }
  const wanted = cards.map(card => at.cards.get(card.id));
  const now = [...at.handEl.children];
  if (now.length !== wanted.length || wanted.some((el, k) => now[k] !== el)) at.handEl.replaceChildren(...wanted);
  const goes = playableIds(at.view);
  for (const [id, el] of at.cards) {
    el.classList.toggle('playable', goes.has(id));
    el.classList.remove('going');
  }
  layHand(at);
  if (!before) return;
  glide(at, before.hand);
  if (!added.length) return;
  // In from the deck: the deal one after another, a card drawn by itself, and a +2's, a +4's or a catch's cards each with a pop.
  const one = !fresh && added.length === 1;
  if (one) play(at, 'draw');
  added.forEach((el, k) => {
    fly(at, el, before.deck, { duration: fresh ? DEAL_MS : DRAW_MS, delay: k * (fresh ? DEAL_GAP : GIVE_GAP) })
      .then(() => play(at, fresh || one ? 'deal' : 'pop'));
  });
}

/**
 * The hand in an arc, centred: each card at least TAP_PX across where it shows, so a hand too big for one row lies in two or
 * more, the first cards at the back and each row centred under the one before (as the table's big hands do). The cards' places
 * are --x, --y and --r (spil.css), and the hand's height --hand-h.
 */
function layHand(at) {
  const els = [...at.handEl.children];
  const width = at.handEl.clientWidth || 340;
  const w = els[0]?.offsetWidth || TAP_PX;
  const h = (w * 7) / 5;
  const lift = h * 0.2; // room over the cards for the ones lifted
  const count = els.length;
  const perRow = Math.max(1, Math.floor((width - w) / TAP_PX) + 1);
  const rows = Math.max(1, Math.ceil(count / perRow));
  const per = Math.max(1, Math.ceil(count / rows));
  const rowStep = h * (rows > 2 ? 0.46 : 0.58);
  const bow = rows > 1 ? 1 : 2.2; // how far the outer cards dip, in px for each step from the middle, squared
  els.forEach((el, k) => {
    const row = Math.floor(k / per);
    const inRow = Math.min(per, count - row * per);
    const i = (k % per) - (inRow - 1) / 2;
    const step = inRow > 1 ? Math.min(Math.max(TAP_PX, w * 0.9), (width - w) / (inRow - 1)) : 0;
    el.style.setProperty('--x', `${(width / 2 - w / 2 + i * step).toFixed(1)}px`);
    el.style.setProperty('--y', `${(lift + row * rowStep + i * i * bow).toFixed(1)}px`);
    el.style.setProperty('--r', `${(i * (rows > 1 ? 1.2 : 2.6)).toFixed(2)}deg`);
  });
  const dip = ((per - 1) / 2) ** 2 * bow;
  at.handEl.style.setProperty('--hand-h', `${Math.ceil(lift + (rows - 1) * rowStep + h + dip + 10)}px`);
}

/** The cards that stayed move from where they were to their new places, so the hand closes up and makes room smoothly. */
function glide(at, old) {
  if (reducedMotion(at.win)) return;
  for (const [id, el] of at.cards) {
    const was = old.get(id);
    const now = was && typeof el.animate === 'function' ? rectOf(el) : null;
    if (!now) continue;
    const dx = was.left + was.width / 2 - (now.left + now.width / 2);
    const dy = was.top + was.height / 2 - (now.top + now.height / 2);
    if (Math.hypot(dx, dy) > 1) el.animate([{ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` }, { transform: 'none' }], { duration: GLIDE_MS, easing: 'cubic-bezier(.3, .7, .4, 1)' });
  }
}

/**
 * `el` flies to where it is from `from` (a rect) in an arc, growing to its size on the way, after `delay`: transform only, and
 * a fade where it is under reduced motion. Resolves when it has landed (at once where nothing can move).
 */
function fly(at, el, from, { duration = FLY_MS, delay = 0 } = {}) {
  const to = rectOf(el);
  if (!to || !from || typeof el.animate !== 'function') return Promise.resolve();
  const timing = { duration, delay, easing: 'cubic-bezier(.3, .6, .35, 1)', fill: 'backwards' };
  if (reducedMotion(at.win)) return el.animate([{ opacity: 0 }, { opacity: 1 }], { ...timing, duration: 200 }).finished.catch(() => {});
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const s = Math.min(3, Math.max(0.2, from.width / to.width));
  const lift = Math.min(90, Math.hypot(dx, dy) * 0.2);
  const at3 = n => n.toFixed(3);
  return el.animate([
    { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${at3(s)})` },
    { transform: `translate(${(dx / 2).toFixed(1)}px, ${(dy / 2 - lift).toFixed(1)}px) scale(${at3(((s + 1) / 2) * 1.08)})`, offset: 0.5 },
    { transform: 'none' },
  ], timing).finished.catch(() => {});
}
