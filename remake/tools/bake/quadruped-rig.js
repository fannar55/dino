import * as THREE from 'three';
import { mergeGeometries } from '../../../dist/vendor/BufferGeometryUtils.js';
import { touchingParts, weldSkin, surfaceDistance, harmonicField, chainWeighting } from './skin.js';

// Rigs a four-legged character from an unrigged Tripo export kept in parts (remake/tools/
// blender-decimate.py ... parts). bake-quadruped.js runs it in the browser; tests and probes run it
// in Node (geometry only, no textures).
//
// It turns the model to face +X, scales it to its length from nose to tail tip, stands it on the
// ground with the root midway between its feet, and tells the parts apart by position and seams:
// the four parts that stand on the ground are the legs (front pair ahead, left side at -Z), the
// biggest of the rest is the body, the part that holds the nose is the head, and the parts along the
// seams from the head back to the body (a long neck, the front of a body cut in two) make up the
// trunk with them. Every other part (plates, spikes, horns, toenails) rides rigidly on the bone it
// sits on: a toenail on its foot. Then it places a skeleton with identity rest rotations, welds the
// parts into one skin and gives every vertex skin weights.
//
// Bones: root; the spine chain Hips (over the hind legs), Spine, Chest (over the fore legs), Neck,
// Neck2..NeckN, Head; the tail chain Tail1..TailN from the hips; and, hanging from the root, one rigid
// bone per leg with the foot below it: FrontLeg.L/R, FrontFoot.L/R, BackLeg.L/R, BackFoot.L/R, the
// names the remake's footing plants (engine/actor.js, engine/footing.js). A leg swings from a pivot on
// its axis at half the height, as footing turns it, and the skin blends from the leg into the body
// between the top of the leg part and that pivot, so the hip or shoulder bends instead of shearing.
// A raised neck (a sauropod's, `curve`) has its joints spaced along its centre line instead of along
// the body, and the skin follows the chain by where it lies along the line through the joints, so a
// cross-section of the neck moves as one.
//
// The welded skin (skin.js): Tripo cuts a model into parts along seams whose two sides match, and
// blender-decimate.py decimates the parts as one mesh, so they still match vertex for vertex and,
// welded, make one closed surface.
// Every seam cluster gets one set of weights, so the seams stay closed when skinned, and a closed,
// consistently wound skin can render single-sided (`closed` in the result).

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const smooth = u => u * u * (3 - 2 * u);
const r3 = v => v.toArray().map(n => +n.toFixed(3));

export const LEGS = ['BackLeg.L', 'BackLeg.R', 'FrontLeg.L', 'FrontLeg.R'];
const footName = leg => leg.replace('Leg', 'Foot');

function pointsOf(geometry) {
  const p = geometry.attributes.position;
  const out = new Array(p.count);
  for (let i = 0; i < p.count; i++) out[i] = V().fromBufferAttribute(p, i);
  return out;
}

// Centre of the cross-section of `points` within `half` of `x`: midway between its lowest and
// highest point (a centroid would lean toward wherever the mesh is densest).
function section(points, x, half) {
  let near = points.filter(p => Math.abs(p.x - x) < half);
  if (near.length < 8) near = [...points].sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x)).slice(0, 24);
  const ys = near.map(p => p.y);
  return V(x, (Math.min(...ys) + Math.max(...ys)) / 2, 0);
}

/**
 * sources: [{ name, geometry }] in the model's own frame (each part's world matrix applied).
 * Options: length (metres, nose to tail tip), yaw (degrees that turn the model's front to +X:
 * Tripo faces +Z, so 90), tail/neck/spine (bones in each chain), name, spread (how far, in leg
 * widths along the surface, the body around a leg follows it), plateRows (rows of back plates the
 * plateRow mask counts), curve (a raised neck: joints and weights along the chain's centre line),
 * crest (a crest rides on top of the head: the head's joint goes to the back of the skull).
 */
