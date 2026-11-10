import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import * as kafli2 from '../chapters/kafli2.js';
import * as kafli3 from '../chapters/kafli3.js';
import { chapter as kafli1 } from '../chapters/kafli1.js';
import { createSave, defaultChapter } from '../engine/save.js';
import { LOOKS } from '../engine/looks.js';
import { shapeGround } from '../world/forest/forest.js';
import { planForest } from '../world/forest/plan.js';
import { createSpeciesLibrary, SPECIES } from '../world/forest/species.js';
import { PRESETS } from '../engine/quality.js';
import { LIMITS } from '../engine/camera/director.js';
import { createSfx } from '../engine/audio/sfx.js';
import { SWIM_STROKE } from '../engine/audio/fen-sounds.js';
import { CRITTER_SOUNDS } from '../chapters/kafli3-fen.js';
import { PRINT_ANIMALS, PRINT_SIZE } from '../chapters/kafli2-trail.js';
import {
  SIKI_LAYOUT, SIKI_SHOTS, MOSI_BANK, EGILL_BANK, UGGEDLA_REED, FISHING_SPOTS, FISH_ARC, FERRY_LINE, MOSI_WADE_LINE, HUMMOCK, UGGEDLA_DROP, THORSEDLA_FAR, arriveInSiki,
} from '../chapters/kafli2-siki.js';
import { riseSail, headUpWithFish, catchFish, swimAlong, tailSplash, createBackSeat, BIG_FISH } from '../chapters/kafli2-uggedla.js';
import { fishing, getUp, jumpOrder, jumpPath, FISH_SIZES, JUMP_SECONDS, HINT_AFTER, HELP_AFTER, FISH_COUNT, TAP_RADIUS } from '../chapters/kafli2-fishing.js';
import { createSaddle, ride, floatTo } from '../engine/riding.js';
import { ringsFor } from '../engine/neck-ride.js';
import { waterShape } from '../world/props/water.js';
import { playUnattended } from './chapter-harness.mjs';
import { createFakeContext } from './fake-audio.mjs';
import { WAITING_FOR_VOICE } from './waiting-for-voice.mjs';

// Chapter 2 (remake/chapters/kafli2.js), "Boð til Uggeðlu": its lines, its places as data, the camera rules of its shots, the page's
// choice of chapter from the save, and its script played through by nobody (tests/chapter-harness.mjs). Since the split of 31 October
// 2026 it is the glade, the trail and Síkið (the flooded channel, kafli2-siki.js), and ends in black at the water's edge in Síkið until
// the scenes after the footprints are built (the plan's next tasks); the Fen is chapter 3's (kafli3.test.mjs).

const { chapter } = kafli2;
const file = relative => new URL(relative, import.meta.url);
const readJson = relative => JSON.parse(fs.readFileSync(file(relative), 'utf8'));
const SOURCE = readJson('../assets/audio/kafli2/lines-source.json');
const RECORDED = readJson('../assets/audio/lines.json');
// The script, with its pieces: the trail's (kafli2-trail.js), which speaks lines of its own, and Síkið's (kafli2-siki.js).
const CHAPTER_TEXT = ['kafli2', 'kafli2-trail', 'kafli2-siki', 'kafli2-uggedla'].map(name => fs.readFileSync(file(`../chapters/${name}.js`), 'utf8')).join(''); // each ends in a newline
const MAIN_TEXT = fs.readFileSync(file('../main.js'), 'utf8');

// Every line has its recording (the kafli2 set, recorded 2026-10-21). A line added before the controller records it fails here,
// named, unless it is in WAITING_FOR_VOICE (tests/waiting-for-voice.mjs: the lines new to the chapters, timed by their words until the
// plan's seventh task records them; the test tells which wait, and a waiting line that has its recording fails, so the set empties as they
// come); setting this false while lines wait for their recording names them and marks the test skipped instead.
const RECORDINGS_REQUIRED = true;

const words = text => text.replace(/\[[^\]]*\]\s*/g, '').trim(); // what is said, without the voice's tags

// ---------------------------------------------------------------------------------------------
// The lines

test('every chapter line has a recording and the source\'s words', t => {
  const source = new Map(SOURCE.map(line => [line.id, line]));
  // Each line of the chapter is one of the source's (kafli3.test.mjs holds the set whole), read from its own recording, with the
  // words it is recorded with.
  for (const [id, line] of Object.entries(chapter.lines)) {
    const entry = source.get(id);
    assert.ok(entry, `${id} is not a line of the kafli2 set (kafli2/lines-source.json)`);
    assert.match(id, new RegExp(`^k2_${entry.speaker}_[a-z0-9_]+$`), `${id} names its speaker, ${entry.speaker}`);
    assert.ok(chapter.cast[entry.speaker], `${entry.speaker} speaks ${id} but has no caption name`);
    assert.deepEqual(line, { text: words(entry.text), audio: id }, `${id} says what the source says, from its own recording`);
  }
  // The counts are the chapter's own, one voice from one to ten, said as a footprint (fótspor) is counted.
  const counts = ['Eitt!', 'Tvö!', 'Þrjú!', 'Fjögur!', 'Fimm!', 'Sex!', 'Sjö!', 'Átta!', 'Níu!', 'Tíu!'];
  counts.forEach((text, i) => assert.equal(chapter.lines[`k2_mosi_${i + 1}`]?.text, text, `Mosi counts ${i + 1}`));
  // Whatever the script names as a line is one of them.
  for (const [, id] of CHAPTER_TEXT.matchAll(/'(k2_(?:mosi|egill|thorsedla|kambedla|uggedla)_[a-z0-9_]+)'/g)) {
    assert.ok(chapter.lines[id], `the script names '${id}', which is not one of its lines`);
  }
  // Each recording there is is the set's own; a line not recorded yet is named.
  const unrecorded = [], waiting = [];
  for (const [id, line] of Object.entries(chapter.lines)) {
    const entry = RECORDED[line.audio];
    if (!entry) (WAITING_FOR_VOICE.has(id) ? waiting : unrecorded).push(id);
    else {
      assert.equal(entry.src, `assets/audio/kafli2/${line.audio}.mp3`, `${id} is recorded in the kafli2 set`);
      assert.ok(!WAITING_FOR_VOICE.has(id), `${id} has its recording now: take it out of WAITING_FOR_VOICE`);
    }
  }
  if (waiting.length) t.diagnostic(`${waiting.length} chapter 2 lines wait for their voice and are timed by their words: ${waiting.join(', ')}`);
  if (unrecorded.length) {
    const message = `${unrecorded.length} of ${Object.keys(chapter.lines).length} chapter 2 lines have no recording in lines.json yet `
      + `(node remake/tools/voice-lines.mjs --set kafli2 records them): ${unrecorded.slice(0, 5).join(', ')}${unrecorded.length > 5 ? ', …' : ''}`;
    if (RECORDINGS_REQUIRED) assert.fail(message);
    t.skip(message);
  }
});

// ---------------------------------------------------------------------------------------------
// The chapter as data

test('locations as data: the glade, the trail and Síkið, with who stands where and the shots of each', () => {
  assert.equal(chapter.id, 'kafli2');
  assert.equal(chapter.title, 'Boð til Uggeðlu');
  assert.equal(chapter.next, 'kafli3', 'Boð til Þórseðlu follows');
  assert.equal(chapter.look, 'lateMorning');
  assert.ok(LOOKS[chapter.look], 'a look engine/looks.js has, not the morning an unknown name falls back to');
  assert.equal(LOOKS[chapter.look].sun.azimuth, 150, "the sun a little further round than chapter 1's");
  assert.equal(LOOKS[chapter.look].sun.elevation, 26, 'and a little lower');
  assert.equal(chapter.theme, 'kafli2/theme.json', 'Dino Trail, the song of both chapters');
  assert.equal(chapter.start, 'burknalaut');
  assert.deepEqual(Object.keys(chapter.locations), ['burknalaut', 'fenjaslod', 'siki'], 'in the order the story goes');
  assert.deepEqual(chapter.prepare, ['fenjaslod', 'siki'], 'the trail and Síkið are built behind the start button, in that order');
  // Five actors, all made at load (before the start button): Uggeðla and Þórseðla wait hidden for Síkið, where they are placed. The
  // cast (the captions' names) is the four who speak so far: Uggeðla's first lines are the fishing's.
  assert.deepEqual(Object.keys(chapter.actors).sort(), ['egill', 'kambedla', 'mosi', 'thorsedla', 'uggedla']);
  assert.match(chapter.actors.uggedla.url, /spinosaurus\.glb$/);
  assert.match(chapter.actors.thorsedla.url, /brontosaurus\.glb$/);
  assert.deepEqual(Object.keys(chapter.cast).sort(), ['egill', 'kambedla', 'mosi', 'uggedla']);
  assert.equal(chapter.cast.uggedla.colour, '#2f6a65', 'the dark tone of her teal');
  // Who stands in each place: Mosi everywhere, Kambeðla only in her glade, Uggeðla and Þórseðla only in Síkið.
  const standing = name => Object.keys(chapter.locations[name].layout.actors ?? {});
  const has = (name, actor) => standing(name).some(key => key === actor || key.startsWith(`${actor}_`));
  for (const name of Object.keys(chapter.locations)) assert.ok(has(name, 'mosi'), `${name} says where Mosi stands`);
  assert.deepEqual(Object.keys(chapter.locations).filter(name => has(name, 'kambedla')), ['burknalaut']);
  assert.deepEqual(Object.keys(chapter.locations).filter(name => has(name, 'uggedla')), ['siki']);
  assert.deepEqual(Object.keys(chapter.locations).filter(name => has(name, 'thorsedla')), ['siki'], 'Þórseðla stands far off in Síkið (the Fen of chapter 3 is its own chapter\'s)');
  // The glade is chapter 1's, grown as the child left it: its layout, and its shots kept clear, with chapter 2's own besides.
  const glade = chapter.locations.burknalaut;
  assert.equal(glade.layout, kafli1.locations.burknalaut.layout);
  for (const [label, shot] of Object.entries(kafli1.locations.burknalaut.shots)) assert.equal(glade.shots[label], shot, `chapter 1's ${label}`);
  for (const [name, { layout, shots }] of Object.entries(chapter.locations)) {
    assert.ok(Number.isInteger(layout.seed) && layout.clearing?.radius > 0 && layout.path?.length >= 2, `${name} has a forest to grow`);
    assert.ok(Object.keys(shots).length >= 6, `${name} keeps its shots clear: at least six in its own shots`);
  }
  // A name in two places, or in the chapter's own shots as well, would overwrite the other silently (main.js).
  const names = [...Object.keys(chapter.shots), ...Object.values(chapter.locations).flatMap(location => Object.keys(location.shots))];
  assert.equal(new Set(names).size, names.length, 'every shot has a name of its own');
  assert.ok(chapter.locations[chapter.start].shots[chapter.startShot], 'the start shot is in the start place');
  assert.equal(chapter.startShot, 'glade_leaving');
});

// The ground of a place, as its forest builds it (the floor rises away from a clearing; the Fen's water is dug out of it and
// its hummocks raised: world/forest/forest.js, shapeGround).
const groundOf = name => {
  const { layout, shots } = chapter.locations[name];
  return shapeGround({ chapter }, { ...layout, shots }, layout.seed).terrain;
};

// ---------------------------------------------------------------------------------------------
// Síkið (kafli2-siki.js): a channel flooded over the path, in the Fen's look

const lengthOf = points => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
/** A point `back` metres before the end of a polyline, along it. */
function beforeEnd(points, back) {
  let left = back;
  for (let i = points.length - 1; i > 0; i--) {
    const leg = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
    if (left <= leg) {
      const t = left / leg;
      return [points[i][0] + (points[i - 1][0] - points[i][0]) * t, points[i][1] + (points[i - 1][1] - points[i][1]) * t];
    }
    left -= leg;
  }
  return [...points[0]];
}
/** The line and the middle of each leg of it, so that a leg cannot cut a corner through shallow water or dry land. */
const withMiddles = points => points.flatMap((p, i) => (i ? [[(p[0] + points[i - 1][0]) / 2, (p[1] + points[i - 1][1]) / 2], p] : [p]));
const nearestOf = (point, points) => Math.min(...points.map(p => Math.hypot(p[0] - point[0], p[1] - point[1])));
const xz = point => [point.position[0], point.position[2]];
const SIKI_SHOT_NAMES = ['siki_arrive', 'siki_flooded', 'siki_sail', 'siki_fishing', 'siki_two_shot', 'siki_star', 'ferry_side', 'ferry_front', 'ferry_back', 'siki_hummocks', 'siki_portrait'];

test('Síkið as data: the path goes under the channel, a ferry line of 50 m runs in deep water, a shallow edge beside it and dry hummocks at its end', () => {
  const siki = chapter.locations.siki;
  assert.ok(siki, 'the chapter has Síkið');
  assert.equal(siki.layout, SIKI_LAYOUT);
  assert.equal(siki.shots, SIKI_SHOTS);
  const { layout } = siki;
  assert.equal(layout.seed, 13, 'its own seed, so the trail\'s and the Fen\'s plants are dealt as they were');
  assert.equal(layout.biome, 'fen', 'in the Fen\'s look');
  const { channel } = layout.water;
  assert.ok(channel.width >= 6 && channel.width <= 8, `the channel is ${channel.width} m wide`);
  assert.ok(channel.depth >= 1.1, `and ${channel.depth} m deep in the middle`);
  for (const name of SIKI_SHOT_NAMES) {
    assert.ok(siki.shots[name], `the shot ${name} is set in Síkið`);
  }
  const ground = shapeGround({ chapter }, { ...layout, shots: siki.shots }, layout.seed); // the ground as the forest digs it
  const shape = waterShape(layout.water);
  const depth = ([x, z]) => ground.layout.water.depthAt(x, z);
  // The path comes in from the north-west and the water has flooded its last four metres.
  const { path } = layout;
  assert.ok(shape.signedAt(...path[0]) > 8, 'the path starts on dry ground');
  assert.ok(shape.signedAt(...path.at(-1)) < 0, 'and ends in the water');
  for (let back = 0; back <= 4; back += 0.5) {
    const at = beforeEnd(path, back);
    assert.ok(shape.signedAt(...at) < 0, `${back} m before its end the path is under water (${shape.signedAt(...at).toFixed(2)})`);
  }
  // Mosi stops on the bank, nose at the water, on the path.
  assert.ok(shape.signedAt(...xz(MOSI_BANK)) > 2.5, 'Mosi\'s middle is on dry ground');
  assert.ok(Math.min(...path.map(p => Math.hypot(p[0] - MOSI_BANK.position[0], p[1] - MOSI_BANK.position[2]))) < 1.5, 'on the path');
  // The ferry line: 40 to 60 m along the channel, deep enough all the way for her to swim with her belly in the water.
  const ferryLength = lengthOf(FERRY_LINE);
  assert.ok(ferryLength >= 40 && ferryLength <= 60, `the ferry line is ${ferryLength.toFixed(1)} m long`);
  for (const point of withMiddles(FERRY_LINE)) assert.ok(depth(point) >= 1, `the ferry line is ${depth(point).toFixed(2)} m deep at ${point.map(v => v.toFixed(1))}`);
  // Mosi's line beside it, on the shallow edge: the water between his ankles and his knees, clear of her.
  assert.ok(lengthOf(MOSI_WADE_LINE) >= 35, 'Mosi wades most of the way');
  for (const point of withMiddles(MOSI_WADE_LINE)) {
    assert.ok(depth(point) >= 0.3 && depth(point) <= 0.6, `Mosi wades in ${depth(point).toFixed(2)} m of water at ${point.map(v => v.toFixed(1))}`);
    const apart = nearestOf(point, withMiddles(FERRY_LINE));
    assert.ok(apart >= 3 && apart <= 6, `and ${apart.toFixed(1)} m from her line`);
  }
  // She lies low in the reed across the channel from Mosi, 10 to 16 m from him, with the water between.
  const across = Math.hypot(UGGEDLA_REED.position[0] - MOSI_BANK.position[0], UGGEDLA_REED.position[2] - MOSI_BANK.position[2]);
  assert.ok(across >= 10 && across <= 16, `Uggeðla's reed is ${across.toFixed(1)} m from Mosi`);
  const between = [0.35, 0.5, 0.65].map(t => [MOSI_BANK.position[0] + (UGGEDLA_REED.position[0] - MOSI_BANK.position[0]) * t, MOSI_BANK.position[2] + (UGGEDLA_REED.position[2] - MOSI_BANK.position[2]) * t]);
  assert.ok(between.some(p => shape.signedAt(...p) < -1), 'the channel lies between them');
  assert.ok(Math.abs(shape.signedAt(...xz(UGGEDLA_REED))) <= 1.2, 'she lies on the far bank\'s edge, in the shallows');
  // The fish jump in the open water in front of her, where her neck reaches them in a step at most (her snout reaches 5.2 m from her
  // middle without one, and a catch takes 3 s or less), and the reed's rows in the shallows are further from them than the fish are long.
  assert.ok(FISHING_SPOTS.length >= 5, `${FISHING_SPOTS.length} fishing spots`);
  for (const spot of FISHING_SPOTS) {
    assert.ok(depth(spot) >= 0.8, `a fish jumps from ${depth(spot).toFixed(2)} m of water`);
    const reach = Math.hypot(spot[0] - xz(UGGEDLA_REED)[0], spot[1] - xz(UGGEDLA_REED)[1]);
    assert.ok(reach >= 4 && reach <= 6.8, `${reach.toFixed(1)} m from her middle`);
  }
  // The hummocks at the end of the channel are dry, and she stops in deep water beside them.
  const dry = ([x, z]) => shape.signedAt(x, z) > 0.5 && ground.terrain.heightAt(x, z) > shape.level;
  assert.ok(dry(xz(HUMMOCK)), 'Mosi\'s hummock is dry ground above the water');
  assert.ok(depth(xz(UGGEDLA_DROP)) >= 1, 'Uggeðla stops in deep water');
  assert.ok(Math.hypot(...xz(HUMMOCK).map((v, i) => v - xz(UGGEDLA_DROP)[i])) <= 12, 'by the hummock');
  assert.ok(nearestOf(xz(UGGEDLA_DROP), FERRY_LINE) < 3 && nearestOf(xz(HUMMOCK), MOSI_WADE_LINE) < 6, 'the lines end at the hummocks');
  // Þórseðla stands far off, ahead of the ferry's last stretch, on dry ground.
  const end = FERRY_LINE.at(-1), before = beforeEnd(FERRY_LINE, 12);
  const [fx, fz] = xz(THORSEDLA_FAR);
  const away = Math.hypot(fx - xz(HUMMOCK)[0], fz - xz(HUMMOCK)[1]);
  // far off, but not so far that the Fen's mist washes her out: the plan's 80 to 120 m left her a pale ghost from the ferry (at 84 m her neck
  // and head were hardly to be told from the haze), and from 25 to 60 m beyond the hummocks they stand out over her trees. Nearer than 25 m she would be a neighbour, not far off.
  assert.ok(away >= 25 && away <= 60, `Þórseðla is ${away.toFixed(0)} m beyond the hummocks: far off, but near enough to read through the mist`);
  const heading = (Math.atan2(end[1] - before[1], end[0] - before[0]) * 180) / Math.PI;
  const bearing = (Math.atan2(fz - end[1], fx - end[0]) * 180) / Math.PI;
  const off = Math.abs(((bearing - heading + 540) % 360) - 180);
  assert.ok(off < 30, `she is ${off.toFixed(0)} degrees off the way the ferry is going`);
  assert.ok(shape.signedAt(fx, fz) > 5, 'on dry ground');
});

