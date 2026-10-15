import * as THREE from 'three';
import { GLTFLoader } from '../../../dist/vendor/GLTFLoader.js';
import { GLTFExporter } from '../../vendor/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from '../../../dist/vendor/BufferGeometryUtils.js';
import { authorClips } from './biped-clips.js';

// Bakes a biped character for the remake from an unrigged Tripo export kept in parts
// (remake/tools/blender-decimate.py ... parts). It stands the model at the origin facing +X at a
// given height, recognises the parts (head, torso, hips, upper arms, forearms with hands, legs,
// feet), places a humanoid skeleton in the joints, gives every vertex soft skin weights that agree
// across the seams between parts, authors the clips (biped-clips.js) and exports one skinned mesh.
//
// Query: src (parts GLB, relative to this page), out (file name for the upload), height (metres),
// yaw (degrees that turn the model's front to +X; Tripo faces +Z, so 90), tex (texture size),
// roughness, name.
//
// Bones have identity rest rotations, so clips rotate about world-aligned axes: X forward, Y up,
// Z the character's right. The skeleton: root, Hips, Spine, Chest, Neck, Head, Left/RightShoulder,
// Left/RightUpperArm, Left/RightLowerArm, Left/RightHand, Left/RightUpperLeg, Left/RightLowerLeg,
// Left/RightFoot.

const params = new URLSearchParams(location.search);
const SRC = params.get('src') || '../../assets/characters/source/egill-parts.glb';
const OUT = params.get('out') || 'egill.glb';
const HEIGHT = Number(params.get('height') || 1.1);
const YAW = Number(params.get('yaw') || 90);
const TEX = Number(params.get('tex') || 1024);
const ROUGHNESS = Number(params.get('roughness') || 0.65);
const NAME = params.get('name') || 'Egill';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const status = text => { window.__bakeStatus = text; console.log('[bake]', text); };
const fmt = v => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;

function positions(geometry) {
  const p = geometry.attributes.position;
  const out = new Array(p.count);
  for (let i = 0; i < p.count; i++) out[i] = V(p.getX(i), p.getY(i), p.getZ(i));
  return out;
}

// Mean of the vertices within `half` of `value` along an axis (the cross-section's centre there).
function slice(points, axis, value, half) {
  let near = points.filter(p => Math.abs(p[axis] - value) < half);
  if (near.length < 8) near = [...points].sort((a, b) => Math.abs(a[axis] - value) - Math.abs(b[axis] - value)).slice(0, 24);
  return near.reduce((s, p) => s.add(p), V()).divideScalar(near.length);
}

// Centroid of the points of `a` that lie within `radius` of any point of `b`: the seam where two
// parts meet. Grows the radius until enough points are found.
function contact(a, b, radius) {
  for (let r = radius; r < radius * 8; r *= 1.5) {
    const r2 = r * r;
    const near = a.filter(p => b.some(q => p.distanceToSquared(q) < r2));
    if (near.length >= 12) return near.reduce((sum, p) => sum.add(p), V()).divideScalar(near.length);
  }
  throw new Error('parts do not meet');
}
const centroid = points => points.reduce((sum, p) => sum.add(p), V()).divideScalar(points.length);

// Some Tripo parts come with triangles wound against their normals, which a single-sided material
// then hides. Reverse the winding of a part whose faces mostly point against its vertex normals.
function fixWinding(geometry) {
  const index = geometry.index;
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const a = V(), b = V(), c = V(), n = V(), face = V();
  let agree = 0;
  for (let i = 0; i < index.count; i += 3) {
    const [ia, ib, ic] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    face.subVectors(c, b).cross(a.clone().sub(b));
    n.fromBufferAttribute(nor, ia).add(V().fromBufferAttribute(nor, ib)).add(V().fromBufferAttribute(nor, ic));
    agree += Math.sign(face.dot(n));
  }
  if (agree >= 0) return false;
  for (let i = 0; i < index.count; i += 3) {
    const tmp = index.getX(i + 1);
    index.setX(i + 1, index.getX(i + 2));
    index.setX(i + 2, tmp);
  }
  index.needsUpdate = true;
  return true;
}

