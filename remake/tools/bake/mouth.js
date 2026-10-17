import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { GLTFExporter } from '../../vendor/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from '../../../dist/vendor/BufferGeometryUtils.js';
import { SKIN_ATTRIBUTES, carriedAttributes } from './attributes.js';

// The mouth pass: gives a baked character without a jaw (Mosi) a lower jaw that opens a little, the
// way bake-tailed-biped opens Grameðla's along the seam between her head and jaw parts. Mosi's beak is
// one Tripo part (upper and lower beak) and his lower jaw belongs to the head part, so there is no seam
// to open: this pass cuts one along his mouth line.
//
// The mouth line is given in the head's own frame, read off a side view (qa: a gridded orthographic
// render): f forward and u up in metres from the midpoint of the eyes, the frame turned with the head
// (forward from the eyes' normals, so it needs the face pass's eyes). Below the line, behind `front`
// (the hook of the upper beak) and in front of the line's first point, is the jaw:
//
//   1. Triangles that cross the line in front of `cut` are split along it, so the cut runs exactly on
//      the line; the jaw side of the cut gets vertices of its own, so the lips open there. Behind `cut`
//      the line stays closed and the cheek stretches, as Grameðla's does.
//   2. A Jaw bone (child of the Head, at `hinge`, turned like the head) takes the jaw: its share grows
//      from the hinge to the cut and a few rounds of smoothing over the surface take out the steps,
//      the cut's two sides kept apart.
//   3. A pocket fills the mouth (palate on the head, tongue on the jaw, a fold deep inside), painted
//      into a free corner of the colour map, as in bake-tailed-biped.
//   4. The GLB is exported again (GLTFExporter: textures 1024 JPEG), the node names as they were, with
//      `face.mouth` added to the mesh's extras: how far the jaw opens when the character talks. A clip
//      the bake authored to open the jaw (Slóeðla's eat and call) carries `jaw` in its extras, the
//      jaw's opening in degrees at each of the clip's keys: it gets the jaw's track here.
//
// The skin's other vertex attributes go through only when the query names them (attrs=_platerow, as
// three's loader names them: Kambeðla's plate rows, _PLATEROW in the GLB); the pass drops any it is not
// told about, as it always did, so a character whose bake wrote one it does not use (Slóeðla's back patch
// has a plate row) rebakes as before (attributes.js). A carried attribute keeps its name in the GLB: a
// vertex the cut makes on an edge takes the value of the edge's nearer end (a plate row is a whole
// number, never one in between), a lip's copy its own vertex's, and the pocket 0.
//
//   node remake/tools/bake/bake-character.mjs --page mouth --out remake/assets/characters/mosi.glb
//     --query "src=../../assets/characters/mosi.glb&out=mosi.glb&line=f,u;f,u;...&front=f&cut=f&hinge=f,u&talk=7"
//
// Query: src, out, line, left (a line of its own for the character's left side, +l, where the two sides
// of the mouth differ: `line` is then the right side's, and within 4 cm of the middle the one goes over
// into the other; the two sides of Kambeðla's smile differ by up to a centimetre), front,
// cut, hinge, talk (degrees the jaw opens at the loudest syllable), attrs (the skin's other attributes to
// carry, comma-separated, as above: Kambeðla _platerow),
// tex (texture size), smooth (rounds), snap (metres: vertices this close to the line count as on it, so
// a vertex a hair off the line does not leave a sliver that stretches across the open mouth; 0 keeps
// only those exactly on it), channel (1: for a long beak, the pocket's fold runs along the middle of the
// beak under the lips, a long channel, instead of reaching back into the head from the front of the
// mouth), corners (1: a triangle goes to the side its corners off the line are on, and only one with
// all three on the line by its middle; by its middle alone, a long thin triangle lying along the line
// can land on the wrong side and stretch across the open mouth, as on Uggeðla's long snout), fold
// (back,down: how far behind and below the lips the channel's fold lies, as shares of the mouth's
// length, 0.02,0.03; a rounded snout tip wants it higher, or it shows through the chin with the mouth
// shut: Uggeðla 0.04,0.01), rim (1: the pocket's edge follows the opening's rim edge by edge, instead of
// the shortest way through the line's points, which can cut across a triangle of the rim and leave a
// small hole between the pocket and the lips where the line lies nearly along the skin, as in the deep
// slit of Kambeðla's smile; its rows start from the lips themselves, so where that rim zigzags no flap
// of the pocket reaches across the open mouth; and where a texture seam runs along the lips the tongue
// takes the side the jaw has a copy of), conform (1: a triangle the cut leaves whole next to one it split
// is split at the new vertex too, so no crack opens there when the jaw turns), keep (1: the painted maps
// keep the source maps' names, wrapping and filters; without it they clamp at their edges, as the earlier
// passes wrote them), preview (1: show the result open instead of exporting).

