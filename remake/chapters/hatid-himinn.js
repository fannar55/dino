// Look-check page for the festival's night sky (?chapter=hatid-himinn): the top at night (hatid-looks.js HATID_LOOKS.dark) with the
// night sky (engine/night-sky.js) at many 1, and the constellations (engine/constellations.js) each over her friend. Never part of the
// game: not in the book, not in the save, not linked from anything; only this address opens it. Stills: remake/tools/capture.mjs with
// t to freeze it (.tools/hatid-merki/stills.mjs).
//
//   ?chapter=hatid-himinn&show=merki&friend=sloedla&t=2
//
//   show     merki (default): the constellations; tungl: the moon's (Task 11 adds the moon here)
//   friend   <key>: one of the six large beside her, she standing on the top seen from her right side; all (default): all six where
//            the festival has them (hatid-route.js SKY.stars, each over her friend's star), everyone as scene 2 has them, from
//            stars_wide (its upright frame on an upright screen)
//   tips     1 (default) her measured tips (constellations.js TIPS), 0 her skeleton alone
//   pose     idle (default) | walk | happy: the clip she plays (walk on the spot)
//   drawn    0 to 1 (default 1): how much of her constellation is drawn
//   face     the moon's face (Task 11's)
//   measure  1: measure the tips on each model's skin and print them (console and window.__tips): measureTips below
import * as THREE from 'three';
import { createTop } from '../world/fjall/index.js';
import { FRIENDS8, MODELS, LENGTH, SHOTS, SKY, STAR_TAP, standsOf, tallShot } from './hatid-route.js';
import { HATID_LOOKS } from './hatid-looks.js';
import { FRIENDS } from '../engine/scene/journal-data.js';
import { lightTo } from '../engine/light-blend.js';
import { createNightSky } from '../engine/night-sky.js';
import { createConstellations, TIPS, STAR_BONE } from '../engine/constellations.js';
import { skinPoints } from './kafli6-seat.js';

const params = new URLSearchParams(globalThis.location?.search ?? '');
const SHOW = params.get('show') || 'merki';
const FRIEND = params.get('friend') || 'all';
const WITH_TIPS = params.get('tips') !== '0';
const POSE = params.get('pose') || 'idle';
const DRAWN = params.has('drawn') ? Number(params.get('drawn')) : 1;
const MEASURE = params.get('measure') === '1';
const SIX = FRIENDS.map(f => f.key);
const HUE = Object.fromEntries(FRIENDS.map(f => [f.key, f.colour]));

/**
 * How each tip is found on her skin (the chunk's ruling 3: measured, never placed by eye), the skin's vertices that `bone` carries
 * most, in her root's frame as she stands in her idle's first frame: `high` the highest of them (a sail's or a plate's top edge);
 * `behind` the one furthest from the bone among those behind it (a crest's end).
 */
export const TIP_WAYS = {
  sloedla: [{ name: 'crest', bone: 'Head', way: 'behind' }],
  uggedla: [{ name: 'sail1', bone: 'Tail1', way: 'high' }, { name: 'sail2', bone: 'Hips', way: 'high' }, { name: 'sail3', bone: 'Chest', way: 'high' }],
  kambedla: [
    { name: 'plate1', bone: 'Tail1', way: 'high' }, { name: 'plate2', bone: 'Hips', way: 'high' },
    { name: 'plate3', bone: 'Spine', way: 'high' }, { name: 'plate4', bone: 'Chest', way: 'high' },
  ],
  flugedla: [{ name: 'crest', bone: 'Head', way: 'behind' }],
};

