import { frameOf, liftOf, outside, closure, installGorgeGround } from './ground.js';
import { loadGorgeModels, buildGorge } from './props.js';
import { createTunnelInterior } from './tunnel.js';
import { createGorgeMover } from './mover.js';
import { loadUpperModels, createUpperGorge } from './upper.js';
import { BORE } from './props.js';
import { addPlateGlow } from '../../../plate-glow.js';
import { lightScene } from './scenes/light.js';
import { headbuttScene } from './scenes/headbutt.js';
import { failScene } from './scenes/fail.js';
import { throughScene } from './scenes/through.js';
import { reachScene } from './scenes/reach.js';
import { flyScene } from './scenes/fly.js';
import { climbScene } from './scenes/climb.js';
import { createRope } from './rope.js';

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
  let models = null, upperModels = null, upper = null, rope = null, gorge = null, interior = null, mover = null, groundLook = null, snapshot = null, taskScript = null, searchCamera = null, api = null;
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
    // The upper gorge (levels/steinagljufur/upper.js): a point of its frame in the scene, a camera direction (to the camera) from a direction of the frame, and the cut into it.
    up: (x, y, z) => upper.world(x, y, z),
    view: front => upper.direction(front[0], front[1]),
    exit: () => upper.world(upper.anchors.exit.mouth.x, 0, 0),
    cutUpper() { const done = mover.upper.cutUpper(); stage.refresh(); return done; },
    where: () => mover.upper.where(),
    slab: () => ({ hinge: upper.world(...upper.slab.hinge.toArray()), edge: upper.world(...upper.slab.under(upper.slab.length, 0).toArray()), middle: upper.world(...upper.slab.under(upper.slab.length * .55, 0).toArray()) }),
    tree: () => { const b = upper.tree.base; return { base: upper.world(b.x, b.y, b.z), middle: upper.world(b.x, b.y + 2.4, b.z), top: upper.world(b.x, b.y + 4.6, b.z) }; },
    rope: () => upper.world(...rope.tip().toArray()),
    done: () => mover.upper.debug().action?.done ?? 0,
    mosiHeight: () => stage.mosi.actor.root.position.y,
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

  // The resting view in the upper gorge, from the open side: the floor in front of the ledge (the ledge is next), the terrace and the cliff (the cliff is next), the rim.
  // A cue is a set of points the camera keeps in the frame and the direction it looks from (from the right-hand side of the way, a little ahead of it, from above).
  function upperCue() {
    const state = snapshot ?? {}, portrait = stage.aspect() < 1, phase = !state.ledgeLowered ? 'floor' : !state.ropeUp ? 'terrace' : 'rim', w = upper.world.bind(upper);
    // (from the open side; on a portrait screen the gorge is long across a narrow view, so the camera stands behind it and high, looking along it)
    const SHOTS = {
      floor: { points: [[-12, 0, -4], [-2, 1.5, 3], [-1, 5.6, -3.4], [8, 2.6, -4]], focus: [-3, 1.4, 0], front: portrait ? [-.9, -.5] : [-.34, -1], elevation: portrait ? 42 : 21 },
      terrace: { points: [[3.4, 1.9, -5], [10, 4, 5], [16, 5.2, 5], [23.4, 9, 11], [22, 11.6, 10]], focus: [13, 5.2, 3], front: portrait ? [-.6, -.8] : [-.12, -1], elevation: portrait ? 44 : 21 },
      rim: { points: [[21, 9, 5], [34, 9, 10], [28, 12, 8]], focus: [27, 9.5, 7], front: portrait ? [-.55, -.8] : [-.15, -1], elevation: portrait ? 44 : 21 },
    }[phase];
    const d = upper.direction(...SHOTS.front), e = Math.PI / 180 * SHOTS.elevation;
    return stage.cue(SHOTS.points.map(p => w(...p)), { key: `upper-${phase}`, focus: w(...SHOTS.focus).toArray(), direction: [d.x * Math.cos(e), Math.sin(e), d.z * Math.cos(e)] });
  }

  api = {
    layout,
    // The points the overview adds to the board, the rests and Mosi: the tunnel and the walls behind it.
    overviewPoints: Object.freeze([[-8, 6, -14], [4, 6, -16], [-14, 3, -2], [14, 3, -8]]),
    /** The things the friends' walks and play keep clear of: the tunnel and the boulders. */
    navObjects: () => gorge?.solids ?? [],
    // The search view in the glade; once everyone is through the tunnel, the view of the place the next step is at (upperCue).
    cameraCue: glade => mover?.upper.where() === 'glade' || !upper ? glade() : upperCue(),
    /** The overview button, once everyone is in the upper gorge: the whole of it, high (the glade is far away and hidden). Null in the glade: the shared overview. */
    overviewCue(cue) {
      if (!upper || !mover || mover.upper.where() === 'glade') return null;
      const portrait = stage.aspect() < 1, w = upper.world.bind(upper), front = portrait ? [-.55, -.8] : [-.25, -1], d = upper.direction(...front), e = Math.PI / 180 * (portrait ? 52 : 40);
      return cue([[-14, 0, -6], [-3, 4, 4], [10, 3, -6], [24, 9, 12], [36, 9, 10], [20, 6, 0]].map(p => w(...p)), { key: 'overview', phase: 'overview', focus: w(12, 4, 2).toArray(), direction: [d.x * Math.cos(e), Math.sin(e), d.z * Math.cos(e)] });
    },

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
      upperModels = await loadUpperModels();
      upper = createUpperGorge({ scene, models, upperModels, glow });
      interior = createTunnelInterior({ tunnel: gorge.tunnel, models, fx: stage.fx, glow, reducedMotion: stage.reducedMotion });
      // The rope: tied at the foot of the cliff, it runs up the path's right edge to the tree; its texture is the owner's approved ambientCG rope.
      const rail = upper.rail.map(p => new THREE.Vector3(p.x, p.y, p.z + 0)), sideway = rail.map((p, k) => { const a = rail[Math.max(0, k - 1)], b = rail[Math.min(rail.length - 1, k + 1)], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1; return new THREE.Vector3(p.x - dz / len * 1.55, p.y, p.z + dx / len * 1.55); });
      rope = createRope(stage, { from: upper.anchors.stake, to: new THREE.Vector3(7.5, 0, .6), parent: upper.group, groundAt: upper.groundAt, route: [upper.anchors.stake, ...sideway.slice(1)], trunk: upper.tree });
      mover = createGorgeMover({ stage, interior, plates, tunnel: gorge.tunnel, level, upper, rope, setLower: visible => { gorge.group.visible = visible; } });
      mover.setReducedMotion(stage.reducedMotion());
      if (stage.params.has('qa')) globalThis.__gorge = { interior, gorge, upper, rope, glow, stage, mover, plates, get api() { return api; } };
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
      // (`edge`: on a phone the tunnel is at the very edge of the search view, or just outside it: its button then stays at the edge of the screen, where a finger finds it)
      const target = (id, point) => ({ id, point, enabled: true, next: state.next === id, tapAlong: waiting?.target === id, radius: 1.8, edge: true });
      if (!state.tunnelLit) return [target('tunnel', mouthPoint().add(new THREE.Vector3(0, 1.3, 0)))];
      // (the pile is a little way in at the mouth, which a portrait view can leave at its edge: the button is at the mouth, over the pile's front, so that it is on the screen wherever the tunnel is)
      if (!state.rocksFallen) return [target('rocks', mouthPoint().add(new THREE.Vector3(0, 1.1, 0)))];
      // (beyond the tunnel, the upper gorge: the ledge, then the cliff; buttons on the screen's edge are kept inside it like the tunnel's on a phone)
      if (mover.upper.where() === 'glade') return [];
      if (!state.ledgeLowered) return [target('ledge', upper.world(.2, 1.6, 0))];
      if (!state.ropeUp) return [target('cliff', upper.world(15, 5, 3))];
      return [];
    },
    /** Where the big tap-along button of an obstacle sits: over the mouth for the tunnel, over the pile for the rocks. */
    tapPoint: id => id === 'rocks' ? interior.pile.centre() : id === 'ledge' ? upper.world(.2, 1.6, 0) : id === 'cliff' ? upper.world(15, 5, 3) : mouthPoint().add(new THREE.Vector3(0, 1.3, 0)),

    // ---- the steps ----
    /** Plays a step (its script): the id of the script, or null when it cannot start now. */
    playStep(id) {
      switch (id) {
        case 'light': return playTask(() => lightScene(script));
        case 'headbutt': return playTask(() => headbuttScene(script));
        case 'through': return playTask(() => throughScene(script));
        case 'reach': return playTask(() => reachScene(script));
        case 'fly': return playTask(() => flyScene(script));
        case 'climb': return playTask(() => climbScene(script));
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
    /** QA only (?qa=1): the camera looks at points of the upper gorge's frame from the frame's direction `front` (to the camera), `elevation` degrees up. */
    qaUpper({ points, front = [-.2, -1], elevation = 24, kind = 'wide', scale, floor } = {}) { upper.show(); gorge.group.visible = false; stage.director.shot({ kind, subjects: () => points.map(p => upper.world(...p)), front: upper.direction(...front), elevation, cut: true, scale, floor }); },
    /** QA only (?qa=1): the round as it stands before the walk through the tunnel (the friends at their rests, the tunnel lit, the rocks gone, the Kambeðlur holding the light), and then the walk starts. */
    qaThrough() {
      level.friends.forEach((species, i) => { const actors = stage.babies.filter(actor => actor.species === species), nest = stage.nests[i]; mover.bindPair(species, actors); actors.forEach((actor, k) => { actor.root.position.copy(nest.root.position).add(nest.restOffsets[k]); actor.root.rotation.y = nest.restYaw; actor.root.visible = true; actor.setMotion?.('idle'); }); });
      const state = { selected: null, unlocked: [...level.friends], free: [...level.friends], asking: null, failing: null, active: null, done: ['light', 'headbutt'], tunnelLit: true, rocksFallen: true, next: null, phase: 'available' };
      api.setStepState(state); plates.setAll(1, { duration: 0 }); interior.light(1, { seconds: 0 }); interior.pile.set(3); mover.hold('stegosaurus');
      return api.playStep('through');
    },
    qaPlace(formation) { for (const species of level.friends) mover.bindPair(species, stage.babies.filter(actor => actor.species === species)); return mover.upper.qaPlace(formation); },
    isBusy: () => Boolean(mover?.isBusy()),
    /** The step rules' state (step-rules.js getState()). */
    setStepState(state) { snapshot = { ...state }; mover?.setState(snapshot); },
    /** The events the mover raised since the last call ({ type, id... }: 'bridge-complete', the beats, the light and the rocks, the goes). */
    pollEvents: () => mover?.pollEvents() ?? [],

    // ---- every frame ----
    update(dt) { mover?.update(dt); interior?.update(dt); plates.update(dt); rope?.update(); },
    afterActors() {},

    // ---- who is where ----
    /** The pairs at work: the mover binds a pair once both are home, and says which it holds (the Kambeðlur hold the light), where it is and who is on its way. */
    bindPair: (species, members) => mover?.bindPair(species, members),
    ownsPair: species => Boolean(mover?.ownsPair(species)),
    pairCentre: species => mover?.pairCentre(species) ?? new THREE.Vector3(),
    hasTravelReservation: actor => Boolean(mover?.hasReservation(actor)),
    visited: () => false,
    /** The child may greet a pair at its home whenever no pair has been picked for a job. */
    nestSelectable: species => !snapshot?.selected && !mover?.holds(species) && (!mover || mover.upper.where() === 'glade'), // (a pair that holds the light stands at the tunnel and is not greeted: its button would only lie over the obstacle's)
    mosiPlace: () => !mover || mover.upper.where() === 'glade' && !mover.upper.walkers.isWalking(stage.mosi.actor) ? { ...spot } : null,
    mosiObstacle: () => !mover || mover.upper.where() === 'glade' && !mover.upper.walkers.isWalking(stage.mosi.actor),
    /** The ground under a friend at (x, z): the upper gorge's, when everyone is there (Mosi's contact shade lies on it). */
    groundAt: (x, z) => mover?.upper.where() !== 'glade' && upper ? upper.heightAt(x, z) : null,

    // ---- the ground ----
    /** Why a waiting friend may not play at (x, z): at the foot of a wall. */
    avoidIdle(x, z) { const [u, v] = frame.toGrid(x, z); return outside(u, v) > -2.4 ? 'wall' : null; },

    // ---- the page's debug and the round's end ----
    getDebug() {
      return { bridge: mover?.debug() ?? {}, mosiWalk: null, mosiAcross: false, river: null, collisionObjects: [],
        stats: gorge ? { upper: upper ? { where: mover?.upper.where(), ...mover?.upper.debug(), slab: upper.slab.angle, clock: +mover.time().toFixed(2), ...upper.stats(), rope: rope?.debug() } : null, gorge: gorge.stats(), tunnel: interior ? { light: +interior.level.toFixed(3), pile: interior.pile.stage, falling: interior.pile.isFalling(), plates: plates.target, ...interior.stats() } : null } : null };
    },
    setReducedMotion(value) { mover?.setReducedMotion(value); },
    reset() { snapshot = null; taskScript = null; rope?.reset(); mover?.reset(); plates.setAll(0, { duration: 0 }); interior?.reset(); upper?.reset(); if (gorge) gorge.group.visible = true; },
    dispose() { interior?.dispose(); upper?.dispose(); gorge?.dispose(); groundLook?.dispose(); },
  };
  return api;
}
