// Regression tests for verified bugs & lifecycle fixes across core engine, camera, rendering, save, and scene layers.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createScene } from '../engine/scene/scene.js';
import { createVoice } from '../engine/scene/voice.js';
import { createStageUI } from '../engine/scene/ui.js';
import { createEffects } from '../engine/effects.js';
import { createSave } from '../engine/save.js';
import { createDirector } from '../engine/camera/director.js';
import { createPointResolver } from '../engine/points.js';
import { createLocations } from '../engine/locations.js';
import { installFog, applyFog } from '../engine/fog.js';
import { installDepthShadows } from '../engine/shadows.js';
import { addPlateGlow } from '../engine/plate-glow.js';
import { simplify } from '../engine/simplify.js';
import { createPointer } from '../engine/input/pointer.js';
import { createGler } from '../engine/gler.js';
import { createFlightCamera } from '../engine/camera/flight-camera.js';
import { createFlier } from '../engine/flier.js';
import { createRoute } from '../chapters/kafli4-route.js';
import { pickLook } from '../engine/looks.js';
import { sunDirection } from '../engine/lighting.js';
import { chapterWorld } from './chapter-harness.mjs';
import { installMurk, restoreMurk } from '../chapters/tjorn3d/murk.js';
import { createThorsedlaLod } from '../engine/hals/thorsedla-lod.js';
import { tableUi } from '../engine/table-ui.js';
import { createMemoryGame } from '../engine/memory/rules.js';
import fs from 'node:fs';

class FakeAudio extends EventTarget {
  constructor(src) {
    super();
    this.src = src;
    this.paused = true;
    this.ended = false;
    this.currentTime = 0;
    this.playCalls = 0;
    FakeAudio.made.push(this);
  }
  play() {
    this.playCalls++;
    if (FakeAudio.failPlay) {
      return Promise.reject(Object.assign(new Error('NotAllowedError'), { name: 'NotAllowedError' }));
    }
    this.paused = false;
    return Promise.resolve();
  }
  pause() { this.paused = true; }
  heard() { this.dispatchEvent(new Event('playing')); }
  over() { this.ended = true; this.dispatchEvent(new Event('ended')); }
}
FakeAudio.made = [];
FakeAudio.failPlay = false;

function withFakeAudio(run) {
  const original = globalThis.Audio;
  globalThis.Audio = FakeAudio;
  FakeAudio.made = [];
  FakeAudio.failPlay = false;
  const restore = () => { globalThis.Audio = original; FakeAudio.failPlay = false; };
  let out;
  try { out = run(); } catch (err) { restore(); throw err; }
  if (out && typeof out.then === 'function') return out.finally(restore);
  restore();
  return out;
}

test('scene sayTask falls back to reading-pace duration when audio play() rejects (blocked autoplay)', async () => withFakeAudio(async () => {
  FakeAudio.failPlay = true;
  const shown = [];
  const cleared = [];
  const voice = createVoice();
  const world = {
    chapter: { lines: { hello: { text: 'Halló vinir mínir!', audio: 'hello' } } },
    actors: new Map([['mosi', { talk: () => () => {}, stopTalking() {}, listenAt() {} }]]),
    effects: createEffects(),
  };
  const ui = {
    caption: (s, t) => shown.push([s, t]),
    clearCaption: t => cleared.push(t),
    setFade() {},
    clearChoices() {},
    tray: { hide() {} },
  };
  const director = { stop() {}, cut() {}, blend() {} };
  const stage = createScene({
    world,
    director,
    ui,
    voice,
    lines: { hello: { src: 'hello.mp3', duration: 2.5 } },
    cast: { mosi: 'Mosi' },
  });
  let finishedAt = null;
  stage.start(function* (s) {
    yield s.say('mosi', 'hello');
    finishedAt = stage.elapsed;
  });
  stage.begin();
  // First step starts sayTask (calls voice.play, which rejects on microtask), flush microtasks, then step time.
  stage.update(0.05);
  await Promise.resolve();
  await Promise.resolve();
  for (let i = 0; i < 60 && finishedAt === null; i++) stage.update(0.1);
  assert.ok(finishedAt !== null, 'sayTask completes');
  assert.ok(finishedAt >= 2.9 && finishedAt <= 3.3, `expected reading-pace fallback ~3.0 s (2.5 s + 0.5 s tail), got ${finishedAt}`);
  assert.equal(shown.length, 1);
  assert.equal(cleared.length, 1);
}));

