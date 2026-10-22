import * as THREE from 'three';
import { lerp, smoothstep } from '../forest/random.js';

// The critters' bodies, built in code (STYLE.md section 2: small, soft, rounded, friendly; section 12: code first, no asset):
// a frog, a snail, a beetle and a little bird, and the Fen's animals (chapter 2: a dragonfly, a diving beetle, a salamander, a
// turtle, an early bird, a fish and a water strider), each ONE vertex-coloured mesh of at most 400 triangles. A model faces +X with its
// feet on y = 0 (the beetle's origin is its middle, `pivot` metres up, which it rolls about). Shapes are rounded blobs with
// smooth normals, coloured a triangle at a time or smoothly where a colour should blend: an eye's pupil is a few black
// triangles, a belly shades into a back. The shapes a critter's reaction needs are morph targets (three's own, so the shadow pass
// has them too): the frog's leap, the snail's hiding and the beetle's two kicks. The bird's wings are tagged for its shader
// (critters.js folds and flaps them).
//
//   createModel('frog') -> { geometry, morphs: ['leap'], tap: [x, y, z], radius, pivot, triangles }

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const colour = hex => new THREE.Color(hex);
const tone = (a, b, k) => colour(a).lerp(colour(b), Math.min(1, Math.max(0, k)));
const mix = (from, to, k) => from.map((v, i) => lerp(v, to[i], k));
const V = (...a) => new THREE.Vector3(...a);

/** The point and the normal on an ellipsoid placed as ellipsoid() places it, at azimuth `psi` about its pole and polar angle `theta`, `out` metres outside it. */
function onEllipsoid({ at = [0, 0, 0], radii, rot = [0, 0, 0] }, psi, theta, out = 0) {
  const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot));
  const u = V(Math.sin(theta) * Math.cos(psi), Math.cos(theta), Math.sin(theta) * Math.sin(psi));
  const n = V(u.x / radii[0], u.y / radii[1], u.z / radii[2]).applyQuaternion(turn).normalize();
  return {
    p: V(u.x * radii[0], u.y * radii[1], u.z * radii[2]).applyQuaternion(turn).add(V(...at)).addScaledVector(n, out).toArray(),
    n: n.toArray(),
  };
}

// ---- a small mesher: triangles with a normal and a colour at each vertex ----------------------------

function createMesher() {
  const position = [];
  const normal = [];
  const color = [];
  const wing = []; // the bird's wing tag, a float for each vertex
  let tag = 0;
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const face = new THREE.Vector3();
  const sum = new THREE.Vector3();
  /** One triangle, wound to face the way its normals do. */
  function triangle(a, b, c, na, nb, nc, ca, cb, cc) {
    face.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    if (face.dot(sum.copy(na).add(nb).add(nc)) < 0) { [b, c] = [c, b]; [nb, nc] = [nc, nb]; [cb, cc] = [cc, cb]; }
    for (const [p, n, k] of [[a, na, ca], [b, nb, cb], [c, nc, cc]]) {
      position.push(p.x, p.y, p.z);
      normal.push(n.x, n.y, n.z);
      color.push(k.r, k.g, k.b);
      wing.push(tag);
    }
  }
  return { triangle, position, normal, color, wing, tag: value => { tag = value; }, get triangles() { return position.length / 9; } };
}

/**
 * An ellipsoid of `radii` ([x, y, z] before it is turned: the y radius runs along the poles) round `at`, its poles on the y axis
 * turned by `rot` (Euler radians) or to point along `pole`. `paint({ n, p, lat, lon })` gives a triangle its colour from its middle: the normal and position in the
 * model's frame, latitude (0 at the pole in +y, 1 at the other) and longitude (0 to 1); with `smooth` it gives each vertex its own.
 * 2 * segments * (rings - 1) triangles.
 */
function ellipsoid(mesh, { at = [0, 0, 0], radii, rot = [0, 0, 0], pole, segments = 10, rings = 5, paint, smooth = false }) {
  const turn = new THREE.Quaternion();
  if (pole) turn.setFromUnitVectors(UP, V(...pole).normalize());
  else turn.setFromEuler(new THREE.Euler(...rot));
  const centre = V(...at);
  const grid = [];
  for (let i = 0; i <= rings; i++) {
    const theta = (Math.PI * i) / rings;
    const row = [];
    for (let j = 0; j < segments; j++) {
      const phi = (TAU * j) / segments;
      const u = V(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
      row.push({
        p: V(u.x * radii[0], u.y * radii[1], u.z * radii[2]).applyQuaternion(turn).add(centre),
        n: V(u.x / radii[0], u.y / radii[1], u.z / radii[2]).applyQuaternion(turn).normalize(),
        lat: i / rings,
        lon: j / segments,
      });
    }
    grid.push(row);
  }
  const info = (...vs) => {
    const p = V();
    const n = V();
    let lat = 0;
    let lon = 0;
    for (const v of vs) { p.add(v.p); n.add(v.n); lat += v.lat; lon += v.lon; }
    return { p: p.divideScalar(vs.length), n: n.normalize(), lat: lat / vs.length, lon: lon / vs.length };
  };
  const at3 = (a, b, c) => {
    if (smooth) mesh.triangle(a.p, b.p, c.p, a.n, b.n, c.n, paint(info(a)), paint(info(b)), paint(info(c)));
    else {
      const k = paint(info(a, b, c));
      mesh.triangle(a.p, b.p, c.p, a.n, b.n, c.n, k, k, k);
    }
  };
  for (let j = 0; j < segments; j++) {
    const j1 = (j + 1) % segments;
    at3(grid[0][j], grid[1][j], grid[1][j1]);
    for (let i = 1; i < rings - 1; i++) {
      at3(grid[i][j], grid[i + 1][j], grid[i + 1][j1]);
      at3(grid[i][j], grid[i + 1][j1], grid[i][j1]);
    }
    at3(grid[rings - 1][j], grid[rings][j], grid[rings - 1][j1]);
  }
}

/** A tapered, rounded-off rod from `from` to `to`: 3 * sides triangles (the end cap at `to`; the other end is hidden). */
function rod(mesh, { from, to, radii, sides = 5, paint }) {
  const a = V(...from);
  const b = V(...to);
  const axis = b.clone().sub(a);
  const length = axis.length();
  axis.divideScalar(length);
  const across = (Math.abs(axis.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0)).cross(axis).normalize();
  const along = axis.clone().cross(across);
  const ring = (centre, radius) => Array.from({ length: sides }, (_, s) => {
    const dir = across.clone().multiplyScalar(Math.cos((TAU * s) / sides)).addScaledVector(along, Math.sin((TAU * s) / sides));
    return { p: centre.clone().addScaledVector(dir, radius), n: dir.clone().multiplyScalar(length).addScaledVector(axis, radii[0] - radii[1]).normalize() };
  });
  const base = ring(a, radii[0]);
  const tip = ring(b, radii[1]);
  const k = paint ?? (() => colour('#ffffff'));
  for (let s = 0; s < sides; s++) {
    const t = (s + 1) % sides;
    const c = k({ p: base[s].p.clone().lerp(tip[t].p, 0.5), n: base[s].n });
    mesh.triangle(base[s].p, tip[s].p, tip[t].p, base[s].n, tip[s].n, tip[t].n, c, c, c);
    mesh.triangle(base[s].p, tip[t].p, base[t].p, base[s].n, tip[t].n, base[t].n, c, c, c);
    const cap = k({ p: b, n: axis });
    mesh.triangle(b, tip[s].p, tip[t].p, axis, axis, axis, cap, cap, cap);
  }
}

/** A flat polygon as a fan from its middle (one triangle a side), `paint(p)` giving each vertex its colour. */
function flat(mesh, points, facing, paint) {
  const corners = points.map(p => V(...p));
  const centre = corners.reduce((sum, p) => sum.add(p), V()).divideScalar(corners.length);
  const n = V(...facing).normalize();
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    mesh.triangle(centre, a, b, n, n, n, paint(centre), paint(a), paint(b));
  }
}

