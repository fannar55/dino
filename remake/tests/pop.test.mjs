// Nothing appears or vanishes whole in front of the child (the owner's word of 2026-11-21: "Mjög mikið um pop in og pop out á trjám,
// plöntum og dýrum ... og fuglar á bergi í gilinu við foss sitja inní klett"). A small plant grows out of the ground and shrinks back
// into it at the edge of its distance; a critter shrinks away and grows in; a crown on screen keeps its shape at the frame's edge; a
// far plant at the frame's edge is drawn while the camera turns slowly; a far tree fades into its card over a band, never swapped in
// one frame; and the gorge's flyers stand on rock ledges, out of the wall.
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
import * as batch from '../world/forest/batch.js';
import { createCardAtlas, createCardMaterial } from '../world/forest/cards.js';
import { createForest } from '../world/forest/forest.js';
import { createSharedUniforms, createVegetationMaterial, createNoiseTexture, createLeafTexture } from '../world/forest/materials.js';
import { ACTOR_GLSL } from '../world/forest/terrain.js';
import { FOREST } from '../world/forest/config.js';
import { chapter as kafli2 } from '../chapters/kafli2.js';
import * as kafli4 from '../chapters/kafli4.js';
import { createArdalur } from '../world/ardalur/index.js';
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

test('a crown on screen keeps its fine shape when nearer crowns stand just off screen (they never take its turn)', () => {
  // one tree, to know where its crown and its pieces are from its foot (the same tree, turned the same, anywhere)
  const proto = placement('broadleaf', { lod: 0, x: 0, z: 0, y: 0, scale: 1.2 });
  proto.models = [0, 1, 2].map(level => ({ level, model: library.get('broadleaf', 0, level) }));
  const ranges0 = bake(proto).flatMap(m => m.userData.cull.ranges);
  const crown0 = ranges0.find(r => r.crown).crown;
  const eye = new THREE.Vector3(0, crown0.centre.y, 0);
  const camera = cameraAt(eye, new THREE.Vector3(-1, crown0.centre.y, 0));
  const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const at = (d, yaw) => new THREE.Vector3(-d * Math.cos(yaw * DEG), 0, d * Math.sin(yaw * DEG));
  const sphereAt = (s, p) => new THREE.Sphere(s.center.clone().add(p), s.radius);
  // where a tree `d` m off stands with all of it just off screen while its crown's round sphere still reaches into the frame
  const offAt = (d, side) => {
    for (let yaw = 20; yaw < 80; yaw += 0.25) {
      const p = at(d, side * yaw);
      if (ranges0.some(r => frustum.intersectsSphere(sphereAt(r.sphere, p)))) continue;
      if (frustum.intersectsSphere(new THREE.Sphere(crown0.centre.clone().add(p), crown0.reach + 1.5))) return p;
      return null;
    }
    return null;
  };
  const dA = crown0.size / 0.32; // on screen, fine by its size on screen (CROWN_T0 0.3)
  const tree = p => {
    const t = placement('broadleaf', { lod: 0, x: p.x, z: p.z, y: 0, scale: 1.2 });
    t.models = [0, 1, 2].map(level => ({ level, model: library.get('broadleaf', 0, level) }));
    return t;
  };
  const off = [offAt(dA * 0.8, 1), offAt(dA * 0.8, -1), offAt(dA * 0.7, 1)];
  assert.ok(off.every(Boolean), 'three nearer trees just off screen');
  const shown = tree(at(dA, 0));
  const meshes = bake(shown, ...off.map(tree));
  cullBatches(meshes, camera);
  const centre = crown0.centre.clone().add(at(dA, 0));
  const own = meshes.flatMap(m => m.userData.cull.kept).filter(r => r.crown && r.crown.centre.distanceTo(centre) < 1e-3);
  assert.ok(own.length > 0, 'its crown is drawn');
  assert.deepEqual([...new Set(own.map(r => r.lod))], [0], 'its crown fine, though three nearer crowns stand just off screen');
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

test('of the hanging moss and the forest\'s ground only what is in view is drawn, and all of that: no strand or ground triangle in the frame is left out', async () => {
  const world = { ...nodeWorld(), chapter: kafli4.chapter };
  const place = kafli4.chapter.locations.hvitatre;
  const forest = await createForest(world, { ...place.layout, shots: place.shots });
  const moss = forest.group.getObjectByName('Hanging moss'), ground = forest.group.getObjectByName('Forest ground');
  assert.ok(moss && ground, 'the white tree\'s forest has hanging moss and its ground');
  const camera = world.camera;
  let fewer = 0, views = 0;
  for (const [name, shot] of Object.entries(place.shots)) for (const turn of [0, 120, 240]) {
    // from each of the place's shots, as set and turned a third and two thirds round
    const eye = new THREE.Vector3(...shot.position), target = new THREE.Vector3(...shot.target).sub(eye).applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * DEG).add(eye);
    camera.fov = shot.fov ?? 50;
    camera.position.copy(eye);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    forest.update(1 / 30, 0);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const mesh of [moss, ground]) {
      const g = mesh.geometry, index = g.index, pos = g.getAttribute('position');
      const drawn = new Set();
      const count = Math.min(index.count, g.drawRange.count);
      for (let i = g.drawRange.start; i < g.drawRange.start + count; i += 3) drawn.add([index.getX(i), index.getX(i + 1), index.getX(i + 2)].join());
      const all = mesh.userData.cull?.master;
      assert.ok(all, `${mesh.name}: cut into pieces the forest culls (userData.cull)`);
      const p = new THREE.Vector3();
      const missing = [];
      for (let i = 0; i < all.length; i += 3) {
        const tri = [all[i], all[i + 1], all[i + 2]];
        if (!tri.some(v => frustum.containsPoint(p.fromBufferAttribute(pos, v)))) continue;
        if (!drawn.has(tri.join())) missing.push(i / 3);
      }
      assert.deepEqual(missing.slice(0, 5), [], `${name} turned ${turn}°: ${missing.length} triangles of the ${mesh.name.toLowerCase()} in the frame not drawn`);
      if (mesh.visible && drawn.size < all.length / 3 * 0.75) fewer++;
      views++;
    }
  }
  forest.dispose();
  assert.ok(fewer >= views * 0.75, `in ${fewer} of ${views} views a quarter or more of them is left out (behind or beside the camera)`);
});