export function rigQuadruped(sources, { length = 7, yaw = 90, tail = 6, neck = 2, spine = 1, name = 'Quadruped', spread = 0.6, plateRows = 3, curve = false, crest = false } = {}) {
  const report = {};

  // --- stand it up: front to +X, `length` long, on the ground ---------------------------------
  const turn = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(yaw));
  const geometries = sources.map(({ geometry }) => {
    const g = geometry.clone().applyMatrix4(turn);
    for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(key)) g.deleteAttribute(key);
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    return g;
  });
  const box = new THREE.Box3();
  geometries.forEach(g => { g.computeBoundingBox(); box.union(g.boundingBox); });
  const scale = length / (box.max.x - box.min.x);
  const centre = box.getCenter(V());
  const fit = new THREE.Matrix4().makeScale(scale, scale, scale).multiply(new THREE.Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z));
  geometries.forEach(g => g.applyMatrix4(fit));
  const H = (box.max.y - box.min.y) * scale;
  const L = length;

  const describe = (part, g) => {
    g.computeBoundingBox();
    part.box = g.boundingBox.clone();
    part.c = part.box.getCenter(V());
    part.size = part.box.getSize(V());
    part.points = pointsOf(g);
  };
  const parts = sources.map(({ name: partName }, i) => {
    const part = { name: partName, geometry: geometries[i], verts: geometries[i].attributes.position.count };
    describe(part, geometries[i]);
    return part;
  });

  // --- which part is which ----------------------------------------------------------------------
  const legParts = parts.filter(p => p.box.min.y < 0.05 * H && p.size.y > 0.25 * H);
  if (legParts.length !== 4) throw new Error(`expected 4 leg parts standing on the ground, found ${legParts.length}`);
  const others = parts.filter(p => !legParts.includes(p));
  const volume = p => p.size.x * p.size.y * p.size.z;
  const body = others.reduce((a, b) => (volume(b) > volume(a) ? b : a));
  const byX = [...legParts].sort((a, b) => b.c.x - a.c.x);
  const fore = byX.slice(0, 2);
  const foreX = (fore[0].c.x + fore[1].c.x) / 2;
  // The head holds the nose; failing that (the body holds it), the biggest part ahead of the fore legs.
  const nose = others.reduce((a, b) => (b.box.max.x > a.box.max.x ? b : a));
  const head = nose !== body ? nose : others.filter(p => p !== body && p.c.x > foreX).reduce((a, b) => (!a || b.verts > a.verts ? b : a), null);
  if (!head || head.c.x <= foreX) throw new Error('no head part ahead of the fore legs');
  // Parts that meet along a seam share vertex positions (blender-decimate.py welds them). The trunk is
  // the body, the head and the parts on the way between them, seam to seam, and on the same way back
  // to the tail's tip when another part holds it (a body cut in two across the hips, Slóeðla's).
  const touching = touchingParts(parts);
  const wayTo = (from, to) => {
    const way = new Map([[from, null]]);
    for (const queue = [from]; queue.length && !way.has(to);) {
      const p = queue.shift();
      for (const next of touching.get(p)) if (!legParts.includes(next) && !way.has(next)) { way.set(next, p); queue.push(next); }
    }
    if (!way.has(to)) return null;
    const path = [];
    for (let p = to; p; p = way.get(p)) path.push(p);
    return path;
  };
  const trunk = wayTo(head, body);
  if (!trunk) throw new Error('the head does not meet the body along seams');
  // The part that holds the tail's tip: the one furthest back on the centre line (a tail spike stands
  // out to one side).
  const tipHolder = others.filter(p => Math.abs(p.c.z) < 0.25 * p.size.z).reduce((a, b) => (b.box.min.x < a.box.min.x ? b : a), body);
  if (!trunk.includes(tipHolder)) {
    const way = wayTo(body, tipHolder);
    if (!way) throw new Error('the tail does not meet the body along seams');
    trunk.push(...way.filter(p => !trunk.includes(p)));
  }
  const attached = others.filter(p => !trunk.includes(p));

  // The soles: where each leg part touches the ground. The root goes midway between them.
  const soleOf = leg => {
    let sole = leg.points.filter(p => p.y < 0.01 * H);
    if (sole.length < 8) sole = [...leg.points].sort((a, b) => a.y - b.y).slice(0, 24);
    const b = new THREE.Box3().setFromPoints(sole);
    return b.getCenter(V()).setY(0);
  };
  const soles = new Map(legParts.map(leg => [leg, soleOf(leg)]));
  const middle = [...soles.values()].reduce((s, p) => s.add(p), V()).divideScalar(4);
  const shift = new THREE.Matrix4().makeTranslation(-middle.x, 0, -middle.z);
  parts.forEach(p => { p.geometry.applyMatrix4(shift); describe(p, p.geometry); });
  soles.forEach(s => s.sub(middle).setY(0));
  report.fit = { scale: +scale.toFixed(4), length: L, height: +H.toFixed(3), parts: parts.length };

  // --- legs: a rigid bone from the top of the leg part, the foot at the ankle above the sole -----
  const trunkPoints = trunk.flatMap(p => p.points);
  const legs = legParts.map(leg => {
    const front = fore.includes(leg);
    const side = leg.c.z < 0 ? 'L' : 'R'; // facing +X, the left side is -Z
    const legName = `${front ? 'Front' : 'Back'}Leg.${side}`;
    // Where the leg part meets the body: the lowest trunk vertex above the leg.
    let junction = Infinity;
    for (const p of trunkPoints) {
      if (Math.abs(p.x - leg.c.x) < 0.35 * leg.size.x && Math.abs(p.z - leg.c.z) < 0.35 * leg.size.z) junction = Math.min(junction, p.y);
    }
    if (!Number.isFinite(junction)) junction = leg.box.max.y - 0.3 * leg.size.y;
    junction = Math.min(junction, leg.box.max.y - 0.1 * leg.size.y);
    const topY = junction + 0.08 * leg.size.y;
    const ring = leg.points.filter(p => Math.abs(p.y - topY) < 0.03 * H);
    const top = ring.reduce((s, p) => s.add(p), V()).divideScalar(Math.max(1, ring.length)).setY(topY);
    const foot = soles.get(leg).clone().setY(0.04 * H);
    // The swing pivot: on the leg's axis (foot to top) at half the height, or just above the top.
    const pivotY = Math.max(0.5 * H, junction + 0.1 * H);
    const axis = top.clone().sub(foot);
    const pivot = foot.clone().addScaledVector(axis, (pivotY - foot.y) / axis.y);
    return { part: leg, name: legName, footName: footName(legName), front, side, junction, top, foot, pivot };
  });
  // The two legs of a pair mirror each other across the centre line (the parts are near enough
  // symmetric; their meshes are not, which would make one leg step differently from the other).
  for (const front of [true, false]) {
    const pair = legs.filter(l => l.front === front);
    for (const key of ['top', 'foot', 'pivot']) {
      const mean = V().addVectors(pair[0][key], pair[1][key]).multiplyScalar(0.5);
      const half = (Math.abs(pair[0][key].z) + Math.abs(pair[1][key].z)) / 2;
      for (const l of pair) l[key].set(mean.x, mean.y, l.side === 'L' ? -half : half);
    }
    const junction = (pair[0].junction + pair[1].junction) / 2;
    for (const l of pair) l.junction = junction;
  }

  // --- the chains: joints on the centre line of the trunk -----------------------------------------
  const sectionAt = x => section(trunkPoints, x, 0.02 * L).setZ(0);
  const meanX = list => list.reduce((s, l) => s + l.top.x, 0) / list.length;
  const hipsX = meanX(legs.filter(l => !l.front));
  const chestX = meanX(legs.filter(l => l.front));
  // The head joint: under the top of the skull, where the head part is highest. With `crest` (a crest
  // rides on top of the head, Slóeðla's) it goes to the back of the skull instead, under the back end
  // of the crest's base, so all of the crest's base is in front of it and the skull turns on the neck.
  let headX = head.c.x, headTop = -Infinity;
  for (let x = head.box.min.x; x <= head.box.max.x; x += 0.01 * L) {
    const top = Math.max(-Infinity, ...head.points.filter(p => Math.abs(p.x - x) < 0.01 * L).map(p => p.y));
    if (top > headTop) { headTop = top; headX = x; }
  }
  if (crest) {
    const key = q => `${Math.round(q.x / 0.001)},${Math.round(q.y / 0.001)},${Math.round(q.z / 0.001)}`;
    const onHead = new Set(head.points.map(key));
    const base = attached.filter(p => touching.get(head).has(p) && p.c.y > head.box.max.y).flatMap(p => p.points.filter(q => onHead.has(key(q))));
    if (!base.length) throw new Error('no crest on top of the head');
    headX = Math.min(...base.map(q => q.x));
  }
  const tailStart = Math.min(...legs.filter(l => !l.front).map(l => l.part.box.min.x)) - 0.02 * L;
  const tailTip = Math.min(...trunk.map(p => p.box.min.x));
  const tailEnd = tailTip + 0.1 * (tailStart - tailTip);
  const joints = { root: V() };
  const chain = []; // [name, parent, x], every joint on the centre line
  chain.push(['Hips', 'root', hipsX]);
  const spineNames = Array.from({ length: spine }, (_, i) => (i ? `Spine${i + 1}` : 'Spine'));
  spineNames.forEach((n, i) => chain.push([n, i ? spineNames[i - 1] : 'Hips', hipsX + ((i + 1) / (spine + 1)) * (chestX - hipsX)]));
  chain.push(['Chest', spineNames.at(-1) ?? 'Hips', chestX]);
  const neckNames = Array.from({ length: neck }, (_, i) => (i ? `Neck${i + 1}` : 'Neck'));
  neckNames.forEach((n, i) => chain.push([n, i ? neckNames[i - 1] : 'Chest', chestX + ((i + 1) / (neck + 1)) * (headX - chestX)]));
  chain.push(['Head', neckNames.at(-1) ?? 'Chest', headX]);
  const tailNames = Array.from({ length: tail }, (_, i) => `Tail${i + 1}`);
  tailNames.forEach((n, i) => chain.push([n, i ? tailNames[i - 1] : 'Hips', tailStart + (i / (tail - 1)) * (tailEnd - tailStart)]));
  for (const [n, , x] of chain) joints[n] = sectionAt(x);
  // Under the crest the head's joint is midway up the head part's own section: the trunk's would take
  // in the chest below the neck, which leans forward there.
  if (crest) joints.Head = section(head.points, headX, 0.02 * L).setZ(0);
  // The tail's joints follow a smooth line (a least-squares parabola through their sections): the
  // plates' bases ridge the back, which would put them on a zigzag.
  {
    const pts = tailNames.map(n => joints[n]);
    const m = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const sums = [0, 0, 0, 0, 0]; // sums of u^0 .. u^4, with u = x - m
    const rhs = [0, 0, 0]; // sums of y, u y, u^2 y
    for (const p of pts) {
      const u = p.x - m;
      for (let k = 0; k < 5; k++) sums[k] += u ** k;
      for (let k = 0; k < 3; k++) rhs[k] += u ** k * p.y;
    }
    // Normal equations for y = a + b u + c u^2, solved by Cramer's rule.
    const A = [[sums[0], sums[1], sums[2]], [sums[1], sums[2], sums[3]], [sums[2], sums[3], sums[4]]];
    const det = M => M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
    const column = k => A.map((row, i) => row.map((v, j) => (j === k ? rhs[i] : v)));
    const [a, b, c] = [0, 1, 2].map(k => det(column(k)) / det(A));
    for (const p of pts) { const u = p.x - m; p.y = a + b * u + c * u * u; }
  }
  // A raised neck: its joints evenly spaced along its centre line (the sections' centres every 1 % of
  // the length from the chest to the head), not along the body.
  if (curve) {
    const line = [];
    for (let x = chestX; x < headX; x += 0.01 * L) line.push(sectionAt(x));
    line.push(joints.Head.clone());
    const run = [0];
    for (let i = 1; i < line.length; i++) run.push(run[i - 1] + line[i].distanceTo(line[i - 1]));
    neckNames.forEach((n, i) => {
      const s = ((i + 1) / (neck + 1)) * run.at(-1);
      let k = 1;
      while (k < line.length - 1 && run[k] < s) k++;
      joints[n] = line[k - 1].clone().lerp(line[k], (s - run[k - 1]) / Math.max(1e-9, run[k] - run[k - 1]));
    });
  }
  for (const l of legs) { joints[l.name] = l.top.clone(); joints[l.footName] = l.foot.clone(); }

  // --- bones: identity rest rotations, positions relative to the parent joint ---------------------
  const parent = Object.fromEntries(chain.map(([n, p]) => [n, p]));
  for (const l of legs) { parent[l.name] = 'root'; parent[l.footName] = l.name; }
  const names = ['root', 'Hips', ...spineNames, 'Chest', ...neckNames, 'Head', ...tailNames,
    ...LEGS.flatMap(n => [n, footName(n)])];
  const bones = {};
  for (const n of names) {
    const b = new THREE.Bone();
    b.name = n;
    b.position.copy(joints[n]).sub(parent[n] ? joints[parent[n]] : V());
    bones[n] = b;
    if (parent[n]) bones[parent[n]].add(b);
  }
  const index = Object.fromEntries(names.map((n, i) => [n, i]));

  // --- one closed skin ------------------------------------------------------------------------------
  // The parts welded at their seams (skin.js). Normals and UVs stay as the parts carry them: the parts
  // have their own texture islands, and the decimation gave the seams the normals of the whole mesh.
  const skin = weldSkin(parts);
  const { rep, owner, at, partsAt, seamOf, closed } = skin;
  report.skin = skin.report;

  // --- skin weights -----------------------------------------------------------------------------------
  // Along the centre line each chain bone owns the stretch from its joint to the next one (a tail
  // bone the stretch behind its joint), blended over a band around each joint (skin.js,
  // chainWeighting): every joint but the hips' is a cut, so the hips hold the stretch from the tail's
  // root to the spine. With a raised neck (`curve`) a point's place along the chain is its place along
  // the line through the joints, so a cross-section of the neck is one place, and the head stays rigid
  // in front of its joint.
  const owners = [...tailNames].reverse().concat(chain.filter(([n]) => !n.startsWith('Tail')).map(([n]) => n));
  // Under a crest the head is long and the neck steep: the line runs on through the head to the nose.
  const noseTip = crest ? head.points.reduce((a, q) => (q.x > a.x ? q : a)).clone().setZ(0) : null;
  const { along, weights: chainWeights } = chainWeighting(owners, joints, { curve, length: L, tip: noseTip });

  // A leg takes its whole part up to where it meets the body, and above that, fading out toward
  // the pivot, the lower part of the thigh or shoulder bulge, so a long swing bends the hip instead
  // of shearing the leg out of the body. The trunk around it follows smoothly: the leg's share
  // spreads over the trunk as heat would (a harmonic field, fixed to the leg part's own share on
  // the leg part, and to nothing above the pivot and further than `spread` leg widths along the
  // surface from the seam). So the seam stays closed, and skin squeezed between a fore and a hind
  // leg (a deep belly) is shared out evenly instead of folding where a fade ends. The foot bone takes
  // the foot and blends into the leg up the lower shin.
  const up = (p, l) => smooth(clamp((l.pivot.y - p.y) / (l.pivot.y - l.junction), 0, 1));
  for (const l of legs) {
    const reachD = spread * Math.max(l.part.size.x, l.part.size.z);
    const near = surfaceDistance(skin, seamOf(l.part), new Set(trunk), reachD);
    const field = harmonicField(skin, new Set([...trunk, l.part]), r => {
      const p = at(r);
      if (partsAt.get(r).has(l.part)) return { value: up(p, l), free: false };
      if (up(p, l) > 0 && near.has(r)) return { value: up(p, l) * (1 - near.get(r) / reachD), free: true };
      return null;
    });
    l.share = new Map([...field].map(([r, v]) => [r, clamp(v, 0, 1)]));
  }
  const ankleTop = 0.16 * H, ankleLow = 0.04 * H;
  function trunkWeights(p, r, own, out) {
    const shares = (own ? [[own, up(p, own)]] : legs.map(l => [l, l.share.get(r) ?? 0]))
      .filter(([, s]) => s > 0);
    const sum = shares.reduce((s, [, v]) => s + v, 0);
    const k = sum > 1 ? 1 / sum : 1;
    chainWeights(along(p), out);
    for (const entry of out) entry[1] *= 1 - sum * k;
    for (const [l, s] of shares) {
      const share = s * k;
      const f = own ? share * smooth(clamp((ankleTop - p.y) / (ankleTop - ankleLow), 0, 1)) : 0;
      if (share - f > 0) out.push([l.name, share - f]);
      if (f > 0) out.push([l.footName, f]);
    }
  }

  // Attached parts ride rigidly on the bone that holds most of their base, seam and all, so a plate
  // never bends; a part that sits on a leg alone (a toenail) rides that leg's foot, or the leg above
  // the ankle. The skin around the base follows that bone too and blends out to its own weights over
  // a band along the surface of the part it sits on (a fifth of its size): a bend in the body next to
  // a plate (the neck bowing to eat) stretches the skin around it instead of folding the plate's foot.
  const ride = new Map();
  for (const part of attached) {
    const seam = seamOf(part);
    const base = seam.length ? seam.reduce((s, r) => s.add(at(r)), V()).divideScalar(seam.length) : part.c.clone();
    const sitsOnly = on => seam.length && seam.every(r => [...partsAt.get(r)].every(q => q === part || q === on || attached.includes(q)))
      && seam.some(r => partsAt.get(r).has(on));
    const leg = legs.find(l => sitsOnly(l.part));
    const w = [];
    chainWeights(along(base), w);
    const bone = sitsOnly(head) ? 'Head' : leg ? (base.y < ankleTop ? leg.footName : leg.name) : w.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    const band = Math.max(0.02 * H, 0.2 * Math.max(part.size.x, part.size.y, part.size.z));
    const under = new Set([...trunk, ...legParts].filter(t => seam.some(r => partsAt.get(r).has(t)))); // the part it sits on
    ride.set(part, { bone, distance: surfaceDistance(skin, seam, under, band), band, base });
  }

  // The plates: attached parts that sit on top of the back, neck or tail (their seam above 85 % of
  // the trunk's height there, measured to the top right around it; a stegosaurus' tail spikes sit on
  // the tail's sides, horns on the head). They are counted in rows from the head back, plates side by
  // side always in one row, each row holding about the same plate area: the plateRow mask (0 off the
  // plates) lets the runtime light them row by row.
  const area = part => {
    const pos = part.geometry.attributes.position, ix = part.geometry.index.array;
    const a = V(), b = V(), c = V();
    let sum = 0;
    for (let t = 0; t < ix.length; t += 3) {
      a.fromBufferAttribute(pos, ix[t]); b.fromBufferAttribute(pos, ix[t + 1]); c.fromBufferAttribute(pos, ix[t + 2]);
      sum += b.sub(a).cross(c.sub(a)).length() / 2;
    }
    return sum;
  };
  const plates = attached.filter(part => {
    const { base, bone } = ride.get(part);
    if (bone === 'Head') return false;
    const section = trunkPoints.filter(p => Math.abs(p.x - base.x) < 0.01 * L);
    const around = section.filter(p => Math.abs(p.z - base.z) < 0.05 * L);
    if (!around.length) return false;
    const bottom = Math.min(...section.map(p => p.y)), top = Math.max(...around.map(p => p.y));
    return (base.y - bottom) / (top - bottom) > 0.85;
  }).map(part => ({ part, x: ride.get(part).base.x, area: area(part) })).sort((a, b) => b.x - a.x);
  const stations = [];
  for (const plate of plates) {
    const last = stations.at(-1);
    if (last && last[0].x - plate.x < 0.02 * L) last.push(plate);
    else stations.push([plate]);
  }
  const plateArea = plates.reduce((sum, p) => sum + p.area, 0);
  const plateRow = new Map();
  let before = 0;
  for (const station of stations) {
    const here = station.reduce((sum, p) => sum + p.area, 0);
    const row = Math.min(plateRows, 1 + Math.floor((plateRows * (before + here / 2)) / plateArea));
    for (const p of station) plateRow.set(p.part, row);
    before += here;
  }

  const cache = new Map(); // weld cluster -> weights, so both sides of a seam get the same ones
  const w = [];
  for (const part of parts) {
    const count = part.verts;
    const si = new Uint16Array(count * 4);
    const sw = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const r = rep[part.offset + i];
      if (!cache.has(r)) {
        const p = at(r);
        const own = legs.find(l => l.part === owner[r]);
        w.length = 0;
        const rider = ride.get(owner[r]);
        if (rider) w.push([rider.bone, 1]);
        else {
          trunkWeights(p, r, own, w);
          let near = null; // the attached part whose base this is nearest to, in bands
          for (const rd of ride.values()) {
            const d = rd.distance.get(r);
            if (d !== undefined && (!near || d / rd.band < near.k)) near = { rd, k: d / rd.band };
          }
          if (near) {
            const h = smooth(clamp(near.k, 0, 1));
            for (const entry of w) entry[1] *= h;
            w.push([near.rd.bone, 1 - h]);
          }
        }
        const merged = new Map();
        for (const [bone, value] of w) merged.set(bone, (merged.get(bone) || 0) + value);
        const kept = [...merged].filter(e => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
        const total = kept.reduce((s, e) => s + e[1], 0);
        cache.set(r, kept.map(([bone, value]) => [index[bone], value / total]));
      }
      cache.get(r).forEach(([bone, value], k) => { si[i * 4 + k] = bone; sw[i * 4 + k] = value; });
    }
    part.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    part.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    if (plates.length) part.geometry.setAttribute('plateRow', new THREE.Float32BufferAttribute(new Float32Array(count).fill(plateRow.get(part) ?? 0), 1));
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

  const kind = new Map([...trunk.map(p => [p, 'trunk']), [body, 'body'], [head, 'head'], ...legs.map(l => [l.part, l.name]), ...attached.map(p => [p, `rides ${ride.get(p).bone}`])]);
  report.parts = Object.fromEntries(parts.map(p => [p.name, kind.get(p)]));
  report.joints = Object.fromEntries(Object.entries(joints).map(([n, v]) => [n, r3(v)]));
  report.legs = Object.fromEntries(legs.map(l => [l.name, { junction: +l.junction.toFixed(3), pivot: r3(l.pivot), foot: r3(l.foot) }]));
  report.plateRows = Array.from({ length: plateRows }, (_, i) => [...plateRow].filter(([, row]) => row === i + 1).map(([part]) => part.name));
  report.triangles = geometry.index.count / 3;
  return {
    group, mesh, bones, names, joints, H, L, closed, report,
    // Each part's vertices in the one skin: [start, start + count).
    parts: parts.map(p => ({ name: p.name, kind: kind.get(p), start: p.offset, count: p.verts })),
    chains: { spine: ['Hips', ...spineNames, 'Chest'], neck: [...neckNames, 'Head'], tail: tailNames },
    legs: legs.map(l => ({ name: l.name, foot: l.footName, front: l.front, side: l.side, pivot: l.pivot.clone(), rest: l.foot.clone() })),
  };
}
