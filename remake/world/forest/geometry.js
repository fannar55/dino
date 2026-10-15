// Procedural geometry helpers for the forest species. A MeshBuilder collects vertices with
// sRGB vertex colours and wind data; species build their models with tubes, blobs, fronds and
// petals, and the batcher later bakes placed models into merged sector meshes.
//
// Per vertex: position, normal, colour (sRGB 0..1), sway (metres of bend at full wind),
// flutter (metres), leaf (0..1, translucency and wrap) and exposure (0..1, how much sky the
// point sees within its own plant; the batcher combines it with the canopy shade of the spot).

/** sRGB components (0..1) of a hex colour, without linear conversion. */
export function srgb(hex) {
  const v = typeof hex === 'number' ? hex : parseInt(hex.replace('#', ''), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}
export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
/** Shift hue-ish: scale channels independently, clamped. */
export const tint3 = (a, r, g, b) => [Math.min(1, a[0] * r), Math.min(1, a[1] * g), Math.min(1, a[2] * b)];

export function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const madd3 = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
    this.wind = []; // sway, flutter, leaf
    this.exp = [];
    this.idx = [];
  }
  get count() { return this.pos.length / 3; }
  get triangles() { return this.idx.length / 3; }
  /** Start a new cull piece here (a tree's crown after its trunk): the batcher culls pieces separately. */
  mark() { (this.marks ||= []).push(this.idx.length); }
  vertex(p, n, c, sway = 0, flutter = 0, leaf = 0, exposure = 1) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.col.push(c[0], c[1], c[2]);
    this.wind.push(sway, flutter, leaf);
    this.exp.push(exposure);
    return this.count - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  /** Triangle wound so that its face normal agrees with the stored vertex normals. */
  triFacing(a, b, c) {
    const P = this.pos, N = this.nrm;
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const e1 = [P[b * 3] - ax, P[b * 3 + 1] - ay, P[b * 3 + 2] - az];
    const e2 = [P[c * 3] - ax, P[c * 3 + 1] - ay, P[c * 3 + 2] - az];
    const f = cross3(e1, e2);
    const n = [N[a * 3] + N[b * 3] + N[c * 3], N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1], N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]];
    if (dot3(f, n) >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }
  append(other) {
    const base = this.count;
    this.pos.push(...other.pos);
    this.nrm.push(...other.nrm);
    this.col.push(...other.col);
    this.wind.push(...other.wind);
    this.exp.push(...other.exp);
    for (const i of other.idx) this.idx.push(i + base);
  }
}

// ---------------------------------------------------------------------------------------------
// Icosphere (indexed, shared vertices) used for canopy lobes, bushes and rocks.
const icoCache = new Map();
// smooth max(0, t): the flattening of a lobe's underside starts gently instead of at a kink
const softRamp = t => 0.5 * (t + Math.sqrt(t * t + 0.04));
const SOFT_RAMP_0 = softRamp(-0.25);

export function icosphere(detail) {
  if (icoCache.has(detail)) return icoCache.get(detail);
  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm3);
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6],
    [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let d = 0; d < detail; d++) {
    const cache = new Map();
    const mid = (a, b) => {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (cache.has(key)) return cache.get(key);
      verts.push(norm3(mix3(verts[a], verts[b], 0.5)));
      cache.set(key, verts.length - 1);
      return verts.length - 1;
    };
    const next = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const out = { verts, faces };
  icoCache.set(detail, out);
  return out;
}

/**
 * A soft lobe: a lumpy ellipsoid whose normals lean toward a shared centre, so a cluster of
 * lobes shades like one big soft mass with gentle lobe detail.
 */
