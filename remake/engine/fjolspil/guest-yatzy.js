// The guest's screen of Litla Yatzy on her phone (spec §6, the owner's decisions of 2026-10-24): the phone is the cup and the
// big screen the table. The dice roll in 3D on the big screen; the phone holds what is hers to do, from the top:
//   whose turn it is ("Þú átt leik!" or "Anna á leik") and the rolls left as three dots, full for each one left (as on the cup)
//   the five dice, big buttons with the friend's picture and the number, as the cards' little dice show them; a held one in a
//                gold frame with a check, and before the first roll their backs (a faint "?")
//   the cup, "Kasta!" on the big green pill ("Kasta aftur!" after the first roll), dim while it is not hers to roll
//   the five cards of whoever plays: the dice that score on each (or its example), its name, and "+6" while it is free or
//                its score once used; a free card she may pick is lit
//   the players, a face, a name and the total each, whoever plays lit
// and at the end the winner's picture and "{name} vann!" (or "Jafntefli!") in place of the dice, everyone's totals under it.
//
// The big screen decides everything (its rules, its random): a tap only asks, with act { type: 'roll' }, { type: 'hold', die }
// or { type: 'score', card }, and waits for the next view, so a double tap or a slow network never asks twice: the cup and
// the dice wait, disabled, until the next view, and so do the cards once one is picked. A card that would score nothing asks
// first, inside the card ("Nota spjaldið? 0 stig" with "Nota" and "Velja annað"). When a view brings a new roll (view.roll.seq,
// whoever threw it) the dice that were rolled (the ones not held) tumble onto their new faces (spil-tumble, 950 ms, as long as
// the big screen's) and the phone rattles once (yatzy-phone-sounds.js), so the roll is seen and heard on both screens together;
// the first view this screen shows never tumbles (it is the table as it stands).
//
// renderYatzy(root, view, { send, doc, control, audio }) is guest.js's game screen for 'yatzy': `root` is the page's
// .spil-game, the same one while yatzy views follow one another, so the screen is built in it once and updated after;
// `control` makes a button of the book (guest.js: the squash, the sparkle, the tap sound and the keyboard), `audio.effects`
// gives the page's own effects for the rattle (null before the first touch). Names are text, never markup. The look is
// spil.css's "Litla Yatzy" part.

import { avatarOf } from './seats.js';
import { pressable } from '../book/fx.js';
import { yatzyPhoneSounds, YATZY_PHONE_GAPS } from './yatzy-phone-sounds.js';

const TUMBLE_MS = 950;
const ROLLS = 3; // a turn's rolls

// The dice's six faces, 1 to 6: copied from engine/yatzy-mosi/dice.js's DINO_FACES (the big screen's dice and the cards'
// little dice), which this page must not import: dice.js imports three.js, and spil.html has no import map for it.
const FACES = [
  { name: 'Mosi', image: 'eitt/mosi.webp' },
  { name: 'Kambeðla', image: 'book/images/kambedla-render-thumb.webp' },
  { name: 'Þórseðla', image: 'eitt/brontosaurus.webp' },
  { name: 'Grameðla', image: 'eitt/trex.webp' },
  { name: 'Slóeðla', image: 'eitt/parasaurolophus.webp' },
  { name: 'Flugeðla', image: 'eitt/pteranodon.webp' },
];

// The five cards, in the table's order, and the little dice each shows while no dice score on it: yatzy-junior/game.js's EXAMPLES.
const EXAMPLES = { pair: [2, 2], twoPairs: [2, 2, 4, 4], threeKind: [3, 3, 3], smallStraight: [1, 2, 3, 4, 5], yatzy: [5, 5, 5, 5, 5] };

/** Everything the screen says. */
const WORDS = {
  mine: 'Þú átt leik!',
  theirs: name => `${name} á leik`,
  roll: 'Kasta!',
  again: 'Kasta aftur!',
  zero: 'Nota spjaldið? 0 stig',
  use: 'Nota',
  other: 'Velja annað',
  won: name => `${name} vann!`,
  tie: 'Jafntefli!',
  players: 'Leikmenn',
};

const REMAKE = new URL('../../', import.meta.url);
const asset = path => new URL(path, REMAKE).href;
/** The page's own effects for the rattle (guest.js's audio.effects keeps one set for these sounds). */
const EFFECTS = { sounds: yatzyPhoneSounds, gaps: YATZY_PHONE_GAPS };

