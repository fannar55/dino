// The guest's page of "Fjölspil" (spec §4, §8 and §10): what a phone, a tablet or a PC beside the big screen shows, at
// spil.html. One column that fills the screen, upright or sideways: the guest's seat at the top once she has one (her
// avatar and her name), the screen's content in the middle, and a status line at the bottom for what the connection says.
//
// The screens, in the order a guest meets them (spec §4, steps 3 and 5–7):
//   code     the four letters, when the address has no ?r= (a PC, or a scan that failed): four boxes that take a letter
//            each, in any case, go on by themselves, go back with Backspace and fill all four from a paste; then "Áfram"
//   join     "Hvað heitirðu?" (1–12 letters), the six friends to pick from (the ones taken or kept for the game's own
//            character are dim) and "Tilbúin/n", which sends hello { name, avatar }. The phone remembers both
//            (localStorage, mosi-fjolspil-guest, with the guest's id), so the next time one tap is enough
//   lobby    "Þú ert með!" with her avatar and the seats at the table
//   wait     "Bíðum eftir stóra skjánum…": the big screen has gone (or another tab took this seat); the connection tries again
//   closed   "Bíðum eftir næsta leik": the game was closed on the big screen; the next lobby comes by itself
//   over     "{name} vann!" with the winner's avatar
//   game     a game's own screen: views[view.screen](el, view, { send, doc, control, audio }) renders it (Háls og hali and
//            Eitt! register theirs: spil.html passes guest-hals.js's renderHals and guest-eitt.js's renderEitt); `el` is the
//            game's element in the middle of the page, the same one while that game's views follow one another and a new one
//            after any other screen, send(act) sends act { … } to the big screen, control(button, onTap) makes a button of the
//            page's own (the tap, its sound and the keyboard), and audio.effects(options) a game's own effects on the page's
//            audio (Eitt!'s, spec §7.3)
//
// The big screen decides what the page shows: every `view` it sends (spec §6.3) is the whole picture, and one older than
// the last is never shown. The connection is the caller's: `net({ code, guestId, url })` makes it (spil.html passes one
// around net.js's createGuestNet) with onMessage(fn), onStatus(fn), send(msg), reconnect() and close(); without one the
// page only shows (?demo=…, or the join screen and "Tengist…"). It tries again by itself when it comes back into view or
// the network is back, and a guest with a seat (or a hello on its way) says hello again whenever the connection is back,
// so the big screen seats her where she was (spec §6.4). The words for what goes wrong are spec §10's.
//
// Names are text, never markup: they go in with textContent. Every button is the book's (book/fx.js's pressable: the squash,
// the sparkle and the tap sound, from the page's own audio context made at the first touch), and Enter or Space on a focused
// one is a tap too. The tap is the page's only sound but a game's own effects, which a game screen asks for on the same
// context and output (Eitt!'s; never a voice or music, spec §13). The audio rule: no context, and no sound, before the
// page's first touch or key; from then on every touch (its start and its end: an iPhone counts only a finger lifting as the
// gesture) and every key wakes it, and so does every sound asked for (a tap's own, inside it), whenever it is not running
// (suspended, or WebKit's 'interrupted' after a phone lock). The look is spil.css.

import { CODE_ALPHABET, CODE_LENGTH, NAME_MAX, message, normalizeCode, randomKey } from './protocol.js';
import { AVATARS, HOST_AVATAR, avatarOf, cleanName } from './seats.js';
import { pressable } from '../book/fx.js';
import { bookSounds, BOOK_GAPS } from '../book/book-sounds.js';
import { createAudioContext, createOutput } from '../audio/output.js';
import { createGameSfx } from '../audio/game-music.js';
import { makeDeck } from '../eitt/rules.js';

export const STORAGE_KEY = 'mosi-fjolspil-guest';

