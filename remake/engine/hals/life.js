import * as THREE from 'three';
import { mergeGeometries } from '../../../dist/vendor/BufferGeometryUtils.js';
import { BOARD, SPECIAL_TILES } from './rules.js';
import { STONE } from './board.js';
import { THORSEDLA_MODEL, shelfFor } from './places.js';
import { createModel } from '../../world/critters/models.js';

// The board's small life (the owner's polish round, 2026-10-19: "meira af smádýrum í bakgrunn, drekaflugu, fiðrildi og fleira"):
// always on, cheap and never in the way of a number or the piece whose turn it is.
//   - Giant dragonflies (Meganeura) dart in straight bursts along the tiers, hover, and rest on a block's front edge.
//   - Butterflies in five colours flutter along the tiers and over the grass, and land on the flowers and on a Þórseðla's back.
//   - A flock of little pterosaurs passes far off now and then, and another nearer, in front of the trees.
//   - Beetles and little lizards scurry on the grass and the logs, frogs hop by the mud squares, a snail crawls along a log.
//   - Flowers on the logs and the shelves, motes drifting in slanting light, leaves falling now and then.
// Each kind is one instanced mesh, one draw call (eleven in all, about 11,000 triangles), and none of it casts a shadow. (One
// mesh holding every kind's model, each instance folding the others away, would save six calls but draw every model for every
// instance: four times the triangles, and the triangles are what the tablet's budget is short of.) Wings beat in the vertex
// shader (aWing on a wing's vertices, aFlap on each instance: how hard, its phase, the wings' rest angle), and a lizard's body
// wiggles as it runs; the rest is moved here each frame on the world's clock. `scatter()` sends everything up and away for a few
// seconds (a win); calm slows it all.
//
//   const life = createLife(hw)        hw: createHalsWorld's
//   life.focus = vector | null         the piece whose turn it is: nothing hovers or rests near it
//   life.avoid = [vector, ...]         the pieces: nothing rests on their squares
//   life.scatter(), life.calm, life.update(dt) (on the world's updaters already), life.dispose()

const V3 = THREE.Vector3;
const TAU = Math.PI * 2;
const UP = new V3(0, 1, 0);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = list => list[Math.floor(Math.random() * list.length)];
const smooth = t => t * t * (3 - 2 * t);
const clamp01 = t => Math.min(1, Math.max(0, t));
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

// ---- geometry: little meshes made of three's shapes, each vertex with a colour (rgba) and a wing tag -------------------------------

/** A part: geometry painted one colour (and alpha), tagged as body (0) or a wing (±1 front pair, ±2 back pair: the sign is its side). */
function part(geometry, colour, { alpha = 1, wing = 0, shade = 0 } = {}) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal'].includes(name)) g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  const c = new THREE.Color(colour);
  const col = new Float32Array(n * 4), tag = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = 1 - shade * Math.random();
    col.set([c.r * k, c.g * k, c.b * k, alpha], i * 4);
    tag[i] = wing;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  g.setAttribute('aWing', new THREE.BufferAttribute(tag, 1));
  return g;
}

