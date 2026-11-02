import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import * as kafli3 from '../chapters/kafli3.js';
import * as kafli2 from '../chapters/kafli2.js';
import { LOOKS } from '../engine/looks.js';
import { shapeGround } from '../world/forest/forest.js';
import { LIMITS } from '../engine/camera/director.js';
import { HUG_SECONDS, WINK_SECONDS } from '../engine/sun-face.js';
import { createSfx } from '../engine/audio/sfx.js';
import { CRITTER_SOUNDS, FEN_CRITTERS } from '../chapters/kafli3-fen.js';
import { FEN } from '../world/forest/config.js';
import { MAP_PLACES } from '../engine/book/map-page.js';
import { playUnattended } from './chapter-harness.mjs';
import { createFakeContext } from './fake-audio.mjs';
import { WAITING_FOR_VOICE } from './waiting-for-voice.mjs';

// Chapter 3 (remake/chapters/kafli3.js), "Boð til Þórseðlu": the Fen part of the old chapter 2 since the split of 31 October 2026
// (kafli2.test.mjs has the chapter before it): its lines, its place as data, the camera rules of its shots, and its script played
// through by nobody (tests/chapter-harness.mjs).

const { chapter } = kafli3;
const file = relative => new URL(relative, import.meta.url);
const readJson = relative => JSON.parse(fs.readFileSync(file(relative), 'utf8'));
const SOURCE = readJson('../assets/audio/kafli2/lines-source.json'); // the kafli2 set holds the recordings of both chapters
const RECORDED = readJson('../assets/audio/lines.json');
// The script, with its pieces: Þórseðla's part (kafli3-thorsedla.js), the Fen's (kafli3-fen.js) and the lookout's (kafli3-lookout.js),
// which speak lines of their own.
const CHAPTER_TEXT = ['kafli3', 'kafli3-thorsedla', 'kafli3-fen', 'kafli3-lookout'].map(name => fs.readFileSync(file(`../chapters/${name}.js`), 'utf8')).join(''); // each ends in a newline

// Every line has its recording (the kafli2 set). A line added before the controller records it fails here, named, unless it is
// in WAITING_FOR_VOICE (tests/waiting-for-voice.mjs: the lines new to this chapter, timed by their words until the plan's seventh
// task records them; the test tells which wait, and a waiting line that has its recording fails, so the set empties as they come);
// setting this false while lines wait for their recording names them and marks the test skipped instead.
const RECORDINGS_REQUIRED = true;
// Lines in the kafli2 set that neither chapter says: the old lookout's search for Uggeðla, which the wave replaced (the recordings
// stay). Chapter 2's "Önnur stjarnan!" and "Tvær komnar" were here until its star was built (the plan's sixth task): both chapters
// say every other line of the set.
const RETIRED = new Set(['k2_mosi_hint_far3', 'k2_mosi_found_uggedla']);

const words = text => text.replace(/\[[^\]]*\]\s*/g, '').trim(); // what is said, without the voice's tags

// ---------------------------------------------------------------------------------------------
// The lines

test('every chapter line has a recording, or waits for its voice, and the source\'s words', t => {
  const source = new Map(SOURCE.map(line => [line.id, line]));
  // Each line of the chapter is one of the source's (the kafli2 set), read from its own recording, with the words it is recorded with.
  for (const [id, line] of Object.entries(chapter.lines)) {
    const entry = source.get(id);
    assert.ok(entry, `${id} is not a line of the kafli2 set (kafli2/lines-source.json)`);
    assert.match(id, new RegExp(`^k[23]_${entry.speaker}_[a-z0-9_]+$`), `${id} names its speaker, ${entry.speaker}`);
    assert.ok(chapter.cast[entry.speaker], `${entry.speaker} speaks ${id} but has no caption name`);
    assert.deepEqual(line, { text: words(entry.text), audio: id }, `${id} says what the source says, from its own recording`);
  }
  // The berries are counted one to five, in the same voice and words as the footprints of chapter 2.
  const counts = ['Eitt!', 'Tvö!', 'Þrjú!', 'Fjögur!', 'Fimm!'];
  counts.forEach((text, i) => assert.equal(chapter.lines[`k2_mosi_${i + 1}`]?.text, text, `Mosi counts ${i + 1}`));
  // Whatever the script names as a line is one of them.
  for (const [, id] of CHAPTER_TEXT.matchAll(/'(k[23]_(?:mosi|egill|thorsedla|kambedla)_[a-z0-9_]+)'/g)) {
    assert.ok(chapter.lines[id], `the script names '${id}', which is not one of its lines`);
  }
  // Each recording there is is the set's own; a line not recorded yet is named: one that waits for its voice is told, any other fails.
  const unrecorded = [], waiting = [];
  for (const [id, line] of Object.entries(chapter.lines)) {
    const entry = RECORDED[line.audio];
    if (!entry) (WAITING_FOR_VOICE.has(id) ? waiting : unrecorded).push(id);
    else {
      assert.equal(entry.src, `assets/audio/kafli2/${line.audio}.mp3`, `${id} is recorded in the kafli2 set`);
      assert.ok(!WAITING_FOR_VOICE.has(id), `${id} has its recording now: take it out of WAITING_FOR_VOICE`);
    }
  }
  for (const id of WAITING_FOR_VOICE) assert.ok(chapter.lines[id] || kafli2.chapter.lines[id], `WAITING_FOR_VOICE names ${id}, which is not a line of chapter 2 or 3`);
  if (waiting.length) t.diagnostic(`${waiting.length} chapter 3 lines wait for their voice and are timed by their words: ${waiting.join(', ')}`);
  if (unrecorded.length) {
    const message = `${unrecorded.length} of ${Object.keys(chapter.lines).length} chapter 3 lines have no recording in lines.json yet `
      + `(node remake/tools/voice-lines.mjs --set kafli2 records them): ${unrecorded.slice(0, 5).join(', ')}${unrecorded.length > 5 ? ', …' : ''}`;
    if (RECORDINGS_REQUIRED) assert.fail(message);
    t.skip(message);
  }
});