/** The tips of `actor` (her key `who`) measured on her skin as she stands now: [{ name, bone, at: [x, y, z] in the bone's frame }]. */
export function measureTips(actor, who) {
  const ways = TIP_WAYS[who] ?? [];
  if (!ways.length) return [];
  const points = skinPoints(actor, Object.fromEntries(ways.map(w => [w.name, [w.bone]]))).update();
  actor.root.updateMatrixWorld(true);
  const toRoot = actor.root.matrixWorld.clone().invert();
  const v = new THREE.Vector3();
  return ways.map(({ name, bone: boneName, way }) => {
    const bone = actor.model.getObjectByName(boneName);
    const at = bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(toRoot);
    const list = points[name];
    let best = null;
    let score = -Infinity;
    for (let k = 0; k < list.length; k += 3) {
      v.set(list[k], list[k + 1], list[k + 2]).applyMatrix4(toRoot);
      const s = way === 'high' ? v.y : v.x < at.x ? v.distanceTo(at) : -Infinity;
      if (s > score) { score = s; best = [list[k], list[k + 1], list[k + 2]]; }
    }
    const local = bone.worldToLocal(new THREE.Vector3(...best));
    return { name, bone: boneName, at: local.toArray().map(x => Math.round(x * 1e4) / 1e4) };
  });
}

/**
 * One friend large: she at the top's middle facing +X, the lens on her right, she on the frame's left and her constellation on its
 * right, about 30 degrees of sky (less where she is taller than long), her bind pose's middle at `CLOSE.sky`.
 */
const CLOSE = { at: [0, 4], back: 2.3, up: 0.35, lookRight: 21, pitch: 13, fov: 50, span: 30, tall: 20, sky: { right: 34, up: 24 } };
function closeShot(world, who) {
  const actor = world.actors.get(who);
  const [x, z] = CLOSE.at;
  const length = LENGTH[who];
  const d = length * CLOSE.back;
  const y = world.forest.heightAt?.(x, z) ?? 1.2;
  const height = actor.size.y;
  const position = [x, y + height * CLOSE.up + 1.2, z + d];
  // from her right she lies toward -Z (azimuth -90); the lens looks `lookRight` degrees to the right of her
  const azimuth = -90 + CLOSE.lookRight;
  const a = azimuth * Math.PI / 180, p = CLOSE.pitch * Math.PI / 180;
  const target = [position[0] + Math.cos(a) * Math.cos(p) * 40, position[1] + Math.sin(p) * 40, position[2] + Math.sin(a) * Math.cos(p) * 40];
  return { shot: { position, target, fov: CLOSE.fov, label: `close_${who}` }, sky: { azimuth: -90 + CLOSE.sky.right, elevation: CLOSE.sky.up } };
}

/** Hers large at `centre`: added at a first span, measured, then again so she is CLOSE.span wide or CLOSE.tall high, centred there. */
function addLarge(sky, who, actor, centre, tips) {
  const first = { colour: HUE[who], ...centre, span: CLOSE.span, tips };
  sky.add(who, actor, first);
  sky.set(who, { drawn: 1 });
  const box = boxOf(sky.pointsOf(who), centre);
  const k = Math.min(CLOSE.span / box.wide, CLOSE.tall / box.high);
  const span = CLOSE.span * k;
  // the head's place that puts her box's middle at `centre`
  const head = sky.starOf(who);
  const placed = {
    azimuth: centre.azimuth + (head.azimuth - box.midAz) * k,
    elevation: centre.elevation + (head.elevation - box.midEl) * k,
  };
  sky.add(who, actor, { ...first, ...placed, span });
  return { span, ...placed };
}
function boxOf(points, centre) {
  const az = points.map(p => wrap(p.azimuth - centre.azimuth) + centre.azimuth);
  const el = points.map(p => p.elevation);
  const lo = [Math.min(...az), Math.min(...el)], hi = [Math.max(...az), Math.max(...el)];
  const mid = (lo[1] + hi[1]) / 2;
  return { wide: (hi[0] - lo[0]) * Math.cos(mid * Math.PI / 180), high: hi[1] - lo[1], midAz: (lo[0] + hi[0]) / 2, midEl: mid };
}
const wrap = a => ((a + 540) % 360) - 180;

