import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { chapter, onBone, POINTS, FLOWERS } from '../chapters/kafli1.js';
import { createActor, updateActors } from '../engine/actor.js';
import { createClock } from '../engine/clock.js';
import { createEffects } from '../engine/effects.js';
import { createPointResolver } from '../engine/points.js';
import { createLocations } from '../engine/locations.js';
import { createDirector } from '../engine/camera/director.js';
import { createScene } from '../engine/scene/scene.js';
import { createStageUI } from '../engine/scene/ui.js';
import { createJournal } from '../engine/scene/journal.js';
import { createSave } from '../engine/save.js';
import { createGlowFlower } from '../world/props/glow-flower.js';
import { Handle } from '../engine/handle.js';
import { pickLook } from '../engine/looks.js';
import { sunDirection } from '../engine/lighting.js';
import { FakeDocument } from './fake-dom.mjs';
import { createTerrain } from '../world/forest/terrain.js';
import { planForest } from '../world/forest/plan.js';
import { createSpeciesLibrary } from '../world/forest/species.js';
import { PRESETS } from '../engine/quality.js';
import { LIMITS } from '../engine/camera/director.js';

// Chapter 1 (remake/chapters/kafli1.js) played from the start button to the journal by nobody at all, in the
// seeking mode a capture (?t=) uses: every wait for the child has to end by itself there, so the chapter reaches
// its end, and the timeline a capture lands on stays fixed. The world is a stand-in for the page's (no renderer,
// forests that are only their ground), with the real characters, camera director, scene, screen layer and journal.

const file = relative => new URL(relative, import.meta.url);
const readJson = relative => JSON.parse(fs.readFileSync(file(relative), 'utf8'));
const SOURCE = readJson('../assets/audio/kafli1/lines-source.json');
const RECORDED = readJson('../assets/audio/lines.json');
const NARRATION = readJson('../../dist/assets/audio/narration-is.json');
const CHAPTER_TEXT = fs.readFileSync(file('../chapters/kafli1.js'), 'utf8');

// The remake's GLBs read without their textures (there is no image decoder in Node), as riding.test.mjs does.
function loadGlb(url) {
  const glb = fs.readFileSync(url);
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const material of json.materials ?? []) {
    delete material.normalTexture;
    delete material.occlusionTexture;
    delete material.emissiveTexture;
    if (material.pbrMetallicRoughness) {
      delete material.pbrMetallicRoughness.baseColorTexture;
      delete material.pbrMetallicRoughness.metallicRoughnessTexture;
    }
  }
  let text = Buffer.from(JSON.stringify(json), 'utf8');
  if (text.length % 4) text = Buffer.concat([text, Buffer.alloc(4 - (text.length % 4), 0x20)]);
  const rest = glb.subarray(20 + jsonLength);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + text.length + rest.length, 8);
  header.writeUInt32LE(text.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const out = Buffer.concat([header, text, rest]);
  return new Promise((resolve, reject) => new GLTFLoader().parse(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength), '', resolve, reject));
}
const models = new Map();
const modelOf = url => {
  if (!models.has(url)) models.set(url, loadGlb(new URL(url, file('../chapters/kafli1.js'))));
  return models.get(url);
};

/** The chapter's world: its actors, a camera at 16:10, the effects and the clock main.js has, and a sun. */
async function chapterWorld() {
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1200);
  const world = {
    THREE, scene: new THREE.Scene(), camera, clock: createClock(), chapter, heightAt: () => 0, actors: new Map(), effects: createEffects(),
    lighting: { direction: sunDirection(pickLook(chapter.look)) },
  };
  world.resolvePoint = createPointResolver(world);
  for (const [name, spec] of Object.entries(chapter.actors)) {
    world.actors.set(name, await createActor(world, { name, gltf: await modelOf(spec.url), position: spec.position, heading: spec.heading }));
  }
  return world;
}