test('the kafli2 set\'s lines are the two chapters\': each said by one of them, the same words where both say it, no two the same take', () => {
  const said = new Set([...Object.keys(chapter.lines), ...Object.keys(kafli2.chapter.lines)]);
  for (const line of SOURCE) {
    if (RETIRED.has(line.id)) assert.ok(!said.has(line.id), `${line.id} is said by a chapter now: take it out of RETIRED`);
    else assert.ok(said.has(line.id), `${line.id} is said by neither chapter 2 nor chapter 3`);
  }
  for (const id of Object.keys(chapter.lines)) {
    if (kafli2.chapter.lines[id]) assert.deepEqual(kafli2.chapter.lines[id], chapter.lines[id], `${id} is the same line in both chapters`);
  }
  // A line that says what another of the same speaker says is another take of it: its own seed, or the two would share one.
  const takes = new Map(); // "speaker: words" -> the seeds of its takes
  for (const line of SOURCE) {
    const same = `${line.speaker}: ${words(line.text)}`;
    const seeds = takes.get(same) ?? new Set();
    assert.ok(!seeds.has(line.seed ?? null), `${line.id} would be the same take as another "${same}": give it a seed of its own`);
    takes.set(same, seeds.add(line.seed ?? null));
  }
});

// ---------------------------------------------------------------------------------------------
// The chapter as data

