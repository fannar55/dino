// Flugeðla og fiðrildið's numbers (chapters/flugedla3d.js; tools/flugedla-probe.mjs reads them), for the frame as it is drawn now:
// each thing's depth range in the camera's frame and the parallax it spans (out positive, % of the screen's width at the
// strength, and px at 1280), and the plan's rules (section 2):
//   4 the frame rule: nothing in front of the screen at an edge   (the depth probe's border ring; the clouds' balls, which it cannot see)
//   5 the depth budget: nothing further out than 4 %                (the probe, her points, the butterfly's)
//   6 what is more than 1.3 % out stays in u 0.2-0.8                 (her points, the butterfly's)
//   9 nothing passes into anything: the butterfly 0.5 m from her    (unless it sits on her beak or is landing there), her wings 1 m from trunks and crowns
//  10 where she is in front of the screen she spans 1 % or more, and the background reaches 1.5 % in or deeper
// And the ground rule alone on a 4:3 picture (groundOn43): the ground at the bottom edge no nearer than D.
import * as THREE from 'three';
import { createDepthProbe } from '../../engine/depth-probe.js';
import { MIDDLE, MIDDLE_OUT, MAX_OUT } from './keys.js';
import { tanH, tanV43 } from './stage.js';

export function createMeasure(world, { D, cast, state, clouds, base }) {
  const { camera } = world;
  const strength = () => world.gler?.settings?.strength ?? 0.02;
  const outK = k => 100 * strength() * (1 / k - 1); // % of the screen's width
  const out = k => +outK(k).toFixed(2);
  const px = k => +(12.8 * outK(k)).toFixed(1);
  const kAt = o => 1 / (1 + o / (100 * strength())); // the k of an out (%)
  let probe = null;
  const v = new THREE.Vector3(), w = new THREE.Vector3();

  function frameOf(p) {
    const depth = -w.copy(p).applyMatrix4(camera.matrixWorldInverse).z;
    v.copy(p).project(camera);
    return [0.5 + 0.5 * v.x, 0.5 - 0.5 * v.y, depth / D];
  }
  function skinnedPoints(mesh, every) {
    const list = [];
    if (!mesh) return list;
    mesh.updateMatrixWorld(true);
    mesh.skeleton?.update();
    const n = mesh.geometry.attributes.position.count;
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i += every) list.push(mesh.getVertexPosition(i, p).clone().applyMatrix4(mesh.matrixWorld));
    return list;
  }
  function meshPoints(root, every) {
    const list = [];
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isMesh) return;
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += every) list.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
    });
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
      outNear: out(near[2]), outFar: out(far[2]), span: +(outK(near[2]) - outK(far[2])).toFixed(2), spanPx: +(px(near[2]) - px(far[2])).toFixed(1),
      tips: { left: { u: +left[0].toFixed(3), out: out(left[2]) }, right: { u: +right[0].toFixed(3), out: out(right[2]) } },
      width: +(right[0] - left[0]).toFixed(4), // of the frame's width
    };
  }
  const outsideMiddle = (points, who) => {
    const bad = [];
    const k6 = kAt(100 * MIDDLE_OUT);
    for (const p of points) {
      const f = frameOf(p);
      if (f[2] < k6 && (f[0] < MIDDLE[0] || f[0] > MIDDLE[1])) bad.push({ who, u: +f[0].toFixed(3), out: out(f[2]) });
    }
    return bad;
  };

  // the trunks and crowns near her (rule 9): the forest's placements with their model's trunk and crown, as the batcher puts them
  function plantGap(points) {
    if (!points.length) return null;
    const placements = world.forest?.placements ?? [];
    const c = points.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / points.length);
    let gap = Infinity, what = null;
    for (const pl of placements) {
      if (Math.hypot(pl.x - c.x, pl.z - c.z) > 22 || !pl.model) continue;
      const m = pl.model, sc = pl.scale ?? 1, cs = Math.cos(pl.rot ?? 0), sn = Math.sin(pl.rot ?? 0);
      const top = pl.y + (m.trunk?.top ?? m.height ?? 2) * sc, tr = (m.trunk?.r ?? 0.3) * sc;
      const cr = m.crown;
      const cc = cr ? new THREE.Vector3(pl.x + (cr.c[0] * cs - cr.c[2] * sn) * sc, pl.y + cr.c[1] * sc, pl.z + (cr.c[0] * sn + cr.c[2] * cs) * sc) : null;
      for (const p of points) {
        if (p.y < top) { const d = Math.hypot(p.x - pl.x, p.z - pl.z) - tr; if (d < gap) { gap = d; what = `${pl.name} trunk`; } }
        if (cc) { const d = p.distanceTo(cc) - Math.min(cr.r, cr.ry ?? cr.r) * sc; if (d < gap) { gap = d; what = `${pl.name} crown`; } }
      }
    }
    return Number.isFinite(gap) ? { gap: +gap.toFixed(2), what } : null;
  }

  // the clouds the probe cannot see: the nearest ball in the picture, the farthest, and any in front of the screen at an edge
  function cloudNumbers() {
    let nearest = Infinity, farthest = 0, atEdge = 0;
    const ball = new THREE.Vector3();
    const view = new THREE.Vector3();
    const tanV = Math.tan((camera.fov * Math.PI) / 360), tanHh = tanV * camera.aspect;
    for (let i = 0; i < clouds.count; i++) {
      const a = clouds.mesh.geometry.attributes.aBall;
      ball.set(a.getX(i), a.getY(i) + base, a.getZ(i));
      const r = a.getW(i);
      view.copy(ball).applyMatrix4(camera.matrixWorldInverse);
      const depth = -view.z;
      if (depth + r <= 0) continue;
      if (clouds.near && depth - r < clouds.near[0]) continue; // (faded out wholly near the camera: clouds.js setNear)
      const inside = Math.abs(view.x) - r < tanHh * Math.max(depth, 0) && Math.abs(view.y) - r < tanV * Math.max(depth, 0);
      if (!inside) continue;
      const kNear = Math.max(0.01, depth - r) / D;
      nearest = Math.min(nearest, kNear);
      farthest = Math.max(farthest, depth / D);
      const cut = Math.abs(view.x) + r > tanHh * depth || Math.abs(view.y) + r > tanV * depth;
      if (cut && kNear < 1) atEdge++;
    }
    return { nearest: Number.isFinite(nearest) ? +nearest.toFixed(3) : null, farthest: +farthest.toFixed(2), atEdgeInFront: atEdge };
  }

  /** The numbers of the frame as drawn now (call it a frame after the frame's pose: the skins are posed then). */
  // the floor apart from the rest at the border (the fast take: the floor may come nearer at the bottom edge): a border pixel whose
  // depth is the floor's along its ray
  const ray = new THREE.Vector3();
  function isGround(u, vv, depth) {
    ray.set(2 * u - 1, 1 - 2 * vv, 0.5).unproject(camera).sub(camera.position).normalize();
    if (ray.y > -0.01) return false;
    let t = (camera.position.y - (world.heightAt?.(camera.position.x, camera.position.z) ?? 0)) / -ray.y;
    for (let i = 0; i < 4; i++) t = (camera.position.y - world.heightAt(camera.position.x + ray.x * t, camera.position.z + ray.z * t)) / -ray.y;
    const along = t * ray.dot(w.set(0, 0, -1).applyQuaternion(camera.quaternion));
    return Math.abs(depth - along) < 0.1 * along + 0.3;
  }
  /** groundApart: the border's floor apart (background.groundBorder), the rest in background.border. */
  function sample({ groundApart = false } = {}) {
    camera.updateMatrixWorld();
    const herShown = cast.her.root.visible, bShown = cast.butterfly.visible;
    const herPts = herShown ? skinnedPoints(cast.herBody(), 6) : [];
    const bPts = bShown ? meshPoints(cast.butterfly, 3) : [];
    const her = rangeOf(herPts), butterfly = rangeOf(bPts);
    probe ??= createDepthProbe(world, { width: 320 });
    const all = probe.sample(D);
    // the background alone: her and the butterfly hidden for one probe draw
    cast.her.root.visible = false;
    cast.butterfly.visible = false;
    const bg = probe.sample(D, groundApart ? { isGround } : undefined);
    cast.her.root.visible = herShown;
    cast.butterfly.visible = bShown;
    const cl = clouds ? cloudNumbers() : null;
    const bgNear = Math.min(bg.border, bg.middle, bg.wide, cl?.nearest ?? Infinity);
    const bgFar = Math.max(bg.farthest ?? 0, cl?.farthest ?? 0);
    const background = { nearest: +bgNear.toFixed(3), outNear: out(bgNear), farthest: +bgFar.toFixed(2), outFar: out(bgFar), sky: +(bg.sky ?? 0).toFixed(3), border: +bg.border.toFixed(3), borderAt: bg.borderAt, groundBorder: Number.isFinite(bg.groundBorder) ? +bg.groundBorder.toFixed(3) : null, clouds: cl };

    // the butterfly's gap to her (unless it sits on her beak), and her wings' to the plants
    let gap = Infinity;
    if (state.butterfly?.on !== 'beak' && !state.butterfly?.landing) for (const b of bPts) for (const p of herPts) gap = Math.min(gap, b.distanceTo(p));
    const plants = plantGap(herPts);
    const nearest = Math.min(all.border, all.middle, all.wide, her?.near[2] ?? Infinity, butterfly?.near[2] ?? Infinity);
    const bad6 = [...outsideMiddle(herPts, 'her'), ...outsideMiddle(bPts, 'butterfly')];
    const inFront = her && her.near[2] < 1;
    return {
      t: +state.t.toFixed(3), key: state.key, white: +state.white.toFixed(2),
      her, butterfly, background,
      rules: {
        r4: { border: +all.border.toFixed(3), at: all.borderAt, cloudsAtEdge: cl?.atEdgeInFront ?? 0, ok: (all.border >= 0.97 || state.white > 0.99) && !(cl?.atEdgeInFront > 0) },
        r5: { nearest: +nearest.toFixed(3), out: out(nearest), ok: outK(nearest) <= 100 * MAX_OUT + 0.02 },
        r6: { count: bad6.length, worst: bad6.sort((a, b) => b.out - a.out)[0] ?? null, ok: bad6.length === 0 },
        r9: { butterflyGap: Number.isFinite(gap) ? +gap.toFixed(2) : null, plants, ok: (!Number.isFinite(gap) || gap >= 0.5) && (!plants || plants.gap >= 1) },
        r10: inFront ? { span: her.span, bgOut: out(bgFar), ok: her.span >= 1 && outK(bgFar) <= -1.5 } : { ok: true, note: 'not in front' },
      },
    };
  }

  /** The ground rule on a 4:3 picture (the engine keeps the 16:10 width): the ground's depth at the bottom edge, as a share of D. */
  function groundOn43() {
    const c = state.cam;
    const psi = (c.yaw * Math.PI) / 180;
    const f = [Math.sin(psi), -Math.cos(psi)], r = [Math.cos(psi), Math.sin(psi)];
    let worst = Infinity, at = null;
    for (const x of [-1, 0, 1]) {
      // the ray through the bottom edge at x across: (x·tanH, −tanV43, 1) in the camera's frame
      const dir = new THREE.Vector3(f[0] + r[0] * x * tanH, -tanV43, f[1] + r[1] * x * tanH);
      let t = (c.y - base) / tanV43;
      for (let i = 0; i < 6; i++) { const gy = world.heightAt(c.x + dir.x * t, c.z + dir.z * t); t = Math.max(0.1, (c.y - gy) / tanV43); }
      if (t / D < worst) { worst = t / D; at = x; }
    }
    return { k: +worst.toFixed(3), at };
  }
  return { sample, frameOf, groundOn43 };
}
