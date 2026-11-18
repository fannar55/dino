// The fast take's player (?chapter=flugedla3d&profa=fjor; the take is fjor.js, its forest fjor-stage.js, its valley chapter 4's
// Árdalurinn, its speed you can see fjor-fx.js, its company fjor-life.js): each frame the camera where the take says (in the forest
// its height over the floor smoothed along the line; from the climb's white in the valley, shifted there with the clouds; from the
// dive's white on the valley's own path), banked and pitched; her on the line behind us in the forest and in the picture in the
// open air; the flock, the birds, the spray; the butterfly darting; the leaves she tears off the crowns she clips; the white; and her
// set under it all with chapter 4's airflow, whooshes, river and falls (&hljod=0: silent).
import * as THREE from 'three';
import { BEAT, LOW, FJOR_D, HOLDS, VALLEY, SWITCH, TIP, FLOCK, FALLS_CLIMB, CREST, CLOUD_Y, warp, herAt, butterflyAt, cameraAt, cameraStats } from './fjor.js';
import { FJOR_ROUTE, FJOR_PATH } from './fjor-stage.js';
import { whiteAt } from './route.js';
import { createFjorFx } from './fjor-fx.js';
import { createFjorLife } from './fjor-life.js';
import { FALLS } from '../kafli4-route.js';
import { createSong } from '../../engine/audio/song.js';
import { createFlightSounds, loadFlightRecordings } from '../../engine/audio/flight-sounds.js';

const rad = d => (d * Math.PI) / 180;
const clamp01 = x => Math.min(1, Math.max(0, x));
const DBG = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('dbg') ?? '' : ''; // (a probe's look without the fog or the clouds)
const SONG_BASE = new URL('../../assets/audio/kafli5/song/', import.meta.url);
// the take's big moves, each a whoosh from its side (on the beat where they land), in the story's seconds
const WHOOSH = [[2.6, 1], [7.4, -1], [8.9, 1], [9.6, -1], [10.4, 1], [11.0, -1], [13.4, 1], [FLOCK.beat(11.5), 1], [TIP + 0.3, 0], [VALLEY.t + 2.3, 0],
  [VALLEY.t + 4.9, -1], [VALLEY.t + 7.1, 1], [VALLEY.t + 9.6, -1], [FALLS_CLIMB.from - 0.4, 0]];
// the flyers' cries (chapter 4's): as the flock rises, and as they peel away
const CRIES = [[FLOCK.beat(3.5), -0.5], [FLOCK.beat(19.5), 0.5]];