test('voice setPaused(false) after pausing mid-line resumes the live element without stale closure, and dispose revokes Blob URLs', async () => withFakeAudio(async () => {
  const revoked = [];
  const voice = createVoice({
    fetchFn: async src => ({ ok: true, blob: async () => `bytes:${src}` }),
    makeUrl: blob => `blob:${blob}`,
    revokeUrl: url => revoked.push(url),
  });
  await voice.preload(['a.mp3', 'b.mp3']);

  voice.setPaused(true);
  const soundA = voice.play('a.mp3');
  assert.equal(soundA.playCalls, 0, 'does not call play() while paused');

  voice.setPaused(false);
  assert.equal(soundA.playCalls, 1, 'starts playing on unpause');
  soundA.heard();

  // Replace with soundB, pause, then unpause: must resume soundB and NOT revive soundA.
  const soundB = voice.play('b.mp3');
  assert.equal(soundA.src, '', 'replaced element src cleared');
  soundB.heard();
  voice.setPaused(true);
  assert.equal(soundB.paused, true);
  voice.setPaused(false);
  assert.equal(soundB.paused, false);
  assert.equal(soundA.paused, true);

  voice.dispose();
  assert.equal(revoked.length, 2, 'revoked both preloaded Blob URLs');
  assert.equal(voice.preloaded, 0);
}));

test('ui.clearCaption() with no argument clears an active caption', () => {
  const prevStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ opacity: '0' });
  try {
    const els = {
      caption: {
        hidden: true,
        querySelector(sel) { return sel === '.caption-speaker' ? this.speaker : this.text; },
        speaker: { textContent: '', style: {} },
        text: { textContent: '', style: {} },
      },
      choices: { hidden: true, replaceChildren() {} },
      fade: { style: { opacity: '0' } },
      tray: { hidden: true, replaceChildren() {} },
      view: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) },
    };
    const doc = {
      getElementById: id => els[id] ?? null,
      addEventListener() {},
      removeEventListener() {},
    };
    const ui = createStageUI(doc);
    ui.caption('Mosi', 'Góðan daginn!');
    assert.equal(els.caption.hidden, false);
    ui.clearCaption();
    assert.equal(els.caption.hidden, true, 'caption cleared when called with no argument');
  } finally {
    globalThis.getComputedStyle = prevStyle;
  }
});

test('director handles duration <= 0 and fovSeconds <= 0 without NaN', () => {
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 1000);
  const world = { actors: new Map(), heightAt: () => 0 };
  world.resolvePoint = createPointResolver(world);
  const director = createDirector({
    camera,
    world,
    lint: false,
    shots: {
      a: { position: [0, 2, 10], target: [0, 1, 0], fov: 40 },
      b: { position: [5, 3, 8], target: [1, 1, 0], fov: 55 },
    },
  });
  director.cut('a');
  const h = director.move('b', { duration: 0 });
  director.update(0.016);
  assert.equal(h.done, true);
  assert.ok(Number.isFinite(camera.position.x) && Number.isFinite(camera.fov));
  assert.equal(camera.fov, 55);
});

test('flightCamera.stop() stops the director and prevents runaway FOV growth', async () => {
  const world = await chapterWorld({
    look: 'lateMorning',
    actors: { flugedla: { url: '../assets/characters/pteranodon.glb' }, egill: { url: '../assets/characters/egill.glb' } },
  });
  const flugedla = world.actors.get('flugedla');
  const egill = world.actors.get('egill');
  const route = createRoute();
  const director = createDirector({ camera: world.camera, world, lint: false });
  const flier = createFlier(flugedla, route, { world });
  const fc = createFlightCamera(director, flier, { world, egill });
  flier.update(10);
  fc.shot('chase');
  director.update(1 / 30);
  fc.stop();
  const fovAtStop = world.camera.fov;
  for (let i = 0; i < 60; i++) director.update(1 / 30);
  assert.ok(Number.isFinite(world.camera.fov) && world.camera.fov === fovAtStop, `FOV stayed stable at ${fovAtStop}, got ${world.camera.fov}`);
  flier.stop();
});

test('save merges concurrent writes across two instances sharing storage instead of clobbering', () => {
  const map = new Map();
  const storage = {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
  };
  const mainSave = createSave(storage);
  const iframeSave = createSave(storage);
  mainSave.addStar('k1_kambedla');
  iframeSave.addSticker('junior');
  mainSave.addFinding('blaa_bloma');
  const reader = createSave(storage);
  const merged = reader.get();
  assert.ok(merged.stars.includes('k1_kambedla'), 'preserved main star');
  assert.equal(reader.getStickers().junior, 1, 'preserved iframe sticker');
  assert.ok(merged.findings.includes('blaa_bloma'), 'preserved subsequent main finding');
});

