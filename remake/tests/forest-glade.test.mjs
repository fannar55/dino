import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { planForest } from '../world/forest/plan.js';
import { createTerrain } from '../world/forest/terrain.js';
import { createSpeciesLibrary } from '../world/forest/species.js';
import { createAtmosphere } from '../world/forest/atmosphere.js';
import { createForest } from '../world/forest/forest.js';
import { FOREST } from '../world/forest/config.js';
import { PRESETS } from '../engine/quality.js';
import { pickLook } from '../engine/looks.js';
import { sunDirection } from '../engine/lighting.js';
import { createWind } from '../engine/wind.js';
import { chapter as grunnur } from '../chapters/grunnur.js';

// A fern glade is a forest layout with `glade: { ferns, shafts }` (both optional): more ferns round the
// rim of the clearing, light shafts that land inside it, and leaf shadows drifting over its floor.
// Chapter 1's burknalaut will be one; this layout stands in for it (radius 9 m, the forest edge 5 m beyond).
const GLADE = {
  seed: 23,
  clearing: { center: [0, 0], radius: 9 },
  forestEdge: 14,
  path: [[-48, 14], [-30, 9], [-16, 4], [-6, 1], [3, 0]],
  actors: {
    kambedla: { position: [-3.4, 0, -5.2], heading: 40 },
    mosi: { position: [3.8, 0, 1.6], heading: 200 },
    egill: { position: [1.4, 0, 3.4], heading: 250 },
  },
};
const withGlade = (options, base = GLADE) => ({ ...base, glade: options });

const libraries = new Map(); // a species library builds its models on first use: share it per seed
const libraryOf = seed => { if (!libraries.has(seed)) libraries.set(seed, createSpeciesLibrary(seed)); return libraries.get(seed); };

/** The planner's output for a layout. `chapter` is what world.chapter holds (the actors, the shots). */
function plan(layout, { chapter = { look: 'morning' }, q = PRESETS.tablet } = {}) {
  const world = { chapter };
  return planForest({ world, layout, seed: layout.seed, terrain: createTerrain(world, layout, layout.seed), library: libraryOf(layout.seed), q });
}
const ringFerns = result => result.placements.filter(p => p.name === 'fern' && p.band === 'clearing');

const sha = parts => {
  const hash = crypto.createHash('sha1');
  for (const part of parts) hash.update(typeof part === 'string' ? part : Buffer.from(part.buffer, part.byteOffset, part.byteLength));
  return hash.digest('hex').slice(0, 16);
};
const mm = v => Math.round(v * 1000);
/** Every placement, to the millimetre, as one number. */
const planPrint = result => sha(result.placements.map(p => [p.name, p.variant, p.lod, mm(p.x), mm(p.z), mm(p.rot), mm(p.scale), p.band].join(',') + '\n'));

// ---- the ferns ---------------------------------------------------------------------------------

// The shots a glade might have: coming in along the path, across the clearing, and a close one framed on Kambedla.
const SHOTS = {
  arrive: { position: [-8.5, 1.3, 5.5], target: [1, 1.6, -0.5], fov: 50 },
  across: { position: [7.4, 1.4, -5.6], target: [-4, 1.8, 3], fov: 50 },
  into: { position: [4.5, 1.2, -3.5], target: [-6, 3.4, 5], fov: 55 },
  close: { position: [-0.5, 1.3, -1.5], frame: { subject: { actor: 'kambedla' }, screen: [0.4, 0.4] }, fov: 46 },
};
const around = (result, layout = GLADE) => result.placements.filter(p => p.name === 'fern' && Math.hypot(p.x - layout.clearing.center[0], p.z - layout.clearing.center[1]) < layout.forestEdge + 6);
const mean = list => list.reduce((sum, v) => sum + v, 0) / list.length;

