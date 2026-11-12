// The guest's page of "Fjölspil" (spec §4, §8 and §10): what a phone, a tablet or a PC beside the big screen shows, at
// spil.html. One column that fills the screen, upright or sideways: the guest's seat at the top once she has one (her
// avatar and her name), the screen's content in the middle, and a status line at the bottom for what the connection says.
//
// The screens, in the order a guest meets them (spec §4, steps 3 and 5–7):
//   code     the four letters, when the address has no ?r= (a PC, or a scan that failed): four boxes that take a letter
//            each, in any case, go on by themselves, go back with Backspace and fill all four from a paste; then "Áfram"
//   join     "Hvað heitirðu?" (1–12 letters), the six friends to pick from (the ones taken or kept for the game's own
//            character are dim) and "Tilbúin/n", which sends hello { name, avatar }. The phone remembers both
//            (localStorage, mosi-fjolspil-guest, with the guest's id), so the next time one tap is enough. In a lobby that
//            wants Egill on a device of his own (Veiddu's: the view says host: 'free') Egill's portrait comes first, "Ég er
//            Egill": one tap, no name typed, hello { name: 'Egill', avatar: 'egill' } binds this phone to his seat 0. Söngur
//            Slóeðlu's lobby view says which friends are on offer (`offer`: the others are not shown; with none of
//            them free, "Allar eðlurnar eru í notkun") and asks "Krakki eða fullorðinn?" (`ask: 'level'`): one of the
//            two is needed before the hello, which carries it as `level`, and the phone remembers it too
//   lobby    "Þú ert með!" with her avatar and the seats at the table; in a song lobby the big screen's `note` (the song
//            Egill picks) and her level to change (act { type: 'level', level })
//   wait     "Bíðum eftir stóra skjánum…": the big screen has gone; the connection tries again, and while its socket is open
//            a seated page says hello again every ASK_EVERY_MS, ASK_TIMES times, until a seat or a view comes. When
//            another tab took this seat (replaced) nothing is tried by itself: a second line, "Pikkaðu hér til að taka
//            sætið þitt aftur", reconnects on a tap, and the new socket takes the seat back (the owner's phone test,
//            2026-10-24: a phone sat on this screen until a refresh)
//   closed   "Bíðum eftir næsta leik": the game was closed on the big screen; the next lobby comes by itself
//   over     "{name} vann!" with the winner's avatar
//   game     a game's own screen: views[view.screen](el, view, { send, doc, control, audio, post, listen }) renders it (Háls og hali,
//            Eitt!, Litla Yatzy, Veiddu and Söngur Slóeðlu register theirs: spil.html passes guest-hals.js's renderHals,
//            guest-eitt.js's renderEitt, guest-yatzy.js's renderYatzy, guest-veiddu.js's renderVeiddu and guest-sloedla.js's
//            renderSloedla); `el` is the
//            game's element in the middle of the page, the same one while that game's views follow one another and a new one
//            after any other screen, send(act) sends act { … } to the big screen, control(button, onTap) makes a button of the
//            page's own (the tap, its sound and the keyboard), and audio.effects(options) a game's own effects on the page's
//            audio (Eitt!'s, spec §7.3). A game's view with `paused: true` (the big screen is paused) says so in the
//            status line, "Stóri skjárinn er í hléi", until a view of any screen comes without it or the big screen goes.
//            Söngur Slóeðlu's screen talks more than views: post(type, body) sends a message of its own (time, taps) and
//            listen(type, fn) hears the big screen's messages that are not views or seats (song, time) until the screen
//            changes
//
// The big screen decides what the page shows: every `view` it sends (spec §6.3) is the whole picture, and one older than
// the last is never shown. The connection is the caller's: `net({ code, guestId, url })` makes it (spil.html passes one
// around net.js's createGuestNet) with onMessage(fn), onStatus(fn), send(msg), reconnect() and close(); without one the
// page only shows (?demo=…, or the join screen and "Tengist…"). It tries again by itself when it comes back into view or
// the network is back, and a guest with a seat (or a hello on its way) says hello again whenever the connection is back,
// so the big screen seats her where she was (spec §6.4). A seat's hello again is the seat's own name and avatar, never the
// join screen's checks (its name field, or a lobby's free avatars, which a game leaves stale): the big screen keeps a known
// guest's seat and never refuses her own avatar (seats.join), and a hello that reaches it always brings her seat and her
// newest view back. The words for what goes wrong are spec §10's. With ?debug=1 a small line at the paper's foot, outside
// the status line (which keeps its empty look) and hidden from screen readers, shows [status · transport · seconds since
// the big screen was last heard · seat], every second (for the owner's tests).
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
import { keepScreenAwake } from '../wake-lock.js';

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
  retake: 'Pikkaðu hér til að taka sætið þitt aftur', // under "Bíðum eftir stóra skjánum…" when another tab took the seat
  paused: 'Stóri skjárinn er í hléi', // a game's view while the big screen is paused (Litla Yatzy's junior page, 2026-10-24)
  egill: 'Ég er Egill', // Egill's portrait on the join screen, when the game wants him on a device of his own
  or: 'eða',
  levelAsk: 'Krakki eða fullorðinn?', // Söngur Slóeðlu's lobby (ask: 'level'): the guest's level, the same song for all
  kid: 'Krakki',
  grown: 'Fullorðinn',
  none: 'Allar eðlurnar eru í notkun', // a song lobby whose dinosaurs are all taken
};

