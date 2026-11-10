// A round of "Veiddu" in "Fjölspil" on the big screen (spec section 11; Task 9). In Go Fish a hand must be hidden, so every human seat, Egill's
// too, plays from a device of its own (engine/fjolspil/guest-veiddu.js; the owner's answer of 2026-11-01), and the big screen shows no hand at
// all: only the pond in the middle, every seat's place round it (its tag with the picture and name, its cards face down and how many, its
// catch of pairs), what is said in bubbles, and Uggeðla's live window when she plays. It decides everything: the rules, the random numbers,
// what each seat is shown (engine/veiddu/remote.js), and it waits for each guest's act. table.js makes this from its page's host session and
// opens it from the setup card (it keeps the music, the effects, the voices, the splash and Uggeðla's view, and hands them in).
//
//   - The seats are the lobby's (fjolspil.seats), Egill's first: his phone is bound to seat 0 (seats.bindHost). Each seat is played by its
//     phone (a guest who is there, not covered), or by the computer: Uggeðla where the lobby added her (her window shows, her voice speaks,
//     she plays at the skill the save keeps), or a seat whose guest has gone and was covered by "Halda áfram án …" (a mild mind, in bubbles
//     only, as Eitt! covers a seat). A turn that comes to a guest who is away waits for her over the table (the lobby's waiting card, the
//     QR code, then "Halda áfram án …": fjolspil.waitFor); so does a question for her.
//   - A turn: the seat on turn asks (a phone's act, or a mind after it thinks), the question is in a bubble by its asker with an arrow at
//     the one asked, and every phone hears it; the one asked answers (a tap on the card on her phone, or "Farðu að veiða!", or a mind at once),
//     the answer is in a bubble and the card flies; a no sends the asker fishing (the pond calls; her phone's tap, or a mind) and the water
//     splashes. A pair snaps together and flies to its catch. The act is checked (remote.js actOf) before the rules see it; one that is not
//     allowed changes nothing and the phone is sent its view again.
//   - Every phone is sent its view when something changes, with only her own hand in it; the game is kept in the save after every act (with
//     its seats, Egill's phone included), and "Halda áfram" takes it up.
//   - The end: the winners in words, confetti where a human won, Uggeðla's sticker for Egill if he won or tied with her at the table (the
//     solo round's rule: wins and the minds' skill follow only a round Egill or she won), and "Spilum aftur?" for the same seats.
// No hand, no Mosi, no tutorial here: those are the table of one device's. The look is veiddu.css's "Fjölspil" part.

import { KINDS, kindOf, makeDeck } from './cards.js';
import { newGame, ask, fish, holds, legalTargets } from './rules.js';
import { SEAT, createMind, VEIDDU_SKILL_START } from './minds.js';
import { nameLine, askLine, answerLine, EMPTY_LINE, endLine } from './speech.js';
import { cardElement, layoutHand, catchElement, layTheirs, make, pondCard, winElement, POND_SHOWN } from './look.js';
import { COVER_SKILL, actOf, afterRoundSave, childWon, keptGameOf, publicEvent, viewFor, winnersWords } from './remote.js';
import { avatarOf } from '../fjolspil/seats.js';
import { pressable, sparkle } from '../book/fx.js';

const REMAKE = new URL('../../', import.meta.url);
const asset = path => new URL(path, REMAKE).href;
const ORDER = KINDS.map(kind => kind.id);
const cardOf = id => ({ id, kind: kindOf(id) });
const byKind = (a, b) => ORDER.indexOf(a.dataset.kind) - ORDER.indexOf(b.dataset.kind) || a.dataset.id.localeCompare(b.dataset.id);

const THINK_MS = 1200; // a mind thinks this long before it asks
const FISH_BEAT_MS = 500; // and this long before it fishes after a no
const ANSWER_BEAT_MS = 700; // a mind answers this long after it is asked (the question is read first)
const DEAL_MS = 330; // a card dealt flies this long
const DEAL_GAP = 80; // ms between two cards dealt
const FLY_MS = 430; // a card given or fished flies this long
const GATHER_MS = 420; // the two cards of a pair come together this long,
const SNAP_MS = 260; // hold, sparkling,
const CATCH_MS = 480; // and fly to the catch this long
const VOICE_TAIL_MS = 400; // a bubble stays this long after its recording ends, if the text's own time has run out
const FAN_MAX = 9; // the backs a seat's cards show at most; its number says how many there are
const SLOTS = { 2: ['l', 'r'], 3: ['bl', 'tl', 'tr'], 4: ['bl', 'tl', 'tr', 'br'] }; // where each seat sits round the pond, by how many play

/** "Fjölspil": the game's own character for the lobby (Uggeðla), the words the lobby shows for her. */
export const AI = { name: 'Uggeðla', avatar: 'uggedla', add: 'Bæta við Uggeðlu', remove: 'Taka Uggeðlu út' };

const STALE = Symbol('stale'); // thrown into a flow whose round was dropped (the game shut, a new deal): it just stops
const AWAY = Symbol('away'); // thrown into a wait for a phone that has gone

const POINTER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h9V3.5L22 12l-10 8.5V16H3z" fill="#f2b630" stroke="#3b2f25" stroke-width="2.4" stroke-linejoin="round"/></svg>';

/**
 * The Fjölspil round in `root` (the .veiddu element). `fjolspil` is the page's host session, `save` the save (getVeiddu and setVeiddu keep the
 * round with its seats, the wins and the minds' skill). `uggedla` is her window ({ windowEl, frameEl, home } the elements that move in beside
 * her place and back, view() her live view or null, start() and stop() to run it), `sound` { sfx, splashes, say, speech, clock, lineMs } what the
 * table already has, `words` its texts ({ SAY, asking }), `onShow()` and `onHide()` for the table of one device to give way and come back, and
 * `onQuit()` the X. `kinds` (all thirteen) is for a short round in the lab (veiddu-lab.html?kinds=7): the deck of that many kinds, so a whole
 * round, for a video or a check, takes a few minutes (a round so short is not kept in the save). Returns
 *   show(list, kept)  a round for these seats (fjolspil.seats.list(), Egill's first), dealt, or the kept game (the rules' data); false when
 *                     there is nobody to play with
 *   openLobby()       "Fjölspil": the lobby for Veiddu (Egill's phone first), and at "Byrjum!" a round of its seats; false at its X
 *   resume()          "Halda áfram": the round kept in the save, with its seats
 *   saved()           the kept round { game, seats }, or null
 *   leave({ close })  the round is dropped (the game shut): the phones wait for the next lobby when `close`
 *   isOn, game, phase what a probe asks: whether a round is on, the rules' game, and what the table waits for ('shut', 'busy', 'over', or
 *                     '<seat> <ask|fish|give|no>' while it waits for that seat's phone, 'away <seat>' while it waits for a phone that is gone)
 */