/**
 * A thin ribbon along `line` (points on a surface), `width` wide across the line and along the surface: `normals` are the
 * surface's at each point, so the ribbon lies on it and faces out. 2 triangles a segment.
 */
function ribbon(mesh, line, normals, width, color) {
  const pts = line.map(p => V(...p));
  const ns = normals.map(n => V(...n).normalize());
  const side = pts.map((p, i) => {
    const tangent = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    return ns[i].clone().cross(tangent).normalize().multiplyScalar(width / 2);
  });
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i].clone().add(side[i]);
    const b = pts[i].clone().sub(side[i]);
    const c = pts[i + 1].clone().add(side[i + 1]);
    const d = pts[i + 1].clone().sub(side[i + 1]);
    mesh.triangle(a, b, c, ns[i], ns[i], ns[i + 1], color, color, color);
    mesh.triangle(b, d, c, ns[i], ns[i + 1], ns[i + 1], color, color, color);
  }
}

// ---- the frog ---------------------------------------------------------------------------------------
// 0.2 m of green frog sitting up, with big gold-and-black eyes, a cream belly and a small smile. `leap` (0 to 1) throws the hind legs
// out behind it and the arms up and forward, as it is in the air.

const FROG = { back: '#66ac47', top: '#98d25c', legs: '#58a23f', belly: '#f4edbb', eye: '#f6f1e4', iris: '#f2c443', pupil: '#2b2a1c', mouth: '#2f6a30' };

function buildFrog({ leap = 0 } = {}) {
  const m = createMesher();
  const green = ({ n }) => tone(FROG.back, FROG.top, smoothstep(0.3, 0.95, n.y));
  const body = info => {
    const { n } = info;
    const cream = Math.max(smoothstep(-0.02, -0.3, n.y), smoothstep(0.55, 0.85, n.x) * smoothstep(0.4, -0.1, n.y)); // belly, and a cream chin
    return green(info).lerp(colour(FROG.belly), cream);
  };
  const shape = { at: [-0.004, 0.058, 0], radii: [0.092, 0.058, 0.076], rot: [0, 0, lerp(0.16, 0.1, leap)] };
  ellipsoid(m, { ...shape, segments: 14, rings: 5, paint: body, smooth: true });
  // The eyes bulge from the top of the head: black pupil in front, a gold ring, then the white.
  for (const side of [-1, 1]) {
    ellipsoid(m, {
      at: [0.058, 0.106, 0.042 * side], radii: [0.027, 0.027, 0.027], pole: [1, 0.1, 0.4 * side], segments: 10, rings: 3,
      paint: ({ lat }) => (lat < 0.3 ? colour(FROG.pupil) : lat < 0.62 ? colour(FROG.iris) : colour(FROG.eye)),
    });
  }
  // Hind legs: a round thigh at the back of each side, a splayed foot in front of it. In a leap they trail behind.
  const leg = ({ n }) => tone(FROG.legs, FROG.back, smoothstep(-0.2, 0.9, n.y));
  for (const side of [-1, 1]) {
    ellipsoid(m, { at: mix([-0.052, 0.04, 0.076 * side], [-0.098, 0.052, 0.06 * side], leap), radii: [0.048, 0.036, 0.03], rot: [0, 0, lerp(0.35, -0.2, leap)], segments: 10, rings: 4, paint: leg, smooth: true });
    ellipsoid(m, { at: mix([0.026, 0.008, 0.094 * side], [-0.14, 0.03, 0.05 * side], leap), radii: [0.044, 0.008, 0.024], rot: [0, -0.25 * side, lerp(0, -0.3, leap)], segments: 6, rings: 2, paint: leg });
    // arms: short, down in front of the chest; in a leap up and forward
    ellipsoid(m, { at: mix([0.052, 0.024, 0.05 * side], [0.095, 0.06, 0.044 * side], leap), radii: [0.02, 0.026, 0.014], rot: [0, 0, lerp(0.2, -1.1, leap)], segments: 6, rings: 2, paint: leg, smooth: true });
  }
  // the smile, below the eyes across the front of the head: lowest in the middle, turned up at the corners
  const marks = Array.from({ length: 9 }, (_, i) => {
    const across = (i / 8) * 2 - 1;
    return onEllipsoid(shape, across * 0.95, ((101 - 13 * across * across) * Math.PI) / 180, 0.0015);
  });
  ribbon(m, marks.map(k => k.p), marks.map(k => k.n), 0.0045, colour(FROG.mouth));
  return m;
}

// ---- the snail --------------------------------------------------------------------------------------
// A cream body with two eyes on stalks, under a big shell swirled in orange and cream. `hide` (0 to 1) draws the body, head and
// stalks into the shell.

const SNAIL = { foot: '#ead9ae', footTop: '#d6c293', shellA: '#ee8650', shellB: '#f9ebcb', rim: '#c1673a', eye: '#f6f1e4', pupil: '#2b2a1c' };

