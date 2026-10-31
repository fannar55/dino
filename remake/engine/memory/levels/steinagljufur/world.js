import { frameOf, liftOf, outside, closure, installGorgeGround } from './ground.js';
import { loadGorgeModels, buildGorge } from './props.js';

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
 * Task 3 builds the glade and the search; the scenes of the steps (the tunnel lit, the rockfall...) come with Tasks 4 to 6, so the tunnel is
 * there, marked `unbuilt`, and no step can start: after every leaf is found the round waits.
 */
export function createLevelWorld(stage) {
  const { THREE, scene } = stage, level = stage.level, spot = level.mosiSpot;
  const frame = frameOf(level.grid);
  let models = null, gorge = null, groundLook = null, snapshot = null;

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

  return {
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
        scene, frame, heightAt: stage.heightAt, models, tunnel: TUNNEL,
        avoid: (u, v, radius) => keepClear.some(([cu, cv, r]) => Math.hypot(u - cu, v - cv) < r + radius * .3) || stage.onLeafGround(...frame.toWorld(u, v), radius),
      });
    },

    // ---- the obstacles ----
    /** The tunnel is there to see and to tap once its scene is built (Task 4): until then it only marks the place. */
    getTargets() {
      if (!gorge) return [];
      return [{ id: 'tunnel', point: gorge.mouth.point.clone().add(new THREE.Vector3(0, 1.6, 0)), enabled: false, next: false, tapAlong: false, unbuilt: true, radius: 1.8 }];
    },
    tapPoint: id => gorge.mouth.point.clone().add(new THREE.Vector3(0, 1.6, 0)),

    // ---- the steps (none is built yet) ----
    playStep: () => null,
    startFail: () => false,
    isBusy: () => false,
    setStepState(state) { snapshot = { ...state }; },
    pollEvents: () => [],

    // ---- every frame ----
    update() {},
    afterActors() {},

    // ---- who is where ----
    bindPair() {},
    ownsPair: () => false,
    pairCentre: () => new THREE.Vector3(),
    hasTravelReservation: () => false,
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
      return { bridge: {}, mosiWalk: null, mosiAcross: false, river: null, collisionObjects: [], stats: gorge ? { gorge: gorge.stats() } : null };
    },
    setReducedMotion() {},
    reset() { snapshot = null; },
    dispose() { gorge?.dispose(); groundLook?.dispose(); },
  };
}