/** A flat wing in the xz plane, its root at `root` and spreading toward ±z: a fan of triangles round the root. */
function wingShape(outline, side, root = [0, 0]) {
  const pos = [];
  for (let i = 1; i < outline.length - 1; i++) {
    for (const [x, z] of [outline[0], outline[i], outline[i + 1]]) pos.push(root[0] + x, 0, (root[1] + z) * side);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  return g;
}

const ellipsoid = (r, at, w = 6, h = 4) => new THREE.SphereGeometry(1, w, h).scale(...r).translate(...at);

/** A Meganeura, about 0.9 m across the wings, facing +x: a long banded abdomen, a green thorax, big eyes, four glassy wings. */
function dragonflyGeometry() {
  const parts = [];
  // the abdomen: banded segments tapering back
  for (let i = 0; i < 4; i++) {
    const x0 = -0.04 - i * 0.13, r = 0.03 - i * 0.004;
    const seg = new THREE.CylinderGeometry(r * 0.88, r, 0.13, 5, 1, true).rotateZ(Math.PI / 2).translate(x0 - 0.065, 0, 0);
    parts.push(part(seg, i % 2 ? '#1d5fa8' : '#3cc4e0'));
  }
  parts.push(part(ellipsoid([0.075, 0.05, 0.05], [0.03, 0.005, 0], 5, 3), '#46b85a'));
  parts.push(part(ellipsoid([0.04, 0.038, 0.045], [0.12, 0.01, 0], 5, 3), '#2f7d43'));
  for (const s of [-1, 1]) parts.push(part(ellipsoid([0.03, 0.032, 0.03], [0.135, 0.022, 0.03 * s], 4, 2), '#7a2f24'));
  const front = [[0, 0], [0.035, 0.08], [0.05, 0.25], [0.035, 0.42], [0.0, 0.46], [-0.03, 0.38], [-0.03, 0.1]];
  const back = [[0, 0], [0.025, 0.1], [0.03, 0.28], [0.01, 0.42], [-0.03, 0.44], [-0.07, 0.34], [-0.06, 0.08]];
  for (const s of [-1, 1]) {
    parts.push(part(wingShape(front, s, [0.06, 0.03]), '#eef8ff', { alpha: 0.62, wing: 1 * s }));
    parts.push(part(wingShape(back, s, [-0.01, 0.03]), '#eef8ff', { alpha: 0.62, wing: 2 * s }));
  }
  const g = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  return g.translate(0, 0.03, 0);
}

/** A butterfly 0.42 m across, white so each instance takes its own colour, with darker wing edges and a dark body. */
function butterflyGeometry() {
  const parts = [];
  const upper = [[0, 0], [0.07, 0.05], [0.11, 0.13], [0.06, 0.2], [-0.01, 0.17]];
  const lower = [[0, 0], [-0.01, 0.15], [-0.06, 0.15], [-0.1, 0.08], [-0.06, 0.02]];
  for (const s of [-1, 1]) {
    parts.push(part(wingShape(upper, s), '#ffffff', { wing: s }));
    parts.push(part(wingShape(lower, s), '#f2ecdf', { wing: s }));
    // the edge: a darker rim round the upper wing
    const rim = [[0.11, 0.13], [0.115, 0.15], [0.065, 0.215], [0.06, 0.2]];
    parts.push(part(wingShape(rim, s), '#5a3a28', { wing: s }));
  }
  parts.push(part(ellipsoid([0.07, 0.014, 0.014], [0, 0.004, 0], 5, 3), '#3a2a20'));
  const g = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  return g;
}

/** A small pterosaur seen from far, 1.6 m across: a body, a crested head and two long wings. */
function pterosaurGeometry() {
  const parts = [];
  parts.push(part(ellipsoid([0.28, 0.07, 0.07], [0, 0, 0], 5, 3), '#5b4d5e'));
  parts.push(part(new THREE.ConeGeometry(0.05, 0.36, 4).rotateZ(-Math.PI / 2).translate(0.42, 0.02, 0), '#6e5d6a'));
  parts.push(part(new THREE.ConeGeometry(0.04, 0.22, 4).rotateZ(Math.PI * 0.75).translate(0.2, 0.1, 0), '#8a5a52'));
  for (const s of [-1, 1]) parts.push(part(wingShape([[0.12, 0], [0.04, 0.5], [-0.05, 0.82], [-0.1, 0.42], [-0.18, 0]], s), '#6a5a68', { wing: s }));
  const g = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  return g;
}

/**
 * A beetle about 0.3 m long, facing +x, in the chapter's beetle's colours (world/critters/models.js) but light: a teal shell
 * with a gold spot and a seam, a dark head, six legs (about 90 triangles, where the chapter's has 400 for a close look).
 */
function beetleGeometry() {
  const parts = [];
  parts.push(part(ellipsoid([0.15, 0.085, 0.11], [0, 0.1, 0], 6, 3), '#2a9689'));
  parts.push(part(ellipsoid([0.1, 0.03, 0.075], [-0.01, 0.165, 0], 5, 2), '#5ec4b2'));
  parts.push(part(ellipsoid([0.025, 0.012, 0.025], [-0.05, 0.19, 0.03], 4, 2), '#f2c443'));
  parts.push(part(ellipsoid([0.055, 0.05, 0.06], [0.16, 0.085, 0], 4, 2), '#2f4747'));
  for (const s of [-1, 1]) {
    parts.push(part(ellipsoid([0.012, 0.012, 0.012], [0.2, 0.11, 0.03 * s], 3, 2), '#f6f1e4'));
    for (const fx of [0.08, 0, -0.08]) {
      const leg = new THREE.CylinderGeometry(0.008, 0.008, 0.13, 3, 1, true).rotateX(s * 1.0).translate(fx, 0.05, 0.12 * s);
      parts.push(part(leg, '#58412f'));
    }
  }
  const g = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  return g;
}

/** A little lizard, 0.6 m nose to tail, facing +x: green above, yellow under, a long tail (its body bends in the shader). */
function lizardGeometry() {
  const parts = [];
  parts.push(part(ellipsoid([0.14, 0.045, 0.055], [0.02, 0.05, 0], 8, 4), '#5aa04a'));
  parts.push(part(ellipsoid([0.07, 0.035, 0.045], [0.18, 0.06, 0], 6, 4), '#68b052'));
  parts.push(part(new THREE.ConeGeometry(0.035, 0.36, 5).rotateZ(Math.PI / 2).translate(-0.28, 0.045, 0), '#4f9142'));
  for (const s of [-1, 1]) {
    parts.push(part(ellipsoid([0.012, 0.012, 0.012], [0.215, 0.085, 0.03 * s], 4, 3), '#1f1a14'));
    for (const fx of [0.1, -0.07]) parts.push(part(new THREE.BoxGeometry(0.03, 0.02, 0.09).translate(fx, 0.02, 0.06 * s), '#4f9142'));
  }
  parts.push(part(ellipsoid([0.12, 0.02, 0.04], [0.04, 0.025, 0], 6, 3), '#e8d36a'));
  const g = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  return g;
}

/** A flower clump: three stems with round heads, white so each instance takes its colour, and two leaves. */
function flowerGeometry() {
  const parts = [];
  const heads = [[0, 0.32, 0], [0.09, 0.24, 0.05], [-0.08, 0.27, -0.04]];
  for (const [x, y, z] of heads) {
    parts.push(part(new THREE.CylinderGeometry(0.008, 0.01, y, 3, 1, true).translate(x * 0.5, y / 2, z * 0.5), '#5f8f3e'));
    parts.push(part(new THREE.CircleGeometry(0.07, 5).rotateX(-0.55).translate(x, y, z), '#ffffff'));
    parts.push(part(new THREE.CircleGeometry(0.026, 4).rotateX(-0.55).translate(x, y + 0.003, z + 0.006), '#f7c843'));
  }
  for (const s of [-1, 1]) parts.push(part(new THREE.CircleGeometry(0.06, 4).scale(1.6, 0.6, 1).rotateY(s * 0.8).translate(0.03 * s, 0.05, 0.02), '#6f9a3f'));
  const g = mergeGeometries(parts);
  parts.forEach(p => p.dispose());
  return g;
}

/** A leaf for falling: a flat pointed oval, white so each instance takes its colour. */
function leafGeometry() {
  return part(wingShape([[0, 0], [0.06, 0.05], [0.13, 0.03], [0.17, 0], [0.13, -0.03], [0.06, -0.05]].map(([x, z]) => [x - 0.08, z]), 1), '#ffffff');
}

/** One of the chapter's critters (world/critters/models.js) as a plain mesh for instancing: no morphs, rgba colours, no wings. */
function critterGeometry(kind, scale) {
  const { geometry, pivot } = createModel(kind);
  geometry.morphAttributes = {};
  geometry.translate(0, pivot, 0); // its feet on the ground
  const n = geometry.attributes.position.count;
  const rgb = geometry.attributes.color.array, col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) col.set([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2], 1], i * 4);
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geometry.setAttribute('aWing', new THREE.BufferAttribute(new Float32Array(n), 1));
  return geometry.scale(scale, scale, scale);
}

// ---- materials: lit and fogged as the scene is, with the wing beat (and a lizard's wiggle) in the vertex shader -------------------

/** The material of a shared mesh: for each kind (by aKind) its wings' beat (`rate`, radians a second, and `amp`) and its wiggle (`bend`). */
function lifeMaterial(name, { kinds: list = [{}], transparent = false } = {}) {
  // (one pass even when see-through: three draws a two-sided see-through mesh twice otherwise, which a dragonfly does not need)
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent, depthWrite: true, forceSinglePass: true });
  material.name = name;
  const v4 = key => new THREE.Vector4(...[0, 1, 2, 3].map(i => list[i]?.[key] ?? 0));
  const uniforms = { uTime: { value: 0 }, uRate: { value: v4('rate') }, uAmp: { value: v4('amp') }, uBend: { value: v4('bend') } };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aWing;