test('fog applyFog restores each scene fog chunk without permanent global clobbering', () => {
  const s1 = new THREE.Scene();
  const s2 = new THREE.Scene();
  const look1 = pickLook('morning');
  const look2 = pickLook('evening');
  installFog(s1, look1, sunDirection(look1));
  const chunk1 = THREE.ShaderChunk.fog_pars_fragment;
  installFog(s2, look2, sunDirection(look2));
  const chunk2 = THREE.ShaderChunk.fog_pars_fragment;
  assert.notEqual(chunk1, chunk2, 'different looks produce distinct fog chunks');
  applyFog(s1);
  assert.equal(THREE.ShaderChunk.fog_pars_fragment, chunk1, 'applyFog restores scene 1 fog chunk');
  s2.onBeforeRender(null, s2, null, null);
  assert.equal(THREE.ShaderChunk.fog_pars_fragment, chunk2, 'onBeforeRender restores scene 2 fog chunk');
});

test('shadows dispose restores unused colour texture so it is deallocated, and context restore rebuilds with colour attachment', () => {
  const listeners = new Map();
  const attachedDuringSet = [];
  let currentTarget = null;
  const renderer = {
    domElement: { addEventListener: (type, fn) => listeners.set(type, fn) },
    getRenderTarget: () => currentTarget,
    setRenderTarget(t) {
      if (t) attachedDuringSet.push(t.textures[0]);
      currentTarget = t;
    },
    clear() {},
  };
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  sun.shadow.mapSize.set(512, 512);
  const { target, depth } = installDepthShadows(renderer, sun);
  assert.ok(target, 'depth shadow target created');
  assert.equal(target.textures[0], depth, 'active texture exposed to shaders is depthTexture');
  assert.notEqual(attachedDuringSet[0], depth, 'initial FBO setup bound colour texture, not depthTexture');

  listeners.get('webglcontextrestored')?.();
  assert.notEqual(attachedDuringSet.at(-1), depth, 'context restore bound colour texture, not depthTexture');
  assert.equal(target.textures[0], depth, 'depthTexture restored after rebuild');

  let disposedTex = null;
  target.addEventListener('dispose', () => { disposedTex = target.textures[0]; });
  target.dispose();
  assert.notEqual(disposedTex, depth, 'dispose restored colour texture before Three deallocation');
});

test('locations.release() while prepare() is in flight disposes the late build and resolves prepare() to null', async () => {
  let resolveBuild;
  let disposed = 0;
  const world = {};
  const locations = createLocations({
    world,
    locations: {
      a: { layout: {} },
      b: { layout: {} },
    },
    build: () => new Promise(res => {
      resolveBuild = res;
    }),
  });
  const prep = locations.prepare('b');
  locations.release('b');
  const group = new THREE.Group();
  const parent = new THREE.Group();
  parent.add(group);
  resolveBuild({ group, heightAt: () => 0, dispose: () => { disposed++; } });
  const result = await prep;
  assert.equal(result, null, 'stale prepare resolves to null');
  assert.equal(disposed, 1, 'orphaned forest was disposed');
  assert.equal(group.parent, null, 'orphaned forest removed from scene');
});

test('plateGlow.dispose() restores materials and makes future update(dt) calls return false', () => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geo.setAttribute('_platerow', new THREE.Float32BufferAttribute([1, 1, 1], 1));
  const mat = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  const root = new THREE.Group();
  root.add(mesh);
  const glow = addPlateGlow({ name: 'test', root, model: root });
  assert.equal(glow.rows, 1);
  glow.setRow(0, 1, { duration: 1 });
  assert.notEqual(glow.update(0.5), false);
  glow.dispose();
  assert.equal(mesh.material, mat, 'original material restored');
  assert.equal(glow.update(1.0), false, 'update after dispose returns false');
});

test('simplify welds -0.0 and +0.0 coordinates identically', () => {
  const positions = new Float32Array([
    -0.0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    +0.0, 0, 0,
    0, 1, 0,
    -1, 0, 0,
  ]);
  const indices = new Uint32Array([0, 1, 2, 3, 4, 5]);
  const res = simplify(positions, indices, { levels: [{ ratio: 0.5, maxError: 1 }] });
  assert.ok(Array.isArray(res) && res.length === 1);
  assert.ok(res[0].triangles <= 2);
});

