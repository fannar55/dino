// Gljúfraflugið (?chapter=gljufur3d): a show of about 70 seconds for red/cyan glasses (engine/gler.js). Egill rides Flugeðla and we
// fly with them: low over the rapids into the gorge, the gorge's flyers leaving their nests to fly with her, low over the water
// where she comes straight at us, the skim, up the 40 m waterfall through the spray and the rainbow, out of the spray into the
// golden light, where Grameðla stands on the bank by the lip; she lowers her head and roars as Flugeðla passes over her, everything
// slows, Flugeðla circles her once, Grameðla answers with a soft huff, and they glide away up the river. Then "Aftur" and "Hætta".
// Nobody plays: no steering, no buttons.
//
// It is chapter 4's flight (chapters/kafli4-route.js, kafli4-flight.js) cut short: the show's clock τ is chapter 4's flight time
// less OFFSET up to the burst out of the spray (the same path, speeds, flyers and falls: the flight's own seconds 75 to 119), then a
// path of its own (OWN_POINTS, OWN_KEYS) round Grameðla and away. The route is made with createRoute's `points` and `keys` (only this
// show sets them); the valley is built round that route, so its land, sections and the flyers (world/ardalur/life.js, on
// world.flightTime) follow her round Grameðla too. The far land shows from the crest as in chapter 4, but its Grameðla (the shadow
// in the mist) is never loaded: in this film she stands by the falls.
//
// Stereo with a moving camera: the screen plane rides on her. Every frame the show sets D itself (gler.setPlane(D, { jump: true }):
// no easing, so a seek and __advance land on it) from the shot: in a shot bound to her, her body's depth; in a fixed shot she comes
// toward, her depth down to the shot's `floor` and held there, so she comes out of the screen only at its end; in the roar,
// Grameðla's head as the shot begins, held while the head comes out. A cut jumps D. Comfort (fidrildi3d.js's rules): one thing out
// at a time with a rest at the plane between, nothing in front of the screen at an edge, nothing nearer than 0.6 D outside the
// middle 60 %, the nearest about 0.5 D in the middle, the last picture at the plane; what comes out takes about a second of room
// time (the clock's slow motion, SLOWS, where the flight is too fast). Under reduced motion: no slow motion, half the bank.
//
//   ?chapter=gljufur3d&t=<s>   the show at τ = s (a silent seek that freezes), window.__advance steps on
//   world.gljufur.measure()    depths now (her, Egill, Grameðla's head as shares of D), D, the shot
//   world.gljufur.sample()     measure() plus the depth probe (engine/depth-probe.js): the nearest along the border, in the middle,
//                              outside it; tools/gljufur-probe.mjs runs it every 1/30 s of the show
import * as THREE from 'three';
import { createRoute, POINTS, KEYS, FALLS } from './kafli4-route.js';
import { FLIGHT_WORDS, createFlightSong, riverSound, goldenAt, lightAt, MUSIC, SONG } from './kafli4-flight.js';
import { lineQueue, panOf } from './kafli4-flight-play.js';
import { wingFlaps } from './kafli4-flugedla.js';
import { createArdalur } from '../world/ardalur/index.js';
import { loadCritters } from '../world/ardalur/animals.js';
import { createFlier, rideFlier } from '../engine/flier.js';
import { createFlierSaddle } from '../engine/flier-saddle.js';
import { createFlightSounds, loadFlightRecordings } from '../engine/audio/flight-sounds.js';
import { splash } from '../world/props/splash.js';
import { endCard, glassesStart } from '../engine/book/show-cards.js';
import { leaveShow } from '../engine/book/show-player.js';
import { createDepthProbe } from '../engine/depth-probe.js';
import { createClipProbe, bodyMesh } from '../engine/clip-probe.js';
import { pickLook } from '../engine/looks.js';

const params = new URLSearchParams(globalThis.location?.search ?? '');
const V3 = THREE.Vector3;
const clamp = THREE.MathUtils.clamp;
const smooth = x => { const k = clamp(x, 0, 1); return k * k * (3 - 2 * k); };
const rad = THREE.MathUtils.degToRad;

/** Chapter 4's flight time at the show's 0: 5 s before the gorge's walls begin, the rapids ahead. */
export const OFFSET = 75;
/** The show's length (τ): the fade to black begins at FADE. */
export const LENGTH = 71.5;
const FADE = 70;