test('glade.ferns multiplies the ferns round the clearing: more in the clearing band, and lusher', () => {
  const count = options => ringFerns(options ? plan(withGlade(options)) : plan(GLADE)).length;
  const bare = count({ ferns: 0 });
  const plain = count();
  const thick = count({ ferns: 3 });
  assert.ok(plain > bare, 'the check can fail: the plain glade has ferns in the clearing band');
  assert.equal(count({ ferns: 1 }), plain, 'ferns: 1 is the forest as it is');
  assert.ok(thick > plain, `${thick} clearing-band ferns with glade.ferns 3, ${plain} without`);
  assert.ok(thick >= 2 * plain, `3 times the ferns asked for, ${thick} placed against ${plain}`);

  // all the ferns round the clearing, the forest edge's too, and each fern bigger
  const ordinary = plan(GLADE), lush = plan(withGlade({ ferns: 3 }));
  assert.ok(around(lush).length >= 2.5 * around(ordinary).length, `${around(lush).length} ferns round the clearing, ${around(ordinary).length} without`);
  assert.ok(mean(around(lush).map(p => p.scale)) >= 1.3 * mean(around(ordinary).map(p => p.scale)), 'the ferns of a lush rim are bigger');
  // and they push the grass aside, which an ordinary forest's ferns do not: the clearing band's, and those round it
  for (const [where, ferns] of [['in the clearing band', ringFerns], ['round the clearing', around]]) {
    const bedded = result => ferns(result).filter(p => p.blocksGrass).length / ferns(result).length;
    assert.ok(bedded(lush) >= 0.8, `${Math.round(bedded(lush) * 100)} % of a lush rim's ferns ${where} clear the grass round them`);
    assert.equal(bedded(ordinary), 0);
  }
});

test('with the shots of a glade in place the rim still grows its ferns, behind the characters too', () => {
  // foliage may not stand behind a character in a close shot (the frill stands against dark trunks or sky), and with a few
  // shots that is most of the rim: a lush rim's ferns are low and are let stand there, but never in front of a character
  const withShots = options => plan({ ...GLADE, shots: SHOTS, glade: options });
  const ordinary = withShots({ ferns: 1 }), lush = withShots({ ferns: 3 });
  assert.ok(around(lush).length >= 2 * around(ordinary).length, `${around(lush).length} ferns round the clearing with glade.ferns 3, ${around(ordinary).length} with 1`);
  assert.ok(ringFerns(lush).length >= 3 * ringFerns(ordinary).length, `${ringFerns(lush).length} in the clearing band, ${ringFerns(ordinary).length} with 1`);
  // the shots keep their view: the planner still keeps a fern off the camera and out of the middle of the picture
  for (const shot of lush.shots) {
    for (const f of around(lush)) assert.ok(Math.hypot(f.x - shot.pos.x, f.z - shot.pos.z) >= FOREST.shots.clearance, `a fern within ${FOREST.shots.clearance} m of the camera of ${shot.name}`);
  }
});

test('the ferns of a glade keep to the rim, off the path and away from the actors', () => {
  const result = plan(withGlade({ ferns: 3 }));
  const [cx, cz] = GLADE.clearing.center;
  const terrain = createTerrain({}, GLADE, GLADE.seed);
  const ferns = ringFerns(result);
  assert.ok(ferns.length > 10);
  for (const f of ferns) {
    const r = Math.hypot(f.x - cx, f.z - cz);
    assert.ok(r >= GLADE.clearing.radius - 0.5 && r <= GLADE.forestEdge, `a fern ${r.toFixed(1)} m from the centre is not on the rim`);
    assert.ok(terrain.path.query(f.x, f.z).d >= FOREST.path.plantClear, 'a fern on the path');
    for (const a of Object.values(GLADE.actors)) {
      assert.ok(Math.hypot(f.x - a.position[0], f.z - a.position[2]) >= 3.2, 'a fern where an actor stands');
    }
  }
  // the open middle, where the actors stand and the child looks, has none
  assert.equal(result.placements.filter(p => p.name === 'fern' && Math.hypot(p.x - cx, p.z - cz) < GLADE.clearing.radius - 0.5).length, 0);
});

// ---- grunnur is as it was --------------------------------------------------------------------

// What the planner placed for grunnur's layout before the glade options (commit 5e3313b): the counts forest-stats prints,
// and every placement to the millimetre. If you change the planner for grunnur on purpose, run this and paste the new numbers.
const GRUNNUR_PLAN = {
  counts: { log: 1, broadleaf: 141, araucaria: 44, treeFern: 43, rockSmall: 9, rock: 6, bush: 78, cycad: 8, fern: 129, horsetail: 9, mushrooms: 12, flowers: 43 },
  rejected: { path: 244, shot: 1765, sun: 1, space: 790, actor: 19 },
  print: '61e8765e2b45e521',
};

test('without glade, grunnur\'s plan is what it was', () => {
  const world = { chapter: grunnur };
  const layout = grunnur.layout;
  const result = planForest({ world, layout, seed: layout.seed, terrain: createTerrain(world, layout, layout.seed), library: libraryOf(layout.seed), q: PRESETS.tablet });
  assert.deepEqual(result.stats.counts, GRUNNUR_PLAN.counts);
  assert.deepEqual(result.stats.rejected, GRUNNUR_PLAN.rejected);
  assert.equal(planPrint(result), GRUNNUR_PLAN.print);
});