// Main axis of a part (largest spread), with the extent of the vertices along it.
function principal(points) {
  const mean = points.reduce((s, p) => s.add(p), V()).divideScalar(points.length);
  const c = [0, 0, 0, 0, 0, 0]; // xx, xy, xz, yy, yz, zz
  for (const p of points) {
    const x = p.x - mean.x, y = p.y - mean.y, z = p.z - mean.z;
    c[0] += x * x; c[1] += x * y; c[2] += x * z; c[3] += y * y; c[4] += y * z; c[5] += z * z;
  }
  let axis = V(1, 1, 1).normalize();
  for (let i = 0; i < 60; i++) {
    axis = V(c[0] * axis.x + c[1] * axis.y + c[2] * axis.z, c[1] * axis.x + c[3] * axis.y + c[4] * axis.z, c[2] * axis.x + c[4] * axis.y + c[5] * axis.z).normalize();
  }
  let min = Infinity, max = -Infinity;
  for (const p of points) { const t = p.clone().sub(mean).dot(axis); min = Math.min(min, t); max = Math.max(max, t); }
  return { mean, axis, at: t => mean.clone().addScaledVector(axis, t), min, max };
}

try {
  status('loading');
  const gltf = await new GLTFLoader().loadAsync(SRC);
  gltf.scene.updateMatrixWorld(true);
  const meshes = [];
  gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  const material = meshes[0].material;

  // Stand the model on the ground at the origin, at HEIGHT, facing +X.
  const geoms = meshes.map(m => m.geometry.clone().applyMatrix4(m.matrixWorld));
  const box = new THREE.Box3();
  geoms.forEach(g => { g.computeBoundingBox(); box.union(g.boundingBox); });
  const scale = HEIGHT / (box.max.y - box.min.y);
  const centre = box.getCenter(V());
  const fit = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(YAW))
    .multiply(new THREE.Matrix4().makeScale(scale, scale, scale))
    .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z));
  const parts = geoms.map((g, i) => {
    g.applyMatrix4(fit);
    if (fixWinding(g)) console.log(`[bake] ${meshes[i].name}: winding reversed to match its normals`);
    g.computeBoundingBox();
    const b = g.boundingBox.clone();
    return { name: meshes[i].name, geometry: g, box: b, c: b.getCenter(V()), size: b.getSize(V()), points: positions(g) };
  });
  const H = HEIGHT;

  // Recognise the parts. The character faces +X, so its left side is -Z and its right side +Z.
  const byY = [...parts].sort((a, b) => a.c.y - b.c.y);
  const head = byY.at(-1);
  const feet = byY.slice(0, 2);
  const rest = parts.filter(p => p !== head && !feet.includes(p));
  const limbs = rest.filter(p => Math.abs(p.c.z) > 0.06 * H);
  const middle = rest.filter(p => Math.abs(p.c.z) <= 0.06 * H).sort((a, b) => b.c.y - a.c.y);
  const legs = limbs.filter(p => p.c.y < 0.36 * H);
  const arms = limbs.filter(p => p.c.y >= 0.36 * H).sort((a, b) => Math.abs(a.c.z) - Math.abs(b.c.z));
  const upperArms = arms.slice(0, 2);
  const forearms = arms.slice(2);
  const [torso, hips] = middle;
  if (parts.length !== 11 || feet.some(f => f.c.y > 0.12 * H) || legs.length !== 2 || upperArms.length !== 2 || forearms.length !== 2 || !torso || !hips) {
    throw new Error(`unexpected parts: ${parts.length} parts, ${legs.length} legs, ${arms.length} arm parts, ${middle.length} in the middle`);
  }
  const bySide = list => ({ Left: list.find(p => p.c.z < 0), Right: list.find(p => p.c.z > 0) });
  const foot = bySide(feet), leg = bySide(legs), upper = bySide(upperArms), fore = bySide(forearms);
  const kind = new Map([[head, 'head'], [torso, 'torso'], [hips, 'hips']]);
  for (const s of ['Left', 'Right']) {
    kind.set(foot[s], `foot ${s}`); kind.set(leg[s], `leg ${s}`); kind.set(upper[s], `upperArm ${s}`); kind.set(fore[s], `forearm ${s}`);
  }
  parts.forEach(p => console.log(`[bake] ${p.name}: ${kind.get(p)} centre ${fmt(p.c)} size ${fmt(p.size)}`));

  // Joints.
  const J = { root: V() };
  for (const s of ['Left', 'Right']) {
    const l = leg[s], top = l.box.max.y, bottom = l.box.min.y;
    // Hip joint: at the top of the leg, on the leg's own centre line (the crotch skews the slice).
    J[`${s}UpperLeg`] = slice(l.points, 'y', top - 0.025 * H, 0.012 * H).setZ(l.c.z);
    J[`${s}LowerLeg`] = slice(l.points, 'y', bottom + 0.47 * (top - bottom), 0.012 * H);
    J[`${s}Foot`] = slice(l.points, 'y', bottom + 0.02 * H, 0.01 * H);
  }
  J.Hips = V((J.LeftUpperLeg.x + J.RightUpperLeg.x) / 2, (J.LeftUpperLeg.y + hips.box.max.y) / 2, 0);
  const tb = torso.box, th = tb.max.y - tb.min.y;
  J.Spine = slice(torso.points, 'y', tb.min.y + 0.15 * th, 0.012 * H).setZ(0);
  J.Chest = slice(torso.points, 'y', tb.min.y + 0.55 * th, 0.012 * H).setZ(0);
  J.Neck = contact(head.points, torso.points, 0.012 * H).setZ(0); // the collar seam
  const hb = head.box;
  J.Head = slice(head.points, 'y', hb.min.y + 0.45 * (hb.max.y - hb.min.y), 0.012 * H).setZ(0);
  const axes = {};
  for (const s of ['Left', 'Right']) {
    // Shoulder: a little into the sleeve from its seam with the torso. The bare arm starts where the
    // short sleeve ends (mid upper arm): the elbow lies 28 % and the wrist 70 % of the way from that
    // hem to the fingertips.
    const seam = contact(upper[s].points, torso.points, 0.012 * H);
    const shoulder = seam.clone().lerp(centroid(upper[s].points), 0.3);
    const hem = contact(fore[s].points, upper[s].points, 0.012 * H);
    const tip = fore[s].points.reduce((far, p) => (p.distanceTo(hem) > far.distanceTo(hem) ? p : far));
    const elbowJoint = hem.clone().lerp(tip, 0.28);
    J[`${s}UpperArm`] = shoulder;
    J[`${s}LowerArm`] = elbowJoint;
    J[`${s}Hand`] = hem.clone().lerp(tip, 0.7);
    J[`${s}Shoulder`] = V(J.Chest.x, shoulder.y - 0.01 * H, shoulder.z * 0.35);
    axes[s] = {
      upperOut: elbowJoint.clone().sub(shoulder).normalize(),
      foreOut: tip.clone().sub(elbowJoint).normalize(),
    };
  }
  Object.entries(J).forEach(([n, v]) => console.log(`[bake] joint ${n} ${fmt(v)}`));

  // Bones with identity rest rotations; positions relative to the parent joint.
  const PARENT = {
    Hips: 'root', Spine: 'Hips', Chest: 'Spine', Neck: 'Chest', Head: 'Neck',
    LeftShoulder: 'Chest', LeftUpperArm: 'LeftShoulder', LeftLowerArm: 'LeftUpperArm', LeftHand: 'LeftLowerArm',
    RightShoulder: 'Chest', RightUpperArm: 'RightShoulder', RightLowerArm: 'RightUpperArm', RightHand: 'RightLowerArm',
    LeftUpperLeg: 'Hips', LeftLowerLeg: 'LeftUpperLeg', LeftFoot: 'LeftLowerLeg',
    RightUpperLeg: 'Hips', RightLowerLeg: 'RightUpperLeg', RightFoot: 'RightLowerLeg',
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
  const index = Object.fromEntries(names.map((n, i) => [n, i]));

  // Skin weights. Every blend is a function of the position alone, and the two parts that meet at
  // a seam use the same function there, so the seam moves as one surface.
  const hipBlend = y => ss(J.LeftUpperLeg.y - 0.03 * H, J.LeftUpperLeg.y + 0.03 * H, y); // to Hips, above the leg tops
  const spineT = y => ss(J.Spine.y - 0.04 * H, J.Spine.y + 0.02 * H, y);
  const chestT = y => ss(J.Spine.y + 0.02 * H, J.Chest.y, y);
  const neckT = y => ss(J.Neck.y - 0.03 * H, J.Neck.y + 0.015 * H, y);
  const headT = y => ss(J.Neck.y + 0.01 * H, J.Head.y + 0.01 * H, y);
  const footT = (s, y) => 1 - ss(J[`${s}Foot`].y - 0.012 * H, J[`${s}Foot`].y + 0.018 * H, y);
  const kneeT = (s, y) => ss(J[`${s}LowerLeg`].y - 0.045 * H, J[`${s}LowerLeg`].y + 0.045 * H, y);
  const armT = (s, p) => ss(-0.02 * H, 0.03 * H, p.clone().sub(J[`${s}UpperArm`]).dot(axes[s].upperOut));
  const lowerT = (s, p) => ss(-0.02 * H, 0.025 * H, p.clone().sub(J[`${s}LowerArm`]).dot(axes[s].foreOut));
  const handT = (s, p) => ss(-0.02 * H, 0.02 * H, p.clone().sub(J[`${s}Hand`]).dot(axes[s].foreOut));

  function weights(k, p) {
    const w = {};
    const add = (bone, value) => { if (value > 1e-4) w[bone] = (w[bone] || 0) + value; };
    const [type, s] = k.split(' ');
    const side = s || (p.z < 0 ? 'Left' : 'Right');
    if (type === 'head') {
      const n = neckT(p.y), h = headT(p.y);
      add('Chest', 1 - n); add('Neck', n * (1 - h)); add('Head', n * h);
    } else if (type === 'torso') {
      const sp = spineT(p.y), ch = chestT(p.y), n = neckT(p.y);
      // Only the shoulder cap follows the arm (through the Shoulder bone); the side of the chest stays
      // with the body, so a raised arm does not pull the shirt up into a flap.
      const shoulderZ = Math.abs(J[`${side}UpperArm`].z);
      const fSh = 0.6 * ss(0.55 * shoulderZ, 0.95 * shoulderZ, Math.abs(p.z)) * ss(J[`${side}UpperArm`].y - 0.04 * H, J[`${side}UpperArm`].y + 0.01 * H, p.y);
      const body = 1 - fSh;
      add('Hips', body * (1 - sp)); add('Spine', body * sp * (1 - ch)); add('Chest', body * sp * ch * (1 - n)); add('Neck', body * sp * ch * n);
      add(`${side}Shoulder`, fSh);
    } else if (type === 'hips') {
      const legW = 1 - hipBlend(p.y), sp = spineT(p.y);
      add(`${side}UpperLeg`, legW); add('Spine', (1 - legW) * sp); add('Hips', (1 - legW) * (1 - sp));
    } else if (type === 'leg') {
      const f = footT(side, p.y), kt = kneeT(side, p.y), hb2 = hipBlend(p.y), r = 1 - f;
      add(`${side}Foot`, f); add(`${side}LowerLeg`, r * (1 - kt)); add(`${side}UpperLeg`, r * kt * (1 - hb2)); add('Hips', r * kt * hb2);
    } else if (type === 'foot') {
      const f = footT(side, p.y);
      add(`${side}Foot`, f); add(`${side}LowerLeg`, 1 - f);
    } else if (type === 'upperArm') {
      const lo = lowerT(side, p), a = armT(side, p), r = 1 - lo;
      add(`${side}LowerArm`, lo); add(`${side}UpperArm`, r * a); add(`${side}Shoulder`, r * (1 - a));
    } else if (type === 'forearm') {
      const h = handT(side, p), lo = lowerT(side, p), r = 1 - h;
      add(`${side}Hand`, h); add(`${side}LowerArm`, r * lo); add(`${side}UpperArm`, r * (1 - lo));
    }
    // Keep the four largest, normalised.
    const top = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = top.reduce((sum, [, v]) => sum + v, 0) || 1;
    return top.map(([bone, v]) => [index[bone], v / total]);
  }

  const skinned = parts.map(part => {
    const g = part.geometry;
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    const count = g.attributes.position.count;
    const skinIndex = new Uint16Array(count * 4);
    const skinWeight = new Float32Array(count * 4);
    const k = kind.get(part);
    part.points.forEach((p, i) => {
      weights(k, p).forEach(([b, v], j) => { skinIndex[i * 4 + j] = b; skinWeight[i * 4 + j] = v; });
    });
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
    return g;
  });
  const geometry = mergeGeometries(skinned, false);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  // One matte, single-sided material with the Tripo colour and normal maps.
  const mat = new THREE.MeshStandardMaterial({
    name: `${NAME} skin`, map: material.map, normalMap: material.normalMap || null,
    roughness: ROUGHNESS, metalness: 0, side: THREE.FrontSide,
  });
  if (mat.normalMap) mat.normalScale.set(0.6, 0.6);
  for (const t of [mat.map, mat.normalMap]) if (t) t.userData.mimeType = 'image/jpeg';

  const mesh = new THREE.SkinnedMesh(geometry, mat);
  mesh.name = `${NAME} body`;
  const group = new THREE.Group();
  group.name = NAME;
  group.add(bones.root);
  group.add(mesh);
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(names.map(n => bones[n]));
  mesh.bind(skeleton);

  const clips = authorClips({ bones, joints: J, height: H });
  console.log(`[bake] ${geometry.index.count / 3} triangles, ${names.length} bones, clips: ${clips.map(c => `${c.name} ${c.duration.toFixed(2)} s`).join(', ')}`);

  status('exporting');
  const glb = await new GLTFExporter().parseAsync(group, { binary: true, animations: clips, maxTextureSize: TEX, onlyVisible: true });
  const res = await fetch(`/__bake-output?name=${encodeURIComponent(OUT)}`, { method: 'POST', body: glb });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  status('done');
} catch (error) {
  console.error(error);
  status(`error: ${error.message}`);
}