export function addBlob(b, o) {
  const { center, radii, detail = 1, lump = 0.12, lumpFreq = 1.6, noise3, salt = 0 } = o;
  const bendCenter = o.bendCenter || center;
  const bend = o.bend ?? 0.45;
  const flat = o.flatBottom ?? 0.4;
  const bumps = o.bumps || null;
  const ico = icosphere(detail);
  const base = b.count;
  // displaced positions: lumps everywhere, plus optional round bumps (a cauliflower outline)
  const P = [], U = [], K = [];
  for (const d of ico.verts) {
    let [dx, dy, dz] = d;
    // the lower part is pressed flatter, through a smooth ramp (no crease line round the lobe)
    if (dy < 0) dy += flat * (softRamp(-dy - 0.25) - SOFT_RAMP_0);
    const n = noise3 ? noise3(dx * lumpFreq + salt, dy * lumpFreq - salt * 0.3, dz * lumpFreq + salt * 0.7) : 0.5;
    let k = 1 + lump * (n - 0.5) * 2;
    let bump = 0;
    if (bumps) {
      for (const bp of bumps) {
        const q = (d[0] - bp.d[0]) ** 2 + (d[1] - bp.d[1]) ** 2 + (d[2] - bp.d[2]) ** 2;
        if (q < bp.r2) { const t = 1 - q / bp.r2; bump = Math.max(bump, bp.h * t * t * (3 - 2 * t)); }
      }
      k += bump - (o.crease ?? 0.06);
    }
    const pp = [center[0] + dx * radii[0] * k, center[1] + dy * radii[1] * k, center[2] + dz * radii[2] * k];
    P.push(o.warp ? o.warp(pp, d) : pp);
    U.push([dx, dy, dz]);
    K.push(bump);
  }
  // normals: from the displaced surface when bumped (the bumps shade), else the ellipsoid's
  let N;
  if (bumps) {
    N = P.map(() => [0, 0, 0]);
    for (const [x, y, z] of ico.faces) {
      const f = cross3(sub3(P[y], P[x]), sub3(P[z], P[x]));
      for (const i of [x, y, z]) { N[i][0] += f[0]; N[i][1] += f[1]; N[i][2] += f[2]; }
    }
    N = N.map((n, i) => norm3(mix3(norm3(n), norm3([U[i][0] / radii[0], U[i][1] / radii[1], U[i][2] / radii[2]]), o.bumpSoft ?? 0.35)));
  } else {
    N = U.map(u => norm3([u[0] / radii[0], u[1] / radii[1], u[2] / radii[2]]));
  }
  ico.verts.forEach((d, i) => {
    const p = P[i];
    const ne = norm3(sub3(p, bendCenter));
    const nn = norm3(mix3(N[i], ne, bend));
    const c = o.color ? o.color(p, nn, d, K[i]) : [1, 1, 1];
    b.vertex(p, nn, c, o.sway ? o.sway(p) : 0, o.flutter ? o.flutter(p, d) : 0, o.leaf ?? 0, o.exposure ? o.exposure(p, nn, d) : 1);
  });
  for (const [x, y, z] of ico.faces) b.tri(base + x, base + y, base + z);
  return base;
}

/** Bump centres spread over the upper part of a unit sphere (for addBlob's `bumps`). */
export function makeBumps(rng, count, { radius = 0.55, height = 0.16, minY = -0.35 } = {}) {
  const out = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const off = rng.angle();
  for (let k = 0; k < count; k++) {
    const y = 1 - ((k + 0.5) / count) * (1 - minY);
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const a = off + k * golden + rng.range(-0.25, 0.25);
    const rr = radius * rng.range(0.8, 1.2);
    out.push({ d: norm3([Math.cos(a) * r, y + rng.range(-0.06, 0.06), Math.sin(a) * r]), r2: rr * rr, h: height * rng.range(0.75, 1.25) });
  }
  return out;
}

/** Parallel-transport frames along a polyline spine. */
function frames(points) {
  const n = points.length;
  const T = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)], c = points[Math.min(n - 1, i + 1)];
    T.push(norm3(sub3(c, a)));
  }
  let ref = Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let N = norm3(cross3(ref, T[0]));
  const out = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      N = sub3(N, mul3(T[i], dot3(N, T[i])));
      N = norm3(N);
    }
    const B = cross3(T[i], N);
    out.push({ T: T[i], N, B });
  }
  return out;
}

/**
 * Tapered tube along a spine. radius(t, angle) gives the radius; colour(t, angle, p, n) the
 * sRGB colour. Used for trunks (with root flare), limbs, roots, stems and logs.
 */