// Grameðla (the T. rex, 12 m nose to tail): on the flat north bank of the upper river, 38 m upstream of the lip, facing south-west
// across the river (heading 135), so Flugeðla, coming up out of the falls from the south-east, crosses in front of her face and over
// her head, and the roar camera can stand in front of her over the bank. Her feet at `at` ([x, z]); the ground there is 51.0 m.
export const GRAMEDLA = { at: [-1385, 100], heading: 135 };
const GF = [Math.cos(rad(GRAMEDLA.heading)), Math.sin(rad(GRAMEDLA.heading))]; // the way she faces, seen from above
// Her path from the burst out of the spray (chapter 4's 'burst', flight 119 s, τ 44): down toward Grameðla, over her head as she
// roars ('pass'), out north-west and round her once to the right, through north, east and south ('round', heading west), and away
// up the river into the golden light ('end').
const OWN_POINTS = [
  [null, -1376, 63.5, 115],
  ['pass', -1389.5, 61.5, 103],
  [null, -1397, 62.5, 91],
  [null, -1388, 63.5, 80.5],
  [null, -1371, 64, 85],
  [null, -1365.5, 64, 98.6],
  [null, -1371, 64, 111.5],
  ['round', -1384, 64.5, 117],
  [null, -1405, 65.5, 120],
  [null, -1440, 68, 121],
  [null, -1475, 70.5, 116],
  ['end', -1510, 73, 108],
];
// The show's own schedule after the burst: [flight time, point, m/s].
const OWN_KEYS = [
  [OFFSET + 48, 'pass', 7.5],
  [OFFSET + 58.7, 'round', 9],
  [OFFSET + 70.7, 'end', 12],
];
const BURST = POINTS.findIndex(p => p[0] === 'burst');
export const SHOW_POINTS = [...POINTS.slice(0, BURST + 1), ...OWN_POINTS];
export const SHOW_KEYS = [...KEYS.filter(([t]) => t <= KEYS.find(k => k[1] === 'burst')[0] + 1e-9), ...OWN_KEYS];

// The skim (τ 24 to 30): a lane of no width over the end of the gorge, where the flier's skim may lower her to just over the water.
const SKIM = { lane: [23.5, 30.2], down: 24.2, up: 28.6, splash: [24.9, 28.9, 0.22] };
// Slow motion (the game clock's scale, as chapter 4's slow second): [from τ, to τ, scale]; it eases in and out over EASE_SLOW of τ.
// The first lets her come out of the screen over the water at a pace the eyes follow; the second is the roar and her pass.
export const SLOWS = [[22.9, 23.8, 0.5], [47.0, 48.4, 0.35]];
const EASE_SLOW = 0.25;
// The roar: Grameðla's roar clip (3.6 s) from `at`, her neck lowered `neck` degrees and her body a `lunge` of metres toward the lens
// (in from `at` over `in` s of τ, held, out over `out` s from `back`); the huff (gramedlaExhale) at `huff`, with a nod.
const ROAR = { at: 46.7, neck: 20, lunge: 1.6, in: 0.9, back: 49.3, out: 1.2, watch: 41, huff: 57.4, nod: 8 };

