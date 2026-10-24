// The lobby and the waiting card of "Fjölspil" on the big screen (spec §4 and §8). The lobby is the card a game opens when
// "Fjölspil" is tapped: the QR code a phone scans (the phone page's address with the room's code, `spil.html?r=GULL`), the
// four letters under it for a PC to type, the four seats with Egill in the first, the game's own character to add or take
// out ("Bæta við Þórseðlu" / "Taka Þórseðlu út", the words the game passes, already declined) and "Byrjum!", which waits for
// two seats that are there. The waiting card is the one a game shows over its board when the guest whose turn it is has gone
// (spec §4 step 6): "Bíðum eftir Anna…" with her picture, the same QR code and letters, and after COVER_AFTER_MS the button
// "Halda áfram án Anna". Names are shown as they were typed, never declined, and always put in as text, never as markup.
//
// It only shows. The seats are the host session's (seats.js), which changes them and calls refresh(); a slot that was empty
// and has a guest now sparkles, with the tap sound. Every button says what was pressed through its callback: the character
// button calls onAddAi or onRemoveAi and shows the seats again, "Byrjum!" and the X hide the lobby and then call onStart or
// onClose, and "Halda áfram án …" calls onContinue(seat) once; hiding the waiting card is the caller's (hideWaiting).
// Taps are the book's (book/fx.js: the squash, the sparkle and the sound `tap` through audio.sfx, as the games pass it), and
// the look is fjolspil.css, of one family with Háls og hali's setup card.

import { COVER_AFTER_MS, MAX_SEATS } from './protocol.js';
import { avatarOf } from './seats.js';
import { qrSvg } from './qr.js';
import { pressable, sparkle } from '../book/fx.js';

const REMAKE = new URL('../../', import.meta.url);
const asset = path => new URL(path, REMAKE).href;
const TITLE_PICTURE = asset('assets/book/images/mosi-kambedla-render-thumb.webp'); // two friends playing together

const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" fill="none" stroke="#3b2f25" stroke-width="4" stroke-linecap="round"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5l12 7.5-12 7.5z" fill="#fffaf0" stroke="#3b2f25" stroke-width="2.6" stroke-linejoin="round"/></svg>';

// Wrapped, so a page's timers are called as functions and never as methods of another object.
const PAGE_TIMERS = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) };

/** How a seat shows in its slot: 'host', 'taken' (a guest who is there), 'absent', 'ai' (the game's character) or 'empty'. */
function stateOf(seat) {
  if (!seat) return 'empty';
  if (seat.kind === 'host') return 'host';
  if (seat.kind === 'ai' && !seat.covered) return 'ai';
  return seat.present ? 'taken' : 'absent'; // a guest's seat, played by the guest or covered by the computer
}

const hasOwnAi = list => list.some(seat => seat.kind === 'ai' && !seat.covered);

/**
 * The lobby and the waiting card in `root` (#fjolspil). `seats` is seats.js's; `audio` is { sfx(name) }; `timers` holds the
 * waiting card's delay. Returns { show, refresh, hide, isOpen, waitFor, hideWaiting }.
 */
