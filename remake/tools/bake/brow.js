import * as THREE from 'three';

// Softens the look a heavy brow ridge gives the eyes. Tripo sculpted Þórseðla's brows as ridges that
// stand out over the top of each eye and slope down toward the snout, with a deep crease under them,
// which reads stern next to the concept's soft, open eye. Above each eye (the face pass's frame and
// outline, eyes.js) the skin is smoothed: each round moves a vertex along its normal part of the way
// toward the middle of its neighbours, so the ridge sinks and the crease rises into one soft slope
// from the forehead down to the eye, and the painted skin does not slide. The smoothing is strongest
// just over the eye and fades out over the forehead and to the sides; the eye's outline does not move,
// so the painted eye and the eyelids stay where they were. The moved skin takes its normals from its
// new shape.
//
// mesh: the skinned mesh in its bind pose; eyes: findEyes(...).eyes; strength: 1 for the full change.
// Returns how far the skin moved at most (metres) and how many vertices moved.
export function softenBrows(mesh, eyes, { strength = 1, rounds = 40 } = {}) {
  const geometry = mesh.geometry;
  const pos = geometry.attributes.position, nor = geometry.attributes.normal;
  const index = geometry.index.array;
  // One size for both eyes, so the two brows change alike: the mean of their outlines' half sizes.
  const size = eyes.reduce((s, e) => s + e.halfWidth + e.top + e.bottom, 0) / (3 * eyes.length);
  const top = eyes.reduce((s, e) => s + e.top, 0) / eyes.length;
  const half = eyes.reduce((s, e) => s + e.halfWidth, 0) / eyes.length;
  const frames = eyes.map(e => {
    const [centre, right, down, normal] = [e.centre, e.right, e.down, e.normal].map(a => new THREE.Vector3(...a));
    return { centre, right, down, normal };
  });
  const smooth = x => { const t = THREE.MathUtils.clamp(x, 0, 1); return t * t * (3 - 2 * t); };

  // One point per welded position (the copies along UV seams move together), its neighbours along
  // the triangles' edges, and how much it is smoothed.
  const key = i => `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`;
  const ids = new Map();
  const of = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) { const k = key(i); if (!ids.has(k)) ids.set(k, ids.size); of[i] = ids.get(k); }
  const points = Array.from({ length: ids.size }, () => new THREE.Vector3());
  for (let i = 0; i < pos.count; i++) points[of[i]].fromBufferAttribute(pos, i);
  const weight = new Float32Array(ids.size);
  points.forEach((p, id) => {
    for (const f of frames) {
      const q = p.clone().sub(f.centre);
      const u = q.dot(f.right), v = q.dot(f.down), w = q.dot(f.normal);
      if (w < -1.2 * size) continue; // the near side of the head only
      const across = 1 - smooth((Math.abs(u) / half - 1.1) / 1.1);
      const above = (-v - top) / size; // 0 on the outline's top, up from there in eye sizes
      const rise = above <= 0 ? 0 : smooth(above / 0.25) * (1 - smooth((above - 0.8) / 1.0));
      weight[id] = Math.max(weight[id], THREE.MathUtils.clamp(strength * across * rise, 0, 1));
    }
  });
  const near = Array.from({ length: ids.size }, () => new Set());
  for (let t = 0; t < index.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = of[index[t + e]], b = of[index[t + (e + 1) % 3]];
      if (a !== b && (weight[a] > 0 || weight[b] > 0)) { near[a].add(b); near[b].add(a); }
    }
  }
  // Each round moves a point along its normal only, so the painted skin does not slide over the
  // surface: a ridge sinks, a crease rises.
  const normals = Array.from({ length: ids.size }, () => new THREE.Vector3());
  for (let i = 0; i < pos.count; i++) normals[of[i]].add(new THREE.Vector3().fromBufferAttribute(nor, i));
  normals.forEach(v => v.normalize());
  const start = points.map(p => p.clone());
  const next = new THREE.Vector3();
  for (let round = 0; round < rounds; round++) {
    const moved = points.map((p, id) => {
      if (!weight[id] || !near[id].size) return p;
      next.set(0, 0, 0);
      for (const n of near[id]) next.add(points[n]);
      next.divideScalar(near[id].size).sub(p);
      return p.clone().addScaledVector(normals[id], 0.5 * weight[id] * next.dot(normals[id]));
    });
    moved.forEach((p, id) => { points[id] = p; });
  }
  let most = 0, count = 0;
  points.forEach((p, id) => { const d = p.distanceTo(start[id]); if (d > 1e-6) { count++; most = Math.max(most, d); } });
  for (let i = 0; i < pos.count; i++) { const p = points[of[i]]; pos.setXYZ(i, p.x, p.y, p.z); }
  pos.needsUpdate = true;

  // Normals from the moved surface (area-weighted over the welded positions, so both sides of a UV
  // seam agree), blended in where the skin moved.
  const sums = Array.from({ length: ids.size }, () => new THREE.Vector3());
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < index.length; t += 3) {
    const [i0, i1, i2] = [index[t], index[t + 1], index[t + 2]];
    if (!(weight[of[i0]] || weight[of[i1]] || weight[of[i2]])) continue;
    a.fromBufferAttribute(pos, i0); b.fromBufferAttribute(pos, i1); c.fromBufferAttribute(pos, i2);
    const n = b.sub(a).cross(c.sub(a)); // twice the area, along the face normal
    for (const i of [i0, i1, i2]) sums[of[i]].add(n);
  }
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const id = of[i];
    if (!weight[id] || sums[id].lengthSq() === 0) continue;
    n.fromBufferAttribute(nor, i).lerp(sums[id].clone().normalize(), smooth(3 * weight[id])).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  nor.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { moved: count, most: +most.toFixed(4), size: +size.toFixed(4) };
}