function buildSnail({ hide = 0 } = {}) {
  const m = createMesher();
  const into = [0.012, 0.03, 0]; // where everything goes when it hides: under the shell (a stalk keeps a little length: a rod needs a direction)
  const skin = ({ n }) => tone(SNAIL.foot, SNAIL.footTop, smoothstep(0.1, 0.9, n.y));
  // the foot, long and flat on the ground
  ellipsoid(m, { at: mix([0.005, 0.016, 0], [-0.015, 0.02, 0], hide), radii: mix([0.095, 0.016, 0.03], [0.02, 0.012, 0.016], hide), segments: 10, rings: 4, paint: skin, smooth: true });
  // the head, raised in front
  ellipsoid(m, { at: mix([0.088, 0.034, 0], into, hide), radii: mix([0.03, 0.026, 0.023], [0.006, 0.006, 0.006], hide), rot: [0, 0, -0.35], segments: 9, rings: 4, paint: skin, smooth: true });
  // eye stalks with an eye at the end of each
  for (const side of [-1, 1]) {
    const root = mix([0.098, 0.05, 0.011 * side], [into[0], into[1], 0.002 * side], hide);
    const tip = mix([0.116, 0.116, 0.024 * side], [into[0] + 0.002, into[1] + 0.004, 0.003 * side], hide);
    rod(m, { from: root, to: tip, radii: [0.0065, 0.0045], sides: 5, paint: () => colour(SNAIL.footTop) });
    ellipsoid(m, {
      at: mix([0.119, 0.122, 0.025 * side], into, hide), radii: mix([0.0105, 0.0105, 0.0105], [0.0015, 0.0015, 0.0015], hide), pole: [1, 0.1, 0.1 * side], segments: 6, rings: 3,
      paint: ({ lat }) => (lat < 0.45 ? colour(SNAIL.pupil) : colour(SNAIL.eye)),
    });
  }
  // the shell: a round disc on edge over the back, its swirl painted as bands that wind out from the middle of each face
  ellipsoid(m, {
    at: [-0.016, 0.07, 0], radii: [0.062, 0.04, 0.062], rot: [Math.PI / 2, 0, 0], segments: 16, rings: 6,
    paint: ({ lat, lon }) => {
      const face = lat < 0.5 ? lat : 1 - lat; // 0 at the middle of a face, 0.5 at the rim
      if (face > 0.42) return colour(SNAIL.rim);
      const wind = Math.floor(face * 7.5 + (lat < 0.5 ? lon : -lon) * 2);
      return ((wind % 2) + 2) % 2 === 0 ? colour(SNAIL.shellA) : colour(SNAIL.shellB);
    },
  });
  return m;
}

// ---- the beetle -------------------------------------------------------------------------------------
// A round teal beetle with gold spots, a dark head with white eyes and six dark legs (its feet are 0.052 m below its middle, which
// it rolls about). `kickA` and `kickB` (0 to 1) swing the legs one way and the other, for the waving of a beetle on its back.

// The beetle's size where its roll cares: across the body (an ellipse, height by width) and the feet, down and out from its middle.
export const BEETLE_SIZE = { height: 0.043, width: 0.052, feet: [0.052, 0.076] };
const BEETLE = { shell: '#2a9689', shellTop: '#5ec4b2', seam: '#1b5a54', spot: '#f2c443', head: '#2f4747', belly: '#b68b57', leg: '#58412f', eye: '#f6f1e4', pupil: '#1c1c14' };

function buildBeetle({ kickA = 0, kickB = 0 } = {}) {
  const m = createMesher();
  const shell = ({ n }) => {
    const top = tone(BEETLE.shell, BEETLE.shellTop, smoothstep(0.25, 0.95, n.y));
    return top.lerp(colour(BEETLE.belly), smoothstep(-0.3, -0.7, n.y));
  };
  // its poles lie along the body (x), so the radii are in the turned frame: height, length, width
  const shape = { at: [-0.006, 0, 0], radii: [BEETLE_SIZE.height, 0.064, BEETLE_SIZE.width] };
  ellipsoid(m, { ...shape, pole: [1, 0, 0], segments: 12, rings: 5, paint: shell, smooth: true });
  // the seam between the wing cases, a dark line down the middle of the back
  const seam = Array.from({ length: 7 }, (_, i) => onEllipsoid({ ...shape, rot: [0, 0, -Math.PI / 2] }, Math.PI, (0.14 + (i / 6) * 0.72) * Math.PI, 0.0012));
  ribbon(m, seam.map(k => k.p), seam.map(k => k.n), 0.005, colour(BEETLE.seam));
  // two gold spots on the wing cases
  for (const side of [-1, 1]) {
    ellipsoid(m, { at: [-0.014, 0.0345, 0.025 * side], radii: [0.011, 0.008, 0.011], segments: 6, rings: 3, paint: () => colour(BEETLE.spot) });
  }
  ellipsoid(m, { at: [0.058, -0.003, 0], radii: [0.025, 0.026, 0.031], segments: 8, rings: 4, paint: () => colour(BEETLE.head), smooth: true });
  for (const side of [-1, 1]) {
    ellipsoid(m, { at: [0.076, 0.007, 0.018 * side], radii: [0.0105, 0.0105, 0.0105], pole: [1, 0.1, 0.5 * side], segments: 6, rings: 3, paint: ({ lat }) => (lat < 0.42 ? colour(BEETLE.pupil) : colour(BEETLE.eye)) });
    // feelers
    rod(m, { from: [0.076, 0.014, 0.01 * side], to: [0.1, 0.042, 0.026 * side], radii: [0.0035, 0.0025], sides: 4, paint: () => colour(BEETLE.head) });
  }
  // six legs, each out from under the body, bent at the knee and down to the foot, two sets of three that kick in turns
  const legs = [[0.032, 1], [-0.004, -1], [-0.038, 1]]; // [where along it, which kick moves it]
  for (const side of [-1, 1]) {
    legs.forEach(([x, which], i) => {
      const kick = (which === 1) === (side === 1) ? kickA : kickB;
      const reach = i === 0 ? 1 : i === 2 ? -1 : 0.25; // which way the foot reaches along the body
      const hip = [x, -0.026, 0.036 * side];
      const knee = [x + 0.014 * reach + kick * 0.02 * reach, -0.028 + kick * 0.02, 0.064 * side];
      const foot = [x + 0.024 * reach + kick * 0.032 * reach, -BEETLE_SIZE.feet[0] + kick * 0.05, BEETLE_SIZE.feet[1] * side];
      rod(m, { from: hip, to: knee, radii: [0.0055, 0.0042], sides: 3, paint: () => colour(BEETLE.leg) });
      rod(m, { from: knee, to: foot, radii: [0.0042, 0.003], sides: 3, paint: () => colour(BEETLE.leg) });
    });
  }
  return m;
}

// ---- the bird ---------------------------------------------------------------------------------------
// A plump little finch, 0.14 m long: warm brown back, orange breast, cream belly, a gold beak and two dark round eyes, with its
// wings tagged (+1 right, -1 left) for the shader to fold and flap about the shoulder, and its tail a flat fan.

