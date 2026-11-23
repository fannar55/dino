// Shells: an invisible body of capsules round an animal, which follows its bones, so that things that fly near it (Fiðrildadansinn's
// butterflies, chapters/fidrildi3d.js) can be kept out of it. Off unless a chapter makes one.
//
// The capsules are fitted from the animal's own skinned body mesh (fitCapsules): each vertex goes to the bone that moves it most;
// bones that move few vertices give theirs to their parent; each bone's vertices, in that bone's own frame, give a capsule along
// their main axis (the segment between low and high percentiles of their spread along it) whose radius is a high percentile of their
// distance from it. A part too wide for one capsule (wider than SPLIT of the body: Mosi's head with its frill was one ball 1.4 m
// across) gets spokes instead, a capsule from its middle out to each patch of its skin. Nothing is placed by hand per animal: Mosi
// gets 97 capsules and Þórseðla 82, which hold 99.7 % and 99.5 % of their skin to within a centimetre (shell.test.mjs).
// update() notes each frame that the bones may have moved; the capsules are placed again when a push first comes near.
//
// pushOut is stateless: the answer depends only on the drawn point, the capsules and the camera's forward direction, so a seek
// lands on the same frame. The capsules make one field, the distance outside them less a margin (a wing's reach), blended where two
// meet; a point is moved out to the margin, with a soft zone SOFT further out in which a flight bends round early instead of hitting
// the shell and sliding along it. It moves by flowing along the way out (the field's slope) leaning toward `bias` (up and a little
// away from the camera), strongly deep inside and not at all at the soft zone's edge, so a flight drawn straight through the middle
// of a body goes over it, never flipping from one side to the other as it crosses the axis. A push never brings a point nearer the
// camera: the way out has its part toward the camera taken out, so it moves across the view or deeper (going behind an animal is
// fine; going through it is not).
//
// No continuous push out of a solid can exist for every point (a ball cannot be mapped onto its outside continuously with its
// far surroundings left alone: in any cross-section some drawn point must be torn between two ways round). So there is a seam,
// and it is put where it costs least: at the shell's surface on the side away from the bias, underneath. A flight drawn up into a
// body from below (or a body coming down onto a butterfly, or rising into one: a head that lifts) would jump there, through the body
// to its top; a flight through the middle, across the view or in depth, and anything entering from above or the sides, moves
// smoothly. The choreography keeps flights from the seam, and the clip probe (tools/clip-probe.mjs) reports the largest jump of any
// butterfly, its move in one step less the move it was drawn to make.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]);
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const smooth = x => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };

/** The point of segment a-b nearest p. */
export function closestOnSegment(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 > 1e-12 ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2)) : 0;
  return add(a, ab, t);
}
const distanceTo = (p, cap) => len(sub(p, closestOnSegment(p, cap.a, cap.b)));

export const SOFT = 0.3; // metres: the soft zone outside the margin, in which a flight bends round early
export const SPLIT = 0.03; // a part wider than this share of the body's diagonal gets spokes instead of one capsule (fitCapsules)
const BLEND = 0.08; // metres: how softly the capsules' distances are blended into one (a smooth minimum), so the way out turns
// smoothly where two capsules meet instead of flipping between them
const BIAS = 2; // how strongly the way out leans to the bias deep inside (none at the soft zone's edge, 1 at the surface): so the
// seam (below) lies at the shell's own surface on the side away from the bias

/**
 * Where a thing drawn at `point` may be, kept out of `capsules` ([{ a: [x, y, z], b, r }]) by `margin` metres, with a soft zone
 * `soft` metres further out. `forward` is the camera's viewing direction (unit; a push has no component against it); `bias` the way
 * out it leans to (default up and a little away from the camera).
 *
 * The capsules make one field: h, the distance outside the nearest (less the margin), blended smoothly where they meet. A point
 * with h at or past `soft` stays. Any other is to come to h = (soft + h)² / 4·soft (0 for one drawn deeper than soft inside: just
 * out by the margin; rising smoothly to meet the drawn point at the soft zone's edge), and gets there by flowing along the way out,
 * the field's slope plus the bias (strong inside, none at the edge), with anything toward the camera taken out; the flow is
 * followed in short steps and the last step cut where it reaches the wanted h. So nearby drawn points flow along nearby lines and
 * end near each other.
 */
