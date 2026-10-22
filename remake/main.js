import * as THREE from 'three';
import { pickQuality } from './engine/quality.js';
import { createClock } from './engine/clock.js';
import { createRenderer } from './engine/renderer.js';
import { pickLook } from './engine/looks.js';
import { createLighting } from './engine/lighting.js';
import { installDepthShadows } from './engine/shadows.js';
import { updateCharacterLods, whenReady as characterLodsReady } from './engine/character-lod.js';
import { installFog } from './engine/fog.js';
import { createSky } from './engine/sky.js';
import { createSunFace, addMosiCloud } from './engine/sun-face.js';
import { createWind } from './engine/wind.js';
import { beatsAt, followBeat, danceOf } from './engine/beat.js';
import { createActor, updateActors } from './engine/actor.js';
import { createEffects } from './engine/effects.js';
import { installStats } from './engine/stats.js';
import { createPointResolver } from './engine/points.js';
import { createLocations, shotsOf, startOf } from './engine/locations.js';
import { createDirector } from './engine/camera/director.js';
import { createScene } from './engine/scene/scene.js';
import { createStageUI } from './engine/scene/ui.js';
import { createVoice } from './engine/scene/voice.js';
import { createPointer } from './engine/input/pointer.js';
import { createSave, defaultChapter } from './engine/save.js';
import { createJournal } from './engine/scene/journal.js';
import { createBook, halsOpen } from './engine/book/book.js';
import { createBookAudio } from './engine/book/book-audio.js';
import { parseCards } from './engine/book/cards.js';
import { parseManifest } from './engine/book/media.js';
import { createEittGame } from './engine/eitt/table.js';
import { createHalsGame } from './engine/hals/game.js';
import { createYatzyGame } from './engine/yatzy/table.js';
import { createJuniorFrame } from './engine/yatzy-junior/frame.js';
import { createAudioContext, createOutput } from './engine/audio/output.js';
import { createMusic } from './engine/audio/music.js';
import { createSfx } from './engine/audio/sfx.js';
import { createHold } from './engine/audio/hold.js';
import { guard } from './engine/guard.js';
import { warmUp } from './engine/warm-up.js';

// URL parameters
//   chapter=<id>          chapter module in chapters/ (default: the one the child's save is at, engine/save.js defaultChapter: kafli1
//                         until Kambeðla's star, then kafli2; grunnur is the foundation test scene)
//   quality=low|tablet|high
//   look=morning|lateMorning|golden|evening   override the chapter's light
//   shot=<name>           hold a static review shot from the chapter instead of playing the scene
//   t=<seconds>           seek to that time and freeze it (the scene, or a review shot's animation); silent
//   play=1                start the scene at once, without the start button
//   orbit=1               free camera (mouse and touch) instead of the director
//   debug=1               stats overlay
const params = new URLSearchParams(location.search);
const q = pickQuality(params);
const canvas = document.getElementById('view');
const display = createRenderer(canvas, q); // keep the object: resolutionScale is a live getter
const { renderer, applySize, adapt } = display;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1200);
const clock = createClock();

// A capture (?t=) neither reads nor changes the child's progress: it keeps its own save, in memory. An address that names no
// chapter plays the one the save is at.
const save = createSave(params.get('t') === null ? undefined : null);
const chapterId = (params.get('chapter') || defaultChapter(save)).replace(/[^a-z0-9_-]/gi, '');
const { chapter } = await import(`./chapters/${chapterId}.js`);
const look = pickLook(params.get('look') || chapter.look);
renderer.toneMappingExposure = look.exposure;

const lighting = createLighting(scene, look, q);
installDepthShadows(renderer, lighting.sun); // before any material compiles
installFog(scene, look, lighting.direction); // before any material compiles
const sky = createSky({ renderer, scene, look, sunDir: lighting.direction });
const sunFace = createSunFace({ scene, lighting }); // the smiling sun, over the sky's own disc
const mosiCloud = addMosiCloud({ scene, lighting, look }); // and one cloud shaped like Mosi (engine/sun-face.js)
const wind = createWind();