export function createLobby(doc, {
  root = doc.getElementById('fjolspil'), seats, win = globalThis.window, audio = null, timers = PAGE_TIMERS,
  onAddAi = null, onRemoveAi = null, onStart = null, onClose = null, onContinue = null,
} = {}) {
  if (!root) throw new Error('"Fjölspil" needs #fjolspil on the page (see index.html)');
  const make = (tag, className, html = '') => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (tag === 'button') el.type = 'button';
    if (html) el.innerHTML = html;
    return el;
  };
  let isOpen = false;
  let ai = null; // the game's character: { name, avatar, add, remove }, or null when it offers none
  let waiting = null; // the waiting card while it is up: { el, who, seat, name, timer, done }

  /** The QR code and the four letters under it, for a card to hold. */
  function joinBlock() {
    const el = make('div', 'fjolspil-join');
    const qr = make('div', 'fjolspil-qr');
    const letters = make('div', 'fjolspil-code');
    el.append(qr, letters);
    return { el, qr, letters };
  }

  function fillJoin({ qr, letters }, joinUrl, code) {
    qr.innerHTML = qrSvg(`${joinUrl}?r=${code}`);
    letters.setAttribute('aria-label', `Kóðinn ${code}`);
    letters.replaceChildren(...[...code].map(letter => {
      const span = make('span', 'fjolspil-letter');
      span.textContent = letter;
      return span;
    }));
  }

  /** A round picture of an avatar, in its colour; `picture` is the img. */
  function face(className = 'fjolspil-face') {
    const el = make('span', className);
    const picture = make('img', 'fjolspil-picture');
    picture.alt = '';
    el.append(picture);
    return { el, picture };
  }

  // ---- The lobby ------------------------------------------------------------------------------------------------------

  const lobbyEl = make('div', 'fjolspil-lobby');
  const lobbyCard = make('div', 'fjolspil-card');
  const closeEl = make('button', 'fjolspil-close', CROSS);
  closeEl.setAttribute('aria-label', 'Aftur í bókina');
  const titleEl = make('h2', 'fjolspil-title', `<img src="${TITLE_PICTURE}" alt=""><span>Fjölspil</span>`);
  const join = joinBlock();
  const noteEl = make('p', 'fjolspil-note');
  noteEl.textContent = 'Keyrðu þjóninn með --lan svo símar nái í hann.';
  join.el.append(noteEl);
  const tableEl = make('div', 'fjolspil-table');
  const seatsEl = make('div', 'fjolspil-seats');
  seatsEl.setAttribute('aria-label', 'Sætin');
  const slots = Array.from({ length: MAX_SEATS }, () => {
    const el = make('div', 'fjolspil-seat');
    const { el: faceEl, picture } = face();
    const name = make('span', 'fjolspil-name');
    el.append(faceEl, name);
    seatsEl.append(el);
    return { el, face: faceEl, picture, name, src: null, state: null };
  });
  const actionsEl = make('div', 'fjolspil-actions');
  const aiEl = make('button', 'fjolspil-ai');
  const startEl = make('button', 'fjolspil-start', `${PLAY}<span>Byrjum!</span>`);
  actionsEl.append(aiEl, startEl);
  tableEl.append(seatsEl, actionsEl);
  lobbyCard.append(closeEl, titleEl, join.el, tableEl);
  lobbyEl.append(lobbyCard);

  root.classList.add('fjolspil');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Fjölspil');
  root.replaceChildren(lobbyEl);
  root.hidden = true;
  lobbyEl.hidden = true;

  /** The seats as they are now, one per slot; with `arrive`, a slot a guest has just taken sparkles and the tap sounds. */
  function render({ arrive = false } = {}) {
    const list = seats.list();
    let arrived = false;
    slots.forEach((slot, index) => {
      const seat = list[index] ?? null;
      const state = stateOf(seat);
      const avatar = seat ? avatarOf(seat.avatar) : undefined;
      const src = avatar ? asset(avatar.picture) : null;
      slot.el.setAttribute('data-state', state);
      slot.name.textContent = seat ? seat.name : 'Laust';
      if (src && src !== slot.src) slot.picture.src = src; // the same picture is not set again, so it never blinks
      slot.src = src ?? slot.src;
      slot.picture.hidden = !src;
      slot.el.style.setProperty('--c', avatar?.colour ?? 'transparent');
      if (arrive && slot.state === 'empty' && state === 'taken') {
        sparkle(slot.face, undefined, win);
        arrived = true;
      }
      slot.state = state;
    });
    if (arrived) audio?.sfx?.('tap');
    startEl.disabled = list.filter(seat => seat.present).length < 2;
    aiEl.hidden = !ai;
    if (ai) {
      const sits = hasOwnAi(list);
      aiEl.textContent = sits ? ai.remove : ai.add;
      aiEl.disabled = !sits && list.length >= MAX_SEATS; // a full table has no seat for it
      aiEl.setAttribute('data-state', sits ? 'remove' : 'add');
    }
  }

  function hide() {
    isOpen = false;
    lobbyEl.hidden = true;
    root.hidden = !waiting;
  }

  pressable(closeEl, { audio, win, onTap: () => { if (!isOpen) return; hide(); onClose?.(); } });
  pressable(aiEl, {
    audio, win, onTap: () => {
      if (!isOpen || !ai || aiEl.disabled) return;
      if (hasOwnAi(seats.list())) onRemoveAi?.();
      else onAddAi?.();
      render({ arrive: true });
    },
  });
  pressable(startEl, { audio, win, onTap: () => { if (!isOpen || startEl.disabled) return; hide(); onStart?.(); } });

  // ---- The waiting card -------------------------------------------------------------------------------------------------

  /** Shows "Halda áfram án …" on the waiting card that is up. */
  function offerContinue(card) {
    const button = make('button', 'fjolspil-continue');
    button.textContent = `Halda áfram án ${card.name}`;
    pressable(button, {
      audio, win, onTap: () => {
        if (waiting !== card || card.done) return;
        card.done = true;
        onContinue?.(card.seat);
      },
    });
    card.who.append(button);
  }

  function hideWaiting() {
    if (!waiting) return;
    if (waiting.timer !== null) timers.clearTimeout(waiting.timer);
    waiting.el.remove();
    waiting = null;
    lobbyEl.hidden = !isOpen;
    root.hidden = !isOpen;
  }

  return {
    /** Opens the lobby with the room's join address and code, and the game's character (null: no computer player). */
    show({ joinUrl, code, ai: character = null, lanMissing = false }) {
      ai = character;
      fillJoin(join, joinUrl, code);
      noteEl.hidden = !lanMissing;
      const picture = ai && avatarOf(ai.avatar);
      if (picture) aiEl.style.setProperty('--fjolspil-ai-picture', `url("${asset(picture.picture)}")`);
      else aiEl.style.removeProperty('--fjolspil-ai-picture');
      render(); // the seats that are there are simply there: no sparkle
      isOpen = true;
      lobbyEl.hidden = Boolean(waiting);
      root.hidden = false;
    },

    /** Shows the seats again after a change (seats.js's onChange, the host's hello). */
    refresh: () => render({ arrive: isOpen && !waiting }), // a lobby under the waiting card is hidden: nothing to sparkle

    hide,
    get isOpen() { return isOpen; },

    /** The waiting card over the game for `seat`, whose guest has gone; "Halda áfram án …" after COVER_AFTER_MS. */
    waitFor({ seat, joinUrl, code }) {
      hideWaiting();
      const sitting = seats.bySeat(seat);
      const avatar = sitting ? avatarOf(sitting.avatar) : undefined;
      const el = make('div', 'fjolspil-wait');
      const waitCard = make('div', 'fjolspil-wait-card');
      const who = make('div', 'fjolspil-wait-who');
      const { el: faceEl, picture } = face('fjolspil-face fjolspil-wait-face');
      if (avatar) picture.src = asset(avatar.picture);
      picture.hidden = !avatar;
      faceEl.style.setProperty('--c', avatar?.colour ?? 'transparent');
      const words = make('p', 'fjolspil-wait-words');
      const name = sitting?.name ?? '';
      words.textContent = `Bíðum eftir ${name}…`;
      who.append(faceEl, words);
      const block = joinBlock();
      fillJoin(block, joinUrl, code);
      waitCard.append(who, block.el);
      el.append(waitCard);
      const card = { el, who, seat, name, timer: null, done: false };
      waiting = card;
      card.timer = timers.setTimeout(() => {
        card.timer = null;
        if (waiting === card) offerContinue(card);
      }, COVER_AFTER_MS);
      root.append(el);
      lobbyEl.hidden = true;
      root.hidden = false;
    },

    hideWaiting,
  };
}
