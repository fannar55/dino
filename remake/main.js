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
import { createSave } from './engine/save.js';
import { createJournal } from './engine/scene/journal.js';
import { createAudioContext, createOutput } from './engine/audio/output.js';
import { createMusic } from './engine/audio/music.js';
import { createSfx } from './engine/audio/sfx.js';
import { createHold } from './engine/audio/hold.js';
import { guard } from './engine/guard.js';

// URL parameters
//   chapter=<id>          chapter module in chapters/ (default: grunnur, the foundation test scene)
//   quality=low|tablet|high
//   look=morning|golden|evening   override the chapter's light
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

const chapterId = (params.get('chapter') || 'grunnur').replace(/[^a-z0-9_-]/gi, '');
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
if (chapter.locations) {
  // Several places: the start location is built now, the others when the scene first goes there.
  locations = createLocations({ world, locations: chapter.locations, build: layout => createForest(world, layout) });
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
// The sound runs before the actors, the effects, the camera and the forest: one that throws is said once and the frame goes on.
const updateMusic = guard('music', () => music.update());
const updateSfx = guard('sfx', dt => sfx.update(dt));
const pointer = createPointer({ canvas, camera, world });
// A capture (?t=) neither reads nor changes the child's progress: it keeps its own save, in memory.
const save = createSave(params.get('t') === null ? undefined : null);
const journal = createJournal(document, save, {
  // A page the child opens holds the whole game, the sound included, until the child shuts it. A page a
  // script opens (s.journal.open) does not call this: the last scene fades into the book while Mosi speaks.
  onPause: paused => {
    clock.setPaused(paused);
    hold('book', paused);
  },
});
const stage = createScene({ world, director, ui, voice, lines, cast: chapter.cast, locations, pointer, journal, sun: sunFace, sfx });

// A tab that is hidden draws no frames and the clock stands still: the sound holds with it, also when the page opens hidden.
document.addEventListener('visibilitychange', () => hold('hidden', document.hidden));
hold('hidden', document.hidden);
// The start button is the first touch. After it any touch wakes sound the system has put to sleep (a tablet that was locked).
window.addEventListener('pointerup', () => { if (stage.started) music.start(); }, { passive: true });

const shotName = params.get('shot');
const tParam = params.get('t');
const seekTo = tParam !== null ? Math.max(0, Number(tParam) || 0) : null;

// The sun's shadow map: fixed on the clearing for review shots, following the camera in the scene.
const ORIGIN = new THREE.Vector3();
const shadowFocus = { centre: new THREE.Vector3(), radius: 10 };
let shadowFollowsCamera = false;
lighting.focus(ORIGIN, 10);

let controls = null;

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

function startScene() {
  stage.start(chapter.script);
}

if (shotName || !chapter.script) {
  // Review mode: hold a static shot. With t, jump the animation there and freeze.
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
    // Wait for a tap: it starts the scene and also lets the browser play the recorded voice.
    ui.setFade(0.35);
    const button = document.getElementById('start');
    button.hidden = false;
    button.addEventListener('click', () => {
      button.hidden = true;
      ui.setFade(1); // the scene opens from black, the same as in captures
      stage.begin();
      music.start(); // the first touch: the browser lets sound begin, and the theme with it
    }, { once: true });
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

function render() {
  renderer.info.reset(); // one count per frame, shadow pass included (autoReset is off)
  renderer.render(scene, camera);
}
const stats = installStats({
  renderer, scene, q, render, debugEl,
  getScale: () => display.resolutionScale,
  extra: () => `scene ${stage.elapsed.toFixed(1)} s  camera ${director.mode}`,
});

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
  render();
  stats.sample(real);
  adapt(real, clock.frozen);
  if (++frames >= 20 && lodsReady) window.__demoReady = true;
});
Object.assign(window, { __world: world, __scene: stage, __director: director, __journal: journal, __save: save, __music: music, __sfx: sfx, __audio: { context: audio, output } });
