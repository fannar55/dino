// Shells: an invisible body of capsules round an animal, which follows its bones, so that things that fly near it (Fiðrildadansinn's
// butterflies, chapters/fidrildi3d.js) can be kept out of it. Off unless a chapter makes one.
//
// The capsules are fitted from the animal's own skinned body mesh (fitCapsules): each vertex goes to the bone that moves it most;
// bones that move few vertices give theirs to their parent; each bone's vertices, in that bone's own frame, give a capsule along
// their main axis (the segment between low and high percentiles of their spread along it) whose radius is a high percentile of their
// distance from it. Nothing is placed by hand per animal. update() reads the bones as they are now; push(point) says where a thing
// drawn at `point` may be (pushOut).
//
// pushOut is stateless: the answer depends only on the drawn point, the capsules and the camera's forward direction, so a seek
// lands on the same frame. Out of each capsule by `margin` (a wing's reach), with a soft zone (soft · radius further out) in which
// a flight bends round early instead of hitting the shell and sliding. The way out leans toward `bias` (up and a little away from
// the camera), so a flight drawn straight through the middle of a capsule goes over it, never flipping from one side to the other
// as it crosses the axis. A push never brings a point nearer the camera: its component toward the camera is taken out, so it moves
// across the view or deeper (going behind an animal is fine; going through it is not).
//
// No continuous push out of a solid can exist for every point (a ball cannot be mapped onto its outside continuously with its
// far surroundings left alone: in any cross-section some drawn point must be torn between two ways round). So there is a seam,
// and it is put where it costs least: on the shell's surface on the side away from the bias (under a lying capsule, from straight
// below round to the front at the soft zone's edge, where the push fades to nothing; in front of a standing one, as its bias is
// back). A flight drawn up into a body from straight below, or into a leg straight from the front, would jump there; a flight
// through the axis, across the view or in depth, and anything entering from above or the sides, moves smoothly. The choreography
// keeps flights from aiming at the seam, and the clip probe (tools/clip-probe.mjs) reports the largest jump of any butterfly.

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
  let p = [point[0], point[1], point[2]];
  const lean = unit(bias ?? add([0, 1, 0], forward, 0.35));
  const g = [0, 0, 0];
  let h = field(p, capsules, margin, g);
  if (h >= soft) return p;
  const want = h <= -soft ? 0 : (soft + h) ** 2 / (4 * soft);
  for (let i = 0; i < 400 && h < want; i++) {
    const beta = BIAS * (1 - smooth((h + soft) / (2 * soft)));
    let w = add(g, lean, beta);
    const toward = dot(w, forward);
    if (toward < 0) w = add(w, forward, -toward);
    let wl = len(w);
    if (wl < 1e-9) {
      w = add(lean, forward, -Math.min(0, dot(lean, forward)));
      wl = len(w);
    }
    w = scale(w, 1 / wl);
    const step = Math.min(0.12, Math.max(0.004, want - h));
    const next = add(p, w, step);
    const g2 = [0, 0, 0];
    const h2 = field(next, capsules, margin, g2);
    if (h2 >= want) {
      // the last step, cut where the field reaches the wanted h (along the step it is near enough straight)
      return h2 > h ? add(p, w, (step * (want - h)) / (h2 - h)) : next;
    }
    p = next;
    h = h2;
    g[0] = g2[0]; g[1] = g2[1]; g[2] = g2[2];
  }
  return p;
}

/** The blended distance outside the capsules less the margin (negative inside), and its slope into `grad`. */
function field(p, capsules, margin, grad) {
  let m = Infinity;
  const fs = [];
  const us = [];
  for (const cap of capsules) {
    const ax = cap.b[0] - cap.a[0], ay = cap.b[1] - cap.a[1], az = cap.b[2] - cap.a[2];
    const l2 = ax * ax + ay * ay + az * az;
    let t = l2 > 1e-12 ? ((p[0] - cap.a[0]) * ax + (p[1] - cap.a[1]) * ay + (p[2] - cap.a[2]) * az) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const vx = p[0] - cap.a[0] - ax * t, vy = p[1] - cap.a[1] - ay * t, vz = p[2] - cap.a[2] - az * t;
    const d = Math.hypot(vx, vy, vz);
    const f = d - cap.r - margin;
    fs.push(f);
    // the way out of it: straight out from its axis, fading to nothing at the axis itself (where straight out flips side), so deep
    // inside the bias alone leads out and the way changes smoothly through the middle
    const k = Math.min(1, d / Math.max(1e-6, 0.5 * (cap.r + margin))) / Math.max(d, 1e-9);
    us.push([vx * k, vy * k, vz * k]);
    if (f < m) m = f;
  }
  let sum = 0;
  grad[0] = grad[1] = grad[2] = 0;
  for (let i = 0; i < fs.length; i++) {
    const e = Math.exp(-(fs[i] - m) / BLEND);
    sum += e;
    grad[0] += e * us[i][0]; grad[1] += e * us[i][1]; grad[2] += e * us[i][2];
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
 * Returns { capsules (world, after update), update(), push(point, options), fitted }.
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
  function update() {
    actor.root.updateMatrixWorld(true);
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    fitted.forEach((f, i) => {
      const m = bones[f.bone].matrixWorld;
      A.fromArray(f.a).applyMatrix4(m);
      B.fromArray(f.b).applyMatrix4(m);
      S.setFromMatrixScale(m);
      const c = capsules[i];
      c.a = A.toArray();
      c.b = B.toArray();
      c.r = f.r * grow * Math.max(S.x, S.y, S.z);
      for (const p of [c.a, c.b]) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k] - c.r); hi[k] = Math.max(hi[k], p[k] + c.r); }
    });
    sphere.centre = scale(add(lo, hi), 0.5);
    sphere.radius = len(sub(hi, lo)) / 2;
    sphere.widest = Math.max(...capsules.map(c => c.r));
  }
  /** Where a thing drawn at `point` ([x, y, z]) may be: pushOut over this shell, after a quick test of its bounds. */
  function push(point, options = {}) {
    const reach = (options.margin ?? 0) + (options.soft ?? SOFT) + 0.01;
    if (len(sub(point, sphere.centre)) > sphere.radius + reach) return point;
    return pushOut(point, capsules, options);
  }
  return { capsules, update, push, fitted, body };
}
