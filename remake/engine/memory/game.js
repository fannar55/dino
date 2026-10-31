import { createMemoryGame } from './rules.js';
import { createMemoryWorld } from './world.js';
import { createMemoryAudio, soundscapeUrl } from './audio.js';
import { createStepRules, obstaclesOf } from './step-rules.js';
import { LEVELS, chooseLevel, unlockLevel } from './levels/index.js';
import { createMemoryMusic, createMemorySpeech } from './presentation-audio.js';
import { nextStoryStep } from './playful-flow.js';
import { GIFT_ITEMS, GIFT_CREDITS } from './surprise-items.js';
import { VOICE_LINES } from './voice-lines.js';
import { BASKET_ICON } from '../scene/ui.js';

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
const CAPTIONED = new Set(['who', 'other', 'together', 'push', 'findFirst', 'notYet', 'lift', 'build', 'won', 'gifts3', 'giftsLeft', 'gifts4', 'g2_left']);
// How long a line's words stay up in his bubble when a script says it (seconds; the others 2.6).
const CAPTION_HOLD = { won: 5.8, gifts3: 3.4, gifts4: 3.4, giftsLeft: 3.2, g2_left: 3.2 };
const IDLE_ARROW = 5; // seconds of no input before the gold arrow points at the next obstacle
const RETRY_AFTER = 3; // seconds the camera is still before a blocked crossing (or walk to the grove) tries again by itself
const seeded = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const game = createMemoryGame({ ...(params.has('seed') ? { random: seeded(Number(params.get('seed')) || 251025) } : {}), species: level.friends, gifts: level.gifts });
// (a level may add a soundscape of its own to the shared one: levels/*.js `soundscape`)
const audio = createMemoryAudio({ extraManifests: level.soundscape ? [soundscapeUrl(level.soundscape)] : [] });
const bridge = createStepRules(level);
const buttons = new Map();
const nestSpecies = [];
let world, started = false, userPaused = false, time = 0, lastFrame = 0, raf = 0, disposed = false, phaseBefore = '';
let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let muted = false;
let celebrated = false;
let autoStep = null, autoAge = 0, blockedAuto = null, retryAge = 0, storyKey = '', captionUntil = 0;
let giftsLeftSaid = false; // Mosi has said `giftsLeft` for this wait
let idleTime = 0, whoShown = false; // game seconds since the child last tapped; whether the bubbles are on screen
let basketCount = 0; // gift pairs that have flown into the basket in the ribbon
try { muted = localStorage.getItem('mosi.memory.muted.v1') === 'true'; } catch {}
const dialogs = [$('welcome'), $('pause-dialog'), $('help-dialog')];
const busyDialog = () => dialogs.some(dialog => dialog.open);
const held = () => !started || userPaused || document.hidden || busyDialog();
function syncPause() {
  const paused = held(); game.pause(paused); audio.pause(paused); $('game').dataset.paused = String(paused);
  speech.pause(paused, { force: !started || userPaused || document.hidden }); music.pause(paused);
  refreshControls();
}
function caption(text, hold = 0) { if ($('caption').textContent !== text) $('caption').textContent = text; if (hold) captionUntil = time + hold; }
function setMute(value) {
  muted = Boolean(value); audio.mute(muted); speech.mute(muted); music.mute(muted);
  $('sound').setAttribute('aria-pressed', String(muted));
  $('sound').setAttribute('aria-label', muted ? 'Kveikja á hljóði' : 'Slökkva á hljóði');
  const speaker = '<path d="M5 10h5l6-5v18l-6-5H5z"/>';
  $('sound').querySelector('span').innerHTML = `<svg viewBox="0 0 28 28">${speaker}${muted ? '<path d="m21 10 5 8m0-8-5 8"/>' : '<path d="M20 9c3 3 3 7 0 10m3-13c5 5 5 11 0 16"/>'}</svg>`;
  $('sound').querySelector('small').textContent = muted ? 'Hljóð af' : 'Hljóð';
  try { localStorage.setItem('mosi.memory.muted.v1', String(muted)); } catch {}
}
// The words and counts on the page come from the level (levels/*.js, `copy`, `ribbon`, `friends`, `gifts`). The markup has the same words
// for level 1, so its first paint is the markup's own: only what differs is written.
function applyLevelDom() {
  const { copy } = level;
  const text = (selector, value) => { const element = document.querySelector(selector); if (element && element.textContent !== value) element.textContent = value; };
  // A button's label is its first text node (its icon follows in a span).
  const label = (selector, value) => { const node = document.querySelector(selector)?.firstChild; if (node?.nodeType === 3 && node.nodeValue !== `${value} `) node.nodeValue = `${value} `; };
  const describe = (id, value) => { if ($(id).getAttribute('aria-label') !== value) $(id).setAttribute('aria-label', value); };
  text('.game-title span', level.ribbon);
  text('#welcome .eyebrow', copy.welcome.eyebrow); text('#welcome h2', copy.welcome.title); text('#welcome .fine', copy.welcome.fine); label('#start', copy.welcome.start);
  const intro = document.querySelector('#welcome > p:not(.fine)');
  if ([...intro.childNodes].map(node => node.nodeName === 'BR' ? '\n' : node.nodeValue).join('') !== copy.welcome.lines.join('\n')) {
    intro.replaceChildren(...copy.welcome.lines.flatMap((line, index) => (index ? [document.createElement('br'), line] : [line])));
  }
  // The line that says who is holding something up ("Þórseðlurnar halda greininni"; level 2's: the Kambeðlur and the light): its words follow the arrow.
  const holding = copy.holding && [...$('holding').childNodes].find(node => node.nodeType === 3);
  if (holding && holding.nodeValue !== ` ${copy.holding}`) holding.nodeValue = ` ${copy.holding}`;
  text('#help-dialog .eyebrow', copy.help.eyebrow); text('#help-dialog h2', copy.help.title); text('#help-dialog > p', copy.help.note); text('#help-dialog [data-resume]', copy.help.resume);
  const steps = document.querySelector('#help-dialog ol');
  if ([...steps.children].map(item => item.textContent).join('\n') !== copy.help.items.join('\n')) {
    steps.replaceChildren(...copy.help.items.map(item => Object.assign(document.createElement('li'), { textContent: item })));
  }
  text('#ending .eyebrow', copy.ending.eyebrow); text('#ending h2', copy.ending.title); text('#ending-copy', copy.ending.text); label('#again', copy.ending.again);
  text('#loading h2', copy.loading.title); text('#loading-copy', copy.loading.copy);
  describe('targets', copy.aria.targets); describe('journey', copy.aria.journey);
  // One dot for each friend pair, the counts of friends and gifts ("0 / 3 pör", "0 / 3").
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
    card.type = 'button'; card.dataset.level = item.id; card.setAttribute('aria-disabled', String(shut));
    if (here) card.setAttribute('aria-current', 'true');
    card.setAttribute('aria-label', shut ? `${item.title}, læst. ${item.copy.locked ?? ''}` : `${item.title}, borð ${item.number}${here ? ', þú ert hér' : ''}`);
    const picture = Object.assign(document.createElement('img'), { className: 'level-picture', src: `./assets/memory/levels/${item.id}.webp`, alt: '', width: 640, height: 330, draggable: false });
    const parts = [picture, make('span', 'level-number', String(item.number)), make('span', 'level-title', item.title)];
    if (shut) { parts.push(make('span', 'level-lock', '🔒')); parts.push(make('span', 'level-note', item.copy.locked ?? '')); }
    card.append(...parts);
    card.addEventListener('click', () => {
      if (shut) { card.classList.remove('nope'); void card.offsetWidth; card.classList.add('nope'); return; }
      if (here) { start(); return; }
      const next = new URLSearchParams(location.search); next.delete('play'); next.delete('bord'); if (item.number > 1) next.set('bord', String(item.number));
      const query = next.toString(); location.assign(`${location.pathname}${query ? `?${query}` : ''}`);
    });
    return card;
  });
}
function reflectPicker() { $('level-cards').replaceChildren(...levelCards()); }
// A level finished opens the next one for good (storage that does not take it leaves the next level locked: the game works either way).
function unlockNext() { if (nextLevel && unlockLevel(nextLevel.id)) { locked.delete(nextLevel.id); reflectPicker(); } }
function reflectProgress(state) {
  $('progress').setAttribute('aria-label', `${state.matchedPairs} af ${level.friends.length} pörum fundin`);
  $('progress-text').textContent = `${state.matchedPairs} / ${level.friends.length} pör`;
  $('progress').querySelectorAll('i').forEach((dot, index) => dot.classList.toggle('found', index < state.matchedPairs));
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
  reflectJourney(); refreshControls();
}
// The ribbon's steps are the level's steps that have a `journey` name: done once finished, the first one not done is the next job.
// (a level whose steps have no badges yet, level 2's before Task 4, shows no ribbon of steps)
const journeySteps = level.steps.filter(step => step.journey);
function reflectJourney() {
  const finished = new Set(bridge.getState().done);
  const current = journeySteps.findIndex(step => !finished.has(step.id));
  $('journey').querySelectorAll('[data-step]').forEach(element => {
    const index = journeySteps.findIndex(step => step.id === element.dataset.step);
    if (index < 0) return;
    const done = finished.has(journeySteps[index].id);
    element.classList.toggle('done', done); element.classList.toggle('current', current === index);
    element.setAttribute('aria-label', `${journeySteps[index].journey}${done ? ', lokið' : current === index ? ', næsta verkefni' : ''}`);
    element.querySelector('b').textContent = done ? '✓' : String(index + 1);
  });
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
}
// What the level's own events (the world's task events: a branch lifted, a log rolling, the bark placed...) sound like, said in
// the level's table (levels/*.js, eventSounds): by event type, a beat by its step ('beat:lift').
function playEventSounds(event) {
  for (const entry of level.eventSounds[event.type === 'beat' ? `beat:${event.id}` : event.type] ?? []) {
    if (typeof entry === 'string') audio[entry]();
    else if (entry.say) speech.queue(entry.say, { delay: entry.delay });
    else audio[entry.method](event[entry.arg]);
  }
}
// The words Mosi's bubble shows for an event, from the level's table (eventCaptions).
function showEventCaption(event) {
  const entry = level.eventCaptions[event.type];
  if (entry) caption(entry.by?.[event.id] ?? entry.text, entry.hold);
}
// A beat of the tap-along: its big word, the step's beatWords by the beat's number (the last one if there are more beats than words).
function showBeatWord(event) {
  const words = stepById(event.id)?.beatWords;
  if (words) showWord(words[event.index] ?? words.at(-1));
}
// A script's line for Mosi: heard, and the task lines also shown in his bubble.
// `queue`: the celebration's lines wait until what he is saying is over (the gifts line after "Allir sex komnir…").
function sayLine(line, { queue = false } = {}) {
  if (queue) speech.queue(line, { delay: .1, once: false }); else speech.play(line);
  if (CAPTIONED.has(line) && VOICE_LINES[line]) caption(VOICE_LINES[line].text, CAPTION_HOLD[line] ?? 2.6);
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
  if (step?.kind === 'travel') { speech.queue(action, { delay: .15 }); caption(VOICE_LINES[action].text, 3.2); }
  return true;
}
function updateStory(dt) {
  const story = currentStory(), camera = cameraState();
  if (captionUntil > 0 && time >= captionUntil) { captionUntil = 0; storyKey = ''; }
  if (storyKey !== story.key && time >= captionUntil && !camera.held) {
    storyKey = story.key; guidance();
    // A moment of the story that Mosi says aloud (the level's `voice`, by story key: level 2's tunnel and rockfall): once, when it comes, as the giftsLeft line is.
    if (level.voice?.[story.key]) speech.queue(level.voice[story.key], { delay: .5 });
    // The bridge is built, every friend is home and gifts are left: Mosi says so once as the wait begins (not again each time a held caption ends).
    if (story.key === 'gifts-left' && !giftsLeftSaid) { giftsLeftSaid = true; speech.queue(LINES.giftsLeft, { delay: .4, once: false }); }
  }
  if (story.key !== 'gifts-left') giftsLeftSaid = false;
  if (held() || camera.mode !== 'auto' || camera.moving || !betweenTurns()) { retryAge = 0; return; }
  // A crossing (or the walk to the grove) that found its way blocked has nothing for the child to tap: after about 3 s of a still camera it tries again by itself
  // (the staging spot or the grove carries the gold arrow meanwhile, see refreshControls). Lift, roll and the bark are tapped again by the child.
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
}
function reflectEnding() {
  const state = bridge.getState();
  const won = game.getState().phase === 'won' && levelDone();
  if (won && !celebrated && !state.active) {
    celebrated = true; world.celebrate(); audio.win(); unlockNext();
  }
  const showEnding = endingDue();
  if (showEnding && $('ending').hidden) reflectGifts();
  $('ending').hidden = !showEnding; $('coach').hidden = !started || showEnding;
  $('cancel-choice').hidden = !whoVisible();
  $('holding').hidden = !started || !holding(state) || levelDone() || Boolean(state.active);
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
      if (!world.foundGift(event.ids)) { basketCount++; reflectBasket(true); } // (a pair the world cannot show still counts: the crossing waits for the basket)
      const gift = GIFT_ITEMS[event.item];
      caption(gift?.caption ?? 'Gjöf!', 3.4); if (gift) speech.play(gift.voice);
    } else if (event.type === 'conceal') {
      world.conceal(event.ids); audio.conceal(); caption('Úps! Kíkjum annars staðar.', .65);
    } else if (event.type === 'match') {
      // The match script plays the chime, the call and Mosi's line at their moments (scene-sound, scene-say).
      world.match(event.ids, event.nestIndex, event.species);
      nestSpecies[event.nestIndex] = event.species; caption('Já! Vinirnir fundu hvor annan!', 3.4);
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
  reflectWho();
  $('camera').setAttribute('aria-pressed', String(overview));
  $('camera').setAttribute('aria-label', overview ? 'Fara nær og halda áfram að leika' : 'Sjá allt svæðið');
  $('camera').querySelector('small').textContent = overview ? 'Nær' : 'Yfirlit';
  $('overview-hint').hidden = !started || !overview;
  const finished = endingDue();
  if (finished && $('ending').hidden) reflectGifts();
  $('coach').hidden = !started || finished || overview;
  $('ending').hidden = !finished || overview;
  const worldInput = !camera.moving && camera.worldInputEnabled !== false && !overview;
  // With the bubbles open (or a wrong friend trying) the leaves, homes and other obstacles wait.
  const choosing = Boolean(task.asking || task.failing);
  const mayPick = !held() && worldInput && !task.active && !choosing && ['ready', 'one-open'].includes(state.phase) && !world.giftBusy?.();
  const mayExplore = !held() && worldInput && !task.active && !choosing && betweenTurns();
  const hesitating = mayExplore && idleTime >= IDLE_ARROW && story.available && !story.automatic;
  // A blocked crossing (or walk to the grove) starts again by itself in a moment: its place carries the gold arrow while it waits.
  const retrying = mayExplore && story.automatic && story.available && blockedAuto !== null && blockedAuto === story.action;
  // With gifts left the gold arrow points at a shut leaf (the first one in the deck's order, which is shuffled: it says nothing about what is under it).
  const guidedLeaf = story.leaf && hesitating ? state.cards.find(card => card.status === 'hidden')?.id : undefined;
  const visibleKeys = new Set();
  for (const target of world.getTargets()) {
    const key = `${target.type}-${target.type === 'nest' ? target.index : target.id}`;
    visibleKeys.add(key);
    let button = buttons.get(key);
    if (!button) {
      button = document.createElement('button'); button.type = 'button'; button.className = 'world-target';
      button.dataset.target = key;
      button.addEventListener('click', () => target.type === 'leaf' ? choose(target.id) : target.type === 'task' ? chooseTask(target.id) : chooseNest(target.index));
      if (target.type === 'task') { button.classList.add('task-target'); button.innerHTML = `<span class="task-badge">${level.targets[target.id]?.icon ?? ''}</span>`; }
      $('targets').append(button); buttons.set(key, button);
    }
    button.style.left = `${target.x}px`; button.style.top = `${target.y}px`;
    button.style.width = `${Math.max(44, target.width)}px`; button.style.height = `${Math.max(44, target.height)}px`;
    // (the gold arrow never points at an obstacle whose scene is not built yet, the world says `unbuilt`: level 2's tunnel in Task 3)
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
      button.disabled = tapAlong ? held() : !mayExplore || !available || target.enabled === false;
      button.classList.toggle('tap-along', tapAlong);
      button.classList.toggle('is-next', Boolean(target.next) && mayExplore && target.enabled !== false);
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
    button.disabled = true; button.classList.remove('choice-visible', 'pair-ready', 'pair-selected', 'is-next', 'is-guided', 'tap-along');
  }
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
        button.addEventListener('click', () => pickFriend(species));
        whoButtons.set(species, button);
      }
      button.style.setProperty('--i', String(i));
      return button;
    }));
  }
  if (!whoShown) {
    // Popping in again restarts the animation; the friends who may answer bounce, keen.
    box.hidden = false; box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
    whoShown = true; world.eager(wanted);
  }
  const target = world.getTargets().find(value => value.type === 'task' && value.id === state.asking);
  const width = box.offsetWidth, height = box.offsetHeight, W = $('game').clientWidth, H = $('game').clientHeight;
  const top = document.querySelector('.topbar').getBoundingClientRect().bottom + 8, bottom = Math.min(H - 8, $('coach').hidden ? H - 8 : $('coach').getBoundingClientRect().top - 8);
  const x = target?.x ?? W / 2, y = target?.y ?? H / 2;
  let place = y - height - 34;
  if (place < top) place = y + 38;
  place = Math.max(top, Math.min(place, bottom - height));
  box.style.left = `${Math.round(Math.max(12, Math.min(W - width - 12, x - width / 2)))}px`; box.style.top = `${Math.round(place)}px`;
  box.style.setProperty('--tail', `${Math.round(Math.max(18, Math.min(width - 18, x - parseFloat(box.style.left))))}px`);
  box.classList.toggle('below', place > y);
}
function start({ restart = false } = {}) {
  if (!world) return;
  for (const dialog of dialogs) if (dialog.open) dialog.close();
  // setBoard cancels every running script, shot and gesture before the new board is laid out.
  if (restart) { game.restart(); bridge.restart(); celebrated = false; giftsLeftSaid = false; nestSpecies.length = 0; basketCount = 0; world.setBoard(game.getState().cards); syncBridge(); speech.reset(); music.restart(); }
  started = true; userPaused = false; phaseBefore = ''; audio.cancel(); speech.stop();
  autoStep = null; autoAge = 0; blockedAuto = null; retryAge = 0; storyKey = ''; captionUntil = 0; idleTime = 0; whoShown = false;
  $('who').hidden = true; $('beat-word').classList.remove('show');
  $('coach').hidden = false; $('ending').hidden = true; $('ending-gifts').hidden = true; $('progress').hidden = false; $('journey').hidden = !journeySteps.length; setCredits(false);
  caption('Kíktu undir lauf. Hver felur sig þar?', 1.2);
  reflectProgress(game.getState()); reflectBasket(); reflectEnding(); syncPause(); audio.unlock(); music.unlock();
  if (!restart) speech.play(LINES.welcome);
}
function openDialog(id) {
  if (!world || !started || busyDialog()) return;
  if (id === 'help-dialog') speech.stop();
  $(id).showModal(); syncPause();
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
    music.update(dt, { speech: voice, action, stage: level.music(bridgeState) });
    audio.duck?.(voice); audio.river(!frozen, voice || action);
    world.update(frozen ? 0 : dt, time);
    for (const event of world.pollStepEvents()) {
      if (event.type === 'scene-sound') playSceneSound(event);
      else if (event.type === 'scene-say') sayLine(event.line, event);
      else if (event.type === 'scene-basket') { basketCount++; reflectBasket(true); reflectEnding(); }
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
    refreshControls();
    statsFrame++; // (window.__demoStats is built when QA reads it: see below)
  }
  raf = requestAnimationFrame(frame);
}

