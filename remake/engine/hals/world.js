import * as THREE from 'three';
import { BOARD } from './rules.js';
import { pickLook } from '../looks.js';
import { createLighting, sunDirection } from '../lighting.js';
import { installDepthShadows } from '../shadows.js';
import { installFog } from '../fog.js';
import { createSky } from '../sky.js';
import { createWind } from '../wind.js';
import { createEffects } from '../effects.js';
import { createPointResolver } from '../points.js';
import { updateCharacterLods, whenReady as characterLodsReady } from '../character-lod.js';
import { PRESETS } from '../quality.js';
import { createForest } from '../../world/forest/forest.js';
import { createBoard } from './board.js';
import { PLACES, shelfFor } from './places.js';
import { createThorsedlas } from './thorsedla.js';
import { createFriends, UGGEDLA_SPOT } from './friends.js';

// The world of "Háls og hali" (spec sections 3, 4 and 6): the board of 100 squares on five tiers, seen from the side, in a
// clearing of the remake's own forest, in the chapter's morning light, with the chapter's real Þórseðlas on its necks and tails
// (thorsedla.js) and Egill on Mosi and his friends as the pieces (pieces.js). A scene of its own, drawn by whatever renderer it
// is given: the game's, while the chapter waits behind the book, or a lab's.
//
//   const world = await createHalsWorld(renderer, { q, params, onProgress })
//   world.scene, world.camera                the scene and its PerspectiveCamera
//   world.board                              the board (board.js): square(n), stairs(n), decorate(events), glow(n), tierY(r)
//   world.thorsedlas                         the six Þórseðlas (thorsedla.js): neckAt(from), tailAt(from), list
//   world.friends                            Uggeðla and Flugeðla watching (friends.js)
//   world.view                               the camera: overview(), follow(target), frame(a, b, margin), shake(s), cut()
//   world.watch(point)                       the Þórseðlas and friends look at a piece (null: they look about)
//   world.calm = true                        calm mode: the camera stays on the whole board, everything moves gently
//   world.world                              the actor world the pieces are made in (pieces.js: createPieces(world.world, board))
//   world.tween(seconds, step), world.wait(seconds)   Promises on the world's clock (they hold while it is not updated)
//   world.addUpdater(fn)                     fn(dt) every frame, before the camera (the pieces)
//   world.update(dt), world.render(), world.resize(width, height), world.ready(), world.dispose()

// Sizes are metres. The board is Codex's at his own measures (2.3 m a square) with the tiers 7.5 m apart and zigzagging in depth
// (rules.js BOARD); the forest is the chapter's at its real size round it, so its old trees stand as tall as the board.

export const VIEW = {
  fov: 30,
  // What the whole board needs in view (m), the camera a little above: from the grass to the top tier and Lyng's back over it,
  // with room below for the dock (`safe`, a share of the view's height) and the tall Þórseðlas allowed up to the top edge; from
  // Lyng's tail beside the left end (`left`) to Burkni beside the right end (`right`).
  overview: { bottom: -0.4, above: 6.5, left: -28.5, right: 32.8, safe: 0.17, lift: 0.25, depth: -4.2 },
  follow: { distance: 18, lift: 0.1, lead: [0, 1.8, 0] }, // close on a piece: its tier and the next one above
  ease: { move: 2.4, calm: 0.9 }, // 1/s: how quickly the camera settles on a new view (calm mode slower)
};
const LOOK = 'morning'; // the chapter's light, so the fog's shader chunk (shared by every scene the renderer draws) stays the same
const BASE = 0.72; // tier 0's block tops over the grass (the blocks sink a little into it)
const TOP = (BOARD.rows - 1) * BOARD.rowHeight + BASE; // the top tier's block tops

