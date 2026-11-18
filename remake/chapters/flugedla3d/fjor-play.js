// The fast trial's player (?chapter=flugedla3d&profa=fjor; the take is fjor.js, its world fjor-stage.js, its speed you can see
// fjor-fx.js): each frame the camera where the take says (its height over the floor smoothed along the line), banked and pitched;
// her on the line behind us in the forest and in the picture in the open air; the butterfly darting; the leaves she tears off the
// crowns she clips; the white; and her set under it all with chapter 4's airflow and whooshes (&hljod=0: silent).
import * as THREE from 'three';
import { LENGTH, BEAT, SET_BEAT, LOW, FJOR_D, HOLDS, herAt, butterflyAt, cameraAt, cameraStats } from './fjor.js';
import { FJOR_ROUTE, FJOR_PATH } from './fjor-stage.js';
import { whiteAt } from './route.js';
import { createFjorFx } from './fjor-fx.js';
import { createSong } from '../../engine/audio/song.js';
import { createFlightSounds, loadFlightRecordings } from '../../engine/audio/flight-sounds.js';

const rad = d => (d * Math.PI) / 180;
const SONG_BASE = new URL('../../assets/audio/kafli5/song/', import.meta.url);
// the take's big moves, each a whoosh from its side (on the beat where they land)
const WHOOSH = [[2.6, 1], [7.4, -1], [8.9, 1], [9.6, -1], [10.4, 1], [11.0, -1], [14.4, 0], [21.2, 0], [23.3, 0], [26.2, 1]];

