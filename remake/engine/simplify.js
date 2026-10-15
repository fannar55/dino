// Mesh simplification for character LODs and shadow casters. Quadric-error edge collapses (Garland
// and Heckbert) on the mesh with its seams welded by position. Every collapse moves one vertex onto
// a neighbour, so the result is made of the original mesh's own vertices: whatever they carry (skin
// weights, normals, UVs) stays valid and the original vertex buffers can be shared. It runs in
// passes, like meshoptimizer: score every edge, collapse the cheapest ones that do not touch each
// other, rebuild, repeat. A collapse is skipped if it would fold a triangle over or pinch two sheets
// together (the link condition), so a closed skin stays closed.
//
// Vertices split by a seam (UV or normal) never move, and every triangle corner keeps an original
// vertex of its own side, so a result draws with the original vertex buffers.
//
//   simplify(positions, index, { levels, skin })
//     positions  Float32Array, xyz per vertex       index  integer array (triangles) or null
//     levels     [{ ratio, maxError }, ...]: triangles to keep (fraction, falling) and the largest
//                error allowed (distance, mesh units); one run makes every level in turn
//     skin       { indices, weights }: 4 per vertex (optional); joining vertices that follow different
//                bones costs more, so joints keep their shape when the skeleton bends
//     keep       Uint8Array, 1 per vertex (optional): vertices that never move, like those on seams
//   -> [{ corners: Uint32Array (original vertex of each triangle corner), triangles, error }, ...]

const BOUNDARY_WEIGHT = 10; // open borders keep their outline
const FLIP_COS = 0.2; // a triangle may turn at most about 78 degrees in one collapse
const SKIN_COST = 0.25; // a join between vertices with no bone in common costs this much of maxError²