export function pushOut(point, capsules, { margin = 0, soft = SOFT, forward = [0, 0, -1], bias = null } = {}) {
  const px0 = point[0], py0 = point[1], pz0 = point[2];
  if (!capsules.length) return [px0, py0, pz0];
  const bx = bias ? bias[0] : forward[0] * 0.35;
  const by = bias ? bias[1] : 1 + forward[1] * 0.35;
  const bz = bias ? bias[2] : forward[2] * 0.35;
  const bl = Math.hypot(bx, by, bz) || 1;
  const lx = bx / bl, ly = by / bl, lz = bz / bl;
  const fx = forward[0], fy = forward[1], fz = forward[2];

  const p = [px0, py0, pz0];
  const g = [0, 0, 0];
  const g2 = [0, 0, 0];
  const next = [0, 0, 0];
  let h = field(p, capsules, margin, g);
  if (h >= soft) return p;
  const want = h <= -soft ? 0 : (soft + h) ** 2 / (4 * soft);
  for (let i = 0; i < 400 && h < want; i++) {
    const beta = BIAS * (1 - smooth((h + soft) / (2 * soft)));
    let wx = g[0] + lx * beta, wy = g[1] + ly * beta, wz = g[2] + lz * beta;
    const toward = wx * fx + wy * fy + wz * fz;
    if (toward < 0) { wx -= fx * toward; wy -= fy * toward; wz -= fz * toward; }
    let wl = Math.hypot(wx, wy, wz);
    if (wl < 1e-9) {
      const lt = Math.min(0, lx * fx + ly * fy + lz * fz);
      wx = lx - fx * lt; wy = ly - fy * lt; wz = lz - fz * lt;
      wl = Math.hypot(wx, wy, wz);
      if (wl < 1e-9) {
        // lean is antiparallel to forward: pick an axis orthogonal to forward
        const ax = Math.abs(fy) < 0.9 ? 0 : 1, ay = Math.abs(fy) < 0.9 ? 1 : 0, az = 0;
        wx = ay * fz - az * fy; wy = az * fx - ax * fz; wz = ax * fy - ay * fx;
        wl = Math.hypot(wx, wy, wz) || 1;
      }
    }
    const inv = 1 / wl;
    wx *= inv; wy *= inv; wz *= inv;
    const step = Math.min(0.12, Math.max(0.004, want - h));
    next[0] = p[0] + wx * step; next[1] = p[1] + wy * step; next[2] = p[2] + wz * step;
    const h2 = field(next, capsules, margin, g2);
    if (h2 >= want) {
      // the last step, cut where the field reaches the wanted h (along the step it is near enough straight)
      if (h2 > h) {
        const s = (step * (want - h)) / (h2 - h);
        return [p[0] + wx * s, p[1] + wy * s, p[2] + wz * s];
      }
      return [next[0], next[1], next[2]];
    }
    p[0] = next[0]; p[1] = next[1]; p[2] = next[2];
    h = h2;
    g[0] = g2[0]; g[1] = g2[1]; g[2] = g2[2];
  }
  return p;
}

/** The blended distance outside the capsules less the margin (negative inside), and its slope into `grad`. */
let F = new Float64Array(64), U = new Float64Array(192); // the field's scratch: each capsule's distance and way out
function field(p, capsules, margin, grad) {
  let m = Infinity;
  if (F.length < capsules.length) { F = new Float64Array(capsules.length * 2); U = new Float64Array(capsules.length * 6); }
  for (let i = 0; i < capsules.length; i++) {
    const cap = capsules[i];
    const ax = cap.b[0] - cap.a[0], ay = cap.b[1] - cap.a[1], az = cap.b[2] - cap.a[2];
    const l2 = ax * ax + ay * ay + az * az;
    let t = l2 > 1e-12 ? ((p[0] - cap.a[0]) * ax + (p[1] - cap.a[1]) * ay + (p[2] - cap.a[2]) * az) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const vx = p[0] - cap.a[0] - ax * t, vy = p[1] - cap.a[1] - ay * t, vz = p[2] - cap.a[2] - az * t;
    const d = Math.hypot(vx, vy, vz);
    const f = d - cap.r - margin;
    F[i] = f;
    // the way out of it: straight out from its axis, fading to nothing at the axis itself (where straight out flips side), so deep
    // inside the bias alone leads out and the way changes smoothly through the middle
    const k = Math.min(1, d / Math.max(1e-6, 0.5 * (cap.r + margin))) / Math.max(d, 1e-9);
    U[3 * i] = vx * k; U[3 * i + 1] = vy * k; U[3 * i + 2] = vz * k;
    if (f < m) m = f;
  }
  let sum = 0;
  grad[0] = grad[1] = grad[2] = 0;
  for (let i = 0; i < capsules.length; i++) {
    const x = (F[i] - m) / BLEND;
    if (x > 9) continue; // e^-9: nothing it could add would show
    const e = Math.exp(-x);
    sum += e;
    grad[0] += e * U[3 * i]; grad[1] += e * U[3 * i + 1]; grad[2] += e * U[3 * i + 2];
  }
  grad[0] /= sum; grad[1] /= sum; grad[2] /= sum;
  return m - BLEND * Math.log(sum);
}
const unit = a => scale(a, 1 / (len(a) || 1));

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];

