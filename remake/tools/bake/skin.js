// One skin from a Tripo model kept in parts, for the bake tools that rig such a model (quadruped-rig.js,
// winged-rig.js), and the weights they give it: along a chain of bones, and fields that spread over
// the surface.
//
// Tripo cuts a model into parts along seams whose two sides match, and blender-decimate.py decimates
// the parts as one mesh, so they still match vertex for vertex: welded, they make one closed surface.
// A part is { geometry (indexed), points (its vertices as Vector3s), verts (their count) }.

export const WELD = 0.001; // metres
const smooth = u => u * u * (3 - 2 * u);

/** Which parts meet which along a seam: Map part -> Set of the parts it shares a vertex position with. */
export function touchingParts(parts) {
  const touching = new Map(parts.map(p => [p, new Set()]));
  const grid = new Map();
  for (const part of parts) {
    for (const q of part.points) {
      const k = `${Math.round(q.x / WELD)},${Math.round(q.y / WELD)},${Math.round(q.z / WELD)}`;
      if (!grid.has(k)) grid.set(k, new Set());
      grid.get(k).add(part);
    }
  }
  for (const set of grid.values()) for (const a of set) for (const b of set) if (a !== b) touching.get(a).add(b);
  return touching;
}

/**
 * Welds the parts into one skin. Seam vertices snap onto their cluster's first vertex (after
 * blender-decimate.py they lie on top of each other); normals and UVs stay as the parts carry them.
 * A sliver whose corners weld together is dropped. Each part gets `offset`, its first vertex in the
 * skin. Returns the skin:
 *   rep      the cluster (its first vertex) of every vertex
 *   owner    the part of every vertex
 *   at(r)    a cluster's position
 *   edges    Map of the welded edges: { n triangles, turn, a, b (clusters), part }
 *   partsAt  Map cluster -> Set of the parts that meet there
 *   seamOf(part)  the clusters where a part meets another
 *   closed   every edge has two triangles that run it in opposite directions
 *   report   counts for the bake's report
 */
