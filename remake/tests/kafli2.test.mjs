import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import * as kafli2 from '../chapters/kafli2.js';
import { chapter as kafli1 } from '../chapters/kafli1.js';
import { createSave, defaultChapter } from '../engine/save.js';
import { LOOKS } from '../engine/looks.js';
import { shapeGround } from '../world/forest/forest.js';
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

// Every line has its recording (the kafli2 set, recorded 2026-10-21). A line added before the controller records it fails here,
// named; setting this false while lines wait for their recording names them and marks the test skipped instead.
const RECORDINGS_REQUIRED = true;

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
  assert.ok(LOOKS[chapter.look], 'a look engine/looks.js has, not the morning an unknown name falls back to');
  assert.equal(LOOKS[chapter.look].sun.azimuth, 150, "the sun a little further round than chapter 1's");
  assert.equal(LOOKS[chapter.look].sun.elevation, 26, 'and a little lower');
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

// The ground of a place, as its forest builds it (the floor rises away from a clearing; the Fen's water is dug out of it and
// its hummocks raised: world/forest/forest.js, shapeGround).
const groundOf = name => {
  const { layout, shots } = chapter.locations[name];
  return shapeGround({ chapter }, { ...layout, shots }, layout.seed).terrain;
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

// The chapter played through by nobody on the places' own ground and water (the harness's `shaped`), watched frame by frame
// through what the script shares (world.chapterState, its `c`): once, for the tests below.
const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
let played = null;
function playTheFen() {
  played ??= (async () => {
    const seen = { phases: [], headDown: null, liftTilt: 0, lifting: 0, top: null, landed: null, life: [], ripples: 0 };
    let phase = null;
    let eyesOf = null; // her eyes' midpoint, carried by her Head bone (the face pass's eyes)
    const run = await playUnattended(kafli2, {
      limit: 300, shaped: true,
      onFrame({ world, stage }) {
        const c = world.chapterState;
        if (!c) return;
        const thorsedla = world.actors.get('thorsedla'), egill = world.actors.get('egill');
        if (!eyesOf) {
          let mesh = null;
          thorsedla.model.traverse(o => { if (!mesh && o.isSkinnedMesh) mesh = o; });
          const head = mesh.skeleton.bones.find(bone => bone.name === 'Head');
          const [a, b] = mesh.userData.face.eyes.map(e => new V3(...e.centre));
          mesh.updateMatrixWorld(true);
          const local = head.worldToLocal(a.add(b).multiplyScalar(0.5).applyMatrix4(mesh.matrixWorld));
          eyesOf = () => head.localToWorld(local.clone());
        }
        if (c.phase !== phase) {
          phase = c.phase;
          seen.phases.push({ phase, at: stage.s.time });
          if (phase === 'head down') {
            const eyes = eyesOf();
            const ground = world.heightAt(egill.root.position.x, egill.root.position.z);
            const head = egill.headPosition(new V3());
            seen.headDown = { eyes, ground, head, up: eyes.y - ground, apart: Math.hypot(eyes.x - head.x, eyes.z - head.z) };
          }
          if (phase === 'lookout') {
            c.seat.update();
            seen.top = { seat: c.seat.seat.clone(), up: c.seat.seat.y - thorsedla.root.position.y };
          }
          if (phase === 'in the saddle') {
            c.saddle.update();
            seen.landed = { gap: egill.root.position.distanceTo(c.saddle.seat), controlled: egill.controlled };
          }
        }
        if (phase === 'lifting') {
          c.seat.update();
          seen.lifting++;
          seen.liftTilt = Math.max(seen.liftTilt, THREE.MathUtils.radToDeg(UP.clone().applyQuaternion(c.seat.quaternion).angleTo(UP)));
        }
        const water = world.forest.water;
        if (water) seen.ripples = Math.max(seen.ripples, water.ripples.filter(r => world.clock.time - r.at < 2.6).length);
      },
    });
    seen.life = run.world.chapterState?.life?.log ?? [];
    return { ...run, seen };
  })();
  return played;
}

test('the chapter plays its eight scenes in order through the harness, from the glade into the Fen', async () => {
  const { task, stage, world, director, added } = await playTheFen();
  assert.equal(task.done, true, `the chapter was still going at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.deepEqual(world.chapterTimeline.map(mark => mark.scene), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(world.location, 'fen');
  const actor = name => world.actors.get(name);
  assert.equal(actor('thorsedla').root.visible, true, 'Þórseðla stands in the Fen');
  assert.equal(actor('kambedla').root.visible, false, 'and Kambeðla stayed in her glade');
  assert.equal(actor('egill').controlled, true, 'Egill sits in the saddle again');
  assert.equal(actor('mosi').root.getObjectByName('mosi saddle')?.visible, true, 'which is on Mosi from the start');
  assert.deepEqual(director.warnings, [], 'the camera keeps the style guide\'s rules');
  // Her place in the Fen: her root on the pool's bed, where the layout puts her.
  const at = actor('thorsedla').root.position;
  assert.ok(Math.hypot(at.x + 2, at.z + 9) < 1e-6 && at.y < -0.5, `she stands at (${at.x.toFixed(2)}, ${at.y.toFixed(2)}, ${at.z.toFixed(2)})`);
  assert.ok(added.some(o => o.name === 'Þórseðla leaves'), 'she bites the conifer and its leaves fall');
});

test('Þórseðla is alive: a nod or a bite every 7 to 12 s while her head is up, and the script never takes every ring of the water', async () => {
  const { seen } = await playTheFen();
  const idle = seen.life.filter(event => event.kind === 'kink' || event.kind === 'bite');
  assert.ok(idle.length >= 2, `${idle.length} nods and bites`);
  assert.ok(idle.some(event => event.kind === 'bite') && idle.some(event => event.kind === 'kink'), 'both');
  for (let i = 1; i < idle.length; i++) {
    if (idle[i].afterHold) continue; // the first after her head was busy counts from when it was free again
    const gap = idle[i].at - idle[i - 1].at;
    assert.ok(gap >= 7 - 1e-6 && gap <= 12 + 1e-6, `${gap.toFixed(1)} s between two of them`);
  }
  assert.ok(seen.ripples <= 4, `the script had ${seen.ripples} rings on the water at once (it has six)`);
});

test('the head comes down to Egill\'s eyes and the lift keeps him level', async () => {
  const { seen } = await playTheFen();
  const names = seen.phases.map(p => p.phase);
  for (const phase of ['head coming down', 'head down', 'floating up', 'lifting', 'lookout']) assert.ok(names.includes(phase), `${phase} (${names.join(', ')})`);
  const down = seen.headDown;
  assert.ok(down, 'her head came down');
  assert.ok(down.up >= 0.85 && down.up <= 1.15, `her eyes are ${down.up.toFixed(2)} m above Egill's ground (${down.eyes.y.toFixed(2)} m, his ground ${down.ground.toFixed(2)} m)`);
  assert.ok(down.apart <= 1.5, `her eyes are ${down.apart.toFixed(2)} m from his head, seen from above`);
  assert.ok(seen.lifting > 30 * 5, `the lift took ${(seen.lifting / 30).toFixed(1)} s`);
  assert.ok(seen.liftTilt <= 12, `the seat tipped ${seen.liftTilt.toFixed(1)} degrees on the way up`);
  assert.ok(seen.top, 'he reached the top');
  assert.ok(seen.top.up >= 8 && seen.top.up <= 9.5, `the seat ends ${seen.top.up.toFixed(2)} m above the ground she stands on`);
});

test('the slide lands in the saddle', async () => {
  const { seen } = await playTheFen();
  assert.ok(seen.phases.some(p => p.phase === 'sliding'), 'he slid');
  assert.ok(seen.landed, 'and landed');
  assert.ok(seen.landed.gap < 0.05, `his root is ${(seen.landed.gap * 100).toFixed(1)} cm from the saddle's seat`);
  assert.equal(seen.landed.controlled, true, 'riding Mosi again');
});