test('pointer handles zero-sized canvas rects cleanly and disposes all listeners', () => {
  const canvas = new EventTarget();
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 });
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 100);
  const world = { actors: new Map(), heightAt: () => 0 };
  world.resolvePoint = createPointResolver(world);
  const ptr = createPointer({ canvas, camera, world });
  const taps = [];
  ptr.on('tap', e => taps.push(e));
  ptr.addTarget('box', { point: [0, 0, -5], radius: 1 });
  const down = Object.assign(new Event('pointerdown'), { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
  const up = Object.assign(new Event('pointerup'), { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
  canvas.dispatchEvent(down);
  canvas.dispatchEvent(up);
  assert.equal(taps.length, 1);
  assert.equal(taps[0].name, null, 'zero-size rect returns null instead of NaN raycast');
  ptr.dispose();
  canvas.dispatchEvent(down);
  canvas.dispatchEvent(up);
  assert.equal(taps.length, 1, 'no taps delivered after dispose()');
});

test('gler clamps invalid parameters and zero viewports, and disposes cleanly', () => {
  const renderer = {
    domElement: { width: 0, height: 0, clientWidth: 0, clientHeight: 0 },
    getDrawingBufferSize: out => out.set(0, 0),
    getRenderTarget: () => null,
    setRenderTarget() {},
    render() {},
    shadowMap: { autoUpdate: true },
    autoClear: true,
  };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1.6, 0.1, 100);
  const director = { time: 0, rig: { target: new THREE.Vector3() } };
  const params = new URLSearchParams('gler=1&styrkur=NaN&adferd=invalid&gleraugu=bogus');
  const gler = createGler({ renderer, display: {}, scene, camera, director, q: { name: 'high' }, params, doc: null, panel: false });
  assert.ok(Number.isFinite(gler.settings.strength));
  gler.enable(true);
  assert.doesNotThrow(() => gler.draw());
  assert.doesNotThrow(() => gler.dispose());
});

test('save keeps in-memory updates intact when storage.setItem is read-only or no-op', () => {
  const initial = JSON.stringify({ stars: ['k1_kambedla'], findings: [], seen: [], places: [] });
  const readonlyStorage = { getItem: () => initial, setItem() {} };
  const save = createSave(readonlyStorage);
  save.addStar('k2_uggedla');
  assert.deepEqual(save.get().stars, ['k1_kambedla', 'k2_uggedla'], 'subsequent get() preserves in-memory write');
});

test('tjorn3d murk installMurk / restoreMurk restores original THREE fog shader chunks', () => {
  const beforePars = THREE.ShaderChunk.fog_pars_fragment;
  const beforeFrag = THREE.ShaderChunk.fog_fragment;
  const scene = new THREE.Scene();
  installMurk(scene, { level: 0, tone: '#224433', deep: 0.4, dim: 0.3, bed: 2, density: 0.5 });
  assert.notEqual(THREE.ShaderChunk.fog_fragment, beforeFrag, 'murk patches fog_fragment');
  restoreMurk();
  assert.equal(THREE.ShaderChunk.fog_pars_fragment, beforePars, 'restoreMurk restores fog_pars_fragment');
  assert.equal(THREE.ShaderChunk.fog_fragment, beforeFrag, 'restoreMurk restores fog_fragment');
});

test('map-page breaks circular import by reading shared data from journal-data.js', () => {
  const src = fs.readFileSync(new URL('../engine/book/map-page.js', import.meta.url), 'utf8');
  assert.match(src, /from '\.\.\/scene\/journal-data\.js'/, 'map-page imports from journal-data.js');
  assert.doesNotMatch(src, /from '\.\.\/scene\/journal\.js'/, 'map-page no longer imports journal.js');
});

test('hals createThorsedlaLod unhooks sun.shadow.updateMatrices cleanly on dispose without stacking', () => {
  const sun = new THREE.DirectionalLight();
  sun.castShadow = true;
  const orig = sun.shadow.updateMatrices;
  const a = createThorsedlaLod(sun);
  const b = createThorsedlaLod(sun);
  assert.notEqual(sun.shadow.updateMatrices, orig, 'shadow hook installed');
  a.dispose();
  assert.notEqual(sun.shadow.updateMatrices, orig, 'hook remains while second instance active');
  b.dispose();
  assert.equal(sun.shadow.updateMatrices, orig, 'original updateMatrices restored when last instance disposes');
});

test('tableUi.dispose() removes document keydown and fullscreenchange listeners', () => {
  const added = [];
  const removed = [];
  const makeEl = () => ({
    className: '',
    innerHTML: '',
    hidden: false,
    textContent: '',
    addEventListener() {},
    setAttribute() {},
    remove() {},
    querySelector: () => makeEl(),
    querySelectorAll: () => [],
  });
  const doc = {
    createElement: () => makeEl(),
    body: { append() {} },
    documentElement: {},
    addEventListener: (t, fn) => added.push([t, fn]),
    removeEventListener: (t, fn) => removed.push([t, fn]),
  };
  const ui = tableUi(doc, { step() {}, screen() {} });
  assert.ok(added.length >= 2);
  ui.dispose();
  assert.equal(removed.length, added.length, 'every added document listener was removed on dispose');
});

test('memory rules caches frozen getState() snapshot across unchanged reads', () => {
  const rules = createMemoryGame({ random: () => 0.5 });
  const s1 = rules.getState();
  const s2 = rules.getState();
  assert.equal(s1, s2, 'unchanged state returns cached snapshot reference');
  assert.equal(Object.isFrozen(s1), true, 'snapshot is frozen');
});
