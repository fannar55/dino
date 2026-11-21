// Nothing appears or vanishes whole in front of the child (the owner's word of 2026-11-21: "Mjög mikið um pop in og pop out á trjám,
// plöntum og dýrum ... og fuglar á bergi í gilinu við foss sitja inní klett"). A small plant grows out of the ground and shrinks back
// into it at the edge of its distance; a critter shrinks away and grows in; a crown on screen keeps its shape at the frame's edge; a
// far plant at the frame's edge is drawn while the camera turns slowly; and the gorge's flyers stand on rock ledges, out of the wall.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRoute, NESTS, BEATS } from '../chapters/kafli4-route.js';
import { createTerrain, groundDrawnAt } from '../world/ardalur/terrain.js';
import { createLife, FISH } from '../world/ardalur/life.js';
import { createAnimals, FLUGDYR_MODEL, SMAEDLA_MODEL } from '../world/ardalur/animals.js';
import { createPlantMaterials } from '../world/ardalur/look.js';
import { crowdModelFrom, clipPose } from '../world/critters/crowd-models.js';
import { createCrowds, CROWD_GROW } from '../world/critters/crowd.js';
import { createSpeciesLibrary } from '../world/forest/species.js';
import { createBatcher, cullBatches, growAt, GROW, CULL_DISTANCE } from '../world/forest/batch.js';
import { createForest } from '../world/forest/forest.js';
import { createSharedUniforms, createVegetationMaterial, createNoiseTexture, createLeafTexture } from '../world/forest/materials.js';
import { ACTOR_GLSL } from '../world/forest/terrain.js';
import { FOREST } from '../world/forest/config.js';
import { chapter as kafli2 } from '../chapters/kafli2.js';
import { PRESETS } from '../engine/quality.js';
import { pickLook } from '../engine/looks.js';
import { sunDirection } from '../engine/lighting.js';
import { createWind } from '../engine/wind.js';
import { loadGlb } from './glb.mjs';

const DEG = Math.PI / 180;
const library = createSpeciesLibrary(4);
const route = createRoute();

function placement(name, o = {}) {
  const { variant = 0, lod = 0, band = 'edge', x = 0, z = 0, y = 0.2, rot = 0.7, scale = 1.1 } = o;
  const model = library.get(name, variant, lod);
  return { name, model, variant, lod, x, y, z, rot, scale, band, models: [{ level: lod, model }], sector: 0, sky: 1, phase: 0.4 };
}
function bake(...placements) {
  const batcher = createBatcher();
  for (const p of placements) batcher.add(p);
  return batcher.build(() => ({ material: new THREE.MeshBasicMaterial() })).meshes;
}
function cameraAt(position, target, fov = 50) {
  const camera = new THREE.PerspectiveCamera(fov, 1.6, 0.1, 2000);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

// ---- small plants ------------------------------------------------------------------------------------

test('a small plant grows out of the ground over the last fifth of its distance: nothing at its cut, full inside 80 % of it', () => {
  for (const cut of [20, 40, 64]) {
    assert.equal(growAt(cut, cut), 0, `nothing at its cut (${cut} m)`);
    assert.equal(growAt(cut * 1.2, cut), 0, 'nothing past it');
    assert.equal(growAt(cut * 0.8, cut), 1, 'full at 80 % of it');
    assert.equal(growAt(cut * 0.3, cut), 1, 'full near');
    const half = growAt(cut * 0.9, cut);
    assert.ok(half > 0.2 && half < 0.8, `half grown between (${half.toFixed(2)})`);
  }
  // every vertex of a fern knows its plant's foot and cut (aGrow), as the shader reads them; a tree (no cut) has none
  const fern = placement('fern', { x: 12.3, z: -7.1, y: 0.42 });
  const tree = placement('broadleaf', { x: -30, z: 4 });
  const meshes = bake(fern, tree);
  let ferns = 0, trees = 0;
  for (const mesh of meshes) {
    const pos = mesh.geometry.getAttribute('position');
    const grow = mesh.geometry.getAttribute('aGrow');
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i);
      const w = grow ? grow.getW(i) : 0;
      if (p.distanceTo(new THREE.Vector3(fern.x, p.y, fern.z)) < 3) {
        ferns++;
        assert.ok(grow, 'the fern\'s mesh has aGrow');
        const foot = p.clone().add(new THREE.Vector3(grow.getX(i), grow.getY(i), grow.getZ(i)).multiplyScalar(GROW.reach));
        assert.ok(foot.distanceTo(new THREE.Vector3(fern.x, fern.y, fern.z)) < 0.005, `a fern vertex's foot ${foot.toArray().map(v => v.toFixed(3))}`);
        assert.ok(Math.abs(w * GROW.far - CULL_DISTANCE.fern) < 0.02, `its cut ${(w * GROW.far).toFixed(2)} m`);
      } else {
        trees++;
        assert.equal(w, 0, 'a tree never shrinks');
      }
    }
  }
  assert.ok(ferns > 50 && trees > 50, `${ferns} fern and ${trees} tree vertices`);
});