export function addTube(b, o) {
  const { points, radial = 8 } = o;
  const F = frames(points);
  const n = points.length;
  // arc length parameter
  const s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(...sub3(points[i], points[i - 1])));
  const total = s[n - 1] || 1;
  const rings = [];
  for (let i = 0; i < n; i++) {
    const t = s[i] / total;
    const ring = [];
    for (let j = 0; j < radial; j++) {
      const ang = (j / radial) * Math.PI * 2 + (o.twist || 0) * t;
      const dir = add3(mul3(F[i].N, Math.cos(ang)), mul3(F[i].B, Math.sin(ang)));
      const r = o.radius(t, ang, i);
      const p = madd3(points[i], dir, r);
      let nn = dir;
      if (o.normalTilt) nn = norm3(madd3(dir, F[i].T, o.normalTilt));
      const c = o.color ? o.color(t, ang, p, nn) : [1, 1, 1];
      ring.push(b.vertex(p, nn, c, o.sway ? o.sway(p, t) : 0, o.flutter ? o.flutter(p, t) : 0, o.leaf ?? 0, o.exposure ? o.exposure(p, nn, t) : 0.5));
    }
    rings.push(ring);
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = rings[i][j], bb = rings[i][(j + 1) % radial], c = rings[i + 1][(j + 1) % radial], d = rings[i + 1][j];
      b.triFacing(a, bb, c);
      b.triFacing(a, c, d);
    }
  }
  const cap = (i, outward, colour) => {
    const P = points[i];
    const nn = outward;
    const centre = b.vertex(madd3(P, outward, o.capBulge || 0), nn, colour || (o.color ? o.color(i === 0 ? 0 : 1, 0, P, nn) : [1, 1, 1]),
      o.sway ? o.sway(P, i === 0 ? 0 : 1) : 0, 0, o.leaf ?? 0, o.exposure ? o.exposure(P, nn, i === 0 ? 0 : 1) : 0.5);
    const ring = rings[i];
    // the cap shares positions with the ring but needs its own flat normals
    const own = ring.map(v => b.vertex([b.pos[v * 3], b.pos[v * 3 + 1], b.pos[v * 3 + 2]], nn,
      o.capColor ? o.capColor([b.pos[v * 3], b.pos[v * 3 + 1], b.pos[v * 3 + 2]], true) : [b.col[v * 3], b.col[v * 3 + 1], b.col[v * 3 + 2]],
      b.wind[v * 3], 0, b.wind[v * 3 + 2], b.exp[v]));
    let inner = own;
    // optional concentric rings (growth rings on cut wood)
    const steps = o.capRings || 0;
    const centrePos = [b.pos[centre * 3], b.pos[centre * 3 + 1], b.pos[centre * 3 + 2]];
    for (let r = steps; r >= 1; r--) {
      const f = r / (steps + 1);
      const next = own.map(v => {
        const p = mix3(centrePos, [b.pos[v * 3], b.pos[v * 3 + 1], b.pos[v * 3 + 2]], f);
        return b.vertex(p, nn, o.capRingColor ? o.capRingColor(f) : [b.col[v * 3], b.col[v * 3 + 1], b.col[v * 3 + 2]], b.wind[v * 3], 0, b.wind[v * 3 + 2], b.exp[v]);
      });
      for (let j = 0; j < radial; j++) {
        const j1 = (j + 1) % radial;
        b.triFacing(inner[j], inner[j1], next[j1]);
        b.triFacing(inner[j], next[j1], next[j]);
      }
      inner = next;
    }
    for (let j = 0; j < radial; j++) b.triFacing(centre, inner[j], inner[(j + 1) % radial]);
  };
  if (o.capStart) cap(0, mul3(F[0].T, -1), o.capColor ? o.capColor(points[0], false) : null);
  if (o.capEnd) cap(n - 1, F[n - 1].T, o.capColor ? o.capColor(points[n - 1], false) : null);
  return rings;
}

/** Quadratic Bezier point. */
export function bezier(p0, p1, p2, t) {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1], u * u * p0[2] + 2 * u * t * p1[2] + t * t * p2[2]];
}

/**
 * A fern frond (or palm-like cycad leaf) as opaque geometry: a curved rachis with a serrated
 * outline of leaflets, slightly folded. No alpha test, so no shimmer and no sorting.
 */
