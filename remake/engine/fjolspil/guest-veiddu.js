// The guest's screen of "Veiddu" on her phone or tablet (spec §11, Task 9). Go Fish keeps a hand hidden, so every human seat, Egill's too, plays
// from a device of her own and the big screen is only the pond with every seat's tag and what is said (the owner's answer of 2026-11-01).
// This is that device: her own hand, and what she needs of the others. From the top:
//   the heading     whose turn it is, in that seat's colour ("Þú átt leik!", "Anna á leik", at the end "{name} vann!"), with one line under it
//                   that says what to do now ("Pikkaðu á spil", "Pikkaðu á þann sem þú spyrð", "Pikkaðu á tjörnina!") and the last thing
//                   said at the table ("Anna → Bjarni: Áttu frosk?", "Bjarni: Nei!"), which is what a player remembers
//   the others      a tag each (.spil-veiddu-seat, a button): the picture, the name, how many cards the seat holds and the pairs it has laid;
//                   .turn on the one whose turn it is, .absent on one whose phone is away, and .target (glowing) on those she may ask once
//                   she has picked a card
//   the pond        .spil-veiddu-pond, a button: it calls (.calls) when she must fish, and a tap draws; "Farðu að veiða!" (.spil-veiddu-no)
//                   comes when she is asked for an animal she has not got
//   her hand        .spil-veiddu-hand, the game's cards (look.js cardElement, veiddu.css) in rows, each at least 88 px across; a tap lifts a
//                   card (.picked); when she is asked for an animal she holds, that card lights (.give) and is the one right answer, and
//                   any other wiggles
//   her catch       the pairs she has laid (.spil-veiddu-mine), with their number
// The turn is hard to miss on her own device, as in Eitt! (guest-eitt.js): when something becomes hers to do (her turn, or a question for
// her) a frame in her own colour glows round the screen for as long as it is hers (.spil-veiddu-frame, .on), a card with her picture slides
// in over the middle (.spil-veiddu-cue: "Þú átt leik!", or "{name} spyr þig!") for about two seconds and a half or until her first touch, and
// the chime sounds and the phone buzzes where it can. Only something that becomes hers does this, never a view that repeats it.
//
// Acts, one for each view: { type: 'ask', target, kind }, { type: 'give', cardId }, { type: 'no' }, { type: 'fish' }. The big screen decides
// everything (the rules, the random numbers: engine/veiddu/remote.js); an act waits for the next view, so a second tap before it sends
// nothing, and an act it refuses comes back as a fresh view. The device plays the game's own effects (veiddu-sounds.js on the page's audio
// context, tuned to the game's music), only its own: the chime, the flick of a card lifted, the draw of a card fished, a pair, the wiggle of
// a wrong card, the fanfare of her win. Never a voice and never the music: those are the big screen's (spec §13).
//
// renderVeiddu(root, view, { send, doc, audio }) is guest.js's game screen for 'veiddu': `root` is the page's .spil-game, the same one while
// veiddu views follow one another, so the screen is built in it once and updated after. Names are text, never markup. The look is spil.css's
// "Veiddu" part over veiddu.css's cards.

import { KINDS } from '../veiddu/cards.js';
import { cardElement, catchElement } from '../veiddu/look.js';
import { questionText, kindName, winnersWords } from '../veiddu/remote.js';
import { veidduSounds, VEIDDU_GAPS } from '../veiddu/veiddu-sounds.js';
import { avatarOf } from './seats.js';
import { pressable, reducedMotion, sparkle } from '../book/fx.js';

