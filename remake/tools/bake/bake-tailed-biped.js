import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { GLTFExporter } from '../../vendor/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from '../../../dist/vendor/BufferGeometryUtils.js';
import { authorClips } from './tailed-biped-clips.js';

// Bakes a tailed biped (a theropod such as Grameðla the T. rex) for the remake from an unrigged
// Tripo export kept in parts (remake/tools/blender-decimate.py ... parts, which keeps the seams
// between parts welded and the surface closed). It stands the model at the origin facing +X at a
// given length, recognises the parts (body, tail, head, lower jaw, thighs, feet, claws, arms) from
// their positions and shared seams, places the skeleton, gives every vertex soft skin weights that
// agree across the seams, opens a mouth along the lip seam, authors the clips
// (tailed-biped-clips.js) and exports one skinned mesh.
//
// Query: src (parts GLB, relative to this page), out (file name for the upload), length (metres,
// nose to tail tip), yaw (degrees that turn the model's head to +X; found from the model when left
// out), tex (texture size), roughness, name, stride and cycle (the walk: metres and seconds per
// cycle), duty (share of the cycle a foot is down), mouth (share of the lip seam that opens, from
// the front), preview (1: show the result in the page instead of exporting; clip and t pick the pose).
//
// Bones have identity rest rotations, so clips rotate about the character's own axes: X forward,
// Y up, Z the character's right. The legs are digitigrade: Thigh (hip), Shin (knee), Metatarsus
// (ankle, the raised heel) and Foot (the ball, carrying the toes that touch the ground).

const params = new URLSearchParams(location.search);
const SRC = params.get('src') || '../../assets/characters/source/trex-parts.glb';
const OUT = params.get('out') || 'trex.glb';
const LENGTH = Number(params.get('length') || 12);
const TEX = Number(params.get('tex') || 1024);
const ROUGHNESS = Number(params.get('roughness') || 0.62);
const NAME = params.get('name') || 'Grameðla';
const MOUTH = Number(params.get('mouth') || 0.62);
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

