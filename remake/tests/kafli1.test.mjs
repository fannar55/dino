import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
import { chapter, onBone, POINTS, FLOWERS, HELD, hidingPlaces } from '../chapters/kafli1.js';
import { createActor, updateActors } from '../engine/actor.js';
import { createClock } from '../engine/clock.js';
import { createEffects } from '../engine/effects.js';
import { createPointResolver } from '../engine/points.js';
import { createLocations } from '../engine/locations.js';
import { createDirector } from '../engine/camera/director.js';
import { createScene } from '../engine/scene/scene.js';
import { createStageUI, DRAG_LIFT } from '../engine/scene/ui.js';
import { createJournal } from '../engine/scene/journal.js';
import { createSave } from '../engine/save.js';
import { createGlowFlower } from '../world/props/glow-flower.js';
import { Handle } from '../engine/handle.js';
import { pickLook } from '../engine/looks.js';
import { sunDirection } from '../engine/lighting.js';
import { SUN_RADIUS_DEG } from '../engine/sun-face.js';
import { FakeDocument, pointerEvent } from './fake-dom.mjs';
import { createTerrain } from '../world/forest/terrain.js';
import { planForest } from '../world/forest/plan.js';
import { placementInfo } from '../world/forest/forest.js';
import { createSpeciesLibrary } from '../world/forest/species.js';
import { PRESETS } from '../engine/quality.js';
import { LIMITS } from '../engine/camera/director.js';
import { FOREST } from '../world/forest/config.js';

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
 * it appears and drags each flower to Kambeðla's mouth. `noseAt` is for a child who taps only Mosi's nose: the seconds after it
 * becomes a target at which each tap comes.
 */
