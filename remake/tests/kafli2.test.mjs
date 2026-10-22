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
import { HUG_SECONDS, WINK_SECONDS } from '../engine/sun-face.js';
import { createSfx } from '../engine/audio/sfx.js';
import { CRITTER_SOUNDS } from '../chapters/kafli2-fen.js';
import { playUnattended } from './chapter-harness.mjs';
import { createFakeContext } from './fake-audio.mjs';

// Chapter 2 (remake/chapters/kafli2.js), "Boð til Þórseðlu": its lines, its places as data, the camera rules of its shots, the
// page's choice of chapter from the save, and its script played through by nobody (tests/chapter-harness.mjs).

const { chapter } = kafli2;
const file = relative => new URL(relative, import.meta.url);
const readJson = relative => JSON.parse(fs.readFileSync(file(relative), 'utf8'));
const SOURCE = readJson('../assets/audio/kafli2/lines-source.json');
const RECORDED = readJson('../assets/audio/lines.json');
// The script, with its pieces: Þórseðla's part (kafli2-thorsedla.js), the trail's (kafli2-trail.js) and the Fen's (kafli2-fen.js), which
// speak lines of their own.
const CHAPTER_TEXT = ['kafli2', 'kafli2-thorsedla', 'kafli2-trail', 'kafli2-fen', 'kafli2-lookout'].map(name => fs.readFileSync(file(`../chapters/${name}.js`), 'utf8')).join(''); // each ends in a newline
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