const world = {
  THREE, renderer, scene, camera, clock, q, params, look, lighting, wind, chapter,
  heightAt: () => 0,
  actors: new Map(),
  effects: createEffects(), // sparkles and the like, on the game clock (engine/effects.js)
};
world.resolvePoint = createPointResolver(world);

const { createForest } = await import('./world/forest/forest.js');
let locations = null;
// A place's forest is built in one long frame (seconds on a tablet), and its first draws are long frames too: the music is told
// before each build (music.lenient, set up once the music exists), so it moves its playhead instead of jumping back.
let beforeBuild = null;
// The places a chapter goes to later (chapter.prepare) are built once the start button shows, a slice at a time over frames
// (world/forest/slices.js: prepareLater below). slicing.budget() is how many ms of a frame the build may take (set once the scene
// exists); a slice that held its frame long (under the black) tells the music as a build at once does, and a frame with a slice
// in it says nothing of drawing (adapt).
let slicedInFrame = false;
const slicing = {
  budget: () => 25,
  stats: { slices: 0, longest: 0 },
  onSlice(ms) {
    slicedInFrame = true;
    slicing.stats.slices++;
    slicing.stats.longest = Math.max(slicing.stats.longest, ms);
    if (ms > 50) beforeBuild?.();
  },
};
if (chapter.locations) {
  // Several places: the start location is built now, the others once the start button shows (chapter.prepare, a slice at a
  // time) or, at once, when the scene first goes there.
  locations = createLocations({
    world, locations: chapter.locations,
    build: (layout, { sliced = false } = {}) => {
      if (sliced) return createForest(world, layout, { slice: slicing });
      beforeBuild?.();
      return createForest(world, layout);
    },
  });
  await locations.setLocation(startOf(chapter));
} else {
  const forest = await createForest(world, chapter.layout);
  world.forest = forest;
  world.heightAt = (x, z) => forest.heightAt(x, z);
}

for (const [name, spec] of Object.entries(chapter.actors || {})) {
  const url = new URL(spec.url, new URL(`./chapters/${chapterId}.js`, import.meta.url)).href;
  world.actors.set(name, await createActor(world, { name, ...spec, url }));
}
// Captures wait for the characters' LODs and shadow casters, so every measured frame has them.
let lodsReady = false;
characterLodsReady().then(() => { lodsReady = true; });
applySize(camera);

// The director knows every shot of the chapter, wherever it is set: its own and each location's (a name set twice is said).
const shots = shotsOf(chapter);
const director = createDirector({ camera, world, shots });
world.director = director;

