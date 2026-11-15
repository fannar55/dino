// Samflug (?chapter=samflug3d): a 15 second motion trial for the red/cyan glasses (engine/gler.js), not in the book. The camera
// flies backwards ahead of Flugeðla down a straight forest lane; she faces us with Egill in her saddle and hangs in the middle of the
// frame in front of the screen while the forest streams away behind her. It loops.
//
//   ?chapter=samflug3d             the trial: the glasses start, then the 15 seconds again and again
//   &hradi=<m/s>                   the camera's speed (default 4, at most 8; 0 holds the forest still with the same show)
//   &t=<s>                         a capture holds that second (the engine's capture mode); &play=1 plays from it
//   &gler=0, &styrkur=<s>          the engine's: plain, or another strength (the owner's is 0.02)
//
// One job a file, in samflug3d/: stage.js (the camera, D, the lane rule and the forest), timeline.js (the 15 seconds as functions of
// the second), rider.js (Flugeðla with Egill), air.js (leaves and motes), measure.js (the numbers: tools/samflug-probe.mjs).
// Everything is laid out in the camera's own frame (u, v, k): the stage's camera is re-posed at the camera's place each frame.
import * as THREE from 'three';
import { createStage } from '../engine/stage3d.js';
import { glassesStart } from '../engine/book/show-cards.js';
import { createSwarm } from '../world/forest/swarm.js';
import { FOV, D, CAM_H, LENGTH, SPEED, START_Z, LAYOUT } from './samflug3d/stage.js';
import { herAt, egillAt, wingAt, butterflyAt, BUTTERFLY_COUNT, cameraZ as zAt, blackAt, BEATS } from './samflug3d/timeline.js';
import { createRider } from './samflug3d/rider.js';
import { createAir } from './samflug3d/air.js';
import { createMeasure } from './samflug3d/measure.js';

const CHARS = '../assets/characters/';
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const speedRaw = Number(params.get('hradi'));
export const SPEED_NOW = params.has('hradi') && Number.isFinite(speedRaw) ? Math.min(SPEED.max, Math.max(0, speedRaw)) : SPEED.default;

export const chapter = {
  id: 'samflug3d',
  title: 'Samflug',
  look: 'morning',
  gler: { panel: false },
  startButton: glassesStart,
  layout: LAYOUT,
  actors: {
    flugedla: { url: CHARS + 'pteranodon.glb', position: [6, 0, -400], heading: 90 },
    egill: { url: CHARS + 'egill.glb', position: [-6, 0, -400], heading: 90 },
  },
  cast: {},
  lines: {},
  startShot: 'show',
  shots: { show: { position: [0, CAM_H + 1, START_Z], target: [0, CAM_H + 1, START_Z - 10], fov: FOV } },

  *script(s) {
    const her = s.actor('flugedla').raw;
    const boy = s.actor('egill').raw;
    const world = her.world;
    const { camera, gler, director } = world;
    world.music?.setLevel?.(0, 0);

    // the camera's height: CAM_H over the highest ground under the lane where the bottom edge can see it, flown level
    let ground = -Infinity;
    for (let z = START_Z - 40; z <= START_Z + LENGTH * SPEED.max + 5; z += 2) ground = Math.max(ground, world.heightAt(0, z), world.heightAt(-6, z), world.heightAt(6, z));
    const camY = ground + CAM_H;
    const speed = SPEED_NOW;
    const cameraZ = t => zAt(t, speed);
    const stage = createStage(world, { position: [0, camY, START_Z], look: -90, fov: FOV, groundShare: 0, depth: D, plane: () => D });
    const { stageCam } = stage;
    const at = (u, v, k, out = new THREE.Vector3()) => stage.framePoint(u, v, k, out, stageCam, D);

    // the glasses: the screen plane at D, pop 1 (the strength is the owner's, or the address's styrkur=)
    const hold = () => { if (gler) { gler.settings.pop = 1; gler.setPlane(D, { jump: true }); } };
    hold();

    // the camera: driven each frame to the show's place (the script runs before the director in a frame: same second)
    const cam = { z: START_Z };
    yield s.camera.cut('show', { check: false });
    director.drive('samflug', rig => {
      rig.position.set(0, camY, cam.z);
      rig.target.set(0, camY, cam.z - 10);
      rig.fov = FOV;
    });

    const rider = createRider(world, { her, boy });
    const swarm = createSwarm({ count: BUTTERFLY_COUNT, scale: 1.25, seed: 'samflug', uWindTime: world.wind?.uniforms?.uWindTime, antialias: true });
    world.scene.add(swarm.mesh);
    // the forest's own butterflies go under the ground for the trial (only ours fly)
    const fb = world.forest?.butterflies;
    if (fb) for (const target of fb.targets) fb.follow(target.name, out => out.set(0, -200, 0), { snap: true });
    const air = createAir(world, { D, camY, cameraZ });
    yield rider.ready;
    const flyLength = her.clips.get('fly')?.duration ?? 1;

    const state = { t: 0, speed, camY, D, beats: BEATS, her: null, butterflies: [] };
    const bfly = Array.from({ length: BUTTERFLY_COUNT }, () => new THREE.Vector3());
    const body = new THREE.Vector3();
    function apply(t) {
      state.t = t;
      cam.z = cameraZ(t);
      // the stage's camera where the screen's is this frame (level, along -Z): everything below is in its frame
      stageCam.position.set(0, camY, cam.z);
      stageCam.lookAt(0, camY, cam.z - 10);
      stageCam.updateMatrixWorld(true);
      const h = herAt(t);
      state.her = h;
      rider.pose({ body: at(h.u, h.v, h.k, body), yaw: h.yaw, pitch: h.pitch, bank: h.bank, neck: h.neck, clip: 'fly', at: wingAt(t, flyLength), haze: h.haze, seen: 1, egill: egillAt(t) });
      state.butterflies.length = 0;
      for (let i = 0; i < BUTTERFLY_COUNT; i++) {
        const [u, v, k, size] = butterflyAt(i, t);
        at(u, v, k, bfly[i]);
        // facing the way it flies (roughly across and toward us), wings beating
        swarm.set(i, bfly[i], Math.PI / 2 + Math.sin(t * 1.3 + i) * 0.8, size, -1);
        state.butterflies.push({ u, v, k, size, p: bfly[i].toArray() });
      }
      air.update(t);
      if (state.started) { const b = +blackAt(t).toFixed(3); if (b !== state.black) { state.black = b; s.fade(b, 0); } }
    }
    const measure = createMeasure(world, { stage, D, rider, state, air, apply, at });

    // the clock: a capture holds its second (?t=, stepped by the engine), the trial loops
    const capture = params.get('t') !== null && params.get('play') !== '1';
    const t0 = capture ? Math.min(LENGTH, Math.max(0, Number(params.get('t')) || 0)) : 0;
    const clock = { hold: capture ? t0 : null, from: s.time - t0 };
    /** For the probe: hold the show at second t (the next frame draws it). */
    const seek = t => { clock.hold = t; apply(t); };
    world.samflug = { state, apply, seek, measure, stage, rider, swarm, air, length: LENGTH, flyLength };
    s.after(0, function* run() {
      for (;;) {
        hold();
        const t = clock.hold ?? ((s.time - clock.from) % LENGTH);
        apply(t);
        yield;
      }
    });
    apply(t0);
    yield s.ready();
    clock.from = s.time - t0;
    state.started = true;
    for (;;) yield;
  },
};
