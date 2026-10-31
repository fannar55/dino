import { frameOf, liftOf, outside, closure, installGorgeGround } from './ground.js';
import { loadGorgeModels, buildGorge } from './props.js';
import { createTunnelInterior } from './tunnel.js';
import { createGorgeMover } from './mover.js';
import { BORE } from './props.js';
import { addPlateGlow } from '../../../plate-glow.js';
import { lightScene } from './scenes/light.js';
import { headbuttScene } from './scenes/headbutt.js';
import { failScene } from './scenes/fail.js';

// The farthest hills are only seen in the overview: pale rock buttes in the haze, in the forest's far rings (a ring's `color` is the colour
// of its crowns, `haze` what they fade into).
const FAR_ROCKS = Object.freeze([
  { radius: 70, rows: 1, spacing: 9, height: [8, 12], crown: [7, 10], strip: [2.2, 3.6], color: ['#a9724c', '#c99467'], haze: '#e5cfa9', topHaze: .35, araucaria: 0 },
  { radius: 96, rows: 1, spacing: 10, height: [9, 13], crown: [8, 11], strip: [2.4, 3.8], color: ['#b88458', '#d7a877'], haze: '#ead7b3', topHaze: .5, araucaria: 0 },
]);

// Where the tunnel mouth stands in the glade's grid (levels/steinagljufur.js `grid`): in the middle of the back wall, its opening toward the
// camera of the landscape view and a little toward the portrait camera's side, so that both see it at an angle.
const TUNNEL = Object.freeze({ at: [-2.5, 11.4], facing: [.5, -.87], scale: 1 });

/**
 * Level 2's world: the gorge floor with its sandstone walls, boulders and the tunnel mouth (props.js, the owner's approved models), the ground's
 * look (ground.js) and the glade's low plants. world.js (shared) builds the renderer, the leaves, the nests and the friends and hands them over
 * as `stage` (levels/worlds.js says what is in it and what a level's world gives back).
 *
 * Task 3 built the glade and the search; Task 4 the first two steps: the Kambeðlur light the tunnel (scenes/light.js) and the Þríhyrnur butt away the rockfall in it
 * (scenes/headbutt.js), with the wrong friends' goes (scenes/fail.js), played by the mover (mover.js) over the tunnel's inside (tunnel.js). The steps after them (Tasks 5 and 6)
 * are not built yet, so after the rockfall is gone the round waits.
 */
