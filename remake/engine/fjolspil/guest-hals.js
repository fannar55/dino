// The guest's screen of "Háls og hali" on her phone (spec §7.2, §6.3 and §8): the board is the big screen's, so the phone
// holds only what is hers, the die. From the top: whose turn it is ("Þú átt leik!" or "Anna á leik"), the die, big, with
// "Kasta!" on it while it is her turn, and the players, a row each with the picture, the name and the square ("reitur 23").
// At the end the winner's picture and "{name} vann!" take the die's place.
//
// The big screen makes the roll (its own random, never the phone's): a tap only asks for one, act { type: 'roll' }, once
// for each view that says she may (canRoll), so a double tap or a slow network never rolls twice; the die waits, disabled,
// for the next view. When a view brings a new roll (view.roll, whoever threw it) the die shows its face with a tumble
// (spil-tumble, 950 ms, the big screen's ROLL_MS), so the die rolls on both screens together.
//
// renderHals(root, view, { send, doc, control }) is guest.js's game screen for 'hals': `root` is the page's .spil-game,
// the same one while hals views follow one another, so the screen is built in it once and updated after; `control` makes
// a button of the book (guest.js: the squash, the sparkle, the tap sound and the keyboard). Names are text, never markup.
// The look is spil.css's "Háls og hali" part.

import { avatarOf } from './seats.js';
import { pressable } from '../book/fx.js';

const TUMBLE_MS = 950;
const PIPS = { 1: ['c'], 2: ['tl', 'br'], 3: ['tl', 'c', 'br'], 4: ['tl', 'tr', 'bl', 'br'], 5: ['tl', 'tr', 'c', 'bl', 'br'], 6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'] };

/** Everything the screen says. */
const WORDS = {
  mine: 'Þú átt leik!',
  theirs: name => `${name} á leik`,
  roll: 'Kasta!',
  square: n => `reitur ${n}`,
  won: name => `${name} vann!`,
};

const REMAKE = new URL('../../', import.meta.url);
const asset = path => new URL(path, REMAKE).href;

/** Each .spil-game this screen has been built in, and its parts. */
const built = new WeakMap();

/** The screen of `view` in `root`: built the first time, updated after. */
export function renderHals(root, view, { send, doc = root.ownerDocument, control = null } = {}) {
  const at = built.get(root) ?? build(root, doc, control);
  at.send = send;
  update(at, view ?? {});
}

function build(root, doc, control) {
  const make = (tag, className, text = '') => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (tag === 'button') el.type = 'button';
    if (text) el.textContent = text;
    return el;
  };
  const face = className => {
    const el = make('span', `spil-face ${className}`);
    const picture = make('img', 'spil-picture');
    picture.alt = '';
    el.append(picture);
    return { el, picture };
  };

  const turnEl = make('h2', 'spil-hals-turn');
  turnEl.setAttribute('aria-live', 'polite');
  const dieEl = make('button', 'spil-hals-die');
  dieEl.setAttribute('aria-label', WORDS.roll);
  const faceEl = make('span', 'spil-hals-face');
  faceEl.setAttribute('aria-hidden', 'true');
  const rollEl = make('span', 'spil-hals-roll', WORDS.roll);
  dieEl.append(faceEl, rollEl);
  const wonEl = make('div', 'spil-hals-won');
  const winnerFace = face('spil-hero spil-winner');
  const burst = make('span', 'spil-burst'); // a gold burst behind the winner, as on the over screen
  burst.append(winnerFace.el);
  const wonWords = make('h2', 'spil-words');
  wonEl.append(burst, wonWords);
  const playersEl = make('ul', 'spil-hals-players');
  playersEl.setAttribute('aria-label', 'Leikmenn');
  root.replaceChildren(turnEl, dieEl, wonEl, playersEl);

  const at = {
    make, face, turnEl, dieEl, faceEl, wonEl, winnerFace, wonWords, playersEl,
    send: null,
    shown: 0, // the face the die shows (0: none yet)
    rolled: undefined, // the last view's roll as "value:by" (null: none; undefined: no view yet)
    tumbleTimer: 0,
  };
  const tap = () => {
    if (dieEl.disabled) return;
    dieEl.disabled = true; // until the next view: one roll for each view that offers one
    dieEl.classList.remove('live');
    at.send?.({ type: 'roll' });
  };
  if (control) control(dieEl, tap);
  else pressable(dieEl, { onTap: tap });
  built.set(root, at);
  return at;
}

