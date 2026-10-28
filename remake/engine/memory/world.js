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
import { createLeafResources, makeLeaf, createContactResources, makeContact, createClearingFloor, createGladeScenery } from './world-props.js';
import { createBridgeAdventure } from './bridge-adventure.js';
import { bridgeValley, refineBridgeGround, riverDistance, RIVER, MARSH } from './bridge-props.js';
import { createMemoryShadowLods } from './world-character-shadows.js';
import { createCameraDirector } from './camera-director.js';
import { createWorldFx } from './world-fx.js';
import { measureActor, actorCollisionSnapshot, bridgeCollisionObjects } from './memory-clearance.js';
import { createHomeNavigation, homeTravelProgress, sampleHomeTravel } from './world-home-nav.js';
import { createForestVisibility } from './world-forest-visibility.js';

const CELLS = [[-6.4, 2.8], [-2, 2.8], [2.4, 2.8], [-6.4, 7.2], [-2, 7.2], [2.4, 7.2]];
const NESTS = [[-.8, -.4], [5.0, 6.0], [-6.4, -1.8]];
const SPECIES = ['triceratops', 'stegosaurus', 'brontosaurus'];
const SHOT = { position: [12, 24, 25], target: [-1, .1, -2.8], fov: 35 };
const smooth = t => { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const visibleStatus = value => ['open', 'revealed', 'selected', 'matched', 'found'].includes(value);
const matchedStatus = value => ['matched', 'found'].includes(value);
const actorScale = actor => actor.species === 'brontosaurus' ? 1.2 : 1;
const restOffset = species => species === 'triceratops' ? 1.25 : species === 'stegosaurus' ? .95 : 1.15;
const restHeading = () => -Math.PI * 70 / 180;
const restVector = (species, member) => new THREE.Vector3(Math.sin(restHeading()) * restOffset(species) * (member ? -1 : 1), .1, Math.cos(restHeading()) * restOffset(species) * (member ? -1 : 1));

/** The memory clearing owns its render context; game.js owns the RAF and game clock. */
export async function createMemoryWorld({ canvas, onProgress = () => {} }) {
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
      const glade = Math.hypot((x + 2) / 6.8, (z - 2.8) / 5.4), working = Math.hypot((x + 3) / 4.8, (z + 3.5) / 3.6), staging = Math.hypot((x - 4.5) / 6.8, (z + 13.8) / 4.5), berries = Math.hypot((x - 4.5) / 6.8, (z + 26) / 4.8);
      const marsh = Math.hypot((x - MARSH.center[0]) / (MARSH.halfWidth + 1.2), (z - MARSH.center[1]) / (MARSH.halfDepth + 1.1));
      const bare = 1 - THREE.MathUtils.smoothstep(Math.min(glade, working, staging, berries, marsh), .9, 1.12);
      const water = 1 - THREE.MathUtils.smoothstep(riverDistance(x, z).distance, RIVER.halfWidth + .1, RIVER.halfWidth + .65);
      // Full-height procedural crowns must stay outside every automatic
      // camera corridor. Authored low plants frame these foreground edges.
      const cameraCorridor = x > -12 && x < 21 && z > -18 && z < 16 || x > -5 && x < 15 && z >= -34 && z <= -16;
      return Math.max(bare, water, cameraCorridor ? 1 : 0);
    },
    shots: { board: SHOT },
    actors: { mosi: { position: [-7.2, 0, 4.5], heading: 65 }, ...Object.fromEntries(CELLS.map(([x, z], i) => [`place${i}`, { position: [x, 0, z], heading: 90 }])) },
    lift(x, z) { return bridgeValley(x, z); },
  };
  const actors = new Map();
  const world = { THREE, scene, camera, renderer, q, params, look, lighting, wind, actors, chapter: { layout, shots: layout.shots, actors: layout.actors }, heightAt: () => 0 };
  world.resolvePoint = createPointResolver(world); world.points = world.resolvePoint;
  let disposed = false, time = 0, width = 1280, height = 800, resolution = 1, frameTime = 0, frameCount = 0;
  let forest, forestVisibility, floor, gladeScenery, mosi, mosiShade, babyActors = [], babyLibrary, babyShadows, resizeObserver, adventure;
  const leafResources = createLeafResources(), contactResources = createContactResources();
  leafResources.geometry.computeBoundingBox();
  const leafCorners = [], footBones = new WeakMap(), actorIds = new WeakMap(), leafBox = leafResources.geometry.boundingBox;
  for (const x of [leafBox.min.x, leafBox.max.x]) for (const y of [leafBox.min.y, leafBox.max.y]) for (const z of [leafBox.min.z, leafBox.max.z]) leafCorners.push(new THREE.Vector3(x, y, z));
  const cells = [], nests = [], byId = new Map(), leafBatches = [], contactMeshes = [], logicalToPhysical = [0, 1, 2];
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
  let cheerAge = 100, lastStats = {}, reducedMotion = false;

  function gladeCue() {
    const points = [];
    for (const [x, z] of CELLS) for (const dx of [-1.45, 1.45]) for (const dz of [-1.4, 1.4]) for (const y of [.03, 1.15]) points.push([x + dx, world.heightAt(x, z) + y, z + dz]);
    for (const [x, z] of NESTS) for (const dx of [-1.85, 1.85]) for (const dz of [-1.1, 1.1]) points.push([x + dx, 1.6, z + dz]);
    points.push([-10.3, 2, 9.3], [-7.2, 1.7, 11.8]);
    return { key: 'glade', phase: 'memory', focus: [-1.5, .5, 3.2], points, scale: 'wide' };
  }
  function overviewCue() {
    return { key: 'overview', phase: 'overview', focus: [0, .5, -10], scale: 'wide', points: [...gladeCue().points, [-2, 1.8, -30], [10.5, 2.4, -30], [-2, 1, -22], [11, 1, -22], [-1, 1.5, -14], [10, 1.5, -14]] };
  }
  const cameraDirector = createCameraDirector({ camera, overview: overviewCue, fallback: gladeCue });
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
    if (mosi) { const x = -8.8, z = 9.7; mosi.root.position.set(x, world.heightAt(x, z), z); }
    if (mosiShade && mosi) mosiShade.position.copy(mosi.root.position).add(new THREE.Vector3(0, .095, 0));
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
    gladeScenery = createGladeScenery(world, CELLS);
    for (let i = 0; i < CELLS.length; i++) {
      const [x, z] = CELLS[i], y = world.heightAt(x, z);
      const root = new THREE.Group(); root.name = `Felustaður ${i + 1}`; root.position.set(x, y, z); scene.add(root);
      const shade = makeContact(contactResources, 2.9, 2.8); shade.position.y = .095; root.add(shade); contactMeshes.push(shade);
      const leaf = makeLeaf(leafResources); leaf.position.set(0, .32, -1.3); root.add(leaf);
      const hit = addHit(root, 2.7, 2.7, { type: 'leaf', index: i });
      cells.push({ root, leaf, shade, hit, index: i, id: null, species: null, status: 'hidden', targetOpen: 0, open: 0, revealAge: 100, actor: null, transfer: null, moved: false });
    }
    // Identical covers share two instanced draws and one shadow draw.
    // Their empty pose groups still animate independently and remain pickable.
    for (const cell of cells) cell.leaf.clear();
    for (const [geometry, material, castShadow] of [[leafResources.geometry, leafResources.material, true], [leafResources.veinGeometry, leafResources.veinMaterial, false]]) {
      const batch = new THREE.InstancedMesh(geometry, material, 6); batch.castShadow = castShadow; batch.receiveShadow = true; batch.frustumCulled = false;
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
      const route = homeNav.request(actor, end, yaw ?? actor.root.rotation.y, { allowEndContact: pushing && action.phase === 'approach', allowStartContact: pushing && action.phase === 'return' });
      if (route === undefined) return undefined;
      homeNav.release(actor);
      return route?.points ?? null;
    } });
    onProgress('Mosi kemur að hjálpa…');
    mosi = await createActor(world, { name: 'mosi-memory', url: new URL('../../assets/characters/mosi.glb', import.meta.url).href, position: [-7.2, 0, 4.5], heading: 65 });
    mosi.root.scale.setScalar(.49); mosi.controlled = true; mosi.lookYawLimit = 25; mosi.lookUpLimit = 20; mosi.species = 'mosi'; measureActor(mosi);
    mosi.lookAt(camera.position, { weight: .38, maxAngle: 20 }); actors.set('mosi', mosi);
    mosiShade = makeContact(contactResources, 2.6, 3.8); mosiShade.position.set(-7.2, world.heightAt(-7.2, 4.5) + .095, 4.5); scene.add(mosiShade);
    contactMeshes.push(mosiShade); contactMeshes.forEach(mesh => { mesh.visible = false; });
    contactBatch = new THREE.InstancedMesh(contactResources.geometry, contactResources.material, contactMeshes.length); contactBatch.frustumCulled = false; contactBatch.renderOrder = 8; scene.add(contactBatch);
    onProgress('Ungarnir finna felustaði…');
    const module = await import('./baby-actors.js');
    babyLibrary = await module.createBabyActors({ scene, species: SPECIES, length: 2.6, instancesPerSpecies: 2 });
    babyActors = Array.isArray(babyLibrary) ? babyLibrary : (babyLibrary.actors ?? []);
    if (babyActors.length < 6) throw new Error('Minnisspil needs six baby instances.');
    const memberCounts = {};
    for (const actor of babyActors) {
      actor.root.visible = false; actor.root.scale.setScalar(actorScale(actor));
      actorIds.set(actor, `${actor.species}-${memberCounts[actor.species] ?? 0}`); memberCounts[actor.species] = (memberCounts[actor.species] ?? 0) + 1; measureActor(actor);
      const feet = []; actor.model.traverse(bone => { if (bone.isBone && /Foot/.test(bone.name)) feet.push(bone); }); footBones.set(actor, feet);
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
    byId.clear(); fx.reset(); homeNav.reset(); deferredEvents.length = 0; cheerAge = 100; adventure.reset(); bridgeSnapshot = { selected: null, atStaging: false, boardwalkBuilt: false, visited: false }; cameraDirector.reset(); logicalToPhysical.splice(0, 3, 0, 1, 2);
    for (const actor of babyActors) { actor.root.visible = false; actor.root.scale.setScalar(actorScale(actor)); actor.walk?.(false); actor.setMotion?.('idle'); }
    for (const nest of nests) { nest.index = nest.physicalIndex; nest.species = null; nest.members = []; nest.pulse = 100; nest.reunionAge = 100; nest.reunited = false; }
    const available = [...babyActors];
    cards.forEach((card, i) => {
      const cell = cells[i]; if (!cell) return;
      const actorIndex = available.findIndex(actor => actor.species === card.species);
      if (actorIndex < 0) throw new Error(`Missing baby for ${card.species}.`);
      const actor = available.splice(actorIndex, 1)[0];
      Object.assign(cell, { id: card.id, species: card.species, status: card.status ?? 'hidden', actor, targetOpen: 0, open: 0, revealAge: 100, transfer: null, moved: false });
      cell.leaf.visible = true; cell.leaf.rotation.set(0, 0, 0); cell.leaf.scale.setScalar(1); cell.shade.visible = false;
      actor.root.position.copy(cell.root.position); actor.root.position.y += .085;
      // The Triceratops beak points 21° across its body; its own turn restores
      // a welcoming three-quarter face while the two long-bodied species show profile.
      actor.root.rotation.y = card.species === 'triceratops' ? -Math.PI * .39 : -Math.PI / 5;
      actor.root.visible = false; byId.set(card.id, cell);
      cell.hit.userData.memory.id = card.id;
    });
  }

  function setBoard(cards) {
    if (disposed || !Array.isArray(cards)) return;
    if (cards.length !== 6) throw new RangeError('First memory board has six hiding places.');
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

  function reveal(id) {
    const cell = byId.get(id); if (!cell || cell.moved || cell.transfer) return false;
    cell.status = 'revealed'; cell.targetOpen = 1; cell.revealAge = 0;
    cell.actor.reveal?.(); cell.actor.root.visible = true;
    mosi.lookAt(cell.actor.root.position.clone().add(new THREE.Vector3(0, .45, 0)), { weight: .48, maxAngle: 26 });
    return true;
  }

  function conceal(ids) {
    for (const id of ids) {
      const cell = byId.get(id); if (!cell || cell.moved || cell.transfer) continue;
      cell.status = 'hidden'; cell.targetOpen = 0; cell.actor.mismatch?.();
    }
  }

  function burst(point, count = 14) {
    fx.emit('leaves', point.clone().add(new THREE.Vector3(0, .14, 0)), { count: Math.min(7, count) });
  }

  function match(ids, nestIndex, species) {
    const physicalIndex = SPECIES.indexOf(species), nest = nests[physicalIndex]; if (!nest || !Number.isInteger(nestIndex)) return false;
    // Discovery order remains the public API, while homes have a stable place.
    // Swapping the two unused slots keeps all three target keys present.
    const oldLogical = logicalToPhysical.indexOf(physicalIndex), displaced = logicalToPhysical[nestIndex];
    logicalToPhysical[nestIndex] = physicalIndex; logicalToPhysical[oldLogical] = displaced;
    nests.forEach(value => { value.index = logicalToPhysical.indexOf(value.physicalIndex); });
    nest.species = species; nest.members = []; nest.reunited = false;
    ids.forEach((id, member) => {
      const cell = byId.get(id); if (!cell || cell.moved || cell.transfer) return;
      cell.status = 'matched'; cell.targetOpen = 1; cell.actor.root.visible = true;
      const start = cell.actor.root.position.clone(), end = nest.root.position.clone().add(nest.restOffsets[member]);
      cell.transfer = { age: 0, waiting: true, retry: member * .14, nest, end, member, endYaw: nest.restYaw, queuedAt: time };
      cell.actor.walk?.(false); cell.actor.setMotion?.('idle'); nest.members.push(cell.actor); fx.emit('match',start,{count:18,strength:1});
    });
    mosi.blink(); return true;
  }

  function playNest(index) {
    const nest = nests[logicalToPhysical[index]]; if (!nest?.members.length) return false;
    if (adventure.isVisited()) { for (const actor of nest.members) { if (actor.delight) actor.delight(); else actor.greet?.(); } burst(adventure.pairCentre(nest.species), 12); return true; }
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
    if (delta > 0) homeNav.pump(cells.some(cell => cell.transfer?.waiting) ? 6 : 3);
    for (const cell of cells) {
      const before = cell.open, step = !(delta > 0) || cameraTravel ? 0 : reducedMotion ? 1 : revealDelta / .25;
      cell.open += THREE.MathUtils.clamp(cell.targetOpen - cell.open, -step, step);
      const opening = smooth(cell.open); cell.leaf.rotation.x = -opening * 2.7;
      cell.leaf.rotation.z = Math.sin(opening * Math.PI) * .055;
      cell.leaf.scale.setScalar(cell.moved ? 0 : 1 - opening * .65);
      if (cell.actor && !cell.moved && !cell.transfer) {
        cell.actor.root.visible = cell.open > .17;
        if (cell.open > 0) cell.revealAge += revealDelta;
        // Small grounded rise; no whole-character squash or teleporting.
        cell.actor.root.position.y = cell.root.position.y + .085 + (reducedMotion ? 0 : Math.sin(Math.min(1, cell.revealAge / .45) * Math.PI) * .09);
      }
      if (before !== cell.open) cell.leaf.updateMatrixWorld();
      if (before < .2 && cell.open >= .2 && !cell.transfer && !cell.moved) burst(cell.root.position, 5);
      if (cell.transfer) {
        const move = cell.transfer;
        if (move.waiting) {
          move.retry -= homeDelta;
          if (homeDelta > 0 && move.retry <= 0) {
            move.retry = .12;
            const route = homeNav.request(cell.actor, move.end, move.endYaw);
            if (route === undefined) move.retry = .05;
            if (route && homeNav.canStart(cell.actor, route, cells.filter(value => value !== cell && value.transfer && !value.transfer.waiting))) {
              Object.assign(move, route, { waiting: false, startedAt: time }); homeNav.release(cell.actor, true);
              cell.actor.walk?.(true); cell.actor.setMotion?.('walk');
            }
          }
          if (move.waiting) continue;
        }
        move.age += homeDelta;
        const progress=homeTravelProgress(move,move.age),sampled=sampleHomeTravel(move,move.age);
        cell.actor.root.position.copy(sampled.point);
        cell.actor.root.scale.setScalar(actorScale(cell.actor));
        const wanted = progress>.97?move.endYaw:sampled.yaw, difference = Math.atan2(Math.sin(wanted - cell.actor.root.rotation.y), Math.cos(wanted - cell.actor.root.rotation.y));
        cell.actor.root.rotation.y += difference * (1 - Math.exp(-homeDelta / .09));
        if (move.age >= move.duration) {
          cell.actor.root.position.copy(move.end);
          move.finishAge = (move.finishAge ?? 0) + homeDelta;
          const turn = Math.atan2(Math.sin(move.endYaw - cell.actor.root.rotation.y), Math.cos(move.endYaw - cell.actor.root.rotation.y));
          cell.actor.root.rotation.y += turn * (1 - Math.exp(-homeDelta / .06));
          cell.actor.walk?.(false); cell.actor.setMotion?.('idle');
          if (!reducedMotion && move.finishAge < .24) continue;
          cell.actor.root.rotation.y = move.endYaw;
          cell.actor.walk?.(false); cell.actor.setMotion?.('idle'); cell.actor.greet?.();
          cell.moved = true; cell.transfer = null; move.nest.pulse = 0; burst(move.end, 9);
        }
      }
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
    cheerAge += delta;
    if (cheerAge > 1.2 && cheerAge - delta <= 1.2) mosi.openEyes();
    mosi.update(delta);
    wind.update(reducedMotion ? 0 : time); sky.update(reducedMotion ? 0 : time, camera);
    gladeScenery.update(time, reducedMotion);
    scene.updateMatrixWorld();
    fx.update(delta, { actionDt: actionDelta, actors: babyActors, feet: actor => footBones.get(actor) ?? [], camera, viewportHeight: canvas.height });
    actorFrustum.setFromProjectionMatrix(actorView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    // Keep animation/navigation alive off camera, but do not submit invisible
    // skins and their shadow-only twins. The generous spheres cover every
    // authored head/tail pose plus a nearby contact shadow.
    for (const actor of babyActors) {
      actorSphere.center.copy(actor.root.position); actorSphere.center.y += .8 * actorScale(actor); actorSphere.radius = 3 * actorScale(actor);
      actor.model.visible = !actor.root.visible || actorFrustum.intersectsSphere(actorSphere);
    }
    actorSphere.center.copy(mosi.root.position); actorSphere.center.y += 1.2; actorSphere.radius = 4.2;
    mosi.model.visible = !bridgeSnapshot.atStaging && actorFrustum.intersectsSphere(actorSphere);
    mosiShade.scale.set(bridgeSnapshot.atStaging ? 0 : 2.6, 1, bridgeSnapshot.atStaging ? 0 : 3.8); mosiShade.updateMatrixWorld();
    contactMeshes.forEach((mesh, index) => contactBatch.setMatrixAt(index, mesh.matrixWorld)); contactBatch.instanceMatrix.needsUpdate = true;
    const remainingCovers = cells.filter(cell => !cell.moved);
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
    adventure?.dispose(); mosi?.dispose(); forestVisibility?.dispose(); forest?.dispose(); floor?.dispose(); gladeScenery?.dispose(); sky.dispose();
    leafResources.dispose(); contactResources.dispose(); hitGeometry.dispose(); hitMaterial.dispose();
    fx.dispose(); depthShadow?.target.dispose();
    lighting.sun.shadow.map = null; lighting.sun.dispose(); scene.environment = null; scene.clear(); renderer.renderLists.dispose(); renderer.dispose(); renderer.forceContextLoss();
  }

  function getDebug({ collision = params.has('qa') } = {}) {
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
    return { ...lastStats, camera: cameraState, cameraDirector: cameraState, cameraPosition: camera.position.toArray(), size: { width, height }, bridge, characterLod, shadowLod: babyShadows?.stats ?? [], fx: fx.getDebug(), forestVisibility: forestVisibility.getDebug(), homeNavigation, collisionActors, collisionObjects,
      glade: { leaves: CELLS, rests: NESTS, river: { points: RIVER.points, halfWidth: RIVER.halfWidth, waterY: RIVER.waterY } },
      cells: cells.map(cell => ({ id: cell.id, species: cell.species, status: cell.status, open: cell.open, moving: Boolean(cell.transfer), queued: Boolean(cell.transfer?.waiting), moved: cell.moved, actorVisible: cell.actor?.root.visible ?? false, position: cell.actor?.root.visible ? cell.actor.root.position.toArray() : null, leafBounds: leafBounds(cell), feet: cell.actor?.root.visible ? (footBones.get(cell.actor) ?? []).map(bone => ({ name: bone.name, position: bone.getWorldPosition(new THREE.Vector3()).toArray() })) : [] })),
      nests: nests.map(nest => ({ index: nest.index, physicalIndex: nest.physicalIndex, species: nest.species, count: nest.members.length, reunionAge: nest.reunionAge, noseDistance: nest.species === 'triceratops' && nest.members.length === 2 ? nest.members[0].getNosePosition().distanceTo(nest.members[1].getNosePosition()) : null })),
    };
  }

  return { setBoard, reveal, conceal, match, celebrate, playNest, update, resize, pick,
    getPairReadiness: () => Object.fromEntries(nests.filter(nest => nest.species).map(nest => [nest.species, nest.members.length === 2 && nest.members.every(actor => cells.some(cell => cell.actor === actor && cell.moved))])),
    setBridgeState(snapshot) { bridgeSnapshot = { ...snapshot }; adventure.setState(snapshot); cameraDirector.setCue(cameraCue()); updateTargets(); },
    startBridgeTask(id) { if (!cameraDirector.isInteractive()) return false; const started = adventure.start(id); cameraDirector.setCue(cameraCue()); updateTargets(); return started; },
    pollBridgeEvents() {
      deferredEvents.push(...adventure.pollEvents(), ...fx.pollSteps());
      if (cameraDirector.mode() === 'auto' && cameraDirector.isMoving() && adventure.isBusy()) { const ready = deferredEvents.filter(event => event.type === 'bridge-complete' || event.type === 'footstep'); for (const event of ready) deferredEvents.splice(deferredEvents.indexOf(event), 1); return ready; }
      return deferredEvents.splice(0);
    },
    setCameraMode(mode) { const changed = cameraDirector.setMode(mode); updateTargets(); return changed; },
    getCameraState: () => cameraDirector.getDebug(),
    setReducedMotion(value) { reducedMotion = Boolean(value); fx.setReducedMotion(reducedMotion); cameraDirector.setReducedMotion(reducedMotion); adventure.setReducedMotion(reducedMotion); babyActors.forEach(actor => actor.setReducedMotion?.(reducedMotion)); mosi.play('idle', { timeScale: reducedMotion ? 0 : 1 }); },
    setMosiSpeech(amplitude = 0) { const level = THREE.MathUtils.clamp(Number(amplitude) || 0, 0, 1); if (level < .015) mosi.stopTalking(); else mosi.talk({ mouth: Math.round(level * 15).toString(16).repeat(5), duration: .25 }); },
    getTargets: () => renderTargets.map(target => ({ ...target })),
    getDebug,
    dispose,
  };
}
