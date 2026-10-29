import * as THREE from 'three';
import { pickQuality } from '../quality.js';
import { pickLook } from '../looks.js';
import { createLighting } from '../lighting.js';
import { installDepthShadows } from '../shadows.js';
import { installFog } from '../fog.js';
import { createSky } from '../sky.js';
import { createWind } from '../wind.js';
import { createPointResolver } from '../points.js';
import { createActor } from '../actor.js';
import { prepareCharacter, releaseCharacter, updateCharacterLods } from '../character-lod.js';
import { createForest } from '../../world/forest/forest.js';
import { createLeafResources, makeLeaf, poseLeaf, createContactResources, makeContact, createClearingFloor, createGladeScenery } from './world-props.js';
import { createBridgeAdventure } from './bridge-adventure.js';
import { bridgeValley, refineBridgeGround, riverDistance, RIVER, MARSH } from './bridge-props.js';
import { createMemoryShadowLods } from './world-character-shadows.js';
import { createCameraDirector } from './camera-director.js';
import { createWorldFx } from './world-fx.js';
import { measureActor, actorCollisionSnapshot, bridgeCollisionObjects } from './memory-clearance.js';
import { createHomeNavigation } from './world-home-nav.js';
import { createForestVisibility } from './world-forest-visibility.js';
import { createSceneRunner } from './scenes.js';
import { createMosiPuppet } from './mosi-puppet.js';
import { revealScene, mismatchScene, matchScene } from './scenes/first-minute.js';
import { SURPRISE_ITEMS, createSurpriseItem } from './surprise-items.js';

// Eight leaves in a 4 x 2 grid turned toward the search camera: the four of a row run across the screen (each `across`
// metres from the next), the two rows `deep` apart, so the board is as wide on the screen as it can be made narrow.
function leafGrid({ centre: [cx, cz], angle, across, deep }) {
  const a = [Math.cos(angle), -Math.sin(angle)], d = [-Math.sin(angle), -Math.cos(angle)], cells = [];
  for (const row of [0, 1]) for (const col of [0, 1, 2, 3]) cells.push([cx + a[0] * (col - 1.5) * across + d[0] * (row - .5) * deep, cz + a[1] * (col - 1.5) * across + d[1] * (row - .5) * deep].map(v => Math.round(v * 100) / 100));
  return cells;
}
const CELLS = leafGrid({ centre: [-4, 7], angle: Math.PI / 6, across: 3.1, deep: 3.7 });
// The Þórseðla babies' rest (the third) stands 1.15 m nearer the leaves than the adults' did, so their longer tails
// stay clear of the branch lying behind them.
const NESTS = [[.2, .4], [-8.8, .9], [-6, -.2]];
const SPECIES = ['triceratops', 'stegosaurus', 'brontosaurus'];
const SHOT = { position: [12, 24, 25], target: [-1, .1, -2.8], fov: 35 };
// Mosi stands at the glade's west edge and faces the leaves (heading 0 = +X).
const MOSI_SPOT = Object.freeze({ x: -3.2, z: 1.4, heading: 90 });
// The search view: low and from the side, as in the approved mock. Landscape looks in from the south-east
// with the log and river behind the leaves; portrait looks along the rows from the east, so the two columns
// fill the width, the rows fill the height and Mosi watches from the far end.
const GLADE_VIEW = Object.freeze({ landscape: [.464, .375, .803], portrait: [.77, .64, 0] });
// A tapped leaf squashes first (TAP.squash), then swings away over TAP.swing; what it hid appears after. A surprise pops up,
// hovers, then flies to the basket in the ribbon (the screen point basketPoint() says), TARGET metres in front of the camera.
const TAP = Object.freeze({ squash: .16, swing: .3 });
const SURPRISE = Object.freeze({ pop: .3, rise: .5, hold: .8, fly: .75, hover: 1.2, target: 6, shrink: .12 });
// The leaf's squash and rebound: a damped spring round 0 (stiffness, damping), kicked by a tap or a landing.
const SPRING = Object.freeze({ stiffness: 520, damping: 17 });
// A matched pair hops home in a straight line, lifted over the closed leaves it crosses (the board is too crowded for a
// walking route): metres per hop, average metres a second, the root's own arc, the lift over a leaf and how far its reach is.
const HOP = Object.freeze({ reach: 2.8, speed: 5, arc: .2, leap: .75, dome: 1, margin: 1.9 });
const smooth = t => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOutBack = t => { const k = THREE.MathUtils.clamp(t, 0, 1) - 1; return 1 + 2.4 * k * k * k + 1.4 * k * k; };
const turnToward = (from, to, amount) => from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * amount;
const visibleStatus = value => ['open', 'revealed', 'selected', 'matched', 'found'].includes(value);
const matchedStatus = value => ['matched', 'found'].includes(value);
// Each friend's size is baked into its model (baby-actors.js lengthFactor: the Þórseðla baby stands
// tallest); the roots stay at scale 1. The culling sphere grows with that size.
const actorSize = actor => actor.lengthFactor ?? 1;
const restOffset = species => species === 'triceratops' ? 1.05 : species === 'stegosaurus' ? .85 : 1.15;
const restHeading = () => -Math.PI * 70 / 180;
const restVector = (species, member) => new THREE.Vector3(Math.sin(restHeading()) * restOffset(species) * (member ? -1 : 1), .1, Math.cos(restHeading()) * restOffset(species) * (member ? -1 : 1));