export function weldSkin(parts) {
  let offset = 0;
  for (const part of parts) { part.offset = offset; offset += part.verts; }
  const owner = [];
  for (const part of parts) for (let i = 0; i < part.verts; i++) owner.push(part);
  const rep = new Int32Array(offset);
  const grid = new Map();
  const cell = v => [Math.floor(v.x / WELD), Math.floor(v.y / WELD), Math.floor(v.z / WELD)];
  const at = r => owner[r].points[r - owner[r].offset];
  for (const part of parts) {
    const pos = part.geometry.attributes.position;
    for (let i = 0; i < part.verts; i++) {
      const g = part.offset + i;
      const q = part.points[i];
      const [cx, cy, cz] = cell(q);
      let found = -1;
      for (let dx = -1; dx <= 1 && found < 0; dx++) for (let dy = -1; dy <= 1 && found < 0; dy++) for (let dz = -1; dz <= 1 && found < 0; dz++) {
        for (const other of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) {
          if (q.distanceTo(at(other)) <= WELD) { found = other; break; }
        }
      }
      if (found >= 0) {
        rep[g] = found;
        q.copy(at(found));
        pos.setXYZ(i, q.x, q.y, q.z);
      } else {
        rep[g] = g;
        const key = `${cx},${cy},${cz}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(g);
      }
    }
  }
  // A sliver whose corners weld together has no area left: drop it, so its doubled edge does not
  // count against the skin below.
  let slivers = 0;
  for (const part of parts) {
    const ix = part.geometry.index.array;
    const kept = [];
    for (let t = 0; t < ix.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map(e => rep[part.offset + ix[t + e]]);
      if (a === b || b === c || a === c) slivers++;
      else kept.push(ix[t], ix[t + 1], ix[t + 2]);
    }
    if (kept.length < ix.length) part.geometry.setIndex(kept);
  }
  // Each edge of the welded surface must belong to exactly two triangles that run it in opposite
  // directions; then the skin is closed and consistently wound.
  const edges = new Map();
  const partsAt = new Map(); // cluster -> the parts that meet there
  for (const part of parts) {
    const ix = part.geometry.index.array;
    for (let t = 0; t < ix.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = rep[part.offset + ix[t + e]], b = rep[part.offset + ix[t + (e + 1) % 3]];
        if (!partsAt.has(a)) partsAt.set(a, new Set());
        partsAt.get(a).add(part);
        if (a === b) continue;
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        const edge = edges.get(key) || { n: 0, turn: 0, a: Math.min(a, b), b: Math.max(a, b), part };
        edge.n++;
        edge.turn += a < b ? 1 : -1;
        edges.set(key, edge);
      }
    }
  }
  let open = 0, nonManifold = 0, misWound = 0;
  for (const edge of edges.values()) {
    if (edge.n === 1) open++;
    else if (edge.n > 2) nonManifold++;
    else if (edge.turn !== 0) misWound++;
  }
  const closed = open === 0 && misWound === 0;
  const seamOf = part => [...partsAt].filter(([, set]) => set.size > 1 && set.has(part)).map(([r]) => r);
  return {
    rep, owner, at, edges, partsAt, seamOf, closed,
    report: { vertices: offset, welded: new Set(rep).size, triangles: [...edges.values()].reduce((s, e) => s + e.n, 0) / 3, slivers, openEdges: open, misWound, nonManifold, closed },
  };
}

/** Distances along the skin's surface: from the seed clusters over the edges of the given parts, up
 *  to `limit` (Dijkstra). Returns Map cluster -> metres. */
export function surfaceDistance(skin, seeds, within, limit = Infinity) {
  const { edges, at } = skin;
  const near = new Map();
  for (const edge of edges.values()) {
    if (!within.has(edge.part)) continue;
    const d = at(edge.a).distanceTo(at(edge.b));
    for (const [from, to] of [[edge.a, edge.b], [edge.b, edge.a]]) {
      if (!near.has(from)) near.set(from, []);
      near.get(from).push([to, d]);
    }
  }
  const distance = new Map(seeds.map(r => [r, 0]));
  const heap = seeds.map(r => [0, r]);
  const swap = (i, j) => { const t = heap[i]; heap[i] = heap[j]; heap[j] = t; };
  while (heap.length) {
    const [d, r] = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const a = 2 * i + 1, b = a + 1;
        let m = i;
        if (a < heap.length && heap[a][0] < heap[m][0]) m = a;
        if (b < heap.length && heap[b][0] < heap[m][0]) m = b;
        if (m === i) break;
        swap(i, m);
        i = m;
      }
    }
    if (d > distance.get(r)) continue;
    for (const [to, len] of near.get(r) || []) {
      const next = d + len;
      if (next > limit || next >= (distance.get(to) ?? Infinity)) continue;
      distance.set(to, next);
      heap.push([next, to]);
      for (let i = heap.length - 1; i > 0;) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        swap(i, p);
        i = p;
      }
    }
  }
  return distance;
}

/**
 * A field that spreads over the skin as heat would (harmonic): over the clusters on the edges of the
 * given parts, `start(r)` gives each cluster its value and whether it is free ({ value, free }, or
 * nothing: fixed at 0); a free cluster settles to the mean of its neighbours, edges weighted by
 * 1 / length (Gauss-Seidel with over-relaxation). `channels` values per cluster are solved at once
 * (start's value is then an array). Returns Map cluster -> value (or Float64Array of the channels).
 */
export function harmonicField(skin, domain, start, { channels = 0, passes = 4000, tolerance = 1e-6 } = {}) {
  const { edges, at } = skin;
  const ids = new Map();
  const links = [];
  for (const edge of edges.values()) {
    if (!domain.has(edge.part)) continue;
    for (const r of [edge.a, edge.b]) if (!ids.has(r)) { ids.set(r, ids.size); links.push([]); }
    const k = 1 / Math.max(1e-6, at(edge.a).distanceTo(at(edge.b)));
    links[ids.get(edge.a)].push(ids.get(edge.b), k);
    links[ids.get(edge.b)].push(ids.get(edge.a), k);
  }
  const n = Math.max(1, channels);
  const value = new Float64Array(ids.size * n);
  const free = new Uint8Array(ids.size);
  for (const [r, i] of ids) {
    const s = start(r);
    if (!s) continue;
    free[i] = s.free ? 1 : 0;
    if (channels) for (let c = 0; c < n; c++) value[i * n + c] = s.value[c] ?? 0;
    else value[i] = s.value;
  }
  const sum = new Float64Array(n);
  for (let pass = 0; pass < passes; pass++) {
    let change = 0;
    for (let i = 0; i < ids.size; i++) {
      if (!free[i]) continue;
      const list = links[i];
      if (!channels) {
        let s = 0, weight = 0;
        for (let j = 0; j < list.length; j += 2) { s += value[list[j]] * list[j + 1]; weight += list[j + 1]; }
        const next = value[i] + 1.8 * (s / weight - value[i]);
        change = Math.max(change, Math.abs(next - value[i]));
        value[i] = next;
        continue;
      }
      sum.fill(0);
      let weight = 0;
      for (let j = 0; j < list.length; j += 2) {
        const o = list[j] * n, k = list[j + 1];
        for (let c = 0; c < n; c++) sum[c] += value[o + c] * k;
        weight += k;
      }
      for (let c = 0; c < n; c++) {
        const next = value[i * n + c] + 1.8 * (sum[c] / weight - value[i * n + c]);
        change = Math.max(change, Math.abs(next - value[i * n + c]));
        value[i * n + c] = next;
      }
    }
    if (change < tolerance) break;
  }
  return new Map([...ids].map(([r, i]) => [r, channels ? value.slice(i * n, i * n + n) : value[i]]));
}

/**
 * Weights along a chain of bones on the centre line of a body. `owners` runs from the tail's tip to the
 * head (TailN .. Tail1, then the bone that joins them, `joins`, then the spine, neck and head); each
 * owns the stretch from its joint to the next one (a tail bone the stretch behind its joint), blended
 * over a band around each joint, so a bone that turns bends the skin about its own joint. Every joint
 * but the joining bone's is a cut: owners[k] holds the stretch (cuts[k-1], cuts[k]).
 * Where along the chain a point lies (`along`): its x, or with `curve` its place along the line
 * through the joints from the tail's tip to the head (in the side view: x and y), so a cross-section
 * of a raised neck is one place; a point far from the line (the chest under the neck) blends the
 * places of the stretches nearly as close as the nearest one, so the inside of a bend has no seam of
 * its own. With `curve` the head stays rigid in front of its joint (the eyes and the mouth move as
 * one): the blend into the neck lies behind the joint. `tip` (a point in front of the head: the nose)
 * runs the line on through the head to it, for a long head on a steep neck (Slóeðla's); otherwise the
 * line runs on past the head's joint the way the neck points, up, and the front of a long bill, far
 * from it, would take places behind the joint. `length` (metres) sets how sharply places blend.
 * Returns { along(p), weights(place, out) }: weights pushes [bone, weight] pairs onto out.
 */
export function chainWeighting(owners, joints, { curve = false, length = 1, joins = 'Hips', tip = null } = {}) {
  let along = p => p.x;
  if (curve) {
    const line = owners.map(n => joints[n]);
    if (tip) line.push(tip);
    const stretches = line.slice(1).map((b, k) => {
      const a = line[k], len = Math.hypot(b.x - a.x, b.y - a.y);
      return { a, ux: (b.x - a.x) / len, uy: (b.y - a.y) / len, len };
    });
    const start = [0];
    stretches.forEach((s, k) => start.push(start[k] + s.len));
    along = p => {
      let nearest = Infinity;
      const places = stretches.map((s, k) => {
        let u = (p.x - s.a.x) * s.ux + (p.y - s.a.y) * s.uy;
        if (k > 0) u = Math.max(0, u); // the ends run on past the tail's tip and the head
        if (k < stretches.length - 1) u = Math.min(s.len, u);
        const d = Math.hypot(p.x - s.a.x - u * s.ux, p.y - s.a.y - u * s.uy);
        nearest = Math.min(nearest, d);
        return [start[k] + u, d];
      });
      const sigma = 0.01 * length + 0.25 * nearest;
      let sum = 0, weight = 0;
      for (const [t, d] of places) { const w = Math.exp(-(((d - nearest) / sigma) ** 2)); sum += w * t; weight += w; }
      return sum / weight;
    };
  }
  const cuts = owners.filter(n => n !== joins).map(n => along(joints[n]));
  if (cuts.some((x, k) => k && x <= cuts[k - 1])) throw new Error(`the chain's joints are out of order along the body: ${owners.join(' ')}`);
  const halfBand = cuts.map((x, k) => {
    const left = k > 0 ? x - cuts[k - 1] : Infinity;
    const right = k < cuts.length - 1 ? cuts[k + 1] - x : Infinity;
    return 0.45 * Math.min(left, right);
  });
  const headCut = cuts.length - 1;
  const headBand = curve ? Math.min(2 * halfBand[headCut], cuts[headCut] - cuts[headCut - 1] - halfBand[headCut - 1]) : 0;
  function weights(x, out) {
    let k = 0;
    while (k < cuts.length && x > cuts[k]) k++; // owners[k] holds x
    for (const j of [k - 1, k]) {
      if (curve && j === headCut) {
        if (x <= cuts[j] - headBand || x >= cuts[j]) continue;
        const s = smooth((x - (cuts[j] - headBand)) / headBand);
        out.push([owners[j], 1 - s], [owners[j + 1], s]);
        return;
      }
      if (j < 0 || j >= cuts.length || Math.abs(x - cuts[j]) >= halfBand[j]) continue;
      const s = smooth((x - (cuts[j] - halfBand[j])) / (2 * halfBand[j]));
      out.push([owners[j], 1 - s], [owners[j + 1], s]);
      return;
    }
    out.push([owners[k], 1]);
  }
  return { along, weights, cuts };
}
