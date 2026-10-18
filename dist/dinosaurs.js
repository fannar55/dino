import * as THREE from './vendor/three.module.js';
import { createImportedDinosaur, createCelebrationMotion, SAUROPOD_ANATOMY } from './dinosaur-assets.js';
export { preloadDinosaurAssets } from './dinosaur-assets.js';

// Local CC0 animated dinosaurs, with procedural details and species fallbacks.
// +X is forward, +Y is up, and the soles meet Y=0.
const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const SIDE = new THREE.Vector3(0, 0, 1);
const unitSphere = new THREE.SphereGeometry(1, 20, 12);
const detailSphere = new THREE.SphereGeometry(1, 10, 7);
const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
const materialCache = new Map();
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;

function material(color, roughness = .76, metalness = 0) {
  const key = `${color}/${roughness}/${metalness}`;
  if (!materialCache.has(key)) materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  return materialCache.get(key);
}
const M = {
  ivory: material('#f3deb1'), tip: material('#b79b70'), dark: material('#233d37'),
  pupil: material('#11262c', .27), eye: material('#fff0ca', .34), glint: material('#ffffff', .16),
  mouth: material('#503b35'), tongue: material('#cd8272'), tooth: material('#fff0c7'),
  leather: material('#8c4e2b'), leatherDark: material('#573821'), stitch: material('#ddb67d'),
  brass: material('#e8b950', .34, .55), scarf: material('#ee7638'), scarfLight: material('#ffad4d'),
  shirt: material('#f6e3ac'), pants: material('#355774'), boot: material('#654634'),
  skin: material('#f3c6a4'), skinShade: material('#dca483'), hair: material('#d9bd7e'),
  hairLight: material('#eed69c'), hairShade: material('#c4a86f'), childBrow: material('#b59a68'),
  hat: material('#caa15b'), hatBand: material('#79522e'), backpack: material('#c57043'),
};
const palettes = {
  triceratops: ['#469a87', '#9dce9a', '#236e67', '#daab69'],
  stegosaurus: ['#678caa', '#b1c4b2', '#385b82', '#e7a260'],
  brachiosaurus: ['#aa9273', '#e0c79b', '#765f48', '#a96038'],
  trex: ['#ab7d54', '#e1c997', '#725439', '#9d5736'],
  spinosaurus: ['#588f9c', '#b3cfc3', '#305c77', '#d78861'],
  parasaurolophus: ['#af9456', '#e4cc91', '#746741', '#b76640'],
  pteranodon: ['#bd7c56', '#ebc48d', '#784b42', '#d69b70'],
};

