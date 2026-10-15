import * as THREE from 'three';
import { mergeGeometries } from '../../../dist/vendor/BufferGeometryUtils.js';

// Rigs a four-legged character from an unrigged Tripo export kept in parts (remake/tools/
// blender-decimate.py ... parts). bake-quadruped.js runs it in the browser; tests and probes run it
// in Node (geometry only, no textures).
//
// It turns the model to face +X, scales it to its length from nose to tail tip, stands it on the
// ground with the root midway between its feet, and tells the parts apart by position: the four
// parts that stand on the ground are the legs (front pair ahead, left side at -Z), the biggest of
// the rest is the body, the biggest part ahead of the fore legs is the head, and every other part
// (plates, spikes, horns) rides rigidly on the bone it sits on. Then it places a skeleton with
// identity rest rotations, welds the parts into one skin and gives every vertex skin weights.
//
// Bones: root; the spine chain Hips (over the hind legs), Spine, Chest (over the fore legs), Neck,
// Neck2, Head; the tail chain Tail1..TailN from the hips; and, hanging from the root, one rigid bone
// per leg with the foot below it: FrontLeg.L/R, FrontFoot.L/R, BackLeg.L/R, BackFoot.L/R, the names
// the remake's footing plants (engine/actor.js, engine/footing.js). A leg swings from a pivot on its
// axis at half the height, as footing turns it, and the skin blends from the leg into the body
// between the top of the leg part and that pivot, so the hip or shoulder bends instead of shearing.
//
// The welded skin: Tripo cuts a model into parts along seams whose two sides match, and
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
 * widths along the surface, the body around a leg follows it).
 */
