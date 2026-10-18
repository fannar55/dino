import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { GLTFExporter } from '../../vendor/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from '../../../dist/vendor/BufferGeometryUtils.js';
import { authorClips } from './tailed-biped-clips.js';

// Bakes a tailed biped (a theropod such as Grameðla the T. rex or Uggeðla the Spinosaurus) for the
// remake from an unrigged Tripo export kept in parts (remake/tools/blender-decimate.py ... parts, which
// keeps the seams between parts welded and the surface closed). It stands the model at the origin
// facing +X at a given length, recognises the parts (body, tail, head, lower jaw, thighs, feet, claws,
// arms, a sail on the back) from their positions and shared seams, places the skeleton, gives every
// vertex soft skin weights that agree across the seams, opens a mouth along the lip seam, authors the
// clips (tailed-biped-clips.js) and exports one skinned mesh.
//
// Tripo cuts each model differently. Grameðla's legs are thigh, foot and claws, her arms two pieces
// and her lower jaw a part of its own. Uggeðla's legs and arms are one part each (hip to toes,
// shoulder to claws), her head holds both jaws (the mouth pass, mouth.js, cuts hers), a sail stands
// on her back and tail, and Tripo stood her in mid-stride, her right foot ahead: then each leg keeps
// its own knee, heel and toes as the model has them (footing plants her feet where they stand in the
// bind pose), and only the hips are mirrored.
//
// Query: src (parts GLB, relative to this page), out (file name for the upload), length (metres,
// nose to tail tip), yaw (degrees that turn the model's head to +X; found from the model when left
// out), tex (texture size), roughness, name, stride and cycle (the walk: metres and seconds per
// cycle), duty (share of the cycle a foot is down), mouth (share of the lip seam that opens, from
// the front), teeth (soft rounded teeth on the upper jaw, one fewer on the lower; 0 for none),
// ahead (1: Tripo turned the neck and head aside; turn them back to face +X, see below), neck
// (metres: the Neck joint this far down the neck from the Head joint, which then sits at the top of
// the neck, in the middle of the head's seam with the body, and the head part rides it rigidly; left
// out, Grameðla's joints), straighten (the share of the tail's sideways bend the clips take out),
// clips (the clips to author, from tailed-biped-clips.js; idle,walk,roar when left out), preview (1:
// show the result in the page instead of exporting; clip and t pick the pose).
//
// Bones have identity rest rotations, so clips rotate about the character's own axes: X forward,
// Y up, Z the character's right. The legs are digitigrade, rigged the way the engine's footing
// (engine/footing.js, jointed legs) and two-bone IK (engine/ik.js) expect a biped's: Thigh (hip),
// Shin (knee) and Foot (the raised heel), the Foot carrying the metatarsus, toes and claws as one,
// so a planted foot peels its heel up about the toes.

const params = new URLSearchParams(location.search);
const SRC = params.get('src') || '../../assets/characters/source/trex-parts.glb';
const OUT = params.get('out') || 'trex.glb';
const LENGTH = Number(params.get('length') || 12);
const TEX = Number(params.get('tex') || 1024);
const ROUGHNESS = Number(params.get('roughness') || 0.62);
const NAME = params.get('name') || 'Grameðla';
const MOUTH = Number(params.get('mouth') || 0.62);
const TEETH = Number(params.get('teeth') ?? 8);
const AHEAD = params.get('ahead') === '1';
const NECK = params.has('neck') ? Number(params.get('neck')) : null;
const CLIPS = params.get('clips') ? params.get('clips').split(',') : undefined;
const PREVIEW = params.get('preview') === '1';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fmt = v => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
const status = text => { window.__bakeStatus = text; console.log('[bake]', text); };
const log = (...a) => console.log('[bake]', ...a);

function positions(geometry) {
  const p = geometry.attributes.position;
  const out = new Array(p.count);
  for (let i = 0; i < p.count; i++) out[i] = V(p.getX(i), p.getY(i), p.getZ(i));
  return out;
}
const centroid = points => points.reduce((sum, p) => sum.add(p), V()).divideScalar(points.length);

// The yaw that turns the model's head-to-tail axis to +X, head forward: the main axis of the
// footprint, pointing toward the end that holds the highest point (the head).
function autoYaw(points) {
  let mx = 0, mz = 0;
  for (const p of points) { mx += p.x; mz += p.z; }
  mx /= points.length; mz /= points.length;
  let xx = 0, xz = 0, zz = 0;
  for (const p of points) { const x = p.x - mx, z = p.z - mz; xx += x * x; xz += x * z; zz += z * z; }
  const angle = 0.5 * Math.atan2(2 * xz, xx - zz);
  const f = V(Math.cos(angle), 0, Math.sin(angle));
  const top = points.reduce((a, b) => (b.y > a.y ? b : a));
  if ((top.x - mx) * f.x + (top.z - mz) * f.z < 0) f.negate();
  return Math.atan2(f.z, f.x);
}

// Centroids of the points within `half` of each station along an axis.
function slices(points, axis, from, to, step, half) {
  const out = [];
  for (let v = from; v <= to + 1e-9; v += step) {
    const near = points.filter(p => Math.abs(p[axis] - v) < half);
    if (near.length < 6) continue;
    const lo = near.reduce((m, p) => Math.min(m, p.y), Infinity);
    const hi = near.reduce((m, p) => Math.max(m, p.y), -Infinity);
    out.push({ v, c: centroid(near), lo, hi, n: near.length });
  }
  return out;
}

// A point along a polyline of stations (sorted by `v`), interpolated at `v`.
function along(stations, v, get = s => s.c) {
  if (v <= stations[0].v) return get(stations[0]).clone();
  for (let i = 1; i < stations.length; i++) {
    if (v <= stations[i].v) {
      const t = (v - stations[i - 1].v) / (stations[i].v - stations[i - 1].v);
      return get(stations[i - 1]).clone().lerp(get(stations[i]), t);
    }
  }
  return get(stations.at(-1)).clone();
}

// Shortest distances over a part's surface (along its edges, the copies of a position as one vertex)
// from the seed positions, as a map from position key to metres; `limit` stops the search there.
function surfaceDistances(part, keyOf, seeds, limit = Infinity) {
  const keys = part.points.map(keyOf);
  const at = new Map();
  keys.forEach((k, i) => at.set(k, part.points[i]));
  const links = new Map();
  const index = part.geometry.index.array;
  for (let t = 0; t < index.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = keys[index[t + e]], b = keys[index[t + ((e + 1) % 3)]];
      if (a === b) continue;
      const d = at.get(a).distanceTo(at.get(b));
      if (!links.has(a)) links.set(a, new Map());
      if (!links.has(b)) links.set(b, new Map());
      links.get(a).set(b, d);
      links.get(b).set(a, d);
    }
  }
  const dist = new Map();
  const heap = [];
  const push = (k, d) => {
    heap.push([d, k]);
    for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  for (const k of seeds) if (at.has(k) && !dist.has(k)) { dist.set(k, 0); push(k, 0); }
  while (heap.length) {
    const [d, k] = pop();
    if (d > dist.get(k) || d > limit) continue;
    for (const [n, len] of links.get(k) || []) {
      const nd = d + len;
      if (nd < (dist.get(n) ?? Infinity)) { dist.set(n, nd); push(n, nd); }
    }
  }
  return { dist, at };
}