const params = new URLSearchParams(location.search);
const SRC = params.get('src');
const OUT = params.get('out') || SRC.split('/').pop();
const LINE = params.get('line').split(';').map(s => s.split(',').map(Number));
const LEFT = params.get('left') ? params.get('left').split(';').map(s => s.split(',').map(Number)) : null;
const FRONT = Number(params.get('front'));
const CUT = Number(params.get('cut'));
const HINGE = params.get('hinge').split(',').map(Number);
const TALK = Number(params.get('talk') || 7);
const TEX = Number(params.get('tex') || 1024);
const SMOOTH = Number(params.get('smooth') || 6);
const SNAP = Number(params.get('snap') || 0);
const CHANNEL = params.get('channel') === '1';
const CORNERS = params.get('corners') === '1';
const FOLD = (params.get('fold') || '0.02,0.03').split(',').map(Number);
const RIM = params.get('rim') === '1';
const CONFORM = params.get('conform') === '1';
const KEEP = params.get('keep') === '1';
const PREVIEW = params.get('preview') === '1';
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ss = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const status = text => { window.__bakeStatus = text; console.log('[mouth]', text); };
const log = (...a) => console.log('[mouth]', ...a);

// A line's height at f (linear between its points, level beyond them).
const levelAt = (line, f) => {
  if (f <= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) {
    if (f <= line[i][0]) { const t = (f - line[i - 1][0]) / (line[i][0] - line[i - 1][0]); return line[i - 1][1] + t * (line[i][1] - line[i - 1][1]); }
  }
  return line.at(-1)[1];
};
// The mouth line's height at f: with `left`, `line` is the character's right side's and `left` its left side's,
// and within 4 cm of the middle (l) the one goes over into the other.
const mouthAt = (f, l = 0) => {
  const right = levelAt(LINE, f);
  return LEFT ? right + (levelAt(LEFT, f) - right) * ss(-0.04, 0.04, l) : right;
};

// A block of the texture atlas that no triangle's UVs come near (as in bake-tailed-biped).
function freeBlock(geometry, size) {
  const cell = 4, n = size / cell;
  const used = new Uint8Array(n * n);
  const uv = geometry.attributes.uv, index = geometry.index.array;
  for (let t = 0; t < index.length; t += 3) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let e = 0; e < 3; e++) {
      const i = index[t + e];
      const x = uv.getX(i) * n, y = uv.getY(i) * n;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    for (let y = Math.max(0, Math.floor(y0) - 2); y <= Math.min(n - 1, Math.floor(y1) + 2); y++) {
      for (let x = Math.max(0, Math.floor(x0) - 2); x <= Math.min(n - 1, Math.floor(x1) + 2); x++) used[y * n + x] = 1;
    }
  }
  for (const [w, h] of [[64, 48], [48, 32], [32, 24]]) {
    const cw = w / cell, ch = h / cell;
    for (let y = 1; y + ch < n - 1; y++) {
      for (let x = 1; x + cw < n - 1; x++) {
        let ok = true;
        for (let yy = y; yy < y + ch && ok; yy++) for (let xx = x; xx < x + cw && ok; xx++) if (used[yy * n + xx]) ok = false;
        if (ok) return { x: x * cell, y: y * cell, w, h };
      }
    }
  }
  throw new Error('no room in the texture atlas for the inside of the mouth');
}

function drawn(image, size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.getContext('2d').drawImage(image, 0, 0, size, size);
  return canvas;
}

function paintGradient(canvas, s, from, to) {
  const g = canvas.getContext('2d');
  const gradient = g.createLinearGradient(s.x + 4, 0, s.x + s.w - 4, 0);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  g.fillStyle = gradient;
  g.fillRect(s.x, s.y, s.w, s.h);
}

// The skin weights of vertex i as a map bone -> weight.
const weightsOf = (geometry, i) => {
  const { skinIndex, skinWeight } = geometry.attributes;
  const w = new Map();
  for (let k = 0; k < 4; k++) { const v = skinWeight.getComponent(i, k); if (v > 0) w.set(skinIndex.getComponent(i, k), (w.get(skinIndex.getComponent(i, k)) || 0) + v); }
  return w;
};
const top4 = w => {
  const list = [...w].filter(([, v]) => v > 1e-6).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const total = list.reduce((s, [, v]) => s + v, 0) || 1;
  return list.map(([b, v]) => [b, v / total]);
};

