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

export const SOFT = 0.5; // the soft zone, as a share of a capsule's radius (with the margin)
const BIAS = 4; // how strongly the way out leans to the bias inside a capsule, as a share of its radius: enough that the seam
// (below) lies at the shell's own surface on the side away from the bias, where the push is about to end

/**
 * Where a thing drawn at `point` may be, kept out of `capsules` ([{ a: [x, y, z], b, r }]) by `margin` metres, with the soft zone.
 * `forward` is the camera's viewing direction (unit; a push has no component against it); `bias` the way out it leans to (default
 * up and a little away from the camera). `passes` goes round all capsules that many times (one pushed out of may push into another).
 */
export function pushOut(point, capsules, { margin = 0, soft = SOFT, forward = [0, 0, -1], bias = null, passes = 3 } = {}) {
  let p = [point[0], point[1], point[2]];
  const lean = bias ?? add([0, 1, 0], forward, 0.35);
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (const cap of capsules) {
      const next = pushCapsule(p, cap, margin, soft, forward, lean);
      if (next !== p) { p = next; moved = true; }
    }
    if (!moved) break;
  }
  return p;
}

function pushCapsule(p, cap, margin, soft, forward, lean) {
  const R = cap.r + margin;
  const O = R * (1 + soft);
  const c = closestOnSegment(p, cap.a, cap.b);
  const q = sub(p, c);
  const d = len(q);
  if (d >= O) return p;
  // the distance it is to have: at least R, and a soft rise to O (d + R·(1 - d/O)^m, increasing for m = O/R, smooth at O)
  const m = O / R;
  const soft1 = d + R * (1 - d / O) ** m;
  // the way out: the radial direction, leaning to the bias near the axis (less so further out: none at O), toward the camera removed
  const axis = sub(cap.b, cap.a);
  const al = len(axis);
  let b = lean;
  if (al > 1e-9) { const u = scale(axis, 1 / al); b = sub(b, scale(u, dot(b, u))); }
  const bl = len(b);
  b = bl > 1e-9 ? scale(b, 1 / bl) : [0, 1, 0];
  let w = add(q, b, BIAS * R * (1 - smooth(d / O)));
  const toward = dot(w, forward);
  if (toward < 0) w = add(w, forward, -toward);
  let wl = len(w);
  if (wl < 1e-9) {
    w = b;
    const tb = dot(w, forward);
    if (tb < 0) w = add(w, forward, -tb);
    wl = len(w);
    if (wl < 1e-9) return p;
  }
  w = scale(w, 1 / wl);
  // the soft zone counts only as far as the way out goes away from the capsule; inside it must reach R whatever the way
  const along = Math.max(0, d > 1e-9 ? dot(w, q) / d : 1);
  const want = Math.max(R, d + (soft1 - d) * along * along);
  if (want <= d + 1e-9) return p;
  // move along w until the distance is `want`: the distance along a line is convex, so past its lowest point it only grows
  const f = l => distanceTo(add(p, w, l), cap);
  const far = 4 * O + d;
  let lo = 0, hi = far;
  if (f(1e-4) < d) {
    let a = 0, z = far;
    for (let i = 0; i < 48; i++) {
      const m1 = a + (z - a) / 3, m2 = z - (z - a) / 3;
      if (f(m1) < f(m2)) z = m2; else a = m1;
    }
    lo = (a + z) / 2;
  }
  if (f(lo) >= want) return add(p, w, lo);
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < want) lo = mid; else hi = mid;
  }
  return add(p, w, hi);
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];

/**
 * Capsules for a skinned body, from its vertices. `vertices(i)` gives vertex i's position in each bone's frame at bind:
 * `local(i, bone)` → [x, y, z]; `count`; `dominant(i)` → the bone index moving it most; `parent(bone)` → the parent bone index or -1.
 * Returns [{ bone, a, b, r, count }] in the bone's frame.
 */
export function fitCapsules({ count, dominant, parent, local, minVertices = 60, ends = 0.02, radius = 0.99 }) {
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
    capsules.push({ bone, a, b, r, count: list.length });
  }
  return capsules;
}

/**
 * A shell for an actor (engine/actor.js), fitted from its skinned body mesh (`mesh`, or the one named "..._body"). THREE is three.js.
 * Returns { capsules (world, after update), update(), push(point, options), fitted }.
 */
export function createShell(THREE, actor, { mesh = null, minVertices = 60, ends = 0.02, radius = 0.99, grow = 1 } = {}) {
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
    const reach = ((options.margin ?? 0) + sphere.widest) * (1 + (options.soft ?? SOFT));
    if (len(sub(point, sphere.centre)) > sphere.radius + reach) return point;
    return pushOut(point, capsules, options);
  }
  return { capsules, update, push, fitted, body };
}