function group(parent, name, position = [0, 0, 0]) {
  const g = new THREE.Group(); g.name = name; g.position.set(...position); parent.add(g); return g;
}
function mesh(parent, geometry, mat, position = [0, 0, 0], scale, rotation) {
  const m = new THREE.Mesh(geometry, mat); m.position.set(...position);
  if (scale) m.scale.set(...scale);
  if (rotation) m.rotation.set(...rotation);
  m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function oval(parent, mat, p, s, r, small = false) { return mesh(parent, small ? detailSphere : unitSphere, mat, p, s, r); }

// A smooth, elliptical sweep gives torsos, tails, necks and limbs a continuous
// sculpted surface. Radius changes follow a monotone interpolation: no lumpy
// stacks of spheres and no negative radii at narrow tips.
function sweepGeometry(profiles, steps = 40, sides = 18) {
  const points = profiles.map(p => new THREE.Vector3(p[0], p[1], p[2]));
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const pos = [], normals = [], indices = [], colors = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps, center = curve.getPoint(u), tangent = curve.getTangent(u).normalize();
    // Keep the lateral axis stable through bent knees and a vertical neck.
    // tangent × up flips at a knee, folding adjacent rings through each other.
    const side = SIDE.clone().addScaledVector(tangent, -tangent.z);
    if (side.lengthSq() < .015) side.copy(UP).addScaledVector(tangent, -tangent.y);
    side.normalize();
    const normal = new THREE.Vector3().crossVectors(side, tangent).normalize();
    const f = u * (profiles.length - 1), k = Math.min(profiles.length - 2, Math.floor(f));
    const smooth = (f - k) ** 2 * (3 - 2 * (f - k));
    const ry = mix(profiles[k][3], profiles[k + 1][3], smooth);
    const rz = mix(profiles[k][4] ?? profiles[k][3], profiles[k + 1][4] ?? profiles[k + 1][3], smooth);
    for (let j = 0; j <= sides; j++) {
      const theta = j / sides * TAU, c = Math.cos(theta), s = Math.sin(theta);
      const v = center.clone().addScaledVector(normal, c * ry).addScaledVector(side, s * rz);
      pos.push(v.x, v.y, v.z); normals.push(normal.x * c + side.x * s, normal.y * c + side.y * s, normal.z * c + side.z * s);
      colors.push(1, 1, 1);
      if (i < steps && j < sides) { const a = i * (sides + 1) + j, b = a + sides + 1; indices.push(a, a + 1, b, a + 1, b + 1, b); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices); geo.computeVertexNormals(); return geo;
}
function sweep(parent, profiles, mat, steps = 36, sides = 18) { return mesh(parent, sweepGeometry(profiles, steps, sides), mat); }
function line(parent, points, radius, mat, sides = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return mesh(parent, new THREE.TubeGeometry(curve, Math.max(10, points.length * 5), radius, sides, false), mat);
}
function horn(parent, points, base = .13, mat = M.ivory) {
  return sweep(parent, points.map((p, i) => [...p, Math.max(.001, base * (1 - i / (points.length - 1)) ** .72)]), mat, 20, 12);
}
function bar(parent, a, b, radius, mat) {
  const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
  const m = mesh(parent, unitCylinder, mat, start.clone().add(end).multiplyScalar(.5).toArray(), [radius, delta.length(), radius]);
  m.quaternion.setFromUnitVectors(UP, delta.normalize()); return m;
}
function disk(parent, mat, p, radius, depth, rot = [0, 0, Math.PI / 2]) {
  return mesh(parent, unitCylinder, mat, p, [radius, depth, radius], rot);
}

function tintBody(m, base, belly, dorsal) {
  const p = m.geometry.getAttribute('position'), a = m.geometry.getAttribute('color');
  const baseC = new THREE.Color(base), bellyC = new THREE.Color(belly), dorsalC = new THREE.Color(dorsal), temp = new THREE.Color();
  m.geometry.computeBoundingBox(); const box = m.geometry.boundingBox;
  for (let i = 0; i < p.count; i++) {
    const height = (p.getY(i) - box.min.y) / Math.max(.001, box.max.y - box.min.y);
    temp.copy(baseC);
    if (height < .43) temp.lerp(bellyC, (.43 - height) / .43 * .8);
    if (height > .6) temp.lerp(dorsalC, (height - .6) / .4 * .5);
    a.setXYZ(i, temp.r, temp.g, temp.b);
  }
  const mat = material('#ffffff');
  if (!tintBody.mat) { tintBody.mat = mat.clone(); tintBody.mat.vertexColors = true; }
  m.material = tintBody.mat;
}

// Scales are a single instanced draw per region, with softly varied colour.
function skinScales(parent, samples, base, size = .035) {
  const instance = new THREE.InstancedMesh(detailSphere, material('#ffffff'), samples.length);
  instance.name = 'Raised pebbled skin'; instance.castShadow = false; instance.receiveShadow = true;
  const transform = new THREE.Object3D(), c = new THREE.Color(base);
  samples.forEach((s, i) => {
    transform.position.set(s[0], s[1], s[2]);
    const normal = new THREE.Vector3(s[3] || 0, s[4] || 1, s[5] || 0).normalize();
    transform.quaternion.setFromUnitVectors(UP, normal);
    const r = size * (.78 + (i * 17 % 13) / 24);
    transform.scale.set(r, r * .33, r * .83); transform.updateMatrix(); instance.setMatrixAt(i, transform.matrix);
    const v = .94 + (i * 23 % 19) / 110; instance.setColorAt(i, c.clone().multiplyScalar(v));
  });
  instance.instanceMatrix.needsUpdate = true; parent.add(instance); return instance;
}
function torsoScales(parent, base, length = 1.55, ry = .66, rz = .62, cy = 1.35, cx = -.12) {
  const samples = [];
  // Sample the actual sculpt rather than an approximate ellipse, so the tiny
  // scales sit in the skin along sloping shoulders and the high stegosaur rump.
  const skin = parent.children.find(child => child.isMesh && child.geometry.attributes.color);
  if (skin) {
    const positions = skin.geometry.attributes.position, normals = skin.geometry.attributes.normal;
    for (let i = 0; i < positions.count; i += 3) {
      const x = positions.getX(i), ny = normals.getY(i);
      if (x < cx - length * .47 || x > cx + length * .47 || ny < -.46 || i % 7 === 0) continue;
      const nx = normals.getX(i), nz = normals.getZ(i);
      samples.push([x + nx * .004, positions.getY(i) + ny * .004, positions.getZ(i) + nz * .004, nx, ny, nz]);
    }
  }
  return skinScales(parent, samples, base, .023);
}

function eye(parent, p, side, palette, animations, size = .15, fierce = false) {
  const g = group(parent, 'Gentle expressive eye', p), lid = material(palette[0]);
  oval(g, material(palette[2]), [0, 0, 0], [size * 1.32, size * 1.08, size * .51]);
  const eyeball = group(g, 'Blinking eye');
  oval(eyeball, M.eye, [.012, -.008, side * size * .15], [size, size * .82, size * .56]);
  oval(eyeball, material('#8d9c5c', .35), [size * .27, -.005, side * size * .62], [size * .49, size * .65, size * .16]);
  oval(eyeball, M.pupil, [size * .34, -.001, side * size * .75], [size * .26, size * .46, size * .1]);
  oval(eyeball, M.glint, [size * .42, size * .21, side * size * .83], [size * .12, size * .14, size * .06], null, true);
  line(g, [[-size * .96, size * .25, side * size * .35], [-size * .3, size * (fierce ? .58 : .87), side * size * .45], [size * .63, size * (fierce ? .44 : .6), side * size * .37]], size * .19, lid);
  line(g, [[-size * .75, -size * .51, side * size * .26], [0, -size * .82, side * size * .37], [size * .7, -size * .45, side * size * .27]], size * .1, lid);
  animations.eyes.push(eyeball); return g;
}
function nostrils(parent, x, y, z, size = .044) {
  for (const s of [-1, 1]) {
    oval(parent, M.dark, [x, y, z * s], [size * 1.7, size, size * .65], [0, 0, -.25], true);
  }
}
function mouthLine(parent, points, sides = true, radius = .016) {
  if (sides) for (const s of [-1, 1]) line(parent, points.map(p => [p[0], p[1], p[2] * s]), radius, M.mouth);
  else line(parent, points, radius, M.mouth);
}

function quadrupedLeg(parent, x, z, palette, animations, opts = {}) {
  const { height = 1.12, front = false, width = .24, phase = 0 } = opts;
  const leg = group(parent, front ? 'Foreleg shoulder' : 'Hindleg hip', [x, height, z]);
  sweep(leg, [[0, .13, 0, .11], [0, -.05, 0, width, width * .82], [front ? .03 : -.10, -height * .49, 0, width * .72], [.05, -height + .18, 0, width * .62], [.07, -height + .09, 0, .06]], material(palette[0]), 24, 14);
  oval(leg, material(palette[0]), [.10, -height + .13, .01], [width * 1.05, .13, width * .9]);
  for (let j = -1; j <= 1; j++) oval(leg, M.tip, [.10 + width * .94, -height + .07, j * width * .48], [.083, .068, .064], [0, -.12, 0], true);
  line(leg, [[-.13, -height * .45, z > 0 ? width * .69 : -width * .69], [0, -height * .49, z > 0 ? width * .76 : -width * .76], [.12, -height * .48, z > 0 ? width * .65 : -width * .65]], .012, material(palette[2]));
  animations.legs.push({ g: leg, phase, baseY: height, biped: false }); return leg;
}
function bipedLeg(parent, x, z, palette, animations, phase, long = false) {
  const height = long ? 1.45 : 1.27;
  const leg = group(parent, 'Powerful hip and folded lower leg', [x, height, z]);
  sweep(leg, [[0, .21, 0, .10], [.03, .06, 0, .34, .23], [.28, -.37, 0, .24, .18], [.10, -.74, 0, .12], [-.04, -height + .22, 0, .11], [.02, -height + .11, 0, .075]], material(palette[0]), 30, 16);
  oval(leg, material(palette[1]), [.13, -height + .13, 0], [.25, .105, .19]);
  for (let j = -1; j <= 1; j++) {
    const tz = j * .16;
    sweep(leg, [[.08, -height + .12, tz * .35, .08], [.25, -height + .08, tz, .064], [.42 - Math.abs(j) * .04, -height + .055, tz * 1.12, .034], [.49 - Math.abs(j) * .04, -height + .042, tz * 1.12, .003]], material(palette[0]), 12, 10);
    horn(leg, [[.39 - Math.abs(j) * .04, -height + .07, tz * 1.12], [.48 - Math.abs(j) * .04, -height + .06, tz * 1.15], [.55 - Math.abs(j) * .04, -height + .025, tz * 1.15]], .05, M.tip);
  }
  animations.legs.push({ g: leg, phase, baseY: height, biped: true }); return leg;
}
function tail(parent, profiles, palette, animations, extra) {
  const g = group(parent, 'Flexible tapering tail', profiles[0].slice(0, 3));
  const origin = profiles[0];
  const local = profiles.map(p => [p[0] - origin[0], p[1] - origin[1], p[2] - origin[2], p[3], p[4] ?? p[3]]);
  const m = sweep(g, local, material(palette[0]), 44, 16); tintBody(m, ...palette);
  animations.tails.push(g); if (extra) extra(g); return g;
}

function frill(parent, palette) {
  const g = group(parent, 'Broad scalloped triceratops shield', [-.30, .14, 0]);
  const vertices = [], colors = [], idx = [], rings = 8, count = 64;
  const inner = new THREE.Color(palette[0]), outer = new THREE.Color(palette[3]), middle = new THREE.Color(palette[2]);
  for (let ring = 0; ring <= rings; ring++) for (let j = 0; j <= count; j++) {
    const angle = j / count * TAU, r = Math.max(.002, ring / rings), scallop = 1 + .035 * Math.cos(angle * 13);
    const yy = Math.cos(angle) * .67 * r * scallop, zz = Math.sin(angle) * .96 * r * scallop;
    vertices.push(-.46 * yy + .105 * (1 - r * r), yy + .30, zz);
    const color = inner.clone().lerp(middle, clamp((r - .3) * 1.2, 0, .55)).lerp(outer, clamp((r - .83) * 8, 0, .85));
    colors.push(color.r, color.g, color.b);
    if (ring < rings && j < count) { const a = ring * (count + 1) + j, b = a + count + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .83, side: THREE.DoubleSide }); mesh(g, geo, mat);
  const rim = [], innerRim = [];
  for (let j = 0; j <= 64; j++) {
    const a = j / 64 * TAU, y = Math.cos(a) * .67 * (1 + .035 * Math.cos(a * 13)), z = Math.sin(a) * .96 * (1 + .035 * Math.cos(a * 13));
    rim.push([-.46 * y + .015, y + .3, z]);
    innerRim.push([-.46 * y + .075, y * .83 + .3, z * .83]);
  }
  line(g, rim, .046, material(palette[3])); line(g, innerRim, .015, material(palette[1]));
  for (let j = 0; j < 13; j++) {
    const a = (j / 13) * TAU, y = Math.cos(a) * .695, z = Math.sin(a) * .99;
    if (y < -.43) continue;
    horn(g, [[-.46 * y, y + .3, z], [-.46 * y + .025, y * 1.07 + .3, z * 1.07], [-.46 * y + .04, y * 1.11 + .3, z * 1.11]], .047, M.ivory);
  }
  const spots = [];
  for (const side of [-1, 1]) for (let i = 0; i < 6; i++) {
    const angle = (.22 + i * .19) * side;
    const y = Math.cos(angle) * .47, z = Math.sin(angle) * .72;
    oval(g, material(palette[1]), [-.46 * y + .064, y + .3, z], [.016, .058, .043], [0, 0, -.2], true);
    spots.push([-.46 * y + .08, y + .35, z, 1, 0, 0]);
  }
  skinScales(g, spots, palette[3], .042); return g;
}

function triceratops(root, p, a) {
  const body = group(root, 'Mosi torso', [0, -.08, 0]);
  const torso = sweep(body, [[-1.22, 1.24, 0, .06], [-.96, 1.38, 0, .43, .43], [-.45, 1.42, 0, .69, .69], [.24, 1.39, 0, .68, .64], [.69, 1.42, 0, .48, .48], [.93, 1.46, 0, .28]], material(p[0]), 48, 24);
  tintBody(torso, ...p); torsoScales(body, p[0], 1.65, .68, .68, 1.41, -.23);
  for (const side of [-1, 1]) for (const [x, front] of [[-.70, false], [.49, true]]) quadrupedLeg(root, x, side * .47, p, a, { front, height: 1.04, width: front ? .29 : .32, phase: (front ? 0 : Math.PI) + (side > 0 ? Math.PI : 0) });
  tail(body, [[-1.00, 1.33, 0, .29], [-1.40, 1.27, 0, .21], [-1.83, 1.09, .05, .11], [-2.10, 1.08, .1, .006]], p, a);
  const head = group(root, 'Mosi head with three horns', [.90, 1.25, 0]); a.heads.push(head);
  frill(head, p);
  const skull = sweep(head, [[-.33, .09, 0, .24, .32], [-.08, .22, 0, .43, .43], [.31, .17, 0, .35, .35], [.66, .02, 0, .25, .26], [.90, -.07, 0, .16, .18], [.98, -.13, 0, .02]], material(p[0]), 38, 22); tintBody(skull, ...p);
  oval(head, material(p[1]), [.35, -.17, 0], [.56, .18, .30]);
  for (const side of [-1, 1]) {
    // The brow horns point forward, not vertically like a fantasy dragon.
    horn(head, [[.19, .45, side * .29], [.46, .69, side * .38], [.77, .77, side * .47], [1.04, .79, side * .53]], .14);
    eye(head, [.24, .25, side * .349], side, p, a, .138);
    oval(head, material(p[2]), [-.10, -.055, side * .33], [.15, .18, .10], [0, 0, -.3]);
    line(head, [[.04, -.04, side * .368], [.18, -.13, side * .34], [.30, -.17, side * .30]], .022, material(p[1]));
  }
  horn(head, [[.69, .21, 0], [.84, .44, 0], [.94, .55, 0]], .10);
  sweep(head, [[.73, -.03, 0, .16, .20], [.91, -.04, 0, .13, .17], [1.04, -.16, 0, .065, .11], [1.03, -.24, 0, .008]], M.tip, 20, 14);
  nostrils(head, .73, .035, .215, .032);
  mouthLine(head, [[.24, -.19, .295], [.56, -.22, .235], [.79, -.22, .17], [.98, -.22, .065]], true, .015);
  const scales = [];
  for (const s of [-1, 1]) for (let i = 0; i < 18; i++) {
    const x = .10 + (i % 6) * .11, y = -.015 - Math.floor(i / 6) * .054;
    scales.push([x, y, s * (.37 - x * .20), 0, .15, s]);
  }
  skinScales(head, scales, p[0], .026);
  // Signature knitted orange scarf, including a free fluttering end.
  const scarf = group(root, 'Mosi orange adventure scarf', [.72, 1.31, 0]);
  const scarfPath = []; for (let i = 0; i <= 36; i++) { const t = i / 36 * TAU; scarfPath.push([Math.cos(t) * .105, Math.cos(t) * .45, Math.sin(t) * .48]); }
  line(scarf, scarfPath, .103, M.scarf, 10);
  oval(scarf, M.scarfLight, [.11, -.19, .48], [.16, .13, .10]);
  const flutter = group(scarf, 'Scarf flowing tail', [.02, -.20, .47]);
  sweep(flutter, [[0, 0, 0, .095, .035], [-.16, -.15, .02, .10, .03], [-.31, -.19, .06, .095, .025], [-.44, -.16, .11, .075, .02]], M.scarf, 20, 8);
  a.scarves.push(flutter); a.breath.push(body); return body;
}

function plate(parent, position, width, height, depth, mat, lean = 0) {
  const outline = [[-.50, 0], [-.46, .40], [-.22, .80], [.06, 1], [.34, .71], [.50, .17], [.39, 0]];
  const verts = [], idx = [];
  for (const z of [-depth / 2, depth / 2]) for (const q of outline) verts.push(q[0] * width, q[1] * height, z * (1 - q[1] * .65));
  const n = outline.length;
  for (let i = 1; i < n - 1; i++) { idx.push(0, i + 1, i, n, n + i, n + i + 1); }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; idx.push(i, j, n + i, j, n + j, n + i); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const m = mesh(parent, geo, mat, position, null, [lean, 0, 0]); return m;
}

function stegosaurus(root, p, a) {
  const body = group(root, 'Stegosaurus arched back');
  const torso = sweep(body, [[-1.10, 1.20, 0, .05], [-.81, 1.45, 0, .59, .53], [-.28, 1.51, 0, .75, .68], [.35, 1.23, 0, .53, .47], [.76, 1.01, 0, .24, .24]], material(p[0]), 42, 22); tintBody(torso, ...p);
  for (const s of [-1, 1]) {
    quadrupedLeg(root, -.68, s * .44, p, a, { height: 1.23, width: .27, phase: s > 0 ? 0 : Math.PI });
    quadrupedLeg(root, .58, s * .31, p, a, { height: .89, width: .19, front: true, phase: s > 0 ? Math.PI : 0 });
  }
  tail(body, [[-1.00, 1.3, 0, .29], [-1.48, 1.24, 0, .19], [-1.98, 1.20, .05, .11], [-2.42, 1.3, .09, .017]], p, a, g => {
    for (const s of [-1, 1]) for (const k of [0, 1]) horn(g, [[-.83 - k * .31, -.06, s * .075], [-1.0 - k * .31, .07, s * .29], [-1.15 - k * .31, .16, s * .53]], .075);
  });
  const head = group(root, 'Small low browsing head', [.70, 1.01, 0]); a.heads.push(head);
  sweep(head, [[-.12, 0, 0, .18], [.15, -.09, 0, .22, .18], [.46, -.19, 0, .13, .13], [.70, -.25, 0, .03]], material(p[0]), 24, 16);
  oval(head, material(p[1]), [.44, -.25, 0], [.25, .095, .13]);
  for (const s of [-1, 1]) eye(head, [.17, -.03, s * .17], s, p, a, .077);
  nostrils(head, .56, -.16, .10, .021); mouthLine(head, [[.26, -.24, .14], [.48, -.285, .118], [.65, -.27, .058]], true, .012);
  for (let i = 0; i < 11; i++) {
    const x = -1.22 + i * .215, height = .30 + Math.sin(i / 10 * Math.PI) * .69;
    const y = 1.28 + Math.sin(i / 10 * Math.PI) * .92 - i / 10 * .29;
    const side = i % 2 ? 1 : -1;
    const m = plate(body, [x, y, side * .11], .51, height, .13, material(p[3]), side * .11);
    // Subtle growth ribs give broad plates material detail rather than flat triangles.
    for (let r = -1; r <= 1; r++) line(body, [[x + r * .06, y + .07, side * .19], [x + r * .055, y + height * .41, side * .155], [x + .035, y + height * .80, side * .12]], .009, material('#efc689'));
    m.name = 'Alternating upright back plate';
  }
  torsoScales(body, p[2], 1.45, .67, .63, 1.40, -.23); a.breath.push(body);
}

function brachiosaurus(root, p, a) {
  const body = group(root, 'Brontosaurus broad body and lower front');
  const torso = sweep(body, [[-1.12, 1.64, 0, .08], [-.77, 1.82, 0, .60, .64], [-.16, 1.83, 0, .74, .72], [.50, 1.75, 0, .66, .62], [.92, 1.65, 0, .37, .37]], material(p[0]), 42, 22); tintBody(torso, ...p);
  for (const s of [-1, 1]) {
    quadrupedLeg(root, -.73, s * .46, p, a, { height: 1.65, width: .27, phase: s > 0 ? Math.PI : 0 });
    quadrupedLeg(root, .59, s * .44, p, a, { height: 1.48, width: .28, front: true, phase: s > 0 ? 0 : Math.PI });
  }
  tail(body, [[-1.03, 1.73, 0, .31], [-2.05, 1.40, 0, .20], [-3.05, 1.08, 0, .09], [-4.16, 1.15, .13, .005]], p, a);
  const neck = group(root, 'Substantial gently rising neck', [.66, 1.64, 0]); a.necks.push(neck);
  const neckMesh = sweep(neck, [[0, -.04, 0, .40, .38], [.56, .22, 0, .35, .31], [1.17, .45, 0, .285, .25], [1.88, .76, 0, .225, .20], [2.50, 1.02, 0, .19, .17]], material(p[0]), 56, 20); tintBody(neckMesh, ...p);
  const head = group(neck, 'Brontosaurus small head', [2.50, 1.02, 0]); a.heads.push(head);
  sweep(head, [[-.17, .015, 0, .16], [.025, .13, 0, .23, .21], [.33, .05, 0, .20, .19], [.53, -.025, 0, .09, .15], [.58, -.07, 0, .02]], material(p[0]), 28, 18);
  oval(head, material(p[1]), [.29, -.10, 0], [.27, .10, .18]);
  for (const s of [-1, 1]) eye(head, [.07, .16, s * .18], s, p, a, .09);
  nostrils(head, .39, .13, .13, .023); mouthLine(head, [[.11, -.11, .184], [.36, -.13, .17], [.52, -.10, .112]], true, .012);
  // Irregular warm patches follow both flanks and the neck.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 7; i++) oval(body, material(p[3]), [-.82 + i * .235, 1.91 + .15 * Math.sin(i * 1.9), s * (.59 - Math.abs(i - 3) * .027)], [.14, .21, .013], [0, 0, -.3 + i * .12], true);
    for (let i = 0; i < 7; i++) oval(neck, material(p[3]), [.23 + i * .33, .07 + i * .14, s * (.30 - i * .019)], [.11, .085, .016], [0, 0, -.22], true);
  }
  a.breath.push(body);
}

function theropod(root, p, a, isSpino) {
  const body = group(root, isSpino ? 'Spinosaurus long torso' : 'Tyrannosaurus balanced torso');
  const torso = sweep(body, [[-1.05, 1.41, 0, .12], [-.74, 1.52, 0, .46, .42], [-.15, 1.58, 0, .54, .49], [.45, 1.76, 0, .46, .38], [.73, 1.96, 0, .26, .25]], material(p[0]), 42, 22); tintBody(torso, ...p);
  for (const s of [-1, 1]) bipedLeg(root, -.45, s * .39, p, a, s > 0 ? 0 : Math.PI);
  tail(body, [[-.95, 1.49, 0, .32], [-1.50, 1.43, 0, .22], [-2.10, 1.43, .025, .13], [-2.60, 1.57, .10, .008]], p, a);
  const neck = group(root, 'Curved neck and head', [.64, 1.86, 0]); a.necks.push(neck);
  sweep(neck, [[-.12, -.15, 0, .32, .27], [.035, .16, 0, .32, .27], [.17, .36, 0, .27, .26]], material(p[0]), 25, 18);
  const head = group(neck, isSpino ? 'Long narrow crocodile-like snout' : 'Deep broad tyrannosaur skull', [.10, .31, 0]); a.heads.push(head);
  const length = isSpino ? 1.14 : .83, width = isSpino ? .19 : .31;
  sweep(head, [[-.22, 0, 0, .17, width * .82], [.0, .08, 0, isSpino ? .24 : .32, width], [.32, .05, 0, isSpino ? .15 : .28, width * .97], [length * .82, -.025, 0, isSpino ? .11 : .21, width * .76], [length, -.08, 0, .075, width * .65], [length + .055, -.11, 0, .018]], material(p[0]), 38, 22);
  const jaw = group(head, 'Lower jaw', [-.07, -.15, 0]); a.jaws.push(jaw);
  sweep(jaw, [[-.04, .015, 0, .08, width * .74], [.22, -.075, 0, .095, width * .91], [length * .82, -.09, 0, .07, width * .76], [length + .07, -.035, 0, .015, width * .55]], material(p[1]), 26, 18);
  for (const s of [-1, 1]) {
    mouthLine(head, [[.04, -.14, s * width * .93], [.38, -.15, s * width * .90], [length * .85, -.16, s * width * .73], [length + .035, -.13, s * width * .45]], false, .022);
    eye(head, [.01, isSpino ? .13 : .21, s * width * .93], s, p, a, isSpino ? .096 : .115, true);
    const teeth = isSpino ? 10 : 8;
    for (let i = 0; i < teeth; i++) {
      const x = .20 + i / (teeth - 1) * (length - .22), z = s * width * (1 - (x / length) * .27);
      horn(head, [[x, -.135, z], [x + .004, -.19, z], [x + .019, -.23 + (i % 3) * .008, z]], isSpino ? .027 : .037, M.tooth);
    }
  }
  nostrils(head, length * .87, -.015, width * .74, isSpino ? .024 : .032);
  if (isSpino) {
    for (const s of [-1, 1]) sweep(head, [[-.09, .25, s * .06, .04], [.07, .31, s * .07, .05], [.24, .23, s * .065, .003]], material(p[3]), 14, 10);
  } else {
    for (const s of [-1, 1]) oval(head, material(p[2]), [.025, .34, s * .25], [.17, .085, .08], [0, 0, -.12]);
  }
  // T. rex has two fingers; Spinosaurus has three stronger hooked digits.
  for (const s of [-1, 1]) {
    const arm = group(body, 'Small forearm', [.46, 1.73, s * .31]); a.arms.push({ g: arm, side: s });
    const reach = isSpino ? .34 : .18;
    sweep(arm, [[0, .02, 0, isSpino ? .11 : .07], [.02, -.22, s * .075, .065], [reach, -.29, s * .09, .04]], material(p[0]), 16, 12);
    for (let i = 0; i < (isSpino ? 3 : 2); i++) horn(arm, [[reach - .015, -.28, s * .09 + (i - .7) * .047], [reach + .10, -.30, s * .09 + (i - .7) * .056], [reach + .12, -.37, s * .09 + (i - .7) * .057]], .027, M.tip);
  }
  if (isSpino) {
    const xs = [-1.13, -.92, -.62, -.28, .09, .42, .62], base = [1.63, 1.89, 2.01, 2.06, 2.08, 2.11, 2.08], heights = [.13, .60, 1.02, 1.18, 1.03, .68, .14];
    const verts = [], indices = [], colors = [], c0 = new THREE.Color(p[0]), c1 = new THREE.Color(p[3]);
    for (let i = 0; i < xs.length; i++) for (let j = 0; j < 5; j++) {
      const t = j / 4, c = c0.clone().lerp(c1, Math.min(1, t * 1.3)); verts.push(xs[i], base[i] + heights[i] * t, .012 * Math.sin(i * 1.3)); colors.push(c.r, c.g, c.b);
      if (i < xs.length - 1 && j < 4) { const q = i * 5 + j; indices.push(q, q + 5, q + 1, q + 1, q + 5, q + 6); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.setIndex(indices); geo.computeVertexNormals();
    mesh(body, geo, new THREE.MeshStandardMaterial({ vertexColors: true, color: '#ffffff', side: THREE.DoubleSide, roughness: .85 }));
    for (let i = 0; i < xs.length; i++) line(body, [[xs[i], base[i], .022], [xs[i], base[i] + heights[i] * .5, .022], [xs[i], base[i] + heights[i], .018]], .022, material(p[3]));
    line(body, xs.map((x, i) => [x, base[i] + heights[i], 0]), .035, material(p[3]));
  } else {
    for (const s of [-1, 1]) for (let i = 0; i < 7; i++) oval(body, material(p[2]), [-.82 + i * .20, 1.81 + .04 * i, s * (.37 + Math.sin(i / 6 * Math.PI) * .08)], [.085, .20, .014], [0, 0, -.25], true);
  }
  torsoScales(body, p[0], 1.40, .49, .48, 1.59, -.16); a.breath.push(body);
}

function parasaurolophus(root, p, a) {
  const body = group(root, 'Parasaurolophus rounded pelvis');
  const torso = sweep(body, [[-1.00, 1.32, 0, .10], [-.62, 1.45, 0, .49, .45], [-.1, 1.51, 0, .59, .49], [.41, 1.66, 0, .42, .33], [.64, 1.86, 0, .20]], material(p[0]), 42, 22); tintBody(torso, ...p);
  for (const s of [-1, 1]) bipedLeg(root, -.45, s * .36, p, a, s > 0 ? 0 : Math.PI);
  tail(body, [[-.91, 1.40, 0, .29], [-1.48, 1.28, 0, .19], [-1.97, 1.24, .025, .10], [-2.35, 1.32, .06, .006]], p, a);
  const neck = group(root, 'Upright browsing neck', [.54, 1.74, 0]); a.necks.push(neck);
  sweep(neck, [[-.06, -.10, 0, .30, .27], [.07, .25, 0, .25, .21], [.29, .54, 0, .20, .18]], material(p[0]), 28, 18);
  const head = group(neck, 'Duck bill and backward hollow crest', [.21, .50, 0]); a.heads.push(head);
  sweep(head, [[-.17, .02, 0, .17], [.06, .10, 0, .25, .20], [.37, -.05, 0, .16, .20], [.67, -.17, 0, .07, .27], [.74, -.19, 0, .018]], material(p[0]), 30, 18);
  sweep(head, [[-.04, .24, 0, .13, .095], [-.30, .43, 0, .13, .09], [-.63, .61, 0, .12, .08], [-.96, .63, 0, .09, .065], [-1.14, .54, 0, .012]], material(p[3]), 32, 16);
  line(head, [[-.10, .34, .08], [-.4, .53, .073], [-.77, .65, .058], [-1.08, .57, .025]], .021, material(p[1]));
  oval(head, material(p[1]), [.48, -.20, 0], [.27, .075, .235]);
  for (const s of [-1, 1]) eye(head, [.07, .12, s * .19], s, p, a, .10);
  nostrils(head, .49, -.055, .19, .026); mouthLine(head, [[.22, -.17, .17], [.48, -.235, .23], [.68, -.22, .17]], true, .012);
  for (const s of [-1, 1]) {
    const arm = group(body, 'Slim browsing forearm', [.44, 1.64, s * .30]); a.arms.push({ g: arm, side: s });
    sweep(arm, [[0, .02, 0, .10], [.09, -.32, s * .055, .075], [.27, -.50, s * .065, .048], [.32, -.55, s * .06, .025]], material(p[0]), 20, 12);
    for (let i = 0; i < 3; i++) oval(arm, M.tip, [.33, -.55, s * .06 + (i - 1) * .036], [.047, .028, .018], [0, 0, -.2], true);
    for (let i = 0; i < 6; i++) oval(body, material(p[2]), [-.74 + i * .23, 1.76 + Math.sin(i) * .05, s * (.41 + Math.sin(i / 5 * Math.PI) * .06)], [.095, .17, .018], [0, 0, -.36], true);
  }
  torsoScales(body, p[0], 1.35, .52, .46, 1.50, -.17); a.breath.push(body);
}

function wingMembrane(parent, side, p) {
  // The elongated fourth finger supports a broad continuous membrane; the
  // three small free fingers sit at the wrist, not at the wing tip.
  const rows = [
    [[.12, .02, 0], [-.20, -.04, 0], [-.49, -.14, 0]],
    [[.43, .08, side * .55], [.00, -.10, side * .55], [-.58, -.15, side * .55]],
    [[.63, .12, side * 1.09], [.07, -.08, side * 1.09], [-.71, -.06, side * 1.09]],
    [[.25, .12, side * 1.85], [-.12, .01, side * 1.85], [-.49, .09, side * 1.85]],
    [[-.36, .18, side * 2.67], [-.38, .18, side * 2.67], [-.40, .18, side * 2.67]],
  ];
  const verts = [], indices = [], colors = [], warm = new THREE.Color(p[3]), light = new THREE.Color(p[1]);
  rows.forEach((row, i) => row.forEach((v, j) => {
    verts.push(...v); const c = warm.clone().lerp(light, j === 1 ? .32 : .04); colors.push(c.r, c.g, c.b);
    if (i < rows.length - 1 && j < 2) { const k = i * 3 + j; indices.push(k, k + 3, k + 1, k + 1, k + 3, k + 4); }
  }));
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  mesh(parent, geometry, new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, side: THREE.DoubleSide, roughness: .86 }));
  line(parent, rows.map(r => r[0]), .040, material(p[0])); line(parent, rows.map(r => r[2]), .017, material(p[2]));
  for (let i = 1; i < 4; i++) line(parent, [rows[i][0], rows[i][1], rows[i][2]], .008, material(p[2]), 5);
  for (let i = 0; i < 3; i++) horn(parent, [[.60, .11, side * (1.03 + i * .05)], [.76, .10, side * (1.07 + i * .06)], [.78, .04, side * (1.10 + i * .06)]], .023, M.tip);
}
function pteranodon(root, p, a) {
  const body = group(root, 'Pteranodon streamlined flight body', [0, 1.44, 0]); a.flightBody = body;
  const torso = sweep(body, [[-.70, -.04, 0, .015], [-.48, 0, 0, .18, .19], [-.06, .01, 0, .25, .25], [.32, .10, 0, .19, .17], [.52, .28, 0, .13]], material(p[0]), 32, 18); tintBody(torso, ...p);
  const head = group(body, 'Toothless long beak and swept crest', [.42, .28, 0]); a.heads.push(head);
  sweep(head, [[-.19, .015, 0, .12], [.02, .13, 0, .22, .16], [.28, .11, 0, .14, .13], [.68, .01, 0, .085, .075], [1.11, -.105, 0, .004]], material(p[1]), 34, 18);
  sweep(head, [[-.06, .22, 0, .14, .09], [-.35, .43, 0, .13, .075], [-.72, .52, 0, .08, .04], [-1.05, .53, 0, .003]], material(p[3]), 24, 14);
  for (const s of [-1, 1]) {
    eye(head, [.055, .20, s * .142], s, p, a, .081);
    mouthLine(head, [[.22, .015, s * .127], [.61, -.036, s * .074], [1.08, -.105, s * .005]], false, .009);
    const wing = group(body, 'Membrane wing', [-.07, .12, s * .15]); wingMembrane(wing, s, p); a.wings.push({ g: wing, side: s });
    sweep(body, [[-.38, -.12, s * .15, .08], [-.62, -.44, s * .22, .054], [-.41, -.66, s * .26, .035]], material(p[0]), 16, 10);
    for (let i = 0; i < 3; i++) horn(body, [[-.42, -.64, s * .26 + (i - 1) * .043], [-.24, -.69, s * .26 + (i - 1) * .045], [-.22, -.75, s * .26 + (i - 1) * .045]], .023, M.tip);
  }
  nostrils(head, .32, .14, .094, .016);
}

// One fitted scalp gives the short, fine blond haircut a continuous silhouette.
// Its asymmetric hairline and shallow strands sweep forward and to one side;
// the relief stays in the scalp instead of becoming floating spikes or curls.
function explorerHair(head) {
  const hair = group(head, 'Short side-swept blond hair');
  const point = (theta, phi, lift = 0) => new THREE.Vector3(
    -.008 + (.191 + lift) * Math.sin(theta) * Math.cos(phi),
    .008 + (.216 + lift) * Math.cos(theta),
    (.177 + lift) * Math.sin(theta) * Math.sin(phi));
  const hairline = phi => 1.59 - .53 * Math.max(0, Math.cos(phi))
    + .24 * Math.max(0, -Math.cos(phi)) + .075 * Math.sin(phi) * Math.max(0, Math.cos(phi));
  const positions = [], indices = [], colors = [], rings = 14, sides = 48;
  const warm = new THREE.Color('#d3b57a'), light = new THREE.Color('#ead096'), color = new THREE.Color();
  for (let i = 0; i <= rings; i++) for (let j = 0; j <= sides; j++) {
    const phi = j / sides * TAU, theta = i / rings * hairline(phi), p = point(theta, phi);
    positions.push(p.x, p.y, p.z);
    color.copy(warm).lerp(light, .26 + .5 * Math.max(0, Math.cos(theta)));
    colors.push(color.r, color.g, color.b);
    if (i < rings && j < sides) { const a = i * (sides + 1) + j, b = a + sides + 1; indices.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const scalpMaterial = M.hair.clone(); scalpMaterial.color.set('#ffffff'); scalpMaterial.vertexColors = true;
  mesh(hair, geometry, scalpMaterial).name = 'Close-fitting blond scalp';
  for (let lock = 0; lock < 7; lock++) {
    const phiEnd = -.66 + lock * .20, profiles = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5, phi = phiEnd - .60 * (1 - t), theta = .26 + t * (hairline(phiEnd) - .30);
      const p = point(theta, phi, -.001);
      const radius = i === 5 ? .0006 : .002 + Math.sin(t * Math.PI) * .001;
      profiles.push([...p.toArray(), radius, radius * 3.2]);
    }
    sweep(hair, profiles, lock % 3 ? M.hair : M.hairLight, 22, 6);
  }
  for (let strand = 0; strand < 11; strand++) {
    const phiEnd = -.94 + strand * .19, path = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, phi = phiEnd - .44 * (1 - t);
      path.push(point(.24 + t * (hairline(phiEnd) - .32), phi, .001).toArray());
    }
    line(hair, path, .0012, strand % 3 ? M.hairLight : M.hairShade, 4);
  }
}

function explorerFace(head) {
  // A single continuous head surface carries the soft cheek volume and blush.
  // The face has no separate chin/cheek balls, so side lighting stays gentle.
  const faceGeometry = new THREE.SphereGeometry(1, 36, 24);
  const positions = faceGeometry.getAttribute('position'), colors = [];
  const skin = new THREE.Color('#f3c6a4'), blush = new THREE.Color('#eaa58f'), color = new THREE.Color();
  const facePoint = (y, z) => {
    const yn = y / .205;
    const width = .174 * (1 + .055 * Math.exp(-((yn + .28) ** 2) / .22));
    const xn = Math.sqrt(Math.max(0, 1 - yn * yn - (z / width) ** 2));
    return .185 * xn + .009 * xn ** 4 * Math.exp(-((yn + .28) ** 2) / .26);
  };
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const fy = y * .205, fz = z * .174 * (1 + .055 * Math.exp(-((y + .28) ** 2) / .22));
    const fx = x * .185 + .009 * Math.max(0, x) ** 4 * Math.exp(-((y + .28) ** 2) / .26);
    positions.setXYZ(i, fx, fy, fz);
    const softness = Math.exp(-(((fy + .052) / .047) ** 2) - ((Math.abs(fz) - .110) / .040) ** 2) * Math.max(0, x) * .46;
    color.copy(skin).lerp(blush, softness); colors.push(color.r, color.g, color.b);
  }
  faceGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); faceGeometry.computeVertexNormals();
  const faceMaterial = M.skin.clone(); faceMaterial.color.set('#ffffff'); faceMaterial.vertexColors = true;
  mesh(head, faceGeometry, faceMaterial).name = 'Soft continuous face and cheeks';
  oval(head, M.skin, [.177, -.010, 0], [.028, .032, .030]);
  for (const s of [-1, 1]) {
    oval(head, M.skinShade, [-.024, -.015, s * .174], [.045, .062, .025]);
    oval(head, M.skin, [-.019, -.011, s * .181], [.035, .048, .021]);
    // Shallow eye surfaces follow the cheek-facing normal rather than stacking
    // forward spheres. Their visible depth is less than a centimetre.
    const eye = group(head, 'Soft inset explorer eye', [facePoint(.029, s * .083), .029, s * .083]);
    eye.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, .10, s * .57).normalize());
    oval(eye, M.eye, [-.002, 0, 0], [.007, .030, .027]);
    oval(eye, material('#706d61', .54), [.0035, 0, s * .001], [.003, .023, .019]);
    oval(eye, M.pupil, [.0055, 0, s * .001], [.002, .020, .014]);
    oval(eye, M.glint, [.0073, .009, -s * .003], [.0013, .005, .004], null, true);
    const brow = [[.074, s * .054], [.081, s * .081], [.072, s * .109]];
    line(head, brow.map(([y,z]) => [facePoint(y,z) + .0018,y,z]), .004, M.childBrow);
    const smile = [[-.080,s * .059],[-.092,s * .031],[-.094,0]];
    line(head, smile.map(([y,z]) => [facePoint(y,z) + .0018,y,z]), .0035, material('#ad7462'));
  }
}