/** Everything the screen says. */
export const WORDS = {
  mine: 'Þú átt leik!',
  theirs: name => `${name} á leik`,
  askedYou: name => `${name} spyr þig!`,
  youWon: 'Þú vannst!',
  pick: 'Pikkaðu á spil',
  target: 'Pikkaðu á þann sem þú spyrð',
  give: 'Pikkaðu á spilið!',
  no: 'Þú átt það ekki',
  fish: 'Pikkaðu á tjörnina!',
  wait: 'Bíddu aðeins…',
  fishButton: 'Farðu að veiða!',
  pond: n => `Tjörnin: ${n} spil`,
  hand: 'Spilin þín',
  others: 'Hin',
  cards: (name, n) => `${name} á ${n} spil`,
  pairs: (name, n) => `${name} á ${n} ${n === 1 ? 'par' : 'pör'}`,
  yes: 'Já!',
  noSaid: 'Nei!',
  fished: name => `${name} veiddi!`,
  lucky: name => `${name} veiddi það!`,
  laid: (name, kind) => `${name} fékk par: ${kindName(kind)}`,
  empty: 'Tjörnin er tóm!',
  mineCatch: 'Aflinn þinn',
};

const REMAKE = new URL('../../', import.meta.url);
const asset = path => new URL(path, REMAKE).href;
/** The device's effects: the table's, tuned to the key of the game's music (its music.json; the music itself never plays here). */
const EFFECTS = { music: asset('assets/audio/eitt/music.mp3'), sounds: veidduSounds, gaps: VEIDDU_GAPS };