export const BIRD = {
  shoulder: [0, 0.078, 0.028], // where a wing joins the body (the right one; the left mirrors z)
  fold: { rotation: [Math.PI / 2, 0, -1.13], offset: [0, -0.022, 0.016] }, // how a perched bird holds a wing: Rz(rotation[2]) * Rx(rotation[0]), then moved down and out
};
const BIRD_COLOURS = { back: '#9a7556', cap: '#7f6049', breast: '#ee8352', belly: '#f4e7c6', wing: '#7a5a40', tip: '#d8b27a', beak: '#f2c443', eye: '#231c14', tail: '#6e5440' };

function buildBird() {
  const m = createMesher();
  ellipsoid(m, {
    at: [0, 0.05, 0], radii: [0.062, 0.05, 0.045], rot: [0, 0, 0.25], segments: 12, rings: 6, smooth: true,
    paint: ({ n }) => {
      const breast = smoothstep(0.1, 0.6, n.x) * smoothstep(0.6, 0.15, n.y);
      const belly = smoothstep(-0.25, -0.65, n.y);
      return colour(BIRD_COLOURS.back).lerp(colour(BIRD_COLOURS.breast), breast).lerp(colour(BIRD_COLOURS.belly), belly);
    },
  });
  ellipsoid(m, {
    at: [0.05, 0.092, 0], radii: [0.034, 0.032, 0.031], segments: 10, rings: 5, smooth: true,
    paint: ({ n }) => colour(BIRD_COLOURS.cap).lerp(colour(BIRD_COLOURS.breast), smoothstep(0.0, -0.4, n.y) * smoothstep(0.0, 0.5, n.x)),
  });
  for (const side of [-1, 1]) {
    ellipsoid(m, { at: [0.07, 0.1, 0.022 * side], radii: [0.007, 0.007, 0.007], segments: 5, rings: 2, paint: () => colour(BIRD_COLOURS.eye) });
  }
  rod(m, { from: [0.079, 0.089, 0], to: [0.1, 0.087, 0], radii: [0.011, 0.004], sides: 5, paint: () => colour(BIRD_COLOURS.beak) });
  flat(m, [[-0.05, 0.062, -0.012], [-0.05, 0.062, 0.012], [-0.125, 0.07, 0.026], [-0.135, 0.072, 0], [-0.125, 0.07, -0.026]], [0, 1, 0], p => tone(BIRD_COLOURS.tail, BIRD_COLOURS.wing, smoothstep(-0.13, -0.05, p.x)));
  // wings, flat and spread (the flight pose; critters.js folds them for a bird at rest)
  const outline = [[0.022, 0], [0.028, 0.045], [0.012, 0.1], [-0.02, 0.118], [-0.048, 0.075], [-0.04, 0]]; // [forward, out] from the shoulder
  for (const side of [-1, 1]) {
    m.tag(side);
    const corners = outline.map(([x, out]) => [BIRD.shoulder[0] + x, BIRD.shoulder[1], BIRD.shoulder[2] * side + out * side]);
    flat(m, corners, [0, 1, 0], p => tone(BIRD_COLOURS.wing, BIRD_COLOURS.tip, smoothstep(0.03, 0.14, Math.abs(p.z) - BIRD.shoulder[2])));
  }
  m.tag(0);
  return m;
}

// ---- the Fen's animals (chapter 2) -------------------------------------------------------------------
// Animals that lived in the wetlands of the dinosaurs' time, each its own shape first (STYLE.md: science first, then friendly):
// a dragonfly with two pairs of wings, a diving beetle (brunnklukka) with oar legs, a newt-like salamander, a turtle that draws
// its head in, an early bird (fornfugl) with feathers, clawed wings and a long feathered tail like Archaeopteryx, a fish with
// heavy shining scales like Lepidotes, and a water strider standing on the water on long legs. Each faces +X with its lowest point
// on y = 0, one mesh of at most 400 triangles, a little larger than life so a child sees it (as chapter 1's frog is).

/** A flat polygon seen from both sides (two fans, back to back), for a fin on a critter drawn one side only. */
function flat2(mesh, points, facing, paint) {
  flat(mesh, points, facing, paint);
  flat(mesh, [...points].reverse(), facing.map(v => -v), paint);
}

// The dragonfly: 0.15 m long, its wings 0.22 m across, flat out at rest as a dragonfly holds them. `hover` (0 to 1) tucks its legs
// up and lifts its tail a little, as it hangs in the air. Its four wings are tagged for the wing shader (+1 right, -1 left), and turn
// about the line along its back at DRAGONFLY.shoulder.
export const DRAGONFLY = { shoulder: [0, 0.046, 0.006] };
const DRAGON = { thorax: '#4f9e4c', thoraxTop: '#7cc45e', eye: '#3aa6b5', eyeTop: '#8fd8de', tail: '#2f86bd', band: '#246b98', wing: '#e7f3f5', vein: '#b9d3d8', spot: '#3a3226', leg: '#2a2a22' };

function buildDragonfly({ hover = 0 } = {}) {
  const m = createMesher();
  ellipsoid(m, { at: [0, 0.032, 0], radii: [0.023, 0.016, 0.015], segments: 8, rings: 4, smooth: true, paint: ({ n }) => tone(DRAGON.thorax, DRAGON.thoraxTop, smoothstep(-0.2, 0.8, n.y)) });
  ellipsoid(m, { at: [0.03, 0.034, 0], radii: [0.012, 0.013, 0.015], segments: 6, rings: 3, smooth: true, paint: () => colour(DRAGON.thorax) });
  for (const side of [-1, 1]) {
    ellipsoid(m, { at: [0.035, 0.039, 0.011 * side], radii: [0.011, 0.012, 0.011], segments: 6, rings: 3, smooth: true, paint: ({ n }) => tone(DRAGON.eye, DRAGON.eyeTop, smoothstep(0.2, 0.9, n.y)) });
  }
  // the long tail in four pieces, blue with dark rings, a little up at the tip as it hovers
  const joints = [0, 1, 2, 3, 4].map(i => [-0.02 - i * 0.025, 0.031 + hover * 0.004 * i * i * 0.4, 0]);
  for (let i = 0; i < 4; i++) {
    rod(m, { from: joints[i], to: joints[i + 1], radii: [0.0075 - i * 0.0011, 0.0064 - i * 0.0011], sides: 5, paint: () => colour(i % 2 ? DRAGON.band : DRAGON.tail) });
  }
  // six legs under the thorax, down to the ground perched, tucked up in the air
  for (const side of [-1, 1]) {
    [0.012, 0.002, -0.008].forEach((x, i) => {
      const hip = [x, 0.022, 0.006 * side];
      const foot = mix([x + (1 - i) * 0.012, 0.0016, 0.022 * side], [x + 0.004, 0.017, 0.01 * side], hover);
      rod(m, { from: hip, to: foot, radii: [0.0022, 0.0016], sides: 3, paint: () => colour(DRAGON.leg) });
    });
  }
  // two pairs of wings, flat out from the back; a dark spot near each tip (the pterostigma)
  const [sx, sy, sz] = DRAGONFLY.shoulder;
  const forewing = [[0.008, 0], [0.012, 0.05], [0.008, 0.1], [-0.002, 0.108], [-0.008, 0.06], [-0.006, 0]];
  const hindwing = [[-0.004, 0], [-0.001, 0.05], [-0.006, 0.098], [-0.016, 0.104], [-0.026, 0.06], [-0.02, 0]];
  for (const side of [-1, 1]) {
    m.tag(side);
    for (const [outline, at] of [[forewing, 0.006], [hindwing, -0.004]]) {
      const corners = outline.map(([x, out]) => [sx + at + x, sy, (sz + out) * side]);
      flat(m, corners, [0, 1, 0], p => tone(DRAGON.wing, DRAGON.vein, smoothstep(0.02, 0.1, Math.abs(p.z))));
      const tip = outline[2];
      flat(m, [[sx + at + tip[0] - 0.004, sy + 0.0004, (sz + tip[1] - 0.012) * side], [sx + at + tip[0] + 0.002, sy + 0.0004, (sz + tip[1] - 0.012) * side], [sx + at + tip[0] - 0.001, sy + 0.0004, (sz + tip[1] - 0.002) * side]], [0, 1, 0], () => colour(DRAGON.spot));
    }
  }
  m.tag(0);
  return m;
}