test('Síkið keeps its camera shots clear for a tablet held upright too: no plant stands near a camera, and none big in the view of the ground in front of it', () => {
  // A tall screen keeps the 16:10 frame's width and shows more above and below it (the director's lens), so the ground at the camera's
  // feet is in the picture: the planner protects each static shot a second time for it (layout.tall, world/forest/plan.js).
  const place = chapter.locations.siki, world = { chapter };
  const { layout, terrain } = shapeGround(world, { ...place.layout, shots: place.shots }, place.layout.seed);
  const plan = planForest({ world, layout, seed: place.layout.seed, terrain, library: createSpeciesLibrary(place.layout.seed), q: PRESETS.tablet });
  const own = new Set(layout.plants.map(p => [p.position[0], p.position[1]].join())); // the place's own reed, lilies and trees go where it says
  const fixed = Object.entries(place.shots).filter(([, shot]) => Array.isArray(shot.position) && Array.isArray(shot.target));
  assert.ok(fixed.length >= 7, 'the static shots');
  for (const [name, shot] of fixed) {
    const tanH = Math.tan(THREE.MathUtils.degToRad(shot.fov / 2)) * 1.6;
    const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(tanH / 0.625)), 0.625, 0.1, 100); // 800 x 1280
    camera.position.fromArray(shot.position);
    camera.lookAt(new THREE.Vector3().fromArray(shot.target));
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const view = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const p of plan.placements) {
      const crown = p.model.crown;
      if (!crown || own.has([p.x, p.z].join())) continue;
      const tall = Boolean(SPECIES[p.name]?.tall);
      const radius = (tall ? Math.min(crown.r, crown.ry * 1.2) * 0.95 : Math.max(crown.r, crown.ry)) * p.scale;
      const centre = new THREE.Vector3(p.x + crown.c[0] * p.scale, p.y + crown.c[1] * p.scale, p.z + crown.c[2] * p.scale);
      assert.ok(centre.distanceTo(camera.position) >= radius + 3, `a ${p.name} at ${p.x.toFixed(1)}, ${p.z.toFixed(1)} stands within 3 m of ${name}'s camera`);
      const depth = -centre.clone().applyMatrix4(camera.matrixWorldInverse).z;
      if (radius >= 0.6 && depth < 8) assert.ok(!view.containsPoint(centre), `a ${p.name} of ${radius.toFixed(1)} m at ${p.x.toFixed(1)}, ${p.z.toFixed(1)} has its middle in ${name}'s upright view, within 8 m of the camera`);
    }
  }
});