const ORDER = KINDS.map(kind => kind.id);
const byKind = (a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.id.localeCompare(b.id);

const TAP_PX = 88; // the least a card of the hand shows across (STYLE.md): a hand that would show less lies in rows
const FLY_MS = 430; // a card from the pond or another seat into the hand
const DEAL_MS = 360;
const DEAL_GAP = 105; // between two cards dealt
const GLIDE_MS = 320; // the hand closing up or making room
const CUE_MS = 2500; // her card stays this long, or until her first touch
const CUE_FADE_MS = 220; // and fades out this long
const BUZZ = [60, 40, 60]; // ms of buzz, quiet, buzz: where the phone has a motor

const DUTIES = new Set(['ask', 'fish', 'give', 'no']);

/** Each .spil-game this screen has been built in, and its parts. */
const built = new WeakMap();
/** The screen shown last (a page shows one at a time), and the windows that already lay its hand out again when resized. */
let shown = null;
const resizing = new WeakSet();

/** The screen of `view` in `root`: built the first time, updated after. */
export function renderVeiddu(root, view, { send, doc = root.ownerDocument, audio = null } = {}) {
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

  const screen = make('div', 'spil-veiddu');
  const headEl = make('div', 'spil-veiddu-head');
  const turnEl = make('h2', 'spil-veiddu-turn');
  turnEl.setAttribute('aria-live', 'polite');
  const doEl = make('p', 'spil-veiddu-do');
  const heardEl = make('p', 'spil-veiddu-heard');
  heardEl.setAttribute('aria-live', 'polite');
  headEl.append(turnEl, doEl, heardEl);
  const seatsEl = make('ul', 'spil-veiddu-seats');
  seatsEl.setAttribute('aria-label', WORDS.others);
  const midEl = make('div', 'spil-veiddu-mid');
  const pondEl = make('button', 'spil-veiddu-pond');
  const pondCount = make('span', 'spil-veiddu-pond-count');
  pondEl.append(make('i', 'spil-veiddu-ripple'), make('i', 'spil-veiddu-ripple'), pondCount);
  const noEl = make('button', 'spil-veiddu-no');
  const noWords = make('span');
  noWords.textContent = WORDS.fishButton;
  noEl.append(noWords);
  noEl.hidden = true;
  midEl.append(pondEl, noEl);
  const handEl = make('div', 'spil-veiddu-hand');
  handEl.setAttribute('aria-label', WORDS.hand);
  const mineEl = make('div', 'spil-veiddu-mine');
  const mineLabel = make('span', 'spil-veiddu-mine-label');
  mineLabel.textContent = WORDS.mineCatch;
  mineEl.append(mineLabel);
  // The frame round the screen for what is hers to do, and the card that comes over the middle as it begins (both out of the layout: fixed).
  const frameEl = make('div', 'spil-veiddu-frame');
  frameEl.setAttribute('aria-hidden', 'true');
  const cueEl = make('div', 'spil-veiddu-cue');
  cueEl.setAttribute('aria-hidden', 'true'); // the heading says it to a screen reader
  cueEl.hidden = true;
  const cueFace = make('span', 'spil-face spil-veiddu-cue-face');
  const cuePicture = make('img', 'spil-picture');
  cuePicture.alt = '';
  cueFace.append(cuePicture);
  const cueWords = make('span', 'spil-veiddu-cue-words');
  cueEl.append(cueFace, cueWords);
  screen.append(frameEl, headEl, seatsEl, midEl, handEl, mineEl, cueEl);
  root.replaceChildren(screen);

  const at = {
    doc, win: doc.defaultView ?? undefined, make,
    screen, turnEl, doEl, heardEl, seatsEl, pondEl, pondCount, noEl, handEl, mineEl,
    frameEl, cueEl, cuePicture, cueWords,
    cue: null, // her card while it shows: { timer, token, touch }
    cues: 0, // the cards shown so far, so a card put away does not hide a newer one
    cueFade: null, // the animation fading her card out
    send: null, audio: null,
    view: null, // the view shown
    sent: false, // an act is on its way to the big screen: nothing more until the next view
    picked: null, // the kind she has lifted, to ask for
    cards: new Map(), // card id -> its button in the hand
    seats: new Map(), // seat -> its tag at the top
    mine: null, // her catch as it shows: { el } (replaced as pairs are laid)
    laid: 0, // pairs in it
  };
  press(at, pondEl, () => tapPond(at));
  press(at, noEl, () => act(at, { type: 'no' }), 'flick');
  if (at.win && !resizing.has(at.win)) { // one listener for the page, whichever screen is on it (a new root after every wait)
    resizing.add(at.win);
    at.win.addEventListener?.('resize', () => { if (shown?.view && shown.screen.isConnected) layHand(shown); });
  }
  built.set(root, at);
  return at;
}

// ---- Touch and sound ------------------------------------------------------------------------------------------------

/**
 * A control of the game: a tap through the book's pressable (its squash and its sparks; `sound` one of the game's own effects, none where
 * the act has its own), and Enter or Space on it when it has the focus.
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
function play(at, name, detail) {
  try {
    at.audio?.effects?.(EFFECTS)?.play(name, detail);
  } catch {
    // no sound here
  }
}

/** An act to the big screen, one for each view: what came of it is the next view. False when one is on its way already. */
function act(at, body) {
  if (at.sent || !at.view) return false;
  at.sent = true;
  at.screen.classList.add('sent');
  at.send?.(body);
  return true;
}

/** A wiggle: no. */
function nope(at, el) {
  play(at, 'wiggle');
  if (typeof el.animate !== 'function') return;
  el.animate(reducedMotion(at.win)
    ? [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }]
    : ['0', '-7', '6', '-4', '2', '0'].map(deg => ({ transform: `rotate(${deg}deg)` })), { duration: 480, easing: 'ease-in-out' });
}

const modeOf = view => (typeof view?.mode === 'string' ? view.mode : 'wait');

function tapCard(at, id) {
  const view = at.view;
  const card = view?.hand?.find?.(held => held?.id === id);
  const el = at.cards.get(id);
  if (!card || !el || at.sent) return;
  const mode = modeOf(view);
  if (mode === 'ask') {
    at.picked = card.kind; // another card changes it
    play(at, 'flick', { soft: true });
    marks(at);
    return;
  }
  if (mode === 'give' && view.asked?.kind === card.kind) {
    if (act(at, { type: 'give', cardId: id })) el.classList.add('going');
    return;
  }
  nope(at, el); // a card that is not the answer, or a turn that is not hers
}

function tapSeat(at, seat) {
  const view = at.view;
  const el = at.seats.get(seat)?.li;
  if (!el || at.sent) return;
  const targets = Array.isArray(view?.targets) ? view.targets : [];
  if (modeOf(view) !== 'ask' || !at.picked || !targets.includes(seat)) {
    nope(at, el);
    return;
  }
  if (act(at, { type: 'ask', target: seat, kind: at.picked })) el.classList.add('going');
}