function saddleAndRider(root, animations) {
  const saddle = group(root, 'Hand stitched leather explorer saddle', [-.14, 1.96, 0]);
  // Blanket and curved saddle sit on the back, with a broad girth strap.
  sweep(saddle, [[-.52, -.08, 0, .03, .36], [-.38, -.025, 0, .10, .47], [.05, -.015, 0, .10, .45], [.39, -.045, 0, .06, .36], [.46, -.09, 0, .015, .26]], M.scarfLight, 28, 18);
  oval(saddle, M.leather, [-.02, .08, 0], [.45, .095, .35]);
  sweep(saddle, [[-.39, .05, -.31, .06], [-.40, .20, -.17, .075], [-.40, .23, 0, .085], [-.40, .20, .17, .075], [-.39, .05, .31, .06]], M.leatherDark, 22, 12);
  sweep(saddle, [[.29, .02, -.29, .05], [.31, .17, -.14, .07], [.32, .19, 0, .075], [.31, .17, .14, .07], [.29, .02, .29, .05]], M.leather, 22, 12);
  bar(saddle, [.31, .15, -.18], [.31, .15, .18], .037, M.leatherDark);
  for (const s of [-1, 1]) {
    line(saddle, [[-.16, -.055, s * .42], [-.15, -.28, s * .65], [-.10, -.76, s * .58]], .035, M.leatherDark);
    line(saddle, [[.23, -.05, s * .30], [.15, -.36, s * .50], [.12, -.62, s * .52]], .025, M.leather);
    const buckle = group(saddle, 'Brass saddle buckle', [-.15, -.32, s * .65]);
    bar(buckle, [-.065, -.07, 0], [.065, -.07, 0], .012, M.brass); bar(buckle, [-.065, .07, 0], [.065, .07, 0], .012, M.brass);
    bar(buckle, [-.065, -.07, 0], [-.065, .07, 0], .012, M.brass); bar(buckle, [.065, -.07, 0], [.065, .07, 0], .012, M.brass);
    for (let i = 0; i < 11; i++) oval(saddle, M.stitch, [-.37 + i * .066, .04, s * .34], [.012, .008, .01], null, true);
  }
  // Broad girth wraps all the way under the animal instead of floating straps.
  const girth = []; for (let i = 0; i <= 26; i++) { const t = i / 26 * Math.PI; girth.push([-.13, -.61 - Math.sin(t) * .63, Math.cos(t) * .65]); }
  line(saddle, girth, .036, M.leatherDark).name = 'Underbody saddle girth';
  const rider = group(saddle, 'Little Icelandic explorer', [-.06, .09, 0]); animations.rider = rider;
  // Bent trousers and boots on each side of the saddle.
  for (const s of [-1, 1]) {
    sweep(rider, [[-.09, .13, s * .10, .12], [.11, .03, s * .27, .12], [.15, -.21, s * .41, .10], [.13, -.45, s * .45, .071]], M.pants, 24, 14);
    oval(rider, M.boot, [.20, -.48, s * .45], [.16, .092, .086]);
    oval(rider, M.leatherDark, [.21, -.545, s * .45], [.17, .025, .09]);
    line(rider, [[.03, -.49, s * .43], [.08, -.57, s * .47], [.29, -.57, s * .47], [.31, -.49, s * .43]], .014, M.brass);
  }
  // A shaped jacket, collar, pockets, shirt buttons, rolled sleeves and hands.
  sweep(rider, [[-.075, .07, 0, .09, .15], [-.045, .23, 0, .18, .21], [-.035, .50, 0, .175, .23], [.00, .63, 0, .105, .15]], M.shirt, 24, 18);
  for (const s of [-1, 1]) {
    oval(rider, M.hat, [.142, .40, s * .105], [.028, .075, .063]);
    oval(rider, M.hatBand, [.164, .42, s * .102], [.012, .017, .055], null, true);
    const shoulder = group(rider, s === -1 ? 'Explorer waving shoulder' : 'Explorer steady shoulder', [.015, .51, s * .19]);
    const arm = sweep(shoulder, [[0, 0, 0, .086], [.105, -.15, s * .065, .075], [.285, -.24, s * .01, .059]], M.shirt, 20, 14);
    const wrist = group(shoulder, s === -1 ? 'Explorer waving wrist' : 'Explorer steady wrist', [.285, -.24, s * .01]);
    oval(wrist, M.skin, [.035, -.055, -s * .035], [.077, .068, .061]);
    oval(wrist, M.skinShade, [.07, -.07, -s * .045], [.038, .025, .059], null, true);
    for (let i = 0; i < 3; i++) line(wrist, [[.055, -.08 + i * .018, -s * .09], [.085, -.08 + i * .018, -s * .06]], .004, M.skinShade, 4);
    if (s === -1) { animations.waveShoulder = shoulder; animations.waveWrist = wrist; }
    arm.name = 'Sleeve reaching to saddle handle';
    line(rider, [[-.17, .55, s * .14], [.02, .55, s * .18], [.13, .37, s * .18], [-.10, .18, s * .14]], .017, M.leather);
  }
  for (let i = 0; i < 3; i++) oval(rider, M.hatBand, [.154, .28 + i * .1, 0], [.012, .014, .014], null, true);
  oval(rider, M.skin, [.03, .67, 0], [.09, .11, .09]);
  const head = group(rider, 'Egill smiling explorer face', [.04, .84, 0]); animations.childHead = head;
  explorerFace(head);
  explorerHair(head);
  // A small flap backpack, rounded seams and a rolled map finish the character.
  oval(rider, M.backpack, [-.23, .39, 0], [.115, .21, .18]);
  oval(rider, M.leather, [-.29, .50, 0], [.078, .10, .182]);
  line(rider, [[-.32, .46, -.14], [-.35, .35, -.14], [-.32, .23, -.12], [-.32, .23, .12], [-.35, .35, .14], [-.32, .46, .14]], .011, M.stitch);
  oval(rider, M.brass, [-.354, .41, 0], [.016, .033, .03]);
  bar(rider, [-.23, .64, -.20], [-.23, .64, .20], .039, M.shirt);
  for (const s of [-1, 1]) line(rider, [[-.26, .68, s * .12], [-.20, .68, s * .12], [-.19, .60, s * .12], [-.26, .60, s * .12]], .009, M.leather);
}

