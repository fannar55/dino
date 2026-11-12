// Fiðrildadansinn (?chapter=fidrildi3d): a one-minute show for red/cyan glasses (engine/gler.js). Egill only watches. Mosi stands
// in the morning clearing, a little left of the middle, his head at the screen plane; the hero moth comes out of the forest and
// out of the screen, lands on his horn, he sneezes it off in a puff of pollen that blows at the viewer, a swarm of pale butterflies
// rises from the grass and dances in a spiral round the view axis, out of the screen and back, Þórseðla's head comes down through
// them and out, a few sit on it, and at the end the moth settles in the exact middle of the frame at the screen plane. "Aftur"
// plays it again.
//
// Depth is laid out in the frame, not in the world: a point is (u, v, k), u and v its place in the frame (0..1 from the top left)
// and k its depth as a share of D, the zero-parallax distance (Mosi's head). Flights are timed keys of (u, v, k), smoothed
// (Hermite, Catmull-Rom tangents, still at the ends and at the keys marked so), on the scene clock: a seek lands on the frame.
// The parallax at depth k·D is strength·(1/k − 1) of the screen's width (near positive): k 0.5 is one strength.
//
// Comfort (from the owner's glasses test, 2026-11-11, and the museum): one thing comes out at a time, slowly, with a rest at the
// screen plane between; nothing nearer than k 0.6 leaves the middle 60 % of the frame; nothing in front of the screen touches an
// edge; the ground at the bottom edge is no nearer than 0.8 D; the last picture rests at k 1. Pale and green-yellow in front.
//
// Captures: ?chapter=fidrildi3d&t=<s> (seconds of the show). world.dans.measure() gives the parallax table (both eye cameras).
import * as THREE from 'three';
import { chapter as grunnur } from './grunnur.js';
import { onBone, POINTS, atsjuOf } from './kafli1.js';
import { HERO, COLOURS } from '../world/forest/butterflies.js';
import { createSwarm } from '../world/forest/swarm.js';
import { pollenBurst } from '../world/props/pollen.js';
import { glints, run, sparkleTrail, sparkleBurst, SPARKLE_LOOK } from '../world/props/sparkles.js';

const BUTTON = 'font:800 clamp(24px,3.4vw,34px)/1 Nunito,sans-serif;padding:14px 34px;border:0;border-radius:999px;cursor:pointer;pointer-events:auto';
const CARD = 'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);z-index:5;margin:0;padding:14px 22px;border-radius:16px;background:rgba(255,255,255,.92);color:#2b2b2b;font:700 clamp(22px,3vw,30px)/1.3 Nunito,sans-serif;text-align:center;max-width:80vw;display:flex;flex-direction:column;align-items:center;gap:14px';

// The start: a big picture of the red/cyan glasses in the middle, breathing about once a second (gently under less motion); a tap
// on it starts the show, and is the touch that lets the sound begin (main.js chapter.startButton: what Byrja does). The picture is
// Openclipart's "Anaglyph Glasses" (public domain, assets/book/CREDITS.md), shown as it is: red on the wearer's left, never mirrored.
// Should it not load (offline before the app has it), main.js shows the Byrja pill instead, so the show never stands stuck.
const GLASSES = new URL('../assets/book/gleraugu-3d.svg', import.meta.url).href;
const GLASSES_STYLE = `
  .gler-start-wrap { position: fixed; inset: 0; z-index: 6; display: grid; place-items: center; align-content: center; gap: 2.4vmin; pointer-events: none; }
  .gler-start-wrap[hidden] { display: none; }
  .gler-start { pointer-events: auto; border: 0; padding: 0; margin: 0; background: none; cursor: pointer; border-radius: 6vmin;
    -webkit-tap-highlight-color: transparent; will-change: transform, opacity; animation: gler-pulse 1s ease-in-out infinite; }
  .gler-start img { display: block; width: min(60vmin, 92vw); height: auto; aspect-ratio: 1764 / 1335; -webkit-user-drag: none;
    filter: drop-shadow(0 0 2.4vmin rgba(255, 250, 215, .82)); }
  .gler-start-line { margin: 0; padding: 6px 16px; border-radius: 12px; background: rgba(255,255,255,.88); color: #2b2b2b;
    font: 700 clamp(17px, 2.2vw, 22px)/1.3 Nunito, sans-serif; text-align: center; }
  @keyframes gler-pulse {
    0%, 100% { transform: scale(1); opacity: .94; }
    50% { transform: scale(1.06); opacity: 1; }
  }
  @keyframes gler-pulse-calm {
    0%, 100% { opacity: .88; }
    50% { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) { .gler-start { animation: gler-pulse-calm 2.4s ease-in-out infinite; } }`;
/** The glasses start, laid on the page hidden, once its picture has loaded; null (main.js: Byrja) when it cannot be. */
function glassesStart(doc) {
  return new Promise(resolve => {
    const wrap = doc.createElement('div');
    wrap.className = 'gler-start-wrap';
    wrap.hidden = true;
    const style = doc.createElement('style');
    style.textContent = GLASSES_STYLE;
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'gler-start';
    const img = doc.createElement('img');
    img.alt = 'Settu upp 3D gleraugun og ýttu hér';
    img.draggable = false;
    button.append(img);
    const line = doc.createElement('p');
    line.className = 'gler-start-line';
    line.textContent = 'Rauða glerið á vinstra auga.';
    wrap.append(style, button, line);
    img.addEventListener('load', () => {
      doc.body.append(wrap);
      resolve({ element: wrap, button });
    }, { once: true });
    img.addEventListener('error', () => resolve(null), { once: true });
    img.src = GLASSES;
  });
}
const CHARS = '../assets/characters/';
const LENGTH = 60; // seconds of the show