const speech = createMemorySpeech({ clock: () => time });
const music = createMemoryMusic();
setMute(muted);
applyLevelDom();
$('start').addEventListener('click', () => start());
// Any tap on the game counts as the child doing something (the gold arrow waits for hesitation).
$('game').addEventListener('pointerdown', noteInput);
$('again').addEventListener('click', () => start({ restart: true }));
$('credits-toggle').addEventListener('click', () => setCredits($('credits').hidden));
$('cancel-choice').addEventListener('click', cancelChoice);
$('camera').addEventListener('click', () => { audio.unlock(); music.unlock(); if (cameraState().mode !== 'overview') cancelChoice(); setCameraMode(cameraState().mode === 'overview' ? 'auto' : 'overview'); });
$('restart').addEventListener('click', () => start({ restart: true }));
$('sound').addEventListener('click', () => { setMute(!muted); if (!muted) { audio.unlock(); music.unlock(); } });
$('pause').addEventListener('click', () => openDialog('pause-dialog'));
$('help').addEventListener('click', () => { openDialog('help-dialog'); if ($('help-dialog').open && LINES.help) speech.play(LINES.help, 0, true); });
$('retry').addEventListener('click', () => location.reload());
$('motion').setAttribute('aria-pressed', String(reducedMotion));
$('motion').addEventListener('click', () => { reducedMotion = !reducedMotion; $('motion').setAttribute('aria-pressed', String(reducedMotion)); world?.setReducedMotion?.(reducedMotion); });
document.querySelectorAll('[data-resume]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
for (const dialog of dialogs) {
  dialog.addEventListener('close', () => { if (dialog.id === 'help-dialog') speech.stop(); syncPause(); });
  dialog.addEventListener('cancel', event => { if (dialog.id === 'welcome') event.preventDefault(); });
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
  state: () => game.getState(), basket: () => basketCount, giftsLeft: () => ({ toLand: giftsToLand(), unfound: giftsUnfound() }), stats: options => world?.getDebug(options), audio: () => ({ ...audio.getStats(), music: music.getStats(), speech: speech.getStats() }),
  targets: () => world?.getTargets(),
  bridge: () => bridge.getState(), task: chooseTask,
  // The playthrough's child: tap an obstacle, pick a friend from the bubbles, tap along (the same paths as the buttons).
  ask: chooseTask, choose: pickFriend, tap: chooseTask,
  who: () => ({ open: whoVisible(), asking: bridge.getState().asking, candidates: [...bridge.getState().candidates] }),
  story: () => currentStory(), idle: () => idleTime,
  camera: setCameraMode,
  start: () => start(), pick: choose, nest: chooseNest,
  restart: () => start({ restart: true }),
  pause(value) { userPaused = Boolean(value); syncPause(); },
};
window.__memoryReady = false;
try {
  const soundReady = Promise.allSettled([speech.ready, music.ready, audio.preload?.()]);
  $('basket').querySelector('.basket-icon').innerHTML = BASKET_ICON; $('ending-gifts').querySelector('.basket-icon').innerHTML = BASKET_ICON; buildCredits();
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
  world?.dispose(); audio.dispose(); speech.dispose(); music.dispose();
}