// ---- far trees and their cards -----------------------------------------------------------------------

/** A broadleaf at its far level with a card (cards.js: placement.card), baked with a plain material, a fading one and the cards'. */
function cardedTree() {
  const tree = { ...placement('broadleaf', { lod: 2, x: 0, z: 0, y: 0, scale: 1.2 }), card: { uv: [0, 0, 0.12, 0.3], width: 11, height: 16, bottom: -0.2 } };
  const batcher = createBatcher();
  batcher.add(tree);
  const plain = new THREE.MeshBasicMaterial(), fading = new THREE.MeshBasicMaterial();
  const { meshes } = batcher.build(() => ({ material: plain, fadeMaterial: fading }), { cards: { material: new THREE.MeshBasicMaterial() } });
  const ref = new THREE.Vector3(tree.x, tree.y + tree.model.height * tree.scale * 0.5, tree.z); // its mid-height, as cardFrom counts
  return { tree, meshes, ref, plain, fading };
}

test('a far tree fades from its mesh to its card over a band round cardFrom: both drawn there, so it never swaps in one frame', () => {
  const { cardFadeAt, cardBand } = batch;
  assert.equal(typeof cardFadeAt, 'function', 'the card\'s share of a tree at a distance (batch.js cardFadeAt)');
  const cardFrom = FOREST.lod.cardFrom;
  const [from, to] = cardBand(cardFrom);
  assert.ok(from < cardFrom && to > cardFrom && to - from >= 0.1 * cardFrom, `the band (${from}-${to} m) is round ${cardFrom} m, a tenth of it wide or more`);
  assert.equal(cardFadeAt(from, cardFrom), 0, 'all mesh where the band begins');
  assert.equal(cardFadeAt(to, cardFrom), 1, 'all card where it ends');
  let last = 0;
  for (let d = from; d <= to + 1e-9; d += 0.5) {
    const f = cardFadeAt(d, cardFrom);
    assert.ok(f >= last && f - last < 0.06, `${d} m: ${f.toFixed(3)}, a little more card than half a metre nearer (${last.toFixed(3)})`);
    last = f;
  }
  const { meshes, ref, plain, fading } = cardedTree();
  const card = meshes.find(m => m.userData.cards);
  const own = meshes.filter(m => !m.userData.cards);
  const drawn = (list, material) => list.some(m => m.visible && m.geometry.drawRange.count > 0 && (!material || m.material === material));
  const at = d => {
    const camera = cameraAt(new THREE.Vector3(ref.x + d, ref.y, ref.z), ref, 50);
    cullBatches(meshes, camera, 1.5, null, cardFrom);
    return cardFadeAt(d, cardFrom);
  };
  // out through the band, back in through it, out again: every distance shows the share of each that the fade gives it
  const sweep = [0.8, 0.9, 0.95, 1, 1.03, 1.06, 1.12, 1.25, 1.12, 1.03, 0.97, 0.9, 0.8].map(k => k * cardFrom);
  for (const d of [...sweep, ...[0.93, 0.97, 1, 1.04, 1.08, 1.2].map(k => k * cardFrom)]) {
    const f = at(d);
    if (f < 1) assert.ok(drawn(own), `${d.toFixed(1)} m: ${(100 * (1 - f)).toFixed(0)} % of its mesh shows, and it is drawn`);
    if (f > 0) assert.ok(drawn([card]), `${d.toFixed(1)} m: ${(100 * f).toFixed(0)} % of its card shows, and it is drawn`);
    // in the band its mesh is drawn by the fading material (screen-door) and not by the plain one, which never leaves a pixel out
    if (f > 0 && f < 1) assert.ok(drawn(own, fading) && !drawn(own, plain), `${d.toFixed(1)} m: the mesh is drawn fading`);
    if (f === 0 && d < from * 0.95) assert.ok(!drawn([card]) && !drawn(own, fading), `${d.toFixed(1)} m: the mesh alone, whole`);
    if (f === 1 && d > to * 1.05) assert.ok(!drawn(own), `${d.toFixed(1)} m: the card alone`);
  }
  // one standing just past either end of the band is not drawn and dropped by turns (what was drawn stays a little past it)
  for (const [edge, list] of [[to, own], [from, [card]]]) {
    at(edge * (edge === to ? 0.995 : 1.005));
    for (const k of [1.005, 0.995, 1.005]) {
      at(edge * (edge === to ? k : 2 - k));
      assert.ok(drawn(list), `at ${(edge * (edge === to ? k : 2 - k)).toFixed(1)} m, by the band's ${edge === to ? 'far' : 'near'} end, it stays drawn`);
    }
  }
});