/** The memory clearing owns its render context; game.js owns the RAF and game clock. */
export async function createMemoryWorld({ canvas, onProgress = () => {}, basketPoint = () => null }) {
  if (!canvas) throw new TypeError('Memory world needs its canvas.');
  const params = new URLSearchParams(globalThis.location?.search || '');
  const preset = pickQuality(params);
  const q = { ...preset, trees: preset.trees * .22, grass: preset.grass * .07, plants: preset.plants * .28 };
  const base = pickLook('morning');
  const look = { ...base, sun: { ...base.sun, azimuth: 135, elevation: 48, color: '#ffe4b9', intensity: 2.75 }, hemi: { ...base.hemi, sky: '#d2e4e9', ground: '#8b7956', intensity: .72 }, fog: { ...base.fog, color: '#c4d1c7', density: .009 }, envIntensity: .62 };
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: q.antialias, alpha: false, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = look.exposure; renderer.shadowMap.enabled = q.shadowSize > 0;
  renderer.shadowMap.type = THREE.PCFShadowMap; renderer.info.autoReset = false;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(SHOT.fov, 1.6, .1, 600);
  camera.name = 'Minnisspil · fast sjónarhorn';
  const lighting = createLighting(scene, look, q), depthShadow = installDepthShadows(renderer, lighting.sun);
  lighting.sun.shadow.radius = 1.65;
  installFog(scene, look, lighting.direction);
  const sky = createSky({ renderer, scene, look, sunDir: lighting.direction });
  const wind = createWind(); wind.uniforms.uWindStrength.value = .38;
  const layout = {
    seed: 251017, clearing: { center: [-1.5, -1.5], radius: 14 }, forestEdge: 20,
    path: [[-20, 11], [-8, 8], [-6, 4], [-3.4, .4], [-1, -3], [4, -9], [4.5, -15], [4.5, -23], [4.5, -27]],
    glade: { ferns: 1.65, shafts: 2 }, leafShadows: true,
    // Keep the playable oval bare and clear the foreground camera corridor.
    // This also gates grass generation, so blades cannot poke through hiding places.
    keepOut(x, z) {
      const glade = Math.hypot((x + 4) / 7.8, (z - 6.2) / 6.6), working = Math.hypot((x + 3) / 4.8, (z + 3.5) / 3.6), staging = Math.hypot((x - 4.5) / 6.8, (z + 13.8) / 4.5), berries = Math.hypot((x - 4.5) / 6.8, (z + 26) / 4.8);
      const marsh = Math.hypot((x - MARSH.center[0]) / (MARSH.halfWidth + 1.2), (z - MARSH.center[1]) / (MARSH.halfDepth + 1.1));
      const bare = 1 - THREE.MathUtils.smoothstep(Math.min(glade, working, staging, berries, marsh), .9, 1.12);
      const water = 1 - THREE.MathUtils.smoothstep(riverDistance(x, z).distance, RIVER.halfWidth + .1, RIVER.halfWidth + .65);
      // Full-height procedural crowns must stay outside every automatic
      // camera corridor. Authored low plants frame these foreground edges.
      const cameraCorridor = x > -12 && x < 21 && z > -18 && z < 16 || x > -5 && x < 15 && z >= -34 && z <= -16;
      return Math.max(bare, water, cameraCorridor ? 1 : 0);
    },
    shots: { board: SHOT },
    actors: { mosi: { position: [MOSI_SPOT.x, 0, MOSI_SPOT.z], heading: MOSI_SPOT.heading }, ...Object.fromEntries(CELLS.map(([x, z], i) => [`place${i}`, { position: [x, 0, z], heading: 90 }])) },
    lift(x, z) { return bridgeValley(x, z); },
  };
  const actors = new Map();
  const world = { THREE, scene, camera, renderer, q, params, look, lighting, wind, actors, chapter: { layout, shots: layout.shots, actors: layout.actors }, heightAt: () => 0 };
  world.resolvePoint = createPointResolver(world); world.points = world.resolvePoint;
  let disposed = false, time = 0, width = 1280, height = 800, resolution = 1, frameTime = 0, frameCount = 0;
  let forest, forestVisibility, floor, gladeScenery, mosi, mosiShade, mosiPuppet, babyActors = [], babyLibrary, babyShadows, resizeObserver, adventure;
  const leafResources = createLeafResources(), contactResources = createContactResources();
  leafResources.geometry.computeBoundingBox();
  const leafCorners = [], footBones = new WeakMap(), actorIds = new WeakMap(), leafBox = leafResources.geometry.boundingBox;
  for (const x of [leafBox.min.x, leafBox.max.x]) for (const y of [leafBox.min.y, leafBox.max.y]) for (const z of [leafBox.min.z, leafBox.max.z]) leafCorners.push(new THREE.Vector3(x, y, z));
  const cells = [], nests = [], byId = new Map(), leafBatches = [], contactMeshes = [], logicalToPhysical = [0, 1, 2], items = new Map();
  let contactBatch;
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2(), projection = new THREE.Vector3();
  const pickables = [];
  const hitGeometry = new THREE.SphereGeometry(1, 12, 8);
  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const fx = createWorldFx({ scene, heightAt: (x, z) => world.heightAt(x, z) });
  const renderTargets = [];
  const deferredEvents = [];
  let bridgeSnapshot = { selected: null, atStaging: false, boardwalkBuilt: false, visited: false };
  const homeNav = createHomeNavigation({ destinations: () => cells.filter(cell => cell.transfer).map(cell => ({ actor: cell.actor, point: cell.transfer.end, yaw: cell.transfer.endYaw })), heightAt: (x, z) => world.heightAt(x, z), riverDistance, actors: () => [...babyActors.filter(actor => adventure?.isBusy() ? !adventure.hasTravelReservation(actor) : !cells.some(cell => cell.actor === actor && cell.transfer && !cell.transfer.waiting)), ...(mosi && !bridgeSnapshot.atStaging ? [mosi] : [])], leaves: () => cells.filter(cell => !matchedStatus(cell.status)).map(cell => ({ x: cell.root.position.x, z: cell.root.position.z })), objects: () => {
    const debug = adventure?.getDebug(), collision = debug?.collision; if (!collision) return gladeScenery?.navigationObjects ?? [];
    const measured = bridgeCollisionObjects(debug);
    const matrix = new THREE.Matrix4().fromArray(collision.logMatrix), a = new THREE.Vector3(-collision.logLength / 2, 0, 0).applyMatrix4(matrix), b = new THREE.Vector3(collision.logLength / 2, 0, 0).applyMatrix4(matrix);
    const result = [{ id: 'main-log', a, b, radius: collision.logRadius, parts: measured.find(value => value.id === 'main-log')?.parts }];
    for (const tube of collision.tubes ?? []) for (let i = 1; i < tube.points.length; i++) result.push({ id: tube.id, a: new THREE.Vector3(...tube.points[i - 1]), b: new THREE.Vector3(...tube.points[i]), radius: tube.radius, parts: [measured.find(value => value.id === tube.id)?.parts[i - 1]].filter(Boolean) });
    return [...result, ...(gladeScenery?.navigationObjects ?? [])];
  } });
  const actorFrustum = new THREE.Frustum(), actorView = new THREE.Matrix4(), actorSphere = new THREE.Sphere();
  let cheerAge = 100, bonkAge = 100, lastStats = {}, reducedMotion = false;

  // Mosi's standing place: his posed bounds (scaled rig, x forward) turned to his heading.
  function mosiPoints() {
    const heading = MOSI_SPOT.heading, yaw = -THREE.MathUtils.degToRad(heading), c = Math.cos(yaw), s = Math.sin(yaw), y0 = world.heightAt(MOSI_SPOT.x, MOSI_SPOT.z), points = [];
    for (const lx of [-2, 2.17]) for (const lz of [-.65, .65]) for (const ly of [0, 2.1]) points.push([MOSI_SPOT.x + lx * c + lz * s, y0 + ly, MOSI_SPOT.z - lx * s + lz * c]);
    return points;
  }
  function boardPoints() {
    const points = [];
    for (const [x, z] of CELLS) for (const dx of [-1.45, 1.45]) for (const dz of [-1.4, 1.4]) for (const y of [.03, 1.15]) points.push([x + dx, world.heightAt(x, z) + y, z + dz]);
    return points;
  }
  function nestPoints() {
    const points = [];
    for (const [x, z] of NESTS) for (const dx of [-1.85, 1.85]) for (const dz of [-1.1, 1.1]) points.push([x + dx, 1.6, z + dz]);
    return points;
  }
  // Every leaf and Mosi whole, and both places of each home spot (head height), so a found pair stays in view.
  function homePoints() {
    return NESTS.flatMap(([x, z], i) => [0, 1].map(member => { const rest = restVector(SPECIES[i], member); return [x + rest.x, world.heightAt(x, z) + 1.2, z + rest.z]; }));
  }
  function gladeCue() {
    const points = [...boardPoints(), ...mosiPoints(), ...homePoints()];
    return { key: 'glade', phase: 'memory', focus: [-1.5, .5, 3.2], points, scale: 'wide', direction: width / height < 1 ? GLADE_VIEW.portrait : GLADE_VIEW.landscape };
  }
  function overviewCue() {
    return { key: 'overview', phase: 'overview', focus: [0, .5, -10], scale: 'wide', points: [...boardPoints(), ...nestPoints(), ...mosiPoints(), [-2, 1.8, -30], [10.5, 2.4, -30], [-2, 1, -22], [11, 1, -22], [-1, 1.5, -14], [10, 1.5, -14]] };
  }
  const cameraDirector = createCameraDirector({ camera, overview: overviewCue, fallback: gladeCue });
  // Scripts (scenes.js) run on the game clock. Their lines say what to do; this is where it happens.
  const call = value => typeof value === 'function' ? value() : value;
  const scenes = createSceneRunner({ perform(line) {
    if (line.shot?.release) cameraDirector.release({ cut: line.shot.cut, duration: line.shot.duration });
    else if (line.shot?.nudge) cameraDirector.nudge(call(line.shot.nudge), line.shot.amount ?? .06, line.shot.seconds ?? .5);
    else if (line.shot) cameraDirector.shot(line.shot);
    for (const act of [line.act ?? []].flat()) act();
    for (const effect of [line.fx ?? []].flat()) {
      if (effect.kind === 'shake') cameraDirector.shake(effect.strength, effect.seconds);
      else fx.emit(effect.kind, call(effect.at), { count: effect.count, strength: effect.strength ?? 1 });
    }
    for (const sound of [line.sound ?? []].flat()) deferredEvents.push({ type: 'scene-sound', ...(typeof sound === 'string' ? { name: sound } : sound) });
    if (line.say) deferredEvents.push({ type: 'scene-say', line: line.say });
  } });
  const nose = cell => cell.actor.getNosePosition(new THREE.Vector3());
  const stage = {
    head: nose,
    crown: cell => cell.actor.getSupportPosition(new THREE.Vector3()),
    camera: () => camera.position.clone(),
    look(cell, point, options) { if (point) cell.actor.lookAt(point, options); else cell.actor.clearLook(); },
    gesture: (cell, name) => cell.actor.gesture(name),
    mosi: {
      look(point) { mosi.lookAt(point.clone(), { weight: .6, maxAngle: 28 }); },
      gesture: name => mosiPuppet.gesture(name),
      head: () => mosi.headPosition(new THREE.Vector3()),
    },
    planMeeting,
    sendHome(cell) { if (cell.home && !cell.transfer && !cell.moved) startHop(cell); },
    home: cell => cell.moved,
    forceHome(cell) {
      if (cell.moved || !cell.home) return;
      cell.dash = null; cell.transfer = null; homeNav.release(cell.actor);
      cell.actor.root.position.copy(cell.home.end); cell.actor.root.rotation.y = cell.home.nest.restYaw;
      cell.actor.walk?.(false); cell.actor.greet?.(); cell.moved = true; cell.home.nest.pulse = 0;
    },
    homePoint: cell => (cell.home?.nest.root.position ?? cell.root.position).clone().add(new THREE.Vector3(0, .9, 0)),
    homeEnd: cell => (cell.home?.end ?? cell.root.position).clone(),
    // Turn to show the face three-quarters, on the friend's own side: the triceratops nearly to the camera
    // (horns and frill), the long necks well round so the neck is not hidden behind the head.
    faceCamera(cell) {
      const toward = camera.position.clone().sub(cell.actor.root.position).setY(0), yaw = Math.atan2(-toward.z, toward.x);
      const side = Math.sign(Math.atan2(Math.sin(cell.hideYaw - yaw), Math.cos(cell.hideYaw - yaw))) || 1;
      cell.faceYaw = yaw + side * (cell.species === 'triceratops' ? .45 : .8);
    },
    // A camera beside a walk, on the search camera's side of it: the walkers in profile, not from behind.
    sideOn(from, to) {
      const travel = to.clone().sub(from).setY(0), front = camera.position.clone().sub(cameraDirector.focus()).setY(0).normalize();
      if (travel.lengthSq() < 1e-4) return front;
      const side = new THREE.Vector3(travel.z, 0, -travel.x).normalize();
      // Halfway to the search camera's side keeps the bridge log and the branch out of the foreground.
      return (side.dot(front) < 0 ? side.negate() : side).lerp(front, .5).normalize();
    },
  };

  // Where two friends meet nose to nose: across the screen, so the face shot sees both in profile,
  // in the open between leaves. Each runs there along a straight line on the game clock.
  function planMeeting(a, b) {
    const front = camera.position.clone().sub(cameraDirector.focus()).setY(0).normalize(), side = new THREE.Vector3(front.z, 0, -front.x);
    if (side.dot(b.actor.root.position.clone().sub(a.actor.root.position)) < 0) side.negate();
    // The larger Þórseðla babies stand a little further apart: their nuzzle leans in with their size.
    const reach = cell => cell.actor.noseLocal.x + .03 + .16 * ((cell.actor.lengthFactor ?? 1) - 1);
    const others = cells.filter(cell => cell !== a && cell !== b && !cell.moved && !matchedStatus(cell.status));
    const clearance = point => Math.min(Infinity, ...others.map(cell => Math.hypot(point.x - cell.root.position.x, point.z - cell.root.position.z)));
    const middle = a.actor.root.position.clone().add(b.actor.root.position).multiplyScalar(.5);
    let point = middle, best = -Infinity;
    for (const k of [0, 1.1, 2.2, -1.1, 3.1, -2.2]) {
      const candidate = middle.clone().addScaledVector(front, k), spots = [candidate.clone().addScaledVector(side, -reach(a)), candidate.clone().addScaledVector(side, reach(b))];
      const room = Math.min(clearance(candidate), ...spots.map(clearance)) - Math.abs(k) * .15;
      if (room > best + 1e-6) { best = room; point = candidate; }
      if (clearance(candidate) >= 2.1 && Math.min(...spots.map(clearance)) >= 1.7) { point = candidate; break; }
    }
    const yawA = Math.atan2(-side.z, side.x), plan = [
      { cell: a, to: point.clone().addScaledVector(side, -reach(a)), yaw: yawA },
      { cell: b, to: point.clone().addScaledVector(side, reach(b)), yaw: yawA + Math.PI },
    ];
    for (const spot of plan) spot.to.y = world.heightAt(spot.to.x, spot.to.z) + .085;
    const distance = Math.max(...plan.map(spot => spot.to.distanceTo(spot.cell.actor.root.position)));
    const duration = THREE.MathUtils.clamp(distance / 3.4, .5, 1.05);
    const meetPoint = point.clone().setY(Math.max(...plan.map(spot => spot.cell.actor.noseLocal.y)) + point.y);
    return {
      point: meetPoint, duration,
      start() { for (const spot of plan) { const actor = spot.cell.actor; spot.cell.away = true; spot.cell.dash = { from: actor.root.position.clone(), fromYaw: actor.root.rotation.y, to: spot.to, yaw: spot.yaw, age: 0, duration }; actor.walk?.(true); } },
      finish() { for (const spot of plan) { const actor = spot.cell.actor; spot.cell.dash = null; spot.cell.away = true; actor.root.position.copy(spot.to); actor.root.rotation.y = spot.yaw; actor.walk?.(false); } },
    };
  }
  // How high a friend must be to pass over the closed leaves (domes) it crosses: 0 clear of them, HOP.leap over one.
  function leap(point) {
    let lift = 0;
    for (const other of cells) {
      if (other.vanish > 0 || other.moved || other.open > .5 || matchedStatus(other.status)) continue;
      lift = Math.max(lift, HOP.leap * smooth((HOP.margin - Math.hypot(point.x - other.root.position.x, point.z - other.root.position.z)) / (HOP.margin - HOP.dome)));
    }
    return lift;
  }
  // A matched pair hops home: each friend runs hops straight to its place, a hop every HOP.reach metres.
  function startHop(cell) {
    const from = cell.actor.root.position.clone(), end = cell.home.end, distance = Math.hypot(end.x - from.x, end.z - from.z);
    cell.transfer = { age: 0, waiting: false, from, hops: Math.max(2, Math.round(distance / HOP.reach)), hop: -1, nest: cell.home.nest, end, member: cell.home.member, endYaw: cell.home.nest.restYaw, duration: Math.max(1, distance / HOP.speed) + .25, startedAt: time };
    cell.actor.walk?.(false); cell.actor.setMotion?.('idle');
  }
  function updateHop(cell, dt) {
    const move = cell.transfer, actor = cell.actor; if (!(dt > 0)) return;
    move.age += dt;
    const run = Math.min(1, move.age / (move.duration - .25)), phase = move.hops * run, hop = Math.min(move.hops - 1, Math.floor(phase));
    const x = THREE.MathUtils.lerp(move.from.x, move.end.x, run), z = THREE.MathUtils.lerp(move.from.z, move.end.z, run);
    if (hop !== move.hop) {
      // Each hop starts with the hop gesture; each landing puffs a little dust and thuds.
      if (move.hop >= 0) { fx.emit('poof', actor.root.position, { count: 3, ring: .3 }); deferredEvents.push({ type: 'footstep', surface: 'soil', pan: 0 }); }
      move.hop = hop; actor.gesture?.('hop');
    }
    actor.root.position.set(x, world.heightAt(x, z) + .085 + (run < 1 ? HOP.arc * Math.sin(Math.PI * (phase - hop)) : 0), z);
    actor.root.position.y += leap(actor.root.position);
    const wanted = run > .8 ? move.endYaw : Math.atan2(-(move.end.z - move.from.z), move.end.x - move.from.x);
    actor.root.rotation.y = turnToward(actor.root.rotation.y, wanted, reducedMotion ? 1 : 1 - Math.exp(-dt / .09));
    if (move.age < move.duration) return;
    actor.root.position.copy(move.end); actor.root.rotation.y = move.endYaw; actor.greet?.();
    cell.moved = true; cell.transfer = null; move.nest.pulse = 0; fx.emit('poof', move.end, { count: 5 });
  }
  function updateDash(cell, dt) {
    const dash = cell.dash, actor = cell.actor; if (!dash || !(dt > 0)) return;
    dash.age = Math.min(dash.duration, dash.age + dt);
    const t = dash.age / dash.duration, eased = smooth(t), heading = dash.to.clone().sub(dash.from).setY(0);
    actor.root.position.lerpVectors(dash.from, dash.to, eased); actor.root.position.y += leap(actor.root.position);
    if (heading.lengthSq() < 2.2 * 2.2) actor.root.rotation.y = turnToward(dash.fromYaw, dash.yaw, smooth(t / .55));
    else { const travelYaw = Math.atan2(-heading.z, heading.x); actor.root.rotation.y = t < .7 ? turnToward(dash.fromYaw, travelYaw, smooth(t / .25)) : turnToward(travelYaw, dash.yaw, smooth((t - .7) / .3)); }
    if (t >= 1) { actor.root.position.copy(dash.to); actor.root.rotation.y = dash.yaw; actor.walk?.(false); cell.dash = null; }
  }
  const sceneIds = new Map();
  function playFor(cell, lines) { if (sceneIds.has(cell)) scenes.cancel(sceneIds.get(cell)); sceneIds.set(cell, scenes.play(lines)); }
  const cameraCue = () => {
    const cue = adventure?.getCameraCue?.(); if (!cue || cue.key === 'glade') return gladeCue();
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
  };

  function resize(nextWidth = canvas.clientWidth, nextHeight = canvas.clientHeight) {
    if (disposed) return;
    width = Math.max(1, Number(nextWidth) || 1280); height = Math.max(1, Number(nextHeight) || 800);
    const aspect = width / height;
    renderer.setPixelRatio(Math.min(q.pixelRatio * resolution, globalThis.devicePixelRatio || 1, q.maxPixelRatio));
    renderer.setSize(width, height, false);
    camera.fov = SHOT.fov; cameraDirector.setViewport(width, height);
    if (mosi) mosi.place(MOSI_SPOT.x, MOSI_SPOT.z, MOSI_SPOT.heading);
    // The contact shade is long along its z: lay it along Mosi's body.
    if (mosiShade && mosi) { mosiShade.position.copy(mosi.root.position).add(new THREE.Vector3(0, .095, 0)); mosiShade.rotation.y = mosi.root.rotation.y + Math.PI / 2; }
    lighting.focus(new THREE.Vector3(-.7, .6, -3.6), 15);
    forest?.update(0, time);
    updateTargets();
  }

  function addHit(root, width, depth, data) {
    const hit = new THREE.Mesh(hitGeometry, hitMaterial);
    hit.scale.set(width / 2, .3, depth / 2); hit.position.y = .3; hit.userData.memory = data;
    root.add(hit); pickables.push(hit); return hit;
  }

  try {
    onProgress('Skógarrjóðrið vaknar…'); resize();
    forest = await createForest(world, layout); world.forest = forest; world.heightAt = (x, z) => forest.heightAt(x, z); forest.actorWarm = .3;
    forestVisibility = createForestVisibility(forest, camera, lighting);
    // The authored journey supplies its own local pollen and water/build
    // effects. Do not also draw the story forest's distant air batches.
    const nativeAir = forest.group.getObjectByName('Atmosphere');
    if (nativeAir) nativeAir.visible = false;
    // This scene has a broader open floor than the story chapters. Preserve
    // their material while narrowing only this clearing's grass contrast.
    const groundMaterial = scene.getObjectByName('Forest ground')?.material;
    if (groundMaterial) {
      const compile = groundMaterial.onBeforeCompile, cacheKey = groundMaterial.customProgramCacheKey.bind(groundMaterial);
      groundMaterial.onBeforeCompile = function (shader, activeRenderer) {
        compile.call(this, shader, activeRenderer);
        shader.uniforms.uGrassBase.value.set('#778b55'); shader.uniforms.uGrassSun.value.set('#8e9f61'); shader.uniforms.uClover.value.set('#80934f');
        shader.uniforms.uLeafShadow.value = .16;
        shader.uniforms.uForestA.value.set('#53674a'); shader.uniforms.uForestB.value.set('#69774f');
        shader.fragmentShader = shader.fragmentShader.replace('( 0.84 + 0.3 * nA.a )', '( 0.95 + 0.10 * nA.a )').replace('smoothstep( 0.6, 0.74, nB.g ) * 0.55', 'smoothstep( 0.6, 0.74, nB.g ) * 0.16').replace('soil );', 'soil * 0.3 );').replace('litter * 0.55', 'litter * 0.2');
      };
      groundMaterial.customProgramCacheKey = () => `${cacheKey()}-memory-soft-moss`;
    }
    refineBridgeGround(forest, world.heightAt);
    floor = createClearingFloor(world, { width: 29, depth: 47, centerZ: -9, glade: true });
    gladeScenery = createGladeScenery(world);
    for (let i = 0; i < CELLS.length; i++) {
      const [x, z] = CELLS[i], y = world.heightAt(x, z);
      const root = new THREE.Group(); root.name = `Felustaður ${i + 1}`; root.position.set(x, y, z); scene.add(root);
      const shade = makeContact(contactResources, 2.6, 2.5); shade.position.y = .095; root.add(shade); contactMeshes.push(shade);
      const leaf = makeLeaf(leafResources); leaf.position.set(0, .32, -1.3); root.add(leaf);
      const hit = addHit(root, 2.4, 2.4, { type: 'leaf', index: i });
      cells.push({ root, leaf, shade, hit, index: i, id: null, species: null, item: null, status: 'hidden', targetOpen: 0, open: 0, revealAge: 100, pending: 0, spring: 0, springV: 0, vanish: 0, closing: false,
        turn: (i % 2 ? -1 : 1) * (Math.PI - .35 + i % 3 * .3), actor: null, surprise: null, transfer: null, moved: false });
    }
    // Identical covers share two instanced draws and one shadow draw.
    // Their empty pose groups still animate independently and remain pickable.
    for (const cell of cells) cell.leaf.clear();
    for (const [geometry, material, castShadow] of [[leafResources.geometry, leafResources.material, true], [leafResources.veinGeometry, leafResources.veinMaterial, false]]) {
      const batch = new THREE.InstancedMesh(geometry, material, CELLS.length); batch.castShadow = castShadow; batch.receiveShadow = true; batch.frustumCulled = false;
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(batch); leafBatches.push(batch);
    }
    for (let i = 0; i < NESTS.length; i++) {
      const [x, z] = NESTS[i], root = new THREE.Group(); root.name = 'Hvíldarstaður unga'; root.position.set(x, world.heightAt(x, z) + .04, z); scene.add(root);
      const shade = makeContact(contactResources, 3.6, 2.5); shade.position.y = .055; root.add(shade); contactMeshes.push(shade);
      const hit = addHit(root, 3.2, 2.2, { type: 'nest', index: i });
      nests.push({ root, index: i, physicalIndex: i, hit, species: null, members: [], pulse: 100, reunionAge: 100, reunited: false, restOffsets: [restVector(SPECIES[i], 0), restVector(SPECIES[i], 1)], restYaw: restHeading() });
    }
    adventure = createBridgeAdventure({ scene, heightAt: world.heightAt, nests, fx, onwardTravel: true, cancelWalk: actor => homeNav.release(actor), planWalk: (actor, end, { yaw } = {}) => {
      const action = adventure?.getDebug().action, pushing = actor.species === 'triceratops' && action?.id === 'roll';
      // A friend parked by the log for the crossing may start beside the Þórseðla babies holding the branch: their
      // capsules overlap there (theirs is as wide as the round belly all along the neck), so near the start the
      // planner checks the measured bodies instead.
      const crossing = action?.id === 'cross' && action.phase === 'cross';
      const route = homeNav.request(actor, end, yaw ?? actor.root.rotation.y, { allowEndContact: pushing && action.phase === 'approach', allowStartContact: pushing && action.phase === 'return' || crossing });
      if (route === undefined) return undefined;
      homeNav.release(actor);
      return route?.points ?? null;
    } });
    onProgress('Mosi kemur að hjálpa…');
    mosi = await createActor(world, { name: 'mosi-memory', url: new URL('../../assets/characters/mosi.glb', import.meta.url).href, position: [MOSI_SPOT.x, 0, MOSI_SPOT.z], heading: MOSI_SPOT.heading });
    mosi.root.scale.setScalar(.49); mosi.controlled = true; mosi.lookYawLimit = 25; mosi.lookUpLimit = 20; mosi.species = 'mosi'; measureActor(mosi);
    mosi.lookAt(camera.position, { weight: .38, maxAngle: 20 }); actors.set('mosi', mosi);
    mosiPuppet = createMosiPuppet(mosi);
    mosiShade = makeContact(contactResources, 2.6, 3.8); mosiShade.position.set(MOSI_SPOT.x, world.heightAt(MOSI_SPOT.x, MOSI_SPOT.z) + .095, MOSI_SPOT.z); mosiShade.rotation.y = mosi.root.rotation.y + Math.PI / 2; scene.add(mosiShade);
    contactMeshes.push(mosiShade); contactMeshes.forEach(mesh => { mesh.visible = false; });
    contactBatch = new THREE.InstancedMesh(contactResources.geometry, contactResources.material, contactMeshes.length); contactBatch.frustumCulled = false; contactBatch.renderOrder = 8; scene.add(contactBatch);
    onProgress('Ungarnir finna felustaði…');
    const module = await import('./baby-actors.js');
    babyLibrary = await module.createBabyActors({ scene, species: SPECIES, length: 2.6, instancesPerSpecies: 2 });
    babyActors = Array.isArray(babyLibrary) ? babyLibrary : (babyLibrary.actors ?? []);
    if (babyActors.length < 6) throw new Error('Minnisspil needs six baby instances.');
    const memberCounts = {};
    for (const actor of babyActors) {
      actor.root.visible = false; actor.root.scale.setScalar(1);
      actorIds.set(actor, `${actor.species}-${memberCounts[actor.species] ?? 0}`); memberCounts[actor.species] = (memberCounts[actor.species] ?? 0) + 1; measureActor(actor);
      const feet = []; actor.model.traverse(bone => { if (bone.isBone && /Foot/.test(bone.name)) feet.push(bone); }); footBones.set(actor, feet);
    }
    onProgress('Óvæntu hlutirnir bíða…');
    // Every surprise the table knows is made now, so the first one found shows at once and compiles with the scene.
    // A missing model costs only that item's picture: the leaf still opens and the basket still counts.
    for (const id of Object.keys(SURPRISE_ITEMS)) {
      try { const item = await createSurpriseItem(id); item.group.visible = false; scene.add(item.group); items.set(id, item); }
      catch (error) { console.warn(`The surprise "${id}" has no picture:`, error?.message ?? error); }
    }
    onProgress('Ungarnir gera sig tilbúna…');
    await Promise.all(babyActors.map(actor => prepareCharacter(actor.model, lighting.sun)));
    resize();
    babyShadows = createMemoryShadowLods(babyActors, lighting.sun);
    resize();
    onProgress('Laufin eru tilbúin.');
    // Warm the visible scene before the first playable frame.
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null;
    resizeObserver?.observe(canvas);
  } catch (error) {
    dispose(); throw error;
  }

  function resetBoard(cards) {
    scenes.cancelAll(); sceneIds.clear(); mosiPuppet?.cancel();
    byId.clear(); fx.reset(); homeNav.reset(); deferredEvents.length = 0; cheerAge = 100; adventure.reset(); bridgeSnapshot = { selected: null, atStaging: false, boardwalkBuilt: false, visited: false }; cameraDirector.reset(); logicalToPhysical.splice(0, 3, 0, 1, 2);
    for (const actor of babyActors) { actor.root.visible = false; actor.root.scale.setScalar(1); actor.walk?.(false); actor.setMotion?.('idle'); actor.stopGesture?.(); }
    for (const nest of nests) { nest.index = nest.physicalIndex; nest.species = null; nest.members = []; nest.pulse = 100; nest.reunionAge = 100; nest.reunited = false; }
    for (const item of items.values()) item.group.visible = false;
    const available = [...babyActors];
    cards.forEach((card, i) => {
      const cell = cells[i]; if (!cell) return;
      // A surprise leaf hides no friend: its cell has no actor, only the item its card names.
      let actor = null;
      if (card.species) {
        const actorIndex = available.findIndex(value => value.species === card.species);
        if (actorIndex < 0) throw new Error(`Missing baby for ${card.species}.`);
        actor = available.splice(actorIndex, 1)[0];
      }
      Object.assign(cell, { id: card.id, species: card.species, item: card.item ?? null, status: card.status ?? 'hidden', actor, targetOpen: 0, open: 0, revealAge: 100, pending: 0, spring: 0, springV: 0, vanish: 0, closing: false, surprise: null,
        transfer: null, moved: false, dash: null, away: false, home: null, wonderAt: 0, faceYaw: null, hideYaw: 0 });
      cell.leaf.visible = true; cell.shade.visible = false;
      poseLeaf(cell.leaf, leafResources, { turn: cell.turn });
      cell.hit.userData.memory.id = card.id; byId.set(card.id, cell);
      if (!actor) return;
      actor.root.position.copy(cell.root.position); actor.root.position.y += .085;
      // The Triceratops beak points 21° across its body; its own turn restores
      // a welcoming three-quarter face while the two long-bodied species show profile.
      actor.root.rotation.y = cell.hideYaw = card.species === 'triceratops' ? -Math.PI * .39 : -Math.PI / 5;
      actor.clearLook?.(); actor.root.visible = false;
    });
  }

  function setBoard(cards) {
    if (disposed || !Array.isArray(cards)) return;
    if (cards.length !== CELLS.length) throw new RangeError(`The memory board has ${CELLS.length} hiding places.`);
    // This is the init/restart boundary, never an incremental state update.
    // Reset even when a shuffled deck happens to repeat the previous order.
    resetBoard(cards);
    cards.forEach(card => {
      const cell = byId.get(card.id); if (!cell) return;
      cell.status = card.status ?? 'hidden';
      if (!cell.moved && !cell.transfer) cell.targetOpen = visibleStatus(cell.status) ? 1 : 0;
    });
    updateTargets();
  }

  // A tapped leaf squashes and bounces and puffs some dust: a poof to see and hear.
  function kick(cell, amount) { if (!reducedMotion) { cell.spring = amount; cell.springV = 0; } }
  function stepSpring(cell, dt) {
    if (!cell.spring && !cell.springV) return;
    for (let left = dt; left > 1e-6;) {
      const h = Math.min(left, 1 / 120); left -= h;
      cell.springV += (-SPRING.stiffness * cell.spring - SPRING.damping * cell.springV) * h; cell.spring += cell.springV * h;
    }
    if (Math.abs(cell.spring) < 1e-3 && Math.abs(cell.springV) < .01) cell.spring = cell.springV = 0;
  }
  function squash(cell) {
    kick(cell, -.42); fx.emit('poof', cell.root.position, { count: 9, ring: .95 });
    deferredEvents.push({ type: 'scene-sound', name: 'poof' });
  }
  // The leaf has squashed: it swings away and the friend springs out from under it.
  function openCell(cell) {
    cell.targetOpen = 1;
    if (cell.actor) { cell.actor.reveal?.(); cell.actor.root.visible = true; }
  }

  function reveal(id) {
    const cell = byId.get(id); if (!cell || cell.moved || cell.transfer || cell.away) return false;
    squash(cell);
    cell.pending = reducedMotion ? 0 : TAP.squash;
    if (cell.item) return revealSurprise(cell);
    const other = cells.find(value => value !== cell && value.status === 'revealed' && !value.away);
    cell.status = 'revealed'; cell.revealAge = 0; cell.wonderAt = cell.pending + 1.3;
    if (!cell.pending) openCell(cell);
    playFor(cell, revealScene(stage, cell, { second: Boolean(other), delay: cell.pending }));
    // A different friend under the second leaf: both react before the leaves close.
    if (other && other.species !== cell.species) scenes.play(mismatchScene(stage, other, cell, { delay: cell.pending }));
    return true;
  }

  // A surprise leaf (the rules' card.item): the leaf swings away, the thing pops up with stars, hovers, then flies to the basket.
  function revealSurprise(cell) {
    cell.status = 'found'; cell.surprise = { age: 0, model: items.get(cell.item) ?? null, popped: false, done: false };
    if (!cell.pending) openCell(cell);
    return true;
  }
  const hover = new THREE.Vector3(), flightFrom = new THREE.Vector3(), flightTo = new THREE.Vector3(), flightMid = new THREE.Vector3(), cameraRight = new THREE.Vector3();
  // Where the basket is on the screen, as the point SURPRISE.target metres in front of the camera.
  function basketWorldPoint(out) {
    const at = basketPoint();
    camera.updateMatrixWorld();
    out.set(at ? at.x / width * 2 - 1 : -.7, at ? 1 - at.y / height * 2 : .8, .5).unproject(camera).sub(camera.position).normalize();
    return out.multiplyScalar(SURPRISE.target).add(camera.position);
  }
  // The surprise shows its face to the camera (a flat butterfly lies back toward it).
  function faceCamera(model) {
    cameraRight.setFromMatrixColumn(camera.matrixWorld, 0);
    model.group.rotation.set(model.tilt ?? 0, Math.atan2(-cameraRight.z, cameraRight.x), 0, 'YXZ');
  }
  function updateSurprise(cell, dt) {
    const state = cell.surprise; if (!state || state.done || !(dt > 0)) return;
    state.age += dt;
    const rise = reducedMotion ? 0 : SURPRISE.rise, fly = reducedMotion ? 0 : SURPRISE.fly;
    const popAt = TAP.squash + SURPRISE.pop, flyAt = popAt + rise + SURPRISE.hold, landAt = flyAt + fly, model = state.model;
    if (state.age < popAt) return;
    hover.copy(cell.root.position); hover.y += SURPRISE.hover;
    if (!state.popped) {
      state.popped = true; fx.emit('stars', hover, { count: 12 });
      mosi.lookAt(hover.clone(), { weight: .6, maxAngle: 28 }); cameraDirector.nudge(hover, .06, .5);
      if (model) model.group.visible = true;
    }
    if (model) {
      let scale = 1; const place = model.group.position;
      if (state.age < popAt + rise) { const e = easeOutBack((state.age - popAt) / rise); place.copy(cell.root.position); place.y += THREE.MathUtils.lerp(.15, SURPRISE.hover, e); scale = Math.max(.05, e); }
      else if (state.age < flyAt) { place.copy(hover); place.y += Math.sin((state.age - popAt - rise) * 3.2) * .07; }
      else {
        const e = smooth(fly ? (state.age - flyAt) / fly : 1); flightFrom.copy(hover); basketWorldPoint(flightTo);
        flightMid.lerpVectors(flightFrom, flightTo, .35); flightMid.y += 1;
        place.copy(flightFrom).multiplyScalar((1 - e) * (1 - e)).addScaledVector(flightMid, 2 * (1 - e) * e).addScaledVector(flightTo, e * e);
        scale = THREE.MathUtils.lerp(1, SURPRISE.shrink, e);
      }
      model.group.scale.setScalar(scale); faceCamera(model); model.animate(state.age);
    }
    if (state.age >= landAt) {
      state.done = true; if (model) model.group.visible = false;
      deferredEvents.push({ type: 'scene-sound', name: 'ding' }, { type: 'scene-basket', item: cell.item });
    }
  }

  function conceal(ids) {
    for (const id of ids) {
      const cell = byId.get(id); if (!cell || cell.moved || cell.transfer || cell.away || !cell.actor) continue;
      // The friends already said "oops" (mismatchScene); they only duck under the closing leaf.
      cell.status = 'hidden'; cell.targetOpen = 0; cell.pending = 0; cell.closing = true; cell.actor.clearLook?.(); cell.faceYaw = cell.hideYaw;
      if (!cell.actor.getDebugState?.().gesture) cell.actor.gesture?.('settle');
    }
  }

  function match(ids, nestIndex, species) {
    const physicalIndex = SPECIES.indexOf(species), nest = nests[physicalIndex]; if (!nest || !Number.isInteger(nestIndex)) return false;
    // Discovery order remains the public API, while homes have a stable place.
    // Swapping the two unused slots keeps all three target keys present.
    const oldLogical = logicalToPhysical.indexOf(physicalIndex), displaced = logicalToPhysical[nestIndex];
    logicalToPhysical[nestIndex] = physicalIndex; logicalToPhysical[oldLogical] = displaced;
    nests.forEach(value => { value.index = logicalToPhysical.indexOf(value.physicalIndex); });
    nest.species = species; nest.members = []; nest.reunited = false;
    const pair = [];
    ids.forEach((id, member) => {
      const cell = byId.get(id); if (!cell || cell.moved || cell.transfer) return;
      cell.status = 'matched'; cell.targetOpen = 1; cell.actor.root.visible = true;
      // The walk home starts when the script says (matchScene: after the nuzzle).
      cell.home = { nest, member, end: nest.root.position.clone().add(nest.restOffsets[member]) };
      cell.actor.walk?.(false); cell.actor.setMotion?.('idle'); nest.members.push(cell.actor); pair.push(cell);
    });
    if (pair.length === 2) { for (const cell of pair) { scenes.cancel(sceneIds.get(cell)); sceneIds.delete(cell); } scenes.play(matchScene(stage, pair[0], pair[1], { nestIndex })); }
    else pair.forEach(cell => stage.sendHome(cell));
    mosi.blink(); return true;
  }

  function playNest(index) {
    const nest = nests[logicalToPhysical[index]]; if (!nest?.members.length) return false;
    if (adventure.isVisited()) { for (const actor of nest.members) { if (actor.delight) actor.delight(); else actor.greet?.(); } fx.emit('stars', adventure.pairCentre(nest.species), { count: 6 }); return true; }
    if (adventure.ownsPair(nest.species)) return false;
    if (nest.members.some(actor => !cells.some(cell => cell.actor === actor && cell.moved))) return false;
    nest.pulse = 0; nest.reunionAge = 0; nest.reunited = true;
    for (const actor of nest.members) {
      actor.greet?.(); actor.setMotion?.('greet');
    }
    fx.emit('reunion',nest.root.position,{count:18,strength:1}); return true;
  }

  function celebrate() {
    cheerAge = 0; mosi.closeEyes(.2, { duration: .15 });
    for (const nest of nests) if (nest.members.length) playNest(nest.index);
  }

  function updateTargets() {
    renderTargets.length = 0;
    const project = point => { projection.copy(point).project(camera); return { x: (projection.x + 1) * .5 * width, y: (1 - projection.y) * .5 * height }; };
    for (const cell of cells) {
      if (cell.id == null) continue;
      const centre = cell.root.position.clone().add(new THREE.Vector3(0, .45, .05)), p = project(centre), left = project(centre.clone().add(new THREE.Vector3(-1.25, 0, 0))), front = project(centre.clone().add(new THREE.Vector3(0, 0, 1.2))), back = project(centre.clone().add(new THREE.Vector3(0, 0, -1.2)));
      renderTargets.push({ type: 'leaf', id: cell.id, x: p.x, y: p.y, width: Math.max(44, Math.abs(p.x - left.x) * 2), height: Math.max(44, Math.abs(front.y - back.y)), enabled: !matchedStatus(cell.status) && !cell.transfer && !cell.moved });
    }
    for (const nest of nests) {
      // The home target follows the animals' heads. This leaves the lower
      // activity strip free for the stone controls, including on a phone.
      const centre = adventure.ownsPair(nest.species) ? adventure.pairCentre(nest.species) : nest.root.position.clone().add(new THREE.Vector3(0, 1, 0));
      const p = project(centre), edge = project(centre.clone().add(new THREE.Vector3(1.2, 0, 0)));
      const ready = nest.members.length === 2 && nest.members.every(actor => cells.some(cell => cell.actor === actor && cell.moved));
      const minimum = width < 600 ? 44 : 64;
      const selectable = adventure.isVisited() || !bridgeSnapshot.selected && (!bridgeSnapshot.atStaging || !bridgeSnapshot.boardwalkBuilt && nest.species === 'stegosaurus');
      renderTargets.push({ type: 'nest', index: nest.index, x: p.x, y: p.y, width: Math.max(minimum, Math.min(width < 600 ? 54 : 98, Math.abs(edge.x - p.x) * 2)), height: Math.max(minimum, Math.min(64, Math.abs(edge.x - p.x))), enabled: ready && !adventure.isBusy() && selectable });
    }
    for (const target of adventure?.getTargets() ?? []) { const p = project(target.point), size = width < 600 ? 44 : 64; renderTargets.push({ type: 'task', id: target.id, x: p.x, y: p.y, width: size, height: size, enabled: target.enabled }); }
    for (const target of renderTargets) target.enabled &&= cameraDirector.isInteractive() && target.x - target.width / 2 >= 8 && target.x + target.width / 2 <= width - 8 && target.y - target.height / 2 >= 8 && target.y + target.height / 2 <= height - 8;
  }

  function update(dt = 0, externalTime) {
    if (disposed) return;
    const delta = Math.min(.1, Math.max(0, Number(dt) || 0));
    if (delta > 0) time = Number.isFinite(externalTime) ? externalTime : time + delta;
    const cameraTravel = cameraDirector.mode() === 'auto' && cameraDirector.isMoving();
    const revealDelta = cameraTravel ? 0 : delta;
    const focusHold = cameraTravel && adventure.isBusy();
    const actionDelta = focusHold ? 0 : delta;
    const homeDelta = adventure.isBusy() ? 0 : delta;
    if (delta > 0) homeNav.pump(3);
    scenes.update(delta);
    // One friend waits under an open leaf: it wonders where its friend is, again and again.
    const waitingAlone = cells.filter(cell => cell.status === 'revealed' && !cell.away);
    if (waitingAlone.length === 1 && delta > 0) {
      const cell = waitingAlone[0]; cell.wonderAt -= revealDelta;
      if (cell.wonderAt <= 0) { if (!cell.actor.getDebugState?.().gesture) cell.actor.gesture('wonder'); cell.wonderAt = 2.7; }
    }
    for (const cell of cells) {
      const before = cell.open, step = !(delta > 0) || cameraTravel ? 0 : reducedMotion ? 1 : revealDelta / TAP.swing;
      if (cell.pending > 0 && revealDelta > 0) { cell.pending -= revealDelta; if (cell.pending <= 0) { cell.pending = 0; openCell(cell); } }
      cell.open += THREE.MathUtils.clamp(cell.targetOpen - cell.open, -step, step);
      if (revealDelta > 0) {
        // The leaf lands with a thud: a little squash as it flops down open, a bigger one, and a bonk, as it closes over its friend.
        if (before < 1 && cell.open >= 1) kick(cell, -.2);
        if (before > 0 && cell.open <= 0 && cell.closing) {
          kick(cell, -.34);
          if (bonkAge > .12) deferredEvents.push({ type: 'scene-sound', name: 'bonk' });
          bonkAge = 0;
        }
        stepSpring(cell, revealDelta);
      }
      if (cell.open <= 0) cell.closing = false;
      // The leaf of a friend that has gone, or of a surprise that has flown off, shrinks away where it lies, with a puff.
      const leaving = cell.moved || Boolean(cell.transfer) || cell.away || Boolean(cell.surprise?.done);
      if (leaving && cell.vanish < 1 && delta > 0) {
        if (cell.vanish === 0) fx.emit('poof', cell.leaf.position.clone().add(cell.root.position), { count: 6, ring: .5 });
        cell.vanish = reducedMotion ? 1 : Math.min(1, cell.vanish + delta / .22);
      } else if (!leaving) cell.vanish = 0;
      poseLeaf(cell.leaf, leafResources, { open: smooth(cell.open), bounce: cell.spring, vanish: cell.vanish, turn: cell.turn });
      const shade = (1 - smooth(cell.open)) * (1 - cell.vanish); cell.shade.scale.set(2.6 * shade + 1e-3, 1, 2.5 * shade + 1e-3);
      updateSurprise(cell, revealDelta);
      if (cell.dash) updateDash(cell, delta);
      if (cell.actor && !cell.moved && !cell.transfer && !cell.away) {
        cell.actor.root.visible = cell.open > .17;
        if (cell.open > 0) cell.revealAge += revealDelta;
        // The spring out of the leaf is the friend's own peek gesture; the root stays on the ground.
        cell.actor.root.position.y = cell.root.position.y + .085;
        if (cell.faceYaw != null && delta > 0) cell.actor.root.rotation.y = turnToward(cell.actor.root.rotation.y, cell.faceYaw, reducedMotion ? 1 : 1 - Math.exp(-delta / .16));
      }
      if (cell.transfer) updateHop(cell, homeDelta);
    }
    for (const nest of nests) {
      nest.pulse += delta;
      if (nest.members.length === 2 && nest.members.every(actor => cells.some(cell => cell.actor === actor && cell.moved))) adventure.bindPair(nest.species, nest.members);
      if (nest.members.length === 2 && !nest.reunited && nest.members.every(actor => cells.some(cell => cell.actor === actor && cell.moved))) playNest(nest.index);
      nest.reunionAge += delta;
    }
    adventure.update(actionDelta, time);
    for (const actor of babyActors) if (actor.root.visible && delta > 0) {
      const cell = cells.find(value => value.actor === actor);
      const revealHold = cameraTravel && cell && !cell.moved && !cell.transfer;
      actor.update?.(revealHold || cell?.transfer && !homeDelta || focusHold && adventure.ownsPair(actor.species) ? 0 : delta);
    }
    adventure.afterActors(actionDelta);
    cameraDirector.setCue(cameraCue()); cameraDirector.update(delta);
    lighting.focus(cameraDirector.focus(), cameraDirector.mode() === 'overview' ? 22 : 15);
    cheerAge += delta; bonkAge += delta;
    if (cheerAge > 1.2 && cheerAge - delta <= 1.2) mosi.openEyes();
    mosiPuppet.update(delta); mosi.update(delta);
    wind.update(reducedMotion ? 0 : time); sky.update(reducedMotion ? 0 : time, camera);
    gladeScenery.update(time, reducedMotion);
    scene.updateMatrixWorld();
    fx.update(delta, { actionDt: actionDelta, actors: babyActors, feet: actor => footBones.get(actor) ?? [], camera, viewportHeight: canvas.height });
    actorFrustum.setFromProjectionMatrix(actorView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    // Keep animation/navigation alive off camera, but do not submit invisible
    // skins and their shadow-only twins. The generous spheres cover every
    // authored head/tail pose plus a nearby contact shadow.
    for (const actor of babyActors) {
      actorSphere.center.copy(actor.root.position); actorSphere.center.y += .8 * actorSize(actor); actorSphere.radius = 3 * actorSize(actor);
      actor.model.visible = !actor.root.visible || actorFrustum.intersectsSphere(actorSphere);
    }
    actorSphere.center.copy(mosi.root.position); actorSphere.center.y += 1.2; actorSphere.radius = 4.2;
    mosi.model.visible = !bridgeSnapshot.atStaging && actorFrustum.intersectsSphere(actorSphere);
    mosiShade.scale.set(bridgeSnapshot.atStaging ? 0 : 2.6, 1, bridgeSnapshot.atStaging ? 0 : 3.8); mosiShade.updateMatrixWorld();
    contactMeshes.forEach((mesh, index) => contactBatch.setMatrixAt(index, mesh.matrixWorld)); contactBatch.instanceMatrix.needsUpdate = true;
    const remainingCovers = cells.filter(cell => cell.vanish < 1);
    for (const batch of leafBatches) {
      batch.count = remainingCovers.length; batch.visible = batch.count > 0;
      remainingCovers.forEach((cell, index) => batch.setMatrixAt(index, cell.leaf.matrixWorld)); batch.instanceMatrix.needsUpdate = true;
    }
    forest.update(delta, time);
    forestVisibility.update(cameraDirector.focus());
    // All six babies can walk at once. At tablet size the existing quarter
    // skin stays below 0.7 physical pixels of error through its 250px switch
    // (including hysteresis); eyelid/eye-region triangles are always retained.
    // This local threshold leaves screen sizes and other games unchanged.
    updateCharacterLods(camera, canvas.height * (q.name === 'tablet' ? .8 : 1));
    updateTargets(); renderer.info.reset(); renderer.render(scene, camera);
    lastStats = { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, resolutionScale: resolution };
    if (q.dynamicResolution && delta > 0) {
      frameTime += delta; frameCount++;
      if (frameTime > 1.2) {
        const average = frameTime / frameCount, old = resolution;
        if (average > .038) resolution = Math.max(.65, resolution - .1);
        frameTime = frameCount = 0; if (old !== resolution) resize(width, height);
      }
    }
  }

  function pick(clientX, clientY) {
    if (disposed || !cameraDirector.isInteractive()) return null;
    const rect = canvas.getBoundingClientRect();
    for (const target of renderTargets) if (target.enabled && target.type !== 'leaf' && Math.abs(clientX - rect.left - target.x) <= target.width / 2 && Math.abs(clientY - rect.top - target.y) <= target.height / 2) return target.type === 'task' ? { type: 'task', id: target.id } : { type: 'nest', index: target.index };
    pointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    for (const hit of raycaster.intersectObjects(pickables, false)) {
      const data = hit.object.userData.memory;
      if (data.type === 'leaf') {
        const cell = cells[data.index]; if (cell.id != null && !cell.moved && !cell.transfer && !matchedStatus(cell.status)) return { type: 'leaf', id: cell.id };
      } else if (nests[data.index].members.length && !adventure.isBusy()) return { type: 'nest', index: nests[data.index].index };
    }
    return null;
  }

  function dispose() {
    if (disposed) return; disposed = true; resizeObserver?.disconnect();
    for (const actor of babyActors) { if (actor.model) releaseCharacter(actor.model); actor.dispose?.(); }
    babyShadows?.dispose();
    if (!Array.isArray(babyLibrary)) babyLibrary?.dispose?.();
    scenes.cancelAll(); mosiPuppet?.dispose(); adventure?.dispose(); mosi?.dispose(); forestVisibility?.dispose(); forest?.dispose(); floor?.dispose(); gladeScenery?.dispose(); sky.dispose();
    for (const item of items.values()) { item.group.removeFromParent(); item.dispose(); }
    leafResources.dispose(); contactResources.dispose(); hitGeometry.dispose(); hitMaterial.dispose();
    fx.dispose(); depthShadow?.target.dispose();
    lighting.sun.shadow.map = null; lighting.sun.dispose(); scene.environment = null; scene.clear(); renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss();
  }

  // On-screen size of a whole character (its posed, skinned bounds) or of a leaf (its own corners),
  // every corner projected. QA only: the playthrough measures the glade view with it.
  function screenBox(points) {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const point of points) {
      projection.copy(point).project(camera);
      const px = (projection.x + 1) * width / 2, py = (1 - projection.y) * height / 2;
      left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
    }
    const round = value => Math.round(value * 10) / 10;
    return { left: round(left), top: round(top), right: round(right), bottom: round(bottom), width: round(right - left), height: round(bottom - top), inside: left >= 0 && top >= 0 && right <= width && bottom <= height };
  }
  // The posed skin's vertices (skinned meshes that draw, not their shadow twins), every third one.
  function skinPoints(object) {
    object.updateMatrixWorld(true);
    const points = [];
    object.traverse(mesh => {
      if (!mesh.isSkinnedMesh || !mesh.visible || mesh.name.endsWith(' shadow')) return;
      const count = mesh.geometry.attributes.position.count;
      for (let i = 0; i < count; i += 3) points.push(mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
    });
    return points;
  }
  function measureFrame() {
    return {
      size: { width, height }, camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray() },
      babies: cells.filter(cell => cell.actor).map(cell => ({ cell: cell.index, species: cell.species, visible: cell.actor.root.visible, ...screenBox(skinPoints(cell.actor.model)) })),
      mosi: screenBox(skinPoints(mosi.model)),
      homes: nests.map(nest => ({ index: nest.physicalIndex, ...screenBox([nest.root.position.clone().add(new THREE.Vector3(0, 1, 0))]) })),
      leaves: cells.filter(cell => !cell.moved).map(cell => ({ cell: cell.index, status: cell.status, ...screenBox(leafCorners.map(corner => corner.clone().applyMatrix4(cell.leaf.matrixWorld))) })),
    };
  }

  function getDebug({ collision = params.has('qa'), measure = false } = {}) {
    const project = point => { const p = point.clone().project(camera); return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2, visible: Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && Math.abs(p.z) <= 1 }; };
    const leafBounds = cell => {
      if (cell.moved) return null;
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (const corner of leafCorners) { const p = project(corner.clone().applyMatrix4(cell.leaf.matrixWorld)); left = Math.min(left, p.x); top = Math.min(top, p.y); right = Math.max(right, p.x); bottom = Math.max(bottom, p.y); }
      return { left, top, right, bottom, width: right - left, height: bottom - top };
    };
    const bridge = adventure.getDebug();
    for (const [species, pair] of Object.entries(bridge.pairs ?? {})) {
      const members = nests.find(nest => nest.species === species)?.members ?? [];
      pair.actors = (pair.actors ?? members.map((actor, index) => ({ id: `${species}-${index}`, position: actor.root.position.toArray() }))).map((value, index) => {
        const actor = members[index]; if (!actor) return value;
        const pose = actor.getDebugState?.();
        return { ...value, motion: pose?.motion ?? null, gesture: pose?.gesture ?? null, screen: project(actor.root.position), headScreen: project(actor.getNosePosition?.() ?? actor.root.position.clone().add(new THREE.Vector3(0, 1, 0))) };
      });
    }
    const characterLod = babyActors.filter(actor => actor.root.visible).map(actor => {
      let mainTriangles = 0, shadowTriangles = 0; const levels = [];
      actor.model.traverse(mesh => {
        if (!mesh.isMesh) return;
        const count = (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
        if (mesh.isSkinnedMesh && mesh.name.endsWith(' shadow')) shadowTriangles += count;
        else if (mesh.visible) { mainTriangles += count; if (mesh.geometry.userData.lod) levels.push({ mesh: mesh.name, triangles: count, source: mesh.geometry.userData.lod.sourceTriangles }); }
      });
      return { species: actor.species, rendered: actor.model.visible, mainTriangles: actor.model.visible ? mainTriangles : 0, shadowTriangles: actor.model.visible ? shadowTriangles : 0, levels };
    });
    const cameraState = cameraDirector.getDebug();
    const collisionActors = collision ? babyActors.filter(actor => actor.root.visible).map(actor => actorCollisionSnapshot(actor, actorIds.get(actor))) : [];
    if (collision && !bridgeSnapshot.atStaging) collisionActors.push(actorCollisionSnapshot(mosi, 'mosi'));
    const collisionObjects = (collision ? cells.filter(cell => !cell.moved && cell.open < .2 && !cell.actor?.root.visible) : []).map(cell => {
      const matrix = cell.leaf.matrixWorld, e = matrix.elements, axes = [[e[0], e[1], e[2]], [e[4], e[5], e[6]], [e[8], e[9], e[10]]], lengths = axes.map(axis => Math.hypot(...axis));
      axes.forEach((axis, i) => axis.forEach((value, j) => { axis[j] = value / lengths[i]; }));
      return { id: `leaf-${cell.id}`, parts: leafResources.collisionSlices.map((slice, i) => ({ name: `leaf-slice-${i}`, kind: 'leaf', center: slice.getCenter(new THREE.Vector3()).applyMatrix4(matrix).toArray(), axes, half: slice.getSize(new THREE.Vector3()).multiplyScalar(.5).toArray().map((value, j) => value * lengths[j]) })) };
    });
    if (collision) collisionObjects.push(...gladeScenery.collisionObjects);
    const homeNavigation = { ...homeNav.getDebug(), queued: cells.filter(cell => cell.transfer?.waiting).map(cell => cell.id), active: cells.filter(cell => cell.transfer && !cell.transfer.waiting).map(cell => cell.id) };
    return { ...lastStats, camera: cameraState, cameraDirector: cameraState, scene: { busy: scenes.busy(), waiting: scenes.waiting(), mosi: mosiPuppet?.current ?? null }, cameraPosition: camera.position.toArray(), size: { width, height }, bridge, characterLod, shadowLod: babyShadows?.stats ?? [], fx: fx.getDebug(), forestVisibility: forestVisibility.getDebug(), homeNavigation, collisionActors, collisionObjects,
      glade: { leaves: CELLS, rests: NESTS, river: { points: RIVER.points, halfWidth: RIVER.halfWidth, waterY: RIVER.waterY } },
      cells: cells.map(cell => ({ id: cell.id, species: cell.species, item: cell.item, surprise: cell.surprise ? { age: cell.surprise.age, popped: cell.surprise.popped, done: cell.surprise.done } : null, status: cell.status, open: cell.open, moving: Boolean(cell.transfer), queued: Boolean(cell.transfer?.waiting), moved: cell.moved, actorVisible: cell.actor?.root.visible ?? false, position: cell.actor?.root.visible ? cell.actor.root.position.toArray() : null, leafBounds: leafBounds(cell), feet: cell.actor?.root.visible ? (footBones.get(cell.actor) ?? []).map(bone => ({ name: bone.name, position: bone.getWorldPosition(new THREE.Vector3()).toArray() })) : [] })),
      nests: nests.map(nest => ({ index: nest.index, physicalIndex: nest.physicalIndex, species: nest.species, count: nest.members.length, reunionAge: nest.reunionAge, noseDistance: nest.species === 'triceratops' && nest.members.length === 2 ? nest.members[0].getNosePosition().distanceTo(nest.members[1].getNosePosition()) : null })),
      ...(measure ? { frame: measureFrame() } : {}),
    };
  }

  return { setBoard, reveal, conceal, match, celebrate, playNest, update, resize, pick,
    /** Play a script (scenes.js lines) on the game clock; game.js never reaches the runner itself. */
    runScene: (lines, options) => scenes.play(lines, options),
    /** A tap the child made that a waiting script may take (true when one did). */
    tapScene: target => scenes.tap(target),
    sceneBusy: () => scenes.busy(),
    getPairReadiness: () => Object.fromEntries(nests.filter(nest => nest.species).map(nest => [nest.species, nest.members.length === 2 && nest.members.every(actor => cells.some(cell => cell.actor === actor && cell.moved))])),
    setBridgeState(snapshot) { bridgeSnapshot = { ...snapshot }; adventure.setState(snapshot); cameraDirector.setCue(cameraCue()); updateTargets(); },
    startBridgeTask(id) { if (!cameraDirector.isInteractive()) return false; const started = adventure.start(id); cameraDirector.setCue(cameraCue()); updateTargets(); return started; },
    pollBridgeEvents() {
      deferredEvents.push(...adventure.pollEvents(), ...fx.pollSteps());
      if (cameraDirector.mode() === 'auto' && cameraDirector.isMoving() && adventure.isBusy()) { const ready = deferredEvents.filter(event => event.type === 'bridge-complete' || event.type === 'footstep' || event.type.startsWith('scene-')); for (const event of ready) deferredEvents.splice(deferredEvents.indexOf(event), 1); return ready; }
      return deferredEvents.splice(0);
    },
    setCameraMode(mode) { const changed = cameraDirector.setMode(mode); updateTargets(); return changed; },
    getCameraState: () => cameraDirector.getDebug(),
    setReducedMotion(value) { reducedMotion = Boolean(value); fx.setReducedMotion(reducedMotion); cameraDirector.setReducedMotion(reducedMotion); mosiPuppet.setReducedMotion(reducedMotion); adventure.setReducedMotion(reducedMotion); babyActors.forEach(actor => actor.setReducedMotion?.(reducedMotion)); mosi.play('idle', { timeScale: reducedMotion ? 0 : 1 }); },
    setMosiSpeech(amplitude = 0) { const level = THREE.MathUtils.clamp(Number(amplitude) || 0, 0, 1); if (level < .015) mosi.stopTalking(); else mosi.talk({ mouth: Math.round(level * 15).toString(16).repeat(5), duration: .25 }); },
    getTargets: () => renderTargets.map(target => ({ ...target })),
    getDebug,
    dispose,
  };
}