/** Söngur Slóeðlu's levels, as the level row offers them: the child's chart or the grown-ups' (a face for those who read little). */
const LEVEL_CHOICES = [['barn', '🧒', WORDS.kid], ['fullordinn', '🧑', WORDS.grown]];
const isLevel = level => LEVEL_CHOICES.some(([id]) => id === level);

/** A note's picture from the big screen: a file of the game's own under remake/assets/, nothing else. */
export const SAFE_PICTURE = /^assets\/[\w-]+(\/[\w.-]+)*\.(webp|png|jpg|svg)$/;

/** How often, and how many times, the wait screen says hello again while its socket is open: for two minutes. */
export const ASK_EVERY_MS = 5000;
export const ASK_TIMES = 24;

// Wrapped, so the page's timers are called as functions and never as methods of another object.
const PAGE_TIMERS = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: id => clearTimeout(id) };

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
  joinhost: { name: '', avatar: null, view: { screen: 'lobby', host: 'free', seats: [{ ...EGILL, present: false }, { ...BJARNI, seat: 1 }], available: ['kambedla', 'sloedla', 'flugedla', 'uggedla'], you: null } },
  lobbyhost: { seat: EGILL, view: { screen: 'lobby', host: 'mine', seats: [EGILL, { seat: 1, name: 'Anna', avatar: 'kambedla' }], available: ['sloedla', 'gramedla', 'flugedla'], you: 0 } },
  join: { name: 'Ásta', avatar: 'kambedla', view: { screen: 'lobby', seats: [EGILL, { ...BJARNI, seat: 1 }], available: ['kambedla', 'sloedla', 'flugedla', 'uggedla'], you: null } },
  lobby: { seat: ASTA, view: { screen: 'lobby', seats: [EGILL, ASTA, BJARNI], available: ['sloedla', 'flugedla', 'uggedla'], you: 1 } },
  // Söngur Slóeðlu's join screen: Egill plays Slóeðla, Kambeðla and Þórseðla are on offer, and the level is asked
  saman: { name: 'Ásta', avatar: 'kambedla', view: {
    screen: 'lobby', seats: [EGILL], available: ['kambedla', 'thorsedla'], you: null, offer: ['kambedla', 'thorsedla'], ask: 'level',
  } },
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
  // Veiddu, Ásta's own turn among three: seven cards in her hand, Egill's, Bjarni's and her own catch laid (spil.html registers renderVeiddu);
  // -give: Bjarni asks her for the frog she holds, -no: he asks for a snail she has not got, -fish: she was told no and the pond calls
  veiddu: { seat: ASTA, view: veidduDemo('ask') },
  'veiddu-give': { seat: ASTA, view: veidduDemo('give') },
  'veiddu-no': { seat: ASTA, view: veidduDemo('no') },
  'veiddu-fish': { seat: ASTA, view: veidduDemo('fish') },
  veiddu4: { seat: ASTA, view: veidduDemo('ask', 4) }, // four at the table: three others
  // Litla Yatzy, Ásta's own turn after one roll: two threes held, the cup offering a roll again and a pair worth six, Egill,
  // Bjarni and Mosi at the table too (spil.html registers renderYatzy)
  yatzy: { seat: ASTA, view: {
    screen: 'yatzy', you: 1, turn: 1, round: 2, rolls: 1, dice: [3, 3, 1, 5, 6], held: [true, true, false, false, false],
    roll: { seq: 1, by: 1 }, canRoll: true, canHold: true, canScore: true,
    cards: [
      { id: 'pair', label: 'Eitt par', score: null, preview: 6, faces: [3, 3] },
      { id: 'twoPairs', label: 'Tvö pör', score: null, preview: 0, faces: [] },
      { id: 'threeKind', label: 'Þrír eins', score: null, preview: 0, faces: [] },
      { id: 'smallStraight', label: 'Röð', score: null, preview: 0, faces: [] },
      { id: 'yatzy', label: 'Yatzy', score: null, preview: 0, faces: [] },
    ],
    players: [{ ...EGILL, total: 23 }, { ...ASTA, total: 15 }, { ...BJARNI, total: 9 }, { seat: 3, name: 'Mosi', avatar: 'mosi', total: 12 }],
    winner: null,
  } },
};