/** Each .spil-game this screen has been built in, and its parts. */
const built = new WeakMap();

/** The screen of `view` in `root`: built the first time, updated after. */
export function renderYatzy(root, view, { send, doc = root.ownerDocument, control = null, audio = null } = {}) {
  const at = built.get(root) ?? build(root, doc, control);
  at.send = send;
  at.audio = audio;
  update(at, view && typeof view === 'object' ? view : {});
}

function build(root, doc, control) {
  const make = (tag, className, text = '') => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (tag === 'button') el.type = 'button';
    if (text) el.textContent = text;
    return el;
  };
  const picture = () => {
    const img = make('img', 'spil-picture');
    img.alt = '';
    return img;
  };
  const face = className => {
    const el = make('span', `spil-face ${className}`);
    const img = picture();
    el.append(img);
    return { el, picture: img };
  };
  const press = (el, onTap) => {
    const tap = event => { if (!el.disabled) onTap(event); };
    if (control) control(el, tap);
    else pressable(el, { onTap: tap });
  };

  const turnEl = make('h2', 'spil-yatzy-turn');
  turnEl.setAttribute('aria-live', 'polite');
  const rollsEl = make('span', 'spil-yatzy-rolls');
  rollsEl.setAttribute('aria-hidden', 'true'); // the cup's words say what she may do; the dots are for the eye
  const pips = Array.from({ length: ROLLS }, () => make('i'));
  rollsEl.append(...pips);

  const diceEl = make('ul', 'spil-yatzy-dice');
  const dice = Array.from({ length: 5 }, (_, i) => {
    const button = make('button', 'spil-yatzy-die');
    const img = picture();
    const number = make('b');
    button.append(img, number);
    const li = make('li');
    li.append(button);
    diceEl.append(li);
    press(button, () => hold(at, i));
    return { button, picture: img, number, face: null };
  });

  const cupEl = make('button', 'spil-big spil-yatzy-cup');
  press(cupEl, () => roll(at));

  const cardsEl = make('div', 'spil-yatzy-cards');
  const cards = new Map(Object.keys(EXAMPLES).map(id => {
    const el = make('div', 'spil-yatzy-card');
    el.setAttribute('data-card', id);
    const pick = make('button', 'spil-yatzy-pick');
    const minis = make('span', 'spil-yatzy-minis');
    minis.setAttribute('aria-hidden', 'true');
    const name = make('span', 'spil-yatzy-name');
    const value = make('strong', 'spil-yatzy-value');
    pick.append(minis, name, value);
    const confirm = make('div', 'spil-yatzy-confirm');
    confirm.hidden = true;
    const use = make('button', 'spil-big spil-yatzy-use', WORDS.use);
    const other = make('button', 'spil-yatzy-other', WORDS.other);
    confirm.append(make('p', 'spil-yatzy-ask', WORDS.zero), use, other);
    el.append(pick, confirm);
    cardsEl.append(el);
    press(pick, () => tapCard(at, id));
    press(use, () => score(at, id));
    press(other, () => ask(at, null));
    return [id, { el, pick, minis, name, value, confirm, use, shown: null }];
  }));

  const playersEl = make('ul', 'spil-yatzy-players');
  playersEl.setAttribute('aria-label', WORDS.players);

  const wonEl = make('div', 'spil-yatzy-won');
  const winnerFace = face('spil-hero spil-winner');
  const burst = make('span', 'spil-burst'); // a gold burst behind the winner, as on the over screen
  burst.append(winnerFace.el);
  const wonWords = make('h2', 'spil-words');
  wonEl.append(burst, wonWords);

  root.replaceChildren(turnEl, rollsEl, diceEl, cupEl, cardsEl, playersEl, wonEl);

  const at = {
    make, face, turnEl, rollsEl, pips, diceEl, dice, cupEl, cardsEl, cards, playersEl, wonEl, burst, winnerFace, wonWords,
    send: null, audio: null,
    rows: new Map(), // seat -> its row in the players' bar
    asking: null, // the card whose "Nota spjaldið? 0 stig" shows
    seq: undefined, // the last view's roll.seq (null: no roll yet; undefined: no view yet)
    tumbleTimer: 0,
  };
  built.set(root, at);
  return at;
}

