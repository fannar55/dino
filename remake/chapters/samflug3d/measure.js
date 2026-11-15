// Samflug's numbers (chapters/samflug3d.js; tools/samflug-probe.mjs reads them): for the frame as it is drawn now, each thing's
// depth range in the camera's frame and the parallax it spans (engine/gler.js: at depth k·D the parallax is s·(1/k − 1) of the
// screen's width, out positive), and the stereo rules:
//   1 nothing nearer than k 0.334 (4 % out)          (the depth probe, everything that writes depth, and her points)
//   2 nothing an edge cuts in front of the screen     (the depth probe's border ring; and the air's specks, which it cannot see)
//   3 anything nearer than k 0.6 inside u 0.2-0.8     (her points, Egill's, the butterflies)
//   5 nothing passes into anything                    (the butterflies' distance to her and Egill; her wing tips to the lane's walls)
// Her points: every few vertices of her skinned body, as skinned now (SkinnedMesh.getVertexPosition); Egill's the same.
import * as THREE from 'three';
import { createDepthProbe } from '../../engine/depth-probe.js';
import { CLEAR } from './stage.js';

const NEAR_LIMIT = 0.334, MIDDLE = [0.2, 0.8], NEAR_MIDDLE = 0.6;

export function createMeasure(world, { D, rider, state, air }) {
  const { camera } = world;
  const strength = () => world.gler?.settings?.strength ?? 0.02;
  const out = k => +(100 * strength() * (1 / k - 1)).toFixed(2); // % of the screen's width
  const px = k => +(12.8 * 100 * strength() * (1 / k - 1)).toFixed(1); // at 1280 px
  let probe = null;
  const v = new THREE.Vector3(), w = new THREE.Vector3();

  function frameOf(p) {
    v.copy(p);
    const depth = -w.copy(p).applyMatrix4(camera.matrixWorldInverse).z;
    v.project(camera);
    return [0.5 + 0.5 * v.x, 0.5 - 0.5 * v.y, depth / D];
  }
  function pointsOf(mesh, every) {
    const list = [];
    if (!mesh) return list;
    mesh.updateMatrixWorld(true);
    mesh.skeleton?.update();
    const n = mesh.geometry.attributes.position.count;
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i += every) {
      mesh.getVertexPosition(i, p);
      list.push(p.clone().applyMatrix4(mesh.matrixWorld));
    }
    return list;
  }
  function rangeOf(points) {
    if (!points.length) return null;
    let near = null, far = null, left = null, right = null;
    for (const p of points) {
      const f = frameOf(p);
      if (!near || f[2] < near[2]) near = f;
      if (!far || f[2] > far[2]) far = f;
      if (!left || f[0] < left[0]) left = f;
      if (!right || f[0] > right[0]) right = f;
    }
    const r = f => f.map(x => +x.toFixed(3));
    return {
      near: r(near), far: r(far), left: r(left), right: r(right),
      outNear: out(near[2]), outFar: out(far[2]), span: +(out(near[2]) - out(far[2])).toFixed(2), spanPx: +(px(near[2]) - px(far[2])).toFixed(1),
      tips: { left: out(left[2]), right: out(right[2]) },
    };
  }
  /** Points nearer than k 0.6 outside the middle: [{ who, u, k }] (rule 3). */
  function rule3(named) {
    const bad = [];
    for (const [who, points] of named) for (const p of points) {
      const f = frameOf(p);
      if (f[2] < NEAR_MIDDLE && (f[0] < MIDDLE[0] || f[0] > MIDDLE[1])) bad.push({ who, u: +f[0].toFixed(3), k: +f[2].toFixed(3) });
    }
    return bad;
  }

  /** The numbers of the frame as drawn now (call it a frame after the frame's pose: the skins are posed then). */
  function sample({ forest = true } = {}) {
    camera.updateMatrixWorld();
    const herPts = rider.her.root.visible ? pointsOf(rider.herBody(), 7) : [];
    const boyPts = rider.boy.root.visible ? pointsOf(rider.boyBody(), 5) : [];
    const bfly = state.butterflies.filter(b => b.size > 0).map(b => new THREE.Vector3(...b.p));
    const her = rangeOf(herPts), egill = rangeOf(boyPts), butterflies = rangeOf(bfly);
    probe ??= createDepthProbe(world, { width: 320 });
    const all = probe.sample(D);
    let forestOnly = null;
    if (forest) {
      // the forest alone: her, Egill and the butterflies hidden for one probe draw
      const shown = [rider.her.root.visible, rider.boy.root.visible];
      rider.her.root.visible = rider.boy.root.visible = false;
      const f = probe.sample(D);
      rider.her.root.visible = shown[0];
      rider.boy.root.visible = shown[1];
      const nearest = Math.min(f.border, f.middle, f.wide);
      forestOnly = { nearest: +nearest.toFixed(3), outNear: out(nearest), border: +f.border.toFixed(3), borderAt: f.borderAt, farthest: f.farthest, outFar: out(f.farthest), sky: f.sky };
    }
    // the air's specks (the probe cannot see them): their nearest, and any in front of the screen near an edge
    let specksNearest = Infinity, specksAtEdge = 0;
    for (const p of [...air.state.leaves, ...air.state.motes]) {
      const f = frameOf(v.set(...p));
      if (f[2] < specksNearest) specksNearest = f[2];
      if (f[2] < 1 && (f[0] < 0.03 || f[0] > 0.97 || f[1] < 0.03 || f[1] > 0.97)) specksAtEdge++;
    }
    // rule 5: the butterflies' nearest approach to her and Egill (m), and her wing tips' room to the lane's clear width
    let touch = Infinity;
    for (const b of bfly) for (const p of [...herPts, ...boyPts]) touch = Math.min(touch, b.distanceTo(p));
    let reach = 0;
    for (const p of herPts) reach = Math.max(reach, Math.abs(p.x));
    const nearestAll = Math.min(all.border, all.middle, all.wide, her ? her.near[2] : Infinity);
    const bad3 = rule3([['her', herPts], ['egill', boyPts], ['butterflies', bfly]]);
    return {
      t: +state.t.toFixed(2), speed: state.speed,
      her, egill, butterflies, forest: forestOnly,
      specks: { nearest: +specksNearest.toFixed(3), atEdgeInFront: specksAtEdge },
      rules: {
        r1: { nearest: +nearestAll.toFixed(3), out: out(nearestAll), ok: nearestAll >= NEAR_LIMIT },
        r2: { border: +all.border.toFixed(3), at: all.borderAt, ok: all.border >= 0.97 && specksAtEdge === 0 },
        r3: { count: bad3.length, worst: bad3.sort((a, b) => a.k - b.k)[0] ?? null, ok: bad3.length === 0 },
        r5: { butterflyGap: Number.isFinite(touch) ? +touch.toFixed(2) : null, wingReach: +reach.toFixed(2), clear: +CLEAR.toFixed(2), ok: (!Number.isFinite(touch) || touch > 0.25) && reach < CLEAR },
      },
    };
  }
  return { sample, frameOf };
}