test('every shot keeps the camera rules over its ground', () => {
  for (const [name, { shots }] of Object.entries(chapter.locations)) {
    const ground = groundOf(name);
    for (const [label, shot] of Object.entries(shots)) {
      assert.ok(shot.fov >= LIMITS.lens[0] && shot.fov <= LIMITS.lens[1], `${label}: a ${shot.fov} degree lens`);
      if (!Array.isArray(shot.position)) continue; // it follows an actor: the run checks it (no director warnings)
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
// The hand-over from chapter 1

test('the default chapter follows the stars: Kambeðla\'s, then Uggeðla\'s, and an old chapter 2 save meets Uggeðla', () => {
  const saveWith = stars => {
    const save = createSave(null);
    for (const star of stars) save.addStar(star);
    return save;
  };
  assert.equal(defaultChapter(saveWith([])), 'kafli1', 'a new child starts at the beginning');
  assert.equal(defaultChapter(saveWith(['k1_kambedla'])), 'kafli2', "with Kambeðla's star, chapter 2");
  assert.equal(defaultChapter(saveWith(['k1_kambedla', 'k2_thorsedla'])), 'kafli2', 'an old chapter 2 save meets Uggeðla');
  assert.equal(defaultChapter(saveWith(['k1_kambedla', 'k2_uggedla'])), 'kafli3', "with Uggeðla's star, chapter 3");
  assert.equal(defaultChapter(saveWith(['k1_kambedla', 'k2_uggedla', 'k2_thorsedla'])), 'kafli4', "with Þórseðla's star, chapter 4");
  // The page asks it when its address names no chapter; ?chapter= still says which.
  assert.match(MAIN_TEXT, /params\.get\('chapter'\)\s*\|\|\s*defaultChapter\(save\)/);
});

test('chapter 1 hands over to chapter 2, chapter 2 to chapter 3 and chapter 3 to chapter 4 with an "Áfram" when the script ends', () => {
  assert.equal(kafli1.next, 'kafli2', 'chapter 1 names the next');
  assert.equal(chapter.next, 'kafli3', 'chapter 2 names chapter 3');
  assert.equal(kafli3.chapter.next, 'kafli4', 'chapter 3 names chapter 4');
  // main.js: when the script's task is done (and did not fail), a raised "Áfram" pill goes after the book and leads to ?chapter=<next>
  const main = MAIN_TEXT.replace(/\r\n/g, '\n');
  assert.match(main, /scriptTask = stage\.start\(chapter\.script\)/, 'the page keeps the script\'s task');
  assert.match(main, /if \(handedOver \|\| !chapter\.next \|\| !scriptTask\?\.done \|\| scriptTask\.failed \|\| scriptTask\.cancelled\) return;/, 'only a chapter that names the next, once its script has ended');
  assert.match(main, /next\.set\('chapter', chapter\.next\)/, 'its address names the next chapter');
  assert.match(main, /className = 'next-chapter'/);
  assert.match(main, /<span>Áfram<\/span>/, 'and it says Áfram');
  assert.match(main, /document\.getElementById\('book'\)\.after\(button\)/, 'over the book, under the games it opens');
  const css = fs.readFileSync(file('../book.css'), 'utf8');
  assert.match(css, /\.next-chapter \{[^}]*min-height: var\(--book-target\)/, 'a pill the size of the book\'s controls');
  // and the Leikir page builds Háls og hali's board only once it is open: Þórseðla's star, or a game of it under way (book.js halsOpen)
  assert.match(main, /import \{ createBook, halsOpen \} from '\.\/engine\/book\/book\.js';/);
  assert.match(main, /if \(tab === 'games' && halsOpen\(save\)\) setTimeout\(\(\) => hals\.prewarm\(\), 900\)/);
});

// ---------------------------------------------------------------------------------------------
// Played through by nobody

const COUNTS = ['Eitt!', 'Tvö!', 'Þrjú!', 'Fjögur!', 'Fimm!', 'Sex!', 'Sjö!', 'Átta!', 'Níu!', 'Tíu!'];
const sceneStart = (world, n) => world.chapterTimeline.find(mark => mark.scene === n)?.at;

// The seconds the chapter may take for a child who taps nothing: seven and a half minutes (the spec's own limit, section 1). Until
// the scenes after the footprints are built (the plan's next tasks) the chapter ends in the trail, long before.
const IDLE_LIMIT = 450;

// The chapter played as a capture seeks it (the harness's default), once, for the tests that only look at what happened.
let played = null;
const playCapture = () => (played ??= playUnattended(kafli2, { limit: IDLE_LIMIT, shaped: true }));

// The chapter as it plays for a child who taps nothing, once, with how dark the picture was in its last frame and, from scene 3 on, what
// the scenes did frame by frame (`probes.frames`: where she, Mosi and Egill were, her sail and head, the camera, Þórseðla's head), the
// marker's flight to the map (`probes.place`) and the star's rise (`probes.star`: the calls the script made).
let idled = null;
function playIdle() {
  idled ??= (async () => {
    const last = { fade: 0 };
    const probes = { frames: [], place: [], star: [] };
    let wrapped = false, parts = null;
    const sample = (world, name) => world.actors.get(name);
    const run = await playUnattended(kafli2, {
      seeking: false, limit: IDLE_LIMIT, shaped: true,
      onFrame({ ui, world, stage, pointer, shot }) {
        last.fade = ui.fadeLevel;
        const s = stage.s;
        if (!wrapped) {
          wrapped = true;
          const { place, star } = s;
          s.place = (id, from) => {
            const her = world.actors.get('uggedla');
            world.camera.updateMatrixWorld();
            const ndc = her.headPosition(new V3()).project(world.camera);
            probes.place.push({ id, from, at: s.time, head: { x: ((ndc.x + 1) / 2) * 1280, y: ((1 - ndc.y) / 2) * 800 } });
            return place(id, from);
          };
          s.star = (id, spec) => {
            const her = world.actors.get('uggedla');
            her.root.updateMatrixWorld(true);
            parts ??= herParts(her);
            let top = null;
            for (const i of parts.sail) {
              const at = parts.mesh.getVertexPosition(i, new V3()).applyMatrix4(parts.mesh.matrixWorld);
              if (!top || at.y > top.y) top = at;
            }
            probes.star.push({ id, at: s.time, point: world.resolvePoint(spec, new V3()), top });
            return star(id, spec);
          };
        }
        const scene = world.chapterTimeline.at(-1)?.scene ?? 0;
        if (scene < 3) return;
        const c = world.chapterState;
        const her = sample(world, 'uggedla'), mosi = sample(world, 'mosi'), egill = sample(world, 'egill'), thorsedla = sample(world, 'thorsedla');
        const water = world.forest?.water;
        const frame = {
          t: s.time, scene, shot, sink: c.uggedlaRig?.v.sink, tuck: c.uggedlaRig?.v.tuck, visible: her.root.visible, her: her.root.position.clone(),
          heading: her.heading, mosi: mosi.root.position.clone(), mosiHeading: mosi.heading, depth: water?.depthAt(mosi.root.position.x, mosi.root.position.z),
          egill: egill.root.position.clone(), egillControlled: egill.controlled, sailTarget: pointer.targets.has('sail'),
          seat: c.backSeat ? c.backSeat.seat.clone() : null, saddle: scene === 7 ? c.saddle.update().clone() : null,
        };
        if (scene >= 6) {
          her.root.updateMatrixWorld(true);
          frame.hips = her.model.getObjectByName('Hips').getWorldPosition(new V3());
          world.camera.updateMatrixWorld();
          frame.camera = world.camera.position.clone();
          frame.thorsedlaHead = thorsedla.headPosition(new V3());
          frame.thorsedlaNdc = frame.thorsedlaHead.clone().project(world.camera);
          frame.herMiddle = her.centre(new V3());
          frame.herPoints = [her.root.position, her.headPosition(new V3()), her.model.getObjectByName('Tail6').getWorldPosition(new V3()), frame.hips]
            .map(point => point.clone().project(world.camera));
        }
        probes.frames.push(frame);
      },
    });
    return { ...run, last, probes };
  })();
  return idled;
}

const SIX = ['k2_uggedla_aboard', 'k2_mosi_brrr', 'k2_uggedla_wet', 'k2_egill_sail', 'k2_uggedla_sail', 'k2_mosi_onlyabit', 'k2_uggedla_tail', 'k2_mosi_wetter', 'k2_egill_head'];
const THREE_LINES = ['k2_mosi_flooded', 'k2_egill_across', 'k2_mosi_boat', 'k2_egill_helloboat', 'k2_mosi_notboat', 'k2_uggedla_hello'];
const textOf = id => chapter.lines[id].text;
/** When a line was captioned, in scene time. */
const saidAt = (run, id) => run.captions.find(caption => caption.text === textOf(id))?.at;
const framesIn = (run, from, to) => run.probes.frames.filter(frame => frame.t >= from && frame.t < to);

test('the chapter plays its seven scenes unattended, one after the other, and ends in the book in at most 450 s with no director warnings', async t => {
  const { task, stage, world, director, journal } = await playIdle();
  assert.equal(task.done, true, `the chapter was still going at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.ok(stage.s.time <= IDLE_LIMIT, `it took ${stage.s.time.toFixed(1)} s`);
  assert.deepEqual(world.chapterTimeline.map(mark => mark.scene), [1, 2, 3, 4, 5, 6, 7], 'the glade, the footprints, the channel, the fishing, the invitation, the ferry and the hummocks');
  const starts = world.chapterTimeline.map(mark => mark.at);
  t.diagnostic(`scenes: ${starts.map((at, i) => `${i + 1}: ${((starts[i + 1] ?? stage.s.time) - at).toFixed(0)} s`).join(', ')}; the chapter ${stage.s.time.toFixed(0)} s`);
  assert.equal(world.location, 'siki', 'the ferry and the hummocks are in Síkið');
  assert.deepEqual(journal.stars, ['k2_uggedla'], 'Uggeðla\'s star is in the book (the old Þórseðla\'s is chapter 3\'s)');
  assert.deepEqual([...journal.places], ['uggedla'], 'and she is on the map');
  assert.deepEqual(director.warnings, [], 'the camera keeps the style guide\'s rules');
});

// The trail's end is the arrival in Síkið (kafli2-siki.js: arriveInSiki): the trail's prints let go of, Mosi coming down the path to the
// water, Uggeðla lying low across it (hidden until her pose is built), Þórseðla far off in the trees, alive, and the Fen's water sounds.
test('Síkið: Mosi comes down the path to the water, Uggeðla lies low in her reed, Þórseðla stands far off, and the trail is let go of', async () => {
  const run = await playIdle();
  const { world, soundLog, seen } = run;
  const c = world.chapterState;
  // Mosi stands at the flooded path with his nose at the water, Egill in the saddle on his back, as the first words are said
  const flooded = framesIn(run, saidAt(run, 'k2_mosi_flooded'), Infinity)[0];
  const [bx, bz] = xz(MOSI_BANK);
  assert.ok(Math.hypot(flooded.mosi.x - bx, flooded.mosi.z - bz) < 1, 'Mosi stands at the flooded path with his nose at the water');
  assert.ok(Math.abs(((flooded.mosiHeading - MOSI_BANK.heading + 540) % 360) - 180) < 8, `facing the water (${flooded.mosiHeading.toFixed(0)} degrees)`);
  assert.ok(Math.hypot(flooded.egill.x - flooded.mosi.x, flooded.egill.z - flooded.mosi.z) < 2, 'with Egill in the saddle on his back');
  assert.equal(world.actors.get('kambedla').root.visible, false, 'Kambeðla stayed in her glade');
  // Uggeðla is seen, lying low in the reed, until she gets up
  const [ux, uz] = xz(UGGEDLA_REED);
  assert.equal(flooded.visible, true, 'Uggeðla lies low in the reed: seen, her sail over it');
  assert.ok(Math.hypot(flooded.her.x - ux, flooded.her.z - uz) < 0.3, 'at her reed');
  assert.ok(flooded.sink > 3, 'her root deep under the water: she lies low');
  assert.ok(c.life && c.uggedlaRig.life, 'and she lives there: her life goes on from the arrival');
  const thorsedla = world.actors.get('thorsedla');
  assert.equal(thorsedla.root.visible, true, 'Þórseðla is there');
  const [tx, tz] = xz(THORSEDLA_FAR);
  assert.ok(Math.hypot(thorsedla.root.position.x - tx, thorsedla.root.position.z - tz) < 0.3, 'far off, where Síkið puts her');
  assert.ok(c.life && c.life.log.length >= 1, 'and alive: she nods or bites the treetop as she does in the Fen');
  assert.equal(c.prints, null, 'the trail\'s prints are let go of');
  assert.equal(c.printCritters, null, 'and their animals');
  assert.ok(soundLog.filter(e => e.name === 'fen').length >= 1, 'the Fen\'s water sounds go on');
  assert.ok(seen.cuts.some(cut => cut.shot === 'siki_arrive'), 'the scene comes to Síkið on its arrival shot');
});

// main.js builds the trail once the start button shows, a slice at a time: a child who taps at once comes to it before it is
// there. Here the trail takes 1.5 s to build (long before the glade's scene goes there), and then 12 s (longer than the black waits).
test('no scene plays in a place still being built: the glade waits under the black for the trail', async () => {
  const shotsOf = Object.fromEntries(Object.entries(chapter.locations).map(([name, location]) => [name, new Set(Object.keys(location.shots))]));
  const placeOf = shot => Object.keys(shotsOf).find(name => shotsOf[name].has(shot)) ?? null; // null: a shot made as it goes
  const visible = []; // every frame the picture shows (not under the black)
  const { task, stage, world, director, builds } = await playUnattended(kafli2, {
    seeking: false, limit: IDLE_LIMIT, slowBuilds: { fenjaslod: 1.5 },
    onFrame({ t, world, ui, shot }) {
      if (ui.fadeLevel >= 0.999) return;
      visible.push({ t, location: world.location, shot });
    },
  });
  assert.equal(task.done, true, `the chapter was still going at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.deepEqual(world.chapterTimeline.map(mark => mark.scene), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(director.warnings, [], 'the camera keeps the style guide\'s rules');
  assert.ok(visible.length > 1000);
  // the glade fades in from black only once the trail is built
  assert.ok(builds.fenjaslod.built > 1.49, `the trail was built at ${builds.fenjaslod.built} s`);
  assert.ok(visible[0].t >= builds.fenjaslod.built, `the glade showed at ${visible[0].t.toFixed(2)} s, the trail built at ${builds.fenjaslod.built.toFixed(2)} s`);
  // every frame shown is of a place built, framed by a shot of that place
  for (const frame of visible) {
    const build = builds[frame.location];
    assert.ok(build && build.built !== null && build.built <= frame.t, `${frame.location} showed at ${frame.t.toFixed(2)} s before it was built`);
    const place = placeOf(frame.shot);
    assert.ok(place === null || place === frame.location, `${frame.shot} (a shot of ${place}) showed in ${frame.location} at ${frame.t.toFixed(2)} s`);
  }
  assert.ok(visible.some(v => v.location === 'fenjaslod'), 'and the trail showed');
});

// Síkið is built behind the start button too (chapter.prepare), but the scene comes to it minutes later: the slow device is one whose build
// of it failed or is not done by then. Its first build fails here (the change of place builds it again, as locations.js has it) and
// then takes 5 s: the scene after the trail does not start until Síkið is built, and shows nothing of it before.
test('no scene plays in Síkið still being built: the trail waits under the black for it', async () => {
  const visible = []; // every frame the picture shows (not under the black)
  const { task, stage, world, director, builds } = await playUnattended(kafli2, {
    seeking: false, limit: IDLE_LIMIT, failBuilds: { siki: 1 }, slowBuilds: { siki: 5 },
    onFrame({ t, world, ui, shot }) {
      if (ui.fadeLevel >= 0.999) return;
      visible.push({ t, location: world.location, shot });
    },
  });
  assert.equal(task.done, true, `the chapter was still going at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.deepEqual(director.warnings, [], 'the camera keeps the style guide\'s rules');
  assert.equal(builds.siki.failed, 1, 'the build ahead failed');
  assert.ok(builds.siki.asked > 60, `and the change of place asked for it again, at ${builds.siki.asked.toFixed(1)} s`);
  assert.ok(builds.siki.built - builds.siki.asked > 4.99, `which took ${(builds.siki.built - builds.siki.asked).toFixed(1)} s`);
  assert.equal(world.location, 'siki');
  const inSiki = visible.filter(v => v.location === 'siki');
  assert.ok(inSiki.length > 60, 'Síkið showed');
  assert.ok(inSiki[0].t >= builds.siki.built, `it showed at ${inSiki[0].t.toFixed(2)} s, built at ${builds.siki.built.toFixed(2)} s`);
  // the trail was in view until the black came down for Síkið, and no shot of Síkið was framed over another place
  const lastTrail = visible.filter(v => v.location === 'fenjaslod').at(-1);
  assert.ok(lastTrail.t < builds.siki.asked + 0.5, 'the black came down as the scene went there');
  assert.ok(visible.filter(v => v.location !== 'siki').every(v => !SIKI_SHOT_NAMES.includes(v.shot)), 'no shot of Síkið was shown over another place');
  assert.ok(inSiki.some(v => v.shot === 'siki_arrive' || v.shot === 'siki_flooded'), 'and the arrival\'s shot showed in it');
});

test('a trail whose build fails while the start\'s black waits: the glade plays, and the change of place builds it again', async () => {
  const visible = [];
  const { task, world, builds } = await playUnattended(kafli2, {
    seeking: false, limit: 40, failBuilds: { fenjaslod: 1 }, slowBuilds: { fenjaslod: 1, fen: 1 },
    onFrame({ t, world, ui }) {
      if (ui.fadeLevel < 0.999) visible.push({ t, location: world.location });
    },
  });
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.equal(builds.fenjaslod.failed, 1, 'the first build failed');
  assert.ok(visible[0]?.location === 'burknalaut' && visible[0].t < 1, `the glade showed at ${visible[0]?.t.toFixed(2)} s`);
  assert.ok(builds.fenjaslod.built !== null, 'built again as the scene went there');
  assert.ok(visible.some(v => v.location === 'fenjaslod'), 'and the trail showed');
  assert.equal(world.chapterTimeline.at(-1).scene, 2);
});

test('a child who taps at once: the black at the start holds until the trail is built', async () => {
  const visible = [];
  const { task, builds } = await playUnattended(kafli2, {
    seeking: false, limit: 20, slowBuilds: { fenjaslod: 12 },
    onFrame({ t, world, ui }) {
      if (ui.fadeLevel < 0.999) visible.push({ t, location: world.location });
    },
  });
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.ok(builds.fenjaslod.built > 11.9, `the trail was built at ${builds.fenjaslod.built} s`);
  assert.ok(visible.length > 0 && visible[0].t >= builds.fenjaslod.built, `the glade showed at ${visible[0]?.t.toFixed(2)} s`);
  assert.equal(visible[0].location, 'burknalaut');
});

// ---------------------------------------------------------------------------------------------
// The footprints (scene 2)

test('the prints are counted one to ten in order, each with its digit', async () => {
  const { captions, world } = await playCapture();
  const counted = captions.filter(c => c.at >= sceneStart(world, 2) && c.at < sceneStart(world, 3) && COUNTS.includes(c.text)).map(c => c.text);
  assert.deepEqual(counted, COUNTS, 'Mosi counts the ten footprints, one to ten');
  // each count comes with its print's splash and digit, in the order of the prints
  const log = world.chapterState.printLog;
  assert.deepEqual(log.filter(e => e.what === 'count').map(e => e.index), [...Array(10).keys()], 'a digit rises from each print in turn');
  for (const [i, text] of COUNTS.entries()) {
    const digit = log.find(e => e.what === 'count' && e.index === i);
    const said = captions.find(c => c.text === text && c.at >= digit.at - 1e-6);
    assert.ok(said && said.at - digit.at < 0.5, `"${text}" is said as its digit rises`);
  }
});

test('an idle child still gets every print counted, by Egill', async () => {
  const { world } = await playIdle();
  const c = world.chapterState;
  assert.equal(c.printLog.filter(e => e.what === 'count').length, 10, 'every print counted');
  assert.ok(c.printLog.filter(e => e.what === 'count').every(e => e.by === 'egill'), 'by Egill, for a child who taps nothing');
});

test('the animals in the prints go into the book, the dragonfly first', async () => {
  const { journal, finds } = await playCapture();
  for (const id of ['dragonfly', 'waterBeetle', 'waterStrider', 'salamander']) {
    assert.ok(journal.findings.includes(id), `the ${id} in its print is found (${journal.findings.join(', ')})`);
  }
  // none in the prints is an animal chapter 1 finds (the owner's play of 2026-10-25), and the dragonfly over the third is the first
  // the chapter puts in the book, whose drawing main.js warms (chapter.firstFind)
  const chapterOne = ['beetle', 'frog', 'snail', 'butterfly', 'birds'];
  assert.deepEqual(PRINT_ANIMALS.filter(a => chapterOne.includes(a.kind)), [], 'no animal of chapter 1 in a print');
  assert.ok(finds.every(f => !f.options?.again), 'and nothing in them is found again');
  assert.equal(finds[0].id, 'dragonfly');
  assert.equal(chapter.firstFind, finds[0].id);
});

test('a wrong footprint splashes and says next, and the count waits', async () => {
  const run = await playUnattended(kafli2, { seeking: false, limit: 110, shaped: true, earlyTap: { name: 'print3', after: 1.5 } });
  const { seen, captions, world } = run;
  assert.ok(seen.earlyTap, 'the child tapped the third print while the first was next');
  const at = seen.earlyTap.at;
  const log = world.chapterState.printLog;
  assert.ok(log.some(e => e.what === 'splash' && e.index === 2 && Math.abs(e.at - at) < 0.1), 'the third print splashed');
  const counts = log.filter(e => e.what === 'count').map(e => e.index);
  assert.deepEqual(counts, [...counts].sort((a, b) => a - b), 'and was not counted out of turn: the counts go in order');
  const next = captions.find(c => c.text === 'Næsta er þarna!');
  assert.ok(next && next.at >= at - 1e-6 && next.at - at < 0.6, 'Mosi says the next one is there');
  assert.ok(seen.mosiLooks.some(l => l.at >= at - 1e-6 && l.at - at < 0.6), 'and nods toward it');
  // the count waits for the first print: a hint, and then Egill taps it himself
  const hint = captions.find(c => c.text === 'Hvað með næsta spor? Pikkaðu á það!' && c.at > at);
  const one = captions.find(c => c.text === 'Eitt!');
  assert.ok(hint && one && hint.at < one.at, 'a hint first, then "Eitt!"');
  assert.ok(one.at - at >= 8, `the first print was counted ${(one.at - at).toFixed(1)} s after the wrong tap`);
  assert.equal(log.find(e => e.what === 'count')?.index, 0, 'the first print counted is the first');
  assert.equal(log.find(e => e.what === 'count')?.by, 'egill', 'by Egill, as the child tapped nothing more');
  assert.equal(captions.filter(c => COUNTS.includes(c.text) && c.at < one.at).length, 0, 'nothing was counted before it');
});

test('a tap on Kambeðla as they go: her plates blink and she says goodbye', async () => {
  const { seen, captions } = await playUnattended(kafli2, { seeking: false, limit: 22, shaped: true, earlyTap: { name: 'kambedla', after: 1 } });
  assert.ok(seen.earlyTap, 'Kambeðla could be tapped in scene 1');
  const bye = captions.find(c => c.text === 'Góða ferð!');
  assert.ok(bye && bye.who === 'Kambeðla', 'she says goodbye');
  const others = captions.filter(c => c.who !== 'Kambeðla' && c.at < bye.at + 1.6 && c.at > bye.at - 0.1);
  assert.deepEqual(others, [], 'when nobody else is speaking');
});

// ---------------------------------------------------------------------------------------------
// The map in the journey (docs/superpowers/specs/2026-10-28-kortid-lifandi-og-i-ferdalaginu-design.md, section 3): as they leave the
// glade the map slides up over the game, draws the trail and the way across the Fen while Mosi says where they are going, and goes

const MOMENT_HOLD = 0.8; // seconds the map stands once the line and the drawing are over
const LINE_HOLD = 0.5; // seconds a line is held after its recording (engine/scene/scene.js)
const LEAVING_SECONDS = 45; // the glade scene and a bit more: the map moment is over well before

/** How long a map moment lasts in scene time: the drawing or Mosi's line (and its hold), whichever is longer, the map standing, and the slide away. */
const lasts = (run, moment, line) => Math.max(moment.drawMs / 1000, run.stage.s.lineDuration(line) + LINE_HOLD) + MOMENT_HOLD + moment.closeMs / 1000;

/** Scene 1 played as a capture seeks it, watching how many lines the chapter has under way each frame and when Mosi first walks. */
function playLeaving(options = {}) {
  const seen = { saying: [], firstWalk: null };
  return playUnattended(kafli2, {
    limit: LEAVING_SECONDS, shaped: true, ...options,
    onFrame({ world, stage }) {
      seen.saying.push({ at: stage.s.time, saying: world.chapterState?.saying ?? 0 });
      if (seen.firstWalk === null && world.actors.get('mosi').walking) seen.firstWalk = stage.s.time;
    },
  }).then(run => ({ ...run, leaving: seen }));
}
let left = null;
const leaving = () => (left ??= playLeaving());

test('the map comes up as they leave the glade: b and c drawn before Mosi walks off, Mosi saying where they go, over by itself within 9 s', async () => {
  const trail = chapter.lines.k2_mosi_map_trail;
  assert.equal(trail.text, 'Nú förum við út úr skóginum, niður Fenjaslóðina og alla leið að Feninu, til Þórseðlu.');
  for (const [how, play] of [['a capture', leaving], ['a child who waits', () => playLeaving({ seeking: false })]]) {
    const run = await play();
    const { moments, captions, doc, save, world, task, seen, leaving: watched } = run;
    assert.equal(moments.length, 1, `${how}: one map moment in the glade scene`);
    const [moment] = moments;
    assert.deepEqual(moment.ids, ['b', 'c'], `${how}: the Fenjaslóð, and across the Fen to Þórseðla's pool`);
    // After "Miklu stærri. Þú sérð!", before they go, with Mosi's line about the map beside it.
    assert.ok(moment.saidBefore.has('k2_mosi_muchbigger'), `${how}: it comes after "Miklu stærri"`);
    assert.ok(!moment.saidBefore.has('k2_mosi_map_trail'), `${how}: with Mosi's line not yet said`);
    const said = captions.filter(c => c.text === trail.text);
    assert.equal(said.length, 1, `${how}: Mosi says where they are going, once`);
    assert.equal(said[0].who, 'Mosi');
    assert.ok(Math.abs(said[0].at - moment.at) < 0.1, `${how}: he begins as the map slides up (${said[0].at.toFixed(2)} s, the map at ${moment.at.toFixed(2)} s)`);
    // His line is the chapter's own say: the chapter counts one voice at a time, through it and not after it.
    const line = run.stage.s.lineDuration('k2_mosi_map_trail');
    const during = watched.saying.filter(f => f.at > said[0].at + 0.1 && f.at < said[0].at + line);
    assert.ok(during.length > 10 && during.every(f => f.saying === 1), `${how}: c.saying counts Mosi's line while he says it`);
    assert.equal(watched.saying.find(f => f.at >= moment.goneAt).saying, 0, `${how}: and nothing after it`);
    // Both pieces are drawn on the map, and kept as seen.
    assert.equal(moment.drawMs, 6100, `${how}: the slide up, two pieces and the gap between them`);
    assert.deepEqual(moment.states, { b: ['drawing'], c: ['drawing'] }, `${how}: both draw themselves, in the overlay`);
    assert.deepEqual(moment.seenAfter, ['map-route-b', 'map-route-c'], `${how}: and the save has them as seen`);
    assert.ok(['map-route-b', 'map-route-c'].every(id => save.get().seen.includes(id)), `${how}: for good`);
    // Nothing is cut, and it ends by itself: Mosi's line and the drawing, 0.8 s of the map standing, 0.6 s sliding away.
    assert.ok(moment.goneAt !== null, `${how}: the overlay was taken off the page`);
    assert.deepEqual(run.seen.cuts.filter(cut => cut.at > moment.at + 1e-6 && cut.at < moment.goneAt), [], `${how}: the camera cuts nowhere while the map is up`);
    assert.equal(moment.closeMs, 600, `${how}: it slides away in 0.6 s`);
    const lasted = moment.goneAt - moment.at;
    assert.ok(lasted < 9, `${how}: the moment lasted ${lasted.toFixed(2)} s of scene time`);
    assert.ok(Math.abs(lasted - lasts(run, moment, 'k2_mosi_map_trail')) < 0.15, `${how}: it waits for Mosi's line, then 0.8 s, then the slide (${lasted.toFixed(2)} s)`);
    // Then Mosi walks out of the glade, with no map left on the page.
    assert.ok(watched.firstWalk >= moment.goneAt - 1e-6, `${how}: Mosi walks off (${watched.firstWalk?.toFixed(2)} s) once the map is gone (${moment.goneAt.toFixed(2)} s)`);
    assert.equal(doc.body.children.filter(e => e.classList.contains('map-moment')).length, 0, `${how}: no overlay is left on the page`);
    assert.equal(world.chapterTimeline.at(-1).scene, 2, `${how}: and the story goes on into the trail`);
    assert.equal(task.failed, false);
  }
});

test('a tap on Kambeðla while the map is up goes to the game behind it: her plates blink at once and she says goodbye as Mosi\'s line ends', async () => {
  const first = await leaving();
  const [moment] = first.moments;
  const run = await playLeaving({ seeking: false, earlyTap: { name: 'kambedla', after: moment.at + 2 } });
  assert.ok(run.seen.earlyTap && run.seen.earlyTap.at > run.moments[0].at && run.seen.earlyTap.at < run.moments[0].closeAt, 'she was tapped with the map up');
  const trail = run.captions.find(c => c.text === chapter.lines.k2_mosi_map_trail.text);
  const bye = run.captions.find(c => c.text === 'Góða ferð!');
  assert.ok(bye && bye.who === 'Kambeðla', 'she says goodbye');
  assert.ok(bye.at >= trail.at + run.stage.s.lineDuration('k2_mosi_map_trail') + LINE_HOLD - 1e-6, 'not over Mosi: when he has finished');
  assert.ok(bye.at < run.moments[0].goneAt, 'while the map is still sliding away');
});

test('the dragonfly hangs over the third print\'s water, and darts up and away, buzzing, as the print splashes', async () => {
  let watched = null;
  const run = await playUnattended(kafli2, {
    seeking: false, limit: 100, shaped: true, // as a child who taps nothing plays it: Egill taps each print in the end
    onFrame({ world, stage }) {
      const c = world.chapterState;
      const fly = c?.printCritters?.group.getObjectByName('Critter print-dragonfly');
      if (!fly || !c.prints) return;
      const body = fly.children[0].getWorldPosition(new THREE.Vector3());
      watched ??= { over: body.y - c.prints.levelOf(2), off: Math.hypot(body.x - c.prints.targets[2].point.x, body.z - c.prints.targets[2].point.z) };
      const splash = c.printLog.find(e => e.what === 'splash' && e.index === 2);
      if (splash && !watched.splash) watched.splash = { at: splash.at, from: body.clone() };
      if (watched.splash && stage.s.time - watched.splash.at < 1.2) watched.farthest = Math.max(watched.farthest ?? 0, body.distanceTo(watched.splash.from));
    },
  });
  assert.ok(watched && watched.over > 0.15 && watched.over < 0.6, `low over the water, ${watched?.over.toFixed(2)} m up`);
  assert.ok(watched.off < 0.6 * PRINT_SIZE, `over the print, ${watched.off.toFixed(2)} m from its middle`);
  assert.ok(watched.splash, 'its print splashed');
  assert.ok(watched.farthest > 0.4, `it darted ${watched.farthest?.toFixed(2)} m as it did`);
  const buzz = run.soundLog.find(e => e.name === CRITTER_SOUNDS.dragonfly && e.at >= watched.splash.at - 1e-6);
  assert.ok(buzz && buzz.at - watched.splash.at < 0.3, 'with its buzz');
});

test('the warm-up draws a print with its water and the trail\'s animals; behind the start button only the actors', async () => {
  const { world } = await playUnattended(kafli2, { limit: 0.2 });
  const namesOf = w => w.objects.flatMap(root => { const n = []; root.traverse(o => n.push(o.name)); return n; });
  const warm = kafli2.chapter.warmUp(world);
  for (const name of ['Mud prints', 'Print water']) assert.ok(namesOf(warm).includes(name), `${name} is drawn`);
  warm.dispose();
  // behind the start button (the glade) only the actors: the start button waits for no more than the glade shows
  const atStart = kafli2.chapter.warmUp(world, { place: 'burknalaut' });
  assert.deepEqual(atStart.objects, [...world.actors.values()].map(actor => actor.root));
  assert.deepEqual(atStart.shots, ['glade_leaving']);
  atStart.dispose();
  // the trail its prints and its animals, and none of the Fen's (the basket and the berries are chapter 3's)
  const trail = kafli2.chapter.warmUp(world, { place: 'fenjaslod' });
  for (const name of ['Mud prints', 'Print water']) assert.ok(namesOf(trail).includes(name), `${name} on the trail`);
  for (const name of ['Basket', 'Basket berries', 'Basket glow']) assert.ok(!namesOf(trail).includes(name), `${name} is not on the trail`);
  const critterNames = namesOf(trail).filter(name => name.startsWith('Critter warm-up-')).map(name => name.slice('Critter warm-up-'.length)).sort();
  assert.deepEqual(critterNames, ['dragonfly', 'salamander', 'waterBeetle', 'waterStrider']);
  trail.dispose();
  // Síkið: its berry bushes (the hummocks' ones: one shader for as many bushes as it has), and none of the trail's prints or animals
  const channel = kafli2.chapter.warmUp(world, { place: 'siki' });
  assert.ok(namesOf(channel).includes('Berry bushes'), 'the hummocks\' berry bushes are drawn');
  for (const name of ['Mud prints', 'Print water']) assert.ok(!namesOf(channel).includes(name), `${name} is not in Síkið`);
  assert.ok(!namesOf(channel).some(name => name.startsWith('Critter warm-up-')), 'nor the trail\'s animals');
  channel.dispose();
});

test('a tap on the next print while Mosi says a number is not lost: it is counted as soon as he has said it', async () => {
  let tappedAt = null;
  const run = await playUnattended(kafli2, {
    seeking: false, limit: 70, shaped: true, earlyTap: { name: 'print1', after: 1 },
    onFrame({ world, stage, pointer }) {
      const one = world.chapterState?.printLog?.find(e => e.what === 'count' && e.index === 0);
      if (one && tappedAt === null && stage.s.time - one.at >= 0.4) {
        tappedAt = stage.s.time;
        pointer.tap('print2');
      }
    },
  });
  const log = run.world.chapterState.printLog;
  const one = log.find(e => e.what === 'count' && e.index === 0);
  const two = log.find(e => e.what === 'count' && e.index === 1);
  assert.equal(one?.by, 'child', 'the child counted the first');
  assert.ok(tappedAt !== null && two, 'and tapped the second during "Eitt!"');
  assert.equal(two.by, 'child', 'the second is the child\'s');
  assert.ok(two.at - tappedAt < 2, `counted ${(two.at - tappedAt).toFixed(1)} s after the tap, as soon as "Eitt!" was said`);
});

// ---------------------------------------------------------------------------------------------
// The sound (engine/audio/sfx.js, engine/audio/fen-sounds.js)

test('every sound the script asks for exists', () => {
  const context = createFakeContext({ state: 'running' });
  const sfx = createSfx({ context, theme: readJson('../assets/audio/theme.json'), recorded: true }); // as main.js makes it
  const known = name => {
    sfx.stop(); // a bed (the forest, the Fen) is laid once: each is asked for afresh
    context.advance(12);
    return sfx.play(name, { index: 1, seconds: 8 });
  };
  const calls = [...CHAPTER_TEXT.matchAll(/s\.sfx\(([^,)]*)/g)].map(m => m[1].trim());
  const literal = calls.filter(a => /^'[^']*'$/.test(a)).map(a => a.slice(1, -1));
  assert.deepEqual([...new Set(calls.filter(a => !/^'[^']*'$/.test(a)))], ['sound'], 'a sound not written out is an animal\'s, looked up in CRITTER_SOUNDS');
  for (const name of new Set([...literal, ...Object.values(CRITTER_SOUNDS)])) assert.equal(known(name), true, `"${name}" is a sound of the set`);
  // the sounds of the glade and the trail are all asked for, and the forest only once: in the glade, until the trail goes into the fen
  for (const name of ['fen', 'splash', 'ripple', 'countTone']) assert.ok(literal.includes(name), `the script asks for ${name}`);
  // Uggeðla's five (engine/audio/fen-sounds.js): the sail rising out of the reed, her jaws and her gulp, her tail's splash and her swimming
  for (const name of ['sailRise', 'jawSnap', 'gulp', 'tailSplash', 'swim']) assert.ok(literal.includes(name), `the script asks for ${name}`);
  assert.equal(literal.filter(name => name === 'forest').length, 1);
  assert.ok(CRITTER_SOUNDS.dragonfly, 'the dragonfly over the third print has a sound');
});

test('the sounds come where the script has them: the forest at the start, the water on the trail, the count with its splash and ripple', async () => {
  const { soundLog: log } = await playIdle();
  const named = (name, scene) => log.filter(e => e.name === name && (scene === undefined || e.scene === scene));
  // the forest's wind from the start button; the Fen's water from the trail's fen half on
  assert.deepEqual(named('forest').map(e => e.scene), [undefined], 'the forest once, at the start');
  const fen = named('fen');
  assert.ok(fen.length >= 1 && fen[0].scene === 2, `the Fen's bed from scene 2 (${fen.map(e => e.scene)})`);
  // the count: each print a splash, its tone (climbing with the number) and its ripple, together
  const counts = named('countTone', 2);
  assert.deepEqual(counts.map(e => e.detail?.index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'the tone climbs one to ten');
  assert.ok(fen[0].at < counts[0].at, 'the water is there before the first print');
  for (const count of counts) {
    for (const what of ['splash', 'ripple']) assert.ok(named(what, 2).some(e => Math.abs(e.at - count.at) < 0.05), `${what} with ${count.detail.index}`);
  }
});

test("Uggeðla's sounds come where she does it: the reed's rustle as her sail rises, the jaws' snap and the gulp at each fish, the tail's slap as it hits the water, the swim under the ferry", async () => {
  const run = await playIdle();
  const log = name => run.soundLog.filter(e => e.name === name);
  const [s3, s4, s6] = [3, 4, 6].map(n => sceneStart(run.world, n));
  // the sail: once, in the channel, as it begins to rise, before Mosi says "boat"
  const rise = log('sailRise');
  assert.equal(rise.length, 1, 'the sail rises once');
  assert.ok(rise[0].at >= s3 && rise[0].at < saidAt(run, 'k2_mosi_boat'), `the rustle begins with the rise, ${(saidAt(run, 'k2_mosi_boat') - rise[0].at).toFixed(1)} s before "boat"`);
  assert.equal(rise[0].scene, 3);
  // the swallow of the fish she shows in the channel, and of the five she is fed
  const gulps = log('gulp'), snaps = log('jawSnap'), counts = log('countTone');
  assert.equal(gulps.length, 1 + FISH_COUNT, 'a gulp for the fish in the channel and one for each of the five');
  assert.ok(gulps[0].at >= s3 && gulps[0].at < s4 && gulps[0].at > saidAt(run, 'k2_mosi_notboat'), 'the first as she swallows in the channel, as Mosi says it is no boat');
  assert.equal(snaps.length, FISH_COUNT, 'a snap for each fish caught');
  snaps.forEach((snap, i) => {
    const count = counts.filter(e => e.scene === 4)[i];
    assert.ok(snap.scene === 4 && count.at - snap.at > 0 && count.at - snap.at < 0.4, `snap ${i + 1} as the jaws shut, ${(count.at - snap.at).toFixed(2)} s before the fish is counted`);
    const gulp = gulps[i + 1];
    assert.ok(gulp.at - snap.at > 0.7 && gulp.at - snap.at < 1.5, `and its gulp ${(gulp.at - snap.at).toFixed(2)} s after it`);
  });
  // the tail: once, at the ferry's splash
  const slaps = log('tailSplash');
  assert.equal(slaps.length, 1);
  assert.ok(slaps[0].at > saidAt(run, 'k2_uggedla_tail') && slaps[0].at < saidAt(run, 'k2_mosi_wetter'), 'the tail hits the water between her line and his answer');
  // the swim: under the ferry from its first moments to the pool, one stroke pair after another with no seam, and as she swims off; nowhere else
  const swims = log('swim');
  assert.ok(swims.every(e => e.scene === 6 || e.scene === 7), 'she swims in scenes 6 and 7 only');
  const ferry = swims.filter(e => e.scene === 6);
  assert.ok(ferry.length >= 15 && ferry[0].at > saidAt(run, 'k2_uggedla_aboard') && ferry[0].at - s6 < 12, `${ferry.length} strokes from ${(ferry[0].at - s6).toFixed(1)} s into the ferry, as she sets off`);
  assert.ok(ferry.at(-1).at > saidAt(run, 'k2_egill_head'), 'right up to the last line of the chat');
  for (let i = 1; i < ferry.length; i++) assert.ok(Math.abs(ferry[i].at - ferry[i - 1].at - SWIM_STROKE) < 0.12, `stroke ${i + 1} follows ${(ferry[i].at - ferry[i - 1].at).toFixed(2)} s after the one before`);
  assert.ok(swims.some(e => e.scene === 7), 'and she swims off with it too');
});

test('a full save as the page keeps it loads whole but Risaeðlu-Yatzy\'s old block, and the map\'s places start empty', () => {
  const full = {
    stars: ['k1_kambedla'], findings: ['butterfly', 'frog'], seen: ['mosi', 'frog'],
    eitt: { skill: 0.4, losses: 2, wins: 3, tutorialDone: true },
    hals: { found: ['ammonite'], game: { turn: 3 }, intro: true, hello: true, played: true },
    yatzy: { skill: 0.5, losses: 1, wins: 2, badges: ['yatzy_mosi'], tutorialDone: true }, // an older save's Risaeðlu-Yatzy, which nothing reads now
  };
  let written = null;
  const storage = { getItem: () => JSON.stringify(full), setItem: (key, value) => { written = JSON.parse(value); } };
  const save = createSave(storage);
  assert.deepEqual(save.get(), { stars: full.stars, findings: full.findings, seen: full.seen, places: [] });
  assert.deepEqual(save.getEitt(), { ...full.eitt, game: null, seats: null }); // no round of "Fjölspil" kept
  assert.deepEqual(save.getHals(), { found: full.hals.found });
  assert.deepEqual(save.getHalsPlay(), { game: full.hals.game, intro: true, hello: true, played: true });
  // a place found keeps every field as it was, with the place, but Risaeðlu-Yatzy's: the game left (the owner's choice of 2026-10-24)
  assert.equal(save.addPlace('fen'), true);
  const { yatzy, ...kept } = full;
  assert.deepEqual(written, { ...kept, places: ['fen'] });
});

// ---------------------------------------------------------------------------------------------
// Uggeðla alive (kafli2-uggedla.js): lying low, the sail rising, her head up with a fish, catching fish in the air, swimming with Egill
// on her back, a tail splash at Mosi and her life in the water. One scripted run of all of it (the "reel"), watched frame by frame.

const V3 = THREE.Vector3;
const DEG = THREE.MathUtils.radToDeg;

const skinOf = actor => {
  let mesh = null;
  actor.model.traverse(o => { if (o.isSkinnedMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o; });
  return mesh;
};
function posedSkin(mesh) {
  const n = mesh.geometry.attributes.position.count;
  const out = new Float32Array(n * 3);
  const v = new V3();
  for (let i = 0; i < n; i++) {
    mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld);
    out.set([v.x, v.y, v.z], i * 3);
  }
  return out;
}
// How Egill's skin and hers meet, as both are posed now (kafli3.test.mjs's, for Þórseðla): how many of his vertices are inside her (and
// how deep the deepest is), and how much air there is under the rest of him at the least. Her skin's triangles near him go on a grid of
// cells across the ground; a vertical line through one of his vertices that crosses her skin an odd number of times above it starts
// inside her.
function skinsMeet(her, egill) {
  her.root.updateMatrixWorld(true);
  egill.root.updateMatrixWorld(true);
  const mesh = skinOf(her);
  const skin = posedSkin(mesh), his = posedSkin(skinOf(egill)), index = mesh.geometry.index.array;
  const near = egill.root.position, cell = 0.08, cells = new Map(), tris = [];
  for (let t = 0; t < index.length; t += 3) {
    const [a, b, d] = [index[t] * 3, index[t + 1] * 3, index[t + 2] * 3];
    const x0 = Math.min(skin[a], skin[b], skin[d]), x1 = Math.max(skin[a], skin[b], skin[d]);
    const z0 = Math.min(skin[a + 2], skin[b + 2], skin[d + 2]), z1 = Math.max(skin[a + 2], skin[b + 2], skin[d + 2]);
    if (x1 < near.x - 1.6 || x0 > near.x + 1.6 || z1 < near.z - 1.6 || z0 > near.z + 1.6) continue;
    const k = tris.push([a, b, d]) - 1;
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) {
      for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) {
        const key = i * 100003 + j;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(k);
      }
    }
  }
  let inside = 0, deepest = 0, air = Infinity;
  for (let p = 0; p < his.length; p += 3) {
    const [x, y, z] = [his[p], his[p + 1], his[p + 2]];
    const crossings = [];
    for (const k of cells.get(Math.floor(x / cell) * 100003 + Math.floor(z / cell)) ?? []) {
      const [a, b, d] = tris[k];
      const det = (skin[b + 2] - skin[d + 2]) * (skin[a] - skin[d]) + (skin[d] - skin[b]) * (skin[a + 2] - skin[d + 2]);
      if (Math.abs(det) < 1e-12) continue;
      const l1 = ((skin[b + 2] - skin[d + 2]) * (x - skin[d]) + (skin[d] - skin[b]) * (z - skin[d + 2])) / det;
      const l2 = ((skin[d + 2] - skin[a + 2]) * (x - skin[d]) + (skin[a] - skin[d]) * (z - skin[d + 2])) / det;
      if (l1 < 0 || l2 < 0 || l1 + l2 > 1) continue;
      crossings.push(l1 * skin[a + 1] + l2 * skin[b + 1] + (1 - l1 - l2) * skin[d + 1]);
    }
    const above = crossings.filter(h => h > y);
    if (above.length % 2) {
      inside++;
      deepest = Math.max(deepest, Math.min(...above) - y);
    } else {
      const below = crossings.filter(h => h <= y);
      if (below.length) air = Math.min(air, y - Math.max(...below));
    }
  }
  return { inside, deepest, air };
}

// Her parts, found in the bind pose as spinosaurus.test.mjs finds them: the sail (above her back, along its length), the rest of her
// skin, the tip of her snout (the furthest vertex forward that her head and jaw carry alone), and what tells a torn sail: the length of
// its top edge and which of its triangles have turned over.
function herParts(her) {
  const mesh = skinOf(her);
  const pos = mesh.geometry.attributes.position, idx = mesh.geometry.index.array;
  const { skinIndex, skinWeight } = mesh.geometry.attributes;
  const carriedBy = names => {
    const ids = names.map(n => mesh.skeleton.bones.findIndex(b => b.name === n));
    return i => { let w = 0; for (let k = 0; k < 4; k++) if (ids.includes(skinIndex.getComponent(i, k))) w += skinWeight.getComponent(i, k); return w; };
  };
  const carried = carriedBy(['Head', 'Jaw']), neck = carriedBy(['Neck', 'Head', 'Jaw']);
  let backTop = 0;
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getZ(i)) > 0.45 && pos.getX(i) > -0.5 && pos.getX(i) < 2) backTop = Math.max(backTop, pos.getY(i));
  // the sail as spinosaurus.test.mjs has it, and the tip of it that reaches forward over her shoulders (not carried by her neck)
  const upper = new Set(), rest = [], sail = [];
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > backTop + 0.4 && pos.getX(i) > -4.3 && pos.getX(i) < 2.3) upper.add(i);
    if (upper.has(i) || (pos.getY(i) > backTop && pos.getX(i) > -4.8 && pos.getX(i) < 2.8 && Math.abs(pos.getZ(i)) < 0.45 && neck(i) < 0.3)) sail.push(i);
    else rest.push(i);
  }
  let tip = -1;
  for (let i = 0; i < pos.count; i++) if (carried(i) > 0.999 && (tip < 0 || pos.getX(i) > pos.getX(tip))) tip = i;
  const tris = [];
  for (let t = 0; t < idx.length; t += 3) if (upper.has(idx[t]) && upper.has(idx[t + 1]) && upper.has(idx[t + 2])) tris.push(t);
  const bins = new Map();
  for (const i of upper) { const b = Math.round(pos.getX(i) * 10); if (!bins.has(b) || pos.getY(i) > pos.getY(bins.get(b))) bins.set(b, i); }
  const edge = [...bins.keys()].sort((a, b) => a - b).map(b => bins.get(b));
  const at = i => mesh.getVertexPosition(i, new V3()).applyMatrix4(mesh.matrixWorld);
  const bind = i => new V3(pos.getX(i), pos.getY(i), pos.getZ(i));
  const posed = i => mesh.getVertexPosition(i, new V3()); // in her own frame, as she was bound: turning her about changes nothing of the sail
  const lengthOf = point => edge.slice(1).reduce((sum, i, k) => sum + point(i).distanceTo(point(edge[k])), 0);
  const normalsOf = point => {
    const P = new Map();
    for (const i of upper) P.set(i, point(i));
    return tris.map(t => P.get(idx[t + 1]).clone().sub(P.get(idx[t])).cross(P.get(idx[t + 2]).clone().sub(P.get(idx[t]))));
  };
  const rest0 = { length: lengthOf(bind), normals: normalsOf(bind) }; // as she was bound
  return {
    mesh, sail, rest, tip, edge, tris,
    tipAt: out => out.copy(at(tip)),
    top: indices => Math.max(...indices.map(i => at(i).y)),
    // the sail's top edge as long as it was bound (1 for untouched) and how many of its triangles have turned over
    torn: () => ({ ratio: lengthOf(posed) / rest0.length, turned: normalsOf(posed).filter((n, k) => rest0.normals[k].length() > 1e-4 && n.dot(rest0.normals[k]) < 0).length }),
  };
}

const WATER_LEVEL = () => waterShape(SIKI_LAYOUT.water).level;
/** Síkið's ground and the plants the forest deals it (planForest), once: the reed she lies behind is read from it. */
let dealt = null;
function sikiPlan() {
  if (!dealt) {
    const place = chapter.locations.siki, world = { chapter };
    const { layout, terrain } = shapeGround(world, { ...place.layout, shots: place.shots }, place.layout.seed);
    const plan = planForest({ world, layout, seed: place.layout.seed, terrain, library: createSpeciesLibrary(place.layout.seed), q: PRESETS.tablet });
    dealt = { layout, terrain, plan };
  }
  return dealt;
}
/**
 * How high the reed wall she lies behind stands: the median top of the clumps of it within 7 m of her middle (the place's own reed, the
 * rows toward the channel: scale 2 and over), as the forest deals them (planForest: each clump's height is its model's, times its scale).
 */
function reedTop() {
  const { layout, plan } = sikiPlan();
  const wall = new Set(layout.plants.filter(p => p.name === 'horsetailReed' && p.scale >= 2).map(p => [p.position[0], p.position[1]].join()));
  const [hx, hz] = xz(UGGEDLA_REED);
  const tops = plan.placements.filter(p => p.name === 'horsetailReed' && wall.has([p.x, p.z].join()) && Math.hypot(p.x - hx, p.z - hz) < 7).map(p => p.y + p.model.height * p.scale).sort((x, y) => x - y);
  assert.ok(tops.length >= 20, `${tops.length} clumps of the wall near her`);
  return tops[Math.floor(tops.length / 2)];
}

/**
 * What one camera of Síkið can see of her, her sail apart, through the reed and over the ground: of every vertex of her skin that is in
 * the picture and above the ground, how many of the place's reed clumps stand between the camera and it (a clump is the cylinder its
 * dense lower part fills: 0.5 of its radius, 0.8 of its height). A vertex with fewer than two between is "showing". `parts` is herParts.
 */
function showingFrom(parts, shot, aspect = 1.6) {
  const { plan, terrain } = sikiPlan();
  const [hx, hz] = xz(UGGEDLA_REED);
  const clumps = plan.placements.filter(p => p.name === 'horsetailReed' && Math.hypot(p.x - hx, p.z - hz) < 16)
    .map(p => ({ x: p.x, z: p.z, r: p.model.radius * p.scale * 0.5, top: p.y + p.model.height * p.scale * 0.8 }));
  const camera = new THREE.PerspectiveCamera(shot.fov, aspect, 0.1, 1200);
  camera.position.set(...shot.position);
  camera.lookAt(new V3(...shot.target));
  camera.updateMatrixWorld(true);
  const eye = camera.position, v = new V3(), ndc = new V3();
  let visible = 0, showing = 0, highest = -Infinity;
  for (const i of parts.rest) {
    parts.mesh.getVertexPosition(i, v).applyMatrix4(parts.mesh.matrixWorld);
    if (v.y < terrain.heightAt(v.x, v.z) - 0.02) continue; // under the ground
    ndc.copy(v).project(camera);
    if (ndc.z > 1 || Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1) continue; // not in the picture
    visible++;
    let between = 0;
    const [dx, dz] = [v.x - eye.x, v.z - eye.z];
    const length2 = dx * dx + dz * dz;
    for (const c of clumps) {
      const t = ((c.x - eye.x) * dx + (c.z - eye.z) * dz) / length2; // where along the way, in the ground's plane, the clump's axis is nearest
      if (t <= 0 || t >= 0.995) continue;
      if (Math.hypot(eye.x + dx * t - c.x, eye.z + dz * t - c.z) > c.r) continue;
      if (eye.y + (v.y - eye.y) * t > c.top) continue; // the way goes over it
      between++;
    }
    if (between < 2) { showing++; highest = Math.max(highest, v.y); }
  }
  return { visible, showing, highest };
}

/** The chapter's own cast and state as Síkið leaves them (kafli2.js's script makes the same), then `play(s, c)`. */
function inSiki(play, { limit = 120, onFrame = null } = {}) {
  const there = {
    ...chapter,
    start: 'siki', startShot: 'siki_arrive', prepare: [],
    *script(s) {
      const [mosi, egill, kambedla, uggedla, thorsedla] = ['mosi', 'egill', 'kambedla', 'uggedla', 'thorsedla'].map(name => s.actor(name));
      const world = mosi.raw.world;
      world.chapterTimeline = [];
      const c = { s, world, mosi, egill, kambedla, uggedla, thorsedla, talking: false, saying: 0, printLog: [] };
      // a line, counted as the chapter's own say counts it (kafli2.js)
      c.say = function* (speaker, id, options) { c.saying++; try { yield s.say(speaker, id, options); } finally { c.saying--; } };
      c.ring = ringsFor(world, { most: 3 });
      world.chapterState = c;
      c.saddle = createSaddle(mosi.raw);
      c.saddle.show();
      c.riding = ride(egill.raw, c.saddle, { settle: 0 });
      arriveInSiki(s, c);
      mosi.raw.place(MOSI_BANK.position[0], MOSI_BANK.position[2], MOSI_BANK.heading);
      yield* play(s, c);
    },
  };
  return playUnattended({ chapter: there }, { shaped: true, seeking: false, limit, onFrame });
}

// The reel: she lies low, the sail rises, her head comes up with a fish, three fish are caught in the air at three heights, Egill floats
// onto her back and she swims with him along the ferry line, Mosi wading beside her, and flicks a splash at him with her tail.
// The cameras of the scenes where she lies low: the arrival, the sail over the reed (and the tall screen's), the flooded path (which
// looks away from her) and the star's low shot.
const LYING_SHOTS = ['siki_arrive', 'siki_sail', 'siki_flooded', 'siki_star', 'siki_portrait'];
const CATCHES = [
  { spot: 0, up: 1.1, size: 1.5 }, // low, a big fish (the fishing hangs a tapped fish 1.6 m up at least: her snout reaches lower ones only near)
  { spot: 3, up: 1.7, size: 1.5 },
  { spot: 4, up: 2.7, size: 1.5 }, // high and far, the fish that makes her stretch
];
const SWIM = FERRY_LINE.slice(0, 7); // about 20 m from the crossing
let reeled = null;
function reel() {
  reeled ??= (async () => {
    const seen = { phases: [], frames: [], catches: [], meets: [], gauge: [], jaw: { lying: 0, headUp: 0, catches: 0 }, ripples: [], splashAt: null };
    let parts = null, frame = 0;
    const play = function* (s, c) {
      const { world, mosi, egill, uggedla } = c;
      const mark = name => { seen.phases.push({ phase: name, at: s.time }); };
      const level = WATER_LEVEL();
      mark('lying');
      yield s.wait(3);
      mark('rising');
      yield* riseSail(s, c);
      mark('head up');
      yield* headUpWithFish(s, c);
      yield s.wait(0.6);
      for (const [i, spec] of CATCHES.entries()) {
        const [x, z] = FISHING_SPOTS[spec.spot];
        const fish = {
          point: new V3(x, level + spec.up, z), size: spec.size, calls: 0, at: null,
          caught() { this.calls++; this.at = s.time; },
        };
        const record = { i, ...spec, fish, start: s.time };
        seen.catches.push(record);
        mark(`catch ${i}`);
        yield* catchFish(s, c, fish);
        record.end = s.time;
        record.headBack = uggedla.raw.headPosition(new V3());
        yield s.wait(0.7);
      }
      mark('float');
      // Mosi comes to wade beside her; Egill floats from his saddle onto her back
      const wade = MOSI_WADE_LINE.slice(0, 9);
      mosi.raw.place(wade[0][0], wade[0][1], 0);
      const seat = createBackSeat(uggedla);
      c.seat = seat;
      yield floatTo(egill.raw, seat);
      ride(egill.raw, seat, { settle: 0 });
      mark('swim');
      const swimming = s.after(0, () => swimAlong(s, c, SWIM));
      s.after(0, () => mosi.walkTo(wade.slice(1), { speed: 1.0 }));
      yield swimming;
      mark('splash');
      yield* tailSplash(s, c, mosi);
      mark('after');
      yield s.wait(2);
    };
    const run = await inSiki(play, {
      limit: 150,
      onFrame({ world, stage }) {
        const c = world.chapterState;
        if (!c?.uggedla) return;
        const her = c.uggedla.raw;
        parts ??= herParts(her);
        const t = stage.s.time;
        const water = world.forest?.water;
        her.root.updateMatrixWorld(true);
        const jaw = her.model.getObjectByName('Jaw');
        const jawAngle = DEG(jaw.quaternion.angleTo(new THREE.Quaternion()));
        const phaseName = seen.phases.at(-1)?.phase ?? null;
        const row = { t, phase: phaseName, jaw: jawAngle, root: her.root.position.clone(), heading: her.heading, head: her.headPosition(new V3()) };
        if (frame % 3 === 0) {
          row.sailTop = parts.top(parts.sail);
          row.tail = her.model.getObjectByName('Tail6').getWorldPosition(new V3());
        }
        seen.frames.push(row);
        if (phaseName === 'lying') seen.jaw.lying = Math.max(seen.jaw.lying, jawAngle);
        if (phaseName === 'head up') seen.jaw.headUp = Math.max(seen.jaw.headUp, jawAngle);
        if (phaseName?.startsWith('catch')) seen.jaw.catches = Math.max(seen.jaw.catches, jawAngle);
        // the end of the lying phase: her highest bit that is not sail, and the sail's
        if (phaseName === 'lying' && t > 2.8 && !seen.lying) {
          seen.lying = {
            rest: parts.top(parts.rest), sail: parts.top(parts.sail), reed: reedTop(),
            showing: Object.fromEntries(LYING_SHOTS.map(name => [name, showingFrom(parts, SIKI_SHOTS[name])])),
          };
        }
        // the moment a fish is caught: how far her snout's tip is from it
        for (const record of seen.catches) {
          if (record.fish.at !== null && record.snap === undefined && record.fish.at <= t + 1e-9) {
            const tip = parts.tipAt(new V3());
            record.snap = { distance: tip.distanceTo(record.fish.point), jaw: jawAngle, at: t };
          }
        }
        // the sail never tears: its top edge's length and the triangles that turn over
        if (frame % 5 === 0) seen.gauge.push({ t, phase: phaseName, ...parts.torn() });
        // Egill and her skin while she swims
        if (phaseName === 'swim' && frame % 6 === 0 && c.egill.raw.controlled) {
          const meet = skinsMeet(her, c.egill.raw);
          const local = her.root.worldToLocal(c.egill.raw.root.position.clone());
          seen.meets.push({ t, ...meet, local, mosi: c.mosi.raw.root.position.distanceTo(her.root.position) });
        }
        frame++;
      },
    });
    seen.world = run.world;
    seen.sounds = run.soundLog;
    seen.ripples = run.world.forest.water?.ripples ?? [];
    return { run, seen, parts };
  })();
  return reeled;
}
const phaseOf = (seen, name) => {
  const i = seen.phases.findIndex(p => p.phase === name);
  return { from: seen.phases[i].at, to: seen.phases[i + 1]?.at ?? Infinity };
};
const during = (seen, name) => { const { from, to } = phaseOf(seen, name); return seen.frames.filter(f => f.t >= from && f.t < to); };

test('Uggeðla lies low in her reed: nothing of her shows from the cameras of the scenes but her sail', async () => {
  const { run, seen } = await reel();
  assert.equal(run.task.failed, false, String(run.task.error?.stack ?? run.task.error));
  assert.equal(run.task.done, true, `the reel was still going at ${run.stage.s.time.toFixed(1)} s`);
  const her = run.world.actors.get('uggedla');
  assert.equal(her.root.visible, true, 'she is there to be seen');
  assert.ok(seen.lying.rest < seen.lying.reed - 0.8, `her back, head and tail reach ${seen.lying.rest.toFixed(2)} m, well under the reed wall's middle height, ${seen.lying.reed.toFixed(2)} m`);
  assert.ok(seen.lying.sail > seen.lying.reed + 0.7, `but her sail reaches ${seen.lying.sail.toFixed(2)} m, over it`);
  assert.equal(seen.jaw.lying < 1, true, 'her mouth is shut');
  // From each camera that has her in the picture, no bit of her but the sail is in plain sight: every vertex of her skin that is there
  // and over the ground has two clumps of the reed between it and the camera, but a sliver (not one in a hundred).
  const cameras = LYING_SHOTS.filter(name => seen.lying.showing[name].visible > 0);
  assert.ok(cameras.length >= 4, `her sail is in the picture of ${cameras.join(', ')}`);
  for (const name of cameras) {
    const { visible, showing, highest } = seen.lying.showing[name];
    assert.ok(showing <= visible * 0.01, `${name}: ${showing} of ${visible} bits of her body show through the reed, up to ${highest.toFixed(2)} m`);
  }
});

test('the sail rises out of the reed in four seconds, rustling, and stays up', async () => {
  const { seen } = await reel();
  const { from, to } = phaseOf(seen, 'rising');
  assert.ok(Math.abs(to - from - 4) < 0.25, `the sail takes ${(to - from).toFixed(2)} s to rise`);
  const rows = during(seen, 'rising').filter(f => f.sailTop !== undefined);
  const before = seen.lying.sail, after = rows.at(-1).sailTop;
  assert.ok(after - before > 0.8, `it rises ${(after - before).toFixed(2)} m`);
  // it rises smoothly (never down, no jump) and it trembles: its top sways from side to side while it comes up
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].sailTop >= rows[i - 1].sailTop - 0.02, `the sail dips at ${rows[i].t.toFixed(2)} s`);
  assert.ok(rows.every((row, i) => i === 0 || row.sailTop - rows[i - 1].sailTop < 0.3), 'with no jump');
  const later = seen.frames.filter(f => f.t > to + 0.1 && f.phase === 'head up' && f.sailTop !== undefined);
  assert.ok(later.every(f => f.sailTop > after - 0.3), 'and it stays up');
});

test('her head comes up out of the water with a fish in her jaws, and she swallows it', async () => {
  const { seen, run } = await reel();
  const rows = during(seen, 'head up');
  const low = seen.frames.find(f => f.phase === 'lying' && f.t > 2.8);
  assert.ok(Math.max(...rows.map(r => r.head.y)) - low.head.y > 1.2, 'her head comes up out of the reed');
  assert.ok(seen.jaw.headUp <= 12.01, `her jaw opens ${seen.jaw.headUp.toFixed(1)} degrees at most`);
  const turn = Math.abs(((rows.at(-1).heading - rows[0].heading + 540) % 360) - 180);
  assert.ok(turn > 20, `she turns ${turn.toFixed(0)} degrees, her sail with her`);
  const fish = run.world.scene.getObjectByName('Uggeðla fish');
  assert.ok(fish, 'there is a fish');
  assert.equal(fish.visible, false, 'and it is gone, swallowed');
  assert.ok(run.soundLog.some(e => e.name === 'splash' && e.at >= phaseOf(seen, 'head up').from && e.at < phaseOf(seen, 'head up').to + 1), 'a splash as the head breaks the water');
});

test('catching fish in the air: the jaw opens a little and never past 12 degrees, shuts on the fish, and her head is back after', async () => {
  const { seen } = await reel();
  assert.equal(seen.catches.length, CATCHES.length);
  assert.ok(seen.jaw.catches <= 12.01, `her jaw opened ${seen.jaw.catches.toFixed(1)} degrees at the widest`);
  assert.ok(seen.jaw.catches >= 6, 'wide enough to see');
  const restHead = seen.frames.find(f => f.phase === 'head up' && f.t > phaseOf(seen, 'head up').to - 0.2).head;
  for (const record of seen.catches) {
    assert.equal(record.fish.calls, 1, `catch ${record.i}: the fish is told it is caught once`);
    assert.ok(record.snap, `catch ${record.i}: the jaws shut`);
    assert.ok(record.snap.distance <= 0.3, `catch ${record.i}: the fish is ${record.snap.distance.toFixed(2)} m from her snout's tip as the jaws close`);
    assert.ok(record.snap.jaw <= 12.01, `catch ${record.i}: the jaw is open ${record.snap.jaw.toFixed(1)} degrees`);
    assert.ok(record.end - record.start >= 1 && record.end - record.start <= 4.5, `catch ${record.i} takes ${(record.end - record.start).toFixed(1)} s`);
    assert.ok(record.headBack.distanceTo(restHead) < 1.2, `catch ${record.i}: her head is back (${record.headBack.distanceTo(restHead).toFixed(2)} m from where it was)`);
  }
  // the fish is not in her mouth at the end
  assert.equal(seen.world.scene.getObjectByName('Uggeðla fish').visible, false);
  // a fish that is high in the air is not caught lower
  const heights = seen.catches.map(r => r.fish.point.y);
  assert.ok(heights[2] - heights[0] > 1.5, 'three different heights');
});

test('Egill sits on her back in front of her sail, never in her skin, while she swims ten metres with him', async () => {
  const { seen } = await reel();
  const { from, to } = phaseOf(seen, 'swim');
  assert.ok(seen.meets.length >= 20, `${seen.meets.length} frames measured`);
  for (const meet of seen.meets) {
    // (the frame he lands in, where the float ends: he is where it puts him, and her neck is where her wade clip has it then, within 3 cm)
    if (meet.t > from + 0.1) assert.equal(meet.inside, 0, `at ${meet.t.toFixed(1)} s ${meet.inside} of his vertices are inside her, ${(meet.deepest * 100).toFixed(1)} cm at most`);
    else assert.ok(meet.deepest < 0.03, `landing, ${(meet.deepest * 100).toFixed(1)} cm of him is inside her`);
    if (meet.t > from + 1) assert.ok(meet.air < 0.1, `at ${meet.t.toFixed(1)} s he sits ${(meet.air * 100).toFixed(1)} cm over her skin`); // (his legs go out over half a second as he lands)
    assert.ok(meet.local.x > 2.3, `his middle is ${meet.local.x.toFixed(2)} m along her, her sail's front edge is at 2.3 m`);
    assert.ok(Math.abs(meet.local.z) < 0.3, `and on her middle, ${meet.local.z.toFixed(2)} m aside`);
  }
  const travelled = during(seen, 'swim');
  const metres = travelled.slice(1).reduce((sum, f, i) => sum + f.root.distanceTo(travelled[i].root), 0);
  assert.ok(metres >= 10, `she swam ${metres.toFixed(1)} m with him (${(to - from).toFixed(1)} s)`);
});

test('she swims low along the line at the speed asked, her sail up and the water ringing round her', async () => {
  const { seen, run } = await reel();
  const rows = during(seen, 'swim');
  const line = SWIM;
  const way = [[rows[0].root.x, rows[0].root.z], ...line]; // from where she lay, along the line
  const apart = point => Math.min(...withMiddles(way).map(p => Math.hypot(p[0] - point.x, p[1] - point.z)));
  const end = rows.at(-1).root;
  assert.ok(Math.hypot(end.x - line.at(-1)[0], end.z - line.at(-1)[1]) < 0.6, 'she gets to the end of the line');
  const body = rows.filter(f => f.t > rows[0].t + 1);
  assert.ok(Math.max(...body.map(f => apart(f.root))) < 1.2, `she keeps to the line (${Math.max(...body.map(f => apart(f.root))).toFixed(2)} m at the furthest)`);
  const steady = rows.filter(f => f.t > rows[0].t + 3 && f.t < rows.at(-1).t - 2);
  const speed = steady.slice(1).reduce((sum, f, i) => sum + f.root.distanceTo(steady[i].root), 0) / (steady.at(-1).t - steady[0].t);
  assert.ok(speed > 0.9 && speed < 1.4, `she swims at ${speed.toFixed(2)} m/s`);
  // low: her root under the water, her sail well up
  const level = WATER_LEVEL();
  assert.ok(steady.every(f => f.root.y < level - 1), 'her root is a metre or more under the water');
  assert.ok(steady.every(f => f.sailTop === undefined || f.sailTop > level + 4), 'with her sail up over it');
  // rings on the water round her while she goes
  const rings = seen.ripples.filter(r => r.at >= rows[0].t && r.at <= rows.at(-1).t);
  assert.ok(rings.length >= 6, `${rings.length} rings on the water`);
  const herAt = time => rows.reduce((best, f) => (Math.abs(f.t - time) < Math.abs(best.t - time) ? f : best), rows[0]).root;
  for (const ring of rings) assert.ok(Math.hypot(ring.x - herAt(ring.at).x, ring.z - herAt(ring.at).z) < 10, `a ring ${ring.at.toFixed(1)} s in is ${Math.hypot(ring.x - herAt(ring.at).x, ring.z - herAt(ring.at).z).toFixed(1)} m from her`);
  assert.equal(run.task.failed, false);
});

test('a tail stroke throws a splash at Mosi', async () => {
  const { seen, run } = await reel();
  const { from, to } = phaseOf(seen, 'splash');
  const mosi = run.world.actors.get('mosi');
  const rings = seen.ripples.filter(r => r.at >= from && r.at <= to + 1 && Math.hypot(r.x - mosi.root.position.x, r.z - mosi.root.position.z) < 4);
  assert.ok(rings.length >= 1, 'a ring spreads on the water by him');
  assert.ok(seen.sounds.some(e => e.name === 'tailSplash' && e.at >= from && e.at <= to + 1), 'and the splash sounds');
  const rows = seen.frames.filter(f => f.t >= from && f.t <= to && f.tail);
  const sideways = Math.max(...rows.map(r => r.tail.distanceTo(rows[0].tail)));
  assert.ok(sideways > 3, `her tail swings ${sideways.toFixed(1)} m`);
  // and the stroke is in the water: the tail's last joint comes down to within 2 m of the surface (the tail goes on a metre and a bit
  // beyond it, down to the water), not in the air 3 to 4 m up as it swims
  const level = WATER_LEVEL();
  const lowest = Math.min(...rows.map(r => r.tail.y));
  assert.ok(lowest < level + 2, `her tail's last joint comes down to ${(lowest - level).toFixed(2)} m over the water`);
  assert.ok(to - from < 5, `the stroke takes ${(to - from).toFixed(1)} s`);
});

test('her sail never tears, whatever she does: its top edge keeps its length and no triangle of it turns over', async () => {
  const { seen } = await reel();
  assert.ok(seen.gauge.length > 100);
  for (const g of seen.gauge) {
    assert.ok(g.ratio > 0.98 && g.ratio < 1.02, `at ${g.t.toFixed(1)} s (${g.phase}) the sail's top edge is ${(100 * (g.ratio - 1)).toFixed(1)} % long`);
    assert.equal(g.turned, 0, `at ${g.t.toFixed(1)} s (${g.phase}) ${g.turned} sail triangles turn over`);
  }
});

test('she is updated before the rider on her back, so that he sits where she is in the same frame', () => {
  const order = Object.keys(chapter.actors);
  assert.ok(order.indexOf('uggedla') < order.indexOf('egill'), `the actors are made in this order: ${order}`);
});

test('she lives in the water: rings by her, her sail swaying a little, nothing fast', async () => {
  let seen = null;
  const run = await inSiki(function* (s, c) { yield s.wait(24); }, {
    limit: 40,
    onFrame({ world, stage }) {
      const c = world.chapterState;
      if (!c?.uggedla) return;
      seen ??= { top: [], rings: world.forest.water.ripples, parts: herParts(c.uggedla.raw), heads: [] };
      c.uggedla.raw.root.updateMatrixWorld(true);
      if (stage.s.time > 2) {
        seen.top.push(seen.parts.mesh.getVertexPosition(seen.parts.sail[0], new V3()).applyMatrix4(seen.parts.mesh.matrixWorld).clone());
        seen.heads.push(c.uggedla.raw.headPosition(new V3()));
      }
    },
  });
  assert.equal(run.task.failed, false, String(run.task.error?.stack ?? run.task.error));
  const here = new V3(...xz(UGGEDLA_REED).flatMap((v, i) => (i ? [0, v] : [v])));
  const near = seen.rings.filter(r => Math.hypot(r.x - here.x, r.z - here.z) < 9 && r.at > 2);
  assert.ok(near.length >= 4, `${near.length} rings by her in 22 s`);
  const span = Math.max(...seen.top.map(p => p.distanceTo(seen.top[0])));
  assert.ok(span > 0.03 && span < 0.5, `her sail sways ${(span * 100).toFixed(0)} cm`);
  const head = Math.max(...seen.heads.map(p => p.distanceTo(seen.heads[0])));
  assert.ok(head < 1.2, `and she stays where she lies (her head moves ${head.toFixed(2)} m)`);
});

test('the warm-up draws the fish she holds in her jaws, so that it is not first drawn as she lifts her head', async () => {
  const { world } = await inSiki(function* (s) { yield s.wait(0.2); }, { limit: 5 });
  const warm = kafli2.chapter.warmUp(world, { place: 'siki' });
  const names = warm.objects.flatMap(root => { const n = []; root.traverse(o => n.push(o.name)); return n; });
  assert.ok(names.includes('Uggeðla fish'), 'the fish is drawn in Síkið\'s warm-up');
  warm.dispose();
});

// ---------------------------------------------------------------------------------------------
// The fishing (kafli2-fishing.js; scene 4): fish jump out of the channel one at a time, the child taps the big ones, Uggeðla catches each
// and Mosi counts them to five; a small one is let go; with no tap there is a hint and then her own catch.

const COUNT_TEXTS = ['Einn!', 'Tveir!', 'Þrír!', 'Fjórir!', 'Fimm!'];
const HINT_TEXT = chapter.lines.k2_mosi_hint_fish.text;
const SMALL_TEXT = chapter.lines.k2_uggedla_small.text;
const tapFish = pointer => pointer.tap('fish', { x: 640, y: 400 });

/**
 * The fishing played in Síkið (she gets up, then fishing(s, c)) by a child: `child({ fish, now, pointer, seen })` is called after every
 * frame, with the fish in the air (what the child sees: its kind, its phase, when it left the water) or null, and taps through the
 * pointer. `seen` collects the jumps (kind, spot, when it left the water and when it was gone), the taps and the result.
 */
function fished(child, { limit = 400 } = {}) {
  const seen = { began: null, ended: null, result: null, jumps: [], taps: [], tips: [] };
  let last = null;
  const play = inSiki(function* (s, c) {
    yield* getUp(s, c);
    seen.began = s.time;
    seen.result = yield* fishing(s, c);
    seen.ended = s.time;
    yield s.wait(0.5);
  }, {
    limit,
    onFrame({ world, stage, pointer }) {
      const c = world.chapterState;
      const now = stage.s.time;
      const fish = c?.fish ?? null;
      if (fish !== last) {
        if (last) seen.jumps.at(-1).gone = now;
        if (fish) seen.jumps.push({ kind: fish.kind, spot: fish.spot, at: now, gone: null });
        last = fish;
      }
      if (fish?.phase === 'caught' && !fish.measured) { // the jaws have just shut: how far the tip of her snout is from the fish
        fish.measured = true;
        seen.tips.push({ spot: fish.spot, up: fish.point.y - WATER_LEVEL(), error: c.uggedlaRig.tip.distanceTo(fish.point) });
      }
      if (seen.began !== null && seen.ended === null) child({ fish, now, pointer, seen });
    },
  });
  return play.then(run => ({ ...run, seen }));
}
const said = (run, texts) => run.captions.filter(caption => texts.includes(caption.text));

/** The waits of a child who does not tap the big fish: from the start and from each catch, the hint comes at 8 s and her own catch from 16 s. */
function holdsWaits(run, { hintTolerance, helpLate }) {
  const { seen } = run;
  let since = seen.began;
  const hints = said(run, [HINT_TEXT]).map(caption => caption.at);
  seen.result.caught.forEach((item, i) => {
    const hint = hints.find(at => at >= since);
    assert.ok(hint !== undefined && Math.abs(hint - since - HINT_AFTER) < hintTolerance, `catch ${i + 1}: the hint comes ${hint === undefined ? 'never' : (hint - since).toFixed(1)} s after the last catch (${HINT_AFTER} s)`);
    assert.ok(item.at - since >= HELP_AFTER && item.at - since < HELP_AFTER + helpLate, `catch ${i + 1}: she catches it ${(item.at - since).toFixed(1)} s after the last (${HELP_AFTER} s and a jump)`);
    since = item.at;
  });
  assert.equal(hints.length, FISH_COUNT, 'one hint for each wait');
}

test('an idle child: the hint 8 s after the start and after each catch, her own catch from 16 s, the five big fish counted one to five, and then it is over', async () => {
  const run = await fished(() => {});
  const { seen } = run;
  assert.equal(run.task.failed, false, String(run.task.error?.stack ?? run.task.error));
  assert.equal(seen.result.caught.length, FISH_COUNT, 'five big fish');
  assert.ok(seen.result.caught.every(item => item.how === 'helped'), 'every one of them hers: nobody tapped');
  assert.equal(seen.result.smallTaps, 0);
  holdsWaits(run, { hintTolerance: 0.6, helpLate: 6 });
  // counted one to five, in the masculine, in that order, once each, as each is caught
  const counts = said(run, COUNT_TEXTS);
  assert.deepEqual(counts.map(caption => caption.text), COUNT_TEXTS);
  counts.forEach((caption, i) => assert.ok(Math.abs(caption.at - seen.result.caught[i].at) < 0.3, `${caption.text} is said as the fish is caught`));
  assert.ok(seen.ended - seen.began < 125, `the fishing takes an idle child ${(seen.ended - seen.began).toFixed(0)} s`);
  assert.ok(run.task.done, 'and the scene goes on');
});

test('a child who taps the big fish in the air: each is caught within about 3 s and counted once, whatever else is tapped', async () => {
  const done = new WeakSet();
  const run = await fished(({ fish, now, pointer, seen }) => {
    if (fish?.phase === 'held' || fish?.phase === 'caught') tapFish(pointer); // more taps while she catches it
    // (as it leaves the water, as it comes down and in the middle: where it is, she reaches it)
    if (fish?.kind === 'big' && fish.phase === 'air' && now - fish.launched >= [0.5, 0.05, 1.0, 0.05, 1.05][seen.taps.length % 5] && !done.has(fish)) {
      done.add(fish);
      tapFish(pointer);
      tapFish(pointer); // two taps in one frame
      seen.taps.push({ at: now });
    }
    if (!fish && Math.floor(now * 4) % 3 === 0) tapFish(pointer); // and taps where there is no fish
  });
  const { seen } = run;
  assert.equal(seen.result.caught.length, FISH_COUNT, 'five, never more');
  assert.ok(seen.result.caught.every(item => item.how === 'tapped'));
  assert.deepEqual(said(run, COUNT_TEXTS).map(caption => caption.text), COUNT_TEXTS, 'each counted once, one to five');
  assert.equal(said(run, [HINT_TEXT]).length, 0, 'no hint for a child who taps at once');
  assert.equal(seen.taps.length, FISH_COUNT, 'five big fish tapped, one after the other');
  seen.result.caught.forEach((item, i) => {
    assert.ok(item.doneAt - seen.taps[i].at <= 3.4, `catch ${i + 1} takes ${(item.doneAt - seen.taps[i].at).toFixed(1)} s from the tap to her being back`);
    assert.ok(item.at - seen.taps[i].at < 2.2, `the jaws are on the fish ${(item.at - seen.taps[i].at).toFixed(1)} s after the tap`);
  });
  // one fish in the air at a time, and a breath between them
  seen.jumps.forEach((jump, i) => {
    assert.ok(jump.gone !== null, `fish ${i} goes`);
    if (i) assert.ok(jump.at - seen.jumps[i - 1].gone > 0.3, `fish ${i} leaves the water ${(jump.at - seen.jumps[i - 1].gone).toFixed(1)} s after the last is gone`);
  });
  // her snout is on the fish as the jaws shut, whether it was tapped as it left the water, at the top of its arc or as it came down
  assert.equal(seen.tips.length, FISH_COUNT);
  seen.tips.forEach((tip, i) => assert.ok(tip.error <= 0.3, `catch ${i + 1}: the tip of her snout is ${tip.error.toFixed(2)} m from the fish (spot ${tip.spot}, ${tip.up.toFixed(1)} m up)`));
  // the count's tone climbs the key one step for each, as the prints' does
  assert.deepEqual(run.soundLog.filter(e => e.name === 'countTone').map(e => e.detail?.index), [1, 2, 3, 4, 5]);
});

test('a tap on a small fish: Uggeðla says it is too small, it swims off with a splash and nothing is counted', async () => {
  const done = new WeakSet();
  let small = null;
  const run = await fished(({ fish, now, pointer }) => {
    if (!fish || done.has(fish) || fish.phase !== 'air' || now - fish.launched < 0.5) return;
    if (fish.kind === 'small' && !small) {
      done.add(fish);
      tapFish(pointer);
      small = { at: now, fish };
    } else if (fish.kind === 'big') {
      done.add(fish);
      tapFish(pointer);
    }
  });
  const { seen } = run;
  assert.ok(small, 'a small fish came and was tapped');
  const lines = said(run, [SMALL_TEXT]);
  assert.equal(lines.length, 1, 'she says so once');
  assert.ok(lines[0].at >= small.at && lines[0].at - small.at < 0.5, `at once (${(lines[0].at - small.at).toFixed(2)} s)`);
  assert.equal(seen.result.smallTaps, 1);
  assert.equal(seen.result.caught.length, FISH_COUNT);
  assert.deepEqual(said(run, COUNT_TEXTS).map(caption => caption.text), COUNT_TEXTS, 'it was not counted: still one to five');
  assert.equal(run.soundLog.filter(e => e.name === 'countTone').length, FISH_COUNT, 'and no tone for it');
  const jump = seen.jumps.find(item => item.kind === 'small' && item.at <= small.at && item.gone > small.at);
  assert.ok(jump.gone - small.at < 2.6, `the fish is gone ${(jump.gone - small.at).toFixed(1)} s after the tap`);
  assert.ok(run.soundLog.some(e => e.name === 'fish' && e.detail?.part === 'in' && e.at > small.at && e.at < small.at + 2.5), 'it goes into the water with a splash');
});

test('a child who taps only the small fish still gets the hint and then her help, and ends with five big fish counted', async () => {
  const done = new WeakSet();
  const run = await fished(({ fish, now, pointer }) => {
    if (fish?.kind === 'small' && fish.phase === 'air' && now - fish.launched >= 0.5 && !done.has(fish)) { done.add(fish); tapFish(pointer); }
  });
  const { seen } = run;
  assert.equal(seen.result.caught.length, FISH_COUNT);
  assert.ok(seen.result.caught.every(item => item.how === 'helped'), 'every one of them hers');
  assert.ok(seen.result.smallTaps >= 3, `${seen.result.smallTaps} small fish tapped`);
  assert.deepEqual(said(run, COUNT_TEXTS).map(caption => caption.text), COUNT_TEXTS);
  // a tap on a small fish does not put the waiting off: the hint and her catch come as they do for an idle child (a hint waits for her line)
  holdsWaits(run, { hintTolerance: 4, helpLate: 9 });
  assert.ok(said(run, [SMALL_TEXT]).length >= 3, 'and she says each is too small');
});

test('the jumps: about one in three is small and never two in a row, no spot twice in a row, the first is big, the same every time', () => {
  const order = jumpOrder(40);
  assert.equal(order.length, 40);
  assert.equal(order[0].kind, 'big', 'the first fish is a big one');
  order.forEach((jump, i) => {
    assert.ok(['big', 'small'].includes(jump.kind));
    assert.ok(Number.isInteger(jump.spot) && jump.spot >= 0 && jump.spot < FISHING_SPOTS.length);
    if (i) {
      assert.ok(!(jump.kind === 'small' && order[i - 1].kind === 'small'), `fish ${i} and ${i - 1} are both small`);
      assert.notEqual(jump.spot, order[i - 1].spot, `fish ${i} jumps where ${i - 1} did`);
    }
  });
  const smalls = order.filter(jump => jump.kind === 'small').length;
  assert.ok(smalls >= 15 && smalls <= 20, `${smalls} of 40 are small`);
  assert.deepEqual(jumpOrder(40), order, 'deterministic');
  assert.deepEqual(FISH_SIZES, { big: 1.5, small: 0.6 }, 'a metre and a half and sixty centimetres');
  assert.equal(BIG_FISH, FISH_SIZES.big, 'the fish she holds as her head first comes up is a big one');
  assert.equal(JUMP_SECONDS, 1.2);
  assert.deepEqual([HINT_AFTER, HELP_AFTER, FISH_COUNT], [8, 16, 5]);
});

test('a fish in the air is a tap target that moves with it, and a jump takes 1.2 s from the water to the water', async () => {
  const rows = [];
  const run = await fished(({ fish, now, pointer }) => {
    if (fish?.phase === 'air') {
      const target = pointer.targets.get('fish');
      rows.push({ now, kind: fish.kind, target: target?.point?.clone(), radius: target?.radius, fish: fish.point.clone() });
    }
  }, { limit: 40 });
  assert.equal(run.task.failed, false, String(run.task.error?.stack ?? run.task.error));
  assert.ok(rows.length > 60, `${rows.length} frames of fish in the air`);
  const level = WATER_LEVEL();
  for (const row of rows) {
    assert.ok(row.target && row.target.distanceTo(row.fish) < 0.01, 'the tap target is where the fish is');
    assert.equal(row.radius, TAP_RADIUS[row.kind]);
    assert.ok(row.fish.y >= level - 0.15, 'over the water');
  }
  const first = run.seen.jumps[0];
  assert.ok(Math.abs(first.gone - first.at - JUMP_SECONDS) < 0.1, `the first jump takes ${(first.gone - first.at).toFixed(2)} s`);
  const apex = Math.max(...rows.filter(row => row.kind === 'big').map(row => row.fish.y - level));
  assert.ok(apex > 2.0 && apex < 3.0, `a big fish rises ${apex.toFixed(1)} m over the water`);
  assert.ok(run.soundLog.filter(e => e.name === 'fish' && e.detail?.part === 'out').length >= 2, 'the plip as it leaves the water');
  assert.ok(run.soundLog.filter(e => e.name === 'fish' && e.detail?.part === 'in').length >= 2, 'and the splash as it falls back');
});

test('a tall screen sees every jump of a big fish and its tap target is at least 44 px', () => {
  // The director keeps the authored 16:10 frame's width on a screen taller than it is wide and shows more above and below
  // (engine/camera/director.js: effectiveFov), so the lens is wider than the shot's: the camera of a tablet held upright, 800x1280.
  const shot = SIKI_SHOTS.siki_fishing;
  const [width, height] = [800, 1280];
  const halfWidth = Math.atan(Math.tan(THREE.MathUtils.degToRad(shot.fov) / 2) * 1.6);
  const fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(halfWidth) / (width / height)));
  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1200);
  camera.position.set(...shot.position);
  camera.lookAt(new V3(...shot.target));
  camera.updateMatrixWorld(true);
  const focal = height / 2 / Math.tan(THREE.MathUtils.degToRad(fov) / 2);
  const point = new V3(), ndc = new V3();
  let narrowest = Infinity;
  for (let spot = 0; spot < FISHING_SPOTS.length; spot++) {
    for (const way of [1, -1]) {
      const path = jumpPath(spot, 'big', way);
      for (let u = 0; u <= 1.0001; u += 0.05) {
        path.at(u, point);
        ndc.copy(point).project(camera);
        assert.ok(ndc.z < 1 && Math.abs(ndc.x) < 0.95 && Math.abs(ndc.y) < 0.95, `spot ${spot}, way ${way}, ${Math.round(u * 100)} % of the jump is at ${ndc.x.toFixed(2)}, ${ndc.y.toFixed(2)}: not in the picture`);
        narrowest = Math.min(narrowest, (TAP_RADIUS.big / camera.position.distanceTo(point)) * focal);
      }
    }
  }
  assert.ok(narrowest >= 44, `the tap target of a big fish is ${narrowest.toFixed(0)} px in radius at the furthest, on an 800x1280 screen`);
});