export function simplify(positions, index, { levels = [{ ratio: 0.25, maxError: Infinity }], skin = null, keep = null } = {}) {
  const count = positions.length / 3;
  const source = index ?? Uint32Array.from({ length: count }, (_, i) => i);

  // weld vertices with identical positions (seams split them), with an open-addressing hash on the
  // float bits
  const bits = new Int32Array(Float32Array.from(positions).buffer);
  const size = 1 << Math.ceil(Math.log2(count * 2 + 2));
  const table = new Int32Array(size).fill(-1);
  const weldOf = new Int32Array(count);
  const firstOf = []; // welded vertex -> its first original vertex
  for (let i = 0; i < count; i++) {
    const x = bits[i * 3], y = bits[i * 3 + 1], z = bits[i * 3 + 2];
    let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & (size - 1);
    for (;;) {
      const j = table[h];
      if (j < 0) { table[h] = i; weldOf[i] = firstOf.length; firstOf.push(i); break; }
      if (bits[j * 3] === x && bits[j * 3 + 1] === y && bits[j * 3 + 2] === z) { weldOf[i] = weldOf[j]; break; }
      h = (h + 1) & (size - 1);
    }
  }
  const V = firstOf.length;
  const P = new Float64Array(V * 3);
  firstOf.forEach((i, w) => { P[w * 3] = positions[i * 3]; P[w * 3 + 1] = positions[i * 3 + 1]; P[w * 3 + 2] = positions[i * 3 + 2]; });
  // a welded vertex with more than one original vertex sits on a seam: it stays put
  const wedges = new Int32Array(V);
  for (let i = 0; i < count; i++) wedges[weldOf[i]]++;
  const locked = wedges.map(n => (n > 1 ? 1 : 0));
  if (keep) for (let i = 0; i < count; i++) if (keep[i]) locked[weldOf[i]] = 1;
  // skin weights per welded vertex: 4 bones and 4 weights
  const SB = skin ? new Int32Array(V * 4) : null, SW = skin ? new Float32Array(V * 4) : null;
  if (skin) firstOf.forEach((i, w) => { for (let k = 0; k < 4; k++) { SB[w * 4 + k] = skin.indices[i * 4 + k]; SW[w * 4 + k] = skin.weights[i * 4 + k]; } });

  // triangles on welded vertices, and the original vertex at each corner
  let T = 0;
  const tri = new Int32Array(source.length);
  const cor = new Int32Array(source.length);
  for (let t = 0; t < source.length; t += 3) {
    const a = weldOf[source[t]], b = weldOf[source[t + 1]], c = weldOf[source[t + 2]];
    if (a === b || b === c || c === a) continue;
    tri[T * 3] = a; tri[T * 3 + 1] = b; tri[T * 3 + 2] = c;
    cor[T * 3] = source[t]; cor[T * 3 + 1] = source[t + 1]; cor[T * 3 + 2] = source[t + 2];
    T++;
  }
  const alive = new Uint8Array(T).fill(1);
  let live = T;

  // quadrics: the upper triangle of the symmetric 4x4, plus the summed weight (11 per vertex).
  // Planes are weighted by triangle area; the error of a point is the weighted mean squared distance.
  const Q = new Float64Array(V * 11);
  const addPlane = (v, nx, ny, nz, d, w) => {
    const q = v * 11;
    Q[q] += w * nx * nx; Q[q + 1] += w * nx * ny; Q[q + 2] += w * nx * nz; Q[q + 3] += w * nx * d;
    Q[q + 4] += w * ny * ny; Q[q + 5] += w * ny * nz; Q[q + 6] += w * ny * d;
    Q[q + 7] += w * nz * nz; Q[q + 8] += w * nz * d; Q[q + 9] += w * d * d; Q[q + 10] += w;
  };
  const N = new Float64Array(3);
  const normalOf = (a, b, c) => {
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    N[0] = uy * vz - uz * vy; N[1] = uz * vx - ux * vz; N[2] = ux * vy - uy * vx;
    return Math.hypot(N[0], N[1], N[2]);
  };
  const edgeUse = new Map(); // directed edge -> triangle, to find open borders
  for (let t = 0; t < T; t++) {
    const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
    const len = normalOf(a, b, c);
    edgeUse.set(a * V + b, t); edgeUse.set(b * V + c, t); edgeUse.set(c * V + a, t);
    if (len === 0) continue;
    const nx = N[0] / len, ny = N[1] / len, nz = N[2] / len;
    const d = -(nx * P[a * 3] + ny * P[a * 3 + 1] + nz * P[a * 3 + 2]);
    addPlane(a, nx, ny, nz, d, len / 2); addPlane(b, nx, ny, nz, d, len / 2); addPlane(c, nx, ny, nz, d, len / 2);
  }
  for (const [key, t] of edgeUse) {
    const a = Math.floor(key / V), b = key - a * V;
    if (edgeUse.has(b * V + a)) continue; // shared by two triangles
    const len = normalOf(tri[t * 3], tri[t * 3 + 1], tri[t * 3 + 2]);
    if (len === 0) continue;
    const ex = P[b * 3] - P[a * 3], ey = P[b * 3 + 1] - P[a * 3 + 1], ez = P[b * 3 + 2] - P[a * 3 + 2];
    // the plane through the border edge, standing up from its triangle
    let mx = ey * N[2] - ez * N[1], my = ez * N[0] - ex * N[2], mz = ex * N[1] - ey * N[0];
    const ml = Math.hypot(mx, my, mz);
    if (ml === 0) continue;
    mx /= ml; my /= ml; mz /= ml;
    const d = -(mx * P[a * 3] + my * P[a * 3 + 1] + mz * P[a * 3 + 2]);
    const w = (ex * ex + ey * ey + ez * ez) * BOUNDARY_WEIGHT;
    addPlane(a, mx, my, mz, d, w); addPlane(b, mx, my, mz, d, w);
  }
  edgeUse.clear();

  // error of moving `from` onto `to`: the joined quadric at `to`, per unit weight
  function errorOf(from, to) {
    const a = from * 11, b = to * 11;
    const x = P[to * 3], y = P[to * 3 + 1], z = P[to * 3 + 2];
    const e = (Q[a] + Q[b]) * x * x + 2 * (Q[a + 1] + Q[b + 1]) * x * y + 2 * (Q[a + 2] + Q[b + 2]) * x * z + 2 * (Q[a + 3] + Q[b + 3]) * x
      + (Q[a + 4] + Q[b + 4]) * y * y + 2 * (Q[a + 5] + Q[b + 5]) * y * z + 2 * (Q[a + 6] + Q[b + 6]) * y
      + (Q[a + 7] + Q[b + 7]) * z * z + 2 * (Q[a + 8] + Q[b + 8]) * z + (Q[a + 9] + Q[b + 9]);
    const w = Q[a + 10] + Q[b + 10];
    return w > 0 ? Math.max(0, e / w) : 0;
  }
  function skinGap(u, v) {
    let gap = 0;
    for (let i = 0; i < 4; i++) {
      const bu = SB[u * 4 + i], wu = SW[u * 4 + i];
      let wv = 0;
      for (let j = 0; j < 4; j++) if (SB[v * 4 + j] === bu) wv += SW[v * 4 + j];
      gap += Math.abs(wu - wv);
      const bv = SB[v * 4 + i];
      let inU = false;
      for (let j = 0; j < 4; j++) if (SB[u * 4 + j] === bv && SW[u * 4 + j] > 0) inU = true;
      if (!inU) gap += SW[v * 4 + i];
    }
    return gap; // 0 for the same weights, 2 for no bone in common
  }

  const offsets = new Int32Array(V + 1);
  const fill = new Int32Array(V);
  const incident = new Int32Array(T * 3);
  const touched = new Int32Array(V).fill(-1);
  const stamp = new Int32Array(V);
  let stampId = 0;
  let wedge = -1; // the original vertex u's corners take on v (set by canCollapse)
  const edgeFrom = new Int32Array(T * 3), edgeTo = new Int32Array(T * 3);
  const edgeCost = new Float64Array(T * 3);
  const keyOrder = new Float64Array(T * 3);
  const costBits = new Float32Array(1), costBits32 = new Uint32Array(costBits.buffer);
  const EDGE_SPAN = 2 ** Math.ceil(Math.log2(T * 3 + 1)); // float32 bits (< 2^31) x span stays exact
  if (EDGE_SPAN > 2 ** 22) throw new Error('simplify: mesh too large (more than about 1.4M triangles)');

  let pass = 0;
  let worst = 0;
  const results = [];
  for (const { ratio, maxError = Infinity } of levels) {
    const target = Math.max(4, Math.floor(T * ratio));
    const maxError2 = maxError * maxError;
    const skinScale = SB && Number.isFinite(maxError) ? SKIN_COST * maxError2 / 2 : 0;
    for (let tries = 0; live > target && tries < 200; tries++, pass++) {
      // incident triangles per vertex (CSR)
      offsets.fill(0);
      for (let t = 0; t < T; t++) if (alive[t]) { offsets[tri[t * 3] + 1]++; offsets[tri[t * 3 + 1] + 1]++; offsets[tri[t * 3 + 2] + 1]++; }
      for (let v = 0; v < V; v++) offsets[v + 1] += offsets[v];
      fill.set(offsets.subarray(0, V));
      for (let t = 0; t < T; t++) if (alive[t]) for (let k = 0; k < 3; k++) incident[fill[tri[t * 3 + k]]++] = t;

      // candidate edges, each once, in its cheaper allowed direction (`from` is removed)
      let E = 0;
      for (let t = 0; t < T; t++) {
        if (!alive[t]) continue;
        for (let k = 0; k < 3; k++) {
          const a = tri[t * 3 + k], b = tri[t * 3 + (k + 1) % 3];
          if (a > b && hasEdge(b, a)) continue; // a shared edge is scored from its a < b side
          if (locked[a] && locked[b]) continue;
          const ab = locked[a] ? Infinity : errorOf(a, b); // a moves onto b
          const ba = locked[b] ? Infinity : errorOf(b, a);
          const extra = skinScale ? skinGap(a, b) * skinScale : 0;
          if (ab <= ba) { edgeFrom[E] = a; edgeTo[E] = b; edgeCost[E] = ab + extra; }
          else { edgeFrom[E] = b; edgeTo[E] = a; edgeCost[E] = ba + extra; }
          E++;
        }
      }
      // cheapest first: the cost's float32 bits (ordered like the costs, which are >= 0) above the
      // edge number, in one float64 key, so the typed array sorts natively
      let K = 0;
      for (let e = 0; e < E; e++) {
        if (!(edgeCost[e] <= maxError2)) continue;
        costBits[0] = edgeCost[e];
        keyOrder[K++] = costBits32[0] * EDGE_SPAN + e;
      }
      const order = keyOrder.subarray(0, K).sort();
      let removedThisPass = 0;
      for (let n = 0; n < K && live > target; n++) {
        const e = order[n] % EDGE_SPAN;
        const u = edgeFrom[e], v = edgeTo[e];
        if (touched[u] === pass || touched[v] === pass) continue;
        if (!canCollapse(u, v)) continue;
        // collapse u onto v
        for (let i = offsets[u]; i < offsets[u + 1]; i++) {
          const t = incident[i];
          if (!alive[t]) continue;
          if (tri[t * 3] === v || tri[t * 3 + 1] === v || tri[t * 3 + 2] === v) { alive[t] = 0; live--; removedThisPass++; continue; }
          for (let k = 0; k < 3; k++) if (tri[t * 3 + k] === u) { tri[t * 3 + k] = v; cor[t * 3 + k] = wedge; }
        }
        for (let k = 0; k < 11; k++) Q[v * 11 + k] += Q[u * 11 + k];
        // lock the neighbourhood for the rest of this pass (its scores are stale now)
        for (const w of [u, v]) for (let i = offsets[w]; i < offsets[w + 1]; i++) {
          const t = incident[i];
          touched[tri[t * 3]] = pass; touched[tri[t * 3 + 1]] = pass; touched[tri[t * 3 + 2]] = pass;
        }
        touched[u] = pass; touched[v] = pass;
        if (edgeCost[e] > worst) worst = edgeCost[e];
      }
      if (removedThisPass === 0) break;
    }
    const corners = new Uint32Array(live * 3);
    let o = 0;
    for (let t = 0; t < T; t++) if (alive[t]) { corners[o++] = cor[t * 3]; corners[o++] = cor[t * 3 + 1]; corners[o++] = cor[t * 3 + 2]; }
    results.push({ corners, triangles: live, sourceTriangles: T, error: Math.sqrt(worst) });
  }
  return results;

  // does a live triangle run along the directed edge a -> b?
  function hasEdge(a, b) {
    for (let i = offsets[a]; i < offsets[a + 1]; i++) {
      const t = incident[i];
      if (!alive[t]) continue;
      const x = tri[t * 3], y = tri[t * 3 + 1], z = tri[t * 3 + 2];
      if ((x === a && y === b) || (y === a && z === b) || (z === a && x === b)) return true;
    }
    return false;
  }

  function canCollapse(u, v) {
    // link condition: the vertices next to both u and v are exactly the far corners of the
    // triangles on the edge u-v (more would pinch two sheets together)
    const mark = ++stampId;
    for (let i = offsets[u]; i < offsets[u + 1]; i++) {
      const t = incident[i];
      if (!alive[t]) continue;
      stamp[tri[t * 3]] = mark; stamp[tri[t * 3 + 1]] = mark; stamp[tri[t * 3 + 2]] = mark;
    }
    let edgeTris = 0, common = 0;
    const seen = ++stampId;
    wedge = -1;
    for (let i = offsets[v]; i < offsets[v + 1]; i++) {
      const t = incident[i];
      if (!alive[t]) continue;
      let hasU = false;
      for (let k = 0; k < 3; k++) {
        const w = tri[t * 3 + k];
        if (w === u) hasU = true;
        else if (w !== v && stamp[w] === mark) { stamp[w] = seen; common++; }
      }
      if (!hasU) continue;
      edgeTris++;
      // u's corners take v's original vertex from the triangles on the edge (u is on one side of
      // every seam, so they agree; if not, the collapse would cross a seam)
      const vc = cor[t * 3 + (tri[t * 3] === v ? 0 : tri[t * 3 + 1] === v ? 1 : 2)];
      if (wedge < 0) wedge = vc;
      else if (wedge !== vc) return false;
    }
    if (edgeTris === 0 || common > edgeTris) return false;
    // no triangle around u may fold over (or collapse to a sliver) when u moves to v
    for (let i = offsets[u]; i < offsets[u + 1]; i++) {
      const t = incident[i];
      if (!alive[t]) continue;
      const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
      if (a === v || b === v || c === v) continue;
      const l0 = normalOf(a, b, c);
      const x0 = N[0], y0 = N[1], z0 = N[2];
      const l1 = normalOf(a === u ? v : a, b === u ? v : b, c === u ? v : c);
      if (l1 < l0 * 1e-3) return false;
      if (x0 * N[0] + y0 * N[1] + z0 * N[2] < FLIP_COS * l0 * l1) return false;
    }
    return true;
  }
}