/**
 * Capsules for a skinned body, from its vertices. `vertices(i)` gives vertex i's position in each bone's frame at bind:
 * `local(i, bone)` → [x, y, z]; `count`; `dominant(i)` → the bone index moving it most; `parent(bone)` → the parent bone index or -1.
 * Returns [{ bone, a, b, r, count }] in the bone's frame.
 */
export function fitCapsules({ count, dominant, parent, local, minVertices = 60, ends = 0.02, radius = 0.99, maxRadius = Infinity }) {
  const limit = typeof maxRadius === 'function' ? maxRadius : () => maxRadius;
  const groups = new Map();
  for (let i = 0; i < count; i++) {
    const bone = dominant(i);
    if (!groups.has(bone)) groups.set(bone, []);
    groups.get(bone).push(i);
  }
  // small groups give their vertices to their parent, until every group is big enough or has no parent
  for (let changed = true; changed;) {
    changed = false;
    for (const [bone, list] of [...groups]) {
      if (list.length >= minVertices) continue;
      const up = parent(bone);
      if (up < 0) continue;
      if (!groups.has(up)) groups.set(up, []);
      groups.get(up).push(...list);
      groups.delete(bone);
      changed = true;
    }
  }
  const capsules = [];
  for (const [bone, list] of groups) {
    if (list.length < 4) continue;
    const pts = list.map(i => local(i, bone));
    const mean = scale(pts.reduce((s, x) => add(s, x), [0, 0, 0]), 1 / pts.length);
    // the main axis: power iteration on the covariance
    const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const x of pts) {
      const y = sub(x, mean);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cov[3 * r + c] += y[r] * y[c];
    }
    let e = [1, 0.7, 0.4];
    for (let i = 0; i < 40; i++) {
      const n = [0, 1, 2].map(r => cov[3 * r] * e[0] + cov[3 * r + 1] * e[1] + cov[3 * r + 2] * e[2]);
      const l = len(n);
      if (l < 1e-12) break;
      e = scale(n, 1 / l);
    }
    const along = pts.map(x => dot(sub(x, mean), e)).sort((x, y) => x - y);
    const low = quantile(along, ends), high = quantile(along, 1 - ends);
    const dist = pts.map(x => distanceTo(x, { a: add(mean, e, low), b: add(mean, e, high) })).sort((x, y) => x - y);
    const r = quantile(dist, radius);
    // the caps reach r past each end: the ends come in by r (to the middle at most), so the capsule ends where the vertices do
    const mid = (low + high) / 2;
    const a = add(mean, e, Math.min(mid, low + r));
    const b = add(mean, e, Math.max(mid, high - r));
    if (r <= limit(bone) || pts.length < 2 * minVertices) {
      capsules.push({ bone, a, b, r, count: list.length });
      continue;
    }
    // Too wide for one capsule (Mosi's head with its frill was a ball 1.4 m across, and a flight in front of his face went 1.5 m up
    // over it): spokes instead. The vertices are cut into patches (k-means), and each patch gets a capsule from the group's middle
    // out to it. A capsule holds the hull of its patch and the middle, so all of them together hold everything the middle can see
    // of the skin (the whole of a part that is star-shaped round its middle, as a head or a body is), with no hole inside.
    const k = Math.min(16, Math.max(2, Math.round((r / limit(bone)) ** 2)), Math.floor(pts.length / minVertices));
    for (const patch of patches(pts, k)) {
      if (patch.length < 4) continue;
      const centre = scale(patch.reduce((s2, x) => add(s2, x), [0, 0, 0]), 1 / patch.length);
      const spoke = sub(centre, mean);
      const L = len(spoke);
      const dir = L > 1e-9 ? scale(spoke, 1 / L) : e;
      let tip = centre;
      let rr = quantile(patch.map(x => distanceTo(x, { a: mean, b: tip })).sort((x, y) => x - y), radius);
      // the cap reaches rr past the tip: bring the tip in so the cap ends where the patch does
      const beyond = quantile(patch.map(x => dot(sub(x, centre), dir)).sort((x, y) => x - y), radius);
      if (beyond < rr) {
        tip = add(mean, dir, Math.max(0, L + beyond - rr));
        rr = quantile(patch.map(x => distanceTo(x, { a: mean, b: tip })).sort((x, y) => x - y), radius);
      }
      capsules.push({ bone, a: mean, b: tip, r: rr, count: patch.length });
    }
  }
  return capsules;
}