// The shots: [from τ, name]. Each is bound to her (its offset [ahead, up, right] in her frame seen from above, from Egill's head or
// her body) or fixed; `plane` says how D is set: 'her' (her body's depth), { floor } (hers, never under the floor: she comes out at
// the end), 'head' (Grameðla's head as the shot begins, held).
export const SHOTS = [
  [0, 'chase'], [7.5, 'side'], [13, 'chase'], [20.5, 'front'], [23.8, 'skim'], [30, 'chase'],
  [35, 'fallsSide'], [38.4, 'fallsTop'], [42.6, 'reveal'], [46, 'roar'], [51.5, 'circle'], [59, 'away'],
];
const BOUND = {
  chase: { origin: 'egill', offset: [-6.5, 2.4, 0], look: { origin: 'egill', at: [12, -2.6, 0] }, fov: 50 },
  away: { origin: 'egill', offset: [-6.5, 2.4, 0], look: { origin: 'egill', at: [12, -2.6, 0] }, fov: 50 },
  side: { origin: 'body', offset: [0, 0.8, 7], look: { origin: 'body', at: [0.6, 0.6, 0] }, fov: 46 },
  skim: { origin: 'body', offset: [2, 0.4, -6.5], look: { origin: 'body', at: [1.5, -0.4, 0] }, fov: 48 },
  circle: { origin: 'body', offset: [-1, 1.5, -9], look: { origin: 'body', at: [1.5, 0, 0] }, fov: 50 },
  // over her shoulder as she comes out of the spray, looking between her and Grameðla on the bank ahead
  reveal: { origin: 'body', offset: [-8, 2.5, 2.5], look: { origin: 'gramedla', share: 0.45 }, fov: 52 },
};
const FRONT = { lead: 24.6, across: 3.5, above: 1.0, fov: 46, floor: 18 }; // τ she passes the camera's place; m aside; m over the water
const ROAR_CAM = { ahead: 10, up: 1, fov: 46 }; // m in front of her head, along her facing, and above it
const CLEAR = 1.2; // m a camera keeps over the ground and the water
const LINES = [
  [1.0, 'flugedla', 'k4_flugedla_hold'],
  [10.0, 'egill', 'k4_egill_flyers'],
  [31.0, 'egill', 'k4_egill_falls'],
  [33.3, 'flugedla', 'k4_flugedla_up'],
  [47.4, 'egill', 'k4_egill_wow'],
  [54.5, 'flugedla', 'k4_flugedla_holdon2'],
];
// Plants kept off her path round Grameðla and away (banks.js clear spots), and round Grameðla's feet.
const PATH_KEEP = 7;
const GRAM_KEEP = 11;

const route = createRoute({ points: SHOW_POINTS, keys: SHOW_KEYS });
route.lanes.push({ from: route.progressAt(OFFSET + SKIM.lane[0]), to: route.progressAt(OFFSET + SKIM.lane[1]), half: 0 });
const keep = [{ x: GRAMEDLA.at[0], z: GRAMEDLA.at[1], r: GRAM_KEEP }];
for (let t = OFFSET + 42; t <= OFFSET + LENGTH; t += 0.4) {
  const p = route.pointAt(route.progressAt(t));
  keep.push({ x: p.x, z: p.z, r: PATH_KEEP });
}
// her head as it stands (measured in the page: the roar camera is placed from the real one; this is for the plants only)
const HEAD_GUESS = new V3(GRAMEDLA.at[0] + GF[0] * 5.5, 56, GRAMEDLA.at[1] + GF[1] * 5.5);
const views = [{ position: HEAD_GUESS.clone().add(new V3(GF[0] * ROAR_CAM.ahead, ROAR_CAM.up, GF[1] * ROAR_CAM.ahead)), looks: [HEAD_GUESS] }];