/** Veiddu's demo views for ?demo=veiddu…: Ásta (seat 1) among Egill (0) and Bjarni (2), and `mode` what she does now. */
function veidduDemo(mode, seats = 3) {
  const card = id => ({ id, kind: id.replace(/-\d+$/, '') });
  const ask = { type: 'ask', seat: 2, target: 1, kind: 'froskur' };
  return {
    screen: 'veiddu', seat: 1, hand: ['froskur-1', 'skjaldbaka-2', 'salamandra-1', 'fiskur-gulur-1', 'snigill-1', 'fiskur-blar-1', 'drekafluga-1'].map(card),
    counts: [5, 7, 6, 4].slice(0, seats), catches: [['brunnklukka'], ['vatnalaesingi', 'fiskur-raudur'], ['fiskur-graenn'], []].slice(0, seats), pond: 23, turn: mode === 'ask' ? 1 : mode === 'fish' ? 1 : 2,
    phase: mode === 'fish' ? 'fish' : 'ask', mode: mode === 'ask' ? 'ask' : mode === 'fish' ? 'fish' : mode,
    asked: mode === 'give' ? { from: 2, to: 1, kind: 'froskur', no: false } : mode === 'no' ? { from: 2, to: 1, kind: 'snigill', no: false } : mode === 'fish' ? { from: 1, to: 0, kind: 'froskur', no: true } : null,
    targets: mode === 'ask' ? [0, 2] : [], lastEvent: mode === 'give' || mode === 'no' ? ask : mode === 'fish' ? { type: 'no', seat: 0, kind: 'froskur' } : { type: 'pair', seat: 0, kind: 'brunnklukka' },
    names: ['Egill', 'Ásta', 'Bjarni', 'Uggeðla'].slice(0, seats), avatars: ['egill', 'kambedla', 'gramedla', 'uggedla'].slice(0, seats), away: [], winners: [],
  };
}

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
    avatar: AVATARS.some(a => a.id === saved?.avatar) || saved?.avatar === HOST_AVATAR.id ? saved.avatar : null, // Egill's phone remembers his portrait
    level: isLevel(saved?.level) ? saved.level : null,
    fresh: guestId === null,
  };
}

/**
 * The guest's page in `doc`'s #spil. `params` is the address's query (?r=GULL connects at once, ?demo=… shows a sample),
 * `net` makes the connection to a room ({ code, guestId, url: serverUrl } → net), `views` the games' phone screens by name;
 * `timers` ({ setTimeout, clearTimeout }) and the clock `now` are the wait screen's hellos' and the ?debug=1 readout's.
 * Returns { screen, state, connect(code), submit(), send(act), onStatus(status), onView(view) }; `state` is the last view.
 */