export function createLevelWorld(stage) {
  const { THREE, scene } = stage, level = stage.level, spot = level.mosiSpot;
  const frame = frameOf(level.grid);
  let models = null, gorge = null, interior = null, mover = null, groundLook = null, snapshot = null, taskScript = null, searchCamera = null, api = null;
  // The one number the tunnel's shaders read: how far the Kambeðlur's plates have lit it (0 dark, 1 lit; tunnel.js eases it).
  const glow = { uLight: { value: 0 } };
  // The Kambeðlur's plates (engine/plate-glow.js): their glow is the light of the tunnel's task, raised a step with each tap; with none lit they look as they always did.
  const glows = [];
  const plates = {
    target: 0,
    setAll(level, options) { this.target = level; for (const one of glows) one.setAll(level, options); },
    update(dt) { for (const one of glows) one.update(dt); },
  };

  // What the forest is grown from: nothing grows by itself (a gorge has no forest), the ground is the floor with its walls lifted, and the
  // plants are the few the dress below places. The clearing is wide so that the floor is the forest's calm, flat ground.
  const layout = {
    clearing: { center: [...level.grid.centre], radius: 26 }, forestEdge: 34,
    path: [[level.grid.centre[0] + 70, level.grid.centre[1] + 40], [level.grid.centre[0] + 62, level.grid.centre[1] + 34]],
    keepOut: () => 1,
    lift: liftOf(frame),
    farRings: FAR_ROCKS,
    // Dry gorge dressing, only at the edge of the floor and the foot of the walls: pebbles, mossy stones and a few ferns and cycads where green hangs on.
    dress({ avoid = () => false } = {}) {
      const plants = [];
      let serial = 0;
      const next = () => { const v = Math.sin(++serial * 127.1 + 8311.7) * 43758.5453; return v - Math.floor(v); };
      const round = value => Math.round(value * 100) / 100, range = (a, b) => a + (b - a) * next();
      const add = (name, x, z, scale, variants) => plants.push({ name, position: [round(x), round(z)], scale: round(scale), variant: Math.floor(next() * variants), rot: round(next() * Math.PI * 2), sky: 1 });
      const mouth = frame.toWorld(TUNNEL.at[0] + TUNNEL.facing[0] * 4.2, TUNNEL.at[1] + TUNNEL.facing[1] * 4.2);
      for (let i = 0; i < 240; i++) {
        const angle = next() * Math.PI * 2, [u, v] = [Math.cos(angle) * 40, Math.sin(angle) * 40], reach = range(-2.4, 3.2);
        // a point at `reach` metres from the floor's edge along the ray at `angle`
        let near = 0, far = 80;
        for (let k = 0; k < 24; k++) { const mid = (near + far) / 2; if (outside(Math.cos(angle) * mid, Math.sin(angle) * mid) > reach) far = mid; else near = mid; }
        const gu = Math.cos(angle) * near, gv = Math.sin(angle) * near, [x, z] = frame.toWorld(gu, gv);
        if (avoid(x, z, 1.4) || stage.level.nests.some(([nx, nz]) => Math.hypot(x - nx, z - nz) < 3.4) || Math.hypot(x - spot.x, z - spot.z) < 3.6 || Math.hypot(x - mouth[0], z - mouth[1]) < 5.4) continue;
        const wall = closure(gu, gv), roll = next();
        if (roll < .16) add('rockSmall', x, z, range(.5, 1.1), 5);
        else if (roll < .26) add('rock', x, z, range(.3, .7), 5);
        else if (roll < .6 && wall > .3) add('fern', x, z, range(1, 1.8), 5);
        else if (wall > .6 && roll < .68) add('cycad', x, z, range(.8, 1.2), 3);
        else if (wall > .6 && roll < .72) add('treeFern', x, z, range(.8, 1.2), 3);
      }
      return plants;
    },
  };

  // ---- the scripts of the steps ----
  // What scenes/*.js are given: the shared stage and, on top of it, the obstacles' side of a task script (the mover moves the friends).
  const script = Object.create(stage);
  const mouthPoint = () => interior.local(BORE.mouth, .05, BORE.across);
  script.task = {
    start(id, options) { stage.idle?.settle(); const started = mover.start(id, options); stage.refresh(); return started; },
    beat: () => mover.beat(),
    waitingBeat: () => mover.waitingBeat(),
    busy: () => mover.isBusy(),
    phase: () => mover.phase(),
    lit: () => mover.lit(),
    abort() { if (taskScript != null) stage.scenes.cancel(taskScript); taskScript = null; stage.director.release({ duration: .6 }); },
    mouth: mouthPoint,
    pile: () => ({ front: interior.pile.front(), top: interior.pile.top(), centre: interior.pile.centre() }),
    // The way from the mouth toward the camera: the tunnel's own way out (0) turned toward where the search camera stood when the task began (1), so that the shots look into it from the glade's side.
    front(toward = .3) {
      const out = gorge.mouth.facing.clone().setY(0).normalize(), cam = (searchCamera ?? stage.camera()).clone().sub(mouthPoint()).setY(0).normalize();
      return out.multiplyScalar(1 - toward).addScaledVector(cam, toward).normalize();
    },
  };
  // A task script (the light, the headbutt): the scene starts the mover, and if the mover did not start it the scene is dropped.
  function playTask(make) {
    const director = stage.director;
    if (!mover || director.mode() !== 'auto' || mover.isBusy()) return null;
    searchCamera = stage.camera();
    taskScript = stage.scenes.play(make());
    if (!mover.isBusy()) { stage.scenes.cancel(taskScript); taskScript = null; director.release({ cut: true }); return null; }
    return taskScript;
  }

  api = {
    layout,
    // The points the overview adds to the board, the rests and Mosi: the tunnel and the walls behind it.
    overviewPoints: Object.freeze([[-8, 6, -14], [4, 6, -16], [-14, 3, -2], [14, 3, -8]]),
    /** The things the friends' walks and play keep clear of: the tunnel and the boulders. */
    navObjects: () => gorge?.solids ?? [],
    cameraCue: glade => glade(),

    /** Loads the gorge's models and stands them, once the forest, the leaves and the rests exist: the ground's look, the walls, the boulders, the tunnel. */
    async build() {
      const groundMaterial = scene.getObjectByName('Forest ground')?.material;
      if (groundMaterial) groundLook = installGorgeGround(groundMaterial, frame, { beds: stage.leaves });
      models = await loadGorgeModels();
      const keepClear = [...level.nests.map(([x, z]) => [...frame.toGrid(x, z), 3.4]), [...frame.toGrid(spot.x, spot.z), 3], [...TUNNEL.at, 5]];
      gorge = buildGorge({
        scene, frame, heightAt: stage.heightAt, models, tunnel: TUNNEL, glow,
        avoid: (u, v, radius) => keepClear.some(([cu, cv, r]) => Math.hypot(u - cu, v - cv) < r + radius * .3) || stage.onLeafGround(...frame.toWorld(u, v), radius),
      });
      interior = createTunnelInterior({ tunnel: gorge.tunnel, models, fx: stage.fx, glow, reducedMotion: stage.reducedMotion });
      mover = createGorgeMover({ stage, interior, plates, tunnel: gorge.tunnel, level });
      mover.setReducedMotion(stage.reducedMotion());
      if (stage.params.has('qa')) globalThis.__gorge = { interior, gorge, glow, stage, mover, plates, get api() { return api; } };
    },
    /** The friends exist and have their LODs: the Kambeðlur's plates can glow (before the scene is compiled, so that their shader is made once). */
    afterBabies(actors) {
      for (const actor of actors) if (actor.species === 'stegosaurus') { try { { const plate = addPlateGlow(actor, { colour: '#ffcf72', dull: 0 }); plate.colour.multiplyScalar(1.35); glows.push(plate); } } catch (error) { console.warn('The plates cannot glow:', error.message); } }
    },

    // ---- the obstacles ----
    /** The obstacle to ask about now: the dark tunnel until it is lit, then the rockfall in it until it is gone (the steps after them come with Tasks 5 and 6). */
    getTargets() {
      if (!gorge || !interior) return [];
      const waiting = stage.scenes.waiting?.(), state = snapshot ?? {};
      const target = (id, point) => ({ id, point, enabled: true, next: state.next === id, tapAlong: waiting?.target === id, radius: 1.8 });
      if (!state.tunnelLit) return [target('tunnel', mouthPoint().add(new THREE.Vector3(0, 1.3, 0)))];
      if (!state.rocksFallen) return [target('rocks', interior.pile.centre())];
      return [];
    },
    /** Where the big tap-along button of an obstacle sits: over the mouth for the tunnel, over the pile for the rocks. */
    tapPoint: id => id === 'rocks' ? interior.pile.centre() : mouthPoint().add(new THREE.Vector3(0, 1.3, 0)),

    // ---- the steps ----
    /** Plays a step (its script): the id of the script, or null when it cannot start now. */
    playStep(id) {
      switch (id) {
        case 'light': return playTask(() => lightScene(script));
        case 'headbutt': return playTask(() => headbuttScene(script));
        default: return null;
      }
    },
    /** A wrong friend's go at an obstacle (scenes/fail.js). False when it cannot start now. */
    startFail(species, target, options) {
      if (!mover || stage.director.mode() !== 'auto') return false;
      stage.idle?.settle(); const timing = mover.startFail(species, target, options); if (!timing) return false;
      searchCamera = stage.camera(); taskScript = stage.scenes.play(failScene(script, species, target, timing));
      return true;
    },
    isBusy: () => Boolean(mover?.isBusy()),
    /** The step rules' state (step-rules.js getState()). */
    setStepState(state) { snapshot = { ...state }; mover?.setState(snapshot); },
    /** The events the mover raised since the last call ({ type, id... }: 'bridge-complete', the beats, the light and the rocks, the goes). */
    pollEvents: () => mover?.pollEvents() ?? [],

    // ---- every frame ----
    update(dt) { mover?.update(dt); interior?.update(dt); plates.update(dt); },
    afterActors() {},

    // ---- who is where ----
    /** The pairs at work: the mover binds a pair once both are home, and says which it holds (the Kambeðlur hold the light), where it is and who is on its way. */
    bindPair: (species, members) => mover?.bindPair(species, members),
    ownsPair: species => Boolean(mover?.ownsPair(species)),
    pairCentre: species => mover?.pairCentre(species) ?? new THREE.Vector3(),
    hasTravelReservation: actor => Boolean(mover?.hasReservation(actor)),
    visited: () => false,
    /** The child may greet a pair at its home whenever no pair has been picked for a job. */
    nestSelectable: () => !snapshot?.selected,
    mosiPlace: () => ({ ...spot }),
    mosiObstacle: () => true,

    // ---- the ground ----
    /** Why a waiting friend may not play at (x, z): at the foot of a wall. */
    avoidIdle(x, z) { const [u, v] = frame.toGrid(x, z); return outside(u, v) > -2.4 ? 'wall' : null; },

    // ---- the page's debug and the round's end ----
    getDebug() {
      return { bridge: mover?.debug() ?? {}, mosiWalk: null, mosiAcross: false, river: null, collisionObjects: [],
        stats: gorge ? { gorge: gorge.stats(), tunnel: interior ? { light: +interior.level.toFixed(3), pile: interior.pile.stage, falling: interior.pile.isFalling(), plates: plates.target, ...interior.stats() } : null } : null };
    },
    setReducedMotion(value) { mover?.setReducedMotion(value); },
    reset() { snapshot = null; taskScript = null; mover?.reset(); plates.setAll(0, { duration: 0 }); interior?.reset(); },
    dispose() { interior?.dispose(); gorge?.dispose(); groundLook?.dispose(); },
  };
  return api;
}