/** Less motion: the page's ask (prefers-reduced-motion), ?reduced=1, or what a test's world says. */
function reducedMotion(world) {
  if (typeof world.reduced === 'boolean') return world.reduced;
  return params.get('reduced') === '1' || Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/** The clock's scale at τ (1 outside SLOWS; eased in and out). */
export function scaleAt(tau) {
  for (const [from, to, scale] of SLOWS) {
    if (tau < from - EASE_SLOW || tau > to + EASE_SLOW) continue;
    const k = Math.min(smooth((tau - (from - EASE_SLOW)) / EASE_SLOW), 1 - smooth((tau - to) / EASE_SLOW));
    return 1 - (1 - scale) * k;
  }
  return 1;
}

/** The shot at τ: [index, name, from]. */
export function shotAt(tau) {
  let i = 0;
  while (i + 1 < SHOTS.length && tau >= SHOTS[i + 1][0]) i++;
  return [i, SHOTS[i][1], SHOTS[i][0]];
}

export const chapter = {
  id: 'gljufur3d',
  title: 'Gljúfraflugið',
  next: null,
  look: 'earlyAfternoon',
  theme: 'kafli2/theme.json', // silent: the flight's song plays
  gler: { panel: false }, // main.js turns the glasses on, without the "3D" button
  startButton: glassesStart, // the glasses picture is the start, one tap
  start: 'ardalur',
  locations: {
    ardalur: {
      build: async world => createArdalur(world, { route, critters: await loadCritters(world), keep, views }),
      shots: {
        // behind the start: the rapids, the gorge's mouth ahead
        gljufur_start: { position: [-900, 15, 137], target: [-960, 11, 146], fov: 50 },
      },
    },
  },
  actors: {
    flugedla: { url: '../assets/characters/pteranodon.glb', position: [-924, 8, 139], heading: 180 },
    egill: { url: '../assets/characters/egill.glb', position: [-924, 8, 139], heading: 180 },
    gramedla: { url: '../assets/characters/trex.glb', position: [GRAMEDLA.at[0], 0, GRAMEDLA.at[1]], heading: GRAMEDLA.heading },
  },
  cast: {
    egill: { name: 'Egill', colour: '#355774' },
    flugedla: { name: 'Flugeðla', colour: '#955055' },
  },
  lines: Object.fromEntries(LINES.map(([, , id]) => [id, { text: FLIGHT_WORDS[id], audio: id }])),
  startShot: 'gljufur_start',
  shots: {},

  warmUp(world) {
    const objects = [...world.actors.values()].map(actor => actor.root);
    const place = world.forest;
    for (const part of [place?.waterfall, place?.farLand, place?.animals]) if (part?.group) objects.push(part.group);
    return { objects, dispose() {} };
  },

  *script(s) {
    const her = s.actor('flugedla').raw;
    const egill = s.actor('egill').raw;
    const gram = s.actor('gramedla').raw;
    const world = her.world;
    const { director, gler } = world;
    const reduced = reducedMotion(world);
    world.chapterTimeline = [];
    // every section of the valley now, behind the start: the show begins 75 s into the flight, where nothing would be built yet
    world.forest?.buildAll?.();
    const flier = createFlier(her, route, { world, reduced });
    flier.update(OFFSET);
    const saddle = createFlierSaddle(her);
    saddle.show();
    const riding = rideFlier(egill, flier, { saddle });
    const context = world.sound?.context ?? null;
    const recordings = loadFlightRecordings(context);
    const look = world.look ?? pickLook(world.chapter?.look);
    const scratch = new THREE.Color();
    const flap = wingFlaps(her);
    world.music?.setLevel?.(0, 0);
    const lines = lineQueue(s);
    const far = world.forest?.farLand ?? null;

    // ---- Grameðla: on her spot, watching; the roar's lowered neck and lunge are laid over her clips (setOverlay) ----
    const gramAt = new V3();
    const placeGram = lunge => {
      gram.place(GRAMEDLA.at[0] + GF[0] * lunge, GRAMEDLA.at[1] + GF[1] * lunge, GRAMEDLA.heading);
    };
    placeGram(0);
    gram.play('idle', { fade: 0 });
    let tauNow = 0;
    const roarK = tau => Math.min(smooth((tau - ROAR.at) / ROAR.in), 1 - smooth((tau - ROAR.back) / ROAR.out));
    const nodK = tau => Math.max(0, Math.sin(Math.PI * clamp((tau - ROAR.huff) / 1.2, 0, 1)));
    gram.setOverlay((dt, bones) => {
      const k = roarK(tauNow);
      if (k > 0) bones.pitchNeck(-ROAR.neck * k);
      const n = nodK(tauNow);
      if (n > 0) bones.pitchHead(-ROAR.nod * n);
    });
    gram.lookYawLimit = 70;
    gram.mixer.update(0);
    gram.root.updateMatrixWorld(true);
    const headRest = gram.headPosition(new V3()).clone(); // her head standing, before the show: where the roar camera is set from
    const roarCam = headRest.clone().add(new V3(GF[0] * ROAR_CAM.ahead, ROAR_CAM.up, GF[1] * ROAR_CAM.ahead));

    // ---- the camera: the shots, and D every frame ----
    const camState = { index: -1, name: null, from: 0, D: 10, headD: null, roll: 0 };
    const hFrame = { f: new V3(), r: new V3() };
    const tmp = new V3(), tmp2 = new V3(), originV = new V3(), headV = new V3();
    const groundAt = (x, z) => Math.max(world.heightAt?.(x, z) ?? -Infinity, route.waterAt(x, z, 1) ?? -Infinity);
    function herFrame() {
      const h = rad(flier.heading);
      hFrame.f.set(Math.cos(h), 0, Math.sin(h));
      hFrame.r.set(-Math.sin(h), 0, Math.cos(h));
    }
    const inFrame = ([a, u, r], out) => out.set(0, 0, 0).addScaledVector(hFrame.f, a).addScaledVector(V3Up, u).addScaledVector(hFrame.r, r);
    const originOf = (name, out) => (name === 'egill' ? egill.headPosition(out) : out.copy(flier.pose.position));
    const depthFrom = (position, target, point) => tmp2.copy(target).sub(position).normalize().dot(tmp.copy(point).sub(position));
    // the fixed shots' places (pure: from the route and the constants)
    const fixedOf = name => {
      if (name === 'front') {
        const u = route.progressAt(OFFSET + FRONT.lead);
        const p = route.pointAt(u);
        const t = route.tangentAt(u);
        const side = new V3(-t.z, 0, t.x).normalize();
        const x = p.x + side.x * FRONT.across;
        const z = p.z + side.z * FRONT.across;
        return { position: new V3(x, (route.waterAt(x, z, 2) ?? world.heightAt(x, z)) + FRONT.above, z), fov: FRONT.fov, plane: { floor: FRONT.floor } };
      }
      if (name === 'fallsSide') return { position: new V3(FALLS.face + 22, 26, FALLS.z + 13), fov: 52, plane: 'her' };
      if (name === 'fallsTop') return { position: new V3(FALLS.face - 7, FALLS.top + 18, FALLS.z - 22), fov: 38, plane: { floor: 34 } };
      if (name === 'roar') return { position: roarCam.clone(), fov: ROAR_CAM.fov, plane: 'head', look: out => out.copy(headRest).lerp(gram.headPosition(headV), 0.5) };
      return null;
    };
    let fixed = null;
    function step(rig) {
      const bound = BOUND[camState.name];
      herFrame();
      if (bound) {
        rig.fov = bound.fov;
        originOf(bound.origin, originV);
        rig.position.copy(originV).add(inFrame(bound.offset, tmp));
        if (bound.look.origin === 'gramedla') rig.target.copy(flier.pose.position).lerp(gram.headPosition(headV), bound.look.share);
        else originOf(bound.look.origin, rig.target).add(inFrame(bound.look.at, tmp));
        const floor = groundAt(rig.position.x, rig.position.z) + CLEAR;
        if (rig.position.y < floor) rig.position.y = floor;
        const facing = tmp.copy(rig.target).sub(rig.position).setY(0).normalize().dot(hFrame.f);
        camState.roll = clamp((flier.bank / 3) * facing * (reduced ? 0.5 : 1), -8, 8);
        rig.roll = camState.roll;
        camState.D = depthFrom(rig.position, rig.target, flier.pose.position);
      } else if (fixed) {
        rig.fov = fixed.fov;
        rig.position.copy(fixed.position);
        if (fixed.look) fixed.look(rig.target);
        else rig.target.copy(flier.pose.position).add(tmp.set(0, 0.6, 0));
        rig.roll = camState.roll = 0;
        const d = depthFrom(rig.position, rig.target, flier.pose.position);
        if (fixed.plane === 'head') {
          camState.headD ??= depthFrom(rig.position, rig.target, gram.headPosition(headV));
          camState.D = camState.headD;
        } else if (fixed.plane?.floor) camState.D = Math.max(fixed.plane.floor, d);
        else camState.D = d;
      }
      gler?.setPlane(camState.D, { jump: true });
    }
    function cutTo(index) {
      const [from, name] = SHOTS[index];
      camState.index = index;
      camState.name = name;
      camState.from = from;
      camState.headD = null;
      fixed = BOUND[name] ? null : fixedOf(name);
      director.drive(`gljufur ${name}`, rig => step(rig));
      step(director.rig);
      director.apply();
      world.chapterTimeline.push({ shot: name, at: +tauNow.toFixed(3) });
    }

    // ---- what probes and captures read ----
    const depthProbe = { probe: null };
    const state = { route, tau: 0, ft: OFFSET, camera: camState, reduced, roarCam: roarCam.toArray(), headRest: headRest.toArray(), showing: false, ended: false };
    const shareOf = p => {
      const cam = world.camera;
      cam.updateMatrixWorld();
      const local = tmp.copy(p).applyMatrix4(cam.matrixWorldInverse);
      const ndc = tmp2.copy(p).project(cam);
      return { k: +(-local.z / effectiveD()).toFixed(3), u: +(0.5 + 0.5 * ndc.x).toFixed(3), v: +(0.5 - 0.5 * ndc.y).toFixed(3) };
    };
    const effectiveD = () => clamp(camState.D * (gler?.settings?.pop ?? 1), 1.5, 60);
    function measure() {
      return {
        tau: +state.tau.toFixed(3), ft: +state.ft.toFixed(3), shot: camState.name, D: +effectiveD().toFixed(3), scale: scaleAt(state.tau),
        her: shareOf(flier.pose.position), egill: shareOf(egill.headPosition(new V3())), gramedla: shareOf(gram.headPosition(new V3())),
      };
    }
    function sample() {
      depthProbe.probe ??= createDepthProbe(world);
      const m = measure();
      const d = depthProbe.probe.sample(m.D);
      return { ...m, border: +d.border.toFixed(3), borderAt: d.borderAt, middle: +d.middle.toFixed(3), middleAt: d.middleAt, wide: +d.wide.toFixed(3), wideAt: d.wideAt };
    }
    // Nothing through anything: her skin (every `every`-th vertex of her posed body, and Egill's) against the ground and the gorge's
    // walls (world.heightAt), the water (but in the skim) and Grameðla's posed body (engine/clip-probe.js). Returns the worst of each.
    let gramProbe = null;
    function clipCheck({ every = 12 } = {}) {
      gramProbe ??= createClipProbe(world, ['gramedla']);
      const out = { ground: Infinity, groundAt: null, water: Infinity, gramedla: Infinity, inside: 0 };
      const points = [];
      const v = new V3();
      for (const actor of [her, egill]) {
        const mesh = bodyMesh(actor);
        actor.model.updateMatrixWorld(true);
        mesh.skeleton?.update();
        const count = mesh.geometry.attributes.position.count;
        for (let i = 0; i < count; i += every) {
          mesh.getVertexPosition(i, v);
          v.applyMatrix4(mesh.matrixWorld);
          const g = world.heightAt(v.x, v.z) - v.y;
          if (-g < out.ground) { out.ground = -g; out.groundAt = [+v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1)]; }
          const w = route.waterAt(v.x, v.z, 0);
          if (w !== null) out.water = Math.min(out.water, v.y - w);
          if (i % (every * 4) === 0) points.push({ name: actor.name, p: v.toArray(), wing: 0, contact: false });
        }
      }
      for (const f of gramProbe.look(points, { reach: 3 })) {
        out.gramedla = Math.min(out.gramedla, f.distance);
        if (f.inside) out.inside++;
      }
      for (const key of ['ground', 'water', 'gramedla']) out[key] = Number.isFinite(out[key]) ? +out[key].toFixed(3) : null;
      return out;
    }
    world.gljufur = { state, measure, sample, clipCheck, route, flier, scaleAt, shotAt, SHOTS };
    world.chapterState = state;

    // Before the start: the first shot behind the glasses, her where the show begins
    cutTo(0);
    yield saddle.loaded;
    yield s.ready();
    if (!s.seeking && saddle.mesh) world.warmObjects?.([saddle.mesh]);

    for (;;) {
      yield* show();
      let again = false;
      const { element: end } = endCard(document, { onAgain: () => { again = true; }, onQuit: () => leaveShow(window) });
      document.body.append(end);
      try {
        yield s.until(() => again);
      } finally {
        end.remove();
      }
    }

    // ==============================================================================================================
    function* show() {
      const T0 = s.time;
      const tau = () => s.time - T0;
      tauNow = 0;
      state.showing = true;
      state.ended = false;
      camState.index = -1;
      placeGram(0);
      gram.lookAt(null);
      gram.play('idle', { fade: 0 });
      flier.update(OFFSET);
      far?.show(true);
      world.flightReduced = reduced;
      const sounds = createFlightSounds({ context, output: world.sound?.output ?? null, recordings });
      const release = s.seeking ? null : world.sound?.hold?.(sounds);
      if (!s.seeking) sounds.start();
      const song = createFlightSong(world);
      // the song as chapter 4 has it at this point of the flight (its playhead SONG.at ahead of the flight's clock, and 0.75 s more
      // for chapter 4's slow second at the crest, which this show leaves out), so the full orchestra comes in at the burst
      song?.play(SONG.at + OFFSET + 0.75);
      song?.setLevel?.(MUSIC.flight, 0);
      s.fade(0, 1);
      const done = { ended: false };
      const cues = [];
      for (const [at, who, id] of LINES) cues.push([at, () => lines.say(who, id, { ifQuiet: id === 'k4_egill_wow' || id === 'k4_egill_flyers' })]);
      cues.push([SKIM.down, () => flier.skim(true)], [SKIM.up, () => flier.skim(false)]);
      cues.push([ROAR.watch, () => gram.lookAt(flier.pose.position, { maxAngle: 70, maxPitch: 35 })]);
      cues.push([ROAR.at - 0.3, () => gram.lookAt(() => world.camera.position, { maxAngle: 70, maxPitch: 35 })]);
      cues.push([ROAR.at, () => { gram.play('roar', { fade: 0.3, once: true }); s.sfx('gramedlaRoar'); }]);
      cues.push([ROAR.back + 0.4, () => { gram.play('idle', { fade: 0.8 }); gram.lookAt(flier.pose.position, { maxAngle: 70, maxPitch: 35 }); }]);
      cues.push([ROAR.huff, () => s.sfx('gramedlaExhale')]);
      for (const [from, to, scale] of SLOWS) {
        // the song plays on through the slow motion: a lenient window lets its playhead follow the sound (as chapter 4's slow second)
        cues.push([from - EASE_SLOW, () => { if (!reduced) song?.lenient?.(to - from + 2 * EASE_SLOW + 0.25); }]);
        void scale;
      }
      cues.push([FADE, () => { s.fade(1, LENGTH - FADE); song?.stop?.(LENGTH - FADE + 0.5); }]);
      cues.sort((a, b) => a[0] - b[0]);
      function* beats() {
        for (const [at, act] of cues) {
          const left = at - tau();
          if (left > 1e-9) yield s.wait(left);
          act();
        }
      }
      function* frames() {
        let n = 0;
        let clip = null;
        let nextSplash = SKIM.splash[0];
        while (!done.ended) {
          const t = Math.min(LENGTH, tau());
          tauNow = t;
          state.tau = t;
          state.ft = OFFSET + t;
          world.clock?.setScale?.(reduced ? 1 : scaleAt(t));
          flier.update(OFFSET + t);
          world.flightTime = OFFSET + t;
          lightAt(world, look, goldenAt(OFFSET + t), scratch);
          // Grameðla's lunge toward the lens with the roar
          placeGram(ROAR.lunge * roarK(t));
          // the shot of this moment (a cut when it changes)
          const [index] = shotAt(t);
          if (index !== camState.index) cutTo(index);
          // the skim's spray: drops where she touches the water, rings and the striders
          if (t >= nextSplash && t <= SKIM.splash[1]) {
            nextSplash += SKIM.splash[2];
            const p = flier.pose.position;
            const level = route.waterAt(p.x, p.z, 2);
            if (level !== null && p.y - level < 2.2) {
              if (world.effects && world.scene) splash(world, new V3(p.x, level, p.z), { size: 0.9, count: 22, seed: `skim ${Math.round(t * 100)}` });
              world.forest?.rippleAt?.(p.x, p.z, 1);
              world.forest?.life?.skim?.(p.x, p.z);
            }
          }
          if (flier.clip !== clip) {
            if (!s.seeking && (flier.clip === 'takeOff' || flier.clip === 'fly')) sounds.wingbeat();
            clip = flier.clip;
          }
          if (flap() && !s.seeking) sounds.flap?.();
          if (!s.seeking && n++ % 3 === 0) {
            const p = flier.pose.position;
            sounds.setSpeed(flier.speed);
            sounds.setPan(flier.bank / 50);
            const river = riverSound(route, p);
            sounds.water(river.water);
            sounds.rapids(river.rapids);
            sounds.gorge(river.gorge);
            sounds.duck(Boolean(lines.speaking));
            const fallsAt = tmp.set(FALLS.face, (FALLS.top + FALLS.base) / 2, FALLS.z);
            sounds.falls(Math.min(1, (35 / Math.max(1, p.distanceTo(fallsAt))) ** 2), world.camera?.updateMatrixWorld ? panOf(world, fallsAt.clone()) : null);
          }
          if (t >= LENGTH) done.ended = true;
          yield;
        }
      }
      try {
        yield s.all(frames(), beats());
      } finally {
        world.clock?.setScale?.(1);
        sounds.stop();
        release?.();
        state.showing = false;
        state.ended = true;
      }
    }
  },
};

const V3Up = new V3(0, 1, 0);