async function playUnattended({ limit = 600, seeking = true, eager = false, brokenSteps = false, noseAt = null } = {}) {
  const world = await chapterWorld();
  // Kambeðla's plate rows as they light: { row, level, at } (the chapter's plate glow is the effect with a setRow).
  const rows = [];
  const addEffect = world.effects.add.bind(world.effects);
  world.effects.add = effect => {
    if (typeof effect?.setRow === 'function') {
      const setRow = effect.setRow.bind(effect);
      effect.setRow = (row, level, options) => {
        rows.push({ row, level, at: stage.s.time });
        return setRow(row, level, options);
      };
    }
    return addEffect(effect);
  };
  const forests = [];
  const locations = createLocations({ world, locations: chapter.locations, build: layout => { const f = groundOnly(layout); forests.push(f); return f; } });
  await locations.setLocation(chapter.start);
  const shots = Object.assign({}, chapter.shots, ...Object.values(chapter.locations).map(location => location.shots));
  const director = createDirector({ camera: world.camera, world, shots, lint: false });
  world.director = director;
  let shotNow = null; // the label of the camera's last cut
  const cuts = []; // every cut, as { shot, at }: the shot's label and the scene time
  const cut = director.cut;
  director.cut = (shot, options) => {
    shotNow = typeof shot === 'string' ? shot : shot?.label ?? null;
    cuts.push({ shot: shotNow, at: stage.s.time });
    return cut(shot, options);
  };

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
  // The glow flowers in Egill's hands: shown, with the foot of the stem where he holds them.
  const heldInHands = () => {
    const hands = world.resolvePoint(POINTS.egillHands, new THREE.Vector3());
    return world.scene.children.filter(o => o.name.startsWith('Glow flower ') && o.visible && o.position.distanceTo(hands) < 0.05).length;
  };
  const held = { atTray: null, atMmm: [] }; // as the tray shows, and as she says each "Mmm!"
  const mmm = ['k1_kambedla_mmm1', 'k1_kambedla_mmm2', 'k1_kambedla_mmm3'].map(id => chapter.lines[id].text);
  const captions = [];
  const caption = ui.caption;
  ui.caption = (who, text, colour) => {
    if (text != null) captions.push({ who, text, at: stage.s.time });
    if (text != null && who === 'Kambeðla' && mmm.includes(text)) held.atMmm.push(heldInHands());
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
  const showTray = ui.tray.show;
  const trayShown = []; // the items of each show, as { id, icon }
  ui.tray.show = items => {
    held.atTray ??= heldInHands();
    trayShown.push(items.map(({ id, icon }) => ({ id, icon })));
    return showTray(items);
  };
  const trayRemoved = []; // the tray's flowers as they leave it: given by the child or, after a while, by Egill
  const remove = ui.tray.remove;
  ui.tray.remove = id => {
    trayRemoved.push({ id, at: stage.s.time });
    return remove(id);
  };
  // The sun as it winks: where it is on the screen, and whether anyone stands in front of its face (rays from the camera to
  // its middle and to four points round its rim).
  const raycaster = new THREE.Raycaster();
  const shown = object => !object || (object.visible && shown(object.parent));
  function sunInView() {
    world.camera.updateMatrixWorld();
    const sun = world.resolvePoint('sun', new THREE.Vector3());
    const { x, y } = sun.clone().project(world.camera);
    const toSun = sun.sub(world.camera.position).normalize();
    const side = new THREE.Vector3().crossVectors(toSun, THREE.Object3D.DEFAULT_UP).normalize();
    const up = new THREE.Vector3().crossVectors(side, toSun);
    const rim = THREE.MathUtils.degToRad(SUN_RADIUS_DEG);
    const rays = [toSun, ...[side, side.clone().negate(), up, up.clone().negate()].map(d => toSun.clone().multiplyScalar(Math.cos(rim)).addScaledVector(d, Math.sin(rim)))];
    const people = [...world.actors.values()].filter(actor => actor.root.visible);
    for (const actor of people) actor.root.traverse(o => { if (o.isSkinnedMesh) o.boundingSphere = o.boundingBox = null; }); // posed now
    const hidden = rays.some(ray => {
      raycaster.set(world.camera.position, ray);
      return people.some(actor => raycaster.intersectObject(actor.root, true).some(hit => shown(hit.object)));
    });
    return { x, y, hidden };
  }
  const winks = [];
  const sounds = [];
  const lines = readJson('../assets/audio/lines.json');
  const stage = createScene({
    world, director, ui, lines, cast: chapter.cast, locations, pointer, journal,
    voice: { play: () => null, stop() {} },
    sun: { wink: () => winks.push({ at: stage.s.time, ...sunInView() }) },
    sfx: {
      play(name) {
        if (brokenSteps && name === 'step') throw new Error('a step sound broke');
        sounds.push(name);
      },
      stop() {},
    },
  });
  stage.seeking = seeking;
  const spoken = new Set(); // every line the script has said, by id
  const lastLine = new Map(); // speaker -> the line they began last
  const say = stage.s.say;
  stage.s.say = (speaker, line, options) => {
    spoken.add(line);
    lastLine.set(speaker, line);
    return say(speaker, line, options);
  };
  ui.setFade(1);
  director.cut(chapter.startShot, { check: false });
  const task = stage.start(chapter.script);
  stage.begin();

  // What the run sees on the way, for the tests to look at afterwards.
  const seen = {
    kambedlaInClearing: false, floatStart: null, landing: null, atScene: [], trayRemoved, trayShown, trayDrops: { made: 0, home: 0 }, held,
    printsInRideFeet: 0, printsInGlade: false, birdsUp: [], spoken, rows, cuts,
    // How far each speaker's jaw opens while they speak a line, at the widest, in degrees: line id -> degrees.
    jaws: {},
    // Scene 9 from the feeding shot until a flower leaves his hands: how far his wrists stray from where they hold the
    // stems, how far he walks and how far he turns meanwhile; and his wrists once the posy is gone, at scene 10.
    grip: { worst: 0, frames: 0, from: null, walked: 0, turned: 0, after: null },
  };
  // On the screen, and in front of the camera?
  const onScreen = point => {
    world.camera.updateMatrixWorld();
    const p = point.clone().project(world.camera);
    return p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1;
  };
  // Mosi's footprints the camera sees: the prints still to be seen, on the screen.
  const printsSeen = () => {
    const prints = world.scene.getObjectByName('Footprints');
    if (!prints) return 0;
    const born = prints.geometry.attributes.aBorn.array;
    const matrix = new THREE.Matrix4();
    const at = new THREE.Vector3();
    let n = 0;
    for (let i = 0; i < prints.count; i++) {
      prints.getMatrixAt(i, matrix);
      if (world.clock.time - born[i] < 14 && onScreen(at.setFromMatrixPosition(matrix))) n++;
    }
    return n;
  };
  const perches = new Map(); // bird -> where it sat; it has flown once it leaves there
  const mosi = world.actors.get('mosi');
  const egill = world.actors.get('egill');
  const kambedla = world.actors.get('kambedla');
  // The speakers with a jaw (the mouth pass's, or a bake's), whose opening the run follows; shut is their rest.
  const jaws = new Map([...world.actors].map(([name, actor]) => [name, actor.model.getObjectByName('Jaw')]).filter(([, jaw]) => jaw));
  const SHUT = new THREE.Quaternion();
  const inMosisFrame = point => point.clone().sub(mosi.root.position).applyQuaternion(mosi.root.quaternion.clone().invert());
  let wasControlled = false;

  // The eager child: a tap on each target a moment after it appears (the nose again once it has tickled), the flowers of the
  // search one at a time, and a flower from the tray dropped on her mouth, where it is on the screen, a second after the tray
  // shows and a second after each drop: the last pocket still full, carried by the tray's own pointer events on the page
  // (its pockets are at the page's corner here), so a flower nobody takes goes home as it would under a finger.
  const tapped = new Map(); // target -> when it was tapped
  const appeared = new Map(); // target -> when it appeared
  const mouth = onBone(kambedla, ...POINTS.kambedlaMouth);
  const screenOf = point => {
    const p = point.clone().project(world.camera);
    return { x: ((p.x + 1) / 2) * 1280, y: ((1 - p.y) / 2) * 800 };
  };
  let lastFlower = -Infinity;
  const trayEl = doc.getElementById('tray');
  const full = () => (trayEl.hidden ? [] : trayEl.findAll(e => e.classList.contains('tray-item') && !e.classList.contains('gone')));
  let trayUp = null;
  let lastDrop = -Infinity;
  const choicesEl = doc.getElementById('choices');
  let choicesUp = null;
  let asked = false;
  function eagerChild(t) {
    if (!choicesEl.hidden && choicesEl.children.length) {
      choicesUp ??= t;
      if (t - choicesUp > 1.2) {
        const label = asked ? 'Já, gerum það!' : 'Hvað er stjörnuhátíð?';
        choicesEl.children.find(button => button.textContent === label).dispatchEvent(new Event('click'));
        asked = true;
        choicesUp = null;
      }
    } else choicesUp = null;
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
    const pockets = full();
    if (!pockets.length) {
      trayUp = null;
      return;
    }
    trayUp ??= t;
    if (t - trayUp > 1 && t - lastDrop > 1) {
      const item = pockets[pockets.length - 1];
      const at = screenOf(mouth(new THREE.Vector3()));
      item.dispatchEvent(pointerEvent('pointerdown', { x: 0, y: 0 }));
      doc.dispatchEvent(pointerEvent('pointermove', { x: at.x, y: at.y + DRAG_LIFT }));
      doc.dispatchEvent(pointerEvent('pointerup', { x: at.x, y: at.y + DRAG_LIFT }));
      seen.trayDrops.made++;
      if (!item.classList.contains('gone')) seen.trayDrops.home++;
      lastDrop = t;
    }
  }

  // The child who taps only the nose, late.
  const noseTaps = [...(noseAt ?? [])];
  let noseSince = null;
  function noseChild(t) {
    if (!pointer.targets.has('nose')) return;
    noseSince ??= t;
    if (noseTaps.length && t - noseSince >= noseTaps[0] - 1e-9) {
      noseTaps.shift();
      pointer.tap('nose');
    }
  }

  const dt = 1 / 30;
  for (let t = 0; t < limit && !task.done; t += dt) {
    if (eager) eagerChild(t);
    if (noseAt) noseChild(t);
    world.clock.step(dt);
    journal.update(dt);
    stage.update(dt);
    updateActors(world.actors.values(), dt);
    world.effects.update(dt);
    director.update(dt);
    for (const [name, jaw] of jaws) {
      const actor = world.actors.get(name);
      if (!actor.talking || !lastLine.has(name)) continue;
      const line = lastLine.get(name);
      seen.jaws[line] = Math.max(seen.jaws[line] ?? 0, THREE.MathUtils.radToDeg(jaw.quaternion.angleTo(SHUT)));
    }
    if (world.location === 'rjodur' && kambedla.root.visible) seen.kambedlaInClearing = true;
    // where everyone stands as each scene starts
    if (world.chapterTimeline && seen.atScene.length < world.chapterTimeline.length) {
      seen.atScene.push(Object.fromEntries([...world.actors].map(([name, actor]) => [name, actor.root.position.clone()])));
    }
    if (egill.controlled && !wasControlled && !seen.floatStart) seen.floatStart = inMosisFrame(egill.root.position);
    if (!egill.controlled && wasControlled && world.location === 'burknalaut') seen.landing = inMosisFrame(egill.root.position);
    wasControlled = egill.controlled;
    if (shotNow === 'rideFeet') seen.printsInRideFeet = Math.max(seen.printsInRideFeet, printsSeen());
    const scene = world.chapterTimeline.at(-1)?.scene;
    const strays = () => ['left', 'right'].map(side => {
      const hand = egill.model.getObjectByName(side === 'left' ? 'LeftHand' : 'RightHand').getWorldPosition(new THREE.Vector3());
      return hand.distanceTo(world.resolvePoint(HELD.grips[side], new THREE.Vector3()));
    });
    if (scene === 9 && held.atMmm.length === 0 && heldInHands() === 3) {
      const g = seen.grip;
      g.worst = Math.max(g.worst, ...strays());
      g.frames++;
      g.from ??= { at: egill.root.position.clone(), heading: egill.heading };
      g.walked = Math.max(g.walked, egill.root.position.distanceTo(g.from.at));
      g.turned = Math.max(g.turned, Math.abs(((egill.heading - g.from.heading + 540) % 360) - 180));
    }
    if (scene === 10 && !seen.grip.after) seen.grip.after = strays();
    if (world.location === 'burknalaut' && world.scene.getObjectByName('Footprints')) seen.printsInGlade = true;
    for (const [name, spec] of pointer.targets) {
      if (!name.startsWith('bird-')) continue;
      if (!perches.has(name)) perches.set(name, spec.point.clone());
      const perch = perches.get(name);
      if (perch && spec.point.distanceTo(perch) > 0.05) {
        seen.birdsUp.push({ name, at: stage.s.time, shot: shotNow, seen: onScreen(perch), scene: world.chapterTimeline.at(-1).scene });
        perches.set(name, null);
      }
    }
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
  assert.ok(named.size >= SOURCE.length, `the script names ${named.size} lines, and lines-source.json has ${SOURCE.length}`);
  for (const id of named) assert.ok(chapter.lines[id], `the script names '${id}', which is not one of its lines`);
  // And played through, every caption shown is one of those lines' words, never an id shown as text.
  const { captions } = await unattended();
  const texts = new Set(Object.values(chapter.lines).map(line => line.text));
  assert.ok(captions.length >= 25, `${captions.length} lines were said`);
  for (const { text } of captions) assert.ok(texts.has(text), `the caption "${text}" is not one of the chapter's lines`);
  // Every line is said in one of the runs: the capture, the child who waits (the hints) and the eager child (the nose,
  // the critters, "Hvað er stjörnuhátíð?").
  const runs = [await unattended(), await ignoredByAChild(), await playedByAnEagerChild()];
  const said = new Set(runs.flatMap(run => [...run.seen.spoken]));
  for (const id of Object.keys(chapter.lines)) assert.ok(said.has(id), `${id} is never said`);
  // The ride's two opening lines of Mosi's are no taps' business: every run says them, not just one of the three.
  const who = ['the capture', 'the child who waits', 'the eager child'];
  runs.forEach((run, i) => {
    for (const id of ['k1_mosi_visit', 'k1_mosi_critters']) assert.ok(run.seen.spoken.has(id), `${id} is not said in the run of ${who[i]}`);
  });
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

test('the glow flowers hide by the big stone, under the ferns and up in the little tree, as the glade grows them on every preset', () => {
  const { layout, shots } = chapter.locations.burknalaut;
  const search = shots.search.position;
  assert.deepEqual(FLOWERS.map(f => f.name), ['stone', 'ferns', 'tree'], 'in the order the hints come');
  for (const [preset, q] of Object.entries(PRESETS)) {
    // What the glade's forest grows on this preset, told as the page's forest tells it (forest.js: info.placementList).
    const terrain = groundOf('burknalaut');
    const plan = planForest({ world: { chapter }, layout: { ...layout, shots }, seed: layout.seed, terrain, library: createSpeciesLibrary(layout.seed), q });
    const places = hidingPlaces(plan.placements.map(placementInfo));
    assert.deepEqual(places.map(p => p.name), ['stone', 'ferns', 'tree'], preset);
    for (const { name, position: [x, up, z], by } of places) {
      assert.ok(by, `${preset}: nothing grows where the ${name} flower hides`);
      const apart = Math.hypot(by.x - x, by.z - z);
      const where = `${preset}: the ${name} flower, ${apart.toFixed(2)} m from the middle of a ${by.name} of radius ${by.radius.toFixed(2)}`;
      if (name === 'stone') {
        assert.equal(by.name, 'rock', where);
        assert.ok(by.height >= 0.6, `${where}: a big stone, ${by.height.toFixed(2)} m tall`);
        assert.ok(apart > by.radius * 0.8 && apart < by.radius + 0.6, `${where}: right beside it`);
      } else if (name === 'ferns') {
        assert.equal(by.name, 'fern', where);
        assert.ok(apart < by.radius * 0.6, `${where}: under its fronds`);
      } else {
        assert.ok(['treeFern', 'cycad'].includes(by.name), `${where}: a little tree`);
        assert.ok(apart < by.trunk + 0.4, `${where}: on its trunk`);
        assert.ok(Math.abs(up - by.top) < 0.6 && by.height < 4, `${where}: up in it, ${up.toFixed(2)} m up, its trunk ends at ${by.top.toFixed(2)} m`);
      }
      // seen from the search camera, a little nearer than what hides it, so part of its glimmer shows
      assert.ok(Math.hypot(x - search[0], z - search[2]) < Math.hypot(by.x - search[0], by.z - search[2]), `${where}: on the camera's side of it`);
    }
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
  assert.deepEqual(seen.held, { atTray: 3, atMmm: [2, 1, 0] }, 'the three flowers stay in his hands until each goes into her mouth');
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
  // Mosi says again what to do with each flower, and Egill gives her each one himself: it leaves the tray by itself and
  // flies from his hands into her mouth.
  assert.equal(said('k1_mosi_give'), 4, 'once to begin, and once for each flower left in the tray');
  assert.equal(seen.trayDrops.made, 0, 'nobody dragged one');
  assert.equal(seen.trayRemoved.length, 3, 'each one left the tray by itself');
  assert.deepEqual(seen.held, { atTray: 3, atMmm: [2, 1, 0] }, 'and each left his hands as she took it');
  assert.deepEqual(journal.stars, ['k1_kambedla'], 'the star flew to the book by itself');
  assert.deepEqual(director.warnings, [], 'the hints and the waits keep the camera rules too');
  assert.ok(stage.s.time > (await unattended()).stage.s.time + 120, "and the waits were real ones, longer than a capture's");
});

test('the chapter draws once, behind the black, everything that would build its shaders as the child watches', async () => {
  const { world } = await playUnattended({ limit: 0.2 }); // the script's setup has run: the saddle is made, her plates are grey
  const effects = world.effects.size;
  const inScene = new Set(world.scene.children);
  const warm = chapter.warmUp(world);
  const under = root => { const names = []; root.traverse(o => names.push(o.name)); return names; };
  for (const actor of world.actors.values()) assert.ok(warm.objects.includes(actor.root), `${actor.name} is drawn, hidden or not`);
  assert.ok(under(world.actors.get('mosi').root).includes('mosi saddle'), 'with the saddle, before it pops on');
  assert.ok(under(world.actors.get('egill').root).some(name => / eyelids$/.test(name)), 'and the eyelids, which show only while shut');
  const kambedla = world.actors.get('kambedla');
  let glowing = false;
  kambedla.model.traverse(o => { if (o.isMesh && o.material.customProgramCacheKey?.().includes('plate-glow')) glowing = true; });
  assert.ok(glowing, 'Kambeðla with her plate glow, out of sight in the clearing');
  // Throwaways of what comes later: a glimmering flower, one of each critter and a bird, a print, sparkles and pollen.
  const names = warm.objects.flatMap(under);
  assert.ok(names.some(name => name.startsWith('Glow flower ')), 'a glow flower');
  for (const kind of ['frog', 'snail', 'beetle']) assert.ok(names.includes(kind), `a ${kind}`);
  assert.ok(warm.objects.some(o => o.name === 'Critters' && o.children.some(c => c.isInstancedMesh)), 'and a bird');
  const prints = warm.objects.find(o => o.name === 'Footprints');
  assert.ok(prints?.count >= 1, 'a footprint (an instanced mesh with none draws nothing, and builds nothing)');
  const fresh = world.scene.children.filter(o => !inScene.has(o));
  assert.ok(fresh.some(o => o.isPoints && o.material.blending === THREE.AdditiveBlending), 'sparkles');
  assert.ok(fresh.some(o => o.isPoints && o.material.blending === THREE.NormalBlending), 'pollen');
  // The views whose shadow passes the story draws, and the glade's own.
  assert.deepEqual(warm.shots, ['dawn', 'egillWaves', 'mountHigh', 'rideFeet']);
  assert.deepEqual(chapter.locations.burknalaut.warmUp, ['gladeArrive', 'search', 'feeding']);
  // The glade is built behind the start button too (two resident forests: +31.5 MB of geometry, textures under 40 MB), so the
  // change of place is only its two fades.
  assert.deepEqual(chapter.prepare, ['burknalaut']);
  for (const shot of warm.shots) assert.ok(shot in chapter.locations.rjodur.shots, shot);
  for (const shot of chapter.locations.burknalaut.warmUp) assert.ok(shot in chapter.locations.burknalaut.shots, shot);
  // The tray as scene 9 shows it, built once behind the start button.
  const { seen } = await unattended();
  assert.deepEqual(warm.tray, seen.trayShown[0]);
  warm.dispose();
  assert.deepEqual(world.scene.children.filter(o => !inScene.has(o)), [], 'the throwaways leave the scene');
  world.effects.update(1 / 30);
  assert.equal(world.effects.size, effects, 'and nothing of theirs runs on');
});

test('a child who finds Mosi\'s nose late still has time to make him sneeze: the window grows after the tickle', async () => {
  // The first tap comes at 4.2 s of the nose's 5, so the giggle ends past them; the second comes 2.5 s after the giggle.
  const giggle = RECORDED.k1_mosi_tickle.duration + 0.5; // the line and its hold
  const { world, captions, added } = await playUnattended({ seeking: false, limit: 100, noseAt: [4.2, 4.2 + giggle + 2.5] });
  const said = id => captions.filter(c => c.text === chapter.lines[id].text);
  assert.equal(said('k1_mosi_tickle').length, 1, 'the first tap tickles');
  assert.equal(said('k1_mosi_sneeze').length, 1, 'and the second, after the tickle, makes him sneeze');
  assert.ok(added.some(o => o.name === 'Sparkles' && o.normal), 'the pollen flies');
  assert.ok(world.chapterTimeline.at(-1).scene >= 4, 'and the story goes on to the Star Festival');
});

test('an eager child who taps everything: each tap does its one thing once, and the optional ones never get in the way', async () => {
  const { task, stage, journal, captions, added, lines, director, seen } = await playedByAnEagerChild();
  assert.equal(task.done, true, `still going at ${stage.s.time.toFixed(1)} s`);
  assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
  const said = id => captions.filter(c => c.text === chapter.lines[id].text);
  // His nose: once it tickles, the second time he sneezes and the pollen flies (a cloud that dims what is behind it) on the
  // "atsjú!", the last burst of sound in the recording.
  assert.equal(said('k1_mosi_tickle').length, 1);
  assert.equal(said('k1_mosi_sneeze').length, 1);
  const loud = [...lines.k1_mosi_sneeze.mouth].map(level => parseInt(level, 16) > 0);
  let atsju = loud.lastIndexOf(true);
  while (atsju > 0 && loud[atsju - 1]) atsju--;
  const sneeze = said('k1_mosi_sneeze')[0].at + atsju / 20;
  assert.ok(added.some(o => o.name === 'Sparkles' && o.normal && Math.abs(o.at - sneeze) < 0.1), `pollen flies on the "atsjú!", at ${sneeze.toFixed(2)} s`);
  assert.ok(seen.floatStart, 'Egill floated up when tapped');
  // Asked what the festival is, Egill asks it and Mosi tells, and the same choice comes again.
  assert.equal(said('k1_egill_what').length, 1);
  assert.equal(said('k1_mosi_explain').length, 1);
  assert.equal(said('k1_egill_yes').length, 1);
  // The critters by the path go in the journal, and Mosi says something about each, never over another line of his.
  assert.deepEqual(['beetle', 'frog', 'snail'].filter(kind => journal.findings.includes(kind)), ['beetle', 'frog', 'snail']);
  for (const id of ['k1_mosi_beetle', 'k1_mosi_frog', 'k1_mosi_snail']) assert.equal(said(id).length, 1, `${id} once`);
  const mosis = captions.filter(c => c.who === 'Mosi').sort((a, b) => a.at - b.at);
  for (let i = 1; i < mosis.length; i++) {
    const line = Object.values(chapter.lines).find(l => l.text === mosis[i - 1].text);
    assert.ok(mosis[i].at >= mosis[i - 1].at + lines[line.audio].duration - 1e-6, `"${mosis[i].text}" begins over "${mosis[i - 1].text}"`);
  }
  // Every flower found by a tap, no hints needed. Each flower dragged to her mouth is taken, whichever pocket it comes from,
  // the first a second after the tray shows (while Mosi still says what to do): none goes home and Egill gives none.
  for (const id of ['k1_mosi_hint_stone', 'k1_mosi_hint_ferns', 'k1_mosi_hint_tree']) assert.equal(said(id).length, 0, `no ${id}`);
  assert.deepEqual(seen.trayDrops, { made: 3, home: 0 }, 'three drops, each one taken');
  assert.deepEqual(seen.trayRemoved.map(r => r.id), ['flower-3', 'flower-2', 'flower-1'], 'the last pocket each time');
  assert.deepEqual(seen.held, { atTray: 3, atMmm: [2, 1, 0] }, 'each one he gives leaves his hands');
  assert.equal(said('k1_mosi_give').length, 1, 'no need to say it again');
  assert.deepEqual(journal.stars, ['k1_kambedla']);
  assert.deepEqual(director.warnings, []);
  assert.ok(stage.s.time < (await ignoredByAChild()).stage.s.time - 100, 'and it goes much quicker than for a child who waits');
});

test('on the ride Mosi presses big footprints into the path, seen by his feet, and birds flutter up from the path ahead', async () => {
  for (const [how, run] of [['a capture', unattended], ['a child who waits', ignoredByAChild]]) {
    const { seen } = await run();
    assert.ok(seen.printsInRideFeet >= 4, `${how}: ${seen.printsInRideFeet} of his prints in the low shot by his feet`);
    assert.equal(seen.printsInGlade, false, `${how}: and none follow him into the glade`);
    const ride = seen.birdsUp.filter(b => b.scene === 6);
    assert.equal(ride.length, 3, `${how}: three birds fly up on the ride`);
    assert.ok(ride.every(b => b.shot === 'rideWide' && b.seen), `${how}: from the path ahead, where the wide shot sees them`);
  }
});

test('on the ride Mosi names the visit and then tells Egill to look out for small animals, before the camera shows the first one', async () => {
  const visit = chapter.lines.k1_mosi_visit;
  const critters = chapter.lines.k1_mosi_critters;
  for (const [how, run] of [['a capture', unattended], ['a child who waits', ignoredByAChild], ['an eager child', playedByAnEagerChild]]) {
    const { captions, lines, seen, world } = await run();
    const cutAt = shot => seen.cuts.find(cut => cut.shot === shot).at;
    const mosis = captions.filter(c => c.who === 'Mosi').sort((a, b) => a.at - b.at);
    const said = line => mosis.filter(c => c.text === line.text);
    assert.equal(said(visit).length, 1, `${how}: the visit line once`);
    assert.equal(said(critters).length, 1, `${how}: and the line about the small animals once`);
    const [first] = said(visit);
    const [second] = said(critters);
    // On the ride, right after the visit line, and never over it: no remark about a critter the child tapped gets in between.
    assert.ok(first.at > world.chapterTimeline.find(m => m.scene === 6).at, `${how}: it comes in scene 6, the ride`);
    assert.equal(mosis.indexOf(second), mosis.indexOf(first) + 1, `${how}: nothing of Mosi's comes between the two`);
    assert.ok(second.at >= first.at + lines[visit.audio].duration - 1e-6, `${how}: the second begins over the first`);
    // A critter's remark waits for both.
    const over = second.at + lines[critters.audio].duration;
    for (const id of ['k1_mosi_beetle', 'k1_mosi_frog', 'k1_mosi_snail']) {
      for (const remark of said(chapter.lines[id])) assert.ok(remark.at >= over - 1e-6, `${how}: ${id} comes before the line about the small animals is over`);
    }
    // It is over, its caption too (a line is held half a second after its recording), before the camera cuts to the first critter,
    // the beetle in rideFeet, and long before the move to the glade.
    assert.ok(over + 0.5 < cutAt('rideFeet'), `${how}: the line about the small animals runs until ${over + 0.5} s, the camera shows the beetle at ${cutAt('rideFeet')} s`);
    assert.ok(over + 0.5 < cutAt('gladeArrive'), `${how}: and the glade comes after it, at ${cutAt('gladeArrive')} s`);
  }
});

test('Egill presses the grass down and the ferns aside as a boy does, not with Mosi\'s footprint', async () => {
  // The forest lays the grass down and leans the ferns round a capsule under each actor (forest.js), the size of the
  // grass's footprint times the actor's footprintScale; the ferns' reach scales with it. Mosi's size unless a chapter
  // says otherwise, the boy's too.
  const { world } = await unattended();
  const { radius, halfLength } = FOREST.grass.footprint;
  const scale = name => world.actors.get(name).footprintScale ?? 1;
  const boy = scale('egill');
  assert.ok(radius * boy <= 0.35, `his footprint reaches ${(radius * boy).toFixed(2)} m out from him, not the ${radius} m round Mosi`);
  assert.ok(2 * (halfLength + radius) * boy <= 1.6, `and is ${(2 * (halfLength + radius) * boy).toFixed(2)} m long`);
  assert.ok(boy > 0, 'but he still stands in the grass');
  assert.equal(scale('mosi'), 1, 'Mosi keeps the footprint the forest is made for');
  assert.equal(scale('kambedla'), 1, 'and so does Kambeðla, who is nearly his size');
});

test('a step sound that breaks stops the steps, never the story', async () => {
  const errors = [];
  const report = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));
  try {
    const { task, stage, journal } = await playUnattended({ seeking: false, limit: 900, brokenSteps: true });
    assert.equal(task.done, true, `the chapter was still going at ${stage.s.time.toFixed(1)} s`);
    assert.equal(task.failed, false, String(task.error?.stack ?? task.error));
    assert.deepEqual(journal.stars, ['k1_kambedla'], 'it went on to the star');
  } finally {
    console.error = report;
  }
  assert.ok(errors.some(e => e.includes('a step sound broke')), 'the broken step is reported');
});

test('Egill holds the posy in both hands: as he walks to her and turns, each hand stays on the stems', async () => {
  for (const [how, run] of [['a capture', unattended], ['a child who waits', ignoredByAChild], ['an eager child', playedByAnEagerChild]]) {
    const { grip } = (await run()).seen;
    assert.ok(grip.frames > 30, `${how}: he carries the posy into scene 9 (${grip.frames} frames)`);
    assert.ok(grip.walked > 1 && grip.turned > 15, `${how}: walking ${grip.walked.toFixed(1)} m and turning ${grip.turned.toFixed(0)} degrees`);
    assert.ok(grip.worst < 0.03, `${how}: his hands stay within ${(grip.worst * 100).toFixed(1)} cm of the stems`);
    assert.ok(grip.after.every(d => d > 0.1), `${how}: and once the posy is gone they are back at his sides`);
  }
});

test('Mosi walks all the way to Egill, however soon the child taps Egill to wave', async () => {
  const stop = new THREE.Vector3(...chapter.locations.rjodur.layout.actors.mosi.position);
  for (const [how, run] of [['a capture', unattended], ['a child who waits', ignoredByAChild], ['an eager child', playedByAnEagerChild]]) {
    const { seen } = await run();
    const mosi = seen.atScene[2].mosi.clone().setY(0); // as scene 3 starts
    assert.ok(mosi.distanceTo(stop) < 0.3, `${how}: Mosi stopped ${mosi.distanceTo(stop).toFixed(2)} m short of his place`);
  }
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

test('the plates light one row a flower, head first, all three after the third', async () => {
  for (const [how, run] of [['a capture', unattended], ['a child who waits', ignoredByAChild], ['an eager child', playedByAnEagerChild]]) {
    const { seen } = await run();
    assert.deepEqual(seen.rows.map(r => [r.row, r.level]), [[0, 1], [1, 1], [2, 1]], `${how}: one row a flower, from the head back`);
    seen.rows.forEach((r, i) => assert.ok(r.at >= seen.trayRemoved[i].at, `${how}: row ${i} lights once flower ${i + 1} is given`));
  }
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

test('Kambeðla talks with her beak: her jaw opens with her voice in every line of hers, as Mosi\'s beak does in his', async () => {
  const { seen, world } = await unattended();
  const faceOf = actor => {
    let face = null;
    actor.model.traverse(o => { if (!face && o.isSkinnedMesh && o.userData.face) face = o.userData.face; });
    return face;
  };
  const talk = faceOf(world.actors.get('kambedla')).mouth?.talk;
  assert.equal(talk, 8, 'the mouth pass says how far her jaw opens at the loudest');
  const hers = Object.keys(chapter.lines).filter(id => id.startsWith('k1_kambedla_')).sort();
  assert.deepEqual(hers, ['k1_kambedla_accept', 'k1_kambedla_glow', 'k1_kambedla_hello', 'k1_kambedla_lost', 'k1_kambedla_mmm1', 'k1_kambedla_mmm2', 'k1_kambedla_mmm3']);
  // Each line's recorded loudness opens it (lines.json), most of the way at its loudest syllable, and never past talk.
  for (const id of hers) assert.ok(seen.jaws[id] > 4 && seen.jaws[id] <= talk + 0.01, `${id}: her jaw opened ${seen.jaws[id]?.toFixed(1)} degrees at the widest`);
  // Mosi's beak in his lines in the glade, the same way.
  const his = faceOf(world.actors.get('mosi')).mouth.talk;
  for (const id of ['k1_mosi_greet', 'k1_mosi_worry']) assert.ok(seen.jaws[id] > 3 && seen.jaws[id] <= his + 0.01, `${id}: his beak opened ${seen.jaws[id]?.toFixed(1)} degrees`);
});

// ---------------------------------------------------------------------------------------------
// The points that follow the characters, on the real models

test('the sun winks where the child sees it: on the screen, with nobody in front of its face', async () => {
  const { winks } = await unattended();
  assert.equal(winks.length, 2);
  for (const { at, x, y, hidden } of winks) {
    assert.ok(Math.abs(x) < 0.85 && Math.abs(y) < 0.85, `the sun on the screen as it winks at ${at.toFixed(1)} s, not at ${x.toFixed(2)}, ${y.toFixed(2)}`);
    assert.equal(hidden, false, `somebody stands in front of the sun as it winks at ${at.toFixed(1)} s`);
  }
});

test('yield flower.hold() and flower.pick() through the scheduler: the scene waits for each, the flower stays in Egill\'s hands and then goes', async () => {
  const world = await chapterWorld();
  const egill = world.actors.get('egill');
  egill.place(0, 0, 0);
  const flower = createGlowFlower(world, { name: 'stone', position: [2, 0, 1.5] });
  const stage = createScene({ world, director: { stop() {}, handheld() {} }, ui: { reset() {} }, voice: { stop() {} } });
  const done = { held: null, given: null };
  const mouth = [1.6, 1.0, -0.5];
  stage.start(function* script() {
    yield flower.hold(POINTS.egillHands, { size: 0.55, turn: () => egill.root.quaternion });
    done.held = stage.s.time;
    yield 1;
    yield flower.pick(mouth);
    done.given = stage.s.time;
  });
  const hands = world.resolvePoint(POINTS.egillHands, new THREE.Vector3());
  const frames = seconds => {
    for (let i = 0; i < Math.round(seconds * 30); i++) {
      world.clock.step(1 / 30);
      stage.update(1 / 30);
      updateActors(world.actors.values(), 1 / 30);
      world.effects.update(1 / 30);
    }
  };
  frames(1.2);
  assert.ok(done.held !== null && Math.abs(done.held - 0.6) < 0.1, `the scene went on at ${done.held} s, as the flower reached his hands`);
  assert.equal(flower.group.visible, true, 'he holds it');
  assert.ok(flower.group.position.distanceTo(hands) < 1e-6, 'the foot of its stem in his hands');
  frames(1.2);
  assert.ok(done.given !== null && Math.abs(done.given - done.held - 1.6) < 0.15, `and went on ${(done.given - done.held).toFixed(2)} s later, a second and the 0.6 s it takes to give`);
  assert.equal(flower.group.visible, false, 'given: gone from his hands');
  // His hands: in front of his chest, between the two hands of the real model, at his hands' height.
  const left = egill.model.getObjectByName('LeftHand').getWorldPosition(new THREE.Vector3());
  const right = egill.model.getObjectByName('RightHand').getWorldPosition(new THREE.Vector3());
  const chest = egill.model.getObjectByName('Chest').getWorldPosition(new THREE.Vector3());
  assert.ok(hands.x > chest.x + 0.1, 'in front of him, not in him');
  assert.ok(hands.distanceTo(left) < 0.4 && hands.distanceTo(right) < 0.4, 'within his reach');
  assert.ok(hands.y > Math.min(left.y, right.y) && hands.y < chest.y, 'at the height he holds things');
});

test('the points on the characters sit where they are named: Mosi\'s nose, sneeze and horn, Kambeðla\'s mouth and plates', async () => {
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
  // Where a point is on a face, measured from the eyes the face pass found (in the skin's bind space, carried by the Head
  // bone): how far it is across from the midline between them, how far ahead of them, and how far ahead the front of the
  // face is along that midline. (The idle pose turns Mosi's head to his left, so the world's axes say nothing here.)
  const onFace = (actor, point) => {
    const mesh = skin(actor);
    const head = actor.model.getObjectByName('Head');
    const toWorld = head.matrixWorld.clone().multiply(mesh.skeleton.boneInverses[mesh.skeleton.bones.indexOf(head)]).multiply(mesh.bindMatrix);
    const eyes = mesh.userData.face.eyes.map(eye => ({
      centre: new THREE.Vector3().fromArray(eye.centre).applyMatrix4(toWorld),
      normal: new THREE.Vector3().fromArray(eye.normal).transformDirection(toWorld),
    }));
    const middle = eyes[0].centre.clone().lerp(eyes[1].centre, 0.5);
    const across = eyes[1].centre.clone().sub(eyes[0].centre).normalize();
    const ahead = eyes[0].normal.clone().add(eyes[1].normal);
    ahead.addScaledVector(across, -ahead.dot(across)).normalize();
    const v = new THREE.Vector3();
    let front = -Infinity;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).sub(middle);
      if (Math.abs(v.dot(across)) < 0.08) front = Math.max(front, v.dot(ahead));
    }
    const d = point.clone().sub(middle);
    return { across: d.dot(across), ahead: d.dot(ahead), front };
  };
  // The nose the child taps: a 0.45 m sphere round the middle of his snout, which takes in its front.
  const nose = onFace(mosi, at(mosi, POINTS.mosiNose));
  assert.ok(Math.abs(nose.across) < 0.1, `the nose on the middle of his face, not ${nose.across.toFixed(2)} m to one side`);
  assert.ok(nose.ahead > 0.25 && nose.front - nose.ahead < 0.4, `in his snout, ${nose.ahead.toFixed(2)} m ahead of his eyes (its front: ${nose.front.toFixed(2)} m)`);
  // Where the pollen comes out: just in front of it.
  const sneeze = at(mosi, POINTS.mosiSneeze);
  const out = onFace(mosi, sneeze);
  assert.ok(Math.abs(out.across) < 0.1, `the sneeze from the middle of his face, not ${out.across.toFixed(2)} m to one side`);
  assert.ok(out.ahead > out.front - 0.1 && nearestSkin(mosi, sneeze) < 0.2, `and from the front of his snout (${out.front.toFixed(2)} m ahead of his eyes), not ${out.ahead.toFixed(2)} m`);
  const horn = at(mosi, POINTS.mosiHorn);
  assert.ok(horn.y > 3.6 && nearestSkin(mosi, horn) < 0.08, 'at the tip of his horn');
  const mouth = at(kambedla, POINTS.kambedlaMouth);
  const onMuzzle = onFace(kambedla, mouth);
  assert.ok(Math.abs(onMuzzle.across) < 0.06 && onMuzzle.ahead > onMuzzle.front - 0.15, `her mouth on the middle of her face, at its front: ${JSON.stringify(onMuzzle)}`);
  assert.ok(mouth.y > 1.5 && mouth.y < 2.1 && nearestSkin(kambedla, mouth) < 0.15, `and at the height of her snout, ${mouth.toArray().map(n => n.toFixed(2))}`);
  const plates = world.resolvePoint(POINTS.kambedlaPlates, new THREE.Vector3());
  assert.ok(plates.y > 3.7 && plates.y < 4.1, `the star rises from just above her tallest plates, at ${plates.y.toFixed(2)} m`);
});