// Staging. The camera: a child's eye, still, looking north over the clearing; it tilts up as little as keeps the ground at the
// bottom edge at GROUND_SHARE of D or further. Mosi: his head at D on the ray through MOSI_U, facing the camera.
const CAMERA = [0.4, 0.95, 10.5];
const LOOK = -90; // degrees: the camera looks along -Z
const FOV = 46;
const D_WANTED = 6.8; // metres to Mosi's head
const MOSI_U = 0.36;
const GROUND_SHARE = 0.85;
// Þórseðla: her root far behind, so that her lowered head (lowerHead held part way: the share found for the height below) comes to
// THOR_HEAD in the frame. The two friends further back are depth layers.
const THOR_HEAD = [0.6, 0.6, 0.6]; // her Head bone, which is low in her skull: the skull's top is about 1 m above it
const THOR_SIDE = 38; // degrees her root stands to the right of straight behind her head
const FRIENDS_BACK = { sloedla: { url: 'parasaurolophus.glb', at: [1.5, -12.5] }, kambedla: { url: 'stegosaurus.glb', at: [-8.5, -6] } };
const SWARM = 25;
const SWARM_SCALE = 1.25; // the swarm's butterflies against the clearing's pale ones
const HERO_SCALE = 1.5; // the hero moth's model, scaled up so it reads at the middle of the frame (the owner: "stærð er fín")
// Þórseðla walks in (round 2, the owner: "láttu Þórseðlu ganga inn í myndina"): from deep in the forest off the right of the frame
// to her spot, arriving ARRIVE seconds into the show at the walk clip's own speed (actor.walkTo matches the clip: no sliding).
const THOR_FROM = [[30, -14], [19, -11]]; // world x, z: out of the frame and deep, then the last stretch along her own heading
const THOR_STRAIGHT = 7; // metres of the last stretch, straight along her heading at the spot
const ARRIVE = 42.6;
const THOR_SPEED = 1.3; // m/s asked; walkTo plays the clip faster or slower to match it (state.thorWalkScale says by how much)
// Two more moths of the hero's model (round 2, "bætum við 2 öðrum sem fljúga um"), tinted with the pale butterflies' colours so the
// three can be told apart. They fly lively loops between the viewer and the dinosaurs, k 0.55-0.95, off the hero's line, join the
// swarm's ring and drift back into the forest before the hero settles.
const MOTHS = [
  { name: 'moth-a', tint: COLOURS[1], ring: Math.PI, wig: [0.04, 0.035, 1.9, 2.7, 0.4], keys: [
    [0, 0.2, 0.3, 2.2], [5, 0.22, 0.55, 0.85], [9, 0.2, 0.62, 0.62], [13, 0.22, 0.68, 0.72], [17, 0.2, 0.66, 0.85], [21, 0.17, 0.6, 0.8],
    [25, 0.2, 0.7, 0.9], [29, 0.22, 0.62, 0.7], [44.5, 0.22, 0.45, 0.8], [50, 0.25, 0.36, 0.62], [54, 0.22, 0.4, 0.78],
    [58, 0.18, 0.2, 2.8, 'rest'], [60, 0.18, 0.2, 2.9]] },
  { name: 'moth-b', tint: COLOURS[2], ring: 0, wig: [0.035, 0.04, 2.3, 1.7, 2.1], keys: [
    [0, 0.85, 0.4, 2.5], [5, 0.78, 0.45, 0.9], [9, 0.8, 0.55, 0.62], [13, 0.82, 0.5, 0.7], [17, 0.78, 0.6, 0.8], [21, 0.8, 0.52, 0.66],
    [25, 0.82, 0.6, 0.85], [29, 0.76, 0.5, 0.7], [44.5, 0.8, 0.55, 0.85], [50, 0.8, 0.5, 0.62], [54, 0.78, 0.45, 0.76],
    [58, 0.84, 0.15, 2.8, 'rest'], [60, 0.84, 0.15, 2.9]] },
];
// the swarm's depth through its dance (as a share of D), which the moths' ring follows too
const KC = track([[30, 0, 0, 1.45], [33.5, 0, 0, 1.3], [38, 0, 0, 0.62, 'rest'], [40.5, 0, 0, 0.62, 'rest'], [44.5, 0, 0, 1.15], [50, 0, 0, 1.3]]);
/** A moth's (u, v, k) at show time t: its keys with a lively loop on top, and during the swarm a ring round its edge. */
function mothAt(m, t, out = []) {
  m.track ??= track(m.keys);
  m.track(t, out);
  const [au, av, wu, wv, ph] = m.wig;
  const live = smooth(t / 3) * (1 - smooth((t - 56) / 2));
  out[0] += au * live * Math.sin(wu * t + ph);
  out[1] += av * live * Math.sin(wv * t + ph * 1.7);
  const w = smooth((t - 30.5) / 2) * (1 - smooth((t - 43.5) / 2));
  if (w > 0) {
    const turn = m.ring + (2 * Math.PI * (t - 30)) / 8;
    const kc = KC(t, [])[2];
    out[0] = lerp(out[0], 0.53 + 0.3 * Math.cos(turn), w);
    out[1] = lerp(out[1], 0.47 + 0.26 * Math.sin(turn), w);
    out[2] = lerp(out[2], Math.max(0.55, kc + 0.05), w);
  }
  return out;
}