test('a fish in the air reads as a fish on the screen: a small one at least about 30 px long, a big one 2.5 times that, on a wide screen and on a tablet held upright', () => {
  // The camera as the director has it for a screen of this size (a taller one keeps the authored 16:10 frame's width), the fish at the
  // top of its jump, side-on along FISH_ARC, its two ends projected: how long it is in pixels. (A big fish was a metre and a small
  // one 30 cm: the small one was 9 to 15 px and could not be seen.)
  const shot = SIKI_SHOTS.siki_fishing;
  const length = (width, height, spot, kind) => {
    const halfWidth = Math.atan(Math.tan(THREE.MathUtils.degToRad(shot.fov) / 2) * 1.6);
    const wide = width / height >= 1.6;
    const fov = wide ? shot.fov : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(halfWidth) / (width / height)));
    const camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, 1200);
    camera.position.set(...shot.position);
    camera.lookAt(new V3(...shot.target));
    camera.updateMatrixWorld(true);
    const middle = jumpPath(spot, kind, 1).at(0.5);
    const along = new V3(FISH_ARC[0], 0, FISH_ARC[1]).multiplyScalar(FISH_SIZES[kind] / 2);
    const a = middle.clone().add(along).project(camera), b = middle.clone().sub(along).project(camera);
    return Math.hypot(((a.x - b.x) * width) / 2, ((a.y - b.y) * height) / 2);
  };
  for (const [width, height, smallest, average] of [[1280, 800, 26, 30], [800, 1280, 16, 18]]) {
    const small = [], big = [];
    for (let spot = 0; spot < FISHING_SPOTS.length; spot++) {
      small.push(length(width, height, spot, 'small'));
      big.push(length(width, height, spot, 'big'));
      assert.ok(big[spot] >= 2.5 * small[spot] - 0.01, `${width}x${height}, spot ${spot}: a big fish is ${big[spot].toFixed(0)} px, a small one ${small[spot].toFixed(0)} px`);
    }
    assert.ok(Math.min(...small) >= smallest, `${width}x${height}: the smallest small fish is ${Math.min(...small).toFixed(1)} px long`);
    assert.ok(small.reduce((x, y) => x + y) / small.length >= average, `${width}x${height}: a small fish is ${(small.reduce((x, y) => x + y) / small.length).toFixed(1)} px long on average`);
  }
});