// A limb in one part (Uggeðla's arms): its centre line from the seam where it meets the body out to
// its far tip, as the middles of bands of equal distance over its surface from the seam. The two
// corners of that line, where it bends most, are the elbow and the wrist.
function limbLine(part, keyOf, seamKeys, bands = 24) {
  const { dist, at } = surfaceDistances(part, keyOf, seamKeys);
  let tipKey = null;
  for (const [k, d] of dist) if (tipKey === null || d > dist.get(tipKey)) tipKey = k;
  const far = dist.get(tipKey);
  const sums = Array.from({ length: bands }, () => ({ p: V(), n: 0 }));
  for (const [k, d] of dist) {
    const b = Math.min(bands - 1, Math.floor((d / far) * bands));
    sums[b].p.add(at.get(k));
    sums[b].n++;
  }
  const line = sums.map((s, b) => ({ p: s.n ? s.p.divideScalar(s.n) : null, b })).filter(s => s.p);
  const tip = at.get(tipKey).clone();
  // The point of line[from..to) furthest from the straight way between a and b.
  const corner = (from, to, a, b) => {
    let best = null, most = -1;
    const seg = new THREE.Line3(a, b);
    for (let i = from; i < to; i++) {
      const d = seg.closestPointToPoint(line[i].p, true, V()).distanceTo(line[i].p);
      if (d > most) { most = d; best = i; }
    }
    return { i: best, d: most };
  };
  const start = line[0].p;
  const first = corner(1, line.length - 1, start, tip);
  const before = corner(1, first.i, start, line[first.i].p);
  const after = corner(first.i + 1, line.length - 1, line[first.i].p, tip);
  const second = before.i !== null && (after.i === null || before.d > after.d) ? before : after;
  const [e, w] = [first.i, second.i].sort((x, y) => x - y);
  // How far over the surface from the seam the elbow lies: the forearm and hand are beyond it.
  const elbowD = ((line[e].b + 0.5) / bands) * far;
  return { tip, elbow: line[e].p.clone(), wrist: line[w].p.clone(), dist, elbowD };
}

