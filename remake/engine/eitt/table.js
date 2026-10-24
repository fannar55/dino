import { makeDeck, newGame, next, play, draw, pass, callEitt, catchEitt, canDraw, canPlay, playable, isWild } from './rules.js';
import { chooseMove, willCallEitt, willCatch } from './kambedla.js';
import { SKILL_START, afterRound, inRound } from './skill.js';
import { advise, adviseColour } from './advice.js';
import { pressable, sparkle, reducedMotion, TAP_SLOP_PX } from '../book/fx.js';
import { createGameSfx } from '../audio/game-music.js';
import { createVoice } from '../scene/voice.js';
import { eittSounds, EITT_GAPS, createEittMusic } from './eitt-sounds.js';

// The table of "Eitt!" (spec sections 5 to 9): the round the child plays with Kambeðla, rendered into eitt.css's classes (the class
// list is at the top of eitt.css, which is the game's whole look). The rules, Kambeðla's choices, her skill and Mosi's advice are the
// pure modules beside this one; this is the DOM, the motion, the sound and the pace over them.
//
//   - The deal: the deck shuffles, seven cards fly to each hand (the child's turn over as they land), and the first card turns
//     over onto the pile. The child begins.
//   - The child's turn: a tap on a card that goes sends it flying to the pile; one that does not go wiggles, softly. A tap on the
//     deck draws a card when nothing goes (and wiggles when something does, lifting what goes). A drawn card that goes lifts, and
//     "Áfram" keeps it instead. A wild brings up the four colour buttons. After about 6 s with nothing done (3 s in the first
//     round after the tutorial), what goes lifts (or the deck calls); after 7 s Kambeðla may say "Þín umferð!", at most once in 20 s.
//   - "Eitt!": the round button glows and pulses while somebody owes the call. The child taps it to call (Kambeðla hops for joy),
//     or, when she forgot hers, to catch her: she draws two and says "Úps, ég gleymdi!". She catches the child as her skill lets her.
//   - Mosi's button: Mosi pops up with his advice and why (advice.js reasons) in a bubble and his voice, and his pick lifts and
//     glows (a card, the deck, the "Eitt!" button or a colour). Asking costs nothing.
//   - The child's "Eitt!" is Egill's too: he says it, in a caption by the button.
//   - The tutorial ("Kennsla", tasks 3b and 3c): the first time the game opens (the save has no tutorialDone), and whenever the child
//     asks for it again (the table's Kennsla button, or the book's), Mosi teaches two short rounds dealt from stacked decks, one step
//     at a time (TUTORIAL): the goal, every card played once, why "Eitt!" matters (the child calls it, then catches Kambeðla), three
//     checks where nothing is lit and the child finds the card that fits, and a recap. Only what he means is live, the rest is
//     dimmed, nothing goes on until the child does the step, and each step is a sentence or two, shown and spoken. "Sleppa" ends it at
//     any time. However it ends (the recap, "Sleppa", or somebody winning its game) it is no round: no sticker, and nothing for her
//     skill. Mosi says the first real game comes now (eitt_tut_real), and then a real round is dealt.
//   - Kambeðla's turn: she thinks (her head tilts, about 1.2 s; longer while the child owes an "Eitt!", to give the child the time),
//     then plays or draws; her plates glow in the colour she picks, her tail swishes on a skip, and she moves again after a skip, a
//     reverse, a +2 or a +4.
//   - The end: the winner's words, confetti and Kambeðla's sticker in the save for a child who won, "Spilum aftur?", and her skill
//     updated (skill.js afterRound). She cheers whoever won.
// Input waits while a card flies or Kambeðla moves. Under prefers-reduced-motion a flight is a fade where the card lands.
//
// Sound: the game's own effects (eitt-sounds.js) and music, and Kambeðla's, Mosi's and Egill's lines (the `eitt` set of
// lines-source.json), played from lines.json when they are recorded and quiet until then, one voice at a time (say). Mosi's words
// show in his bubble either way.

const REMAKE = new URL('../../', import.meta.url); // remake/: where lines.json's paths and the pictures start
const asset = path => new URL(path, REMAKE).href;
const MUSIC = asset('assets/audio/eitt/music.mp3');

const TAP_PX = 88; // the least a card of the child's hand may show across to be tapped (eitt.css's --eitt-target): a bigger hand lies in rows
const THINK_MS = 1200; // Kambeðla's pace: she thinks this long before each move
const OWED_MS = 2600; // and this long while the child owes an "Eitt!", which she may notice at the end of it
const IDLE_MS = 6000; // the child's turn with nothing done this long: what goes lifts
const QUICK_IDLE_MS = 3000; // and this long in the first round after the tutorial, while the child is still learning
const NUDGE_MS = 7000; // the child's turn with nothing done this long: Kambeðla may say "Þín umferð!"
const NUDGE_GAP_MS = 20000; // but never sooner than this after she last said it
const MIN_STEP_MS = 3200; // a tutorial step that needs nothing from the child stays at least this long (its line, if longer)
const ADVICE_MS = 4800; // Mosi's bubble stays this long
const FLY_MS = 430; // a card played to the pile
const DRAW_MS = 400; // a card from the deck to a hand
const DEAL_MS = 360;
const DEAL_GAP = 105; // ms between two cards dealt
const GIVE_GAP = 170; // and between the cards of a +2, a +4 or a catch
const DRAW_TALK = 0.35; // after her first "Ég dreg." of a round, the chance she says it again as she draws (she talks little)

const DINO = { red: 'trex.webp', yellow: 'brontosaurus.webp', green: 'mosi.webp', blue: 'parasaurolophus.webp' };
const TRICK = { skip: 'stegosaurus-tail.webp', reverse: 'pteranodon.webp', draw2: 'eggs-2.svg', wild: 'plates.svg', wild4: 'wild4.svg' };
const COLOUR_WORD = { red: 'rautt', yellow: 'gult', green: 'grænt', blue: 'blátt' };
const COLOUR_NAME = { red: 'Rautt', yellow: 'Gult', green: 'Grænt', blue: 'Blátt' };
const KIND_WORD = { skip: 'sleppa', reverse: 'snúningur', draw2: 'plús tveir', wild: 'litaskipti', wild4: 'litaskipti plús fjórir' };
const MARK = { draw2: '+2', wild4: '+4' };
const ORDER = { red: 0, yellow: 1, green: 2, blue: 3 };
const KIND_ORDER = { number: 0, skip: 10, reverse: 11, draw2: 12, wild: 100, wild4: 101 };
const MOVES_AGAIN = new Set(['skip', 'reverse', 'draw2', 'wild4']);
// The seats of the round on one device (rules.js knows its players by seat): the child's, who begins, and Kambeðla's.
const CHILD = 0;
const KAMBEDLA = 1;

/** Mosi's words for each reason he gives (advice.js REASONS; his lines eitt_why_<reason> in assets/audio/eitt/lines-source.json). */
const WHY = {
  colour: 'Settu þetta spil. Það er í sama lit.',
  number: 'Þetta spil hefur sömu tölu, svo það má fara á borðið.',
  'keep-wild': 'Geymdu litaskiptin. Þau hjálpa þér seinna, þegar ekkert annað passar.',
  'only-wild': 'Ekkert annað passar, svo nú er gott að nota litaskiptin.',
  attack: 'Kambeðlan á næstum ekkert eftir! Láttu hana draga spil.',
  'keep-attack': 'Geymdu plús tvo þangað til kambeðlan á fá spil.',
  skip: 'Með halasveiflunni færðu aftur að gera!',
  'most-colour': 'Veldu þennan lit. Þú átt flest spil í honum.',
  'change-colour': 'Skiptu yfir í litinn sem þú átt mest af.',
  draw: 'Ekkert spil passar núna. Dragðu eitt úr bunkanum.',
  eitt: 'Mundu að ýta á Eitt!',
  'play-drawn': 'Spilið sem þú dróst passar! Settu það.',
};
const whyLine = reason => `eitt_why_${reason.replace(/-/g, '_')}`;

// The tutorial (task 3c, after the owner's play of 18 October): the goal first, then every card with a turn where the child plays it,
// why "Eitt!" matters, three checks that the child understood, and a recap. It is dealt from stacked decks in two parts, so every step
// comes in its order:
//   - "cards": the child's eight cards are played one a step: a number card on its colour, one on its number, the skip, the reverse,
//     the +2, the wild and the +4 (her draws make Kambeðla's hand too big for the rest). Her moves are set: red 8 on the red 3, yellow 8
//     on the blue 8, and on the wild a 2 in the colour the child picked. The +4 goes on anything, whatever colour the child chose.
//   - "eitt": the child holds one card, which does not fit: the draw (the drawn card does not fit either, so it is her turn). She
//     plays yellow 3 and the child's blue 3 goes on it, down to one card: "Eitt!". She plays blue 9 down to one and forgets hers: the
//     child catches her. Then four more cards fly to the child, and at each check exactly one card of the hand fits: red 9 (the number),
//     then red 6 (the colour) on her red 4, then green 6 (the number) on her yellow 6.
// The draw needs a hand with no wild in it, so it begins the second part, right after the +4.
const TUTORIAL_DEALS = {
  cards: {
    top: 'red-5-a',
    hands: [
      ['red-3-a', 'blue-8-a', 'yellow-skip-a', 'yellow-reverse-a', 'yellow-draw2-a', 'wild-a', 'wild4-a', 'green-6-a'], // the child's
      ['red-8-a', 'yellow-8-a', 'red-2-a', 'yellow-2-a', 'green-2-a', 'blue-2-a'], // Kambeðla's
    ],
    next: [],
  },
  eitt: {
    top: 'yellow-7-a',
    hands: [['blue-3-a'], ['yellow-3-a', 'blue-9-a', 'red-4-a']], // the child's, Kambeðla's
    next: ['green-1-a', 'yellow-6-a', 'blue-1-a'], // drawn in this order: the child's draw, then her two when she is caught
  },
};
const MORE_CARDS = ['red-9-a', 'red-6-a', 'green-6-a', 'green-8-a']; // the checks' cards, from the deck
/** Kambeðla's moves in the tutorial, by the card on top (on a wild: the 2 in its colour). */
const HER_MOVES = { 'red-3-a': 'red-8-a', 'blue-8-a': 'yellow-8-a', 'yellow-7-a': 'yellow-3-a', 'blue-3-a': 'blue-9-a', 'red-9-a': 'red-4-a', 'red-6-a': 'yellow-6-a' };
const CHECK = 'Hvaða spil má setja núna? Pikkaðu á það.';
/**
 * The steps, each one of Mosi's lines (eitt_tut_<name> in assets/audio/eitt/lines-source.json) with its words. `live` is what the
 * child does next (a card id, 'deck' or 'eitt'); `check` is a card the child must find alone, nothing lit (`by` says what fits:
 * the colour or the number, for Mosi's hint); `her` is said as Kambeðla's turn begins; `forget` is said when she forgets her "Eitt!"
 * on purpose. An `auto` step needs nothing from the child: it goes on once said, to a new deal (`deal`), with more cards (`more`), or
 * to the real game (`end`).
 */