export async function createHalsWorld(renderer, { q = PRESETS.tablet, params = new URLSearchParams(), onProgress = () => {}, win = globalThis.window } = {}) {
  const look = pickLook(LOOK);
  const scene = new THREE.Scene();
  scene.name = 'Háls og hali';
  const camera = new THREE.PerspectiveCamera(VIEW.fov, 16 / 10, 0.5, 1500);
  camera.name = 'Háls og hali camera';
  scene.add(camera);
  const lighting = createLighting(scene, look, q);
  lighting.sun.name = 'Háls og hali sun';
  installDepthShadows(renderer, lighting.sun);
  installFog(scene, look, sunDirection(look));
  scene.fog.density *= 0.45; // the board is seen from 60 m: the forest behind stays, the far rings go hazy
  const sky = createSky({ renderer, scene, look, sunDir: lighting.direction });
  const wind = createWind();

  let time = 0;
  const world = {
    THREE, renderer, scene, camera, q, params, look, lighting, wind,
    chapter: { look: LOOK, actors: {}, shots: {} },
    heightAt: () => 0,
    actors: new Map(), // the forest presses its grass under these: none, the pieces stand on blocks
    effects: createEffects(),
    clock: { get time() { return time; } },
  };
  world.resolvePoint = createPointResolver(world);
  onProgress(0.1, 'forest');

  // ---- the forest: a clearing round the board and the camera's place in front of it ------------------------------------------
  // The board stands at the back of a wide clearing, the camera at its front, so the planner keeps every tree out of the view;
  // the forest edge rises behind the board and round both sides. A footpath comes in from the left front to the start.
  const places = PLACES;
  const keepClear = {};
  // no plant on tier 0's blocks (they stand back) nor on the grass before them, where the tails of the second tier hang
  for (let x = -24; x <= 24; x += 4) for (const z of [-BOARD.recess, -2.5]) keepClear[`row${x}/${z}`] = { position: [x, 0, z], heading: 0 };
  for (const p of places) keepClear[p.id] = { position: [p.x, 0, p.z], heading: p.facing > 0 ? 0 : 180 };
  keepClear.uggedla = { position: [UGGEDLA_SPOT.x, 0, UGGEDLA_SPOT.z], heading: UGGEDLA_SPOT.heading }; // where she watches
  const layout = {
    seed: 23,
    clearing: { center: [0, 34], radius: 60 },
    forestEdge: 66,
    path: [[-86, 46], [-60, 30], [-42, 14], [-31, 1], [-26.5, -5]],
    actors: keepClear,
    shots: { overview: { position: [2, 25, 98], target: [2, 17, -4], fov: VIEW.fov } },
    leafShadows: false,
  };
  // A third of the grass of the chapter's clearing: here it is only the strip in front of the bottom tier, seen from far, and it
  // would otherwise cost a quarter of the frame's triangles close up.
  const forest = await createForest(Object.assign(Object.create(world), { q: { ...q, grass: q.grass * 0.35 } }), layout);
  world.forest = forest;
  world.heightAt = (x, z) => forest.heightAt(x, z);
  const ground = forest.heightAt(0, 0);
  onProgress(0.5, 'board');

  // ---- the board -------------------------------------------------------------------------------------------------------
  const fontsReady = win?.document?.fonts?.load?.('900 70px Nunito').catch(() => null);
  await Promise.race([fontsReady, new Promise(resolve => setTimeout(resolve, 1500))]);
  const board = createBoard({ base: ground + BASE, heightAt: world.heightAt, shelves: places.map(shelfFor) });
  scene.add(board.group);

  // ---- the Þórseðlas ----------------------------------------------------------------------------------------------------
  onProgress(0.6, 'thorsedlas');
  const thorsedlas = await createThorsedlas(world, board, places);
  const friends = await createFriends(world, board);

  // ---- the camera ------------------------------------------------------------------------------------------------------
  const view = createView(camera, board);

  // ---- the frame -------------------------------------------------------------------------------------------------------
  const updaters = new Set();
  const tweens = new Set();
  /** step(t) every frame for `duration` seconds of the world's clock (t from 0 to 1); resolves at the end. */
  const tween = (duration, step = () => {}) => new Promise(resolve => tweens.add({ t: 0, duration: Math.max(0.001, duration), step, resolve }));
  const shadowCentre = new THREE.Vector3();
  function update(dt) {
    time += dt;
    wind.update(time);
    for (const tw of [...tweens]) {
      tw.t += dt;
      const t = Math.min(1, tw.t / tw.duration);
      tw.step(t);
      if (t >= 1) { tweens.delete(tw); tw.resolve(); }
    }
    thorsedlas.update(dt);
    for (const fn of updaters) fn(dt);
    friends.update(dt);
    world.effects.update(dt);
    board.update(dt);
    view.update(dt);
    // the sun's shadow: the whole board in an overview, the piece's part of it close up
    const focus = view.focus();
    shadowCentre.copy(focus.centre);
    lighting.focus(shadowCentre, focus.radius);
    forest.update(dt, time);
    updateCharacterLods(camera, renderer.domElement.height);
    thorsedlas.updateLevels(camera, renderer.domElement.height);
    sky.update(time, camera);
  }

  function resize(width, height) {
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    view.resize(camera.aspect);
  }

  return {
    scene, camera, board, view, forest, world, lighting, places, thorsedlas, friends,
    /** Everyone who watches (the Þórseðlas, the friends) looks at this point (a piece's position), or about (null). */
    watch(point) { thorsedlas.lookAt(point); friends.lookAt(point); },
    /** Calm mode: the camera stays on the whole board and everything moves gently. */
    set calm(value) { view.calm = value; thorsedlas.calm = value; friends.calm = value; },
    get calm() { return view.calm; },
    get time() { return time; },
    addUpdater(fn) { updaters.add(fn); return () => updaters.delete(fn); },
    tween,
    wait: seconds => tween(seconds),
    update,
    render() { renderer.render(scene, camera); },
    resize,
    ready: () => Promise.all([characterLodsReady(), thorsedlas.ready(), friends.ready()]),
    dispose() {
      thorsedlas.dispose();
      friends.dispose();
      board.dispose();
      forest.dispose();
      sky.dispose?.();
      scene.clear();
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// The camera: the whole board (overview), close on a piece (follow), or two points framed together (frame: a ride's two ends).
// It eases toward where it should be; in calm mode slowly, and it stays on the whole board. A shake is a small, quickly
// settling nudge (a landing), never in calm mode.

function createView(camera, board) {
  const O = VIEW.overview, F = VIEW.follow;
  const target = new THREE.Vector3(), position = new THREE.Vector3();
  const wantTarget = new THREE.Vector3(), wantPosition = new THREE.Vector3();
  const followed = new THREE.Vector3();
  let mode = 'overview', follow = null, framed = null, aspect = 16 / 10, calm = false, shake = 0, shakeTime = 0, snap = true;
  const tanHalf = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  /** The distance at which a box w by h metres (around the target) fills the view. */
  const distanceFor = (w, h) => Math.max(h / 2 / tanHalf(), w / 2 / (tanHalf() * aspect));

  function wanted() {
    if (mode === 'overview' || calm) {
      const height = (TOP + O.above - O.bottom) / (1 - O.safe);
      wantTarget.set((O.left + O.right) / 2, O.bottom - height * O.safe + height / 2, O.depth);
      const d = distanceFor(O.right - O.left, height);
      wantPosition.set(wantTarget.x, wantTarget.y + d * O.lift, wantTarget.z + d);
      return;
    }
    if (mode === 'frame' && framed) {
      const [a, b, margin] = framed;
      wantTarget.addVectors(a, b).multiplyScalar(0.5);
      const d = Math.max(F.distance, distanceFor(Math.abs(a.x - b.x) + margin * 2, Math.abs(a.y - b.y) + margin * 2));
      wantPosition.set(wantTarget.x, wantTarget.y + d * F.lift, wantTarget.z + d);
      return;
    }
    if (follow) {
      if (typeof follow === 'function') { const v = follow(followed); if (v?.isVector3 && v !== followed) followed.copy(v); }
      else followed.copy(follow.isVector3 ? follow : follow.position);
    }
    const half = (BOARD.columns / 2 - 3) * BOARD.spacing; // the view stops short of running off the board's ends
    wantTarget.set(THREE.MathUtils.clamp(followed.x, -half, half), followed.y + F.lead[1], followed.z - 0.5);
    wantPosition.set(wantTarget.x, wantTarget.y + F.distance * F.lift, wantTarget.z + F.distance);
  }

  return {
    get mode() { return mode; },
    get calm() { return calm; },
    set calm(value) { calm = Boolean(value); },
    overview() { mode = 'overview'; follow = null; framed = null; return this; },
    /** Follow a piece: an Object3D, a Vector3 or a function(out) filling one. */
    follow(what) { mode = 'follow'; follow = what; framed = null; return this; },
    /** Two points (Vector3) framed together with `margin` metres round them. */
    frame(a, b, margin = 3) { mode = 'frame'; framed = [a.clone(), b.clone(), margin]; return this; },
    /** Go there at once (the first frame, or after a jump). */
    cut() { snap = true; return this; },
    shake(strength = 0.1) { if (!calm) shake = Math.min(0.25, Math.max(shake, strength)); },
    resize(value) {
      aspect = value;
      // Upright, the view keeps the width a landscape view has (its horizontal angle) and grows taller, so the whole board
      // still fits without the camera backing out of the clearing into the trees.
      const wide = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(VIEW.fov / 2)) * 1.6);
      camera.fov = aspect >= 1.6 ? VIEW.fov : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(wide / 2) / aspect));
      camera.updateProjectionMatrix();
    },
    /** What the sun's shadow map should cover: the board in an overview, the view's middle close up. */
    focus() {
      if (mode === 'overview' || calm) return { centre: new THREE.Vector3((O.left + O.right) / 2, TOP / 2 + 1.5, O.depth - 1), radius: 35 };
      return { centre: target, radius: Math.min(28, 9 + position.distanceTo(target) * 0.3) };
    },
    update(dt) {
      wanted();
      const k = snap ? 1 : 1 - Math.exp(-dt * (calm ? VIEW.ease.calm : VIEW.ease.move));
      target.lerp(wantTarget, k);
      position.lerp(wantPosition, k);
      snap = false;
      shakeTime += dt;
      shake *= Math.exp(-dt * 9);
      camera.position.copy(position);
      if (shake > 0.001) camera.position.add(new THREE.Vector3(Math.sin(shakeTime * 41) * shake, Math.sin(shakeTime * 53 + 1) * shake, 0));
      camera.lookAt(target);
      camera.updateMatrixWorld();
    },
  };
}
