// Flugeðla og fiðrildið (?chapter=flugedla3d): the third show for red/cyan glasses (the plan:
// docs/superpowers/specs/2026-11-16-flugedla-og-fidrildid-3d-design.md). Step 1: its key frames and two rough motion trials.
//
//   ?chapter=flugedla3d&lykill=<id>     a key frame (flugedla3d/keys.js: 1, 2a, 2b, 3, 4, 5, 6, 7, 7b, 8a, 8b); arrows or the
//                                       buttons step through them
//   ?chapter=flugedla3d&profa=beygja    the bend, the film's seconds 28.5-41.5, looped through black
//   ?chapter=flugedla3d&profa=upp       up through the cloud, over it and down again, the film's seconds 39.5-71, looped
//   &t=<s>                              a trial held at that second of it (from its start)
//   &gler=0, &styrkur=<s>               the engine's: plain, or another strength (the owner's is 0.02)
//
// One job a file, in flugedla3d/: route.js (the camera: the film's rates and their integral), stage.js (the lens, the swept frame
// rule, the wood's mouth, the lane, the clouds' places), clouds.js (drawing them), keys.js (the key frames as data), motion.js (the
// trials' players), cast.js (Flugeðla, the butterfly, leaves, the white), measure.js (the numbers: tools/flugedla-probe.mjs).
import * as THREE from 'three';
import { createStage } from '../engine/stage3d.js';
import { glassesStart } from '../engine/book/show-cards.js';
import { FOV, D, LAYOUT, ROUTE, SLALOM_AT, cloudBalls, LANE_PATH } from './flugedla3d/stage.js';
import { whiteAt, TRIALS, MOUTH, LANE_H } from './flugedla3d/route.js';
import { KEYS, keyIndex, outOf } from './flugedla3d/keys.js';
import { trialAt } from './flugedla3d/motion.js';
import { createCast } from './flugedla3d/cast.js';
import { createClouds } from './flugedla3d/clouds.js';
import { createMeasure } from './flugedla3d/measure.js';
import { reviewUi, pct } from './gramedla3d/review.js';

const CHARS = '../assets/characters/';
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const PROFA = ['beygja', 'upp'].includes(params.get('profa')) ? params.get('profa') : null;
const rad = d => (d * Math.PI) / 180;