function tapPond(at) {
  if (!at.view || at.sent) return;
  if (modeOf(at.view) !== 'fish') {
    nope(at, at.pondEl);
    return;
  }
  act(at, { type: 'fish' });
}

// ---- Her turn: the frame, and the card that comes over the middle -----------------------------------------------------

/** The frame round the screen in her own colour, glowing while something is hers to do. */
function turnFrame(at, mine, colour) {
  if (colour) at.frameEl.style.setProperty('--c', colour);
  at.frameEl.classList.toggle('on', mine);
}

/**
 * Something has just become hers to do: her card slides in over the middle (her picture and `words`, in her colour), the chime sounds and
 * the phone buzzes where it can. The card goes at her first touch anywhere or after CUE_MS, whichever comes first; it takes no touch itself
 * (pointer-events: none), and the page's listener only watches, so the tap that picks a card picks it.
 */
function turnCue(at, avatar, words) {
  endCue(at, { quick: true });
  at.cueFade?.cancel(); // an earlier card's fade-out would hold this one at nothing
  at.cueFade = null;
  if (avatar) at.cueEl.style.setProperty('--c', avatar.colour);
  const src = avatar ? asset(avatar.picture) : null;
  if (src && at.cuePicture.src !== src) at.cuePicture.src = src; // never an empty src, which a browser would read as the page
  at.cuePicture.hidden = !avatar;
  at.cueWords.textContent = words;
  at.cueEl.hidden = false;
  const token = ++at.cues;
  const touch = () => endCue(at);
  at.doc.addEventListener?.('pointerdown', touch, true); // watching only: the touch goes on to whatever it was for
  const timer = (at.win?.setTimeout ?? globalThis.setTimeout)(() => endCue(at), CUE_MS);
  at.cue = { timer, token, touch };
  play(at, 'turn');
  try {
    const phone = at.win?.navigator ?? globalThis.navigator;
    if (phone?.userActivation?.hasBeenActive !== false) phone?.vibrate?.(BUZZ); // a page nobody has touched is not let to buzz (and says so in the console)
  } catch {
    // no buzz here
  }
}

/** Her card goes: at once where `quick` (another view took it, or a newer card begins), else it fades out. */
function endCue(at, { quick = false } = {}) {
  const cue = at.cue;
  if (!cue) return;
  at.cue = null;
  (at.win?.clearTimeout ?? globalThis.clearTimeout)(cue.timer);
  at.doc.removeEventListener?.('pointerdown', cue.touch, true);
  const el = at.cueEl;
  const hide = () => {
    if (at.cues === cue.token && !at.cue) el.hidden = true; // not a newer card's
  };
  if (quick || reducedMotion(at.win) || typeof el.animate !== 'function') {
    hide();
    return;
  }
  const fade = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CUE_FADE_MS, easing: 'ease-in', fill: 'forwards' });
  at.cueFade = fade;
  const done = () => {
    if (at.cueFade === fade) at.cueFade = null;
    fade.cancel(); // the card is hidden (or a newer one shows): its fade-out must not go on holding the opacity
    hide();
  };
  fade.finished.then(done, done);
}

// ---- The view -------------------------------------------------------------------------------------------------------

const isSeat = value => Number.isInteger(value);
/** `next` takes the place of `old` in the page. */
function swap(old, next) {
  old.parentNode?.insertBefore(next, old);
  old.remove();
}
const numbers = list => (Array.isArray(list) ? list : []);

/** The last thing said at the table, in words with no name in a case (a name is shown as it was typed). */
export function heardText(event, names) {
  const name = seat => String(names[seat] ?? '');
  switch (event?.type) {
    case 'ask': return `${name(event.seat)} → ${name(event.target)}: ${questionText(event.kind)}`;
    case 'give': return `${name(event.from)}: ${WORDS.yes}`;
    case 'no': return `${name(event.seat)}: ${WORDS.noSaid}`;
    case 'pair': return WORDS.laid(name(event.seat), event.kind);
    case 'fish': return event.lucky ? WORDS.lucky(name(event.seat)) : WORDS.fished(name(event.seat));
    case 'pond-empty': return WORDS.empty;
    default: return '';
  }
}