export function createFjorPlayer({ s, world, stageCam, cam, cast, clouds, base, state, D, sound, slow = true, herUrl }) {
  const route = FJOR_ROUTE, path = FJOR_PATH;
  // the time warp (its slow stretches; &haegt=0 none): the page's seconds are real, the take is authored in the story's
  const WARP = warp(slow);
  // the floor under the line, smoothed over a second of flight (the camera rides LOW over it, not over every hummock)
  const STEP = 0.05;
  const raw = [];
  for (let t = 0; t <= route.length + 1e-9; t += STEP) { const p = route.at(t); raw.push(world.heightAt(p.x, p.z)); }
  const W = Math.round(0.5 / STEP);
  const ground = raw.map((_, i) => { let sum = 0, n = 0; for (let j = i - W; j <= i + W; j++) if (raw[j] !== undefined) { sum += raw[j]; n++; } return sum / n; });
  const groundAt = t => { const f = Math.min(ground.length - 1, Math.max(0, t / STEP)); const i = Math.floor(f); return ground[i] + ((ground[Math.min(ground.length - 1, i + 1)] - ground[i]) * (f - i)); };
  const worldY = t => groundAt(t) + route.at(t).y;
  // the valley's shift: from the climb's white the forest's route is flown over the valley (with the clouds), so the dive comes down
  // over the gorge where the valley's path begins
  const endA = route.at(VALLEY.t);
  const OFF = { x: VALLEY.breakAt[0] - endA.x, z: VALLEY.breakAt[1] - endA.z };
  const shifted = t => t >= SWITCH.up;
  /** The place the take is in at story second t. */
  const placeAt = t => (t >= SWITCH.up ? 'ardalur' : 'skogur');

  // leaf bursts: where she passes a crown within reach (a planted tree near the line), she tears leaves off it
  const bursts = [];
  const placements = world.forest?.placements ?? [];
  let id = 0;
  for (const pl of placements) {
    if (!pl.model?.crown) continue;
    const cr = pl.model.crown, sc = pl.scale ?? 1, c = Math.cos(pl.rot ?? 0), sn = Math.sin(pl.rot ?? 0);
    const cx = pl.x + (cr.c[0] * c - cr.c[2] * sn) * sc, cz = pl.z + (cr.c[0] * sn + cr.c[2] * c) * sc, cy = pl.y + cr.c[1] * sc;
    const r = Math.min(cr.r, cr.ry ?? cr.r) * sc;
    // the camera's nearest pass by it (low), then hers about 0.45 s later
    let best = Infinity, bt = null, bp = null;
    for (const q of path.pts) {
      if (q.y > 12) continue;
      const h = Math.hypot(q.x - cx, q.z - cz);
      if (h < best) { best = h; bt = q.t; bp = q; }
    }
    if (bt === null) continue;
    const gap = Math.hypot(best, (groundAt(bt) + bp.y) - cy) - r;
    if (gap > 3.4) continue;
    const dx = (cx - bp.x) / Math.max(0.1, best), dz = (cz - bp.z) / Math.max(0.1, best);
    // from the crown's side that faces the line
    bursts.push({ id: id++, t: bt + 0.45, x: cx - dx * r * 0.8, y: Math.min(cy, groundAt(bt) + bp.y + 2.5), z: cz - dz * r * 0.8, dx, dz });
  }
  const fx = createFjorFx(world);
  const life = createFjorLife(world, { url: herUrl });
  const placeOnPath = sM => {
    const t = path.timeAt(sM);
    const p = route.at(t);
    return p.y > 12 ? null : [p.x, groundAt(t) + p.y, p.z, p.yaw];
  };

  // round 2: less haze (a darker, deeper forest behind her pale body, crisp edges), and less again high up
  const fog0 = world.scene.fog?.density ?? null;
  const v = new THREE.Vector3(), herPos = new THREE.Vector3(), airPos = new THREE.Vector3(), fwd = new THREE.Vector3();
  const tanHalfV = Math.tan(rad(stageCam.fov) / 2);
  const cloudCam = { x: 0, y: 0, z: 0 };
  /** Everything at the take's real second r (the story's second through the warp). */
  function apply(r) {
    const t = WARP.story(r), rate = WARP.rate(r);
    state.t = r; state.story = t; state.rate = rate;
    state.place = placeAt(t);
    const c = cameraAt(route, t, base);
    const valley = Boolean(c.valley);
    const sh = shifted(t) && !valley ? OFF : { x: 0, z: 0 };
    Object.assign(cam, { x: c.x + sh.x, y: valley ? c.y : worldY(t), z: c.z + sh.z, yaw: c.yaw, pitch: c.pitch, roll: c.roll });
    const psi = rad(c.yaw), pt = rad(c.pitch);
    stageCam.position.set(cam.x, cam.y, cam.z);
    stageCam.up.set(0, 1, 0);
    stageCam.lookAt(cam.x + Math.sin(psi) * Math.cos(pt) * 10, cam.y + Math.sin(pt) * 10, cam.z - Math.cos(psi) * Math.cos(pt) * 10);
    if (c.roll) stageCam.rotateZ(-rad(c.roll));
    stageCam.updateMatrixWorld(true);
    state.cam = cam;
    // the clouds: shifted with the camera once it is over the valley (their own places are the forest's)
    const off = shifted(t) ? OFF : { x: 0, z: 0 };
    clouds.mesh.material.uniforms.uBase.value.set(off.x, base, off.z);
    Object.assign(cloudCam, { x: cam.x - off.x, y: cam.y, z: cam.z - off.z });
    clouds.update(cloudCam);
    if (DBG.includes('noclouds')) clouds.mesh.visible = false;
    const overFloor = valley ? cam.y - (world.heightAt?.(cam.x, cam.z) ?? 0) : c.y;
    if (fog0 !== null) world.scene.fog.density = DBG.includes('nofog') ? 0 : fog0 * (0.62 - 0.4 * clamp01((overFloor - 12) / 30));
    // the valley is not drawn while the camera is over the cloud (the cloud sea hides it)
    const above = cam.y - base > CLOUD_Y.lo - 6;
    if (world.location === 'ardalur' && world.forest?.group) world.forest.group.visible = !above;

    // her: on the line behind us, or in the picture
    const her = herAt(t, { turnBefore: valley ? 0 : -route.rates.turn(t - 0.3), pitch: c.pitch });
    if (her.blend < 1) {
      // (before the line's start, at the take's first seconds, the line runs on straight ahead of the camera's first place)
      const sH = path.sAt(t) - her.path.d;
      const tH = path.timeAt(sH);
      const ph = route.at(tH), hpsi = rad(ph.yaw);
      const ahead = Math.max(0, -sH);
      herPos.set(ph.x + Math.cos(hpsi) * her.path.side + Math.sin(hpsi) * ahead, worldY(tH) + her.path.lift, ph.z + Math.sin(hpsi) * her.path.side - Math.cos(hpsi) * ahead);
    }
    stage.framePoint(her.air[0], her.air[1], (her.air[2] * FJOR_D) / D, airPos, stageCam, D); // (its k is at FJOR_D: metres kept on a &d= plane)
    if (her.blend >= 1) herPos.copy(airPos); else herPos.lerp(airPos, her.blend);
    const heading = her.blend >= 1 ? c.yaw : route.at(path.timeAt(path.sAt(t) - her.path.d)).yaw * (1 - her.blend) + c.yaw * her.blend;
    const pose = her.pose;
    const white = whiteAt(cam.y - base);
    state.white = white;
    state.her = { ...pose, world: herPos.clone(), haze: 0.85 * white };
    cast.poseHer(state.her, heading);
    // her chest's depth in the picture (k: the depth along the view over the plane)
    fwd.set(0, 0, -1).applyQuaternion(stageCam.quaternion);
    const chestK = v.copy(herPos).sub(stageCam.position).dot(fwd) / D;
    state.herInfo = { d: her.path.d, blend: her.blend, chestK: +chestK.toFixed(4), u: her.air[0], pitch: +(pose.pitch ?? 0).toFixed(1) };

    // the flock, the birds, the spray
    const ctx = { stage, stageCam, D, yaw: c.yaw, camPitch: c.pitch, height: world.renderer?.domElement?.height ?? 800 };
    state.flock = t > FLOCK.from - 1 && t < TIP + 2 ? life.poseFlock(t, ctx) : (life.hideFlock(), []);
    state.birds = life.poseBirds(t, ctx);
    state.spray = life.poseSpray(t, ctx);

    // the butterfly, darting
    state.butterfly = keepClear(butterflyAt(t, her, D));
    cast.poseButterfly(state.butterfly, c.yaw);
    cast.poseLeaves(null);

    // the white: a sheet at the screen plane square to the camera
    cast.poseWhite(white, D, c.yaw, v.set(cam.x, cam.y, cam.z), tanHalfV);
    cast.sheet.position.copy(stageCam.position).addScaledVector(fwd, D);
    cast.sheet.quaternion.copy(stageCam.quaternion);

    fx.update({ t, cam: { x: cam.x, y: cam.y, z: cam.z, up: c.up, back: c.back }, low: !valley && c.y < 14, white, sCam: path.sAt(Math.min(t, route.length)), placeAt: placeOnPath, bursts });
  }
  // rule 9 for the butterfly: never within CLEAR m of her bones (as they were drawn last frame); pushed aside in the picture, at its
  // own depth, away from the nearest bone
  const CLEAR = 0.9, bones = [], bp = new THREE.Vector3(), right = new THREE.Vector3(), upv = new THREE.Vector3(), w = new THREE.Vector3();
  function keepClear(b) {
    if (!bones.length) cast.her.model.traverse(o => { if (o.isBone) bones.push(o); });
    stage.framePoint(b.at[0], b.at[1], (b.at[2] * FJOR_D) / D, bp, stageCam, D);
    let best = Infinity, near = null;
    for (const bone of bones) { const d = bone.getWorldPosition(w).distanceTo(bp); if (d < best) { best = d; near = w.clone(); } }
    if (!near || best >= CLEAR) return b;
    right.set(1, 0, 0).applyQuaternion(stageCam.quaternion);
    upv.set(0, 1, 0).applyQuaternion(stageCam.quaternion);
    const away = bp.clone().sub(near);
    let x = away.dot(right), y = away.dot(upv);
    const n = Math.hypot(x, y) || 1;
    if (n < 1e-3) { x = 0; y = 1; } else { x /= n; y /= n; }
    const dep = (b.at[2] * FJOR_D), push = CLEAR - best + 0.05;
    const tanV = Math.tan(rad(stageCam.fov) / 2), tanH = tanV * stageCam.aspect;
    return { ...b, at: [b.at[0] + (push * x) / (2 * tanH * dep), b.at[1] - (push * y) / (2 * tanV * dep), b.at[2]], pushed: +push.toFixed(2) };
  }
  let stage = null;
  const setStage = st => { stage = st; };

  // the sound: her set from its beat, made again each loop (a song plays once); the airflow at the camera's speed; in the valley the
  // river under us, the gorge's echo and the falls' roar
  // Each loop's song is made a few seconds before it plays (and the first at the start), and played only once its file's length and
  // byte ranges are known: an element cued before that cannot be moved and plays from the set's start, the beat following it
  // (engine/audio/music.js follow: "The theme cannot be moved ..."). Played late, it is played that much further in, on the beat.
  let song = null, next = null, release = null, flight = null, lastWhoosh = -1, lastCry = -1, filter = null, pending = false;
  const makeSong = () => {
    const clock = world.clock ?? { get time() { return s.time; } };
    const made = createSong({ context: world.sound?.context ?? null, output: filter ?? world.sound?.output ?? null, clock, src: 'djamm.mp3', base: SONG_BASE, ...(world.sound?.createElement ? { createElement: world.sound.createElement } : {}) });
    const entry = { song: made, ready: false };
    Promise.resolve(made.ready).then(() => { entry.ready = true; }, () => { entry.ready = true; });
    return entry;
  };
  function soundStart() {
    if (!sound) return;
    const context = world.sound?.context ?? null;
    // a low-pass over her set and the airflow, swept down in the slow stretches (the DJ's filter), open the rest of the time
    if (context && world.sound?.output) {
      filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 20000;
      filter.Q.value = 0.9;
      filter.connect(world.sound.output);
    }
    flight = createFlightSounds({ context, output: filter ?? world.sound?.output ?? null, recordings: context ? loadFlightRecordings(context) : null });
    flight.start();
    next = makeSong();
  }
  function soundLoop() {
    if (!sound) return;
    song?.stop?.();
    release?.();
    release = null;
    const entry = next ?? makeSong();
    next = null;
    song = entry.song;
    songEntry = entry;
    pending = true; // played in soundFrame once its file is known
    lastWhoosh = -1;
    lastCry = -1;
  }
  let songEntry = null;
  function soundFrame(r) {
    if (!sound) return;
    if (pending && songEntry?.ready) {
      pending = false;
      release = world.sound?.hold?.(song) ?? null;
      song.play(WARP.setBeat * BEAT + r);
    }
    if (!next && r > WARP.length - 6) next = makeSong(); // the next loop's, made ahead
    if (!release) song?.update?.();
    const t = WARP.story(r), rate = WARP.rate(r);
    const c = cameraAt(route, t, base);
    flight?.setSpeed?.(Math.hypot(c.back, c.up) * 0.9 * rate);
    if (filter) filter.frequency.setTargetAtTime(rate > 0.99 ? 20000 : 400 + 19600 * Math.pow((rate - 0.2) / 0.8, 3), filter.context.currentTime, 0.04);
    for (const [i, [wt, side]] of WHOOSH.entries()) if (i > lastWhoosh && t >= wt) { lastWhoosh = i; if (t - wt < 0.2) flight?.whoosh?.(side); }
    for (const [i, [ct, pan]] of CRIES.entries()) if (i > lastCry && t >= ct) { lastCry = i; if (t - ct < 0.3) try { s.sfx?.('flyers', { pan }); } catch { /* no cry in this chapter's sounds */ } }
    // the valley's water: the river low in the gorge, its echo between the walls, the falls' roar as we come to them and climb them
    const inGorge = c.valley ? clamp01((t - (VALLEY.t + 1.6)) / 1.0) * (1 - clamp01((t - (CREST.from + 0.6)) / 1.5)) : 0;
    const toFalls = c.valley ? clamp01(1 - Math.hypot(c.x - FALLS.face, c.z - FALLS.z) / 160) : 0;
    flight?.water?.(0.6 * inGorge);
    flight?.rapids?.(0.4 * inGorge);
    flight?.gorge?.(inGorge);
    flight?.falls?.(Math.min(1, 1.3 * toFalls * toFalls + (c.valley && t > FALLS_CLIMB.from - 1 ? 0.6 : 0)), 0.3);
  }
  return {
    apply, setStage, placeAt, life, length: WARP.length, warp: WARP, slows: WARP.slows, off: OFF,
    holds: HOLDS.map(([a, b]) => [+WARP.real(a).toFixed(2), +WARP.real(b).toFixed(2)]),
    bursts, stats: () => cameraStats(route), soundStart, soundLoop, soundFrame, route, path, groundAt, low: LOW,
  };
}
