// Grameðla kemur! (?chapter=gramedla3d): the second show for red/cyan glasses, built for them (the plan:
// docs/superpowers/specs/2026-11-12-gramedla-kemur-3d-design.md). Step 0, the stage and the calibration: a new clearing in the
// forest with a lane running straight away from the still camera into the morning mist, and Grameðla in it, leaning in toward the
// lens until her snout is out of the screen by one of six amounts. The owner pages through them with the glasses on and says how
// far out her head may come; his answer fixes the numbers of the show.
//
//   ?chapter=gramedla3d&kvordun=1      the calibration: arrows (or the buttons) step through the six; up and down the strength
//   ?chapter=gramedla3d&kvordun=1&stilling=4&styrkur=0.03   one of them at once (captures)
//
// The stage (engine/stage3d.js, as the first show's): a child's eye 1.7 m up, still, tilted up as little as keeps the ground at the
// bottom edge at GROUND_SHARE of D or further; places are solved in its fixed 16:10 frame. Her lean is a pure function of how far
// out the snout is: `out` is the snout tip's parallax as a share of the screen's width at strength 0.02, so its depth is k·D with
// k = 1 / (1 + out / 0.02); she stands in the lane facing us and bends spine, chest and neck down by shares of one angle, her head
// turned so the snout points at the lens; the angle and where she stands are solved so the snout tip is on the view axis at that
// depth (world.gramedla.state.solved says how close).
import * as THREE from 'three';
import { createStage } from '../engine/stage3d.js';
import { rotateBoneWorld } from '../engine/actor.js';
import { bodyMesh } from '../engine/clip-probe.js';
import { createDepthProbe } from '../engine/depth-probe.js';
import { plantVolumes, reachInto } from '../engine/tree-probe.js';
import { createShell } from '../engine/shell.js';
import { endCard, glassesStart } from '../engine/book/show-cards.js';
import { leaveShow } from '../engine/book/show-player.js';
import { glints, run, SPARKLE_LOOK } from '../world/props/sparkles.js';

const CHARS = '../assets/characters/';
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const KVORDUN = params.get('kvordun') === '1';

// ---- the stage ----
export const CAMERA = [0, 1.7, 8];
const LOOK = -90; // degrees: the camera looks along -Z, up the lane
const FOV = 46;
export const D = 6.5; // m: the screen plane
const GROUND_SHARE = 0.85;
// The lane: straight up -Z from the camera, LANE.half m each side of its middle kept clear of every plant the forest would grow
// there (layout.keepOut), and nearer than NEAR m the whole of the widest screen's view as well (1170x540: 42.6 degrees each side of
// the axis, and a metre more), so nothing growing comes in front of the screen at an edge. The footpath runs up its middle.
export const LANE = { half: 3.4, to: -48 };
const NEAR = 14;
const WIDEST = Math.tan((42.6 * Math.PI) / 180);
export function keepOut(x, z) {
  const depth = CAMERA[2] - z;
  if (depth > -2 && depth < NEAR && Math.abs(x - CAMERA[0]) < depth * WIDEST + 1) return 1;
  if (z < CAMERA[2] && z > LANE.to && Math.abs(x - CAMERA[0]) < LANE.half) return 1;
  return 0;
}
// the plants that grow near the lane, kept for the check that she stands in none (layout.leaveOut sees each; it takes none)
const nearLane = [];
export function leaveOut(info, placement) {
  if (Math.abs(info.x - CAMERA[0]) < LANE.half + 6 && info.z < CAMERA[2] && info.z > LANE.to - 4) nearLane.push(placement);
  return false;
}

// ---- the calibration ----
export const OUT = [0.02, 0.03, 0.04, 0.047, 0.06, 0.08]; // the snout tip's parallax at strength 0.02, as a share of the width
export const STRENGTHS = [0.02, 0.03];
export const kOf = out => 1 / (1 + out / 0.02);
const SNOUT_V = 0.56; // the snout tip's height in the stage's frame: a little under the middle, as her head is mostly above it
// She is held at the idle's first pose (the idle sways her head a third of a metre, which the lean carries to the snout) and
// breathes: her chest rises and falls BREATH degrees every BREATH_S seconds. Her eyes blink on their own (eyelids.js).
const BREATH = 0.8;
const BREATH_S = 4.2;
// her lean: spine, chest and neck bend down by these shares of one angle; the head turns the snout to the lens
const LEAN = { Spine: 0.22, Chest: 0.3, Neck: 0.48 };
const AIM = 0.5; // how much of the angle down to the lens the head turns
const LEAN_RANGE = [0, 1.5]; // radians