test('the vegetation shader shrinks a small plant to its foot after the wind, the dance and her downwash have moved it', () => {
  const world = { wind: createWind(), q: PRESETS.tablet };
  const shared = createSharedUniforms(world, createNoiseTexture(1), createLeafTexture(1), 0);
  const actors = { glsl: ACTOR_GLSL, uniforms: { uActors: { value: [] }, uActorShape: { value: [] }, uActorCount: { value: 0 }, uActorWarm: { value: 0 } } };
  const compiled = material => {
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    material.onBeforeCompile(shader, null);
    return shader.vertexShader;
  };
  const forest = compiled(createVegetationMaterial(shared, { key: 'pop-test', actors }));
  const valley = createPlantMaterials(world, { noise: createNoiseTexture(1), leaf: createLeafTexture(1) });
  for (const [name, v] of [['forest', forest], ['valley solid', compiled(valley.solid)], ['valley thin', compiled(valley.thin)]]) {
    assert.ok(v.includes('attribute vec4 aGrow;'), `${name}: reads aGrow`);
    const grown = v.indexOf('forestGrown(');
    const call = v.lastIndexOf('forestGrown(');
    assert.ok(grown > 0 && call > grown, `${name}: shrinks`);
    assert.ok(call > v.indexOf('forestPivot( forestRest'), `${name}: after the wind and the dance`);
    if (name.startsWith('valley')) assert.ok(call > v.indexOf('ardalurDownwash( forestRest'), `${name}: after her downwash`);
    assert.ok(call < v.indexOf('#include <project_vertex>'), `${name}: before it is drawn`);
  }
  valley.dispose();
});

test('the cull keeps a small plant until it has shrunk to nothing, and takes it back before it grows', () => {
  const fern = placement('fern', { x: 0, z: 0, y: 0 });
  const meshes = bake(fern);
  const cut = CULL_DISTANCE.fern;
  for (const d of [0.5, 0.75, 0.85, 0.9, 0.95, 0.99, 1.02, 1.1, 0.97, 0.9, 0.8].map(k => k * cut)) {
    const camera = cameraAt(new THREE.Vector3(d, 1.2, 0), new THREE.Vector3(0, 0.6, 0));
    const drawn = cullBatches(meshes, camera) > 0;
    const size = growAt(Math.hypot(d, 1.2), cut);
    if (size > 0) assert.ok(drawn, `at ${d.toFixed(1)} m it is ${(size * 100).toFixed(0)} % grown and drawn`);
  }
});

// ---- crowns at the frame's edge ----------------------------------------------------------------------

test('a crown on screen at the frame\'s edge keeps its fine shape (its sphere holds all of its mesh)', () => {
  const tree = placement('broadleaf', { lod: 0, x: 0, z: 0, y: 0, scale: 1.2 });
  tree.models = [0, 1, 2].map(level => ({ level, model: library.get('broadleaf', 0, level) }));
  const meshes = bake(tree);
  const crowns = meshes.flatMap(m => m.userData.cull.ranges.filter(r => r.crown));
  assert.ok(crowns.length >= 3, 'its crown at three levels');
  const crown = crowns[0].crown;
  const eye = new THREE.Vector3(14, crown.centre.y, 0);
  let found = 0;
  // turn the camera away from the crown little by little: while any of the crown's mesh is on screen, it is drawn fine
  for (let yaw = 0; yaw < 90; yaw += 0.25) {
    const dir = new THREE.Vector3(-Math.cos(yaw * DEG), 0, Math.sin(yaw * DEG));
    const camera = cameraAt(eye, eye.clone().add(dir));
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const onScreen = crowns.some(r => frustum.intersectsSphere(r.sphere));
    if (!onScreen) break;
    cullBatches(meshes, camera);
    const kept = meshes.flatMap(m => m.userData.cull.kept).filter(r => r.crown);
    const levels = new Set(kept.map(r => r.lod));
    if (!frustum.intersectsSphere(new THREE.Sphere(crown.centre, crown.size + 1.5))) found++;
    assert.deepEqual([...levels], [0], `yaw ${yaw}: the crown drawn at ${[...levels]}`);
  }
  assert.ok(found > 0, 'turned until only the edge of its mesh was on screen');
});

