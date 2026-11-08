import { createMemoryGame } from './rules.js';
import { createMemoryWorld } from './world.js';
import { createMemoryAudio, soundscapeUrl } from './audio.js';
import { createStepRules, obstaclesOf } from './step-rules.js';
import { LEVELS, chooseLevel, finishLevel, isNewLevel, markPlayed } from './levels/index.js';
import { createMemoryMusic, createMemorySpeech } from './presentation-audio.js';
import { nextStoryStep } from './playful-flow.js';
import { GIFT_ITEMS, GIFT_CREDITS } from './surprise-items.js';
import { VOICE_LINES, COUNT_TAKES } from './voice-lines.js';
import { IDLE_HINT, forgetOldMute, momentLine, askLine, repeatDue, countLine } from './coach.js';
import { BASKET_ICON } from '../scene/ui.js';
import { createJuniorAudio } from '../yatzy-junior/sounds.js';
import { createJuice } from '../yatzy-junior/juice.js';
import { createHudFx } from './hud-fx.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
// The level being played: its friends, steps, story, words and sounds are all read from its description (levels/).
const { level, locked } = chooseLevel(params);
const roster = level.roster;
// The "who" bubbles: a portrait of each pair (portraits/, cropped round in CSS) and its name.
const pairs = level.pairs;
const OBSTACLES = obstaclesOf(level);
// Which of Mosi's lines are the level's own (levels/*.js `lines`; level 1 has the first ones, a null is a line the level does not have yet).
const LINES = { welcome: 'welcome', help: 'help', giftsLeft: 'giftsLeft', gifts: 'gifts3', ...level.lines };
const stepById = id => level.steps.find(step => step.id === id);
const travelAt = target => level.steps.find(step => step.kind === 'travel' && step.target === target);
// Mosi's lines that also go up in his bubble when a script says them.
const CAPTIONED = new Set(['match', 'who', 'other', 'together', 'push', 'findFirst', 'notYet', 'lift', 'build', 'won', 'gifts3', 'giftsLeft', 'gifts4', 'g2_left', 'g2_pull', 'g2_won']);
// How long a line's words stay up in his bubble when a script says it (seconds; the others 2.6).
// (the welcome's words stay up while he says them: 3.6 s on level 1, 4.4 s on level 2)
const WELCOME_HOLD = 4.5;
const CAPTION_HOLD = { won: 5.8, gifts3: 3.4, gifts4: 3.4, giftsLeft: 3.2, g2_left: 3.2, g2_won: 5.2 };
// (seconds of no tap before the tap hint, the finger, shows on what the child should tap: coach.js IDLE_HINT, 4)
// Mosi's repeat waits for his voice to have been quiet this long too, so a line of the moment that has only just ended is not said again at once.
const REPEAT_QUIET = 3;
// What Mosi says again at a moment (his button, his repeat): the instruction of the moment, never a reaction line (coach.js momentLine).
// A waiting moment has its own line (the level's `voice`, by story key; a wait for the gifts says the level's giftsLeft line); a search says
// `first` ("Ýttu á lauf..."), and the picker `who`. A moment with none says nothing on the repeat, and the button says the help line.
const MOMENT_VOICE = { ...Object.fromEntries(level.steps.filter(step => step.waitsForGifts).map(step => [level.story[step.id].gifts, LINES.giftsLeft])), ...level.voice };
const MOMENT_KINDS = { search: 'first', choose: 'who' };
const momentNow = () => { const story = currentStory(); return { key: story.key, kind: story.kind, voice: MOMENT_VOICE, kinds: MOMENT_KINDS }; };
// The tap hint of every leaf and obstacle button (Litla Yatzy's, engine/yatzy-junior/game.js: a ring that closes and a drawn finger).
const TAP_HINT = '<span class="tap-hint" aria-hidden="true"><i class="tap-ring"></i><svg viewBox="0 0 24 24"><path d="M9.2 11.4V4.6a1.6 1.6 0 0 1 3.2 0v5.6m0-.4a1.6 1.6 0 0 1 3.2 0v1.2m0-.2a1.6 1.6 0 0 1 3.2 0v3.4c0 3.7-2.5 6.2-6.1 6.2h-1.1c-2.1 0-3.5-.8-4.7-2.4l-2.6-3.5a1.6 1.6 0 0 1 2.4-2.1l2.5 2.3"/></svg></span>';
const RETRY_AFTER = 3; // seconds the camera is still before a blocked crossing (or walk to the grove) tries again by itself
const seeded = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const game = createMemoryGame({ ...(params.has('seed') ? { random: seeded(Number(params.get('seed')) || 251025) } : {}), species: level.friends, gifts: level.gifts });
// (a level may add a soundscape of its own to the shared one: levels/*.js `soundscape`)
const audio = createMemoryAudio({ extraManifests: level.soundscape ? [soundscapeUrl(level.soundscape)] : [] });
// The page's own sounds and small effects (the juice pass of 2026-11-07, package B): Litla Yatzy's sounds for the buttons, the picker, the
// basket, the dots and the end (engine/yatzy-junior/sounds.js: made on the spot, never recorded; each kind waits its own gap, JUNIOR_GAPS,
// and all of them dip under Mosi's voice), its pops (juice.js), and the stars and confetti of the corner chip and the ending (hud-fx.js).
// Under less motion nothing of theirs moves; the sounds stay.
const ui = createJuniorAudio();
const juice = createJuice({ reduced: () => reducedMotion });
const hudFx = createHudFx({ reduced: () => reducedMotion });
const bridge = createStepRules(level);
const buttons = new Map();
const nestSpecies = [];
let world, started = false, userPaused = false, time = 0, lastFrame = 0, raf = 0, disposed = false, phaseBefore = '';
let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let celebrated = false;
let autoStep = null, autoAge = 0, blockedAuto = null, retryAge = 0, storyKey = '', captionUntil = 0;
// (a script put Mosi's bubble away: level 2's celebration, as everyone stands on Sólarsyllan, so the walk's words do not stay up through the tricks;
// the next words he says bring it back. Task 7 fix round 1)
let captionCleared = false;
let giftsLeftSaid = false; // Mosi has said `giftsLeft` for this wait
let idleTime = 0, whoShown = false; // game seconds since the child last tapped; whether the bubbles are on screen
let basketCount = 0; // gift pairs that have flown into the basket in the corner chip
// (#7) The dots filled in the chip: a found pair's dot fills when its star lands (a star waiting to fly, one in the air, and how long a dot
// has been owed with neither), and whether the ending's confetti and fanfare have come in this round (#9).
let dotsLanded = 0, starQueued = null, starFlying = false, dotsLate = 0, endingCheered = false;
// (#8) How much Mosi's face on his button moves with his voice (smoothed), and what was last written.
let talk = 0, talkWritten = '';
let uiDucked = null; // whether the page's sounds are dipped under his voice now
// Mosi's button and his repeat (coach.js): the key he has repeated his line for, and how long his voice has been quiet (game seconds).
let repeatedKey = null, voiceQuiet = 0;
// There is no sound button any more: a tablet muted by the old one would stay silent, so its saved key is forgotten (the sound is never muted).
try { forgetOldMute(localStorage); } catch {}
const dialogs = [$('welcome'), $('pause-dialog')];
const busyDialog = () => dialogs.some(dialog => dialog.open);
const held = () => !started || userPaused || document.hidden || busyDialog();
function syncPause() {
  const paused = held(); game.pause(paused); audio.pause(paused); $('game').dataset.paused = String(paused);
  speech.pause(paused, { force: !started || userPaused || document.hidden }); music.pause(paused); ui.pause(paused);
  refreshControls();
}
function caption(text, hold = 0) { if ($('caption').textContent !== text) { $('caption').textContent = text; if (text) squeezeBubble(); } if (hold) captionUntil = time + hold; if (text) captionCleared = false; }
// (#8) His bubble gives a light squeeze when its words change (not under less motion, and at most once in .3 s).
let squeezedAt = -Infinity;
function squeezeBubble() {
  const now = performance.now(); if (now - squeezedAt < 300 || $('coach').hidden) return;
  squeezedAt = now; hudFx.squeeze($('coach'));
}
// A sound of the page (a button, the picker, the basket, a dot, the end), asked of Litla Yatzy's sounds; QA reads what was asked and when
// (window.__memory.audio().ui.asked: the game's seconds, and the wall clock in ms, as the memory audio's own log has it: the playthrough
// lays them under its video).
const uiAsked = [];
function uiSound(kind, options) {
  ui.unlock();
  const sounded = ui.cue(kind, options);
  uiAsked.push({ t: Math.round(time * 100) / 100, wall: Math.round(performance.timeOrigin + performance.now()), kind, sounded }); if (uiAsked.length > 200) uiAsked.shift();
  return sounded;
}
function clearCaption() { captionCleared = true; captionUntil = 0; $('caption').textContent = ''; $('coach').hidden = true; }
// The words and counts on the page come from the level (levels/*.js, `copy`, `friends`, `gifts`). The markup has the same words
// for level 1, so its first paint is the markup's own: only what differs is written.
function applyLevelDom() {
  const { copy } = level;
  const text = (selector, value) => { const element = document.querySelector(selector); if (element && element.textContent !== value) element.textContent = value; };
  // A button's label is its first text node (its icon follows in a span).
  const label = (selector, value) => { const node = document.querySelector(selector)?.firstChild; if (node?.nodeType === 3 && node.nodeValue !== `${value} `) node.nodeValue = `${value} `; };
  const describe = (id, value) => { if ($(id).getAttribute('aria-label') !== value) $(id).setAttribute('aria-label', value); };
  // A level with its own mark (level 2's fossil: `hud.mark`) shows it in place of the berries on the ending card (the same box, so the layout stays).
  if (level.hud?.mark) for (const mark of document.querySelectorAll('svg.ending-berries')) {
    const picture = Object.assign(document.createElement('img'), { src: level.hud.mark, alt: '', className: `${mark.getAttribute('class') ?? ''} hud-mark`.trim(), width: 66, height: 66 });
    picture.setAttribute('aria-hidden', 'true'); picture.decoding = 'async'; mark.replaceWith(picture);
  }
  text('#welcome h2', copy.welcome.title); label('#start', copy.welcome.start);
  const intro = document.querySelector('#welcome > p');
  if ([...intro.childNodes].map(node => node.nodeName === 'BR' ? '\n' : node.nodeValue).join('') !== copy.welcome.lines.join('\n')) {
    intro.replaceChildren(...copy.welcome.lines.flatMap((line, index) => (index ? [document.createElement('br'), line] : [line])));
  }
  // The line that says who is holding something up ("Þórseðlurnar halda greininni"; level 2's: the Kambeðlur and the light).
  const holding = copy.holding && [...$('holding').childNodes].find(node => node.nodeType === 3);
  if (holding && holding.nodeValue !== ` ${copy.holding}`) holding.nodeValue = ` ${copy.holding}`;
  text('#ending h2', copy.ending.title); text('#ending-copy', copy.ending.text); label('#again', copy.ending.again);
  text('#loading h2', copy.loading.title); text('#loading-copy', copy.loading.copy);
  describe('targets', copy.aria.targets);
  // One dot for each friend pair, and the count of gifts ("0 / 3").
  const dots = $('progress').querySelector('.nest-dots');
  if (dots.children.length !== level.friends.length) dots.replaceChildren(...level.friends.map(() => document.createElement('i')));
  reflectProgress(game.getState()); reflectBasket(); reflectPicker();
}
// The level picker on the welcome card: one card for each level (levels/*.js). The one being played is outlined and starts it; another that is open
// opens its page (the page plays one level: its world is the only one loaded); one that is locked says what opens it (level 1 finished) and cannot
// be started. Only the cards' look is told by aria-disabled and aria-current: a locked card can still be focused, so that it can be read out.
const nextLevel = LEVELS[LEVELS.indexOf(level) + 1] ?? null;
function levelCards() {
  const make = (tag, className, text = '') => Object.assign(document.createElement(tag), { className, textContent: text });
  return LEVELS.map(item => {
    const here = item === level, shut = locked.has(item.id) && !here, card = make('button', 'level-card');
    // (#10) A level that is open and has not been played yet carries «Nýtt!» (levels/index.js isNewLevel) until a round of it starts.
    const fresh = !shut && isNewLevel(item, locked);
    card.type = 'button'; card.dataset.level = item.id; card.setAttribute('aria-disabled', String(shut));
    if (here) card.setAttribute('aria-current', 'true');
    card.setAttribute('aria-label', shut ? `${item.title}, læst. ${item.copy.locked ?? ''}` : `${item.title}, borð ${item.number}${here ? ', þú ert hér' : ''}${fresh ? ', nýtt' : ''}`);
    const picture = Object.assign(document.createElement('img'), { className: 'level-picture', src: `./assets/memory/levels/${item.id}.webp`, alt: '', width: 640, height: 330, draggable: false });
    const parts = [picture, make('span', 'level-number', String(item.number)), make('span', 'level-title', item.title)];
    if (shut) { parts.push(make('span', 'level-lock', '🔒')); parts.push(make('span', 'level-note', item.copy.locked ?? '')); }
    if (fresh) parts.push(newTag());
    card.append(...parts);
    card.addEventListener('click', () => {
      // (a locked card says "oh" as it shakes its head; an open one taps)
      if (shut) { uiSound('oh'); card.classList.remove('nope'); void card.offsetWidth; card.classList.add('nope'); return; }
      uiSound('tap');
      if (here) { start(); return; }
      goToLevel(item);
    });
    return card;
  });
}
// The «Nýtt!» tag on a level card and on the ending card's button to the next level (read out by the button's own label, not the tag).
function newTag() { const tag = Object.assign(document.createElement('span'), { className: 'new-tag', textContent: 'Nýtt!' }); tag.setAttribute('aria-hidden', 'true'); return tag; }
// (the page plays one level: another level is another page, ?bord=N)
function goToLevel(item) {
  const next = new URLSearchParams(location.search); next.delete('play'); next.delete('bord'); if (item.number > 1) next.set('bord', String(item.number));
  const query = next.toString(); location.assign(`${location.pathname}${query ? `?${query}` : ''}`);
}
// (Task 7) The ending card's second button: the next level once it is open (level 1's card: "Steinagljúfrið →"), or the way back the level's copy names (level 2's:
// "Berjalundurinn"); none while the next level is still shut.
function endingLink() {
  if (nextLevel && !locked.has(nextLevel.id)) return { item: nextLevel, text: nextLevel.title, arrow: true };
  const home = level.copy.ending.home, item = home && LEVELS.find(other => other.id === home.level);
  return item ? { item, text: home.text, arrow: false } : null;
}
function reflectEndingLink() {
  const link = endingLink(), button = $('ending-next'); button.hidden = !link; if (!link) return;
  // (#10) The next level, open and not played yet: «Nýtt!» on the button and a gold glow breathing round it (minnisspil.css .is-new).
  const fresh = link.arrow && isNewLevel(link.item, locked);
  if (button.dataset.level === link.item.id && button.classList.contains('is-new') === fresh) return;
  const arrow = document.createElement('span'); arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '→';
  button.dataset.level = link.item.id; button.classList.toggle('is-new', fresh);
  button.replaceChildren(link.text + (link.arrow ? ' ' : ''), ...(link.arrow ? [arrow] : []), ...(fresh ? [newTag()] : []));
}
function reflectPicker() { $('level-cards').replaceChildren(...levelCards()); reflectEndingLink(); }
// A level finished is open for good, and so is the next, which this page's ending card offers at once even when storage does not take it (levels/index.js finishLevel).
function unlockNext() { finishLevel(level, locked); reflectPicker(); }
// The pairs found: a dot each, filled once found (the chip has no words; its label says it).
function reflectProgress(state) {
  $('progress').setAttribute('aria-label', `${state.matchedPairs} af ${level.friends.length} pörum fundin`);
  $('progress').querySelectorAll('i').forEach((dot, index) => dot.classList.toggle('found', index < Math.min(dotsLanded, state.matchedPairs)));
}
// (#7) A found pair's star: from the pair at home (its home's button, which follows their heads) to its dot in the chip, which fills as the
// star lands, with a pop, a few stars and "pip". The match script asks for it as Mosi claps (scene-sound 'star'), a moment after its cut;
// a dot owed with no star on its way and no script playing is filled a moment later all the same (a match the world did not play).
function sendStar(nestIndex) { if (!starFlying && dotsLanded < game.getState().matchedPairs) starQueued = { nestIndex, wait: .15 }; }
function launchStar() {
  const { nestIndex } = starQueued; starQueued = null;
  const dot = $('progress').querySelectorAll('.nest-dots i')[dotsLanded];
  if (!dot) { landDot(); return; }
  const home = world.getTargets().find(target => target.type === 'nest' && target.index === nestIndex), box = $('world').getBoundingClientRect();
  const inside = (value, size) => Math.max(24, Math.min(size - 24, value));
  const from = home ? { x: box.left + inside(home.x, box.width), y: box.top + inside(home.y, box.height) } : { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  starFlying = true;
  hudFx.flyStar(from, dot, () => { starFlying = false; landDot(); });
}
function landDot() {
  dotsLanded = Math.min(dotsLanded + 1, game.getState().matchedPairs); dotsLate = 0;
  reflectProgress(game.getState());
  const dot = $('progress').querySelectorAll('.nest-dots i')[dotsLanded - 1];
  if (dot) { juice.pop(dot, 1.5); hudFx.burst(dot, { count: 6, reach: .6 }); }
  uiSound('pip');
}
// The basket counts the gift pairs, as each pair lands in it: "0 / 3" from the start of the round; hidden when a round has none.
const giftTotal = () => level.gifts.length;
// Gift pairs not in the basket yet (the crossing and the ending wait until there are none), and gift pairs not found yet (the rest are
// on their way to the basket).
const giftsToLand = () => Math.max(0, giftTotal() - basketCount);
const giftsUnfound = () => new Set(game.getState().cards.filter(card => card.item && card.status !== 'found').map(card => card.item)).size;
function reflectBasket(pulse = false) {
  const total = giftTotal(), basket = $('basket');
  basket.hidden = !started || total === 0;
  $('basket-text').textContent = `${basketCount} / ${total}`;
  basket.setAttribute('aria-label', `Karfan: ${basketCount} af ${total} fundið`);
  basket.classList.toggle('full', total > 0 && basketCount >= total);
  if (pulse) { basket.classList.remove('got'); void basket.offsetWidth; basket.classList.add('got'); }
}
// (#6) A gift pair lands in the basket: the count pops, gold stars burst from the chip, and Litla Yatzy's "land" goes with the world's ding.
function giftLanded() {
  basketCount++; reflectBasket(true);
  hudFx.burst($('basket'), { count: 10, reach: 1.1 }); juice.pop($('basket-text'), 1.5); uiSound('land');
}
// Where the basket is, in canvas pixels: the world flies a gift pair there.
function basketPoint() {
  const box = $('basket').getBoundingClientRect(), canvas = $('world').getBoundingClientRect();
  return box.width ? { x: box.left + box.width / 2 - canvas.left, y: box.top + box.height / 2 - canvas.top } : null;
}
const betweenTurns = () => ['ready', 'won'].includes(game.getState().phase);
// What Mosi's hint needs from the rules besides the phase: the gift pairs still to land in the basket, and (with one leaf open) the line for a gift's other half.
const seekLine = () => { const state = game.getState(), open = state.selected.length === 1 ? state.cards[state.selected[0]] : null; return open?.item ? GIFT_ITEMS[open.item]?.seek ?? null : null; };
const currentStory = () => nextStoryStep({ ...game.getState(), giftsLeft: giftsUnfound(), giftsLanding: giftsToLand() - giftsUnfound(), seek: seekLine() }, bridge.getState(), world?.getPairReadiness?.() ?? {}, level);
function syncBridge() {
  world?.setStepState(bridge.getState());
  refreshControls();
}
// Whether a pair is busy holding something up (level 1: the Þórseðlur hold the branch from the lift until the log is across).
const holding = state => level.steps.some(step => step.holds && state.done.includes(step.id) && !state.done.includes(step.holds));
// What a script asked to be heard. The world never touches audio; game.js does.
function playSceneSound({ name, species, index = 0, nestIndex = 0 }) {
  if (name === 'reveal') audio.reveal(species, index);
  else if (name === 'call') audio.nest(species, index);
  else if (name === 'match') audio.match(species, nestIndex);
  else if (name === 'conceal') audio.conceal();
  else if (name === 'poof') audio.poof();
  else if (name === 'bonk') audio.bonk();
  else if (name === 'ding') audio.ding();
  else if (name === 'giggle') audio.giggle();
  else if (name === 'clap') audio.mosiClap(index);
  else if (name === 'cheer') audio.cheer();
  else if (name === 'star') sendStar(nestIndex);
}
// The keys of an event in the level's tables: a beat by its step ('beat:lift'); any other by its type, and also by its type and id
// ('pair-arrived:cross') and by those and its index ('wing-beat:pull:0'), the more particular after.
function eventKeys(event) {
  if (event.type === 'beat') return [`beat:${event.id}`];
  const keys = [event.type];
  if (event.id !== undefined) { keys.push(`${event.type}:${event.id}`); if (event.index !== undefined) keys.push(`${event.type}:${event.id}:${event.index}`); }
  return keys;
}
// What the level's own events (the world's task events: a branch lifted, a log rolling, the bark placed...) sound like, said in
// the level's table (levels/*.js, eventSounds), by its keys (eventKeys). A line of Mosi's is queued once in a round, or again with `again`.
function playEventSounds(event) {
  for (const key of eventKeys(event)) for (const entry of level.eventSounds[key] ?? []) {
    if (typeof entry === 'string') audio[entry]();
    else if (entry.say) speech.queue(entry.say, { delay: entry.delay, once: !entry.again });
    else audio[entry.method](event[entry.arg]);
  }
}
// The words Mosi's bubble shows for an event, from the level's table (eventCaptions): the most particular of its keys.
function showEventCaption(event) {
  const entry = eventKeys(event).map(key => level.eventCaptions[key]).filter(Boolean).at(-1);
  if (entry) caption(entry.by?.[event.id] ?? entry.text, entry.hold);
}
// A beat of the tap-along: its big word, the step's beatWords by the beat's number (the last one if there are more beats than words),
// and Mosi counts it where the word is one of his counting takes' («Einn!», «Tveir!», «Þrír!»: countBeat).
function showBeatWord(event) {
  const words = stepById(event.id)?.beatWords;
  if (!words) return;
  const word = words[event.index] ?? words.at(-1);
  showWord(word); countBeat(word, event);
}
// (audit #11) Mosi says the count with the tap, with Háls og hali's approved take of that word (voice-lines.js COUNT_TAKES, coach.js countLine:
// by the word, so «Upp!», «ÝTA!» or the bark's «Ein!» stay words only). Through his own voice (presentation-audio.js count): his mouth moves
// and the page's sounds dip under it; it may cut the count before it, never starts over a sentence of his (that beat is silent) and is
// never queued (fast taps drop counts, they do not pile up). The playthrough's taps (window.__memory.tap) come the same way.
const beatLog = []; // (the beats of the round, for QA: window.__memory.beats())
function countBeat(word, event) {
  const take = countLine(word, COUNT_TAKES);
  const said = take ? speech.count(take) : false;
  // (QA reads each beat: window.__memory.beats(); a counted beat left silent names the sentence that kept it so)
  const { current, pending } = take && !said ? speech.getStats() : {};
  beatLog.push({ t: Math.round(time * 100) / 100, wall: Date.now(), id: event.id, index: event.index, word, take, said, over: take && !said ? pending ?? current ?? null : null });
  if (beatLog.length > 100) beatLog.shift();
}
// A script's line for Mosi: heard, and the task lines also shown in his bubble.
// `queue`: the celebration's lines wait until what he is saying is over (the gifts line after "Allir sex komnir…").
function sayLine(line, { queue = false } = {}) {
  if (queue) speech.queue(line, { delay: .1, once: false }); else speech.play(line);
  if (CAPTIONED.has(line) && VOICE_LINES[line]) caption(VOICE_LINES[line].text, CAPTION_HOLD[line] ?? 2.6);
}
// Mosi says a line again (his button, or the repeat after a long wait): heard, and its words in his bubble.
function sayAgain(line) {
  speech.play(line);
  const text = VOICE_LINES[line]?.text;
  if (text) caption(text, CAPTION_HOLD[line] ?? 2.6);
}
// "Spyrja Mosa" (his button, bottom left): the instruction of this moment of the story, or else his help line (coach.js askLine). Never over a line he is saying or about to say, during a step or a scene, or while the game is held. A tap on him is the
// child doing something (the finger and the repeat wait again).
// (his button taps as it is pressed, whether or not he has something to say now; the playthrough's child takes the same path)
function pressMosi() { uiSound('tap'); askMosi(); }
function askMosi() {
  noteInput();
  if (!world || !started) return;
  const line = askLine({ ...momentNow(), help: LINES.help, speaking: speech.isPlaying() || Boolean(speech.getStats().pending),
    busy: held() || Boolean(bridge.getState().active) || Boolean(world?.sceneBusy()) });
  if (!line) return;
  audio.unlock(); music.unlock(); sayAgain(line);
}
// After a long wait (coach.js IDLE_REPEAT, 10 s of the idle clock, which stands still while the picker asks, a scene plays or the camera moves)
// Mosi says the instruction of the moment once more, once for each moment, and only when his voice has been quiet a while (REPEAT_QUIET).
function repeatMoment() {
  const moment = momentNow(), key = moment.key, line = momentLine(moment);
  if (!repeatDue({ idle: idleTime, key, repeated: repeatedKey, mayAct: canExplore(), speaking: speech.isPlaying() || voiceQuiet < REPEAT_QUIET, line })) return;
  repeatedKey = key; sayAgain(line);
}
// Big words over the scene for a step of the tap-along ("Upp!").
function showWord(text) {
  const word = $('beat-word'); word.textContent = text;
  word.classList.remove('show'); void word.offsetWidth; word.classList.add('show');
}
function noteInput() { idleTime = 0; }
function cameraState() { return world?.getCameraState?.() ?? world?.getDebug().camera ?? { mode: 'auto', moving: false, worldInputEnabled: true }; }
function setCameraMode(mode) {
  if (!world || !['auto', 'overview'].includes(mode)) return;
  world.setCameraMode?.(mode); refreshControls();
}
// Whether the child may tap the world now: not held, the camera still and giving input (not the overview), no step running, the picker not
// asking, between turns. (refreshControls' mayExplore, and the repeat's mayAct)
function canExplore(task = bridge.getState(), camera = cameraState()) {
  const worldInput = !camera.moving && camera.worldInputEnabled !== false && camera.mode !== 'overview';
  return !held() && worldInput && !task.active && !(task.asking || task.failing) && betweenTurns();
}
function targetAvailable(type, id) {
  const camera = cameraState();
  if (camera.worldInputEnabled === false || camera.moving || camera.mode === 'overview') return false;
  return world.getTargets().some(target => target.type === type && (type === 'nest' ? target.index : target.id) === id && target.enabled !== false);
}
function guidance() {
  // While a script holds the camera its own caption stays up (the child cannot act on a new hint yet).
  if (time < captionUntil || cameraState().held) return;
  const story = currentStory(); caption(story.prompt);
  $('coach').dataset.tone = story.kind === 'action' ? 'action' : story.kind === 'celebrate' ? 'celebrate' : 'hint';
  // "Allir sex komnir..." (`won`) is the celebration's (levels/berjalundur/scenes/celebrate.js says it when the grove is reached): nothing here queues it.
}
function launchAction(action) {
  // The crossing and the walk to the grove: they start on their own once every friend is home.
  const ready = world?.getPairReadiness?.() ?? {};
  if (!bridge.getState().unlocked.every(species => ready[species])) return false;
  // The leaves are behind the camera once the crossing starts: every gift pair is in the basket first.
  const step = stepById(action);
  if (step?.waitsForGifts && giftsToLand() > 0) return false;
  if (!bridge.can(action) || world.playStep(action, {}) === null) return false;
  bridge.choose(action); autoStep = null; autoAge = 0; blockedAuto = null;
  captionUntil = 0; speech.stop(); audio.unlock(); music.unlock(); syncBridge(); guidance(); reflectEnding();
  // The camera is already held by the script, so guidance() leaves the caption alone: put Mosi's words up with his voice.
  // (level 1's travel steps have their own id for their line: cross, finish; a level may say which line each has, `lines`: level 2's through and climb)
  if (step?.kind === 'travel') { const line = LINES[action] ?? action; speech.queue(line, { delay: .15 }); caption(VOICE_LINES[line].text, 3.2); }
  return true;
}
// The story's wait for the gifts: level 1's key is 'gifts-left', a level's own has its prefix (level 2's 'g2-gifts-left').
const waitsForGifts = key => key === 'gifts-left' || key.endsWith('-gifts-left');
function updateStory(dt) {
  const story = currentStory(), camera = cameraState();
  if (captionUntil > 0 && time >= captionUntil) { captionUntil = 0; storyKey = ''; }
  if (storyKey !== story.key && time >= captionUntil && !camera.held) {
    storyKey = story.key; guidance();
    // A moment of the story that Mosi says aloud (the level's `voice`, by story key: level 2's tunnel and rockfall): once, when it comes, as the giftsLeft line is.
    if (level.voice?.[story.key]) speech.queue(level.voice[story.key], { delay: .5 });
    // The bridge is built, every friend is home and gifts are left: Mosi says so once as the wait begins (not again each time a held caption ends).
    if (waitsForGifts(story.key) && !giftsLeftSaid) { giftsLeftSaid = true; speech.queue(LINES.giftsLeft, { delay: .4, once: false }); }
  }
  if (!waitsForGifts(story.key)) giftsLeftSaid = false;
  if (held() || camera.mode !== 'auto' || camera.moving || !betweenTurns()) { retryAge = 0; return; }
  // A crossing (or the walk to the grove) that found its way blocked has nothing for the child to tap: after about 3 s of a still camera it tries again by itself
  // (the staging spot or the grove carries the finger meanwhile, see refreshControls). Lift, roll and the bark are tapped again by the child.
  if (story.automatic && story.available && blockedAuto !== null && blockedAuto === story.action) {
    // (counted while the child could act: a script that still holds the camera, such as Mosi finishing his walk over the bridge, does not count)
    retryAge = camera.held || camera.worldInputEnabled === false ? 0 : retryAge + dt;
    if (retryAge >= RETRY_AFTER) { blockedAuto = null; retryAge = 0; }
  } else retryAge = 0;
  if (story.automatic && story.available && blockedAuto !== story.action) {
    if (autoStep !== story.action) { autoStep = story.action; autoAge = 0; }
    autoAge += dt;
    if (autoAge >= .7) launchAction(story.action);
  } else { autoStep = null; autoAge = 0; }
}
// The bubbles are up while the rules wait for a pick and the camera holds still (never during a cut or a glide);
// a pause leaves them where they are (the pause dialog covers them, and a pick waits for play).
function whoVisible() {
  const state = bridge.getState(), camera = cameraState();
  return Boolean(world && started && state.asking && !state.failing && !state.active && camera.mode === 'auto' && !camera.moving && !camera.held && camera.worldInputEnabled !== false);
}
// A tap on an obstacle: "Hver getur þetta?" with the bubbles, or one of Mosi's hints.
function askObstacle(id) {
  const answer = bridge.ask(id); if (!answer) return;
  audio.unlock(); music.unlock(); speech.stop(); captionUntil = 0;
  if (answer.kind === 'not-yet') { caption(VOICE_LINES.notYet.text, 2.6); speech.play('notYet'); world.mosiGesture?.('shake-head'); }
  else if (answer.kind === 'find-first') { caption(VOICE_LINES.findFirst.text, 2.6); speech.play('findFirst'); world.mosiGesture?.('shake-head'); }
  else if (answer.kind === 'start') {
    // A together step (step-rules.js: everyone at once): no bubbles and no pair to pick; its scene plays at the tap, and the step is
    // given back when the scene cannot begin.
    noteInput(); syncBridge();
    if (world.playStep(answer.action, {}) === null) bridge.cancel(answer.action);
    syncBridge(); caption(currentStory().prompt); reflectEnding(); return;
  }
  else { caption(VOICE_LINES.who.text, 2.6); speech.play('who'); }
  syncBridge(); reflectEnding();
}
// A tap on a bubble: the right pair starts its task, a wrong one has its funny go first.
function pickFriend(species) {
  if (held() || !whoVisible()) return;
  const ready = world.getPairReadiness?.() ?? {};
  if (!bridge.getState().unlocked.every(name => ready[name])) return; // a pair is still hopping home
  const target = bridge.getState().asking, result = bridge.pick(species);
  if (!result) return;
  noteInput(); audio.unlock(); music.unlock(); speech.stop(); captionUntil = 0;
  if (result.kind === 'fail') {
    if (!world.startFail(species, target)) bridge.failDone();
  } else {
    syncBridge();
    if (world.playStep(result.action, { species }) === null) bridge.cancel(result.action);
  }
  // Mosi's bubble follows at once (the script's shots hold the camera, so guidance() would wait).
  syncBridge(); caption(currentStory().prompt); reflectEnding();
}
// A face in the bubbles tapped: a tap's sound, then the pick (the playthrough's child takes the same path, window.__memory.choose).
function tapFriend(species) { uiSound('tap'); pickFriend(species); }
// After a wrong friend's go the bubbles come back, unless no friend in them can do it: then Mosi sends the child
// back to the leaves.
function failDone() {
  if (!bridge.failDone()) return;
  const state = bridge.getState();
  if (state.asking && !state.candidates.includes(OBSTACLES[state.asking].species)) { bridge.dismiss(); caption('Finnum fleiri vini undir laufunum!', 2.8); }
  syncBridge(); reflectEnding();
}
// The ending card comes when the round is won and the celebration (a script) is over; the round always ends with all three gifts.
const levelDone = () => bridge.getState().phase === 'complete'; // every step of the level is done
const endingDue = () => game.getState().phase === 'won' && levelDone() && !bridge.getState().active && !world?.sceneBusy();
function reflectGifts() {
  const total = giftTotal(), row = $('ending-gifts');
  row.hidden = !total || game.getState().found.length < total;
  if (!row.hidden) $('ending-gifts-text').textContent = VOICE_LINES[LINES.gifts].text;
}
// The credits of the models behind the small "i" on the ending card (the level's gifts, then its open scenery): one group per model, Líkan / Leyfi / Frá as the book's cards say.
function buildCredits() {
  const make = (tag, className, text = '') => Object.assign(document.createElement(tag), { className, textContent: text });
  $('credits').replaceChildren(...[...GIFT_CREDITS.filter(row => level.gifts.includes(row.id)), ...(level.credits ?? [])].map(row => {
    const group = make('div', 'credit-group');
    for (const [label, value] of [[row.sound ? 'Hljóð' : 'Líkan', `${row.title} · ${row.author}`], ['Leyfi', row.license], ['Frá', row.source]]) {
      const line = make('p', ''); line.append(make('span', 'credit-label', label), make('span', 'credit-value', value)); group.append(line);
    }
    return group;
  }));
}
function setCredits(open) {
  $('credits').hidden = !open; $('credits-toggle').setAttribute('aria-expanded', String(open));
  // (it opens above the card: no taller than the room over it, and it scrolls when a level has more rows than that, as level 2's sixteen)
  if (open) $('credits').style.maxHeight = `${Math.max(160, Math.floor($('ending').getBoundingClientRect().top - 26))}px`;
}
function reflectEnding() {
  const state = bridge.getState();
  const won = game.getState().phase === 'won' && levelDone();
  if (won && !celebrated && !state.active) {
    celebrated = true; world.celebrate(); audio.win(); unlockNext();
  }
  const showEnding = endingDue();
  if (showEnding && $('ending').hidden) reflectGifts();
  setEnding(showEnding); $('coach').hidden = !started || showEnding || captionCleared;
  $('cancel-choice').hidden = !whoVisible();
  $('holding').hidden = !started || !holding(state) || levelDone() || Boolean(state.active);
}
// The ending card shown or put away. (#9) The first time in a round: paper confetti over the last picture (not under less motion), and
// Litla Yatzy's fanfare with its confetti's rustle. (#10) The card springs up from below as it shows (minnisspil.css .ending).
function setEnding(visible) {
  if ($('ending').hidden === !visible) return;
  $('ending').hidden = !visible;
  if (visible && !endingCheered) { endingCheered = true; uiSound('win', { winner: 'you' }); hudFx.confetti($('confetti')); }
}
function accept(events) {
  for (const event of events) {
    if (event.type === 'reveal') {
      // The leaf and the friend's call come from the reveal script (scene-sound below).
      const id = event.ids[0]; world.reveal(id); speech.stop();
      // A gift's first leaf asks for the other half in its own words ("Snjáldurmús! Hvar er hin?"); a second one only names it.
      const gift = event.item ? GIFT_ITEMS[event.item] : null;
      caption(gift ? (game.getState().selected.length > 1 ? `${gift.name}!` : gift.seek) : `${roster[event.species]}! Hvar er vinur hans?`, .8);
    } else if (event.type === 'gift') {
      // Both animals rise from their leaves and fly to the basket together (the world; the count follows on landing: scene-basket).
      if (!world.foundGift(event.ids)) giftLanded(); // (a pair the world cannot show still counts: the crossing waits for the basket)
      const gift = GIFT_ITEMS[event.item];
      caption(gift?.caption ?? 'Gjöf!', 3.4); if (gift) speech.play(gift.voice);
    } else if (event.type === 'conceal') {
      world.conceal(event.ids); audio.conceal(); caption('Úps! Kíkjum annars staðar.', .65);
    } else if (event.type === 'match') {
      // The match script plays the chime, the call and Mosi's line at their moments (scene-sound, scene-say).
      world.match(event.ids, event.nestIndex, event.species);
      // (his bubble has the words he says a moment later: `match`, the caption matches the voice)
      nestSpecies[event.nestIndex] = event.species; caption(VOICE_LINES.match.text, 3.4);
      if (bridge.unlock(event.species)) syncBridge();
    } else if (event.type === 'won') {
      guidance(); reflectEnding();
    }
  }
  if (events.length) reflectProgress(game.getState());
  refreshControls();
}
function choose(id) {
  if (!world || held()) return;
  // While the bubbles are open (or a wrong friend is trying) a leaf tap is ignored: "Aftur" closes them.
  if (bridge.getState().asking) return;
  if (bridge.getState().active || bridge.getState().failing || !targetAvailable('leaf', id)) return;
  const state = game.getState();
  if (!['ready', 'one-open'].includes(state.phase) || state.cards.find(card => card.id === id)?.status !== 'hidden') return;
  if (world.giftBusy?.()) return; // a pair of gifts is still flying to the basket: a tap waits, as it does while a match plays
  audio.unlock(); music.unlock(); accept(game.pick(id));
}
function chooseNest(index) {
  if (!world || held() || bridge.getState().asking) return;
  if (!betweenTurns() || bridge.getState().active || bridge.getState().failing || !nestSpecies[index] || !targetAvailable('nest', index)) return;
  // A pair at home greets the child; they are chosen for work from the bubbles, not here.
  speech.stop(); audio.unlock(); music.unlock(); if (world.playNest(index)) audio.nest(nestSpecies[index], index);
}
function actionFor(id) {
  return travelAt(id)?.id ?? null;
}
function mayTask(id) {
  const action = actionFor(id);
  return action !== null && bridge.can(action);
}
function chooseTask(id) {
  if (!world || held()) return;
  const target = world.getTargets().find(value => value.type === 'task' && value.id === id);
  // The tap-along: the script under the still shot takes the tap.
  if (target?.tapAlong) { noteInput(); world.tapScene(id); return; }
  // The bubbles are open: another obstacle (or the same one again) waits until they are closed or answered.
  if (bridge.getState().asking) return;
  if (!betweenTurns() || !targetAvailable('task', id)) return;
  noteInput();
  if (Object.hasOwn(OBSTACLES, id)) { askObstacle(id); return; }
  // Staging and grove: a crossing that found its way blocked starts again from here (not while gifts are left: Mosi says so).
  if (travelAt(id)?.waitsForGifts && bridge.can(actionFor(id)) && giftsToLand() > 0) { sayGiftsLeft(); return; }
  if (mayTask(id)) launchAction(actionFor(id));
}
// A tap on the staging spot with gift leaves still shut: Mosi says what is left. With every pair found and the last on its way to the
// basket there is nothing to say (the crossing starts by itself when it lands).
function sayGiftsLeft() {
  if (giftsUnfound() === 0) return;
  speech.stop(); captionUntil = 0; caption(VOICE_LINES[LINES.giftsLeft].text, 3.2); speech.play(LINES.giftsLeft); world.mosiGesture?.('shake-head');
}
function cancelChoice() {
  if (held() || !bridge.dismiss()) return;
  syncBridge(); guidance(); reflectEnding();
}
function refreshControls() {
  if (!world) return;
  const state = game.getState();
  const task = bridge.getState();
  const story = currentStory();
  const camera = cameraState();
  const overview = camera.mode === 'overview';
  $('game').dataset.playing = String(started);
  $('game').dataset.busy = String(Boolean(task.active || task.failing));
  $('game').dataset.camera = overview ? 'overview' : camera.moving ? 'moving' : 'play';
  $('game').dataset.motion = reducedMotion ? 'reduced' : 'full';
  reflectWho();
  const finished = endingDue();
  if (finished && $('ending').hidden) reflectGifts();
  $('coach').hidden = !started || finished || overview || captionCleared;
  setEnding(finished && !overview);
  // Mosi's button: from the start of the round, not over the welcome card or the ending card.
  const mosiHidden = !started || finished || $('welcome').open; if ($('mosi-help').hidden !== mosiHidden) $('mosi-help').hidden = mosiHidden;
  const worldInput = !camera.moving && camera.worldInputEnabled !== false && !overview;
  // With the bubbles open (or a wrong friend trying) the leaves, homes and other obstacles wait.
  const choosing = Boolean(task.asking || task.failing);
  const mayPick = !held() && worldInput && !task.active && !choosing && ['ready', 'one-open'].includes(state.phase) && !world.giftBusy?.();
  const mayExplore = canExplore(task, camera);
  // After IDLE_HINT seconds without a tap the finger shows on what to tap (.is-guided, minnisspil.css .tap-hint).
  const hesitating = mayExplore && idleTime >= IDLE_HINT && story.available && !story.automatic;
  // A blocked crossing (or walk to the grove) starts again by itself in a moment: its place carries the finger while it waits.
  const retrying = mayExplore && story.automatic && story.available && blockedAuto !== null && blockedAuto === story.action;
  // With gifts left the finger points at a shut leaf (the first one in the deck's order, which is shuffled: it says nothing about what is under it).
  const guidedLeaf = story.leaf && hesitating ? state.cards.find(card => card.status === 'hidden')?.id : undefined;
  const visibleKeys = new Set();
  let tapAlongOn = false;
  for (const target of world.getTargets()) {
    const key = `${target.type}-${target.type === 'nest' ? target.index : target.id}`;
    visibleKeys.add(key);
    let button = buttons.get(key);
    if (!button) {
      button = document.createElement('button'); button.type = 'button'; button.className = 'world-target';
      button.dataset.target = key;
      button.addEventListener('click', () => target.type === 'leaf' ? choose(target.id) : target.type === 'task' ? chooseTask(target.id) : chooseNest(target.index));
      if (target.type === 'task') { button.classList.add('task-target'); button.innerHTML = `<span class="task-badge">${level.targets[target.id]?.icon ?? ''}</span>`; }
      // The tap hint, shown while the button is .is-guided: a ring closing onto it under a drawn finger (Litla Yatzy's, engine/yatzy-junior/game.js).
      if (target.type !== 'nest') button.insertAdjacentHTML('beforeend', TAP_HINT);
      $('targets').append(button); buttons.set(key, button);
    }
    button.style.left = `${target.x}px`; button.style.top = `${target.y}px`;
    // (an obstacle is an 88 px button, as the small games' are; a leaf keeps 44 px at least, the world sizes it)
    const least = target.type === 'task' ? 88 : 44;
    button.style.width = `${Math.max(least, target.width)}px`; button.style.height = `${Math.max(least, target.height)}px`;
    // (the finger never points at an obstacle whose scene is not built yet, the world says `unbuilt`: level 2's tunnel in Task 3)
    button.classList.toggle('is-guided', target.type === 'leaf' ? target.id === guidedLeaf : target.type === 'task' && target.id === story.target && !target.unbuilt && (hesitating || retrying));
    if (target.type === 'leaf') {
      const card = state.cards.find(card => card.id === target.id);
      button.disabled = !mayPick || card?.status !== 'hidden' || target.enabled === false;
      // Hidden species and gifts must never leak through accessible names.
      button.setAttribute('aria-label', `Lauf ${target.id + 1}${card?.status === 'open' ? `, ${card.item ? GIFT_ITEMS[card.item]?.name : roster[card.species]}` : card?.status === 'matched' ? ', tómt' : card?.status === 'found' ? ', fundið' : ', lokað'}`);
    } else if (target.type === 'task') {
      // Obstacles can always be asked about (Mosi answers); staging and grove only retry a blocked crossing.
      const obstacle = Object.hasOwn(OBSTACLES, target.id), available = obstacle || mayTask(target.id);
      // The tap-along ring stays drawn through a pause; only its taps wait for play.
      const tapAlong = Boolean(target.tapAlong) && target.enabled !== false;
      tapAlongOn ||= tapAlong;
      button.disabled = tapAlong ? held() : !mayExplore || !available || target.enabled === false;
      button.classList.toggle('tap-along', tapAlong);
      // The next obstacle shows its badge from the start (.is-ahead: plain, and a tap asks about it), and glows and pulses (.is-next)
      // only once a found pair at home can do it: the story's moment is its work (the audit's #4: no glow on what cannot be done yet).
      const next = Boolean(target.next) && mayExplore && target.enabled !== false, doable = story.kind === 'work' && story.target === target.id;
      button.classList.toggle('is-next', next && doable); button.classList.toggle('is-ahead', next && !doable);
      button.classList.toggle('choice-visible', !obstacle && available && mayExplore && target.enabled !== false && !(travelAt(target.id)?.waitsForGifts && giftsToLand() > 0) || target.id === story.target && !target.unbuilt && (hesitating || retrying));
      button.setAttribute('aria-label', tapAlong ? 'Ýttu til að hjálpa!' : level.targets[target.id]?.label);
    } else {
      const species = nestSpecies[target.index];
      button.disabled = !mayExplore || !species || target.enabled === false;
      button.classList.remove('pair-ready', 'pair-selected');
      button.setAttribute('aria-label', species ? `Leika við vinaparið: ${roster[species]}` : `Hreiður ${target.index + 1}, tómt`);
    }
  }
  for (const [key, button] of buttons) if (!visibleKeys.has(key)) {
    button.disabled = true; button.classList.remove('choice-visible', 'pair-ready', 'pair-selected', 'is-next', 'is-ahead', 'is-guided', 'tap-along');
  }
  // The picker asks, or a tap-along runs: the chip and the pause dim, so the child's eye is on what to tap.
  const choosingNow = String(whoVisible() || tapAlongOn); if ($('game').dataset.choosing !== choosingNow) $('game').dataset.choosing = choosingNow;
}
// The "who" bubbles over the obstacle that was asked about: a portrait button for each candidate, popping in.
const whoButtons = new Map();
function reflectWho() {
  const box = $('who'), state = bridge.getState(), visible = whoVisible();
  // "Aftur" goes with the bubbles, every frame: after a wrong friend's go the bubbles come back a frame or two after the event that closed them.
  const cancel = $('cancel-choice'); if (cancel.hidden === visible) cancel.hidden = !visible;
  if (!visible) { if (!box.hidden) box.hidden = true; whoShown = false; return; }
  const row = box.querySelector('.who-row'), wanted = state.candidates;
  if (!whoShown || row.children.length !== wanted.length || [...row.children].some((button, i) => button.dataset.species !== wanted[i])) {
    row.replaceChildren(...wanted.map((species, i) => {
      let button = whoButtons.get(species);
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.className = 'who-friend'; button.dataset.species = species;
        button.setAttribute('aria-label', pairs[species].label);
        button.innerHTML = `<span class="who-face"><img src="./assets/memory/portraits/${species}.webp" alt="" width="512" height="384" draggable="false"></span><span class="who-name">${pairs[species].name}</span>`;
        button.addEventListener('click', () => tapFriend(species));
        whoButtons.set(species, button);
      }
      button.style.setProperty('--i', String(i));
      return button;
    }));
  }
  if (!whoShown) {
    // Popping in again restarts the animation; the friends who may answer bounce, keen.
    box.hidden = false; box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
    whoShown = true; world.eager(wanted); uiSound('bubble');
  }
  const target = world.getTargets().find(value => value.type === 'task' && value.id === state.asking);
  const width = box.offsetWidth, height = box.offsetHeight, W = $('game').clientWidth, H = $('game').clientHeight;
  // "Aftur" sits on the card's corner, partly outside it (its offsets, unlike its box, are not scaled by the pop): the two are kept on the screen together.
  const backLeft = cancel.offsetLeft + box.clientLeft, backTop = cancel.offsetTop + box.clientTop;
  const out = { left: Math.max(0, -backLeft), top: Math.max(0, -backTop), right: Math.max(0, backLeft + cancel.offsetWidth - width), bottom: Math.max(0, backTop + cancel.offsetHeight - height) };
  // Between the top band (the chip and the pause) and Mosi's bubble or his button, whichever reaches higher.
  const tops = [$('coach'), $('mosi-help')].map(element => element.hidden ? null : element.getBoundingClientRect()).filter(rect => rect && rect.height > 0).map(rect => rect.top);
  const top = document.querySelector('.topbar').getBoundingClientRect().bottom + 8 + out.top, bottom = Math.min(H, ...tops) - 8 - out.bottom;
  const x = target?.x ?? W / 2, y = target?.y ?? H / 2;
  let place = y - height - 34;
  if (place < top) place = y + 38;
  place = Math.max(top, Math.min(place, bottom - height));
  box.style.left = `${Math.round(Math.max(12 + out.left, Math.min(W - width - 12 - out.right, x - width / 2)))}px`; box.style.top = `${Math.round(place)}px`;
  box.style.setProperty('--tail', `${Math.round(Math.max(18, Math.min(width - 18, x - parseFloat(box.style.left))))}px`);
  box.classList.toggle('below', place > y);
}
function start({ restart = false } = {}) {
  if (!world) return;
  for (const dialog of dialogs) if (dialog.open) dialog.close();
  // setBoard cancels every running script, shot and gesture before the new board is laid out.
  if (restart) { game.restart(); bridge.restart(); celebrated = false; giftsLeftSaid = false; nestSpecies.length = 0; basketCount = 0; world.setBoard(game.getState().cards); syncBridge(); speech.reset(); music.restart(); }
  // (the page's stars, pops, confetti and sounds of the round before go at once: no star lands in a dot of the new round)
  ui.cancel(); juice.cancel(); hudFx.cancel(); $('confetti').hidden = true; $('confetti').replaceChildren();
  dotsLanded = 0; starQueued = null; starFlying = false; dotsLate = 0; endingCheered = false;
  // (#10) A round of this level begun: it is not new any more (its «Nýtt!» goes from the cards)
  if (isNewLevel(level, locked)) { markPlayed(level); reflectPicker(); }
  started = true; userPaused = false; phaseBefore = ''; audio.cancel(); speech.stop();
  autoStep = null; autoAge = 0; blockedAuto = null; retryAge = 0; storyKey = ''; captionUntil = 0; captionCleared = false; idleTime = 0; whoShown = false;
  // (a new round: Mosi has repeated nothing in it yet)
  repeatedKey = null; voiceQuiet = 0;
  $('who').hidden = true; $('beat-word').classList.remove('show');
  $('coach').hidden = false; $('ending').hidden = true; $('ending-gifts').hidden = true; $('progress').hidden = false; setCredits(false);
  // (the round's first words in his bubble are the welcome he says: level 1's `welcome`, level 2's `g2_welcome`; a restart has no welcome)
  if (restart) caption(currentStory().prompt); else caption(VOICE_LINES[LINES.welcome].text, WELCOME_HOLD);
  reflectProgress(game.getState()); reflectBasket(); reflectEnding(); syncPause(); audio.unlock(); music.unlock();
  if (!restart) speech.play(LINES.welcome);
}
function openDialog(id) {
  if (!world || !started || busyDialog()) return false;
  $(id).showModal(); syncPause(); return true;
}
function frame(timestamp) {
  if (disposed) return;
  const dt = lastFrame ? Math.min(.05, Math.max(0, (timestamp - lastFrame) / 1000)) : 0;
  lastFrame = timestamp;
  if (world) {
    const frozen = held();
    if (!frozen) {
      time += dt;
      const camera = cameraState();
      if (camera.mode !== 'auto' || !camera.moving) accept(game.advance(dt));
      const phase = game.getState().phase, task = bridge.getState();
      // Hesitation counts only while the child could act (not during a script, a task or with the bubbles open).
      if (betweenTurns() && !task.active && !task.failing && !task.asking && camera.worldInputEnabled !== false && !camera.moving && !world.sceneBusy()) idleTime += dt; else idleTime = 0;
      if (phase === 'one-open' && phaseBefore !== phase && time >= captionUntil) caption(seekLine() ?? 'Hvar er vinur hans?');
      if (['ready', 'won'].includes(phase) && phaseBefore !== phase) guidance();
      phaseBefore = phase;
    }
    const bridgeState = bridge.getState(), camera = cameraState();
    speech.update(frozen ? 0 : dt, camera.mode === 'auto' && camera.moving);
    world.setMosiSpeech?.(speech.amplitude());
    const voice = speech.isPlaying(), action = Boolean(bridgeState.active);
    if (uiDucked !== voice) { uiDucked = voice; ui.duck(voice); }
    // (#8) His face on his button moves with his voice: a little bigger, and a little tilt to and fro (still under less motion).
    talk += ((reducedMotion || $('mosi-help').hidden ? 0 : speech.amplitude()) - talk) * Math.min(1, dt * 14);
    const talkNow = talk < .01 ? '' : `${(1 + talk * .07).toFixed(3)}|${(Math.sin(timestamp / 1000 * 13) * talk * 5).toFixed(1)}deg`;
    if (talkNow !== talkWritten) {
      talkWritten = talkNow; const [grow, tilt] = talkNow.split('|');
      if (talkNow) { $('mosi-help').style.setProperty('--talk-scale', grow); $('mosi-help').style.setProperty('--talk-tilt', tilt); }
      else { $('mosi-help').style.removeProperty('--talk-scale'); $('mosi-help').style.removeProperty('--talk-tilt'); }
    }
    music.update(dt, { speech: voice, action, stage: level.music(bridgeState) });
    audio.duck?.(voice); audio.river(!frozen, voice || action);
    world.update(frozen ? 0 : dt, time);
    for (const event of world.pollStepEvents()) {
      if (event.type === 'scene-sound') playSceneSound(event);
      else if (event.type === 'scene-say') { if (event.clear) clearCaption(); else sayLine(event.line, event); }
      else if (event.type === 'scene-basket') { giftLanded(); reflectEnding(); }
      else if (event.type === 'footstep') audio.footstep?.(event.surface, event.pan);
      else if (event.type === 'fail-done') failDone();
      else if (event.type === 'bridge-complete') {
        if (bridge.complete(event.id)) { syncBridge(); reflectEnding(); guidance(); }
      } else if (event.type === 'bridge-blocked') {
        if (bridge.cancel(event.id, { branch: event.branch })) {
          blockedAuto = event.id; autoStep = null; autoAge = 0; retryAge = 0;
          speech.stop(); audio.cancel(); syncBridge(); reflectEnding();
          showEventCaption(event);
        }
      } else {
        // The level's own events (the world's task events): the big word of a beat, what it sounds like, what Mosi's bubble says.
        if (event.type === 'beat') showBeatWord(event);
        playEventSounds(event); showEventCaption(event);
      }
    }
    updateStory(frozen ? 0 : dt);
    // (#7) The star of a found pair flies a moment after the match script's cut; a dot owed with no star and no script is filled all the same.
    if (!frozen) {
      if (starQueued && (starQueued.wait -= dt) <= 0) launchStar();
      if (!starQueued && !starFlying && dotsLanded < game.getState().matchedPairs && !world.sceneBusy()) { dotsLate += dt; if (dotsLate > 1.5) landDot(); } else dotsLate = 0;
    }
    // Mosi's repeat of the moment's instruction after a long wait (never while the game is held).
    if (!frozen) { voiceQuiet = speech.isPlaying() ? 0 : voiceQuiet + dt; repeatMoment(); }
    refreshControls();
    statsFrame++; // (window.__demoStats is built when QA reads it: see below)
  }
  raf = requestAnimationFrame(frame);
}