test('chapter 1 hands over to chapter 2 with an "Áfram" when its script ends, and chapter 2 to none yet', () => {
  assert.equal(kafli1.next, 'kafli2', 'chapter 1 names the next');
  assert.equal(chapter.next, null, 'chapter 2 is the last so far');
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

// The chapter played through by nobody on the places' own ground and water (the harness's `shaped`), watched frame by frame
// through what the script shares (world.chapterState, its `c`): once, for the tests below.
const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);

// How Egill's skin and hers meet, as both are posed now: how many of his vertices are inside her (and how deep the deepest is), and
// how much air there is under the rest of him at the least. Her skin's triangles near him go on a grid of cells across the ground;
// a vertical line through one of his vertices that crosses her skin an odd number of times above it starts inside her.
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

let played = null;
function playTheFen() {
  played ??= (async () => {
    const seen = { phases: [], headDown: null, liftTilt: 0, lifting: 0, top: null, landed: null, life: [], ripples: 0, meet: [] };
    let phase = null;
    let liftFrom = null;
    let midway = false;
    let eyesOf = null; // her eyes' midpoint, carried by her Head bone (the face pass's eyes)
    const run = await playUnattended(kafli2, {
      limit: 600, shaped: true,
      onFrame({ world, stage, pointer }) {
        const c = world.chapterState;
        if (!c) return;
        // what a tap could reach as scene 5 ends (the first frame of scene 6)
        if (!seen.targetsAtSix && world.chapterTimeline?.some(e => e.scene === 6)) seen.targetsAtSix = new Set(pointer.targets.keys());
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
        // Her eyes and Egill's head: how high above his ground they are and how far apart, seen from above.
        const eyeToEye = () => {
          const eyes = eyesOf();
          const ground = world.heightAt(egill.root.position.x, egill.root.position.z);
          const head = egill.headPosition(new V3());
          return { eyes, ground, head, up: eyes.y - ground, apart: Math.hypot(eyes.x - head.x, eyes.z - head.z) };
        };
        if (c.phase === 'head down') seen.stillDown = eyeToEye(); // the last frame before he floats up, in the end
        if (c.phase !== phase) {
          phase = c.phase;
          seen.phases.push({ phase, at: stage.s.time });
          if (phase === 'head down') seen.headDown = eyeToEye();
          if (phase === 'lookout') {
            c.seat.update();
            seen.top = { seat: c.seat.seat.clone(), up: c.seat.seat.y - thorsedla.root.position.y, head: egill.headPosition(new V3()), lookout: c.lookout?.clone() };
          }
          if (phase === 'in the saddle') {
            c.saddle.update();
            seen.landed = { gap: egill.root.position.distanceTo(c.saddle.seat), controlled: egill.controlled };
          }
        }
        // Egill's skin and hers at the start of the lift, halfway up and at the top, and on every frame of the slide's first metre.
        const meet = when => seen.meet.push({ when, ...skinsMeet(thorsedla, egill) });
        if (phase === 'lifting' && liftFrom === null) {
          liftFrom = stage.s.time;
          meet('the start of the lift');
        }
        if (phase === 'lifting' && !midway && stage.s.time - liftFrom >= c.lift.rising / 2) {
          midway = true;
          meet('halfway up');
        }
        if (phase === 'lookout' && !seen.meet.some(m => m.when === 'the top')) meet('the top');
        if (phase === 'sliding' && c.slide?.phase === 'neck' && c.slide.along <= 1) meet(`the slide, ${c.slide.along.toFixed(2)} m down her neck`);
        // and as he floats up onto her head, while her head rises as her look at him fades (every third frame)
        if (phase === 'floating up' && (seen.floatFrames = (seen.floatFrames ?? 0) + 1) % 3 === 0) meet(`the float, frame ${seen.floatFrames}`);
        if (phase === 'lifting') {
          seen.lifting++;
          // Egill himself, as the ride sets him on the seat: how far his up leans from the world's
          seen.liftTilt = Math.max(seen.liftTilt, THREE.MathUtils.radToDeg(UP.clone().applyQuaternion(egill.root.quaternion).angleTo(UP)));
        }
        const water = world.forest.water;
        if (water) seen.ripples = Math.max(seen.ripples, water.ripples.filter(r => world.clock.time - r.at < 2.6).length);
      },
    });
    seen.life = run.world.chapterState?.life?.log ?? [];
    return { ...run, seen, watched: run.seen }; // watched: what the harness saw (the sun, the cuts)
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
  assert.ok(seen.ripples <= 3, `the script had ${seen.ripples} rings on the water at once (it keeps to three of the six)`);
});

test('the head comes down to Egill\'s eyes and the lift keeps him level', async () => {
  const { seen } = await playTheFen();
  const names = seen.phases.map(p => p.phase);
  for (const phase of ['head coming down', 'head down', 'floating up', 'lifting', 'lookout']) assert.ok(names.includes(phase), `${phase} (${names.join(', ')})`);
  const down = seen.headDown;
  assert.ok(down, 'her head came down');
  assert.ok(down.up >= 0.85 && down.up <= 1.15, `her eyes are ${down.up.toFixed(2)} m above Egill's ground (${down.eyes.y.toFixed(2)} m, his ground ${down.ground.toFixed(2)} m)`);
  assert.ok(down.apart <= 1.5, `her eyes are ${down.apart.toFixed(2)} m from his head, seen from above`);
  // and there they stay, through the talk and the choice, until he floats up
  const still = seen.stillDown;
  assert.ok(still.up >= 0.85 && still.up <= 1.15 && still.apart <= 1.5, `as he floats up her eyes are ${still.up.toFixed(2)} m up and ${still.apart.toFixed(2)} m from his head`);
  assert.ok(seen.lifting > 30 * 5, `the lift took ${(seen.lifting / 30).toFixed(1)} s`);
  assert.ok(seen.liftTilt <= 12, `Egill leaned ${seen.liftTilt.toFixed(1)} degrees on the way up`);
  assert.ok(seen.top, 'he reached the top');
  // On the back of her head (the coordinator's ruling of 22 October: a seat 0.55 m over Neck5 buried him in her neck), his root ends
  // 9.52 m above the bed of her pool, a little over the plan's 9.5: the bound is that height and 0.1 m.
  assert.ok(seen.top.up >= 8 && seen.top.up <= 9.62, `the seat ends ${seen.top.up.toFixed(2)} m above the ground she stands on`);
});

test('the lookout is where the chapter says: his head at the top of the lift, near the layout\'s sight lines', async () => {
  const { seen } = await playTheFen();
  const top = seen.top;
  assert.ok(top?.lookout, 'the lift measures where he looks out from (c.lookout)');
  assert.ok(top.lookout.distanceTo(top.head) < 0.05, `his head as he reaches the top (${top.lookout.distanceTo(top.head).toFixed(3)} m off)`);
  const head = new V3(...kafli2.LOOKOUT_HEAD);
  assert.ok(top.head.distanceTo(head) <= 0.25, `his head is ${top.head.toArray().map(v => v.toFixed(2))}, ${top.head.distanceTo(head).toFixed(2)} m from LOOKOUT_HEAD`);
  const lines = new V3(...chapter.locations.fen.layout.lookout);
  assert.ok(top.head.distanceTo(lines) <= 2, `and ${top.head.distanceTo(lines).toFixed(2)} m from where the sight lines start`);
});

test('Egill sits on her skin and never in it: up onto her head, up the lift and down the first metre of the slide', async () => {
  const { seen } = await playTheFen();
  const at = when => seen.meet.find(m => m.when === when);
  for (const when of ['the start of the lift', 'halfway up', 'the top']) {
    const meet = at(when);
    assert.ok(meet, `measured at ${when}`);
    assert.equal(meet.inside, 0, `at ${when} ${meet.inside} of his vertices are inside her, ${(meet.deepest * 100).toFixed(1)} cm at most`);
    assert.ok(meet.air < 0.08, `at ${when} he sits ${(meet.air * 100).toFixed(1)} cm over her skin`);
  }
  const slide = seen.meet.filter(m => m.when.startsWith('the slide'));
  assert.ok(slide.length >= 10, `${slide.length} frames of the slide's first metre`);
  for (const meet of slide) assert.equal(meet.inside, 0, `on ${meet.when} ${meet.inside} of his vertices are inside her`);
  const float = seen.meet.filter(m => m.when.startsWith('the float'));
  assert.ok(float.length >= 15, `${float.length} frames of the float`);
  for (const meet of float) assert.equal(meet.inside, 0, `on ${meet.when} ${meet.inside} of his vertices are inside her`);
});

test('the slide lands in the saddle', async () => {
  const { seen } = await playTheFen();
  assert.ok(seen.phases.some(p => p.phase === 'sliding'), 'he slid');
  assert.ok(seen.landed, 'and landed');
  assert.ok(seen.landed.gap < 0.05, `his root is ${(seen.landed.gap * 100).toFixed(1)} cm from the saddle's seat`);
  assert.equal(seen.landed.controlled, true, 'riding Mosi again');
});

// ---------------------------------------------------------------------------------------------
// The lookout, the far friends, the slide and the star (scenes 6 to 8), played by a child who never touches the screen

const FAR = ['sloedla', 'flugedla', 'uggedla'];
let idled = null;
function playIdle() {
  idled ??= (async () => {
    const seen = {
      frames: 0, shownLow: [], shownHigh: 0, lightest: Infinity, heaviest: 0, casters: 0, slideTarget: null, sliding: null, floatTarget: null, floating: null,
      uggedlaFirst: null, disposed: null, openings: [], fog: {}, wet: 0, wetAt: null,
    };
    let phase = null;
    const run = await playUnattended(kafli2, {
      seeking: false, limit: 600, shaped: true,
      onFrame({ world, stage, pointer }) {
        const c = world.chapterState;
        const far = c?.farFriends;
        if (far) {
          seen.frames++;
          const shown = FAR.filter(name => far.actorOf(name)?.root.visible && far.group.visible && far.group.parent);
          if (world.camera.position.y <= 6 && shown.length) seen.shownLow.push({ at: stage.s.time, y: world.camera.position.y, shown });
          if (shown.includes('uggedla') && !seen.uggedlaFirst) seen.uggedlaFirst = { at: stage.s.time, finds: c.farFinds?.length ?? 0 };
          // where each friend to be found is on the 1280 by 800 screen in the first frame of each of the lookout's two searches
          const exploring = world.director.mode === 'explore' && world.chapterTimeline.at(-1)?.scene === 6;
          if (exploring && !seen.wasExploring) {
            world.camera.updateMatrixWorld();
            seen.openings.push(Object.fromEntries(shown.filter(name => !c.farFinds?.some(found => found.name === name)).map(name => {
              const p = far.targets.find(t => t.name === name).point.clone().project(world.camera);
              return [name, { x: ((p.x + 1) / 2) * 1280, y: ((1 - p.y) / 2) * 800, front: p.z < 1 }];
            })));
          }
          seen.wasExploring = exploring;
          if (far.disposed && !seen.disposed) seen.disposed = { at: stage.s.time, scene: world.chapterTimeline.at(-1).scene, phase: c.phase, inScene: !!far.group.parent };
          if (shown.length >= 2) {
            seen.shownHigh++;
            for (const name of shown) {
              let triangles = 0;
              far.actorOf(name).root.traverse(o => {
                if (!o.isMesh || !o.visible) return;
                triangles += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
                if (o.castShadow) seen.casters++;
              });
              seen.heaviest = Math.max(seen.heaviest, triangles);
              seen.lightest = Math.min(seen.lightest, triangles);
            }
          }
        }
        // the lift and the slide wait for a tap on Egill, and go by themselves
        if (c?.phase !== phase) {
          phase = c?.phase;
          if (phase === 'floating up') seen.floating = stage.s.time;
          if (phase === 'sliding') seen.sliding = stage.s.time;
        }
        if (pointer.targets.has('seat') && seen.floatTarget === null) seen.floatTarget = stage.s.time;
        // Egill on his own feet (not riding, floating or sliding) is never in the water: the depth of it where he stands
        const egill = world.actors.get('egill'), water = world.forest?.water;
        if (water && !egill.controlled) {
          const depth = water.depthAt(egill.root.position.x, egill.root.position.z);
          if (depth > seen.wet) { seen.wet = depth; seen.wetAt = { at: stage.s.time, x: egill.root.position.x, z: egill.root.position.z }; }
        }
        // the fog's density in each scene: the least, the most, and the last
        const scene = world.chapterTimeline?.at(-1)?.scene;
        if (scene && world.scene.fog) {
          const d = world.scene.fog.density, f = (seen.fog[scene] ??= { min: d, max: d, last: d });
          f.min = Math.min(f.min, d); f.max = Math.max(f.max, d); f.last = d;
        }
        if (world.chapterTimeline?.at(-1)?.scene === 7 && pointer.targets.has('egill') && seen.slideTarget === null) seen.slideTarget = stage.s.time;
      },
    });
    return { ...run, seen, watched: run.seen }; // watched: what the harness saw (the sun, the cuts)
  })();
  return idled;
}

test('the chapter plays to its end unattended with no director warnings', async () => {
  const { task, stage, world, director, journal, book } = await playIdle();
  assert.equal(task.done, true, `the chapter was still going at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.ok(stage.s.time < 600, `it took ${stage.s.time.toFixed(1)} s`);
  assert.deepEqual(world.chapterTimeline.map(mark => mark.scene), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(world.location, 'fen');
  assert.deepEqual(journal.stars, ['k2_thorsedla'], 'Þórseðla\'s star is in the book');
  assert.deepEqual([...journal.places].sort(), [...FAR, 'fen'].sort(), 'and the Fen and the three far friends\' places are on its map');
  assert.deepEqual(book.opened.map(([tab]) => tab).slice(-2), ['stars', 'map'], 'the book opens on the stars and turns to the map');
  assert.deepEqual(director.warnings, [], 'the camera keeps the style guide\'s rules');
});

// main.js builds the trail and the Fen once the start button shows, a slice at a time, and makes the far friends after them: a
// child who taps at once comes to each before it is there. Here the trail takes 1.5 s to build and the Fen 200 s (long after the
// scene comes to it), and the far friends are left to the chapter; and then the trail takes 30 s (longer than the glade's scene).
test('no scene plays in a place still being built: the glade waits under the black for the trail, the Fen for its build and the far friends', async () => {
  const shotsOf = Object.fromEntries(Object.entries(chapter.locations).map(([name, location]) => [name, new Set(Object.keys(location.shots))]));
  const placeOf = shot => Object.keys(shotsOf).find(name => shotsOf[name].has(shot)) ?? null; // null: a shot made as it goes
  const visible = []; // every frame the picture shows (not under the black)
  const { task, stage, world, director, builds } = await playUnattended(kafli2, {
    seeking: false, limit: 700, makeLater: false, slowBuilds: { fenjaslod: 1.5, fen: 200 },
    onFrame({ t, world, ui, shot }) {
      if (ui.fadeLevel >= 0.999) return;
      const far = world.chapterState?.farFriends;
      visible.push({ t, location: world.location, shot, far: Boolean(far?.isReady || far?.disposed) });
    },
  });
  assert.equal(task.done, true, `the chapter was still going at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.deepEqual(world.chapterTimeline.map(mark => mark.scene), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(director.warnings, [], 'the camera keeps the style guide\'s rules');
  assert.ok(visible.length > 1000);
  // the glade fades in from black only once the trail is built
  assert.ok(builds.fenjaslod.built > 1.49, `the trail was built at ${builds.fenjaslod.built} s`);
  assert.ok(visible[0].t >= builds.fenjaslod.built, `the glade showed at ${visible[0].t.toFixed(2)} s, the trail built at ${builds.fenjaslod.built.toFixed(2)} s`);
  // the scene came to the Fen while it was still being built, and waited for it under the black
  const lastOnTheTrail = visible.filter(v => v.location === 'fenjaslod').at(-1);
  assert.ok(lastOnTheTrail.t < builds.fen.built, `the trail's last frame at ${lastOnTheTrail.t.toFixed(1)} s, the Fen built at ${builds.fen.built.toFixed(1)} s`);
  // every frame shown is of a place built, framed by a shot of that place, and in the Fen the far friends are made
  for (const frame of visible) {
    const build = builds[frame.location];
    assert.ok(build && build.built !== null && build.built <= frame.t, `${frame.location} showed at ${frame.t.toFixed(2)} s before it was built`);
    const place = placeOf(frame.shot);
    assert.ok(place === null || place === frame.location, `${frame.shot} (a shot of ${place}) showed in ${frame.location} at ${frame.t.toFixed(2)} s`);
    if (frame.location === 'fen') assert.ok(frame.far, `the Fen showed at ${frame.t.toFixed(2)} s before the far friends were made`);
  }
});

test('a child who taps at once: the black at the start holds until the trail is built and the far friends are made', async () => {
  const visible = [];
  const { task, builds } = await playUnattended(kafli2, {
    seeking: false, limit: 20, makeLater: false, slowBuilds: { fenjaslod: 12, fen: 1 },
    onFrame({ t, world, ui }) {
      if (ui.fadeLevel < 0.999) visible.push({ t, location: world.location, far: world.chapterState.farFriends.isReady });
    },
  });
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.ok(builds.fenjaslod.built > 11.9, `the trail was built at ${builds.fenjaslod.built} s`);
  assert.ok(visible.length > 0 && visible[0].t >= builds.fenjaslod.built, `the glade showed at ${visible[0]?.t.toFixed(2)} s`);
  assert.equal(visible[0].location, 'burknalaut');
  assert.ok(visible.every(v => v.far), 'with the far friends made');
});

test('no fail states: the far friends are hinted and found for a child who taps nothing, and the slide goes by itself', async () => {
  const { captions, world, seen } = await playIdle();
  const said = text => captions.filter(c => c.text === text).length;
  const lines = world.chapter.lines;
  for (const [k, name] of FAR.entries()) {
    assert.equal(said(lines[`k2_mosi_hint_far${k + 1}`].text), 3, `three hints for ${name}`);
    assert.equal(said(lines[`k2_mosi_found_${name}`].text), 1, `then she is found, and Mosi names her`);
  }
  const finds = world.chapterState.farFinds;
  assert.deepEqual(finds.map(f => f.name), FAR, 'in the order of the hints');
  assert.ok(finds.every(f => f.how === 'helped'), 'each found for the child');
  assert.ok(finds[0].at - sceneStart(world, 6) < 120, 'the first within two minutes of the lookout');
  assert.ok(seen.floating - seen.floatTarget >= 6 - 1e-6, `he floated up onto her head by himself after ${(seen.floating - seen.floatTarget).toFixed(1)} s`);
  assert.ok(seen.sliding - seen.slideTarget >= 5 - 1e-6, `and slid down by himself after ${(seen.sliding - seen.slideTarget).toFixed(1)} s`);
  const now = captions.find(c => c.text === lines.k2_thorsedla_now.text);
  assert.ok(now && now.at > finds[2].at, '"Nú veistu hvar þau eru." after the third');
});

test('the far friends only show from above', async () => {
  const { seen } = await playIdle();
  assert.ok(seen.frames > 1000, 'they were there to look at');
  assert.deepEqual(seen.shownLow.slice(0, 3), [], 'never with the camera at 6 m or lower');
  assert.ok(seen.shownHigh > 30 * 60, `they show in ${(seen.shownHigh / 30).toFixed(0)} s of frames from her head`);
  assert.ok(seen.heaviest <= 2200 && seen.lightest > 200, `each draws ${seen.lightest} to ${seen.heaviest} triangles (the light levels)`);
  assert.equal(seen.casters, 0, 'and casts no shadow');
  // In the first frame of each search every friend to find is on the screen, and clear of the star counter and of the place pin that
  // lands on it (style.css .journal-button, 12 px in from the top right, about 305 by 64 px, its badge 11 px above it; .flying-place
  // lands, 60 px across, on its book), so her burst and her marker's flight into the book read.
  const HUD = { left: 1280 - 12 - 305, bottom: 12 + 64 + 14 }, CLEAR = 25;
  assert.deepEqual(seen.openings.map(o => Object.keys(o)), [['sloedla', 'flugedla'], ['uggedla']], 'Slóeðla and Flugeðla, then Uggeðla');
  for (const opening of seen.openings) {
    for (const [name, { x, y, front }] of Object.entries(opening)) {
      assert.ok(front && x > 0 && x < 1280 && y > 0 && y < 800, `${name} on the screen as her search opens (${x.toFixed(0)}, ${y.toFixed(0)})`);
      assert.ok(!(x > HUD.left - CLEAR && y < HUD.bottom + CLEAR), `${name} at (${x.toFixed(0)}, ${y.toFixed(0)}) is clear of the star counter and the place pin`);
    }
  }
  // Uggeðla is kept back until the camera has turned away from her to the first two: not at the edge of the lift or the look down
  assert.ok(seen.uggedlaFirst && seen.uggedlaFirst.finds === 2, `Uggeðla first shows after the first two are found (${JSON.stringify(seen.uggedlaFirst)})`);
  // and once Egill is down in the saddle they let go of what they hold, and leave the scene
  assert.ok(seen.disposed && seen.disposed.scene === 7 && seen.disposed.phase === 'in the saddle' && !seen.disposed.inScene, `disposed of ${JSON.stringify(seen.disposed)}`);
});

/** The sun on the screen and in front of nobody, each time the run looked (chapter 1's test, kafli1.test.mjs). */
function assertInView(views, why) {
  assert.ok(views.length >= 5, `${why}: ${views.length} views`);
  for (const v of views) {
    assert.ok(Math.abs(v.x) < 0.85 && Math.abs(v.y) < 0.85, `${why}: the sun at ${v.x.toFixed(2)}, ${v.y.toFixed(2)} at ${v.at.toFixed(1)} s`);
    assert.ok(v.hands.every(([x, y]) => Math.abs(x) < 0.97 && Math.abs(y) < 0.97), `${why}: its hands off the screen at ${v.at.toFixed(1)} s`);
    assert.equal(v.hidden, false, `${why}: somebody in front of the sun or its hands at ${v.at.toFixed(1)} s`);
  }
}

test('when the star has landed the sun hugs itself with a big grin and winks, where the child sees it, with nobody in front', async () => {
  for (const [how, run] of [['a capture', playTheFen], ['a child who taps nothing', playIdle]]) {
    const { sunCalls, captions, watched: seen } = await run();
    const hug = sunCalls.find(c => c.call === 'hug');
    const wink = sunCalls.filter(c => c.call === 'wink').at(-1);
    assert.ok(hug && hug.scene === 8 && hug.shot === 'fen_sun_hug', `${how}: the hug in scene 8, in the sun's own shot (${hug?.scene}, ${hug?.shot})`);
    assert.ok(wink.scene === 8 && wink.at > hug.at + 0.5 && wink.at < hug.at + HUG_SECONDS - 0.5, `${how}: it winks while it hugs`);
    assertInView(seen.sunViews.filter(v => v.at >= hug.at && v.at <= hug.at + HUG_SECONDS), `${how}: the hug`);
    const held = seen.sunFrames.filter(f => f.at > hug.at + 0.5 && f.at < hug.at + HUG_SECONDS - 0.6);
    assert.ok(held.every(f => f.mouth === 'grin'), `${how}: with a big grin`);
    assert.ok(held.some(f => f.squash > 1.03), `${how}: and a squeeze`);
    const cuts = seen.cuts;
    const star = cuts.findLastIndex(cut => cut.shot === 'fen_star_rise' && cut.at < hug.at);
    assert.ok(star >= 0 && cuts[star + 1]?.shot === 'fen_sun_hug' && Math.abs(cuts[star + 1].at - hug.at) < 1e-6, `${how}: the star in its own shot, then the sun's, on whose cut it hugs`);
    assert.ok(hug.at - cuts[star].at >= 2.5, `${how}: the star's shot held ${(hug.at - cuts[star].at).toFixed(1)} s`);
    // and the sun's own shot is held too, until the book opens over it as Mosi says "Tvær komnar…"
    assert.equal(cuts.filter(cut => cut.at > hug.at + 1e-6 && cut.at < hug.at + 2.5).length, 0, `${how}: no cut in the sun's first 2.5 s`);
    const book = captions.find(caption => caption.text === kafli2.chapter.lines.k2_mosi_two.text && caption.at > hug.at);
    assert.ok(book && book.at - hug.at >= 2.5, `${how}: the sun's shot held ${(book?.at - hug.at).toFixed(1)} s before the book`);
  }
});

// ---------------------------------------------------------------------------------------------
// The footprints, the Fen's animals and the berries (scenes 2 to 4)

const COUNTS = ['Eitt!', 'Tvö!', 'Þrjú!', 'Fjögur!', 'Fimm!', 'Sex!', 'Sjö!', 'Átta!', 'Níu!', 'Tíu!'];
const sceneStart = (world, n) => world.chapterTimeline.find(mark => mark.scene === n)?.at;

test('the prints are counted one to ten in order, and the berries one to five', async () => {
  const { captions, world } = await playTheFen();
  const counted = (from, to) => captions.filter(c => c.at >= sceneStart(world, from) && c.at < sceneStart(world, to) && COUNTS.includes(c.text)).map(c => c.text);
  assert.deepEqual(counted(2, 3), COUNTS, 'Mosi counts the ten footprints, one to ten');
  assert.deepEqual(counted(4, 5), COUNTS.slice(0, 5), 'and the five berries, one to five');
  // each count comes with its print's splash and digit, in the order of the prints
  const log = world.chapterState.printLog;
  assert.deepEqual(log.filter(e => e.what === 'count').map(e => e.index), [...Array(10).keys()], 'a digit rises from each print in turn');
  for (const [i, text] of COUNTS.entries()) {
    const digit = log.find(e => e.what === 'count' && e.index === i);
    const said = captions.find(c => c.text === text && c.at >= digit.at - 1e-6);
    assert.ok(said && said.at - digit.at < 0.5, `"${text}" is said as its digit rises`);
  }
  assert.ok(sceneStart(world, 4) - sceneStart(world, 3) >= 12, 'the reveal takes its time');
  assert.equal(world.chapterState.basket.total, 5, 'five berries went into the basket');
});

test('the fen animals go into the book', async () => {
  const { journal, world } = await playTheFen();
  for (const id of ['frog', 'waterBeetle', 'waterStrider', 'salamander']) {
    assert.ok(journal.findings.includes(id), `the ${id} in its print is found (${journal.findings.join(', ')})`);
  }
  // the frog is chapter 1's: found again in a new place, it still flies into the book, where its card has a page for the Fen
  const { finds } = await playTheFen();
  assert.equal(finds.find(f => f.id === 'frog')?.options?.again, true, 'the print\'s frog is found again');
  // the others live in the Fen, a tap away: tap targets with their finding
  const fen = world.chapterState.fenCritters;
  assert.deepEqual(fen.spots.map(s => s.kind).sort(), ['dragonfly', 'earlyBird', 'fish', 'turtle']);
  // until he goes up her neck: from then on a tap is for the far friends, never an animal far below: not as scene 5 ends, nor after
  const { pointer, seen } = await playTheFen();
  assert.ok(seen.targetsAtSix, 'scene 6 began');
  for (const spot of fen.spots) {
    assert.equal(seen.targetsAtSix.has(spot.name), false, `${spot.name} is no tap target as scene 5 ends`);
    assert.equal(pointer.targets.has(spot.name), false, `${spot.name} is no tap target at the end of the chapter`);
  }
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

test('an idle child still gets the head down', async () => {
  const run = await playUnattended(kafli2, { seeking: false, limit: 420, shaped: true });
  const { world } = run;
  const five = sceneStart(world, 5);
  assert.ok(five !== undefined && five <= 420, `scene 5 at ${five?.toFixed(1)} s`);
  const c = world.chapterState;
  assert.equal(c.printLog.filter(e => e.what === 'count').length, 10, 'every print counted');
  assert.ok(c.printLog.filter(e => e.what === 'count').every(e => e.by === 'egill'), 'by Egill, for a child who taps nothing');
  assert.equal(c.basket.total, 5, 'five berries went into the basket');
  assert.deepEqual(c.picks.map(p => p.by), Array(5).fill('egill'), 'each picked by Egill');
  assert.ok(c.picks.every(p => p.kind === 'red'), 'all of them red');
  assert.ok(c.headDownAt > 0 && c.headDownAt < five, 'and her head came down to him before it');
});

test('a tap on Kambeðla as they go: her plates blink and she says goodbye', async () => {
  const { seen, captions } = await playUnattended(kafli2, { seeking: false, limit: 22, shaped: true, earlyTap: { name: 'kambedla', after: 1 } });
  assert.ok(seen.earlyTap, 'Kambeðla could be tapped in scene 1');
  const bye = captions.find(c => c.text === 'Góða ferð!');
  assert.ok(bye && bye.who === 'Kambeðla', 'she says goodbye');
  const others = captions.filter(c => c.who !== 'Kambeðla' && c.at < bye.at + 1.6 && c.at > bye.at - 0.1);
  assert.deepEqual(others, [], 'when nobody else is speaking');
});

test('a blue berry is the birds\': Mosi says so, and it stays on its bush', async () => {
  const blue = `berry_${chapter.locations.fen.layout.berries.findIndex(b => b.kind === 'blue')}_0`;
  const run = await playUnattended(kafli2, { seeking: false, limit: 215, shaped: true, earlyTap: { name: blue, after: 1 } });
  assert.ok(run.seen.earlyTap, `the blue berry ${blue} could be tapped`);
  assert.ok(run.captions.some(c => c.text === 'Nei, bláu berin eru fyrir fuglana. Þau rauðu!' && c.at > run.seen.earlyTap.at), 'Mosi: the blue ones are for the birds');
  const c = run.world.chapterState;
  assert.equal(c.berries.picked.has(blue), false, 'it is not picked');
  assert.ok(c.picks.every(p => p.kind === 'red'), 'only red ones go in the basket');
});

test('a tap on one of the Fen\'s own animals: it reacts, and goes in the book', async () => {
  const run = await playUnattended(kafli2, { seeking: false, limit: 175, shaped: true, earlyTap: { name: 'fen-dragonfly', after: 1 } });
  assert.ok(run.seen.earlyTap, 'the dragonfly could be tapped in the Fen');
  assert.ok(run.journal.findings.includes('dragonfly'), `the dragonfly is in the book (${run.journal.findings.join(', ')})`);
  assert.ok(run.seen.earlyTap.movedAt !== null, 'and it darted off');
  assert.ok(run.soundLog.some(e => e.name === CRITTER_SOUNDS.dragonfly && Math.abs(e.at - run.seen.earlyTap.at) < 0.1), 'with its own sound');
});

test('a tap on Þórseðla in the Fen: her tail swishes and leaves fall, nothing more', async () => {
  const run = await playUnattended(kafli2, { seeking: false, limit: 175, shaped: true, earlyTap: { name: 'thorsedla', after: 1 } });
  const { seen, added, world } = run;
  assert.ok(seen.earlyTap, 'she could be tapped as the Fen opens');
  const at = seen.earlyTap.at;
  assert.ok(added.some(o => o.name === 'Þórseðla leaves' && o.at >= at - 1e-6 && o.at - at < 0.1), 'leaves fall from her mouth at the tap');
  assert.equal(world.chapterState.taps, 1, 'one tap');
  assert.ok(world.chapterState.swishLog.some(t => t >= at - 1e-6 && t - at < 0.2), 'and her tail swishes at it');
});

test('the warm-up draws the basket with its glow, which shows only while he holds it up, at the climax; behind the start button only the actors', async () => {
  const { world } = await playUnattended(kafli2, { limit: 0.2 });
  const warm = kafli2.chapter.warmUp(world);
  const names = warm.objects.flatMap(root => { const n = []; root.traverse(o => n.push(o.name)); return n; });
  for (const name of ['Mud prints', 'Print water', 'Basket', 'Basket berries', 'Basket glow']) assert.ok(names.includes(name), `${name} is drawn`);
  warm.dispose();
  // behind the start button (the glade) only the actors: the start button waits for no more than the glade shows
  const atStart = kafli2.chapter.warmUp(world, { place: 'burknalaut' });
  assert.deepEqual(atStart.objects, [...world.actors.values()].map(actor => actor.root));
  assert.deepEqual(atStart.shots, ['glade_leaving']);
  atStart.dispose();
  // the trail its prints and its animals; the Fen its own animals, the leaf, the berries and the basket
  const namesOf = w => w.objects.flatMap(root => { const n = []; root.traverse(o => n.push(o.name)); return n; });
  const trail = kafli2.chapter.warmUp(world, { place: 'fenjaslod' });
  const fen = kafli2.chapter.warmUp(world, { place: 'fen' });
  for (const name of ['Mud prints', 'Print water']) {
    assert.ok(namesOf(trail).includes(name), `${name} on the trail`);
    assert.ok(!namesOf(fen).includes(name), `${name} not in the Fen`);
  }
  for (const name of ['Basket', 'Basket berries', 'Basket glow']) {
    assert.ok(namesOf(fen).includes(name), `${name} in the Fen`);
    assert.ok(!namesOf(trail).includes(name), `${name} not on the trail`);
  }
  const critterNames = w => namesOf(w).filter(name => name.startsWith('Critter warm-up-')).map(name => name.slice('Critter warm-up-'.length)).sort();
  assert.deepEqual(critterNames(trail), ['frog', 'salamander', 'waterBeetle', 'waterStrider']);
  assert.deepEqual(critterNames(fen), ['dragonfly', 'earlyBird', 'fish', 'turtle']);
  assert.equal(trail.objects.length + fen.objects.length - 2 * world.actors.size - 1, warm.objects.length - world.actors.size, 'and together all of it (one critters group each)');
  trail.dispose();
  fen.dispose();
});

test('a tap on her just before her tail swishes on its own: the swish she does then is a whole one, and so is its shot', async () => {
  let tappedAt = null, rode = false, calledAt = null;
  const run = await playUnattended(kafli2, {
    seeking: false, limit: 230, shaped: true,
    onFrame({ world, stage, pointer }) {
      // Egill gets down off Mosi to call up to her (the chapter lets go of his ride there): half a second on, the child taps her
      const c = world.chapterState;
      if (c?.riding) rode = true;
      if (rode && c.riding === null && calledAt === null) calledAt = stage.s.time;
      if (calledAt !== null && tappedAt === null && stage.s.time - calledAt >= 0.5) {
        tappedAt = stage.s.time;
        pointer.tap('thorsedla');
      }
    },
  });
  const { cuts } = run.seen;
  const low = cuts.findIndex(e => e.shot === 'fen_thorsedla_low');
  assert.ok(tappedAt !== null && low > 0, 'the child tapped her as Egill called, before the beat');
  const swishes = run.world.chapterState.swishLog;
  assert.equal(swishes.length, 2, 'her tail swished at the tap and again on its own');
  assert.ok(swishes[1] >= swishes[0] + 2.4 - 1e-6, 'the second only once the first was over');
  assert.ok(cuts[low + 1].at - cuts[low].at >= 2.5, `the low shot on her is held ${(cuts[low + 1].at - cuts[low].at).toFixed(1)} s`);
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
// The sound (engine/audio/sfx.js, engine/audio/fen-sounds.js), the lookout's haze and the sun's beats

test('every sound the script asks for exists', () => {
  const context = createFakeContext({ state: 'running' });
  const sfx = createSfx({ context, theme: readJson('../assets/audio/theme.json') });
  const known = name => {
    sfx.stop(); // a bed (the forest, the Fen) is laid once: each is asked for afresh
    context.advance(12);
    return sfx.play(name, { index: 1, seconds: 8 });
  };
  const calls = [...CHAPTER_TEXT.matchAll(/s\.sfx\(([^,)]*)/g)].map(m => m[1].trim());
  const literal = calls.filter(a => /^'[^']*'$/.test(a)).map(a => a.slice(1, -1));
  assert.deepEqual([...new Set(calls.filter(a => !/^'[^']*'$/.test(a)))], ['sound'], 'a sound not written out is an animal\'s, looked up in CRITTER_SOUNDS');
  for (const name of new Set([...literal, ...Object.values(CRITTER_SOUNDS)])) assert.equal(known(name), true, `"${name}" is a sound of the set`);
  // the brief's sounds are all asked for, and the forest only once: in the glade, until the trail goes into the Fen
  for (const name of ['fen', 'splash', 'ripple', 'countTone', 'berryPop', 'sniff', 'breathHuge', 'chew', 'liftTone', 'windHigh', 'slide', 'landSaddle', 'mapMark']) {
    assert.ok(literal.includes(name), `the script asks for ${name}`);
  }
  assert.equal(literal.filter(name => name === 'forest').length, 1);
  // every animal of the chapter with a voice has its own sound
  for (const kind of ['dragonfly', 'turtle', 'fish', 'earlyBird', 'frog']) assert.ok(CRITTER_SOUNDS[kind], `the ${kind} has a sound`);
});

test('the sounds come where the script has them: the Fen\'s water, the count, the berries, her head, the lift, the map and the slide', async () => {
  const { soundLog: log, world } = await playIdle();
  const named = (name, scene) => log.filter(e => e.name === name && (scene === undefined || e.scene === scene));
  // the forest's wind from the start button; the Fen's water from the trail's fen half on (and asked for again on arrival)
  assert.deepEqual(named('forest').map(e => e.scene), [undefined], 'the forest once, at the start');
  const fen = named('fen');
  assert.ok(fen.length >= 1 && fen[0].scene === 2, `the Fen's bed from scene 2 (${fen.map(e => e.scene)})`);
  assert.ok(fen.some(e => e.scene === 3), 'and on arrival in the Fen');
  // the count: each print a splash, its tone (climbing with the number) and its ripple, together
  const counts = named('countTone', 2);
  assert.deepEqual(counts.map(e => e.detail?.index), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'the tone climbs one to ten');
  assert.ok(fen[0].at < counts[0].at, 'the water is there before the first print');
  for (const count of counts) {
    for (const what of ['splash', 'ripple']) assert.ok(named(what, 2).some(e => Math.abs(e.at - count.at) < 0.05), `${what} with ${count.detail.index}`);
  }
  // the berries, popping up the key one to five
  assert.deepEqual(named('berryPop', 4).map(e => e.detail?.index), [1, 2, 3, 4, 5]);
  // her head: a sniff as it starts down, a big warm breath as it reaches his eyes, and she chews the berries
  const [sniff] = named('sniff', 4), [breath] = named('breathHuge', 4);
  assert.ok(sniff && breath && sniff.at < breath.at && breath.at - sniff.at < 6, 'a sniff, then her breath');
  assert.ok(named('chew', 4).some(e => e.at > breath.at && e.at < sceneStart(world, 5)), 'and the chew of the berries');
  // her bites chew as loud as near her head the camera is: soft in the reveal's wide view, whole up close, never from 25 m off
  const bites = named('chew').filter(e => e.detail?.level !== undefined);
  assert.ok(bites.length >= 3 && bites.every(e => e.detail.level > 0.02 && e.detail.level <= 1), `${bites.length} bites chewed`);
  assert.ok(bites.some(e => e.scene === 3 && e.detail.level < 0.5), 'a far one in the reveal, softly');
  // the early bird calls as it flies up out of the reed in the reveal
  assert.equal(named('earlyBird', 3).length, 1, 'the early bird calls');
  // the lift: its tone as long as the rise, the wind at the top, a mark on the map for each friend found
  const [lift] = named('liftTone', 6), [wind] = named('windHigh', 6);
  assert.ok(lift && lift.detail.seconds > 5 && lift.detail.seconds <= 8.01, `the lift's tone for ${lift?.detail?.seconds?.toFixed(2)} s`);
  assert.ok(wind && Math.abs(wind.at - lift.at - lift.detail.seconds) < 0.2, 'the wind as he reaches the top');
  assert.equal(named('mapMark', 6).length, 3, 'three places on the map');
  assert.equal(named('flower', 6).length, 3, 'three friends found');
  // the slide down her neck, and the landing in the saddle as he lands
  const [slide] = named('slide', 7), [land] = named('landSaddle', 7);
  assert.ok(slide && land && land.at - slide.at > 2.4 && land.at - slide.at < 3.3, `the landing ${(land?.at - slide?.at).toFixed(2)} s into the slide`);
  // the star and the book, as chapter 1's
  assert.ok(named('star', 8).length === 1 && named('journal', 8).length === 1);
});

test('the lookout\'s haze: 1.6 times the look\'s fog at the top, eased back for the slide, and the star in the look\'s own', async () => {
  const { seen } = await playIdle();
  const density = LOOKS.lateMorning.fog.density;
  const near = (a, b) => Math.abs(a - b) < 1e-9;
  for (const scene of [1, 2, 3, 4, 5]) assert.ok(near(seen.fog[scene].min, density) && near(seen.fog[scene].max, density), `scene ${scene} in the look's fog`);
  assert.ok(near(seen.fog[6].max, 1.6 * density), `the lookout at ${(seen.fog[6].max / density).toFixed(2)} times it`);
  assert.ok(near(seen.fog[7].last, density), 'back by the slide\'s end');
  assert.ok(near(seen.fog[8].min, density) && near(seen.fog[8].max, density), 'and scene 8 runs at the look\'s density');
});

test('the sun winks as her head comes down, on the screen with nobody in front of it, the whole wink', async () => {
  for (const [how, run] of [['a capture', playTheFen], ['a child who taps nothing', playIdle]]) {
    const { sunCalls, watched } = await run();
    const wink = sunCalls.find(c => c.call === 'wink' && c.scene === 4);
    assert.ok(wink, `${how}: it winks in scene 4`);
    const views = watched.winkViews.filter(v => v.at >= wink.at && v.at <= wink.at + WINK_SECONDS);
    assert.ok(views.length >= 4, `${how}: ${views.length} looks at the wink`);
    for (const v of views) {
      assert.ok(Math.abs(v.x) < 0.85 && Math.abs(v.y) < 0.85, `${how}: the sun at ${v.x.toFixed(2)}, ${v.y.toFixed(2)} at ${v.at.toFixed(2)} s`);
      assert.equal(v.hidden, false, `${how}: somebody in front of the sun at ${v.at.toFixed(2)} s`);
    }
  }
  const { seen, sunCalls } = await playTheFen();
  const wink = sunCalls.find(c => c.call === 'wink' && c.scene === 4);
  const down = seen.phases.find(p => p.phase === 'head coming down'), there = seen.phases.find(p => p.phase === 'head down');
  assert.ok(wink.at > down.at && wink.at + WINK_SECONDS < there.at, 'while her head comes down');
});

test('Egill on his own feet is never in the water: not on the bank, by the berries, nor where her face comes down', async () => {
  const { seen } = await playIdle();
  assert.equal(seen.wet, 0, `he stood ${seen.wet.toFixed(2)} m deep at ${JSON.stringify(seen.wetAt)}`);
});

test('the Fen goes onto the book\'s map as it opens: its marker flies in after "Þarna er hún!", found until her star makes it done', async () => {
  const { journal, captions, soundLog, world } = await playIdle();
  assert.equal(journal.places[0], 'fen', 'the Fen first, before the far friends');
  const there = captions.find(c => c.text === chapter.lines.k2_mosi_there.text);
  const mark = soundLog.find(e => e.name === 'mapMark' && e.scene === 3);
  assert.ok(there && mark && mark.at >= there.at && mark.at - there.at < 4, 'its mark right after Mosi\'s first line in the Fen');
  assert.ok(mark.at < sceneStart(world, 4), 'in scene 3');
});

test('while the slide waits for a tap on Egill he glitters, as the seat does before the lift', async () => {
  const { seen, added } = await playIdle();
  const glints = added.filter(o => o.name === 'Sparkles' && o.at >= seen.slideTarget - 1e-6 && o.at < seen.sliding);
  assert.ok(glints.length >= 3, `${glints.length} glints in the ${(seen.sliding - seen.slideTarget).toFixed(1)} s he waited`);
});

test('a full save as the page keeps it loads whole, and the map\'s places start empty', () => {
  const full = {
    stars: ['k1_kambedla'], findings: ['butterfly', 'frog'], seen: ['mosi', 'frog'],
    eitt: { skill: 0.4, losses: 2, wins: 3, tutorialDone: true },
    hals: { found: ['ammonite'], game: { turn: 3 }, intro: true, hello: true, played: true },
    yatzy: { skill: 0.5, losses: 1, wins: 2, badges: ['yatzy_mosi'], tutorialDone: true },
  };
  let written = null;
  const storage = { getItem: () => JSON.stringify(full), setItem: (key, value) => { written = JSON.parse(value); } };
  const save = createSave(storage);
  assert.deepEqual(save.get(), { stars: full.stars, findings: full.findings, seen: full.seen, places: [] });
  assert.deepEqual(save.getEitt(), full.eitt);
  assert.deepEqual(save.getHals(), { found: full.hals.found });
  assert.deepEqual(save.getHalsPlay(), { game: full.hals.game, intro: true, hello: true, played: true });
  assert.deepEqual(save.getYatzy(), full.yatzy);
  // a place found keeps every field as it was, with the place
  assert.equal(save.addPlace('fen'), true);
  assert.deepEqual(written, { ...full, places: ['fen'] });
});