test('the defaults of glade change nothing: ferns 1 and shafts 0 are no glade', () => {
  for (const shots of [undefined, SHOTS]) {
    const print = options => planPrint(plan(options ? { ...GLADE, shots, glade: options } : { ...GLADE, shots }));
    const plain = print();
    assert.equal(print({ ferns: 1, shafts: 0 }), plain);
    assert.equal(print({}), plain);
    assert.notEqual(print({ ferns: 3 }), plain, 'the check can fail');
  }
});

// ---- the actors of a location ----------------------------------------------------------------

test('layout.actors stand in for the chapter\'s actors when the planner protects them', () => {
  const open = plan({ ...GLADE, actors: undefined }, { chapter: { look: 'morning', actors: {} } });
  // a spot where something grows when nobody stands there: a bush at the forest's edge
  const spot = open.placements.find(p => p.name === 'bush' && Math.hypot(p.x, p.z) < 20);
  assert.ok(spot, 'the glade has a bush at the edge');
  const near = (result, p, d) => result.placements.filter(q => Math.hypot(q.x - p.x, q.z - p.z) < d).length;
  assert.ok(near(open, spot, 2) > 0, 'the check can fail: without anyone there it grows');

  const standing = position => ({ mosi: { position, heading: 0 } });
  const here = [spot.x, 0, spot.z], far = [90, 0, 90];
  // an actor in the layout is protected, the chapter's own actors elsewhere are not asked about
  const byLayout = plan({ ...GLADE, actors: standing(here) }, { chapter: { look: 'morning', actors: standing(far) } });
  assert.equal(near(byLayout, spot, 2), 0, 'nothing grows within 2 m of an actor the layout names');
  // the same actor named by the chapter alone protects the same spot, as before
  const byChapter = plan({ ...GLADE, actors: undefined }, { chapter: { look: 'morning', actors: standing(here) } });
  assert.equal(planPrint(byChapter), planPrint(byLayout), 'the layout\'s actors do what the chapter\'s do');
  // and the chapter's actors do not count where the layout has its own
  const layoutWins = plan({ ...GLADE, actors: standing(far) }, { chapter: { look: 'morning', actors: standing(here) } });
  assert.ok(near(layoutWins, spot, 2) > 0, 'the chapter\'s actor at the spot is not protected: the layout\'s are the ones that stand in this place');
  assert.equal(planPrint(layoutWins), planPrint(open), 'an actor far from the forest changes nothing');
});

test('layout.actors place the shots that are set from an actor', () => {
  const shots = { near: { position: { actor: 'kambedla', offset: [6, 1.4, 5] }, target: { actor: 'kambedla', offset: [0, 0, 0] }, fov: 40 } };
  const chapter = { look: 'morning', actors: { mosi: { position: [30, 0, -30], heading: 0 } } };
  const result = plan({ ...GLADE, shots }, { chapter });
  const cameras = result.shots.filter(s => s.name === 'near').map(s => [s.pos.x, s.pos.z].map(v => Math.round(v * 10) / 10).join(','));
  const expected = Object.values(GLADE.actors).map(a => [a.position[0] + 6, a.position[2] + 5].map(v => Math.round(v * 10) / 10).join(','));
  assert.deepEqual(cameras.sort(), expected.sort(), 'the shot is set from the actors the layout names');
});

// ---- the light shafts ------------------------------------------------------------------------

const SUN = sunDirection(pickLook('morning'));

/** The atmosphere of a layout, built the way forest.js builds it, with a fake wind. */
function airOf(layout, q = PRESETS.tablet) {
  const world = { renderer: { getDrawingBufferSize: v => v.set(1280, 800) } };
  const shared = { uWindTime: { value: 0 }, uWindDirection: { value: new THREE.Vector2(0.8, 0.6).normalize() } };
  return createAtmosphere(world, { layout, seed: layout.seed, terrain: createTerrain(world, layout, layout.seed), shared, sun: SUN, q });
}
const attr = (mesh, name) => mesh.geometry.getAttribute(name).array;
/** Each shaft's ground point, top and width, read from the mesh the way the shader does. */
function shaftsOf(air) {
  const mesh = air.group.getObjectByName('Light shafts');
  const ends = attr(mesh, 'aEnd'), starts = attr(mesh, 'aStart'), shaft = attr(mesh, 'aShaft');
  return Array.from({ length: mesh.geometry.index.count / 6 }, (_, k) => ({
    ground: [...ends.slice(k * 12, k * 12 + 3)], top: [...starts.slice(k * 12, k * 12 + 3)], width: shaft[k * 16 + 2],
  }));
}
const motesOf = air => {
  const mesh = air.group.getObjectByName('Motes');
  const at = attr(mesh, 'position');
  return Array.from({ length: at.length / 3 }, (_, i) => [at[i * 3], at[i * 3 + 1], at[i * 3 + 2]]);
};
const inClearing = (p, layout = GLADE) => Math.hypot(p[0] - layout.clearing.center[0], p[2] - layout.clearing.center[1]) < layout.clearing.radius;