/** k patches of points (k-means, started from points far apart: the same points always give the same patches). */
function patches(pts, k) {
  const centres = [pts[0]];
  const nearest = pts.map(x => len(sub(x, pts[0])));
  while (centres.length < k) {
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (nearest[i] > nearest[best]) best = i;
    centres.push(pts[best]);
    for (let i = 0; i < pts.length; i++) nearest[i] = Math.min(nearest[i], len(sub(pts[i], pts[best])));
  }
  let groups = [];
  for (let round = 0; round < 12; round++) {
    groups = centres.map(() => []);
    for (const x of pts) {
      let best = 0, bd = Infinity;
      centres.forEach((c, j) => { const d = len(sub(x, c)); if (d < bd) { bd = d; best = j; } });
      groups[best].push(x);
    }
    groups.forEach((g, j) => { if (g.length) centres[j] = scale(g.reduce((s2, x) => add(s2, x), [0, 0, 0]), 1 / g.length); });
  }
  return groups;
}

/**
 * A shell for an actor (engine/actor.js), fitted from its skinned body mesh (`mesh`, or the one named "..._body"). THREE is three.js.
 * Returns { capsules (world, as last placed), update(), place(), push(point, options), fitted, body }.
 */
export function createShell(THREE, actor, { mesh = null, minVertices = 60, ends = 0.02, radius = 0.99, split = SPLIT, grow = 1 } = {}) {
  let body = mesh;
  if (!body) {
    actor.model.traverse(o => {
      if (!o.isSkinnedMesh) return;
      if (/_body$/.test(o.name) && !body) body = o;
    });
  }
  if (!body) throw new Error('createShell: the actor has no skinned body mesh');
  const skeleton = body.skeleton;
  const bones = skeleton.bones;
  const index = new Map(bones.map((bone, i) => [bone, i]));
  const geo = body.geometry;
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const v = new THREE.Vector3();
  const toBone = bones.map((_, j) => new THREE.Matrix4().multiplyMatrices(skeleton.boneInverses[j], body.bindMatrix));
  // the widest one capsule may be: SPLIT of the body's diagonal in the mesh, in each bone's own units
  geo.computeBoundingBox();
  const diagonal = geo.boundingBox.getSize(new THREE.Vector3()).length();
  const unit = toBone.map(m => { const sc = new THREE.Vector3().setFromMatrixScale(m); return Math.max(sc.x, sc.y, sc.z); });
  const fitted = fitCapsules({
    count: pos.count,
    dominant: i => {
      let best = 0, w = -1;
      for (let k = 0; k < 4; k++) { const wk = sw.getComponent(i, k); if (wk > w) { w = wk; best = si.getComponent(i, k); } }
      return best;
    },
    parent: j => (bones[j].parent?.isBone && index.has(bones[j].parent) ? index.get(bones[j].parent) : -1),
    local: (i, j) => v.fromBufferAttribute(pos, i).applyMatrix4(toBone[j]).toArray(),
    minVertices, ends, radius,
    maxRadius: j => split * diagonal * unit[j],
  });
  const capsules = fitted.map(f => ({ a: [0, 0, 0], b: [0, 0, 0], r: f.r * grow, bone: bones[f.bone].name }));
  const A = new THREE.Vector3(), B = new THREE.Vector3(), S = new THREE.Vector3();
  const sphere = { centre: [0, 0, 0], radius: 0, widest: 0 };
  // update() is cheap: it notes that the bones may have moved and where the animal stands; the capsules are placed again only when a
  // push comes within reach of it (an animal far from every butterfly costs nothing)
  let stale = true;
  let reachFromRoot = Infinity;
  const root = [0, 0, 0];
  const R0 = new THREE.Vector3();
  function update() {
    stale = true;
    actor.root.updateWorldMatrix(true, false);
    actor.root.getWorldPosition(R0);
    root[0] = R0.x; root[1] = R0.y; root[2] = R0.z;
  }
  function place() {
    stale = false;
    actor.root.updateMatrixWorld(true);
    let lo0 = Infinity, lo1 = Infinity, lo2 = Infinity;
    let hi0 = -Infinity, hi1 = -Infinity, hi2 = -Infinity;
    let widest = 0;
    for (let i = 0; i < fitted.length; i++) {
      const f = fitted[i];
      const m = bones[f.bone].matrixWorld;
      A.set(f.a[0], f.a[1], f.a[2]).applyMatrix4(m);
      B.set(f.b[0], f.b[1], f.b[2]).applyMatrix4(m);
      S.setFromMatrixScale(m);
      const c = capsules[i];
      c.a[0] = A.x; c.a[1] = A.y; c.a[2] = A.z;
      c.b[0] = B.x; c.b[1] = B.y; c.b[2] = B.z;
      const r = f.r * grow * Math.max(S.x, S.y, S.z);
      c.r = r;
      if (r > widest) widest = r;
      if (A.x - r < lo0) lo0 = A.x - r; if (A.x + r > hi0) hi0 = A.x + r;
      if (A.y - r < lo1) lo1 = A.y - r; if (A.y + r > hi1) hi1 = A.y + r;
      if (A.z - r < lo2) lo2 = A.z - r; if (A.z + r > hi2) hi2 = A.z + r;
      if (B.x - r < lo0) lo0 = B.x - r; if (B.x + r > hi0) hi0 = B.x + r;
      if (B.y - r < lo1) lo1 = B.y - r; if (B.y + r > hi1) hi1 = B.y + r;
      if (B.z - r < lo2) lo2 = B.z - r; if (B.z + r > hi2) hi2 = B.z + r;
    }
    if (fitted.length) {
      sphere.centre[0] = (lo0 + hi0) * 0.5;
      sphere.centre[1] = (lo1 + hi1) * 0.5;
      sphere.centre[2] = (lo2 + hi2) * 0.5;
      sphere.radius = Math.hypot(hi0 - lo0, hi1 - lo1, hi2 - lo2) * 0.5;
      sphere.widest = widest;
      // how far from its root the shell can reach, as it stands now and with room for any pose (once)
      if (reachFromRoot === Infinity) {
        reachFromRoot = 1.5 * (Math.hypot(sphere.centre[0] - root[0], sphere.centre[1] - root[1], sphere.centre[2] - root[2]) + sphere.radius) + 1;
      }
    } else {
      sphere.radius = 0;
      sphere.widest = 0;
      reachFromRoot = 0;
    }
  }
  /** Where a thing drawn at `point` ([x, y, z]) may be: pushOut over this shell, after a quick test of its bounds. */
  function push(point, options = {}) {
    const reach = (options.margin ?? 0) + (options.soft ?? SOFT) + 0.01;
    if (reachFromRoot !== Infinity && Math.hypot(point[0] - root[0], point[1] - root[1], point[2] - root[2]) > reachFromRoot + reach) return point;
    if (stale) place();
    if (Math.hypot(point[0] - sphere.centre[0], point[1] - sphere.centre[1], point[2] - sphere.centre[2]) > sphere.radius + reach) return point;
    return pushOut(point, capsules, options);
  }
  update();
  place();
  return {
    capsules, push, fitted, body,
    /** The bones may have moved: call once a frame, after the actors. */
    update,
    /** The capsules where the bones are now (update() leaves that to the first push near enough to need it). */
    place() { place(); return capsules; },
  };
}