export function rigQuadruped(sources, { length = 7, yaw = 90, tail = 6, neck = 2, spine = 1, name = 'Quadruped', spread = 0.6 } = {}) {
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
  const head = others.filter(p => p !== body && p.c.x > foreX).reduce((a, b) => (!a || b.verts > a.verts ? b : a), null);
  if (!head) throw new Error('no head part ahead of the fore legs');
  const attached = others.filter(p => p !== body && p !== head);
  const trunk = [body, head];

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
  // The head joint: under the top of the skull, where the head part is highest.
  let headX = head.c.x, headTop = -Infinity;
  for (let x = head.box.min.x; x <= head.box.max.x; x += 0.01 * L) {
    const top = Math.max(-Infinity, ...head.points.filter(p => Math.abs(p.x - x) < 0.01 * L).map(p => p.y));
    if (top > headTop) { headTop = top; headX = x; }
  }
  const tailStart = Math.min(...legs.filter(l => !l.front).map(l => l.part.box.min.x)) - 0.02 * L;
  const tailEnd = body.box.min.x + 0.1 * (tailStart - body.box.min.x);
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
  // Seam vertices snap onto their cluster's first vertex (after blender-decimate.py they lie on top of
  // each other). Normals and UVs stay as the parts carry them: the parts have their own texture
  // islands, and the decimation gave the seams the normals of the whole mesh.
  const WELD = 0.001; // metres
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
  report.skin = { vertices: offset, welded: new Set(rep).size, triangles: [...edges.values()].reduce((s, e) => s + e.n, 0) / 3, slivers, openEdges: open, misWound, nonManifold, closed };

  // --- skin weights -----------------------------------------------------------------------------------
  // Along the centre line each chain bone owns the stretch from its joint to the next one (a tail
  // bone the stretch behind its joint), blended over a band around each joint, so a bone that turns
  // bends the skin about its own joint. From the tail tip to the head, owners[k] holds the stretch
  // (cuts[k-1], cuts[k]): every joint but the hips' is a cut, so the hips hold the stretch from the
  // tail's root to the spine.
  const owners = [...tailNames].reverse().concat(chain.filter(([n]) => !n.startsWith('Tail')).map(([n]) => n));
  const cuts = owners.filter(n => n !== 'Hips').map(n => joints[n].x);
  if (cuts.some((x, k) => k && x <= cuts[k - 1])) throw new Error(`the chain's joints are out of order along the body: ${owners.join(' ')}`);
  const halfBand = cuts.map((x, k) => {
    const left = k > 0 ? x - cuts[k - 1] : Infinity;
    const right = k < cuts.length - 1 ? cuts[k + 1] - x : Infinity;
    return 0.45 * Math.min(left, right);
  });
  function chainWeights(x, out) {
    let k = 0;
    while (k < cuts.length && x > cuts[k]) k++; // owners[k] holds x
    for (const j of [k - 1, k]) {
      if (j < 0 || j >= cuts.length || Math.abs(x - cuts[j]) >= halfBand[j]) continue;
      const s = smooth((x - (cuts[j] - halfBand[j])) / (2 * halfBand[j]));
      out.push([owners[j], 1 - s], [owners[j + 1], s]);
      return;
    }
    out.push([owners[k], 1]);
  }

  // Distances along the surface: from the seed clusters over the edges of the given parts, up to
  // `limit` (Dijkstra).
  function surfaceDistance(seeds, within, limit = Infinity) {
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
  const seamOf = part => [...partsAt].filter(([, set]) => set.size > 1 && set.has(part)).map(([r]) => r);

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
    const domain = new Set([...trunk, l.part]);
    const reachD = spread * Math.max(l.part.size.x, l.part.size.z);
    const near = surfaceDistance(seamOf(l.part), new Set(trunk), reachD);
    const ids = new Map();
    const links = [];
    for (const edge of edges.values()) {
      if (!domain.has(edge.part)) continue;
      for (const r of [edge.a, edge.b]) if (!ids.has(r)) { ids.set(r, ids.size); links.push([]); }
      const k = 1 / Math.max(1e-6, at(edge.a).distanceTo(at(edge.b)));
      links[ids.get(edge.a)].push(ids.get(edge.b), k);
      links[ids.get(edge.b)].push(ids.get(edge.a), k);
    }
    const value = new Float64Array(ids.size);
    const free = new Uint8Array(ids.size);
    for (const [r, i] of ids) {
      const p = at(r);
      if (partsAt.get(r).has(l.part)) value[i] = up(p, l);
      else if (up(p, l) > 0 && near.has(r)) { free[i] = 1; value[i] = up(p, l) * (1 - near.get(r) / reachD); }
    }
    // Gauss-Seidel with over-relaxation, edges weighted by 1 / length.
    for (let pass = 0; pass < 4000; pass++) {
      let change = 0;
      for (let i = 0; i < value.length; i++) {
        if (!free[i]) continue;
        let sum = 0, weight = 0;
        const list = links[i];
        for (let j = 0; j < list.length; j += 2) { sum += value[list[j]] * list[j + 1]; weight += list[j + 1]; }
        const next = value[i] + 1.8 * (sum / weight - value[i]);
        change = Math.max(change, Math.abs(next - value[i]));
        value[i] = next;
      }
      if (change < 1e-6) break;
    }
    l.share = new Map([...ids].map(([r, i]) => [r, clamp(value[i], 0, 1)]));
  }
  const ankleTop = 0.16 * H, ankleLow = 0.04 * H;
  function trunkWeights(p, r, own, out) {
    const shares = (own ? [[own, up(p, own)]] : legs.map(l => [l, l.share.get(r) ?? 0]))
      .filter(([, s]) => s > 0);
    const sum = shares.reduce((s, [, v]) => s + v, 0);
    const k = sum > 1 ? 1 / sum : 1;
    chainWeights(p.x, out);
    for (const entry of out) entry[1] *= 1 - sum * k;
    for (const [l, s] of shares) {
      const share = s * k;
      const f = own ? share * smooth(clamp((ankleTop - p.y) / (ankleTop - ankleLow), 0, 1)) : 0;
      if (share - f > 0) out.push([l.name, share - f]);
      if (f > 0) out.push([l.footName, f]);
    }
  }

  // Attached parts ride rigidly on the bone that holds most of their base, from a band above the
  // seam where they sit (along their own surface); nearer the seam they blend in from the trunk's
  // weights, which the seam itself keeps.
  const ride = new Map();
  for (const part of attached) {
    const seam = seamOf(part);
    const base = seam.length ? seam.reduce((s, r) => s.add(at(r)), V()).divideScalar(seam.length) : part.c.clone();
    const touchesHeadOnly = seam.length && seam.every(r => [...partsAt.get(r)].every(q => q === part || q === head || attached.includes(q)))
      && seam.some(r => partsAt.get(r).has(head));
    const w = [];
    chainWeights(base.x, w);
    const bone = touchesHeadOnly ? 'Head' : w.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
    const band = Math.max(0.02 * H, 0.2 * Math.max(part.size.x, part.size.y, part.size.z));
    ride.set(part, { bone, distance: surfaceDistance(seam, new Set([part]), band), band, base });
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
        trunkWeights(p, r, own, w);
        const rider = ride.get(owner[r]);
        if (rider) {
          const h = smooth(clamp((rider.distance.get(r) ?? rider.band) / rider.band, 0, 1));
          for (const entry of w) entry[1] *= 1 - h;
          w.push([rider.bone, h]);
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

  const kind = new Map([[body, 'body'], [head, 'head'], ...legs.map(l => [l.part, l.name]), ...attached.map(p => [p, `rides ${ride.get(p).bone}`])]);
  report.parts = Object.fromEntries(parts.map(p => [p.name, kind.get(p)]));
  report.joints = Object.fromEntries(Object.entries(joints).map(([n, v]) => [n, r3(v)]));
  report.legs = Object.fromEntries(legs.map(l => [l.name, { junction: +l.junction.toFixed(3), pivot: r3(l.pivot), foot: r3(l.foot) }]));
  report.triangles = geometry.index.count / 3;
  return {
    group, mesh, bones, names, joints, H, L, closed, report,
    chains: { spine: ['Hips', ...spineNames, 'Chest'], neck: [...neckNames, 'Head'], tail: tailNames },
    legs: legs.map(l => ({ name: l.name, foot: l.footName, front: l.front, side: l.side, pivot: l.pivot.clone(), rest: l.foot.clone() })),
  };
}