export function createFjorPlayer({ s, world, stageCam, cam, cast, clouds, base, state, D, sound }) {
  const route = FJOR_ROUTE, path = FJOR_PATH;
  // the floor under the line, smoothed over a second of flight (the camera rides LOW over it, not over every hummock)
  const STEP = 0.05;
  const raw = [];
  for (let t = 0; t <= route.length + 1e-9; t += STEP) { const p = route.at(t); raw.push(world.heightAt(p.x, p.z)); }
  const W = Math.round(0.5 / STEP);
  const ground = raw.map((_, i) => { let sum = 0, n = 0; for (let j = i - W; j <= i + W; j++) if (raw[j] !== undefined) { sum += raw[j]; n++; } return sum / n; });
  const groundAt = t => { const f = Math.min(ground.length - 1, Math.max(0, t / STEP)); const i = Math.floor(f); return ground[i] + ((ground[Math.min(ground.length - 1, i + 1)] - ground[i]) * (f - i)); };
  const worldY = t => groundAt(t) + route.at(t).y;

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
  const placeAt = sM => {
    const t = path.timeAt(sM);
    const p = route.at(t);
    return p.y > 12 ? null : [p.x, groundAt(t) + p.y, p.z, p.yaw];
  };

  // round 2: less haze (a darker, deeper forest behind her pale body, crisp edges), and less again high up (the dive's peak)
  const fog0 = world.scene.fog?.density ?? null;
  const v = new THREE.Vector3(), herPos = new THREE.Vector3(), airPos = new THREE.Vector3(), fwd = new THREE.Vector3();
  const tanHalfV = Math.tan(rad(stageCam.fov) / 2);
  /** Everything at trial second t. */
  function apply(t) {
    state.t = t;
    const c = cameraAt(route, t);
    Object.assign(cam, { x: c.x, y: worldY(t), z: c.z, yaw: c.yaw, pitch: c.pitch, roll: c.roll });
    const psi = rad(c.yaw), pt = rad(c.pitch);
    stageCam.position.set(cam.x, cam.y, cam.z);
    stageCam.up.set(0, 1, 0);
    stageCam.lookAt(cam.x + Math.sin(psi) * Math.cos(pt) * 10, cam.y + Math.sin(pt) * 10, cam.z - Math.cos(psi) * Math.cos(pt) * 10);
    if (c.roll) stageCam.rotateZ(-rad(c.roll));
    stageCam.updateMatrixWorld(true);
    state.cam = cam;
    clouds.update(cam);
    if (fog0 !== null) world.scene.fog.density = fog0 * (0.5 - 0.3 * Math.min(1, Math.max(0, (c.y - 12) / 30)));

    // her: on the line behind us, or in the picture
    const her = herAt(t, { turnBefore: -route.rates.turn(t - 0.3) });
    // (before the line's start, at the take's first seconds, the line runs on straight ahead of the camera's first place)
    const sH = path.sAt(t) - her.path.d;
    const tH = path.timeAt(sH);
    const ph = route.at(tH), hpsi = rad(ph.yaw);
    const ahead = Math.max(0, -sH);
    herPos.set(ph.x + Math.cos(hpsi) * her.path.side + Math.sin(hpsi) * ahead, worldY(tH) + her.path.lift, ph.z + Math.sin(hpsi) * her.path.side - Math.cos(hpsi) * ahead);
    stage.framePoint(her.air[0], her.air[1], (her.air[2] * FJOR_D) / D, airPos, stageCam, D); // (its k is at FJOR_D: metres kept on a &d= plane)
    herPos.lerp(airPos, her.blend);
    const heading = ph.yaw + (c.yaw - ph.yaw) * her.blend;
    const white = whiteAt(cam.y - base);
    state.white = white;
    state.her = { ...her.pose, world: herPos.clone(), haze: 0.85 * white };
    cast.poseHer(state.her, heading);
    // her chest's depth in the picture (k: the depth along the view over the plane)
    fwd.set(0, 0, -1).applyQuaternion(stageCam.quaternion);
    const chestK = v.copy(herPos).sub(stageCam.position).dot(fwd) / D;
    state.herInfo = { d: her.path.d, blend: her.blend, chestK: +chestK.toFixed(4), u: her.air[0] };

    // the butterfly, darting
    state.butterfly = butterflyAt(t, her, D);
    cast.poseButterfly(state.butterfly, c.yaw);
    cast.poseLeaves(null);

    // the white: a sheet at the screen plane square to the camera
    cast.poseWhite(white, D, c.yaw, v.set(cam.x, cam.y, cam.z), tanHalfV);
    fwd.set(0, 0, -1).applyQuaternion(stageCam.quaternion);
    cast.sheet.position.copy(stageCam.position).addScaledVector(fwd, D);
    cast.sheet.quaternion.copy(stageCam.quaternion);

    fx.update({ t, cam: { x: cam.x, y: cam.y, z: cam.z, up: c.up, back: c.back }, low: c.y < 14, white, sCam: path.sAt(t), placeAt, bursts });
  }
  let stage = null;
  const setStage = st => { stage = st; };

  // the sound: her set from its beat SET_BEAT, made again each loop (a song plays once); the airflow at the camera's speed
  let song = null, release = null, flight = null, lastWhoosh = -1;
  function soundStart() {
    if (!sound) return;
    const context = world.sound?.context ?? null;
    flight = createFlightSounds({ context, output: world.sound?.output ?? null, recordings: context ? loadFlightRecordings(context) : null });
    flight.start();
  }
  function soundLoop() {
    if (!sound) return;
    song?.stop?.();
    release?.();
    const clock = world.clock ?? { get time() { return s.time; } };
    song = createSong({ context: world.sound?.context ?? null, output: world.sound?.output ?? null, clock, src: 'djamm.mp3', base: SONG_BASE, ...(world.sound?.createElement ? { createElement: world.sound.createElement } : {}) });
    release = world.sound?.hold?.(song) ?? null;
    song.play(SET_BEAT * BEAT);
    lastWhoosh = -1;
  }
  function soundFrame(t) {
    if (!sound) return;
    if (!release) song?.update?.();
    const c = cameraAt(route, t);
    flight?.setSpeed?.(Math.hypot(c.back, c.up) * 0.9);
    for (const [i, [wt, side]] of WHOOSH.entries()) if (i > lastWhoosh && t >= wt) { lastWhoosh = i; if (t - wt < 0.2) flight?.whoosh?.(side); }
  }
  return { apply, setStage, length: LENGTH, holds: HOLDS, bursts, stats: () => cameraStats(route), soundStart, soundLoop, soundFrame, route, path, groundAt, low: LOW };
}