// ---- What a tap asks for ---------------------------------------------------------------------------------------------

/** "Kasta!": one roll for each view that offers one. */
function roll(at) {
  at.cupEl.disabled = true;
  at.send?.({ type: 'roll' });
}

/** A die held, or let go: one for each view, so every die waits. */
function hold(at, i) {
  for (const die of at.dice) die.button.disabled = true;
  at.send?.({ type: 'hold', die: i });
}

/** A card tapped: one free card she may pick scores, one worth nothing asks first. */
function tapCard(at, id) {
  const card = at.cards.get(id);
  if (!card.el.classList.contains('available')) return;
  if (card.el.classList.contains('zero')) ask(at, id);
  else score(at, id);
}

/** The card picked: once, and every card waits for the next view. */
function score(at, id) {
  at.asking = null;
  for (const card of at.cards.values()) {
    card.pick.disabled = true;
    card.use.disabled = true;
    card.confirm.hidden = true;
  }
  at.send?.({ type: 'score', card: id });
}

/** The card `id` asks "Nota spjaldið? 0 stig" (null: none does). */
function ask(at, id) {
  at.asking = id;
  for (const [cardId, card] of at.cards) card.confirm.hidden = cardId !== id;
}

// ---- The view -------------------------------------------------------------------------------------------------------

const faceOf = value => (Number.isInteger(value) && value >= 1 && value <= 6 ? value : 0);

function setFace({ el, picture }, id) {
  const avatar = avatarOf(id);
  const src = avatar ? asset(avatar.picture) : null;
  if (src && picture.src !== src) picture.src = src; // never an empty src, which a browser would read as the page
  picture.hidden = !avatar;
  el.style.setProperty('--c', avatar?.colour ?? 'transparent');
}

/** A die shows face n: the friend's picture and the number, or (0) its back. */
function showDie(die, n) {
  if (die.face === n) return;
  die.face = n;
  die.button.setAttribute('data-face', String(n));
  die.number.textContent = n ? String(n) : '?';
  die.picture.hidden = !n;
  if (!n) return;
  die.picture.src = asset(`assets/${FACES[n - 1].image}`);
  die.picture.alt = FACES[n - 1].name; // with the number, the die's name: "Mosi 1"
}

/** The dice that were rolled tumble onto their new faces (spil.css: .spil-tumble, a fade under reduced motion). */
function tumble(at, rolled) {
  clearTimeout(at.tumbleTimer);
  at.dice.forEach((die, i) => {
    die.button.classList.remove('spil-tumble');
    if (!rolled[i]) return;
    void die.button.offsetWidth; // the animation starts again
    die.button.classList.add('spil-tumble');
  });
  at.tumbleTimer = setTimeout(() => { for (const die of at.dice) die.button.classList.remove('spil-tumble'); }, TUMBLE_MS);
  at.tumbleTimer?.unref?.(); // in Node (the tests) a timer must not keep the process waiting
}

/** The rattle, on the page's own effects: skipped until the first touch wakes the page's audio, never in the way. */
function rattle(at) {
  try {
    at.audio?.effects?.(EFFECTS)?.play('rattle');
  } catch {
    // no sound here
  }
}