// The diving beetle (brunnklukka): 0.11 m long, a smooth, flat oval of dark olive with a gold rim, made to swim; its hind legs
// are flat oars. `paddle` (0 to 1) sweeps the oars back.
const DIVER = { back: '#273024', backTop: '#3d4a32', rim: '#c9a640', belly: '#5a4128', head: '#2b3326', eye: '#e9dfb8', pupil: '#16160f', leg: '#5a4128' };

function buildWaterBeetle({ paddle = 0 } = {}) {
  const m = createMesher();
  const shell = ({ n }) => {
    const back = tone(DIVER.back, DIVER.backTop, smoothstep(0.5, 1, n.y));
    const rim = smoothstep(0.55, 0.85, Math.abs(n.z)) * smoothstep(-0.25, 0.1, n.y) * smoothstep(0.55, 0.2, n.y);
    return back.lerp(colour(DIVER.rim), rim).lerp(colour(DIVER.belly), smoothstep(-0.2, -0.6, n.y));
  };
  ellipsoid(m, { at: [-0.008, 0.021, 0], radii: [0.021, 0.05, 0.034], pole: [1, 0, 0], segments: 14, rings: 5, smooth: true, paint: shell });
  ellipsoid(m, { at: [0.038, 0.02, 0], radii: [0.016, 0.014, 0.027], segments: 10, rings: 4, smooth: true, paint: shell });
  ellipsoid(m, { at: [0.055, 0.018, 0], radii: [0.012, 0.011, 0.018], segments: 8, rings: 3, smooth: true, paint: () => colour(DIVER.head) });
  for (const side of [-1, 1]) {
    ellipsoid(m, { at: [0.061, 0.022, 0.012 * side], radii: [0.006, 0.006, 0.006], pole: [1, 0.2, 0.5 * side], segments: 5, rings: 3, paint: ({ lat }) => (lat < 0.4 ? colour(DIVER.pupil) : colour(DIVER.eye)) });
    // the front and middle legs, short, out to the sides
    for (const [x, reach] of [[0.032, 1], [0.012, 0.3]]) {
      rod(m, { from: [x, 0.012, 0.022 * side], to: [x + 0.014 * reach, 0.006, 0.05 * side], radii: [0.003, 0.0022], sides: 3, paint: () => colour(DIVER.leg) });
    }
    // the hind legs: long, flat oars at the end, swept back as it strokes
    const knee = [-0.012, 0.012, 0.038 * side];
    const tip = mix([0.006, 0.01, 0.085 * side], [-0.07, 0.01, 0.06 * side], paddle);
    rod(m, { from: [0.004, 0.012, 0.02 * side], to: knee, radii: [0.0034, 0.0028], sides: 3, paint: () => colour(DIVER.leg) });
    rod(m, { from: knee, to: tip, radii: [0.0028, 0.0022], sides: 3, paint: () => colour(DIVER.leg) });
    const along = [tip[0] - knee[0], tip[2] - knee[2]];
    const len = Math.hypot(...along);
    const ax = along[0] / len, az = along[1] / len;
    const oar = [[0, 0], [0.45, 0.012], [1, 0.006], [1, -0.006], [0.45, -0.012]].map(([t, w]) => [knee[0] + (tip[0] - knee[0]) * (0.35 + 0.65 * t) - az * w, 0.011, knee[2] + (tip[2] - knee[2]) * (0.35 + 0.65 * t) + ax * w]);
    flat2(m, oar, [0, 1, 0], () => colour(DIVER.rim).lerp(colour(DIVER.leg), 0.5));
  }
  return m;
}

// The salamander: 0.24 m from its nose to the tip of its tail, newt-like: dark olive back with gold spots, an orange belly, short
// splayed legs and a long tail. walkA and walkB put one pair of corners forward and bend the body to the other side, in turn, as
// it crawls; `curl` turns its head and curls its tail to the side, as it rests.
const NEWT = { back: '#4c4a2d', backTop: '#5f5c37', belly: '#e2833a', spot: '#d8b23e', eye: '#1c1a12', shine: '#f6f1e4', leg: '#4c4a2d' };