const TUTORIAL = [
  { id: 'eitt_tut_goal', text: 'Markmiðið er að losna við öll spilin sín. Sá sem klárar spilin sín fyrst vinnur!', auto: true },
  { id: 'eitt_tut_colour', text: 'Sjáðu efsta spilið. Þú mátt setja spil í sama lit.', live: 'red-3-a' },
  { id: 'eitt_tut_her', text: 'Nú á kambeðlan leik.', her: true },
  { id: 'eitt_tut_number', text: 'Þú mátt líka setja sömu tölu, þó liturinn sé annar.', live: 'blue-8-a' },
  { id: 'eitt_tut_skip', text: 'Halasveifla! Þá missir kambeðlan umferð og þú átt aftur leik.', live: 'yellow-skip-a' },
  { id: 'eitt_tut_reverse', text: 'Flugeðlan snýr leiknum við. Þegar tveir spila er hún eins og halasveifla, og þú átt aftur leik.', live: 'yellow-reverse-a' },
  { id: 'eitt_tut_draw2', text: 'Tvö egg! Þá dregur kambeðlan tvö spil og missir umferð.', live: 'yellow-draw2-a' },
  { id: 'eitt_tut_wild', text: 'Glóandi plöturnar skipta um lit. Þær passa á öll spil, og þú velur litinn.', live: 'wild-a' },
  { id: 'eitt_tut_wild4', text: 'Plöturnar og fjögur egg! Kambeðlan dregur fjögur spil, og þú velur litinn.', live: 'wild4-a' },
  { id: 'eitt_tut_again', text: 'Vel gert! Nú gefum við aftur.', auto: true, deal: 'eitt' },
  { id: 'eitt_tut_draw', text: 'Ekkert spil passar. Þá dregurðu eitt spil úr bunkanum.', live: 'deck' },
  { id: 'eitt_tut_drew', text: 'Það passar ekki heldur. Þá á kambeðlan leik.', her: true },
  { id: 'eitt_tut_last', text: 'Settu spilið sem passar. Þá áttu bara eitt spil eftir!', live: 'blue-3-a' },
  { id: 'eitt_tut_eitt', text: 'Þegar þú átt bara eitt spil eftir, ýttu á Eitt! Ef þú gleymir því og kambeðlan tekur eftir því, þarftu að draga tvö spil.', live: 'eitt' },
  { id: 'eitt_tut_catch', text: 'Kambeðlan gleymdi að segja Eitt! Gríptu hana!', live: 'eitt', forget: true },
  { id: 'eitt_tut_quiz', text: 'Nú færðu fleiri spil. Sjáum hvort þú manst!', auto: true, more: MORE_CARDS },
  { id: 'eitt_tut_check', text: CHECK, check: 'red-9-a', by: 'number' },
  { id: 'eitt_tut_check', text: CHECK, check: 'red-6-a', by: 'colour' },
  { id: 'eitt_tut_check', text: CHECK, check: 'green-6-a', by: 'number' },
  { id: 'eitt_tut_recap', text: 'Mundu: sami litur eða sama tala. Brögðin hjálpa þér. Og ýttu á Eitt þegar eitt spil er eftir!', auto: true, end: true },
];
/** Mosi's gentle words at a check: why a card tapped does not fit (by what does), after two wrong tries with the right one lit, and well done. */
const HINTS = {
  colour: { id: 'eitt_tut_hint_colour', text: 'Næstum! Sjáðu litinn á borðinu, og finndu spil í sama lit.' },
  number: { id: 'eitt_tut_hint_number', text: 'Næstum! Sjáðu töluna á borðinu, og finndu sömu tölu.' },
  try: { id: 'eitt_tut_hint_try', text: 'Sjáðu, þetta spil passar. Pikkaðu á það!' },
  right: { id: 'eitt_tut_right', text: 'Rétt! Vel gert.' },
};
/** Mosi's words as the tutorial ends, before the first real round is dealt. */
const REAL = { id: 'eitt_tut_real', text: 'Nú kanntu reglurnar! Nú spilum við fyrsta alvöruleikinn.' };

/** A part of the tutorial: the rules' data, as newGame makes it, from one of TUTORIAL_DEALS. */
function tutorialGame(deal) {
  const deck = makeDeck();
  const byId = id => deck.find(card => card.id === id);
  const used = new Set([deal.top, ...deal.hands.flat(), ...deal.next]);
  return {
    deck: [...deck.filter(card => !used.has(card.id)), ...[...deal.next].reverse().map(byId)], // the next card is the last
    pile: [byId(deal.top)],
    hands: deal.hands.map(hand => hand.map(byId)),
    colour: byId(deal.top).colour,
    turn: CHILD,
    direction: 1,
    drew: false,
    unsaid: null,
    winner: null,
  };
}
const SPEAKS_HERSELF = id => !/^eitt_(why|tut|egill)_/.test(id); // Kambeðla's own lines: her mouth follows them

const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h13M12 5.5l6.5 6.5L12 18.5" fill="none" stroke="#3b2f25" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 12h13M12 5.5l6.5 6.5L12 18.5" fill="none" stroke="#fffaf0" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const AGAIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.05-4.95M19 4.5v4.6h-4.6" fill="none" stroke="#3b2f25" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 12a7 7 0 1 1-2.05-4.95M19 4.5v4.6h-4.6" fill="none" stroke="#fffaf0" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" fill="none" stroke="#3b2f25" stroke-width="4" stroke-linecap="round"/></svg>';
const CAP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 9.5L12 5l9.5 4.5L12 14z" fill="#fffaf0" stroke="#3b2f25" stroke-width="2" stroke-linejoin="round"/><path d="M6.5 11.6v4.2c3.3 2.6 7.7 2.6 11 0v-4.2" fill="none" stroke="#3b2f25" stroke-width="2" stroke-linejoin="round"/><path d="M20 10.5v5" stroke="#3b2f25" stroke-width="2" stroke-linecap="round"/></svg>';

/** Where a card sits in the child's hand: by colour, then number, then the action cards, and the wilds last. */
const sortKey = card => (isWild(card) ? KIND_ORDER[card.kind] : ORDER[card.colour] * 20 + (card.kind === 'number' ? card.value : KIND_ORDER[card.kind]));
const sorted = cards => [...cards].sort((a, b) => sortKey(a) - sortKey(b));

/** How a card lies on the pile: askew by its own id, so it lies the same way every time it is drawn. */
function tiltOf(id) {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const unit = shift => ((h >>> shift) % 1000) / 500 - 1;
  return { r: unit(0) * 10, x: unit(10) * 4, y: unit(20) * 3 };
}