// Appends copies of a part's vertices (position, normal, uv) and returns their indices.
function copyVertices(part, list) {
  const g = part.geometry;
  const count = g.attributes.position.count;
  for (const name of ['position', 'normal', 'uv']) {
    const attr = g.attributes[name];
    if (!attr) continue;
    const size = attr.itemSize;
    const array = new Float32Array((count + list.length) * size);
    for (let i = 0; i < count; i++) for (let c = 0; c < size; c++) array[i * size + c] = attr.getComponent(i, c);
    list.forEach((i, j) => { for (let c = 0; c < size; c++) array[(count + j) * size + c] = attr.getComponent(i, c); });
    g.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  list.forEach(i => { part.points.push(part.points[i].clone()); part.keys.push(part.keys[i]); });
  return list.map((_, j) => count + j);
}

// The texture's image drawn at size x size.
function drawn(image, size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvas.getContext('2d').drawImage(image, 0, 0, size, size);
  return canvas;
}

// A block of the texture atlas that no triangle's UVs come near (nor a block already `taken`), at
// `size` px: room for the inside of the mouth. Smaller blocks are tried when the atlas is full.
function freeBlock(geometries, size, taken = []) {
  const cell = 4, n = size / cell;
  const used = new Uint8Array(n * n);
  for (const g of geometries) {
    const uv = g.attributes.uv, index = g.index.array;
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
  }
  for (const b of taken) {
    for (let y = Math.floor(b.y / cell) - 1; y <= Math.ceil((b.y + b.h) / cell); y++) {
      for (let x = Math.floor(b.x / cell) - 1; x <= Math.ceil((b.x + b.w) / cell); x++) if (x >= 0 && y >= 0 && x < n && y < n) used[y * n + x] = 1;
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

function paintGradient(canvas, s, from, to) {
  const g = canvas.getContext('2d');
  const gradient = g.createLinearGradient(s.x + 4, 0, s.x + s.w - 4, 0);
  gradient.addColorStop(0, from);
  gradient.addColorStop(1, to);
  g.fillStyle = gradient;
  g.fillRect(s.x, s.y, s.w, s.h);
}

// ?preview=1: the baked character on a neutral ground, playing ?clip= (or frozen at ?t=), seen from
// ?view= (a direction) at ?dist= metres from ?focus=; ?bones=1 draws the skeleton.
function preview(group, clips, mesh) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ece8e0');
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x8a8070, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(6, 14, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 0.5, far: 50 });
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.2 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  scene.add(group);
  if (params.get('bones') === '1') scene.add(new THREE.SkeletonHelper(group));
  const mixer = new THREE.AnimationMixer(group);
  mixer.clipAction(clips.find(c => c.name === (params.get('clip') || 'idle')) || clips[0]).play();
  const box = new THREE.Box3().setFromObject(group);
  const view = (params.get('view') || '0.45,0.25,1').split(',').map(Number);
  const focus = params.get('focus') ? V(...params.get('focus').split(',').map(Number)) : box.getCenter(V());
  const dist = Number(params.get('dist') || box.getSize(V()).length() * 1.6);
  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.05, 400);
  camera.position.copy(focus).add(V(...view).normalize().multiplyScalar(dist));
  camera.lookAt(focus);
  const t = params.get('t');
  if (t !== null) mixer.setTime(Number(t));
  let last = performance.now();
  renderer.setAnimationLoop(now => {
    if (t === null) mixer.update(Math.min(0.05, (now - last) / 1000));
    last = now;
    renderer.render(scene, camera);
  });
  window.__preview = { mixer, group, clips, camera, renderer, scene };
  window.__demoReady = true;
}

try {
  status('loading');
  const gltf = await new GLTFLoader().loadAsync(SRC);
  gltf.scene.updateMatrixWorld(true);
  const meshes = [];
  gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  const sourceMaterial = meshes[0].material;
  const geoms = meshes.map(m => {
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    return g;
  });

  // --- parts and the seams they share (positions are exact across a welded seam) -----------------
  const raw = geoms.map(positions);
  const extent = new THREE.Box3();
  raw.flat().forEach(p => extent.expandByPoint(p));
  const q = 1e-6 * extent.getSize(V()).length();
  const key = p => `${Math.round(p.x / q)},${Math.round(p.y / q)},${Math.round(p.z / q)}`;
  const owners = new Map();
  raw.forEach((points, i) => points.forEach(p => { const k = key(p); if (!owners.has(k)) owners.set(k, new Set()); owners.get(k).add(i); }));
  const shared = raw.map(() => new Map());
  for (const set of owners.values()) if (set.size > 1) for (const a of set) for (const b of set) if (a !== b) shared[a].set(b, (shared[a].get(b) || 0) + 1);

  // --- stand it at the origin facing +X, LENGTH long ----------------------------------------------
  // The main axis of the footprint gives the heading; the left/right pairs (feet, thighs) then
  // refine it so they line up across the body. The origin is between the feet, the midline z = 0.
  const parts = geoms.map((g, i) => ({ index: i, name: meshes[i].name, geometry: g, count: raw[i].length }));
  const touch = (a, b) => shared[a.index].get(b.index) || 0;
  const measure = part => {
    part.geometry.computeBoundingBox();
    part.box = part.geometry.boundingBox.clone();
    part.c = part.box.getCenter(V());
    part.size = part.box.getSize(V());
    part.points = positions(part.geometry);
  };
  const box = new THREE.Box3();
  const remeasure = () => { box.makeEmpty(); parts.forEach(p => { measure(p); box.union(p.box); }); };
  let yaw = params.has('yaw') ? THREE.MathUtils.degToRad(Number(params.get('yaw'))) : autoYaw(raw.flat());
  geoms.forEach(g => g.applyMatrix4(new THREE.Matrix4().makeRotationY(yaw)));
  remeasure();
  let H = box.max.y - box.min.y;
  const ground = parts.filter(p => p.box.min.y < box.min.y + 0.02 * H);
  const feetParts = [...ground].sort((a, b) => b.count - a.count).slice(0, 2);
  const others = parts.filter(p => !ground.includes(p));
  // A foot part that reaches up past a third of the height is a whole leg, hip to toes (Uggeðla's).
  const wholeLeg = f => f.box.max.y > box.min.y + 0.35 * H;
  const thighParts = feetParts.map(f => (wholeLeg(f) ? f : others.reduce((a, b) => (touch(b, f) > touch(a, f) ? b : a))));
  if (feetParts.length !== 2 || thighParts[0] === thighParts[1]) throw new Error('could not find two legs');
  if (!params.has('yaw')) {
    const across = V();
    for (const [a, b] of [feetParts, thighParts]) across.add(b.c.clone().sub(a.c).setY(0).multiplyScalar(Math.sign(b.c.z - a.c.z) || 1));
    const lean = Math.atan2(across.x, across.z);
    yaw -= lean;
    geoms.forEach(g => g.applyMatrix4(new THREE.Matrix4().makeRotationY(-lean)));
    remeasure();
  }
  const scale = LENGTH / (box.max.x - box.min.x);
  const mid = [...feetParts, ...thighParts].reduce((s, p) => s.add(p.c), V()).divideScalar(4);
  const feetX = (feetParts[0].c.x + feetParts[1].c.x) / 2;
  const place = new THREE.Matrix4().makeScale(scale, scale, scale).multiply(new THREE.Matrix4().makeTranslation(-feetX, -box.min.y, -mid.z));
  geoms.forEach(g => g.applyMatrix4(place));
  remeasure();
  H = box.max.y - box.min.y;
  log(`yaw ${THREE.MathUtils.radToDeg(yaw).toFixed(1)} deg, scale ${scale.toFixed(4)}: ${fmt(box.min)} to ${fmt(box.max)}`);

  // --- recognise the parts -----------------------------------------------------------------------
  // The character faces +X, so its left side is -Z and its right side +Z.
  const sideOf = p => (p.c.z < 0 ? 'Left' : 'Right');
  const kind = new Map();
  const legs = {};
  feetParts.forEach((foot, i) => {
    const side = sideOf(foot);
    const claws = ground.filter(p => !feetParts.includes(p) && touch(p, foot) > 0);
    legs[side] = { side, foot, thigh: thighParts[i], claws };
    kind.set(foot, `foot ${side}`);
    kind.set(thighParts[i], `thigh ${side}`);
    claws.forEach(c => kind.set(c, `foot ${side}`));
  });
  // The soles: what lies within a couple of centimetres of the ground is put on it, so both feet
  // stand flat (Tripo leaves one a centimetre up) and the engine finds the toes' ground contact.
  const SOLE = 0.008 * H;
  for (const p of parts.filter(q => kind.get(q)?.startsWith('foot') || (ground.includes(q) && kind.get(q)?.startsWith('thigh')))) {
    const pos = p.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < box.min.y + SOLE) pos.setY(i, box.min.y);
    pos.needsUpdate = true;
  }
  remeasure();
  const free = () => parts.filter(p => !kind.has(p));
  const body = free().filter(p => touch(p, legs.Left.thigh) && touch(p, legs.Right.thigh)).reduce((a, b) => (!a || b.count > a.count ? b : a), null);
  if (!body) throw new Error('no body part between the thighs');
  kind.set(body, 'body');
  const tail = free().reduce((a, b) => (!a || b.box.min.x < a.box.min.x ? b : a), null);
  if (!(tail && tail.box.min.x < body.box.min.x && tail.size.x > 0.2 * LENGTH)) throw new Error('no tail part behind the body');
  kind.set(tail, 'tail');
  const front = free().filter(p => p.c.x > body.c.x + 0.2 * LENGTH);
  const head = front.reduce((a, b) => (!a || b.count > a.count ? b : a), null);
  if (!head) throw new Error('no head part');
  kind.set(head, 'head');
  const jaw = params.get('jaw') ? parts.find(p => p.name === params.get('jaw'))
    : free().filter(p => touch(p, head) && p.c.y < head.c.y && p.c.x > head.c.x - 0.1 * head.size.x).reduce((a, b) => (!a || b.count > a.count ? b : a), null);
  if (jaw) kind.set(jaw, 'jaw');
  // Small pieces of the face (snout, nostrils) belong to the head.
  for (const p of free()) if (p.c.x > head.box.min.x && p.box.min.y > body.box.max.y - 0.25 * H && (touch(p, head) || (jaw && touch(p, jaw)))) kind.set(p, 'head');
  // Arms: what hangs in front of the chest below the neck; each side's pieces chained by their seams.
  const arms = {};
  for (const p of free()) {
    if (p.c.x > legs.Left.thigh.box.max.x && p.box.min.y > 0.15 * H && p.c.y < body.c.y && Math.abs(p.c.z) > 0.04 * H) {
      const side = sideOf(p);
      (arms[side] ||= []).push(p);
      kind.set(p, `arm ${side}`);
    }
  }
  // A sail on the back (Uggeðla's): a thin, tall part above the middle of the body that meets it. It
  // follows the spine below it, by where it lies along the body.
  for (const p of free()) if (p.c.y > body.c.y && p.size.z < 0.4 * p.size.y && touch(p, body)) kind.set(p, 'sail');
  // What is left between the body and the head (the throat) follows the spine.
  for (const p of free()) kind.set(p, 'neck');
  parts.forEach(p => log(`${p.name}: ${kind.get(p)}, centre ${fmt(p.c)}, size ${fmt(p.size)}`));
  if (!arms.Left || !arms.Right) throw new Error('could not find both arms');

  // One key per position: the copies of a vertex (UV seams, seams between parts) share it.
  const qk = 1e-6 * LENGTH;
  const wkey = p => `${Math.round(p.x / qk)},${Math.round(p.y / qk)},${Math.round(p.z / qk)}`;

  // --- the neck and head turned to face forward ---------------------------------------------------
  // Tripo may turn the neck and head aside (Uggeðla looks 16 degrees to her left). A character's head
  // should face where she does at rest (the actor looks and talks about the head's rest direction), so
  // the head turns back about the vertical through the root of the neck, where the head's own axis (the
  // main axis of its points across the ground: the head is symmetric about the vertical plane through
  // it) crosses the midline. Down the neck the turn fades out, by the distance from the head's seam
  // over the body's surface. The copies of a position turn alike, so no seam opens; a part that meets
  // the body there (an arm) turns whole as much as its seam does on average.
  let straightened = null;
  const headAxis = () => {
    const c = centroid(head.points.map(p => p.clone()));
    let xx = 0, xz = 0, zz = 0;
    for (const p of head.points) { const x = p.x - c.x, z = p.z - c.z; xx += x * x; xz += x * z; zz += z * z; }
    return { c, angle: 0.5 * Math.atan2(2 * xz, xx - zz) }; // the axis's heading: atan2(z, x) toward the snout
  };
  if (AHEAD && Math.abs(headAxis().angle) > 1e-3) {
    const headKeys = new Set(head.points.map(wkey));
    const seamKeys = new Set(body.points.map(wkey).filter(k => headKeys.has(k)));
    const seam = centroid(body.points.filter(p => seamKeys.has(wkey(p))));
    const { c, angle } = headAxis();
    const pivot = V(c.x - c.z / Math.tan(angle), 0, 0);
    const band = Math.hypot(seam.x - pivot.x, seam.z);
    const { dist } = surfaceDistances(body, wkey, seamKeys, band);
    const share = new Map([...dist].map(([k, d]) => [k, ss(0, 1, 1 - d / band)]));
    for (const k of headKeys) share.set(k, 1);
    const whole = part => {
      if (!kind.get(part)?.startsWith('arm')) return 0;
      const own = part.points.map(wkey).filter(k => share.has(k));
      return own.length ? own.reduce((sum, k) => sum + share.get(k), 0) / own.length : 0;
    };
    const turn = new THREE.Quaternion(), up = V(0, 1, 0), n = V();
    for (const part of parts) {
      const pos = part.geometry.attributes.position, nrm = part.geometry.attributes.normal;
      const rest = whole(part);
      part.points.forEach((p, i) => {
        const s = share.get(wkey(p)) ?? rest;
        if (s <= 0) return;
        turn.setFromAxisAngle(up, s * angle);
        const q = p.clone().sub(pivot).applyQuaternion(turn).add(pivot);
        pos.setXYZ(i, q.x, q.y, q.z);
        if (nrm) { n.fromBufferAttribute(nrm, i).applyQuaternion(turn); nrm.setXYZ(i, n.x, n.y, n.z); }
      });
      pos.needsUpdate = true;
      if (nrm) nrm.needsUpdate = true;
    }
    remeasure();
    // The snout now reaches a little further forward: the whole model is scaled back to its length.
    const fix = LENGTH / (box.max.x - box.min.x);
    geoms.forEach(g => g.applyMatrix4(new THREE.Matrix4().makeScale(fix, fix, fix)));
    remeasure();
    H = box.max.y - box.min.y;
    straightened = { degrees: +THREE.MathUtils.radToDeg(angle).toFixed(1), pivot: +pivot.x.toFixed(3), band: +band.toFixed(3), rescale: +fix.toFixed(4) };
    log(`straightened the neck and head ${straightened.degrees} deg about x ${straightened.pivot}, fading over ${straightened.band} m down the neck`);
  }

  // --- welded vertices: one key per position, so the seams between parts can be found ------------
  const keyParts = new Map();
  for (const part of parts) {
    part.keys = part.points.map(wkey);
    part.keys.forEach(k => { if (!keyParts.has(k)) keyParts.set(k, new Set()); keyParts.get(k).add(part.index); });
  }
  const seamPoints = (a, b) => a.points.filter((p, i) => keyParts.get(a.keys[i]).has(b.index));

  // --- joints ------------------------------------------------------------------------------------
  const J = { root: V() };
  const legInfo = {};
  // Standing in mid-stride (Uggeðla), the feet are far apart along the body.
  const stride = Math.abs(legs.Left.foot.c.x - legs.Right.foot.c.x) > 0.04 * LENGTH;
  for (const side of ['Left', 'Right']) {
    const leg = legs[side];
    const points = [...new Set([leg.foot, leg.thigh, ...leg.claws])].flatMap(p => p.points);
    const top = leg.thigh.box.max.y;
    const curve = slices(points, 'y', 0.04 * top, top, 0.025 * top, 0.02 * top);
    const band = (lo, hi) => curve.filter(s => s.v >= lo * top && s.v <= hi * top);
    // Heel (ankle): the back-most point of the leg's centre line low down; knee: the front-most above it.
    let heel = band(0.12, 0.42).reduce((a, b) => (b.c.x < a.c.x ? b : a));
    let knee = band(0.45, 0.72).reduce((a, b) => (b.c.x > a.c.x ? b : a));
    if (leg.foot === leg.thigh) {
      // A leg of one part: the thigh's bulk crowds the centre line around the knee. The heel is the
      // middle of the stretch where the line runs furthest back; the knee the top of the shin, where the
      // line, going up from the heel, stops leaning forward.
      const back = band(0.12, 0.42).filter(s => s.c.x < heel.c.x + 0.01 * top);
      heel = { v: back.reduce((sum, s) => sum + s.v, 0) / back.length, c: centroid(back.map(s => s.c.clone())) };
      const up = curve.filter(s => s.v > heel.v && s.v <= 0.75 * top);
      const i = up.findIndex((s, j) => j > 0 && (s.c.x - up[j - 1].c.x) / (s.v - up[j - 1].v) < 0.25);
      knee = { v: 0, c: i > 0 ? up[i - 1].c.clone().lerp(up[i].c, 0.5) : knee.c };
    }
    const hip = along(curve, 0.86 * top);
    // The ball of the foot: the front end of the metatarsus, a little above the toe pads, where the
    // foot's lowest band of points (the pads) has its middle.
    const pads = points.filter(p => p.y < 0.03 * top);
    const padMin = Math.min(...pads.map(p => p.x)), padMax = Math.max(...pads.map(p => p.x));
    const ballX = padMin + 0.48 * (padMax - padMin);
    const ballBand = points.filter(p => Math.abs(p.x - ballX) < 0.04 * top && p.y < 0.2 * top);
    const ball = V(ballX, 0.35 * Math.max(...ballBand.map(p => p.y)), centroid(ballBand).z);
    const toe = V(padMax, ball.y * 0.6, ball.z);
    J[`${side}Thigh`] = hip;
    J[`${side}Shin`] = knee.c.clone();
    J[`${side}Foot`] = heel.c.clone();
    legInfo[side] = { ball, toe, padMin, padMax, top };
  }
  // Mirror the joints across the midline so the two legs match exactly (the clips rely on it). In
  // mid-stride only the hips are: each leg keeps its own knee, heel and ball.
  const mirror = (l, r, set) => {
    const m = V((l.x + r.x) / 2, (l.y + r.y) / 2, (r.z - l.z) / 2);
    set(V(m.x, m.y, -m.z), V(m.x, m.y, m.z));
  };
  for (const n of stride ? ['Thigh'] : ['Thigh', 'Shin', 'Foot']) mirror(J[`Left${n}`], J[`Right${n}`], (l, r) => { J[`Left${n}`] = l; J[`Right${n}`] = r; });
  if (!stride) mirror(legInfo.Left.ball, legInfo.Right.ball, (l, r) => { legInfo.Left.ball = l; legInfo.Right.ball = r; });

  // Spine: the middle of the body's cross-sections along X (half-way between belly and back).
  const spinePoints = [body, tail, head, ...parts.filter(p => kind.get(p) === 'neck')].flatMap(p => p.points);
  const spine = slices(spinePoints, 'x', box.min.x, box.max.x, 0.02 * LENGTH, 0.012 * LENGTH)
    .map(s => ({ v: s.v, c: V(s.v, (s.lo + s.hi) / 2, s.c.z), lo: s.lo, hi: s.hi }));
  const spineAt = x => along(spine, x);
  const hipX = J.LeftThigh.x;
  J.Hips = V(hipX, J.LeftThigh.y + 0.04 * H, 0);
  const headStart = head.box.min.x;
  J.Spine = spineAt(hipX + 0.35 * (headStart - hipX)).setZ(0);
  J.Chest = spineAt(hipX + 0.68 * (headStart - hipX)).setZ(0);
  if (NECK !== null) {
    // The head turns about the top of the neck, the middle of its seam with the body, and rides its
    // bone whole; the Neck joint is NECK metres further down the neck.
    const top = centroid(seamPoints(head, body));
    J.Head = V(top.x, top.y, 0);
    J.Neck = spineAt(top.x - NECK).setZ(0);
  } else {
    J.Neck = spineAt(headStart).setZ(0);
    // The head turns about the top of the neck, behind the skull.
    J.Head = spineAt(headStart + 0.22 * head.size.x).setZ(0);
  }
  // Tail: six joints from the tail's root to near its tip, on the centre line (the tail may curve).
  const tailRoot = hipX - 0.12 * LENGTH;
  const tailEnd = box.min.x + 0.04 * LENGTH;
  for (let i = 0; i < 6; i++) J[`Tail${i + 1}`] = spineAt(tailRoot + (i / 5) * (tailEnd - tailRoot));

  // The ball of each foot (where the metatarsus meets the toes) and the toes' ground contact, the
  // front of the pads, the same on both feet (each foot's own in mid-stride): the Foot bone carries
  // both; a heel peels about the toes.
  const toeX = (legInfo.Left.padMax + legInfo.Right.padMax) / 2;
  const balls = {}, toes = {};
  for (const side of ['Left', 'Right']) {
    balls[side] = legInfo[side].ball;
    toes[side] = V(stride ? legInfo[side].padMax : toeX, 0, balls[side].z);
  }

  // --- arms --------------------------------------------------------------------------------------
  // The piece of an arm that hangs lowest is the forearm with the hand. Tripo may leave one side's
  // upper arm inside the body part, so the joints come from a side whose upper arm is a piece of its
  // own, mirrored to the other side and moved onto that side's forearm.
  const armJoints = {};
  // Arms of one part each, shoulder to claws (Uggeðla's): each arm's joints are where its centre line
  // bends, the shoulder a little way in from its seam with the body.
  const single = ['Left', 'Right'].every(side => arms[side].length === 1 && touch(arms[side][0], body));
  for (const side of ['Left', 'Right']) {
    const hand = arms[side].reduce((a, b) => (b.box.min.y < a.box.min.y ? b : a));
    const upper = arms[side].find(p => p !== hand && touch(p, body));
    armJoints[side] = { hand };
    if (single) {
      const limb = limbLine(hand, wkey, new Set(seamPoints(hand, body).map(wkey)));
      const beyond = p => limb.dist.get(wkey(p)) >= limb.elbowD;
      Object.assign(armJoints[side], {
        shoulder: centroid(seamPoints(hand, body)).lerp(centroid(hand.points.filter(p => !beyond(p))), 0.35),
        elbow: limb.elbow, wrist: limb.wrist, tip: limb.tip, fore: hand.points.filter(beyond),
      });
      continue;
    }
    if (!upper || !touch(upper, hand)) continue;
    const elbow = centroid(seamPoints(upper, hand));
    const tip = hand.points.reduce((far, p) => (p.distanceTo(elbow) > far.distanceTo(elbow) ? p : far));
    Object.assign(armJoints[side], { shoulder: centroid(seamPoints(upper, body)).lerp(centroid(upper.points), 0.35), elbow, wrist: elbow.clone().lerp(tip, 0.5), tip });
  }
  const model = ['Left', 'Right'].find(s => armJoints[s].shoulder);
  if (!model) throw new Error('no arm has an upper arm of its own');
  for (const side of ['Left', 'Right']) {
    const a = armJoints[side];
    if (a.shoulder) continue;
    const src = armJoints[model];
    const mirror = v => V(v.x, v.y, -v.z);
    const shift = centroid(a.hand.points).sub(mirror(centroid(src.hand.points)));
    Object.assign(a, { shoulder: mirror(src.shoulder).addScaledVector(shift, 0.5), elbow: mirror(src.elbow).add(shift), wrist: mirror(src.wrist).add(shift), tip: mirror(src.tip).add(shift) });
  }
  for (const side of ['Left', 'Right']) {
    const a = armJoints[side];
    J[`${side}UpperArm`] = a.shoulder;
    J[`${side}LowerArm`] = a.elbow;
    J[`${side}Hand`] = a.wrist;
    // The arm's thickness: how far the forearm's points lie from the elbow-to-tip line (from the
    // forearm and the hand of an arm of one part).
    const line = new THREE.Line3(a.elbow, a.tip);
    const fore = new THREE.Line3(a.elbow, a.wrist), hand = new THREE.Line3(a.wrist, a.tip);
    const away = a.fore
      ? p => Math.min(fore.closestPointToPoint(p, true, V()).distanceTo(p), hand.closestPointToPoint(p, true, V()).distanceTo(p))
      : p => line.closestPointToPoint(p, true, V()).distanceTo(p);
    const dists = (a.fore || a.hand.points).map(away).sort((x, y) => x - y);
    a.radius = dists[Math.floor(dists.length * 0.9)];
  }

  // --- the lower jaw and the lips ------------------------------------------------------------------
  // The jaw part meets the head along the mouth line. The front MOUTH share of that seam opens (the
  // lips); behind it the seam stays closed and the cheek stretches. The jaw turns about a hinge at
  // the back of the seam.
  const faceParts = parts.filter(p => kind.get(p) === 'head');
  // Which side of the mouth a vertex moves with: the jaw part's with the jaw, the face's with the
  // head, unless a stray triangle was handed to the other side (below).
  const mouthSide = (part, i) => part.sides?.get(i) ?? (part === jaw ? 'jaw' : 'face');
  let lips = null;
  if (jaw) {
    const seam = faceParts.flatMap(f => seamPoints(jaw, f));
    const back = Math.min(...seam.map(p => p.x)), frontX = Math.max(...seam.map(p => p.x));
    const cut = frontX - MOUTH * (frontX - back);
    const rear = seam.filter(p => p.x < back + 0.25 * (frontX - back));
    J.Jaw = V(back + 0.1 * (frontX - back), centroid(rear).y, 0);

    // The seam between the two sides, in welded keys. A lone triangle of one side may sit inside
    // the other with all three edges on the seam; it goes with the side around it, on copies of its
    // vertices. (The decimation keeps this seam as Tripo made it, so the lips are smooth.)
    const tris = [];
    for (const part of [jaw, ...faceParts]) {
      const index = part.geometry.index.array;
      for (let t = 0; t < index.length; t += 3) tris.push({ part, t, side: part === jaw ? 'jaw' : 'face' });
    }
    const corner = (tri, e) => tri.part.keys[tri.part.geometry.index.array[tri.t + (e % 3)]];
    const edgeKey = (a, b) => (a < b ? `${a}#${b}` : `${b}#${a}`);
    const seamEdges = () => {
      const sides = new Map();
      for (const tri of tris) {
        for (let e = 0; e < 3; e++) {
          const k = edgeKey(corner(tri, e), corner(tri, e + 1));
          if (!sides.has(k)) sides.set(k, new Set());
          sides.get(k).add(tri.side);
        }
      }
      return new Set([...sides].filter(([, s]) => s.size === 2).map(([k]) => k));
    };
    let edges = seamEdges();
    const strays = tris.filter(tri => [0, 1, 2].every(e => edges.has(edgeKey(corner(tri, e), corner(tri, e + 1)))));
    for (const tri of strays) {
      tri.side = tri.side === 'jaw' ? 'face' : 'jaw';
      const g = tri.part.geometry, index = g.index.array;
      const copies = copyVertices(tri.part, [index[tri.t], index[tri.t + 1], index[tri.t + 2]]);
      copies.forEach((i, e) => { index[tri.t + e] = i; (tri.part.sides ||= new Map()).set(i, tri.side); });
      g.index.needsUpdate = true;
    }
    if (strays.length) edges = seamEdges();

    // The lips: the shortest way along the seam, in front of the cut, from one corner of the mouth
    // to the other. Its two ends lie behind the cut and stay closed; the points between them open.
    const position = new Map();
    for (const part of [jaw, ...faceParts]) part.keys.forEach((k, i) => position.set(k, part.points[i]));
    const graph = new Map();
    const link = (a, b) => { if (!graph.has(a)) graph.set(a, new Set()); graph.get(a).add(b); };
    for (const e of edges) {
      const [a, b] = e.split('#');
      if (position.get(a).x <= cut && position.get(b).x <= cut) continue;
      link(a, b);
      link(b, a);
    }
    const ends = [...graph].filter(([, s]) => s.size === 1).map(([k]) => k);
    if (ends.length !== 2) throw new Error(`the lips do not run from corner to corner (${ends.length} ends)`);
    const prev = new Map([[ends[0], null]]);
    for (const queue = [ends[0]]; queue.length;) {
      const k = queue.shift();
      for (const n of graph.get(k)) if (!prev.has(n)) { prev.set(n, k); queue.push(n); }
    }
    const path = [];
    for (let k = ends[1]; k !== null && k !== undefined; k = prev.get(k)) path.push(k);
    if (path.at(-1) !== ends[0]) throw new Error('the corners of the mouth are not joined by the seam');
    path.reverse();
    lips = { back, front: frontX, cut, path, open: new Set(path.slice(1, -1)), position };
    log(`mouth: lip seam ${back.toFixed(2)} to ${frontX.toFixed(2)}, opens in front of ${cut.toFixed(2)} (${lips.open.size} vertices, ${strays.length} stray triangles moved), hinge ${fmt(J.Jaw)}`);
  }

  // --- skeleton: identity rest rotations, positions relative to the parent joint -----------------
  const PARENT = {
    Hips: 'root', Spine: 'Hips', Chest: 'Spine', Neck: 'Chest', Head: 'Neck', ...(jaw ? { Jaw: 'Head' } : {}),
    Tail1: 'Hips', Tail2: 'Tail1', Tail3: 'Tail2', Tail4: 'Tail3', Tail5: 'Tail4', Tail6: 'Tail5',
    LeftThigh: 'Hips', LeftShin: 'LeftThigh', LeftFoot: 'LeftShin',
    RightThigh: 'Hips', RightShin: 'RightThigh', RightFoot: 'RightShin',
    LeftUpperArm: 'Chest', LeftLowerArm: 'LeftUpperArm', LeftHand: 'LeftLowerArm',
    RightUpperArm: 'Chest', RightLowerArm: 'RightUpperArm', RightHand: 'RightLowerArm',
  };
  const names = ['root', ...Object.keys(PARENT)];
  const bones = {};
  for (const n of names) {
    const b = new THREE.Bone();
    b.name = n;
    b.position.copy(J[n]).sub(PARENT[n] ? J[PARENT[n]] : V());
    bones[n] = b;
    if (PARENT[n]) bones[PARENT[n]].add(b);
  }
  const boneIndex = Object.fromEntries(names.map((n, i) => [n, i]));
  Object.entries(J).forEach(([n, v]) => log(`joint ${n} ${fmt(v)}`));

  // --- skin weights --------------------------------------------------------------------------------
  // First a weight for every vertex from rules: the spine chain by position along the body, the leg
  // and arm chains by the planes that halve each joint's angle, the jaw by position along the jaw.
  // Then the copies of a position (UV seams, seams between parts) share one weight, and a few rounds
  // of smoothing over the surface take out the steps at the seams. The lips stay apart.
  const add = (w, bone, v) => { if (v > 1e-6) w.set(bone, (w.get(bone) || 0) + v); };
  const stations = [
    ...[6, 5, 4, 3, 2, 1].map(i => ({ x: J[`Tail${i}`].x, bone: `Tail${i}` })),
    { x: J.Hips.x, bone: 'Hips' }, { x: J.Spine.x, bone: 'Spine' }, { x: J.Chest.x, bone: 'Chest' },
    { x: J.Neck.x, bone: 'Neck' }, { x: J.Head.x, bone: 'Head' },
  ];
  function spineWeights(x, w, share = 1) {
    if (share <= 0) return;
    if (x <= stations[0].x) { add(w, stations[0].bone, share); return; }
    for (let k = 1; k < stations.length; k++) {
      if (x > stations[k].x) continue;
      const t = ss(stations[k - 1].x, stations[k].x, x);
      add(w, stations[k - 1].bone, share * (1 - t));
      add(w, stations[k].bone, share * t);
      return;
    }
    add(w, stations.at(-1).bone, share);
  }
  const unit = v => v.clone().normalize();
  const legFrame = {};
  for (const side of ['Left', 'Right']) {
    const Hj = J[`${side}Thigh`], K = J[`${side}Shin`], A = J[`${side}Foot`], B = balls[side];
    const a = unit(K.clone().sub(Hj)), b = unit(A.clone().sub(K)), c = unit(B.clone().sub(A));
    legFrame[side] = { Hj, K, A, a, nK: unit(a.clone().add(b)), nA: unit(b.clone().add(c)), length: Hj.y };
  }
  function legWeights(side, p, w) {
    const f = legFrame[side], len = f.length;
    const leg = ss(-0.16 * len, 0.06 * len, p.clone().sub(f.Hj).dot(f.a)); // the thigh's top fades into the body
    const shin = ss(-0.07 * len, 0.07 * len, p.clone().sub(f.K).dot(f.nK));
    const foot = ss(-0.05 * len, 0.05 * len, p.clone().sub(f.A).dot(f.nA));
    spineWeights(p.x, w, 1 - leg);
    add(w, `${side}Thigh`, leg * (1 - shin));
    add(w, `${side}Shin`, leg * shin * (1 - foot));
    add(w, `${side}Foot`, leg * shin * foot);
  }
  const segDist = (p, a, b) => new THREE.Line3(a, b).closestPointToPoint(p, true, V()).distanceTo(p);
  function armShare(side, p, own) {
    const a = armJoints[side], r = a.radius;
    const d = Math.min(segDist(p, a.shoulder, a.elbow), segDist(p, a.elbow, a.wrist), segDist(p, a.wrist, a.tip));
    const out = ss(-0.3 * r, 0.6 * r, p.clone().sub(a.shoulder).dot(unit(a.elbow.clone().sub(a.shoulder))));
    return out * (own ? 1 : 1 - ss(1.0 * r, 1.5 * r, d));
  }
  function armWeights(side, p, w, share) {
    const a = armJoints[side];
    const up = unit(a.elbow.clone().sub(a.shoulder)), fore = unit(a.wrist.clone().sub(a.elbow)), hand = unit(a.tip.clone().sub(a.wrist));
    const lower = ss(-0.4 * a.radius, 0.4 * a.radius, p.clone().sub(a.elbow).dot(unit(up.clone().add(fore))));
    const h = ss(-0.3 * a.radius, 0.3 * a.radius, p.clone().sub(a.wrist).dot(unit(fore.clone().add(hand))));
    add(w, `${side}UpperArm`, share * (1 - lower));
    add(w, `${side}LowerArm`, share * lower * (1 - h));
    add(w, `${side}Hand`, share * lower * h);
  }
  const jawShare = p => (lips ? ss(J.Jaw.x + 0.05 * (lips.front - lips.back), lips.cut + 0.05 * (lips.front - lips.back), p.x) : 0);

  function vertexWeights(part, i) {
    const w = new Map();
    const p = part.points[i];
    let [type, side] = kind.get(part).split(' ');
    if (type === 'jaw' || type === 'head') type = jaw && mouthSide(part, i) === 'jaw' ? 'jaw' : 'head';
    // A head that rides its bone whole (neck=): the snout stays rigid however the neck bends.
    if (type === 'head' && NECK !== null) { add(w, 'Head', 1); return w; }
    if (type === 'thigh' || type === 'foot') { legWeights(side, p, w); return w; }
    if (type === 'arm') {
      const share = armShare(side, p, true);
      spineWeights(p.x, w, 1 - share);
      armWeights(side, p, w, share);
      return w;
    }
    // A sail rides the back below it (the tail's root, the hips, spine and chest), never the neck: its
    // front, over the neck's root, takes the chest's weights.
    if (type === 'sail') { spineWeights(Math.min(p.x, J.Chest.x), w); return w; }
    // Body, neck, head, jaw, tail: the spine chain; an arm's upper part inside the body follows it.
    const near = p.z < 0 ? 'Left' : 'Right';
    const share = type === 'body' || type === 'neck' ? armShare(near, p, false) : 0;
    spineWeights(p.x, w, 1 - share);
    if (share > 0) armWeights(near, p, w, share);
    if (type === 'jaw') {
      const h = w.get('Head') || 0, s = jawShare(p);
      w.set('Head', h * (1 - s));
      add(w, 'Jaw', h * s);
    }
    return w;
  }

  // One id per position; the jaw side's copy of a lip vertex gets an id of its own so the lips open.
  const ids = new Map();
  const idOf = k => { if (!ids.has(k)) ids.set(k, ids.size); return ids.get(k); };
  for (const part of parts) {
    part.ids = part.keys.map((k, i) => idOf(lips && lips.open.has(k) && mouthSide(part, i) === 'jaw' ? `${k}|jaw` : k));
  }
  const idWeights = Array.from({ length: ids.size }, () => new Map());
  const idCount = new Float32Array(ids.size);
  for (const part of parts) {
    part.points.forEach((p, i) => {
      const id = part.ids[i];
      for (const [bone, v] of vertexWeights(part, i)) idWeights[id].set(bone, (idWeights[id].get(bone) || 0) + v);
      idCount[id]++;
    });
  }
  idWeights.forEach((w, id) => { for (const [bone, v] of w) w.set(bone, v / idCount[id]); });
  const neighbours = Array.from({ length: ids.size }, () => new Set());
  for (const part of parts) {
    const index = part.geometry.index.array;
    for (let t = 0; t < index.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = part.ids[index[t + e]], b = part.ids[index[t + ((e + 1) % 3)]];
        if (a !== b) { neighbours[a].add(b); neighbours[b].add(a); }
      }
    }
  }
  const SMOOTH = Number(params.get('smooth') || 8);
  // A head that rides its bone whole (neck=) keeps its weights: the neck's bend fades out on the body's
  // side of the seam, so the jaw by the mouth's corner, close to the throat, never parts from the lip.
  const rigid = NECK !== null ? new Set(head.ids) : null;
  let current = rigid ? idWeights.map((w, id) => (rigid.has(id) ? new Map([['Head', 1]]) : w)) : idWeights;
  for (let round = 0; round < SMOOTH; round++) {
    const before = current;
    current = before.map((w, id) => {
      if (rigid?.has(id)) return w;
      const out = new Map();
      for (const [bone, v] of w) out.set(bone, 0.5 * v);
      const share = 0.5 / Math.max(1, neighbours[id].size);
      for (const n of neighbours[id]) for (const [bone, v] of before[n]) out.set(bone, (out.get(bone) || 0) + share * v);
      return out;
    });
  }
  const finalWeights = current.map(w => {
    const top = [...w].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = top.reduce((s, [, v]) => s + v, 0) || 1;
    return top.map(([bone, v]) => [boneIndex[bone], v / total]);
  });
  const skinAttributes = (count, idFor) => {
    const skinIndex = new Uint16Array(count * 4);
    const skinWeight = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) finalWeights[idFor(i)].forEach(([b, v], j) => { skinIndex[i * 4 + j] = b; skinWeight[i * 4 + j] = v; });
    return [new THREE.Uint16BufferAttribute(skinIndex, 4), new THREE.Float32BufferAttribute(skinWeight, 4)];
  };
  for (const part of parts) {
    const [skinIndex, skinWeight] = skinAttributes(part.points.length, i => part.ids[i]);
    part.geometry.setAttribute('skinIndex', skinIndex);
    part.geometry.setAttribute('skinWeight', skinWeight);
  }
  // --- textures: the Tripo colour and normal maps at TEX, the inside of the mouth painted in -------
  const mapCanvas = drawn(sourceMaterial.map.image, TEX);
  const normalCanvas = sourceMaterial.normalMap ? drawn(sourceMaterial.normalMap.image, TEX) : null;
  const block = freeBlock(parts.map(p => p.geometry), TEX);
  const swatch = {
    palate: { x: block.x, y: block.y, w: block.w, h: block.h / 2 },
    tongue: { x: block.x, y: block.y + block.h / 2, w: block.w, h: block.h / 2 },
  };
  paintGradient(mapCanvas, swatch.palate, '#c65e5c', '#6c2a2c');
  paintGradient(mapCanvas, swatch.tongue, '#ee918a', '#a64c4e');
  // The teeth: ivory, a little warmer at the gum than at the tip (STYLE.md's ivory claws #efe2c8).
  if (TEETH > 0) {
    const t = freeBlock(parts.map(p => p.geometry), TEX, [block]);
    swatch.teeth = { x: t.x, y: t.y, w: Math.min(t.w, 32), h: Math.min(t.h, 24) };
    paintGradient(mapCanvas, swatch.teeth, '#d9c6a3', '#f7efde');
  }
  if (normalCanvas) {
    const g = normalCanvas.getContext('2d');
    g.fillStyle = 'rgb(128,128,255)';
    g.fillRect(block.x, block.y, block.w, block.h);
    if (swatch.teeth) g.fillRect(swatch.teeth.x, swatch.teeth.y, swatch.teeth.w, swatch.teeth.h);
  }
  // A point of a swatch: u across (lip to deep inside), v along the lips; kept off the swatch's edge.
  const swatchUV = (s, u, v) => [(s.x + 4 + u * (s.w - 8)) / TEX, (s.y + 3 + v * (s.h - 6)) / TEX];

  // --- the inside of the mouth ---------------------------------------------------------------------
  // Along the lips, a pocket reaches in from the upper lip to a fold between the jaws and back out to
  // the lower lip: the palate follows the head, the tongue the jaw, the fold both halfway. Closed,
  // it lies folded inside the head; open, it is what shows between the lips.
  const pieces = parts.map(p => p.geometry);
  let mouthInfo = null;
  if (lips && lips.open.size > 1) {
    const { path, position } = lips;
    const P = path.map(k => position.get(k));
    const n = P.length;
    const span = lips.front - lips.back;
    const upperW = path.map(k => finalWeights[ids.get(k)]);
    const lowerW = path.map(k => finalWeights[ids.get(lips.open.has(k) ? `${k}|jaw` : k)]);
    const blend = (list, shares) => {
      const m = new Map();
      list.forEach((w, j) => { for (const [bone, v] of w) m.set(bone, (m.get(bone) || 0) + shares[j] * v); });
      const top = [...m].sort((x, y) => y[1] - x[1]).slice(0, 4);
      const total = top.reduce((sum, [, v]) => sum + v, 0);
      return top.map(([bone, v]) => [bone, v / total]);
    };
    // Inside the mouth the pocket follows the lip line smoothed, at a quarter of its points: only
    // its edge row meets the lips point for point. Weights are smoothed along the line the same way.
    const window = (list, i, reach) => list.slice(Math.max(0, i - reach), Math.min(list.length, i + reach + 1));
    const m = Math.max(3, Math.round(n / 4));
    const at = j => Math.round((j / (m - 1)) * (n - 1));
    const inner = Array.from({ length: m }, (_, j) => (j === 0 || j === m - 1 ? P[at(j)].clone() : centroid(window(P, at(j), 4))));
    const innerUpper = Array.from({ length: m }, (_, j) => { const w = window(upperW, at(j), 5); return blend(w, w.map(() => 1 / w.length)); });
    const innerLower = Array.from({ length: m }, (_, j) => { const w = window(lowerW, at(j), 5); return blend(w, w.map(() => 1 / w.length)); });
    // The fold: a narrower copy of the line further back and a little lower, so the pocket is deep at
    // the front of the mouth; it closes at the corners (no depth there), so its sides cannot open.
    // It follows both jaws halfway.
    const meanY = P.reduce((sum, q) => sum + q.y, 0) / n;
    const backX = lips.cut - 0.25 * (lips.front - lips.cut);
    const fold = inner.map((q, j) => {
      const depth = 0.85 * Math.max(0, Math.sin((Math.PI * j) / (m - 1))) ** 0.6;
      return V(THREE.MathUtils.lerp(q.x, backX, depth), THREE.MathUtils.lerp(q.y, meanY - 0.03 * span, depth), q.z * (1 - 0.7 * depth));
    });
    const foldW = innerUpper.map((w, j) => blend([w, innerLower[j]], [0.5, 0.5]));
    const widest = Math.max(...P.map(q => Math.abs(q.z)));
    const pos = [], uv = [], si = [], sw = [];
    const vertex = (q, [u, v], w) => {
      pos.push(q.x, q.y, q.z);
      uv.push(u, v);
      for (let k = 0; k < 4; k++) { si.push(w[k] ? w[k][0] : 0); sw.push(w[k] ? w[k][1] : 0); }
      return pos.length / 3 - 1;
    };
    // A sheet: the lip row, then rows in to the fold (the first just inside the lips, so the ragged
    // lip row meets a smooth one over a narrow band); the palate arches up and the tongue rises a
    // little in the middle of the mouth.
    const ROWS = [0.08, 0.5, 1];
    const sheets = [];
    const sheet = (s, lipW, innerW, arch) => {
      const edge = P.map((q, i) => vertex(q, swatchUV(s, 0, i / (n - 1)), lipW[i]));
      const rows = [];
      for (const t of ROWS) {
        rows.push(inner.map((q, j) => {
          const point = q.clone().lerp(fold[j], t);
          point.y += arch * 0.035 * span * Math.sin(Math.PI * t) * (1 - (point.z / widest) ** 2);
          return vertex(point, swatchUV(s, t, j / (m - 1)), blend([innerW[j], foldW[j]], [1 - t, t]));
        }));
      }
      // The lip row meets the first inner row point for point along both, by their share of the way.
      const tris = [];
      for (let i = 0, j = 0; i < n - 1 || j < m - 1;) {
        if (j === m - 1 || (i < n - 1 && (i + 1) / (n - 1) <= (j + 1) / (m - 1))) { tris.push([edge[i], edge[i + 1], rows[0][j]]); i++; }
        else { tris.push([edge[i], rows[0][j + 1], rows[0][j]]); j++; }
      }
      for (let r = 0; r < ROWS.length - 1; r++) {
        for (let j = 0; j < m - 1; j++) tris.push([rows[r][j], rows[r][j + 1], rows[r + 1][j + 1]], [rows[r][j], rows[r + 1][j + 1], rows[r + 1][j]]);
      }
      sheets.push({ edge, first: rows[0] });
      return tris;
    };
    const tris = [...sheet(swatch.palate, upperW, innerUpper, 1.2), ...sheet(swatch.tongue, lowerW, innerLower, 0.8)];
    const mouth = new THREE.BufferGeometry();
    mouth.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    mouth.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    mouth.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    mouth.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    mouth.setIndex(tris.flat());
    mouth.computeVertexNormals();
    // The lip row shades like the smooth row just inside it.
    const normal = mouth.attributes.normal;
    for (const { edge, first } of sheets) edge.forEach((v, i) => { const j = Math.round((i / (n - 1)) * (m - 1)); normal.setXYZ(v, normal.getX(first[j]), normal.getY(first[j]), normal.getZ(first[j])); });
    // Both faces of the pocket: it folds and curls at the corners of the mouth, and the material is
    // single-sided. The back faces are copies of the vertices with the normals turned round.
    const count = pos.length / 3;
    for (let i = 0; i < count; i++) vertex(V(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]), [uv[2 * i], uv[2 * i + 1]], [0, 1, 2, 3].map(k => [si[4 * i + k], sw[4 * i + k]]));
    const flipped = new Float32Array(pos.length);
    for (let i = 0; i < count; i++) for (let c = 0; c < 3; c++) { flipped[3 * i + c] = normal.array[3 * i + c]; flipped[3 * (count + i) + c] = -normal.array[3 * i + c]; }
    mouth.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    mouth.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    mouth.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    mouth.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    mouth.setAttribute('normal', new THREE.Float32BufferAttribute(flipped, 3));
    mouth.setIndex([...tris.flat(), ...tris.flatMap(([a, b, c]) => [a + count, c + count, b + count])]);
    pieces.push(mouth);
    mouthInfo = { lipVertices: n, triangles: mouth.index.count / 3 };
    log(`mouth: ${n} lip vertices, ${mouth.index.count / 3} triangles inside`);

    // Soft rounded teeth (the owner, 2026-10-15: of all the characters only the T. rex has teeth, and
    // they are never scary): a few blunt ivory cones along the front of each jaw, set a little inside
    // the lips on the pocket and rooted in the gum. Closed, each jaw's teeth lie inside the other jaw;
    // they show while the mouth is open. They follow the pocket's smoothed weights: the upper teeth
    // the head, the lower ones the jaw. Each tooth is 30 triangles.
    if (TEETH > 0) {
      const length = 0.068 * span; // about 16 cm on Grameðla
      const SIDES = 6;
      const PROFILE = [[1, 0], [0.95, 0.45], [0.62, 0.82], [0, 1]]; // radius share, height share
      const tpos = [], tuv = [], tsi = [], tsw = [], tindex = [];
      const lerpAt = (list, s) => { const x = s * (list.length - 1), i = Math.min(list.length - 2, Math.floor(x)); return list[i].clone().lerp(list[i + 1], x - i); };
      const tooth = (s, upper) => {
        const big = 0.75 + 0.25 * Math.sin(Math.PI * s); // the front teeth a little bigger
        const len = length * big, radius = 0.42 * len;
        const lip = lerpAt(inner, s), deep = lerpAt(fold, s);
        // Set in from the lips and leaning into the mouth, so the closed lips cover them (a closed kind
        // smile at rest) and an open mouth shows them; the root is sunk in the gum.
        const inward = deep.clone().sub(lip).setY(0).normalize();
        const root = lip.lerp(deep, 0.11).add(V(0, (upper ? 1 : -1) * 0.22 * len, 0));
        const dir = V(0, upper ? -1 : 1, 0).addScaledVector(inward, upper ? 0.45 : 0.15).normalize();
        const w = (upper ? innerUpper : innerLower)[Math.round(s * (m - 1))];
        const side = V(0, 0, 1).cross(dir).normalize(), across = dir.clone().cross(side).normalize();
        const base = tpos.length / 3;
        PROFILE.forEach(([r, h], ring) => {
          const count = r > 0 ? SIDES : 1;
          for (let k = 0; k < count; k++) {
            const a = (2 * Math.PI * k) / SIDES;
            const q = root.clone().addScaledVector(dir, h * len).addScaledVector(side, Math.cos(a) * r * radius).addScaledVector(across, Math.sin(a) * r * radius);
            tpos.push(q.x, q.y, q.z);
            tuv.push(...swatchUV(swatch.teeth, h, 0.5));
            for (let c = 0; c < 4; c++) { tsi.push(w[c] ? w[c][0] : 0); tsw.push(w[c] ? w[c][1] : 0); }
          }
          if (ring === 0) return;
          const prev = base + (ring - 1) * SIDES, here = base + ring * SIDES;
          for (let k = 0; k < SIDES; k++) {
            const k1 = (k + 1) % SIDES;
            // Wound so the outside faces out whichever way the tooth points.
            const quad = r > 0 ? [[prev + k, here + k, here + k1], [prev + k, here + k1, prev + k1]] : [[prev + k, here, prev + k1]];
            for (const [a, b, c] of quad) tindex.push(...(upper ? [a, c, b] : [a, b, c]));
          }
        });
      };
      const lower = Math.max(0, TEETH - 1);
      for (let k = 0; k < TEETH; k++) tooth(0.18 + (0.64 * (k + 0.5)) / TEETH, true);
      for (let k = 0; k < lower; k++) tooth(0.2 + (0.6 * (k + 0.5)) / lower, false);
      const teeth = new THREE.BufferGeometry();
      teeth.setAttribute('position', new THREE.Float32BufferAttribute(tpos, 3));
      teeth.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2));
      teeth.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(tsi, 4));
      teeth.setAttribute('skinWeight', new THREE.Float32BufferAttribute(tsw, 4));
      teeth.setIndex(tindex);
      teeth.computeVertexNormals();
      pieces.push(teeth);
      mouthInfo.teeth = { upper: TEETH, lower, triangles: tindex.length / 3, length: +length.toFixed(3) };
      log(`teeth: ${TEETH} upper, ${lower} lower, ${tindex.length / 3} triangles, ${(100 * length).toFixed(1)} cm long`);
    }
  }

  // --- one skinned mesh ------------------------------------------------------------------------------
  const geometry = mergeGeometries(pieces, false);
  if (!geometry) throw new Error('could not merge the parts');
  if (!geometry.attributes.position.array.every(Number.isFinite)) throw new Error('a vertex has no position');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const texture = (canvas, colorSpace) => {
    const t = new THREE.CanvasTexture(canvas);
    t.flipY = false;
    t.colorSpace = colorSpace;
    t.userData.mimeType = 'image/jpeg';
    return t;
  };
  // Single-sided: the decimation leaves the surface closed, and the mouth's pocket faces inward.
  const material = new THREE.MeshStandardMaterial({
    name: `${NAME} skin`,
    map: texture(mapCanvas, THREE.SRGBColorSpace),
    normalMap: normalCanvas ? texture(normalCanvas, THREE.NoColorSpace) : null,
    roughness: ROUGHNESS, metalness: 0, side: THREE.FrontSide,
  });
  if (material.normalMap) material.normalScale.set(0.8, 0.8);
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = `${NAME} body`;
  const group = new THREE.Group();
  group.name = NAME;
  group.add(bones.root);
  group.add(mesh);
  group.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(names.map(n => bones[n])));

  // --- clips ---------------------------------------------------------------------------------------
  // The rest pose keeps the tail as Tripo made it; the clips straighten most of its sideways bend.
  const STRAIGHTEN = Number(params.get('straighten') || 0.85);
  const tailRest = {};
  const tip = spineAt(box.min.x + 0.01 * LENGTH);
  let bend = 0;
  for (let i = 1; i <= 6; i++) {
    const d = (i < 6 ? J[`Tail${i + 1}`] : tip).clone().sub(J[`Tail${i}`]);
    const yawNow = THREE.MathUtils.radToDeg(Math.atan2(d.z, -d.x));
    tailRest[`Tail${i}`] = -STRAIGHTEN * (yawNow - bend);
    bend = yawNow;
  }
  const gait = { stride: Number(params.get('stride') || 2.8), cycle: Number(params.get('cycle') || 2.5), duty: Number(params.get('duty') || 0.62) };
  const snout = head.points.reduce((a, b) => (b.x > a.x ? b : a)).clone();
  const sail = parts.some(p => kind.get(p) === 'sail');
  const { clips, report: clipReport } = authorClips({ bones, joints: J, toes, height: H, snout, sail, tailRest, walk: gait, clips: CLIPS });
  const report = {
    name: NAME, length: +LENGTH.toFixed(3), height: +H.toFixed(3), triangles: geometry.index.count / 3,
    vertices: geometry.attributes.position.count, bones: names.length, mouth: mouthInfo,
    clips: clips.map(c => `${c.name} ${c.duration.toFixed(2)} s`), walk: clipReport.walk, stretch: clipReport.stretch,
    tailRest: Object.fromEntries(Object.entries(tailRest).map(([k, v]) => [k, +v.toFixed(1)])),
    ...(clipReport.wade ? { wade: clipReport.wade } : {}),
    ...(straightened ? { straightened } : {}),
    ...(stride ? { stride: true } : {}),
    ...(sail ? { sail: true } : {}),
  };
  window.__bakeReport = report;
  log(JSON.stringify(report));

  if (PREVIEW) {
    preview(group, clips, mesh);
  } else {
    status('exporting');
    const glb = await new GLTFExporter().parseAsync(group, { binary: true, animations: clips, maxTextureSize: TEX, onlyVisible: true });
    const res = await fetch(`/__bake-output?name=${encodeURIComponent(OUT)}`, { method: 'POST', body: glb });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  }
  status('done');
} catch (error) {
  console.error(error);
  status(`error: ${error.message}`);
}