test('scene 4 as the chapter plays it for an idle child: she asks, the five are counted by Mosi and she thanks him, from the fishing shot', async () => {
  const { captions, world, seen, soundLog, stage, probes } = await playIdle();
  const start = sceneStart(world, 4);
  const texts = captions.filter(caption => caption.at >= start).map(caption => caption.text);
  const mine = [chapter.lines.k2_uggedla_help.text, ...COUNT_TEXTS, chapter.lines.k2_uggedla_thanks.text];
  assert.deepEqual(texts.filter(text => mine.includes(text)), mine, 'her ask, one to five, her thanks, in that order');
  assert.equal(captions.find(caption => caption.text === mine[0]).who, 'Uggeðla', 'her name over her words');
  assert.ok(seen.cuts.some(cut => cut.shot === 'siki_fishing' && cut.at >= start - 0.1), 'from the fishing shot');
  assert.ok(SIKI_SHOTS.siki_fishing.position[1] <= 2.2, 'with the camera down near Egill\'s height');
  const fishingFrames = probes.frames.filter(frame => frame.scene === 4 && frame.t >= start + 3);
  const [ex, ez] = xz(EGILL_BANK);
  assert.ok(fishingFrames.length > 60 && fishingFrames.every(frame => !frame.egillControlled && Math.hypot(frame.egill.x - ex, frame.egill.z - ez) < 0.4), 'and Egill has floated down off Mosi to stand by the water');
  assert.equal(soundLog.filter(e => e.name === 'countTone' && e.at >= start).length, FISH_COUNT);
  assert.ok(soundLog.filter(e => e.name === 'fish' && e.detail?.part === 'out').length >= FISH_COUNT, 'a plip for each fish that leaves the water');
  assert.ok(stage.s.time <= IDLE_LIMIT, 'and the chapter is over inside the idle limit');
  assert.equal(world.scene.getObjectByName('Fishing fish'), undefined, 'the fishing fish is taken away with the fishing');
});

