import {
  CATEGORIES,
  DICE_COUNT,
  DINOS,
  MAX_EGG_CHARGE,
  canUseEgg,
  chooseCategory,
  detectCombo,
  dinoByFace,
  newGame,
  openCategories,
  rollDice,
  scoreCategory,
  setHeld,
  toggleHold,
  totalScore,
  useEggPower,
} from './rules.js';
import { chooseSloedlaMove, sharpCategory } from './sloedla.js';
import { adviseYatzy } from './advice.js';
import { SKILL_START, afterRound } from '../eitt/skill.js';
import { pressable, sparkle, reducedMotion } from '../book/fx.js';
import { createSfx } from '../audio/sfx.js';
import { createEittMusic } from '../eitt/eitt-sounds.js';
import { yatzySounds, YATZY_GAPS } from './yatzy-sounds.js';

// The interactive table of "Risaeðlu-Yatzy!", rendered into `#yatzy` using `yatzy.css`.
// Can be opened from the Leikir page of Egill's journal (`main.js`) or run standalone in `yatzy-lab.html`.
//
// What a turn looks and sounds like (the sounds are yatzy-sounds.js's, Slóeðla's moves sloedla-view.js's):
//   - Kasta!: the cup rattles and pours, the dice tumble with their faces flicking past and land one after another, left to right,
//     each with a squash, a knock and a bell up the key, Slóeðla's eyes following them. Only then do the banner, the glow round a
//     pattern and the sheet show what was rolled: the rows that score now shimmer once, top to bottom, and she nods.
//   - A die held lifts into the moss nest with a ring of light and the next note of do-re-mi, and she leans in to look.
//   - A row chosen stamps with a squash and pop, its score flies to the total, which counts up in climbing ticks, and she rears up
//     for a good score, nods for a small one and slumps, cutely, for a zero. A spark earned flies into the Golden Egg, which fills
//     with gold; full, it shines and wobbles. Used, it shakes, cracks and bursts, she calls through her crest with it glowing and
//     notes floating out, and the magic flies to the die it turns.
//   - Her turn opens with a drum, she thinks with a tick-tock and a tilted head, and plays as the child does.
//   - At the end the card pops open over a burst of confetti, with a fanfare for the child's win (a warm chord when she wins), and
//     she celebrates. The music dips under the fanfares and her call.
// A tap on a die or a row while the dice are still in the air does nothing; the methods the lab and the tests call act at once.

const REMAKE = new URL('../../', import.meta.url);
const asset = path => new URL(path, REMAKE).href;
const MUSIC = asset('assets/audio/eitt/music.mp3');

