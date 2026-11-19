import * as THREE from 'three';
import { glints, run, needEffects } from './sparkles.js';

// A splash you can see: white drops thrown up and out of the water where something touches it, falling back as they fade, in about a
// second. Chapter 4 calls it where Flugeðla skims the river, where she lands in the far pool, where Mosi runs in the shallows and where
// the frogs and the turtles go in; chapter 5 calls it too. It is the falls' spray made small (world/props/waterfall.js): the sparkles'
// glints (sparkles.js) with the spray's lit look, white and normal-blended, so it shows over bright water and the sky, each drop capped
// in size on the screen, so a splash by the camera never fills it. One set of glints, so one draw call while it lives, no triangles,
// and the spray's own shader program (the falls build it; splashWarm draws it once behind the black where the falls are not).
//
//   splash(world, point, { size, count, seed })   -> Handle    point: a THREE.Vector3 on the water (or a point spec world knows)
//   splashWarm(world)                             -> { object, dispose() }   a hidden one for a chapter's warm-up (engine/warm-up.js)
//
// `size` scales the whole splash (1: a body her size touching down; 0.5 a frog going in); the drops are 0.3 to 0.6 m across at 1.

/** The splash at size 1: how many drops, how long it lasts, how far they fly out and up, how they fall, and their size. */
export const SPLASH = {
  count: 30, // drops (20 to 40)
  life: 0.9, // seconds a drop lasts
  end: 1.2, // seconds the splash lives (the last drops are born a little late)
  spread: 1.1, // metres a drop flies out along its way
  rise: 2.0, // metres it would rise by the end of its life, were nothing pulling it down
  fall: 3.4, // metres gravity takes off that by then: a drop peaks early and is back at the water about four fifths in
  size: 0.45, // metres across (vary: half to one and a half times this)
  stagger: 0.18, // seconds over which the drops are born
  maxSize: 90, // pixels a drop spans at most on the screen
};

/** The spray's look (waterfall.js sprayLook), made small: white, soft-edged, sizes that differ, normal blending, lit. */
const LOOK = {
  glow: 0.95, falloff: 2.6, star: 0, twinkle: 0, rim: 1, vary: 1, core: '#ffffff', blending: THREE.NormalBlending,
  floor: 0.35, span: 0.65, // ways out lean up: from 0.35 to 1 on the sphere of ways
  swirl: 0, drift: [0, 0],
  light: { dim: 0.85, shadeColour: '#dfe8ea', soft: 3, near: [0.6, 2.5], maxSize: SPLASH.maxSize },
};

function setOf(world, at, { size = 1, count = SPLASH.count, seed = 'splash' } = {}) {
  const n = Math.max(4, Math.round(count));
  const set = glints(world, {
    count: n, life: SPLASH.life, spread: SPLASH.spread * size, fall: SPLASH.fall * size, size: SPLASH.size * Math.sqrt(size),
    colour: '#f4fbff', seed, look: { ...LOOK, rise: SPLASH.rise * size },
  });
  set.points.name = 'Splash';
  for (let i = 0; i < n; i++) {
    set.position.set([at.x, at.y + 0.05, at.z], i * 3);
    set.birth[i] = (i / n) * SPLASH.stagger;
  }
  return set;
}

/** A splash at `point` (on the water). Returns a Handle that finishes once its last drop has fallen. */
export function splash(world, point, options = {}) {
  needEffects(world, 'splash');
  const at = point?.isVector3 ? point.clone() : world.resolvePoint(point, new THREE.Vector3());
  const set = setOf(world, at, options);
  return run(world, set, SPLASH.end, 'splash');
}

/** A splash nobody sees, for a warm-up's objects: drawn once behind the black so the first real one builds nothing. */
export function splashWarm(world) {
  const set = setOf(world, new THREE.Vector3(0, -1000, 0), { seed: 'splash warm-up' });
  set.uniforms.uTime.value = 0.2;
  set.points.visible = false;
  return { object: set.points, dispose: () => set.remove() };
}