test('a glade of { ferns: 3, shafts: 4 }: four shafts land in the clearing, and more ferns grow in its band than without', () => {
  const layout = withGlade({ ferns: 3, shafts: 4 });
  const landing = shaftsOf(airOf(layout)).filter(s => inClearing(s.ground));
  assert.ok(landing.length >= 4, `${landing.length} light shafts land inside the clearing`);
  assert.ok(ringFerns(plan(layout)).length > ringFerns(plan(GLADE)).length, 'no more ferns in the clearing band than without glade');
});

test('glade.shafts: that many light shafts land inside the clearing, slanting in along the sun', () => {
  const forestShafts = shaftsOf(airOf(GLADE)).length;
  for (const q of [PRESETS.tablet, PRESETS.low]) {
    const all = shaftsOf(airOf(withGlade({ shafts: 4 }), q));
    const own = shaftsOf(airOf(GLADE, q)).length; // the forest's own shafts, which depend on the quality
    assert.equal(all.length, own + 4, `${q.name}: four more shafts than the forest has`);
    const landing = all.filter(s => inClearing(s.ground));
    assert.ok(landing.length >= 4, `${q.name}: ${landing.length} shafts land in the clearing`);
    for (const s of landing) {
      const axis = new THREE.Vector3(...s.top).sub(new THREE.Vector3(...s.ground));
      assert.ok(axis.y > 8, `a shaft rising only ${axis.y.toFixed(1)} m`);
      assert.ok(axis.normalize().dot(SUN) > 0.999, 'a shaft that does not run along the sun');
      assert.ok(s.width >= 1.5, 'a shaft too thin to see');
    }
    // they are spread over the clearing, not stacked in one place
    const ground = landing.map(s => new THREE.Vector3(...s.ground));
    for (let i = 0; i < ground.length; i++) for (let j = i + 1; j < ground.length; j++) {
      assert.ok(ground[i].distanceTo(ground[j]) > 1.5, 'two shafts land within 1.5 m of each other');
    }
  }
  assert.ok(forestShafts > 0 && shaftsOf(airOf(GLADE)).every(s => !inClearing(s.ground)), 'the check can fail: the forest\'s own shafts land in the shade, outside the clearing');
});

test('glade shafts are drawn with the forest\'s, the forest\'s own shafts stay as they were', () => {
  const plain = airOf(GLADE);
  const glade = airOf(withGlade({ shafts: 4 }));
  assert.equal(glade.group.children.length, plain.group.children.length, 'no new draw call');
  const a = shaftsOf(plain), b = shaftsOf(glade);
  assert.equal(b.length, a.length + 4);
  assert.deepEqual(b.slice(0, a.length), a);
});

test('glittering motes float in the glade\'s shafts', () => {
  const plain = motesOf(airOf(GLADE));
  const glade = airOf(withGlade({ shafts: 4 }));
  const motes = motesOf(glade);
  assert.ok(motes.length >= plain.length + 4 * 6, `${motes.length - plain.length} motes more than the forest has`);
  assert.deepEqual(motes.slice(0, plain.length), plain, 'the forest\'s own motes stay where they were');
  const shafts = shaftsOf(glade).filter(s => inClearing(s.ground));
  const line = new THREE.Line3(), p = new THREE.Vector3(), closest = new THREE.Vector3();
  const inShafts = motes.slice(plain.length).filter(m => shafts.some(s => {
    line.set(new THREE.Vector3(...s.ground), new THREE.Vector3(...s.top));
    line.closestPointToPoint(p.set(...m), true, closest);
    return closest.distanceTo(p) <= s.width / 2;
  }));
  assert.equal(inShafts.length, motes.length - plain.length, 'every glade mote floats inside a shaft');
  assert.ok(motes.slice(plain.length).every(m => m[1] > 0), 'above the ground');
});

// What the forest's shafts and motes were for grunnur's layout before the glade options (commit 5e3313b).
const GRUNNUR_AIR = { shafts: '72e265a09eeb820c', motes: 'e538b2282f48ca15' };
const airPrint = air => {
  const shafts = air.group.getObjectByName('Light shafts'), motes = air.group.getObjectByName('Motes');
  return {
    shafts: sha([...['position', 'aStart', 'aEnd', 'aShaft'].map(n => attr(shafts, n)), shafts.geometry.index.array]),
    motes: sha(['position', 'aMote'].map(n => attr(motes, n))),
  };
};

