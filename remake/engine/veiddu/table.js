import { KINDS, kindOf, makeDeck } from './cards.js';
import { newGame, ask, fish, legalTargets, holds } from './rules.js';
import { SEAT, createMind, bestAsk, inRoundSkill, VEIDDU_SKILL_START } from './minds.js';
import { childWon as childIn, afterRoundSave } from './remote.js';
import { createEittMusic } from '../eitt/eitt-sounds.js';
import { createGameSfx } from '../audio/game-music.js';
import { pressable, sparkle, reducedMotion, TAP_SLOP_PX } from '../book/fx.js';
import { veidduSounds, VEIDDU_GAPS, createSplash } from './veiddu-sounds.js';
import { createSpeech, nameLine, askLine, answerLine, whyLine, endLine, isHers, priorityOf, HINT_LINE, EMPTY_LINE, NUDGE_LINE } from './speech.js';
import { cardElement, layoutHand, layTheirs, catchElement, bubbleElement, pondCard, tableElement, winElement, make, POND_SHOWN } from './look.js';

// The table of "Veiddu" (spec sections 2 to 5): the round the child plays with Uggeðla and Mosi, rendered into veiddu.css's classes (the
// class list is at the top of veiddu.css, which is the game's whole look; look.js draws the markup). The rules, the minds and Mosi's
// advice are the pure modules beside this one; this is the DOM, the motion and the pace over them. Eitt!'s table (eitt/table.js) is
// the model for the pace, the flights and the open and close; this one is its own.
//
//   - The deal: the pond fills, five cards fly to each hand, and the pairs the hands hold lay themselves down in the catches.
//   - The child's turn: a tap on a card lifts it (another tap changes it) and the windows of those who may be asked glow; a tap on one
//     asks. Then the answer: a "yes" flies the card over, the pair snaps together with a sparkle and flies to the catch, and the child
//     asks again; a "no" sends the child fishing: the pond calls, a tap draws a card and the water splashes. A lucky card (the animal
//     asked for) is a pair and the child asks again; any other pairs if it can, and the turn goes on.
//   - The minds' turns: each thinks about 1.2 s, and then asks, with its words in a bubble and an arrow at the one asked. They are fed
//     every event of the game (and learn only what the rules made public).
//   - When the child is asked: "child-give" (the right card waits for a tap, a wrong one wiggles, it lights after 4 s, and Mosi says
//     what to do after 8 s) or "child-no" (the big "Farðu að veiða!" button is the one right answer).
//   - After about 6 s with nothing done on the child's turn the best card lifts and its window glows, and after 7 s Uggeðla may say
//     "Þú átt leik, Egill!", at most once in 20 s. Mosi's button gives the same advice at once, with his reason.
//   - The end: the winner's words (all the winners on a tie), confetti and Uggeðla's sticker for a child who won or tied, "Spilum
//     aftur?", and the minds' skill updated for the next round (skill.js afterRound) when the save keeps one.
//   - The tutorial ("Kennsla", spec section 8): the first time the game opens (a save that has not got tutorialDone), and whenever the
//     child taps "Kennsla". Mosi teaches one short game from a stacked deck (TUTORIAL_STACK), a step at a time, said and shown in his
//     bubble (TUTORIAL): the pair Egill is dealt goes to his catch, he asks Uggeðla and gets a card, which becomes a pair, he asks Mosi
//     and fishes, Mosi asks him and he gives, and he remembers that Uggeðla asked for a frog. The two minds ask what TUTORIAL_MINDS says;
//     only what a step means is live (lit; the rest is dimmed and takes no taps). "Sleppa" ends it at any step. It is no round: no
//     sticker, nothing for the minds' skill, and what it ends in is a real round, after Mosi's "Nú spilum við alvöruleik!".
// Input waits while a card flies or a mind moves: every handler answers only the phase it serves. Every line shows as text in its bubble
// for lineMs(text), or for as long as its recording takes if that is longer: lineDone() is the one place the pace of a line lives, and
// nothing goes on (a mind's next step, the next bubble) until the line has had its time and its voice has ended. The voices are the
// veiddu set of lines.json (speech.js: one at a time, Egill's first, then Mosi's advice, then the game's asks and answers, then
// chatter); Egill reads the name of the card he lifts, and Uggeðla's mouth follows her recordings. A line not recorded yet shows its
// bubble for lineMs(text) in silence. The sound is veiddu-sounds.js: Eitt!'s effects and music, tuned to Eitt!'s key, and the recorded
// splash on every fish. Under prefers-reduced-motion a flight is a fade where the card lands and nothing idles; the sounds still play,
// for sound is not motion.

const REMAKE = new URL('../../', import.meta.url); // remake/: where the pictures start
const asset = path => new URL(path, REMAKE).href;
const MUSIC = asset('assets/audio/eitt/music.mp3'); // Eitt!'s music for now (spec section 6); the effects take the key of its music.json

const KIND = new Map(KINDS.map(kind => [kind.id, kind]));
const ORDER = KINDS.map(kind => kind.id);
const CHILD = SEAT.child;
const UGGEDLA = SEAT.uggedla;
const MOSI = SEAT.mosi;
const NAMES = { [CHILD]: 'Egill', [UGGEDLA]: 'Uggeðla', [MOSI]: 'Mosi' };

const THINK_MS = 1200; // a mind thinks this long before it asks
const FISH_BEAT_MS = 500; // and this long before it fishes after a no
const DEAL_MS = 360; // a card dealt flies this long
const DEAL_GAP = 105; // ms between two cards dealt
const FLY_MS = 430; // a card given or fished flies this long
const GATHER_MS = 420; // the two cards of a pair come together this long,
const SNAP_MS = 260; // hold, sparkling,
const CATCH_MS = 480; // and fly to the catch this long
const ANSWER_BEAT_MS = 550; // a "yes" is read before the card flies
const IDLE_MS = 6000; // the child's turn with nothing done this long: the best card lifts and its window glows
const NUDGE_MS = 7000; // and this long: Uggeðla may say "Þú átt leik, Egill!"
const NUDGE_GAP_MS = 20000; // but never sooner than this after she last said it
const GIVE_HINT_MS = 4000; // asked for an animal the child holds: the right card lights after this long
const GIVE_ADVICE_MS = 8000; // and Mosi says what to do after this long
const ADVICE_MS = 4800; // Mosi's bubble stays at least this long
const AUTO_MS = 1200; // at &auto=1 the child's moves wait this long
const VOICE_TAIL_MS = 400; // a bubble stays this long after its recording ends, if the text's own time (lineMs) has run out
const NUDGE_WITHIN_MS = 2500; // "Þú átt leik, Egill!" that has waited this long for the voice is dropped
const NAME_WITHIN_MS = 2500; // and so is a name that has waited this long for the voice
const MIN_STEP_MS = 3200; // a tutorial step that needs nothing from the child stays at least this long (its line, if longer)

/**
 * How long a line shows when it is not spoken: about 1.6 s and 60 ms for each letter. A spoken line shows for this long too, or for
 * as long as its recording lasts (and a little more) if that is longer; the table waits for the longer before it goes on.
 */
export const lineMs = text => 1600 + 60 * [...text].length;

export const asking = kind => `Áttu ${KIND.get(kind).ask}?`;
export const SAY = {
  yes: 'Já, gjörðu svo vel!', // a mind gives the card
  give: 'Gjörðu svo vel!', // and Egill does
  no: 'Nei! Farðu að veiða!', // a mind has not got it
  childNo: 'Farðu að veiða!', // and Egill has not
  lucky: 'Ég veiddi það!',
  empty: 'Tjörnin er tóm!',
  nudge: 'Þú átt leik, Egill!',
  giveHelp: 'Þú átt þetta dýr! Pikkaðu á það.', // Mosi, when the child has not found the card to give
};
/** Mosi's words for each reason bestAsk gives (minds.js). */
export const WHY = {
  'they-asked': 'Uggeðla bað um þetta dýr. Spurðu hana!',
  'mosi-asked': 'Ég bað um þetta dýr. Spurðu mig!',
  guess: 'Enginn hefur beðið um neitt sem þú átt. Prófaðu eitthvað!',
  fish: 'Tjörnin kallar! Veiddu spil.',
};

