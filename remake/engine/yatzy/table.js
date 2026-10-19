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

const REMAKE = new URL('../../', import.meta.url);
const asset = path => new URL(path, REMAKE).href;
const MUSIC = asset('assets/audio/eitt/music.mp3');

const ROLL_ANIM_MS = 420;
const SLOEDLA_STEP_MS = 950;
const ADVICE_MS = 5200;
const SPEECH_MS = 2600;

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
  if (audio?.muted) music.muted = true;

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
  skipBtn.textContent = 'Sleppa kennslu';
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
  eggBtn.append(eggSparks, eggLabel);

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

  function saySloedla(text, ms = SPEECH_MS) {
    speechEl.textContent = text;
    speechEl.hidden = false;
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

  function renderDie(i) {
    const { dieBtn, nestTag, numEl, pipsEl, imgEl, nameEl } = dieEls[i];
    const face = game.dice[i];
    const dino = dinoByFace(face);
    const isHeld = game.rolled && game.held[i];

    dieBtn.style.setProperty('--dino-c', dino.colour);
    dieBtn.style.setProperty('--dino-deep', dino.deep);
    dieBtn.style.setProperty('--dino-light', dino.light);
    dieBtn.classList.toggle('held', isHeld);
    dieBtn.setAttribute(
      'aria-label',
      `${dino.name} (${face})${isHeld ? ', geymdur í hreiðri' : ''}`,
    );

    nestTag.hidden = !isHeld;
    numEl.textContent = String(face);
    pipsEl.replaceChildren(...Array.from({ length: face }, () => make('i')));
    imgEl.src = asset(dino.img);
    nameEl.textContent = dino.name;
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
    childPts.textContent = String(childTotal);
    sloedlaPts.textContent = String(sloedlaTotal);
    childPill.classList.toggle('active', !game.winner && game.turn === 'child');
    sloedlaPill.classList.toggle('active', !game.winner && game.turn === 'sloedla');

    // Badges bar
    const badges = earnedBadgesSet();
    for (const [key, slot] of badgeSlots) {
      slot.classList.toggle('earned', badges.has(key));
    }

    // Dice
    const combo = game.rolled ? detectCombo(game.dice) : { kind: 'none', indices: [], label: '' };
    for (let i = 0; i < DICE_COUNT; i++) {
      renderDie(i);
      dieEls[i].dieBtn.classList.toggle('combo-match', game.rolled && combo.indices.includes(i));
    }

    // Banner & Nest Hint
    bannerEl.classList.toggle('yatzy-mega', combo.kind === 'yatzy');
    if (game.winner) {
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
    rollLabel.textContent = !game.rolled ? 'Kasta!' : game.rollsLeft > 0 ? 'Kasta aftur!' : 'Veldu reit';
    pipSpans.forEach((pip, idx) => pip.classList.toggle('on', idx < game.rollsLeft));

    // Golden Egg button
    const eggReady = canUseEgg(game, 'child');
    eggBtn.classList.toggle('ready', eggReady);
    eggSparkDots.forEach((dot, idx) => dot.classList.toggle('lit', idx < game.eggCharge));
    eggLabel.textContent = eggReady ? 'Lúðrakall!' : `Töfraegg ${game.eggCharge}/${MAX_EGG_CHARGE}`;

    // Scorecard rows
    const childCanPick = !game.winner && game.turn === 'child' && game.rolled;
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
        if (slot) sparkle(slot, 14, win);
      }
    }
  }

  function animateRoll(rolledIndices, onDone) {
    for (const idx of rolledIndices) {
      dieEls[idx].dieBtn.classList.remove('rolling');
      void dieEls[idx].dieBtn.offsetWidth;
      dieEls[idx].dieBtn.classList.add('rolling');
    }
    later(ROLL_ANIM_MS, () => {
      for (const idx of rolledIndices) dieEls[idx].dieBtn.classList.remove('rolling');
      onDone?.();
    });
  }

  function celebrateCombo(combo, who) {
    sfx.play('land');
    if (combo.kind === 'yatzy') {
      sfx.play('yatzy');
      view?.call();
      saySloedla(who === 'child' ? 'Váá! Risaeðlu-Yatzy!!' : 'Jibbí! Ég fékk Yatzy!');
      for (const { dieBtn } of dieEls) sparkle(dieBtn, 12, win);
      sparkle(bannerEl, 16, win);
    } else if (['footprints-5', 'full-nest', 'four', 'footprints-4', 'three'].includes(combo.kind)) {
      sfx.play('combo');
      view?.hop();
      for (const idx of combo.indices) sparkle(dieEls[idx].dieBtn, 8, win);
    } else if (combo.kind === 'two-pairs' || combo.kind === 'pair') {
      sfx.play('pair');
      view?.nod();
    }
  }

  function runTutorialSloedlaTurn({ dice, categoryId, nextStepId }) {
    busy = true;
    view?.think(true);
    saySloedla('Mín umferð!');

    later(550, () => {
      if (!isOpen || tutIdx < 0) return;
      game = {
        ...game,
        dice: [...dice],
        held: [false, false, false, false, false],
        rollsLeft: 2,
        rolled: true,
      };
      sfx.play('roll');
      render();
      animateRoll([0, 1, 2, 3, 4], () => {
        const combo = detectCombo(game.dice);
        celebrateCombo(combo, 'sloedla');
        render();
        later(650, () => {
          if (!isOpen || tutIdx < 0) return;
          view?.think(false);
          const cat = CATEGORIES.find(c => c.id === categoryId);
          const pts = scoreCategory(categoryId, game.dice);
          game = chooseCategory(game, 'sloedla', categoryId);
          sfx.play('score');
          const rowEntry = rowButtons.get(categoryId);
          if (rowEntry) sparkle(rowEntry.btn, 10, win);
          saySloedla(`Ég vel ${cat.short} (${pts} stig)! Þín umferð!`);
          busy = false;
          setTutStepById(nextStepId);
        });
      });
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
    const rolledIndices = !game.rolled
      ? [0, 1, 2, 3, 4]
      : game.held.map((h, i) => (!h ? i : -1)).filter(i => i >= 0);

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
    sfx.play('roll');
    render();

    const combo = detectCombo(game.dice);
    animateRoll(rolledIndices, () => {
      celebrateCombo(combo, 'child');
      if (game.eggCharge > beforeCharge) {
        sfx.play(game.eggCharge >= MAX_EGG_CHARGE ? 'eggReady' : 'eggSpark');
        sparkle(eggBtn, 10, win);
      }
      render();
    });
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
    if (game.held[index]) {
      const heldCount = game.held.filter(Boolean).length;
      sfx.play(`hold${Math.min(5, Math.max(1, heldCount))}`);
      sparkle(dieEls[index].dieBtn, 8, win);
    } else {
      sfx.play('unhold');
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
    syncNewBadges();

    sfx.play('crestCall');
    view?.call();
    const dino = dinoByFace(newFace);
    saySloedla(`Töfralúður! ${dino.name} kemur til hjálpar!`, 3400);

    const targetDie = dieEls[changedIndex].dieBtn;
    targetDie.classList.remove('magic');
    void targetDie.offsetWidth;
    targetDie.classList.add('magic');
    sparkle(eggBtn, 14, win);
    sparkle(targetDie, 18, win);

    const combo = detectCombo(game.dice);
    if (combo.kind === 'yatzy') {
      later(400, () => celebrateCombo(combo, 'child'));
    }
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

    const colours = ['#e8483b', '#f7bd2b', '#6fae4f', '#3a8de4', '#8f6aa3', '#dc8090'];
    confettiEl.innerHTML = Array.from(
      { length: 48 },
      (_, k) =>
        `<i style="--c:${colours[k % colours.length]};--x:${((k * 61.8) % 100).toFixed(1)}%;--t:${(3.1 + (k % 5) * 0.4).toFixed(2)}s;--d:-${((k * 1.7) % 4).toFixed(2)}s"></i>`,
    ).join('');

    winOverlay.hidden = false;
    sfx.play('fanfare');
    view?.cheer(5.0);
  }

  function runSloedlaTurn() {
    if (!isOpen || game.winner || game.turn !== 'sloedla') return;
    busy = true;
    view?.think(true);
    saySloedla('Mín umferð!');

    const skill = save?.getYatzy?.().skill ?? SKILL_START;

    function step() {
      if (!isOpen || game.winner || game.turn !== 'sloedla') {
        busy = false;
        return;
      }
      const move = chooseSloedlaMove(game, skill, random);
      if (move.type === 'roll') {
        const rolledIndices = !game.rolled
          ? [0, 1, 2, 3, 4]
          : game.held.map((h, i) => (!h ? i : -1)).filter(i => i >= 0);
        game = rollDice(game, 'sloedla', random);
        sfx.play('roll');
        render();
        const combo = detectCombo(game.dice);
        animateRoll(rolledIndices, () => {
          celebrateCombo(combo, 'sloedla');
          render();
          later(SLOEDLA_STEP_MS, step);
        });
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
          sfx.play('roll');
          render();
          const combo = detectCombo(game.dice);
          animateRoll(rolledIndices, () => {
            celebrateCombo(combo, 'sloedla');
            render();
            later(SLOEDLA_STEP_MS, step);
          });
        });
        return;
      }

      if (move.type === 'score') {
        view?.think(false);
        const cat = CATEGORIES.find(c => c.id === move.categoryId);
        const pts = scoreCategory(move.categoryId, game.dice);
        game = chooseCategory(game, 'sloedla', move.categoryId);
        sfx.play('score');
        const rowEntry = rowButtons.get(move.categoryId);
        if (rowEntry) sparkle(rowEntry.btn, 10, win);
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
    game = chooseCategory(game, 'child', categoryId);
    syncNewBadges();
    sfx.play('score');

    const rowEntry = rowButtons.get(categoryId);
    if (rowEntry) sparkle(rowEntry.btn, pts >= 8 ? 14 : 8, win);
    if (pts >= 8) view?.hop();

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
      runSloedlaTurn();
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

  pressable(rollBtn, { audio: { sfx: name => sfx.play(name) }, sound: null, win, onTap: onTapRoll });
  pressable(eggBtn, { audio: { sfx: name => sfx.play(name) }, sound: null, win, onTap: onTapEgg });
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
    pressable(dieBtn, { audio: { sfx: name => sfx.play(name) }, sound: null, win, onTap: () => onTapDie(idx) });
  });

  for (const [id, { btn }] of rowButtons) {
    pressable(btn, { audio: { sfx: name => sfx.play(name) }, sound: null, win, onTap: () => onTapCategory(id) });
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
    get isTeaching() {
      return tutIdx >= 0;
    },
    get tutorialStep() {
      return currentTutStep();
    },
    get game() {
      return game;
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