function buildSalamander({ walkA = 0, walkB = 0, curl = 0 } = {}) {
  const m = createMesher();
  const bend = walkA - walkB; // + bends the middle to the left (+z)
  const skin = ({ n, p }) => {
    const back = tone(NEWT.back, NEWT.backTop, smoothstep(0.4, 0.95, n.y));
    const spot = n.y > 0.55 && Math.sin(p.x * 260) * Math.sin(p.z * 330 + p.x * 90) > 0.82 ? 1 : 0;
    return back.lerp(colour(NEWT.spot), spot).lerp(colour(NEWT.belly), smoothstep(-0.05, -0.45, n.y));
  };
  const look = 0.012 * curl;
  ellipsoid(m, { at: [0.086, 0.019, look], radii: [0.026, 0.015, 0.02], rot: [0, -0.5 * curl, 0], segments: 10, rings: 4, smooth: true, paint: skin });
  ellipsoid(m, { at: [0.046, 0.018, 0.006 * bend], radii: [0.034, 0.016, 0.019], segments: 10, rings: 4, smooth: true, paint: skin });
  ellipsoid(m, { at: [0.002, 0.017, -0.006 * bend], radii: [0.032, 0.015, 0.018], segments: 10, rings: 4, smooth: true, paint: skin });
  for (const side of [-1, 1]) {
    ellipsoid(m, { at: [0.1, 0.027, (0.012 + (side > 0 ? look * 0.6 : 0)) * side + look * 0.5], radii: [0.006, 0.006, 0.006], segments: 5, rings: 3, paint: ({ n }) => (n.y > 0.7 && n.x > 0.2 ? colour(NEWT.shine) : colour(NEWT.eye)) });
  }
  // the tail, swinging the other way to the body's bend, and curled to the side at rest
  const tail = [0, 1, 2, 3].map(i => [-0.025 - i * 0.042, 0.014 - i * 0.003, (0.008 * bend + 0.03 * curl) * i * (i + 1) * 0.25]);
  for (let i = 0; i < 3; i++) rod(m, { from: tail[i], to: tail[i + 1], radii: [0.013 - i * 0.004, 0.009 - i * 0.004], sides: 5, paint: skin });
  // four short legs, out to the sides and down, the diagonal pair forward in a step
  const legs = [[0.054, 1, walkA], [0.054, -1, walkB], [-0.006, 1, walkB], [-0.006, -1, walkA]];
  for (const [x, side, step] of legs) {
    const hip = [x, 0.014, 0.014 * side];
    const elbow = [x + 0.01 * step, 0.016, 0.03 * side];
    const foot = [x + 0.018 * step - 0.004, 0.0035, 0.034 * side];
    rod(m, { from: hip, to: elbow, radii: [0.0055, 0.0045], sides: 3, paint: () => colour(NEWT.leg) });
    rod(m, { from: elbow, to: foot, radii: [0.0045, 0.0035], sides: 3, paint: () => colour(NEWT.leg) });
  }
  return m;
}

// The turtle: a shell 0.32 m long, domed and olive with paler rims to its plates, a pale belly, a grey-green head with a yellow
// stripe, four stout legs. `hide` draws its head and legs into the shell; `look` turns its head to its left.
const TURTLE = { shell: '#6b6436', shellTop: '#7d7540', rim: '#b0a45e', edge: '#4f4a2a', belly: '#d8c98a', skin: '#7f8a5e', stripe: '#d9c45a', eye: '#1c1a12' };

function buildTurtle({ hide = 0, look = 0 } = {}) {
  const m = createMesher();
  ellipsoid(m, {
    at: [0, 0.076, 0], radii: [0.16, 0.068, 0.125], segments: 14, rings: 5,
    paint: ({ n, lat, lon }) => {
      const plate = Math.abs(((lon * 8 + (lat < 0.4 ? 0.5 : 0)) % 1) - 0.5) < 0.08 || Math.abs(lat - 0.38) < 0.05;
      const base = tone(TURTLE.edge, TURTLE.shellTop, smoothstep(-0.1, 0.8, n.y));
      return plate ? base.lerp(colour(TURTLE.rim), 0.7) : base;
    },
  });
  ellipsoid(m, { at: [0, 0.05, 0], radii: [0.142, 0.026, 0.108], segments: 10, rings: 3, paint: () => colour(TURTLE.belly) });
  // head on its neck, out in front, or in the shell
  const turn = look * 0.6;
  const neckEnd = mix([0.19, 0.074, 0.025 * turn], [0.13, 0.068, 0], hide);
  const head = mix([0.215, 0.078, 0.06 * turn], [0.135, 0.07, 0], hide);
  rod(m, { from: [0.12, 0.066, 0], to: neckEnd, radii: [0.024, 0.022], sides: 6, paint: () => colour(TURTLE.skin) });
  ellipsoid(m, {
    at: head, radii: mix([0.036, 0.026, 0.027], [0.02, 0.016, 0.016], hide), rot: [0, -turn, 0], segments: 8, rings: 4, smooth: true,
    paint: ({ n }) => (Math.abs(n.z) > 0.55 && Math.abs(n.y) < 0.25 ? colour(TURTLE.stripe) : colour(TURTLE.skin)),
  });
  for (const side of [-1, 1]) {
    const at = [head[0] + 0.02 * (1 - hide), head[1] + 0.009, head[2] + 0.017 * side * (1 - hide * 0.6)];
    ellipsoid(m, { at, radii: [0.0055, 0.0055, 0.0055], segments: 5, rings: 3, paint: () => colour(TURTLE.eye) });
  }
  // four stout legs at the corners, drawn in when it hides
  for (const [x, side] of [[0.09, 1], [0.09, -1], [-0.09, 1], [-0.09, -1]]) {
    const out = mix([x * 1.08, 0.025, 0.1 * side], [x * 0.85, 0.045, 0.075 * side], hide);
    ellipsoid(m, { at: out, radii: mix([0.034, 0.025, 0.026], [0.02, 0.016, 0.016], hide), segments: 6, rings: 3, smooth: true, paint: () => colour(TURTLE.skin) });
  }
  rod(m, { from: [-0.14, 0.05, 0], to: mix([-0.19, 0.035, 0], [-0.15, 0.045, 0], hide), radii: [0.012, 0.006], sides: 4, paint: () => colour(TURTLE.skin) });
  return m;
}

// The early bird (fornfugl), Archaeopteryx's kind: 0.45 m from its snout to the tip of its long feathered tail, a dark bird with
// paler tips to its feathers, claws on its wings and a snout with tiny teeth. Its wings are tagged (+1 right, -1 left) for the wing
// shader, which folds them along its sides at rest (EARLY_BIRD.fold) and beats them in flight; `look` turns its head to its left.
export const EARLY_BIRD = {
  shoulder: [0.03, 0.15, 0.04],
  fold: { rotation: [Math.PI / 2, 0, -1.2], offset: [0, -0.03, 0.012] },
};
const FORN = { back: '#3c3e46', belly: '#7b7d84', head: '#4a4c54', face: '#9a8f80', beak: '#2a2a2e', eye: '#d8a23a', pupil: '#16160f', wing: '#33353d', tip: '#8d8f96', tail: '#2f3138', tailTip: '#9a9ca2', leg: '#5a4c3e' };

