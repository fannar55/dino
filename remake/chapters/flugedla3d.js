// Flugeðla og fiðrildið (?chapter=flugedla3d): the third show for red/cyan glasses (the plan:
// docs/superpowers/specs/2026-11-16-flugedla-og-fidrildid-3d-design.md, the finished take of section 14). Flugeðla chases a
// butterfly through the forest at speed, up through the white to her flock over the cloud, dives into chapter 4's gorge, climbs
// its falls and comes to the crest with the butterfly at her beak, to DJ Flugeðla's set (Djamm skógarins).
//
//   ?chapter=flugedla3d                the show: the glasses start, about 60 seconds, the end card ("Aftur" plays it again,
//                                      "Hætta" leaves); &profa=fjor (the take's old address) is the same
//   &t=<s>                             the show held at that real second (a capture: no sound); &t=<s>&play=1 plays it from there;
//                                      &t=0&show=1 a capture of the whole show, stepped on by a probe
//   &d=<m>                             another screen plane (17.5 m unless given); &hljod=0 silent; &haegt=0 no slow stretches;
//                                      &dbg= a probe's look (fjor-play.js)
//   &gler=0, &styrkur=<s>              the engine's: plain, or another strength (the owner's is 0.02)
//
// One job a file, in flugedla3d/: fjor.js (the take's camera and her flight, story seconds), fjor-stage.js (its forest),
// fjor-play.js (puts everything where the take says, real seconds; its sound and her three lines), fjor-life.js (the flock, the
// birds), fjor-fx.js (the white, the spray), route.js and stage.js (the lens, the wood's mouth, the lane, the clouds' places),
// clouds.js (drawing them), cast.js (Flugeðla, the butterfly, leaves, the white), measure.js (the numbers:
// tools/flugedla-probe.mjs).
import * as THREE from 'three';
import { createStage } from '../engine/stage3d.js';
import { endCard, glassesStart } from '../engine/book/show-cards.js';
import { leaveShow } from '../engine/book/show-player.js';
import { FOV, LANE_PATH } from './flugedla3d/stage.js';
import { MOUTH, LANE_H } from './flugedla3d/route.js';
import { createCast } from './flugedla3d/cast.js';
import { createClouds } from './flugedla3d/clouds.js';
import { createMeasure } from './flugedla3d/measure.js';
import { FJOR_LAYOUT, fjorCloudBalls } from './flugedla3d/fjor-stage.js';
import { FJOR_D } from './flugedla3d/fjor.js';
import { createFjorPlayer, LINE_TEXT } from './flugedla3d/fjor-play.js';
import { createArdalur } from '../world/ardalur/index.js';
import { createRoute } from './kafli4-route.js';

const CHARS = '../assets/characters/';
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
// the screen plane: the take's own (17.5 m since round 2), or &d=
const PLANE = Number(params.get('d')) > 0 ? Number(params.get('d')) : FJOR_D;
const FADE = 0.35; // s of black at the start and the dip at the end
const rad = d => (d * Math.PI) / 180;