const rad = d => (d * Math.PI) / 180;

export const chapter = {
  id: 'gramedla3d',
  title: 'Grameðla kemur!',
  look: 'morning',
  gler: { panel: false },
  startButton: glassesStart,
  layout: {
    seed: 37,
    clearing: { center: [0, 2], radius: 8 },
    forestEdge: 11,
    path: [[0, 16], [0, 4], [0, -12], [0, -30], [0, -56]],
    glade: { shafts: 4 },
    leafShadows: true,
    keepOut,
    leaveOut,
    mist: [{ center: [0, -32], radius: 9, height: 4.5 }],
  },
  actors: {
    gramedla: { url: CHARS + 'trex.glb', position: [0, 0, -6], heading: 90 },
  },
  cast: {},
  lines: {},
  startShot: 'show',
  shots: {
    show: { position: CAMERA, target: [CAMERA[0], CAMERA[1] + 1.2, CAMERA[2] - 10], fov: FOV },
  },

  *script(s) {
    const gramActor = s.actor('gramedla');
    const gram = gramActor.raw;
    const world = gram.world;
    const { camera, gler } = world;
    const plane = () => gler?.plane ?? D;
    const stage = createStage(world, { position: CAMERA, look: LOOK, fov: FOV, groundShare: GROUND_SHARE, depth: D, plane });
    const { camPos, camTarget, stageCam, framePoint, frameOf, depthOf, groundEdgeDepth } = stage;
    const v = new THREE.Vector3(), q = new THREE.Quaternion();

    // ---- her bones and the snout tip (the forward-most vertex of her upper jaw, in the Head bone's frame) ----
    const bone = name => gram.model.getObjectByName(name);
    const bones = { Spine: bone('Spine'), Chest: bone('Chest'), Neck: bone('Neck'), Head: bone('Head'), Jaw: bone('Jaw'), Hips: bone('Hips') };
    gram.play('idle', { fade: 0 });
    gram.mixer.timeScale = 0; // held at the idle's first pose, whatever plays later
    const at = (x, z) => gram.place(x, z, Math.atan2(camPos.z - z, camPos.x - x) * 180 / Math.PI);
    at(0, camPos.z - 12);
    gram.mixer.update(0);
    gram.root.updateMatrixWorld(true);
    const body = bodyMesh(gram);
    const headVerts = [];
    let snoutLocal = null;
    {
      body.skeleton.update();
      const list = body.skeleton.bones;
      const head = list.indexOf(bones.Head);
      const ofHead = new Set();
      bones.Head.traverse(o => { const j = list.indexOf(o); if (j >= 0) ofHead.add(j); });
      const si = body.geometry.attributes.skinIndex, sw = body.geometry.attributes.skinWeight;
      const p = new THREE.Vector3();
      let tip = null, best = -Infinity;
      const facing = new THREE.Vector3(1, 0, 0).applyQuaternion(gram.root.quaternion).setY(0).normalize();
      for (let i = 0; i < si.count; i++) {
        let top = 0, w = -1;
        for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > w) { w = sw.getComponent(i, k); top = si.getComponent(i, k); }
        if (!ofHead.has(top)) continue;
        headVerts.push(i);
        if (top !== head) continue;
        body.getVertexPosition(i, p).applyMatrix4(body.matrixWorld);
        if (p.dot(facing) > best) { best = p.dot(facing); tip = p.clone(); }
      }
      snoutLocal = bones.Head.worldToLocal(tip.clone());
    }
    const snout = (out = new THREE.Vector3()) => out.copy(snoutLocal).applyMatrix4(bones.Head.matrixWorld);

    // ---- the lean: spine, chest and neck down by shares of `theta` (radians), the head turned so the snout points at the lens ----
    const right = new THREE.Vector3(), sp = new THREE.Vector3();
    // Every lean starts from the idle's first pose, which she is held at (the mixer is stopped): neither the mixer nor the actor's
    // own layers (look, talk) can be trusted to pose these bones again before the next lean, so they are set back here.
    const rest = ['Spine', 'Chest', 'Neck', 'Head'].map(n => [bones[n], bones[n].quaternion.clone()]);
    function lean(theta) {
      for (const [o, r] of rest) o.quaternion.copy(r);
      gram.root.updateMatrixWorld(true);
      right.set(0, 0, 1).applyQuaternion(gram.root.quaternion);
      for (const [name, share] of Object.entries(LEAN)) rotateBoneWorld(bones[name], q.setFromAxisAngle(right, -theta * share));
      // the head: as it stands (the lean undone), then down by the angle from the snout to the lens, so she looks at us
      rotateBoneWorld(bones.Head, q.setFromAxisAngle(right, theta));
      snout(sp);
      const drop = Math.atan2(sp.y - camera.position.y, Math.hypot(sp.x - camera.position.x, sp.z - camera.position.z));
      rotateBoneWorld(bones.Head, q.setFromAxisAngle(right, -drop * AIM));
    }
    // the aim is at the screen's camera: it stands where the stage's does
    camera.position.copy(camPos);

    /** Her pose with the idle at its start, standing at (x, z) facing the lens and leaning by theta: the snout tip (moved in place). */
    function poseAt(x, z, theta, p = new THREE.Vector3()) {
      at(x, z);
      lean(theta);
      return snout(p);
    }
    /**
     * Solve where she stands and how far she leans for a snout depth of k·D on the view axis (her idle at its start): for a lean,
     * where she stands puts the snout tip over its place; the lean (bisected in LEAN_RANGE) brings it to its height. A lean at the
     * end of the range that still misses says so in `error` (m).
     */
    function solve(k, trace = null) {
      const want = framePoint(0.5, SNOUT_V, k, new THREE.Vector3(), stageCam, D);
      const p = new THREE.Vector3();
      let x = 0, z = want.z - 6;
      const place = theta => {
        for (let i = 0; i < 12; i++) {
          poseAt(x, z, theta, p);
          x += want.x - p.x;
          z += want.z - p.z;
        }
        poseAt(x, z, theta, p);
        if (trace) trace.push([theta, x, z, p.y].map(n => +n.toFixed(3)));
        return p.y - want.y; // > 0: the snout is too high, she leans further
      };
      let [lo, hi] = LEAN_RANGE;
      let theta;
      if (place(lo) <= 0) theta = lo;
      else if (place(hi) >= 0) theta = hi;
      else {
        for (let i = 0; i < 24; i++) {
          const mid = (lo + hi) / 2;
          if (place(mid) > 0) lo = mid; else hi = mid;
        }
        theta = (lo + hi) / 2;
      }
      place(theta);
      return { x: +x.toFixed(3), z: +z.toFixed(3), theta: +theta.toFixed(4), lean: +(theta * 180 / Math.PI).toFixed(1), error: +p.distanceTo(want).toFixed(4), k };
    }
    const solved = OUT.map(o => solve(kOf(o)));

    // ---- what is showing ----
    const startAt = Math.max(0, Math.min(OUT.length - 1, (Number(params.get('stilling')) || 4) - 1));
    const view = { index: startAt, strength: STRENGTHS.includes(Number(params.get('styrkur'))) ? Number(params.get('styrkur')) : 0.02 };
    function show(index) {
      view.index = index;
      const sol = solved[index];
      at(sol.x, sol.z);
      gram.mixer.update(0);
      lean(sol.theta); // leaning at once, whether or not a frame comes before the next look
    }
    show(view.index);
    let breathT = 0;
    gram.setOverlay(dt => {
      lean(solved[view.index].theta);
      breathT += dt;
      rotateBoneWorld(bones.Chest, q.setFromAxisAngle(right, rad(BREATH) * Math.sin((2 * Math.PI * breathT) / BREATH_S)));
    });
    // the calibration holds the glasses' own settings: the strength it shows, the screen plane where it is (pop 1); nothing is saved
    function hold() {
      if (!gler) return;
      if (KVORDUN) {
        gler.settings.strength = view.strength;
        gler.settings.pop = 1;
      }
      gler.setPlane(D, { jump: true });
    }
    hold();
    s.after(0, function* keep() { for (;;) { hold(); camera.updateMatrixWorld(); yield; } });

    const shot = { position: camPos.toArray(), target: camTarget.toArray(), fov: FOV, label: 'gramedla' };
    yield s.camera.cut(shot, { check: false });

    // the motes: pale specks at many depths in the lane's light; in front of the screen only well inside the frame
    const motes = (() => {
      const count = 70;
      const set = glints(world, {
        count, life: 600, spread: 0.6, fall: 0, size: 0.04, colour: '#fff6d6', seed: 'gramedla motes',
        look: { ...SPARKLE_LOOK, star: 0, glow: 0.8, falloff: 3, twinkle: 1, rise: 0.5, drift: [0.2, -0.12] },
      });
      let seed = 53;
      const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const p = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        const k = 0.55 + 3.5 * random() ** 1.5;
        const edge = k < 1 ? 0.25 : 0.04;
        framePoint(edge + (1 - 2 * edge) * random(), edge + (1 - 2 * edge) * random(), k, p, stageCam, D);
        set.position.set([p.x, p.y, p.z], i * 3);
        set.birth[i] = 0;
      }
      return run(world, set, 1e6, 'gramedla motes');
    })();

    // ---- the measurements (tools/gramedla-probe.mjs) ----
    const probe = createDepthProbe(world, { width: 320 });
    const shell = createShell(THREE, gram);
    function measure() {
      const Dn = plane();
      const strength = gler?.settings.strength ?? view.strength;
      camera.updateMatrixWorld();
      gram.root.updateMatrixWorld(true);
      const tip = snout();
      const [su, sv, sk] = frameOf(tip, camera, Dn);
      let eyes = null;
      if (gler?.eyes) {
        const l = tip.clone().project(gler.eyes[0]).x, r = tip.clone().project(gler.eyes[1]).x;
        eyes = +((l - r) / 2).toFixed(4);
      }
      const depth = probe.sample(Dn);
      // the head: its skin's box in the frame
      body.skeleton.update();
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      const p = new THREE.Vector3();
      for (const i of headVerts) {
        body.getVertexPosition(i, p).applyMatrix4(body.matrixWorld);
        const [u, vv] = frameOf(p, camera, Dn);
        u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, vv); v1 = Math.max(v1, vv);
      }
      // her skin at the frame's edges (every 4th vertex): the nearest at or past the border ring
      let skinEdge = { k: Infinity };
      const pos = body.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 4) {
        body.getVertexPosition(i, p).applyMatrix4(body.matrixWorld);
        const [u, vv, k] = frameOf(p, camera, Dn);
        if (k <= 0 || u < -0.2 || u > 1.2 || vv < -0.2 || vv > 1.2) continue;
        if ((u < 0.01 || u > 0.99 || vv < 0.01 || vv > 0.99) && k < skinEdge.k) skinEdge = { k: +k.toFixed(3), u: +u.toFixed(3), v: +vv.toFixed(3), y: +p.y.toFixed(2) };
      }
      // the ground along the bottom edge (nine points across it)
      let ground = Infinity;
      for (let x = -1; x <= 1.0001; x += 0.25) ground = Math.min(ground, groundEdgeDepth(camera, x));
      // her bones: the deepest in the frame, and any in front of the screen at or past an edge
      const boneRows = [];
      gram.model.traverse(o => { if (o.isBone) { const [u, vv, k] = frameOf(o.getWorldPosition(p), camera, Dn); boneRows.push({ name: o.name, u, v: vv, k }); } });
      const inside = boneRows.filter(r => r.u > 0 && r.u < 1 && r.v > 0 && r.v < 1);
      const behind = inside.filter(r => r.k > 1).map(r => r.name);
      const frontOut = boneRows.filter(r => r.k < 1 && !(r.u > 0.02 && r.u < 0.98 && r.v > 0.02 && r.v < 0.98)).map(r => `${r.name} k ${r.k.toFixed(2)}`);
      const chain = ['Hips', 'Spine', 'Chest', 'Neck', 'Head'].map(n => { const r = boneRows.find(x => x.name === n); return r && { name: n, u: +r.u.toFixed(3), v: +r.v.toFixed(3), k: +r.k.toFixed(3) }; });
      // plants: how far any of her capsules reaches into a plant near the lane
      shell.update();
      let plant = null;
      for (const pl of nearLane) {
        const hit = reachInto(plantVolumes(pl), shell.capsules, 0);
        if (hit && (!plant || hit.depth > plant.depth)) plant = { name: pl.name, x: +pl.x.toFixed(2), z: +pl.z.toFixed(2), depth: +hit.depth.toFixed(3) };
      }
      const far = depth.farthest; // the farthest drawn pixel (not the sky), as a share of D
      return {
        setting: view.index + 1, out: OUT[view.index], strength, D: +Dn.toFixed(3), pitch: stage.pitch, stagePitch: stage.stagePitch,
        solved: solved[view.index],
        snout: { u: +su.toFixed(3), v: +sv.toFixed(3), k: +sk.toFixed(3), depth: +(sk * Dn).toFixed(3), parallax: +(strength * (1 / sk - 1)).toFixed(4), eyes },
        picture: { front: depth.front, at: depth.at, behind: depth.behind, sky: depth.sky },
        background: { farthestK: far, parallax: +(strength * (1 - 1 / far)).toFixed(4), sky: strength },
        head: { height: +(v1 - v0).toFixed(3), width: +(u1 - u0).toFixed(3), box: [u0, v0, u1, v1].map(x => +x.toFixed(3)) },
        edge: { border: +depth.border.toFixed(3), borderAt: depth.borderAt, ok: depth.border >= 1, her: skinEdge },
        ground: { k: +(ground / Dn).toFixed(3), ok: ground / Dn >= GROUND_SHARE },
        body: { chain, behindInFrame: behind.length, frontAtEdge: frontOut },
        plant, nearLane: nearLane.length,
      };
    }
    world.gramedla = { view, state: { solved, view, snoutLocal: snoutLocal.toArray(), pitch: stage.pitch, stagePitch: stage.stagePitch }, measure, solve, poseAt: (x, z, theta) => { const p = poseAt(x, z, theta).toArray(); const h = bones.Head.getWorldPosition(new THREE.Vector3()).toArray(); show(view.index); return { snout: p, head: h }; }, show: i => { show(i); hold(); }, stage };

    // ---- the calibration's controls: arrows, and three big buttons; a small label in the top left ----
    if (KVORDUN && typeof document !== 'undefined') {
      const ui = calibrationUi(document, {
        step: d => { show((view.index + d + OUT.length) % OUT.length); hold(); ui.sync(); },
        strength: () => { view.strength = view.strength === 0.02 ? 0.03 : 0.02; hold(); ui.sync(); },
      });
      ui.sync = () => {
        const real = OUT[view.index] * view.strength / 0.02 * 100;
        ui.label.textContent = `Trýnið ${real.toFixed(1).replace('.', ',')} % út · styrkur ${view.strength.toFixed(2).replace('.', ',')} · ${view.index + 1} af ${OUT.length}`;
      };
      ui.sync();
      document.body.append(ui.element);
    }

    yield s.ready();
    if (KVORDUN) {
      yield s.fade(0, 1);
      for (;;) yield;
    }
    // the show itself comes in step 2; until then the stage, the end card after a while
    yield s.fade(0, 1.5);
    yield s.wait(20);
    yield s.fade(1, 1);
    let again = false;
    const { element: end } = endCard(document, { onAgain: () => { again = true; }, onQuit: () => leaveShow(window) });
    document.body.append(end);
    yield s.until(() => again);
    end.remove();
  },
};