// ---- far plants while the camera turns slowly --------------------------------------------------------

function nodeWorld() {
  const look = pickLook('morning');
  const sun = { castShadow: true, target: { position: new THREE.Vector3() }, shadow: { updateMatrices() {} } };
  return {
    THREE, renderer: { getDrawingBufferSize: v => v.set(1280, 800) }, scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(40, 1.6, 0.1, 1200), clock: null, q: PRESETS.tablet, params: new URLSearchParams(''), look,
    lighting: { direction: sunDirection(look), sun, focusRadius: 10 }, wind: createWind(), chapter: kafli2, heightAt: () => 0, actors: new Map(),
  };
}

test('a far plant coming in at the frame\'s edge is drawn while the camera turns slowly (under the turn that culls again)', async () => {
  const world = nodeWorld();
  const place = kafli2.locations.fenjaslod;
  const forest = await createForest(world, { ...place.layout, shots: place.shots });
  const meshes = [];
  forest.group.traverse(o => { if (o.userData?.cull?.ranges && !o.userData.caster) meshes.push(o); });
  const { center: [cx, cz], radius } = place.layout.clearing;
  const camera = world.camera;
  const eye = new THREE.Vector3();
  const frustumOf = () => new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const look = yaw => {
    camera.position.copy(eye);
    camera.lookAt(eye.x + Math.cos(yaw * DEG), eye.y, eye.z + Math.sin(yaw * DEG));
    camera.updateMatrixWorld(true);
  };
  let checked = 0;
  const missing = [];
  // from the clearing's middle and four spots round it, turning both ways
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) for (const turn of [1.45, -1.45]) for (let yaw0 = 0; yaw0 < 360; yaw0 += 15) {
    const x = cx + dx * radius * 0.8, z = cz + dz * radius * 0.8;
    eye.set(x, forest.heightAt(x, z) + 1.6, z);
    look(yaw0);
    forest.update(1 / 30, 0);
    const before = frustumOf();
    look(yaw0 + turn); // a slow turn: less than the turn after which the forest culls again
    forest.update(1 / 30, 0);
    const now = frustumOf();
    const kept = new Set(meshes.flatMap(m => m.userData.cull.kept ?? []).map(r => r.plant ?? r));
    for (const mesh of meshes) for (const r of mesh.userData.cull.ranges) {
      if (r.cull !== Infinity || before.intersectsSphere(r.sphere) || !now.intersectsSphere(r.sphere)) continue;
      if (r.crown ? r.lod !== r.crown.level : r.plant && r.li >= 0 && r.li !== r.plant.li) continue; // not the level it is drawn at
      const d = r.sphere.center.distanceTo(eye);
      if (d < 60) continue; // nearer, the cull's margin alone holds such a turn
      checked++;
      if (!kept.has(r.plant ?? r)) missing.push(`${r.name} ${d.toFixed(0)} m at yaw ${yaw0}`);
    }
  }
  forest.dispose();
  assert.ok(checked > 10, `${checked} far plants came in at the edge`);
  assert.deepEqual(missing.slice(0, 10), [], `${missing.length} far plants missing at the frame's edge`);
});

// ---- critters ----------------------------------------------------------------------------------------

/** The scale a crowd drew its last placed critter of `kind` at (its instance matrix). */
function drawnScale(crowds, kind) {
  const mesh = crowds.meshes.find(m => m.name === kind && m.count > 0);
  if (!mesh) return 0;
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(mesh.count - 1, m);
  return new THREE.Vector3().setFromMatrixScale(m).x;
}