try {
  status('loading');
  const bytes = await (await fetch(SRC)).arrayBuffer();
  const gltf = await new GLTFLoader().parseAsync(bytes, new URL(SRC, location.href).href.replace(/[^/]*$/, ''));
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  let mesh = null;
  root.traverse(o => { if (o.isSkinnedMesh) mesh = o; });
  if (!mesh?.userData.face?.eyes) throw new Error('run the face pass first: the head frame comes from the eyes');
  if (mesh.skeleton.bones.some(b => b.name === 'Jaw')) throw new Error('this character has a jaw already');
  const skeleton = mesh.skeleton;
  const head = skeleton.bones.find(b => b.name === 'Head');
  const headIndex = skeleton.bones.indexOf(head);

  // --- the head's frame, in the world (metres) ------------------------------------------------------
  const eyes = mesh.userData.face.eyes.map(e => ({ c: V(...e.centre).applyMatrix4(mesh.matrixWorld), n: V(...e.normal).transformDirection(mesh.matrixWorld) }));
  const forward = eyes[0].n.clone().add(eyes[1].n).setY(0).normalize();
  const origin = eyes[0].c.clone().add(eyes[1].c).multiplyScalar(0.5);
  const left = V(0, 1, 0).cross(forward).normalize();
  const toWorld = mesh.matrixWorld.clone();
  const toMesh = toWorld.clone().invert();
  const frame = p => { const d = p.clone().applyMatrix4(toWorld).sub(origin); return { f: d.dot(forward), u: d.y, l: d.dot(left) }; };
  const fromFrame = (f, u, l) => origin.clone().addScaledVector(forward, f).add(V(0, u, 0)).addScaledVector(left, l).applyMatrix4(toMesh);
  // Negative in the jaw: below the line, behind the front, in front of the line's start.
  const phi = q => Math.max(q.u - mouthAt(q.f, q.l), q.f - FRONT, LINE[0][0] - q.f);

  // --- 1. split the triangles that cross the line in front of the cut --------------------------------
  const src = mesh.geometry;
  const attrs = SKIN_ATTRIBUTES;
  // The skin's other attributes go only when the query names them (attrs=_platerow), as the header says.
  const extras = carriedAttributes(src.attributes, params.get('attrs'));
  const dropped = Object.keys(src.attributes).filter(name => !attrs.includes(name) && !extras.includes(name));
  if (dropped.length) log(`not carried (no attrs= names them): ${dropped.join(', ')}`);
  const all = [...attrs, ...extras];
  const data = Object.fromEntries(all.map(a => [a, Array.from(src.attributes[a].array)]));
  const size = Object.fromEntries(all.map(a => [a, src.attributes[a].itemSize]));
  const count = () => data.position.length / 3;
  const point = i => V(data.position[3 * i], data.position[3 * i + 1], data.position[3 * i + 2]);
  const phis = [];
  const frames = [];
  for (let i = 0; i < count(); i++) { const q = frame(point(i)); frames.push(q); phis.push(phi(q)); }
  // A new vertex on edge (a, b) where phi is zero; shared by the triangles on that edge.
  const edgeVertex = new Map();
  const onCut = new Set();
  const split = (a, b) => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (edgeVertex.has(key)) return edgeVertex.get(key);
    const t = phis[a] / (phis[a] - phis[b]);
    const v = count();
    for (const name of ['position', 'normal', 'uv']) {
      for (let c = 0; c < size[name]; c++) data[name].push(data[name][size[name] * a + c] * (1 - t) + data[name][size[name] * b + c] * t);
    }
    const n = V(...data.normal.slice(3 * v, 3 * v + 3)).normalize();
    data.normal.splice(3 * v, 3, n.x, n.y, n.z);
    const nearer = t < 0.5 ? a : b;
    for (const name of extras) for (let c = 0; c < size[name]; c++) data[name].push(data[name][size[name] * nearer + c]);
    const w = new Map();
    for (const [bone, x] of weightsOf(src, a)) w.set(bone, (w.get(bone) || 0) + x * (1 - t));
    for (const [bone, x] of weightsOf(src, b)) w.set(bone, (w.get(bone) || 0) + x * t);
    const list = top4(w);
    for (let k = 0; k < 4; k++) { data.skinIndex.push(list[k]?.[0] ?? 0); data.skinWeight.push(list[k]?.[1] ?? 0); }
    const q = frame(point(v));
    frames.push(q);
    phis.push(0);
    onCut.add(v);
    edgeVertex.set(key, v);
    return v;
  };
  const EPS = Math.max(1e-7, SNAP);
  for (let i = 0; i < phis.length; i++) if (Math.abs(phis[i]) < EPS) { phis[i] = 0; onCut.add(i); }
  const index = Array.from(src.index.array);
  const out = [];
  const sideOf = [];
  let splits = 0;
  for (let t = 0; t < index.length; t += 3) {
    const tri = [index[t], index[t + 1], index[t + 2]];
    const s = tri.map(i => Math.sign(phis[i]));
    const near = tri.some(i => frames[i].f > CUT - 0.05);
    if (!near || !(s.includes(1) && s.includes(-1))) { out.push(tri); continue; }
    splits++;
    // Rotate so the lone vertex (the one on its own side; a vertex on the line counts with neither) leads.
    let k = s.findIndex((x, j) => x !== 0 && s.filter(y => y === x).length === 1);
    if (k < 0) k = s.findIndex(x => x !== 0);
    const [a, b, c] = [tri[k], tri[(k + 1) % 3], tri[(k + 2) % 3]];
    const sa = Math.sign(phis[a]), sb = Math.sign(phis[b]), sc = Math.sign(phis[c]);
    if (sb === 0 || sc === 0) {
      // One vertex on the line: split the opposite edge only.
      const z = sb === 0 ? b : c, o = sb === 0 ? c : b;
      const p = split(a, o);
      if (sb === 0) out.push([a, z, p], [z, o, p]); else out.push([a, p, z], [p, o, z]);
      continue;
    }
    const pab = split(a, b), pac = split(a, c);
    out.push([a, pab, pac], [pab, b, c], [pab, c, pac]);
  }
  // With `conform`, a triangle the cut left whole (it lies more than 5 cm behind `cut`) that has an edge a
  // neighbour's split cut in two is split in two at that vertex as well. Left whole, its edge would run
  // straight past the new vertex, whose weights blend its ends', and open a crack there as the jaw turns.
  let conformed = 0;
  if (CONFORM) {
    for (let j = 0; j < out.length; j++) {
      const tri = out[j];
      for (let e = 0; e < 3; e++) {
        const a = tri[e], b = tri[(e + 1) % 3], c = tri[(e + 2) % 3];
        const v = edgeVertex.get(a < b ? `${a}_${b}` : `${b}_${a}`);
        if (v === undefined) continue;
        out[j] = [a, v, c];
        out.push([v, b, c]);
        conformed++;
        j--; // look at the first half again: another of its edges may have been split too
        break;
      }
    }
  }
  // Which side each triangle is on: by its centroid's phi (with `corners`, by its corners off the line).
  const triSide = tri => {
    const off = CORNERS ? tri.map(i => phis[i]).find(x => x !== 0) : undefined;
    if (off !== undefined) return off < 0 ? 'jaw' : 'head';
    const q = frame(point(tri[0]).add(point(tri[1])).add(point(tri[2])).divideScalar(3));
    return phi(q) < 0 ? 'jaw' : 'head';
  };
  for (const tri of out) sideOf.push(triSide(tri));
  // The open part of the cut: its vertices get a copy for the jaw side.
  const jawCopy = new Map();
  const isOpen = i => onCut.has(i) && frames[i].f > CUT;
  out.forEach((tri, j) => {
    if (sideOf[j] !== 'jaw') return;
    for (let e = 0; e < 3; e++) {
      const i = tri[e];
      if (!isOpen(i)) continue;
      if (!jawCopy.has(i)) {
        const v = count();
        for (const name of all) for (let c = 0; c < size[name]; c++) data[name].push(data[name][size[name] * i + c]);
        frames.push(frames[i]);
        phis.push(0);
        jawCopy.set(i, v);
      }
      tri[e] = jawCopy.get(i);
    }
  });
  log(`cut: ${splits} triangles split${CONFORM ? ` (and ${conformed} beside them)` : ''}, ${onCut.size} vertices on the line, ${jawCopy.size} opened`);
  if (jawCopy.size < 6) throw new Error('the mouth line opens almost nothing: check line, front and cut');

  // --- 2. the jaw bone and its share of the skin ---------------------------------------------------
  const jaw = new THREE.Bone();
  jaw.name = 'Jaw';
  head.add(jaw);
  const hingeWorld = origin.clone().addScaledVector(forward, HINGE[0]).add(V(0, HINGE[1], 0));
  head.updateMatrixWorld(true);
  jaw.position.copy(head.worldToLocal(hingeWorld.clone()));
  jaw.quaternion.identity(); // turned like the head
  jaw.updateMatrixWorld(true);
  const jawIndex = skeleton.bones.length;

  // One id per welded position (copies at UV seams share it); the jaw copies of the open cut have ids
  // of their own, so the smoothing keeps the lips apart.
  const n = count();
  const keyOf = i => `${Math.round(data.position[3 * i] * 1e5)},${Math.round(data.position[3 * i + 1] * 1e5)},${Math.round(data.position[3 * i + 2] * 1e5)}`;
  const copies = new Set(jawCopy.values());
  const ids = new Map();
  const idOf = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const k = copies.has(i) ? `jaw|${keyOf(i)}` : keyOf(i);
    if (!ids.has(k)) ids.set(k, ids.size);
    idOf[i] = ids.get(k);
  }
  // Raw share: the jaw side of the line, growing from the hinge to the cut.
  const share = new Float32Array(ids.size);
  const seen = new Uint8Array(ids.size);
  for (let i = 0; i < n; i++) {
    const q = frames[i];
    const below = copies.has(i) || (phis[i] < 0 && !onCut.has(i));
    const s = below ? ss(HINGE[0], CUT, q.f) : 0;
    const id = idOf[i];
    share[id] = seen[id] ? Math.max(share[id], s) : s;
    seen[id] = 1;
  }
  // Smoothing over the surface, the opened lips apart: the head side of an open lip stays at zero, the
  // jaw side at its share.
  const neighbours = Array.from({ length: ids.size }, () => new Set());
  for (const tri of out) for (let e = 0; e < 3; e++) { const a = idOf[tri[e]], b = idOf[tri[(e + 1) % 3]]; if (a !== b) { neighbours[a].add(b); neighbours[b].add(a); } }
  const pinned = new Uint8Array(ids.size);
  for (let i = 0; i < n; i++) if (isOpen(i) || copies.has(i)) pinned[idOf[i]] = 1;
  let current = share;
  for (let round = 0; round < SMOOTH; round++) {
    const next = new Float32Array(current.length);
    for (let id = 0; id < current.length; id++) {
      if (pinned[id] || neighbours[id].size === 0) { next[id] = current[id]; continue; }
      let sum = 0;
      for (const m of neighbours[id]) sum += current[m];
      next[id] = 0.5 * current[id] + 0.5 * (sum / neighbours[id].size);
    }
    current = next;
  }
  // The jaw takes its share of what the head carried.
  for (let i = 0; i < n; i++) {
    const s = current[idOf[i]];
    if (s <= 1e-4) continue;
    const w = new Map();
    for (let k = 0; k < 4; k++) { const b = data.skinIndex[4 * i + k], v = data.skinWeight[4 * i + k]; if (v > 0) w.set(b, (w.get(b) || 0) + v); }
    const h = w.get(headIndex) || 0;
    if (h <= 0) continue;
    w.set(headIndex, h * (1 - s));
    w.set(jawIndex, (w.get(jawIndex) || 0) + h * s);
    const list = top4(w);
    for (let k = 0; k < 4; k++) { data.skinIndex[4 * i + k] = list[k]?.[0] ?? 0; data.skinWeight[4 * i + k] = list[k]?.[1] ?? 0; }
  }

  // --- 3. the inside of the mouth --------------------------------------------------------------------
  // The lips as a chain from one corner round the front to the other, through the cut's segments. Its
  // two ends are the first closed points of the line behind the opening (both sides share them), so the
  // pocket meets the skin there without a gap; the points between open.
  const lipKey = i => keyOf(i);
  const lipPos = new Map(), lipUpper = new Map(), lipLower = new Map();
  for (const i of onCut) {
    const k = lipKey(i);
    lipPos.set(k, point(i));
    lipUpper.set(k, i);
    // With `rim`, of the vertices at one point of the lips (the two sides of a texture seam) the lower lip is
    // one the jaw has a copy of, so the tongue's edge moves with the jaw.
    if (!RIM || jawCopy.has(i) || !lipLower.has(k)) lipLower.set(k, jawCopy.get(i) ?? i);
  }
  const original = new Map([...jawCopy].map(([i, c]) => [c, i]));
  const graph = new Map();
  const link = (a, b) => { if (a === b) return; if (!graph.has(a)) graph.set(a, new Set()); graph.get(a).add(b); };
  if (RIM) {
    // The opened lips' own edges: those only one triangle has once the jaw has its copies (the copies
    // counted apart), the rim of the opening, so the pocket's edge runs along every one of them.
    const edgeUse = new Map();
    for (const tri of out) {
      for (let e = 0; e < 3; e++) {
        const a = tri[e], b = tri[(e + 1) % 3];
        const key = idOf[a] < idOf[b] ? `${idOf[a]},${idOf[b]}` : `${idOf[b]},${idOf[a]}`;
        const edge = edgeUse.get(key);
        if (edge) edge.n++; else edgeUse.set(key, { a, b, n: 1 });
      }
    }
    for (const { a, b, n: used } of edgeUse.values()) {
      const oa = original.get(a) ?? a, ob = original.get(b) ?? b;
      if (used === 1 && onCut.has(oa) && onCut.has(ob)) { link(lipKey(oa), lipKey(ob)); link(lipKey(ob), lipKey(oa)); }
    }
  } else {
    for (const tri of out) {
      const onLine = tri.map(i => original.get(i) ?? i).filter(i => onCut.has(i));
      if (onLine.length >= 2) for (let a = 0; a < onLine.length; a++) for (let b = a + 1; b < onLine.length; b++) { link(lipKey(onLine[a]), lipKey(onLine[b])); link(lipKey(onLine[b]), lipKey(onLine[a])); }
    }
  }
  const openKeys = new Set([...onCut].filter(isOpen).map(lipKey));
  const sideKey = k => frame(lipPos.get(k)).l;
  // A closed point next to an open one, on each side; failing that, the open point furthest back.
  const ends = [...lipPos.keys()].filter(k => !openKeys.has(k) && [...(graph.get(k) || [])].some(m => openKeys.has(m)));
  const back = list => list.reduce((a, b) => (frame(lipPos.get(b)).f < frame(lipPos.get(a)).f ? b : a));
  const endOn = sign => {
    const closed = ends.filter(k => Math.sign(sideKey(k)) === sign);
    return closed.length ? back(closed) : back([...openKeys].filter(k => Math.sign(sideKey(k)) === sign));
  };
  const leftEnd = endOn(1), rightEnd = endOn(-1);
  // The way between them runs through open points only.
  for (const [k, set] of graph) for (const m of [...set]) if (!openKeys.has(m) && m !== leftEnd && m !== rightEnd) set.delete(m);
  // Shortest way along the lips (by length) from one end to the other.
  const dist = new Map([[leftEnd, 0]]), prev = new Map();
  const queue = [leftEnd];
  while (queue.length) {
    queue.sort((a, b) => dist.get(a) - dist.get(b));
    const k = queue.shift();
    for (const m of graph.get(k) || []) {
      const d = dist.get(k) + lipPos.get(k).distanceTo(lipPos.get(m));
      if (d < (dist.get(m) ?? Infinity)) { dist.set(m, d); prev.set(m, k); queue.push(m); }
    }
  }
  if (!dist.has(rightEnd)) throw new Error('the lips do not run from corner to corner');
  const path = [];
  for (let k = rightEnd; k !== undefined; k = prev.get(k)) path.push(k);
  path.reverse();
  log(`lips: ${path.length} points from corner to corner`);

  const mapCanvas = drawn(mesh.material.map.image, TEX);
  const normalCanvas = mesh.material.normalMap ? drawn(mesh.material.normalMap.image, TEX) : null;
  const block = freeBlock(src, TEX);
  const swatch = {
    palate: { x: block.x, y: block.y, w: block.w, h: block.h / 2 },
    tongue: { x: block.x, y: block.y + block.h / 2, w: block.w, h: block.h / 2 },
  };
  paintGradient(mapCanvas, swatch.palate, '#c65e5c', '#6c2a2c');
  paintGradient(mapCanvas, swatch.tongue, '#ee918a', '#a64c4e');
  if (normalCanvas) {
    const g = normalCanvas.getContext('2d');
    g.fillStyle = 'rgb(128,128,255)';
    g.fillRect(block.x, block.y, block.w, block.h);
  }
  const swatchUV = (s, u, v) => [(s.x + 4 + u * (s.w - 8)) / TEX, (s.y + 3 + v * (s.h - 6)) / TEX];

  // The pocket, as in bake-tailed-biped, in the head's frame: the lip row, rows in to a fold further
  // back and lower, narrower; the palate follows the head, the tongue the jaw, the fold both halfway.
  const P = path.map(k => frame(lipPos.get(k)));
  const m = P.length;
  const wOf = i => { const w = new Map(); for (let k = 0; k < 4; k++) { const v = data.skinWeight[4 * i + k]; if (v > 0) w.set(data.skinIndex[4 * i + k], (w.get(data.skinIndex[4 * i + k]) || 0) + v); } return top4(w); };
  const upperW = path.map(k => wOf(lipUpper.get(k)));
  const lowerW = path.map(k => wOf(lipLower.get(k)));
  const blend = (list, shares) => { const w = new Map(); list.forEach((x, j) => { for (const [b, v] of x) w.set(b, (w.get(b) || 0) + shares[j] * v); }); return top4(w); };
  const span = Math.max(...P.map(q => q.f)) - Math.min(...P.map(q => q.f));
  const widest = Math.max(...P.map(q => Math.abs(q.l)));
  const meanU = P.reduce((s, q) => s + q.u, 0) / m;
  const backF = Math.min(...P.map(q => q.f)) - 0.35 * span;
  const nearby = (list, i, reach) => list.slice(Math.max(0, i - reach), Math.min(list.length, i + reach + 1));
  const inner = P.map((q, i) => (i === 0 || i === m - 1 ? { ...q } : nearby(P, i, 3).reduce((s, x, _, a) => ({ f: s.f + x.f / a.length, u: s.u + x.u / a.length, l: s.l + x.l / a.length }), { f: 0, u: 0, l: 0 })));
  const fold = inner.map((q, j) => {
    const depth = 0.85 * Math.max(0, Math.sin((Math.PI * j) / (m - 1))) ** 0.6;
    // A long beak's channel: in from the lip to the middle of the beak at the same place along it, a little
    // lower; it closes at the corners, as the deep pocket does.
    if (CHANNEL) return { f: q.f - FOLD[0] * span * depth, u: q.u - FOLD[1] * span * depth, l: q.l * (1 - depth) };
    return { f: THREE.MathUtils.lerp(q.f, backF, depth), u: THREE.MathUtils.lerp(q.u, meanU - 0.05 * span, depth), l: q.l * (1 - 0.7 * depth) };
  });
  const innerUpper = upperW.map((_, j) => { const w = nearby(upperW, j, 3); return blend(w, w.map(() => 1 / w.length)); });
  const innerLower = lowerW.map((_, j) => { const w = nearby(lowerW, j, 3); return blend(w, w.map(() => 1 / w.length)); });
  const foldW = innerUpper.map((w, j) => blend([w, innerLower[j]], [0.5, 0.5]));
  const pos = [], uv = [], si = [], sw = [];
  const vertex = (q, [u, v], w) => {
    const p = q.isVector3 ? q : fromFrame(q.f, q.u, q.l);
    pos.push(p.x, p.y, p.z);
    uv.push(u, v);
    for (let k = 0; k < 4; k++) { si.push(w[k] ? w[k][0] : 0); sw.push(w[k] ? w[k][1] : 0); }
    return pos.length / 3 - 1;
  };
  const ROWS = [0.08, 0.5, 1];
  const tris = [];
  const sheets = [];
  const sheet = (s, lipW, innerW, arch, which) => {
    const edge = path.map((k, i) => vertex(point(which === 'upper' ? lipUpper.get(k) : lipLower.get(k)), swatchUV(s, 0, i / (m - 1)), lipW[i]));
    const rows = ROWS.map(t => inner.map((smooth, j) => {
      // With `rim` the rows start from the lips themselves and come round to the lips' smoothed line by
      // halfway in, so where the rim zigzags the strip along the lips stays narrow, never a flap that
      // reaches out across the open mouth to a lip point.
      const near = RIM ? 1 - ss(0, 0.5, t) : 0;
      const q = near ? { f: THREE.MathUtils.lerp(smooth.f, P[j].f, near), u: THREE.MathUtils.lerp(smooth.u, P[j].u, near), l: THREE.MathUtils.lerp(smooth.l, P[j].l, near) } : smooth;
      const w = near ? blend([lipW[j], innerW[j]], [near, 1 - near]) : innerW[j];
      const r = { f: THREE.MathUtils.lerp(q.f, fold[j].f, t), u: THREE.MathUtils.lerp(q.u, fold[j].u, t), l: THREE.MathUtils.lerp(q.l, fold[j].l, t) };
      r.u += arch * 0.04 * span * Math.sin(Math.PI * t) * (1 - (r.l / widest) ** 2);
      return vertex(r, swatchUV(s, t, j / (m - 1)), blend([w, foldW[j]], [1 - t, t]));
    }));
    for (let i = 0; i < m - 1; i++) tris.push([edge[i], edge[i + 1], rows[0][i + 1]], [edge[i], rows[0][i + 1], rows[0][i]]);
    for (let r = 0; r < ROWS.length - 1; r++) for (let j = 0; j < m - 1; j++) tris.push([rows[r][j], rows[r][j + 1], rows[r + 1][j + 1]], [rows[r][j], rows[r + 1][j + 1], rows[r + 1][j]]);
    sheets.push({ edge, first: rows[0] });
  };
  sheet(swatch.palate, upperW, innerUpper, 1.2, 'upper');
  sheet(swatch.tongue, lowerW, innerLower, 0.8, 'lower');
  const pocket = new THREE.BufferGeometry();
  pocket.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pocket.setIndex(tris.flat());
  pocket.computeVertexNormals();
  const nrm = Array.from(pocket.attributes.normal.array);
  // Both faces: the back faces are copies with the normals turned round.
  const cnt = pos.length / 3;
  const pos2 = [...pos, ...pos], uv2 = [...uv, ...uv], si2 = [...si, ...si], sw2 = [...sw, ...sw], nrm2 = [...nrm, ...nrm.map(x => -x)];
  const index2 = [...tris.flat(), ...tris.flatMap(([a, b, c]) => [a + cnt, c + cnt, b + cnt])];
  const mouthGeometry = new THREE.BufferGeometry();
  mouthGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pos2, 3));
  mouthGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm2, 3));
  mouthGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv2, 2));
  mouthGeometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si2, 4));
  mouthGeometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw2, 4));
  mouthGeometry.setIndex(index2);
  // The loader names a glTF attribute of its own as the file does but in lower case (_PLATEROW becomes
  // _platerow), and GLTFExporter writes a name it does not know in upper case with an underscore before it:
  // without its own underscore here the name in the file stays as it was.
  const fileName = name => name.replace(/^_/, '');
  const extraAttribute = (name, values) => {
    const { array, normalized } = src.attributes[name];
    return new THREE.BufferAttribute(new array.constructor(values), size[name], normalized);
  };
  for (const name of extras) mouthGeometry.setAttribute(fileName(name), extraAttribute(name, (pos2.length / 3) * size[name]));

  // --- 4. one mesh again, the skeleton with its jaw, and the GLB -------------------------------------
  const body = new THREE.BufferGeometry();
  body.setAttribute('position', new THREE.Float32BufferAttribute(data.position, 3));
  body.setAttribute('normal', new THREE.Float32BufferAttribute(data.normal, 3));
  body.setAttribute('uv', new THREE.Float32BufferAttribute(data.uv, 2));
  body.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(data.skinIndex, 4));
  body.setAttribute('skinWeight', new THREE.Float32BufferAttribute(data.skinWeight, 4));
  for (const name of extras) body.setAttribute(fileName(name), extraAttribute(name, data[name]));
  body.setIndex(out.flat());
  const geometry = mergeGeometries([body, mouthGeometry], false);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  if (!geometry.attributes.position.array.every(Number.isFinite)) throw new Error('a vertex has no position');
  // The jaw's inverse bind matrix makes its bone matrix in the bind pose the head's (the skin's bind
  // space may carry the root's scale), so the jaw is still where the skin is until it turns.
  const bindDelta = head.matrixWorld.clone().multiply(skeleton.boneInverses[headIndex]);
  const bones = [...skeleton.bones, jaw];
  const inverses = [...skeleton.boneInverses, jaw.matrixWorld.clone().invert().multiply(bindDelta)];
  const bindMatrix = mesh.bindMatrix.clone();
  mesh.geometry = geometry;
  mesh.bind(new THREE.Skeleton(bones, inverses), bindMatrix);
  const texture = (canvas, colorSpace, source) => {
    const t = new THREE.CanvasTexture(canvas);
    t.flipY = false;
    t.colorSpace = colorSpace;
    t.userData.mimeType = 'image/jpeg';
    // With `keep`, the map keeps the source map's name, wrapping and filters (without it a canvas texture's
    // own: clamped at the edges, no name).
    if (KEEP) for (const key of ['name', 'wrapS', 'wrapT', 'magFilter', 'minFilter', 'anisotropy']) t[key] = source[key];
    return t;
  };
  mesh.material.map = texture(mapCanvas, THREE.SRGBColorSpace, mesh.material.map);
  if (normalCanvas) mesh.material.normalMap = texture(normalCanvas, THREE.NoColorSpace, mesh.material.normalMap);
  mesh.userData.face = { ...mesh.userData.face, mouth: { talk: TALK } };
  // The jaw's track for each clip that opens it, turning it down about the head's own right side as
  // talking does (and as the preview below opens it).
  const opens = left.clone().transformDirection(head.matrixWorld.clone().invert()).normalize();
  const jawClips = [];
  for (const clip of gltf.animations) {
    const open = clip.userData.jaw;
    if (!Array.isArray(open)) continue;
    const times = clip.tracks[0].times;
    if (open.length !== times.length) throw new Error(`${clip.name}: ${open.length} jaw keys for ${times.length} times`);
    const turn = new THREE.Quaternion();
    const values = open.flatMap(deg => turn.setFromAxisAngle(opens, THREE.MathUtils.degToRad(deg)).toArray());
    clip.tracks.push(new THREE.QuaternionKeyframeTrack(`${jaw.name}.quaternion`, times, values));
    jawClips.push(clip.name);
  }
  const report = {
    triangles: geometry.index.count / 3, vertices: geometry.attributes.position.count, split: splits, conformed,
    opened: jawCopy.size, lips: path.length, pocket: index2.length / 3, hinge: hingeWorld.toArray().map(v => +v.toFixed(3)), block, jawClips, carried: extras, dropped,
  };
  window.__bakeReport = report;
  log(JSON.stringify(report));

  if (PREVIEW) {
    // The result with the jaw open: ?deg= degrees, seen from ?view (head frame f,u,l) at ?dist.
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(innerWidth, innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    document.body.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e9efe6');
    scene.add(new THREE.HemisphereLight(0xfff6ea, 0x8a8070, 2.0));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.5);
    sun.position.set(6, 10, 9);
    scene.add(sun, root);
    mesh.frustumCulled = false;
    const deg = Number(params.get('deg') || 0);
    // Opening turns the jaw down about the head's own right side (its left, negated).
    jaw.quaternion.setFromAxisAngle(left.clone().transformDirection(head.matrixWorld.clone().invert()).normalize(), THREE.MathUtils.degToRad(deg));
    root.updateMatrixWorld(true);
    const [vf, vu, vl] = (params.get('view') || '0.3,0.05,1').split(',').map(Number);
    const focus = origin.clone().addScaledVector(forward, Number(params.get('ff') || 0.3)).add(V(0, Number(params.get('fu') || -0.6), 0));
    const dir = forward.clone().multiplyScalar(vf).add(V(0, vu, 0)).addScaledVector(left, vl).normalize();
    const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.01, 100);
    camera.position.copy(focus).addScaledVector(dir, Number(params.get('dist') || 3));
    camera.lookAt(focus);
    renderer.setAnimationLoop(() => renderer.render(scene, camera));
    window.__demoReady = true;
  } else {
    status('exporting');
    // The loader made node names safe for animation tracks ('FrontFoot.L' became 'FrontFootL'); the
    // file keeps them as they were. Tracks point at nodes by index, so the names can go back after.
    // The character's own root node is exported (the loader wraps the scene's nodes in a group).
    const names = new Map();
    root.traverse(o => { if (o.userData.name !== undefined) { names.set(o.name, o.userData.name); delete o.userData.name; } });
    const exportRoot = root.children.length === 1 ? root.children[0] : root;
    const glb = await new GLTFExporter().parseAsync(exportRoot, { binary: true, animations: gltf.animations, maxTextureSize: TEX, onlyVisible: true });
    const view = new DataView(glb);
    const jsonLength = view.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLength)));
    for (const node of json.nodes) if (names.has(node.name)) node.name = names.get(node.name);
    const text = new TextEncoder().encode(JSON.stringify(json));
    const padded = Math.ceil(text.length / 4) * 4;
    const rest = new Uint8Array(glb, 20 + jsonLength);
    const result = new Uint8Array(20 + padded + rest.length);
    const rv = new DataView(result.buffer);
    rv.setUint32(0, 0x46546c67, true); rv.setUint32(4, 2, true); rv.setUint32(8, result.length, true);
    rv.setUint32(12, padded, true); rv.setUint32(16, 0x4e4f534a, true);
    result.set(text, 20); result.fill(0x20, 20 + text.length, 20 + padded); result.set(rest, 20 + padded);
    const res = await fetch(`/__bake-output?name=${encodeURIComponent(OUT)}`, { method: 'POST', body: result.buffer });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  }
  status('done');
} catch (error) {
  console.error(error);
  status(`error: ${error.message}`);
}