test('locations as data: the Fen, who stands where in it, and the start in front of its reveal', () => {
  assert.equal(chapter.id, 'kafli3');
  assert.equal(chapter.title, 'Boð til Þórseðlu');
  assert.equal(chapter.next, 'kafli4', 'Boð til Flugeðlu follows');
  assert.equal(chapter.look, 'lateMorning');
  assert.ok(LOOKS[chapter.look], 'a look engine/looks.js has, not the morning an unknown name falls back to');
  assert.equal(LOOKS[chapter.look].sun.azimuth, 150, "the sun a little further round than chapter 1's");
  assert.equal(LOOKS[chapter.look].sun.elevation, 26, 'and a little lower');
  assert.equal(chapter.theme, 'kafli2/theme.json', 'it plays chapter 2\'s song, Dino Trail');
  assert.equal(chapter.start, 'fen');
  assert.deepEqual(Object.keys(chapter.locations), ['fen']);
  assert.deepEqual(chapter.prepare, [], 'the Fen is the start place, built before the start button: nothing to prepare');
  assert.equal(chapter.startShot, 'fen_reveal', 'the start button waits in front of the reveal');
  // Three actors, all made at load: Þórseðla is the real Brontosaurus, and Kambeðla stayed in her glade (chapter 2).
  assert.deepEqual(Object.keys(chapter.actors).sort(), ['egill', 'mosi', 'thorsedla']);
  assert.match(chapter.actors.thorsedla.url, /\/brontosaurus\.glb$/);
  assert.deepEqual(chapter.cast.thorsedla, { name: 'Þórseðla', colour: '#89682e' }, 'her caption in the dark tone of her gold (STYLE.md 3)');
  assert.deepEqual(Object.keys(chapter.cast).sort(), ['egill', 'mosi', 'thorsedla']);
  // Who stands in the Fen: Mosi, Egill, and Þórseðla (one point or several along her 22 m).
  const standing = Object.keys(chapter.locations.fen.layout.actors ?? {});
  const has = actor => standing.some(key => key === actor || key.startsWith(`${actor}_`));
  for (const actor of ['mosi', 'egill', 'thorsedla']) assert.ok(has(actor), `the Fen says where ${actor} stands`);
  assert.equal(has('kambedla'), false);
  for (const [name, { layout, shots }] of Object.entries(chapter.locations)) {
    assert.ok(Number.isInteger(layout.seed) && layout.clearing?.radius > 0 && layout.path?.length >= 2, `${name} has a forest to grow`);
    assert.ok(Object.keys(shots).length >= 6, `${name} keeps its shots clear: at least six in its own shots`);
  }
  // A name in two places, or in the chapter's own shots as well, would overwrite the other silently (main.js).
  const names = [...Object.keys(chapter.shots), ...Object.values(chapter.locations).flatMap(location => Object.keys(location.shots))];
  assert.equal(new Set(names).size, names.length, 'every shot has a name of its own');
  assert.ok(chapter.locations[chapter.start].shots[chapter.startShot], 'the start shot is in the start place');
  for (const shot of chapter.locations.fen.warmUp) assert.ok(chapter.locations.fen.shots[shot], `the warm-up view ${shot} is one of the Fen's shots`);
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
    const run = await playUnattended(kafli3, {
      limit: IDLE_LIMIT, shaped: true,
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

test('the chapter plays its six scenes in order through the harness, from the start in the Fen', async () => {
  const { task, stage, world, director, added } = await playTheFen();
  assert.equal(task.done, true, `the chapter was still going at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.deepEqual(world.chapterTimeline.map(mark => mark.scene), [3, 4, 5, 6, 7, 8], 'scenes 3 to 8 of the old chapter 2');
  assert.equal(world.location, 'fen');
  const actor = name => world.actors.get(name);
  assert.equal(actor('thorsedla').root.visible, true, 'Þórseðla stands in the Fen');
  assert.equal(world.actors.has('kambedla'), false, 'and Kambeðla is not in the chapter');
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
  const head = new V3(...kafli3.LOOKOUT_HEAD);
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
// The Fen to the end (scenes 3 to 8), played by a child who never touches the screen

const FAR = ['sloedla', 'flugedla', 'uggedla'];
const FIND = ['sloedla', 'flugedla']; // the two friends the child finds (Uggeðla waves; Grameðla is only seen)
const COUNTS = ['Eitt!', 'Tvö!', 'Þrjú!', 'Fjögur!', 'Fimm!'];
const sceneStart = (world, n) => world.chapterTimeline.find(mark => mark.scene === n)?.at;
// The seconds the chapter may take for a child who taps nothing: seven and a half minutes (the spec's own limit, section 1).
const IDLE_LIMIT = 450;
let idled = null;
function playIdle() {
  idled ??= (async () => {
    const seen = {
      frames: 0, shownLow: [], shownHigh: 0, lightest: Infinity, heaviest: 0, casters: 0, slideTarget: null, sliding: null, floatTarget: null, floating: null,
      uggedlaFirst: null, disposed: null, openings: [], fog: {}, wet: 0, wetAt: null,
      // Uggeðla's wave: where she is on the 1280 by 800 screen each frame from the second find on, when her kink (lifting her head)
      // began, and every name the pointer had as a target
      uggedlaOnScreen: [], kinkAt: null, pointerNames: new Set(),
      // Grameðla far off: when she shows (first, last), roars and walks, how far off the ground she stands as she roars, where on the
      // screen she is then, and where she is as she is hidden; the camera's fastest turn and zoom and its look down meanwhile; and every
      // call the script makes that puts something in the book, and every tap target it sets
      rex: { first: null, last: null, low: false, roarAt: null, walkAt: null, ground: null, onScreen: null, hidden: null },
      teaserCamera: { turn: 0, zoom: 0, down: 0, frames: 0 }, prevView: null, bookCalls: null, targetNames: new Set(),
    };
    let phase = null;
    const run = await playUnattended(kafli3, {
      seeking: false, limit: IDLE_LIMIT, shaped: true,
      onFrame({ world, stage, pointer }) {
        const c = world.chapterState;
        const far = c?.farFriends;
        if (!seen.bookCalls) {
          seen.bookCalls = [];
          for (const call of ['place', 'found', 'star']) {
            const real = stage.s[call];
            stage.s[call] = (...args) => { seen.bookCalls.push({ call, id: args[0], at: stage.s.time }); return real(...args); };
          }
          const target = stage.s.target;
          stage.s.target = (name, ...args) => { seen.targetNames.add(name); return target(name, ...args); };
        }
        const rex = far?.actorOf('gramedla');
        if (rex && !far.disposed) {
          const t = stage.s.time, g = seen.rex;
          const shownNow = rex.root.visible && far.group.visible && Boolean(far.group.parent);
          if (shownNow) {
            g.first ??= t;
            g.last = t;
            if (world.camera.position.y <= 6) g.low = true;
          } else if (g.last !== null && !g.hidden) g.hidden = { at: t, radius: Math.hypot(rex.root.position.x, rex.root.position.z) };
          if (g.roarAt === null && rex.mixer.existingAction(rex.clips.get('roar'))?.isRunning()) {
            g.roarAt = t;
            const { x, y, z } = rex.root.position;
            g.ground = Math.abs(y - world.heightAt(x, z));
            world.camera.updateMatrixWorld();
            const p = rex.centre(new V3()).project(world.camera);
            g.onScreen = { x: ((p.x + 1) / 2) * 1280, y: ((1 - p.y) / 2) * 800, front: p.z < 1, fov: world.camera.fov };
          }
          if (g.walkAt === null && rex.walking) g.walkAt = t;
          // the camera from the turn to her until the lens has opened again
          const teaser = c.teaser;
          if (teaser && (teaser.done === undefined || t <= teaser.done + 3)) {
            const dir = world.camera.getWorldDirection(new V3()), prev = seen.prevView, cam = seen.teaserCamera;
            if (prev && t > prev.t) {
              cam.turn = Math.max(cam.turn, THREE.MathUtils.radToDeg(dir.angleTo(prev.dir)) / (t - prev.t));
              cam.zoom = Math.max(cam.zoom, Math.abs(world.camera.fov - prev.fov) / (t - prev.t));
              cam.frames++;
            }
            cam.down = Math.max(cam.down, -THREE.MathUtils.radToDeg(Math.asin(dir.y)));
            seen.prevView = { t, dir, fov: world.camera.fov };
          }
        }
        if (far) {
          seen.frames++;
          const shown = FAR.filter(name => far.actorOf(name)?.root.visible && far.group.visible && far.group.parent);
          if (world.camera.position.y <= 6 && shown.length) seen.shownLow.push({ at: stage.s.time, y: world.camera.position.y, shown });
          if (shown.includes('uggedla') && !seen.uggedlaFirst) seen.uggedlaFirst = { at: stage.s.time, finds: c.farFinds?.length ?? 0 };
          if (shown.includes('uggedla') && c.farFinds?.length === 2) {
            world.camera.updateMatrixWorld();
            const p = far.targets.find(t => t.name === 'uggedla').point.clone().project(world.camera);
            seen.uggedlaOnScreen.push({ at: stage.s.time, x: ((p.x + 1) / 2) * 1280, y: ((1 - p.y) / 2) * 800, front: p.z < 1 });
          }
          const ugg = far.actorOf('uggedla'), kink = ugg?.clips.get('kink');
          if (kink && seen.kinkAt === null && ugg.mixer.existingAction(kink)?.isRunning()) seen.kinkAt = stage.s.time;
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
        for (const name of pointer.targets.keys()) seen.pointerNames.add(name);
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
  assert.ok(stage.s.time < IDLE_LIMIT, `it took ${stage.s.time.toFixed(1)} s`);
  assert.deepEqual(world.chapterTimeline.map(mark => mark.scene), [3, 4, 5, 6, 7, 8]);
  assert.equal(world.location, 'fen');
  assert.deepEqual(journal.stars, ['k2_thorsedla'], 'Þórseðla\'s star is in the book');
  assert.deepEqual([...journal.places].sort(), ['fen', 'flugedla', 'sloedla'], 'and the Fen and the two friends found are on its map (Uggeðla was on it already)');
  assert.deepEqual(book.opened.map(([tab]) => tab).slice(-2), ['dinosaurs', 'map'], 'the book opens on the dinosaurs and turns to the map');
  assert.deepEqual(book.nods.slice(-2), ['thorsedla', null], 'Þórseðla, new on the Risaeðlur page, nods as it opens');
  assert.deepEqual(director.warnings, [], 'the camera keeps the style guide\'s rules');
});

// main.js builds the Fen before the start button shows, and makes the far friends once it shows: a child who taps at once comes to
// the Fen's first frame before they are there. Here the chapter makes them (makeLater false), and the black waits for them.
test('a child who taps at once: the black at the start holds until the far friends are made, and the picture opens on the Fen\'s reveal', async () => {
  const visible = [];
  const { task, director } = await playUnattended(kafli3, {
    seeking: false, limit: 25, makeLater: false,
    onFrame({ t, world, ui, shot }) {
      if (ui.fadeLevel < 0.999) visible.push({ t, location: world.location, shot, far: world.chapterState.farFriends.isReady });
    },
  });
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.ok(visible.length > 0, 'the picture showed');
  assert.equal(visible[0].location, 'fen');
  assert.equal(visible[0].shot, 'fen_reveal', 'opening on the reveal');
  assert.ok(visible.every(v => v.far), 'with the far friends made');
  assert.deepEqual(director.warnings, [], 'the camera keeps the style guide\'s rules');
});

test('no fail states: the two far friends are hinted and found for a child who taps nothing, Uggeðla waves, and the slide goes by itself', async () => {
  const { captions, world, seen } = await playIdle();
  const said = text => captions.filter(c => c.text === text).length;
  const lines = world.chapter.lines;
  for (const [k, name] of FIND.entries()) {
    assert.equal(said(lines[`k2_mosi_hint_far${k + 1}`].text), 3, `three hints for ${name}`);
    assert.equal(said(lines[`k2_mosi_found_${name}`].text), 1, `then she is found, and Mosi names her`);
  }
  const finds = world.chapterState.farFinds;
  assert.deepEqual(finds.map(f => f.name), FIND, 'in the order of the hints, and Uggeðla is not one of them');
  assert.ok(finds.every(f => f.how === 'helped'), 'each found for the child');
  assert.ok(finds[0].at - sceneStart(world, 6) < 120, 'the first within two minutes of the lookout');
  assert.ok(seen.floating - seen.floatTarget >= 6 - 1e-6, `he floated up onto her head by himself after ${(seen.floating - seen.floatTarget).toFixed(1)} s`);
  assert.ok(seen.sliding - seen.slideTarget >= 5 - 1e-6, `and slid down by himself after ${(seen.sliding - seen.slideTarget).toFixed(1)} s`);
  const now = captions.find(c => c.text === lines.k2_thorsedla_now.text);
  assert.ok(now && now.at > finds[1].at, '"Nú veistu hvar þau eru." after the last find');
});

test('Uggeðla waves from her reed: nothing to find and nothing in the book, said by Mosi and Egill between Flugeðla\'s find and Grameðla\'s roar', async () => {
  const { captions, world, seen, stage } = await playIdle();
  const c = world.chapterState, lines = world.chapter.lines;
  const caption = id => captions.find(x => x.text === lines[id].text);
  const flugedla = c.farFinds.find(f => f.name === 'flugedla');
  const named = caption('k2_mosi_found_flugedla'), wave = caption('k3_mosi_wave'), hi = caption('k3_egill_hi');
  assert.ok(wave && hi && named, 'Mosi names Flugeðla, then says Uggeðla waves, and Egill says hello');
  assert.equal(wave.who, 'Mosi');
  assert.equal(hi.who, 'Egill');
  assert.equal(captions.filter(x => x.text === lines.k3_mosi_wave.text).length, 1, 'once');
  assert.ok(wave.at > flugedla.at && wave.at >= named.at + stage.s.lineDuration('k2_mosi_found_flugedla') - 0.05, 'after Flugeðla\'s find and what Mosi says of it');
  assert.ok(hi.at >= wave.at + stage.s.lineDuration('k3_mosi_wave') - 0.05, 'Egill answers when Mosi has finished');
  assert.ok(seen.rex.roarAt !== null && seen.rex.roarAt > hi.at, 'and Grameðla roars after it');
  assert.ok(seen.rex.walkAt > seen.rex.roarAt, 'and walks into the trees');
  // She lifts her head out of the reed (the kink) as Mosi begins, glittering first, and the camera has her on the screen, clear of the
  // star counter and the place pin
  assert.ok(seen.kinkAt !== null && seen.kinkAt < wave.at && wave.at - seen.kinkAt < 0.6, `she lifts her head ${(wave.at - seen.kinkAt).toFixed(2)} s before the line`);
  const sample = seen.uggedlaOnScreen.findLast(s => s.at <= wave.at);
  assert.ok(sample && sample.front && sample.x > 0 && sample.x < 1280 && sample.y > 0 && sample.y < 800, `Uggeðla on the screen as she waves (${sample?.x.toFixed(0)}, ${sample?.y.toFixed(0)})`);
  assert.ok(!(sample.x > 1280 - 12 - 305 - 25 && sample.y < 12 + 64 + 14 + 25), 'clear of the star counter and the place pin');
  assert.equal(sample.x > 100 && sample.x < 1180 && sample.y > 140, true, 'and not at the edge of the frame');
  // Nothing to find: she is no tap target and goes nowhere in the book; there is no search for her
  assert.ok(!seen.pointerNames.has('uggedla') && ![...seen.targetNames].some(name => /uggedla/.test(name)), 'she is no tap target');
  assert.deepEqual(seen.bookCalls.filter(call => /uggedla/.test(call.id)), [], 'no place, no find and no star for her in the book');
  assert.equal(c.farFinds.some(f => f.name === 'uggedla'), false, 'she is no find of the lookout');
  const retired = [...RETIRED].map(id => words(SOURCE.find(line => line.id === id).text));
  assert.deepEqual(captions.filter(x => retired.includes(x.text)), [], 'and no hint for her and no "found" line');
});

test('the far friends only show from above', async () => {
  const { seen } = await playIdle();
  assert.ok(seen.frames > 1000, 'they were there to look at');
  assert.deepEqual(seen.shownLow.slice(0, 3), [], 'never with the camera at 6 m or lower');
  assert.ok(seen.shownHigh > 30 * 60, `they show in ${(seen.shownHigh / 30).toFixed(0)} s of frames from her head`);
  assert.ok(seen.heaviest <= 2200 && seen.lightest > 200, `each draws ${seen.lightest} to ${seen.heaviest} triangles (the light levels)`);
  assert.equal(seen.casters, 0, 'and casts no shadow');
  // In the first frame of the search every friend to find is on the screen, and clear of the star counter and of the place pin that
  // lands on it (style.css .journal-button, 12 px in from the top right, about 305 by 64 px, its badge 11 px above it; .flying-place
  // lands, 60 px across, on its book), so her burst and her marker's flight into the book read.
  const HUD = { left: 1280 - 12 - 305, bottom: 12 + 64 + 14 }, CLEAR = 25;
  assert.deepEqual(seen.openings.map(o => Object.keys(o)), [['sloedla', 'flugedla']], 'Slóeðla and Flugeðla: the one search the lookout has');
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

test('Grameðla far off after the wave: the camera turns to her, she roars, Mosi says who she is, she walks into the trees, and nothing goes in the book', async () => {
  const { seen, captions, world, task, stage } = await playIdle();
  const c = world.chapterState, t = c.teaser, rex = seen.rex, lines = world.chapter.lines;
  assert.equal(task.done, true, 'the chapter still plays to its end');
  assert.ok(t && t.turn && t.roar && t.walk && t.gone && t.done, `every beat of the look at her (${JSON.stringify(t)})`);
  // After Uggeðla has waved and Egill has said hello, and before Þórseðla's last words up there
  const hi = captions.find(x => x.text === lines.k3_egill_hi.text);
  assert.ok(hi && t.turn >= hi.at + stage.s.lineDuration('k3_egill_hi') - 0.05, `the turn to her at ${t.turn.toFixed(1)} s, after "Hæ, Uggeðla!" at ${hi?.at.toFixed(1)} s`);
  const now = captions.find(x => x.text === lines.k2_thorsedla_now.text);
  assert.ok(now && now.at >= t.done, '"Nú veistu hvar þau eru." once she is gone, as before');
  // She is seen only from the turn to her until she is behind the trees, from her head
  assert.ok(rex.first !== null && rex.first >= t.turn && rex.last <= t.gone, `she shows from ${rex.first?.toFixed(1)} to ${rex.last?.toFixed(1)} s, the turn at ${t.turn.toFixed(1)} s and gone at ${t.gone.toFixed(1)} s`);
  assert.equal(rex.low, false, 'never with the camera at 6 m or lower');
  // As the camera settles on her she roars, on the ground and in the middle of the screen above the caption, and Mosi says who she is
  assert.ok(rex.roarAt !== null && Math.abs(rex.roarAt - t.roar) < 0.1, `she roars as the turn ends (${rex.roarAt?.toFixed(2)} s)`);
  assert.ok(rex.ground < 0.05, `standing on the ground (${rex.ground?.toFixed(3)} m off it)`);
  const { x, y, front, fov } = rex.onScreen;
  assert.ok(front && Math.abs(x - 640) < 160 && y > 64 + 40 && y < 800 * 0.7, `in the middle of the screen as she roars (${x.toFixed(0)}, ${y.toFixed(0)})`);
  assert.ok(Math.abs(fov - 30) < 0.5, `seen through the narrowed lens (${fov.toFixed(1)} degrees)`);
  const said = captions.filter(x => x.text === lines.k2_mosi_gramedla.text);
  assert.equal(said.length, 1, 'Mosi says "Sjáðu, lengst þarna! Þetta er Grameðla. Hana heimsækjum við seinna!" once');
  assert.equal(said[0].who, 'Mosi');
  assert.ok(said[0].at >= rex.roarAt && said[0].at < rex.walkAt, 'as she roars, before she goes');
  // Then she walks into the trees, and is hidden only once she is behind the far treeline
  assert.ok(rex.walkAt > rex.roarAt, `she roars (${rex.roarAt.toFixed(1)} s) before she walks (${rex.walkAt.toFixed(1)} s)`);
  assert.ok(rex.hidden && rex.hidden.radius > FEN.far.rings[0].radius + 2, `hidden ${rex.hidden?.radius.toFixed(1)} m from the Fen's middle, behind its far treeline (${FEN.far.rings[0].radius} m)`);
  // The camera keeps the style's limits all the while (STYLE.md 8): pan, zoom, and the look down
  assert.ok(seen.teaserCamera.frames > 100, 'the camera was watched');
  assert.ok(seen.teaserCamera.turn <= LIMITS.pan * 1.05, `it turns ${seen.teaserCamera.turn.toFixed(1)} degrees a second at most`);
  assert.ok(seen.teaserCamera.zoom <= LIMITS.zoom * 1.05, `its lens changes ${seen.teaserCamera.zoom.toFixed(1)} degrees a second at most`);
  assert.ok(seen.teaserCamera.down <= LIMITS.maxDown, `it looks ${seen.teaserCamera.down.toFixed(0)} degrees down at most`);
  // Nothing goes in the book: no find, no place, no star while she is seen, and she is no tap target
  const during = seen.bookCalls.filter(call => call.at >= t.turn && call.at <= t.done + 3);
  assert.deepEqual(during, [], 'nothing goes in the book while she is seen');
  assert.ok(!seen.bookCalls.some(call => /gramedla/.test(call.id)), 'and nothing of hers ever');
  assert.ok(![...seen.targetNames].some(name => /gramedla/.test(name)) && !c.farFriends.targets.some(target => target.name === 'gramedla'), 'she is no tap target');
  // Where she stands is the way the book's map has her from Þórseðla's pool: the map's Fen is the Fen's own ground, north up
  const slot = id => MAP_PLACES.find(place => place.id === id).at;
  const [gx, gy] = slot('gramedla'), [tx, ty] = slot('thorsedla');
  const mapWay = Math.atan2(gy - ty, gx - tx);
  const [lx, , lz] = kafli3.LOOKOUT_HEAD;
  const [sx, sz] = kafli3.GRAMEDLA_FAR;
  const way = Math.atan2(sz - lz, sx - lx);
  const apart = Math.abs(THREE.MathUtils.radToDeg(Math.atan2(Math.sin(way - mapWay), Math.cos(way - mapWay))));
  assert.ok(apart < 20, `she stands ${apart.toFixed(0)} degrees from the way the map has her`);
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
    // and the sun's own shot is held too, until the book opens over it as Mosi says "Þrjár komnar…"
    assert.equal(cuts.filter(cut => cut.at > hug.at + 1e-6 && cut.at < hug.at + 2.5).length, 0, `${how}: no cut in the sun's first 2.5 s`);
    const book = captions.find(caption => caption.text === kafli3.chapter.lines.k3_mosi_three.text && caption.at > hug.at);
    assert.ok(book && book.at - hug.at >= 2.5, `${how}: the sun's shot held ${(book?.at - hug.at).toFixed(1)} s before the book`);
  }
});

// ---------------------------------------------------------------------------------------------
// The Fen's animals and the berries (scenes 3 and 4)

test('the berries are counted one to five in order, and the reveal takes its time', async () => {
  const { captions, world } = await playTheFen();
  const counted = (from, to) => captions.filter(c => c.at >= sceneStart(world, from) && c.at < sceneStart(world, to) && COUNTS.includes(c.text)).map(c => c.text);
  assert.deepEqual(counted(3, 4), [], 'nothing is counted in the reveal');
  assert.deepEqual(counted(4, 5), COUNTS, 'Mosi counts the five berries, one to five');
  assert.ok(sceneStart(world, 4) - sceneStart(world, 3) >= 12, 'the reveal takes its time');
  assert.equal(world.chapterState.basket.total, 5, 'five berries went into the basket');
});

test('the Fen\'s animals live in it, a tap away until he goes up her neck, and the first of them is the chapter\'s first find', async () => {
  const { world, pointer, seen } = await playTheFen();
  // the animals live in the Fen, a tap away: tap targets with their finding; chapter 1's frog among them, found again there
  const fen = world.chapterState.fenCritters;
  assert.deepEqual(fen.spots.map(s => s.kind).sort(), ['earlyBird', 'fish', 'frog', 'turtle']);
  assert.deepEqual(fen.spots.filter(s => s.again).map(s => s.kind), ['frog'], 'the frog is found again in a new place');
  // until he goes up her neck: from then on a tap is for the far friends, never an animal far below: not as scene 5 ends, nor after
  assert.ok(seen.targetsAtSix, 'scene 6 began');
  for (const spot of fen.spots) {
    assert.equal(seen.targetsAtSix.has(spot.name), false, `${spot.name} is no tap target as scene 5 ends`);
    assert.equal(pointer.targets.has(spot.name), false, `${spot.name} is no tap target at the end of the chapter`);
  }
  // The first animal the chapter puts in the book is the early bird, which flies up out of the reed as the reveal pans: a kind the
  // Fen has, the first of them, with a card in the book that its find unlocks (main.js shows that card's drawing once: chapter.firstFind)
  assert.equal(chapter.firstFind, 'earlyBird');
  assert.equal(FEN_CRITTERS[0].kind, chapter.firstFind);
  const cards = JSON.stringify(readJson('../assets/book/cards.json'));
  assert.match(cards, /"unlock":\s*\{\s*"found":\s*"earlyBird"\s*\}/, 'a card of the book is unlocked by the early bird');
});

test('an idle child still gets the head down', async () => {
  const run = await playIdle();
  const { world } = run;
  const five = sceneStart(world, 5);
  assert.ok(five !== undefined && five <= HEAD_DOWN_BY, `scene 5 at ${five?.toFixed(1)} s`);
  const c = world.chapterState;
  assert.equal(c.basket.total, 5, 'five berries went into the basket');
  assert.deepEqual(c.picks.map(p => p.by), Array(5).fill('egill'), 'each picked by Egill');
  assert.ok(c.picks.every(p => p.kind === 'red'), 'all of them red');
  assert.ok(c.headDownAt > 0 && c.headDownAt < five, 'and her head came down to him before it');
  // Mosi's hints, each the one true of where the next bunch is: the big bush's first (three, then one once Egill has helped), then
  // the two by the water, then the one under the leaves
  const lines = world.chapter.lines;
  const hints = run.captions.filter(caption => caption.at >= sceneStart(world, 4) && caption.at < five)
    .map(caption => [1, 2, 3].find(k => lines[`k2_mosi_hint_berry${k}`].text === caption.text)).filter(Boolean);
  assert.deepEqual(hints, [1, 1, 1, 1, 2, 2, 3]);
});

// Seconds into the chapter by which an idle child has her head down (scene 5 begins), and the limits of the short runs that
// tap one thing a moment after it appears: each a little after the scene it is in has got to what it taps.
const HEAD_DOWN_BY = 200;
const ANIMAL_LIMIT = 40;
const TAP_LIMIT = 60;
const BLUE_LIMIT = 120;
const SWISH_LIMIT = 100;

test('a blue berry is the birds\': Mosi says so, and it stays on its bush', async () => {
  const blue = `berry_${chapter.locations.fen.layout.berries.findIndex(b => b.kind === 'blue')}_0`;
  const run = await playUnattended(kafli3, { seeking: false, limit: BLUE_LIMIT, shaped: true, earlyTap: { name: blue, after: 1 } });
  assert.ok(run.seen.earlyTap, `the blue berry ${blue} could be tapped`);
  assert.ok(run.captions.some(c => c.text === 'Nei, bláu berin eru fyrir fuglana. Þau rauðu!' && c.at > run.seen.earlyTap.at), 'Mosi: the blue ones are for the birds');
  const c = run.world.chapterState;
  assert.equal(c.berries.picked.has(blue), false, 'it is not picked');
  assert.ok(c.picks.every(p => p.kind === 'red'), 'only red ones go in the basket');
});

test('a tap on one of the Fen\'s own animals: it reacts, and goes in the book (the frog, found again in a new place)', async () => {
  const run = await playUnattended(kafli3, { seeking: false, limit: ANIMAL_LIMIT, shaped: true, earlyTap: { name: 'fen-frog', after: 1 } });
  assert.ok(run.seen.earlyTap, 'the frog could be tapped in the Fen');
  assert.ok(run.journal.findings.includes('frog'), `the frog is in the book (${run.journal.findings.join(', ')})`);
  assert.equal(run.finds.find(f => f.id === 'frog')?.options?.again, true, 'found again: it flies into the book though chapter 1 found it');
  assert.ok(run.seen.earlyTap.movedAt !== null, 'and it hopped');
  assert.ok(run.soundLog.some(e => e.name === CRITTER_SOUNDS.frog && Math.abs(e.at - run.seen.earlyTap.at) < 0.1), 'with its own sound');
});

test('the frog in the Fen is hidden: on the channel\'s bank, out of every shot\'s view, found by turning the berry search all the way left', async () => {
  const frog = FEN_CRITTERS.find(f => f.kind === 'frog');
  const { layout, shots } = chapter.locations.fen;
  const { terrain: ground, water } = shapeGround({ chapter }, { ...layout, shots }, layout.seed);
  const at = new THREE.Vector3(frog.at[0], ground.heightAt(...frog.at) + 0.08, frog.at[1]);
  assert.ok(water.signedAt(...frog.at) > 0 && water.signedAt(...frog.at) < 0.4, 'at the edge of the water, on its bank');
  // a view: is the frog inside it (a 16:10 screen)?
  const inView = ({ position, target, fov }) => {
    const camera = new THREE.PerspectiveCamera(fov, 1.6, 0.1, 500);
    camera.position.fromArray(position);
    camera.lookAt(new THREE.Vector3().fromArray(target));
    camera.updateMatrixWorld();
    const p = at.clone().project(camera);
    return p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1;
  };
  // out of every still shot, or so far off (the low shot under her, the two shot behind Mosi) that a 20 cm frog would be some ten
  // pixels in the reed
  for (const [label, shot] of Object.entries(shots)) {
    if (!Array.isArray(shot.position) || !Array.isArray(shot.target)) continue;
    const far = at.distanceTo(new THREE.Vector3().fromArray(shot.position));
    assert.ok(!inView(shot) || far > 15, `the frog is out of ${label} (${far.toFixed(1)} m off)`);
  }
  // the berry search's own view, from behind Egill where he picks (fen_pick, actor-relative): not in it, but turned 70 degrees left it is
  const egill = { x: 12.4, z: -8.4 };
  const pick = shots.fen_pick;
  const from = [egill.x + pick.position.offset[0], ground.heightAt(egill.x, egill.z) + pick.position.offset[1], egill.z + pick.position.offset[2]];
  const to = [egill.x + pick.target.offset[0], ground.heightAt(egill.x, egill.z) + pick.target.offset[1], egill.z + pick.target.offset[2]];
  assert.equal(inView({ position: from, target: to, fov: pick.fov }), false, 'not in the berry search as it opens');
  const turned = yaw => {
    const a = THREE.MathUtils.degToRad(yaw), dx = to[0] - from[0], dz = to[2] - from[2];
    return [from[0] + dx * Math.cos(a) - dz * Math.sin(a), to[1], from[2] + dx * Math.sin(a) + dz * Math.cos(a)];
  };
  assert.equal(inView({ position: from, target: turned(-70), fov: pick.fov }), true, 'but there with the view turned all the way left');
});

test('a tap on Þórseðla in the Fen: her tail swishes and leaves fall, nothing more', async () => {
  const run = await playUnattended(kafli3, { seeking: false, limit: TAP_LIMIT, shaped: true, earlyTap: { name: 'thorsedla', after: 1 } });
  const { seen, added, world } = run;
  assert.ok(seen.earlyTap, 'she could be tapped as the Fen opens');
  const at = seen.earlyTap.at;
  assert.ok(added.some(o => o.name === 'Þórseðla leaves' && o.at >= at - 1e-6 && o.at - at < 0.1), 'leaves fall from her mouth at the tap');
  assert.equal(world.chapterState.taps, 1, 'one tap');
  assert.ok(world.chapterState.swishLog.some(t => t >= at - 1e-6 && t - at < 0.2), 'and her tail swishes at it');
});

test('the warm-up draws the Fen\'s animals, the leaf, the berries and the basket with its glow, from the start shot and the Fen\'s views', async () => {
  const { world } = await playUnattended(kafli3, { limit: 0.2 });
  const warm = chapter.warmUp(world);
  const namesOf = w => w.objects.flatMap(root => { const n = []; root.traverse(o => n.push(o.name)); return n; });
  const names = namesOf(warm);
  for (const name of ['Basket', 'Basket berries', 'Basket glow']) assert.ok(names.includes(name), `${name} is drawn`);
  const critterNames = names.filter(name => name.startsWith('Critter warm-up-')).map(name => name.slice('Critter warm-up-'.length)).sort();
  assert.deepEqual(critterNames, ['earlyBird', 'fish', 'frog', 'turtle'], 'the Fen\'s own animals');
  for (const name of ['Mud prints', 'Print water']) assert.ok(!names.includes(name), `${name} is chapter 2\'s, not drawn here`);
  for (const actor of world.actors.values()) assert.ok(warm.objects.includes(actor.root), 'the actors are drawn, Þórseðla in her pool among them');
  assert.deepEqual(warm.shots, ['fen_reveal', ...chapter.locations.fen.warmUp], 'from the start shot and the views of the Fen');
  for (const shot of warm.shots) assert.ok(chapter.locations.fen.shots[shot], `${shot} is a shot of the Fen`);
  warm.dispose();
});

test('a tap on her just before her tail swishes on its own: the swish she does then is a whole one, and so is its shot', async () => {
  let tappedAt = null, rode = false, calledAt = null;
  const run = await playUnattended(kafli3, {
    seeking: false, limit: SWISH_LIMIT, shaped: true,
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

// ---------------------------------------------------------------------------------------------
// The sound (engine/audio/sfx.js, engine/audio/fen-sounds.js), the lookout's haze and the sun's beats

test('every sound the script asks for exists', () => {
  const context = createFakeContext({ state: 'running' });
  const sfx = createSfx({ context, theme: readJson('../assets/audio/theme.json'), recorded: true }); // as main.js makes it: Grameðla's roar and breath are recorded
  const known = name => {
    sfx.stop(); // a bed (the Fen) is laid once: each is asked for afresh
    context.advance(12);
    return sfx.play(name, { index: 1, seconds: 8 });
  };
  const calls = [...CHAPTER_TEXT.matchAll(/s\.sfx\(([^,)]*)/g)].map(m => m[1].trim());
  const literal = calls.filter(a => /^'[^']*'$/.test(a)).map(a => a.slice(1, -1));
  assert.deepEqual([...new Set(calls.filter(a => !/^'[^']*'$/.test(a)))], ['sound'], 'a sound not written out is an animal\'s, looked up in CRITTER_SOUNDS');
  for (const name of new Set([...literal, ...Object.values(CRITTER_SOUNDS)])) assert.equal(known(name), true, `"${name}" is a sound of the set`);
  // the brief's sounds are all asked for, and the forest not at all: it is chapter 2's, in the glade
  for (const name of ['fen', 'berryPop', 'sniff', 'breathHuge', 'chew', 'liftTone', 'windHigh', 'slide', 'landSaddle', 'mapMark', 'flower']) {
    assert.ok(literal.includes(name), `the script asks for ${name}`);
  }
  assert.equal(literal.includes('forest'), false);
  // every animal of the chapter with a voice has its own sound
  for (const kind of ['turtle', 'fish', 'earlyBird', 'frog']) assert.ok(CRITTER_SOUNDS[kind], `the ${kind} has a sound`);
});

test('the sounds come where the script has them: the Fen\'s water, the berries, her head, the lift, the map and the slide', async () => {
  const { soundLog: log, world } = await playIdle();
  const named = (name, scene) => log.filter(e => e.name === name && (scene === undefined || e.scene === scene));
  // the Fen's own bed of water, frogs and drips from the start, under the black (before the first scene)
  assert.deepEqual(named('fen').map(e => e.scene), [undefined], 'the Fen\'s bed once, at the start');
  assert.equal(named('forest').length, 0, 'and no forest');
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
  assert.equal(named('mapMark', 6).length, 2, 'two places on the map (the Fen\'s marker flies in scene 3)');
  assert.equal(named('flower', 6).length, 3, 'two friends found, and Uggeðla\'s wave');
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
  for (const scene of [3, 4, 5]) assert.ok(near(seen.fog[scene].min, density) && near(seen.fog[scene].max, density), `scene ${scene} in the look's fog`);
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