let lines = {};
try {
  lines = await (await fetch(new URL('./assets/audio/lines.json', import.meta.url))).json();
} catch {
  console.warn('No recorded line durations found; lines are timed by reading pace.');
}
// The book's cards and pictures (engine/book/cards.js and media.js). Without them the book still opens and its Stjörnur page
// works; only its Dýrin page is empty.
let cards = [];
let media = new Map();
try {
  const read = async path => {
    const response = await fetch(new URL(path, import.meta.url));
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  };
  const [cardData, mediaData] = await Promise.all([read('./assets/book/cards.json'), read('./assets/book/media-manifest.json')]);
  cards = parseCards(cardData);
  media = parseManifest(mediaData);
} catch (error) {
  cards = [];
  media = new Map();
  console.warn('[book] Its cards could not be read, so its Dýrin page is empty.', error);
}
// The theme's tempo, measured once by tools/theme-tempo.mjs: the forest sways in time with it. The music reads the
// theme's file against this URL (theme.json's src), and the effects tune their bells to its key.
const themeUrl = new URL('./assets/audio/theme.json', import.meta.url);
let theme = null;
try {
  theme = await (await fetch(themeUrl)).json();
} catch {
  console.warn('No theme tempo found; the forest sways without the beat.');
}
// Sound. A capture (?t=) and a review shot (?shot=) are silent and make no audio context at all; a scene somebody plays
// gets one, which the browser keeps asleep until the first touch (the start button), so nothing sounds before it.
const playing = params.get('t') === null && params.get('shot') === null && Boolean(chapter.script);
const audio = playing ? createAudioContext() : null;
const output = audio && createOutput(audio);
const music = createMusic({ context: audio, theme, clock, base: themeUrl, output });
const sfx = createSfx({ context: audio, theme, output });
// The book's narrator and effects (engine/book/book-audio.js): outside the hold below, so they sound while the game stands still
// behind the child's book, and muted wherever the game's sound is silent (captures and review shots).
const bookAudio = createBookAudio({ context: audio, output, theme, lines });
// The one place the beat reads its time: the music's playhead. It is the game clock's time folded into the theme's loop (and
// the clock's own time while the music is not sounding), so the forest dances to what is heard, and a seek or a capture lands
// on the same beat every time.
const musicTime = () => music.position;
// The forest's beat, { beats, speed }: the music's grid, followed without a jump when the playhead jumps (at the first touch, and
// where the theme loops), and the grid exactly while seeking and in a frozen capture (engine/beat.js: followBeat). Without a theme
// there is none: the wind's count stays NO_BEAT, and the forest holds the middle of its waves.
let followed = null;
const ui = createStageUI(document);
const voice = createVoice({ onSpeaking: on => music.duck(on) }); // the music lowers itself under a recorded line
// The sound follows the game clock: the voice, the music and the effects hold while the book is open and while the tab is
// hidden (a hidden tab draws no frames, so the clock stands still too), and go on from where the clock is.
const hold = createHold([voice, music, sfx]);
// Seconds of game time round a change of place in which a long frame moves the music's playhead to the sound instead of seeking
// the sound back (engine/audio/music.js: lenient): the build, the warm-up draw and the fade back in, all under the black.
const PLACE_CHANGE = 4;
beforeBuild = () => music.lenient(PLACE_CHANGE);
// The sound runs before the actors, the effects, the camera and the forest: one that throws is said once and the frame goes on.
const updateMusic = guard('music', () => music.update());
const updateSfx = guard('sfx', dt => sfx.update(dt));
const pointer = createPointer({ canvas, camera, world });
const book = createBook(document, {
  cards, media, save, audio: bookAudio, win: window,
  onPlay: (game, options) => (game === 'hals' ? hals.open() : game === 'yatzy' ? yatzy.open(options) : game === 'yatzy-junior' ? junior.open() : eitt.open(options)), // the Leikir page's games
  // On the Leikir page the board world of "Háls og hali" starts building, once the page has turned in, so the game opens at once:
  // once it is open, by Þórseðla's star or a game of it played (book.js halsOpen); a locked tile only wiggles, and builds nothing.
  onTab: tab => { if (tab === 'games' && halsOpen(save)) setTimeout(() => hals.prewarm(), 900); },
  // A book the child opens holds the whole game, the sound included, until the child shuts it. A book a script opens
  // (s.journal.open) does not, until the child taps inside it: the last scene fades into the book while Mosi speaks.
  onPause: paused => {
    clock.setPaused(paused);
    hold('book', paused);
  },
});
// Kambeðla's card game, "Eitt!" (engine/eitt/table.js), which the book's Leikir page opens over the book. Like the child's book it
// holds the chapter while it is open, the chapter's voice, music and effects included (its own hold, so the two never play at once),
// and the clock stays held after it while the book is still open. Its effects, music and voices are its own, through the page's
// output, and silent wherever the game's sound is (captures and review shots have no audio context at all).
const eitt = createEittGame(document, {
  save, audio: { context: audio, output, theme, lines, muted: !playing },
  onPause: paused => {
    clock.setPaused(paused || book.isOpen);
    hold('eitt', paused);
  },
  onClose: () => book.refresh(), // a sticker won is in the book now
});
// Slóeðla's dice game, "Risaeðlu-Yatzy" (engine/yatzy/table.js), which the Leikir page opens over the book.
const yatzy = createYatzyGame(document, {
  save, audio: { context: audio, output, theme, lines, muted: !playing },
  onPause: paused => {
    clock.setPaused(paused || book.isOpen);
    hold('yatzy', paused);
  },
  onClose: () => book.refresh(),
});
// "Litla Yatzy við Mosa" (remake/yatzy-junior.html, a page of its own) in a frame over the book (engine/yatzy-junior/frame.js),
// the chapter held meanwhile as for the other games.
const junior = createJuniorFrame(document, {
  onPause: paused => {
    clock.setPaused(paused || book.isOpen);
    hold('yatzy-junior', paused);
  },
  onClose: () => book.refresh(),
});
// Þórseðla's snakes and ladders, "Háls og hali" (engine/hals/game.js), which the Leikir page opens over the book as it does "Eitt!",
// holding the chapter the same way (its own hold). It draws its board with this page's renderer: the canvas moves into the game
// while it is open, so the chapter draws nothing then (render() below), and draws once more when the game shuts, under the book.
const hals = createHalsGame(document, {
  save, renderer, q, params, audio: { context: audio, output, theme, lines, muted: !playing },
  onPause: paused => {
    clock.setPaused(paused || book.isOpen);
    hold('hals', paused);
  },
  onClose: () => {
    canvasCleared = true; // the chapter's frame goes back on the canvas the game drew on
    book.refresh(); // a fossil found is in the book now
  },
});
const journal = createJournal(document, save, { book, audio: bookAudio });
const stage = createScene({ world, director, ui, voice, lines, cast: chapter.cast, locations, pointer, journal, sun: sunFace, sfx });
// A slice of a later place's build may take 25 ms of a frame while the start button waits (the picture holds still behind it), 8
// while the scene plays (the frame keeps room to draw), and 80 under the black, where no frame is seen (no more: the game clock
// counts a frame as 0.1 s at most, and a black that waits some seconds for a build, the chapter's own, must last that long).
slicing.budget = () => (!stage.started ? 25 : ui.fadeLevel >= 0.999 ? 80 : 8);

