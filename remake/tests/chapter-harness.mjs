// The chapter test harness, lifted from tests/kafli1.test.mjs: a chapter played from the start button to its end in Node, in the
// seeking mode a capture (?t=) uses, or as a child who never touches the screen or taps in a given way would play it. The world is
// a stand-in for the page's (no renderer, forests that are only their ground), with the real characters, camera director, scene,
// screen layer and journal. Each function is given the chapter it plays: chapterWorld(chapter), and playUnattended(chapterModule,
// options) with the chapter's module, whose `chapter` it plays.
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from '../../dist/vendor/GLTFLoader.js';
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
import { Handle } from '../engine/handle.js';
import { pickLook } from '../engine/looks.js';
import { sunDirection } from '../engine/lighting.js';
import { SUN_RADIUS_DEG, WAVE_SECONDS, HUG_SECONDS, WINK_SECONDS, MOUTH_BETWEEN, createSunFace } from '../engine/sun-face.js';
import { shapeGround, placementInfo } from '../world/forest/forest.js';
import { planForest } from '../world/forest/plan.js';
import { createSpeciesLibrary } from '../world/forest/species.js';
import { PRESETS } from '../engine/quality.js';
import { FakeDocument, pointerEvent } from './fake-dom.mjs';

const file = relative => new URL(relative, import.meta.url);
const readJson = relative => JSON.parse(fs.readFileSync(file(relative), 'utf8'));

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
  if (!models.has(url)) models.set(url, loadGlb(new URL(url, file('../chapters/')))); // a chapter's actor urls are relative to chapters/
  return models.get(url);
};

/**
 * A chapter's world: its actors, a camera at 16:10, the effects and the clock main.js has, and a sun and a fog in the chapter's look
 * (the fog as engine/fog.js lays it, without its shader patch: a chapter thickens it, as chapter 2's lookout does).
 */
export async function chapterWorld(chapter) {
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1200);
  const look = pickLook(chapter.look);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(look.fog.color, look.fog.density);
  const world = {
    THREE, scene, camera, clock: createClock(), chapter, heightAt: () => 0, actors: new Map(), effects: createEffects(),
    lighting: { direction: sunDirection(look) },
  };
  world.resolvePoint = createPointResolver(world);
  // A model a chapter's props load for themselves (chapter 2's far friends), read as the actors' are: the page has no fetch of files.
  world.loadModel = url => modelOf(url);
  for (const [name, spec] of Object.entries(chapter.actors)) {
    world.actors.set(name, await createActor(world, { name, gltf: await modelOf(spec.url), position: spec.position, heading: spec.heading }));
  }
  return world;
}

/**
 * A forest that is only its ground, with two butterflies that can be tapped and sent to a point. Flat, or `shaped` (given the
 * world): the place's own ground as its forest shapes it (world/forest/forest.js: shapeGround, with the Fen's pools dug out and
 * its hummocks raised), and where the place has water, a stand-in for its surface (world/props/water.js) that keeps every ring
 * asked of it in `ripples` ({ x, z, strength, at }, `at` on the world's clock) and every set of bubbles in `bubbles`.
 */
