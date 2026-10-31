// The look of "Veiddu" as markup, in veiddu.css's classes: the card element the live table (Task 3) and a guest's device (Fjölspil) both
// draw, the child's hand laid out in an arc or in rows, and the still states of the lab page (veiddu-lab.html?state=...). The stills
// are made of what the rules would give (kinds laid, cards held, the pond left), but nothing here plays a round.

import { KINDS, COPIES } from './cards.js';
import { avatarOf } from '../fjolspil/seats.js';

const REMAKE = new URL('../../', import.meta.url); // remake/: where the pictures start
const asset = path => new URL(path, REMAKE).href;

const BY_ID = new Map(KINDS.map(kind => [kind.id, kind]));
const ORDER = KINDS.map(kind => kind.id);
const TAP_PX = 88; // the least a card of the child's hand may show across to be tapped (veiddu.css's --veiddu-target)
/** The kind of a card or a kind id (a RangeError for one that is not a kind). */
function kindFor(cardOrKind) {
  const id = typeof cardOrKind === 'string' ? cardOrKind : cardOrKind?.kind;
  const kind = BY_ID.get(id);
  if (!kind) throw new RangeError(`"${id}" is not a kind of card`);
  return kind;
}

// About how wide Nunito's heavy letters are, in ems: the narrow ones, the wide ones, and the rest.
const letterWidth = ch => ('iíjl'.includes(ch) ? 0.3 : 'tf'.includes(ch) ? 0.4 : 'rs'.includes(ch) ? 0.46 : 'mwæ'.includes(ch) ? 0.9 : ch === ch.toUpperCase() && ch !== ch.toLowerCase() ? 0.66 : 0.58);

/**
 * A name's size on a card, in cqw (a hundredth of the card's width). A name never breaks inside a word (a child who is learning to
 * read must see each word whole): it breaks only between words, and a long single word shrinks until it fits on its line.
 */
function nameSize(text) {
  const widest = Math.max(...text.split(' ').map(word => [...word].reduce((sum, ch) => sum + letterWidth(ch), 0)));
  return Math.min(16.5, 72 / widest);
}

/**
 * A card's markup, from the rules' card ({ id, kind }) or null for a back: `.veiddu-card`, and inside it `.pic` (the picture) and `.name`.
 * `back` shows a card's back (it keeps the card's id); `tag` is 'button' for the child's own cards, and `mini` is a card in a catch.
 */
