// Grameðla kemur!'s calibration (step 0, ?chapter=gramedla3d&kvordun=1): Grameðla leaning in until her snout is out of the screen by
// one of six amounts, at either of two strengths, for the owner to page through with the glasses on. He chose "4% 0,02"
// (2026-11-12). tools/gramedla-probe.mjs measures each setting with measure().
//
//   ?chapter=gramedla3d&kvordun=1      arrows (or the buttons) step through the six; up and down the strength
//   ?chapter=gramedla3d&kvordun=1&stilling=4&styrkur=0.03   one of them at once (captures)
import * as THREE from 'three';
import { rotateBoneWorld } from '../../engine/actor.js';
import { createDepthProbe } from '../../engine/depth-probe.js';
import { plantVolumes, reachInto } from '../../engine/tree-probe.js';
import { createShell } from '../../engine/shell.js';
import { reviewUi } from './review.js';

export const OUT = [0.02, 0.03, 0.04, 0.047, 0.06, 0.08]; // the snout tip's parallax at strength 0.02, as a share of the width
export const STRENGTHS = [0.02, 0.03];
export const kOf = out => 1 / (1 + out / 0.02);
// She breathes: her chest rises and falls BREATH degrees every BREATH_S seconds. Her eyes blink on their own (eyelids.js).
const BREATH = 0.8;
const BREATH_S = 4.2;
const rad = d => (d * Math.PI) / 180;

