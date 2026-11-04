import * as THREE from 'three';
import { GAP } from './upper-ground.js';

/**
 * The dead trunk at the gap and Sólarsyllan beyond it (Task 6): the owner's trunk (assets/memory/bord2/gorge-trunk.glb, his Tripo3D model, gorge-trunk-source.json) stands on the
 * clifftop at the gap's near lip, 7 m tall, more than twice the Þórseðlur's height. Everyone pulls the second rope tied at the stub near its top (the rope goes over the gap and round
 * the stone on Sólarsyllan, so that a pull from the near side throws the top away from the pullers): each pull tilts it a step, the third throws it over, and it lies across the gap
 * with its roots on the near rim and its top on Sólarsyllan, a bridge the friends walk over in single file. Nothing here is drawn or modelled: the model is the owner's, his colours
 * kept; this places it, turns it and tilts it.
 *
 * Told in the upper gorge's frame (upper.js: x forward, z to the right, y up); its group is a child of the frame's group.
 *
 *   createTrunk({ THREE, parent, model, groundAt, grey })
 *     angle, steps, fallen   its tilt in degrees toward the gap (0 standing; `steps` the three pulls' tilts; `fallen` lying on both rims)
 *     set(degrees)           tilts it
 *     tie(degrees)           where the second rope is tied: the stub near its top, at that tilt (now, without one): a point of the frame
 *     top(degrees)           the middle of its top end
 *     roots()                the edge of its root plate on the near side (it lifts as the trunk tips: the dust comes from there)
 *     deck                   lying: the line along its top the friends walk ({ from, to, at(x) -> { z, y } }), and surface(x, z): the height of its top there, or null off it
 *     cover(reach, slope, from)  lying: a height field over it and round it that a body `reach` wide either side keeps over the bark (its side falling away at `slope`;
 *                            `from`: only the mesh from that x of the frame on, so the root plate can be left out: a walk keeps wide of it instead)
 *     solids()               capsules of it as it stands or lies now (frame points, radius): the walks keep clear of it
 *     boxes()                oriented boxes of it now (frame) for the clearance audit
 *     reset()
 * It is turned half round (yaw π) on its foot so that, lying, its clean side is up (the stub at 4.9 m and the bulges low on it point down into the gap, and the stub at the top,
 * where the rope is tied, points out sideways toward the open side, where a Flugeðla reaches it while it stands). `grey` (the page's ?bolur=grar) greys its bark in the shader.
 */
export const TRUNK = Object.freeze({ base: Object.freeze([39.3, 9.2]), hinge: .45, steps: Object.freeze([0, 7, 15, 24]) });
const DEG = Math.PI / 180;