attribute float aKind; // which model of the mesh this vertex belongs to
attribute float aSel; // per instance: which model it is
attribute vec3 aFlap; // per instance: how hard the wings beat (0: still, at rest), the phase, the wings' rest angle
uniform float uTime;
uniform vec4 uRate;
uniform vec4 uAmp;
uniform vec4 uBend;
float ofKind( vec4 v ) { return aKind < 0.5 ? v.x : aKind < 1.5 ? v.y : aKind < 2.5 ? v.z : v.w; }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
if ( abs( aKind - aSel ) > 0.5 ) {
  transformed = vec3( 0.0 ); // another kind's model: folded away to a point, where it draws nothing
} else {
  if ( aWing != 0.0 ) {
    float pair = abs( aWing ) - 1.0;
    float ang = aFlap.z + aFlap.x * ofKind( uAmp ) * sin( uTime * ofKind( uRate ) + aFlap.y + pair * 1.9 );
    float zz = transformed.z;
    transformed.y += abs( zz ) * sin( ang );
    transformed.z = zz * cos( ang );
  }
  float bend = ofKind( uBend );
  if ( bend > 0.0 ) transformed.z += sin( transformed.x * 9.0 - uTime * 18.0 + aFlap.y ) * bend * aFlap.x * ( 0.4 + max( 0.0, -transformed.x ) * 3.0 );
}`);
  };
  material.customProgramCacheKey = () => 'hals-life';
  return { material, uniforms };
}

function makeInstanced(scene, geometry, material, count, name, renderOrder = 0) {
  geometry.setAttribute('aFlap', new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aSel', new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
  if (!geometry.attributes.aKind) geometry.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count), 1));
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; // they move: a bounding sphere of where they were would hide them
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = renderOrder;
  scene.add(mesh);
  return mesh;
}

// ---- motes and light: drifting specks and slanting shafts in front of the trees behind the board -------------------------------

const MOTE_VERT = /* glsl */`
attribute vec4 aMote;
uniform float uTime;
uniform float uScale;
uniform vec3 uSun;
varying float vAlpha;
#include <common>
#include <fog_pars_vertex>
void main() {
  float s = aMote.x * 6.2831853;
  vec3 p = position;
  p.x += sin( uTime * 0.21 + s ) * 0.9 + uTime * 0.12 * ( aMote.y - 0.3 );
  p.y += sin( uTime * 0.29 + s * 1.7 ) * 0.5 + fract( uTime * 0.01 + aMote.y ) * 1.5;
  p.z += cos( uTime * 0.17 + s * 1.3 ) * 0.7;
  vec4 mvPosition = viewMatrix * vec4( p, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  float d = max( -mvPosition.z, 0.1 );
  gl_PointSize = clamp( uScale * aMote.z / d, 1.5, 6.0 );
  vec3 viewDir = normalize( p - cameraPosition );
  float glint = pow( max( dot( viewDir, uSun ), 0.0 ), 4.0 );
  vAlpha = ( 0.35 + 1.2 * glint ) * ( 0.55 + 0.45 * sin( uTime * 1.3 + s * 3.0 ) ) * aMote.w;
  #include <fog_vertex>
}`;
const MOTE_FRAG = /* glsl */`
uniform vec3 uColour;
varying float vAlpha;
#include <common>
#include <fog_pars_fragment>
void main() {
  float r = length( gl_PointCoord - 0.5 ) * 2.0;
  gl_FragColor = vec4( uColour, smoothstep( 1.0, 0.1, r ) * vAlpha );
  #include <fog_fragment>
}`;
const SHAFT_VERT = /* glsl */`
attribute vec2 aShaft; // across 0..1, down 0..1
attribute float aSeed;
varying vec2 vUv;
varying float vSeed;
#include <common>
#include <fog_pars_vertex>
void main() {
  vUv = aShaft;
  vSeed = aSeed;
  vec4 mvPosition = viewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const SHAFT_FRAG = /* glsl */`
uniform vec3 uColour;
uniform float uTime;
uniform float uStrength;
varying vec2 vUv;
varying float vSeed;
#include <common>
#include <fog_pars_fragment>
void main() {
  float across = 1.0 - abs( vUv.x * 2.0 - 1.0 );
  float a = across * across * ( 3.0 - 2.0 * across );
  a *= smoothstep( 0.0, 0.25, vUv.y ) * smoothstep( 1.0, 0.55, vUv.y );
  a *= 0.65 + 0.35 * sin( uTime * 0.37 + vSeed * 17.0 );
  gl_FragColor = vec4( uColour, a * uStrength );
  #include <fog_fragment>
}`;

// ---- the life itself -------------------------------------------------------------------------------------------------------

const COUNTS = { dragonflies: 14, butterflies: 27, birds: 26, flowers: 44, beetles: 6, lizards: 5, frogs: 3, snails: 1, leaves: 22, motes: 320, shafts: 3 };
const GROUP = 3; // butterflies go about in little groups
const BUTTERFLY_COLOURS = ['#f39a3a', '#6fc0ee', '#f5dc4a', '#f08bb4', '#fffaf0', '#b48cf0'];
const FLOWER_COLOURS = ['#fff4f0', '#f7a6c4', '#ffd84a', '#c9a2f2', '#ff9a6a'];
const LEAF_COLOURS = ['#8fbf4e', '#c9c24a', '#e8a33a', '#d9772f', '#a8c95a'];

export function createLife(hw) {
  const { scene, board, camera } = hw;
  const thorsedlas = hw.thorsedlas?.list ?? [];
  const heightAt = (x, z) => hw.world.heightAt?.(x, z) ?? 0;
  const disposables = [];
  const own = (...items) => { disposables.push(...items); return items[0]; };
  let time = 0, calm = false, scatterT = -1;
  let focus = null;
  let avoid = [];
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new V3(), e4 = new THREE.Euler(0, 0, 0, 'YZX');
  const v1 = new V3(), v2 = new V3();
  const tierY = r => board.tierY(r), tierZ = r => board.tierZ(r);
  const nearFocus = (p, r) => focus && p.distanceTo(v1.copy(focus).add(UP)) < r;
  const speed = () => (calm ? 0.55 : 1);
  /** How much bigger to draw something far from the camera, so the whole-board view shows it too: 1 near, up to `most` far. */
  const seen = (p, near, most) => Math.min(most, Math.max(1, camera.position.distanceTo(p) / near));
  /** Somewhere along the board, most often near where the child looks (the piece whose turn it is), so the close view has life. */
  const alongX = () => (focus && Math.random() < 0.65 ? THREE.MathUtils.clamp(focus.x + rand(-8, 8), -23, 23) : rand(-23, 23));
  /** A tier, most often the one the piece whose turn it is stands on, or the one above it. */
  const nearTier = () => {
    if (!focus || Math.random() < 0.35) return Math.floor(rand(0, BOARD.rows - 0.01));
    const r = Math.round((focus.y - tierY(0)) / BOARD.rowHeight);
    return Math.max(0, Math.min(BOARD.rows - 1, r + (Math.random() < 0.6 ? 0 : 1)));
  };
  /** Where a flier may be about tier r: over its block tops and below the next tier's numbers, in front of the blocks. */
  function airOver(r, out = new V3()) {
    for (let tries = 0; tries < 6; tries++) {
      out.set(alongX(), tierY(r) + rand(2.3, 5.2), tierZ(r) + rand(0.6, 2.6));
      if (!nearFocus(out, 3)) break;
    }
    return out;
  }
  const setFlap = (mesh, i, amount, phase, rest) => mesh.geometry.attributes.aFlap.array.set([amount, phase, rest], i * 3);
  const setColour = (mesh, i, c) => mesh.setColorAt(i, c);
  function place(mesh, i, p, yaw, { pitch = 0, roll = 0, scale = 1, sx = scale, sy = scale, sz = scale } = {}) {
    e4.set(roll, -yaw, pitch, 'YZX');
    q4.setFromEuler(e4);
    mesh.setMatrixAt(i, m4.compose(p, q4, s4.set(sx, sy, sz)));
  }
  const looks = [];
  /** One kind's instanced mesh, with its wings' beat (`rate`, `amp`) or its wiggle (`bend`). */
  const kindMesh = (name, geometry, count, { transparent = false, order = 0, ...motion } = {}) => {
    const look = lifeMaterial(`Háls og hali: ${name}`, { transparent, kinds: [motion] });
    looks.push(look);
    return makeInstanced(scene, own(geometry), own(look.material), count, `Life: ${name}`, order);
  };

  // ---- dragonflies --------------------------------------------------------------------------------------------------------
  const dragonflies = kindMesh('dragonflies', dragonflyGeometry(), COUNTS.dragonflies, { transparent: true, order: 2, rate: 46, amp: 0.55 });
  // rest spots: a block's front edge, on top, beside its number
  const restSpots = [];
  for (let n = 2; n < BOARD.count; n++) {
    const p = board.square(n);
    for (const dx of [-0.5, 0.5]) restSpots.push({ n, p: new V3(p.x + dx, p.y + 0.02, p.z + STONE.depth / 2 - 0.16), taken: false });
  }
  const freeSpot = near => {
    const ok = restSpots.filter(s => !s.taken && s.p.distanceTo(near) < 9 && !avoid.some(a => Math.abs(a.x - s.p.x) < 3.2 && Math.abs(a.y - s.p.y) < 2)
      && !nearFocus(s.p, 4));
    return ok.length ? pick(ok) : null;
  };
  const START = board.square(0); // every game begins there: a few of each start near it
  const nearStart = (p, k) => { if (k) p.x = START.x + rand(-4, 10); return p; };
  const flies = Array.from({ length: COUNTS.dragonflies }, (_, i) => {
    const tier = i < 3 ? (i % 2) : i % BOARD.rows;
    const p = nearStart(airOver(tier), i < 3);
    return { mode: 'hover', t: 0, dur: rand(0.5, 2), tier, pos: p.clone(), from: p.clone(), to: p.clone(), anchor: p.clone(), yaw: rand(0, TAU), goalYaw: 0, spot: null, phase: rand(0, TAU), pitch: 0 };
  });
  function updateFly(f, i, dt) {
    f.t += dt * speed();
    if (scatterT >= 0 && f.mode !== 'flee') {
      if (f.spot) { f.spot.taken = false; f.spot = null; }
      f.mode = 'flee'; f.t = 0; f.dur = 2.2; f.from.copy(f.pos); f.to.copy(f.pos).add(v2.set(rand(-8, 8), rand(9, 14), rand(-2, 3)));
      f.yaw = Math.atan2(f.to.z - f.from.z, f.to.x - f.from.x);
    }
    if (f.mode === 'hover') {
      f.pos.copy(f.anchor).add(v2.set(Math.sin(time * 1.7 + f.phase) * 0.08, Math.sin(time * 2.3 + f.phase) * 0.1, Math.cos(time * 1.3 + f.phase) * 0.06));
      f.yaw = lerpAngle(f.yaw, f.goalYaw, Math.min(1, dt * 3));
      f.pitch *= Math.exp(-dt * 6);
      if (nearFocus(f.pos, 2.4)) f.t = f.dur; // the piece whose turn it is: move off
      if (f.t >= f.dur) {
        const roll = Math.random();
        f.t = 0;
        f.from.copy(f.pos);
        const spot = roll < 0.22 ? freeSpot(f.pos) : null;
        if (spot) {
          f.mode = 'land'; f.spot = spot; spot.taken = true; f.to.copy(spot.p);
        } else {
          if (roll > 0.88) f.tier = nearTier();
          f.mode = 'dart';
          airOver(f.tier, f.to);
          // a burst is a few metres at most, unless it changes tier
          v2.subVectors(f.to, f.from);
          if (v2.length() > 7 && roll <= 0.88) f.to.copy(f.from).addScaledVector(v2.normalize(), rand(3, 6));
        }
        f.dur = Math.max(0.22, f.from.distanceTo(f.to) / 9);
        f.yaw = Math.atan2(f.to.z - f.from.z, f.to.x - f.from.x);
      }
    } else if (f.mode === 'dart' || f.mode === 'land' || f.mode === 'flee') {
      const k = smooth(clamp01(f.t / f.dur));
      f.pos.lerpVectors(f.from, f.to, k);
      f.pitch = -0.25 * Math.sin(Math.PI * k);
      if (f.t >= f.dur) {
        f.t = 0;
        if (f.mode === 'land') { f.mode = 'rest'; f.dur = rand(3, 8); }
        else if (f.mode === 'flee') { f.mode = 'away'; f.dur = 4; }
        else { f.mode = 'hover'; f.anchor.copy(f.pos); f.dur = rand(0.5, 2.2); f.goalYaw = f.yaw + rand(-1.2, 1.2); }
      }
    } else if (f.mode === 'rest') {
      const disturbed = avoid.some(a => a.distanceTo(f.pos) < 1.8) || nearFocus(f.pos, 2.6);
      if (f.t >= f.dur || disturbed) {
        f.spot.taken = false; f.spot = null;
        f.mode = 'dart'; f.t = 0; f.from.copy(f.pos); airOver(f.tier, f.to);
        f.dur = Math.max(0.25, f.from.distanceTo(f.to) / 9);
        f.yaw = Math.atan2(f.to.z - f.from.z, f.to.x - f.from.x);
      }
    } else if (f.mode === 'away' && f.t >= f.dur && scatterT < 0) {
      // back from above, onto its tier
      f.mode = 'dart'; f.t = 0; f.from.copy(f.pos); airOver(f.tier, f.to); f.dur = 1.6;
      f.yaw = Math.atan2(f.to.z - f.from.z, f.to.x - f.from.x);
    }
    const resting = f.mode === 'rest';
    setFlap(dragonflies, i, resting ? 0 : 1, f.phase, resting ? 0.02 : 0.1);
    place(dragonflies, i, f.pos, f.yaw, { pitch: f.pitch, scale: 1.3 * seen(f.pos, 24, 2.4) });
  }

  // ---- butterflies --------------------------------------------------------------------------------------------------------
  const butterflies = kindMesh('butterflies', butterflyGeometry(), COUNTS.butterflies, { order: 2, rate: 17, amp: 0.65 });
  const colour = new THREE.Color();
  for (let i = 0; i < COUNTS.butterflies; i++) setColour(butterflies, i, colour.set(BUTTERFLY_COLOURS[i % BUTTERFLY_COLOURS.length]));

  // flowers: on the moss of the logs between the blocks, on the shelves' front edges and in the grass before the bottom tier
  const flowerSpots = [];
  for (let r = 1; r < BOARD.rows; r++) {
    for (let c = 0; c < 9; c++) {
      const n = r * BOARD.columns + 1 + Math.floor(rand(0, BOARD.columns - 1));
      const a = board.square(n), b = board.square(n + (r % 2 ? 1 : 1));
      if (Math.abs(a.y - b.y) > 0.1) continue;
      const x = (a.x + b.x) / 2;
      flowerSpots.push(new V3(x + rand(-0.12, 0.12), tierY(r) - STONE.height + 0.08, tierZ(r) + STONE.depth / 2 - 0.15));
    }
  }
  for (let c = 0; c < 18; c++) {
    const x = rand(-24, 24), z = tierZ(0) + STONE.depth / 2 + rand(0.6, 7);
    flowerSpots.push(new V3(x, heightAt(x, z) + 0.12, z));
  }
  const flowers = makeInstanced(scene, own(flowerGeometry()), own(lifeMaterial('Háls og hali: flowers').material), Math.min(COUNTS.flowers, flowerSpots.length), 'Life: flowers');
  flowers.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  flowerSpots.length = flowers.count;
  flowerSpots.forEach((p, i) => {
    place(flowers, i, p, rand(0, TAU), { scale: rand(1.1, 1.6) });
    flowers.setColorAt(i, colour.set(pick(FLOWER_COLOURS)));
  });
  flowers.instanceMatrix.needsUpdate = true;
  const sitSpots = () => [
    ...flowerSpots.map(p => ({ point: () => v2.copy(p).add(v1.set(0, 0.36, 0)), yaw: rand(0, TAU) })),
    ...thorsedlas.map(t => ({
      point: () => {
        const way = v1.set(1, 0, 0).applyQuaternion(t.root.quaternion).setY(0).normalize();
        return v2.copy(t.root.position).addScaledVector(way, -0.2 * t.k).add(v1.set(0, THORSEDLA_MODEL.back * t.k + 0.05, 0));
      },
      yaw: rand(0, TAU), back: true,
    })),
  ];
  const sits = sitSpots();
  const bands = () => (Math.random() < 0.25 ? -1 : nearTier());
  function wanderPoint(band, out = new V3()) {
    for (let tries = 0; tries < 6; tries++) {
      if (band < 0) { out.set(alongX(), 0, tierZ(0) + STONE.depth / 2 + rand(1, 7)); out.y = heightAt(out.x, out.z) + rand(0.5, 2.2); }
      else out.set(alongX(), tierY(band) + rand(1.6, 4.5), tierZ(band) + rand(0.5, 2.4));
      if (!nearFocus(out, 2.6)) break;
    }
    return out;
  }
  // little groups, one or two along every tier and over the grass: each group wanders to a goal and its members flutter round it
  const groups = Array.from({ length: Math.ceil(COUNTS.butterflies / GROUP) }, (_, g) => {
    const band = g === 0 ? -1 : g === 1 ? 0 : g < 2 + BOARD.rows ? g - 2 : bands();
    const goal = nearStart(wanderPoint(band), g < 2);
    return { band, goal, t: 0, dur: rand(5, 11) };
  });
  const bugs = Array.from({ length: COUNTS.butterflies }, (_, i) => {
    const group = groups[Math.floor(i / GROUP)];
    const p = group.goal.clone().add(new V3(rand(-1, 1), rand(-0.5, 0.5), rand(-0.6, 0.6)));
    return { mode: 'flutter', group, band: group.band, pos: p, vel: new V3(), goal: new V3(), t: 0, dur: rand(6, 14), sit: null, phase: rand(0, TAU), yaw: 0, from: new V3(), orbit: rand(0.6, 1.3) };
  });
  function updateGroups(dt) {
    for (const g of groups) {
      if ((g.t += dt) < g.dur) continue;
      g.t = 0; g.dur = rand(5, 11);
      if (Math.random() < 0.2) g.band = bands();
      // most often a few metres along its tier, sometimes further
      const from = g.goal.clone();
      wanderPoint(g.band, g.goal);
      if (g.band === -1 || Math.random() < 0.7) g.goal.x = THREE.MathUtils.clamp(from.x + rand(-7, 7), -23, 23);
    }
  }
  function updateBug(b, i, dt) {
    b.t += dt;
    const s = speed();
    if (scatterT >= 0 && b.mode !== 'flee') {
      if (b.sit) b.sit.taken = false;
      b.sit = null; b.mode = 'flee'; b.t = 0; b.goal.copy(b.pos).add(v2.set(rand(-5, 5), rand(8, 12), rand(-1, 2)));
    }
    if (b.mode === 'flutter') {
      // round its group's goal, each on a little loop of its own
      b.goal.copy(b.group.goal).add(v1.set(Math.sin(time * 0.9 + b.phase) * b.orbit, Math.sin(time * 1.3 + b.phase * 2) * 0.4, Math.cos(time * 0.7 + b.phase) * b.orbit * 0.6));
    }
    if (b.mode === 'flutter' || b.mode === 'flee' || b.mode === 'land') {
      const target = b.mode === 'land' ? b.sit.point() : b.goal;
      v2.subVectors(target, b.pos);
      const d = v2.length();
      const want = (b.mode === 'flee' ? 3.2 : b.mode === 'land' ? Math.min(1.6, 0.6 + d) : 1.5) * s;
      b.vel.lerp(v2.normalize().multiplyScalar(want), Math.min(1, dt * 1.8));
      b.pos.addScaledVector(b.vel, dt);
      if (b.mode !== 'land') b.pos.y += Math.sin(time * 6 + b.phase) * 0.6 * dt; // a butterfly's bobbing
      if (Math.hypot(b.vel.x, b.vel.z) > 0.05) b.yaw = lerpAngle(b.yaw, Math.atan2(b.vel.z, b.vel.x), Math.min(1, dt * 5));
      if (b.mode === 'land' && d < 0.08) { b.mode = 'sit'; b.t = 0; b.dur = rand(3, 7); b.yaw = b.sit.yaw; }
      else if (b.mode === 'flutter' && b.t > b.dur) {
        b.t = 0; b.dur = rand(5, 12);
        const free = sits.filter(x => !x.taken);
        if (Math.random() < 0.4 && free.length) {
          // a flower near it, or now and then a Þórseðla's back
          const near = free.filter(x => x.point().distanceTo(b.pos) < (x.back ? 12 : 7));
          if (near.length) { b.sit = pick(near); b.sit.taken = true; b.mode = 'land'; }
        }
      } else if (b.mode === 'flee' && b.t > 2.5) { b.mode = 'away'; b.t = 0; }
    } else if (b.mode === 'sit') {
      b.pos.copy(b.sit.point());
      if (b.t > b.dur || nearFocus(b.pos, 1.6) || avoid.some(a => a.distanceTo(b.pos) < 1.2)) {
        b.sit.taken = false; b.sit = null; b.mode = 'flutter'; b.t = 0; b.vel.set(0, 1, 0);
      }
    } else if (b.mode === 'away') {
      b.pos.y += Math.sin(time * 6 + b.phase) * 0.3 * dt;
      if (b.t > 3 && scatterT < 0) { b.mode = 'flutter'; b.t = 0; }
    }
    const sitting = b.mode === 'sit';
    setFlap(butterflies, i, sitting ? 0 : 1, b.phase, sitting ? 1.15 + 0.3 * Math.sin(time * 1.6 + b.phase) : 0.35);
    place(butterflies, i, b.pos, b.yaw, { scale: seen(b.pos, 16, 3) });
  }

  // ---- pterosaurs: a flock far off now and then, and a smaller one nearer, in front of the trees -------------------------------
  const birds = kindMesh('pterosaurs', pterosaurGeometry(), COUNTS.birds, { order: 1, rate: 7.5, amp: 0.7 });
  const flocks = [
    { kind: 'far', size: 11, wait: rand(2, 8), t: 0, dur: 26, flying: false, from: new V3(), to: new V3(), slots: [] },
    { kind: 'near', size: 7, wait: rand(6, 14), t: 0, dur: 14, flying: false, from: new V3(), to: new V3(), slots: [] },
    { kind: 'high', size: 8, wait: rand(4, 10), t: 0, dur: 18, flying: false, from: new V3(), to: new V3(), slots: [] },
  ];
  let slot = 0;
  for (const flock of flocks) for (let k = 0; k < flock.size; k++) flock.slots.push({ index: slot++, offset: new V3(), phase: rand(0, TAU), glide: rand(0, 3) });
  function launch(flock) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    if (flock.kind === 'far') {
      const y = rand(40, 52), z = rand(-90, -70);
      flock.from.set(-150 * dir, y, z); flock.to.set(150 * dir, y + rand(-4, 6), z + rand(-8, 8));
    } else if (flock.kind === 'near') {
      // in front of the trees behind the board, below the top tier: the close view sees them against the forest wall
      const y = rand(8, 16), z = rand(-30, -22);
      flock.from.set(-70 * dir, y, z); flock.to.set(70 * dir, y + rand(-2, 3), z);
    } else {
      // over the top tier, in the sky the whole board's view shows
      const y = rand(37, 42), z = rand(-22, -14);
      flock.from.set(-80 * dir, y, z); flock.to.set(80 * dir, y + rand(-2, 3), z);
    }
    flock.slots.forEach((s, k) => {
      const row = Math.ceil(k / 2), side = k % 2 ? 1 : -1;
      s.offset.set(-row * 2.6 * dir, row * 0.4 + rand(-0.3, 0.3), side * row * 2.2);
    });
    flock.t = 0;
    flock.flying = true;
    flock.wait = flock.kind === 'far' ? rand(10, 22) : flock.kind === 'near' ? rand(10, 20) : rand(8, 18);
  }
  function updateFlocks(dt) {
    birds.visible = flocks.some(flock => flock.flying); // (not drawn at all while none flies)
    for (const flock of flocks) {
      if (!flock.flying) {
        flock.wait -= dt;
        if (flock.wait <= 0) launch(flock);
      } else if ((flock.t += dt) >= flock.dur) flock.flying = false;
      const k = clamp01(flock.t / flock.dur);
      const yaw = Math.atan2(flock.to.z - flock.from.z, flock.to.x - flock.from.x);
      for (const s of flock.slots) {
        v1.lerpVectors(flock.from, flock.to, k).add(s.offset);
        v1.y += Math.sin(time * 0.8 + s.phase) * 0.4;
        const flap = Math.sin(time * 0.6 + s.glide) > -0.2 ? 1 : 0.08;
        setFlap(birds, s.index, flap, s.phase, 0.12);
        const size = flock.kind === 'far' ? 3 : flock.kind === 'near' ? 1.1 : 1.3 * seen(v1, 30, 2.2);
        place(birds, s.index, flock.flying ? v1 : v2.set(0, -500, 0), yaw, { scale: size, roll: Math.sin(time * 0.5 + s.phase) * 0.12 });
      }
    }
  }

  // ---- ground critters: beetles and lizards scurrying, frogs by the mud, a snail on a log --------------------------------------
  const beetleMesh = kindMesh('beetles', beetleGeometry(), COUNTS.beetles);
  const lizardMesh = kindMesh('lizards', lizardGeometry(), COUNTS.lizards, { bend: 0.035 });
  const frogMesh = kindMesh('frogs', critterGeometry('frog', 2.2), COUNTS.frogs);
  const snailMesh = kindMesh('snail', critterGeometry('snail', 3), COUNTS.snails);
  // where they go: the grass before the bottom tier, and the front edge of each log under the blocks (y, z, and an x range)
  const grass = { ground: true, x: [-24, 24], z: [tierZ(0) + STONE.depth / 2 + 1.4, tierZ(0) + STONE.depth / 2 + 5] };
  const logs = [];
  for (let r = 1; r < BOARD.rows; r++) logs.push({ ground: false, y: tierY(r) - STONE.height + 0.02, z: tierZ(r) + STONE.depth / 2 - 0.1, x: [-22, 22] });
  // and the mossy tops of the Þórseðlas' shelves, along their front edges
  const shelves = (hw.places ?? []).filter(p => p.tier > 0).map(shelfFor).filter(sh => !sh.angle)
    .map(sh => ({ ground: false, y: tierY(sh.tier) - 0.3 - (sh.drop ?? 0) + 0.02, z: sh.z1 - 0.35, x: [sh.x0 + 0.4, sh.x1 - 0.4] }));
  const walkPoint = (track, out = new V3(), near = null) => {
    const x = near ? THREE.MathUtils.clamp(near.x + rand(-4, 4), track.x[0], track.x[1]) : rand(track.x[0], track.x[1]);
    if (track.ground) { const z = rand(track.z[0], track.z[1]); return out.set(x, heightAt(x, z), z); }
    return out.set(x, track.y, track.z);
  };
  const walkers = [];
  const addWalker = (mesh, index, track, { pace, stop, hop = 0, wiggle = false, scale = 1 }) => {
    const p = walkPoint(track);
    walkers.push({ mesh, index, track, pace, stop, hop, wiggle, scale, pos: p.clone(), goal: p.clone(), wait: rand(0, stop[1]), yaw: rand(0, TAU), phase: rand(0, TAU), jump: -1 });
  };
  const beetleTracks = [grass, grass, grass, logs[0], logs[1], logs[2], logs[3], shelves[0] ?? grass];
  beetleTracks.slice(0, COUNTS.beetles).forEach((track, k) => addWalker(beetleMesh, k, track, { pace: track === grass ? 0.6 : 0.45, stop: [1, 5] }));
  const lizardTracks = [grass, logs[0], logs[1], logs[2], logs[3], shelves[1] ?? grass];
  lizardTracks.slice(0, COUNTS.lizards).forEach((track, k) => addWalker(lizardMesh, k, track, { pace: track === grass ? 2.6 : 2.2, stop: [1.5, 6], wiggle: true }));
  [logs[0], logs[2]].slice(0, COUNTS.snails).forEach((track, k) => addWalker(snailMesh, k, track, { pace: 0.06, stop: [6, 12] }));
  // the frogs: by the mud squares, hopping along the backs of the blocks round them
  const muds = SPECIAL_TILES.filter(e => e.type === 'mud').map(e => e.from).slice(0, COUNTS.frogs);
  muds.forEach((n, k) => {
    const a = board.square(n - 1), b = board.square(n + 1);
    const track = { ground: false, y: a.y + 0.01, z: a.z - STONE.depth / 2 + 0.3, x: [Math.min(a.x, b.x), Math.max(a.x, b.x)] };
    addWalker(frogMesh, k, track, { pace: 1.6, stop: [2.5, 7], hop: 0.5 });
  });
  function updateWalker(w, dt) {
    const s = speed();
    let lift = 0, moving = false, squash = 1;
    if (scatterT >= 0 && w.jump < 0) w.jump = rand(0, 0.4);
    if (w.jump >= 0) {
      // the win: everyone jumps for joy, a few times
      w.jump += dt;
      const j = (w.jump * 2.2) % 1;
      lift = Math.sin(Math.PI * j) * (w.hop ? 1.2 : 0.5);
      if (w.jump > 3.2 && scatterT < 0) w.jump = -1;
    } else if (w.wait > 0) {
      w.wait -= dt * s;
      if (w.wait <= 0) { walkPoint(w.track, w.goal, w.pos); w.yaw = Math.atan2(w.goal.z - w.pos.z, w.goal.x - w.pos.x); }
    } else {
      v2.subVectors(w.goal, w.pos);
      const d = v2.length();
      const step = w.pace * s * dt * (w.hop ? 1 : 1);
      if (d <= step) {
        w.pos.copy(w.goal); w.wait = rand(w.stop[0], w.stop[1]);
      } else {
        w.pos.addScaledVector(v2.normalize(), step);
        moving = true;
        if (w.track.ground) w.pos.y = heightAt(w.pos.x, w.pos.z);
        if (w.hop) { // a frog goes in hops: an arc every 0.55 m
          const u = (w.phase += step / 0.55) % 1;
          lift = Math.sin(Math.PI * u) * w.hop;
          squash = 1 + 0.25 * Math.sin(Math.PI * u);
        }
      }
    }
    if (w.wiggle) setFlap(w.mesh, w.index, moving ? 1 : 0, w.phase, 0);
    v1.copy(w.pos); v1.y += lift + (w.track.ground ? 0.01 : 0);
    const bob = moving && !w.hop && !w.wiggle ? Math.abs(Math.sin(time * 22 + w.phase)) * 0.01 : 0;
    v1.y += bob;
    const k = w.scale * seen(w.pos, 22, 1.8);
    place(w.mesh, w.index, v1, w.yaw, { scale: k, sy: k * squash, sx: k / Math.sqrt(squash), sz: k / Math.sqrt(squash) });
  }

  // ---- leaves falling now and then ----------------------------------------------------------------------------------------
  const leafMesh = kindMesh('falling leaves', leafGeometry(), COUNTS.leaves, { order: 1 });
  const leaves = Array.from({ length: COUNTS.leaves }, (_, i) => {
    setColour(leafMesh, i, colour.set(pick(LEAF_COLOURS)));
    return { pos: new V3(0, -500, 0), wait: rand(0, 10), spin: rand(1.5, 3.5), phase: rand(0, TAU), fall: rand(0.7, 1.1), sway: rand(0.5, 1.2), floor: 0, x0: 0 };
  });
  function updateLeaf(l, i, dt) {
    if (l.wait > 0) {
      l.wait -= dt;
      if (l.wait <= 0) {
        l.x0 = rand(-28, 28);
        const z = rand(-12, 3);
        l.pos.set(l.x0, rand(22, 34), z);
        l.floor = heightAt(l.x0, z);
      } else { place(leafMesh, i, v1.set(0, -500, 0), 0); return; }
    }
    l.phase += dt;
    l.pos.y -= l.fall * speed() * dt;
    l.pos.x = l.x0 + Math.sin(l.phase * l.sway) * 1.4;
    l.pos.z += Math.cos(l.phase * 0.7) * 0.2 * dt;
    if (l.pos.y < l.floor) { l.wait = rand(2, 10); place(leafMesh, i, v1.set(0, -500, 0), 0); return; }
    place(leafMesh, i, l.pos, l.phase * l.spin, { roll: Math.sin(l.phase * l.spin * 1.3) * 1.1, pitch: Math.cos(l.phase * l.sway) * 0.6, scale: 2.2 * seen(l.pos, 26, 2) });
  }

  // ---- motes in the air round the board, and slanting light in front of the trees ----------------------------------------------
  const sunDir = (hw.lighting?.direction ?? new V3(0.4, 0.8, 0.3)).clone().normalize();
  const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
  const moteUniforms = { ...fogUniforms(), uTime: { value: 0 }, uScale: { value: 800 }, uSun: { value: sunDir.clone() }, uColour: { value: new THREE.Color('#fff2c8') } };
  {
    const pos = [], mote = [];
    for (let i = 0; i < COUNTS.motes; i++) {
      const x = rand(-30, 30), z = rand(-16, 6);
      pos.push(x, heightAt(x, z) + rand(0.3, 32), z);
      mote.push(Math.random(), Math.random(), rand(0.05, 0.1), rand(0.5, 1)); // pollen and motes, big enough to glint from far
    }
    const g = own(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aMote', new THREE.Float32BufferAttribute(mote, 4));
    const material = own(new THREE.ShaderMaterial({
      vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG, uniforms: moteUniforms,
      fog: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    material.name = 'Háls og hali: motes';
    const points = new THREE.Points(g, material);
    points.name = 'Motes round the board';
    points.frustumCulled = false;
    points.renderOrder = 11;
    scene.add(points);
  }
  const shaftUniforms = { ...fogUniforms(), uTime: { value: 0 }, uColour: { value: new THREE.Color('#fff0c4') }, uStrength: { value: 0.22 } };
  {
    // a few wide shafts slanting down from the canopy behind the board, in front of the forest wall (the close views see it)
    const down = sunDir.clone().negate(); // the way the light goes
    if (down.y > -0.3) down.y = -0.3;
    down.normalize();
    const pos = [], shaft = [], seed = [], idx = [];
    const feet = [-24, -6, 14].slice(0, COUNTS.shafts); // one by the start, where every game begins
    feet.forEach((x0, i) => {
      const width = rand(3, 4.5), z = rand(-17, -13);
      const bottom = new V3(x0 + rand(-1.5, 1.5), 0, z);
      bottom.y = heightAt(bottom.x, bottom.z);
      const top = bottom.clone().addScaledVector(down, -(34 - bottom.y) / Math.abs(down.y));
      const side = new V3(1, 0, 0).multiplyScalar(width / 2);
      const base = pos.length / 3;
      for (const [p, u, v] of [[top.clone().sub(side.clone().multiplyScalar(0.7)), 0, 1], [top.clone().add(side.clone().multiplyScalar(0.7)), 1, 1], [bottom.clone().add(side), 1, 0], [bottom.clone().sub(side), 0, 0]]) {
        pos.push(p.x, p.y, p.z); shaft.push(u, v); seed.push(i * 0.37);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    const g = own(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aShaft', new THREE.Float32BufferAttribute(shaft, 2));
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
    g.setIndex(idx);
    const material = own(new THREE.ShaderMaterial({
      vertexShader: SHAFT_VERT, fragmentShader: SHAFT_FRAG, uniforms: shaftUniforms,
      fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, // (no fog: cheaper over the big quads)
    }));
    material.name = 'Háls og hali: light shafts';
    const mesh = new THREE.Mesh(g, material);
    mesh.name = 'Light shafts behind the board';
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    scene.add(mesh);
  }

  const meshes = [dragonflies, butterflies, birds, beetleMesh, lizardMesh, frogMesh, snailMesh, leafMesh];
  const size = new THREE.Vector2();
  function update(dt) {
    time += dt;
    if (scatterT >= 0 && (scatterT += dt) > 5) scatterT = -1;
    for (const look of looks) look.uniforms.uTime.value = time;
    moteUniforms.uTime.value = time;
    shaftUniforms.uTime.value = time;
    hw.world.renderer?.getDrawingBufferSize?.(size);
    if (size.y) moteUniforms.uScale.value = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    flies.forEach((f, i) => updateFly(f, i, dt));
    updateGroups(dt);
    bugs.forEach((b, i) => updateBug(b, i, dt));
    updateFlocks(dt);
    for (const w of walkers) updateWalker(w, dt);
    leaves.forEach((l, i) => updateLeaf(l, i, dt));
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.aFlap.needsUpdate = true;
    }
  }
  const stopUpdating = hw.addUpdater(update);

  return {
    get focus() { return focus; },
    set focus(value) { focus = value ? (focus ?? new V3()).copy(value) : null; },
    get avoid() { return avoid; },
    set avoid(list) { avoid = list ?? []; },
    get calm() { return calm; },
    set calm(value) { calm = Boolean(value); },
    /** Everyone up and away for a few seconds (a win): the fliers rise off, the ground critters jump for joy. */
    scatter() {
      if (calm) return;
      scatterT = 0;
      const near = flocks.find(f => f.kind === 'high');
      if (near && !near.flying) launch(near); // and a flock of pterosaurs goes over
    },
    update,
    dispose() {
      stopUpdating?.();
      for (const mesh of [...meshes, flowers]) { mesh.removeFromParent(); mesh.dispose(); }
      scene.children.filter(o => o.name === 'Motes round the board' || o.name === 'Light shafts behind the board').forEach(o => o.removeFromParent());
      for (const d of disposables) d.dispose?.();
    },
  };
}