function update(at, view) {
  const prev = at.view;
  at.view = view;
  at.sent = false;
  at.screen.classList.remove('sent');
  const names = numbers(view.names);
  const avatars = numbers(view.avatars);
  const you = isSeat(view.seat) ? view.seat : 0;
  const mode = modeOf(view);
  const over = mode === 'over';
  const nameOf = seat => String(names[seat] ?? '');
  const avatarAt = seat => avatarOf(avatars[seat]);
  const duty = DUTIES.has(mode);
  const prevDuty = Boolean(prev) && DUTIES.has(modeOf(prev));
  if (mode !== 'ask') at.picked = null;
  const hand = numbers(view.hand).filter(card => typeof card?.id === 'string' && typeof card?.kind === 'string').sort(byKind);
  if (at.picked && !hand.some(card => card.kind === at.picked)) at.picked = null;

  // A new round being dealt (nothing said at the table yet, or after the end of the last): the cards come in from the pond. A phone that
  // opens on a round under way (a reload, a return) just shows it.
  const fresh = prev ? modeOf(prev) === 'over' : view.lastEvent == null;
  const before = prev ? where(at) : fresh ? { hand: new Map(), seats: new Map(), pond: rectOf(at.pondEl) } : null;
  // The heading: whose turn, in that seat's colour; the end says who won
  const winners = numbers(view.winners).filter(isSeat);
  const turnSeat = isSeat(view.turn) ? view.turn : you;
  at.turnEl.textContent = over ? (winners.length === 1 && winners[0] === you ? WORDS.youWon : winnersWords(winners, names)) : turnSeat === you ? WORDS.mine : WORDS.theirs(nameOf(turnSeat));
  at.turnEl.classList.toggle('mine', !over && turnSeat === you);
  at.turnEl.classList.toggle('won', over);
  const turnColour = over ? null : avatarAt(turnSeat)?.colour;
  if (turnColour) at.turnEl.style.setProperty('--c', turnColour);
  else at.turnEl.style.removeProperty('--c');
  at.heardEl.textContent = heardText(view.lastEvent, names);
  at.heardEl.hidden = over || !at.heardEl.textContent; // at the end the winners are the words

  // Her duty: the frame, the card, the chime
  turnFrame(at, duty, avatarAt(you)?.colour);
  if (duty && !prevDuty) {
    const asker = isSeat(view.asked?.from) ? nameOf(view.asked.from) : '';
    turnCue(at, avatarAt(you), mode === 'give' || mode === 'no' ? WORDS.askedYou(asker) : WORDS.mine);
  } else if (!duty) endCue(at, { quick: true });

  renderSeats(at, view, { you, names, avatars, over });
  renderHand(at, hand, before, fresh);
  renderMine(at, view, { you, names });
  at.pondCount.textContent = String(Number.isInteger(view.pond) ? view.pond : 0);
  at.pondEl.setAttribute('aria-label', WORDS.pond(view.pond ?? 0));
  at.noEl.hidden = mode !== 'no';
  marks(at);
  if (over && !(prev && modeOf(prev) === 'over') && winners.includes(you)) play(at, 'fanfare'); // a round lost has no jingle: the winners cheer
}