/** Everything the page says (spec §4 and §10). */
const WORDS = {
  go: 'Áfram',
  ask: 'Hvað heitirðu?',
  ready: 'Tilbúin/n',
  lobby: 'Þú ert með!',
  wait: 'Bíðum eftir stóra skjánum…',
  closed: 'Bíðum eftir næsta leik',
  won: name => `${name} vann!`,
  connecting: 'Tengist…',
  noRoom: 'Þessi kóði er ekki í gangi',
  ended: 'Leiknum er lokið', // the room this page had a seat in has expired (spec §6.4)
  full: 'Borðið er fullt (4)',
  offline: 'Ekkert net',
  taken: 'Þessi var tekinn, veldu annan',
  noName: 'Skrifaðu nafnið þitt',
};

const REMAKE = new URL('../../', import.meta.url);
const asset = path => new URL(path, REMAKE).href;
const TITLE_PICTURE = asset('assets/book/images/mosi-kambedla-render-thumb.webp'); // two friends playing together, as on the lobby
const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h13M12 5.5l6.5 6.5-6.5 6.5" stroke="#3b2f25" stroke-width="6.6"/><path d="M4 12h13M12 5.5l6.5 6.5-6.5 6.5" stroke="#fffaf0" stroke-width="3"/></g></svg>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5l12 7.5-12 7.5z" fill="#fffaf0" stroke="#3b2f25" stroke-width="2.6" stroke-linejoin="round"/></svg>';
const COLUMNS = 3; // the avatar grid's, for the arrow keys

// The demo pages for the look (?demo=…): fixed views, no connection. Ásta, for an accented capital.
const ASTA = { seat: 1, name: 'Ásta', avatar: 'kambedla' };
const EGILL = { seat: 0, name: 'Egill', avatar: 'egill' };
const BJARNI = { seat: 2, name: 'Bjarni', avatar: 'gramedla' };
const DEMOS = {
  code: { typed: 'GU' },
  join: { name: 'Ásta', avatar: 'kambedla', view: { screen: 'lobby', seats: [EGILL, { ...BJARNI, seat: 1 }], available: ['kambedla', 'sloedla', 'flugedla', 'uggedla'], you: null } },
  lobby: { seat: ASTA, view: { screen: 'lobby', seats: [EGILL, ASTA, BJARNI], available: ['sloedla', 'flugedla', 'uggedla'], you: 1 } },
  wait: { seat: ASTA, view: { screen: 'wait', reason: 'host-gone' } },
  closed: { seat: ASTA, view: { screen: 'closed' } },
  over: { seat: ASTA, view: { screen: 'over', winner: { name: 'Ásta', avatar: 'kambedla' } } },
  // Háls og hali's die, Ásta's turn: Egill rolled a five before her, and Þórseðla plays too (spil.html registers renderHals)
  hals: { seat: ASTA, view: { screen: 'hals', you: 1, turn: 1, canRoll: true, roll: { value: 5, by: 0 }, winner: null, players: [
    { ...EGILL, square: 23 }, { ...ASTA, square: 17 }, { seat: 2, name: 'Þórseðla', avatar: 'thorsedla', square: 41 },
  ] } },
  // Eitt!, Ásta's turn among three: five cards, the blue four and the wild playable, Egill and Bjarni's fans at the top
  // (spil.html registers renderEitt)
  eitt: { seat: ASTA, view: {
    screen: 'eitt', you: 1, turn: 1, direction: 1, colour: 'blue', top: cardOf('blue-7-a'), lastPlay: { seat: 0, cardId: 'blue-7-a' },
    hand: ['red-2-a', 'yellow-skip-a', 'blue-4-a', 'green-9-a', 'wild-a'].map(cardOf), playable: ['blue-4-a', 'wild-a'],
    canDraw: false, canPass: false, needsColour: null, eittNeeded: false, canCatch: null, winner: null,
    counts: [{ ...EGILL, cards: 4 }, { ...ASTA, cards: 5 }, { ...BJARNI, cards: 6 }],
  } },
};

/** A card of the deck by its id, for the demo's Eitt! view. */
function cardOf(id) {
  return makeDeck().find(card => card.id === id);
}

