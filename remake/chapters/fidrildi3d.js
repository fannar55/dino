// Fiðrildadansinn (?chapter=fidrildi3d): a one-minute show for red/cyan glasses (engine/gler.js). Egill only watches. Mosi stands
// in the morning clearing, a little left of the middle, his head at the screen plane; the hero moth comes out of the forest and
// out of the screen, lands on his horn, he sneezes it off in a puff of pollen that blows at the viewer, a swarm of pale butterflies
// rises from the grass and dances in a spiral round the view axis, out of the screen and back, Þórseðla's head comes down through
// them and out, a few sit on it, and at the end the moth settles in the exact middle of the frame at the screen plane. "Aftur"
// plays it again, "Hætta" leaves.
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
import { createShell } from '../engine/shell.js';
import { createClipProbe, bodyMesh } from '../engine/clip-probe.js';
import { leaveShow } from '../engine/book/show-player.js';
import { plantVolumes, reachInto } from '../engine/tree-probe.js';
import { WALK } from './fidrildi3d-walk.js';

const BUTTON = 'font:800 clamp(24px,3.4vw,34px)/1 Nunito,sans-serif;padding:14px 34px;border:0;border-radius:999px;cursor:pointer;pointer-events:auto';
// the end card's second choice (round 6, the owner: "þegar sena endar þá er bara hægt að velja spila aftur, en ekki hætta"): smaller
// and quieter than "Aftur", which stays the first, but as tall (the row stretches both), so it is as easy to hit
const QUIT = 'font:800 clamp(19px,2.5vw,25px)/1 Nunito,sans-serif;padding:14px 26px;border:3px solid #6f8f3a;border-radius:999px;cursor:pointer;pointer-events:auto;background:#fff;color:#4f6a25';
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
    -webkit-tap-highlight-color: transparent; animation: gler-pulse 1s ease-in-out infinite; }
  .gler-start img { display: block; width: min(60vmin, 92vw); height: auto; aspect-ratio: 1764 / 1335; -webkit-user-drag: none; }
  .gler-start-line { margin: 0; padding: 6px 16px; border-radius: 12px; background: rgba(255,255,255,.88); color: #2b2b2b;
    font: 700 clamp(17px, 2.2vw, 22px)/1.3 Nunito, sans-serif; text-align: center; }
  @keyframes gler-pulse {
    0%, 100% { transform: scale(1); filter: drop-shadow(0 0 1.2vmin rgba(255, 250, 215, .45)); }
    50% { transform: scale(1.06); filter: drop-shadow(0 0 4vmin rgba(255, 250, 215, .95)); }
  }
  @keyframes gler-pulse-calm {
    0%, 100% { filter: drop-shadow(0 0 1.2vmin rgba(255, 250, 215, .45)); }
    50% { filter: drop-shadow(0 0 2.6vmin rgba(255, 250, 215, .75)); }
  }
  @media (prefers-reduced-motion: reduce) { .gler-start { animation: gler-pulse-calm 2.4s ease-in-out infinite; } }`;
/** The glasses start, laid on the page hidden, once its picture has loaded; null (main.js: Byrja) when it cannot be. */
/**
 * The end card: "Aftur" (plays it again) and beside it "Hætta" (engine/book/show-player.js leaveShow: closes the book's frame, or
 * goes to the game's start when the show was opened on its own). Returns { element, again, quit } (the two buttons).
 */
export function endCard(doc, { onAgain, onQuit }) {
  const element = doc.createElement('div');
  element.style.cssText = CARD;
  element.className = 'dans-end';
  const row = doc.createElement('div');
  row.style.cssText = 'display:flex;flex-direction:row;align-items:stretch;justify-content:center;gap:18px;flex-wrap:wrap';
  const again = doc.createElement('button');
  again.type = 'button';
  again.textContent = 'Aftur';
  again.style.cssText = BUTTON + ';background:#6f8f3a;color:#fff';
  again.addEventListener('click', () => onAgain());
  const quit = doc.createElement('button');
  quit.type = 'button';
  quit.textContent = 'Hætta';
  quit.style.cssText = QUIT;
  quit.addEventListener('click', () => onQuit());
  row.append(again, quit);
  element.append(row);
  return { element, again, quit };
}

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
// The stage (round 5, the coordinator's 4:3 check): every place of the show (Mosi's, Þórseðla's, every flight's (u, v, k)) is solved
// in one fixed frame, 16:10 with FOV, not in the screen's own: a flight drawn in the screen's frame lands somewhere else beside the
// animals on every shape of screen (the frame's width in metres changes and the bodies do not). The engine keeps the 16:10 width on
// narrower screens and the height on wider ones (director.effectiveFov), so this frame is always inside the screen's.
const STAGE_ASPECT = 16 / 10;
// Þórseðla: her root far behind, so that her lowered head (lowerHead held part way: the share found for the height below) comes to
// THOR_HEAD in the frame. The two friends further back are depth layers.
const THOR_HEAD = [0.6, 0.6, 0.6]; // her Head bone, which is low in her skull: the skull's top is about 1 m above it
const THOR_SIDE = 38; // degrees her root stands to the right of straight behind her head
const FRIENDS_BACK = { sloedla: { url: 'parasaurolophus.glb', at: [1.5, -12.5] }, kambedla: { url: 'stegosaurus.glb', at: [-8.5, -6] } };
const SWARM = 25;
const SWARM_SCALE = 1.25; // the swarm's butterflies against the clearing's pale ones
const HERO_SCALE = 1.5; // the hero moth's model, scaled up so it reads at the middle of the frame (the owner: "stærð er fín")
// Round 5 (the owner: "fiðrildi klippa í gegnum Mosa og Þórseðlu"): every butterfly is kept out of the animals by their shells
// (engine/shell.js), out by its wing's reach and SAFE more (the capsules hold all but a few cm of the skin: shell.test.mjs).
const SWARM_WING = 0.21; // the swarm's wing reach at SWARM_SCALE
const SAFE = 0.08;
const SEAT_LIFT = 0.025; // a sitter's centre over the skull's surface
const SEAT_ABOVE = 0.5; // and the point straight above its seat it comes down from
// Þórseðla walks in (round 2, the owner: "láttu Þórseðlu ganga inn í myndina"): from deep in the forest off the right of the frame
// to her spot, arriving ARRIVE seconds into the show at the walk clip's own speed (actor.walkTo matches the clip: no sliding).
// Round 6 (the owner: "þegar þórseðla lappar inn í mynd á bakvið á klippir haus hennar í gegnum tré"): her head, 8 m up as she
// walks, went through the crown of the edge tree in the frame's top right corner (at 19.2, -15.3) and her body through bushes,
// horsetails, a tree fern and an araucaria out of the frame. The edge trees' crowns close the clearing's right side at her head's
// height but for one narrow gap, south of that tree; she now comes along it, and the place grows without whatever plant her walk
// would still pass through (leaveOut below), whatever the quality plans there. tools/clip-probe.mjs --trees measures it.
export const THOR_FROM = [[35, -12.5], [28, -8.6], [21, -7.0], [16, -6.1]]; // world x, z: out of the frame and deep, then the last stretch along her own heading
// The leave-out follows from the walk itself: WALK (fidrildi3d-walk.js, made by clip-probe.mjs --sweep) holds where her root is
// through the walk and her shell's capsules in her root's frame at a few moments of it; a plant at least LEAVE_LOW m tall (lower
// ones, ferns and flowers, lean away from a character's footprint as the grass does) whose volumes, fitted from its own geometry
// (engine/tree-probe.js), any of those capsules at any of those places would come within LEAVE_MARGIN of is left out of the plan.
const LEAVE_LOW = 1.2;
const LEAVE_MARGIN = 0.15;
export const leftOut = []; // what it took, for the notes and the probe (world.dans.state.leftOut)
// ?skog=heill grows the place whole (for before/after pictures of what the leave-out takes)
const WHOLE = typeof location !== 'undefined' && new URLSearchParams(location.search).get('skog') === 'heill';
export function leaveOut(info, placement) {
  if (WHOLE || !WALK || !placement?.model || info.height < LEAVE_LOW) return false;
  const reach = 14 + info.radius; // her root to her nose or tail tip is under 13 m
  const near = WALK.poses.filter(([x, , z]) => Math.hypot(x - info.x, z - info.z) < reach);
  if (!near.length) return false;
  const plant = plantVolumes(placement);
  const caps = [];
  for (const [x, y, z, yaw] of near) {
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    const at = (lx, ly, lz) => [x + lx * c + lz * sn, y + ly, z - lx * sn + lz * c];
    for (const k of WALK.capsules) caps.push({ a: at(k[0], k[1], k[2]), b: at(k[3], k[4], k[5]), r: k[6] });
  }
  const hit = reachInto(plant, caps, LEAVE_MARGIN);
  if (hit) leftOut.push({ name: info.name, x: +info.x.toFixed(2), z: +info.z.toFixed(2), height: +info.height.toFixed(1), depth: +(hit.depth - LEAVE_MARGIN).toFixed(2), box: plant.box.map(x => +x.toFixed(2)) });
  return Boolean(hit);
}
const THOR_STRAIGHT = 7; // metres of the last stretch, straight along her heading at the spot
const ARRIVE = 42.6;
const THOR_SPEED = 1.3; // m/s asked; walkTo plays the clip faster or slower to match it (state.thorWalkScale says by how much)
// Two more moths of the hero's model (round 2, "bætum við 2 öðrum sem fljúga um"), tinted with the pale butterflies' colours so the
// three can be told apart. They fly lively loops between the viewer and the dinosaurs, k 0.55-0.95, off the hero's line, join the
// swarm's ring and drift back into the forest before the hero settles.
const MOTHS = [
  // round 5: each moth is in the swarm's ring from `ringFrom` to `ringTo` (it was 30.5-43.5 for both): moth-a crosses in front of
  // Mosi's face (k 0.6, his beak is at 0.78) before it joins and both leave while the ring is out in front, not through him and her neck
  { name: 'moth-a', tint: COLOURS[1], ring: Math.PI, ringFrom: 31.5, ringTo: 40.6, wig: [0.04, 0.035, 1.9, 2.7, 0.4], keys: [
    [0, 0.15, 0.3, 2.2], [5, 0.18, 0.55, 0.75], [9, 0.2, 0.62, 0.62], [13, 0.2, 0.66, 0.66], [17, 0.18, 0.64, 0.68], [21, 0.17, 0.6, 0.68],
    [25, 0.17, 0.62, 0.72], [29, 0.2, 0.6, 0.66], [31.5, 0.5, 0.66, 0.6], [42.6, 0.3, 0.55, 0.62], [44.5, 0.17, 0.48, 0.7], [50, 0.25, 0.36, 0.62], [54, 0.2, 0.42, 0.66, 'rest'],
    [58, 0.13, 0.22, 2.8, 'rest'], [60, 0.13, 0.22, 2.9]] }, // round 5: in front of his frill's left edge (k 0.78 was by it) and out wider
  { name: 'moth-b', tint: COLOURS[2], ring: 0, ringFrom: 30.5, ringTo: 40.6, wig: [0.035, 0.04, 2.3, 1.7, 2.1], keys: [
    [0, 0.85, 0.4, 2.5], [5, 0.78, 0.45, 0.9], [9, 0.8, 0.55, 0.62], [13, 0.82, 0.5, 0.7], [17, 0.78, 0.6, 0.8], [21, 0.8, 0.52, 0.66],
    // round 5: from 42.6 high on the right, in front of Þórseðla's neck as it comes down and goes back up (not under her head), and
    // away to the left behind Mosi
    // round 6: from 44.5 low on the right in front of her chest, out of the way her head and neck come down (at 47.9 her neck came
    // down into it, high on the right), and away low in front of Mosi and up his left side into the trees
    [25, 0.82, 0.6, 0.85], [29, 0.76, 0.5, 0.7], [42.6, 0.8, 0.6, 0.66], [44.5, 0.81, 0.75, 0.64], [47, 0.8, 0.82, 0.63],
    [50, 0.8, 0.83, 0.64], [53, 0.81, 0.82, 0.64], [55.2, 0.8, 0.8, 0.64], [56.6, 0.52, 0.82, 0.63], [57.8, 0.2, 0.6, 0.7], [59.2, 0.17, 0.35, 2.4, 'rest'], [60, 0.17, 0.35, 2.5]] },
];
// the swarm's depth through its dance (as a share of D), which the moths' ring follows too; and (round 5) how far right of the
// middle its ring turns: behind the screen and through it it turns right of Mosi, whose head and body are there (k 1-1.6), and in
// the middle only out in front of him
const KC = track([[30, 0.12, 0, 1.45], [33.5, 0.14, 0, 1.3], [36.5, 0.14, 0, 0.8], [37.3, 0.12, 0, 0.69], [38, 0.06, 0, 0.62, 'rest'], [40.5, 0.06, 0, 0.62, 'rest'], [41.7, 0.12, 0, 0.68], [43, 0.05, 0, 1.0], [44.5, 0.07, 0, 1.4], [50, 0.07, 0, 1.45]]);
// and (round 5) how far up it turns and how much smaller: once Þórseðla has come (her neck from k 0.6 to 1.25 and her chest at 1.35,
// right of the middle) the ring goes back behind the screen small and high, between Mosi's frill and her back, behind her neck
const RING = track([[30, 0, 0, 0], [41, 0, 0, 0], [43, -0.2, 0.45, 0], [44.5, -0.23, 0.45, 0], [50, -0.23, 0.45, 0]]);
/** A moth's (u, v, k) at show time t: its keys with a lively loop on top, and during the swarm a ring round its edge. */
function mothAt(m, t, out = []) {
  m.track ??= track(m.keys);
  m.track(t, out);
  const [au, av, wu, wv, ph] = m.wig;
  const live = smooth(t / 3) * (1 - smooth((t - 56) / 2));
  out[0] += au * live * Math.sin(wu * t + ph);
  out[1] += av * live * Math.sin(wv * t + ph * 1.7);
  const w = smooth((t - m.ringFrom) / 2) * (1 - smooth((t - m.ringTo) / 2));
  if (w > 0) {
    const turn = m.ring + (2 * Math.PI * (t - 30)) / 8;
    const [du, , kc] = KC(t, []);
    const [dv, shrink] = RING(t, []);
    out[0] = lerp(out[0], 0.53 + du + 0.2 * (1 - shrink) * Math.cos(turn), w); // round 5: 0.3 wide, which took them into Mosi and her
    out[1] = lerp(out[1], 0.47 + dv + 0.2 * (1 - shrink) * Math.sin(turn), w);
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
  layout: { ...grunnur.layout, leafShadows: true, glade: { shafts: 3 }, leaveOut },
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
    const stageCam = new THREE.PerspectiveCamera(); // the stage's fixed frame (STAGE_ASPECT, FOV), from the camera's place

    // ---- the frame's geometry ----
    const depthOf = (cam, p) => -v.copy(p).applyMatrix4(cam.matrixWorldInverse).z;
    function groundEdgeDepth(cam) {
      const dir = new THREE.Vector3(0, -1, 0.5).unproject(cam).sub(cam.position).normalize();
      if (dir.y > -0.01) return Infinity;
      let t = (0 - cam.position.y) / dir.y;
      for (let i = 0; i < 3; i++) t = (world.heightAt(cam.position.x + dir.x * t, cam.position.z + dir.z * t) - cam.position.y) / dir.y;
      return t * dir.dot(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion));
    }
    function poseCam(cam, position, target, fov, stage = false) {
      cam.fov = stage ? fov : director.effectiveFov(fov);
      cam.aspect = stage ? STAGE_ASPECT : camera.aspect;
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
    /** The world point at (u, v) in the stage's frame (stageCam unless `cam` is given), k·D deep (view-space depth). */
    function framePoint(u, vv, k, out = new THREE.Vector3(), cam = stageCam, d = plane()) {
      const tanV = Math.tan(rad(cam.fov) / 2);
      const depth = k * d;
      out.set((2 * u - 1) * tanV * cam.aspect * depth, (1 - 2 * vv) * tanV * depth, -depth);
      return out.applyMatrix4(cam.matrixWorld);
    }
    /** (u, v, k) of a world point, in the screen's own frame (the show's camera unless `cam` is given: stageCam for the stage's). */
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
    // the stage's frame: the same tilt solved at the stage's shape (the screen's camera tilts as its own shape needs for the ground)
    let stagePitch = 0;
    for (; stagePitch < 30; stagePitch += 0.25) {
      const target = camPos.clone().add(new THREE.Vector3(ahead[0], Math.tan(rad(stagePitch)), ahead[1]));
      if (groundEdgeDepth(poseCam(stageCam, camPos, target, FOV, true)) >= GROUND_SHARE * D_WANTED) break;
    }
    poseCam(stageCam, camPos, camPos.clone().add(new THREE.Vector3(ahead[0] * 10, Math.tan(rad(stagePitch)) * 10, ahead[1] * 10)), FOV, true);
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
      const want = framePoint(MOSI_U, frameOf(head, stageCam, D_WANTED)[1], 1, new THREE.Vector3(), stageCam, D_WANTED);
      mx += want.x - head.x;
      mz += want.z - head.z;
    }
    mosi.root.updateMatrixWorld(true);
    let D0 = depthOf(stageCam, mosi.headPosition(head)); // the screen plane for the whole show (before the glasses' pop share)
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
    const thorWant = framePoint(...THOR_HEAD, new THREE.Vector3(), stageCam, D0);
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
    const seats = skullSeats();

    // The four sitters' seats on the top of her skull (round 5: they sat on a point a world-up offset from her Head bone, which is low
    // in her skull, so they sat inside it). Read off her own posed skin with the head down as it is held, at heading 0 (as
    // thorHeadLocal left her): the crown is the head's vertices within 25 cm of its top; the seats spread across it as the camera sees
    // it (her heading turns her local side into the camera's right), each on the highest vertex there, SEAT_LIFT over it, and are kept
    // in the Head bone's own frame, so they ride the head as it comes up.
    function skullSeats() {
      const headBone = thor.model.getObjectByName('Head');
      const body = bodyMesh(thor);
      body.skeleton.update();
      const bones = body.skeleton.bones;
      const ofHead = new Set();
      headBone.traverse(o => { const j = bones.indexOf(o); if (j >= 0) ofHead.add(j); });
      const si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight;
      const crown = [];
      const p = new THREE.Vector3();
      for (let i = 0; i < si.count; i++) {
        let best = 0, w = -1;
        for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > w) { w = sw.getComponent(i, k); best = si.getComponent(i, k); }
        if (!ofHead.has(best)) continue;
        body.getVertexPosition(i, p).applyMatrix4(body.matrixWorld);
        crown.push(p.clone());
      }
      const top = Math.max(...crown.map(q => q.y));
      const h = rad(thorHeading);
      const across = q => q.x * Math.cos(h) - q.z * Math.sin(h); // world x once she is turned to her heading
      const ridge = crown.filter(q => q.y > top - 0.25);
      const lo = Math.min(...ridge.map(across)), hi = Math.max(...ridge.map(across));
      // as the four sat before (to the camera's right of her head: -0.45, 0.15, -0.15, 0.4 m), across the crown
      return [0.12, 0.62, 0.38, 0.88].map(f => {
        const want = lo + f * (hi - lo);
        let seat = null;
        for (const q of ridge) if (Math.abs(across(q) - want) < 0.06 && (!seat || q.y > seat.y)) seat = q;
        seat ??= ridge.reduce((a, q) => (Math.abs(across(q) - want) < Math.abs(across(a) - want) ? q : a));
        return { bone: headBone, local: headBone.worldToLocal(seat.clone().add(new THREE.Vector3(0, SEAT_LIFT, 0))) };
      });
    }
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

    // ---- round 5: the shells every butterfly keeps out of, updated each frame after the actors (an effect) ----
    const SHELLED = ['mosi', 'thorsedla', ...Object.keys(FRIENDS_BACK)];
    const shells = SHELLED.map(n => createShell(THREE, s.actor(n).raw));
    const forward = [0, 0, -1];
    const look = new THREE.Vector3();
    // what the shells cost, for the notes: milliseconds spent updating and pushing, and frames (state.shellCost)
    const cost = { ms: 0, frames: 0, pushes: 0 };
    function updateShells() {
      const t0 = performance.now();
      stageCam.getWorldDirection(look).toArray(forward); // the stage's: the same push on every shape of screen
      for (const shell of shells) shell.update();
      cost.frames++;
      cost.ms += performance.now() - t0;
    }
    updateShells();
    world.effects.add({ label: 'dans shells', update() { updateShells(); if (state.showing) flownCheck(); return true; } });
    /** A butterfly drawn at `p` (moved in place): out of every animal by `margin`, `weight` (0..1) of the way; `name` keeps where it was drawn (state.drawn, for the probe). */
    function keepOut(p, margin, weight = 1, name = null) {
      if (name) state.drawn[name] = [p.x, p.y, p.z];
      if (weight <= 0) return p;
      const t0 = performance.now();
      let q = [p.x, p.y, p.z];
      for (const shell of shells) q = shell.push(q, { margin, forward });
      cost.pushes++;
      cost.ms += performance.now() - t0;
      return p.set(lerp(p.x, q[0], weight), lerp(p.y, q[1], weight), lerp(p.z, q[2], weight));
    }
    // the hero model's wing reach at HERO_SCALE (its mesh's bounding sphere, scaled as drawn), once it has loaded
    let heroReach = 0;
    function heroWing() {
      if (heroReach > 0) return heroReach;
      let mesh = null;
      butterflies?.hero?.group.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
      if (!mesh) return 0.105 * HERO_SCALE * 2;
      mesh.geometry.computeBoundingSphere();
      heroReach = mesh.geometry.boundingSphere.radius * mesh.getWorldScale(new THREE.Vector3()).x;
      return heroReach;
    }

    // ---- the swarm (one draw call), the state for probes ----
    const swarm = createSwarm({ count: SWARM, scale: SWARM_SCALE, seed: 'fidrildadans', uWindTime: world.wind?.uniforms?.uWindTime, antialias: true });
    world.scene.add(swarm.mesh);
    const state = { D0, pitch, thorAt, mosi: [mx, mz], thor: [tx, tz, thorHeading], thorLength, thorPath, thorRoute: THOR_FROM, leftOut, mothCheck, swarm: [], drawn: {}, swarmContact: [], shellCost: cost, time: 0, heroContact: false, flown: {} };
    world.dans = { state, framePoint, frameOf, measure, butterflies: points, clipProbe: (names = SHELLED) => createClipProbe(world, names), shells, shellOf: n => shells[SHELLED.indexOf(n)] };

    /** Every butterfly of the show as it is drawn now, for the clip probe: [{ name, p, wing, contact }]. */
    function points() {
      const out = [];
      const p = new THREE.Vector3();
      if (butterflies?.hero) out.push({ name: 'hero', p: butterflies.hero.group.getWorldPosition(p).toArray(), wing: heroWing(), contact: state.heroContact });
      for (const m of MOTHS) if (m.handle) out.push({ name: m.name, p: m.handle.group.getWorldPosition(p).toArray(), wing: heroWing(), contact: false });
      state.swarm.forEach((a, i) => { if (a[1] > -40) out.push({ name: 's' + i, p: a, wing: SWARM_WING, contact: Boolean(state.swarmContact[i]) }); });
      return out;
    }
    // the flights as flown (pushed), checked every frame of a show: the comfort rules on where they really are, and the largest jump
    function flownCheck() {
      const p = new THREE.Vector3();
      for (const { name, p: at } of points()) {
        const [u, vv, k] = frameOf(p.fromArray(at));
        if (k <= 0.05) continue;
        const c = (state.flown[name] ??= { near: Infinity, far: 0, edgeSamples: 0, nearWide: 0, jump: 0, jumpAt: null, last: null });
        c.near = Math.min(c.near, +k.toFixed(3));
        c.far = Math.max(c.far, +k.toFixed(3));
        if (k < 1 && (u < 0.12 || u > 0.88 || vv < 0.12 || vv > 0.88)) { c.edgeSamples++; c.edgeAt ??= +state.time.toFixed(2); c.edgeTo = +state.time.toFixed(2); }
        if (k < 0.6 && (Math.abs(u - 0.5) > 0.3 || Math.abs(vv - 0.5) > 0.3)) c.nearWide++;
        if (c.last && state.time > 0.3) { // (its first frames are under the opening black, as the three are put on their paths)
          const d = Math.hypot(at[0] - c.last[0], at[1] - c.last[1], at[2] - c.last[2]);
          if (d > c.jump) { c.jump = +d.toFixed(4); c.jumpAt = +state.time.toFixed(2); }
        }
        c.last = at.slice();
      }
    }

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
      // the end card: "Aftur" plays it again, "Hætta" leaves (the book's frame closes; on its own, the game's start)
      let again = false;
      const { element: end } = endCard(document, { onAgain: () => { again = true; }, onQuit: () => leaveShow(window) });
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
      state.showing = true;
      state.flown = {};
      state.heroContact = false;
      const handles = [];
      // reset: Þórseðla upright, the moth far off in the forest, the swarm hidden
      thorStart();
      state.walking = false;
      for (const m of MOTHS) {
        const at = [];
        butterflies?.follow(m.name, out => { mothAt(m, tau(), at); return keepOut(framePoint(at[0], at[1], at[2], out), heroWing() + SAFE, 1, m.name); }, { snap: true });
      }
      const walkAt = ARRIVE - thorLength / THOR_SPEED;
      state.walkAt = +walkAt.toFixed(2);
      handles.push(s.after(walkAt, () => walkIn()));
      for (let i = 0; i < SWARM; i++) swarm.set(i, v.set(0, -50, 0), 0, 0);
      const heroKeys = track([
        [0, 0.7, 0.36, 3.4], [6, 0.68, 0.38, 3.0, 'rest'],
        [9.5, 0.56, 0.38, 1.15], // past Mosi's horn (round 5: just right of his frill, 0.47 went through his head)
        [12, 0.5, 0.46, 0.7], [14.5, 0.5, 0.47, 0.48, 'rest'], // slowly out of the screen to the middle
      ]);
      const uvk = [];
      const hover = t => { const e = smooth((t - 14) / 0.8) * (1 - smooth((t - 17.2) / 0.6)); return [0.02 * Math.sin(2.2 * (t - 14)) * e, 0.012 * Math.sin(4.4 * (t - 14)) * e]; };
      const heroPath = out => {
        const t = tau();
        heroKeys(t, uvk);
        const [du, dv] = hover(t);
        return keepOut(framePoint(uvk[0] + du, uvk[1] + dv, uvk[2], out), heroWing() + SAFE, 1, 'hero');
      };
      butterflies?.follow(HERO, heroPath, { snap: true }); // round 5: on its path at once, under the opening black (not eased in from its loop, through Mosi)
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
      state.heroContact = true; // meant contact: onto the horn, sitting there, and the first second of being blown off it
      state.drawn.hero = null; // the landing is the butterflies' own flight, not a drawn one
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
      state.drawn.hero = null;
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
      state.showing = false;
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
      const start = frameOf(horn(new THREE.Vector3()), stageCam);
      const t0 = tau();
      const keys = track([[t0, ...start], [t0 + 2.4, start[0] + 0.12, 0.26, 1.7], [t0 + 6, 0.56, 0.14, 3.0, 'rest'], [52, 0.58, 0.15, 3.0], [55, 0.56, 0.16, 2.9]]);
      butterflies?.follow(HERO, out => {
        const t = tau();
        keys(t, uvk2);
        const w = t > t0 + 6 ? 0.025 : 0;
        state.heroContact = t < t0 + 1;
        // off the horn it is in the shell's margin: the push comes in over its first second, as it leaves the head
        return keepOut(framePoint(uvk2[0] + w * Math.sin(0.9 * t), uvk2[1] + w * 0.6 * Math.sin(1.7 * t), uvk2[2], out), heroWing() + SAFE, smooth(t - t0), 'hero');
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

    // The swarm: rising from the grass right of Mosi (30-33.5), a spiral round the view axis, one turn in 8 s, out of the screen to k
    // 0.52 at the nearest (38-40.5); from 41.4 (round 6) two thirds stay in front, round Mosi's face and round her head, and the rest
    // go back behind the screen, small and high between Mosi and her; four sit on Þórseðla's head (48-53.5, round 5: off it before it
    // goes up); all drift away into the trees (55-59.5).
    function dance() {
      const random = mulberry(25);
      const each = [];
      const p = new THREE.Vector3(), q = new THREE.Vector3();
      for (let i = 0; i < SWARM; i++) {
        const kg = 1.15 + 0.5 * random();
        framePoint(0.45 + 0.4 * random(), 0.5, kg, p); // round 5: right of Mosi (from 0.25: some rose up through him)
        p.y = world.heightAt(p.x, p.z) + 0.06;
        // not in the grass under Mosi's feet (round 5: one waited inside his foot): further from him until clear of his shell
        for (let tries = 0; tries < 12 && keepOut(q.copy(p), SWARM_WING + SAFE).distanceToSquared(p) > 1e-6; tries++) {
          p.x += p.x < mosi.root.position.x ? -0.2 : 0.2;
          p.y = world.heightAt(p.x, p.z) + 0.06;
        }
        each.push({
          ground: p.clone(), birth: 30 + 0.14 * i, phase: (i / SWARM) * Math.PI * 2 + 0.3 * random(),
          radius: 0.26 + 0.22 * random(), dk: (random() - 0.5) * 0.2, bob: random() * 6.28,
          sit: [0, 6, 12, 18].indexOf(i), // which of the four sits on Þórseðla's head, or -1
          far: [0.15 + 0.7 * random(), 0.15 + 0.35 * random(), 3 + 0.8 * random()],
          from: new THREE.Vector3(), yaw: 0,
        });
      }
      // Round 6 (the owner: "þegar þórseðla kemur fram í mynd með haus niður fara öll hvítu fiðrildi í bakgrunn, væri flott að mörg
      // þeir færi frekar forgrunn fyrir framan þórseðlu og mosa"): from FRONT_FROM, while the spiral is out in front, two thirds of
      // the swarm stay in front of the screen instead of going back with it. FRONT_MOSI circle Mosi's face slowly, in front of his
      // beak (k 0.78) and left of where her snout comes (it comes to k 0.44 at u 0.45-0.55, v 0.5-0.6: nothing can be in front of
      // it, the comfort floor is 0.52); FRONT_HER wait low in front of her chest under where her head comes down, go up round the
      // right of her throat once it is down (48.3-50) to a ring in front of her neck beside her face, come back down before it lifts
      // (53.2), and rise between the two of them into the trees once it is up (56.7). The rest, with the four sitters, keep to the
      // spiral behind the screen. Every station is in the stage's frame round where the bodies are (measured at 50 s), loose and slow.
      const FRONT_MOSI = [1, 4, 7, 10, 13, 16, 19, 22], FRONT_HER = [2, 5, 8, 11, 14, 17, 20, 23];
      const FRONT_FROM = 41.4, FRONT_IN = 3;
      each.forEach((b, i) => {
        b.group = FRONT_MOSI.includes(i) ? 1 : FRONT_HER.includes(i) ? 2 : 0;
        b.j = b.group === 1 ? FRONT_MOSI.indexOf(i) : FRONT_HER.indexOf(i);
      });
      const TAU = 2 * Math.PI;
      // Mosi's: a ring round the left of his face and frill, one turn in 14 s (his face u 0.2-0.5, v 0.2-0.65; her snout, nearer
      // than they may come, from u 0.4)
      const mosiRing = (b, t, o) => {
        const ang = (b.j / 8) * TAU + (TAU * (t - 41)) / 14, sc = 0.8 + 0.2 * ((b.j * 0.37) % 1);
        o[0] = 0.27 + 0.09 * sc * Math.cos(ang); o[1] = 0.42 + 0.2 * sc * Math.sin(ang); o[2] = 0.65 + 0.03 * Math.sin(0.7 * t + b.bob);
        return o;
      };
      // hers: while her head comes down, high over Mosi's frill (k 0.9) left of the way it comes, one turn in 16 s. Not under it (her
      // head's shell, a ball a metre round, reaches down to v 0.8, and a butterfly under a body is pushed up over it: the shell's
      // seam), nor up her right side (her bent neck's shell reaches k 0.64 there, so near the edge of the frame).
      const lowRing = (b, t, o) => {
        const ang = (b.j / 8) * TAU + (TAU * (t - 41)) / 16;
        o[0] = 0.32 + 0.07 * Math.cos(ang); o[1] = 0.155 + 0.02 * Math.sin(ang); o[2] = 0.65 + 0.012 * Math.sin(0.8 * t + b.bob);
        return o;
      };
      // and once her head is down, a small loose ring over it, in front of her neck (k 1) and a wing and the shell's soft zone clear
      // of her head's shell; there along the top of the frame over her head (VIA) and back the same way before her head lifts. Nothing can be
      // in front of her face itself: her snout comes to k 0.44 and her head's shell, a ball a metre round, fills the frame round it
      // nearer than k 0.6 (the comfort floor is 0.52).
      const neckRing = (b, t, o) => {
        const ang = (b.j / 8) * TAU + (TAU * (t - 48)) / 10;
        o[0] = 0.765 + 0.04 * Math.cos(ang); o[1] = 0.18 + 0.03 * Math.sin(ang); o[2] = 0.62 + 0.008 * Math.sin(0.9 * t + b.bob);
        return o;
      };
      const UP_AT = b => 48.3 + 0.12 * b.j, UP = 1.8, DOWN_AT = b => 51.4 + 0.08 * b.j, DOWN = 1.4;
      const VIA = [[0, 0.58, 0.14, 0.64]];
      const herAt = (b, t, o) => {
        const u0 = UP_AT(b), d0 = DOWN_AT(b);
        if (t < u0) return lowRing(b, t, o);
        if (t < u0 + UP) {
          b.up ??= track([[-1, ...lowRing(b, u0, [])], ...VIA, [1, ...neckRing(b, u0 + UP, [])]]);
          return b.up(-1 + 2 * smooth((t - u0) / UP), o);
        }
        if (t < d0) return neckRing(b, t, o);
        if (t < d0 + DOWN) {
          b.down ??= track([[-1, ...neckRing(b, d0, [])], ...VIA.map(([x, ...p]) => [-x, ...p]).reverse(), [1, ...lowRing(b, d0 + DOWN, [])]]);
          return b.down(-1 + 2 * smooth((t - d0) / DOWN), o);
        }
        return lowRing(b, t, o);
      };
      // out: up to a gate in front of the screen, then back into the trees (Mosi's up left of his frill, hers between the two)
      const GATE = { 1: [0.17, 0.2, 0.66], 2: [0.4, 0.14, 0.7] }; // (Mosi's leave his face at its own depth, not back into his beak)
      const OUT_AT = b => (b.group === 1 ? 55.4 + 0.12 * b.j : 55.6 + 0.1 * b.j);
      const farOf = b => (b.group === 1 ? [0.13 + 0.01 * b.j, 0.13 + 0.004 * b.j, 2.3 + 0.1 * (b.j % 3)] : [0.42 + 0.015 * b.j, 0.13 + 0.004 * b.j, 2.3 + 0.1 * (b.j % 3)]);
      const station = [], gateTo = [];
      function frontAt(b, t, out) {
        if (b.group === 1) mosiRing(b, t, station); else herAt(b, t, station);
        const x0 = OUT_AT(b);
        if (t > x0) {
          const g = GATE[b.group], far = farOf(b), e1 = smooth((t - x0) / 1.6), e2 = smooth((t - x0 - 1.2) / 3.2);
          for (let n = 0; n < 3; n++) { gateTo[n] = lerp(station[n], g[n], e1); station[n] = lerp(gateTo[n], far[n], e2); }
        }
        return framePoint(station[0], station[1], station[2], out);
      }
      const front = new THREE.Vector3();

      const kc = [], ring = [];
      const spiral = (b, t, out) => {
        KC(t, kc);
        RING(t, ring);
        const turn = b.phase + (2 * Math.PI * (t - 30)) / 8;
        const k = Math.max(0.52, kc[2] + b.dk);
        const r = b.radius * (k < 1 ? 1 : 1 + 0.4 * (k - 1)) * (1 - ring[1]); // wider behind the screen (smaller once she is there)
        const x = 0.06 + 2 * kc[0] + r * Math.cos(turn) / STAGE_ASPECT, y = 0.05 + r * Math.sin(turn);
        return framePoint(0.5 + 0.5 * x, 0.5 - 0.5 * y + ring[0] + 0.012 * Math.sin(3.1 * t + b.bob), k, out);
      };
      // A sitter (round 5): from the dance to the point SEAT_ABOVE over its seat (SIT_TO s), straight down onto the seat (SIT_DOWN s),
      // sitting there while her head rests, up off it and back (RISE s) and away into the trees. Its seat is in her Head bone's frame.
      const SIT_TO = 1.2, SIT_DOWN = 0.8, RISE = 1.0;
      // they sit while her head is still (it is down by 48.5 and goes up at 53.2) and are off it before it moves: riding it up took
      // them out of the top of the frame in front of the screen (the comfort rules), so they leave from where it rests
      const sitFrom = b => 48 + 0.25 * b.sit;
      const leaveAt = b => (b.sit >= 0 ? 52 + 0.15 * b.sit : b.group ? Infinity : 55 + 0.06 * (b.phase * 4));
      const LEAVE_BACK = 1.8; // and they go up off it and back, deeper, out of the way her head will go up
      const seatOf = (b, out) => out.copy(seats[b.sit].local).applyMatrix4(seats[b.sit].bone.matrixWorld);
      const above = new THREE.Vector3(), seat = new THREE.Vector3();
      // how much of the shell's push a butterfly takes (1 but on the last stretch down onto its seat and the first up from it)
      const pushOf = (b, t) => {
        if (b.sit < 0) return 1;
        const s0 = sitFrom(b) + SIT_TO, l = leaveAt(b);
        if (t < s0 || t > l + RISE) return 1;
        return 1 - Math.min(smooth((t - s0) / SIT_DOWN), 1 - smooth((t - l) / RISE));
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
        // the front groups leave the spiral where it is at FRONT_FROM, out in front: the spiral then goes back through Mosi's head
        if (b.group && t > FRONT_FROM) {
          spiral(b, FRONT_FROM, out);
          out.lerp(frontAt(b, t, front), smooth((t - FRONT_FROM - 0.06 * b.j) / FRONT_IN));
        }
        const t0 = leaveAt(b);
        if (b.sit >= 0 && t >= sitFrom(b)) {
          // its seat as her head is now, and from the moment it leaves, where the seat was then (it goes up from there)
          if (t < t0) seatOf(b, seat);
          else seat.copy((b.left ??= seatOf(b, new THREE.Vector3())));
          above.copy(seat).y += SEAT_ABOVE;
          const s0 = sitFrom(b);
          if (t < s0 + SIT_TO) out.lerp(above, smooth((t - s0) / SIT_TO));
          else if (t < t0) out.lerpVectors(above, seat, smooth((t - s0 - SIT_TO) / SIT_DOWN));
          else {
            above.copy(seat).addScaledVector(look, LEAVE_BACK).y += 0.5;
            out.lerpVectors(seat, above, smooth((t - t0) / RISE));
          }
        }
        if (t >= t0) {
          const go = b.sit >= 0 ? t0 + RISE : t0;
          const k = smooth((t - go) / (4.2 - (go - t0)));
          if (k > 0) out.lerp(framePoint(b.far[0], b.far[1], b.far[2], p), k);
        }
        return out;
      };
      const a = new THREE.Vector3(), c = new THREE.Vector3();
      // placed every frame after the actors (an effect: the shells and the seats are where the bones are now), pushed out of the animals
      function fly() {
        const t = tau();
        state.swarm.length = 0;
        for (let i = 0; i < SWARM; i++) {
          const b = each[i];
          const push = pushOf(b, t);
          // it faces the way it is drawn to fly (a push bends the path only a little, and costs a push)
          at(b, t + 0.05, c);
          at(b, t, a);
          const dx = c.x - a.x, dz = c.z - a.z;
          keepOut(a, SWARM_WING + SAFE, push, 's' + i);
          if (Math.hypot(dx, dz) > 2e-4) b.yaw = Math.atan2(dz, dx);
          const sitting = t < b.birth || (b.sit >= 0 && t >= sitFrom(b) + SIT_TO + SIT_DOWN && t < leaveAt(b));
          const flap = t < b.birth ? 1.25 : sitting ? 0.7 + 0.45 * Math.sin(1.6 * t + b.bob) : -1;
          const size = smooth((t - 27) / 1.5) * (1 - smooth((t - 57.6) / 1.8));
          swarm.set(i, a, b.yaw, size, flap);
          state.swarm.push(a.toArray());
          state.swarmContact[i] = push < 1;
        }
      }
      let going = true;
      world.effects.add({ label: 'dans swarm', update() { if (going) fly(); return going; } });
      return { cancel() { going = false; } };
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
      // the flights as drawn (mothCheck, over the whole show) and as flown, pushed out of the animals (this show so far: comfort, jumps)
      const flown = Object.fromEntries(Object.entries(state.flown).map(([n, c]) => [n, { near: c.near, far: c.far, edgeSamples: c.edgeSamples, edgeAt: c.edgeAt, edgeTo: c.edgeTo, nearWide: c.nearWide, jump: c.jump, jumpAt: c.jumpAt }]));
      return { t: state.time, D: plane(), rows, comfort, walk, moths: mothCheck, flown };
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