test('a critter leaving or coming into the drawn set at the edge of its reach is scaled, not switched', () => {
  const crowds = createCrowds({ scene: new THREE.Scene() }, { seen: 160 });
  crowds.reserve('frog', 4);
  const camera = cameraAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
  const at = d => {
    crowds.begin(camera);
    const i = crowds.place('frog', new THREE.Vector3(d, 0, 0), 0, 2);
    crowds.end();
    return i < 0 ? 0 : drawnScale(crowds, 'frog') / 2;
  };
  assert.equal(at(100), 1, 'full well inside its reach');
  assert.equal(at(160 * (1 - CROWD_GROW.reach)), 1, `full to ${(1 - CROWD_GROW.reach) * 100} % of it`);
  assert.ok(at(159) < 0.05, `hardly anything at its edge (${at(159).toFixed(3)})`);
  let last = 1;
  for (let d = 130; d <= 162; d += 1) {
    const s = at(d);
    assert.ok(s <= last + 1e-9 && last - s < 0.12, `${d} m: from ${last.toFixed(2)} to ${s.toFixed(2)}, no jump`);
    last = s;
  }
  assert.equal(at(161), 0, 'not drawn past it');
  // a pose's own growth (one leaving by its pose), and its own reach (the G rows' lizards)
  crowds.begin(camera);
  crowds.place('frog', new THREE.Vector3(50, 0, 0), 0, 2, { grow: 0.3 });
  crowds.end();
  assert.ok(Math.abs(drawnScale(crowds, 'frog') / 2 - 0.3) < 1e-6, 'drawn at its pose\'s growth');
  crowds.begin(camera);
  assert.ok(crowds.place('frog', new THREE.Vector3(200, 0, 0), 0, 2, { seen: 250 }) >= 0, 'one seen to 250 m is drawn at 200 m');
  crowds.end();
  crowds.dispose();
});

const flyer = crowdModelFrom(await loadGlb(new URL(FLUGDYR_MODEL)));
const lizard = crowdModelFrom(await loadGlb(new URL(SMAEDLA_MODEL)));
const terrain = createTerrain(route);
const heightAt = (x, z) => terrain.heightAt(x, z);

function lifeWorld() {
  return { scene: new THREE.Scene(), camera: cameraAt(new THREE.Vector3(0, 300, 0), new THREE.Vector3(1, 300, 0)), clock: { time: 0 }, flightTime: null, flightU: null };
}

test('a critter that goes by its pose shrinks away over about half a second, and one that comes grows in', () => {
  const world = lifeWorld();
  const life = createLife(world, route, { heightAt, library, critters: { flugdyr: flyer, smaedla: lizard } });
  const grown = (b, ft) => {
    world.flightTime = ft;
    life.update(1 / 30, 10);
    return b.visible ? b.grow ?? 1 : 0;
  };
  // a fish's one jump: out of the water and back in, never there or gone whole
  const fish = life.things.find(b => b.kind === 'fish');
  assert.ok(grown(fish, fish.trigger + 0.01) < 0.15, 'a fish comes out small');
  assert.equal(grown(fish, fish.trigger + FISH.seconds / 2), 1, 'and is whole in the air');
  assert.ok(grown(fish, fish.trigger + FISH.seconds - 0.01) < 0.15, 'and small as it goes back in');
  // a flushed bird, flying off out of sight
  const bird = life.things.find(b => b.kind === 'earlyBird');
  assert.equal(grown(bird, bird.trigger + 1), 1);
  const gone = [3.0, 3.1, 3.2, 3.3, 3.4, 3.49].map(s => grown(bird, bird.trigger + s));
  assert.ok(gone.at(-1) < 0.05 && gone[0] > 0.9, `shrinks away over its last half second (${gone.map(g => g.toFixed(2))})`);
  for (let i = 1; i < gone.length; i++) assert.ok(gone[i] <= gone[i - 1] + 1e-9);
  // a flock's bird, up out of its grove at the big call
  life.bigCall(BEATS.END - 60);
  const flocker = life.things.find(b => b.flock);
  const first = flocker.flock.delay + flocker.late + BEATS.END - 60;
  assert.ok(grown(flocker, first + 0.02) < 0.1, 'grows in as it rises');
  assert.equal(grown(flocker, first + 1), 1);
  // the G rows' small lizards are seen to 250 m
  const rows = life.rows.filter(r => r.where === 'G').flatMap(r => r.members);
  assert.ok(rows.length >= 20 && rows.every(b => b.seen === 250), 'the G rows are seen to 250 m');
  life.dispose();
});