/** What is lit and what the line under the heading says, from the mode and the card picked. */
function marks(at) {
  const view = at.view;
  if (!view) return;
  const mode = modeOf(view);
  const targets = new Set(mode === 'ask' && at.picked ? numbers(view.targets) : []);
  const asked = view.asked;
  for (const [seat, tag] of at.seats) {
    tag.li.classList.toggle('target', targets.has(seat));
    tag.li.classList.toggle('asked', Boolean(asked) && (asked.to === seat || asked.from === seat) && mode !== 'over');
  }
  for (const [id, el] of at.cards) {
    const card = view.hand?.find?.(held => held?.id === id);
    el.classList.toggle('picked', mode === 'ask' && at.picked !== null && card?.kind === at.picked);
    el.classList.toggle('give', mode === 'give' && card?.kind === asked?.kind);
    el.classList.toggle('live', mode === 'ask' || (mode === 'give' && card?.kind === asked?.kind));
  }
  at.pondEl.classList.toggle('calls', mode === 'fish');
  at.screen.setAttribute('data-mode', mode);
  at.doEl.textContent = {
    ask: at.picked ? WORDS.target : WORDS.pick,
    fish: WORDS.fish,
    give: `${questionText(asked?.kind ?? ORDER[0])} ${WORDS.give}`,
    no: `${questionText(asked?.kind ?? ORDER[0])} ${WORDS.no}`,
    wait: '',
    over: '',
  }[mode] ?? '';
  at.doEl.hidden = !at.doEl.textContent;
}

function rectOf(el) {
  if (!el || el.isConnected === false || typeof el.getBoundingClientRect !== 'function') return null;
  const box = el.getBoundingClientRect();
  return box.width ? box : null;
}

function where(at) {
  return {
    hand: new Map([...at.cards].map(([id, el]) => [id, rectOf(el)])),
    seats: new Map([...at.seats].map(([seat, tag]) => [seat, rectOf(tag.li)])),
    pond: rectOf(at.pondEl),
  };
}

// ---- The others, at the top ----------------------------------------------------------------------------------------

function renderSeats(at, view, { you, names, avatars, over }) {
  const counts = numbers(view.counts);
  const catches = numbers(view.catches);
  const away = new Set(numbers(view.away));
  const n = counts.length;
  const after = seat => (((seat - you) % n) + n) % n; // the turn's order after hers
  const others = counts.map((_, seat) => seat).filter(seat => seat !== you).sort((a, b) => after(a) - after(b));
  at.seatsEl.dataset.n = String(others.length); // three others (four at the table) are tagged smaller on a short screen
  for (const [seat, tag] of at.seats) {
    if (others.includes(seat)) continue;
    tag.li.remove();
    at.seats.delete(seat);
  }
  const rows = others.map(seat => {
    let tag = at.seats.get(seat);
    if (!tag) {
      tag = makeSeat(at, seat);
      at.seats.set(seat, tag);
    }
    const name = String(names[seat] ?? '');
    const cards = Number.isInteger(counts[seat]) && counts[seat] > 0 ? counts[seat] : 0;
    const laid = numbers(catches[seat]);
    const avatar = avatarOf(avatars[seat]);
    setFace(tag, avatars[seat]);
    tag.name.textContent = name;
    tag.count.textContent = String(cards);
    tag.li.setAttribute('aria-label', `${WORDS.cards(name, cards)}. ${WORDS.pairs(name, laid.length)}`);
    tag.li.style.setProperty('--c', avatar?.colour ?? 'transparent');
    tag.li.classList.toggle('turn', !over && view.turn === seat);
    tag.li.classList.toggle('won', over && numbers(view.winners).includes(seat));
    tag.li.classList.toggle('absent', away.has(seat));
    tag.li.classList.toggle('empty', cards === 0);
    if (tag.laid !== laid.length || tag.last !== laid.at(-1)) { // her catch: the last pair laid, and how many
      const next = catchElement(at.doc, laid, name);
      next.querySelector('.veiddu-catch-count').textContent = String(laid.length);
      swap(tag.catch, next);
      tag.catch = next;
      tag.laid = laid.length;
      tag.last = laid.at(-1);
    }
    return tag.li;
  });
  const now = [...at.seatsEl.children];
  if (now.length !== rows.length || rows.some((li, k) => now[k] !== li)) at.seatsEl.replaceChildren(...rows);
}

