import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as kafli4 from '../chapters/kafli4.js';
import * as kafli3 from '../chapters/kafli3.js';
import { LOOKS } from '../engine/looks.js';
import { LIMITS } from '../engine/camera/director.js';
import { createSave, defaultChapter } from '../engine/save.js';
import { shapeGround } from '../world/forest/forest.js';
import { planForest } from '../world/forest/plan.js';
import { createSpeciesLibrary, SPECIES } from '../world/forest/species.js';
import { PRESETS } from '../engine/quality.js';
import { playUnattended } from './chapter-harness.mjs';

// Chapter 4 (remake/chapters/kafli4.js), "Boð til Flugeðlu": the save and the order of the chapters, its places as data (chapter 3's Fen
// as it was, and the white tree's own patch of fen), the camera rules of its shots, and its first two scenes played through by nobody
// (tests/chapter-harness.mjs). The flight has its own tests (flug.test.mjs and the rest).

const { chapter } = kafli4;
const V3 = THREE.Vector3;

// The words of the first two scenes, as spec section 4 has them (the plan's WORDS).
const SCENE_WORDS = {
  k4_mosi_next: 'Næst er það Flugeðla! Hún á heima uppi á hvíta trénu.',
  k4_egill_fly: 'Getur hún flogið?',
  k4_mosi_higher: 'Hærra en skýin!',
  k4_mosi_map_tree: 'Yfir Fenið, að hvíta trénu.',
  k4_mosi_invite: 'Halló, Flugeðla! Viltu koma á Stjörnuhátíðina í kvöld?',
  k4_flugedla_calm: 'Hátíð! Ég skal kalla á allan skóginn! En það er logn… og án vinds kemst ég ekki á loft.',
  k4_egill_wind: 'Við getum búið til vind!',
};

// ---------------------------------------------------------------------------------------------
// The save and the order

const saveWith = stars => {
  const save = createSave(null);
  for (const star of stars) save.addStar(star);
  return save;
};

test('defaultChapter opens chapter 4 after Þórseðla and keeps every earlier answer', () => {
  const cases = [[[], 'kafli1'], [['k1_kambedla'], 'kafli2'], [['k1_kambedla', 'k2_uggedla'], 'kafli3'],
    [['k1_kambedla', 'k2_uggedla', 'k2_thorsedla'], 'kafli4'],
    [['k1_kambedla', 'k2_uggedla', 'k2_thorsedla', 'k4_flugedla'], 'kafli4'],
    [['k1_kambedla', 'k2_thorsedla'], 'kafli2']]; // an old chapter 2 save (Þórseðla's star, no Uggeðla's) still meets Uggeðla
  for (const [stars, want] of cases) assert.equal(defaultChapter(saveWith(stars)), want, `stars ${stars.join(', ') || 'none'}`);
});

test('kafli3 hands over to kafli4, and kafli4 to none yet', () => {
  assert.equal(kafli3.chapter.next, 'kafli4');
  assert.equal(chapter.next, null, 'chapter 5 is not made yet');
});

// ---------------------------------------------------------------------------------------------
// The chapter and its places as data

test('the chapter as data: the Fen first, then the white tree, in the early afternoon, with Flugeðla in the cast', () => {
  assert.equal(chapter.id, 'kafli4');
  assert.equal(chapter.title, 'Boð til Flugeðlu');
  assert.equal(chapter.look, 'earlyAfternoon');
  assert.ok(LOOKS[chapter.look], 'a look engine/looks.js has');
  assert.equal(chapter.theme, 'kafli2/theme.json', 'chapter 2\'s song until the owner\'s flight theme');
  assert.equal(chapter.start, 'fen');
  assert.deepEqual(Object.keys(chapter.locations), ['fen', 'hvitatre']);
  assert.deepEqual(chapter.prepare, ['hvitatre'], 'the white tree is built while the start button waits');
  assert.ok(chapter.locations.fen.shots[chapter.startShot], 'the start shot is in the Fen');
  assert.match(chapter.actors.flugedla.url, /\/pteranodon\.glb$/);
  assert.match(chapter.actors.thorsedla.url, /\/brontosaurus\.glb$/);
  assert.deepEqual(chapter.cast.flugedla, { name: 'Flugeðla', colour: '#955055' }, 'her crest\'s raspberry, as in the flight');
  assert.deepEqual(chapter.cast.thorsedla, { name: 'Þórseðla', colour: '#89682e' });
  for (const [id, text] of Object.entries(SCENE_WORDS)) assert.equal(chapter.lines[id]?.text, text, id);
  for (const id of Object.keys(chapter.lines)) assert.match(id, /^k4_(mosi|egill|flugedla)_[a-z0-9_]+$/, `${id}: k4_<speaker>_<name>`);
  // A name in two places would overwrite the other silently (main.js).
  const names = [...Object.keys(chapter.shots), ...Object.values(chapter.locations).flatMap(location => Object.keys(location.shots))];
  assert.equal(new Set(names).size, names.length, 'every shot has a name of its own');
  for (const [name, location] of Object.entries(chapter.locations)) {
    for (const shot of location.warmUp ?? []) assert.ok(location.shots[shot], `the warm-up view ${shot} is one of ${name}'s shots`);
  }
});