test('an answering lizard shrinks away as it runs into the trees, never vanishing whole', () => {
  const world = lifeWorld();
  const animals = createAnimals(world, route, { heightAt, library, critters: { smaedla: lizard } });
  const group = animals.groups.find(g => g.kind === 'lizards');
  world.clock.time = 100;
  group.answer();
  const sizes = [];
  for (let t = 100; t < 112; t += 1 / 30) {
    world.clock.time = t;
    animals.update(1 / 30, t);
    const m = group.members[0];
    sizes.push(m.visible ? m.grow ?? 1 : 0);
  }
  const lastShown = sizes.findLastIndex(s => s > 0);
  assert.ok(lastShown > 0 && lastShown < sizes.length - 1, 'it goes out of sight');
  assert.ok(sizes[lastShown] < 0.05, `shrunk to nothing as it goes (${sizes[lastShown].toFixed(3)})`);
  for (let i = 1; i <= lastShown + 1; i++) assert.ok(sizes[i - 1] - sizes[i] < 0.12, `no jump at frame ${i}`);
  animals.dispose();
});

// ---- the gorge's flyers ------------------------------------------------------------------------------

test('no gorge flyer stands in the rock: each perches on a ledge rock about a metre out from the wall', () => {
  const world = lifeWorld();
  const life = createLife(world, route, { heightAt, library, critters: { flugdyr: flyer } });
  const drawn = (x, z) => groundDrawnAt(heightAt, x, z);
  const geometry = flyer.lods[0].geometry;
  const rest = geometry.getAttribute('position');
  const frames = geometry.morphAttributes.position;
  const names = frames.map(a => a.name);
  const up = new THREE.Vector3(0, 1, 0);
  const ray = new THREE.Raycaster();
  assert.equal(life.ledges.length, NESTS.length, 'a ledge under every nest');
  for (const b of life.flyers) {
    world.flightTime = b.trigger - 1.5; // perched
    life.update(1 / 30, 10);
    const ledge = life.ledges.find(l => l.flyer === b);
    assert.ok(ledge, `${b.id} has its ledge`);
    const [wx, , wz] = NESTS[ledge.nest];
    const out = Math.hypot(b.position.x - wx, b.position.z - wz);
    assert.ok(out > 0.8 && out < 1.3, `${b.id}: ${out.toFixed(2)} m out from the wall`);
    // the ledge: one of the game's rocks, its top just under the feet
    const { prop } = ledge;
    assert.equal(prop.name, 'rock');
    const model = library.get('rock', prop.variant, 1, prop.shape ?? {});
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(model.solid.pos, 3));
    g.setIndex(Array.from(model.solid.idx));
    const rock = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    rock.position.set(prop.x, prop.y - (model.sink ?? 0) * prop.scale, prop.z);
    rock.rotation.y = -prop.rot;
    rock.scale.setScalar(prop.scale);
    rock.updateMatrixWorld(true);
    ray.set(new THREE.Vector3(b.position.x, b.position.y + 5, b.position.z), new THREE.Vector3(0, -1, 0));
    const top = ray.intersectObject(rock)[0]?.point.y;
    assert.ok(top !== undefined && b.position.y - top > -0.005 && b.position.y - top < 0.06, `${b.id}: its feet on the rock (${top === undefined ? 'no rock' : (b.position.y - top).toFixed(3)})`);
    // the flyer as the crowd draws it: no more than 2 % of it in the wall or in the rock
    const m = new THREE.Matrix4().compose(b.position, new THREE.Quaternion().setFromAxisAngle(up, -b.heading * DEG), new THREE.Vector3().setScalar(b.scale));
    m.multiply(new THREE.Matrix4().makeTranslation(0, flyer.pivot ?? 0, 0));
    let inWall = 0, inRock = 0;
    for (let i = 0; i < rest.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(rest, i);
      for (const [name, w] of Object.entries(b.morphs)) {
        const f = frames[names.indexOf(name)];
        if (w && f) v.add(new THREE.Vector3(f.getX(i), f.getY(i), f.getZ(i)).multiplyScalar(w));
      }
      v.applyMatrix4(m);
      if (v.y < drawn(v.x, v.z) - 0.005) inWall++;
      ray.set(v, up);
      if (ray.intersectObject(rock).length % 2 === 1) inRock++;
    }
    assert.ok(inWall / rest.count <= 0.02, `${b.id}: ${(100 * inWall / rest.count).toFixed(1)} % in the wall`);
    assert.ok(inRock / rest.count <= 0.02, `${b.id}: ${(100 * inRock / rest.count).toFixed(1)} % in its rock`);
  }
  life.dispose();
});
