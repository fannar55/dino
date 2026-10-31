import { CORRIDORS, installGroundLook } from './ground.js';
import { dressGround } from './dressing.js';
import { createBridgeAdventure, wetGround } from './adventure.js';
import { bridgeValley, refineBridgeGround, riverDistance, RIVER, MARSH, BRIDGE } from './bridge-props.js';
import { createGladeScenery } from './scenery.js';
import { bridgeCollisionObjects } from '../../memory-clearance.js';
import { sampleTravel } from '../../travel-traffic.js';
import { measureWalkGait } from '../../walk-gait.js';
import { branchScene, failScene } from './scenes/branch.js';
import { rollScene } from './scenes/roll.js';
import { crossScene } from './scenes/cross.js';
import { layScene } from './scenes/lay.js';
import { finishScene } from './scenes/finish.js';

// Mosi is MOSI_HALF metres from his middle to his nose (and about as far to his tail) when the friends walk behind him.
const MOSI_HALF = 2.1;
const turnToward = (from, to, amount) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * amount;
// The points the overview adds to the board, the rests and Mosi: the river, the staging spot, the marsh and the berry grove.
const OVERVIEW_POINTS = Object.freeze([[-2, 1.8, -30], [10.5, 2.4, -30], [-2, 1, -22], [11, 1, -22], [-1, 1.5, -14], [10, 1.5, -14]]);

/**
 * Level 1's world: the river and the marsh, the berry grove, the branch, the log, the boardwalk and the mover that plays them
 * (adventure.js), the scenes of the five steps (scenes/), Mosi's walk over the bridge and to the grove, the glade's low plants
 * and the ground's look. world.js (shared) builds the renderer, the leaves, the nests and the friends and hands them over as `stage`
 * (levels/worlds.js says what is in it and what a level's world gives back).
 */
