import * as THREE from 'three';
import { glints, run, needEffects } from './sparkles.js';

// Pollen: the cloud that swirls up when Mosi sneezes ("A... a... atsju!", scene 3). It is the sparkles' machinery with another look
// (sparkles.js): a set of specks is one THREE.Points, so one draw call, each posed in the vertex shader from its age on the game
// clock (world.effects advances it, so the cloud pauses with the game and lands on the same frame in a capture), and when the last
// speck has faded the set takes itself out of the scene and its handle finishes. The specks are warm yellow, larger than a glint
// and soft, of sizes that differ, with no star and no twinkle. They puff out of the point together, wind up into a spiral as they
// rise, and drift on along the wind. Normal blending, not additive: dust in the sun dims what is behind it a little, where a glint
// only adds light, and on the sunny green of the clearing yellow added to light would wash out to white.

const YELLOW = '#f2c230'; // the buttercup of the clearing (STYLE.md section 4), a shade warmer
const HEART = '#ffe680'; // the paler heart of a speck, still yellow: it is dust, not a glint
const DRIFT = 0.7; // metres the cloud has moved along the wind by the end
const SOFT = {
  glow: 0.7, falloff: 2, star: 0, twinkle: 0, rim: 1, vary: 1,
  swirl: 5.5, rise: 1.2,
  core: HEART, blending: THREE.NormalBlending, floor: -0.15, span: 1.15, // a puff that leans up: little of it goes down
};

/**
 * A puff of `count` pollen specks from `point` (a THREE.Vector3, or a point spec world.resolvePoint knows): they come out in the
 * first sixth of `duration` seconds, wind up and drift for the rest of it, and have faded by its end. Returns a Handle.
 */
export function pollenBurst(world, point, { count = 40, duration = 1.5, size = 0.38, spread = 0.9, colour = YELLOW, seed = 'pollen' } = {}) {
  needEffects(world, 'pollenBurst');
  const at = point?.isVector3 ? point : world.resolvePoint(point, new THREE.Vector3());
  const wind = world.wind?.uniforms?.uWindDirection?.value ?? { x: 0.8, y: 0.6 };
  const look = { ...SOFT, drift: [wind.x * DRIFT, wind.y * DRIFT] };
  const set = glints(world, { count, life: 0.85 * duration, spread, fall: 0, size, colour, seed, look });
  for (let i = 0; i < count; i++) {
    set.position.set([at.x, at.y, at.z], i * 3);
    set.birth[i] = (i / count) * 0.15 * duration;
  }
  return run(world, set, duration, 'pollen burst');
}