function buildEarlyBird({ look = 0 } = {}) {
  const m = createMesher();
  ellipsoid(m, {
    at: [0, 0.12, 0], radii: [0.085, 0.06, 0.05], rot: [0, 0, 0.35], segments: 10, rings: 5, smooth: true,
    paint: ({ n }) => tone(FORN.back, FORN.belly, smoothstep(0.1, -0.6, n.y)),
  });
  const turn = look * 0.7;
  const head = [0.088, 0.19, 0.03 * look];
  rod(m, { from: [0.045, 0.145, 0], to: [head[0] - 0.012, head[1] - 0.01, head[2] * 0.6], radii: [0.03, 0.026], sides: 5, paint: () => colour(FORN.head) });
  ellipsoid(m, { at: head, radii: [0.04, 0.034, 0.031], rot: [0, -turn, 0], segments: 8, rings: 4, smooth: true, paint: ({ n }) => tone(FORN.head, FORN.face, smoothstep(0.3, 0.9, n.x)) });
  const snout = [head[0] + Math.cos(turn) * 0.072, head[1] - 0.006, head[2] + Math.sin(turn) * 0.072];
  rod(m, { from: [head[0] + Math.cos(turn) * 0.03, head[1] - 0.004, head[2] + Math.sin(turn) * 0.03], to: snout, radii: [0.013, 0.005], sides: 4, paint: () => colour(FORN.beak) });
  for (const side of [-1, 1]) {
    const across = [-Math.sin(turn) * side, Math.cos(turn) * side];
    ellipsoid(m, { at: [head[0] + Math.cos(turn) * 0.02 + across[0] * 0.022, head[1] + 0.01, head[2] + Math.sin(turn) * 0.02 + across[1] * 0.022], radii: [0.008, 0.008, 0.008], segments: 5, rings: 2, paint: ({ lat }) => (lat < 0.5 ? colour(FORN.eye) : colour(FORN.pupil)) });
  }
  // the long tail: a bony rod with feathers either side of it, all the way down, as Archaeopteryx's was
  rod(m, { from: [-0.07, 0.1, 0], to: [-0.31, 0.115, 0], radii: [0.012, 0.004], sides: 4, paint: () => colour(FORN.tail) });
  const tail = [[-0.07, 0.016], [-0.15, 0.042], [-0.24, 0.05], [-0.3, 0.036], [-0.33, 0], [-0.3, -0.036], [-0.24, -0.05], [-0.15, -0.042], [-0.07, -0.016]];
  flat(m, tail.map(([x, z]) => [x, 0.108 + (x + 0.07) * -0.06, z]), [0, 1, 0], p => tone(FORN.tail, FORN.tailTip, smoothstep(0.025, 0.05, Math.abs(p.z))));
  flat(m, [...tail].reverse().map(([x, z]) => [x, 0.107 + (x + 0.07) * -0.06, z]), [0, -1, 0], () => colour(FORN.tail));
  // legs: a feathered thigh, a bare shin, three toes forward
  for (const side of [-1, 1]) {
    ellipsoid(m, { at: [-0.01, 0.075, 0.03 * side], radii: [0.03, 0.03, 0.02], segments: 6, rings: 3, smooth: true, paint: () => colour(FORN.back) });
    rod(m, { from: [-0.005, 0.055, 0.032 * side], to: [0.002, 0.008, 0.032 * side], radii: [0.006, 0.005], sides: 3, paint: () => colour(FORN.leg) });
    for (const out of [-0.012, 0.012]) rod(m, { from: [0.002, 0.008, 0.032 * side], to: [0.032, 0.0028, (0.032 + out) * side], radii: [0.004, 0.0028], sides: 3, paint: () => colour(FORN.leg) });
  }
  // the wings, spread (critters.js folds them at rest): broad, dark, pale at the tips, two clawed fingers at the wrist
  const [sx, sy, sz] = EARLY_BIRD.shoulder;
  const outline = [[0.03, 0], [0.05, 0.08], [0.035, 0.17], [-0.02, 0.24], [-0.08, 0.22], [-0.12, 0.12], [-0.08, 0]];
  for (const side of [-1, 1]) {
    m.tag(side);
    flat(m, outline.map(([x, out]) => [sx + x, sy, (sz + out) * side]), [0, 1, 0], p => tone(FORN.wing, FORN.tip, smoothstep(0.14, 0.24, Math.abs(p.z))));
    for (const k of [0, 1]) rod(m, { from: [sx + 0.045, sy, (sz + 0.08 + k * 0.02) * side], to: [sx + 0.07, sy - 0.006, (sz + 0.085 + k * 0.022) * side], radii: [0.003, 0.0012], sides: 3, paint: () => colour(FORN.beak) });
  }
  m.tag(0);
  return m;
}

// The fish: 0.3 m long, heavy-scaled like Lepidotes, olive on its back, gold on its flanks, pale beneath, with a forked tail. It
// lives under the water and jumps out of it; `flex` bends its tail to the side as it swims or jumps.
const FISH = { back: '#4c6652', flank: '#c8ad58', belly: '#ece2c2', fin: '#8c8a5a', eye: '#f2eedd', pupil: '#16160f' };

function buildFish({ flex = 0 } = {}) {
  const m = createMesher();
  const scales = ({ n, p }) => {
    const base = tone(FISH.flank, FISH.back, smoothstep(0.15, 0.75, n.y)).lerp(colour(FISH.belly), smoothstep(-0.2, -0.7, n.y));
    return Math.sin(p.x * 140) * Math.sin(p.y * 160) > 0.6 ? base.multiplyScalar(0.92) : base;
  };
  ellipsoid(m, { at: [0.03, 0.044, 0], radii: [0.044, 0.09, 0.03], pole: [1, 0, 0], segments: 12, rings: 5, smooth: true, paint: scales });
  const swing = 0.03 * flex;
  ellipsoid(m, { at: [-0.06, 0.044, swing * 0.4], radii: [0.034, 0.065, 0.022], pole: [1, 0, -0.35 * flex], segments: 10, rings: 4, smooth: true, paint: scales });
  for (const side of [-1, 1]) {
    ellipsoid(m, { at: [0.098, 0.054, 0.019 * side], radii: [0.008, 0.008, 0.008], pole: [0.3, 0, side], segments: 6, rings: 3, paint: ({ lat }) => (lat < 0.45 ? colour(FISH.pupil) : colour(FISH.eye)) });
    flat2(m, [[0.06, 0.03, 0.026 * side], [0.035, 0.016, 0.05 * side], [0.03, 0.026, 0.028 * side]], [0, 0, side], () => colour(FISH.fin));
  }
  // the forked tail and the fin on its back, both ways round so both sides show
  const t = [-0.12, 0.044, swing];
  flat2(m, [t, [-0.185, 0.095, swing * 2.2], [-0.165, 0.046, swing * 2], [-0.185, 0.0, swing * 2.2]], [0, 0, 1], () => colour(FISH.fin));
  flat2(m, [[0.02, 0.085, 0], [-0.03, 0.112, swing * 0.3], [-0.06, 0.08, swing * 0.4]], [0, 0, 1], () => colour(FISH.fin));
  return m;
}