// A block of the texture atlas that no triangle's UVs come near, at `size` px: room for the inside
// of the mouth. Smaller blocks are tried when the atlas is full.
function freeBlock(geometries, size) {
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
  const thighParts = feetParts.map(f => others.reduce((a, b) => (touch(b, f) > touch(a, f) ? b : a)));
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
    if (p.c.x > legs.Left.thigh.box.max.x && p.box.min.y > 0.25 * H && p.c.y < body.c.y && Math.abs(p.c.z) > 0.04 * H) {
      const side = sideOf(p);
      (arms[side] ||= []).push(p);
      kind.set(p, `arm ${side}`);
    }
  }
  // What is left between the body and the head (the throat) follows the spine.
  for (const p of free()) kind.set(p, 'neck');
  parts.forEach(p => log(`${p.name}: ${kind.get(p)}, centre ${fmt(p.c)}, size ${fmt(p.size)}`));
  if (!arms.Left || !arms.Right) throw new Error('could not find both arms');

  // --- joints ------------------------------------------------------------------------------------
  const J = { root: V() };
  const legInfo = {};
  for (const side of ['Left', 'Right']) {
    const leg = legs[side];
    const points = [leg.foot, leg.thigh, ...leg.claws].flatMap(p => p.points);
    const top = leg.thigh.box.max.y;
    const curve = slices(points, 'y', 0.04 * top, top, 0.025 * top, 0.02 * top);
    const band = (lo, hi) => curve.filter(s => s.v >= lo * top && s.v <= hi * top);
    // Heel (ankle): the back-most point of the leg's centre line low down; knee: the front-most above it.
    const heel = band(0.12, 0.42).reduce((a, b) => (b.c.x < a.c.x ? b : a));
    const knee = band(0.45, 0.72).reduce((a, b) => (b.c.x > a.c.x ? b : a));
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
    J[`${side}Metatarsus`] = heel.c.clone();
    J[`${side}Foot`] = ball;
    legInfo[side] = { toe, padMin, padMax, top };
  }
  // Mirror the joints across the midline so the two legs match exactly (the clips rely on it).
  for (const n of ['Thigh', 'Shin', 'Metatarsus', 'Foot']) {
    const l = J[`Left${n}`], r = J[`Right${n}`];
    const m = V((l.x + r.x) / 2, (l.y + r.y) / 2, (r.z - l.z) / 2);
    J[`Left${n}`] = V(m.x, m.y, -m.z);
    J[`Right${n}`] = V(m.x, m.y, m.z);
  }

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
  J.Neck = spineAt(headStart).setZ(0);
  // The head turns about the top of the neck, behind the skull.
  J.Head = spineAt(headStart + 0.22 * head.size.x).setZ(0);
  // Tail: six joints from the tail's root to near its tip, on the centre line (the tail may curve).
  const tailRoot = hipX - 0.12 * LENGTH;
  const tailEnd = box.min.x + 0.04 * LENGTH;
  for (let i = 0; i < 6; i++) J[`Tail${i + 1}`] = spineAt(tailRoot + (i / 5) * (tailEnd - tailRoot));

  // Toe tips (not a bone): the front of the toe pads, the same on both feet.
  const toeX = (legInfo.Left.padMax + legInfo.Right.padMax) / 2;
  const toes = {};
  for (const side of ['Left', 'Right']) toes[side] = V(toeX, 0.6 * J[`${side}Foot`].y, J[`${side}Foot`].z);

  // --- welded vertices: one key per position, so the seams between parts can be found ------------
  const qk = 1e-6 * LENGTH;
  const wkey = p => `${Math.round(p.x / qk)},${Math.round(p.y / qk)},${Math.round(p.z / qk)}`;
  const keyParts = new Map();
  for (const part of parts) {
    part.keys = part.points.map(wkey);
    part.keys.forEach(k => { if (!keyParts.has(k)) keyParts.set(k, new Set()); keyParts.get(k).add(part.index); });
  }
  const seamPoints = (a, b) => a.points.filter((p, i) => keyParts.get(a.keys[i]).has(b.index));

  // --- arms --------------------------------------------------------------------------------------
  // The piece of an arm that hangs lowest is the forearm with the hand. Tripo may leave one side's
  // upper arm inside the body part, so the joints come from a side whose upper arm is a piece of its
  // own, mirrored to the other side and moved onto that side's forearm.
  const armJoints = {};
  for (const side of ['Left', 'Right']) {
    const hand = arms[side].reduce((a, b) => (b.box.min.y < a.box.min.y ? b : a));
    const upper = arms[side].find(p => p !== hand && touch(p, body));
    armJoints[side] = { hand };
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
    // The arm's thickness: how far the forearm's points lie from the elbow-to-tip line.
    const line = new THREE.Line3(a.elbow, a.tip);
    const dists = a.hand.points.map(p => line.closestPointToPoint(p, true, V()).distanceTo(p)).sort((x, y) => x - y);
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
    LeftThigh: 'Hips', LeftShin: 'LeftThigh', LeftMetatarsus: 'LeftShin', LeftFoot: 'LeftMetatarsus',
    RightThigh: 'Hips', RightShin: 'RightThigh', RightMetatarsus: 'RightShin', RightFoot: 'RightMetatarsus',
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
    const Hj = J[`${side}Thigh`], K = J[`${side}Shin`], A = J[`${side}Metatarsus`], B = J[`${side}Foot`], T = toes[side];
    const a = unit(K.clone().sub(Hj)), b = unit(A.clone().sub(K)), c = unit(B.clone().sub(A)), e = unit(T.clone().sub(B));
    legFrame[side] = { Hj, K, A, B, a, nK: unit(a.clone().add(b)), nA: unit(b.clone().add(c)), nB: unit(c.clone().add(e)), length: Hj.y };
  }
  function legWeights(side, p, w) {
    const f = legFrame[side], len = f.length;
    const leg = ss(-0.16 * len, 0.06 * len, p.clone().sub(f.Hj).dot(f.a)); // the thigh's top fades into the body
    const shin = ss(-0.07 * len, 0.07 * len, p.clone().sub(f.K).dot(f.nK));
    const meta = ss(-0.05 * len, 0.05 * len, p.clone().sub(f.A).dot(f.nA));
    const foot = ss(-0.03 * len, 0.03 * len, p.clone().sub(f.B).dot(f.nB));
    spineWeights(p.x, w, 1 - leg);
    add(w, `${side}Thigh`, leg * (1 - shin));
    add(w, `${side}Shin`, leg * shin * (1 - meta));
    add(w, `${side}Metatarsus`, leg * shin * meta * (1 - foot));
    add(w, `${side}Foot`, leg * shin * meta * foot);
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
    if (type === 'thigh' || type === 'foot') { legWeights(side, p, w); return w; }
    if (type === 'arm') {
      const share = armShare(side, p, true);
      spineWeights(p.x, w, 1 - share);
      armWeights(side, p, w, share);
      return w;
    }
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
  let current = idWeights;
  for (let round = 0; round < SMOOTH; round++) {
    const before = current;
    current = before.map((w, id) => {
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
  if (normalCanvas) {
    const g = normalCanvas.getContext('2d');
    g.fillStyle = 'rgb(128,128,255)';
    g.fillRect(block.x, block.y, block.w, block.h);
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
  const { clips, report: clipReport } = authorClips({ bones, joints: J, toes, height: H, tailRest, walk: gait });
  const report = {
    name: NAME, length: +LENGTH.toFixed(3), height: +H.toFixed(3), triangles: geometry.index.count / 3,
    vertices: geometry.attributes.position.count, bones: names.length, mouth: mouthInfo,
    clips: clips.map(c => `${c.name} ${c.duration.toFixed(2)} s`), walk: clipReport.walk,
    tailRest: Object.fromEntries(Object.entries(tailRest).map(([k, v]) => [k, +v.toFixed(1)])),
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