/** A forest that is only its ground, with two butterflies that can be tapped and sent to a point. */
function groundOnly(layout) {
  const [cx, cz] = layout.clearing.center;
  const targets = [1, 2].map(i => ({ name: `butterfly-${i}`, point: new THREE.Vector3(cx + 2 * i, 1.2, cz + 3), radius: 0.4 }));
  const landed = [];
  return {
    group: new THREE.Group(),
    layout,
    heightAt: () => 0,
    butterflies: {
      targets,
      landed,
      flutter: () => new Handle('flutter').finish(),
      land(spec) {
        landed.push(spec);
        return new Handle('land');
      },
    },
  };
}

/** A pointer that remembers the targets the scene puts on it and the drags it listens to, and taps one when told. */
function fakePointer() {
  const targets = new Map();
  const listeners = { tap: [], drag: [] };
  return {
    targets,
    listeners,
    addTarget: (name, spec) => targets.set(name, spec),
    removeTarget: name => targets.delete(name),
    on(event, fn) {
      listeners[event].push(fn);
      return () => listeners[event].splice(listeners[event].indexOf(fn), 1);
    },
    tap: name => [...listeners.tap].forEach(fn => fn({ name, x: 0, y: 0 })),
  };
}

const PAGE = ['caption', 'choices', 'fade', 'tray', 'view', 'journal-button', 'star-slots', 'finding-count', 'journal-flights',
  'journal-page', 'journal-close', 'journal-stars', 'journal-finds', 'journal-empty'];

/**
 * The chapter played until it ends or `limit` seconds have gone by: in seeking mode, as a capture plays it; or (seeking false)
 * as it plays for a child who never touches the screen, or, `eager`, for one who taps everything there is to tap a moment after
 * it appears and drags each flower to Kambeðla's mouth.
 */