// The water strider: a slender dark bug 0.07 m long standing on the water on long, thin legs (0.25 m across): the middle pair row,
// the hind pair steer, the short front pair hold. `row` sweeps the middle legs back.
const STRIDER = { back: '#2d2a24', belly: '#b9bbb6', leg: '#2d2a24', eye: '#6b5a3a' };

function buildWaterStrider({ row = 0 } = {}) {
  const m = createMesher();
  ellipsoid(m, { at: [-0.004, 0.028, 0], radii: [0.008, 0.036, 0.009], pole: [1, 0, 0], segments: 8, rings: 4, smooth: true, paint: ({ n }) => tone(STRIDER.belly, STRIDER.back, smoothstep(-0.3, 0.3, n.y)) });
  ellipsoid(m, { at: [0.038, 0.03, 0], radii: [0.009, 0.007, 0.007], segments: 6, rings: 3, smooth: true, paint: () => colour(STRIDER.back) });
  for (const side of [-1, 1]) {
    ellipsoid(m, { at: [0.042, 0.033, 0.006 * side], radii: [0.004, 0.004, 0.004], segments: 4, rings: 2, paint: () => colour(STRIDER.eye) });
    rod(m, { from: [0.045, 0.033, 0.003 * side], to: [0.075, 0.042, 0.016 * side], radii: [0.0018, 0.0012], sides: 3, paint: () => colour(STRIDER.leg) });
    // front legs, short and forward; middle legs, the long oars; hind legs, long and back
    rod(m, { from: [0.026, 0.024, 0.005 * side], to: [0.05, 0.02, 0.022 * side], radii: [0.0035, 0.003], sides: 3, paint: () => colour(STRIDER.leg) });
    rod(m, { from: [0.05, 0.02, 0.022 * side], to: [0.07, 0.006, 0.026 * side], radii: [0.003, 0.0024], sides: 3, paint: () => colour(STRIDER.leg) });
    const knee = mix([0.018, 0.052, 0.06 * side], [0.0, 0.05, 0.058 * side], row);
    const foot = mix([0.03, 0.0024, 0.125 * side], [-0.03, 0.0024, 0.115 * side], row);
    rod(m, { from: [0.006, 0.026, 0.007 * side], to: knee, radii: [0.0038, 0.003], sides: 3, paint: () => colour(STRIDER.leg) });
    rod(m, { from: knee, to: foot, radii: [0.003, 0.0024], sides: 3, paint: () => colour(STRIDER.leg) });
    const hindKnee = [-0.04, 0.046, 0.05 * side];
    rod(m, { from: [-0.016, 0.026, 0.007 * side], to: hindKnee, radii: [0.0036, 0.003], sides: 3, paint: () => colour(STRIDER.leg) });
    rod(m, { from: hindKnee, to: [-0.125, 0.0024, 0.085 * side], radii: [0.003, 0.0024], sides: 3, paint: () => colour(STRIDER.leg) });
  }
  return m;
}

// ---- assembling a model -----------------------------------------------------------------------------

/** The kinds a spot can be, with how to build each, the morph targets it moves by, and where a tap on it is aimed. */
const MODELS = {
  frog: { build: buildFrog, morphs: { leap: { leap: 1 } }, tap: [0, 0.06, 0], radius: 0.28 },
  snail: { build: buildSnail, morphs: { hide: { hide: 1 } }, tap: [0, 0.06, 0], radius: 0.26 },
  beetle: { build: buildBeetle, morphs: { kickA: { kickA: 1 }, kickB: { kickB: 1 } }, tap: [0, 0, 0], radius: 0.24, pivot: BEETLE_SIZE.feet[0] },
  bird: { build: buildBird, morphs: {}, tap: [0, 0.055, 0], radius: 0.28, wings: 2 },
  // the Fen's (chapter 2)
  dragonfly: { build: buildDragonfly, morphs: { hover: { hover: 1 } }, tap: [0, 0.03, 0], radius: 0.3, wings: 4 },
  waterBeetle: { build: buildWaterBeetle, morphs: { paddle: { paddle: 1 } }, tap: [0, 0.02, 0], radius: 0.28 },
  salamander: { build: buildSalamander, morphs: { walkA: { walkA: 1 }, walkB: { walkB: 1 }, curl: { curl: 1 } }, tap: [0.03, 0.02, 0], radius: 0.3 },
  turtle: { build: buildTurtle, morphs: { hide: { hide: 1 }, look: { look: 1 } }, tap: [0, 0.07, 0], radius: 0.35 },
  earlyBird: { build: buildEarlyBird, morphs: { look: { look: 1 } }, tap: [0, 0.12, 0], radius: 0.4, wings: 2 },
  fish: { build: buildFish, morphs: { flex: { flex: 1 } }, tap: [0, 0.04, 0], radius: 0.45 },
  waterStrider: { build: buildWaterStrider, morphs: { row: { row: 1 } }, tap: [0, 0.02, 0], radius: 0.3 },
};
export const KINDS = Object.keys(MODELS).filter(kind => kind !== 'bird');
/** The kinds whose wings the wing shader beats (their geometry has aWing): the bird and, among the spots, these. */
export const WINGED = Object.keys(MODELS).filter(kind => MODELS[kind].wings);

/**
 * The geometry of one kind ('frog', 'snail', 'beetle', the Fen's 'dragonfly', 'waterBeetle', 'salamander', 'turtle', 'earlyBird',
 * 'fish', 'waterStrider', or the 'bird'): its morph targets are named on the mesh
 * (mesh.morphTargetDictionary), `tap` is where in the model a tap is aimed and `radius` how wide (metres), `pivot` how high
 * the model's origin stands over the ground it rests on.
 */
export function createModel(kind) {
  const model = MODELS[kind];
  if (!model) throw new TypeError(`There is no critter model for "${kind}" (${Object.keys(MODELS).join(', ')})`);
  const base = model.build();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(base.position, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(base.normal, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(base.color, 3));
  if (model.wings) geometry.setAttribute('aWing', new THREE.Float32BufferAttribute(base.wing, 1));
  const morphs = Object.keys(model.morphs);
  if (morphs.length) {
    const built = morphs.map(name => model.build(model.morphs[name]));
    geometry.morphAttributes.position = built.map((b, i) => Object.assign(new THREE.Float32BufferAttribute(b.position, 3), { name: morphs[i] }));
    geometry.morphAttributes.normal = built.map((b, i) => Object.assign(new THREE.Float32BufferAttribute(b.normal, 3), { name: morphs[i] }));
  }
  geometry.computeBoundingSphere();
  return { geometry, morphs, tap: model.tap, radius: model.radius, pivot: model.pivot ?? 0, triangles: base.triangles, wings: model.wings ?? 0 };
}