const speech = createMemorySpeech({ clock: () => time, counts: COUNT_TAKES });
const music = createMemoryMusic();
applyLevelDom();
// (the motion the world and the tap hint use: calm when the tablet asks for it, until "Rólegri hreyfing" says otherwise; Mosi's button waits for the round)
$('game').dataset.motion = reducedMotion ? 'reduced' : 'full'; $('mosi-help').hidden = true;
// (every button taps as it is pressed: Litla Yatzy's page sounds, uiSound)
$('start').addEventListener('click', () => { uiSound('tap'); start(); });
// Any tap on the game counts as the child doing something (the finger and Mosi's repeat wait for hesitation).
$('game').addEventListener('pointerdown', noteInput);
$('again').addEventListener('click', () => { start({ restart: true }); uiSound('tap'); });
$('ending-next').addEventListener('click', () => { const link = endingLink(); uiSound('tap'); if (link) goToLevel(link.item); });
$('credits-toggle').addEventListener('click', () => { uiSound('tap'); setCredits($('credits').hidden); });
$('cancel-choice').addEventListener('click', () => { uiSound('close'); cancelChoice(); });
$('mosi-help').addEventListener('click', pressMosi);
$('restart').addEventListener('click', () => { start({ restart: true }); uiSound('tap'); });
$('pause').addEventListener('click', () => { if (openDialog('pause-dialog')) uiSound('dialog', { id: 'pause-dialog' }); });
$('retry').addEventListener('click', () => location.reload());
$('motion').setAttribute('aria-pressed', String(reducedMotion));
$('motion').addEventListener('click', () => {
  uiSound('tap');
  reducedMotion = !reducedMotion; $('motion').setAttribute('aria-pressed', String(reducedMotion)); $('game').dataset.motion = reducedMotion ? 'reduced' : 'full';
  world?.setReducedMotion?.(reducedMotion);
});
// (the pause card's "Halda áfram", and Escape on it, sound as the game goes on: Litla Yatzy's resume)
document.querySelectorAll('[data-resume]').forEach(button => button.addEventListener('click', () => { const dialog = button.closest('dialog'); uiSound('dialogClose', { id: dialog.id }); dialog.close(); }));
for (const dialog of dialogs) {
  dialog.addEventListener('close', syncPause);
  dialog.addEventListener('cancel', event => { if (dialog.id === 'welcome') event.preventDefault(); else uiSound('dialogClose', { id: dialog.id }); });
}
document.addEventListener('visibilitychange', syncPause);
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !busyDialog()) cancelChoice(); });
window.addEventListener('resize', () => { world?.resize($('world').clientWidth, $('world').clientHeight); refreshControls(); });
window.addEventListener('pagehide', () => { userPaused = true; syncPause(); });
window.addEventListener('pageshow', event => { if (event.persisted) { userPaused = false; syncPause(); } });