const TEXT = {
  k1_mosi_hum: 'Mm, mm-mm-mm, mm-mm-mmm… mm-mm-mm, mmm.',
  k1_mosi_tickle: 'Hí, hí, það kitlar!',
  k1_mosi_sneeze: 'A… a… atsjú!',
};

const clamp01 = x => Math.min(1, Math.max(0, x));
const smooth = x => { const k = clamp01(x); return k * k * (3 - 2 * k); };
const lerp = (a, b, k) => a + (b - a) * k;
const rad = d => (d * Math.PI) / 180;

/**
 * A smoothed flight through timed keys [t, u, v, k] (or [t, u, v, k, 'rest'] for a key it stops at). Returns (t, out = [])
 * → [u, v, k]: before the first key the first, after the last the last.
 */
export function track(keys) {
  const n = keys.length;
  const tangent = i => {
    if (i === 0 || i === n - 1 || keys[i][4] === 'rest') return [0, 0, 0];
    const a = keys[i - 1], b = keys[i + 1];
    return [1, 2, 3].map(j => (b[j] - a[j]) / (b[0] - a[0]));
  };
  const tangents = keys.map((_, i) => tangent(i));
  return (t, out = []) => {
    if (t <= keys[0][0]) { out[0] = keys[0][1]; out[1] = keys[0][2]; out[2] = keys[0][3]; return out; }
    if (t >= keys[n - 1][0]) { out[0] = keys[n - 1][1]; out[1] = keys[n - 1][2]; out[2] = keys[n - 1][3]; return out; }
    let i = 0;
    while (keys[i + 1][0] < t) i++;
    const a = keys[i], b = keys[i + 1], h = b[0] - a[0], s = (t - a[0]) / h;
    const h00 = 2 * s ** 3 - 3 * s * s + 1, h10 = s ** 3 - 2 * s * s + s, h01 = -2 * s ** 3 + 3 * s * s, h11 = s ** 3 - s * s;
    for (let j = 0; j < 3; j++) out[j] = h00 * a[j + 1] + h10 * h * tangents[i][j] + h01 * b[j + 1] + h11 * h * tangents[i + 1][j];
    return out;
  };
}