async function playUnattended({ limit = 600, seeking = true, eager = false } = {}) {
  const world = await chapterWorld();
  const forests = [];
  const locations = createLocations({ world, locations: chapter.locations, build: layout => { const f = groundOnly(layout); forests.push(f); return f; } });
  await locations.setLocation(chapter.start);
  const shots = Object.assign({}, chapter.shots, ...Object.values(chapter.locations).map(location => location.shots));
  const director = createDirector({ camera: world.camera, world, shots, lint: false });
  world.director = director;

  const doc = new FakeDocument(PAGE);
  for (const name of ['caption-speaker', 'caption-text']) {
    const part = doc.createElement('span');
    part.className = name;
    doc.getElementById('caption').append(part);
  }
  const computed = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ opacity: '1' });
  const ui = createStageUI(doc);
  if (computed) globalThis.getComputedStyle = computed;
  else delete globalThis.getComputedStyle;
  const captions = [];
  const caption = ui.caption;
  ui.caption = (who, text, colour) => {
    if (text != null) captions.push({ who, text, at: stage.s.time });
    return caption(who, text, colour);
  };
  doc.getElementById('star-slots').rect = { left: 1180, top: 20, width: 40, height: 40 };
  world.renderer = { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }) } };

  const journal = createJournal(doc, createSave(null));
  const pointer = fakePointer();
  const added = []; // what comes into the scene, and when: sparkles, pollen, flowers
  const add = world.scene.add.bind(world.scene);
  world.scene.add = (...objects) => {
    for (const o of objects) added.push({ name: o.name, normal: o.material?.blending === THREE.NormalBlending, at: stage?.s.time ?? 0 });
    return add(...objects);
  };
  const drops = []; // the scene's listeners on the tray, so the eager child can let a flower go on her mouth
  const onDrop = ui.tray.onDrop;
  ui.tray.onDrop = fn => {
    drops.push(fn);
    const stop = onDrop(fn);
    return () => { drops.splice(drops.indexOf(fn), 1); stop(); };
  };
  const winks = [];
  const sounds = [];
  const lines = readJson('../assets/audio/lines.json');
  const stage = createScene({
    world, director, ui, lines, cast: chapter.cast, locations, pointer, journal,
    voice: { play: () => null, stop() {} },
    sun: { wink: () => winks.push(stage.s.time) },
    sfx: { play: name => sounds.push(name), stop() {} },
  });
  stage.seeking = seeking;
  ui.setFade(1);
  director.cut(chapter.startShot, { check: false });
  const task = stage.start(chapter.script);
  stage.begin();

  // What the run sees on the way, for the tests to look at afterwards.
  const seen = { kambedlaInClearing: false, floatStart: null, landing: null };
  const mosi = world.actors.get('mosi');
  const egill = world.actors.get('egill');
  const kambedla = world.actors.get('kambedla');
  const inMosisFrame = point => point.clone().sub(mosi.root.position).applyQuaternion(mosi.root.quaternion.clone().invert());
  let wasControlled = false;

  // The eager child: a tap on each target a moment after it appears (the nose again once it has tickled), the flowers of the
  // search one at a time, and each flower in the tray dropped on her mouth, where it is on the screen.
  const tapped = new Map(); // target -> when it was tapped
  const appeared = new Map(); // target -> when it appeared
  const mouth = onBone(kambedla, ...POINTS.kambedlaMouth);
  const screenOf = point => {
    const p = point.clone().project(world.camera);
    return { x: ((p.x + 1) / 2) * 1280, y: ((1 - p.y) / 2) * 800 };
  };
  let lastFlower = -Infinity;
  let dragSince = null;
  function eagerChild(t) {
    for (const name of pointer.targets.keys()) if (!appeared.has(name)) appeared.set(name, t);
    for (const name of [...appeared.keys()]) {
      if (pointer.targets.has(name)) continue;
      appeared.delete(name);
      tapped.delete(name);
    }
    for (const [name, since] of appeared) {
      if (/^(bird|butterfly|glade)-/.test(name)) continue;
      const flower = ['stone', 'ferns', 'tree'].includes(name);
      const again = name === 'nose' && tapped.has(name) && t - tapped.get(name) > 3.5 && t - tapped.get(name) < 3.5 + dt;
      if ((!tapped.has(name) && t - since > 1.2 && (!flower || t - lastFlower > 4)) || again) {
        pointer.tap(name);
        tapped.set(name, t);
        if (flower) lastFlower = t;
      }
    }
    if (!drops.length) {
      dragSince = null;
      return;
    }
    dragSince ??= t;
    if (t - dragSince > 2) {
      const at = screenOf(mouth(new THREE.Vector3()));
      for (const id of ['flower-1', 'flower-2', 'flower-3']) [...drops].forEach(fn => fn({ id, ...at }));
      dragSince = null;
    }
  }

  const dt = 1 / 30;
  for (let t = 0; t < limit && !task.done; t += dt) {
    if (eager) eagerChild(t);
    world.clock.step(dt);
    journal.update(dt);
    stage.update(dt);
    updateActors(world.actors.values(), dt);
    world.effects.update(dt);
    director.update(dt);
    if (world.location === 'rjodur' && kambedla.root.visible) seen.kambedlaInClearing = true;
    if (egill.controlled && !wasControlled && !seen.floatStart) seen.floatStart = inMosisFrame(egill.root.position);
    if (!egill.controlled && wasControlled && world.location === 'burknalaut') seen.landing = inMosisFrame(egill.root.position);
    wasControlled = egill.controlled;
    // A place being built is a promise the scene waits on (s.goTo); a choice waiting for a finger is one too.
    if (stage.scheduler.pending > 0) await new Promise(resolve => setImmediate(resolve));
  }
  return { world, task, stage, director, journal, doc, captions, winks, sounds, forests, pointer, seen, added, lines };
}