const placed = plan => plan.placements.map(p => [p.name, p.variant, p.x.toFixed(3), p.z.toFixed(3), p.scale.toFixed(3), p.rot.toFixed(4)].join());
const planOf = (chapterOf, place) => {
  const world = { chapter: chapterOf };
  const { layout, terrain } = shapeGround(world, { ...place.layout, shots: place.shots }, place.layout.seed);
  return planForest({ world, layout, seed: place.layout.seed, terrain, library: createSpeciesLibrary(place.layout.seed), q: PRESETS.tablet });
};

test('the Fen is chapter 3\'s, plant for plant: its new shots are set on Þórseðla, which the planner leaves alone', () => {
  const fen = chapter.locations.fen, before = kafli3.chapter.locations.fen;
  for (const [key, value] of Object.entries(before.layout)) assert.equal(fen.layout[key], value, `chapter 3's layout: its ${key}`);
  assert.equal(fen.layout.plantedFor, kafli3.chapter.look, 'planted for chapter 3\'s sun, not this chapter\'s');
  for (const [name, shot] of Object.entries(before.shots)) assert.equal(fen.shots[name], shot, `chapter 3's ${name} is kept`);
  const added = Object.entries(fen.shots).filter(([name]) => !before.shots[name]);
  assert.ok(added.length >= 2, 'the pond as they leave and the walk across the Fen');
  for (const [name, shot] of added) {
    for (const point of [shot.position, shot.target]) assert.ok(point?.actor && point.local === true, `${name} is set on an actor, in its own frame`);
  }
  assert.deepEqual(placed(planOf(chapter, fen)), placed(planOf(kafli3.chapter, before)), 'the same plants in the same places');
});

test('the white tree stands in a patch of fen of its own: the Fen\'s snag, its kinds of plants, and its shots kept clear on a tall screen', () => {
  const { layout, shots } = chapter.locations.hvitatre;
  assert.equal(layout.biome, 'fen');
  assert.equal(layout.seed, kafli3.chapter.locations.fen.layout.seed, 'the Fen\'s seed: its plants are the Fen\'s own kinds and shapes');
  const fenSnag = kafli3.chapter.locations.fen.layout.plants.find(p => p.name === 'deadSnag');
  const snag = layout.plants.find(p => p.name === 'deadSnag');
  assert.deepEqual([snag.variant, snag.scale], [fenSnag.variant, fenSnag.scale], 'the very snag Flugeðla sits on in chapter 3');
  assert.deepEqual(snag.position, kafli4.SNAG, 'where the chapter says it is');
  assert.equal(layout.tall, 0.625, 'its shots are kept clear for a tablet held upright');
  assert.ok(Object.keys(shots).length >= 5, 'the arrival, the tree from the ground, from above and at her height, and the talk');
  const plan = planOf(chapter, chapter.locations.hvitatre);
  const tree = plan.placements.filter(p => p.name === 'deadSnag' && Math.hypot(p.x - kafli4.SNAG[0], p.z - kafli4.SNAG[1]) < 0.01);
  assert.equal(tree.length, 1, 'the planner grows it where it is put');
  // nothing tall within 9 m of it: her wings (7.5 m across) have room on the top, and she has the air round it to circle in
  const near = plan.placements.filter(p => SPECIES[p.name]?.tall && p !== tree[0] && Math.hypot(p.x - kafli4.SNAG[0], p.z - kafli4.SNAG[1]) < 9);
  assert.deepEqual(near.map(p => `${p.name} at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`), []);
  // A tall screen keeps the 16:10 frame's width and shows more above and below it: no plant within 3 m of a camera, and none big in the
  // upright view within 8 m of it (as Síkið's test has it).
  const own = new Set(layout.plants.map(p => p.position.join()));
  for (const [name, shot] of Object.entries(shots)) {
    if (!Array.isArray(shot.position) || !Array.isArray(shot.target)) continue;
    const tanH = Math.tan(THREE.MathUtils.degToRad(shot.fov / 2)) * 1.6;
    const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(tanH / 0.625)), 0.625, 0.1, 100);
    camera.position.fromArray(shot.position);
    camera.lookAt(new V3().fromArray(shot.target));
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const view = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const p of plan.placements) {
      const crown = p.model.crown;
      if (!crown || own.has([p.x, p.z].join())) continue;
      const tall = Boolean(SPECIES[p.name]?.tall);
      const radius = (tall ? Math.min(crown.r, crown.ry * 1.2) * 0.95 : Math.max(crown.r, crown.ry)) * p.scale;
      const centre = new V3(p.x + crown.c[0] * p.scale, p.y + crown.c[1] * p.scale, p.z + crown.c[2] * p.scale);
      assert.ok(centre.distanceTo(camera.position) >= radius + 3, `a ${p.name} at ${p.x.toFixed(1)}, ${p.z.toFixed(1)} stands within 3 m of ${name}'s camera`);
      const depth = -centre.clone().applyMatrix4(camera.matrixWorldInverse).z;
      if (radius >= 0.6 && depth < 8) assert.ok(!view.containsPoint(centre), `a ${p.name} of ${radius.toFixed(1)} m in ${name}'s upright view, ${depth.toFixed(1)} m in front`);
    }
  }
});