export const chapter = {
  id: 'fidrildi3d',
  title: 'Fiðrildadansinn',
  look: 'morning',
  gler: { panel: false }, // main.js turns the glasses on, without the "3D" settings button (saved settings and ?ut= still hold)
  startButton: glassesStart, // main.js: the glasses picture is the start, one tap, instead of Byrja
  layout: { ...grunnur.layout, leafShadows: true, glade: { shafts: 3 } },
  actors: {
    mosi: { url: CHARS + 'mosi.glb', position: [-1.5, 0, 3], heading: 90 },
    thorsedla: { url: CHARS + 'brontosaurus.glb', position: [0, 0, -6], heading: 90 },
    ...Object.fromEntries(Object.entries(FRIENDS_BACK).map(([n, f]) => [n, { url: CHARS + f.url, position: [f.at[0], 0, f.at[1]], heading: 90 }])),
  },
  cast: { mosi: { name: 'Mosi', colour: '#4f5433' } },
  lines: Object.fromEntries(Object.entries(TEXT).map(([id, text]) => [id, { text, audio: id }])),
  startShot: 'show',
  shots: {
    show: { position: CAMERA, target: [CAMERA[0], CAMERA[1] + 1.2, CAMERA[2] - 10], fov: FOV },
  },

  *script(s) {
    const mosiActor = s.actor('mosi');
    const world = mosiActor.raw.world;
    const { camera, gler, director } = world;
    const mosi = mosiActor.raw;
    const thor = s.actor('thorsedla').raw;
    const butterflies = world.forest?.butterflies;
    const v = new THREE.Vector3();
    const probeCam = new THREE.PerspectiveCamera();

    // ---- the frame's geometry ----
    const depthOf = (cam, p) => -v.copy(p).applyMatrix4(cam.matrixWorldInverse).z;
    function groundEdgeDepth(cam) {
      const dir = new THREE.Vector3(0, -1, 0.5).unproject(cam).sub(cam.position).normalize();
      if (dir.y > -0.01) return Infinity;
      let t = (0 - cam.position.y) / dir.y;
      for (let i = 0; i < 3; i++) t = (world.heightAt(cam.position.x + dir.x * t, cam.position.z + dir.z * t) - cam.position.y) / dir.y;
      return t * dir.dot(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion));
    }
    function poseCam(cam, position, target, fov) {
      cam.fov = director.effectiveFov(fov);
      cam.aspect = camera.aspect;
      cam.near = camera.near;
      cam.far = camera.far;
      cam.position.copy(position);
      cam.up.set(0, 1, 0);
      cam.lookAt(target);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      return cam;
    }
    const plane = () => gler?.plane ?? D0;
    /** The world point at (u, v) in the frame, k·D deep (view-space depth), from `cam` (the show's camera unless given). */
    function framePoint(u, vv, k, out = new THREE.Vector3(), cam = camera, d = plane()) {
      const tanV = Math.tan(rad(cam.fov) / 2);
      const depth = k * d;
      out.set((2 * u - 1) * tanV * cam.aspect * depth, (1 - 2 * vv) * tanV * depth, -depth);
      return out.applyMatrix4(cam.matrixWorld);
    }
    /** (u, v, k) of a world point. */
    function frameOf(p, cam = camera, d = plane()) {
      const depth = depthOf(cam, p);
      const ndc = v.copy(p).project(cam);
      return [0.5 + 0.5 * ndc.x, 0.5 - 0.5 * ndc.y, depth / d];
    }

    // ---- the camera's tilt and Mosi's place, solved once ----
    const camPos = new THREE.Vector3(...CAMERA);
    const ahead = [Math.cos(rad(LOOK)), Math.sin(rad(LOOK))];
    let pitch = 0;
    for (; pitch < 30; pitch += 0.25) {
      const target = camPos.clone().add(new THREE.Vector3(ahead[0], Math.tan(rad(pitch)), ahead[1]));
      if (groundEdgeDepth(poseCam(probeCam, camPos, target, FOV)) >= GROUND_SHARE * D_WANTED) break;
    }
    const camTarget = camPos.clone().add(new THREE.Vector3(ahead[0] * 10, Math.tan(rad(pitch)) * 10, ahead[1] * 10));
    poseCam(probeCam, camPos, camTarget, FOV);
    // Mosi: facing the camera, moved until his head is on the ray through MOSI_U at D_WANTED (his idle pose, measured)
    mosi.play('idle', { fade: 0 });
    const head = new THREE.Vector3();
    let mx = -1.5, mz = camPos.z - D_WANTED - 1;
    for (let i = 0; i < 6; i++) {
      const heading = Math.atan2(camPos.z - mz, camPos.x - mx) * 180 / Math.PI;
      mosi.place(mx, mz, heading);
      mosi.mixer.update(0);
      mosi.root.updateMatrixWorld(true);
      mosi.headPosition(head);
      const want = framePoint(MOSI_U, frameOf(head, probeCam, D_WANTED)[1], 1, new THREE.Vector3(), probeCam, D_WANTED);
      mx += want.x - head.x;
      mz += want.z - head.z;
    }
    mosi.root.updateMatrixWorld(true);
    let D0 = depthOf(probeCam, mosi.headPosition(head)); // the screen plane for the whole show (before the glasses' pop share)
    const horn = onBone(mosi, ...POINTS.mosiHorn);
    const sneezeAt = onBone(mosi, ...POINTS.mosiSneeze);

    // Þórseðla: the share of lowerHead that brings her head to THOR_HEAD's height, and her root placed so it comes to THOR_HEAD
    const thorClip = thor.clips.get('lowerHead');
    function thorHeadLocal(at) {
      thor.place(0, 0, 0);
      const action = thor.play('lowerHead', { fade: 0, timeScale: 0 });
      action.time = thorClip.duration * at;
      thor.mixer.update(0);
      thor.root.updateMatrixWorld(true);
      return thor.headPosition(new THREE.Vector3()); // heading 0: forward is +X
    }
    const thorWant = framePoint(...THOR_HEAD, new THREE.Vector3(), probeCam, D0);
    let thorAt = 0.62;
    for (let at = 0.3; at <= 1.0001; at += 0.02) {
      if (Math.abs(thorHeadLocal(at).y - thorWant.y) < Math.abs(thorHeadLocal(thorAt).y - thorWant.y)) thorAt = at;
    }
    const thorLocal = thorHeadLocal(thorAt); // x ahead of her root, y up, z to the side
    // her root behind the head and THOR_SIDE degrees to the right, so her body stands off to the right behind Mosi, not over him;
    // she faces so that her head comes to THOR_HEAD (the head's offset from her root, turned with her)
    const reach = Math.hypot(thorLocal.x, thorLocal.z);
    const side = rad(THOR_SIDE);
    const tx = thorWant.x + reach * Math.sin(side), tz = thorWant.z - reach * Math.cos(side);
    const thorHeading = (Math.atan2(thorWant.z - tz, thorWant.x - tx) - Math.atan2(thorLocal.z, thorLocal.x)) * 180 / Math.PI;
    const fwd = [Math.cos(rad(thorHeading)), Math.sin(rad(thorHeading))];
    const thorPath = [...THOR_FROM, [tx - fwd[0] * THOR_STRAIGHT, tz - fwd[1] * THOR_STRAIGHT], [tx, tz]];
    const thorStart = () => {
      const [a, b] = thorPath;
      thor.place(a[0], a[1], Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI);
      thor.play('idle', { fade: 0 });
      thor.mixer.update(0);
    };
    thorStart();
    const thorLength = new THREE.CatmullRomCurve3(thorPath.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal').getLength();

    for (const [n, f] of Object.entries(FRIENDS_BACK)) {
      const a = s.actor(n).raw;
      a.place(f.at[0], f.at[1], Math.atan2(camPos.z - f.at[1], camPos.x - f.at[0]) * 180 / Math.PI + (n === 'sloedla' ? 25 : -25));
      a.play('idle', { fade: 0 });
      a.lookAt('camera', { weight: 0.35 });
    }
    mosi.lookAt('camera', { weight: 0.6 });

    const shot = { position: camPos.toArray(), target: camTarget.toArray(), fov: FOV, label: 'fidrildadans' };
    yield s.camera.cut(shot, { check: false });
    if (butterflies?.hero?.group) butterflies.hero.group.scale.setScalar(HERO_SCALE);
    for (const m of MOTHS) {
      if (!butterflies?.addHero) break;
      m.handle ??= butterflies.addHero(m.name, { tint: m.tint });
      m.handle.group.scale.setScalar(HERO_SCALE);
    }
    // the moths' flights, checked once over the whole show: their nearest and farthest, and no edge while in front of the screen
    const mothCheck = MOTHS.map(m => {
      let near = Infinity, far = 0, edge = 0, fastest = 0, last = null;
      for (let t = 0; t <= LENGTH; t += 0.05) {
        const [u, vv, k] = mothAt(m, t);
        near = Math.min(near, k); far = Math.max(far, k);
        if (k < 1 && (u < 0.12 || u > 0.88 || vv < 0.12 || vv > 0.88)) edge++;
        if (last != null) fastest = Math.max(fastest, Math.abs(k - last) / 0.05);
        last = k;
      }
      return { name: m.name, near: +near.toFixed(3), far: +far.toFixed(3), edgeSamples: edge, fastestK: +fastest.toFixed(3) };
    });

    // ---- the swarm (one draw call), the state for probes ----
    const swarm = createSwarm({ count: SWARM, scale: SWARM_SCALE, seed: 'fidrildadans', uWindTime: world.wind?.uniforms?.uWindTime, antialias: true });
    world.scene.add(swarm.mesh);
    const state = { D0, pitch, thorAt, mosi: [mx, mz], thor: [tx, tz, thorHeading], thorLength, mothCheck, swarm: [], time: 0 };
    world.dans = { state, framePoint, frameOf, measure };

    // ---- the zero-parallax plane, every frame (jumped: a seek lands exactly) ----
    let T0 = null;
    const tau = () => (T0 == null ? 0 : s.time - T0);
    function* keepPlane() {
      for (;;) {
        gler?.setPlane(D0, { jump: true });
        camera.updateMatrixWorld();
        state.time = tau();
        if (state.walking) walkProbe();
        yield;
      }
    }
    s.after(0, () => keepPlane());

    const uvk2 = [];
    // While she walks: the nearest of her bones in the frame, and the nearest of those at or past a frame edge while some of her is in it.
    function walkProbe() {
      let near = Infinity, edge = Infinity, inside = false;
      const seen = [];
      thor.model.traverse(o => {
        if (!o.isBone) return;
        const f = frameOf(o.getWorldPosition(new THREE.Vector3()));
        if (f[2] > 0) seen.push(f);
      });
      for (const [u, vv, k] of seen) {
        if (u > 0 && u < 1 && vv > 0 && vv < 1) { inside = true; near = Math.min(near, k); }
      }
      if (inside) {
        for (const [u, vv, k] of seen) if (u < 0.04 || u > 0.96 || vv < 0.04 || vv > 0.96) edge = Math.min(edge, k);
        state.firstIn ??= +tau().toFixed(2);
      }
      state.walkNear = Math.min(state.walkNear ?? Infinity, near);
      state.walkEdge = Math.min(state.walkEdge ?? Infinity, edge);
    }
    // Her footfalls: a heavy step as each foot comes down (as Mosi's in chapter 1: the foot drops back to its standing height),
    // louder as she comes nearer.
    const thorFeet = [];
    thor.model.traverse(o => { if (o.isBone && /foot/i.test(o.name) && !/toe|end/i.test(o.name)) thorFeet.push(o); });
    state.thorFeet = thorFeet.map(o => o.name);
    function* footfalls() {
      const p = new THREE.Vector3();
      const lift = foot => foot.getWorldPosition(p).y - world.heightAt(p.x, p.z);
      const rest = thorFeet.map(lift);
      const down = thorFeet.map(() => true);
      for (;;) {
        thorFeet.forEach((foot, i) => {
          const up = lift(foot) - rest[i];
          if (down[i] && up > 0.05) down[i] = false;
          else if (!down[i] && up < 0.012) {
            down[i] = true;
            const d = thor.root.position.distanceTo(camera.position);
            const loud = Math.min(1.4, Math.max(0, (40 - d) / 22) * 1.4);
            if (loud > 0.05) s.sfx('step', { level: loud });
          }
        });
        yield;
      }
    }

    // ---- the start: the glasses (chapter.startButton below), which main.js shows and whose tap begins the show ----
    yield s.ready();

    for (;;) {
      yield* show();
      // the end card: one button, which plays it again (in the book's frame its close button is the way out)
      const end = document.createElement('div');
      end.style.cssText = CARD;
      const button = document.createElement('button');
      button.textContent = 'Aftur';
      button.style.cssText = BUTTON + ';background:#6f8f3a;color:#fff';
      let again = false;
      button.addEventListener('click', () => { again = true; });
      end.append(button);
      document.body.append(end);
      try {
        yield s.until(() => again);
      } finally {
        end.remove();
      }
    }

    // ================================================================================================================
    function* show() {
      T0 = s.time;
      const handles = [];
      // reset: Þórseðla upright, the moth far off in the forest, the swarm hidden
      thorStart();
      state.walking = false;
      for (const m of MOTHS) {
        const at = [];
        butterflies?.follow(m.name, out => { mothAt(m, tau(), at); return framePoint(at[0], at[1], at[2], out); });
      }
      const walkAt = ARRIVE - thorLength / THOR_SPEED;
      state.walkAt = +walkAt.toFixed(2);
      handles.push(s.after(walkAt, () => walkIn()));
      for (let i = 0; i < SWARM; i++) swarm.set(i, v.set(0, -50, 0), 0, 0);
      const heroKeys = track([
        [0, 0.7, 0.36, 3.4], [6, 0.68, 0.38, 3.0, 'rest'],
        [9.5, 0.47, 0.4, 1.15], // past Mosi's horn
        [12, 0.5, 0.46, 0.7], [14.5, 0.5, 0.47, 0.48, 'rest'], // slowly out of the screen to the middle
      ]);
      const uvk = [];
      const hover = t => { const e = smooth((t - 14) / 0.8) * (1 - smooth((t - 17.2) / 0.6)); return [0.02 * Math.sin(2.2 * (t - 14)) * e, 0.012 * Math.sin(4.4 * (t - 14)) * e]; };
      const heroPath = out => {
        const t = tau();
        heroKeys(t, uvk);
        const [du, dv] = hover(t);
        return framePoint(uvk[0] + du, uvk[1] + dv, uvk[2], out);
      };
      butterflies?.follow(HERO, heroPath);
      state.hero = () => butterflies?.hero?.group.getWorldPosition(new THREE.Vector3());

      // the motes: pale specks at many depths, in front of the screen only within the middle of the frame
      const motes = moteCloud();
      handles.push(motes);

      yield s.fade(1, 0);
      s.after(0.2, () => s.fade(0, 2.5));
      s.after(0.8, () => s.say('mosi', 'k1_mosi_hum', { hold: 0 }));
      yield s.until(() => tau() >= 6);

      // 6-18: the moth comes out
      s.sfx('butterfly');
      yield s.until(() => tau() >= 14);
      s.sfx('star');
      handles.push(sparkleTrail(world, () => butterflies.hero.group.getWorldPosition(new THREE.Vector3()), { duration: 3.4, count: 46, life: 0.9, colour: '#fff0b8', size: 0.07, seed: 'dans trail' }));
      yield s.until(() => tau() >= 17.4);
      // back in, onto his horn
      butterflies?.land(horn, { name: HERO, duration: 3.2 });
      yield s.until(() => tau() >= 21.2);

      // 18-30: tickle, sneeze, the pollen blows out at the viewer and the moth is blown off
      yield s.say('mosi', 'k1_mosi_tickle', { hold: 0.2 });
      const atsju = atsjuOf(s.lineMouth('k1_mosi_sneeze'));
      s.after(atsju, () => {
        const from = sneezeAt(new THREE.Vector3());
        const to = framePoint(0.47, 0.5, 0.4, new THREE.Vector3());
        state.pollen = { from: from.clone(), to: to.clone() };
        s.sfx('blow');
        blowOff();
        return pollenBurst(world, from, { count: 46, duration: 2.6, size: 0.16, spread: from.distanceTo(to), direction: to.clone().sub(from), cone: 0.14, colour: '#e9e27a', seed: 'dans pollen' });
      });
      yield s.say('mosi', 'k1_mosi_sneeze', { hold: 0.2 });
      yield s.until(() => tau() >= 29.5);

      // 30-45: the swarm rises from the grass and dances
      s.sfx('butterfly');
      const swarmRun = dance();
      s.after(Math.max(0, 36 - tau()), () => { mosi.lookAt('thorsedla.head', { weight: 0.45 }); return s.wait(0); }); // he glances at her as she comes
      s.after(Math.max(0, 43.8 - tau()), () => { mosi.lookAt('camera', { weight: 0.6 }); return s.wait(0); });
      yield s.until(() => tau() >= 45);

      // 45-55: Þórseðla's head comes down through them and out
      s.sfx('float');
      const lower = thor.play('lowerHead', { fade: 0.6 });
      const down = thorClip.duration * thorAt;
      yield s.until(() => tau() >= 45 + down);
      lower.setEffectiveTimeScale(0);
      state.thorHeld = tau();
      yield s.until(() => tau() >= 53.2);
      lower.setEffectiveTimeScale(-1); // and back up the way it came
      state.thorUp = tau();

      // 55-60: the butterflies drift away; the moth comes to the exact middle at the screen plane and settles
      yield s.until(() => tau() >= 55.2);
      const centre = out => framePoint(0.5, 0.5, 1, out);
      butterflies?.land(centre, { name: HERO, duration: 3.4 });
      yield s.until(() => tau() >= 53.2 + down);
      thor.play('idle', { fade: 0.5 });
      yield s.until(() => tau() >= 57);
      s.sun.wave();
      yield s.until(() => tau() >= 58.8);
      s.sfx('star');
      sparkleBurst(world, centre(new THREE.Vector3()), { count: 18, duration: 1.2, size: 0.12, spread: 0.35, colour: '#fff3c0', seed: 'dans end' });
      yield s.until(() => tau() >= LENGTH - 0.6);
      yield s.fade(1, 1.2);
      swarmRun.cancel?.();
      for (const h of handles) h?.cancel?.();
    }

    // Þórseðla walks in from the forest to her spot and turns the last degrees to her heading, her footfalls heard all the way.
    function* walkIn() {
      state.walking = true;
      const steps = s.after(0, () => footfalls());
      const walk = thor.walkTo(thorPath.slice(1), { speed: THOR_SPEED, turnRate: 30 });
      state.thorWalkScale = +(thor.mixer._actions.find(a => a.getClip() === thor.clips.get('walk'))?.getEffectiveTimeScale() ?? 0).toFixed(3);
      try {
        yield walk;
        state.arrived = +tau().toFixed(2);
        yield thor.turnTo(thorHeading);
        thor.place(tx, tz, thorHeading); // exactly the solved spot (a turn on the spot may leave her a centimetre off)
        state.settled = +tau().toFixed(2);
      } finally {
        state.walking = false;
        steps.cancel();
      }
    }

    // The moth blown off the horn: up and back into the trees, then waiting there, small, until the end.
    function blowOff() {
      const start = frameOf(horn(new THREE.Vector3()));
      const t0 = tau();
      const keys = track([[t0, ...start], [t0 + 2.4, start[0] + 0.12, 0.26, 1.7], [t0 + 6, 0.56, 0.14, 3.0, 'rest'], [52, 0.58, 0.15, 3.0], [55, 0.56, 0.16, 2.9]]);
      butterflies?.follow(HERO, out => {
        const t = tau();
        keys(t, uvk2);
        const w = t > t0 + 6 ? 0.025 : 0;
        return framePoint(uvk2[0] + w * Math.sin(0.9 * t), uvk2[1] + w * 0.6 * Math.sin(1.7 * t), uvk2[2], out);
      });
    }

    // The motes: one set of glints that lives through the show, fading in over the first seconds.
    function moteCloud() {
      const count = 90;
      const set = glints(world, {
        count, life: 85, spread: 0.6, fall: 0, size: 0.045, colour: '#fff6d6', seed: 'dans motes',
        look: { ...SPARKLE_LOOK, star: 0, glow: 0.8, falloff: 3, twinkle: 1, rise: 0.5, drift: [0.25, -0.15] },
      });
      const random = mulberry(91);
      const p = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        const k = 0.7 + 3.3 * random() ** 1.4; // more of them nearer
        const edge = k < 1 ? 0.3 : 0.05; // in front of the screen only in the middle of the frame
        framePoint(edge + (1 - 2 * edge) * random(), edge + (1 - 2 * edge) * random(), k, p);
        set.position.set([p.x, p.y, p.z], i * 3);
        set.birth[i] = 0;
      }
      state.motes = set;
      return run(world, set, LENGTH + 2, 'dans motes');
    }

    // The swarm: rising from the grass behind Mosi (30-33.5), a spiral round the view axis, one turn in 8 s, out of the screen to k
    // 0.5 at the nearest (38-40.5) and back behind it; four sit on Þórseðla's head (48.5-55); all drift away into the trees (55-59.5).
    function dance() {
      const random = mulberry(25);
      const each = [];
      const p = new THREE.Vector3();
      for (let i = 0; i < SWARM; i++) {
        const kg = 1.15 + 0.5 * random();
        framePoint(0.25 + 0.55 * random(), 0.5, kg, p);
        p.y = world.heightAt(p.x, p.z) + 0.06;
        each.push({
          ground: p.clone(), birth: 30 + 0.14 * i, phase: (i / SWARM) * Math.PI * 2 + 0.3 * random(),
          radius: 0.26 + 0.22 * random(), dk: (random() - 0.5) * 0.2, bob: random() * 6.28,
          sit: [0, 6, 12, 18].indexOf(i), // which of the four sits on Þórseðla's head, or -1
          far: [0.15 + 0.7 * random(), 0.15 + 0.35 * random(), 3 + 0.8 * random()],
          from: new THREE.Vector3(), yaw: 0,
        });
      }
      const kc = [];
      const thorHead = new THREE.Vector3();
      const right = new THREE.Vector3();
      const spiral = (b, t, out) => {
        KC(t, kc);
        const turn = b.phase + (2 * Math.PI * (t - 30)) / 8;
        const k = Math.max(0.52, kc[2] + b.dk);
        const r = b.radius * (k < 1 ? 1 : 1 + 0.4 * (k - 1)); // wider behind the screen
        const x = 0.06 + r * Math.cos(turn) / camera.aspect, y = 0.05 + r * Math.sin(turn);
        return framePoint(0.5 + 0.5 * x, 0.5 - 0.5 * y + 0.012 * Math.sin(3.1 * t + b.bob), k, out);
      };
      const onHead = (b, out) => {
        thor.headPosition(thorHead);
        right.set(1, 0, 0).applyQuaternion(camera.quaternion);
        return out.copy(thorHead).addScaledVector(right, [-0.45, 0.15, -0.15, 0.4][b.sit]).add(v.set(0, [0.85, 0.98, 1.0, 0.8][b.sit], 0));
      };
      const at = (b, t, out) => {
        if (t < b.birth) return out.copy(b.ground);
        spiral(b, t, out);
        if (t < b.birth + 3) {
          const k = smooth((t - b.birth) / 3);
          const lift = Math.sin(Math.PI * k) * 0.5;
          out.lerpVectors(b.ground, out, k);
          out.y += lift;
        }
        if (b.sit >= 0 && t >= 48.5 + 0.5 * b.sit) {
          const k = smooth((t - 48.5 - 0.5 * b.sit) / 2.4);
          out.lerp(onHead(b, p), k);
        }
        if (t >= 55 + 0.06 * (b.phase * 4)) {
          const t0 = 55 + 0.06 * (b.phase * 4);
          if (b.leaveAt !== t0) { b.leaveAt = t0; }
          const k = smooth((t - t0) / 4.2);
          const away = framePoint(b.far[0], b.far[1], b.far[2], p);
          out.lerp(away, k);
        }
        return out;
      };
      const a = new THREE.Vector3(), c = new THREE.Vector3();
      function* fly() {
        for (;;) {
          const t = tau();
          state.swarm.length = 0;
          for (let i = 0; i < SWARM; i++) {
            const b = each[i];
            at(b, t, a);
            at(b, t + 0.05, c);
            const dx = c.x - a.x, dz = c.z - a.z;
            if (Math.hypot(dx, dz) > 2e-4) b.yaw = Math.atan2(dz, dx);
            const sitting = t < b.birth || (b.sit >= 0 && t >= 48.5 + 0.5 * b.sit + 2.4 && t < 55 + 0.06 * (b.phase * 4));
            const flap = t < b.birth ? 1.25 : sitting ? 0.7 + 0.45 * Math.sin(1.6 * t + b.bob) : -1;
            const size = smooth((t - 27) / 1.5) * (1 - smooth((t - 57.6) / 1.8));
            swarm.set(i, a, b.yaw, size, flap);
            state.swarm.push(a.toArray());
          }
          yield;
        }
      }
      return s.after(0, () => fly());
    }

    // ---- the parallax table: world points through both eye cameras (share of the screen's width; near is positive) ----
    function measure() {
      const eyes = gler?.eyes;
      if (!eyes) return null;
      const strength = gler.settings.strength;
      const row = (name, p) => {
        if (!p) return { name, missing: true };
        const l = p.clone().project(eyes[0]).x, r = p.clone().project(eyes[1]).x;
        const [u, vv, k] = frameOf(p);
        return { name, u: +u.toFixed(3), v: +vv.toFixed(3), k: +k.toFixed(3), parallax: +((l - r) / 2).toFixed(4), formula: +(strength * (1 / k - 1)).toFixed(4) };
      };
      const rows = [];
      rows.push(row('mosi head', mosi.headPosition(new THREE.Vector3())));
      rows.push(row('hero', state.hero?.()));
      for (const m of MOTHS) rows.push(row(m.name, m.handle?.group.getWorldPosition(new THREE.Vector3())));
      rows.push(row('thorsedla head', thor.headPosition(new THREE.Vector3())));
      if (state.pollen) rows.push(row('pollen farthest reach', state.pollen.to)); // the nearest a grain can come: full reach along the cone's axis
      if (state.swarm.length) {
        const pts = state.swarm.map(a => new THREE.Vector3(...a)).filter(q => frameOf(q)[2] > 0.05);
        pts.sort((a2, b2) => frameOf(a2)[2] - frameOf(b2)[2]);
        rows.push(row('swarm nearest', pts[0]));
        rows.push(row('swarm farthest', pts[pts.length - 1]));
      }
      // the ground at the bottom edge, in the middle
      const dir = new THREE.Vector3(0, -1, 0.5).unproject(camera).sub(camera.position).normalize();
      const tg = (world.heightAt(camera.position.x, camera.position.z) - camera.position.y) / dir.y;
      rows.push(row('ground bottom edge', camera.position.clone().addScaledVector(dir, tg)));
      // comfort: of each actor's bones, the nearest outside the middle 60 % of the frame and the nearest at or past an edge
      const comfort = {};
      for (const [n, a] of [['mosi', mosi], ['thorsedla', thor]]) {
        let mid = Infinity, edge = Infinity;
        a.model.traverse(o => {
          if (!o.isBone) return;
          const [u, vv, k] = frameOf(o.getWorldPosition(new THREE.Vector3()));
          if (k <= 0) return;
          const out60 = Math.abs(u - 0.5) > 0.3 || Math.abs(vv - 0.5) > 0.3;
          const atEdge = u < 0.03 || u > 0.97 || vv < 0.03 || vv > 0.97;
          if (out60 && !atEdge) mid = Math.min(mid, k);
          if (atEdge && u > -0.3 && u < 1.3 && vv > -0.3 && vv < 1.3) edge = Math.min(edge, k);
        });
        comfort[n] = { outsideMiddle: +mid.toFixed(3), atEdge: +edge.toFixed(3) };
      }
      const walk = { walkAt: state.walkAt, firstIn: state.firstIn, arrived: state.arrived, settled: state.settled, near: state.walkNear, edge: state.walkEdge, scale: state.thorWalkScale, length: +thorLength.toFixed(2), feet: state.thorFeet, at: thor.root.position.toArray().map(x => +x.toFixed(3)) };
      return { t: state.time, D: plane(), rows, comfort, walk, moths: mothCheck };
    }
  },
};

// A small seeded stream (mulberry32), so every run of the show is the same.
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