// The calibration's controls: big round buttons in the bottom corners (‹ and ›) and in the top right (the strength), arrows on the
// keyboard, and the label. Pale and quiet, so they are not much in the picture.
function calibrationUi(doc, { step, strength }) {
  const element = doc.createElement('div');
  element.className = 'kvordun';
  element.innerHTML = `
    <style>
      .kvordun button { position: fixed; z-index: 30; width: 84px; height: 84px; border-radius: 50%; border: 2px solid rgba(255,255,240,.55);
        background: rgba(40,44,30,.35); color: rgba(255,255,240,.85); font: 600 34px/1 system-ui, sans-serif; touch-action: manipulation; }
      .kvordun .prev { left: 18px; bottom: 18px; } .kvordun .next { right: 18px; bottom: 18px; }
      .kvordun .str { right: 18px; top: 18px; width: 72px; height: 72px; font-size: 17px; }
      .kvordun .label { position: fixed; z-index: 30; left: 14px; top: 12px; padding: 4px 9px; border-radius: 6px; background: rgba(30,32,24,.45);
        color: rgba(255,255,240,.9); font: 500 15px/1.3 system-ui, sans-serif; pointer-events: none; }
    </style>
    <div class="label"></div>
    <button class="prev" aria-label="Minna">‹</button>
    <button class="next" aria-label="Meira">›</button>
    <button class="str" aria-label="Styrkur">styrkur</button>`;
  const label = element.querySelector('.label');
  element.querySelector('.prev').addEventListener('click', () => step(-1));
  element.querySelector('.next').addEventListener('click', () => step(1));
  element.querySelector('.str').addEventListener('click', () => strength());
  doc.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') strength();
    else return;
    e.preventDefault();
  });
  return { element, label };
}