// The table's motion (yatzy.css draws it, with transform and opacity only). The game's state changes at once; these only pace what
// the child sees, and with less motion (prefers-reduced-motion) every move is a fade.
const TUMBLE_MS = 380; // the first die tumbles this long before it lands
const STAGGER_MS = 55; // and each next one lands this much after the one before
const SQUASH_MS = 320; // a landed die's squash and pop
const POUR_MS = 110; // the dice pour out of the cup this long after its rattle
const FLY_MS = 560; // a spark's flight into the Golden Egg, the egg's magic to a die, or a score to its total
const CRACK_MS = 330; // the egg shakes and cracks this long before it bursts
const SHIMMER_MS = 1300; // rows lighting up, the last one's shimmer included
const STAMP_MS = 650; // a chosen row's stamp
const TALLY_STEP_MS = 55; // a total counts up one tick at a time
const SLOEDLA_STEP_MS = 950;
const ADVICE_MS = 5200;
const SPEECH_MS = 2600;
const NOTE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18.5a3.2 2.6 0 1 1-1.3-2.1V4.5l10-2.2v12.4a3.2 2.6 0 1 1-1.3-2.1V6.7L9 8.3z" fill="var(--note-c, #f7bd2b)" stroke="#3b2f25" stroke-width="1.6" stroke-linejoin="round"/></svg>';
const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5l2.6 7.9 7.9 2.6-7.9 2.6L12 22.5l-2.6-7.9L1.5 12l7.9-2.6z" fill="#ffe268" stroke="#c48a16" stroke-width="1.4" stroke-linejoin="round"/></svg>';
const CRACKS_SVG = '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M14 47l13 7 9-10 11 11 9-9 11 10 9-8 10 6" fill="none" stroke="#3b2f25" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M47 55l-4 13 6 9M67 54l5 12" fill="none" stroke="#3b2f25" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CONFETTI_COLOURS = ['#e8483b', '#f7bd2b', '#6fae4f', '#3a8de4', '#8f6aa3', '#dc8090', '#2f8f86'];

const CROSS_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" fill="none" stroke="#3b2f25" stroke-width="4" stroke-linecap="round"/></svg>';
const AGAIN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12a7 7 0 1 1-2.05-4.95M19 4.5v4.6h-4.6" fill="none" stroke="#3b2f25" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M19 12a7 7 0 1 1-2.05-4.95M19 4.5v4.6h-4.6" fill="none" stroke="#fffaf0" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const EGG_SVG = '<svg class="yatzy-egg-icon" viewBox="0 0 36 36" aria-hidden="true"><path d="M18 3C11 3 6 12.5 6 21c0 6.8 5.2 12 12 12s12-5.2 12-12C30 12.5 25 3 18 3z" fill="#ffe268" stroke="#3b2f25" stroke-width="2.6"/><path d="M10 19l4-3 4 4 4-4 4 3" fill="none" stroke="#c48a16" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="14" cy="11" r="2" fill="#fffaf0"/></svg>';
const CAP_SVG = '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M2 11L14 5l12 6-12 6-12-6z" fill="#f7bd2b" stroke="#3b2f25" stroke-width="2.3" stroke-linejoin="round"/><path d="M7 14v5c0 2.2 3.1 4 7 4s7-1.8 7-4v-5" fill="#fffaf0" stroke="#3b2f25" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 12v7" fill="none" stroke="#3b2f25" stroke-width="2.3" stroke-linecap="round"/></svg>';

/**
 * Interactive step-by-step tutorial led by Mosi on first play (or when tapping "Kennsla").
 * Walks the child through rolling, holding dice in the moss nest, re-rolling, reading both
 * scoreboards, scoring Fullt hreiður, watching Slóeðla's turn, using the Golden Egg's
 * Crest Horn power for Risaeðlu-Yatzy, and choosing a smart category independently.
 */
export const TUTORIAL_STEPS = Object.freeze([
  {
    id: 'intro',
    stepNum: 1,
    totalSteps: 11,
    title: 'Velkomin í Risaeðlu-Yatzy!',
    text: 'Hæ! Við skiptumst á við Slóeðlu að kasta 5 risaeðluteningum og safna stigum á spjöldin tvö. Pikkaðu á Áfram → eða Kasta! til að byrja!',
    live: ['next', 'roll'],
  },
  {
    id: 'roll-1',
    stepNum: 2,
    totalSteps: 11,
    title: 'Fyrsta kastið (allt að 3 köst)',
    text: 'Í hverri umferð áttu allt að 3 köst — sjáðu gulu punktana þrjá á takkanum! Pikkaðu á stóra appelsínugula Kasta! takkann.',
    live: ['roll'],
  },
  {
    id: 'hold-0',
    stepNum: 3,
    totalSteps: 11,
    title: 'Mosahreiðrið mjúka',
    text: 'Flott! Þú fékkst tvo Mosa (1)! Teningar sem við geymum í mosahreiðrinu eru kyrrir þegar við köstum hinum aftur. Pikkaðu á fyrsta Mosa-teninginn!',
    live: ['die:0'],
  },
  {
    id: 'hold-1',
    stepNum: 4,
    totalSteps: 11,
    title: 'Geymum báða Mosa!',
    text: 'Vel gert! Pikkaðu líka á hinn Mosa-teninginn svo báðir séu öruggir í mosahreiðrinu.',
    live: ['die:1'],
  },
  {
    id: 'roll-2',
    stepNum: 5,
    totalSteps: 11,
    title: 'Kasta aftur!',
    text: 'Nú eru báðir Mosarnir öruggir í hreiðrinu. Pikkaðu á Kasta aftur! til að rúlla hinum þremur teningunum!',
    live: ['roll'],
  },
  {
    id: 'explain-boards',
    stepNum: 6,
    totalSteps: 11,
    title: 'Stigaspjöldin tvö',
    text: 'Vá, þrír Mosar og tvær Kambeðlur! Vinstra spjaldið (Vinirnir sex 1–6) gefur 2 stig fyrir hvern sama vin. Hægra spjaldið (Samsetningar) gefur enn fleiri stig fyrir mynstur!',
    live: ['next', 'cat:full-nest'],
    focusBoards: true,
  },
  {
    id: 'score-full-nest',
    stepNum: 7,
    totalSteps: 11,
    title: 'Skráum Fullt hreiður (+10)!',
    text: 'Þrír eins + tveir eins heitir Fullt hreiður og gefur 10 stig! Hvern reit má bara nota einu sinni. Pikkaðu á Fullt hreiður (+10) hægra megin!',
    live: ['cat:full-nest'],
  },
  {
    id: 'sloedla-turn-1',
    stepNum: 7,
    totalSteps: 11,
    title: 'Umferð Slóeðlu',
    text: 'Flott! Nú á Slóeðla leik — við skiptumst alltaf á þar til allir 12 reitirnir eru fullir.',
    live: [],
  },
  {
    id: 'roll-round-2',
    stepNum: 8,
    totalSteps: 11,
    title: '2. umferð — Kastaðu aftur!',
    text: 'Slóeðla fékk 6 stig fyrir Þórseðlu. Nú er komið að þér aftur! Pikkaðu á Kasta! til að byrja nýja umferð.',
    live: ['roll'],
  },
  {
    id: 'use-egg',
    stepNum: 9,
    totalSteps: 11,
    title: 'Gullna töfraeggið (Lúðrakall!)',
    text: 'Sjáðu! Þú ert með fjórar Slóeðlur (5) og Gullna eggið glóir (3 neistar)! Pikkaðu á Lúðrakall! til að láta Slóeðlu blása í kambið og breyta fimmta teningnum!',
    live: ['egg'],
  },
  {
    id: 'score-yatzy',
    stepNum: 10,
    totalSteps: 11,
    title: 'Risaeðlu-Yatzy (+15)!',
    text: 'VÁÁ! Fimm eins er Risaeðlu-Yatzy — 15 stig og gullmerki efst á skjánum! Pikkaðu á stjörnureitinn Yatzy! (+15) neðst hægra megin!',
    live: ['cat:yatzy'],
  },
  {
    id: 'sloedla-turn-2',
    stepNum: 10,
    totalSteps: 11,
    title: 'Slóeðla kastar',
    text: 'Glæsilegt! Slóeðla tekur sína umferð og svo færð þú að prófa sjálf/ur!',
    live: [],
  },
  {
    id: 'round-3-roll',
    stepNum: 11,
    totalSteps: 11,
    title: 'Prófaðu sjálf/ur!',
    text: 'Nú kanntu öll brögðin! Mundu að þú getur alltaf pikkað á mig (Mosa) neðst til vinstri ef þú vilt ráð. Kastaðu nú teningunum!',
    live: ['roll'],
  },
  {
    id: 'round-3-pick',
    stepNum: 11,
    totalSteps: 11,
    title: 'Veldu góðan stigareit!',
    text: 'Þú fékkst þrjár Grameðlur (4)! Pikkaðu á Þrenna (+7) hægra megin eða Grameðla (+6) vinstra megin til að klára kennsluna!',
    live: ['cat:three', 'cat:gramedla'],
  },
  {
    id: 'done',
    stepNum: 11,
    totalSteps: 11,
    title: 'Kennslu lokið — Vel gert!',
    text: 'Frábært hjá þér! Nú kanntu Risaeðlu-Yatzy upp á tíu! Pikkaðu á Byrja leik! til að spila alvöru leik við Slóeðlu!',
    live: ['next'],
  },
]);

/** Custom icons for the 6 combination rows on the right side of the scorecard. */
const COMBO_ICONS = {
  pair: {
    colour: '#f7bd2b',
    svg: '<svg viewBox="0 0 36 36" aria-hidden="true"><ellipse cx="13" cy="19" rx="7" ry="9" fill="#fffaf0" stroke="#3b2f25" stroke-width="2.5"/><ellipse cx="23" cy="19" rx="7" ry="9" fill="#ffe066" stroke="#3b2f25" stroke-width="2.5"/></svg>',
  },
  three: {
    colour: '#e07a3f',
    svg: '<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="11" cy="22" r="6" fill="#fffaf0" stroke="#3b2f25" stroke-width="2.4"/><circle cx="25" cy="22" r="6" fill="#fffaf0" stroke="#3b2f25" stroke-width="2.4"/><circle cx="18" cy="12" r="6.5" fill="#ffe066" stroke="#3b2f25" stroke-width="2.4"/></svg>',
  },
  'full-nest': {
    colour: '#6fae4f',
    svg: '<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M4 22c2 7 9 10 14 10s12-3 14-10H4z" fill="#c99160" stroke="#3b2f25" stroke-width="2.4"/><ellipse cx="12" cy="18" rx="4.5" ry="6" fill="#fffaf0" stroke="#3b2f25" stroke-width="2.2"/><ellipse cx="18" cy="16" rx="5" ry="6.5" fill="#ffe066" stroke="#3b2f25" stroke-width="2.2"/><ellipse cx="24" cy="18" rx="4.5" ry="6" fill="#82c4ff" stroke="#3b2f25" stroke-width="2.2"/></svg>',
  },
  footprints: {
    colour: '#2f8f86',
    svg: '<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="8" cy="26" r="3.2" fill="#fffaf0" stroke="#3b2f25" stroke-width="2"/><circle cx="14" cy="20" r="3.4" fill="#ffe066" stroke="#3b2f25" stroke-width="2"/><circle cx="21" cy="15" r="3.6" fill="#fffaf0" stroke="#3b2f25" stroke-width="2"/><circle cx="28" cy="10" r="4" fill="#ffe066" stroke="#3b2f25" stroke-width="2"/></svg>',
  },
  treasure: {
    colour: '#8f6aa3',
    svg: '<svg viewBox="0 0 36 36" aria-hidden="true"><rect x="6" y="14" width="24" height="15" rx="4" fill="#e07a3f" stroke="#3b2f25" stroke-width="2.4"/><path d="M6 16c0-5 5-8 12-8s12 3 12 8H6z" fill="#f2b630" stroke="#3b2f25" stroke-width="2.4"/><circle cx="18" cy="18" r="3" fill="#fffaf0" stroke="#3b2f25" stroke-width="2"/></svg>',
  },
  yatzy: {
    colour: '#f2b630',
    svg: '<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M18 4l4 8.5 9.3 1.2-6.8 6.5 1.7 9.3L18 25l-8.2 4.5 1.7-9.3-6.8-6.5L14 12.5z" fill="#fff6b0" stroke="#3b2f25" stroke-width="2.4" stroke-linejoin="round"/></svg>',
  },
};

export function createYatzyGame(
  doc,
  {
    save = null,
    audio = null,
    onPause = null,
    onClose = null,
    win = globalThis.window,
    random = Math.random,
  } = {},
) {
  const root = doc.getElementById('yatzy');
  if (!root) throw new Error('Risaeðlu-Yatzy needs #yatzy on the page');

  const sfx = createSfx({
    context: audio?.context ?? null,
    theme: audio?.theme ?? null,
    output: audio?.output ?? null,
    sounds: yatzySounds,
    gaps: YATZY_GAPS,
  });
  const music = createEittMusic({
    context: audio?.context ?? null,
    output: audio?.output ?? null,
    url: MUSIC,
  });
  let muted = false;
  function setMuted(value) {
    muted = Boolean(value);
    sfx.muted = muted;
    music.muted = muted;
  }
  setMuted(audio?.muted); // wherever the game's sound is muted (captures), so is this

  let duckTimer = 0;
  /** The music dips under a big moment (a fanfare, her call) for `ms`, as it does under a line. */
  function duckFor(ms) {
    music.duck(true);
    clearTimeout(duckTimer);
    duckTimer = setTimeout(() => music.duck(false), ms);
    duckTimer?.unref?.();
  }
  const calm = () => reducedMotion(win);

  const make = (tag, cls) => {
    const el = doc.createElement(tag);
    if (cls) el.className = cls;
    return el;
  };

  let isOpen = false;
  let game = newGame();
  let busy = false;
  let view = null;
  let timers = [];
  let speechTimer = 0;
  let adviceTimer = 0;
  let tutIdx = -1; // -1 when not in tutorial mode, 0..TUTORIAL_STEPS.length-1 when teaching
  let tutOverrideText = '';
  const rolling = new Set(); // dice mid-tumble: the tumble shows their faces, not render()
  const pending = new Set(); // a die the egg's magic is on its way to: it keeps its old face until the magic lands
  let eggShown = game.eggCharge; // the sparks the egg shows, which catch up with game.eggCharge as each spark lands in it
  let eggFlying = 0; // sparks on their way to the egg
  let bannerText = '';
  const tallies = {}; // 'child' | 'sloedla' -> { el, pill, shown, target, count, timer }: the totals in the header, counting up

  const later = (ms, fn) => {
    const id = setTimeout(() => {
      timers = timers.filter(t => t !== id);
      if (isOpen) fn();
    }, ms);
    id?.unref?.();
    timers.push(id);
    return id;
  };

  const clearTimers = () => {
    for (const id of timers) clearTimeout(id);
    timers = [];
    clearTimeout(speechTimer);
    clearTimeout(adviceTimer);
  };

  // ---- Build DOM ------------------------------------------------------------------------------------------------------
  const tableEl = make('div', 'yatzy-table');

  // Header
  const headerEl = make('header', 'yatzy-header');
  const scoresBar = make('div', 'yatzy-scores-bar');

  const childPill = make('div', 'yatzy-score-pill child active');
  const childDot = make('span', 'who-dot');
  const childLabel = make('span', 'who-name');
  childLabel.textContent = 'Þú';
  const childPts = make('span', 'pts');
  childPts.textContent = '0';
  childPill.append(childDot, childLabel, childPts);

  const sloedlaPill = make('div', 'yatzy-score-pill sloedla');
  const sloedlaDot = make('span', 'who-dot');
  const sloedlaLabel = make('span', 'who-name');
  sloedlaLabel.textContent = 'Slóeðla';
  const sloedlaPts = make('span', 'pts');
  sloedlaPts.textContent = '0';
  sloedlaPill.append(sloedlaDot, sloedlaLabel, sloedlaPts);
  tallies.child = { el: childPts, pill: childPill, shown: 0, target: 0, count: false, timer: 0 };
  tallies.sloedla = { el: sloedlaPts, pill: sloedlaPill, shown: 0, target: 0, count: false, timer: 0 };

  // Badges bar (6 dinosaurs)
  const badgesBar = make('div', 'yatzy-badges-bar');
  badgesBar.setAttribute('aria-label', 'Yatzy-merki');
  const badgeSlots = new Map();
  for (const dino of DINOS) {
    const slot = make('span', 'yatzy-badge-slot');
    slot.setAttribute('data-dino', dino.key);
    slot.setAttribute('title', `Yatzy-merki: ${dino.name}`);
    const img = doc.createElement('img');
    img.src = asset(dino.img);
    img.alt = dino.name;
    slot.append(img);
    badgesBar.append(slot);
    badgeSlots.set(dino.key, slot);
  }
  scoresBar.append(childPill, sloedlaPill, badgesBar);

  // Slóeðla's 3D window
  const sloedlaWrap = make('div', 'yatzy-sloedla-wrap');
  const sloedlaWindow = make('section', 'yatzy-sloedla');
  sloedlaWindow.setAttribute('aria-label', 'Slóeðla');
  const sloedlaImg = doc.createElement('img');
  sloedlaImg.src = asset('assets/eitt/parasaurolophus.webp');
  sloedlaImg.alt = '';
  sloedlaWindow.append(sloedlaImg);
  const sloedlaFrame = make('div', 'yatzy-sloedla-frame');
  sloedlaFrame.setAttribute('aria-hidden', 'true');
  const speechEl = make('div', 'yatzy-speech');
  speechEl.hidden = true;
  sloedlaWrap.append(sloedlaWindow, sloedlaFrame, speechEl);

  // Top right controls: Kennsla (replay tutorial), Sleppa (skip tutorial), and Close (X)
  const topRight = make('div', 'yatzy-top-right');
  const teachBtn = make('button', 'yatzy-teach-btn');
  teachBtn.setAttribute('type', 'button');
  teachBtn.setAttribute('aria-label', 'Kennsla frá Mosa');
  teachBtn.innerHTML = `${CAP_SVG}<span>Kennsla</span>`;

  const skipBtn = make('button', 'yatzy-skip-btn');
  skipBtn.setAttribute('type', 'button');
  skipBtn.setAttribute('aria-label', 'Sleppa kennslu');
  skipBtn.innerHTML = '<span>Sleppa</span><span class="yatzy-long"> kennslu</span>'; // a narrow screen shows "Sleppa" alone
  skipBtn.hidden = true;

  const quitBtn = make('button', 'yatzy-quit');
  quitBtn.setAttribute('type', 'button');
  quitBtn.setAttribute('aria-label', 'Aftur í bókina');
  quitBtn.innerHTML = CROSS_SVG;
  topRight.append(teachBtn, skipBtn, quitBtn);

  headerEl.append(scoresBar, sloedlaWrap, topRight);

  // Left & Right Scorecard Columns
  const leftCol = make('section', 'yatzy-col left');
  const leftTitle = make('h3', 'yatzy-col-title');
  leftTitle.textContent = 'Vinirnir sex (1–6)';
  leftCol.append(leftTitle);

  const rightCol = make('section', 'yatzy-col right');
  const rightTitle = make('h3', 'yatzy-col-title');
  rightTitle.textContent = 'Samsetningar';
  rightCol.append(rightTitle);

  const rowButtons = new Map();
  for (const cat of CATEGORIES) {
    const btn = make('button', 'yatzy-row');
    btn.setAttribute('type', 'button');
    btn.setAttribute('data-cat', cat.id);

    const icon = make('span', 'yatzy-row-icon');
    if (cat.kind === 'friend') {
      const dino = dinoByFace(cat.face);
      icon.style.setProperty('--row-c', dino.colour);
      const img = doc.createElement('img');
      img.src = asset(dino.img);
      img.alt = '';
      const faceBadge = make('span', 'yatzy-row-face-badge');
      faceBadge.textContent = String(cat.face);
      icon.append(img, faceBadge);
    } else {
      const info = COMBO_ICONS[cat.id];
      icon.style.setProperty('--row-c', info.colour);
      icon.innerHTML = info.svg;
    }

    const infoBox = make('span', 'yatzy-row-info');
    const nameEl = make('span', 'yatzy-row-name');
    nameEl.textContent = cat.short;
    const subEl = make('span', 'yatzy-row-sub');
    subEl.textContent = cat.hint;
    infoBox.append(nameEl, subEl);

    const mineEl = make('span', 'yatzy-row-mine');
    mineEl.textContent = '–';
    const theirsEl = make('span', 'yatzy-row-theirs');
    theirsEl.textContent = '–';

    btn.append(icon, infoBox, mineEl, theirsEl);
    (cat.side === 'left' ? leftCol : rightCol).append(btn);
    rowButtons.set(cat.id, { btn, mineEl, theirsEl, cat });
  }

  // Center Stage
  const stageEl = make('section', 'yatzy-stage');
  const bannerEl = make('div', 'yatzy-banner');
  bannerEl.textContent = 'Kastaðu teningunum!';

  // Mosi's Interactive Tutorial Card (shown in stage during tutorial mode)
  const tutCard = make('div', 'yatzy-tut-card');
  tutCard.hidden = true;
  tutCard.setAttribute('role', 'region');
  tutCard.setAttribute('aria-label', 'Kennsla frá Mosa');
  const tutAvatar = doc.createElement('img');
  tutAvatar.className = 'yatzy-tut-avatar';
  tutAvatar.src = asset('assets/book/images/mosi-render-thumb.webp');
  tutAvatar.alt = 'Mosi';
  const tutBody = make('div', 'yatzy-tut-body');
  const tutTop = make('div', 'yatzy-tut-top');
  const tutStepBadge = make('span', 'yatzy-tut-step');
  const tutTitle = make('strong', 'yatzy-tut-title');
  tutTop.append(tutStepBadge, tutTitle);
  const tutText = make('p', 'yatzy-tut-text');
  tutBody.append(tutTop, tutText);
  const tutNextBtn = make('button', 'yatzy-tut-next');
  tutNextBtn.setAttribute('type', 'button');
  tutNextBtn.textContent = 'Áfram →';
  tutCard.append(tutAvatar, tutBody, tutNextBtn);

  const nestArea = make('div', 'yatzy-nest-area');
  const diceTray = make('div', 'yatzy-dice-tray');
  const nestHint = make('div', 'yatzy-nest-hint');
  nestHint.textContent = 'Pikkaðu á tening til að geyma hann í mosahreiðrinu';

  const dieEls = [];
  for (let i = 0; i < DICE_COUNT; i++) {
    const dieBtn = make('button', 'yatzy-die');
    dieBtn.setAttribute('type', 'button');
    dieBtn.setAttribute('data-die', String(i));

    const nestTag = make('span', 'yatzy-die-nest-tag');
    nestTag.textContent = 'Í hreiðri';
    nestTag.hidden = true;

    const topRow = make('span', 'yatzy-die-top');
    const numEl = make('span', 'yatzy-die-num');
    const pipsEl = make('span', 'yatzy-die-pips');
    topRow.append(numEl, pipsEl);

    const picEl = make('span', 'yatzy-die-pic');
    const imgEl = doc.createElement('img');
    imgEl.alt = '';
    picEl.append(imgEl);

    const nameEl = make('span', 'yatzy-die-name');

    dieBtn.append(nestTag, topRow, picEl, nameEl);
    diceTray.append(dieBtn);
    dieEls.push({ dieBtn, nestTag, numEl, pipsEl, imgEl, nameEl });
  }
  nestArea.append(diceTray, nestHint);

  // Controls Bar (Ask Mosi, Roll Button, Golden Egg)
  const controlsBar = make('div', 'yatzy-controls');

  const mosiWrap = make('div', 'yatzy-mosi-wrap');
  const mosiBtn = make('button', 'yatzy-mosi');
  mosiBtn.setAttribute('type', 'button');
  mosiBtn.setAttribute('aria-label', 'Spyrja Mosa');
  const mosiImg = doc.createElement('img');
  mosiImg.src = asset('assets/book/images/mosi-render-thumb.webp');
  mosiImg.alt = 'Mosi';
  mosiBtn.append(mosiImg);

  const adviceBubble = make('div', 'yatzy-advice');
  adviceBubble.hidden = true;
  const adviceImg = doc.createElement('img');
  adviceImg.src = asset('assets/book/images/mosi-render-thumb.webp');
  adviceImg.alt = '';
  const adviceWords = make('p', 'yatzy-advice-words');
  adviceBubble.append(adviceImg, adviceWords);
  mosiWrap.append(mosiBtn, adviceBubble);

  const rollBtn = make('button', 'yatzy-roll');
  rollBtn.setAttribute('type', 'button');
  rollBtn.setAttribute('aria-label', 'Kasta teningum');
  const rollLabel = make('span', 'yatzy-roll-label');
  rollLabel.textContent = 'Kasta!';
  const rollPips = make('span', 'yatzy-roll-pips');
  const pipSpans = [make('span', 'on'), make('span', 'on'), make('span', 'on')];
  rollPips.append(...pipSpans);
  rollBtn.append(rollLabel, rollPips);

  const eggBtn = make('button', 'yatzy-egg');
  eggBtn.setAttribute('type', 'button');
  eggBtn.setAttribute('aria-label', 'Gullna eggið — Töfralúður Slóeðlu');
  const eggSparks = make('span', 'yatzy-egg-sparks');
  const eggSparkDots = [make('i', 'lit'), make('i', 'lit'), make('i', '')];
  eggSparks.append(...eggSparkDots);
  const eggLabel = make('span', 'yatzy-egg-label');
  eggLabel.textContent = 'Töfraegg';
  eggBtn.innerHTML = EGG_SVG;
  // The charge fills the egg from the bottom (gold glass behind its picture), cracks show as it breaks, and a ring of light bursts.
  const eggGlass = make('span', 'yatzy-egg-glass');
  eggGlass.append(make('span', 'yatzy-egg-fill'), make('span', 'yatzy-egg-shine'));
  const eggCracks = make('span', 'yatzy-egg-cracks');
  eggCracks.innerHTML = CRACKS_SVG;
  const eggBurst = make('span', 'yatzy-egg-burst');
  eggBtn.append(eggGlass, eggSparks, eggLabel, eggCracks, eggBurst);

  controlsBar.append(mosiWrap, rollBtn, eggBtn);
  stageEl.append(bannerEl, tutCard, nestArea, controlsBar);

  tableEl.append(headerEl, leftCol, stageEl, rightCol);

  // Win Overlay
  const winOverlay = make('div', 'yatzy-win');
  winOverlay.hidden = true;
  const winCard = make('div', 'yatzy-win-card');
  const winCloseBtn = make('button', 'yatzy-win-close');
  winCloseBtn.setAttribute('type', 'button');
  winCloseBtn.setAttribute('aria-label', 'Aftur í bókina');
  winCloseBtn.innerHTML = CROSS_SVG;
  const winTitle = make('h2', 'yatzy-win-title');
  const winScores = make('p', 'yatzy-win-scores');
  const winBadges = make('div', 'yatzy-win-badges');
  const againBtn = make('button', 'yatzy-again');
  againBtn.setAttribute('type', 'button');
  againBtn.innerHTML = `${AGAIN_SVG}<span>Spilum aftur?</span>`;
  winCard.append(winCloseBtn, winTitle, winScores, winBadges, againBtn);
  const confettiEl = make('div', 'yatzy-confetti');
  confettiEl.setAttribute('aria-hidden', 'true');
  winOverlay.append(winCard, confettiEl);

  root.replaceChildren(tableEl, winOverlay);

  // ---- Helpers & Rendering --------------------------------------------------------------------------------------------

  function currentTutStep() {
    return tutIdx >= 0 && tutIdx < TUTORIAL_STEPS.length ? TUTORIAL_STEPS[tutIdx] : null;
  }

  function tutAllows(actionKey) {
    const step = currentTutStep();
    if (!step) return true;
    return step.live.includes(actionKey);
  }

  function nudgeWrongControl(el, customHint = '') {
    sfx.play('wiggle');
    if (el) {
      el.classList.remove('tut-nope');
      void el.offsetWidth;
      el.classList.add('tut-nope');
    }
    tutCard.classList.remove('tut-attention');
    void tutCard.offsetWidth;
    tutCard.classList.add('tut-attention');
    if (customHint) {
      tutOverrideText = customHint;
      render();
    }
  }

  /**
   * Her bubble goes beside her window where there is room for it: to the right, between the window's frame and the buttons, or else
   * to the left, between the frame and the scores, and never wider than that room, so it touches neither.
   */
  function placeSpeech() {
    const w = sloedlaWindow.getBoundingClientRect();
    if (!w.width) return;
    const FRAME = 9 + 10; // the window's painted frame, and a gap
    const buttons = topRight.getBoundingClientRect().left;
    const scores = Math.max(...[childPill, sloedlaPill, badgesBar].map(el => el.getBoundingClientRect().right));
    const right = buttons - (w.right + FRAME) - 8;
    const left = w.left - FRAME - scores - 8;
    const onLeft = right < 150 && left > right;
    speechEl.classList.toggle('on-left', onLeft);
    speechEl.style.setProperty('--speech-max', `${Math.round(Math.max(90, Math.min(220, onLeft ? left : right)))}px`);
  }

  function saySloedla(text, ms = SPEECH_MS) {
    speechEl.textContent = text;
    speechEl.hidden = false;
    placeSpeech();
    retrigger(speechEl, 'pop');
    clearTimeout(speechTimer);
    speechTimer = setTimeout(() => {
      speechEl.hidden = true;
    }, ms);
    speechTimer?.unref?.();
  }

  function clearHints() {
    adviceBubble.hidden = true;
    rollBtn.classList.remove('hint');
    eggBtn.classList.remove('hint');
    for (const { dieBtn } of dieEls) dieBtn.classList.remove('hint');
    for (const { btn } of rowButtons.values()) btn.classList.remove('hint');
  }

  function earnedBadgesSet() {
    const saved = save?.getYatzy?.().badges ?? [];
    return new Set([...saved, ...game.yatzyBadges]);
  }

  /** The face die `i` shows: its dinosaur, number, name and colours (the pips and the label are renderDie's). */
  function showFace(i, face) {
    const { dieBtn, numEl, imgEl, nameEl } = dieEls[i];
    const dino = dinoByFace(face);
    dieBtn.style.setProperty('--dino-c', dino.colour);
    dieBtn.style.setProperty('--dino-deep', dino.deep);
    dieBtn.style.setProperty('--dino-light', dino.light);
    numEl.textContent = String(face);
    imgEl.src = asset(dino.img);
    nameEl.textContent = dino.name;
  }

  function renderDie(i) {
    const entry = dieEls[i];
    const { dieBtn, nestTag, pipsEl } = entry;
    const isHeld = game.rolled && game.held[i];
    dieBtn.classList.toggle('held', isHeld);
    nestTag.hidden = !isHeld;
    if (rolling.has(i) || pending.has(i)) return; // the tumble, or the egg's magic, shows this die's face for now
    const face = game.dice[i];
    const dino = dinoByFace(face);
    dieBtn.setAttribute('aria-label', `${dino.name} (${face})${isHeld ? ', geymdur í hreiðri' : ''}`);
    if (entry.face === face) return;
    entry.face = face;
    showFace(i, face);
    pipsEl.replaceChildren(...Array.from({ length: face }, () => make('i')));
  }

  function renderTutorialState() {
    const step = currentTutStep();
    const teaching = Boolean(step);
    root.classList.toggle('teaching', teaching);
    teachBtn.hidden = teaching;
    skipBtn.hidden = !teaching;
    tutCard.hidden = !teaching;
    bannerEl.hidden = teaching;
    nestHint.hidden = teaching;

    rollBtn.classList.remove('tut-live');
    eggBtn.classList.remove('tut-live');
    mosiBtn.classList.remove('tut-live');
    tutNextBtn.classList.remove('tut-live');
    leftCol.classList.remove('tut-focus');
    rightCol.classList.remove('tut-focus');
    for (const { dieBtn } of dieEls) dieBtn.classList.remove('tut-live');
    for (const { btn } of rowButtons.values()) btn.classList.remove('tut-live');

    if (!step) return;

    tutStepBadge.textContent = `Kennsla ${step.stepNum}/${step.totalSteps}`;
    tutTitle.textContent = step.title;
    tutText.textContent = tutOverrideText || step.text;

    const showNext = step.live.includes('next');
    tutNextBtn.hidden = !showNext;
    tutNextBtn.textContent = step.id === 'done' ? 'Byrja leik!' : 'Áfram →';
    if (showNext) tutNextBtn.classList.add('tut-live');

    if (step.focusBoards) {
      leftCol.classList.add('tut-focus');
      rightCol.classList.add('tut-focus');
    }

    for (const key of step.live) {
      if (key === 'roll') rollBtn.classList.add('tut-live');
      else if (key === 'egg') eggBtn.classList.add('tut-live');
      else if (key.startsWith('die:')) {
        const idx = Number(key.slice(4));
        dieEls[idx]?.dieBtn.classList.add('tut-live');
      } else if (key.startsWith('cat:')) {
        const catId = key.slice(4);
        rowButtons.get(catId)?.btn.classList.add('tut-live');
      }
    }
  }

  function render() {
    // Scoreboard pills
    const childTotal = totalScore(game, 'child');
    const sloedlaTotal = totalScore(game, 'sloedla');
    showTotal('child', childTotal);
    showTotal('sloedla', sloedlaTotal);
    childPill.classList.toggle('active', !game.winner && game.turn === 'child');
    sloedlaPill.classList.toggle('active', !game.winner && game.turn === 'sloedla');

    // Badges bar
    const badges = earnedBadgesSet();
    for (const [key, slot] of badgeSlots) {
      slot.classList.toggle('earned', badges.has(key));
    }

    // Dice
    // While dice tumble the table keeps the roll to itself: the banner, the glow round a pattern and the sheet's previews wait
    // until the last die has landed.
    const landing = rolling.size > 0 || pending.size > 0;
    const shown = game.rolled && !landing;
    const combo = shown ? detectCombo(game.dice) : { kind: 'none', indices: [], label: '' };
    for (let i = 0; i < DICE_COUNT; i++) {
      renderDie(i);
      dieEls[i].dieBtn.classList.toggle('combo-match', shown && combo.indices.includes(i));
    }

    // Banner & Nest Hint
    bannerEl.classList.toggle('yatzy-mega', combo.kind === 'yatzy');
    if (landing && !game.winner) {
      bannerEl.textContent = pending.size ? 'Töfralúður Slóeðlu!' : game.turn === 'sloedla' ? 'Slóeðla kastar…' : 'Teningarnir rúlla…';
    } else if (game.winner) {
      bannerEl.textContent = game.winner === 'child' ? 'Þú vannst leikinn!' : game.winner === 'tie' ? 'Jafntefli!' : 'Slóeðla vann!';
    } else if (game.turn === 'sloedla') {
      bannerEl.textContent = game.rolled && combo.label ? `Slóeðla: ${combo.label}` : 'Slóeðla á leik…';
    } else if (!game.rolled) {
      bannerEl.textContent = `Umferð ${game.round} af ${CATEGORIES.length} — Kastaðu teningunum!`;
    } else if (combo.label) {
      bannerEl.textContent = combo.label;
    } else {
      bannerEl.textContent = game.rollsLeft > 0 ? 'Veldu teninga í hreiðrið eða kastaðu aftur!' : 'Veldu reit á spjaldinu!';
    }

    if (bannerEl.textContent !== bannerText) {
      bannerText = bannerEl.textContent;
      retrigger(bannerEl, 'pop');
    }

    nestHint.textContent =
      game.turn === 'child' && game.rolled && game.rollsLeft > 0
        ? 'Pikkaðu á teninga sem þú vilt geyma í mosahreiðrinu'
        : game.turn === 'child' && !game.rolled
          ? 'Pikkaðu á Kasta! til að byrja umferðina'
          : 'Pikkaðu á upplýstan reit á spjaldinu til að skrá stigin';

    // Roll button
    const allHeld = game.rolled && game.held.every(Boolean);
    const canRoll = !game.winner && game.turn === 'child' && game.rollsLeft > 0 && !allHeld;
    rollBtn.disabled = !canRoll;
    rollBtn.classList.toggle('inviting', canRoll && !game.rolled && !currentTutStep());
    rollLabel.textContent = !game.rolled ? 'Kasta!' : game.rollsLeft > 0 ? 'Kasta aftur!' : 'Veldu reit';
    pipSpans.forEach((pip, idx) => pip.classList.toggle('on', idx < game.rollsLeft));

    // Golden Egg button
    if (!eggFlying && !rolling.size && !pending.size) eggShown = game.eggCharge; // nothing on its way: the egg shows what it holds
    const eggFull = eggShown >= MAX_EGG_CHARGE;
    const eggReady = canUseEgg(game, 'child') && eggFull;
    eggBtn.classList.toggle('ready', eggReady);
    eggBtn.classList.toggle('full', eggFull);
    eggBtn.style.setProperty('--charge', String(Math.min(1, eggShown / MAX_EGG_CHARGE)));
    eggSparkDots.forEach((dot, idx) => dot.classList.toggle('lit', idx < eggShown));
    eggLabel.textContent = eggReady ? 'Lúðrakall!' : `Töfraegg ${eggShown}/${MAX_EGG_CHARGE}`;

    // Scorecard rows
    const childCanPick = !game.winner && game.turn === 'child' && shown;
    const bestCatId = childCanPick ? sharpCategory(game, 'child') : null;

    for (const [id, { btn, mineEl, theirsEl }] of rowButtons) {
      const childScore = game.scores.child[id];
      const sloedlaScore = game.scores.sloedla[id];
      const filled = childScore !== undefined;
      const preview = childCanPick && !filled ? scoreCategory(id, game.dice) : 0;

      btn.classList.toggle('filled', filled);
      btn.classList.toggle('zero', filled && childScore === 0);
      btn.classList.toggle('can-pick', childCanPick && !filled);
      btn.classList.toggle('positive', childCanPick && !filled && preview > 0);
      btn.classList.toggle('best', childCanPick && !filled && id === bestCatId && preview > 0);

      if (filled) {
        mineEl.textContent = `${childScore} ★`;
      } else if (childCanPick) {
        mineEl.textContent = preview > 0 ? `+${preview}` : '0';
      } else {
        mineEl.textContent = '–';
      }

      if (sloedlaScore !== undefined) {
        theirsEl.textContent = String(sloedlaScore);
        theirsEl.classList.add('done');
      } else {
        theirsEl.textContent = '–';
        theirsEl.classList.remove('done');
      }
    }

    renderTutorialState();
    if (!speechEl.hidden) placeSpeech(); // the buttons beside her window may have changed
  }

  // ---- Actions --------------------------------------------------------------------------------------------------------

  function setTutStepById(stepId) {
    const idx = TUTORIAL_STEPS.findIndex(s => s.id === stepId);
    tutIdx = idx;
    tutOverrideText = '';
    render();
  }

  function syncNewBadges() {
    for (const key of game.yatzyBadges) {
      const isNew = save?.addYatzyBadge?.(key);
      if (isNew) {
        const slot = badgeSlots.get(key);
        if (slot) {
          sparkle(slot, 14, win);
          bounce(slot, 'new', 900);
        }
        later(700, () => sfx.play('badge'));
      }
    }
  }

  // ---- Effects --------------------------------------------------------------------------------------------------------

  /** Takes `cls` off `el` and puts it back on, so its animation plays again from the start. */
  function retrigger(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /** `el` wears `cls` for `ms` (its animation plays once), then not. */
  function bounce(el, cls, ms) {
    retrigger(el, cls);
    later(ms, () => el.classList.remove(cls));
  }

  /**
   * Something flies from the middle of `fromEl` to the middle of `toEl` over FLY_MS (yatzy.css: .yatzy-flyer and its kind): a spark
   * into the egg, the egg's magic to a die, a score to its total. It is drawn over the table and takes itself away.
   */
  function flyer(fromEl, toEl, kind, html = STAR_SVG) {
    const a = fromEl?.getBoundingClientRect?.();
    const b = toEl?.getBoundingClientRect?.();
    if (!a || !b) return null;
    const el = make('span', `yatzy-flyer ${kind}`);
    el.innerHTML = html;
    const x = a.left + a.width / 2;
    const y = a.top + a.height / 2;
    el.style.setProperty('left', `${x.toFixed(1)}px`);
    el.style.setProperty('top', `${y.toFixed(1)}px`);
    el.style.setProperty('--dx', `${(b.left + b.width / 2 - x).toFixed(1)}px`);
    el.style.setProperty('--dy', `${(b.top + b.height / 2 - y).toFixed(1)}px`);
    el.style.setProperty('--fly-ms', `${FLY_MS}ms`);
    root.append(el);
    const timer = setTimeout(() => el.remove(), FLY_MS + 150);
    timer?.unref?.();
    return el;
  }

  /** A spark flies from `fromEl` into the Golden Egg; as it lands the egg gulps, a spark lights and the gold rises inside. */
  function chargeEgg(fromEl, delay = 0) {
    eggFlying++;
    later(delay, () => {
      flyer(fromEl, eggBtn, 'spark');
      sfx.play('eggSpark');
      later(FLY_MS, () => {
        eggFlying = Math.max(0, eggFlying - 1);
        eggShown = game.eggCharge;
        bounce(eggBtn, 'gulp', 560);
        const full = eggShown >= MAX_EGG_CHARGE;
        if (full) sfx.play('eggReady');
        sparkle(eggBtn, full ? 14 : 8, win);
        render();
      });
    });
  }

  /** Golden notes float up out of Slóeðla's crest while she calls. */
  function floatNotes(count = 4) {
    const point = view?.crestPoint?.() ?? { x: 0.32, y: 0.22 };
    const x = Math.min(0.95, Math.max(0.05, point.x));
    const y = Math.min(0.9, Math.max(0.08, point.y));
    for (let k = 0; k < count; k++) {
      const note = make('span', 'yatzy-note');
      note.innerHTML = NOTE_SVG;
      note.style.setProperty('left', `${(x * 100).toFixed(1)}%`);
      note.style.setProperty('top', `${(y * 100).toFixed(1)}%`);
      note.style.setProperty('--dx', `${(k % 2 ? 1 : -1) * (18 + k * 12)}px`);
      note.style.setProperty('--dy', `${-34 - k * 8}px`);
      note.style.setProperty('--note-c', ['#f7bd2b', '#e07a3f', '#2f8f86', '#8f6aa3'][k % 4]);
      note.style.setProperty('--delay', `${180 + k * 240}ms`);
      sloedlaWrap.append(note);
      const timer = setTimeout(() => note.remove(), 2600);
      timer?.unref?.();
    }
  }

  /** The rows the child's dice score on now (none on Slóeðla's turn or before a roll). */
  function scorableRows() {
    if (game.winner || game.turn !== 'child' || !game.rolled) return [];
    return CATEGORIES.filter(c => !(c.id in game.scores.child) && scoreCategory(c.id, game.dice) > 0).map(c => c.id);
  }

  /** Rows that score now and did not before (`before`) shimmer once, top to bottom down both columns, and Slóeðla nods. */
  function shimmerRows(before) {
    const fresh = scorableRows().filter(id => !before.includes(id));
    const place = { left: 0, right: 0 };
    for (const id of fresh) {
      const { btn, cat } = rowButtons.get(id);
      btn.style.setProperty('--shimmer-delay', `${place[cat.side]++ * 70}ms`);
      bounce(btn, 'shimmer', SHIMMER_MS);
    }
    if (fresh.length) {
      sfx.play('shimmer');
      view?.nod();
    }
  }

  /** The dice of a pattern hop together, one after another. */
  function cheerDice(indices) {
    indices.forEach((idx, k) => {
      const { dieBtn } = dieEls[idx];
      dieBtn.style.setProperty('--cheer-delay', `${k * 60}ms`);
      bounce(dieBtn, 'cheer', 520 + k * 60);
    });
  }

  /** The total on `who`'s pill: counts up tick by tick after a row is chosen (when `count` is set), else simply shows. */
  function showTotal(who, total) {
    const t = tallies[who];
    if (t.target === total) return;
    t.target = total;
    clearTimeout(t.timer);
    if (t.count && total > t.shown) {
      const from = t.shown;
      const steps = Math.min(total - from, 10);
      let k = 0;
      const step = () => {
        k++;
        t.shown = k >= steps ? total : from + Math.round(((total - from) * k) / steps);
        t.el.textContent = String(t.shown);
        sfx.play(`tick${Math.min(6, 1 + Math.floor(((k - 1) * 6) / steps))}`);
        if (k < steps) t.timer = later(TALLY_STEP_MS, step);
        else bounce(t.pill, 'bump', 450);
      };
      t.timer = later(FLY_MS - 40, step); // as the score lands on the pill
    } else {
      t.shown = total;
      t.el.textContent = String(total);
    }
    t.count = false;
  }

  /** A row is chosen: it stamps and sparkles, its score flies to the total, which counts up, and Slóeðla reacts. */
  function scoreFx(who, categoryId, pts) {
    const entry = rowButtons.get(categoryId);
    sfx.play('stamp');
    tallies[who].count = true;
    if (entry) {
      const pill = who === 'child' ? entry.mineEl : entry.theirsEl;
      bounce(entry.btn, who === 'child' ? 'stamped' : 'stamped-theirs', STAMP_MS);
      sparkle(pill, pts >= 8 ? 14 : 8, win);
      if (pts > 0) later(120, () => flyer(pill, tallies[who].pill, 'score', `+${pts}`));
    }
    if (pts === 0) {
      later(160, () => sfx.play('zero'));
      view?.slump();
    } else if (pts >= 8) {
      view?.hop();
    } else {
      view?.nod();
    }
  }

  /** The egg shakes and cracks, then bursts in a ring of light. */
  function crackEgg() {
    bounce(eggBtn, 'cracking', CRACK_MS + 60);
    later(CRACK_MS, () => {
      bounce(eggBtn, 'bursting', 950);
      sparkle(eggBtn, 18, win);
    });
  }

  /** Confetti bursts up from behind the end card and falls, and a gentle rain follows (with less motion: it only fades in place). */
  function launchConfetti(burst, rain) {
    const pieces = [];
    for (let k = 0; k < burst + rain; k++) {
      const shape = k % 5 === 0 ? ' round' : k % 7 === 3 ? ' star' : '';
      const piece = make('i', k < burst ? `burst${shape}` : `rain${shape}`);
      const angle = (((k * 137.5) % 180) + 180) * (Math.PI / 180); // the golden angle, over the upper half
      const power = 0.55 + ((k * 7919) % 100) / 220;
      const bx = Math.cos(angle) * power * 44;
      const by = Math.sin(angle) * power * 46 - 6;
      piece.style.setProperty('--c', CONFETTI_COLOURS[k % CONFETTI_COLOURS.length]);
      piece.style.setProperty('--bx', `${bx.toFixed(1)}cqw`);
      piece.style.setProperty('--by', `${by.toFixed(1)}cqh`);
      piece.style.setProperty('--fx', `${(bx * 1.3).toFixed(1)}cqw`);
      piece.style.setProperty('--r', `${(k % 2 ? 1 : -1) * (360 + ((k * 53) % 540))}deg`);
      piece.style.setProperty('--t', `${(k < burst ? 2.4 + (k % 6) * 0.22 : 3.4 + (k % 5) * 0.4).toFixed(2)}s`);
      piece.style.setProperty('--d', `${(k < burst ? (k % 8) * 0.025 : 1.2 + (k % 9) * 0.45).toFixed(2)}s`);
      piece.style.setProperty('--x', `${((k * 61.8) % 100).toFixed(1)}%`);
      piece.style.setProperty('--y', `${(6 + ((k * 37.3) % 84)).toFixed(1)}%`);
      pieces.push(piece);
    }
    confettiEl.replaceChildren(...pieces);
  }

  /** Everything in flight stops and the table shows the game as it is (a new game, the tutorial, the game shut). */
  function resetFx() {
    rolling.clear();
    pending.clear();
    eggFlying = 0;
    eggShown = game.eggCharge;
    for (const t of Object.values(tallies)) {
      t.count = false;
      t.target = -1;
    }
    for (const { dieBtn } of dieEls) dieBtn.classList.remove('tumbling', 'landing', 'magic', 'just-held', 'cheer');
    for (const { btn } of rowButtons.values()) btn.classList.remove('shimmer', 'stamped', 'stamped-theirs');
    eggBtn.classList.remove('cracking', 'bursting', 'gulp');
    for (const el of [...root.querySelectorAll('.yatzy-flyer'), ...sloedlaWrap.querySelectorAll('.yatzy-note')]) el.remove();
    confettiEl.replaceChildren();
    winOverlay.classList.remove('show');
  }

  /**
   * The dice in `rolledIndices` tumble out of the cup (it rattles, they pour) and land one after another, left to right, each with
   * a squash, a knock and a bell up the key, Slóeðla's eyes following them; `onDone` once the last has landed.
   */
  function animateRoll(rolledIndices, onDone) {
    sfx.play('shake');
    later(POUR_MS, () => sfx.play('roll'));
    view?.sweep();
    rolledIndices.forEach(idx => rolling.add(idx));
    rolledIndices.forEach((idx, k) => {
      const { dieBtn } = dieEls[idx];
      const landAt = TUMBLE_MS + k * STAGGER_MS;
      dieBtn.classList.remove('landing', 'cheer');
      dieBtn.style.setProperty('--tumble-ms', `${landAt}ms`);
      dieBtn.style.setProperty('--tilt', `${k % 2 ? 7 : -7}deg`);
      retrigger(dieBtn, 'tumbling');
      later(landAt, () => {
        rolling.delete(idx);
        dieBtn.classList.remove('tumbling');
        renderDie(idx);
        bounce(dieBtn, 'landing', SQUASH_MS);
        sfx.play(`settle${Math.min(5, k + 1)}`);
        view?.watch(idx / (DICE_COUNT - 1));
      });
    });
    if (!calm()) {
      // Faces flick past as the dice turn over (with less motion they fade out and come back with the new face).
      const spin = () => {
        for (const idx of rolling) {
          dieEls[idx].face = 0;
          showFace(idx, 1 + Math.floor(Math.random() * 6));
        }
        if (rolling.size) later(120, spin);
      };
      spin();
    }
    later(TUMBLE_MS + (rolledIndices.length - 1) * STAGGER_MS + 30, () => onDone?.());
  }

  function celebrateCombo(combo, who) {
    if (combo.kind === 'yatzy') {
      sfx.play('yatzy');
      duckFor(1600);
      view?.call();
      floatNotes();
      saySloedla(who === 'child' ? 'Váá! Risaeðlu-Yatzy!!' : 'Jibbí! Ég fékk Yatzy!');
      cheerDice([0, 1, 2, 3, 4]);
      for (const { dieBtn } of dieEls) sparkle(dieBtn, 12, win);
      sparkle(bannerEl, 16, win);
    } else if (['footprints-5', 'full-nest', 'four', 'footprints-4', 'three'].includes(combo.kind)) {
      sfx.play('combo');
      view?.hop();
      cheerDice(combo.indices);
      for (const idx of combo.indices) sparkle(dieEls[idx].dieBtn, 8, win);
    } else if (combo.kind === 'two-pairs' || combo.kind === 'pair') {
      sfx.play('pair');
      cheerDice(combo.indices);
      view?.nod();
    }
  }

  function runTutorialSloedlaTurn({ dice, categoryId, nextStepId }) {
    busy = true;
    view?.think(true);
    sfx.play('drum');
    saySloedla('Mín umferð!');

    later(400, () => {
      if (!isOpen || tutIdx < 0) return;
      game = {
        ...game,
        dice: [...dice],
        held: [false, false, false, false, false],
        rollsLeft: 2,
        rolled: true,
      };
      animateRoll([0, 1, 2, 3, 4], () => {
        const combo = detectCombo(game.dice);
        celebrateCombo(combo, 'sloedla');
        render();
        sfx.play('think');
        later(550, () => {
          if (!isOpen || tutIdx < 0) return;
          view?.think(false);
          const cat = CATEGORIES.find(c => c.id === categoryId);
          const pts = scoreCategory(categoryId, game.dice);
          game = chooseCategory(game, 'sloedla', categoryId);
          scoreFx('sloedla', categoryId, pts);
          view?.watch(null);
          saySloedla(`Ég vel ${cat.short} (${pts} stig)! Þín umferð!`);
          busy = false;
          setTutStepById(nextStepId);
        });
      });
      render();
    });
  }

  function onTapTutNext() {
    const step = currentTutStep();
    if (!step || !tutAllows('next')) {
      nudgeWrongControl(tutNextBtn);
      return;
    }
    sfx.play('tap');
    if (step.id === 'intro') {
      setTutStepById('roll-1');
    } else if (step.id === 'explain-boards') {
      setTutStepById('score-full-nest');
    } else if (step.id === 'done') {
      completeTutorialAndPlay();
    }
  }

  function onTapRoll() {
    if (busy || game.winner || game.turn !== 'child') return;
    const step = currentTutStep();
    if (step && !tutAllows('roll')) {
      nudgeWrongControl(rollBtn);
      return;
    }
    if (game.rollsLeft <= 0 || (game.rolled && game.held.every(Boolean))) {
      sfx.play('wiggle');
      return;
    }
    clearHints();
    music.wake();
    const beforeCharge = game.eggCharge;
    const before = scorableRows();
    const rolledIndices = !game.rolled
      ? [0, 1, 2, 3, 4]
      : game.held.map((h, i) => (!h ? i : -1)).filter(i => i >= 0);
    rolledIndices.forEach(idx => rolling.add(idx)); // they tumble from the tap: no render below shows their new faces before they land

    if (step) {
      if (step.id === 'intro' || step.id === 'roll-1') {
        game = {
          ...game,
          dice: [1, 1, 3, 4, 6],
          held: [false, false, false, false, false],
          rollsLeft: 2,
          rolled: true,
          eggCharge: MAX_EGG_CHARGE,
        };
        setTutStepById('hold-0');
      } else if (step.id === 'roll-2') {
        game = {
          ...game,
          dice: [1, 1, 1, 2, 2],
          rollsLeft: 1,
          rolled: true,
        };
        setTutStepById('explain-boards');
      } else if (step.id === 'roll-round-2') {
        game = {
          ...game,
          dice: [5, 5, 5, 5, 2],
          held: [false, false, false, false, false],
          rollsLeft: 2,
          rolled: true,
          eggCharge: MAX_EGG_CHARGE,
        };
        setTutStepById('use-egg');
      } else if (step.id === 'round-3-roll') {
        game = {
          ...game,
          dice: [4, 4, 4, 1, 6],
          held: [false, false, false, false, false],
          rollsLeft: 2,
          rolled: true,
        };
        setTutStepById('round-3-pick');
      }
    } else {
      game = rollDice(game, 'child', random);
    }

    syncNewBadges();

    const combo = detectCombo(game.dice);
    animateRoll(rolledIndices, () => {
      celebrateCombo(combo, 'child');
      if (game.eggCharge > beforeCharge) {
        const middle = combo.indices[Math.floor(combo.indices.length / 2)];
        chargeEgg(middle === undefined ? diceTray : dieEls[middle].dieBtn, 120);
      }
      render();
      shimmerRows(before);
    });
    render();
  }

  function onTapDie(index) {
    if (busy || game.winner || game.turn !== 'child') return;
    const step = currentTutStep();
    if (step && !tutAllows(`die:${index}`)) {
      nudgeWrongControl(
        dieEls[index]?.dieBtn,
        step.id === 'hold-0' || step.id === 'hold-1'
          ? 'Pikkaðu á græna Mosa-teninginn (1) sem glóir til að geyma hann í mosahreiðrinu!'
          : '',
      );
      return;
    }
    if (!game.rolled || game.rollsLeft <= 0) {
      sfx.play('wiggle');
      return;
    }
    clearHints();
    game = toggleHold(game, 'child', index);
    const { dieBtn } = dieEls[index];
    if (game.held[index]) {
      const heldCount = game.held.filter(Boolean).length;
      sfx.play(`hold${Math.min(5, Math.max(1, heldCount))}`);
      sparkle(dieBtn, 8, win);
      bounce(dieBtn, 'just-held', 650);
      view?.lean(index / (DICE_COUNT - 1));
    } else {
      sfx.play('unhold');
      dieBtn.classList.remove('just-held');
      view?.watch(index / (DICE_COUNT - 1));
    }
    if (step?.id === 'hold-0' && game.held[0]) {
      setTutStepById('hold-1');
    } else if (step?.id === 'hold-1' && game.held[1]) {
      setTutStepById('roll-2');
    } else {
      render();
    }
  }

  function onTapEgg() {
    const step = currentTutStep();
    if (step && !tutAllows('egg')) {
      nudgeWrongControl(eggBtn);
      return;
    }
    if (busy || !canUseEgg(game, 'child')) {
      sfx.play('wiggle');
      return;
    }
    clearHints();
    const { game: next, changedIndex, newFace } = useEggPower(game, 'child');
    game = next;
    eggShown = game.eggCharge; // the sparks go into the crack
    pending.add(changedIndex); // the die keeps its old face until the magic reaches it
    syncNewBadges();

    const dino = dinoByFace(newFace);
    saySloedla(`Töfralúður! ${dino.name} kemur til hjálpar!`, 3400);
    sfx.play('eggCrack');
    crackEgg();
    const targetDie = dieEls[changedIndex].dieBtn;
    const combo = detectCombo(game.dice);
    later(CRACK_MS, () => {
      sfx.play('crestCall');
      duckFor(1900);
      view?.call();
      floatNotes();
      later(160, () => {
        flyer(eggBtn, targetDie, 'magic');
        later(FLY_MS, () => {
          pending.delete(changedIndex);
          render();
          bounce(targetDie, 'magic', 800);
          sfx.play('magic');
          sparkle(targetDie, 18, win);
          if (combo.kind === 'yatzy') later(520, () => celebrateCombo(combo, 'child'));
        });
      });
    });
    if (step?.id === 'use-egg') {
      setTutStepById('score-yatzy');
    } else {
      render();
    }
  }

  function finishGame() {
    const childWon = game.winner === 'child' || game.winner === 'tie';
    if (save?.getYatzy && save?.setYatzy) {
      const prev = save.getYatzy();
      const updated = afterRound({ skill: prev.skill ?? SKILL_START, losses: prev.losses }, childWon);
      save.setYatzy({
        ...updated,
        wins: prev.wins + (childWon ? 1 : 0),
      });
    }
    syncNewBadges();

    const cScore = totalScore(game, 'child');
    const sScore = totalScore(game, 'sloedla');
    winTitle.textContent = game.winner === 'child' ? 'Þú vannst!' : game.winner === 'tie' ? 'Jafntefli!' : 'Slóeðla vann!';
    winScores.textContent = `Þú: ${cScore} ★ · Slóeðla: ${sScore} ★`;

    const badges = earnedBadgesSet();
    winBadges.replaceChildren(
      ...DINOS.map(dino => {
        const slot = make('span', `yatzy-badge-slot${badges.has(dino.key) ? ' earned' : ''}`);
        const img = doc.createElement('img');
        img.src = asset(dino.img);
        img.alt = dino.name;
        slot.append(img);
        return slot;
      }),
    );

    launchConfetti(childWon ? 60 : 30, childWon ? 22 : 10);
    winOverlay.hidden = false;
    retrigger(winOverlay, 'show');
    sfx.play('dialog');
    later(260, () => {
      sfx.play(childWon ? 'fanfare' : 'warm');
      duckFor(childWon ? 2300 : 2000);
    });
    view?.cheer(childWon ? 6.5 : 2.4); // for the child's win she rears up and calls in turn; when she wins, one happy rear-up
  }

  function runSloedlaTurn() {
    if (!isOpen || game.winner || game.turn !== 'sloedla') {
      busy = false;
      return;
    }
    busy = true;
    view?.think(true);
    sfx.play('drum');
    saySloedla('Mín umferð!');

    const skill = save?.getYatzy?.().skill ?? SKILL_START;

    function step() {
      if (!isOpen || game.winner || game.turn !== 'sloedla') {
        busy = false;
        return;
      }
      if (game.rolled) sfx.play('think');
      const move = chooseSloedlaMove(game, skill, random);
      if (move.type === 'roll') {
        const rolledIndices = !game.rolled
          ? [0, 1, 2, 3, 4]
          : game.held.map((h, i) => (!h ? i : -1)).filter(i => i >= 0);
        game = rollDice(game, 'sloedla', random);
        const combo = detectCombo(game.dice);
        animateRoll(rolledIndices, () => {
          celebrateCombo(combo, 'sloedla');
          render();
          later(SLOEDLA_STEP_MS, step);
        });
        render();
        return;
      }

      if (move.type === 'hold-and-roll') {
        game = setHeld(game, 'sloedla', move.held);
        const heldCount = game.held.filter(Boolean).length;
        if (heldCount > 0) sfx.play(`hold${Math.min(5, heldCount)}`);
        saySloedla('Ég geymi þessa í hreiðrinu!');
        render();
        later(SLOEDLA_STEP_MS, () => {
          if (!isOpen || game.turn !== 'sloedla') return;
          const rolledIndices = game.held.map((h, i) => (!h ? i : -1)).filter(i => i >= 0);
          game = rollDice(game, 'sloedla', random);
          const combo = detectCombo(game.dice);
          animateRoll(rolledIndices, () => {
            celebrateCombo(combo, 'sloedla');
            render();
            later(SLOEDLA_STEP_MS, step);
          });
          render();
        });
        return;
      }

      if (move.type === 'score') {
        view?.think(false);
        const cat = CATEGORIES.find(c => c.id === move.categoryId);
        const pts = scoreCategory(move.categoryId, game.dice);
        game = chooseCategory(game, 'sloedla', move.categoryId);
        scoreFx('sloedla', move.categoryId, pts);
        view?.watch(null);
        saySloedla(pts > 0 ? `Ég vel ${cat.short} (${pts} stig)! Þín umferð!` : `Ég vel ${cat.short}. Þín umferð!`);
        busy = false;
        render();
        if (game.winner) {
          later(650, finishGame);
        }
      }
    }

    later(SLOEDLA_STEP_MS, step);
  }

  function onTapCategory(categoryId) {
    if (busy || game.winner || game.turn !== 'child') return;
    const step = currentTutStep();
    if (step && !tutAllows(`cat:${categoryId}`)) {
      const btn = rowButtons.get(categoryId)?.btn;
      if (step.id === 'round-3-pick') {
        nudgeWrongControl(
          btn,
          'Við eigum þrjár Grameðlur (4)! Prófaðu frekar Þrenna (+7) hægra megin eða Grameðla (+6) vinstra megin sem gefa miklu fleiri stig!',
        );
      } else if (step.id === 'score-full-nest' || step.id === 'explain-boards') {
        nudgeWrongControl(btn, 'Pikkaðu á upplýsta reitinn Fullt hreiður (+10) á hægra spjaldinu!');
      } else if (step.id === 'score-yatzy') {
        nudgeWrongControl(btn, 'Pikkaðu á stjörnureitinn Yatzy! (+15) neðst á hægra spjaldinu!');
      } else {
        nudgeWrongControl(btn);
      }
      return;
    }
    if (!game.rolled || categoryId in game.scores.child) {
      sfx.play('wiggle');
      return;
    }
    clearHints();
    const pts = scoreCategory(categoryId, game.dice);
    const beforeCharge = game.eggCharge;
    game = chooseCategory(game, 'child', categoryId);
    syncNewBadges();
    scoreFx('child', categoryId, pts);
    if (game.eggCharge > beforeCharge) chargeEgg(rowButtons.get(categoryId)?.mineEl ?? eggBtn, 380);

    if (step) {
      if (step.id === 'explain-boards' || step.id === 'score-full-nest') {
        setTutStepById('sloedla-turn-1');
        runTutorialSloedlaTurn({
          dice: [3, 3, 3, 2, 5],
          categoryId: 'thorsedla',
          nextStepId: 'roll-round-2',
        });
      } else if (step.id === 'score-yatzy') {
        setTutStepById('sloedla-turn-2');
        runTutorialSloedlaTurn({
          dice: [2, 2, 4, 5, 6],
          categoryId: 'kambedla',
          nextStepId: 'round-3-roll',
        });
      } else if (step.id === 'round-3-pick') {
        save?.setYatzy?.({ tutorialDone: true });
        sfx.play('fanfare');
        view?.cheer(3.0);
        sparkle(tutCard, 18, win);
        setTutStepById('done');
      }
      return;
    }

    render();
    if (game.winner) {
      later(550, finishGame);
    } else if (game.turn === 'sloedla') {
      busy = true; // her turn waits a moment, so the child sees the stamp and the count land first
      later(700, runSloedlaTurn);
    }
  }

  function onTapMosi() {
    if (busy || game.winner || game.turn !== 'child') return;
    if (currentTutStep()) {
      sparkle(mosiBtn, 8, win);
      tutCard.classList.remove('tut-attention');
      void tutCard.offsetWidth;
      tutCard.classList.add('tut-attention');
      return;
    }
    clearHints();
    const advice = adviseYatzy(game);
    if (!advice) return;

    adviceWords.textContent = advice.text;
    adviceBubble.hidden = false;
    sparkle(mosiBtn, 8, win);

    if (advice.type === 'roll') {
      rollBtn.classList.add('hint');
    } else if (advice.type === 'use-egg') {
      eggBtn.classList.add('hint');
    } else if (advice.type === 'hold-and-roll') {
      advice.held.forEach((wantHeld, i) => {
        if (wantHeld) dieEls[i].dieBtn.classList.add('hint');
      });
      if (advice.diceToTap?.length === 0) {
        rollBtn.classList.add('hint');
      }
    } else if (advice.type === 'score' && advice.categoryId) {
      rowButtons.get(advice.categoryId)?.btn.classList.add('hint');
    }

    clearTimeout(adviceTimer);
    adviceTimer = setTimeout(clearHints, ADVICE_MS);
    adviceTimer?.unref?.();
  }

  function startTutorial() {
    clearTimers();
    clearHints();
    busy = false;
    winOverlay.hidden = true;
    game = newGame();
    resetFx();
    tutIdx = 0;
    tutOverrideText = '';
    view?.rest();
    saySloedla('Mosi kennir okkur Risaeðlu-Yatzy!');
    render();
  }

  function completeTutorialAndPlay() {
    save?.setYatzy?.({ tutorialDone: true });
    tutIdx = -1;
    tutOverrideText = '';
    startNewRound();
  }

  // ---- Wire Controls --------------------------------------------------------------------------------------------------

  // While dice are in the air (or the egg's magic is on its way) a finger's tap waits for them: nothing is chosen unseen.
  const settled = () => !rolling.size && !pending.size;
  pressable(rollBtn, { audio: { sfx: name => sfx.play(name) }, sound: null, win, onTap: () => settled() && onTapRoll() });
  pressable(eggBtn, { audio: { sfx: name => sfx.play(name) }, sound: null, win, onTap: () => settled() && onTapEgg() });
  pressable(mosiBtn, { audio: { sfx: name => sfx.play(name) }, sound: 'tap', win, onTap: onTapMosi });
  pressable(tutNextBtn, { audio: { sfx: name => sfx.play(name) }, sound: null, win, onTap: onTapTutNext });
  pressable(teachBtn, { audio: { sfx: name => sfx.play(name) }, sound: 'tap', win, onTap: () => startTutorial() });
  pressable(skipBtn, { audio: { sfx: name => sfx.play(name) }, sound: 'tap', win, onTap: () => completeTutorialAndPlay() });
  pressable(quitBtn, { audio: { sfx: name => sfx.play(name) }, sound: 'tap', win, onTap: () => close() });
  pressable(winCloseBtn, { audio: { sfx: name => sfx.play(name) }, sound: 'tap', win, onTap: () => close() });
  pressable(againBtn, {
    audio: { sfx: name => sfx.play(name) },
    sound: 'tap',
    win,
    onTap: () => {
      winOverlay.hidden = true;
      startNewRound();
    },
  });

  dieEls.forEach(({ dieBtn }, idx) => {
    pressable(dieBtn, { audio: { sfx: name => sfx.play(name) }, sound: null, win, onTap: () => settled() && onTapDie(idx) });
  });

  for (const [id, { btn }] of rowButtons) {
    pressable(btn, { audio: { sfx: name => sfx.play(name) }, sound: null, win, onTap: () => settled() && onTapCategory(id) });
  }

  root.addEventListener('contextmenu', e => e.preventDefault());

  function startNewRound() {
    clearTimers();
    clearHints();
    busy = false;
    tutIdx = -1;
    tutOverrideText = '';
    winOverlay.hidden = true;
    game = newGame();
    resetFx();
    view?.rest();
    saySloedla('Velkomin í Risaeðlu-Yatzy! Þú byrjar!');
    render();
  }

  async function ensureView() {
    if (view) {
      view.start();
      return;
    }
    if (!win?.WebGLRenderingContext) return;
    try {
      const { createSloedlaView } = await import('./sloedla-view.js');
      if (!isOpen) return;
      view = await createSloedlaView(sloedlaWindow, { win });
      sloedlaImg.hidden = true;
      if (isOpen) view.start();
    } catch {
      // Keeps the 2D portrait if WebGL is unavailable (e.g. headless DOM tests).
    }
  }

  function open({ tutorial = null } = {}) {
    if (isOpen) return;
    isOpen = true;
    root.hidden = false;
    try {
      onPause?.(true);
    } catch (e) {
      console.error('[yatzy]', e);
    }
    music.start();
    const shouldTeach =
      typeof tutorial === 'boolean' ? tutorial : Boolean(save?.getYatzy && !save.getYatzy().tutorialDone);
    if (shouldTeach) {
      startTutorial();
    } else {
      startNewRound();
    }
    ensureView();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    clearTimers();
    clearHints();
    busy = false;
    tutIdx = -1;
    tutOverrideText = '';
    resetFx();
    view?.stop();
    music.stop();
    root.hidden = true;
    winOverlay.hidden = true;
    try {
      onPause?.(false);
    } catch (e) {
      console.error('[yatzy]', e);
    }
    try {
      onClose?.();
    } catch (e) {
      console.error('[yatzy]', e);
    }
  }

  render();

  return {
    open,
    close,
    startNewRound,
    startTutorial,
    skipTutorial: completeTutorialAndPlay,
    nextTutorialStep: onTapTutNext,
    get isOpen() {
      return isOpen;
    },
    /** Silences the game's effects and music (and lets them sound again). */
    get muted() {
      return muted;
    },
    set muted(value) {
      setMuted(value);
    },
    get isTeaching() {
      return tutIdx >= 0;
    },
    get tutorialStep() {
      return currentTutStep();
    },
    get game() {
      return game;
    },
    /** Slóeðla's live view, once it has loaded (null until then, or without WebGL): for the lab and the play-tests. */
    get view() {
      return view;
    },
    setGame(nextState) {
      tutIdx = -1;
      tutOverrideText = '';
      game = nextState;
      render();
    },
    roll: onTapRoll,
    useEgg: onTapEgg,
    askMosi: onTapMosi,
    pickCategory: onTapCategory,
    toggleDie: onTapDie,
  };
}