/** A card's markup in eitt.css's classes, from the rules' card (null for a back). */
function makeCard(doc, card, tag = 'div') {
  const el = doc.createElement(tag);
  if (tag === 'button') el.type = 'button';
  if (!card) {
    el.className = 'eitt-card back';
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
  const number = card.kind === 'number';
  el.className = card.kind === 'wild' ? 'eitt-card wild' : card.kind === 'wild4' ? 'eitt-card wild draw4' : number ? `eitt-card ${card.colour}` : `eitt-card ${card.colour} ${card.kind}`;
  el.dataset.id = card.id;
  if (number) el.dataset.n = String(card.value);
  el.setAttribute('aria-label', isWild(card) ? KIND_WORD[card.kind] : `${COLOUR_WORD[card.colour]} ${number ? card.value : KIND_WORD[card.kind]}`);
  const mark = number ? String(card.value) : MARK[card.kind] ?? '';
  const picture = asset(`assets/eitt/${number ? DINO[card.colour] : TRICK[card.kind]}`);
  el.innerHTML = `<span class="corner" aria-hidden="true">${mark}</span><span class="pic"><img src="${picture}" alt="" draggable="false"></span>` +
    (card.kind === 'wild' ? '' : `<span class="digit" aria-hidden="true">${mark}</span>`) + `<span class="corner flip" aria-hidden="true">${mark}</span>`;
  return el;
}

/**
 * "Eitt!" in `doc`'s #eitt (an element with the class eitt), over the `save` (engine/save.js: getEitt and setEitt keep Kambeðla's
 * skill and the stickers won). `audio` is { context, output, theme, lines, muted }: the page's audio context and output (or none:
 * silent), theme.json for the key, lines.json for the voices. `onPause(paused)` holds the chapter while the game is open, and
 * `onClose()` is told when it shuts. Returns
 *   open({ tutorial })  opens the game: the tutorial first if it has not been through (or `tutorial` asks for it), then a round
 *   close()    shuts it, dropping a round under way with no penalty
 *   isOpen     whether it is open
 *   muted      silences its effects, music and voices
 *   game       the round as it is now (the rules' data), for a probe, and phase, what it waits for ('tutorial <step> <live>' while
 *              Mosi teaches)
 */
export function createEittGame(doc, { save = null, audio = {}, onClose = null, onPause = null, win = globalThis.window, random = Math.random } = {}) {
  const root = doc.getElementById('eitt');
  if (!root) throw new Error('"Eitt!" needs #eitt on the page (see index.html)');
  const make = (tag, className, html = '') => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (tag === 'button') el.type = 'button';
    if (html) el.innerHTML = html;
    return el;
  };
  const calm = () => reducedMotion(win);

  // ---- The page -------------------------------------------------------------------------------------------------------------

  const table = make('div', 'eitt-table');
  const windowEl = make('section', 'eitt-kambedla');
  windowEl.setAttribute('aria-label', 'Kambeðla');
  const picture = make('img');
  picture.src = asset('assets/book/images/kambedla-render.webp');
  picture.alt = '';
  windowEl.append(picture);
  const frameEl = make('div', 'eitt-kambedla-frame');
  frameEl.setAttribute('aria-hidden', 'true');
  const theirsEl = make('div', 'eitt-their-hand');
  theirsEl.setAttribute('role', 'img');
  const centre = make('div', 'eitt-centre');
  const deckEl = make('button', 'eitt-deck', '<span class="eitt-card back"></span>');
  deckEl.setAttribute('aria-label', 'Draga spil');
  const pileEl = make('div', 'eitt-pile');
  const ringEl = make('div', 'eitt-ring');
  pileEl.append(ringEl);
  const passEl = make('button', 'eitt-pass', `<span>Áfram</span>${ARROW}`);
  const coloursEl = make('div', 'eitt-colours');
  const colourButtons = Object.keys(ORDER).map(colour => {
    const button = make('button', colour);
    button.dataset.colour = colour;
    button.setAttribute('aria-label', COLOUR_NAME[colour]);
    coloursEl.append(button);
    return button;
  });
  centre.append(deckEl, pileEl, passEl, coloursEl);
  const mosiEl = make('button', 'eitt-mosi');
  mosiEl.setAttribute('aria-label', 'Spyrja Mosa');
  const adviceEl = make('div', 'eitt-advice');
  const mosiPicture = make('img');
  mosiPicture.src = asset('assets/book/images/mosi-render.webp');
  mosiPicture.alt = '';
  const adviceWords = make('p');
  adviceEl.append(mosiPicture, adviceWords);
  const handEl = make('div', 'eitt-hand');
  const eittEl = make('button', 'eitt-eitt', '<span>Eitt!</span>');
  const quitEl = make('button', 'eitt-close eitt-quit', CROSS);
  quitEl.setAttribute('aria-label', 'Aftur í bókina');
  const teachEl = make('button', 'eitt-teach', `${CAP}<span>Kennsla</span>`); // the tutorial again
  const skipEl = make('button', 'eitt-skip', '<span>Sleppa</span>'); // the tutorial's way out
  const captionEl = make('div', 'eitt-caption', '<span class="eitt-caption-speaker">Egill</span><p>Eitt!</p>');
  captionEl.setAttribute('aria-live', 'polite');
  table.append(windowEl, frameEl, theirsEl, centre, mosiEl, adviceEl, handEl, eittEl, captionEl, quitEl, teachEl, skipEl);

  const winEl = make('div', 'eitt-win');
  const winCard = make('div', 'eitt-win-card');
  const closeEl = make('button', 'eitt-close', CROSS);
  closeEl.setAttribute('aria-label', 'Aftur í bókina');
  const winWords = make('h2');
  const stickerEl = make('div', 'eitt-sticker');
  stickerEl.setAttribute('role', 'img');
  stickerEl.setAttribute('aria-label', 'Kambeðlulímmiði');
  const stickerWords = make('p', 'eitt-win-words');
  stickerWords.textContent = 'Límmiði í bókina!';
  const againEl = make('button', 'eitt-again', `${AGAIN}<span>Spilum aftur?</span>`);
  winCard.append(closeEl, winWords, stickerEl, stickerWords, againEl);
  const confettiEl = make('div', 'eitt-confetti');
  confettiEl.setAttribute('aria-hidden', 'true');
  winEl.append(winCard, confettiEl);

  root.classList.add('eitt');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Eitt!, spil við Kambeðlu');
  root.replaceChildren(table, winEl);
  root.hidden = true;
  passEl.hidden = true;
  coloursEl.hidden = true;
  adviceEl.hidden = true;
  winEl.hidden = true;
  captionEl.hidden = true;
  skipEl.hidden = true;

  // ---- Sound --------------------------------------------------------------------------------------------------------------

  const context = audio.context ?? null;
  // tuned to its own music's key (assets/audio/eitt/music.json), else the page's theme (engine/audio/game-music.js)
  const effects = createGameSfx({ music: MUSIC, context, theme: audio.theme ?? null, output: audio.output ?? null, sounds: eittSounds, gaps: EITT_GAPS });
  const music = createEittMusic({ context, output: audio.output ?? null, url: MUSIC });
  // One voice at a time (the owner's play of 18 October): a line asked for while another is speaking waits until it has ended, and
  // the lines waiting go in order of who matters most: Egill's short "Eitt!", then Mosi (his steps and his advice), then Kambeðla's
  // moves (her colour, her "Eitt!", "Úps"), then her chatter ("Þín umferð!", "Ég dreg."). A line that waits too long (`within`), or
  // is no longer true when its turn comes (`still`), is dropped; a newer line of Mosi's takes the place of one of his still waiting.
  let talking = false; // a line is sounding
  let speakingUntil = 0; // when it ends (performance.now() ms)
  let voiceGuard = 0;
  const queue = []; // the lines waiting: { id, line, priority, still, by, onStart }
  const clock = () => globalThis.performance?.now?.() ?? Date.now();
  const voice = createVoice({
    onSpeaking: on => {
      music.duck(on);
      talking = on;
      if (!on) nextLine();
    },
  });
  let muted = false;
  const sfx = name => effects.play(name);
  function setMuted(value) {
    muted = Boolean(value);
    effects.muted = muted;
    music.muted = muted;
    if (muted) queue.length = 0;
    voice.muted = muted;
  }
  setMuted(audio.muted); // wherever the game's sound is muted (captures), so is this

  const priorityOf = id => (id === 'eitt_egill_eitt' ? 3 : /^eitt_(why|tut)_/.test(id) ? 2 : id === 'eitt_your_turn' || id === 'eitt_i_draw' ? 0 : 1);

  function startLine(item) {
    const seconds = item.line.duration ?? 1;
    speakingUntil = clock() + seconds * 1000;
    clearTimeout(voiceGuard);
    voiceGuard = setTimeout(() => { if (talking) voice.stop(); else nextLine(); }, seconds * 1000 + 1500); // its end never came: go on
    voice.play(new URL(item.line.src, REMAKE).href);
    if (SPEAKS_HERSELF(item.id)) view?.talk(item.line);
    item.onStart?.();
  }

  /** The line that was sounding is over: the next one waiting that is still worth saying begins. */
  function nextLine() {
    clearTimeout(voiceGuard);
    speakingUntil = 0;
    while (queue.length && !talking) {
      const item = queue.shift();
      if ((item.by !== null && clock() > item.by) || (item.still && !item.still())) continue;
      startLine(item);
    }
  }

  /**
   * Says a line of the eitt set from lines.json, now or once the line sounding has ended (see the queue above); Kambeðla's mouth
   * follows hers. `onStart` runs as it begins (at once when it is not recorded). Returns the seconds until it will have ended
   * (0: not recorded yet, or muted).
   */
  function say(id, { still = null, within = null, onStart = null } = {}) {
    const line = audio.lines?.[id];
    if (!line?.src || muted) {
      onStart?.();
      return 0;
    }
    const item = { id, line, priority: priorityOf(id), still, by: within === null ? null : clock() + within, onStart };
    if (!talking && !queue.length) {
      startLine(item);
      return line.duration ?? 0;
    }
    for (let k = queue.length - 1; k >= 0; k--) if (queue[k].id === id || (item.priority === 2 && queue[k].priority === 2)) queue.splice(k, 1);
    const at = queue.findIndex(waiting => waiting.priority < item.priority);
    queue.splice(at < 0 ? queue.length : at, 0, item);
    let ms = Math.max(0, speakingUntil - clock());
    for (const ahead of queue) {
      if (ahead === item) break;
      ms += (ahead.line.duration ?? 0) * 1000;
    }
    return ms / 1000 + (line.duration ?? 0);
  }

  /** Nothing more is said of what was waiting (a new deal, the game shut); the line sounding ends by itself. */
  const hush = () => { queue.length = 0; };

  /** A touch in the game: the browser lets sound begin from it, so the music that could not start before a touch starts now. */
  function wake() {
    if (!isOpen) return;
    if (context?.state === 'suspended') context.resume?.().catch?.(() => {});
    music.wake();
  }

  // ---- State --------------------------------------------------------------------------------------------------------------

  let isOpen = false;
  let game = null;
  let round = 0; // counts rounds; a flow that finds it changed (a new deal, the game shut) stops
  let busy = true; // a card flies or Kambeðla moves: the child's taps wait
  let flying = 0; // cards in the air
  let pendingWild = null; // the wild the child has played, waiting for its colour
  let hinting = false; // what goes is lifted (the idle hint, or after taps that did not go)
  let nudged = false; // "Þín umferð!" said this turn
  let nopes = 0; // taps this turn on cards that did not go
  let mosiPick = null; // what Mosi points at: a card id or 'draw'
  let mosiColour = null; // and the colour he suggests for a wild
  let animating = null; // a catch under way, which Kambeðla's turn waits for
  let saidDraw = false; // "Ég dreg." said this round: after the first time she says it only now and then
  // While Mosi teaches: { step (an index into TUTORIAL), live (what the child may do: a card id, 'deck', 'colours', 'eitt', or 'check':
  // any card of the hand), check (the card that fits at a check), wrong (the wrong tries at it), lit (the card lit after two) }
  let tutorial = null;
  let quickHints = false; // this round helps sooner (QUICK_IDLE_MS): the first after the tutorial
  let quickNext = false; // and the next round dealt will
  let ending = false; // the tutorial is over and Mosi is saying so: the table waits for the first real round
  let turns = 0; // counts the child's turns, so a "Þín umferð!" that waited knows whether it is still the same turn
  let lastNudge = -Infinity; // when Kambeðla last said "Þín umferð!" (performance.now() ms)
  let captionTimer = 0;
  const timers = new Set();
  let idleTimer = 0;
  let nudgeTimer = 0;
  let adviceTimer = 0;

  function later(ms, fn) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }
  const wait = ms => new Promise(resolve => later(ms, resolve));
  /** Starts a move (they are async: cards fly, Kambeðla thinks); one that fails is said, and the round is not left stuck silently. */
  const run = move => move?.catch?.(error => console.error('[eitt] A move went wrong:', error));
  function cancelTimer(id) {
    clearTimeout(id);
    timers.delete(id);
  }

  const eittState = () => save?.getEitt?.() ?? { skill: null, losses: 0, wins: 0 };
  const skillNow = () => inRound(eittState().skill ?? SKILL_START, game.hands[CHILD].length, game.hands[KAMBEDLA].length);
  const childMoves = () => isOpen && game && game.winner === null && game.turn === CHILD && !busy && !pendingWild && !animating;
  const handCards = () => sorted(game ? game.hands[CHILD].filter(card => card.id !== pendingWild?.id) : []);
  const pileCards = () => (game ? (pendingWild ? [...game.pile, pendingWild] : game.pile) : []);

  // ---- Kambeðla's view: loaded the first time the game opens; until then (and without WebGL) her picture stands in --------------

  let view = null;
  let viewLoading = null;
  function startView() {
    if (view) return view.start();
    viewLoading ??= import('./kambedla-view.js')
      .then(module => module.createKambedlaView(windowEl, { win }))
      .then(made => {
        view = made;
        picture.hidden = true;
        if (isOpen) view.start();
      })
      .catch(error => console.warn('[eitt] Kambeðla stays a picture: her live view could not start.', error));
  }

  // ---- Laying out the cards -------------------------------------------------------------------------------------------------

  const handEls = new Map(); // card id -> its button in the child's hand
  const theirEls = new Map(); // card id -> its back in Kambeðla's hand
  const pileEls = new Map(); // card id -> the card on the pile

  /** Where `el` is: its middle in the game's own pixels, its width, and how it is turned (degrees). */
  function placeOf(el, r = 0) {
    const box = el.getBoundingClientRect();
    const base = root.getBoundingClientRect();
    return { x: box.left + box.width / 2 - base.left, y: box.top + box.height / 2 - base.top, w: el.offsetWidth || box.width, r };
  }
  const placeHand = el => placeOf(el, 3 * Number(el.dataset.i || 0));
  const placeTheirs = el => placeOf(el, -5 * Number(el.dataset.i || 0));
  const placeDeck = () => placeOf(deckEl.firstElementChild, -3);
  const placePile = el => placeOf(el, tiltOf(el.dataset.id).r);

  /** Moves cards that changed place from where they were, so a hand closes up and makes room smoothly (a FLIP). */
  function glide(before, els) {
    if (calm()) return;
    for (const [id, old] of before) {
      const el = els.get(id);
      if (!old || !el?.isConnected || el.style.visibility === 'hidden') continue;
      const now = el.getBoundingClientRect();
      const dx = old.left + old.width / 2 - (now.left + now.width / 2);
      const dy = old.top + old.height / 2 - (now.top + now.height / 2);
      if (Math.hypot(dx, dy) > 1) el.animate?.([{ translate: `${dx.toFixed(1)}px ${dy.toFixed(1)}px` }, { translate: '0px 0px' }], { duration: 320, easing: 'cubic-bezier(.3, .7, .4, 1)' });
    }
  }
  const rects = els => new Map([...els].map(([id, el]) => [id, el.isConnected ? el.getBoundingClientRect() : null]));

  /** Lays `els` out in `box` in the order of `cards`, making what is missing with `create` and dropping what is gone. */
  function layOut(box, els, cards, create, spreadFor, hidden) {
    const ids = new Set(cards.map(card => card.id));
    for (const [id, el] of els) {
      if (ids.has(id)) continue;
      el.remove();
      els.delete(id);
    }
    const mid = (cards.length - 1) / 2;
    const spread = spreadFor(cards.length);
    const wanted = cards.map((card, k) => {
      let el = els.get(card.id);
      if (!el) els.set(card.id, (el = create(card)));
      const i = ((k - mid) * spread).toFixed(2);
      el.style.setProperty('--i', i);
      el.dataset.i = i;
      el.style.visibility = hidden.has(card.id) ? 'hidden' : '';
      return el;
    });
    // In order after whatever else the box holds (the pile's ring stays first, under the cards).
    const now = [...box.children].filter(child => wanted.includes(child));
    if (now.length !== wanted.length || now.some((el, k) => el !== wanted[k])) for (const el of wanted) box.append(el);
  }

  /**
   * Where the child's cards may lie across the table: between Mosi and "Eitt!" (the table's edges, with the buttons on a row of their
   * own, when the tablet is upright).
   */
  function handBounds(upright) {
    const base = table.getBoundingClientRect();
    return upright ? [base.left + 8, base.right - 8] : [mosiEl.getBoundingClientRect().right + 10, eittEl.getBoundingClientRect().left - 10];
  }

  /**
   * A hand of so many cards that each would show a strip narrower than a small finger (TAP_PX) lies in two overlapping rows instead,
   * or in three: the first cards in the back row and the rest in front of it, each row fanned and centred on its own, each card
   * showing a strip of at least TAP_PX across and a good part of its height (.rows in eitt.css).
   */
  function layRows(cards, upright) {
    const els = cards.map(card => handEls.get(card.id));
    const spread = count => (count > 7 ? 5 / (count - 1) : 1);
    let step = 0;
    handEl.classList.add('rows');
    for (let rows = 2; rows <= 3; rows++) {
      const per = Math.ceil(cards.length / rows);
      step = els[0].offsetWidth * 0.92; // the most a card is ever spread: a card's width less its overlap of .04 on either side
      handEl.style.setProperty('--more', per - 1);
      handEl.style.setProperty('--more-rows', rows - 1);
      handEl.style.setProperty('--row-step', rows === 3 ? 'calc(var(--hand-w) * .5)' : ''); // three rows lie closer, to stay under the pile
      els.forEach((el, k) => {
        const row = Math.floor(k / per);
        const col = k % per;
        const count = Math.min(per, cards.length - row * per);
        const i = ((col - (count - 1) / 2) * spread(count)).toFixed(2);
        el.style.setProperty('--col', col + 1);
        el.style.setProperty('--row', row + 1);
        el.style.setProperty('--shift', ((per - count) / 2).toFixed(2)); // a row of fewer cards is centred under the longer one
        el.style.setProperty('--i', i);
        el.dataset.i = i;
      });
      // The fan tilts the outer cards outward: measured, a row that still reaches Mosi or "Eitt!" closes up more. (The buttons move
      // out as the hand narrows, so this only ever has room to gain.)
      for (let tries = 0; tries < 10; tries++) {
        handEl.style.setProperty('--step', `${step.toFixed(1)}px`);
        const [from, to] = handBounds(upright);
        const boxes = els.map(el => el.getBoundingClientRect()); // hidden ones too: they will land there
        const over = Math.max(0, from - Math.min(...boxes.map(box => box.left))) + Math.max(0, Math.max(...boxes.map(box => box.right)) - to);
        if (over < 1) break;
        step = Math.max(40, step - over / (per - 1) - 0.5);
      }
      if (step >= TAP_PX) break;
    }
  }

  /** The child's cards in their arc, a bigger hand overlapping more so it always fits between Mosi and "Eitt!". */
  function renderHand(cards, { hidden = new Set(), animate = true } = {}) {
    const before = animate ? rects(handEls) : new Map();
    handEl.classList.remove('rows');
    layOut(handEl, handEls, cards, card => {
      const el = makeCard(doc, card, 'button');
      tappable(el, () => tapCard(card.id));
      return el;
    }, n => (n > 7 ? 5 / (n - 1) : 1), hidden);
    const width = handEls.values().next().value?.offsetWidth || 120;
    const upright = Boolean(win?.matchMedia?.('(max-aspect-ratio: 1/1)')?.matches);
    const sides = upright ? 0 : 2 * (Math.max(mosiEl.offsetWidth, eittEl.offsetWidth) + 24);
    const room = table.clientWidth - sides - 40 - 0.4 * width;
    const least = upright ? 0.08 : 0.04;
    let overlap = cards.length ? Math.min(0.45, Math.max(least, (1 - room / (cards.length * width)) / 2)) : least;
    handEl.style.setProperty('--overlap', overlap.toFixed(3));
    // The fan tilts its outer cards outward: measured, a hand that still reaches Mosi or "Eitt!" (or the edge) closes up more.
    const clear = () => {
      const boxes = [...handEls.values()].map(el => el.getBoundingClientRect()); // hidden ones too: they will land there
      if (!boxes.length) return true;
      const left = Math.min(...boxes.map(box => box.left));
      const right = Math.max(...boxes.map(box => box.right));
      const [from, to] = handBounds(upright);
      return left >= from && right <= to;
    };
    for (let tries = 0; tries < 8 && overlap < 0.45 && !clear(); tries++) {
      overlap = Math.min(0.45, overlap + 0.025);
      handEl.style.setProperty('--overlap', overlap.toFixed(3));
    }
    // So many cards that a card's strip comes out narrower than TAP_PX: two (or three) rows instead of one.
    const first = handEls.get(cards[0]?.id);
    const last = handEls.get(cards.at(-1)?.id);
    if (cards.length > 2 && first && last && (last.offsetLeft - first.offsetLeft) / (cards.length - 1) < TAP_PX) layRows(cards, upright);
    marks();
    if (animate) glide(before, handEls);
  }

  /** Kambeðla's cards, face down in front of her window, fanned closer as she holds more. */
  function renderTheirs(cards, { hidden = new Set(), animate = true } = {}) {
    const before = animate ? rects(theirEls) : new Map();
    layOut(theirsEl, theirEls, cards, card => {
      const el = makeCard(doc, null);
      el.dataset.id = card.id;
      return el;
    }, n => (n > 7 ? 6 / (n - 1) : 1), hidden);
    const width = theirEls.values().next().value?.offsetWidth || 60;
    const room = windowEl.offsetWidth + 2 * width;
    const overlap = cards.length ? Math.min(0.42, Math.max(0.24, (1 - room / (cards.length * width)) / 2)) : 0.24;
    theirsEl.style.setProperty('--them-overlap', overlap.toFixed(3));
    theirsEl.setAttribute('aria-label', `Kambeðla á ${cards.length} spil`);
    if (animate) glide(before, theirEls);
  }

  /** The pile: the last few cards played, each askew in its own way, the top one last. */
  function renderPile(cards, { hidden = null } = {}) {
    const shown = cards.slice(-4);
    layOut(pileEl, pileEls, shown, card => {
      const el = makeCard(doc, card);
      const tilt = tiltOf(card.id);
      el.style.setProperty('--r', `${tilt.r.toFixed(1)}deg`);
      el.style.setProperty('--x', `${tilt.x.toFixed(1)}%`);
      el.style.setProperty('--y', `${tilt.y.toFixed(1)}%`);
      return el;
    }, () => 0, new Set(hidden ? [hidden] : []));
  }

  /** What may be tapped shows: the cards that go lift when hinted or picked by Mosi, the deck calls, "Eitt!" glows. */
  function marks() {
    if (!game) return;
    const goes = childMoves() ? new Set(playable(game, CHILD).map(card => card.id)) : new Set();
    for (const [id, el] of handEls) {
      el.classList.toggle('playable', goes.has(id));
      el.classList.toggle('hint', goes.has(id) && (tutorial ? tutorial.live === id || tutorial.lit === id : hinting || mosiPick === id || game.drew));
      el.classList.toggle('live', Boolean(tutorial) && (tutorial.live === id || tutorial.live === 'check')); // at a check every card may be tapped, none lit
    }
  }

  /** Everything shown as the round is now. */
  function sync({ animate = true } = {}) {
    if (!game) return;
    renderHand(handCards(), { animate });
    renderTheirs(game.hands[KAMBEDLA], { animate });
    renderPile(pileCards());
    ringEl.hidden = false;
    ringEl.className = `eitt-ring ${pendingWild ? 'wild' : game.colour}`;
    passEl.hidden = !(game.drew && game.turn === CHILD && game.winner === null) || Boolean(tutorial);
    eittEl.classList.toggle('needed', game.unsaid !== null && game.winner === null);
    deckEl.classList.toggle('draw', childMoves() && canDraw(game, CHILD) && (tutorial ? tutorial.live === 'deck' : hinting || mosiPick === 'draw'));
    coloursEl.hidden = !pendingWild;
    for (const button of colourButtons) {
      button.classList.toggle('hint', Boolean(pendingWild) && mosiColour === button.dataset.colour);
      button.classList.toggle('live', tutorial?.live === 'colours');
    }
    root.classList.toggle('teaching', Boolean(tutorial));
    deckEl.classList.toggle('live', tutorial?.live === 'deck');
    eittEl.classList.toggle('live', tutorial?.live === 'eitt');
    teachEl.hidden = Boolean(tutorial);
    skipEl.hidden = !tutorial;
  }

  // ---- Motion -----------------------------------------------------------------------------------------------------------------

  /**
   * A card flies from `from` to `to` (placeOf's { x, y, w, r }) in an arc, turning over on the way with turn 'up' (from its back).
   * A back flies with `card` null. `onLand` runs as it lands, before the flyer goes. Resolves when it has landed.
   */
  function fly(card, from, to, { turn = 'none', duration = FLY_MS, onLand = null } = {}) {
    const el = make('div', 'eitt-flyer');
    el.style.setProperty('--fly-w', `${to.w.toFixed(1)}px`);
    const inner = make('div', 'eitt-flyer-turn');
    const both = Boolean(card) && turn === 'up';
    if (card) inner.append(makeCard(doc, card));
    if (!card || both) {
      const back = makeCard(doc, null);
      if (both) back.classList.add('under');
      inner.append(back);
    }
    el.append(inner);
    const h = (to.w * 7) / 5;
    const at = (x, y, r, s) => `translate(${(x - to.w / 2).toFixed(1)}px, ${(y - h / 2).toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${s.toFixed(3)})`;
    el.style.transform = at(from.x, from.y, from.r, from.w / to.w);
    root.append(el);
    flying++;
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      flying = Math.max(0, flying - 1);
      onLand?.();
      el.remove();
    };
    if (calm() || typeof el.animate !== 'function') {
      el.style.transform = at(to.x, to.y, to.r, 1);
      const fade = el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
      return (fade?.finished ?? Promise.resolve()).catch(() => {}).then(land);
    }
    const lift = Math.min(90, Math.hypot(to.x - from.x, to.y - from.y) * 0.2);
    const s0 = from.w / to.w;
    const path = el.animate([
      { transform: at(from.x, from.y, from.r, s0) },
      { transform: at((from.x + to.x) / 2, (from.y + to.y) / 2 - lift, (from.r + to.r) / 2, ((s0 + 1) / 2) * 1.1), offset: 0.5 },
      { transform: at(to.x, to.y, to.r, 1) },
    ], { duration, easing: 'cubic-bezier(.3, .6, .35, 1)', fill: 'forwards' });
    if (both) inner.animate([{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }], { duration, easing: 'ease-in-out', fill: 'forwards' });
    return path.finished.catch(() => {}).then(land);
  }

  /** A wiggle: no. */
  function nope(el) {
    sfx('wiggle');
    if (typeof el.animate !== 'function') return;
    el.animate(calm()
      ? [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }]
      : [{ rotate: '0deg' }, { rotate: '-7deg' }, { rotate: '6deg' }, { rotate: '-4deg' }, { rotate: '2deg' }, { rotate: '0deg' }], { duration: 480, easing: 'ease-in-out' });
  }

  /** A wave of the colour in play, going out from the pile. */
  function wave(colour) {
    if (calm() || !COLOUR_WORD[colour]) return;
    const el = make('div', `eitt-wave ${colour}`);
    pileEl.append(el);
    const motion = el.animate?.([{ transform: 'scale(.9)', opacity: 0.95 }, { transform: 'scale(2.5)', opacity: 0 }], { duration: 950, easing: 'cubic-bezier(.2, .7, .3, 1)' });
    (motion?.finished ?? Promise.resolve()).catch(() => {}).then(() => el.remove());
  }

  /** The cards that came into `who`'s hand since `before` fly in from the deck, one after another (a draw, a +2, a +4, a catch). */
  async function giveCards(before, who, sound = 'pop') {
    const token = round;
    const had = new Set(before.hands[who].map(card => card.id));
    const added = game.hands[who].filter(card => !had.has(card.id));
    if (game.deck.length > before.deck.length || game.pile.length < before.pile.length) {
      sfx('shuffle'); // the deck ran out: the table's cards became a new one
      renderPile(pileCards());
    }
    if (!added.length) return;
    const hidden = new Set(added.map(card => card.id));
    if (who === CHILD) renderHand(handCards(), { hidden });
    else renderTheirs(game.hands[KAMBEDLA], { hidden });
    const flights = [];
    for (const card of added) {
      const el = (who === CHILD ? handEls : theirEls).get(card.id);
      if (!el) continue;
      flights.push(fly(who === CHILD ? card : null, placeDeck(), who === CHILD ? placeHand(el) : placeTheirs(el), {
        turn: who === CHILD ? 'up' : 'none',
        duration: DRAW_MS,
        onLand: () => {
          el.style.visibility = '';
          sfx(sound);
        },
      }));
      if (added.length > 1) await wait(GIVE_GAP);
      if (token !== round) return;
    }
    await Promise.all(flights);
  }

  /** A card flies from `from` onto the pile (turning over from her hand), and lands with a flick and a sparkle. */
  async function toPile(card, from, turn = 'none') {
    renderPile(pileCards(), { hidden: card.id });
    const el = pileEls.get(card.id);
    await fly(card, from, placePile(el), {
      turn,
      onLand: () => {
        el.style.visibility = '';
        sfx('flick');
        sparkle(pileEl, 6, win);
      },
    });
  }

  // ---- Mosi -------------------------------------------------------------------------------------------------------------------

  /**
   * Mosi pops up with `text` in his bubble and says the line `id`; it goes after a while, or stays (`stay`, a tutorial step). Returns
   * the seconds until he will have said it (say's).
   */
  function showAdvice(id, text, { stay = false } = {}) {
    cancelTimer(adviceTimer);
    adviceWords.textContent = text;
    adviceWords.classList.toggle('long', text.length > 34); // a longer sentence: a wider bubble in smaller letters (eitt.css)
    adviceEl.getAnimations?.().forEach(animation => animation.cancel());
    adviceEl.hidden = true;
    void adviceEl.offsetWidth; // shown anew, so he pops up again
    adviceEl.hidden = false;
    const said = say(id);
    if (!stay) adviceTimer = later(Math.max(ADVICE_MS, said * 1000 + 2500), () => hideAdvice());
    return said;
  }
  const explain = reason => showAdvice(whyLine(reason), WHY[reason]);

  function hideAdvice(now = false) {
    cancelTimer(adviceTimer);
    if (adviceEl.hidden) return;
    if (now || calm() || typeof adviceEl.animate !== 'function') {
      adviceEl.hidden = true;
      return;
    }
    adviceEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220 }).onfinish = () => { adviceEl.hidden = true; };
  }

  function askMosi() {
    wake();
    if (!isOpen || !game || game.winner !== null || ending) return;
    if (tutorial) { // he says the step again
      const step = TUTORIAL[tutorial.step];
      if (step) showAdvice(step.id, step.text, { stay: true });
      return;
    }
    if (flying) return;
    if (pendingWild) {
      mosiColour = adviseColour(game, pendingWild.id, CHILD);
      explain('most-colour');
      sync({ animate: false });
      return;
    }
    const advice = advise(game, CHILD);
    if (!advice || (busy && advice.type !== 'eitt')) {
      nope(mosiEl); // Kambeðla's turn: nothing to advise yet
      return;
    }
    if (advice.type === 'draw') mosiPick = 'draw';
    else if (advice.type === 'play') mosiPick = advice.cardId;
    explain(advice.reason);
    sync({ animate: false });
  }

  // ---- The tutorial ---------------------------------------------------------------------------------------------------------

  /** The tutorial's next step, or null. */
  const nextStep = () => (tutorial ? TUTORIAL[tutorial.step + 1] ?? null : null);

  /** Mosi says step `index` of the tutorial, and what it asks for is live. Returns the seconds until he will have said it. */
  function showStep(index) {
    const step = TUTORIAL[index];
    tutorial.step = index;
    tutorial.live = step.live ?? (step.check ? 'check' : null);
    tutorial.check = step.check ?? null;
    tutorial.wrong = 0;
    tutorial.lit = null;
    const said = showAdvice(step.id, step.text, { stay: true });
    sync({ animate: false });
    return said;
  }

  /**
   * The tutorial goes on (on the child's turn, or after the last check): the steps that need nothing from the child are said one
   * after another (with a new deal, more cards, or the real game after them), and then the next step that asks for something is shown.
   */
  async function teach() {
    const token = round;
    for (let step = nextStep(); step?.auto; step = nextStep()) {
      const until = Date.now() + Math.max(MIN_STEP_MS, showStep(tutorial.step + 1) * 1000 + 900);
      if (step.more) await dealMore(step.more);
      if (token !== round) return;
      await wait(Math.max(0, until - Date.now()));
      if (token !== round) return;
      if (step.deal) return run(deal(tutorialGame(TUTORIAL_DEALS[step.deal])));
      if (step.end) return endTutorial();
    }
    const step = nextStep();
    if (step && ((step.live && step.live !== 'eitt') || step.check)) showStep(tutorial.step + 1); // "Eitt!" is shown when it is owed
  }

  /** Cards from the deck (by id) fly into the child's hand, for the checks. */
  async function dealMore(ids) {
    const before = game;
    const cards = ids.map(id => game.deck.find(card => card.id === id)).filter(Boolean);
    game = { ...game, deck: game.deck.filter(card => !cards.includes(card)), hands: game.hands.map((hand, seat) => (seat === CHILD ? [...hand, ...cards] : hand)) };
    await giveCards(before, CHILD, 'deal');
  }

  /** A card tapped at a check that does not fit: it wiggles, and Mosi says gently what to look for; after two, the right one lights. */
  function wrongAnswer(id) {
    const el = handEls.get(id);
    if (el) nope(el);
    tutorial.wrong++;
    if (tutorial.wrong >= 2) {
      tutorial.lit = tutorial.check;
      showAdvice(HINTS.try.id, HINTS.try.text, { stay: true });
      sync({ animate: false });
    } else {
      const hint = HINTS[TUTORIAL[tutorial.step].by];
      showAdvice(hint.id, hint.text, { stay: true });
    }
  }

  /** Kambeðla's move in the tutorial, as the deal has it (HER_MOVES), or her sharp one if the round strayed. */
  function tutorialMove() {
    const top = game.pile.at(-1);
    const want = isWild(top) ? `${game.colour}-2-a` : HER_MOVES[top.id];
    const card = game.hands[KAMBEDLA].find(held => held.id === want);
    return card && canPlay(card, game) ? { type: 'play', cardId: card.id } : chooseMove(game, KAMBEDLA, 1, random);
  }

  /**
   * The tutorial is over (its recap said, "Sleppa", or its game won): the save remembers it, but it was no round, so there is no
   * sticker and nothing for her skill. Mosi says the first real game comes now, with the table as it stands (nothing to do on it), and
   * then that round is dealt, which helps sooner. "Sleppa" (`skipped`) cuts the line he was saying.
   */
  async function endTutorial({ skipped = false } = {}) {
    if (!tutorial) return;
    const token = ++round; // whatever the tutorial had under way stops here
    ending = true;
    save?.setEitt?.({ tutorialDone: true });
    tutorial = null;
    quickNext = true;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    hush();
    if (skipped) voice.stop();
    busy = true;
    pendingWild = null;
    mosiPick = null;
    mosiColour = null;
    animating = null;
    hinting = false;
    coloursEl.hidden = true;
    skipEl.hidden = true;
    const said = showAdvice(REAL.id, REAL.text, { stay: true });
    await wait(Math.max(MIN_STEP_MS, said * 1000 + 900));
    if (token !== round || !isOpen) return;
    run(deal());
  }

  /** The tutorial from the start: its first deal, and Mosi's first step. */
  function startTutorial() {
    tutorial = { step: -1, live: null, check: null, wrong: 0, lit: null };
    run(deal(tutorialGame(TUTORIAL_DEALS.cards)));
  }

  /** Egill says "Eitt!" with the child, in a caption by the button (his voice only if no other is speaking, or soon after). */
  function egillSays() {
    say('eitt_egill_eitt', { within: 2500 });
    cancelTimer(captionTimer);
    captionEl.getAnimations?.().forEach(animation => animation.cancel());
    captionEl.hidden = true;
    void captionEl.offsetWidth;
    captionEl.hidden = false;
    captionTimer = later(1900, () => { captionEl.hidden = true; });
  }

  // ---- The child's moves ------------------------------------------------------------------------------------------------------

  /** A tap on a card in the hand, counted as the book counts one (engine/book/fx.js), without the book's sparkle. */
  function tappable(el, onTap) {
    const presses = new Map();
    const end = (event, tapped) => {
      const press = presses.get(event.pointerId);
      if (!press) return;
      presses.delete(event.pointerId);
      if (!presses.size) el.classList.remove('pressed');
      if (tapped && Math.hypot(event.clientX - press.x, event.clientY - press.y) < TAP_SLOP_PX) onTap(event);
    };
    el.addEventListener('pointerdown', event => {
      if (event.button > 0) return;
      presses.set(event.pointerId, { x: event.clientX, y: event.clientY });
      el.classList.add('pressed');
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        // the pointer is already gone
      }
    });
    el.addEventListener('pointermove', event => {
      const press = presses.get(event.pointerId);
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= TAP_SLOP_PX) end(event, false);
    });
    el.addEventListener('pointerup', event => end(event, true));
    el.addEventListener('pointercancel', event => end(event, false));
  }

  /**
   * The child's turn with nothing done: after a while what goes lifts (sooner in the first round after the tutorial), and after a
   * longer while Kambeðla may say "Þín umferð!", once a turn and never within NUDGE_GAP_MS of the last time. In the tutorial Mosi
   * says what to do, and she says nothing.
   */
  function armIdle() {
    cancelTimer(idleTimer);
    cancelTimer(nudgeTimer);
    if (tutorial) return;
    idleTimer = later(quickHints ? QUICK_IDLE_MS : IDLE_MS, () => {
      if (!childMoves() || tutorial) return;
      hinting = true;
      sync({ animate: false });
    });
    nudgeTimer = later(NUDGE_MS, () => {
      if (!childMoves() || tutorial || nudged || clock() - lastNudge < NUDGE_GAP_MS) return;
      nudged = true;
      lastNudge = clock();
      const turn = turns;
      say('eitt_your_turn', { still: () => childMoves() && !tutorial && turns === turn, within: 2500 });
    });
  }

  /** Something the child did: the idle hint waits again. */
  function poke() {
    wake();
    if (childMoves()) armIdle();
  }

  function startChildTurn() {
    if (!isOpen || game.winner !== null) return;
    busy = false;
    nopes = 0;
    nudged = false;
    hinting = false;
    mosiPick = null;
    turns++;
    sync();
    if (tutorial) {
      run(teach());
      return;
    }
    armIdle();
  }

  /**
   * The child is done for now: no hints, no pick, no bubble (in the tutorial his step stays until the next, but what it asked for
   * is no longer live).
   */
  function settleChild() {
    cancelTimer(idleTimer);
    cancelTimer(nudgeTimer);
    hinting = false;
    mosiPick = null;
    if (tutorial) {
      tutorial.live = null;
      tutorial.lit = null;
    } else hideAdvice();
  }

  function tapCard(id) {
    poke();
    if (!childMoves()) return;
    if (tutorial?.live === 'check' && id !== tutorial.check) return wrongAnswer(id);
    if (tutorial && tutorial.live !== 'check' && tutorial.live !== id) return;
    const card = game.hands[CHILD].find(held => held.id === id);
    const el = handEls.get(id);
    if (!card || !el) return;
    if (tutorial?.live === 'check') showAdvice(HINTS.right.id, HINTS.right.text); // found it
    if (!canPlay(card, game)) {
      nope(el);
      nopes++;
      const nothing = playable(game, CHILD).length === 0;
      if (nopes >= (nothing ? 1 : 2) && !hinting) {
        hinting = true; // what goes lifts (or, with nothing that goes, the deck calls)
        sync({ animate: false });
      }
      return;
    }
    if (isWild(card) && game.hands[CHILD].length > 1) run(playWild(card, el));
    else run(childPlays(card, placeHand(el)));
  }

  /**
   * In the tutorial, a card that leaves the child one before "Eitt!" is the lesson (the +4 does) is called for the child, quietly, so
   * the button does not glow for it.
   */
  const quietEitt = played => (tutorial && played.unsaid === CHILD && !(nextStep()?.live === 'eitt' && !nextStep().forget) ? callEitt(played, CHILD) : played);

  async function childPlays(card, from) {
    const token = round;
    busy = true;
    settleChild();
    const before = game;
    game = quietEitt(play(game, CHILD, card.id));
    renderHand(handCards());
    eittEl.classList.toggle('needed', game.unsaid === CHILD);
    await toPile(card, from);
    if (token !== round) return;
    await afterPlay(before, CHILD, card);
  }

  async function playWild(card, el) {
    const token = round;
    busy = true;
    const picked = mosiPick === card.id;
    settleChild();
    pendingWild = card;
    const from = placeHand(el);
    renderHand(handCards());
    ringEl.className = 'eitt-ring wild';
    await toPile(card, from);
    if (token !== round) return;
    mosiColour = picked ? adviseColour(game, card.id, CHILD) : null; // Mosi chose the wild, so he shows the colour too
    if (tutorial) tutorial.live = 'colours';
    sync({ animate: false });
  }

  async function chooseColour(colour) {
    wake();
    if (!pendingWild || flying || !isOpen) return;
    const token = round;
    const card = pendingWild;
    pendingWild = null;
    mosiColour = null;
    if (tutorial) tutorial.live = null;
    else hideAdvice();
    const before = game;
    game = quietEitt(play(game, CHILD, card.id, colour));
    sync({ animate: false });
    sfx('sparkle');
    wave(colour);
    view?.glow(colour, { hold: 1.4 }); // her plates catch the child's colour
    await wait(250);
    if (token !== round) return;
    await afterPlay(before, CHILD, card, { coloured: true });
  }

  async function tapDeck() {
    poke();
    if (!childMoves() || (tutorial && tutorial.live !== 'deck')) return;
    if (!canDraw(game, CHILD)) {
      nope(deckEl);
      if (!game.drew && !hinting) {
        hinting = true; // a card goes: it lifts
        sync({ animate: false });
      }
      return;
    }
    const token = round;
    busy = true;
    settleChild();
    const before = game;
    const { game: after, card } = draw(game, CHILD);
    game = after;
    if (card) sfx('draw');
    await giveCards(before, CHILD, 'deal');
    if (token !== round) return;
    if (game.turn === KAMBEDLA) run(herTurn()); // the card does not go: her turn
    else startChildTurn(); // it goes: it lifts, and "Áfram" keeps it
  }

  function keepCard() {
    poke();
    if (!childMoves() || !game.drew || tutorial) return;
    settleChild();
    game = pass(game, CHILD);
    run(herTurn());
  }

  /** The round button: the child's own "Eitt!", or catching Kambeðla when she forgot hers. */
  async function tapEitt() {
    wake();
    if (!isOpen || !game || game.winner !== null || ending) return;
    if (tutorial && tutorial.live !== 'eitt') return;
    if (game.unsaid === CHILD) {
      game = callEitt(game, CHILD);
      eittEl.classList.remove('needed');
      sfx('horn');
      egillSays();
      sparkle(eittEl, 10, win);
      view?.hop(); // well done!
      if (tutorial) { // the lesson goes on: her turn, when she forgets hers
        tutorial.live = null;
        sync({ animate: false });
        if (game.turn === KAMBEDLA) run(herTurn());
        else startChildTurn();
        return;
      }
      hideAdvice();
      if (childMoves()) armIdle();
      return;
    }
    if (game.unsaid === KAMBEDLA && !flying && !animating) {
      const token = round;
      const before = game;
      game = catchEitt(game, CHILD); // the child's cards wait while hers fly in (childMoves looks at `animating`)
      eittEl.classList.remove('needed');
      sfx('horn');
      egillSays();
      sparkle(eittEl, 10, win);
      view?.think(false);
      animating = (async () => {
        const said = say('eitt_oops');
        await giveCards(before, KAMBEDLA);
        if (said) await wait(Math.max(0, said * 1000 - GIVE_GAP * 2));
      })();
      await animating;
      animating = null;
      if (token !== round) return;
      if (tutorial) { // caught: on to the checks
        tutorial.live = null;
        startChildTurn();
        return;
      }
      if (childMoves()) {
        sync();
        armIdle();
      }
      return;
    }
    nope(eittEl); // nobody owes an "Eitt!"
  }

  // ---- After a card is played -------------------------------------------------------------------------------------------------

  async function afterPlay(before, who, card, { coloured = false, called = false } = {}) {
    const token = round;
    sync();
    if (isWild(card) && game.winner === null && !coloured) {
      // Kambeðla picked the colour: her plates glow in it and she says it.
      wave(game.colour);
      sfx('sparkle');
      view?.glow(game.colour);
      const said = say(`eitt_${game.colour}`);
      await wait(Math.max(500, said * 1000));
      if (token !== round) return;
    }
    if (game.winner !== null) return endRound();
    if (card.kind === 'skip' || card.kind === 'reverse') {
      sfx('swish');
      if (who === KAMBEDLA) view?.swish();
    }
    if (card.kind === 'draw2' || card.kind === 'wild4') {
      await wait(200);
      if (token !== round) return;
      await giveCards(before, next(before)); // the player after `who`
      if (token !== round) return;
    }
    if (who === CHILD && MOVES_AGAIN.has(card.kind)) view?.hop(); // a good card: she hops for joy all the same
    if (called) {
      // She played down to one card and remembered (decided as she played, so the button never glowed for it): "Eitt!"
      await wait(250);
      if (token !== round) return;
      sfx('horn');
      view?.glow('yellow', { hold: 1.2 });
      const said = say('eitt_eitt');
      await wait(Math.max(600, said * 1000));
      if (token !== round) return;
    }
    // If she forgot, game.unsaid is hers: "Eitt!" glows for the child to catch her (sync below).
    if (tutorial && game.unsaid === CHILD) { // the lesson (quietEitt): the tutorial waits for the child's "Eitt!"
      showStep(tutorial.step + 1);
      return;
    }
    if (tutorial && game.unsaid === KAMBEDLA && nextStep()?.forget) { // she forgot on purpose: the child catches her
      showStep(tutorial.step + 1);
      return;
    }
    sync();
    if (tutorial && game.turn === KAMBEDLA && nextStep()?.auto) return run(teach()); // the last check: the recap, not her turn
    if (game.turn === KAMBEDLA) run(herTurn());
    else startChildTurn();
  }

  // ---- Kambeðla's turn --------------------------------------------------------------------------------------------------------

  async function herTurn() {
    const token = round;
    busy = true;
    sync();
    view?.think(true);
    if (nextStep()?.her) showStep(tutorial.step + 1);
    else if (tutorial && !TUTORIAL[tutorial.step]?.check) hideAdvice(); // her move needs no words (after a check, his "Rétt!" stays a while)
    await wait(tutorial ? THINK_MS + 1000 : game.unsaid === CHILD ? OWED_MS : THINK_MS);
    while (animating) await animating; // the child is catching her
    if (token !== round || !isOpen) return;
    if (!tutorial && game.unsaid === CHILD && willCatch(skillNow(), random)) {
      // The child forgot "Eitt!": she noticed.
      const before = game;
      game = catchEitt(game, KAMBEDLA);
      view?.think(false);
      sfx('horn');
      view?.glow('yellow', { hold: 1.2 });
      const said = say('eitt_eitt');
      eittEl.classList.remove('needed');
      await giveCards(before, CHILD);
      await wait(Math.max(500, said * 1000 - 300));
      if (token !== round) return;
      view?.think(true);
      await wait(500);
      if (token !== round) return;
    }
    const move = tutorial ? tutorialMove() : chooseMove(game, KAMBEDLA, skillNow(), random);
    if (move.type === 'draw') {
      if (!saidDraw || random() < DRAW_TALK) say('eitt_i_draw', { still: () => token === round && game.turn === KAMBEDLA, within: 1200 });
      saidDraw = true;
      const before = game;
      const { game: after, card } = draw(game, KAMBEDLA);
      game = after;
      if (card) sfx('draw');
      await giveCards(before, KAMBEDLA, 'deal');
      if (token !== round) return;
      if (!game.drew) {
        view?.think(false);
        startChildTurn();
        return;
      }
      await wait(650); // the card she drew goes: she plays it
      if (token !== round) return;
      return herPlays(chooseMove(game, KAMBEDLA, skillNow(), random));
    }
    return herPlays(move);
  }

  async function herPlays(move) {
    const token = round;
    const card = game.hands[KAMBEDLA].find(held => held.id === move.cardId);
    const el = theirEls.get(card.id);
    const from = el ? placeTheirs(el) : placeDeck();
    const before = game;
    game = play(game, KAMBEDLA, card.id, move.colour);
    // Down to one card: she remembers "Eitt!" as her skill lets her, there and then, or forgets it and may be caught.
    // In the tutorial she always remembers, but once: when the lesson is to catch her.
    const called = game.unsaid === KAMBEDLA && (tutorial ? !nextStep()?.forget : willCallEitt(skillNow(), random));
    if (called) game = callEitt(game, KAMBEDLA);
    view?.think(false);
    renderTheirs(game.hands[KAMBEDLA]);
    await toPile(card, from, 'up');
    if (token !== round) return;
    await afterPlay(before, KAMBEDLA, card, { called });
  }

  // ---- The round ------------------------------------------------------------------------------------------------------------------

  async function deal(start = newGame({ random })) {
    const token = ++round;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    hush();
    ending = false;
    if (!tutorial) { // the first real round after the tutorial helps sooner
      quickHints = quickNext;
      quickNext = false;
    }
    root.classList.toggle('teaching', Boolean(tutorial)); // the real round's cards are not dimmed as they are dealt
    busy = true;
    flying = 0;
    pendingWild = null;
    mosiPick = null;
    mosiColour = null;
    animating = null;
    hinting = false;
    saidDraw = false;
    winEl.hidden = true;
    confettiEl.replaceChildren();
    hideAdvice(true);
    view?.rest();
    game = start;
    // Every card's place is laid out first, empty, so each flies straight to where it stays.
    renderPile([]);
    ringEl.hidden = true;
    passEl.hidden = true;
    coloursEl.hidden = true;
    deckEl.classList.remove('draw');
    eittEl.classList.remove('needed');
    const mine = handCards();
    renderHand(mine, { hidden: new Set(mine.map(card => card.id)), animate: false });
    renderTheirs(game.hands[KAMBEDLA], { hidden: new Set(game.hands[KAMBEDLA].map(card => card.id)), animate: false });
    sfx('shuffle');
    if (!calm()) deckEl.animate?.([{ rotate: '0deg' }, { rotate: '-5deg' }, { rotate: '4deg' }, { rotate: '-2deg' }, { rotate: '0deg' }], { duration: 620 });
    await wait(650);
    if (token !== round) return;
    const flights = [];
    for (let k = 0; k < Math.max(mine.length, game.hands[KAMBEDLA].length); k++) {
      for (const who of [CHILD, KAMBEDLA]) {
        const card = who === CHILD ? mine[k] : game.hands[KAMBEDLA][k];
        if (!card) continue;
        const el = (who === CHILD ? handEls : theirEls).get(card.id);
        flights.push(fly(who === CHILD ? card : null, placeDeck(), who === CHILD ? placeHand(el) : placeTheirs(el), {
          turn: who === CHILD ? 'up' : 'none',
          duration: DEAL_MS,
          onLand: () => { el.style.visibility = ''; },
        }));
        sfx('deal');
        await wait(DEAL_GAP);
        if (token !== round) return;
      }
    }
    await Promise.all(flights);
    if (token !== round) return;
    await wait(200);
    if (token !== round) return;
    await toPile(game.pile[0], placeDeck(), 'up');
    if (token !== round) return;
    sync();
    wave(game.colour);
    startChildTurn();
  }

  async function endRound() {
    if (tutorial) return endTutorial(); // the tutorial's game won: no sticker, no win or loss for her skill, and the first real round comes
    const token = round;
    busy = true;
    settleChild();
    sync();
    const childWon = game.winner === CHILD;
    const was = eittState();
    const wins = was.wins + (childWon ? 1 : 0);
    save?.setEitt?.({ ...afterRound(was, childWon), wins });
    await wait(500);
    if (token !== round) return;
    view?.cheer();
    sfx(childWon ? 'fanfare' : 'horn');
    const said = say(childWon ? 'eitt_you_won' : 'eitt_i_won');
    winWords.textContent = childWon ? 'Þú vannst!' : 'Kambeðla vann!';
    stickerEl.hidden = !childWon;
    stickerWords.hidden = !childWon;
    confettiEl.replaceChildren(...(childWon ? confetti() : []));
    winEl.hidden = false;
    await wait(Math.max(1800, said * 1000 + 500));
    if (token !== round) return;
    say('eitt_again');
  }

  /** The confetti of a round won, as the look has it (eitt.css .eitt-confetti). */
  function confetti() {
    const colours = Object.keys(ORDER);
    return Array.from({ length: 56 }, (_, k) => {
      const bit = make('i', colours[k % 4]);
      bit.style.setProperty('--x', `${((k * 61.8) % 100).toFixed(1)}%`);
      bit.style.setProperty('--a', `${(k * 67) % 180}deg`);
      bit.style.setProperty('--t', `${(3.2 + (k % 5) * 0.45).toFixed(2)}s`);
      bit.style.setProperty('--d', `${-((k * 1.93) % 4.6).toFixed(2)}s`);
      return bit;
    });
  }

  // ---- Opening and shutting ---------------------------------------------------------------------------------------------------

  function pause(paused) {
    try {
      onPause?.(paused);
    } catch (error) {
      console.error('[eitt]', error);
    }
  }

  function open({ tutorial: teachFirst = false } = {}) {
    if (isOpen) return;
    isOpen = true;
    root.hidden = false;
    if (!calm()) root.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    pause(true);
    music.start();
    startView();
    if (teachFirst || !eittState().tutorialDone) startTutorial();
    else {
      tutorial = null;
      run(deal());
    }
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    ending = false;
    round++; // the round under way is dropped, with no penalty
    for (const id of timers) clearTimeout(id);
    timers.clear();
    busy = true;
    for (const flyer of root.querySelectorAll('.eitt-flyer')) flyer.remove();
    flying = 0;
    pendingWild = null;
    tutorial = null;
    root.classList.remove('teaching');
    captionEl.hidden = true;
    hush();
    voice.stop();
    music.stop();
    view?.rest();
    view?.stop();
    root.hidden = true;
    pause(false);
    try {
      onClose?.();
    } catch (error) {
      console.error('[eitt]', error);
    }
  }

  // ---- Touch ------------------------------------------------------------------------------------------------------------------

  const tap = { sfx: name => effects.play(name) };
  pressable(deckEl, { audio: tap, sound: null, win, onTap: () => run(tapDeck()) });
  pressable(passEl, { audio: tap, win, onTap: () => keepCard() });
  pressable(eittEl, { audio: tap, sound: null, win, onTap: () => run(tapEitt()) });
  pressable(mosiEl, { audio: tap, win, onTap: () => askMosi() });
  for (const button of colourButtons) pressable(button, { audio: tap, sound: null, win, onTap: () => run(chooseColour(button.dataset.colour)) });
  pressable(againEl, { audio: tap, win, onTap: () => { wake(); if (isOpen && game && game.winner !== null) run(deal()); } });
  pressable(closeEl, { audio: tap, win, onTap: () => close() });
  pressable(quitEl, { audio: tap, win, onTap: () => close() });
  pressable(teachEl, { audio: tap, win, onTap: () => { wake(); if (isOpen) startTutorial(); } });
  pressable(skipEl, { audio: tap, win, onTap: () => { wake(); if (isOpen && tutorial) run(endTutorial({ skipped: true })); } });
  root.addEventListener('pointerdown', () => wake(), true);
  root.addEventListener('contextmenu', event => event.preventDefault()); // a long press is a tap, never the browser's menu
  win?.addEventListener?.('resize', () => { if (isOpen && game && !flying) sync({ animate: false }); });

  return {
    open,
    close,
    get isOpen() { return isOpen; },
    get game() { return game; },
    /** What the game waits for, for a probe: 'child' (the child's move), 'colour' (a colour for the wild), 'over', 'busy' or 'shut'. */
    get phase() {
      if (!isOpen) return 'shut';
      if (tutorial) return `tutorial ${TUTORIAL[tutorial.step]?.id.slice(9) ?? 'deal'}${tutorial.live ? ` ${tutorial.live}` : ''}${childMoves() || pendingWild || tutorial.live === 'eitt' ? '' : ' busy'}`;
      if (game && game.winner !== null) return 'over';
      if (pendingWild) return flying ? 'busy' : 'colour';
      return childMoves() ? 'child' : 'busy';
    },
    get muted() { return muted; },
    set muted(value) { setMuted(value); },
  };
}