let played = null;
const unattended = () => (played ??= playUnattended());
let ignored = null;
const ignoredByAChild = () => (ignored ??= playUnattended({ seeking: false, limit: 900 }));
let eager = null;
const playedByAnEagerChild = () => (eager ??= playUnattended({ seeking: false, eager: true, limit: 900 }));

// ---------------------------------------------------------------------------------------------
// The lines

const words = text => text.replace(/\[[^\]]*\]\s*/g, '').trim(); // what is said, without the voice's tags

test('kafli1 uses only lines that exist', async () => {
  const source = new Map(SOURCE.map(line => [line.id, line]));
  // Each of the chapter's lines is a recording the game has, with the words it was recorded with.
  for (const [id, line] of Object.entries(chapter.lines)) {
    assert.ok(line.audio && RECORDED[line.audio], `${id} has no recording in lines.json`);
    if (id === 'welcome') {
      assert.equal(line.audio, 'welcome', 'scene 3 reuses the game\'s greeting');
      assert.equal(line.text, NARRATION.welcome, 'with the words of the game\'s greeting');
    } else {
      assert.ok(source.has(id), `${id} is not a line of chapter 1 (lines-source.json)`);
      assert.equal(line.audio, id);
      assert.equal(line.text, words(source.get(id).text), `${id} says what the script says`);
    }
  }
  // Every line of the chapter is there, the two Egill may say included.
  for (const id of source.keys()) assert.ok(chapter.lines[id], `${id} is missing from the chapter's lines`);
  // Whatever the script names as a line is one of them: the said lines and the hints, in the source.
  const named = new Set([...CHAPTER_TEXT.matchAll(/'(k1_(?:mosi|egill|kambedla)_[a-z0-9_]+|welcome)'/g)].map(match => match[1]));
  assert.ok(named.size >= 38, `the script names ${named.size} lines`);
  for (const id of named) assert.ok(chapter.lines[id], `the script names '${id}', which is not one of its lines`);
  // And played through, every caption shown is one of those lines' words, never an id shown as text.
  const { captions } = await unattended();
  const texts = new Set(Object.values(chapter.lines).map(line => line.text));
  assert.ok(captions.length >= 25, `${captions.length} lines were said`);
  for (const { text } of captions) assert.ok(texts.has(text), `the caption "${text}" is not one of the chapter's lines`);
});

test('each speaker has a name and a colour, Kambeðla in her plum', () => {
  assert.deepEqual(Object.keys(chapter.cast).sort(), ['egill', 'kambedla', 'mosi']);
  assert.equal(chapter.cast.kambedla.colour, '#5d4370');
  assert.equal(chapter.cast.kambedla.name, 'Kambeðla');
  for (const line of SOURCE) assert.ok(chapter.cast[line.speaker], `${line.speaker} speaks but has no caption name`);
});

// ---------------------------------------------------------------------------------------------
// The chapter as data