export function addFrond(b, o) {
  const {
    base, dir, length, width, arch = 0.35, droop = 0.4, segments = 9, serration = 0.55, fold = 0.25,
    tipRound = 0.3, up = [0, 1, 0],
  } = o;
  const p0 = base;
  const horiz = norm3([dir[0], 0, dir[2]]);
  const p1 = add3(add3(p0, mul3(dir, length * 0.45)), mul3(up, arch * length));
  const p2 = add3(add3(p0, mul3(horiz, length * 0.95)), mul3(up, (arch * 0.35 - droop) * length));
  const S = segments;
  const rows = [];
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    const p = bezier(p0, p1, p2, t);
    const pn = bezier(p0, p1, p2, Math.min(1, t + 0.01));
    const pp = bezier(p0, p1, p2, Math.max(0, t - 0.01));
    const T = norm3(sub3(pn, pp));
    let side = cross3(T, up);
    if (Math.hypot(...side) < 1e-4) side = cross3(T, [1, 0, 0]);
    side = norm3(side);
    if (o.roll) {
      // roll the blade around its rachis
      const N0 = cross3(side, T);
      side = norm3(add3(mul3(side, Math.cos(o.roll)), mul3(N0, Math.sin(o.roll))));
    }
    const N = norm3(cross3(side, T));
    // leaflet profile: zero at the base, widest around 35 %, rounded tip
    let w = width * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.04)), 0.75);
    if (t > 1 - tipRound) w *= 0.6 + 0.4 * Math.cos(((t - (1 - tipRound)) / tipRound) * Math.PI * 0.5);
    const serr = i % 2 === 1 ? 1 : 1 - serration;
    const fwd = i % 2 === 1 ? (length / S) * 0.55 : 0;
    rows.push({ p, T, N, side, w: w * serr, fwd, t });
  }
  const leaf = o.leaf ?? 1;
  const vtx = (p, n, t, edge) => b.vertex(p, n, o.color ? o.color(t, edge, p) : [1, 1, 1],
    o.sway ? o.sway(p, t) : 0, o.flutter ? o.flutter(p, t) : 0, leaf, o.exposure ? o.exposure(p, t) : 1);
  const centre = [], left = [], right = [];
  for (const r of rows) {
    const up2 = norm3(mix3(r.N, up, 0.35));
    centre.push(vtx(r.p, up2, r.t, 0));
    for (const sgn of [-1, 1]) {
      const e = add3(add3(r.p, mul3(r.side, sgn * r.w)), add3(mul3(r.T, r.fwd), mul3(r.N, -fold * r.w)));
      const en = norm3(add3(mix3(r.N, up, 0.25), mul3(r.side, sgn * fold * 0.8)));
      (sgn < 0 ? left : right).push(vtx(e, en, r.t, 1));
    }
  }
  for (let i = 0; i < S; i++) {
    b.triFacing(centre[i], left[i], centre[i + 1]);
    b.triFacing(left[i], left[i + 1], centre[i + 1]);
    b.triFacing(centre[i], centre[i + 1], right[i]);
    b.triFacing(right[i], centre[i + 1], right[i + 1]);
  }
}

/**
 * A feathery frond: a curved rachis carrying separate leaflets on both sides, so light and sky
 * show between them like a real fern. Leaflets are one triangle (far LODs) or a rounded quad.
 * Opaque geometry, double-sided material, no alpha test.
 */
