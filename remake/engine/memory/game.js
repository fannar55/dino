import { createMemoryGame } from './rules.js';
import { createMemoryWorld } from './world.js';
import { createMemoryAudio } from './audio.js';
import { createBridgeAdventure, BRIDGE_OBSTACLES } from './bridge-rules.js';
import { createMemoryMusic, createMemorySpeech } from './presentation-audio.js';
import { nextStoryStep } from './playful-flow.js';
import { SURPRISE_ITEMS } from './surprise-items.js';
import { VOICE_LINES } from './voice-lines.js';
import { BASKET_ICON } from '../scene/ui.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const roster = { triceratops: 'Þríhyrna', stegosaurus: 'Kambeðla', brontosaurus: 'Þórseðla' };
// The "who" bubbles: a portrait of each pair (portraits/, cropped round in CSS) and its name.
const pairs = { triceratops: { name: 'Þríhyrnur', label: 'Þríhyrnuparið' }, brontosaurus: { name: 'Þórseðlur', label: 'Þórseðluparið' }, stegosaurus: { name: 'Kambeðlur', label: 'Kambeðluparið' } };
// Mosi's lines that also go up in his bubble when a script says them.
const CAPTIONED = new Set(['who', 'other', 'together', 'push', 'findFirst', 'notYet', 'lift']);
const IDLE_ARROW = 5; // seconds of no input before the gold arrow points at the next obstacle
const seeded = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const game = createMemoryGame(params.has('seed') ? { random: seeded(Number(params.get('seed')) || 251025) } : {});
const audio = createMemoryAudio();
const bridge = createBridgeAdventure();
const buttons = new Map();
const nestSpecies = [];
let world, started = false, userPaused = false, time = 0, lastFrame = 0, raf = 0, disposed = false, phaseBefore = '';
let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let muted = false;
let celebrated = false;
let autoStep = null, autoAge = 0, blockedAuto = null, storyKey = '', captionUntil = 0;
let idleTime = 0, whoShown = false; // game seconds since the child last tapped; whether the bubbles are on screen
let basketCount = 0; // surprises that have flown into the basket in the ribbon
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
function reflectProgress(state) {
  $('progress').setAttribute('aria-label', `${state.matchedPairs} af 3 pörum fundin`);
  $('progress-text').textContent = `${state.matchedPairs} / 3 pör`;
  $('progress').querySelectorAll('i').forEach((dot, index) => dot.classList.toggle('found', index < state.matchedPairs));
}
// The basket counts what the surprise leaves hid, as each one lands in it; hidden when this round has none.
function reflectBasket(pulse = false) {
  const total = game.getState().cards.filter(card => card.item).length, basket = $('basket');
  basket.hidden = !started || total === 0;
  $('basket-text').textContent = `${basketCount} / ${total}`;
  basket.setAttribute('aria-label', `Karfan: ${basketCount} af ${total} fundið`);
  basket.classList.toggle('full', total > 0 && basketCount >= total);
  if (pulse) { basket.classList.remove('got'); void basket.offsetWidth; basket.classList.add('got'); }
}
// Where the basket is, in canvas pixels: the world flies a surprise there.
function basketPoint() {
  const box = $('basket').getBoundingClientRect(), canvas = $('world').getBoundingClientRect();
  return box.width ? { x: box.left + box.width / 2 - canvas.left, y: box.top + box.height / 2 - canvas.top } : null;
}
const betweenTurns = () => ['ready', 'won'].includes(game.getState().phase);
const currentStory = () => nextStoryStep(game.getState(), bridge.getState(), world?.getPairReadiness?.() ?? {});
function syncBridge() {
  world?.setBridgeState(bridge.getState());
  reflectJourney(); refreshControls();
}
function reflectJourney() {
  const state = bridge.getState();
  const done = [state.branch === 'held' || state.bridgeBuilt, state.bridgeBuilt, state.boardwalkBuilt];
  const current = state.boardwalkBuilt ? -1 : state.bridgeBuilt ? 2 : state.branch === 'held' ? 1 : 0;
  $('journey').querySelectorAll('[data-step]').forEach((step, index) => {
    step.classList.toggle('done', done[index]); step.classList.toggle('current', current === index);
    step.setAttribute('aria-label', `${['Lyfta grein', 'Gera trjábrú', 'Leggja gönguleið'][index]}${done[index] ? ', lokið' : current === index ? ', næsta verkefni' : ''}`);
    step.querySelector('b').textContent = done[index] ? '✓' : String(index + 1);
  });
}
// What a script asked to be heard. The world never touches audio; game.js does.
function playSceneSound({ name, species, index = 0, nestIndex = 0 }) {
  if (name === 'reveal') audio.reveal(species, index);
  else if (name === 'call') audio.nest(species, index);
  else if (name === 'match') audio.match(species, nestIndex);
  else if (name === 'conceal') audio.conceal();
  else if (name === 'poof') audio.poof();
  else if (name === 'bonk') audio.bonk();
  else if (name === 'ding') audio.ding();
}
// A script's line for Mosi: heard, and the task lines also shown in his bubble.
function sayLine(line) {
  speech.play(line);
  if (CAPTIONED.has(line) && VOICE_LINES[line]) caption(VOICE_LINES[line].text, 2.6);
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
  if (bridge.getState().visited && !held()) speech.queue('won', { delay: .35 });
}
function launchAction(action) {
  // The crossing and the walk to the grove: they start on their own once every friend is home.
  const ready = world?.getPairReadiness?.() ?? {};
  if (!bridge.getState().unlocked.every(species => ready[species])) return false;
  if (!bridge.can(action) || !world.startBridgeTask(action)) return false;
  bridge.choose(action); autoStep = null; autoAge = 0; blockedAuto = null;
  captionUntil = 0; speech.stop(); audio.unlock(); music.unlock(); syncBridge(); guidance(); reflectEnding();
  if (action === 'cross' || action === 'finish') speech.queue(action, { delay: .15 });
  return true;
}
function updateStory(dt) {
  const story = currentStory(), camera = cameraState();
  if (captionUntil > 0 && time >= captionUntil) { captionUntil = 0; storyKey = ''; }
  if (storyKey !== story.key && time >= captionUntil && !camera.held) { storyKey = story.key; guidance(); }
  if (held() || camera.mode !== 'auto' || camera.moving || !betweenTurns()) return;
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
    const started = result.action === 'lift' ? world.playBranch() : world.startBridgeTask(result.action);
    if (!started) bridge.cancel(result.action);
  }
  // Mosi's bubble follows at once (the script's shots hold the camera, so guidance() would wait).
  syncBridge(); caption(currentStory().prompt); reflectEnding();
}
// After a wrong friend's go the bubbles come back, unless no friend in them can do it: then Mosi sends the child
// back to the leaves.
function failDone() {
  if (!bridge.failDone()) return;
  const state = bridge.getState();
  if (state.asking && !state.candidates.includes(BRIDGE_OBSTACLES[state.asking].species)) { bridge.dismiss(); caption('Finnum fleiri vini undir laufunum!', 2.8); }
  syncBridge(); reflectEnding();
}
function reflectEnding() {
  const state = bridge.getState();
  const won = game.getState().phase === 'won' && state.visited;
  if (won && !celebrated && !state.active) {
    celebrated = true; world.celebrate(); audio.win();
  }
  const showEnding = won && !state.active;
  $('ending').hidden = !showEnding; $('coach').hidden = !started || showEnding;
  $('cancel-choice').hidden = !whoVisible();
  $('holding').hidden = !started || state.branch !== 'held' || state.visited || Boolean(state.active);
}
function accept(events) {
  for (const event of events) {
    if (event.type === 'reveal') {
      // The leaf and the friend's call come from the reveal script (scene-sound below).
      const id = event.ids[0]; world.reveal(id); speech.stop();
      caption(`${roster[event.species]}! Hvar er vinur hans?`, .8);
    } else if (event.type === 'surprise') {
      // The leaf's squash and the thing's flight to the basket come from the world; the count follows on landing (scene-basket).
      world.reveal(event.ids[0]); speech.stop();
      caption(SURPRISE_ITEMS[event.item]?.caption ?? 'Óvænt!', 2.6);
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
  audio.unlock(); music.unlock(); accept(game.pick(id));
}
function chooseNest(index) {
  if (!world || held() || bridge.getState().asking) return;
  if (!betweenTurns() || bridge.getState().active || bridge.getState().failing || !nestSpecies[index] || !targetAvailable('nest', index)) return;
  // A pair at home greets the child; they are chosen for work from the bubbles, not here.
  speech.stop(); audio.unlock(); music.unlock(); if (world.playNest(index)) audio.nest(nestSpecies[index], index);
}
function actionFor(id) {
  return ({ staging: 'cross', grove: 'finish' }[id] ?? null);
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
  if (Object.hasOwn(BRIDGE_OBSTACLES, id)) { askObstacle(id); return; }
  // Staging and grove: a crossing that found its way blocked starts again from here.
  if (mayTask(id)) launchAction(actionFor(id));
}
function cancelChoice() {
  if (held() || !bridge.dismiss()) return;
  syncBridge(); guidance(); reflectEnding();
}
const taskIcons = {
  branch: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 25c8-6 13-6 22-2M7 24l-2-5m18 4 3-6"/><path class="branch-arrow" d="M16 18V5m-5 5 5-5 5 5"/></svg>',
  log: '<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="8" cy="20" rx="5" ry="7"/><path d="M8 13h16c7 0 7 14 0 14H8M14 7c4-4 10-3 13 1m-5 2 5-2-1-5"/></svg>',
  staging: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 25v-8c7-9 15-9 22 0v8M5 21h22M16 14V4m-5 5 5-5 5 5"/></svg>',
  bark: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="m7 6 20 3-2 6-20-3zM6 16l20 3-2 6-20-3zM10 7l-1 6m8-5-1 6m-6 3-1 6m8-5-1 6"/></svg>',
  grove: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="10" cy="20" r="6"/><circle cx="22" cy="20" r="6"/><circle cx="16" cy="12" r="6"/><path d="M16 6c4-5 8-5 10-3-1 4-5 5-10 3"/></svg>',
};
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
  const finished = state.phase === 'won' && task.visited && !task.active;
  $('coach').hidden = !started || finished || overview;
  $('ending').hidden = !finished || overview;
  const worldInput = !camera.moving && camera.worldInputEnabled !== false && !overview;
  const mayPick = !held() && worldInput && !task.active && task.selected === null && ['ready', 'one-open'].includes(state.phase);
  const mayExplore = !held() && worldInput && !task.active && !task.failing && betweenTurns();
  const hesitating = mayExplore && !task.asking && idleTime >= IDLE_ARROW && story.available && !story.automatic;
  const visibleKeys = new Set();
  for (const target of world.getTargets()) {
    const key = `${target.type}-${target.type === 'nest' ? target.index : target.id}`;
    visibleKeys.add(key);
    let button = buttons.get(key);
    if (!button) {
      button = document.createElement('button'); button.type = 'button'; button.className = 'world-target';
      button.dataset.target = key;
      button.addEventListener('click', () => target.type === 'leaf' ? choose(target.id) : target.type === 'task' ? chooseTask(target.id) : chooseNest(target.index));
      if (target.type === 'task') { button.classList.add('task-target'); button.innerHTML = `<span class="task-badge">${taskIcons[target.id]}</span>`; }
      $('targets').append(button); buttons.set(key, button);
    }
    button.style.left = `${target.x}px`; button.style.top = `${target.y}px`;
    button.style.width = `${Math.max(44, target.width)}px`; button.style.height = `${Math.max(44, target.height)}px`;
    button.classList.toggle('is-guided', target.type === 'task' && target.id === story.target && hesitating);
    if (target.type === 'leaf') {
      const card = state.cards.find(card => card.id === target.id);
      button.disabled = !mayPick || card?.status !== 'hidden' || target.enabled === false;
      // Hidden species must never leak through accessible names.
      button.setAttribute('aria-label', `Lauf ${target.id + 1}${card?.status === 'open' ? `, ${roster[card.species]}` : card?.status === 'matched' ? ', tómt' : card?.status === 'found' ? ', fundið' : ', lokað'}`);
    } else if (target.type === 'task') {
      // Obstacles can always be asked about (Mosi answers); staging and grove only retry a blocked crossing.
      const obstacle = Object.hasOwn(BRIDGE_OBSTACLES, target.id), available = obstacle || mayTask(target.id);
      const tapAlong = Boolean(target.tapAlong) && target.enabled !== false && !held();
      button.disabled = !tapAlong && (!mayExplore || !available || target.enabled === false);
      button.classList.toggle('tap-along', tapAlong);
      button.classList.toggle('is-next', Boolean(target.next) && mayExplore && target.enabled !== false && !task.asking);
      button.classList.toggle('choice-visible', !obstacle && available && mayExplore && target.enabled !== false || target.id === story.target && hesitating);
      button.setAttribute('aria-label', tapAlong ? 'Ýttu til að hjálpa!' : ({ branch: 'Greinin: hver getur lyft henni?', log: 'Stóri bolurinn: hver getur ýtt honum?', staging: 'Senda alla sex vinina yfir trjábrúna', bark: 'Börkurinn: hver getur lagt leið yfir mýrina?', grove: 'Senda alla vinina í berjalundinn' }[target.id]));
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
  if (restart) { game.restart(); bridge.restart(); celebrated = false; nestSpecies.length = 0; basketCount = 0; world.setBoard(game.getState().cards); syncBridge(); speech.reset(); music.restart(); }
  started = true; userPaused = false; phaseBefore = ''; audio.cancel(); speech.stop();
  autoStep = null; autoAge = 0; blockedAuto = null; storyKey = ''; captionUntil = 0; idleTime = 0; whoShown = false;
  $('who').hidden = true; $('beat-word').classList.remove('show');
  $('coach').hidden = false; $('ending').hidden = true; $('progress').hidden = false; $('journey').hidden = false;
  caption('Kíktu undir lauf. Hver felur sig þar?', 1.2);
  reflectProgress(game.getState()); reflectBasket(); reflectEnding(); syncPause(); audio.unlock(); music.unlock();
  if (!restart) speech.play('welcome');
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
      if (phase === 'one-open' && phaseBefore !== phase && time >= captionUntil) caption('Hvar er vinur hans?');
      if (['ready', 'won'].includes(phase) && phaseBefore !== phase) guidance();
      phaseBefore = phase;
    }
    const bridgeState = bridge.getState(), camera = cameraState();
    speech.update(frozen ? 0 : dt, camera.mode === 'auto' && camera.moving);
    world.setMosiSpeech?.(speech.amplitude());
    const voice = speech.isPlaying(), action = Boolean(bridgeState.active);
    music.update(dt, { speech: voice, action, stage: bridgeState.visited ? 'grove' : bridgeState.atStaging ? 'marsh' : 'glade' });
    audio.duck?.(voice); audio.river(!frozen, voice || action);
    world.update(frozen ? 0 : dt, time);
    for (const event of world.pollBridgeEvents()) {
      if (event.type === 'scene-sound') playSceneSound(event);
      else if (event.type === 'scene-say') sayLine(event.line);
      else if (event.type === 'scene-basket') { basketCount++; reflectBasket(true); }
      else if (event.type === 'footstep') audio.footstep?.(event.surface, event.pan);
      else if (event.type === 'branch-lift') audio.branchLift();
      else if (event.type === 'beat' && event.id === 'lift') { showWord('Upp!'); audio.branchLift(); }
      else if (event.type === 'fail-bump') audio.bonk();
      else if (event.type === 'fail-done') failDone();
      else if (event.type === 'branch-lower') audio.branchLower();
      else if (event.type === 'log-roll') { audio.logRoll(); speech.queue('roll', { delay: .12 }); }
      else if (event.type === 'bridge-land') audio.bridgeLand();
      else if (event.type === 'staging-arrival') audio.stagingArrival();
      else if (event.type === 'bark-pickup') { audio.barkPickup(); speech.queue('build', { delay: .12 }); }
      else if (event.type === 'bark-place') audio.barkPlace(event.panel);
      else if (event.type === 'boardwalk-complete') audio.boardwalkComplete();
      else if (event.type === 'final-arrival' || event.type === 'berry-arrival') audio.berryArrival();
      else if (event.type === 'bridge-complete' && bridge.complete(event.id)) {
        syncBridge(); reflectEnding(); guidance();
      } else if (event.type === 'bridge-blocked' && bridge.cancel(event.id, { branch: event.branch })) {
        blockedAuto = event.id; autoStep = null; autoAge = 0;
        speech.stop(); audio.cancel(); syncBridge(); reflectEnding();
        caption(['lift', 'roll'].includes(event.id)
          ? 'Hér er þröngt. Finndu fleiri vini eða veldu parið aftur.'
          : 'Vinirnir bíða. Veldu verkefnið aftur þegar leiðin er laus.', 2.4);
      }
    }
    updateStory(frozen ? 0 : dt);
    refreshControls();
    // Anatomical envelopes are sampled explicitly by QA, not rebuilt every RAF.
    window.__demoStats = world.getDebug({ collision: false });
  }
  raf = requestAnimationFrame(frame);
}

const speech = createMemorySpeech();
const music = createMemoryMusic();
setMute(muted);
$('start').addEventListener('click', () => start());
// Any tap on the game counts as the child doing something (the gold arrow waits for hesitation).
$('game').addEventListener('pointerdown', noteInput);
$('again').addEventListener('click', () => start({ restart: true }));
$('cancel-choice').addEventListener('click', cancelChoice);
$('camera').addEventListener('click', () => { audio.unlock(); music.unlock(); if (cameraState().mode !== 'overview') cancelChoice(); setCameraMode(cameraState().mode === 'overview' ? 'auto' : 'overview'); });
$('restart').addEventListener('click', () => start({ restart: true }));
$('sound').addEventListener('click', () => { setMute(!muted); if (!muted) { audio.unlock(); music.unlock(); } });
$('pause').addEventListener('click', () => openDialog('pause-dialog'));
$('help').addEventListener('click', () => { openDialog('help-dialog'); if ($('help-dialog').open) speech.play('help', 0, true); });
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

window.__memory = {
  state: () => game.getState(), basket: () => basketCount, stats: options => world?.getDebug(options), audio: () => ({ ...audio.getStats(), music: music.getStats(), speech: speech.getStats() }),
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
  $('basket').querySelector('.basket-icon').innerHTML = BASKET_ICON;
  world = await createMemoryWorld({ canvas: $('world'), onProgress: text => { $('loading-copy').textContent = text; }, basketPoint });
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
