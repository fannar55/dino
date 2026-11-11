// The tree probe: does an animal pass through a tree? (Fiðrildadansinn round 6: Þórseðla's head went through a tree as she walked
// in from the forest; tools/clip-probe.mjs --trees plays her walk in fixed steps and asks this every step.)
//
// The forest's plants are drawn instanced and merged (world/forest/batch.js), so there is no mesh to ray-test; each plant the probe
// is asked about is fitted from its own model's geometry (forest.placements: the planner's placements with their models) as simple
// volumes. The geometry's connected pieces (a trunk tube, a limb, a crown clump, a frond) are each cut into horizontal slices
// SLICE metres thick; a slice is a disc round its vertices' centre, as wide as the farthest of them (so a disc holds its piece's
// slice: a little more than the piece where a piece is not round, never less). The animal is its shell (engine/shell.js: capsules
// fitted from its skin, within a few cm of it); a capsule overlaps a disc where a point of its axis, within its radius, reaches into
// the disc's height and round. The wind's sway of a crown (a few cm, at most 3 degrees) is not modelled.
const SLICE = 0.35;

/** Pieces of a MeshBuilder ({ pos, idx }): its vertices grouped by the triangles that join them (union-find). */
function pieces(m) {
  const n = m.pos.length / 3;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  for (let k = 0; k < m.idx.length; k += 3) {
    const a = find(m.idx[k]), b = find(m.idx[k + 1]), c = find(m.idx[k + 2]);
    parent[b] = a;
    parent[find(c)] = a;
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(i);
  }
  return [...groups.values()];
}

/**
 * The volumes of one placement ({ name, model, x, y, z, rot, scale }) in the world: { name, x, z, discs: [{ y0, y1, cx, cz, r }],
 * box: [x0, y0, z0, x1, y1, z1] }.
 */
export function plantVolumes(p) {
  const c = Math.cos(p.rot), s = Math.sin(p.rot), sc = p.scale;
  const discs = [];
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const m of [p.model.solid, p.model.thin]) {
    if (!m || !m.pos?.length) continue;
    for (const piece of pieces(m)) {
      const slices = new Map();
      for (const i of piece) {
        const lx = m.pos[i * 3], ly = m.pos[i * 3 + 1], lz = m.pos[i * 3 + 2];
        const x = p.x + (lx * c - lz * s) * sc, y = p.y + ly * sc, z = p.z + (lx * s + lz * c) * sc;
        const k = Math.floor(y / SLICE);
        if (!slices.has(k)) slices.set(k, []);
        slices.get(k).push(x, z);
        box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.min(box[2], z);
        box[3] = Math.max(box[3], x); box[4] = Math.max(box[4], y); box[5] = Math.max(box[5], z);
      }
      for (const [k, xz] of slices) {
        let cx = 0, cz = 0;
        const n = xz.length / 2;
        for (let i = 0; i < xz.length; i += 2) { cx += xz[i]; cz += xz[i + 1]; }
        cx /= n; cz /= n;
        let r = 0;
        for (let i = 0; i < xz.length; i += 2) r = Math.max(r, Math.hypot(xz[i] - cx, xz[i + 1] - cz));
        discs.push({ y0: k * SLICE, y1: (k + 1) * SLICE, cx, cz, r });
      }
    }
  }
  return { name: p.name, x: p.x, z: p.z, height: box[4] - p.y, discs, box };
}

/**
 * A probe for one shell against the plants near a path: `placements` (forest.placements), `near(x, z)` true for a plant to keep (by
 * its place). look(capsules) → [{ plant, name, x, z, depth, y, bone }] for every plant a capsule reaches into (depth: metres, the
 * deepest reach of any capsule into one of its discs).
 */
export function createTreeProbe(placements, { near = () => true, minHeight = 1.2 } = {}) {
  const plants = [];
  placements.forEach((p, i) => {
    if (!p.model || !near(p.x, p.z)) return;
    const v = plantVolumes(p);
    if (v.height < minHeight || !v.discs.length) return;
    v.index = i;
    plants.push(v);
  });
  function look(capsules) {
    const out = [];
    for (const plant of plants) {
      const b = plant.box;
      let best = null;
      for (const cap of capsules) {
        const r = cap.r;
        if (Math.max(cap.a[0], cap.b[0]) + r < b[0] || Math.min(cap.a[0], cap.b[0]) - r > b[3]) continue;
        if (Math.max(cap.a[1], cap.b[1]) + r < b[1] || Math.min(cap.a[1], cap.b[1]) - r > b[4]) continue;
        if (Math.max(cap.a[2], cap.b[2]) + r < b[2] || Math.min(cap.a[2], cap.b[2]) - r > b[5]) continue;
        const L = Math.hypot(cap.b[0] - cap.a[0], cap.b[1] - cap.a[1], cap.b[2] - cap.a[2]);
        const n = Math.max(1, Math.ceil(L / Math.max(0.05, r * 0.5)));
        for (let j = 0; j <= n; j++) {
          const t = j / n;
          const x = cap.a[0] + (cap.b[0] - cap.a[0]) * t, y = cap.a[1] + (cap.b[1] - cap.a[1]) * t, z = cap.a[2] + (cap.b[2] - cap.a[2]) * t;
          for (const d of plant.discs) {
            // the ball of radius r at (x, y, z) against the disc's slab: how far it reaches in (round and up)
            const dy = y < d.y0 ? d.y0 - y : y > d.y1 ? y - d.y1 : 0;
            if (dy >= r) continue;
            const reachR = Math.sqrt(r * r - dy * dy); // the ball's half-width at the slab's nearer face
            const depth = d.r + reachR - Math.hypot(x - d.cx, z - d.cz);
            if (depth > 0 && (!best || depth > best.depth)) best = { depth, y, bone: cap.bone };
          }
        }
      }
      if (best) out.push({ plant: plant.index, name: plant.name, x: +plant.x.toFixed(2), z: +plant.z.toFixed(2), depth: best.depth, y: +best.y.toFixed(2), bone: best.bone });
    }
    return out;
  }
  return { look, plants };
}