export function createLevelWorld(stage) {
  const { THREE, scene, fx, nests, scenes } = stage;
  const spot = stage.level.mosiSpot, mosiActor = () => stage.mosi.actor;
  const freshState = () => ({ selected: null, atStaging: false, boardwalkBuilt: false, visited: false });
  let adventure, groundLook, gladeScenery, taskScript = null, snapshot = freshState();
  // Mosi's walk over the bridge (the crossing moves him; nothing else does), where he stands now, and his walk clip's own speed.
  let mosiWalk = null, mosiAcross = false, mosiPlace = { ...spot }, mosiPace = 0;

  // What the forest is grown from (world.js adds the rest: seed, clearing, far rings, the leaves' places).
  const layout = {
    path: [[-20, 11], [-8, 8], [-6, 4], [-3.4, .4], [-1, -3], [4, -9], [4.5, -15], [4.5, -23], [4.5, -27]],
    // Keep the playable oval bare and clear the foreground camera corridor.
    // This also gates grass generation, so blades cannot poke through hiding places.
    keepOut(x, z) {
      const glade = Math.hypot((x + 4.5) / 9, (z - 6.4) / 7.2), working = Math.hypot((x + 3) / 4.8, (z + 3.5) / 3.6), staging = Math.hypot((x - 4.5) / 6.8, (z + 13.8) / 4.5), berries = Math.hypot((x - 4.5) / 6.8, (z + 26) / 4.8);
      const marsh = Math.hypot((x - MARSH.center[0]) / (MARSH.halfWidth + 1.2), (z - MARSH.center[1]) / (MARSH.halfDepth + 1.1));
      const bare = 1 - THREE.MathUtils.smoothstep(Math.min(glade, working, staging, berries, marsh), .9, 1.12);
      const water = 1 - THREE.MathUtils.smoothstep(riverDistance(x, z).distance, RIVER.halfWidth + .1, RIVER.halfWidth + .65);
      // Full-height procedural crowns must stay outside every automatic
      // camera corridor. Authored low plants frame these foreground edges.
      const cameraCorridor = CORRIDORS.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z >= z0 && z <= z1);
      return Math.max(bare, water, cameraCorridor ? 1 : 0);
    },
    lift(x, z) { return bridgeValley(x, z); },
    // The low plants that dress the ground: `dress({ avoid })` lists them (dressing.js), given where they may not stand (`avoid(x, z, margin)`).
    dress: dressGround,
  };

  // The things the friends' walks keep clear of beside the leaves: the log and the branch (as measured), the glade's stones and trunks.
  function navObjects() {
    const debug = adventure?.getDebug(), collision = debug?.collision; if (!collision) return gladeScenery?.navigationObjects ?? [];
    const measured = bridgeCollisionObjects(debug);
    const matrix = new THREE.Matrix4().fromArray(collision.logMatrix), a = new THREE.Vector3(-collision.logLength / 2, 0, 0).applyMatrix4(matrix), b = new THREE.Vector3(collision.logLength / 2, 0, 0).applyMatrix4(matrix);
    const result = [{ id: 'main-log', a, b, radius: collision.logRadius, parts: measured.find(value => value.id === 'main-log')?.parts }];
    for (const tube of collision.tubes ?? []) for (let i = 1; i < tube.points.length; i++) result.push({ id: tube.id, a: new THREE.Vector3(...tube.points[i - 1]), b: new THREE.Vector3(...tube.points[i]), radius: tube.radius, parts: [measured.find(value => value.id === tube.id)?.parts[i - 1]].filter(Boolean) });
    return [...result, ...(gladeScenery?.navigationObjects ?? [])];
  }

  // The camera's cue while the mover works: its own cue, turned and widened for the scenes. `glade` gives the search view.
  function cameraCue(glade) {
    const cue = adventure?.getCameraCue?.(); if (!cue || cue.key === 'glade') return glade();
    // The bridge is built and every friend is home, but gifts are left: the camera stays on the search view, where each leaf is the size it
    // is when the child plays (the wide view of the bridge made them small), and every leaf, shut or not, is in it. Only once the last pair
    // has landed in the basket does it glide out to the wide view; the crossing starts from there (game.js waits for a still camera).
    if (cue.key === 'bridge-ready' && stage.giftsWait()) return glade();
    if (cue.key === 'branch') return { ...cue, points: [...cue.points, [-10.2, 2.3, -5.0], [-10.2, 0, -1.8]], direction: [.85, .9, .35] };
    if (cue.key === 'rolling-log') {
      // Keep the route establishing shot wide, then show the two helpers and
      // their contact with the near end. The far log tip may leave this frame.
      if (['brace', 'roll', 'settle'].includes(cue.phase)) {
        const points = [];
        for (const x of [-6.0, 1.8]) for (const z of [-7.3, .7]) for (const y of [.03, 2.5]) points.push([x, y, z]);
        return { ...cue, key: 'rolling-contact', focus: [-2.1, .8, -2.7], points, direction: [-.5, .85, .8] };
      }
      return { ...cue, direction: [-.5, .85, .8] };
    }
    return cue.key === 'lay' ? { ...cue, direction: [.8, .9, -.6] } : cue;
  }

  // ---- Mosi's walk ----
  // Mosi walks the crossing at the friends' pace: along the way's points (their heights too, so he goes up the ramp and
  // over the log), the body pitched with the slope, his walk clip at the pace; at the end he turns to his place's heading.
  function startMosiWalk(plan) {
    if (mosiWalk || mosiAcross || !plan?.points?.length) return false;
    const mosi = mosiActor(), lengths = [0];
    for (let i = 1; i < plan.points.length; i++) lengths.push(lengths[i - 1] + plan.points[i].distanceTo(plan.points[i - 1]));
    if (!mosiPace) {
      const feet = []; mosi.model.traverse(bone => { if (bone.isBone && /Foot/.test(bone.name)) feet.push(bone); });
      mosiPace = (measureWalkGait(mosi.model, mosi.root, mosi.clips.get('walk'), feet)?.naturalSpeed ?? 2) * mosi.root.scale.x;
    }
    const speed = plan.speed ?? adventure.crossSpeed();
    mosiWalk = { route: { points: plan.points, lengths, total: lengths.at(-1) }, speed, yaw: plan.yaw, age: 0, settle: 0, deckAt: lengths[Math.max(0, plan.deckStart)] ?? 0, onDeck: false, stopped: false };
    mosi.lookAt(null); mosi.play('walk', { fade: .25, timeScale: THREE.MathUtils.clamp(speed / Math.max(.1, mosiPace), .5, 3) });
    return true;
  }
  function updateMosiWalk(dt) {
    const walk = mosiWalk; if (!walk || !(dt > 0)) return;
    const mosi = mosiActor(), reducedMotion = stage.reducedMotion();
    walk.age += dt;
    const { route } = walk, distance = Math.min(route.total, walk.age * walk.speed), at = d => sampleTravel(route, THREE.MathUtils.clamp(d / Math.max(.01, route.total), 0, 1));
    if (distance < route.total) {
      const here = at(distance);
      mosi.root.position.set(here.point.x, here.point.y - .04, here.point.z);
      mosi.root.rotation.y = turnToward(mosi.root.rotation.y, here.yaw, reducedMotion ? 1 : 1 - Math.exp(-dt / .14));
      mosi.root.rotation.z = Math.atan2(at(distance + 1.1).point.y - at(distance - 1.1).point.y, 2.2);
      walk.onDeck ||= distance >= walk.deckAt;
      return;
    }
    if (!walk.stopped) { walk.stopped = true; mosi.root.rotation.z = 0; mosi.play('idle', { fade: .35, timeScale: reducedMotion ? 0 : 1 }); }
    walk.settle += dt;
    mosi.root.rotation.y = turnToward(mosi.root.rotation.y, walk.yaw, reducedMotion ? 1 : 1 - Math.exp(-dt / .12));
    if (walk.settle < .45) return;
    mosi.root.rotation.y = walk.yaw; mosiWalk = null; mosiAcross = true;
    mosiPlace = { x: mosi.root.position.x, z: mosi.root.position.z, heading: -THREE.MathUtils.radToDeg(walk.yaw) };
  }

  // ---- the scripts of the steps ----
  // What scenes/*.js are given: the shared stage (what the first minute's scripts use too) and, on top of it, the obstacles' side of a
  // task script (the mover moves the friends) and Mosi's walk.
  const script = Object.create(stage);
  script.mosi = Object.assign(Object.create(stage.mosi), {
    // The crossing's way for him (adventure.js leaderRoute), at the friends' pace.
    walk: plan => startMosiWalk(plan),
    walking: () => Boolean(mosiWalk),
  });
  script.task = {
    start(id, options) { stage.idle?.settle(); const started = adventure.start(id, options); stage.refresh(); return started; },
    beat: () => adventure.beat(),
    waitingBeat: () => adventure.waitingBeat(),
    busy: () => adventure.isBusy(),
    abort() { if (taskScript != null) scenes.cancel(taskScript); taskScript = null; stage.director.release({ duration: .6 }); },
    point: id => adventure.getTargets().find(target => target.id === id)?.point.clone() ?? new THREE.Vector3(),
    branch: () => adventure.branchPoints(),
    // The log (scenes/roll.js, scenes/cross.js): has it landed, its two ends, and how far along the bridge a point is.
    isBuilt: () => adventure.isBuilt(),
    logNear: () => adventure.logNear(),
    logEnd: progress => adventure.logEnd(progress),
    builderSpots: () => adventure.builderSpots(),
    alongBridge: point => (point.x - BRIDGE.near[0]) * BRIDGE.axis[0] + (point.z - BRIDGE.near[1]) * BRIDGE.axis[1],
    // The marsh (scenes/lay.js, scenes/finish.js): the lay's phase and panel, the panel the pair carries, where the panels lie and the stack they come from.
    layState: () => adventure.layState(),
    cargo: () => adventure.cargoPoint(),
    panelCentre: i => adventure.panelCentre(i),
    supply: () => adventure.supplyPoint(),
    // The bridge is built: the Þórseðlur let the branch go and walk home.
    lowerBranch() { stage.idle?.settle(); const started = adventure.start('lower'); stage.refresh(); return started; },
  };

  // A task script (the branch, the log, the bark): the scene starts the mover, and if the mover did not start it the scene is dropped.
  function playTask(make) {
    const director = stage.director;
    if (director.mode() !== 'auto' || adventure.isBusy()) return null;
    taskScript = scenes.play(make());
    if (!adventure.isBusy()) { scenes.cancel(taskScript); taskScript = null; director.release({ cut: true }); return null; }
    return taskScript;
  }
  // Mosi leads all six over the bridge (scenes/cross.js). Null when it cannot start now (it is tried again later).
  function playCross() {
    const director = stage.director;
    if (!director.isInteractive() || adventure.isBusy() || mosiWalk) return null;
    const plan = mosiAcross ? null : adventure.leaderRoute(mosiActor().root.position.clone()), speed = adventure.crossSpeed();
    let timing = { lead: null, deck: 0, mid: 1.6, arrive: 3 };
    if (plan) {
      const lengths = [0]; for (let i = 1; i < plan.points.length; i++) lengths.push(lengths[i - 1] + plan.points[i].distanceTo(plan.points[i - 1]));
      // The friends line up behind where his middle would have passed their own way onto the deck (plan.ahead metres back).
      const middle = plan.points.findIndex(point => script.task.alongBridge(point) >= BRIDGE.length / 2);
      timing = { lead: { at: Math.max(0, lengths[plan.deckStart] - plan.ahead) / speed, half: MOSI_HALF }, deck: lengths[plan.deckStart] / speed, mid: lengths[middle] / speed, arrive: lengths.at(-1) / speed + .45 };
    }
    taskScript = scenes.play(crossScene(script, plan, timing));
    if (!adventure.isBusy()) { scenes.cancel(taskScript); taskScript = null; director.release({ cut: true }); return null; }
    return taskScript;
  }
  // Mosi leads all six over the boardwalk to the berry grove (scenes/finish.js). Null when it cannot start now (it is tried again later).
  function playFinish() {
    const director = stage.director;
    if (!director.isInteractive() || adventure.isBusy() || mosiWalk) return null;
    const plan = adventure.groveRoute(mosiActor().root.position.clone()), speed = plan.speed;
    const lengths = [0]; for (let i = 1; i < plan.points.length; i++) lengths.push(lengths[i - 1] + plan.points[i].distanceTo(plan.points[i - 1]));
    // The friends line up behind where his middle passes the foot of the boardwalk; he is mid-boardwalk when his z passes the second panel.
    const middle = Math.max(1, plan.points.findIndex(point => point.z <= -19.5));
    const timing = { lead: { at: Math.max(0, lengths[plan.deckStart] - plan.ahead) / speed, half: MOSI_HALF }, deck: lengths[plan.deckStart] / speed, mid: lengths[middle] / speed, arrive: lengths.at(-1) / speed + .45 };
    mosiAcross = false;
    taskScript = scenes.play(finishScene(script, plan, timing));
    if (!adventure.isBusy()) { scenes.cancel(taskScript); taskScript = null; mosiAcross = true; director.release({ cut: true }); return null; }
    return taskScript;
  }

  // The friends' walks for the mover (the planner is the shared stage's): a friend parked by the log for the crossing may start beside the
  // Þórseðla babies holding the branch.
  function planWalk(actor, end, { yaw } = {}) {
    const action = adventure?.getDebug().action, pushing = actor.species === 'triceratops' && action?.id === 'roll';
    // Their capsules overlap there (theirs is as wide as the round belly all along the neck), so near the start the
    // planner checks the measured bodies instead.
    const crossing = action?.id === 'cross' && action.phase === 'cross';
    // So may a Þórseðla that has just let the branch go: her neck starts under it.
    const releasing = actor.species === 'brontosaurus' && action?.id === 'lower';
    return stage.planWalk(actor, end, { yaw, allowEndContact: pushing && action.phase === 'approach', allowStartContact: pushing && action.phase === 'return' || crossing || releasing });
  }

  return {
    layout,
    overviewPoints: OVERVIEW_POINTS,
    navObjects,
    cameraCue,

    /** Builds what stands on the forest, once it, the leaves and the rests exist: the ground's look, the glade's low plants and the mover. */
    build() {
      // This scene has a broader open floor than the story chapters: the ground shader gets its own colours, sand and mud.
      const groundMaterial = scene.getObjectByName('Forest ground')?.material;
      if (groundMaterial) groundLook = installGroundLook(groundMaterial, { beds: stage.leaves });
      refineBridgeGround(stage.forest, stage.heightAt);
      gladeScenery = createGladeScenery({ scene, heightAt: stage.heightAt }, { avoid: stage.onLeafGround });
      adventure = createBridgeAdventure({ scene, heightAt: stage.heightAt, nests, fx, onwardTravel: true, hopOver: stage.hopOver, cancelWalk: stage.cancelWalk, planSpent: stage.planSpent, planWalk });
    },

    // ---- the obstacles ----
    /** The obstacles the child may tap: { id, point, enabled, next, tapAlong } (tapAlong: a script waits for taps on it now). */
    getTargets() {
      const waiting = scenes.waiting();
      return (adventure?.getTargets() ?? []).map(target => ({ id: target.id, point: target.point, enabled: target.enabled, next: Boolean(target.next), tapAlong: waiting?.target === target.id }));
    },
    /** Where the big tap-along button of an obstacle sits: over the two crowns for the branch, over the bark for the bark. */
    tapPoint(id) {
      const crowns = id === 'branch' ? stage.pair('brontosaurus').map(actor => actor.getSupportPosition(new THREE.Vector3())) : [];
      if (crowns.length) return crowns.reduce((sum, crown) => sum.add(crown), new THREE.Vector3()).multiplyScalar(1 / crowns.length).add(new THREE.Vector3(0, .35, 0));
      return id === 'bark' ? adventure.cargoPoint().add(new THREE.Vector3(0, .5, 0)) : adventure.getTargets().find(target => target.id === id).point;
    },

    // ---- the steps ----
    /** Plays a step (its script): the id of the script, or null when it cannot start now. */
    playStep(id) {
      switch (id) {
        case 'lift': return playTask(() => branchScene(script));
        case 'roll': return playTask(() => rollScene(script));
        case 'lay': return playTask(() => layScene(script));
        case 'cross': return playCross();
        case 'finish': return playFinish();
        default: return null;
      }
    },
    /** A wrong friend's go at an obstacle (scenes/branch.js failScene). False when it cannot start now. */
    startFail(species, target) {
      if (stage.director.mode() !== 'auto') return false;
      stage.idle?.settle(); const timing = adventure.startFail(species, target); if (!timing) return false;
      taskScript = scenes.play(failScene(script, species, target, timing));
      return true;
    },
    isBusy: () => Boolean(adventure?.isBusy()),
    /** The step rules' state (step-rules.js getState()). */
    setStepState(state) { snapshot = { ...state }; adventure.setState(state); },
    /** The events the mover raised since the last call ({ type, id... }: 'bridge-complete', 'bridge-blocked', the beats and the steps' own). */
    pollEvents: () => adventure.pollEvents(),

    // ---- every frame ----
    update(dt) { adventure.update(dt); gladeScenery.update(stage.time(), stage.reducedMotion()); },
    afterActors(dt) { adventure.afterActors(dt); },
    /** Mosi's walk, where his own update follows. */
    updateMosi(dt) { updateMosiWalk(dt); },

    // ---- who is where ----
    /** The pairs at work: the mover binds a pair once both are home, and says which it holds, where it is and who is on its way. */
    bindPair: (species, members) => adventure.bindPair(species, members),
    ownsPair: species => adventure.ownsPair(species),
    pairCentre: species => adventure.pairCentre(species),
    hasTravelReservation: actor => adventure.hasTravelReservation(actor),
    /** The grove has been reached. */
    visited: () => adventure.isVisited(),
    /** May the child greet this pair at its home now? Not while a pair has been picked, and across the river only the Kambeðlur (they build the walkway). */
    nestSelectable: species => adventure.isVisited() || !snapshot.selected && (!snapshot.atStaging || !snapshot.boardwalkBuilt && species === 'stegosaurus'),
    /** Where Mosi stands now ({ x, z, heading }), null while he walks; and whether the friends' walks keep clear of him (he stands in the glade). */
    mosiPlace: () => mosiWalk ? null : mosiPlace,
    mosiObstacle: () => !snapshot.atStaging && !mosiWalk && !mosiAcross,

    // ---- the ground ----
    /** The water the effects ripple in, the boardwalk's wood they thud on and the river the walks keep out of. */
    wet: wetGround,
    wood: (x, z) => adventure?.onWalkway(x, z) ?? false,
    riverDistance,
    /** Why a waiting friend may not play at (x, z): 'wet', 'boardwalk' or 'river'; null when it may. */
    avoidIdle(x, z) {
      if (wetGround(x, z)) return 'wet';
      if (adventure.onWalkway(x, z)) return 'boardwalk';
      if (riverDistance(x, z).distance < RIVER.halfWidth + 1.6) return 'river';
      return null;
    },

    // ---- the page's debug and the round's end ----
    getDebug({ collision = false } = {}) {
      return {
        bridge: adventure.getDebug(),
        mosiWalk: mosiWalk ? { onDeck: mosiWalk.onDeck, distance: +Math.min(mosiWalk.route.total, mosiWalk.age * mosiWalk.speed).toFixed(2), total: +mosiWalk.route.total.toFixed(2) } : null,
        mosiAcross,
        river: { points: RIVER.points, halfWidth: RIVER.halfWidth, waterY: RIVER.waterY },
        collisionObjects: collision ? gladeScenery.collisionObjects : [],
      };
    },
    /** The mover is calm too; Mosi on his way over the bridge or to the grove keeps his walk clip (only its time scale is set again, the same as it was started with: his speed is already the calm one); standing, he idles, still when calm. */
    setReducedMotion(value) {
      adventure.setReducedMotion(value);
      const mosi = mosiActor();
      if (mosiWalk && !mosiWalk.stopped) mosi.play('walk', { fade: 0, timeScale: THREE.MathUtils.clamp(mosiWalk.speed / Math.max(.1, mosiPace), .5, 3) });
      else mosi.play('idle', { timeScale: value ? 0 : 1 });
    },
    /** A new round: the mover, Mosi's walk and the step state forget everything. */
    reset() {
      taskScript = null; mosiWalk = null; mosiAcross = false; mosiPlace = { ...spot };
      adventure.reset(); snapshot = freshState();
    },
    dispose() { adventure?.dispose(); groundLook?.dispose(); gladeScenery?.dispose(); },
  };
}
