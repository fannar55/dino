import * as THREE from 'three';
import { BOARD, SPECIAL_TILES, FOSSIL_KINDS, createGame, applyTurn, resolveTurn, validateGame } from './rules.js';
import { playTurn } from './turn.js';
import { createSparks } from './sparks.js';
import { halsSounds, HALS_GAPS } from './hals-sounds.js';
import { FOSSIL_ART, FOSSIL_HUES } from './fossil-art.js';
import { createEittMusic } from '../eitt/eitt-sounds.js';
import { pressable, sparkle, reducedMotion } from '../book/fx.js';
import { createSfx } from '../audio/sfx.js';
import { createVoice } from '../scene/voice.js';

// "Háls og hali", the game the child opens from the book's Leikir page (spec sections 3 to 6): Þórseðla's snakes and ladders on the
// board world of Task 2 (world.js, pieces.js, turn.js), with the look, sound and feel of "Eitt!" (hals.css, whose class list is at
// its top; engine/eitt/table.js is the model this follows).
//
//   - Setup: who plays ("Ég og Þórseðla", the child against the computer, or 2, 3 or 4 children on one tablet) and the mode
//     ("Ævintýraskógur", with fireflies, mud and fossils, or "Klassískt"). A game left under way is offered first: "Halda áfram" or
//     "Nýr leikur". The world loads behind the setup the first time the game opens and is kept for the next.
//   - The first game: Mosi's three intro lines, then play. Mosi's "?" says them again at any time.
//   - A turn: the players' portraits along the top, the active one raised and glowing with its square; the dock's big die and
//     "Kasta" (the die is tappable too). The die tumbles and lands, the piece hops (Mosi counts the child's hops, one line a hop,
//     the hops paced to his words), and where it lands plays out (turn.js) with an event card, a voice, a sound and an effect.
//     Input waits while a piece moves. The computer (a little Þórseðla) rolls by itself.
//   - The end: fireworks over square 80, every Þórseðla cheering, the words and "Spilum aftur?".
//   - "Rólegra": the world's calm (the whole board, gentle motion) and gentler motion here; "Allt borðið": the whole board between
//     turns instead of following the piece. The X goes back to the book; the game under way is kept in the save after every turn.
// Under prefers-reduced-motion every move of the page is a fade.
//
// Rendering: the chapter's own renderer draws the board while the game is open (main.js pauses the chapter and skips its draw):
// its canvas moves into the game's root, under the game's controls, and goes back when the game shuts. One WebGL context for both
// keeps the tablet's memory and the shaders the chapter compiled already; the chapter is still while the game is open, so nothing
// else draws.
//
// Sound: the game's own effects (hals-sounds.js) and the forest's wind and birds, its music (createEittMusic with
// assets/audio/hals/music.mp3, quiet until the owner's track is there), and the lines of the `hals` set (lines-source.json), played
// from lines.json, one at a time; Mosi's, Egill's and the Þórseðlas' mouths follow their lines on the board.

const REMAKE = new URL('../../', import.meta.url);
const asset = path => new URL(path, REMAKE).href;
const MUSIC = asset('assets/audio/hals/music.mp3');

const PICTURES = {
  egill: asset('assets/eitt/mosi.webp'),
  kambedla: asset('assets/book/images/kambedla-render.webp'),
  sloedla: asset('assets/eitt/parasaurolophus.webp'),
  gramedla: asset('assets/eitt/trex.webp'),
  thorsedla: asset('assets/eitt/brontosaurus.webp'),
};
const NAMES = { egill: 'Egill', kambedla: 'Kambeðla', sloedla: 'Slóeðla', gramedla: 'Grameðla', thorsedla: 'Þórseðla' };
const COLOURS = { egill: '#79c7a1', kambedla: '#ab85c1', sloedla: '#6793d0', gramedla: '#d69a6e', thorsedla: '#e9b14d' };
const ROSTERS = {
  1: ['egill', 'thorsedla'],
  2: ['egill', 'kambedla'],
  3: ['egill', 'kambedla', 'sloedla'],
  4: ['egill', 'kambedla', 'sloedla', 'gramedla'],
};
const MODES = { adventure: 'Ævintýraskógur', classic: 'Klassískt' };

/** Mosi's intro (the first game, and his "?"): each line with its words for his bubble. */
const INTRO = [
  { id: 'hals_mosi_intro', text: 'Þetta er Háls og hali! Sá sem kemst fyrstur upp á topp vinnur.' },
  { id: 'hals_mosi_intro_neck', text: 'Ef þú lendir hjá hálsi, lyftir þórseðlan þér upp!' },
  { id: 'hals_mosi_intro_tail', text: 'En ef þú lendir á hala, rennurðu niður. Vúúú!' },
];
const FOSSIL_NAME = Object.fromEntries(FOSSIL_KINDS.map(kind => [kind.id, kind.name]));

