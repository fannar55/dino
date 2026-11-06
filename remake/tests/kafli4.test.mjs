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
import { FLIGHT_WORDS, SONG } from '../chapters/kafli4-flight.js';
import { FAR_POOL, POOL, BEATS, createRoute } from '../chapters/kafli4-route.js';
import { createTerrain } from '../world/ardalur/terrain.js';
import { poolPlants } from '../world/ardalur/river.js';
import fs from 'node:fs';

// Chapter 4 (remake/chapters/kafli4.js), "Boð til Flugeðlu": the save and the order of the chapters, its places as data (chapter 3's Fen
// as it was, the white tree's own patch of fen, and the far pool), the camera rules of its shots, and the whole chapter played through
// by nobody (tests/chapter-harness.mjs). The flight has its own tests (flug.test.mjs and the rest).

const { chapter } = kafli4;
const V3 = THREE.Vector3;
const deg = THREE.MathUtils.radToDeg;

// The words of the first five scenes, as spec section 4 has them (the plan's WORDS; Mosi's "Svona! Fúúú!" is the plan's own).
const SCENE_WORDS = {
  k4_mosi_next: 'Næst er það Flugeðla! Hann á heima uppi á hvíta trénu.',
  k4_egill_fly: 'Getur hann flogið?',
  k4_mosi_higher: 'Hærra en skýin!',
  k4_mosi_map_tree: 'Yfir Fenið, að hvíta trénu.',
  k4_mosi_invite: 'Halló, Flugeðla! Viltu koma á Stjörnuhátíðina í kvöld?',
  k4_flugedla_calm: 'Hátíð! Ég skal kalla á allan skóginn! En það er logn… og án vinds kemst ég ekki á loft.',
  k4_egill_wind: 'Við getum búið til vind!',
  k4_mosi_swipe: 'Strjúktu upp, Egill!',
  k4_mosi_blow: 'Svona! Fúúú!',
  k4_flugedla_more: 'Meira! Ég finn hann!',
  k4_flugedla_now: 'Nú!',
  k4_flugedla_thanks: 'Takk! Ég kem á hátíðina og kalla á alla!',
  k4_mosi_star: 'Fjórða stjarnan!',
  k4_flugedla_comealong: 'Viltu koma með, Egill? Sestu á bakið á mér.',
  k4_egill_yes: 'Já!',
  k4_mosi_run: 'Fljúgið þið, ég hleyp!',
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
  assert.deepEqual(Object.keys(chapter.locations), ['fen', 'hvitatre', 'ardalur']);
  assert.deepEqual(chapter.prepare, ['hvitatre'], 'the white tree is built while the start button waits');
  // the valley is cut to in view, with no black to hide its first draw: it is built, its far land loaded and drawn before the button shows
  assert.deepEqual(chapter.readyFirst, ['ardalur'], 'Árdalurinn is ready before the start button shows (main.js getReady)');
  assert.equal(typeof chapter.locations.ardalur.ready, 'function', 'and loads what it shows later (the far land) as it is readied');
  assert.equal(typeof chapter.locations.ardalur.build, 'function', 'Árdalurinn is a place of its own make (world/ardalur)');
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

// The lines: the kafli4 set (assets/audio/kafli4/lines-source.json, made by tools/voice-lines.mjs --set kafli4), one recording each.
const readJson = relative => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'));
const CHAPTER_TEXT = ['kafli4', 'kafli4-wind', 'kafli4-flight', 'kafli4-flight-play'].map(name => fs.readFileSync(new URL(`../chapters/${name}.js`, import.meta.url), 'utf8')).join('');

test('every chapter line is a line of the kafli4 set, said by its speaker from its own recording', () => {
  const source = new Map(readJson('../assets/audio/kafli4/lines-source.json').map(line => [line.id, line]));
  const recorded = readJson('../assets/audio/lines.json');
  assert.deepEqual(Object.keys(chapter.lines).sort(), [...source.keys()].sort(), 'the set is the chapter\'s lines, no more and no fewer');
  const unrecorded = [];
  for (const [id, line] of Object.entries(chapter.lines)) {
    const entry = source.get(id);
    assert.match(id, new RegExp(`^k4_${entry.speaker}_[a-z0-9_]+$`), `${id} names its speaker, ${entry.speaker}`);
    assert.ok(chapter.cast[entry.speaker], `${entry.speaker} speaks ${id} but has no caption name`);
    assert.deepEqual(line, { text: entry.text, audio: id }, `${id} says what the source says, from its own recording`);
    if (recorded[id]?.src !== `assets/audio/kafli4/${id}.mp3`) unrecorded.push(id);
  }
  // Whatever the script names as a line is one of them.
  for (const [, id] of CHAPTER_TEXT.matchAll(/'(k4_(?:mosi|egill|flugedla)_[a-z0-9_]+)'/g)) assert.ok(chapter.lines[id], `the script names '${id}', which is not one of its lines`);
  assert.deepEqual(unrecorded, [], 'every line has its recording in lines.json (node remake/tools/voice-lines.mjs --set kafli4)');
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
    if (!place.layout) continue; // Árdalurinn: the flight camera's shots, linted as it flies (engine/camera/flight-camera.js)
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
  ...Object.keys(chapter.locations.ardalur.shots), // the far pool's (scene 7): the flight's own are the flight camera's
]);
// Who each new shot must show whole enough to read: a point of each, in the frame.
const SUBJECTS = {
  mosi: world => world.actors.get('mosi').headPosition(new V3()),
  egill: world => world.actors.get('egill').headPosition(new V3()),
  flugedla: world => world.actors.get('flugedla').headPosition(new V3()),
  thorsedla: world => world.actors.get('thorsedla').headPosition(new V3()),
};

/**
 * The chapter played by nobody, or with a tap on Þórseðla (`tap`), or with a child's hands in the wind task (`hands`: 'up' strokes
 * or 'tap's anywhere on the screen, one every `every` seconds from a second into scene 3 on, `count` of them).
 */
function playIt({ aspect = 1.6, tap = false, hands = null, savedWith = null, reduced = false } = {}) {
  const seen = { critters: [], rows: [], cuts: 0, lastShot: null, shadow: [], shots: new Map(), out: [], perch: [], wind: [], gusty: [], stirred: [], hands: [], circle: [], fades: [], switched: null, low: null, turns: [], posed: null, pool: [], flown: null, theme: null, songCue: null, songAtHorn: null };
  let where = null;
  return playUnattended(kafli4, {
    limit: 720, shaped: true, aspect, earlyTap: tap ? { name: 'thorsedla', after: 1 } : null, savedWith, reduced,
    onFrame({ world, director, pointer, ui, shot: label }) {
      const c = world.chapterState;
      // the page's theme, which the harness's world has none of: what the chapter asks of it, and when
      if (!seen.theme) {
        seen.theme = [];
        world.music = { setLevel: (level, seconds) => seen.theme.push({ level, seconds, t: world.clock.time }), lenient() {} };
      }
      // the flight's own song: where it is as the flight starts, and as the horn sounds
      const off = c?.flight?.flight?.started ?? null;
      if (c?.song && off !== null && seen.songCue === null) seen.songCue = c.song.position - (world.clock.time - off);
      if (c?.horn && seen.songAtHorn === null) seen.songAtHorn = c.song?.position ?? null;
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
      const three = world.chapterTimeline?.find(mark => mark.scene === 3);
      if (three && c?.wind && !c.wind.fullAt) {
        const t = world.clock.time - three.at;
        seen.gusty.push({ t, strength: world.wind.uniforms.uWindStrength.value });
        seen.stirred.push({ t, tips: c.perch.wingTips(), root: world.actors.get('flugedla').root.position.clone(), top: c.perch.top.clone() });
        // the child's hands: from a second in, one every `every` seconds, in the middle of the screen
        if (hands && seen.hands.length < hands.count && t >= 1 + seen.hands.length * hands.every) {
          if (hands.kind === 'up') pointer.drag(640, 620, 10, -240);
          else pointer.tap(null, { x: 640, y: 500 });
          seen.hands.push(world.clock.time);
        }
      }
      const scene = world.chapterTimeline?.filter(mark => typeof mark.scene === 'number').at(-1)?.scene;
      const her = world.actors.get('flugedla'), egill = world.actors.get('egill');
      // the critters in the crowds (world/critters/crowd.js) through the flight: the cut it is in, the tallest in the frame (in pixels of
      // a 1280 by 800 frame, or 800 by 1280 upright), and their budget
      const crowds = world.forest?.animals?.crowds;
      const started = c?.flight?.flight?.started ?? null;
      if (crowds && started !== null && c.flight.flight.ended === null) {
        const shot = c.flight.camera.current;
        if (shot !== seen.lastShot) { seen.cuts++; seen.lastShot = shot; }
        world.camera.updateMatrixWorld();
        const tall = world.camera.aspect >= 1 ? 800 : 1280;
        let tallest = 0;
        for (const r of crowds.placed()) {
          const middle = r.position.clone().setY(r.position.y + r.height / 2).project(world.camera);
          if (middle.z >= 1 || Math.abs(middle.x) > 1 || Math.abs(middle.y) > 1) continue;
          const foot = r.position.clone().project(world.camera);
          const top = r.position.clone().setY(r.position.y + r.height).project(world.camera);
          tallest = Math.max(tallest, ((top.y - foot.y) / 2) * tall);
        }
        seen.critters.push({ t: world.clock.time - started, shot, cut: seen.cuts, tallest, triangles: crowds.triangles(), calls: crowds.calls() });
        // F and G (world/ardalur/life.js): how many of the rows' small lizards and the flocks' birds the frame shows 8 px tall or more
        const life = world.forest.life;
        if (life?.rows && world.flightTime >= BEATS.F) {
          const large = members => members.filter(m => {
            const foot = m.position.clone().project(world.camera);
            if (!m.visible || foot.z >= 1 || Math.abs(foot.x) > 1 || Math.abs(foot.y) > 1) return false;
            const box = projectedBox(m, world.camera, crowds);
            return ((box.y1 - box.y0) / 2) * tall >= 8;
          }).length;
          const lizards = life.rows.flatMap(r => r.members);
          seen.rows.push({
            t: world.flightTime, shot, call: c.flight.play?.big?.at ?? null,
            lizards: large(lizards), birds: large(life.flocks.flatMap(f => f.members)),
            ran: lizards.reduce((sum, m) => sum + Math.hypot(m.position.x - m.at.x, m.position.z - m.at.z), 0) / lizards.length,
          });
        }
      }
      // the shadow shot (the flight camera's bankShadow): how large the lizards it is about look, as she passes them
      if (c?.flight?.camera?.current === 'bankShadow' && world.forest?.animals) {
        const group = world.forest.animals.groups.find(g => g.id === 'lizards-2');
        world.camera.updateMatrixWorld();
        // the group's height in the frame: from the lowest to the highest point of the boxes of those of it in the frame
        let low = Infinity, high = -Infinity;
        for (const m of group.members) {
          const p = m.position.clone().project(world.camera);
          if (!m.visible || p.z >= 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue;
          const box = projectedBox(m, world.camera, world.forest.animals.crowds);
          low = Math.min(low, box.y0);
          high = Math.max(high, box.y1);
        }
        const size = high > low ? (Math.min(high, 1) - Math.max(low, -1)) / 2 : 0;
        const at = her.root.position;
        seen.shadow.push({ t: world.clock.time, near: Math.hypot(at.x - group.point.x, at.z - group.point.z), size, middle: group.point.clone().project(world.camera) });
      }
      // scene 4: where she is round the snag
      if (scene === 4 && world.location === 'hvitatre') seen.circle.push({ t: world.clock.time, at: her.root.position.clone(), top: c.perch?.top?.clone() ?? null });
      // scene 5: how low she comes, and the black from it till two seconds into the flight
      if (scene === 5 && world.location === 'hvitatre') {
        const low = her.root.position.y - world.heightAt(her.root.position.x, her.root.position.z);
        if (!seen.low || low < seen.low.over) seen.low = { over: low, t: world.clock.time, egill: egill.root.position.clone(), her: her.root.position.clone() };
      }
      const flying = c?.flight?.flight?.started ?? null;
      if (scene >= 5 && (flying === null || world.clock.time - flying <= 2)) seen.fades.push({ t: world.clock.time, level: ui.fadeLevel, where: world.location });
      // her body, and her head on it, frame to frame from scene 4 till four seconds into the flight: how far each turns in a frame
      if (scene >= 4 && (flying === null || world.clock.time - flying <= 4)) {
        const body = her.root.quaternion.clone();
        const head = body.clone().invert().multiply(her.model.getObjectByName('Head').getWorldQuaternion(new THREE.Quaternion()));
        // Egill while he floats onto her and rides her: where he is on her (in her root's frame), and his turn
        const on = c?.boarding != null && egill.controlled ? { at: egill.root.position.clone().sub(her.root.position).applyQuaternion(body.clone().invert()), turn: egill.root.quaternion.clone() } : null;
        const was = seen.posed;
        if (was) {
          seen.turns.push({
            t: world.clock.time, scene, where: world.location, body: deg(was.body.angleTo(body)), head: deg(was.head.angleTo(head)),
            move: on && was.on ? on.at.clone().sub(was.on.at) : null, egill: on && was.on ? deg(on.turn.angleTo(was.on.turn)) : 0,
          });
          // how much Egill's step on her changed from the frame before: a jump is a step unlike the ones round it, as fast as he floats
          const [a, b] = seen.turns.slice(-2);
          seen.turns.at(-1).seat = a !== b && a?.move && b.move ? b.move.distanceTo(a.move) : 0;
        }
        seen.posed = { body, head, on };
      }
      // the switch to Árdalurinn: Egill on her back as the place changes, and the camera where it was round his head
      const round = () => ({ camera: world.camera.position.clone().sub(egill.headPosition(new V3())), fov: world.camera.fov, heading: her.heading });
      if (where === 'hvitatre' && world.location === 'ardalur' && !seen.switched) {
        const spine = her.model.getObjectByName('Spine').getWorldPosition(new V3());
        seen.switched = { t: world.clock.time, controlled: egill.controlled, fromSeat: egill.root.position.distanceTo(spine), shot: director.mode, before: seen.lastRound, after: round() };
      }
      if (world.location === 'hvitatre' && scene >= 5) seen.lastRound = round();
      // the flight's last frame, and scene 7 at the far pool: where she, Egill and Mosi are, frame by frame
      if (scene === 6 && world.location === 'ardalur') seen.flown = her.root.position.clone();
      if (scene === 7) {
        const mosi = world.actors.get('mosi');
        seen.pool.push({
          t: world.clock.time, her: her.root.position.clone(), egill: egill.root.position.clone(), riding: egill.controlled,
          mosi: mosi.root.position.clone(), mosiShown: mosi.root.visible, fade: ui.fadeLevel,
        });
      }
      where = world.location;
    },
  }).then(run => ({ ...run, watched: seen }));
}
/**
 * A critter's model box at its pose, projected: its least and most x and y on the screen (-1 to 1 across the frame). The box is its
 * kind's shape at rest, as the crowds draw it (the fine level of a baked critter, such as the small lizard).
 */
const boxes = new Map();
function projectedBox(m, camera, crowds) {
  if (!boxes.has(m.kind)) {
    const mesh = crowds.meshes.find(x => x.userData.kind === m.kind && !x.userData.level);
    boxes.set(m.kind, new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position')));
  }
  const box = boxes.get(m.kind);
  const h = THREE.MathUtils.degToRad(m.heading);
  const c = Math.cos(h), s = Math.sin(h);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const lx of [box.min.x, box.max.x]) for (const ly of [box.min.y, box.max.y]) for (const lz of [box.min.z, box.max.z]) {
    const p = new V3((lx * c - lz * s) * m.scale, ly * m.scale, (lx * s + lz * c) * m.scale).add(m.position).project(camera);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  return { x0, x1, y0, y1 };
}
let wide = null, upright = null, tapped = null;
const playWide = () => (wide ??= playIt());
const playUpright = () => (upright ??= playIt({ aspect: 0.625 }));
const playTapped = () => (tapped ??= playIt({ tap: true }));
let calm = null;
const playReduced = () => (calm ??= playIt({ reduced: true }));

test('scenes 1 to 7 play in order, from the Fen to the white tree, up into the flight over Árdalurinn and down at the far pool', async () => {
  const { task, stage, world } = await playWide();
  assert.equal(task.done, true, `the chapter was still going at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  const scenes = world.chapterTimeline.filter(mark => typeof mark.scene === 'number');
  assert.deepEqual(scenes.map(mark => mark.scene), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(world.chapterTimeline.filter(mark => typeof mark.scene === 'string').map(mark => mark.scene), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'end'], 'the flight\'s beats after scene 6, and the end');
  assert.equal(world.location, 'ardalur');
  const [one, two, three, four, five, six, seven] = scenes.map(mark => mark.at);
  const end = world.chapterTimeline.at(-1).at;
  assert.ok(end - seven >= 25 && end - seven <= 60, `scene 7 takes ${(end - seven).toFixed(1)} s (spec: about 45)`);
  assert.ok(two - one >= 30 && two - one <= 70, `scene 1 takes ${(two - one).toFixed(1)} s (spec: about 45)`);
  assert.ok(three - two >= 20 && three - two <= 70, `scene 2 takes ${(three - two).toFixed(1)} s (spec: about 45)`);
  assert.ok(five - four >= 18 && five - four <= 50, `scene 4 takes ${(five - four).toFixed(1)} s (spec: about 30)`);
  assert.ok(six - five >= 18 && six - five <= 50, `scene 5 takes ${(six - five).toFixed(1)} s (spec: about 30)`);
});

test('every caption is words, never a line id: the flight\'s lines are the chapter\'s too', async () => {
  for (const [id, text] of Object.entries(FLIGHT_WORDS)) assert.equal(chapter.lines[id]?.text, text, id);
  const { captions } = await playWide();
  const flight = Object.values(FLIGHT_WORDS);
  assert.ok(captions.some(c => flight.includes(c.text)), 'the flight says its lines in the chapter');
  assert.deepEqual(captions.filter(c => /^k\d_[a-z]+_/.test(c.text)).map(c => c.text), [], 'no caption shows an id');
});

test('every new shot, the Fen\'s, the white tree\'s and the far pool\'s, keeps the director quiet at 16:10 and upright, and shows whom it is for', async () => {
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
  const end = said.indexOf('k4_egill_wind');
  assert.deepEqual(said.slice(end - 2, end + 1), ['k4_mosi_invite', 'k4_flugedla_calm', 'k4_egill_wind']);
  assert.deepEqual(said.slice(0, 4), ['k4_mosi_next', 'k4_egill_fly', 'k4_mosi_higher', 'k4_mosi_map_tree'], 'scene 1\'s in order');
  const three = world.chapterTimeline.find(mark => mark.scene === 3).at;
  assert.ok(seen.spokenAt.get('k4_egill_wind') < three, 'Egill\'s answer ends scene 2');
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

// ---------------------------------------------------------------------------------------------
// Scene 3: the wind (spec 4.3). A stroke up the screen is a gust, a tap half of one; six fill the wind. A child who does nothing gets
// a hint at 6 s, Mosi's showing at 12 s and a gust every 4 s from 20 s on, so the wind always fills.

let stroked = null, tapping = null;
const strokes = () => (stroked ??= playIt({ hands: { kind: 'up', every: 1.5, count: 6 } }));
const taps = () => (tapping ??= playIt({ hands: { kind: 'tap', every: 0.8, count: 12 } }));

test('six up strokes fill the wind; twelve taps do too', async () => {
  for (const [kind, play, count] of [['up', strokes, 6], ['tap', taps, 12]]) {
    const { world, task, watched } = await play();
    assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
    const wind = world.chapterState.wind;
    assert.equal(watched.hands.length, count, `${count} ${kind}s given`);
    assert.deepEqual(wind.gusts.map(g => g.by), Array(count).fill(kind), `every gust is the child's (${kind}): no help was needed`);
    assert.equal(wind.filled, 6);
    const last = watched.hands.at(-1);
    assert.ok(wind.fullAt >= last && wind.fullAt <= last + 0.1, `full on the last ${kind}: at ${wind.fullAt.toFixed(2)}, the last at ${last.toFixed(2)}`);
    assert.deepEqual(wind.hints, [], 'no hint for a child who strokes');
    assert.equal(wind.showedAt, null, 'nor Mosi\'s showing');
  }
});

test('each gust blows: the wind rises to 2.2 and eases back, her wings stir, and Egill and Mosi blow along', async () => {
  const { world, watched } = await strokes();
  const wind = world.chapterState.wind;
  const three = world.chapterTimeline.find(mark => mark.scene === 3).at;
  wind.gusts.slice(0, -1).forEach((gust, i) => { // the last fills the wind, and the big gust takes over from it
    const t = gust.at - three;
    const near = watched.gusty.filter(w => w.t >= t && w.t <= t + 0.3);
    assert.ok(near.some(w => Math.abs(w.strength - 2.2) < 0.05), `strength 2.2 at the gust at ${t.toFixed(1)} s: ${near.map(w => w.strength.toFixed(2))}`);
    const next = wind.gusts[i + 1] ? wind.gusts[i + 1].at - three : Infinity;
    const later = watched.gusty.find(w => w.t >= t + 1.25 && w.t < next);
    if (later) assert.ok(later.strength < 1.2, `eased back within 1.2 s: ${later.strength.toFixed(2)} at ${later.t.toFixed(1)} s`);
  });
  const before = watched.gusty.filter(w => w.t < wind.gusts[0].at - three);
  assert.ok(before.length > 10 && before.every(w => w.strength <= 0.15), 'calm before the first gust');
  // her wings stir with a gust, and she stays on the top till the wind is full
  const first = wind.gusts[0].at - three;
  const still = watched.stirred.filter(f => f.t < first).at(-1).tips;
  const moved = Math.max(...watched.stirred.filter(f => f.t >= first && f.t <= first + 1.2).map(f => Math.max(f.tips[0].distanceTo(still[0]), f.tips[1].distanceTo(still[1]))));
  assert.ok(moved > 0.15, `her wing tips move ${moved.toFixed(2)} m in the gust`);
  for (const f of watched.stirred) assert.ok(f.root.distanceTo(f.top) < 0.05, `on the top at ${f.t.toFixed(1)} s`);
  // Egill on every second gust, Mosi on every third
  assert.deepEqual(wind.blows.filter(b => b.who === 'egill').map(b => b.gust), [2, 4, 6]);
  assert.deepEqual(wind.blows.filter(b => b.who === 'mosi').map(b => b.gust), [3, 6]);
});

test('she cheers after the third gust, and with the wind full a big gust lifts her: "Nú!"', async () => {
  const { world, seen } = await strokes();
  const wind = world.chapterState.wind;
  assert.equal(seen.said.filter(line => line.id === 'k4_flugedla_more').length, 1, 'her cheer, once');
  assert.ok(seen.spokenAt.get('k4_flugedla_more') >= wind.gusts[2].at, 'after the third gust');
  assert.ok(seen.spokenAt.get('k4_flugedla_now') >= wind.fullAt, '"Nú!" once it is full');
  assert.ok(wind.bigAt >= wind.fullAt, 'the big gust');
  assert.ok(wind.cloudSpeed > 1, `the clouds go faster: ${wind.cloudSpeed}`);
  assert.ok(wind.lifted > 0.2, `she lifts off the top: ${wind.lifted.toFixed(2)} m`);
});

test('untouched, the wind fills by itself and the scene ends within 60 s of its start', async () => {
  const { world, seen, stage, task } = await playWide();
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  const wind = world.chapterState.wind;
  const three = world.chapterTimeline.find(mark => mark.scene === 3).at;
  assert.ok(wind.hints.length >= 1 && Math.abs(wind.hints[0] - three - 6) < 0.5, `the hint at 6 s: ${wind.hints.map(h => (h - three).toFixed(1))}`);
  assert.ok(seen.spokenAt.get('k4_mosi_swipe') >= wind.hints[0], 'Mosi: "Strjúktu upp, Egill!"');
  assert.ok(Math.abs(wind.showedAt - three - 12) < 0.5, `Mosi shows how at 12 s: ${(wind.showedAt - three).toFixed(1)}`);
  assert.ok(seen.spokenAt.get('k4_mosi_blow') >= wind.showedAt, 'Mosi: "Svona! Fúúú!"');
  const autos = wind.gusts.filter(g => g.by === 'auto').map(g => g.at - three);
  assert.ok(autos.length >= 1 && Math.abs(autos[0] - 20) < 0.5, `the first gust by itself at 20 s: ${autos.map(a => a.toFixed(1))}`);
  for (let i = 1; i < autos.length; i++) assert.ok(Math.abs(autos[i] - autos[i - 1] - 4) < 0.3, `then every 4 s: ${autos.map(a => a.toFixed(1))}`);
  assert.equal(wind.filled, 6);
  assert.ok(wind.fullAt - three <= 60, `full at ${(wind.fullAt - three).toFixed(1)} s`);
  assert.ok(wind.endedAt - three <= 60, `the scene ends at ${(wind.endedAt - three).toFixed(1)} s`);
  assert.ok(stage.s.time >= wind.endedAt);
  assert.equal(world.page.body.querySelectorAll('.wind-hint').length, 0, 'the hint is taken off the page');
});

test('the wind\'s shot keeps the director quiet, shows them all and holds still for the child\'s hands', async () => {
  for (const [shape, play] of [['16:10', playWide], ['upright', playUpright]]) {
    const { director, watched, task } = await play();
    assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
    assert.ok(watched.shots.get('tre_wind') > 0, `tre_wind is used (${shape})`);
    assert.deepEqual(director.warnings, [], `the director at ${shape}`);
    assert.deepEqual(watched.out, [], `at ${shape}`);
  }
});

// ---------------------------------------------------------------------------------------------
// Scenes 4 and 5 (spec 4.4-4.5): she circles the tree and sits again, the fourth star, and she takes Egill on her back; then the flight,
// into which the picture goes with no black: the place changes under the close-up of Egill as she turns to him.

test('she circles the white tree once and sits on its top again, and thanks them', async () => {
  const { world, seen, watched } = await playWide();
  const centre = new V3(kafli4.SNAG[0], 0, kafli4.SNAG[1]);
  let swept = 0, last = null;
  for (const { at } of watched.circle) {
    const angle = Math.atan2(at.z - centre.z, at.x - centre.x);
    if (last !== null && Math.hypot(at.x - centre.x, at.z - centre.z) > 2) {
      let d = angle - last;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      swept += d;
    }
    last = angle;
  }
  assert.ok(Math.abs(swept) >= 1.8 * Math.PI, `once round the tree: ${(Math.abs(swept) * 180 / Math.PI).toFixed(0)} degrees`);
  const far = Math.max(...watched.circle.map(({ at }) => Math.hypot(at.x - centre.x, at.z - centre.z)));
  assert.ok(far >= 6 && far <= 16, `wide of the tree, not far off: ${far.toFixed(1)} m`);
  const end = watched.circle.at(-1);
  assert.ok(end.top && end.at.distanceTo(end.top) < 0.15, `back on the top: ${end.at.toArray().map(v => v.toFixed(2))}`);
  const four = world.chapterTimeline.find(mark => mark.scene === 4).at;
  assert.ok(seen.spokenAt.get('k4_flugedla_thanks') > four, 'then her thanks');
});

test('the fourth star rises from her and goes in the book once: playing again adds no second', async () => {
  const { save, seen, world } = await playWide();
  const stars = save.get().stars;
  assert.equal(stars.filter(id => id === 'k4_flugedla').length, 1, `her star: ${stars}`);
  const four = world.chapterTimeline.find(mark => mark.scene === 4).at, five = world.chapterTimeline.find(mark => mark.scene === 5).at;
  assert.ok(seen.spokenAt.get('k4_mosi_star') > four && seen.spokenAt.get('k4_mosi_star') < five, 'Mosi: "Fjórða stjarnan!" in scene 4');
  const again = await (playIt.again ??= playIt({ savedWith: s => ['k1_kambedla', 'k2_uggedla', 'k2_thorsedla', 'k4_flugedla'].forEach(id => s.addStar(id)) }));
  assert.equal(again.task.failed, false, String(again.task.error?.stack ?? again.task.error));
  const after = again.save.get().stars;
  assert.deepEqual([...after].sort(), ['k1_kambedla', 'k2_thorsedla', 'k2_uggedla', 'k4_flugedla'], `no second star: ${after}`);
});

test('she sits low by Mosi and Egill floats onto her back; Mosi will run', async () => {
  const { world, seen, watched } = await playWide();
  assert.ok(watched.low && watched.low.over < 0.6, `she comes down to the ground: ${watched.low?.over.toFixed(2)} m over it`);
  const mosi = world.actors.get('mosi');
  const five = world.chapterTimeline.find(mark => mark.scene === 5).at;
  const said = seen.said.filter(line => line.at >= five).map(line => line.id);
  for (const id of ['k4_flugedla_comealong', 'k4_egill_yes', 'k4_mosi_run']) assert.ok(said.includes(id), `${id} in scene 5: ${said}`);
  assert.ok(said.indexOf('k4_flugedla_comealong') < said.indexOf('k4_egill_yes'), 'her asking, then his yes');
  assert.ok(mosi, 'Mosi is there');
});

test('from the circle to the flight nothing turns or moves in a jump: not her body, her head on it, nor Egill on her, in any frame', async () => {
  for (const [shape, play] of [['16:10', playWide], ['upright', playUpright]]) {
    const { watched } = await play();
    assert.ok(watched.turns.length > 1500, `watched from scene 4 into the flight: ${watched.turns.length} frames`);
    assert.ok(watched.turns.filter(f => f.seat > 0).length > 300, 'and Egill on her, from his float on');
    const jumps = watched.turns.filter(f => f.body > 8 || f.head > 8 || f.seat > 0.08 || f.egill > 8);
    const say = f => `${f.t.toFixed(2)} s, scene ${f.scene} in ${f.where}: her body ${f.body.toFixed(1)}, her head ${f.head.toFixed(1)} degrees; Egill's step changed ${f.seat.toFixed(3)} m, he turned ${f.egill.toFixed(1)} degrees`;
    assert.deepEqual(jumps.map(say), [], `no jumps (${shape})`);
  }
});

test('Egill is on her back before the place changes, and nothing goes black between the boarding and the flight', async () => {
  for (const [shape, play] of [['16:10', playWide], ['upright', playUpright]]) {
    const { watched, task } = await play();
    assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
    const { switched, fades } = watched;
    assert.ok(switched, `the place changed to Árdalurinn (${shape})`);
    assert.equal(switched.controlled, true, 'Egill rides her as it changes');
    assert.ok(switched.fromSeat < 1.6, `on her back, by her spine: ${switched.fromSeat.toFixed(2)} m`);
    const { before, after } = switched;
    assert.ok(before.camera.distanceTo(after.camera) < 0.1, `the camera stays round Egill's head across the cut: ${before.camera.toArray().map(v => v.toFixed(2))} then ${after.camera.toArray().map(v => v.toFixed(2))}`);
    assert.ok(Math.abs(before.fov - after.fov) < 0.5, `and its lens: ${before.fov} then ${after.fov}`);
    assert.ok(Math.abs(((before.heading - after.heading + 540) % 360) - 180) < 1, `she faces the same way: ${before.heading.toFixed(1)} then ${after.heading.toFixed(1)}`);
    const dark = fades.filter(f => f.level > 0.01);
    assert.deepEqual(dark.map(f => `${f.t.toFixed(2)} s ${f.level.toFixed(2)} in ${f.where}`), [], `no black from scene 5 to the flight (${shape})`);
    assert.ok(fades.some(f => f.where === 'ardalur'), 'watched into the flight');
  }
});

// ---------------------------------------------------------------------------------------------
// Scene 7 (spec 4.7): she lands in the far pool with a splash and Egill floats down onto its bank; Mosi comes out of the reed, out of
// breath; Slóeðla's horn sounds from the reed across the pool, false; and the chapter ends as chapter 3 does, in the book.

const toPool = p => Math.hypot((p.x ?? p[0]) - FAR_POOL.center[0], (p.z ?? p[1]) - FAR_POOL.center[1]);

test('in every chase shot of C a group of animals is in view, large enough to see', async () => {
  for (const [shape, play, share] of [['16:10', playWide, 0.5], ['upright', playUpright, 0.33]]) {
    const { watched } = await play();
    const frames = watched.critters.filter(f => f.shot === 'chase' && f.t >= BEATS.C && f.t < BEATS.D);
    // a chase that starts at D (its first frame a hair under 80 s on this clock) is D's, not C's
    const cuts = [...new Set(frames.map(f => f.cut))].filter(cut => frames.filter(f => f.cut === cut).length > 15);
    assert.ok(cuts.length >= 3, `${shape}: ${cuts.length} chase shots in C`);
    for (const cut of cuts) {
      const shot = frames.filter(f => f.cut === cut);
      const seenShare = shot.filter(f => f.tallest >= 16).length / shot.length;
      assert.ok(seenShare >= share, `${shape}: the chase from ${shot[0].t.toFixed(1)} to ${shot.at(-1).t.toFixed(1)} s shows an animal 16 px tall ${(100 * seenShare).toFixed(0)} % of the time (at least ${100 * share} %)`);
    }
  }
});

test('the animals stay in their budget: 40 000 triangles and 12 draw calls in every frame of the flight', async () => {
  const { watched } = await playWide();
  assert.ok(watched.critters.length > 1000, `${watched.critters.length} frames of the flight`);
  const triangles = Math.max(...watched.critters.map(f => f.triangles));
  const calls = Math.max(...watched.critters.map(f => f.calls));
  assert.ok(triangles <= 40000 && calls <= 12, `at most ${triangles} triangles and ${calls} draw calls in a frame`);
});

test('the lizards of C are the owner\'s small lizard, loaded before the valley is built', async () => {
  const { world } = await playWide();
  const lizards = world.forest.animals.groups.filter(g => g.kind === 'lizards');
  assert.equal(lizards.length, 3);
  assert.ok(lizards.every(g => g.members.every(m => m.kind === 'smaedla')), lizards.map(g => `${g.id}: ${g.members[0].kind}`).join(', '));
});

test('the shadow shot frames the lizards it is about: the group at least 8 % of the frame\'s height as she passes', async () => {
  const { watched } = await playWide();
  assert.ok(watched.shadow.length > 30, `the shadow shot is seen (${watched.shadow.length} frames)`);
  const closest = watched.shadow.reduce((a, b) => (b.near < a.near ? b : a));
  const { middle } = closest;
  assert.ok(middle.z < 1 && Math.abs(middle.x) <= 1 && Math.abs(middle.y) <= 1, `the group in the frame as she passes it (${middle.x.toFixed(2)}, ${middle.y.toFixed(2)})`);
  assert.ok(closest.size >= 0.08, `the group is ${(100 * closest.size).toFixed(1)} % of the frame's height as she passes (at least 8 %)`);
});

// F and G (the life spec 2F, 2G; world/ardalur/life.js): after the big call the rows of small lizards stream toward the far pool where
// the flight's shots see them, the slow circle round her (the fixed vista under reduced motion) and the chase down the glide to 162 s
test('after the big call ten small lizards or more, 8 px tall, run toward the far pool in the slow circle and down the glide', async (t) => {
  const plays = [['16:10', playWide, { orbit: 0.5, chase: 0.4 }], ['upright', playUpright, { orbit: 0.5, chase: 0.3 }], ['reduced motion', playReduced, { orbit: 0.5 }]];
  for (const [shape, play, wants] of plays) {
    const { watched } = await play();
    const frames = watched.rows.filter(f => f.call !== null && f.t > f.call + 2);
    assert.ok(frames.length > 600, `${shape}: ${frames.length} frames after the big call`);
    // the call sets them off (chapters/kafli4-flight-play.js bigCall): 10 s after it they have run 30 m on the mean
    const later = frames.filter(f => f.t > f.call + 10);
    assert.ok(later.length > 300 && later.every(f => f.ran >= 30), `${shape}: the lizards have run ${Math.min(...later.map(f => f.ran)).toFixed(1)} m 10 s after the call`);
    for (const [shot, share] of Object.entries(wants)) {
      const inShot = frames.filter(f => f.shot === shot && (shot !== 'chase' || (f.t >= BEATS.G && f.t < 162)));
      const seenShare = inShot.filter(f => f.lizards >= 10).length / inShot.length;
      const birds = inShot.filter(f => f.birds >= 9).length / inShot.length;
      t.diagnostic(`${shape} ${shot}: ${inShot.length} frames, ten lizards ${(100 * seenShare).toFixed(0)} %, nine birds ${(100 * birds).toFixed(0)} %, most ${Math.max(...inShot.map(f => f.lizards))}`);
      assert.ok(inShot.length > 100 && seenShare >= share, `${shape}: the ${shot} shows ten small lizards 8 px tall ${(100 * seenShare).toFixed(0)} % of the time (at least ${100 * share} %)`);
      // and the flocks rise in the slow circle: nine birds of them 8 px tall at least 40 % of the time
      assert.ok(shot !== 'orbit' || birds >= 0.4, `${shape}: the ${shot} shows nine birds of the flocks 8 px tall ${(100 * birds).toFixed(0)} % of the time (at least 40 %)`);
    }
  }
});

test('the far pool is a place of its own (chapter 5 begins there): the route\'s pool, its spots, and the shots scene 7 uses', () => {
  assert.deepEqual(FAR_POOL.center, POOL.center);
  assert.equal(FAR_POOL.radius, POOL.radius);
  assert.equal(FAR_POOL.level, POOL.level);
  assert.ok(Object.keys(FAR_POOL.shots).length >= 3, 'its shots');
  assert.deepEqual(chapter.locations.ardalur.shots, FAR_POOL.shots, 'the valley\'s fixed shots are the pool\'s');
  for (const name of Object.keys(FAR_POOL.shots)) assert.ok(Array.isArray(kafli4.SHOWS[name]), `${name} says whom it shows (the far reed: nobody)`);
  const terrain = createTerrain(createRoute({ wingspan: 7.5 }));
  const depth = ([x, z]) => FAR_POOL.level - terrain.heightAt(x, z);
  assert.ok(toPool(FAR_POOL.landing) < FAR_POOL.radius && depth(FAR_POOL.landing) > 0.2 && depth(FAR_POOL.landing) < 0.9, `she lands in the shallows: ${depth(FAR_POOL.landing).toFixed(2)} m of water`);
  for (const spot of ['bank', 'mosi', 'reed', 'farReed']) assert.ok(toPool(FAR_POOL[spot]) > FAR_POOL.radius + 0.5 && depth(FAR_POOL[spot]) < 0, `${spot} is on dry land by the water`);
  const way = ([x, z]) => Math.atan2(z - FAR_POOL.center[1], x - FAR_POOL.center[0]);
  const apart = Math.abs((((way(FAR_POOL.farReed) - way(FAR_POOL.bank)) * 180) / Math.PI + 540) % 360 - 180);
  assert.ok(apart > 120, `the far reed is across the pool from them: ${apart.toFixed(0)} degrees round it`);
  for (const spot of ['reed', 'farReed']) assert.ok(FAR_POOL.reeds.some(bed => Math.hypot(bed.at[0] - FAR_POOL[spot][0], bed.at[1] - FAR_POOL[spot][1]) < bed.radius), `a bed of reed at ${spot}`);
});

test('the far pool\'s reed: thick and tall across the pool, none in Mosi\'s way out nor on Egill\'s spot, and nothing else grows in it', () => {
  const ground = (x, z) => 5 + x * 0.001 + z * 0.002;
  const { props, clear } = poolPlants(FAR_POOL, ground);
  const near = (p, [x, z], r) => Math.hypot(p.x - x, p.z - z) < r;
  const far = props.filter(p => near(p, FAR_POOL.farReed, 8));
  assert.ok(far.length >= 50, `the far bed: ${far.length} plants`);
  assert.ok(far.filter(p => p.name === 'horsetailTall').length >= far.length * 0.45, 'half of it tall horsetail');
  for (const p of props) {
    assert.ok(['horsetailReed', 'horsetailTall'].includes(p.name) && Number.isInteger(p.variant) && p.variant >= 0, `a known plant: ${p.name} ${p.variant}`);
    assert.equal(p.y, ground(p.x, p.z), 'on the ground');
    assert.ok(!near(p, FAR_POOL.mosi, 1.8) && !near(p, FAR_POOL.bank, 2.2), 'not where Mosi and Egill stand');
  }
  const [bed] = FAR_POOL.reeds;
  const [ax, az] = bed.lane.from, [bx, bz] = bed.lane.to;
  for (let k = 0; k <= 1; k += 0.05) {
    const at = [ax + (bx - ax) * k, az + (bz - az) * k];
    assert.ok(!props.some(p => near(p, at, bed.lane.wide - 0.05)), `Mosi's way out is clear ${k.toFixed(2)} along it`);
    assert.ok(clear.some(c => Math.hypot(c.x - at[0], c.z - at[1]) <= c.r), 'and kept clear of the banks\' own plants');
  }
  for (const b of FAR_POOL.reeds) assert.ok(clear.some(c => c.x === b.at[0] && c.z === b.at[1] && c.r > b.radius), 'no other plant inside a bed');
});

test('the whole chapter plays unattended in order with no warnings, at 16:10 and upright', async () => {
  for (const [shape, play] of [['16:10', playWide], ['upright', playUpright]]) {
    const { task, world, director } = await play();
    assert.equal(task.done, true, `it ends (${shape})`);
    assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
    assert.deepEqual(world.chapterTimeline.map(mark => mark.scene).filter(n => typeof n === 'number'), [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(director.warnings, [], `the director at ${shape}`);
  }
});

// The chapter as it plays for a child who touches nothing, in time (not seeking, as a capture does): the sounds play only so.
let untouched = null;
const playUntouched = () => (untouched ??= playUnattended(kafli4, { seeking: false, limit: 720, shaped: true }));
// The spec (section 1) asks about 7.5 minutes, never over 10, for a child who touches nothing. As built and approved, scenes 1 and 2 run
// 31 and 38 s (the spec says about 45 each), the wind fills by itself in 38 s (its help, Task 13), the flight is 170 s and the pool
// 43 s: some 6.3 minutes. Whether scenes 1 and 2 grow toward the spec's 45 s is the owner's (the ledger's ruling of Task 17).
test('an untouched child finishes in about 6.5 to 7.5 minutes and never over 10', async () => {
  const { world, task, stage } = await playUntouched();
  assert.equal(task.done, true, `the chapter was still going at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  const end = world.chapterTimeline.at(-1);
  assert.equal(end.scene, 'end');
  assert.ok(end.at >= 370 && end.at <= 540, `end=${end.at.toFixed(1)}`);
});

test('the star k4_flugedla is saved once and map piece d is drawn; the book opens on Flugeðla, nodding, then on the map', async () => {
  const { save, moments, book, world, seen } = await playWide();
  assert.equal(save.get().stars.filter(id => id === 'k4_flugedla').length, 1);
  assert.deepEqual(moments.flatMap(moment => moment.ids), ['d'], 'piece d, once: by her star, it ends at her place (engine/book/map-page.js)');
  assert.deepEqual(book.opened.map(([tab]) => tab).slice(-2), ['dinosaurs', 'map'], 'the book opens on the dinosaurs and turns to the map');
  assert.deepEqual(book.nods.slice(-2), ['flugedla', null], 'Flugeðla, new on the Risaeðlur page, nods as it opens');
  // her tile shows by her place (cards.json: flugedla unlocks with the place), which chapter 3's lookout marks; an old chapter 2 save
  // comes here without chapter 3 (save.js defaultChapter), so meeting her marks it too, and the tile that nods is hers, not a shadow
  assert.ok(save.get().places.includes('flugedla'), `her place is on the map: ${save.get().places}`);
  const fromChapter3 = await playIt({ savedWith: s => { ['k1_kambedla', 'k2_thorsedla'].forEach(id => s.addStar(id)); s.addPlace('flugedla'); } });
  assert.equal(fromChapter3.save.get().places.filter(id => id === 'flugedla').length, 1, 'once, if chapter 3 marked it');
  const end = world.chapterTimeline.at(-1).at;
  assert.ok(seen.spokenAt.get('k4_mosi_horn') < end, 'after the last line');
  // No Leikir tile for her: none appears without a game (spec 7), and the book opens no game on her star
  assert.equal(fs.readFileSync(new URL('../engine/book/book.js', import.meta.url), 'utf8').includes('k4_flugedla'), false);
});

test('the flight inside the chapter meets every beat within 0.5 s, and scene 7 takes over as it ends', async () => {
  const { world } = await playWide();
  const flight = world.chapterState.flight.flight;
  for (const [name, at] of Object.entries(BEATS)) {
    if (name === 'END') continue;
    const mark = world.chapterTimeline.find(m => m.scene === name);
    assert.ok(mark && Math.abs(mark.at - flight.started - at) <= 0.5, `${name} at ${mark ? (mark.at - flight.started).toFixed(2) : 'never'} s (beat ${at})`);
  }
  assert.ok(Math.abs(flight.ended - flight.started - BEATS.END) <= 0.5, `the flight ends at ${(flight.ended - flight.started).toFixed(2)} s`);
  const seven = world.chapterTimeline.find(m => m.scene === 7).at;
  assert.ok(seven >= flight.ended - 1e-6 && seven - flight.ended < 0.1, 'scene 7 at once');
});

test('she lands in the far pool with a splash, gliding down from the flight with no jump, and Egill floats down onto its bank', async () => {
  for (const [shape, play] of [['16:10', playWide], ['upright', playUpright]]) {
    const { world, watched } = await play();
    const c = world.chapterState;
    const pool = watched.pool;
    assert.ok(pool.length > 600, `scene 7 watched for ${pool.length} frames`);
    // from the flight's last frame into the glide: no jump, and no stop short (she is still going some 9 m/s)
    const [first, second] = pool;
    assert.ok(first.her.distanceTo(watched.flown) < 0.6, `from the flight's last frame: ${first.her.distanceTo(watched.flown).toFixed(2)} m`);
    assert.ok(second.her.distanceTo(first.her) * 30 > 6, `still gliding: ${(second.her.distanceTo(first.her) * 30).toFixed(1)} m/s`);
    let worst = 0;
    for (let i = 2; i < pool.length; i++) worst = Math.max(worst, Math.abs(pool[i].her.distanceTo(pool[i - 1].her) - pool[i - 1].her.distanceTo(pool[i - 2].her)) * 30);
    assert.ok(worst < 0.8, `her speed never jumps: at most ${worst.toFixed(2)} m/s from one frame to the next (${shape})`);
    // she stands in the shallows, her feet on the bed under the water
    const last = pool.at(-1);
    const bed = world.heightAt(last.her.x, last.her.z);
    assert.ok(toPool(last.her) < FAR_POOL.radius - 1 && bed < FAR_POOL.level - 0.2, `in the pool: ${toPool(last.her).toFixed(1)} m from its middle, ${(FAR_POOL.level - bed).toFixed(2)} m deep`);
    assert.ok(Math.abs(last.her.y - bed) < 0.12, `her feet on the bed: ${(last.her.y - bed).toFixed(2)} m over it`);
    // Egill rides her down, then floats onto the bank and stands there
    assert.equal(first.riding, true, 'on her back as she glides in');
    assert.ok(c.landing.touchAt > 0 && c.landing.floatAt > c.landing.touchAt, 'he floats down once she is down');
    assert.equal(last.riding, false, 'on his own feet at the end');
    assert.ok(toPool(last.egill) > FAR_POOL.radius && Math.abs(last.egill.y - world.heightAt(last.egill.x, last.egill.z)) < 0.1, 'on the bank');
    assert.ok(Math.hypot(last.egill.x - FAR_POOL.bank[0], last.egill.z - FAR_POOL.bank[1]) < 0.5, 'where the pool has him stand');
  }
  // the splash as her feet touch the water, and the float's chime (heard only in time: a capture's seeking play is silent)
  const { world, soundLog } = await playUntouched();
  const c = world.chapterState;
  const splash = soundLog.filter(e => e.scene === 7 && e.name === 'skim');
  assert.equal(splash.length, 1, 'one splash');
  assert.ok(Math.abs(splash[0].at - c.landing.touchAt) < 0.05, 'as she touches the water');
  assert.ok(soundLog.some(e => e.scene === 7 && e.name === 'float' && Math.abs(e.at - c.landing.floatAt) < 0.05), 'with the float\'s chime');
});

test('Mosi comes out of the reed, out of breath, to stand by Egill: "Ég… er… kominn!"', async () => {
  const { world, seen, watched } = await playWide();
  const c = world.chapterState;
  const shown = watched.pool.filter(f => f.mosiShown);
  assert.ok(shown.length > 0, 'Mosi is there');
  const from = shown[0].mosi, to = shown.at(-1).mosi;
  assert.ok(Math.hypot(from.x - FAR_POOL.reed[0], from.z - FAR_POOL.reed[1]) < 1, `out of the reed: from ${from.x.toFixed(1)}, ${from.z.toFixed(1)}`);
  assert.ok(Math.hypot(to.x - FAR_POOL.mosi[0], to.z - FAR_POOL.mosi[1]) < 1, `to Egill's side: ${to.x.toFixed(1)}, ${to.z.toFixed(1)}`);
  const seven = world.chapterTimeline.find(m => m.scene === 7).at;
  const arrived = seen.spokenAt.get('k4_mosi_arrived');
  assert.ok(arrived > seven && arrived >= c.landing.downAt, 'once Egill is down');
});

test('the flight plays its own song from the take-off: the chapter\'s theme goes out under it, the horn sounds in the quiet, and the theme comes back with the last look at the reed', async () => {
  const { world, watched } = await playWide();
  const c = world.chapterState;
  const started = c.flight.flight.started;
  assert.ok(c.song, 'the chapter has the flight\'s song');
  assert.ok(Math.abs(watched.songCue - SONG.at) < 0.05, `${SONG.at} s into it as the flight starts: ${watched.songCue}`);
  const [out, ...rest] = watched.theme;
  assert.ok(out && out.level === 0 && Math.abs(out.t - started) < 0.05 && out.seconds === SONG.themeOut, `the theme goes out as she takes off: ${JSON.stringify(watched.theme)}`);
  assert.deepEqual(rest.map(m => m.level), [1], 'and comes back once, in full');
  assert.ok(rest[0].t > c.horn.at, 'after the horn: with the last look at the reed');
  assert.ok(watched.songAtHorn >= SONG.seconds - 1, `the song has all but ended by the horn: ${watched.songAtHorn?.toFixed(1)} of ${SONG.seconds} s`);
});

test('the horn sounds from the reed across the pool, once, between Mosi\'s coming and their two lines', async () => {
  const { world, seen, soundLog } = await playUntouched(); // heard only in time: a capture's seeking play is silent
  const c = world.chapterState;
  const horns = soundLog.filter(e => e.name === 'sloedlaHorn');
  assert.equal(horns.length, 1, 'once');
  assert.equal(horns[0].scene, 7);
  const at = horns[0].at;
  const said = id => seen.spokenAt.get(id);
  assert.ok(said('k4_mosi_arrived') < at, 'after Mosi has come');
  assert.ok(said('k4_egill_what') >= at + 2.4, `Egill asks once it has sounded: ${(said('k4_egill_what') - at).toFixed(1)} s after`);
  assert.ok(said('k4_mosi_horn') > said('k4_egill_what'), 'and Mosi knows it');
  assert.deepEqual(c.horn.from, FAR_POOL.farReed, 'from the far reed');
  assert.ok(Number.isFinite(horns[0].detail?.pan) && Math.abs(horns[0].detail.pan) <= 1, 'from its side');
});