// A tab that is hidden draws no frames and the clock stands still: the sound holds with it, also when the page opens hidden.
document.addEventListener('visibilitychange', () => hold('hidden', document.hidden));
hold('hidden', document.hidden);
// The start button is the first touch. After it any touch wakes sound the system has put to sleep (a tablet that was locked).
window.addEventListener('pointerup', () => { if (stage.started) music.start(); }, { passive: true });

const shotName = params.get('shot');
let startReady = true; // false while the start button waits for the warm-up (captures and review shots have none)
let warmedPlace = null; // the place last drawn by the warm-up; null: places are not warmed (captures, review shots, ?play=1)
const tParam = params.get('t');
const seekTo = tParam !== null ? Math.max(0, Number(tParam) || 0) : null;

// The sun's shadow map: fixed on the clearing for review shots, following the camera in the scene.
const ORIGIN = new THREE.Vector3();
const shadowFocus = { centre: new THREE.Vector3(), radius: 10 };
let shadowFollowsCamera = false;
lighting.focus(ORIGIN, 10);

let controls = null;

// The warm-up draw (engine/warm-up.js). A material's first draw builds its shaders, a stall of 0.2 to 0.6 s on the reference laptop,
// so before the start button shows, the chapter is drawn once behind the black from the views it names (chapter.warmUp), with what
// would otherwise show for the first time later. The places it will go to (chapter.prepare) are built once the button shows, and
// each is drawn the same way while the button still waits (prepareLater); and as the scene comes to a place it is drawn once more,
// under the black, before the fade back in.
const nextFrames = count => new Promise(resolve => {
  let left = count;
  const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step));
  requestAnimationFrame(step);
});

/** One warm-up draw from each of `views` (shot names), with `warm`'s objects, and this frame's own view put back after. */
function warmViews(views, warm) {
  const result = warmUp(renderer, scene, camera, {
    objects: warm.objects,
    shots: views.map(name => director.poseOf(name)).map(pose => cam => {
      cam.position.copy(pose.position);
      cam.up.set(0, 1, 0);
      cam.lookAt(pose.target);
      cam.fov = pose.fov;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      lighting.focus(pose.focus.centre, pose.focus.radius); // the shadow map looks where this view's would
      world.forest.update?.(0, clock.time); // and the forest is culled, its casters chosen, for this view
    }),
  });
  if (shadowFollowsCamera) {
    director.shadowFocus(shadowFocus);
    lighting.focus(shadowFocus.centre, shadowFocus.radius);
  } else lighting.focus(ORIGIN, 10);
  world.forest.update?.(0, clock.time);
  return result;
}