export function cardElement(doc, card, { back = false, tag = 'div', mini = false } = {}) {
  const el = doc.createElement(tag);
  if (tag === 'button') el.type = 'button';
  if (card) el.dataset.id = card.id;
  if (!card || back) {
    el.className = 'veiddu-card back';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
  const kind = kindFor(card);
  el.className = `veiddu-card${kind.image ? '' : ' bare'}${mini ? ' mini' : ''}`;
  el.dataset.kind = kind.id;
  el.style.setProperty('--c', kind.colour);
  el.setAttribute('aria-label', kind.name);
  if (tag !== 'button') el.setAttribute('role', 'img');
  const pic = doc.createElement('span');
  pic.className = 'pic';
  if (kind.image) {
    const img = doc.createElement('img');
    img.src = asset(kind.image);
    img.alt = '';
    img.draggable = false;
    pic.append(img);
  }
  const text = kind.name;
  const name = doc.createElement('span');
  name.className = 'name';
  name.setAttribute('aria-hidden', 'true');
  name.style.setProperty('--fs', `${nameSize(text).toFixed(2)}cqw`);
  name.textContent = text;
  el.append(pic, name);
  return el;
}

// ---- The child's hand ---------------------------------------------------------------------------------------------------------

/** Where the child's cards may lie across the table: between Egill's place and Mosi's button (the table's edges when it is upright). */
function handBounds(handEl) {
  const table = handEl.closest('.veiddu-table');
  const base = table.getBoundingClientRect();
  const me = table.querySelector('.veiddu-me-catch');
  const help = table.querySelector('.veiddu-mosi-help');
  const upright = Boolean(handEl.ownerDocument.defaultView?.matchMedia?.('(max-aspect-ratio: 1/1)')?.matches);
  if (upright || !me || !help) return [base.left + 8, base.right - 8];
  return [me.getBoundingClientRect().right + 10, help.getBoundingClientRect().left - 10];
}

/**
 * Lays the cards of `handEl` (the child's hand, already in it, in the order they should lie) in their arc, a bigger hand overlapping
 * more so it fits between Egill's place and Mosi's button; and a hand so big that each card would show a strip narrower than a small
 * finger (TAP_PX) in two overlapping rows, or in three (the .rows of veiddu.css). It sets each card's --i, the hand's --overlap and, in
 * rows, --more, --more-rows, --step and each card's --col, --row and --shift. Eitt!'s hand is laid out the same way (eitt/table.js).
 */
export function layoutHand(handEl) {
  const els = [...handEl.querySelectorAll('.veiddu-card')];
  handEl.classList.remove('rows');
  for (const property of ['--overlap', '--more', '--more-rows', '--row-step', '--step']) handEl.style.removeProperty(property);
  const n = els.length;
  const spread = count => (count > 7 ? 5 / (count - 1) : 1);
  els.forEach((el, k) => {
    for (const property of ['--col', '--row', '--shift']) el.style.removeProperty(property);
    el.style.setProperty('--i', ((k - (n - 1) / 2) * spread(n)).toFixed(2));
  });
  if (!n) return;
  const upright = Boolean(handEl.ownerDocument.defaultView?.matchMedia?.('(max-aspect-ratio: 1/1)')?.matches);
  const width = els[0].offsetWidth || 120;
  const bounds = () => handBounds(handEl);
  const [from, to] = bounds();
  const room = to - from - 0.4 * width;
  const least = upright ? 0.08 : 0.04;
  let overlap = Math.min(0.45, Math.max(least, (1 - room / (n * width)) / 2));
  handEl.style.setProperty('--overlap', overlap.toFixed(3));
  // The fan tilts its outer cards outward: measured, a hand that still reaches past the bounds closes up more.
  const clear = () => {
    const boxes = els.map(el => el.getBoundingClientRect());
    const [lo, hi] = bounds();
    return Math.min(...boxes.map(box => box.left)) >= lo && Math.max(...boxes.map(box => box.right)) <= hi;
  };
  for (let tries = 0; tries < 8 && overlap < 0.45 && !clear(); tries++) {
    overlap = Math.min(0.45, overlap + 0.025);
    handEl.style.setProperty('--overlap', overlap.toFixed(3));
  }
  if (n > 2 && (els.at(-1).offsetLeft - els[0].offsetLeft) / (n - 1) < TAP_PX) layRows(handEl, els, bounds);
}

/** Two rows, or three: the first cards in the back row and the rest in front of it, each row fanned and centred on its own. */
function layRows(handEl, els, bounds) {
  const n = els.length;
  const spread = count => (count > 7 ? 5 / (count - 1) : 1);
  handEl.classList.add('rows');
  for (let rows = 2; rows <= 3; rows++) {
    const per = Math.ceil(n / rows);
    let step = els[0].offsetWidth * 0.92; // the most a card is ever spread: its width less its overlap of .04 on either side
    handEl.style.setProperty('--more', per - 1);
    handEl.style.setProperty('--more-rows', rows - 1);
    handEl.style.setProperty('--row-step', rows === 3 ? 'calc(var(--hand-w) * .5)' : '');
    els.forEach((el, k) => {
      const row = Math.floor(k / per);
      const col = k % per;
      const count = Math.min(per, n - row * per);
      el.style.setProperty('--col', col + 1);
      el.style.setProperty('--row', row + 1);
      el.style.setProperty('--shift', ((per - count) / 2).toFixed(2)); // a row of fewer cards is centred under the longer one
      el.style.setProperty('--i', ((col - (count - 1) / 2) * spread(count)).toFixed(2));
    });
    for (let tries = 0; tries < 10; tries++) {
      handEl.style.setProperty('--step', `${step.toFixed(1)}px`);
      const [from, to] = bounds();
      const boxes = els.map(el => el.getBoundingClientRect());
      const over = Math.max(0, from - Math.min(...boxes.map(box => box.left))) + Math.max(0, Math.max(...boxes.map(box => box.right)) - to);
      if (over < 1) break;
      step = Math.max(40, step - over / (per - 1) - 0.5);
    }
    if (step >= TAP_PX) break;
  }
}

/** An opponent's cards face down in front of its window, fanned closer as it holds more. */
function layTheirs(fan, seat) {
  const els = [...fan.querySelectorAll('.veiddu-card')];
  const n = els.length;
  els.forEach((el, k) => el.style.setProperty('--i', ((k - (n - 1) / 2) * (n > 7 ? 6 / (n - 1) : 1)).toFixed(2)));
  if (!n) return;
  const width = els[0].offsetWidth || 50;
  const room = seat.clientWidth - 2 * 52;
  fan.style.setProperty('--them-overlap', Math.min(0.42, Math.max(0.24, (1 - room / (n * width)) / 2)).toFixed(3));
}

// ---- The still states of the lab page -----------------------------------------------------------------------------------------

const SEATS = { child: 0, uggedla: 1, mosi: 2 };
const PEOPLE = {
  1: { name: 'Uggeðla', picture: 'assets/book/images/uggedla-render.webp', cls: 'veiddu-uggedla' },
  2: { name: 'Mosi', picture: 'assets/eitt/mosi.webp', cls: 'veiddu-mosi' },
};
// A hand of so many distinct kinds, a mix of animals and fish, so a hand of any size shows both (a full hand is all 13).
const MIX = ['froskur', 'fiskur-gulur', 'skjaldbaka', 'fiskur-blar', 'salamandra', 'fiskur-raudur', 'snigill', 'fiskur-graenn', 'drekafluga',
  'fiskur-appelsinugulur', 'brunnklukka', 'fiskur-fjolublar', 'vatnalaesingi'];
const POINTER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h9V3.5L22 12l-10 8.5V16H3z" fill="#f2b630" stroke="#3b2f25" stroke-width="2.4" stroke-linejoin="round"/></svg>';
const AGAIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.05-4.95M19 4.5v4.6h-4.6" fill="none" stroke="#3b2f25" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 12a7 7 0 1 1-2.05-4.95M19 4.5v4.6h-4.6" fill="none" stroke="#fffaf0" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" fill="none" stroke="#3b2f25" stroke-width="4" stroke-linecap="round"/></svg>';
const CAP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 9.5L12 5l9.5 4.5L12 14z" fill="#fffaf0" stroke="#3b2f25" stroke-width="2" stroke-linejoin="round"/><path d="M6.5 11.6v4.2c3.3 2.6 7.7 2.6 11 0v-4.2" fill="none" stroke="#3b2f25" stroke-width="2" stroke-linejoin="round"/><path d="M20 10.5v5" stroke="#3b2f25" stroke-width="2" stroke-linecap="round"/></svg>';

export const STILL_STATES = ['table', 'ask', 'asked', 'fish', 'win', 'cards', 'advice'];

/** A small element: tag, classes and attributes in one go (attributes with a null value are left out). */
function make(doc, tag, className, attributes = {}, html = '') {
  const el = doc.createElement(tag);
  if (className) el.className = className;
  if (tag === 'button') el.type = 'button';
  for (const [name, value] of Object.entries(attributes)) if (value !== null && value !== undefined) el.setAttribute(name, value);
  if (html) el.innerHTML = html;
  return el;
}

/** The pairs laid down, as the catch shows them: the last pair face up and how many; its edges stack up as the pairs pile up. */
function catchElement(doc, laid, who) {
  const n = laid.length;
  const depth = n === 0 ? 'empty' : n === 1 ? 0 : n < 4 ? 1 : n < 7 ? 2 : 3;
  const el = make(doc, 'div', 'veiddu-catch', { 'data-depth': depth, role: 'img', 'aria-label': `${who} á ${n} ${n === 1 ? 'par' : 'pör'}` });
  if (n) {
    const pair = make(doc, 'span', 'veiddu-pair');
    const kind = laid.at(-1);
    for (let copy = 1; copy <= 2; copy++) pair.append(cardElement(doc, { id: `${kind}-${copy}`, kind }, { mini: true }));
    el.append(pair);
  }
  el.append(make(doc, 'b', 'veiddu-catch-count', { 'aria-hidden': 'true' }, String(n)));
  return el;
}

/** An opponent's place: its window, its cards face down with their number, and its catch. */
function seatElement(doc, seat, { held, laid, target = false }) {
  const person = PEOPLE[seat];
  const el = make(doc, 'section', 'veiddu-seat', { 'data-seat': seat });
  const window = make(doc, 'div', `${person.cls}${target ? ' veiddu-target' : ''}`, { role: target ? 'button' : null, tabindex: target ? '0' : null, 'aria-label': person.name });
  const picture = make(doc, 'img', '', { src: asset(person.picture), alt: '' });
  window.append(picture);
  el.append(window);
  if (seat === SEATS.uggedla) el.append(make(doc, 'div', 'veiddu-uggedla-frame', { 'aria-hidden': 'true' }));
  const fan = make(doc, 'div', 'veiddu-their-hand', { role: 'img', 'aria-label': `${person.name} á ${held} spil` });
  for (let k = 0; k < held; k++) fan.append(cardElement(doc, null));
  el.append(fan, make(doc, 'span', 'veiddu-count', { 'aria-hidden': 'true' }, String(held)), catchElement(doc, laid, person.name));
  if (!held) el.querySelector('.veiddu-count').hidden = true;
  return el;
}

/** The pond: a water oval, its ripples and up to 14 cards lying face down where they were thrown (a card keeps its place as others go). */
function pondElement(doc, count, { calls = false, splash = false } = {}) {
  const pond = make(doc, 'div', `veiddu-pond${calls ? ' calls' : ''}`, { role: 'button', tabindex: '0', 'aria-label': `Tjörnin: ${count} spil` });
  for (let k = 0; k < 3; k++) pond.append(make(doc, 'i', 'veiddu-ripple', { style: `--d:${(-k * 2.2).toFixed(1)}s` }));
  const shown = Math.min(count, 14);
  for (let k = 0; k < shown; k++) {
    const angle = k * 2.399963;
    const reach = Math.sqrt((k + 0.5) / 14);
    const card = cardElement(doc, null);
    card.classList.add('veiddu-pond-card');
    card.style.cssText = `--x:${(50 + 40 * reach * Math.cos(angle)).toFixed(1)}%;--y:${(50 + 35 * reach * Math.sin(angle)).toFixed(1)}%;--r:${((k * 53) % 44) - 22}deg;--i:${k}`;
    pond.append(card);
  }
  if (splash) {
    const drops = make(doc, 'div', 'veiddu-splash frozen', { 'aria-hidden': 'true' });
    for (let k = 0; k < 11; k++) {
      const side = k % 2 ? 1 : -1;
      drops.append(make(doc, 'i', '', { style: `--x:${side * (40 + ((k * 53) % 170))}px;--a:${(0.7 + ((k * 13) % 7) / 10).toFixed(1)};--t:${(1 + (k % 4) * 0.12).toFixed(2)}s` }));
    }
    pond.append(drops);
  }
  return pond;
}

/** Egill's own place on the bottom left: his tag (his picture from Fjölspil's seats) over his catch. */
function meElement(doc, laid) {
  const egill = avatarOf('egill');
  const el = make(doc, 'div', 'veiddu-me-catch');
  const tag = make(doc, 'div', 'veiddu-tag');
  const face = make(doc, 'img', 'veiddu-face', { src: asset(egill.picture), alt: '', style: `--c:${egill.colour}` });
  tag.append(face, make(doc, 'span', '', {}, egill.name));
  el.append(tag, catchElement(doc, laid, egill.name));
  return el;
}

/** What is said, by `from` to `to` (seats; to is null when nobody is asked). */
function bubbleElement(doc, from, to, words, { long = false } = {}) {
  const el = make(doc, 'div', `veiddu-bubble${long ? ' long' : ''}`, { 'data-from': from, 'data-to': to, role: 'status' });
  el.append(make(doc, 'p', '', {}, words));
  if (to !== null) el.append(make(doc, 'span', 'veiddu-bubble-arrow', { 'aria-hidden': 'true' }, POINTER));
  return el;
}

/** The win card, under the opponents' windows, with its sticker and confetti. */
function winElement(doc) {
  const win = make(doc, 'div', 'veiddu-win');
  const card = make(doc, 'div', 'veiddu-win-card');
  card.append(
    make(doc, 'button', 'veiddu-close', { 'aria-label': 'Aftur í bókina' }, CROSS),
    make(doc, 'h2', '', {}, 'Þú vannst!'),
    make(doc, 'div', 'veiddu-sticker', { role: 'img', 'aria-label': 'Uggeðlulímmiði' }),
    make(doc, 'p', 'veiddu-win-words', {}, 'Límmiði í bókina!'),
    make(doc, 'button', 'veiddu-again', {}, `${AGAIN}<span>Spilum aftur?</span>`),
  );
  const confetti = make(doc, 'div', 'veiddu-confetti', { 'aria-hidden': 'true' });
  const colours = ['#e8483b', '#f7bd2b', '#48ad4a', '#3a8de4', '#f08a24', '#8b5cc8', '#3fb0b8'];
  for (let k = 0; k < 56; k++) {
    confetti.append(make(doc, 'i', '', { style: `--c:${colours[k % colours.length]};--x:${((k * 61.8) % 100).toFixed(1)}%;--a:${(k * 67) % 180}deg;--t:${(3.2 + (k % 5) * 0.45).toFixed(2)}s;--d:${(-((k * 1.93) % 4.6)).toFixed(2)}s` }));
  }
  win.append(card, confetti);
  return win;
}

/** Everything the lab's states have in common: the table with the two opponents, the pond, Egill's place, the buttons. */
function tableElement(doc, round) {
  const table = make(doc, 'div', 'veiddu-table');
  const [, ugg, mosi] = round.pairs;
  table.append(
    seatElement(doc, SEATS.uggedla, { held: round.theirs[0], laid: ugg, target: round.targets }),
    seatElement(doc, SEATS.mosi, { held: round.theirs[1], laid: mosi, target: round.targets }),
    pondElement(doc, round.pond, { calls: round.calls, splash: round.splash }),
    meElement(doc, round.pairs[0]),
  );
  const hand = make(doc, 'div', 'veiddu-hand', { role: 'group', 'aria-label': 'Spilin þín' });
  for (const id of round.mine) {
    const card = cardElement(doc, { id: `${id}-1`, kind: id }, { tag: 'button' });
    if (id === round.picked) card.classList.add('picked');
    if (id === round.hint) card.classList.add('hint');
    hand.append(card);
  }
  table.append(hand, make(doc, 'button', 'veiddu-mosi-help', { 'aria-label': 'Spyrja Mosa' }));
  if (round.bubble) table.append(bubbleElement(doc, ...round.bubble));
  if (round.advice) {
    const advice = make(doc, 'div', 'veiddu-advice');
    advice.append(make(doc, 'img', '', { src: asset('assets/book/images/mosi-render.webp'), alt: '' }), make(doc, 'p', '', {}, round.advice));
    table.append(advice);
  }
  if (round.fishButton) table.append(make(doc, 'button', 'veiddu-fish-button', {}, `<span>Farðu að veiða!</span>`));
  table.append(
    make(doc, 'button', 'veiddu-teach', { 'aria-label': 'Kennsla' }, `${CAP}<span>Kennsla</span>`),
    make(doc, 'button', 'veiddu-close veiddu-quit', { 'aria-label': 'Hætta' }, CROSS),
  );
  return table;
}

/** The kinds of the round each still shows: what the child holds, what the others hold, the pairs laid (child, Uggeðla, Mosi). */
function roundOf(state, params) {
  const handSize = Math.min(13, Math.max(1, Number(params.get('hand')) || 0));
  const doubled = [...ORDER, ...ORDER];
  const round = {
    mine: ['froskur', 'skjaldbaka', 'salamandra', 'fiskur-gulur', 'snigill', 'fiskur-blar'],
    theirs: [5, 4],
    pairs: [['drekafluga', 'vatnalaesingi'], ['brunnklukka', 'fiskur-raudur', 'fiskur-graenn'], ['fiskur-fjolublar', 'fiskur-appelsinugulur']],
  };
  if (params.has('hand')) round.mine = MIX.slice(0, handSize);
  if (state === 'ask') {
    round.picked = 'skjaldbaka';
    round.targets = true;
  } else if (state === 'asked') {
    const have = params.get('have') !== '0';
    const kind = have ? 'froskur' : 'drekafluga';
    if (!have) round.mine = round.mine.filter(id => id !== kind);
    else if (!round.mine.includes(kind)) round.mine = [kind, ...round.mine];
    round.bubble = [SEATS.mosi, SEATS.child, `Áttu ${kindFor(kind).ask}?`];
    if (have) round.hint = kind;
    else round.fishButton = true;
  } else if (state === 'fish') {
    round.bubble = [SEATS.uggedla, SEATS.child, 'Nei! Farðu að veiða!'];
    round.calls = true;
    round.splash = params.get('splash') === '1';
  } else if (state === 'advice') {
    round.advice = 'Uggeðla bað um þetta dýr. Spurðu hana!';
    round.hint = 'salamandra';
    if (!round.mine.includes('salamandra')) round.mine = ['salamandra', ...round.mine];
  } else if (state === 'win') {
    round.mine = [];
    round.theirs = [0, 0];
    round.pairs = [doubled.slice(0, 11), doubled.slice(11, 19), doubled.slice(19, 26)];
  }
  round.mine = [...round.mine].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const laid = round.pairs.reduce((sum, pairs) => sum + 2 * pairs.length, 0);
  round.pond = Math.max(0, ORDER.length * COPIES - laid - round.mine.length - round.theirs[0] - round.theirs[1]);
  return round;
}

/**
 * Draws `state` (one of STILL_STATES) into `root` (the .veiddu element) as still markup, for the lab page and its captures. `params` are
 * the page's URLSearchParams: hand=N gives the child N distinct kinds (1 to 13), have=0 (with state asked) makes the animal asked for one
 * the child does not hold, splash=1 (with state fish) catches the droplets in the air.
 */
export function renderStill(doc, root, state, params = new URLSearchParams()) {
  root.replaceChildren();
  if (state === 'cards') {
    const gallery = make(doc, 'div', 'veiddu-gallery', { role: 'group', 'aria-label': 'Öll spilin' });
    for (const kind of KINDS) gallery.append(cardElement(doc, { id: `${kind.id}-1`, kind: kind.id }));
    gallery.append(cardElement(doc, null));
    root.append(gallery);
    return;
  }
  const round = roundOf(state, params);
  const table = tableElement(doc, round);
  root.append(table);
  if (state === 'win') root.append(winElement(doc));
  // The hands and the fans are laid out once the table has its size.
  for (const seat of table.querySelectorAll('.veiddu-seat')) layTheirs(seat.querySelector('.veiddu-their-hand'), seat);
  layoutHand(table.querySelector('.veiddu-hand'));
}
