import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as kafli2 from '../chapters/kafli2.js';
import { chapter as kafli1 } from '../chapters/kafli1.js';
import { createSave, defaultChapter } from '../engine/save.js';
import { createTerrain } from '../world/forest/terrain.js';
import { LIMITS } from '../engine/camera/director.js';
import { playUnattended } from './chapter-harness.mjs';

// Chapter 2 (remake/chapters/kafli2.js), "Boð til Þórseðlu": its lines, its places as data, the camera rules of its shots, the
// page's choice of chapter from the save, and its script played through by nobody (tests/chapter-harness.mjs).

const { chapter } = kafli2;
const file = relative => new URL(relative, import.meta.url);
const readJson = relative => JSON.parse(fs.readFileSync(file(relative), 'utf8'));
const SOURCE = readJson('../assets/audio/kafli2/lines-source.json');
const RECORDED = readJson('../assets/audio/lines.json');
const CHAPTER_TEXT = fs.readFileSync(file('../chapters/kafli2.js'), 'utf8');
const MAIN_TEXT = fs.readFileSync(file('../main.js'), 'utf8');

// The controller records the kafli2 set right after the chapter's first task, so until then a line may have no recording: the test
// names those lines and is marked skipped. From Task 4 on every line must have its recording: this becomes true.
const RECORDINGS_REQUIRED = false;

const words = text => text.replace(/\[[^\]]*\]\s*/g, '').trim(); // what is said, without the voice's tags

// ---------------------------------------------------------------------------------------------
// The lines

test('every chapter line has a recording and the source\'s words', t => {
  const source = new Map(SOURCE.map(line => [line.id, line]));
  // Each line of the source is one of the chapter's, read from its own recording, with the words it is recorded with.
  for (const [id, line] of source) {
    assert.match(id, new RegExp(`^k2_${line.speaker}_[a-z0-9_]+$`), `${id} names its speaker, ${line.speaker}`);
    assert.ok(chapter.cast[line.speaker], `${line.speaker} speaks ${id} but has no caption name`);
    assert.deepEqual(chapter.lines[id], { text: words(line.text), audio: id }, `${id} says what the source says, from its own recording`);
  }
  for (const id of Object.keys(chapter.lines)) assert.ok(source.has(id), `${id} is not a line of chapter 2 (kafli2/lines-source.json)`);
  // The counts are the chapter's own, one voice from one to ten, said as a footprint (fótspor) and a berry (ber) are counted.
  const counts = ['Eitt!', 'Tvö!', 'Þrjú!', 'Fjögur!', 'Fimm!', 'Sex!', 'Sjö!', 'Átta!', 'Níu!', 'Tíu!'];
  counts.forEach((text, i) => assert.equal(chapter.lines[`k2_mosi_${i + 1}`]?.text, text, `Mosi counts ${i + 1}`));
  // A line that says what another of the same speaker says is another take of it: its own seed, or the two would share one.
  const takes = new Map(); // "speaker: words" -> the seeds of its takes
  for (const line of SOURCE) {
    const same = `${line.speaker}: ${words(line.text)}`;
    const seeds = takes.get(same) ?? new Set();
    assert.ok(!seeds.has(line.seed ?? null), `${line.id} would be the same take as another "${same}": give it a seed of its own`);
    takes.set(same, seeds.add(line.seed ?? null));
  }
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

test('locations as data: the glade, the trail and the Fen, with who stands where and the shots of each', () => {
  assert.equal(chapter.id, 'kafli2');
  assert.equal(chapter.title, 'Boð til Þórseðlu');
  assert.equal(chapter.look, 'lateMorning');
  assert.equal(chapter.start, 'burknalaut');
  assert.deepEqual(Object.keys(chapter.locations), ['burknalaut', 'fenjaslod', 'fen'], 'in the order the story goes');
  assert.deepEqual(chapter.prepare, ['fenjaslod', 'fen'], 'the two new places are built behind the start button');
  // Four actors, all made at load: Þórseðla is the real Brontosaurus.
  assert.deepEqual(Object.keys(chapter.actors).sort(), ['egill', 'kambedla', 'mosi', 'thorsedla']);
  assert.match(chapter.actors.thorsedla.url, /\/brontosaurus\.glb$/);
  assert.deepEqual(chapter.cast.thorsedla, { name: 'Þórseðla', colour: '#89682e' }, 'her caption in the dark tone of her gold (STYLE.md 3)');
  assert.deepEqual(Object.keys(chapter.cast).sort(), ['egill', 'kambedla', 'mosi', 'thorsedla']);
  // Who stands in each place: Mosi everywhere, Kambeðla only in her glade, Þórseðla (one point or several along her 22 m) only in the Fen.
  const standing = name => Object.keys(chapter.locations[name].layout.actors ?? {});
  const has = (name, actor) => standing(name).some(key => key === actor || key.startsWith(`${actor}_`));
  for (const name of Object.keys(chapter.locations)) assert.ok(has(name, 'mosi'), `${name} says where Mosi stands`);
  assert.deepEqual(Object.keys(chapter.locations).filter(name => has(name, 'kambedla')), ['burknalaut']);
  assert.deepEqual(Object.keys(chapter.locations).filter(name => has(name, 'thorsedla')), ['fen']);
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

// The ground of a place, as its forest builds it (the floor rises away from a clearing).
const groundOf = name => {
  const { layout, shots } = chapter.locations[name];
  return createTerrain({ chapter }, { ...layout, shots }, layout.seed);
};

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

test('the default chapter follows the stars', () => {
  const saveWith = stars => {
    const save = createSave(null);
    for (const star of stars) save.addStar(star);
    return save;
  };
  assert.equal(defaultChapter(saveWith([])), 'kafli1', 'a new child starts at the beginning');
  assert.equal(defaultChapter(saveWith(['k1_kambedla'])), 'kafli2', "with Kambeðla's star, chapter 2");
  assert.equal(defaultChapter(saveWith(['k1_kambedla', 'k2_thorsedla'])), 'kafli2', 'and chapter 2 again with both, to play it again');
  // The page asks it when its address names no chapter; ?chapter= still says which.
  assert.match(MAIN_TEXT, /params\.get\('chapter'\)\s*\|\|\s*defaultChapter\(save\)/);
});

// ---------------------------------------------------------------------------------------------
// Played through by nobody

test('the skeleton plays its eight scenes in order through the harness, in the glade as chapter 1 left it', async () => {
  const { task, stage, world, director } = await playUnattended(kafli2, { limit: 60 });
  assert.equal(task.done, true, `the chapter was still going at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.deepEqual(world.chapterTimeline.map(mark => mark.scene), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(world.location, 'burknalaut');
  const actor = name => world.actors.get(name);
  assert.equal(actor('thorsedla').root.visible, false, 'Þórseðla is not in the glade');
  assert.equal(actor('kambedla').root.visible, true, 'Kambeðla is');
  assert.equal(actor('egill').controlled, true, 'Egill sits in the saddle');
  assert.equal(actor('mosi').root.getObjectByName('mosi saddle')?.visible, true, 'which is on Mosi from the start');
  assert.deepEqual(director.warnings, [], 'the camera keeps the style guide\'s rules');
});
