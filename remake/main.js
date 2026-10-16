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
import { createActor, updateActors } from './engine/actor.js';
import { createEffects } from './engine/effects.js';
import { installStats } from './engine/stats.js';
import { createPointResolver } from './engine/points.js';
import { createLocations } from './engine/locations.js';
import { createDirector } from './engine/camera/director.js';
import { createScene } from './engine/scene/scene.js';
import { createStageUI } from './engine/scene/ui.js';
import { createVoice } from './engine/scene/voice.js';
import { createPointer } from './engine/input/pointer.js';
import { createSave } from './engine/save.js';
import { createJournal } from './engine/scene/journal.js';

// URL parameters
//   chapter=<id>          chapter module in chapters/ (default: grunnur, the foundation test scene)
//   quality=low|tablet|high
//   look=morning|golden|evening   override the chapter's light
//   shot=<name>           hold a static review shot from the chapter instead of playing the scene
//   t=<seconds>           seek to that time and freeze it (the scene, or a review shot's animation)
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
  await locations.setLocation(chapter.start);
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

// The director knows every shot of the chapter, wherever it is set: its own and each location's.
const shots = chapter.locations
  ? Object.assign({}, chapter.shots, ...Object.values(chapter.locations).map(location => location.shots))
  : chapter.shots;
const director = createDirector({ camera, world, shots });
world.director = director;

let lines = {};
try {
  lines = await (await fetch(new URL('./assets/audio/lines.json', import.meta.url))).json();
} catch {
  console.warn('No recorded line durations found; lines are timed by reading pace.');
}
const ui = createStageUI(document);
const voice = createVoice();
const pointer = createPointer({ canvas, camera, world });
// A capture (?t=) neither reads nor changes the child's progress: it keeps its own save, in memory.
const save = createSave(params.get('t') === null ? undefined : null);
const journal = createJournal(document, save, {
  // A page the child opens holds the whole game, the voice included, until the child shuts it. A page a
  // script opens (s.journal.open) does not call this: the last scene fades into the book while Mosi speaks.
  onPause: paused => {
    clock.setPaused(paused);
    voice.setPaused(paused);
  },
});
const stage = createScene({ world, director, ui, voice, lines, cast: chapter.cast, locations, pointer, journal, sun: sunFace });

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
Object.assign(window, { __world: world, __scene: stage, __director: director, __journal: journal, __save: save });