const ROLL_MS = 950; // the die tumbles this long
const THINK_MS = 1100; // the computer waits this long before it rolls
const IDLE_MS = 6000; // the child's turn with nothing done this long: the die calls
const NUDGE_MS = 8500; // and this long: Mosi says "Ýttu á teninginn!"
const NUDGE_GAP_MS = 25000; // but never sooner than this after he last said it
const CARD_MS = 2400; // an event card stays this long
const NEXT_MS = 450; // between one turn and the next
const NEAR = 64; // Mosi says "Við erum næstum komnir upp!" once Egill is this high
const FACES = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, -180] }; // the cube's turn that shows each face
const TILT = 'rotateX(-20deg) rotateY(-26deg)'; // the die seen from a little above and to the side, three faces showing
const PIPS = { 1: ['c'], 2: ['tl', 'br'], 3: ['tl', 'c', 'br'], 4: ['tl', 'tr', 'bl', 'br'], 5: ['tl', 'tr', 'c', 'bl', 'br'], 6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'] };

const CROSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" fill="none" stroke="#3b2f25" stroke-width="4" stroke-linecap="round"/></svg>';
const AGAIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.05-4.95M19 4.5v4.6h-4.6" fill="none" stroke="#3b2f25" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 12a7 7 0 1 1-2.05-4.95M19 4.5v4.6h-4.6" fill="none" stroke="#fffaf0" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5l12 7.5-12 7.5z" fill="#fffaf0" stroke="#3b2f25" stroke-width="2.6" stroke-linejoin="round"/></svg>';
const ARROW_UP = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 40V10M11 22l13-13 13 13" fill="none" stroke="#3b2f25" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 40V10M11 22l13-13 13 13" fill="none" stroke="#fffaf0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ARROW_DOWN = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 8v30M11 26l13 13 13-13" fill="none" stroke="#3b2f25" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 8v30M11 26l13 13 13-13" fill="none" stroke="#fffaf0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SNAIL = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 38h30c4 0 6-3 6-6v-6" fill="none" stroke="#3b2f25" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="25" r="11" fill="#f2b630" stroke="#3b2f25" stroke-width="3.4"/><path d="M24 25a4 4 0 1 1 4 4" fill="none" stroke="#3b2f25" stroke-width="3" stroke-linecap="round"/><path d="M40 26l-2-10M44 26l2-10" stroke="#3b2f25" stroke-width="3" stroke-linecap="round"/></svg>';
const BOARD_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="8" width="36" height="32" rx="6" fill="#fffaf0" stroke="#3b2f25" stroke-width="3.4"/><path d="M12 34h24M12 26h24M12 18h24" stroke="#6fae4f" stroke-width="4" stroke-linecap="round"/><path d="M30 33c0-8 4-12 6-15" fill="none" stroke="#e07a3f" stroke-width="3.4" stroke-linecap="round"/></svg>';

const priorityOf = id => (/^hals_mosi_(\d|count)$/.test(id) ? 3 : /^hals_(mosi_(roll|good|go|near)|thor_(my_turn|hello))$/.test(id) ? 1 : 2);

/** How long a line really speaks, without the quiet the recording ends with (its mouth track's last open frame). */
function spokenOf(line) {
  if (!line) return 0;
  const mouth = line.mouth;
  if (!mouth) return line.duration ?? 0;
  let last = mouth.length - 1;
  while (last > 0 && mouth[last] === '0') last--;
  return ((last + 1) / mouth.length) * (line.duration ?? 0);
}

/**
 * The game in `doc`'s #hals. `save` is engine/save.js's (getHals, addHalsFound, getHalsPlay, setHalsPlay); `audio` is { context,
 * output, theme, lines, muted } as "Eitt!" has it; `renderer` is the page's WebGLRenderer (its canvas moves into the game while it is
 * open), `q` the quality preset. `onPause(paused)` holds the chapter while the game is open; `onClose()` is told when it shuts.
 * Returns
 *   open()         opens it over the book: the setup (or "Halda áfram"), the world loading behind it the first time
 *   close()        shuts it; the game under way stays in the save
 *   isOpen         whether it is open
 *   phase          what it waits for, for a probe: 'shut', 'setup', 'loading', 'intro', 'child', 'busy' or 'over'
 *   game           the rules' state now; world, pieces: the board world and its pieces, for the lab
 *   start(setup)   a new game ({ players: 1 to 4, mode }), as "Byrjum!"; roll(value) the child's roll (value: for a probe)
 *   muted          silences its effects, music and voices
 */
export function createHalsGame(doc, {
  save = null, audio = {}, renderer = null, q = undefined, params = undefined, onPause = null, onClose = null,
  win = globalThis.window, random = Math.random,
} = {}) {
  const root = doc.getElementById('hals');
  if (!root) throw new Error('"Háls og hali" needs #hals on the page (see index.html)');
  const make = (tag, className, html = '') => {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (tag === 'button') el.type = 'button';
    if (html) el.innerHTML = html;
    return el;
  };
  let calmMode = false; // "Rólegra"
  const calm = () => calmMode || reducedMotion(win);
  const still = () => reducedMotion(win); // every move a fade

  // ---- The page -------------------------------------------------------------------------------------------------------------

  const veil = make('div', 'hals-veil'); // the clearing, soft, until the board is in
  veil.innerHTML = '<span class="hals-loading" aria-hidden="true"></span>';
  const hud = make('div', 'hals-hud');
  const playersEl = make('div', 'hals-players');
  playersEl.setAttribute('aria-label', 'Leikmenn');
  const toolsEl = make('div', 'hals-tools');
  const calmEl = make('button', 'hals-tool hals-calm', `${SNAIL}<span>Rólegra</span>`);
  calmEl.setAttribute('aria-pressed', 'false');
  const viewEl = make('button', 'hals-tool hals-view', `${BOARD_ICON}<span>Allt borðið</span>`);
  viewEl.setAttribute('aria-pressed', 'false');
  toolsEl.append(calmEl, viewEl);
  const closeEl = make('button', 'hals-close', CROSS);
  closeEl.setAttribute('aria-label', 'Aftur í bókina');
  const mosiEl = make('button', 'hals-mosi');
  mosiEl.setAttribute('aria-label', 'Spyrja Mosa');
  const adviceEl = make('div', 'hals-advice');
  const advicePicture = make('img');
  advicePicture.src = asset('assets/book/images/mosi-render.webp');
  advicePicture.alt = '';
  const adviceWords = make('p');
  adviceEl.append(advicePicture, adviceWords);
  const skipEl = make('button', 'hals-skip', '<span>Sleppa</span>');
  const dockEl = make('div', 'hals-dock');
  const dieEl = make('button', 'hals-die');
  dieEl.setAttribute('aria-label', 'Teningur');
  const cubeEl = make('span', 'hals-cube');
  for (let n = 1; n <= 6; n++) cubeEl.append(make('span', `hals-face f${n}`, PIPS[n].map(p => `<i class="${p}"></i>`).join('')));
  dieEl.append(cubeEl);
  const rollEl = make('button', 'hals-roll', '<img alt=""><span>Kasta</span>');
  const rollPicture = rollEl.querySelector?.('img') ?? null;
  dockEl.append(dieEl, rollEl);
  const cardEl = make('div', 'hals-card');
  cardEl.setAttribute('aria-live', 'polite');
  hud.append(playersEl, toolsEl, closeEl, mosiEl, adviceEl, skipEl, dockEl, cardEl);

  const setupEl = make('div', 'hals-setup');
  const setupCard = make('div', 'hals-setup-card');
  const setupClose = make('button', 'hals-close hals-card-close', CROSS);
  setupClose.setAttribute('aria-label', 'Aftur í bókina');
  const titleEl = make('h2', 'hals-title', `<img src="${PICTURES.thorsedla}" alt=""><span>Háls og hali</span>`);
  const resumeEl = make('div', 'hals-resume');
  const continueEl = make('button', 'hals-big hals-continue', `${PLAY}<span>Halda áfram</span>`);
  const freshEl = make('button', 'hals-plain hals-fresh', '<span>Nýr leikur</span>');
  resumeEl.append(continueEl, freshEl);
  const chooseEl = make('div', 'hals-choose');
  const whoEl = make('div', 'hals-who');
  const choiceEls = [1, 2, 3, 4].map(n => {
    const button = make('button', 'hals-choice');
    button.dataset.players = String(n);
    const pictures = ROSTERS[n].map(id => `<img src="${PICTURES[id]}" alt="" style="--c:${COLOURS[id]}">`).join('');
    button.innerHTML = `<span class="hals-choice-pics">${pictures}</span><span class="hals-choice-name">${n === 1 ? 'Ég og Þórseðla' : `${n} leikmenn`}</span>`;
    button.setAttribute('aria-label', n === 1 ? 'Ég og Þórseðla' : `${n} leikmenn`);
    whoEl.append(button);
    return button;
  });
  const modesEl = make('div', 'hals-modes');
  const modeEls = Object.entries(MODES).map(([mode, name]) => {
    const button = make('button', `hals-mode ${mode}`, `<span>${name}</span>`);
    button.dataset.mode = mode;
    modesEl.append(button);
    return button;
  });
  const startEl = make('button', 'hals-big hals-start', `${PLAY}<span>Byrjum!</span>`);
  chooseEl.append(whoEl, modesEl, startEl);
  setupCard.append(setupClose, titleEl, resumeEl, chooseEl);
  setupEl.append(setupCard);

  const winEl = make('div', 'hals-win');
  const winCard = make('div', 'hals-win-card');
  const winClose = make('button', 'hals-close hals-card-close', CROSS);
  winClose.setAttribute('aria-label', 'Aftur í bókina');
  const winPicture = make('img', 'hals-win-picture');
  winPicture.alt = '';
  const winWords = make('h2');
  const winFinds = make('div', 'hals-win-finds');
  const againEl = make('button', 'hals-big hals-again', `${AGAIN}<span>Spilum aftur?</span>`);
  winCard.append(winClose, winPicture, winWords, winFinds, againEl);
  const confettiEl = make('div', 'hals-confetti');
  confettiEl.setAttribute('aria-hidden', 'true');
  winEl.append(winCard, confettiEl);

  root.classList.add('hals');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Háls og hali, spil við Þórseðlu');
  root.replaceChildren(veil, hud, setupEl, winEl);
  root.hidden = true;
  adviceEl.hidden = true;
  skipEl.hidden = true;
  cardEl.hidden = true;
  setupEl.hidden = true;
  winEl.hidden = true;
  resumeEl.hidden = true;

  // ---- Sound --------------------------------------------------------------------------------------------------------------

  const context = audio.context ?? null;
  const effects = createSfx({ context, theme: audio.theme ?? null, output: audio.output ?? null, sounds: halsSounds, gaps: HALS_GAPS });
  const music = createEittMusic({ context, output: audio.output ?? null, url: MUSIC });
  // One voice at a time, as in "Eitt!": a line asked for while another speaks waits until it has ended, the waiting lines in order of
  // who matters most (Mosi's counting, then the events, then the chatter); a line that waits too long (`within`) or is no longer true
  // (`still`) is dropped. Mosi's counting cuts in at once (`cut`), so each number lands on its hop.
  let talking = false;
  let speakingUntil = 0;
  let voiceGuard = 0;
  const queue = [];
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
  setMuted(audio.muted);

  const lineOf = id => audio.lines?.[id] ?? null;

  /** Who says a line on the board, so the mouth follows it: Mosi (Egill's piece), Egill, or a Þórseðla. */
  function talkerFor(id) {
    const egill = pieces?.list.find(piece => piece.id === 'egill');
    if (id.startsWith('hals_mosi_')) return egill?.actor ?? null;
    if (id.startsWith('hals_egill_')) return egill?.rider ?? null;
    if (id.startsWith('hals_thor_')) return pieces?.list.find(piece => piece.id === 'thorsedla')?.actor ?? nearestThorsedla();
    return null;
  }
  /** The board's Þórseðla nearest the piece whose turn it is (or the first one), to say a line when no Þórseðla plays. */
  function nearestThorsedla() {
    const list = hw?.thorsedlas.list ?? [];
    if (!list.length) return null;
    const at = active?.position;
    if (!at) return list[0];
    let best = list[0];
    let distance = Infinity;
    for (const t of list) {
      const d = t.actor.root.position.distanceTo(at);
      if (d < distance) { best = t; distance = d; }
    }
    return best;
  }

  function startLine(item) {
    const seconds = item.line.duration ?? 1;
    speakingUntil = clock() + seconds * 1000;
    clearTimeout(voiceGuard);
    voiceGuard = setTimeout(() => { if (talking) voice.stop(); else nextLine(); }, seconds * 1000 + 1500);
    voice.play(new URL(item.line.src, REMAKE).href);
    try {
      (item.by ?? talkerFor(item.id))?.talk?.(item.line);
    } catch (error) {
      console.warn('[hals] a mouth could not follow its line', error);
    }
    item.onStart?.();
  }

  function nextLine() {
    clearTimeout(voiceGuard);
    speakingUntil = 0;
    while (queue.length && !talking) {
      const item = queue.shift();
      if ((item.until !== null && clock() > item.until) || (item.still && !item.still())) continue;
      startLine(item);
    }
  }

  /**
   * Says a line of the hals set, now or once the line sounding has ended; `by` is who says it on the board (the default: by its
   * speaker), `cut` starts it at once over whatever speaks. Returns the seconds until it will have been spoken (0: not recorded, or
   * muted).
   */
  function say(id, { by = null, still: stillTrue = null, within = null, cut = false, onStart = null } = {}) {
    const line = lineOf(id);
    if (!line?.src || muted) {
      onStart?.();
      return 0;
    }
    const item = { id, line, by, priority: priorityOf(id), still: stillTrue, until: within === null ? null : clock() + within, onStart };
    if (cut || (!talking && !queue.length)) {
      if (cut) for (let k = queue.length - 1; k >= 0; k--) if (queue[k].priority >= 3) queue.splice(k, 1);
      startLine(item);
      return spokenOf(line);
    }
    for (let k = queue.length - 1; k >= 0; k--) if (queue[k].id === id) queue.splice(k, 1);
    const at = queue.findIndex(waiting => waiting.priority < item.priority);
    queue.splice(at < 0 ? queue.length : at, 0, item);
    let ms = Math.max(0, speakingUntil - clock());
    for (const ahead of queue) {
      if (ahead === item) break;
      ms += (ahead.line.duration ?? 0) * 1000;
    }
    return ms / 1000 + spokenOf(line);
  }
  const hush = () => { queue.length = 0; };

  function wake() {
    if (!isOpen) return;
    if (context?.state === 'suspended') context.resume?.().catch?.(() => {});
    music.wake();
  }

  // ---- State --------------------------------------------------------------------------------------------------------------

  let isOpen = false;
  let hw = null; // the board world (world.js), once loaded
  let worldLoading = null;
  let sparks = null;
  let pieces = null; // the pieces of the game under way (pieces.js)
  let roster = null; // their ids
  let stale = false; // a turn was cut short by a close: the pieces are made anew for the next game
  let game = null; // the rules' state
  let setup = { players: 1, mode: 'adventure' };
  let active = null; // the piece whose turn it is
  let round = 0; // counts games and closes: a flow that finds it changed stops
  let busy = true; // a piece moves, the die tumbles, or the computer plays: the child's taps wait
  let turning = false; // a turn is being played out
  let phase = 'shut';
  let introDone = false;
  let countIntros = 0; // "Teldu með!" said this game (on the first roll or two)
  let quietTurns = 0; // the child's turns since Mosi last encouraged
  let saidNear = false;
  let saidMyTurn = false; // Þórseðla said "Nú er komið að mér." on her last turn
  let lastNudge = -Infinity;
  let turnNumber = 0;
  let whole = false; // "Allt borðið"
  let fxPhase = null; // what the effects follow now: 'lift', 'slide' or 'firefly'
  let fxPiece = null;
  let fxTimer = 0;
  let talkToken = 0; // Mosi's bubble lines (the intro): a newer run stops an older one
  let skipIntro = null;
  let raf = 0;
  let last = 0;
  let exposure = null; // the renderer's, while the game borrows it
  let home = null; // where the canvas lives while the game is shut
  const timers = new Set();
  let idleTimer = 0;
  let nudgeTimer = 0;
  let cardTimer = 0;
  let adviceTimer = 0;
  let forced = null; // a roll a probe asked for

  function later(ms, fn) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }
  const wait = ms => new Promise(resolve => later(ms, resolve));
  const cancelTimer = id => {
    clearTimeout(id);
    timers.delete(id);
  };
  const run = flow => flow?.catch?.(error => console.error('[hals] A move went wrong:', error));
  const humanTurn = () => Boolean(game && game.winner === null && !game.players[game.currentPlayer].isComputer);
  const childMoves = () => isOpen && Boolean(pieces) && humanTurn() && !busy && !turning;

  // ---- The world: loaded the first time the game opens, and kept ----------------------------------------------------------------

  function ensureWorld() {
    if (hw) return Promise.resolve(hw);
    if (!renderer) return Promise.reject(new Error('"Háls og hali" needs the page\'s renderer'));
    worldLoading ??= import('./world.js')
      .then(module => module.createHalsWorld(renderer, { ...(q && { q }), ...(params && { params }), win }))
      .then(made => {
        hw = made;
        hw.onBoom = () => sfx('boom');
        sparks = createSparks(hw);
        hw.sparks = sparks;
        hw.addUpdater(dt => {
          pieces?.update(dt);
          if (active && pieces) {
            hw.watch(active.position);
            pieces.watch(active);
          }
          followEffects(dt);
        });
        hw.board.decorate(SPECIAL_TILES);
        hw.view.overview().cut();
        resize();
        applyCalm();
        return hw;
      })
      .catch(error => {
        worldLoading = null;
        throw error;
      });
    return worldLoading;
  }

  /** The pieces for `ids`, made anew when the players change (or a turn was cut short), else the ones there are. */
  async function ensurePieces(ids) {
    if (pieces && !stale && roster?.join() === ids.join()) return pieces;
    const { createPieces } = await import('./pieces.js');
    const made = await createPieces(hw.world, hw.board, { roster: ids });
    pieces?.dispose();
    pieces = made;
    roster = ids;
    stale = false;
    pieces.calm = calmMode;
    return pieces;
  }

  // ---- Drawing: the board in the game's own frame loop, on the borrowed renderer -------------------------------------------------

  function resize() {
    if (!hw || !renderer) return;
    const canvas = renderer.domElement;
    hw.resize(canvas.clientWidth || win?.innerWidth || 1280, canvas.clientHeight || win?.innerHeight || 800);
  }

  function frame(now) {
    if (!isOpen) return;
    raf = win.requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    effects.update(dt);
    if (!hw) return;
    try {
      hw.update(dt);
      renderer.info.reset();
      hw.render();
    } catch (error) {
      console.error('[hals] a frame failed', error);
    }
  }

  function attachCanvas() {
    if (!renderer) return;
    const canvas = renderer.domElement;
    if (canvas.parentNode !== root) home = { parent: canvas.parentNode, next: canvas.nextSibling };
    root.prepend(canvas);
    canvas.classList.add('hals-view');
    exposure = renderer.toneMappingExposure;
    if (hw) renderer.toneMappingExposure = hw.world.look.exposure;
  }

  function detachCanvas() {
    if (!renderer) return;
    const canvas = renderer.domElement;
    canvas.classList.remove('hals-view');
    if (home?.parent) home.parent.insertBefore(canvas, home.next && home.next.parentNode === home.parent ? home.next : null);
    if (exposure !== null) renderer.toneMappingExposure = exposure;
    exposure = null;
  }

  // ---- The players along the top ----------------------------------------------------------------------------------------------

  const playerEls = [];
  let liveSquare = null; // { index, square }: where the piece moving is now, counted along as it hops
  function renderPlayers() {
    if (!game || !roster) {
      playersEl.replaceChildren();
      playerEls.length = 0;
      return;
    }
    if (playerEls.length !== roster.length || playerEls.some((el, i) => el.dataset.id !== roster[i])) {
      playerEls.length = 0;
      playersEl.replaceChildren(...roster.map((id, i) => {
        const el = make('div', 'hals-player');
        el.dataset.id = id;
        el.style.setProperty('--c', COLOURS[id]);
        el.innerHTML = `<span class="hals-portrait"><img src="${PICTURES[id]}" alt=""></span><span class="hals-square"></span><span class="hals-name">${game.players[i].isComputer ? 'Þórseðla' : NAMES[id]}</span>`;
        playerEls.push(el);
        return el;
      }));
    }
    const current = game.winner ?? game.currentPlayer;
    playerEls.forEach((el, i) => {
      const at = liveSquare?.index === i ? liveSquare.square : game.players[i].position;
      el.classList.toggle('active', i === current);
      const square = el.querySelector?.('.hals-square');
      if (square) square.textContent = String(at);
      el.setAttribute('aria-label', `${NAMES[roster[i]]}: reitur ${at}`);
    });
  }

  /** The dock: the die and "Kasta" live on a child's turn, dimmed otherwise; the die in the colour of whoever plays. */
  function renderDock() {
    const index = game ? game.winner ?? game.currentPlayer : 0;
    const id = roster?.[index] ?? 'egill';
    dockEl.style.setProperty('--c', COLOURS[id]);
    if (rollPicture) rollPicture.src = PICTURES[id];
    const live = childMoves();
    dockEl.classList.toggle('live', live);
    dockEl.classList.toggle('computer', Boolean(game && game.players[index]?.isComputer && game.winner === null));
    dockEl.hidden = !game || game.winner !== null || phase === 'setup';
    dieEl.classList.remove('call');
  }

  // ---- The die ----------------------------------------------------------------------------------------------------------------

  let shown = 1;
  const faceTurn = n => `${TILT} rotateX(${FACES[n][0]}deg) rotateY(${FACES[n][1]}deg)`;
  cubeEl.style.transform = faceTurn(1);

  /** The die tumbles and lands on `value` (a fade to it under reduced motion). Resolves as it lands. */
  function tumble(value) {
    sfx('roll');
    const end = faceTurn(value);
    const done = () => {
      cubeEl.style.transform = end;
      shown = value;
      sfx('land');
      sparkle(dieEl, 8, win);
    };
    if (typeof cubeEl.animate !== 'function') {
      done();
      return Promise.resolve();
    }
    if (still()) {
      const fade = cubeEl.animate([{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }], { duration: 420 });
      later(210, () => { cubeEl.style.transform = end; });
      return fade.finished.catch(() => {}).then(done);
    }
    const spinX = 360 * (2 + Math.floor(random() * 2));
    const spinY = 360 * (1 + Math.floor(random() * 2));
    const [x, y] = FACES[value];
    const [x0, y0] = FACES[shown];
    const duration = calmMode ? ROLL_MS * 0.8 : ROLL_MS;
    const spin = cubeEl.animate([
      { transform: `${TILT} rotateX(${x0}deg) rotateY(${y0}deg)` },
      { transform: `${TILT} rotateX(${x + spinX}deg) rotateY(${y + spinY}deg)` },
    ], { duration, easing: 'cubic-bezier(.2, .75, .3, 1)' });
    if (!calmMode) {
      dieEl.animate([
        { transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-46px) scale(1.08)', offset: 0.35 },
        { transform: 'translateY(0) scale(.94)', offset: 0.7 }, { transform: 'translateY(-8px) scale(1.02)', offset: 0.85 },
        { transform: 'translateY(0) scale(1)' },
      ], { duration, easing: 'ease-out' });
    }
    return spin.finished.catch(() => {}).then(done);
  }

  // ---- Mosi: his bubble, the intro, and the "?" ----------------------------------------------------------------------------------

  function showAdvice(text) {
    cancelTimer(adviceTimer);
    adviceWords.textContent = text;
    adviceWords.classList.toggle('long', text.length > 34);
    adviceEl.getAnimations?.().forEach(animation => animation.cancel());
    adviceEl.hidden = true;
    void adviceEl.offsetWidth;
    adviceEl.hidden = false;
  }
  function hideAdvice() {
    cancelTimer(adviceTimer);
    if (adviceEl.hidden) return;
    if (typeof adviceEl.animate !== 'function') {
      adviceEl.hidden = true;
      return;
    }
    adviceEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220 }).onfinish = () => { adviceEl.hidden = true; };
  }

  /** Mosi says `lines` one after another with his words in his bubble; resolves when he is done or is skipped. */
  async function mosiSays(lines, { skippable = false } = {}) {
    const mine = ++talkToken;
    let skipped = false;
    const skip = new Promise(resolve => { skipIntro = () => { skipped = true; resolve(); }; });
    skipEl.hidden = !skippable;
    for (const line of lines) {
      if (mine !== talkToken || skipped || !isOpen) break;
      showAdvice(line.text);
      const said = say(line.id, { cut: true });
      await Promise.race([wait(Math.max(2600, (lineOf(line.id)?.duration ?? said) * 1000 + 350)), skip]);
    }
    if (mine === talkToken) {
      skipEl.hidden = true;
      skipIntro = null;
      hideAdvice();
      if (skipped) voice.stop();
    }
    return !skipped;
  }

  function askMosi() {
    wake();
    if (!isOpen) return;
    if (skipIntro && !skipEl.hidden) return; // the intro is on: "Sleppa" ends it
    if (!adviceEl.hidden) { // he is talking: stop
      talkToken++;
      voice.stop();
      hideAdvice();
      return;
    }
    run(mosiSays(INTRO));
  }

  // ---- Event cards ------------------------------------------------------------------------------------------------------------

  /** A card for a landing, in the "Eitt!" card's look: its colour, a picture or a big mark, and its word. */
  function showCard({ kind, word, mark = '', art = '', picture = '', sub = '', confetti: withConfetti = false }) {
    cancelTimer(cardTimer);
    cardEl.className = `hals-card ${kind}`;
    const pic = art ? `<span class="hals-card-art">${art}</span>` : picture ? `<span class="hals-card-pic"><img src="${picture}" alt=""></span>` : '';
    cardEl.innerHTML = `<span class="hals-card-face">${pic}${mark ? `<span class="hals-card-mark">${mark}</span>` : ''}</span>` +
      `<strong class="hals-card-word">${word}</strong>${sub ? `<span class="hals-card-sub">${sub}</span>` : ''}` +
      (withConfetti ? `<span class="hals-card-confetti" aria-hidden="true">${confettiBits(18).join('')}</span>` : '');
    cardEl.getAnimations?.().forEach(animation => animation.cancel());
    cardEl.hidden = false;
    sfx('card');
    if (typeof cardEl.animate === 'function') {
      cardEl.animate(calm()
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ opacity: 0, transform: 'translateY(40px) scale(.6) rotate(-8deg)' }, { opacity: 1, transform: 'translateY(-6px) scale(1.04) rotate(2deg)', offset: 0.7 }, { opacity: 1, transform: 'none' }],
      { duration: calm() ? 220 : 520, easing: 'cubic-bezier(.3, 1.4, .5, 1)' });
    }
    later(calm() ? 120 : 380, () => sparkle(cardEl, 10, win));
    cardTimer = later(CARD_MS, hideCard);
  }
  function hideCard() {
    cancelTimer(cardTimer);
    if (cardEl.hidden) return;
    if (typeof cardEl.animate !== 'function') {
      cardEl.hidden = true;
      return;
    }
    cardEl.animate(calm() ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-30px) scale(.85)' }], { duration: 300, easing: 'ease-in' })
      .onfinish = () => { cardEl.hidden = true; };
  }

  /** Bits of confetti as markup (hals.css .hals-confetti i): each with its colour, place, turn, fall time and delay. */
  function confettiBits(count) {
    const colours = ['red', 'yellow', 'green', 'blue'];
    return Array.from({ length: count }, (_, k) => `<i class="${colours[k % 4]}" style="--x:${((k * 61.8) % 100).toFixed(1)}%;--a:${(k * 67) % 180}deg;--t:${(3.2 + (k % 5) * 0.45).toFixed(2)}s;--d:${-((k * 1.93) % 4.6).toFixed(2)}s"></i>`);
  }

  // ---- A turn -----------------------------------------------------------------------------------------------------------------

  /** The effects that follow a piece through a ride: glitter up a neck and down a tail, fireflies round a piece they carry. */
  function followEffects(dt) {
    if (!fxPhase || !fxPiece || !sparks) return;
    fxTimer -= dt;
    if (fxTimer > 0) return;
    fxTimer = fxPhase === 'firefly' ? 0.05 : 0.07;
    if (fxPhase === 'firefly') sparks.firefly(fxPiece.position, { count: calmMode ? 1 : 2 });
    else sparks.glitter(fxPiece.position, { count: calmMode ? 1 : 2 });
  }

  function beginTurn() {
    if (!isOpen || !game || game.winner !== null || !pieces) return;
    const token = round;
    const index = game.currentPlayer;
    active = pieces.list[index];
    turnNumber++;
    renderPlayers();
    sfx('turn');
    if (whole || calmMode) hw.view.overview();
    else hw.view.follow(() => active.position);
    if (game.players[index].isComputer) {
      busy = true;
      phase = 'busy';
      renderDock();
      run(computerTurn(token));
      return;
    }
    busy = false;
    phase = 'child';
    renderDock();
    armIdle();
    if (active.id === 'egill') {
      const player = game.players[index];
      if (player.position >= NEAR && !saidNear) {
        saidNear = true;
        say('hals_mosi_near', { within: 4000 });
      } else if (quietTurns >= 2 && random() < 0.35) {
        quietTurns = 0;
        say('hals_mosi_go', { within: 3000 });
      }
      if (turnNumber <= 2 || random() < 0.3) active.wave();
    }
  }

  async function computerTurn(token) {
    if (!saidMyTurn && turnNumber > 2 && random() < 0.45) {
      say('hals_thor_my_turn', { by: active.actor, within: 2500 });
      saidMyTurn = true;
    } else saidMyTurn = false;
    await wait(THINK_MS);
    if (token !== round || !isOpen) return;
    await roll();
  }

  /** The child's turn with nothing done: the die calls after a while, and Mosi says "Ýttu á teninginn!" now and then. */
  function armIdle() {
    cancelTimer(idleTimer);
    cancelTimer(nudgeTimer);
    const turn = turnNumber;
    idleTimer = later(IDLE_MS, () => {
      if (childMoves() && turn === turnNumber) dieEl.classList.add('call');
    });
    nudgeTimer = later(NUDGE_MS, () => {
      if (!childMoves() || turn !== turnNumber || clock() - lastNudge < NUDGE_GAP_MS || !adviceEl.hidden) return;
      lastNudge = clock();
      say('hals_mosi_roll', { still: () => childMoves() && turn === turnNumber, within: 2500 });
    });
  }

  /** A roll: the die tumbles, the piece moves (turn.js) with the voices, sounds, cards and effects, and the next turn comes. */
  async function roll() {
    if (!game || game.winner !== null || turning || !pieces) return;
    const token = round;
    turning = true;
    busy = true;
    phase = 'busy';
    cancelTimer(idleTimer);
    cancelTimer(nudgeTimer);
    renderDock();
    const index = game.currentPlayer;
    const piece = pieces.list[index];
    const human = !game.players[index].isComputer;
    const value = forced ?? 1 + Math.floor(random() * 6);
    forced = null;
    await tumble(value);
    if (token !== round) return;
    const result = resolveTurn(game.players[index].position, value, { mode: game.mode });
    const counting = human;
    if (human && countIntros < 2) {
      countIntros++;
      say('hals_mosi_count', { cut: true });
      await hw.wait(spokenOf(lineOf('hals_mosi_count')) + 0.15);
      if (token !== round) return;
    } else await hw.wait(0.25);
    if (token !== round) return;
    const egill = piece.id === 'egill';
    const fossilKind = result.event?.type === 'fossil' ? game.fossilKinds?.[result.landed] ?? null : null;
    await playTurn({ world: hw, pieces, thorsedlas: hw.thorsedlas }, piece, result, {
      onStep: async (square, count) => {
        if (token !== round) return;
        liveSquare = { index, square };
        renderPlayers();
        sfx(`step${Math.min(6, count)}`);
        sparks.dust(piece.position, { count: 5 });
        if (count === result.steps.length && !result.shortcut && !result.event) sparks.leaves(piece.position, { count: 3 });
        if (!counting || count > 6) return;
        const said = say(`hals_mosi_${count}`, { cut: true });
        const hop = calmMode ? 0.62 : 0.44;
        if (said && count < result.steps.length) await hw.wait(Math.max(0, said + 0.06 - hop));
      },
      onLand: (kind, data) => {
        if (token !== round) return;
        landed(kind, data, { piece, human, egill, fossilKind, result });
      },
      onPhase: (name, data) => {
        if (token !== round) return;
        if (name === 'off' || name === 'splash') {
          liveSquare = { index, square: result.destination };
          renderPlayers();
        }
        phaseEffect(name, data, { piece, egill });
      },
    });
    fxPhase = null;
    liveSquare = null;
    if (token !== round) return;
    const before = game;
    game = applyTurn(game, value);
    turning = false;
    keep();
    renderPlayers();
    if (result.shortcut?.type === 'tail' && egill) say('hals_mosi_after_tail', { within: 5000 });
    if (human) {
      quietTurns++;
      if (result.shortcut?.type === 'neck' && random() < 0.6) say('hals_mosi_good', { within: 5000 });
      else if (!result.shortcut && !result.event && value >= 5 && quietTurns >= 2 && random() < 0.4) {
        quietTurns = 0;
        say('hals_mosi_good', { within: 3000 });
      }
    }
    if (game.winner !== null) return endGame(token, before);
    await wait(NEXT_MS);
    if (token !== round) return;
    beginTurn();
  }

  /** Where a piece lands decides the card, the voice, the sound and the effect (turn.js's onLand). */
  function landed(kind, data, { piece, human, egill, fossilKind }) {
    if (kind === 'neck') {
      showCard({ kind, word: 'Upp hálsinn!', mark: ARROW_UP, picture: PICTURES.thorsedla });
      say('hals_thor_neck', { by: data.thorsedla });
      if (egill) say('hals_egill_yay', { within: 4500 });
      quietTurns = 0;
    } else if (kind === 'tail') {
      showCard({ kind, word: 'Niður halann!', mark: ARROW_DOWN, picture: PICTURES.thorsedla });
      say('hals_thor_tail', { by: data.thorsedla });
      quietTurns = 0;
    } else if (kind === 'firefly') {
      showCard({ kind, word: 'Ljósflugur!', mark: '+2' });
      sfx('twinkle');
      if (human) say('hals_mosi_fireflies');
      quietTurns = 0;
    } else if (kind === 'mud') {
      showCard({ kind, word: 'Leðja!', mark: '−2' });
      sfx('squelch');
      sparks.mud(piece.position);
      say(human ? 'hals_mosi_mud' : 'hals_thor_mud', human ? {} : { by: piece.actor });
      quietTurns = 0;
    } else if (kind === 'fossil') {
      const isNew = human && fossilKind ? save?.addHalsFound?.(fossilKind) === true : false;
      showCard({
        kind, word: fossilKind ? FOSSIL_NAME[fossilKind] : 'Steingervingur!', art: fossilKind ? FOSSIL_ART[fossilKind] : '',
        sub: isNew ? 'Nýtt í safnið!' : '', confetti: isNew,
      });
      if (fossilKind) cardEl.style.setProperty('--hue', FOSSIL_HUES[fossilKind]);
      sfx('chime');
      sparks.sparkle(hw.board.square(data.at).add(new THREE.Vector3(0.6, 0.35, -0.5)));
      say('hals_thor_fossil');
      if (isNew) say('hals_mosi_new_fossil', { within: 6000 });
      quietTurns = 0;
    } else if (kind === 'square') {
      sfx('land');
    } else if (kind === 'win') {
      sfx('fanfare');
      const top = hw.board.square(BOARD.count);
      hw.view.frame(hw.board.square(BOARD.count - 8), top.clone().add(new THREE.Vector3(0, 9, 0)), 5);
      sparks.fireworks(top.add(new THREE.Vector3(0, 1.5, -1)));
      sparks.sparkle(piece.position);
    }
  }

  /** The effects that come with where a turn is (turn.js's onPhase). */
  function phaseEffect(name, data, { piece, egill }) {
    if (name === 'lift') {
      fxPhase = 'lift';
      fxPiece = piece;
      sfx('neck');
    } else if (name === 'off') {
      fxPhase = null;
      sparks.dust(data.at, { count: 10 });
      sparks.leaves(data.at, { count: 4 });
      sfx('land');
      if (egill) piece.armsUp(1.6);
    } else if (name === 'slide') {
      fxPhase = 'slide';
      fxPiece = piece;
      sfx('whoosh');
      piece.armsUp(2.6);
    } else if (name === 'splash') {
      fxPhase = null;
      sparks.splash(data.at);
      sfx('splash');
    } else if (name === 'firefly') {
      fxPhase = 'firefly';
      fxPiece = piece;
    } else if (name === 'mud') {
      later(900, () => sparks?.mud(piece.position));
    }
  }

  /** The game under way goes into the save after every turn (and a game won is forgotten). */
  function keep() {
    if (!game) return;
    try {
      save?.setHalsPlay?.({ game: game.winner === null ? { state: game, setup } : null });
    } catch (error) {
      console.warn('[hals] the game could not be kept', error);
    }
  }

  async function endGame(token, before) {
    busy = true;
    phase = 'over';
    renderDock();
    const winner = pieces.list[game.winner];
    const computer = game.players[game.winner].isComputer;
    renderPlayers();
    let said = 0;
    if (winner.id === 'egill') {
      say('hals_mosi_won');
      said = say('hals_thor_you_won', { by: nearestThorsedla() });
    } else if (computer) {
      say('hals_mosi_lost');
      said = say('hals_thor_won', { by: winner.actor });
    } else said = say('hals_thor_you_won', { by: nearestThorsedla() });
    await wait(1200);
    if (token !== round) return;
    showWin(winner, computer);
    await wait(Math.max(2200, said * 1000 + 600));
    if (token !== round) return;
    say('hals_thor_again', { by: nearestThorsedla() });
    void before;
  }

  function showWin(winner, computer) {
    const solo = setup.players === 1;
    winWords.textContent = solo ? (computer ? 'Þórseðla vann!' : 'Þú vannst!') : `${computer ? 'Þórseðla' : NAMES[winner.id]} vann!`;
    winPicture.src = PICTURES[winner.id];
    const found = [];
    game.players.forEach(player => {
      if (player.isComputer) return;
      for (const square of player.fossils ?? []) {
        const kind = game.fossilKinds?.[square];
        if (kind && !found.includes(kind)) found.push(kind);
      }
    });
    winFinds.replaceChildren(...found.map(kind => {
      const el = make('span', 'hals-sticker', FOSSIL_ART[kind]);
      el.style.setProperty('--hue', FOSSIL_HUES[kind]);
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', FOSSIL_NAME[kind]);
      return el;
    }));
    winFinds.hidden = !found.length;
    confettiEl.innerHTML = computer && solo ? '' : confettiBits(48).join('');
    winEl.hidden = false;
    if (typeof winCard.animate === 'function') {
      winCard.animate(calm() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'scale(.7) rotate(-4deg)' }, { opacity: 1, transform: 'none' }],
        { duration: calm() ? 240 : 600, easing: 'cubic-bezier(.3, 1.5, .5, 1)' });
    }
  }

  // ---- Setting up and starting --------------------------------------------------------------------------------------------------

  function savedGame() {
    const kept = save?.getHalsPlay?.().game ?? null;
    if (!kept?.state || !kept.setup) return null;
    try {
      validateGame(kept.state);
      if (kept.state.winner !== null) return null;
      const ids = ROSTERS[kept.setup.players];
      if (!ids || ids.length !== kept.state.players.length) return null;
      return kept;
    } catch {
      return null;
    }
  }

  function showSetup() {
    phase = 'setup';
    const kept = savedGame();
    resumeEl.hidden = !kept;
    chooseEl.hidden = Boolean(kept);
    for (const button of choiceEls) button.setAttribute('aria-pressed', String(Number(button.dataset.players) === setup.players));
    for (const button of modeEls) button.setAttribute('aria-pressed', String(button.dataset.mode === setup.mode));
    winEl.hidden = true;
    setupEl.hidden = false;
    renderDock();
    if (typeof setupCard.animate === 'function') {
      setupCard.animate(calm() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(30px) scale(.92)' }, { opacity: 1, transform: 'none' }],
        { duration: calm() ? 220 : 480, easing: 'cubic-bezier(.3, 1.4, .5, 1)' });
    }
  }

  /** A new game for `choice` ({ players, mode }), or the kept one (`kept`: { state, setup }). */
  async function start(choice = setup, kept = null) {
    const token = ++round;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    hush();
    talkToken++;
    hideAdvice();
    hideCard();
    skipEl.hidden = true;
    setup = { players: kept?.setup.players ?? choice.players, mode: kept?.state.mode ?? choice.mode };
    setupEl.hidden = true;
    winEl.hidden = true;
    confettiEl.replaceChildren();
    busy = true;
    turning = false;
    fxPhase = null;
    phase = 'loading';
    veil.classList.toggle('waiting', !hw);
    await ensureWorld();
    if (token !== round) return;
    const ids = ROSTERS[setup.players];
    await ensurePieces(ids);
    if (token !== round) return;
    veil.classList.remove('waiting');
    game = kept?.state ?? createGame({ playerCount: ids.length, vsComputer: setup.players === 1, mode: setup.mode, random });
    hw.board.decorate(game.mode === 'adventure' ? SPECIAL_TILES : []);
    pieces.list.forEach((piece, i) => piece.place(game.players[i].position));
    active = pieces.list[game.currentPlayer];
    sparks.clear();
    countIntros = kept ? 2 : 0;
    quietTurns = 0;
    saidNear = false;
    saidMyTurn = false;
    turnNumber = kept ? 3 : 0;
    keep();
    renderPlayers();
    renderDock();
    hw.view.overview();
    if (!introDone && !(save?.getHalsPlay?.().intro)) {
      phase = 'intro';
      await wait(500);
      if (token !== round) return;
      await mosiSays(INTRO, { skippable: true });
      if (token !== round) return;
      introDone = true;
      save?.setHalsPlay?.({ intro: true });
    } else await wait(350);
    if (token !== round) return;
    beginTurn();
  }

  // ---- Opening and shutting -------------------------------------------------------------------------------------------------

  function pause(paused) {
    try {
      onPause?.(paused);
    } catch (error) {
      console.error('[hals]', error);
    }
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    root.hidden = false;
    if (!still() && typeof root.animate === 'function') root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    pause(true);
    attachCanvas();
    resize();
    music.start();
    effects.play('forest');
    veil.classList.toggle('ready', Boolean(hw));
    last = globalThis.performance?.now?.() ?? 0;
    raf = win.requestAnimationFrame(frame);
    const kept = save?.getHalsPlay?.() ?? { hello: true };
    introDone = introDone || kept.intro === true;
    showSetup();
    if (!kept.hello) {
      later(700, () => {
        say('hals_thor_hello', { by: nearestThorsedla() });
        save?.setHalsPlay?.({ hello: true });
      });
    }
    ensureWorld()
      .then(() => {
        if (!isOpen) return;
        renderer.toneMappingExposure = hw.world.look.exposure;
        veil.classList.add('ready');
      })
      .catch(error => {
        console.error('[hals] the board could not be built', error);
        veil.classList.add('failed');
      });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    round++;
    if (turning) stale = true; // its pieces are left mid-move: new ones next time
    turning = false;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    talkToken++;
    skipIntro = null;
    busy = true;
    phase = 'shut';
    fxPhase = null;
    hush();
    voice.stop();
    music.stop();
    effects.stop();
    win.cancelAnimationFrame?.(raf);
    hideCard();
    adviceEl.hidden = true;
    cardEl.hidden = true;
    detachCanvas();
    root.hidden = true;
    pause(false);
    try {
      onClose?.();
    } catch (error) {
      console.error('[hals]', error);
    }
  }

  // ---- Calm and the view ------------------------------------------------------------------------------------------------------

  function applyCalm() {
    root.classList.toggle('calm', calmMode);
    calmEl.setAttribute('aria-pressed', String(calmMode));
    if (hw) hw.calm = calmMode;
    if (pieces) pieces.calm = calmMode;
    if (sparks) sparks.calm = calmMode;
    viewEl.disabled = calmMode;
  }
  function applyView() {
    viewEl.setAttribute('aria-pressed', String(whole || calmMode));
    if (!hw || turning || !active) return;
    if (whole || calmMode) hw.view.overview();
    else hw.view.follow(() => active.position);
  }

  // ---- Touch ------------------------------------------------------------------------------------------------------------------

  function tapRoll() {
    wake();
    if (!childMoves()) {
      if (isOpen && game && game.winner === null && phase !== 'intro') {
        sfx('wiggle');
        if (typeof dieEl.animate === 'function') {
          dieEl.animate(still() ? [{ opacity: 1 }, { opacity: 0.6 }, { opacity: 1 }] : [{ rotate: '0deg' }, { rotate: '-8deg' }, { rotate: '6deg' }, { rotate: '0deg' }], { duration: 380 });
        }
      }
      return;
    }
    run(roll());
  }

  const tap = { sfx: name => effects.play(name) };
  pressable(dieEl, { audio: tap, sound: null, win, onTap: tapRoll });
  pressable(rollEl, { audio: tap, sound: null, win, onTap: tapRoll });
  pressable(mosiEl, { audio: tap, win, onTap: askMosi });
  pressable(skipEl, { audio: tap, win, onTap: () => { wake(); skipIntro?.(); } });
  pressable(closeEl, { audio: tap, win, onTap: () => close() });
  pressable(setupClose, { audio: tap, win, onTap: () => close() });
  pressable(winClose, { audio: tap, win, onTap: () => close() });
  pressable(calmEl, { audio: tap, win, onTap: () => { wake(); calmMode = !calmMode; applyCalm(); applyView(); } });
  pressable(viewEl, { audio: tap, win, onTap: () => { wake(); if (calmMode) return; whole = !whole; applyView(); } });
  for (const button of choiceEls) {
    pressable(button, {
      audio: tap, win, onTap: () => {
        wake();
        setup = { ...setup, players: Number(button.dataset.players) };
        for (const other of choiceEls) other.setAttribute('aria-pressed', String(other === button));
      },
    });
  }
  for (const button of modeEls) {
    pressable(button, {
      audio: tap, win, onTap: () => {
        wake();
        setup = { ...setup, mode: button.dataset.mode };
        for (const other of modeEls) other.setAttribute('aria-pressed', String(other === button));
      },
    });
  }
  pressable(startEl, { audio: tap, win, onTap: () => { wake(); if (isOpen) run(start(setup)); } });
  pressable(continueEl, { audio: tap, win, onTap: () => { wake(); const kept = savedGame(); if (isOpen) run(kept ? start(kept.setup, kept) : start(setup)); } });
  pressable(freshEl, { audio: tap, win, onTap: () => { wake(); save?.setHalsPlay?.({ game: null }); resumeEl.hidden = true; chooseEl.hidden = false; } });
  pressable(againEl, { audio: tap, win, onTap: () => { wake(); if (isOpen) run(start(setup)); } });
  root.addEventListener('pointerdown', event => {
    wake();
    if (renderer && event.target === renderer.domElement) event.stopPropagation(); // the chapter's own taps on its canvas wait
  }, true);
  for (const type of ['pointermove', 'pointerup', 'pointercancel']) {
    root.addEventListener(type, event => { if (renderer && event.target === renderer.domElement) event.stopPropagation(); }, true);
  }
  root.addEventListener('contextmenu', event => event.preventDefault());
  win?.addEventListener?.('resize', () => { if (isOpen) resize(); });
  win?.addEventListener?.('keydown', event => {
    if (!isOpen) return;
    if (event.key === ' ' || event.key === 'Enter') {
      if (childMoves()) {
        event.preventDefault();
        run(roll());
      }
    }
  });

  return {
    open,
    close,
    start: (choice = setup) => run(start(choice)),
    /** The child's roll, as a tap on the die (a probe may give the value). */
    roll(value = null) {
      if (!childMoves()) return false;
      forced = Number.isInteger(value) && value >= 1 && value <= 6 ? value : null;
      run(roll());
      return true;
    },
    get isOpen() { return isOpen; },
    get phase() { return phase; },
    get game() { return game; },
    get world() { return hw; },
    get pieces() { return pieces; },
    get calm() { return calmMode; },
    set calm(value) { calmMode = Boolean(value); applyCalm(); applyView(); },
    get muted() { return muted; },
    set muted(value) { setMuted(value); },
  };
}
