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
import { LIMITS } from '../engine/camera/director.js';
import { createSfx } from '../engine/audio/sfx.js';
import { CRITTER_SOUNDS } from '../chapters/kafli3-fen.js';
import { PRINT_ANIMALS, PRINT_SIZE } from '../chapters/kafli2-trail.js';
import {
  SIKI_LAYOUT, SIKI_SHOTS, MOSI_BANK, UGGEDLA_REED, FISHING_SPOTS, FERRY_LINE, MOSI_WADE_LINE, HUMMOCK, UGGEDLA_DROP, THORSEDLA_FAR,
} from '../chapters/kafli2-siki.js';
import { waterShape } from '../world/props/water.js';
import { playUnattended } from './chapter-harness.mjs';
import { createFakeContext } from './fake-audio.mjs';

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
const CHAPTER_TEXT = ['kafli2', 'kafli2-trail', 'kafli2-siki'].map(name => fs.readFileSync(file(`../chapters/${name}.js`), 'utf8')).join(''); // each ends in a newline
const MAIN_TEXT = fs.readFileSync(file('../main.js'), 'utf8');

// Every line has its recording (the kafli2 set, recorded 2026-10-21). A line added before the controller records it fails here,
// named; setting this false while lines wait for their recording names them and marks the test skipped instead.
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
  for (const [, id] of CHAPTER_TEXT.matchAll(/'(k2_(?:mosi|egill|thorsedla|kambedla)_[a-z0-9_]+)'/g)) {
    assert.ok(chapter.lines[id], `the script names '${id}', which is not one of its lines`);
  }
  // Each recording there is is the set's own; a line not recorded yet is named.
  const unrecorded = [];
  for (const [id, line] of Object.entries(chapter.lines)) {
    const entry = RECORDED[line.audio];
    if (!entry) unrecorded.push(id);
    else assert.equal(entry.src, `assets/audio/kafli2/${line.audio}.mp3`, `${id} is recorded in the kafli2 set`);
  }
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
  // cast (the captions' names) is the three who speak so far: Uggeðla's lines come with the scenes to be built.
  assert.deepEqual(Object.keys(chapter.actors).sort(), ['egill', 'kambedla', 'mosi', 'thorsedla', 'uggedla']);
  assert.match(chapter.actors.uggedla.url, /spinosaurus\.glb$/);
  assert.match(chapter.actors.thorsedla.url, /brontosaurus\.glb$/);
  assert.deepEqual(Object.keys(chapter.cast).sort(), ['egill', 'kambedla', 'mosi']);
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
  // The fish jump in the water round her head (6 m from her middle, along her), in open water she can reach.
  assert.ok(FISHING_SPOTS.length >= 5, `${FISHING_SPOTS.length} fishing spots`);
  const h = (UGGEDLA_REED.heading * Math.PI) / 180;
  const head = [UGGEDLA_REED.position[0] + Math.cos(h) * 6, UGGEDLA_REED.position[2] + Math.sin(h) * 6];
  for (const spot of FISHING_SPOTS) {
    assert.ok(depth(spot) >= 0.8, `a fish jumps from ${depth(spot).toFixed(2)} m of water`);
    const reach = Math.hypot(spot[0] - head[0], spot[1] - head[1]);
    assert.ok(reach >= 2 && reach <= 9, `${reach.toFixed(1)} m from her head`);
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
  assert.ok(away >= 80 && away <= 120, `Þórseðla is ${away.toFixed(0)} m beyond the hummocks`);
  const heading = (Math.atan2(end[1] - before[1], end[0] - before[0]) * 180) / Math.PI;
  const bearing = (Math.atan2(fz - end[1], fx - end[0]) * 180) / Math.PI;
  const off = Math.abs(((bearing - heading + 540) % 360) - 180);
  assert.ok(off < 30, `she is ${off.toFixed(0)} degrees off the way the ferry is going`);
  assert.ok(shape.signedAt(fx, fz) > 5, 'on dry ground');
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
  assert.equal(defaultChapter(saveWith(['k1_kambedla', 'k2_uggedla', 'k2_thorsedla'])), 'kafli3', 'and again, to play it again');
  // The page asks it when its address names no chapter; ?chapter= still says which.
  assert.match(MAIN_TEXT, /params\.get\('chapter'\)\s*\|\|\s*defaultChapter\(save\)/);
});