// ---------------------------------------------------------------------------------------------
// Scene 3: the channel, the boat that is not one

/** How many clumps of the place's plants stand between a camera and a point (a clump is the cylinder its dense lower part fills). */
function clumpsBetween(from, to, { only = null } = {}) {
  const { plan } = sikiPlan();
  const [dx, dz] = [to.x - from.x, to.z - from.z];
  const length2 = dx * dx + dz * dz;
  let n = 0;
  for (const p of plan.placements) {
    if (only && !only.includes(p.name)) continue;
    const r = p.model.radius * p.scale * 0.5, top = p.y + p.model.height * p.scale * 0.8;
    const t = ((p.x - from.x) * dx + (p.z - from.z) * dz) / length2;
    if (t <= 0 || t >= 0.995) continue;
    if (Math.hypot(from.x + dx * t - p.x, from.z + dz * t - p.z) > r) continue;
    if (from.y + (to.y - from.y) * t > top) continue; // the way goes over it
    n++;
  }
  return n;
}

test('scene 3: the path is flooded, a big colourful sail rises out of the reed, "a boat", then her head comes up with a fish and it is Uggeðla, and her place goes on the map from her head', async () => {
  const run = await playIdle();
  const { captions, world, seen } = run;
  const start = sceneStart(world, 3), fishing = sceneStart(world, 4);
  const lines = captions.filter(caption => caption.at >= start && caption.at < fishing).map(caption => caption.text);
  assert.deepEqual(lines, THREE_LINES.map(textOf), 'flooded, across, the boat, hello boat, not a boat, her hello: in that order');
  assert.equal(captions.find(caption => caption.text === textOf('k2_uggedla_hello')).who, 'Uggeðla');
  const at = Object.fromEntries(THREE_LINES.map(id => [id, saidAt(run, id)]));
  const frames = framesIn(run, start, fishing);
  const sinkAt = t => frames.find(frame => frame.t >= t).sink;
  const tuckAt = t => frames.find(frame => frame.t >= t).tuck;
  // she lies low until Mosi has asked how to get across, the sail rises as he says "a boat", and stands up by the time Egill says hello to it
  assert.ok(sinkAt(at.k2_egill_across) > 3, `lying low as Egill asks (${sinkAt(at.k2_egill_across).toFixed(2)} m under)`);
  assert.ok(sinkAt(at.k2_mosi_boat) > 2.5, `and the sail has hardly begun to rise as Mosi says "boat" (${sinkAt(at.k2_mosi_boat).toFixed(2)} m under)`);
  assert.ok(sinkAt(at.k2_egill_helloboat) <= 1.5, `the sail stands as Egill says hello to it (${sinkAt(at.k2_egill_helloboat).toFixed(2)} m under)`);
  const rising = frames.filter(frame => frame.t >= at.k2_egill_across && frame.t < at.k2_mosi_notboat && frame.sink < 3.2 && frame.sink > 1.1);
  const riseSeconds = rising.at(-1).t - rising[0].t;
  assert.ok(riseSeconds >= 2 && riseSeconds <= 6, `the sail takes its time over the 2.25 m it rises: ${riseSeconds.toFixed(1)} s over the last metre or so`);
  // her head comes up with the fish after Egill's hello and before Mosi says it is Uggeðla
  assert.ok(tuckAt(at.k2_egill_helloboat) < 0.5, 'her head is still down as Egill says hello');
  assert.ok(tuckAt(at.k2_mosi_notboat) > 0.95, 'her head is up as Mosi says "this is no boat"');
  assert.ok(seen.cuts.some(cut => cut.shot === 'siki_portrait' && cut.at >= start), 'the sail is seen close across the channel');
  // her place goes on the map once, as she says hello, from where her head is on the screen
  assert.equal(run.probes.place.length, 1, 'one place goes on the map');
  const [place] = run.probes.place;
  assert.equal(place.id, 'uggedla');
  assert.ok(place.at >= at.k2_uggedla_hello && place.at <= fishing, `at ${place.at.toFixed(1)} s, as she says hello`);
  assert.ok(Math.hypot(place.from.x - place.head.x, place.from.y - place.head.y) < 1.5, `the marker flies from her head on the screen (${place.from.x.toFixed(0)}, ${place.from.y.toFixed(0)}; her head is at ${place.head.x.toFixed(0)}, ${place.head.y.toFixed(0)})`);
  assert.ok(place.head.x > 0 && place.head.x < 1280 && place.head.y > 0 && place.head.y < 800, 'which is on the screen');
});