// The tutorial's game. The deck is stacked (the first card is dealt first, round the table from Egill: his, Uggeðla's, Mosi's), so that
// the six steps come in their order and nobody has a pair but Egill:
//   Egill  snigill x2 (the pair he is dealt: step 1), skjaldbaka, drekafluga, salamandra
//   Uggeðla  skjaldbaka (step 2: Egill asks her and gets it, and the pair goes down: step 3), froskur (step 6), three fish
//   Mosi   salamandra (step 5: he asks Egill for it), vatnalaesingi, three fish; he has no drekafluga (step 4: Egill asks him, and fishes)
// then the pond gives, in order: froskur (Egill's fish, which does not pair, so the turn goes on to Uggeðla), brunnklukka (hers), snigill
// (Mosi's). The acts, in order: Egill asks Uggeðla for the skjaldbaka (yes, pair); Egill asks Mosi for the drekafluga (no) and fishes the
// froskur; Uggeðla asks Mosi for the froskur (no) and fishes; Mosi asks Egill for the salamandra (yes, pair), then Uggeðla for the
// vatnalaesingi (no) and fishes; Egill is on turn and Uggeðla asked for a froskur, which he holds: he asks her (step 6, yes, pair).
const DEALT = [
  'snigill-1', 'skjaldbaka-2', 'salamandra-1',
  'snigill-2', 'froskur-1', 'fiskur-blar-1',
  'skjaldbaka-1', 'fiskur-raudur-1', 'fiskur-appelsinugulur-1',
  'drekafluga-1', 'fiskur-gulur-1', 'fiskur-fjolublar-1',
  'salamandra-2', 'fiskur-graenn-1', 'vatnalaesingi-1',
];
const FISHED = ['froskur-2', 'brunnklukka-1', 'snigill-3'];
/** The tutorial's deck in draw order, as newGame({ stack }) takes it: the cards dealt, the three the pond gives first, and the rest. */
export function tutorialStack() {
  const deck = makeDeck();
  const first = [...DEALT, ...FISHED].map(id => deck.find(card => card.id === id));
  return [...first, ...deck.filter(card => !first.includes(card))];
}

/**
 * Mosi's steps, each a line of the veiddu set (veiddu_tut_<step> in assets/audio/veiddu/lines-source.json) and its words. `live` is what
 * the child may do while the step stands, and only that: { kind, target } to lift the card of that kind and ask that seat, { give } to
 * give that kind when it is asked for. A step with no `live` is only said (and shown): it goes on by itself once said. Step 4 goes on from
 * the question to the pond (the "no" calls it), and step 3 is said as the pair flies.
 */
export const TUTORIAL = [
  { id: 'veiddu_tut_pairs', text: 'Tvö eins spil eru par. Safnaðu flestum pörum!' },
  { id: 'veiddu_tut_ask', text: 'Pikkaðu á skjaldbökuna. Pikkaðu svo á Uggeðlu og spurðu hana!', live: { kind: 'skjaldbaka', target: UGGEDLA } },
  { id: 'veiddu_tut_laid', text: 'Þú fékkst skjaldböku! Nú áttu par. Parið fer í aflann.' },
  { id: 'veiddu_tut_fish', text: 'Spurðu Mosa um drekaflugu. Hann á hana ekki. Þá ferðu að veiða í tjörninni!', live: { kind: 'drekafluga', target: MOSI } },
  { id: 'veiddu_tut_give', text: 'Nú spyr ég þig! Pikkaðu á spilið sem ég bið um.', live: { give: 'salamandra' } },
  { id: 'veiddu_tut_remember', text: 'Uggeðla bað um frosk. Spurðu hana!', live: { kind: 'froskur', target: UGGEDLA } },
];
/** Mosi's word as the two minds begin to play ("remember what we ask for"), and as the tutorial ends. */
export const LISTEN = { id: 'veiddu_tut_listen', text: 'Nú spila Uggeðla og ég. Mundu hvað við biðjum um!' };
export const REAL = { id: 'veiddu_tut_real', text: 'Nú spilum við alvöruleik!' };
/** What each mind asks in the tutorial, in order; the rest of its turn (the fish) is the rules'. */
export const TUTORIAL_MINDS = {
  [UGGEDLA]: [{ target: MOSI, kind: 'froskur' }],
  [MOSI]: [{ target: CHILD, kind: 'salamandra' }, { target: UGGEDLA, kind: 'vatnalaesingi' }],
};

/** The winners' words: "Þú vannst!", "Mosi vann!", and on a tie all of them ("Þú og Uggeðla unnuð jafnt!"). */
function winWords(winners) {
  if (winners.length === 1) return winners[0] === CHILD ? 'Þú vannst!' : `${NAMES[winners[0]]} vann!`;
  const names = winners.map(seat => (seat === CHILD ? 'Þú' : NAMES[seat]));
  const list = names.length === 2 ? names.join(' og ') : `${names.slice(0, -1).join(', ')} og ${names.at(-1)}`;
  return `${list} ${winners.includes(CHILD) ? 'unnuð' : 'unnu'} jafnt!`;
}

const STALE = Symbol('stale'); // thrown into a flow whose round was dropped (the game shut, a new deal): it just stops
const cardOf = id => ({ id, kind: kindOf(id) });
const byKind = (a, b) => ORDER.indexOf(a.dataset.kind) - ORDER.indexOf(b.dataset.kind) || a.dataset.id.localeCompare(b.dataset.id);
const EMPTY_ROUND = { mine: [], theirs: [0, 0], pairs: [[], [], []], pond: 0, targets: false };

/**
 * "Veiddu" in `doc`'s #veiddu (an element with the class veiddu), over the `save` (engine/save.js: getVeiddu and setVeiddu keep the
 * minds' skill and the wins; null: the minds start at VEIDDU_SKILL_START each round and nothing is kept). `audio` is the page's sound,
 * { context, output, theme, lines, muted } (engine/audio/output.js; no context: the game is silent; `lines` is lines.json, whose veiddu set is
 * what is spoken, and without it the game speaks in bubbles alone), and `fjolspil` is for the tasks that follow. `onPause(paused)` holds the chapter while the game is open, and `onClose()` is told when it shuts.
 * `auto` makes the child's moves by itself (the lab's &auto=1, for a video of a whole round). `uggedlaLive` (true) lets Uggeðla's picture
 * give way to her live 3D view (uggedla-view.js) once it is ready; false keeps the picture (a slow machine, a capture with no WebGL). Returns
 *   open({ tutorial })  opens the game: Mosi's tutorial first if `tutorial` is true or the save has not got tutorialDone, else a round
 *   close()    shuts it, dropping a round under way with no penalty
 *   isOpen     whether it is open
 *   muted      silences it (the effects, the music, the splash and the voices)
 *   said       every line sounded so far, { id, at (Date.now()), seconds }; speech: the voices' state (talking, current, waiting), for a probe
 *   game       the round as it is now (the rules' data), for a probe, and phase, what it waits for: 'shut', 'child-pick', 'child-target',
 *              'child-fish', 'child-give', 'child-no', 'busy' or 'over'; while Mosi teaches 'tutorial <step> <pick|target|fish|give|busy>'
 *              ('tutorial ask pick': the step is veiddu_tut_ask and Egill is to lift a card), and teaching is that step's name, else null
 *   dealt      how many deals there have been since the page began (the tutorial's too); auto: whether the child plays itself
 *   uggedla    her live view, once it is ready (null before, and for good where it cannot start); viewReady: a promise that settles
 *              when it has started or has failed
 */