// QA reads window.__demoStats (the playthrough and the check tools). The world's debug object walks every friend and copies the idle log, so it is built
// when it is read, at most once a frame, and not on every frame. The anatomical envelopes are sampled explicitly by QA (window.__memory.stats({ collision: true })).
let statsFrame = 0, statsBuilt = -1, statsCache;
Object.defineProperty(window, '__demoStats', { configurable: true, get() { if (statsBuilt !== statsFrame || !statsCache) { statsCache = world?.getDebug({ collision: false }); statsBuilt = statsFrame; } return statsCache; } });
window.__memory = {
  state: () => game.getState(), basket: () => basketCount, giftsLeft: () => ({ toLand: giftsToLand(), unfound: giftsUnfound() }), stats: options => world?.getDebug(options), audio: () => ({ ...audio.getStats(), music: music.getStats(), speech: speech.getStats(), ui: { ...ui.getStats(), asked: uiAsked.slice() } }),
  dots: () => dotsLanded,
  // Each tap-along beat: { t, wall, id, index, word, take (null for a word he does not count), said, over (the sentence that kept a count silent) }.
  beats: () => beatLog.map(beat => ({ ...beat })),
  targets: () => world?.getTargets(),
  bridge: () => bridge.getState(), task: chooseTask,
  // The playthrough's child: tap an obstacle, pick a friend from the bubbles, tap along (the same paths as the buttons).
  ask: chooseTask, choose: tapFriend, tap: chooseTask,
  who: () => ({ open: whoVisible(), asking: bridge.getState().asking, candidates: [...bridge.getState().candidates] }),
  story: () => currentStory(), idle: () => idleTime,
  camera: setCameraMode,
  start: () => start(), pick: choose, nest: chooseNest,
  restart: () => start({ restart: true }),
  pause(value) { userPaused = Boolean(value); syncPause(); },
  // Mosi's button (the same path as a tap on it), and the instruction it and the repeat would say: { id, key } (id null when the moment has none).
  askMosi: pressMosi, lastLine: () => { const moment = momentNow(); return { id: momentLine(moment), key: moment.key }; },
};
window.__memoryReady = false;
try {
  const soundReady = Promise.allSettled([speech.ready, music.ready, audio.preload?.()]);
  // (the basket's picture: level 1's berry basket, or the level's own render: level 2's fossil)
  const basketIcon = level.hud?.basket ? `<img src="${level.hud.basket}" alt="" width="48" height="48" decoding="async">` : BASKET_ICON;
  $('basket').querySelector('.basket-icon').innerHTML = basketIcon; $('ending-gifts').querySelector('.basket-icon').innerHTML = basketIcon; buildCredits();
  world = await createMemoryWorld({ canvas: $('world'), onProgress: text => { $('loading-copy').textContent = text; }, basketPoint, level });
  await soundReady;
  world.setBoard(game.getState().cards); syncBridge(); world.setReducedMotion?.(reducedMotion);
  world.resize($('world').clientWidth, $('world').clientHeight); world.update(0, 0);
  $('loading').hidden = true; window.__memoryReady = true;
  if (params.get('play') === '1') start(); else { $('welcome').showModal(); syncPause(); }
  raf = requestAnimationFrame(frame);
} catch (error) {
  console.error('Memory game could not initialize:', error);
  $('loading').hidden = true; $('error').hidden = false;
  $('error-copy').textContent = 'Ekki tókst að hlaða öllum hlutum leiksins. Prófaðu aftur.';
  world?.dispose(); audio.dispose(); speech.dispose(); music.dispose(); ui.dispose(); hudFx.cancel();
}