export const chapter = {
  id: 'flugedla3d',
  title: 'Flugeðla og fiðrildið',
  look: 'morning',
  gler: { panel: false },
  startButton: glassesStart,
  layout: LAYOUT,
  actors: { flugedla: { url: CHARS + 'pteranodon.glb', position: [6, 0, -400], heading: 90 } },
  cast: {},
  lines: {},
  startShot: 'show',
  shots: { show: { position: [MOUTH.x, LANE_H + 2, MOUTH.z], target: [MOUTH.x, LANE_H + 2, MOUTH.z - 10], fov: FOV } },

  *script(s) {
    const her = s.actor('flugedla').raw;
    const world = her.world;
    const { gler, director } = world;
    world.music?.setLevel?.(0, 0);

    // the lane's ground level: the highest ground under the camera's low path (its heights are over it)
    let base = -Infinity;
    for (const q of LANE_PATH) base = Math.max(base, world.heightAt(q.x, q.z));
    const stage = createStage(world, { position: [MOUTH.x, base + LANE_H, MOUTH.z], look: -90, fov: FOV, groundShare: 0, depth: D, plane: () => D });
    const { stageCam } = stage;
    const at = (u, v, k, out = new THREE.Vector3()) => stage.framePoint(u, v, k, out, stageCam, D);
    const hold = () => { if (gler) { gler.settings.pop = 1; gler.setPlane(D, { jump: true }); } };
    hold();

    // the camera: driven each frame to the route's place (the script runs before the director in a frame: same second)
    const cam = { x: MOUTH.x, y: base + LANE_H, z: MOUTH.z, yaw: 0 };
    yield s.camera.cut('show', { check: false });
    director.drive('flugedla3d', rig => {
      const psi = rad(cam.yaw);
      rig.position.set(cam.x, cam.y, cam.z);
      rig.target.set(cam.x + Math.sin(psi) * 10, cam.y, cam.z - Math.cos(psi) * 10);
      rig.fov = FOV;
    });

    // the forest's own butterflies go under the ground (only ours flies)
    const fb = world.forest?.butterflies;
    if (fb) for (const target of fb.targets) fb.follow(target.name, out => out.set(0, -200, 0), { snap: true });
    const cast = createCast(world, { her, at });
    const clouds = createClouds(world, cloudBalls(), { base });
    yield cast.butterflyReady;

    const state = { t: 0, base, D, key: null, trial: PROFA, her: null, butterfly: null, white: 0, cam };
    const pos = new THREE.Vector3();
    /** Everything where it is: the camera at film second t, the players as `play` says ({ her, butterfly, leaves, white }). */
    function apply(t, play) {
      state.t = t;
      const p = ROUTE.at(t);
      Object.assign(cam, { x: p.x, y: base + p.y, z: p.z, yaw: p.yaw });
      const psi = rad(p.yaw);
      stageCam.position.set(cam.x, cam.y, cam.z);
      stageCam.lookAt(cam.x + Math.sin(psi) * 10, cam.y, cam.z - Math.cos(psi) * 10);
      stageCam.updateMatrixWorld(true);
      clouds.update(cam);
      state.her = play.her ?? null;
      state.butterfly = play.butterfly ?? null;
      state.white = play.white ?? whiteAt(p.y);
      cast.poseHer(state.her, p.yaw);
      cast.poseButterfly(state.butterfly, p.yaw);
      cast.poseLeaves(play.leaves ?? null);
      cast.poseWhite(state.white, D, p.yaw, pos.set(cam.x, cam.y, cam.z), Math.tan(rad(FOV) / 2));
    }

    // a key frame's leaves: torn off its slalom trunk, scattered behind it and drifting down
    const leavesOf = key => {
      if (!key.leaves) return null;
      const out = [];
      let seed = 11;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (const { trunk, count, spread } of key.leaves) {
        const [x, z] = SLALOM_AT[trunk];
        for (let i = 0; i < count; i++) out.push([x - rnd() * spread[0], base + 1.5 + rnd() * spread[1], z + (rnd() - 0.5) * spread[2], 0.16 + rnd() * 0.1, rnd() * 6]);
      }
      return out;
    };
    const keyPlay = key => ({ her: key.her, butterfly: key.butterfly, leaves: leavesOf(key), white: whiteAt(ROUTE.at(key.time).y) });

    const measure = createMeasure(world, { stage, D, cast, state, clouds, base });
    world.flugedla3d = { state, apply, measure, keys: KEYS, cast, clouds, route: ROUTE, trials: TRIALS, outOf, keyPlay };
    yield cast.butterflyReady;

    if (PROFA) {
      // a trial: its stretch of the film looped, through black at the join; t= holds a second of it
      const { from, to } = TRIALS[PROFA];
      const length = to - from;
      const heldAt = params.get('t') !== null && params.get('play') !== '1' ? Math.min(length, Math.max(0, Number(params.get('t')) || 0)) : null;
      const clock = { hold: heldAt, from: s.time };
      let black = -1;
      const seek = t => { clock.hold = t; apply(from + t, trialAt(PROFA, from + t, ROUTE)); };
      Object.assign(world.flugedla3d, { seek, length, from });
      s.after(0, function* run() {
        for (;;) {
          hold();
          const t = clock.hold ?? ((s.time - clock.from) % length);
          apply(from + t, trialAt(PROFA, from + t, ROUTE));
          const b = clock.hold !== null ? 0 : +Math.min(1, Math.max(0, 1 - t / 0.5, (t - (length - 0.5)) / 0.5)).toFixed(3);
          if (state.started && b !== black) { black = b; s.fade(b, 0); }
          yield;
        }
      });
      seek(heldAt ?? 0);
      if (heldAt === null) clock.hold = null;
      yield s.ready();
      clock.from = s.time;
      state.started = true;
      for (;;) yield;
    }

    // the key frames
    const view = { index: keyIndex(params.get('lykill')) };
    const ui = typeof document !== 'undefined' ? reviewUi(document, { step: d => show((view.index + d + KEYS.length) % KEYS.length) }) : null;
    function show(index) {
      view.index = index;
      const key = KEYS[index];
      state.key = key.id;
      apply(key.time, keyPlay(key));
      if (ui) {
        const k = state.butterfly?.at?.[2];
        ui.label.textContent = `Lykilrammi ${key.n}${key.variant ?? ''} · ${key.name}${k ? ` · fiðrildið ${pct(outOf(k) * 100)} út` : ''}`;
      }
      return key.id;
    }
    s.after(0, function* keep() { for (;;) { hold(); apply(KEYS[view.index].time, keyPlay(KEYS[view.index])); yield; } });
    Object.assign(world.flugedla3d, { view, show: async i => show(i) });
    show(view.index);
    yield s.wait(0.1);
    if (ui) document.body.append(ui.element);
    yield s.ready();
    yield s.fade(0, 1);
    for (;;) yield;
  },
};
