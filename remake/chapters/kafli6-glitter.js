// Chapter 6's invitation to tap (the owner's F1 reports 4, 5 and 9 of 2026-11-23): what the child may tap glitters from the moment a
// task waits for it, as chapter 1's saddle and chapter 3's seat on Þórseðla's head do (world/props/sparkles.js: a few gold glints at a
// time, a golden angle round the point at a time, so no two come up in one place). It is the invitation only; the help's ladder
// (kafli6-help.js) still comes after its waits, as before.
//
//   beckon(s, c, names, how)   the aimed targets `names` (c.aims, kafli6.js aim) glitter from now; any glitter before stops
//   unbeckon(c)                every glint goes at once (the tap is taken, or the wait is over)
//
// `how`: { size, spread, around (m round the point), up (m over it), clear }. With `clear` the glints are drawn over the picture
// instead of added to it, and take no fog, as the cloud's own gold glow does: light added to white (the cloud, bright sand) is
// white, and the fog would make them white too. While a target glitters c.beckoning says which ({ names, since }), for the tests and the videos' child.
import * as THREE from 'three';
import { glints, run } from '../world/props/sparkles.js';

const GOLD = '#f2b630'; // the sparkles' own gold
/** Seconds between the glints, how long each burst lasts, and how many glints a burst has. */
export const GLITTER = { every: 0.7, duration: 1.2, count: 12 };
// How each of the three waits glitters (m): Mosi in the cloud, 9 m from the camera, round his back where Egill sits; the three ways
// in the cloud, where the gold glows when she answers (22 m off and 9 m up), all three alike; her head on the ground, as chapter 3's
// seat on Þórseðla's head glitters, bigger for the wider shot and drawn over the picture too: added to the bright sand and the
// sunset haze behind her head the glints were white specks.
export const BECKON = {
  mosi: { size: 0.6, spread: 1.1, around: 0.8, up: 0.8, clear: true },
  ways: { size: 1.6, spread: 3, around: 2, up: 0, clear: true },
  head: { size: 1.1, spread: 1.3, around: 0.4, up: 0, clear: true },
};

export function beckon(s, c, names, { size = 0.32, spread = 0.7, around = 0.3, up = 0, clear = false } = {}) {
  unbeckon(c);
  const { world } = c;
  const live = new Set();
  const at = new THREE.Vector3();
  let n = 0;
  let over = false;
  const look = clear ? { blending: THREE.NormalBlending } : {};

  function burst() {
    for (const handle of live) if (handle.done) live.delete(handle);
    const k = n * 2.39996; // a golden angle at a time round the point
    for (const name of names) {
      const spec = c.aims[name];
      if (!spec) continue;
      world.resolvePoint(spec, at);
      at.x += Math.cos(k) * around;
      at.z += Math.sin(k) * around;
      at.y += up;
      const { count, duration } = GLITTER;
      const set = glints(world, { count, life: 0.75 * duration, spread, fall: 0.15, size, colour: GOLD, seed: `beckon ${name} ${n % 8}`, look });
      if (clear) set.points.material.fog = false;
      set.points.name = `Glitter ${name}`;
      for (let i = 0; i < count; i++) {
        set.position.set([at.x, at.y, at.z], i * 3);
        set.birth[i] = (i / count) * 0.25 * duration;
      }
      live.add(run(world, set, duration, `glitter ${name}`));
    }
    n++;
  }

  burst(); // on the screen from the frame the wait begins
  const task = s.after(0, function* glittering() {
    while (!over) {
      yield s.wait(GLITTER.every);
      if (!over) burst();
    }
  });
  c.beckoning = {
    names: [...names],
    since: s.time,
    stop() {
      over = true;
      task.cancel();
      for (const handle of live) handle.cancel();
      live.clear();
    },
  };
  return c.beckoning;
}

export function unbeckon(c) {
  c.beckoning?.stop();
  c.beckoning = null;
}