export function runCalibration(world, { gram, pose, stage, D, GRASS, GROUND_SHARE, nearLane, params, hold }) {
  const { camera, gler } = world;
  const { frameOf, groundEdgeDepth } = stage;
  const { bones, body, headVerts } = pose;
  const q = new THREE.Quaternion();
  const solved = OUT.map(o => pose.solve({ k: kOf(o) }));
  const startAt = Math.max(0, Math.min(OUT.length - 1, (Number(params.get('stilling')) || 4) - 1));
  const view = { index: startAt, strength: STRENGTHS.includes(Number(params.get('styrkur'))) ? Number(params.get('styrkur')) : 0.02 };
  const show = index => { view.index = index; pose.apply(solved[index]); };
  show(view.index);
  let breathT = 0;
  gram.setOverlay(dt => {
    pose.apply(solved[view.index]);
    breathT += dt;
    rotateBoneWorld(bones.Chest, q.setFromAxisAngle(pose.right, rad(BREATH) * Math.sin((2 * Math.PI * breathT) / BREATH_S)));
  });
  hold.strength = () => view.strength;

  const probe = createDepthProbe(world, { width: 320 });
  const shell = createShell(THREE, gram);
  function measure() {
    const Dn = gler?.plane ?? D;
    const strength = gler?.settings.strength ?? view.strength;
    camera.updateMatrixWorld();
    gram.root.updateMatrixWorld(true);
    const tip = pose.snout();
    const [su, sv, sk] = frameOf(tip, camera, Dn);
    let eyes = null;
    if (gler?.eyes) {
      const l = tip.clone().project(gler.eyes[0]).x, r = tip.clone().project(gler.eyes[1]).x;
      eyes = +((l - r) / 2).toFixed(4);
    }
    const ray = new THREE.Vector3(), fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    const isGround = (u, vv, dep) => {
      ray.set(2 * u - 1, 1 - 2 * vv, 0.5).unproject(camera).sub(camera.position).normalize();
      const t = dep / ray.dot(fwd);
      const x = camera.position.x + ray.x * t, y = camera.position.y + ray.y * t, z = camera.position.z + ray.z * t;
      return y - world.heightAt(x, z) < GRASS;
    };
    const depth = probe.sample(Dn, { isGround });
    body.skeleton.update();
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    const p = new THREE.Vector3();
    for (const i of headVerts) {
      body.getVertexPosition(i, p).applyMatrix4(body.matrixWorld);
      const [u, vv] = frameOf(p, camera, Dn);
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, vv); v1 = Math.max(v1, vv);
    }
    let skinEdge = { k: Infinity };
    const pos = body.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 4) {
      body.getVertexPosition(i, p).applyMatrix4(body.matrixWorld);
      const [u, vv, k] = frameOf(p, camera, Dn);
      if (k <= 0 || u < -0.2 || u > 1.2 || vv < -0.2 || vv > 1.2) continue;
      if ((u < 0.01 || u > 0.99 || vv < 0.01 || vv > 0.99) && k < skinEdge.k) skinEdge = { k: +k.toFixed(3), u: +u.toFixed(3), v: +vv.toFixed(3), y: +p.y.toFixed(2) };
    }
    let ground = Infinity;
    for (let x = -1; x <= 1.0001; x += 0.25) ground = Math.min(ground, groundEdgeDepth(camera, x));
    const boneRows = [];
    gram.model.traverse(o => { if (o.isBone) { const [u, vv, k] = frameOf(o.getWorldPosition(p), camera, Dn); boneRows.push({ name: o.name, u, v: vv, k }); } });
    const inside = boneRows.filter(r => r.u > 0 && r.u < 1 && r.v > 0 && r.v < 1);
    const behind = inside.filter(r => r.k > 1).map(r => r.name);
    const frontOut = boneRows.filter(r => r.k < 1 && !(r.u > 0.02 && r.u < 0.98 && r.v > 0.02 && r.v < 0.98)).map(r => `${r.name} k ${r.k.toFixed(2)}`);
    const chain = ['Hips', 'Spine', 'Chest', 'Neck', 'Head'].map(n => { const r = boneRows.find(x => x.name === n); return r && { name: n, u: +r.u.toFixed(3), v: +r.v.toFixed(3), k: +r.k.toFixed(3) }; });
    shell.update();
    let plant = null;
    for (const pl of nearLane) {
      const hit = reachInto(plantVolumes(pl), shell.capsules, 0);
      if (hit && (!plant || hit.depth > plant.depth)) plant = { name: pl.name, x: +pl.x.toFixed(2), z: +pl.z.toFixed(2), depth: +hit.depth.toFixed(3) };
    }
    const far = depth.farthest;
    return {
      setting: view.index + 1, out: OUT[view.index], strength, D: +Dn.toFixed(3), pitch: stage.pitch, stagePitch: stage.stagePitch,
      solved: solved[view.index],
      snout: { u: +su.toFixed(3), v: +sv.toFixed(3), k: +sk.toFixed(3), depth: +(sk * Dn).toFixed(3), parallax: +(strength * (1 / sk - 1)).toFixed(4), eyes },
      picture: { front: depth.front, at: depth.at, behind: depth.behind, sky: depth.sky },
      background: { farthestK: far, parallax: +(strength * (1 - 1 / far)).toFixed(4), sky: strength },
      head: { height: +(v1 - v0).toFixed(3), width: +(u1 - u0).toFixed(3), box: [u0, v0, u1, v1].map(x => +x.toFixed(3)) },
      edge: { border: +depth.border.toFixed(3), borderAt: depth.borderAt, ok: depth.border >= 1, her: skinEdge, ground: +depth.groundBorder.toFixed(3), groundAt: depth.groundBorderAt },
      ground: { k: +(ground / Dn).toFixed(3), ok: ground / Dn >= GROUND_SHARE },
      body: { chain, behindInFrame: behind.length, frontAtEdge: frontOut },
      plant, nearLane: nearLane.length,
    };
  }

  const ui = typeof document !== 'undefined' ? reviewUi(document, {
    step: d => { show((view.index + d + OUT.length) % OUT.length); hold(); sync(); },
    strength: () => { view.strength = view.strength === 0.02 ? 0.03 : 0.02; hold(); sync(); },
  }) : null;
  function sync() {
    if (!ui) return;
    const real = OUT[view.index] * view.strength / 0.02 * 100;
    ui.label.textContent = `Trýnið ${real.toFixed(1).replace('.', ',')} % út · styrkur ${view.strength.toFixed(2).replace('.', ',')} · ${view.index + 1} af ${OUT.length}`;
  }
  sync();
  if (ui) document.body.append(ui.element);
  return { view, solved, measure, show: i => { show(i); hold(); } };
}