/**
 * Draw the place in view once, with the chapter's warm-up objects (their throwaways stand on its ground). `place`: the place the
 * chapter is told it is drawn for (chapter.warmUp's), the one in view unless said; null for all the chapter has.
 */
function warmPlace(views, place = world.location) {
  const warm = chapter.warmUp?.(world, { place }) ?? { objects: [], dispose() {} };
  try {
    return warmViews(views, warm);
  } finally {
    warm.dispose?.();
  }
}

/** One draw of `objects` from the view as it is, under the black: models a chapter makes as it comes to a place (kafli2's far friends). */
world.warmObjects = objects => {
  const warmed = warmViews([], { objects });
  (world.warmUps ??= []).push({ label: 'objects', ...warmed });
  return warmed;
};

// The chapter's first find flies into the book as its card's picture (scene/journal.js). The Fen's drawings are SVGs with a
// hand-drawn filter, and the first such drawing shown builds the filter's shaders on the GPU, a frame of some 0.4 s (and in a new
// game the book's button first shows then too, some 0.1 s more). They are shown once, all but transparent, for a few frames where
// nobody sees a frame stall: behind the start button once it shows, else under the scene's first black (chapter.firstFind: the
// find; only a drawing, an SVG, needs it).
let drawingToWarm = (() => {
  const picture = chapter.firstFind ? book.pictureOf?.(chapter.firstFind) : null;
  return picture && /\.svg([?#]|$)/i.test(picture) ? picture : null;
})();
function warmDrawing() {
  if (!drawingToWarm) return;
  // as the flight shows it (style.css .flying-find: its round frame and glow too)
  const flight = document.createElement('div');
  flight.className = 'flying-find';
  flight.setAttribute('aria-hidden', 'true');
  flight.style.cssText = 'position: fixed; opacity: 0.01; pointer-events: none; z-index: 2147483647;';
  const image = document.createElement('img');
  image.src = drawingToWarm;
  image.alt = '';
  flight.append(image);
  document.body.append(flight);
  // and the book's button, when it is not showing yet (a new game: it comes with the first find), its first drawing as costly
  const button = document.querySelector('.journal-button');
  const copy = button?.hidden ? button.cloneNode(true) : null;
  if (copy) {
    copy.hidden = false;
    copy.removeAttribute('id');
    for (const part of copy.querySelectorAll('[id]')) part.removeAttribute('id');
    copy.setAttribute('aria-hidden', 'true');
    copy.tabIndex = -1;
    copy.style.cssText = 'opacity: 0.01; pointer-events: none; z-index: 2147483647;';
    document.body.append(copy);
  }
  drawingToWarm = null;
  image.decode().catch(() => {}).then(() => nextFrames(6)).finally(() => { flight.remove(); copy?.remove(); });
}

/** Draw a place the chapter goes to later once (its built `forest`), shown for that in place of the one in view. */
function warmPrepared(name, forest) {
  const here = { forest: world.forest, heightAt: world.heightAt };
  here.forest.group.visible = false;
  forest.group.visible = true;
  world.forest = forest;
  world.heightAt = (x, z) => forest.heightAt(x, z);
  try {
    return warmPlace(chapter.locations[name].warmUp ?? [], name);
  } finally {
    forest.group.visible = false;
    here.forest.group.visible = true;
    world.forest = here.forest;
    world.heightAt = here.heightAt;
    world.forest.update?.(0, clock.time);
  }
}

/** Everything that is done behind the black before the start button shows: the start place and the chapter, drawn once. */
async function getReady() {
  await characterLodsReady(); // the shadow casters the levels bring are drawn too
  await nextFrames(2); // the script's setup has run and the start shot holds
  const warmed = [];
  const warm = chapter.warmUp?.(world, { place: world.location }) ?? { objects: [], shots: [], dispose() {} };
  try {
    warmed.push({ label: 'start', ...warmViews(warm.shots ?? [], warm) });
  } finally {
    warm.dispose?.();
  }
  if (warm.tray?.length) {
    // The tray's pockets are built once and laid out under the black, so its first show in the story is not a long frame.
    ui.tray.prepare(warm.tray);
    ui.tray.show(warm.tray);
    await nextFrames(2);
    ui.tray.hide();
  }
  world.warmUps = warmed; // for a probe: { label, draws, ms, programs } of each warm-up (prepareLater adds the places')
  console.info('[warm-up]', warmed.map(describeWarm).join('; '));
}

const describeWarm = w => `${w.label}: ${w.built ? `built in ${w.built} ms (${w.slices} slices, the longest ${w.longest} ms)${w.draws ? ', ' : ''}` : ''}${w.draws ? `${w.draws} draws, ${w.programs} programs, ${Math.round(w.ms)} ms` : ''}`;

/**
 * Once the start button shows: the places the chapter goes to later (chapter.prepare), built one after another a slice at a time
 * (the scene's first change of place waits for its build if the child gets there first), each drawn once while the button still
 * waits or the screen is black (else the scene draws each as it comes there, under the black: the frame loop); then what the chapter makes
 * later (chapter.later: its files fetched as the button shows, the rest made while the button still waits, else the chapter makes
 * it under a black of its own). A warm-up's draws on the canvas are drawn over at once with the view behind the button.
 */
async function prepareLater() {
  const warmed = (world.warmUps ??= []);
  chapter.later?.fetch?.(world);
  if (!stage.started) warmDrawing();
  for (const name of locations ? chapter.prepare ?? [] : []) {
    const began = performance.now();
    slicing.stats = { slices: 0, longest: 0 };
    const forest = await locations.prepare(name, { sliced: true });
    const entry = { label: name, built: Math.round(performance.now() - began), slices: slicing.stats.slices, longest: Math.round(slicing.stats.longest) };
    // drawn while the button waits, or under a black the scene holds for it (chapter 2's first, for the trail); else as the scene
    // comes there
    if (!stage.started || ui.fadeLevel >= 0.999) {
      Object.assign(entry, warmPrepared(name, forest));
      if (ui.fadeLevel < 0.999) drawNow();
    }
    warmed.push(entry);
  }
  if (chapter.later?.make && !stage.started) {
    const began = performance.now();
    await chapter.later.make(world);
    const entry = { label: 'later', made: Math.round(performance.now() - began) };
    if (!stage.started) {
      Object.assign(entry, warmPlace([], null)); // all the chapter's warm-up again, with what it made, from the view behind the button
      if (ui.fadeLevel < 0.999) drawNow();
    }
    warmed.push(entry);
  }
  world.preparedLater = true;
  console.info('[warm-up] later:', warmed.filter(w => w.label !== 'start').map(describeWarm).join('; '));
}

function update(dt) {
  journal.update(dt); // before the scene: a flight the scene starts in this frame is counted from the next
  stage.update(dt);
  wind.update(clock.time);
  updateMusic(); // if the clock lost time (a long frame) the sound is brought back to the playhead
  updateSfx(dt); // the forest's birds and rustles
  if (theme) {
    followed = followBeat(followed, beatsAt(musicTime(), theme), dt, theme, stage.seeking || clock.frozen);
    wind.setBeats(followed.beats); // the forest sways smoothly in time: the trees once in four beats, the ferns in two, the grass ripples every beat
    wind.setDance(danceOf(followed.beats, theme)); // and on each strong beat the flowers nod and the mushrooms hop
  }
  updateActors(world.actors.values(), dt); // a rider after its host, whatever the chapter's order
  world.effects.update(dt); // after the actors, so a trail follows where a rider is now
  if (controls) controls.update();
  else director.update(dt);
  if (shadowFollowsCamera) {
    director.shadowFocus(shadowFocus);
    lighting.focus(shadowFocus.centre, shadowFocus.radius);
  }
  world.forest.update?.(dt, clock.time); // after the camera and shadow focus: culling uses this frame's view
  updateCharacterLods(camera, renderer.domElement.height); // the characters' levels too
  sky.update(clock.time, camera);
  sunFace.update(clock.time, camera); // after the camera has moved: both sit 600 m from where it is now
  mosiCloud.update(clock.time, camera);
}

let scriptTask = null; // the chapter's script, once it runs: when it ends, the hand-over (below)
function startScene() {
  scriptTask = stage.start(chapter.script);
}

// The hand-over (spec section 8): a chapter whose script has ended and that names the next one (chapter.next: kafli1's is kafli2) puts
// a raised "Áfram" pill over the open book, in the book's style (book.css .next-chapter), and a tap on it goes on to that chapter's
// page. It stands under a game the book opens (it comes before them on the page), and stays if the child shuts the book.
let handedOver = false;
function handOver() {
  if (handedOver || !chapter.next || !scriptTask?.done || scriptTask.failed || scriptTask.cancelled) return;
  handedOver = true;
  const next = new URLSearchParams();
  for (const key of ['quality', 'debug']) if (params.get(key)) next.set(key, params.get(key));
  next.set('chapter', chapter.next);
  const button = document.createElement('button');
  button.id = 'next-chapter';
  button.type = 'button';
  button.className = 'next-chapter';
  button.setAttribute('aria-label', 'Áfram í næsta kafla');
  button.innerHTML = '<span>Áfram</span><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 24h24M24 11l13 13-13 13" stroke-width="7"/></svg>';
  button.addEventListener('click', () => { location.search = `?${next}`; }, { once: true });
  document.getElementById('book').after(button);
}

if (shotName || !chapter.script) {
  // Review mode: hold a static shot. With t, jump the animation there and freeze. The book is as silent as the rest.
  bookAudio.muted = true;
  director.cut(shots[shotName] ? shotName : 'hero');
  if (seekTo !== null) {
    clock.step(seekTo);
    for (const actor of world.actors.values()) actor.mixer.setTime(seekTo);
    clock.freeze();
  }
} else {
  // The script runs at once so its setup (positions, first shot) shows behind the start button;
  // `yield s.ready()` in the script holds it there until begin().
  shadowFollowsCamera = true;
  director.cut(chapter.startShot || 'hero', { check: false });
  startScene();
  if (seekTo !== null) {
    // Deterministic seek: run the scene from the start in fixed steps, silently, then freeze.
    voice.muted = true;
    music.muted = true;
    sfx.muted = true;
    bookAudio.muted = true;
    stage.seeking = true;
    ui.setFade(1);
    stage.begin();
    const step = 1 / 30;
    for (let t = 0; t < seekTo - 1e-9; t += step) {
      const dt = Math.min(step, seekTo - t);
      clock.step(dt);
      update(dt);
      // A script waiting on a promise (loading, say) gets the chance to see it settle.
      for (let tries = 0; stage.scheduler.pending > 0 && tries < 500; tries++) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    stage.seeking = false;
    clock.freeze();
  } else if (params.get('play') === '1') {
    ui.setFade(1);
    stage.begin();
  } else {
    // Wait for a tap: it starts the scene and also lets the browser play the recorded voice. Until the chapter has been drawn
    // once (getReady) the screen stays black and the button hidden.
    ui.setFade(1);
    startReady = false;
    // Meanwhile a small gold star breathes in the middle of the black (style.css: .loading); it fades out as the black lifts.
    const loading = document.getElementById('loading');
    loading.hidden = false;
    const button = document.getElementById('start');
    button.addEventListener('click', () => {
      button.hidden = true;
      ui.setFade(1); // the scene opens from black, the same as in captures
      stage.begin();
      music.start(); // the first touch: the browser lets sound begin, and the theme with it
    }, { once: true });
    getReady().catch(error => console.error('[warm-up]', error)).finally(() => {
      warmedPlace = world.location; // from now on a place the scene comes to is drawn once before it shows
      loading.classList.add('done');
      setTimeout(() => { loading.hidden = true; }, 600); // once it has faded
      ui.setFade(0.35);
      button.hidden = false;
      startReady = true;
      prepareLater().catch(error => console.error('[warm-up]', error));
    });
  }
}

if (params.get('orbit') === '1') {
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  controls = new OrbitControls(camera, canvas);
  controls.target.copy(director.rig.target);
  controls.update();
}

const debugEl = document.getElementById('debug');
debugEl.hidden = params.get('debug') !== '1';

function drawNow() {
  renderer.info.reset(); // one count per frame, shadow pass included (autoReset is off)
  renderer.render(scene, camera);
}
// While the child's book covers the screen the game stands still behind it (the clock is held), and the canvas keeps the last frame it
// was given: nothing is drawn again, not the same frozen scene every frame for nothing. A resize clears the canvas, so that draws once.
// A book a script opened holds nothing, so the scene goes on under it. `drew` says whether this frame was drawn.
let canvasCleared = false;
let drew = true;
window.addEventListener('resize', () => { canvasCleared = true; }); // after the renderer's own, which does the clearing
function render() {
  if (hals.isOpen) { // the game draws its board on this canvas: the chapter waits
    drew = false;
    return;
  }
  drew = !(clock.paused && (book.isOpen || eitt.isOpen) && !canvasCleared);
  if (!drew) return;
  canvasCleared = false;
  drawNow();
}
const stats = installStats({
  renderer, scene, q, render: drawNow, debugEl,
  getScale: () => display.resolutionScale,
  extra: () => `scene ${stage.elapsed.toFixed(1)} s  camera ${director.mode}`,
});

// A black the scene holds for longer than a moment (it waits for a place's build, or for models it makes there) shows the start's
// small gold star breathing in its middle (style.css: .loading), as the black before the start button does; it fades with the black.
const STAR_AFTER = 1000; // ms of black before the star shows
const star = document.getElementById('loading');
let blackSince = null;
function starInTheBlack(now) {
  if (stage.started && ui.fadeLevel >= 0.999) {
    blackSince ??= now;
    if (now - blackSince >= STAR_AFTER && (star.hidden || star.classList.contains('done'))) {
      star.hidden = false;
      star.classList.remove('done');
    }
  } else if (blackSince !== null) {
    blackSince = null;
    if (!star.hidden) star.classList.add('done');
  }
}

let last = performance.now();
let frames = 0;
let failures = 0;
renderer.setAnimationLoop(now => {
  const real = (now - last) / 1000;
  last = now;
  try {
    update(clock.tick(real));
  } catch (error) {
    // Keep drawing: a broken scene object must not freeze the picture. Report the first few.
    if (failures++ < 5) console.error('[frame]', error);
  }
  handOver(); // the script may have ended in this frame
  if (warmedPlace !== null) starInTheBlack(now);
  if (warmedPlace !== null && stage.started && ui.fadeLevel >= 0.999) warmDrawing();
  if (warmedPlace !== null && world.location !== warmedPlace) {
    // The scene has just come to a place and set it up, and the screen is black: draw it once before its first frame shows.
    warmedPlace = world.location;
    music.lenient(PLACE_CHANGE);
    try {
      warmPlace(chapter.locations?.[world.location]?.warmUp ?? []);
    } catch (error) {
      console.error('[warm-up]', error);
    }
  }
  render();
  if (drew) {
    stats.sample(real);
    // not to frames under the black (the warm-up, a build) nor to ones with a slice of a build in them: they say nothing of
    // drawing; nor to ones not drawn
    adapt(real, clock.frozen || ui.fadeLevel >= 0.999 || slicedInFrame);
  }
  slicedInFrame = false;
  if (++frames >= 20 && lodsReady && startReady) window.__demoReady = true;
});
Object.assign(window, { __world: world, __scene: stage, __director: director, __journal: journal, __book: book, __eitt: eitt, __hals: hals, __junior: junior, __save: save, __music: music, __sfx: sfx, __audio: { context: audio, output } });