export const chapter = {
  id: 'hatid-himinn',
  title: 'Næturhiminn hátíðarinnar',
  look: 'sunset',
  start: 'toppur',
  locations: { toppur: { build: world => createTop(world), shots: SHOTS.toppur } },
  actors: Object.fromEntries(FRIENDS8.map(who => [who, { url: `../assets/characters/${MODELS[who]}.glb`, position: [0, 0, 0], heading: 0 }])),
  startShot: 'stars_wide',
  shots: {},

  *script(s) {
    const world = s.actor('mosi').raw.world;
    const top = world.forest;
    lightTo(world, HATID_LOOKS.dark);
    for (const name of ['SunFace', 'SunHandsAndMouth', 'SunNightcap']) {
      const o = world.scene.getObjectByName(name);
      if (o) o.visible = false;
    }
    const actors = Object.fromEntries(FRIENDS8.map(who => [who, s.actor(who).raw]));
    const stands = standsOf(top).dark;
    const one = FRIEND !== 'all' && SIX.includes(FRIEND);
    for (const who of FRIENDS8) {
      const stand = stands[who];
      // Egill sits on Grameðla's head in the dark (no seat on this page: he is left out), and with one large only she is there
      if (stand.on || (one && who !== FRIEND)) actors[who].root.visible = false;
      else actors[who].place(...stand.at, stand.heading);
    }
    if (one) actors[FRIEND].place(...CLOSE.at, 0);
    for (const who of SIX) {
      const clip = POSE === 'walk' ? 'walk' : POSE === 'happy' && actors[who].clips.has('happy') ? 'happy' : 'idle';
      actors[who].play(clip, { fade: 0 });
    }
    yield s.wait(0.1);
    if (MEASURE) {
      // as each stands in her idle's first frame (the tips are rigid to their bones, so the pose only picks which vertex is furthest)
      const tips = {};
      for (const who of Object.keys(TIP_WAYS)) {
        const a = actors[who];
        const action = a.play('idle', { fade: 0, timeScale: 0 });
        action.time = 0;
        a.mixer.update(0);
        a.root.updateMatrixWorld(true);
        tips[who] = measureTips(a, who);
      }
      globalThis.__tips = tips;
      console.warn(`TIPS ${JSON.stringify(tips)}`);
      for (const who of SIX) actors[who].play(POSE === 'walk' ? 'walk' : 'idle', { fade: 0 });
    }

    // the sky: many 1, cleared round the six stars and the moon as Task 9's look-check has it
    const clear = [...Object.values(SKY.stars).map(p => ({ ...p, degrees: STAR_TAP + 1 })), { ...SKY.moon, degrees: 6 }];
    const night = createNightSky(world, { clear, first: SKY.first });
    night.set({ dark: 1, first: 1, many: 1, time: 4 });
    const sky = createConstellations(world, { capacity: 6 });
    const tipsOf = who => (WITH_TIPS ? TIPS[who] ?? [] : []);
    let shot;
    const placed = {};
    if (SHOW === 'merki') {
      if (one) {
        const close = closeShot(world, FRIEND);
        shot = close.shot;
        placed[FRIEND] = addLarge(sky, FRIEND, actors[FRIEND], close.sky, tipsOf(FRIEND));
      } else {
        const upright = (globalThis.innerWidth ?? 16) < (globalThis.innerHeight ?? 10);
        shot = { ...((upright && tallShot('stars_wide')) || SHOTS.toppur.stars_wide), label: 'stars_wide' };
        for (const who of SIX) {
          sky.add(who, actors[who], { colour: HUE[who], ...SKY.stars[who], tips: tipsOf(who) });
          placed[who] = { ...SKY.stars[who], span: 16 };
        }
      }
      for (const who of Object.keys(placed)) sky.set(who, { drawn: DRAWN });
    } else {
      shot = { ...SHOTS.toppur.moon_peek, label: 'moon_peek' }; // Task 11 puts the moon here
    }
    // hung from the camera after everything else has moved this frame, just before it is drawn
    const before = world.scene.onBeforeRender;
    world.scene.onBeforeRender = function hang(renderer, scene, camera, target) {
      night.update(camera);
      sky.update(camera);
      before?.call(this, renderer, scene, camera, target);
    };
    world.chapterState = { night, sky, placed, actors, show: SHOW, friend: FRIEND, starBone: STAR_BONE };
    yield s.camera.cut(shot, { check: false });
    yield s.ready();
    yield s.fade(0, 0.3);
    yield s.wait(1e6);
  },
};
