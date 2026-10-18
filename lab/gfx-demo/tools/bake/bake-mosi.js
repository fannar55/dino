// Bakes the Tripo3D Triceratops (an unrigged export in parts) into a game-ready Mosi GLB:
// one skinned mesh on a skeleton that uses the old Quaternius bone names and rest orientations
// (Body, Shoulders, Neck, Head, Tail1..Tail5, legs and feet), with authored `idle` and `walk` clips.
// The parts are welded into one closed skin, so the material is single-sided.
// The game rotates Head (look, gaze, nod) and Tail1/Tail2 (celebration) in bone-local axes and
// attaches the scarf to Shoulders and the saddle to Body, so matching names and rest orientations
// keeps all of that working. Output is POSTed to the runner (tools/bake-mosi.mjs).
//
// Page params: src, old, out, tex (texture size), fit (length|height|blend), and for the walk: stride
// (metres per cycle; dinosaur-assets.js strideLength must match), duty (share of the cycle a foot is
// down) and lag (how long after a hind foot the fore foot on the same side comes down, share of the
// cycle). Duty and lag snap to 1/120 of the cycle, the walk's key spacing. length (metres from nose
// to tail tip) scales the finished Mosi uniformly to that size, walk included: the remake bakes him
// at his real 8.5 m, while the game keeps the fitted size (no length).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const params = new URLSearchParams(location.search);
const OLD = params.get('old') || '../../assets/tripo/reference-quaternius-triceratops.glb'; // the original Quaternius Mosi
const SRC = params.get('src') || '../../assets/tripo/triceratops.glb';
const OUT = params.get('out') || 'triceratops.glb';
const TEX = Number(params.get('tex') || 1024);
const FIT = params.get('fit') || 'blend';
const WALK_KEYS = 120; // keys per walk cycle
const STRIDE = Number(params.get('stride') || 1.7);
const DUTY = Math.round(Number(params.get('duty') || 0.5) * WALK_KEYS) / WALK_KEYS;
const LAG = Math.round(Number(params.get('lag') || 0.25) * WALK_KEYS) / WALK_KEYS;
const LENGTH = Number(params.get('length') || 0);
const report = {};
const log = (...a) => console.log('[bake]', ...a.map(v => (typeof v === 'object' ? JSON.stringify(v) : v)));
const r3 = v => v.toArray().map(n => +n.toFixed(3));