function makeSeat(at, seat) {
  const li = at.make('li', 'spil-veiddu-seat');
  li.dataset.seat = String(seat);
  const hit = at.make('button', 'spil-veiddu-seat-hit');
  const face = at.make('span', 'spil-face spil-veiddu-face');
  const picture = at.make('img', 'spil-picture');
  picture.alt = '';
  face.append(picture);
  const name = at.make('span', 'spil-veiddu-name');
  const back = at.make('span', 'spil-veiddu-back');
  back.setAttribute('aria-hidden', 'true');
  back.append(cardElement(at.doc, null, { back: true }));
  const count = at.make('span', 'spil-veiddu-count');
  count.setAttribute('aria-hidden', 'true');
  const caught = catchElement(at.doc, [], '');
  const meta = at.make('div', 'spil-veiddu-meta'); // the cards she holds, and her pairs
  meta.append(back, count, caught);
  hit.append(face, name);
  li.append(hit, meta);
  press(at, hit, () => tapSeat(at, seat), 'flick');
  return { li, hit, face, picture, name, count, catch: caught, laid: -1, last: undefined };
}

function setFace({ face, picture }, id) {
  const avatar = avatarOf(id);
  const src = avatar ? asset(avatar.picture) : null;
  if (src && picture.src !== src) picture.src = src; // never an empty src, which a browser would read as the page
  picture.hidden = !avatar;
  face.style.setProperty('--c', avatar?.colour ?? 'transparent');
}

// ---- Her catch --------------------------------------------------------------------------------------------------------

function renderMine(at, view, { you, names }) {
  const laid = numbers(view.catches?.[you]);
  const last = laid.at(-1);
  if (at.mine && at.laid === laid.length && at.mineLast === last) return;
  const next = catchElement(at.doc, laid, String(names[you] ?? ''));
  next.querySelector('.veiddu-catch-count').textContent = String(laid.length);
  if (at.mine) swap(at.mine, next);
  else at.mineEl.append(next);
  const grew = at.mine !== null && laid.length > at.laid;
  at.mine = next;
  at.laid = laid.length;
  at.mineLast = last;
  if (grew) {
    play(at, 'pair');
    sparkle(next, 8, at.win);
  }
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
    const el = cardElement(at.doc, card, { tag: 'button' });
    press(at, el, () => tapCard(at, card.id));
    at.cards.set(card.id, el);
    added.push(el);
  }
  const wanted = cards.map(card => at.cards.get(card.id));
  const now = [...at.handEl.children];
  if (now.length !== wanted.length || wanted.some((el, k) => now[k] !== el)) at.handEl.replaceChildren(...wanted);
  for (const el of at.cards.values()) el.classList.remove('going');
  layHand(at);
  if (!before) return;
  glide(at, before.hand);
  if (!added.length) return;
  // In from the pond (a deal, or a card she fished) or from the seat that gave it, one after another
  const view = at.view;
  const event = view.lastEvent;
  const giver = event?.type === 'give' && event.to === view.seat ? event.from : null;
  const from = giver !== null ? (before.seats.get(giver) ?? before.pond) : before.pond;
  if (!fresh && giver === null) play(at, 'draw');
  added.forEach((el, k) => {
    fly(at, el, from, { duration: fresh ? DEAL_MS : FLY_MS, delay: k * (fresh ? DEAL_GAP : 170) })
      .then(() => play(at, 'flick', { soft: true }));
  });
}

/**
 * The hand in rows, centred: each card at least TAP_PX across where it shows, so a hand too big for one row lies in two or more, the
 * first cards at the back and each row centred under the one before (as the table's big hands do). The cards' places are --x, --y and
 * --r (spil.css), and the hand's height --hand-h.
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
  const rowStep = h * 0.97; // a card's name is on a plate at its foot (a quarter of it): the next row lies below it, so every name can be read
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
 * `el` flies to where it is from `from` (a rect) in an arc, growing to its size on the way, after `delay`: transform only, and a fade
 * where it is under reduced motion. Resolves when it has landed (at once where nothing can move).
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