export function groundOnly(layout, { shaped = false, world = null } = {}) {
  const [cx, cz] = layout.clearing.center;
  const targets = [1, 2].map(i => ({ name: `butterfly-${i}`, point: new THREE.Vector3(cx + 2 * i, 1.2, cz + 3), radius: 0.4 }));
  const landed = [];
  const ground = shaped ? shapeGround(world, layout, layout.seed) : null;
  const heightAt = ground ? (x, z) => ground.terrain.heightAt(x, z) : () => 0;
  let water = null;
  if (ground?.water) {
    const shape = ground.water;
    const at = point => (point.isVector3 ? point : Array.isArray(point) ? { x: point[0], z: point[2] } : point);
    const done = label => new Handle(label).finish();
    water = {
      shape, ripples: [], bubbles: [],
      level: shape.level,
      surfaceAt: (x, z) => (shape.signedAt(x, z) < 0 ? shape.level : null),
      depthAt: (x, z) => (shape.signedAt(x, z) < 0 ? Math.max(0, shape.level - heightAt(x, z)) : 0),
      rippleAt(point, strength = 1) {
        const { x, z } = at(point);
        water.ripples.push({ x, z, strength, at: world.clock.time });
        return done('ripple');
      },
      bubblesAt(point) {
        const { x, z } = at(point);
        water.bubbles.push({ x, z, at: world.clock.time });
        return done('bubbles');
      },
      wade() {},
    };
  }
  return {
    group: new THREE.Group(),
    layout,
    heightAt,
    water,
    // the plants a chapter stands things on (chapter 2's far Flugeðla on her dead snag), as the forest lists them: planned once
    info: { placementList: ground ? snagsOf(world, layout, ground) : [] },
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

/** The dead snags of a shaped place, from its plan, as createForest's info lists them (planned once for each layout). */
const snagLists = new Map();
function snagsOf(world, layout, ground) {
  if (!(layout.plants ?? []).some(p => p.name === 'deadSnag')) return [];
  if (!snagLists.has(layout)) {
    const plan = planForest({ world, layout: ground.layout, seed: layout.seed, terrain: ground.terrain, library: createSpeciesLibrary(layout.seed), q: PRESETS.tablet });
    snagLists.set(layout, plan.placements.filter(p => p.name === 'deadSnag').map(placementInfo));
  }
  return snagLists.get(layout);
}

/** A pointer that remembers the targets the scene puts on it and the drags it listens to, and taps one when told. */
export function fakePointer() {
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
    tap: (name, at = { x: 0, y: 0 }) => [...listeners.tap].forEach(fn => fn({ name, x: at.x, y: at.y })),
  };
}

const PAGE = ['caption', 'choices', 'fade', 'tray', 'view', 'journal-button', 'star-slots', 'journal-flights', 'journal-badge'];

/** A stand-in for the book (engine/book/book.js), which the journal opens: how it was opened (and which tile it was asked to nod), and no pictures to fly. */
export function fakeBook() {
  return {
    opened: [], nods: [], isOpen: false,
    open(tab, by, options) { this.opened.push([tab, by]); this.nods.push(options?.nod ?? null); this.isOpen = true; },
    close() { this.isOpen = false; },
    refresh() {},
    pictureOf: () => null,
  };
}

/**
 * A chapter, given as its module (`import * as kafli1 from '../chapters/kafli1.js'`), played until it ends or `limit` seconds have
 * gone by: in seeking mode, as a capture plays it; or (seeking false)
 * as it plays for a child who never touches the screen, or, `eager`, for one who taps everything there is to tap a moment after
 * it appears and drags each flower to Kambeðla's mouth. `noseAt` is for a child who taps only Mosi's nose: the seconds after it
 * becomes a target at which each tap comes. `earlyTap` ({ name, after }) is for a child who taps one target `after` seconds after
 * it appears, and nothing else. `shaped` plays on each place's own ground and water (groundOnly) instead of a flat floor, and
 * `onFrame({ t, world, stage, director, pointer, ui, shot })` is called after every frame, for a test that watches something as it goes.
 *
 * As main.js has it, the chapter's later things (chapter.later.make: chapter 2's far friends) are made before the first frame
 * moves on, as if behind the start button; `makeLater` false leaves them to the chapter, as for a child who taps the start button
 * at once. `slowBuilds` (seconds, or { name: seconds }) builds each place but the first as main.js does once the start button
 * shows, one after another in the order of chapter.prepare and over frames: each build is done that many seconds of the run after
 * it is asked for. Each place's build is in `builds` ({ name: { asked, built, failed } }, the run's seconds). `failBuilds`
 * ({ name: times }) makes a place's first builds fail, as a build that throws would.
 *
 * The page the journal's map moment (engine/book/map-moment.js) stands in can animate, as a tablet's does: its elements have an
 * `animate` that only takes the call, and the moment slides, draws and closes on the game clock as it does in the game. `reduced`
 * is a tablet that asks for less motion (prefers-reduced-motion: reduce): the moment then comes and goes without sliding or drawing.
 * Every moment the script plays is in `moments`. `seenBefore` are the ids the child's save has seen already (the map's pieces, such as
 * 'map-route-a', from an earlier play of the chapter).
 */
export async function playUnattended(chapterModule, { limit = 600, seeking = true, eager = false, brokenSteps = false, noseAt = null, earlyTap = null, shaped = false, onFrame = null, makeLater = true, slowBuilds = 0, failBuilds = {}, reduced = false, seenBefore = [] } = {}) {
  // Chapter 1's probes (the flowers in Egill's hands, his grip, Kambeðla's mouth) read its POINTS, HELD and onBone; a chapter
  // without them leaves those probes idle.
  const { chapter, POINTS, HELD, onBone } = chapterModule;
  const world = await chapterWorld(chapter);
  // The real sun, as main.js has it, updated each frame once the camera has moved: its calls start its gestures and finish their
  // handles. (Made before world.scene.add is watched below: its sprite and overlay are there from the start.)
  const sunFace = createSunFace({ scene: world.scene, lighting: world.lighting });
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
  let runTime = 0; // the run's seconds (the loop's t)
  const builds = {}; // name -> { asked, built }
  const due = []; // slow builds: { at, resolve, forest }
  let asking = null; // the place whose build is asked for now
  let slow = false; // the first place is built at once
  const failing = { ...failBuilds };
  const locations = createLocations({ world, locations: chapter.locations, build: layout => {
    if (failing[asking] > 0) {
      failing[asking]--;
      (builds[asking] ??= { asked: runTime, built: null, failed: 0 }).failed = (builds[asking].failed ?? 0) + 1;
      return Promise.reject(new Error(`the build of ${asking} failed`));
    }
    const f = groundOnly(layout, { shaped, world });
    forests.push(f);
    const record = builds[asking] = { asked: runTime, built: null, failed: builds[asking]?.failed ?? 0 };
    const seconds = typeof slowBuilds === 'number' ? slowBuilds : slowBuilds?.[asking] ?? 0;
    if (!slow || !seconds) {
      record.built = runTime;
      return f;
    }
    return new Promise(resolve => due.push({ at: runTime + seconds, resolve: () => { record.built = runTime; resolve(f); } }));
  } });
  for (const call of ['prepare', 'setLocation']) {
    const real = locations[call];
    locations[call] = name => {
      asking = name;
      return real(name);
    };
  }
  await locations.setLocation(chapter.start);
  slow = true;
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
  const create = doc.createElement.bind(doc);
  doc.createElement = tag => { // a page that can animate: the map moment asks its elements to slide and draw
    const element = create(tag);
    element.animate = () => ({ cancel() {}, finish() {} });
    return element;
  };
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
    if (!POINTS?.egillHands) return 0;
    const hands = world.resolvePoint(POINTS.egillHands, new THREE.Vector3());
    return world.scene.children.filter(o => o.name.startsWith('Glow flower ') && o.visible && o.position.distanceTo(hands) < 0.05).length;
  };
  const held = { atTray: null, atMmm: [] }; // as the tray shows, and as she says each "Mmm!"
  const mmm = ['k1_kambedla_mmm1', 'k1_kambedla_mmm2', 'k1_kambedla_mmm3'].filter(id => chapter.lines[id]).map(id => chapter.lines[id].text);
  const captions = [];
  const caption = ui.caption;
  ui.caption = (who, text, colour) => {
    if (text != null) captions.push({ who, text, at: stage.s.time });
    if (text != null && who === 'Kambeðla' && mmm.includes(text)) held.atMmm.push(heldInHands());
    return caption(who, text, colour);
  };
  doc.getElementById('star-slots').rect = { left: 1180, top: 20, width: 40, height: 40 };
  world.renderer = { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 800 }) } };

  const book = fakeBook();
  const win = reduced ? { matchMedia: () => ({ matches: true }) } : undefined;
  const save = createSave(null);
  for (const id of seenBefore) save.addSeen(id);
  const journal = createJournal(doc, save, { book, win });
  // Every map moment the script plays: the pieces, when it came up (scene time), how long it said the slide and the drawing take,
  // when it was closed and how long it said the slide away takes, when the overlay was gone from the page, the lines said by the time
  // it came up, what the save had seen of the map's pieces before and after, and each piece's state in the overlay as it came up.
  const moments = [];
  const overlayUp = () => doc.body.children.some(element => element.classList.contains('map-moment'));
  const { play, close } = journal.mapMoment;
  journal.mapMoment.play = ids => {
    const before = [...save.get().seen];
    const made = play(ids);
    const [overlay] = doc.body.children.filter(element => element.classList.contains('map-moment'));
    const states = Object.fromEntries(ids.map(id => [id, [...new Set(overlay?.findAll(element => element.getAttribute('data-piece') === id).map(element => element.getAttribute('data-state')))]]));
    moments.push({ ids: [...ids], at: stage.s.time, drawMs: made.drawMs, closeAt: null, closeMs: null, goneAt: null, saidBefore: new Set(spoken), seenBefore: before, seenAfter: [...save.get().seen], states });
    return made;
  };
  journal.mapMoment.close = () => {
    const ms = close();
    const open = moments.findLast(moment => moment.closeAt === null);
    if (open) Object.assign(open, { closeAt: stage.s.time, closeMs: ms });
    return ms;
  };
  const finds = []; // every find the journal is told of, with where the child tapped it
  const addFinding = journal.addFinding;
  journal.addFinding = (id, from, options) => {
    finds.push({ id, from, options });
    return addFinding(id, from, options);
  };
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
    // and to its two hands, wherever they are
    for (const hand of sunFace.handPoints) rays.push(hand.clone().sub(world.camera.position).normalize());
    const hands = sunFace.handPoints.map(hand => hand.clone().project(world.camera));
    const people = [...world.actors.values()].filter(actor => actor.root.visible);
    for (const actor of people) actor.root.traverse(o => { if (o.isSkinnedMesh) o.boundingSphere = o.boundingBox = null; }); // posed now
    const hidden = rays.some(ray => {
      raycaster.set(world.camera.position, ray);
      return people.some(actor => raycaster.intersectObject(actor.root, true).some(hit => shown(hit.object)));
    });
    return { x, y, hidden, hands: hands.map(h => [h.x, h.y]) };
  }
  const winks = [];
  // Every call the script makes to the sun, with where the sun is then; and the sun as it goes on (sunFrames: every frame;
  // sunViews: on the screen and in front of anyone? five times a second while a gesture or a mouth of the script's is under way).
  const sunCalls = [];
  for (const call of ['wink', 'wave', 'hug', 'mouth']) {
    const real = sunFace[call];
    sunFace[call] = (...args) => {
      const made = { call, args, at: stage.s.time, scene: world.chapterTimeline?.at(-1)?.scene, shot: shotNow, ...sunInView() };
      sunCalls.push(made);
      if (call === 'wink') winks.push(made);
      return real(...args);
    };
  }
  const sounds = [];
  const soundLog = []; // every sound the scene asks for: { name, detail, at, scene }
  const lines = readJson('../assets/audio/lines.json');
  const stage = createScene({
    world, director, ui, lines, cast: chapter.cast, locations, pointer, journal,
    voice: { play: () => null, stop() {} },
    sun: sunFace,
    sfx: {
      play(name, detail) {
        if (brokenSteps && name === 'step') throw new Error('a step sound broke');
        sounds.push(name);
        soundLog.push({ name, detail, at: stage.s.time, scene: world.chapterTimeline?.at(-1)?.scene });
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
  // main.js's builds once the start button shows: one place after another, each over frames
  if (slowBuilds) (async () => { for (const name of chapter.prepare ?? []) await locations.prepare(name).catch(() => {}); })();
  let madeLater = !makeLater || !chapter.later?.make;

  // What the run sees on the way, for the tests to look at afterwards.
  const seen = {
    kambedlaInClearing: false, floatStart: null, landing: null, atScene: [], trayRemoved, trayShown, trayDrops: { made: 0, home: 0 }, held,
    printsInRideFeet: 0, printsInGlade: false, birdsUp: [], spoken, rows, cuts,
    // The early tap, once made: { name, appeared, at } in scene time, the journal's findings right after it, and when the target first
    // moved (the critter's reaction: its live point follows it).
    earlyTap: null,
    // How far each speaker's jaw opens while they speak a line, at the widest, in degrees: line id -> degrees.
    jaws: {},
    // Scene 9 from the feeding shot until a flower leaves his hands: how far his wrists stray from where they hold the
    // stems, how far he walks and how far he turns meanwhile; and his wrists once the posy is gone, at scene 10.
    grip: { worst: 0, frames: 0, from: null, walked: 0, turned: 0, after: null },
    egillClips: [], mosiLooks: [], mosiWalked: false, mosiStopped: null, sunFrames: [], sunViews: [],
    // The sun on the screen and in front of anyone, every other frame while it winks.
    winkViews: [],
    // Scene 2: when the tap target on Egill appeared, how far the handheld was on then, and Egill on the screen while he hops.
    egillTarget: null, egillOnScreen: [],
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
  // Egill's clips as he plays them and Mosi's looks as he turns his head, with when (and Mosi walking or not, and how far his head is
  // from Egill along the ground).
  const head = new THREE.Vector3();
  const headToEgill = () => mosi.headPosition(head).setY(0).distanceTo(egill.root.position.clone().setY(0));
  const playEgill = egill.play;
  egill.play = (clip, options) => {
    seen.egillClips.push({ clip, at: stage.s.time, mosiWalking: mosi.walking, head: headToEgill(), shot: shotNow });
    return playEgill(clip, options);
  };
  const lookMosi = mosi.lookAt;
  mosi.lookAt = (spec, options) => {
    seen.mosiLooks.push({ spec, at: stage.s.time });
    return lookMosi(spec, options);
  };
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
  const mouth = POINTS?.kambedlaMouth ? onBone(kambedla, ...POINTS.kambedlaMouth) : null; // where chapter 1's flowers are dropped
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
        // The last answer first (chapter 1's "Hvað er stjörnuhátíð?"), and then the first (its "Já, gerum það!").
        const buttons = choicesEl.children;
        (asked ? buttons[0] : buttons[buttons.length - 1]).dispatchEvent(new Event('click'));
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
    if (!pockets.length || !mouth) {
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

  // The child who taps one target early and nothing else.
  let earlySince = null;
  let earlyFrom = null; // where the target was at the tap
  function earlyChild(t) {
    const spec = pointer.targets.get(earlyTap.name);
    if (!spec || seen.earlyTap) return;
    earlySince ??= { t, at: stage.s.time };
    if (t - earlySince.t < earlyTap.after - 1e-9) return;
    earlyFrom = spec.point?.isVector3 ? spec.point.clone() : null; // a target round a spec string ('egill') does not move by itself
    pointer.tap(earlyTap.name, EARLY_TAP_AT);
    seen.earlyTap = { name: earlyTap.name, appeared: earlySince.at, at: stage.s.time, found: [...journal.findings], movedAt: null };
  }
  function earlyReaction() {
    const spec = pointer.targets.get(earlyTap.name);
    if (seen.earlyTap && seen.earlyTap.movedAt === null && spec && earlyFrom && spec.point.distanceTo(earlyFrom) > 0.005) seen.earlyTap.movedAt = stage.s.time;
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
    runTime = t;
    for (const build of due.filter(d => d.at <= t + 1e-9)) {
      due.splice(due.indexOf(build), 1);
      build.resolve();
    }
    if (eager) eagerChild(t);
    if (noseAt) noseChild(t);
    if (earlyTap) earlyChild(t);
    world.clock.step(dt);
    journal.update(dt);
    for (const moment of moments) if (moment.closeAt !== null && moment.goneAt === null && !overlayUp()) moment.goneAt = stage.s.time;
    stage.update(dt);
    updateActors(world.actors.values(), dt);
    world.effects.update(dt);
    director.update(dt);
    sunFace.update(world.clock.time, world.camera); // after the camera, as main.js does
    {
      const scene = world.chapterTimeline.at(-1)?.scene;
      seen.sunFrames.push({
        at: stage.s.time, t: world.clock.time, scene, shot: shotNow, eyes: sunFace.eyes, mouth: sunFace.mouthFrame, squash: sunFace.squash.x,
        hands: sunFace.hands.map(h => [h.x, h.y, h.angle]),
      });
      const busy = sunCalls.some(c => c.call !== 'wink' && stage.s.time >= c.at && stage.s.time <= c.at + (c.call === 'hug' ? HUG_SECONDS : c.call === 'wave' ? WAVE_SECONDS : (c.args[1] ?? 1.5) + MOUTH_BETWEEN));
      if (busy && seen.sunFrames.length % 6 === 0) seen.sunViews.push({ at: stage.s.time, scene, shot: shotNow, ...sunInView() });
      const winking = sunCalls.some(c => c.call === 'wink' && stage.s.time >= c.at && stage.s.time <= c.at + WINK_SECONDS);
      if (winking && seen.sunFrames.length % 2 === 0) seen.winkViews.push({ at: stage.s.time, scene, shot: shotNow, ...sunInView() });
      if (scene === 2) {
        if (mosi.walking) seen.mosiWalked = true;
        else if (seen.mosiWalked && seen.mosiStopped === null) seen.mosiStopped = stage.s.time;
        if (pointer.targets.has('egill') && !seen.egillTarget) seen.egillTarget = { at: stage.s.time, handheld: director.handheldLevel, shot: shotNow };
        const hop = seen.egillClips.find(e => e.clip === 'hop');
        if (hop && stage.s.time - hop.at < 1.2) {
          world.camera.updateMatrixWorld();
          const feet = egill.root.position.clone().project(world.camera);
          const top = egill.headPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.25, 0)).project(world.camera);
          seen.egillOnScreen.push({ at: stage.s.time, shot: shotNow, feet: [feet.x, feet.y], top: [top.x, top.y] });
        }
      }
    }
    if (earlyTap) earlyReaction();
    if (!madeLater && world.chapterState) { // the script has set up: what is made behind the start button
      madeLater = true;
      await chapter.later.make(world);
    }
    onFrame?.({ t, world, stage, director, pointer, sunFace, ui, shot: shotNow });
    for (const [name, jaw] of jaws) {
      const actor = world.actors.get(name);
      if (!actor.talking || !lastLine.has(name)) continue;
      const line = lastLine.get(name);
      seen.jaws[line] = Math.max(seen.jaws[line] ?? 0, THREE.MathUtils.radToDeg(jaw.quaternion.angleTo(SHUT)));
    }
    if (world.location === 'rjodur' && kambedla?.root.visible) seen.kambedlaInClearing = true;
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
    if (scene === 10 && !seen.grip.after && HELD) seen.grip.after = strays();
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
  return { world, task, stage, director, journal, book, save, moments, finds, doc, captions, winks, sunCalls, sunFace, sounds, soundLog, forests, pointer, seen, added, lines, builds };
}

export const EARLY_TAP_AT = { x: 612, y: 455 }; // where on the screen the child who taps early taps