test('in the band a pixel shows the tree or its card, never neither: by MSAA coverage where the preset has it, else by one screen-door threshold', () => {
  const compiled = material => {
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    material.onBeforeCompile(shader, null);
    return shader;
  };
  const atlas = createCardAtlas(null, [{ name: 'broadleaf', variant: 0, model: library.get('broadleaf', 0, 2) }]);
  for (const q of [PRESETS.low, PRESETS.tablet]) {
    const world = { wind: createWind(), q };
    const valley = createPlantMaterials(world, { noise: createNoiseTexture(1), leaf: createLeafTexture(1) });
    assert.ok(valley.solidFade && valley.thinFade, 'the valley has fading plant materials');
    const cards = createCardMaterial(atlas, { fade: valley.cardFade, coverage: Boolean(q.antialias) }); // as the valley makes it (index.js)
    const mesh = compiled(valley.solidFade).fragmentShader, thin = compiled(valley.thinFade).fragmentShader, card = compiled(cards).fragmentShader;
    if (q.antialias) {
      // the tablet renders at one pixel a pixel, each two by two on his screen: a screen-door there is a grain he sees. With MSAA each
      // pixel's samples are shared out instead: over the band's first half its card comes in behind the whole mesh, over the second
      // the mesh goes out in front of the whole card, so in every pixel one of the two is always all there (no see-through middle)
      for (const [name, m] of [['solid', valley.solidFade], ['thin', valley.thinFade], ['card', cards]]) assert.ok(m.alphaToCoverage, `${q.name}: the ${name} fades by coverage`);
      for (const [name, f] of [['solid', mesh], ['thin', thin]]) {
        assert.ok(f.includes('diffuseColor.a = clamp( 2.0 * ( 1.0 - vCardFade ), 0.0, 1.0 );') && !f.includes('forestDither() <'), `${q.name}: the ${name} mesh covers 2(1 - share), clamped`);
      }
      assert.ok(card.includes('diffuseColor.a *= clamp( 2.0 * vCardFade, 0.0, 1.0 );') && !card.includes('forestDither() >='), `${q.name}: the card covers 2 share, clamped`);
    } else {
      // without MSAA a pixel is one sample: the mesh leaves out the pixels its card takes, by one threshold
      assert.ok(/if \( forestDither\(\) < vCardFade \) discard;/.test(mesh) && /if \( forestDither\(\) < vCardFade \) discard;/.test(thin), `${q.name}: the mesh leaves out the pixels the card takes`);
      assert.ok(/if \( forestDither\(\) >= vCardFade \) discard;/.test(card), `${q.name}: the card takes those and leaves the rest`);
      assert.ok(!valley.solidFade.alphaToCoverage && !cards.alphaToCoverage, `${q.name}: no coverage without samples to share`);
    }
    for (const [name, m] of [['solid', valley.solid], ['thin', valley.thin]]) {
      assert.ok(!compiled(m).fragmentShader.includes('discard') && !m.alphaToCoverage, `${q.name}: the plain ${name} plants never leave a pixel out (early depth testing)`);
    }
    assert.equal(compiled(valley.solidFade).uniforms.uCardFade, compiled(cards).uniforms.uCardFade, 'one band for both');
    valley.dispose();
    cards.dispose();
  }
  atlas.dispose();
});