export const chapter = {
  id: 'flugedla3d',
  title: 'Flugeðla og fiðrildið',
  look: 'morning',
  gler: { panel: false },
  startButton: glassesStart,
  // the forest, then chapter 4's valley (its gorge and falls), changed to in the climb's white (fjor-play.js placeAt)
  locations: {
    skogur: { layout: FJOR_LAYOUT },
    ardalur: {
      build: async world => createArdalur(world, { grey: false, route: createRoute({ wingspan: 7.5 }), at: [-1240, 140] }),
      shots: {}, warmUp: [],
      async ready(world, valley) { valley.farLand?.prefetch?.(); await valley.farLand?.load?.(); },
    },
  },
  start: 'skogur',
  readyFirst: ['ardalur'],
  actors: { flugedla: { url: CHARS + 'pteranodon.glb', position: [6, 0, -400], heading: 90 } },
  cast: { flugedla: { name: 'Flugeðla' } },
  // her three lines (fjor-play.js LINES), heard only: the show keeps text off the screen
  lines: Object.fromEntries(Object.entries(LINE_TEXT).map(([id, text]) => [id, { text, audio: id }])),
  startShot: 'show',
  shots: { show: { position: [MOUTH.x, LANE_H + 2, MOUTH.z], target: [MOUTH.x, LANE_H + 2, MOUTH.z - 10], fov: FOV } },

  *script(s) {
    const her = s.actor('flugedla').raw;
    const world = her.world;
    const { gler, director } = world;
    world.music?.setLevel?.(0, 0); // the game's theme held at nothing: her set is the show's music

    // the lane's ground level: the highest ground under the camera's low path (its heights are over it)
    let base = -Infinity;
    for (const q of LANE_PATH) base = Math.max(base, world.heightAt(q.x, q.z));
    const stage = createStage(world, { position: [MOUTH.x, base + LANE_H, MOUTH.z], look: -90, fov: FOV, groundShare: 0, depth: PLANE, plane: () => PLANE });
    const { stageCam } = stage;
    const at = (u, v, k, out = new THREE.Vector3()) => stage.framePoint(u, v, k, out, stageCam, PLANE);
    const hold = () => { if (gler) { gler.settings.pop = 1; gler.setPlane(PLANE, { jump: true }); } };
    hold();

    // the camera: driven each frame to the take's place (the script runs before the director in a frame: same second)
    const cam = { x: MOUTH.x, y: base + LANE_H, z: MOUTH.z, yaw: 0, pitch: 0, roll: 0 };
    yield s.camera.cut('show', { check: false });
    director.drive('flugedla3d', rig => {
      const psi = rad(cam.yaw), pt = rad(cam.pitch ?? 0);
      rig.position.set(cam.x, cam.y, cam.z);
      rig.target.set(cam.x + Math.sin(psi) * Math.cos(pt) * 10, cam.y + Math.sin(pt) * 10, cam.z - Math.cos(psi) * Math.cos(pt) * 10);
      rig.fov = FOV;
      rig.roll = cam.roll ?? 0;
    });

    // the forest's own butterflies go under the ground (only ours flies)
    const fb = world.forest?.butterflies;
    if (fb) for (const target of fb.targets) fb.follow(target.name, out => out.set(0, -200, 0), { snap: true });
    const cast = createCast(world, { her, at });
    const clouds = createClouds(world, fjorCloudBalls(), { base });
    yield cast.butterflyReady;

    const state = { t: 0, base, D: PLANE, her: null, butterfly: null, white: 0, cam, showing: false };
    const measure = createMeasure(world, { stage, D: PLANE, cast, state, clouds, base });
    world.flugedla3d = { state, measure, cast, clouds };

    // t= holds a second of the take (a capture, with no sound); play=1 plays it from there; t=0&show=1 is a capture that plays the
    // show through, silently, as the frozen page is stepped on (the probe's check of the start, the lines' cues and the end card)
    const still = params.get('t') !== null && params.get('play') !== '1';
    const capture = still && params.get('show') !== '1';
    const startAt = Math.max(0, Number(params.get('t')) || 0);
    const say = id => s.say('flugedla', id, { hold: 0, caption: false, listen: false });
    const player = createFjorPlayer({ s, world, stageCam, cam, cast, clouds, base, state, D: PLANE, sound: !still && params.get('hljod') !== '0', slow: params.get('haegt') !== '0', herUrl: new URL(CHARS + 'pteranodon.glb', import.meta.url).href, say });
    player.setStage(stage);
    const length = player.length;
    const clock = { hold: capture ? Math.min(length, startAt) : null, from: null, ended: false };
    let black = -1, changing = false;
    const seek = t => { clock.hold = t; player.apply(t); };
    Object.assign(world.flugedla3d, { seek, length, from: 0, fjor: player, route: player.route, lines: player.lines });
    s.after(0, function* run() {
      for (;;) {
        hold();
        const t = clock.hold ?? (clock.from === null ? 0 : Math.min(length, s.time - clock.from));
        player.apply(t);
        // the place the take is in (a cut with no black: the valley is built before the start)
        const want = player.placeAt(state.story);
        if (want !== world.location && !changing) { changing = true; s.goTo(want, { fade: 0 }); }
        if (want === world.location) changing = false;
        if (state.showing && clock.hold === null) {
          // the dip: the set fades out and the air and the water stop with it, so the end card is quiet
          if (!clock.ended && t >= length - FADE) { clock.ended = true; player.soundEnd(); }
          if (!clock.ended) player.soundFrame(t);
        }
        // black for the first FADE s, and the dip to black over the last FADE s (held through the end card)
        const b = clock.hold !== null ? 0 : !state.showing && clock.from !== null ? 1 : +Math.min(1, Math.max(0, 1 - t / FADE, (t - (length - FADE)) / FADE)).toFixed(3);
        if (state.started && b !== black) { black = b; s.fade(b, 0); }
        yield;
      }
    });
    seek(clock.hold ?? 0);
    if (!capture) clock.hold = null;
    yield s.ready();

    // ---- the show: the glasses' start (chapter.startButton), the take once from the top, the dip, then the end card ----
    let from = Math.min(length - 1, params.get('play') === '1' ? startAt : 0);
    try {
      for (;;) {
        state.started = true;
        if (!capture) {
          clock.ended = false;
          clock.from = s.time - from;
          state.showing = true;
          player.soundStart(); // "Aftur" starts clean: the last play's sounds stopped, the set from its beat again
        }
        if (capture) for (;;) yield;
        yield s.until(() => s.time - clock.from >= length);
        state.showing = false;
        // the end card: "Aftur" plays it again, "Hætta" leaves (the book's frame closes; on its own, the game's start)
        let again = false;
        const { element: end } = endCard(document, { onAgain: () => { again = true; }, onQuit: () => { player.soundEnd(); leaveShow(window); } });
        document.body.append(end);
        try {
          yield s.until(() => again);
        } finally {
          end.remove();
        }
        from = 0;
      }
    } finally {
      player.dispose?.();
    }
  },
};
