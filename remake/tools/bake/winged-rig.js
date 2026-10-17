import * as THREE from 'three';
import { mergeGeometries } from '../../../dist/vendor/BufferGeometryUtils.js';
import { touchingParts, weldSkin, surfaceDistance, harmonicField, chainWeighting } from './skin.js';

// Rigs a winged character, a pterosaur (Flugeðla the Pteranodon), from an unrigged Tripo export kept
// in parts (remake/tools/blender-decimate.py ... parts). bake-quadruped.js runs it with kind=pterosaur;
// tests and probes run it in Node (geometry only, no textures).
//
// It turns the model to face +X, scales it to its wingspan with the wings spread as in the source and
// stands it on its two feet, the root midway between them. The parts are told apart by position and
// seams: the two that stand on the ground are the legs, the two that reach out furthest to the sides
// are the wings (a membrane with the long fourth finger along its leading edge), the part that holds
// the top of the crest is the head, the one that holds the nose is the beak (it rides the head), the
// part both legs meet is the body (neck, torso and tail), and the parts that meet a wing and the body
// are the arms (upper arm, forearm and hand with three small clawed fingers). The parts weld into one
// closed skin (skin.js), so the material is single-sided: the membrane is a thin closed shell (about
// 3.5 cm thick on Flugeðla), not a sheet.
//
// Tripo turned her head 19 degrees to her right; a character's head should face where she does at
// rest (the actor looks and talks about the head's rest direction), so the bake turns the head and
// beak back about the top of the neck, the turn fading out down the neck (`straighten`).
//
// Bones, all with identity rest rotations so clips turn them about the character's own axes (X
// forward, Y up, Z her right side):
//   root; Hips (over the legs), Spine, Chest (between the shoulders), Neck, Neck2, Neck3 up the neck's
//   centre line, Head (at the top of the neck; the head with its crest and the beak ride it rigidly);
//   Tail1..Tail3 along the tail; the legs as the engine's footing plants a biped's (engine/footing.js,
//   jointed legs): LeftThigh (hip), LeftShin (knee), LeftFoot (the raised heel: metatarsus, toes and
//   claws as one) and the same on the right; and per wing: LeftUpperArm (shoulder), LeftForearm
//   (elbow), LeftWrist (the hand), LeftClaws (its three small fingers) and LeftFinger1..3 (the long
//   fourth finger from its knuckle to the wing's tip).
//
// Weights: the body follows the chain from the tail's tip to the head by where it lies along the line
// through the joints (skin.js, chainWeighting); a leg by the planes that halve its knee and its ankle,
// the thigh's top fading into the hips; an arm and the wing's leading edge by where they lie along the
// line shoulder, elbow, wrist, knuckle, finger joints, tip (`limbWeighting`); the claws ride their bone.
// The body around a shoulder or a hip follows the limb as heat would spread from it (a harmonic field),
// so a flap bends the shoulder instead of shearing the arm out of the body. The membrane blends between
// what holds its edges: the finger and the arm along its leading edge, the body along the flank and the
// thigh at its inner corner, as a harmonic field of all their weights at once over its surface, so it
// folds and stretches with them and never tears. The copies of a seam vertex share one set of weights.

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const smooth = u => u * u * (3 - 2 * u);
const ss = (a, b, x) => smooth(clamp((x - a) / (b - a), 0, 1));
const r3 = v => v.toArray().map(n => +n.toFixed(3));
const mean = list => list.reduce((s, p) => s.add(p), V()).divideScalar(Math.max(1, list.length));
const unit = v => v.clone().normalize();
const SIDES = ['Left', 'Right'];

export const WING_BONES = ['UpperArm', 'Forearm', 'Wrist', 'Claws', 'Finger1', 'Finger2', 'Finger3'];

function pointsOf(geometry) {
  const p = geometry.attributes.position;
  const out = new Array(p.count);
  for (let i = 0; i < p.count; i++) out[i] = V().fromBufferAttribute(p, i);
  return out;
}

// Centroids of the points within `half` of each station along an axis.
function slices(points, axis, from, to, step, half) {
  const out = [];
  for (let v = from; v <= to + 1e-9; v += step) {
    const near = points.filter(p => Math.abs(p[axis] - v) < half);
    if (near.length < 6) continue;
    out.push({ v, c: mean(near) });
  }
  return out;
}
// A point along stations (sorted by v), interpolated at v.
function atStation(stations, v) {
  if (v <= stations[0].v) return stations[0].c.clone();
  for (let i = 1; i < stations.length; i++) {
    if (v <= stations[i].v) return stations[i - 1].c.clone().lerp(stations[i].c, (v - stations[i - 1].v) / (stations[i].v - stations[i - 1].v));
  }
  return stations.at(-1).c.clone();
}

// A polyline: its length so far at each point, the point at a length, and where a point lies along it.
function polyline(points) {
  const run = [0];
  for (let i = 1; i < points.length; i++) run.push(run[i - 1] + points[i].distanceTo(points[i - 1]));
  return {
    points, run, length: run.at(-1),
    at(s) {
      let i = 1;
      while (i < points.length - 1 && run[i] < s) i++;
      return points[i - 1].clone().lerp(points[i], clamp((s - run[i - 1]) / Math.max(1e-9, run[i] - run[i - 1]), 0, 1));
    },
  };
}