export function createVeidduGame(doc, {
  save = null, audio = {}, onClose = null, onPause = null, win = globalThis.window, random = Math.random, fjolspil = null, auto: autoStart = false,
  uggedlaLive = true,
} = {}) {
  const root = doc.getElementById('veiddu');
  if (!root) throw new Error('"Veiddu" needs #veiddu on the page (see veiddu-lab.html)');
  const el = (tag, className, html = '') => make(doc, tag, className, {}, html);
  const calm = () => reducedMotion(win);

  // ---- The page -------------------------------------------------------------------------------------------------------------

  const table = tableElement(doc, EMPTY_ROUND);
  const winEl = winElement(doc);
  winEl.hidden = true;
  root.classList.add('veiddu');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Veiddu, spil við Uggeðlu og Mosa');
  root.replaceChildren(table, winEl);
  root.hidden = true;

  const seatEls = { [UGGEDLA]: table.querySelector('.veiddu-seat[data-seat="1"]'), [MOSI]: table.querySelector('.veiddu-seat[data-seat="2"]') };
  const windowEls = { [UGGEDLA]: seatEls[UGGEDLA].querySelector('.veiddu-uggedla'), [MOSI]: seatEls[MOSI].querySelector('.veiddu-mosi') };
  const fanDoms = { [UGGEDLA]: seatEls[UGGEDLA].querySelector('.veiddu-their-hand'), [MOSI]: seatEls[MOSI].querySelector('.veiddu-their-hand') };
  const countEls = { [UGGEDLA]: seatEls[UGGEDLA].querySelector('.veiddu-count'), [MOSI]: seatEls[MOSI].querySelector('.veiddu-count') };
  const meEl = table.querySelector('.veiddu-me-catch');
  const catchEls = { [CHILD]: meEl.querySelector('.veiddu-catch'), [UGGEDLA]: seatEls[UGGEDLA].querySelector('.veiddu-catch'), [MOSI]: seatEls[MOSI].querySelector('.veiddu-catch') };
  const pondEl = table.querySelector('.veiddu-pond');
  const handEl = table.querySelector('.veiddu-hand');
  const helpEl = table.querySelector('.veiddu-mosi-help');
  const quitEl = table.querySelector('.veiddu-quit');
  const teachEl = table.querySelector('.veiddu-teach');
  const winCard = winEl.querySelector('.veiddu-win-card');
  const skipEl = el('button', 'veiddu-skip', '<span>Sleppa</span>'); // the tutorial's way out, in the corner where "Kennsla" stands
  skipEl.setAttribute('aria-label', 'Sleppa kennslu');
  skipEl.hidden = true;
  teachEl.hidden = true; // shown (by marks) while the game is open and Mosi is not teaching
  table.append(skipEl);

  // ---- State ----------------------------------------------------------------------------------------------------------------

  let isOpen = false;
  let auto = Boolean(autoStart);
  let game = null; // the rules' game as the table has shown it
  let round = 0; // counts rounds; a flow that finds it changed (a new deal, the game shut) stops
  let dealt = 0;
  let taught = 0; // how many of the deals were the tutorial's: they are no rounds
  // While Mosi teaches: { step (an index into TUTORIAL; -1 before the first), live (what the child may do now: { kind, target },
  // { give }, { pond: true } or null), said (the last of his lines, { id, text }: his button says it again), until (clock ms: the
  // step has had its time then), listened (LISTEN said), minds (the moves still to make: TUTORIAL_MINDS) }. Null when he is not.
  let tutorial = null;
  let busy = true; // a card flies or a mind moves: the child's taps wait
  let ended = false; // the win card shows
  let flying = 0; // flyers in the air
  let picked = null; // the kind the child has picked
  let hintKind = null; // the kind the idle hint, or Mosi, lifts
  let hintTarget = null; // and the seat whose window it lights
  let waiting = null; // the child is asked: { kind, holds, hinted, resolve, reject }
  let nudged = false; // "Þú átt leik, Egill!" said this turn
  let turns = 0; // counts the child's turns, so a nudge that waited for the voice knows whether it is still the same turn
  let lastNudge = -Infinity; // when she last said it (performance.now() ms)
  let minds = {};
  let bubbleUntil = 0; // the line showing has had its time then (lineMs, or its recording and a little more)
  let pondShown = []; // the pond's cards lying on it
  let pondCount = 0; // and how many it holds
  let pairsShown = [[], [], []]; // the kinds in each catch as the table shows them
  const handEls = new Map(); // card id -> its button in the child's hand
  const fanEls = { [UGGEDLA]: new Map(), [MOSI]: new Map() }; // card id -> its back in a mind's hand
  const outSeen = new Set(); // the seats whose "out" has been shown
  let bubbleEl = null;
  let adviceEl = null;
  let fishButton = null;
  const timers = new Set();
  let idleTimer = 0;
  let nudgeTimer = 0;
  let giveTimers = [];
  let adviceTimer = 0;
  let autoTimer = 0;

  const clock = () => globalThis.performance?.now?.() ?? Date.now();
  function later(ms, fn) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }
  const cancel = id => {
    clearTimeout(id);
    timers.delete(id);
  };
  /** Resolves after `ms`; rejects (STALE) if the round was dropped meanwhile. */
  const wait = ms => {
    const t = round;
    return new Promise((resolve, reject) => later(ms, () => (t === round ? resolve() : reject(STALE))));
  };
  /** Starts a flow (they are async: cards fly, a mind thinks); one that was dropped just stops, one that fails is said. */
  const run = flow => flow?.catch?.(error => {
    if (error !== STALE) console.error('[veiddu] A move went wrong:', error);
  });

  // ---- Sound ----------------------------------------------------------------------------------------------------------------

  const context = audio.context ?? null;
  const output = audio.output ?? null;
  // The effects are tuned to their music's key (assets/audio/eitt/music.json), else the page's theme (engine/audio/game-music.js); the
  // music loops while the game is open; the splash is two recorded files (assets/veiddu/splash.json). With no context all are silent.
  const effects = createGameSfx({ music: MUSIC, context, theme: audio.theme ?? null, output, sounds: veidduSounds, gaps: VEIDDU_GAPS });
  const music = createEittMusic({ context, output, url: MUSIC });
  const splashes = createSplash({ context, output, urls: { full: asset('assets/veiddu/splash.mp3'), soft: asset('assets/veiddu/splash-soft.mp3') } });
  // The voices: the veiddu lines of lines.json, one at a time (speech.js), which duck the music while a line speaks. Uggeðla's mouth
  // follows her recorded lines, and moves gently through one that is not recorded yet (or muted), as long as its bubble shows.
  const spoken = []; // every line sounded, { id, at (Date.now()), seconds }: for a probe, and the video tool's report
  const speech = createSpeech({
    lines: audio.lines ?? {},
    base: REMAKE,
    onDuck: on => music.duck(on),
    onLine: ({ id, line, sound }) => {
      if (sound) spoken.push({ id, at: Date.now(), seconds: line.duration ?? 0 });
      if (isHers(id)) view?.talk(line?.mouth ? line : { duration: line?.duration ?? 1.2 });
    },
  });
  /** Says a line of the veiddu set, now or once the one sounding has ended (speech.js); returns the seconds until it will have been said. */
  const say = (id, options) => speech.say(id, options);
  /** The child has done something: chatter ("Þú átt leik, Egill!") that is still sounding or waiting is no longer true. */
  function cutChatter() {
    if (speech.cut(priorityOf(NUDGE_LINE)) && bubbleEl?.dataset.from === String(UGGEDLA)) clearBubble();
  }
  let muted = false;
  const sfx = (name, detail) => effects.play(name, detail);
  function setMuted(value) {
    muted = Boolean(value);
    effects.muted = muted;
    music.muted = muted;
    splashes.muted = muted;
    speech.muted = muted;
  }
  setMuted(audio.muted); // wherever the game's sound is muted (captures), so is this

  /** A touch in the game: the browser lets sound begin from it, so the music that could not start before a touch starts now. */
  function wake() {
    if (!isOpen) return;
    if (context?.state === 'suspended') context.resume?.().catch?.(() => {});
    music.wake();
  }

  const skillBase = () => save?.getVeiddu?.()?.skill ?? VEIDDU_SKILL_START;
  const skillNow = () => inRoundSkill(skillBase(), game.pairs[CHILD].length, Math.max(...game.pairs.map(laid => laid.length)));

  /** What the table waits for (the child's moves are the 'child-' ones; see the header). */
  function phase() {
    if (!isOpen) return 'shut';
    if (ended) return 'over';
    if (busy || !game) return 'busy';
    if (waiting) return waiting.holds ? 'child-give' : 'child-no';
    if (game.turn !== CHILD) return 'busy';
    if (game.phase === 'fish') return 'child-fish';
    return game.phase === 'ask' ? (picked ? 'child-target' : 'child-pick') : 'busy';
  }
  const childTurn = () => ['child-pick', 'child-target', 'child-fish'].includes(phase());
  /** While Mosi teaches the phase is 'tutorial <step>' and what the child does ('pick', 'target', 'fish', 'give') or 'busy'. */
  function tutorialPhase() {
    const name = tutorial.step < 0 ? 'deal' : TUTORIAL[tutorial.step].id.slice('veiddu_tut_'.length);
    const doing = { 'child-pick': 'pick', 'child-target': 'target', 'child-fish': 'fish', 'child-give': 'give' }[phase()];
    return `tutorial ${name} ${doing ?? 'busy'}`;
  }

  // ---- Where things are -----------------------------------------------------------------------------------------------------

  /** Where `box` is: its middle in the game's own pixels, its width, and how it is turned (degrees). */
  function placeOf(box, r = 0) {
    const at = box.getBoundingClientRect();
    const base = root.getBoundingClientRect();
    return { x: at.left + at.width / 2 - base.left, y: at.top + at.height / 2 - base.top, w: box.offsetWidth || at.width, r };
  }
  const turnOf = (box, per) => per * Number(box.style.getPropertyValue('--i') || 0);
  const placeHand = card => placeOf(card, turnOf(card, 3));
  const placeTheirs = card => placeOf(card, turnOf(card, -5));

  /** Where the card with this id lies now: { seat, el }, in the child's hand or a mind's. */
  function where(id) {
    if (handEls.has(id)) return { seat: CHILD, el: handEls.get(id) };
    for (const seat of [UGGEDLA, MOSI]) if (fanEls[seat].has(id)) return { seat, el: fanEls[seat].get(id) };
    return null;
  }
  const placeAt = found => (found.seat === CHILD ? placeHand(found.el) : placeTheirs(found.el));
  const detach = (found, id) => {
    (found.seat === CHILD ? handEls : fanEls[found.seat]).delete(id);
    found.el.remove();
  };

  // ---- Laying out the cards -------------------------------------------------------------------------------------------------

  const rects = els => new Map([...els].map(([id, card]) => [id, card.isConnected ? card.getBoundingClientRect() : null]));

  /** Cards that changed place slide there from where they were, so a hand closes up and makes room smoothly (a FLIP). */
  function glide(before, els) {
    if (calm()) return;
    for (const [id, old] of before) {
      const card = els.get(id);
      if (!old || !card?.isConnected || card.style.visibility === 'hidden') continue;
      const now = card.getBoundingClientRect();
      const dx = old.left + old.width / 2 - (now.left + now.width / 2);
      const dy = old.top + old.height / 2 - (now.top + now.height / 2);
      if (Math.hypot(dx, dy) > 1) card.animate?.([{ translate: `${dx.toFixed(1)}px ${dy.toFixed(1)}px` }, { translate: '0px 0px' }], { duration: 320, easing: 'cubic-bezier(.3, .7, .4, 1)' });
    }
  }

  /** The child's cards in their arc, in the order of the kinds. */
  function renderHand({ animate = true } = {}) {
    const before = animate ? rects(handEls) : null;
    const ordered = [...handEls.values()].sort(byKind);
    const now = [...handEl.children];
    if (now.length !== ordered.length || now.some((card, k) => card !== ordered[k])) handEl.append(...ordered);
    layoutHand(handEl);
    marks();
    if (before) glide(before, handEls);
  }

  /** A mind's cards face down in front of its window, and how many there are. */
  function renderFan(seat, { animate = true } = {}) {
    const before = animate ? rects(fanEls[seat]) : null;
    layTheirs(fanDoms[seat], seatEls[seat]);
    const n = fanEls[seat].size;
    countEls[seat].textContent = String(n);
    countEls[seat].hidden = n === 0;
    fanDoms[seat].setAttribute('aria-label', `${NAMES[seat]} á ${n} spil`);
    if (before) glide(before, fanEls[seat]);
  }

  /** The child's own card, in its place in the hand (hidden until a flyer lands on it). */
  function addToHand(card, hidden) {
    const button = cardElement(doc, card, { tag: 'button' });
    if (hidden) button.style.visibility = 'hidden';
    tappable(button, () => tapCard(card.id));
    handEls.set(card.id, button);
    return button;
  }
  /** A mind's card, a back. */
  function addToFan(seat, card, hidden) {
    const back = cardElement(doc, card, { back: true });
    if (hidden) back.style.visibility = 'hidden';
    fanEls[seat].set(card.id, back);
    fanDoms[seat].append(back);
    return back;
  }
  const addCard = (seat, card, hidden) => (seat === CHILD ? addToHand(card, hidden) : addToFan(seat, card, hidden));
  const settleHands = seats => {
    for (const seat of seats) (seat === CHILD ? renderHand() : renderFan(seat));
  };

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
  /** Where a card is drawn from: the pond's last card on show. */
  const pondTop = () => placeOf(pondShown.at(-1) ?? pondEl, pondShown.length ? Number.parseFloat(pondShown.at(-1).style.getPropertyValue('--r')) : 0);
  /** Where the deal starts: the middle of the pond, at the size of its cards. */
  const pondMiddle = () => ({ ...placeOf(pondEl), w: pondShown[0]?.offsetWidth ?? 60 });

  /** The water thrown up where a card is fished: droplets, as the look has them (veiddu.css .veiddu-splash). */
  function splash() {
    if (calm()) return;
    const drops = el('div', 'veiddu-splash');
    drops.setAttribute('aria-hidden', 'true');
    for (let k = 0; k < 11; k++) {
      const side = k % 2 ? 1 : -1;
      const drop = el('i');
      drop.style.cssText = `--x:${side * (40 + ((k * 53) % 170))}px;--a:${(0.7 + ((k * 13) % 7) / 10).toFixed(1)};--t:${(1 + (k % 4) * 0.12).toFixed(2)}s`;
      drops.append(drop);
    }
    pondEl.append(drops);
    later(1700, () => drops.remove());
  }

  // ---- Uggeðla's view: loaded the first time the game opens; until then (and without WebGL) her picture stands in ------------

  let view = null;
  let viewLoading = null;
  function startView() {
    if (!uggedlaLive) return;
    if (view) return view.start();
    viewLoading ??= import('./uggedla-view.js')
      .then(module => module.createUggedlaView(windowEls[UGGEDLA], { win }))
      .then(made => {
        view = made;
        windowEls[UGGEDLA].querySelector('img')?.setAttribute('hidden', '');
        if (isOpen) view.start();
      })
      .catch(error => console.warn('[veiddu] Uggeðla stays a picture: her live view could not start.', error));
  }

  /** `seat`'s catch shows `laid` (the kinds in it) and `shownCount` pairs in its tag. Returns the new element, not yet in the page. */
  const makeCatch = (seat, laid, shownCount) => {
    const next = catchElement(doc, laid, NAMES[seat]);
    next.querySelector('.veiddu-catch-count').textContent = String(shownCount);
    return next;
  };

  // ---- Seats: whose turn, thinking, out -------------------------------------------------------------------------------------

  function markTurn(seat) {
    for (const s of [UGGEDLA, MOSI]) seatEls[s].classList.toggle('turn', s === seat);
    meEl.classList.toggle('turn', seat === CHILD);
  }
  function thinking(seat, on) {
    seatEls[seat]?.classList.toggle('thinking', on);
    if (seat === UGGEDLA) view?.think(on); // her head tilts (the picture's tilt is the class's, until her view is ready)
  }
  function markOut(seat) {
    (seat === CHILD ? meEl : seatEls[seat]).classList.add('out');
  }

  // ---- What may be tapped shows ---------------------------------------------------------------------------------------------

  function marks() {
    root.classList.toggle('teaching', Boolean(tutorial));
    teachEl.hidden = Boolean(tutorial) || !isOpen; // "Kennsla" and "Sleppa" share their corner
    skipEl.hidden = !tutorial;
    if (!game) return;
    const p = phase();
    const giving = waiting?.holds ? waiting.kind : null;
    // While Mosi teaches, the child chooses among dimmed things and only what the step means is .live (veiddu.css .teaching); between
    // its steps (a card flies, a mind moves) nothing is dimmed but the pond when it is not the pond's turn.
    const live = tutorial?.live ?? null;
    const choosing = ['child-pick', 'child-target', 'child-give', 'child-fish'].includes(p);
    meEl.classList.toggle('live', Boolean(tutorial) && [0, 2].includes(tutorial.step)); // steps 1 and 3 are about his catch
    for (const card of handEls.values()) {
      const kind = card.dataset.kind;
      card.classList.toggle('picked', picked === kind);
      card.classList.toggle('hint', ((p === 'child-pick' || p === 'child-target') && hintKind === kind) || (giving === kind && waiting.hinted));
      card.classList.toggle('live', Boolean(tutorial) && (!choosing || (live !== null && (live.kind === kind || live.give === kind))));
    }
    let lit = new Set();
    if (p === 'child-target') lit = new Set(legalTargets(game, CHILD).filter(seat => !tutorial || seat === live?.target));
    else if (p === 'child-pick' && hintTarget !== null) lit = new Set([hintTarget]);
    pondEl.classList.toggle('live', Boolean(tutorial) && (p === 'child-fish' || !['child-pick', 'child-target', 'child-give'].includes(p)));
    for (const seat of [UGGEDLA, MOSI]) {
      const on = lit.has(seat);
      const frame = windowEls[seat];
      frame.classList.toggle('live', Boolean(tutorial) && (on || !['child-pick', 'child-target'].includes(p)));
      frame.classList.toggle('veiddu-target', on);
      if (on) {
        frame.setAttribute('role', 'button');
        frame.setAttribute('tabindex', '0');
      } else {
        frame.removeAttribute('role');
        frame.removeAttribute('tabindex');
      }
    }
    if (p === 'child-fish' && !pondEl.classList.contains('calls')) sfx('pond-call'); // the pond begins to call the child
    pondEl.classList.toggle('calls', p === 'child-fish');
    if (p === 'child-no' && !fishButton) {
      fishButton = el('button', 'veiddu-fish-button', '<span>Farðu að veiða!</span>');
      pressable(fishButton, { win, onTap: () => tapFishButton() });
      table.append(fishButton);
    } else if (p !== 'child-no' && fishButton) {
      fishButton.remove();
      fishButton = null;
    }
  }

  /** A wiggle: no (a card wiggles as .nope does; with less motion everything just blinks). */
  function nope(box) {
    sfx('wiggle');
    if (calm()) {
      box.animate?.([{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }], { duration: 480 });
      return;
    }
    if (box.classList.contains('veiddu-card')) {
      box.classList.remove('nope');
      void box.offsetWidth;
      box.classList.add('nope');
      later(520, () => box.classList.remove('nope'));
      return;
    }
    box.animate?.([{ rotate: '0deg' }, { rotate: '-4deg' }, { rotate: '3deg' }, { rotate: '-2deg' }, { rotate: '0deg' }], { duration: 480, easing: 'ease-in-out' });
  }

  // ---- Words: bubbles and Mosi --------------------------------------------------------------------------------------------

  function clearBubble() {
    bubbleEl?.remove();
    bubbleEl = null;
    bubbleUntil = 0;
  }
  /** Waits until the line showing has had its time and its voice has ended (speech.js stops a voice whose end never comes). */
  async function lineDone() {
    for (let left = bubbleUntil - clock(); left > 0 || speech.talking; left = bubbleUntil - clock()) await wait(left > 0 ? left : 40);
  }
  /**
   * `from` says `text` to `to` (seats; to is null when nobody is asked), with the recorded line `id`: a bubble by the speaker with an
   * arrow at the one asked, and the voice. The bubble stays for lineMs(text), or while the line sounds if that is longer, and
   * lineDone() waits for that. With `still` and `within` (as speech.js has them) the line is dropped, bubble and all, when it has
   * waited too long for the voice or is no longer true. Resolves to whether it was said.
   */
  async function speak(from, to, text, id, { still = null, within = null } = {}) {
    const by = within === null ? Infinity : clock() + within;
    await lineDone();
    if (clock() > by || (still && !still())) return false;
    bubbleEl?.remove();
    bubbleEl = bubbleElement(doc, from, to, text, { long: [...text].length > 24 });
    table.append(bubbleEl);
    const seconds = say(id); // 0: not recorded yet, or muted: the bubble keeps its text time alone
    bubbleUntil = clock() + Math.max(lineMs(text), seconds > 0 ? seconds * 1000 + VOICE_TAIL_MS : 0);
    return true;
  }

  /**
   * Mosi's voice goes if it is still going, and his bubble with it: the advice has been taken (or is being replaced). While he teaches
   * his step stays in the bubble until the next (`force` takes it away: the next step, or the tutorial's end).
   */
  function hideAdvice(force = false) {
    cancel(adviceTimer);
    speech.cut(priorityOf(HINT_LINE));
    if (tutorial && force !== true) return;
    adviceEl?.remove();
    adviceEl = null;
  }
  /** Mosi pops up beside his button with `text` in his bubble, and says the line `id`; a tutorial step `stay`s. Returns say's seconds. */
  function showAdvice(id, text, { stay = false } = {}) {
    // A newer piece of advice takes the place of one sounding; while he teaches, a step waits for the one before it to finish (its
    // last word is not cut: the child's own tap is what cuts a step), and only its bubble is replaced.
    if (tutorial) {
      cancel(adviceTimer);
      adviceEl?.remove();
      adviceEl = null;
    } else hideAdvice(true);
    adviceEl = el('div', 'veiddu-advice');
    const picture = el('img');
    picture.src = asset('assets/book/images/mosi-render.webp');
    picture.alt = '';
    const words = el('p');
    words.textContent = text;
    words.classList.toggle('long', [...text].length > 34); // a longer sentence: a wider bubble in smaller letters (veiddu.css)
    adviceEl.append(picture, words);
    table.append(adviceEl);
    const said = say(id);
    if (!stay) adviceTimer = later(Math.max(ADVICE_MS, lineMs(text) + 2000, said * 1000 + 1500), () => hideAdvice());
    return said;
  }

  // ---- Motion -------------------------------------------------------------------------------------------------------------

  /**
   * A card in the air, made at `from` (placeOf's { x, y, w, r }); its move() carries it on, in an arc, turning over on the way with
   * `turn` (a card of `card` that began face down: `up`). `card` is the card or null for a back. Its width is `width`, the widest it
   * will be (a smaller place scales it). drop() takes it out of the air.
   */
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
    root.append(flier);
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

  /** Sparks burst from a spot in the middle of the table, where a pair snapped together. */
  function sparkleAt(spot, w) {
    const mark = el('div');
    mark.style.cssText = `position:absolute;pointer-events:none;left:${(spot.x - w / 2).toFixed(1)}px;top:${(spot.y - w * 0.7).toFixed(1)}px;width:${w.toFixed(1)}px;height:${(w * 1.4).toFixed(1)}px`;
    root.append(mark);
    sparkle(mark, 10, win);
    mark.remove();
  }

  /**
   * Two cards of a kind (their ids) snap together, sparkle and fly to `seat`'s catch, wherever the cards lie now (a hand, or a mind's
   * fan, where they turn over on the way). The hands close up as they leave, and the catch counts the pair as it lands.
   */
  async function pairUp(seat, kind, ids) {
    const found = ids.map(where);
    const laid = [...pairsShown[seat], kind];
    const old = catchEls[seat];
    if (found.some(card => !card)) { // the cards are not where the table has them: lay the pair down without a flight
      console.warn('[veiddu] A pair could not fly: its cards are not in a hand.', ids);
      ids.forEach((id, k) => found[k] && detach(found[k], id));
      settleHands([CHILD, UGGEDLA, MOSI]);
      const next = makeCatch(seat, laid, laid.length);
      old.replaceWith(next);
      catchEls[seat] = next;
    } else {
      const from = found.map(placeAt);
      const down = found.map(card => card.seat !== CHILD);
      ids.forEach((id, k) => detach(found[k], id));
      settleHands([...new Set(found.map(card => card.seat))]);
      // Where the pair will lie in the catch: measured on the new catch, put in the old one's place for a moment (no frame is drawn).
      const next = makeCatch(seat, laid, pairsShown[seat].length);
      next.querySelector('.veiddu-pair').style.visibility = 'hidden';
      old.replaceWith(next);
      const slots = [...next.querySelectorAll('.veiddu-pair .veiddu-card')].map((card, k) => placeOf(card, [-7, 5][k]));
      next.replaceWith(old);
      // Where they meet: above the child's hand, or halfway from a mind's fan to its catch.
      const wide = Math.max(slots[0].w * 1.7, 72);
      const base = root.getBoundingClientRect();
      const home = (seat === CHILD ? handEl : fanDoms[seat]).getBoundingClientRect();
      const meet = seat === CHILD
        ? { x: home.left + home.width / 2 - base.left, y: home.top - base.top - wide * 0.2 }
        : { x: (home.left + home.width / 2 - base.left + slots[0].x) / 2, y: (home.top + home.height / 2 - base.top + slots[0].y) / 2 + 10 };
      const width = Math.max(...from.map(place => place.w), wide);
      const fliers = ids.map((id, k) => flyer({ id, kind }, from[k], { width, up: down[k] }));
      await Promise.all(fliers.map((flier, k) => flier.move({ x: meet.x + (k ? 1 : -1) * wide * 0.3, y: meet.y, r: k ? 5 : -7, w: wide }, { turn: down[k], duration: GATHER_MS })));
      if (!calm()) for (const flier of fliers) flier.el.animate?.([{ scale: 1 }, { scale: 1.12 }, { scale: 1 }], { duration: 240, easing: 'ease-out' });
      sparkleAt(meet, wide);
      sfx('pair');
      await wait(SNAP_MS);
      await Promise.all(fliers.map((flier, k) => flier.move(slots[k], { duration: CATCH_MS })));
      sfx('flick', { soft: true }); // the pair lands in the catch
      old.replaceWith(next);
      next.querySelector('.veiddu-pair').style.visibility = '';
      next.querySelector('.veiddu-catch-count').textContent = String(laid.length);
      catchEls[seat] = next;
      fliers.forEach(flier => flier.drop());
      if (!calm()) next.querySelector('.veiddu-catch-count')?.animate?.([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 400, easing: 'cubic-bezier(.3, 1.6, .5, 1)' });
    }
    pairsShown[seat] = laid;
    if (seat === UGGEDLA) view?.happy(); // she is glad of her pair
  }

  /** The card drawn from the pond (a fish, or the draw of an empty hand) flies to `seat`'s hand: face up for the child. */
  async function drawCard(seat, cardId) {
    const card = cardOf(cardId);
    const from = pondTop();
    const mine = seat === CHILD;
    const hidden = addCard(seat, card, true);
    settleHands([seat]);
    const to = mine ? placeHand(hidden) : placeTheirs(hidden);
    setPond(--pondCount);
    splash();
    view?.splash(); // she dips toward the water with the droplets, whoever fishes
    sfx('draw');
    splashes.play(seat); // and the water sounds: Egill's fish with the full splash, the minds' with the soft one (with less motion too)
    const flight = flyer(mine ? card : null, from, { width: Math.max(to.w, from.w), up: mine });
    await flight.move(to, { turn: mine, duration: FLY_MS + 100 });
    hidden.style.visibility = '';
    flight.drop();
  }

  // ---- The round ------------------------------------------------------------------------------------------------------------

  /** Everything the minds, and Mosi, may know: every event, in order (a mind learns only what the rules made public). */
  function feed(events) {
    for (const mind of Object.values(minds)) for (const event of events) mind.observe(event, game);
  }

  /** Shows what the events of one act did, one after another: the answer, the cards flying, the pairs, the pond. */
  async function playEvents(events, asker = null) {
    for (const event of events) {
      switch (event.type) {
        case 'give':
          await speak(event.from, event.to, event.from === CHILD ? SAY.give : SAY.yes, answerLine(event.from, 'yes'));
          await wait(ANSWER_BEAT_MS);
          break;
        case 'no':
          picked = null;
          marks();
          await speak(event.seat, asker, event.seat === CHILD ? SAY.childNo : SAY.no, answerLine(event.seat, 'no'));
          break;
        case 'pair':
          picked = null;
          if (tutorial?.step === 1 && event.seat === CHILD) showStep(2); // the pair he was given is the third step: said as it flies
          await pairUp(event.seat, event.kind, event.cardIds);
          break;
        case 'fish':
          await drawCard(event.seat, event.cardId);
          if (event.lucky) {
            await speak(event.seat, null, SAY.lucky, answerLine(event.seat, 'lucky'));
            await wait(ANSWER_BEAT_MS);
          }
          break;
        case 'refill':
          await drawCard(event.seat, event.cardId);
          break;
        case 'pond-empty':
          await speak(UGGEDLA, null, SAY.empty, EMPTY_LINE);
          break;
        case 'turn':
          markTurn(event.seat);
          break;
        case 'out':
          if (!outSeen.has(event.seat)) {
            outSeen.add(event.seat);
            markOut(event.seat);
          }
          break;
        default:
          break; // ask is shown by doAsk, deal by the deal, over by proceed
      }
    }
  }

  /** The act has been shown: on to whoever's turn it is, or the end. */
  async function proceed() {
    await lineDone();
    if (game.phase === 'over') return run(endRound());
    if (game.turn === CHILD) return startChildTurn();
    return run(mindTurn(game.turn));
  }

  /** `seat` asks `target` for `kind`: the question, then (if the child is asked, when it has answered) the answer. */
  async function doAsk(seat, target, kind) {
    const result = ask(game, seat, target, kind);
    await speak(seat, target, asking(kind), askLine(seat, kind));
    await lineDone();
    if (target === CHILD) await awaitChild(kind);
    game = result.game;
    feed(result.events);
    await playEvents(result.events.slice(1), seat);
    return proceed();
  }

  /** `seat` draws from the pond. */
  async function doFish(seat) {
    const result = fish(game, seat);
    game = result.game;
    feed(result.events);
    await playEvents(result.events);
    return proceed();
  }

  async function mindTurn(seat) {
    busy = true;
    clearBubble();
    markTurn(seat);
    if (tutorial?.step === 3 && !tutorial.listened) { // Egill has fished: now they play, and he is to remember what they ask for
      tutorial.listened = true;
      tutor(LISTEN);
      marks();
    }
    thinking(seat, true);
    await wait(game.phase === 'fish' && game.asked ? FISH_BEAT_MS : THINK_MS);
    thinking(seat, false);
    if (game.phase === 'fish') return doFish(seat);
    const { target, kind } = (tutorial && scriptedAsk(seat)) || minds[seat].chooseAsk(game, { skill: skillNow() });
    return doAsk(seat, target, kind);
  }

  // ---- The child's turn -----------------------------------------------------------------------------------------------------

  function startChildTurn() {
    if (tutorial) return run(tutorialTurn());
    return openChild();
  }

  /** The child may act: his turn begins (or, in the tutorial, the step he is to do). */
  function openChild() {
    busy = false;
    picked = null;
    if (!tutorial) { // the tutorial's step has lit what it means already
      hintKind = null;
      hintTarget = null;
    }
    nudged = false;
    turns++;
    if (game.phase !== 'fish') clearBubble(); // after a no the bubble stays, so the child sees why the pond calls
    markTurn(CHILD);
    marks();
    armIdle();
    autoDrive();
  }

  /** The child's turn with nothing done: the best card lifts and its window glows, and Uggeðla may say it is the child's turn. */
  function armIdle() {
    cancel(idleTimer);
    cancel(nudgeTimer);
    if (tutorial || !childTurn()) return; // Mosi's step has lit what it means: no hints, no nudge
    idleTimer = later(IDLE_MS, () => {
      if (childTurn()) showHint();
    });
    nudgeTimer = later(NUDGE_MS, () => {
      if (!childTurn() || nudged || clock() - lastNudge < NUDGE_GAP_MS) return;
      nudged = true;
      lastNudge = clock();
      const turn = turns;
      run(speak(UGGEDLA, CHILD, SAY.nudge, NUDGE_LINE, { still: () => childTurn() && turns === turn, within: NUDGE_WITHIN_MS }));
    });
  }
  /** Something the child did: the hints wait again. */
  const poke = () => {
    if (childTurn()) armIdle();
  };
  /** The child is done with this turn's hints. */
  function settleChild() {
    cancel(idleTimer);
    cancel(nudgeTimer);
    hintKind = null;
    hintTarget = null;
    if (tutorial) tutorial.live = null; // what the step asked for is done: its words stay, but nothing is lit
    hideAdvice();
    cutChatter();
  }

  /** The best ask lifts its card and lights its window (nothing but the pond to light when the pond must be fished). */
  function showHint() {
    const best = bestAsk(game, CHILD);
    if (!best || best.kind === null) return best;
    hintKind = best.kind;
    hintTarget = best.target;
    marks();
    return best;
  }

  /** The child picks a kind: it lifts (another tap changes it), Egill reads its name and the windows that may be asked glow. */
  function pick(kind) {
    sfx('flick', { soft: true }); // the card is picked up
    picked = kind;
    hintKind = null;
    hintTarget = null;
    cutChatter();
    clearBubble();
    if (tutorial) speech.cut(priorityOf(HINT_LINE)); // he has done what Mosi said: his words give way to Egill reading the name
    say(nameLine(kind), { still: () => picked === kind && childTurn(), within: NAME_WITHIN_MS });
    marks();
    poke();
  }

  function tapCard(id) {
    const p = phase();
    const card = handEls.get(id);
    if (!card) return;
    if (p === 'child-pick' || p === 'child-target') {
      if (tutorial && card.dataset.kind !== tutorial.live?.kind) return; // only the card Mosi means
      return pick(card.dataset.kind);
    }
    if (p !== 'child-give') return;
    if (card.dataset.kind !== waiting.kind) return nope(card);
    answered();
  }

  function tapWindow(seat) {
    const p = phase();
    if (p === 'child-pick') {
      nope(windowEls[seat]); // a card first
      if (!tutorial) showHint();
      return poke();
    }
    if (p !== 'child-target') return;
    if (!legalTargets(game, CHILD).includes(seat)) return nope(windowEls[seat]);
    if (tutorial && seat !== tutorial.live?.target) return; // only the one Mosi means
    const kind = picked;
    busy = true;
    settleChild();
    marks();
    run(doAsk(CHILD, seat, kind));
  }

  function tapPond() {
    const p = phase();
    if (p === 'child-pick' || p === 'child-target') return nope(pondEl); // not yet: first ask
    if (p !== 'child-fish') return;
    busy = true;
    settleChild();
    clearBubble();
    marks();
    run(doFish(CHILD));
  }

  /** The child is asked for `kind`: it answers by giving the card (a tap) or, with none, by "Farðu að veiða!". */
  function awaitChild(kind) {
    return new Promise((resolve, reject) => {
      waiting = { kind, holds: holds(game, CHILD, kind), hinted: false, resolve, reject };
      busy = false;
      if (tutorial && waiting.holds && tutorial.step === 3) { // Mosi asks him, and Mosi's fifth step: the card he asks for waits, lit
        showStep(4);
        waiting.hinted = true;
      }
      marks();
      if (waiting.holds && !tutorial) {
        giveTimers = [
          later(GIVE_HINT_MS, () => {
            if (!waiting) return;
            waiting.hinted = true;
            marks();
          }),
          later(GIVE_ADVICE_MS, () => {
            if (waiting) showAdvice(HINT_LINE, SAY.giveHelp);
          }),
        ];
      }
      autoDrive();
    });
  }
  /** The child has answered: the answer is shown next. */
  function answered() {
    const answer = waiting;
    waiting = null;
    busy = true;
    giveTimers.forEach(cancel);
    giveTimers = [];
    if (tutorial) tutorial.live = null;
    hideAdvice();
    marks();
    answer.resolve();
  }
  function tapFishButton() {
    if (phase() === 'child-no') answered();
  }

  /** Mosi's button: his advice, with his reason; the card he means lifts and its window glows. While he teaches he says his step again. */
  function askMosi() {
    const p = phase();
    if (tutorial) {
      if (tutorial.said && !ended) showAdvice(tutorial.said.id, tutorial.said.text, { stay: true });
      return undefined;
    }
    if (p === 'child-give') {
      waiting.hinted = true;
      marks();
      return showAdvice(HINT_LINE, SAY.giveHelp);
    }
    if (!childTurn()) return nope(helpEl); // somebody else is moving (or the child is asked for an animal it has not got)
    const best = bestAsk(game, CHILD);
    if (!best) return nope(helpEl);
    cutChatter();
    showAdvice(whyLine(best.reason), WHY[best.reason]);
    if (best.kind !== null) {
      hintKind = best.kind;
      hintTarget = best.target;
    }
    marks();
    poke();
  }

  /** With &auto=1 the child's moves are made by bestAsk, after AUTO_MS, through the same handlers a finger reaches. */
  function autoDrive() {
    if (!auto) return;
    cancel(autoTimer);
    const p = phase();
    const idOfKind = kind => [...handEls.values()].find(card => card.dataset.kind === kind)?.dataset.id;
    // In the tutorial the child does what the step means, but only once Mosi has said it (a child listens first: a tap cuts his line)
    const after = tutorial ? Math.max(AUTO_MS, tutorial.until - clock() + 500) : AUTO_MS;
    const listening = act => {
      const go = () => (tutorial && speech.talking ? (autoTimer = later(250, go)) : act());
      return go;
    };
    if (p === 'child-pick') {
      autoTimer = later(after, listening(() => {
        const best = tutorial ? { ...tutorial.live } : bestAsk(game, CHILD);
        if (phase() !== 'child-pick' || !best || !best.kind) return;
        tapCard(idOfKind(best.kind));
        autoTimer = later(700, () => tapWindow(best.target));
      }));
    } else if (p === 'child-fish') autoTimer = later(after, listening(tapPond));
    else if (p === 'child-give') autoTimer = later(after, listening(() => tapCard(idOfKind(waiting?.kind))));
    else if (p === 'child-no') autoTimer = later(AUTO_MS, tapFishButton);
  }

  // ---- The tutorial ---------------------------------------------------------------------------------------------------------

  /** Mosi says `line` ({ id, text }) in his bubble, where it stays until the next. Returns the seconds until it will have been said. */
  function tutor(line) {
    tutorial.said = line;
    const said = showAdvice(line.id, line.text, { stay: true });
    tutorial.until = clock() + Math.max(MIN_STEP_MS, said > 0 ? said * 1000 + 900 : lineMs(line.text)); // its time, said or silent
    return said;
  }

  /** Step `index` of TUTORIAL: Mosi says it and what it means is lit (a card and the window to ask, or the card to give). */
  function showStep(index) {
    const step = TUTORIAL[index];
    tutorial.step = index;
    tutorial.live = step.live ? { ...step.live } : null;
    hintKind = step.live?.kind ?? null; // the card lifts and the window glows from the start
    hintTarget = step.live?.target ?? null;
    tutor(step);
    marks();
  }

  /** The next of the two minds' moves in the tutorial for `seat`, if the game is where the script has it. */
  function scriptedAsk(seat) {
    const move = tutorial.minds[seat]?.[0];
    if (!move || !holds(game, seat, move.kind) || !legalTargets(game, seat).includes(move.target)) return null;
    tutorial.minds[seat].shift();
    return move;
  }

  /**
   * It is Egill's turn in the tutorial: the step that comes now is said and lit. At the start the first step is only said (the pair he
   * was dealt lies in his catch) and the second follows it; after the pair of the third step the fourth follows; after a "no" the same
   * fourth step goes on at the pond; and when he has asked for the frog (the last step) the tutorial is over.
   */
  async function tutorialTurn() {
    busy = true;
    markTurn(CHILD);
    if (game.phase === 'fish') {
      tutorial.live = { pond: true }; // the "no" has been said: the pond calls
    } else {
      if (tutorial.step === TUTORIAL.length - 1) return endTutorial();
      if (tutorial.step === -1) showStep(0);
      if (tutorial.step === 0 || tutorial.step === 2) await wait(Math.max(0, tutorial.until - clock()));
      showStep(tutorial.step + 1);
    }
    return openChild();
  }

  /**
   * The tutorial is over (its last step done, or "Sleppa" tapped, `skipped`): the save remembers it, but it was no round, so there is no
   * sticker and nothing for the minds' skill. Mosi says the first real game comes now, and then that round is dealt. "Sleppa" clears the
   * table at once (a card may be in the air); the end of the last step leaves it as it stands, Egill's pairs in his catch.
   */
  async function endTutorial({ skipped = false } = {}) {
    if (!tutorial) return;
    const token = ++round; // whatever the tutorial had under way stops here
    save?.setVeiddu?.({ tutorialDone: true });
    tutorial = null;
    if (skipped) reset();
    else {
      speech.hush();
      cancel(autoTimer);
    }
    busy = true;
    marks();
    const said = showAdvice(REAL.id, REAL.text, { stay: true });
    await wait(Math.max(MIN_STEP_MS, said > 0 ? said * 1000 + 900 : lineMs(REAL.text)));
    if (token !== round || !isOpen) return;
    hideAdvice(true);
    run(deal());
  }

  /** The tutorial from the start: its stacked deck is dealt, and Mosi says the first step. */
  function startTutorial() {
    tutorial = { step: -1, live: null, said: null, until: 0, listened: false, minds: { [UGGEDLA]: [...TUTORIAL_MINDS[UGGEDLA]], [MOSI]: [...TUTORIAL_MINDS[MOSI]] } };
    taught++;
    run(deal(tutorialStack()));
  }

  // ---- Dealing and the end --------------------------------------------------------------------------------------------------

  /** Back to an empty table: the cards, the catches, the words, every timer. */
  function reset() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    waiting?.reject?.(STALE);
    waiting = null;
    for (const flight of root.querySelectorAll('.veiddu-flyer, .veiddu-splash')) flight.remove();
    flying = 0;
    busy = true;
    ended = false;
    picked = null;
    hintKind = null;
    hintTarget = null;
    nudged = false;
    giveTimers = [];
    clearBubble();
    hideAdvice(true);
    speech.stop(); // nothing more is said of the round that was, and the line sounding is cut
    fishButton?.remove();
    fishButton = null;
    handEls.clear();
    handEl.replaceChildren();
    for (const seat of [UGGEDLA, MOSI]) {
      fanEls[seat].clear();
      fanDoms[seat].replaceChildren();
      countEls[seat].hidden = true;
      seatEls[seat].classList.remove('turn', 'thinking', 'out');
    }
    meEl.classList.remove('turn', 'out', 'live');
    for (const seat of [CHILD, UGGEDLA, MOSI]) {
      const empty = makeCatch(seat, [], 0);
      catchEls[seat].replaceWith(empty);
      catchEls[seat] = empty;
    }
    pairsShown = [[], [], []];
    outSeen.clear();
    for (const card of pondShown) card.remove();
    pondShown = [];
    pondCount = 0;
    pondEl.classList.remove('calls');
    winEl.hidden = true;
    view?.rest();
    marks();
  }

  /**
   * A new round: the pond fills, five cards fly to each hand, and the pairs the hands hold go down. Then the child begins. With a `stack`
   * (the tutorial's) the deck is dealt in that order, not shuffled.
   */
  async function deal(stack = null) {
    round++;
    reset();
    const start = newGame(stack ? { stack } : { random }); // the tutorial's deck is stacked
    game = start.game;
    minds = { [UGGEDLA]: createMind(UGGEDLA, { random }), [MOSI]: createMind(MOSI, { random }) };
    feed(start.events);
    pondCount = game.pond.length;
    setPond(pondCount, { fill: true });
    // Every card's place is laid out first, empty, so each flies straight to where it stays.
    const dealtCards = start.events.filter(event => event.type === 'deal');
    const places = new Map();
    for (const { seat, cardId } of dealtCards) places.set(cardId, addCard(seat, cardOf(cardId), true));
    renderHand({ animate: false });
    for (const seat of [UGGEDLA, MOSI]) renderFan(seat, { animate: false });
    markTurn(null);
    await wait(700);
    const flights = [];
    const from = pondMiddle();
    for (const { seat, cardId } of dealtCards) {
      const place = places.get(cardId);
      const to = seat === CHILD ? placeHand(place) : placeTheirs(place);
      const flight = flyer(seat === CHILD ? cardOf(cardId) : null, from, { width: Math.max(to.w, from.w), up: seat === CHILD });
      flights.push(flight.move(to, { turn: seat === CHILD, duration: DEAL_MS }).then(() => {
        place.style.visibility = '';
        flight.drop();
        sfx('flick', { soft: true });
      }));
      await wait(DEAL_GAP);
    }
    await Promise.all(flights);
    await wait(250);
    for (const event of start.events) {
      if (event.type === 'pair') await pairUp(event.seat, event.kind, event.cardIds);
    }
    dealt++;
    return proceed();
  }

  /** The round is over: the skill, then the winner's words, the sticker and the confetti for a child who won (or tied). */
  async function endRound() {
    busy = true;
    settleChild();
    marks();
    const winners = game.winners;
    const childWon = childIn(winners); // a tie the child is in counts as a win
    if (!auto && save?.setVeiddu) save.setVeiddu(afterRoundSave({ ...save.getVeiddu?.(), skill: skillBase() }, winners));
    markTurn(null);
    for (const box of [meEl, seatEls[UGGEDLA], seatEls[MOSI]]) box.classList.remove('out', 'thinking'); // the winners are all in sight
    clearBubble();
    await wait(600);
    const words = winWords(winners);
    const title = winCard.querySelector('h2');
    title.textContent = words;
    title.style.fontSize = words.length > 14 ? 'clamp(36px, 5.4cqmin, 56px)' : '';
    winCard.querySelector('.veiddu-sticker').hidden = !childWon;
    winCard.querySelector('.veiddu-win-words').hidden = !childWon;
    winEl.querySelector('.veiddu-confetti').hidden = !childWon;
    winEl.hidden = false;
    ended = true;
    view?.cheer(); // she cheers for the winner
    if (childWon) sfx('fanfare'); // a round lost has no jingle: the winners cheer
    say(endLine(winners, dealt - taught)); // and one of them says it
  }

  // ---- Touch ----------------------------------------------------------------------------------------------------------------

  /** A tap on a card in the hand, counted as the book counts one (book/fx.js): a press let go within TAP_SLOP_PX of where it landed. */
  function tappable(card, onTap) {
    const presses = new Map();
    const end = (event, tapped) => {
      const press = presses.get(event.pointerId);
      if (!press) return;
      presses.delete(event.pointerId);
      if (!presses.size) card.classList.remove('pressed');
      if (tapped && Math.hypot(event.clientX - press.x, event.clientY - press.y) < TAP_SLOP_PX) onTap(event);
    };
    card.addEventListener('pointerdown', event => {
      if (event.button > 0) return;
      presses.set(event.pointerId, { x: event.clientX, y: event.clientY });
      card.classList.add('pressed');
      try {
        card.setPointerCapture(event.pointerId);
      } catch {
        // the pointer is already gone
      }
    });
    card.addEventListener('pointermove', event => {
      const press = presses.get(event.pointerId);
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) >= TAP_SLOP_PX) end(event, false);
    });
    card.addEventListener('pointerup', event => end(event, true));
    card.addEventListener('pointercancel', event => end(event, false));
  }

  // ---- Opening and shutting ---------------------------------------------------------------------------------------------------

  function pause(paused) {
    try {
      onPause?.(paused);
    } catch (error) {
      console.error('[veiddu]', error);
    }
  }

  function open({ tutorial: teachFirst = false } = {}) {
    if (isOpen) return;
    isOpen = true;
    root.hidden = false;
    if (!calm()) root.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    pause(true);
    music.start();
    splashes.load();
    speech.preload(); // the voices come from memory, so a line starts the moment it is asked for
    startView();
    // Mosi teaches first when asked to, and the first time: with a save that has not got tutorialDone (with no save there is nothing to remember it in)
    if (teachFirst || (save?.getVeiddu && !save.getVeiddu()?.tutorialDone)) startTutorial();
    else run(deal());
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    round++; // the round under way is dropped, with no penalty
    tutorial = null; // and a tutorial under way is not done: it comes again
    reset();
    music.stop();
    view?.stop();
    root.hidden = true;
    pause(false);
    try {
      onClose?.();
    } catch (error) {
      console.error('[veiddu]', error);
    }
  }

  pressable(pondEl, { win, sound: null, onTap: () => tapPond() });
  for (const seat of [UGGEDLA, MOSI]) pressable(windowEls[seat], { win, sound: null, onTap: () => tapWindow(seat) });
  pressable(helpEl, { win, sound: null, onTap: () => askMosi() });
  pressable(quitEl, { win, sound: null, onTap: () => close() });
  pressable(teachEl, { win, sound: null, onTap: () => { wake(); if (isOpen && !tutorial) startTutorial(); } }); // from any moment of a round: it is dropped, with no penalty
  pressable(skipEl, { win, sound: null, onTap: () => { wake(); if (isOpen && tutorial) run(endTutorial({ skipped: true })); } });
  pressable(winCard.querySelector('.veiddu-close'), { win, sound: null, onTap: () => close() });
  pressable(winCard.querySelector('.veiddu-again'), { win, sound: null, onTap: () => { if (phase() === 'over') run(deal()); } });
  root.addEventListener('pointerdown', () => wake(), true);
  root.addEventListener('contextmenu', event => event.preventDefault()); // a long press is a tap, never the browser's menu
  win?.addEventListener?.('resize', () => {
    if (!isOpen || !game || flying) return;
    renderHand({ animate: false });
    for (const seat of [UGGEDLA, MOSI]) renderFan(seat, { animate: false });
  });

  return {
    open,
    close,
    get isOpen() { return isOpen; },
    get game() { return game; },
    get phase() { return tutorial ? tutorialPhase() : phase(); },
    get teaching() { return tutorial ? (tutorial.step < 0 ? 'deal' : TUTORIAL[tutorial.step].id.slice('veiddu_tut_'.length)) : null; },
    get dealt() { return dealt; },
    get uggedla() { return view; },
    get viewReady() { return viewLoading ?? Promise.resolve(); },
    get auto() { return auto; },
    set auto(value) {
      auto = Boolean(value);
      if (auto) autoDrive();
    },
    get muted() { return muted; },
    set muted(value) { setMuted(value); },
    get speech() { return speech; },
    get said() { return spoken; },
  };
}