export function addLeafletFrond(b, o) {
  const {
    base, dir, length, width, arch = 0.35, droop = 0.45, leaflets = 12, up = [0, 1, 0],
    forward = 0.35, sag = 0.25, quads = true, rachis = 0.012, spacing = 0.92,
  } = o;
  const p0 = base;
  const horiz = norm3([dir[0], 0, dir[2]]);
  const p1 = add3(add3(p0, mul3(dir, length * 0.45)), mul3(up, arch * length));
  const p2 = add3(add3(p0, mul3(horiz, length * 0.95)), mul3(up, (arch * 0.35 - droop) * length));
  const leaf = o.leaf ?? 1;
  const vtx = (p, n, t, edge) => b.vertex(p, n, o.color ? o.color(t, edge, p) : [1, 1, 1],
    o.sway ? o.sway(p, t) : 0, o.flutter ? o.flutter(p, t) : 0, leaf, o.exposure ? o.exposure(p, t) : 1);
  const frame = t => {
    const p = bezier(p0, p1, p2, t);
    const T = norm3(sub3(bezier(p0, p1, p2, Math.min(1, t + 0.01)), bezier(p0, p1, p2, Math.max(0, t - 0.01))));
    let side = cross3(T, up);
    if (Math.hypot(...side) < 1e-4) side = cross3(T, [1, 0, 0]);
    side = norm3(side);
    const N = norm3(cross3(side, T));
    return { p, T, side, N };
  };
  // rachis: a thin strip down the middle
  if (rachis > 0) {
    const steps = Math.max(3, Math.round(leaflets / 2));
    let prev = null;
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 0.97;
      const f = frame(t);
      const w = rachis * (1 - 0.7 * t);
      const n = norm3(mix3(f.N, up, 0.3));
      const a = vtx(add3(f.p, mul3(f.side, -w)), n, t, 0);
      const c = vtx(add3(f.p, mul3(f.side, w)), n, t, 0);
      if (prev) { b.triFacing(prev[0], prev[1], c); b.triFacing(prev[0], c, a); }
      prev = [a, c];
    }
  }
  const step = 0.95 / leaflets;
  for (let i = 0; i < leaflets; i++) {
    const t = 0.05 + (i + 0.5) * step;
    const f = frame(t);
    // leaflet length: short at the base, longest a third of the way out, small rounded tip
    let L = width * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.08)), 0.7);
    if (t > 0.8) L *= 0.55 + 0.45 * Math.cos(((t - 0.8) / 0.2) * Math.PI * 0.5);
    const halfBase = length * step * 0.5 * spacing;
    for (const sgn of [-1, 1]) {
      const n = norm3(add3(mix3(f.N, up, 0.3), mul3(f.side, sgn * 0.25)));
      const b0 = add3(f.p, mul3(f.T, -halfBase));
      const b1 = add3(f.p, mul3(f.T, halfBase * 0.8));
      const tipC = add3(add3(f.p, mul3(f.side, sgn * L)), add3(mul3(f.T, L * forward), mul3(f.N, -L * sag)));
      const i0 = vtx(b0, n, t, 0), i1 = vtx(b1, n, t, 0);
      if (quads) {
        // a slim leaflet with a blunt, rounded-looking tip
        const ta = add3(tipC, mul3(f.T, -halfBase * 0.5)), tb = add3(tipC, mul3(f.T, halfBase * 0.3));
        const i2 = vtx(ta, n, t, 1), i3 = vtx(tb, n, t, 1);
        b.triFacing(i0, i1, i3); b.triFacing(i0, i3, i2);
      } else {
        b.triFacing(i0, i1, vtx(tipC, n, t, 1));
      }
    }
  }
}

/**
 * A frond as one continuous ribbon: a darker rachis down the middle and a scalloped edge of
 * rounded leaflets on both sides (notch, shoulder, tip per leaflet, or notch and tip when
 * `samples` is 2). Continuous, so it does not break into confetti or shimmer at a distance; the
 * far LODs simply use fewer, wider leaflets. Opaque, double-sided, no alpha test.
 */