test('every fixed shot keeps the camera rules over its ground', () => {
  for (const [name, place] of Object.entries(chapter.locations)) {
    const ground = shapeGround({ chapter }, { ...place.layout, shots: place.shots }, place.layout.seed).terrain;
    for (const [label, shot] of Object.entries(place.shots)) {
      assert.ok(shot.fov >= LIMITS.lens[0] && shot.fov <= LIMITS.lens[1], `${label}: a ${shot.fov} degree lens`);
      if (!Array.isArray(shot.position)) continue; // set on an actor: the runs check it (no director warnings)
      const [x, y, z] = shot.position;
      const height = y - ground.heightAt(x, z);
      assert.ok(height >= 0.3 && height <= LIMITS.maxHeight, `${label}: the camera ${height.toFixed(2)} m above ${name}'s ground`);
      if (Array.isArray(shot.target)) {
        const [tx, ty, tz] = shot.target;
        const down = (Math.atan2(y - ty, Math.hypot(tx - x, tz - z)) * 180) / Math.PI;
        assert.ok(down <= LIMITS.maxDown, `${label} looks ${down.toFixed(0)} degrees down`);
      }
    }
  }
});

// ---------------------------------------------------------------------------------------------
// Played through by nobody: on a wide screen, on a tablet held upright, and with a tap on Þórseðla

const NEW_SHOTS = new Set([
  ...Object.keys(chapter.locations.fen.shots).filter(name => !kafli3.chapter.locations.fen.shots[name]),
  ...Object.keys(chapter.locations.hvitatre.shots),
]);
// Who each new shot must show whole enough to read: a point of each, in the frame.
const SUBJECTS = {
  mosi: world => world.actors.get('mosi').headPosition(new V3()),
  egill: world => world.actors.get('egill').headPosition(new V3()),
  flugedla: world => world.actors.get('flugedla').headPosition(new V3()),
  thorsedla: world => world.actors.get('thorsedla').headPosition(new V3()),
};

function playIt({ aspect = 1.6, tap = false } = {}) {
  const seen = { shots: new Map(), out: [], perch: [], wind: [] };
  return playUnattended(kafli4, {
    limit: 240, shaped: true, aspect, earlyTap: tap ? { name: 'thorsedla', after: 1 } : null,
    onFrame({ world, director, shot: label }) {
      const c = world.chapterState;
      if (label && NEW_SHOTS.has(label) && director.mode === 'hold') { // held on the shot (a move or a follow from it frames others)
        seen.shots.set(label, (seen.shots.get(label) ?? 0) + 1);
        world.camera.updateMatrixWorld();
        for (const who of kafli4.SHOWS[label] ?? []) {
          const p = SUBJECTS[who](world).project(world.camera);
          if (!(p.z < 1 && Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1)) seen.out.push(`${who} out of ${label} at ${world.clock.time.toFixed(1)} s`);
        }
      }
      if (world.chapterTimeline?.at(-1)?.scene === 2 && c?.perch) {
        const her = world.actors.get('flugedla');
        seen.perch.push({ root: her.root.position.clone(), top: c.perch.top.clone(), tips: c.perch.wingTips() });
        seen.wind.push(world.wind?.uniforms.uWindStrength.value ?? null);
      }
    },
  }).then(run => ({ ...run, watched: seen }));
}
let wide = null, upright = null, tapped = null;
const playWide = () => (wide ??= playIt());
const playUpright = () => (upright ??= playIt({ aspect: 0.625 }));
const playTapped = () => (tapped ??= playIt({ tap: true }));