function setFace({ el, picture }, id) {
  const avatar = avatarOf(id);
  const src = avatar ? asset(avatar.picture) : null;
  if (src && picture.src !== src) picture.src = src; // never an empty src, which a browser would read as the page
  picture.hidden = !avatar;
  el.style.setProperty('--c', avatar?.colour ?? 'transparent');
}

/** The die shows face n (its pips). */
function showFace(at, n) {
  if (at.shown === n) return;
  at.shown = n;
  at.dieEl.setAttribute('data-face', String(n));
  at.faceEl.replaceChildren(...PIPS[n].map(spot => at.make('i', spot)));
}

/** The die tumbles onto its new face (spil.css: .spil-tumble, a fade under reduced motion), from the start if it already was. */
function tumble(at) {
  const { dieEl } = at;
  clearTimeout(at.tumbleTimer);
  dieEl.classList.remove('spil-tumble');
  void dieEl.offsetWidth; // the animation starts again
  dieEl.classList.add('spil-tumble');
  at.tumbleTimer = setTimeout(() => dieEl.classList.remove('spil-tumble'), TUMBLE_MS);
  at.tumbleTimer?.unref?.(); // in Node (the tests) a timer must not keep the process waiting
}

function update(at, view) {
  const players = Array.isArray(view.players) ? view.players : [];
  const playerOf = seat => players.find(player => player.seat === seat);
  const nameOf = seat => String(playerOf(seat)?.name ?? '');
  const over = view.winner !== null && view.winner !== undefined;
  const mine = view.turn === view.you;

  at.turnEl.hidden = over;
  at.turnEl.textContent = mine ? WORDS.mine : WORDS.theirs(nameOf(view.turn));
  at.turnEl.classList.toggle('mine', mine);

  const value = Number.isInteger(view.roll?.value) && view.roll.value >= 1 && view.roll.value <= 6 ? view.roll.value : null;
  const rolled = value === null ? null : `${value}:${view.roll.by}`;
  showFace(at, value ?? (at.shown || 1));
  if (rolled !== null && at.rolled !== undefined && rolled !== at.rolled) tumble(at); // a roll this phone has not shown yet
  at.rolled = rolled;

  at.dieEl.hidden = over;
  at.dieEl.style.setProperty('--c', avatarOf(playerOf(view.turn)?.avatar)?.colour ?? 'transparent'); // the die in the colour of whoever plays
  at.dieEl.disabled = over || view.canRoll !== true;
  at.dieEl.classList.toggle('live', !at.dieEl.disabled);

  at.wonEl.hidden = !over;
  if (over) {
    setFace(at.winnerFace, playerOf(view.winner)?.avatar);
    at.wonWords.textContent = WORDS.won(nameOf(view.winner));
  }

  at.playersEl.replaceChildren(...players.map(player => {
    // The row's words are its own text, the name and then the square on a line of its own (spil.css: pre-line), so a
    // reader hears them together; the picture sits beside them.
    const row = at.make('li', 'spil-hals-player');
    row.textContent = `${String(player.name ?? '')}\n${WORDS.square(player.square ?? 0)}`;
    const look = at.face('spil-hals-player-face');
    setFace(look, player.avatar);
    row.append(look.el);
    row.style.setProperty('--c', avatarOf(player.avatar)?.colour ?? 'transparent');
    row.classList.toggle('mine', player.seat === view.you);
    row.classList.toggle('turn', !over && player.seat === view.turn);
    row.classList.toggle('won', over && player.seat === view.winner);
    return row;
  }));
}