test('chapter 1 hands over to chapter 2 and chapter 2 to chapter 3 with an "Áfram" when the script ends, and chapter 3 to none yet', () => {
  assert.equal(kafli1.next, 'kafli2', 'chapter 1 names the next');
  assert.equal(chapter.next, 'kafli3', 'chapter 2 names chapter 3');
  assert.equal(kafli3.chapter.next, null, 'chapter 3 is the last so far');
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

// The chapter as it plays for a child who taps nothing, once, with how dark the picture was in its last frame.
let idled = null;
function playIdle() {
  idled ??= (async () => {
    const last = { fade: 0 };
    const run = await playUnattended(kafli2, {
      seeking: false, limit: IDLE_LIMIT, shaped: true,
      onFrame({ ui }) { last.fade = ui.fadeLevel; },
    });
    return { ...run, last };
  })();
  return idled;
}

test('the chapter plays its two scenes unattended, comes to Síkið and ends in black at the water, with no director warnings', async () => {
  const { task, stage, world, director, journal, last } = await playIdle();
  assert.equal(task.done, true, `the chapter was still going at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.ok(stage.s.time < IDLE_LIMIT, `it took ${stage.s.time.toFixed(1)} s`);
  assert.deepEqual(world.chapterTimeline.map(mark => mark.scene), [1, 2], 'the glade and the footprints, as before');
  assert.equal(world.location, 'siki', 'the trail ends in Síkið, where the scenes to be built go on');
  assert.ok(last.fade >= 0.999, `the picture has faded to black (${last.fade.toFixed(2)})`);
  assert.deepEqual(journal.stars, [], 'no star yet: Uggeðla\'s comes with the scenes to be built');
  assert.deepEqual(director.warnings, [], 'the camera keeps the style guide\'s rules');
});

// The trail's end is the arrival in Síkið (kafli2-siki.js: arriveInSiki): the trail's prints let go of, Mosi coming down the path to the
// water, Uggeðla lying low across it (hidden until her pose is built), Þórseðla far off in the trees, alive, and the Fen's water sounds.
test('Síkið: Mosi comes down the path to the water, Uggeðla waits unseen, Þórseðla stands far off, and the trail is let go of', async () => {
  const { world, soundLog, seen } = await playIdle();
  const c = world.chapterState;
  const mosi = world.actors.get('mosi'), egill = world.actors.get('egill');
  const [bx, bz] = xz(MOSI_BANK);
  assert.ok(Math.hypot(mosi.root.position.x - bx, mosi.root.position.z - bz) < 1, 'Mosi stands at the flooded path with his nose at the water');
  assert.ok(Math.abs(((mosi.heading - MOSI_BANK.heading + 540) % 360) - 180) < 8, `facing the water (${mosi.heading.toFixed(0)} degrees)`);
  assert.ok(Math.hypot(egill.root.position.x - mosi.root.position.x, egill.root.position.z - mosi.root.position.z) < 2, 'with Egill in the saddle on his back');
  assert.equal(world.actors.get('kambedla').root.visible, false, 'Kambeðla stayed in her glade');
  assert.equal(world.actors.get('uggedla').root.visible, false, 'Uggeðla lies low in the reed: not seen until her pose is built (the next task)');
  const [ux, uz] = xz(UGGEDLA_REED), her = world.actors.get('uggedla').root.position;
  assert.ok(Math.hypot(her.x - ux, her.z - uz) < 0.3, 'but she is at her reed');
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
  assert.deepEqual(world.chapterTimeline.map(mark => mark.scene), [1, 2]);
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
  const counted = captions.filter(c => c.at >= sceneStart(world, 2) && COUNTS.includes(c.text)).map(c => c.text);
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