export function createGuestPage(doc, {
  win = globalThis.window, storage = localStorageOf(win), params = new URLSearchParams(win?.location?.search ?? ''),
  net = null, serverUrl = null, views = {}, timers = PAGE_TIMERS, now = () => Date.now(),
} = {}) {
  const root = doc.getElementById('spil');
  if (!root) throw new Error('The guest page of "Fjölspil" needs #spil (see spil.html)');
  const demo = params.get('demo');
  const debug = params.get('debug') === '1';
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
    chosen: AVATARS.some(a => a.id === guest.avatar) ? guest.avatar : null, // the avatar picked on the join screen (never Egill's: his is its own button)
    host: null, // the lobby's word on Egill's seat: 'free' (a phone may have it), 'mine', 'taken', or null (this game keeps him at the big screen)
    pending: null, // the hello sent, { name, avatar }, until its seat comes back
    again: false, // that hello is her seat's, asked for again (rehello): its answer is not what she typed
    hadSeat: false, // a seat in this room: its no-room is the end of the game, not a wrong code
    connection: null, // the room's, from net({ code, guestId, url })
    status: null, // what the connection said last
    replaced: false, // another tab took this seat: the wait screen offers it back
    heardAt: null, // when the big screen's last message came (now()), for the ?debug=1 readout
    game: null, // which game's screen `gameEl` holds
    said: { text: '', kind: null }, // the status line: 'net' (the connection's), 'page' (the guest's own doing) or 'pause'
    offer: null, // Söngur Slóeðlu's lobby: the avatars on offer (null: every one)
    ask: null, // 'level' when the lobby asks "Krakki eða fullorðinn?"
    level: guest.level, // the level picked ('barn' or 'fullordinn'), the phone's remembered one at first
    listeners: new Map(), // a game screen's listen(type, fn): type -> Set of fn
  };

  function save() {
    try {
      const level = guest.level ? { level: guest.level } : {};
      keep?.setItem(STORAGE_KEY, JSON.stringify({ guestId: guest.guestId, name: guest.name, avatar: guest.avatar, ...level }));
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

  /**
   * The status line: what the connection says ('net'), what the guest should do ('page'), or that the big screen is paused
   * ('pause', which only views and the big screen going take away); '' clears it.
   */
  function say(text, kind = null) {
    at.said = { text, kind: text ? kind : null };
    statusEl.textContent = text;
  }
  function unsay(kind) {
    if (at.said.kind === kind) say('');
  }

  /**
   * Söngur Slóeðlu's "Krakki eða fullorðinn?": the question and two big buttons; onPick(level) on a tap. render(level) presses
   * the one picked.
   */
  function levelRow(onPick) {
    const el = make('div', 'spil-levels');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', WORDS.levelAsk);
    const buttons = LEVEL_CHOICES.map(([id, look, word]) => {
      const button = make('button', 'spil-level');
      button.setAttribute('data-level', id);
      button.setAttribute('aria-pressed', 'false');
      const faceEl = make('span', 'spil-level-face', look);
      faceEl.setAttribute('aria-hidden', 'true');
      button.append(faceEl, make('span', 'spil-level-word', word));
      control(button, () => onPick(id));
      return button;
    });
    el.append(make('p', 'spil-level-ask', WORDS.levelAsk), ...buttons);
    const render = level => buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(LEVEL_CHOICES[i][0] === level)));
    return { el, buttons, render };
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
  const debugEl = debug ? make('p', 'spil-debug') : null; // ?debug=1's readout, at the paper's foot
  debugEl?.setAttribute('aria-hidden', 'true');
  pageEl.append(meEl, mainEl, statusEl, ...(debugEl ? [debugEl] : []));
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
  const noneEl = make('p', 'spil-none', WORDS.none); // a song lobby with all its dinosaurs taken
  noneEl.hidden = true;
  const joinLevels = levelRow(level => {
    at.level = level;
    unsay('page');
    joinLevels.render(level);
  });
  joinLevels.el.hidden = true;
  joinLevels.el.addEventListener('animationend', event => { if (event.target === joinLevels.el) joinLevels.el.classList.remove('nope'); });
  const readyEl = make('button', 'spil-ready spil-big');
  readyEl.innerHTML = `${PLAY}<span>${WORDS.ready}</span>`;
  // Egill's portrait first, where the game wants him on a device of his own (the lobby view's host: 'free')
  const hostEl = make('button', 'spil-host');
  hostEl.setAttribute('aria-label', WORDS.egill);
  const hostLook = face('spil-host-face');
  setFace(hostLook, HOST_AVATAR.id);
  hostEl.append(hostLook.el, make('span', 'spil-host-words', WORDS.egill));
  const orEl = make('p', 'spil-or', WORDS.or);
  orEl.setAttribute('aria-hidden', 'true');
  hostEl.hidden = true;
  orEl.hidden = true;
  const renderHost = () => {
    hostEl.hidden = at.host !== 'free';
    orEl.hidden = hostEl.hidden;
    joinEl.classList.toggle('with-host', !hostEl.hidden);
  };
  joinEl.append(hostEl, orEl, askEl, nameEl, avatarsEl, noneEl, joinLevels.el, readyEl);

  /** Is this avatar on offer? Every one, unless a song lobby offers only its dinosaurs. */
  const offered = id => at.offer === null || at.offer.includes(id);
  /** May this avatar be picked now? Not one refused, and once a lobby has come, only one it says is free (or her own). */
  function free(id) {
    if (at.taken.has(id) || !offered(id)) return false;
    return at.available === null || at.available.includes(id) || id === at.seat?.avatar;
  }
  function renderAvatars() {
    if (at.chosen && !free(at.chosen)) at.chosen = null;
    avatarButtons.forEach((el, index) => {
      const { id } = AVATARS[index];
      el.hidden = !offered(id);
      el.disabled = !free(id);
      el.setAttribute('aria-pressed', String(id === at.chosen));
    });
    // a song lobby with none of its dinosaurs free: say so, and wait for a lobby view with one free
    const none = at.offer !== null && !AVATARS.some(({ id }) => free(id));
    avatarsEl.style.setProperty('--spil-columns', String(Math.max(1, Math.min(COLUMNS, AVATARS.filter(({ id }) => offered(id)).length))));
    noneEl.hidden = !none;
    avatarsEl.hidden = none;
    readyEl.hidden = none;
    joinLevels.el.hidden = none || at.ask !== 'level';
    joinLevels.render(at.level);
  }
  function choose(id) {
    if (!free(id)) return;
    at.chosen = id;
    unsay('page');
    renderAvatars();
  }

  /** "Ég er Egill": hello with his name and portrait, which binds this phone to seat 0 where the game wants it. */
  function imEgill() {
    if (at.host !== 'free') return false;
    at.pending = { name: HOST_AVATAR.name, avatar: HOST_AVATAR.id };
    at.again = false;
    at.connection?.send?.(message('hello', at.pending));
    return true;
  }
  control(hostEl, () => imEgill());

  nameEl.addEventListener('input', () => unsay('page'));
  nameEl.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    submit();
  });
  control(readyEl, () => submit());

  /**
   * "Tilbúin/n": hello { name, avatar } to the big screen (with `level` when the lobby asks for one); false (and a word or a
   * shake) while any is missing.
   */
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
    if (at.ask === 'level' && !isLevel(at.level)) {
      nudge(joinLevels.el);
      joinLevels.buttons[0].focus?.();
      return false;
    }
    at.pending = { name, avatar: at.chosen, ...(at.ask === 'level' ? { level: at.level } : {}) };
    at.again = false;
    at.connection?.send?.(message('hello', at.pending));
    return true;
  }

  /**
   * Her seat asked for again (spec §6.4): hello with the seat's own name and avatar (or, before any came, what the phone
   * remembers), without "Tilbúin/n"'s checks. Those read the join screen, which a game leaves stale: a lobby's free avatars
   * leave out hers once she has a seat, and a second tab may have no name in its field, so the hello never went and the
   * phone waited for good. The big screen keeps a known guest's seat, her own avatar always (seats.join).
   */
  function rehello() {
    const name = at.seat?.name ?? guest.name;
    const avatar = at.seat?.avatar ?? guest.avatar;
    if (!name || !avatar) return false; // nothing to ask with: the join screen's tap is the hello
    // a song lobby's level goes too: a reloaded big screen has forgotten it (the seat keeps it otherwise)
    at.pending = { name, avatar, ...(at.ask === 'level' && isLevel(at.level) ? { level: at.level } : {}) };
    at.again = true;
    return at.connection?.send?.(message('hello', at.pending)) ?? false;
  }

  // The wait screen keeps asking: a seated page whose socket is open says hello again every ASK_EVERY_MS, ASK_TIMES
  // times, in case the first was lost; a seat or a view from the big screen, or any status but connected, stops it.
  let asking = null;
  function keepAsking(left = ASK_TIMES) {
    stopAsking();
    if (left <= 0) return;
    asking = timers.setTimeout(() => {
      asking = null;
      if (at.screen !== 'wait' || at.status !== 'connected') return;
      rehello();
      keepAsking(left - 1);
    }, ASK_EVERY_MS);
  }
  function stopAsking() {
    if (asking !== null) timers.clearTimeout(asking);
    asking = null;
  }

  // ---- lobby, wait, closed, over ------------------------------------------------------------------------------------

  const lobbyEl = make('section', 'spil-screen spil-lobby');
  const heroFace = face('spil-hero');
  const lobbyWords = make('h2', 'spil-words', WORDS.lobby);
  const seatsEl = make('ul', 'spil-seats');
  seatsEl.setAttribute('aria-label', 'Við borðið');
  // Söngur Slóeðlu's: what the big screen says ("Egill velur lag…", the song's name and picture) and her level to change
  const lobbyNote = make('div', 'spil-lobby-note-box');
  const lobbyNotePicture = make('img', 'spil-lobby-note-picture');
  lobbyNotePicture.alt = '';
  lobbyNotePicture.hidden = true;
  const lobbyNoteText = make('p', 'spil-lobby-note');
  lobbyNote.append(lobbyNotePicture, lobbyNoteText);
  lobbyNote.hidden = true;
  const lobbyLevels = levelRow(level => {
    at.level = level;
    guest.level = level;
    save();
    lobbyLevels.render(level);
    send({ type: 'level', level });
  });
  lobbyLevels.el.hidden = true;
  lobbyEl.append(heroFace.el, lobbyWords, lobbyNote, lobbyLevels.el, seatsEl);

  function renderNote(note) {
    const text = typeof note?.text === 'string' ? note.text : '';
    const picture = typeof note?.picture === 'string' && SAFE_PICTURE.test(note.picture) ? asset(note.picture) : null;
    lobbyNoteText.textContent = text;
    if (picture && lobbyNotePicture.src !== picture) lobbyNotePicture.src = picture;
    lobbyNotePicture.hidden = !picture;
    lobbyNote.hidden = !text && !picture;
  }

  function renderLobby(view) {
    setFace(heroFace, at.seat.avatar);
    renderNote(view.note);
    const mine = Array.isArray(view.seats) ? view.seats.find(entry => entry.seat === at.seat.seat) : null;
    if (isLevel(mine?.level)) at.level = mine.level;
    lobbyLevels.el.hidden = at.ask !== 'level';
    lobbyLevels.render(at.level);
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
  setFace(waitFace, HOST_AVATAR.id); // Egill's face, for the big screen he sits at
  const wait = note('spil-wait', waitFace.el, WORDS.wait);
  // Another tab took the seat (replaced): a tap opens this page's socket again, and the room gives the seat to the newer
  // connection. The big screen gone (host-gone) is the connection's to try by itself, so the line is hidden then.
  const retakeEl = make('button', 'spil-retake', WORDS.retake);
  retakeEl.hidden = true;
  wait.el.append(retakeEl);
  control(retakeEl, () => { if (at.replaced) at.connection?.reconnect?.(); });
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
  const wakeLock = keepScreenAwake({ doc, win, active: false });
  const syncWake = () => wakeLock.setActive(['join', 'lobby', 'wait', 'game'].includes(at.screen) && !(at.screen === 'game' && at.state?.phase === 'bless'));
  let gameEl = null;

  function show(screen) {
    const el = screen === 'game' ? gameEl : screens[screen];
    at.screen = screen;
    root.setAttribute('data-screen', screen);
    if (mainEl.children[0] !== el) mainEl.replaceChildren(el);
    syncWake();
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
    unsay('pause'); // every view says afresh whether the big screen is paused: only a game's can
    if (view.screen === 'lobby') return lobby(view);
    if (view.screen === 'over') renderOver(view);
    if (own) return show(view.screen);
    if (at.screen !== 'game' || at.game !== view.screen) {
      gameEl = make('section', 'spil-screen spil-game');
      gameEl.setAttribute('data-game', view.screen);
      at.game = view.screen;
      at.listeners.clear(); // the screen before is gone, and its listeners with it
    }
    unsay('page');
    show('game');
    render(gameEl, view, { send, doc, control, audio, post, listen });
    if (view.paused === true) say(WORDS.paused, 'pause');
  }

  /** The lobby: her place at the table when it says she has one (`you`); otherwise the join screen, with the free avatars. */
  function lobby(view) {
    const you = typeof view.you === 'number' && Array.isArray(view.seats) ? view.seats.find(entry => entry.seat === view.you) : null;
    if (you) seatAs(you);
    else at.seat = null; // never seated, or dropped at "Byrjum!" while away: one tap seats her again
    showSeat();
    at.offer = Array.isArray(view.offer) ? [...view.offer] : null;
    at.ask = view.ask === 'level' ? 'level' : null;
    at.available = Array.isArray(view.available) ? [...view.available] : [];
    at.taken.clear(); // the big screen's word is newer than any refusal
    at.host = ['free', 'mine', 'taken'].includes(view.host) ? view.host : null;
    renderHost();
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
    const again = at.again;
    at.pending = null;
    at.again = false;
    if (body.ok) {
      // Her seat, told to a page that said no hello (a fresh one), or asked for again: the big screen's name for it ("Anna 2")
      if (!sent || again) {
        const name = typeof body.name === 'string' ? body.name : sent?.name ?? guest.name;
        seatAs({ seat: body.seat, name, avatar: sent?.avatar ?? at.seat?.avatar ?? guest.avatar });
        unsay('page');
        return; // what she typed stays what the phone remembers
      }
      const { name, avatar, level } = sent;
      seatAs({ seat: body.seat, name, avatar });
      guest.name = name;
      guest.avatar = avatar;
      if (isLevel(level)) guest.level = level;
      save();
      unsay('page');
      return; // the lobby's view, with her in it, comes next
    }
    if (body.reason === 'full') return say(WORDS.full, 'page');
    show('join');
    if (body.reason === 'host-taken' || body.reason === 'already-seated') { // another phone is Egill's
      at.host = 'taken';
      renderHost();
      return say(WORDS.taken, 'page');
    }
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
    at.heardAt = now();
    unsay('net'); // the big screen is there
    if (msg.type === 'view' || msg.type === 'seat') stopAsking(); // it answered
    if (msg.type === 'view') onView(msg);
    else if (msg.type === 'seat') onSeat(msg.body ?? {});
    else for (const fn of [...(at.listeners.get(msg.type) ?? [])]) fn(msg.body, msg); // a game screen's own (Söngur Slóeðlu's)
    readout();
  }

  /** What the connection says about itself (net.js): the words of spec §10. */
  function onStatus(status) {
    at.status = status;
    at.replaced = status === 'replaced';
    retakeEl.hidden = !at.replaced;
    if (status !== 'connected') stopAsking();
    readout();
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
        unsay('pause'); // the wait screen has its own words
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
        if (at.pending && !at.again) { // her own tap's hello, sent before the socket opened: hers, even when she had a seat
          if (at.pending.avatar === HOST_AVATAR.id) at.connection?.send?.(message('hello', at.pending)); // Egill's: as it was
          else submit(); // (dropped at "Byrjum!", she may have chosen another avatar than the one she had)
        } else if (at.hadSeat) { // spec §6.4: hello again, and her seat and the newest view come back
          rehello();
          if (at.screen === 'wait') keepAsking(); // and again, until they do
        }
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
    stopAsking();
    Object.assign(at, {
      connection: null, state: null, lastSeq: 0, seat: null, available: null, pending: null, again: false, hadSeat: false,
      status: null, replaced: false, heardAt: null, host: null,
    });
    retakeEl.hidden = true;
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

  /** A game screen's own message to the big screen, `type` and `body` as they are (Söngur Slóeðlu's time and taps). */
  function post(type, body) {
    return at.connection?.send?.(message(type, body)) ?? false;
  }

  /** fn(body, msg) for every message of `type` from the big screen while this game's screen shows; returns the unsubscribe. */
  function listen(type, fn) {
    if (!at.listeners.has(type)) at.listeners.set(type, new Set());
    at.listeners.get(type).add(fn);
    return () => { at.listeners.get(type)?.delete(fn); };
  }

  // The phone wakes, the tab comes to the front or the network is back: try again now, not at the end of a wait (spec
  // §6.4). visibilitychange is the document's, and comes up to the window.
  win?.addEventListener?.('visibilitychange', () => { if (doc.visibilityState !== 'hidden') at.connection?.reconnect?.(); });
  win?.addEventListener?.('online', () => at.connection?.reconnect?.());

  // ---- ?debug=1: the connection as the phone sees it, for the owner's tests (not Icelandic: nobody else reads it) ------

  /** [status · transport · seconds since the big screen was last heard (its pings too: net.js's heardAt) · seat]. */
  function readout() {
    if (!debugEl) return;
    const heard = at.connection?.heardAt ?? at.heardAt;
    const age = typeof heard === 'number' ? `${Math.max(0, Math.floor((now() - heard) / 1000))}s` : '–';
    debugEl.textContent = `[${at.status ?? '–'} · ${at.connection?.transport ?? '–'} · ${age} · seat ${at.seat?.seat ?? '–'}]`;
  }
  function tick() {
    readout();
    timers.setTimeout(tick, 1000);
  }
  if (debugEl) tick();

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