test('two places, each with its own shots and where the actors stand in it', () => {
  assert.equal(chapter.id, 'kafli1');
  assert.equal(chapter.title, 'Boð til kambeðlunnar');
  assert.equal(chapter.look, 'morning');
  assert.equal(chapter.start, 'rjodur');
  assert.deepEqual(Object.keys(chapter.locations).sort(), ['burknalaut', 'rjodur']);
  assert.deepEqual(Object.keys(chapter.actors).sort(), ['egill', 'kambedla', 'mosi']);
  const { rjodur, burknalaut } = chapter.locations;
  assert.equal(rjodur.layout.clearing.radius, 15, 'the clearing at real size');
  assert.ok(rjodur.layout.path.length >= 2, 'with the path leaving it');
  assert.equal(burknalaut.layout.clearing.radius, 9);
  assert.deepEqual(burknalaut.layout.glade, { ferns: 3, shafts: 4 });
  for (const [name, { layout, shots }] of Object.entries(chapter.locations)) {
    assert.equal(layout.leafShadows, true, `${name} has leaf shadows (R42)`);
    assert.ok(Object.keys(shots).length >= 6, `${name} keeps its shots clear: they are in its own shots`);
    assert.ok(layout.actors && Object.keys(layout.actors).length >= 2, `${name} says where its actors stand (R13)`);
  }
  assert.ok(!('kambedla' in rjodur.layout.actors), 'Kambeðla is not in the clearing');
  // The glade's plants sway within the style guide's bound at the seed the sway test measures (its broadleaf peaks
  // near 3 degrees at some seeds): another seed for the glade needs that test run at it.
  const swaySeed = Number(/const SEED = (\d+);/.exec(fs.readFileSync(file('forest-sway.test.mjs'), 'utf8'))[1]);
  assert.equal(burknalaut.layout.seed, swaySeed, 'the glade grows from the seed tests/forest-sway.test.mjs measures');
  assert.ok('kambedla' in burknalaut.layout.actors);
  // A name in two places, or in the chapter's own shots as well, would overwrite the other silently (main.js).
  const names = [...Object.keys(chapter.shots), ...Object.keys(rjodur.shots), ...Object.keys(burknalaut.shots)];
  assert.equal(new Set(names).size, names.length, 'every shot has a name of its own');
  assert.ok(rjodur.shots[chapter.startShot], 'the start shot is in the start place');
});

// The ground of a place, as its forest builds it (the floor rises away from a clearing).
const groundOf = name => {
  const { layout, shots } = chapter.locations[name];
  return createTerrain({ chapter }, { ...layout, shots }, layout.seed);
};

test('every shot of a place keeps the camera rules over that place\'s own ground', () => {
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

test('the glow flowers hide by the big stone, under the ferns and up in the little tree, as the glade grows them', () => {
  const { layout, shots } = chapter.locations.burknalaut;
  const world = { chapter };
  const terrain = groundOf('burknalaut');
  const { placements } = planForest({ world, layout: { ...layout, shots }, seed: layout.seed, terrain, library: createSpeciesLibrary(layout.seed), q: PRESETS.tablet });
  const search = shots.search.position;
  assert.deepEqual(FLOWERS.map(f => f.name), ['stone', 'ferns', 'tree'], 'in the order the hints come');
  for (const { name, position: [x, up, z], by } of FLOWERS) {
    const near = placements.filter(p => p.name === by).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))[0];
    assert.ok(near, `the glade grows no ${by}`);
    const apart = Math.hypot(near.x - x, near.z - z);
    const size = near.model.radius * near.scale;
    if (by === 'rock') {
      assert.ok(near.model.height * near.scale >= 0.6, `a big stone, ${(near.model.height * near.scale).toFixed(2)} m tall`);
      assert.ok(apart > size * 0.8 && apart < size + 0.6, `${name} stands right beside the stone (${apart.toFixed(2)} m from its middle, radius ${size.toFixed(2)})`);
    } else if (by === 'fern') {
      assert.ok(apart < size * 0.6, `${name} stands under the fern's fronds (${apart.toFixed(2)} m from its middle, radius ${size.toFixed(2)})`);
    } else {
      assert.ok(apart < 0.4, `${name} stands on the trunk of the little tree (${apart.toFixed(2)} m from it)`);
      const top = near.model.trunk.top * near.scale;
      assert.ok(Math.abs(up - top) < 0.6 && near.model.height * near.scale < 4, `up in a little tree: ${up} m up, its trunk ends at ${top.toFixed(2)} m`);
    }
    // seen from the search camera, a little nearer than what hides it, so part of its glimmer shows
    assert.ok(Math.hypot(x - search[0], z - search[2]) < Math.hypot(near.x - search[0], near.z - search[2]), `${name} stands on the camera's side of its ${by}`);
  }
});

// ---------------------------------------------------------------------------------------------
// Played through by nobody