export function createVeidduMulti(doc, { root, fjolspil, save, win, random = Math.random, calm = () => false, kinds = KINDS.length, uggedla, sound, words, onShow = () => {}, onHide = () => {}, onQuit = () => {} }) {
  const { sfx, splashes, say, speech, clock, lineMs } = sound;
  const el = (tag, className, attributes, html) => make(doc, tag, className, attributes, html);

  // ---- The page -------------------------------------------------------------------------------------------------------------

  const multiEl = el('div', 'veiddu-multi');
  multiEl.hidden = true;
  const pondEl = el('div', 'veiddu-pond', { role: 'img', 'aria-label': 'Tjörnin' });
  for (let k = 0; k < 3; k++) pondEl.append(el('i', 'veiddu-ripple', { style: `--d:${(-k * 2.2).toFixed(1)}s` }));
  const handEl = el('div', 'veiddu-hand', { role: 'group', 'aria-label': 'Spilin þín' });
  const quitEl = el('button', 'veiddu-close veiddu-quit', { 'aria-label': 'Hætta' }, '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" fill="none" stroke="#3b2f25" stroke-width="4" stroke-linecap="round"/></svg>');
  const winEl = winElement(doc);
  winEl.hidden = true;
  const winCard = winEl.querySelector('.veiddu-win-card');
  multiEl.append(pondEl, handEl, quitEl);
  root.append(multiEl, winEl);

  // ---- State ----------------------------------------------------------------------------------------------------------------

  let on = false;
  let game = null; // the rules' game as it stands (the phones are sent this)
  let phoneGame = null; // and the game they are shown: the one before the act that ends the round, until the big screen has shown it
  let round = 0; // counts rounds; a flow that finds it changed (a new deal, the game shut) stops
  let ended = false; // the win card shows
  let busy = true;
  let n = 0; // seats at this table
  let uggedlaSeat = null; // the seat the game's own Uggeðla plays, or null
  let dealt = 0;
  let minds = [];
  let awaiting = null; // what the table waits for from a phone or the big screen: { seat, need, kind, resolve, reject }
  let waitingFor = null; // the seat whose gone phone the table waits for over the board
  let pending = null; // a question asked and not yet answered: { from, to, kind }
  let lastEvent = null; // the last public thing, for the phones' line
  let places = []; // each seat's place: { el, tag, face, name, fan, count, catchEl, window }
  let shownCount = []; // cards each seat shows
  let shownPairs = []; // the kinds in each catch as the table shows them
  let pondShown = [];
  let pondCount = 0;
  let bubbleEl = null;
  let bubbleUntil = 0;
  let seatsOff = null;
  let flying = 0;
  let picked = null; // the kind Egill lifted on the big screen
  let fishButton = null; // "Farðu að veiða!" button when Egill is asked for a kind he lacks on the big screen
  const handEls = new Map(); // card id -> button in handEl
  const outSeen = new Set();
  const timers = new Set();
  const refused = []; // the last acts the table did not take, { seat, act, waitingFor }: for a probe

  const seatList = () => fjolspil.seats.list();
  const entryOf = seat => fjolspil.seats.bySeat(seat);
  const nameOf = seat => entryOf(seat)?.name ?? '';
  const later = (ms, fn) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };
  const wait = ms => {
    const t = round;
    return new Promise((resolve, reject) => later(ms, () => (t === round ? resolve() : reject(STALE))));
  };
  const run = flow => flow?.catch?.(error => {
    if (error !== STALE && error !== AWAY) console.error('[veiddu] A move went wrong:', error);
  });
  const stale = token => token !== round || !on;

  // ---- Who plays a seat -----------------------------------------------------------------------------------------------------

  /** A seat that has a phone: a guest's, or Egill's when his is bound. */
  const hasPhone = entry => entry?.kind === 'remote' || (entry?.kind === 'host' && entry.guestId != null);
  /** Egill at the big screen (when no phone is bound to seat 0). */
  const onScreen = entry => entry?.kind === 'host' && entry.guestId == null && !entry.covered;
  /** Any human seat (at the big screen or on a phone), not covered by the computer. */
  const isHuman = entry => Boolean(entry && !entry.covered && (entry.kind === 'remote' || entry.kind === 'host'));
  /** The game's own Uggeðla (not a covered guest's seat). */
  const isHer = seat => seat === uggedlaSeat && entryOf(seat)?.kind === 'ai' && !entryOf(seat).covered;
  /** Egill, at the big screen or on his phone, with his own voice (not when the computer covers him). */
  const isEgill = seat => seat === 0 && entryOf(0)?.kind === 'host' && !entryOf(0).covered;
  const skillBase = () => save?.getVeiddu?.()?.skill ?? VEIDDU_SKILL_START;

  // ---- Laying out the table ------------------------------------------------------------------------------------------------

  function buildPlaces(list) {
    for (const place of places) place.el.remove();
    const screenHost = onScreen(list[0]);
    const slots = screenHost && list.length === 2 ? ['bl', 'top'] : SLOTS[list.length];
    multiEl.dataset.host = screenHost ? 'screen' : 'phone';
    handEl.hidden = !screenHost;
    places = list.map((entry, seat) => {
      const me = seat === 0 && screenHost;
      const placeEl = el('section', `veiddu-place${me ? ' me' : ''}`, { 'data-seat': seat, 'data-slot': slots[seat] });
      const tag = el('div', 'veiddu-tag');
      const face = el('img', 'veiddu-face', { alt: '' });
      const name = el('span');
      tag.append(face, name);
      const count = el('span', 'veiddu-count', { 'aria-hidden': 'true' });
      const top = el('div', 'veiddu-place-top');
      top.append(tag, count);
      const fan = el('div', 'veiddu-their-hand', { role: 'img' });
      const caught = catchElement(doc, [], entry.name);
      const low = el('div', 'veiddu-place-low');
      low.append(fan, caught);
      placeEl.append(top, low);
      if (me) {
        fan.hidden = true;
        count.hidden = true;
      } else {
        pressable(placeEl, { win, sound: null, onTap: () => tapPlace(seat) });
        placeEl.addEventListener('click', () => tapPlace(seat));
      }
      multiEl.append(placeEl);
      return { el: placeEl, tag, face, name, fan, count, catchEl: caught, top, low };
    });
    n = list.length;
    multiEl.dataset.seats = String(n);
    multiEl.append(pondEl, handEl, quitEl);
    // Uggeðla's live window comes over her place when she plays, and goes home when she does not
    if (uggedlaSeat !== null) {
      const place = places[uggedlaSeat];
      place.el.classList.add('her');
      place.el.prepend(uggedla.frameEl);
      place.el.prepend(uggedla.windowEl);
      uggedla.start();
    } else uggedla.stop();
  }

  function returnWindow() {
    uggedla.home.prepend(uggedla.frameEl);
    uggedla.home.prepend(uggedla.windowEl);
  }

  /** The tags as the seats are now: picture, name, who is away, the turn. */
  function renderTags() {
    places.forEach((place, seat) => {
      const entry = entryOf(seat);
      const avatar = avatarOf(entry?.avatar);
      const src = avatar ? asset(avatar.picture) : null;
      if (src && place.face.src !== src) place.face.src = src;
      place.face.hidden = !avatar;
      place.el.style.setProperty('--c', avatar?.colour ?? 'transparent');
      place.face.style.setProperty('--c', avatar?.colour ?? '#79c7a1');
      place.name.textContent = entry?.name ?? '';
      place.el.classList.toggle('away', Boolean(entry?.guestId) && !entry.present);
      place.el.classList.toggle('covered', Boolean(entry?.covered));
      place.fan.setAttribute('aria-label', `${entry?.name ?? ''} á ${shownCount[seat] ?? 0} spil`);
    });
  }

  /** A seat's cards face down, up to FAN_MAX of them, and how many there are. */
  function renderFan(seat) {
    const place = places[seat];
    if (!place || (seat === 0 && onScreen(entryOf(0)))) return;
    const want = Math.min(shownCount[seat] ?? 0, FAN_MAX);
    while (place.fan.children.length > want) place.fan.lastElementChild.remove();
    while (place.fan.children.length < want) place.fan.append(cardElement(doc, null, { back: true }));
    layTheirs(place.fan, place.el);
    place.count.textContent = String(shownCount[seat] ?? 0);
    place.count.hidden = !shownCount[seat];
    place.fan.setAttribute('aria-label', `${nameOf(seat)} á ${shownCount[seat] ?? 0} spil`);
  }
  const renderFans = () => {
    places.forEach((_, seat) => renderFan(seat));
    if (onScreen(entryOf(0))) renderHand();
  };

  /** Egill's own card at the big screen, in its place in handEl. */
  function addToHand(card, hidden = false) {
    const button = cardElement(doc, card, { tag: 'button' });
    if (hidden) button.style.visibility = 'hidden';
    pressable(button, { win, sound: null, onTap: () => tapCard(card.id) });
    button.addEventListener('click', () => tapCard(card.id));
    handEls.set(card.id, button);
    return button;
  }

  function renderHand() {
    const ordered = [...handEls.values()].sort(byKind);
    const now = [...handEl.children];
    if (now.length !== ordered.length || now.some((card, k) => card !== ordered[k])) handEl.append(...ordered);
    layoutHand(handEl);
    marks();
  }

  function marks() {
    const screenTurn = on && awaiting?.seat === 0 && onScreen(entryOf(0));
    const need = screenTurn ? awaiting.need : null;
    const targets = need === 'ask' && picked ? legalTargets(game, 0) : [];
    for (const card of handEls.values()) {
      const kind = card.dataset.kind;
      card.classList.toggle('picked', need === 'ask' && kind === picked);
      card.classList.toggle('is-give', need === 'give' && kind === awaiting.kind);
    }
    places.forEach((place, seat) => {
      place.el.classList.toggle('is-target', seat > 0 && targets.includes(seat));
    });
    pondEl.classList.toggle('calls', Boolean(awaiting && awaiting.need === 'fish'));
  }

  function nope(box) {
    if (!box) return;
    sfx('wiggle');
    box.classList.remove('nope');
    void box.offsetWidth;
    box.classList.add('nope');
  }

  function showFishButton() {
    fishButton?.remove();
    fishButton = el('button', 'veiddu-fish-button', {}, words.SAY.childNo);
    multiEl.append(fishButton);
    const tapNo = () => {
      if (awaiting?.seat === 0 && awaiting?.need === 'no') heard(0, { type: 'no' });
    };
    pressable(fishButton, { win, sound: null, onTap: tapNo });
    fishButton.addEventListener('click', tapNo);
  }
  function removeFishButton() {
    fishButton?.remove();
    fishButton = null;
  }

  function tapCard(id) {
    if (!on || awaiting?.seat !== 0 || !onScreen(entryOf(0))) return;
    const card = handEls.get(id);
    if (!card) return;
    if (awaiting.need === 'ask') {
      sfx('flick', { soft: true });
      picked = card.dataset.kind;
      clearBubble();
      say(nameLine(picked));
      marks();
      return;
    }
    if (awaiting.need === 'give') {
      if (card.dataset.kind !== awaiting.kind) return nope(card);
      heard(0, { type: 'give' });
    }
  }

  function tapPlace(seat) {
    if (!on || seat === 0 || awaiting?.seat !== 0 || !onScreen(entryOf(0))) return;
    if (awaiting.need !== 'ask') return;
    if (!picked) return nope(places[seat]?.el);
    if (!legalTargets(game, 0).includes(seat)) return nope(places[seat]?.el);
    const kind = picked;
    picked = null;
    if (speech.current?.id?.startsWith('veiddu_egill_name_')) speech.stop();
    marks();
    heard(0, { type: 'ask', target: seat, kind });
  }

  function tapPond() {
    if (!on || awaiting?.seat !== 0 || !onScreen(entryOf(0))) return;
    if (awaiting.need === 'ask') return nope(pondEl);
    if (awaiting.need !== 'fish') return;
    heard(0, { type: 'fish' });
  }

  /** `seat`'s catch shows `laid` (the kinds in it). Returns the new element, not yet in the page. */
  function makeCatch(seat, laid, shownPairsCount) {
    const next = catchElement(doc, laid, nameOf(seat));
    next.querySelector('.veiddu-catch-count').textContent = String(shownPairsCount);
    return next;
  }

  function markTurn(seat) {
    places.forEach((place, s) => place.el.classList.toggle('turn', s === seat));
  }
  function markAsked(seat) {
    places.forEach((place, s) => place.el.classList.toggle('asked', s === seat));
  }
  function thinking(seat, value) {
    places[seat]?.el.classList.toggle('thinking', value);
    if (seat === uggedlaSeat) uggedla.view()?.think(value);
  }

  /** The pond shows up to POND_SHOWN of its cards; a card keeps its place as others go. */
  function setPond(count, { fill = false } = {}) {
    const want = Math.min(count, POND_SHOWN);
    while (pondShown.length > want) pondShown.pop().remove();
    while (pondShown.length < want) {
      const k = pondShown.length;
      const card = pondCard(doc, k);
      pondEl.append(card);
      pondShown.push(card);
      if (fill && !calm()) card.animate?.([{ opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1 }], { duration: 380, delay: k * 45, fill: 'backwards', easing: 'cubic-bezier(.3, 1.4, .5, 1)' });
    }
    pondEl.setAttribute('aria-label', `Tjörnin: ${count} spil`);
  }

  function splash() {
    if (calm()) return;
    const drops = el('div', 'veiddu-splash', { 'aria-hidden': 'true' });
    for (let k = 0; k < 11; k++) {
      const side = k % 2 ? 1 : -1;
      const drop = el('i');
      drop.style.cssText = `--x:${side * (40 + ((k * 53) % 170))}px;--a:${(0.7 + ((k * 13) % 7) / 10).toFixed(1)};--t:${(1 + (k % 4) * 0.12).toFixed(2)}s`;
      drops.append(drop);
    }
    pondEl.append(drops);
    later(1700, () => drops.remove());
  }

  // ---- Where things are, and the cards in the air -----------------------------------------------------------------------------

  /** Where `box` is: its middle in the table's own pixels, its width, and how it is turned (degrees). */
  function placeOf(box, r = 0, w = null) {
    const at = box.getBoundingClientRect();
    const base = multiEl.getBoundingClientRect();
    return { x: at.left + at.width / 2 - base.left, y: at.top + at.height / 2 - base.top, w: w ?? (box.offsetWidth || at.width), r };
  }
  const backWidth = () => places.find(p => !p.fan.hidden)?.fan.querySelector('.veiddu-card')?.offsetWidth || 48;
  const pondTop = () => placeOf(pondShown.at(-1) ?? pondEl, pondShown.length ? Number.parseFloat(pondShown.at(-1).style.getPropertyValue('--r')) : 0);
  const pondMiddle = () => ({ ...placeOf(pondEl), w: backWidth() });
  const placeHand = card => {
    const r = Number.parseFloat(card.style.getPropertyValue('--r')) || 0;
    return placeOf(card, r, card.offsetWidth || 96);
  };
  /** Where a seat's cards are: the middle of its fan (of its place, while it holds none), or handEl for Egill at the big screen. */
  const fanOf = seat => {
    if (seat === 0 && onScreen(entryOf(0))) {
      const box = handEl.lastElementChild ?? handEl;
      return { ...placeOf(handEl, 0), w: box.offsetWidth || 96 };
    }
    const place = places[seat];
    const box = place.fan.lastElementChild ?? place.fan;
    return { ...placeOf(place.fan.children.length ? place.fan : place.low, 0), w: box.offsetWidth || backWidth() };
  };

  function flyer(card, from, { width, up = false } = {}) {
    const flier = el('div', 'veiddu-flyer');
    flier.style.setProperty('--fly-w', `${width.toFixed(1)}px`);
    const inner = el('div', 'veiddu-flyer-turn');
    if (card) inner.append(cardElement(doc, card));
    if (!card || up) {
      const back = cardElement(doc, null);
      if (up) back.classList.add('under');
      inner.append(back);
    }
    if (up) inner.style.transform = 'rotateY(180deg)';
    flier.append(inner);
    const h = (width * 7) / 5;
    const at = ({ x, y, r, w }) => `translate(${(x - width / 2).toFixed(1)}px, ${(y - h / 2).toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${(w / width).toFixed(3)})`;
    let pos = from;
    let dropped = false;
    flier.style.transform = at(from);
    multiEl.append(flier);
    flying++;
    return {
      el: flier,
      async move(to, { turn = false, duration = FLY_MS } = {}) {
        const t = round;
        const start = pos;
        pos = to;
        if (calm() || typeof flier.animate !== 'function') {
          flier.style.transform = at(to);
          if (turn) inner.style.transform = '';
          const fade = flier.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
          await (fade?.finished ?? Promise.resolve()).catch(() => {});
        } else {
          const lift = Math.min(90, Math.hypot(to.x - start.x, to.y - start.y) * 0.2);
          const middle = { x: (start.x + to.x) / 2, y: (start.y + to.y) / 2 - lift, r: (start.r + to.r) / 2, w: ((start.w + to.w) / 2) * 1.1 };
          const path = flier.animate([{ transform: at(start) }, { transform: at(middle), offset: 0.5 }, { transform: at(to) }], { duration, easing: 'cubic-bezier(.3, .6, .35, 1)', fill: 'forwards' });
          const spin = turn ? inner.animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }], { duration, easing: 'ease-in-out', fill: 'forwards' }) : null;
          await path.finished.catch(() => {});
          flier.style.transform = at(to);
          if (turn) inner.style.transform = '';
          path.cancel();
          spin?.cancel();
        }
        if (t !== round) throw STALE;
      },
      drop() {
        if (dropped) return;
        dropped = true;
        flying = Math.max(0, flying - 1);
        flier.remove();
      },
    };
  }

  function sparkleAt(spot, w) {
    const mark = el('div');
    mark.style.cssText = `position:absolute;pointer-events:none;left:${(spot.x - w / 2).toFixed(1)}px;top:${(spot.y - w * 0.7).toFixed(1)}px;width:${w.toFixed(1)}px;height:${(w * 1.4).toFixed(1)}px`;
    multiEl.append(mark);
    sparkle(mark, 10, win);
    mark.remove();
  }

  /** Two cards of a kind snap together, sparkle and fly to `seat`'s catch from its fan or Egill's hand. */
  async function pairUp(seat, kind, cardIds = []) {
    const place = places[seat];
    const laid = [...shownPairs[seat], kind];
    const old = place.catchEl;
    const screenMe = seat === 0 && onScreen(entryOf(0));
    let from = fanOf(seat);
    let starts = [from, from];
    if (screenMe) {
      const btns = cardIds.map(id => handEls.get(id)).filter(Boolean);
      if (btns.length === 2) starts = btns.map(placeHand);
      for (const id of cardIds) {
        const btn = handEls.get(id);
        if (btn) {
          handEls.delete(id);
          btn.remove();
        }
      }
      renderHand();
      shownCount[0] = handEls.size;
    } else {
      shownCount[seat] = Math.max(0, shownCount[seat] - 2);
      renderFan(seat);
    }
    // Where the pair will lie: measured on the new catch, put in the old one's place for a moment (no frame is drawn).
    const next = makeCatch(seat, laid, shownPairs[seat].length);
    next.querySelector('.veiddu-pair').style.visibility = 'hidden';
    old.replaceWith(next);
    const slots = [...next.querySelectorAll('.veiddu-pair .veiddu-card')].map((card, k) => placeOf(card, [-7, 5][k]));
    next.replaceWith(old);
    const wide = Math.max(slots[0].w * 1.7, 72);
    const meet = { x: (from.x + slots[0].x) / 2, y: (from.y + slots[0].y) / 2 - 8 };
    const width = Math.max(...starts.map(s => s.w), wide);
    const fliers = [0, 1].map(k => flyer({ id: cardIds[k] ?? `${kind}-1`, kind }, starts[k], { width, up: !screenMe }));
    await Promise.all(fliers.map((flight, k) => flight.move({ x: meet.x + (k ? 1 : -1) * wide * 0.3, y: meet.y, r: k ? 5 : -7, w: wide }, { turn: !screenMe, duration: GATHER_MS })));
    if (!calm()) for (const flight of fliers) flight.el.animate?.([{ scale: 1 }, { scale: 1.12 }, { scale: 1 }], { duration: 240, easing: 'ease-out' });
    sparkleAt(meet, wide);
    sfx('pair');
    await wait(SNAP_MS);
    await Promise.all(fliers.map((flight, k) => flight.move(slots[k], { duration: CATCH_MS })));
    sfx('flick', { soft: true });
    old.replaceWith(next);
    next.querySelector('.veiddu-pair').style.visibility = '';
    next.querySelector('.veiddu-catch-count').textContent = String(laid.length);
    place.catchEl = next;
    fliers.forEach(flight => flight.drop());
    if (!calm()) next.querySelector('.veiddu-catch-count')?.animate?.([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
    shownPairs[seat] = laid;
    if (seat === uggedlaSeat) uggedla.view()?.happy();
  }

  /** A card drawn from the pond flies into `seat`'s cards, and the water splashes. */
  async function drawCard(seat, cardId = null) {
    const from = pondTop();
    pondCount = Math.max(0, pondCount - 1);
    setPond(pondCount);
    splash();
    uggedla.view()?.splash();
    sfx('draw');
    splashes.play(entryOf(seat)?.kind === 'ai' ? SEAT.uggedla : SEAT.child); // a human's fish with the full splash, the computer's with the soft one
    if (seat === 0 && onScreen(entryOf(0)) && cardId) {
      const card = cardOf(cardId);
      const hidden = addToHand(card, true);
      renderHand();
      const to = placeHand(hidden);
      const flight = flyer(card, from, { width: Math.max(to.w, from.w), up: true });
      await flight.move(to, { turn: true, duration: FLY_MS + 100 });
      hidden.style.visibility = '';
      flight.drop();
      shownCount[0] = handEls.size;
      return;
    }
    const flight = flyer(null, from, { width: Math.max(backWidth(), from.w) });
    await flight.move(fanOf(seat), { duration: FLY_MS + 100 });
    flight.drop();
    shownCount[seat]++;
    renderFan(seat);
  }

  /** A card given from `from` to `to`: it flies from one hand/fan to the other. */
  async function giveCard(from, to, cardIds = []) {
    const cardId = cardIds[0];
    let start = fanOf(from);
    if (from === 0 && onScreen(entryOf(0)) && cardId && handEls.has(cardId)) {
      const btn = handEls.get(cardId);
      start = placeHand(btn);
      handEls.delete(cardId);
      btn.remove();
      renderHand();
      shownCount[0] = handEls.size;
    } else {
      shownCount[from] = Math.max(0, shownCount[from] - 1);
      renderFan(from);
    }
    sfx('flick');
    if (to === 0 && onScreen(entryOf(0)) && cardId) {
      const card = cardOf(cardId);
      const hidden = addToHand(card, true);
      renderHand();
      const end = placeHand(hidden);
      const flight = flyer(card, start, { width: Math.max(end.w, start.w), up: true });
      await flight.move(end, { turn: true, duration: FLY_MS });
      hidden.style.visibility = '';
      flight.drop();
      shownCount[0] = handEls.size;
      return;
    }
    const flight = flyer(null, start, { width: Math.max(backWidth(), start.w) });
    await flight.move(fanOf(to), { duration: FLY_MS });
    flight.drop();
    shownCount[to]++;
    renderFan(to);
  }

  // ---- Words: bubbles and voices -----------------------------------------------------------------------------------------------

  function clearBubble() {
    bubbleEl?.remove();
    bubbleEl = null;
    bubbleUntil = 0;
  }
  /** Waits until the line showing has had its time and its voice has ended (speech.js stops a voice whose end never comes). */
  async function lineDone() {
    for (let left = bubbleUntil - clock(); left > 0 || speech.talking; left = bubbleUntil - clock()) await wait(left > 0 ? left : 40);
  }

  /** The voice line for `seat` saying `what` ('ask', 'yes', 'no', 'lucky') about `kind`: Egill's on his phone, Uggeðla's for her; null for any other seat. */
  function lineFor(seat, what, kind) {
    const character = isEgill(seat) ? SEAT.child : isHer(seat) ? SEAT.uggedla : null;
    if (character === null) return null;
    return what === 'ask' ? askLine(character, kind) : answerLine(character, what);
  }
  /** What a seat says to answer: Egill's own words for Egill ("Gjörðu svo vel!"), the others' ("Já, gjörðu svo vel!"). */
  const yesText = seat => (isEgill(seat) ? words.SAY.give : words.SAY.yes);
  const noText = seat => (isEgill(seat) ? words.SAY.childNo : words.SAY.no);

  /** The bubble of `from` (a seat, or null for the pond) saying `text` to `to`: by its place, in its colour, with an arrow at the one asked. */
  function bubbleOf(from, to, text) {
    const bubble = el('div', `veiddu-bubble mp${[...text].length > 24 ? ' long' : ''}`, { role: 'status' });
    const speaker = from === null ? null : places[from];
    const textEl = el('p');
    if (speaker) {
      const avatar = avatarOf(entryOf(from)?.avatar);
      const face = el('img', 'veiddu-bubble-face', { src: avatar ? asset(avatar.picture) : '', alt: '' });
      face.style.setProperty('--c', avatar?.colour ?? '#79c7a1');
      textEl.append(face);
      bubble.style.setProperty('--c', avatar?.colour ?? 'var(--ink)');
      if (to !== null && places[to]) textEl.dataset.who = `${nameOf(from)} ➔ ${nameOf(to)}`;
    }
    textEl.append(doc.createTextNode(text));
    bubble.append(textEl);
    multiEl.append(bubble);
    // Where: beside its speaker's place, on the side toward the pond (so it never covers the tag it belongs to), kept inside the table
    const base = multiEl.getBoundingClientRect();
    const box = speaker ? speaker.el.getBoundingClientRect() : pondEl.getBoundingClientRect();
    const anchor = speaker ? placeOf(speaker.el) : placeOf(pondEl);
    const middle = placeOf(pondEl);
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    const dx = middle.x - anchor.x;
    const dy = middle.y - anchor.y;
    let cx = anchor.x;
    let cy = anchor.y;
    if (speaker) {
      if (Math.abs(dx) * box.height >= Math.abs(dy) * box.width) cx += Math.sign(dx || 1) * (box.width / 2 + bw / 2 + 14); // beside it
      else cy += Math.sign(dy || 1) * (box.height / 2 + bh / 2 + 14); // above or under it
      if (Math.abs(dx) * box.height >= Math.abs(dy) * box.width) cy += Math.sign(dy) * Math.min(Math.abs(dy), box.height / 2); // and a little toward the pond's height
    }
    cx = Math.min(Math.max(cx, bw / 2 + 12), base.width - bw / 2 - 12);
    cy = Math.min(Math.max(cy, bh / 2 + 12), base.height - bh / 2 - 12);
    bubble.style.left = `${(cx - bw / 2).toFixed(1)}px`;
    bubble.style.top = `${(cy - bh / 2).toFixed(1)}px`;
    if (to !== null && places[to]) {
      const target = placeOf(places[to].el);
      const angle = Math.atan2(target.y - cy, target.x - cx);
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const edge = Math.min(Math.abs(dx) > 1e-6 ? bw / 2 / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? bh / 2 / Math.abs(dy) : Infinity);
      const size = 56;
      const arrow = el('span', 'veiddu-bubble-arrow', { 'aria-hidden': 'true' }, POINTER);
      arrow.style.left = `${(bw / 2 + dx * (edge + size * 0.55) - size / 2).toFixed(1)}px`;
      arrow.style.top = `${(bh / 2 + dy * (edge + size * 0.55) - size / 2).toFixed(1)}px`;
      arrow.style.width = `${size}px`;
      arrow.style.setProperty('--turn', `${((angle * 180) / Math.PI).toFixed(1)}deg`);
      bubble.append(arrow);
    }
    return bubble;
  }

  /**
   * `from` says `text` to `to` (seats; from is null for the table, to for nobody), with the recorded line `id` (or none): a bubble by the
   * speaker with an arrow at the one asked, and the voice. It stays for lineMs(text), or while the line sounds if that is longer; lineDone()
   * waits for that.
   */
  async function speak(from, to, text, id = null) {
    await lineDone();
    bubbleEl?.remove();
    bubbleEl = bubbleOf(from, to, text);
    const seconds = id ? say(id) : 0; // 0: not recorded yet, or muted, or nobody's voice: the bubble keeps its text time alone
    bubbleUntil = clock() + Math.max(lineMs(text), seconds > 0 ? seconds * 1000 + VOICE_TAIL_MS : 0);
    return true;
  }

  // ---- The phones ----------------------------------------------------------------------------------------------------------------

  /** The last public thing an act did, for the phones' line: the answer if there was one, else the fish, else the last pair. */
  function headline(events) {
    const publics = events.map(publicEvent).filter(Boolean);
    for (const type of ['no', 'give', 'fish', 'pair', 'pond-empty']) {
      const found = publics.findLast(event => event.type === type);
      if (found) return found;
    }
    return publics.at(-1) ?? null;
  }

  function viewOf(seat) {
    const entries = seatList();
    const names = entries.slice(0, n).map(entry => entry.name);
    const avatars = entries.slice(0, n).map(entry => entry.avatar);
    const away = entries.slice(0, n).flatMap(entry => (entry.guestId && !entry.present ? [entry.seat] : []));
    const waiting = awaiting && { seat: awaiting.seat, need: awaiting.need, kind: awaiting.kind };
    return viewFor(phoneGame, seat, { awaiting: waiting, pending, lastEvent, names, avatars, away });
  }
  const sendView = seat => { if (on && phoneGame && entryOf(seat)?.guestId) fjolspil.send(seat, viewOf(seat)); };
  /** Every seat of this round that has a phone, a covered one's too, so the view it comes back to is the newest. */
  function sendViews() {
    for (let seat = 0; seat < n; seat++) sendView(seat);
  }

  /** The round kept in the save after every act, with its seats (the players only); one that is over is forgotten. */
  function keep() {
    try {
      if (game.phase === 'over') {
        save?.setVeiddu?.({ game: null });
        return;
      }
      const snapshot = fjolspil.seats.snapshot();
      save?.setVeiddu?.({ game, seats: { ...snapshot, seats: snapshot.seats.slice(0, n) } });
    } catch (error) {
      console.warn('[veiddu] the round could not be kept', error);
    }
  }

  /** The round kept in the save, { game, seats }, when it is one this page can take up. */
  function saved() {
    if (!fjolspil) return null;
    const kept = save?.getVeiddu?.() ?? null;
    const state = keptGameOf(kept?.game);
    const seats = kept?.seats;
    if (!state || !seats || typeof seats !== 'object' || !Array.isArray(seats.seats) || seats.seats.length !== state.hands.length) return null;
    const head = seats.seats[0];
    if (!head || (head.kind !== 'host' && !(head.seat === 0 && head.covered))) return null;
    if (head.guestId !== null && (typeof head.guestId !== 'string' || head.guestId === '')) return null;
    return { game: state, seats };
  }

  // ---- Waiting for a phone or the big screen ---------------------------------------------------------------------------------

  /** Waits for the act of seat `seat` (`need`: 'ask', 'fish', 'give' or 'no'; `kind` the animal asked for), which the rules allow. */
  function waitAct(seat, need, kind = null) {
    return new Promise((resolve, reject) => {
      picked = null;
      awaiting = { seat, need, kind, resolve, reject };
      if (need === 'fish') {
        pondEl.classList.add('calls'); // the pond calls the one who must fish
        sfx('pond-call');
      }
      if (seat === 0 && onScreen(entryOf(0))) {
        if (need === 'no') showFishButton();
        if (need === 'ask' || need === 'give') sfx('turn-chime');
      }
      marks();
      sendViews();
    });
  }

  /** An act from a guest's phone or Egill at the big screen: played if it is the one the table waits for and the rules allow it. */
  function heard(seat, body) {
    if (!on || !game || ended || !Number.isInteger(seat) || seat >= n) return;
    const act = awaiting ? actOf(game, seat, body, { seat: awaiting.seat, need: awaiting.need, kind: awaiting.kind }) : null;
    if (!act) {
      refused.push({ seat, act: body ?? null, waitingFor: awaiting ? { seat: awaiting.seat, need: awaiting.need, kind: awaiting.kind } : null });
      if (refused.length > 20) refused.shift();
      sendView(seat);
      return;
    }
    const taken = awaiting;
    awaiting = null;
    picked = null;
    removeFishButton();
    pondEl.classList.remove('calls');
    marks();
    taken.resolve(act);
    sendViews(); // she has answered: nothing more is hers to do, and the others see the table go on
  }

  /**
   * The act of seat `seat`: from Egill at the big screen or its phone, if it has one that is there and not covered; from the computer
   * (`computer(entry)`) if it is the computer's; and while a guest is away (or has come back to a seat the computer plays) a wait over the
   * table (fjolspil.waitFor): "Bíðum eftir …", then "Halda áfram án …", which makes the computer play it.
   */
  async function decide(seat, need, kind, computer) {
    const token = round;
    for (;;) {
      if (stale(token)) throw STALE;
      const entry = entryOf(seat);
      if ((onScreen(entry) || (hasPhone(entry) && entry.present)) && !entry.covered) {
        try {
          return await waitAct(seat, need, kind);
        } catch (error) {
          if (error === AWAY) continue;
          throw error;
        }
      }
      if (hasPhone(entry) ? !entry.present : Boolean(entry?.covered && entry.present)) {
        waitingFor = seat;
        sendViews();
        let result;
        try {
          result = await fjolspil.waitFor(seat);
        } finally {
          waitingFor = null;
        }
        if (stale(token) || result === 'closed') throw STALE;
        continue;
      }
      return computer(entry);
    }
  }

  /** The seats changed: the tags show who is away, and a phone that goes while the table waits for its act is waited for over the table. */
  function seatsChanged() {
    if (!on || !game) return;
    renderTags();
    if (!awaiting) return;
    const entry = entryOf(awaiting.seat);
    if ((onScreen(entry) || (hasPhone(entry) && entry.present)) && !entry.covered) return;
    const gone = awaiting;
    awaiting = null;
    picked = null;
    removeFishButton();
    pondEl.classList.remove('calls');
    marks();
    later(0, () => { // out of the seats' own change, which is still under way
      gone.reject(AWAY);
      sendViews();
    });
  }

  // ---- The round --------------------------------------------------------------------------------------------------------------

  /** Everything the minds may know: every event, in order (a mind learns only what the rules made public). */
  function feed(events) {
    for (const mind of minds) for (const event of events) mind.observe(event, game);
  }

  /** Shows what the events of one act did, one after another: the answer, the cards flying, the pairs, the pond. */
  async function playEvents(events, asker = null) {
    for (const event of events) {
      switch (event.type) {
        case 'give':
          await speak(event.from, asker, yesText(event.from), lineFor(event.from, 'yes'));
          await wait(ANSWER_BEAT_MS * 0.6);
          await giveCard(event.from, event.to, event.cardIds);
          break;
        case 'no':
          await speak(event.seat, asker, noText(event.seat), lineFor(event.seat, 'no'));
          break;
        case 'pair':
          await pairUp(event.seat, event.kind, event.cardIds);
          break;
        case 'fish':
          await drawCard(event.seat, event.cardId);
          if (event.lucky) {
            await speak(event.seat, null, words.SAY.lucky, lineFor(event.seat, 'lucky'));
            await wait(ANSWER_BEAT_MS);
          }
          break;
        case 'refill':
          await drawCard(event.seat, event.cardId);
          break;
        case 'pond-empty':
          await speak(isHer(uggedlaSeat ?? -1) ? uggedlaSeat : null, null, words.SAY.empty, isHer(uggedlaSeat ?? -1) ? EMPTY_LINE : null);
          break;
        case 'turn':
          markTurn(event.seat);
          break;
        case 'out':
          if (!outSeen.has(event.seat)) {
            outSeen.add(event.seat);
            places[event.seat]?.el.classList.add('out');
          }
          break;
        default:
          break; // ask is shown by doAsk, deal by the deal, over by proceed
      }
    }
  }

  /** The act has been shown: on to whoever's turn it is, or the end. */
  async function proceed() {
    const humanFish = game.phase === 'fish' && isHuman(entryOf(game.turn)) && entryOf(game.turn).present;
    if (!humanFish) await lineDone();
    markAsked(null);
    if (game.phase === 'over') return endRound();
    return turn(game.turn);
  }

  /** The act is taken: the rules see it, the minds are told, the phones are sent the new game (the end waits until it has been shown), it is kept. */
  function commit(result) {
    const before = game;
    game = result.game;
    feed(result.events);
    lastEvent = headline(result.events);
    phoneGame = game.phase === 'over' ? before : game;
    pending = null;
    keep();
    sendViews();
  }

  /** The turn of `seat`, who is on turn in `game`. */
  async function turn(seat) {
    const token = round;
    busy = true;
    if (game.phase !== 'fish') clearBubble();
    markTurn(seat);
    renderTags();
    if (game.phase === 'fish') return doFish(seat);
    const act = await decide(seat, 'ask', null, async () => {
      thinking(seat, true);
      await wait(THINK_MS);
      thinking(seat, false);
      const { target, kind } = minds[seat].chooseAsk(game, { skill: isHer(seat) ? skillBase() : COVER_SKILL });
      return { type: 'ask', target, kind };
    });
    if (stale(token)) return undefined;
    return doAsk(seat, act.target, act.kind);
  }

  /** `seat` asks `target` for `kind`: the question in a bubble (every phone hears it), then the answer, a phone's tap or a mind's at once. */
  async function doAsk(seat, target, kind) {
    const token = round;
    const result = ask(game, seat, target, kind);
    pending = { from: seat, to: target, kind };
    lastEvent = publicEvent(result.events[0]);
    markAsked(target);
    sendViews();
    await speak(seat, target, words.asking(kind), lineFor(seat, 'ask', kind));
    const humanTarget = isHuman(entryOf(target)) && entryOf(target).present;
    if (!humanTarget) await lineDone();
    const need = holds(game, target, kind) ? 'give' : 'no';
    await decide(target, need, kind, async () => {
      await wait(ANSWER_BEAT_MS);
      return { type: need };
    });
    if (stale(token)) return undefined;
    if (humanTarget) {
      speech.cut(1);
      bubbleUntil = 0;
    }
    commit(result);
    await playEvents(result.events.slice(1), seat);
    return proceed();
  }

  /** `seat` fishes: the pond calls, a phone's tap or a mind after a beat. */
  async function doFish(seat) {
    const token = round;
    await decide(seat, 'fish', null, async () => {
      await lineDone();
      await wait(FISH_BEAT_MS);
      return { type: 'fish' };
    });
    if (stale(token)) return undefined;
    clearBubble();
    speech.cut(1);
    const result = fish(game, seat);
    commit(result);
    await playEvents(result.events);
    return proceed();
  }

  /** Back to an empty table: the cards, the catches, the words, every timer. */
  function reset() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    awaiting?.reject?.(STALE);
    awaiting = null;
    picked = null;
    pending = null;
    lastEvent = null;
    removeFishButton();
    for (const flight of multiEl.querySelectorAll('.veiddu-flyer, .veiddu-splash')) flight.remove();
    flying = 0;
    busy = true;
    ended = false;
    clearBubble();
    speech.stop(); // nothing more is said of the round that was, and the line sounding is cut
    pondEl.classList.remove('calls');
    outSeen.clear();
    handEls.clear();
    handEl.replaceChildren();
    shownCount = places.map(() => 0);
    shownPairs = places.map(() => []);
    places.forEach((place, seat) => {
      place.el.classList.remove('turn', 'asked', 'is-target', 'thinking', 'out');
      place.fan.replaceChildren();
      const empty = makeCatch(seat, [], 0);
      place.catchEl.replaceWith(empty);
      place.catchEl = empty;
    });
    renderFans();
    for (const card of pondShown) card.remove();
    pondShown = [];
    pondCount = 0;
    winEl.hidden = true;
    uggedla.view()?.rest();
  }

  /** A new round: the pond fills, five cards fly to each seat, and the pairs the hands hold go down. Then the first seat begins. */
  async function deal() {
    const token = ++round;
    reset();
    const deck = kinds >= KINDS.length ? undefined : makeDeck().filter(card => KINDS.slice(0, kinds).some(kind => kind.id === card.kind));
    const start = newGame({ seats: n, random, ...(deck && { deck }) });
    game = start.game;
    phoneGame = game;
    minds = places.map((_, seat) => createMind(seat, { random }));
    feed(start.events);
    pondCount = game.pond.length;
    setPond(pondCount, { fill: true });
    renderTags();
    markTurn(null);
    lastEvent = null;
    keep();
    sendViews(); // the phones deal it too, as the table does
    await wait(700);
    const flights = [];
    const from = pondMiddle();
    const dealtCards = start.events.filter(event => event.type === 'deal');
    for (const { seat, cardId } of dealtCards) {
      if (seat === 0 && onScreen(entryOf(0))) {
        const card = cardOf(cardId);
        const target = addToHand(card, true);
        renderHand();
        const to = placeHand(target);
        const flight = flyer(card, from, { width: Math.max(to.w, from.w), up: true });
        flights.push(flight.move(to, { turn: true, duration: DEAL_MS }).then(() => {
          target.style.visibility = '';
          flight.drop();
          shownCount[0]++;
          sfx('flick', { soft: true });
        }));
      } else {
        const flight = flyer(null, from, { width: Math.max(backWidth(), from.w) });
        flights.push(flight.move(fanOf(seat), { duration: DEAL_MS }).then(() => {
          flight.drop();
          shownCount[seat]++;
          renderFan(seat);
          sfx('flick', { soft: true });
        }));
      }
      await wait(DEAL_GAP);
    }
    await Promise.all(flights);
    await wait(250);
    for (const event of start.events) {
      if (event.type === 'pair') await pairUp(event.seat, event.kind, event.cardIds);
    }
    if (stale(token)) return undefined;
    dealt++;
    return proceed();
  }

  /** A round kept in the save, laid out as it stands (it was dealt before the reload), and on with whoever's turn it is. */
  async function takeUp(state) {
    const token = ++round;
    reset();
    game = state;
    phoneGame = state;
    minds = places.map((_, seat) => createMind(seat, { random }));
    feed(state.log);
    shownCount = state.hands.map(hand => hand.length);
    shownPairs = state.pairs.map(laid => [...laid]);
    pondCount = state.pond.length;
    setPond(pondCount);
    if (onScreen(entryOf(0))) {
      for (const card of state.hands[0]) addToHand(card, false);
      renderHand();
    }
    places.forEach((place, seat) => {
      const next = makeCatch(seat, shownPairs[seat], shownPairs[seat].length);
      place.catchEl.replaceWith(next);
      place.catchEl = next;
    });
    renderTags();
    renderFans();
    markTurn(state.turn);
    sendViews();
    await wait(400);
    if (stale(token)) return undefined;
    dealt++;
    return proceed();
  }

  /** The round is over: the skill and the sticker, then the winners' words, the confetti, and "Spilum aftur?". */
  async function endRound() {
    const token = round;
    busy = true;
    pondEl.classList.remove('calls');
    markTurn(null);
    markAsked(null);
    for (const place of places) place.el.classList.remove('asked', 'is-target', 'out', 'thinking');
    clearBubble();
    const winners = game.winners;
    const herRound = uggedlaSeat !== null && isHer(uggedlaSeat);
    const egillWon = childWon(winners);
    const between = herRound && (egillWon || winners.includes(uggedlaSeat)); // wins and the minds' skill follow only a round Egill or she won
    if (between) save?.setVeiddu?.(afterRoundSave({ ...save.getVeiddu?.(), skill: skillBase() }, winners));
    phoneGame = game;
    sendViews();
    await wait(600);
    if (stale(token)) return;
    const names = seatList().slice(0, n).map(entry => entry.name);
    const title = winCard.querySelector('h2');
    const text = winnersWords(winners, names);
    title.textContent = text;
    title.style.fontSize = text.length > 14 ? 'clamp(36px, 5.4cqmin, 56px)' : '';
    const sticker = egillWon && herRound;
    winCard.querySelector('.veiddu-sticker').hidden = !sticker;
    winCard.querySelector('.veiddu-win-words').hidden = !sticker;
    const human = winners.some(seat => isHuman(entryOf(seat)));
    winEl.querySelector('.veiddu-confetti').hidden = !human;
    winEl.hidden = false;
    ended = true;
    if (herRound) uggedla.view()?.cheer(); // she cheers for the winner
    if (human) sfx('fanfare');
    if (herRound) { // and she says it, when it is hers to say
      if (winners.length === 1 && winners[0] === uggedlaSeat) say(endLine([SEAT.uggedla], 0));
      else if (winners.length === 1 && winners[0] === 0) say(endLine([SEAT.child], 1)); // her "Þú vannst! Vel gert!" for Egill
    }
  }

  // ---- Opening, a lobby, a kept round ----------------------------------------------------------------------------------------

  /** A round for these seats (Egill's first), or the kept one: false when there is nobody to play with. */
  function show(list, kept = null) {
    if (list.length < 2 || list.length > 4 || !list[0] || (kept && kept.hands.length !== list.length)) return false;
    ended = false;
    on = true;
    onShow();
    multiEl.hidden = false;
    uggedlaSeat = list.findIndex(entry => entry.kind === 'ai' && !entry.covered && entry.avatar === AI.avatar);
    if (uggedlaSeat < 0) uggedlaSeat = null;
    buildPlaces(list);
    seatsOff?.();
    seatsOff = fjolspil.seats.onChange(seatsChanged);
    shownCount = places.map(() => 0);
    shownPairs = places.map(() => []);
    renderTags();
    run(kept ? takeUp(kept) : deal());
    return true;
  }

  /** "Spilum aftur?": a new round for the seats there are, with no lobby. */
  const dealSeats = () => { if (!show(seatList())) onQuit(); };

  async function openLobby() {
    const opened = await fjolspil.openLobby({ game: 'veiddu', ai: AI });
    return Boolean(opened) && show(opened.seats);
  }

  async function resume() {
    const kept = saved();
    if (!kept) return false;
    await fjolspil.resume(kept.seats);
    const seats = seatList();
    if (seats.length !== kept.game.hands.length) return false; // another tab has the room: its seats are not these
    return show(seats, kept.game);
  }

  function leave({ close = false } = {}) {
    if (!on) return;
    on = false;
    round++; // the round under way is dropped, with no penalty (and stays kept in the save)
    reset();
    seatsOff?.();
    seatsOff = null;
    returnWindow();
    multiEl.hidden = true;
    winEl.hidden = true;
    onHide();
    if (close) fjolspil.closeGame(); // the phones wait for the next lobby, and a wait for a guest ends
    uggedla.view()?.rest();
  }

  // ---- Touch ---------------------------------------------------------------------------------------------------------------

  pressable(pondEl, { win, sound: null, onTap: () => tapPond() });
  pondEl.addEventListener('click', () => tapPond());
  pressable(quitEl, { win, sound: null, onTap: () => onQuit() });
  pressable(winCard.querySelector('.veiddu-close'), { win, sound: null, onTap: () => onQuit() });
  pressable(winCard.querySelector('.veiddu-again'), { win, sound: null, onTap: () => { if (on && ended) dealSeats(); } });
  fjolspil.onAct((seat, body) => heard(seat, body));
  win?.addEventListener?.('resize', () => {
    if (on && game && !flying) renderFans();
  });

  return {
    show,
    openLobby,
    resume,
    saved,
    leave,
    get isOn() { return on; },
    get game() { return game; },
    get dealt() { return dealt; },
    get seats() { return n; },
    get refused() { return refused; },
    get phase() {
      if (!on) return 'shut';
      if (ended) return 'over';
      if (waitingFor !== null) return `away ${waitingFor}`;
      if (awaiting) return `${awaiting.seat} ${awaiting.need}`;
      return 'busy';
    },
  };
}
