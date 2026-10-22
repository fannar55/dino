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
// The script, with Þórseðla's part (kafli2-thorsedla.js), which speaks a line of its own.
const CHAPTER_TEXT = ['../chapters/kafli2.js', '../chapters/kafli2-thorsedla.js'].map(name => fs.readFileSync(file(name), 'utf8')).join(''); // each ends in a newline
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
  // the others live in the Fen, a tap away: tap targets with their finding
  const fen = world.chapterState.fenCritters;
  assert.deepEqual(fen.spots.map(s => s.kind).sort(), ['dragonfly', 'earlyBird', 'fish', 'turtle']);
  // until he goes up her neck: from then on a tap is for the far friends, never an animal far below
  const targets = (await playTheFen()).pointer.targets;
  for (const spot of fen.spots) assert.equal(targets.has(spot.name), false, `${spot.name} is no tap target after scene 5`);
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