test('a tree that is only ever its card (placement.cardOnly: a place\'s trees far past all its cameras) is its card near and far while in view, never its mesh, and sways as its tree\'s top', () => {
  // the same tree twice, at the same scale: one only ever a card, the other its mesh
  const pictured = { ...placement('swampConifer', { lod: 2, x: 0, z: 0, y: 0, scale: 1.2 }), card: { uv: [0, 0, 0.12, 0.3], width: 7, height: 18, bottom: -0.2 }, cardOnly: true };
  const meshed = placement('swampConifer', { lod: 2, x: 0, z: 30, y: 0, scale: 1.2 });
  const batcher = createBatcher();
  batcher.add(pictured);
  batcher.add(meshed);
  const { meshes } = batcher.build(() => ({ material: new THREE.MeshBasicMaterial() }), { cards: { material: new THREE.MeshBasicMaterial(), wind: true } });
  const card = meshes.find(m => m.userData.cards);
  const own = meshes.filter(m => !m.userData.cards);
  assert.ok(card, 'its card is baked into the card mesh');
  const of = (list, x, z) => list.flatMap(m => m.userData.cull.ranges).filter(r => Math.hypot(r.ref.x - x, r.ref.z - z) < 0.5);
  assert.equal(of(own, 0, 0).length, 0, 'none of its mesh is baked');
  assert.ok(of(own, 0, 30).length > 0 && of([card], 0, 30).length === 0, 'the other tree is its mesh, with no card');
  // drawn at every distance while in view, from inside the band round cardFrom's near end to far past it, and not when out of view
  const middle = new THREE.Vector3(0, 9, 0);
  for (const d of [12, 40, 80, 0.85 * FOREST.lod.cardFrom, 1.2 * FOREST.lod.cardFrom, 400]) {
    cullBatches(meshes, cameraAt(new THREE.Vector3(-d, 9, 0), middle), 1.5, null, FOREST.lod.cardFrom);
    assert.ok(card.visible && card.userData.cull.kept.length === 1, `${d.toFixed(0)} m off: its card is drawn`);
  }
  cullBatches(meshes, cameraAt(new THREE.Vector3(-40, 9, 0), new THREE.Vector3(-200, 9, 0)), 1.5, null, FOREST.lod.cardFrom);
  assert.ok(!card.visible, 'looking away from it: not drawn');
  // all there at any distance (aCard.x 0: no share of a band, cards.js), and its top sways as the tree's top does (its mesh's highest
  // sway weight, aWind.y as the batcher bakes it, with its phase), its foot not at all
  const aCard = card.geometry.getAttribute('aCard'), aWind = card.geometry.getAttribute('aWind'), aTree = card.geometry.getAttribute('aTree');
  assert.ok(aWind && aTree, 'the card mesh carries the wind\'s weights (built with `wind`)');
  const tree = own.find(m => of([m], 0, 30).length);
  const meshWind = tree.geometry.getAttribute('aWind');
  let top = 0, phase = -1;
  for (const r of of([tree], 0, 30)) for (let j = r.start; j < r.start + r.count; j++) {
    const v = tree.userData.cull.master[j];
    top = Math.max(top, meshWind.getY(v));
    phase = meshWind.getX(v);
  }
  assert.ok(top > 0.05, `the tree's top sways (${top.toFixed(3)})`);
  for (let v = 0; v < 4; v++) {
    const up = card.geometry.getAttribute('aCorner').getY(v);
    assert.equal(aCard.getX(v), 0, `corner ${v}: all there at any distance`);
    assert.ok(Math.abs(aWind.getY(v) - (up ? top : 0)) < 1.5 / 255, `corner ${v}: sways ${aWind.getY(v).toFixed(3)} (${up ? `its top's ${top.toFixed(3)}` : 'its foot: none'})`);
    assert.ok(Math.abs(aWind.getX(v) - phase) < 1.5 / 255, `corner ${v}: the tree's own phase`);
    assert.ok(aTree.getX(v) > 0.99 || !up, `corner ${v}: a tree's sway (the beat's tree wave)`);
  }
  // and the cards' material bends its top by the forest's own wind (materials.js forestWind), from the shared uniforms
  const shared = { uWindTime: { value: 0 }, uWindStrength: { value: 1 }, uWindDirection: { value: new THREE.Vector2(1, 0) }, uBeats: { value: -1 } };
  const atlas = createCardAtlas(null, [{ name: 'swampConifer', variant: 0, model: library.get('swampConifer', 0, 2) }]);
  const material = createCardMaterial(atlas, { wind: shared });
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  material.onBeforeCompile(shader, null);
  assert.match(shader.vertexShader.split('#include <begin_vertex>')[1], /transformed \+= forestWind\( cardFoot, aWind, aTree \);/, 'its top bends as the trees do');
  for (const key of Object.keys(shared)) assert.equal(shader.uniforms[key], shared[key], `the forest's own ${key}`);
  assert.match(material.customProgramCacheKey(), /wind/, 'its own program');
  const still = createCardMaterial(atlas);
  const plain = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  still.onBeforeCompile(plain, null);
  assert.doesNotMatch(plain.vertexShader, /forestWind/, 'the valley\'s cards (no `wind`) as they were');
  material.dispose(); still.dispose(); atlas.dispose();
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

// ---- the valley's far layer ----------------------------------------------------------------------------

/** The real valley in Node (no renderer), every section built, chapter 4's own trees in it as the chapter has them. */
function builtValley(lush) {
  const look = pickLook('earlyAfternoon');
  const world = {
    scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(50, 1.6, 0.1, 1200), q: PRESETS.tablet, look,
    lighting: { direction: sunDirection(look), focusRadius: 10 }, wind: createWind(), actors: new Map(), params: new URLSearchParams(''),
  };
  const place = createArdalur(world, { grey: false, route, lush, ...kafli4.whiteTreesFor(world) });
  place.buildAll();
  return { place, world };
}
const valleys = new Map();
const valleyOf = lush => {
  if (!valleys.has(lush)) valleys.set(lush, builtValley(lush));
  return valleys.get(lush);
};
/** Puts the valley's camera `up` m over her path at the flight's second `t`, looking `ahead` m on along it and down to it, and updates. */
function flyTo({ place, world }, t, up = 40, ahead = 120) {
  const u = route.progressAt(t);
  const her = route.pointAt(u, new THREE.Vector3());
  const on = route.pointAt(Math.min(1, u + ahead / route.length), new THREE.Vector3());
  world.flightU = u;
  world.flightTime = t;
  world.camera.position.set(her.x, her.y + up, her.z);
  world.camera.lookAt(on);
  world.camera.updateMatrixWorld(true);
  world.camera.updateProjectionMatrix();
  place.update(0, t);
  place.update(0, t); // a second frame: the far land sets how far the camera sees as it shows (far-land.js FAR_PLANE)
  return world.camera;
}
const sectionMeshes = part => {
  const out = [];
  part?.traverse(o => { if (o.userData?.cull?.ranges && o.userData.band !== 'ground' && !o.userData.twinOf) out.push(o); });
  return out;
};

test('from high up every tree of a section not drawn stands in the far layer as its card (one draw call), none of one drawn', () => {
  for (const lush of [true, false]) {
    const valley = valleyOf(lush);
    const { place } = valley;
    place.farLand.show(true); // as the flight has it: from the crest of E the far land stands under the sections not drawn
    // before it there is no land under them to stand on: the layer draws nothing
    flyTo(valley, 100, 40);
    const layer = place.farCards;
    assert.ok(layer?.isMesh, `${lush ? 'lush' : 'plain'}: the valley has a far layer of cards (place.farCards)`);
    assert.ok(!layer.visible, `${lush ? 'lush' : 'plain'}: at 100 s (no far land yet) the far layer is not drawn`);
    // G: 70 m up, a grove beyond the pond (section 6) was not drawn till it came within reach, then all at once (g319a/b)
    const camera = flyTo(valley, 152, 70, 250);
    // fogged and lit as the sections' cards are: their very material
    const sectionCards = sectionMeshes(place.stats.sections[0]).find(m => m.userData.cards);
    assert.equal(layer.material, sectionCards.material, `${lush ? 'lush' : 'plain'}: the far layer is drawn with the cards' material`);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const drawn = new Set((layer.visible ? layer.userData.cull.kept ?? [] : []).map(r => r.plant));
    let hidden = 0;
    place.stats.sections.forEach((part, i) => {
      if (!part) return;
      const shown = place.sections.list[i].visible;
      for (const mesh of sectionMeshes(part)) {
        for (const r of mesh.userData.cull.ranges) {
          if (!r.card) continue;
          if (shown) assert.ok(!drawn.has(r.plant), `${lush ? 'lush' : 'plain'}: section ${i} is drawn: its ${r.name} is not in the far layer too`);
          else if (frustum.intersectsSphere(r.sphere)) {
            hidden++;
            assert.ok(drawn.has(r.plant), `${lush ? 'lush' : 'plain'}: section ${i} is not drawn: its ${r.name} ${r.ref.distanceTo(camera.position).toFixed(0)} m off is in the far layer`);
          }
        }
      }
    });
    assert.ok(hidden > 50, `${lush ? 'lush' : 'plain'}: the shot sees many trees of sections not drawn (${hidden})`);
    // its budget: one mesh (a draw call), at most 25k triangles with every card of the valley in it
    assert.ok(layer.userData.triangles <= 25000, `${lush ? 'lush' : 'plain'}: the far layer has ${layer.userData.triangles} triangles`);
  }
});

test('a section is drawn before any of its trees is near enough to be a mesh, and before its other plants have grown from nothing', () => {
  const { cardReach, growAt } = batch;
  assert.equal(typeof cardReach, 'function', 'the distance past which a tree with a card is never its mesh (batch.js cardReach)');
  for (const lush of [true, false]) {
    const valley = valleyOf(lush);
    const { place } = valley;
    const reach = cardReach(place.cardFrom);
    // what a section has that is not a card: a tree with one (a mesh only nearer than reach), or a plant that grows in by its cut
    place.stats.sections.forEach((part, i) => {
      for (const mesh of sectionMeshes(part)) {
        for (const r of mesh.userData.cull.ranges) {
          if (r.card || r.carded || mesh.userData.belt) continue;
          assert.ok(r.cull < Infinity && r.foot, `${lush ? 'lush' : 'plain'}: section ${i}'s ${r.name} has no card: it grows in by its cut (${r.cull})`);
        }
      }
    });
    // along the flight, low and high: what a section not drawn has is a card, or nothing
    for (let t = 2; t < BEATS.END; t += 6) {
      for (const up of [12, 70]) {
        const camera = flyTo(valley, t, up);
        place.stats.sections.forEach((part, i) => {
          if (!part || place.sections.list[i].visible) return;
          for (const mesh of sectionMeshes(part)) {
            for (const r of mesh.userData.cull.ranges) {
              if (r.card || mesh.userData.belt) continue;
              if (r.carded) assert.ok(r.ref.distanceTo(camera.position) >= reach, `${lush ? 'lush' : 'plain'} ${t} s ${up} m up: section ${i} not drawn, its ${r.name} ${r.ref.distanceTo(camera.position).toFixed(0)} m off is past ${reach.toFixed(0)} m (a card)`);
              else assert.equal(growAt(r.foot.distanceTo(camera.position), r.cull), 0, `${lush ? 'lush' : 'plain'} ${t} s ${up} m up: section ${i} not drawn, its ${r.name} ${r.foot.distanceTo(camera.position).toFixed(0)} m off is nothing yet`);
            }
          }
        });
      }
    }
  }
});

test('a card, the sections\' ground and the far land at one point past 250 m take the same haze, while the far land shows', async () => {
  const farLandJs = await import('../world/ardalur/far-land.js');
  assert.equal(typeof farLandJs.farHazeAt, 'function', 'how much of the far land\'s haze a thing so far off takes (far-land.js farHazeAt)');
  assert.ok(farLandJs.farHazeAt(250) === 0 && farLandJs.farHazeAt(400) > 0.05 && farLandJs.farHazeAt(1500) < 0.8, 'none to 250 m, more with distance, never all');
  const { place } = valleyOf(true);
  place.farLand.show(true);
  // each material as three compiles it: the Lambert's own shaders through its onBeforeCompile
  const compiled = material => {
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
    material.onBeforeCompile(shader, null);
    return shader;
  };
  // what each does after the fog: the far land's haze, as one block of lines
  const afterFog = shader => shader.fragmentShader.split('#include <fog_fragment>')[1].split('#endif')[0];
  const farLand = place.farLand.group.getObjectByName('Far land').material;
  const sectionCards = sectionMeshes(place.stats.sections[0]).find(m => m.userData.cards).material;
  const sectionGround = place.materials.ground;
  const far = compiled(farLand);
  assert.match(afterFog(far), /mix\(/, 'the far land fades into its haze after the fog');
  for (const [name, material] of [['the cards (the far layer\'s and the sections\')', sectionCards], ['the sections\' ground', sectionGround]]) {
    const shader = compiled(material);
    assert.equal(afterFog(shader).trim(), afterFog(far).trim(), `${name}: the far land's haze after the fog, line for line`);
    for (const [key, uniform] of Object.entries(far.uniforms)) {
      if (afterFog(far).includes(key)) assert.equal(shader.uniforms[key], uniform, `${name}: the far land's own ${key} (one colour, one switch)`);
    }
    assert.match(material.customProgramCacheKey(), /haze/, `${name}: its program is not the one without the haze (its own key)`);
  }
  // the look's fog is height fog (thick low down): far off, a card is fogged as the ground at its foot, not as its crown 20 m up,
  // which stood out bright over the misty land and its own faded trunk; from 250 m, all of it from 400 m, while the far land shows
  const cardVertex = compiled(sectionCards).vertexShader.split('#include <fog_vertex>')[1];
  assert.match(cardVertex, /vFogWorld\.y = mix\( vFogWorld\.y, cardFoot\.y, uFarHaze\.w \* smoothstep\( 250\.0, 400\.0, cardAway \) \)/, 'a far card is fogged as at its foot');
  assert.doesNotMatch(compiled(sectionGround).vertexShader, /cardFoot/, 'the ground is fogged where it is');
  // the haze is on while the far land shows and off where it does not, so what is not over the far land looks as it did
  const haze = Object.entries(far.uniforms).find(([key]) => afterFog(far).includes(key))[1];
  flyTo(valleyOf(true), 152, 70, 250);
  assert.equal(haze.value.w, 1, 'at 152 s (the far land shows) the haze is on');
  flyTo(valleyOf(true), 100, 40);
  assert.equal(haze.value.w, 0, 'at 100 s (no far land yet) the haze is off');
});