export function addRibbonFrond(b, o) {
  const {
    base, dir, length, width, arch = 0.35, droop = 0.45, leaflets = 8, up = [0, 1, 0],
    notch = 0.42, forward = 0.45, fold = 0.22, samples = 3,
  } = o;
  const p0 = base;
  const horiz = norm3([dir[0], 0, dir[2]]);
  const p1 = add3(add3(p0, mul3(dir, length * 0.45)), mul3(up, arch * length));
  const p2 = add3(add3(p0, mul3(horiz, length * 0.95)), mul3(up, (arch * 0.35 - droop) * length));
  const leaf = o.leaf ?? 1;
  const vtx = (p, n, t, edge) => b.vertex(p, n, o.color ? o.color(t, edge, p) : [1, 1, 1],
    o.sway ? o.sway(p, t) : 0, o.flutter ? o.flutter(p, t) : 0, leaf, o.exposure ? o.exposure(p, t) : 1);
  const frame = t => {
    const p = bezier(p0, p1, p2, t);
    const T = norm3(sub3(bezier(p0, p1, p2, Math.min(1, t + 0.01)), bezier(p0, p1, p2, Math.max(0, t - 0.01))));
    let side = cross3(T, up);
    if (Math.hypot(...side) < 1e-4) side = cross3(T, [1, 0, 0]);
    side = norm3(side);
    const N = norm3(cross3(side, T));
    return { p, T, side, N };
  };
  // samples along the rachis: per leaflet a notch, (a shoulder,) a tip; then a rounded end
  const steps = leaflets * samples;
  const rows = [];
  for (let i = 0; i <= steps; i++) {
    const t = 0.04 + (i / steps) * 0.93;
    const f = frame(t);
    let w = width * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.06)), 0.7);
    if (t > 0.78) w *= 0.6 + 0.4 * Math.cos(((t - 0.78) / 0.22) * Math.PI * 0.5);
    const phase = i % samples;
    let k, fwd;
    if (samples === 3) { k = phase === 0 ? notch : phase === 1 ? 0.88 : 1; fwd = phase === 2 ? forward : phase === 1 ? forward * 0.5 : 0; }
    else { k = phase === 0 ? notch : 1; fwd = phase === 1 ? forward : 0; }
    rows.push({ ...f, t, w: w * k, fwd: fwd * (length / steps) });
  }
  const centre = [], left = [], right = [];
  for (const r of rows) {
    const nUp = norm3(mix3(r.N, up, 0.3));
    centre.push(vtx(r.p, nUp, r.t, -1));
    for (const sgn of [-1, 1]) {
      const e = add3(add3(r.p, mul3(r.side, sgn * r.w)), add3(mul3(r.T, r.fwd), mul3(r.N, -fold * r.w)));
      const en = norm3(add3(mix3(r.N, up, 0.25), mul3(r.side, sgn * fold * 0.8)));
      (sgn < 0 ? left : right).push(vtx(e, en, r.t, 1));
    }
  }
  // the tip
  const end = frame(0.995);
  const tipV = vtx(end.p, norm3(mix3(end.N, up, 0.3)), 1, 1);
  for (let i = 0; i < rows.length - 1; i++) {
    b.triFacing(centre[i], left[i], centre[i + 1]);
    b.triFacing(left[i], left[i + 1], centre[i + 1]);
    b.triFacing(centre[i], centre[i + 1], right[i]);
    b.triFacing(right[i], centre[i + 1], right[i + 1]);
  }
  const last = rows.length - 1;
  b.triFacing(centre[last], left[last], tipV);
  b.triFacing(centre[last], tipV, right[last]);
}

/** Flower head: rounded petals around a raised centre, facing `normal`. */
export function addFlowerHead(b, o) {
  const { center, normal, radius, petals = 5, petalColor, centerColor, sway = 0, rot = 0 } = o;
  const n = norm3(normal);
  let a = norm3(cross3(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const c2 = cross3(n, a);
  const at = (ang, r, lift = 0) => add3(add3(center, mul3(add3(mul3(a, Math.cos(ang)), mul3(c2, Math.sin(ang))), r)), mul3(n, lift));
  const nUp = norm3(mix3(n, [0, 1, 0], 0.3));
  const hub = b.vertex(add3(center, mul3(n, radius * 0.12)), nUp, petalColor, sway, 0.004, 0.6, 1);
  const ring = [];
  const step = (Math.PI * 2) / petals;
  for (let k = 0; k < petals; k++) {
    const a0 = rot + k * step;
    ring.push(b.vertex(at(a0, radius * 0.32, 0.02 * radius), nUp, petalColor, sway, 0.004, 0.6, 1));
    ring.push(b.vertex(at(a0 + step * 0.22, radius * 0.86, -0.05 * radius), nUp, petalColor, sway, 0.006, 0.6, 1));
    ring.push(b.vertex(at(a0 + step * 0.5, radius, -0.08 * radius), nUp, petalColor, sway, 0.006, 0.6, 1));
    ring.push(b.vertex(at(a0 + step * 0.78, radius * 0.86, -0.05 * radius), nUp, petalColor, sway, 0.006, 0.6, 1));
  }
  for (let k = 0; k < ring.length; k++) b.triFacing(hub, ring[k], ring[(k + 1) % ring.length]);
  // raised centre
  const cTop = b.vertex(add3(center, mul3(n, radius * 0.22)), nUp, centerColor, sway, 0.004, 0.2, 1);
  const cr = [];
  for (let k = 0; k < 5; k++) cr.push(b.vertex(at(rot + k * (Math.PI * 2 / 5), radius * 0.26, radius * 0.1), nUp, centerColor, sway, 0.004, 0.2, 1));
  for (let k = 0; k < 5; k++) b.triFacing(cTop, cr[k], cr[(k + 1) % 5]);
}