test('a tap on the sail while it stands in the reed makes it glitter and nothing else', async () => {
  const idle = await playIdle();
  const tapped = await playUnattended(kafli2, { seeking: false, limit: IDLE_LIMIT, shaped: true, earlyTap: { name: 'sail', after: 1 } });
  assert.ok(tapped.seen.earlyTap, 'the sail is a tap target in scene 3');
  const start = sceneStart(tapped.world, 3), fishing = sceneStart(tapped.world, 4);
  assert.ok(tapped.seen.earlyTap.at >= start && tapped.seen.earlyTap.at < fishing, 'in the channel scene');
  assert.ok(tapped.added.some(o => o.name === 'Sparkles' && o.at >= tapped.seen.earlyTap.at - 1e-6 && o.at < tapped.seen.earlyTap.at + 0.2), 'glints fly from the sail as it is tapped');
  // the target is there from the moment the sail begins to rise and goes when her head comes up: nothing to find
  const frames = idle.probes.frames.filter(frame => frame.scene === 3);
  const first = frames.find(frame => frame.sailTarget), lastOne = frames.findLast(frame => frame.sailTarget);
  assert.ok(first && lastOne.t <= saidAt(idle, 'k2_mosi_notboat'), `the sail can be tapped from ${first?.t.toFixed(1)} s to ${lastOne?.t.toFixed(1)} s, while it stands in the reed`);
  assert.ok(first.t <= saidAt(idle, 'k2_mosi_boat') + 0.5 && first.t >= saidAt(idle, 'k2_egill_across'), 'from the moment it begins to rise');
  // and nothing else: the script is the same, line for line and second for second, as for the child who taps nothing
  const lines = r => r.captions.map(caption => `${caption.at.toFixed(3)} ${caption.text}`);
  assert.deepEqual(lines(tapped), lines(idle), 'every line is said when it was');
  assert.deepEqual(tapped.journal.stars, idle.journal.stars);
  assert.deepEqual([...tapped.journal.places], [...idle.journal.places]);
});

// ---------------------------------------------------------------------------------------------
// Scene 5: the invitation and her star