// The middle of a tube of points between two ends: stations every `step` along the way, each the
// middle of the section across the way there (halfway between its extremes in two directions across,
// of the points within `half` of the section's plane and `radius` of the way), as a polyline.
function centreLine(points, from, to, { step, half, radius }) {
  const dir = to.clone().sub(from);
  const length = dir.length();
  dir.divideScalar(length);
  const u = Math.abs(dir.y) < 0.9 ? V(0, 1, 0).cross(dir).normalize() : V(1, 0, 0).cross(dir).normalize();
  const w = dir.clone().cross(u);
  const out = [];
  for (let s = 0; s <= length + 1e-9; s += step) {
    const c = from.clone().addScaledVector(dir, s);
    let u0 = Infinity, u1 = -Infinity, w0 = Infinity, w1 = -Infinity, n = 0;
    for (const p of points) {
      const d = p.clone().sub(c);
      const along = d.dot(dir);
      if (Math.abs(along) >= half) continue;
      const a = d.dot(u), b = d.dot(w);
      if (a * a + b * b >= radius * radius) continue;
      u0 = Math.min(u0, a); u1 = Math.max(u1, a); w0 = Math.min(w0, b); w1 = Math.max(w1, b);
      n++;
    }
    if (n < 6) continue;
    out.push(c.addScaledVector(u, (u0 + u1) / 2).addScaledVector(w, (w0 + w1) / 2));
  }
  return polyline(out);
}

/**
 * Weights along a limb: owners[k] holds the stretch from joints[k] to joints[k + 1] (the last runs on
 * past the end), and `before` what lies before joints[0]. A point's place along the limb is where it
 * lies along the polyline through the joints in 3D, a point near several stretches (inside a bend)
 * blending their places as chainWeighting does, so the inside of a bend has no seam of its own. Bones
 * blend over a band around each joint: 0.45 of the shorter stretch beside it (`bands` overrides, in
 * metres per joint). Returns (p, out) => pushes [bone, weight] pairs onto out.
 */
function limbWeighting(joints, owners, before, { bands = [], sharp = 0.01 } = {}) {
  const line = polyline(joints);
  const stretches = joints.slice(1).map((b, k) => {
    const a = joints[k], dir = b.clone().sub(a);
    const len = dir.length();
    return { a, dir: dir.divideScalar(len), len };
  });
  const cuts = line.run;
  const halfBand = cuts.map((s, k) => {
    if (bands[k] !== undefined) return bands[k];
    const left = k > 0 ? s - cuts[k - 1] : Infinity;
    const right = k < cuts.length - 1 ? cuts[k + 1] - s : Infinity;
    return 0.45 * Math.min(left, right);
  });
  const d = V();
  const place = p => {
    let nearest = Infinity;
    const places = stretches.map((s, k) => {
      let u = d.subVectors(p, s.a).dot(s.dir);
      if (k > 0) u = Math.max(0, u); // the first stretch runs on before the first joint
      if (k < stretches.length - 1) u = Math.min(s.len, u); // and the last past the end
      const dist = d.subVectors(p, s.a).addScaledVector(s.dir, -u).length();
      nearest = Math.min(nearest, dist);
      return [cuts[k] + u, dist];
    });
    const sigma = sharp * line.length + 0.25 * nearest;
    let sum = 0, weight = 0;
    for (const [t, dist] of places) { const w = Math.exp(-(((dist - nearest) / sigma) ** 2)); sum += w * t; weight += w; }
    return sum / weight;
  };
  const named = k => (k < 0 ? before : owners[Math.min(k, owners.length - 1)]);
  return (p, out) => {
    const s = place(p);
    let k = 0;
    while (k < cuts.length && s > cuts[k]) k++; // owners[k - 1] holds s; before the first joint, `before`
    for (const j of [k - 1, k]) {
      if (j < 0 || j >= cuts.length - 1 || Math.abs(s - cuts[j]) >= halfBand[j]) continue;
      const t = smooth((s - (cuts[j] - halfBand[j])) / (2 * halfBand[j]));
      out.push([named(j - 1), 1 - t], [named(j), t]);
      return;
    }
    out.push([named(k - 1), 1]);
  };
}

/**
 * sources: [{ name, geometry }] in the model's own frame (each part's world matrix applied).
 * Options: span (metres, wingtip to wingtip as in the source), yaw (degrees that turn the model's
 * front to +X: Tripo faces +Z, so 90), name, neck and tail (bones in each chain), straighten (turn
 * the head back to face forward: true), spread (how far the body around a shoulder or a hip follows
 * the limb: 1 is 7 % of the wingspan along the surface).
 */