test('without glade, grunnur\'s shafts and motes are what they were', () => {
  assert.deepEqual(airPrint(airOf(grunnur.layout)), GRUNNUR_AIR);
  assert.deepEqual(airPrint(airOf({ ...grunnur.layout, glade: { ferns: 1, shafts: 0 } })), GRUNNUR_AIR, 'the defaults of glade are no glade');
});

// ---- the leaf shadows ------------------------------------------------------------------------

/** A forest built in node, the way tools/world/forest-stats.mjs builds one. */
async function forestOf(layout) {
  const look = pickLook('morning');
  const world = {
    THREE, renderer: { getDrawingBufferSize: v => v.set(1280, 800) }, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(40, 1.6, 0.1, 1200),
    q: PRESETS.low, params: new URLSearchParams(''), look, lighting: { direction: sunDirection(look), sun: null, focusRadius: 10 },
    wind: createWind(), chapter: { look: 'morning', actors: {} }, heightAt: () => 0, actors: new Map(),
  };
  return { world, forest: await createForest(world, layout) };
}
/** What three hands the shader of a patched material: its uniforms and its fragment source. */
function compiled(material) {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderChunk.meshlambert_vert, fragmentShader: THREE.ShaderChunk.meshlambert_frag };
  material.onBeforeCompile(shader);
  return shader;
}
const floorOf = forest => ({
  ground: compiled(forest.group.getObjectByName('Forest ground').material),
  grass: compiled(forest.group.getObjectByName('Grass').children[0].material),
});

test('a glade\'s floor takes leaf shadows that drift with the wind clock; other forests do not', async () => {
  const { world, forest } = await forestOf(withGlade({ ferns: 3, shafts: 4 }));
  const { ground, grass } = floorOf(forest);
  for (const [name, shader] of Object.entries({ ground, grass })) {
    assert.ok(shader.uniforms.uLeafShadow.value > 0, `the ${name} has no leaf shadows in a glade`);
    assert.equal(shader.uniforms.uWindTime, world.wind.uniforms.uWindTime, `the ${name} reads the game's wind clock`);
    assert.equal(shader.uniforms.uWindDirection, world.wind.uniforms.uWindDirection, `the ${name} drifts the way the wind blows`);
    const body = shader.fragmentShader.match(/float forestLeafShadow\([^)]*\)\s*\{[\s\S]*?\n\}/);
    assert.ok(body, `the ${name}'s fragment shader has no forestLeafShadow function`);
    // and the sunlight of the floor takes it in, except round a character (forestActorNear is how near a point is to one)
    assert.match(shader.fragmentShader, /gSun \*= 1\.0 - uLeafShadow \* forestLeafShadow\([^;]*\( 1\.0 - (actorNear|gNear) \);/, `the ${name} does not take the leaf shadows into its sunlight, or does not spare the ground round a character`);
    assert.match(body[0], /uWindTime/, 'the leaf shadows do not move with the clock');
    assert.match(body[0], /uWindDirection/, 'the leaf shadows do not follow the wind');
  }
  forest.dispose();

  const plain = await forestOf(GLADE);
  const floor = floorOf(plain.forest);
  assert.equal(floor.ground.uniforms.uLeafShadow.value, 0, 'no leaf shadows without a glade');
  assert.equal(floor.grass.uniforms.uLeafShadow.value, 0);
  plain.forest.dispose();
});

test('the leaf shadows move slowly, but not so slowly the eye misses it', () => {
  const { speed } = FOREST.glade.leafShadow; // metres a second
  const dapple = Math.hypot(0.003, 0.002) / 0.16; // what the dapple of the shaded forest drifts at
  assert.ok(speed >= 3 * dapple, `${speed} m/s: hardly faster than the dapple (${dapple.toFixed(3)} m/s), which nobody sees move`);
  assert.ok(speed <= 0.15, `${speed} m/s is not slow`);
});

// ---- measuring a location ----------------------------------------------------------------------

test('forest-stats --location names the places a chapter has, and refuses one it does not', () => {
  const tool = new URL('../tools/world/forest-stats.mjs', import.meta.url);
  const run = (...args) => spawnSync(process.execPath, [fileURLToPath(tool), ...args], { encoding: 'utf8' });
  const result = run('--chapter', 'grunnur', '--location', 'nowhere');
  assert.notEqual(result.status, 0, 'a location grunnur does not have must stop the tool');
  assert.match(result.stderr, /nowhere/);
  assert.match(result.stderr, /grunnur/);
});