test('scene 5: Mosi invites her, she says yes, her star rises from the top of her sail and an idle child\'s flies into the book by itself', async () => {
  const run = await playIdle();
  const { captions, world, seen, journal } = run;
  const start = sceneStart(world, 5), ferry = sceneStart(world, 6);
  const texts = captions.filter(caption => caption.at >= start && caption.at < ferry).map(caption => caption.text);
  assert.deepEqual(texts, ['k2_mosi_invite_ugg', 'k2_uggedla_accept', 'k2_mosi_second'].map(textOf), 'the invitation, her yes, "the second star"');
  const second = saidAt(run, 'k2_mosi_second');
  assert.ok(seen.cuts.some(cut => cut.shot === 'siki_two_shot' && cut.at >= start - 0.1), 'the two of them face to face across the water');
  assert.ok(seen.cuts.some(cut => cut.shot === 'siki_star' && cut.at >= start), 'and her sail against the sky for the star');
  assert.equal(run.probes.star.length, 1, 'one star');
  const [star] = run.probes.star;
  assert.equal(star.id, 'k2_uggedla');
  assert.ok(star.at >= saidAt(run, 'k2_uggedla_accept') && star.at <= second, 'the star rises after her yes, and Mosi sees it');
  assert.ok(star.point.distanceTo(star.top) < 0.6, `from the top of her sail (${star.point.distanceTo(star.top).toFixed(2)} m from its highest point)`);
  // nobody taps: it flies in by itself after the wait for a tap
  assert.deepEqual(journal.stars, ['k2_uggedla'], 'and it is in the book');
  assert.ok(run.soundLog.some(e => e.name === 'star' && e.at >= start && e.at < ferry), 'with the star\'s sound');
  assert.ok(ferry - star.at > 7.5 && ferry - star.at < 14, `the star waits for the tap at most 8 s (the ferry begins ${(ferry - star.at).toFixed(1)} s after it rose)`);
});

// ---------------------------------------------------------------------------------------------
// Scene 6: the ferry

test('scene 6: Egill floats from Mosi\'s saddle onto her back seat, and the chat goes on in the table\'s order', async () => {
  const run = await playIdle();
  const { captions, world, seen } = run;
  const start = sceneStart(world, 6), hummocks = sceneStart(world, 7);
  const texts = captions.filter(caption => caption.at >= start && caption.at < hummocks).map(caption => caption.text);
  assert.deepEqual(texts, SIX.map(textOf), 'from "up on my back, Egill" to "Þórseðla\'s head, over the trees"');
  assert.equal(captions.find(caption => caption.text === textOf('k2_uggedla_aboard')).who, 'Uggeðla');
  // Egill is carried by his own float, never walks: he leaves Mosi's saddle after her invitation and is on her seat when Mosi says brrr
  const aboard = saidAt(run, 'k2_uggedla_aboard'), brrr = saidAt(run, 'k2_mosi_brrr'), head = saidAt(run, 'k2_egill_head');
  const frames = framesIn(run, aboard, hummocks);
  const floating = frames.filter(frame => frame.egillControlled && frame.seat && frame.egill.distanceTo(frame.seat) > 0.3);
  assert.ok(floating.length > 30, `he floats across (${floating.length} frames)`);
  assert.ok(floating[0].t >= aboard - 0.1, 'after she says "up on my back"');
  const seated = framesIn(run, brrr, head + 1);
  assert.ok(seated.length > 100 && seated.every(frame => frame.egillControlled && frame.seat && frame.egill.distanceTo(frame.seat) < 0.08), 'and from there to the end of the chat he sits on her seat, within 8 cm');
  const lifted = frames.find(frame => frame.seat && frame.egill.distanceTo(frame.seat) < 0.05);
  assert.ok(lifted.t < brrr, 'he has landed as Mosi says "brrr"');
  // the seat is hers: the carrying posture (her neck down) begins with it, not before the fishing is over
  assert.ok(run.probes.frames.some(frame => frame.scene === 6 && frame.seat), 'her back seat');
  assert.ok(!run.probes.frames.some(frame => frame.scene < 6 && frame.seat), 'no seat before the ferry (it lowers her neck)');
  // the ferry's shots: a few, none within 2.5 s of the last
  const cuts = seen.cuts.filter(cut => cut.at >= start && cut.at < hummocks && cut.shot?.startsWith('ferry_'));
  assert.ok(cuts.length >= 2 && cuts.length <= 3 + 3, `${cuts.length} cuts to the ferry's own shots: ${cuts.map(cut => `${cut.shot} ${cut.at.toFixed(0)}`).join(', ')}`);
});

test('scene 6: she swims along the ferry line and Mosi wades the shallow edge beside her, his feet in 0.3 to 0.6 m of water', async () => {
  const run = await playIdle();
  const start = sceneStart(run.world, 6), hummocks = sceneStart(run.world, 7);
  const brrr = saidAt(run, 'k2_mosi_brrr'), head = saidAt(run, 'k2_egill_head');
  const frames = framesIn(run, brrr, head + 1);
  // she is in the channel's deep water all the way: nearer the ferry line than 2 m, at least the depth of her swim
  const water = run.world.forest.water;
  const lineOf = point => Math.min(...FERRY_LINE.map(([x, z]) => Math.hypot(x - point.x, z - point.z)));
  let farthest = 0;
  for (const frame of frames) farthest = Math.max(farthest, lineOf(frame.her));
  assert.ok(farthest < 3.5, `she keeps to the ferry line (${farthest.toFixed(1)} m at the furthest)`);
  assert.ok(frames.every(frame => water.depthAt(frame.her.x, frame.her.z) >= 0.8), 'in water deeper than 0.8 m');
  // Mosi wades: his feet in water 0.3 to 0.6 m deep from the time he is in it until they are across
  const wading = frames.filter(frame => frame.t > brrr + 2.5); // (he steps into the water at "brrr")
  const depths = wading.map(frame => frame.depth);
  assert.ok(Math.min(...depths) >= 0.28 && Math.max(...depths) <= 0.62, `his feet are in ${Math.min(...depths).toFixed(2)} to ${Math.max(...depths).toFixed(2)} m of water`);
  // beside her: within 3 to 9 m of her middle through the chat
  const apart = wading.map(frame => Math.hypot(frame.mosi.x - frame.her.x, frame.mosi.z - frame.her.z));
  assert.ok(Math.min(...apart) > 2.5 && Math.max(...apart) < 10, `Mosi is ${Math.min(...apart).toFixed(1)} to ${Math.max(...apart).toFixed(1)} m from her middle`);
  // she has moved a good way: from her reed (the crossing) to the pool
  const gone = frames.at(-1).her;
  assert.ok(Math.hypot(gone.x - UGGEDLA_DROP.position[0], gone.z - UGGEDLA_DROP.position[2]) < 12, 'and is near the pool at the hummocks by the time Egill sees Þórseðla');
  assert.ok(start < brrr && hummocks > head);
});

test('scene 6: her tail splashes Mosi as she says "I swim with my tail", with Mosi level with her hips and 3 to 5 m off her side, and he is wetter for it', async () => {
  const run = await playIdle();
  const tail = saidAt(run, 'k2_uggedla_tail'), wetter = saidAt(run, 'k2_mosi_wetter');
  const splashes = run.soundLog.filter(e => e.name === 'tailSplash' && e.at >= tail - 0.1 && e.at < wetter + 0.5);
  assert.ok(splashes.length >= 1, 'the tail splash comes with her line');
  const splash = splashes[0];
  assert.ok(splash.at - tail < 6, `${(splash.at - tail).toFixed(1)} s after she begins to say it`);
  assert.ok(wetter - splash.at > -0.2 && wetter - splash.at < 3.5, 'and Mosi answers it: "now I am even wetter"');
  const frame = framesIn(run, splash.at, Infinity)[0];
  const h = (frame.heading * Math.PI) / 180, forward = [Math.cos(h), Math.sin(h)], right = [-Math.sin(h), Math.cos(h)];
  const [dx, dz] = [frame.mosi.x - frame.hips.x, frame.mosi.z - frame.hips.z];
  const along = dx * forward[0] + dz * forward[1], side = Math.abs(dx * right[0] + dz * right[1]);
  assert.ok(Math.abs(along) <= 3, `Mosi is level with her hips (${along.toFixed(1)} m ahead of them)`);
  assert.ok(side >= 2.8 && side <= 5.5, `and ${side.toFixed(1)} m off her side`);
  const water = run.world.forest.water;
  assert.ok(water.ripples.some(ring => Math.hypot(ring.x - frame.mosi.x, ring.z - frame.mosi.z) < 3.5 && ring.at >= splash.at - 0.2 && ring.at < splash.at + 1.5), 'a ring spreads by Mosi where the drops land');
});

test('scene 6: Þórseðla\'s head is over the trees, in frame, from a ferry camera as Egill says so', async () => {
  const run = await playIdle();
  const from = saidAt(run, 'k2_egill_head');
  const frames = framesIn(run, from, from + 3).filter(frame => frame.shot?.startsWith('ferry_'));
  assert.ok(frames.length > 60, `a ferry shot is up as Egill says it (${frames.length} frames of it)`);
  const clear = frames.filter(frame => {
    const { x, y, z } = frame.thorsedlaNdc;
    return z < 1 && Math.abs(x) < 0.85 && Math.abs(y) < 0.85 && clumpsBetween(frame.camera, frame.thorsedlaHead) === 0;
  });
  assert.ok(clear.length >= frames.length * 0.9, `her head is in the picture, with no tree or reed between it and the camera, in ${clear.length} of ${frames.length} frames`);
  assert.ok(frames.some(frame => frame.shot === 'ferry_back'), 'from over her sail');
});

test('scene 6: the ferry\'s cameras are in clear air: not in a clump of reed or against a trunk, with at most one clump between a camera and Mosi or her sail', async () => {
  const run = await playIdle();
  const start = sceneStart(run.world, 6), hummocks = sceneStart(run.world, 7);
  const frames = framesIn(run, start, hummocks).filter(frame => frame.shot?.startsWith('ferry_') && frame.camera);
  assert.ok(frames.length > 600, `${frames.length} frames in the ferry's shots`);
  const { plan } = sikiPlan();
  const lowPlants = ['horsetailReed', 'horsetailTall', 'fern', 'mossHummock', 'waterLily', 'bush'];
  /** Is the camera in a clump of reed or a bush, or under the crown of a tree or by its trunk (a leaf in the lens)? */
  const crowded = camera => plan.placements.find(p => {
    const top = p.y + p.model.height * p.scale;
    if (lowPlants.includes(p.name)) return camera.y < top * 0.8 && Math.hypot(camera.x - p.x, camera.z - p.z) < p.model.radius * p.scale * 0.5 + 0.3;
    const height = p.model.height * p.scale;
    return camera.y < top * 0.9 && Math.hypot(camera.x - p.x, camera.z - p.z) < (height > 4 ? Math.max(1.2, 0.4 * height) : 1.2); // under a tree's crown (0.4 of its height) or by a trunk
  });
  const worst = {};
  for (const frame of frames.filter((_, i) => i % 6 === 0)) {
    const row = worst[frame.shot] ??= { her: 0, mosi: 0, crowded: null };
    row.her = Math.max(row.her, clumpsBetween(frame.camera, frame.herMiddle.clone().setY(frame.herMiddle.y + 3))); // her sail, over her back
    row.mosi = Math.max(row.mosi, clumpsBetween(frame.camera, frame.mosi.clone().setY(frame.mosi.y + 3)));
    const hit = crowded(frame.camera);
    if (hit) row.crowded = `${hit.name} at ${hit.x.toFixed(1)}, ${hit.z.toFixed(1)} (t ${frame.t.toFixed(0)})`;
  }
  assert.deepEqual(Object.keys(worst).sort(), ['ferry_back', 'ferry_front', 'ferry_side'], 'the three of Task 3\'s ferry shots are used');
  for (const [shot, row] of Object.entries(worst)) {
    assert.equal(row.crowded, null, `${shot}: the camera is in ${row.crowded}`);
    assert.ok(row.her <= 1 && row.mosi <= 1, `${shot}: ${row.her} clumps between the camera and her sail, ${row.mosi} between it and Mosi, at the worst`);
  }
});

// ---------------------------------------------------------------------------------------------
// Scene 7: the hummocks and the book

test('scene 7: Egill floats back into Mosi\'s saddle, she tells of the berries and Mosi thanks her, she swims off and is hidden once out of view', async () => {
  const run = await playIdle();
  const { captions, world, book } = run;
  const start = sceneStart(world, 7);
  const texts = captions.filter(caption => caption.at >= start).map(caption => caption.text);
  assert.deepEqual(texts, ['k2_uggedla_berries', 'k2_mosi_thanks_ugg', 'k2_mosi_two'].map(textOf), 'the berries, the thanks and "two are in"');
  const berries = saidAt(run, 'k2_uggedla_berries'), thanks = saidAt(run, 'k2_mosi_thanks_ugg'), two = saidAt(run, 'k2_mosi_two');
  // he is in the saddle, root within 5 cm of its seat, from her berries to the book
  const sitting = framesIn(run, berries, thanks + 3);
  assert.ok(sitting.length > 100 && sitting.every(frame => frame.egillControlled && frame.egill.distanceTo(frame.saddle) < 0.05), 'Egill sits in Mosi\'s saddle, within 5 cm of its seat');
  // Mosi has come up out of the water onto the hummock
  const [hx, hz] = xz(HUMMOCK);
  assert.ok(Math.hypot(sitting[0].mosi.x - hx, sitting[0].mosi.z - hz) < 2.5, 'Mosi stands on the hummock');
  assert.ok(sitting[0].depth < 0.15, 'out of the water');
  assert.ok(Math.hypot(sitting[0].her.x - UGGEDLA_DROP.position[0], sitting[0].her.z - UGGEDLA_DROP.position[2]) < 5, 'and she is in the pool beside it');
  // she swims off after the thanks, and is hidden once she is out of view
  const after = framesIn(run, thanks, Infinity);
  const gone = after.findIndex(frame => !frame.visible);
  assert.ok(gone > 30, `she swims off for ${(after[gone]?.t - thanks).toFixed(1)} s and is then hidden`);
  assert.ok(after.slice(gone).every(frame => !frame.visible), 'and stays hidden');
  const before = after[gone - 1];
  assert.ok(before.herPoints.every(p => p.z >= 1 || Math.abs(p.x) > 1.02 || Math.abs(p.y) > 1.02), 'out of the picture (her root, head, tail and hips) in the last frame she was shown');
  // the book: opens on the dinosaurs with her card new and nodding, turns to the map, and Mosi says what's next as it does
  assert.deepEqual(book.opened.map(([tab]) => tab).slice(-2), ['dinosaurs', 'map'], 'the book opens on the dinosaurs and turns to the map');
  assert.deepEqual(book.nods.slice(-2), ['uggedla', null], 'Uggeðla, new on the Risaeðlur page, nods as it opens');
  assert.ok(two > thanks + 1, 'her thanks are before the book');
  assert.equal(run.task.done, true, 'and the script ends there (main.js shows "Áfram" into chapter 3)');
  assert.equal(chapter.next, 'kafli3');
});

// ---------------------------------------------------------------------------------------------
// An old save

test('the chapter on a save from before the split (Þórseðla\'s star, her places, a game of Háls og hali played): it plays through, Uggeðla\'s place adds nothing new, her star is added, and a page opened afresh goes on to chapter 4', async () => {
  const OLD = ['fen', 'sloedla', 'flugedla', 'uggedla'];
  let before = null;
  const adds = []; // what the journal's asks to put a place on the map came to: [id, was it new]
  const run = await playUnattended(kafli2, {
    limit: IDLE_LIMIT, shaped: true,
    savedWith(save) {
      for (const star of ['k1_kambedla', 'k2_thorsedla']) save.addStar(star);
      for (const place of OLD) save.addPlace(place);
      save.setHalsPlay({ played: true });
      before = save.get();
      const addPlace = save.addPlace;
      save.addPlace = id => { const fresh = addPlace(id); adds.push([id, fresh]); return fresh; };
    },
  });
  assert.equal(run.task.done, true, `still going at ${run.stage.s.time.toFixed(1)} s`);
  assert.equal(run.task.failed, false, String(run.task.error?.stack ?? run.task.error));
  assert.deepEqual(run.world.chapterTimeline.map(mark => mark.scene), [1, 2, 3, 4, 5, 6, 7]);
  const after = run.save.get();
  assert.deepEqual(after.places, OLD, 'the map has the same four places: hers was there already, so nothing new flies (and nothing twice)');
  assert.deepEqual(after.stars, [...before.stars, 'k2_uggedla'], 'her star is added to the two');
  assert.deepEqual(adds, [['uggedla', false]], 'the script asked once for her place, and it was there already: no marker flies');
  assert.equal(defaultChapter(run.save), 'kafli4', 'with Þórseðla\'s star there already, chapter 4 (the "Áfram" leads to chapter 3: chapter.next)');
  assert.equal(run.save.getHalsPlay().played, true, 'and Háls og hali stays open');
  assert.deepEqual(run.book.opened.map(([tab]) => tab).slice(-2), ['dinosaurs', 'map']);
});

test('the idle child\'s chapter takes at most 450 s, and every scene from the channel on has its time', async t => {
  const { world, stage } = await playIdle();
  const starts = world.chapterTimeline.map(mark => mark.at);
  const length = n => (starts[n] ?? stage.s.time) - starts[n - 1];
  t.diagnostic(`scene lengths: ${[3, 4, 5, 6, 7].map(n => `${n}: ${length(n).toFixed(0)} s`).join(', ')}; the chapter ${stage.s.time.toFixed(0)} s`);
  assert.ok(stage.s.time <= 450, `${stage.s.time.toFixed(1)} s`);
  assert.ok(length(3) > 20 && length(3) < 60, `the channel ${length(3).toFixed(0)} s`);
  assert.ok(length(5) > 20 && length(5) < 60, `the invitation and the star ${length(5).toFixed(0)} s`);
  assert.ok(length(6) > 35 && length(6) < 75, `the ferry ${length(6).toFixed(0)} s`);
  assert.ok(length(7) > 15 && length(7) < 45, `the hummocks ${length(7).toFixed(0)} s`);
});