export function rigWinged(sources, { span = 7.5, yaw = 90, name = 'Flugeðla', neck = 3, tail = 3, straighten = true, spread = 1 } = {}) {
  const report = {};

  // --- stand it up: front to +X, `span` across the wings, on the ground --------------------------------
  const turn = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(yaw));
  const geometries = sources.map(({ geometry }) => {
    const g = geometry.clone().applyMatrix4(turn);
    for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    return g;
  });
  const box = new THREE.Box3();
  geometries.forEach(g => { g.computeBoundingBox(); box.union(g.boundingBox); });
  const scale = span / (box.max.z - box.min.z);
  const centre = box.getCenter(V());
  const fit = new THREE.Matrix4().makeScale(scale, scale, scale).multiply(new THREE.Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z));
  geometries.forEach(g => g.applyMatrix4(fit));
  const H = (box.max.y - box.min.y) * scale;

  const describe = part => {
    part.geometry.computeBoundingBox();
    part.box = part.geometry.boundingBox.clone();
    part.c = part.box.getCenter(V());
    part.size = part.box.getSize(V());
    part.points = pointsOf(part.geometry);
  };
  const parts = sources.map(({ name: partName }, i) => {
    const part = { name: partName, geometry: geometries[i], verts: geometries[i].attributes.position.count };
    describe(part);
    return part;
  });

  // --- which part is which ----------------------------------------------------------------------------
  const touching = touchingParts(parts);
  const legParts = parts.filter(p => p.box.min.y < 0.02 * H && p.size.y > 0.15 * H);
  if (legParts.length !== 2) throw new Error(`expected 2 leg parts standing on the ground, found ${legParts.length}`);
  const reachOut = p => Math.max(-p.box.min.z, p.box.max.z);
  const wingParts = parts.filter(p => !legParts.includes(p) && reachOut(p) > 0.4 * span);
  if (wingParts.length !== 2) throw new Error(`expected 2 wing parts reaching out to the sides, found ${wingParts.length}`);
  const others = parts.filter(p => !legParts.includes(p) && !wingParts.includes(p));
  const head = others.reduce((a, b) => (b.box.max.y > a.box.max.y ? b : a)); // the top of the crest
  const nose = others.reduce((a, b) => (b.box.max.x > a.box.max.x ? b : a));
  const beak = nose !== head ? nose : null;
  if (beak && !touching.get(beak).has(head)) throw new Error('the beak does not meet the head');
  const inner = others.filter(p => p !== head && p !== beak);
  const body = inner.filter(p => legParts.every(l => touching.get(p).has(l))).reduce((a, b) => (!a || b.verts > a.verts ? b : a), null);
  if (!body) throw new Error('no body part between the legs');
  if (!touching.get(body).has(head)) throw new Error('the head does not meet the body');
  const armParts = inner.filter(p => p !== body && wingParts.some(w => touching.get(p).has(w)) && touching.get(p).has(body));
  if (armParts.length !== 2) throw new Error(`expected 2 arm parts between a wing and the body, found ${armParts.length}`);
  const leftover = inner.filter(p => p !== body && !armParts.includes(p));
  if (leftover.length) throw new Error(`parts the rig does not know: ${leftover.map(p => p.name).join(', ')}`);
  const sideOf = p => (p.c.z < 0 ? 'Left' : 'Right'); // facing +X, her left side is -Z
  const limbs = Object.fromEntries(SIDES.map(side => [side, {
    side,
    leg: legParts.find(p => sideOf(p) === side),
    arm: armParts.find(p => sideOf(p) === side),
    wing: wingParts.find(p => sideOf(p) === side),
  }]));
  for (const side of SIDES) if (!limbs[side].leg || !limbs[side].arm || !limbs[side].wing) throw new Error(`no ${side.toLowerCase()} leg, arm or wing`);

  // --- on her feet: the root midway between the soles, the soles flat on the ground -------------------
  const soleOf = leg => {
    let sole = leg.points.filter(p => p.y < 0.01 * H);
    if (sole.length < 8) sole = [...leg.points].sort((a, b) => a.y - b.y).slice(0, 24);
    return new THREE.Box3().setFromPoints(sole).getCenter(V()).setY(0);
  };
  const middle = soleOf(limbs.Left.leg).add(soleOf(limbs.Right.leg)).multiplyScalar(0.5);
  const shift = new THREE.Matrix4().makeTranslation(-middle.x, 0, -middle.z);
  // What lies within a few centimetres of the ground is put on it, so both feet stand flat (the engine
  // finds the toes' ground contact there).
  const SOLE = 0.008 * H;
  for (const part of parts) {
    part.geometry.applyMatrix4(shift);
    if (legParts.includes(part)) {
      const pos = part.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) if (pos.getY(i) < SOLE) pos.setY(i, 0);
    }
    describe(part);
  }
  report.fit = { scale: +scale.toFixed(4), span, height: +H.toFixed(3), parts: parts.length };

  // --- one closed skin ------------------------------------------------------------------------------
  const skin = weldSkin(parts);
  const { rep, owner, at, partsAt, seamOf, closed } = skin;
  report.skin = skin.report;
  const seamBetween = (a, b) => seamOf(a).filter(r => partsAt.get(r).has(b));

  // --- the head turned to face forward ---------------------------------------------------------------
  // The beak's heading (from the middle of its seam with the head to its tip) says how far the head is
  // turned. The head and the beak turn back about the vertical through the top of the neck (the middle of
  // the head's seam with the body); down the neck the turn fades out over `band` along the surface.
  const neckTop = mean(seamBetween(head, body).map(at));
  if (straighten && beak) {
    const tip = beak.points.reduce((a, b) => (b.x > a.x ? b : a));
    const base = mean(seamBetween(beak, head).map(at));
    const angle = Math.atan2(tip.z - base.z, tip.x - base.x);
    const band = 0.12 * H;
    const down = surfaceDistance(skin, seamBetween(head, body), new Set([body]), band);
    const share = r => (partsAt.get(r).has(head) || (beak && partsAt.get(r).has(beak)) ? 1 : down.has(r) ? smooth(1 - down.get(r) / band) : 0);
    const q = new THREE.Quaternion();
    const yAxis = V(0, 1, 0);
    const v = V();
    for (const part of parts) {
      const pos = part.geometry.attributes.position, nrm = part.geometry.attributes.normal;
      for (let i = 0; i < part.verts; i++) {
        const s = share(rep[part.offset + i]);
        if (s <= 0) continue;
        q.setFromAxisAngle(yAxis, s * angle);
        const p = part.points[i].sub(neckTop).applyQuaternion(q).add(neckTop);
        pos.setXYZ(i, p.x, p.y, p.z);
        if (nrm) { v.fromBufferAttribute(nrm, i).applyQuaternion(q); nrm.setXYZ(i, v.x, v.y, v.z); }
      }
    }
    parts.forEach(describe);
    // describe() made new points: the skin's positions are the parts' points again.
    report.straighten = { degrees: +THREE.MathUtils.radToDeg(angle).toFixed(1), pivot: r3(neckTop), band: +band.toFixed(3) };
  }
  // The skin looks positions up through the parts' points (at); describe() replaced them, so the clusters
  // are read again from the parts.

  // --- joints: the legs -------------------------------------------------------------------------------
  // As Grameðla's: the hip high in the thigh, the knee the front-most point of the leg's centre line
  // about halfway down, the heel the back-most point low down; the toes' ground contact at the front of
  // the pads. The two legs mirror each other across the middle.
  const J = { root: V() };
  const legInfo = {};
  for (const side of SIDES) {
    const leg = limbs[side].leg;
    const top = leg.box.max.y;
    const curve = slices(leg.points, 'y', 0.04 * top, top, 0.025 * top, 0.02 * top);
    const band = (lo, hi) => curve.filter(s => s.v >= lo * top && s.v <= hi * top);
    const heel = band(0.12, 0.42).reduce((a, b) => (b.c.x < a.c.x ? b : a)).c;
    const knee = band(0.45, 0.72).reduce((a, b) => (b.c.x > a.c.x ? b : a)).c;
    const hip = atStation(curve, 0.86 * top);
    const pads = leg.points.filter(p => p.y < 0.03 * top);
    legInfo[side] = { hip, knee, heel, toe: V(Math.max(...pads.map(p => p.x)), 0, mean(pads).z) };
  }
  for (const key of ['hip', 'knee', 'heel', 'toe']) {
    const l = legInfo.Left[key], r = legInfo.Right[key];
    const x = (l.x + r.x) / 2, y = (l.y + r.y) / 2, z = (r.z - l.z) / 2;
    l.set(x, y, -z);
    r.set(x, y, z);
  }
  for (const side of SIDES) {
    J[`${side}Thigh`] = legInfo[side].hip.clone();
    J[`${side}Shin`] = legInfo[side].knee.clone();
    J[`${side}Foot`] = legInfo[side].heel.clone();
  }

  // --- joints: the arms and the wings ------------------------------------------------------------------
  // The shoulder is the middle of the arm's seam with the body. The arm's centre line runs out from it
  // (sections across the span); the hand begins where the arm grows wide (the palm and the clawed
  // fingers reaching forward), so the wrist is the last section before that, and the elbow the point of
  // the centre line furthest from the straight way between shoulder and wrist. The wing's leading edge is
  // the top of the membrane: the knuckle of the long finger is on it level with the hand's outer end,
  // the tip is the wing's outermost point, and two more joints divide the finger in three. The two wings
  // mirror each other across the middle.
  const armInfo = {};
  const mirror = keys => {
    for (const key of keys) {
      const l = armInfo.Left[key], r = armInfo.Right[key];
      const x = (l.x + r.x) / 2, y = (l.y + r.y) / 2, z = (r.z - l.z) / 2;
      l.set(x, y, -z);
      r.set(x, y, z);
    }
  };
  const outward = side => (side === 'Left' ? p => -p.z : p => p.z);
  for (const side of SIDES) {
    const { arm, wing } = limbs[side];
    const out = outward(side);
    const shoulder = mean(seamBetween(arm, body).map(at));
    const far = Math.max(...arm.points.map(out));
    const stations = [];
    for (let s = out(shoulder); s <= far + 1e-9; s += 0.02 * span) {
      const slab = arm.points.filter(p => Math.abs(out(p) - s) < 0.01 * span);
      if (slab.length < 6) continue;
      const xs = slab.map(p => p.x);
      stations.push({ s, c: mean(slab), width: Math.max(...xs) - Math.min(...xs) });
    }
    const widths = stations.slice(0, Math.max(3, Math.floor(stations.length * 0.6))).map(t => t.width).sort((a, b) => a - b);
    const usual = widths[Math.floor(widths.length / 2)];
    let w = stations.findIndex((t, i) => i > 2 && t.width > 1.5 * usual);
    if (w < 0) w = stations.length - 1;
    const wrist = stations[Math.max(1, w - 1)].c.clone();
    const chord = new THREE.Line3(shoulder, wrist);
    const off = c => chord.closestPointToPoint(c, true, V()).distanceTo(c);
    const elbow = stations.slice(0, w).reduce((a, b) => (off(b.c) > off(a.c) ? b : a)).c.clone();
    const tip = wing.points.reduce((a, b) => (out(b) > out(a) ? b : a)).clone();
    armInfo[side] = { shoulder, elbow, wrist, tip, usual };
  }
  mirror(['shoulder', 'elbow', 'wrist', 'tip']);
  const usual = (armInfo.Left.usual + armInfo.Right.usual) / 2; // the forearm's width
  for (const side of SIDES) {
    const { arm, wing } = limbs[side];
    const out = outward(side);
    const a = armInfo[side];
    // The hand: the arm beyond the wrist. Its clawed fingers reach forward: the points ahead of the
    // wrist by more than half the forearm's width.
    const hand = arm.points.filter(p => out(p) > out(a.wrist) - 0.01 * span);
    const claws = hand.filter(p => p.x > a.wrist.x + 0.6 * usual);
    // The leading edge: the top of the wing, section by section out to the tip.
    const edge = [];
    for (let s = out(a.wrist); s <= out(a.tip) - 0.01 * span; s += 0.02 * span) {
      const slab = wing.points.filter(p => Math.abs(out(p) - s) < 0.01 * span);
      if (slab.length < 6) continue;
      const topY = Math.max(...slab.map(p => p.y));
      edge.push(mean(slab.filter(p => p.y > topY - 0.012 * span)));
    }
    edge.push(a.tip.clone());
    const handEnd = Math.max(...hand.map(out));
    a.knuckle = edge.reduce((p, q) => (Math.abs(out(q) - handEnd) < Math.abs(out(p) - handEnd) ? q : p)).clone();
    // The finger from the knuckle to the tip, in three.
    const finger = polyline([a.knuckle, ...edge.filter(p => out(p) > out(a.knuckle) + 1e-6)]);
    a.f2 = finger.at(finger.length / 3);
    a.f3 = finger.at((2 * finger.length) / 3);
    a.clawTip = claws.length ? mean(claws) : a.wrist.clone();
    a.claws = claws.length;
  }
  mirror(['knuckle', 'f2', 'f3', 'clawTip']);
  for (const side of SIDES) {
    const a = armInfo[side];
    J[`${side}UpperArm`] = a.shoulder.clone();
    J[`${side}Forearm`] = a.elbow.clone();
    J[`${side}Wrist`] = a.wrist.clone();
    J[`${side}Claws`] = a.wrist.clone().lerp(a.clawTip, 0.35);
    J[`${side}Finger1`] = a.knuckle.clone();
    J[`${side}Finger2`] = a.f2.clone();
    J[`${side}Finger3`] = a.f3.clone();
  }

  // --- joints: the spine, the neck, the head and the tail ---------------------------------------------
  // On the middle line: the hips a little above the hip joints, the chest between the shoulders, the
  // spine between them; the neck's joints along its centre line up to the head's joint at the top of the
  // neck; the tail's along its centre line out to its tip.
  const hipJoint = J.LeftThigh;
  J.Hips = V(hipJoint.x, hipJoint.y + 0.04 * H, 0);
  J.Chest = V(armInfo.Left.shoulder.x, armInfo.Left.shoulder.y, 0);
  J.Spine = J.Hips.clone().lerp(J.Chest, 0.5);
  J.Head = neckTop.clone().setZ(0);
  const neckNames = Array.from({ length: neck }, (_, i) => (i ? `Neck${i + 1}` : 'Neck'));
  const neckLine = centreLine(body.points, J.Chest, J.Head, { step: 0.01 * span, half: 0.006 * span, radius: 0.08 * span });
  const neckPath = polyline([J.Chest, ...neckLine.points.filter(p => p.distanceTo(J.Chest) > 0.02 * span && p.distanceTo(J.Head) > 0.02 * span), J.Head]);
  neckNames.forEach((n, i) => { J[n] = neckPath.at(((i + 1) / (neck + 1)) * neckPath.length).setZ(0); });
  const tailTip = body.points.reduce((a, b) => (b.x < a.x ? b : a));
  const tailLine = centreLine(body.points, J.Hips, tailTip, { step: 0.01 * span, half: 0.006 * span, radius: 0.08 * span });
  const tailPath = polyline([J.Hips, ...tailLine.points.filter(p => p.distanceTo(J.Hips) > 0.02 * span), tailTip.clone()]);
  const tailNames = Array.from({ length: tail }, (_, i) => `Tail${i + 1}`);
  tailNames.forEach((n, i) => { J[n] = tailPath.at(((i + 1) / (tail + 1)) * tailPath.length).setZ(0); });

  const torsoDir = J.Chest.clone().sub(J.Hips).normalize(); // the body's long axis, hips to chest

  // --- bones: identity rest rotations, positions relative to the parent joint --------------------------
  const PARENT = { Hips: 'root', Spine: 'Hips', Chest: 'Spine' };
  neckNames.forEach((n, i) => { PARENT[n] = i ? neckNames[i - 1] : 'Chest'; });
  PARENT.Head = neckNames.at(-1);
  tailNames.forEach((n, i) => { PARENT[n] = i ? tailNames[i - 1] : 'Hips'; });
  for (const side of SIDES) Object.assign(PARENT, { [`${side}Thigh`]: 'Hips', [`${side}Shin`]: `${side}Thigh`, [`${side}Foot`]: `${side}Shin` });
  for (const side of SIDES) {
    Object.assign(PARENT, {
      [`${side}UpperArm`]: 'Chest', [`${side}Forearm`]: `${side}UpperArm`, [`${side}Wrist`]: `${side}Forearm`,
      [`${side}Claws`]: `${side}Wrist`, [`${side}Finger1`]: `${side}Wrist`, [`${side}Finger2`]: `${side}Finger1`, [`${side}Finger3`]: `${side}Finger2`,
    });
  }
  const names = ['root', ...Object.keys(PARENT)];
  const bones = {};
  for (const n of names) {
    const b = new THREE.Bone();
    b.name = n;
    b.position.copy(J[n]).sub(PARENT[n] ? J[PARENT[n]] : V());
    bones[n] = b;
    if (PARENT[n]) bones[PARENT[n]].add(b);
  }
  const index = Object.fromEntries(names.map((n, i) => [n, i]));

  // --- skin weights: the body --------------------------------------------------------------------------
  const owners = [...tailNames].reverse().concat(['Hips', 'Spine', 'Chest', ...neckNames, 'Head']);
  const chain = chainWeighting(owners, J, { curve: true, length: span });
  const bodyChain = (p, out) => chain.weights(chain.along(p), out);

  // --- the legs ----------------------------------------------------------------------------------------
  // The thigh's top fades into the hips; the knee and the ankle blend over the planes that halve them.
  const legWeights = {};
  for (const side of SIDES) {
    const { hip: Hj, knee: K, heel: A, toe: T } = legInfo[side];
    const a = unit(K.clone().sub(Hj)), b = unit(A.clone().sub(K)), c = unit(T.clone().sub(A));
    const nK = unit(a.clone().add(b)), nA = unit(b.clone().add(c));
    const len = Hj.y;
    legWeights[side] = (p, out, own = true) => {
      const leg = own ? ss(-0.16 * len, 0.06 * len, p.clone().sub(Hj).dot(a)) : 1;
      const shin = ss(-0.07 * len, 0.07 * len, p.clone().sub(K).dot(nK));
      const foot = ss(-0.05 * len, 0.05 * len, p.clone().sub(A).dot(nA));
      if (leg < 1) { const body = []; bodyChain(p, body); for (const [bone, w] of body) out.push([bone, w * (1 - leg)]); }
      out.push([`${side}Thigh`, leg * (1 - shin)], [`${side}Shin`, leg * shin * (1 - foot)], [`${side}Foot`, leg * shin * foot]);
    };
  }

  // --- the arms and the leading edge of the wings ------------------------------------------------------
  // One line per side, shoulder to tip: the upper arm, the forearm, the hand (Wrist), the finger in three.
  // The arm before the shoulder belongs to the chest. The clawed fingers ride their bone, blending in
  // over their base.
  const limbWeights = {};
  const clawShare = {};
  for (const side of SIDES) {
    const a = armInfo[side];
    limbWeights[side] = limbWeighting([a.shoulder, a.elbow, a.wrist, a.knuckle, a.f2, a.f3, a.tip],
      ['UpperArm', 'Forearm', 'Wrist', 'Finger1', 'Finger2', 'Finger3'].map(n => `${side}${n}`), 'Chest');
    const dir = unit(a.clawTip.clone().sub(a.wrist));
    const reach = a.clawTip.distanceTo(a.wrist);
    clawShare[side] = p => (p.clone().sub(a.wrist).dot(dir) > 0 ? ss(0.35 * reach, 0.75 * reach, p.clone().sub(a.wrist).dot(dir)) * ss(-0.02 * span, 0.02 * span, p.x - a.wrist.x - 0.4 * usual) : 0);
  }
  const armWeights = (side, p, out) => {
    const claws = clawShare[side](p);
    const w = [];
    limbWeights[side](p, w);
    for (const [bone, v] of w) out.push([bone, v * (1 - claws)]);
    if (claws > 0) out.push([`${side}Claws`, claws]);
  };

  // --- the body around the shoulders and the hips ------------------------------------------------------
  // A limb's share of a body vertex (the arm's: all but the chest's part of its weights; the leg's: all
  // but the hips') spreads over the body from the seam as heat would, to nothing at 7 % of the wingspan
  // (times `spread`) along the surface; there the body takes the limb's root bone that much.
  const limbShare = (side, kind) => {
    const part = limbs[side][kind];
    const reachD = spread * 0.07 * span; // about half a metre on Flugeðla
    const near = surfaceDistance(skin, seamBetween(part, body), new Set([body]), reachD);
    const own = r => {
      const w = [];
      if (kind === 'arm') armWeights(side, at(r), w); else legWeights[side](at(r), w);
      return w.filter(([bone]) => bone.startsWith(side)).reduce((s, [, v]) => s + v, 0);
    };
    const field = harmonicField(skin, new Set([body, part]), r => {
      if (partsAt.get(r).has(part)) return { value: own(r), free: false };
      if (near.has(r)) return { value: own(r) * (1 - near.get(r) / reachD), free: true };
      return null;
    });
    return { field, reachD, bone: `${side}${kind === 'arm' ? 'UpperArm' : 'Thigh'}` };
  };
  const shares = SIDES.flatMap(side => [limbShare(side, 'arm'), limbShare(side, 'leg')]);
  // Along the middle of her back the body keeps its own weights: a strip as wide as her shoulders are
  // apart follows the spine alone, so a saddle on it stays put while the wings beat (winged-clips.js
  // finds the seat there). The limbs' share fades in beside it.
  const torsoUp = V(-torsoDir.y, torsoDir.x, 0); // across the torso, toward her back
  const backStrip = p => (p.clone().sub(J.Hips).dot(torsoUp) > 0 ? ss(0.6, 1.0, Math.abs(p.z) / armInfo.Right.shoulder.z) : 1);
  report.spread = Object.fromEntries(shares.map(s => [s.bone, +s.reachD.toFixed(3)]));

  // --- weights per cluster -----------------------------------------------------------------------------
  const cache = new Map(); // weld cluster -> weights, so both sides of a seam get the same ones
  const kindOf = part => (part === head || part === beak ? 'head' : part === body ? 'body'
    : legParts.includes(part) ? 'leg' : armParts.includes(part) ? 'arm' : 'wing');
  const finish = list => {
    const merged = new Map();
    for (const [bone, value] of list) if (value > 0) merged.set(bone, (merged.get(bone) || 0) + value);
    const kept = [...merged].filter(e => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = kept.reduce((s, e) => s + e[1], 0);
    return kept.map(([bone, value]) => [bone, value / total]);
  };
  // Every cluster but the wing's own (the membrane, solved below): the head rigid, the limbs, the body.
  const ruled = r => {
    const at3 = at(r);
    const here = partsAt.get(r);
    if (here.has(head) || (beak && here.has(beak))) return [['Head', 1]];
    const out = [];
    const limb = [...here].find(p => legParts.includes(p) || armParts.includes(p));
    if (limb) {
      const side = sideOf(limb);
      if (legParts.includes(limb)) legWeights[side](at3, out); else armWeights(side, at3, out);
      return finish(out);
    }
    if (here.has(body)) {
      const w = [];
      bodyChain(at3, w);
      let taken = 0;
      const extra = [];
      const strip = backStrip(at3);
      for (const s of shares) {
        const v = clamp(s.field.get(r) ?? 0, 0, 1) * strip;
        if (v > 0) { extra.push([s.bone, v]); taken += v; }
      }
      const k = taken > 1 ? 1 / taken : 1;
      for (const [bone, v] of w) out.push([bone, v * (1 - taken * k)]);
      for (const [bone, v] of extra) out.push([bone, v * k]);
      return finish(out);
    }
    return null; // the wing's own
  };
  for (let r = 0; r < rep.length; r++) {
    if (rep[r] !== r) continue;
    const w = ruled(r);
    if (w) cache.set(r, w);
  }

  // --- the membrane ------------------------------------------------------------------------------------
  // Fixed where something holds it: along its seams (the arm's, the body's, the thigh's weights there) and
  // along the leading edge (the finger and the arm by where they lie along the line, within the edge's
  // reach); everywhere else a harmonic field of all the bones at once, so its weights blend smoothly
  // between whatever holds its edges.
  report.membrane = {};
  for (const side of SIDES) {
    const wing = limbs[side].wing;
    const a = armInfo[side];
    const lead = polyline([a.shoulder, a.elbow, a.wrist, a.knuckle, a.f2, a.f3, a.tip]);
    const edgeReach = 0.012 * span;
    const fingerLine = polyline([a.knuckle, a.f2, a.f3, a.tip]);
    const distToLine = (line, p) => {
      let best = Infinity;
      for (let i = 1; i < line.points.length; i++) best = Math.min(best, new THREE.Line3(line.points[i - 1], line.points[i]).closestPointToPoint(p, true, V()).distanceTo(p));
      return best;
    };
    const clusters = new Set();
    for (let i = 0; i < wing.verts; i++) clusters.add(rep[wing.offset + i]);
    const anchors = new Map();
    let onEdge = 0;
    for (const r of clusters) {
      if (cache.has(r)) { anchors.set(r, cache.get(r)); continue; } // a seam
      const p = at(r);
      if (distToLine(fingerLine, p) < edgeReach || distToLine(lead, p) < 0.5 * edgeReach) {
        const w = [];
        limbWeights[side](p, w);
        anchors.set(r, finish(w));
        onEdge++;
      }
    }
    const channels = [...new Set([...anchors.values()].flatMap(w => w.map(([bone]) => bone)))];
    const slot = Object.fromEntries(channels.map((bone, i) => [bone, i]));
    const field = harmonicField(skin, new Set([wing]), r => {
      if (!clusters.has(r)) return null;
      const value = new Array(channels.length).fill(0);
      const fixed = anchors.get(r);
      if (fixed) { for (const [bone, v] of fixed) value[slot[bone]] = v; return { value, free: false }; }
      return { value, free: true };
    }, { channels: channels.length });
    const solved = new Map();
    for (const r of clusters) {
      if (cache.has(r)) continue;
      const v = field.get(r);
      solved.set(r, channels.map((_, i) => clamp(v ? v[i] : 0, 0, 1)));
    }
    // The membrane is a thin closed shell: a point on one face and the point facing it on the other
    // (within a few centimetres, its normal turned the other way) take the same weights, so the two faces
    // move as one and never cross when the wing bends: both their mean, or the fixed weights of the one
    // that is held (on the finger's edge or a seam).
    const fixedWeights = r => { const w = new Array(channels.length).fill(0); for (const [bone, v] of anchors.get(r)) w[slot[bone]] = v; return w; };
    const normalOf = new Map();
    {
      const nrm = wing.geometry.attributes.normal;
      for (let i = 0; i < wing.verts; i++) {
        const r = rep[wing.offset + i];
        (normalOf.get(r) || normalOf.set(r, V()).get(r)).add(V().fromBufferAttribute(nrm, i));
      }
      for (const n of normalOf.values()) n.normalize();
    }
    const reachTwin = 0.012 * span;
    const grid = new Map();
    const cellOf = p => `${Math.floor(p.x / reachTwin)},${Math.floor(p.y / reachTwin)},${Math.floor(p.z / reachTwin)}`;
    for (const r of clusters) { const k = cellOf(at(r)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(r); }
    const twin = new Map();
    for (const r of solved.keys()) {
      const p = at(r), n = normalOf.get(r);
      let best = null, bestD = reachTwin;
      const [cx, cy, cz] = cellOf(p).split(',').map(Number);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const o of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) {
          if (o === r || normalOf.get(o).dot(n) > -0.3) continue;
          const d = at(o).distanceTo(p);
          if (d < bestD) { bestD = d; best = o; }
        }
      }
      if (best !== null) twin.set(r, best);
    }
    // A few rounds: each free point eases toward its neighbours on the membrane, then the facing points are
    // made one again, so the faces stay together and the weights stay smooth where a face meets a held point.
    const near = new Map();
    for (const edge of skin.edges.values()) {
      if (edge.part !== wing) continue;
      for (const [from, to] of [[edge.a, edge.b], [edge.b, edge.a]]) if (solved.has(from)) (near.get(from) || near.set(from, []).get(from)).push(to);
    }
    let current = new Map(solved);
    const valueOf = r => (anchors.has(r) ? fixedWeights(r) : current.get(r));
    const pairUp = () => {
      const next = new Map();
      for (const [r, w] of current) {
        const t = twin.get(r);
        next.set(r, t === undefined ? w : anchors.has(t) ? fixedWeights(t) : w.map((x, i) => 0.5 * (x + current.get(t)[i])));
      }
      current = next;
    };
    for (let round = 0; round < 4; round++) {
      pairUp();
      const next = new Map();
      for (const [r, w] of current) {
        const list = near.get(r) || [];
        if (!list.length) { next.set(r, w); continue; }
        const mean = new Array(w.length).fill(0);
        for (const o of list) valueOf(o).forEach((x, i) => { mean[i] += x / list.length; });
        next.set(r, w.map((x, i) => 0.5 * x + 0.5 * mean[i]));
      }
      current = next;
    }
    pairUp();
    // Facing points that pair up (and the points they pair with in turn) share one set of weights, cut
    // to four bones once for all of them: a held point's, or their mean.
    const group = new Map([...current.keys()].map(r => [r, r]));
    const root = r => { while (group.get(r) !== r) r = group.get(r); return r; };
    for (const [r, t] of twin) if (current.has(t)) { const a = root(r), b = root(t); if (a !== b) group.set(a, b); }
    const members = new Map();
    for (const r of current.keys()) (members.get(root(r)) || members.set(root(r), []).get(root(r))).push(r);
    for (const list of members.values()) {
      const held = list.map(r => twin.get(r)).find(t => t !== undefined && anchors.has(t));
      const mean = new Array(channels.length).fill(0);
      for (const r of list) current.get(r).forEach((x, i) => { mean[i] += x / list.length; });
      const w = finish(channels.map((bone, i) => [bone, held !== undefined ? fixedWeights(held)[i] : mean[i]]));
      for (const r of list) cache.set(r, w);
    }
    const twins = twin.size;
    report.membrane[side] = { clusters: clusters.size, edge: onEdge, seams: [...anchors.keys()].filter(r => partsAt.get(r).size > 1).length, bones: channels.length, twins };
  }

  // --- the skin attributes -----------------------------------------------------------------------------
  for (const part of parts) {
    const count = part.verts;
    const si = new Uint16Array(count * 4);
    const sw = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const w = cache.get(rep[part.offset + i]);
      w.forEach(([bone, value], k) => { si[i * 4 + k] = index[bone]; sw[i * 4 + k] = value; });
    }
    part.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    part.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  }
  const geometry = mergeGeometries(parts.map(p => p.geometry), false);
  if (!geometry) throw new Error('mergeGeometries failed');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial({ side: closed ? THREE.FrontSide : THREE.DoubleSide }));
  mesh.name = `${name} body`;
  const group = new THREE.Group();
  group.name = name;
  group.add(bones.root);
  group.add(mesh);
  group.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(names.map(n => bones[n])));

  const kind = new Map(parts.map(p => [p, kindOf(p) === 'head' ? (p === beak ? 'beak' : 'head') : ['leg', 'arm', 'wing'].includes(kindOf(p)) ? `${kindOf(p)} ${sideOf(p)}` : kindOf(p)]));
  report.parts = Object.fromEntries(parts.map(p => [p.name, kind.get(p)]));
  report.joints = Object.fromEntries(Object.entries(J).map(([n, v]) => [n, r3(v)]));
  report.claws = Object.fromEntries(SIDES.map(side => [side, armInfo[side].claws]));
  report.triangles = geometry.index.count / 3;
  return {
    group, mesh, bones, names, joints: J, H, span, closed, report,
    // Each part's vertices in the one skin: [start, start + count).
    parts: parts.map(p => ({ name: p.name, kind: kind.get(p), start: p.offset, count: p.verts })),
    chains: { spine: ['Hips', 'Spine', 'Chest'], neck: [...neckNames, 'Head'], tail: tailNames },
    legs: SIDES.map(side => ({ side, thigh: `${side}Thigh`, shin: `${side}Shin`, foot: `${side}Foot`, hip: legInfo[side].hip.clone(), knee: legInfo[side].knee.clone(), heel: legInfo[side].heel.clone(), toe: legInfo[side].toe.clone() })),
    wings: SIDES.map(side => ({ side, ...Object.fromEntries(['shoulder', 'elbow', 'wrist', 'knuckle', 'f2', 'f3', 'tip', 'clawTip'].map(k => [k, armInfo[side][k].clone()])) })),
  };
}