function updateExplorerWave(details, celebration) {
  if (!details.waveShoulder) return;
  const { lift, wave } = celebration;
  details.waveShoulder.rotation.set(wave * .16, lift * .18, lift * 1.85 + wave * .14);
  details.waveWrist.rotation.set(-lift * .18 - wave * .20, 0, wave * .22);
}

// Merge only direct static mesh children. Animated heads, limbs, eyelids, wings
// and instanced scales keep their own transforms. This retains the sculptural
// detail without a draw call for each button, toe, horn rib or stitch.
function batchStatic(parent) {
  for (const child of [...parent.children]) if (child.isGroup) batchStatic(child);
  const batches = new Map();
  for (const child of parent.children) if (child.isMesh && !child.isInstancedMesh && !Array.isArray(child.material)) {
    const key = `${child.material.uuid}/${child.castShadow}/${child.receiveShadow}`;
    if (!batches.has(key)) batches.set(key, []); batches.get(key).push(child);
  }
  for (const children of batches.values()) {
    if (children.length < 2) continue;
    const positions = [], normals = [], colors = [], indices = []; let offset = 0;
    for (const child of children) {
      child.updateMatrix(); const geo = child.geometry.clone().applyMatrix4(child.matrix), pos = geo.getAttribute('position'), norm = geo.getAttribute('normal'), col = geo.getAttribute('color');
      for (let i = 0; i < pos.count; i++) { positions.push(pos.getX(i), pos.getY(i), pos.getZ(i)); normals.push(norm.getX(i), norm.getY(i), norm.getZ(i)); colors.push(col ? col.getX(i) : 1, col ? col.getY(i) : 1, col ? col.getZ(i) : 1); }
      if (geo.index) for (let i = 0; i < geo.index.count; i++) indices.push(geo.index.getX(i) + offset);
      else for (let i = 0; i < pos.count; i++) indices.push(i + offset);
      offset += pos.count; geo.dispose(); parent.remove(child);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.setIndex(indices); geo.computeBoundingSphere();
    const merged = mesh(parent, geo, children[0].material); merged.name = 'Batched sculpt detail'; merged.castShadow = children[0].castShadow; merged.receiveShadow = children[0].receiveShadow;
  }
}

function dressImportedDinosaur(animal, withRider) {
  const root = animal.group, type = animal.type;
  // Its membrane, eyelids and face are authored into the Pteranodon skin.
  if (type === 'pteranodon') return animal;
  const details = { eyes: [], scarves: [] };
  const headDetail = group(root, 'Warm storybook face');
  const skin = []; root.traverse(o => { if (o.isSkinnedMesh) skin.push(o); });
  const sidePoint = (px, py, side, fallbackZ) => {
    const ray = new THREE.Raycaster(new THREE.Vector3(px, py, side * 5), new THREE.Vector3(0, 0, -side));
    const hit = ray.intersectObjects(skin, false)[0];
    return [px, py, hit ? hit.point.z + side * .004 : side * fallbackZ];
  };
  // Mosi's Tripo3D skin paints its own eyes, smile and nostrils; the other species get fitted storybook eyes.
  const locations = {
    stegosaurus: [1.85, .777, .14, .043],
    trex: [1.65, 2.12, .30, .080],
    parasaurolophus: [1.70, 1.83, .145, .056],
    brachiosaurus: SAUROPOD_ANATOMY.eye,
    spinosaurus: [1.66, 1.335, .15, .058],
  };
  if (locations[type]) {
    const [x, y, z, eyeSize] = locations[type];
    const facePalette = type === 'spinosaurus' ? ['#4e9291', '#b8ceaa', '#376f70'] : palettes[type];
    for (const side of [-1, 1]) eye(headDetail, sidePoint(x, y, side, z), side, facePalette, details, eyeSize);
  }
  const accessoryRoots = [headDetail];
  if (type === 'brachiosaurus') {
    for (const side of [-1, 1]) {
      line(headDetail, [[3.98, 2.26, .12], [4.15, 2.235, .11], [4.31, 2.245, .08]].map(([px, py, pz]) => sidePoint(px, py, side, pz)), .010, M.mouth);
      oval(headDetail, M.dark, sidePoint(4.20, 2.39, side, .11), [.022, .014, .009], [0, 0, -.2], true);
    }
  }
  if (type === 'spinosaurus') {
    for (const side of [-1, 1]) {
      // The nostrils sit back from the long narrow snout's tip.
      oval(headDetail, M.dark, sidePoint(2.23, 1.31, side, .12), [.026, .013, .010], [0, 0, .05], true);
      const scales = [];
      for (let i = 0; i < 14; i++) {
        const px = 1.82 + (i % 7) * .10, py = 1.265 - Math.floor(i / 7) * .035;
        scales.push([...sidePoint(px, py, side, .14), 0, .05, side]);
      }
      skinScales(headDetail, scales, '#8fb5a3', .010);
    }
  }
  if (type === 'triceratops') {
    // The Tripo3D Mosi goes without the knitted scarf; the saddle and rider stay.
    if (withRider) {
      const mount = group(root, 'Explorer saddle attached to Mosi');
      saddleAndRider(mount, details);
      // The Tripo3D Mosi's back is .23 lower at the saddle than the old Quaternius
      // model (centre-line top 1.50 instead of 1.73, bind pose); the scale stays
      // .91 so the rider keeps his size. Mount follows the real Body bone during the walk.
      mount.position.set(.08, -.40, 0); mount.scale.setScalar(.91);
      // Keep the girth under the belly (bottom measured around Y=.46 there).
      mount.getObjectByName('Underbody saddle girth').position.y = .203;
      accessoryRoots.push(mount); animal.attach(mount, 'Body');
    }
  }
  animal.attach(headDetail, 'Head');
  const ownedGeometry = new Set();
  const sharedGeometry = new Set([unitSphere, detailSphere, unitCylinder]);
  for (const detail of accessoryRoots) {
    detail.traverse(o => { if (o.isMesh && !sharedGeometry.has(o.geometry)) ownedGeometry.add(o.geometry); });
    batchStatic(detail);
    detail.traverse(o => { if (o.isMesh && !sharedGeometry.has(o.geometry)) ownedGeometry.add(o.geometry); });
  }
  root.updateMatrixWorld(true);
  animal.bounds = new THREE.Box3().setFromObject(root, true); animal.height = animal.bounds.max.y;
  const updateAnimal = animal.update, disposeAnimal = animal.dispose;
  let disposed = false;
  animal.update = (time, state = {}) => {
    if (disposed) return;
    updateAnimal(time, state);
    const walk = clamp(state.walking || 0, 0, 1), joy = clamp(state.happy || 0, 0, 1);
    const blinkPhase = (time + .71) % 5.7;
    const blink = blinkPhase < .16 ? Math.max(.08, Math.abs(blinkPhase - .08) / .08) : 1;
    for (const eyeGroup of details.eyes) eyeGroup.scale.y = blink;
    for (const scarf of details.scarves) { scarf.rotation.y = Math.sin(time * 3.2) * .11; scarf.rotation.z = Math.sin(time * 2.5) * .07 + walk * .16; }
    if (details.rider) { details.rider.position.y = .09 + Math.abs(Math.sin(time * 6.7)) * walk * .020; details.rider.rotation.z = Math.sin(time * 6.7) * walk * .025; }
    if (details.childHead) { details.childHead.rotation.y = Math.sin(time * .65) * .12; details.childHead.rotation.z = Math.sin(time * .85) * .025 + joy * .05; }
    updateExplorerWave(details, animal.getCelebrationState());
  };
  animal.dispose = () => {
    if (disposed) return; disposed = true;
    for (const detail of accessoryRoots) detail.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
    ownedGeometry.forEach(geometry => geometry.dispose());
    disposeAnimal();
  };
  return animal;
}

export function createDinosaur(type, { rider = false } = {}) {
  const aliases = { mosi: 'triceratops', 't-rex': 'trex', tyrannosaurus: 'trex' };
  type = aliases[type] || type;
  if (!palettes[type]) type = 'triceratops';
  const imported = createImportedDinosaur(type);
  if (imported) return dressImportedDinosaur(imported, rider);
  const root = new THREE.Group(); root.name = `Procedural ${type}`;
  const p = palettes[type], animations = { legs: [], heads: [], necks: [], tails: [], eyes: [], arms: [], scarves: [], wings: [], jaws: [], breath: [] };
  const builders = { triceratops, stegosaurus, brachiosaurus, parasaurolophus, pteranodon };
  if (type === 'trex' || type === 'spinosaurus') theropod(root, p, animations, type === 'spinosaurus');
  else builders[type](root, p, animations);
  if (rider && type === 'triceratops') saddleAndRider(root, animations);
  const sharedGeometry = new Set([unitSphere, detailSphere, unitCylinder]);
  const ownedGeometry = new Set(), ownedMaterials = new Set();
  const sharedMaterials = new Set([...materialCache.values(), tintBody.mat]);
  root.traverse(o => { if (o.isMesh) { if (!sharedGeometry.has(o.geometry)) ownedGeometry.add(o.geometry); if (!sharedMaterials.has(o.material)) ownedMaterials.add(o.material); } });
  batchStatic(root);
  root.traverse(o => { if (o.isMesh && !sharedGeometry.has(o.geometry)) ownedGeometry.add(o.geometry); });
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root), height = bounds.max.y - Math.min(0, bounds.min.y);
  let disposed = false, motionTime = 0, motionWalking = 0;
  const updateCelebration = createCelebrationMotion();
  let celebration = updateCelebration(0, 0);
  return {
    group: root, type, height, bounds,
    getCelebrationState() { return celebration; },
    getMotionState() {
      const duration = type === 'brachiosaurus' ? Math.PI * 2 / 3.1 : .88;
      return { walkPhase: (motionTime / duration) % 1, walkDuration: duration,
        walking: motionWalking, wingPhase: (motionTime * 2.8 / (Math.PI * 2)) % 1,
        wingDuration: Math.PI * 2 / 2.8, flying: type === 'pteranodon' ? 1 : 0, glide: 0 };
    },
    update(time, { walking = 0, happy = 0, look = 0, gazeHeight = 0 } = {}) {
      if (disposed) return;
      motionTime = time; motionWalking = walking;
      celebration = updateCelebration(time, happy);
      const walk = clamp(walking, 0, 1), joy = clamp(happy, 0, 1), pace = time * (type === 'brachiosaurus' ? 3.1 : Math.PI / .44);
      for (const leg of animations.legs) {
        const phase = pace + leg.phase, swing = Math.sin(phase);
        leg.g.rotation.z = swing * (leg.biped ? .30 : .19) * walk;
        leg.g.position.y = leg.baseY + Math.max(0, Math.cos(phase)) * .09 * walk;
      }
      for (let i = 0; i < animations.heads.length; i++) {
        animations.heads[i].rotation.z = Math.sin(time * 1.15 + i) * .022 + celebration.nod * (type === 'triceratops' ? .14 : .075) + clamp(gazeHeight, -1, 1) * .09;
        animations.heads[i].rotation.y = Math.sin(time * .64) * .024 + clamp(look, -1, 1) * .14;
      }
      for (const neck of animations.necks) { neck.rotation.z = Math.sin(time * .83) * .015; neck.rotation.y = Math.sin(time * .56) * .018; }
      for (const t of animations.tails) { t.rotation.y = Math.sin(time * 1.37) * .075 + Math.sin(pace) * walk * .06 + (type === 'triceratops' ? celebration.tail * .12 : 0); t.rotation.z = Math.sin(time * 1.1) * .018; }
      const blinkPhase = (time + .71) % 5.7, blink = blinkPhase < .16 ? Math.max(.08, Math.abs(blinkPhase - .08) / .08) : 1;
      for (const e of animations.eyes) e.scale.y = blink;
      for (const arm of animations.arms) arm.g.rotation.z = Math.sin(pace + arm.side) * walk * .10 + Math.sin(time * 1.4) * .025;
      for (const scarf of animations.scarves) { scarf.rotation.y = Math.sin(time * 3.2) * .11; scarf.rotation.z = Math.sin(time * 2.5) * .075 + walk * .13; }
      for (const b of animations.breath) b.scale.y = 1 + Math.sin(time * 1.6) * .006;
      for (const jaw of animations.jaws) jaw.rotation.z = -Math.max(0, Math.sin(time * 1.05)) * .024 - joy * .075;
      for (const wing of animations.wings) wing.g.rotation.x = wing.side * (Math.sin(time * 2.8) * .20 + .04);
      if (animations.flightBody) animations.flightBody.position.y = 1.44 + Math.sin(time * 2.8 - .7) * .06;
      if (animations.rider) { animations.rider.position.y = .09 + Math.abs(Math.sin(pace)) * walk * .032 + Math.sin(time * 1.6) * .008; animations.rider.rotation.z = Math.sin(pace) * walk * .024; }
      if (animations.childHead) { animations.childHead.rotation.y = Math.sin(time * .55) * .10; animations.childHead.rotation.z = Math.sin(time * .83) * .025 + joy * .05; }
      updateExplorerWave(animations, celebration);
    },
    dispose() {
      if (disposed) return; disposed = true;
      ownedGeometry.forEach(geometry => geometry.dispose()); ownedMaterials.forEach(mat => mat.dispose());
      root.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
      root.removeFromParent();
    },
  };
}