async function main() {
  const loader = new GLTFLoader();
  const [oldG, srcG] = await Promise.all([loader.loadAsync(OLD), loader.loadAsync(SRC)]);

  // --- reference: the old Mosi in the game's model space (bind pose) ---------------------------
  const oldScene = oldG.scene;
  oldScene.updateMatrixWorld(true);
  const oldBox = new THREE.Box3().setFromObject(oldScene, true);
  const oldClip = Object.fromEntries(oldG.animations.map(c => [c.name, c.duration]));
  const ref = {};
  oldScene.traverse(o => {
    if (o.isBone) ref[o.name] = { pos: o.getWorldPosition(new V3()), quat: o.getWorldQuaternion(new THREE.Quaternion()) };
  });
  report.old = { min: r3(oldBox.min), max: r3(oldBox.max), clips: oldClip, bones: Object.fromEntries(['Body', 'Shoulders', 'Neck', 'Head', 'Tail1', 'Tail2'].map(n => [n, ref[n] ? r3(ref[n].pos) : null])) };

  // --- the Tripo model: head toward +X, sized to the old footprint, feet on the ground ----------
  const src = srcG.scene;
  const pivot = new THREE.Group();
  pivot.add(src);
  pivot.rotation.y = Math.PI / 2; // Tripo/glTF forward is +Z
  pivot.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(pivot);
  const oldSize = oldBox.getSize(new V3());
  const srcSize = box.getSize(new V3());
  const byLength = oldSize.x / srcSize.x;
  const byHeight = oldSize.y / srcSize.y;
  const scale = FIT === 'length' ? byLength : FIT === 'height' ? byHeight : Math.sqrt(byLength * byHeight);
  pivot.scale.setScalar(scale);
  pivot.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(pivot);
  pivot.position.set(
    (oldBox.min.x + oldBox.max.x) / 2 - (box.min.x + box.max.x) / 2,
    oldBox.min.y - box.min.y,
    -(box.min.z + box.max.z) / 2,
  );
  pivot.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(pivot);
  report.fit = { mode: FIT, byLength: +byLength.toFixed(4), byHeight: +byHeight.toFixed(4), scale: +scale.toFixed(4), newMin: r3(box.min), newMax: r3(box.max) };

  // --- parts in model space ----------------------------------------------------------------------
  const meshes = [];
  src.traverse(o => { if (o.isMesh) meshes.push(o); });
  const sourceMaterial = meshes[0].material;
  const parts = meshes.map(mesh => {
    const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
    if (!geo.index) geo.setIndex([...Array(geo.attributes.position.count).keys()]);
    geo.computeBoundingBox();
    const b = geo.boundingBox.clone();
    return { name: mesh.name, geo, box: b, center: b.getCenter(new V3()), size: b.getSize(new V3()), verts: geo.attributes.position.count };
  });
  const H = box.max.y - box.min.y;
  const L = box.max.x - box.min.x;
  const body = parts.reduce((a, b) => (b.verts > a.verts ? b : a));
  const legs = parts.filter(p => p !== body && p.box.min.y < box.min.y + 0.08 * H && p.size.y > 0.25 * H).sort((a, b) => b.size.y - a.size.y).slice(0, 4);
  if (legs.length !== 4) throw new Error(`expected 4 leg parts, found ${legs.length}`);
  const rest = parts.filter(p => p !== body && !legs.includes(p));
  const head = rest.filter(p => p.center.x > body.center.x + 0.15 * L && p.center.y > box.min.y + 0.45 * H).reduce((a, b) => (!a || b.verts > a.verts ? b : a), null);
  if (!head) throw new Error('no head part found');
  const hl = head.size.x;
  const neckJoint = new V3(head.box.min.x + 0.25 * hl, head.box.min.y + 0.35 * head.size.y, head.center.z);
  const frontLegs = [...legs].sort((a, b) => b.center.x - a.center.x).slice(0, 2);
  const hindLegs = legs.filter(l => !frontLegs.includes(l));
  const tailStartX = Math.min(...hindLegs.map(l => l.box.min.x)) - 0.02 * L;
  const tailLen = tailStartX - body.box.min.x;
  const bp = body.geo.attributes.position;
  const sliceCentroid = (x, half) => {
    let n = 0, y = 0, z = 0;
    for (let i = 0; i < bp.count; i++) if (Math.abs(bp.getX(i) - x) < half) { y += bp.getY(i); z += bp.getZ(i); n++; }
    return n ? new V3(x, y / n, z / n) : new V3(x, body.center.y, body.center.z);
  };

  // --- skeleton: old names, old rest orientations, new positions --------------------------------
  const bones = [];
  const byName = {};
  function makeBone(name, parentName, worldPos, copyOrientation = true) {
    const b = new THREE.Bone();
    b.name = name;
    const worldQuat = copyOrientation && ref[name] ? ref[name].quat.clone() : new THREE.Quaternion();
    b.userData.restWorldPos = worldPos.clone();
    b.userData.restWorldQuat = worldQuat.clone();
    const parent = parentName ? byName[parentName] : null;
    if (parent) {
      const inv = parent.userData.restWorldQuat.clone().invert();
      b.position.copy(worldPos).sub(parent.userData.restWorldPos).applyQuaternion(inv);
      b.quaternion.copy(inv).multiply(worldQuat);
      parent.add(b);
    } else {
      b.position.copy(worldPos);
      b.quaternion.copy(worldQuat);
    }
    b.userData.restLocalPos = b.position.clone();
    bones.push(b);
    byName[name] = b;
    return b;
  }
  const shoulderX = (frontLegs[0].center.x + frontLegs[1].center.x) / 2;
  makeBone('root', null, new V3(), false);
  makeBone('Body', 'root', body.center.clone());
  const tailNames = ['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5'];
  const tailX = [];
  tailNames.forEach((name, i) => {
    const pos = sliceCentroid(tailStartX - (i / (tailNames.length - 1)) * tailLen * 0.9, 0.022 * L);
    tailX.push(pos.x);
    makeBone(name, i === 0 ? 'Body' : tailNames[i - 1], pos);
  });
  makeBone('Shoulders', 'Body', sliceCentroid(shoulderX, 0.03 * L));
  makeBone('Neck', 'Shoulders', new V3(neckJoint.x - 0.22 * hl, neckJoint.y, neckJoint.z));
  makeBone('Head', 'Neck', neckJoint.clone());
  const legRigs = legs.map(leg => {
    const front = frontLegs.includes(leg);
    const side = leg.center.z < body.center.z ? 'L' : 'R'; // facing +X, left is -Z
    let jy = Infinity;
    for (let i = 0; i < bp.count; i++) {
      if (Math.abs(bp.getX(i) - leg.center.x) < 0.35 * leg.size.x && Math.abs(bp.getZ(i) - leg.center.z) < 0.35 * leg.size.z) jy = Math.min(jy, bp.getY(i));
    }
    if (!Number.isFinite(jy)) jy = leg.box.max.y - 0.3 * leg.size.y;
    jy = Math.min(jy, leg.box.max.y - 0.1 * leg.size.y);
    const name = `${front ? 'Front' : 'Back'}Leg.${side}`;
    const bone = makeBone(name, 'root', new V3(leg.center.x, jy + 0.08 * leg.size.y, leg.center.z), false);
    // Foot markers keep the old Quaternius joint names the game's tests check (BackFoot.R and so on).
    // They also carry the foot, so a planted foot stays flat while the leg swings over it.
    const foot = makeBone(`${front ? 'Front' : 'Back'}Foot.${side}`, name, new V3(leg.center.x, box.min.y + 0.04 * H, leg.center.z), false);
    // The walk swings each leg from a hip (or shoulder) pivot inside the thigh bulge, at half the height.
    const pivot = new V3(leg.center.x, Math.max(box.min.y + 0.5 * H, jy + 0.1 * H), leg.center.z);
    return { leg, bone, foot, name, front, side, junctionY: jy, pivot };
  });
  const index = new Map(bones.map((b, i) => [b, i]));

  // --- one closed skin -----------------------------------------------------------------------------
  // Tripo cuts the model into parts along seams whose two sides lie within a tenth of a millimetre
  // of each other, so welded together the parts make one closed, consistently wound surface, and
  // Mosi renders single-sided (back faces culled) without holes. Each seam vertex snaps onto its
  // cluster's first vertex and gets the same skin weights (below), so the seams stay watertight when
  // skinned. Normals and UVs stay per part: the parts meet at creases and have their own texture
  // islands. The bake stops if the welded surface is open or wound against itself. Done after the
  // skeleton is placed, so bones and clips do not move.
  const skin = (() => {
    const WELD = 0.001; // metres
    let offset = 0;
    for (const part of parts) { part.offset = offset; offset += part.verts; }
    const vertexPart = [];
    for (const part of parts) for (let i = 0; i < part.verts; i++) vertexPart.push(part);
    const rep = new Int32Array(offset);
    const grid = new Map();
    const cellOf = (x, y, z) => `${Math.floor(x / WELD)},${Math.floor(y / WELD)},${Math.floor(z / WELD)}`;
    const q = new V3(), hit = new V3();
    for (const part of parts) {
      const pos = part.geo.attributes.position;
      for (let i = 0; i < part.verts; i++) {
        const g = part.offset + i;
        q.fromBufferAttribute(pos, i);
        let found = -1;
        const [cx, cy, cz] = cellOf(q.x, q.y, q.z).split(',').map(Number);
        for (let dx = -1; dx <= 1 && found < 0; dx++) for (let dy = -1; dy <= 1 && found < 0; dy++) for (let dz = -1; dz <= 1 && found < 0; dz++) {
          for (const other of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) {
            const owner = vertexPart[other];
            if (q.distanceTo(hit.fromBufferAttribute(owner.geo.attributes.position, other - owner.offset)) <= WELD) { found = other; break; }
          }
        }
        if (found >= 0) {
          rep[g] = found;
          pos.setXYZ(i, hit.x, hit.y, hit.z); // the cluster's first vertex
        } else {
          rep[g] = g;
          const key = `${cx},${cy},${cz}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(g);
        }
      }
    }
    // Edges of the welded surface: each must belong to exactly two triangles that run it in
    // opposite directions.
    const edges = new Map();
    const partsAt = new Map(); // cluster -> parts that meet there
    for (const part of parts) {
      const ix = part.geo.index.array;
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
    if (open || misWound) throw new Error(`the welded skin has ${open} open and ${misWound} mis-wound edges; single-sided it would show holes`);

    // The head side, and the neck seam where it meets the rest.
    const touching = new Map(parts.map(pt => [pt, new Set()]));
    for (const set of partsAt.values()) for (const a of set) for (const b of set) if (a !== b) touching.get(a).add(b);
    const anchored = new Set([body, ...legs]);
    for (const pt of [body, ...legs]) for (const other of touching.get(pt)) anchored.add(other);
    anchored.delete(head);
    const headSide = new Set([head]);
    for (let grew = true; grew;) {
      grew = false;
      for (const pt of headSide) for (const other of touching.get(pt)) if (!anchored.has(other) && !headSide.has(other)) { headSide.add(other); grew = true; }
    }
    const seam = [...partsAt].filter(([, set]) => [...set].some(pt => headSide.has(pt)) && [...set].some(pt => !headSide.has(pt))).map(([r]) => r);
    // Distance along the surface from the seam into the head side (Dijkstra over its edges).
    const position = r => { const owner = vertexPart[r]; return new V3().fromBufferAttribute(owner.geo.attributes.position, r - owner.offset); };
    const near = new Map();
    for (const edge of edges.values()) {
      if (!headSide.has(edge.part)) continue;
      const length = position(edge.a).distanceTo(position(edge.b));
      for (const [from, to] of [[edge.a, edge.b], [edge.b, edge.a]]) {
        if (!near.has(from)) near.set(from, []);
        near.get(from).push([to, length]);
      }
    }
    const headDistance = new Map(seam.map(r => [r, 0]));
    const queue = seam.map(r => [0, r]);
    while (queue.length) {
      let best = 0;
      for (let k = 1; k < queue.length; k++) if (queue[k][0] < queue[best][0]) best = k;
      const [d, r] = queue[best];
      queue[best] = queue[queue.length - 1];
      queue.pop();
      if (d > headDistance.get(r)) continue;
      for (const [to, length] of near.get(r) || []) {
        if (d + length < (headDistance.get(to) ?? Infinity)) { headDistance.set(to, d + length); queue.push([d + length, to]); }
      }
    }
    report.skin = {
      vertices: offset, welded: new Set(rep).size, triangles: [...edges.values()].reduce((s, e) => s + e.n, 0) / 3,
      openEdges: open, misWound, nonManifold, headSide: [...headSide].map(pt => pt.name), neckSeam: seam.length,
    };
    return { rep, vertexPart, headDistance };
  })();

  // --- skin weights --------------------------------------------------------------------------------
  const smooth = u => u * u * (3 - 2 * u);
  const spine = [
    ...tailNames.map((name, i) => ({ x: tailX[i], bone: byName[name] })).reverse(),
    { x: tailStartX + 0.06 * L, bone: byName.Body },
    { x: shoulderX - 0.08 * L, bone: byName.Body },
    { x: shoulderX + 0.02 * L, bone: byName.Shoulders },
    { x: neckJoint.x - 0.3 * hl, bone: byName.Neck },
    { x: neckJoint.x + 0.12 * hl, bone: byName.Head },
  ];
  // A control point at or behind the one before it (the neck bone sits over the shoulders) moves
  // halfway on to the next one, so the blend between those bones stays a blend and not a step.
  for (let k = 1; k < spine.length; k++) {
    if (spine[k].x > spine[k - 1].x) continue;
    const next = k + 1 < spine.length ? Math.max(spine[k + 1].x, spine[k - 1].x + 2e-4) : spine[k - 1].x + 2e-4;
    spine[k].x = (spine[k - 1].x + next) / 2;
  }
  function spineWeights(x, out) {
    if (x <= spine[0].x) { out.push([spine[0].bone, 1]); return; }
    for (let k = 0; k < spine.length - 1; k++) {
      const a = spine[k], b = spine[k + 1];
      if (x > b.x) continue;
      const s = smooth((x - a.x) / (b.x - a.x));
      if (a.bone === b.bone) out.push([a.bone, 1]);
      else { out.push([a.bone, 1 - s]); out.push([b.bone, s]); }
      return;
    }
    out.push([spine[spine.length - 1].bone, 1]);
  }
  // A leg takes its whole part up to the body and, fading out toward the hip pivot, the lower half of
  // the thigh or shoulder bulge above it, so a long swing bends the hip instead of shearing the leg
  // out of the body. Around the leg the share fades over about half the leg's width again, which
  // spreads the stretch and squeeze of the flank without reaching the belly, the far side or the
  // other leg's bulge (wider fades let front and hind legs squeeze the flank between them into folds).
  // Leg and body vertices get the same weights where they meet, so the seam stays closed. The foot
  // bone takes the foot and blends into the leg up the lower shin, so the ankle bends smoothly.
  const clamp = THREE.MathUtils.clamp;
  const ankleTop = box.min.y + 0.16 * H, ankleLow = box.min.y + 0.04 * H;
  const fade = (e, from, to) => 1 - smooth(clamp((e - from) / (to - from), 0, 1));
  function legShare(p, lr) {
    const up = smooth(clamp((lr.pivot.y - p.y) / (lr.pivot.y - lr.junctionY), 0, 1));
    const along = Math.abs(p.x - lr.pivot.x) / (0.5 * lr.leg.size.x), across = Math.abs(p.z - lr.pivot.z) / (0.5 * lr.leg.size.z);
    return up * fade(along, 1.15, 2.2) * fade(across, 1.15, 2.2);
  }
  function vertexWeights(p, own, out) {
    const shares = (own ? [own] : legRigs).map(lr => [lr, legShare(p, lr)]).filter(([, s]) => s > 0);
    const sum = shares.reduce((s, [, v]) => s + v, 0);
    const scale = sum > 1 ? 1 / sum : 1;
    spineWeights(p.x, out);
    for (const entry of out) entry[1] *= 1 - sum * scale;
    for (const [lr, s] of shares) {
      const share = s * scale;
      const f = own ? share * smooth(clamp((ankleTop - p.y) / (ankleTop - ankleLow), 0, 1)) : 0;
      if (share - f > 0) out.push([lr.bone, share - f]);
      if (f > 0) out.push([lr.foot, f]);
    }
  }
  // The head side (the head part and the parts that hang only on it: horns, beak) follows the Head
  // bone rigidly from HEAD_BAND (along the surface) past the neck seam, where it meets the body and
  // the chest; nearer the seam it blends in from the spine weights. Without this, the back of the
  // frill sat in the shoulder and neck weights, and a head turn folded it inside out.
  const HEAD_BAND = 0.2 * hl; // about 20 cm on the 4 m Mosi
  const legOf = new Map(legRigs.map(lr => [lr.leg, lr]));
  const cache = new Map(); // weld cluster -> weights, so both sides of a seam get the same ones
  const w = [];
  const p = new V3();
  for (const part of parts) {
    const pos = part.geo.attributes.position;
    const si = new Uint16Array(pos.count * 4);
    const sw = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      const r = skin.rep[part.offset + i];
      if (!cache.has(r)) {
        const owner = skin.vertexPart[r];
        p.fromBufferAttribute(owner.geo.attributes.position, r - owner.offset);
        w.length = 0;
        vertexWeights(p, legOf.get(owner), w);
        const d = skin.headDistance.get(r);
        if (d !== undefined) {
          const h = smooth(clamp(d / HEAD_BAND, 0, 1));
          for (const entry of w) entry[1] *= 1 - h;
          w.push([byName.Head, h]);
        }
        const merged = new Map();
        for (const [bone, value] of w) merged.set(bone, (merged.get(bone) || 0) + value);
        const kept = [...merged].filter(e => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
        const total = kept.reduce((s, e) => s + e[1], 0);
        cache.set(r, kept.map(([bone, value]) => [index.get(bone), value / total]));
      }
      cache.get(r).forEach(([bone, value], k) => { si[i * 4 + k] = bone; sw[i * 4 + k] = value; });
    }
    part.geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    part.geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  }
  const geometry = mergeGeometries(parts.map(pt => pt.geo), false);
  if (!geometry) throw new Error('mergeGeometries failed');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  // --- material: base colour + normal at mobile size, no metal/roughness map ---------------------
  const fit = tex => {
    if (!tex) return null;
    const k = Math.min(1, TEX / Math.max(tex.image.width, tex.image.height));
    const c = document.createElement('canvas');
    c.width = Math.round(tex.image.width * k);
    c.height = Math.round(tex.image.height * k);
    c.getContext('2d').drawImage(tex.image, 0, 0, c.width, c.height);
    const t = new THREE.CanvasTexture(c);
    t.flipY = false;
    t.colorSpace = tex.colorSpace;
    t.userData.mimeType = 'image/jpeg';
    return t;
  };
  const material = new THREE.MeshStandardMaterial({
    name: 'Mosi skin',
    map: fit(sourceMaterial.map),
    normalMap: fit(sourceMaterial.normalMap),
    roughness: 0.62,
    metalness: 0,
    side: THREE.FrontSide, // the welded skin is closed, so culling back faces opens no holes
  });

  // --- assemble and bind ---------------------------------------------------------------------------
  const exportRoot = new THREE.Group();
  exportRoot.name = 'Mosi';
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'Mosi body';
  exportRoot.add(byName.root);
  exportRoot.add(mesh);
  exportRoot.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);

  // --- clips: world-axis rotations (or a quaternion) relative to each parent's rest frame -------
  const X = new V3(1, 0, 0), Y = new V3(0, 1, 0), Z = new V3(0, 0, 1);
  function makeClip(name, duration, poseAt, keys = Math.round(duration * 30)) {
    const frames = keys + 1;
    const times = new Float32Array(frames);
    const tracks = new Map();
    const q = new THREE.Quaternion();
    const qa = new THREE.Quaternion();
    for (let f = 0; f < frames; f++) {
      const u = f / (frames - 1);
      times[f] = u * duration;
      const pose = poseAt(u);
      for (const [boneName, spec] of Object.entries(pose)) {
        const b = byName[boneName];
        if (!b) continue;
        const parentQ = b.parent && b.parent.isBone ? b.parent.userData.restWorldQuat : new THREE.Quaternion();
        const invParent = parentQ.clone().invert();
        if (!tracks.has(boneName)) tracks.set(boneName, { q: [], p: [] });
        const tr = tracks.get(boneName);
        if (spec.quat) q.copy(spec.quat); else q.identity();
        for (const [axis, angle] of spec.rot || []) q.premultiply(qa.setFromAxisAngle(axis, angle));
        const local = invParent.clone().multiply(q).multiply(b.userData.restWorldQuat);
        tr.q.push(local.x, local.y, local.z, local.w);
        const off = (spec.offset || new V3()).clone().applyQuaternion(invParent);
        const lp = b.userData.restLocalPos.clone().add(off);
        tr.p.push(lp.x, lp.y, lp.z);
      }
    }
    const kf = [];
    for (const [boneName, tr] of tracks) {
      kf.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, tr.q));
      if (tr.p.some((v, i) => Math.abs(v - tr.p[i % 3]) > 1e-6)) kf.push(new THREE.VectorKeyframeTrack(`${boneName}.position`, times, tr.p));
    }
    return new THREE.AnimationClip(name, duration, kf);
  }

  report.rig = { parts: parts.length, tailLen: +tailLen.toFixed(3), pivots: Object.fromEntries(legRigs.map(lr => [lr.name, r3(lr.pivot)])), bones: bones.map(b => b.name) };
  const tailRot = (u, amp, lag) => Object.fromEntries(tailNames.map((n, i) => [n, { rot: [[Y, amp * (0.6 + 0.25 * i) * Math.sin(TAU * u - lag * i)]] }]));

  const idleDuration = 3.2;
  const idle = makeClip('idle', idleDuration, u => ({
    Body: { offset: new V3(0, 0.006 * H * Math.sin(TAU * u), 0) },
    Shoulders: { rot: [[Z, 0.006 * Math.sin(TAU * u + 0.3)]] },
    Neck: { rot: [[Z, -0.012 * Math.sin(TAU * u + 0.5)], [Y, 0.02 * Math.sin(TAU * u + 0.8)]] },
    Head: { rot: [[Z, 0.015 * Math.sin(TAU * u + 1.2)]] },
    ...tailRot(u, 0.03, 0.55),
  }));

  // Walk: a calm four-beat walk in lateral sequence (left hind, left fore, right hind, right fore).
  // A foot that is down stays flat and sweeps back at exactly the body speed, STRIDE per cycle, so
  // nothing slides when the body moves at that speed (dinosaur-assets.js strideLength; the remake
  // measures the same speed from the foot bones). A foot lifts off and sets down straight up and
  // down in the world, and in between swings forward in an arc with the heel peeled up. Each rigid
  // leg reaches its foot from the pivot inside the thigh, lengthening or shortening along its axis
  // where the arc and the ground disagree. A stride this long on short legs needs the lateral
  // sequence: each fore foot lifts before the hind foot behind it comes down.
  const walkDuration = oldClip.walk || 2.917; // the game plays this cycle at 1.12x (audio.js: a footstep every 1.3 s)
  const sweep = STRIDE * DUTY; // backward travel while a foot is down
  const edge = 3 / WALK_KEYS; // share of the cycle for the straight lift-off, and again for the set-down
  const swingT = 1 - DUTY - 2 * edge;
  const reach = sweep / 2 + edge * STRIDE; // the swing runs from -reach to +reach about the stance centre
  const hEdge = 0.012 * H, hTop = 0.05 * H, peel = 0.4; // height after the straight lift, top of the arc; heel-up angle
  const gait = { 'BackLeg.L': 0, 'FrontLeg.L': LAG, 'BackLeg.R': 0.5, 'FrontLeg.R': 0.5 + LAG };
  // Fore feet step a little ahead of the shoulders and hind feet a little behind the hips, which keeps
  // short the swings that squeeze the flank between them (fore leg back, hind leg forward).
  const lean = { front: 0.02 * L, back: -0.02 * L };
  function footPath(p) { // p = 0 at touch-down: x along the body from the stance centre, y above rest, foot pitch a
    if (p < DUTY) return { x: sweep / 2 - p * STRIDE, y: 0, a: 0 };
    const q = p - DUTY;
    if (q < edge) return { x: -sweep / 2 - q * STRIDE, y: hEdge * (q / edge) ** 2, a: 0 };
    const k = q - edge - swingT;
    if (k >= 0) return { x: sweep / 2 + (edge - k) * STRIDE, y: hEdge * ((edge - k) / edge) ** 2, a: 0 };
    const s = (q - edge) / swingT;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h11 = s ** 3 - s ** 2;
    const m = reach; // leaves and arrives moving forward at half the mean swing speed
    return {
      x: -reach * h00 + m * h10 + reach * (1 - h00) + m * h11,
      y: hEdge + (hTop - hEdge) * Math.sin(Math.PI * s),
      a: -peel * Math.sin(Math.PI * Math.min(1, s / 0.75)) ** 2,
    };
  }
  // The body rises over each planted leg and settles between steps, so the hips and shoulders bob
  // twice a cycle, a step apart (which also pitches the body), and it walks a little lower than it
  // stands, which keeps the legs from stretching at full reach. It rolls over the left feet while
  // they alone are down (then over the right ones) and turns its hips with the hind legs. The neck
  // takes out most of the pitch and turn, so the head stays calm.
  const bob = 0.015 * H, crouch = 0.02 * H;
  const bodyRest = byName.Body.userData.restWorldPos;
  const arm = front => legRigs.filter(lr => lr.front === front).reduce((s, lr) => s + lr.pivot.x, 0) / 2 - bodyRest.x;
  const armFront = arm(true), armBack = arm(false);
  function bodyAt(u) {
    const hind = bob * Math.cos(2 * TAU * (u - DUTY / 2));
    const fore = bob * Math.cos(2 * TAU * (u - LAG - DUTY / 2));
    const pitch = (fore - hind) / (armFront - armBack);
    const roll = -0.02 * Math.cos(TAU * (u - (LAG + DUTY) / 2));
    const yaw = -0.025 * Math.cos(TAU * u);
    const rot = [[Z, pitch], [X, roll], [Y, yaw]];
    const q = new THREE.Quaternion();
    for (const [axis, angle] of rot) q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
    return { offset: new V3(0, hind - pitch * armBack - crouch, 0), rot, q, pitch, yaw };
  }
  const DOWN = new V3(0, -1, 0);
  const legStats = Object.fromEntries(legRigs.map(lr => [lr.name, { angle: [Infinity, -Infinity], stretch: [Infinity, -Infinity] }]));
  function legPose(lr, u, body) {
    const path = footPath((((u - gait[lr.name]) % 1) + 1) % 1);
    const foot = lr.foot.userData.restWorldPos, legTop = lr.bone.userData.restWorldPos;
    const target = new V3(foot.x + (lr.front ? lean.front : lean.back) + path.x, foot.y + path.y, foot.z);
    const pivot = lr.pivot.clone().sub(bodyRest).applyQuaternion(body.q).add(bodyRest).add(body.offset);
    const dir = target.clone().sub(pivot);
    const len = dir.length();
    dir.divideScalar(len);
    const quat = new THREE.Quaternion().setFromUnitVectors(DOWN, dir);
    const st = legStats[lr.name];
    const angle = Math.atan2(dir.x, -dir.y), stretch = len - (lr.pivot.y - foot.y);
    st.angle = [Math.min(st.angle[0], angle), Math.max(st.angle[1], angle)];
    st.stretch = [Math.min(st.stretch[0], stretch), Math.max(st.stretch[1], stretch)];
    return {
      [lr.name]: { quat, offset: target.clone().addScaledVector(dir, -(legTop.y - foot.y)).sub(legTop) },
      [lr.foot.name]: { quat: quat.clone().invert().multiply(new THREE.Quaternion().setFromAxisAngle(Z, path.a)) },
    };
  }
  const walk = makeClip('walk', walkDuration, u => {
    const body = bodyAt(u);
    const pose = {
      Body: { offset: body.offset, rot: body.rot },
      Neck: { rot: [[Z, -0.7 * body.pitch + 0.012 * Math.sin(2 * TAU * (u - LAG) + 0.6)], [Y, -0.7 * body.yaw]] },
      Head: { rot: [[Z, -0.015 * Math.sin(2 * TAU * (u - LAG) + 0.9)]] },
      ...tailRot(u, 0.05, 0.7),
    };
    for (const lr of legRigs) Object.assign(pose, legPose(lr, u, body));
    return pose;
  }, WALK_KEYS); // every lift-off and set-down falls on a key
  report.walk = {
    cycle: +walkDuration.toFixed(3), stride: STRIDE, speed: +(STRIDE / walkDuration).toFixed(3), duty: DUTY, lag: LAG,
    legs: Object.fromEntries(Object.entries(legStats).map(([n, s]) => [n, { angleDeg: s.angle.map(a => +THREE.MathUtils.radToDeg(a).toFixed(1)), stretch: s.stretch.map(v => +v.toFixed(3)) }])),
  };

  // --- fitting measurements for the game's scarf and saddle (model space, bind pose) -------------
  const oldPositions = [];
  oldScene.traverse(o => {
    if (!o.isMesh) return;
    const v = new V3();
    for (let i = 0; i < o.geometry.attributes.position.count; i++) oldPositions.push(o.getVertexPosition(i, v.clone()).applyMatrix4(o.matrixWorld));
  });
  const newPositions = [];
  for (const part of parts) {
    const pa = part.geo.attributes.position;
    for (let i = 0; i < pa.count; i++) newPositions.push(new V3().fromBufferAttribute(pa, i));
  }
  const section = (pts, x, half = 0.04) => {
    let ymin = Infinity, ymax = -Infinity, zmin = Infinity, zmax = -Infinity, topCentre = -Infinity;
    for (const q of pts) {
      if (Math.abs(q.x - x) > half) continue;
      ymin = Math.min(ymin, q.y); ymax = Math.max(ymax, q.y); zmin = Math.min(zmin, q.z); zmax = Math.max(zmax, q.z);
      if (Math.abs(q.z) < 0.12) topCentre = Math.max(topCentre, q.y);
    }
    return { x: +x.toFixed(3), y: [+ymin.toFixed(3), +ymax.toFixed(3)], z: [+zmin.toFixed(3), +zmax.toFixed(3)], top: +topCentre.toFixed(3) };
  };
  report.fitting = {
    oldSaddle: section(oldPositions, -0.06), newSaddle: section(newPositions, -0.06),
    oldScarf: section(oldPositions, 0.90), newScarf: [0.55, 0.7, 0.85, 1.0, 1.15].map(x => section(newPositions, x)),
    newBones: Object.fromEntries(['Body', 'Shoulders', 'Neck', 'Head', 'Tail1', 'Tail2'].map(n => [n, r3(byName[n].userData.restWorldPos)])),
    headBox: { min: r3(head.box.min), max: r3(head.box.max) },
  };

  // --- export --------------------------------------------------------------------------------------
  if (LENGTH) {
    // One uniform scale on the root node: skin, skeleton and clips grow together, the stride too.
    geometry.computeBoundingBox();
    const k = LENGTH / (geometry.boundingBox.max.x - geometry.boundingBox.min.x);
    exportRoot.scale.setScalar(k);
    exportRoot.updateMatrixWorld(true);
    report.length = { metres: LENGTH, scale: +k.toFixed(4), stride: +(STRIDE * k).toFixed(3), speed: +((STRIDE * k) / walkDuration).toFixed(3) };
  }
  const glb = await new GLTFExporter().parseAsync(exportRoot, { binary: true, animations: [idle, walk], onlyVisible: true, maxTextureSize: TEX });
  const res = await fetch(`/__bake-output?name=${encodeURIComponent(OUT)}`, { method: 'POST', body: glb });
  if (!res.ok) throw new Error(`upload failed ${res.status}`);
  report.output = { name: OUT, bytes: glb.byteLength, triangles: geometry.index.count / 3, vertices: geometry.attributes.position.count };
  log(report);
}

main().then(() => { window.__bakeStatus = 'done'; }).catch(err => {
  console.error('[bake] failed', err?.stack || err);
  window.__bakeStatus = `error: ${err?.message || err}`;
});