test('every required wait has an auto option for seeking: the chapter plays to its end unattended, before 600 s', async () => {
  const { task, stage, world, journal, doc, winks, director, pointer, seen } = await unattended();
  assert.equal(task.done, true, `the chapter was still going at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  assert.ok(stage.s.time < 600, `it ended at ${stage.s.time.toFixed(1)} s`);
  // Ten scenes, in order, the glade from scene 7 on.
  const timeline = world.chapterTimeline;
  assert.deepEqual(timeline.map(mark => mark.scene), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (let i = 1; i < timeline.length; i++) assert.ok(timeline[i].at > timeline[i - 1].at + 5, `scene ${i + 1} comes well after scene ${i}`);
  assert.equal(world.location, 'burknalaut');
  assert.equal(seen.kambedlaInClearing, false, 'Kambeðla never shows in the clearing');
  assert.equal(world.actors.get('kambedla').root.visible, true);
  // The flowers were all found and picked, her plates all lit, the star is in the book and the book is open.
  const flowers = world.scene.children.filter(o => /^Glow flower (stone|ferns|tree)$/.test(o.name));
  assert.equal(flowers.length, 3, 'three glow flowers in the glade');
  for (const flower of flowers) assert.equal(flower.visible, false, `${flower.name} was picked`);
  assert.deepEqual(journal.stars, ['k1_kambedla']);
  assert.equal(doc.getElementById('journal-page').hidden, false, 'the chapter ends in the open book');
  assert.equal(winks.length, 2, 'the sun winks twice: "Sólin bíður ekki" and the star');
  assert.equal(pointer.listeners.drag.length, 0, 'no free look is left over');
  assert.deepEqual(director.warnings, [], 'the camera keeps the style guide\'s rules');
});

test('no fail states: a child who never touches the screen is helped through every wait to the end', async () => {
  const { task, stage, world, journal, captions, director, seen, added } = await ignoredByAChild();
  assert.equal(task.done, true, `the chapter was still waiting at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  const said = id => captions.filter(c => c.text === chapter.lines[id].text).length;
  assert.equal(said('k1_mosi_waving'), 1, 'Egill waved by himself, and Mosi saw it');
  assert.equal(said('k1_egill_yes'), 1, 'Egill said yes by himself when nobody chose');
  assert.ok(seen.floatStart, 'Egill floated up by himself');
  // Hints every 12 s, three to a flower, and then Egill picks it himself: nine hints, the three flowers in order.
  for (const id of ['k1_mosi_hint_stone', 'k1_mosi_hint_ferns', 'k1_mosi_hint_tree']) assert.equal(said(id), 3, `${id} three times`);
  for (const id of ['k1_mosi_one', 'k1_mosi_two', 'k1_mosi_three']) assert.equal(said(id), 1);
  // Mosi says again what to do with each flower, and each one Egill gives her himself.
  assert.equal(said('k1_mosi_give'), 4, 'once to begin, and once for each flower left in the tray');
  assert.equal(added.filter(o => o.name.startsWith('Glow flower handed-')).length, 3, 'Egill gave her each flower himself');
  assert.equal(world.scene.children.filter(o => o.name.startsWith('Glow flower handed-')).length, 0, 'and they went into her mouth');
  assert.deepEqual(journal.stars, ['k1_kambedla'], 'the star flew to the book by itself');
  assert.deepEqual(director.warnings, [], 'the hints and the waits keep the camera rules too');
  assert.ok(stage.s.time > (await unattended()).stage.s.time + 120, "and the waits were real ones, longer than a capture's");
});

test('an eager child who taps everything: each tap does its one thing once, and the optional ones never get in the way', async () => {
  const { task, stage, journal, captions, added, lines, director, seen } = await playedByAnEagerChild();
  assert.equal(task.done, true, `still going at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  const said = id => captions.filter(c => c.text === chapter.lines[id].text);
  // His nose: once it tickles, the second time he sneezes and the pollen flies (a cloud that dims what is behind it).
  assert.equal(said('k1_mosi_tickle').length, 1);
  assert.equal(said('k1_mosi_sneeze').length, 1);
  const sneeze = said('k1_mosi_sneeze')[0].at;
  assert.ok(added.some(o => o.name === 'Sparkles' && o.normal && Math.abs(o.at - sneeze) < 0.1), 'pollen flies as he sneezes');
  assert.ok(seen.floatStart, 'Egill floated up when tapped');
  // The critters by the path go in the journal, and Mosi says something about each, never over another line of his.
  assert.deepEqual(['beetle', 'frog', 'snail'].filter(kind => journal.findings.includes(kind)), ['beetle', 'frog', 'snail']);
  for (const id of ['k1_mosi_beetle', 'k1_mosi_frog', 'k1_mosi_snail']) assert.equal(said(id).length, 1, `${id} once`);
  const mosis = captions.filter(c => c.who === 'Mosi').sort((a, b) => a.at - b.at);
  for (let i = 1; i < mosis.length; i++) {
    const line = Object.values(chapter.lines).find(l => l.text === mosis[i - 1].text);
    assert.ok(mosis[i].at >= mosis[i - 1].at + lines[line.audio].duration - 1e-6, `"${mosis[i].text}" begins over "${mosis[i - 1].text}"`);
  }
  // Every flower found by a tap, no hints needed, and each one dropped on her mouth, none given by Egill.
  for (const id of ['k1_mosi_hint_stone', 'k1_mosi_hint_ferns', 'k1_mosi_hint_tree']) assert.equal(said(id).length, 0, `no ${id}`);
  assert.equal(said('k1_mosi_give').length, 1, 'no need to say it again');
  assert.equal(added.filter(o => o.name.startsWith('Glow flower handed-')).length, 0, 'nobody had to give her a flower');
  assert.deepEqual(journal.stars, ['k1_kambedla']);
  assert.deepEqual(director.warnings, []);
  assert.ok(stage.s.time < (await ignoredByAChild()).stage.s.time - 100, 'and it goes much quicker than for a child who waits');
});

test('the float up starts, and the float down lands, where the frill and the flank keep clear of Egill', async () => {
  const { seen } = await unattended();
  const check = (where, point, side) => {
    assert.ok(point, `${where} was seen`);
    const along = point.x;
    const out = point.z * side; // + on the side asked for
    assert.ok(out >= 3, `${where}: ${out.toFixed(2)} m out from Mosi's middle (at least 3)`);
    assert.ok(along <= (side > 0 ? 2.5 : 1.5), `${where}: ${along.toFixed(2)} m along him (riding.js)`);
  };
  check('the float up', seen.floatStart, 1); // beside his right shoulder
  check('the landing', seen.landing, -1); // beside his left
});

test('the plates light one row a flower, all three after the third', async () => {
  const { world } = await unattended();
  const kambedla = world.actors.get('kambedla');
  let levels = null;
  kambedla.model.traverse(o => {
    if (o.isMesh && o.material.onBeforeCompile && o.geometry.attributes._platerow) {
      const shader = { uniforms: {}, vertexShader: 'void main() {', fragmentShader: 'void main() {#include <emissivemap_fragment>' };
      o.material.onBeforeCompile(shader, null);
      levels = shader.uniforms.uRowLevel?.value;
    }
  });
  assert.ok(levels, 'her skin glows (plate-glow.js)');
  assert.deepEqual([...levels.slice(0, 3)], [1, 1, 1]);
});

// ---------------------------------------------------------------------------------------------
// The points that follow the characters, on the real models

test('yield flower.pick() through the scheduler: the scene waits for it, and the flower ends in Egill\'s hands', async () => {
  const world = await chapterWorld();
  const egill = world.actors.get('egill');
  egill.place(0, 0, 0);
  const flower = createGlowFlower(world, { name: 'stone', position: [2, 0, 1.5] });
  const stage = createScene({ world, director: { stop() {}, handheld() {} }, ui: { reset() {} }, voice: { stop() {} } });
  const done = { at: null };
  stage.start(function* script() {
    yield flower.pick(POINTS.egillHands);
    done.at = stage.s.time;
  });
  const hands = world.resolvePoint(POINTS.egillHands, new THREE.Vector3());
  let nearest = Infinity;
  for (let i = 0; i < 40; i++) {
    world.clock.step(1 / 30);
    stage.update(1 / 30);
    updateActors(world.actors.values(), 1 / 30);
    world.effects.update(1 / 30);
    if (flower.group.visible) nearest = Math.min(nearest, flower.point.distanceTo(hands));
  }
  assert.ok(done.at !== null && Math.abs(done.at - 0.6) < 0.1, `the scene went on at ${done.at} s, as the pick ended`);
  assert.equal(flower.group.visible, false, 'the flower is gone, into his hands');
  assert.ok(nearest < 0.12, `it came within ${(nearest * 100).toFixed(1)} cm of his hands`);
  // His hands: in front of his chest, between the two hands of the real model, at his hands' height.
  const left = egill.model.getObjectByName('LeftHand').getWorldPosition(new THREE.Vector3());
  const right = egill.model.getObjectByName('RightHand').getWorldPosition(new THREE.Vector3());
  const chest = egill.model.getObjectByName('Chest').getWorldPosition(new THREE.Vector3());
  assert.ok(hands.x > chest.x + 0.1, 'in front of him, not in him');
  assert.ok(hands.distanceTo(left) < 0.4 && hands.distanceTo(right) < 0.4, 'within his reach');
  assert.ok(hands.y > Math.min(left.y, right.y) && hands.y < chest.y, 'at the height he holds things');
});

test('the points on the characters sit where they are named: Mosi\'s nose and horn, Kambeðla\'s mouth and plates', async () => {
  const world = await chapterWorld();
  const mosi = world.actors.get('mosi');
  const kambedla = world.actors.get('kambedla');
  mosi.place(0, 0, 0);
  kambedla.place(0, 0, 0);
  for (let i = 0; i < 5; i++) updateActors(world.actors.values(), 1 / 30);
  const at = (actor, [bone, point]) => onBone(actor, bone, point)(new THREE.Vector3());
  const skin = actor => {
    let mesh = null;
    actor.model.traverse(o => { if (o.isSkinnedMesh && (!mesh || o.geometry.attributes.position.count > mesh.geometry.attributes.position.count)) mesh = o; });
    return mesh;
  };
  const nearestSkin = (actor, point) => {
    const mesh = skin(actor);
    const v = new THREE.Vector3();
    let best = Infinity;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) best = Math.min(best, mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).distanceTo(point));
    return best;
  };
  const nose = at(mosi, POINTS.mosiNose);
  assert.ok(nose.x > 3.7 && nose.y > 2.3 && nose.y < 3 && Math.abs(nose.z) < 0.4, `the nose at the front of his head, ${nose.toArray().map(n => n.toFixed(2))}`);
  assert.ok(nearestSkin(mosi, nose) < 0.25, 'on his snout');
  const horn = at(mosi, POINTS.mosiHorn);
  assert.ok(horn.y > 3.6 && nearestSkin(mosi, horn) < 0.08, 'at the tip of his horn');
  const mouth = at(kambedla, POINTS.kambedlaMouth);
  assert.ok(mouth.x > 2.3 && mouth.y > 1.5 && mouth.y < 2.1 && nearestSkin(kambedla, mouth) < 0.15, `her mouth at the front of her snout, ${mouth.toArray().map(n => n.toFixed(2))}`);
  const plates = world.resolvePoint(POINTS.kambedlaPlates, new THREE.Vector3());
  assert.ok(plates.y > 3.7 && plates.y < 4.1, `the star rises from just above her tallest plates, at ${plates.y.toFixed(2)} m`);
});