/** The window's localStorage, or null where the browser will not give it (a private window can throw on the getter). */
function localStorageOf(win) {
  try {
    return win?.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The page as the guest's tab keeps it: { guestId, name, avatar }, with an id made once (randomKey) when it had none. */
function readGuest(storage, crypto) {
  let saved = null;
  try {
    saved = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    saved = null;
  }
  const guestId = typeof saved?.guestId === 'string' && /^[0-9a-f]{32}$/.test(saved.guestId) ? saved.guestId : null;
  return {
    guestId: guestId ?? randomKey(crypto),
    name: cleanName(saved?.name),
    avatar: AVATARS.some(a => a.id === saved?.avatar) ? saved.avatar : null,
    fresh: guestId === null,
  };
}

/**
 * The guest's page in `doc`'s #spil. `params` is the address's query (?r=GULL connects at once, ?demo=… shows a sample),
 * `net` makes the connection to a room ({ code, guestId, url: serverUrl } → net), `views` the games' phone screens by name.
 * Returns { screen, state, connect(code), submit(), send(act), onStatus(status), onView(view) }; `state` is the last view.
 */
export function createGuestPage(doc, {
  win = globalThis.window, storage = localStorageOf(win), params = new URLSearchParams(win?.location?.search ?? ''),
  net = null, serverUrl = null, views = {},
} = {}) {
  const root = doc.getElementById('spil');
  if (!root) throw new Error('The guest page of "Fjölspil" needs #spil (see spil.html)');
  const demo = params.get('demo');
  const keep = demo === null ? storage : null; // a demo neither reads nor writes what the phone remembers
  const guest = readGuest(keep, win?.crypto ?? globalThis.crypto);
  if (guest.fresh) save();

  const at = {
    screen: null, // what shows now: 'code', 'join', 'lobby', 'wait', 'closed', 'over' or 'game'
    state: null, // the last view shown (its body)
    lastSeq: 0, // the last view's seq: an older one is never shown
    seat: null, // { seat, name, avatar } once the big screen has given this page a seat
    available: null, // the avatar ids free, from the last lobby view; null until one has come (then none is dim)
    taken: new Set(), // avatars refused since that view (avatar-taken)
    chosen: guest.avatar, // the avatar picked on the join screen
    pending: null, // the hello sent, { name, avatar }, until its seat comes back
    hadSeat: false, // a seat in this room: its no-room is the end of the game, not a wrong code
    connection: null, // the room's, from net({ code, guestId, url })
    game: null, // which game's screen `gameEl` holds
    said: { text: '', kind: null }, // the status line: 'net' (the connection's) or 'page' (the guest's own doing)
  };

  function save() {
    try {
      keep?.setItem(STORAGE_KEY, JSON.stringify({ guestId: guest.guestId, name: guest.name, avatar: guest.avatar }));
    } catch {
      // storage is full or forbidden: the page still works, it only forgets
    }
  }

  // ---- Sound: the book's tap, from the page's own audio context, made at the first touch (browsers wait for one) --------

  let context;
  let output = null;
  let effects = null;
  const games = new Map(); // a game's own effects, by its sounds, on the same context and output
  let woken = false; // the page's first touch (or key) has come: the audio context is made only from one
  /** The page's audio, made at the first touch and resumed whenever it is not running (a sound asked for inside a tap). */
  function wake() {
    woken = true;
    if (!effects) {
      context = createAudioContext();
      output = context ? createOutput(context) : null;
      effects = createGameSfx({ context, output, sounds: bookSounds, gaps: BOOK_GAPS });
    }
    if (context && context.state !== 'running' && context.state !== 'closed') context.resume?.()?.catch?.(() => {});
  }
  const audio = {
    sfx: name => { wake(); return effects.play(name); },
    /**
     * A game screen's own effects (createGameSfx's music, sounds and gaps), made once on the page's context and output; null
     * before the page's first touch, so a sound asked for then (a card landing from another's move) is skipped, silently.
     */
    effects(options) {
      if (!woken) return null;
      wake(); // a sound asked for inside a tap wakes the context a phone lock put to sleep (it is made already: this resumes)
      if (!games.has(options.sounds)) games.set(options.sounds, createGameSfx({ ...options, context, output }));
      return games.get(options.sounds);
    },
  };
  // Every touch's start and its end (an iPhone's gesture is the end, and it ends on the control before its tap sound plays)
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) doc.addEventListener?.(type, wake, { capture: true });

  // ---- Building blocks ---------------------------------------------------------------------------------------------

  const make = (tag, className, text = '') => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (tag === 'button') el.type = 'button';
    if (text) el.textContent = text;
    return el;
  };

  /** A button of the book: a tap through pressable, and Enter or Space on it when focused (the keyboard's click). */
  function control(el, onTap) {
    pressable(el, { audio, win, onTap: event => { if (!el.disabled) onTap(event); } });
    el.addEventListener('click', event => {
      if (event.detail !== 0 || el.disabled) return; // a pointer's click is pressable's already
      audio.sfx('tap');
      onTap(event);
    });
  }

  /** A round picture of an avatar in its colour; setFace fills it. */
  function face(className) {
    const el = make('span', `spil-face ${className}`);
    const picture = make('img', 'spil-picture');
    picture.alt = '';
    el.append(picture);
    return { el, picture };
  }
  function setFace({ el, picture }, id) {
    const avatar = avatarOf(id);
    const src = avatar ? asset(avatar.picture) : null;
    if (src && picture.src !== src) picture.src = src; // never an empty src, which a browser would read as the page
    picture.hidden = !avatar;
    el.style.setProperty('--c', avatar?.colour ?? 'transparent');
  }

  /** The status line: what the connection says ('net') or what the guest should do ('page'); '' clears it. */
  function say(text, kind = null) {
    at.said = { text, kind: text ? kind : null };
    statusEl.textContent = text;
  }
  function unsay(kind) {
    if (at.said.kind === kind) say('');
  }

  /** A little shake for a part of the screen that wants the guest's attention (spil.css: .nope). */
  function nudge(el) {
    el.classList.remove('nope');
    void el.offsetWidth; // the shake starts again
    el.classList.add('nope');
  }

  // ---- The page: the seat at the top, the screen in the middle, the status line at the bottom ------------------------

  root.classList.add('spil');
  const pageEl = make('main', 'spil-page');
  const meEl = make('header', 'spil-me');
  const meFace = face('spil-me-face');
  const meName = make('span', 'spil-me-name');
  meEl.append(meFace.el, meName);
  meEl.hidden = true;
  const mainEl = make('div', 'spil-main');
  const statusEl = make('p', 'spil-status');
  statusEl.setAttribute('role', 'status');
  statusEl.setAttribute('aria-live', 'polite');
  pageEl.append(meEl, mainEl, statusEl);
  root.replaceChildren(pageEl);

  function showSeat() {
    meEl.hidden = !at.seat;
    if (!at.seat) return;
    setFace(meFace, at.seat.avatar);
    meName.textContent = at.seat.name;
  }

  function seatAs(entry) {
    at.seat = { seat: entry.seat, name: entry.name, avatar: entry.avatar };
    at.hadSeat = true;
    showSeat();
  }

  // ---- code: the four letters ---------------------------------------------------------------------------------------

  const codeEl = make('section', 'spil-screen spil-code');
  const titleEl = make('h1', 'spil-title');
  titleEl.innerHTML = `<img src="${TITLE_PICTURE}" alt=""><span>Fjölspil</span>`;
  const digitsEl = make('div', 'spil-digits');
  digitsEl.setAttribute('role', 'group');
  digitsEl.setAttribute('aria-label', 'Kóðinn');
  const was = Array(CODE_LENGTH).fill(''); // each box's letter before the last input, to tell the new one apart
  const digits = Array.from({ length: CODE_LENGTH }, (_, index) => {
    const el = make('input', 'spil-digit');
    el.type = 'text';
    for (const [name, value] of Object.entries({
      inputmode: 'text', autocapitalize: 'characters', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false',
      enterkeyhint: index === CODE_LENGTH - 1 ? 'go' : 'next', placeholder: ' ', 'aria-label': `Stafur ${index + 1} af ${CODE_LENGTH}`,
    })) el.setAttribute(name, value);
    digitsEl.append(el);
    return el;
  });
  const goEl = make('button', 'spil-go spil-big');
  goEl.innerHTML = `<span>${WORDS.go}</span>${ARROW}`;
  codeEl.append(titleEl, digitsEl, goEl);

  const letters = text => [...String(text ?? '').toUpperCase()].filter(letter => CODE_ALPHABET.includes(letter));
  const typed = () => digits.map(el => el.value).join('');
  const firstEmpty = () => digits.find(el => !el.value) ?? digits[CODE_LENGTH - 1];
  function setLetter(index, letter) {
    digits[index].value = letter;
    was[index] = letter;
  }
  function fillCode(text, from = 0) {
    letters(text).slice(0, CODE_LENGTH - from).forEach((letter, k) => setLetter(from + k, letter));
  }
  function clearCode() {
    digits.forEach((_, index) => setLetter(index, ''));
  }

  digits.forEach((el, index) => {
    el.addEventListener('focus', () => el.select?.()); // a letter typed in a full box takes its place
    el.addEventListener('input', () => {
      const got = letters(el.value);
      unsay('page');
      if (got.length <= 1) setLetter(index, got[0] ?? '');
      else if (got.length === 2 && got.includes(was[index])) setLetter(index, got[0] === was[index] ? got[1] : got[0]);
      else fillCode(got.join(''), got.length >= CODE_LENGTH ? 0 : index); // a phone's suggestion, or the whole code at once
      if (el.value) (got.length > 1 ? firstEmpty() : digits[index + 1])?.focus?.();
    });
    el.addEventListener('paste', event => {
      const got = letters(event.clipboardData?.getData?.('text'));
      if (got.length === 0) return;
      event.preventDefault();
      fillCode(got.join(''), got.length >= CODE_LENGTH ? 0 : index);
      unsay('page');
      firstEmpty().focus?.();
    });
    el.addEventListener('keydown', event => {
      if (event.key === 'Backspace' && !el.value && index > 0) {
        event.preventDefault();
        setLetter(index - 1, '');
        digits[index - 1].focus?.();
      } else if (event.key === 'ArrowLeft' && index > 0) {
        event.preventDefault();
        digits[index - 1].focus?.();
      } else if (event.key === 'ArrowRight' && index < CODE_LENGTH - 1) {
        event.preventDefault();
        digits[index + 1].focus?.();
      } else if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        go();
      }
    });
  });

  function go() {
    if (!connect(typed())) {
      firstEmpty().focus?.();
      nudge(digitsEl);
    }
  }
  control(goEl, go);

  // ---- join: the name and the avatar --------------------------------------------------------------------------------

  const joinEl = make('section', 'spil-screen spil-join');
  const askEl = make('label', 'spil-ask', WORDS.ask);
  const nameEl = make('input', 'spil-name');
  nameEl.type = 'text';
  nameEl.id = 'spil-name';
  askEl.htmlFor = 'spil-name';
  for (const [name, value] of Object.entries({
    maxlength: String(NAME_MAX), autocomplete: 'nickname', autocapitalize: 'words', autocorrect: 'off', spellcheck: 'false',
    enterkeyhint: 'done',
  })) nameEl.setAttribute(name, value);
  nameEl.value = guest.name ?? '';
  const avatarsEl = make('div', 'spil-avatars');
  avatarsEl.setAttribute('role', 'group');
  avatarsEl.setAttribute('aria-label', 'Veldu vin');
  const avatarButtons = AVATARS.map((avatar, index) => {
    const el = make('button', 'spil-avatar');
    el.setAttribute('data-id', avatar.id);
    el.setAttribute('aria-label', avatar.name);
    el.setAttribute('aria-pressed', 'false');
    const look = face('spil-avatar-face');
    setFace(look, avatar.id);
    el.append(look.el);
    control(el, () => choose(avatar.id));
    el.addEventListener('keydown', event => {
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -COLUMNS, ArrowDown: COLUMNS }[event.key];
      if (!step) return;
      event.preventDefault();
      for (let next = index + step; next >= 0 && next < AVATARS.length; next += step) {
        if (!avatarButtons[next].disabled) return avatarButtons[next].focus?.();
      }
    });
    return el;
  });
  avatarsEl.append(...avatarButtons);
  for (const el of [avatarsEl, digitsEl]) { // the shake is over (not a tick's pop inside it)
    el.addEventListener('animationend', event => { if (event.target === el) el.classList.remove('nope'); });
  }
  const readyEl = make('button', 'spil-ready spil-big');
  readyEl.innerHTML = `${PLAY}<span>${WORDS.ready}</span>`;
  joinEl.append(askEl, nameEl, avatarsEl, readyEl);

  /** May this avatar be picked now? Not one refused, and once a lobby has come, only one it says is free (or her own). */
  function free(id) {
    if (at.taken.has(id)) return false;
    return at.available === null || at.available.includes(id) || id === at.seat?.avatar;
  }
  function renderAvatars() {
    if (at.chosen && !free(at.chosen)) at.chosen = null;
    avatarButtons.forEach((el, index) => {
      const { id } = AVATARS[index];
      el.disabled = !free(id);
      el.setAttribute('aria-pressed', String(id === at.chosen));
    });
  }
  function choose(id) {
    if (!free(id)) return;
    at.chosen = id;
    unsay('page');
    renderAvatars();
  }

  nameEl.addEventListener('input', () => unsay('page'));
  nameEl.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    submit();
  });
  control(readyEl, () => submit());

  /** "Tilbúin/n": hello { name, avatar } to the big screen; false (and a word or a shake) while either is missing. */
  function submit() {
    const name = cleanName(nameEl.value);
    if (name === null) {
      nameEl.focus?.();
      say(WORDS.noName, 'page');
      return false;
    }
    nameEl.value = name;
    if (!at.chosen || !free(at.chosen)) {
      nudge(avatarsEl);
      avatarButtons.find(el => !el.disabled)?.focus?.();
      return false;
    }
    at.pending = { name, avatar: at.chosen };
    at.connection?.send?.(message('hello', at.pending));
    return true;
  }

  // ---- lobby, wait, closed, over ------------------------------------------------------------------------------------

  const lobbyEl = make('section', 'spil-screen spil-lobby');
  const heroFace = face('spil-hero');
  const lobbyWords = make('h2', 'spil-words', WORDS.lobby);
  const seatsEl = make('ul', 'spil-seats');
  seatsEl.setAttribute('aria-label', 'Við borðið');
  lobbyEl.append(heroFace.el, lobbyWords, seatsEl);

  function renderLobby(view) {
    setFace(heroFace, at.seat.avatar);
    seatsEl.replaceChildren(...(Array.isArray(view.seats) ? view.seats : []).map(entry => {
      const el = make('li', entry.seat === at.seat.seat ? 'spil-seat mine' : 'spil-seat');
      if (entry.present === false) el.classList.add('absent');
      const look = face('spil-seat-face');
      setFace(look, entry.avatar);
      el.append(look.el, make('span', 'spil-seat-name', String(entry.name ?? '')));
      return el;
    }));
  }

  /** A screen of a picture and a few words: the waits and the end. */
  function note(className, picture, words) {
    const el = make('section', `spil-screen spil-note ${className}`);
    const wordsEl = make('h2', 'spil-words', words);
    el.append(picture, wordsEl);
    return { el, words: wordsEl };
  }
  const waitFace = face('spil-note-face');
  setFace(waitFace, HOST_AVATAR.id); // Mosi, for the big screen
  const wait = note('spil-wait', waitFace.el, WORDS.wait);
  const closedPicture = make('img', 'spil-note-picture');
  closedPicture.src = TITLE_PICTURE;
  closedPicture.alt = '';
  const closed = note('spil-closed', closedPicture, WORDS.closed);
  const winnerFace = face('spil-hero spil-winner');
  const burst = make('span', 'spil-burst'); // a gold burst behind the winner
  burst.append(winnerFace.el);
  const over = note('spil-over', burst, '');

  function renderOver(view) {
    const winner = view.winner ?? {};
    setFace(winnerFace, winner.avatar);
    over.words.textContent = WORDS.won(String(winner.name ?? ''));
  }

  const screens = { code: codeEl, join: joinEl, lobby: lobbyEl, wait: wait.el, closed: closed.el, over: over.el };
  let gameEl = null;

  function show(screen) {
    const el = screen === 'game' ? gameEl : screens[screen];
    at.screen = screen;
    root.setAttribute('data-screen', screen);
    if (mainEl.children[0] !== el) mainEl.replaceChildren(el);
    if (screen === 'code') firstEmpty().focus?.();
  }

  // ---- What comes from the big screen -------------------------------------------------------------------------------

  /** A view (the envelope, { seq, body }): shown when it is newer than the last, on its screen or its game's. */
  function onView(envelope) {
    const view = envelope?.body;
    const seq = envelope?.seq;
    if (typeof seq !== 'number' || !(seq > at.lastSeq) || typeof view?.screen !== 'string') return;
    const own = ['lobby', 'wait', 'closed', 'over'].includes(view.screen);
    const render = own ? null : views[view.screen];
    if (!own && typeof render !== 'function') return; // a game this page has no screen for
    at.lastSeq = seq;
    at.state = view;
    if (view.screen === 'lobby') return lobby(view);
    if (view.screen === 'over') renderOver(view);
    if (own) return show(view.screen);
    if (at.screen !== 'game' || at.game !== view.screen) {
      gameEl = make('section', 'spil-screen spil-game');
      gameEl.setAttribute('data-game', view.screen);
      at.game = view.screen;
    }
    unsay('page');
    show('game');
    render(gameEl, view, { send, doc, control, audio });
  }

  /** The lobby: her place at the table when it says she has one (`you`); otherwise the join screen, with the free avatars. */
  function lobby(view) {
    const you = typeof view.you === 'number' && Array.isArray(view.seats) ? view.seats.find(entry => entry.seat === view.you) : null;
    if (you) seatAs(you);
    else at.seat = null; // never seated, or dropped at "Byrjum!" while away: one tap seats her again
    showSeat();
    at.available = Array.isArray(view.available) ? [...view.available] : [];
    at.taken.clear(); // the big screen's word is newer than any refusal
    renderAvatars();
    if (at.seat) {
      renderLobby(view);
      unsay('page');
      show('lobby');
    } else if (at.screen !== 'join') {
      show('join');
    }
  }

  /** The big screen's answer to hello: a seat, or why not (spec §10). */
  function onSeat(body) {
    const sent = at.pending;
    at.pending = null;
    if (body.ok) {
      if (!sent) { // her seat, told to a page that said no hello (a fresh one): the big screen's name for it ("Anna 2")
        seatAs({ seat: body.seat, name: typeof body.name === 'string' ? body.name : guest.name, avatar: guest.avatar });
        unsay('page');
        return; // what she typed stays what the phone remembers
      }
      const { name, avatar } = sent;
      seatAs({ seat: body.seat, name, avatar });
      guest.name = name;
      guest.avatar = avatar;
      save();
      unsay('page');
      return; // the lobby's view, with her in it, comes next
    }
    if (body.reason === 'full') return say(WORDS.full, 'page');
    show('join');
    if (body.reason === 'bad-name') {
      nameEl.focus?.();
      return say(WORDS.noName, 'page');
    }
    // 'avatar-taken' (someone was quicker), or one not on offer: choose another
    const refused = sent?.avatar ?? at.chosen;
    if (refused) at.taken.add(refused);
    renderAvatars();
    say(WORDS.taken, 'page');
  }

  function onMessage(msg) {
    if (msg?.v !== 1) return;
    unsay('net'); // the big screen is there
    if (msg.type === 'view') onView(msg);
    else if (msg.type === 'seat') onSeat(msg.body ?? {});
  }

  /** What the connection says about itself (net.js): the words of spec §10. */
  function onStatus(status) {
    switch (status) {
      case 'connecting': // a new socket: nothing of the old one comes after this, and the big screen may have reloaded
        at.lastSeq = 0; // a reloaded one counts its views afresh, from its clock (a reconnect gets the newest view, spec §6.4)
        return say(WORDS.connecting, 'net');
      case 'offline': return say(WORDS.offline, 'net');
      case 'full': return say(WORDS.full, 'page');
      case 'no-host': case 'host-gone': // a big screen that comes back counts its views afresh
        at.lastSeq = 0;
      // falls through
      case 'replaced': // this guest's id connected from another tab, which has the seat now
        unsay('net');
        return show('wait');
      case 'no-room': {
        const words = at.hadSeat ? WORDS.ended : WORDS.noRoom;
        if (at.hadSeat) clearCode(); // a new game has a new code
        at.connection?.close?.();
        at.connection = null;
        at.seat = null;
        showSeat();
        show('code');
        return say(words, 'page');
      }
      case 'connected': // the socket is open (again), or the big screen is back: a seat had or asked for is asked for again
        unsay('net');
        if (at.hadSeat || at.pending) submit(); // spec §6.4: hello again, and her seat and the newest view come back
        return;
      default: return unsay('net'); // nothing to say
    }
  }

  // ---- The connection -----------------------------------------------------------------------------------------------

  /** Goes into the room with this code (any case); false when it is not four of the code's letters. */
  function connect(text) {
    const code = normalizeCode(text);
    if (!code) return false;
    at.connection?.close?.();
    Object.assign(at, { connection: null, state: null, lastSeq: 0, seat: null, available: null, pending: null, hadSeat: false });
    at.taken.clear();
    clearCode();
    fillCode(code);
    showSeat();
    renderAvatars();
    show('join');
    say(WORDS.connecting, 'net');
    if (!net) return true; // no connection to make: the join screen, and "Tengist…"
    const connection = net({ code, guestId: guest.guestId, url: serverUrl });
    at.connection = connection;
    connection?.onMessage?.(msg => { if (at.connection === connection) onMessage(msg); });
    connection?.onStatus?.(status => { if (at.connection === connection) onStatus(status); });
    return true;
  }

  /** An act { … } of a game to the big screen (its view comes back). */
  function send(act) {
    return at.connection?.send?.(message('act', act)) ?? false;
  }

  // The phone wakes, the tab comes to the front or the network is back: try again now, not at the end of a wait (spec
  // §6.4). visibilitychange is the document's, and comes up to the window.
  win?.addEventListener?.('visibilitychange', () => { if (doc.visibilityState !== 'hidden') at.connection?.reconnect?.(); });
  win?.addEventListener?.('online', () => at.connection?.reconnect?.());

  // ---- The start: a demo, the room in the address, or the code to type -------------------------------------------------

  renderAvatars();
  if (demo !== null) showDemo(DEMOS[demo] ?? DEMOS.code);
  else if (!connect(params.get('r') ?? '')) show('code');

  function showDemo(sample) {
    if (sample.typed) fillCode(sample.typed);
    if (sample.seat) seatAs(sample.seat);
    if (sample.name) nameEl.value = sample.name;
    if (sample.avatar) at.chosen = sample.avatar;
    renderAvatars();
    if (sample.view) onView(message('view', sample.view, { seq: 1 }));
    else show('code');
    if (sample.typed) digits.forEach(el => el.blur?.()); // the boxes as they look, not a caret
    settle().then(() => { if (win) win.__demoReady = true; });
  }

  /** For a capture: the fonts and the pictures in, and the screen's entrance over (it is under half a second). */
  async function settle() {
    const pictures = [...(pageEl.querySelectorAll?.('img') ?? [])].filter(img => img.src && !img.hidden);
    await Promise.all([doc.fonts?.ready, ...pictures.map(img => img.decode?.().catch(() => {}))]);
    await new Promise(resolve => setTimeout(resolve, 700));
  }

  return {
    get screen() { return at.screen; },
    get state() { return at.state; },
    connect,
    submit,
    send,
    onStatus,
    onView,
  };
}