test('scenes 1 and 2 play in order, from the Fen to the white tree, and end there', async () => {
  const { task, stage, world } = await playWide();
  assert.equal(task.done, true, `the chapter was still going at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.deepEqual(world.chapterTimeline.map(mark => mark.scene), [1, 2]);
  assert.equal(world.location, 'hvitatre');
  const [one, two] = world.chapterTimeline.map(mark => mark.at);
  assert.ok(two - one >= 30 && two - one <= 70, `scene 1 takes ${(two - one).toFixed(1)} s (spec: about 45)`);
  assert.ok(stage.s.time - two >= 20 && stage.s.time - two <= 70, `scene 2 takes ${(stage.s.time - two).toFixed(1)} s (spec: about 45)`);
});

test('every new Fen shot keeps the director quiet at 16:10 and upright, and shows whom it is for', async () => {
  for (const [shape, play] of [['16:10', playWide], ['upright', playUpright]]) {
    const { director, watched, task } = await play();
    assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
    assert.deepEqual(director.warnings, [], `the director at ${shape}`);
    for (const name of NEW_SHOTS) assert.ok(watched.shots.get(name) > 0, `${name} is used (${shape})`);
    assert.deepEqual(watched.out, [], `at ${shape}`);
  }
});

test('scene 1 draws map piece d and Þórseðla says goodbye on a tap', async () => {
  const { moments, world, watched } = await playTapped();
  const one = world.chapterTimeline.find(mark => mark.scene === 1).at, two = world.chapterTimeline.find(mark => mark.scene === 2).at;
  assert.equal(moments.length, 1, 'one map moment');
  assert.deepEqual(moments[0].ids, ['d'], 'piece d: from Þórseðla\'s pool to Flugeðla\'s circle');
  assert.ok(moments[0].at >= one && moments[0].at < two, 'in scene 1');
  assert.ok(moments[0].goneAt !== null && moments[0].goneAt < two, 'and off the screen before the white tree');
  const byes = world.chapterState.goodbyes;
  assert.ok(byes.some(bye => bye.by === 'tap' && bye.at >= one && bye.at < two), `a goodbye from the tap: ${JSON.stringify(byes)}`);
  assert.ok(byes.some(bye => bye.by === 'leaving'), 'and her own as they go');
  assert.equal(watched.out.length, 0);
  // without a tap she still says goodbye as they go, and only then
  const { world: alone } = await playWide();
  assert.deepEqual(alone.chapterState.goodbyes.map(bye => bye.by), ['leaving']);
});

test('scene 2 ends with her calm line and Egill\'s answer', async () => {
  const { seen, world } = await playWide();
  const said = [...seen.spoken];
  assert.deepEqual(said.slice(-3), ['k4_mosi_invite', 'k4_flugedla_calm', 'k4_egill_wind']);
  assert.deepEqual(said.slice(0, 4), ['k4_mosi_next', 'k4_egill_fly', 'k4_mosi_higher', 'k4_mosi_map_tree'], 'scene 1\'s in order');
  assert.equal(world.chapterState.lastSaid, 'k4_egill_wind');
});

test('she sits on the very top of the white snag with her wings spread, and nothing stirs: not she, nor the wind', async () => {
  const { watched } = await playWide();
  assert.ok(watched.perch.length > 300, `scene 2 watched for ${watched.perch.length} frames`);
  for (const { root, top, tips } of watched.perch) {
    assert.ok(Math.hypot(root.x - top.x, root.z - top.z) < 0.05 && Math.abs(root.y - top.y) < 0.05, `her feet on the top: ${root.toArray().map(v => v.toFixed(2))} and ${top.toArray().map(v => v.toFixed(2))}`);
    // spread, her own pose's 6.4 m; folded (her idle clip) the tips are 0.7 m apart
    assert.ok(tips[0].distanceTo(tips[1]) > 5, `her wings spread: ${tips[0].distanceTo(tips[1]).toFixed(2)} m from tip to tip`);
  }
  const first = watched.perch[0].tips, moved = Math.max(...watched.perch.map(({ tips }) => Math.max(tips[0].distanceTo(first[0]), tips[1].distanceTo(first[1]))));
  assert.ok(moved < 0.02, `her wing tips still: they move ${moved.toFixed(3)} m`);
  assert.ok(watched.wind.every(w => w !== null && w <= 0.15), `calm: the wind's strength at most ${Math.max(...watched.wind)}`);
});