export function createTrunk({ THREE: T = THREE, parent, model, groundAt, grey = false }) {
  const baseY = groundAt(TRUNK.base[0], TRUNK.base[1]);
  const pivot = new T.Group(); pivot.name = 'Stofninn (lömin)'; pivot.position.set(TRUNK.base[0], baseY + TRUNK.hinge, TRUNK.base[1]);
  const holder = new T.Group(); holder.position.set(0, -TRUNK.hinge, 0); holder.rotation.y = Math.PI; pivot.add(holder);
  const material = model.material.clone(); material.side = T.FrontSide;
  if (grey) {
    // (the owner's colours are the default; ?bolur=grar greys the bark after its texture, so that a grey trunk can be seen beside his brown)
    material.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\nfloat trunkGrey = dot(diffuseColor.rgb, vec3(.299, .587, .114));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(trunkGrey) * vec3(1.02, 1.0, .96), .88);'); };
    material.customProgramCacheKey = () => 'gorge-trunk-grey';
  }
  const mesh = new T.Mesh(model.geometry, material); mesh.name = 'Stofninn'; mesh.castShadow = true; mesh.receiveShadow = true; holder.add(mesh);
  parent.add(pivot);

  // ---- the model's shape: its vertices in its own frame, read once ----
  const source = model.geometry.attributes.position, count = source.count, verts = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { verts[i * 3] = source.getX(i); verts[i * 3 + 1] = source.getY(i); verts[i * 3 + 2] = source.getZ(i); }
  let height = 0; for (let i = 0; i < count; i++) height = Math.max(height, verts[i * 3 + 1]);
  // the middle of the stem at a height (model frame), and its radius there: the mean and the reach of the vertices in a band
  const ring = (y, band = .18) => { let sx = 0, sz = 0, n = 0; for (let i = 0; i < count; i++) if (Math.abs(verts[i * 3 + 1] - y) < band) { sx += verts[i * 3]; sz += verts[i * 3 + 2]; n++; } const cx = n ? sx / n : 0, cz = n ? sz / n : 0; let r = 0; for (let i = 0; i < count; i++) if (Math.abs(verts[i * 3 + 1] - y) < band) { const d = Math.hypot(verts[i * 3] - cx, verts[i * 3 + 2] - cz); r += d; } return { x: cx, z: cz, r: n ? r / n : .4 }; };
  // the stub near the top that the rope is tied to: the vertices between 5.6 and 6.3 m up farthest out on the model's +z side (yaw π turns it to the open side)
  const stub = (() => { let best = null; for (let i = 0; i < count; i++) { const y = verts[i * 3 + 1]; if (y > 5.6 && y < 6.3 && (!best || verts[i * 3 + 2] > best[2])) best = [verts[i * 3], y, verts[i * 3 + 2]]; } const c = ring(5.95); return best ? new T.Vector3(c.x + (best[0] - c.x) * .62, best[1], c.z + (best[2] - c.z) * .62) : new T.Vector3(c.x, 5.95, c.z + .5); })();
  const topRing = ring(height - .25, .2), rootRing = ring(.15, .15);

  // ---- its pose: the model's frame into the gorge's at a tilt ----
  const matrix = new T.Matrix4(), q = new T.Quaternion(), zAxis = new T.Vector3(0, 0, 1), pose = new T.Matrix4();
  const poseAt = degrees => { pose.compose(pivot.position, q.setFromAxisAngle(zAxis, -degrees * DEG), new T.Vector3(1, 1, 1)); return matrix.multiplyMatrices(pose, holder.matrix.clone().multiply(mesh.matrix)); };
  holder.updateMatrix(); mesh.updateMatrix();
  const toFrame = (point, degrees) => point.clone().applyMatrix4(poseAt(degrees));

  // The tilt at which it lies on both rims: from 90 degrees, as far down as its underside over Sólarsyllan comes to the ground (its root plate, at the hinge, is half in the
  // near rim, as a fallen tree's is in the soil).
  const clearanceFar = degrees => {
    const m = poseAt(degrees), e = m.elements; let low = Infinity;
    for (let i = 0; i < count; i += 2) {
      const x = verts[i * 3], y = verts[i * 3 + 1], z = verts[i * 3 + 2], fx = e[0] * x + e[4] * y + e[8] * z + e[12]; if (fx < GAP.far + .05) continue;
      const fy = e[1] * x + e[5] * y + e[9] * z + e[13], fz = e[2] * x + e[6] * y + e[10] * z + e[14]; low = Math.min(low, fy - groundAt(fx, fz));
    }
    return low;
  };
  let fallen = 90; { let lo = 84, hi = 100; for (let k = 0; k < 28; k++) { const mid = (lo + hi) / 2; if (clearanceFar(mid) > .015) lo = mid; else hi = mid; } fallen = +((lo + hi) / 2).toFixed(2); }
  let angle = 0;

  // ---- lying: the deck the friends walk on ----
  // The top of the bark along the trunk as it lies, in 0.1 m bins of the frame's x: the line of its ridge (z) and the highest bark within 0.32 m either side of it (y), taken
  // as the most over 0.3 m each way, so that no toe comes down into a knot ahead of it.
  const lying = (() => { const e = poseAt(fallen).elements, out = []; for (let i = 0; i < count; i++) { const x = verts[i * 3], y = verts[i * 3 + 1], z = verts[i * 3 + 2]; out.push([e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]); } return out; })();
  const deck = (() => {
    const x0 = Math.floor((pivot.position.x - TRUNK.hinge - .2) * 10) / 10, bins = new Map(), pts = lying;
    // the ridge's z: where the highest vertex of each bin is, smoothed
    const ridge = new Map();
    for (const [x, y, z] of pts) { const k = Math.round((x - x0) * 10); const r = ridge.get(k); if (!r || y > r[0]) ridge.set(k, [y, z]); }
    const keys = [...ridge.keys()].sort((a, b) => a - b), zOf = new Map();
    for (const k of keys) { let s = 0, n = 0; for (let d = -4; d <= 4; d++) { const r = ridge.get(k + d); if (r) { s += r[1]; n++; } } zOf.set(k, s / n); }
    for (const [x, y, z] of pts) { const k = Math.round((x - x0) * 10), rz = zOf.get(k) ?? z; if (Math.abs(z - rz) > .32) continue; bins.set(k, Math.max(bins.get(k) ?? -Infinity, y)); }
    const yOf = new Map(); for (const k of keys) { let top = -Infinity; for (let d = -3; d <= 3; d++) top = Math.max(top, bins.get(k + d) ?? -Infinity); if (Number.isFinite(top)) yOf.set(k, top); }
    const first = keys[0], last = keys.at(-1);
    const at = x => { const k = Math.min(last, Math.max(first, Math.round((x - x0) * 10))); return { z: zOf.get(k) ?? TRUNK.base[1], y: yOf.get(k) ?? baseY + 2 * TRUNK.hinge }; };
    // (the half width of its top that a foot stands on: the stem's radius at that place, from the middle of the ridge)
    const radius = x => { const h = Math.max(0, x - (pivot.position.x - TRUNK.hinge)); return Math.max(.25, ring(Math.min(height - .2, h), .25).r); };
    return { from: x0 + first / 10, to: x0 + last / 10, at, radius };
  })();
  /** The height of the lying trunk's top at a point of the frame (the bark's round falls away either side of its ridge), or null off it. */
  const surface = (x, z) => {
    if (angle < fallen - .5 || x < deck.from + 1.2 || x > deck.to - .15) return null;
    const { z: rz, y } = deck.at(x), r = deck.radius(x), dz = Math.abs(z - rz); if (dz > r) return null;
    return y - (r - Math.sqrt(Math.max(0, r * r - dz * dz))) * .85;
  };
  // What a body walking over it and beside it clears: the bark's highest vertex in each 0.1 m cell of the frame as it lies, and from those a height field, as high as the
  // highest bark within `reach` of a point (a body that wide either side of its line clears all of it) and beyond that falling away `slope` metres a metre (it steps up the
  // trunk's side toes first, not all at once), down to the rim it stands on. Made once for each reach.
  const CELL = .1, covers = new Map();
  const coverOf = (reach, slope, from = -Infinity) => {
    const key = `${reach.toFixed(2)}|${slope.toFixed(2)}|${from}`; if (covers.has(key)) return covers.get(key);
    const tops = new Map(); let top = -Infinity, i0 = Infinity, i1 = -Infinity, k0 = Infinity, k1 = -Infinity;
    for (const [x, y, z] of lying) { if (x < from) continue; const i = Math.floor(x / CELL), k = Math.floor(z / CELL), c = (i + 50000) * 100000 + k + 50000; if (!(tops.get(c) >= y)) tops.set(c, y); top = Math.max(top, y); i0 = Math.min(i0, i); i1 = Math.max(i1, i); k0 = Math.min(k0, k); k1 = Math.max(k1, k); }
    const margin = Math.ceil((reach + Math.max(0, top - baseY) / slope) / CELL) + 1, gi = i0 - margin, gk = k0 - margin, ni = i1 - i0 + 1 + 2 * margin, nk = k1 - k0 + 1 + 2 * margin;
    const grid = new Float32Array(ni * nk).fill(baseY - 1);
    for (const [c, y] of tops) {
      const i = Math.floor(c / 100000) - 50000, k = c % 100000 - 50000, r = Math.ceil((reach + Math.max(0, y - baseY) / slope) / CELL) + 1;
      for (let di = -r; di <= r; di++) for (let dk = -r; dk <= r; dk++) {
        // (from the cell's nearest edge, as the vertex may be anywhere in it)
        const d = Math.hypot(Math.max(0, Math.abs(di) - .5), Math.max(0, Math.abs(dk) - .5)) * CELL, h = y - Math.max(0, d - reach) * slope, at = (i + di - gi) * nk + (k + dk - gk);
        if (h > grid[at]) grid[at] = h;
      }
    }
    // (bilinear between the cells' middles; off the field, null)
    const field = (x, z) => {
      if (angle < fallen - .5) return null;
      const u = x / CELL - .5 - gi, w = z / CELL - .5 - gk, a = Math.floor(u), b = Math.floor(w); if (a < 0 || b < 0 || a + 1 >= ni || b + 1 >= nk) return null;
      const s = u - a, t = w - b, g = grid;
      return (g[a * nk + b] * (1 - t) + g[a * nk + b + 1] * t) * (1 - s) + (g[(a + 1) * nk + b] * (1 - t) + g[(a + 1) * nk + b + 1] * t) * s;
    };
    covers.set(key, field); return field;
  };

  const api = {
    group: pivot, mesh, triangles: model.triangles, height, steps: TRUNK.steps, get fallen() { return fallen; }, get angle() { return angle; },
    set(degrees) { angle = degrees; pivot.rotation.set(0, 0, -degrees * DEG); pivot.updateMatrixWorld(true); },
    tie: (degrees = angle) => toFrame(stub, degrees),
    top: (degrees = angle) => toFrame(new T.Vector3(topRing.x, height - .25, topRing.z), degrees),
    point: (h, degrees = angle) => { const c = ring(Math.min(height - .2, Math.max(.2, h))); return toFrame(new T.Vector3(c.x, h, c.z), degrees); },
    roots: (degrees = angle) => toFrame(new T.Vector3(rootRing.x + 1.2, .05, rootRing.z), degrees), // (yaw π: the model's +x is the frame's -x, the side away from the gap)
    deck, surface,
    /** Lying: `cover(reach, slope, from)(x, z)` the height a body `reach` wide either side of its line keeps over the bark at a point of the frame (above), or null off it. */
    cover: coverOf,
    /** The lying trunk's walk: the frame points along its ridge from `from` to `to` (x), each on its top. */
    line(from, to, step = .5) { const out = []; for (let x = from; x <= to + 1e-6; x += step) { const { z, y } = deck.at(x); out.push(new T.Vector3(x, y, z)); } return out; },
    /** Capsules of it now (frame): its stem in three pieces and its root plate. */
    solids() {
      const out = [], pieces = [[.2, 2.2], [2.2, 4.6], [4.6, height - .2]];
      for (const [a, b] of pieces) out.push({ id: `trunk-${out.length}`, a: api.point(a), b: api.point(b), radius: ring(a).r * .95 });
      out.push({ id: 'trunk-roots', a: api.point(.25), b: api.point(.6), radius: 1.2 });
      return out;
    },
    /** Oriented boxes of it now (frame): its stem in seven lengths, each as wide as the bark there. */
    boxes() {
      const out = [], n = 7, R = new T.Matrix4().makeRotationZ(-angle * DEG), axes = [[R.elements[0], R.elements[1], R.elements[2]], [R.elements[4], R.elements[5], R.elements[6]], [R.elements[8], R.elements[9], R.elements[10]]];
      for (let k = 0; k < n; k++) {
        const a = .3 + (height - .5) * k / n, b = .3 + (height - .5) * (k + 1) / n, r = ring((a + b) / 2, .3).r, c = api.point((a + b) / 2);
        out.push({ name: `trunk-${k}`, kind: 'trunk', center: c.toArray(), axes, half: [r * .9, (b - a) / 2, r * .9] });
      }
      return out;
    },
    reset() { api.set(0); },
    debug: () => ({ angle: +angle.toFixed(2), fallen, height: +height.toFixed(2), tie: api.tie().toArray().map(v => +v.toFixed(2)), top: api.top().toArray().map(v => +v.toFixed(2)), deck: [+deck.from.toFixed(2), +deck.to.toFixed(2)] }),
    dispose() { parent.remove(pivot); material.dispose(); },
  };
  api.set(0);
  return api;
}