function update(at, view) {
  const players = Array.isArray(view.players) ? view.players.filter(player => Number.isInteger(player?.seat)) : [];
  const playerOf = seat => players.find(player => player.seat === seat);
  const nameOf = seat => String(playerOf(seat)?.name ?? '');
  const over = view.winner !== null && view.winner !== undefined;
  const mine = view.turn === view.you;
  const rolls = Number.isInteger(view.rolls) ? Math.min(ROLLS, Math.max(0, view.rolls)) : 0;

  at.turnEl.hidden = over;
  at.turnEl.textContent = mine ? WORDS.mine : WORDS.theirs(nameOf(view.turn));
  at.turnEl.classList.toggle('mine', mine);
  at.rollsEl.hidden = over;
  at.pips.forEach((pip, k) => pip.classList.toggle('left', k < ROLLS - rolls));

  // The dice: a new roll (a seq this phone has not shown, after the first view) tumbles the ones that were rolled.
  const held = at.dice.map((_, i) => Array.isArray(view.held) && view.held[i] === true);
  const seq = Number.isInteger(view.roll?.seq) ? view.roll.seq : null;
  const rolled = at.seq !== undefined && seq !== null && seq !== at.seq;
  at.seq = seq;
  at.diceEl.hidden = over;
  at.dice.forEach((die, i) => {
    showDie(die, faceOf(Array.isArray(view.dice) ? view.dice[i] : 0));
    die.button.classList.toggle('held', held[i]);
    die.button.setAttribute('aria-pressed', String(held[i]));
    die.button.disabled = over || view.canHold !== true;
  });
  if (rolled) {
    tumble(at, held.map(kept => !kept));
    rattle(at);
  }

  at.cupEl.hidden = over;
  at.cupEl.textContent = rolls === 0 ? WORDS.roll : WORDS.again;
  at.cupEl.disabled = over || view.canRoll !== true;

  renderCards(at, view, over);
  renderPlayers(at, view, players, over);

  at.wonEl.hidden = !over;
  if (over) {
    const tie = view.winner === 'tie';
    at.burst.hidden = tie;
    if (!tie) setFace(at.winnerFace, playerOf(view.winner)?.avatar);
    at.wonWords.textContent = tie ? WORDS.tie : WORDS.won(nameOf(view.winner));
  }
}

/** The five cards of whoever plays: free (and lit while she may pick), used with their scores, or asking first. */
function renderCards(at, view, over) {
  const list = Array.isArray(view.cards) ? view.cards : [];
  at.cardsEl.hidden = over;
  for (const [id, card] of at.cards) {
    const data = list.find(entry => entry?.id === id);
    card.el.hidden = !data;
    if (!data) continue;
    const filled = Number.isInteger(data.score);
    const available = !over && view.canScore === true && data.score === null;
    const zero = available && data.preview === 0;
    card.el.classList.toggle('filled', filled);
    card.el.classList.toggle('available', available);
    card.el.classList.toggle('zero', zero);
    card.pick.disabled = !available;
    card.use.disabled = !zero;
    card.name.textContent = String(data.label ?? '');
    card.value.textContent = filled ? String(data.score) : Number.isInteger(data.preview) ? `+${data.preview}` : '';
    const live = Array.isArray(data.faces) ? data.faces.map(faceOf).filter(Boolean) : [];
    showMinis(at, card, live.length ? live : EXAMPLES[id]);
  }
  if (at.asking && !at.cards.get(at.asking).el.classList.contains('zero')) at.asking = null; // that card no longer asks
  ask(at, at.asking);
}

/** A card's little dice: a picture and a number each, as the cards on the table have them. */
function showMinis(at, card, faces) {
  const key = faces.join('');
  if (card.shown === key) return;
  card.shown = key;
  card.minis.replaceChildren(...faces.map(n => {
    const mini = at.make('span', 'spil-yatzy-mini');
    const img = at.make('img');
    img.alt = '';
    img.src = asset(`assets/${FACES[n - 1].image}`);
    mini.append(img, at.make('b', '', String(n)));
    return mini;
  }));
}

/** The players' bar: each seat's face, name and total, whoever plays lit; kept by seat, so the pictures stay put. */
function renderPlayers(at, view, players, over) {
  for (const [seat, row] of at.rows) if (!players.some(player => player.seat === seat)) at.rows.delete(seat);
  const rows = players.map(player => {
    let row = at.rows.get(player.seat);
    if (!row) {
      const li = at.make('li', 'spil-yatzy-player');
      const look = at.face('spil-yatzy-face');
      const name = at.make('span', 'spil-yatzy-pname');
      const total = at.make('span', 'spil-yatzy-total');
      li.append(look.el, name, total);
      at.rows.set(player.seat, (row = { li, look, name, total }));
    }
    setFace(row.look, player.avatar);
    row.name.textContent = String(player.name ?? '');
    row.total.textContent = String(Number.isInteger(player.total) ? player.total : 0);
    row.li.style.setProperty('--c', avatarOf(player.avatar)?.colour ?? 'transparent');
    row.li.classList.toggle('current', !over && player.seat === view.turn);
    row.li.classList.toggle('won', over && player.seat === view.winner);
    return row.li;
  });
  const now = [...at.playersEl.children];
  if (now.length !== rows.length || rows.some((li, k) => now[k] !== li)) at.playersEl.replaceChildren(...rows);
}
